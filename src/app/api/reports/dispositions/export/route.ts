import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jakartaDateString } from "@/lib/timezone";
import {
  DISPOSITION_STATUS_LABEL,
  rangeFilter,
  readRange,
  safeCell,
} from "@/lib/reports";

const EXPORT_LIMIT = 5000;

interface Row {
  date: string;
  archiveNumber: string;
  archiveSubject: string;
  fromName: string;
  toName: string;
  unitCode: string;
  status: string;
  dueDate: string;
  acknowledgedAt: string;
  completedAt: string;
  instructions: string;
}

function csvEscape(v: string): string {
  const safe = safeCell(v);
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function rowToCsv(r: Row): string {
  return [
    r.date,
    r.archiveNumber,
    r.archiveSubject,
    r.fromName,
    r.toName,
    r.unitCode,
    r.status,
    r.dueDate,
    r.acknowledgedAt,
    r.completedAt,
    r.instructions,
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

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const range = readRange({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  const unitId = url.searchParams.get("unitId");
  const status = url.searchParams.get("status");

  const where: Prisma.DispositionWhereInput = {};
  if (session.role !== "SUPER_ADMIN") {
    where.OR = [
      { fromUserId: session.userId },
      { toUserId: session.userId },
      ...(session.unitId ? [{ toUnitId: session.unitId }] : []),
    ];
  } else if (unitId) {
    where.toUnitId = unitId;
  }
  if (status) where.status = status as Prisma.DispositionWhereInput["status"];
  const dateFilter = rangeFilter(range);
  if (dateFilter) where.createdAt = dateFilter;

  const dispositions = await prisma.disposition.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: {
      archive: { select: { number: true, subject: true } },
      fromUser: { select: { name: true } },
      toUser: { select: { name: true } },
      toUnit: { select: { code: true } },
    },
  });

  const rows: Row[] = dispositions.map((d) => ({
    date: fmtDate(d.createdAt),
    archiveNumber: d.archive.number,
    archiveSubject: d.archive.subject,
    fromName: d.fromUser?.name ?? "",
    toName: d.toUser?.name ?? "",
    unitCode: d.toUnit?.code ?? "",
    status: DISPOSITION_STATUS_LABEL[d.status] ?? d.status,
    dueDate: fmtDate(d.dueDate),
    acknowledgedAt: fmtDate(d.acknowledgedAt),
    completedAt: fmtDate(d.completedAt),
    instructions: d.instructions,
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `laporan-disposisi-${stamp}`;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sistem Persuratan Universitas Gajayana";
    wb.created = new Date();
    const ws = wb.addWorksheet("Laporan Disposisi");
    ws.columns = [
      { header: "Tanggal Buat", key: "date", width: 12 },
      { header: "Nomor Surat", key: "archiveNumber", width: 32 },
      { header: "Perihal", key: "archiveSubject", width: 50 },
      { header: "Dari", key: "fromName", width: 24 },
      { header: "Kepada", key: "toName", width: 24 },
      { header: "Unit", key: "unitCode", width: 10 },
      { header: "Status", key: "status", width: 14 },
      { header: "Tenggat", key: "dueDate", width: 12 },
      { header: "Diterima", key: "acknowledgedAt", width: 12 },
      { header: "Selesai", key: "completedAt", width: 12 },
      { header: "Instruksi", key: "instructions", width: 50 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        archiveNumber: safeCell(r.archiveNumber),
        archiveSubject: safeCell(r.archiveSubject),
        fromName: safeCell(r.fromName),
        toName: safeCell(r.toName),
        unitCode: safeCell(r.unitCode),
        instructions: safeCell(r.instructions),
      })
    );
    if (rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length + 1, column: 11 } };
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
    "Tanggal Buat",
    "Nomor Surat",
    "Perihal",
    "Dari",
    "Kepada",
    "Unit",
    "Status",
    "Tenggat",
    "Diterima",
    "Selesai",
    "Instruksi",
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
