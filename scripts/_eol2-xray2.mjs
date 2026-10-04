// EoL2 xray2: 主线程 Profile(0x7) 自耗时归因 + 慢帧窗差分 + prof8 直扫防伪 + worker 身份
// run: node --max-old-space-size=8192 scripts/_eol2-xray2.mjs [trace.json]
import fs from 'node:fs';
const PATH = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261005T020627.json';
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];

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
const MAIN_ID = '0x7';
const ms = buildSamples(MAIN_ID);
console.log('main samples:', ms.length, 'span:', ((ms.at(-1).ts - ms[0].ts) / 1e6).toFixed(2) + 's');
const t0 = ms[0].ts;

// 1. 自耗时 per 函数(全窗 + 慢帧窗 5.2-6.7s vs 健康窗 11-13.4s 差分)
const SLOW0 = 5.0, SLOW1 = 6.8, OK0 = 11.0, OK1 = 13.4;
const selfAll = new Map(), selfSlow = new Map(), selfOk = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0 || d > 60000) continue; // >60ms 的 delta 归为 profiler 断档
  const cf = nodesAll.get(nid) || {};
  if ((cf.functionName || '') === '(idle)') continue;
  const k = cfOf(nid);
  selfAll.set(k, (selfAll.get(k) || 0) + d);
  const sec = (ts - t0) / 1e6;
  if (sec >= SLOW0 && sec <= SLOW1) selfSlow.set(k, (selfSlow.get(k) || 0) + d);
  if (sec >= OK0 && sec <= OK1) selfOk.set(k, (selfOk.get(k) || 0) + d);
}
console.log('\n== 全窗自耗时 top 25 ==');
for (const [k, v] of [...selfAll.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 130));
console.log('\n== 慢帧窗 5.0-6.8s 自耗时 top 20 ==');
const slowSum = [...selfSlow.values()].reduce((a, b) => a + b, 0);
console.log('窗内非 idle 采样:', (slowSum / 1000).toFixed(0) + 'ms / 1.8s窗');
for (const [k, v] of [...selfSlow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + ((v / slowSum) * 100).toFixed(1).padStart(5) + '%  ' + k.slice(0, 120));
console.log('\n== 健康窗 11-13.4s 自耗时 top 20 ==');
const okSum = [...selfOk.values()].reduce((a, b) => a + b, 0);
console.log('窗内非 idle 采样:', (okSum / 1000).toFixed(0) + 'ms / 2.4s窗');
for (const [k, v] of [...selfOk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 120));

// 2. 慢帧窗调用链(对 top 自耗函数向上 4 层)
console.log('\n== 慢帧窗 top 函数的父链(样本加权, top6 函数 × 各 top2 链) ==');
const slowTopFns = new Set([...selfSlow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(e => e[0]));
const chainAgg = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  const sec = (ts - t0) / 1e6;
  if (sec < SLOW0 || sec > SLOW1) continue;
  const k = cfOf(nid);
  if (!slowTopFns.has(k)) continue;
  const chain = []; let cur = nid, g = 0;
  while (cur != null && g++ < 5) { chain.push(cfOf(cur)); cur = parentOf.get(cur); }
  const key = k + '\n      ← ' + chain.slice(1).join(' ← ');
  chainAgg.set(key, (chainAgg.get(key) || 0) + d);
}
const byFn = new Map();
for (const [k, v] of chainAgg) { const fn = k.split('\n')[0]; if (!byFn.has(fn)) byFn.set(fn, []); byFn.get(fn).push([k, v]); }
for (const [fn, arr] of byFn) {
  console.log('· ' + fn.slice(0, 120));
  for (const [k, v] of arr.sort((a, b) => b[1] - a[1]).slice(0, 2))
    console.log('    ' + (v / 1000).toFixed(0) + 'ms  ' + k.split('\n')[1]?.slice(0, 220));
}

// 3. 每秒签名面曲线(主线程)
const marks = [
  ['bake(烘焙)', /bake|Bake/],
  ['shine', /[Ss]hine/],
  ['light(光)', /[Ll]ight(?!ning)|compositeLight/],
  ['shim(发射)', /shim|Shim|emit|Emit/],
  ['present', /present|Present|flush|Flush/],
  ['ghosts', /ghost|Ghost/],
  ['proj(弹幕)', /proj|Proj/],
  ['npc(怪)', /\bnpc|Npc|NPC|drawEnemy/],
  ['dust(尘)', /dust|Dust/],
  ['ai(步进)', /subStepAI|aiStyle|AI_/],
  ['wave', /wave|Wave/],
  ['player', /player|Player/],
  ['overlay/UI', /overlay|Overlay|ui|UI|Text/],
  ['map(地图)', /minimap|Minimap|map/],
];
const secAgg = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if ((cf.functionName || '') === '(idle)') continue;
  const k = Math.floor((ts - t0) / 1e6);
  let a = secAgg.get(k); if (!a) { a = {}; secAgg.set(k, a); }
  for (const [nm, re] of marks) if (re.test(cfOf(nid))) a[nm] = (a[nm] || 0) + d;
}
const busy = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  const cf = nodesAll.get(nid) || {};
  if ((cf.functionName || '') === '(idle)') continue;
  const k = Math.floor((ts - t0) / 1e6);
  busy.set(k, (busy.get(k) || 0) + d);
}
console.log('\n== 每秒签名面(ms/s;busy=非idle采样) ==');
const names = marks.map(m => m[0]);
console.log('sec | busy | ' + names.join(' | '));
for (const [s, a] of [...secAgg.entries()].sort((x, y) => x[0] - y[0])) {
  console.log(String(s).padStart(3) + ' | ' + String(Math.round((busy.get(s) || 0) / 1000)).padStart(4) + ' | ' + names.map(n => String(Math.round((a[n] || 0) / 1000)).padStart(n.length)).join(' | '));
}

// 4. prof8 防伪直扫: timeDeltas>25ms 的样本函数
console.log('\n== prof8 直扫: delta>25ms 样本(防伪巨段) ==');
const big = [];
for (const { ts, nid, d } of ms) if (d > 25000) big.push({ sec: ((ts - t0) / 1e6).toFixed(2), d: d / 1000, f: cfOf(nid) });
big.sort((a, b) => b.d - a.d);
console.log('deltas>25ms:', big.length);
for (const x of big.slice(0, 15)) console.log('  @' + x.sec + 's ' + x.d.toFixed(1) + 'ms  ' + x.f.slice(0, 120));

// 5. worker 身份与忙曲线
console.log('\n== worker 身份(busy 样本栈根) ==');
for (const [id, tid] of profTid) {
  if (id === MAIN_ID) continue;
  const ws = buildSamples(id);
  const roots = new Map(); let busyMs = 0;
  for (const { ts, nid, d } of ws) {
    if (d <= 0) continue;
    const cf = nodesAll.get(nid) || {};
    if ((cf.functionName || '') === '(idle)') continue;
    busyMs += d;
    let cur = nid, g = 0;
    while (parentOf.get(cur) != null && g++ < 40) cur = parentOf.get(cur);
    roots.set(cfOf(cur), (roots.get(cfOf(cur)) || 0) + d);
  }
  console.log(`-- ${id} tid=${tid} busy=${(busyMs / 1000).toFixed(0)}ms --`);
  for (const [k, v] of [...roots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4))
    console.log('    ' + (v / 1000).toFixed(0).padStart(6) + 'ms  root=' + k.slice(0, 150));
}
