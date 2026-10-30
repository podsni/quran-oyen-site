// The network panel: the Handwired network that lays out the tapped word's ayah (layout.js buildAyah), live, the way
// HandwiredOS's Monitor window lists its own program (github.com/chenglou/handwired, src/handwiredos/value-list.ts
// and monitor-footer.ts). A word card's "Lihat jaringannya" opens it: a sheet at the bottom on a phone, a panel at
// the side on a wide screen, with the page still in use beside or above it. Three lists:
//   Input       what the network reads: each word's width, the line's width, the tapped word, and its springs' state
//   Operations  every operation of the compiled program, layer by layer: a weighted sum (affine) or a ReGLU, a sum
//               times the ReLU of another sum, its gate. A ReGLU whose ReLU passes a value on (its gate above 0) has
//               a copper dot; one whose ReLU outputs 0 a grey one
//   Output      what the page draws from: each tile's x, y, glow and lift, and the card's place
// The numbers are the page's own. While the panel is open the ayah's machine copies every value of each evaluation
// right after it (layout.js, machine.watch), before another ayah of the same size evaluates over them, so the rows
// tick while its springs move. While it is closed nothing is copied. Only the rows on screen have nodes: 64 of them,
// row r in node r % 64, as in HandwiredOS.
import { programOf, quarter } from './layout.js?v=9b5457c';

const ROW = 24; // px, as in HandwiredOS's Monitor
const SLOTS = 64;
// The footer's chart: one point per frame in which the network ran, each the average of the 10 frames up to it,
// since a browser's clock counts in steps of 0.1 ms or more and one run takes about 0.03 ms (monitor-footer.ts).
export const POINTS = 60;
export const AVERAGED = 10;

// ---------- the network's rows, without the DOM (test/network.test.mjs) ----------

// The kinds of operation a compiled program has, as HandwiredOS's Monitor names them.
export const KINDS = ['affine', 'ReGLU', 'boolean', 'index read'];
export const INPUT = 0;
export const OPERATIONS = 1;
export const OUTPUT = 2;

// What a compiled ayah network holds, row by row, made once per program and shared by every ayah of that size:
// - each operation's wire, kind, layer (from 1) and stored weights, in the program's packed order, layer by layer;
// - each ReGLU's gate, the sum its ReLU takes, as weights over the packed values, so a row can say whether its ReLU
//   passes a value on (the runtime keeps only the product);
// - the names of the source cells ('words.3.width', 'tiles.3.x.velocity') and of the outputs ('tiles.3.x'), the
//   packed place of each output, and the word slot a row belongs to (3 for both), or -1.
const described = new WeakMap();
export function describeNetwork(built) {
  let net = described.get(built);
  if (net) return net;
  const program = programOf(built);
  const { sourceSize, valueCount } = program;
  const count = valueCount - sourceSize;
  const kind = new Uint8Array(count);
  const layer = new Uint16Array(count);
  const weights = new Uint32Array(count);
  const gateOf = new Int32Array(count).fill(-1);
  let gates = 0;
  let terms = 0;
  for (const l of program.layers) {
    gates += l.gateRows.length;
    terms += l.rowOffsets[l.outputSize + l.gateRows.length] - l.rowOffsets[l.outputSize];
  }
  const gateBias = new Float32Array(gates);
  const gateStart = new Uint32Array(gates + 1);
  const gateAt = new Uint32Array(terms);
  const gateWeight = new Float32Array(terms);
  let first = 0;
  let g = 0;
  let t = 0;
  let weightCount = 0;
  program.layers.forEach((l, index) => {
    const stored = (row) => l.rowOffsets[row + 1] - l.rowOffsets[row];
    weightCount += l.weights.length;
    for (let o = 0; o < l.outputSize; o++) { layer[first + o] = index + 1; weights[first + o] = stored(o); }
    // A ReGLU's gate is a projection row after the layer's outputs, in the order of gateRows.
    for (let k = 0; k < l.gateRows.length; k++) {
      const row = first + l.gateRows[k];
      const p = l.outputSize + k;
      kind[row] = 1;
      weights[row] += stored(p);
      gateOf[row] = g;
      gateBias[g] = l.bias[p];
      for (let j = l.rowOffsets[p]; j < l.rowOffsets[p + 1]; j++) { gateAt[t] = l.inputIndices[l.columns[j]]; gateWeight[t] = l.weights[j]; t++; }
      gateStart[++g] = t;
    }
    for (const row of l.booleanRows) kind[first + row] = 2;
    // An index read's index is a projection row after the gates'.
    for (const read of l.indexReads) { kind[first + read.row] = 3; weights[first + read.row] += stored(read.indexRow); }
    first += l.outputSize;
  });
  const kindCounts = [0, 0, 0, 0];
  for (let r = 0; r < count; r++) kindCounts[kind[r]]++;

  const slotOf = (name) => { const m = /^(?:words|tiles)\.(\d+)\./.exec(name); return m ? Number(m[1]) : -1; };
  const inputNames = Array.from({ length: sourceSize }, (_, i) => built.nameOf(i).replace(/\[(\d+)\]/g, '.$1'));
  const outputNames = [];
  const walk = (node, name) => {
    if (typeof node === 'number') { outputNames.push(name); return; }
    for (const [key, value] of Object.entries(node)) walk(value, name ? `${name}.${key}` : key);
  };
  walk(built.output, '');
  const place = new Int32Array(program.width).fill(-1);
  for (let p = 0; p < program.wireOrder.length; p++) place[program.wireOrder[p]] = p;
  net = {
    sourceSize, valueCount, count, layers: program.layers.length, weightCount, wires: program.wireOrder,
    kind, layer, weights, gateOf, gateBias, gateStart, gateAt, gateWeight, kindCounts,
    inputs: { names: inputNames, policies: inputNames.map((_, i) => built.policyOf(i)), slot: Int16Array.from(inputNames, slotOf) },
    outputs: {
      names: outputNames,
      // The outputs are the roots after the next source values (layout.js runtimeOf).
      at: Int32Array.from(outputNames, (_, j) => place[program.roots[sourceSize + j]]),
      slot: Int16Array.from(outputNames, slotOf),
    },
  };
  described.set(built, net);
  return net;
}

// The rows of a list: 0 Input, 1 Operations, 2 Output.
export const rowCount = (net, list) => (list === INPUT ? net.sourceSize : list === OPERATIONS ? net.count : net.outputs.names.length);
// A row's value in the copied evaluation.
export const valueOf = (net, values, list, row) => (list === INPUT ? values[row] : list === OPERATIONS ? values[net.sourceSize + row] : values[net.outputs.at[row]]);

// A ReGLU's gate in the copied evaluation, summed as the runtime sums it: in FP32, term by term from the bias.
export function gateValue(net, values, g) {
  let sum = net.gateBias[g];
  for (let t = net.gateStart[g]; t < net.gateStart[g + 1]; t++) sum = Math.fround(sum + Math.fround(net.gateWeight[t] * values[net.gateAt[t]]));
  return sum;
}
// 1 when the operation's ReLU passes a value on, 0 when it outputs 0, -1 for an operation without a ReLU.
export const reluOf = (net, values, row) => (net.gateOf[row] < 0 ? -1 : gateValue(net, values, net.gateOf[row]) > 0 ? 1 : 0);
export function reluOnCount(net, values) {
  let on = 0;
  for (let g = 0; g < net.gateBias.length; g++) if (gateValue(net, values, g) > 0) on++;
  return on;
}

// The first row of a word slot's rows in a list, or -1.
export const firstRowOf = (net, list, slot) => (list === INPUT ? net.inputs.slot.indexOf(slot) : list === OUTPUT ? net.outputs.slot.indexOf(slot) : -1);

// What the panel keeps of the machine it watches: the values of the last evaluation, copied right after it, and the
// time the evaluations took since the panel last drew a frame. layout.js calls take() while machine.watch is this.
export function createWatch(valueCount) {
  return {
    values: new Float32Array(valueCount),
    fresh: false,
    evaluations: 0,
    ms: 0,
    take(packed, ms) {
      this.values.set(packed);
      this.fresh = true;
      this.evaluations++;
      this.ms += ms;
    },
  };
}

// An FP32 value as the shortest decimal that reads back as the same FP32 value, e.g. '0.1' for f(0.1), whose float64
// digits are 0.10000000149011612. A whole number is shown exactly (HandwiredOS's formatValue).
export function formatValue(value) {
  if (!Number.isFinite(value) || (Number.isInteger(value) && Math.abs(value) < 1e21)) return String(value);
  for (let digits = 1; digits <= 9; digits++) {
    const rounded = Number(value.toPrecision(digits));
    if (Math.fround(rounded) === value) return String(rounded);
  }
  return String(value);
}

// The chart's points: for each of the last `points` frames, the average of the `window` frames up to it.
export function averageFrameTimes(times, points = POINTS, window = AVERAGED) {
  const out = [];
  for (let last = Math.max(0, times.length - points); last < times.length; last++) {
    const first = Math.max(0, last - window + 1);
    let sum = 0;
    for (let k = first; k <= last; k++) sum += times[k];
    out.push(sum / (last - first + 1));
  }
  return out;
}
// The top of the chart's scale for its highest point, in µs: the smallest of 100, 200, 500, 1,000, … that it fits under.
export function frameTimeScale(highest) {
  for (let magnitude = 100; ; magnitude *= 10) for (const step of [1, 2, 5]) if (step * magnitude >= highest) return step * magnitude;
}
// The chart's line in a box POINTS - 1 wide and 1 tall, the last point at the right edge, 0 at the bottom.
export function frameTimesPath(points, scale, capacity = POINTS) {
  const first = capacity - points.length;
  return `M${points.map((p, k) => `${first + k} ${(1 - Math.min(p / scale, 1)).toFixed(3)}`).join('L')}`;
}

const TEXT = {
  id: {
    cardButton: 'Lihat jaringannya',
    label: 'Jaringan kata ini',
    kicker: (ref) => `Jaringan tata letak · Ayat ${ref}`,
    which: (k, n, slot) => `kata ke-${k} dari ${n} · tiles.${slot}`,
    lists: ['Masukan', 'Operasi', 'Keluaran'],
    titles: [['nama', 'jenis', '', '', 'nilai'], ['wire', 'jenis', 'lapis', 'bobot', 'nilai'], ['nama', '', '', '', 'nilai']],
    policies: { input: 'masukan', state: 'keadaan', event: 'peristiwa' },
    sentences: [
      'Yang dibaca jaringan: lebar tiap kata dan baris, kata yang diketuk (masukan), dan posisi pegasnya (keadaan).',
      'Tiap angka dihitung dari angka sebelumnya, lapis demi lapis. Titik tembaga: ReLU-nya meneruskan nilai. Abu-abu: keluarannya 0.',
      'Yang dipakai halaman untuk menggambar. Ubah ukuran huruf di Aa: x dan y menghitung ke tempat baru kata ini.',
    ],
    kinds: ['jumlah berbobot dari nilai-nilai sebelumnya', 'jumlah berbobot dikali ReLU dari jumlah lain, gerbangnya', 'nilai 0 sampai 1 yang dibulatkan ke 0 atau 1', 'salinan isi tabel di posisi yang dihitung'],
    on: (n) => `${n} menyala`,
    counts: ['operasi', 'lapis', 'bobot'],
    frame: 'Waktu jaringan ini per frame. Jam browser melangkah 0,1 ms atau lebih, jadi tiap titik grafik dan angka di sampingnya adalah rata-rata 10 frame.',
    close: 'Tutup',
  },
  en: {
    cardButton: 'See its network',
    label: 'This word’s network',
    kicker: (ref) => `Layout network · Ayah ${ref}`,
    which: (k, n, slot) => `word ${k} of ${n} · tiles.${slot}`,
    lists: ['Input', 'Operations', 'Output'],
    titles: [['name', 'kind', '', '', 'value'], ['wire', 'kind', 'layer', 'weights', 'value'], ['name', '', '', '', 'value']],
    policies: { input: 'input', state: 'state', event: 'event' },
    sentences: [
      'What the network reads: the widths of each word and the line, the tapped word (input), and where its springs are (state).',
      'Each number is computed from earlier ones, layer by layer. Copper dot: its ReLU passes a value on. Grey: it outputs 0.',
      'What the page draws from. Change the text size under Aa: x and y count to this word’s new place.',
    ],
    kinds: ['a weighted sum of earlier values', 'a weighted sum times the ReLU of another sum, its gate', 'a value from 0 to 1 rounded to 0 or 1', 'a copy of the table entry at a computed position'],
    on: (n) => `${n} on`,
    counts: ['operations', 'layers', 'weights'],
    frame: 'This network’s time per frame. A browser’s clock counts in steps of 0.1 ms or more, so each point of the chart, and the number beside it, is the average of 10 frames.',
    close: 'Close',
  },
};
export const networkText = (lang) => TEXT[lang === 'en' ? 'en' : 'id'];

// ---------- the panel ----------

// `spring` is a zoom machine (layout.js buildZoom) for the panel's slide; `refresh(ay)` evaluates the ayah's machine
// once and draws, so the lists have numbers as soon as they show.
export function createNetworkPanel({ $, el, num, lang, reduced, spring, refresh }) {
  const node = $('net');
  const scroller = $('net-scroller');
  const spacer = $('net-spacer');
  const list = $('net-list');
  const wide = matchMedia('(min-width: 760px)');
  const slots = Array.from({ length: SLOTS }, () => {
    const name = el('bdi');
    const cells = [el('span', { className: 'c-name' }, name), el('span', { className: 'c-kind' }), el('span', { className: 'c-layer' }), el('span', { className: 'c-weights' }), el('span', { className: 'c-value' })];
    const row = el('div', { className: 'net-row', hidden: true }, ...cells);
    spacer.append(row);
    return { row, name, cells, at: -1, v: NaN, text: '', relu: -2 };
  });
  const headCells = Array.from({ length: 5 }, (_, k) => el('span', { className: ['c-name', 'c-kind', 'c-layer', 'c-weights', 'c-value'][k] }));
  $('net-header').append(...headCells);

  let open = false;
  let target = null; // {ay, i, ref, word, meaning, count}
  let machine = null;
  let watch = null;
  let net = null;
  let shown = OUTPUT;
  // Where each list is scrolled to. null opens it at the tapped word's own rows (Input, Output) or at the first layer
  // (Operations); a new word sets Input and Output back to null.
  const scrolls = [null, null, null];
  let selected = -1;
  let times = [];
  let rowsFrame = 0;
  let paints = 0;
  let worstPaint = 0;

  const text = () => networkText(lang());
  const rows = () => rowCount(net, shown);

  // ---- rows ----

  function fillRow(s, r) {
    s.at = r;
    s.v = NaN;
    s.relu = -2;
    s.row.style.transform = `translate3d(0, ${r * ROW}px, 0)`;
    const tx = text();
    let cls = 'net-row';
    if (shown === OPERATIONS) {
      s.name.textContent = String(net.wires[net.sourceSize + r]);
      s.cells[1].textContent = KINDS[net.kind[r]];
      s.cells[2].textContent = String(net.layer[r]);
      s.cells[3].textContent = String(net.weights[r]);
      cls += ` k${net.kind[r]}`;
    } else {
      const names = shown === INPUT ? net.inputs.names : net.outputs.names;
      s.name.textContent = names[r];
      s.cells[1].textContent = shown === INPUT ? tx.policies[net.inputs.policies[r]] ?? net.inputs.policies[r] : '';
      const slot = (shown === INPUT ? net.inputs.slot : net.outputs.slot)[r];
      if (slot === target.i) cls += ' mine';
      else if (slot > target.count) cls += ' spare';
    }
    if (r === selected) cls += ' sel';
    s.row.className = cls;
    s.row.dataset.row = r;
    s.row.hidden = false;
  }

  function writeValue(s) {
    const v = valueOf(net, watch.values, shown, s.at);
    if (!Object.is(v, s.v)) {
      s.v = v;
      const t = formatValue(v);
      if (t !== s.text) { s.text = t; s.cells[4].textContent = t; }
    }
    if (shown === OPERATIONS && net.gateOf[s.at] >= 0) {
      const relu = reluOf(net, watch.values, s.at);
      if (relu !== s.relu) { s.relu = relu; s.row.classList.toggle('on', relu === 1); s.row.classList.toggle('off', relu === 0); }
    }
  }

  // The rows in view and two either side get nodes; the others give theirs back.
  function drawRows(force = false) {
    rowsFrame = 0;
    if (!net || !watch) return;
    const top = scroller.scrollTop;
    const first = Math.max(0, Math.floor(top / ROW) - 2);
    const last = Math.min(rows() - 1, Math.floor((top + scroller.clientHeight) / ROW) + 2, first + SLOTS - 1);
    for (const s of slots) if (s.at >= 0 && (force || s.at < first || s.at > last)) { s.row.hidden = true; s.at = -1; s.text = ''; s.cells[4].textContent = ''; }
    for (let r = first; r <= last; r++) {
      const s = slots[r % SLOTS];
      if (s.at !== r) fillRow(s, r);
      writeValue(s);
    }
  }
  const requestRows = () => { rowsFrame ||= requestAnimationFrame(() => drawRows()); };
  scroller.addEventListener('scroll', requestRows, { passive: true });
  new ResizeObserver(() => { if (open) requestRows(); }).observe(scroller);

  scroller.addEventListener('click', (e) => {
    const row = e.target.closest('.net-row');
    if (!row) return;
    const r = Number(row.dataset.row);
    selected = selected === r ? -1 : r;
    for (const s of slots) if (s.at >= 0) s.row.classList.toggle('sel', s.at === selected);
  });

  // ---- the three lists ----

  function showList(k, keep = true) {
    if (keep) scrolls[shown] = scroller.scrollTop;
    shown = k;
    selected = -1;
    node.dataset.list = String(k);
    list.className = `net-list list-${k}`;
    for (const b of $('net-lists').querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.list) === k));
    const titles = text().titles[k];
    headCells.forEach((c, j) => { c.textContent = titles[j]; });
    spacer.style.height = `${rows() * ROW}px`;
    scroller.scrollTop = scrolls[k] ?? Math.max(0, firstRowOf(net, k, target.i)) * ROW;
    caption();
    drawRows(true);
  }
  for (const b of $('net-lists').querySelectorAll('button')) b.onclick = () => { if (Number(b.dataset.list) !== shown) showList(Number(b.dataset.list)); };

  // ---- what the lists and the footer say ----

  function caption() {
    const tx = text();
    $('net-sentence').textContent = tx.sentences[shown];
    const kinds = $('net-kinds');
    kinds.hidden = shown !== OPERATIONS;
    if (shown !== OPERATIONS) return;
    kinds.replaceChildren(...KINDS.map((name, k) => {
      if (!net.kindCounts[k]) return '';
      const item = el('li', { className: `k${k}`, title: `${name}: ${tx.kinds[k]}` }, el('span', { className: 'kn', textContent: name }), el('b', { textContent: num(net.kindCounts[k]) }));
      if (k === 1) item.append(el('span', { className: 'on', id: 'net-on' }));
      return item;
    }));
    countOn();
  }
  function countOn() {
    const on = $('net-on');
    if (!on || !watch?.evaluations) return;
    const n = reluOnCount(net, watch.values);
    node.dataset.on = String(n);
    on.textContent = text().on(num(n));
  }

  function labels() {
    const tx = text();
    node.ariaLabel = tx.label;
    $('net-close').ariaLabel = tx.close;
    $('net-frame').title = tx.frame;
    for (const b of $('net-lists').querySelectorAll('button')) {
      const k = Number(b.dataset.list);
      b.replaceChildren(tx.lists[k], el('span', { className: 'n', textContent: net ? num(rowCount(net, k)) : '' }));
    }
    if (net) {
      const counts = [net.count, net.layers, net.weightCount];
      $('net-counts').replaceChildren(...counts.map((n, k) => el('li', {}, el('b', { textContent: num(n) }), ` ${tx.counts[k]}`)));
    }
    if (target) {
      $('net-kicker').textContent = tx.kicker(target.ref);
      $('net-ar').textContent = target.word;
      // The corpus's meanings end with their punctuation, e.g. "(be) to Allah,".
      $('net-gloss').textContent = [target.meaning.replace(/[\s,;:.]+$/, ''), tx.which(target.i + 1, target.count, target.i)].filter(Boolean).join(' · ');
    }
  }

  // One point per frame in which the network ran: its evaluations' time in that frame.
  function recordFrame(ms) {
    if (times.length === POINTS + AVERAGED - 1) times.shift();
    times.push(Math.round(ms * 1000));
    const points = averageFrameTimes(times);
    const last = points[points.length - 1];
    const scale = frameTimeScale(Math.max(...points));
    const line = frameTimesPath(points, scale);
    $('net-line').setAttribute('d', line);
    $('net-area').setAttribute('d', `${line}V1H${POINTS - points.length}Z`);
    $('net-end').setAttribute('d', `${frameTimesPath([last], scale)}h0`);
    const ms3 = last / 1000;
    $('net-ms').textContent = ms3 < 10 ? ms3.toFixed(2) : ms3.toFixed(1);
  }

  // ---- watching an ayah ----

  function watchAyah(next) {
    const same = target?.ay === next.ay;
    target = next;
    node.dataset.ref = next.ref;
    node.dataset.word = String(next.i);
    if (!same) {
      if (machine) machine.watch = null;
      machine = next.ay.machine;
      const was = net;
      net = describeNetwork(machine.built);
      watch = createWatch(net.valueCount);
      machine.watch = watch;
      node.dataset.ops = String(net.count);
      node.dataset.reglu = String(net.kindCounts[1]);
      node.dataset.layers = String(net.layers);
      node.dataset.weights = String(net.weightCount);
      if (was !== net) { times = []; scrolls[OPERATIONS] = null; }
    }
    scrolls[INPUT] = scrolls[OUTPUT] = null;
    labels();
  }

  // Called by the page after it draws a frame: the rows on screen take the new values.
  function paint() {
    if (!watch?.fresh) return;
    const started = performance.now();
    watch.fresh = false;
    for (const s of slots) if (s.at >= 0) writeValue(s);
    if (shown === OPERATIONS) countOn();
    recordFrame(watch.ms);
    watch.ms = 0;
    const took = performance.now() - started;
    worstPaint = Math.max(worstPaint, took);
    node.dataset.evals = String(watch.evaluations);
    node.dataset.paints = String(++paints);
    node.dataset.paintMs = took.toFixed(3);
    node.dataset.worstPaintMs = worstPaint.toFixed(3);
  }

  // ---- open, follow, close: the slide is a Handwired spring too (the zoom program) ----

  let slideFrame = 0;
  function slide(to, jump) {
    const box = node.getBoundingClientRect();
    const c = spring.built.cells;
    const from = wide.matches ? { x: box.width + 24, y: 0 } : { x: 0, y: box.height + 24 };
    spring.set(c.from.x, quarter(from.x)); spring.set(c.from.y, quarter(from.y)); spring.set(c.from.w, 0); spring.set(c.from.h, 0);
    for (const k of ['x', 'y', 'w', 'h']) spring.set(c.to[k], 0);
    spring.set(c.open, to);
    spring.nudge(performance.now(), jump || reduced.matches);
    cancelAnimationFrame(slideFrame);
    const step = (now) => {
      const o = spring.step(now);
      // The CSS translate property, so a sheet's drag (sheet.js, which writes transform) adds to it instead of fighting it.
      node.style.translate = `${o.x}px ${o.y}px`;
      if (spring.running()) slideFrame = requestAnimationFrame(step);
      else { slideFrame = 0; if (!open) hide(); }
    };
    step(performance.now());
  }
  function hide() {
    node.hidden = true;
    document.body.classList.remove('netting');
    node.style.translate = '';
  }

  function show(next) {
    const reopening = open;
    open = true;
    node.hidden = false;
    document.body.classList.add('netting');
    watchAyah(next);
    if (!reopening) {
      // From outside the screen, then gliding in.
      slide(0, true);
      slide(1, false);
    }
    showList(OUTPUT, false);
    refresh(next.ay);
    $('net-close').focus({ preventScroll: true });
  }

  function follow(next) {
    if (!open) return;
    if (shown === OPERATIONS) scrolls[OPERATIONS] = scroller.scrollTop;
    watchAyah(next);
    showList(shown, false);
    refresh(next.ay);
  }

  function close(instant = false) {
    if (!open) return;
    open = false;
    if (machine) machine.watch = null;
    machine = null;
    watch = null;
    target = null;
    if (instant || reduced.matches) { cancelAnimationFrame(slideFrame); hide(); } else slide(0, false);
  }

  $('net-close').onclick = () => close();
  // Escape closes the panel when no sheet lies over it; the sheets' own Escape runs after this, so this looks first.
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open) return;
    if (['map', 'search', 'same'].some((id) => $(id) && !$(id).hidden)) return;
    close();
  }, true);
  wide.addEventListener('change', () => { if (open) { cancelAnimationFrame(slideFrame); slide(1, true); requestRows(); } });

  return {
    open: show,
    follow,
    close,
    paint,
    isOpen: () => open,
    ayah: () => target?.ay ?? null,
    word: () => target?.i ?? -1,
    relang() { if (!net) return; labels(); caption(); const t = text().titles[shown]; headCells.forEach((c, j) => { c.textContent = t[j]; }); if (shown === INPUT) drawRows(true); },
  };
}
