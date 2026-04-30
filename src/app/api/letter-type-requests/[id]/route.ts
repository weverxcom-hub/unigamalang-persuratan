import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

// PATCH /api/letter-type-requests/[id]
//
// SUPER_ADMIN approves or rejects a pending request:
//
//   { action: "APPROVE", finalCode?, finalName?, allowedUnitIds? }
//   { action: "REJECT",  reviewNote }
//
// On APPROVE we:
//   - create the LetterType (scope = UNIT_SPECIFIC) if no row with that code
//     exists yet
//   - link it to the requesting unit (and any extra units the SUPER_ADMIN
//     specified in allowedUnitIds)
//   - mark the request APPROVED
//
// On REJECT we just flip the status and store the reason.

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("APPROVE"),
    finalCode: z
      .string()
      .min(1)
      .max(10)
      .regex(/^[A-Z0-9.-]+$/, "Kode harus huruf kapital/angka")
      .optional(),
    finalName: z.string().trim().min(3).max(120).optional(),
    allowedUnitIds: z.array(z.string().min(1)).optional(),
    reviewNote: z.string().trim().max(1000).optional(),
  }),
  z.object({
    action: z.literal("REJECT"),
    reviewNote: z.string().trim().min(5, "Alasan penolakan minimal 5 karakter").max(1000),
  }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const existing = await prisma.letterTypeRequest.findUnique({
    where: { id: params.id },
    include: { unit: true, requestedBy: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Pengajuan tidak ditemukan" }, { status: 404 });
  }
  if (existing.status !== "PENDING") {
    return NextResponse.json(
      { error: "Pengajuan ini sudah diproses sebelumnya." },
      { status: 409 }
    );
  }

  if (parsed.data.action === "REJECT") {
    const updated = await prisma.letterTypeRequest.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        reviewedById: session.userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
    });
    await audit({
      action: "UPDATE",
      actorId: session.userId,
      actorEmail: session.email,
      targetType: "LetterTypeRequest",
      targetId: updated.id,
      metadata: {
        action: "REJECT",
        reviewNote: parsed.data.reviewNote,
      },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  // APPROVE: create the LetterType + LetterTypeUnit rows transactionally so
  // we don't end up with a half-approved request.
  const finalCode = parsed.data.finalCode ?? existing.proposedCode;
  const finalName = parsed.data.finalName ?? existing.proposedName;
  const allowedUnitIds = parsed.data.allowedUnitIds && parsed.data.allowedUnitIds.length > 0
    ? Array.from(new Set([...parsed.data.allowedUnitIds, existing.unitId]))
    : [existing.unitId];

  const result = await prisma.$transaction(async (tx) => {
    // If the code is already used by an active LetterType, reuse it (just
    // make sure the requester's unit is added to the allowlist).
    const dup = await tx.letterType.findUnique({ where: { code: finalCode } });
    let lt = dup && !dup.deletedAt ? dup : null;
    if (!lt) {
      if (dup && dup.deletedAt) {
        // Reactivate the soft-deleted row, switch to UNIT_SPECIFIC, replace name.
        lt = await tx.letterType.update({
          where: { id: dup.id },
          data: {
            deletedAt: null,
            scope: "UNIT_SPECIFIC",
            name: finalName,
          },
        });
      } else {
        lt = await tx.letterType.create({
          data: {
            code: finalCode,
            name: finalName,
            scope: "UNIT_SPECIFIC",
          },
        });
      }
    }
    // Add allowlist rows. skipDuplicates so re-approval is idempotent.
    await tx.letterTypeUnit.createMany({
      data: allowedUnitIds.map((unitId) => ({ letterTypeId: lt!.id, unitId })),
      skipDuplicates: true,
    });
    const updatedReq = await tx.letterTypeRequest.update({
      where: { id: params.id },
      data: {
        status: "APPROVED",
        reviewedById: session.userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote ?? null,
        letterTypeId: lt.id,
      },
    });
    return { letterType: lt, request: updatedReq };
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LetterTypeRequest",
    targetId: result.request.id,
    metadata: {
      action: "APPROVE",
      letterTypeId: result.letterType.id,
      finalCode,
      finalName,
      allowedUnitIds,
    },
  });

  return NextResponse.json({
    ok: true,
    status: "APPROVED",
    letterTypeId: result.letterType.id,
  });
}
