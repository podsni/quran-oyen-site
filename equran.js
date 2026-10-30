const API = 'https://equran.id/api/v2';
const CACHE_DB = 'quran-oyen-equran-v2';
const CACHE_STORE = 'responses';
const memory = new Map();
let database;

export const QARIS = [
  { id: '01', name: 'Abdullah Al-Juhany' },
  { id: '02', name: 'Abdul Muhsin Al-Qasim' },
  { id: '03', name: 'Abdurrahman As-Sudais' },
  { id: '04', name: 'Ibrahim Al-Dossari' },
  { id: '05', name: 'Misyari Rasyid Al-Afasy' },
  { id: '06', name: 'Yasser Al-Dosari' },
];

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

export function unwrapResponse(payload) {
  if (!payload || payload.code !== 200 || !('data' in payload)) throw new Error(payload?.message || 'Respons API tidak valid.');
  return payload.data;
}

export function validateAudioUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'cdn.equran.id' || !/^\/audio-(?:full|partial)\/.+\.mp3$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function audioForQari(audioMap, qariId) {
  if (!QARIS.some((qari) => qari.id === qariId) || !audioMap || typeof audioMap !== 'object') return null;
  return validateAudioUrl(audioMap[qariId]);
}

export function validateSurahList(value) {
  if (!Array.isArray(value) || value.length !== 114) throw new Error('Daftar surat dari API tidak lengkap.');
  for (let i = 0; i < value.length; i++) {
    const surah = value[i];
    if (surah?.nomor !== i + 1 || !surah.namaLatin || !Number.isInteger(surah.jumlahAyat)) throw new Error('Metadata surat dari API tidak valid.');
  }
  return value;
}

export function validateSurahDetail(value, expectedNumber) {
  if (!value || value.nomor !== expectedNumber || !Number.isInteger(value.jumlahAyat) || !Array.isArray(value.ayat) || value.ayat.length !== value.jumlahAyat) {
    throw new Error('Detail surat dari API tidak lengkap.');
  }
  for (let i = 0; i < value.ayat.length; i++) {
    if (value.ayat[i]?.nomorAyat !== i + 1 || !value.ayat[i]?.audio || typeof value.ayat[i].audio !== 'object') {
      throw new Error('Data audio ayat dari API tidak valid.');
    }
  }
  return value;
}

export function validateTafsir(value, expectedNumber) {
  if (!value || value.nomor !== expectedNumber || !Array.isArray(value.tafsir) || value.tafsir.length === 0) throw new Error('Tafsir surat dari API tidak tersedia.');
  if (value.tafsir.some((item, index) => item?.ayat !== index + 1 || typeof item.teks !== 'string')) throw new Error('Format tafsir dari API tidak valid.');
  return value;
}

async function request(path, validate) {
  const key = `${API}${path}`;
  const cached = await readCache(key);
  if (cached && !globalThis.navigator?.onLine) return { data: validate(cached), cached: true };

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 12000) : 0;
  try {
    const response = await fetch(key, { method: 'GET', mode: 'cors', credentials: 'omit', signal: controller?.signal });
    if (!response.ok) throw new Error(`EQuran.id: HTTP ${response.status}`);
    const data = validate(unwrapResponse(await response.json()));
    await writeCache(key, data);
    return { data, cached: false };
  } catch (error) {
    if (cached) return { data: validate(cached), cached: true };
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const getEquranSurahs = () => request('/surat', validateSurahList);
export const getEquranSurah = (number) => {
  if (!Number.isInteger(number) || number < 1 || number > 114) return Promise.reject(new RangeError('Nomor surat harus 1–114.'));
  return request(`/surat/${number}`, (data) => validateSurahDetail(data, number));
};
export const getEquranTafsir = (number) => {
  if (!Number.isInteger(number) || number < 1 || number > 114) return Promise.reject(new RangeError('Nomor surat harus 1–114.'));
  return request(`/tafsir/${number}`, (data) => validateTafsir(data, number));
};
