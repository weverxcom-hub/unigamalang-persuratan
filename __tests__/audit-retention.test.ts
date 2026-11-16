import { expect, it } from "vitest";
import { auditCleanupWhere } from "@/lib/audit-retention";

it("never selects Arsip Lama history for deletion", () => {
  const cutoff = new Date("2024-11-16T00:00:00Z");
  expect(auditCleanupWhere(cutoff)).toEqual({
    createdAt: { lt: cutoff },
    targetType: { notIn: ["LegacyDecree"] },
  });
});
