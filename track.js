// Visitor counts (Luca, 16 Oct 2026: "wtf you dont make analytics?"). The same small sender as Oyenza Transit
// (~/projects/transit-vantis/web/src/app/track.js), without its consent tier: this page asks nothing and keeps nothing
// in the browser. Sent to our own servers through this host (deploy/nginx.conf), so the CSP stays connect-src 'self':
//
//   Umami      "Quran Oyen" on analytics.vantis.sh, POST /_e: screens and taps. It tells a returning visitor apart
//              on its own server (no id in the browser), so its visitor count is the one to quote.
//   Databuddy  "Quran Oyen" on data.oyenza.com, POST /_d/…: the same screens and taps, load speed, script errors. Its
//              visitor id lives in memory and is new on every page load, so its visitors read higher than Umami's.
//
// What is sent: which screen ("/", "/surah/2", "/cari"), which thing was tapped (the names are at event() below), language,
// screen size, where the visitor came from (referrer, utm_…). Never what is typed in search (the #cari/… address is
// never sent), never a word's text.
// Off on any host but the public one, for automated browsers (QA), when the browser asks not to be tracked (Do Not
// Track / Global Privacy Control), and when localStorage has quran.notrack (our own devices).
//
//   view(path, title)    a screen opened
//   event(name, data)    something tapped: open, word, root, map, dots, search, meaning, where, lang, offline, install
//                        (data: short strings, numbers, booleans)

const SITE = 'a359fbe6-3b20-4397-ad28-e6e8d0dc5deb';      // Umami
const DB_SITE = '6edadfde-3923-4584-9181-39700d686c34';   // Databuddy
const HOSTS = new Set(['quran.oyenza.com']);
const ENDPOINT = '/_e';
const DB_ENDPOINT = '/_d';
const MAX = 400;   // per page load and receiver: a stuck loop can never flood the counter

function allowed() {
  try {
    if (!HOSTS.has(location.hostname)) return false;
    if (navigator.webdriver) return false;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return false;
    try { if (localStorage.getItem('quran.notrack')) return false; } catch { /* storage blocked: count as usual */ }
    return typeof fetch === 'function';
  } catch { return false; }
}

const on = allowed();
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (+c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (+c / 4)))).toString(16)));
const anon = `anon_${uuid()}`;
const session = `sess_${uuid()}`;
const sessionStart = Date.now();

// ------------------------------------------------------------------ Umami
let sent = 0;
let cache = '';        // Umami's session token for this page load (memory only)
// One at a time: a tap sent before the first screen's answer (the token) came back fails in this Umami (2.14) with a
// 500, "Argument `websiteId` is missing", when the tap carries data (the "open" right after the first screen).
let line = Promise.resolve();
let path = '/';
let title = '';
let referrer = '';
let first = true;

function send(extra) {
  if (!on || sent >= MAX) return;
  sent += 1;
  const payload = {
    website: SITE,
    hostname: location.hostname,
    language: navigator.language || '',
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    referrer,
    ...extra,
  };
  const body = JSON.stringify({ type: 'event', payload });
  line = line.then(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (cache) headers['x-umami-cache'] = cache;
    return fetch(ENDPOINT, { method: 'POST', headers, body, keepalive: true, credentials: 'omit' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((t) => { if (t && t.length < 4000) cache = t; });
  }).catch(() => { /* counting never gets in the way */ });
}

// ------------------------------------------------------------------ Databuddy
// Four small queues, one per collector route, sent together every few seconds and when the page is hidden.
const ROUTES = { batch: 'client_id', track: 'website_id', vitals: 'client_id', errors: 'client_id' };
const queues = { batch: [], track: [], vitals: [], errors: [] };
let dbSent = 0;
let flushTimer = 0;
let pages = 0;
let frontMs = 0;              // how long it has been in front
let frontSince = Date.now();
let taps = 0;
let arrival = null;           // utm_… and the referring page, read once

const size = (w, h) => (w >= 240 && h >= 240 && w <= 10000 && h <= 10000 ? `${w}x${h}` : undefined);
const pageUrl = (p) => `${location.origin}${p}`;
const ids = () => ({ anonymousId: anon, anonymizeVisitorIds: false, sessionId: session });

function arrived() {
  if (arrival) return arrival;
  arrival = {};
  try {
    const q = new URLSearchParams(location.search);
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid']) {
      const v = q.get(k);
      if (v) arrival[k] = clip(v, 200);
    }
    const r = document.referrer ? new URL(document.referrer) : null;
    if (r && /^https?:$/.test(r.protocol) && r.host !== location.host) arrival.referrer = `${r.origin}${r.pathname}`;
  } catch { /* odd address: arrive as direct */ }
  return arrival;
}

function queue(kind, item) {
  if (!on || dbSent >= MAX) return;
  dbSent += 1;
  queues[kind].push(item);
  if (!flushTimer) flushTimer = setTimeout(flush, 2500);
}

function flush(leaving = false) {
  clearTimeout(flushTimer);
  flushTimer = 0;
  for (const kind of Object.keys(queues)) {
    const items = queues[kind].splice(0);
    if (!items.length) continue;
    const url = `${DB_ENDPOINT}/${kind}?${ROUTES[kind]}=${DB_SITE}`;
    const body = JSON.stringify(items);
    try {
      // text/plain keeps a leaving beacon free of a preflight; the collector reads JSON from either
      if (leaving && navigator.sendBeacon?.(url, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) continue;
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch { /* counting never gets in the way */ }
  }
}

function pageEvent(name, extra) {
  const a = arrived();
  queue('batch', {
    eventId: uuid(),
    name,
    ...ids(),
    timestamp: Date.now(),
    sessionStartTime: sessionStart,
    path: pageUrl(path),
    title: clip(title, 120),
    viewport_size: size(window.innerWidth, window.innerHeight),
    screen_resolution: size(window.screen?.width || 0, window.screen?.height || 0),
    language: navigator.language || undefined,
    timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(),
    connection_type: navigator.connection?.effectiveType || undefined,
    ...a,
    ...extra,
  });
}

const frontNow = () => frontMs + (frontSince ? Date.now() - frontSince : 0);

/** The screen being left: how long it was in front and how many taps it took. */
function leaveScreen() {
  if (!pages) return;
  pageEvent('page_exit', { time_on_page: Math.min(86400, Math.round(frontNow() / 1000)), interaction_count: Math.min(taps, 9999), page_count: pages });
}

// ------------------------------------------------------------------ what the app calls
/** A screen opened. The first one carries the page's query (utm_… from a shared link) and where the visitor came from. */
export function view(p, t = '') {
  const next = clip(p, 200).replace(/[?#].*$/, '') || '/';
  if (next === path && !first) return;   // the same screen again (a surah reopened from its own address)
  if (first) {
    first = false;
    referrer = document.referrer || '';
    path = next;
    title = t;
    send({ url: `${next}${clip(location.search, 250)}`, title: clip(t, 120) });
  } else {
    leaveScreen();
    referrer = `${location.origin}${path}`;
    path = next;
    title = t;
    send({ url: next, title: clip(t, 120) });
  }
  pages += 1;
  frontMs = 0;
  frontSince = document.hidden ? 0 : Date.now();
  taps = 0;
  pageEvent('screen_view', { page_count: pages });
}

function values(data) {
  const d = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v == null || v === '') continue;
    d[k] = typeof v === 'number' || typeof v === 'boolean' ? v : clip(v, 80);
  }
  return d;
}

/** Something tapped or something that happened on the current screen. */
export function event(name, data = null) {
  const d = values(data);
  const extra = { url: path, name: clip(name, 50) };
  if (Object.keys(d).length) extra.data = d;
  send(extra);
  taps += 1;
  queue('track', {
    eventId: uuid(),
    name: clip(name, 50),
    timestamp: Date.now(),
    path: pageUrl(path),
    properties: d,
    ...ids(),
    websiteId: DB_SITE,
    source: 'browser',
  });
}

if (on) {
  // How long the page stayed in front: one "away" each time it is hidden (tab switched, phone locked, closed).
  let visibleAt = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { visibleAt = Date.now(); frontSince = visibleAt; return; }
    frontMs = frontNow();
    frontSince = 0;
    const s = Math.round((Date.now() - visibleAt) / 1000);
    if (s >= 3) event('away', { s });
    flush(true);
  });
  addEventListener('pagehide', () => { leaveScreen(); pages = 0; flush(true); });

  // Script errors (ours, not a browser extension's): the message and where, never page content.
  let errors = 0;
  const fault = (message, more = {}) => {
    if (errors >= 10 || !message || /^Script error\.?$/.test(message)) return;
    if (/(chrome|moz|safari(-web)?)-extension:/.test(`${more.filename || ''}${more.stack || ''}`)) return;
    errors += 1;
    queue('errors', { eventId: uuid(), timestamp: Date.now(), path, message: clip(message, 500), ...more, ...ids() });
  };
  addEventListener('error', (e) => fault(e.message, {
    filename: clip(e.filename, 300) || undefined, lineno: e.lineno || undefined, colno: e.colno || undefined,
    stack: e.error?.stack ? String(e.error.stack).slice(0, 2000) : undefined, errorType: e.error?.name || 'Error',
  }));
  addEventListener('unhandledrejection', (e) => fault(String(e.reason?.message || e.reason || ''), {
    stack: e.reason?.stack ? String(e.reason.stack).slice(0, 2000) : undefined, errorType: e.reason?.name || 'UnhandledRejection',
  }));

  // Load speed, once per page load: first byte, first paint, largest paint, layout shift.
  const vital = (metricName, metricValue) => queue('vitals', { eventId: uuid(), timestamp: Date.now(), path, metricName, metricValue, ...ids() });
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav?.responseStart > 0) vital('TTFB', Math.round(nav.responseStart));
    const watch = (type, fn) => { try { new PerformanceObserver((l) => fn(l.getEntries())).observe({ type, buffered: true }); } catch { /* not in this browser */ } };
    let fcp = false;
    watch('paint', (es) => { for (const e of es) if (!fcp && e.name === 'first-contentful-paint') { fcp = true; vital('FCP', Math.round(e.startTime)); } });
    let lcp = 0;
    let cls = 0;
    watch('largest-contentful-paint', (es) => { lcp = es[es.length - 1]?.startTime || lcp; });
    watch('layout-shift', (es) => { for (const e of es) if (!e.hadRecentInput) cls += e.value; });
    let told = false;
    document.addEventListener('visibilitychange', () => {
      if (told || !document.hidden) return;
      told = true;
      if (lcp) vital('LCP', Math.round(lcp));
      vital('CLS', Math.round(cls * 1000) / 1000);
      flush(true);
    }, true);
  } catch { /* no timing API */ }
}
