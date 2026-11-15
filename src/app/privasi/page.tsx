import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/app/footer";

export const metadata: Metadata = {
  title: "Kebijakan Privasi — Sistem Persuratan Universitas Gajayana",
};

const UPDATED = "15 November 2026";

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <Logo size={48} showWordmark={false} />
          <div>
            <p className="text-sm text-muted-foreground">Sistem Manajemen Persuratan</p>
            <p className="font-semibold">Universitas Gajayana Malang</p>
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">Kebijakan Privasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">Berlaku sejak {UPDATED}</p>

        <div className="mt-8 space-y-6 text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold">Tentang sistem ini</h2>
            <p className="mt-2">
              Sistem Manajemen Persuratan (surat.unigamalang.ac.id) dipakai oleh unit-unit Universitas
              Gajayana Malang untuk membuat nomor surat dinas, menyimpan arsip surat, dan menyusun laporan
              persuratan. Sistem ini hanya untuk pegawai yang akunnya sudah dibuat oleh pengelola sistem.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Data yang kami simpan</h2>
            <ul className="mt-2 list-disc space-y-1 pl-6">
              <li>Data akun: nama, alamat email, unit kerja, dan peran. Data ini diisi oleh pengelola sistem.</li>
              <li>Data surat: nomor, tanggal, perihal, tujuan, tembusan, dan file bukti surat yang diunggah pengguna.</li>
              <li>
                Catatan aktivitas untuk keamanan: waktu masuk, perubahan data, alamat IP, dan jenis peramban.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Masuk dengan Google</h2>
            <p className="mt-2">
              Jika Anda memilih &ldquo;Masuk dengan Google&rdquo;, Google mengirimkan nama, alamat email,
              status verifikasi email, dan domain akun Google Workspace Anda. Data ini hanya dipakai untuk
              mencocokkan Anda dengan akun yang sudah terdaftar. Sistem tidak meminta akses ke Gmail, Google
              Drive, kontak, atau data Google lain milik Anda, dan tidak membuat akun baru dari login Google.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Penggunaan dan pembagian data</h2>
            <p className="mt-2">
              Data hanya dipakai untuk keperluan persuratan universitas. Setiap unit hanya dapat melihat surat
              unitnya sendiri, dan file bukti surat hanya dapat dibuka melalui sistem oleh pengguna yang berhak.
              Data tidak dijual dan tidak dibagikan kepada pihak lain, kecuali penyedia layanan yang menjalankan
              sistem ini (hosting aplikasi, basis data, dan penyimpanan file).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Cookie</h2>
            <p className="mt-2">
              Sistem memakai cookie untuk menjaga Anda tetap masuk selama sesi berlangsung. Cookie ini tidak
              dipakai untuk iklan atau pelacakan.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">Hak Anda dan kontak</h2>
            <p className="mt-2">
              Untuk memperbaiki data akun, menonaktifkan akun, atau bertanya tentang data Anda, hubungi
              pengelola sistem melalui menu <em>Laporkan Masalah</em> di dalam sistem, atau melalui PTI
              Universitas Gajayana Malang di{" "}
              <a href="mailto:pti@unigamalang.ac.id" className="text-primary hover:underline">
                pti@unigamalang.ac.id
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-10">
          <Link href="/login" className="text-primary hover:underline">
            &larr; Kembali ke halaman masuk
          </Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
