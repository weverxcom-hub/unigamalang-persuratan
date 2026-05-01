import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rangeFilter, readRange, safeCell } from "@/lib/reports";

const TOP_LIMIT = 1000;

interface Row {
  rank: number;
  name: string;
  email: string;
  role: string;
  unitCode: string;
  archives: number;
  dispositions: number;
  total: number;
}

function csvEscape(v: string): string {
  const safe = safeCell(v);
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function rowToCsv(r: Row): string {
  return [
    String(r.rank),
    r.name,
    r.email,
    r.role,
    r.unitCode,
    String(r.archives),
    String(r.dispositions),
    String(r.total),
  ]
    .map(csvEscape)
    .join(",");
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
  }

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const range = readRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const unitId = url.searchParams.get("unitId");

  const archiveWhere: Prisma.ArchiveWhereInput = { deletedAt: null };
  if (unitId) archiveWhere.unitId = unitId;
  const dateFilter = rangeFilter(range);
  if (dateFilter) archiveWhere.createdAt = dateFilter;

  const dispositionWhere: Prisma.DispositionWhereInput = {};
  if (dateFilter) dispositionWhere.createdAt = dateFilter;

  const [units, archiveByUser, dispositionByUser] = await Promise.all([
    prisma.unit.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true },
    }),
    prisma.archive.groupBy({
      by: ["createdById"],
      where: archiveWhere,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: TOP_LIMIT,
    }),
    prisma.disposition.groupBy({
      by: ["fromUserId"],
      where: dispositionWhere,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: TOP_LIMIT,
    }),
  ]);

  const allUserIds = Array.from(
    new Set([
      ...archiveByUser.map((b) => b.createdById),
      ...dispositionByUser.map((b) => b.fromUserId),
    ])
  );
  const users = await prisma.user.findMany({
    where: { id: { in: allUserIds } },
    select: { id: true, name: true, email: true, role: true, unitId: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  const unitCodeById = new Map(units.map((u) => [u.id, u.code]));

  const map = new Map<string, { archives: number; dispositions: number }>();
  for (const b of archiveByUser) {
    const cur = map.get(b.createdById) ?? { archives: 0, dispositions: 0 };
    cur.archives = b._count._all;
    map.set(b.createdById, cur);
  }
  for (const b of dispositionByUser) {
    const cur = map.get(b.fromUserId) ?? { archives: 0, dispositions: 0 };
    cur.dispositions = b._count._all;
    map.set(b.fromUserId, cur);
  }

  const rows: Row[] = Array.from(map.entries())
    .map(([userId, counts]) => {
      const u = userById.get(userId);
      return {
        rank: 0, // filled after sort
        name: u?.name ?? "(akun terhapus)",
        email: u?.email ?? "",
        role: u?.role ?? "",
        unitCode: u?.unitId ? unitCodeById.get(u.unitId) ?? "" : "",
        archives: counts.archives,
        dispositions: counts.dispositions,
        total: counts.archives + counts.dispositions,
      };
    })
    .sort((a, b) => b.total - a.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `laporan-aktivitas-${stamp}`;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sistem Persuratan Universitas Gajayana";
    wb.created = new Date();
    const ws = wb.addWorksheet("Laporan Aktivitas");
    ws.columns = [
      { header: "Peringkat", key: "rank", width: 10 },
      { header: "Nama", key: "name", width: 28 },
      { header: "Email", key: "email", width: 36 },
      { header: "Peran", key: "role", width: 14 },
      { header: "Unit", key: "unitCode", width: 10 },
      { header: "Surat Dibuat", key: "archives", width: 14 },
      { header: "Disposisi Dikirim", key: "dispositions", width: 18 },
      { header: "Total", key: "total", width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        name: safeCell(r.name),
        email: safeCell(r.email),
        role: safeCell(r.role),
        unitCode: safeCell(r.unitCode),
      })
    );
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: 8 } };
    }
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const header = ["Peringkat", "Nama", "Email", "Peran", "Unit", "Surat Dibuat", "Disposisi Dikirim", "Total"].join(",");
  const body = rows.map(rowToCsv).join("\n");
  const csv = "\uFEFF" + header + "\n" + body + "\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
