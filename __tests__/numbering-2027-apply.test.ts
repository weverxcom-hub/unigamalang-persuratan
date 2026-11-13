import { describe, expect, it } from "vitest";
import { executePlan, type ApplyOps } from "@/lib/numbering-2027/apply";
import { TEMPLATE_2027 } from "@/lib/numbering-2027/catalog";
import { planApply, type ExistingRow } from "@/lib/numbering-2027/plan";

const LEGACY = "[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]";

// In-memory stand-in for the database, so the real planner and executor run
// together: plan -> execute -> plan again.
function memoryStore(units: ExistingRow[], letterTypes: ExistingRow[]) {
  let n = 0;
  const calls: string[] = [];
  const ops: ApplyOps = {
    async createUnit(d) {
      calls.push(`createUnit ${d.code}`);
      units.push({ id: `new-${++n}`, deletedAt: null, ...d });
    },
    async updateUnit(id, d) {
      calls.push(`updateUnit ${d.code}`);
      Object.assign(units.find((u) => u.id === id)!, d, { deletedAt: null });
    },
    async createLetterType(d) {
      calls.push(`createLetterType ${d.code}`);
      letterTypes.push({ id: `new-${++n}`, deletedAt: null, ...d });
    },
    async updateLetterType(id, d) {
      calls.push(`updateLetterType ${d.code}`);
      Object.assign(letterTypes.find((t) => t.id === id)!, d, { deletedAt: null });
    },
  };
  return { ops, calls };
}

const seedLike = () => ({
  units: [
    { id: "u1", code: "UNIGA", name: "Rektorat Universitas Gajayana", deletedAt: null, formatTemplate: LEGACY },
    { id: "u2", code: "YAS", name: "Yayasan Gajayana Malang", deletedAt: null, formatTemplate: LEGACY },
    { id: "u3", code: "FEB", name: "FEB", deletedAt: new Date("2026-01-01"), formatTemplate: LEGACY },
  ] as ExistingRow[],
  letterTypes: [
    { id: "t1", code: "SK", name: "Surat Keputusan", deletedAt: null },
    { id: "t2", code: "EDAR", name: "Surat Edaran", deletedAt: null },
  ] as ExistingRow[],
});

describe("executePlan", () => {
  it("applies the plan and counts what it did", async () => {
    const db = seedLike();
    const { ops } = memoryStore(db.units, db.letterTypes);
    const summary = await executePlan(planApply({ ...db, template: TEMPLATE_2027 }), ops);
    expect(summary).toEqual({
      unitsCreated: 38,
      unitsUpdated: 2,
      letterTypesCreated: 18,
      letterTypesUpdated: 1,
    });
    expect(db.units.find((u) => u.id === "u1")).toMatchObject({
      code: "UNIGA",
      name: "Rektorat Universitas Gajayana",
      formatTemplate: TEMPLATE_2027,
    });
    expect(db.units.find((u) => u.id === "u3")).toMatchObject({
      code: "UNIGA.FEB",
      deletedAt: null,
      formatTemplate: TEMPLATE_2027,
    });
    expect(db.letterTypes.find((t) => t.id === "t2")).toMatchObject({ code: "SE", name: "Surat Edaran" });
  });

  it("never touches a row outside the catalog", async () => {
    const db = seedLike();
    const { ops } = memoryStore(db.units, db.letterTypes);
    await executePlan(planApply({ ...db, template: TEMPLATE_2027 }), ops);
    expect(db.units.find((u) => u.id === "u2")).toEqual({
      id: "u2",
      code: "YAS",
      name: "Yayasan Gajayana Malang",
      deletedAt: null,
      formatTemplate: LEGACY,
    });
  });

  it("changes nothing when applied a second time", async () => {
    const db = seedLike();
    const first = memoryStore(db.units, db.letterTypes);
    await executePlan(planApply({ ...db, template: TEMPLATE_2027 }), first.ops);
    const second = memoryStore(db.units, db.letterTypes);
    const summary = await executePlan(planApply({ ...db, template: TEMPLATE_2027 }), second.ops);
    expect(second.calls).toEqual([]);
    expect(summary).toEqual({
      unitsCreated: 0,
      unitsUpdated: 0,
      letterTypesCreated: 0,
      letterTypesUpdated: 0,
    });
  });
});
