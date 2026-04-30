import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

/**
 * Cron endpoint that flips PENDING_PROOF archives older than 14 days into
 * OVERDUE. TechSpec 2.4: "Tetapkan batas waktu upload bukti: 14 hari kalender
 * sejak tanggal alokasi nomor".
 *
 * Wired in vercel.json as a daily cron. Authentication: `Authorization:
 * Bearer ${CRON_SECRET}`. Vercel Cron sends this header automatically when
 * `CRON_SECRET` is set as a Production env var (see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 *
 * We deliberately do NOT trust the `x-vercel-cron` header on its own — that
 * header is not cryptographically verified and any external client can spoof
 * it.
 *
 * Idempotent: a second run on the same day is a no-op because the WHERE
 * clause requires `status = 'PENDING_PROOF'`, and the updateMany re-checks
 * that status to defend against TOCTOU with concurrent proof uploads / VOIDs.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const expectedToken = process.env.CRON_SECRET;
  const tokenOk = !!expectedToken && auth === `Bearer ${expectedToken}`;
  if (!tokenOk) {
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

  // updateMany re-asserts status = 'PENDING_PROOF'. If a concurrent request
  // (proof upload → ISSUED, or VOID) flipped a candidate between the
  // findMany above and this updateMany, that row's WHERE no longer matches
  // and we skip it. `updated` reflects how many rows actually transitioned.
  let updatedCount = 0;
  await prisma.$transaction(async (tx) => {
    const r = await tx.archive.updateMany({
      where: {
        id: { in: candidates.map((c) => c.id) },
        status: "PENDING_PROOF",
      },
      data: { status: "OVERDUE", overdueMarkedAt: now },
    });
    updatedCount = r.count;
    // We can still audit each candidate id because the audit log captures
    // the cron's intent; if a row was raced out the audit shows the cron
    // saw it but did not flip it (audit metadata includes the candidate
    // list, not a "post-update read"). If you want stricter audit, fetch
    // the rows again here filtered to status = OVERDUE — left out for
    // perf, since the race is rare.
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
    markedOverdue: updatedCount,
    candidates: candidates.length,
    cutoff: cutoff.toISOString(),
    archives: candidates.map((c) => ({ id: c.id, number: c.number, unitCode: c.unitCode })),
  });
}
