# Aturan Penomoran 2027 — rancangan (tahap 1: katalog dan penerapan)

Tanggal: 13 November 2026. Status: disusun atas arahan "pilih A, lanjutkan"; keputusan yang ditandai **(usul)** belum dikonfirmasi pemilik proyek.

## Maksud

Nomor surat sekarang tidak menunjukkan penerbitnya dengan jelas (surat Wakil Rektor I dan II tidak bisa dibedakan), sehingga rancu dan rawan disalahgunakan. Kampus sedang menimbang format baru; peluang disetujui kira-kira 50-50 dan keputusan baru keluar setelah wisuda. Presentasi final awal Desember 2026 harus memperlihatkan aplikasi yang sudah berjalan dengan format baru, dan bila disetujui semua unit memakainya mulai Januari 2027.

## Tujuan

1. Format baru bisa dinyalakan di aplikasi yang sama, tanpa menyalin kode menjadi sistem kedua.
2. Selama belum dinyalakan, perilaku aplikasi produksi tidak berubah sama sekali.
3. Penerapan dilakukan Super admin dari halaman aplikasi (bukan dari komputer pengembang), dengan pratinjau perubahan sebelum dijalankan.
4. Situs demo (salinan database) bisa menerapkannya kapan saja untuk presentasi.

## Bukan tujuan tahap ini

- Nomor sisipan otomatis (`57.1`), pengambilan beberapa nomor sekaligus, kode klasifikasi, surat rahasia R/SR, bentuk cetak "Nomor X Tahun Y" untuk Peraturan dan Surat Edaran, pembatasan jenis surat per jenjang unit. Semuanya tahap berikutnya.
- Mengubah nomor yang sudah terbit. Nomor lama tetap sah dan tidak dimigrasi.
- Tombol pembatalan penerapan. Pemulihan memakai cadangan database (cabang Neon dibuat sebelum penerapan).

## Yang tidak boleh terjadi

- Penerapan mengubah unit atau jenis surat yang tidak dikenali katalog (misalnya Yayasan/YAS).
- Dua jenis surat menghasilkan nomor yang sama karena template tidak memuat kode jenis.
- Pencarian SK publik atau impor SK lama rusak karena kode `EDAR` berganti menjadi `SE`.

## Bentuk nomor

Template bawaan: `[SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]`, contoh `12/UNIGA.WR1/ST/2027`.

- Unsur UNIGA dipertahankan (keputusan pemilik proyek): Rektor `UNIGA`, unit lain `UNIGA.<KODE>`, jenjang dipisah titik (`UNIGA.FEB.MN`). Daftar 40 kode mengikuti draf presentasi 12 Oktober 2026.
- Kode jenis mengikuti Revisi 1 (20 kode: SK, ST, SE, SU, SP, ND, SD, SPR, SKET, SPN, SKU, BA, PGM, PKS, MEMO, SOP, PER, NTL, LAP, TS).
- **(usul)** Urutan nomor tetap per unit, per jenis surat, per tahun, seperti aplikasi sekarang. Tidak ada perubahan penghitung.
- **(usul)** Template bisa diganti di halaman penerapan sebelum dijalankan. Dengan `[NO]/[TYPE_CODE]/[UNIT_CODE]/[ROMAN_MONTH]/[YEAR]` hasilnya `012/ST/UNIGA.WR1/I/2027`: bentuk lama dengan kode unit yang jelas. Ini jalur cadangan bila format baru ditolak.
- Template wajib memuat nomor urut, kode unit, kode jenis, dan tahun, karena penghitung berjalan per unit, jenis, dan tahun; tanpa salah satunya nomor bisa kembar.

## Pendekatan

| | Pendekatan | Untung | Rugi |
|---|---|---|---|
| A | Satu aplikasi; format baru diterapkan lewat satu tindakan Super admin | Tidak ada data terbelah; produksi tidak berubah sampai diterapkan; demo cukup salinan database | Penerapan dilakukan manual saat pergantian tahun |
| B | Tukar domain: sistem lama ke subdomain, sistem baru di domain utama | Sederhana dibangun | Peluang 50% harus ditukar balik; surat dan akun terbelah; login dan tautan email diatur ulang |
| C | Sistem baru yang mulai kosong | Tercepat untuk demo | Akun dan arsip lama hilang |

Dipilih: **A** (keputusan pemilik proyek).

Di dalam A, peralihan otomatis menurut tanggal ditimbang dan ditolak untuk tahap ini: kode unit dan kode jenis tersimpan satu per baris, sehingga peralihan terjadwal membutuhkan kolom kode ganda di unit dan jenis surat. 1 Januari 2027 jatuh pada hari Jumat dan hari kerja pertama Senin 4 Januari, jadi ada tiga hari tanpa penerbitan nomor untuk menekan satu tombol. **(usul)**

## Cara kerja

Aplikasi sudah menyimpan template per unit dan penghitung per unit, jenis, dan tahun. Format baru karenanya berupa data: 40 unit, 20 jenis surat, dan satu template. Yang dibangun:

1. **Katalog** berisi 40 unit dan 20 jenis surat beserta nama lama yang dikenali (alias): unit dikenali dari kode tanpa awalan (`FEB` menjadi `UNIGA.FEB`), jenis dari `UND` → `SU`, `EDAR` → `SE`, `UMUM` → `SD`.
2. **Perencana** membandingkan katalog dengan isi database dan menghasilkan daftar langkah: buat, ubah, atau tidak berubah, ditambah daftar baris yang tidak disentuh. Baris yang kodenya sudah sama persis didahulukan daripada alias. Baris nonaktif yang cocok diaktifkan kembali. Menjalankan dua kali tidak mengubah apa pun pada kali kedua.
   - Cocok persis: template diperbarui, nama dibiarkan.
   - Cocok lewat alias: kode dan nama mengikuti katalog, template diperbarui.
   - Tidak ada di katalog: tidak disentuh, tetap memakai kode dan template lamanya.
3. **Penerapan** menjalankan langkah-langkah itu dalam satu transaksi, mencatat siapa dan kapan pada tabel baru `NumberingPolicy` (satu baris), dan menulis audit log. Kolom kode pada arsip lama tidak berubah karena tersimpan sendiri di tiap arsip.
4. **Halaman Super admin "Aturan Penomoran"** menampilkan status, template (bisa diedit, dengan contoh nomor), pratinjau langkah, dan tombol terapkan dengan konfirmasi ketik `TERAPKAN`.
5. **Penyesuaian kode yang berasumsi format lama:**
   - Kode unit sekarang hanya huruf dan angka, maksimal 10 karakter. Diubah menjadi huruf, angka, dan titik pemisah jenjang, maksimal 20 karakter.
   - Pratinjau nomor di form selalu menambah nol di depan. Diubah mengikuti template (`[NO]` bernol, `[SEQ]` tidak).
   - Pencarian SK publik dan impor SK lama mencari jenis `EDAR`. Diubah mengenali `SE` maupun `EDAR`.

## Batasan

- Next.js 14, Prisma 6, Postgres (Neon), Vitest. Tanpa dependensi baru.
- Perubahan skema hanya menambah (tabel `NumberingPolicy`); tidak ada kolom lama yang diubah atau dihapus.
- Operasi produksi harus bisa dijalankan dari aplikasi, karena `DATABASE_URL` produksi tidak bisa dibaca dari luar Vercel.
- Tidak ada database untuk pengujian lokal; logika diuji sebagai fungsi murni, migrasi dibuat dengan `prisma migrate diff` antar-skema.
- Teks antarmuka berbahasa Indonesia.

## Diserahkan ke pembangun

Tata letak halaman mengikuti halaman Super admin lain (kartu dan tabel shadcn/ui). Nama unit pada katalog mengikuti daftar pengguna aplikasi; ejaan bisa dirapikan.

## Yang dikerjakan di luar kode (oleh pemilik proyek)

- Situs demo: cabang database Neon dari produksi, proyek atau lingkungan Vercel terpisah dengan `DATABASE_URL` cabang itu dan subdomain sementara, lalu tekan "Terapkan" di situs demo.
- Go-live (bila disetujui): buat cabang Neon sebagai cadangan, tekan "Terapkan" di produksi antara 1 dan 3 Januari 2027, periksa unit yang tidak disentuh (nonaktifkan atau biarkan).
