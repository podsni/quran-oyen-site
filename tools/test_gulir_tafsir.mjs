import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json')));
const expected = { jalalayn: 'id.jalalayn.txt', muntakhab: 'id.muntakhab.txt' };
for (const id of Object.keys(expected)) {
  let n = 0;
  for (const row of index) {
    const p = path.join(root, 'tafsir', id, `t${String(row.n).padStart(3, '0')}.json`);
    const data = JSON.parse(fs.readFileSync(p));
    assert.equal(data.n, row.n); assert.equal(data.ayat.length, row.ayat); assert(data.ayat.every((x) => x.length)); n += data.ayat.length;
  }
  assert.equal(n, 6236);
}
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url) => {
  calls += 1;
  const file = String(url).replace(/^.*\/tafsir\//, path.join(root, 'tafsir') + '/');
  if (calls === 1) return new Response('', { status: 503 });
  return new Response(fs.readFileSync(file, 'utf8'), { status: 200, headers: { 'content-type': 'application/json' } });
};
const mod = await import('../gulir-tafsir.js?test=1');
await assert.rejects(() => mod.getVerseTafsir('muntakhab', 1, 1), /HTTP 503/);
const first = await mod.getVerseTafsir('muntakhab', 1, 1);
assert.equal(first.blocks[0].kind, 'intro'); assert.equal(first.blocks[0].from, 1); assert.equal(first.blocks[0].to, 1); assert(!first.blocks[0].text.startsWith('[['));
assert.equal(first.blocks.at(-1).kind, 'tafsir');
const before = calls; const second = await mod.getVerseTafsir('muntakhab', 1, 1); assert.equal(calls, before); assert.equal(second.cached, true);
await assert.rejects(() => mod.getVerseTafsir('unknown', 1, 1), RangeError);
await assert.rejects(() => mod.getVerseTafsir('jalalayn', 0, 1), RangeError);
globalThis.fetch = originalFetch;
console.log(`ok: 228 files, 6236 ayat/source, mock fetch/cache/retry/invalid refs`);
