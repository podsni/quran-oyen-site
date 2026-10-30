// Ayah dots: the whole Quran as one small square per ayah, 6,236 of them, in the order of the Quran from the top left,
// row after row, with the surahs in alternating light and darker bands. Picking a root lights the ayat that hold it in
// copper, darker for more words of that root. The count is the Handwired program the mind map uses (quran-gpu.js): it
// checks all 6,236 ayat at once on the visitor's GPU, so stepping through roots repaints the grid within a frame. The
// look follows the dot map of Handwired's own JSON search demo (github.com/chenglou/handwired, src/json-search/
// demo-map.ts): one cell per document, in order, painted again only where it changed.
//
// It lives in the map sheet (index.html #map) behind the Map | Dots switch, which app.js runs.

export const AYAT = 6236;
const SCAN_MS = 600;

// ---------- the grid's arithmetic, without the DOM (test/dots.test.mjs) ----------

// The grid for a box in CSS px: the pitch from one dot to the next, a dot's side, the columns and the rows. Wide boxes
// get larger dots, and a box with room below gets the largest dots with which the whole grid still fits its height, as
// the JSON search demo's map does. Every dot keeps a gap so that neighbors read as separate ayat.
export function dotsLayout(widthCss, maxHeightCss = 0, count = AYAT) {
  const fit = (pitch) => {
    const cols = Math.max(1, Math.floor(widthCss / pitch));
    return { pitch, cols, rows: Math.ceil(count / cols) };
  };
  let g = fit(widthCss >= 700 ? 8 : widthCss >= 460 ? 6 : 5);
  for (let pitch = 12; pitch > g.pitch; pitch--) {
    const larger = fit(pitch);
    if (larger.rows * pitch <= maxHeightCss) { g = larger; break; }
  }
  const cell = g.pitch >= 6 ? g.pitch - 2 : g.pitch - 1;
  return { ...g, cell, count, width: g.cols * g.pitch, height: g.rows * g.pitch };
}

// The dot under a point (CSS px from the grid's top left), or -1 off the grid. A dot answers for its gap too.
export function dotAt(layout, x, y) {
  if (x < 0 || y < 0) return -1;
  const col = Math.floor(x / layout.pitch);
  const row = Math.floor(y / layout.pitch);
  if (col >= layout.cols || row >= layout.rows) return -1;
  const a = row * layout.cols + col;
  return a < layout.count ? a : -1;
}

// The dot a point picks: the one under it when it is lit, else the nearest lit dot within `reach` dots, else the one
// under it. A rare root lights a few dots of 4–6 px among thousands, so a finger needn't land exactly on one.
export function pickDot(layout, levels, x, y, reach = 3) {
  const under = dotAt(layout, x, y);
  if (under >= 0 && levels[under] > 0) return under;
  const col = x / layout.pitch - 0.5;
  const row = y / layout.pitch - 0.5;
  let best = -1;
  let bestD = reach * reach;
  const c0 = Math.max(0, Math.floor(col) - reach);
  const c1 = Math.min(layout.cols - 1, Math.ceil(col) + reach);
  const r0 = Math.max(0, Math.floor(row) - reach);
  const r1 = Math.min(layout.rows - 1, Math.ceil(row) + reach);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const a = r * layout.cols + c;
      if (a >= layout.count || !levels[a]) continue;
      const d = (c - col) ** 2 + (r - row) ** 2;
      if (d <= bestD) { bestD = d; best = a; }
    }
  }
  return best >= 0 ? best : under;
}

// A dot's level from its ayah's count: 0 for none, 1, 2, and 3 for three or more words of the root.
export function levelsOf(perAyah, out = new Uint8Array(perAyah.length)) {
  for (let a = 0; a < perAyah.length; a++) out[a] = perAyah[a] > 3 ? 3 : perAyah[a];
  return out;
}

// The numbers in the header: words of the root, ayat that hold it, surahs that hold it.
export function totalsOf(perAyah, perSurah) {
  let words = 0;
  let ayat = 0;
  for (let a = 0; a < perAyah.length; a++) { words += perAyah[a]; if (perAyah[a]) ayat++; }
  let surahs = 0;
  for (let s = 0; s < perSurah.length; s++) if (perSurah[s]) surahs++;
  return { words, ayat, surahs };
}

// The order the scrubber steps through: every root that has words in the site's files, most used first.
export function rootOrder(roots) {
  const used = (id) => roots[id - 1].w ?? roots[id - 1].n;
  const ids = [];
  roots.forEach((_, i) => { if (used(i + 1) > 0) ids.push(i + 1); });
  return ids.sort((x, y) => used(y) - used(x) || x - y);
}

// Root letters as typed: without vowel marks, tatweel or spaces, every form of alif and hamza as أ (the corpus writes
// a hamza root's hamza that way, e.g. أله), and final ى and ة as ي and ه.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ\s]/g;
export const normalizeRoot = (text) => text.replace(MARKS, '').replace(/[اأإآءؤئٱ]/g, 'أ').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

// The roots a query finds: those that start with its letters first, then those that hold them, in scrubber order.
export function searchRoots(query, roots, order, limit = 12) {
  const q = normalizeRoot(query);
  if (!q) return [];
  const starts = [];
  const holds = [];
  for (const id of order) {
    const r = normalizeRoot(roots[id - 1].r);
    if (r.startsWith(q)) starts.push(id);
    else if (holds.length < limit && r.includes(q)) holds.push(id);
    if (starts.length >= limit) break;
  }
  return [...starts, ...holds].slice(0, limit);
}

// The line under the title: where the count ran and how long it took. The mind map writes the same line.
export function engineText(f, t) {
  const ms = (v) => (v < 10 ? v.toFixed(2) : v.toFixed(0));
  if (f.backend === 'spark') return `${t('mapSpark')} (${f.adapterName}, DGX Spark): ${ms(f.gpuMs)} ms ${t('mapOnGpu')}, ${ms(f.totalMs)} ms ${t('mapRoundTrip')}`;
  // Plain words for visitors: where it was computed and how long it took. Why a GPU was not used goes to the console.
  if (f.sparkReason || f.reason) console.info('map engine', f.sparkReason || f.reason);
  if (f.sparkReason) return `${t('mapSparkDown')} · ${f.totalMs.toFixed(1)} ms`;
  return f.backend === 'webgpu'
    ? `${t('mapGpu')}${f.adapterName ? ` (${f.adapterName})` : ''}: ${t('mapChecked')} ${f.gpuMs.toFixed(2)} ms`
    : `${t('mapCpuPlain')} · ${f.totalMs.toFixed(1)} ms`;
}
// The count's own time: on a GPU (the visitor's or ours) the GPU's time, on the CPU the whole count.
const countMs = (f) => (f.backend === 'cpu' ? f.totalMs : f.gpuMs);

// ---------- words ----------

const TEXT = {
  en: {
    modeMap: 'Map', modeDots: 'Dots', indexButton: 'Every ayah as a dot →', cardButton: 'Ayah dots',
    search: 'Find a root by its letters, e.g. رحم', searchLabel: 'Find a root', prev: 'Previous root', next: 'Next root',
    scrub: 'Step through the roots', rank: (i, n) => `Root ${i} of ${n}, most used first`, scan: 'Play the scan · slowed down',
    hint: 'Point at a dot to see its ayah. Tap one to pick it.', none: 'no word of', one: '1 word of', many: (n) => `${n} words of`,
    open: 'Open this ayah', noMatch: 'No root has those letters.', looking: 'Counting…',
    legend: 'One dot is one ayah, in the order of the Quran from the top left. Copper dots hold this root:', l1: '1 word',
    l2: '2', l3: '3 or more', bands: 'Surahs alternate between light and darker bands.',
    scanNote: (ms) => `Slowed down to show the order. The real count took ${ms} ms.`, failed: 'This root could not be counted',
  },
  id: {
    modeMap: 'Peta', modeDots: 'Titik', indexButton: 'Setiap ayat sebagai titik →', cardButton: 'Titik ayat',
    search: 'Cari akar lewat hurufnya, mis. رحم', searchLabel: 'Cari akar', prev: 'Akar sebelumnya', next: 'Akar berikutnya',
    scrub: 'Telusuri akar satu per satu', rank: (i, n) => `Akar ke-${i} dari ${n}, urut dari yang paling sering`, scan: 'Putar pemindaian · diperlambat',
    hint: 'Arahkan ke sebuah titik untuk melihat ayatnya. Ketuk untuk memilihnya.', none: 'tidak ada kata dari', one: '1 kata dari', many: (n) => `${n} kata dari`,
    open: 'Buka ayat ini', noMatch: 'Tidak ada akar dengan huruf itu.', looking: 'Menghitung…',
    legend: 'Satu titik = satu ayat, urut mushaf dari kiri atas. Titik tembaga memuat akar ini:', l1: '1 kata',
    l2: '2', l3: '3 atau lebih', bands: 'Surah berselang-seling antara pita terang dan pita lebih gelap.',
    scanNote: (ms) => `Diperlambat agar urutannya terlihat. Hitungan aslinya selesai dalam ${ms} ms.`, failed: 'Akar ini belum bisa dihitung',
  },
};
export const dotsText = (lang) => TEXT[lang === 'en' ? 'en' : 'id'];

// ---------- colors ----------

const hex = (value) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const mix = (base, ink, amount) => `rgb(${base.map((v, k) => Math.round(v + (ink[k] - v) * amount)).join(' ')})`;

// ---------- the view ----------

export function createDots({ $, el, num, t, index, roots, reduced, findRoot, loadSurah, lang, onOpen }) {
  const sheet = $('map');
  const body = $('dots-body');
  const grid = $('dots-grid');
  const canvas = $('dots-canvas');
  const ring = $('dots-ring');
  const search = $('dots-search');
  const found = $('dots-found');
  const scrub = $('dots-scrub');
  const rank = $('dots-rank');
  const pick = $('dots-pick');
  const scanButton = $('dots-scan');
  const note = $('dots-note');
  const title = $('map-title');
  const words = () => dotsText(lang());
  const lettersOf = (id) => Array.from(roots[id - 1]?.r ?? '').join(' ');

  // Every ayah's surah and number, and the scrubber's order.
  const surahOf = new Uint8Array(AYAT);
  const ayahOf = new Uint16Array(AYAT);
  {
    let a = 0;
    for (const s of index) for (let n = 1; n <= s.ayat; n++) { surahOf[a] = s.n; ayahOf[a] = n; a++; }
  }
  const order = rootOrder(roots);
  const rankOf = new Map(order.map((id, i) => [id, i]));
  scrub.min = '0';
  scrub.max = String(order.length - 1);

  // The page's own paper and copper, mixed into solid colors so that a dot paints with one fill.
  const css = getComputedStyle(document.documentElement);
  const paper = hex(css.getPropertyValue('--sheet') || '#fffdf8');
  const copper = hex(css.getPropertyValue('--copper') || '#a64d1d');
  const ink = [52, 38, 24];
  // A dot's looks, each in the light band and the darker band: 0 no word of the root, 1 to 3 its levels, 4 not yet
  // reached by the scan.
  const LOOK = [
    [mix(paper, ink, 0.1), mix(paper, ink, 0.17)],
    [mix(paper, copper, 0.5), mix(paper, copper, 0.5)],
    [mix(paper, copper, 0.76), mix(paper, copper, 0.76)],
    [mix(paper, copper, 1), mix(paper, copper, 1)],
    [mix(paper, ink, 0.035), mix(paper, ink, 0.065)],
  ];
  const COPPER = LOOK[3][0];

  let layout = null;
  const levels = new Uint8Array(AYAT);
  const shown = new Uint8Array(AYAT).fill(255); // what each dot shows now; 255 = not painted yet
  let front = AYAT; // the scan: dots from here on show "not reached"
  let want = 0; // the root asked for
  let counted = null; // the root on the grid: {rootId, totals, found}
  let busy = false;
  let paintFrame = 0;
  let scanFrame = 0;
  let selected = -1;
  let hovered = -1;
  let ticket = 0;

  // ---------- counting ----------

  function setRoot(rootId) {
    if (!rootId) return;
    want = rootId;
    const r = rankOf.get(rootId);
    if (r !== undefined) { scrub.value = String(r); rank.textContent = words().rank(num(r + 1), num(order.length)); }
    if (!counted) {
      $('map-root').textContent = lettersOf(rootId);
      title.textContent = words().looking;
      $('map-gpu').textContent = '';
    }
    title.classList.toggle('pending', !!counted && counted.rootId !== want);
    pump();
  }

  // One count at a time, always of the newest root asked for. Every count that finishes is painted, so dragging the
  // scrubber shows each root it passes, as fast as the counts come back.
  async function pump() {
    if (busy) return;
    busy = true;
    try {
      while (want && want !== counted?.rootId && !body.hidden) {
        const r = want;
        let result;
        try {
          result = await findRoot(r);
        } catch (e) {
          console.error('ayah dots', e);
          $('map-gpu').textContent = `${words().failed} (${e?.message ?? e})`;
          break;
        }
        if (body.hidden) break;
        apply(r, result);
      }
    } finally {
      busy = false;
    }
  }

  function apply(rootId, result) {
    const changed = counted?.rootId !== rootId;
    levelsOf(result.perAyah, levels);
    counted = { rootId, totals: totalsOf(result.perAyah, result.perSurah), found: result };
    head();
    if (changed) note.textContent = '';
    Object.assign(canvas.dataset, {
      root: rootId, words: counted.totals.words, ayat: counted.totals.ayat, surahs: counted.totals.surahs,
      backend: result.backend, countMs: countMs(result).toFixed(3),
    });
    queuePaint();
    if (selected >= 0) describe(selected, true);
    else if (hovered >= 0) describe(hovered, false);
  }

  // The header always describes the grid as painted; it dims while a newer root is being counted.
  function head() {
    if (!counted) return;
    const { words: w, ayat, surahs } = counted.totals;
    $('map-root').textContent = lettersOf(counted.rootId);
    title.textContent = `${num(w)} ${t('mapWords')} · ${num(ayat)} ${t('ayat')} · ${num(surahs)} ${t('mapSurahs')}`;
    title.classList.toggle('pending', counted.rootId !== want);
    $('map-gpu').textContent = engineText(counted.found, t);
  }

  // ---------- painting ----------

  // The grid takes the sheet's width, and the height left under the controls with room for the note and the legend.
  function measure() {
    const width = Math.floor(grid.clientWidth);
    if (!width) return false;
    const top = grid.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    layout = dotsLayout(width, body.clientHeight - top - 64);
    const scale = Math.min(3, Math.max(1, Math.round(devicePixelRatio || 1)));
    for (const c of [canvas, ring]) {
      c.width = layout.width * scale;
      c.height = layout.height * scale;
      c.style.width = `${layout.width}px`;
      c.style.height = `${layout.height}px`;
      c.getContext('2d').setTransform(scale, 0, 0, scale, 0, 0);
    }
    shown.fill(255);
    return true;
  }

  const queuePaint = () => { paintFrame ||= requestAnimationFrame(() => { paintFrame = 0; paint(); }); };

  // Only the dots whose look changed are painted again, e.g. about 2,200 when أله gives way to رحم.
  function paint() {
    if (!layout || body.hidden) return;
    const started = performance.now();
    const g = canvas.getContext('2d');
    const { pitch, cell, cols } = layout;
    let changed = 0;
    for (let a = 0; a < AYAT; a++) {
      const look = a >= front ? 4 : counted ? levels[a] : 0;
      if (shown[a] === look) continue;
      shown[a] = look;
      g.fillStyle = LOOK[look][surahOf[a] % 2];
      g.fillRect((a % cols) * pitch, ((a / cols) | 0) * pitch, cell, cell);
      changed++;
    }
    canvas.dataset.paintMs = (performance.now() - started).toFixed(3);
    canvas.dataset.painted = changed;
    drawRing();
  }

  function drawRing() {
    if (!layout) return;
    const g = ring.getContext('2d');
    g.clearRect(0, 0, layout.width, layout.height);
    const { pitch, cell, cols } = layout;
    g.strokeStyle = COPPER;
    for (const [a, strong] of [[hovered, false], [selected, true]]) {
      if (a < 0) continue;
      g.globalAlpha = strong ? 1 : 0.6;
      g.lineWidth = strong ? 2 : 1.5;
      g.strokeRect((a % cols) * pitch - 1.5, ((a / cols) | 0) * pitch - 1.5, cell + 3, cell + 3);
    }
    g.globalAlpha = 1;
  }

  // The scan replays a count in the order of the Quran, slowed down so the eye can follow it, and says so.
  function scan() {
    if (!counted) return;
    cancelAnimationFrame(scanFrame);
    note.textContent = words().scanNote(countMs(counted.found).toFixed(2));
    if (reduced.matches) { front = AYAT; queuePaint(); return; }
    const begin = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - begin) / SCAN_MS);
      front = Math.round(p * AYAT);
      paint();
      scanFrame = p < 1 && !body.hidden ? requestAnimationFrame(tick) : 0;
      if (!scanFrame) front = AYAT;
    };
    front = 0;
    scanFrame = requestAnimationFrame(tick);
  }

  // ---------- pointing ----------

  function pointAt(e) {
    if (!layout) return -1;
    const rect = canvas.getBoundingClientRect();
    return pickDot(layout, levels, e.clientX - rect.left, e.clientY - rect.top);
  }

  // The line above the grid: the ayah a dot stands for, how many words of the root it holds, and those words.
  async function describe(a, pinned) {
    const my = ++ticket;
    const w = words();
    if (a < 0 || !counted) { pick.replaceChildren(el('span', { className: 'hint', textContent: w.hint })); return; }
    const s = surahOf[a];
    const n = ayahOf[a];
    const rootId = counted.rootId;
    const count = counted.found.perAyah[a];
    const how = count === 0 ? w.none : count === 1 ? w.one : w.many(num(count));
    const ayahWords = el('span', { className: 'words', lang: 'ar' });
    const parts = [
      el('span', { className: 'ref', textContent: `${index[s - 1].latin} ${s}:${n}` }),
      el('span', { className: 'how' }, `${how} `, el('bdi', { className: 'ar', lang: 'ar', textContent: roots[rootId - 1]?.r ?? '' })),
      ayahWords,
    ];
    if (pinned || count) {
      const open = el('button', { type: 'button', className: 'pill solid', textContent: `${w.open} →` });
      open.onclick = () => onOpen(s, n - 1, rootId);
      parts.push(open);
    }
    pick.replaceChildren(...parts);
    if (!count) return;
    // The ayah's words of this root, from its surah file.
    try {
      const surah = await loadSurah(s);
      if (my === ticket) ayahWords.textContent = surah.ayat[n - 1].filter((x) => x[1] === rootId).map((x) => x[0]).join('  ·  ');
    } catch {}
  }

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const a = pointAt(e);
    if (a === hovered) return;
    hovered = a;
    drawRing();
    if (selected < 0) describe(a, false);
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = -1;
    drawRing();
    if (selected < 0) describe(-1, false);
  });
  canvas.addEventListener('click', (e) => {
    const a = pointAt(e);
    selected = a === selected ? -1 : a;
    drawRing();
    describe(selected, selected >= 0);
  });

  // ---------- the controls ----------

  const step = (by) => {
    const at = rankOf.get(want) ?? 0;
    setRoot(order[Math.min(order.length - 1, Math.max(0, at + by))]);
  };
  scrub.addEventListener('input', () => setRoot(order[Number(scrub.value)]));
  $('dots-prev').onclick = () => step(-1);
  $('dots-next').onclick = () => step(1);
  scanButton.onclick = scan;

  function suggest() {
    const ids = searchRoots(search.value, roots, order);
    found.hidden = !search.value.trim();
    if (found.hidden) found.replaceChildren();
    else if (!ids.length) found.replaceChildren(el('span', { className: 'hint', textContent: words().noMatch }));
    else {
      found.replaceChildren(...ids.map((id) => {
        const b = el('button', { type: 'button' },
          el('span', { className: 'ar', lang: 'ar', textContent: roots[id - 1].r }),
          el('span', { className: 'n', textContent: num(roots[id - 1].w ?? roots[id - 1].n) }));
        b.onclick = () => choose(id);
        return b;
      }));
    }
    return ids;
  }
  const choose = (id) => { setRoot(id); search.value = ''; suggest(); };
  search.addEventListener('input', suggest);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const ids = suggest();
    if (ids.length) choose(ids[0]);
  });

  // ← and → step through the roots anywhere in the sheet but the search box and the scrubber, which keep their keys.
  addEventListener('keydown', (e) => {
    if (body.hidden || sheet.hidden || e.target === search || e.target === scrub || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  const resized = new ResizeObserver(() => { if (!body.hidden && measure()) paint(); });
  resized.observe(grid);
  resized.observe(body);

  function relang() {
    const w = words();
    search.placeholder = w.search;
    search.setAttribute('aria-label', w.searchLabel);
    scrub.setAttribute('aria-label', w.scrub);
    $('dots-prev').setAttribute('aria-label', w.prev);
    $('dots-next').setAttribute('aria-label', w.next);
    scanButton.textContent = w.scan;
    const r = rankOf.get(want);
    if (r !== undefined) rank.textContent = w.rank(num(r + 1), num(order.length));
    $('dots-legend').replaceChildren(
      el('span', { textContent: w.legend }),
      ...[[1, w.l1], [2, w.l2], [3, w.l3]].map(([k, label]) => el('span', { className: 'key' }, el('i', { style: `background:${LOOK[k][0]}` }), label)),
      el('span', { textContent: w.bands }));
    note.textContent = '';
    if (!body.hidden) {
      head();
      describe(selected, selected >= 0);
    }
  }

  // ---------- the view in the sheet ----------

  function show(rootId) {
    body.hidden = false;
    if (rootId && rootId !== counted?.rootId) { selected = -1; hovered = -1; }
    relang();
    describe(selected, selected >= 0);
    requestAnimationFrame(() => { if (measure()) paint(); });
    setRoot(rootId || want || order[0]);
  }

  function hide() {
    body.hidden = true;
    cancelAnimationFrame(scanFrame);
    cancelAnimationFrame(paintFrame);
    scanFrame = 0;
    paintFrame = 0;
    front = AYAT;
    note.textContent = '';
    title.classList.remove('pending');
  }

  // The same root counted again, e.g. after the "where the search runs" switch.
  function recount() {
    counted = null;
    setRoot(want);
  }

  return { show, hide, relang, recount, root: () => want };
}
