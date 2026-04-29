-- Add Google Drive file ID column for the new GDrive storage backend.
-- Idempotent guard mirrors the soft-delete migration: safe to re-run if a
-- partial apply happened on the live DB.
ALTER TABLE "Archive" ADD COLUMN IF NOT EXISTS "gdriveFileId" TEXT;
