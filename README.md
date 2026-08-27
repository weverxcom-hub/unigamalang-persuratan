# Sistem Manajemen Persuratan — Universitas Gajayana (`unigamalang`)

Platform digital produksi untuk **penomoran otomatis**, **pengarsipan terpusat**,
**disposisi surat**, dan **pelacakan** seluruh unit di Universitas Gajayana
(`unigamalang`). Dibangun dengan **Next.js 14 (App Router)**, **Prisma + Neon
Postgres**, **Tailwind CSS** + **shadcn/ui**, **Vercel Blob**, **Resend**, dan
**webhook** (mis. n8n → WhatsApp).

> **Branding:** Sistem ini menggunakan `unigamalang` secara konsisten. Tidak
> pernah menggunakan varian lain.

## Fitur Utama

### 1. Penomoran Dinamis per Unit
Setiap unit memiliki `formatTemplate` sendiri (contoh
`[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]`). Token yang didukung:

| Token | Nilai |
|---|---|
| `[NO]` | Nomor urut 3 digit (001, 002, …) |
| `[UNIT_CODE]` | Kode unit (UNIGA, YAS, FE, …) |
| `[TYPE_CODE]` | Kode jenis surat (SK, ST, UND, …) |
| `[ROMAN_MONTH]` | Bulan Romawi (I–XII) |
| `[YEAR]` | Tahun 4 digit |

Penghitung nomor di-**kunci per `(unitId, year)`** sehingga semua jenis surat
dalam satu unit berbagi satu deret angka yang berurutan (tidak akan ada
nomor hilang). Alokasi dilakukan via `prisma.$transaction` + `upsert increment`
— aman dari race condition di serverless.

### 2. Surat Keluar, Surat Masuk, & Disposisi
- **Surat Keluar (OUTGOING):** nomor dialokasikan otomatis.
- **Surat Masuk (INCOMING):** nomor manual dari surat asli, pengirim diisi
  sebagai teks bebas (`externalSender`).
- **Disposisi:** Admin dapat meneruskan surat masuk ke pengguna/unit lain
  dengan catatan `instructions` dan `dueDate`. Penerima mendapat email
  notifikasi otomatis (Resend) dan event `disposition.created` dikirim via
  webhook.

### 3. Tanda Terima & Audit Trail
- **Tanda Terima (Auto-Receipt):** halaman cetak/PDF
  `/dashboard/archives/[id]/receipt` untuk surat masuk — berisi ID sistem,
  tanggal, pengirim, perihal, penerima, unit, dan petugas pencatat.
- **Audit Log:** tabel `AuditLog` mencatat setiap `CREATE/UPDATE/UPLOAD/
  DELETE/RESTORE/DISPOSITION_*/LOGIN` dengan `actorId`, `actorEmail`,
  `targetType`, `targetId`, `ip`, `userAgent`, `metadata`. Lihat di
  `/dashboard/audit` (SUPER_ADMIN).
- **Soft Delete:** field `deletedAt` pada Archive — data tidak pernah hilang
  dari Postgres; query default memfilter `deletedAt IS NULL`.

### 4. Notifikasi Email & Webhook
- **Email (Resend):** saat surat masuk baru dibuat atau disposisi diterbitkan,
  email otomatis dikirim ke admin unit penerima (atau pengguna target).
  Graceful fallback: bila `RESEND_API_KEY` kosong, event dicetak ke console
  server.
- **Webhook outbound (HMAC-SHA256):** setiap event penting (`archive.created`,
  `disposition.created`) di-POST ke `N8N_WEBHOOK_URL` dengan header
  `X-Signature` yang ditandatangani HMAC-SHA256 menggunakan
  `WEBHOOK_SIGNING_SECRET`. Semua percobaan disimpan di tabel
  `WebhookDelivery` (audit). Graceful fallback: bila `N8N_WEBHOOK_URL`
  kosong, delivery tetap dicatat tapi HTTP POST di-skip.

### 5. File Upload (Vercel Blob)
Bukti surat diunggah ke Vercel Blob via endpoint `/api/blob/upload`. URL blob
disimpan di kolom `fileUrl` + `blobPathname`. Graceful fallback: bila
`BLOB_READ_WRITE_TOKEN` kosong, upload jatuh ke inline base64 pada kolom
`fileDataUrl` (maks. 3MB).

### 6. Pencarian Lanjutan
Tabel arsip mendukung:
- Pencarian teks di `subject`, `recipient`, `externalSender`, `number` (case-insensitive).
- Filter `unitId`, `letterTypeId`, `direction`, `status`, `year`.
- Filter **rentang tanggal** `dateFrom`/`dateTo`.
- Flag `includeDeleted=true` untuk SUPER_ADMIN (melihat soft-deleted).

### 7. Kontrol Akses & Domain Guard
- `SUPER_ADMIN`, `ADMIN_UNIT`, `USER` — lihat `prisma/schema.prisma:Role`.
- Registrasi & login **hanya** untuk email `@unigamalang.ac.id`.

### 8. Help Desk / Laporan Masalah Pengguna
Tombol **Laporkan Masalah** ditampilkan di topbar setiap halaman dashboard
sehingga pengguna dapat menyampaikan kendala atau bug langsung dari konteksnya.
Form mendukung judul, deskripsi, halaman/fitur yang bermasalah (otomatis terisi
dengan path saat ini), dan lampiran screenshot opsional (PNG/JPG/WEBP, ≤5MB).
Tiket masuk ke antrian `SUPER_ADMIN` di **/dashboard/tickets** dengan filter
status (Baru / Sedang Ditangani / Selesai / Ditutup) dan ruang respons. Pelapor
dapat memantau status di **/dashboard/my-tickets**.

## Arsitektur

```
Next.js 14 (App Router)
│
├─ API Route Handlers
│  ├─ /api/archives           (GET list + POST create, filter lanjutan)
│  ├─ /api/archives/[id]      (GET, DELETE soft)
│  ├─ /api/archives/[id]/proof       (GET, POST upload Blob/base64)
│  ├─ /api/archives/[id]/dispositions (GET, POST disposisi)
│  ├─ /api/dispositions/[id]  (PATCH acknowledge/complete)
│  ├─ /api/blob/upload        (POST multipart → Vercel Blob)
│  ├─ /api/webhooks/test      (POST ping ke n8n, SUPER_ADMIN)
│  ├─ /api/auth/*             (login/register/me/logout)
│  └─ /api/units, /api/letter-types, /api/users, /api/numbering/preview
│
├─ Prisma 6 + Neon Postgres (pooled via pgbouncer)
│  ├─ User, Unit (formatTemplate), LetterType
│  ├─ NumberingSequence (PK: unitId+year, atomic upsert)
│  ├─ Archive (direction, status, softDelete via deletedAt)
│  ├─ Disposition (PENDING→ACKNOWLEDGED→COMPLETED)
│  ├─ AuditLog (immutable)
│  └─ WebhookDelivery (audit pengiriman outbound)
│
├─ Integrasi opsional (graceful fallback)
│  ├─ @vercel/blob   — file storage
│  ├─ resend         — email
│  └─ node:crypto HMAC — outbound webhook ke n8n
```

## Menjalankan Secara Lokal

### 1. Instal & env
```bash
npm install
cp .env.example .env.local
# Isi minimal DATABASE_URL + DIRECT_URL + AUTH_SECRET
```

### 2. Migrasi Database
```bash
npx prisma migrate dev --name init
npm run db:seed   # populate unit, jenis surat, 4 akun demo (LOKAL SAJA)
```

### 3. Jalankan dev server
```bash
npm run dev
# buka http://localhost:3000
```

## Akun Demo (seed)

> ⚠️ **JANGAN pernah jalankan `npm run db:seed` terhadap `DATABASE_URL`
> production** — script ini membuat akun SUPER_ADMIN. Script menolak
> berjalan bila `NODE_ENV=production` kecuali `SEED_CONFIRM=true` dipaksa
> secara eksplisit.
>
> Password demo dibuat **acak setiap kali seed dijalankan** dan hanya
> ditampilkan sekali di output terminal — tidak pernah disimpan di repo.
> Untuk memakai password tetap (mis. di CI), set env `SEED_DEMO_PASSWORD`
> sebelum menjalankan `npm run db:seed`.

| Peran | Email |
|---|---|
| Super Admin | `superadmin@unigamalang.ac.id` |
| Admin Unit (Rektorat) | `admin.rektorat@unigamalang.ac.id` |
| Admin Unit (Yayasan) | `admin.yayasan@unigamalang.ac.id` |
| User | `staff@unigamalang.ac.id` |

## Deploy ke Vercel

1. Push repository ke GitHub.
2. Vercel → **Add New Project** → import repo.
3. Set environment variables (lihat `.env.example` untuk daftar lengkap):
   - **WAJIB:** `AUTH_SECRET` (random ≥32 karakter — build gagal tanpa ini di
     production), `DATABASE_URL`, `DIRECT_URL`.
   - **SANGAT DISARANKAN untuk production:**
     - `REGISTRATION_DISABLED=true` — tanpa ini, siapa pun dengan email
       `@unigamalang.ac.id` bisa mendaftar sendiri lewat `/register`.
     - `CRON_SECRET` — tanpa ini, cron `mark-overdue` (tandai surat
       terlambat bukti >14 hari) dan `cleanup-audit` **tidak akan pernah
       berjalan** (endpoint menolak request tanpa secret yang valid, by
       design — fail closed).
     - `TZ=Asia/Jakarta` — server Vercel berjalan di UTC; tanpa ini nomor
       surat yang dibuat dini hari WIB (00:00–07:00) bisa salah bulan/tahun.
       Set di Vercel Project Settings → Environment Variables.
   - **Opsional (graceful fallback bila kosong):** `BLOB_READ_WRITE_TOKEN`,
     `GOOGLE_SERVICE_ACCOUNT_JSON` + `GOOGLE_DRIVE_PARENT_FOLDER_ID`,
     `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `N8N_WEBHOOK_URL`,
     `WEBHOOK_SIGNING_SECRET`, `NEXT_PUBLIC_APP_URL`.
   - **SSO (belum siap produksi — lihat catatan di bawah):** `SSO_BASE_URL`,
     `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET`, `SSO_REDIRECT_URI`. **Biarkan
     kosong** untuk peluncuran ini; tombol "Masuk dengan SSO" otomatis
     tersembunyi bila salah satu var ini tidak diisi.
4. Build command otomatis: `prisma migrate deploy && prisma generate && next build`.
5. Setelah deploy, jalankan migrasi satu kali (biasanya sudah tercakup oleh
   `prisma migrate deploy` di build command, tapi bila perlu manual):
   `npx prisma migrate deploy` (dari lokal dengan `DATABASE_URL` production).
6. **JANGAN** jalankan `npm run db:seed` terhadap database production.
   Buat akun SUPER_ADMIN pertama secara manual (lihat catatan di
   `.env.example`) atau lewat Prisma Studio.

### Setup integrasi opsional

- **Neon Postgres (gratis):** https://console.neon.tech — buat project,
  ambil **Pooled** URL untuk `DATABASE_URL` + **Direct** URL untuk
  `DIRECT_URL`.
- **Vercel Blob (gratis untuk hobby):** Dashboard Vercel → Storage → Create
  **Blob store** → copy `BLOB_READ_WRITE_TOKEN`.
- **Resend (gratis 3,000 email/bulan):** https://resend.com/api-keys.
  Untuk production, verifikasi domain `unigamalang.ac.id` lalu set
  `RESEND_FROM_EMAIL=noreply@unigamalang.ac.id`. Selama dev, gunakan
  `onboarding@resend.dev`.
- **Webhook n8n (self-host / cloud free):** buat workflow dengan trigger
  "Webhook", copy URL-nya ke `N8N_WEBHOOK_URL`. Generate random string
  untuk `WEBHOOK_SIGNING_SECRET`. Di sisi n8n, verifikasi header
  `X-Signature` dengan HMAC-SHA256 (`body` = raw JSON).
- **UNIGA SSO Gateway — belum siap produksi.** Kode integrasinya ada
  ([src/app/auth/callback/route.ts](src/app/auth/callback/route.ts),
  [src/lib/sso-client.ts](src/lib/sso-client.ts)) tapi belum melalui review
  keamanan penuh (validasi `state`/CSRF, penentuan role, whitelist domain
  email). **Untuk peluncuran ini, biarkan semua var `SSO_*` kosong** — login
  email + password tetap berfungsi normal. Aktifkan SSO hanya setelah item
  di atas direview.

## Membuat Akun SUPER_ADMIN Pertama (production)

`npm run db:seed` tidak boleh dijalankan terhadap database production (lihat
peringatan di atas). Untuk membuat akun pertama:

```bash
# Dari lokal, dengan DATABASE_URL/DIRECT_URL mengarah ke database production
npx prisma studio
```

Buka tabel `User`, buat baris baru dengan `role = SUPER_ADMIN`, `unitId =
null`, dan `passwordHash` diisi hasil bcrypt (bisa digenerate lokal dengan
`node -e "console.log(require('bcryptjs').hashSync('PASSWORD-ANDA', 10))"`).
Setelah punya satu akun SUPER_ADMIN, akun berikutnya bisa dibuat lewat UI
**Dashboard → Pengguna**.

### Contoh verifikasi HMAC di n8n (Function Node)
```js
const crypto = require('crypto');
const signed = crypto
  .createHmac('sha256', $env.WEBHOOK_SIGNING_SECRET)
  .update(JSON.stringify($json.body))
  .digest('hex');
if (signed !== $request.headers['x-signature']) {
  throw new Error('Invalid signature');
}
return $json;
```

## Panduan Pengguna (Bahasa Indonesia)

Lihat [docs/panduan-pengguna.md](docs/panduan-pengguna.md) atau halaman
**Panduan** di dalam aplikasi (`/dashboard/panduan`).

## Kredit

Made by [weverx.com](https://weverx.com) · 2026
