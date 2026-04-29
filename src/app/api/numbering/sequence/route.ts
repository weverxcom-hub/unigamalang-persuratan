import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

const schema = z.object({
  unitId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  last: z.number().int().min(0).max(99999),
});

/**
 * GET /api/numbering/sequence?unitId=...&year=YYYY — return the current
 * `last` value for a unit's per-year counter (0 if unset).
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
  const seq = await prisma.numberingSequence.findUnique({
    where: { unitId_year: { unitId, year } },
  });
  return NextResponse.json({ unitId, year, last: seq?.last ?? 0 });
}

/**
 * PATCH /api/numbering/sequence — Super Admin sets the per-(unit, year)
 * counter to a specific value. Used when the sistem dipakai di tengah tahun
 * dan butuh melanjutkan dari nomor manual (mis. 65 -> next 066).
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
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error?.issues?.[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const { unitId, year, last } = parsed.data;
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit || unit.deletedAt) {
    return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 400 });
  }

  const seq = await prisma.numberingSequence.upsert({
    where: { unitId_year: { unitId, year } },
    create: { unitId, year, last },
    update: { last },
  });

  await audit({
    action: "UPDATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "NumberingSequence",
    targetId: seq.id,
    metadata: { unitId, unitCode: unit.code, year, last },
  });

  return NextResponse.json({ unitId, year, last: seq.last });
}
