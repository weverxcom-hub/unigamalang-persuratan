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
  // Reactivate a soft-deleted letter type (clear deletedAt).
  reactivate: z.boolean().optional(),
  // PR-D: change visibility scope. When set to UNIT_SPECIFIC, allowedUnitIds
  // must be a non-empty array. When set to GLOBAL, the existing LetterTypeUnit
  // rows are wiped (the join becomes irrelevant).
  scope: z.enum(["GLOBAL", "UNIT_SPECIFIC"]).optional(),
  allowedUnitIds: z.array(z.string().min(1)).optional(),
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
  const existing = await prisma.letterType.findUnique({
    where: { id: params.id },
    include: { units: { select: { unitId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Jenis surat tidak ditemukan" }, { status: 404 });
  }
  if (existing.deletedAt && !parsed.data.reactivate) {
    return NextResponse.json({ error: "Jenis surat telah dinonaktifkan" }, { status: 404 });
  }
  if (parsed.data.code && parsed.data.code !== existing.code) {
    const dup = await prisma.letterType.findUnique({ where: { code: parsed.data.code } });
    if (dup) return NextResponse.json({ error: "Kode jenis surat sudah digunakan" }, { status: 409 });
  }

  // Determine the post-edit scope so we know whether to require unit ids.
  const nextScope = parsed.data.scope ?? existing.scope;
  if (nextScope === "UNIT_SPECIFIC") {
    // If the caller explicitly sent an empty array, that's always invalid.
    if (
      parsed.data.allowedUnitIds !== undefined &&
      parsed.data.allowedUnitIds.length === 0
    ) {
      return NextResponse.json(
        { error: "Jenis surat per-unit harus mencantumkan minimal satu unit" },
        { status: 400 }
      );
    }
    // If the caller is switching to UNIT_SPECIFIC (or staying UNIT_SPECIFIC
    // with no existing allowlist) without supplying allowedUnitIds, the type
    // would end up invisible to every unit -- reject. The client UI always
    // sends allowedUnitIds, so this only fires for direct API callers.
    const willHaveUnits =
      parsed.data.allowedUnitIds !== undefined
        ? parsed.data.allowedUnitIds.length > 0
        : existing.units.length > 0;
    if (!willHaveUnits) {
      return NextResponse.json(
        { error: "Jenis surat per-unit harus mencantumkan minimal satu unit" },
        { status: 400 }
      );
    }
  }

  // Apply edits in a transaction so scope + units are consistent.
  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.letterType.update({
      where: { id: params.id },
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        scope: parsed.data.scope,
        ...(parsed.data.reactivate ? { deletedAt: null } : {}),
      },
    });
    // If the caller specified allowedUnitIds, replace the join wholesale.
    // If switching to GLOBAL, also wipe the join (it's irrelevant).
    if (parsed.data.allowedUnitIds !== undefined || nextScope === "GLOBAL") {
      await tx.letterTypeUnit.deleteMany({ where: { letterTypeId: t.id } });
      if (nextScope === "UNIT_SPECIFIC" && parsed.data.allowedUnitIds) {
        await tx.letterTypeUnit.createMany({
          data: parsed.data.allowedUnitIds.map((unitId) => ({
            letterTypeId: t.id,
            unitId,
          })),
          skipDuplicates: true,
        });
      }
    }
    return tx.letterType.findUniqueOrThrow({
      where: { id: t.id },
      include: { units: { select: { unitId: true } } },
    });
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LetterType",
    targetId: updated.id,
    metadata: {
      before: {
        code: existing.code,
        name: existing.name,
        scope: existing.scope,
        allowedUnitIds: existing.units.map((u) => u.unitId),
      },
      after: {
        code: updated.code,
        name: updated.name,
        scope: updated.scope,
        allowedUnitIds: updated.units.map((u) => u.unitId),
      },
      reactivated: !!parsed.data.reactivate,
    },
  });
  return NextResponse.json({
    letterType: {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      scope: updated.scope,
      allowedUnitIds: updated.units.map((u) => u.unitId),
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
