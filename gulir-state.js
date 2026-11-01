/* Gulir Ayat state: deliberately uses its own versioned key and never touches qwbw.*. */

const TOTAL = 6236;
const DEFAULT_KEY = 'quran-oyen.gulir.v1';
const DEFAULT_PREFS = Object.freeze({ theme: 'light', size: 'medium', latin: true });

export function localDay(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${String(y).padStart(4, '0')}-${m}-${day}`;
}

export function dayNumber(dayString) {
  if (typeof dayString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayString)) return NaN;
  const [y, m, d] = dayString.split('-').map(Number);
  const value = Date.UTC(y, m - 1, d);
  if (new Date(value).toISOString().slice(0, 10) !== dayString) return NaN;
  return Math.floor(value / 86400000);
}

function refFromFlat(index, flat) {
  let n = 0;
  for (let s = 0; s < index.length; s += 1) {
    const ayat = Number(index[s]?.ayat);
    if (!Number.isInteger(ayat) || ayat < 1) continue;
    if (flat < n + ayat) return { s: s + 1, a: flat - n + 1 };
    n += ayat;
  }
  return null;
}

export function dailyRef(index, date = new Date()) {
  if (!Array.isArray(index) || !index.length) return null;
  const day = localDay(date);
  const number = dayNumber(day);
  if (!Number.isFinite(number)) return null;
  const total = index.reduce((sum, item) => sum + (Number.isInteger(item?.ayat) && item.ayat > 0 ? item.ayat : 0), 0);
  if (!total) return null;
  return refFromFlat(index, ((number % total) + total) % total);
}

export function refKey(ref) {
  return ref && Number.isInteger(ref.s) && Number.isInteger(ref.a) ? `${ref.s}:${ref.a}` : '';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}
function base64ToBytes(value) {
  if (typeof value !== 'string') return null;
  try {
    const binary = typeof atob === 'function' ? atob(value) : Buffer.from(value, 'base64').toString('binary');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { return null; }
}
function makeBits() { return new Uint8Array(Math.ceil(TOTAL / 8)); }
function bitGet(bits, id) { return (bits[id >> 3] & (1 << (id & 7))) !== 0; }
function bitSet(bits, id) { bits[id >> 3] |= 1 << (id & 7); }
function countBits(bits) { let n = 0; for (const byte of bits) { let x = byte; while (x) { x &= x - 1; n += 1; } } return n; }
function dateNow(now) { const d = now(); return d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date(); }

export function createGulirStore(index, options = {}) {
  const rows = Array.isArray(index) ? index : [];
  const limits = rows.map(x => Number.isInteger(x?.ayat) && x.ayat > 0 ? x.ayat : 0);
  const validTotal = limits.reduce((a, b) => a + b, 0) || TOTAL;
  const storage = options.storage;
  const key = typeof options.key === 'string' && options.key ? options.key : DEFAULT_KEY;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  let persistent = false;
  let bits = makeBits();
  let daily = Object.create(null);
  let savedItems = [];
  let goal = 1;
  let prefs = { ...DEFAULT_PREFS };
  let last = null;

  function validRef(ref) {
    return ref && Number.isInteger(ref.s) && Number.isInteger(ref.a) && ref.s >= 1 && ref.s <= limits.length && ref.a >= 1 && ref.a <= limits[ref.s - 1];
  }
  function idOf(ref) {
    let id = 0; for (let i = 0; i < ref.s - 1; i += 1) id += limits[i]; return id + ref.a - 1;
  }
  function normalizeRef(ref) { return validRef(ref) ? { s: ref.s, a: ref.a } : null; }
  function readBits(encoded) { const b = base64ToBytes(encoded); if (!b || b.length !== bits.length) return null; if (validTotal % 8) b[b.length - 1] &= (1 << (validTotal % 8)) - 1; return b; }
  function saveState() {
    if (!storage || typeof storage.setItem !== 'function') { persistent = false; return; }
    const state = { v: 1, n: validTotal, p: bytesToBase64(bits), d: daily, saved: savedItems, goal, prefs, last };
    try { storage.setItem(key, JSON.stringify(state)); persistent = true; } catch { persistent = false; }
  }
  function loadState() {
    if (!storage || typeof storage.getItem !== 'function') return;
    let raw; try { raw = storage.getItem(key); } catch { return; }
    if (raw == null) { persistent = true; return; }
    try {
      const state = JSON.parse(raw);
      if (!state || state.v !== 1 || !Number.isInteger(state.n) || state.n !== validTotal) return;
      const loadedBits = readBits(state.p); if (!loadedBits) return; bits = loadedBits;
      if (state.d && typeof state.d === 'object' && !Array.isArray(state.d)) {
        for (const [day, encoded] of Object.entries(state.d)) if (Number.isFinite(dayNumber(day)) && readBits(encoded)) daily[day] = encoded;
      }
      if (Array.isArray(state.saved)) {
        for (const item of state.saved) { const ref = normalizeRef(item); if (ref && !savedItems.some(x => refKey(x) === refKey(ref))) savedItems.push({ ...ref, savedAt: typeof item.savedAt === 'string' ? item.savedAt : '' }); }
        savedItems = savedItems.slice(0, 500);
      }
      if (Number.isInteger(state.goal) && state.goal >= 1 && state.goal <= 100) goal = state.goal;
      if (state.prefs && (state.prefs.theme === 'light' || state.prefs.theme === 'dark') && (state.prefs.size === 'small' || state.prefs.size === 'medium' || state.prefs.size === 'large')) prefs = { theme: state.prefs.theme, size: state.prefs.size, latin: state.prefs.latin !== false };
      last = normalizeRef(state.last);
      persistent = true;
    } catch { /* malformed state is ignored and replaced by memory state */ }
  }
  loadState();

  function dayBits(day, create = false) {
    const existing = daily[day];
    const parsed = existing ? readBits(existing) : null;
    if (parsed) return parsed;
    if (create) { const b = makeBits(); daily[day] = bytesToBase64(b); return b; }
    return makeBits();
  }
  function updateDay(day, b) { daily[day] = bytesToBase64(b); }
  function today() { return localDay(dateNow(now)); }
  function summary() {
    const day = today(); const todayBits = dayBits(day); const totalRead = countBits(bits);
    const active = Object.keys(daily).filter(x => Number.isFinite(dayNumber(x)) && dayNumber(x) <= dayNumber(day) && countBits(dayBits(x)) > 0).sort();
    let best = 0, run = 0, previous = null;
    for (const x of active) { const n = dayNumber(x); run = previous !== null && n === previous + 1 ? run + 1 : 1; best = Math.max(best, run); previous = n; }
    let current = 0; if (active.length && (dayNumber(day) - dayNumber(active[active.length - 1]) <= 1)) { let i = active.length - 1; current = 1; while (i > 0 && dayNumber(active[i]) === dayNumber(active[i - 1]) + 1) { current += 1; i -= 1; } }
    return { totalRead, percent: Math.round(totalRead / validTotal * 1000) / 10, todayRead: countBits(todayBits), goal, currentStreak: current, bestStreak: best, last: last ? { ...last } : null, savedCount: savedItems.length, persistent };
  }
  return {
    snapshot() { return clone({ read: bytesToBase64(bits), daily: clone(daily), saved: savedItems, goal, preferences: prefs, last, persistent }); },
    summary,
    isSaved(ref) { const r = normalizeRef(ref); return !!r && savedItems.some(x => refKey(x) === refKey(r)); },
    toggleSaved(ref) {
      const r = normalizeRef(ref); if (!r) return false;
      const found = savedItems.findIndex(x => refKey(x) === refKey(r));
      if (found >= 0) { savedItems.splice(found, 1); saveState(); return false; }
      const stamp = dateNow(now).toISOString(); savedItems.unshift({ ...r, savedAt: stamp }); savedItems = savedItems.slice(0, 500); saveState(); return true;
    },
    saved() { return savedItems.map(x => ({ ...x })); },
    markRead(ref) {
      const r = normalizeRef(ref); if (!r) return false;
      const id = idOf(r); const added = !bitGet(bits, id); bitSet(bits, id);
      const day = today(); const db = dayBits(day, true); bitSet(db, id); updateDay(day, db); last = r; saveState(); return added;
    },
    setGoal(value) { if (!Number.isInteger(value) || value < 1 || value > 100) return false; goal = value; saveState(); return true; },
    setPreference(keyName, value) {
      if (keyName === 'theme' && (value === 'light' || value === 'dark')) prefs.theme = value;
      else if (keyName === 'size' && (value === 'small' || value === 'medium' || value === 'large')) prefs.size = value;
      else if (keyName === 'latin' && typeof value === 'boolean') prefs.latin = value;
      else return false;
      saveState(); return true;
    },
    preference(keyName) { return prefs[keyName]; },
    resetProgress() { bits = makeBits(); daily = Object.create(null); last = null; saveState(); }
  };
}
