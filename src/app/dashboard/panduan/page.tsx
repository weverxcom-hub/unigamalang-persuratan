import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Hash,
  Info,
  LifeBuoy,
  Mail,
  Send,
  ShieldCheck,
  Upload,
  Users2,
  XCircle,
} from "lucide-react";
import type { Role } from "@/lib/types";

export const metadata = {
  title: "Panduan Pengguna — Sistem Persuratan Universitas Gajayana",
};

// Visibility flags per role for the role-aware sections below. Keep this
// table in sync with sidebar.tsx route gating + middleware. SUPER_ADMIN is a
// superset of ADMIN_UNIT; USER is the most restricted role.
const CAPS = {
  SUPER_ADMIN: {
    canManageUnits: true,
    canManageLetterTypes: true,
    canManageUsers: true,
    canViewAllArchives: true,
    canVoidArchive: true,
    canApproveLetterTypeRequest: true,
    canResolveTickets: true,
    canSeeAudit: true,
  },
  ADMIN_UNIT: {
    canManageUnits: false,
    canManageLetterTypes: false,
    canManageUsers: false,
    canViewAllArchives: false,
    canVoidArchive: true,
    canApproveLetterTypeRequest: false,
    canResolveTickets: false,
    canSeeAudit: false,
  },
  USER: {
    canManageUnits: false,
    canManageLetterTypes: false,
    canManageUsers: false,
    canViewAllArchives: false,
    canVoidArchive: false,
    canApproveLetterTypeRequest: false,
    canResolveTickets: false,
    canSeeAudit: false,
  },
} satisfies Record<Role, Record<string, boolean>>;

export default async function PanduanPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const caps = CAPS[session.role];
  const roleLabel: Record<Role, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN_UNIT: "Admin Unit",
    USER: "Pengguna (Staf)",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-1 h-6 w-6 shrink-0 text-primary" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Panduan Pengguna</h1>
          <p className="text-sm text-muted-foreground">
            Cara menggunakan Sistem Manajemen Persuratan Universitas Gajayana
            (unigamalang). Konten di bawah disesuaikan dengan peran Anda:{" "}
            <Badge variant="outline" className="ml-1 align-middle">
              {roleLabel[session.role]}
            </Badge>
          </p>
        </div>
      </div>

      {/* ──────────────────────────── 1. Ringkasan ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Ringkasan Singkat</CardTitle>
          <CardDescription>
            Sistem ini menggantikan buku nomor fisik. Setiap nomor surat
            dialokasikan otomatis dari counter per (Unit × Jenis Surat × Tahun)
            dan wajib disertai bukti foto/scan sebelum resmi terbit.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <InfoBlock
            icon={Hash}
            title="Nomor Otomatis"
            body="Format: [No]/[Jenis]/[Unit]/[Bulan Romawi]/[Tahun]. Counter direset ke 001 setiap 1 Januari, terpisah per (Unit × Jenis Surat)."
          />
          <InfoBlock
            icon={Upload}
            title="Wajib Bukti"
            body="Setelah alokasi nomor, unggah foto/scan (max 25MB ke Google Drive) supaya status jadi Terbit. Tanpa bukti, surat tetap berstatus Menunggu Bukti."
          />
          <InfoBlock
            icon={ClipboardList}
            title="Arsip Terpusat"
            body="Semua surat keluar & masuk dapat ditelusuri di menu Pengarsipan dengan filter (unit, jenis, tahun, status, tanggal, kata kunci)."
          />
        </CardContent>
      </Card>

      {/* ─────────────────────── 2. Alur Penomoran ────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Alur Penomoran &amp; Bukti Surat</h2>
        <ol className="space-y-3">
          <Step
            n={1}
            title="Buka menu Buat Nomor Surat"
            body="Pilih unit penerbit dan jenis surat. Pratinjau nomor yang akan dialokasikan muncul otomatis (mis. 004/SK/UNIGA/IV/2026)."
          />
          <Step
            n={2}
            title="Isi Perihal & Tujuan"
            body="Tulis perihal (subjek surat) dan tujuan/penerima dengan jelas. Tombol Alokasikan Nomor akan aktif setelah kedua field terisi."
          />
          <Step
            n={3}
            title="Status: Menunggu Bukti"
            body="Begitu Alokasikan Nomor diklik, sistem mencatat arsip dengan status PENDING_PROOF. Nomor ini sudah 'milik' Anda dan tidak bisa dipakai user lain."
          />
          <Step
            n={4}
            title="Unggah bukti surat"
            body="Foto langsung dari ponsel (tombol Ambil Foto) atau unggah scan/PDF. Maksimal 25MB. Tipe yang didukung: PNG, JPG, WEBP, atau PDF."
          />
          <Step
            n={5}
            title="Status berubah menjadi Terbit"
            body="Setelah bukti diunggah, status otomatis menjadi ISSUED dan bukti dapat dilihat ulang kapan saja dari tabel arsip."
          />
          <Step
            n={6}
            title="Disposisi (opsional)"
            body="Setelah surat Terbit, klik tombol Disposisi pada tabel arsip untuk mengarahkan surat ke pengguna lain dengan catatan dan target tindak lanjut."
          />
        </ol>
      </section>

      {/* ─────────────────────── 3. Surat Sisipan / Manual ─────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Surat Sisipan (Manual Override / Backdate)</h2>
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <p>
              Pada form Buat Nomor Surat, centang{" "}
              <strong>Buat Surat Sisipan (manual override / backdate)</strong>{" "}
              jika Anda perlu mengeluarkan nomor di luar urutan otomatis. Contoh
              kasus:
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Surat backdate (tanggal terjadi di bulan lalu) yang baru
                diadministrasikan sekarang.
              </li>
              <li>
                Sub-nomor susulan untuk satu surat induk (mis.{" "}
                <code>024.1</code> atau <code>024.A</code>).
              </li>
            </ul>
            <p>Yang akan muncul saat checkbox dicentang:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong>Nomor Manual</strong> — wajib diawali angka. Sistem akan
                membungkus dengan prefix/suffix unit (misal{" "}
                <code>024.1/SK/UNIGA/V/2026</code>).
              </li>
              <li>
                <strong>Tanggal Surat</strong> — atur ke tanggal sebenarnya.
                Bulan pada nomor (Romawi) ikut tanggal yang dipilih.
              </li>
              <li>
                <strong>Alasan Sisipan</strong> — wajib minimal 5 karakter,
                tersimpan permanen di audit log untuk akuntabilitas.
              </li>
            </ul>
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400">
              Penting: nomor sisipan{" "}
              <strong>tidak memajukan counter penomoran utama</strong>. Counter
              tetap di angka terakhir yang dialokasikan otomatis.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ─────────────────────── 4. Legend Status ──────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Legend Status Arsip</h2>
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <StatusLegend
              variant="secondary"
              label="Draf"
              code="DRAFT"
              desc="Arsip belum disetujui. Masih bisa diedit oleh pembuat."
            />
            <StatusLegend
              variant="warning"
              label="Menunggu Persetujuan"
              code="PENDING"
              desc="Diajukan oleh user/staf, menunggu Admin Unit memproses."
            />
            <StatusLegend
              variant="warning"
              label="Menunggu Bukti"
              code="PENDING_PROOF"
              desc="Nomor sudah dialokasikan tapi bukti foto/scan belum diunggah."
            />
            <StatusLegend
              variant="default"
              label="Disetujui"
              code="APPROVED"
              desc="Permintaan staf disetujui Admin Unit, menunggu langkah lanjut."
            />
            <StatusLegend
              variant="success"
              label="Terbit"
              code="ISSUED"
              desc="Bukti sudah lengkap. Nomor surat resmi terbit dan terarsipkan."
            />
            <StatusLegend
              variant="destructive"
              label="Melewati Batas"
              code="OVERDUE"
              desc="PENDING_PROOF lebih dari 3 hari → otomatis di-mark OVERDUE oleh sistem."
            />
            <StatusLegend
              variant="destructive"
              label="Dibatalkan"
              code="VOID"
              desc="Arsip dibatalkan (terminal). Tidak dapat dikembalikan ke status lain."
            />
          </CardContent>
        </Card>
      </section>

      {/* ─────────────────────── 5. VOID & OVERDUE ─────────────────────────── */}
      {caps.canVoidArchive && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Pembatalan (VOID) Nomor Surat</h2>
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              <p>
                Nomor surat yang sudah dialokasikan tapi ternyata batal terbit
                (mis. surat tidak jadi diterbitkan, salah pilih jenis) bisa
                di-VOID untuk menjaga riwayat audit.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>
                  Hanya arsip ber-status <strong>PENDING_PROOF</strong> atau{" "}
                  <strong>OVERDUE</strong> yang dapat di-VOID.
                </li>
                <li>
                  Wajib mengisi alasan VOID (minimal 5 karakter). Alasan tercatat
                  di audit log.
                </li>
                <li>
                  VOID bersifat <strong>terminal</strong>: tidak dapat dibatalkan
                  atau dikembalikan ke status lain.
                </li>
                <li>
                  Counter penomoran <strong>tidak mundur</strong> — nomor yang
                  ter-VOID akan tetap ada di urutan, hanya dengan status{" "}
                  <em>Dibatalkan</em>.
                </li>
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ─────────────────────── 6. Disposisi ──────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Disposisi Surat</h2>
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              Setelah arsip Terbit (ISSUED), pembuat dapat membuat disposisi
              untuk meneruskan surat ke pengguna lain disertai instruksi.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                Tombol <strong>Disposisi</strong> di tabel arsip membuka form
                pemilihan penerima + catatan + due date.
              </li>
              <li>
                Penerima akan melihat disposisi di menu{" "}
                <strong>Disposisi</strong> dan dapat menandainya sebagai sudah
                diproses.
              </li>
              <li>
                Email notifikasi otomatis dikirim ke penerima jika SMTP sudah
                dikonfigurasi.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* ─────────────────────── 7. Letter Type Requests ───────────────────── */}
      {(session.role === "ADMIN_UNIT" || caps.canApproveLetterTypeRequest) && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">
            Permintaan Jenis Surat (Per Unit)
          </h2>
          <Card>
            <CardContent className="space-y-2 p-4 text-sm">
              {session.role === "ADMIN_UNIT" && (
                <>
                  <p>
                    Jika unit Anda butuh jenis surat yang belum tersedia di
                    dropdown (mis. <em>MOU</em> untuk Yayasan dan BAU saja),
                    Anda dapat mengajukan request ke superadmin.
                  </p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>
                      Buka menu <strong>Permintaan Jenis Surat</strong>, klik{" "}
                      <em>Ajukan Permintaan</em>.
                    </li>
                    <li>
                      Isi kode usulan (mis. <code>MOU</code>), nama lengkap
                      jenis surat, dan alasan kebutuhan.
                    </li>
                    <li>
                      Status request: <em>Menunggu Persetujuan</em> →{" "}
                      <em>Disetujui</em> / <em>Ditolak</em> oleh superadmin.
                    </li>
                    <li>
                      Jika Disetujui, jenis surat akan otomatis muncul di
                      dropdown form Buat Nomor Surat untuk unit Anda.
                    </li>
                  </ul>
                </>
              )}
              {caps.canApproveLetterTypeRequest && (
                <>
                  <p className="font-medium">Sebagai Superadmin:</p>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    <li>
                      Lihat permintaan masuk di menu <strong>Jenis Surat</strong>{" "}
                      → panel <em>Pending Requests</em>.
                    </li>
                    <li>
                      Approve dengan memilih final code/name dan unit allowlist
                      (Global atau Per Unit).
                    </li>
                    <li>
                      Reject wajib disertai alasan agar requester paham mengapa
                      ditolak.
                    </li>
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {/* ─────────────────────── 8. Help Desk ──────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Laporkan Masalah (Help Desk)</h2>
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              Tombol <strong>Laporkan Masalah</strong> di pojok atas halaman
              membuka dialog untuk mengirim laporan ke superadmin.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Judul (min. 5 karakter), deskripsi (min. 10 karakter).</li>
              <li>
                Halaman terkait terisi otomatis dari URL yang sedang Anda buka.
              </li>
              <li>
                Lampiran screenshot opsional (PNG/JPG/WEBP/GIF, max 5MB).
              </li>
              <li>
                Pantau balasan superadmin di menu <strong>Laporan Saya</strong>.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* ─────────────────────── 9. Role Permissions ───────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Hak Akses Berdasarkan Peran</h2>
        <p className="text-sm text-muted-foreground">
          Anda saat ini login sebagai{" "}
          <Badge variant="outline">{roleLabel[session.role]}</Badge>. Daftar di
          bawah menampilkan hak akses semua peran agar Anda paham siapa yang
          bertanggung jawab untuk fitur tertentu.
        </p>

        <RoleCard
          role="Super Admin"
          color="default"
          icon={ShieldCheck}
          highlight={session.role === "SUPER_ADMIN"}
          bullets={[
            "Mengelola seluruh unit (kode, nama, format template).",
            "Mengelola seluruh jenis surat (Global atau Per Unit + allowlist).",
            "Mengelola pengguna sistem (membuat akun, ganti peran, reset password).",
            "Melihat dan memodifikasi arsip lintas unit tanpa batasan.",
            "Mengubah Nomor Terakhir per (Unit × Jenis × Tahun) untuk migrasi data.",
            "Approve/Reject permintaan Jenis Surat dari Admin Unit.",
            "Membaca, membalas, dan menutup tiket Laporan Masalah.",
            "Akses ke Audit Log seluruh aktivitas sistem.",
          ]}
        />

        <RoleCard
          role="Admin Unit"
          color="success"
          icon={Users2}
          highlight={session.role === "ADMIN_UNIT"}
          bullets={[
            "Mengalokasikan nomor surat untuk unit sendiri (otomatis maupun sisipan).",
            "Mengunggah bukti foto/scan untuk surat keluar unit sendiri.",
            "Mengarsipkan surat masuk (Tambah Arsip Masuk) dengan upload file.",
            "Membuat disposisi ke pengguna lain di unit yang sama.",
            "VOID arsip ber-status PENDING_PROOF / OVERDUE pada unit sendiri.",
            "Mengajukan permintaan jenis surat baru ke superadmin.",
            "Mengirim Laporan Masalah ke superadmin.",
            "Tidak dapat melihat arsip unit lain.",
          ]}
        />

        <RoleCard
          role="Pengguna (Staf)"
          color="secondary"
          icon={Users2}
          highlight={session.role === "USER"}
          bullets={[
            "Mengajukan draf permintaan nomor surat (status: Menunggu Persetujuan).",
            "Admin Unit yang akan menyetujui dan menerbitkan nomor.",
            "Melihat arsip yang ia buat sendiri.",
            "Menerima dan memproses disposisi yang ditujukan kepadanya.",
            "Mengirim Laporan Masalah ke superadmin.",
          ]}
        />
      </section>

      {/* ─────────────────────── 10. Format Nomor Surat ────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Format Nomor Surat</h2>
        <Card>
          <CardContent className="space-y-3 p-4 text-sm">
            <p>
              Format default UNIGA (April 2026):{" "}
              <code>[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]</code>
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li>
                <strong>NO</strong> — sequence 3-digit (001, 002, ...). Reset ke
                001 setiap 1 Januari, dipisah per (Unit × Jenis Surat).
              </li>
              <li>
                <strong>TYPE_CODE</strong> — kode Jenis Surat (mis. SK, ST, INT,
                MOU).
              </li>
              <li>
                <strong>UNIT_CODE</strong> — kode unit penerbit (mis. UNIGA,
                YAS, BAU).
              </li>
              <li>
                <strong>ROMAN_MONTH</strong> — bulan dalam angka Romawi (I, II,
                III, ..., XII).
              </li>
              <li>
                <strong>YEAR</strong> — tahun 4-digit.
              </li>
            </ul>
            <p>
              Contoh: <code>007/SK/UNIGA/V/2026</code> = SK ke-7 dari unit
              UNIGA, dialokasikan Mei 2026.
            </p>
            <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
              Superadmin dapat mengubah template per unit di menu Unit (mis.
              menambah prefix khusus). Hubungi superadmin jika perlu format
              berbeda.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ─────────────────────── 11. Tips ──────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Tips &amp; Catatan</h2>
        <Card>
          <CardContent className="space-y-2 p-4 text-sm">
            <Tip icon={CheckCircle2}>
              Registrasi dan login hanya menerima email{" "}
              <code>@unigamalang.ac.id</code>.
            </Tip>
            <Tip icon={CheckCircle2}>
              Gunakan aplikasi ini dari ponsel untuk memudahkan pemotretan
              bukti surat langsung dari kamera. UI sudah dioptimasi untuk layar
              kecil.
            </Tip>
            <Tip icon={CheckCircle2}>
              Filter arsip bisa digabungkan: unit, jenis surat, tahun, status,
              rentang tanggal, dan kata kunci (cari di nomor / perihal /
              tujuan).
            </Tip>
            <Tip icon={CheckCircle2}>
              Tabel arsip mendukung ekspor ke CSV / XLSX untuk laporan
              tahunan, dan cetak dengan filter aktif.
            </Tip>
            <Tip icon={Info}>
              File bukti diunggah ke Google Drive (sampai 25MB). Jika Drive
              belum dikonfigurasi, sistem otomatis fallback ke Vercel Blob (5MB)
              atau penyimpanan inline (2MB).
            </Tip>
            <Tip icon={AlertTriangle}>
              Jangan membatalkan tab browser saat sedang upload bukti — proses
              upload bisa terhenti dan Anda perlu coba ulang.
            </Tip>
          </CardContent>
        </Card>
      </section>

      <p className="text-xs text-muted-foreground">
        Masuk sebagai <span className="font-medium">{session.name}</span>{" "}
        &middot; peran <Badge variant="outline">{roleLabel[session.role]}</Badge>
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
        <Icon className="h-4 w-4 shrink-0 text-primary" />
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
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

function StatusLegend({
  variant,
  label,
  code,
  desc,
}: {
  variant: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
  label: string;
  code: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-card p-3">
      <Badge variant={variant} className="shrink-0">
        {label}
      </Badge>
      <div className="min-w-0">
        <p className="text-xs font-mono text-muted-foreground">{code}</p>
        <p className="text-sm">{desc}</p>
      </div>
    </div>
  );
}

function RoleCard({
  role,
  icon: Icon,
  bullets,
  color,
  highlight,
}: {
  role: string;
  icon: React.ComponentType<{ className?: string }>;
  bullets: string[];
  color: "default" | "secondary" | "success";
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/60 ring-1 ring-primary/30" : undefined}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-5 w-5 shrink-0 text-primary" />
          <CardTitle className="text-base">{role}</CardTitle>
          <Badge variant={color}>Peran</Badge>
          {highlight && (
            <Badge variant="outline" className="border-primary/60 text-primary">
              Anda
            </Badge>
          )}
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

function Tip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}

// Kept to surface the LifeBuoy / Mail / Send / XCircle icons in source for
// future iterations (e.g. inline icons in Help Desk / Letter Type Request /
// VOID sections). They're not used at render time today but importing them
// here keeps the icon palette discoverable for downstream edits without
// re-importing across files.
void LifeBuoy;
void Mail;
void Send;
void XCircle;
