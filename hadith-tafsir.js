const UMMAH_API = 'https://ummahapi.com/api';
const FAWAZ_API = 'https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1';
const CACHE_DB = 'quran-oyen-hadith-v1';
const CACHE_STORE = 'responses';
const memory = new Map();
let database;

export const COLLECTIONS = [
  { key: 'bukhari', name: 'Sahih al-Bukhari', indonesian: true },
  { key: 'muslim', name: 'Sahih Muslim', indonesian: true },
  { key: 'abudawud', name: 'Sunan Abu Dawud', indonesian: true },
  { key: 'tirmidhi', name: 'Jami at-Tirmidhi', indonesian: true },
  { key: 'nasai', name: "Sunan an-Nasa'i", indonesian: true },
  { key: 'ibnmajah', name: 'Sunan Ibn Majah', indonesian: true },
  { key: 'malik', name: 'Muwatta Malik', indonesian: true },
  { key: 'nawawi', name: "Nawawi's 40 Hadith", indonesian: false },
  { key: 'qudsi', name: '40 Hadith Qudsi', indonesian: false },
  { key: 'dehlawi', name: "Shah Waliullah's 40 Hadith", indonesian: false },
];

const WORDS = {
  id: {
    featureTitle: 'Hadis & tafsir', featureSub: 'Jelajahi kitab hadis dan tafsir lengkap per surat.',
    title: 'Hadis & tafsir', close: 'Tutup', hint: 'Baca hadis Arab/Indonesia, cari topik lintas kitab, atau buka tafsir lengkap per surat.',
    hadithTab: 'Hadis', tafsirTab: 'Tafsir Al-Qur’an', browseTitle: 'Buka hadis berdasarkan kitab dan nomor',
    book: 'Kitab hadis', number: 'Nomor hadis', openNumber: 'Buka hadis',
    searchTitle: 'Cari hadis', searchQuery: 'Kata atau topik', queryPlaceholder: 'Contoh: sabar, sedekah, prayer',
    searchScope: 'Cakupan pencarian', globalScope: 'Semua kitab · teks Inggris', indScope: 'Kitab terpilih · terjemahan Indonesia',
    searchCollection: 'Koleksi', allCollections: 'Semua koleksi', searchButton: 'Cari hadis',
    globalHint: 'Pencarian lintas kitab memakai teks Inggris UmmahAPI. Kata pencarian dikirim ke layanan tersebut; gunakan kata bahasa Inggris untuk hasil terbaik.',
    indHint: 'Pencarian dilakukan di perangkat pada terjemahan Indonesia kitab yang dipilih. Saat pertama kali, satu berkas edisi lengkap (ukurannya dapat beberapa MB) akan diunduh dan disimpan untuk penggunaan berikutnya.',
    loading: 'Memuat hadis…', searching: 'Mencari hadis…', loadingEdition: 'Mengunduh edisi terjemahan ke perangkat untuk pencarian…',
    numberRequired: 'Masukkan nomor hadis yang valid.', queryRequired: 'Masukkan kata atau topik untuk dicari.',
    chooseBook: 'Pilih satu kitab yang memiliki edisi Indonesia.', noIdEdition: 'Edisi Indonesia tidak tersedia untuk koleksi ini.',
    translationUnavailable: 'Terjemahan Indonesia untuk nomor ini belum tersedia pada edisi tersebut.', translationError: 'Terjemahan Indonesia belum dapat dimuat. Periksa koneksi lalu coba lagi.',
    noResults: 'Tidak ada hadis yang cocok. Coba kata lain atau pilih cakupan pencarian berbeda.',
    results: (count) => `${count} hasil`, moreResults: (count) => `Menampilkan 30 dari ${count} hasil. Persempit kata pencarian untuk hasil yang lebih spesifik.`,
    arabic: 'Teks Arab', indonesian: 'Terjemahan Indonesia', english: 'Teks Inggris dari API', grade: 'Derajat pada sumber',
    showIndonesian: 'Muat terjemahan Indonesia', openDetail: 'Buka teks hadis',
    indSearchButton: 'Cari dalam terjemahan Indonesia', emptyDetail: 'Pilih kitab dan nomor, lalu buka hadis.',
    detailError: 'Hadis belum dapat dimuat. Periksa koneksi lalu coba lagi.', searchError: 'Pencarian belum berhasil. Periksa koneksi lalu coba lagi.',
    cached: 'Data tersimpan di perangkat; ditampilkan dari cache offline.',
    tafsirTitle: 'Jelajahi tafsir lengkap', tafsirHint: 'Pilih satu dari 114 surat. Tafsir EQuran.id memuat penjelasan per ayat; pencarian, audio, dan buka ayat tersedia di panel tafsir.',
    surah: 'Surat', findSurah: 'Cari nama surat', openTafsir: 'Buka tafsir surat',
    tafsirSource: 'Sumber tafsir: EQuran.id API v2. Konten tafsir dimuat per surat dan disimpan pada cache perangkat setelah berhasil diambil.',
    statusReady: 'Pilih salah satu fitur di atas untuk mulai.', sourceLabel: 'Sumber dan catatan',
    sourceNote: 'Teks dan penomoran dapat berbeda antar-edisi. Derajat hadis hanya ditampilkan bila diberikan sumber; fitur ini bukan pengganti verifikasi ilmiah atau bimbingan ulama.',
  },
  en: {
    featureTitle: 'Hadith & tafsir', featureSub: 'Browse hadith collections and full tafsir by surah.',
    title: 'Hadith & tafsir', close: 'Close', hint: 'Read Arabic/Indonesian hadith, search across collections, or open full tafsir by surah.',
    hadithTab: 'Hadith', tafsirTab: 'Quran tafsir', browseTitle: 'Open a hadith by collection and number',
    book: 'Hadith collection', number: 'Hadith number', openNumber: 'Open hadith',
    searchTitle: 'Search hadith', searchQuery: 'Word or topic', queryPlaceholder: 'Example: patience, charity, prayer',
    searchScope: 'Search scope', globalScope: 'All collections · English text', indScope: 'Selected collection · Indonesian translation',
    searchCollection: 'Collection', allCollections: 'All collections', searchButton: 'Search hadith',
    globalHint: 'Cross-collection search uses UmmahAPI English text. Your query is sent to that service; English keywords work best.',
    indHint: 'Search runs on your device against the selected Indonesian edition. The first search downloads one full edition file (which may be several MB) and saves it for later use.',
    loading: 'Loading hadith…', searching: 'Searching hadith…', loadingEdition: 'Downloading the translation edition to this device for search…',
    numberRequired: 'Enter a valid hadith number.', queryRequired: 'Enter a word or topic to search.',
    chooseBook: 'Choose one collection with an Indonesian edition.', noIdEdition: 'An Indonesian edition is not available for this collection.',
    translationUnavailable: 'An Indonesian translation for this number is not available in this edition.', translationError: 'The Indonesian translation could not be loaded. Check your connection and try again.',
    noResults: 'No matching hadith found. Try another word or search scope.',
    results: (count) => `${count} results`, moreResults: (count) => `Showing 30 of ${count} results. Refine your query for a narrower match.`,
    arabic: 'Arabic text', indonesian: 'Indonesian translation', english: 'English text from API', grade: 'Source grading',
    showIndonesian: 'Load Indonesian translation', openDetail: 'Open hadith text',
    indSearchButton: 'Search Indonesian translation', emptyDetail: 'Choose a collection and number, then open a hadith.',
    detailError: 'Hadith could not be loaded. Check your connection and try again.', searchError: 'Search failed. Check your connection and try again.',
    cached: 'Data saved on this device; showing the offline cache.',
    tafsirTitle: 'Browse full tafsir', tafsirHint: 'Choose one of the 114 surahs. EQuran.id tafsir includes verse-level explanations; search, audio, and verse navigation are available in the tafsir panel.',
    surah: 'Surah', findSurah: 'Find a surah name', openTafsir: 'Open surah tafsir',
    tafsirSource: 'Tafsir source: EQuran.id API v2. Tafsir is loaded by surah and saved to the device cache after it is retrieved.',
    statusReady: 'Choose one of the features above to begin.', sourceLabel: 'Sources and notes',
    sourceNote: 'Text and numbering may vary by edition. A hadith grade is shown only when supplied by the source; this feature does not replace scholarly verification or guidance.',
  },
};

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function collectionFor(key) { return COLLECTIONS.find((item) => item.key === key) ?? null; }

export function buildFawazHadithUrl(language, collection, number = null) {
  if (language !== 'ara' && language !== 'ind') throw new RangeError('Unsupported Hadith edition language.');
  if (!collectionFor(collection) || (language === 'ind' && !collectionFor(collection).indonesian)) throw new RangeError('Unsupported Hadith collection edition.');
  const edition = `${language}-${collection}`;
  const suffix = number === null ? '' : `/${encodeURIComponent(String(number))}`;
  return `${FAWAZ_API}/editions/${edition}${suffix}.min.json`;
}

export function validateGlobalHadithSearch(payload) {
  const list = payload?.success === true && payload?.service === 'hadith-search' ? payload?.data?.hadiths : null;
  if (!Array.isArray(list)) throw new Error(payload?.message || 'Invalid hadith search response.');
  return list.filter((item) => typeof item?.collection === 'string' && item.hadithnumber !== undefined && (typeof item.arabic === 'string' || typeof item.english === 'string'));
}

export function validateHadithDetail(payload, expectedCollection, expectedNumber) {
  const item = payload?.success === true && payload?.service === 'hadith' ? payload.data : null;
  if (!item || item.collection !== expectedCollection || String(item.hadithnumber) !== String(expectedNumber)) throw new Error(payload?.message || 'Hadith response does not match the requested reference.');
  if (typeof item.arabic !== 'string' && typeof item.english !== 'string') throw new Error('Hadith text is missing.');
  return {
    collection: item.collection,
    collectionName: String(item.collection_name ?? collectionFor(item.collection)?.name ?? item.collection),
    number: String(item.hadithnumber),
    arabic: typeof item.arabic === 'string' ? item.arabic : '',
    english: typeof item.english === 'string' ? item.english : '',
    grade: typeof item.grade === 'string' ? item.grade : '',
  };
}

export function validateFawazHadith(payload, expectedNumber) {
  if (!Array.isArray(payload?.hadiths)) throw new Error('Invalid Hadith edition response.');
  const item = payload.hadiths.find((hadith) => String(hadith?.hadithnumber) === String(expectedNumber));
  if (!item || typeof item.text !== 'string' || !item.text.trim()) throw new Error('Hadith not found in this edition.');
  return { metadata: payload.metadata ?? {}, hadith: item };
}

export function validateFawazCorpus(payload) {
  if (!payload || !Array.isArray(payload.hadiths) || !payload.hadiths.length) throw new Error('Hadith collection data is unavailable.');
  const hadiths = payload.hadiths.filter((item) => item && item.hadithnumber !== undefined && typeof item.text === 'string');
  if (!hadiths.length) throw new Error('Hadith collection contains no searchable text.');
  return { metadata: payload.metadata ?? {}, hadiths };
}

export function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function searchIndonesianHadith(corpus, query, limit = 30) {
  const normalized = normalizeSearchText(query);
  if (!normalized || !Array.isArray(corpus?.hadiths)) return { items: [], total: 0 };
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const matches = [];
  for (const item of corpus.hadiths) {
    const text = normalizeSearchText(item.text);
    const numberMatch = tokens.length === 1 && /^\d+(?:\.\d+)?$/.test(tokens[0]) && String(item.hadithnumber) === tokens[0];
    if (numberMatch || tokens.every((token) => text.includes(token))) matches.push(item);
  }
  const max = Math.max(1, Math.min(100, Number(limit) || 30));
  return { items: matches.slice(0, max), total: matches.length };
}

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

async function requestJson(url, { validate = (value) => value, cache = true, cacheKey = url, timeoutMs = 18000 } = {}) {
  const saved = cache ? await readCache(cacheKey) : null;
  const fromSaved = () => saved ? { data: validate(saved.payload), cached: true } : null;
  if (globalThis.navigator?.onLine === false) {
    const offline = fromSaved();
    if (offline) return offline;
    throw new Error('Offline and no saved data is available.');
  }
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const targetUrl = attempt === 1 && url.startsWith(FAWAZ_API)
      ? url.replace('https://cdn.jsdelivr.net/', 'https://fastly.jsdelivr.net/')
      : url;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      const response = await fetch(targetUrl, { method: 'GET', mode: 'cors', credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller?.signal });
      let payload;
      try { payload = await response.json(); } catch { throw new Error('The API response was not valid JSON.'); }
      if (!response.ok) {
        const error = new Error(payload?.message || `HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const data = validate(payload);
      if (cache) await writeCache(cacheKey, { payload, savedAt: Date.now() });
      return { data, cached: false };
    } catch (error) {
      lastError = error;
      const retryable = !error.status || error.status === 429 || error.status >= 500;
      if (attempt === 0 && retryable) await delay(450);
      else break;
    } finally { if (timeout) clearTimeout(timeout); }
  }
  const fallback = fromSaved();
  if (fallback) return fallback;
  throw lastError ?? new Error('The API request failed.');
}

function globalSearchUrl(query, collection) {
  const params = new URLSearchParams({ q: query, limit: '25' });
  if (collection && collection !== 'all') params.set('collection', collection);
  return `${UMMAH_API}/hadith/search?${params}`;
}

async function getIndonesianHadith(collection, number) {
  if (!collectionFor(collection)?.indonesian) throw new Error('No Indonesian edition is available for this collection.');
  const corpusCache = await readCache(`fawaz:ind:${collection}`);
  if (corpusCache) {
    try {
      const corpus = validateFawazCorpus(corpusCache.payload);
      const hadith = corpus.hadiths.find((item) => String(item.hadithnumber) === String(number));
      if (hadith) return { metadata: corpus.metadata, hadith, cached: true, url: buildFawazHadithUrl('ind', collection, number) };
    } catch { /* Ignore an incomplete cache and try the per-hadith endpoint. */ }
  }
  const url = buildFawazHadithUrl('ind', collection, number);
  const response = await requestJson(url, { validate: (payload) => validateFawazHadith(payload, number) });
  return { ...response.data, cached: response.cached, url };
}

async function getHadithDetail(collection, number) {
  let main = null;
  let mainCached = false;
  let mainError = null;
  let indonesian = null;
  let indonesianCached = false;
  let indonesianUrl = '';
  let arabic = '';
  let arabicCached = false;
  let arabicUrl = '';
  const detailUrl = `${UMMAH_API}/hadith/${encodeURIComponent(collection)}/${encodeURIComponent(String(number))}`;
  const araUrl = buildFawazHadithUrl('ara', collection, number);
  const [mainResult, translationResult, arabicResult] = await Promise.allSettled([
    requestJson(detailUrl, { validate: (payload) => validateHadithDetail(payload, collection, number) }),
    collectionFor(collection)?.indonesian ? getIndonesianHadith(collection, number) : Promise.resolve(null),
    requestJson(araUrl, { validate: (payload) => validateFawazHadith(payload, number) }),
  ]);
  if (mainResult.status === 'fulfilled') {
    main = mainResult.value.data;
    mainCached = mainResult.value.cached;
  } else mainError = mainResult.reason;
  if (translationResult.status === 'fulfilled' && translationResult.value) {
    indonesian = translationResult.value.hadith.text;
    indonesianCached = translationResult.value.cached;
    indonesianUrl = translationResult.value.url;
  }
  if (arabicResult.status === 'fulfilled') {
    arabic = arabicResult.value.data.hadith.text;
    arabicCached = arabicResult.value.cached;
    arabicUrl = araUrl;
  }
  if (!arabic) arabic = main?.arabic ?? '';

  if (!main && !indonesian && !arabic) throw mainError ?? new Error('Hadith is not available from the selected sources.');
  return {
    ...(main ?? {}), collection, number: main?.number ?? String(number),
    collectionName: main?.collectionName ?? collectionFor(collection)?.name ?? collection,
    arabic, indonesian, english: main?.english ?? '', grade: main?.grade ?? '',
    cached: mainCached || indonesianCached || arabicCached,
    indonesianUrl, arabicUrl, sourceUrl: main ? detailUrl : arabicUrl || indonesianUrl,
  };
}

function makeLink(href, label) {
  return el('a', { href, target: '_blank', rel: 'noopener noreferrer', textContent: label });
}

export function hadithScopeLabel(scope, lang = 'id') {
  const words = WORDS[lang === 'en' ? 'en' : 'id'];
  return scope === 'global' ? words.globalScope : words.indScope;
}

export function createIlmFeatures({ sheets, onNavigate, getSurahs, initialLang = 'id' }) {
  // An older PWA shell can briefly receive newer scripts during an update.
  // Keep the reader and its update controls alive until the new HTML takes over.
  if (!$('ilm-panel') || !$('feature-ilm')) return null;
  let lang = initialLang === 'en' ? 'en' : 'id';
  let activeTab = 'hadith';
  let selectedDetail = null;
  let selectedSearch = null;
  let searchBusy = false;
  let searchTicket = 0;
  let detailTicket = 0;
  let surahList = [];
  let globalSearchCollection = 'all';
  let indonesianSearchCollection = 'bukhari';

  const words = () => WORDS[lang];
  const setStatus = (node, message, error = false) => {
    node.textContent = message;
    node.classList.toggle('is-error', !!error);
  };

  sheets.own('ilm-panel', { handle: '.panel-head' });
  $('ilm-close').addEventListener('click', () => sheets.close('ilm-panel'));
  $('feature-ilm').addEventListener('click', open);

  function fillCollectionOptions(select, includeAll = false) {
    const w = words();
    const selected = select.value;
    const options = [];
    if (includeAll) options.push(el('option', { value: 'all', textContent: w.allCollections }));
    for (const collection of COLLECTIONS) {
      const option = el('option', { value: collection.key, textContent: collection.name });
      options.push(option);
    }
    select.replaceChildren(...options);
    if (options.some((option) => option.value === selected)) select.value = selected;
    else select.value = includeAll ? 'all' : 'bukhari';
  }

  function updateSources() {
    const source = $('ilm-source');
    source.replaceChildren(
      document.createTextNode(lang === 'id' ? 'Hadis: edisi Fawaz/JSDelivr; pencarian global opsional UmmahAPI (teks Inggris). Tafsir: EQuran.id. ' : 'Hadith: Fawaz/JSDelivr editions; optional global UmmahAPI search (English text). Tafsir: EQuran.id. '),
      makeLink('https://github.com/fawazahmed0/hadith-api', 'Fawaz Hadith API'),
      document.createTextNode(' · '),
      makeLink('https://ummahapi.com/api/docs', 'UmmahAPI'),
      document.createTextNode(' · '),
      makeLink('https://equran.id/apidev/v2', 'EQuran.id API v2'),
    );
  }

  function setScopeHint() {
    const w = words();
    const global = $('ilm-search-scope').value === 'global';
    $('ilm-search-hint').textContent = global ? w.globalHint : w.indHint;
    const collection = $('ilm-search-collection');
    collection.disabled = false;
    for (const option of collection.options) {
      option.disabled = !global && (option.value === 'all' || !collectionFor(option.value)?.indonesian);
    }
    if (global) {
      collection.value = globalSearchCollection;
    } else {
      collection.value = indonesianSearchCollection;
    }
  }

  function updateStaticText() {
    const w = words();
    $('feature-ilm-title').textContent = w.featureTitle;
    $('feature-ilm-sub').textContent = w.featureSub;
    $('ilm-title').textContent = w.title;
    $('ilm-close').textContent = w.close;
    $('ilm-hint').textContent = w.hint;
    $('ilm-tab-hadith').textContent = w.hadithTab;
    $('ilm-tab-tafsir').textContent = w.tafsirTab;
    $('ilm-browse-title').textContent = w.browseTitle;
    $('ilm-book-label').textContent = w.book;
    $('ilm-number-label').textContent = w.number;
    $('ilm-number').ariaLabel = w.number;
    $('ilm-open-number').textContent = w.openNumber;
    $('ilm-search-title').textContent = w.searchTitle;
    $('ilm-query-label').textContent = w.searchQuery;
    $('ilm-query').placeholder = w.queryPlaceholder;
    $('ilm-search-scope-label').textContent = w.searchScope;
    for (const option of $('ilm-search-scope').options) {
      option.textContent = hadithScopeLabel(option.value, lang);
    }
    $('ilm-search-collection-label').textContent = w.searchCollection;
    $('ilm-search-button').textContent = w.searchButton;
    $('ilm-search-collection').options[0].textContent = w.allCollections;
    $('ilm-tafsir-title').textContent = w.tafsirTitle;
    $('ilm-surah-label').textContent = w.surah;
    $('ilm-surah-search').placeholder = w.findSurah;
    $('ilm-surah-search-label').textContent = w.findSurah;
    $('ilm-surah-search').ariaLabel = w.findSurah;
    $('ilm-open-tafsir').textContent = w.openTafsir;
    $('ilm-tafsir-hint').textContent = w.tafsirHint;
    $('ilm-tafsir-source').textContent = w.tafsirSource;
    $('ilm-source-label').textContent = w.sourceLabel;
    $('ilm-source-note').textContent = w.sourceNote;
    fillCollectionOptions($('ilm-book'));
    fillCollectionOptions($('ilm-search-collection'), true);
    setScopeHint();
    updateSources();
    if (selectedDetail) renderDetail(selectedDetail);
    if (selectedSearch) renderSearchResults(selectedSearch);
  }

  function setTab(tab) {
    activeTab = tab === 'tafsir' ? 'tafsir' : 'hadith';
    const isHadith = activeTab === 'hadith';
    $('ilm-tab-hadith').setAttribute('aria-pressed', String(isHadith));
    $('ilm-tab-tafsir').setAttribute('aria-pressed', String(!isHadith));
    $('ilm-hadith-view').hidden = !isHadith;
    $('ilm-tafsir-view').hidden = isHadith;
  }

  async function open() {
    sheets.open('ilm-panel');
    setTab(activeTab);
    if (!surahList.length) {
      try {
        const list = await getSurahs();
        if (Array.isArray(list)) {
          surahList = list;
          renderSurahOptions();
        }
      } catch { /* The Qur'an reader remains usable if the local index is not ready. */ }
    }
  }

  function renderSurahOptions() {
    const query = normalizeSearchText($('ilm-surah-search').value);
    const selected = $('ilm-surah').value;
    const filtered = surahList.filter((surah, index) => {
      if (!query) return true;
      return normalizeSearchText(`${index + 1} ${surah.latin ?? ''} ${surah.ar ?? ''} ${surah.id ?? ''} ${surah.en ?? ''}`).includes(query);
    });
    $('ilm-surah').replaceChildren(...filtered.map((surah) => {
      const number = Number(surah.n ?? surah.nomor ?? surah.number ?? surah.idNumber);
      const index = Number.isInteger(number) && number > 0 ? number : surahList.indexOf(surah) + 1;
      return el('option', { value: String(index), textContent: `${index}. ${surah.latin ?? surah.namaLatin ?? surah.name ?? ''}` });
    }));
    if ([...$('ilm-surah').options].some((option) => option.value === selected)) $('ilm-surah').value = selected;
  }

  async function openHadithByNumber(event) {
    event.preventDefault();
    const collection = $('ilm-book').value;
    const number = $('ilm-number').value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(number) || Number(number) <= 0) {
      setStatus($('ilm-detail-status'), words().numberRequired, true);
      $('ilm-number').focus();
      return;
    }
    await loadDetail(collection, number);
  }

  async function loadDetail(collection, number) {
    const ticket = ++detailTicket;
    $('ilm-open-number').disabled = true;
    $('ilm-detail').replaceChildren();
    setStatus($('ilm-detail-status'), words().loading);
    try {
      const result = await getHadithDetail(collection, number);
      if (ticket !== detailTicket) return;
      selectedDetail = result;
      renderDetail(result);
      setStatus($('ilm-detail-status'), result.cached ? words().cached : words().results(1));
    } catch {
      if (ticket === detailTicket) {
        selectedDetail = null;
        $('ilm-detail').replaceChildren(el('p', { className: 'ibadah-empty', textContent: words().detailError }));
        setStatus($('ilm-detail-status'), words().detailError, true);
      }
    } finally {
      if (ticket === detailTicket) {
        $('ilm-open-number').disabled = false;
      }
    }
  }

  function renderDetail(item) {
    if (!item) return;
    const w = words();
    const card = el('article', { className: 'ibadah-card hadith-card' });
    const head = el('div', { className: 'ibadah-card-head' });
    head.append(el('span', { className: 'ibadah-badge', textContent: `${item.collectionName} · ${item.number}` }));
    if (item.grade) head.append(el('span', { className: 'ibadah-score', textContent: `${w.grade}: ${item.grade}` }));
    card.append(head);
    if (item.arabic) card.append(el('p', { className: 'ibadah-arabic', lang: 'ar', dir: 'rtl', textContent: item.arabic }));
    if (item.indonesian) card.append(el('p', { className: 'ibadah-prose', dir: 'auto' }, el('b', { textContent: `${w.indonesian}: ` }), item.indonesian));
    if (item.english) card.append(el('p', { className: 'ibadah-prose ibadah-english', dir: 'auto' }, el('b', { textContent: `${w.english}: ` }), item.english));
    if (!item.indonesian) card.append(el('p', { className: 'ibadah-tags', textContent: collectionFor(item.collection)?.indonesian ? w.translationUnavailable : w.noIdEdition }));
    const actions = el('div', { className: 'ibadah-actions' });
    const hadithUrl = `https://ummahapi.com/api/hadith/${encodeURIComponent(item.collection)}/${encodeURIComponent(item.number)}`;
    actions.append(makeLink(item.sourceUrl || hadithUrl, lang === 'id' ? 'Sumber hadis' : 'Hadith source'));
    if (item.arabicUrl) actions.append(makeLink(item.arabicUrl, lang === 'id' ? 'Edisi Arab' : 'Arabic edition'));
    if (item.indonesianUrl) actions.append(makeLink(item.indonesianUrl, lang === 'id' ? 'Edisi Indonesia' : 'Indonesian edition'));
    card.append(actions);
    $('ilm-detail').replaceChildren(card);
  }

  async function searchHadith(event) {
    event.preventDefault();
    const query = $('ilm-query').value.trim();
    if (!query) {
      setStatus($('ilm-search-status'), words().queryRequired, true);
      $('ilm-query').focus();
      return;
    }
    if (searchBusy) return;
    const ticket = ++searchTicket;
    searchBusy = true;
    $('ilm-search-button').disabled = true;
    $('ilm-search-results').replaceChildren();
    $('ilm-search-results').setAttribute('aria-busy', 'true');
    selectedSearch = null;
    const scope = $('ilm-search-scope').value;
    const collection = $('ilm-search-collection').value;
    setStatus($('ilm-search-status'), scope === 'global' ? words().searching : words().loadingEdition);
    try {
      let result;
      if (scope === 'global') {
        const response = await requestJson(globalSearchUrl(query, collection), { validate: validateGlobalHadithSearch, cache: false });
        result = { mode: 'global', items: response.data, total: response.data.length, cached: false };
      } else {
        if (collection === 'all' || !collectionFor(collection)?.indonesian) throw new Error('Choose a collection with an Indonesian edition.');
        const url = buildFawazHadithUrl('ind', collection);
        const response = await requestJson(url, { validate: validateFawazCorpus, cacheKey: `fawaz:ind:${collection}`, timeoutMs: 45000 });
        const matches = searchIndonesianHadith(response.data, query, 30);
        result = { mode: 'indonesian', collection, items: matches.items, total: matches.total, cached: response.cached };
      }
      if (ticket !== searchTicket) return;
      selectedSearch = result;
      renderSearchResults(result);
      setStatus($('ilm-search-status'), result.cached ? words().cached : result.total > result.items.length ? words().moreResults(result.total) : words().results(result.total));
    } catch (error) {
      if (ticket === searchTicket) {
        selectedSearch = null;
        const message = error?.message === 'Choose a collection with an Indonesian edition.' ? words().chooseBook : words().searchError;
        $('ilm-search-results').replaceChildren(el('p', { className: 'ibadah-empty', textContent: message }));
        setStatus($('ilm-search-status'), message, true);
      }
    } finally {
      if (ticket === searchTicket) {
        searchBusy = false;
        $('ilm-search-button').disabled = false;
        $('ilm-search-results').removeAttribute('aria-busy');
      }
    }
  }

  function renderSearchResults(result) {
    if (!result) return;
    const w = words();
    const container = $('ilm-search-results');
    container.replaceChildren();
    if (!result.items.length) {
      container.append(el('p', { className: 'ibadah-empty', textContent: w.noResults }));
      return;
    }
    const collectionName = (key) => collectionFor(key)?.name ?? key;
    for (const item of result.items) {
      const isGlobal = result.mode === 'global';
      const collection = isGlobal ? item.collection : result.collection;
      const number = String(isGlobal ? item.hadithnumber : item.hadithnumber);
      const card = el('article', { className: 'ibadah-card hadith-card' });
      const head = el('div', { className: 'ibadah-card-head' });
      head.append(el('span', { className: 'ibadah-badge', textContent: `${collectionName(collection)} · ${number}` }));
      if (isGlobal && item.grade) head.append(el('span', { className: 'ibadah-score', textContent: `${w.grade}: ${item.grade}` }));
      card.append(head);
      if (isGlobal && item.arabic) card.append(el('p', { className: 'ibadah-arabic', lang: 'ar', dir: 'rtl', textContent: item.arabic }));
      if (isGlobal && item.english) card.append(el('p', { className: 'ibadah-prose', dir: 'auto', textContent: item.english }));
      if (!isGlobal) card.append(el('p', { className: 'ibadah-prose', dir: 'auto', textContent: item.text }));
      const actions = el('div', { className: 'ibadah-actions' });
      const detail = el('button', { type: 'button', className: 'pill', textContent: w.openDetail });
      detail.addEventListener('click', () => {
        $('ilm-book').value = collection;
        $('ilm-number').value = number;
        loadDetail(collection, number);
        $('ilm-detail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      actions.append(detail);
      if (isGlobal && collectionFor(collection)?.indonesian) {
        const translation = el('button', { type: 'button', className: 'pill solid', textContent: w.showIndonesian });
        const translated = el('p', { className: 'ibadah-prose', dir: 'auto', hidden: true });
        translation.addEventListener('click', async () => {
          translation.disabled = true;
          translation.textContent = w.loading;
          try {
            const response = await getIndonesianHadith(collection, number);
            translated.textContent = `${w.indonesian}: ${response.hadith.text}`;
            translated.hidden = false;
            translation.hidden = true;
          } catch {
            translated.textContent = w.translationError;
            translated.hidden = false;
            translation.disabled = false;
            translation.textContent = w.showIndonesian;
          }
        });
        actions.append(translation);
        card.append(actions, translated);
      } else card.append(actions);
      container.append(card);
    }
  }

  async function openSelectedTafsir() {
    const number = Number($('ilm-surah').value);
    if (!Number.isInteger(number) || number < 1 || number > 114) return;
    sheets.close('ilm-panel');
    onNavigate(number, 1, 'tafsir');
  }

  $('ilm-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (button) setTab(button.dataset.tab);
  });
  $('ilm-browse-form').addEventListener('submit', openHadithByNumber);
  $('ilm-search-form').addEventListener('submit', searchHadith);
  $('ilm-search-scope').addEventListener('change', setScopeHint);
  $('ilm-search-collection').addEventListener('change', () => {
    if ($('ilm-search-scope').value === 'global') globalSearchCollection = $('ilm-search-collection').value;
    else if (collectionFor($('ilm-search-collection').value)?.indonesian) indonesianSearchCollection = $('ilm-search-collection').value;
  });
  $('ilm-surah-search').addEventListener('input', renderSurahOptions);
  $('ilm-open-tafsir').addEventListener('click', openSelectedTafsir);

  updateStaticText();
  setStatus($('ilm-detail-status'), words().emptyDetail);
  setStatus($('ilm-search-status'), words().statusReady);

  return {
    open,
    relang(nextLang) {
      lang = nextLang === 'en' ? 'en' : 'id';
      updateStaticText();
      if (!selectedDetail && !$('ilm-detail').children.length) setStatus($('ilm-detail-status'), words().emptyDetail);
      if (!selectedSearch && !$('ilm-search-results').children.length) setStatus($('ilm-search-status'), words().statusReady);
    },
  };
}
