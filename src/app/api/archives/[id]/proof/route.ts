import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { deleteFromBlob } from "@/lib/blob";
import {
  deleteFile as deleteGdriveFile,
  renameFile as renameGdriveFile,
} from "@/lib/gdrive";
import { buildArchiveFilename } from "@/lib/archive-filename";
import { serialiseArchive } from "../../serialise";

const MAX_DATA_URL_LEN = 4 * 1024 * 1024;
const DATA_URL_PATTERN = /^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/i;
const BLOB_URL_PATTERN = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const GDRIVE_URL_PATTERN = /^https:\/\/(drive|docs)\.google\.com\//i;
const FILE_URL_PATTERN = new RegExp(
  `(${BLOB_URL_PATTERN.source})|(${GDRIVE_URL_PATTERN.source})`,
  "i"
);

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

const schema = z
  .object({
    fileName: z.string().min(1, "Nama file wajib diisi"),
    // Accept either a Vercel Blob URL (preferred) or legacy inline data URL.
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
  })
  .refine((v) => v.fileUrl || v.fileDataUrl, {
    message: "Harus menyertakan fileUrl (Blob) atau fileDataUrl (base64)",
    path: ["fileUrl"],
  });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  const canRead =
    session.role === "SUPER_ADMIN" ||
    (session.unitId && session.unitId === archive.unitId);
  if (!canRead) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

  if (!archive.fileUrl && !archive.fileDataUrl) {
    return NextResponse.json({ error: "Bukti belum diunggah" }, { status: 404 });
  }

  return NextResponse.json({
    id: archive.id,
    number: archive.number,
    fileName: archive.fileName,
    fileUrl: archive.fileUrl,
    fileDataUrl: archive.fileDataUrl,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  const canUpload =
    session.role === "SUPER_ADMIN" ||
    (session.role === "ADMIN_UNIT" && session.unitId === archive.unitId) ||
    (session.role === "USER" && archive.createdById === session.userId);
  if (!canUpload) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

  // Storage-identifier ownership check (mirrors /api/archives POST). Without
  // this, a hostile caller could attach another archive's blobPathname /
  // gdriveFileId here, which would later be deleted on archive soft-delete.
  if (parsed.data.blobPathname) {
    const expectedPrefix = `persuratan/${session.userId}/`;
    if (!parsed.data.blobPathname.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Path file Blob tidak diizinkan" },
        { status: 403 }
      );
    }
    const dup = await prisma.archive.findFirst({
      where: {
        blobPathname: parsed.data.blobPathname,
        deletedAt: null,
        NOT: { id: archive.id },
      },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "File Blob ini sudah terkait arsip lain" },
        { status: 409 }
      );
    }
  }
  if (parsed.data.gdriveFileId) {
    const dup = await prisma.archive.findFirst({
      where: {
        gdriveFileId: parsed.data.gdriveFileId,
        deletedAt: null,
        NOT: { id: archive.id },
      },
      select: { id: true },
    });
    if (dup) {
      return NextResponse.json(
        { error: "File Drive ini sudah terkait arsip lain" },
        { status: 409 }
      );
    }
  }

  // Capture old storage handles so we can clean them up post-commit if they
  // change. We never roll back the upload because of a cleanup failure.
  const previousBlobPathname = archive.blobPathname;
  const previousGdriveFileId = archive.gdriveFileId;
  const newBlobPathname = parsed.data.blobPathname ?? null;
  const newGdriveFileId = parsed.data.gdriveFileId ?? null;
  const storageKind: "gdrive" | "blob" | "inline" = parsed.data.gdriveFileId
    ? "gdrive"
    : parsed.data.fileUrl
      ? "blob"
      : "inline";

  const fileFields = {
    fileName: parsed.data.fileName,
    fileUrl: parsed.data.fileUrl ?? null,
    blobPathname: newBlobPathname,
    gdriveFileId: newGdriveFileId,
    fileDataUrl: parsed.data.fileUrl ? null : parsed.data.fileDataUrl ?? null,
  };

  // The status flip from PENDING_PROOF/OVERDUE → ISSUED must be atomic with
  // a fresh status check; otherwise a concurrent VOID could be silently
  // overwritten back to ISSUED (TOCTOU). Pattern mirrors void route's
  // updateMany guard. We try the flip first; if the row count comes back 0
  // it means the status changed under us (most likely VOID), in which case
  // we still persist the uploaded file but DO NOT flip the status.
  const updated = await prisma.$transaction(async (tx) => {
    const flip = await tx.archive.updateMany({
      where: {
        id: archive.id,
        status: { in: ["PENDING_PROOF", "OVERDUE"] },
      },
      data: {
        ...fileFields,
        // overdueMarkedAt is preserved deliberately so the lateness record
        // stays visible (TechSpec 2.4: "catatan keterlambatan tetap tersimpan").
        status: "ISSUED",
      },
    });
    if (flip.count === 0) {
      // Status moved out of voidable-to-ISSUED range between findFirst() and
      // here. Could be: already ISSUED (idempotent re-upload), VOID (race
      // with void route), or PENDING (USER role workflow). Persist the file
      // metadata so the upload isn't lost, but leave status alone.
      await tx.archive.update({
        where: { id: archive.id },
        data: fileFields,
      });
    }
    const u = await tx.archive.findUniqueOrThrow({ where: { id: archive.id } });
    await audit(
      {
        action: "UPLOAD",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "Archive",
        targetId: archive.id,
        archiveId: archive.id,
        metadata: {
          fileName: parsed.data.fileName,
          kind: storageKind,
          // Surface in audit log whether the status actually flipped, so a
          // race-loss is debuggable post-hoc.
          statusFlippedToIssued: flip.count > 0,
          finalStatus: u.status,
        },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
    return u;
  });

  // Best-effort cleanup of orphaned storage objects, after the DB commit.
  if (previousBlobPathname && previousBlobPathname !== newBlobPathname) {
    try {
      await deleteFromBlob(previousBlobPathname);
    } catch (e) {
      console.warn("[/api/archives/[id]/proof] failed to delete old blob", previousBlobPathname, e);
    }
  }
  if (previousGdriveFileId && previousGdriveFileId !== newGdriveFileId) {
    try {
      await deleteGdriveFile(previousGdriveFileId);
    } catch (e) {
      console.warn(
        "[/api/archives/[id]/proof] failed to delete old gdrive file",
        previousGdriveFileId,
        e
      );
    }
  }

  // Auto-rename the new Drive file to `{nomor}_{subject}.{ext}` so it sorts
  // alongside the archive in Drive's UI. Best-effort.
  if (newGdriveFileId) {
    try {
      const newName = buildArchiveFilename({
        number: updated.number,
        subject: updated.subject,
        originalFilename: parsed.data.fileName,
      });
      const ok = await renameGdriveFile(newGdriveFileId, newName);
      if (ok && newName !== parsed.data.fileName) {
        await prisma.archive.update({
          where: { id: updated.id },
          data: { fileName: newName },
        });
        updated.fileName = newName;
      }
    } catch (e) {
      console.warn("[/api/archives/[id]/proof] failed to rename gdrive file", e);
    }
  }

  return NextResponse.json({ archive: serialiseArchive(updated) });
}
