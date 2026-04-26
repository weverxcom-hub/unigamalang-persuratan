-- Add soft-delete sentinel columns + indexes for User, Unit, LetterType.
-- Idempotent guards (`IF NOT EXISTS`) keep this safe to re-run if a partial
-- apply happened on the live DB.

ALTER TABLE "User"       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Unit"       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "LetterType" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_deletedAt_idx"       ON "User"       ("deletedAt");
CREATE INDEX IF NOT EXISTS "Unit_deletedAt_idx"       ON "Unit"       ("deletedAt");
CREATE INDEX IF NOT EXISTS "LetterType_deletedAt_idx" ON "LetterType" ("deletedAt");
