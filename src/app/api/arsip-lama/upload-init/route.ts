import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { gdriveAvailable, createResumableSession } from "@/lib/gdrive";
import {
  OLD_ARCHIVE_MIME,
  OLD_ARCHIVE_MAX_BYTES,
  stampUploadName,
} from "@/lib/arsip-lama/upload";

const schema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().nonnegative(),
});

/**
 * POST /api/arsip-lama/upload-init
 *
 * Opens a Drive resumable upload session for an old-letter scan. The Drive
 * name is stamped with the uploader's full user id so a later attach step can
 * verify who uploaded the file. Only the session URL is returned, never a
 * Drive link to the file.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  const allowed =
    session.role === "SUPER_ADMIN" ||
    (session.role === "ADMIN_UNIT" && Boolean(session.unitId));
  if (!allowed) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
  }

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

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const { filename, mimeType, size } = parsed.data;
  if (!OLD_ARCHIVE_MIME.includes(mimeType)) {
    return NextResponse.json(
      { error: "Hanya PDF atau gambar yang diperbolehkan untuk arsip lama" },
      { status: 400 }
    );
  }
  if (size > OLD_ARCHIVE_MAX_BYTES) {
    return NextResponse.json(
      { error: `Ukuran file melebihi ${OLD_ARCHIVE_MAX_BYTES / 1024 / 1024}MB` },
      { status: 400 }
    );
  }

  const stamped = stampUploadName(session.userId, filename, Date.now());
  // Forward the browser's Origin so Drive issues a CORS-enabled session URL.
  const origin = req.headers.get("origin");

  try {
    const sess = await createResumableSession(stamped, mimeType, origin);
    return NextResponse.json({ uploadUrl: sess.uploadUrl });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/arsip-lama/upload-init] createResumableSession failed", e);
    return NextResponse.json(
      { error: "Gagal membuka sesi upload Google Drive." },
      { status: 500 }
    );
  }
}
