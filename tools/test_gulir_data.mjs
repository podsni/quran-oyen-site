import assert from 'node:assert/strict';
import { createGulirData, joinWords, sentenceRanges, cachedSurahNumbers } from '../gulir-data.js';
import fs from 'node:fs/promises';
import path from 'node:path';

assert.equal(joinWords([['۞', 0, '', '', '', '', '', ''], ['قَالَ', 0, '', '', '', '', '', 'ۛ'], ['هُوَ', 0, '', '', '', '', '', 'ۚ']]), '۞ قَالَ ۛ هُوَ ۚ');
assert.deepEqual(sentenceRanges(['First clause,', 'continues.', 'Next (quoted).', 'lower continuation', 'Done!']), [[1, 2], [3, 5]]);
assert.deepEqual(sentenceRanges(['Maka shalat,', '(yaitu) lalai,', 'dan riya,', 'dan enggan.']), [[1, 4]]);

const root = path.resolve(new URL('..', import.meta.url).pathname);
const index = JSON.parse(await fs.readFile(path.join(root, 'data/index.json')));
const files = new Map();
for (const file of ['s001.json', 'id/t001.json', 'links/l001.json', 's107.json', 'id/t107.json', 'links/l107.json', 'roots.json']) files.set(file, await fs.readFile(path.join(root, 'data', file), 'utf8'));
let calls = 0;
const fake = async (url) => {
  calls++;
  const key = new URL(url).pathname.split('/data/')[1];
  if (!files.has(key)) {
    try { files.set(key, await fs.readFile(path.join(root, 'data', key), 'utf8')); }
    catch { return { ok: false, status: 404, json: async () => ({}) }; }
  }
  return { ok: true, json: async () => JSON.parse(files.get(key)) };
};
const api = createGulirData(index, { fetcher: fake });
const s107 = await api.surah(107);
assert.equal(s107.words.ayat.length, 7);
const v = await api.verse({ s: 107, a: 4 });
assert.equal(v.unitKey, '107:4');
assert.equal(v.part, 1); assert.equal(v.of, 4);
const ctx = await api.context({ s: 107, a: 4 });
assert.equal(ctx.items.length, 4); assert.equal(ctx.before.a, 3); assert.equal(ctx.after, null);
const beforeCalls = calls; await api.surah(107); assert.equal(calls, beforeCalls, 'successful fetches are cached');
const rel = await api.related({ s: 107, a: 1 }, 2);
assert.equal(rel.length, 2); assert.ok(rel[0].sharedRoots.every(r => typeof r.r === 'string'));
assert.equal((await api.roots()).length, 1642);
const b1 = await api.batch({ seed: 77, count: 10 });
const b2 = await api.batch({ seed: 77, count: 10 });
assert.deepEqual(b1.items.map(v => `${v.s}:${v.a}`), b2.items.map(v => `${v.s}:${v.a}`));
assert.equal(new Set(b1.items.map(v => v.unitKey)).size, b1.units.length);
for(const key of b1.units){const unit=b1.items.filter(v=>v.unitKey===key);assert.equal(unit.length,unit[0].of);assert.deepEqual(unit.map(v=>v.part),Array.from({length:unit.length},(_,i)=>i+1));}
assert.equal(joinWords([['كلمة',0,'','','','','','۞ۚ۩']]),'۞ كلمة ۚ ۩');
const excluded = new Set(b1.units); const b3 = await api.batch({ seed: 77, count: 10, exclude: excluded });
assert.ok(b3.items.every(v => !excluded.has(v.unitKey)));

let attempts = 0;
const retry = createGulirData(index, { fetcher: async url => {
  attempts++; if (attempts === 1) throw new Error('offline'); return fake(url);
} });
await assert.rejects(() => retry.surah(107));
await retry.surah(107); assert.ok(attempts > 1, 'rejected cache entry is evicted');
let total=0;for(const meta of index){const d=await api.surah(meta.n);total+=d.words.ayat.length;for(let a=1;a<=d.words.ayat.length;a++){const words=d.words.ayat[a-1],v=await api.verse({s:meta.n,a});assert.ok(joinWords(words).length>0);assert.ok(v.latin.trim(),`missing Latin for ${meta.n}:${a}`);}}assert.equal(total,6236);
for(const ref of [{s:2,a:181},{s:8,a:6},{s:13,a:37},{s:37,a:130}])assert.equal((await api.verse(ref)).latinSource,'EQuran.id');
const cacheRoot = new URL('../data/', import.meta.url);
const cacheInventory = {
  keys: async () => ['quran-complete', 'quran-incomplete', 'not-quran'],
  open: async name => ({ keys: async () => name === 'quran-complete' ? [
    { url: new URL('s001.json', cacheRoot).href },
    { url: new URL('id/t001.json', cacheRoot).href + '?v=1' },
    { url: new URL('links/l001.json', cacheRoot).href },
    { url: 'https://other.example/data/s002.json' },
  ] : name === 'quran-incomplete' ? [
    { url: new URL('s107.json', cacheRoot).href },
    { url: new URL('id/t107.json', cacheRoot).href },
  ] : [{ url: new URL('s002.json', cacheRoot).href }] }),
};
assert.deepEqual(await cachedSurahNumbers(cacheInventory), [1]);
let offlineCalls = 0;
const offline = createGulirData(index, { isOnline: false, cachedSurahs: async () => [107], fetcher: async url => { offlineCalls++; return fake(url); } });
const zero = await offline.batch({ count: 0 });
assert.deepEqual(zero.items, []); assert.equal(offlineCalls, 0);
const offlineBatch = await offline.batch({ seed: 9, count: 2 });
assert.ok(offlineBatch.items.length >= 2); assert.equal(offlineBatch.failures, 0);
console.log('gulir-data tests: ok · 114 surahs / 6236 verses / complete context units');
