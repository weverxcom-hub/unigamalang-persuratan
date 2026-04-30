// TechSpec PR-E: per-ticket read & update.
//
// GET    /api/tickets/[id] — reporter or SUPER_ADMIN can read.
// PATCH  /api/tickets/[id] — SUPER_ADMIN only: change status / response /
//                             assignment. Reporter cannot edit (read-only).

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { serializeTicket } from "@/lib/tickets";

const patchSchema = z
  .object({
    status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
    responseNote: z.string().trim().max(5000).optional().nullable(),
    // Pass own user id to claim the ticket; pass `null` to unassign.
    assignedToId: z.string().nullable().optional(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.responseNote !== undefined ||
      v.assignedToId !== undefined,
    { message: "Tidak ada perubahan yang dikirim" }
  );

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, code: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Tiket tidak ditemukan" }, { status: 404 });
  }
  // Reporter can read their own; SUPER_ADMIN can read everything.
  if (session.role !== "SUPER_ADMIN" && ticket.createdById !== session.userId) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  return NextResponse.json({ ticket: serializeTicket(ticket) });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
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

  const existing = await prisma.ticket.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Tiket tidak ditemukan" }, { status: 404 });
  }

  // If assigning, validate the assignee is a SUPER_ADMIN (only they can own
  // tickets) and is still active.
  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findUnique({
      where: { id: parsed.data.assignedToId },
      select: { role: true, deletedAt: true },
    });
    if (!assignee || assignee.deletedAt) {
      return NextResponse.json(
        { error: "Pengguna assignee tidak ditemukan" },
        { status: 400 }
      );
    }
    if (assignee.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Hanya superadmin yang dapat menjadi assignee tiket" },
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const goingResolved =
    parsed.data.status === "RESOLVED" && existing.status !== "RESOLVED";
  const leavingResolved =
    parsed.data.status !== undefined &&
    parsed.data.status !== "RESOLVED" &&
    existing.status === "RESOLVED";

  const updated = await prisma.ticket.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.responseNote !== undefined
        ? { responseNote: parsed.data.responseNote || null }
        : {}),
      ...(parsed.data.assignedToId !== undefined
        ? { assignedToId: parsed.data.assignedToId || null }
        : {}),
      ...(goingResolved ? { resolvedAt: now } : {}),
      ...(leavingResolved ? { resolvedAt: null } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, code: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "Ticket",
    targetId: updated.id,
    metadata: {
      before: {
        status: existing.status,
        assignedToId: existing.assignedToId,
        responseNote: existing.responseNote,
      },
      after: {
        status: updated.status,
        assignedToId: updated.assignedToId,
        responseNote: updated.responseNote,
      },
    },
  });

  return NextResponse.json({ ticket: serializeTicket(updated) });
}
