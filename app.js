// Quran Word by Word. The data (data/*.json) is the Tanzil text, the Quranic Arabic Corpus's roots and forms, and
// published word-by-word meanings; layout.js holds the Handwired networks that place and move everything. This file
// measures words, feeds the networks, and writes what they compute to the page.
import { buildAyah, buildStack, buildZoom, createMachine, layoutReference, quarter } from './layout.js?v=9b5457c';
import { createSearchSheet, queryOf, searchStrings, TRY } from './search-sheet.js?v=9b5457c';
import { createDots, dotsText, rootOrder } from './dots.js?v=9b5457c';
import { createSheets, edgeBack } from './sheet.js?v=9b5457c';
import { faceSVG, MOODS } from './vendor/oyen-face-d00ce3e/oyen-face.js';
// The mind map (map.js, with the GPU finder), same count (same-count.js) and the search engine (search.js) load the
// first time they are used, so the first screen downloads only what it shows. dots.js (ayah dots) is small and its
// words label the home, so it comes with the page.
import { createNetworkPanel, networkText } from './network.js?v=9b5457c';
import * as track from './track.js?v=9b5457c';
import { audioForQari, getEquranSurah, getEquranSurahs, getEquranTafsir, QARIS } from './equran.js';
import { createIbadahFeatures } from './ibadah.js?v=20261031';
import { createIlmFeatures } from './hadith-tafsir.js?v=20261031-hadith-5';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const num = (n) => new Intl.NumberFormat('en-US').format(n);
const arabicDigits = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`qwbw.${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`qwbw.${key}`, JSON.stringify(value)); } catch {} },
};
const validQari = (value) => QARIS.some((qari) => qari.id === value);

// ---------- settings ----------

const SIZES = [22, 26, 30, 34, 40];
const settings = {
  lang: store.get('lang', 'id') === 'en' ? 'en' : 'id',
  size: Math.min(SIZES.length - 1, Math.max(0, store.get('size', innerWidth < 600 ? 1 : 2))),
  // Where a map's search runs: on the visitor's own device (its GPU, or its CPU without WebGPU), or on our DGX Spark.
  where: 'device',
  // The Kemenag translation under each ayah in the ID view; it can be turned off in Aa.
  trans: store.get('trans', true) !== false,
  qari: validQari(store.get('qari', '01')) ? store.get('qari', '01') : '01',
};
const fontSize = () => SIZES[settings.size];

// ---------- data ----------

let index = [];
let equranCatalog = null;
let equranCatalogPromise = null;
let equranCatalogCached = false;
let audioUI = null;
let ibadahUI = null;
let ilmUI = null;
let tafsirRequest = 0;
// Resolved once start() has data/index.json, for views that can be opened from the home before it arrives.
let markIndexReady;
const indexReady = new Promise((resolve) => { markIndexReady = resolve; });
// Filled in place once data/roots.json arrives, so every module handed `roots` sees it.
const roots = [];
let rootsFile = null;
const loadRoots = () => (rootsFile ??= loadJson('data/roots.json').then((r) => { if (!roots.length) roots.push(...r); }).catch((e) => { rootsFile = null; throw e; }));
// The Quran font, asked for at once: words are measured in it, so a surah waits for it before its first layout.
const fontReady = document.fonts?.load('30px "Amiri Quran"', 'بِسْمِ ٱللَّهِ').catch(() => {}) ?? Promise.resolve();
const surahFiles = new Map();
const pad3 = (n) => String(n).padStart(3, '0');
const loadJson = async (path) => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
};
const loadSurah = (n) => {
  if (!surahFiles.has(n)) surahFiles.set(n, loadJson(`data/s${pad3(n)}.json`).catch((e) => { surahFiles.delete(n); throw e; }));
  return surahFiles.get(n);
};
// The Indonesian translation of each ayah (Kemenag, from Tanzil; data/SOURCES.md), only for the ID view.
const transFiles = new Map();
const loadTrans = (n) => {
  if (!transFiles.has(n)) transFiles.set(n, loadJson(`data/id/t${pad3(n)}.json`).catch((e) => { transFiles.delete(n); throw e; }));
  return transFiles.get(n);
};
// The word table (data/words.bin): every word's root id and base-form id in reading order, for the root finder and
// the search.
let tableFile = null;
const wordTable = () => (tableFile ??= fetch('data/words.bin')
  .then((r) => { if (!r.ok) throw new Error(`data/words.bin: ${r.status}`); return r.arrayBuffer(); })
  .then((bin) => {
    const count = new Uint32Array(bin, 0, 1)[0];
    return { bin, root: new Uint16Array(bin, 8, count), lemma: new Uint16Array(bin, 8 + count * 2, count) };
  })
  .catch((e) => { tableFile = null; throw e; }));
// Every ayah's Indonesian translation in one file, in reading order, for the search (built from data/id).
let idTexts = null;
const loadIdTexts = () => (idTexts ??= loadJson('data/search-id.json').catch(() => { idTexts = null; return null; }));
// A word: [arabic, rootId, lemma, pos, id, en, translit, mark]
// A word as Tanzil writes it: ۞ before it, pause marks and ۩ after it (data/SOURCES.md).
const prefixOf = (w) => (w[7] && w[7].startsWith('۞') ? '۞' : '');
const suffixOf = (w) => (w[7] ? w[7].replace(/^۞/, '') : '');
const shownWord = (w) => [prefixOf(w), w[0], suffixOf(w)].filter(Boolean).join(' ');
const wordText = (w) => [prefixOf(w) ? `${prefixOf(w)} ` : '', w[0], suffixOf(w) ? ` ${suffixOf(w)}` : ''];
const meaningOf = (w) => (settings.lang === 'en' ? w[5] || w[4] : w[4] || w[5]) || '';
const surahMeaning = (s) => (settings.lang === 'id' && s.id) || s.en || '';
const placeName = (s) => (settings.lang === 'id' ? { Makkah: 'Makkiyah', Madinah: 'Madaniyah' }[s.place] ?? s.place : s.place);

const POS = {
  N: ['Noun', 'Kata benda'], PN: ['Proper noun', 'Nama diri'], ADJ: ['Adjective', 'Kata sifat'], V: ['Verb', 'Kata kerja'],
  PRON: ['Pronoun', 'Kata ganti'], DEM: ['Demonstrative', 'Kata tunjuk'], REL: ['Relative pronoun', 'Kata ganti penghubung'],
  T: ['Adverb of time', 'Keterangan waktu'], LOC: ['Adverb of place', 'Keterangan tempat'], P: ['Preposition', 'Kata depan'],
  NEG: ['Negative particle', 'Partikel penyangkal'], INL: ['Quranic initials', 'Huruf muqattaʿah'], CONJ: ['Conjunction', 'Kata hubung'],
  IMPN: ['Imperative verbal noun', 'Kata benda perintah'],
};
const posName = (tag) => (POS[tag] ?? ['Particle', 'Partikel'])[settings.lang === 'en' ? 0 : 1];
const T = {
  en: { whereLabel: 'Root maps are computed on', whereDeviceNote: 'your phone or laptop: its own GPU (WebGPU), or its CPU', whereSparkNote: 'the NVIDIA GB10 on our DGX Spark in Jakarta, about 50 ms away', whereDevice: 'This device', whereSpark: 'Our GPU', mapSpark: 'Computed on our GPU', mapOnGpu: 'on the GPU', mapRoundTrip: 'there and back', mapSparkFailed: 'Our GPU did not answer', mapLooking: 'Looking through all 6,236 ayat…', mapFailed: 'The map could not be grown', mapGpuFailed: 'Your GPU did not answer', mapCpuShort: 'Found on the CPU instead', ayahWord: 'Ayah', linksTitle: 'shares the most roots with', linksNone: 'No other ayah shares a root with this one.', grow: 'Grow the map', map: 'Map', mapWords: 'words', mapSurahs: 'surahs', mapGpu: 'Found on your GPU', mapChecked: 'all 6,236 ayat checked in', mapCpu: 'Found on this device’s CPU: this browser has no WebGPU (Safari 26 and Chrome have it)', mapFirst: 'First', mapLast: 'Last:', mapOpen: 'Open this ayah', mapLinked: 'Shares the most roots with', loadFailed: 'This surah could not be loaded. Check your connection and try again.', title: 'The Quran, word by word', intro: 'Every word with its root, its form and its meaning. Tap a word to open it; tap a root letter to light every word of that root. The layout and every movement are computed by a small Handwired network, right in this page.', surahs: '‹ Surahs', ayat: 'ayat', root: 'Root', lemma: 'Base form', type: 'Type', withRoot: 'With this root', inQuran: 'in the Quran', inSurah: 'in this surah', light: 'Light up this root', lit: 'Root lit', close: 'Close' },
  id: { whereLabel: 'Peta akar dihitung di', whereDeviceNote: 'ponsel atau laptopmu: GPU-nya sendiri (WebGPU), atau CPU-nya', whereSparkNote: 'NVIDIA GB10 di DGX Spark kami di Jakarta, sekitar 50 ms jauhnya', whereDevice: 'Perangkatmu', whereSpark: 'GPU kami', mapSpark: 'Dihitung di GPU kami', mapOnGpu: 'di GPU', mapRoundTrip: 'pulang-pergi', mapSparkFailed: 'GPU kami tidak menjawab', mapLooking: 'Memeriksa ke-6.236 ayat…', mapFailed: 'Peta belum bisa ditumbuhkan', mapGpuFailed: 'GPU-mu tidak menjawab', mapCpuShort: 'Dicari di CPU sebagai gantinya', ayahWord: 'Ayat', linksTitle: 'paling banyak berbagi akar dengan', linksNone: 'Tidak ada ayat lain yang berbagi akar dengan ayat ini.', grow: 'Tumbuhkan peta', map: 'Peta', mapWords: 'kata', mapSurahs: 'surah', mapGpu: 'Dicari di GPU-mu', mapChecked: 'ke-6.236 ayat diperiksa dalam', mapCpu: 'Dicari di CPU perangkat ini: browser ini belum punya WebGPU (Safari 26 dan Chrome sudah punya)', mapFirst: 'Pertama', mapLast: 'Terakhir:', mapOpen: 'Buka ayat ini', mapLinked: 'Paling banyak berbagi akar dengan', loadFailed: 'Surah ini belum bisa dimuat. Periksa koneksi lalu coba lagi.', noIndonesian: 'Terjemahan per ayat: Kementerian Agama RI, dari Tanzil. Makna per kata masih dalam bahasa Inggris, dari Quranic Arabic Corpus; terjemah per kata bahasa Indonesia belum tersedia.', title: 'Al-Qur’an, kata demi kata', intro: 'Setiap kata dengan akar, bentuk, dan maknanya. Ketuk sebuah kata untuk membukanya; ketuk huruf akarnya untuk menyalakan semua kata dari akar yang sama. Tata letak dan setiap gerakannya dihitung oleh jaringan Handwired kecil, langsung di halaman ini.', surahs: '‹ Surah', ayat: 'ayat', root: 'Akar kata', lemma: 'Bentuk dasar', type: 'Jenis', withRoot: 'Dengan akar ini', inQuran: 'di Al-Qur’an', inSurah: 'di surah ini', light: 'Nyalakan akar ini', lit: 'Akar menyala', close: 'Tutup' },
};
// The phone app's own words: the home, the tabs, Aa, reading offline and installing.
Object.assign(T.en, {
  back: 'Surahs', backLabel: 'Back to the surahs', homeTitle: 'Al-Qur’an', homeSub: 'Word by word · 114 surahs',
  hi: ['Good morning', 'Good afternoon', 'Good evening', 'Good evening'], continueHi: 'continue reading', continueGo: 'Continue',
  startHi: 'Assalamu’alaikum', startWhat: (name) => `Start with ${name}`, startPos: 'Tap any word for its root and meaning', startGo: 'Open',
  ayahOf: (a, n) => `Ayah ${a} of ${n}`, popular: 'Read often', allSurahs: 'All surahs', sameTitle: 'Words with the same count', sameSub: 'Adam and Isa: 25 times each',
  tabHome: 'Al-Qur’an', tabSearch: 'Search', tabSame: 'Same count', tabAa: 'Settings', menu: 'Menu', aa: 'Display and reading', done: 'Done',
  size: 'Text size', smaller: 'Smaller text', larger: 'Larger text', langLabel: 'Language', trLabel: 'Ayah translation', trNote: 'Kemenag, in the Indonesian view',
  offlineLabel: 'Read offline', offlineNote: 'All 114 surahs & Indonesian translations · ~3.5 MB download, ~12 MB storage', offlinePartial: (n, total) => `${n}/${total} data files saved · ~3.5 MB download, ~12 MB storage`, offlineGo: 'Download', offlineBusy: (p) => `Saving… ${p}%`, offlineDone: 'Saved on this phone',
  offlineFail: 'Not finished. Try again online; saved files will be kept.', offlineStop: { changed: 'A newer version just arrived. Open the app again, then download.', quota: 'This phone is out of space for it.', storage: 'This browser is not letting the site keep files (a private window?).', off: 'Saving offline is paused for now.' }, offlineNoWorker: 'Open this site in Safari or Chrome to save it offline.',
  installLabel: 'Add to Home Screen', installTitle: 'Add Quran Oyen to your Home Screen', installText: 'It opens like an app, and the surahs you have opened stay readable without internet.',
  installSteps: ['Tap the Share button', 'Choose Add to Home Screen', 'Tap Add'], inAppTitle: 'Open it in your browser first', inAppText: 'The browser inside this app can’t add Quran Oyen to your Home Screen. Open its menu and choose Open in browser.',
  later: 'Later', mapCpuPlain: 'Found on this device', mapSparkDown: 'Our GPU did not answer, so it was found on this device',
  hintTitle: 'Tap a word', hintSub: 'See its root, form and meaning.', hintOk: 'OK',
  endTitle: (name) => `${name}, done`, endText: (n) => `${n} ayat · kept as your last reading`, endNext: (name) => `Next: ${name} ›`, endHome: 'Back to the surahs',
  doneHi: (name) => `${name} done`, nextGo: 'Open',
  nudgeTitle: 'Add Quran Oyen', nudgeSub: 'Opens like an app and reads offline', nudgeGo: 'Add', nudgeClose: 'Not now',
});
Object.assign(T.id, {
  back: 'Surah', backLabel: 'Kembali ke daftar surah', homeTitle: 'Al-Qur’an', homeSub: 'Kata demi kata · 114 surah',
  hi: ['Selamat pagi', 'Selamat siang', 'Selamat sore', 'Selamat malam'], continueHi: 'lanjut membaca', continueGo: 'Lanjutkan',
  startHi: 'Assalamu’alaikum', startWhat: (name) => `Mulai dari ${name}`, startPos: 'Ketuk kata mana saja untuk melihat akar dan maknanya', startGo: 'Buka',
  ayahOf: (a, n) => `Ayat ${a} dari ${n}`, popular: 'Sering dibaca', allSurahs: 'Semua surah', sameTitle: 'Kata dengan jumlah sama', sameSub: 'Adam dan Isa sama-sama 25 kali',
  tabHome: 'Al-Qur’an', tabSearch: 'Cari', tabSame: 'Jumlah sama', tabAa: 'Pengaturan', menu: 'Menu', aa: 'Tampilan & bacaan', done: 'Selesai',
  size: 'Ukuran huruf', smaller: 'Huruf lebih kecil', larger: 'Huruf lebih besar', langLabel: 'Bahasa', trLabel: 'Terjemahan ayat', trNote: 'Kementerian Agama RI',
  offlineLabel: 'Baca tanpa internet', offlineNote: 'Semua 114 surah + terjemahan · unduh ±3,5 MB; ruang ±12 MB', offlinePartial: (n, total) => `${n}/${total} berkas data tersimpan · unduh ±3,5 MB; ruang ±12 MB`, offlineGo: 'Unduh', offlineBusy: (p) => `Menyimpan… ${p}%`, offlineDone: 'Tersimpan di ponsel ini',
  offlineFail: 'Belum selesai. Coba lagi saat online; berkas yang tersimpan tetap ada.', offlineStop: { changed: 'Versi baru baru saja tiba. Buka lagi aplikasinya, lalu unduh.', quota: 'Ruang penyimpanan ponsel ini tidak cukup.', storage: 'Browser ini tidak mengizinkan situs menyimpan file (jendela pribadi?).', off: 'Penyimpanan offline sedang dijeda.' }, offlineNoWorker: 'Buka situs ini di Safari atau Chrome agar dapat disimpan untuk dibaca tanpa internet.',
  installLabel: 'Pasang di layar utama', installTitle: 'Pasang Quran Oyen', installText: 'Buka dari layar utama seperti aplikasi, dan surah yang sudah dibuka tetap bisa dibaca tanpa internet.',
  installSteps: ['Ketuk tombol Bagikan', 'Pilih Tambah ke Layar Utama', 'Ketuk Tambah'], inAppTitle: 'Buka di browser dulu', inAppText: 'Browser di dalam aplikasi ini belum bisa memasang Quran Oyen. Buka menunya, lalu pilih Buka di browser.',
  later: 'Nanti saja', mapCpuPlain: 'Dicari di perangkat ini', mapSparkDown: 'GPU kami tidak menjawab, jadi dicari di perangkat ini',
  hintTitle: 'Ketuk sebuah kata', hintSub: 'Lihat akar, bentuk, dan maknanya.', hintOk: 'Oke',
  endTitle: (name) => `${name} selesai`, endText: (n) => `${n} ayat · tersimpan sebagai bacaan terakhir`, endNext: (name) => `Lanjut: ${name} ›`, endHome: 'Kembali ke daftar surah',
  doneHi: (name) => `${name} selesai`, nextGo: 'Buka',
  nudgeTitle: 'Pasang Quran Oyen', nudgeSub: 'Buka seperti aplikasi, baca tanpa internet', nudgeGo: 'Pasang', nudgeClose: 'Nanti saja',
});
const t = (key) => T[settings.lang][key];
// How many words in the Quran carry a root, counted in the page's own files (roots.json `w`).
const rootWords = (id) => roots[id - 1]?.w ?? roots[id - 1]?.n ?? 0;
const hasIndonesian = (data) => data.ayat.some((words) => words.some((w) => w[4]));

// ---------- measuring words ----------

const ctx = document.createElement('canvas').getContext('2d');
const AR_FONT = (fs) => `${fs}px "Amiri Quran", "Amiri", "Noto Naskh Arabic", serif`;
const MEANING_FONT = '400 12.5px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const PAD = 6;
const MAX_MEANING = 190;
const geometry = () => {
  const fs = fontSize();
  // Amiri Quran's marks reach 1.42 em above the baseline and 0.89 em below it (measured over 9,662 words, from
  // ٱلرَّٰكِعِينَ to مُّسْتَقِيمٍ). Its own line box puts the baseline 1.82 em down, so the line is 2.41 em tall and the
  // glyphs are lifted 0.33 em (.tile .w), which leaves every mark inside the line, clear of the meaning.
  const arLine = Math.round(fs * 2.41);
  const tile = arLine + 16 + 8;
  return { fs, arLine, tile, lineHeight: tile + 6, gap: 4, badge: Math.round(fs * 1.1) };
};
// Measuring text is the slow part of a relayout, so every distinct word and meaning is measured once per size and
// remembered: a switch back to a size or a language costs nothing.
const arabicWidths = new Map();
const meaningWidths = new Map();
function measured(cache, key, font, text) {
  let width = cache.get(key);
  if (width === undefined) {
    ctx.font = font;
    width = ctx.measureText(text).width;
    cache.set(key, width);
  }
  return width;
}
// The translation under an ayah is broken into lines here, with the same measure as the words, and each line is
// drawn as it was broken, so the height the stack gets is the height the page shows.
const TRANS_FONT = '400 15px "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const TRANS = { line: 24, top: 2, bottom: 8 };
const transWidths = new Map();
function transLines(text, width) {
  const space = measured(transWidths, ' ', TRANS_FONT, ' ');
  const lines = [];
  let line = '';
  let used = 0;
  for (const word of text.split(' ')) {
    const w = measured(transWidths, word, TRANS_FONT, word);
    if (line && used + space + w > width) { lines.push(line); line = ''; used = 0; }
    line = line ? `${line} ${word}` : word;
    used = used ? used + space + w : w;
  }
  if (line) lines.push(line);
  return lines;
}
const showsTrans = () => settings.lang === 'id' && settings.trans && !!view?.trans;
function layoutTrans(ay, lineWidth) {
  const key = showsTrans() ? lineWidth : 0;
  if (ay.transKey === key) return;
  ay.transKey = key;
  ay.trans = key ? transLines(view.trans.ayat[ay.a] ?? '', lineWidth - 2 * PAD - 2) : null;
  ay.transH = ay.trans?.length ? TRANS.top + ay.trans.length * TRANS.line + TRANS.bottom : 0;
}
function tileWidth(w, g) {
  const word = shownWord(w);
  const arabic = measured(arabicWidths, `${g.fs}|${word}`, AR_FONT(g.fs), word);
  const text = meaningOf(w);
  const meaning = Math.min(MAX_MEANING, measured(meaningWidths, text, MEANING_FONT, text));
  return quarter(Math.ceil(Math.max(arabic, meaning)) + 2 * PAD);
}

// ---------- the networks ----------

const AYAH_SIZES = [16, 32, 64, 160];
const STACK_SIZES = [8, 32, 128, 288];
const programs = new Map();
const program = (kind, size) => {
  const key = `${kind}${size}`;
  if (!programs.has(key)) programs.set(key, kind === 'ayah' ? buildAyah(size) : kind === 'stack' ? buildStack(size) : buildZoom());
  return programs.get(key);
};
const sizeFor = (sizes, n) => sizes.find((s) => s >= n) ?? sizes[sizes.length - 1];

// ---------- the index ----------

function renderIndex() {
  $('surahs').replaceChildren(...index.map((s) => {
    const b = el('button', { type: 'button', className: 'surah' },
      el('span', { className: 'num', textContent: s.n }),
      el('span', { className: 'latin', textContent: s.latin }),
      el('span', { className: 'ar', textContent: s.ar, lang: 'ar' }),
      el('span', { className: 'meta', textContent: `${surahMeaning(s)} · ${s.ayat} ${t('ayat')} · ${placeName(s)}` }));
    b.onclick = () => openSurah(s.n, b);
    return el('li', {}, b);
  }));
}

// ---------- a surah ----------

let view = null; // the open surah
let frameId = 0;
const schedule = () => { frameId ||= requestAnimationFrame(frame); };

let opening = 0;
let openTicket = 0;
let pendingOpen = null;
async function openSurah(n, from, then) {
  if (!index[n - 1]) return;
  // A surah picked while another is still loading replaces it: the older open stops at its ticket check.
  if (opening) {
    pendingOpen = { n, then };
    openTicket++;
    return;
  }
  opening = n;
  const ticket = ++openTicket;
  try {
    await openSurahNow(n, from, ticket);
    if (ticket === openTicket && view?.n === n) {
      then?.();
      if (!then) setTimeout(showHint, 700);
    }
  } finally {
    opening = 0;
    if (pendingOpen) {
      const next = pendingOpen;
      pendingOpen = null;
      if (view?.n !== next.n) { closeSurah(true); openSurah(next.n, null, next.then); }
    }
  }
}
async function openSurahNow(n, from, ticket) {
  const meta = index[n - 1];
  if (location.hash !== `#s${n}`) location.hash = `s${n}`;
  const dataReady = loadSurah(n);
  const transReady = settings.lang === 'id' ? loadTrans(n).catch(() => null) : null;
  let zoomTo = null;
  let data;
  try {
    zoomTo = await zoomOpen(from);
    data = await dataReady;
    await Promise.all([loadRoots(), fontReady]);
  } catch {
    zoomTo?.();
    if (location.hash === `#s${n}`) history.replaceState(null, '', location.pathname + location.search);
    toast(t('loadFailed'));
    return;
  }
  const trans = transReady ? await transReady : null;
  if (ticket !== openTicket) { zoomTo?.(); return; }
  audioUI?.player.pause();
  const g = geometry();
  $('index-view').hidden = true;
  $('reader-view').hidden = false;
  document.body.classList.add('reading');
  $('back').hidden = false;
  $('brand').hidden = true;
  setWhere(meta);
  track.view(`/surah/${n}`, meta.latin);
  showBar(true);
  scrollTo(0, 0);

  const head = $('sheet-head');
  head.replaceChildren(
    el('div', { className: 'ar', textContent: meta.ar, lang: 'ar' }),
    el('div', { className: 'latin', textContent: `${meta.n}. ${meta.latin}` }),
    el('div', { className: 'meaning', id: 'head-meaning', textContent: surahMeaning(meta) }),
    el('div', { className: 'label facts', id: 'head-facts', textContent: `${meta.ayat} ${t('ayat')} · ${placeName(meta)}` }));
  // Each surah's own basmala from its file (95 and 97 have their own spelling); Al-Fatihah's is its first ayah.
  if (data.basmala) head.append(el('div', { className: 'basmala', textContent: data.basmala, lang: 'ar' }));
  audioUI = createReaderTools(n);
  head.append(audioUI.node);
  if (settings.lang === 'id' && !hasIndonesian(data)) head.append(el('p', { className: 'note-id', id: 'note-id', textContent: T.id.noIndonesian }));

  const page = $('page');
  page.replaceChildren();
  const rootCounts = new Map();
  for (const words of data.ayat) for (const w of words) if (w[1]) rootCounts.set(w[1], (rootCounts.get(w[1]) ?? 0) + 1);
  const stackSize = sizeFor(STACK_SIZES, data.ayat.length);
  view = {
    n, meta, data, page, rootCounts,
    stack: createMachine(program('stack', stackSize)),
    stackOut: null,
    ayat: data.ayat.map((words, a) => {
      const W = sizeFor(AYAH_SIZES, words.length + 1);
      return { a, words, W, machine: createMachine(program('ayah', W)), out: null, node: null, tiles: null, height: -1, dirty: true, trans: null, transH: 0, transKey: -1 };
    }),
    trans, // the Indonesian translation, when the ID view loaded it
    equran: null,
    equranCached: false,
    selected: null, // {a, i}
    root: 0,
    card: null, // {a, node, clip, top}
    lineWidth: 0,
  };
  page.style.setProperty('--gap', '22px');
  audioUI.refresh();
  loadEquranFor(view);
  view.stack.set(view.stack.built.cells.gap, 22);
  view.stack.built.cells.used.forEach((wire, j) => view.stack.set(wire, j < data.ayat.length ? 1 : 0));
  resizeWatch.observe(page);
  relayout(performance.now(), true);
  updateWindow();
  zoomTo?.();
  schedule();
  saveLast();
  renderEnd();
}
// The bar's middle: the surah's name, and its number, ayat and meaning on the line under it (one line when wide).
function setWhere(meta) {
  if (!meta) { $('where').replaceChildren(); return; }
  $('where').replaceChildren(el('b', { textContent: meta.latin }), el('span', { textContent: `${meta.n} · ${meta.ayat} ${t('ayat')} · ${surahMeaning(meta)}` }));
}

const EQURAN_TEXT = {
  id: { qari: 'Pilih qari', fullAudio: 'Audio surat penuh', tafsir: 'Lihat tafsir', playAyah: 'Putar ayat', autoNext: 'Lanjut otomatis', loading: 'Memuat audio dan data surat dari EQuran.id…', ready: 'Audio dari EQuran.id · teks Al-Qur’an tetap tersedia tanpa internet.', cached: 'Data API tersimpan di perangkat; pemutaran MP3 tetap memerlukan koneksi.', offline: 'Audio perlu internet; tafsir dapat dibuka jika pernah dimuat. Bacaan Al-Qur’an tetap tersedia.', playbackError: 'Audio tidak dapat diputar. Periksa koneksi dan coba lagi.', tafsirLoading: 'Memuat tafsir…', tafsirError: 'Tafsir belum dapat dimuat. Periksa koneksi lalu coba lagi.', ayah: (n) => `Ayat ${n}`, openAyah: 'Buka ayat ini', source: 'Tafsir Kementerian Agama RI melalui EQuran.id.' },
  en: { qari: 'Choose a reciter', fullAudio: 'Full-surah audio', tafsir: 'Read tafsir', playAyah: 'Play ayah', autoNext: 'Play next ayah', loading: 'Loading audio and surah data from EQuran.id…', ready: 'Audio by EQuran.id · Quran text remains available offline.', cached: 'API data is saved on this device; MP3 playback may still need internet.', offline: 'Audio needs internet; tafsir is available if it was loaded before. Quran text remains available.', playbackError: 'Audio could not be played. Check your connection and try again.', tafsirLoading: 'Loading tafsir…', tafsirError: 'Tafsir could not be loaded. Check your connection and try again.', ayah: (n) => `Ayah ${n}`, openAyah: 'Open this ayah', source: 'Tafsir: Ministry of Religious Affairs of Indonesia via EQuran.id.' },
};
Object.assign(EQURAN_TEXT.id, {
  audioTitle: 'Dengarkan Al-Qur’an', audioNote: 'Pilih qari, dengarkan satu surat atau langsung ke ayat.', verseLabel: 'Putar per ayat',
  playingAyah: (n, qari) => `Memutar ayat ${n} · ${qari}`, playingFull: (qari) => `Memutar surat penuh · ${qari}`,
  playbackDone: 'Audio selesai.', fullDone: 'Surat selesai.', playFromTafsir: 'Putar ayat', playLoading: 'Menyiapkan audio…',
  searchTafsir: 'Cari kata dalam tafsir atau nomor ayat', tafsirCount: (shown, total) => `${shown} dari ${total} ayat`,
  tafsirNoResults: 'Tidak ada tafsir yang cocok dengan pencarian ini.', aboutSurah: 'Tentang surah',
  surahMeta: (meaning, place, count) => `${meaning} · ${{ Mekah: 'Makkiyah', Madinah: 'Madaniyah' }[place] ?? place} · ${count} ayat`,
});
Object.assign(EQURAN_TEXT.en, {
  audioTitle: 'Listen to the Quran', audioNote: 'Choose a reciter, play the full surah, or go straight to an ayah.', verseLabel: 'Play by ayah',
  playingAyah: (n, qari) => `Playing ayah ${n} · ${qari}`, playingFull: (qari) => `Playing full surah · ${qari}`,
  playbackDone: 'Audio finished.', fullDone: 'Surah finished.', playFromTafsir: 'Play ayah', playLoading: 'Preparing audio…',
  searchTafsir: 'Search tafsir text or ayah number', tafsirCount: (shown, total) => `${shown} of ${total} ayat`,
  tafsirNoResults: 'No tafsir entries match this search.', aboutSurah: 'About this surah',
  surahMeta: (meaning, place, count) => `${meaning} · ${{ Mekah: 'Meccan', Madinah: 'Medinan' }[place] ?? place} · ${count} ayat`,
});
const et = (key, ...args) => {
  const value = EQURAN_TEXT[settings.lang][key];
  return typeof value === 'function' ? value(...args) : value;
};

function createReaderTools(n) {
  const text = EQURAN_TEXT[settings.lang];
  const node = el('div', { className: 'equran-tools' });
  const heading = el('div', { className: 'equran-heading' },
    el('span', { className: 'equran-mark', ariaHidden: 'true', textContent: '▶' }),
    el('span', {}, el('b', { textContent: text.audioTitle }), el('small', { textContent: text.audioNote })));
  const qariSelect = el('select', { className: 'qari', ariaLabel: text.qari });
  qariSelect.append(...QARIS.map((qari) => el('option', { value: qari.id, textContent: qari.name })));
  qariSelect.value = settings.qari;
  const qariWrap = el('label', { className: 'equran-qari-wrap' }, el('span', { textContent: text.qari }), qariSelect);
  const tafsirButton = el('button', { type: 'button', className: 'pill tafsir-open', textContent: text.tafsir });
  const fullLabel = el('span', { className: 'equran-full-label', textContent: text.fullAudio });
  const player = el('audio', { controls: true, preload: 'none', ariaLabel: settings.lang === 'id' ? 'Audio surat penuh' : 'Full-surah audio' });
  const ayahSelect = el('select', { ariaLabel: settings.lang === 'id' ? 'Pilih ayat untuk diputar' : 'Choose an ayah to play' });
  const count = index[n - 1]?.ayat ?? 1;
  ayahSelect.append(...Array.from({ length: count }, (_, i) => el('option', { value: String(i + 1), textContent: text.ayah(i + 1) })));
  const playButton = el('button', { type: 'button', className: 'btn', textContent: text.playAyah, disabled: true });
  const verseLabel = el('span', { className: 'equran-verse-label', textContent: text.verseLabel });
  const autoNext = el('input', { type: 'checkbox', checked: store.get('autoNext', false) });
  const autoText = document.createTextNode(text.autoNext);
  const autoLabel = el('label', { className: 'equran-autonext' }, autoNext, autoText);
  const verseRow = el('div', { className: 'equran-verse' }, ayahSelect, playButton, autoLabel);
  const status = el('p', { className: 'equran-status', role: 'status', textContent: text.loading });
  node.append(heading, qariWrap, tafsirButton, fullLabel, player, verseLabel, verseRow, status);

  const ui = {
    n, node, qariSelect, player, ayahSelect, playButton, autoNext, status, mode: 'full', cached: false,
    setStatus(message) { status.textContent = message; },
    relang() {
      const words = EQURAN_TEXT[settings.lang];
      heading.querySelector('b').textContent = words.audioTitle;
      heading.querySelector('small').textContent = words.audioNote;
      qariWrap.querySelector('span').textContent = words.qari;
      qariSelect.ariaLabel = words.qari;
      player.ariaLabel = settings.lang === 'id' ? 'Audio surat penuh' : 'Full-surah audio';
      fullLabel.textContent = words.fullAudio;
      tafsirButton.textContent = words.tafsir;
      playButton.textContent = words.playAyah;
      autoText.textContent = words.autoNext;
      verseLabel.textContent = words.verseLabel;
      for (const option of ayahSelect.options) option.textContent = words.ayah(Number(option.value));
    },
    setSource(mode, ayahNumber) {
      const detail = view?.n === n ? view.equran : null;
      const fullUrl = audioForQari(equranCatalog?.[n - 1]?.audioFull, settings.qari) || audioForQari(detail?.audioFull, settings.qari);
      const verseData = detail?.ayat?.[ayahNumber - 1]?.audio;
      const url = mode === 'verse' ? audioForQari(verseData, settings.qari) : fullUrl;
      if (!url) return false;
      if (player.dataset.source !== url) {
        player.dataset.source = url;
        player.src = url;
        player.load();
      }
      return true;
    },
    async playAyah(ayahNumber) {
      if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > count) return false;
      const target = view?.n === n ? view : null;
      if (!target) return false;
      ayahSelect.value = String(ayahNumber);
      ui.mode = 'verse';
      status.textContent = `${EQURAN_TEXT[settings.lang].playLoading} ${EQURAN_TEXT[settings.lang].ayah(ayahNumber)}…`;
      try {
        await ensureEquranDetail(target);
        if (audioUI !== ui || view !== target) return false;
        ui.refresh();
        if (!ui.setSource('verse', ayahNumber)) throw new Error('Audio ayat tidak tersedia untuk qari ini.');
        playButton.disabled = false;
        await player.play();
        return true;
      } catch {
        if (audioUI === ui) status.textContent = EQURAN_TEXT[settings.lang].playbackError;
        return false;
      }
    },
    refresh() {
      if (audioUI !== ui || view?.n !== n) return;
      qariSelect.value = settings.qari;
      const detail = view.equran;
      const fullReady = !!(audioForQari(equranCatalog?.[n - 1]?.audioFull, settings.qari) || audioForQari(detail?.audioFull, settings.qari));
      const selectedAyah = Number(ayahSelect.value) || 1;
      const verseReady = !!audioForQari(detail?.ayat?.[selectedAyah - 1]?.audio, settings.qari);
      ayahSelect.disabled = !detail;
      playButton.disabled = !verseReady;
      if (ui.mode === 'verse') {
        if (verseReady) ui.setSource('verse', selectedAyah);
      } else if (fullReady) ui.setSource('full');
      const words = EQURAN_TEXT[settings.lang];
      if (detail) status.textContent = ui.cached ? words.cached : words.ready;
      else if (fullReady) status.textContent = equranCatalogCached ? words.cached : words.ready;
      else status.textContent = words.loading;
    },
    unavailable() { if (audioUI === ui && view?.n === n) status.textContent = EQURAN_TEXT[settings.lang].offline; },
  };
  qariSelect.onchange = () => {
    if (!validQari(qariSelect.value)) return;
    const resume = !player.paused;
    settings.qari = qariSelect.value;
    store.set('qari', settings.qari);
    ui.refresh();
    if (resume) player.play().catch(() => { status.textContent = EQURAN_TEXT[settings.lang].playbackError; });
  };
  ayahSelect.onchange = () => ui.refresh();
  autoNext.onchange = () => store.set('autoNext', autoNext.checked);
  playButton.onclick = () => { ui.playAyah(Number(ayahSelect.value) || 1); };
  player.onplay = () => {
    const words = EQURAN_TEXT[settings.lang];
    const qari = QARIS.find((item) => item.id === settings.qari)?.name ?? '';
    status.textContent = ui.mode === 'verse' ? words.playingAyah(Number(ayahSelect.value) || 1, qari) : words.playingFull(qari);
  };
  player.onerror = () => { if (audioUI === ui) status.textContent = EQURAN_TEXT[settings.lang].playbackError; };
  player.onended = () => {
    if (ui.mode !== 'verse') { status.textContent = EQURAN_TEXT[settings.lang].fullDone; return; }
    if (!autoNext.checked) { status.textContent = EQURAN_TEXT[settings.lang].playbackDone; return; }
    const next = Number(ayahSelect.value) + 1;
    if (next <= count) { ayahSelect.value = String(next); ui.playAyah(next); }
    else status.textContent = EQURAN_TEXT[settings.lang].playbackDone;
  };
  tafsirButton.onclick = () => openTafsir(n);
  ui.refresh();
  return ui;
}

function loadEquranCatalog() {
  if (!equranCatalogPromise) {
    equranCatalogPromise = getEquranSurahs().then((result) => {
      equranCatalog = result.data;
      equranCatalogCached = result.cached;
      if (audioUI) audioUI.cached = result.cached || !!view?.equranCached;
      audioUI?.refresh();
      return result;
    }).catch((error) => { equranCatalogPromise = null; throw error; });
  }
  return equranCatalogPromise;
}

function ensureEquranDetail(target) {
  if (target.equran) return Promise.resolve({ data: target.equran, cached: target.equranCached });
  if (!target.equranPromise) {
    target.equranPromise = getEquranSurah(target.n).then((result) => {
      if (result.data.ayat.length !== target.ayat.length) throw new Error('Jumlah ayat API tidak sesuai dengan teks lokal.');
      target.equran = result.data;
      target.equranCached = result.cached;
      if (view === target && audioUI?.n === target.n) { audioUI.cached = result.cached || equranCatalogCached; audioUI.refresh(); }
      return result;
    }).catch((error) => { target.equranPromise = null; throw error; });
  }
  return target.equranPromise;
}

function loadEquranFor(target) {
  loadEquranCatalog().catch(() => {});
  ensureEquranDetail(target).catch(() => { if (view === target) audioUI?.unavailable(); });
}

function plainApiText(value) {
  const html = String(value ?? '').replace(/<br\s*\/?>/gi, '\n');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  return (parsed.body.textContent ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function openTafsir(n, focusAyah = 0) {
  const token = ++tafsirRequest;
  const meta = index[n - 1];
  $('tafsir-title').textContent = `${EQURAN_TEXT[settings.lang].tafsir} · ${meta?.latin ?? n}`;
  $('tafsir-body').replaceChildren(el('p', { className: 'tafsir-credit', textContent: et('source') }), el('p', { role: 'status', textContent: et('tafsirLoading') }));
  sheets.open('tafsir');
  getEquranTafsir(n).then(({ data, cached }) => {
    if (token !== tafsirRequest) return;
    const body = $('tafsir-body');
    const overview = el('section', { className: 'tafsir-overview', ariaLabel: et('aboutSurah') });
    overview.append(
      el('span', { className: 'tafsir-arabic', lang: 'ar', dir: 'rtl', textContent: data.nama ?? '' }),
      el('h3', { textContent: data.namaLatin ?? meta?.latin ?? `${n}` }),
      el('p', { className: 'tafsir-meta', textContent: EQURAN_TEXT[settings.lang].surahMeta(settings.lang === 'id' ? (data.arti ?? '') : (surahMeaning(meta) || data.arti || ''), data.tempatTurun ?? '', data.jumlahAyat ?? data.tafsir.length) }),
    );
    const description = plainApiText(data.deskripsi);
    if (description) {
      const about = el('details', { className: 'tafsir-about' });
      about.append(el('summary', { textContent: et('aboutSurah') }), el('p', { textContent: description }));
      overview.append(about);
    }
    overview.append(el('p', { className: 'tafsir-credit', textContent: `${et('source')}${cached ? ` ${EQURAN_TEXT[settings.lang].cached}` : ''}` }));

    const filter = el('input', { type: 'search', className: 'tafsir-search', placeholder: et('searchTafsir'), ariaLabel: et('searchTafsir'), autocomplete: 'off' });
    const count = el('span', { className: 'tafsir-count', role: 'status' });
    const filterRow = el('div', { className: 'tafsir-filter-row' }, filter, count);
    const list = el('div', { className: 'tafsir-list' });
    const empty = el('p', { className: 'tafsir-empty', textContent: et('tafsirNoResults'), hidden: true });
    const entries = data.tafsir.map((item) => {
      const entry = el('article', { className: 'tafsir-entry' });
      entry.dataset.ayah = String(item.ayat);
      entry.dataset.search = `${item.ayat} ${item.teks}`.toLocaleLowerCase();
      entry.append(el('h3', { textContent: et('ayah', item.ayat) }));
      const prose = el('div', { className: 'tafsir-prose', dir: 'auto' });
      for (const paragraph of item.teks.trim().split(/\n\s*\n/).map((part) => part.replace(/\n+/g, ' ').trim()).filter(Boolean)) {
        prose.append(el('p', { textContent: paragraph }));
      }
      const actions = el('div', { className: 'tafsir-actions' });
      const play = el('button', { type: 'button', className: 'pill solid', textContent: et('playFromTafsir'), ariaLabel: `${et('playFromTafsir')} · ${et('ayah', item.ayat)}` });
      play.onclick = async () => {
        if (view?.n !== n || !audioUI || audioUI.n !== n) return;
        play.disabled = true;
        play.textContent = et('playLoading');
        const started = await audioUI.playAyah(item.ayat);
        if (started) { sheets.close('tafsir'); goToAyah(n, item.ayat - 1, 0); }
        else { play.disabled = false; play.textContent = et('playFromTafsir'); }
      };
      const open = el('button', { type: 'button', className: 'pill', textContent: et('openAyah') });
      open.onclick = () => { if (view?.n === n) { sheets.close('tafsir'); goToAyah(n, item.ayat - 1, 0); } };
      actions.append(play, open);
      entry.append(prose, actions);
      list.append(entry);
      return entry;
    });
    const updateFilter = () => {
      const query = filter.value.trim().toLocaleLowerCase();
      const exactAyah = /^\d+$/.test(query);
      let shown = 0;
      for (const entry of entries) {
        const match = !query || (exactAyah ? entry.dataset.ayah === query : entry.dataset.search.includes(query));
        entry.hidden = !match;
        if (match) shown++;
      }
      count.textContent = EQURAN_TEXT[settings.lang].tafsirCount(shown, entries.length);
      empty.hidden = shown > 0;
    };
    filter.addEventListener('input', updateFilter);
    updateFilter();
    body.replaceChildren(overview, filterRow, list, empty);
    if (Number.isInteger(focusAyah) && focusAyah > 0) {
      filter.value = String(focusAyah);
      updateFilter();
      const target = entries.find((entry) => Number(entry.dataset.ayah) === focusAyah);
      if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: reduced.matches ? 'auto' : 'smooth' }));
    }
  }).catch(() => {
    if (token === tafsirRequest) $('tafsir-body').replaceChildren(el('p', { className: 'tafsir-credit', role: 'status', textContent: et('tafsirError') }));
  });
}

function closeSurah(instant = false) {
  if (!view) return;
  const n = view.n;
  audioUI?.player.pause();
  audioUI = null;
  if (!$('tafsir').hidden) sheets.close('tafsir');
  netPanel?.close(true);
  setRoot(0, performance.now(), true);
  view = null;
  $('reader-view').hidden = true;
  $('index-view').hidden = false;
  document.body.classList.remove('reading');
  $('back').hidden = true;
  $('brand').hidden = false;
  hideHint();
  $('end-card').hidden = true;
  setWhere(null);
  showBar(true);
  renderGreeting();
  const tile = document.querySelectorAll('.surah')[n - 1];
  tile?.scrollIntoView({ block: 'center' });
  if (!instant && tile) zoomClose(tile);
}

// Measures every word and writes the layout's inputs. Ayat near the screen run their network and glide; the others
// only need their height, which the plain-JS layout gives exactly (test/layout.test.mjs), and run their network once
// they come near the screen.
function relayout(now, jump = false) {
  if (!view) return;
  const g = geometry();
  const lineWidth = quarter(view.page.clientWidth);
  view.lineWidth = lineWidth;
  view.lineHeight = g.lineHeight;
  view.page.style.setProperty('--fs', `${g.fs}px`);
  view.page.style.setProperty('--pad', `${PAD}px`);
  const [first, last] = nearRange();
  const seen = screenRange();
  const job = ++relayoutJob;
  const far = [];
  // The ayah at the top of the screen, and where it is on the screen, so the reading place stays put.
  const anchor = jump ? null : anchorAyah();
  for (const ay of view.ayat) {
    // Only the ayat below the screen wait: a change above it moves what you are reading, so it lands now.
    if (ay.a > last) { far.push(ay); continue; }
    layoutAyah(ay, g, lineWidth, first, last, now, jump || ay.a < seen[0] || ay.a > seen[1]);
  }
  if (anchor) keepPlace(anchor, now);
  // The ayat off the screen are measured in small slices between frames; their heights reach the stack as they come.
  const slice = () => {
    if (job !== relayoutJob || !view) return;
    const started = performance.now();
    while (far.length && performance.now() - started < 6) layoutAyah(far.shift(), g, lineWidth, first, last, performance.now(), true);
    schedule();
    if (far.length) (window.requestIdleCallback ?? setTimeout)(slice);
  };
  if (far.length) (window.requestIdleCallback ?? setTimeout)(slice);
}

let relayoutJob = 0;

function layoutAyah(ay, g, lineWidth, first, last, now, jump) {
  {
    layoutTrans(ay, lineWidth);
    const m = ay.machine;
    const c = m.built.cells;
    m.set(c.lineWidth, lineWidth);
    m.set(c.lineHeight, g.lineHeight);
    m.set(c.gap, g.gap);
    m.set(c.root, view.root);
    const widths = c.words.map((slot, i) => {
      const word = ay.words[i];
      const end = i === ay.words.length;
      const width = word ? tileWidth(word, g) : end ? quarter(g.badge + 2 * PAD) : 0;
      m.set(slot.width, width);
      m.set(slot.used, word || end ? 1 : 0);
      m.set(slot.root, word ? word[1] : 0);
      return width;
    });
    const selected = view.selected?.a === ay.a;
    if (selected) m.set(c.cardHeight, measureCard());
    if ((ay.a >= first && ay.a <= last) || ay.node) {
      m.nudge(now, jump || reduced.matches);
      ay.out = m.step(now);
      ay.dirty = false;
      setHeight(ay, ay.out.height, now, jump);
      if (ay.node) restyleTiles(ay, g);
    } else {
      ay.dirty = true;
      const ref = layoutReference({
        widths, used: widths.map((_, i) => i <= ay.words.length), lineWidth, gap: g.gap, lineHeight: g.lineHeight,
        selected: m.source[c.selected], open: m.source[c.open] === 1, cardHeight: m.source[c.cardHeight],
      });
      setHeight(ay, ref.height, now, jump);
    }
  }
}

// The ayat that are on screen right now: only these glide, since a glide nobody sees costs frames for nothing.
function screenRange() {
  const out = view?.stackOut;
  if (!out) return [0, 14];
  const from = -view.page.getBoundingClientRect().top;
  const to = from + innerHeight;
  let first = view.ayat.length;
  let last = -1;
  for (const ay of view.ayat) {
    const y = out.tops[ay.a];
    if (y + ay.height >= from && y <= to) { first = Math.min(first, ay.a); last = Math.max(last, ay.a); }
  }
  return [first, last];
}

// The ayat that run their network: those near the screen, or the first screenful before the stack has run.
// The first ayah on screen and its distance from the top of the window.
function anchorAyah() {
  const out = view.stackOut;
  if (!out) return null;
  const pageTop = view.page.getBoundingClientRect().top;
  for (const ay of view.ayat) if (pageTop + out.tops[ay.a] + ay.height > 60) return { a: ay.a, screenY: pageTop + out.tops[ay.a] };
  return null;
}
// After heights above the screen changed: the stack lands at once and the window scrolls by the change, so the ayah
// being read stays where it was. The ayat on screen still glide inside themselves.
function keepPlace(anchor, now) {
  let top = 0;
  for (let j = 0; j < anchor.a; j++) top += view.ayat[j].height + 22;
  view.stack.nudge(now, true);
  view.stackOut = view.stack.step(now);
  const screenY = view.page.getBoundingClientRect().top + top;
  if (Math.abs(screenY - anchor.screenY) > 0.5) scrollBy(0, screenY - anchor.screenY);
}

function nearRange() {
  if (!view.stackOut) return [0, 14];
  const [first, last] = visibleRange();
  return [first - 2, last + 2];
}

// An ayah that comes near the screen after changes it didn't run: one jump to where it belongs, unseen.
function catchUp(ay, now) {
  if (!ay.dirty) return;
  ay.machine.nudge(now, true);
  ay.out = ay.machine.step(now);
  ay.dirty = false;
  setHeight(ay, ay.out.height, now, true);
}

function feedStack(ay, now, jump) {
  setHeight(ay, ay.out.height, now, jump || reduced.matches);
}

// The stack gets the ayah's tiles plus the translation under them.
function setHeight(ay, height, now, jump) {
  height += ay.transH;
  if (height === ay.height) return;
  ay.height = height;
  view.stack.set(view.stack.built.cells.heights[ay.a], height);
  view.stack.nudge(now, jump || reduced.matches);
}

// Which ayat are on screen, from the stack's positions: [first, last].
function visibleRange() {
  const out = view?.stackOut;
  if (!out) return [0, -1];
  // The page's own coordinates, from a screen above the view to two screens below it.
  const from = -view.page.getBoundingClientRect().top - innerHeight;
  const to = from + innerHeight * 3;
  let first = view.ayat.length;
  let last = -1;
  for (const ay of view.ayat) {
    const y = out.tops[ay.a];
    if (y + ay.height >= from && y <= to) { first = Math.min(first, ay.a); last = Math.max(last, ay.a); }
  }
  return [first, last];
}

// The ayat near the screen have tiles on the page; the rest have none.
function updateWindow() {
  if (!view) return;
  if (!view.stackOut) view.stackOut = view.stack.step(performance.now());
  const [first, last] = visibleRange();
  for (const ay of view.ayat) {
    const near = ay.a >= first - 2 && ay.a <= last + 2;
    if (near && ay.dirty) catchUp(ay, performance.now());
    if (near && !ay.node) mountAyah(ay);
    else if (!near && ay.node && view.selected?.a !== ay.a) { ay.node.remove(); ay.node = null; ay.tiles = null; }
  }
  draw();
}

function mountAyah(ay) {
  const g = geometry();
  ay.tiles = ay.words.map((w, i) => {
    const b = el('button', { type: 'button', className: 'tile', ariaExpanded: 'false' });
    // One line of Arabic in source order; the marks are coloured inside it.
    const ar = el('span', { className: 'w', lang: 'ar' });
    const pre = prefixOf(w);
    const post = suffixOf(w);
    if (pre) ar.append(el('span', { className: 'mk', textContent: `${pre} ` }));
    ar.append(w[0]);
    if (post) ar.append(el('span', { className: 'mk', textContent: ` ${post}` }));
    b.append(ar, el('span', { className: 'm', textContent: meaningOf(w), title: meaningOf(w) }));
    b.onclick = () => tapWord(ay.a, i);
    return b;
  });
  // The ayah's number: tapping it opens the ayat it shares the most roots with (computed on the Spark's GPU).
  const end = el('button', { type: 'button', className: 'tile end', ariaLabel: `${t('ayahWord')} ${ay.a + 1}: ${t('linksTitle')}`, ariaExpanded: 'false' },
    el('span', { className: 'badge', textContent: arabicDigits(ay.a + 1), lang: 'ar' }));
  end.onclick = () => tapWord(ay.a, ay.words.length);
  ay.tiles.push(end);
  ay.transNode = el('p', { className: 'tr-id', lang: 'id' });
  ay.transShown = null;
  ay.node = el('div', { className: `ayah${ay.a > 0 ? ' sep' : ''}` }, ...ay.tiles, ay.transNode);
  ay.painted = false;
  ay.last = null;
  ay.top = NaN;
  ay.drawnHeight = NaN;
  restyleTiles(ay, g);
  // In reading order in the page, so focus and the separators follow the text.
  view.page.insertBefore(ay.node, view.ayat.find((b) => b.a > ay.a && b.node)?.node ?? null);
}

function restyleTiles(ay, g) {
  if (ay.transShown !== ay.trans) {
    ay.transShown = ay.trans;
    ay.transNode.replaceChildren(...(ay.trans ?? []).map((line) => el('span', { textContent: line })));
    ay.transNode.hidden = !ay.trans;
    ay.transTop = NaN;
    ay.painted = false;
  }
  ay.tiles.forEach((node, i) => {
    const width = ay.machine.source[ay.machine.built.cells.words[i].width];
    node.style.width = `${width}px`;
    node.style.height = `${g.tile}px`;
    const w = ay.words[i];
    if (w) {
      for (const span of node.querySelectorAll('.w')) { span.style.fontSize = `${g.fs}px`; span.style.lineHeight = `${g.arLine}px`; }
      const m = node.querySelector('.m');
      m.textContent = meaningOf(w);
      m.title = meaningOf(w);
    } else {
      const badge = node.querySelector('.badge');
      badge.style.width = badge.style.height = `${g.badge}px`;
      node.style.paddingTop = `${Math.round((g.tile - g.badge) / 2) - 2}px`;
    }
  });
}

// Writes what the networks computed: each ayah's place, each tile's place, lift and glow, and the card. Only what
// changed since the last frame is written: at 144 Hz a frame has 6.9 ms, and an idle tile costs nothing.
function draw() {
  if (!view?.stackOut) return;
  const stackMoved = view.stack.take();
  if (stackMoved) view.page.style.height = `${Math.ceil(view.stackOut.total)}px`;
  const rooted = view.root !== 0;
  for (const ay of view.ayat) {
    if (!ay.node || !ay.out) continue;
    const top = view.stackOut.tops[ay.a];
    if (ay.top !== top) { ay.node.style.transform = `translate3d(0, ${top}px, 0)`; ay.top = top; }
    const moved = ay.machine.take();
    if (!moved && ay.painted && ay.rooted === rooted) continue;
    ay.painted = true;
    ay.rooted = rooted;
    if (ay.height !== ay.drawnHeight) { ay.node.style.height = `${ay.out.height + ay.transH}px`; ay.drawnHeight = ay.height; }
    const tiles = ay.out.tiles;
    if (ay.trans) {
      // Under the last line, or under the word card when it opens on that line; it glides with them.
      const card = ay.out.card;
      const top = Math.max(tiles[ay.tiles.length - 1].y + view.lineHeight, card.top + Math.max(0, card.size) * card.open);
      if (!(Math.abs(top - ay.transTop) <= 0.05)) { ay.transNode.style.transform = `translate3d(0, ${top}px, 0)`; ay.transTop = top; }
    }
    const last = (ay.last ??= ay.tiles.map(() => ({ x: NaN, y: NaN, g: -1, l: -1, r: null })));
    for (let i = 0; i < ay.tiles.length; i++) {
      const o = tiles[i];
      const was = last[i];
      const node = ay.tiles[i];
      if (o.x !== was.x || o.y !== was.y || Math.abs(o.lift - was.l) > 0.002) {
        node.style.transform = `translate3d(${o.x}px, ${o.y - o.lift * 3}px, 0) scale(${1 + o.lift * 0.06})`;
        was.x = o.x;
        was.y = o.y;
      }
      if (Math.abs(o.glow - was.g) > 0.002 || Math.abs(o.lift - was.l) > 0.002 || was.r !== rooted) {
        const lit = Math.max(o.glow, o.lift);
        node.style.background = lit > 0.002 ? `color-mix(in srgb, var(--copper) ${Math.max(o.glow * 15, o.lift * 9).toFixed(1)}%, transparent)` : '';
        node.style.boxShadow = o.lift > 0.002 ? `0 ${(o.lift * 6).toFixed(1)}px ${(o.lift * 16).toFixed(1)}px rgb(60 42 22 / ${(o.lift * 0.22).toFixed(3)})` : '';
        node.style.opacity = rooted ? (0.3 + 0.7 * lit).toFixed(3) : '';
        node.classList.toggle('on', o.glow > 0.5);
        was.g = o.glow;
        was.l = o.lift;
        was.r = rooted;
      }
    }
  }
  const card = view.card;
  if (card) {
    const ay = view.ayat[card.a];
    const open = ay.out.card.open;
    card.clip.style.top = `${ay.out.card.top}px`;
    card.clip.style.height = `${Math.max(0, ay.out.card.size) * open}px`;
    card.clip.style.opacity = Math.min(1, open * 1.4).toFixed(3);
    if (open < 0.001 && view.selected?.a !== card.a) { card.clip.remove(); view.card = null; }
  }
  // The network panel's rows take the numbers this frame computed, when it is open.
  netPanel?.paint();
}

function frame(now) {
  frameId = 0;
  if (!view) return;
  let again = false;
  for (const ay of view.ayat) {
    if (!ay.machine.running()) continue;
    ay.out = ay.machine.step(now);
    feedStack(ay, now, false);
    again ||= ay.machine.running();
  }
  if (view.stack.running()) {
    view.stackOut = view.stack.step(now);
    again ||= view.stack.running();
  }
  // Blocks that the stack moved onto the screen get their tiles in the same frame.
  updateWindow();
  if (again) schedule();
}

// ---------- the word card ----------

function tapWord(a, i) {
  if (!view) return;
  warmFinder();
  hideHint();
  const now = performance.now();
  view.page.querySelector('.tile.found')?.classList.remove('found');
  const same = view.selected && view.selected.a === a && view.selected.i === i;
  if (view.selected && (same || view.selected.a !== a)) {
    // The card closes where it is: its ayah keeps the slot and only turns the card off.
    const prev = view.ayat[view.selected.a];
    prev.machine.set(prev.machine.built.cells.open, 0);
    prev.machine.nudge(now, reduced.matches);
    setTileExpanded(prev, view.selected.i, false);
  }
  if (view.selected && !same) setTileExpanded(view.ayat[view.selected.a], view.selected.i, false);
  view.selected = same ? null : { a, i };
  if (!same) {
    track.event('word', { s: view.n });
    const ay = view.ayat[a];
    if (view.card && view.card.a !== a) { view.card.clip.remove(); view.card = null; }
    showCard(a, i);
    const c = ay.machine.built.cells;
    ay.machine.set(c.cardHeight, measureCard());
    ay.machine.set(c.selected, i);
    ay.machine.set(c.open, 1);
    ay.machine.nudge(now, reduced.matches);
    setTileExpanded(ay, i, true);
    // An open network panel follows the tapped word, to its ayah's network.
    if (netPanel?.isOpen() && ay.words[i]) netPanel.follow(netTarget(ay, i));
  }
  schedule();
}
const setTileExpanded = (ay, i, on) => ay.tiles?.[i]?.setAttribute('aria-expanded', on ? 'true' : 'false');

function showCard(a, i) {
  const ay = view.ayat[a];
  const w = ay.words[i];
  if (!w) return showLinks(a, i);
  if (!view.card) {
    const clip = el('div', { className: 'card-clip' });
    view.card = { a, clip, top: 0, height: 0 };
  }
  view.card.a = a;
  const card = el('div', { className: 'card' });
  fillCard(card, w);
  view.card.clip.replaceChildren(card);
  ay.node.append(view.card.clip);
}

// The card of an ayah's number: its strongest links by shared roots, from data/links (the Spark's GPU).
function showLinks(a, i) {
  const ay = view.ayat[a];
  if (!view.card) view.card = { a, clip: el('div', { className: 'card-clip' }), top: 0, height: 0 };
  view.card.a = a;
  const card = el('div', { className: 'card links' });
  view.card.clip.replaceChildren(card);
  ay.node.append(view.card.clip);
  fillLinks(card, a, i);
}
async function fillLinks(card, a, i) {
  const n = view.n;
  const close = el('button', { type: 'button', className: 'x', textContent: '×', ariaLabel: t('close') });
  close.onclick = () => { if (view?.selected) tapWord(view.selected.a, view.selected.i); };
  const list = el('div', { className: 'link-list' });
  card.replaceChildren(close, el('div', { className: 'card-gloss' }, el('span', { className: 'mean', textContent: `${t('ayahWord')} ${n}:${a + 1}` }), el('span', { className: 'tr', textContent: t('linksTitle') })), list);
  const near = await linksOf(n, a);
  if (view?.n !== n || view.selected?.a !== a || view.selected?.i !== i) return;
  if (!near.length) list.append(el('p', { className: 'small', textContent: t('linksNone') }));
  for (const [ls, la, score, shared] of near) {
    const meta = index[ls - 1];
    const row = el('button', { type: 'button', className: 'link-row' },
      el('span', { className: 'ref', textContent: `${meta.latin} ${ls}:${la}` }),
      el('span', { className: 'roots', lang: 'ar', textContent: shared.map((r) => roots[r - 1]?.r ?? '').join('  ·  ') }),
      el('span', { className: 'bar' }, el('i', { style: `width:${Math.round(score * 100)}%` })));
    row.onclick = () => goToAyah(ls, la - 1, 0);
    list.append(row);
  }
  // The list arrived after the card opened: give the network its real height.
  const ay = view.ayat[a];
  ay.machine.set(ay.machine.built.cells.cardHeight, measureCard());
  ay.machine.nudge(performance.now(), reduced.matches);
  schedule();
}

function fillCard(card, w) {
  const close = el('button', { type: 'button', className: 'x', textContent: '×', ariaLabel: t('close') });
  close.onclick = () => { if (view?.selected) tapWord(view.selected.a, view.selected.i); };
  const top = el('div', { className: 'card-top' },
    el('div', { className: 'card-gloss' }, el('span', { className: 'mean', textContent: meaningOf(w) }), w[6] ? el('span', { className: 'tr', textContent: w[6] }) : ''),
    el('div', { className: 'card-word', textContent: shownWord(w), lang: 'ar' }));
  const facts = el('div', { className: 'card-facts' });
  const fact = (label, ...value) => facts.append(el('div', {}, el('span', { className: 'label', textContent: label }), ...value));
  if (w[1]) {
    const root = roots[w[1] - 1]?.r ?? '';
    const letters = el('div', { className: 'letters' }, ...Array.from(root).map((ch) => {
      const b = el('button', { type: 'button', textContent: ch, lang: 'ar', ariaLabel: `${t('light')}: ${root}` });
      b.onclick = () => { track.event('root', { from: 'letter' }); setRoot(w[1], performance.now()); };
      return b;
    }));
    fact(t('root'), letters);
    // A root of four letters (وسوس) is wider than a column on a phone: it gets the whole row, so no letter hides under
    // the next fact.
    if (Array.from(root).length > 3) facts.lastChild.classList.add('wide');
  }
  if (w[2]) fact(t('lemma'), el('span', { className: 'v ar', textContent: w[2], lang: 'ar' }));
  fact(t('type'), el('span', { className: 'v', textContent: posName(w[3]) }));
  if (w[1]) fact(t('withRoot'), el('span', { className: 'v', textContent: `${num(rootWords(w[1]))} ${t('inQuran')} · ${num(view.rootCounts.get(w[1]) ?? 0)} ${t('inSurah')}` }));
  card.append(close, top, facts);
  if (w[2]) fillSameCount(card, facts, w);
  const actions = el('div', { className: 'card-actions' });
  if (w[1]) {
    const lit = view.root === w[1];
    const b = el('button', { type: 'button', className: 'pill', textContent: lit ? t('lit') : t('light') });
    b.onclick = () => { if (!lit) track.event('root', { from: 'card' }); setRoot(lit ? 0 : w[1], performance.now()); };
    // The map is the main thing a word opens into, so it is the solid button.
    const grow = el('button', { type: 'button', className: 'pill solid grow', textContent: `${t('grow')} →` });
    grow.onclick = () => openMap(w[1], w[2]);
    const dotsButton = el('button', { type: 'button', className: 'pill', textContent: dotsText(settings.lang).cardButton });
    dotsButton.onclick = () => openDots(w[1]);
    actions.append(grow, dotsButton, b);
  }
  // Every word, with a root or without, is laid out by its ayah's network.
  const net = el('button', { type: 'button', className: 'pill net-open', textContent: networkText(settings.lang).cardButton });
  net.onclick = openNetwork;
  actions.append(net);
  card.append(actions);
}

// ---------- the network panel ----------

// The tapped word's ayah network, live (network.js): its inputs, every operation and its outputs, as the page computes
// them. Off until a card's "Lihat jaringannya"; it then follows the tapped word.
let netPanel = null;
const network = () => (netPanel ??= createNetworkPanel({
  $, el, num, reduced, lang: () => settings.lang,
  spring: createMachine(program('zoom')),
  // One evaluation of the ayah's network now, so the lists have numbers as they open.
  refresh(ay) {
    if (!view?.ayat[ay.a] || view.ayat[ay.a] !== ay) return;
    const now = performance.now();
    if (ay.dirty) catchUp(ay, now);
    else { ay.machine.nudge(now); ay.out = ay.machine.step(now); feedStack(ay, now, false); }
    draw();
    schedule();
  },
}));
// While the panel is open, a change of text size or language keeps the watched word in sight: when its new place is
// under the phone's sheet, under the bar or off the screen, the page glides there with it. A word already out of
// sight is left there.
function keepWatchedWord(change) {
  const ay = netPanel?.isOpen() ? netPanel.ayah() : null;
  const i = netPanel?.word() ?? -1;
  const band = () => [$('bar').getBoundingClientRect().bottom + 8, innerHeight - (innerWidth < 760 ? $('net').getBoundingClientRect().height : 0) - 8];
  const before = ay?.tiles?.[i]?.getBoundingClientRect();
  const [top0, bottom0] = band();
  change();
  if (!before || before.bottom <= top0 || before.top >= bottom0 || !view?.stackOut || view.ayat[ay.a] !== ay || !ay.out) return;
  const y = view.page.getBoundingClientRect().top + view.stackOut.tops[ay.a] + ay.out.tiles[i].toY;
  const [top, bottom] = band();
  if (y < top || y + geometry().tile > bottom) scrollBy({ top: y - top - 8, behavior: reduced.matches ? 'auto' : 'smooth' });
}
const netTarget = (ay, i) => ({ ay, i, ref: `${view.n}:${ay.a + 1}`, word: shownWord(ay.words[i]), get meaning() { return meaningOf(ay.words[i]); }, count: ay.words.length });
function openNetwork() {
  if (!view?.selected) return;
  const { a, i } = view.selected;
  const ay = view.ayat[a];
  if (!ay?.words[i]) return;
  network().open(netTarget(ay, i));
  // On a phone the sheet takes the lower half: the tapped word comes up above it, under the bar.
  if (innerWidth < 760) {
    const tile = ay.tiles?.[i]?.getBoundingClientRect();
    const bar = $('bar').getBoundingClientRect().bottom;
    const sheet = $('net').getBoundingClientRect().height;
    if (tile && (tile.top < bar + 8 || tile.bottom > innerHeight - sheet - 8)) scrollBy({ top: tile.top - bar - 16, behavior: reduced.matches ? 'auto' : 'smooth' });
  }
}

// The card's base form: how often it occurs in the whole Quran, and the words that occur exactly as often.
async function fillSameCount(card, facts, w) {
  let found = null;
  let sc = null;
  try { sc = await sameCount(); found = await sc.twinsOf(w[2], w[3], w[1]); } catch (e) { console.error('same count', e); }
  if (!found || !card.isConnected || facts.parentNode !== card) return;
  const s = sc.strings();
  const { row, same } = found;
  const openAt = () => sc.open({ count: row[3], lemma: row[0] });
  facts.append(el('div', {}, el('span', { className: 'label', textContent: s.thisWord }), el('span', { className: 'v', textContent: `${num(row[3])}× ${s.inQuran}` })));
  const box = el('div', { className: 'card-same' }, el('span', { className: 'label', textContent: `${s.twins} · ${num(row[3])}×` }));
  if (!same.length) box.append(el('div', { className: 'v small', textContent: s.alone }));
  else {
    const chips = el('div', { className: 'same-chips' }, ...same.slice(0, 5).map((r) => sc.chip(r, () => sc.open({ count: r[3], lemma: r[0] }))));
    const more = el('button', { type: 'button', className: 'pill same-more', textContent: same.length > 5 ? s.seeAll(num(same.length - 5)) : `${s.open} →` });
    more.onclick = openAt;
    chips.append(more);
    box.append(chips);
  }
  facts.append(box);
  const ay = view?.selected && view.ayat[view.selected.a];
  if (!ay || view.card?.clip.firstChild !== card) return;
  ay.machine.set(ay.machine.built.cells.cardHeight, measureCard());
  ay.machine.nudge(performance.now(), reduced.matches);
  schedule();
}
let sameSheet = null;
let sameReady = null;
const sameCount = () => (sameReady ??= import('./same-count.js?v=9b5457c').then(({ createSameCount }) => (sameSheet = createSameCount({
  $, el, num, index, reduced, lang: () => settings.lang,
  onAyah: (s, ayah, word) => goToAyah(s, ayah, 0, word),
  onMap: (r, lemma) => openMap(r, lemma),
  // A surah's files, for the place bar: the one it steps to (it waits for them), and the ones either side, ahead.
  prefetch: (s) => Promise.all([loadSurah(s), settings.lang === 'id' ? loadTrans(s).catch(() => null) : null]),
}))).catch((e) => { sameReady = null; throw e; }));
// The sheet keeps the index it was made with, so it is made only once the index is in.
const openSame = () => { if (index.length) sameCount().then((sc) => sc.open(), () => toast(t('loadFailed'))); };
$('intro-same').onclick = openSame;

// The card's height for the network: measured once its content is on the page.
function measureCard() {
  const card = view?.card?.clip.firstChild;
  if (!card) return 0;
  const style = getComputedStyle(card);
  return quarter(card.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom));
}

// ---------- the root, lit across the surah ----------

function setRoot(rootId, now, jump = false) {
  if (!view) return;
  view.root = rootId;
  const [first, last] = nearRange();
  const seen = screenRange();
  for (const ay of view.ayat) {
    ay.machine.set(ay.machine.built.cells.root, rootId);
    if (ay.node || (ay.a >= first && ay.a <= last)) {
      if (ay.dirty) catchUp(ay, now);
      else ay.machine.nudge(now, jump || reduced.matches || ay.a < seen[0] || ay.a > seen[1]);
    } else ay.dirty = true;
  }
  const bar = $('rootbar');
  bar.hidden = !rootId;
  if (rootId) {
    $('root-letters').textContent = roots[rootId - 1]?.r ?? '';
    $('root-count').textContent = `${num(view.rootCounts.get(rootId) ?? 0)} ${t('inSurah')} · ${num(rootWords(rootId))} ${t('inQuran')}`;
  }
  if (view.selected && view.card) {
    const w = view.ayat[view.selected.a].words[view.selected.i];
    const card = view.card.clip.firstChild;
    if (w) { card.replaceChildren(); fillCard(card, w); }
  }
  schedule();
}
$('root-clear').onclick = () => setRoot(0, performance.now());
$('root-map').onclick = () => { if (view?.root) openMap(view.root, ''); };

// ---------- the mind map ----------

// Which ayat hold a root: the Handwired program on the visitor's GPU (quran-gpu.js) when it is there.
let finder = null;
let finderReady = false;
async function rootFinder() {
  if (finder) return finder;
  finder = (async () => {
    try {
      const gpu = await import('./quran-gpu.js?v=9b5457c');
      return await gpu.createRootLight();
    } catch {
      return cpuFinder();
    } finally {
      finderReady = true;
    }
  })();
  return finder;
}
// The GPU finder (its table, its shader and a checked first run) is built in idle time after the first word is opened,
// so a map is quick when it is asked for, and a visit that never opens a word never pays for it.
let finderWarm = false;
function warmFinder() {
  if (finderWarm) return;
  finderWarm = true;
  (window.requestIdleCallback ?? setTimeout)(() => rootFinder(), { timeout: 4000 });
}
// Only for a browser without WebGPU: the same count, from the word table, on the CPU.
async function cpuFinder() {
  const { bin } = await wordTable();
  const [count, ayat] = new Uint32Array(bin, 0, 2);
  const root = new Uint16Array(bin, 8, count);
  const startAt = 8 + count * 4 + ((8 + count * 4) % 4 ? 2 : 0);
  const ayahStart = new Uint32Array(bin, startAt, ayat + 1);
  const surahFirst = (await loadJson('data/words.json')).surahFirstAyah;
  return {
    backend: 'cpu',
    async light(r) {
      const started = performance.now();
      const perAyah = new Uint16Array(ayat);
      for (let a = 0; a < ayat; a++) for (let k = ayahStart[a]; k < ayahStart[a + 1]; k++) if (root[k] === r) perAyah[a]++;
      const perSurah = new Uint32Array(114);
      for (let s = 0; s < 114; s++) for (let a = surahFirst[s]; a < surahFirst[s + 1]; a++) perSurah[s] += perAyah[a];
      return { perAyah, perSurah, backend: 'cpu', gpuMs: 0, totalMs: performance.now() - started };
    },
  };
}
const linkFiles = new Map();
async function linksOf(s, ayah) {
  if (!linkFiles.has(s)) linkFiles.set(s, loadJson(`data/links/l${pad3(s)}.json`).catch(() => null));
  return (await linkFiles.get(s))?.ayat?.[ayah] ?? [];
}
// Both views of the map sheet are made from the surah list and the roots, which a first visit over a slow connection
// may not have yet: the home's dots card (and then the sheet's own switch) can be tapped before either arrives, and
// Same count's map before the roots. The sheet then opens at once, says it is counting, and its view is made once both
// are in, never from the empty arrays (dots made from them stayed grey for the whole visit). Every opening takes a
// ticket and closing the sheet voids it, so a wait that ends after the sheet was closed, switched or opened again does
// nothing.
let sheetTicket = 0;
const sheetDataIn = () => index.length > 0 && roots.length > 0;
async function waitForSheetData(ticket, looking, failed) {
  $('map').hidden = false;
  document.body.classList.add('mapping');
  $('map-root').textContent = '';
  $('map-title').textContent = looking;
  $('map-gpu').textContent = '';
  try {
    await Promise.all([indexReady, loadRoots()]);
  } catch {
    if (ticket === sheetTicket) $('map-title').textContent = failed;
    return false;
  }
  return ticket === sheetTicket;
}

let mindMap = null;
let lastMap = null;
let mapModule = null;
async function openMap(rootId, lemmaText) {
  track.event('map', { where: settings.where });
  const ticket = ++sheetTicket;
  lastMap = { rootId, lemmaText };
  syncWhere();
  setSheetMode('map');
  if (!sheetDataIn() && !(await waitForSheetData(ticket, t('mapLooking'), t('mapFailed')))) return;
  // The switch from dots that were still waiting has no root to pass: the map shows the one the dots start on.
  if (!rootId) lastMap.rootId = rootId = rootOrder(roots)[0];
  let createMindMap;
  try { ({ createMindMap } = await (mapModule ??= import('./map.js?v=9b5457c'))); } catch (e) { mapModule = null; console.error('map', e); toast(t('mapFailed')); return; }
  if (ticket !== sheetTicket) return;
  mindMap ??= createMindMap({
    $, el, num, t, index, roots, loadSurah, lang: () => settings.lang, reduced,
    findRoot: findRootSafely, links: linksOf,
    onOpen: (s, ayah, r) => { mindMap.close(); goToAyah(s, ayah, r); },
  });
  mindMap.loading(rootId);
  playFace($('map-oyen'), 'think', 3);
  try {
    await mindMap.open(rootId, lemmaText);
    if (lastMap?.rootId === rootId && sheetMode === 'map') playFace($('map-oyen'), 'wow');
  } catch (e) {
    console.error('mind map', e);
    mindMap.fail(t('mapFailed'));
    playFace($('map-oyen'), 'sad');
  }
}

// ---------- ayah dots: the map sheet's other view ----------

// The sheet shows the mind map or every ayah as a dot (dots.js) for the same root; the switch in its header goes from
// one to the other, and the index and a word's card open the dots directly.
let dotsView = null;
let dotsAsked; // the root the dots were opened for, which the switch passes to the map while they wait for their data
let sheetMode = 'map';
function setSheetMode(mode) {
  sheetMode = mode;
  for (const b of $('map-mode').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  $('map-body').hidden = mode !== 'map';
  if (mode !== 'dots') dotsView?.hide();
}
async function openDots(rootId) {
  track.event('dots');
  const ticket = ++sheetTicket;
  dotsAsked = rootId;
  syncWhere();
  setSheetMode('dots');
  $('map').hidden = false;
  document.body.classList.add('mapping');
  playFace($('map-oyen'), 'look');
  if (!sheetDataIn()) {
    const w = dotsText(settings.lang);
    if (!(await waitForSheetData(ticket, w.looking, w.failed))) return;
  }
  // Made here only, with the data in: its root order and its ayat are read once, when it is made.
  dotsView ??= createDots({
    $, el, num, t, index, roots, reduced, findRoot: findRootSafely, loadSurah, lang: () => settings.lang,
    onOpen: (s, ayah, r) => { closeSheet(); goToAyah(s, ayah, r); },
  });
  dotsView.show(rootId);
}
function closeSheet() {
  sheetTicket++;
  if (mindMap) mindMap.close();
  else { $('map').hidden = true; document.body.classList.remove('mapping'); }
  dotsView?.hide();
}
for (const b of $('map-mode').querySelectorAll('button')) {
  b.onclick = () => {
    if (b.dataset.mode === sheetMode) return;
    if (b.dataset.mode === 'dots') openDots(lastMap?.rootId);
    else openMap(dotsView ? dotsView.root() : dotsAsked, '');
  };
}
// × and Escape close the sheet in both views, and while the map waits for its data, before map.js has made the map.
// These run before the map's own handlers, which then find it closed.
const closesHere = () => sheetMode === 'dots' || !mindMap;
$('map-close').addEventListener('click', () => { if (closesHere()) closeSheet(); });
addEventListener('keydown', (e) => { if (e.key === 'Escape' && closesHere() && !$('map').hidden) closeSheet(); });
$('intro-dots').onclick = () => openDots(dotsView?.root());

// Our GPU: the same count on the DGX Spark's GB10 (spark/search.py), through https://quran.oyenza.com/api/spark/.
async function sparkSearch(rootId) {
  const started = performance.now();
  const res = await withTimeout(fetch(`api/spark/root/${rootId}`, { cache: 'no-store' }), 4000, 'Our GPU');
  if (!res.ok) throw new Error(`answered ${res.status}`);
  const perAyah = new Uint16Array(await res.arrayBuffer());
  if (perAyah.length !== 6236) throw new Error('sent a short answer');
  const perSurah = new Uint32Array(114);
  let a = 0;
  index.forEach((surah, s) => { for (let k = 0; k < surah.ayat; k++) perSurah[s] += perAyah[a++]; });
  return { perAyah, perSurah, backend: 'spark', adapterName: res.headers.get('x-gpu') || 'DGX Spark', gpuMs: Number(res.headers.get('x-gpu-ms')) || 0, totalMs: performance.now() - started };
}

// The same choice in three places, kept in step: the index, the top bar on wide screens, and the map's header.
const WHERE_BUTTONS = '#map-where button, #bar-where button, #aa-where button';
function syncWhere() {
  for (const b of document.querySelectorAll(WHERE_BUTTONS)) {
    b.setAttribute('aria-pressed', String(b.dataset.where === settings.where));
    b.textContent = b.dataset.where === 'spark' ? t('whereSpark') : t('whereDevice');
  }
  $('where-label').textContent = t('whereLabel');
  $('where-note').textContent = settings.where === 'spark' ? t('whereSparkNote') : t('whereDeviceNote');
}
for (const b of document.querySelectorAll(WHERE_BUTTONS)) {
  b.onclick = () => {
    if (settings.where === b.dataset.where) return;
    settings.where = b.dataset.where;
    store.set('where', settings.where);
    track.event('where', { where: settings.where });
    syncWhere();
    // An open map grows again with the other engine, so the two can be compared; open dots count again (dots still
    // waiting for their data count with this choice once it is in).
    if (!$('map').hidden && sheetMode === 'dots') dotsView?.recount();
    else if (lastMap && !$('map').hidden) openMap(lastMap.rootId, lastMap.lemmaText);
  };
}

// The GPU answers first. If it doesn't answer in time, errors, or finds nothing for a root the data says is there, the
// map still grows: the same count on the CPU, and the map says why.
const withTimeout = (promise, ms, what) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error(`${what} took over ${ms / 1000} s`)), ms))]);
let cpuFallback = null;
async function findRootSafely(rootId) {
  let reason = '';
  let sparkReason = '';
  if (settings.where === 'spark') {
    try {
      return await sparkSearch(rootId);
    } catch (e) {
      console.error('our GPU', e);
      sparkReason = e?.message ?? String(e);
    }
  }
  const found = await deviceSearch(rootId, reason);
  return sparkReason ? { ...found, sparkReason } : found;
}

async function deviceSearch(rootId, reason) {
  try {
    // A GPU that is ready answers in milliseconds. One that is still starting gets 1.5 s on a phone (5 s elsewhere),
    // and the device's CPU takes over when it doesn't make it.
    const light = await withTimeout(rootFinder(), finderReady || !matchMedia('(max-width: 759px)').matches ? 5000 : 1500, 'GPU setup');
    if (light) {
      const found = await withTimeout(light.light(rootId), 3000, 'GPU search');
      const total = found.perSurah.reduce((a, b) => a + b, 0);
      // On its CPU path the module says why it left the GPU; "no WebGPU here" is the plain case and needs no detail.
      if (found.backend !== 'webgpu') return { ...found, reason: /navigator\.gpu is missing/.test(light.reason ?? '') ? '' : light.reason ?? '' };
      if (total > 0 || !(rootWords(rootId) > 0)) return found;
      reason = 'GPU found no ayah';
    }
  } catch (e) {
    console.error('GPU finder', e);
    reason = e?.message ?? String(e);
  }
  cpuFallback ??= cpuFinder();
  const found = await (await cpuFallback).light(rootId);
  return { ...found, reason };
}

// ---------- search ----------

// Exact matches in the browser (search.js); ayat related by meaning from our GPU (the Spark, via api/spark/meaning).
let searchEngine = null;
const engineReady = () => (searchEngine ??= import('./search.js?v=9b5457c').then(({ createSearch }) => createSearch({
  loadJson, wordTable, roots, hasIndonesian: async () => !!(await loadIdTexts()), loadIndonesian: loadIdTexts,
})).catch((e) => { searchEngine = null; throw e; }));
const engine = () => ({
  ready: async () => (await engineReady()).ready(),
  find: async (q) => (await engineReady()).find(q),
  family: async (...a) => (await engineReady()).family(...a),
  ayahOfWord: async (...a) => (await engineReady()).ayahOfWord(...a),
});
async function meaningSearch(query) {
  void query;
  return null;
}

let searchSheet = null;
const search = () => (searchSheet ??= createSearchSheet({
  $, el, num, index, roots, lang: () => settings.lang, loadSurah, wordText, engine: engine(), meaning: meaningSearch,
  loadIndonesian: loadIdTexts, currentSurah: () => view?.n ?? 0,
  homeHash: () => (view ? `#s${view.n}` : location.pathname + location.search),
  onAyah: (s, ayah, word) => goToAyah(s, ayah, 0, word),
}));
$('bar-search').onclick = () => { if (index.length) { track.event('search', { from: 'bar' }); search().go(''); } };
// The indexes (about 900 KB) load when someone starts to search, not for every visitor.
const warmSearch = () => { if (index.length) { engine().ready().catch(() => {}); loadIdTexts(); } };
$('intro-q').addEventListener('focus', warmSearch, { once: true });
$('sheet-q').addEventListener('focus', warmSearch, { once: true });
$('intro-search').onsubmit = (e) => {
  e.preventDefault();
  const q = $('intro-q').value;
  if (!q.trim() || !index.length) return;
  $('intro-q').blur();
  track.event('search', { from: 'home' });
  search().go(q);
};
function labelSearch(lang) {
  const ss = searchStrings(lang);
  $('bar-search-label').textContent = ss.search;
  $('bar-search').ariaLabel = ss.button;
  $('intro-q').placeholder = ss.placeholder;
  $('intro-q').ariaLabel = ss.button;
  $('intro-go').textContent = ss.search;
  $('intro-try').replaceChildren(el('span', { className: 'label', textContent: ss.tryThese }), ...TRY.map((q) => {
    const b = el('button', { type: 'button', textContent: q });
    if (/[؀-ۿ]/.test(q)) b.lang = 'ar';
    b.onclick = () => { if (index.length) search().go(q); };
    return b;
  }));
  searchSheet?.relabel();
}

// Opens surah s at ayah index `ayah`: with root r lit, or with one word picked and flagged (word = {lemma, pos, i}: the
// word at index i, from the same-count places, or else the first word of that ayah with this base form and type).
function goToAyah(s, ayah, r, word) {
  const land = () => {
    if (!view?.ayat[ayah]) return;
    const now = performance.now();
    // A card open above the target would close with a glide after the jump and pull the target up: it closes now.
    if (word && view.selected) unpickNow(now);
    // Right after a surah opens only its first screens have heights; relayout() measures the rest in slices between
    // frames. A jump can't wait for them, or it falls short (2:40 landed at 2:17): the ayat up to the target, and two
    // screens past it so the page is tall enough to bring it to the top, are measured now and the stack lands at once.
    measureThrough(ayah, now);
    const ay = view.ayat[ayah];
    catchUp(ay, now);
    view.stack.nudge(now, true);
    view.stackOut = view.stack.step(now);
    draw();
    const i = word ? wordIn(ay.words, word) : -1;
    // A word far down a long ayah: its line comes to the upper third of the screen, not the ayah's first line.
    const lineY = i >= 0 ? ay.out.tiles[i].y : 0;
    const into = lineY > innerHeight * 0.45 ? lineY - innerHeight * 0.3 : 0;
    const top = Math.max(0, view.page.getBoundingClientRect().top + scrollY + view.stackOut.tops[ayah] + into - 72);
    // A long way is a jump; a short one glides.
    const far = Math.abs(top - scrollY) > innerHeight * 2;
    scrollTo({ top, behavior: reduced.matches || far || word ? 'auto' : 'smooth' });
    if (word) {
      if (view.root) setRoot(0, now);
      updateWindow();
      if (i >= 0) flagWord(ayah, i);
    } else if (r) setRoot(r, now);
  };
  if (view?.n === s) land();
  else { closeSurah(true); openSurah(s, null, land); }
}
function openApiResult(surah, ayah, action) {
  const meta = index[surah - 1];
  if (!meta) return;
  const verse = Math.min(meta.ayat, Math.max(1, Number(ayah) || 1));
  const open = () => {
    goToAyah(surah, verse - 1, 0);
    if (action === 'tafsir') openTafsir(surah, verse);
    else if (action === 'play') {
      if (audioUI?.n === surah) audioUI.playAyah(verse).then((started) => { if (!started) openTafsir(surah, verse); });
      else openTafsir(surah, verse);
    }
  };
  if (view?.n === surah) open();
  else openSurah(surah, null, open);
}
function measureThrough(target, now) {
  const g = geometry();
  let past = 0;
  for (const ay of view.ayat) {
    if (ay.a > target && past > innerHeight * 2) break;
    if (!ay.node) layoutAyah(ay, g, view.lineWidth, 0, -1, now, true);
    if (ay.a > target) past += ay.height + 22;
  }
}
const wordIn = (words, { lemma, pos, i }) => {
  if (i >= 0 && i < words.length) return i;
  const k = words.findIndex((w) => w[2] === lemma && w[3] === pos);
  return k >= 0 ? k : words.findIndex((w) => w[2] === lemma);
};
function unpickNow(now) {
  const { a, i } = view.selected;
  const ay = view.ayat[a];
  ay.machine.set(ay.machine.built.cells.open, 0);
  ay.machine.nudge(now, true);
  ay.out = ay.machine.step(now);
  setHeight(ay, ay.out.height, now, true);
  setTileExpanded(ay, i, false);
  ay.tiles?.[i]?.classList.remove('found');
  view.selected = null;
}
// The word a jump was for: picked, so it lifts and its card opens, and ringed in copper until the next pick.
function flagWord(a, i) {
  const ay = view.ayat[a];
  if (!ay.node) { catchUp(ay, performance.now()); mountAyah(ay); }
  if (view.selected?.a !== a || view.selected?.i !== i) tapWord(a, i);
  ay.tiles[i]?.classList.add('found');
}

// ---------- zoom between a surah's sheet and the page ----------

const zoom = createMachine(program('zoom'));
let zoomFrame = 0;
function zoomRun(onDone) {
  const node = $('zoom');
  const step = (now) => {
    const o = zoom.step(now);
    node.style.transform = `translate3d(${o.x}px, ${o.y}px, 0)`;
    node.style.width = `${o.w}px`;
    node.style.height = `${o.h}px`;
    if (zoom.running()) zoomFrame = requestAnimationFrame(step);
    else { zoomFrame = 0; onDone?.(); }
  };
  cancelAnimationFrame(zoomFrame);
  zoomFrame = requestAnimationFrame(step);
}
function setRect(rect, r) {
  const c = zoom.built.cells[rect];
  zoom.set(c.x, quarter(r.x)); zoom.set(c.y, quarter(r.y)); zoom.set(c.w, quarter(r.width)); zoom.set(c.h, quarter(r.height));
}
function targetRect() {
  const phone = innerWidth < 760;
  const width = phone ? innerWidth : Math.min(820, innerWidth - 32);
  const top = phone ? 48 : 64;
  return { x: (innerWidth - width) / 2, y: top, width, height: innerHeight - top };
}
async function zoomOpen(from) {
  if (!from || reduced.matches) return null;
  setRect('from', from.getBoundingClientRect());
  setRect('to', targetRect());
  zoom.set(zoom.built.cells.open, 0);
  zoom.nudge(performance.now(), true);
  zoom.step(performance.now());
  $('zoom').hidden = false;
  zoom.set(zoom.built.cells.open, 1);
  zoom.nudge(performance.now());
  await new Promise((resolve) => zoomRun(resolve));
  return () => { $('zoom').hidden = true; };
}
function zoomClose(tile) {
  if (reduced.matches) return;
  setRect('from', tile.getBoundingClientRect());
  setRect('to', targetRect());
  zoom.set(zoom.built.cells.open, 1);
  zoom.nudge(performance.now(), true);
  zoom.step(performance.now());
  $('zoom').hidden = false;
  zoom.set(zoom.built.cells.open, 0);
  zoom.nudge(performance.now());
  zoomRun(() => { $('zoom').hidden = true; });
}

// ---------- controls ----------

function setLang(lang) {
  settings.lang = lang;
  store.set('lang', lang);
  for (const b of $('lang').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  document.documentElement.lang = lang;
  $('back-label').textContent = t('back');
  $('back').ariaLabel = t('backLabel');
  $('intro-title').textContent = t('homeTitle');
  $('home-sub').textContent = t('homeSub');
  if ($('feature-gulir-title')) $('feature-gulir-title').textContent = lang === 'en' ? 'Ayah Scroll' : 'Gulir Ayat';
  if ($('feature-gulir-sub')) $('feature-gulir-sub').textContent = lang === 'en' ? 'One ayah per screen · save, study and keep daily reading progress.' : 'Satu ayat per layar · simpan, pelajari, dan catat progres harian.';
  syncWhere();
  $('intro-text').textContent = t('intro');
  $('about-text').textContent = t('intro');
  $('intro-same-title').textContent = t('sameTitle');
  $('intro-same-sub').textContent = t('sameSub');
  $('popular-h').textContent = t('popular');
  $('list-h').textContent = t('allSurahs');
  $('root-map').textContent = t('map');
  labelChrome();
  sameSheet?.relang();
  labelSearch(lang);
  const dt = dotsText(lang);
  $('intro-dots-title').textContent = dt.cardButton;
  $('intro-dots-sub').textContent = dt.indexButton.replace(/\s*→$/, '');
  for (const b of $('map-mode').querySelectorAll('button')) b.textContent = b.dataset.mode === 'dots' ? dt.modeDots : dt.modeMap;
  dotsView?.relang();
  netPanel?.relang();
  ibadahUI?.relang(lang);
  ilmUI?.relang(lang);
  renderIndex();
  renderPopular();
  renderGreeting();
  syncTrans();
  audioUI?.relang();
  audioUI?.refresh();
  if (view) {
    if (!$('tafsir').hidden) $('tafsir-title').textContent = `${EQURAN_TEXT[lang].tafsir} · ${view.meta.latin}`;
    $('note-id')?.remove();
    if (lang === 'id' && !hasIndonesian(view.data)) $('sheet-head').append(el('p', { className: 'note-id', id: 'note-id', textContent: T.id.noIndonesian }));
    $('head-meaning').textContent = surahMeaning(view.meta);
    $('head-facts').textContent = `${view.meta.ayat} ${t('ayat')} · ${placeName(view.meta)}`;
    setWhere(view.meta);
    if (view.card && view.selected) {
      const card = view.card.clip.firstChild;
      const w = view.ayat[view.selected.a].words[view.selected.i];
      card.replaceChildren();
      if (w) fillCard(card, w); else fillLinks(card, view.selected.a, view.selected.i);
    }
    if (view.root) setRoot(view.root, performance.now());
    keepWatchedWord(() => relayout(performance.now()));
    schedule();
    if (lang === 'id' && !view.trans) {
      const at = view;
      loadTrans(at.n).then((trans) => {
        if (view !== at || at.trans) return;
        at.trans = trans;
        if (settings.lang === 'id') { relayout(performance.now()); updateWindow(); schedule(); }
      }, () => {});
    }
  }
}
for (const b of $('lang').querySelectorAll('button')) b.onclick = () => { if (b.dataset.lang !== settings.lang) track.event('lang', { lang: b.dataset.lang }); setLang(b.dataset.lang); };

// The words on the tabs, the Aa sheet and the install guide, in the page's language.
function labelChrome() {
  $('tab-home-l').textContent = t('tabHome');
  $('tab-search-l').textContent = t('tabSearch');
  $('tab-same-l').textContent = t('tabSame');
  $('tab-aa-l').textContent = t('tabAa');
  $('tabs').ariaLabel = t('menu');
  for (const id of ['bar-aa', 'home-aa']) $(id).ariaLabel = t('aa');
  $('aa-title').textContent = t('aa');
  $('aa-done').textContent = t('done');
  $('size').ariaLabel = t('size');
  $('size-range').ariaLabel = t('size');
  const [smaller, larger] = $('size').querySelectorAll('button');
  smaller.ariaLabel = t('smaller');
  larger.ariaLabel = t('larger');
  $('lang-label').textContent = t('langLabel');
  $('tr-label').textContent = t('trLabel');
  syncOffline();
  syncInstall();
  if (!$('install').hidden) renderInstall();
}

// Text size: the slider, the two A buttons, and a preview of the basmala at that size.
function setSize(size) {
  size = Math.min(SIZES.length - 1, Math.max(0, size));
  if (size === settings.size) return;
  settings.size = size;
  store.set('size', size);
  syncSize();
  keepWatchedWord(() => relayout(performance.now()));
  schedule();
}
for (const b of $('size').querySelectorAll('button')) b.onclick = () => setSize(settings.size + Number(b.dataset.step));
$('size-range').max = String(SIZES.length - 1);
$('size-range').oninput = () => setSize(Number($('size-range').value));
const syncSize = () => {
  const [smaller, larger] = $('size').querySelectorAll('button');
  smaller.disabled = settings.size === 0;
  larger.disabled = settings.size === SIZES.length - 1;
  $('size-range').value = String(settings.size);
  $('size-range').style.setProperty('--fill', `${(settings.size / (SIZES.length - 1)) * 100}%`);
  $('size-prev').style.fontSize = `${fontSize()}px`;
  $('size-prev').textContent = basmala;
};

// The Kemenag translation under each ayah: on by default in the ID view, and only there.
function syncTrans() {
  const sw = $('tr-switch');
  sw.setAttribute('aria-checked', String(settings.trans && settings.lang === 'id'));
  sw.disabled = settings.lang !== 'id';
  $('tr-note').textContent = t('trNote');
}
$('tr-switch').onclick = () => {
  if (settings.lang !== 'id') return;
  settings.trans = !settings.trans;
  store.set('trans', settings.trans);
  syncTrans();
  if (view) { relayout(performance.now()); updateWindow(); schedule(); }
};

const goHome = (instant) => { history.replaceState(null, '', location.pathname); searchSheet?.hide(); sameSheet?.closeBar(); closeSurah(instant); track.view('/', 'Home'); };
$('back').onclick = () => goHome(false);

// ---------- the home ----------

// Oyen's face, drawn by the built Oyen's own code (vendor/oyen-face). He moves for a moment when he appears, then
// rests, so an idle home costs nothing; with Reduce Motion he only rests.
// Where in its loop each mood rests: the moment that says it (the tick of tercatat, the wide eyes of wow).
const REST = { tercatat: 0.95, wow: 0.5, think: 0.6, sad: 0.5 };
const restFace = (mood) => faceSVG(mood, (REST[mood] ?? 0) * (MOODS[mood] ?? 0), { size: 96 });
function playFace(node, mood, loops = 1) {
  cancelAnimationFrame(node.faceFrame);
  const rest = () => { node.innerHTML = restFace(mood); };
  if (reduced.matches) { rest(); return; }
  const length = (MOODS[mood] ?? 2) * loops;
  const t0 = performance.now();
  const step = (now) => {
    const t = (now - t0) / 1000;
    if (t >= length || document.hidden) { rest(); return; }
    node.innerHTML = faceSVG(mood, t, { size: 96 });
    node.faceFrame = requestAnimationFrame(step);
  };
  node.faceFrame = requestAnimationFrame(step);
}
// Oyen's greeting: the ayah you stopped at, or where to start on a first visit.
function renderGreeting() {
  if (!index.length) return;
  const last = store.get('last', null);
  const meta = last && index[last.n - 1];
  const h = new Date().getHours();
  const hi = t('hi')[h >= 4 && h < 10 ? 0 : h >= 10 && h < 15 ? 1 : h >= 15 && h < 18 ? 2 : 3];
  const next = meta && last.done ? index[meta.n] : null;
  if (next) {
    $('greet-hi').textContent = `${hi} · ${t('doneHi')(meta.latin)}`;
    $('greet-what').textContent = next.latin;
    $('greet-pos').textContent = `${next.n} · ${next.ayat} ${t('ayat')} · ${placeName(next)}`;
    $('greet-go').textContent = t('nextGo');
    $('greet-go').onclick = () => openSurah(next.n, $('greet'));
  } else if (meta) {
    const a = Math.min(meta.ayat - 1, Math.max(0, last.a | 0));
    $('greet-hi').textContent = `${hi} · ${t('continueHi')}`;
    $('greet-what').textContent = meta.latin;
    $('greet-pos').textContent = t('ayahOf')(a + 1, meta.ayat);
    $('greet-go').textContent = t('continueGo');
    $('greet-go').onclick = () => goToAyah(meta.n, a, 0);
  } else {
    $('greet-hi').textContent = t('startHi');
    $('greet-what').textContent = t('startWhat')(index[0].latin);
    $('greet-pos').textContent = t('startPos');
    $('greet-go').textContent = t('startGo');
    $('greet-go').onclick = () => openSurah(1, $('greet'));
  }
  if (!$('index-view').hidden) playFace($('greet-face'), 'hello');
}
// The surahs read most often (Yaseen, Al-Kahf, Al-Mulk, Ar-Rahmaan, Al-Waaqia), one tap away.
const POPULAR = [36, 18, 67, 55, 56];
function renderPopular() {
  if (!index.length) return;
  $('popular').replaceChildren(...POPULAR.map((n) => {
    const s = index[n - 1];
    const b = el('button', { type: 'button', className: 'chip' }, el('b', { textContent: s.latin }), el('span', { textContent: `${n} · ${s.ayat} ${t('ayat')}` }));
    b.onclick = () => openSurah(n, b);
    return b;
  }));
}
$('tab-home').onclick = () => scrollTo({ top: 0, behavior: reduced.matches ? 'auto' : 'smooth' });
$('tab-search').onclick = () => { if (index.length) search().go(''); };
$('tab-same').onclick = openSame;

// The place you are reading, kept so the home and the installed app can take you back to it.
let lastTimer = 0;
function saveLast(now = false) {
  clearTimeout(lastTimer);
  const write = () => {
    if (!view?.stackOut) return;
    const anchor = anchorAyah();
    const a = anchor ? anchor.a : 0;
    const prev = store.get('last', null);
    const done = prev?.n === view.n && prev.done && a >= view.ayat.length - 3;
    store.set('last', done ? { n: view.n, a, done: true } : { n: view.n, a });
  };
  if (now) write(); else lastTimer = setTimeout(write, 700);
}

// ---------- Oyen's hint, the first time a surah opens ----------

// Once, ever: a toast from the bottom of the screen (never on the page) and a glow on the first word.
function showHint() {
  if (!view || store.get('hinted', false) || !$('hint').hidden || !$('placebar').hidden) return;
  store.set('hinted', true);
  $('hint-title').textContent = t('hintTitle');
  $('hint-sub').textContent = t('hintSub');
  $('hint-ok').textContent = t('hintOk');
  $('hint').hidden = false;
  playFace($('hint-face'), 'look', 2);
  view.ayat[0]?.tiles?.[0]?.classList.add('hinted');
}
function hideHint() {
  if ($('hint').hidden) return;
  $('hint').hidden = true;
  document.querySelector('.tile.hinted')?.classList.remove('hinted');
}
$('hint-ok').onclick = hideHint;

// ---------- the end of a surah ----------

// Under the last ayah, on the ground below the page: once it is really reached (the surah is laid out to its end and
// the reader has scrolled, or stayed a few seconds), the surah is kept as read and the next one is offered.
let endState = { armed: false, seen: false, visible: false, timer: 0 };
function renderEnd() {
  const meta = view.meta;
  const next = index[meta.n];
  $('end-title').textContent = t('endTitle')(meta.latin);
  $('end-text').textContent = t('endText')(meta.ayat);
  $('end-next').textContent = next ? t('endNext')(next.latin) : t('endHome');
  $('end-next').onclick = () => (next ? goToAyah(next.n, 0, 0) : goHome(false));
  $('end-face').innerHTML = faceSVG('hello', 0, { size: 96 });
  $('end-card').hidden = false;
  clearTimeout(endState.timer);
  endState = { armed: false, seen: false, visible: false, timer: setTimeout(armEnd, 6000) };
}
function armEnd() {
  if (endState.armed) return;
  endState.armed = true;
  checkEnd();
}
function checkEnd() {
  if (!view || endState.seen || !endState.armed || !endState.visible) return;
  if (!(view.ayat[view.ayat.length - 1].height > 0)) return;
  endState.seen = true;
  clearTimeout(lastTimer);
  store.set('last', { n: view.n, a: view.ayat.length - 1, done: true });
  playFace($('end-face'), 'tercatat');
}
new IntersectionObserver((entries) => {
  for (const e of entries) { endState.visible = e.isIntersecting; checkEnd(); }
}, { threshold: 0.6 }).observe($('end-card'));

// ---------- sheets ----------

const PHONE = matchMedia('(max-width: 759px)');
const sheets = createSheets({ reduced });
sheets.own('aa', { handle: '.panel-head' });
sheets.own('install', { handle: '.panel-head' });
sheets.own('tafsir', { handle: '.panel-head' });
ibadahUI = createIbadahFeatures({ sheets, onNavigate: openApiResult });
ilmUI = createIlmFeatures({ sheets, onNavigate: openApiResult, getSurahs: async () => { await indexReady; return index; }, initialLang: settings.lang });
sheets.adopt('map', { handle: '.map-head', closeButton: 'map-close' });
sheets.adopt('same', { handle: '.same-head', closeButton: 'same-close', onShow: () => playFace($('same-oyen'), 'happy') });
sheets.adopt('search', { handle: '.search-head', closeButton: 'search-close' });
sheets.adopt('net', { handle: '.net-head', closeButton: 'net-close', scrim: false, slide: false });
function openAa() {
  syncSize();
  syncTrans();
  askCache();
  syncOffline();
  syncInstall();
  sheets.open('aa');
}
for (const id of ['bar-aa', 'home-aa', 'tab-aa']) $(id).onclick = openAa;
$('aa-done').onclick = () => sheets.close('aa');
$('install-done').onclick = () => sheets.close('install');
$('tafsir-done').onclick = () => sheets.close('tafsir');
// On a wide screen Aa is a popover: a click anywhere else puts it away.
document.addEventListener('pointerdown', (e) => {
  if ($('aa').hidden || PHONE.matches || e.target.closest('#aa, #bar-aa, #home-aa, #tab-aa')) return;
  sheets.close('aa');
});

// ---------- the bar while reading ----------

function showBar(on) { $('bar').classList.toggle('away', !on); }
let lastY = scrollY;
// Only writes: what it reads (the page's height) was read at the start of the frame, before the window changed it.
function onScroll(room) {
  const y = scrollY;
  const dy = y - lastY;
  lastY = y;
  document.body.classList.toggle('scrolled', y > 56);
  if (!view) { $('bar-progress').style.transform = ''; return; }
  // Reading down arms the end card (the scroll to the top when a surah opens does not), and puts the hint away.
  if (y > 120) armEnd();
  if (y > 40) hideHint();
  // On a phone the bar gets out of the way while you read down, and comes back the moment you scroll up.
  if (PHONE.matches) {
    if (y < 60 || dy < -4) showBar(true);
    else if (dy > 4 && !sheets.anyOpen()) showBar(false);
  }
  $('bar-progress').style.transform = `scaleX(${room > 0 ? Math.min(1, Math.max(0, y / room)).toFixed(4) : 0})`;
  saveLast();
}

let scrollFrame = 0;
addEventListener('scroll', () => {
  scrollFrame ||= requestAnimationFrame(() => {
    scrollFrame = 0;
    const room = view ? document.documentElement.scrollHeight - innerHeight : 0;
    updateWindow();
    onScroll(room);
  });
}, { passive: true });
let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (view && quarter(view.page.clientWidth) !== view.lineWidth) { relayout(performance.now()); updateWindow(); schedule(); } }, 80);
});
addEventListener('hashchange', () => {
  // #cari/<query> is the search sheet, over whatever is open; any other address closes it.
  const q = queryOf(location.hash);
  if (q !== null) { if (index.length) search().open(q); return; }
  searchSheet?.hide();
  const m = /^#s(\d{1,3})$/.exec(location.hash);
  // Going back or forward through the history leaves the word's places; a step of the place bar changes the hash too,
  // but to the surah it is already opening.
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 114) { if (view?.n !== Number(m[1]) && opening !== Number(m[1])) { sameSheet?.closeBar(); closeSurah(true); openSurah(Number(m[1])); } }
  else {
    sameSheet?.closeBar();
    if (opening) openTicket++;
    if (view) closeSurah(true);
    track.view('/', 'Home');
  }
});
// iOS shows :active (the press state) only on pages that listen for touches.
addEventListener('touchstart', () => {}, { passive: true });
// The installed iPhone app has no back button: a swipe from the left edge goes back to the surahs.
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
edgeBack({ target: () => $('main'), canStart: () => standalone() && !!view && !sheets.anyOpen(), onBack: () => goHome(true), reduced });

// ---------- the offline copy (sw.js) ----------

// The worker keeps every file the site has shown on the phone, so a second visit opens at once and an opened surah
// reads without internet; "Download" in Aa saves all of them. A new release takes over only while the page is out
// of sight, and the page reloads then, so nothing changes under someone reading.
let offline = { cachedData: 0, totalData: 0, busy: false, failed: false, done: 0, total: 0 };
const worker = 'serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)) ? navigator.serviceWorker : null;
let hadController = !!worker?.controller;
let shownAt = -Infinity;                                       // when the page last came back into sight
let touchedAt = -Infinity;                                     // the last tap, key or wheel on it
function whenHidden(fn) {
  if (document.hidden) { fn(); return; }
  const on = () => { if (!document.hidden) return; document.removeEventListener('visibilitychange', on); fn(); };
  document.addEventListener('visibilitychange', on);
}
if (worker) {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) shownAt = performance.now(); });
  for (const type of ['pointerdown', 'keydown', 'wheel']) addEventListener(type, () => { touchedAt = performance.now(); }, { capture: true, passive: true });
  addEventListener('load', () => {
    worker.register('sw.js').then((reg) => {
      // The waiting release is asked on every hide: it takes over only when this is the site's one open page, so with
      // a second tab open the ask does nothing, and the next hide asks again.
      const handOver = () => { if (document.hidden && reg.waiting && worker.controller) reg.waiting.postMessage({ type: 'skip-waiting' }); };
      document.addEventListener('visibilitychange', handOver);
      // A new worker may already be installing when this runs (the browser checks on every visit): it is watched too.
      const watch = (next) => next?.addEventListener('statechange', () => { if (next.state === 'installed') handOver(); });
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      handOver();
    }).catch((e) => console.error('offline copy', e));
  });
  worker.addEventListener('controllerchange', () => {
    if (!hadController) { hadController = true; askCache(); return; }
    // The ask went out as the page went away, and the take-over can land just after it came back: within 3 s of that,
    // with nothing tapped or scrolled yet, the page reloads at once, before anyone reads on; else at the next hide.
    if (document.hidden || (performance.now() - shownAt < 3000 && touchedAt < shownAt)) location.reload();
    else whenHidden(() => location.reload());
  });
  worker.addEventListener('message', (e) => {
    const m = e.data ?? {};
    if (m.type === 'cache-status') offline = { ...offline, cachedData: m.cachedData, totalData: m.totalData };
    else if (m.type === 'download-progress') offline = { ...offline, busy: true, failed: false, done: m.done, total: m.total };
    else if (m.type === 'download-done') offline = { ...offline, busy: false, cachedData: offline.totalData || m.total, totalData: offline.totalData || m.total };
    else if (m.type === 'download-error') offline = { ...offline, busy: false, failed: true, code: m.code, done: m.done, total: m.total };
    else return;
    syncOffline();
  });
}
function askCache() { worker?.controller?.postMessage({ type: 'cache-status' }); }
function syncOffline() {
  const go = $('offline-go');
  const note = $('offline-note');
  $('offline-label').textContent = t('offlineLabel');
  go.textContent = t('offlineGo');
  go.hidden = false;
  if (!worker?.controller) { note.textContent = worker ? t('offlineNote') : t('offlineNoWorker'); go.disabled = true; return; }
  if (offline.busy) { note.textContent = t('offlineBusy')(offline.total ? Math.round((offline.done / offline.total) * 100) : 0); go.disabled = true; return; }
  const saved = offline.totalData > 0 && offline.cachedData >= offline.totalData;
  note.textContent = offline.failed ? t('offlineStop')[offline.code] ?? t('offlineFail') : saved ? t('offlineDone') : offline.cachedData > 0 ? t('offlinePartial')(offline.cachedData, offline.totalData) : t('offlineNote');
  go.hidden = saved;
  go.disabled = false;
}
$('offline-go').onclick = () => {
  if (!worker?.controller) return;
  offline = { ...offline, busy: true, failed: false, done: 0 };
  syncOffline();
  track.event('offline');
  worker.controller.postMessage({ type: 'download-all' });
};

// ---------- installing ----------

// Visits to the site in this browser, for the install nudge (it waits for the second).
const visits = (store.get('visits', 0) | 0) + 1;
store.set('visits', visits);

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// The browsers inside Instagram, Facebook, TikTok, LINE and X can't add a site to the home screen.
const inAppBrowser = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|BytedanceWebview|Twitter/i.test(ua);
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; syncInstall(); });
addEventListener('appinstalled', () => { installPrompt = null; syncInstall(); track.event('installed'); });
function syncInstall() {
  $('install-label').textContent = t('installLabel');
  $('install-row').hidden = standalone() || !(installPrompt || isIOS || inAppBrowser);
  syncNudge();
}
// The nudge under Oyen's greeting: from the second visit, where the site can be installed, until it is installed or
// put away (then not for 30 days).
function syncNudge() {
  const away = Date.now() - (Number(store.get('nudgeOff', 0)) || 0) < 30 * 864e5;
  const show = !$('install-row').hidden && visits >= 2 && !away;
  $('nudge-title').textContent = t('nudgeTitle');
  $('nudge-sub').textContent = t('nudgeSub');
  $('nudge-go').textContent = t('nudgeGo');
  $('nudge-x').ariaLabel = t('nudgeClose');
  if (show && $('nudge').hidden) { $('nudge').hidden = false; playFace($('nudge-face'), 'happy'); }
  else if (!show) $('nudge').hidden = true;
}
$('nudge-go').onclick = () => $('install-row').click();
$('nudge-x').onclick = () => { store.set('nudgeOff', Date.now()); $('nudge').hidden = true; };
$('install-row').onclick = async () => {
  track.event('install', { prompt: Boolean(installPrompt && !inAppBrowser) });
  if (installPrompt && !inAppBrowser) {
    const prompt = installPrompt;
    installPrompt = null;
    prompt.prompt();
    await prompt.userChoice.catch(() => null);
    syncInstall();
    return;
  }
  sheets.close('aa');
  renderInstall();
  sheets.open('install');
};
const STEP_ICONS = [
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 9H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1.5"/><path d="M12 14V3M8.5 6.5 12 3l3.5 3.5"/></svg>',
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
  '',
];
function renderInstall() {
  $('install-title').textContent = inAppBrowser ? t('inAppTitle') : t('installTitle');
  $('install-text').textContent = inAppBrowser ? t('inAppText') : t('installText');
  $('install-done').textContent = t('later');
  $('install-steps').hidden = inAppBrowser;
  $('install-steps').replaceChildren(...(inAppBrowser ? [] : t('installSteps').map((text, k) => {
    const icon = el('span');
    icon.innerHTML = STEP_ICONS[k] ?? '';
    return el('li', {}, el('em', { textContent: String(k + 1) }), el('span', { textContent: text }), icon);
  })));
  playFace($('install-face'), 'happy');
}

let toastTimer = 0;
function toast(text) {
  const n = $('toast');
  n.textContent = text;
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { n.hidden = true; }, 5000);
}

// The page's width can change without a window resize (a scrollbar appearing), so the page itself is watched.
const resizeWatch = new ResizeObserver(() => {
  if (view && quarter(view.page.clientWidth) !== view.lineWidth) { relayout(performance.now()); updateWindow(); schedule(); }
});

// The networks of every size are built in idle time while the home is read, so the first surah opens without a wait.
function warm() {
  const sizes = [...AYAH_SIZES.map((n) => ['ayah', n]), ...STACK_SIZES.map((n) => ['stack', n])];
  const next = () => {
    const item = sizes.shift();
    if (!item) return;
    createMachine(program(item[0], item[1]));
    (window.requestIdleCallback ?? setTimeout)(next);
  };
  (window.requestIdleCallback ?? setTimeout)(next);
}

// ---------- start ----------

let basmala = '';
async function start() {
  // The first screen (a surah's own address counts when it opens), then how this visit opened: the installed app or a
  // browser tab, and the settings it came with.
  if (!/^#s\d/.test(location.hash)) track.view(queryOf(location.hash) !== null ? '/cari' : '/', 'Home');
  track.event('open', { app: standalone() ? 'installed' : 'browser', lang: settings.lang, where: settings.where });
  try {
    index = await loadJson('data/index.json');
  } catch {
    $('index-loading').textContent = settings.lang === 'en' ? 'The surahs could not be loaded. Reload the page to try again.' : 'Daftar surah belum bisa dimuat. Muat ulang halaman untuk mencoba lagi.';
    return;
  }
  markIndexReady();
  setLang(settings.lang);
  syncSize();
  renderCredits();
  warm();
  loadRoots().catch(() => {});
  loadEquranCatalog().catch(() => {});
  // Al-Fatihah's first ayah is the basmala that the home and the text-size preview show (from the data, never typed).
  loadSurah(1).then((fatihah) => {
    basmala = fatihah.ayat[0].map((w) => w[0]).join(' ');
    $('intro-basmala').textContent = basmala;
    syncSize();
  }).catch(() => {});
  const m = /^#s(\d{1,3})$/.exec(location.hash);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 114) {
    const n = Number(m[1]);
    const last = store.get('last', null);
    // Opened again on the surah it was left on (a reload, or the installed app coming back): back to that ayah.
    if (last?.n === n && last.a > 0) goToAyah(n, last.a, 0);
    else openSurah(n);
  } else if (queryOf(location.hash) !== null) search().open(queryOf(location.hash));
}

// The attribution the sources require (data/SOURCES.md), on every page.
function renderCredits() {
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener', textContent: text });
  $('credits').replaceChildren(
    el('p', {}, 'Quran text: Tanzil Project, Tanzil Quran Text (Uthmani, version 1.1), used verbatim under the Tanzil terms of use (CC BY 3.0), ', link('https://tanzil.net', 'tanzil.net'), '. Surah names and metadata: Tanzil Project.'),
    el('p', {}, 'Root, lemma, part of speech, English word-by-word translation and transliteration: Quranic Arabic Corpus, Kais Dukes, GNU General Public License, ', link('https://corpus.quran.com', 'corpus.quran.com'), '.'),
    el('p', {}, 'Terjemahan bahasa Indonesia per ayat: Kementerian Agama Republik Indonesia, dari ', link('https://tanzil.net/trans/', 'Tanzil'), ', untuk penggunaan non-komersial.'),
    el('p', {}, 'Audio qari dan tafsir per ayat: ', link('https://equran.id/apidev/v2', 'EQuran.id API v2'), '; sumber data tafsir: Kementerian Agama Republik Indonesia.'),
    el('p', {}, 'Layout and motion: ', link('https://github.com/chenglou/handwired', 'Handwired'), ' by Cheng Lou (MIT).'));
}

start();
