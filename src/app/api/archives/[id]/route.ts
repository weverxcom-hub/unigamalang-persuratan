import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb, saveDb } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  const db = getDb();
  const archive = db.archives.find((a) => a.id === params.id);
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });
  const canDelete =
    session.role === "SUPER_ADMIN" ||
    (session.role === "ADMIN_UNIT" && session.unitId === archive.unitId) ||
    (session.role === "USER" &&
      archive.createdById === session.userId &&
      (archive.status === "PENDING" || archive.status === "PENDING_PROOF"));
  if (!canDelete) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  db.archives = db.archives.filter((a) => a.id !== params.id);
  saveDb(db);
  return NextResponse.json({ ok: true });
}
