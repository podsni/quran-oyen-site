const DEFAULT_KEY = 'quran-oyen.story-drafts.v1';
const THEMES = new Set(['forest', 'paper', 'dusk']);
const LIMIT = 20;

function validDate(value) {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

export function createStoryDraftStore(index, options = {}) {
  const counts = Array.isArray(index) ? index.map(row => Number.isInteger(row?.ayat) && row.ayat > 0 ? row.ayat : 0) : [];
  const storage = options.storage;
  const key = typeof options.key === 'string' && options.key ? options.key : DEFAULT_KEY;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  let drafts = [];
  let persistent = false;

  function normalize(ref, value = {}) {
    if (!ref || !Number.isInteger(ref.s) || !Number.isInteger(ref.a) || ref.s < 1 || ref.s > counts.length || ref.a < 1 || ref.a > counts[ref.s - 1]) return null;
    return {
      s: ref.s,
      a: ref.a,
      theme: THEMES.has(value.theme) ? value.theme : 'forest',
      includeLatin: value.includeLatin === true,
      savedAt: validDate(value.savedAt) ? value.savedAt : '',
    };
  }

  function persist() {
    if (!storage || typeof storage.setItem !== 'function') {
      persistent = false;
      return;
    }
    try {
      storage.setItem(key, JSON.stringify({ v: 1, drafts }));
      persistent = true;
    } catch {
      persistent = false;
    }
  }

  function load() {
    if (!storage || typeof storage.getItem !== 'function') return;
    let raw;
    try { raw = storage.getItem(key); } catch { return; }
    if (raw == null) {
      persistent = true;
      return;
    }
    try {
      const state = JSON.parse(raw);
      if (!state || state.v !== 1 || !Array.isArray(state.drafts)) return;
      for (const item of state.drafts) {
        const draft = normalize(item, item);
        if (draft && !drafts.some(existing => existing.s === draft.s && existing.a === draft.a)) drafts.push(draft);
      }
      drafts = drafts.slice(0, LIMIT);
      persistent = true;
    } catch {
      drafts = [];
    }
  }

  load();

  return {
    list() { return drafts.map(item => ({ ...item })); },
    get(ref) {
      const item = drafts.find(draft => draft.s === ref?.s && draft.a === ref?.a);
      return item ? { ...item } : null;
    },
    save(ref, value = {}) {
      const input = normalize(ref, value);
      if (!input) return false;
      const date = now();
      const savedAt = date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
      const draft = { ...input, savedAt };
      drafts = [draft, ...drafts.filter(item => item.s !== draft.s || item.a !== draft.a)].slice(0, LIMIT);
      persist();
      return true;
    },
    remove(ref) {
      const before = drafts.length;
      drafts = drafts.filter(item => item.s !== ref?.s || item.a !== ref?.a);
      if (drafts.length !== before) persist();
      return drafts.length !== before;
    },
    persistent() { return persistent; },
  };
}
