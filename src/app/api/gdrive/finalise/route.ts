import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { gdriveAvailable, finaliseUpload } from "@/lib/gdrive";

const schema = z.object({
  fileId: z.string().min(8).max(120),
});

/**
 * POST /api/gdrive/finalise
 *
 * Called by the browser after a successful resumable PUT. Validates that
 * the file actually lives under our parent folder, grants "anyone with the
 * link" read access, and returns the canonical `webViewLink` to be saved
 * on the Archive row.
 */
export async function POST(req: Request) {
  if (!gdriveAvailable()) {
    return NextResponse.json(
      { error: "Google Drive tidak terkonfigurasi" },
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

  try {
    const file = await finaliseUpload(parsed.data.fileId);
    return NextResponse.json({ file });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/gdrive/finalise] error", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Gagal menyelesaikan upload Google Drive",
      },
      { status: 400 }
    );
  }
}
