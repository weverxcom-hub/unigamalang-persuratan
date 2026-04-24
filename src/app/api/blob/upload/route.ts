import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { BLOB_AVAILABLE, uploadToBlob } from "@/lib/blob";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/blob/upload
 *
 * Multipart form upload. Returns `{ url, pathname, contentType, fileName }` on
 * success. When Vercel Blob is not configured, returns `501 BLOB_UNAVAILABLE`
 * so the client can fall back to inline base64.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

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

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File wajib diisi" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Hanya gambar (PNG/JPG/WEBP/GIF) atau PDF yang diperbolehkan" },
      { status: 400 }
    );
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Ukuran file terlalu besar (maks. 5MB)" },
      { status: 400 }
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "file";
  const pathname = `persuratan/${session.userId}/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const up = await uploadToBlob(pathname, buffer, { contentType: file.type });
    return NextResponse.json({
      url: up.url,
      pathname: up.pathname,
      contentType: up.contentType,
      fileName: file.name,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/blob/upload] error", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengunggah ke Blob" },
      { status: 500 }
    );
  }
}
