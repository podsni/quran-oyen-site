# Quran Oyen

Situs web statis untuk membaca dan menelusuri Al-Qur’an kata demi kata. Repositori ini berisi berkas situs yang dipublikasikan di [alquran.bangundwir.my.id](https://alquran.bangundwir.my.id/).

## Fitur

- **Baca 114 surah dan 6.236 ayat** dalam teks Arab Utsmani. Setiap kata dapat dibuka untuk melihat bentuk dasar, akar kata, kelas kata, transliterasi, dan arti kata dalam bahasa Inggris.
- **Terjemahan bahasa Indonesia per ayat** dapat ditampilkan atau disembunyikan. Bahasa antarmuka tersedia dalam bahasa Indonesia dan Inggris, dengan pengaturan ukuran teks.
- **Audio surat penuh dan audio per ayat** tersedia dari enam qari EQuran.id. Pilih qari, putar seluruh surat atau satu ayat, aktifkan lanjut otomatis, atau mulai audio dari entri tafsir.
- **Tafsir per ayat** dapat dibuka dari halaman surat dengan ringkasan konteks surat dan pencarian nomor/kata. Setiap entri dapat diputar atau dibuka langsung di ayatnya; respons katalog, detail, dan tafsir API disimpan di IndexedDB untuk membantu saat koneksi terputus.
- **Hadis dan tafsir lengkap per surat** tersedia dari satu panel. Pengguna dapat membuka hadis Arab/Indonesia berdasarkan kitab dan nomor, mencari teks Indonesia secara lokal pada edisi Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah, atau Malik, serta mencari lintas koleksi memakai teks Inggris UmmahAPI. Tafsir EQuran.id dapat dibuka untuk masing-masing dari 114 surat.
- Hadis dapat disimpan dari tampilan detail maupun hasil pencarian. Maksimal 50 teks tersimpan secara lokal pada perangkat dan bisa dibuka kembali tanpa koneksi; simpanan tidak disinkronkan ke akun atau perangkat lain.
- **Pencarian semantik ayat dan tafsir** menggunakan Vector Search EQuran.id. Hasil menampilkan teks Arab, transliterasi Latin bila tersedia, terjemahan/tafsir, tingkat kecocokan, serta tautan untuk membuka, mendengarkan, atau melihat tafsir ayat terkait.
- **Doa dan dzikir** dari katalog EQuran.id dapat dicari dan disaring berdasarkan kategori. Kartu menampilkan teks Arab, bacaan Latin, arti, tag, dan keterangan bila tersedia.
- **Jadwal sholat bulanan** tersedia setelah pengguna memilih provinsi dan kabupaten/kota secara manual. Jadwal hari ini ditonjolkan, tabel bulanan dapat dibuka, dan lokasi terakhir disimpan di perangkat.
- **Pencarian Al-Qur’an** mendukung kata Arab, kata dalam terjemahan Indonesia, dan arti kata bahasa Inggris. Pencocokan persis berjalan di browser; ejaan Arab dinormalisasi agar beberapa variasi penulisan tetap dapat ditemukan.
- **Jelajahi akar kata** melalui peta hubungan atau tampilan titik ayat. Pilih sebuah kata untuk menyorot kemunculan akar katanya di seluruh Al-Qur’an.
- **Bandingkan frekuensi kata** berdasarkan bentuk dasar (lemma), lalu telusuri lokasi kemunculannya.
- **Navigasi dan tampilan responsif** untuk layar ponsel maupun desktop, termasuk panel yang mengikuti gerakan sentuh di ponsel.
- **Dukungan PWA dan baca offline.** Situs dapat ditambahkan ke layar utama. Dari pengaturan baca, pengguna dapat mengunduh data seluruh surah untuk dibaca tanpa koneksi; unduhan terkompresi sekitar 3,5 MB dan memakai sekitar 12 MB penyimpanan lokal.

Teks bacaan, terjemahan lokal, dan fitur pencarian tetap bekerja dengan salinan offline yang sudah diunduh. Audio MP3 diputar dari CDN EQuran.id dan memerlukan koneksi; tafsir dapat dibaca offline jika suratnya pernah berhasil dimuat dan cache browser masih tersedia. Detail hadis serta edisi Indonesia yang pernah diunduh untuk pencarian disimpan di IndexedDB pada perangkat; hadis yang ditandai untuk dibaca kembali disimpan di penyimpanan lokal browser.

## Gulir Ayat

Buka **Gulir Ayat** di beranda atau langsung ke `/gulir.html`. Mode ini memiliki feed vertikal satu ayat per layar, pilihan lokal **Untukmu** berdasarkan akar kata pada simpanan, **Hari ini** untuk target/progres/streak, serta **Pustaka** untuk simpanan dan membaca urutan surah. Tautan `gulir.html?s=107&a=4` membuka rangkaian konteks ayat tersebut, bukan menghilangkan kelanjutan kalimatnya. Pengelompokan memakai tanda baca terjemahan sebagai bantuan navigasi, bukan penetapan ilmiah konteks tafsir.

Ayat dapat disimpan, dibagikan sebagai teks beserta tautan, dipelajari kata per kata, atau didengarkan dari qari yang dipilih. Menu berbagi juga dapat membuat kartu PNG vertikal 9:16 untuk Story, dengan pilihan tema, transliterasi opsional, dan kartu lanjutan otomatis agar ayat panjang tidak terpotong. Jika Instagram Story atau Status WhatsApp tidak tersedia pada menu berbagi perangkat, simpan gambarnya lalu unggah dari aplikasinya; tautan ayat dibagikan terpisah sebagai teks/caption. Ayat panjang pada feed memiliki area teks yang bisa digulir agar tidak terpotong. Makna kata dan transliterasi korpus tetap berbahasa Inggris. Panel tafsir mengintegrasikan Jalalain dan Quraish Shihab dkk. dari unduhan resmi Tanzil (non-komersial), serta Kemenag melalui EQuran.id. Al-Mukhtasar dan As-Sa’di hanya ditautkan ke halaman resmi QuranEnc karena data lengkap/resmi belum berhasil diverifikasi untuk dipaketkan; keduanya **bukan** sumber terintegrasi offline.

Progres khusus mode Gulir dihitung setelah ayat terlihat sekurangnya 1,5 detik, hanya ketika halaman terlihat dan panel belajar tertutup. Ini indikator bacaan, bukan bukti pemahaman atau penilaian ibadah. Target, ayat unik, streak berdasarkan tanggal lokal, maksimal 500 simpanan, tema, dan ukuran teks disimpan di `localStorage`, tanpa akun atau sinkronisasi. Menghapus data situs menghapus semuanya. Rekomendasi tidak mengirim riwayat ke backend dan tidak menggunakan AI. Pembaca lama tetap terpisah dan tidak diubah.

Shell Gulir dan data yang pernah dimuat tersedia offline melalui service worker. Unduh seluruh data dari pembaca utama untuk ketersediaan 114 surah tanpa jaringan. Dua tafsir lokal di `tafsir/` dimuat per surah sesuai kebutuhan dan tidak memperbesar paket **Unduh semua data** lama; surat tafsir yang sudah dibuka dapat dibaca offline selama cache tersimpan. Kemenag memakai cache IndexedDB yang sudah ada; audio tetap memerlukan jaringan. Ketentuan serta provenance ada di [`tafsir/SOURCES.md`](tafsir/SOURCES.md).

## Batasan salinan mandiri

Repositori ini berisi situs statis, bukan server lengkap dari situs sumber. Pencarian persis dan sebagian besar fitur baca berjalan di perangkat. **Pencarian semantik memakai API publik EQuran.id dan memerlukan koneksi internet; pencarian terkait makna melalui GPU tetap tidak tersambung** karena layanan GPU sumber tidak disertakan, sehingga pilihan GPU dinonaktifkan.

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

Quran Oyen adalah situs statis tanpa framework, bundler, atau langkah kompilasi. Semua berkas publik berada di **root** repository. Pada platform hosting, gunakan root repository sebagai direktori proyek dan pertahankan struktur folder serta huruf besar/kecil nama berkas.

Sebelum menerbitkan perubahan pada aset aplikasi, jalankan `python3 tools/stamp_sw.py` dari root repository untuk memperbarui daftar hash dan versi cache di `sw.js`. Uji perubahan, lalu commit `sw.js` bersama aset yang diubah. Perubahan README saja tidak memerlukan stamping. Semua platform harus menyajikan situs di HTTPS; jangan host aplikasi ini di subdirektori URL karena jalur aset dan cakupan service worker menggunakan root situs.

> **Penting tentang link share ayat:** Vercel, Cloudflare Pages yang statis, dan Netlify dapat menyajikan aplikasi, tetapi tidak menjalankan `worker.js`. Worker tersebut menyisipkan metadata Open Graph/Twitter khusus ayat untuk crawler media sosial. Untuk mempertahankan preview share per ayat, gunakan **Cloudflare Workers Static Assets** di bawah ini. `worker.js` saat ini menetapkan `PUBLIC_ORIGIN` ke domain demo; jika memakai domain sendiri, ganti nilainya dengan URL HTTPS produksi milik Anda.

### Vercel

1. Di dashboard Vercel, pilih **Add New… > Project**, hubungkan GitHub, lalu impor `podsni/quran-oyen-site` (atau fork Anda). Beri Vercel akses ke repository bila diminta.
2. Atur **Root Directory** ke `./` (root repository) dan **Framework Preset** ke **Other**.
3. Pada pengaturan build, aktifkan override **Build Command** lalu biarkan kosong agar Vercel melewati build. Tidak ada perintah install atau dependency aplikasi yang perlu dijalankan. Set **Output Directory** ke `.`; repository ini tidak memiliki direktori `public` atau folder hasil build.
4. Pilih branch produksi `main`, lalu pilih **Deploy**. Jika proyek dihubungkan ke Git, push berikutnya ke branch produksi akan memicu deployment baru.
5. Untuk domain sendiri, tambahkan domain melalui **Project Settings > Domains** dan ikuti instruksi DNS Vercel. Pastikan deployment memakai HTTPS.

Rujukan: [Vercel — Configuring a Build](https://vercel.com/docs/builds/configure-a-build) (lihat bagian *Skip Build Step* dan *Output Directory*).

### Cloudflare Workers Static Assets (disarankan untuk preview share)

`worker.js` memerlukan binding aset `ASSETS` dan harus dijalankan sebelum aset pada dua path Gulir Ayat. Untuk deploy dengan Wrangler, buat file `wrangler.toml` di root repository dengan konfigurasi berikut. Ubah `name` bila nama Worker tersebut sudah dipakai di akun Cloudflare Anda; sesuaikan `compatibility_date` ke tanggal saat konfigurasi dibuat.

```toml
name = "quran-oyen-site"
main = "worker.js"
compatibility_date = "2026-11-01"

[assets]
directory = "."
binding = "ASSETS"
run_worker_first = ["/gulir", "/gulir.html"]
html_handling = "auto-trailing-slash"
not_found_handling = "none"
```

Pasang [Node.js dan npm](https://nodejs.org/), kemudian jalankan dari root repository:

```bash
npm init -y
npm install --save-dev wrangler
npx wrangler login
npx wrangler dev
npx wrangler deploy
```

`wrangler dev` menjalankan pratinjau lokal; setelah diuji, `wrangler deploy` mengunggah kode Worker beserta seluruh aset statis. Wrangler akan meminta autentikasi Cloudflare pada deploy pertama. Untuk domain sendiri, buka **Workers & Pages** di dashboard, pilih Worker, lalu tambahkan domain melalui pengaturan domain/route Worker. Domain harus menggunakan zona DNS yang tersedia di akun Cloudflare. Setelah deploy, uji `/`, `/gulir.html`, dan link seperti `/gulir?s=107&a=4`; periksa pula source HTML link ayat untuk memastikan metadata sosial berisi ayat yang benar.

Rujukan: [Cloudflare — Static Assets](https://developers.cloudflare.com/workers/static-assets/) dan [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/).

#### Alternatif: Cloudflare Pages (situs statis saja)

Jika tidak memerlukan metadata share dinamis dari `worker.js`, Anda dapat memakai integrasi Git Pages:

1. Di dashboard Cloudflare, buka **Workers & Pages > Create application > Pages > Connect to Git**, hubungkan GitHub, lalu pilih repository.
2. Pilih `main` sebagai **Production branch**. Biarkan **Root directory** kosong (artinya root repository), pilih preset tanpa framework, biarkan **Build command** kosong, dan masukkan `.` sebagai **Build output directory**.
3. Pilih **Save and Deploy**. Setelah itu push ke `main` akan menjalankan deployment otomatis. Tambahkan domain di pengaturan **Custom domains** proyek Pages bila diperlukan.

Pages akan menayangkan aplikasi statis, tetapi konfigurasi Pages ini **tidak menjalankan `worker.js`** sehingga preview metadata khusus tiap ayat tidak dibuat. Dokumentasi Cloudflare juga menyatakan bahwa proyek Pages yang dibuat dengan Git integration tidak dapat dialihkan kemudian ke Direct Upload; bila ingin mencoba model deployment berbeda, buat proyek baru. Rujukan: [Cloudflare Pages — Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) dan [Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

### Netlify

1. Di dashboard Netlify, pilih **Add new project > Import an existing project**, pilih GitHub, izinkan akses ke repository, lalu pilih `podsni/quran-oyen-site` atau fork Anda.
2. Pilih branch produksi `main`. Biarkan **Base directory** kosong (root repository) dan **Build command** kosong. Isi **Publish directory** dengan `.`; jangan gunakan direktori `dist`, `build`, atau folder lain karena proyek ini tidak membuat output terpisah.
3. Pilih **Deploy**. Push berikutnya ke branch produksi akan memicu deploy otomatis. Domain sendiri dapat ditambahkan melalui pengaturan **Domain management > Production domains**.

Opsional: simpan pengaturan publikasi yang sama di file `netlify.toml` pada root repository:

```toml
[build]
  publish = "."
```

Jangan menambahkan `command` build: tidak ada langkah build yang diperlukan. Rujukan: [Netlify — Deploy from your repository](https://docs.netlify.com/start/quickstarts/deploy-from-repository/) dan [Build configuration overview](https://docs.netlify.com/build/configure-builds/overview/).

### Pemeriksaan setelah deploy

- Buka halaman utama dan `/gulir.html`; pastikan file JavaScript, JSON, font, gambar, dan data di folder `data/` termuat tanpa 404. Nama file dan jalur harus tetap sama persis, termasuk kapitalisasi.
- Pastikan HTTPS aktif. Setelah membuka situs di browser, coba pasang PWA dan muat ulang halaman saat offline. Untuk mencoba seluruh surah tanpa jaringan, unduh data lengkap dari pembaca utama terlebih dahulu.
- Pada Cloudflare Workers, uji link share ayat dan metadata Open Graph/Twitter. Di hosting statis Vercel, Pages, atau Netlify, aplikasi baca tetap berfungsi, tetapi metadata khusus per ayat dari Worker tidak tersedia.

## Privasi dan layanan eksternal

Audio, tafsir, pencarian semantik, katalog doa, dan jadwal sholat mengambil data dari [API EQuran.id](https://equran.id/apidev/v2). Pemutar memuat berkas MP3 dari CDN EQuran.id hanya setelah pengguna memutar audio. Katalog doa, jadwal, tafsir yang sudah dibuka, dan data hadis yang pernah diminta disimpan di IndexedDB untuk akses saat koneksi terputus. Hadis yang dipilih untuk dibaca kembali tersimpan di `localStorage` perangkat, tidak disinkronkan, dan dapat dihapus dari panel Hadis. Pencarian Hadis Indonesia mengunduh satu edisi lengkap dari [Fawaz Hadith API](https://github.com/fawazahmed0/hadith-api), lalu memproses kueri di perangkat. Jika pengguna memilih pencarian lintas koleksi berbahasa Inggris, teks kueri dikirim ke [UmmahAPI](https://ummahapi.com/api/docs); detail hadis juga meminta nomor/koleksi tersebut. Kueri Vector Search dikirim ke EQuran.id dan tidak disimpan oleh fitur ini. Jadwal hanya mengirim provinsi/kabupaten-kota yang dipilih pengguna, dan pilihan lokasi disimpan di `localStorage` perangkat. Sumber, cakupan bahasa, keterbatasan edisi, dan catatan lisensi API Hadis/Tafsir dijelaskan di [`API_SOURCES.md`](API_SOURCES.md).

Pencarian persis dilakukan di perangkat. Menurut implementasi `track.js`, teks kueri pencarian dan teks kata tidak dikirim sebagai analitik; pelacakan hanya mencatat peristiwa layar/interaksi dan konteks kunjungan. Kode tersebut mematikan pelacakan untuk browser otomatis, preferensi Do Not Track/Global Privacy Control, atau bila `localStorage` berisi `quran.notrack`. Pengiriman analitik menggunakan endpoint same-origin `/_e` dan `/_d`.

Pada kode repositori ini, pelacak hanya diaktifkan untuk hostname `quran.oyenza.com`. Karena itu, analitik tidak berjalan pada domain demo `alquran.bangundwir.my.id` kecuali allowlist hostname di `track.js` diubah. Fitur membaca tidak bergantung pada layanan analitik; kegagalan pengiriman analitik tidak menghentikan aplikasi.

## Struktur repositori

| Jalur | Isi |
| --- | --- |
| `index.html` | Dokumen aplikasi, gaya, struktur halaman, dan dialog/panel. |
| `app.js` | Inisialisasi aplikasi, pembacaan, navigasi, pengaturan, dan penghubung antarmodul. |
| `gulir.html`, `gulir.css`, `gulir.js` | Mode Gulir Ayat dan antarmuka feed/belajar/progres. |
| `gulir-data.js`, `gulir-state.js`, `gulir-tafsir.js` | Data konteks/akar, state lokal tervalidasi, dan adapter sumber tafsir. |
| `tafsir/` | Dua sumber tafsir lokal per surah beserta provenance dan ketentuannya. |
| `equran.js` | Adapter EQuran.id v2, validasi respons/audio, dan cache API di IndexedDB. |
| `ibadah.js` | Adapter pencarian semantik, doa/dzikir, jadwal sholat, dan cache data API Islam. |
| `hadith-tafsir.js` | Fitur Hadis/Tafsir, pencarian edisi Indonesia lokal, validasi respons, serta cache IndexedDB. |
| `API_SOURCES.md` | Sumber, endpoint, bahasa edisi, keterbatasan, dan catatan penggunaan API Hadis/Tafsir. |
| `worker.js` | Entry point pass-through untuk Cloudflare Workers Static Assets. |
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
