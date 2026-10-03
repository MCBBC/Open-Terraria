// EoL xray2 v2: 巨帧窗内拆解 —— per-sample 时间线(Profile.startTime+timeDeltas 累积)×JS调用方父链(prof5) + prof8 互证 + X/FunctionCall 聚合
// run: node --max-old-space-size=8192 scripts/_eol-xray2.mjs [trace.json]
import fs from 'node:fs';
const PATH = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261003T161320.json';
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
const MAIN_TID = 25363119, MPID = 97833;
const MAIN = MPID + ':' + MAIN_TID;

// ---- 帧窗重建(与 xray1 同法) ----
const rafs = evs.filter(e => e.ph === 'X' && e.name === 'FireAnimationFrame' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
const t0 = rafs[0].ts;
const ticks = [];
for (const e of rafs) { if (!ticks.length || e.ts - ticks.at(-1) >= 4000) ticks.push(e.ts); }
const giant = [];
for (let i = 1; i < ticks.length; i++) {
  const gap = (ticks[i] - ticks[i - 1]) / 1000;
  if (gap > 100) giant.push({ i, t0: ticks[i - 1], t1: ticks[i], gap, sec: (ticks[i - 1] - t0) / 1e6 });
}
console.log('巨帧窗:', giant.length, ' t0=', t0);

// ---- Profile 流映射 + 节点表 ----
const profTid = new Map(); const profStart = new Map();
for (const e of evs) if (e.name === 'Profile') { profTid.set(e.id, e.tid); profStart.set(e.id, e.args?.data?.startTime || e.ts); }
const tidName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');

const chunksAll = evs.filter(e => e.name === 'ProfileChunk');
const nodesAll = new Map(); const parentOf = new Map();
const streamChunks = new Map(); // id -> [{ts,s,td}] 按收序
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
console.log('== Profile 流 ==');
for (const [id, arr] of streamChunks) console.log(id, 'tid=' + profTid.get(id), '<' + (tidName.get(MPID + ':' + profTid.get(id)) || '?') + '>', 'chunks=' + arr.length);

const cfOf = id => { const c = nodesAll.get(id) || {}; return (c.functionName || '(anon)') + '@' + String(c.url || '').split('/').pop() + ':' + (c.lineNumber ?? '?'); };
const jsAncestor = id => {
  let cur = parentOf.get(id), g = 0;
  while (cur != null && g++ < 24) { const c = nodesAll.get(cur) || {}; if (c.url) return cfOf(cur); cur = parentOf.get(cur); }
  return '(none)';
};
const nodeName = id => cfOf(id);

// ---- per-sample 时间线:累积 td,从 Profile.startTime 起 ----
// 返回 [{ts, nid, delta}] (µs);窗归属用样本时刻
function buildSamples(id) {
  const start = profStart.get(id);
  const arr = streamChunks.get(id) || [];
  let clk = start; const out = [];
  for (const c of arr) { for (let i = 0; i < c.s.length; i++) { out.push({ ts: clk, nid: c.s[i], d: c.td[i] ?? 0 }); clk += (c.td[i] ?? 0); } }
  return out;
}
// 主线程流 = tid 匹配
let mainProfId = null;
for (const [id, tid] of profTid) if (tid === MAIN_TID) mainProfId = id;
console.log('主线程流:', mainProfId);
const mainSamples = buildSamples(mainProfId);
console.log('主线程样本:', mainSamples.length, '末样本时刻-窗起点偏移:', ((mainSamples.at(-1).ts - (t0 + 3.25e7)) / 1e3).toFixed(1) + 'ms(应接近 0)');

// ---- A. 全巨帧窗聚合(主线程):自耗时×JS调用方 + 窗时间线覆盖检查 ----
const perWin = new Map(); for (const k of giant.keys()) perWin.set(k, new Map());
const winSampled = new Array(giant.length).fill(0);
const winNative = new Map();
for (const { ts, nid, d } of mainSamples) {
  if (d <= 0) continue;
  // 巨帧窗:样本时刻 ∈ [w.t0, w.t1)
  let lo = 0, hi = giant.length - 1, wi = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (giant[m].t1 <= ts) lo = m + 1; else if (giant[m].t0 > ts) hi = m - 1; else { wi = m; break; } }
  if (wi < 0) continue;
  winSampled[wi] += d;
  const mm = perWin.get(wi);
  const key = nodeName(nid) + '  ⟵ ' + jsAncestor(nid);
  mm.set(key, (mm.get(key) || 0) + d);
  if (d > 8000) winNative.set(nodeName(nid), (winNative.get(nodeName(nid)) || 0) + d);
}
const gTotal = new Map();
for (const [, m] of perWin) for (const [k, v] of m) gTotal.set(k, (gTotal.get(k) || 0) + v);
const gSum = [...gTotal.values()].reduce((a, b) => a + b, 0);
console.log('\n== A. 全部巨帧窗合计 采样覆盖:', (gSum / 1000).toFixed(0) + 'ms / 窗总宽', giant.reduce((a, w) => a + w.gap, 0).toFixed(0) + 'ms ==');
for (const [k, v] of [...gTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 32))
  console.log((v / 1000).toFixed(0).padStart(7) + 'ms  ' + k.slice(0, 155));

console.log('\n== A2. 巨帧窗内 >8ms 连续采样段(按节点, prof8 直扫互证) ==');
for (const [k, v] of [...winNative.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log((v / 1000).toFixed(0).padStart(7) + 'ms  ' + k.slice(0, 140));

// ---- B. 代表性巨帧逐窗 top8 ----
const sortedW = [...giant.entries()].sort((a, b) => b[1].gap - a[1].gap);
const pickSet = [];
const seen = new Set();
for (const c of [sortedW[0], sortedW[1], sortedW[2], sortedW[Math.floor(sortedW.length / 2)], sortedW[sortedW.length - 1]]) if (c && !seen.has(c[0])) { seen.add(c[0]); pickSet.push(c); }
console.log('\n== B. 代表性巨帧逐窗(含采样覆盖率) ==');
for (const [wi, w] of pickSet) {
  console.log(`--- 巨帧 #${wi} @ ${w.sec.toFixed(2)}s gap=${w.gap.toFixed(0)}ms 采样=${(winSampled[wi] / 1000).toFixed(0)}ms ---`);
  const m = perWin.get(wi);
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8))
    console.log('   ' + (v / 1000).toFixed(0).padStart(5) + 'ms  ' + k.slice(0, 140));
}

// ---- C. 巨帧窗内 X 事件聚合(排除包装名) ----
const WRAP = new Set(['RunTask', 'v8.callFunction', 'FunctionCall', 'FireAnimationFrame', 'PageAnimator::serviceScriptedAnimations', 'v8::Debugger::AsyncTaskRun', 'ThreadControllerImpl::RunTask', 'TaskQueueManager::ProcessTaskFromWorkQueue', 'V8.StackGuard', 'V8.HandleInterrupts']);
const xAgg = new Map();
for (const e of evs) {
  if (e.ph !== 'X' || e.pid + ':' + e.tid !== MAIN) continue;
  if (WRAP.has(e.name)) continue;
  if ((e.dur || 0) <= 300) continue;
  let lo = 0, hi = giant.length - 1, wi = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (giant[m].t1 <= e.ts) lo = m + 1; else if (giant[m].t0 > e.ts) hi = m - 1; else { wi = m; break; } }
  if (wi < 0) continue;
  let a = xAgg.get(e.name);
  if (!a) { a = { n: 0, dur: 0, max: 0 }; xAgg.set(e.name, a); }
  a.n++; a.dur += e.dur; a.max = Math.max(a.max, e.dur);
}
console.log('\n== C. 巨帧窗内 X 事件聚合(排除包装, dur>300µs) ==');
for (const [k, a] of [...xAgg.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 25))
  console.log((a.dur / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(5) + ' max=' + (a.max / 1000).toFixed(0) + 'ms  ' + k.slice(0, 80));

// ---- D. 巨帧窗内 FunctionCall 聚合 ----
const fnAgg = new Map();
for (const e of evs) {
  if (e.ph !== 'X' || e.pid + ':' + e.tid !== MAIN || e.name !== 'FunctionCall') continue;
  let lo = 0, hi = giant.length - 1, wi = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (giant[m].t1 <= e.ts) lo = m + 1; else if (giant[m].t0 > e.ts) hi = m - 1; else { wi = m; break; } }
  if (wi < 0) continue;
  const d = e.args?.data || {};
  const key = (d.functionName || '(anon)') + ' @' + String(d.url || '').split('/').pop() + ':' + (d.line_number ?? '?');
  fnAgg.set(key, (fnAgg.get(key) || 0) + (e.dur || 0));
}
console.log('\n== D. 巨帧窗内 FunctionCall 聚合 top 30 ==');
for (const [k, v] of [...fnAgg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30))
  console.log((v / 1000).toFixed(0).padStart(7) + 'ms  ' + k.slice(0, 150));

// ---- E. Worker 流在巨帧窗内的自耗时(资源竞争面) ----
console.log('\n== E. Worker 流巨帧窗内自耗时合计 ==');
for (const [id, tid] of profTid) {
  if (tid === MAIN_TID) continue;
  const tn = tidName.get(MPID + ':' + tid) || '?';
  const ws = buildSamples(id);
  let g = 0, all = 0;
  for (const { ts, d } of ws) {
    if (d <= 0) continue; all += d;
    let lo = 0, hi = giant.length - 1, wi = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (giant[m].t1 <= ts) lo = m + 1; else if (giant[m].t0 > ts) hi = m - 1; else { wi = m; break; } }
    if (wi >= 0) g += d;
  }
  console.log(id, tn.slice(0, 30), '全程自耗=' + (all / 1000).toFixed(0) + 'ms', '巨帧窗内=' + (g / 1000).toFixed(0) + 'ms');
}
