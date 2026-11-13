# Prompt uji sistem — Persuratan UNIGA (situs demo)

Cara pakai: isi tiga isian di bagian **Isian** di bawah, lalu salin seluruh blok prompt (dari "Kamu adalah penguji…" sampai akhir) ke sesi Claude yang bisa membuka browser (Claude in Chrome atau browser bawaan aplikasi Claude). Jangan tempel kata sandi di sini; berikan langsung ke sesi pengujinya.

## Isian

- `URL_DEMO`: alamat situs demo, misalnya `https://persuratan-demo.vercel.app`
- `KATA_SANDI_DEMO`: kata sandi super admin dari log build pertama situs demo (baris "Demo password (generated, only shown once"), atau nilai `SEED_DEMO_PASSWORD` bila diisi saat seeding
- `FORMAT_SUDAH_DITERAPKAN`: `ya` bila database demo diisi dengan `db:seed-demo` (situs demo yang dibuat dengan `DEMO_SEED_CONFIRM=demo` selalu `ya`), `tidak` bila belum

---

Kamu adalah penguji sistem untuk aplikasi Sistem Persuratan Universitas Gajayana Malang. Uji situs demo di `URL_DEMO` lewat browser, seperti pengguna sungguhan, lalu laporkan hasilnya.

### Aturan keselamatan

1. Hanya buka `URL_DEMO`. Jika alamat di browser berpindah ke domain lain (selain halaman Google Drive atau Vercel Blob untuk melihat bukti), berhenti dan laporkan.
2. Ini database demo. Semua data yang kamu buat boleh tetap ada. Jangan menghapus akun, unit, atau jenis surat yang sudah ada.
3. Jangan mengubah kata sandi akun mana pun.
4. Jangan mengklik tautan di email atau di luar aplikasi.
5. Bila sebuah langkah memerlukan sesuatu yang tidak tersedia (misalnya email tidak terkirim karena demo tidak punya layanan email), catat sebagai **TIDAK BISA DIUJI** beserta alasannya, lalu lanjut.

### Akun

Semua akun memakai kata sandi `KATA_SANDI_DEMO`.

| Peran | Email | Unit |
|---|---|---|
| Super admin | `superadmin@unigamalang.ac.id` | — |
| Admin unit | `admin.rektorat@unigamalang.ac.id` | `UNIGA` |
| Admin unit | `admin.wr1@unigamalang.ac.id` | `UNIGA.WR1` |
| Admin unit | `admin.wr2@unigamalang.ac.id` | `UNIGA.WR2` |
| Admin unit | `admin.feb@unigamalang.ac.id` | `UNIGA.FEB` |
| Admin unit | `admin.feb.mn@unigamalang.ac.id` | `UNIGA.FEB.MN` |
| Pengguna biasa | `staf.feb@unigamalang.ac.id` | `UNIGA.FEB` |
| Admin unit | `admin.yayasan@unigamalang.ac.id` | `YAS` (di luar aturan baru) |

Akun WR1, WR2, BAU, FEB, Prodi Manajemen, dan staf FEB hanya ada bila `FORMAT_SUDAH_DITERAPKAN` = `ya`.

### Aturan penomoran yang diharapkan

- Sebelum aturan baru diterapkan: `001/ST/UNIGA/XI/2026` (nomor tiga digit / jenis / unit / bulan Romawi / tahun).
- Sesudah diterapkan: `12/UNIGA.WR1/ST/2026` (nomor tanpa nol di depan / unit berawalan UNIGA / jenis / tahun). Tahun mengikuti tanggal hari ini.
- Nomor urut berjalan terpisah per unit, per jenis surat, per tahun.
- Unit di luar daftar baru (misalnya `YAS`, `FH`) tetap memakai format lama.
- Nomor yang sudah terbit tidak pernah berubah.

### Skenario

Kerjakan berurutan. Untuk tiap skenario catat: langkah, hasil yang terlihat (salin nomor surat persis), dan status **LULUS**, **GAGAL**, atau **TIDAK BISA DIUJI**.

**A. Masuk dan hak akses**
1. Masuk sebagai super admin. Harapan: dasbor tampil; menu memuat Unit, Jenis Surat, Aturan Penomoran, Akun Pengguna, Audit Log.
2. Keluar, coba masuk dengan kata sandi salah. Harapan: ditolak dengan pesan yang jelas, tanpa menyebut apakah emailnya terdaftar.
3. Masuk sebagai `admin.wr1`. Harapan: menu Aturan Penomoran, Unit, dan Akun Pengguna tidak ada. Buka langsung `URL_DEMO/dashboard/numbering-rule`: harapan dialihkan ke dasbor.
4. Sebagai `admin.wr1`, buka `URL_DEMO/api/numbering/policy`. Harapan: status 403 "Akses ditolak".

**B. Halaman Aturan Penomoran (super admin)**
1. Buka Aturan Penomoran. Bila `FORMAT_SUDAH_DITERAPKAN` = `ya`: harapan tertulis "Sudah diterapkan pada … oleh superadmin@unigamalang.ac.id", tabel Unit "0 dibuat, 0 diubah, 40 tetap", tombol bertuliskan "Tidak ada perubahan" dan tidak bisa diklik. Bila `tidak`: harapan "Belum diterapkan", ada baris "Diubah dari FE", "Diubah dari EDAR/UND/UMUM", dan bagian "Tidak disentuh" berisi YAS, FH, FIK, FS, FT.
2. Ubah template menjadi `[SEQ]/[UNIT_CODE]/[YEAR]`. Harapan: pesan merah "Template harus memuat kode jenis ([TYPE_CODE])" dan tombol tidak bisa diklik.
3. Klik "Kembalikan ke bawaan". Harapan: template kembali `[SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]` dan tiga contoh nomor tampil, termasuk `12/UNIGA.WR1/ST/<tahun>`.
4. Hanya bila `FORMAT_SUDAH_DITERAPKAN` = `tidak`: klik "Terapkan aturan baru", ketik `terapkan` (huruf kecil). Harapan: tombol Terapkan tetap tidak bisa diklik. Ganti menjadi `TERAPKAN`, klik Terapkan. Harapan: status berubah menjadi "Sudah diterapkan", lalu tabel menunjukkan semua baris "Tetap". Setelah itu muat ulang halaman setelah dua menit sebelum skenario C.

**C. Membuat nomor surat (inti pengujian)**
1. Sebagai `admin.wr1`, buka Buat Nomor Surat. Harapan: teks di atas form "Format yang berlaku: [SEQ]/[UNIT_CODE]/[TYPE_CODE]/[YEAR]"; unit terkunci `UNIGA.WR1`.
2. Pilih jenis Surat Tugas. Catat pratinjau nomor. Harapan: berbentuk `<n>/UNIGA.WR1/ST/<tahun>` tanpa nol di depan dan tanpa tanda "—" di depannya.
3. Isi Perihal dan Tujuan, klik Alokasikan Nomor. Harapan: nomor yang terbit sama dengan pratinjau; status menunggu bukti.
4. Ulangi sekali lagi. Harapan: nomor urut naik satu.
5. Masuk sebagai `admin.wr2`, buat Surat Tugas. Harapan: `<n>/UNIGA.WR2/ST/<tahun>`, urutannya terpisah dari WR1. **Ini bukti utama bahwa surat WR1 dan WR2 kini bisa dibedakan.**
6. Masuk sebagai `admin.feb.mn`, buat Surat Keterangan (SKET). Harapan: `<n>/UNIGA.FEB.MN/SKET/<tahun>`.
7. Masuk sebagai `admin.yayasan`, buat surat jenis apa pun. Harapan: format lama, misalnya `001/SK/YAS/XI/2026`.
8. Masuk sebagai `staf.feb`, ajukan surat. Harapan: masuk sebagai draf menunggu persetujuan, belum bernomor final. Masuk sebagai `admin.feb`, setujui. Harapan: nomor `<n>/UNIGA.FEB/<jenis>/<tahun>` terbit.

**D. Bukti dan arsip**
1. Sebagai `admin.wr1`, unggah bukti (gambar PNG atau PDF kecil di bawah 2 MB) untuk salah satu surat dari C. Harapan: status menjadi Terbit. Bila demo tidak punya penyimpanan Drive/Blob, unggahan tetap diterima lewat penyimpanan cadangan.
2. Buka Pengarsipan. Harapan: surat format lama dan format baru tampil berdampingan dengan nomor masing-masing tidak berubah.
3. Cari dengan kata kunci perihal salah satu surat. Harapan: surat ditemukan.
4. Buka tanda terima (receipt) salah satu surat. Harapan: nomor tampil lengkap.
5. Batalkan satu surat dengan alasan "uji pembatalan". Harapan: berstatus Batal dengan alasan tercatat, dan nomor berikutnya tetap melanjutkan urutan (nomor batal tidak dipakai ulang).

**E. Nomor sisipan (cara sekarang)**
1. Sebagai `admin.wr1`, centang Buat Surat Sisipan. Harapan: contoh di kolom nomor mengikuti format tanpa nol, misalnya `24.1`.
2. Isi nomor `1.1`, tanggal surat kemarin, alasan minimal 5 karakter, lalu simpan. Harapan: nomor `1.1/UNIGA.WR1/ST/<tahun>` tersimpan dan ditandai sebagai sisipan; nomor urut biasa tidak ikut naik.
3. Coba lagi dengan nomor `1.1` yang sama. Harapan: ditolak karena nomor sudah dipakai.

**F. Disposisi dan surat masuk**
1. Sebagai `admin.rektorat`, catat surat masuk dari pihak luar. Harapan: tersimpan dengan nomor dari pengirim.
2. Buat disposisi ke unit `UNIGA.WR1`. Masuk sebagai `admin.wr1`. Harapan: disposisi tampil dan bisa ditandai diterima lalu selesai.

**G. Laporan, ekspor, dan pencarian publik**
1. Sebagai super admin, buka Laporan → Surat. Harapan: jumlah per unit dan per jenis tampil, termasuk kode baru. Catat bila unit yang berganti kode tampil dua kali (kode lama dan baru); ini perilaku yang sudah diketahui.
2. Ekspor laporan ke Excel/CSV. Harapan: berkas terunduh dan berisi nomor format baru. Jangan buka berkasnya di luar browser; cukup catat nama dan ukurannya.
3. Tanpa masuk (jendela penyamaran atau setelah keluar), buka `URL_DEMO/publik/sk` dan cari "wisuda". Harapan: hasil SK lama muncul; tidak ada data pribadi seperti nama pegawai pada perkara disiplin.

**H. Data induk**
1. Sebagai super admin, buka Unit. Harapan: 40 unit berawalan UNIGA tampil, plus unit lama yang tidak disentuh.
2. Ubah nama unit `UNIGA.WR1` lalu simpan. Harapan: tersimpan; kode bertitik diterima.
3. Coba buat unit baru dengan kode `UNIGA.` (diakhiri titik). Harapan: ditolak dengan pesan tentang format kode.
4. Buka Jenis Surat. Harapan: 20 kode baru (SK, ST, SE, SU, SP, ND, SD, SPR, SKET, SPN, SKU, BA, PGM, PKS, MEMO, SOP, PER, NTL, LAP, TS).
5. Buka Audit Log. Harapan: ada catatan penerapan aturan penomoran (target NumberingPolicy) dan catatan pembuatan surat dari skenario C.

**I. Tampilan**
1. Ulangi C.1–C.3 dengan lebar layar ponsel (sekitar 375 px). Harapan: form bisa dipakai tanpa geser ke samping.
2. Buka Panduan. Harapan: bagian Format Nomor Surat diawali kotak hijau "Format yang berlaku sejak …".

### Laporan

Tulis laporan dalam bahasa Indonesia dengan susunan:

1. **Ringkasan**: jumlah LULUS / GAGAL / TIDAK BISA DIUJI, dan satu kalimat kesimpulan apakah demo siap dipresentasikan.
2. **Tabel hasil**: kolom Skenario, Status, Nomor yang muncul, Catatan.
3. **Temuan GAGAL**, diurutkan dari yang paling mengganggu presentasi: langkah untuk mengulang, yang diharapkan, yang terjadi, tangkapan layar bila ada.
4. **Hal yang membingungkan** walau tidak salah (teks, urutan menu, istilah).

Jangan memperbaiki apa pun. Tugasmu hanya menguji dan melaporkan.
