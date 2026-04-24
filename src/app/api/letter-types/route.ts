import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb, saveDb, uid } from "@/lib/db";

export async function GET() {
  const db = getDb();
  return NextResponse.json({ letterTypes: db.letterTypes });
}

const schema = z.object({
  code: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.-]+$/, "Kode harus huruf kapital/angka (mis. SK, ST)"),
  name: z.string().min(3),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const db = getDb();
  if (db.letterTypes.some((lt) => lt.code === parsed.data.code)) {
    return NextResponse.json({ error: "Kode jenis surat sudah digunakan" }, { status: 409 });
  }
  const letterType = {
    id: uid("lt"),
    code: parsed.data.code,
    name: parsed.data.name,
    createdAt: new Date().toISOString(),
  };
  db.letterTypes.push(letterType);
  saveDb(db);
  return NextResponse.json({ letterType }, { status: 201 });
}
