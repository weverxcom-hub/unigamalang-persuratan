# Panduan Pengguna — Sistem Manajemen Persuratan Universitas Gajayana (unigamalang)

Dokumen ini menjelaskan cara menggunakan Sistem Manajemen Persuratan Universitas Gajayana.
Sistem ini menggantikan buku nomor fisik sehingga seluruh penomoran dan pengarsipan surat
berjalan otomatis, terpusat, dan dapat ditelusuri.

> **Akses:** Aplikasi hanya dapat digunakan oleh pemilik email `@unigamalang.ac.id`.

---

## Daftar Isi

1. [Masuk & Pendaftaran](#1-masuk--pendaftaran)
2. [Dashboard](#2-dashboard)
3. [Alur Membuat Nomor Surat](#3-alur-membuat-nomor-surat)
4. [Pengarsipan Surat](#4-pengarsipan-surat)
5. [Panduan per Peran](#5-panduan-per-peran)
6. [Tips Praktis](#6-tips-praktis)
7. [Tanya Jawab Singkat](#7-tanya-jawab-singkat)

---

## 1. Masuk & Pendaftaran

1. Buka aplikasi di browser (termasuk browser ponsel).
2. Klik **Daftar di sini** jika belum punya akun.
3. Isi data:
   - Nama lengkap
   - Email institusi (**harus** `@unigamalang.ac.id`)
   - Unit tempat Anda bernaung (mis. Rektorat, Yayasan, Fakultas Ekonomi)
   - Kata sandi minimal 8 karakter
4. Setelah terdaftar, Anda dapat masuk di halaman **Login**.

> **Penting:** Email selain `@unigamalang.ac.id` akan otomatis ditolak oleh sistem.

---

## 2. Dashboard

Setelah masuk, Anda akan melihat dashboard dengan:

- **Ringkasan statistik:** total arsip, jumlah nomor terbit bulan ini, unit aktif, pengguna.
- **Arsip terbaru:** 5 surat terbaru yang tercatat.
- **Distribusi jenis surat:** grafik jumlah per jenis (SK, ST, SP, dst.) untuk tahun berjalan.

Dari sini Anda bisa langsung menuju:

- **Buat Nomor Surat** → untuk penomoran otomatis
- **Lihat Arsip** → untuk membuka daftar lengkap arsip

---

## 3. Alur Membuat Nomor Surat

### Format Nomor

```
[No]/[Kode Unit]/[Jenis]/[Bulan Romawi]/[Tahun]
```

Contoh: `004/UNIGA/SK/IV/2026`

- **No** bertambah otomatis dan **direset menjadi 001** setiap 1 Januari.
- **Bulan Romawi** mengikuti bulan berjalan (I, II, …, XII).
- **Kode Unit** diatur oleh Super Admin di menu **Unit**.

### Langkah-Langkah

1. Buka menu **Nomor Surat**.
2. Pilih:
   - **Unit Penerbit** (Rektorat, Yayasan, Fakultas, dst.)
   - **Jenis Surat** (SK, ST, SP, Undangan, Edaran, …)
3. Sistem akan menampilkan pratinjau nomor, misal `004/UNIGA/SK/IV/2026`.
4. Isi **Perihal** dan **Tujuan** surat.
5. Klik **Alokasikan Nomor**.

### Mengapa Harus Unggah Bukti?

Agar setiap nomor yang diminta **benar-benar digunakan** dan dapat ditelusuri isi
fisiknya, setelah alokasi status arsip adalah **Menunggu Bukti (PENDING_PROOF)**,
bukan langsung Terbit.

Tugas Anda selanjutnya:

1. Cetak/tandatangani surat seperti biasa.
2. Kembali ke aplikasi (bisa dari ponsel).
3. Klik **Pilih / Ambil Foto** — Anda dapat memotret langsung dari kamera atau
   memilih file scan/PDF yang sudah ada. Maksimal ukuran file **3 MB**.
4. Klik **Unggah Bukti & Selesaikan**.
5. Status arsip otomatis berubah menjadi **Terbit (ISSUED)**.

Setelah itu, siapa pun yang berhak dapat membuka bukti melalui tombol **Lihat Bukti**
di menu Pengarsipan.

---

## 4. Pengarsipan Surat

Menu **Pengarsipan** menampilkan seluruh arsip yang dapat Anda akses.

### Fitur Tabel

- **Kolom:** Tanggal, Nomor, Perihal, Tujuan/Pengirim, Unit, Status, Bukti.
- **Filter:** Unit, Jenis Surat, Tahun.
- **Pencarian:** ketik di kotak cari untuk mencari nomor, perihal, atau tujuan.
- **Tombol pada kolom Bukti:**
  - **Unggah** — untuk arsip berstatus "Menunggu Bukti".
  - **Lihat** — untuk arsip yang sudah memiliki bukti foto/scan/PDF.

### Arsip Manual (Surat Masuk / Surat Lama)

Gunakan tombol **Arsipkan Surat (Lama / Masuk)** jika:

- Menerima surat dari pihak luar (Surat Masuk).
- Mencatat surat lama yang nomornya sudah ada di buku fisik.

Isi formulir: arah surat, unit, jenis, nomor (boleh manual), perihal, pengirim/tujuan,
tanggal, dan lampiran foto/scan. Jika lampiran diunggah, arsip langsung berstatus **Terbit**.

---

## 5. Panduan per Peran

### 5.1 Super Admin

Memiliki akses penuh. Cocok untuk bagian TU Pusat.

- Mengelola seluruh **Unit** (kode & nama) di menu Unit.
- Mengelola **Jenis Surat** di menu Jenis Surat.
- Melihat semua arsip lintas unit.
- Mengalokasikan nomor untuk unit mana pun.
- Menghapus arsip apa pun.
- Mengunggah bukti surat di arsip mana pun.

### 5.2 Admin Unit

Pengelola surat untuk satu unit (mis. Rektorat, Yayasan, Fakultas).

- Mengalokasikan nomor surat hanya untuk unit sendiri.
- **Wajib** mengunggah bukti agar status menjadi Terbit.
- Mencatat surat masuk dan arsip lama.
- Melihat arsip hanya untuk unit sendiri.

### 5.3 Pengguna (Staf)

Dosen/staf yang membutuhkan nomor surat.

- Mengajukan **draf** permintaan nomor surat (status **Menunggu Persetujuan**).
- Admin Unit akan memproses draf menjadi nomor resmi.
- Dapat mengunggah bukti untuk draf yang ia buat.
- Tidak dapat mengelola Unit atau Jenis Surat.

---

## 6. Tips Praktis

- Gunakan ponsel saat berada di lapangan: tombol **Ambil Foto** akan membuka kamera langsung.
- Kompres foto sebelum unggah bila lebih dari 3 MB (mis. aplikasi Photo Compressor).
- Ajari seluruh staf unit satu kali alur upload bukti agar kebiasaan lama (nomor tanpa arsip fisik) hilang.
- Gunakan **kata kunci spesifik** (nomor lengkap, nama penerima) saat mencari agar cepat.
- Super Admin sebaiknya menambahkan seluruh unit dan jenis surat yang berlaku di awal implementasi, agar staf tidak menunggu.

---

## 7. Tanya Jawab Singkat

**T: Apakah nomor bisa dibatalkan?**
Jawab: Nomor tidak dapat dikembalikan ke urutan semula karena akan memutus integritas
penomoran. Anda dapat **menghapus** arsip dari daftar — nomor tetap dianggap terpakai
untuk menjaga konsistensi histori.

**T: Apa yang terjadi bila saya lupa unggah bukti?**
Jawab: Arsip tetap tercatat dengan status **Menunggu Bukti** dan akan terlihat di daftar
sampai bukti diunggah. Anda bisa unggah kapan saja dari tabel Pengarsipan.

**T: Bolehkah mengunggah foto dari ponsel?**
Jawab: Tentu. Klik tombol **Pilih / Ambil Foto**, lalu pilih menu kamera yang muncul.

**T: Bagaimana jika salah pilih unit/jenis?**
Jawab: Hapus arsip (jika Anda yang membuat) dan buat nomor baru dengan unit/jenis yang benar.

**T: Berapa batas ukuran file bukti?**
Jawab: Maksimal **3 MB** per file. Format yang didukung: gambar (PNG, JPG, WEBP) dan PDF.

---

Bila ada pertanyaan lain atau masukan, hubungi Super Admin Universitas Gajayana.

&copy; unigamalang &middot; Made by [weverx.com](https://weverx.com)
