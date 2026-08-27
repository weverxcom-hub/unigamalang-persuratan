-- Security hardening (audit 2026-08-23):
--   T-01/T-02 — distinguish self-registered accounts from SSO-provisioned
--               ones, so unit self-assignment can be restricted to SSO.
--   T-03      — session versioning for near-immediate revocation of
--               role/unit/password changes.
--   T-05      — global uniqueness on Archive.number so a manual/"sisipan"
--               entry can never collide with an auto-generated one.

-- AuthProvider enum + User.authProvider
CREATE TYPE "AuthProvider" AS ENUM ('CREDENTIALS', 'SSO');
ALTER TABLE "User" ADD COLUMN "authProvider" "AuthProvider" NOT NULL DEFAULT 'CREDENTIALS';

-- User.sessionVersion
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- Archive.number: drop the plain index (superseded by the unique
-- constraint below, which creates its own index) and enforce uniqueness.
--
-- NOTE: if this fails with a duplicate-key error, the table already
-- contains two archives sharing the same `number`. Resolve those manually
-- (renumber or void one of them) before re-running this migration — do
-- not skip the constraint.
DROP INDEX IF EXISTS "Archive_number_idx";
ALTER TABLE "Archive" ADD CONSTRAINT "Archive_number_key" UNIQUE ("number");
