/**
 * Build a human-readable filename for an archive's stored proof file.
 *
 * Format: `{nomor_safe}_{subject_slug}.{ext}`
 *
 *   - `nomor_safe` is the letter number with `/` replaced by `_` so Drive
 *     does not interpret it as a folder path. Other special characters are
 *     preserved (Drive accepts them in filenames).
 *
 *   - `subject_slug` is an ASCII-safe slug of the subject (max 60 chars),
 *     keeping spaces as `_`, stripping punctuation that confuses file
 *     managers, and collapsing repeated underscores.
 *
 *   - `ext` is taken from `originalFilename` when present so Word docs etc.
 *     keep their extension; defaults to inferring from `mimeType`.
 *
 * Example: `001_UNIGA_SK_IV_2026_Penetapan_Dosen_Pembimbing.pdf`
 */
const SUBJECT_MAX_LEN = 60;

function inferExtension(
  originalFilename: string | null,
  mimeType: string | null
): string {
  if (originalFilename) {
    const m = /\.([A-Za-z0-9]{1,8})$/.exec(originalFilename);
    if (m) return m[1].toLowerCase();
  }
  if (mimeType) {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.startsWith("image/jpeg")) return "jpg";
    if (mimeType.startsWith("image/png")) return "png";
    if (mimeType.includes("wordprocessingml")) return "docx";
    if (mimeType === "application/msword") return "doc";
  }
  return "bin";
}

function slugifySubject(subject: string): string {
  // Strip diacritics, keep ASCII alnum + underscore.
  const ascii = subject
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 _-]+/g, "")
    .trim();
  const slug = ascii.replace(/[\s-]+/g, "_").replace(/_+/g, "_");
  if (slug.length <= SUBJECT_MAX_LEN) return slug || "arsip";
  // Cut on a word boundary if possible to avoid mid-word truncation.
  const cut = slug.slice(0, SUBJECT_MAX_LEN);
  const lastUnder = cut.lastIndexOf("_");
  return lastUnder > SUBJECT_MAX_LEN * 0.6 ? cut.slice(0, lastUnder) : cut;
}

function safeNumber(number: string): string {
  return number.replace(/\//g, "_").replace(/\s+/g, "");
}

export function buildArchiveFilename(args: {
  number: string;
  subject: string;
  originalFilename?: string | null;
  mimeType?: string | null;
}): string {
  const num = safeNumber(args.number);
  const subj = slugifySubject(args.subject);
  const ext = inferExtension(args.originalFilename ?? null, args.mimeType ?? null);
  return `${num}_${subj}.${ext}`;
}
