import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SiteFooter } from "@/components/app/footer";
import { FileStack, Hash, ShieldCheck, Users2 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-primary/5">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-5 sm:px-6 sm:py-6">
        <Logo size={44} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild size="sm">
            <Link href="/login">Masuk</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Daftar</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-4 pb-14 pt-8 text-center sm:px-6 sm:pb-16 sm:pt-10">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            Platform resmi unigamalang
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-5xl">
            Sistem Manajemen Persuratan <span className="text-primary">Universitas Gajayana</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Digitalisasi buku penomoran fisik, arsip terpusat, dan pelacakan surat keluar-masuk di seluruh
            unit kampus. Akses terbatas hanya untuk sivitas dengan email <strong>@unigamalang.ac.id</strong>.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
            <Button size="lg" asChild className="w-full sm:w-auto">
              <Link href="/login">Masuk ke Dashboard</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
              <Link href="/register">Daftar Akun Baru</Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <CardTitle className="text-base">{f.title}</CardTitle>
                <CardDescription>{f.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

const FEATURES = [
  {
    title: "Penomoran Otomatis",
    desc: "Format dinamis per unit — reset otomatis setiap tahun (001/UNIGA/SK/IV/2026).",
    icon: Hash,
  },
  {
    title: "Arsip Terpusat",
    desc: "Satu sumber kebenaran untuk seluruh surat keluar, masuk, dan lampiran unigamalang.",
    icon: FileStack,
  },
  {
    title: "Kontrol Akses Berperan",
    desc: "Super Admin Pusat, Admin Unit, dan Pengguna dengan kewenangan berbeda.",
    icon: ShieldCheck,
  },
  {
    title: "Bukti Surat Wajib",
    desc: "Setiap nomor harus disertai foto/scan surat agar dapat berstatus Terbit.",
    icon: Users2,
  },
];
