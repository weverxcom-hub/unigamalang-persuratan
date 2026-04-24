export type Role = "SUPER_ADMIN" | "ADMIN_UNIT" | "USER";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  unitId: string | null;
  createdAt: string;
}

export interface Unit {
  id: string;
  code: string; // e.g. UNIGA, YAS
  name: string; // e.g. Rektorat Universitas Gajayana
  createdAt: string;
}

export interface LetterType {
  id: string;
  code: string; // e.g. SK, ST
  name: string; // e.g. Surat Keputusan
  createdAt: string;
}

export interface NumberingSequence {
  id: string; // `${unitId}:${letterTypeId}:${year}`
  unitId: string;
  letterTypeId: string;
  year: number;
  lastNumber: number;
}

export type ArchiveStatus = "DRAFT" | "PENDING" | "APPROVED" | "ISSUED";

export interface Archive {
  id: string;
  number: string; // e.g. 001/UNIGA/SK/IV/2026
  date: string; // ISO
  subject: string; // Perihal
  recipient: string; // Tujuan
  unitId: string;
  unitCode: string;
  letterTypeId: string;
  letterTypeCode: string;
  sequenceNumber: number;
  fileName: string | null; // mock file upload
  direction: "OUTGOING" | "INCOMING";
  status: ArchiveStatus;
  createdById: string;
  createdAt: string;
}

export interface DbShape {
  users: User[];
  units: Unit[];
  letterTypes: LetterType[];
  sequences: NumberingSequence[];
  archives: Archive[];
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  unitId: string | null;
}
