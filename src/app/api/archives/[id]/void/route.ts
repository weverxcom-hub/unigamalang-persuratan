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

  // Re-assert the voidable status atomically inside the transaction. Without
  // this, a concurrent proof upload could flip status PENDING_PROOF -> ISSUED
  // between the findFirst() above and this update, and we'd silently void an
  // ISSUED archive (TechSpec 2.3 forbids that). Pattern mirrors
  // /api/cron/mark-overdue which uses updateMany with a status filter.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.archive.updateMany({
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
    if (result.count === 0) {
      // Status changed under us (e.g. someone uploaded proof first). Throw
      // to abort the transaction; caller below maps this to a 409.
      throw new Error("ARCHIVE_NOT_VOIDABLE");
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
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message === "ARCHIVE_NOT_VOIDABLE") {
      return null;
    }
    throw e;
  });

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Status arsip berubah di tengah proses (mungkin bukti baru saja diunggah). Silakan muat ulang dan coba lagi.",
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
