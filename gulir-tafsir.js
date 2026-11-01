import { getEquranTafsir } from './equran.js';

const ROOT = new URL('./tafsir/', import.meta.url);
const memory = new Map();
const COUNT = 114;
const AYAH_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

export const TAFSIR_SOURCES = [
  { id: 'jalalayn', name: 'Jalalayn', credit: 'Tafsir Jalalayn karya al-Mahalli dan as-Suyuti; Tanzil untuk penggunaan non-komersial.', url: 'https://tanzil.net/trans/' },
  { id: 'muntakhab', name: 'Al-Muntakhab', credit: 'Tafsir al-Muntakhab karya Muhammad Quraish Shihab et al.; Tanzil untuk penggunaan non-komersial.', url: 'https://tanzil.net/trans/' },
  { id: 'kemenag', name: 'Kemenag', credit: 'Tafsir Kementerian Agama Republik Indonesia, melalui EQuran.id API v2.', url: 'https://equran.id/apidev/v2' },
];

export const EXTERNAL_TAFSIR_SOURCES = [
  { id: 'mokhtasar', name: 'Al-Mukhtasar', url: 'https://quranenc.com/id/browse/indonesian_mokhtasar' },
  { id: 'saadi', name: 'As-Sa’di', url: 'https://quranenc.com/id/browse/indonesian_saadi' },
];

function validateRef(s, a) {
  if (!Number.isInteger(s) || s < 1 || s > COUNT || !Number.isInteger(a) || a < 1 || a > AYAH_COUNTS[s - 1]) throw new RangeError('Referensi tafsir tidak valid.');
}
function validateLocal(payload, s) {
  if (!payload || payload.n !== s || !Array.isArray(payload.ayat) || payload.ayat.length !== AYAH_COUNTS[s - 1] || payload.ayat.some((x) => typeof x !== 'string' || !x)) throw new Error('Data tafsir lokal tidak valid.');
  return payload;
}
async function loadLocal(id, s) {
  const key = `${id}/${s}`;
  if (memory.has(key)) return { data: memory.get(key), cached: true };
  const promise = fetch(new URL(`${id}/t${String(s).padStart(3, '0')}.json`, ROOT), { credentials: 'same-origin' })
    .then((response) => { if (!response.ok) throw new Error(`Tafsir lokal: HTTP ${response.status}`); return response.json(); })
    .then((payload) => validateLocal(payload, s));
  try {
    const data = await promise;
    memory.set(key, data);
    return { data, cached: false };
  } catch (error) {
    memory.delete(key); // rejected loads must never poison a retry
    throw error;
  }
}
function localBlocks(id, payload, a) {
  let text = payload.ayat[a - 1];
  if (typeof text !== 'string') throw new RangeError('Ayat tidak tersedia dalam sumber tafsir.');
  const blocks = [];
  if (id === 'muntakhab' && text.startsWith('[[')) {
    const end = text.indexOf(']]');
    if (end >= 2) {
      blocks.push({ kind: 'intro', from: a, to: a, text: text.slice(2, end), shared: false });
      text = text.slice(end + 2).replace(/^\s+/, '');
    }
  }
  if (text) blocks.push({ kind: 'tafsir', from: a, to: a, text, shared: false });
  return blocks;
}

export async function getVerseTafsir(id, s, a) {
  const source = TAFSIR_SOURCES.find((item) => item.id === id);
  validateRef(s, a);
  if (!source) throw new RangeError('Sumber tafsir tidak dikenal.');
  if (id === 'kemenag') {
    const result = await getEquranTafsir(s);
    const entry = result.data.tafsir.find((item) => item.ayat === a);
    if (!entry) throw new RangeError('Ayat tidak tersedia dalam sumber tafsir.');
    return { source, blocks: [{ kind: 'tafsir', from: a, to: a, text: entry.teks, shared: false }], cached: result.cached };
  }
  const result = await loadLocal(id, s);
  return { source, blocks: localBlocks(id, result.data, a), cached: result.cached };
}
