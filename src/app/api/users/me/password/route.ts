import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const schema = z.object({
  currentPassword: z.string().min(1, "Kata sandi saat ini wajib diisi"),
  newPassword: z.string().min(8, "Kata sandi baru minimal 8 karakter"),
});

/**
 * POST /api/users/me/password — change own password. Requires the current
 * password (verified with bcrypt) so a stolen session cookie alone cannot
 * lock the real owner out.
 */
export async function POST(req: Request) {
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

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
  }

  const match = bcrypt.compareSync(parsed.data.currentPassword, user.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "Kata sandi saat ini salah" }, { status: 400 });
  }

  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return NextResponse.json(
      { error: "Kata sandi baru harus berbeda dari yang lama" },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: bcrypt.hashSync(parsed.data.newPassword, 10) },
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "User",
    targetId: user.id,
    metadata: { passwordChanged: true, self: true },
  });

  return NextResponse.json({ ok: true });
}
