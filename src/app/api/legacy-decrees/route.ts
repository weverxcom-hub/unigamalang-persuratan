import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// -----------------------------------------------------------------------
// GET /api/legacy-decrees — SUPER_ADMIN only. Backs the review queue at
// /dashboard/legacy-decrees, where BP3M (or whoever) can toggle isPublic
// per row. Unlike /api/publik/sk this is NOT filtered by isPublic — the
// whole point is to see everything, including what's currently hidden,
// so a hidden row can be reviewed and (if it turns out to be harmless)
// flipped back to public.
// -----------------------------------------------------------------------

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const isPublicParam = url.searchParams.get("isPublic"); // "true" | "false" | null (=all)
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 25));

  const where = {
    ...(isPublicParam === "true" ? { isPublic: true } : {}),
    ...(isPublicParam === "false" ? { isPublic: false } : {}),
    ...(q
      ? {
          OR: [
            { perihal: { contains: q, mode: "insensitive" as const } },
            { nomor: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total, hiddenCount] = await Promise.all([
    prisma.legacyDecree.findMany({
      where,
      include: { unit: { select: { code: true, name: true } }, letterType: { select: { code: true } } },
      orderBy: { noUrutAsli: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.legacyDecree.count({ where }),
    prisma.legacyDecree.count({ where: { isPublic: false } }),
  ]);

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      noUrutAsli: r.noUrutAsli,
      nomor: r.nomor,
      tanggal: r.tanggal ? r.tanggal.toISOString() : null,
      tanggalRaw: r.tanggalRaw,
      perihal: r.perihal,
      unitCode: r.unit?.code ?? null,
      unitName: r.unit?.name ?? r.unitLabelRaw,
      jenis: r.letterType.code,
      isComplete: r.isComplete,
      isPublic: r.isPublic,
      catatan: r.catatan,
      sourceLink: r.sourceLink,
    })),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    hiddenCount,
  });
}
