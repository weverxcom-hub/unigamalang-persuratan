-- DropIndex
DROP INDEX "NumberingSequence_unitId_year_key";

-- CreateTable
CREATE TABLE "LegacyDecree" (
    "id" TEXT NOT NULL,
    "noUrutAsli" INTEGER NOT NULL,
    "tanggal" TIMESTAMP(3),
    "tanggalRaw" TEXT NOT NULL,
    "nomor" TEXT NOT NULL,
    "perihal" TEXT NOT NULL,
    "letterTypeId" TEXT NOT NULL,
    "unitId" TEXT,
    "unitLabelRaw" TEXT NOT NULL,
    "sourceLink" TEXT,
    "catatan" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegacyDecree_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegacyDecree_noUrutAsli_key" ON "LegacyDecree"("noUrutAsli");

-- CreateIndex
CREATE INDEX "LegacyDecree_unitId_idx" ON "LegacyDecree"("unitId");

-- CreateIndex
CREATE INDEX "LegacyDecree_letterTypeId_idx" ON "LegacyDecree"("letterTypeId");

-- CreateIndex
CREATE INDEX "LegacyDecree_isComplete_idx" ON "LegacyDecree"("isComplete");

-- CreateIndex
CREATE INDEX "LegacyDecree_tanggal_idx" ON "LegacyDecree"("tanggal");

-- AddForeignKey
ALTER TABLE "LegacyDecree" ADD CONSTRAINT "LegacyDecree_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "LetterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyDecree" ADD CONSTRAINT "LegacyDecree_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
