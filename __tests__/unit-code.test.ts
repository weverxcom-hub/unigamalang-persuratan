import { describe, expect, it } from "vitest";
import { unitCodeSchema, UNIT_CODE_MAX } from "@/lib/unit-code";
import { buildArchiveFilename } from "@/lib/archive-filename";

const ok = (code: string) => unitCodeSchema.safeParse(code).success;

describe("unitCodeSchema", () => {
  it.each(["UNIGA", "YAS", "P2K2", "UNIGA.WR1", "UNIGA.FISB.IKOM"])("accepts %s", (code) => {
    expect(ok(code)).toBe(true);
  });
  it.each(["A", "uniga", "UNIGA.", ".FEB", "UNIGA..FEB", "UNIGA FEB", "UNIGA/FEB", "UNIGA-FEB"])(
    "rejects %s",
    (code) => expect(ok(code)).toBe(false)
  );
  it("rejects codes longer than the maximum", () => {
    expect(UNIT_CODE_MAX).toBe(20);
    expect(ok("UNIGA." + "A".repeat(15))).toBe(false);
    expect(ok("UNIGA." + "A".repeat(14))).toBe(true);
  });
});

describe("buildArchiveFilename with a dotted unit code", () => {
  it("keeps the dots and replaces slashes", () => {
    const name = buildArchiveFilename({
      number: "12/UNIGA.WR1/ST/2027",
      subject: "Surat Tugas",
      originalFilename: "scan.pdf",
      mimeType: "application/pdf",
    });
    expect(name).toBe("12_UNIGA.WR1_ST_2027_Surat_Tugas.pdf");
  });
});
