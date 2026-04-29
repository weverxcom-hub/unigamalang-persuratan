# Sistem Manajemen Persuratan — Universitas Gajayana (`unigamalang`)

Prototipe platform digital untuk **penomoran otomatis**, **pengarsipan terpusat**, dan **pelacakan
surat** seluruh unit di Universitas Gajayana (`unigamalang`). Dibangun dengan **Next.js 14 App
Router**, **Tailwind CSS**, dan komponen gaya **shadcn/ui**.

> **Branding note:** Sistem ini menggunakan nama `unigamalang` secara konsisten di seluruh UI,
> variabel, dan dokumentasi. Tidak pernah menggunakan varian lain.

## Fitur Utama

### 1. Penomoran Surat Dinamis & Otomatis
Menggantikan buku penomoran fisik dengan format dinamis per unit:

```
[No. Urut] / [Kode Unit] / [Jenis Surat] / [Bulan Romawi] / [Tahun]
```

Contoh:
- `001/UNIGA/SK/IV/2026` (Rektorat)
- `001/YAS/ST/IV/2026` (Yayasan)

Logika:
- **No. Urut** auto-increment dan **reset ke 001 setiap 1 Januari**.
- **Kode Unit** dikonfigurasi oleh Super Admin (UNIGA, YAS, FE, FH, …).
- **Jenis Surat** dipilih saat generate (SK, ST, UND, …).
- **Bulan Romawi** (I–XII) dan **Tahun** (4 digit) otomatis.
- Tiap kombinasi `(unit, jenis, tahun)` memiliki penghitung independen.

### 2. Pengarsipan Surat
- Data table terpusat dengan pencarian (nomor/perihal/tujuan) dan filter (unit, jenis, tahun).
- Field: Tanggal, Nomor Surat, Perihal, Tujuan/Pengirim, Unit Penerbit, Lampiran (mock upload),
  Arah (Masuk/Keluar), Status.
- Dukungan arsip manual (historis/surat masuk) dengan nomor manual opsional.

### 3. Alur Bukti Surat (PENDING_PROOF → ISSUED)
Setiap nomor yang dialokasikan **tidak langsung** berstatus `ISSUED`. Arsip dibuat dengan
status `PENDING_PROOF` dan wajib disertai foto/scan/PDF surat yang sudah ditandatangani
agar dapat ditransisikan ke `ISSUED`. Hal ini memastikan setiap nomor benar-benar
digunakan dan dapat ditelusuri isi fisiknya.

### 4. Kontrol Akses Berperan
| Peran | Kewenangan |
|---|---|
| `SUPER_ADMIN` | Mengelola semua unit, kode unit, jenis surat, & arsip seluruh kampus. |
| `ADMIN_UNIT` | Generate nomor & arsip untuk unitnya sendiri. |
| `USER` | Ajukan draf ke Admin Unit (status `PENDING`). |

### 5. Autentikasi Terbatas Domain
Registrasi & login **hanya** untuk email `@unigamalang.ac.id`. Session berbasis JWT
(HTTP-only cookie) dengan middleware yang melindungi seluruh rute `/dashboard`.

## Tech Stack
- **Framework:** Next.js 14 (App Router, Server Actions / Route Handlers)
- **Styling:** Tailwind CSS + komponen gaya shadcn/ui (radix-ui primitives)
- **Auth:** `jose` (JWT) + `bcryptjs`
- **Validation:** `zod`
- **Data layer:** JSON mock store (seeded in-memory; file-backed saat dev).

## Akun Demo (auto-seed)

> ⚠️ Password demo **tidak ditampilkan di halaman login** agar tidak terlihat oleh publik.
> Kredensial hanya tersedia di README GitHub ini untuk keperluan pengujian internal.

| Peran | Email | Password |
|---|---|---|
| Super Admin | `superadmin@unigamalang.ac.id` | `Password123!` |
| Admin Unit (Rektorat) | `admin.rektorat@unigamalang.ac.id` | `Password123!` |
| Admin Unit (Yayasan) | `admin.yayasan@unigamalang.ac.id` | `Password123!` |
| User | `staff@unigamalang.ac.id` | `Password123!` |

## Panduan Pengguna (Bahasa Indonesia)

Lihat [docs/panduan-pengguna.md](docs/panduan-pengguna.md) atau halaman **Panduan** di dalam
aplikasi (setelah login: `/dashboard/panduan`).

## Menjalankan Secara Lokal

```bash
npm install
cp .env.example .env.local
npm run dev
# buka http://localhost:3000
```

## Deploy ke Vercel

Proyek ini siap dideploy ke Vercel:

1. Push repository ke GitHub.
2. Di Vercel → **Add New Project** → import repo.
3. Tambahkan env var:
   - `AUTH_SECRET` = string acak ≥ 32 karakter.
4. Vercel akan menjalankan `next build` otomatis (lihat `vercel.json`).

> **Catatan data layer:** JSON mock store bersifat _in-memory_ di serverless Vercel — data akan
> kembali ke seed setiap cold start / deploy. Untuk produksi, ganti `src/lib/db.ts` dengan
> adapter database sebenarnya (Postgres / Turso / Neon). Schema TypeScript sudah disiapkan
> agar penggantian tidak memerlukan perubahan UI.

## Struktur Direktori

```
src/
  app/
    api/                     # Route handlers (auth, archives, numbering, units, …)
    dashboard/               # Area terproteksi
      archives/              # Data table pengarsipan
      generate/              # Generator nomor surat
      units/                 # Manajemen unit (Super Admin)
      letter-types/          # Manajemen jenis surat (Super Admin)
    login/                   # Halaman login
    register/                # Halaman registrasi
    page.tsx                 # Landing page
  components/
    ui/                      # Primitif shadcn-style (Button, Input, Table, Dialog, …)
    brand/logo.tsx           # Placeholder logo Universitas Gajayana
    app/navbar.tsx           # Navbar dashboard
  lib/
    auth.ts                  # JWT session + password hashing + domain guard
    db.ts                    # Mock JSON store + seed data
    numbering.ts             # Alokasi nomor otomatis (yearly reset)
    types.ts                 # Tipe domain
    utils.ts                 # cn(), toRoman(), formatDate(), pad3()
  middleware.ts              # Redirect guard untuk /dashboard
```

## Skema Data (ringkas)

```ts
User           { id, email, name, passwordHash, role, unitId, createdAt }
Unit           { id, code, name, createdAt }
LetterType     { id, code, name, createdAt }
NumberingSequence { id: `${unitId}:${letterTypeId}:${year}`, unitId, letterTypeId, year, lastNumber }
Archive        { id, number, date, subject, recipient, unitId, unitCode,
                 letterTypeId, letterTypeCode, sequenceNumber, fileName,
                 direction, status, createdById, createdAt }
```

`NumberingSequence` dikunci per tahun, sehingga penggantian tahun kalender otomatis membuat
sequence baru yang dimulai dari `001`.
