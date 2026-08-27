import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, setSessionCookie, toSessionPayload } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const schema = z.object({
  unitId: z.string().min(1, "Unit wajib dipilih"),
});

/**
 * PATCH /api/users/me/unit — self-service unit assignment.
 *
 * Restricted to SSO-provisioned accounts (authProvider === "SSO"): their
 * identity is already vouched for by the institutional SSO gateway, so
 * letting them pick their own unit once is reasonable. Self-registered
 * (CREDENTIALS) accounts are NOT allowed through this endpoint — a
 * SUPER_ADMIN must assign their unit instead (audit T-01: letting anyone
 * who can sign up also declare their own unit was a direct path to
 * reading another unit's archives).
 *
 * The "already has a unit" check reads fresh from the DB rather than the
 * JWT (audit T-02): the session cookie is valid for 7 days and never
 * re-checks unitId mid-lifetime, so trusting session.unitId here would let
 * someone replay an old pre-assignment cookie to re-trigger this endpoint
 * and reassign themselves to a different unit at will.
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const current = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { unitId: true, authProvider: true, deletedAt: true, sessionVersion: true },
  });
  if (!current || current.deletedAt) {
    return NextResponse.json({ error: "Akun tidak ditemukan" }, { status: 404 });
  }
  if (current.authProvider !== "SSO") {
    return NextResponse.json(
      { error: "Penetapan unit mandiri hanya untuk akun SSO. Hubungi Super Admin untuk menetapkan unit Anda." },
      { status: 403 }
    );
  }
  if (current.unitId) {
    return NextResponse.json(
      { error: "Unit sudah ditetapkan. Hubungi Super Admin untuk mengubah unit." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  // Validate the unit exists and is active
  const unit = await prisma.unit.findUnique({ where: { id: parsed.data.unitId } });
  if (!unit || unit.deletedAt) {
    return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: { unitId: parsed.data.unitId, sessionVersion: { increment: 1 } },
  });

  // Refresh the session cookie so the unitId (and bumped sessionVersion)
  // are immediately available — without this the just-incremented
  // sessionVersion would invalidate the user's own current session.
  await setSessionCookie(toSessionPayload(updated));

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "User",
    targetId: session.userId,
    metadata: { unitAssigned: unit.code, selfService: true },
  });

  return NextResponse.json({ ok: true, unitId: unit.id, unitCode: unit.code });
}
