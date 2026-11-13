import { describe, expect, it } from "vitest";
import { formatSequence, renderFormat, validateNumberTemplate } from "@/lib/format";

const NEW = "[SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]";
const OLD = "[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]";
const ctx = { sequence: 12, unitCode: "UNIGA.WR1", letterTypeCode: "ST", month: 1, year: 2027 };

describe("renderFormat", () => {
  it("renders the 2027 template without padding", () => {
    expect(renderFormat(NEW, ctx)).toBe("12/UNIGA.WR1/ST/2027");
  });
  it("renders the legacy template with the new unit code", () => {
    expect(renderFormat(OLD, ctx)).toBe("012/ST/UNIGA.WR1/I/2027");
  });
});

describe("formatSequence", () => {
  it("pads to three digits for [NO]", () => expect(formatSequence(OLD, 7)).toBe("007"));
  it("does not pad for [SEQ]", () => expect(formatSequence(NEW, 7)).toBe("7"));
  it("is case-insensitive", () => expect(formatSequence("[seq]/[unit]", 7)).toBe("7"));
  it("pads when the template has no sequence token", () => expect(formatSequence("X", 7)).toBe("007"));
  it("follows the first sequence token", () => expect(formatSequence("[SEQ]-[NO]", 7)).toBe("7"));
});

describe("validateNumberTemplate", () => {
  it("accepts the new and legacy templates", () => {
    expect(validateNumberTemplate(NEW)).toBeNull();
    expect(validateNumberTemplate(OLD)).toBeNull();
  });
  it("accepts short token aliases in any case", () => {
    expect(validateNumberTemplate("[no]/[unit]/[type]/[year]")).toBeNull();
  });
  it.each([
    ["[UNIT_CODE]/[TYPE_CODE]/[YEAR]", "nomor urut"],
    ["[SEQ]/[TYPE_CODE]/[YEAR]", "kode unit"],
    ["[SEQ]/[UNIT_CODE]/[YEAR]", "kode jenis"],
    ["[SEQ]/[UNIT_CODE]/[TYPE_CODE]", "tahun"],
  ])("rejects %s", (template, missing) => {
    expect(validateNumberTemplate(template)).toContain(missing);
  });
});
