import { pad3, toRoman } from "./utils";

export interface FormatContext {
  sequence: number;
  unitCode: string;
  letterTypeCode: string;
  month: number; // 1..12
  year: number;
}

// Supported template tokens. Every substitution is lower/upper bracketed so we
// also accept lowercase for convenience.
const TOKENS: Record<string, (ctx: FormatContext) => string> = {
  "[NO]": (c) => pad3(c.sequence),
  "[SEQ]": (c) => String(c.sequence),
  "[UNIT_CODE]": (c) => c.unitCode,
  "[UNIT]": (c) => c.unitCode,
  "[TYPE_CODE]": (c) => c.letterTypeCode,
  "[TYPE]": (c) => c.letterTypeCode,
  "[ROMAN_MONTH]": (c) => toRoman(c.month),
  "[MONTH]": (c) => String(c.month),
  "[YEAR]": (c) => String(c.year),
};

/**
 * Default format template for letter numbering.
 *
 * History:
 *   - Pre-April 2026: `[NO]/[UNIT_CODE]/[TYPE_CODE]/[ROMAN_MONTH]/[YEAR]`
 *   - April 2026 onwards: `[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]`
 *     (TYPE_CODE before UNIT_CODE — required by BAU UNIGA TechSpec). Existing
 *     archive numbers are NOT migrated; only newly allocated numbers and the
 *     `Unit.formatTemplate` default are updated.
 */
export const DEFAULT_FORMAT_TEMPLATE =
  "[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]";

/** The pre-April 2026 default. Used by the migration to identify units that
 * still use the old default (so we can flip them to the new one) without
 * touching admins' custom templates. */
export const LEGACY_DEFAULT_FORMAT_TEMPLATE =
  "[NO]/[UNIT_CODE]/[TYPE_CODE]/[ROMAN_MONTH]/[YEAR]";

export function renderFormat(template: string, ctx: FormatContext): string {
  let out = template ?? DEFAULT_FORMAT_TEMPLATE;
  for (const [token, fn] of Object.entries(TOKENS)) {
    // Case-insensitive global replace — works for "[no]" and "[NO]" alike.
    const re = new RegExp(escapeRegExp(token), "gi");
    out = out.replace(re, fn(ctx));
  }
  return out;
}

/**
 * Split a template around the first `[NO]` (or `[SEQ]`) token so that the UI
 * can render the prefix and suffix as fixed read-only text and only let the
 * user edit the sequence portion (used by the "Surat Sisipan" / fill-in-the-
 * blanks flow). Tokens other than `[NO]`/`[SEQ]` in either side are rendered
 * normally with the supplied context. If the template has no `[NO]` token the
 * suffix is empty and the entire rendered template is returned as the prefix.
 */
export function splitTemplate(
  template: string,
  ctx: Omit<FormatContext, "sequence">
): { prefix: string; suffix: string } {
  const t = template ?? DEFAULT_FORMAT_TEMPLATE;
  const m = t.match(/\[NO\]|\[SEQ\]/i);
  const ctxRender: FormatContext = { ...ctx, sequence: 0 };
  if (!m) {
    return { prefix: renderFormat(t, ctxRender), suffix: "" };
  }
  const idx = m.index!;
  const before = t.slice(0, idx);
  const after = t.slice(idx + m[0].length);
  return {
    prefix: renderFormat(before, ctxRender),
    suffix: renderFormat(after, ctxRender),
  };
}

const SEQUENCE_TOKEN = /\[NO\]|\[SEQ\]/i;

/**
 * The sequence number as `template` would print it: zero-padded for `[NO]`,
 * bare for `[SEQ]`. Follows the first sequence token, like `splitTemplate`,
 * so a client-side preview matches what `renderFormat` produces on the server.
 */
export function formatSequence(template: string, sequence: number): string {
  const token = (template ?? "").match(SEQUENCE_TOKEN)?.[0].toUpperCase();
  return token === "[SEQ]" ? String(sequence) : pad3(sequence);
}

const REQUIRED_PARTS: { label: string; tokens: RegExp }[] = [
  { label: "nomor urut ([NO] atau [SEQ])", tokens: SEQUENCE_TOKEN },
  { label: "kode unit ([UNIT_CODE])", tokens: /\[UNIT_CODE\]|\[UNIT\]/i },
  { label: "kode jenis ([TYPE_CODE])", tokens: /\[TYPE_CODE\]|\[TYPE\]/i },
  { label: "tahun ([YEAR])", tokens: /\[YEAR\]/i },
];

/**
 * Counters run per (unit, letter type, year), so a template that leaves any
 * of those out — or the sequence itself — can render the same number twice.
 * Returns the first missing part as a user-facing message, or null when the
 * template is safe.
 */
export function validateNumberTemplate(template: string): string | null {
  const missing = REQUIRED_PARTS.find((part) => !part.tokens.test(template ?? ""));
  return missing ? `Template harus memuat ${missing.label}` : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
