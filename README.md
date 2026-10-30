# Quran Oyen

Situs web statis untuk membaca dan menelusuri Al-Qur’an kata demi kata. Repositori ini berisi berkas situs yang dipublikasikan di [alquran.bangundwir.my.id](https://alquran.bangundwir.my.id/).

## Fitur

- **Baca 114 surah dan 6.236 ayat** dalam teks Arab Utsmani. Setiap kata dapat dibuka untuk melihat bentuk dasar, akar kata, kelas kata, transliterasi, dan arti kata dalam bahasa Inggris.
- **Terjemahan bahasa Indonesia per ayat** dapat ditampilkan atau disembunyikan. Bahasa antarmuka tersedia dalam bahasa Indonesia dan Inggris, dengan pengaturan ukuran teks.
- **Pencarian Al-Qur’an** mendukung kata Arab, kata dalam terjemahan Indonesia, dan arti kata bahasa Inggris. Pencocokan persis berjalan di browser; ejaan Arab dinormalisasi agar beberapa variasi penulisan tetap dapat ditemukan.
- **Jelajahi akar kata** melalui peta hubungan atau tampilan titik ayat. Pilih sebuah kata untuk menyorot kemunculan akar katanya di seluruh Al-Qur’an.
- **Bandingkan frekuensi kata** berdasarkan bentuk dasar (lemma), lalu telusuri lokasi kemunculannya.
- **Navigasi dan tampilan responsif** untuk layar ponsel maupun desktop, termasuk panel yang mengikuti gerakan sentuh di ponsel.
- **Dukungan PWA dan baca offline.** Situs dapat ditambahkan ke layar utama. Dari pengaturan baca, pengguna dapat mengunduh data seluruh surah untuk dibaca tanpa koneksi; jumlah unduhan yang ditampilkan aplikasi sekitar 3,4 MB.

## Batasan salinan mandiri

Repositori ini berisi situs statis, bukan server lengkap dari situs sumber. Pencarian persis dan sebagian besar fitur baca berjalan di perangkat. **Pencarian terkait makna melalui GPU tidak tersambung pada salinan ini** karena layanan API yang dibutuhkan tidak disertakan; pilihan GPU pada antarmuka memang dinonaktifkan.

Peta akar kata memakai WebGPU bila tersedia dan memiliki jalur perhitungan cadangan di JavaScript. WebGPU bukan syarat untuk membaca surah atau memakai pencarian persis.

## Menjalankan secara lokal

Tidak diperlukan proses build, framework, atau instalasi paket. Karena situs menggunakan JavaScript modules, bukalah melalui server HTTP lokal—jangan membuka `index.html` langsung dengan skema `file://`.

```bash
git clone https://github.com/podsni/quran-oyen-site.git
cd quran-oyen-site
python3 -m http.server 8000
```

Kemudian buka <http://localhost:8000/> di browser modern. `localhost` dianggap konteks aman oleh browser untuk pengujian service worker. Untuk menguji instalasi PWA dan penggunaan offline, gunakan browser yang mendukung service worker; pada perangkat nyata, situs harus disajikan melalui HTTPS.

## Deploy

Repositori ini adalah situs statis. Untuk layanan hosting statis:

- jadikan direktori root repositori sebagai direktori publik;
- gunakan direktori keluaran `.` dan kosongkan perintah build—tidak ada bundler atau langkah kompilasi;
- pertahankan struktur folder dan huruf besar/kecil nama berkas; browser perlu memuat modul JavaScript, berkas JSON, dan berkas biner dari jalur relatif yang sama;
- aktifkan HTTPS agar service worker dan fitur PWA dapat digunakan di luar `localhost`.

`sw.js` berisi versi rilis dan hash berkas untuk cache offline. Jika berkas situs atau data diubah, hash dan versi rilis yang dikelola service worker perlu diperbarui sebelum deploy; skrip stamping rilis yang disebut dalam komentar `sw.js` tidak termasuk dalam repositori ini. README tidak mengasumsikan adanya pipeline deploy otomatis.

## Privasi dan layanan eksternal

Pencarian persis dilakukan di perangkat. Menurut implementasi `track.js`, teks kueri pencarian dan teks kata tidak dikirim sebagai analitik; pelacakan hanya mencatat peristiwa layar/interaksi dan konteks kunjungan. Kode tersebut mematikan pelacakan untuk browser otomatis, preferensi Do Not Track/Global Privacy Control, atau bila `localStorage` berisi `quran.notrack`. Pengiriman analitik menggunakan endpoint same-origin `/_e` dan `/_d`.

Pada kode repositori ini, pelacak hanya diaktifkan untuk hostname `quran.oyenza.com`. Karena itu, analitik tidak berjalan pada domain demo `alquran.bangundwir.my.id` kecuali allowlist hostname di `track.js` diubah. Fitur membaca tidak bergantung pada layanan analitik; kegagalan pengiriman analitik tidak menghentikan aplikasi.

## Struktur repositori

| Jalur | Isi |
| --- | --- |
| `index.html` | Dokumen aplikasi, gaya, struktur halaman, dan dialog/panel. |
| `app.js` | Inisialisasi aplikasi, pembacaan, navigasi, pengaturan, dan penghubung antarmodul. |
| `search.js`, `search-sheet.js` | Pencarian lokal dan tampilan hasil. |
| `layout.js`, `sheet.js` | Tata letak bacaan dan perilaku panel/sheet. |
| `map.js`, `dots.js`, `quran-gpu.js` | Peta akar kata, visualisasi titik ayat, dan perhitungan akar kata berbantuan GPU dengan fallback. |
| `same-count.js`, `network.js` | Frekuensi bentuk dasar dan panel inspeksi jaringan tata letak kata/ayat. |
| `track.js`, `sw.js` | Pengiriman analitik yang dibatasi hostname serta cache/offline service worker. |
| `data/s001.json`–`data/s114.json` | Teks Al-Qur’an dan anotasi per kata untuk setiap surah. |
| `data/id/t001.json`–`data/id/t114.json` | Terjemahan bahasa Indonesia per ayat. |
| `data/index.json`, `data/roots.json`, `data/words.json` | Metadata surah dan indeks kata/akar. |
| `data/search*.json`, `data/*.bin`, `data/same-count.json` | Indeks pencarian, data biner untuk pencarian/visualisasi, dan data frekuensi kata. |
| `data/links/` | Hubungan antar-ayat yang dihitung dari akar kata, beserta metadata metode. |
| `icons/` | Favicon, ikon aplikasi, dan gambar layar pembuka PWA. |
| `vendor/` | Berkas runtime Handwired, font Amiri Quran, dan aset wajah Oyen yang digunakan antarmuka. |
| `manifest.webmanifest` | Metadata instalasi aplikasi web progresif. |

## Sumber teks dan atribusi

Aplikasi menampilkan atribusi sumber di dalam antarmukanya. Berdasarkan atribusi tersebut:

- Teks Al-Qur’an Utsmani versi 1.1, nama surah, dan metadata: [Tanzil Project](https://tanzil.net/). Teks digunakan verbatim menurut ketentuan Tanzil, dengan atribusi CC BY 3.0.
- Akar kata, lemma, kelas kata, transliterasi, dan arti kata bahasa Inggris: [Quranic Arabic Corpus](https://corpus.quran.com/), karya Kais Dukes; atribusi aplikasi menyebut GNU GPL.
- Terjemahan bahasa Indonesia per ayat: Kementerian Agama Republik Indonesia, diperoleh melalui [Tanzil](https://tanzil.net/trans/), untuk penggunaan non-komersial.
- Tata letak dan animasi: [Handwired](https://github.com/chenglou/handwired) oleh Cheng Lou, berlisensi MIT.

Repositori ini **belum menyertakan berkas `LICENSE` tingkat proyek**. Atribusi di atas bukan lisensi tunggal untuk seluruh kode dan data. Sebelum menyalin atau menggunakan kembali materi, periksa ketentuan terbaru dari masing-masing pemilik/sumber, khususnya ketentuan non-komersial untuk terjemahan bahasa Indonesia.
