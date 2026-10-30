const API = 'https://equran.id';
const CACHE_DB = 'quran-oyen-islamic-api';
const CACHE_STORE = 'responses';
const memory = new Map();
let database;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const TEXT = {
  id: {
    featureTitle: 'Fitur ibadah', vectorTitle: 'Cari berdasarkan makna', vectorSub: 'Temukan ayat dan tafsir dengan pertanyaan sehari-hari.',
    doaFeature: 'Doa & dzikir', doaSub: 'Bacaan Arab, Latin, arti, dan keterangan.', prayerFeature: 'Jadwal sholat', prayerSub: 'Pilih provinsi dan kabupaten/kota untuk melihat jadwal.',
    vectorPanel: 'Pencarian makna Al-Qur’an', vectorHint: 'Tulis pertanyaan dalam bahasa sehari-hari. Pencarian dikirim ke EQuran.id.',
    vectorPlaceholder: 'Contoh: ayat tentang sabar menghadapi cobaan', vectorButton: 'Cari makna', vectorType: 'Jenis hasil', vectorAll: 'Ayat dan tafsir', vectorAyat: 'Ayat saja', vectorTafsir: 'Tafsir saja',
    vectorLoading: 'Mencari ayat dan tafsir…', vectorEmpty: 'Belum ada hasil yang cocok. Coba ubah pertanyaan atau gunakan kata yang lebih spesifik.', vectorError: 'Pencarian belum berhasil. Periksa koneksi lalu coba lagi.',
    results: (n) => `${n} hasil`, ayah: (s, a) => `${s} · Ayat ${a}`, ayatType: 'Ayat', tafsirType: 'Tafsir', relevance: 'Kecocokan',
    openAyah: 'Buka ayat', openTafsir: 'Buka tafsir ayat', playAyah: 'Putar ayat', latin: 'Latin', translation: 'Terjemahan',
    doaPanel: 'Doa dan dzikir', doaHint: 'Jelajahi bacaan berdasarkan kategori atau cari doa, dzikir, dan artinya.', doaSearch: 'Cari doa, dzikir, atau kata…', doaCategory: 'Kategori doa', allGroups: 'Semua kategori', doaLoading: 'Memuat daftar doa dan dzikir…', doaError: 'Daftar doa belum dapat dimuat. Periksa koneksi lalu coba lagi.', doaEmpty: 'Tidak ada doa yang cocok dengan pencarian ini.',
    readLatin: 'Bacaan Latin', meaning: 'Arti', moreInfo: 'Keterangan dan sumber', tags: 'Tag',
    prayerPanel: 'Jadwal sholat', prayerHint: 'Pilih lokasi untuk melihat waktu sholat. Pilihan lokasi disimpan di perangkat ini.', province: 'Provinsi', city: 'Kabupaten/kota', chooseProvince: 'Pilih provinsi', chooseCity: 'Pilih kabupaten/kota',
    prayerLoadingProvince: 'Memuat daftar provinsi…', prayerLoadingCity: 'Memuat kabupaten/kota…', prayerLoading: 'Memuat jadwal sholat…', prayerError: 'Jadwal belum dapat dimuat. Periksa koneksi lalu coba lagi.', chooseLocation: 'Pilih provinsi dan kabupaten/kota untuk menampilkan jadwal.',
    today: 'Jadwal hari ini', monthSchedule: 'Jadwal satu bulan', todayNone: 'Tidak ada jadwal untuk tanggal ini pada bulan yang dipilih.', previousMonth: 'Bulan sebelumnya', nextMonth: 'Bulan berikutnya', currentMonth: 'Kembali ke bulan ini',
    prayers: ['Imsak', 'Subuh', 'Terbit', 'Dhuha', 'Dzuhur', 'Ashar', 'Maghrib', 'Isya'], date: 'Tanggal', source: 'Sumber: EQuran.id API. Doa bersumber dari katalog doa/dzikir EQuran.id.',
    cached: 'Data ditampilkan dari cache perangkat; sambungkan internet untuk memperbarui.', cachedShort: 'Data tersimpan di perangkat.',
  },
  en: {
    featureTitle: 'Worship tools', vectorTitle: 'Search by meaning', vectorSub: 'Find ayat and tafsir using everyday questions.',
    doaFeature: 'Dua & dhikr', doaSub: 'Arabic, Latin transliteration, meaning, and notes.', prayerFeature: 'Prayer times', prayerSub: 'Choose a province and city to view the schedule.',
    vectorPanel: 'Quran meaning search', vectorHint: 'Ask in natural language. Your search is sent to EQuran.id.',
    vectorPlaceholder: 'Example: verses about patience in hardship', vectorButton: 'Search meaning', vectorType: 'Result type', vectorAll: 'Ayat and tafsir', vectorAyat: 'Ayat only', vectorTafsir: 'Tafsir only',
    vectorLoading: 'Searching ayat and tafsir…', vectorEmpty: 'No matching results. Try rephrasing or making your question more specific.', vectorError: 'Search failed. Check your connection and try again.',
    results: (n) => `${n} results`, ayah: (s, a) => `${s} · Ayah ${a}`, ayatType: 'Ayat', tafsirType: 'Tafsir', relevance: 'Match',
    openAyah: 'Open ayah', openTafsir: 'Open ayah tafsir', playAyah: 'Play ayah', latin: 'Latin', translation: 'Translation',
    doaPanel: 'Dua and dhikr', doaHint: 'Browse by category or search dua, dhikr, and meanings.', doaSearch: 'Search dua, dhikr, or a word…', doaCategory: 'Category', allGroups: 'All categories', doaLoading: 'Loading duas and dhikr…', doaError: 'The dua list is unavailable. Check your connection and try again.', doaEmpty: 'No duas match this search.',
    readLatin: 'Latin transliteration', meaning: 'Meaning (Indonesian)', moreInfo: 'Notes and source', tags: 'Tags',
    prayerPanel: 'Prayer times', prayerHint: 'Choose a location to see prayer times. Your choice is saved on this device.', province: 'Province', city: 'City / regency', chooseProvince: 'Choose a province', chooseCity: 'Choose a city / regency',
    prayerLoadingProvince: 'Loading provinces…', prayerLoadingCity: 'Loading cities…', prayerLoading: 'Loading prayer times…', prayerError: 'Prayer times are unavailable. Check your connection and try again.', chooseLocation: 'Choose a province and city to see the schedule.',
    today: 'Today’s prayer times', monthSchedule: 'Monthly schedule', todayNone: 'No schedule for this date in the selected month.', previousMonth: 'Previous month', nextMonth: 'Next month', currentMonth: 'Back to this month',
    prayers: ['Imsak', 'Fajr', 'Sunrise', 'Duha', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'], date: 'Date', source: 'Source: EQuran.id API. Dua content is from the EQuran.id dua and dhikr catalogue.',
    cached: 'Showing saved device data; connect to the internet to refresh.', cachedShort: 'Data saved on this device.',
  },
};

function openDatabase() {
  if (database) return database;
  database = new Promise((resolve) => {
    if (!globalThis.indexedDB) { resolve(null); return; }
    try {
      const request = indexedDB.open(CACHE_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CACHE_STORE)) request.result.createObjectStore(CACHE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return database;
}

async function readCache(key) {
  if (memory.has(key)) return memory.get(key);
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(key);
      request.onsuccess = () => {
        const value = request.result ?? null;
        if (value) memory.set(key, value);
        resolve(value);
      };
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

async function writeCache(key, value) {
  memory.set(key, value);
  const db = await openDatabase();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const request = db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE).put(value, key);
      request.onsuccess = request.onerror = () => resolve();
    } catch { resolve(); }
  });
}

async function request(url, { method = 'GET', body, cache = true, validate = (x) => x } = {}) {
  const serialized = body ? JSON.stringify(body) : '';
  const key = `${method}:${url}:${serialized}`;
  const cached = cache ? await readCache(key) : null;
  const readSaved = () => {
    if (!cached) return null;
    return { data: validate(cached), cached: true };
  };
  if (globalThis.navigator?.onLine === false) {
    const saved = readSaved();
    if (saved) return saved;
    throw new Error('Offline');
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 16000) : 0;
  try {
    const response = await fetch(url, {
      method, mode: 'cors', credentials: 'omit', signal: controller?.signal,
      headers: body ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      ...(body ? { body: serialized } : {}),
    });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('Respons API bukan JSON.'); }
    if (!response.ok) throw new Error(payload?.message || `EQuran.id: HTTP ${response.status}`);
    const data = validate(payload);
    if (cache) await writeCache(key, payload);
    return { data, cached: false };
  } catch (error) {
    const saved = readSaved();
    if (saved) return saved;
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function doaList(payload) {
  if (payload?.status !== 'success' || !Array.isArray(payload.data)) throw new Error(payload?.message || 'Format daftar doa tidak valid.');
  return payload.data;
}
function arrayData(payload) {
  if (payload?.code !== 200 || !Array.isArray(payload.data)) throw new Error(payload?.message || 'Format daftar lokasi tidak valid.');
  return payload.data;
}
function scheduleData(payload) {
  if (payload?.code !== 200 || !payload.data || !Array.isArray(payload.data.jadwal)) throw new Error(payload?.message || 'Format jadwal sholat tidak valid.');
  return payload.data;
}
function vectorResults(payload) {
  if (payload?.status !== 'sukses' || !Array.isArray(payload.hasil)) throw new Error(payload?.message || 'Format hasil pencarian tidak valid.');
  return payload.hasil;
}

const getDoa = () => request(`${API}/api/doa`, { validate: doaList });
const getProvinces = () => request(`${API}/api/v2/shalat/provinsi`, { validate: arrayData });
const getCities = (province) => request(`${API}/api/v2/shalat/kabkota`, { method: 'POST', body: { provinsi: province }, validate: arrayData });
const getSchedule = (province, city, month, year) => request(`${API}/api/v2/shalat`, {
  method: 'POST', body: { provinsi: province, kabkota: city, bulan: month, tahun: year }, validate: scheduleData,
});
const searchVector = (query, kind) => request(`${API}/api/vector`, {
  method: 'POST', body: { cari: query, batas: 8, ...(kind === 'ayat' || kind === 'tafsir' ? { tipe: [kind] } : {}) },
  cache: false, validate: vectorResults,
});

function readLocation() {
  try {
    const saved = JSON.parse(localStorage.getItem('quran-oyen-prayer-location') || 'null');
    return saved && typeof saved.province === 'string' && typeof saved.city === 'string' ? saved : { province: '', city: '' };
  } catch { return { province: '', city: '' }; }
}
function saveLocation(province, city) {
  try { localStorage.setItem('quran-oyen-prayer-location', JSON.stringify({ province, city })); } catch {}
}
function formatNumber(value, lang) { return new Intl.NumberFormat(lang === 'id' ? 'id-ID' : 'en-US').format(value); }
function dateKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

export function createIbadahFeatures({ sheets, onNavigate }) {
  let lang = 'id';
  let doaEntries = [];
  let doaCached = false;
  let provinces = [];
  let schedule = null;
  let scheduleCached = false;
  let lastVectorResults = [];
  let lastVectorCached = false;
  let location = readLocation();
  let selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let provinceRequest = null;
  let cityRequest = 0;
  let scheduleRequest = 0;
  let prayerBusy = false;

  const text = () => TEXT[lang];
  const panels = [
    ['vector-search', 'vector-close'], ['doa-panel', 'doa-close'], ['shalat-panel', 'shalat-close'],
  ];
  for (const [panel, close] of panels) {
    sheets.own(panel, { handle: '.panel-head' });
    $(`${close}`).addEventListener('click', () => sheets.close(panel));
  }

  function setStatus(node, message, error = false) {
    node.textContent = message;
    node.classList.toggle('is-error', !!error);
  }

  function updateShortcuts() {
    $('ibadah-title').textContent = text().featureTitle;
    $('feature-vector-title').textContent = text().vectorTitle;
    $('feature-vector-sub').textContent = text().vectorSub;
    $('feature-doa-title').textContent = text().doaFeature;
    $('feature-doa-sub').textContent = text().doaSub;
    $('feature-prayer-title').textContent = text().prayerFeature;
    $('feature-prayer-sub').textContent = text().prayerSub;
  }

  function setPanelText() {
    const w = text();
    $('vector-title').textContent = w.vectorPanel;
    $('vector-query-label').textContent = lang === 'id' ? 'Pertanyaan' : 'Question';
    $('vector-close').textContent = lang === 'id' ? 'Tutup' : 'Close';
    $('vector-hint').textContent = w.vectorHint;
    $('vector-query').placeholder = w.vectorPlaceholder;
    $('vector-submit').textContent = w.vectorButton;
    $('vector-type-label').textContent = w.vectorType;
    const vectorType = $('vector-type');
    vectorType.options[0].textContent = w.vectorAll;
    vectorType.options[1].textContent = w.vectorAyat;
    vectorType.options[2].textContent = w.vectorTafsir;

    $('doa-title').textContent = w.doaPanel;
    $('doa-close').textContent = lang === 'id' ? 'Tutup' : 'Close';
    $('doa-hint').textContent = w.doaHint;
    $('doa-search').placeholder = w.doaSearch;
    $('doa-search-label').textContent = lang === 'id' ? 'Cari doa atau dzikir' : 'Search dua or dhikr';
    $('doa-category-label').textContent = w.doaCategory;
    if ($('doa-category').options.length) $('doa-category').options[0].textContent = w.allGroups;

    $('shalat-title').textContent = w.prayerPanel;
    $('shalat-close').textContent = lang === 'id' ? 'Tutup' : 'Close';
    $('shalat-hint').textContent = w.prayerHint;
    $('province-label').textContent = w.province;
    $('city-label').textContent = w.city;
    if ($('prayer-province').options.length) $('prayer-province').options[0].textContent = w.chooseProvince;
    if ($('prayer-city').options.length) $('prayer-city').options[0].textContent = w.chooseCity;
    $('prayer-prev').ariaLabel = w.previousMonth;
    $('prayer-next').ariaLabel = w.nextMonth;
    $('prayer-now').textContent = w.currentMonth;
    $('prayer-prev').parentElement.setAttribute('aria-label', lang === 'id' ? 'Pilih bulan' : 'Choose month');
    const apiLink = (href) => el('a', { href, target: '_blank', rel: 'noopener noreferrer', textContent: lang === 'id' ? 'Dokumentasi API' : 'API docs' });
    $('vector-source').replaceChildren(document.createTextNode(lang === 'id' ? 'EQuran.id Vector Search · hasil tafsir mengikuti konten API. ' : 'EQuran.id Vector Search · tafsir follows the API content. '), apiLink('https://equran.id/apidev/vector'));
    $('doa-source').replaceChildren(document.createTextNode(lang === 'id' ? 'Katalog doa/dzikir menampilkan Arab, Latin, arti, serta keterangan bila tersedia. ' : 'Dua and dhikr catalogue with Arabic, Latin, meaning, and available notes. '), apiLink('https://equran.id/apidev/doa'));
    $('shalat-source').replaceChildren(document.createTextNode(lang === 'id' ? 'Jadwal dipilih manual per lokasi; pilihan disimpan di perangkat ini. ' : 'Choose a location manually; your choice is saved on this device. '), apiLink('https://equran.id/apidev/shalat'));

    updateShortcuts();
    if (doaEntries.length) renderDoa();
    if (lastVectorResults.length) renderVector(lastVectorResults);
    if (schedule) renderSchedule();
    renderMonthLabel();
  }

  function openVector() {
    sheets.open('vector-search');
    setTimeout(() => $('vector-query').focus({ preventScroll: true }), 90);
  }
  function openDoa() {
    sheets.open('doa-panel');
    if (!doaEntries.length) loadDoa();
    else renderDoa();
  }
  function openPrayer() {
    sheets.open('shalat-panel');
    if (!provinces.length) loadProvinces();
    else if (location.province && location.city && !schedule && !prayerBusy) loadPrayerSchedule();
  }

  $('feature-vector').addEventListener('click', openVector);
  $('feature-doa').addEventListener('click', openDoa);
  $('feature-prayer').addEventListener('click', openPrayer);

  $('vector-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = $('vector-query').value.trim();
    if (!query) { $('vector-query').focus(); return; }
    const submit = $('vector-submit');
    const status = $('vector-status');
    submit.disabled = true;
    $('vector-results').replaceChildren();
    setStatus(status, text().vectorLoading);
    $('vector-results').setAttribute('aria-busy', 'true');
    try {
      const response = await searchVector(query, $('vector-type').value);
      lastVectorResults = response.data;
      lastVectorCached = response.cached;
      renderVector(response.data);
      setStatus(status, response.cached ? text().cached : text().results(response.data.length));
    } catch (error) {
      lastVectorResults = [];
      setStatus(status, error?.name === 'AbortError' ? text().vectorError : text().vectorError, true);
    } finally {
      submit.disabled = false;
      $('vector-results').removeAttribute('aria-busy');
    }
  });

  function renderVector(results) {
    const w = text();
    const container = $('vector-results');
    container.replaceChildren();
    if (!Array.isArray(results) || !results.length) {
      container.append(el('p', { className: 'ibadah-empty', textContent: w.vectorEmpty }));
      return;
    }
    for (const result of results) {
      const data = result?.data ?? {};
      const type = result?.tipe === 'tafsir' ? 'tafsir' : 'ayat';
      const surahNumber = Number(data.id_surat ?? data.nomor_surat);
      const ayahNumber = Number(data.nomor_ayat ?? data.ayat);
      const surahName = String(data.nama_surat ?? data.namaLatin ?? data.nama_surat_latin ?? '');
      const card = el('article', { className: 'ibadah-card vector-card' });
      const head = el('div', { className: 'ibadah-card-head' });
      head.append(el('span', { className: `ibadah-badge ${type}`, textContent: type === 'tafsir' ? w.tafsirType : w.ayatType }));
      if (Number.isFinite(Number(result?.skor))) {
        const percent = Math.round(Math.max(0, Math.min(1, Number(result.skor))) * 100);
        head.append(el('span', { className: 'ibadah-score', textContent: `${w.relevance} · ${percent}%` }));
      } else if (result?.relevansi) head.append(el('span', { className: 'ibadah-score', textContent: String(result.relevansi) }));
      card.append(head);
      if (surahName || (Number.isInteger(surahNumber) && Number.isInteger(ayahNumber))) {
        const reference = surahName ? w.ayah(surahName, ayahNumber || '') : `${formatNumber(surahNumber, lang)}:${formatNumber(ayahNumber, lang)}`;
        card.append(el('h3', { className: 'ibadah-reference', textContent: reference }));
      }
      const arabic = data.teks_arab ?? data.ar ?? data.teksArab;
      if (arabic) card.append(el('p', { className: 'ibadah-arabic', lang: 'ar', dir: 'rtl', textContent: String(arabic) }));
      const latin = data.teks_latin ?? data.tr ?? data.transliterasi;
      if (latin) card.append(el('p', { className: 'ibadah-latin' }, el('b', { textContent: `${w.latin}: ` }), String(latin)));
      const translation = data.terjemahan_id ?? data.terjemahan ?? data.isi ?? data.teks ?? data.translation_id;
      if (translation) card.append(el('p', { className: 'ibadah-prose', dir: 'auto', textContent: String(translation) }));
      if (data.terjemahan_en && lang === 'en') card.append(el('p', { className: 'ibadah-prose ibadah-english', textContent: String(data.terjemahan_en) }));
      if (Number.isInteger(surahNumber) && surahNumber > 0 && Number.isInteger(ayahNumber) && ayahNumber > 0) {
        const actions = el('div', { className: 'ibadah-actions' });
        const open = el('button', { type: 'button', className: 'pill', textContent: type === 'tafsir' ? w.openTafsir : w.openAyah });
        open.addEventListener('click', () => { sheets.close('vector-search'); onNavigate(surahNumber, ayahNumber, type === 'tafsir' ? 'tafsir' : 'open'); });
        const play = el('button', { type: 'button', className: 'pill solid', textContent: w.playAyah });
        play.addEventListener('click', () => { sheets.close('vector-search'); onNavigate(surahNumber, ayahNumber, 'play'); });
        actions.append(open, play);
        card.append(actions);
      }
      container.append(card);
    }
  }

  async function loadDoa() {
    const status = $('doa-status');
    $('doa-list').setAttribute('aria-busy', 'true');
    setStatus(status, text().doaLoading);
    try {
      const response = await getDoa();
      doaEntries = response.data;
      doaCached = response.cached;
      const groups = [...new Set(doaEntries.map((entry) => String(entry.grup ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, lang === 'id' ? 'id' : 'en'));
      const select = $('doa-category');
      const selected = select.value;
      select.replaceChildren(el('option', { value: '', textContent: text().allGroups }), ...groups.map((group) => el('option', { value: group, textContent: group })));
      if (groups.includes(selected)) select.value = selected;
      renderDoa();
      setStatus(status, response.cached ? text().cached : `${formatNumber(doaEntries.length, lang)} · EQuran.id`);
    } catch {
      setStatus(status, text().doaError, true);
      $('doa-list').replaceChildren(el('p', { className: 'ibadah-empty', textContent: text().doaError }));
    } finally { $('doa-list').removeAttribute('aria-busy'); }
  }

  function renderDoa() {
    const w = text();
    const query = $('doa-search').value.trim().toLocaleLowerCase(lang === 'id' ? 'id-ID' : 'en-US');
    const group = $('doa-category').value;
    const list = $('doa-list');
    list.replaceChildren();
    let shown = 0;
    const fragment = document.createDocumentFragment();
    for (const item of doaEntries) {
      const searchable = [item.nama, item.grup, item.ar, item.tr, item.idn, item.tentang, ...(Array.isArray(item.tag) ? item.tag : [])].filter(Boolean).join(' ').toLocaleLowerCase(lang === 'id' ? 'id-ID' : 'en-US');
      if ((group && item.grup !== group) || (query && !searchable.includes(query))) continue;
      shown++;
      const card = el('article', { className: 'ibadah-card dua-card' });
      const heading = el('div', { className: 'ibadah-card-head' }, el('span', { className: 'ibadah-badge dua', textContent: String(item.grup ?? w.doaPanel) }));
      if (item.id != null) heading.append(el('span', { className: 'ibadah-score', textContent: `#${formatNumber(item.id, lang)}` }));
      card.append(heading, el('h3', { className: 'ibadah-reference', textContent: String(item.nama ?? w.doaPanel) }));
      if (item.ar) card.append(el('p', { className: 'ibadah-arabic dua-arabic', lang: 'ar', dir: 'rtl', textContent: String(item.ar) }));
      if (item.tr) card.append(el('p', { className: 'ibadah-latin' }, el('b', { textContent: `${w.readLatin}: ` }), String(item.tr)));
      if (item.idn) card.append(el('p', { className: 'ibadah-prose', dir: 'auto' }, el('b', { className: 'ibadah-field-label', textContent: `${w.meaning}: ` }), String(item.idn)));
      if (item.tentang) {
        const more = el('details', { className: 'ibadah-more' });
        more.append(el('summary', { textContent: w.moreInfo }), el('p', { className: 'ibadah-prose', textContent: String(item.tentang) }));
        card.append(more);
      }
      if (Array.isArray(item.tag) && item.tag.length) card.append(el('p', { className: 'ibadah-tags' }, el('b', { textContent: `${w.tags}: ` }), item.tag.map((tag) => `#${tag}`).join(' ')));
      fragment.append(card);
    }
    if (shown) list.append(fragment);
    else list.append(el('p', { className: 'ibadah-empty', textContent: w.doaEmpty }));
    const status = $('doa-status');
    if (doaEntries.length) status.textContent = doaCached ? `${formatNumber(shown, lang)} · ${w.cachedShort}` : `${formatNumber(shown, lang)} ${lang === 'id' ? 'doa/dzikir' : 'dua/dhikr'}`;
  }
  $('doa-search').addEventListener('input', renderDoa);
  $('doa-category').addEventListener('change', renderDoa);

  function setOptions(select, placeholder, values, selected = '') {
    select.replaceChildren(el('option', { value: '', textContent: placeholder }), ...values.map((value) => el('option', { value, textContent: value })));
    if (values.includes(selected)) select.value = selected;
  }

  async function loadProvinces() {
    if (provinceRequest) return provinceRequest;
    const status = $('prayer-status');
    setStatus(status, text().prayerLoadingProvince);
    provinceRequest = getProvinces().then(async (response) => {
      provinces = response.data.map(String);
      const select = $('prayer-province');
      setOptions(select, text().chooseProvince, provinces, location.province);
      select.disabled = false;
      if (location.province && provinces.includes(location.province)) {
        await loadCities(location.province, location.city);
      } else {
        location = { province: '', city: '' };
        setOptions($('prayer-city'), text().chooseCity, [], '');
        $('prayer-city').disabled = true;
        setStatus(status, text().chooseLocation);
      }
      if (response.cached) setStatus(status, text().cached);
      return response;
    }).catch(() => {
      provinceRequest = null;
      setStatus(status, text().prayerError, true);
      return null;
    });
    return provinceRequest;
  }

  async function loadCities(province, selectedCity = '') {
    const token = ++cityRequest;
    const select = $('prayer-city');
    setOptions(select, text().chooseCity, [], '');
    select.disabled = true;
    schedule = null;
    $('prayer-results').replaceChildren();
    if (!province) { setStatus($('prayer-status'), text().chooseLocation); return; }
    setStatus($('prayer-status'), text().prayerLoadingCity);
    try {
      const response = await getCities(province);
      if (token !== cityRequest) return;
      const cities = response.data.map(String);
      setOptions(select, text().chooseCity, cities, selectedCity);
      select.disabled = false;
      if (cities.includes(selectedCity)) {
        location = { province, city: selectedCity };
        saveLocation(province, selectedCity);
        await loadPrayerSchedule();
      } else {
        location = { province, city: '' };
        saveLocation(province, '');
        setStatus($('prayer-status'), text().chooseLocation);
      }
      if (response.cached && !selectedCity) setStatus($('prayer-status'), text().cached);
    } catch {
      if (token === cityRequest) setStatus($('prayer-status'), text().prayerError, true);
    }
  }

  async function loadPrayerSchedule() {
    if (!location.province || !location.city) { setStatus($('prayer-status'), text().chooseLocation); return; }
    const token = ++scheduleRequest;
    prayerBusy = true;
    const month = selectedMonth.getMonth() + 1;
    const year = selectedMonth.getFullYear();
    setStatus($('prayer-status'), text().prayerLoading);
    $('prayer-results').setAttribute('aria-busy', 'true');
    renderMonthLabel();
    try {
      const response = await getSchedule(location.province, location.city, month, year);
      if (token !== scheduleRequest) return;
      schedule = response.data;
      scheduleCached = response.cached;
      renderSchedule();
      setStatus($('prayer-status'), response.cached ? text().cached : `${schedule.kabkota}, ${schedule.provinsi} · EQuran.id`);
    } catch {
      if (token === scheduleRequest) {
        schedule = null;
        $('prayer-results').replaceChildren(el('p', { className: 'ibadah-empty', textContent: text().prayerError }));
        setStatus($('prayer-status'), text().prayerError, true);
      }
    } finally {
      if (token === scheduleRequest) {
        prayerBusy = false;
        $('prayer-results').removeAttribute('aria-busy');
      }
    }
  }

  function prayerNames() { return text().prayers; }
  function renderSchedule() {
    const w = text();
    const target = $('prayer-results');
    target.replaceChildren();
    if (!schedule || !Array.isArray(schedule.jadwal)) return;
    const today = dateKey(new Date());
    const todaySchedule = schedule.jadwal.find((entry) => entry.tanggal_lengkap === today);
    if (todaySchedule) {
      const current = el('section', { className: 'prayer-today' });
      const localDate = new Date(`${today}T12:00:00`);
      current.append(el('div', { className: 'prayer-today-head' },
        el('b', { textContent: w.today }),
        el('span', { textContent: localDate.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) })));
      const times = el('div', { className: 'prayer-time-grid' });
      prayerNames().forEach((name, index) => {
        const key = ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya'][index];
        times.append(el('div', { className: 'prayer-time' }, el('span', { textContent: name }), el('b', { textContent: String(todaySchedule[key] ?? '—') })));
      });
      current.append(times);
      target.append(current);
    } else {
      target.append(el('p', { className: 'ibadah-empty' }, el('b', { textContent: w.today }), ` — ${w.todayNone}`));
    }
    const details = el('details', { className: 'prayer-month' });
    details.append(el('summary', { textContent: w.monthSchedule }));
    const scroll = el('div', { className: 'prayer-table-scroll', tabindex: '0', ariaLabel: w.monthSchedule });
    const table = el('table', { className: 'prayer-table' });
    const header = el('tr');
    header.append(el('th', { scope: 'col', textContent: w.date }));
    prayerNames().forEach((name) => header.append(el('th', { scope: 'col', textContent: name })));
    table.append(el('thead', {}, header));
    const body = el('tbody');
    for (const entry of schedule.jadwal) {
      const row = el('tr', { className: entry.tanggal_lengkap === today ? 'is-today' : '' });
      row.append(el('th', { scope: 'row', textContent: `${entry.hari ?? ''} ${formatNumber(entry.tanggal, lang)}`.trim() }));
      for (const key of ['imsak', 'subuh', 'terbit', 'dhuha', 'dzuhur', 'ashar', 'maghrib', 'isya']) row.append(el('td', { textContent: String(entry[key] ?? '—') }));
      body.append(row);
    }
    table.append(body);
    scroll.append(table);
    details.append(scroll);
    target.append(details);
    if (scheduleCached) target.append(el('p', { className: 'ibadah-status' }, w.cached));
  }

  function renderMonthLabel() {
    const date = selectedMonth;
    $('prayer-month-label').textContent = date.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { month: 'long', year: 'numeric' });
  }
  function shiftMonth(delta) {
    selectedMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + delta, 1);
    schedule = null;
    renderMonthLabel();
    if (location.province && location.city) loadPrayerSchedule();
  }
  $('prayer-prev').addEventListener('click', () => shiftMonth(-1));
  $('prayer-next').addEventListener('click', () => shiftMonth(1));
  $('prayer-now').addEventListener('click', () => {
    selectedMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (location.province && location.city) loadPrayerSchedule();
    else renderMonthLabel();
  });
  $('prayer-province').addEventListener('change', () => {
    const province = $('prayer-province').value;
    location = { province, city: '' };
    saveLocation(province, '');
    cityRequest++;
    scheduleRequest++;
    provinceRequest = provinceRequest || Promise.resolve();
    if (!province) {
      setOptions($('prayer-city'), text().chooseCity, [], '');
      $('prayer-city').disabled = true;
      schedule = null;
      $('prayer-results').replaceChildren();
      setStatus($('prayer-status'), text().chooseLocation);
      return;
    }
    loadCities(province);
  });
  $('prayer-city').addEventListener('change', () => {
    const city = $('prayer-city').value;
    location = { province: $('prayer-province').value, city };
    saveLocation(location.province, city);
    schedule = null;
    if (city) loadPrayerSchedule();
    else { $('prayer-results').replaceChildren(); setStatus($('prayer-status'), text().chooseLocation); }
  });

  function relang(newLang) {
    lang = newLang === 'en' ? 'en' : 'id';
    setPanelText();
  }
  relang('id');
  return { relang };
}
