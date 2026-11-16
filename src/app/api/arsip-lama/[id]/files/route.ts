import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canEditOldArchive, canViewOldArchive } from "@/lib/arsip-lama/access";
import {
  OLD_ARCHIVE_MAX_BYTES,
  OLD_ARCHIVE_MIME,
  originalName,
  uploadedBy,
} from "@/lib/arsip-lama/upload";
import { DriveFileMissingError, getFileFingerprint } from "@/lib/gdrive";

const bodySchema = z.object({
  fileId: z.string().trim().min(1, "Berkas wajib diisi"),
  replaceReason: z.string().optional(),
});

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

/**
 * POST /api/arsip-lama/[id]/files
 *
 * Attaches a file the browser already uploaded to Drive. Size, type and hash
 * come from what Drive reports, never from the request. Earlier versions are
 * marked replaced and kept (no row and no Drive file is ever deleted).
 */
export async function POST(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const { id } = await paramsPromise;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const rawBody = await req.json().catch(() => null);

  const decree = await prisma.legacyDecree.findUnique({
    where: { id },
    select: { id: true, unitId: true, withdrawnAt: true },
  });
  if (!decree) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  if (!canEditOldArchive(session, decree)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const driveId = parsed.data.fileId;

  let fp;
  try {
    fp = await getFileFingerprint(driveId);
  } catch (e) {
    if (e instanceof DriveFileMissingError) {
      return NextResponse.json(
        { error: "Berkas tidak ditemukan di Google Drive. Unggah ulang." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Berkas tidak valid" },
      { status: 400 }
    );
  }

  if (!uploadedBy(fp.name, session.userId)) {
    return NextResponse.json({ error: "Berkas ini bukan unggahan Anda" }, { status: 403 });
  }
  if (!OLD_ARCHIVE_MIME.includes(fp.mimeType)) {
    return NextResponse.json({ error: "Hanya PDF atau gambar yang diizinkan" }, { status: 400 });
  }
  if (fp.sizeBytes > OLD_ARCHIVE_MAX_BYTES) {
    return NextResponse.json({ error: "Ukuran berkas maksimal 25 MB" }, { status: 400 });
  }

  const [usedByArchive, usedByDecreeFile] = await Promise.all([
    prisma.archive.findFirst({ where: { gdriveFileId: driveId }, select: { id: true } }),
    prisma.legacyDecreeFile.findUnique({ where: { gdriveFileId: driveId }, select: { id: true } }),
  ]);
  if (usedByArchive || usedByDecreeFile) {
    return NextResponse.json({ error: "Berkas ini sudah dipakai" }, { status: 409 });
  }

  const current = await prisma.legacyDecreeFile.findFirst({
    where: { decreeId: id, replacedAt: null },
    select: { id: true },
  });
  const replaceReason = parsed.data.replaceReason?.trim() ?? "";
  if (current && replaceReason.length < 10) {
    return NextResponse.json(
      { error: "Alasan penggantian berkas wajib diisi (minimal 10 karakter)" },
      { status: 400 }
    );
  }

  const now = new Date();
  const fileName = originalName(fp.name, session.userId);
  const created = await prisma.$transaction(async (tx) => {
    // Touch the parent row first: it takes the row lock that serialises
    // concurrent attaches to the same record.
    await tx.legacyDecree.update({ where: { id }, data: { updatedAt: now } });
    await tx.legacyDecreeFile.updateMany({
      where: { decreeId: id, replacedAt: null },
      data: { replacedAt: now, replaceReason: current ? replaceReason : null },
    });
    const file = await tx.legacyDecreeFile.create({
      data: {
        decreeId: id,
        gdriveFileId: driveId,
        fileName,
        mimeType: fp.mimeType,
        sizeBytes: fp.sizeBytes,
        sha256: fp.sha256,
        uploadedById: session.userId,
        uploadedByEmail: session.email,
      },
    });
    await audit(
      {
        action: "UPLOAD",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "LegacyDecree",
        targetId: id,
        metadata: {
          event: current ? "file_replace" : "file_add",
          sha256: fp.sha256,
          fileName,
          replaceReason: current ? replaceReason : null,
        } as Prisma.InputJsonValue,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
    return file;
  });

  // Same scan already filed under another record? Show only what the caller may see.
  const sameHash = await prisma.legacyDecreeFile.findMany({
    where: { sha256: fp.sha256, decreeId: { not: id } },
    select: {
      decree: {
        select: {
          id: true,
          nomor: true,
          perihal: true,
          unitId: true,
          confidential: true,
          withdrawnAt: true,
        },
      },
    },
  });
  const seen = new Set<string>();
  const viewable: { id: string; nomor: string | null; perihal: string }[] = [];
  let hiddenCount = 0;
  for (const row of sameHash) {
    const d = row.decree;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    if (canViewOldArchive(session, d)) {
      viewable.push({ id: d.id, nomor: d.nomor, perihal: d.perihal });
    } else {
      hiddenCount += 1;
    }
  }

  return NextResponse.json(
    {
      file: {
        id: created.id,
        fileName: created.fileName,
        sha256: created.sha256,
        sizeBytes: created.sizeBytes,
      },
      duplicates: { viewable, hiddenCount },
    },
    { status: 201 }
  );
}
