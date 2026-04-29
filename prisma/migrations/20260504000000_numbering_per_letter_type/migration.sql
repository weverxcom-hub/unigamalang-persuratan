-- Move from per-(unit, year) counters to per-(unit, letterType, year) counters.
-- Production data on this table is only operator test data from setup, so we
-- wipe it and admins re-enter "Nomor Terakhir" per unit×jenis×tahun via the
-- updated UI. Archive table is untouched (it stores the final string number).

DELETE FROM "NumberingSequence";

ALTER TABLE "NumberingSequence"
  DROP CONSTRAINT IF EXISTS "NumberingSequence_unitId_year_key";

DROP INDEX IF EXISTS "NumberingSequence_unitId_year_idx";

ALTER TABLE "NumberingSequence"
  ADD COLUMN "letterTypeId" TEXT NOT NULL;

ALTER TABLE "NumberingSequence"
  ADD CONSTRAINT "NumberingSequence_letterTypeId_fkey"
  FOREIGN KEY ("letterTypeId") REFERENCES "LetterType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "NumberingSequence_unitId_letterTypeId_year_key"
  ON "NumberingSequence"("unitId", "letterTypeId", "year");

CREATE INDEX "NumberingSequence_unitId_year_idx"
  ON "NumberingSequence"("unitId", "year");

CREATE INDEX "NumberingSequence_letterTypeId_year_idx"
  ON "NumberingSequence"("letterTypeId", "year");
