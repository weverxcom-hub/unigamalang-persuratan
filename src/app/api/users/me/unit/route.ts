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
 * Designed for SSO-created users who don't have a unit yet. Once a unit
 * is assigned, this endpoint refuses further changes (user must contact
 * SUPER_ADMIN to change unit).
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  // Only allow if user has NO unit yet (first-time setup)
  if (session.unitId) {
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
    data: { unitId: parsed.data.unitId },
  });

  // Refresh the session cookie so the unitId is immediately available
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
