import type { Archive as PrismaArchive } from "@prisma/client";
import type { Archive, ArchiveListItem } from "@/lib/types";

export function serialiseArchive(a: PrismaArchive): Archive {
  return {
    id: a.id,
    number: a.number,
    date: a.date.toISOString(),
    subject: a.subject,
    recipient: a.recipient,
    externalSender: a.externalSender,
    unitId: a.unitId,
    unitCode: a.unitCode,
    letterTypeId: a.letterTypeId,
    letterTypeCode: a.letterTypeCode,
    sequenceNumber: a.sequenceNumber,
    fileName: a.fileName,
    fileUrl: a.fileUrl,
    fileDataUrl: a.fileDataUrl,
    direction: a.direction,
    status: a.status,
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
  };
}

export function serialiseArchiveList(a: PrismaArchive): ArchiveListItem {
  const hasProof = !!(a.fileUrl || a.fileDataUrl);
  // Return via (fileDataUrl omit) pattern
  return {
    id: a.id,
    number: a.number,
    date: a.date.toISOString(),
    subject: a.subject,
    recipient: a.recipient,
    externalSender: a.externalSender,
    unitId: a.unitId,
    unitCode: a.unitCode,
    letterTypeId: a.letterTypeId,
    letterTypeCode: a.letterTypeCode,
    sequenceNumber: a.sequenceNumber,
    fileName: a.fileName,
    fileUrl: a.fileUrl,
    direction: a.direction,
    status: a.status,
    createdById: a.createdById,
    createdAt: a.createdAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    hasProof,
  };
}
