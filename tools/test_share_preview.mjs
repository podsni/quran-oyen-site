import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../worker.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await fs.readFile(path.join(root, 'gulir.html'), 'utf8');
const genericHtml = html.replace('<!-- share-preview:start -->', '<!-- share-preview:start -->\n<meta property="og:title" content="Gulir Ayat · Quran Oyen">');
const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/gulir' || url.pathname === '/gulir.html') {
      return new Response(genericHtml, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname === '/data/index.json') {
      return Response.json([{ n: 1, latin: 'Al-Faatiha', ayat: 2 }]);
    }
    if (url.pathname === '/data/id/t001.json') {
      return Response.json({ n: 1, ayat: ['Cuplikan & <teks> "aman".', 'Ayat kedua.'] });
    }
    return new Response('not found', { status: 404 });
  },
};

const valid = await worker.fetch(new Request('https://alquran.bangundwir.my.id/gulir?s=1&a=1'), { ASSETS: assets });
const validHtml = await valid.text();
assert.equal(valid.status, 200);
assert.match(validHtml, /Quran Oyen · Al-Faatiha 1:1/);
assert.match(validHtml, /Cuplikan &amp; &lt;teks&gt; &quot;aman&quot;/);
assert.match(validHtml, /https:\/\/alquran\.bangundwir\.my\.id\/gulir\?s=1&amp;a=1/);
assert.match(validHtml, /summary_large_image/);
assert.equal(valid.headers.get('cache-control'), 'public, max-age=300');

const invalid = await worker.fetch(new Request('https://alquran.bangundwir.my.id/gulir?s=1&a=3'), { ASSETS: assets });
const invalidHtml = await invalid.text();
assert.match(invalidHtml, /Gulir Ayat · Quran Oyen/);
assert.doesNotMatch(invalidHtml, /Al-Faatiha 1:3/);

const normal = await worker.fetch(new Request('https://alquran.bangundwir.my.id/gulir'), { ASSETS: assets });
assert.match(await normal.text(), /Gulir Ayat · Quran Oyen/);
console.log('share-preview tests: ok · per-ayah metadata, escaped description, canonical URL, invalid refs, generic fallback');
