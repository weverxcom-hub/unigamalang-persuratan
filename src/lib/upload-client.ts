"use client";
import { upload } from "@vercel/blob/client";

// Vercel's serverless body limit is 4.5MB; a 3MB binary file becomes a
// ~4MB JSON-encoded data URL once base64-wrapped, leaving very little
// headroom. Cap the inline path at 2MB binary so JSON requests stay
// comfortably under the limit. Larger files require Vercel Blob.
export const INLINE_MAX_BYTES = 2 * 1024 * 1024;
export const BLOB_MAX_BYTES = 5 * 1024 * 1024;
// Drive can comfortably handle large attachments; we still cap to keep
// browser memory + UX reasonable. Server-side init enforces the same limit.
export const GDRIVE_MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export type UploadedAsset =
  | { kind: "gdrive"; fileName: string; url: string; fileId: string }
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

interface ResumablePutResponse {
  id?: string;
  name?: string;
  webViewLink?: string;
}

async function tryGdriveUpload(file: File): Promise<UploadedAsset | null> {
  // Step 1: ask the server for a resumable upload session URL.
  const initRes = await fetch("/api/gdrive/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });
  if (initRes.status === 501) return null; // GDRIVE_UNAVAILABLE — fall back
  if (!initRes.ok) {
    const data = await initRes.json().catch(() => ({}));
    throw new UploadError(data.error || "Gagal membuka sesi upload Drive");
  }
  const { uploadUrl } = (await initRes.json()) as { uploadUrl: string };

  // Step 2: PUT bytes directly to Drive (browser ↔ Drive, no Vercel hop).
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });
  if (!putRes.ok) {
    throw new UploadError(`Gagal mengunggah ke Drive (HTTP ${putRes.status})`);
  }
  const meta = (await putRes.json().catch(() => ({}))) as ResumablePutResponse;
  if (!meta.id) {
    throw new UploadError("Drive tidak mengembalikan ID file");
  }

  // Step 3: ask the server to mark the file public-readable + return URL.
  const finRes = await fetch("/api/gdrive/finalise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId: meta.id }),
  });
  if (!finRes.ok) {
    const data = await finRes.json().catch(() => ({}));
    throw new UploadError(data.error || "Gagal menyelesaikan upload Drive");
  }
  const { file: finalFile } = (await finRes.json()) as {
    file: { id: string; name: string; webViewLink: string };
  };
  return {
    kind: "gdrive",
    fileName: file.name,
    url: finalFile.webViewLink,
    fileId: finalFile.id,
  };
}

/**
 * Upload a user-selected file with graceful degradation:
 *
 * 1. Try Google Drive resumable upload (server gives the browser a session
 *    URL; bytes go straight to Drive, bypassing Vercel's 4.5MB body cap).
 * 2. If GDrive is not configured, fall back to direct client → Vercel Blob
 *    upload via `@vercel/blob/client` (cap: 5MB).
 * 3. If Blob is also not configured, fall back to inline base64. Files
 *    larger than INLINE_MAX_BYTES (2MB) are rejected because the JSON-
 *    encoded data URL would otherwise exceed the body limit.
 */
export async function uploadProofAsset(
  userId: string,
  file: File
): Promise<UploadedAsset> {
  if (!ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
    throw new UploadError("Hanya gambar, PDF, atau Word yang diperbolehkan.");
  }
  if (file.size > GDRIVE_MAX_BYTES) {
    throw new UploadError(
      `Ukuran file melebihi ${Math.floor(GDRIVE_MAX_BYTES / 1024 / 1024)}MB.`
    );
  }

  // Try Google Drive first (preferred persistent storage).
  try {
    const asset = await tryGdriveUpload(file);
    if (asset) return asset;
  } catch (e) {
    if (e instanceof UploadError) throw e;
    throw new UploadError(
      e instanceof Error ? e.message : "Gagal mengunggah ke Google Drive"
    );
  }

  // Fallback: Vercel Blob (existing behavior). Only reachable when GDrive is
  // not configured. Re-enforce the smaller 5MB Blob cap.
  if (file.size > BLOB_MAX_BYTES) {
    throw new UploadError("Ukuran file melebihi 5MB (Vercel Blob cap).");
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
    const message = e instanceof Error ? e.message : String(e);
    const blobUnavailable = /BLOB_UNAVAILABLE|501/.test(message);
    if (!blobUnavailable) {
      throw new UploadError(message || "Gagal mengunggah ke Blob");
    }
  }

  // Inline base64 fallback path.
  if (file.size > INLINE_MAX_BYTES) {
    throw new UploadError(
      "Storage belum dikonfigurasi dan ukuran file melebihi 2MB. Mohon perkecil/kompres foto."
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
  if (asset.kind === "gdrive") {
    return {
      fileName: asset.fileName,
      fileUrl: asset.url,
      gdriveFileId: asset.fileId,
    };
  }
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
