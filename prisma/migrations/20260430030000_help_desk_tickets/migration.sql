-- TechSpec PR-E: in-app help-desk / error reporting.
-- Adds a single Ticket table. No data migration needed (new feature).

CREATE TYPE "TicketStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pageHint" TEXT,
    "screenshotUrl" TEXT,
    "screenshotPathname" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW',
    "responseNote" TEXT,
    "createdById" TEXT NOT NULL,
    "unitId" TEXT,
    "assignedToId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX "Ticket_createdById_idx" ON "Ticket"("createdById");
CREATE INDEX "Ticket_assignedToId_idx" ON "Ticket"("assignedToId");
CREATE INDEX "Ticket_unitId_idx" ON "Ticket"("unitId");
CREATE INDEX "Ticket_createdAt_idx" ON "Ticket"("createdAt");

-- Cascade: deleting a User deletes their reports (matches schema onDelete: Cascade).
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull: if a unit is hard-removed (soft-delete is used in practice) tickets
-- remain queryable but lose the unit reference.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- SetNull: assignee may be deleted; ticket survives unassigned.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
