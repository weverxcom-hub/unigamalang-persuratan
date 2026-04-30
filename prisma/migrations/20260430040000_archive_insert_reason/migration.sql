-- Sisipan / manual-override metadata.
-- isInsert defaults to false so existing archives are correctly marked as
-- having been issued through the normal numbering flow. insertReason is
-- nullable; the application layer enforces it must be present when isInsert
-- is true. We're not back-filling existing rows that happened to use a
-- manual number — the audit trail for those was lost before this PR.
ALTER TABLE "Archive"
  ADD COLUMN "isInsert" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "insertReason" TEXT;
