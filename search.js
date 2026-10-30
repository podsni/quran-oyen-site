// Exact search over every word of the Quran, in the visitor's browser: Arabic (by spelling, and by skeleton so modern
// spellings find the Uthmani ones), English (the Quranic Arabic Corpus's word meanings) and Indonesian (the ayah
// translation, when the site has it). It returns ayat with the exact words, or translation phrases, that matched;
// the page shows the original text and only marks what matched. Search by meaning is the Spark's (api/spark/meaning).

const STOP = new Set(('the of and to in a an is are was were be by for with on at as or that this it its from his her their ' +
  'he she they we you i who which what not no dan yang di ke dari pada untuk dengan itu ini atau juga akan bagi ' +
  'oleh adalah dalam kepada maka telah tidak ada').split(' '));
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const ALEF = { 'ٱ': 'ا', 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا', 'ى': 'ي', 'ۦ': '', 'ۥ': '' };
const ARABIC = /[؀-ۿ]/;

// The same normalization the index was built with (tools/build_search_index.py).
export const searchable = (t) => t.normalize('NFC').replace(MARKS, '').replace(/[ٱأإآٲٳىۦۥ]/g, (c) => ALEF[c]);
// A word's skeleton: its letters without the long vowels and hamza seats that Uthmani and modern spelling write
// differently (الصلوة / الصلاة, الربوا / الربا, الصبرين / الصابرين).
const skeleton = (t) => t.replace(/[اويءئؤ]/g, '').replace(/ة/g, 'ه');

// A word with what may stand before it (و ف ب ك ل س and the article) and after it (a pronoun) taken off, in each
// combination, so واصبر, بالصبر and صبرهم all show the core they share.
const PRE = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'س'];
const POST = ['هما', 'كما', 'هم', 'هن', 'كم', 'كن', 'نا', 'ها', 'ني', 'ه', 'ك', 'ي'];
function cores(w) {
  const out = new Set([w]);
  for (const p of PRE) if (w.startsWith(p) && w.length - p.length >= 2) out.add(w.slice(p.length));
  for (const c of [...out]) for (const q of POST) if (c.endsWith(q) && c.length - q.length >= 2) out.add(c.slice(0, -q.length).replace(/ت$/, 'ة'));
  return [...out];
}

// English: a light stem of a whole word, so patience, patients and patiently meet, and bee does not meet been.
function stemEn(t) {
  let s = t;
  if (/(ss|x|z|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (/ies$/.test(s) && s.length > 4) s = `${s.slice(0, -3)}y`;
  else if (/[^sui]s$/.test(s) && s.length > 3) s = s.slice(0, -1);
  for (const [end, put] of [['iently', 'ien'], ['ience', 'ien'], ['ient', 'ien'], ['ness', ''], ['ing', ''], ['edly', ''], ['ied', 'y'], ['ed', ''], ['ly', '']]) {
    if (s.endsWith(end) && s.length - end.length + put.length >= 3) { s = s.slice(0, -end.length) + put; break; }
  }
  return s.length > 3 && s.endsWith('e') ? s.slice(0, -1) : s;
}
// Indonesian spellings of one word: the Kemenag text writes the first (shalat, syaitan); a reader may type another.
const SPELLINGS = [['shalat', 'salat', 'sholat', 'solat'], ['syaitan', 'setan', 'syetan', 'syaithan'], ['taubat', 'tobat'],
  ['saleh', 'shaleh', 'sholeh', 'soleh'], ['ibadat', 'ibadah'], ['hutang', 'utang'], ['rezeki', 'rizki', 'rejeki', 'rizqi'],
  ['akhirat', 'akherat'], ['surga', 'syurga', 'sorga'], ['sedekah', 'sadaqah', 'shadaqah', 'sodaqoh', 'sedekah'], ['quran', 'alquran']];
const spellings = (token) => SPELLINGS.find((group) => group.includes(token)) ?? [token];
// Indonesian: the root word under the common affixes, so kekayaan meets kaya and kesabaran meets sabar.
function stemId(t) {
  let s = t.replace(/(nya|lah|kah|pun)$/, '');
  const fixes = [[/^(ke|pe|per|pen|pem|peng)(.{3,})an$/, 2], [/^(ber|ter|me|mem|men|meng|meny|di)(.{3,})(kan|i)?$/, 2], [/^(.{4,})(an|kan|i)$/, 1]];
  for (const [re, part] of fixes) {
    const m = re.exec(s);
    if (m) { s = m[part]; break; }
  }
  return s.length >= 3 ? s : t;
}

export function createSearch({ loadJson, wordTable, hasIndonesian, loadIndonesian, roots }) {
  let index = null;
  const stems = new Map();

  async function ready() {
    if (index) return index;
    index = (async () => {
      const [data, table, words] = await Promise.all([loadJson('data/search.json'), wordTable(), loadJson('data/words.json')]);
      const ar = data.ar.split('|');
      const en = data.en.split('|').map((m) => m.toLowerCase());
      return { ...data, ar, en, roots, table, lemmas: words.lemmas };
    })();
    return index;
  }

  // The ayah of a word, by its place in reading order.
  function ayahOfWord(ayahStart, k) {
    let lo = 0;
    let hi = ayahStart.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ayahStart[mid] <= k) lo = mid; else hi = mid - 1;
    }
    return lo;
  }

  // Every word that a token matches, as word offsets in reading order: the same word under its clitics (و, ف, ب, ل,
  // ال … before it; a pronoun after it), by spelling or by skeleton; failing that, every word of the root the token
  // spells, with a weak last letter read either way (ربا -> ربو).
  function arabicHits(ix, token) {
    const qs = cores(searchable(token));
    // A skeleton of two letters says too little (ربا and رب, "Lord", share one), so it needs three.
    const qSk = new Set(qs.map(skeleton).filter((x) => x.length >= 3));
    const words = new Set();
    ix.cores ??= ix.ar.map((w) => cores(w));
    ix.cores.forEach((cs, k) => {
      if (cs.some((c) => qs.includes(c) || qSk.has(skeleton(c)))) words.add(k);
    });
    if (words.size) return words;
    const root = rootFor(ix, qs);
    if (root) ix.table.root.forEach((r, k) => { if (r === root) words.add(k); });
    return words;
  }
  function rootFor(ix, qs) {
    ix.rootIds ??= new Map(ix.roots.map((r, i) => [searchable(r.r), i + 1]));
    for (const q of qs) {
      if (q.length !== 3) continue;
      for (const v of [q, q.replace(/ا$/, 'و'), q.replace(/ا$/, 'ي'), q.replace(/ي$/, 'و')]) if (ix.rootIds.has(v)) return ix.rootIds.get(v);
    }
    return 0;
  }
  // Every word of every word meaning by its stem, built once: stem -> word offsets.
  function englishIndex(ix) {
    if (ix.enIndex) return ix.enIndex;
    const byStem = new Map();
    ix.en.forEach((m, k) => {
      for (const w of m.split(/[^\p{L}]+/u)) {
        if (w.length < 2) continue;
        const stem = stemEn(w);
        const list = byStem.get(stem) ?? [];
        if (list[list.length - 1] !== k) list.push(k);
        byStem.set(stem, list);
      }
    });
    return (ix.enIndex = byStem);
  }
  // The words whose meaning has the token's stem as a whole word; a stem of five letters or more also finds its
  // longer forms (wealth: wealthy).
  function englishHits(ix, token) {
    const byStem = englishIndex(ix);
    const stem = stemEn(token);
    const words = new Set(byStem.get(stem) ?? []);
    if (stem.length >= 5) for (const [other, list] of byStem) if (other !== stem && other.startsWith(stem)) list.forEach((k) => words.add(k));
    return words;
  }

  // Ayat whose Indonesian translation holds the token (or its root word), with the spans that matched.
  async function indonesianHits(token) {
    if (!(await hasIndonesian())) return new Map();
    const texts = await loadIndonesian(); // [6236 strings, in order]
    const forms = [...new Set(spellings(token).flatMap((t) => [t, stemId(t)]))].filter((f) => f.length >= 3);
    const out = new Map();
    const word = /\p{L}+/gu;
    texts.forEach((text, a) => {
      const spans = [];
      const lower = text.toLowerCase();
      if (!forms.some((f) => lower.includes(f))) return;
      word.lastIndex = 0;
      let m;
      while ((m = word.exec(lower))) {
        const w = m[0];
        let stem = stems.get(w);
        if (stem === undefined) stems.set(w, (stem = stemId(w)));
        // From the start of the word, or of its root word: riba finds riba, not be-riba-dah.
        if (forms.some((f) => w.startsWith(f) || stem.startsWith(f))) spans.push([m.index, m.index + w.length]);
      }
      if (spans.length) out.set(a, spans);
    });
    return out;
  }

  // How many ayat hold each root, and each base form, at least once.
  function ayatWith(ix, kind) {
    ix.ayatWith ??= {};
    if (ix.ayatWith[kind]) return ix.ayatWith[kind];
    const ids = ix.table[kind];
    let top = 0;
    for (let k = 0; k < ids.length; k++) if (ids[k] > top) top = ids[k];
    const counts = new Uint16Array(top + 1);
    const last = new Int32Array(top + 1).fill(-1);
    for (let a = 0; a < ix.ayahStart.length - 1; a++) {
      for (let k = ix.ayahStart[a]; k < ix.ayahStart[a + 1]; k++) {
        const id = ids[k];
        if (id && last[id] !== a) { last[id] = a; counts[id]++; }
      }
    }
    return (ix.ayatWith[kind] = counts);
  }
  // A translation phrase has no Arabic word of its own in the data. The Arabic it renders is found by what the
  // matched ayat share: the root, or the base form, that they hold far more often than the Quran does (ten times or
  // more: sabar -> the root ص ب ر, kiamat -> ٱلْقِيَٰمَة), in at least 40% of them, near the phrase's place in the
  // ayah. Only the strongest, counting nearness too: a word said beside the phrase (zakat beside salat) is not the
  // phrase. Its words in those ayat are marked, and the page says which it was and in how many ayat.
  function sharedWord(ix, hits, texts) {
    const total = ix.ayahStart.length - 1;
    const n = hits.length;
    let best = null;
    for (const kind of ['root', 'lemma']) {
      const ids = ix.table[kind];
      const counts = ayatWith(ix, kind);
      const inSet = new Map();
      for (const { a } of hits) {
        const here = new Set();
        for (let k = ix.ayahStart[a]; k < ix.ayahStart[a + 1]; k++) if (ids[k]) here.add(ids[k]);
        for (const id of here) inSet.set(id, (inSet.get(id) ?? 0) + 1);
      }
      for (const [id, c] of inSet) {
        const lift = c / n / (counts[id] / total);
        if (c < Math.max(4, 0.4 * n) || lift < 10) continue;
        const away = offset(ix, hits, texts, ids, id);
        if (away > 0.2) continue;
        const score = c * Math.log(lift) * (1 - away / 0.25);
        if (!best || score > best.score) best = { kind, id, c, n, lift, score };
      }
    }
    return best;
  }
  // How far the word stands from the phrase, on average: the phrase's place in the translation against the word's
  // place in the Arabic, each from 0 (the ayah's start) to 1 (its end). A translation keeps the ayah's order closely
  // enough that the word it renders is near (sabar: 0.05); a word said elsewhere is not (عَلِيم, which closes ayat
  // about debts, for hutang: 0.5).
  function offset(ix, hits, texts, ids, id) {
    let sum = 0;
    let count = 0;
    for (const { a, spans } of hits) {
      const start = ix.ayahStart[a];
      const len = ix.ayahStart[a + 1] - start;
      const at = [];
      for (let k = start; k < start + len; k++) if (ids[k] === id) at.push((k - start + 0.5) / len);
      if (!at.length || !texts[a]) continue;
      for (const [from, to] of spans) {
        const p = (from + to) / 2 / texts[a].length;
        sum += Math.min(...at.map((x) => Math.abs(x - p)));
        count++;
      }
    }
    return count ? sum / count : 1;
  }

  // The search: every token must match the same ayah (in any of the three ways). With no such ayah, the ayat that
  // match the most of them, and the result says how many of how many (`partial`). Results are in the order of the
  // Quran.
  async function find(query) {
    const ix = await ready();
    const text = query.trim();
    const arabic = ARABIC.test(text);
    const tokens = (arabic ? text.split(/\s+/) : text.toLowerCase().replace(/['’`]/g, '').split(/[^\p{L}\p{N}]+/u)).filter((t) => t && (arabic || (t.length >= 2 && !STOP.has(t))));
    const perToken = [];
    for (const token of tokens) {
      const ayat = new Map(); // ayah index -> {words: Set of word offsets, spans: [[from, to]], how: Set}
      const add = (a, how) => {
        if (!ayat.has(a)) ayat.set(a, { words: new Set(), spans: [], how: new Set() });
        const hit = ayat.get(a);
        hit.how.add(how);
        return hit;
      };
      const words = arabic ? arabicHits(ix, token) : englishHits(ix, token);
      for (const k of words) add(ayahOfWord(ix.ayahStart, k), arabic ? 'ar' : 'en').words.add(k);
      if (!arabic) for (const [a, spans] of await indonesianHits(token)) add(a, 'id').spans.push(...spans);
      perToken.push(ayat);
    }
    let matches = [];
    let partial = null;
    if (perToken.length) {
      const all = [...perToken[0].keys()].filter((a) => perToken.every((m) => m.has(a)));
      const chosen = all.length || perToken.length === 1 ? all : [...new Set(perToken.flatMap((m) => [...m.keys()]))];
      for (const a of chosen) {
        const words = new Set();
        const spans = [];
        const how = new Set();
        let tokensHit = 0;
        for (const m of perToken) {
          const hit = m.get(a);
          if (!hit) continue;
          tokensHit++;
          hit.words.forEach((k) => words.add(k));
          spans.push(...hit.spans);
          hit.how.forEach((h) => how.add(h));
        }
        matches.push({ a, words, spans, how, tokensHit });
      }
      matches.sort((x, y) => y.tokensHit - x.tokensHit || x.a - y.a);
      if (!all.length && perToken.length > 1 && matches.length) {
        const most = matches[0].tokensHit;
        matches = matches.filter((m) => m.tokensHit === most);
        partial = { have: most, of: perToken.length };
      }
    }
    // The Arabic of each word that matched in the translation, from what its ayat among the results share: langit
    // dan bumi marks ٱلسَّمَٰوَٰت and ٱلْأَرْض; ibu bapak, both in the same ayat, marks ٱلْوَٰلِدَيْن once.
    // The strongest pair goes first, and a word goes to one token: in hari kiamat, ٱلْقِيَٰمَة is kiamat's; in ibu
    // bapak, one phrase, both tokens find ٱلْوَٰلِدَيْن and the second adds nothing.
    const byRoot = [];
    const texts = !arabic && (await hasIndonesian()) ? await loadIndonesian() : null;
    const found = !texts ? [] : perToken.map((m, t) => {
      const ayat = matches.filter((x) => m.get(x.a)?.how.has('id'));
      const shared = ayat.length ? sharedWord(ix, ayat.map((x) => ({ a: x.a, spans: m.get(x.a).spans })), texts) : null;
      if (!shared) return null;
      const root = shared.kind === 'root' ? shared.id : ix.lemmas[shared.id - 1]?.[1] ?? 0;
      return { token: tokens[t], ayat, ...shared, root, lemma: shared.kind === 'lemma' ? ix.lemmas[shared.id - 1]?.[0] : null };
    }).filter(Boolean).sort((x, y) => y.score - x.score);
    // Tokens of one phrase that find the same word share it (anak yatim -> ٱلْيَتَٰمَىٰ is anak yatim's, not anak's).
    for (const f of found) {
      const same = found.filter((g) => g.kind === f.kind && g.id === f.id).map((g) => g.token);
      f.token = tokens.filter((t) => same.includes(t)).join(' ');
    }
    for (const f of found) {
      if (byRoot.some((b) => (b.kind === f.kind && b.id === f.id) || (b.root && b.root === f.root))) continue;
      byRoot.push(f);
      const ids = ix.table[f.kind];
      for (const x of f.ayat) for (let k = ix.ayahStart[x.a]; k < ix.ayahStart[x.a + 1]; k++) if (ids[k] === f.id) x.words.add(k);
    }
    // The families a visitor may want in full: the roots of the matched words, most frequent first, and a base form
    // marked for a translation word on its own (ٱلْقِيَٰمَة, not all of ق و م).
    const forms = new Set(byRoot.filter((b) => b.kind === 'lemma').map((b) => b.id));
    const count = new Map();
    for (const m of matches) for (const k of m.words) {
      const key = forms.has(ix.table.lemma[k]) ? `lemma:${ix.table.lemma[k]}` : ix.table.root[k] ? `root:${ix.table.root[k]}` : '';
      if (key) count.set(key, (count.get(key) ?? 0) + 1);
    }
    const total = [...count.values()].reduce((x, y) => x + y, 0);
    const families = [...count].sort((x, y) => y[1] - x[1]).filter(([, n]) => n / total >= 0.08).slice(0, 4).map(([key, n]) => {
      const [kind, id] = [key.split(':')[0], Number(key.split(':')[1])];
      return kind === 'lemma'
        ? { kind, id, n, label: ix.lemmas[id - 1][0], total: ix.lemmas[id - 1][2] }
        : { kind, id, n, label: ix.roots[id - 1]?.r ?? '', total: ix.roots[id - 1]?.w ?? ix.roots[id - 1]?.n ?? n };
    });
    return { query: text, arabic, tokens, matches, partial, families, byRoot, ayahStart: ix.ayahStart, surahFirstAyah: ix.surahFirstAyah };
  }

  // All ayat with a root or a base form (kind 'root' or 'lemma'), for "the whole family": word offsets per ayah.
  async function family(kind, id) {
    const ix = await ready();
    const out = new Map();
    const ids = ix.table[kind];
    for (let k = 0; k < ids.length; k++) {
      if (ids[k] !== id) continue;
      const a = ayahOfWord(ix.ayahStart, k);
      if (!out.has(a)) out.set(a, { a, words: new Set(), spans: [], how: new Set([kind]), tokensHit: 1 });
      out.get(a).words.add(k);
    }
    return [...out.values()];
  }

  return { ready, find, family, ayahOfWord };
}
