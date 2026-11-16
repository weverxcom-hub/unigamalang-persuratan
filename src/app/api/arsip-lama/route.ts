import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  canCreateOldArchiveFor,
  oldArchiveListWhere,
} from "@/lib/arsip-lama/access";
import { oldArchiveInput, resolveTanggalRaw } from "@/lib/arsip-lama/input";

function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

/** GET /api/arsip-lama — filtered, paged list of old-letter records. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const base = oldArchiveListWhere(session, sp.get("withdrawn") === "1");
  if (!base) return NextResponse.json({ rows: [], total: 0 });

  const where: Prisma.LegacyDecreeWhereInput = { ...base };

  const q = sp.get("q")?.trim();
  if (q) {
    where.OR = [
      { nomor: { contains: q, mode: "insensitive" } },
      { perihal: { contains: q, mode: "insensitive" } },
      { counterpart: { contains: q, mode: "insensitive" } },
    ];
  }

  const year = sp.get("year");
  if (year === "none") {
    where.tanggal = null;
  } else if (year && /^\d{4}$/.test(year)) {
    const y = Number(year);
    where.tanggal = { gte: new Date(Date.UTC(y, 0, 1)), lt: new Date(Date.UTC(y + 1, 0, 1)) };
  }

  const unitId = sp.get("unitId");
  if (unitId && session.role === "SUPER_ADMIN") where.unitId = unitId;

  const letterTypeId = sp.get("letterTypeId");
  if (letterTypeId) where.letterTypeId = letterTypeId;

  const direction = sp.get("direction");
  if (direction === "OUTGOING" || direction === "INCOMING") where.direction = direction;

  const hasFile = sp.get("hasFile");
  if (hasFile === "1") where.files = { some: { replacedAt: null } };
  else if (hasFile === "0") where.files = { none: { replacedAt: null } };

  const nomorExact = sp.get("nomorExact")?.trim();
  if (nomorExact) where.nomor = { equals: nomorExact, mode: "insensitive" };

  const page = Math.max(1, Math.floor(Number(sp.get("page"))) || 1);
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(sp.get("pageSize"))) || 25));

  const [found, total] = await Promise.all([
    prisma.legacyDecree.findMany({
      where,
      orderBy: [{ tanggal: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nomor: true,
        tanggal: true,
        tanggalRaw: true,
        perihal: true,
        direction: true,
        confidential: true,
        isPublic: true,
        source: true,
        withdrawnAt: true,
        unit: { select: { code: true, name: true } },
        letterType: { select: { name: true } },
        files: { where: { replacedAt: null }, select: { id: true }, take: 1 },
      },
    }),
    prisma.legacyDecree.count({ where }),
  ]);

  const rows = found.map((r) => ({
    id: r.id,
    nomor: r.nomor,
    tanggal: r.tanggal,
    tanggalRaw: r.tanggalRaw,
    perihal: r.perihal,
    unitCode: r.unit?.code ?? null,
    unitName: r.unit?.name ?? null,
    jenis: r.letterType?.name ?? null,
    direction: r.direction,
    hasFile: r.files.length > 0,
    confidential: r.confidential,
    isPublic: r.isPublic,
    source: r.source,
    withdrawn: r.withdrawnAt !== null,
  }));

  return NextResponse.json({ rows, total });
}

/** POST /api/arsip-lama — create a record by hand (source MANUAL). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = oldArchiveInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  if (!canCreateOldArchiveFor(session, input.unitId)) {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const [unit, letterType] = await Promise.all([
    prisma.unit.findFirst({
      where: { id: input.unitId, deletedAt: null },
      select: { id: true, name: true },
    }),
    prisma.letterType.findFirst({
      where: { id: input.letterTypeId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!unit) return NextResponse.json({ error: "Unit tidak ditemukan" }, { status: 400 });
  if (!letterType) return NextResponse.json({ error: "Jenis surat tidak ditemukan" }, { status: 400 });

  const created = await prisma.legacyDecree.create({
    data: {
      source: "MANUAL",
      isPublic: false,
      isComplete: true,
      letterTypeId: input.letterTypeId,
      unitId: input.unitId,
      unitLabelRaw: unit.name,
      direction: input.direction,
      nomor: input.nomor,
      tanggal: input.tanggal ? new Date(input.tanggal) : null,
      tanggalRaw: resolveTanggalRaw(input.tanggal, input.tanggalRaw),
      perihal: input.perihal,
      counterpart: input.counterpart,
      physicalLocation: input.physicalLocation,
      physicalKind: input.physicalKind,
      confidential: input.confidential,
      catatan: input.catatan,
      createdById: session.userId,
      createdByEmail: session.email,
    },
    select: { id: true },
  });

  await audit({
    action: "CREATE",
    actorId: session.userId,
    actorEmail: session.email,
    targetType: "LegacyDecree",
    targetId: created.id,
    metadata: { event: "create", nomor: input.nomor, perihal: input.perihal },
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ id: created.id }, { status: 201 });
}
