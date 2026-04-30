import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/dispositions — list dispositions where the current session is the
 * recipient (either directly via `toUserId` or because the user belongs to
 * `toUnitId`).
 *
 *   ?box=inbox   (default)  dispositions assigned to me / my unit
 *   ?box=outbox             dispositions I have sent
 *   ?box=all                superadmin only — every disposition
 *   ?status=PENDING|...     optional status filter
 *
 * SUPER_ADMIN dengan ?box=inbox tetap melihat dispositions dimana mereka
 * jadi target, bukan semua disposisi (untuk akses semua: ?box=all).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const url = new URL(req.url);
  const box = url.searchParams.get("box") ?? "inbox";
  const status = url.searchParams.get("status");

  const where: Prisma.DispositionWhereInput = {};
  if (box === "outbox") {
    where.fromUserId = session.userId;
  } else if (box === "all") {
    if (session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
    }
  } else {
    // inbox (default)
    const orClauses: Prisma.DispositionWhereInput[] = [
      { toUserId: session.userId },
    ];
    if (session.unitId) orClauses.push({ toUnitId: session.unitId });
    where.OR = orClauses;
  }

  if (status === "PENDING" || status === "ACKNOWLEDGED" || status === "COMPLETED" || status === "REJECTED") {
    where.status = status;
  }

  const rows = await prisma.disposition.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      archive: {
        select: {
          id: true,
          number: true,
          subject: true,
          direction: true,
          unitCode: true,
          externalSender: true,
          deletedAt: true,
        },
      },
      fromUser: { select: { id: true, name: true, email: true } },
      toUser: { select: { id: true, name: true, email: true } },
      toUnit: { select: { id: true, code: true, name: true } },
    },
  });

  return NextResponse.json({
    dispositions: rows
      .filter((r) => !r.archive.deletedAt)
      .map((r) => ({
        id: r.id,
        archiveId: r.archive.id,
        archiveNumber: r.archive.number,
        archiveSubject: r.archive.subject,
        archiveDirection: r.archive.direction,
        archiveUnitCode: r.archive.unitCode,
        externalSender: r.archive.externalSender,
        fromUserId: r.fromUser.id,
        fromUserName: r.fromUser.name,
        toUserId: r.toUserId,
        toUserName: r.toUser?.name ?? null,
        toUnitId: r.toUnitId,
        toUnitName: r.toUnit?.name ?? null,
        toUnitCode: r.toUnit?.code ?? null,
        instructions: r.instructions,
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        status: r.status,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      })),
  });
}
