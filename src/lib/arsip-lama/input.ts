import { z } from "zod";
import { jakartaDateString } from "@/lib/timezone";

// Input rules for Arsip Lama (old-letter archive) records. Shared by the
// create and edit routes; the edit route uses `oldArchiveInput.partial()`.

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const tanggalField = z
  .string()
  .refine(isRealDate, "Tanggal tidak valid (format YYYY-MM-DD)")
  .refine((s) => s <= jakartaDateString(new Date()), "Tanggal tidak boleh di masa depan")
  .nullable();

/** Optional free text: trimmed, blank becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter`)
    .nullable()
    .transform((v) => (v ? v : null));

export const oldArchiveInput = z.object({
  letterTypeId: z.string().min(1, "Jenis surat wajib dipilih"),
  unitId: z.string().min(1, "Unit wajib dipilih"),
  direction: z.enum(["OUTGOING", "INCOMING"]),
  nomor: z.string().trim().max(200, "Nomor maksimal 200 karakter"),
  tanggal: tanggalField,
  tanggalRaw: z.string().trim().max(200, "Teks tanggal maksimal 200 karakter"),
  perihal: z
    .string()
    .trim()
    .min(3, "Perihal minimal 3 karakter")
    .max(2000, "Perihal maksimal 2000 karakter"),
  counterpart: optionalText(300),
  physicalLocation: optionalText(300),
  physicalKind: z.enum(["ASLI", "SALINAN", "TIDAK_ADA"]),
  confidential: z.boolean(),
  catatan: optionalText(2000),
});

export type OldArchiveInput = z.infer<typeof oldArchiveInput>;

/** tanggalRaw to store: the typed text, else "7 Juni 2026"-style from tanggal, else "Tidak diketahui". */
export function resolveTanggalRaw(tanggal: string | null, tanggalRaw: string): string {
  const typed = tanggalRaw.trim();
  if (typed) return typed;
  if (tanggal && isRealDate(tanggal)) {
    const [y, m, d] = tanggal.split("-").map(Number);
    return `${d} ${MONTHS_ID[m - 1]} ${y}`;
  }
  return "Tidak diketahui";
}

function norm(v: unknown): unknown {
  return v instanceof Date ? v.toISOString() : v;
}

/** Keys whose values differ, with before/after, for the audit row. Dates compare by ISO string. */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>
): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = after[key];
    if (a === undefined) continue;
    const b = before[key];
    if (norm(a) !== norm(b)) out[key] = { before: norm(b), after: norm(a) };
  }
  return out;
}
