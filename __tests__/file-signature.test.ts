import { describe, it, expect } from "vitest";
import {
  sniffMime,
  matchesDeclaredMime,
  parseDataUrl,
  validateDataUrlContent,
} from "@/lib/file-signature";

// Minimal-but-real magic bytes for each format, followed by a bit of junk
// so length checks pass without needing a full valid file.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0]);
const GIF_BYTES = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);
const PDF_BYTES = Buffer.from("%PDF-1.4\n%...");
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP"),
  Buffer.from([0, 0]),
]);
// A Windows PE executable (MZ header) disguised as a PNG — the attack this
// module exists to catch.
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

describe("sniffMime", () => {
  it("detects PNG", () => expect(sniffMime(PNG_BYTES)).toBe("image/png"));
  it("detects JPEG", () => expect(sniffMime(JPEG_BYTES)).toBe("image/jpeg"));
  it("detects GIF", () => expect(sniffMime(GIF_BYTES)).toBe("image/gif"));
  it("detects PDF", () => expect(sniffMime(PDF_BYTES)).toBe("application/pdf"));
  it("detects WEBP", () => expect(sniffMime(WEBP_BYTES)).toBe("image/webp"));
  it("returns null for an executable", () => expect(sniffMime(EXE_BYTES)).toBeNull());
  it("returns null for empty/garbage input", () => {
    expect(sniffMime(Buffer.from([]))).toBeNull();
    expect(sniffMime(Buffer.from("just some text"))).toBeNull();
  });
});

describe("matchesDeclaredMime", () => {
  it("accepts a correctly declared PNG", () => {
    expect(matchesDeclaredMime(PNG_BYTES, "image/png")).toBe(true);
  });
  it("treats image/jpg and image/jpeg as the same family", () => {
    expect(matchesDeclaredMime(JPEG_BYTES, "image/jpg")).toBe(true);
    expect(matchesDeclaredMime(JPEG_BYTES, "image/jpeg")).toBe(true);
  });
  it("rejects an executable disguised as a PNG", () => {
    expect(matchesDeclaredMime(EXE_BYTES, "image/png")).toBe(false);
  });
  it("rejects a PDF declared as an image", () => {
    expect(matchesDeclaredMime(PDF_BYTES, "image/png")).toBe(false);
  });
});

describe("parseDataUrl", () => {
  it("parses a well-formed data URL", () => {
    const url = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;
    const parsed = parseDataUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed?.mime).toBe("image/png");
    expect(parsed?.buffer.equals(PNG_BYTES)).toBe(true);
  });
  it("returns null for a non-data-URL string", () => {
    expect(parseDataUrl("not-a-data-url")).toBeNull();
  });
});

describe("validateDataUrlContent", () => {
  it("accepts a data URL whose bytes match the declared MIME", () => {
    const url = `data:application/pdf;base64,${PDF_BYTES.toString("base64")}`;
    expect(validateDataUrlContent(url)).toEqual({ ok: true });
  });
  it("rejects a renamed executable declaring image/png", () => {
    const url = `data:image/png;base64,${EXE_BYTES.toString("base64")}`;
    const result = validateDataUrlContent(url);
    expect(result.ok).toBe(false);
  });
  it("rejects a malformed data URL", () => {
    const result = validateDataUrlContent("data:image/png;base64,");
    expect(result.ok).toBe(false);
  });
});
