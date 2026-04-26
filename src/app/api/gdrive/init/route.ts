import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { gdriveAvailable, createResumableSession } from "@/lib/gdrive";

const ALLOWED_MIME = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — Drive resumable upload bypasses the 4.5MB Vercel cap.

const schema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().nonnegative().max(MAX_SIZE).optional(),
});

/**
 * POST /api/gdrive/init
 *
 * Authenticated callers ask the server to open a Drive resumable upload
 * session. The browser then PUTs file bytes directly to the returned
 * `uploadUrl`; bytes never traverse our serverless function (which would
 * cap at 4.5MB on Vercel).
 *
 * Returns 501 GDRIVE_UNAVAILABLE if the integration env vars are missing,
 * so the client can fall back to Vercel Blob.
 */
export async function POST(req: Request) {
  if (!gdriveAvailable()) {
    return NextResponse.json(
      {
        error: "GDRIVE_UNAVAILABLE",
        message:
          "Google Drive belum dikonfigurasi (GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_PARENT_FOLDER_ID kosong).",
      },
      { status: 501 }
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }

  const { filename, mimeType, size } = parsed.data;
  if (!ALLOWED_MIME.includes(mimeType)) {
    return NextResponse.json(
      { error: `Jenis file ${mimeType} tidak diizinkan` },
      { status: 400 }
    );
  }
  if (size != null && size > MAX_SIZE) {
    return NextResponse.json(
      { error: `Ukuran file melebihi ${Math.floor(MAX_SIZE / 1024 / 1024)}MB` },
      { status: 400 }
    );
  }

  // Sanitise the filename: strip path separators, prepend timestamp+userId so
  // collisions never happen and we have a paper trail in Drive.
  const safe = filename.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180);
  const stamped = `${Date.now()}-${session.userId.slice(0, 8)}-${safe}`;

  try {
    const sess = await createResumableSession(stamped, mimeType);
    return NextResponse.json({
      uploadUrl: sess.uploadUrl,
      filename: sess.filename,
      mimeType: sess.mimeType,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/gdrive/init] createResumableSession failed", e);
    return NextResponse.json(
      {
        error:
          "Gagal membuka sesi upload Google Drive. Periksa konfigurasi service account dan akses folder.",
      },
      { status: 500 }
    );
  }
}
