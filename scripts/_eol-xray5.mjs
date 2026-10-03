// EoL xray5: worker 栈根身份鉴定 + 0x6 equipStats 风暴的调用源 + LightWorker/compositeLight 主线程面
// run: node --max-old-space-size=8192 scripts/_eol-xray5.mjs [trace.json]
import fs from 'node:fs';
const PATH = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261003T161320.json';
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
const MAIN_TID = 25363119, MPID = 97833, MAIN = MPID + ':' + MAIN_TID;

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
const fullOf = id => { const c = nodesAll.get(id) || {}; return (c.functionName || '(anon)') + '@' + (c.url || '?') + ':' + (c.lineNumber ?? '?'); };
function buildSamples(id) {
  const start = profStart.get(id); const arr = streamChunks.get(id) || [];
  let clk = start; const out = [];
  for (const c of arr) for (let i = 0; i < c.s.length; i++) { out.push({ ts: clk, nid: c.s[i], d: c.td[i] ?? 0 }); clk += (c.td[i] ?? 0); }
  return out;
}

// ---- 1. 每个 worker 流:busy 样本的栈根(向上走到没有 parent) ----
console.log('== 1. worker 栈根身份 ==');
for (const [id, tid] of profTid) {
  if (tid === MAIN_TID) continue;
  const ws = buildSamples(id);
  const roots = new Map();
  for (const { nid, d } of ws) {
    if (d <= 0) continue;
    const cf = nodesAll.get(nid) || {};
    if ((cf.functionName || '') === '(idle)') continue;
    let cur = nid, g = 0;
    while (parentOf.get(cur) != null && g++ < 40) cur = parentOf.get(cur);
    roots.set(cfOf(cur), (roots.get(cfOf(cur)) || 0) + d);
  }
  console.log(`-- ${id} tid=${tid} --`);
  for (const [k, v] of [...roots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5))
    console.log('    ' + (v / 1000).toFixed(0).padStart(6) + 'ms  root=' + k.slice(0, 140));
}

// ---- 2. 0x6: equipStatsKey 样本的调用链(深度4)与时间线 ----
for (const [id, tid] of profTid) {
  if (tid !== 25363890) continue;
  const ws = buildSamples(id);
  const chains = new Map();
  const perSecRoot = new Map();
  for (const { ts, nid, d } of ws) {
    if (d <= 0) continue;
    const cf = nodesAll.get(nid) || {};
    if ((cf.functionName || '') === '(idle)') continue;
    const chain = []; let cur = nid, g = 0;
    while (cur != null && g++ < 6) { chain.push(cfOf(cur)); cur = parentOf.get(cur); }
    const key = chain.join(' ← ');
    chains.set(key, (chains.get(key) || 0) + d);
  }
  console.log('\n== 2. 0x6 worker 调用链 top 10 ==');
  for (const [k, v] of [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 200));
}

// ---- 3. 主线程: compositeLight/finishAccFrame/lighting 面每秒曲线(与 presentBatch 对齐?) ----
const mainSamples = buildSamples([...profTid.entries()].find(([, tid]) => tid === MAIN_TID)?.[0]);
const rafs = evs.filter(e => e.ph === 'X' && e.name === 'FireAnimationFrame' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
const t0 = rafs[0].ts;
const marks = [
  ['presentBatch', /presentBatch/],
  ['finishAccFrame', /finishAccFrame/],
  ['compositeLight', /compositeLight/],
  ['drawProjGhosts', /drawProjGhosts/],
  ['subStepAI', /subStepAI/],
  ['drawCombatText', /drawCombatText/],
  ['processScan(光)', /processScan|compute@|blurLine|exportTo/],
  ['drawEmpress', /drawEmpress/],
  ['drawVanillaDustPass', /drawVanillaDustPass/],
];
const secAgg = new Map();
for (const { ts, nid, d } of mainSamples) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if ((cf.functionName || '') === '(idle)') continue;
  const k = Math.floor((ts - t0) / 1e6);
  let a = secAgg.get(k); if (!a) { a = {}; secAgg.set(k, a); }
  for (const [nm, re] of marks) if (re.test(cfOf(nid))) a[nm] = (a[nm] || 0) + d;
}
const names = marks.map(m => m[0]);
console.log('\n== 3. 主线程签名面每秒(ms) ==');
console.log('sec | ' + names.join(' | '));
for (const [s, a] of [...secAgg.entries()].sort((x, y) => x[0] - y[0])) {
  if (s > 32) continue;
  console.log(String(s).padStart(3) + ' | ' + names.map(n => String(Math.round((a[n] || 0) / 1000)).padStart(n.length)).join(' | '));
}

// ---- 4. 巨帧窗内 drawProjGhosts 相关样本占比 ----
const ticks = [];
for (const e of rafs) { if (!ticks.length || e.ts - ticks.at(-1) >= 4000) ticks.push(e.ts); }
const giant = [];
for (let i = 1; i < ticks.length; i++) { const gap = (ticks[i] - ticks[i - 1]) / 1000; if (gap > 100) giant.push({ t0: ticks[i - 1], t1: ticks[i], gap }); }
console.log('\n== 4. 巨帧窗内主线程签名面合计(ms / 占巨帧采样%) ==');
let gsum = 0; const gsig = new Map();
for (const { ts, nid, d } of mainSamples) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if ((cf.functionName || '') === '(idle)') continue;
  let lo = 0, hi = giant.length - 1, wi = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (giant[m].t1 <= ts) lo = m + 1; else if (giant[m].t0 > ts) hi = m - 1; else { wi = m; break; } }
  if (wi < 0) continue;
  gsum += d;
  for (const [nm, re] of marks) if (re.test(cfOf(nid))) gsig.set(nm, (gsig.get(nm) || 0) + d);
}
console.log('巨帧窗非 idle 采样合计:', (gsum / 1000).toFixed(0) + 'ms');
for (const [nm, v] of [...gsig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms ' + ((v / gsum) * 100).toFixed(1).padStart(5) + '%  ' + nm);
