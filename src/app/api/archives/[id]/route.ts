import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { deleteFromBlob } from "@/lib/blob";
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

  const archive = await prisma.archive.findUnique({ where: { id: params.id } });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  const canRead =
    session.role === "SUPER_ADMIN" ||
    (session.unitId && session.unitId === archive.unitId);
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

  if (archive.blobPathname) {
    await deleteFromBlob(archive.blobPathname);
  }

  return NextResponse.json({ ok: true });
}
