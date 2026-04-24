// Vercel Blob wrapper. All direct interaction with `@vercel/blob` lives here so
// the rest of the app treats uploads as "hand me a file, get back a URL +
// pathname". When `BLOB_READ_WRITE_TOKEN` is unset we fall back to the
// legacy inline base64 path and the caller can decide what to persist.

import { del, put, type PutCommandOptions } from "@vercel/blob";

export const BLOB_AVAILABLE = !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.VERCEL;

export interface UploadedBlob {
  url: string;
  pathname: string;
  contentType: string;
}

export async function uploadToBlob(
  pathname: string,
  body: Blob | ArrayBuffer | Uint8Array | File,
  opts?: Pick<PutCommandOptions, "contentType" | "cacheControlMaxAge">
): Promise<UploadedBlob> {
  if (!BLOB_AVAILABLE) {
    throw new Error(
      "Vercel Blob tidak dikonfigurasi (BLOB_READ_WRITE_TOKEN kosong)."
    );
  }
  // `put` accepts Blob | ReadableStream | Buffer | File — coerce ArrayBuffer/
  // Uint8Array into a Buffer so we accept all the common Node/Edge input types.
  const putBody =
    body instanceof ArrayBuffer
      ? Buffer.from(body)
      : body instanceof Uint8Array
      ? Buffer.from(body.buffer, body.byteOffset, body.byteLength)
      : body;
  const blob = await put(pathname, putBody, {
    access: "public",
    addRandomSuffix: true,
    contentType: opts?.contentType,
    cacheControlMaxAge: opts?.cacheControlMaxAge ?? 60 * 60 * 24 * 365,
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
    contentType: opts?.contentType ?? "application/octet-stream",
  };
}

export async function deleteFromBlob(urlOrPathname: string): Promise<void> {
  if (!BLOB_AVAILABLE) return;
  try {
    await del(urlOrPathname);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[blob] delete failed", e);
  }
}
