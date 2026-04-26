import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  code: z
    .string()
    .min(2, "Kode minimal 2 karakter")
    .max(10, "Kode maksimal 10 karakter")
    .regex(/^[A-Z0-9]+$/, "Kode harus huruf kapital/angka (mis. UNIGA, YAS)")
    .optional(),
  name: z.string().min(3, "Nama unit minimal 3 karakter").optional(),
  formatTemplate: z.string().min(3).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const existing = await prisma.unit.findUnique({ where: { id: params.id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 404 });
  }
  if (parsed.data.code && parsed.data.code !== existing.code) {
    const dup = await prisma.unit.findUnique({ where: { code: parsed.data.code } });
    if (dup) return NextResponse.json({ error: "Kode unit sudah digunakan" }, { status: 409 });
  }
  const updated = await prisma.unit.update({
    where: { id: params.id },
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      formatTemplate: parsed.data.formatTemplate,
    },
  });
  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "Unit",
    targetId: updated.id,
    metadata: {
      before: { code: existing.code, name: existing.name, formatTemplate: existing.formatTemplate },
      after: { code: updated.code, name: updated.name, formatTemplate: updated.formatTemplate },
    },
  });
  return NextResponse.json({
    unit: {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      formatTemplate: updated.formatTemplate,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  const existing = await prisma.unit.findUnique({ where: { id: params.id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 404 });
  }
  // Soft delete only — Archive.unit / NumberingSequence reference this row.
  // Active users in this unit have their unitId nulled (onDelete: SetNull at
  // the schema level only fires on hard delete; do it manually here so they
  // stop seeing this unit in pickers immediately).
  await prisma.$transaction([
    prisma.unit.update({ where: { id: params.id }, data: { deletedAt: new Date() } }),
    prisma.user.updateMany({ where: { unitId: params.id }, data: { unitId: null } }),
  ]);
  await audit({
    action: "DELETE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "Unit",
    targetId: existing.id,
    metadata: { code: existing.code, name: existing.name },
  });
  return NextResponse.json({ ok: true });
}
