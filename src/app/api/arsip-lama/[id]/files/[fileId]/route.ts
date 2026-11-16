import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewOldArchive } from "@/lib/arsip-lama/access";
import { DriveFileMissingError, openFileStream, safeInlineMime } from "@/lib/gdrive";

/**
 * GET /api/arsip-lama/[id]/files/[fileId]
 *
 * Streams one version of a scan from the private Drive folder. [fileId] is
 * LegacyDecreeFile.id; the Drive id never leaves the server.
 */
export async function GET(
  _req: Request,
  { params: paramsPromise }: { params: Promise<{ id: string; fileId: string }> }
) {
  const { id, fileId } = await paramsPromise;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const decree = await prisma.legacyDecree.findUnique({
    where: { id },
    select: { id: true, unitId: true, confidential: true, withdrawnAt: true },
  });
  if (!decree) return NextResponse.json({ error: "Data tidak ditemukan" }, { status: 404 });
  if (!canViewOldArchive(session, decree)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const row = await prisma.legacyDecreeFile.findUnique({
    where: { id: fileId },
    select: { id: true, decreeId: true, gdriveFileId: true, fileName: true },
  });
  if (!row || row.decreeId !== id) {
    return NextResponse.json({ error: "Berkas tidak ditemukan" }, { status: 404 });
  }

  let file;
  try {
    file = await openFileStream(row.gdriveFileId);
  } catch (e) {
    if (e instanceof DriveFileMissingError || (e as { code?: unknown } | null)?.code === 404) {
      return NextResponse.json({ error: "Berkas tidak ditemukan di Google Drive" }, { status: 404 });
    }
    // eslint-disable-next-line no-console
    console.error("[/api/arsip-lama/[id]/files/[fileId]] drive error", e);
    return NextResponse.json({ error: "Gagal memuat file dari Google Drive" }, { status: 502 });
  }

  const inlineMime = safeInlineMime(file.mimeType);
  const displayName = (row.fileName || file.name).replace(/[\r\n"]/g, "_");
  const headers = new Headers({
    "Content-Type": inlineMime ?? "application/octet-stream",
    "Content-Disposition": `${inlineMime ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(displayName)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });
  if (file.size != null) headers.set("Content-Length", String(file.size));

  return new Response(Readable.toWeb(file.stream as Readable) as ReadableStream, { headers });
}
