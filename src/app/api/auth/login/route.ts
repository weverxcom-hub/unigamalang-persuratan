import { NextResponse } from "next/server";
import { z } from "zod";
import { ALLOWED_EMAIL_DOMAIN, authenticate, isAllowedEmail, setSessionCookie, toSessionPayload } from "@/lib/auth";
import { checkLoginRate, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  // Rate limiting: 10 attempts per IP per 15 minutes
  const rl = checkLoginRate(req);
  if (!rl.allowed) return rateLimitResponse(rl);

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
  const user = await authenticate(email, password);
  if (!user) {
    return NextResponse.json({ error: "Email atau kata sandi salah" }, { status: 401 });
  }
  const payload = toSessionPayload(user);
  await setSessionCookie(payload);
  return NextResponse.json({ user: payload });
}
