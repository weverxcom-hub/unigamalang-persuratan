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
 * Record an audit log row.
 *
 * - Standalone (no `tx`): the call is best-effort and never throws — audit
 *   failures must not break the primary mutation path.
 * - Inside a transaction (`tx` provided): errors are re-thrown. Swallowing
 *   them is unsafe because a failed INSERT inside a Postgres transaction
 *   leaves it in an aborted state and the COMMIT will fail anyway, rolling
 *   back the primary mutation. Letting the error propagate makes Prisma's
 *   `$transaction` handle the rollback predictably.
 */
export async function audit(input: AuditInput, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  const data = {
    action: input.action,
    actorId: input.actorId ?? null,
    actorEmail: input.actorEmail ?? null,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    archiveId: input.archiveId ?? null,
    metadata: input.metadata ?? Prisma.JsonNull,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
  };
  if (tx) {
    await client.auditLog.create({ data });
    return;
  }
  try {
    await client.auditLog.create({ data });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit] failed to log", e);
  }
}

// Re-export Prisma for helper usage in routes.
export { Prisma };
