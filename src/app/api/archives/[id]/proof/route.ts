import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { deleteFromBlob } from "@/lib/blob";
import { deleteFile as deleteGdriveFile } from "@/lib/gdrive";
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

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.archive.update({
      where: { id: archive.id },
      data: {
        fileName: parsed.data.fileName,
        fileUrl: parsed.data.fileUrl ?? null,
        blobPathname: newBlobPathname,
        gdriveFileId: newGdriveFileId,
        fileDataUrl: parsed.data.fileUrl ? null : parsed.data.fileDataUrl ?? null,
        status: archive.status === "PENDING_PROOF" ? "ISSUED" : archive.status,
      },
    });
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

  return NextResponse.json({ archive: serialiseArchive(updated) });
}
