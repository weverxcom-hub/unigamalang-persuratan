-- TechSpec sections 2.3 (VOID) and 2.4 (PENDING_PROOF 14-day OVERDUE timeout).
--
-- Adds:
--   - "VOID" and "OVERDUE" values to the ArchiveStatus enum.
--   - voidReason / voidedAt / voidedById columns on Archive (filled by
--     POST /api/archives/[id]/void).
--   - overdueMarkedAt column (set by /api/cron/mark-overdue when an archive's
--     14-day proof window expires; preserved even after a late proof upload
--     so the lateness record stays visible).

-- Postgres requires enum values to be added one at a time; IF NOT EXISTS keeps
-- the migration idempotent across re-runs.
ALTER TYPE "ArchiveStatus" ADD VALUE IF NOT EXISTS 'OVERDUE';
ALTER TYPE "ArchiveStatus" ADD VALUE IF NOT EXISTS 'VOID';

ALTER TABLE "Archive"
  ADD COLUMN "voidReason"      TEXT,
  ADD COLUMN "voidedAt"        TIMESTAMP(3),
  ADD COLUMN "voidedById"      TEXT,
  ADD COLUMN "overdueMarkedAt" TIMESTAMP(3);

-- Set NULL on user delete so we don't lose VOID provenance silently and
-- never block a user delete because of it.
ALTER TABLE "Archive"
  ADD CONSTRAINT "Archive_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
