-- TechSpec PR-D — per-unit letter types + admin-unit request queue.
--
-- 1) New enums for LetterType.scope and LetterTypeRequest.status.
-- 2) LetterType.scope column (default GLOBAL → backward-compatible: every
--    existing letter type stays visible in every unit).
-- 3) LetterTypeUnit join table — allowlist of units for UNIT_SPECIFIC types.
--    Ignored when scope = GLOBAL.
-- 4) LetterTypeRequest table — admin-unit submits a request for a new
--    UNIT_SPECIFIC type, super-admin approves/rejects from the letter-types
--    page.

CREATE TYPE "LetterTypeScope" AS ENUM ('GLOBAL', 'UNIT_SPECIFIC');

CREATE TYPE "LetterTypeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "LetterType"
  ADD COLUMN "scope" "LetterTypeScope" NOT NULL DEFAULT 'GLOBAL';

CREATE TABLE "LetterTypeUnit" (
  "letterTypeId" TEXT NOT NULL,
  "unitId"       TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LetterTypeUnit_pkey" PRIMARY KEY ("letterTypeId", "unitId")
);

CREATE INDEX "LetterTypeUnit_unitId_idx" ON "LetterTypeUnit" ("unitId");

ALTER TABLE "LetterTypeUnit"
  ADD CONSTRAINT "LetterTypeUnit_letterTypeId_fkey"
  FOREIGN KEY ("letterTypeId") REFERENCES "LetterType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LetterTypeUnit"
  ADD CONSTRAINT "LetterTypeUnit_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LetterTypeRequest" (
  "id"            TEXT         NOT NULL,
  "proposedCode"  TEXT         NOT NULL,
  "proposedName"  TEXT         NOT NULL,
  "reason"        TEXT         NOT NULL,
  "status"        "LetterTypeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT         NOT NULL,
  "unitId"        TEXT         NOT NULL,
  "reviewedById"  TEXT,
  "reviewedAt"    TIMESTAMP(3),
  "reviewNote"    TEXT,
  "letterTypeId"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LetterTypeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LetterTypeRequest_status_createdAt_idx"
  ON "LetterTypeRequest" ("status", "createdAt");
CREATE INDEX "LetterTypeRequest_requestedById_idx"
  ON "LetterTypeRequest" ("requestedById");
CREATE INDEX "LetterTypeRequest_unitId_idx"
  ON "LetterTypeRequest" ("unitId");

ALTER TABLE "LetterTypeRequest"
  ADD CONSTRAINT "LetterTypeRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LetterTypeRequest"
  ADD CONSTRAINT "LetterTypeRequest_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LetterTypeRequest"
  ADD CONSTRAINT "LetterTypeRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
