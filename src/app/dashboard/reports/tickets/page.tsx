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
  TICKET_STATUS_LABEL,
  describeRange,
  rangeFilter,
  readRange,
} from "@/lib/reports";
import { formatDate } from "@/lib/utils";
import { PrintButtonInner } from "../_print-button";
import { TicketsReportFilters } from "./tickets-filters";

export const metadata = {
  title: "Laporan Tiket Help Desk — Sistem Persuratan",
};

const VIEW_LIMIT = 500;

interface PageProps {
  searchParams: { from?: string; to?: string; status?: string; unitId?: string };
}

export default async function TicketsReportPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  // Hanya superadmin yang dapat mengakses laporan tiket lintas org.
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard/reports");

  const range = readRange(searchParams);

  const where: Prisma.TicketWhereInput = {};
  if (searchParams.unitId) where.unitId = searchParams.unitId;
  if (searchParams.status) {
    where.status = searchParams.status as Prisma.TicketWhereInput["status"];
  }
  const dateFilter = rangeFilter(range);
  if (dateFilter) where.createdAt = dateFilter;

  const [units, total, byStatus, byUnit, byHint, tickets] = await Promise.all([
    prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.ticket.count({ where }),
    prisma.ticket.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["unitId"], where, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["pageHint"], where, _count: { _all: true } }),
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: VIEW_LIMIT,
      include: {
        createdBy: { select: { id: true, name: true } },
        unit: { select: { id: true, code: true } },
      },
    }),
  ]);

  const open =
    (byStatus.find((b) => b.status === "NEW")?._count._all ?? 0) +
    (byStatus.find((b) => b.status === "IN_PROGRESS")?._count._all ?? 0);
  const resolved =
    (byStatus.find((b) => b.status === "RESOLVED")?._count._all ?? 0) +
    (byStatus.find((b) => b.status === "CLOSED")?._count._all ?? 0);
  const resolutionRate = total === 0 ? 0 : Math.round((resolved / total) * 100);

  const exportQuery = new URLSearchParams();
  if (searchParams.from) exportQuery.set("from", searchParams.from);
  if (searchParams.to) exportQuery.set("to", searchParams.to);
  if (searchParams.unitId) exportQuery.set("unitId", searchParams.unitId);
  if (searchParams.status) exportQuery.set("status", searchParams.status);
  const csvHref = `/api/reports/tickets/export?format=csv&${exportQuery.toString()}`;
  const xlsxHref = `/api/reports/tickets/export?format=xlsx&${exportQuery.toString()}`;

  // Map unitId → code untuk display.
  const unitCodeById = new Map(units.map((u) => [u.id, u.code]));

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
          <h1 className="text-2xl font-bold tracking-tight">Laporan Tiket Help Desk</h1>
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
        </CardHeader>
        <CardContent>
          <TicketsReportFilters initial={searchParams} units={units} />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Total Tiket" value={total} />
        <SummaryCard label="Terbuka" value={open} hint="Baru / Sedang Ditangani" />
        <SummaryCard
          label="Tingkat Penyelesaian"
          value={resolutionRate}
          suffix="%"
          hint="Selesai / Ditutup"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per Status</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={byStatus.map((b) => ({
                label: TICKET_STATUS_LABEL[b.status] ?? b.status,
                count: b._count._all,
              }))}
              total={total}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per Unit Pelapor</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList
              rows={byUnit.map((b) => ({
                label: b.unitId ? unitCodeById.get(b.unitId) ?? "—" : "Tanpa Unit",
                count: b._count._all,
              }))}
              total={total}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Frekuensi per Halaman / Fitur</CardTitle>
          <CardDescription>
            Berdasarkan field <code>pageHint</code> yang di-isi pelapor saat membuat tiket. Membantu superadmin
            mengidentifikasi area aplikasi yang sering bermasalah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BreakdownList
            rows={byHint
              .filter((b) => b.pageHint)
              .map((b) => ({ label: b.pageHint as string, count: b._count._all }))}
            total={total}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail Tiket</CardTitle>
          <CardDescription>
            Menampilkan {tickets.length} dari {total} tiket.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Tanggal</TableHead>
                <TableHead>Judul</TableHead>
                <TableHead>Pelapor</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Halaman</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Tidak ada tiket pada periode ini.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDate(t.createdAt)}</TableCell>
                    <TableCell className="text-sm">{t.title}</TableCell>
                    <TableCell className="text-xs">{t.createdBy?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{t.unit?.code ?? "—"}</TableCell>
                    <TableCell className="text-xs">{t.pageHint ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {TICKET_STATUS_LABEL[t.status] ?? t.status}
                    </TableCell>
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

function SummaryCard({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold leading-none">
          {value.toLocaleString("id-ID")}
          {suffix}
        </p>
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
              <span className="truncate" title={r.label}>
                {r.label}
              </span>
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
