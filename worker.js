// Cloudflare Worker entry point for Quran Oyen's static site assets.
// Social crawlers do not run the page JavaScript, so shared ayah URLs receive
// their Open Graph/Twitter metadata here while the regular app stays static.
const PUBLIC_ORIGIN = 'https://alquran.bangundwir.my.id';
const PREVIEW_START = '<!-- share-preview:start -->';
const PREVIEW_END = '<!-- share-preview:end -->';
const jsonAssets = new Map();

function jsonAsset(env, requestUrl, path) {
  if (!jsonAssets.has(path)) {
    const url = new URL(path, requestUrl.origin);
    const pending = env.ASSETS.fetch(new Request(url, { headers: { accept: 'application/json' } }))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Asset ${path}: ${response.status}`);
        return response.json();
      });
    jsonAssets.set(path, pending);
    pending.catch(() => {
      if (jsonAssets.get(path) === pending) jsonAssets.delete(path);
    });
  }
  return jsonAssets.get(path);
}

function escapeAttribute(value) {
  return String(value).replace(/[&"<>']/g, (char) => ({
    '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;', "'": '&#39;',
  })[char]);
}

function shorten(text, limit = 190) {
  const clean = String(text).replace(/\s+/gu, ' ').trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1).replace(/\s+\S*$/u, '')}…`;
}

async function versePreview(env, requestUrl, surahNumber, ayahNumber) {
  const index = await jsonAsset(env, requestUrl, '/data/index.json');
  const surah = index[surahNumber - 1];
  if (!surah || surah.n !== surahNumber || ayahNumber > surah.ayat) return null;
  const file = `/data/id/t${String(surahNumber).padStart(3, '0')}.json`;
  const translations = await jsonAsset(env, requestUrl, file);
  const translation = translations?.ayat?.[ayahNumber - 1];
  if (translations?.n !== surahNumber || typeof translation !== 'string' || !translation.trim()) return null;

  const canonical = new URL('/gulir', PUBLIC_ORIGIN);
  canonical.searchParams.set('s', String(surahNumber));
  canonical.searchParams.set('a', String(ayahNumber));
  const title = `Quran Oyen · ${surah.latin} ${surahNumber}:${ayahNumber}`;
  const description = `“${shorten(translation)}” — ${surah.latin} (${surahNumber}:${ayahNumber})`;
  return { canonical: canonical.href, title, description };
}

function metadataMarkup({ canonical, title, description }) {
  const url = escapeAttribute(canonical);
  const safeTitle = escapeAttribute(title);
  const safeDescription = escapeAttribute(description);
  const image = `${PUBLIC_ORIGIN}/icons/share-preview.png`;
  return [
    `<link rel="canonical" href="${url}">`,
    `<meta name="description" content="${safeDescription}">`,
    '<meta property="og:type" content="article">',
    '<meta property="og:site_name" content="Quran Oyen">',
    `<meta property="og:title" content="${safeTitle}">`,
    `<meta property="og:description" content="${safeDescription}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:image:alt" content="Gulir Ayat · Quran Oyen — Satu ayat, satu jeda.">',
    '<meta property="og:locale" content="id_ID">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${safeTitle}">`,
    `<meta name="twitter:description" content="${safeDescription}">`,
    `<meta name="twitter:image" content="${image}">`,
  ].join('\n');
}

function htmlResponse(response, html, cache = false) {
  const headers = new Headers(response.headers);
  for (const header of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(header);
  if (cache) headers.set('cache-control', 'public, max-age=300');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

async function withSharePreview(request, env, response) {
  const requestUrl = new URL(request.url);
  if (request.method !== 'GET' || !['/gulir', '/gulir.html'].includes(requestUrl.pathname)) return response;
  const surahRaw = requestUrl.searchParams.get('s');
  const ayahRaw = requestUrl.searchParams.get('a');
  if (!/^\d{1,3}$/u.test(surahRaw || '') || !/^\d{1,3}$/u.test(ayahRaw || '')) return response;
  const surahNumber = Number(surahRaw);
  const ayahNumber = Number(ayahRaw);
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114 || ayahNumber < 1) return response;
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return response;

  let preview;
  try { preview = await versePreview(env, requestUrl, surahNumber, ayahNumber); }
  catch { return response; }
  if (!preview) return response;
  let html;
  try { html = await response.text(); }
  catch { return response; }
  const start = html.indexOf(PREVIEW_START);
  const end = html.indexOf(PREVIEW_END, start + PREVIEW_START.length);
  if (start < 0 || end < 0) return htmlResponse(response, html);
  const updated = `${html.slice(0, start + PREVIEW_START.length)}\n${metadataMarkup(preview)}\n${html.slice(end)}`;
  // A failed metadata lookup must never prevent the reader itself from opening.
  return htmlResponse(response, updated, true);
}

export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    return withSharePreview(request, env, response);
  },
};
