# Arsip Lama (tahap 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin Unit and Super admin can record old letters with their scans in a separate "Arsip Lama" module that fingerprints every file, never deletes anything, keeps its history permanently, and does not touch running numbering.

**Architecture:** The existing `LegacyDecree` table (325 BP3M rows) is widened to hold any old letter, and a new `LegacyDecreeFile` table holds one row per file version. Access rules, the public-search filter, the audit-retention filter and the upload-name stamp are pure functions in `src/lib`; route handlers under `/api/arsip-lama` apply them. Files go browser → Google Drive through a resumable session as today; the server reads the SHA-256 from Drive when attaching.

**Tech Stack:** Next.js 15.5 App Router (route `params` are Promises), TypeScript, Prisma 6 (Postgres), zod 4, googleapis Drive v3, Vitest (`__tests__/**/*.test.ts`, node environment), shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-16-arsip-lama-design.md`

## Global Constraints

- No new dependencies.
- Schema changes are additive only: new columns with defaults, one new table, `LegacyDecree.noUrutAsli` relaxed to nullable. Nothing is dropped or renamed. The model stays named `LegacyDecree`.
- No local database: never run `npm run build`, `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push` (the build script runs `prisma migrate deploy` against whatever `DATABASE_URL` is set). Migrations are hand-written SQL. Verify with `npx vitest run`, `npx tsc --noEmit`, `npx prisma validate`, and lint.
- Lint from a worktree: `npx eslint --no-eslintrc -c .eslintrc.json src __tests__` (plain `npm run lint` picks up the parent folder's config).
- The worktree has no `node_modules`; run `npm install` once before Task 1.
- No code path in this plan may write `Archive` or `NumberingSequence`, or call `deleteFile` from `src/lib/gdrive.ts`.
- No route in this plan deletes a `LegacyDecree` or `LegacyDecreeFile` row.
- Old-letter files: PDF and images only (`application/pdf`, `image/png`, `image/jpeg`, `image/jpg`, `image/webp`, `image/gif`), at most 25 MB.
- Users never receive a Drive link for an uploaded scan; files are read only through the app's streaming route.
- UI copy is Indonesian. Screen name: "Arsip Lama".
- Route tests follow `__tests__/users-create-personal-email.test.ts`: mock `@/lib/auth`, `@/lib/prisma`, `@/lib/audit`, call the handler with a `Request`. Drive tests follow `__tests__/gdrive-private.test.ts` (mock `googleapis`).
- UI components have no test harness in this repo; their logic lives in tested `src/lib` functions and the components are verified by `tsc` and lint.
- Withdrawn records are frozen for everyone (no edit, no attach) and there is no "un-withdraw" in this phase.

## Review Focus

1. **Upload never finished** (browser closed mid-upload, `fileId` of an empty or missing Drive file): attach answers 400 with a clear message and creates no file row. → Task 5, Task 7.
2. **Drive file gone or trashed when checking or opening**: integrity check records `MISSING` (not a 500); the stream route answers 404. → Task 7.
3. **Duplicate-fingerprint warning must not leak another unit's letters**: only records the caller may view are listed; the rest are a count. → Task 7.
4. **Two people replace the same file at once**: exactly one current version; the transaction locks the parent row before touching versions. → Task 7.
5. **Dates and text people actually type**: a future date is rejected; blank number is accepted; surrounding spaces are trimmed; a record with no date gets `tanggalRaw` "Tidak diketahui". → Task 6.

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (model `LegacyDecree`, new enums, new model)
- Create: `prisma/migrations/20261116000000_arsip_lama/migration.sql`
- Modify (compile fallout of nullable `noUrutAsli` only): `src/app/api/legacy-decrees/route.ts`, `src/app/api/legacy-decrees/[id]/route.ts`, `src/app/dashboard/legacy-decrees/legacy-decrees-client.tsx`

**Interfaces:**
- Produces (Prisma):
  - `enum LegacySource { IMPORT_BP3M MANUAL }`, `enum PhysicalKind { ASLI SALINAN TIDAK_ADA }`
  - `LegacyDecree` gains: `noUrutAsli Int? @unique`, `source LegacySource @default(IMPORT_BP3M)`, `direction Direction @default(OUTGOING)`, `counterpart String?`, `physicalLocation String?`, `physicalKind PhysicalKind?`, `confidential Boolean @default(false)`, `createdById String?`, `createdByEmail String?`, `editedAt DateTime?`, `withdrawnAt DateTime?`, `withdrawnById String?`, `withdrawnByEmail String?`, `withdrawnReason String?`, `files LegacyDecreeFile[]`, `@@index([withdrawnAt])`, `@@index([confidential])`
  - `model LegacyDecreeFile { id String @id @default(cuid()); decreeId String; decree LegacyDecree @relation(fields: [decreeId], references: [id], onDelete: Restrict); gdriveFileId String @unique; fileName String; mimeType String; sizeBytes Int; sha256 String; uploadedById String?; uploadedByEmail String; uploadedAt DateTime @default(now()); replacedAt DateTime?; replaceReason String?; lastCheckedAt DateTime?; lastCheckOk Boolean?; @@index([decreeId]); @@index([sha256]) }`
  - `createdById`, `withdrawnById`, `uploadedById` are plain strings with no relation to `User` (the e-mail copy is the durable identity).

- [ ] **Step 1: Edit `prisma/schema.prisma`** as listed above. Keep every existing `LegacyDecree` field and comment.

- [ ] **Step 2: Write `migration.sql`** by hand, in the style of `prisma/migrations/20261009000000_archive_cc_units/migration.sql`: `CREATE TYPE` for both enums; `ALTER TABLE "LegacyDecree" ALTER COLUMN "noUrutAsli" DROP NOT NULL`; `ADD COLUMN` for each new column with the defaults above; the two indexes; `CREATE TABLE "LegacyDecreeFile"` with its primary key, unique index on `gdriveFileId`, two indexes, and the `decreeId` foreign key (`ON DELETE RESTRICT ON UPDATE CASCADE`). End with the one data statement the spec requires:

```sql
-- Rows hidden from the public search were hidden because they concern
-- personnel/discipline; inside the app they become "rahasia".
UPDATE "LegacyDecree" SET "confidential" = true WHERE "isPublic" = false;
```

- [ ] **Step 3: Validate and regenerate**

Run: `npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and the client generated.

- [ ] **Step 4: Fix compile fallout**

Run: `npx tsc --noEmit`
Expected first: errors where `noUrutAsli` is typed `number`. Widen those to `number | null` (display "—" when null). Run again; expected: no errors.

- [ ] **Step 5: Run the suite and commit**

Run: `npx vitest run` — expected: all existing tests pass.

```bash
git add prisma/schema.prisma prisma/migrations/20261116000000_arsip_lama src/app/api/legacy-decrees src/app/dashboard/legacy-decrees
git commit -m "feat(arsip-lama): widen LegacyDecree and add file versions table"
```

---

### Task 2: Access rules and public-search filter

**Files:**
- Create: `src/lib/arsip-lama/access.ts`
- Modify: `src/app/api/publik/sk/route.ts` (the `prisma.legacyDecree.findMany` `where`)
- Test: `__tests__/arsip-lama-access.test.ts`

**Interfaces:**
- Produces:

```ts
import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/types";
export type OldArchiveScope = { unitId: string | null; confidential: boolean; withdrawnAt: Date | null };
export function canViewOldArchive(s: SessionPayload, r: OldArchiveScope): boolean;
export function canEditOldArchive(s: SessionPayload, r: { unitId: string | null; withdrawnAt: Date | null }): boolean;
export function canCreateOldArchiveFor(s: SessionPayload, unitId: string): boolean;
export function canModerateOldArchive(s: SessionPayload): boolean; // publish, withdraw, BP3M import
/** null means "no access at all". */
export function oldArchiveListWhere(s: SessionPayload, includeWithdrawn: boolean): Prisma.LegacyDecreeWhereInput | null;
export function publicLegacyWhere(skSeTypeIds: string[]): Prisma.LegacyDecreeWhereInput;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  canCreateOldArchiveFor, canEditOldArchive, canModerateOldArchive, canViewOldArchive,
  oldArchiveListWhere, publicLegacyWhere,
} from "@/lib/arsip-lama/access";

const s = (role: "SUPER_ADMIN" | "ADMIN_UNIT" | "USER", unitId: string | null) =>
  ({ userId: "u", email: "a@unigamalang.ac.id", name: "A", role, unitId, sessionVersion: 1 });
const row = (o: Partial<{ unitId: string | null; confidential: boolean; withdrawnAt: Date | null }> = {}) =>
  ({ unitId: "feb", confidential: false, withdrawnAt: null, ...o });

describe("canViewOldArchive", () => {
  it("lets the owning unit read ordinary records", () => {
    expect(canViewOldArchive(s("USER", "feb"), row())).toBe(true);
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row())).toBe(true);
  });
  it("hides confidential records from USER but not from the unit's admin", () => {
    expect(canViewOldArchive(s("USER", "feb"), row({ confidential: true }))).toBe(false);
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row({ confidential: true }))).toBe(true);
  });
  it("refuses other units and accounts without a unit", () => {
    expect(canViewOldArchive(s("ADMIN_UNIT", "fh"), row())).toBe(false);
    expect(canViewOldArchive(s("USER", null), row())).toBe(false);
  });
  it("shows unit-less and withdrawn records to SUPER_ADMIN only", () => {
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row({ unitId: null }))).toBe(false);
    expect(canViewOldArchive(s("ADMIN_UNIT", "feb"), row({ withdrawnAt: new Date() }))).toBe(false);
    expect(canViewOldArchive(s("SUPER_ADMIN", null), row({ unitId: null, withdrawnAt: new Date() }))).toBe(true);
  });
});

describe("edit / create / moderate", () => {
  it("ADMIN_UNIT edits and creates only for its own unit; USER never", () => {
    expect(canEditOldArchive(s("ADMIN_UNIT", "feb"), row())).toBe(true);
    expect(canEditOldArchive(s("ADMIN_UNIT", "fh"), row())).toBe(false);
    expect(canEditOldArchive(s("USER", "feb"), row())).toBe(false);
    expect(canCreateOldArchiveFor(s("ADMIN_UNIT", "feb"), "feb")).toBe(true);
    expect(canCreateOldArchiveFor(s("ADMIN_UNIT", "feb"), "fh")).toBe(false);
    expect(canCreateOldArchiveFor(s("SUPER_ADMIN", null), "fh")).toBe(true);
  });
  it("freezes withdrawn records for everyone", () => {
    expect(canEditOldArchive(s("SUPER_ADMIN", null), row({ withdrawnAt: new Date() }))).toBe(false);
  });
  it("only SUPER_ADMIN moderates", () => {
    expect(canModerateOldArchive(s("SUPER_ADMIN", null))).toBe(true);
    expect(canModerateOldArchive(s("ADMIN_UNIT", "feb"))).toBe(false);
  });
});

describe("oldArchiveListWhere", () => {
  it("scopes by role", () => {
    expect(oldArchiveListWhere(s("SUPER_ADMIN", null), false)).toEqual({ withdrawnAt: null });
    expect(oldArchiveListWhere(s("SUPER_ADMIN", null), true)).toEqual({});
    expect(oldArchiveListWhere(s("ADMIN_UNIT", "feb"), true)).toEqual({ unitId: "feb", withdrawnAt: null });
    expect(oldArchiveListWhere(s("USER", "feb"), false)).toEqual({ unitId: "feb", withdrawnAt: null, confidential: false });
    expect(oldArchiveListWhere(s("USER", null), false)).toBeNull();
  });
});

describe("publicLegacyWhere", () => {
  it("admits only public, non-confidential, non-withdrawn SK/SE", () => {
    expect(publicLegacyWhere(["sk", "se"])).toEqual({
      isPublic: true, confidential: false, withdrawnAt: null, letterTypeId: { in: ["sk", "se"] },
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run __tests__/arsip-lama-access.test.ts` — expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/arsip-lama/access.ts`** with the signatures above. Pure functions, no database.

- [ ] **Step 4: Use `publicLegacyWhere` in `src/app/api/publik/sk/route.ts`**: replace `isPublic: true` in the `legacyDecree.findMany` `where` with `...publicLegacyWhere(eligibleLetterTypeIds)`; keep the unit, year and `q` conditions. When `eligibleLetterTypeIds` is empty the legacy query resolves to `[]`, as the archive query already does.

- [ ] **Step 5: Run and commit**

Run: `npx vitest run && npx tsc --noEmit` — expected: all pass, no type errors.

```bash
git add src/lib/arsip-lama/access.ts src/app/api/publik/sk/route.ts __tests__/arsip-lama-access.test.ts
git commit -m "feat(arsip-lama): access rules and stricter public search filter"
```

---

### Task 3: Permanent history (audit retention)

**Files:**
- Create: `src/lib/audit-retention.ts`
- Modify: `src/app/api/cron/cleanup-audit/route.ts` (the `auditLog.deleteMany` `where`)
- Test: `__tests__/audit-retention.test.ts`

**Interfaces:**
- Produces: `export const PERMANENT_AUDIT_TARGETS = ["LegacyDecree"] as const;` and `export function auditCleanupWhere(cutoff: Date): Prisma.AuditLogWhereInput;`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from "vitest";
import { auditCleanupWhere } from "@/lib/audit-retention";

it("never selects Arsip Lama history for deletion", () => {
  const cutoff = new Date("2024-11-16T00:00:00Z");
  expect(auditCleanupWhere(cutoff)).toEqual({
    createdAt: { lt: cutoff },
    targetType: { notIn: ["LegacyDecree"] },
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/audit-retention.test.ts`, expected: FAIL, module not found.

- [ ] **Step 3: Implement** `auditCleanupWhere` and call it in the cron route: `prisma.auditLog.deleteMany({ where: auditCleanupWhere(auditCutoff) })`. Update the route's header comment to say Arsip Lama history is kept forever.

- [ ] **Step 4: Run and commit** — `npx vitest run && npx tsc --noEmit`, expected: pass.

```bash
git add src/lib/audit-retention.ts src/app/api/cron/cleanup-audit/route.ts __tests__/audit-retention.test.ts
git commit -m "feat(arsip-lama): keep LegacyDecree audit history past the 2-year cleanup"
```

---

### Task 4: BP3M import leaves in-app edits alone

**Files:**
- Modify: `src/lib/legacy-import.ts` (`importLegacyDecrees`)
- Test: `__tests__/legacy-import.test.ts`

**Interfaces:**
- Produces: `importLegacyDecrees(prisma)` result gains `keptEdited: number` — rows skipped because `editedAt` is set. New rows it creates carry `source: "IMPORT_BP3M"` (the column default; no code needed).

- [ ] **Step 1: Write the failing test** with a hand-made fake `prisma` (the function takes it as a parameter):

```ts
import { expect, it, vi } from "vitest";
import { importLegacyDecrees } from "@/lib/legacy-import";

it("does not overwrite a row that was edited in the app", async () => {
  const update = vi.fn(async () => ({}));
  const prisma = {
    letterType: { findUnique: async () => ({ id: "sk" }), findFirst: async () => ({ id: "se" }) },
    unit: { findFirst: async () => ({ id: "unit" }) },
    legacyDecree: {
      findUnique: async ({ where }: { where: { noUrutAsli: number } }) =>
        ({ id: `r${where.noUrutAsli}`, editedAt: where.noUrutAsli === 1 ? new Date() : null }),
      update,
      create: vi.fn(),
      count: async () => 0,
    },
  };
  const result = await importLegacyDecrees(prisma as never);

  expect(result.keptEdited).toBe(1);
  expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { noUrutAsli: 1 } }));
  expect(result.updated + result.keptEdited + result.skipped).toBe(result.total);
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/legacy-import.test.ts`, expected: FAIL (`keptEdited` undefined).

- [ ] **Step 3: Implement**: in the `existing` branch, when `existing.editedAt` is set, increment `keptEdited` and `continue`; add `keptEdited` to the return value.

- [ ] **Step 4: Run and commit** — `npx vitest run && npx tsc --noEmit`, expected: pass.

```bash
git add src/lib/legacy-import.ts __tests__/legacy-import.test.ts
git commit -m "feat(arsip-lama): BP3M re-import skips rows edited in the app"
```

---

### Task 5: Drive fingerprint and owner-stamped uploads

**Files:**
- Modify: `src/lib/gdrive.ts` (add `getFileFingerprint`, `DriveFileMissingError`)
- Create: `src/lib/arsip-lama/upload.ts`
- Create: `src/app/api/arsip-lama/upload-init/route.ts`
- Test: `__tests__/arsip-lama-upload.test.ts`

**Interfaces:**
- Consumes: `createResumableSession(filename, mimeType, origin)` and `gdriveAvailable()` from `src/lib/gdrive.ts`.
- Produces:

```ts
// src/lib/gdrive.ts
export class DriveFileMissingError extends Error {}
export interface DriveFingerprint { id: string; name: string; mimeType: string; sizeBytes: number; sha256: string }
/** Reads id,name,mimeType,size,parents,sha256Checksum,trashed. Throws DriveFileMissingError on a
 *  Drive 404 or a trashed file; throws Error("File bukan milik folder Drive yang dikonfigurasi")
 *  outside the parent folder; throws Error("Berkas belum selesai diunggah") when size is 0 or absent.
 *  If sha256Checksum is absent, hashes the bytes itself (alt=media stream through crypto sha256). */
export async function getFileFingerprint(fileId: string): Promise<DriveFingerprint>;

// src/lib/arsip-lama/upload.ts
export const OLD_ARCHIVE_MIME: readonly string[]; // the six types in Global Constraints
export const OLD_ARCHIVE_MAX_BYTES = 25 * 1024 * 1024;
/** `${now}-${userId}-${safeName}` — full userId, unlike /api/gdrive/init's 8-char prefix. */
export function stampUploadName(userId: string, filename: string, now: number): string;
export function uploadedBy(driveName: string, userId: string): boolean;
/** Drive name with the stamp removed, for display. */
export function originalName(driveName: string, userId: string): string;
```
- Route: `POST /api/arsip-lama/upload-init` body `{ filename, mimeType, size }` → `{ uploadUrl }`. 401 without session; 403 unless `SUPER_ADMIN` or `ADMIN_UNIT` with a unit; 400 for a type outside `OLD_ARCHIVE_MIME` ("Hanya PDF atau gambar yang diperbolehkan untuk arsip lama") or size over the limit; 501 `GDRIVE_UNAVAILABLE` like `/api/gdrive/init`.

- [ ] **Step 1: Write the failing tests** (mock `googleapis` exactly as `__tests__/gdrive-private.test.ts` does; `drive.files.get` is the fake; `Readable` is from `node:stream`; import the functions under test inside each test with `await import(...)` as that file does):

```ts
describe("upload stamp", () => {
  it("binds the Drive name to the full user id", () => {
    const name = stampUploadName("cku1abcdefghijklmnop", "SK 1998/01.pdf", 1700000000000);
    expect(name).toBe("1700000000000-cku1abcdefghijklmnop-SK 1998_01.pdf");
    expect(uploadedBy(name, "cku1abcdefghijklmnop")).toBe(true);
    expect(uploadedBy(name, "cku1abcdefghijklmnoX")).toBe(false);
    expect(uploadedBy("1700000000000-cku1abcd-x.pdf", "cku1abcdefghijklmnop")).toBe(false); // old 8-char stamp
    expect(originalName(name, "cku1abcdefghijklmnop")).toBe("SK 1998_01.pdf");
  });
});

describe("getFileFingerprint", () => {
  it("returns Drive's sha256 and size for a file in our folder", async () => {
    drive.files.get.mockResolvedValue({ data: { id: "f1", name: "n.pdf", mimeType: "application/pdf",
      size: "2048", parents: [FOLDER], sha256Checksum: "ab".repeat(32) } });
    expect(await getFileFingerprint("f1")).toEqual({ id: "f1", name: "n.pdf",
      mimeType: "application/pdf", sizeBytes: 2048, sha256: "ab".repeat(32) });
  });
  it("hashes the bytes itself when Drive gives no checksum", async () => {
    drive.files.get
      .mockResolvedValueOnce({ data: { id: "f1", name: "n.pdf", mimeType: "application/pdf", size: "3", parents: [FOLDER] } })
      .mockResolvedValueOnce({ data: Readable.from([Buffer.from("abc")]) });
    expect((await getFileFingerprint("f1")).sha256)
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("rejects a file outside the folder", async () => {
    drive.files.get.mockResolvedValue({ data: { id: "f1", name: "n.pdf", size: "1", parents: ["other"] } });
    await expect(getFileFingerprint("f1")).rejects.toThrow(/bukan milik folder/i);
  });
  it("reports an unfinished upload", async () => {           // Review Focus 1
    drive.files.get.mockResolvedValue({ data: { id: "f1", name: "n.pdf", size: "0", parents: [FOLDER] } });
    await expect(getFileFingerprint("f1")).rejects.toThrow(/belum selesai diunggah/i);
  });
  it("reports a missing or trashed file as DriveFileMissingError", async () => {
    drive.files.get.mockRejectedValueOnce(Object.assign(new Error("nf"), { code: 404 }));
    await expect(getFileFingerprint("gone")).rejects.toBeInstanceOf(DriveFileMissingError);
    drive.files.get.mockResolvedValueOnce({ data: { id: "f1", name: "n.pdf", size: "1", parents: [FOLDER], trashed: true } });
    await expect(getFileFingerprint("f1")).rejects.toBeInstanceOf(DriveFileMissingError);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/arsip-lama-upload.test.ts`, expected: FAIL, exports not found.

- [ ] **Step 3: Implement** `src/lib/arsip-lama/upload.ts` and `getFileFingerprint`. `stampUploadName` sanitises with the same character class as `/api/gdrive/init` (`/[\\/:*?"<>|]/g` → `_`) and caps the name part at 150 characters.

- [ ] **Step 4: Implement the `upload-init` route** per the Interfaces block (same shape and CORS `origin` forwarding as `src/app/api/gdrive/init/route.ts`, but stamped with `stampUploadName(session.userId, filename, Date.now())`).

- [ ] **Step 5: Run and commit** — `npx vitest run && npx tsc --noEmit`, expected: pass.

```bash
git add src/lib/gdrive.ts src/lib/arsip-lama/upload.ts src/app/api/arsip-lama/upload-init __tests__/arsip-lama-upload.test.ts
git commit -m "feat(arsip-lama): Drive fingerprint and owner-stamped upload sessions"
```

---

### Task 6: Records API (create, list, detail, edit, flags, withdraw)

**Files:**
- Create: `src/lib/arsip-lama/input.ts`
- Create: `src/app/api/arsip-lama/route.ts` (GET, POST)
- Create: `src/app/api/arsip-lama/[id]/route.ts` (GET, PATCH)
- Create: `src/app/api/arsip-lama/[id]/withdraw/route.ts` (POST)
- Test: `__tests__/arsip-lama-input.test.ts`, `__tests__/arsip-lama-records.test.ts`

**Interfaces:**
- Consumes: Task 2 access functions; `audit()`; `letterTypeCodeCandidates` from `src/lib/numbering-2027/catalog`.
- Produces:

```ts
// src/lib/arsip-lama/input.ts
export const oldArchiveInput: z.ZodType<OldArchiveInput>;
export type OldArchiveInput = {
  letterTypeId: string; unitId: string; direction: "OUTGOING" | "INCOMING";
  nomor: string;                 // trimmed, max 200, may be ""
  tanggal: string | null;        // "YYYY-MM-DD", not after today in Asia/Jakarta
  tanggalRaw: string;            // trimmed, max 200, may be ""
  perihal: string;               // trimmed, 3..2000
  counterpart: string | null;    // trimmed, max 300
  physicalLocation: string | null; // trimmed, max 300
  physicalKind: "ASLI" | "SALINAN" | "TIDAK_ADA";
  confidential: boolean; catatan: string | null; // max 2000
};
/** tanggalRaw to store: the typed text, else "7 Juni 2026"-style from tanggal, else "Tidak diketahui". */
export function resolveTanggalRaw(tanggal: string | null, tanggalRaw: string): string;
/** Keys whose values differ, with before/after, for the audit row. Dates compare by ISO string. */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>):
  Record<string, { before: unknown; after: unknown }>;
```

- Routes (all 401 without a session; JSON errors `{ error }` in Indonesian):
  - `GET /api/arsip-lama?q&year&unitId&letterTypeId&direction&hasFile&nomorExact&withdrawn&page&pageSize` → `{ rows, total }`. Base `where` is `oldArchiveListWhere(session, withdrawn === "1")`; `null` → `{ rows: [], total: 0 }`. `unitId` filter honoured for SUPER_ADMIN only. `q` matches `nomor`, `perihal`, `counterpart` (insensitive contains). `year=YYYY` → `tanggal` in that UTC year; `year=none` → `tanggal: null`. `hasFile=1|0` → `files: { some | none: { replacedAt: null } }`. `nomorExact` → `nomor` equals (insensitive). Order `tanggal desc nulls last, createdAt desc`. `pageSize` default 25, max 100. Row: `id, nomor, tanggal, tanggalRaw, perihal, unitCode, unitName, jenis, direction, hasFile, confidential, isPublic, source, withdrawn`.
  - `POST /api/arsip-lama` body `OldArchiveInput` → 201 `{ id }`. 403 unless `canCreateOldArchiveFor(session, unitId)`. 400 if the unit or letter type does not exist or is soft-deleted (any active letter type is accepted, regardless of unit scope). Stores `source: "MANUAL"`, `isPublic: false`, `isComplete: true`, `unitLabelRaw: unit.name`, `createdById`, `createdByEmail`, `tanggalRaw: resolveTanggalRaw(...)`. Audit `CREATE`, `targetType: "LegacyDecree"`, `metadata: { event: "create", nomor, perihal }`.
  - `GET /api/arsip-lama/[id]` → `{ record, files, history }`; 404 if absent, 403 unless `canViewOldArchive`. `files` = all versions newest first (`id, fileName, mimeType, sizeBytes, sha256, uploadedByEmail, uploadedAt, replacedAt, replaceReason, lastCheckedAt, lastCheckOk`; never `gdriveFileId`). `history` = `auditLog` rows with `targetType "LegacyDecree"` and `targetId = id`, newest first, max 200 (`action, actorEmail, createdAt, metadata`).
  - `PATCH /api/arsip-lama/[id]` body: any subset of `OldArchiveInput` plus `isPublic?: boolean`. 403 unless `canEditOldArchive`. `unitId` and `isPublic` changes require `canModerateOldArchive` (403 otherwise); a `unitId` change also rewrites `unitLabelRaw` to the new unit's name. `isPublic: true` is refused with 400 "Hanya SK dan Surat Edaran yang tidak rahasia yang bisa ditampilkan ke publik" unless the (resulting) letter type code is in `letterTypeCodeCandidates("SK")` or `("SE")` and the (resulting) `confidential` is false. Setting `confidential: true` forces `isPublic: false`. Any change to a data field (everything except `isPublic`/`confidential`) sets `editedAt = now`. No actual change → 200 and no audit row. Otherwise audit `UPDATE` with `metadata: { event: "edit", changes: changedFields(...) }`.
  - `POST /api/arsip-lama/[id]/withdraw` body `{ reason }` (trimmed, min 10) → 403 unless `canModerateOldArchive`; 409 if already withdrawn; sets `withdrawnAt`, `withdrawnById`, `withdrawnByEmail`, `withdrawnReason`, `isPublic: false`; audit `UPDATE` `metadata: { event: "withdraw", reason }`.

- [ ] **Step 1: Write the failing input tests** (`__tests__/arsip-lama-input.test.ts`):

```ts
const base = { letterTypeId: "lt", unitId: "feb", direction: "OUTGOING", nomor: "", tanggal: null,
  tanggalRaw: "", perihal: "Undangan rapat senat", counterpart: null, physicalLocation: null,
  physicalKind: "ASLI", confidential: false, catatan: null };

it("accepts a letter with no number and no date", () => {          // Review Focus 5
  expect(oldArchiveInput.safeParse(base).success).toBe(true);
});
it("trims text", () => {
  const r = oldArchiveInput.parse({ ...base, nomor: "  001/SK/UNIGA/I/1998 ", perihal: "  Pengangkatan dosen  " });
  expect(r.nomor).toBe("001/SK/UNIGA/I/1998");
  expect(r.perihal).toBe("Pengangkatan dosen");
});
it("rejects a future date and a malformed one", () => {
  expect(oldArchiveInput.safeParse({ ...base, tanggal: "2999-01-01" }).success).toBe(false);
  expect(oldArchiveInput.safeParse({ ...base, tanggal: "14/03/1998" }).success).toBe(false);
});
it("rejects a perihal shorter than 3 characters", () => {
  expect(oldArchiveInput.safeParse({ ...base, perihal: " a " }).success).toBe(false);
});
it("resolves tanggalRaw", () => {
  expect(resolveTanggalRaw("2026-06-07", "")).toBe("7 Juni 2026");
  expect(resolveTanggalRaw("2026-06-07", "awal Juni 2026")).toBe("awal Juni 2026");
  expect(resolveTanggalRaw(null, "")).toBe("Tidak diketahui");
});
it("reports only fields that changed", () => {
  expect(changedFields({ nomor: "1", perihal: "x" }, { nomor: "2", perihal: "x" }))
    .toEqual({ nomor: { before: "1", after: "2" } });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/arsip-lama-input.test.ts`, expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/arsip-lama/input.ts`**; run the file again, expected: PASS.

- [ ] **Step 4: Write the failing route tests** (`__tests__/arsip-lama-records.test.ts`, mocks as in Global Constraints; `prisma.legacyDecree`, `prisma.unit`, `prisma.letterType`, `prisma.auditLog` are `vi.fn` fakes; no `prisma.archive` or `prisma.numberingSequence` key exists on the mock, so touching them throws). One `it` per line:

  - POST as `ADMIN_UNIT` of `feb` for `unitId: "fh"` → 403, `legacyDecree.create` not called.
  - POST as `ADMIN_UNIT` of `feb` for `feb` → 201; `create` data has `source: "MANUAL"`, `isPublic: false`, `createdByEmail` = session email, `tanggalRaw: "Tidak diketahui"`; `audit` called with `targetType: "LegacyDecree"` and `metadata.event: "create"`.
  - POST as `USER` → 403.
  - GET list as `USER` without unit → 200 `{ rows: [], total: 0 }`, `findMany` not called.
  - GET list as `USER` of `feb` → `findMany` `where` contains `unitId: "feb"`, `confidential: false`, `withdrawnAt: null`.
  - GET list with `year=none` → `where` contains `tanggal: null`.
  - GET detail of a confidential record as `USER` of the same unit → 403.
  - GET detail response `files[0]` has no `gdriveFileId` key.
  - PATCH `{ nomor }` as unit admin → `update` data has `editedAt` a `Date`; audit `metadata.changes.nomor` is `{ before, after }`.
  - PATCH with values identical to the stored ones → 200, `update` and `audit` not called.
  - PATCH `{ isPublic: true }` as `ADMIN_UNIT` → 403.
  - PATCH `{ isPublic: true }` as `SUPER_ADMIN` on a letter type with code `ST` → 400.
  - PATCH `{ isPublic: true }` as `SUPER_ADMIN` on a confidential `SK` → 400.
  - PATCH `{ confidential: true }` on a public record → `update` data has `isPublic: false`; `editedAt` not set.
  - PATCH on a withdrawn record as `SUPER_ADMIN` → 403.
  - withdraw as `ADMIN_UNIT` → 403; as `SUPER_ADMIN` with reason "salah" → 400; with a valid reason → `update` data has `withdrawnAt` a `Date`, `withdrawnReason`, `isPublic: false`; again on a withdrawn record → 409.

- [ ] **Step 5: Run to verify failure** — `npx vitest run __tests__/arsip-lama-records.test.ts`, expected: FAIL, route modules not found.

- [ ] **Step 6: Implement the three route files** per the Interfaces block. `clientIp` and the audit `ip`/`userAgent` fields follow `src/app/api/legacy-decrees/[id]/route.ts`.

- [ ] **Step 7: Run and commit** — `npx vitest run && npx tsc --noEmit`, expected: pass.

```bash
git add src/lib/arsip-lama/input.ts src/app/api/arsip-lama/route.ts "src/app/api/arsip-lama/[id]/route.ts" "src/app/api/arsip-lama/[id]/withdraw" __tests__/arsip-lama-input.test.ts __tests__/arsip-lama-records.test.ts
git commit -m "feat(arsip-lama): records API with access rules, edit history and withdrawal"
```

---

### Task 7: Files API (attach, replace, open, integrity check)

**Files:**
- Create: `src/app/api/arsip-lama/[id]/files/route.ts` (POST)
- Create: `src/app/api/arsip-lama/[id]/files/[fileId]/route.ts` (GET)
- Create: `src/app/api/arsip-lama/[id]/files/[fileId]/check/route.ts` (POST)
- Modify: `next.config.mjs` (headers)
- Test: `__tests__/arsip-lama-files.test.ts`

**Interfaces:**
- Consumes: `getFileFingerprint`, `DriveFileMissingError`, `openFileStream`, `safeInlineMime` (`src/lib/gdrive.ts`); `OLD_ARCHIVE_MIME`, `OLD_ARCHIVE_MAX_BYTES`, `uploadedBy`, `originalName` (Task 5); access functions (Task 2).
- In these routes `[fileId]` is `LegacyDecreeFile.id`, never the Drive id.
- Produces:
  - `POST /api/arsip-lama/[id]/files` body `{ fileId: string /* Drive id */, replaceReason?: string }` → 201 `{ file: { id, fileName, sha256, sizeBytes }, duplicates: { viewable: { id, nomor, perihal }[], hiddenCount: number } }`.
    Order of checks: 404 record; 403 unless `canEditOldArchive`; fingerprint (`DriveFileMissingError` → 400 "Berkas tidak ditemukan di Google Drive. Unggah ulang."; other fingerprint errors → 400 with the error message); 403 "Berkas ini bukan unggahan Anda" unless `uploadedBy(fp.name, session.userId)`; 400 for a type outside `OLD_ARCHIVE_MIME` or size over `OLD_ARCHIVE_MAX_BYTES`; 409 if `gdriveFileId` already appears in `Archive.gdriveFileId` or `LegacyDecreeFile.gdriveFileId`; when a current version exists, `replaceReason` (trimmed, min 10) is required, else 400.
    Write inside one `prisma.$transaction`, in this order: (1) `legacyDecree.update({ where: { id }, data: { updatedAt: new Date() } })` — takes the parent row lock so concurrent attaches serialise; (2) `legacyDecreeFile.updateMany({ where: { decreeId: id, replacedAt: null }, data: { replacedAt: now, replaceReason } })`; (3) `legacyDecreeFile.create` with `fileName: originalName(fp.name, session.userId)`, `sha256`, `sizeBytes`, `mimeType` from the fingerprint, `uploadedById`, `uploadedByEmail`; (4) `audit(..., tx)` action `UPLOAD`, `metadata: { event: "file_add" | "file_replace", sha256, fileName, replaceReason }`.
    `duplicates`: other records (different `decreeId`) holding any file row with the same `sha256`; those passing `canViewOldArchive` go in `viewable`, the rest are counted in `hiddenCount`.
  - `GET /api/arsip-lama/[id]/files/[fileId]` → the bytes; 404 if the file row does not belong to the record; 403 unless `canViewOldArchive`; `DriveFileMissingError`/Drive 404 → 404 "Berkas tidak ditemukan di Google Drive"; other Drive errors → 502. Headers identical to `src/app/api/archives/[id]/proof/file/route.ts` (`safeInlineMime`, `nosniff`, `private, no-store`). Old versions are served the same way.
  - `POST /api/arsip-lama/[id]/files/[fileId]/check` → `{ result: "OK" | "MISMATCH" | "MISSING", checkedAt }`; 403 unless `canViewOldArchive`. `OK` when the fresh `sha256` equals the stored one. Updates `lastCheckedAt` and `lastCheckOk` (`true` only for `OK`). Audit `UPDATE` `metadata: { event: "integrity_check", result, fileId }`. A Drive error other than missing → 502 and nothing is recorded.

- [ ] **Step 1: Write the failing tests** (`__tests__/arsip-lama-files.test.ts`; mock `@/lib/gdrive` functions directly plus the usual three; `prisma.$transaction` fake runs its callback with a `tx` that records call order into an array). One `it` per line:

  - attach as `USER` → 403; attach to a withdrawn record as `SUPER_ADMIN` → 403.
  - attach when `getFileFingerprint` throws `DriveFileMissingError` → 400, no `create`. *(Review Focus 1)*
  - attach when it throws `Error("Berkas belum selesai diunggah")` → 400 with that message, no `create`. *(Review Focus 1)*
  - attach a file whose Drive name is stamped with another user's id → 403, no `create`.
  - attach `application/msword` → 400.
  - attach a Drive id already used by an `Archive` → 409.
  - first attach → 201; `create` data has `sha256` and `sizeBytes` from the fingerprint (not from the request body), `uploadedByEmail` = session email; audit `metadata.event: "file_add"`.
  - replace without `replaceReason` → 400; with one → recorded order is exactly `["decree.update", "file.updateMany", "file.create", "audit"]`, `updateMany` `where` is `{ decreeId, replacedAt: null }`, and no `delete`/`deleteMany` key was called. *(Review Focus 4)*
  - attach where the same `sha256` exists on record A (same unit) and record B (other unit), caller is that unit's admin → `duplicates.viewable` has only A, `hiddenCount` is 1, and B's `perihal` appears nowhere in the response body. *(Review Focus 3)*
  - open a file whose row belongs to a different record → 404; open as another unit → 403; open when `openFileStream` rejects with `DriveFileMissingError` → 404. *(Review Focus 2)*
  - check with matching hash → `result: "OK"`, `update` data `lastCheckOk: true`; with a different hash → `"MISMATCH"`, `lastCheckOk: false`; when the fingerprint throws `DriveFileMissingError` → 200 `"MISSING"`, `lastCheckOk: false`; when it throws a generic `Error` → 502 and `update` not called. *(Review Focus 2)*

- [ ] **Step 2: Run to verify failure** — `npx vitest run __tests__/arsip-lama-files.test.ts`, expected: FAIL, route modules not found.

- [ ] **Step 3: Implement the three routes** per the Interfaces block. `openFileStream` currently throws a plain error on a Drive 404; in the GET route treat an error whose `code === 404` (or `DriveFileMissingError`) as missing.

- [ ] **Step 4: Allow the preview frame** — in `next.config.mjs`, next to the existing `/api/archives/:id/proof/file` rule, add the same `X-Frame-Options: SAMEORIGIN` rule for `source: "/api/arsip-lama/:id/files/:fileId"`.

- [ ] **Step 5: Run and commit** — `npx vitest run && npx tsc --noEmit`, expected: pass.

```bash
git add "src/app/api/arsip-lama/[id]/files" next.config.mjs __tests__/arsip-lama-files.test.ts
git commit -m "feat(arsip-lama): versioned file attach, private streaming and integrity check"
```

---

### Task 8: Screens

**Files:**
- Modify: `src/lib/upload-client.ts` (add `uploadOldArchiveFile`)
- Create: `src/app/dashboard/arsip-lama/page.tsx`, `arsip-lama-client.tsx`, `import-button.tsx`
- Create: `src/app/dashboard/arsip-lama/baru/page.tsx`, `form.tsx`
- Create: `src/app/dashboard/arsip-lama/[id]/page.tsx`, `detail-client.tsx`
- Modify: `src/app/dashboard/legacy-decrees/page.tsx` (becomes `redirect("/dashboard/arsip-lama")`)
- Delete: `src/app/dashboard/legacy-decrees/legacy-decrees-client.tsx`, `src/app/api/legacy-decrees/route.ts`, `src/app/api/legacy-decrees/[id]/route.ts` (replaced by `/api/arsip-lama`; keep `src/app/api/legacy-decrees/import/route.ts`)
- Modify: `src/components/app/sidebar.tsx`
- Modify: `docs/panduan-pengguna.md`, `src/app/dashboard/panduan/page.tsx` (new section "Arsip Lama")

**Interfaces:**
- Consumes: every route from Tasks 5–7; `POST /api/legacy-decrees/import` (its JSON now includes `keptEdited`).
- Produces: `export async function uploadOldArchiveFile(file: File): Promise<{ fileId: string }>` — checks type against the six allowed types and the 25 MB limit client-side (throwing `UploadError` with "Hanya PDF atau gambar yang diperbolehkan untuk arsip lama." / "Ukuran berkas melebihi 25MB."), calls `/api/arsip-lama/upload-init`, PUTs the bytes to `uploadUrl`, and returns the Drive file id from Drive's response, the way the Drive branch of `uploadProofAsset` does. No Blob or inline fallback: if Drive is unavailable it throws `UploadError("Google Drive belum dikonfigurasi; arsip lama tidak bisa diunggah.")`.

- [ ] **Step 1: `uploadOldArchiveFile`** in `src/lib/upload-client.ts`.

- [ ] **Step 2: List page** `/dashboard/arsip-lama`. Server component: `getSession` (redirect to `/login` without one); accounts with no unit that are not SUPER_ADMIN see the text "Akun Anda belum punya unit, jadi belum ada arsip lama yang bisa ditampilkan." Client component: search box (placeholder "Cari nomor, perihal, atau pengirim/tujuan"), filters Tahun (number, plus option "Tanpa tanggal"), Unit (SUPER_ADMIN only), Jenis, Arah (Semua / Surat keluar / Surat masuk), Berkas (Semua / Sudah ada / Belum ada), and for SUPER_ADMIN a checkbox "Tampilkan yang ditarik". Table columns: Tanggal (`tanggalRaw` when `tanggal` is null), Nomor ("(tanpa nomor)" when empty), Perihal, Unit, Jenis, Berkas (badge "Ada" / "Belum"), plus badges "Rahasia", "Publik", "Ditarik", "BP3M" (`source === "IMPORT_BP3M"`). Rows link to the detail page. Button "Tambah surat lama" for SUPER_ADMIN and ADMIN_UNIT. Pagination 25 per page. SUPER_ADMIN also sees `ImportButton` (moved from the old page; its result line adds "tidak ditimpa karena sudah diubah di aplikasi: N" from `keptEdited`).

- [ ] **Step 3: Form** `/dashboard/arsip-lama/baru` (redirect to the list for `USER`). Fields in this order with these labels: Jenis surat (all active types; helper text "Bila tidak ada yang cocok, pilih yang terdekat dan tulis jenis aslinya di Catatan."), Unit (locked to the session unit for ADMIN_UNIT), Arah, Nomor surat ("Kosongkan bila surat tidak bernomor"), Tanggal surat, Catatan tanggal ("Misal: sekitar Maret 1998"), Perihal, Tujuan / Pengirim, Lokasi dokumen fisik ("Misal: Lemari B, boks 12, map 1998"), Asal pindaian (Dokumen asli / Salinan / Tidak ada dokumen fisik), Rahasia (checkbox, helper "Hanya Admin Unit dan Super Admin yang bisa melihat"), Catatan, Berkas pindaian (optional; "PDF atau gambar, maksimal 25 MB. Surat berhalaman banyak dijadikan satu PDF."). On leaving the Nomor field with a value, call `GET /api/arsip-lama?nomorExact=…&unitId=…&pageSize=1` and, when `total > 0`, show "Nomor ini sudah ada di Arsip Lama unit ini (N catatan). Tetap bisa disimpan." Submit: `POST /api/arsip-lama`, then, if a file was chosen, `uploadOldArchiveFile` and `POST /api/arsip-lama/[id]/files`; go to the detail page either way, and if only the upload failed show "Catatan tersimpan, tetapi berkas gagal diunggah. Unggah ulang dari halaman ini."

- [ ] **Step 4: Detail page** `/dashboard/arsip-lama/[id]` (404 page when the API answers 403 or 404). Sections: data (with an "Ubah data" form using the same fields, for those who may edit); "Berkas" — inline preview in an `<iframe>` of `/api/arsip-lama/[id]/files/[fileId]` for PDF/images, file name, size, "Sidik jari (SHA-256)" in monospace with a copy button, "Diunggah oleh … pada …", last check ("Terakhir diperiksa … — cocok / TIDAK COCOK / berkas tidak ditemukan"), buttons "Periksa keutuhan" and, for editors, "Unggah berkas" or "Ganti berkas" (asks "Alasan penggantian", min 10 characters); after an attach, if `duplicates.viewable.length + duplicates.hiddenCount > 0`, show "Berkas yang sama sudah ada di: [links to viewable]" and, when `hiddenCount > 0`, "dan N arsip lain yang tidak bisa Anda lihat."; "Riwayat versi" (older versions, each openable, with its replace reason); "Riwayat perubahan" (from `history`: time, actor e-mail, event in plain Indonesian, changed fields before → after). SUPER_ADMIN controls: "Tampilkan ke publik" / "Sembunyikan dari publik" (disabled with the API's reason for non-SK/SE or confidential records) and "Tarik catatan" (asks for a reason; confirm text "Catatan yang ditarik tidak bisa diubah lagi dan tidak bisa dikembalikan."). A withdrawn record shows a banner with reason, who and when, and no edit controls. A `MISMATCH` or `MISSING` result is shown as a red alert: "Berkas di penyimpanan tidak sama dengan saat diunggah. Laporkan ke Super Admin."

- [ ] **Step 5: Navigation and cleanup.** In `src/components/app/sidebar.tsx` remove the `SYSTEM_NAV` entry "Review SK Legacy" and add `{ href: "/dashboard/arsip-lama", label: "Arsip Lama", icon: <an archive icon from lucide-react> }` to `PRIMARY_NAV` right after "Pengarsipan", so every role sees it. Turn the old page into a redirect and delete the three superseded files. `grep -rn "legacy-decrees" src` must then show only the import route, the redirect page and `import-button.tsx`.

- [ ] **Step 6: User guide.** Add a section "Arsip Lama" to `docs/panduan-pengguna.md` and the same content, in that page's existing style, to the in-app guide `src/app/dashboard/panduan/page.tsx` (it has its own content and does not read the markdown file): what it is for, who can add and see what, how to add a letter, what the fingerprint means (proves the file has not changed since upload; the paper original still matters, so fill in its location), how to replace a file, and that nothing can be deleted.

- [ ] **Step 7: Verify and commit**

Run: `npx tsc --noEmit && npx eslint --no-eslintrc -c .eslintrc.json src __tests__ && npx vitest run`
Expected: no type errors, 0 lint errors, all tests pass.

```bash
git add -A src/app/dashboard/arsip-lama src/app/dashboard/panduan src/app/dashboard/legacy-decrees src/app/api/legacy-decrees src/components/app/sidebar.tsx src/lib/upload-client.ts docs/panduan-pengguna.md
git commit -m "feat(arsip-lama): list, form and detail screens; retire the SK legacy review page"
```

---

### Task 9: Check on the demo site (needs the project owner)

Deploying is the owner's call; do not deploy without their go-ahead. Target: `persuratan-demo` (its build applies the migration to the demo database only). Production is not touched in this plan.

- [ ] **Step 1:** With the owner's go-ahead, deploy the branch to `persuratan-demo` the way `logs/2026-11-14-merge-pr49.md` describes, and confirm the build log shows migration `20261116000000_arsip_lama` applied.
- [ ] **Step 2:** As `admin.feb`: add an old letter with a small PDF; confirm the fingerprint shows, "Periksa keutuhan" says cocok, and the record does not appear in `/dashboard/archives` or in any report.
- [ ] **Step 3:** Upload and preview a PDF close to 25 MB. If the preview or download fails (Vercel response limit), record the largest size that works and lower `OLD_ARCHIVE_MAX_BYTES` and the copy to match in a follow-up commit.
- [ ] **Step 4:** Replace the file; confirm the old version is still openable under "Riwayat versi".
- [ ] **Step 5:** As `staf.feb` (USER): the record is visible; after `admin.feb` marks it Rahasia it is gone from the list and its URL answers not found. As another unit's admin: not visible.
- [ ] **Step 6:** As `superadmin`: the BP3M rows are listed without files; rows that were hidden from the public are marked Rahasia; `/publik/sk` shows the same results as before the deploy for the query "tax center"; withdraw a test record and confirm it disappears from the default list.
- [ ] **Step 7:** Create one letter the normal way (`/dashboard/generate`) before and after adding an old letter in the same unit and type; the two numbers are consecutive.
- [ ] **Step 8:** Write the results to `logs/YYYY-MM-DD.md`, including anything that could not be checked.
