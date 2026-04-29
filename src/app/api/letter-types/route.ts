import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const letterTypes = await prisma.letterType.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json({
    letterTypes: letterTypes.map((lt) => ({
      id: lt.id,
      code: lt.code,
      name: lt.name,
      createdAt: lt.createdAt.toISOString(),
    })),
  });
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
  const existing = await prisma.letterType.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return NextResponse.json({ error: "Kode jenis surat sudah digunakan" }, { status: 409 });
  }
  const letterType = await prisma.letterType.create({
    data: { code: parsed.data.code, name: parsed.data.name },
  });
  return NextResponse.json(
    {
      letterType: {
        id: letterType.id,
        code: letterType.code,
        name: letterType.name,
        createdAt: letterType.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
