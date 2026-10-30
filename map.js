// The mind map of a root: the root on the left, its base forms branching from it, each base form branching to every
// surah it appears in, and each surah growing a line to the right with a dot for every ayah that holds the root, in
// the order of the Quran, until its last occurrence. Which ayat hold the root is found by a Handwired program that
// checks all 6,236 ayat at once on the visitor's GPU (quran-gpu.js); the drawing is a canvas that only adds the new
// pieces each frame, so the growth costs a fraction of a 144 Hz frame.
import { engineText } from './dots.js?v=9b5457c';

const COLORS = ['#a64d1d', '#33589e', '#8a6412', '#7a3355', '#2e6a4c'];
const INK_3 = '#72675c';
const RULE = '#dcd2c4';

export function createMindMap({ $, el, num, t, index, roots, loadSurah, lang, reduced, findRoot, links, onOpen }) {
  const sheet = $('map');
  const body = $('map-body');
  const canvas = $('map-canvas');
  const hover = $('map-hover');
  const tip = $('map-tip');
  const nodes = $('map-nodes');
  let words = null; // {root, lemma, ayahStart, surahFirstAyah, lemmas}
  let state = null;
  let frameId = 0;

  async function table() {
    if (words) return words;
    const [bin, meta] = await Promise.all([fetch('data/words.bin').then((r) => r.arrayBuffer()), fetch('data/words.json').then((r) => r.json())]);
    const head = new Uint32Array(bin, 0, 2);
    const count = head[0];
    const ayat = head[1];
    const root = new Uint16Array(bin, 8, count);
    const lemma = new Uint16Array(bin, 8 + count * 2, count);
    const startAt = 8 + count * 4 + ((8 + count * 4) % 4 ? 2 : 0);
    const ayahStart = new Uint32Array(bin, startAt, ayat + 1);
    words = { root, lemma, ayahStart, surahFirstAyah: meta.surahFirstAyah, lemmas: meta.lemmas };
    return words;
  }

  // ---------- building the map ----------

  // The sheet opens at once with the root, while every ayah is checked.
  function loading(rootId) {
    cancelAnimationFrame(frameId);
    state = null;
    tip.hidden = true;
    shown = null;
    pinned = null;
    $('map-root').textContent = Array.from(roots[rootId - 1]?.r ?? '').join(' ');
    $('map-title').textContent = t('mapLooking');
    $('map-gpu').textContent = '';
    nodes.replaceChildren(el('p', { className: 'map-status', textContent: t('mapLooking') }));
    for (const c of [canvas, hover]) c.getContext('2d').clearRect(0, 0, c.width, c.height);
    sheet.hidden = false;
    document.body.classList.add('mapping');
  }
  function fail(text) {
    nodes.replaceChildren(el('p', { className: 'map-status error', textContent: text }));
    $('map-title').textContent = '';
  }

  async function open(rootId, lemmaText = '') {
    const w = await table();
    const lemmaId = lemmaText ? w.lemmas.findIndex((l) => l[0] === lemmaText && l[1] === rootId) + 1 : 0;
    const found = await findRoot(rootId); // {perAyah, perSurah, backend, adapterName, gpuMs, totalMs, reason?}
    const perAyah = found.perAyah;
    // The base forms of this root, most used first; the tapped word's form leads.
    const forms = new Map();
    const rows = [];
    for (let s = 0; s < 114; s++) {
      const first = w.surahFirstAyah[s];
      const last = w.surahFirstAyah[s + 1];
      const dots = [];
      for (let a = first; a < last; a++) {
        if (!perAyah[a]) continue;
        // The base forms in this ayah: read from the word table, only for the ayat the GPU found.
        const here = new Map();
        for (let k = w.ayahStart[a]; k < w.ayahStart[a + 1]; k++) {
          if (w.root[k] !== rootId) continue;
          const l = w.lemma[k];
          here.set(l, (here.get(l) ?? 0) + 1);
          forms.set(l, (forms.get(l) ?? 0) + 1);
        }
        let main = 0;
        let most = -1;
        for (const [l, n] of here) if (n > most) { most = n; main = l; }
        dots.push({ s, a, ayah: a - first, count: perAyah[a], form: main, forms: here });
      }
      if (dots.length) rows.push({ s, ayat: last - first, dots, forms: new Set(dots.flatMap((d) => [...d.forms.keys()])) });
    }
    const formList = [...forms].sort((x, y) => (x[0] === lemmaId ? -1 : y[0] === lemmaId ? 1 : y[1] - x[1])).map(([l, n], i) => ({
      l, n, text: w.lemmas[l - 1]?.[0] ?? '', color: COLORS[i % COLORS.length],
    }));
    const colorOf = new Map(formList.map((f) => [f.l, f.color]));
    for (const row of rows) for (const d of row.dots) d.color = colorOf.get(d.form) ?? COLORS[0];
    const ayatCount = rows.reduce((n, r) => n + r.dots.length, 0);
    if (!ayatCount) throw new Error('no ayah holds this root');
    const wordCount = [...forms.values()].reduce((a, b) => a + b, 0);
    state = { rootId, lemmaId, rows, forms: formList, ayatCount, wordCount, found, born: 0, started: 0, selected: null };
    renderHead();
    sheet.hidden = false;
    document.body.classList.add('mapping');
    requestAnimationFrame(() => { layout(); grow(); });
  }

  function renderHead() {
    const s = state;
    const letters = Array.from(roots[s.rootId - 1]?.r ?? '').join(' ');
    $('map-root').textContent = letters;
    $('map-title').replaceChildren(
      el('b', { textContent: s.forms[0]?.text ?? '', lang: 'ar' }),
      ` · ${num(s.wordCount)} ${t('mapWords')} · ${num(s.ayatCount)} ${t('ayat')} · ${num(s.rows.length)} ${t('mapSurahs')}`);
    $('map-gpu').textContent = engineText(s.found, t);
  }

  // Where everything sits, in CSS px, for the body's size.
  function layout() {
    const s = state;
    const width = body.clientWidth;
    const narrow = width < 600;
    const top = 24;
    const avail = Math.max(240, body.clientHeight - 48);
    const rowH = Math.max(5, Math.min(22, avail / Math.max(1, s.rows.length)));
    const height = Math.max(body.clientHeight, top * 2 + rowH * s.rows.length);
    const rootSize = narrow ? 52 : 68;
    const rootX = 16;
    const formX = rootX + rootSize + (narrow ? 24 : 56);
    const formW = narrow ? 84 : 120;
    const showLabels = rowH >= 12 && !narrow;
    const labelX = formX + formW + (narrow ? 24 : 56);
    const trackX = labelX + (showLabels ? 104 : 0);
    const trackW = Math.max(60, width - trackX - 20);
    const midY = top + (rowH * s.rows.length) / 2;
    const rowY = (i) => top + rowH * (i + 0.5);
    const formGap = 8;
    const formH = narrow ? 28 : 32;
    const formsTop = Math.max(8, midY - (s.forms.length * (formH + formGap)) / 2);
    s.forms.forEach((f, i) => { f.x = formX; f.y = formsTop + i * (formH + formGap) + formH / 2; f.w = formW; f.h = formH; });
    s.rows.forEach((r, i) => {
      r.y = rowY(i);
      for (const d of r.dots) d.x = trackX + ((d.ayah + 0.5) / r.ayat) * trackW;
    });
    Object.assign(s, { width, height, rowH, rootX, rootSize, rootY: midY, trackX, trackW, labelX, showLabels });
    for (const c of [canvas, hover]) {
      const ratio = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(width * ratio);
      c.height = Math.round(height * ratio);
      c.style.width = `${width}px`;
      c.style.height = `${height}px`;
      c.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    placeNodes();
    // Everything is drawn again from the start of the growth, at its current time.
    s.drawnRows = s.rows.map(() => ({ x: s.trackX, dot: 0 }));
    s.drawnEdges = 0;
    s.drawnForms = 0;
    canvas.getContext('2d').clearRect(0, 0, width, height);
  }

  function placeNodes() {
    const s = state;
    const rootNode = el('div', { className: 'map-node root', lang: 'ar', textContent: Array.from(roots[s.rootId - 1]?.r ?? '').join(' ') });
    Object.assign(rootNode.style, { left: `${s.rootX}px`, top: `${s.rootY - s.rootSize / 2}px`, width: `${s.rootSize}px`, height: `${s.rootSize}px` });
    const forms = s.forms.map((f, i) => {
      const n = el('div', { className: `map-node form${i === 0 ? ' lead' : ''}` }, el('span', { className: 'ar', lang: 'ar', textContent: f.text }), el('span', { className: 'n', textContent: num(f.n) }));
      Object.assign(n.style, { left: `${f.x}px`, top: `${f.y - f.h / 2}px`, width: `${f.w}px`, height: `${f.h}px`, '--c': f.color });
      return n;
    });
    const labels = s.showLabels ? s.rows.map((r) => {
      const meta = index[r.s];
      const n = el('div', { className: 'map-label', textContent: `${meta.n} ${meta.latin}` });
      Object.assign(n.style, { left: `${s.labelX}px`, top: `${r.y - 8}px` });
      return n;
    }) : [];
    nodes.replaceChildren(rootNode, ...forms, ...labels);
    nodes.style.height = `${s.height}px`;
  }

  // ---------- growing ----------

  const DURATION = 2200;
  function grow() {
    state.started = performance.now();
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(tick);
  }

  // How far along the growth is for one row: rows start in the order of the Quran and each takes a share of the time.
  const rowSpan = (i, n) => ({ start: 0.25 + 0.55 * (i / Math.max(1, n)), length: 0.3 });

  function tick(now) {
    if (!state || sheet.hidden) return;
    const s = state;
    const p = reduced.matches ? 1 : Math.min(1, (now - s.started) / DURATION);
    const g = canvas.getContext('2d');
    g.lineCap = 'round';
    // The root's branches to its base forms.
    while (s.drawnForms < s.forms.length && p >= 0.04 + 0.1 * (s.drawnForms / s.forms.length)) {
      const f = s.forms[s.drawnForms++];
      curve(g, s.rootX + s.rootSize, s.rootY, f.x, f.y, f.color, 1.6, 0.9);
    }
    // Each base form's branches to the surahs it appears in, in the order of the Quran.
    const edges = edgeList();
    while (s.drawnEdges < edges.length && p >= 0.15 + 0.35 * (s.drawnEdges / edges.length)) {
      const e = edges[s.drawnEdges++];
      curve(g, e.f.x + e.f.w, e.f.y, s.trackX - 2, e.r.y, e.f.color, e.lead ? 1 : 0.7, e.lead ? 0.5 : 0.28);
    }
    // Each surah's line grows to the right, and its dots appear as the line reaches them.
    s.rows.forEach((r, i) => {
      const { start, length } = rowSpan(i, s.rows.length);
      const q = Math.max(0, Math.min(1, (p - start) / length));
      if (q <= 0) return;
      const drawn = s.drawnRows[i];
      const end = r.dots[r.dots.length - 1].x;
      const x = s.trackX + (end - s.trackX) * q;
      if (x > drawn.x) {
        g.strokeStyle = RULE;
        g.globalAlpha = 1;
        g.lineWidth = Math.max(1, s.rowH * 0.08);
        g.beginPath();
        g.moveTo(drawn.x, r.y);
        g.lineTo(x, r.y);
        g.stroke();
        drawn.x = x;
      }
      while (drawn.dot < r.dots.length && r.dots[drawn.dot].x <= x + 0.5) dot(g, r.dots[drawn.dot++], s.rowH);
    });
    if (p < 1) frameId = requestAnimationFrame(tick);
    else { frameId = 0; ends(g); }
  }

  let edgeCache = null;
  function edgeList() {
    if (edgeCache?.state === state) return edgeCache.edges;
    const edges = [];
    state.rows.forEach((r) => state.forms.forEach((f, k) => { if (r.forms.has(f.l)) edges.push({ f, r, lead: k === 0 }); }));
    edgeCache = { state, edges };
    return edges;
  }

  function curve(g, x1, y1, x2, y2, color, width, alpha) {
    const dx = (x2 - x1) / 2;
    g.strokeStyle = color;
    g.globalAlpha = alpha;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(x1, y1);
    g.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
    g.stroke();
    g.globalAlpha = 1;
  }

  function dot(g, d, rowH) {
    const r = Math.max(1.2, Math.min(rowH * 0.42, (1.1 + Math.min(3, d.count) * 0.55) * (rowH / 12)));
    g.fillStyle = d.color;
    g.globalAlpha = 0.92;
    g.beginPath();
    g.arc(d.x, rowY(d), r, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  const rowY = (d) => state.rows.find((r) => r.s === d.s).y;

  // The first and the last place the root appears, marked once the growth is done.
  function ends(g) {
    const s = state;
    const first = s.rows[0].dots[0];
    const lastRow = s.rows[s.rows.length - 1];
    const last = lastRow.dots[lastRow.dots.length - 1];
    for (const d of [first, last]) {
      g.strokeStyle = COLORS[0];
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(d.x, rowY(d), Math.max(4, s.rowH * 0.6), 0, Math.PI * 2);
      g.stroke();
    }
    const tag = (d, text, align) => {
      // A label near an edge hangs to the inside, so a phone shows all of it.
      const side = d.x > body.clientWidth - 150 ? ' to-left' : d.x < 120 ? ' to-right' : '';
      const n = el('div', { className: `map-end ${align}${side}`, textContent: text });
      Object.assign(n.style, { left: `${d.x}px`, top: `${rowY(d)}px` });
      return n;
    };
    nodes.append(
      tag(first, `${t('mapFirst')} ${index[first.s].n}:${first.ayah + 1}`, 'below'),
      tag(last, `${t('mapLast')} ${index[last.s].latin} ${index[last.s].n}:${last.ayah + 1}`, 'above'));
  }

  // ---------- pointing at a dot ----------

  function nearest(x, y) {
    const s = state;
    if (!s) return null;
    let best = null;
    let bestD = Math.max(10, s.rowH);
    for (const r of s.rows) {
      if (Math.abs(r.y - y) > bestD) continue;
      for (const d of r.dots) {
        const dist = Math.hypot(d.x - x, r.y - y);
        if (dist < bestD) { bestD = dist; best = d; }
      }
    }
    return best;
  }

  function point(e) {
    const rect = canvas.getBoundingClientRect();
    return nearest(e.clientX - rect.left, e.clientY - rect.top);
  }

  let shown = null;
  async function show(d) {
    if (shown === d) return;
    shown = d;
    const s = state;
    const g = hover.getContext('2d');
    g.clearRect(0, 0, s.width, s.height);
    if (!d) { tip.hidden = true; return; }
    const row = s.rows.find((r) => r.s === d.s);
    const f = s.forms.find((x) => x.l === d.form) ?? s.forms[0];
    // The path from the root to this ayah, drawn on top of the map.
    curve(g, s.rootX + s.rootSize, s.rootY, f.x, f.y, COLORS[0], 2.4, 1);
    curve(g, f.x + f.w, f.y, s.trackX - 2, row.y, COLORS[0], 2, 1);
    g.strokeStyle = COLORS[0];
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(s.trackX, row.y);
    g.lineTo(d.x, row.y);
    g.stroke();
    g.beginPath();
    g.arc(d.x, row.y, Math.max(5, s.rowH * 0.7), 0, Math.PI * 2);
    g.stroke();
    const meta = index[d.s];
    const ref = `${meta.n}:${d.ayah + 1}`;
    // The button sits in the card's first row and the card hangs from its top, so the words and links that arrive a
    // moment later make the card longer without moving what the pointer is heading for.
    const openBtn = el('button', { type: 'button', className: 'pill solid', textContent: t('mapOpen') });
    openBtn.onclick = () => onOpen(d.s + 1, d.ayah, s.rootId);
    const head = el('div', { className: 'tip-head' }, el('span', { className: 'tip-ref', textContent: `${meta.latin} ${ref}` }), openBtn);
    const words = el('div', { className: 'tip-words', lang: 'ar' });
    const linked = el('div', { className: 'tip-links' });
    tip.replaceChildren(head, words, linked);
    tip.hidden = false;
    const left = Math.min(Math.max(8, d.x - 130), s.width - 268);
    const above = row.y > s.height * 0.6;
    const top = above ? Math.max(8, row.y - 14 - 210) : row.y + 14;
    Object.assign(tip.style, { left: `${left}px`, top: `${top}px`, bottom: '' });
    // The ayah's words of this root, in Arabic, from its surah file.
    const surah = await loadSurah(d.s + 1);
    if (shown !== d) return;
    const ayahWords = surah.ayat[d.ayah].filter((w) => w[1] === s.rootId);
    words.textContent = ayahWords.map((w) => w[0]).join('  ·  ');
    const meaning = ayahWords.map((w) => (lang() === 'en' ? w[5] || w[4] : w[4] || w[5])).filter(Boolean).join(' · ');
    if (meaning) words.after(el('div', { className: 'tip-mean', textContent: meaning }));
    // The ayat it shares the most roots with, from the links the Spark computed.
    const near = await links(d.s + 1, d.ayah);
    if (shown !== d || !near?.length) return;
    // The links reach out across the map as a second layer: indigo branches to the linked ayat the map also holds.
    for (const [ls, la, score] of near) {
      const target = s.rows.find((r) => r.s === ls - 1)?.dots.find((x) => x.ayah === la - 1);
      if (!target) continue;
      const ty = s.rows.find((r) => r.s === target.s).y;
      const lift = Math.max(24, Math.abs(ty - row.y) * 0.35 + 18);
      g.strokeStyle = '#33589e';
      g.globalAlpha = 0.35 + 0.5 * score;
      g.lineWidth = 1 + score * 1.5;
      g.beginPath();
      g.moveTo(d.x, row.y);
      g.bezierCurveTo(d.x, row.y - lift, target.x, ty - lift, target.x, ty);
      g.stroke();
      g.globalAlpha = 1;
      g.beginPath();
      g.arc(target.x, ty, Math.max(3.5, s.rowH * 0.5), 0, Math.PI * 2);
      g.stroke();
    }
    linked.append(el('span', { className: 'label', textContent: t('mapLinked') }), ...near.slice(0, 5).map(([ls, la]) => {
      const b = el('button', { type: 'button', className: 'tip-link', textContent: `${ls}:${la}` });
      b.onclick = () => onOpen(ls, la - 1, s.rootId);
      return b;
    }));
  }

  // Pointing at a dot with a mouse shows its card after a short rest, and the card stays while the mouse travels to
  // it: crossing empty paper or other dots on the way neither hides it nor swaps it. A click pins a card (and is how
  // touch opens one); a click on empty paper, Escape or × lets it go.
  let pinned = null;
  let switchTimer = 0;
  let hideTimer = 0;
  const calm = () => { clearTimeout(switchTimer); clearTimeout(hideTimer); };
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || pinned) return;
    const d = point(e);
    if (d && d === shown) { calm(); return; }
    clearTimeout(switchTimer);
    if (d) switchTimer = setTimeout(() => { clearTimeout(hideTimer); show(d); }, shown ? 320 : 80);
    else if (shown) { clearTimeout(hideTimer); hideTimer = setTimeout(() => { if (!pinned) show(null); }, 900); }
  });
  canvas.addEventListener('pointerleave', () => { clearTimeout(switchTimer); });
  tip.addEventListener('pointerenter', calm);
  tip.addEventListener('pointerleave', (e) => {
    if (pinned || e.pointerType !== 'mouse') return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!pinned) show(null); }, 900);
  });
  canvas.addEventListener('click', (e) => {
    calm();
    const d = point(e);
    pinned = d;
    show(d);
  });
  $('map-close').onclick = close;
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || sheet.hidden) return;
    if (shown) { pinned = null; show(null); } else close();
  });
  addEventListener('resize', () => { if (state && !sheet.hidden) { layout(); grow(); show(null); } });

  function close() {
    cancelAnimationFrame(frameId);
    sheet.hidden = true;
    tip.hidden = true;
    shown = null;
    pinned = null;
    calm();
    document.body.classList.remove('mapping');
  }

  return { open, loading, fail, close };
}
