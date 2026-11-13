import type { Prisma } from "@prisma/client";
import type { ApplyPlan, PlanStep } from "./plan";

/**
 * The four writes applying a plan needs. Kept as an interface so the
 * executor can be tested against an in-memory store; production uses
 * `prismaApplyOps` inside one transaction.
 */
export interface ApplyOps {
  createUnit(data: { code: string; name: string; formatTemplate: string }): Promise<void>;
  /** Sets code, name, template and clears deletedAt. */
  updateUnit(id: string, data: { code: string; name: string; formatTemplate: string }): Promise<void>;
  createLetterType(data: { code: string; name: string }): Promise<void>;
  /** Sets code, name and clears deletedAt. */
  updateLetterType(id: string, data: { code: string; name: string }): Promise<void>;
}

export interface ApplySummary {
  unitsCreated: number;
  unitsUpdated: number;
  letterTypesCreated: number;
  letterTypesUpdated: number;
}

async function runSteps(
  steps: PlanStep[],
  create: (step: PlanStep) => Promise<void>,
  update: (id: string, step: PlanStep) => Promise<void>
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  // Sequential on purpose: these run inside one interactive transaction,
  // which is a single connection.
  for (const step of steps) {
    if (step.action === "create") {
      await create(step);
      created++;
    } else if (step.action === "update" && step.id) {
      await update(step.id, step);
      updated++;
    }
  }
  return { created, updated };
}

export async function executePlan(plan: ApplyPlan, ops: ApplyOps): Promise<ApplySummary> {
  const formatTemplate = plan.template;
  const units = await runSteps(
    plan.units,
    ({ code, name }) => ops.createUnit({ code, name, formatTemplate }),
    (id, { code, name }) => ops.updateUnit(id, { code, name, formatTemplate })
  );
  const letterTypes = await runSteps(
    plan.letterTypes,
    ({ code, name }) => ops.createLetterType({ code, name }),
    (id, { code, name }) => ops.updateLetterType(id, { code, name })
  );
  return {
    unitsCreated: units.created,
    unitsUpdated: units.updated,
    letterTypesCreated: letterTypes.created,
    letterTypesUpdated: letterTypes.updated,
  };
}

export function prismaApplyOps(tx: Prisma.TransactionClient): ApplyOps {
  return {
    async createUnit(data) {
      await tx.unit.create({ data });
    },
    async updateUnit(id, data) {
      await tx.unit.update({ where: { id }, data: { ...data, deletedAt: null } });
    },
    async createLetterType(data) {
      // New letter types take the schema default scope (GLOBAL).
      await tx.letterType.create({ data });
    },
    async updateLetterType(id, data) {
      await tx.letterType.update({ where: { id }, data: { ...data, deletedAt: null } });
    },
  };
}
