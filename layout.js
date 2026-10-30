// The reader's layout as Handwired programs (github.com/chenglou/handwired): ordinary layout logic turned into sums
// and ReLUs, evaluated every frame, with every moving number on a spring.
//
// - buildAyah(W): one ayah of up to W word tiles. It breaks the tiles into lines right to left, places each tile, opens
//   the word card under the tapped word's line and pushes the lines below it down, lifts the tapped word, and lights
//   every word whose root is the selected root. All of it on springs, so a change of text size, language, width or
//   selection glides instead of jumping.
// - buildStack(B): the ayat of a surah, one under another, each on a spring, so when one ayah grows (its card opens,
//   its lines re-break) the ones under it glide down.
//
// layoutReference and stackReference are the same layout in plain JavaScript; test/layout.test.mjs checks the
// programs against them.
import {
  advanceFrame, createEvaluator, createSourceTable, defaultSpringClockConfig, emitAnimatedObject, emitCompare, emitSelect,
  input, inputBit, list, springMatrixBound, springMatrixPower, springStepMatrix, state, stoppedSpringClock,
} from './vendor/handwired-4ea7fcb/handwired.js';

// Slightly under critical damping (2·√280 ≈ 33.5), so a word that moves settles with the smallest overshoot.
export const SPRING = { stiffness: 280, damping: 31 };
const BOUND = springMatrixBound(SPRING);
const matrixCells = () => [input([-BOUND, BOUND]), input([-BOUND, BOUND]), input([-BOUND, BOUND]), input([-BOUND, BOUND])];
const QUARTER = { grid: 0.25 };
const pxSpring = (reach) => ({ displacement: state([-reach, reach]), velocity: state([-64 * reach, 64 * reach]), destination: state([-reach, reach]) });
const unitSpring = () => ({ displacement: state([-4, 4]), velocity: state([-1024, 1024]), destination: state([0, 1]) });

// Every px is on a 1/4 px grid, so sums and comparisons of them are exact in FP32.
export const quarter = (v) => Math.round(v * 4) / 4;

function helpers(circuit) {
  const zero = circuit.constant(0);
  return {
    zero,
    not: (bit) => circuit.affine([[bit, -1]], 1),
    and: (...bits) => circuit.reglu([], 1, bits.map((bit) => [bit, 1]), 1 - bits.length),
  };
}

// One ayah. A slot holds a tile: its width, whether it's in use, and its word's root (0 for none).
export function buildAyah(W) {
  const spec = {
    lineWidth: input([0, 8192], { initial: 600, grid: 0.25 }),
    lineHeight: input([0, 1024], { initial: 80, grid: 0.25 }),
    gap: input([0, 256], { initial: 8, grid: 0.25 }),
    cardHeight: input([0, 4096], QUARTER),
    selected: input([0, W], { initial: W, grid: 1 }), // the tapped slot, W for none
    open: inputBit(), // whether its card is open; the slot stays while the card closes, so the card closes in place
    root: input([0, 4096], { grid: 1 }), // the selected root, 0 for none
    springMatrix: matrixCells(),
    settleCheck: inputBit(),
    snap: inputBit(),
    words: list(W, () => ({ width: input([0, 4096], QUARTER), used: inputBit(), root: input([0, 4096], { grid: 1 }) })),
    tiles: list(W, () => ({ x: pxSpring(16384), y: pxSpring(65536), glow: unitSpring(), lift: unitSpring() })),
    card: unitSpring(),
    cardTop: pxSpring(65536),
    cardSize: pxSpring(4096),
  };
  const table = createSourceTable();
  const cells = table.declare(spec);
  const circuit = table.createCircuit();
  const { zero, not, and } = helpers(circuit);

  // Lines, in reading order. JS: next = pos + previous width + gap; if next + width > lineWidth, wrap to a new line.
  const pos = [zero];
  const line = [zero];
  for (let i = 1; i < W; i++) {
    const word = cells.words[i];
    const next = circuit.affine([[pos[i - 1], 1], [cells.words[i - 1].width, 1], [cells.gap, 1]]);
    const fits = emitCompare(circuit, circuit.affine([[next, 1], [word.width, 1]]), '<=', cells.lineWidth);
    const p = emitSelect(circuit, fits, zero, next);
    circuit.assumeRange(p, 0, 8192); // a tile starts where it fits, so never past the line's width
    pos.push(p);
    // Only a tile in use opens a new line, so the unused slots after the last word add none.
    line.push(circuit.affine([[line[i - 1], 1], [and(word.used, not(fits)), 1]]));
  }

  // The card opens under the tapped tile's line and pushes every later line down by its height.
  const hasCard = and(cells.open, emitCompare(circuit, cells.selected, '<', circuit.constant(W)));
  const selectedLine = circuit.indexRead(cells.selected, line, { outOfRange: 'zero' });
  const push = circuit.multiply(hasCard, cells.cardHeight);
  const rootOn = emitCompare(circuit, cells.root, '>', zero);

  const springs = [];
  const tiles = cells.words.map((word, i) => {
    // Right to left: the first tile at the line's right edge.
    const x = circuit.affine([[cells.lineWidth, 1], [pos[i], -1], [word.width, -1]]);
    const below = emitCompare(circuit, line[i], '>', selectedLine);
    const y = circuit.affine([[circuit.multiply(line[i], cells.lineHeight), 1], [circuit.multiply(below, push), 1]]);
    const glow = and(word.used, rootOn, emitCompare(circuit, word.root, '===', cells.root));
    const lift = and(hasCard, emitCompare(circuit, cells.selected, '===', circuit.constant(i)));
    const cell = cells.tiles[i];
    springs.push([cell.x, x], [cell.y, y], [cell.glow, glow], [cell.lift, lift]);
    return { x, y, glow, lift };
  });
  const lines = circuit.affine([[line[W - 1], 1]], 1);
  const height = circuit.affine([[circuit.multiply(lines, cells.lineHeight), 1], [push, 1]]);
  const cardTop = circuit.multiply(circuit.affine([[selectedLine, 1]], 1), cells.lineHeight);
  // The card's opening, its place under the tapped line and its size each glide, so switching words or changing the
  // text size moves an open card instead of jumping it.
  springs.push([cells.card, hasCard], [cells.cardTop, cardTop], [cells.cardSize, cells.cardHeight]);

  const motion = emitAnimatedObject(circuit, springs.map(([cell, destination]) => ({
    matrix: cells.springMatrix, displacement: cell.displacement, velocity: cell.velocity, destination, destinationDuringSteps: cell.destination,
  })), { settleCheck: cells.settleCheck, snap: cells.snap });
  springs.forEach(([cell, destination], k) => table.next(cell, { displacement: motion.displacements[k], velocity: motion.velocities[k], destination }));

  const at = (k) => motion.positions[k];
  const output = {
    tiles: tiles.map((t, i) => ({ x: at(4 * i), y: at(4 * i + 1), glow: at(4 * i + 2), lift: at(4 * i + 3), toX: t.x, toY: t.y })),
    card: { open: at(4 * W), top: at(4 * W + 1), size: at(4 * W + 2), toTop: cardTop, push },
    lines,
    height,
    active: motion.active,
  };
  return { W, cells, output, ...named(table), ...table.finish() };
}

// Each source cell's name and policy, e.g. 'words[3].width' and 'input', for the network panel (network.js).
function named(table) {
  return { nameOf: table.nameOf, policyOf: table.policyOf };
}

// The ayat of a surah, one under another with a gap, each on a spring.
export function buildStack(B) {
  const spec = {
    gap: input([0, 1024], { initial: 16, grid: 0.25 }),
    springMatrix: matrixCells(),
    settleCheck: inputBit(),
    snap: inputBit(),
    heights: list(B, () => input([0, 65536], QUARTER)),
    used: list(B, () => inputBit()), // a surah fills the first slots; the gap goes only above an ayah in use
    blocks: list(B, () => pxSpring(1 << 20)),
  };
  const table = createSourceTable();
  const cells = table.declare(spec);
  const circuit = table.createCircuit();
  const tops = [circuit.constant(0)];
  for (let j = 1; j < B; j++) tops.push(circuit.affine([[tops[j - 1], 1], [cells.heights[j - 1], 1], [circuit.multiply(cells.used[j], cells.gap), 1]]));
  const total = circuit.affine([[tops[B - 1], 1], [cells.heights[B - 1], 1]]);
  const motion = emitAnimatedObject(circuit, tops.map((top, j) => ({
    matrix: cells.springMatrix, displacement: cells.blocks[j].displacement, velocity: cells.blocks[j].velocity, destination: top, destinationDuringSteps: cells.blocks[j].destination,
  })), { settleCheck: cells.settleCheck, snap: cells.snap });
  tops.forEach((top, j) => table.next(cells.blocks[j], { displacement: motion.displacements[j], velocity: motion.velocities[j], destination: top }));
  const output = { tops: motion.positions, total, active: motion.active };
  return { B, cells, output, ...named(table), ...table.finish() };
}

// A sheet that zooms between two rectangles, like a photo opening in HandwiredOS: one spring says how far open it is,
// and the rectangle is that far between `from` and `to`.
export function buildZoom() {
  const rect = () => ({ x: input([-16384, 16384], QUARTER), y: input([-16384, 16384], QUARTER), w: input([0, 16384], QUARTER), h: input([0, 16384], QUARTER) });
  const spec = { from: rect(), to: rect(), open: inputBit(), springMatrix: matrixCells(), settleCheck: inputBit(), snap: inputBit(), progress: unitSpring() };
  const table = createSourceTable();
  const cells = table.declare(spec);
  const circuit = table.createCircuit();
  const motion = emitAnimatedObject(circuit, [{
    matrix: cells.springMatrix, displacement: cells.progress.displacement, velocity: cells.progress.velocity, destination: cells.open, destinationDuringSteps: cells.progress.destination,
  }], { settleCheck: cells.settleCheck, snap: cells.snap });
  table.next(cells.progress, { displacement: motion.displacements[0], velocity: motion.velocities[0], destination: cells.open });
  const p = motion.positions[0];
  const between = (a, b) => circuit.affine([[a, 1], [circuit.multiply(circuit.affine([[b, 1], [a, -1]]), p), 1]]);
  const output = { x: between(cells.from.x, cells.to.x), y: between(cells.from.y, cells.to.y), w: between(cells.from.w, cells.to.w), h: between(cells.from.h, cells.to.h), progress: p, active: motion.active };
  return { cells, output, ...named(table), ...table.finish() };
}

// ---------- running a program ----------

const MATRICES = Array.from({ length: defaultSpringClockConfig.maxStepsPerFrame + 1 }, (_, steps) => springMatrixPower(springStepMatrix(SPRING), steps));

// Every wire of an output struct, in order, with a function that writes them back into the same shape. The page reads
// the shape's numbers each frame, so the shape is made once per machine and only its numbers change.
function leavesOf(output) {
  const wires = [];
  const walk = (node) => {
    if (typeof node === 'number') { wires.push(node); return; }
    for (const value of Array.isArray(node) ? node : Object.values(node)) walk(value);
  };
  walk(output);
  return wires;
}
function shapeOf(output) {
  if (typeof output === 'number') return 0;
  if (Array.isArray(output)) return output.map(shapeOf);
  return Object.fromEntries(Object.entries(output).map(([k, v]) => [k, shapeOf(v)]));
}
function fill(shape, values, at) {
  for (const key of Object.keys(shape)) {
    const v = shape[key];
    if (typeof v === 'number') shape[key] = values[at.i++];
    else fill(v, values, at);
  }
}

// The fast path for the page: the compiled program with only its source cells checked, read into one reused object.
// test/layout.test.mjs runs the same programs through `createEvaluator`, which also checks every next value.
// The compiled program is kept: its layers say what every operation is, and the evaluator's `packedValues` holds the
// value of every source cell and every operation of the last evaluation, which the network panel lists (network.js),
// as HandwiredOS's Monitor does.
const runtimes = new WeakMap();
function runtimeOf(built) {
  let runtime = runtimes.get(built);
  if (!runtime) {
    const leaves = leavesOf(built.output);
    const roots = [...built.nextSource, ...leaves];
    const program = built.circuit.compileTensorProgram(roots);
    runtime = { program, evaluate: built.circuit.createTensorProgramEvaluator(program), sourceSize: built.nextSource.length };
    runtimes.set(built, runtime);
  }
  return runtime;
}
export const programOf = (built) => runtimeOf(built).program;

// A program's own table of numbers and clock. Many machines can share one built program: it is compiled once.
//
// `machine.watch` is null unless the network panel is open on this machine. Then every evaluation's values are copied
// into it right away, before another machine of the same program evaluates over them, with the time it took.
export function createMachine(built, { checked = false } = {}) {
  const runtime = runtimeOf(built);
  const checkedEvaluate = checked ? createEvaluator(built) : null;
  const source = new Float32Array(built.initialSource);
  const copy = new Float32Array(source.length);
  const output = shapeOf(built.output);
  let queued = [];
  let snapNext = false;
  let fresh = false;
  const { springMatrix, settleCheck, snap } = built.cells;
  const machine = {
    built,
    source,
    clock: stoppedSpringClock,
    output,
    watch: null,
    // Inputs keep their value from one evaluation to the next, so a change is written once.
    set(wire, value) {
      if (source[wire] === value) return false;
      source[wire] = value;
      return true;
    },
    // An evaluation at this time that writes its state back and starts the clock; with `jump`, every spring lands at
    // once (a first layout, or a change nobody should watch).
    nudge(timeStamp, jump = false) {
      queued.push({ timeStamp });
      if (jump) snapNext = true;
    },
    running: () => machine.clock.animatedUntilMs !== null || queued.length > 0,
    // Whether the numbers changed since the page last read them.
    take() {
      const was = fresh;
      fresh = false;
      return was;
    },
    step(frameTime) {
      let active = 0;
      machine.clock = advanceFrame(machine.clock, frameTime, queued, (evaluation) => {
        const values = evaluation.writesBack ? source : copy;
        if (!evaluation.writesBack) copy.set(source);
        const matrix = MATRICES[evaluation.steps];
        for (let k = 0; k < 4; k++) values[springMatrix[k]] = matrix[k];
        values[settleCheck] = evaluation.settleCheck ? 1 : 0;
        const jump = evaluation.snap || (snapNext && evaluation.writesBack);
        values[snap] = jump ? 1 : 0;
        if (checkedEvaluate) {
          const result = checkedEvaluate(values);
          if (evaluation.writesBack) source.set(result.nextValues);
          fill(output, leavesOf(result.output), { i: 0 });
        } else {
          const watch = machine.watch;
          const started = watch ? performance.now() : 0;
          const result = runtime.evaluate(values);
          if (watch) watch.take(runtime.evaluate.packedValues, performance.now() - started);
          if (evaluation.writesBack) source.set(result.subarray(0, runtime.sourceSize));
          fill(output, result, { i: runtime.sourceSize });
        }
        if (evaluation.writesBack && jump) snapNext = false;
        fresh = true;
        active = output.active;
        return active > 0;
      }, 'events and settle checks');
      queued = [];
      return output;
    },
  };
  return machine;
}

// ---------- the same layout in plain JavaScript ----------

export function layoutReference({ widths, used, lineWidth, gap, lineHeight, selected, open = true, cardHeight }) {
  const W = widths.length;
  const pos = [0];
  const line = [0];
  for (let i = 1; i < W; i++) {
    const next = pos[i - 1] + widths[i - 1] + gap;
    const fits = next + widths[i] <= lineWidth;
    pos.push(fits ? next : 0);
    line.push(line[i - 1] + (used[i] && !fits ? 1 : 0));
  }
  const hasCard = open && selected < W;
  const selectedLine = selected < W ? line[selected] : 0;
  const push = hasCard ? cardHeight : 0;
  const x = widths.map((w, i) => lineWidth - pos[i] - w);
  const y = line.map((l) => l * lineHeight + (l > selectedLine ? push : 0));
  const lines = line[W - 1] + 1;
  return { x, y, lines, height: lines * lineHeight + push, cardTop: (selectedLine + 1) * lineHeight };
}

export function stackReference(heights, gap, used = heights.map(() => true)) {
  const tops = [0];
  for (let j = 1; j < heights.length; j++) tops.push(tops[j - 1] + heights[j - 1] + (used[j] ? gap : 0));
  return { tops, total: tops[heights.length - 1] + heights[heights.length - 1] };
}
