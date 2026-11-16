import { expect, it, vi } from "vitest";
import { importLegacyDecrees } from "@/lib/legacy-import";

it("does not overwrite a row that was edited in the app", async () => {
  const update = vi.fn(async () => ({}));
  const prisma = {
    letterType: { findUnique: async () => ({ id: "sk" }), findFirst: async () => ({ id: "se" }) },
    unit: { findFirst: async () => ({ id: "unit" }) },
    legacyDecree: {
      findUnique: async ({ where }: { where: { noUrutAsli: number } }) =>
        ({ id: `r${where.noUrutAsli}`, editedAt: where.noUrutAsli === 1 ? new Date() : null }),
      update,
      create: vi.fn(),
      count: async () => 0,
    },
  };
  const result = await importLegacyDecrees(prisma as never);

  expect(result.keptEdited).toBe(1);
  expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { noUrutAsli: 1 } }));
  expect(result.updated + result.keptEdited + result.skipped).toBe(result.total);
});
