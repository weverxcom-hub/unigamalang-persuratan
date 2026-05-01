import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, FileSpreadsheet, FileText } from "lucide-react";
import {
  ARCHIVE_STATUS_LABEL,
  DIRECTION_LABEL,
  describeRange,
  rangeFilter,
  readRange,
} from "@/lib/reports";
import { formatDate } from "@/lib/utils";
import { PrintButtonInner } from "../_print-button";
import { LettersFilters } from "./letters-filters";

export const metadata = {
  title: "Laporan Surat per Periode — Sistem Persuratan",
};

// View cap. Above this we show a notice suggesting to refine filters or use
// the export — the underlying CSV/XLSX has a higher cap (5000) so the user
// still gets the full dataset.
const VIEW_LIMIT = 500;

interface PageProps {
  searchParams: {
    from?: string;
    to?: string;
    unitId?: string;
    letterTypeId?: string;
    direction?: string;
    status?: string;
  };
}

export default async function LettersReportPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const range = readRange(searchParams);
  const isSuper = session.role === "SUPER_ADMIN";

  // Scope: ADMIN_UNIT / USER hanya unitnya sendiri (sama seperti
  // /dashboard/archives). Param unitId di-honor cuma kalau super.
  const where: Prisma.ArchiveWhereInput = { deletedAt: null };
  if (!isSuper) {
    where.unitId = session.unitId ?? "__no_unit__";
  } else if (searchParams.unitId) {
    where.unitId = searchParams.unitId;
  }
  if (searchParams.letterTypeId) where.letterTypeId = searchParams.letterTypeId;
  if (searchParams.direction === "OUTGOING" || searchParams.direction === "INCOMING") {
    where.direction = searchParams.direction;
  }
  if (searchParams.status) {
    where.status = searchParams.status as Prisma.ArchiveWhereInput["status"];
  }
  const dateFilter = rangeFilter(range);
  if (dateFilter) where.date = dateFilter;

  const [units, letterTypes, total, archives, byDirection, byStatus, byType, byUnit] =
    await Promise.all([
      prisma.unit.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      prisma.letterType.findMany({
        where: { deletedAt: null },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true },
      }),
      prisma.archive.count({ where }),
      prisma.archive.findMany({
        where,
        orderBy: { date: "desc" },
        take: VIEW_LIMIT,
        select: {
          id: true,
          number: true,
          date: true,
          subject: true,
          recipient: true,
          externalSender: true,
          direction: true,
          status: true,
          unitCode: true,
          letterTypeCode: true,
        },
      }),
      prisma.archive.groupBy({ by: ["direction"], where, _count: { _all: true } }),
      prisma.archive.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.archive.groupBy({ by: ["letterTypeCode"], where, _count: { _all: true } }),
      prisma.archive.groupBy({ by: ["unitCode"], where, _count: { _all: true } }),
    ]);

  const exportQuery = new URLSearchParams();
  if (searchParams.from) exportQuery.set("from", searchParams.from);
  if (searchParams.to) exportQuery.set("to", searchParams.to);
  if (searchParams.unitId) exportQuery.set("unitId", searchParams.unitId);
  if (searchParams.letterTypeId) exportQuery.set("letterTypeId", searchParams.letterTypeId);
  if (searchParams.direction) exportQuery.set("direction", searchParams.direction);
  if (searchParams.status) exportQuery.set("status", searchParams.status);
  const csvHref = `/api/reports/letters/export?format=csv&${exportQuery.toString()}`;
  const xlsxHref = `/api/reports/letters/export?format=xlsx&${exportQuery.toString()}`;

  const outgoing = byDirection.find((b) => b.direction === "OUTGOING")?._count._all ?? 0;
  const incoming = byDirection.find((b) => b.direction === "INCOMING")?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div>
          <Link
            href="/dashboard/reports"
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Laporan
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Laporan Surat per Periode</h1>
          <p className="text-sm text-muted-foreground">
            Periode: <strong>{describeRange(range)}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={csvHref} target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4" />
              CSV
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={xlsxHref} target="_blank" rel="noopener noreferrer">
              <FileSpreadsheet className="h-4 w-4" />
              XLSX
            </a>
          </Button>
          <PrintButtonInner />
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
          <CardDescription>
            Sesuaikan rentang dan kriteria, lalu klik <em>Terapkan</em>. URL halaman
            mencerminkan filter aktif sehingga bisa di-bookmark / dibagikan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LettersFilters
            initial={searchParams}
            units={units}
            letterTypes={letterTypes}
            isSuper={isSuper}
          />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Total Surat" value={total} />
        <SummaryCard label="Surat Keluar" value={outgoing} />
        <SummaryCard label="Surat Masuk" value={incoming} />
        <SummaryCard
          label="Jenis Berbeda"
          value={byType.length}
          hint={`${byUnit.length} unit aktif`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown per Status</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={byStatus.map((b) => ({
                label: ARCHIVE_STATUS_LABEL[b.status] ?? b.status,
                count: b._count._all,
              }))}
              total={total}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Breakdown per Jenis</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={byType.map((b) => ({ label: b.letterTypeCode, count: b._count._all }))}
              total={total}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail Surat</CardTitle>
          <CardDescription>
            Menampilkan {archives.length} dari {total} surat.{" "}
            {total > VIEW_LIMIT && (
              <span className="text-amber-700 dark:text-amber-400">
                Melampaui batas tampilan ({VIEW_LIMIT}). Gunakan filter atau ekspor untuk dataset lengkap.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Tanggal</TableHead>
                <TableHead>Nomor</TableHead>
                <TableHead>Arah</TableHead>
                <TableHead className="min-w-[12rem]">Perihal</TableHead>
                <TableHead>Tujuan / Pengirim</TableHead>
                <TableHead className="w-16">Unit</TableHead>
                <TableHead className="w-16">Jenis</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archives.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Tidak ada data untuk filter ini.
                  </TableCell>
                </TableRow>
              ) : (
                archives.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDate(a.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{a.number}</TableCell>
                    <TableCell className="text-xs">{DIRECTION_LABEL[a.direction] ?? a.direction}</TableCell>
                    <TableCell className="text-sm">{a.subject}</TableCell>
                    <TableCell className="text-xs">
                      {a.direction === "INCOMING" ? a.externalSender ?? a.recipient : a.recipient}
                    </TableCell>
                    <TableCell className="text-xs">{a.unitCode}</TableCell>
                    <TableCell className="text-xs">{a.letterTypeCode}</TableCell>
                    <TableCell className="text-xs">{ARCHIVE_STATUS_LABEL[a.status] ?? a.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold leading-none">{value.toLocaleString("id-ID")}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function BreakdownList({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Tidak ada data.</p>;
  }
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  return (
    <ul className="space-y-2">
      {sorted.map((r) => {
        const pct = total === 0 ? 0 : Math.round((r.count / total) * 100);
        return (
          <li key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{r.label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {r.count.toLocaleString("id-ID")} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}


