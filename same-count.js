// Words that occur the same number of times: every base form (lemma) of the Quran with its count, grouped by count,
// so آدَم 25 sits beside عِيسَى 25. The counts are the Quranic Arabic Corpus's own (data/same-count.json, built by
// tools/build_same_count.py): every form of a word counts, and words spelled alike but different (Salih the prophet,
// salih "righteous") keep their own numbers. A word in a surah's card finds its twins here too.
// A picked word lists every place it occurs (data/same-count-places.bin); a jump to one brings up a bar in the reader
// that steps through them all, across surahs, with the word ringed each time.

const S = {
  en: {
    title: 'Words that occur the same number of times', open: 'Same count', names: 'Names', nouns: 'Nouns', verbs: 'Verbs', all: 'All',
    search: 'Find a word: Adam, عيسى…', rule: 'Every form of a word is counted under its base form, as the Quranic Arabic Corpus tags it, so these numbers match corpus.quran.com. Another way of counting (one spelling only, or with “the”) gives other numbers.',
    shared: 'numbers are shared by two or more words', words: 'words', times: '×', none: 'No group matches.',
    more: (n) => `Show all ${n}`, first: 'First at', openFirst: 'Open the first ayah', map: 'Grow the map',
    thisWord: 'This word', inQuran: 'in the Quran, all its forms', twins: 'Same count', alone: 'No other word occurs exactly this often.',
    seeAll: (n) => `+${n} more`, close: 'Close',
    inAyat: (n) => `In ${n} ${n === '1' ? 'ayah' : 'ayat'}`, timesHere: (n) => `${n} times in this ayah`, placesFailed: 'The places could not be loaded.',
    places: 'Places of this word', prev: 'Previous place', next: 'Next place', closePlaces: 'Close the places',
  },
  id: {
    title: 'Kata dengan jumlah yang sama', open: 'Jumlah sama', names: 'Nama', nouns: 'Kata benda', verbs: 'Kata kerja', all: 'Semua',
    search: 'Cari kata: Adam, عيسى…', rule: 'Setiap bentuk kata dihitung di bawah bentuk dasarnya, sesuai tanda Quranic Arabic Corpus, jadi angkanya sama dengan corpus.quran.com. Cara menghitung lain (hanya satu ejaan, atau dengan “al-”) memberi angka lain.',
    shared: 'angka dimiliki dua kata atau lebih', words: 'kata', times: '×', none: 'Tidak ada kelompok yang cocok.',
    more: (n) => `Tampilkan semua ${n}`, first: 'Pertama di', openFirst: 'Buka ayat pertama', map: 'Tumbuhkan peta',
    thisWord: 'Kata ini', inQuran: 'di Al-Qur’an, semua bentuknya', twins: 'Jumlahnya sama', alone: 'Tidak ada kata lain yang muncul tepat sebanyak ini.',
    seeAll: (n) => `+${n} lagi`, close: 'Tutup',
    inAyat: (n) => `Di ${n} ayat`, timesHere: (n) => `${n} kali di ayat ini`, placesFailed: 'Daftar tempatnya belum bisa dimuat.',
    places: 'Tempat kata ini', prev: 'Tempat sebelumnya', next: 'Tempat berikutnya', closePlaces: 'Tutup daftar tempat',
  },
};
const FILTERS = { names: (p) => p === 'PN', nouns: (p) => p === 'N' || p === 'ADJ', verbs: (p) => p === 'V', all: () => true };
const CAP = 40;
// The places a picked word shows at first; "+N more" shows the rest (at most 382: the sheet's biggest count).
const PLACES_CAP = 24;
// Arabic without its marks, for search: آدم and آدَم are the same word to someone typing.
const bare = (s) => s.normalize('NFKD').replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي');

export function createSameCount({ $, el, num, lang, index, reduced, onAyah, onMap, prefetch }) {
  const s = () => S[lang()];
  const sheet = $('same');
  const list = $('same-list');
  let data = null;
  let filter = 'names';
  let query = '';
  let picked = null; // a lemma row
  let openGroups = new Set();
  let placesShown = PLACES_CAP;

  async function load() {
    data ??= fetch('data/same-count.json').then((r) => {
      if (!r.ok) throw new Error(`same-count.json: ${r.status}`);
      return r.json();
    }).then((d) => {
      const byCount = new Map();
      let at = 0;
      for (const row of d.lemmas) {
        row.bare = bare(row[0]);
        row.low = row[4].toLowerCase();
        // Where its places start in same-count-places.bin: after the places of every word before it.
        row.at = at;
        at += row[3];
        if (!byCount.has(row[3])) byCount.set(row[3], []);
        byCount.get(row[3]).push(row);
      }
      return { ...d, byCount };
    }).catch((e) => { data = null; throw e; });
    return data;
  }

  // ---------- every place a word occurs ----------

  // A place's ayah is counted from 1:1 (0) to 114:6 (6235); each surah's first, from the index, turns it back.
  const firstAyah = [];
  for (let k = 0, at = 0; k < index.length; at += index[k].ayat, k++) firstAyah.push(at);
  // Read the first time a word is picked: for each place, its ayah as a step from the place before (low bytes, then
  // high bytes) and its word in that ayah. Its key must be the word list's, or the two come from different builds.
  let placeTable = null;
  function placeFile() {
    placeTable ??= load().then(async (d) => {
      const name = d.places?.file;
      const res = await fetch(`data/${name}`);
      if (!res.ok) throw new Error(`${name}: ${res.status}`);
      const buf = await res.arrayBuffer();
      const [version, rows, total, key] = buf.byteLength >= 16 ? new Uint32Array(buf, 0, 4) : [];
      if (version !== 1 || rows !== d.lemmas.length || total !== d.words || key !== d.places.key || buf.byteLength !== 16 + 3 * total) {
        throw new Error(`${name} does not belong to this same-count.json`);
      }
      return { lo: new Uint8Array(buf, 16, total), hi: new Uint8Array(buf, 16 + total, total), word: new Uint8Array(buf, 16 + 2 * total, total) };
    }).catch((e) => { placeTable = null; throw e; });
    return placeTable;
  }
  // A word's places in Quran order, as many as its count: [surah, ayah, the word's index in that ayah].
  async function placesOf(r) {
    const t = await placeFile();
    if (r.places) return r.places;
    const out = [];
    let g = 0;
    let k = 0;
    for (let j = r.at; j < r.at + r[3]; j++) {
      g += t.lo[j] | (t.hi[j] << 8);
      while (k + 1 < firstAyah.length && firstAyah[k + 1] <= g) k++;
      out.push([k + 1, g - firstAyah[k] + 1, t.word[j]]);
    }
    r.places = out;
    return out;
  }

  // The word in a card: matched by its base form, type and root (the site's files drop QAC's homograph digit).
  async function twinsOf(lemma, pos, rootId) {
    const d = await load();
    const row = d.lemmas.find((r) => r[0] === lemma && r[1] === pos && r[2] === rootId) ?? d.lemmas.find((r) => r[0] === lemma && r[1] === pos);
    if (!row) return null;
    const same = d.byCount.get(row[3]).filter((r) => r !== row);
    // The closest twins first: the same type, then the rest, in the Quran's order.
    same.sort((a, b) => (b[1] === pos) - (a[1] === pos));
    return { row, same };
  }

  // A small row of word chips, for the card.
  function chip(row, onClick, lit = false) {
    const b = el('button', { type: 'button', className: `same-chip${lit ? ' lit' : ''}` },
      el('span', { className: 'ar', lang: 'ar', textContent: row[0] }),
      el('span', { className: 'gl', textContent: row[4] }));
    b.onclick = onClick;
    return b;
  }

  // ---------- the sheet ----------

  function syncHead() {
    $('same-title').textContent = s().title;
    $('same-rule').textContent = s().rule;
    const input = $('same-search');
    input.placeholder = s().search;
    for (const b of $('same-filter').querySelectorAll('button')) {
      b.textContent = s()[b.dataset.f];
      b.setAttribute('aria-pressed', String(!query && b.dataset.f === filter));
    }
    $('same-close').ariaLabel = s().close;
  }

  function render(animate) {
    const d = data && data.then ? null : data;
    if (!d) return;
    syncHead();
    const q = query.trim();
    const qa = bare(q);
    const qLow = q.toLowerCase();
    const isArabic = /[؀-ۿ]/.test(q);
    const match = (r) => (isArabic ? r.bare.includes(qa) : r.low.includes(qLow));
    const keep = q ? () => true : FILTERS[filter];
    const groups = [];
    let shared = 0;
    for (const [n, rows] of d.byCount) {
      const shown = rows.filter((r) => keep(r[1]));
      if (shown.length < 2) continue;
      shared++;
      if (q && !shown.some(match)) continue;
      groups.push([n, shown]);
    }
    groups.sort((a, b) => b[0] - a[0]);
    $('same-stats').textContent = `${num(shared)} ${s().shared}`;
    const nodes = groups.map(([n, all0], gi) => {
      // While searching, the matching words lead their group, so a cut-off never hides them.
      const rows = q ? [...all0.filter(match), ...all0.filter((r) => !match(r))] : all0;
      const all = openGroups.has(n);
      const visible = all ? rows : rows.slice(0, CAP);
      const chips = el('div', { className: 'same-chips' }, ...visible.map((r) => chip(r, () => pick(r), (q && match(r)) || r === picked)));
      if (visible.length < rows.length) {
        const more = el('button', { type: 'button', className: 'pill same-more', textContent: s().more(num(rows.length)) });
        more.onclick = () => { openGroups.add(n); render(false); };
        chips.append(more);
      }
      const group = el('section', { className: 'same-group', style: `--i:${Math.min(gi, 14)}` },
        el('div', { className: 'same-n' }, el('b', {}, num(n), el('i', { textContent: '×' })), el('span', { textContent: `${num(rows.length)} ${s().words}` })),
        chips);
      if (picked && picked[3] === n && rows.includes(picked)) group.append(detail(picked));
      return group;
    });
    if (!nodes.length) nodes.push(el('p', { className: 'same-none', textContent: s().none }));
    list.classList.toggle('in', !!animate && !reduced.matches);
    list.replaceChildren(...nodes);
  }

  function detail(r) {
    const meta = index[r[5] - 1];
    const actions = el('div', { className: 'card-actions' });
    const first = el('button', { type: 'button', className: 'pill solid', textContent: `${s().openFirst} →` });
    first.onclick = () => openPlace(r, 0);
    actions.append(first);
    if (r[2]) {
      const map = el('button', { type: 'button', className: 'pill', textContent: s().map });
      map.onclick = () => { close(); onMap(r[2], r[0]); };
      actions.append(map);
    }
    const places = el('div', { className: 'same-places' });
    fillPlaces(places, r);
    return el('div', { className: 'same-detail' },
      el('div', { className: 'same-detail-head' },
        el('span', { className: 'ar', lang: 'ar', textContent: r[0] }),
        el('span', {}, el('b', { textContent: r[4] }), ` · ${num(r[3])}${s().times} · ${s().first} ${meta?.latin ?? ''} ${r[5]}:${r[6]}`)),
      actions, places);
  }

  // Every place in the strip: a surah's name, then its ayat as small buttons, each a jump with the word ringed. An
  // ayah that has the word more than once says how often, and its button goes to the first of them.
  let reveal = false;
  async function fillPlaces(box, r) {
    box.replaceChildren(el('span', { className: 'label', textContent: '…' }));
    let all;
    try {
      all = await placesOf(r);
    } catch (e) {
      console.error('same count places', e);
      box.replaceChildren(el('span', { className: 'label', textContent: s().placesFailed }));
      return;
    }
    if (!box.isConnected) return;
    const ayat = [];
    all.forEach(([ps, pa], k) => {
      const last = ayat.at(-1);
      if (last?.s === ps && last.a === pa) last.n++;
      else ayat.push({ s: ps, a: pa, k, n: 1 });
    });
    const flow = el('div', { className: 'place-list' });
    const draw = () => {
      const groups = [];
      for (const p of ayat.slice(0, placesShown)) {
        const latin = index[p.s - 1]?.latin ?? '';
        if (groups.at(-1)?.s !== p.s) groups.push({ s: p.s, node: el('span', { className: 'place-group' }, el('span', { className: 'place-s', textContent: latin })) });
        const b = el('button', { type: 'button', className: 'place', textContent: `${p.s}:${p.a}`, ariaLabel: `${latin} ${p.s}:${p.a}${p.n > 1 ? `, ${s().timesHere(num(p.n))}` : ''}` });
        if (p.n > 1) b.append(el('i', { textContent: `×${p.n}` }));
        b.onclick = () => openPlace(r, p.k);
        groups.at(-1).node.append(b);
      }
      flow.replaceChildren(...groups.map((g) => g.node));
      if (ayat.length > placesShown) {
        const more = el('button', { type: 'button', className: 'pill same-more', textContent: s().seeAll(num(ayat.length - placesShown)) });
        more.onclick = () => {
          const from = placesShown;
          placesShown = Infinity;
          draw();
          flow.querySelectorAll('.place')[from]?.focus();
        };
        flow.append(more);
      }
    };
    draw();
    box.replaceChildren(el('span', { className: 'label', textContent: s().inAyat(num(ayat.length)) }), flow);
    // A word just picked: its places came in under it, so the strip scrolls to show them.
    if (reveal) box.closest('.same-detail')?.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
    reveal = false;
  }

  function pick(r) {
    picked = picked === r ? null : r;
    placesShown = PLACES_CAP;
    reveal = !!picked;
    render(false);
    if (picked) list.querySelector('.same-detail')?.scrollIntoView({ block: 'nearest', behavior: reduced.matches ? 'auto' : 'smooth' });
  }

  // ---------- stepping through a word's places, in the reader ----------

  let trail = null; // {r, k}: the word whose places the bar steps through, and the place it is at
  let trailTicket = 0;
  const bar = $('placebar');

  // From the strip: the sheet closes and the reader lands on place k with the word ringed. The first place is in the
  // word list itself, so that jump never waits for the places; the bar comes up when they are in.
  function openPlace(r, k) {
    close();
    if (r.places) {
      trail = { r, k };
      jump();
      return;
    }
    const ticket = ++trailTicket;
    trail = null;
    bar.hidden = true;
    onAyah(r[5], r[6] - 1, { lemma: r[0], pos: r[1] });
    placesOf(r).then(() => {
      if (ticket !== trailTicket) return;
      trail = { r, k: 0 };
      showBar();
    }, (e) => console.error('same count places', e));
  }

  // The page stays as it is until the place's surah is in, so a step never shows the index while a file loads; of
  // quick steps only the last one lands, and a close cancels the step on its way.
  function jump() {
    const { r, k } = trail;
    const [ps, pa, w] = r.places[k];
    const ticket = ++trailTicket;
    showBar();
    bar.ariaBusy = 'true';
    Promise.resolve(prefetch?.(ps)).catch(() => {}).then(() => {
      if (ticket !== trailTicket) return;
      bar.ariaBusy = 'false';
      onAyah(ps, pa - 1, { lemma: r[0], pos: r[1], i: w });
      // The places either side in other surahs: their files load now, so a step there lands at once.
      for (const p of [r.places[k - 1], r.places[k + 1]]) if (p && p[0] !== ps) prefetch?.(p[0])?.catch(() => {});
    });
  }

  function showBar() {
    const { r, k } = trail;
    const [ps, pa] = r.places[k];
    bar.ariaLabel = s().places;
    $('place-word').textContent = r[0];
    $('place-gloss').textContent = r[4];
    $('place-n').textContent = `${num(k + 1)} / ${num(r.places.length)}`;
    $('place-ref').textContent = `${index[ps - 1]?.latin ?? ''} ${ps}:${pa}`;
    $('place-prev').disabled = k === 0;
    $('place-next').disabled = k === r.places.length - 1;
    $('place-prev').ariaLabel = s().prev;
    $('place-next').ariaLabel = s().next;
    $('place-close').ariaLabel = s().closePlaces;
    bar.hidden = false;
  }

  function step(by) {
    if (!trail?.r.places[trail.k + by]) return;
    trail.k += by;
    jump();
  }

  function closeBar() {
    trail = null;
    trailTicket++;
    bar.hidden = true;
    bar.ariaBusy = 'false';
  }
  $('place-prev').onclick = () => step(-1);
  $('place-next').onclick = () => step(1);
  $('place-close').onclick = closeBar;

  async function open({ count, lemma } = {}) {
    sheet.hidden = false;
    document.body.classList.add('mapping');
    syncHead();
    list.replaceChildren(el('p', { className: 'same-none', textContent: '…' }));
    let d;
    try {
      d = await load();
    } catch (e) {
      list.replaceChildren(el('p', { className: 'same-none error', textContent: String(e?.message ?? e) }));
      return;
    }
    data = d;
    picked = null;
    placesShown = PLACES_CAP;
    reveal = false;
    if (count) {
      // Opened from a card: that word's group, whatever its type, with the word picked.
      picked = d.byCount.get(count)?.find((r) => r[0] === lemma) ?? null;
      query = '';
      filter = picked && FILTERS[filter](picked[1]) ? filter : 'all';
      openGroups.add(count);
    }
    render(true);
    if (count) requestAnimationFrame(() => list.querySelector('.same-detail')?.closest('.same-group')?.scrollIntoView({ block: 'center' }));
    else $('same-body').scrollTop = 0;
  }

  function close() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('mapping');
  }

  for (const b of $('same-filter').querySelectorAll('button')) {
    b.onclick = () => { filter = b.dataset.f; query = ''; $('same-search').value = ''; picked = null; render(true); };
  }
  let typing = 0;
  $('same-search').oninput = (e) => {
    clearTimeout(typing);
    typing = setTimeout(() => { query = e.target.value; picked = null; render(false); $('same-body').scrollTop = 0; }, 120);
  };
  $('same-close').onclick = close;
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) close(); });

  return {
    open, close, load, twinsOf, chip, closeBar, strings: s,
    relang: () => { if (!sheet.hidden) render(false); if (trail) showBar(); },
  };
}
