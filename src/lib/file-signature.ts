// Magic-byte (file signature) verification for the inline base64 upload
// fallback path (see `src/app/api/archives/route.ts` and
// `src/app/api/archives/[id]/proof/route.ts`).
//
// Why this exists: the inline base64 path is the *only* upload path where
// the Next.js server ever holds the raw file bytes — Google Drive and
// Vercel Blob uploads go straight from the browser to storage, so the
// server only ever sees a URL for those. Today the inline path is trusted
// purely on the `data:<mime>;base64,` prefix the client sends, which is
// attacker-controlled: a `.exe` renamed to declare `image/png` sails
// through untouched (docs/FILE-UPLOAD-SECURITY.md, finding D4).
//
// This module cross-checks the *actual* bytes against a small set of known
// magic numbers for the MIME types we accept, so a mismatched payload is
// rejected before it is ever persisted to the database.
//
// This is a lightweight, dependency-free complement to (not a replacement
// for) real malware scanning (ClamAV / VirusTotal — see
// docs/FILE-UPLOAD-SECURITY.md "Recommended: ClamAV Integration"), which
// still requires an external service and is a separate follow-up.

export type SniffableMime =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif"
  | "application/pdf";

interface Signature {
  mime: SniffableMime;
  /** Byte offset the signature must be found at. */
  offset: number;
  bytes: number[];
}

// RIFF....WEBP needs a second check at offset 8, so WEBP is handled with a
// dedicated matcher instead of a single flat byte run.
const SIGNATURES: Signature[] = [
  { mime: "image/png", offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }, // "GIF8" (87a or 89a)
  { mime: "application/pdf", offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }, // "%PDF"
];

function matchesBytes(buf: Buffer, sig: Signature): boolean {
  if (buf.length < sig.offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buf[sig.offset + i] !== sig.bytes[i]) return false;
  }
  return true;
}

function isWebp(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const riff = buf.toString("ascii", 0, 4) === "RIFF";
  const webp = buf.toString("ascii", 8, 12) === "WEBP";
  return riff && webp;
}

/**
 * Best-effort detection of a buffer's real file type from its magic bytes.
 * Returns null if none of the accepted signatures match.
 */
export function sniffMime(buf: Buffer): SniffableMime | null {
  if (isWebp(buf)) return "image/webp";
  for (const sig of SIGNATURES) {
    if (matchesBytes(buf, sig)) return sig.mime;
  }
  return null;
}

/**
 * True when `buf`'s actual content matches the MIME type the client
 * declared. JPEG is treated as one family (`image/jpeg` / `image/jpg`
 * both map to the same magic bytes).
 */
export function matchesDeclaredMime(buf: Buffer, declaredMime: string): boolean {
  const sniffed = sniffMime(buf);
  if (!sniffed) return false;
  const normalizedDeclared = declaredMime.toLowerCase() === "image/jpg" ? "image/jpeg" : declaredMime.toLowerCase();
  return sniffed === normalizedDeclared;
}

/**
 * Parse a `data:<mime>;base64,<payload>` URL into its MIME type and decoded
 * bytes. Returns null if the string isn't a well-formed base64 data URL.
 */
export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const match = /^data:([^;]+);base64,([\s\S]+)$/i.exec(dataUrl);
  if (!match) return null;
  const [, mime, payload] = match;
  try {
    return { mime: mime.toLowerCase(), buffer: Buffer.from(payload, "base64") };
  } catch {
    return null;
  }
}

/**
 * Validate that a `data:` URL's declared MIME type matches its actual
 * content. Intended for the inline base64 upload fallback only.
 */
export function validateDataUrlContent(dataUrl: string): { ok: true } | { ok: false; reason: string } {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, reason: "Format data URL tidak valid" };
  if (!matchesDeclaredMime(parsed.buffer, parsed.mime)) {
    return {
      ok: false,
      reason:
        "Isi file tidak sesuai dengan tipe yang dideklarasikan (kemungkinan file disamarkan/rusak).",
    };
  }
  return { ok: true };
}
