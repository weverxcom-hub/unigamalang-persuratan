-- Add Google Drive file ID column for the new GDrive storage backend.
ALTER TABLE "Archive" ADD COLUMN "gdriveFileId" TEXT;
