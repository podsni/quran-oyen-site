import test from 'node:test';
import assert from 'node:assert/strict';
import { createStoryDraftStore } from '../gulir-story-state.js';

const index = Array.from({ length: 4 }, (_, i) => ({ ayat: i === 0 ? 7 : 3 }));
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}
const clock = () => new Date('2026-11-02T00:00:00.000Z');

test('saved story draft restores reference, theme, and Latin preference after reload', () => {
  const storage = memoryStorage();
  const first = createStoryDraftStore(index, { storage, now: clock });
  assert.equal(first.save({ s: 1, a: 4 }, { theme: 'paper', includeLatin: true }), true);
  assert.equal(first.persistent(), true);

  const reloaded = createStoryDraftStore(index, { storage });
  assert.deepEqual(reloaded.get({ s: 1, a: 4 }), {
    s: 1, a: 4, theme: 'paper', includeLatin: true, savedAt: '2026-11-02T00:00:00.000Z',
  });
});

test('updating a verse replaces its draft and moves it to the top', () => {
  const storage = memoryStorage();
  const store = createStoryDraftStore(index, { storage, now: clock });
  store.save({ s: 1, a: 1 }, { theme: 'forest' });
  store.save({ s: 2, a: 2 }, { theme: 'dusk' });
  store.save({ s: 1, a: 1 }, { theme: 'paper', includeLatin: true });
  assert.deepEqual(store.list().map(({ s, a, theme }) => [s, a, theme]), [[1, 1, 'paper'], [2, 2, 'dusk']]);
});

test('invalid verse references are rejected and draft count is capped at twenty', () => {
  const storage = memoryStorage();
  const store = createStoryDraftStore(index, { storage, now: clock });
  assert.equal(store.save({ s: 1, a: 8 }), false);
  assert.equal(store.save({ s: 0, a: 1 }), false);
  const capped = createStoryDraftStore(Array.from({ length: 10 }, () => ({ ayat: 3 })), { storage: memoryStorage(), now: clock });
  for (let s = 1; s <= 10; s += 1) for (let a = 1; a <= 3; a += 1) capped.save({ s, a }, { theme: 'invalid', includeLatin: 'yes' });
  assert.equal(capped.list().length, 20);
  assert.ok(capped.list().every(item => item.theme === 'forest' && item.includeLatin === false));
});

test('corrupted storage is ignored and entries can be removed', () => {
  const storage = memoryStorage({ 'quran-oyen.story-drafts.v1': '{not json' });
  const store = createStoryDraftStore(index, { storage, now: clock });
  assert.deepEqual(store.list(), []);
  assert.equal(store.save({ s: 1, a: 2 }, { theme: 'dusk' }), true);
  assert.equal(store.remove({ s: 1, a: 2 }), true);
  assert.equal(store.remove({ s: 1, a: 2 }), false);
  assert.deepEqual(store.list(), []);
});

test('storage failures do not crash draft creation', () => {
  const storage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
  };
  const store = createStoryDraftStore(index, { storage, now: clock });
  assert.equal(store.save({ s: 1, a: 1 }, { theme: 'dusk' }), true);
  assert.equal(store.get({ s: 1, a: 1 }).theme, 'dusk');
  assert.equal(store.persistent(), false);
});
