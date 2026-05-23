import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allocateNextNumber } from "@/lib/numbering";
import { audit } from "@/lib/audit";
import { fireWebhook } from "@/lib/webhook";
import { sendEmail, renderIncomingLetterEmail } from "@/lib/email";
import { renameFile as renameGdriveFile } from "@/lib/gdrive";
import { buildArchiveFilename } from "@/lib/archive-filename";
import type { ArchiveListItem } from "@/lib/types";
import { runAfter } from "@/lib/after";
import { serialiseArchive, serialiseArchiveList } from "./serialise";

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

function appUrl(req: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
}

// -------------------------------------------------------------------------
// GET /api/archives
// Filters: unitId, letterTypeId, direction, status, q (subject/sender/number),
//          dateFrom, dateTo, year, includeDeleted (SUPER_ADMIN only)
// -------------------------------------------------------------------------

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId");
  const letterTypeId = url.searchParams.get("letterTypeId");
  const direction = url.searchParams.get("direction");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();
  const year = url.searchParams.get("year");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const includeDeleted = url.searchParams.get("includeDeleted") === "true";

  const where: Prisma.ArchiveWhereInput = {};
  if (!(includeDeleted && session.role === "SUPER_ADMIN")) {
    where.deletedAt = null;
  }
  if (session.role !== "SUPER_ADMIN") {
    // Non-superadmin users are strictly scoped to their own unit; the unitId
    // query param is ignored to prevent IDOR. If they have no unit assigned
    // (session.unitId === null), they see no archives — fail closed rather
    // than open.
    where.unitId = session.unitId ?? "__no_unit__";
  } else if (unitId) {
    where.unitId = unitId;
  }
  if (letterTypeId) where.letterTypeId = letterTypeId;
  if (direction === "OUTGOING" || direction === "INCOMING") where.direction = direction;
  // Whitelist: silently ignore unknown status values rather than failing the
  // request (forward-compatible with future enum additions in older clients).
  const ALLOWED_STATUSES = new Set([
    "DRAFT",
    "PENDING",
    "PENDING_PROOF",
    "APPROVED",
    "ISSUED",
    "OVERDUE",
    "VOID",
  ]);
  if (status && ALLOWED_STATUSES.has(status)) {
    where.status = status as Prisma.ArchiveWhereInput["status"];
  }

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    where.AND = tokens.map((t) => ({
      OR: [
        { number: { contains: t, mode: "insensitive" } },
        { subject: { contains: t, mode: "insensitive" } },
        { recipient: { contains: t, mode: "insensitive" } },
        { externalSender: { contains: t, mode: "insensitive" } },
      ],
    }));
  }

  // Explicit date range (dateFrom/dateTo) takes precedence over the year
  // dropdown; mixing the two silently produced incorrect bounds.
  const dateFilter: Prisma.DateTimeFilter = {};
  const hasExplicitRange = Boolean(dateFrom || dateTo);
  if (hasExplicitRange) {
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!Number.isNaN(d.getTime())) dateFilter.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!Number.isNaN(d.getTime())) {
        // treat dateTo as inclusive end-of-day
        d.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = d;
      }
    }
  } else if (year) {
    const y = Number(year);
    if (!Number.isNaN(y)) {
      dateFilter.gte = new Date(Date.UTC(y, 0, 1));
      dateFilter.lt = new Date(Date.UTC(y + 1, 0, 1));
    }
  }
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

  // Pagination: ?page=1&pageSize=50 (default 50, max 200)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize")) || 50));
  const skip = (page - 1) * pageSize;

  const [archives, total] = await Promise.all([
    prisma.archive.findMany({
      where,
      orderBy: { date: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.archive.count({ where }),
  ]);

  const lightweight: ArchiveListItem[] = archives.map(serialiseArchiveList);
  return NextResponse.json({
    archives: lightweight,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

// -------------------------------------------------------------------------
// POST /api/archives
// -------------------------------------------------------------------------

const MAX_DATA_URL_LEN = 4 * 1024 * 1024; // ~3MB binary (base64 adds ~33%)
const DATA_URL_PATTERN = /^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/i;
const BLOB_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const GDRIVE_URL_PATTERN = /^https:\/\/(drive|docs)\.google\.com\//i;
const FILE_URL_PATTERN = new RegExp(
  `(${BLOB_URL_PATTERN.source})|(${GDRIVE_URL_PATTERN.source})`,
  "i"
);

const createSchema = z
  .object({
    subject: z.string().min(3, "Perihal minimal 3 karakter"),
    recipient: z.string().min(2, "Tujuan wajib diisi"),
    externalSender: z.string().max(200).nullable().optional(),
    unitId: z.string().min(1),
    letterTypeId: z.string().min(1),
    direction: z.enum(["OUTGOING", "INCOMING"]).default("OUTGOING"),
    date: z.string().optional(),
    fileName: z.string().nullable().optional(),
    // Either an uploaded Blob URL (preferred) OR legacy inline base64.
    fileUrl: z
      .string()
      .regex(FILE_URL_PATTERN, {
        message: "fileUrl harus dari Google Drive atau Vercel Blob",
      })
      .nullable()
      .optional(),
    blobPathname: z.string().max(500).nullable().optional(),
    gdriveFileId: z.string().max(120).nullable().optional(),
    fileDataUrl: z
      .string()
      .regex(DATA_URL_PATTERN, {
        message: "Hanya gambar (PNG/JPG/WEBP/GIF) atau PDF yang diperbolehkan",
      })
      .max(MAX_DATA_URL_LEN, "Ukuran file terlalu besar (maks. 3MB)")
      .nullable()
      .optional(),
    manualNumber: z.string().nullable().optional(),
    // Sisipan / manual-override flag. When true, the admin is intentionally
    // bypassing the auto-allocator (e.g. issuing a backdated number that
    // doesn't advance the counter). Distinct from INCOMING which uses
    // manualNumber to record the external sender's existing number.
    isInsert: z.boolean().optional(),
    insertReason: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    // INCOMING letters must carry a sender and must have a manual number.
    if (val.direction === "INCOMING") {
      if (!val.externalSender || val.externalSender.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pengirim surat masuk wajib diisi",
          path: ["externalSender"],
        });
      }
      if (!val.manualNumber || val.manualNumber.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nomor surat masuk wajib diisi (salin dari surat aslinya)",
          path: ["manualNumber"],
        });
      }
    }
    // Sisipan (OUTGOING with isInsert=true) requires a documented reason so
    // every manual-override has an audit trail. The reason has to be at
    // least 5 characters of trimmed text.
    if (val.direction !== "INCOMING" && val.isInsert) {
      if (!val.manualNumber || val.manualNumber.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Nomor sisipan wajib diisi",
          path: ["manualNumber"],
        });
      }
      if (!val.insertReason || val.insertReason.trim().length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Alasan sisipan wajib diisi (minimal 5 karakter)",
          path: ["insertReason"],
        });
      }
    }
  });

export async function POST(req: Request) {
  try {
    return await postImpl(req);
  } catch (err) {
    // Without this catch any unhandled exception (Prisma error, missing env,
    // etc.) bubbles up to Next.js and the runtime returns an HTML error page.
    // The browser's `await res.json()` then throws, which the form surfaces
    // as the generic "Terjadi kesalahan jaringan" — completely unhelpful for
    // debugging. Log server-side and return a JSON 500 the client can read.
    //
    // Security: log the full error message to Vercel logs only. Do NOT echo
    // err.message to the response body — Prisma errors leak schema details
    // (constraint names, model names, table names), and connection errors
    // can leak DB host:port. Return a generic message and rely on superadmin
    // checking server logs for diagnosis.
    // eslint-disable-next-line no-console
    console.error("[/api/archives POST] unhandled error", err);
    return NextResponse.json(
      {
        error:
          "Kesalahan internal pada server. Silakan coba lagi atau hubungi superadmin.",
      },
      { status: 500 }
    );
  }
}

async function postImpl(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  if (session.role !== "SUPER_ADMIN") {
    if (!session.unitId || session.unitId !== input.unitId) {
      return NextResponse.json(
        { error: "Anda hanya dapat mengarsipkan surat untuk unit Anda sendiri" },
        { status: 403 }
      );
    }
  }

  const [unit, letterType] = await Promise.all([
    prisma.unit.findUnique({ where: { id: input.unitId } }),
    prisma.letterType.findUnique({
      where: { id: input.letterTypeId },
      include: { units: { where: { unitId: input.unitId }, select: { unitId: true } } },
    }),
  ]);
  if (!unit || unit.deletedAt) {
    return NextResponse.json({ error: "Unit tidak ditemukan atau telah dinonaktifkan" }, { status: 400 });
  }
  if (!letterType || letterType.deletedAt) {
    return NextResponse.json({ error: "Jenis surat tidak ditemukan atau telah dinonaktifkan" }, { status: 400 });
  }
  // TechSpec 3.1: a UNIT_SPECIFIC letter type is only usable by units in its
  // allowlist. The frontend filters the dropdown but defence-in-depth requires
  // the API to reject the combination too.
  if (letterType.scope === "UNIT_SPECIFIC" && letterType.units.length === 0) {
    return NextResponse.json(
      {
        error:
          "Jenis surat ini tidak diizinkan untuk unit tersebut. Mintakan akses ke superadmin terlebih dahulu.",
      },
      { status: 403 }
    );
  }

  // Storage identifiers (blobPathname, gdriveFileId) are received from the
  // client and used later for storage cleanup on archive delete. Without
  // ownership validation, a hostile client could attach another archive's
  // identifier and trigger cross-archive file deletion when they later soft-
  // delete their own archive (IDOR). Defences:
  //   1. blobPathname must live under the caller's own user prefix (matches
  //      the contract enforced by /api/blob/upload onBeforeGenerateToken).
  //   2. Both identifiers must not already be linked to another archive.
  if (input.blobPathname) {
    const expectedPrefix = `persuratan/${session.userId}/`;
    if (!input.blobPathname.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Path file Blob tidak diizinkan" },
        { status: 403 }
      );
    }
    const dup = await prisma.archive.findFirst({
      where: { blobPathname: input.blobPathname, deletedAt: null },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "File Blob ini sudah terkait arsip lain" },
        { status: 409 }
      );
    }
  }
  if (input.gdriveFileId) {
    const dup = await prisma.archive.findFirst({
      where: { gdriveFileId: input.gdriveFileId, deletedAt: null },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "File Drive ini sudah terkait arsip lain" },
        { status: 409 }
      );
    }
  }

  const isManualArchive = Boolean(input.manualNumber && input.manualNumber.trim().length > 0);
  // OUTGOING + manual number + caller flagged isInsert = audit row as a
  // sisipan. INCOMING also uses manualNumber but isn't a sisipan, so we
  // only set the flag for OUTGOING.
  const isInsertArchive =
    input.direction !== "INCOMING" && isManualArchive && Boolean(input.isInsert);
  const hasFile = Boolean(input.fileUrl || input.fileDataUrl);

  // Status is always derived server-side.
  //   USER            -> PENDING (always requires admin approval)
  //   Admin, w/ file  -> ISSUED (proof attached)
  //   Admin, no file  -> PENDING_PROOF
  const status: Prisma.ArchiveCreateInput["status"] =
    session.role === "USER" ? "PENDING" : hasFile ? "ISSUED" : "PENDING_PROOF";

  const archive = await prisma.$transaction(async (tx) => {
    let number: string;
    let sequenceNumber = 0;
    if (isManualArchive) {
      number = input.manualNumber!.trim();
    } else {
      const allocated = await allocateNextNumber(input.unitId, input.letterTypeId, tx);
      number = allocated.number;
      sequenceNumber = allocated.sequenceNumber;
    }

    const created = await tx.archive.create({
      data: {
        number,
        date: input.date ? new Date(input.date) : new Date(),
        subject: input.subject,
        recipient: input.recipient,
        externalSender: input.externalSender ?? null,
        direction: input.direction,
        status,
        unitId: unit.id,
        unitCode: unit.code,
        letterTypeId: letterType.id,
        letterTypeCode: letterType.code,
        sequenceNumber,
        fileName: input.fileName ?? null,
        fileUrl: input.fileUrl ?? null,
        blobPathname: input.blobPathname ?? null,
        gdriveFileId: input.gdriveFileId ?? null,
        // DEPRECATED: inline base64 storage inflates DB size. This fallback
        // is kept for backward compatibility but should be removed once all
        // clients use Blob/GDrive uploads. See issue D5.
        fileDataUrl: (() => {
          if (input.fileUrl) return null;
          if (input.fileDataUrl) {
            console.warn(
              "[DEPRECATED] Archive created with inline base64 fileDataUrl. " +
              "Migrate to Blob/GDrive upload. archiveId will be logged post-create."
            );
            return input.fileDataUrl;
          }
          return null;
        })(),
        createdById: session.userId,
        isInsert: isInsertArchive,
        insertReason: isInsertArchive ? input.insertReason!.trim() : null,
      },
    });

    await audit(
      {
        action: "CREATE",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "Archive",
        targetId: created.id,
        archiveId: created.id,
        metadata: {
          number: created.number,
          direction: created.direction,
          status: created.status,
          unitCode: created.unitCode,
          letterTypeCode: created.letterTypeCode,
          isInsert: created.isInsert,
          insertReason: created.insertReason,
        },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );

    return created;
  });

  // Post-commit side effects (email + webhook + Drive rename). Use
  // waitUntil() so the Vercel serverless runtime keeps the function alive
  // until they settle — a fire-and-forget IIFE without it gets terminated
  // when the response is flushed and the work silently disappears.
  runAfter("archive.created", async () => {
    if (archive.direction === "INCOMING") {
      const admins = await prisma.user.findMany({
        where: { unitId: archive.unitId, role: "ADMIN_UNIT", deletedAt: null },
      });
      const dateStr = new Date(archive.date).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      for (const a of admins) {
        const msg = renderIncomingLetterEmail({
          recipientName: a.name,
          number: archive.number,
          subject: archive.subject,
          sender: archive.externalSender ?? archive.recipient,
          date: dateStr,
          appUrl: appUrl(req),
          archiveId: archive.id,
        });
        await sendEmail({
          to: a.email,
          subject: `Surat masuk baru · ${archive.number}`,
          html: msg.html,
          text: msg.text,
          tags: [{ name: "event", value: "incoming" }],
        });
      }
    }
    await fireWebhook({
      event: "archive.created",
      archiveId: archive.id,
      number: archive.number,
      subject: archive.subject,
      direction: archive.direction,
      status: archive.status,
      unitCode: archive.unitCode,
      letterTypeCode: archive.letterTypeCode,
      externalSender: archive.externalSender,
      recipient: archive.recipient,
      date: archive.date.toISOString(),
      createdAt: archive.createdAt.toISOString(),
    });
    // Auto-rename the Drive file to `{nomor}_{subject_slug}.{ext}` so
    // operators browsing the Shared Drive directly can find letters by
    // filename. Best-effort: failure does not affect the archive record.
    if (archive.gdriveFileId) {
      const newName = buildArchiveFilename({
        number: archive.number,
        subject: archive.subject,
        originalFilename: archive.fileName,
      });
      const ok = await renameGdriveFile(archive.gdriveFileId, newName);
      if (ok) {
        await prisma.archive.update({
          where: { id: archive.id },
          data: { fileName: newName },
        });
      }
    }
  });

  return NextResponse.json({ archive: serialiseArchive(archive) }, { status: 201 });
}
