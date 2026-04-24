import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  CheckCircle2,
  Hash,
  Upload,
  FileStack,
  ShieldCheck,
  Users2,
  Info,
} from "lucide-react";

export const metadata = {
  title: "Panduan Pengguna — Sistem Persuratan Universitas Gajayana",
};

export default async function PanduanPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-1 h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panduan Pengguna</h1>
          <p className="text-sm text-muted-foreground">
            Cara menggunakan Sistem Manajemen Persuratan Universitas Gajayana (unigamalang).
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ringkasan Singkat</CardTitle>
          <CardDescription>
            Sistem ini menggantikan buku nomor fisik. Setiap nomor surat dialokasikan otomatis dan wajib
            disertai bukti (foto/scan) sebelum resmi terbit.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <InfoBlock icon={Hash} title="Nomor Otomatis" body="Format: [No]/[Unit]/[Jenis]/[Bulan Romawi]/[Tahun]. Reset ke 001 setiap 1 Januari." />
          <InfoBlock icon={Upload} title="Wajib Bukti" body="Setelah alokasi nomor, unggah foto/scan surat agar arsip menjadi Terbit." />
          <InfoBlock icon={FileStack} title="Arsip Terpusat" body="Semua surat keluar & masuk bisa ditelusuri di menu Pengarsipan." />
        </CardContent>
      </Card>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Alur Penomoran &amp; Bukti Surat</h2>
        <ol className="space-y-3">
          <Step
            n={1}
            title="Buka menu Nomor Surat"
            body="Pilih unit penerbit dan jenis surat. Pratinjau nomor muncul otomatis (misal 004/UNIGA/SK/IV/2026)."
          />
          <Step
            n={2}
            title="Isi perihal & tujuan"
            body="Tulis perihal (subjek) dan tujuan surat dengan jelas, lalu klik tombol Alokasikan Nomor."
          />
          <Step
            n={3}
            title="Status: Menunggu Bukti"
            body='Nomor dialokasikan dan tercatat di arsip dengan status "Menunggu Bukti" (PENDING_PROOF). Arsip belum dianggap selesai.'
          />
          <Step
            n={4}
            title="Unggah bukti surat"
            body="Foto langsung dari ponsel (tombol Ambil Foto) atau unggah scan/PDF. Maksimal 3MB, tipe file gambar atau PDF."
          />
          <Step
            n={5}
            title="Status berubah menjadi Terbit"
            body="Setelah bukti diunggah, status otomatis menjadi Terbit (ISSUED) dan bukti dapat dilihat ulang kapan saja dari tabel arsip."
          />
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Berdasarkan Peran</h2>

        <RoleCard
          role="Super Admin"
          color="default"
          icon={ShieldCheck}
          bullets={[
            "Mengelola seluruh unit (kode & nama) pada menu Unit.",
            "Mengelola daftar jenis surat pada menu Jenis Surat.",
            "Melihat arsip lintas unit tanpa batasan.",
            "Dapat mengunggah bukti, menerbitkan, dan menghapus arsip apa pun.",
          ]}
        />

        <RoleCard
          role="Admin Unit"
          color="success"
          icon={Users2}
          bullets={[
            "Mengalokasikan nomor surat untuk unit sendiri.",
            "Wajib mengunggah foto/scan surat agar status menjadi Terbit.",
            "Mengarsipkan surat masuk / surat lama secara manual.",
            "Hanya dapat melihat dan mengelola arsip di unit sendiri.",
          ]}
        />

        <RoleCard
          role="Pengguna (Staf)"
          color="secondary"
          icon={Users2}
          bullets={[
            "Mengajukan draf permintaan nomor surat ke Admin Unit.",
            "Draf berstatus Menunggu Persetujuan sampai Admin Unit memprosesnya.",
            "Dapat mengunggah bukti untuk arsip yang ia buat.",
          ]}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Tips &amp; Catatan</h2>
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <Tip icon={CheckCircle2}>
              Registrasi dan login hanya menerima email <code>@unigamalang.ac.id</code>.
            </Tip>
            <Tip icon={CheckCircle2}>
              Gunakan aplikasi ini dari ponsel untuk memudahkan pemotretan bukti surat langsung dari kamera.
            </Tip>
            <Tip icon={CheckCircle2}>
              Filter arsip bisa digabungkan: unit, jenis surat, tahun, dan kata kunci (nomor/perihal/tujuan).
            </Tip>
            <Tip icon={Info}>
              Pada prototipe ini file disimpan sebagai data gambar di basis data JSON. Untuk produksi,
              gantilah ke penyimpanan objek (S3/GCS) dan basis data relasional.
            </Tip>
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground">
        Masuk sebagai <span className="font-medium">{session.name}</span> &middot; peran {" "}
        <Badge variant="outline">{session.role}</Badge>
      </p>
    </div>
  );
}

function InfoBlock({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-3 rounded-md border bg-card p-3 text-sm">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

function RoleCard({
  role,
  icon: Icon,
  bullets,
  color,
}: {
  role: string;
  icon: React.ComponentType<{ className?: string }>;
  bullets: string[];
  color: "default" | "secondary" | "success";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{role}</CardTitle>
          <Badge variant={color}>Peran</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Tip({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-primary" />
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
