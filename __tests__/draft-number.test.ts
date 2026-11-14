import { describe, expect, it } from "vitest";
import { draftPlaceholderNumber, isDraftPlaceholderNumber } from "@/lib/draft-number";

describe("draftPlaceholderNumber", () => {
  it("looks like DRAF-XXXXXXXXXXXX", () => {
    expect(draftPlaceholderNumber()).toMatch(/^DRAF-[0-9A-F]{12}$/);
  });
  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => draftPlaceholderNumber()));
    expect(seen.size).toBe(2000);
  });
});

describe("isDraftPlaceholderNumber", () => {
  it("recognises a placeholder", () => {
    expect(isDraftPlaceholderNumber(draftPlaceholderNumber())).toBe(true);
  });
  it("rejects real letter numbers in both formats", () => {
    expect(isDraftPlaceholderNumber("001/ST/UNIGA/XI/2026")).toBe(false);
    expect(isDraftPlaceholderNumber("12/UNIGA.WR1/ST/2027")).toBe(false);
  });
});
