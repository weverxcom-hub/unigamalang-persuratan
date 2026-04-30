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

export const DEFAULT_FORMAT_TEMPLATE =
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
