import { describe, expect, it } from "vitest";
import { TEMPLATE_2027 } from "@/lib/numbering-2027/catalog";
import { planApply, type ExistingRow } from "@/lib/numbering-2027/plan";

const LEGACY = "[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]";
const unit = (id: string, code: string, name: string, extra: Partial<ExistingRow> = {}): ExistingRow => ({
  id,
  code,
  name,
  deletedAt: null,
  formatTemplate: LEGACY,
  ...extra,
});
const type = (id: string, code: string, name: string, extra: Partial<ExistingRow> = {}): ExistingRow => ({
  id,
  code,
  name,
  deletedAt: null,
  ...extra,
});
const plan = (units: ExistingRow[], letterTypes: ExistingRow[]) =>
  planApply({ units, letterTypes, template: TEMPLATE_2027 });
const step = <T extends { code: string }>(steps: T[], code: string) => steps.find((s) => s.code === code)!;

describe("planApply", () => {
  it("creates everything on an empty database", () => {
    const p = plan([], []);
    expect(p.units.filter((s) => s.action === "create")).toHaveLength(40);
    expect(p.letterTypes.filter((s) => s.action === "create")).toHaveLength(20);
    expect(p.untouchedUnits).toEqual([]);
    expect(p.template).toBe(TEMPLATE_2027);
  });

  it("updates the template of an exact match and keeps its name", () => {
    const p = plan([unit("u1", "UNIGA", "Rektorat Universitas Gajayana")], []);
    expect(step(p.units, "UNIGA")).toEqual({
      action: "update",
      code: "UNIGA",
      name: "Rektorat Universitas Gajayana",
      id: "u1",
    });
  });

  it("renames an alias match to the catalog code and name", () => {
    const p = plan(
      [unit("u2", "FEB", "FEB lama")],
      [type("t1", "UND", "Surat Undangan"), type("t2", "UMUM", "Umum")]
    );
    expect(step(p.units, "UNIGA.FEB")).toEqual({
      action: "update",
      code: "UNIGA.FEB",
      name: "Fakultas Ekonomi dan Bisnis",
      id: "u2",
      fromCode: "FEB",
    });
    expect(step(p.letterTypes, "SU")).toMatchObject({ action: "update", id: "t1", fromCode: "UND" });
    expect(step(p.letterTypes, "SD")).toMatchObject({
      action: "update",
      id: "t2",
      fromCode: "UMUM",
      name: "Surat Dinas",
    });
  });

  it("leaves rows outside the catalog untouched and lists them", () => {
    const p = plan(
      [unit("u3", "YAS", "Yayasan Gajayana Malang"), unit("u4", "FH", "Fakultas Hukum")],
      [type("t3", "MOU", "Nota Kesepahaman")]
    );
    expect(p.untouchedUnits).toEqual([
      { id: "u3", code: "YAS", name: "Yayasan Gajayana Malang" },
      { id: "u4", code: "FH", name: "Fakultas Hukum" },
    ]);
    expect(p.untouchedLetterTypes).toEqual([{ id: "t3", code: "MOU", name: "Nota Kesepahaman" }]);
    expect(p.units.some((s) => s.id === "u3" || s.id === "u4")).toBe(false);
  });

  it("prefers the exact code over an alias and leaves the alias row alone", () => {
    const p = plan([unit("u5", "FEB", "FEB lama"), unit("u6", "UNIGA.FEB", "FEB baru")], []);
    expect(step(p.units, "UNIGA.FEB").id).toBe("u6");
    expect(p.untouchedUnits).toEqual([{ id: "u5", code: "FEB", name: "FEB lama" }]);
  });

  it("reactivates a deactivated row that holds a target code", () => {
    const p = plan(
      [unit("u7", "UNIGA.WR1", "WR I", { deletedAt: new Date("2026-01-01"), formatTemplate: TEMPLATE_2027 })],
      []
    );
    expect(step(p.units, "UNIGA.WR1")).toEqual({
      action: "update",
      code: "UNIGA.WR1",
      name: "WR I",
      id: "u7",
      reactivate: true,
    });
  });

  it("does not list deactivated unmatched rows as untouched", () => {
    const p = plan([unit("u8", "FH", "Fakultas Hukum", { deletedAt: new Date("2026-01-01") })], []);
    expect(p.untouchedUnits).toEqual([]);
  });

  it("reports unchanged when the database already matches", () => {
    const p = plan(
      [unit("u9", "UNIGA.BAU", "BAU", { formatTemplate: TEMPLATE_2027 })],
      [type("t4", "SK", "Surat Keputusan")]
    );
    expect(step(p.units, "UNIGA.BAU")).toEqual({ action: "unchanged", code: "UNIGA.BAU", name: "BAU", id: "u9" });
    expect(step(p.letterTypes, "SK")).toEqual({
      action: "unchanged",
      code: "SK",
      name: "Surat Keputusan",
      id: "t4",
    });
  });
});
