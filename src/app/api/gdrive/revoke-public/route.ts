import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { gdriveAvailable, revokePublicAccess } from "@/lib/gdrive";

const schema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().max(60).nullable().optional(),
});

/**
 * POST /api/gdrive/revoke-public   (SUPER_ADMIN only)
 *
 * One-off cleanup for files uploaded before Drive files became private: they
 * were shared as "anyone with the link". Removes that permission, in batches
 * so it fits a serverless time limit. Idempotent; call again with the
 * returned `nextCursor` until it is null.
 *
 * Runs on the deployed app because the Drive service-account key lives only
 * in the Vercel environment.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  if (!gdriveAvailable()) {
    return NextResponse.json({ error: "Google Drive tidak terkonfigurasi" }, { status: 501 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }
  const limit = parsed.data.limit ?? 25;

  const rows = await prisma.archive.findMany({
    where: { gdriveFileId: { not: null } },
    orderBy: { id: "asc" },
    take: limit,
    ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {}),
    select: { id: true, gdriveFileId: true },
  });

  let revoked = 0;
  const failed: string[] = [];
  for (const row of rows) {
    try {
      revoked += await revokePublicAccess(row.gdriveFileId!);
    } catch {
      failed.push(row.id);
    }
  }

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "GdrivePublicAccess",
    metadata: { processed: rows.length, revoked, failedCount: failed.length },
  });

  return NextResponse.json({ processed: rows.length, revoked, failed, nextCursor });
}
