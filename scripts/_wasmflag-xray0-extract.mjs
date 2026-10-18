// wasmflag xray0: 一次性提取(519MB 只 parse 一次) → /tmp/wasmflag-xray/extract.json
// 产出:线程表/事件名普查/主线程 X 事件/FunctionCall/rAF/ProfileChunk 全样本/worker X 事件
// run: node --max-old-space-size=16384 scripts/_wasmflag-xray0-extract.mjs [trace.json]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261003T214631.json'));
const OUTDIR = '/tmp/wasmflag-xray';
fs.mkdirSync(OUTDIR, { recursive: true });

console.log('parsing', SRC, (fs.statSync(SRC).size / 1048576).toFixed(0) + 'MB ...');
const t0 = Date.now();
const t = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log('parsed in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
const evs = t.traceEvents || [];
console.log('events:', evs.length);

// ---- 线程名 ----
const tidName = new Map();
for (const e of evs) {
  if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');
}
// ---- X 事件普查(按线程) ----
const census = new Map();   // pid:tid → name → [n, dur]
const procName = new Map();
for (const e of evs) {
  if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args?.name || '');
}
for (const e of evs) {
  if (e.ph !== 'X') continue;
  const k = e.pid + ':' + e.tid;
  let c = census.get(k); if (!c) census.set(k, c = {});
  let a = c[e.name]; if (!a) c[e.name] = a = [0, 0];
  a[0]++; a[1] += e.dur || 0;
}
// ---- 主线程甄别:CrRendererMain 中 X dur 最大的 ----
let MAIN = null;
for (const [k, c] of census) {
  if (tidName.get(k) !== 'CrRendererMain') continue;
  let dur = 0; for (const [, a] of Object.entries(c)) dur += a[1];
  if (!MAIN || dur > MAIN.dur) MAIN = { k, dur };
}
const [MPID, MTID] = MAIN.k.split(':').map(Number);
console.log('main thread:', MAIN.k, procName.get(MPID), 'X dur=' + (MAIN.dur / 1e6).toFixed(1) + 's');

// ---- Profile/ProfileChunk(★按 pid:id 键控:两个 renderer 的 id 命名空间独立会撞) ----
const profTid = new Map(); const profStart = new Map();
for (const e of evs) {
  if (e.name === 'Profile') { const k = e.pid + ':' + e.id; profTid.set(k, e.tid); profStart.set(k, e.args?.data?.startTime ?? e.ts); }
}
const chunksByProf = new Map();
const nodesByProf = new Map();     // profKey → Map(nodeId → [fn,url,line])
const parentByProf = new Map();    // profKey → Map(nodeId → parentId)
for (const e of evs) {
  if (e.name !== 'ProfileChunk') continue;
  const d = e.args?.data; if (!d) continue;
  const id = e.pid + ':' + e.id;
  if (!chunksByProf.has(id)) chunksByProf.set(id, []);
  chunksByProf.get(id).push({ ts: e.ts, s: d.cpuProfile?.samples || [], td: d.timeDeltas || [] });
  if (!nodesByProf.has(id)) { nodesByProf.set(id, new Map()); parentByProf.set(id, new Map()); }
  const nodes = nodesByProf.get(id), parentOf = parentByProf.get(id);
  for (const n of d.cpuProfile?.nodes || []) {
    if (!nodes.has(n.id)) {
      const cf = n.callFrame || {};
      nodes.set(n.id, [cf.functionName || '(anon)', cf.url || '', cf.lineNumber ?? -1]);
      if (n.parent != null) parentOf.set(n.id, typeof n.parent === 'object' ? n.parent.id : n.parent);
    }
  }
}
console.log('profiles:', [...profTid.entries()].map(([id, tid]) => id + '@tid' + tid + '(' + (chunksByProf.get(id)?.length || 0) + 'chunks)').join(', '));

// ---- 主线程事件导出 ----
const mainEvents = [];      // [name, ts, dur]
const mainFunc = [];        // [fn, url, line, ts, dur] (FunctionCall)
const rafs = [];            // FireAnimationFrame ts
let mainCount = 0;
const NATIVE_ONLY = new Set();
const wEvents = new Map();  // worker tid → {name:[n,dur]} 普查 + 全量[name,ts,dur]
const wasmFrames = [];      // profile 中 wasm 帧 [profId, ts, dur_ms, fn, url]
const otherX = new Map();   // 非主线程非 worker 的 X 普查(合并)

const profIdOfTid = new Map();
for (const [id, tid] of profTid) profIdOfTid.set(id.split(':')[1] + '@' + id.split(':')[0], tid);

for (const e of evs) {
  if (e.ph !== 'X' && e.name !== 'ProfileChunk' && e.name !== 'Profile') continue;
  const k = e.pid + ':' + e.tid;
  if (e.ph === 'X') {
    if (e.tid === MTID && e.pid === MPID) {
      mainCount++;
      mainEvents.push([e.name, e.ts, e.dur || 0]);
      if (e.name === 'FunctionCall') {
        const d = e.args?.data || {};
        mainFunc.push([d.functionName || '(anon)', String(d.url || ''), d.line_number ?? -1, e.ts, e.dur || 0]);
      } else if (e.name === 'FireAnimationFrame') {
        if (typeof e.ts === 'number' && Number.isFinite(e.ts)) rafs.push(e.ts);
      }
    } else if (tidName.get(k) === 'DedicatedWorker thread' || tidName.get(k) === 'ServiceWorker thread') {
      let w = wEvents.get(e.tid); if (!w) wEvents.set(e.tid, w = { census: {}, events: [] });
      let a = w.census[e.name]; if (!a) w.census[e.name] = a = [0, 0];
      a[0]++; a[1] += e.dur || 0;
      if (e.name === 'FunctionCall') {
        const d = e.args?.data || {};
        w.events.push(['F', d.functionName || '(anon)', String(d.url || ''), d.line_number ?? -1, e.ts, e.dur || 0]);
      } else {
        w.events.push([e.name, e.ts, e.dur || 0]);
      }
    } else {
      let a = otherX.get(e.name); if (!a) otherX.set(e.name, a = [0, 0]);
      a[0]++; a[1] += e.dur || 0;
    }
  }
}

// ---- profile 样本展开(ts 锚定),顺带收 wasm 帧 ----
const profOut = {};
for (const [id, tid] of profTid) {
  const chunks = (chunksByProf.get(id) || []).sort((a, b) => a.ts - b.ts);
  if (!chunks.length) continue;
  const nodes = nodesByProf.get(id) || new Map();
  const parentOf = parentByProf.get(id) || new Map();
  let clk = profStart.get(id) ?? chunks[0]?.ts ?? 0;
  const S = [], D = [], TS = [];
  for (const c of chunks) {
    for (let i = 0; i < c.s.length; i++) {
      const d = c.td[i] ?? 0;
      S.push(c.s[i]); D.push(d); TS.push(clk);
      clk += d;
    }
  }
  // wasm 帧样本
  let wasmUs = 0; const wasmFn = new Map();
  for (let i = 0; i < S.length; i++) {
    const node = nodes.get(S[i]);
    if (!node) continue;
    if (node[1].startsWith('wasm:')) {
      wasmUs += D[i];
      const key = node[0] + ' @' + node[1].slice(0, 60);
      wasmFn.set(key, (wasmFn.get(key) || 0) + D[i]);
    }
  }
  profOut[id] = { tid, nodes: [...nodes.entries()], parents: [...parentOf.entries()], S, D, TS, wasmUs, wasmFn: [...wasmFn.entries()] };
  console.log(`prof ${id} tid=${tid}: ${S.length} samples, span=${((TS[TS.length - 1] - TS[0]) / 1e6).toFixed(1)}s, wasmFrames=${(wasmUs / 1000).toFixed(0)}ms`);
}

// ---- 落盘 ----
const out = {
  src: SRC, mpid: MPID, mtid: MTID,
  threadNames: [...tidName.entries()], procNames: [...procName.entries()],
  censusMain: census.get(MAIN.k) || {},
  censusWorker: Object.fromEntries([...wEvents.entries()].map(([tid, w]) => [tid, w.census])),
  otherX: Object.fromEntries(otherX),
  mainEvents, mainFunc, rafs,
  workers: Object.fromEntries([...wEvents.entries()].map(([tid, w]) => [tid, w.events])),
  profTid: [...profTid.entries()],
  profs: profOut,
};
const outPath = path.join(OUTDIR, 'extract.json');
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('extract written:', outPath, (fs.statSync(outPath).size / 1048576).toFixed(1) + 'MB');
console.log('main X events:', mainCount, 'mainFunc:', mainFunc.length, 'raf:', rafs.length);
