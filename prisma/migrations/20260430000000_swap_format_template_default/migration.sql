-- Swap [UNIT_CODE] and [TYPE_CODE] in the default Unit.formatTemplate.
--
-- Spec (BAU UNIGA, April 2026): the canonical letter number is now
--   [NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]
-- (TYPE before UNIT). Existing archive numbers are NOT rewritten — they remain
-- with whatever format they were issued under. Only the column default and any
-- units that still use the LEGACY default are flipped. Unit YAS is also
-- normalized unconditionally because its template was historically inverted
-- relative to the rest of the directory.

-- 1. Update the column default for new rows.
ALTER TABLE "Unit"
  ALTER COLUMN "formatTemplate"
  SET DEFAULT '[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]';

-- 2. Flip any unit still on the legacy default. We avoid touching custom
--    templates an admin may have set deliberately.
UPDATE "Unit"
SET "formatTemplate" = '[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]'
WHERE "formatTemplate" = '[NO]/[UNIT_CODE]/[TYPE_CODE]/[ROMAN_MONTH]/[YEAR]';

-- 3. Force-normalize unit YAS regardless of current template. Per spec, YAS
--    historically used a different ordering from the rest of the org and must
--    be aligned with the standard.
UPDATE "Unit"
SET "formatTemplate" = '[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]'
WHERE "code" = 'YAS';
