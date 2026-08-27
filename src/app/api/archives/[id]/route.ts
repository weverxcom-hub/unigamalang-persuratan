import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { deleteFromBlob } from "@/lib/blob";
import { deleteFile as deleteGdriveFile } from "@/lib/gdrive";
import { fireWebhook } from "@/lib/webhook";
import { runAfter } from "@/lib/after";
import { allocateNextNumber } from "@/lib/numbering";
import { serialiseArchive } from "../serialise";

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  // Same-unit users can always read. Additionally, a user can read an
  // archive that belongs to a different unit if they are a disposition
  // recipient (either directly via toUserId, or via toUnitId == their unit)
  // — without this, dispositions that cross unit boundaries are
  // effectively unreachable for the recipient.
  let canRead =
    session.role === "SUPER_ADMIN" ||
    (session.unitId && session.unitId === archive.unitId);
  if (!canRead) {
    const dispo = await prisma.disposition.findFirst({
      where: {
        archiveId: archive.id,
        OR: [
          { toUserId: session.userId },
          ...(session.unitId ? [{ toUnitId: session.unitId }] : []),
        ],
      },
      select: { id: true },
    });
    if (dispo) canRead = true;
  }
  if (!canRead) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

  return NextResponse.json({ archive: serialiseArchive(archive) });
}

// -------------------------------------------------------------------------
// PATCH /api/archives/[id] — Approve or reject a PENDING archive
// -------------------------------------------------------------------------
//
// When a USER creates a surat keluar via /dashboard/generate, the archive
// is created with status=PENDING. An admin (ADMIN_UNIT of the same unit or
// SUPER_ADMIN) can then:
//   - APPROVE → allocates a real sequence number and transitions to
//     PENDING_PROOF (admin still needs to upload proof later).
//   - REJECT → soft-deletes the archive so the number is never allocated.
//
// This keeps the numbering counter accurate: a USER draft only consumes a
// sequence number after admin approval, not at submission time.

const patchSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  rejectReason: z.string().trim().max(500).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  // Only admins can approve/reject.
  if (session.role === "USER") {
    return NextResponse.json(
      { error: "Hanya admin yang dapat menyetujui atau menolak arsip" },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  // Scope check: ADMIN_UNIT can only act on their own unit's archives.
  if (session.role !== "SUPER_ADMIN" && session.unitId !== archive.unitId) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  if (archive.status !== "PENDING") {
    return NextResponse.json(
      { error: "Hanya arsip berstatus PENDING (menunggu persetujuan) yang dapat disetujui atau ditolak." },
      { status: 409 }
    );
  }

  const { action, rejectReason } = parsed.data;

  if (action === "REJECT") {
    // Soft-delete the archive. The number was never allocated (USER drafts
    // use sequenceNumber=0 with a tentative number), so no counter to undo.
    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.archive.update({
        where: { id: archive.id },
        data: { deletedAt: new Date() },
      });
      await audit(
        {
          action: "UPDATE",
          actorId: session.userId,
          actorEmail: session.email,
          targetType: "Archive",
          targetId: archive.id,
          archiveId: archive.id,
          metadata: {
            event: "archive.rejected",
            previousStatus: archive.status,
            rejectReason: rejectReason ?? null,
          },
          ip: clientIp(req),
          userAgent: req.headers.get("user-agent"),
        },
        tx
      );
      return u;
    });

    runAfter("archive.rejected", async () => {
      await fireWebhook({
        event: "archive.rejected",
        archiveId: updated.id,
        number: updated.number,
        subject: updated.subject,
        unitCode: updated.unitCode,
        letterTypeCode: updated.letterTypeCode,
        rejectedById: session.userId,
        rejectReason: rejectReason ?? null,
      });
    });

    return NextResponse.json({ archive: serialiseArchive(updated) });
  }

  // APPROVE: allocate a real sequence number and transition to PENDING_PROOF.
  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Re-check status atomically to prevent race conditions.
      const current = await tx.archive.findUniqueOrThrow({ where: { id: archive.id } });
      if (current.status !== "PENDING") {
        throw new Error("ARCHIVE_NOT_PENDING");
      }

      const allocated = await allocateNextNumber(archive.unitId, archive.letterTypeId, tx);

      const u = await tx.archive.update({
        where: { id: archive.id },
        data: {
          status: "PENDING_PROOF",
          number: allocated.number,
          sequenceNumber: allocated.sequenceNumber,
        },
      });

      await audit(
        {
          action: "UPDATE",
          actorId: session.userId,
          actorEmail: session.email,
          targetType: "Archive",
          targetId: archive.id,
          archiveId: archive.id,
          metadata: {
            event: "archive.approved",
            previousStatus: "PENDING",
            previousNumber: archive.number,
            newNumber: allocated.number,
            sequenceNumber: allocated.sequenceNumber,
          },
          ip: clientIp(req),
          userAgent: req.headers.get("user-agent"),
        },
        tx
      );

      return u;
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Status arsip berubah di tengah proses. Silakan muat ulang dan coba lagi." },
        { status: 409 }
      );
    }

    runAfter("archive.approved", async () => {
      await fireWebhook({
        event: "archive.approved",
        archiveId: updated.id,
        number: updated.number,
        subject: updated.subject,
        unitCode: updated.unitCode,
        letterTypeCode: updated.letterTypeCode,
        approvedById: session.userId,
        previousNumber: archive.number,
      });
    });

    return NextResponse.json({ archive: serialiseArchive(updated) });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "ARCHIVE_NOT_PENDING") {
      return NextResponse.json(
        { error: "Status arsip berubah di tengah proses. Silakan muat ulang dan coba lagi." },
        { status: 409 }
      );
    }
    // Log full detail server-side only. Echoing e.message (audit M4) can leak
    // Prisma internals — constraint/table names, or DB host:port on a
    // connection error — to the client, the same class of leak the POST
    // /api/archives handler above was explicitly written to avoid.
    console.error("[PATCH /api/archives/[id]] approve failed:", e);
    return NextResponse.json(
      { error: "Terjadi kesalahan saat menyetujui arsip. Silakan coba lagi atau hubungi superadmin." },
      { status: 500 }
    );
  }
}

/**
 * Soft-delete. Archives are never hard-deleted; we set `deletedAt` and the Blob
 * file (if any) is removed from storage for GDPR-style cleanup.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findUnique({ where: { id: params.id } });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });
  if (archive.deletedAt) {
    return NextResponse.json({ error: "Arsip sudah dihapus" }, { status: 409 });
  }

  const canDelete =
    session.role === "SUPER_ADMIN" ||
    (session.role === "ADMIN_UNIT" && session.unitId === archive.unitId) ||
    (session.role === "USER" &&
      archive.createdById === session.userId &&
      (archive.status === "PENDING" || archive.status === "PENDING_PROOF"));
  if (!canDelete) return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });

  await prisma.$transaction(async (tx) => {
    await tx.archive.update({
      where: { id: archive.id },
      data: { deletedAt: new Date(), fileDataUrl: null },
    });
    await audit(
      {
        action: "DELETE",
        actorId: session.userId,
        actorEmail: session.email,
        targetType: "Archive",
        targetId: archive.id,
        archiveId: archive.id,
        metadata: { number: archive.number, status: archive.status },
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
      },
      tx
    );
  });

  // Best-effort storage cleanup. Failures here MUST NOT bubble up as a 500;
  // the DB soft-delete already committed and the user expects success.
  if (archive.blobPathname) {
    try {
      await deleteFromBlob(archive.blobPathname);
    } catch (e) {
      console.warn("[/api/archives/[id]] failed to delete blob", archive.blobPathname, e);
    }
  }
  if (archive.gdriveFileId) {
    try {
      await deleteGdriveFile(archive.gdriveFileId);
    } catch (e) {
      console.warn("[/api/archives/[id]] failed to delete gdrive file", archive.gdriveFileId, e);
    }
  }

  return NextResponse.json({ ok: true });
}
