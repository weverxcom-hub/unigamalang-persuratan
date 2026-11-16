-- Arsip Lama: LegacyDecree dilebarkan (surat manual, fisik, rahasia, tarik)
-- dan tabel versi berkas LegacyDecreeFile. Aditif; tidak ada yang dihapus.

-- CreateEnum
CREATE TYPE "LegacySource" AS ENUM ('IMPORT_BP3M', 'MANUAL');

-- CreateEnum
CREATE TYPE "PhysicalKind" AS ENUM ('ASLI', 'SALINAN', 'TIDAK_ADA');

-- AlterTable
ALTER TABLE "LegacyDecree" ALTER COLUMN "noUrutAsli" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LegacyDecree"
  ADD COLUMN "source" "LegacySource" NOT NULL DEFAULT 'IMPORT_BP3M',
  ADD COLUMN "direction" "Direction" NOT NULL DEFAULT 'OUTGOING',
  ADD COLUMN "counterpart" TEXT,
  ADD COLUMN "physicalLocation" TEXT,
  ADD COLUMN "physicalKind" "PhysicalKind",
  ADD COLUMN "confidential" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "createdByEmail" TEXT,
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnById" TEXT,
  ADD COLUMN "withdrawnByEmail" TEXT,
  ADD COLUMN "withdrawnReason" TEXT;

-- CreateIndex
CREATE INDEX "LegacyDecree_withdrawnAt_idx" ON "LegacyDecree"("withdrawnAt");

-- CreateIndex
CREATE INDEX "LegacyDecree_confidential_idx" ON "LegacyDecree"("confidential");

-- CreateTable
CREATE TABLE "LegacyDecreeFile" (
    "id" TEXT NOT NULL,
    "decreeId" TEXT NOT NULL,
    "gdriveFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT,
    "uploadedByEmail" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedAt" TIMESTAMP(3),
    "replaceReason" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,

    CONSTRAINT "LegacyDecreeFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegacyDecreeFile_gdriveFileId_key" ON "LegacyDecreeFile"("gdriveFileId");

-- CreateIndex
CREATE INDEX "LegacyDecreeFile_decreeId_idx" ON "LegacyDecreeFile"("decreeId");

-- CreateIndex
CREATE INDEX "LegacyDecreeFile_sha256_idx" ON "LegacyDecreeFile"("sha256");

-- AddForeignKey
ALTER TABLE "LegacyDecreeFile" ADD CONSTRAINT "LegacyDecreeFile_decreeId_fkey" FOREIGN KEY ("decreeId") REFERENCES "LegacyDecree"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rows hidden from the public search were hidden because they concern
-- personnel/discipline; inside the app they become "rahasia".
UPDATE "LegacyDecree" SET "confidential" = true WHERE "isPublic" = false;
