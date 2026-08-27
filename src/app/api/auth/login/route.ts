import { NextResponse } from "next/server";
import { z } from "zod";
import { ALLOWED_EMAIL_DOMAIN, authenticate, isAllowedEmail, setSessionCookie, toSessionPayload } from "@/lib/auth";
import { checkLoginRate, checkLoginRateByEmail, rateLimitResponse } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(req: Request) {
  // Rate limiting: 10 attempts per IP per 15 minutes
  const rl = checkLoginRate(req);
  if (!rl.allowed) return rateLimitResponse(rl);

  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent");

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email atau kata sandi tidak valid" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: `Hanya email ${ALLOWED_EMAIL_DOMAIN} yang diizinkan` },
      { status: 403 }
    );
  }
  // Per-account limit in addition to the per-IP one above (audit H7) — stops
  // a distributed password-spray against one target account even when each
  // attempt comes from a different IP.
  const emailRl = checkLoginRateByEmail(email);
  if (!emailRl.allowed) return rateLimitResponse(emailRl);

  const user = await authenticate(email, password);
  if (!user) {
    // Audited without actorId (unknown/unauthenticated identity) so the
    // audit log still shows brute-force / credential-stuffing attempts
    // against a given email + IP (audit H5 — this event was previously
    // never recorded despite the audit page already having a label for it).
    await audit({
      action: "LOGIN_FAILED",
      actorEmail: email.toLowerCase(),
      targetType: "Auth",
      metadata: { reason: "invalid_credentials" },
      ip,
      userAgent,
    });
    return NextResponse.json({ error: "Email atau kata sandi salah" }, { status: 401 });
  }
  const payload = toSessionPayload(user);
  await setSessionCookie(payload);
  await audit({
    action: "LOGIN",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "Auth",
    targetId: user.id,
    ip,
    userAgent,
  });
  return NextResponse.json({ user: payload });
}
