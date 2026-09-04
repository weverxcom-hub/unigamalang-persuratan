import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jakartaDateString } from "@/lib/timezone";
import { TICKET_STATUS_LABEL, rangeFilter, readRange, safeCell } from "@/lib/reports";

const EXPORT_LIMIT = 5000;

interface Row {
  date: string;
  title: string;
  description: string;
  pageHint: string;
  reporter: string;
  unitCode: string;
  status: string;
  responseNote: string;
  resolvedAt: string;
}

function csvEscape(v: string): string {
  const safe = safeCell(v);
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function rowToCsv(r: Row): string {
  return [
    r.date,
    r.title,
    r.description,
    r.pageHint,
    r.reporter,
    r.unitCode,
    r.status,
    r.responseNote,
    r.resolvedAt,
  ]
    .map(csvEscape)
    .join(",");
}

function fmtDate(d: Date | null | undefined): string {
  // Asia/Jakarta calendar date (audit B3), not UTC.
  return d ? jakartaDateString(d) : "";
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
  }
  // Hanya superadmin yang dapat mengekspor laporan tiket lintas org.
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
  const status = url.searchParams.get("status");

  const where: Prisma.TicketWhereInput = {};
  if (unitId) where.unitId = unitId;
  // Whitelist — same class of fix as audit M8 on /api/archives/export: an
  // unrecognised value here reaches Prisma unvalidated and throws a 500.
  const ALLOWED_STATUSES = new Set(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
  if (status && ALLOWED_STATUSES.has(status)) {
    where.status = status as Prisma.TicketWhereInput["status"];
  }
  const dateFilter = rangeFilter(range);
  if (dateFilter) where.createdAt = dateFilter;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: {
      createdBy: { select: { name: true } },
      unit: { select: { code: true } },
    },
  });

  const rows: Row[] = tickets.map((t) => ({
    date: fmtDate(t.createdAt),
    title: t.title,
    description: t.description,
    pageHint: t.pageHint ?? "",
    reporter: t.createdBy?.name ?? "",
    unitCode: t.unit?.code ?? "",
    status: TICKET_STATUS_LABEL[t.status] ?? t.status,
    responseNote: t.responseNote ?? "",
    resolvedAt: fmtDate(t.resolvedAt),
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `laporan-tiket-${stamp}`;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sistem Persuratan Universitas Gajayana";
    wb.created = new Date();
    const ws = wb.addWorksheet("Laporan Tiket");
    ws.columns = [
      { header: "Tanggal", key: "date", width: 12 },
      { header: "Judul", key: "title", width: 40 },
      { header: "Deskripsi", key: "description", width: 60 },
      { header: "Halaman", key: "pageHint", width: 24 },
      { header: "Pelapor", key: "reporter", width: 24 },
      { header: "Unit", key: "unitCode", width: 10 },
      { header: "Status", key: "status", width: 18 },
      { header: "Catatan Superadmin", key: "responseNote", width: 40 },
      { header: "Selesai", key: "resolvedAt", width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        title: safeCell(r.title),
        description: safeCell(r.description),
        pageHint: safeCell(r.pageHint),
        reporter: safeCell(r.reporter),
        unitCode: safeCell(r.unitCode),
        responseNote: safeCell(r.responseNote),
      })
    );
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: 9 } };
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

  const header = [
    "Tanggal",
    "Judul",
    "Deskripsi",
    "Halaman",
    "Pelapor",
    "Unit",
    "Status",
    "Catatan Superadmin",
    "Selesai",
  ].join(",");
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
