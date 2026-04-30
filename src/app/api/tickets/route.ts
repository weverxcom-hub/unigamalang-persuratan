// TechSpec PR-E: Help-desk ticket reporting (3.4).
//
// POST /api/tickets — any authenticated user submits a problem report.
// GET  /api/tickets — list tickets visible to the caller:
//                      SUPER_ADMIN sees everything (with optional ?status filter),
//                      everyone else only sees tickets they created.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { serializeTicket } from "@/lib/tickets";
import type { Prisma, TicketStatus } from "@prisma/client";

const VALID_STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"];

function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === "string" && (VALID_STATUSES as string[]).includes(value);
}

const createSchema = z.object({
  title: z.string().trim().min(5, "Judul minimal 5 karakter").max(200),
  description: z.string().trim().min(10, "Deskripsi minimal 10 karakter").max(5000),
  // Free-text label for the page/feature being reported. Optional; defaults
  // to whatever the client passes (it sends `window.location.pathname`).
  pageHint: z.string().trim().max(200).optional().nullable(),
  // Optional Vercel Blob upload result. Same defence-in-depth contract as
  // archive proofs: pathname must live under the reporter's namespace.
  screenshotUrl: z.string().url().max(2000).optional().nullable(),
  screenshotPathname: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  // Defence in depth: if the client supplied a Blob handle, force it into the
  // user's namespace. Same contract as /api/blob/upload onBeforeGenerateToken.
  const screenshotPathname = parsed.data.screenshotPathname?.trim() || null;
  if (screenshotPathname) {
    const expectedPrefix = `persuratan/${session.userId}/`;
    if (!screenshotPathname.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Path file screenshot tidak diizinkan" },
        { status: 403 }
      );
    }
  }

  const ticket = await prisma.ticket.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      pageHint: parsed.data.pageHint?.trim() || null,
      screenshotUrl: parsed.data.screenshotUrl?.trim() || null,
      screenshotPathname,
      createdById: session.userId,
      unitId: session.unitId,
    },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, code: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  await audit({
    action: "CREATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "Ticket",
    targetId: ticket.id,
    metadata: { title: ticket.title, pageHint: ticket.pageHint },
  });

  return NextResponse.json({ ticket: serializeTicket(ticket) }, { status: 201 });
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const where: Prisma.TicketWhereInput = {};
  if (session.role !== "SUPER_ADMIN") {
    // Reporter can only see their own tickets.
    where.createdById = session.userId;
  }
  if (statusParam && statusParam !== "ALL") {
    if (!isTicketStatus(statusParam)) {
      return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
    }
    where.status = statusParam;
  }

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      unit: { select: { id: true, code: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ tickets: tickets.map(serializeTicket) });
}
