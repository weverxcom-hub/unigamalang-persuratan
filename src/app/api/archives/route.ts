import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { allocateNextNumber } from "@/lib/numbering";
import { audit } from "@/lib/audit";
import { fireWebhook } from "@/lib/webhook";
import { sendEmail, renderIncomingLetterEmail } from "@/lib/email";
import type { ArchiveListItem } from "@/lib/types";
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
  if (status) where.status = status as Prisma.ArchiveWhereInput["status"];

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

  const archives = await prisma.archive.findMany({
    where,
    orderBy: { date: "desc" },
    take: 500,
  });

  const lightweight: ArchiveListItem[] = archives.map(serialiseArchiveList);
  return NextResponse.json({ archives: lightweight });
}

// -------------------------------------------------------------------------
// POST /api/archives
// -------------------------------------------------------------------------

const MAX_DATA_URL_LEN = 4 * 1024 * 1024; // ~3MB binary (base64 adds ~33%)
const DATA_URL_PATTERN = /^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/i;
const BLOB_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

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
      .regex(BLOB_URL_PATTERN, { message: "fileUrl harus dari Vercel Blob" })
      .nullable()
      .optional(),
    blobPathname: z.string().max(500).nullable().optional(),
    fileDataUrl: z
      .string()
      .regex(DATA_URL_PATTERN, {
        message: "Hanya gambar (PNG/JPG/WEBP/GIF) atau PDF yang diperbolehkan",
      })
      .max(MAX_DATA_URL_LEN, "Ukuran file terlalu besar (maks. 3MB)")
      .nullable()
      .optional(),
    manualNumber: z.string().nullable().optional(),
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
  });

export async function POST(req: Request) {
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
    prisma.letterType.findUnique({ where: { id: input.letterTypeId } }),
  ]);
  if (!unit || !letterType) {
    return NextResponse.json({ error: "Unit atau jenis surat tidak ditemukan" }, { status: 400 });
  }

  const isManualArchive = Boolean(input.manualNumber && input.manualNumber.trim().length > 0);
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
        fileDataUrl: input.fileUrl ? null : input.fileDataUrl ?? null,
        createdById: session.userId,
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
        },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );

    return created;
  });

  // Post-commit side effects (email + webhook) must not fail the request.
  (async () => {
    try {
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[archives.POST] post-commit side effects failed", e);
    }
  })();

  return NextResponse.json({ archive: serialiseArchive(archive) }, { status: 201 });
}
