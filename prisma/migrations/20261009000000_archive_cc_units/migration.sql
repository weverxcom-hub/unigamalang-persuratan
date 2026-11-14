-- Tembusan (CC) antar-unit: satu surat dapat ditembuskan ke banyak unit.
-- Unit tembusan mendapat akses BACA saja (hanya saat arsip ISSUED).

CREATE TABLE "ArchiveCc" (
  "archiveId" TEXT         NOT NULL,
  "unitId"    TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArchiveCc_pkey" PRIMARY KEY ("archiveId", "unitId")
);

CREATE INDEX "ArchiveCc_unitId_idx" ON "ArchiveCc" ("unitId");

ALTER TABLE "ArchiveCc"
  ADD CONSTRAINT "ArchiveCc_archiveId_fkey"
  FOREIGN KEY ("archiveId") REFERENCES "Archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArchiveCc"
  ADD CONSTRAINT "ArchiveCc_unitId_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
