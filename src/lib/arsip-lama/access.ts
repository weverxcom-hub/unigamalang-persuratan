import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/types";

// Pure access rules for the Arsip Lama (old-letter archive) module.
// No database access: every route applies these to rows it has loaded.

export type OldArchiveScope = {
  unitId: string | null;
  confidential: boolean;
  withdrawnAt: Date | null;
};

export function canViewOldArchive(s: SessionPayload, r: OldArchiveScope): boolean {
  if (s.role === "SUPER_ADMIN") return true;
  if (r.withdrawnAt || !r.unitId || !s.unitId || r.unitId !== s.unitId) return false;
  if (r.confidential) return s.role === "ADMIN_UNIT";
  return true;
}

export function canEditOldArchive(
  s: SessionPayload,
  r: { unitId: string | null; withdrawnAt: Date | null }
): boolean {
  if (r.withdrawnAt) return false;
  if (s.role === "SUPER_ADMIN") return true;
  return s.role === "ADMIN_UNIT" && !!s.unitId && r.unitId === s.unitId;
}

export function canCreateOldArchiveFor(s: SessionPayload, unitId: string): boolean {
  if (s.role === "SUPER_ADMIN") return true;
  return s.role === "ADMIN_UNIT" && !!s.unitId && s.unitId === unitId;
}

/** Publish, withdraw and BP3M import. */
export function canModerateOldArchive(s: SessionPayload): boolean {
  return s.role === "SUPER_ADMIN";
}

/** null means "no access at all". */
export function oldArchiveListWhere(
  s: SessionPayload,
  includeWithdrawn: boolean
): Prisma.LegacyDecreeWhereInput | null {
  if (s.role === "SUPER_ADMIN") return includeWithdrawn ? {} : { withdrawnAt: null };
  if (!s.unitId) return null;
  if (s.role === "ADMIN_UNIT") return { unitId: s.unitId, withdrawnAt: null };
  return { unitId: s.unitId, withdrawnAt: null, confidential: false };
}

export function publicLegacyWhere(skSeTypeIds: string[]): Prisma.LegacyDecreeWhereInput {
  return {
    isPublic: true,
    confidential: false,
    withdrawnAt: null,
    letterTypeId: { in: skSeTypeIds },
  };
}
