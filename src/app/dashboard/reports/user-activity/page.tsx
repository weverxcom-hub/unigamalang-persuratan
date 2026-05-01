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
import { describeRange, rangeFilter, readRange } from "@/lib/reports";
import { PrintButtonInner } from "../_print-button";
import { UserActivityFilters } from "./user-activity-filters";

export const metadata = {
  title: "Laporan Aktivitas Pengguna — Sistem Persuratan",
};

const VIEW_LIMIT = 200;

interface PageProps {
  searchParams: { from?: string; to?: string; unitId?: string };
}

export default async function UserActivityReportPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard/reports");

  const range = readRange(searchParams);

  const archiveWhere: Prisma.ArchiveWhereInput = { deletedAt: null };
  if (searchParams.unitId) archiveWhere.unitId = searchParams.unitId;
  const dateFilter = rangeFilter(range);
  if (dateFilter) archiveWhere.createdAt = dateFilter;

  const dispositionWhere: Prisma.DispositionWhereInput = {};
  if (dateFilter) dispositionWhere.createdAt = dateFilter;

  // groupBy(createdById) — Prisma tidak bisa join ke User langsung, jadi kita
  // ambil counts dulu lalu hydrate user names dalam satu round-trip kedua.
  const [units, archiveByUser, dispositionByUser] = await Promise.all([
    prisma.unit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.archive.groupBy({
      by: ["createdById"],
      where: archiveWhere,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: VIEW_LIMIT,
    }),
    prisma.disposition.groupBy({
      by: ["fromUserId"],
      where: dispositionWhere,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: VIEW_LIMIT,
    }),
  ]);

  // Hydrate users.
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

  // Combine: per user → { archives, dispositions }.
  const map = new Map<
    string,
    { archives: number; dispositions: number; total: number }
  >();
  for (const b of archiveByUser) {
    const cur = map.get(b.createdById) ?? { archives: 0, dispositions: 0, total: 0 };
    cur.archives = b._count._all;
    cur.total = cur.archives + cur.dispositions;
    map.set(b.createdById, cur);
  }
  for (const b of dispositionByUser) {
    const cur = map.get(b.fromUserId) ?? { archives: 0, dispositions: 0, total: 0 };
    cur.dispositions = b._count._all;
    cur.total = cur.archives + cur.dispositions;
    map.set(b.fromUserId, cur);
  }

  const rows = Array.from(map.entries())
    .map(([userId, counts]) => {
      const u = userById.get(userId);
      return {
        userId,
        name: u?.name ?? "(akun terhapus)",
        email: u?.email ?? "—",
        role: u?.role ?? "—",
        unit: u?.unitId ? unitCodeById.get(u.unitId) ?? "—" : "—",
        ...counts,
      };
    })
    .sort((a, b) => b.total - a.total);

  const totalArchives = rows.reduce((sum, r) => sum + r.archives, 0);
  const totalDispositions = rows.reduce((sum, r) => sum + r.dispositions, 0);

  const exportQuery = new URLSearchParams();
  if (searchParams.from) exportQuery.set("from", searchParams.from);
  if (searchParams.to) exportQuery.set("to", searchParams.to);
  if (searchParams.unitId) exportQuery.set("unitId", searchParams.unitId);
  const csvHref = `/api/reports/user-activity/export?format=csv&${exportQuery.toString()}`;
  const xlsxHref = `/api/reports/user-activity/export?format=xlsx&${exportQuery.toString()}`;

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
          <h1 className="text-2xl font-bold tracking-tight">Laporan Aktivitas Pengguna</h1>
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
          <UserActivityFilters initial={searchParams} units={units} />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Total Pengguna Aktif" value={rows.length} />
        <SummaryCard label="Total Surat Dibuat" value={totalArchives} />
        <SummaryCard label="Total Disposisi Dikirim" value={totalDispositions} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Peringkat Aktivitas</CardTitle>
          <CardDescription>
            Diurutkan berdasarkan total kontribusi (surat dibuat + disposisi dikirim) dalam periode terpilih.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Surat</TableHead>
                <TableHead className="text-right">Disposisi</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Tidak ada aktivitas pada periode ini.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r, i) => (
                  <TableRow key={r.userId}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm">{r.name}</TableCell>
                    <TableCell className="text-xs">{r.email}</TableCell>
                    <TableCell className="text-xs">{r.role}</TableCell>
                    <TableCell className="text-xs">{r.unit}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.archives}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{r.dispositions}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">{r.total}</TableCell>
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
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold leading-none">{value.toLocaleString("id-ID")}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
