"use client";
import { upload } from "@vercel/blob/client";

// Vercel's serverless body limit is 4.5MB; a 3MB binary file becomes a
// ~4MB JSON-encoded data URL once base64-wrapped, leaving very little
// headroom. Cap the inline path at 2MB binary so JSON requests stay
// comfortably under the limit. Larger files require Vercel Blob.
export const INLINE_MAX_BYTES = 2 * 1024 * 1024;
export const BLOB_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = ["image/", "application/pdf"];

export type UploadedAsset =
  | { kind: "blob"; fileName: string; url: string; pathname: string }
  | { kind: "inline"; fileName: string; fileDataUrl: string };

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

function sanitizePathSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
}

/**
 * Upload a user-selected file with graceful degradation:
 *
 * 1. Try direct client → Vercel Blob upload via `@vercel/blob/client`.
 *    This bypasses the 4.5MB serverless body limit and supports up to 5MB
 *    (capped server-side by /api/blob/upload's `maximumSizeInBytes`).
 * 2. If the token endpoint returns 501 (Blob unavailable), fall back to
 *    inline base64. Files > INLINE_MAX_BYTES (2MB) are rejected because
 *    the JSON-encoded data URL would otherwise exceed the body limit.
 */
export async function uploadProofAsset(
  userId: string,
  file: File
): Promise<UploadedAsset> {
  if (!ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
    throw new UploadError("Hanya gambar atau PDF yang diperbolehkan.");
  }
  if (file.size > BLOB_MAX_BYTES) {
    throw new UploadError("Ukuran file melebihi 5MB.");
  }

  const safeName = sanitizePathSegment(file.name);
  const pathname = `persuratan/${userId}/${Date.now()}-${safeName}`;

  try {
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/blob/upload",
      contentType: file.type || undefined,
    });
    return { kind: "blob", fileName: file.name, url: blob.url, pathname: blob.pathname };
  } catch (e) {
    // The client lib throws if the token endpoint returned non-2xx. When
    // BLOB is unavailable we get a 501; treat that (and only that) as a
    // signal to fall back to inline base64.
    const message = e instanceof Error ? e.message : String(e);
    const blobUnavailable = /BLOB_UNAVAILABLE|501/.test(message);
    if (!blobUnavailable) {
      throw new UploadError(message || "Gagal mengunggah ke Blob");
    }
  }

  // Inline base64 fallback path.
  if (file.size > INLINE_MAX_BYTES) {
    throw new UploadError(
      "Vercel Blob belum dikonfigurasi dan ukuran file melebihi 2MB. Mohon perkecil/kompres foto."
    );
  }
  const fileDataUrl = await readFileAsDataUrl(file);
  return { kind: "inline", fileName: file.name, fileDataUrl };
}

/**
 * Build the request body for /api/archives/[id]/proof or /api/archives POST
 * given an uploaded asset.
 */
export function assetToProofBody(asset: UploadedAsset): Record<string, unknown> {
  if (asset.kind === "blob") {
    return {
      fileName: asset.fileName,
      fileUrl: asset.url,
      blobPathname: asset.pathname,
    };
  }
  return {
    fileName: asset.fileName,
    fileDataUrl: asset.fileDataUrl,
  };
}
