import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { runAfter } from "@/lib/after";
import { fireWebhook } from "@/lib/webhook";
import { serialiseArchive } from "../../serialise";

/**
 * POST /api/archives/[id]/void — cancel an allocated number with a mandatory
 * reason. TechSpec 2.3:
 *
 *   - Only PENDING_PROOF or OVERDUE archives can be voided. ISSUED letters
 *     have already been distributed externally and must NOT be voidable.
 *   - The number is NOT released back to the counter — the row stays with
 *     status=VOID + voidReason so the audit trail is preserved.
 *   - The reason is required and recorded.
 */

const VOIDABLE = new Set(["PENDING_PROOF", "OVERDUE"]);

const voidSchema = z.object({
  reason: z
    .string({ message: "Alasan pembatalan wajib diisi" })
    .trim()
    .min(5, "Alasan pembatalan minimal 5 karakter")
    .max(1000, "Alasan pembatalan terlalu panjang"),
});

// Sentinel thrown inside the transaction when the archive's status was
// concurrently changed (e.g. proof uploaded between the read and the update),
// caught by the outer `.catch` so we can return 409 instead of crashing.
class VoidConflict extends Error {
  constructor(public currentStatus: string) {
    super(`VoidConflict: current status is ${currentStatus}`);
    this.name = "VoidConflict";
  }
}

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  // Same-unit admin or super_admin only — disposition recipients should NOT
  // be able to cancel an arsip that does not belong to their unit.
  const canVoid =
    session.role === "SUPER_ADMIN" ||
    (session.role === "ADMIN_UNIT" && session.unitId === archive.unitId);
  if (!canVoid) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  if (!VOIDABLE.has(archive.status)) {
    return NextResponse.json(
      {
        error:
          "Hanya surat berstatus PENDING_PROOF atau OVERDUE yang dapat dibatalkan. Surat yang sudah ISSUED tidak dapat di-VOID.",
      },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = voidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Permintaan tidak valid" },
      { status: 400 }
    );
  }

  const reason = parsed.data.reason;
  const now = new Date();

  // updateMany re-asserts that the row is still PENDING_PROOF or OVERDUE
  // inside the transaction. Without this, a concurrent proof upload that
  // flips PENDING_PROOF → ISSUED between the findFirst above and this
  // update would silently overwrite the ISSUED state with VOID, violating
  // the rule that ISSUED letters are not voidable. If the row was raced
  // out we get count=0 and respond with 409.
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.archive.updateMany({
      where: {
        id: archive.id,
        status: { in: ["PENDING_PROOF", "OVERDUE"] },
      },
      data: {
        status: "VOID",
        voidReason: reason,
        voidedAt: now,
        voidedById: session.userId,
      },
    });
    if (r.count === 0) {
      // Surface the concrete current status so the caller can show a useful
      // error to the user ("surat sudah ISSUED, tidak dapat di-VOID").
      const fresh = await tx.archive.findUnique({
        where: { id: archive.id },
        select: { status: true },
      });
      throw new VoidConflict(fresh?.status ?? archive.status);
    }
    const u = await tx.archive.findUniqueOrThrow({ where: { id: archive.id } });
    await audit(
      {
        action: "UPDATE",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "Archive",
        targetId: archive.id,
        archiveId: archive.id,
        metadata: {
          event: "archive.voided",
          reason,
          previousStatus: archive.status,
        },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
    return u;
  }).catch((err) => {
    if (err instanceof VoidConflict) return err;
    throw err;
  });

  if (updated instanceof VoidConflict) {
    return NextResponse.json(
      {
        error:
          updated.currentStatus === "ISSUED"
            ? "Surat ini sudah ISSUED (bukti sudah diunggah). VOID tidak diizinkan."
            : updated.currentStatus === "VOID"
            ? "Surat ini sudah dibatalkan sebelumnya."
            : "Status surat berubah sebelum permintaan VOID diproses. Muat ulang halaman.",
        currentStatus: updated.currentStatus,
      },
      { status: 409 }
    );
  }

  runAfter("archive.voided", async () => {
    await fireWebhook({
      event: "archive.voided",
      archiveId: updated.id,
      number: updated.number,
      subject: updated.subject,
      unitCode: updated.unitCode,
      letterTypeCode: updated.letterTypeCode,
      reason,
      voidedById: session.userId,
      voidedAt: now.toISOString(),
    });
  });

  return NextResponse.json({ archive: serialiseArchive(updated) });
}
