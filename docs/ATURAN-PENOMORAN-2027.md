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
