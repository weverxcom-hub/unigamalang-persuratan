import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewProof } from "@/lib/archive-access";
import { openFileStream, safeInlineMime } from "@/lib/gdrive";

/**
 * GET /api/archives/[id]/proof/file
 *
 * Streams a proof file that lives in the (private) Google Drive folder.
 * The Drive file is not shared publicly, so this route is the only way to
 * read it: it applies the app's own access rules, then pipes the bytes from
 * Drive using the service account.
 */
export async function GET(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const archive = await prisma.archive.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, unitId: true, gdriveFileId: true, fileName: true },
  });
  if (!archive) return NextResponse.json({ error: "Arsip tidak ditemukan" }, { status: 404 });

  if (!(await canViewProof(session, archive))) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  if (!archive.gdriveFileId) {
    return NextResponse.json({ error: "Bukti tidak tersimpan di Google Drive" }, { status: 404 });
  }

  let file;
  try {
    file = await openFileStream(archive.gdriveFileId);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[/api/archives/[id]/proof/file] drive error", e);
    return NextResponse.json({ error: "Gagal memuat file dari Google Drive" }, { status: 502 });
  }

  const inlineMime = safeInlineMime(file.mimeType);
  const displayName = (archive.fileName ?? file.name).replace(/[\r\n"]/g, "_");
  const headers = new Headers({
    "Content-Type": inlineMime ?? "application/octet-stream",
    "Content-Disposition": `${inlineMime ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(displayName)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  if (file.size != null) headers.set("Content-Length", String(file.size));

  return new Response(Readable.toWeb(file.stream as Readable) as ReadableStream, { headers });
}
