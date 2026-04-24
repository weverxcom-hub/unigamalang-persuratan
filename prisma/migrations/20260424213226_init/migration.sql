-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN_UNIT', 'USER');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('OUTGOING', 'INCOMING');

-- CreateEnum
CREATE TYPE "ArchiveStatus" AS ENUM ('DRAFT', 'PENDING', 'PENDING_PROOF', 'APPROVED', 'ISSUED');

-- CreateEnum
CREATE TYPE "DispositionStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'UPLOAD', 'DELETE', 'RESTORE', 'LOGIN', 'LOGIN_FAILED', 'DISPOSITION_CREATE', 'DISPOSITION_UPDATE');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "unitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "formatTemplate" TEXT NOT NULL DEFAULT '[NO]/[UNIT_CODE]/[TYPE_CODE]/[ROMAN_MONTH]/[YEAR]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberingSequence" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NumberingSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Archive" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "externalSender" TEXT,
    "direction" "Direction" NOT NULL DEFAULT 'OUTGOING',
    "status" "ArchiveStatus" NOT NULL DEFAULT 'PENDING_PROOF',
    "unitId" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "letterTypeId" TEXT NOT NULL,
    "letterTypeCode" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL DEFAULT 0,
    "fileUrl" TEXT,
    "blobPathname" TEXT,
    "fileName" TEXT,
    "fileDataUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Archive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disposition" (
    "id" TEXT NOT NULL,
    "archiveId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT,
    "toUnitId" TEXT,
    "instructions" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" "DispositionStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Disposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "archiveId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "archiveId" TEXT,
    "targetUrl" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "responseStatus" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_unitId_idx" ON "User"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "LetterType_code_key" ON "LetterType"("code");

-- CreateIndex
CREATE INDEX "NumberingSequence_unitId_year_idx" ON "NumberingSequence"("unitId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "NumberingSequence_unitId_year_key" ON "NumberingSequence"("unitId", "year");

-- CreateIndex
CREATE INDEX "Archive_unitId_idx" ON "Archive"("unitId");

-- CreateIndex
CREATE INDEX "Archive_letterTypeId_idx" ON "Archive"("letterTypeId");

-- CreateIndex
CREATE INDEX "Archive_createdById_idx" ON "Archive"("createdById");

-- CreateIndex
CREATE INDEX "Archive_deletedAt_idx" ON "Archive"("deletedAt");

-- CreateIndex
CREATE INDEX "Archive_direction_idx" ON "Archive"("direction");

-- CreateIndex
CREATE INDEX "Archive_status_idx" ON "Archive"("status");

-- CreateIndex
CREATE INDEX "Archive_date_idx" ON "Archive"("date");

-- CreateIndex
CREATE INDEX "Archive_number_idx" ON "Archive"("number");

-- CreateIndex
CREATE INDEX "Disposition_archiveId_idx" ON "Disposition"("archiveId");

-- CreateIndex
CREATE INDEX "Disposition_toUserId_idx" ON "Disposition"("toUserId");

-- CreateIndex
CREATE INDEX "Disposition_toUnitId_idx" ON "Disposition"("toUnitId");

-- CreateIndex
CREATE INDEX "Disposition_status_idx" ON "Disposition"("status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_archiveId_idx" ON "AuditLog"("archiveId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_idx" ON "WebhookDelivery"("status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_archiveId_idx" ON "WebhookDelivery"("archiveId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NumberingSequence" ADD CONSTRAINT "NumberingSequence_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Archive" ADD CONSTRAINT "Archive_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Archive" ADD CONSTRAINT "Archive_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "LetterType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Archive" ADD CONSTRAINT "Archive_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disposition" ADD CONSTRAINT "Disposition_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "Archive"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disposition" ADD CONSTRAINT "Disposition_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disposition" ADD CONSTRAINT "Disposition_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disposition" ADD CONSTRAINT "Disposition_toUnitId_fkey" FOREIGN KEY ("toUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_archiveId_fkey" FOREIGN KEY ("archiveId") REFERENCES "Archive"("id") ON DELETE SET NULL ON UPDATE CASCADE;
