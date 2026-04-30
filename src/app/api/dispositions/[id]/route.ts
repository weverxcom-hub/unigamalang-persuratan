import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const schema = z.object({
  status: z.enum(["ACKNOWLEDGED", "COMPLETED", "REJECTED"]),
  note: z.string().max(1000).nullable().optional(),
});

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

/**
 * PATCH /api/dispositions/[id] — acknowledge, complete, or reject a
 * disposition. Only the target user (or an admin of the target unit) can
 * update the status.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  const d = await prisma.disposition.findUnique({ where: { id: params.id } });
  if (!d) return NextResponse.json({ error: "Disposisi tidak ditemukan" }, { status: 404 });

  const canAck =
    session.role === "SUPER_ADMIN" ||
    d.toUserId === session.userId ||
    (d.toUnitId !== null && session.unitId === d.toUnitId);
  if (!canAck) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

  const now = new Date();
  const data = {
    status: parsed.data.status,
    note: parsed.data.note ?? d.note,
    acknowledgedAt:
      parsed.data.status === "ACKNOWLEDGED" && !d.acknowledgedAt ? now : d.acknowledgedAt,
    completedAt:
      parsed.data.status === "COMPLETED" && !d.completedAt ? now : d.completedAt,
  };

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.disposition.update({ where: { id: d.id }, data });
    await audit(
      {
        action: "DISPOSITION_UPDATE",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "Disposition",
        targetId: d.id,
        archiveId: d.archiveId,
        metadata: { status: parsed.data.status, note: parsed.data.note ?? null },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
    return u;
  });

  return NextResponse.json({ disposition: { id: updated.id, status: updated.status } });
}
