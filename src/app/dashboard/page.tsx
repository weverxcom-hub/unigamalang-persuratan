import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, toRoman } from "@/lib/utils";
import { ArrowRight, FileStack, Hash, Users2, Building2 } from "lucide-react";
import { redirect } from "next/navigation";

export default async function DashboardHome() {
  const session = await getSession();
  if (!session) redirect("/login");
  const db = getDb();

  const scopedArchives =
    session.role === "SUPER_ADMIN"
      ? db.archives
      : db.archives.filter((a) => a.unitId === session.unitId);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const thisYearArchives = scopedArchives.filter((a) => new Date(a.date).getFullYear() === currentYear);

  const archivesByType = new Map<string, number>();
  for (const a of thisYearArchives) {
    archivesByType.set(a.letterTypeCode, (archivesByType.get(a.letterTypeCode) ?? 0) + 1);
  }

  const stats = [
    {
      label: "Total Arsip",
      value: scopedArchives.length,
      description: `${thisYearArchives.length} di tahun ${currentYear}`,
      icon: FileStack,
    },
    {
      label: "Nomor Surat Bulan Ini",
      value: thisYearArchives.filter((a) => new Date(a.date).getMonth() + 1 === currentMonth).length,
      description: `Bulan ${toRoman(currentMonth)} / ${currentYear}`,
      icon: Hash,
    },
    {
      label: "Unit Aktif",
      value:
        session.role === "SUPER_ADMIN"
          ? db.units.length
          : 1,
      description: session.role === "SUPER_ADMIN" ? "Seluruh kampus" : "Unit Anda",
      icon: Building2,
    },
    {
      label: "Pengguna Terdaftar",
      value: session.role === "SUPER_ADMIN" ? db.users.length : "-",
      description: session.role === "SUPER_ADMIN" ? "Akun unigamalang" : "Khusus Super Admin",
      icon: Users2,
    },
  ];

  const recent = scopedArchives
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 5);

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
                        <Badge variant={a.status === "ISSUED" ? "success" : a.status === "PENDING" ? "warning" : "secondary"}>
                          {a.status}
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
