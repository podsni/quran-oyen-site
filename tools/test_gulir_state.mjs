import assert from 'node:assert/strict';
import { createGulirStore, dailyRef, dayNumber, localDay, refKey } from '../gulir-state.js';

const index = [{ ayat: 2 }, { ayat: 3 }];
const fullIndex = [{ ayat: 6235 }, { ayat: 1 }];
function clock(iso) { let value = new Date(iso); return () => new Date(value); }
function mutableClock(iso) { let value = new Date(iso); return { now: () => new Date(value), set(next) { value = new Date(next); } }; }
function mem(initial = null) { let value = initial; return { getItem() { return value; }, setItem(_, v) { value = v; }, removeItem() { value = null; }, value() { return value; } }; }

assert.equal(localDay(new Date(2024, 1, 29, 23, 59)), '2024-02-29');
assert.equal(dayNumber('2024-02-29') - dayNumber('2024-02-28'), 1);
assert.ok(Number.isNaN(dayNumber('2023-02-29')));
assert.equal(localDay(new Date('not a date')), null);
assert.equal(refKey({ s: 2, a: 3 }), '2:3');
for (const d of ['2024-02-29', '2024-03-01', '2025-01-01']) { const r = dailyRef(index, new Date(`${d}T12:00:00Z`)); assert.ok(r && r.s >= 1 && r.s <= 2 && r.a >= 1 && r.a <= index[r.s - 1].ayat); }
assert.deepEqual(dailyRef(fullIndex, new Date('1970-01-01T12:00:00Z')), { s: 1, a: 1 });
assert.deepEqual(dailyRef(fullIndex, new Date('1970-01-01T12:00:00Z')), dailyRef(fullIndex, new Date('1970-01-01T12:00:00Z')));

const storage = mem('{bad json');
const timeline = mutableClock('2024-01-01T23:59:00');
let store = createGulirStore(index, { storage, now: timeline.now });
assert.equal(store.summary().persistent, false);
assert.equal(store.markRead({ s: 1, a: 1 }), true);
assert.equal(store.markRead({ s: 1, a: 1 }), false);
assert.equal(store.summary().totalRead, 1);
assert.equal(store.summary().todayRead, 1);
assert.equal(store.summary().currentStreak, 1);
assert.equal(store.toggleSaved({ s: 1, a: 1 }), true);
assert.equal(store.toggleSaved({ s: 1, a: 1 }), false);
assert.equal(store.saved().length, 0);
assert.equal(store.toggleSaved({ s: 2, a: 3 }), true);
assert.equal(store.isSaved({ s: 2, a: 3 }), true);
assert.equal(store.setGoal(100), true);
assert.equal(store.setGoal(0), false);
assert.equal(store.setGoal(101), false);
assert.equal(store.setPreference('theme', 'dark'), true);
assert.equal(store.setPreference('size', 'large'), true);
assert.equal(store.setPreference('size', 'giant'), false);
const snap = store.snapshot(); snap.preferences.theme = 'light'; assert.equal(store.preference('theme'), 'dark');

// same day does not increase streak; yesterday joins the run; a gap resets current streak.
timeline.set('2024-01-02T01:00:00');
store.markRead({ s: 1, a: 2 });
assert.equal(store.summary().currentStreak, 2);
timeline.set('2024-01-04T01:00:00');
store.markRead({ s: 2, a: 1 });
assert.equal(store.summary().currentStreak, 1);
timeline.set('2024-01-06T01:00:00');
assert.equal(store.summary().currentStreak, 0);
store.resetProgress();
assert.equal(store.summary().totalRead, 0);
assert.equal(store.isSaved({ s: 2, a: 3 }), true);
assert.equal(store.preference('theme'), 'dark');

// reload and cap saved items, invalid refs never enter state.
const cap = mem(); const capStore = createGulirStore(index, { storage: cap, now: clock('2024-01-01T00:00:00') });
for (let i = 0; i < 510; i++) capStore.toggleSaved({ s: i % 2 + 1, a: i % 2 + 1 });
assert.ok(capStore.saved().length <= 500);
assert.equal(capStore.markRead({ s: 99, a: 1 }), false);
const reload = createGulirStore(index, { storage: cap, now: clock('2024-01-01T00:00:00') });
assert.equal(reload.summary().persistent, true);
assert.ok(reload.saved().length <= 500);

const quota = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
const fallback = createGulirStore(index, { storage: quota, now: clock('2024-01-01') });
assert.equal(fallback.summary().persistent, false);
assert.equal(fallback.markRead({ s: 1, a: 1 }), true);
assert.equal(fallback.summary().totalRead, 1);

console.log('gulir-state tests: ok');
