import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canViewOldArchive } from "@/lib/arsip-lama/access";
import { DriveFileMissingError, getFileFingerprint } from "@/lib/gdrive";

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

/**
 * POST /api/arsip-lama/[id]/files/[fileId]/check
 *
 * Re-reads the file from Drive and compares its SHA-256 with the one stored
 * when it was attached. A Drive error other than "missing" records nothing.
 */
export async function POST(
  req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await paramsPromise;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const decree = await prisma.legacyDecree.findUnique({
    where: { id },
    select: { id: true, unitId: true, confidential: true, withdrawnAt: true },
  });
  if (!decree) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  if (!canViewOldArchive(session, decree)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const row = await prisma.legacyDecreeFile.findUnique({
    where: { id: fileId },
    select: { id: true, decreeId: true, gdriveFileId: true, sha256: true },
  });
  if (!row || row.decreeId !== id) {
    return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 404 });
  }

  let result: "OK" | "MISMATCH" | "MISSING";
  try {
    const fp = await getFileFingerprint(row.gdriveFileId);
    result = fp.sha256 === row.sha256 ? "OK" : "MISMATCH";
  } catch (e) {
    if (e instanceof DriveFileMissingError) {
      result = "MISSING";
    } else {
      // eslint-disable-next-line no-console
      console.error("[/api/arsip-lama/[id]/files/[fileId]/check] drive error", e);
      return NextResponse.json({ error: "Gagal memeriksa berkas di Google Drive" }, { status: 502 });
    }
  }

  const checkedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.legacyDecreeFile.update({
      where: { id: fileId },
      data: { lastCheckedAt: checkedAt, lastCheckOk: result === "OK" },
    });
    await audit(
      {
        action: "UPDATE",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "LegacyDecree",
        targetId: id,
        metadata: { event: "integrity_check", result, fileId } as Prisma.InputJsonValue,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
  });

  return NextResponse.json({ result, checkedAt });
}
