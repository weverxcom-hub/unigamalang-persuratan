# Reverse PRD — Sistem Manajemen Persuratan Universitas Gajayana (unigamalang)

> **Dokumen ini di-generate secara otomatis dari analisis kode sumber repositori `unigamalang-persuratan`.**
> Tanggal analisis: 23 Mei 2026

---

## 1. Ringkasan Produk

Sistem Manajemen Persuratan Universitas Gajayana (`unigamalang`) adalah platform digital berbasis web yang dirancang untuk mendigitalisasi seluruh siklus hidup surat resmi di lingkungan kampus. Aplikasi ini menangani **penomoran otomatis**, **pengarsipan terpusat**, **disposisi surat**, **pelacakan status**, dan **pelaporan** untuk seluruh unit organisasi di Universitas Gajayana.

### Tujuan Utama
- Menggantikan proses persuratan manual (buku nomor surat fisik) dengan sistem digital yang terpusat dan traceable.
- Menyediakan penomoran surat otomatis per unit dengan format yang dapat dikustomisasi, aman dari race condition.
- Mengarsipkan seluruh surat masuk dan keluar beserta bukti fisiknya (scan/foto) di penyimpanan cloud.
- Memfasilitasi disposisi surat masuk ke unit/pengguna lain dengan notifikasi email dan webhook.
- Menyediakan audit trail lengkap untuk akuntabilitas dan kebutuhan akreditasi.

### Tech Stack
| Komponen | Teknologi |
|---|---|
| Frontend & Backend | **Next.js 14** (App Router, Server Components) |
| Database | **PostgreSQL** via **Prisma ORM** (Neon Postgres pooled) |
| Styling | **Tailwind CSS** + **shadcn/ui** (Radix primitives) |
| File Storage | **Google Drive** (primer) → **Vercel Blob** (fallback) → Inline base64 (fallback akhir) |
| Email | **Resend** (graceful fallback ke console log) |
| Webhook | HMAC-SHA256 outbound ke **n8n** (graceful fallback) |
| Auth | JWT (HS256) via **jose** + **bcryptjs** |
| Deployment | **Vercel** (region `sin1` — Singapore) |
| Validasi | **Zod** (schema validation pada setiap endpoint) |
| Export | **ExcelJS** (XLSX) + CSV native |

---

## 2. Persona & Peran Pengguna

Sistem menerapkan **3 peran** yang didefinisikan dalam enum `Role` pada Prisma schema:

### 2.1 SUPER_ADMIN (Super Admin Pusat)

**Deskripsi:** Administrator tingkat universitas dengan akses penuh ke seluruh sistem.

**Hak Akses:**
- Melihat arsip surat **seluruh unit** kampus (lintas unit).
- Membuat surat untuk unit manapun (tidak terbatas pada unit sendiri).
- Mengelola master data: **Unit**, **Jenis Surat**, dan **Akun Pengguna** (CRUD + soft-delete + reactivation).
- Melihat arsip yang sudah di-soft-delete (`includeDeleted=true`).
- Mengakses **Audit Log** (`/dashboard/audit`) — log immutable seluruh mutasi sistem.
- Mengelola **Tiket Help Desk** (`/dashboard/tickets`) — merespons laporan masalah dari semua pengguna.
- Mereview dan menyetujui/menolak **pengajuan jenis surat** (`LetterTypeRequest`) dari Admin Unit.
- Membatalkan (VOID) surat berstatus `PENDING_PROOF` atau `OVERDUE` dari unit manapun.
- Mengakses laporan: Surat per Periode, Disposisi, Tiket Help Desk, dan Aktivitas Pengguna.
- Menguji webhook outbound (`/api/webhooks/test`).
- Disposisi ke **semua** disposisi via `?box=all`.

### 2.2 ADMIN_UNIT (Admin Unit)

**Deskripsi:** Administrator di level unit/fakultas, hanya melihat data milik unitnya sendiri.

**Hak Akses:**
- Membuat surat keluar (OUTGOING) untuk unit sendiri — nomor dialokasi otomatis.
- Mencatat surat masuk (INCOMING) untuk unit sendiri — nomor manual.
- Mengunggah bukti surat (proof upload).
- Membuat **disposisi** surat masuk ke pengguna/unit lain.
- Membatalkan (VOID) surat milik unitnya yang berstatus `PENDING_PROOF`/`OVERDUE`.
- Mengajukan **jenis surat baru** yang spesifik untuk unitnya (`LetterTypeRequest`).
- Mengakses laporan Surat per Periode dan Disposisi (terbatas data unitnya).
- Menghapus (soft-delete) arsip milik unitnya.
- Melaporkan masalah via Help Desk.

### 2.3 USER (Pengguna Biasa / Staf)

**Deskripsi:** Staf biasa yang membuat draft surat untuk disetujui oleh admin.

**Hak Akses:**
- Membuat draft surat keluar — status langsung menjadi `PENDING` (menunggu persetujuan admin).
- Mengunggah bukti surat yang mereka buat sendiri.
- Melihat arsip surat **hanya di unit sendiri**.
- Menerima disposisi dan memperbarui statusnya (acknowledge / complete / reject).
- Menghapus surat yang mereka buat sendiri **jika** statusnya masih `PENDING` atau `PENDING_PROOF`.
- Melaporkan masalah via Help Desk dan memantau statusnya di `/dashboard/my-tickets`.
- **TIDAK** dapat membuat disposisi, mengelola master data, atau mengakses audit log.

### 2.4 Domain Guard

Registrasi dan login **hanya** untuk email berdomain `@unigamalang.ac.id`. Validasi dilakukan di backend (`isAllowedEmail()`) dan di frontend (placeholder email). Sistem juga mendukung **SSO login** melalui UNIGA SSO Gateway (opsional, aktif jika env `SSO_BASE_URL`, `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT_URI` diisi).

---

## 3. Fitur Utama & Alur Pengguna (User Flow)

### 3.1 Penomoran Surat Keluar (Outgoing)

**Alur:**
1. Pengguna membuka `/dashboard/generate`.
2. Memilih **Unit** dan **Jenis Surat** dari dropdown (dropdown jenis surat otomatis difilter berdasarkan unit — hanya tampilkan jenis GLOBAL + jenis yang diizinkan untuk unit tersebut).
3. Sistem menampilkan **pratinjau nomor berikutnya** secara real-time (memanggil `POST /api/numbering/preview` tanpa mengubah counter).
4. Pengguna mengisi **Perihal** dan **Tujuan**, lalu submit.
5. Backend menjalankan `allocateNextNumber()` di dalam `prisma.$transaction` dengan `upsert + increment` — aman dari race condition.
6. Nomor surat dialokasikan dan arsip dibuat:
   - Status = `PENDING` (jika pembuat = USER)
   - Status = `ISSUED` (jika pembuat = Admin, dengan file proof)
   - Status = `PENDING_PROOF` (jika pembuat = Admin, tanpa file proof)
7. Jika file proof di-attach saat pembuatan, file di-upload ke Google Drive / Vercel Blob.
8. Webhook `archive.created` dikirim ke n8n.
9. Pengguna diarahkan ke halaman arsip atau dapat langsung upload bukti.

**Format Nomor:** Dikustomisasi per unit via `formatTemplate` (contoh: `[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]` → `001/SK/UNIGA/V/2026`). Counter di-reset setiap tahun per kombinasi `(unitId, letterTypeId, year)`.

### 3.2 Surat Sisipan (Insert / Manual Override)

**Alur:**
1. Admin mengaktifkan toggle "Surat Sisipan" di form generate.
2. Memasukkan nomor manual (mis. `024.1` atau `024.A`) dan tanggal surat (backdate).
3. Wajib mengisi **alasan sisipan** (minimal 5 karakter) — tersimpan di `Archive.insertReason`.
4. Nomor **tidak menggunakan** auto-allocator; counter tidak bergerak.
5. Arsip ditandai `isInsert = true` untuk identifikasi auditor.

### 3.3 Pencatatan Surat Masuk (Incoming)

**Alur:**
1. Admin membuka `/dashboard/generate` atau form surat masuk di `/dashboard/archives`.
2. Mengisi **nomor manual** (dari surat asli), **pengirim** (`externalSender`), perihal, dan tujuan.
3. Upload scan/foto surat masuk (opsional).
4. Arsip dibuat dengan `direction = INCOMING`, status langsung `ISSUED` jika ada bukti.
5. Email notifikasi dikirim ke admin unit penerima via Resend.
6. Webhook `archive.created` dikirim.

### 3.4 Disposisi Surat

**Alur:**
1. Admin Unit / Super Admin membuka detail arsip surat di `/dashboard/archives`.
2. Klik "Disposisi" → dialog muncul untuk memilih **penerima** (pengguna spesifik ATAU unit).
3. Mengisi **instruksi** dan **batas waktu** (opsional).
4. Backend membuat record `Disposition` dengan status `PENDING`.
5. Email notifikasi otomatis dikirim ke penerima (Resend).
6. Webhook `disposition.created` dikirim ke n8n.
7. Penerima melihat disposisi di `/dashboard/dispositions` (tab inbox).
8. Penerima dapat mengubah status: `PENDING` → `ACKNOWLEDGED` → `COMPLETED` (atau `REJECTED`).
9. Setiap perubahan status dicatat di `AuditLog`.

**Skenario lintas-unit:** Penerima disposisi di unit lain dapat membaca detail arsip meskipun bukan dari unit mereka (check `Disposition.toUserId` / `toUnitId`).

### 3.5 Upload Bukti Surat (Proof)

**Alur prioritas storage:**
1. **Google Drive** (primer): `POST /api/gdrive/init` → client PUT langsung ke Drive (resumable upload, max 25 MB) → `POST /api/gdrive/finalise` → simpan `gdriveFileId` + `fileUrl` (webViewLink).
2. **Vercel Blob** (fallback): `POST /api/blob/upload` (client-side multipart) → simpan `blobPathname` + `fileUrl`.
3. **Inline base64** (fallback terakhir): File ≤ 3 MB disimpan langsung di kolom `fileDataUrl`.

**Multi-file bundle:** Client-side, beberapa gambar (PNG/JPG/WEBP) dapat digabung menjadi satu PDF menggunakan `jspdf` sebelum upload (`proof-bundle.ts`).

### 3.6 Pembatalan Surat (VOID)

**Alur:**
1. Admin Unit (untuk unit sendiri) atau Super Admin membuka arsip berstatus `PENDING_PROOF` atau `OVERDUE`.
2. Klik "Batalkan" → dialog muncul, wajib isi **alasan** (min. 5 karakter).
3. Backend memverifikasi status arsip secara atomik di dalam transaksi (race-condition safe).
4. Status berubah menjadi `VOID`. Nomor **tidak** dilepaskan ke counter.
5. Arsip tetap tampil di daftar dengan badge merah, menjaga audit trail.
6. Webhook `archive.voided` dikirim.

**Batasan:** Surat berstatus `ISSUED` **tidak dapat** di-VOID (karena sudah terdistribusi secara eksternal).

### 3.7 Overdue Tracking (Surat Melewati Batas)

**Alur:**
1. Cron job harian (`GET /api/cron/mark-overdue`, vercel.json: `0 1 * * *`) mencari arsip `PENDING_PROOF` yang sudah > 14 hari.
2. Status otomatis diubah menjadi `OVERDUE` (`overdueMarkedAt` dicatat).
3. Dashboard menampilkan **banner peringatan** untuk arsip overdue.
4. Admin masih dapat upload bukti setelah overdue → status kembali ke `ISSUED`, tapi `overdueMarkedAt` tetap tercatat sebagai histori keterlambatan.

### 3.8 Tanda Terima (Receipt)

Halaman cetak `/dashboard/archives/[id]/receipt` menampilkan tanda terima untuk surat masuk, berisi: ID sistem, tanggal, pengirim, perihal, penerima, unit, dan petugas pencatat. Dapat dicetak langsung dari browser.

### 3.9 Pengarsipan & Pencarian

**Fitur pencarian** di `/dashboard/archives`:
- Pencarian teks (case-insensitive) di: `number`, `subject`, `recipient`, `externalSender`.
- Filter kombinasi: unit, jenis surat, arah (masuk/keluar), status, tahun, rentang tanggal.
- Deep-link filter via URL query params (mis. `/dashboard/archives?status=OVERDUE`).
- Soft-delete: arsip dihapus dengan `deletedAt = now()`, tidak benar-benar hilang dari database. File di-cleanup dari Blob/Drive secara best-effort.

### 3.10 Laporan & Ekspor

**4 jenis laporan** di `/dashboard/reports`:

| Laporan | Akses | Ekspor |
|---|---|---|
| Laporan Surat per Periode | Semua role (scoped per unit) | CSV / XLSX |
| Laporan Disposisi | Semua role (scoped per unit) | CSV / XLSX |
| Laporan Tiket Help Desk | SUPER_ADMIN only | CSV / XLSX |
| Laporan Aktivitas Pengguna | SUPER_ADMIN only | CSV / XLSX |

Semua laporan mendukung filter rentang tanggal, unit, dan status. Default range: tahun kalender berjalan.

**Halaman cetak terpisah** untuk print/PDF: `/print/archives`, `/print/units`, `/print/letter-types`, `/print/users`.

### 3.11 Help Desk / Laporan Masalah

**Alur:**
1. Semua pengguna terautentikasi dapat klik tombol "Laporkan Masalah" di topbar.
2. Form berisi: judul, deskripsi, halaman/fitur (otomatis terisi path saat ini), screenshot opsional.
3. Tiket masuk ke antrian Super Admin di `/dashboard/tickets` dengan filter status.
4. Super Admin merespons tiket dan mengubah status (`NEW` → `IN_PROGRESS` → `RESOLVED` / `CLOSED`).
5. Pelapor memantau status di `/dashboard/my-tickets`.

### 3.12 Manajemen Jenis Surat (Letter Type)

**Scope Jenis Surat:**
- **GLOBAL**: Tersedia di dropdown semua unit (default: SK, ST, SP, UND, EDAR, UMUM).
- **UNIT_SPECIFIC**: Hanya tersedia di unit yang ter-allowlist via tabel `LetterTypeUnit`.

**Alur pengajuan jenis surat baru:**
1. Admin Unit mengajukan jenis surat baru via `/dashboard/letter-type-requests`.
2. Super Admin mereview di halaman manajemen jenis surat.
3. Jika disetujui, Super Admin membuat `LetterType` baru dengan scope `UNIT_SPECIFIC` dan menentukan unit mana saja yang boleh menggunakannya.

### 3.13 Notifikasi Email

Email otomatis dikirim via Resend pada event:
- Surat masuk baru dibuat → notifikasi ke admin unit penerima.
- Disposisi baru → notifikasi ke penerima disposisi (user target, atau semua admin unit target).

Graceful fallback: jika `RESEND_API_KEY` tidak diisi, event dicetak ke console server.

### 3.14 Webhook Outbound

Setiap event penting di-POST ke `N8N_WEBHOOK_URL`:
- `archive.created`, `archive.voided`, `disposition.created`
- Ditandatangani dengan HMAC-SHA256 (`X-Signature` header).
- Semua percobaan disimpan di tabel `WebhookDelivery` untuk audit.
- Graceful fallback: jika URL kosong, delivery dicatat tapi HTTP POST diskip.

### 3.15 Profil Pengguna

Halaman `/dashboard/profile` memungkinkan pengguna melihat informasi akun dan mengubah kata sandi mereka (`PATCH /api/users/me/password`).

### 3.16 Panduan Pengguna

Halaman `/dashboard/panduan` menampilkan panduan lengkap dalam Bahasa Indonesia yang disesuaikan berdasarkan peran pengguna (role-aware content).

### 3.17 SSO (Single Sign-On)

Sistem mendukung login via **UNIGA SSO Gateway** (OAuth-like flow):
1. Pengguna klik "Masuk dengan UNIGA SSO" di halaman login.
2. Redirect ke `SSO_BASE_URL/authorize` dengan `client_id` dan `redirect_uri`.
3. Setelah autentikasi di SSO Gateway, callback ke `/auth/callback?code=xxx`.
4. Server menukar code → user info, auto-create user jika belum ada.

SSO bersifat opsional: tombol hanya muncul jika env vars SSO dikonfigurasi.

---

## 4. Entitas Data

### 4.1 Model Database (Prisma Schema)

```
┌─────────────────────┐     ┌──────────────────────┐
│        User          │────>│        Unit           │
│  id, email, name     │     │  id, code, name       │
│  passwordHash, role  │     │  formatTemplate       │
│  unitId?, deletedAt? │     │  deletedAt?           │
└──────────┬──────────┘     └──────────┬───────────┘
           │                           │
           │  createdBy                │ unitId
           ▼                           ▼
┌──────────────────────────────────────────────────┐
│                    Archive                        │
│  id, number, date, subject, recipient             │
│  externalSender?, direction (IN/OUT)              │
│  status (DRAFT→PENDING→PENDING_PROOF→ISSUED)      │
│  unitId, unitCode, letterTypeId, letterTypeCode   │
│  sequenceNumber, fileUrl?, gdriveFileId?          │
│  blobPathname?, fileName?, fileDataUrl?           │
│  createdById, deletedAt?, isInsert, insertReason? │
│  voidReason?, voidedAt?, voidedById?              │
│  overdueMarkedAt?                                 │
└───────┬──────────────────────────────┬────────────┘
        │                              │
        ▼                              ▼
┌────────────────┐            ┌──────────────────┐
│  Disposition   │            │    AuditLog      │
│  archiveId     │            │  action, actorId │
│  fromUserId    │            │  targetType/Id   │
│  toUserId?     │            │  metadata (JSON) │
│  toUnitId?     │            │  ip, userAgent   │
│  instructions  │            │  createdAt       │
│  dueDate?      │            └──────────────────┘
│  status        │
│  note?         │
└────────────────┘
```

### 4.2 Tabel Lengkap

| Model | Deskripsi | Soft Delete |
|---|---|---|
| **User** | Akun pengguna. Email unik, bcrypt password. Relasi ke Unit (opsional). | Ya (`deletedAt`) |
| **Unit** | Unit organisasi kampus (Rektorat, Yayasan, Fakultas, dll). Setiap unit punya `formatTemplate` untuk penomoran. | Ya (`deletedAt`) |
| **LetterType** | Jenis surat (SK, ST, UND, dll). Scope: GLOBAL atau UNIT_SPECIFIC. | Ya (`deletedAt`) |
| **LetterTypeUnit** | Tabel join: unit mana saja yang diizinkan pakai jenis surat UNIT_SPECIFIC. | Tidak |
| **LetterTypeRequest** | Pengajuan jenis surat baru dari Admin Unit → menunggu approval Super Admin. | Tidak |
| **NumberingSequence** | Counter nomor surat per `(unitId, letterTypeId, year)`. Atomic upsert + increment. | Tidak |
| **Archive** | Arsip surat (masuk/keluar). Menyimpan nomor, metadata, file bukti, dan status lifecycle. | Ya (`deletedAt`) |
| **Disposition** | Disposisi surat masuk ke user/unit lain. Status: PENDING→ACKNOWLEDGED→COMPLETED/REJECTED. | Tidak |
| **AuditLog** | Log audit immutable. Mencatat CREATE/UPDATE/DELETE/LOGIN dll dengan IP, user-agent, metadata. | Tidak (immutable) |
| **WebhookDelivery** | Log pengiriman webhook outbound. Status, attempt count, response status. | Tidak |
| **Ticket** | Tiket help desk / laporan masalah. Screenshot opsional. Status: NEW→IN_PROGRESS→RESOLVED/CLOSED. | Tidak |

### 4.3 Status Lifecycle Arsip

```
USER membuat     Admin membuat         Admin membuat
  (tanpa file)    (tanpa file)          (dengan file)
      │                │                     │
      ▼                ▼                     ▼
   PENDING ──────> PENDING_PROOF ──────> ISSUED
   (menunggu       (menunggu bukti)      (selesai)
    approval)            │
                         │── 14 hari ──> OVERDUE
                         │               (masih bisa upload → ISSUED)
                         │
                         └── admin void ──> VOID
                                           (nomor tidak dilepas)
```

### 4.4 Status Lifecycle Disposisi

```
PENDING ──> ACKNOWLEDGED ──> COMPLETED
   │                            
   └──> REJECTED (penerima menolak)
```

---

## 5. Peringatan Pra-Peluncuran

> **Catatan pembaruan (22 Agustus 2026):** Bagian ini awalnya ditulis 23 Mei
> 2026 sebagai snapshot temuan sebelum audit pra-peluncuran. Sejak itu commit
> `728d705` ("fix: pre-launch audit — 17 perbaikan keamanan, fungsionalitas,
> dan UX", PR #33) dan beberapa commit susulan sudah menutup mayoritas
> temuan kritis di bawah. Tabel di bawah kini menyertakan kolom **Status**
> yang mencerminkan kondisi kode saat ini, bukan lagi kondisi Mei 2026.
> Kolom Rekomendasi dipertahankan sebagai jejak historis dari apa yang
> diminta, bukan lagi daftar tugas terbuka untuk butir yang sudah ✅.

Berdasarkan analisis kode, berikut temuan yang perlu diperhatikan sebelum peluncuran produksi:

### 5.1 Keamanan — KRITIS

| # | Status | Temuan | Risiko | Rekomendasi / Kondisi Saat Ini |
|---|---|---|---|---|
| **S1** | ✅ Selesai | **Tidak ada rate limiting** pada endpoint login (`/api/auth/login`), register (`/api/auth/register`), dan seluruh API. | Brute-force attack pada password. | Diimplementasikan di `src/lib/rate-limit.ts` (in-memory sliding window) dan dipakai di `/api/auth/login` (10/15 menit), `/api/auth/register` (5/jam), `/api/auth/forgot-password` & `/api/auth/reset-password` (5/15 menit). Lihat `__tests__/rate-limit.test.ts`. |
| **S2** | ✅ Selesai | **Tidak ada CSRF protection.** Cookie session bersifat `httpOnly` + `sameSite=lax`, tapi tidak ada CSRF token pada form/API. | Risiko CSRF rendah (sameSite=lax sudah cukup untuk GET, tapi POST dari cross-origin masih mungkin dalam beberapa skenario browser). | `src/middleware.ts` kini memverifikasi header `Origin`/`Host` untuk setiap request `/api/*` selain GET/HEAD/OPTIONS dan menolak dengan 403 jika tidak cocok. |
| **S3** | ✅ Selesai | **Registrasi terbuka** — siapa pun dengan email `@unigamalang.ac.id` dapat mendaftar sendiri dan langsung mendapat role `USER`. | Staf yang tidak berwenang bisa mendaftar dan melihat arsip unit mereka. | Flag `REGISTRATION_DISABLED=true` (lihat `.env.example`) menonaktifkan self-registration; `/api/auth/register` menolak dengan 403 saat flag aktif, sehingga hanya Super Admin yang bisa membuat akun via `/api/users`. |
| **S4** | ✅ Selesai | **Default `AUTH_SECRET`** di kode: `"unigamalang-dev-secret-change-me-in-production-0123456789"`. | Jika lupa diubah di production, JWT bisa dipalsukan. | `src/lib/auth.ts` memvalidasi saat runtime (`validateSecret()`) dan **throw fatal error** jika `NODE_ENV=production` dan `AUTH_SECRET` kosong/masih default. Lihat `__tests__/auth-secret.test.ts`. |
| **S5** | ✅ Selesai (sudah baik sejak awal) | **Cron endpoint** `/api/cron/mark-overdue` diamankan dengan `CRON_SECRET`, tapi jika env tidak diset, token check gagal tertutup (401). | Baik — gagal tertutup. | Tidak berubah — perilaku ini sudah benar (fail-closed). Pastikan `CRON_SECRET` diset di Vercel production env agar cron berjalan; endpoint `/api/cron/cleanup-audit` yang baru memakai pola sama. |

### 5.2 Fitur & Fungsionalitas — PERHATIAN

| # | Status | Temuan | Dampak | Rekomendasi / Kondisi Saat Ini |
|---|---|---|---|---|
| **F1** | ✅ Selesai | **Tidak ada pagination pada API archives** — `take: 500` (list) dan `take: 5000` (export). | Seiring data bertambah, response akan membesar. Untuk universitas aktif, arsip bisa mencapai ribuan per tahun. | `/api/archives` kini menggunakan `page`/`pageSize` (lihat `take: pageSize` di `src/app/api/archives/route.ts`) dengan metadata `totalPages`. |
| **F2** | ✅ Selesai | **Tidak ada pagination pada dispositions** (`take: 200`) dan letter-type-requests (`take: 200`). | Potensi masalah performa di masa depan. | Kedua endpoint (`/api/dispositions`, `/api/letter-type-requests`) sudah memakai `page`/`pageSize` yang sama. |
| **F3** | ✅ Selesai | **Tidak ada unit test / integration test** — tidak ditemukan framework testing (jest/vitest/playwright) di project. | Tidak ada jaring pengaman untuk regresi saat ada perubahan kode. | Vitest terpasang (`npm test`) dengan suite di `__tests__/`: `auth-secret`, `password-policy`, `rate-limit`, dan `file-signature` (baru). Masih terbatas pada unit test lib murni — integration test untuk alur penomoran/disposisi end-to-end belum ada, jadi ini **sebagian** selesai. |
| **F4** | ✅ Selesai | **Password minimal 8 karakter** tanpa aturan kompleksitas (uppercase, angka, simbol). | Password lemah bisa digunakan. | `src/lib/password-policy.ts` (`PASSWORD_REGEX`) mewajibkan huruf besar + huruf kecil + angka, dipakai di register, user creation, dan ganti password. |
| **F5** | ✅ Selesai | **Self-registration langsung dapat role USER** tanpa approval. | Lihat S3 di atas. | Ditangani via `REGISTRATION_DISABLED` (S3) — bukan approval flow terpisah, tapi mencapai tujuan yang sama untuk kampus yang mengaktifkannya. |
| **F6** | ⚠️ Belum berubah | **SSO auto-creates user** dari identity SSO tanpa validasi unit. | User SSO baru tidak ter-assign ke unit manapun, sehingga tidak bisa melihat arsip apapun (gagal tertutup — baik). | Masih berlaku apa adanya. Pertimbangkan flow untuk assign unit setelah auto-create, atau mapping SSO role → unit. |
| **F7** | ⚠️ Belum berubah | **Tidak ada notifikasi real-time** (polling / WebSocket) — sidebar badges hanya refresh pada navigasi halaman. | Badge notifikasi (pending archives, disposisi, tiket) bisa stale selama user tetap di satu halaman. | Pertimbangkan polling interval atau Server-Sent Events untuk badge counter. |

### 5.3 Data & Operasional — PERINGATAN

| # | Status | Temuan | Dampak | Rekomendasi / Kondisi Saat Ini |
|---|---|---|---|---|
| **D1** | ✅ Selesai | **Tidak ada backup strategy** yang terlihat di kode/konfigurasi. | Risiko kehilangan data jika terjadi masalah di Neon Postgres. | Didokumentasikan di `docs/BACKUP-STRATEGY.md`: Neon PITR bawaan + skrip `pg_dump` mingguan opsional. |
| **D2** | ✅ Selesai | **Audit log tanpa retention policy** — tabel `AuditLog` bersifat immutable dan akan terus membesar. | Potensi masalah storage dan performa query. | Cron `/api/cron/cleanup-audit` (mingguan, Minggu 03:00 UTC — lihat `vercel.json`) menghapus audit log > 2 tahun dan webhook delivery > 90 hari. |
| **D3** | ✅ Selesai | **Webhook delivery tanpa retry mechanism** — jika POST gagal, status dicatat `FAILED` tapi tidak ada retry. | Event bisa hilang jika n8n sedang down saat webhook dikirim. | `src/lib/webhook.ts` melakukan retry dengan exponential backoff hingga `MAX_RETRIES` kali sebelum menandai `FAILED`. |
| **D4** | ⚠️ Sebagian | **File storage tanpa virus scanning** — file upload langsung disimpan ke Drive/Blob tanpa pemeriksaan malware. | Risiko file berbahaya diunggah dan diakses oleh pengguna lain. | **Baru ditambahkan:** `src/lib/file-signature.ts` memverifikasi magic-byte konten terhadap MIME yang dideklarasikan pada jalur inline base64 (satu-satunya jalur di mana server benar-benar memegang bytes-nya — upload Drive/Blob langsung dari browser ke storage). Ini menutup celah "file disamarkan sebagai gambar", **tapi bukan pemindaian malware sungguhan**. Integrasi ClamAV/VirusTotal sungguhan (lihat `docs/FILE-UPLOAD-SECURITY.md`) tetap jadi follow-up — perlu layanan eksternal karena Vercel serverless tidak bisa menjalankan ClamAV daemon persisten. |
| **D5** | ⚠️ Belum berubah (disengaja) | **`fileDataUrl` inline base64** masih ada sebagai fallback — menyimpan file besar di database langsung. | Inflates ukuran database, memperlambat query. | Masih dipertahankan sebagai fallback terakhir saat Drive & Blob tidak dikonfigurasi. Fase keluar inline base64 tetap direkomendasikan sebagai pekerjaan terpisah. |

### 5.4 UX & Frontend — MINOR

| # | Status | Temuan | Dampak | Rekomendasi / Kondisi Saat Ini |
|---|---|---|---|---|
| **U1** | ✅ Selesai | **Konfirmasi hapus** hanya via `window.confirm()` (browser native dialog). | UX kurang halus, tidak konsisten dengan UI shadcn/ui lainnya. | Tidak ada lagi pemakaian `window.confirm()` di `src/app` — sudah diganti dialog kustom (shadcn `AlertDialog`) di seluruh alur hapus/void. |
| **U2** | ⚠️ Belum berubah | **Tidak ada loading skeleton** pada tabel data — hanya spinner generik. | Flash of empty content saat data dimuat. | Pertimbangkan skeleton loader pada tabel arsip, disposisi, dll. |
| **U3** | ✅ Selesai | **Tidak ada fitur "Lupa Password"** — pengguna harus menghubungi Super Admin untuk reset. | Beban manual pada Super Admin. | Self-service password reset via email diimplementasikan: `/forgot-password`, `/reset-password`, dan endpoint `/api/auth/forgot-password` + `/api/auth/reset-password`. |

### 5.5 Konfigurasi Production Checklist

Sebelum go-live, pastikan env variables berikut diset:

| Variable | Status | Catatan |
|---|---|---|
| `AUTH_SECRET` | **WAJIB** | Random string ≥32 chars. Jangan gunakan default! |
| `DATABASE_URL` | **WAJIB** | Pooled Neon URL |
| `DIRECT_URL` | **WAJIB** | Direct Neon URL (untuk migrate) |
| `CRON_SECRET` | **WAJIB** | Untuk otentikasi cron mark-overdue |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Direkomendasikan | Untuk Google Drive storage (primer) |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | Direkomendasikan | Folder tujuan upload di Drive |
| `BLOB_READ_WRITE_TOKEN` | Opsional | Fallback storage via Vercel Blob |
| `RESEND_API_KEY` | Direkomendasikan | Untuk email notifikasi |
| `RESEND_FROM_EMAIL` | Direkomendasikan | Alamat pengirim (verifikasi domain dulu) |
| `N8N_WEBHOOK_URL` | Opsional | Webhook target untuk n8n/WhatsApp |
| `WEBHOOK_SIGNING_SECRET` | Opsional | HMAC key untuk webhook |
| `NEXT_PUBLIC_APP_URL` | Direkomendasikan | Base URL untuk link di email |
| `SSO_BASE_URL` | Opsional | URL UNIGA SSO Gateway |
| `SSO_CLIENT_ID` | Opsional | Client ID SSO |
| `SSO_CLIENT_SECRET` | Opsional | Client Secret SSO |
| `SSO_REDIRECT_URI` | Opsional | Callback URL SSO |

---

## 6. Peta API Endpoint

| Method | Path | Akses | Deskripsi |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login email + password |
| POST | `/api/auth/register` | Public | Registrasi (domain guard) |
| GET | `/api/auth/me` | Auth | Info session |
| POST | `/api/auth/logout` | Auth | Logout (clear cookie) |
| GET | `/auth/callback` | Public | SSO callback |
| GET | `/api/archives` | Auth | List arsip (scoped per unit/role) |
| POST | `/api/archives` | Auth | Buat arsip baru (allocate nomor) |
| GET | `/api/archives/[id]` | Auth | Detail arsip |
| DELETE | `/api/archives/[id]` | Auth | Soft-delete arsip |
| GET | `/api/archives/[id]/proof` | Auth | Lihat bukti |
| POST | `/api/archives/[id]/proof` | Auth | Upload bukti |
| POST | `/api/archives/[id]/void` | Admin+ | Batalkan arsip |
| GET | `/api/archives/[id]/dispositions` | Auth | List disposisi arsip |
| POST | `/api/archives/[id]/dispositions` | Admin+ | Buat disposisi |
| GET | `/api/archives/export` | Auth | Export arsip (CSV/XLSX) |
| GET | `/api/dispositions` | Auth | List disposisi (inbox/outbox) |
| PATCH | `/api/dispositions/[id]` | Auth | Update status disposisi |
| POST | `/api/gdrive/init` | Auth | Init Google Drive upload |
| POST | `/api/gdrive/finalise` | Auth | Finalisasi Drive upload |
| POST | `/api/blob/upload` | Auth | Upload ke Vercel Blob |
| GET | `/api/units` | Public | List unit |
| POST | `/api/units` | Super Admin | Tambah unit |
| PATCH | `/api/units/[id]` | Super Admin | Edit unit |
| DELETE | `/api/units/[id]` | Super Admin | Nonaktifkan unit |
| GET | `/api/letter-types` | Auth | List jenis surat (scoped) |
| POST | `/api/letter-types` | Super Admin | Tambah jenis surat |
| PATCH | `/api/letter-types/[id]` | Super Admin | Edit jenis surat |
| DELETE | `/api/letter-types/[id]` | Super Admin | Nonaktifkan jenis surat |
| GET | `/api/letter-type-requests` | Admin+ | List pengajuan jenis surat |
| POST | `/api/letter-type-requests` | Admin Unit | Ajukan jenis surat baru |
| PATCH | `/api/letter-type-requests/[id]` | Super Admin | Approve/reject pengajuan |
| GET | `/api/users` | Auth | List pengguna (scoped) |
| POST | `/api/users` | Super Admin | Tambah pengguna |
| PATCH | `/api/users/[id]` | Super Admin | Edit/reactivate pengguna |
| DELETE | `/api/users/[id]` | Super Admin | Nonaktifkan pengguna |
| PATCH | `/api/users/me/password` | Auth | Ganti password sendiri |
| POST | `/api/numbering/preview` | Auth | Preview nomor berikutnya |
| GET | `/api/numbering/sequence` | Auth | Lihat counter sequence |
| GET | `/api/tickets` | Auth | List tiket (scoped) |
| POST | `/api/tickets` | Auth | Buat tiket help desk |
| PATCH | `/api/tickets/[id]` | Super Admin | Update status tiket |
| GET | `/api/cron/mark-overdue` | Cron (Bearer) | Tandai arsip overdue |
| POST | `/api/webhooks/test` | Super Admin | Test webhook n8n |
| GET | `/api/reports/letters/export` | Auth | Export laporan surat |
| GET | `/api/reports/dispositions/export` | Auth | Export laporan disposisi |
| GET | `/api/reports/tickets/export` | Super Admin | Export laporan tiket |
| GET | `/api/reports/user-activity/export` | Super Admin | Export laporan aktivitas |

---

## 7. Akun Demo (Seed)

> **Update keamanan (27 Agustus 2026, audit B1):** `prisma/seed.ts` tidak lagi
> memakai password literal tetap. Password demo kini dibuat **acak setiap
> seed dijalankan** dan hanya ditampilkan sekali di output terminal — tidak
> pernah disimpan di repo. Tabel di bawah sengaja tidak lagi mencantumkan
> password. Untuk password tetap (mis. kebutuhan CI), set env
> `SEED_DEMO_PASSWORD` sebelum `npm run db:seed`.

| Peran | Email |
|---|---|
| Super Admin | `superadmin@unigamalang.ac.id` |
| Admin Unit (Rektorat) | `admin.rektorat@unigamalang.ac.id` |
| Admin Unit (Yayasan) | `admin.yayasan@unigamalang.ac.id` |
| User (Staf) | `staff@unigamalang.ac.id` |

Unit seed: UNIGA (Rektorat), YAS (Yayasan), FE (Fakultas Ekonomi), FH (Fakultas Hukum).
Jenis surat seed: SK, ST, SP, UND, EDAR, UMUM (semua GLOBAL).

---

*Dokumen ini adalah snapshot dari kode per 23 Mei 2026. Perbarui setelah ada perubahan signifikan pada fitur atau arsitektur.*
