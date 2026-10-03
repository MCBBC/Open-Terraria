// EoL xray4: presentBatch 风暴定性(次数×单价) + 深层调用方链 + worker 脚本身份 + equipStats worker 定性
// run: node --max-old-space-size=8192 scripts/_eol-xray4.mjs [trace.json]
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
const chainOf = id => { // 完整祖先链(至多6层)
  const out = []; let cur = parentOf.get(id), g = 0;
  while (cur != null && g++ < 8) { const c = nodesAll.get(cur) || {}; out.push((c.functionName || '(anon)') + '@' + String(c.url || '').split('/').pop() + ':' + (c.lineNumber ?? '?')); cur = parentOf.get(cur); }
  return out;
};
function buildSamples(id) {
  const start = profStart.get(id); const arr = streamChunks.get(id) || [];
  let clk = start; const out = [];
  for (const c of arr) for (let i = 0; i < c.s.length; i++) { out.push({ ts: clk, nid: c.s[i], d: c.td[i] ?? 0 }); clk += (c.td[i] ?? 0); }
  return out;
}
let mainProfId = null; for (const [id, tid] of profTid) if (tid === MAIN_TID) mainProfId = id;

const rafs = evs.filter(e => e.ph === 'X' && e.name === 'FireAnimationFrame' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
const t0 = rafs[0].ts;

const mainSamples = buildSamples(mainProfId);
const cfOf = id => { const c = nodesAll.get(id) || {}; return (c.functionName || '(anon)') + '@' + String(c.url || '').split('/').pop() + ':' + (c.lineNumber ?? '?'); };

// ---- 1. drawImage⟵presentBatch:每秒样本数×均值(次数爆炸 vs 单价膨胀) ----
console.log('== 1. drawImage⟵presentBatch 每秒: 样本数(≈调用数) / 合计ms / 均值µs ==');
const pbSec = new Map();
for (const { ts, nid, d } of mainSamples) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if (cf.functionName !== 'drawImage') continue;
  const par = parentOf.get(nid);
  const pcf = par != null ? (nodesAll.get(par) || {}) : {};
  if ((pcf.functionName || '') !== 'presentBatch') continue;
  const k = Math.floor((ts - t0) / 1e6);
  let a = pbSec.get(k); if (!a) { a = { n: 0, sum: 0 }; pbSec.set(k, a); }
  a.n++; a.sum += d;
}
for (const [s, a] of [...pbSec.entries()].sort((x, y) => x[0] - y[0]))
  console.log(String(s).padStart(3), 'n=' + String(a.n).padStart(6), (a.sum / 1000).toFixed(0).padStart(5) + 'ms', 'avg=' + (a.sum / a.n).toFixed(0) + 'µs');

// ---- 2. drawImage⟵presentBatch 的深层调用方链 top ----
console.log('\n== 2. drawImage⟵presentBatch 上溯链 top 14 ==');
const chains = new Map();
for (const { nid, d } of mainSamples) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if (cf.functionName !== 'drawImage') continue;
  const ch = chainOf(nid).slice(0, 4).join(' ← ');
  chains.set(ch, (chains.get(ch) || 0) + d);
}
for (const [k, v] of [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14))
  console.log((v / 1000).toFixed(0).padStart(7) + 'ms  ' + k.slice(0, 170));

// ---- 3. presentBatch 自身样本(在栈上)每秒 = 每秒有 presentBatch 执行的采样数,以及其调用方 ----
console.log('\n== 3. presentBatch 栈上采样:谁在调用(父帧) top ==');
const pbCallers = new Map();
for (const { nid, d } of mainSamples) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if ((cf.functionName || '') !== 'presentBatch') continue;
  const ch = chainOf(nid).slice(0, 3).join(' ← ');
  pbCallers.set(ch, (pbCallers.get(ch) || 0) + d);
}
for (const [k, v] of [...pbCallers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log((v / 1000).toFixed(0).padStart(7) + 'ms  ' + k.slice(0, 170));

// ---- 4. worker 脚本身份 + top 节点全 URL ----
console.log('\n== 4. Worker 身份与热点(全 URL) ==');
const tidName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');
for (const [id, tid] of profTid) {
  if (tid === MAIN_TID) continue;
  const ws = buildSamples(id);
  const agg = new Map(); let busy = 0;
  for (const { nid, d } of ws) {
    if (d <= 0) continue;
    const cf = nodesAll.get(nid) || {};
    if ((cf.functionName || '') === '(idle)') continue;
    busy += d;
    const key = cfOf(nid);
    agg.set(key, (agg.get(key) || 0) + d);
  }
  console.log(`-- ${id} tid=${tid} ${tidName.get(MPID + ':' + tid)} busy=${(busy / 1000).toFixed(0)}ms --`);
  for (const [k, v] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log('    ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 160));
}

// ---- 5. equipStats worker(0x6) 每秒 busy + 主线程 equipStats 相关 ----
console.log('\n== 5. 主线程 equipStatsKey/equipStats 相关自耗时 ==');
const eqAgg = new Map();
for (const { ts, nid, d } of mainSamples) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  const n = cf.functionName || '';
  if (/equipStats/i.test(n) || /equipStats/i.test(cfOf(nid))) { const k = cfOf(nid) + ' ⟵ ' + chainOf(nid).slice(0, 2).join(' ← '); eqAgg.set(k, (eqAgg.get(k) || 0) + d); }
}
for (const [k, v] of [...eqAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log((v / 1000).toFixed(1).padStart(8) + 'ms  ' + k.slice(0, 160));

// ---- 6. 0x6 worker equipStatsKey 每秒 busy 曲线 ----
for (const [id, tid] of profTid) {
  if (tid !== 25363890) continue; // 0x6
  const ws = buildSamples(id);
  const perSec = new Map();
  for (const { ts, nid, d } of ws) {
    if (d <= 0) continue;
    const cf = nodesAll.get(nid) || {};
    if ((cf.functionName || '') === '(idle)') continue;
    const k = Math.floor((ts - t0) / 1e6);
    perSec.set(k, (perSec.get(k) || 0) + d);
  }
  const arr = [...perSec.entries()].sort((x, y) => x[0] - y[0]);
  console.log('\n0x6 worker busy 每秒(ms):', arr.map(([s, v]) => s + ':' + (v / 1000).toFixed(0)).join(' '));
}

// ---- 7. flush/degrade/bridge 家族主线程自耗时普查 ----
console.log('\n== 7. flush/degrade/bridge/ensure 家族主线程采样自耗 ==');
const famAgg = new Map();
for (const { nid, d } of mainSamples) {
  if (d <= 0) continue;
  const key = cfOf(nid);
  if (/flush|degrade|bridge|restack|replay2D|present/i.test(key)) famAgg.set(key, (famAgg.get(key) || 0) + d);
}
for (const [k, v] of [...famAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log((v / 1000).toFixed(1).padStart(8) + 'ms  ' + k.slice(0, 150));
