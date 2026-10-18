// EoL xray3: 全局热点排序 —— 主线程自耗时×父链(prof5) + prof8 互证 + drawImage 采样统计 +
//             worker busy(剔除 idle) + GPU 进程侧 + 每秒曲线(fps/presentBatch 自耗)
// run: node --max-old-space-size=8192 scripts/_eol-xray3.mjs [trace.json]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
const PATH = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261003T161320.json'));
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
const MAIN_TID = 25363119, MPID = 97833, MAIN = MPID + ':' + MAIN_TID;
const GPUTID = 42704, GPID = 7688;

// ---- Profile 流映射 ----
const profTid = new Map(); const profStart = new Map();
for (const e of evs) if (e.name === 'Profile') { profTid.set(e.id, e.tid); profStart.set(e.id, e.args?.data?.startTime || e.ts); }
const chunksAll = evs.filter(e => e.name === 'ProfileChunk');
const nodesAll = new Map(); const parentOf = new Map();
const streamChunks = new Map();
for (const c of chunksAll) {
  const d = c.args?.data; if (!d) continue;
  const cp = d.cpuProfile || {};
  for (const n of cp.nodes || []) if (!nodesAll.has(n.id)) {
    nodesAll.set(n.id, n.callFrame || {});
    if (n.parent) parentOf.set(n.id, typeof n.parent === 'object' ? n.parent.id : n.parent);
  }
  let a = streamChunks.get(c.id); if (!a) { a = []; streamChunks.set(c.id, a); }
  a.push({ ts: c.ts, s: cp.samples || [], td: d.timeDeltas || [] });
}
const cfOf = id => { const c = nodesAll.get(id) || {}; return (c.functionName || '(anon)') + '@' + String(c.url || '').split('/').pop() + ':' + (c.lineNumber ?? '?'); };
const jsAncestor = id => { let cur = parentOf.get(id), g = 0; while (cur != null && g++ < 24) { const c = nodesAll.get(cur) || {}; if (c.url) return cfOf(cur); cur = parentOf.get(cur); } return '(none)'; };
function buildSamples(id) {
  const start = profStart.get(id); const arr = streamChunks.get(id) || [];
  let clk = start; const out = [];
  for (const c of arr) for (let i = 0; i < c.s.length; i++) { out.push({ ts: clk, nid: c.s[i], d: c.td[i] ?? 0 }); clk += (c.td[i] ?? 0); }
  return out;
}
let mainProfId = null; for (const [id, tid] of profTid) if (tid === MAIN_TID) mainProfId = id;

// ---- 帧窗重建 ----
const rafs = evs.filter(e => e.ph === 'X' && e.name === 'FireAnimationFrame' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
const t0 = rafs[0].ts;
const ticks = [];
for (const e of rafs) { if (!ticks.length || e.ts - ticks.at(-1) >= 4000) ticks.push(e.ts); }
const gaps = [];
for (let i = 1; i < ticks.length; i++) gaps.push((ticks[i] - ticks[i - 1]) / 1000);

// ---- 1. 主线程全 trace 自耗时×父链 top(prof5) ----
const mainSamples = buildSamples(mainProfId);
const selfAgg = new Map();
for (const { nid, d } of mainSamples) { if (d <= 0) continue; const key = cfOf(nid) + '  ⟵ ' + jsAncestor(nid); selfAgg.set(key, (selfAgg.get(key) || 0) + d); }
const totalSelf = [...selfAgg.values()].reduce((a, b) => a + b, 0);
console.log('== 1. 主线程全 trace 自耗时×JS调用方 top 36(prof5) ==  采样总覆盖=' + (totalSelf / 1000).toFixed(0) + 'ms');
for (const [k, v] of [...selfAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 36))
  console.log((v / 1000).toFixed(0).padStart(7) + 'ms ' + ((v / totalSelf) * 100).toFixed(1).padStart(5) + '%  ' + k.slice(0, 150));

// ---- 2. prof8 互证:全 trace >8ms 连续段 ----
console.log('\n== 2. prof8 互证:主线程 >8ms 连续采样段 top ==');
const runs = new Map();
let allBig = [];
for (const { ts, nid, d } of mainSamples) if (d > 8000) { allBig.push({ ts, d, f: cfOf(nid) }); runs.set(cfOf(nid), (runs.get(cfOf(nid)) || 0) + d); }
for (const [k, v] of [...runs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 130));
allBig.sort((a, b) => b.d - a.d);
console.log('   最大段明细:', allBig.slice(0, 6).map(x => `${((x.ts - t0) / 1e6).toFixed(1)}s ${x.d / 1000 | 0}ms ${x.f.slice(0, 60)}`).join(' | '));

// ---- 3. drawImage⟵presentBatch 每秒曲线 + 采样统计 ----
const PB = 'drawImage@:?';
const perSec = new Map(); // sec -> {pb, js, idle, frames, gapSum}
let pbN = 0, pbSum = 0;
const pbDeltas = [];
for (const { ts, nid, d } of mainSamples) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if (cf.functionName === 'drawImage') {
    const par = jsAncestor(nid);
    if (par.startsWith('presentBatch')) { pbN++; pbSum += d; pbDeltas.push(d); const k = Math.floor((ts - t0) / 1e6); let a = perSec.get(k); if (!a) { a = { pb: 0, frames: 0 }; perSec.set(k, a); } a.pb += d; }
  }
}
pbDeltas.sort((a, b) => a - b);
console.log('\n== 3. drawImage⟵presentBatch 采样统计 ==');
console.log('样本数', pbN, '合计', (pbSum / 1000).toFixed(0) + 'ms', '均值', (pbSum / Math.max(pbN, 1)).toFixed(0) + 'µs', 'p50', pbDeltas[Math.floor(pbDeltas.length * .5)], 'p95', pbDeltas[Math.floor(pbDeltas.length * .95)], 'max', pbDeltas.at(-1), 'µs');
// tick 每秒
const tickPerSec = new Map();
for (const tk of ticks) { const k = Math.floor((tk - t0) / 1e6); tickPerSec.set(k, (tickPerSec.get(k) || 0) + 1); }
console.log('\nsec | fps | presentBatch回贴自耗ms');
for (let s = 0; s < Math.ceil((ticks.at(-1) - t0) / 1e6); s++) {
  const f = tickPerSec.get(s) || 0; const pb = ((perSec.get(s)?.pb || 0) / 1000).toFixed(0);
  if (s % 1 === 0) console.log(String(s).padStart(3), String(f).padStart(4), pb.padStart(7));
}

// ---- 4. worker busy(剔除 idle) ----
console.log('\n== 4. Worker busy(自耗剔除 idle, ms) ==');
const tidName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');
for (const [id, tid] of profTid) {
  if (tid === MAIN_TID) continue;
  const ws = buildSamples(id);
  const agg = new Map(); let busy = 0, span = 0;
  for (const { nid, d } of ws) { if (d <= 0) continue; span += d; const cf = nodesAll.get(nid) || {}; const n = cf.functionName || '(anon)'; if (n === '(idle)') continue; busy += d; const key = n + ' ⟵ ' + jsAncestor(nid); agg.set(key, (agg.get(key) || 0) + d); }
  console.log(`-- ${id} ${tidName.get(MPID + ':' + tid)} busy=${(busy / 1000).toFixed(0)}ms / span=${(span / 1000).toFixed(0)}ms (${(busy / span * 100).toFixed(0)}%) --`);
  for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log('    ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 130));
}

// ---- 5. GPU 进程 CrGpuMain 自耗时 top ----
console.log('\n== 5. GPU CrGpuMain X 事件聚合 top 20 ==');
const gpuAgg = new Map();
for (const e of evs) {
  if (e.ph !== 'X' || e.pid !== GPID || e.tid !== GPUTID) continue;
  let a = gpuAgg.get(e.name); if (!a) { a = { n: 0, dur: 0, max: 0 }; gpuAgg.set(e.name, a); }
  a.n++; a.dur += e.dur || 0; a.max = Math.max(a.max, e.dur || 0);
}
for (const [k, a] of [...gpuAgg.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 20))
  console.log((a.dur / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(7) + ' max=' + (a.max / 1000).toFixed(1) + 'ms  ' + k.slice(0, 90));

// ---- 6. 帧循环 JS 工作量曲线(FireAnimationFrame dur 每秒 p50/sum) ----
console.log('\n== 6. FireAnimationFrame 主线程 dur 每秒: n / sum / p50 ==');
const rafPerSec = new Map();
for (const e of rafs) { const k = Math.floor((e.ts - t0) / 1e6); let a = rafPerSec.get(k); if (!a) { a = { n: 0, ds: [] }; rafPerSec.set(k, a); } a.n++; a.ds.push(e.dur || 0); }
for (const [s, a] of [...rafPerSec.entries()].sort((x, y) => x[0] - y[0])) {
  a.ds.sort((p, q) => p - q);
  console.log(String(s).padStart(3), 'n=' + String(a.n).padStart(4), 'sum=' + (a.ds.reduce((p, q) => p + q, 0) / 1000).toFixed(0).padStart(5) + 'ms', 'p50=' + (a.ds[Math.floor(a.n / 2)] / 1000).toFixed(1) + 'ms');
}
