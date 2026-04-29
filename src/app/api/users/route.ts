import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { ALLOWED_EMAIL_DOMAIN, getSession, isAllowedEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { Role } from "@prisma/client";

/**
 * GET /api/users — list users.
 * - SUPER_ADMIN: all active users.
 * - Others: users in their own unit (used by disposition picker).
 *
 * Soft-deleted users (deletedAt != null) are excluded by default. Pass
 * `?includeDeleted=true` (SUPER_ADMIN only) to also see deactivated accounts.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const url = new URL(req.url);
  const includeDeleted =
    session.role === "SUPER_ADMIN" && url.searchParams.get("includeDeleted") === "true";

  const baseScope =
    session.role === "SUPER_ADMIN"
      ? {}
      : session.unitId
        ? { unitId: session.unitId }
        : { id: session.userId };

  const where = includeDeleted ? baseScope : { ...baseScope, deletedAt: null };

  const users = await prisma.user.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      unitId: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      unitId: u.unitId,
      createdAt: u.createdAt.toISOString(),
      deletedAt: u.deletedAt ? u.deletedAt.toISOString() : null,
    })),
  });
}

const ROLES = ["SUPER_ADMIN", "ADMIN_UNIT", "USER"] as const;
const createSchema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter"),
  role: z.enum(ROLES),
  // Treat empty string as null so that picking "Tidak terikat" in the UI
  // (which submits "") doesn't slip past the FK validation below and
  // crash with P2003.
  unitId: z.preprocess((v) => (v === "" ? null : v), z.string().nullable().optional()),
});

/**
 * POST /api/users — Super Admin creates a new account with role + unit.
 * Email domain restricted to @unigamalang.ac.id (same as self-register).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Hanya Super Admin yang dapat menambah akun" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const { name, email, password, role, unitId } = parsed.data;
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: `Hanya email ${ALLOWED_EMAIL_DOMAIN} yang diizinkan` }, { status: 400 });
  }
  const normalisedEmail = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalisedEmail } });
  if (existing) {
    if (existing.deletedAt) {
      return NextResponse.json(
        { error: "Email pernah terdaftar (akun dinonaktifkan). Aktifkan kembali alih-alih membuat baru." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Email sudah terdaftar" }, { status: 409 });
  }
  if (unitId) {
    const unit = await prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.deletedAt) {
      return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 400 });
    }
  }
  const user = await prisma.user.create({
    data: {
      email: normalisedEmail,
      name,
      passwordHash: bcrypt.hashSync(password, 10),
      role: role as Role,
      unitId: unitId ?? null,
    },
  });
  await audit({
    action: "CREATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "User",
    targetId: user.id,
    metadata: { email: user.email, role: user.role, unitId: user.unitId },
  });
  return NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        unitId: user.unitId,
        createdAt: user.createdAt.toISOString(),
        deletedAt: null,
      },
    },
    { status: 201 }
  );
}
