# Sumber API Hadis dan Tafsir

Dokumen ini mencatat pilihan sumber untuk fitur Hadis/Tafsir Quran Oyen, endpoint yang dipakai, dan batas yang diketahui. Respons layanan dapat berubah; dokumentasi resmi tetap menjadi rujukan terbaru.

## Tafsir Al-Qur'an: EQuran.id API v2

Quran Oyen menggunakan endpoint `GET https://equran.id/api/v2/tafsir/{nomor-surat}` untuk mengambil kumpulan tafsir per ayat dalam satu surat. Endpoint ini melengkapi pembaca tafsir yang sudah ada; pintasan baru memungkinkan pengguna memilih dan membuka tafsir lengkap dari masing-masing 114 surat. Respons, termasuk tafsir yang pernah dibuka, disimpan di cache perangkat melalui IndexedDB.

- Dokumentasi: <https://equran.id/apidev/v2>
- Contoh respons tafsir: <https://equran.id/api/v2/tafsir/1>
- Ketentuan layanan: <https://equran.id/terms>

API tidak membutuhkan akun atau API key untuk pemakaian wajar. Ketentuan EQuran.id menyebut rate limiting, atribusi EQuran.id, larangan menjual data, dan hak cipta terjemahan, tafsir, audio, serta fitur aplikasinya. Karena itu aplikasi menautkan sumber dan tidak menyajikan tafsir sebagai fatwa atau pengganti bimbingan ahli.

## Hadis: Fawaz Hadith API melalui jsDelivr

Aplikasi mematok rute CDN ke versi `@1`, lalu mengambil teks per nomor atau satu edisi lengkap hanya ketika pengguna memilih pencarian Indonesia pada kitab tersebut. Edisi Arab tersedia untuk 10 koleksi; katalog versi `1` menyediakan edisi Indonesia yang teridentifikasi untuk tujuh koleksi: Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah, dan Malik. Koleksi Nawawi, Hadis Qudsi, dan Shah Waliullah ditampilkan dengan Arab/Inggris bila sumber tersebut tersedia, tanpa mengklaim ada terjemahan Indonesia.

- Repositori dan petunjuk endpoint: <https://github.com/fawazahmed0/hadith-api>
- Katalog edisi: <https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions.min.json>
- Contoh Arab: <https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ara-bukhari/1.min.json>
- Contoh Indonesia: <https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/ind-bukhari/1.min.json>
- Lisensi repositori: <https://github.com/fawazahmed0/hadith-api/blob/1/LICENSE>
- Referensi sumber koleksi: <https://github.com/fawazahmed0/hadith-api/blob/1/References.md>

Repositori menyatakan lisensi Unlicense dan README menyarankan fallback CDN. Aplikasi memakai teks sebagaimana dikirim, menampilkan nama kitab/nomor dan tautan sumber, serta memakai mirror `fastly.jsdelivr.net` bila host utama gagal. Pencarian Indonesia mengunduh edisi lengkap kitab yang dipilih untuk pencarian lokal di perangkat; kueri tidak dikirim ke server pencarian. Isi kompilasi mencantumkan beragam rujukan, sehingga provenance setiap terjemahan/edisi tetap perlu diperlakukan terpisah dan belum diaudit secara ilmiah.

## Pencarian Hadis lintas koleksi: UmmahAPI

UmmahAPI dipakai sebagai fitur tambahan untuk pencarian teks Inggris lintas 10 koleksi, serta teks Arab/Inggris dan grade pada detail bila tersedia. Endpoint baca yang dipakai tanpa kredensial: `GET https://ummahapi.com/api/hadith/search?q=...&limit=25` dan `GET https://ummahapi.com/api/hadith/{collection}/{nomor}`. Dokumentasinya menyebut batas 100 permintaan per menit tanpa API key; permintaan kata pencarian global dikirim ke UmmahAPI. Pengguna perlu memilih pencarian Indonesia lokal jika ingin kata kunci Indonesia.

- Dokumentasi: <https://ummahapi.com/api/docs>
- Ringkasan Hadith API: <https://ummahapi.com/hadith-api>
- Daftar koleksi live: <https://ummahapi.com/api/hadith/collections>
- Contoh pencarian: <https://ummahapi.com/api/hadith/search?q=prayer&limit=5>

Saat diperiksa, daftar koleksi menyebut sumber `fawazahmed0/hadith-api` melalui jsDelivr. Header CORS wildcard dan respons JSON berhasil diuji dari origin Quran Oyen. Batas 100/menit berasal dari dokumentasi UmmahAPI, bukan SLA uptime. API ini tidak menjadi sumber terjemahan Indonesia; terjemahan Indonesia diambil langsung dari edisi Fawaz.

## Alternatif yang tidak dipakai

- **Hadith API by gading.dev:** praktis dan menyebut sembilan koleksi dengan Arab/Indonesia, tetapi host publik mengalami kegagalan TLS saat riset dan repositori tidak memisahkan lisensi kumpulan data dari lisensi kode MIT. Tidak dijadikan dependensi produksi. Rujukan: <https://github.com/gadingnst/hadith-api>.
- **UmmahAPI Tafsir:** tersedia tanpa API key, tetapi endpoint yang diperiksa hanya mencantumkan tafsir berbahasa Inggris/Arab; ketentuan penggunaan ulang teks tidak ditemukan. Tidak dipakai sebagai sumber tafsir Quran Oyen. Rujukan: <https://ummahapi.com/tafsir-api> dan <https://ummahapi.com/api/tafsir>.
- **QuranEnc:** punya tiga edisi terjemahan Indonesia dan teks Arab per ayat, tetapi dokumentasi API yang diverifikasi tidak menunjukkan endpoint tafsir terpisah. Syaratnya meminta teks tidak diubah serta menyebut penerbit, sumber, dan versi. Rujukan: <https://quranenc.com/en/home/api>.
- **Quran Foundation Content API:** cakupannya luas, tetapi akses produksi memerlukan registrasi aplikasi, OAuth2, persetujuan, dan proxy backend; sumber tafsir Indonesia belum terbukti pada katalog yang diperiksa. Rujukan: <https://api-docs.quran.foundation/docs/quickstart/> dan <https://api-docs.quran.foundation/legal/developer-terms/>.

## Catatan verifikasi

CORS dan respons JSON telah diuji untuk endpoint yang digunakan. Hal itu bukan jaminan uptime. Nomor hadis, varian teks, provenance terjemahan, dan penilaian derajat perlu diverifikasi terhadap edisi ilmiah yang ditetapkan sebelum digunakan sebagai rujukan hukum atau fatwa. Fitur ini menampilkan sumber/nomor dan hanya menampilkan grade ketika API menyediakannya; teks/grade dari API tidak menggantikan pemeriksaan oleh ahli.
