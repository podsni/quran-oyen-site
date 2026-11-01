import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createGulirData, cachedSurahNumbers } from '../gulir-data.js';

const base = new URL('../data/', import.meta.url);
const index = JSON.parse(await fs.readFile(new URL('index.json', base), 'utf8'));
const disk = new Map();
async function fixtureFetch(url) {
  const key = new URL(url).href;
  if (!disk.has(key)) disk.set(key, fs.readFile(new URL(url), 'utf8'));
  const text = await disk.get(key);
  return { ok: true, json: async () => JSON.parse(text) };
}
function fixture(options = {}) {
  const requests = [];
  const fetcher = async url => {
    requests.push(url);
    if (options.allow && !options.allow.some(n => new URL(url).pathname.endsWith(`${String(n).padStart(3, '0')}.json`))) throw Error('network unavailable');
    return fixtureFetch(url);
  };
  return { api: createGulirData(index, { fetcher, isOnline: options.online ?? true, cachedSurahs: () => options.cached ?? [] }), requests };
}

test('a fixed seed gives the same complete units with cold and prewarmed surahs', async () => {
  const cold = fixture(), warm = fixture();
  await Promise.all([1,2,50,107,114].map(n => warm.api.surah(n)));
  const a = await cold.api.batch({ seed: 41029, count: 15 });
  const b = await warm.api.batch({ seed: 41029, count: 15 });
  assert.deepEqual(a.units, b.units);
  assert.deepEqual(a.items.map(v => `${v.s}:${v.a}`), b.items.map(v => `${v.s}:${v.a}`));
  assert.ok(a.items.length >= 15 && a.items.length <= 19);
  assert.ok(new Set(a.items.map(v => v.s)).size > 1, 'online selection spans surahs');
  for (const key of a.units) {
    const group = a.items.filter(v => v.unitKey === key);
    assert.equal(group.length, group[0].of);
    assert.deepEqual(group.map(v => v.part), Array.from({length:group.length}, (_,i) => i+1));
  }
});

test('offline startup uses cached hints not yet loaded, and exclusions never randomly miss the last unit', async () => {
  const {api,requests} = fixture({ online:false, cached:[107], allow:[107] });
  const all = await api.batch({seed:37,count:100});
  assert.equal(all.items.length,7);
  assert.equal(all.failures,0);
  assert.equal(all.exhausted,true);
  assert.ok(all.items.every(v => v.s === 107));
  const remaining = all.units.at(-1), before = requests.length;
  const last = await api.batch({seed:1,count:1,exclude:new Set(all.units.filter(key=>key!==remaining))});
  assert.deepEqual(last.units,[remaining]);
  const none = await api.batch({seed:1,count:10,exclude:new Set(all.units)});
  assert.deepEqual(none.items,[]);
  assert.equal(none.exhausted,true);
  assert.equal(requests.length,before,'already loaded offline data is reused');
});

test('online can be misleading: failed network attempts fall back to complete cached surahs in a fresh session', async () => {
  const {api,requests} = fixture({ online:true, cached:[107,112], allow:[107,112] });
  const result = await api.batch({seed:1,count:10});
  assert.ok(result.items.length > 0);
  assert.ok(result.items.every(v=>[107,112].includes(v.s)));
  assert.ok(result.failures >= 1 && result.failures <= 3);
  assert.equal(result.exhausted,false,'network failure is not represented as an exhausted Quran');
  const failedSurahs = new Set(requests.filter(url=>!['107','112'].some(n=>new URL(url).pathname.endsWith(`${n}.json`))).map(url=>new URL(url).pathname.match(/(\d{3})\.json$/)[1]));
  assert.ok(failedSurahs.size<=3,'failure probes are bounded');
});

test('total network failure remains distinguishable from exhaustion and count zero performs no work', async () => {
  let hints=0,calls=0;
  const api=createGulirData(index,{fetcher:async()=>{calls++;throw Error('offline')},isOnline:true,cachedSurahs:async()=>{hints++;return []}});
  assert.deepEqual(await api.batch({count:0}),{items:[],units:[],failures:0,exhausted:true});
  assert.equal(calls,0);assert.equal(hints,0);
  const failed=await api.batch({count:10,seed:99});
  assert.deepEqual(failed.items,[]);assert.equal(failed.failures,3);assert.equal(failed.exhausted,false);
  assert.equal(calls,9,'three files for each of only three failed surahs');
});

test('concurrent surah requests share exactly three in-flight file requests', async () => {
  const {api,requests}=fixture();
  const [a,b]=await Promise.all([api.surah(107),api.surah(107)]);
  assert.equal(a,b);assert.equal(requests.length,3);
});

test('cache inventory ignores incomplete triplets, other app bases, foreign origins and non-Quran stores', async () => {
  const triplet=n=>[`s${n}.json`,`id/t${n}.json`,`links/l${n}.json`].map(file=>({url:new URL(file,base).href+'?h=123'}));
  const stores={
    'quran-current': [...triplet('107'),...triplet('112').slice(0,2),...triplet('114').map(request=>({url:request.url.replace(base.pathname,'/other-app/data/')})),...triplet('113').map(request=>({url:'https://foreign.example/data/'+request.url.split('/data/')[1]}))],
    'unrelated-cache':triplet('001'),
  };
  const storage={keys:async()=>Object.keys(stores),open:async name=>({keys:async()=>stores[name]})};
  assert.deepEqual(await cachedSurahNumbers(storage),[107]);
  assert.deepEqual(await cachedSurahNumbers({keys:async()=>{throw Error('blocked')}}),[]);
});
