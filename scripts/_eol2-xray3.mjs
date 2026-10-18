// EoL2 xray3: 逐慢帧分箱归因 + worker 深栈与每秒忙曲线
// run: node --max-old-space-size=8192 scripts/_eol2-xray3.mjs [trace.json]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
const PATH = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261005T020627.json'));
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
const MAIN_ID = '0x7';
const profTid = new Map(), profStart = new Map();
for (const e of evs) if (e.name === 'Profile') { profTid.set(e.id, e.tid); profStart.set(e.id, e.args?.data?.startTime || e.ts); }
const nodesAll = new Map(), parentOf = new Map();
const streamChunks = new Map();
for (const c of evs.filter(e => e.name === 'ProfileChunk')) {
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
function buildSamples(id) {
  const arr = streamChunks.get(id) || [];
  let clk = profStart.get(id); const out = [];
  for (const c of arr) for (let i = 0; i < c.s.length; i++) { out.push({ ts: clk, nid: c.s[i], d: c.td[i] ?? 0 }); clk += (c.td[i] ?? 0); }
  return out;
}
const MPID = 2349, MAIN_TID = 28208914, MAIN = MPID + ':' + MAIN_TID;
const pa = evs.filter(e => e.ph === 'X' && e.name === 'PageAnimator::serviceScriptedAnimations' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
const ms = buildSamples(MAIN_ID);

// 1. 逐帧分箱: PageAnimator 窗(用 gap 归属: 慢帧=帧后即长 gap)
// 帧窗 = [pa[i].ts, pa[i+1].ts); gap_i = pa[i+1]-pa[i] 是该帧后被拉长的间隔 → 慢帧工作主要在 [pa[i].ts, pa[i+1].ts)
const wins = [];
for (let i = 0; i + 1 < pa.length; i++) {
  const gap = (pa[i + 1].ts - pa[i].ts) / 1000;
  wins.push({ t0: pa[i].ts, t1: pa[i + 1].ts, gap, dur: pa[i].dur / 1000 });
}
const bins = new Map(); // frameIdx -> Map(fn -> ms)
let fi = 0;
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if ((cf.functionName || '') === '(idle)') continue;
  while (fi < wins.length && ts >= wins[fi].t1) fi++;
  if (fi >= wins.length) break;
  if (ts < wins[fi].t0) continue;
  let b = bins.get(fi); if (!b) { b = new Map(); bins.set(fi, b); }
  b.set(cfOf(nid), (b.get(cfOf(nid)) || 0) + d);
}
// 慢帧 = gap>24ms;健康帧 = gap 9-14ms
const slowIdx = [], okIdx = [];
wins.forEach((w, i) => { if (w.gap > 24) slowIdx.push(i); else if (w.gap > 9 && w.gap < 14.5) okIdx.push(i); });
console.log('慢帧(>24ms gap):', slowIdx.length, ' 健康帧(9-14.5):', okIdx.length);
const agg = list => {
  const m = new Map(); let tot = 0, frameN = list.length;
  for (const i of list) for (const [k, v] of bins.get(i) || []) { m.set(k, (m.get(k) || 0) + v); tot += v; }
  return { m, tot: tot / (frameN || 1) };
};
const S = agg(slowIdx), O = agg(okIdx);
console.log('\n== 慢帧均值构成(ms/帧, top18) vs 健康帧均值 ==');
for (const [k, v] of [...S.m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) {
  const perSlow = v / slowIdx.length, perOk = (O.m.get(k) || 0) / okIdx.length;
  console.log((perSlow).toFixed(2).padStart(6) + 'ms/帧 (健康' + perOk.toFixed(2) + ')  ' + k.slice(0, 110));
}
console.log('慢帧总work/帧:', (S.tot / slowIdx.length).toFixed(1) + 'ms  健康帧总work/帧:', (O.tot / okIdx.length).toFixed(1) + 'ms');

// 2. worker 深栈(深度4)与每秒忙曲线
console.log('\n== worker 深栈(非 idle 样本, 深度4 链 top6) ==');
for (const [id, tid] of profTid) {
  if (id === MAIN_ID) continue;
  const ws = buildSamples(id);
  const chains = new Map(); const secBusy = new Map(); let busy = 0;
  for (const { ts, nid, d } of ws) {
    if (d <= 0) continue;
    const cf = nodesAll.get(nid) || {};
    if ((cf.functionName || '') === '(idle)' || (cf.functionName || '') === '(root)') { continue; }
    busy += d;
    const k = Math.floor((ts - profStart.get(id)) / 1e6);
    secBusy.set(k, (secBusy.get(k) || 0) + d);
    const chain = []; let cur = nid, g = 0;
    while (cur != null && g++ < 4) { chain.push(cfOf(cur)); cur = parentOf.get(cur); }
    const key = chain.join(' ← ');
    chains.set(key, (chains.get(key) || 0) + d);
  }
  console.log(`-- ${id} tid=${tid} busy=${(busy / 1000).toFixed(0)}ms --`);
  for (const [k, v] of [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6))
    console.log('    ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 240));
  const curve = [...secBusy.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => s + ':' + Math.round(v / 1000)).join(' ');
  console.log('    忙曲线 ms/s:', curve.slice(0, 400));
}

// 3. 主线程 GC 面与 postMessage 去向(慢帧窗内)
console.log('\n== 慢帧窗(5.0-6.8s) GC/其他归并 ==');
const t0 = ms[0].ts;
const misc = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  const sec = (ts - t0) / 1e6;
  if (sec < 5.0 || sec > 6.8) continue;
  const cf = nodesAll.get(nid) || {};
  const fn = cf.functionName || '(anon)';
  let cat = '其他';
  if (/garbage collector|GC|allocate|Allocate/.test(fn)) cat = 'GC/分配';
  else if (/clearRect|drawImage|texFromRegion|resolveTex|flushAcc|evictLRU|tintedTex|texReady|createPattern|putImageData|getImageData/.test(fn)) cat = 'canvas2D纹理面';
  else if (/bake|paintGhost|tintedSprite|drawEmpress/.test(fn)) cat = 'drawEmpress烘焙';
  else if (/drawProjGhosts|drawOnce|ghost/.test(fn)) cat = 'projGhost';
  else if (/postMessage|send|compute|tickLighting/.test(fn)) cat = 'worker通信/光照';
  else if (/c10e/.test(fn)) cat = 'c10eComposite';
  misc.set(cat, (misc.get(cat) || 0) + d);
}
for (const [k, v] of [...misc.entries()].sort((a, b) => b[1] - a[1]))
  console.log('  ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + ((v / 1830) * 100).toFixed(1).padStart(5) + '%  ' + k);
