import { describe, expect, it } from "vitest";
import { changedFields, oldArchiveInput, resolveTanggalRaw } from "@/lib/arsip-lama/input";

const base = {
  letterTypeId: "lt",
  unitId: "feb",
  direction: "OUTGOING",
  nomor: "",
  tanggal: null,
  tanggalRaw: "",
  perihal: "Undangan rapat senat",
  counterpart: null,
  physicalLocation: null,
  physicalKind: "ASLI",
  confidential: false,
  catatan: null,
};

describe("oldArchiveInput", () => {
  it("accepts a letter with no number and no date", () => {
    expect(oldArchiveInput.safeParse(base).success).toBe(true);
  });

  it("trims text", () => {
    const r = oldArchiveInput.parse({
      ...base,
      nomor: "  001/SK/UNIGA/I/1998 ",
      perihal: "  Pengangkatan dosen  ",
    });
    expect(r.nomor).toBe("001/SK/UNIGA/I/1998");
    expect(r.perihal).toBe("Pengangkatan dosen");
  });

  it("rejects a future date and a malformed one", () => {
    expect(oldArchiveInput.safeParse({ ...base, tanggal: "2999-01-01" }).success).toBe(false);
    expect(oldArchiveInput.safeParse({ ...base, tanggal: "14/03/1998" }).success).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    expect(oldArchiveInput.safeParse({ ...base, tanggal: "1998-02-31" }).success).toBe(false);
  });

  it("rejects a perihal shorter than 3 characters", () => {
    expect(oldArchiveInput.safeParse({ ...base, perihal: " a " }).success).toBe(false);
  });
});

describe("resolveTanggalRaw", () => {
  it("resolves tanggalRaw", () => {
    expect(resolveTanggalRaw("2026-06-07", "")).toBe("7 Juni 2026");
    expect(resolveTanggalRaw("2026-06-07", "awal Juni 2026")).toBe("awal Juni 2026");
    expect(resolveTanggalRaw(null, "")).toBe("Tidak diketahui");
  });
});

describe("changedFields", () => {
  it("reports only fields that changed", () => {
    expect(changedFields({ nomor: "1", perihal: "x" }, { nomor: "2", perihal: "x" })).toEqual({
      nomor: { before: "1", after: "2" },
    });
  });

  it("compares dates by ISO string", () => {
    const a = new Date("1998-03-14");
    expect(changedFields({ tanggal: a }, { tanggal: new Date("1998-03-14") })).toEqual({});
  });
});
