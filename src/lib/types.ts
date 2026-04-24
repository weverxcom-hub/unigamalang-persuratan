// Application-layer types. The data model lives in Prisma (see
// prisma/schema.prisma) — these are the plain JSON shapes we send over the
// wire / render in the client (Prisma DateTime values serialised as ISO
// strings).

import type {
  Role as PrismaRole,
  Direction as PrismaDirection,
  ArchiveStatus as PrismaArchiveStatus,
  DispositionStatus as PrismaDispositionStatus,
  AuditAction as PrismaAuditAction,
} from "@prisma/client";

export type Role = PrismaRole;
export type Direction = PrismaDirection;
export type ArchiveStatus = PrismaArchiveStatus;
export type DispositionStatus = PrismaDispositionStatus;
export type AuditAction = PrismaAuditAction;

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  unitId: string | null;
  createdAt: string;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  formatTemplate: string;
  createdAt: string;
}

export interface LetterType {
  id: string;
  code: string;
  name: string;
  createdAt: string;
}

export interface Archive {
  id: string;
  number: string;
  date: string;
  subject: string;
  recipient: string;
  externalSender: string | null;
  unitId: string;
  unitCode: string;
  letterTypeId: string;
  letterTypeCode: string;
  sequenceNumber: number;
  fileName: string | null;
  fileUrl: string | null;
  fileDataUrl: string | null; // legacy
  direction: Direction;
  status: ArchiveStatus;
  createdById: string;
  createdAt: string;
  deletedAt: string | null;
}

/** List-view projection: no heavy binary data, just a `hasProof` flag. */
export type ArchiveListItem = Omit<Archive, "fileDataUrl"> & { hasProof: boolean };

export interface Disposition {
  id: string;
  archiveId: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string | null;
  toUserName: string | null;
  toUnitId: string | null;
  toUnitName: string | null;
  instructions: string;
  dueDate: string | null;
  status: DispositionStatus;
  note: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorId: string | null;
  actorEmail: string | null;
  targetType: string;
  targetId: string | null;
  archiveId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  unitId: string | null;
}
