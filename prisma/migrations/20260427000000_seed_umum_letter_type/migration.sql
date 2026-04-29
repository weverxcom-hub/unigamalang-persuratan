-- Seed a generic "UMUM" letter type used as the default for incoming letters
-- where the operator can't reasonably classify the sender's letter.
-- Idempotent via the unique constraint on `code`.
INSERT INTO "LetterType" ("id", "code", "name", "createdAt", "updatedAt")
VALUES ('letter-type-umum-default', 'UMUM', 'Umum', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
