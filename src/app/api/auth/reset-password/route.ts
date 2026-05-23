import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { PASSWORD_REGEX, PASSWORD_HINT } from "@/lib/password-policy";
import { checkPasswordResetRate, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(1, "Token wajib diisi"),
  newPassword: z
    .string()
    .min(8, "Kata sandi minimal 8 karakter")
    .regex(PASSWORD_REGEX, PASSWORD_HINT),
});

/**
 * POST /api/auth/reset-password
 *
 * Validates the reset token + email, then updates the password.
 */
export async function POST(req: Request) {
  const rl = checkPasswordResetRate(req);
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const { email, token, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  if (
    !user ||
    user.deletedAt ||
    !user.resetToken ||
    !user.resetTokenExpiresAt
  ) {
    return NextResponse.json(
      { error: "Token tidak valid atau sudah kedaluwarsa" },
      { status: 400 }
    );
  }

  // Constant-time comparison to prevent timing attacks
  const tokenValid =
    crypto.timingSafeEqual
      ? (() => {
          try {
            const a = Buffer.from(user.resetToken!, "utf-8");
            const b = Buffer.from(token, "utf-8");
            return a.length === b.length && crypto.timingSafeEqual(a, b);
          } catch {
            return false;
          }
        })()
      : user.resetToken === token;

  if (!tokenValid || user.resetTokenExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "Token tidak valid atau sudah kedaluwarsa" },
      { status: 400 }
    );
  }

  // Update password and clear the reset token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: bcrypt.hashSync(newPassword, 10),
      resetToken: null,
      resetTokenExpiresAt: null,
    },
  });

  await audit({
    action: "UPDATE",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "User",
    targetId: user.id,
    metadata: { passwordReset: true, selfService: true },
  });

  return NextResponse.json({ ok: true });
}

// Import crypto for timingSafeEqual
import crypto from "node:crypto";
