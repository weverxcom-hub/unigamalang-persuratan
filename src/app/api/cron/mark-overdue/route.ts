import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

/**
 * Cron endpoint that flips PENDING_PROOF archives older than 14 days into
 * OVERDUE. TechSpec 2.4: "Tetapkan batas waktu upload bukti: 14 hari kalender
 * sejak tanggal alokasi nomor".
 *
 * Wired in vercel.json as a daily cron. We accept either:
 *   - the Vercel Cron header `x-vercel-cron`, OR
 *   - `Authorization: Bearer ${CRON_SECRET}` (for manual / external invocation).
 *
 * Idempotent: a second run on the same day is a no-op because the WHERE
 * clause requires `status = 'PENDING_PROOF'` and we move the row off that
 * status as soon as it qualifies.
 */
export async function GET(req: Request) {
  // Vercel cron requests carry the `x-vercel-cron` header. For manual / curl
  // testing we accept a bearer token.
  const isVercelCron = req.headers.get("x-vercel-cron") !== null;
  const auth = req.headers.get("authorization") ?? "";
  const expectedToken = process.env.CRON_SECRET;
  const tokenOk = !!expectedToken && auth === `Bearer ${expectedToken}`;
  if (!isVercelCron && !tokenOk) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const candidates = await prisma.archive.findMany({
    where: {
      deletedAt: null,
      status: "PENDING_PROOF",
      createdAt: { lt: cutoff },
    },
    select: { id: true, number: true, unitId: true, unitCode: true },
  });

  if (candidates.length === 0) {
    return NextResponse.json({ markedOverdue: 0, cutoff: cutoff.toISOString() });
  }

  // Update + audit per row inside a single transaction so a partial failure
  // doesn't leave half the batch in an inconsistent state.
  await prisma.$transaction(async (tx) => {
    await tx.archive.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { status: "OVERDUE", overdueMarkedAt: now },
    });
    for (const c of candidates) {
      await audit(
        {
          action: "UPDATE",
          targetType: "Archive",
          targetId: c.id,
          archiveId: c.id,
          metadata: {
            event: "archive.overdue.marked",
            cutoff: cutoff.toISOString(),
            unitCode: c.unitCode,
          },
        },
        tx
      );
    }
  });

  return NextResponse.json({
    markedOverdue: candidates.length,
    cutoff: cutoff.toISOString(),
    archives: candidates.map((c) => ({ id: c.id, number: c.number, unitCode: c.unitCode })),
  });
}
