import type { Prisma } from "@prisma/client";

/**
 * Audit targetType values whose history is kept forever: the weekly
 * cleanup-audit cron never deletes these rows, regardless of age.
 */
export const PERMANENT_AUDIT_TARGETS = ["LegacyDecree"] as const;

/**
 * Where-clause for the audit-log cleanup: rows older than `cutoff`, excluding
 * permanently retained targets.
 */
export function auditCleanupWhere(cutoff: Date): Prisma.AuditLogWhereInput {
  return {
    createdAt: { lt: cutoff },
    targetType: { notIn: [...PERMANENT_AUDIT_TARGETS] },
  };
}
