import Link from "next/link";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, toRoman } from "@/lib/utils";
import { ArrowRight, FileStack, Hash, Building2, Users2, Inbox, Send, Clock, AlertTriangle } from "lucide-react";
import { redirect } from "next/navigation";

export default async function DashboardHome() {
  const session = await getSession();
  if (!session) redirect("/login");

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const yearStart = new Date(Date.UTC(currentYear, 0, 1));
  const yearEnd = new Date(Date.UTC(currentYear + 1, 0, 1));
  const monthStart = new Date(Date.UTC(currentYear, currentMonth - 1, 1));
  const monthEnd = new Date(Date.UTC(currentYear, currentMonth, 1));

  const archiveScope = {
    deletedAt: null,
    ...(session.role !== "SUPER_ADMIN"
      ? { unitId: session.unitId ?? "__no_unit__" }
      : {}),
  } as const;

  const [
    scopedArchiveCount,
    scopedArchives,
    thisYearCount,
    typeBreakdown,
    outgoingThisMonth,
    incomingThisMonth,
    pendingProofCount,
    totalUnits,
    totalUsers,
  ] = await Promise.all([
    prisma.archive.count({ where: archiveScope }),
    prisma.archive.findMany({
      where: archiveScope,
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.archive.count({
      where: { ...archiveScope, date: { gte: yearStart, lt: yearEnd } },
    }),
    prisma.archive.groupBy({
      by: ["letterTypeCode"],
      where: { ...archiveScope, date: { gte: yearStart, lt: yearEnd } },
      _count: { _all: true },
    }),
    prisma.archive.count({
      where: {
        ...archiveScope,
        direction: "OUTGOING",
        date: { gte: monthStart, lt: monthEnd },
      },
    }),
    prisma.archive.count({
      where: {
        ...archiveScope,
        direction: "INCOMING",
        date: { gte: monthStart, lt: monthEnd },
      },
    }),
    prisma.archive.count({
      where: { ...archiveScope, status: "PENDING_PROOF" },
    }),
    prisma.unit.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
  ]);

  // Overdue (TechSpec 2.4): PENDING_PROOF that exceeded the 14-day window has
  // already been auto-flipped to OVERDUE by the cron, but admins still need a
  // banner so they don't have to scan the table to find them.
  const overdueArchives = await prisma.archive.findMany({
    where: { ...archiveScope, status: "OVERDUE" },
    select: {
      id: true,
      number: true,
      subject: true,
      unitCode: true,
      createdAt: true,
      overdueMarkedAt: true,
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  const archivesByType = new Map<string, number>(
    typeBreakdown.map((b) => [b.letterTypeCode, b._count._all] as const)
  );

  const stats = [
    {
      label: "Surat Keluar Bulan Ini",
      value: outgoingThisMonth,
      description: `Bulan ${toRoman(currentMonth)} / ${currentYear}`,
      icon: Send,
    },
    {
      label: "Surat Masuk Bulan Ini",
      value: incomingThisMonth,
      description: `Bulan ${toRoman(currentMonth)} / ${currentYear}`,
      icon: Inbox,
    },
    {
      label: "Arsip Aktif",
      value: scopedArchiveCount,
      description: `${thisYearCount} di tahun ${currentYear}`,
      icon: FileStack,
    },
    {
      label: "Menunggu Bukti",
      value: pendingProofCount,
      description: "Surat keluar belum unggah bukti",
      icon: Clock,
    },
  ];

  const adminStats =
    session.role === "SUPER_ADMIN"
      ? [
          {
            label: "Unit Aktif",
            value: totalUnits,
            description: "Seluruh kampus",
            icon: Building2,
          },
          {
            label: "Pengguna Terdaftar",
            value: totalUsers,
            description: "Akun aktif",
            icon: Users2,
          },
        ]
      : [];

  const recent = scopedArchives;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Selamat datang kembali,</p>
          <h1 className="text-2xl font-bold tracking-tight">{session.name}</h1>
          <p className="text-sm text-muted-foreground">
            Dasbor Sistem Persuratan Universitas Gajayana &mdash; unigamalang.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/generate">
              <Hash className="h-4 w-4" />
              Buat Nomor Surat
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/archives">
              <FileStack className="h-4 w-4" />
              Lihat Arsip
            </Link>
          </Button>
        </div>
      </div>

      {overdueArchives.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-destructive">
                {overdueArchives.length} surat melewati batas 14 hari unggah bukti
              </h2>
              <p className="mt-0.5 text-xs text-destructive/90">
                {session.role === "SUPER_ADMIN"
                  ? "Surat-surat berikut sudah lewat batas waktu tanpa bukti. Tindak lanjuti unit terkait."
                  : "Segera unggah bukti atau batalkan nomor (VOID). Status keterlambatan tetap tersimpan walaupun bukti diunggah belakangan."}
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {overdueArchives.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-background px-1.5 py-0.5 font-semibold">{a.number}</code>
                    <span className="text-muted-foreground">·</span>
                    <span className="truncate">{a.subject}</span>
                    {session.role === "SUPER_ADMIN" && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <Badge variant="outline" className="font-normal">
                          {a.unitCode}
                        </Badge>
                      </>
                    )}
                    <span className="text-muted-foreground">· dialokasikan {formatDate(a.createdAt)}</span>
                  </li>
                ))}
                {overdueArchives.length > 5 && (
                  <li className="italic text-muted-foreground">
                    …dan {overdueArchives.length - 5} surat lain dengan status melewati batas.
                  </li>
                )}
              </ul>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/dashboard/archives?status=OVERDUE">
                  Buka daftar arsip melewati batas
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {adminStats.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {adminStats.map((s) => (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.value}</div>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Arsip Terbaru</CardTitle>
              <CardDescription>5 surat terbaru yang tercatat dalam sistem.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/archives">
                Semua <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada arsip.</p>
            ) : (
              <ul className="divide-y">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-2 py-0.5 text-xs font-semibold">{a.number}</code>
                        <Badge
                          variant={
                            a.status === "ISSUED"
                              ? "success"
                              : a.status === "PENDING" || a.status === "PENDING_PROOF"
                              ? "warning"
                              : "secondary"
                          }
                        >
                          {a.status === "PENDING_PROOF"
                            ? "Menunggu Bukti"
                            : a.status === "PENDING"
                            ? "Menunggu Persetujuan"
                            : a.status === "ISSUED"
                            ? "Terbit"
                            : a.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium">{a.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(a.date)} &middot; Tujuan: {a.recipient}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribusi Jenis Surat {currentYear}</CardTitle>
            <CardDescription>Jumlah surat yang diterbitkan per jenis.</CardDescription>
          </CardHeader>
          <CardContent>
            {archivesByType.size === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data tahun ini.</p>
            ) : (
              <ul className="space-y-3">
                {Array.from(archivesByType.entries()).map(([code, count]) => {
                  const max = Math.max(...Array.from(archivesByType.values()));
                  return (
                    <li key={code}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{code}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
