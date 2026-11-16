# Arsip Lama (digitalisasi surat lama) — rancangan tahap 1

Tanggal: 16 November 2026. Status: menunggu persetujuan pemilik proyek. Keputusan yang ditandai **(usul)** adalah pilihan penyusun rancangan dan belum dikonfirmasi pemilik proyek.

## Maksud

Kampus ingin mendigitalkan surat-surat lama: hasil pindai dan datanya masuk ke aplikasi persuratan. Alasannya, dengan kata pemilik proyek: "ketika kita nanti butuh, kita tidak tahu butuhnya kapan, tapi ketika butuh kita ada datanya". Arsip ini dipakai sebagai bukti jangka panjang, puluhan tahun, bukan untuk pekerjaan harian.

Data rekap SK BP3M (325 baris, 1987–2026) sudah ada di aplikasi tetapi tanpa berkas; pembaruan rekap itu menyusul dan bukan bagian tahap ini.

## Tujuan

1. **Ketemu.** Surat lama bisa dicari lewat nomor, perihal, tahun, unit, jenis, dan arah (masuk/keluar).
2. **Terbukti asli.** Setiap berkas punya sidik jari (SHA-256) yang dicatat saat diunggah dan bisa dicek ulang kapan saja. Tercatat siapa yang mengunggah, kapan, dan di mana dokumen fisiknya disimpan.
3. **Tidak bisa diubah diam-diam.** Tidak ada penghapusan. Penggantian berkas membuat versi baru; versi lama tetap ada. Perubahan data tercatat dan catatannya tidak ikut terhapus setelah 2 tahun.
4. **Tidak menyentuh penomoran berjalan.** Surat lama tidak mengubah penghitung nomor, tidak terkena aturan nomor unik, dan tidak muncul di laporan surat berjalan.

## Bukan tujuan tahap ini

- Unggah banyak berkas sekaligus (beserta daftar Excel). Tahap berikutnya.
- Memperbarui atau menambah data rekap BP3M.
- Salinan cadangan berkas di luar Google Drive. Ini pekerjaan terpisah (lihat Risiko), tetapi tanpa itu tujuan "tidak hilang" belum terpenuhi.
- Pemeriksaan oleh orang kedua, OCR/pencarian isi dokumen, jadwal retensi, cetak daftar arsip bertanda tangan.
- Ijazah, transkrip, dan dokumen akademik lain (wilayah sistem akademik).
- Menggabungkan surat lama ke halaman Arsip surat berjalan (`/dashboard/archives`).

## Yang tidak boleh terjadi

- Mengunggah surat lama mengubah `NumberingSequence`, menabrak `Archive.number @unique`, atau membuat baris `Archive`.
- Berkas atau catatan surat lama terhapus atau tertimpa lewat aplikasi. `deleteFile` di `src/lib/gdrive.ts` tidak pernah dipanggil untuk berkas arsip lama.
- Surat lama selain SK/SE, yang ditandai rahasia, atau yang ditarik, muncul di pencarian publik `/publik/sk`.
- Berkas hasil pindai bisa dibuka tanpa login atau oleh unit lain.
- Identitas pengunggah hilang karena pembersihan log audit.

## Pendekatan

| | Pendekatan | Untung | Rugi |
|---|---|---|---|
| A | Surat lama masuk tabel `Archive` dengan tanda khusus | Satu tempat pencarian | Nomor lama banyak yang ganda atau tidak beraturan (71 bentuk penulisan di rekap BP3M), sedangkan `Archive.number` unik global. Status `PENDING_PROOF`, cron terlambat, laporan, dan penghitung semuanya perlu pengecualian. Berisiko terhadap penomoran 2027. |
| **B (dipilih)** | Modul Arsip Lama tersendiri, dikembangkan dari tabel `LegacyDecree` | Penomoran berjalan tidak tersentuh. 325 baris BP3M langsung menjadi isi awal dan tinggal dilengkapi berkasnya. Migrasi hanya menambah kolom/tabel. | Layar dan pencarian sendiri |
| C | Folder Drive + daftar Excel, tanpa fitur aplikasi | Tanpa pekerjaan kode | Tidak ada sidik jari, hak akses, maupun riwayat perubahan. Tidak memenuhi tujuan 2 dan 3. |

Pemilik proyek memilih B (16 November 2026).

## Data

Tabel `LegacyDecree` tetap dipakai dan diperluas; nama model tidak diganti **(usul, supaya migrasi hanya aditif)**. Di layar namanya "Arsip Lama".

Kolom baru pada `LegacyDecree`:

| Kolom | Isi |
|---|---|
| `source` | `IMPORT_BP3M` (baris lama, bawaan migrasi) atau `MANUAL` (diisi lewat aplikasi) |
| `direction` | `OUTGOING` (bawaan) / `INCOMING`, memakai enum `Direction` yang ada |
| `counterpart` | teks bebas, opsional: tujuan (surat keluar) atau pengirim (surat masuk) |
| `physicalLocation` | teks bebas, opsional: lemari/boks/map tempat dokumen fisik |
| `physicalKind` | `ASLI` / `SALINAN` / `TIDAK_ADA`: dari apa pindaian dibuat |
| `confidential` | rahasia; lihat Hak akses |
| `createdById`, `createdByEmail` | pembuat catatan; email disalin supaya tetap ada bila akun dihapus |
| `editedAt` | waktu terakhir data diubah lewat aplikasi |
| `withdrawnAt`, `withdrawnById`, `withdrawnReason` | penarikan (pengganti hapus) |

Perubahan pada kolom lama: `noUrutAsli` menjadi boleh kosong (hanya baris BP3M yang punya). `nomor` tetap tidak unik dan boleh kosong. `tanggal` tetap boleh kosong; `tanggalRaw` menyimpan tulisan aslinya.

Nilai awal saat migrasi: baris yang sekarang `isPublic = false` menjadi `confidential = true` **(usul)**, karena baris itu disembunyikan justru sebab menyangkut personel/disiplin. Baris `MANUAL` baru selalu `isPublic = false`.

Tabel baru `LegacyDecreeFile` (satu baris per versi berkas, tidak pernah dihapus):

`id`, `decreeId`, `gdriveFileId` (unik), `fileName`, `mimeType`, `sizeBytes`, `sha256`, `uploadedById`, `uploadedByEmail`, `uploadedAt`, `replacedAt` (kosong = versi berlaku), `replaceReason`, `lastCheckedAt`, `lastCheckOk`.

Satu catatan punya paling banyak satu versi berlaku. Surat berhalaman banyak diunggah sebagai satu PDF.

## Berkas dan sidik jari

- Alur unggah memakai yang sudah ada: `POST /api/gdrive/init`, peramban mengirim langsung ke Drive, lalu endpoint Arsip Lama menyelesaikannya. Jenis berkas dibatasi PDF dan gambar (tanpa Word), maksimum 25 MB seperti sekarang.
- Saat menyelesaikan unggahan, server (bukan peramban) mengambil dari Drive: `sha256Checksum`, `size`, `mimeType`, `name`, dan memeriksa bahwa berkas ada di folder induk (seperti `finaliseUpload`). Bidang `sha256Checksum` tersedia di Drive API v3 (ada di tipe `googleapis` proyek ini); bila ternyata kosong untuk suatu berkas, server menghitungnya sendiri dengan membaca berkas.
- Hanya sesi yang membuka unggahan yang boleh melampirkannya. Cap nama berkas dari `/api/gdrive/init` sekarang hanya memuat 8 huruf pertama `userId`, yang bisa sama antar akun yang dibuat berdekatan, jadi tidak cukup sebagai bukti kepemilikan; untuk Arsip Lama cap memuat `userId` penuh (atau cara lain yang setara, terserah pembangun). Server juga menolak `fileId` yang sudah dipakai `Archive` atau `LegacyDecreeFile` lain. Ini menutup celah "menyelesaikan berkas milik orang lain" untuk modul ini.
- Bila sidik jari yang sama sudah ada di catatan lain, aplikasi memberi peringatan dan menyebut catatannya, tetapi tetap mengizinkan **(usul)**: satu PDF bisa memuat beberapa surat.
- **Periksa keutuhan:** tombol di halaman rincian. Server mengambil ulang sidik jari berkas dari Drive, membandingkannya dengan yang tersimpan, menampilkan hasil (cocok / tidak cocok / berkas tidak ditemukan), dan mengisi `lastCheckedAt` serta `lastCheckOk`.
- **Mengganti berkas:** wajib mengisi alasan. Versi lama diberi `replacedAt`; berkasnya tetap di Drive dan tetap bisa dibuka dari riwayat versi.
- Berkas dibuka lewat route aplikasi yang memeriksa hak akses lalu meneruskan isi dari Drive, dengan aturan yang sama seperti `/api/archives/[id]/proof/file` (`openFileStream`, `safeInlineMime`, `nosniff`, `no-store`). Tidak ada tautan Drive yang diberikan ke pengguna.

Pratinjau memakai bingkai di halaman yang sama; `next.config.mjs` sekarang memberi `X-Frame-Options: SAMEORIGIN` hanya untuk route bukti surat, jadi route berkas arsip lama perlu ditambahkan di sana.

Batas yang perlu dipahami: sidik jari membuktikan berkas tidak berubah sejak diunggah, selama catatan di database dipercaya. Ia tidak membuktikan dokumen kertasnya asli; untuk itu kolom lokasi fisik menunjuk ke dokumen aslinya.

## Hak akses

Satu fungsi aturan dipakai bersama oleh semua route (seperti `canViewProof`):

| | SUPER_ADMIN | ADMIN_UNIT (unit pemilik) | USER (unit pemilik) | Unit lain / tanpa unit |
|---|---|---|---|---|
| Lihat catatan dan berkas | ya | ya | ya, kecuali yang rahasia | tidak |
| Tambah catatan, unggah/ganti berkas, ubah data | ya | ya, hanya unitnya | tidak | tidak |
| Tandai/lepas rahasia | ya | ya | tidak | tidak |
| Tampilkan ke publik, tarik catatan, jalankan impor BP3M | ya | tidak | tidak | tidak |

- Tingkat "rahasia" adalah **(usul)**: tanpa itu, semua pengguna unit Rektorat bisa membuka SK sanksi dan kepegawaian. Menandai rahasia sekaligus mematikan `isPublic`.
- Catatan tanpa unit (`unitId` kosong, misalnya P4KG) hanya terlihat SUPER_ADMIN.
- Catatan yang ditarik tetap tersimpan, hilang dari daftar bawaan, dan hanya terlihat SUPER_ADMIN lewat filter.
- Pencarian publik: kueri `legacyDecree` di `src/app/api/publik/sk/route.ts` ditambah syarat jenis SK/SE, `confidential = false`, dan belum ditarik. Hasil publik tetap hanya data dan `sourceLink` seperti sekarang; berkas unggahan tidak pernah ditautkan ke publik. `isPublic` hanya bisa dinyalakan untuk jenis SK/SE.

## Riwayat perubahan

- Setiap tambah, ubah (dengan nilai sebelum dan sesudah), unggah, ganti berkas, tarik, ubah rahasia/publik, dan periksa keutuhan dicatat lewat `audit()` dengan `targetType` `LegacyDecree`.
- `src/app/api/cron/cleanup-audit/route.ts` diubah supaya tidak menghapus baris audit ber-`targetType` `LegacyDecree` **(usul; lebih sederhana daripada tabel riwayat baru)**.
- Pengunggah dan pembuat juga tersimpan di barisnya sendiri (lihat Data), sehingga tidak bergantung pada log audit.
- Halaman rincian menampilkan riwayat ini.

## Layar

`/dashboard/arsip-lama` menggantikan `/dashboard/legacy-decrees` (alamat lama dialihkan; menu samping "Review SK Legacy" menjadi "Arsip Lama" dan terlihat semua pengguna yang punya unit).

```
Arsip Lama                                         [+ Tambah surat lama]
[cari nomor/perihal/pengirim] [Tahun] [Unit*] [Jenis] [Arah] [Berkas: ada/belum]
---------------------------------------------------------------------------
Tanggal      Nomor                 Perihal            Unit   Jenis  Berkas
02-01-2024   001.1/SK/UNIGA/I/2024 Pengangkatan ...   UNIGA  SK     belum
14-03-1998   (tanpa nomor)         Undangan rapat ... FE     SU     ada ✓
```
(*filter Unit hanya untuk SUPER_ADMIN)

- **Tambah surat lama:** jenis surat (semua jenis yang aktif, tanpa pembatasan per unit; bila tidak ada yang cocok pilih yang terdekat dan tulis di catatan **(usul)**), unit (terkunci untuk ADMIN_UNIT; SUPER_ADMIN boleh memilih unit mana pun termasuk unit lama FS/FT/FIK; `unitLabelRaw` diisi nama unit), arah, nomor (boleh kosong), tanggal (boleh kosong) dan catatan tanggal, perihal, tujuan/pengirim, lokasi fisik, asal pindaian (asli/salinan/tidak ada), rahasia, catatan, berkas. Berkas boleh menyusul.
- **Rincian:** data, pratinjau berkas, sidik jari dan hasil pemeriksaan terakhir, tombol Periksa keutuhan, Ganti berkas, riwayat versi, riwayat perubahan. Untuk SUPER_ADMIN: Tampilkan ke publik, Tarik.
- Tombol "Jalankan Impor" BP3M dan antrean tinjau publik yang sekarang ada dipindahkan ke halaman ini, hanya untuk SUPER_ADMIN.
- Bila nomor yang sama sudah ada pada unit yang sama, form memberi peringatan tetapi tidak menolak.

## Impor BP3M

`importLegacyDecrees` tetap berjalan seperti sekarang, dengan satu perubahan **(usul)**: baris yang sudah diubah lewat aplikasi (`editedAt` terisi) tidak ditimpa oleh impor ulang, dan jumlahnya dilaporkan di hasil impor. Berkas yang sudah dilampirkan tidak pernah tersentuh impor.

## Batasan

- Perilaku penomoran dan surat berjalan di produksi tidak boleh berubah.
- Migrasi hanya aditif (kolom baru berbawaan, tabel baru, `noUrutAsli` dilonggarkan), karena `npm run build` menjalankan `prisma migrate deploy` terhadap database produksi.
- Dikerjakan dengan tes lebih dulu, seperti perbaikan sebelumnya. Wajib ada tes untuk: aturan hak akses, syarat pencarian publik, penolakan `fileId` asing atau terpakai, ganti berkas menyimpan versi lama, hasil periksa keutuhan (cocok/tidak), pengecualian pembersihan audit, dan impor tidak menimpa baris yang diubah.
- Diuji di situs demo `persuratan-demo` sebelum produksi, termasuk unggah dan pratinjau berkas mendekati 25 MB.

## Risiko yang diketahui

- **Berkas hanya satu salinan di Google Drive.** `docs/BACKUP-STRATEGY.md` mengandalkan redundansi Google. Bila akun layanan atau folder hilang, arsip ikut hilang. Perlu pekerjaan terpisah: salinan berkala ke tempat kedua.
- **Batas ukuran respons Vercel** untuk berkas besar yang diteruskan lewat route aplikasi belum pernah diuji (tercatat di log 14 November untuk route bukti surat). Diuji di demo; bila gagal, batas ukuran berkas arsip lama diturunkan dan dicatat.
- Cadangan database terjadwal belum terkonfirmasi berjalan (log 14 November). Sidik jari dan riwayat tersimpan di database, jadi sama pentingnya dengan berkasnya.

## Diserahkan ke pembangun

Nama route API, susunan komponen, bentuk enum, nama kolom persisnya, indeks, bentuk filter tahun untuk baris tanpa tanggal, dan teks antarmuka.

## Tahap berikutnya (urutan usul)

1. Salinan cadangan berkas.
2. Unggah banyak sekaligus dengan daftar Excel.
3. Pembaruan rekap BP3M dan pelampiran pindaiannya.
4. Pemeriksaan orang kedua, daftar arsip bertanda tangan, pencarian isi dokumen.
