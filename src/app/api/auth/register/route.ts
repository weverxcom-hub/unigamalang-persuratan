import { NextResponse } from "next/server";
import { z } from "zod";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, registerUser, setSessionCookie, toSessionPayload } from "@/lib/auth";
import { checkRegisterRate, rateLimitResponse } from "@/lib/rate-limit";
import { PASSWORD_REGEX, PASSWORD_HINT } from "@/lib/password-policy";

const schema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").regex(PASSWORD_REGEX, PASSWORD_HINT),
  // No unitId here on purpose (audit T-01): letting a self-registered
  // account declare its own unit was a direct path to reading another
  // unit's archives. Every self-registered account starts unassigned; a
  // SUPER_ADMIN assigns the unit afterwards via PATCH /api/users/[id].
});

/**
 * Self-registration can be disabled by setting REGISTRATION_DISABLED=true
 * in the environment. When disabled, only Super Admin can create accounts
 * (via /api/users POST). This is the recommended setting for production.
 */
const REGISTRATION_DISABLED = process.env.REGISTRATION_DISABLED === "true";

export async function POST(req: Request) {
  if (REGISTRATION_DISABLED) {
    return NextResponse.json(
      { error: "Pendaftaran mandiri dinonaktifkan. Hubungi Super Admin untuk pembuatan akun." },
      { status: 403 }
    );
  }

  // Rate limiting: 5 attempts per IP per hour
  const rl = checkRegisterRate(req);
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const { name, email, password } = parsed.data;
  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: `Hanya email ${ALLOWED_EMAIL_DOMAIN} yang diizinkan mendaftar` },
      { status: 403 }
    );
  }
  try {
    const user = await registerUser({ name, email, password });
    const payload = toSessionPayload(user);
    await setSessionCookie(payload);
    return NextResponse.json({ user: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mendaftar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
