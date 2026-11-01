# Changelog

Perubahan penting pada Quran Oyen dicatat di sini.

## 2 November 2026 — Gulir dan ganti ayat lebih andal

- **Navigasi:** Feed memuat pilihan berikutnya menjelang akhir guliran. Tombol panah maju/mundur membantu berpindah ayat, termasuk dari teks panjang; fokus keyboard di ujung teks dapat melanjutkan ke kartu berikutnya.
- **Refresh:** Ikon Ganti ayat dan tarik-ke-bawah di awal Beranda menyiapkan pilihan baru tanpa memuat ulang seluruh halaman. Beranda biasa diacak saat dibuka ulang, tetapi tautan ayat tetap mempertahankan referensi dan rangkaian konteksnya.
- **Pemulihan:** Indikator memuat dan tombol coba lagi tidak menghapus bacaan lama ketika permintaan gagal. Simpanan, progres, preferensi, serta rancangan Story tidak direset oleh refresh.
- **Offline:** Daftar surah lengkap di cache ditemukan kembali setelah reload; pemilihan tidak lagi menganggap surah yang dimuat di sesi aktif sebagai satu-satunya unduhan yang tersedia.
- **Pengembang:** Jalankan tes Node di `tools/test_*.mjs`, `python3 tools/stamp_sw.py`, `tools/test_gulir_browser.py`, dan `tools/test_gulir_feed_browser.py` sebelum deploy.

## 2 November 2026 — Rancangan Story dapat dibuka kembali

- **Peningkatan:** Simpan hingga 20 rancangan Story ke Pustaka, lalu buka kembali setelah halaman atau aplikasi dimuat ulang.
- **Pemulihan:** Tema dan pilihan transliterasi ikut disimpan; gambar dirender ulang dari ayat lokal agar tidak memenuhi penyimpanan dengan file PNG besar.
- **Privasi/offline:** Rancangan tersimpan hanya di browser perangkat. Ayat dapat dibuat ulang offline jika datanya sudah tersedia di cache.
- **Pengembang:** Jalankan `node --test tools/test_story_drafts.mjs` dan tes browser Gulir sebelum deploy.

## 1 November 2026 — Kartu Story untuk ayat

- **Peningkatan:** Menu Bagikan membuat kartu PNG 9:16 dengan tiga tema, transliterasi opsional, dan pembagian otomatis menjadi beberapa kartu untuk ayat panjang.
- **Berbagi:** Gambar dapat dikirim lewat menu berbagi perangkat bila didukung, atau diunduh lalu diunggah manual ke Instagram Story/WhatsApp Status. Teks dan tautan ayat tetap tersedia terpisah.
- **Atribusi:** Kartu mencantumkan sumber teks dan terjemahan; tautan langsung tetap berada pada caption/teks berbagi.

## 31 Oktober 2026 — Simpanan Hadis

- **Peningkatan:** Hadis dapat disimpan dari detail atau hasil pencarian; hingga 50 teks tersimpan di perangkat dan dapat dibuka kembali tanpa koneksi.
- **Privasi:** Simpanan tidak disinkronkan ke akun. Daftar dilindungi dari data rusak, referensi ganda, dan teks berukuran tidak wajar.
- **Pengembang:** Jalankan `node --test tools/test_hadith_tafsir.mjs` serta `python3 tools/stamp_sw.py` sebelum deploy.

## 31 Oktober 2026 — Hadis dan tafsir lengkap

- **Fitur baru:** Panel Hadis menyediakan teks Arab/Indonesia menurut kitab dan nomor, pencarian lokal Indonesia pada tujuh edisi, serta pencarian lintas koleksi berbasis teks Inggris.
- **Fitur baru:** Tafsir EQuran.id untuk seluruh 114 surat dapat dibuka langsung dari panel Hadis/Tafsir; fitur ini memakai pembaca tafsir per ayat yang sudah ada.
- **Privasi dan offline:** Pencarian Indonesia berlangsung di perangkat sesudah satu edisi diunduh; pencarian global Inggris mengirim kueri ke UmmahAPI. Respons hadis/edisi yang pernah diminta disimpan di IndexedDB.
- **Pengembang:** Jalankan tes `node --test tools/test_hadith_tafsir.mjs` dan `python3 tools/stamp_sw.py` sebelum deploy agar modul baru masuk cache PWA.
- **Perbaikan:** HTML PWA lama tetap bisa membuka pembaca dan kontrol pembaruan ketika script baru diterima; label cakupan pencarian mengikuti nilai opsi, bukan urutan opsi.

## 31 Oktober 2026 — Pencarian makna, doa, dan jadwal sholat

- **Fitur baru:** Pencarian semantik EQuran.id dapat mencari ayat dan tafsir, menampilkan teks Arab/Latin bila tersedia, lalu membuka ayat, tafsir terfokus, atau audio ayat.
- **Fitur baru:** Katalog doa dan dzikir dapat dicari serta disaring per kategori; kartu bacaan menampilkan Arab, transliterasi Latin, arti, tag, dan keterangan.
- **Fitur baru:** Jadwal sholat menampilkan waktu hari ini serta kalender bulanan setelah lokasi dipilih manual; data dan pilihan lokasi disimpan lokal untuk mendukung pemakaian kembali.
- **Pengembang:** Tambahkan modul `ibadah.js` ke cache publik dengan menjalankan `python3 tools/stamp_sw.py` sebelum deploy.

## 31 Oktober 2026 — Audio dan tafsir per ayat

- **Peningkatan:** Entri tafsir kini dapat langsung memutar audio ayat atau membuka ayat terkait di pembaca.
- **Peningkatan:** Panel tafsir menampilkan konteks surat, pencarian tafsir/nomor ayat, dan tata letak kartu yang lebih nyaman di ponsel.
- **Peningkatan:** Kontrol audio dan teks status lebih responsif, dengan pemilihan qari, putar per ayat, dan lanjut otomatis yang tetap tersedia.

## 30 Oktober 2026 — PWA dan akses offline

- **Perbaikan:** Service worker kini mengambil halaman utama melalui URL kanonis agar shell aplikasi tetap dapat dipasang ke cache offline ketika Cloudflare mengarahkan URL berkas HTML ke beranda.
- **Peningkatan:** Status penyimpanan offline menampilkan kemajuan serta data yang sudah tersimpan sebagian. Jika unduhan gagal, berkas yang telah tersimpan dipertahankan agar pengguna dapat mencoba lagi.
- **Peningkatan:** Informasi ukuran unduhan (sekitar 3,5 MB) dan ruang lokal yang diperlukan (sekitar 12 MB) diperjelas untuk seluruh 114 surah dan terjemahan bahasa Indonesia.
- **Pengembang:** Jalankan `python3 tools/stamp_sw.py` sebelum deploy untuk memperbarui hash aset dan penanda versi cache pada service worker.
