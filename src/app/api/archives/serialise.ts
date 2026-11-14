import type { Archive as PrismaArchive } from "@prisma/client";
import type { Archive, ArchiveListItem } from "@/lib/types";

/** Prisma archive, optionally loaded with `include: ccInclude`. */
export type ArchiveWithCc = PrismaArchive & {
  ccUnits?: { unit: { id: string; code: string; name: string } }[];
};

/** Pass as `include` wherever an archive is serialised so CC units are returned. */
export const ccInclude = {
  ccUnits: {
    select: { unit: { select: { id: true, code: true, name: true } } },
    orderBy: { unit: { code: "asc" } },
  },
} as const;

function serialiseCc(a: ArchiveWithCc) {
  return (a.ccUnits ?? []).map((c) => c.unit);
}

export function serialiseArchive(a: ArchiveWithCc): Archive {
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
    voidReason: a.voidReason,
    voidedAt: a.voidedAt ? a.voidedAt.toISOString() : null,
    voidedById: a.voidedById,
    overdueMarkedAt: a.overdueMarkedAt ? a.overdueMarkedAt.toISOString() : null,
    isInsert: a.isInsert,
    insertReason: a.insertReason,
    ccUnits: serialiseCc(a),
  };
}

export function serialiseArchiveList(a: ArchiveWithCc): ArchiveListItem {
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
    voidReason: a.voidReason,
    voidedAt: a.voidedAt ? a.voidedAt.toISOString() : null,
    voidedById: a.voidedById,
    overdueMarkedAt: a.overdueMarkedAt ? a.overdueMarkedAt.toISOString() : null,
    isInsert: a.isInsert,
    insertReason: a.insertReason,
    ccUnits: serialiseCc(a),
    hasProof,
  };
}
