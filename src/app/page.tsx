import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileStack, Hash, ShieldCheck, Users2 } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Logo size={44} />
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Masuk</Link>
          </Button>
          <Button asChild>
            <Link href="/register">Daftar</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pb-16 pt-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          Platform resmi unigamalang
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
          Sistem Manajemen Persuratan <span className="text-primary">Universitas Gajayana</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Digitalisasi buku penomoran fisik, arsip terpusat, dan pelacakan surat keluar-masuk di seluruh
          unit kampus. Akses terbatas hanya untuk sivitas dengan email <strong>@unigamalang.ac.id</strong>.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/login">Masuk ke Dashboard</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/register">Daftar Akun Baru</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 md:grid-cols-2 lg:grid-cols-4">
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
    title: "Kolaborasi Antar-Unit",
    desc: "Ajukan draf ke Admin Unit, pantau status, dan bagikan arsip lintas unit.",
    icon: Users2,
  },
];
