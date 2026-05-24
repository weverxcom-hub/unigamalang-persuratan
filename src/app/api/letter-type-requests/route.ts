import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

// TechSpec 3.1: ADMIN_UNIT submits a request → SUPER_ADMIN approves/rejects.
//
//   GET /api/letter-type-requests?status=PENDING
//     SUPER_ADMIN → all requests for the campus.
//     ADMIN_UNIT  → only requests they themselves submitted (history).
//     USER        → 403.
//
//   POST /api/letter-type-requests
//     ADMIN_UNIT submits { proposedCode, proposedName, reason }. The
//     requester's home unit is auto-attached.

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role === "USER") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const where: Prisma.LetterTypeRequestWhereInput = {};
  if (statusParam && ["PENDING", "APPROVED", "REJECTED"].includes(statusParam)) {
    where.status = statusParam as Prisma.LetterTypeRequestWhereInput["status"];
  }
  if (session.role !== "SUPER_ADMIN") {
    // ADMIN_UNIT only sees their own queue.
    where.requestedById = session.userId;
  }

  // Pagination: ?page=1&pageSize=50 (default 50, max 200)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(url.searchParams.get("pageSize")) || 50));
  const skip = (page - 1) * pageSize;

  const [rows, total] = await Promise.all([
    prisma.letterTypeRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        unit: { select: { id: true, code: true, name: true } },
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
      skip,
      take: pageSize,
    }),
    prisma.letterTypeRequest.count({ where }),
  ]);

  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      proposedCode: r.proposedCode,
      proposedName: r.proposedName,
      reason: r.reason,
      status: r.status,
      unit: r.unit,
      requestedBy: r.requestedBy,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
      reviewNote: r.reviewNote,
      letterTypeId: r.letterTypeId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}

const createSchema = z.object({
  proposedCode: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z0-9.-]+$/, "Kode harus huruf kapital/angka (mis. SK, ST)"),
  proposedName: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(10, "Alasan minimal 10 karakter").max(1000),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "ADMIN_UNIT") {
    return NextResponse.json(
      { error: "Hanya admin unit yang dapat mengajukan jenis surat baru" },
      { status: 403 }
    );
  }
  if (!session.unitId) {
    return NextResponse.json(
      { error: "Akun Anda belum terhubung ke unit manapun" },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  // Reject if a non-deleted LetterType with this code already exists — the
  // admin should just ask the SUPER_ADMIN to add their unit to the allowlist.
  const dup = await prisma.letterType.findUnique({
    where: { code: parsed.data.proposedCode },
  });
  if (dup && !dup.deletedAt) {
    return NextResponse.json(
      {
        error:
          "Kode ini sudah dipakai oleh jenis surat lain. Hubungi superadmin agar unit Anda diizinkan menggunakannya.",
      },
      { status: 409 }
    );
  }

  // Reject if there is already a PENDING request from this user for the same code.
  const existingPending = await prisma.letterTypeRequest.findFirst({
    where: {
      proposedCode: parsed.data.proposedCode,
      status: "PENDING",
      unitId: session.unitId,
    },
  });
  if (existingPending) {
    return NextResponse.json(
      { error: "Sudah ada pengajuan PENDING untuk kode ini di unit Anda." },
      { status: 409 }
    );
  }

  const created = await prisma.letterTypeRequest.create({
    data: {
      proposedCode: parsed.data.proposedCode,
      proposedName: parsed.data.proposedName,
      reason: parsed.data.reason,
      requestedById: session.userId,
      unitId: session.unitId,
    },
    include: {
      unit: { select: { id: true, code: true, name: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
    },
  });

  await audit({
    action: "CREATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LetterTypeRequest",
    targetId: created.id,
    metadata: {
      proposedCode: created.proposedCode,
      proposedName: created.proposedName,
      unitId: created.unitId,
    },
  });

  return NextResponse.json(
    {
      request: {
        id: created.id,
        proposedCode: created.proposedCode,
        proposedName: created.proposedName,
        reason: created.reason,
        status: created.status,
        unit: created.unit,
        requestedBy: created.requestedBy,
        reviewedBy: null,
        reviewedAt: null,
        reviewNote: null,
        letterTypeId: null,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
