// EoL2 xray6: 逐帧分箱(去污染) 慢帧vs健康帧构成差 + GPU线程忙曲线 + 30fps段帧级明细
// run: node --max-old-space-size=8192 scripts/_eol2-xray6.mjs [trace.json]
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
for (let i = 0; i + 1 < pa.length; i++) wins.push({ t0: pa[i].ts, t1: pa[i + 1].ts, gap: (pa[i + 1].ts - pa[i].ts) / 1000, dur: pa[i].dur / 1000 });

const CATS = [
  ['texRegion(flushAcc域)', /texFromRegion|resolveTex|flushAcc|evictLRU|texFromImage|texReady|tintedTex|texImage2D/],
  ['empressGhost(残影烘焙)', /paintGhost|tintedSprite|drawEmpress|bake@|Ghost/],
  ['projGhosts', /drawProjGhosts|drawOnce/],
  ['c10e', /c10e/i],
  ['liquids', /[Ll]iquid|waterfall|Wave|sweep|buildStarBatch/],
  ['dust', /[Dd]ust/],
  ['light', /[Ll]ight(?!ning)/],
  ['GC', /garbage|GC/],
  ['rAF/glue', /requestAnimationFrame|program/],
  ['ui/text', /font|Text|overlay|UI|ui/],
];
const catOf = fn => { for (const [nm, re] of CATS) if (re.test(fn)) return nm; return 'other-js'; };
const bins = new Map();
const ms = buildSamples('0x7');
let fi = 0;
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  if (fnOf('0x7', nid) === '(idle)') continue;
  while (fi < wins.length && ts >= wins[fi].t1) fi++;
  if (fi >= wins.length || ts < wins[fi].t0) continue;
  let b = bins.get(fi); if (!b) { b = new Map(); bins.set(fi, b); }
  const c = catOf(cfOf('0x7', nid));
  b.set(c, (b.get(c) || 0) + d);
}
const grpSlow = [], grpFastFight = [], grpCalm = [];
wins.forEach((w, i) => {
  const sec = (w.t0 - pa[0].ts) / 1e6;
  if (w.gap > 24) grpSlow.push(i);
  else if (sec < 8.5) grpFastFight.push(i);
  else grpCalm.push(i);
});
const agg = list => {
  const m = new Map();
  for (const i of list) for (const [k, v] of bins.get(i) || []) m.set(k, (m.get(k) || 0) + v);
  const out = {}; let tot = 0;
  for (const [k, v] of m) { out[k] = v / list.length / 1000; tot += v; }
  out.__total = tot / list.length / 1000;
  return out;
};
const S = agg(grpSlow), F = agg(grpFastFight), C = agg(grpCalm);
console.log('组: 慢帧' + grpSlow.length + '帧 / 战斗快帧' + grpFastFight.length + ' / 平静帧' + grpCalm.length);
console.log('\n== 帧均值构成(ms/帧) ==');
console.log('类别'.padEnd(24), '慢帧  战斗快帧  平静帧');
for (const k of [...new Set([...Object.keys(S), ...Object.keys(F), ...Object.keys(C)])].filter(k => k !== '__total')) {
  console.log(k.padEnd(24), (S[k] || 0).toFixed(2).padStart(5), (F[k] || 0).toFixed(2).padStart(7), (C[k] || 0).toFixed(2).padStart(7));
}
console.log('__total'.padEnd(24), S.__total.toFixed(2).padStart(5), F.__total.toFixed(2).padStart(7), C.__total.toFixed(2).padStart(7));

// 慢帧 top5 函数明细(头3帧)
console.log('\n== 30fps段逐帧明细(gap>28ms 前6帧 top5函数) ==');
let shown = 0;
for (let i = 0; i < wins.length && shown < 6; i++) {
  if (wins[i].gap <= 28) continue;
  shown++;
  const b = [...(bins.get(i) || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('  @' + ((wins[i].t0 - pa[0].ts) / 1e6).toFixed(2) + 's gap=' + wins[i].gap.toFixed(1) + 'ms dur=' + wins[i].dur.toFixed(1) + 'ms | ' + b.map(([k, v]) => k + ':' + (v / 1000).toFixed(1)).join(' | '));
}

// GPU 线程忙曲线与 top 任务
const GTID = 42704, GPID = 7688;
const gx = evs.filter(e => e.ph === 'X' && e.pid === GPID && e.tid === GTID);
let tmin = Infinity, tmax = 0;
for (const e of evs) if (typeof e.ts === 'number' && e.ts > 0) { if (e.ts < tmin) tmin = e.ts; if (e.ts > tmax) tmax = e.ts; }
const gsec = new Map(); const gname = new Map();
for (const e of gx) {
  const k = Math.floor((e.ts - tmin) / 1e6);
  gsec.set(k, (gsec.get(k) || 0) + (e.dur || 0));
  let a = gname.get(e.name); if (!a) { a = { n: 0, dur: 0 }; gname.set(e.name, a); }
  a.n++; a.dur += e.dur || 0;
}
console.log('\n== GPU线程(CrGpuMain) 每秒忙(ms/s) ==');
console.log([...gsec.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => s + ':' + Math.round(v / 1000)).join(' '));
console.log('\n== GPU线程 top12 任务 ==');
for (const [n, a] of [...gname.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 12))
  console.log('  ' + (a.dur / 1000).toFixed(0).padStart(6) + 'ms n=' + String(a.n).padStart(6) + ' ' + n.slice(0, 90));
