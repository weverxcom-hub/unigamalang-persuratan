# Aturan Penomoran 2027 — panduan operasi

Rancangan: `docs/superpowers/specs/2026-11-13-aturan-penomoran-2027-design.md`.

## Ringkasan

Format baru dipasang dari halaman **Aturan Penomoran** (menu Super admin, `/dashboard/numbering-rule`). Selama tombol **Terapkan aturan baru** belum ditekan, aplikasi berjalan persis seperti sebelumnya.

Bentuk nomor bawaan: `[SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]`, contoh `12/UNIGA.WR1/ST/2027`.

Saat diterapkan, dalam satu transaksi:

- 40 unit pada daftar baru dibuat atau disesuaikan. Unit yang sudah ada dikenali dari kodenya (`UNIGA`), dari kode tanpa awalan (`FEB` menjadi `UNIGA.FEB`), atau dari `FE` (menjadi `UNIGA.FEB`). Unit nonaktif yang cocok diaktifkan kembali.
- 20 jenis surat dibuat atau disesuaikan. `UND` menjadi `SU`, `EDAR` menjadi `SE`, `UMUM` menjadi `SD`.
- Template semua unit pada daftar diganti dengan template yang tertulis di halaman.
- Unit dan jenis surat yang tidak ada di daftar (misalnya Yayasan) tidak diubah. Halaman menampilkannya di bagian **Tidak disentuh**.

Yang tidak berubah: nomor yang sudah terbit, penghitung nomor (tetap per unit, per jenis surat, per tahun), akun, dan arsip.

Halaman selalu menampilkan pratinjau lebih dulu: kode mana yang dibuat, mana yang diubah dan dari kode apa, mana yang tetap. Periksa daftar itu sebelum menerapkan, terutama baris "Diubah dari …".

## Menyiapkan situs demo untuk presentasi

Situs demo memakai salinan database, sehingga produksi tidak tersentuh.

1. Di Neon, buat cabang (branch) dari database produksi. Catat `DATABASE_URL` (pooled) dan `DIRECT_URL` cabang itu.
2. Di Vercel, buat proyek baru dari repositori yang sama dengan cabang git yang memuat fitur ini. Isi variabel lingkungan seperti produksi, kecuali `DATABASE_URL` dan `DIRECT_URL` yang memakai nilai cabang Neon. Proses build menjalankan migrasi ke cabang itu, bukan ke produksi.
3. Pasang subdomain sementara ke proyek demo.
4. Masuk sebagai Super admin di situs demo, buka **Aturan Penomoran**, periksa pratinjau, lalu terapkan.
5. Buat satu nomor surat sebagai uji: form **Buat Nomor Surat** harus menampilkan pratinjau tanpa nol di depan dan nomor terbit dalam format baru.

Catatan: login Google/SSO dan pengiriman email terikat ke domain. Di situs demo, masuk dengan email dan kata sandi.

### Alternatif: database demo kosong berisi data contoh

Bila tidak ingin menyalin data produksi (data asli ikut tampil di layar presentasi), pakai database baru yang kosong. Build mengisinya sendiri:

1. Buat proyek Vercel terpisah untuk demo dari repositori yang sama.
2. Di proyek demo, buat database lewat Storage → Neon dan hubungkan ke proyek. Integrasi itu mengisi `DATABASE_URL` dan `DATABASE_URL_UNPOOLED`; build memakai `DATABASE_URL_UNPOOLED` sebagai `DIRECT_URL` bila `DIRECT_URL` tidak diisi.
3. Tambahkan variabel lingkungan di proyek demo:
   - `DEMO_SEED_CONFIRM` = `demo` (hanya di proyek demo, jangan di produksi)
   - `AUTH_SECRET` = string acak minimal 32 karakter, misalnya hasil `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `TZ` = `Asia/Jakarta`, `REGISTRATION_DISABLED` = `true`
4. Deploy. Karena `DEMO_SEED_CONFIRM=demo`, perintah build di `vercel.json` menjalankan `npm run db:seed-demo` setelah migrasi:
   - membuat 7 unit lama, 6 jenis surat lama, akun super admin dan admin contoh,
   - mengimpor 325 SK lama untuk pencarian publik,
   - menerbitkan 4 surat format sekarang (`001/ST/UNIGA/XI/2026`),
   - menerapkan aturan baru seperti tombol Terapkan,
   - membuat akun admin WR1, WR2, BAU, FEB, Prodi Manajemen, dan staf FEB,
   - menerbitkan 10 surat format baru (`1/UNIGA.WR1/ST/2026`, `1/UNIGA.WR2/ST/2026`, ...).
5. Buka log build pertama dan cari baris "Demo password (generated, only shown once". Itu kata sandi `superadmin@unigamalang.ac.id`, dan semua akun demo memakai kata sandi yang sama. Simpan; build berikutnya tidak menampilkannya lagi dengan benar.

`db:seed-demo` menolak jalan bila database berisi lebih dari 50 surat yang bukan surat contoh, sehingga tidak bisa tidak sengaja mengisi data produksi. Menjalankannya ulang tidak menambah apa pun. Bisa juga dijalankan dari komputer: `DEMO_SEED_CONFIRM=demo npm run db:seed-demo` dengan `DATABASE_URL`/`DIRECT_URL` mengarah ke database demo.

Tahun pada nomor mengikuti tanggal hari ini, jadi demo bulan Desember menampilkan `/2026`. Mulai 1 Januari nomor kembali ke 1 dengan `/2027`.

Setelah menekan Terapkan, daftar unit dan jenis surat di beberapa halaman bisa tertinggal sampai dua menit karena tersimpan di cache peramban. Muat ulang halaman bila unit baru belum muncul.

## Go-live (bila format disetujui)

1 Januari 2027 jatuh pada hari Jumat; hari kerja pertama Senin 4 Januari. Lakukan antara 1 dan 3 Januari, sebelum ada nomor 2027 yang terbit.

1. Pastikan versi aplikasi yang memuat fitur ini sudah terpasang di produksi. Pemasangannya hanya menambah tabel `NumberingPolicy` dan tidak mengubah perilaku.
2. Buat cabang Neon dari produksi sebagai cadangan.
3. Buka **Aturan Penomoran**, periksa pratinjau, terapkan.
4. Periksa bagian **Tidak disentuh**. Unit lama yang sudah tidak dipakai bisa dinonaktifkan dari halaman Unit; yang masih dipakai dengan format lama (misalnya Yayasan) dibiarkan.
5. Pindahkan akun ke unit barunya dari halaman Akun Pengguna. Yang pasti perlu dipindah: akun Wakil Rektor I dan II, yang sekarang berada di unit `UNIGA`, ke `UNIGA.WR1` dan `UNIGA.WR2`. Tanpa langkah ini surat mereka tetap terbit dengan kode `UNIGA`. Begitu juga akun yang unit lamanya masuk daftar **Tidak disentuh**.
6. Buat satu nomor uji, lalu batalkan nomor itu dengan alasan "uji go-live".

Bila penerapan dilakukan sebelum pergantian tahun, nomor Desember 2026 ikut memakai kode dan template baru. Karena itu lakukan setelah 31 Desember.

Tidak ada tombol pembatalan. Bila hasilnya keliru, pulihkan dari cabang cadangan pada langkah 2.

## Bila format baru ditolak

- Tidak melakukan apa-apa: aplikasi tetap dengan penomoran sekarang.
- Atau menerapkan dengan template lama, `[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]`. Bentuk nomor tetap seperti sekarang, tetapi kode unitnya jelas: `012/ST/UNIGA.WR1/I/2027`. Ketik template itu di halaman sebelum menerapkan.

## Yang belum termasuk

- Nomor sisipan otomatis (`57.1`). Sisipan masih memakai cara sekarang: nomor diisi admin, alasan wajib.
- Mengambil beberapa nomor sekaligus untuk SK serangkaian.
- Kode klasifikasi dan surat rahasia (R/SR).
- Bentuk "Nomor X Tahun Y" untuk Peraturan Rektor dan Surat Edaran. Keduanya bernomor seperti jenis lain, misalnya `2/UNIGA/SE/2027`.
- Pembatasan jenis surat per jenjang unit (misalnya SK hanya untuk Rektor dan Dekan). Semua jenis baru tersedia untuk semua unit.
