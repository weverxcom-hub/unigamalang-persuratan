import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jakartaDateString } from "@/lib/timezone";
import {
  ARCHIVE_STATUS_LABEL,
  DIRECTION_LABEL,
  rangeFilter,
  readRange,
  safeCell,
} from "@/lib/reports";

// Cap for the export. Bigger than the on-page view (500) so the file is the
// authoritative artifact for accreditation. Above this we still return the
// truncated dataset — caller can split by date range.
const EXPORT_LIMIT = 5000;

interface Row {
  date: string;
  number: string;
  direction: string;
  subject: string;
  partner: string;
  unitCode: string;
  letterTypeCode: string;
  status: string;
  hasProof: string;
}

function csvEscape(v: string): string {
  const safe = safeCell(v);
  if (/[",\n\r]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function rowToCsv(r: Row): string {
  return [
    r.date,
    r.number,
    r.direction,
    r.subject,
    r.partner,
    r.unitCode,
    r.letterTypeCode,
    r.status,
    r.hasProof,
  ]
    .map(csvEscape)
    .join(",");
}

function fmtDate(d: Date): string {
  // Asia/Jakarta calendar date (audit B3), not UTC.
  return jakartaDateString(d);
}

/**
 * GET /api/reports/letters/export?format=csv|xlsx&from=&to=&unitId=&letterTypeId=&direction=&status=
 *
 * Exports the same dataset shown on /dashboard/reports/letters as CSV / XLSX.
 * Scope follows the requesting user's role: ADMIN_UNIT / USER are limited to
 * their own unit; SUPER_ADMIN sees the whole org and can pass unitId.
 */
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
  const letterTypeId = url.searchParams.get("letterTypeId");
  const direction = url.searchParams.get("direction");
  const status = url.searchParams.get("status");

  const where: Prisma.ArchiveWhereInput = { deletedAt: null };
  if (session.role !== "SUPER_ADMIN") {
    where.unitId = session.unitId ?? "__no_unit__";
  } else if (unitId) {
    where.unitId = unitId;
  }
  if (letterTypeId) where.letterTypeId = letterTypeId;
  if (direction === "OUTGOING" || direction === "INCOMING") where.direction = direction;
  // Whitelist — mirrors the same fix (audit M8) already applied to
  // /api/archives/export: an unrecognised value here reaches Prisma
  // unvalidated and throws, surfacing as a raw 500 instead of an
  // empty/ignored filter.
  const ALLOWED_STATUSES = new Set([
    "DRAFT",
    "PENDING",
    "PENDING_PROOF",
    "APPROVED",
    "ISSUED",
    "OVERDUE",
    "VOID",
  ]);
  if (status && ALLOWED_STATUSES.has(status)) {
    where.status = status as Prisma.ArchiveWhereInput["status"];
  }
  const dateFilter = rangeFilter(range);
  if (dateFilter) where.date = dateFilter;

  const archives = await prisma.archive.findMany({
    where,
    orderBy: { date: "desc" },
    take: EXPORT_LIMIT,
  });

  const rows: Row[] = archives.map((a) => ({
    date: fmtDate(a.date),
    number: a.number,
    direction: DIRECTION_LABEL[a.direction] ?? a.direction,
    subject: a.subject,
    partner: a.direction === "INCOMING" ? a.externalSender ?? a.recipient : a.recipient,
    unitCode: a.unitCode,
    letterTypeCode: a.letterTypeCode,
    status: ARCHIVE_STATUS_LABEL[a.status] ?? a.status,
    hasProof: a.fileUrl || a.fileDataUrl ? "Ya" : "Tidak",
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `laporan-surat-${stamp}`;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sistem Persuratan Universitas Gajayana";
    wb.created = new Date();
    const ws = wb.addWorksheet("Laporan Surat");
    ws.columns = [
      { header: "Tanggal", key: "date", width: 12 },
      { header: "Nomor Surat", key: "number", width: 32 },
      { header: "Arah", key: "direction", width: 14 },
      { header: "Perihal", key: "subject", width: 50 },
      { header: "Tujuan / Pengirim", key: "partner", width: 32 },
      { header: "Unit", key: "unitCode", width: 10 },
      { header: "Jenis", key: "letterTypeCode", width: 10 },
      { header: "Status", key: "status", width: 18 },
      { header: "Bukti", key: "hasProof", width: 8 },
    ];
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) =>
      ws.addRow({
        ...r,
        number: safeCell(r.number),
        subject: safeCell(r.subject),
        partner: safeCell(r.partner),
        unitCode: safeCell(r.unitCode),
        letterTypeCode: safeCell(r.letterTypeCode),
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
    "Nomor Surat",
    "Arah",
    "Perihal",
    "Tujuan / Pengirim",
    "Unit",
    "Jenis",
    "Status",
    "Bukti",
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
