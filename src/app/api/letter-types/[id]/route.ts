import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.-]+$/, "Kode harus huruf kapital/angka (mis. SK, ST)")
    .optional(),
  name: z.string().min(3).optional(),
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
  const existing = await prisma.letterType.findUnique({ where: { id: params.id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Jenis surat tidak ditemukan" }, { status: 404 });
  }
  if (parsed.data.code && parsed.data.code !== existing.code) {
    const dup = await prisma.letterType.findUnique({ where: { code: parsed.data.code } });
    if (dup) return NextResponse.json({ error: "Kode jenis surat sudah digunakan" }, { status: 409 });
  }
  const updated = await prisma.letterType.update({
    where: { id: params.id },
    data: { code: parsed.data.code, name: parsed.data.name },
  });
  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LetterType",
    targetId: updated.id,
    metadata: { before: { code: existing.code, name: existing.name }, after: { code: updated.code, name: updated.name } },
  });
  return NextResponse.json({
    letterType: {
      id: updated.id,
      code: updated.code,
      name: updated.name,
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
  const existing = await prisma.letterType.findUnique({ where: { id: params.id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Jenis surat tidak ditemukan" }, { status: 404 });
  }
  // Soft delete only — Archive.letterType references this row with onDelete: Restrict.
  await prisma.letterType.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  await audit({
    action: "DELETE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LetterType",
    targetId: existing.id,
    metadata: { code: existing.code, name: existing.name },
  });
  return NextResponse.json({ ok: true });
}
