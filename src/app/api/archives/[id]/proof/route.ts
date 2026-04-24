import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb, saveDb } from "@/lib/db";

// Proof is stored inline as a base64 data URL — prototype-only strategy that
// works on Vercel's read-only filesystem without an object-store dependency.
const MAX_DATA_URL_LEN = 4 * 1024 * 1024; // ~3MB binary (base64 adds ~33% overhead)

const schema = z.object({
  fileName: z.string().min(1, "Nama file wajib diisi"),
  fileDataUrl: z
    .string()
    .regex(/^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,/i, {
      message: "Hanya gambar (PNG/JPG/WEBP/GIF) atau PDF yang diperbolehkan",
    })
    .max(MAX_DATA_URL_LEN, "Ukuran file terlalu besar (maks. 3MB)"),
});

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

  const db = getDb();
  const archive = db.archives.find((a) => a.id === params.id);
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  const canUpload =
    session.role === "SUPER_ADMIN" ||
    (session.role === "ADMIN_UNIT" && session.unitId === archive.unitId) ||
    (session.role === "USER" && archive.createdById === session.userId);
  if (!canUpload) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  archive.fileName = parsed.data.fileName;
  archive.fileDataUrl = parsed.data.fileDataUrl;
  if (archive.status === "PENDING_PROOF") {
    archive.status = "ISSUED";
  }

  saveDb(db);
  return NextResponse.json({ archive });
}
