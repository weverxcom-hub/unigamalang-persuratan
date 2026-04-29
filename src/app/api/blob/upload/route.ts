import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/auth";
import { BLOB_AVAILABLE } from "@/lib/blob";

const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/blob/upload
 *
 * Issues a short-lived client token so the browser can upload directly to
 * Vercel Blob storage, bypassing the 4.5MB serverless function body limit.
 * The route never receives the file bytes itself — it only authorises and
 * scopes the upload (path prefix, allowed MIME, max size).
 *
 * When Vercel Blob is not configured, returns 501 BLOB_UNAVAILABLE so the
 * client can fall back to inline base64.
 */
export async function POST(req: Request) {
  if (!BLOB_AVAILABLE) {
    return NextResponse.json(
      {
        error: "BLOB_UNAVAILABLE",
        message:
          "Vercel Blob belum dikonfigurasi (BLOB_READ_WRITE_TOKEN kosong). Gunakan fallback base64.",
      },
      { status: 501 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Defence in depth: enforce the path prefix server-side too. The
        // client picks the path but we refuse to sign anything outside the
        // user's directory.
        const expectedPrefix = `persuratan/${session.userId}/`;
        if (!pathname.startsWith(expectedPrefix)) {
          throw new Error("Path tidak diizinkan");
        }
        return {
          allowedContentTypes: ALLOWED_MIME,
          maximumSizeInBytes: MAX_SIZE,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.userId }),
        };
      },
      onUploadCompleted: async () => {
        // No-op: the actual archive row is updated by the caller via
        // /api/archives or /api/archives/[id]/proof once it has the URL.
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/blob/upload] handleUpload error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengunggah ke Blob" },
      { status: 400 }
    );
  }
}
