# Changelog

Perubahan penting pada Quran Oyen dicatat di sini.

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
