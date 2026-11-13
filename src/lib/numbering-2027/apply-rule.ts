import type { Prisma, PrismaClient } from "@prisma/client";
import { audit } from "@/lib/audit";
import { executePlan, prismaApplyOps, type ApplySummary } from "./apply";
import { planApply, type ApplyPlan, type ExistingRow } from "./plan";

export const POLICY_ID = 1;

type Db = Prisma.TransactionClient | PrismaClient;

export async function loadExisting(db: Db): Promise<{ units: ExistingRow[]; letterTypes: ExistingRow[] }> {
  const [units, letterTypes] = await Promise.all([
    db.unit.findMany({
      select: { id: true, code: true, name: true, deletedAt: true, formatTemplate: true },
      orderBy: { code: "asc" },
    }),
    db.letterType.findMany({
      select: { id: true, code: true, name: true, deletedAt: true },
      orderBy: { code: "asc" },
    }),
  ]);
  return { units, letterTypes };
}

/**
 * Apply the 2027 numbering rule with `template` in one transaction: plan,
 * execute, record the NumberingPolicy row, audit. Shared by
 * POST /api/numbering/policy and the demo seed. The caller validates the
 * template first.
 */
export async function applyNumberingRule(
  db: PrismaClient,
  template: string,
  actor: { userId: string | null; email: string | null }
): Promise<{
  policy: { template: string; appliedAt: Date; appliedByEmail: string | null };
  summary: ApplySummary;
  plan: ApplyPlan;
}> {
  return db.$transaction(
    async (tx) => {
      const plan = planApply({ ...(await loadExisting(tx)), template });
      const summary = await executePlan(plan, prismaApplyOps(tx));
      const applied = { template, appliedAt: new Date(), appliedByEmail: actor.email };
      const policy = await tx.numberingPolicy.upsert({
        where: { id: POLICY_ID },
        create: { id: POLICY_ID, ...applied },
        update: applied,
      });
      await audit(
        {
          action: "UPDATE",
          actorId: actor.userId,
          actorEmail: actor.email,
          targetType: "NumberingPolicy",
          targetId: String(POLICY_ID),
          metadata: {
            template,
            summary: { ...summary },
            untouchedUnits: plan.untouchedUnits.map((u) => u.code),
            untouchedLetterTypes: plan.untouchedLetterTypes.map((t) => t.code),
          },
        },
        tx
      );
      return { policy, summary, plan };
    },
    // Up to ~60 sequential writes over a pooled connection; the 5 s
    // default is too tight.
    { maxWait: 10_000, timeout: 30_000 }
  );
}
