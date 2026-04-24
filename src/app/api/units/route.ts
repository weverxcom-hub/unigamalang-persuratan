import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getDb, saveDb, uid } from "@/lib/db";

export async function GET() {
  const db = getDb();
  return NextResponse.json({ units: db.units });
}

const schema = z.object({
  code: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .max(10, "Kode maksimal 10 karakter")
    .regex(/^[A-Z0-9]+$/, "Kode harus huruf kapital/angka (mis. UNIGA, YAS)"),
  name: z.string().min(3, "Nama unit minimal 3 karakter"),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Hanya Super Admin Pusat yang dapat menambah unit" },
      { status: 403 }
    );
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
  if (db.units.some((u) => u.code === parsed.data.code)) {
    return NextResponse.json({ error: "Kode unit sudah digunakan" }, { status: 409 });
  }
  const unit = {
    id: uid("u"),
    code: parsed.data.code,
    name: parsed.data.name,
    createdAt: new Date().toISOString(),
  };
  db.units.push(unit);
  saveDb(db);
  return NextResponse.json({ unit }, { status: 201 });
}
