import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import type { AuditAction } from "@prisma/client";

export interface AuditInput {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  targetType: string;
  targetId?: string | null;
  archiveId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Record an audit log row. Never throws — audit failures should not break the
 * primary mutation path. Pass a TransactionClient to enroll in an outer
 * transaction so the log and the change commit together.
 */
export async function audit(input: AuditInput, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        actorEmail: input.actorEmail ?? null,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        archiveId: input.archiveId ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to log", e);
  }
}

// Re-export Prisma for helper usage in routes.
export { Prisma };
