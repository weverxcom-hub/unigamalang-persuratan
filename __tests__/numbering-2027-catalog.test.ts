import { describe, expect, it } from "vitest";
import {
  exampleNumbers,
  LETTER_TYPES_2027,
  letterTypeCodeCandidates,
  TEMPLATE_2027,
  unitCodeCandidates,
  UNITS_2027,
} from "@/lib/numbering-2027/catalog";
import { UNIT_CODE_MAX, UNIT_CODE_PATTERN } from "@/lib/unit-code";

const codes = (list: { code: string }[]) => list.map((e) => e.code);

describe("2027 catalog", () => {
  it("has 40 units and 20 letter types with unique codes", () => {
    expect(UNITS_2027).toHaveLength(40);
    expect(LETTER_TYPES_2027).toHaveLength(20);
    expect(new Set(codes(UNITS_2027)).size).toBe(40);
    expect(new Set(codes(LETTER_TYPES_2027)).size).toBe(20);
  });
  it("gives every unit a valid code carrying the UNIGA element", () => {
    for (const u of UNITS_2027) {
      expect(u.code).toMatch(UNIT_CODE_PATTERN);
      expect(u.code.length).toBeLessThanOrEqual(UNIT_CODE_MAX);
      expect(u.code === "UNIGA" || u.code.startsWith("UNIGA.")).toBe(true);
    }
  });
  it("gives every letter type a code the letter-type API accepts", () => {
    for (const t of LETTER_TYPES_2027) expect(t.code).toMatch(/^[A-Z0-9.-]{1,10}$/);
  });
  it("never lets an alias collide with a code or another alias", () => {
    for (const list of [UNITS_2027, LETTER_TYPES_2027]) {
      const aliases = list.flatMap((e) => e.aliases);
      expect(new Set(aliases).size).toBe(aliases.length);
      for (const a of aliases) expect(codes(list)).not.toContain(a);
    }
  });
  it("aliases bare unit codes and the three renamed letter types", () => {
    const unit = (code: string) => UNITS_2027.find((u) => u.code === code)!;
    expect(unit("UNIGA").aliases).toEqual([]);
    expect(unit("UNIGA.WR1").aliases).toEqual(["WR1"]);
    expect(unit("UNIGA.FEB.MN").aliases).toEqual([]);
    expect(letterTypeCodeCandidates("SE")).toEqual(["SE", "EDAR"]);
    expect(letterTypeCodeCandidates("SU")).toEqual(["SU", "UND"]);
    expect(letterTypeCodeCandidates("SD")).toEqual(["SD", "UMUM"]);
    expect(letterTypeCodeCandidates("SK")).toEqual(["SK"]);
    expect(letterTypeCodeCandidates("XYZ")).toEqual(["XYZ"]);
  });
  it("renders example numbers from a template", () => {
    expect(exampleNumbers(TEMPLATE_2027, 2027)).toEqual([
      "12/UNIGA.WR1/ST/2027",
      "34/UNIGA/SK/2027",
      "112/UNIGA.FEB.MN/SKET/2027",
    ]);
  });
  it("recognises FE as today's code for the economics faculty", () => {
    // src/lib/legacy-import.ts files the faculty's legacy decrees under FE.
    expect(UNITS_2027.find((u) => u.code === "UNIGA.FEB")!.aliases).toEqual(["FEB", "FE"]);
  });
  it("resolves a legacy unit code to its 2027 code", () => {
    expect(unitCodeCandidates("FEB")).toEqual(["FEB", "UNIGA.FEB"]);
    expect(unitCodeCandidates("FE")).toEqual(["FE", "UNIGA.FEB"]);
    expect(unitCodeCandidates("UNIGA")).toEqual(["UNIGA"]);
    expect(unitCodeCandidates("YAS")).toEqual(["YAS"]);
  });
});
