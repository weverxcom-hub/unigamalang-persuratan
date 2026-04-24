import { NextResponse } from "next/server";
import { z } from "zod";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, registerUser, setSessionCookie, toSessionPayload } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2, "Nama minimal 2 karakter"),
  email: z.string().email(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter"),
  unitId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const { name, email, password, unitId } = parsed.data;
  if (!isAllowedEmail(email)) {
    return NextResponse.json(
      { error: `Hanya email ${ALLOWED_EMAIL_DOMAIN} yang diizinkan mendaftar` },
      { status: 403 }
    );
  }
  try {
    const user = await registerUser({ name, email, password, unitId: unitId ?? null, role: "USER" });
    const payload = toSessionPayload(user);
    await setSessionCookie(payload);
    return NextResponse.json({ user: payload }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mendaftar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
