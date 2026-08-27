import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { hashResetToken, isAllowedEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escapeHtml, sendEmail } from "@/lib/email";
import { checkPasswordResetRate, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/forgot-password
 *
 * Sends a password reset email with a time-limited token.
 * Always returns 200 (even if email not found) to prevent enumeration.
 */
export async function POST(req: Request) {
  const rl = checkPasswordResetRate(req);
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email tidak valid" }, { status: 400 });
  }

  const { email } = parsed.data;
  if (!isAllowedEmail(email)) {
    // Don't reveal whether the email exists — always return success.
    return NextResponse.json({ ok: true });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });

  // Always respond with success to prevent email enumeration
  if (!user || user.deletedAt) {
    return NextResponse.json({ ok: true });
  }

  // Generate a secure token + expiry (1 hour). Only the hash is persisted
  // (audit M5) — the raw `token` lives solely in the emailed link.
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetToken: hashResetToken(token),
      resetTokenExpiresAt: expiresAt,
    },
  });

  // Build the reset link
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const resetLink = `${appUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

  await sendEmail({
    to: user.email,
    subject: "Reset Kata Sandi — Sistem Persuratan UNIGA",
    html: `<!doctype html><html><body style="font-family: system-ui, sans-serif; background:#f6f7f9; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; padding:24px; border:1px solid #e5e7eb;">
    <h2 style="margin:0 0 8px; color:#7f1d1d;">Reset Kata Sandi</h2>
    <p style="margin:0 0 16px; color:#374151;">Halo <strong>${escapeHtml(user.name)}</strong>, Anda meminta reset kata sandi akun Sistem Persuratan.</p>
    <p style="margin:0 0 16px; color:#374151;">Klik tombol di bawah untuk membuat kata sandi baru. Link ini berlaku selama <strong>1 jam</strong>.</p>
    <p style="margin:20px 0;"><a href="${resetLink}" style="display:inline-block; padding:12px 24px; background:#991b1b; color:#fff; text-decoration:none; border-radius:8px; font-weight:600;">Reset Kata Sandi</a></p>
    <p style="margin:16px 0 0; color:#6b7280; font-size:13px;">Jika Anda tidak merasa meminta reset ini, abaikan email ini. Akun Anda tetap aman.</p>
  </div>
  <p style="max-width:560px; margin:12px auto 0; color:#6b7280; font-size:12px;">Universitas Gajayana Malang · Sistem Manajemen Persuratan</p>
</body></html>`,
    text: `Reset Kata Sandi\n\nHalo ${user.name},\n\nKlik link berikut untuk membuat kata sandi baru (berlaku 1 jam):\n${resetLink}\n\nJika Anda tidak meminta reset ini, abaikan email ini.`,
  });

  return NextResponse.json({ ok: true });
}
