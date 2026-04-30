import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { deleteFromBlob } from "@/lib/blob";
import { deleteFile as deleteGdriveFile } from "@/lib/gdrive";
import { serialiseArchive } from "../serialise";

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  // Same-unit users can always read. Additionally, a user can read an
  // archive that belongs to a different unit if they are a disposition
  // recipient (either directly via toUserId, or via toUnitId == their unit)
  // — without this, dispositions that cross unit boundaries are
  // effectively unreachable for the recipient.
  let canRead =
    session.role === "SUPER_ADMIN" ||
    (session.unitId && session.unitId === archive.unitId);
  if (!canRead) {
    const dispo = await prisma.disposition.findFirst({
      where: {
        archiveId: archive.id,
        OR: [
          { toUserId: session.userId },
          ...(session.unitId ? [{ toUnitId: session.unitId }] : []),
        ],
      },
      select: { id: true },
    });
    if (dispo) canRead = true;
  }
  if (!canRead) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

  return NextResponse.json({ archive: serialiseArchive(archive) });
}

/**
 * Soft-delete. Archives are never hard-deleted; we set `deletedAt` and the Blob
 * file (if any) is removed from storage for GDPR-style cleanup.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findUnique({ where: { id: params.id } });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });
  if (archive.deletedAt) {
    return NextResponse.json({ error: "Arsip sudah dihapus" }, { status: 409 });
  }

  const canDelete =
    session.role === "SUPER_ADMIN" ||
    (session.role === "ADMIN_UNIT" && session.unitId === archive.unitId) ||
    (session.role === "USER" &&
      archive.createdById === session.userId &&
      (archive.status === "PENDING" || archive.status === "PENDING_PROOF"));
  if (!canDelete) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

  await prisma.$transaction(async (tx) => {
    await tx.archive.update({
      where: { id: archive.id },
      data: { deletedAt: new Date(), fileDataUrl: null },
    });
    await audit(
      {
        action: "DELETE",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "Archive",
        targetId: archive.id,
        archiveId: archive.id,
        metadata: { number: archive.number, status: archive.status },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
  });

  // Best-effort storage cleanup. Failures here MUST NOT bubble up as a 500;
  // the DB soft-delete already committed and the user expects success.
  if (archive.blobPathname) {
    try {
      await deleteFromBlob(archive.blobPathname);
    } catch (e) {
      console.warn("[/api/archives/[id]] failed to delete blob", archive.blobPathname, e);
    }
  }
  if (archive.gdriveFileId) {
    try {
      await deleteGdriveFile(archive.gdriveFileId);
    } catch (e) {
      console.warn("[/api/archives/[id]] failed to delete gdrive file", archive.gdriveFileId, e);
    }
  }

  return NextResponse.json({ ok: true });
}
