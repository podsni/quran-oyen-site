// The whole-Quran root light on the visitor's GPU: for a selected root, how many words of every ayah carry it, and the
// totals per surah. The count is a Handwired program (github.com/chenglou/handwired): the work of one word is written
// with Handwired's builder as sums and ReLUs, a loop program runs it over an ayah's words, and Handwired's loop emitter
// writes it as one WGSL compute shader that runs once per ayah, all 6,236 at once, on the repo's own WebGPU host.
//
//   import { createRootLight } from './quran-gpu.js';
//   const rootLight = await createRootLight();       // fetches data/roots-table.*, compiles the shader, runs it once
//   rootLight.backend                                 // 'webgpu', or 'cpu' when this browser has no working WebGPU
//   const { perAyah, perSurah, gpuMs, totalMs } = await rootLight.light(46);   // rootId 46 is أله, the root of ٱللَّه
//
// The CPU path is the same count as a plain JavaScript loop. It runs only when navigator.gpu is missing, when getting an
// adapter, a device or the shader fails, or when the GPU's first answer differs from it; `reason` then says why.
import {
  createDocumentStore, createProgramRunner, createSourceTable, createStage, describeLoop, emitCompare, emitLoopWgsl, input,
} from './vendor/handwired-gpu-4ea7fcb/handwired-gpu.js';

const now = () => performance.now();
const round = (ms) => Math.round(ms * 1000) / 1000;
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|lavapipe|softpipe|warp|software|basic render/i;

// ---- the data: data/roots-table.json says where each array of data/roots-table.bin starts (tools/build_roots_table.py)

function view(buffer, meta, name, Type) {
  const array = meta.arrays[name];
  const size = Type.BYTES_PER_ELEMENT;
  if (array.offset % size !== 0 || array.offset + array.length * size > buffer.byteLength) throw new Error(`roots-table: ${name} lies outside the file`);
  if (new Uint8Array(Uint16Array.of(1).buffer)[0] === 1) return new Type(buffer, array.offset, array.length);
  // A big-endian machine: the file is little-endian.
  const data = new DataView(buffer, array.offset, array.length * size);
  return Type.from({ length: array.length }, (_, k) => (size === 4 ? data.getUint32(k * 4, true) : data.getUint16(k * 2, true)));
}

// The table as typed arrays, after checking that the two files belong together, e.g. not a .bin from an older build.
export function decodeRootsTable(meta, buffer) {
  if (meta.format !== 'roots-table/1') throw new Error(`roots-table: unknown format ${meta.format}`);
  if (buffer.byteLength !== meta.bytes) throw new Error(`roots-table: the .bin has ${buffer.byteLength} bytes, the .json says ${meta.bytes}`);
  const table = checkTable({
    surahStart: view(buffer, meta, 'surahStart', Uint32Array),
    ayahStart: view(buffer, meta, 'ayahStart', Uint32Array),
    roots: view(buffer, meta, 'roots', Uint16Array),
    rootCount: meta.roots,
  });
  if (table.ayahCount !== meta.ayat || table.roots.length !== meta.words || table.longest !== meta.maxWordsPerAyah) {
    throw new Error('roots-table: the .bin does not match the counts in the .json');
  }
  return table;
}

// The same arrays from anywhere, e.g. a page that already holds them: surahStart (each surah's first ayah, then the
// ayah count), ayahStart (each ayah's first word, then the word count) and roots (a rootId per word, 0 for none).
function checkTable({ surahStart, ayahStart, roots, rootCount }) {
  const ayahCount = ayahStart.length - 1;
  if (!(surahStart[0] === 0 && surahStart[surahStart.length - 1] === ayahCount && ayahStart[0] === 0 && ayahStart[ayahCount] === roots.length)) {
    throw new Error('roots-table: the offsets do not match the counts');
  }
  for (let s = 0; s + 1 < surahStart.length; s++) if (surahStart[s + 1] < surahStart[s]) throw new Error('roots-table: surahs out of order');
  let longest = 0;
  for (let a = 0; a < ayahCount; a++) {
    if (ayahStart[a + 1] < ayahStart[a]) throw new Error('roots-table: ayat out of order');
    longest = Math.max(longest, ayahStart[a + 1] - ayahStart[a]);
  }
  let largest = 0;
  for (let w = 0; w < roots.length; w++) largest = Math.max(largest, roots[w]);
  const count = rootCount ?? largest;
  if (largest > count) throw new Error(`roots-table: rootId ${largest} past the ${count} roots`);
  // The most frequent root, whose light the GPU's first run is checked against.
  const frequency = new Uint32Array(count + 1);
  for (let w = 0; w < roots.length; w++) frequency[roots[w]]++;
  let commonest = 1;
  for (let r = 2; r <= count; r++) if (frequency[r] > frequency[commonest]) commonest = r;
  return { surahStart, ayahStart, roots, ayahCount, rootCount: count, longest, commonest };
}

async function loadRootsTable(options) {
  const base = options.dataUrl ?? new URL('./data/', import.meta.url);
  const get = options.fetch ?? globalThis.fetch;
  const fetchOk = async (name) => {
    const response = await get(new URL(name, base));
    if (!response.ok) throw new Error(`roots-table: ${name} answered ${response.status}`);
    return response;
  };
  const [meta, buffer] = await Promise.all([
    fetchOk('roots-table.json').then((response) => response.json()),
    fetchOk('roots-table.bin').then((response) => response.arrayBuffer()),
  ]);
  return decodeRootsTable(meta, buffer);
}

// ---- the program

// The count as a Handwired loop program: one ayah is one document, its words are the positions, and the cell at a
// position is the word's rootId. JS for what one ayah's run does:
//
//   const on = selected > 0                          // stage 'start', once
//   let count = 0
//   for (const root of ayahRoots) count += on && root === selected ? 1 : 0   // stage 'count', once per word
//
// Every value is a whole number, so every operation is exact in FP32, on any GPU and in any order.
export function buildRootLightProgram({ positions, rootCount }) {
  const table = createSourceTable();
  const cells = table.declare({
    root: input([0, rootCount], { grid: 1 }), //      the word's rootId at the loop's position: the ayah's cell there
    selected: input([0, rootCount], { grid: 1 }), //  the selected root, 0 for none: shared by every ayah, written by light()
    on: input([0, 1], { grid: 1 }), //                carried: whether a root is selected
    count: input([0, positions], { grid: 1 }), //     carried: the words so far that carry the root
  });
  const circuit = table.createCircuit();
  const selectedOn = emitCompare(circuit, cells.selected, '>', circuit.constant(0));
  const same = emitCompare(circuit, cells.root, '===', cells.selected);
  const lit = circuit.reglu([], 1, [[cells.on, 1], [same, 1]], -1); // on AND same, as max(0, on + same - 1)
  const next = circuit.affine([[cells.count, 1], [lit, 1]]);
  const { initialSource } = table.finish();
  const ON = 0;
  const COUNT = 1;
  const loop = {
    positions,
    // An ayah's cells: its words' rootIds, 0 after the last word, then its word count.
    buffers: [{ name: 'roots', cellsPerDocument: positions + 1 }],
    registers: [{ name: 'on', initial: 0 }, { name: 'count', initial: 0 }],
    fields: [],
    outputGroups: [{ name: 'count', kind: 'document', valuesPerDocument: 1, fill: 0 }],
    stages: [
      createStage({
        name: 'start', repeat: 'once', circuit, sharedOffset: 0, bindings: new Map(),
        outputs: [{ wire: selectedOn, write: { kind: 'register', register: ON } }],
      }),
      createStage({
        name: 'count', repeat: 'forward', circuit, sharedOffset: 0,
        bindings: new Map([
          [cells.root, { kind: 'item', buffer: 0 }],
          [cells.on, { kind: 'register', register: ON }],
          [cells.count, { kind: 'register', register: COUNT }],
        ]),
        outputs: [{ wire: next, write: { kind: 'register', register: COUNT } }],
      }),
    ],
    results: [{ group: 0, column: 0, register: COUNT }],
    sharedValues: new Float32Array(initialSource),
    // The loop stops at the ayah's last word. Past it a cell holds rootId 0, which never counts, so the count is the same.
    lengthCell: { buffer: 0, column: positions },
  };
  const shader = emitLoopWgsl(loop);
  return { loop, shader, selectedCell: cells.selected, stages: describeLoop(loop) };
}

// An ayah's cells for the GPU's document store, cellsPerDocument floats per ayah.
function documentCells(table, cellsPerDocument) {
  const { ayahStart, roots, ayahCount } = table;
  const cells = new Float32Array(ayahCount * cellsPerDocument);
  for (let a = 0; a < ayahCount; a++) {
    const first = ayahStart[a];
    const length = ayahStart[a + 1] - first;
    const base = a * cellsPerDocument;
    for (let k = 0; k < length; k++) cells[base + k] = roots[first + k];
    cells[base + cellsPerDocument - 1] = length;
  }
  return cells;
}

function sumSurahs(perAyah, surahStart) {
  const perSurah = new Uint32Array(surahStart.length - 1);
  for (let s = 0; s < perSurah.length; s++) {
    let total = 0;
    for (let a = surahStart[s], end = surahStart[s + 1]; a < end; a++) total += perAyah[a];
    perSurah[s] = total;
  }
  return perSurah;
}

// ---- the two backends

// The same count in plain JavaScript.
function countOnCpu(table, rootId) {
  const { ayahStart, roots, ayahCount } = table;
  const perAyah = new Uint16Array(ayahCount);
  if (rootId > 0) {
    for (let a = 0; a < ayahCount; a++) {
      let count = 0;
      for (let w = ayahStart[a], end = ayahStart[a + 1]; w < end; w++) if (roots[w] === rootId) count++;
      perAyah[a] = count;
    }
  }
  return perAyah;
}

function adapterNameOf(info) {
  const parts = [info.vendor, info.architecture, info.device].filter(Boolean);
  return info.description || parts.join(' ') || 'unnamed WebGPU adapter';
}

// A device, the documents uploaded once, and the compiled shader. Throws when any of it fails.
async function openGpu(gpu, table, program) {
  const timings = {};
  let started = now();
  // The default adapter (no powerPreference, so a laptop keeps its integrated GPU), else a compatibility-mode one, e.g.
  // on a phone whose GPU has only OpenGL ES: the shader needs nothing that mode leaves out, 3 storage buffers and
  // workgroups of 64.
  const core = await gpu.requestAdapter();
  const adapter = core ?? (await gpu.requestAdapter({ featureLevel: 'compatibility' }));
  if (!adapter) throw new Error('navigator.gpu.requestAdapter() gave no adapter');
  const info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {});
  // WebGPU's default limits hold the 3.2 MB of ayat many times over. Timestamp queries only serve
  // light(rootId, { timestamps: true }).
  let device;
  try {
    device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('timestamp-query') ? ['timestamp-query'] : [] });
  } catch {
    device = await adapter.requestDevice();
  }
  const state = { device, lost: undefined };
  device.lost.then((loss) => {
    state.lost = loss.message || loss.reason || 'the device was lost';
  });
  timings.deviceMs = now() - started;
  try {
    started = now();
    const { cellsPerInstance } = program.shader;
    const store = await createDocumentStore(device, cellsPerInstance, table.ayahCount);
    store.write(documentCells(table, cellsPerInstance), table.ayahCount);
    timings.uploadMs = now() - started;
    started = now();
    const runner = await createProgramRunner(device, program.shader, program.loop.sharedValues, store);
    timings.compileMs = now() - started;
    const name = `${adapterNameOf(info)}${core ? '' : ' (compatibility mode)'}`;
    return Object.assign(state, {
      store, runner, timings, adapterName: name,
      softwareAdapter: Boolean(info.isFallbackAdapter ?? adapter.isFallbackAdapter) || SOFTWARE_ADAPTER.test(name),
      timestamps: runner.hasTimestamps,
    });
  } catch (error) {
    device.destroy();
    throw error;
  }
}

async function countOnGpu(gpuState, program, table, rootId, timestamps) {
  const { runner } = gpuState;
  // The only upload: the selected root, one float of the shared table.
  runner.writeShared(Float32Array.of(rootId), program.selectedCell);
  const evaluation = await runner.evaluate({
    count: table.ayahCount,
    readbacks: [{ group: 0, firstDocument: 0, documentCount: table.ayahCount }],
    timestamps: timestamps && runner.hasTimestamps,
  });
  const perAyah = new Uint16Array(table.ayahCount);
  perAyah.set(evaluation.outputs[0]);
  return { perAyah, gpuMs: evaluation.waitMs, passMs: evaluation.passMs };
}

function firstDifference(left, right) {
  for (let k = 0; k < left.length; k++) if (left[k] !== right[k]) return k;
  return -1;
}

// ---- the page's entry

// Options, none needed by the page: `table` ({surahStart, ayahStart, roots, rootCount?} typed arrays a page already
// holds, instead of fetching data/roots-table.*); `backend` 'auto' (the default), 'webgpu' (throw instead of falling
// back) or 'cpu'; `gpu` in place of navigator.gpu (null for none); `dataUrl` and `fetch` for where the table comes
// from; and `selfCheck: false` to skip comparing the GPU's first run with the CPU's.
export async function createRootLight(options = {}) {
  const started = now();
  const want = options.backend ?? 'auto';
  const gpu = 'gpu' in options ? options.gpu : globalThis.navigator?.gpu;
  const table = options.table ? checkTable(options.table) : await loadRootsTable(options);
  const setup = { fetchMs: now() - started };
  let built = now();
  const program = buildRootLightProgram({ positions: table.longest, rootCount: table.rootCount });
  setup.buildMs = now() - built;

  let gpuState;
  let reason;
  const tryGpu = async () => {
    const opened = await openGpu(gpu, table, program);
    if (options.selfCheck !== false) {
      // One run for the commonest root, checked against the CPU's count. It also warms the pipeline, so the page's
      // first light() costs what later ones do.
      built = now();
      const { perAyah } = await countOnGpu(opened, program, table, table.commonest, false);
      opened.timings.firstRunMs = now() - built;
      const differs = firstDifference(perAyah, countOnCpu(table, table.commonest));
      if (differs >= 0) {
        opened.device.destroy();
        throw new Error(`the GPU's count for root ${table.commonest} differs from the CPU's at ayah index ${differs}`);
      }
    }
    return opened;
  };
  if (want === 'cpu') {
    reason = 'the cpu backend was asked for';
  } else if (!gpu) {
    reason = 'navigator.gpu is missing: this browser has no WebGPU';
  } else {
    try {
      gpuState = await tryGpu();
      Object.assign(setup, gpuState.timings);
    } catch (error) {
      reason = `WebGPU failed: ${error?.message ?? error}`;
    }
  }
  if (!gpuState && want === 'webgpu') throw new Error(reason);
  setup.totalMs = now() - started;
  for (const key of Object.keys(setup)) setup[key] = round(setup[key]);

  // After setup, a lost device (e.g. a GPU reset, or a phone that reclaimed it in the background) or a failed light()
  // gets one new device, at the next call. If that fails too, the CPU counts from then on and `reason` says why.
  let broken = false;
  let retried = false;
  let destroyed = false;
  const dropGpu = (why) => {
    if (gpuState && gpuState.lost === undefined) gpuState.device.destroy();
    gpuState = undefined;
    reason = why;
    broken = true;
  };
  // One light at a time: each waits for the one before it, and every call gets its own answer.
  let queue = Promise.resolve();

  async function lightNow(rootId, timestamps) {
    const begun = now();
    if (gpuState?.lost !== undefined) dropGpu(`the WebGPU device was lost (${gpuState.lost})`);
    if (!gpuState && broken && !retried) {
      retried = true;
      try {
        gpuState = await tryGpu();
        broken = false;
      } catch (error) {
        reason = `${reason}; a new WebGPU device failed too: ${error?.message ?? error}`;
      }
    }
    if (!gpuState && want === 'webgpu') throw new Error(reason);
    let perAyah;
    let gpuMs = 0;
    let passMs;
    let ran;
    if (gpuState) {
      try {
        ({ perAyah, gpuMs, passMs } = await countOnGpu(gpuState, program, table, rootId, timestamps));
        ran = gpuState;
      } catch (error) {
        if (want === 'webgpu') throw error;
        dropGpu(`WebGPU failed in light(): ${error?.message ?? error}`);
      }
    }
    if (!perAyah) perAyah = countOnCpu(table, rootId);
    const perSurah = sumSurahs(perAyah, table.surahStart);
    const result = { perAyah, perSurah, gpuMs: round(gpuMs), totalMs: round(now() - begun), backend: ran ? 'webgpu' : 'cpu' };
    if (ran) Object.assign(result, { adapterName: ran.adapterName, softwareAdapter: ran.softwareAdapter });
    if (passMs !== undefined) result.passMs = round(passMs);
    return result;
  }

  return {
    // 'webgpu' while the GPU counts. It turns to 'cpu' only if the device is lost or fails and a new one fails too.
    get backend() {
      return gpuState ? 'webgpu' : 'cpu';
    },
    // The WebGPU adapter that runs the count, e.g. 'apple metal-3', and whether it is a software one (e.g. SwiftShader:
    // WebGPU emulated on the CPU). Both undefined on 'cpu'.
    get adapterName() {
      return gpuState?.adapterName;
    },
    get softwareAdapter() {
      return gpuState?.softwareAdapter;
    },
    // Why the CPU counts, on 'cpu'.
    get reason() {
      return gpuState ? undefined : reason;
    },
    // perAyah[surahStart[s - 1] + a - 1] is ayah a of surah s; surahStart has 115 entries, the last is 6,236.
    surahStart: table.surahStart,
    ayahCount: table.ayahCount,
    rootCount: table.rootCount,
    // The program's size and the WGSL that Handwired wrote for it.
    program: { stages: program.stages, statements: program.shader.statementCount, wgsl: program.shader.code },
    // ms: fetching and checking the table, building the program, and on WebGPU getting the device, uploading the
    // ayat, compiling the shader and the first (checked) run.
    setup,
    // How many words of every ayah carry root `rootId` (1..rootCount; 0 lights nothing), and the totals per surah:
    // {perAyah: Uint16Array(6236), perSurah: Uint32Array(114), gpuMs, totalMs, backend}, new arrays on every call, plus
    // adapterName and softwareAdapter when `backend` is 'webgpu'. gpuMs is the GPU's part, from submitting the pass to
    // the counts being readable, and 0 on 'cpu'; totalMs is the whole call. With { timestamps: true }, an adapter with
    // timestamp queries also gives passMs, the compute pass alone, at the cost of a second readback.
    light(rootId, { timestamps = false } = {}) {
      if (destroyed) return Promise.reject(new Error('this root light was destroyed'));
      if (!Number.isInteger(rootId) || rootId < 0 || rootId > table.rootCount) {
        return Promise.reject(new RangeError(`rootId must be a whole number from 0 to ${table.rootCount}, got ${rootId}`));
      }
      const run = queue.then(() => lightNow(rootId, timestamps));
      queue = run.catch(() => {});
      return run;
    },
    // Frees the GPU's buffers and device once the calls already made have finished. light() rejects afterwards.
    destroy() {
      destroyed = true;
      return queue.then(() => {
        if (gpuState && gpuState.lost === undefined) {
          gpuState.runner.destroy();
          gpuState.store.destroy();
          gpuState.device.destroy();
        }
        gpuState = undefined;
        reason = 'destroyed';
      });
    },
  };
}
