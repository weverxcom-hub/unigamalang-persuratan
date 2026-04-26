import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Role } from "@prisma/client";

const ROLES = ["SUPER_ADMIN", "ADMIN_UNIT", "USER"] as const;
const patchSchema = z.object({
  name: z.string().min(2).optional(),
  role: z.enum(ROLES).optional(),
  // Empty string => null (avoid FK P2003 crash when UI picks "Tidak terikat").
  unitId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").optional(),
  // Reactivate (clear deletedAt). Cannot be combined with deactivation —
  // explicit DELETE handles that.
  reactivate: z.boolean().optional(),
});

/**
 * PATCH /api/users/[id] — Super Admin only. Edit name, role, unit, password,
 * or reactivate a soft-deleted account. Email is immutable (identity key).
 */
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
  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }
  // Reject silent edits to deactivated accounts (consistent with units / letter-types).
  if (existing.deletedAt && !parsed.data.reactivate) {
    return NextResponse.json({ error: "Akun telah dinonaktifkan" }, { status: 404 });
  }
  if (parsed.data.unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId } });
    if (!unit || unit.deletedAt) {
      return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 400 });
    }
  }
  // Defensive: prevent SUPER_ADMIN from demoting / disabling themselves
  // (and getting locked out).
  if (existing.id === session.userId && parsed.data.role && parsed.data.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Anda tidak dapat menurunkan role akun Anda sendiri" },
      { status: 400 }
    );
  }

  const data: {
    name?: string;
    role?: Role;
    unitId?: string | null;
    passwordHash?: string;
    deletedAt?: Date | null;
  } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role as Role;
  if (parsed.data.unitId !== undefined) data.unitId = parsed.data.unitId;
  if (parsed.data.password !== undefined) data.passwordHash = bcrypt.hashSync(parsed.data.password, 10);
  if (parsed.data.reactivate) data.deletedAt = null;

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "User",
    targetId: updated.id,
    metadata: {
      changes: Object.keys(data),
      passwordReset: parsed.data.password !== undefined,
      reactivated: !!parsed.data.reactivate,
    },
  });
  return NextResponse.json({
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      unitId: updated.unitId,
      createdAt: updated.createdAt.toISOString(),
      deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : null,
    },
  });
}

/**
 * DELETE /api/users/[id] — soft-deactivate (deletedAt = now). User can no
 * longer log in but historical records (Archive.createdBy, AuditLog.actor,
 * Disposition) remain intact.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  if (params.id === session.userId) {
    return NextResponse.json(
      { error: "Anda tidak dapat menonaktifkan akun Anda sendiri" },
      { status: 400 }
    );
  }
  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: "Pengguna tidak ditemukan" }, { status: 404 });
  }
  await prisma.user.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
  await audit({
    action: "DELETE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "User",
    targetId: existing.id,
    metadata: { email: existing.email, role: existing.role },
  });
  return NextResponse.json({ ok: true });
}
