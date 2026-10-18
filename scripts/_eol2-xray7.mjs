// EoL2 xray7: 慢帧vs战斗快帧 叶子函数级构成差(去污染) + 慢帧内调用链重锚(clearRect/drawImage 的 JS 父链)
// run: node --max-old-space-size=8192 scripts/_eol2-xray7.mjs [trace.json]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
const PATH = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261005T020627.json'));
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
const profTid = new Map(), profStart = new Map();
for (const e of evs) if (e.name === 'Profile') { profTid.set(e.id, e.tid); profStart.set(e.id, e.args?.data?.startTime || e.ts); }
const nodes = new Map(), parentOf = new Map();
const streamChunks = new Map();
for (const c of evs.filter(e => e.name === 'ProfileChunk')) {
  const d = c.args?.data; if (!d) continue;
  const P = c.id;
  for (const n of d.cpuProfile?.nodes || []) {
    const key = P + ':' + n.id;
    if (!nodes.has(key)) {
      nodes.set(key, n.callFrame || {});
      if (n.parent) parentOf.set(key, P + ':' + (typeof n.parent === 'object' ? n.parent.id : n.parent));
    }
  }
  let a = streamChunks.get(P); if (!a) { a = []; streamChunks.set(P, a); }
  a.push({ ts: c.ts, s: d.cpuProfile?.samples || [], td: d.timeDeltas || [] });
}
const cfOf = (P, id) => { const c = nodes.get(P + ':' + id) || {}; return (c.functionName || '(anon)') + '@' + String(c.url || '').split('/').pop() + ':' + (c.lineNumber ?? '?'); };
const fnOf = (P, id) => (nodes.get(P + ':' + id) || {}).functionName || '(anon)';
function buildSamples(P) {
  const arr = streamChunks.get(P) || [];
  let clk = profStart.get(P); const out = [];
  for (const c of arr) for (let i = 0; i < c.s.length; i++) { out.push({ ts: clk, nid: c.s[i], d: c.td[i] ?? 0 }); clk += (c.td[i] ?? 0); }
  return out;
}
const MPID = 2349, MAIN_TID = 28208914;
const pa = evs.filter(e => e.ph === 'X' && e.name === 'PageAnimator::serviceScriptedAnimations' && e.pid === MPID && e.tid === MAIN_TID).sort((a, b) => a.ts - b.ts);
const wins = [];
for (let i = 0; i + 1 < pa.length; i++) wins.push({ t0: pa[i].ts, t1: pa[i + 1].ts, gap: (pa[i + 1].ts - pa[i].ts) / 1000 });
const ms = buildSamples('0x7');
// 分箱(叶子级 + 父链级)
const binsLeaf = new Map(), binsChain = new Map();
let fi = 0;
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  if (fnOf('0x7', nid) === '(idle)') continue;
  while (fi < wins.length && ts >= wins[fi].t1) fi++;
  if (fi >= wins.length || ts < wins[fi].t0) continue;
  let b = binsLeaf.get(fi); if (!b) { b = new Map(); binsLeaf.set(fi, b); }
  b.set(cfOf('0x7', nid), (b.get(cfOf('0x7', nid)) || 0) + d);
  // 父链: 叶子向上 3 层
  let c2 = binsChain.get(fi); if (!c2) { c2 = new Map(); binsChain.set(fi, c2); }
  const chain = []; let cur = '0x7:' + nid, g = 0;
  while (cur != null && g++ < 4) { chain.push(cfOf('0x7', cur.split(':')[1])); cur = parentOf.get(cur); }
  c2.set(chain.join(' ← '), (c2.get(chain.join(' ← ')) || 0) + d);
}
const grpSlow = [], grpFast = [];
wins.forEach((w, i) => {
  const sec = (w.t0 - pa[0].ts) / 1e6;
  if (w.gap > 24) grpSlow.push(i);
  else if (w.gap > 9 && w.gap < 14.5 && sec > 2 && sec < 8.5) grpFast.push(i);
});
const agg = (map, list, keyMap) => {
  const m = new Map();
  for (const i of list) for (const [k, v] of (keyMap === 'leaf' ? binsLeaf : binsChain).get(i) || []) m.set(k, (m.get(k) || 0) + v);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const SL = agg(null, grpSlow, 'leaf'), FL = agg(null, grpFast, 'leaf');
console.log('慢帧', grpSlow.length, '帧 / 战斗快帧', grpFast.length, '帧');
console.log('\n== 叶子函数级: 慢帧 ms/帧 vs 快帧 ms/帧 (慢帧 top20) ==');
for (const [k, v] of SL.slice(0, 20)) {
  const perSlow = v / grpSlow.length / 1000, perFast = (new Map(FL).get(k) || 0) / grpFast.length / 1000;
  console.log((perSlow).toFixed(2).padStart(6) + ' vs' + perFast.toFixed(2).padStart(6) + '  ' + k.slice(0, 120));
}
// 慢帧里 clearRect/drawImage/(program) 的父链
console.log('\n== 慢帧内 clearRect/drawImage/(program) 叶子的 JS 父链(深度4, top10) ==');
const chainOfSlow = agg(null, grpSlow, 'chain');
const targets = ['clearRect', 'drawImage', '(program)', 'postMessage', 'texImage2D', 'getImageData'];
const seen = new Map();
for (const [k, v] of chainOfSlow) {
  const leaf = k.split(' ← ')[0];
  const base = targets.find(tt => leaf.startsWith(tt));
  if (!base) continue;
  seen.set(base + '|' + k, v);
}
const perBase = new Map();
for (const [k, v] of seen) { const base = k.split('|')[0]; perBase.set(base, (perBase.get(base) || 0) + v); }
console.log('基础叶子合计 ms/帧:', [...perBase.entries()].map(([b, v]) => b + ':' + (v / grpSlow.length / 1000).toFixed(2)).join('  '));
const bestPerBase = new Map();
for (const [k, v] of seen) { const base = k.split('|')[0]; if (!bestPerBase.has(base) || v > bestPerBase.get(base)[1]) bestPerBase.set(base, [k, v]); }
for (const [base, [k, v]] of bestPerBase) console.log('\n[' + base + '] ' + (v / grpSlow.length / 1000).toFixed(2) + 'ms/帧\n    ' + k.split(' ← ').slice(0, 4).join(' ← ').slice(0, 220));
