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
`[NO]/[UNIT_CODE]/[TYPE_CODE]/[ROMAN_MONTH]/[YEAR]`). Token yang didukung:

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
npm run db:seed   # populate unit, jenis surat, 4 akun demo
```

### 3. Jalankan dev server
```bash
npm run dev
# buka http://localhost:3000
```

## Akun Demo (seed)

> ⚠️ Password demo **tidak ditampilkan di halaman login**. Kredensial hanya di
> README ini untuk pengujian internal.

| Peran | Email | Password |
|---|---|---|
| Super Admin | `superadmin@unigamalang.ac.id` | `Password123!` |
| Admin Unit (Rektorat) | `admin.rektorat@unigamalang.ac.id` | `Password123!` |
| Admin Unit (Yayasan) | `admin.yayasan@unigamalang.ac.id` | `Password123!` |
| User | `staff@unigamalang.ac.id` | `Password123!` |

## Deploy ke Vercel

1. Push repository ke GitHub.
2. Vercel → **Add New Project** → import repo.
3. Set environment variables (lihat `.env.example`):
   - **WAJIB:** `AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`.
   - **Opsional:** `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`,
     `RESEND_FROM_EMAIL`, `N8N_WEBHOOK_URL`, `WEBHOOK_SIGNING_SECRET`,
     `NEXT_PUBLIC_APP_URL`.
4. Build command otomatis: `prisma generate && next build`.
5. Setelah deploy, jalankan migrasi satu kali:
   `npx prisma migrate deploy` (dari lokal dengan `DATABASE_URL` production).

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
