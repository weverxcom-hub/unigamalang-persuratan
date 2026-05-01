import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, FileStack, Send, Inbox, Activity } from "lucide-react";

export const metadata = {
  title: "Laporan — Sistem Persuratan",
};

interface ReportLink {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  superAdminOnly?: boolean;
}

// Catatan: Index tetap menampilkan kartu "Laporan Tiket" / "Aktivitas Pengguna"
// untuk role lain tapi dengan flag superAdminOnly — kartu di-disable untuk
// peran yang tidak relevan supaya user tahu fitur tersebut ada (transparansi)
// tapi tidak bisa di-akses.
const REPORTS: ReportLink[] = [
  {
    href: "/dashboard/reports/letters",
    title: "Laporan Surat per Periode",
    description:
      "Rekap surat masuk & keluar berdasarkan rentang tanggal, unit, jenis, dan status. Cocok untuk laporan bulanan / tahunan akreditasi.",
    icon: FileStack,
  },
  {
    href: "/dashboard/reports/dispositions",
    title: "Laporan Disposisi",
    description:
      "Daftar disposisi yang dibuat dalam periode tertentu, lengkap dengan status tindak lanjut untuk memantau responsifitas penerima.",
    icon: Send,
  },
  {
    href: "/dashboard/reports/tickets",
    title: "Laporan Tiket Help Desk",
    description:
      "Frekuensi laporan masalah per fitur / unit, dan distribusi status. Hanya superadmin yang dapat mengakses.",
    icon: Inbox,
    superAdminOnly: true,
  },
  {
    href: "/dashboard/reports/user-activity",
    title: "Laporan Aktivitas Pengguna",
    description:
      "Pengguna paling aktif membuat surat / disposisi dalam periode tertentu. Hanya superadmin yang dapat mengakses.",
    icon: Activity,
    superAdminOnly: true,
  },
];

export default async function ReportsIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const isSuper = session.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Laporan</h1>
        <p className="text-sm text-muted-foreground">
          Pusat laporan persuratan terpusat. Setiap laporan dapat di-saring per
          periode, di-ekspor ke CSV / XLSX, atau di-cetak langsung sebagai PDF.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.map((r) => {
          const restricted = r.superAdminOnly && !isSuper;
          const Inner = (
            <Card
              className={
                restricted
                  ? "h-full cursor-not-allowed opacity-50"
                  : "h-full transition-shadow hover:shadow-md"
              }
            >
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-primary/10 p-2 text-primary">
                    <r.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-base">{r.title}</CardTitle>
                    {restricted && (
                      <CardDescription className="mt-1 text-xs italic">
                        Hanya untuk Super Admin.
                      </CardDescription>
                    )}
                  </div>
                  {!restricted && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{r.description}</CardDescription>
              </CardContent>
            </Card>
          );
          return restricted ? (
            <div key={r.href} aria-disabled>
              {Inner}
            </div>
          ) : (
            <Link key={r.href} href={r.href} className="block">
              {Inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
