import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// -----------------------------------------------------------------------
// GET /api/publik/sk — public, unauthenticated search over SK/SE decrees.
//
// Deliberately NOT gated by getSession(): the whole point (per BP3M's
// sk-uniga project) is that any prodi/fakultas staff can check whether a
// decree already exists before drafting a duplicate, without needing a
// persuratan account.
//
// Combines two sources:
//   - LegacyDecree: the 1987–2026 BP3M recap (see prisma/import-legacy-decrees.ts)
//   - Archive: SK/EDAR issued through this system going forward
//
// Security: only a safe, minimal field subset is returned — no fileUrl /
// blobPathname / gdriveFileId from Archive (those are internal storage
// locators, not meant for public exposure), no recipient/externalSender/
// createdBy, no disposition or audit data. Only letterType SK/EDAR and
// status ISSUED Archive rows are eligible; anything else in Archive
// (surat masuk, disposisi, draft, other letter types) never reaches this
// endpoint. LegacyDecree rows additionally require isPublic=true — the
// BP3M recap includes personnel/disciplinary decrees (resignations,
// sanctions, one row is a student sexual-harassment case) that must never
// be publicly searchable; see LegacyDecree.isPublic in schema.prisma.
// -----------------------------------------------------------------------

type UnifiedResult = {
  id: string;
  source: "legacy" | "archive";
  nomor: string;
  tanggal: string | null;
  perihal: string;
  unitCode: string | null;
  unitName: string | null;
  jenis: string;
  isComplete: boolean;
  catatan: string | null;
  sourceLink: string | null;
};

// Both sources are fetched in full (up to this cap) and merged/sorted/
// paginated in application code, since they're differently-shaped tables.
// Fine while the combined dataset is in the hundreds to low thousands of
// rows; if this grows much further, replace with a raw SQL UNION view.
const SOURCE_FETCH_CAP = 2000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  const unitId = url.searchParams.get("unitId")?.trim() || undefined;
  const yearParam = url.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize")) || 20));

  const [skType, edarType] = await Promise.all([
    prisma.letterType.findUnique({ where: { code: "SK" } }),
    prisma.letterType.findUnique({ where: { code: "EDAR" } }),
  ]);
  const eligibleLetterTypeIds = [skType?.id, edarType?.id].filter((v): v is string => Boolean(v));

  const yearRange =
    year && !Number.isNaN(year)
      ? { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
      : undefined;

  const [legacyRows, archiveRows] = await Promise.all([
    prisma.legacyDecree.findMany({
      where: {
        isPublic: true,
        ...(unitId ? { unitId } : {}),
        ...(yearRange ? { tanggal: yearRange } : {}),
        ...(q
          ? {
              OR: [
                { perihal: { contains: q, mode: "insensitive" } },
                { nomor: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { unit: { select: { code: true, name: true } }, letterType: { select: { code: true } } },
      orderBy: { tanggal: "desc" },
      take: SOURCE_FETCH_CAP,
    }),
    eligibleLetterTypeIds.length === 0
      ? Promise.resolve([])
      : prisma.archive.findMany({
          where: {
            deletedAt: null,
            status: "ISSUED",
            letterTypeId: { in: eligibleLetterTypeIds },
            ...(unitId ? { unitId } : {}),
            ...(yearRange ? { date: yearRange } : {}),
            ...(q
              ? {
                  OR: [
                    { subject: { contains: q, mode: "insensitive" } },
                    { number: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          include: { unit: { select: { code: true, name: true } }, letterType: { select: { code: true } } },
          orderBy: { date: "desc" },
          take: SOURCE_FETCH_CAP,
        }),
  ]);

  const unified: UnifiedResult[] = [
    ...legacyRows.map(
      (r): UnifiedResult => ({
        id: r.id,
        source: "legacy",
        nomor: r.nomor,
        tanggal: r.tanggal ? r.tanggal.toISOString() : null,
        perihal: r.perihal,
        unitCode: r.unit?.code ?? null,
        unitName: r.unit?.name ?? r.unitLabelRaw,
        jenis: r.letterType.code,
        isComplete: r.isComplete,
        catatan: r.catatan,
        sourceLink: r.sourceLink,
      })
    ),
    ...archiveRows.map(
      (r): UnifiedResult => ({
        id: r.id,
        source: "archive",
        nomor: r.number,
        tanggal: r.date.toISOString(),
        perihal: r.subject,
        unitCode: r.unit?.code ?? r.unitCode,
        unitName: r.unit?.name ?? null,
        jenis: r.letterType?.code ?? r.letterTypeCode,
        isComplete: true,
        catatan: null,
        sourceLink: null,
      })
    ),
  ].sort((a, b) => (b.tanggal ?? "").localeCompare(a.tanggal ?? ""));

  const total = unified.length;
  const start = (page - 1) * pageSize;
  const results = unified.slice(start, start + pageSize);

  return NextResponse.json({
    results,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
