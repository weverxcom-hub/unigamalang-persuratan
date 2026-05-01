// Shared helpers for the centralized report pages under /dashboard/reports.
//
// Each report (Surat, Disposisi, Tiket, Aktivitas Pengguna) reads filters
// from URL searchParams so the pages stay shareable / refreshable. These
// helpers parse those params into typed values + Prisma filter snippets.

import type { Prisma } from "@prisma/client";

/** A from..to date window. Both bounds are inclusive at the day granularity. */
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

/** Parse a yyyy-mm-dd query param into a Date at UTC midnight. Returns null
 *  when missing or invalid so callers can apply defaults. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Default range when neither `from` nor `to` is supplied: current calendar
 *  year. Matches the most common use-case (laporan tahunan akreditasi). */
export function defaultRange(now: Date = new Date()): DateRange {
  const year = now.getFullYear();
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

/** Read `from` / `to` from searchParams, falling back to the default range
 *  when a bound is missing/invalid. Always returns a fully-bounded range. */
export function readRange(
  params: { from?: string | string[]; to?: string | string[] } | undefined
): DateRange {
  const from = parseDate(firstValue(params?.from));
  const to = parseDate(firstValue(params?.to));
  if (from && to) return { from, to: endOfDay(to) };

  const def = defaultRange();
  return {
    from: from ?? def.from,
    to: to ? endOfDay(to) : def.to,
  };
}

function endOfDay(d: Date): Date {
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/** Read a single value from a string | string[] query param. */
export function firstValue(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Build a Prisma DateTime filter from a DateRange. Empty when both bounds
 *  are null (caller can spread without polluting the where clause). */
export function rangeFilter(range: DateRange): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  const out: Prisma.DateTimeFilter = {};
  if (range.from) out.gte = range.from;
  if (range.to) out.lte = range.to;
  return out;
}

/** YYYY-MM-DD slice for HTML date inputs and CSV cells. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Pretty-printed Indonesian month range for headings / print metadata. */
export function describeRange(range: DateRange): string {
  if (!range.from && !range.to) return "Seluruh waktu";
  const fmt = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  if (range.from && range.to) {
    if (range.from.toDateString() === range.to.toDateString()) {
      return fmt(range.from);
    }
    return `${fmt(range.from)} – ${fmt(range.to)}`;
  }
  if (range.from) return `Sejak ${fmt(range.from)}`;
  return `Hingga ${fmt(range.to as Date)}`;
}

/** Indonesian labels mirroring the dashboard UI; reused by exports. */
export const ARCHIVE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf",
  PENDING: "Menunggu Persetujuan",
  PENDING_PROOF: "Menunggu Bukti",
  APPROVED: "Disetujui",
  ISSUED: "Terbit",
  OVERDUE: "Melewati Batas",
  VOID: "Dibatalkan",
};

export const DIRECTION_LABEL: Record<string, string> = {
  OUTGOING: "Surat Keluar",
  INCOMING: "Surat Masuk",
};

export const DISPOSITION_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  ACKNOWLEDGED: "Diterima",
  COMPLETED: "Selesai",
  REJECTED: "Ditolak",
};

export const TICKET_STATUS_LABEL: Record<string, string> = {
  NEW: "Baru",
  IN_PROGRESS: "Sedang Ditangani",
  RESOLVED: "Selesai",
  CLOSED: "Ditutup",
};

/** Cell hardening shared by CSV/XLSX exports. Excel/LibreOffice treat cells
 *  starting with =, +, -, @, or TAB as formulas, so we prefix a quote to
 *  defang potentially user-controlled fields. */
export function safeCell(v: string | null | undefined): string {
  const s = v ?? "";
  return /^[=+\-@\t]/.test(s) ? "'" + s : s;
}
