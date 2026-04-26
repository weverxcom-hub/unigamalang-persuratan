import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu Persetujuan",
  PENDING_PROOF: "Menunggu Bukti",
  ISSUED: "Terbit",
  REVOKED: "Dibatalkan",
};

const DIRECTION_LABEL: Record<string, string> = {
  OUTGOING: "Surat Keluar",
  INCOMING: "Surat Masuk",
};

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
  if (v == null) return "";
  // Quote if it contains comma, quote, newline, or starts with whitespace.
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
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
  // ISO yyyy-mm-dd in local TZ — sufficient for accreditation export.
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/archives/export?format=csv|xlsx&[same filters as /api/archives]
 *
 * Returns the current archive list (subject to the caller's scope: a unit
 * admin only sees their own unit's archives) as a downloadable CSV or XLSX
 * for accreditation rekapitulasi.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });

  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const unitId = url.searchParams.get("unitId");
  const letterTypeId = url.searchParams.get("letterTypeId");
  const direction = url.searchParams.get("direction");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q")?.trim();
  const year = url.searchParams.get("year");
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  const where: Prisma.ArchiveWhereInput = { deletedAt: null };
  if (session.role !== "SUPER_ADMIN") {
    where.unitId = session.unitId ?? "__no_unit__";
  } else if (unitId) {
    where.unitId = unitId;
  }
  if (letterTypeId) where.letterTypeId = letterTypeId;
  if (direction === "OUTGOING" || direction === "INCOMING") where.direction = direction;
  if (status) where.status = status as Prisma.ArchiveWhereInput["status"];

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    where.AND = tokens.map((t) => ({
      OR: [
        { number: { contains: t, mode: "insensitive" } },
        { subject: { contains: t, mode: "insensitive" } },
        { recipient: { contains: t, mode: "insensitive" } },
        { externalSender: { contains: t, mode: "insensitive" } },
      ],
    }));
  }

  const dateFilter: Prisma.DateTimeFilter = {};
  const hasExplicitRange = Boolean(dateFrom || dateTo);
  if (hasExplicitRange) {
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!Number.isNaN(d.getTime())) dateFilter.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCHours(23, 59, 59, 999);
        dateFilter.lte = d;
      }
    }
  } else if (year) {
    const y = Number(year);
    if (!Number.isNaN(y)) {
      dateFilter.gte = new Date(Date.UTC(y, 0, 1));
      dateFilter.lt = new Date(Date.UTC(y + 1, 0, 1));
    }
  }
  if (Object.keys(dateFilter).length > 0) where.date = dateFilter;

  const archives = await prisma.archive.findMany({
    where,
    orderBy: { date: "desc" },
    take: 5000,
  });

  const rows: Row[] = archives.map((a) => ({
    date: fmtDate(a.date),
    number: a.number,
    direction: DIRECTION_LABEL[a.direction] ?? a.direction,
    subject: a.subject,
    partner: a.direction === "INCOMING" ? a.externalSender ?? a.recipient : a.recipient,
    unitCode: a.unitCode,
    letterTypeCode: a.letterTypeCode,
    status: STATUS_LABEL[a.status] ?? a.status,
    hasProof: a.fileUrl || a.fileDataUrl ? "Ya" : "Tidak",
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `arsip-surat-${stamp}`;

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sistem Persuratan Universitas Gajayana";
    wb.created = new Date();
    const ws = wb.addWorksheet("Arsip Surat");
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
    ws.getRow(1).alignment = { vertical: "middle" };
    rows.forEach((r) => ws.addRow(r));
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: 9 },
    };
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Default: CSV (UTF-8 + BOM so Excel auto-detects encoding)
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
