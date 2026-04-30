// Shared serialiser for the Ticket Prisma row → JSON wire shape.
// Lives outside `src/app/api/tickets/` so route files can only export
// HTTP method handlers (Next.js validates Route exports).

import type { Prisma } from "@prisma/client";

export type TicketRow = Prisma.TicketGetPayload<{
  include: {
    createdBy: { select: { id: true; name: true; email: true } };
    unit: { select: { id: true; code: true; name: true } };
    assignedTo: { select: { id: true; name: true } };
  };
}>;

export function serializeTicket(t: TicketRow) {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    pageHint: t.pageHint,
    screenshotUrl: t.screenshotUrl,
    status: t.status,
    responseNote: t.responseNote,
    createdById: t.createdById,
    createdByName: t.createdBy?.name ?? "",
    createdByEmail: t.createdBy?.email ?? "",
    unitId: t.unitId,
    unitCode: t.unit?.code ?? null,
    unitName: t.unit?.name ?? null,
    assignedToId: t.assignedToId,
    assignedToName: t.assignedTo?.name ?? null,
    resolvedAt: t.resolvedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
