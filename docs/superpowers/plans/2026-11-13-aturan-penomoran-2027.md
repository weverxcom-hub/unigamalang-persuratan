# Aturan Penomoran 2027 (tahap 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Super admin can preview and apply the 2027 numbering rule (40 `UNIGA.*` unit codes, 20 letter type codes, one template) from inside the app, and until they do nothing about production behaviour changes.

**Architecture:** The app already renders numbers from a per-unit template and counts per (unit, letter type, year), so the new rule is data. A catalog module holds the target data, a pure planner diffs it against the database, a thin executor applies the diff in one transaction, and a Super admin page drives it. Three places that assume the old format (unit code validation, form preview padding, hard-coded `EDAR`) are loosened.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma 6 (Postgres), zod, Vitest (`__tests__/**/*.test.ts`, node environment), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-13-aturan-penomoran-2027-design.md`

## Global Constraints

- No new dependencies.
- Schema changes are additive only: one new table `NumberingPolicy`. No existing column is altered or dropped.
- No local database: never run `npm run build`, `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push`. Verify with `npx vitest run`, `npx tsc --noEmit`, `npx next lint`, `npx prisma validate`.
- UI copy is Indonesian.
- Default template, verbatim: `[SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]`.
- Unit codes: capital letters, digits, dot-separated levels, 2 to 20 characters.
- Rows not in the catalog (e.g. `YAS`) are never modified.
- UI components have no test harness in this repo; their logic lives in tested `src/lib` functions and the components are verified by `tsc` and `next lint`.

## Review Focus

- A template without a letter type token would make two letter types of one unit produce the same number: the apply request must be rejected (Task 1 test, Task 4 route).
- A unit that is not in the catalog but has users (Yayasan `YAS`) must stay exactly as it is and appear in the "tidak disentuh" list (Task 3 test).
- Pressing "Terapkan" a second time must change nothing (Task 4 test).
- A deactivated unit that already holds a target code must be reactivated, not collide on the unique code (Task 3 test).
- A number containing a dotted unit code must still produce a valid Drive file name (Task 2 test).

---

### Task 1: Template helpers and form preview

**Files:**
- Modify: `src/lib/format.ts`
- Modify: `src/app/dashboard/generate/generate-form.tsx` (lines 18, 205, 630, 645, 647: every `pad3(...)` call)
- Test: `__tests__/format.test.ts`

**Interfaces:**
- Produces: `formatSequence(template: string, sequence: number): string`; `validateNumberTemplate(template: string): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/format.test.ts`
Expected: FAIL, `formatSequence` and `validateNumberTemplate` are not exported. (The two `renderFormat` cases describe existing behaviour and pass once the file imports resolve.)

- [ ] **Step 3: Implement both functions in `src/lib/format.ts`**

`formatSequence` reuses the first-token match already in `splitTemplate` (`/\[NO\]|\[SEQ\]/i`). `validateNumberTemplate` returns the first missing part as `Template harus memuat <bagian> (<token>)` with parts, in this order: `nomor urut ([NO] atau [SEQ])`, `kode unit ([UNIT_CODE])`, `kode jenis ([TYPE_CODE])`, `tahun ([YEAR])`.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/format.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Use `formatSequence` in the form**

In `generate-form.tsx` replace each `pad3(x)` with `formatSequence(selectedUnit?.formatTemplate ?? "", x)` and swap the `pad3` import for `formatSequence` (drop the `pad3` import if unused).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add __tests__/format.test.ts src/lib/format.ts src/app/dashboard/generate/generate-form.tsx
git commit -m "feat(numbering): template validation and template-aware sequence preview"
```

---

### Task 2: Dotted unit codes

**Files:**
- Create: `src/lib/unit-code.ts`
- Modify: `src/app/api/units/route.ts` (the `code` field of `schema`), `src/app/api/units/[id]/route.ts` (the `code` field of `patchSchema`)
- Test: `__tests__/unit-code.test.ts`

**Interfaces:**
- Produces: `UNIT_CODE_MAX = 20`; `UNIT_CODE_PATTERN: RegExp`; `unitCodeSchema: z.ZodString`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

Check `buildArchiveFilename`'s parameter names against `src/lib/archive-filename.ts` before running and adjust the call, not the expectation.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/unit-code.test.ts`
Expected: FAIL, cannot resolve `@/lib/unit-code`.

- [ ] **Step 3: Implement `src/lib/unit-code.ts`**

Pattern `/^[A-Z0-9]+(\.[A-Z0-9]+)*$/`, min 2 (`Kode minimal 2 karakter`), max 20 (`Kode maksimal 20 karakter`), regex message `Kode harus huruf kapital/angka, jenjang dipisah titik (mis. UNIGA, UNIGA.FEB.MN)`.

- [ ] **Step 4: Use it in both unit routes**

`code: unitCodeSchema` in `route.ts`, `code: unitCodeSchema.optional()` in `[id]/route.ts`.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run __tests__/unit-code.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. If the file-name expectation fails because of how the helper joins parts, that is a finding about the helper: rule on it in the ledger.

- [ ] **Step 6: Commit**

```bash
git add __tests__/unit-code.test.ts src/lib/unit-code.ts src/app/api/units
git commit -m "feat(units): allow dot-separated unit codes up to 20 characters"
```

---

### Task 3: Catalog and planner

**Files:**
- Create: `src/lib/numbering-2027/catalog.ts`, `src/lib/numbering-2027/plan.ts`
- Test: `__tests__/numbering-2027-catalog.test.ts`, `__tests__/numbering-2027-plan.test.ts`

**Interfaces:**
- Consumes: `UNIT_CODE_PATTERN`, `UNIT_CODE_MAX` (Task 2); `renderFormat` (existing).
- Produces:

```ts
// catalog.ts
export interface CatalogEntry { code: string; name: string; aliases: string[] }
export const TEMPLATE_2027 = "[SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]";
export const UNITS_2027: CatalogEntry[];        // 40
export const LETTER_TYPES_2027: CatalogEntry[]; // 20
export function letterTypeCodeCandidates(code: string): string[]; // "SE" -> ["SE","EDAR"]; unknown -> [code]
export function exampleNumbers(template: string, year: number): string[];

// plan.ts
export interface ExistingRow { id: string; code: string; name: string; deletedAt: Date | null; formatTemplate?: string }
export interface PlanStep {
  action: "create" | "update" | "unchanged";
  code: string;        // code after the step
  name: string;        // name after the step
  id?: string;         // existing row (update, unchanged)
  fromCode?: string;   // existing code when it differs from `code`
  reactivate?: boolean;
}
export interface ApplyPlan {
  template: string;
  units: PlanStep[];
  letterTypes: PlanStep[];
  untouchedUnits: { id: string; code: string; name: string }[];
  untouchedLetterTypes: { id: string; code: string; name: string }[];
}
export function planApply(input: { units: ExistingRow[]; letterTypes: ExistingRow[]; template: string }): ApplyPlan;
```

Catalog data:

Units (code, name), in this order. Aliases: the code without the `UNIGA.` prefix when what remains has no dot; none otherwise (so `UNIGA` and the dotted prodi/UPM codes have no alias).

```
UNIGA            Rektor
UNIGA.WR1        Wakil Rektor I
UNIGA.WR2        Wakil Rektor II
UNIGA.BAU        Biro Administrasi Umum
UNIGA.BAA        Biro Administrasi Akademik
UNIGA.LPPM       Lembaga Penelitian dan Pengabdian kepada Masyarakat
UNIGA.BP3M       Badan Pengembangan Pendidikan dan Penjaminan Mutu
UNIGA.PPS        Pascasarjana
UNIGA.PPS.DIM    Program Studi Doktor Ilmu Manajemen
UNIGA.PPS.MM     Program Studi Magister Manajemen
UNIGA.PPS.MAK    Program Studi Magister Akuntansi
UNIGA.PPS.UPM    UPM Pascasarjana
UNIGA.FEB        Fakultas Ekonomi dan Bisnis
UNIGA.FEB.AK     Program Studi Akuntansi
UNIGA.FEB.EP     Program Studi Ekonomi Pembangunan
UNIGA.FEB.MN     Program Studi Manajemen
UNIGA.FEB.UPM    UPM FEB
UNIGA.FTI        Fakultas Teknik dan Informatika
UNIGA.FTI.SI     Program Studi Sistem Informasi
UNIGA.FTI.TE     Program Studi Teknik Elektro
UNIGA.FTI.TM     Program Studi Teknik Mesin
UNIGA.FTI.TI     Program Studi Teknik Industri
UNIGA.FTI.UPM    UPM FTI
UNIGA.FISB       Fakultas Ilmu Sosial dan Budaya
UNIGA.FISB.BI    Program Studi Bahasa Inggris
UNIGA.FISB.PSI   Program Studi Psikologi
UNIGA.FISB.IKOM  Program Studi Ilmu Komunikasi
UNIGA.FISB.UPM   UPM FISB
UNIGA.LSP        Lembaga Sertifikasi Profesi
UNIGA.DIVMA      DIVMA
UNIGA.PPSDM      PPSDM
UNIGA.JPC        Job Placement Center
UNIGA.PUS        Perpustakaan
UNIGA.KKI        Kantor Kerja Sama Internasional
UNIGA.PTI        Pusat Teknologi Informasi
UNIGA.P2K2       Pusat Penempatan Kerja dan Pengembangan Karier
UNIGA.UBIS       Unit Bisnis
UNIGA.TAX        Tax Center
UNIGA.HUMAS      Hubungan Masyarakat
UNIGA.PUBL       Publikasi
```

Letter types (code, name, aliases):

```
SK    Keputusan                       -
ST    Surat Tugas                     -
SE    Surat Edaran                    EDAR
SU    Surat Undangan                  UND
SP    Surat Pengantar                 -
ND    Nota Dinas                      -
SD    Surat Dinas                     UMUM
SPR   Surat Perintah                  -
SKET  Surat Keterangan                -
SPN   Surat Pernyataan                -
SKU   Surat Kuasa                     -
BA    Berita Acara                    -
PGM   Pengumuman                      -
PKS   Perjanjian Kerja Sama           -
MEMO  Memorandum                      -
SOP   Prosedur Operasional Standar    -
PER   Peraturan Rektor                -
NTL   Notula                          -
LAP   Laporan                         -
TS    Telaah Staf                     -
```

`exampleNumbers(template, year)` renders, in order: sequence 12 / `UNIGA.WR1` / `ST`; 34 / `UNIGA` / `SK`; 112 / `UNIGA.FEB.MN` / `SKET`; month 1.

Planner rules, per catalog entry in catalog order:
1. Match the existing row whose `code` equals the entry code; otherwise the first not-yet-matched existing row whose `code` is one of the entry's aliases. Deleted rows are eligible.
2. No match: `create` with the catalog name.
3. Exact match: `name` stays the existing name. `unchanged` when the row is active and (for units) its `formatTemplate` equals the template; otherwise `update`.
4. Alias match: `update` with the catalog code and name, `fromCode` set.
5. `reactivate: true` on an `update` whose row has `deletedAt`.
6. `untouched*`: active rows that no entry matched, in input order.

- [ ] **Step 1: Write the failing catalog tests**

```ts
import { describe, expect, it } from "vitest";
import {
  exampleNumbers, LETTER_TYPES_2027, letterTypeCodeCandidates, TEMPLATE_2027, UNITS_2027,
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
      "12/UNIGA.WR1/ST/2027", "34/UNIGA/SK/2027", "112/UNIGA.FEB.MN/SKET/2027",
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/numbering-2027-catalog.test.ts`
Expected: FAIL, cannot resolve `@/lib/numbering-2027/catalog`.

- [ ] **Step 3: Implement `catalog.ts`**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/numbering-2027-catalog.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing planner tests**

```ts
import { describe, expect, it } from "vitest";
import { TEMPLATE_2027 } from "@/lib/numbering-2027/catalog";
import { planApply, type ExistingRow } from "@/lib/numbering-2027/plan";

const LEGACY = "[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]";
const unit = (id: string, code: string, name: string, extra: Partial<ExistingRow> = {}): ExistingRow =>
  ({ id, code, name, deletedAt: null, formatTemplate: LEGACY, ...extra });
const type = (id: string, code: string, name: string, extra: Partial<ExistingRow> = {}): ExistingRow =>
  ({ id, code, name, deletedAt: null, ...extra });
const plan = (units: ExistingRow[], letterTypes: ExistingRow[]) =>
  planApply({ units, letterTypes, template: TEMPLATE_2027 });
const step = (steps: { code: string }[], code: string) => steps.find((s) => s.code === code)!;

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
      action: "update", code: "UNIGA", name: "Rektorat Universitas Gajayana", id: "u1",
    });
  });

  it("renames an alias match to the catalog code and name", () => {
    const p = plan([unit("u2", "FEB", "FEB lama")], [type("t1", "UND", "Surat Undangan"), type("t2", "UMUM", "Umum")]);
    expect(step(p.units, "UNIGA.FEB")).toEqual({
      action: "update", code: "UNIGA.FEB", name: "Fakultas Ekonomi dan Bisnis", id: "u2", fromCode: "FEB",
    });
    expect(step(p.letterTypes, "SU")).toMatchObject({ action: "update", id: "t1", fromCode: "UND" });
    expect(step(p.letterTypes, "SD")).toMatchObject({ action: "update", id: "t2", fromCode: "UMUM", name: "Surat Dinas" });
  });

  it("leaves rows outside the catalog untouched and lists them", () => {
    const p = plan(
      [unit("u3", "YAS", "Yayasan Gajayana Malang"), unit("u4", "FE", "Fakultas Ekonomi")],
      [type("t3", "MOU", "Nota Kesepahaman")]
    );
    expect(p.untouchedUnits).toEqual([
      { id: "u3", code: "YAS", name: "Yayasan Gajayana Malang" },
      { id: "u4", code: "FE", name: "Fakultas Ekonomi" },
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
    const p = plan([unit("u7", "UNIGA.WR1", "WR I", { deletedAt: new Date("2026-01-01"), formatTemplate: TEMPLATE_2027 })], []);
    expect(step(p.units, "UNIGA.WR1")).toEqual({
      action: "update", code: "UNIGA.WR1", name: "WR I", id: "u7", reactivate: true,
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
    expect(step(p.letterTypes, "SK")).toEqual({ action: "unchanged", code: "SK", name: "Surat Keputusan", id: "t4" });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run __tests__/numbering-2027-plan.test.ts`
Expected: FAIL, cannot resolve `@/lib/numbering-2027/plan`.

- [ ] **Step 7: Implement `plan.ts`** per the planner rules above. Optional keys (`id`, `fromCode`, `reactivate`) are omitted, not set to `undefined`/`false`, when they do not apply.

- [ ] **Step 8: Run to verify pass**

Run: `npx vitest run __tests__/numbering-2027-plan.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 9: Commit**

```bash
git add __tests__/numbering-2027-catalog.test.ts __tests__/numbering-2027-plan.test.ts src/lib/numbering-2027
git commit -m "feat(numbering): 2027 catalog and apply planner"
```

---

### Task 4: Policy record, executor, and API

**Files:**
- Modify: `prisma/schema.prisma` (append model)
- Create: `prisma/migrations/20261113000000_numbering_policy/migration.sql`
- Create: `src/lib/numbering-2027/apply.ts`, `src/app/api/numbering/policy/route.ts`
- Test: `__tests__/numbering-2027-apply.test.ts`

**Interfaces:**
- Consumes: `planApply`, `ApplyPlan`, `ExistingRow` (Task 3); `TEMPLATE_2027` (Task 3); `validateNumberTemplate` (Task 1).
- Produces:

```ts
// apply.ts
export interface ApplyOps {
  createUnit(data: { code: string; name: string; formatTemplate: string }): Promise<void>;
  /** Sets code, name, template and clears deletedAt. */
  updateUnit(id: string, data: { code: string; name: string; formatTemplate: string }): Promise<void>;
  createLetterType(data: { code: string; name: string }): Promise<void>;
  /** Sets code, name and clears deletedAt. */
  updateLetterType(id: string, data: { code: string; name: string }): Promise<void>;
}
export interface ApplySummary { unitsCreated: number; unitsUpdated: number; letterTypesCreated: number; letterTypesUpdated: number }
export async function executePlan(plan: ApplyPlan, ops: ApplyOps): Promise<ApplySummary>;
export function prismaApplyOps(tx: Prisma.TransactionClient): ApplyOps;
```

API `/api/numbering/policy`, SUPER_ADMIN only (401 without session, 403 otherwise, same messages as `src/app/api/numbering/sequence/route.ts`):
- `GET ?template=` returns `{ policy: { template, appliedAt, appliedByEmail } | null, defaultTemplate, template, templateError: string | null, plan }`. The template used is the query value, else the stored policy's, else `TEMPLATE_2027`.
- `POST { template: string, confirm: "TERAPKAN" }` returns 400 with `validateNumberTemplate`'s message or `Ketik TERAPKAN untuk melanjutkan`; otherwise, inside `prisma.$transaction(fn, { maxWait: 10_000, timeout: 30_000 })`: load all units and letter types, `planApply`, `executePlan(plan, prismaApplyOps(tx))`, upsert `NumberingPolicy` id 1 (`template`, `appliedAt: new Date()`, `appliedByEmail: session.email`), `audit({ action: "UPDATE", targetType: "NumberingPolicy", targetId: "1", metadata: { template, summary, untouchedUnits: codes, untouchedLetterTypes: codes } }, tx)`. Responds `{ policy, summary, plan }`. Wrap in try/catch that logs and returns a generic 500 like `POST /api/archives`.

Model:

```prisma
/// Single row (id = 1) recording that the 2027 numbering rule was applied
/// from /dashboard/numbering-rule. Absent row = legacy numbering.
model NumberingPolicy {
  id             Int      @id @default(1)
  template       String
  appliedAt      DateTime @default(now())
  appliedByEmail String?
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 1: Write the failing executor tests**

An in-memory `ApplyOps` over two arrays of `ExistingRow` (ids `new-1`, `new-2`, …), so the real planner and executor are exercised together.

```ts
import { describe, expect, it } from "vitest";
import { executePlan, type ApplyOps } from "@/lib/numbering-2027/apply";
import { TEMPLATE_2027 } from "@/lib/numbering-2027/catalog";
import { planApply, type ExistingRow } from "@/lib/numbering-2027/plan";

const LEGACY = "[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]";

function memoryStore(units: ExistingRow[], letterTypes: ExistingRow[]) {
  let n = 0;
  const calls: string[] = [];
  const ops: ApplyOps = {
    async createUnit(d) { calls.push(`createUnit ${d.code}`); units.push({ id: `new-${++n}`, deletedAt: null, ...d }); },
    async updateUnit(id, d) { calls.push(`updateUnit ${d.code}`); Object.assign(units.find((u) => u.id === id)!, d, { deletedAt: null }); },
    async createLetterType(d) { calls.push(`createLetterType ${d.code}`); letterTypes.push({ id: `new-${++n}`, deletedAt: null, ...d }); },
    async updateLetterType(id, d) { calls.push(`updateLetterType ${d.code}`); Object.assign(letterTypes.find((t) => t.id === id)!, d, { deletedAt: null }); },
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
    expect(summary).toEqual({ unitsCreated: 38, unitsUpdated: 2, letterTypesCreated: 18, letterTypesUpdated: 1 });
    expect(db.units.find((u) => u.id === "u1")).toMatchObject({ code: "UNIGA", name: "Rektorat Universitas Gajayana", formatTemplate: TEMPLATE_2027 });
    expect(db.units.find((u) => u.id === "u3")).toMatchObject({ code: "UNIGA.FEB", deletedAt: null, formatTemplate: TEMPLATE_2027 });
    expect(db.letterTypes.find((t) => t.id === "t2")).toMatchObject({ code: "SE", name: "Surat Edaran" });
  });

  it("never touches a row outside the catalog", async () => {
    const db = seedLike();
    const { ops } = memoryStore(db.units, db.letterTypes);
    await executePlan(planApply({ ...db, template: TEMPLATE_2027 }), ops);
    expect(db.units.find((u) => u.id === "u2")).toEqual({
      id: "u2", code: "YAS", name: "Yayasan Gajayana Malang", deletedAt: null, formatTemplate: LEGACY,
    });
  });

  it("changes nothing when applied a second time", async () => {
    const db = seedLike();
    const first = memoryStore(db.units, db.letterTypes);
    await executePlan(planApply({ ...db, template: TEMPLATE_2027 }), first.ops);
    const second = memoryStore(db.units, db.letterTypes);
    const summary = await executePlan(planApply({ ...db, template: TEMPLATE_2027 }), second.ops);
    expect(second.calls).toEqual([]);
    expect(summary).toEqual({ unitsCreated: 0, unitsUpdated: 0, letterTypesCreated: 0, letterTypesUpdated: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/numbering-2027-apply.test.ts`
Expected: FAIL, cannot resolve `@/lib/numbering-2027/apply`.

- [ ] **Step 3: Implement `apply.ts`**

`executePlan` walks units then letter types in plan order, sequentially. `prismaApplyOps` maps each op to `tx.unit.create/update` and `tx.letterType.create/update` (`deletedAt: null` on updates; new letter types rely on the schema default scope `GLOBAL`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run __tests__/numbering-2027-apply.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Add the model and generate the migration offline**

```bash
git show HEAD:prisma/schema.prisma > "$TEMP/schema-before.prisma"
mkdir -p prisma/migrations/20261113000000_numbering_policy
npx prisma migrate diff --from-schema-datamodel "$TEMP/schema-before.prisma" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261113000000_numbering_policy/migration.sql
npx prisma validate && npx prisma generate
```

Expected: `migration.sql` contains exactly one statement group, `CREATE TABLE "NumberingPolicy"` with its primary key, and no `ALTER`/`DROP`. `prisma validate` prints that the schema is valid.

- [ ] **Step 6: Implement the route** as specified under Interfaces.

Run: `npx tsc --noEmit && npx next lint --dir src/app/api/numbering --dir src/lib/numbering-2027`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261113000000_numbering_policy __tests__/numbering-2027-apply.test.ts src/lib/numbering-2027/apply.ts src/app/api/numbering/policy
git commit -m "feat(numbering): apply the 2027 rule in one transaction via /api/numbering/policy"
```

---

### Task 5: Hard-coded letter type codes

**Files:**
- Modify: `src/app/api/publik/sk/route.ts` (the `skType`/`edarType` lookup, around lines 57-61)
- Modify: `src/lib/legacy-import.ts` (the `skType`/`edarType` lookup in `importLegacyDecrees`, and the unit lookup `prisma.unit.findUnique({ where: { code } })` in its `UNIT_KODE_TO_CODE` loop)
- Modify: `src/app/dashboard/archives/archives-client.tsx` (both `preferredCodes` arrays)
- Test: `__tests__/numbering-2027-catalog.test.ts` (extend)

**Interfaces:**
- Consumes: `letterTypeCodeCandidates`, `UNITS_2027` (Task 3).
- Produces: `unitCodeCandidates(code: string): string[]` in `catalog.ts`: `"FEB"` → `["FEB", "UNIGA.FEB"]`, `"UNIGA"` → `["UNIGA"]`, unknown → `[code]`.

- [ ] **Step 1: Write the failing test** (append to the catalog test file)

```ts
it("resolves a legacy unit code to its 2027 code", () => {
  expect(unitCodeCandidates("FEB")).toEqual(["FEB", "UNIGA.FEB"]);
  expect(unitCodeCandidates("UNIGA")).toEqual(["UNIGA"]);
  expect(unitCodeCandidates("YAS")).toEqual(["YAS"]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/numbering-2027-catalog.test.ts`
Expected: FAIL, `unitCodeCandidates` is not exported.

- [ ] **Step 3: Implement `unitCodeCandidates` and use the candidates**

- `publik/sk/route.ts`: one `prisma.letterType.findMany({ where: { code: { in: [...letterTypeCodeCandidates("SK"), ...letterTypeCodeCandidates("SE")] } }, select: { id: true } })`; `eligibleLetterTypeIds` is the ids.
- `legacy-import.ts`: `findFirst({ where: { code: { in: letterTypeCodeCandidates("SE") } } })` for the Surat Edaran type (SK stays `findUnique`); the error text names `SE/EDAR`. Unit lookup becomes `findFirst({ where: { code: { in: unitCodeCandidates(code) } } })`.
- `archives-client.tsx`: `["UMUM", "SD", "SP", "UND", "SU"]` in both places.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all test files PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add __tests__/numbering-2027-catalog.test.ts src/lib/numbering-2027/catalog.ts src/app/api/publik/sk/route.ts src/lib/legacy-import.ts src/app/dashboard/archives/archives-client.tsx
git commit -m "fix(numbering): recognise 2027 codes where EDAR/UND/UMUM were hard-coded"
```

---

### Task 6: Super admin page, navigation, and operator guide

**Files:**
- Create: `src/app/dashboard/numbering-rule/page.tsx`, `src/app/dashboard/numbering-rule/numbering-rule-client.tsx`
- Modify: `src/components/app/sidebar.tsx` (`MASTER_DATA_NAV`: add `{ href: "/dashboard/numbering-rule", label: "Aturan Penomoran", icon: ListOrdered }` after "Jenis Surat"; import `ListOrdered` from `lucide-react`)
- Create: `docs/ATURAN-PENOMORAN-2027.md`

**Interfaces:**
- Consumes: `GET`/`POST /api/numbering/policy` (Task 4); `exampleNumbers`, `TEMPLATE_2027` (Task 3); `validateNumberTemplate` (Task 1).

- [ ] **Step 1: Server page**

Same guard as `src/app/dashboard/legacy-decrees/page.tsx` (redirect to `/login` without session, to `/dashboard` unless `SUPER_ADMIN`). Title `Aturan Penomoran`. Renders the client component.

- [ ] **Step 2: Client component**

Fetches `GET /api/numbering/policy?template=<current>` on mount and when the template input changes (debounced 400 ms). Shows, top to bottom:
1. Status card: `Belum diterapkan — aplikasi memakai penomoran yang sekarang.` or `Diterapkan pada <tanggal id-ID, Asia/Jakarta> oleh <email>.`
2. Template input (monospace, initial value from the response), the error from `validateNumberTemplate` when invalid, a `Kembalikan ke bawaan` button, and `exampleNumbers(template, tahun berjalan)` as three monospace lines.
3. Plan summary line: `Unit: N dibuat, N diubah, N tetap. Jenis surat: N dibuat, N diubah, N tetap.`
4. Two tables (Unit, Jenis surat): columns `Kode`, `Nama`, `Tindakan` (`Dibuat`, `Diubah dari <fromCode>`, `Diubah`, `Diaktifkan kembali`, `Tetap`); `unchanged` rows shown last.
5. `Tidak disentuh` list with codes and names, and the sentence `Unit dan jenis surat ini tidak ada di daftar baru. Kode dan templatenya tidak diubah.`
6. Warning text: `Penerapan langsung berlaku untuk nomor berikutnya dan tidak bisa dibatalkan dari aplikasi. Buat cadangan database lebih dulu.` Then an `AlertDialog` (existing `@/components/ui/alert-dialog`) whose confirm button is enabled only when the typed text is exactly `TERAPKAN`; it POSTs and reloads the plan. The button is disabled while the template is invalid or when the plan has no `create`/`update` step.

Follow the fetch/error/toast conventions of `src/app/dashboard/legacy-decrees/legacy-decrees-client.tsx`.

- [ ] **Step 3: Sidebar link**

- [ ] **Step 4: Operator guide `docs/ATURAN-PENOMORAN-2027.md`** (Indonesian), sections: Ringkasan; Menyiapkan situs demo (cabang Neon dari produksi, proyek Vercel terpisah dengan `DATABASE_URL`/`DIRECT_URL` cabang, subdomain sementara, tekan Terapkan); Go-live 1–3 Januari 2027 (cabang Neon sebagai cadangan, tekan Terapkan, periksa daftar "tidak disentuh", cek nomor pertama); Bila format baru ditolak (tidak melakukan apa-apa, atau menerapkan dengan template lama agar kode unit tetap jelas); Yang belum termasuk (daftar "bukan tujuan" pada spec).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx next lint && npx vitest run`
Expected: no type errors, no lint errors, all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/numbering-rule src/components/app/sidebar.tsx docs/ATURAN-PENOMORAN-2027.md
git commit -m "feat(numbering): Super admin page to preview and apply the 2027 rule"
```
