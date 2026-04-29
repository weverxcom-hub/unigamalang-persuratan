import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_FORMAT_TEMPLATE } from "@/lib/format";

export async function GET() {
  const units = await prisma.unit.findMany({ orderBy: { code: "asc" } });
  return NextResponse.json({
    units: units.map((u) => ({
      id: u.id,
      code: u.code,
      name: u.name,
      formatTemplate: u.formatTemplate,
      createdAt: u.createdAt.toISOString(),
    })),
  });
}

const schema = z.object({
  code: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .max(10, "Kode maksimal 10 karakter")
    .regex(/^[A-Z0-9]+$/, "Kode harus huruf kapital/angka (mis. UNIGA, YAS)"),
  name: z.string().min(3, "Nama unit minimal 3 karakter"),
  formatTemplate: z.string().min(3).optional(),
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
  const existing = await prisma.unit.findUnique({ where: { code: parsed.data.code } });
  if (existing) {
    return NextResponse.json({ error: "Kode unit sudah digunakan" }, { status: 409 });
  }
  const unit = await prisma.unit.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      formatTemplate: parsed.data.formatTemplate || DEFAULT_FORMAT_TEMPLATE,
    },
  });
  return NextResponse.json(
    {
      unit: {
        id: unit.id,
        code: unit.code,
        name: unit.name,
        formatTemplate: unit.formatTemplate,
        createdAt: unit.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
