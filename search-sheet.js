// The search sheet: a query's ayat, read as text. Exact matches (search.js, in the browser) mark the Arabic words, the
// English word meanings and the Indonesian phrases that matched; ayat related by meaning come from the Spark's GPU
// (api/spark/meaning) and are labelled as such. Everything shown is the sourced text; nothing is written by a model.

const S = {
  en: {
    search: 'Search', placeholder: 'patience, riba, صبر…', close: 'Close', button: 'Search the Quran',
    about: 'Search Arabic words (صبر, الصلاة), Indonesian words of the Kemenag translation (sabar, riba) or English word meanings (patience). Matching runs locally in your browser; semantic ranking is not connected in this standalone copy.',
    exact: 'Exact', meaning: 'By meaning', open: 'Open', more: 'Show more', all: 'all',
    summary: (q, a, m) => `“${q}”: ${a} ayat with the words${m ? ` · ${m} more by meaning` : ''}`,
    partialSummary: (q, a, have, of, m) => `No ayah has every word of “${q}”: ${a} ayat have ${have} of the ${of}${m ? ` · ${m} more by meaning` : ''}`,
    familySummary: (r, n, a) => `Every word of the root ${r}: ${n} words in ${a} ayat`,
    formSummary: (w, n, a) => `Every ${w}: ${n} words in ${a} ayat`,
    ruleExact: 'Marked: what matched in the Arabic, the word meanings (Quranic Arabic Corpus) and the Kemenag translation.',
    ruleRoot: (q, r, c, n, x) => `The Arabic for “${q}” is marked by its root, ${r}: in ${c} of these ${n} ayat, ${x}× as often as in the whole Quran.`,
    ruleLemma: (q, w, c, n, x) => `The Arabic for “${q}” is marked: ${w}, in ${c} of these ${n} ayat, ${x}× as often as in the whole Quran.`,
    ruleFamily: (r) => `Every word with the root ${r}, in the order of the Quran.`,
    ruleForm: (w) => `Every word with the base form ${w}, in the order of the Quran.`,
    ruleMeaning: (gpu, ms, model) => `Ayat without the words, ranked by how close their meaning is to the search, on our GPU (${gpu}, ${ms} ms, ${model}). The model only orders the ayat; the text is the sourced text, and nothing in it is marked.`,
    ruleNearest: 'No ayah is close in meaning to this search; these are the nearest.',
    meaningOff: 'Search by meaning is not connected in this standalone copy. The exact matches are complete.',
    none: 'No ayah has these words. Try another spelling.',
    how: { ar: 'Arabic', en: 'word meaning', id: 'translation', root: 'root', lemma: 'base form' },
    tryThese: 'Try',
  },
  id: {
    search: 'Cari', placeholder: 'sabar, riba, صبر…', close: 'Tutup', button: 'Cari di Al-Qur’an',
    about: 'Cari kata Arab (صبر, الصلاة), kata Indonesia dari terjemahan Kemenag (sabar, riba) atau kata Inggris dari makna per kata (patience). Pencocokan berjalan lokal di browser; pencarian terkait makna belum terhubung di salinan ini.',
    exact: 'Persis', meaning: 'Terkait makna', open: 'Buka', more: 'Tampilkan lagi', all: 'semua',
    summary: (q, a, m) => `“${q}”: ${a} ayat dengan kata ini${m ? ` · ${m} lagi terkait makna` : ''}`,
    partialSummary: (q, a, have, of, m) => `Tidak ada ayat yang memuat semua kata “${q}”: ${a} ayat memuat ${have} dari ${of} kata${m ? ` · ${m} lagi terkait makna` : ''}`,
    familySummary: (r, n, a) => `Semua kata dari akar ${r}: ${n} kata di ${a} ayat`,
    formSummary: (w, n, a) => `Semua ${w}: ${n} kata di ${a} ayat`,
    ruleExact: 'Ditandai: yang cocok di teks Arab, makna kata (Quranic Arabic Corpus) dan terjemahan Kemenag.',
    ruleRoot: (q, r, c, n, x) => `Kata Arab untuk “${q}” ditandai lewat akarnya, ${r}: ada di ${c} dari ${n} ayat ini, ${x}× lebih sering daripada di seluruh Al-Qur’an.`,
    ruleLemma: (q, w, c, n, x) => `Kata Arab untuk “${q}” yang ditandai: ${w}, ada di ${c} dari ${n} ayat ini, ${x}× lebih sering daripada di seluruh Al-Qur’an.`,
    ruleFamily: (r) => `Semua kata dengan akar ${r}, menurut urutan Al-Qur’an.`,
    ruleForm: (w) => `Semua kata dengan bentuk dasar ${w}, menurut urutan Al-Qur’an.`,
    ruleMeaning: (gpu, ms, model) => `Ayat tanpa kata itu, diurutkan menurut kedekatan maknanya dengan pencarian, di GPU kami (${gpu}, ${ms} ms, ${model}). Model hanya mengurutkan ayat; teksnya tetap teks bersumber, dan tidak ada yang ditandai.`,
    ruleNearest: 'Tidak ada ayat yang dekat maknanya dengan pencarian ini; ini yang paling dekat.',
    meaningOff: 'Pencarian makna belum terhubung di salinan ini. Hasil yang persis tetap lengkap.',
    none: 'Tidak ada ayat dengan kata ini. Coba ejaan lain.',
    how: { ar: 'Arab', en: 'makna kata', id: 'terjemahan', root: 'akar', lemma: 'bentuk dasar' },
    tryThese: 'Coba',
  },
};
export const searchStrings = (lang) => S[lang];
export const TRY = ['sabar', 'riba', 'musibah', 'kekayaan', 'zakat', 'rezeki', 'anak yatim', 'صبر'];
const PAGE = 25;
export const queryOf = (hash) => {
  const m = /^#cari\/(.*)$/.exec(hash);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
};

export function createSearchSheet({ $, el, num, index, roots, lang, loadSurah, wordText, engine, meaning, loadIndonesian, onAyah, currentSurah, homeHash }) {
  const s = () => S[lang()];
  const sheet = $('search');
  const list = $('search-list');
  const more = $('search-more');
  let current = null; // {query, exact, meaning, byMeaning, tab, family, items, shown}
  let ticket = 0;
  // A root's letters (or a base form), kept on one line and isolated, so a number after them stays where it is written.
  const isolate = (text) => `\u2068${text}\u2069`;
  const letters = (root) => isolate(Array.from(roots[root - 1]?.r ?? '').join('\u00a0'));
  const familyName = (f) => (f.kind === 'lemma' ? isolate(f.label) : letters(f.id));

  // Surah n's first ayah, as an index into the 6,236 ayat in order.
  const firstAyah = [0];
  index.forEach((surah) => firstAyah.push(firstAyah[firstAyah.length - 1] + surah.ayat));
  const placeOf = (a) => {
    let n = 0;
    while (n < 113 && firstAyah[n + 1] <= a) n++;
    return { s: n + 1, ayah: a - firstAyah[n] };
  };

  function labels() {
    $('sheet-go').textContent = s().search;
    $('sheet-q').placeholder = s().placeholder;
    $('sheet-q').ariaLabel = s().button;
    $('search-close').ariaLabel = s().close;
    more.textContent = s().more;
  }

  function showEmpty() {
    current = null;
    $('search-title').textContent = s().button;
    $('search-tabs').hidden = true;
    $('search-families').replaceChildren();
    $('search-rule').textContent = s().about;
    list.replaceChildren(el('div', { className: 'search-try start' }, el('span', { className: 'label', textContent: s().tryThese }),
      ...TRY.map((q) => { const b = el('button', { type: 'button', textContent: q, lang: /[؀-ۿ]/.test(q) ? 'ar' : '' }); b.onclick = () => go(q); return b; })));
    more.hidden = true;
  }

  // Shows the sheet with a query's results; the address is the caller's (go() and the hash both come here).
  async function open(query) {
    labels();
    sheet.hidden = false;
    document.body.classList.add('mapping');
    if ($('sheet-q').value !== query) $('sheet-q').value = query;
    const mine = ++ticket;
    if (!query.trim()) {
      showEmpty();
      if (matchMedia('(hover: hover)').matches) $('sheet-q').focus();
      return;
    }
    $('search-title').textContent = '…';
    $('search-tabs').hidden = false;
    list.replaceChildren();
    more.hidden = true;
    // The exact matches come first; the GPU's ranking joins them when it answers.
    const exact = await engine.find(query).catch((e) => { console.error('search', e); return { matches: [], families: [], byRoot: [] }; });
    if (mine !== ticket) return;
    current = { query, exact, meaning: undefined, byMeaning: [], tab: 'exact', family: null };
    render();
    const related = await meaning(query).catch(() => null);
    if (mine !== ticket) return;
    const seen = new Set(exact.matches.map((m) => m.a));
    current.meaning = related;
    // Ayat already found exactly are not listed again by meaning.
    // The GPU's ranking, cut where it stops being about the search. The service cuts it when its answer says
    // `nearest` (true when no ayah is really close; spark/meaning/serve.py). Without that, the page keeps the first 12
    // within 0.2 of the best, never under 0.35, and calls a best under 0.45 only the nearest.
    const ranked = related?.results ?? [];
    const top = ranked[0]?.score ?? 0;
    const cutByService = related != null && 'nearest' in related;
    current.nearest = cutByService ? !!related.nearest : top < 0.45;
    const kept = cutByService ? ranked : ranked.slice(0, 12).filter((r) => r.score >= Math.max(0.35, top - 0.2));
    current.byMeaning = kept.map((r) => ({ a: firstAyah[r.s - 1] + r.a - 1, score: r.score })).filter((r) => !seen.has(r.a));
    if (!exact.matches.length && current.byMeaning.length) current.tab = 'meaning';
    if (current.tab === 'meaning') render(); else counts();
  }

  async function showFamily(f) {
    const mine = ++ticket;
    const items = await engine.family(f.kind, f.id);
    if (mine !== ticket || !current) return;
    current.family = current.family?.f === f ? null : { f, items };
    current.tab = 'exact';
    render();
  }

  function counts() {
    const c = current;
    const exactItems = c.family ? c.family.items : c.exact.matches;
    const waiting = c.meaning === undefined;
    const f = c.family?.f;
    const familyWords = () => num(c.family.items.reduce((n, m) => n + m.words.size, 0));
    $('search-title').textContent = f
      ? s()[f.kind === 'lemma' ? 'formSummary' : 'familySummary'](familyName(f), familyWords(), num(c.family.items.length))
      : c.exact.partial
        ? s().partialSummary(c.query, num(c.exact.matches.length), num(c.exact.partial.have), num(c.exact.partial.of), c.byMeaning.length && !c.nearest ? num(c.byMeaning.length) : null)
        : s().summary(c.query, num(c.exact.matches.length), c.byMeaning.length && !c.nearest ? num(c.byMeaning.length) : null);
    // Without an answer from our GPU, or when every ayah it ranks near already has the words, there is one kind of
    // result, and no tabs.
    $('search-tabs').hidden = c.meaning === null || (c.meaning !== undefined && !c.byMeaning.length);
    for (const b of $('search-tabs').querySelectorAll('button')) {
      const n = b.dataset.tab === 'exact' ? num(exactItems.length) : waiting ? '…' : num(c.byMeaning.length);
      b.setAttribute('aria-pressed', String(b.dataset.tab === c.tab));
      b.replaceChildren(s()[b.dataset.tab], el('span', { className: 'n', textContent: n }));
    }
  }

  function render() {
    const c = current;
    counts();
    // The families of the matched words: one tap shows a family whole, a second tap goes back.
    $('search-families').replaceChildren(...(c.exact.families ?? []).map((f) => {
      const b = el('button', { type: 'button' }, el('span', { className: 'ar', lang: 'ar', textContent: familyName(f) }), `${s().all} ${num(f.total)}`);
      b.setAttribute('aria-pressed', String(c.family?.f === f));
      b.onclick = () => showFamily(f);
      return b;
    }));
    const meaningTab = c.tab === 'meaning';
    const rule = [];
    if (meaningTab) {
      // Before our GPU answers there is nothing to say yet.
      if (c.meaning && c.nearest) rule.push(s().ruleNearest);
      if (c.meaning) rule.push(s().ruleMeaning(c.meaning.gpu ?? 'DGX Spark', Math.round(c.meaning.gpuMs ?? 0), (c.meaning.model ?? '').split('/').pop()));
      else if (c.meaning === null) rule.push(s().meaningOff);
    } else if (c.family) rule.push(c.family.f.kind === 'lemma' ? s().ruleForm(familyName(c.family.f)) : s().ruleFamily(familyName(c.family.f)));
    else {
      rule.push(s().ruleExact);
      for (const b of c.exact.byRoot ?? []) {
        const [c1, n1, x1] = [num(b.c), num(b.n), num(Math.round(b.lift))];
        rule.push(b.kind === 'lemma' ? s().ruleLemma(b.token, `\u2068${b.lemma}\u2069`, c1, n1, x1) : s().ruleRoot(b.token, letters(b.root), c1, n1, x1));
      }
    }
    $('search-rule').textContent = rule.join(' ');
    c.items = meaningTab ? c.byMeaning : c.family ? c.family.items : c.exact.matches;
    c.shown = 0;
    list.replaceChildren();
    if (!c.items.length && !(meaningTab && c.meaning === undefined)) {
      list.append(el('p', { className: 'search-empty', textContent: meaningTab && !c.meaning ? s().meaningOff : s().none }));
    }
    page();
    $('search-body').scrollTop = 0;
  }

  function page() {
    const c = current;
    const next = c.items.slice(c.shown, c.shown + PAGE);
    c.shown += next.length;
    const ayahStart = c.exact.ayahStart;
    list.append(...next.map((item) => card(item, c.tab === 'meaning', ayahStart)));
    more.hidden = c.shown >= c.items.length;
  }
  more.onclick = page;

  // One ayah: its reference and an Open button at once, then its text with what matched marked: the Arabic, and
  // under it the Indonesian translation (ID view, or whenever it matched) or the word meanings (EN view).
  function card(item, byMeaning, ayahStart) {
    const { s: n, ayah } = placeOf(item.a);
    const meta = index[n - 1];
    const how = byMeaning ? [] : [...(item.how ?? [])];
    const openBtn = el('button', { type: 'button', className: 'pill', textContent: s().open });
    const top = el('div', { className: 'hit-top' },
      el('span', { className: 'hit-ref', textContent: `${meta.latin} ${n}:${ayah + 1}` }),
      how.length ? el('span', { className: 'hit-how', textContent: how.map((h) => s().how[h] ?? h).join(' · ') }) : '',
      openBtn);
    const ar = el('p', { className: 'hit-ar', lang: 'ar', dir: 'rtl' });
    const en = el('p', { className: 'hit-en', hidden: true });
    const idLine = el('p', { className: 'hit-id', hidden: true, lang: 'id' });
    const node = el('article', { className: 'hit' }, top, ar, ...(lang() === 'en' ? [en, idLine] : [idLine, en]));
    let firstWord = null;
    openBtn.onclick = () => {
      // The same surah: the sheet closes back to it. Another: the reader opens it, and Back returns to these results.
      if (currentSurah() === n) close(); else hide();
      onAyah(n, ayah, firstWord);
    };
    (async () => {
      const surah = await loadSurah(n);
      const words = surah.ayat[ayah];
      const start = ayahStart[item.a];
      const hit = new Set([...(item.words ?? [])].map((k) => k - start));
      const first = words.findIndex((_, i) => hit.has(i));
      if (first >= 0) firstWord = { lemma: words[first][2], pos: words[first][3], i: first };
      words.forEach((w, i) => {
        if (i) ar.append(' ');
        const [before, word, after] = wordText(w);
        ar.append(before, hit.has(i) ? el('mark', { textContent: word }) : word, after);
      });
      const spans = [...(item.spans ?? [])].sort((x, y) => x[0] - y[0]);
      const showEn = lang() === 'en' || how.includes('en');
      if (showEn) {
        en.hidden = false;
        words.forEach((w, i) => {
          if (i) en.append(' · ');
          en.append(hit.has(i) ? el('mark', { textContent: w[5] || '–' }) : w[5] || '–');
        });
      }
      if (lang() === 'id' || spans.length) {
        const text = (await loadIndonesian())?.[item.a];
        if (!text) return;
        let at = 0;
        for (const [from, to] of spans) {
          if (from < at) continue;
          idLine.append(text.slice(at, from), el('mark', { textContent: text.slice(from, to) }));
          at = to;
        }
        idLine.append(text.slice(at));
        idLine.hidden = false;
      }
    })().catch((e) => console.error('search card', e));
    return node;
  }

  for (const b of $('search-tabs').querySelectorAll('button')) {
    b.onclick = () => {
      if (!current || current.tab === b.dataset.tab) return;
      current.tab = b.dataset.tab;
      current.family = null;
      render();
    };
  }
  $('sheet-search').onsubmit = (e) => {
    e.preventDefault();
    $('sheet-q').blur();
    go($('sheet-q').value);
  };
  $('search-close').onclick = () => close();
  // Before the other sheets' Escape (this one sits on top of them).
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || sheet.hidden) return;
    e.stopPropagation();
    close();
  }, true);

  // A search has an address (#cari/<query>): a link opens it, and Back closes it. Searching again from the sheet
  // replaces the address, so one Back always leaves the search.
  function go(query) {
    const target = `#cari/${encodeURIComponent(query.trim())}`;
    if (queryOf(location.hash) !== null) history.replaceState(history.state, '', target);
    else history.pushState({ search: 1, under: homeHash() }, '', target);
    open(query);
  }
  // Hides the sheet and leaves the address as it is.
  function hide() {
    ticket++;
    sheet.hidden = true;
    if (['map', 'same'].every((id) => !$(id) || $(id).hidden)) document.body.classList.remove('mapping');
  }
  // Closes the search: Back to the page it was opened from when that page is what lies under the sheet; otherwise (a
  // surah opened from the results, or a link to the search) the address becomes what is under it.
  function close() {
    hide();
    if (queryOf(location.hash) === null) return;
    if (history.state?.search && history.state.under === homeHash()) history.back();
    else history.replaceState(null, '', homeHash());
  }

  return { open, go, hide, close, relabel: () => { if (!sheet.hidden) { labels(); if (current) render(); else showEmpty(); } }, isOpen: () => !sheet.hidden };
}
