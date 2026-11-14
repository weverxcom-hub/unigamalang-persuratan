import { describe, expect, it } from "vitest";
import { ccReadableWhere, normaliseCcUnitIds } from "@/lib/cc";

describe("normaliseCcUnitIds", () => {
  it("dedupes, trims, and drops the issuing unit and blanks", () => {
    expect(normaliseCcUnitIds(["a", " a ", "b", "", "issuer"], "issuer")).toEqual(["a", "b"]);
  });
  it("handles null/undefined", () => {
    expect(normaliseCcUnitIds(undefined, "x")).toEqual([]);
    expect(normaliseCcUnitIds(null, "x")).toEqual([]);
  });
});

describe("ccReadableWhere", () => {
  it("only exposes ISSUED archives addressed to the unit", () => {
    expect(ccReadableWhere("u1")).toEqual({
      status: "ISSUED",
      ccUnits: { some: { unitId: "u1" } },
    });
  });
});
