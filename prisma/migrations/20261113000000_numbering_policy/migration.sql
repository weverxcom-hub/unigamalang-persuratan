-- CreateTable
CREATE TABLE "NumberingPolicy" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "template" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedByEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NumberingPolicy_pkey" PRIMARY KEY ("id")
);

