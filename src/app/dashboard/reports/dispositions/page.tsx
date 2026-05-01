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
  DISPOSITION_STATUS_LABEL,
  describeRange,
  rangeFilter,
  readRange,
} from "@/lib/reports";
import { formatDate } from "@/lib/utils";
import { PrintButtonInner } from "../_print-button";
import { DispositionsReportFilters } from "./dispositions-filters";

export const metadata = {
  title: "Laporan Disposisi — Sistem Persuratan",
};

const VIEW_LIMIT = 500;

interface PageProps {
  searchParams: {
    from?: string;
    to?: string;
    unitId?: string;
    status?: string;
  };
}

export default async function DispositionsReportPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");

  const range = readRange(searchParams);
  const isSuper = session.role === "SUPER_ADMIN";

  // Scope: SUPER_ADMIN melihat seluruh org. Lainnya melihat disposisi yang
  // melibatkan dirinya — sebagai pengirim, penerima, atau penerima via unit.
  const where: Prisma.DispositionWhereInput = {};
  if (!isSuper) {
    where.OR = [
      { fromUserId: session.userId },
      { toUserId: session.userId },
      ...(session.unitId ? [{ toUnitId: session.unitId }] : []),
    ];
  } else if (searchParams.unitId) {
    where.toUnitId = searchParams.unitId;
  }
  if (searchParams.status) {
    where.status = searchParams.status as Prisma.DispositionWhereInput["status"];
  }
  const dateFilter = rangeFilter(range);
  if (dateFilter) where.createdAt = dateFilter;

  const [units, total, byStatus, dispositions] = await Promise.all([
    prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.disposition.count({ where }),
    prisma.disposition.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.disposition.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: VIEW_LIMIT,
      include: {
        archive: { select: { id: true, number: true, subject: true } },
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        toUnit: { select: { id: true, code: true, name: true } },
      },
    }),
  ]);

  // Responsivitas: persen disposisi yang sudah ACKNOWLEDGED atau COMPLETED.
  const completed =
    (byStatus.find((b) => b.status === "ACKNOWLEDGED")?._count._all ?? 0) +
    (byStatus.find((b) => b.status === "COMPLETED")?._count._all ?? 0);
  const responseRate = total === 0 ? 0 : Math.round((completed / total) * 100);

  // Rerata waktu acknowledge: hanya untuk yang sudah dibalas, range bound jaga
  // dataset tidak berlebihan.
  const ackedSamples = await prisma.disposition.findMany({
    where: { ...where, acknowledgedAt: { not: null } },
    select: { createdAt: true, acknowledgedAt: true },
    take: 1000,
  });
  const avgAckHours = computeAvgHours(ackedSamples);

  const exportQuery = new URLSearchParams();
  if (searchParams.from) exportQuery.set("from", searchParams.from);
  if (searchParams.to) exportQuery.set("to", searchParams.to);
  if (searchParams.unitId) exportQuery.set("unitId", searchParams.unitId);
  if (searchParams.status) exportQuery.set("status", searchParams.status);
  const csvHref = `/api/reports/dispositions/export?format=csv&${exportQuery.toString()}`;
  const xlsxHref = `/api/reports/dispositions/export?format=xlsx&${exportQuery.toString()}`;

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
          <h1 className="text-2xl font-bold tracking-tight">Laporan Disposisi</h1>
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
          <DispositionsReportFilters initial={searchParams} units={units} isSuper={isSuper} />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Total Disposisi" value={total} />
        <SummaryCard
          label="Tingkat Respons"
          value={responseRate}
          suffix="%"
          hint="Diterima / Selesai"
        />
        <SummaryCard
          label="Rerata Waktu Diterima"
          value={avgAckHours == null ? 0 : avgAckHours}
          suffix={avgAckHours == null ? "" : " jam"}
          hint={avgAckHours == null ? "Belum ada yang diterima" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Breakdown per Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {byStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada data.</p>
            ) : (
              [...byStatus]
                .sort((a, b) => b._count._all - a._count._all)
                .map((b) => {
                  const pct = total === 0 ? 0 : Math.round((b._count._all / total) * 100);
                  return (
                    <li key={b.status} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{DISPOSITION_STATUS_LABEL[b.status] ?? b.status}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {b._count._all.toLocaleString("id-ID")} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detail Disposisi</CardTitle>
          <CardDescription>
            Menampilkan {dispositions.length} dari {total} disposisi.{" "}
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
                <TableHead>Surat</TableHead>
                <TableHead>Dari</TableHead>
                <TableHead>Kepada</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tenggat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dispositions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    Tidak ada disposisi pada periode ini.
                  </TableCell>
                </TableRow>
              ) : (
                dispositions.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(d.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{d.archive.number}</span>
                      <p className="truncate text-[11px] text-muted-foreground">{d.archive.subject}</p>
                    </TableCell>
                    <TableCell className="text-xs">{d.fromUser?.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {d.toUser?.name ?? d.toUnit?.code ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {DISPOSITION_STATUS_LABEL[d.status] ?? d.status}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.dueDate ? formatDate(d.dueDate) : "—"}
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

function computeAvgHours(samples: { createdAt: Date; acknowledgedAt: Date | null }[]): number | null {
  if (samples.length === 0) return null;
  const totalMs = samples.reduce((sum, s) => {
    if (!s.acknowledgedAt) return sum;
    return sum + (s.acknowledgedAt.getTime() - s.createdAt.getTime());
  }, 0);
  const avgHours = totalMs / samples.length / (1000 * 60 * 60);
  return Math.round(avgHours * 10) / 10;
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
