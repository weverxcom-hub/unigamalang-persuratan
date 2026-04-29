import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const setSchema = z.object({
  unitId: z.string().min(1),
  letterTypeId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  last: z.number().int().min(0).max(99999),
});

/**
 * GET /api/numbering/sequence?unitId=...&year=YYYY — return ALL counters for
 * a unit in a year, one per active letter type. Letter types that have no
 * row yet are returned with `last: 0` so the UI can show every jenis surat
 * the admin can configure.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId") ?? "";
  const yearRaw = url.searchParams.get("year");
  const year = yearRaw ? Number(yearRaw) : new Date().getFullYear();
  if (!unitId || !Number.isInteger(year)) {
    return NextResponse.json({ error: "Parameter tidak valid" }, { status: 400 });
  }
  const [letterTypes, sequences] = await Promise.all([
    prisma.letterType.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
    }),
    prisma.numberingSequence.findMany({ where: { unitId, year } }),
  ]);
  const lastByType = new Map(sequences.map((s) => [s.letterTypeId, s.last]));
  return NextResponse.json({
    unitId,
    year,
    rows: letterTypes.map((lt) => ({
      letterTypeId: lt.id,
      letterTypeCode: lt.code,
      letterTypeName: lt.name,
      last: lastByType.get(lt.id) ?? 0,
    })),
  });
}

/**
 * PATCH /api/numbering/sequence — Super Admin sets the per-(unit, jenis,
 * year) counter to a specific value. Used at launch when the sistem mulai
 * dipakai di tengah tahun: admin masukkan nomor terakhir manual per jenis
 * surat (mis. SK=45, ST=23) dan generate berikutnya akan lanjut dari sana.
 *
 * The value passed represents the *last issued* number; the next allocation
 * via `allocateNextNumber` will be `last + 1`.
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = setSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const { unitId, letterTypeId, year, last } = parsed.data;
  const [unit, letterType] = await Promise.all([
    prisma.unit.findUnique({ where: { id: unitId } }),
    prisma.letterType.findUnique({ where: { id: letterTypeId } }),
  ]);
  if (!unit || unit.deletedAt) {
    return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 400 });
  }
  if (!letterType || letterType.deletedAt) {
    return NextResponse.json({ error: "Jenis surat tidak ditemukan" }, { status: 400 });
  }

  const seq = await prisma.numberingSequence.upsert({
    where: { unitId_letterTypeId_year: { unitId, letterTypeId, year } },
    create: { unitId, letterTypeId, year, last },
    update: { last },
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "NumberingSequence",
    targetId: seq.id,
    metadata: {
      unitId,
      unitCode: unit.code,
      letterTypeId,
      letterTypeCode: letterType.code,
      year,
      last,
    },
  });

  return NextResponse.json({
    unitId,
    letterTypeId,
    letterTypeCode: letterType.code,
    year,
    last: seq.last,
  });
}
