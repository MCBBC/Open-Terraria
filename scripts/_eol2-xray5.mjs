// EoL2 xray5: 按流命名空间重建归因(防跨流 id 碰撞)——主线程自耗时/慢帧差分/每秒签名 + worker 真身栈与忙曲线
// run: node --max-old-space-size=8192 scripts/_eol2-xray5.mjs [trace.json]
import fs from 'node:fs';
const PATH = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261005T020627.json';
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];

const profTid = new Map(), profStart = new Map();
for (const e of evs) if (e.name === 'Profile') { profTid.set(e.id, e.tid); profStart.set(e.id, e.args?.data?.startTime || e.ts); }
const nodes = new Map(), parentOf = new Map(); // key = pid+':'+nodeId
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
const fnOf = (P, id) => { const c = nodes.get(P + ':' + id) || {}; return c.functionName || '(anon)'; };
function buildSamples(P) {
  const arr = streamChunks.get(P) || [];
  let clk = profStart.get(P); const out = [];
  for (const c of arr) for (let i = 0; i < c.s.length; i++) { out.push({ ts: clk, nid: c.s[i], d: c.td[i] ?? 0 }); clk += (c.td[i] ?? 0); }
  return out;
}
const MAIN = '0x7';
const ms = buildSamples(MAIN);
const t0 = ms[0].ts;
console.log('main samples:', ms.length, 'span:', ((ms.at(-1).ts - ms[0].ts) / 1e6).toFixed(2) + 's');

// 1. 主线程自耗时 top(全窗 + 慢帧窗 5.0-6.8 vs 健康窗 11.2-13.2)
const SLOW0 = 5.0, SLOW1 = 6.8, OK0 = 11.2, OK1 = 13.2;
const selfAll = new Map(), selfSlow = new Map(), selfOk = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0 || d > 60000) continue;
  if (fnOf(MAIN, nid) === '(idle)') continue;
  const k = cfOf(MAIN, nid);
  selfAll.set(k, (selfAll.get(k) || 0) + d);
  const sec = (ts - t0) / 1e6;
  if (sec >= SLOW0 && sec <= SLOW1) selfSlow.set(k, (selfSlow.get(k) || 0) + d);
  if (sec >= OK0 && sec <= OK1) selfOk.set(k, (selfOk.get(k) || 0) + d);
}
console.log('\n== 全窗自耗时 top 22(去污染版) ==');
for (const [k, v] of [...selfAll.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 130));
const slowSum = [...selfSlow.values()].reduce((a, b) => a + b, 0);
const okSum = [...selfOk.values()].reduce((a, b) => a + b, 0);
console.log('\n== 慢帧窗 5.0-6.8s top 18 == (窗内非idle: ' + (slowSum / 1000).toFixed(0) + 'ms / 1.8s = ' + ((slowSum / 1.8e6) * 100).toFixed(0) + '%忙)');
for (const [k, v] of [...selfSlow.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + ((v / slowSum) * 100).toFixed(1).padStart(5) + '%  ' + k.slice(0, 120));
console.log('\n== 健康窗 11.2-13.2s top 15 == (窗内非idle: ' + (okSum / 1000).toFixed(0) + 'ms / 2.0s = ' + ((okSum / 2.0e6) * 100).toFixed(0) + '%忙)');
for (const [k, v] of [...selfOk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 120));

// 2. 慢帧窗父链 top12(全景, 不限函数)
console.log('\n== 慢帧窗调用链(深度4, top12) ==');
const chainAgg = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  const sec = (ts - t0) / 1e6;
  if (sec < SLOW0 || sec > SLOW1) continue;
  if (fnOf(MAIN, nid) === '(idle)') continue;
  const chain = []; let cur = MAIN + ':' + nid, g = 0;
  while (cur != null && g++ < 4) { chain.push(cfOf(MAIN, cur.split(':')[1])); cur = parentOf.get(cur); }
  const key = chain.join(' ← ');
  chainAgg.set(key, (chainAgg.get(key) || 0) + d);
}
for (const [k, v] of [...chainAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12))
  console.log((v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 240));

// 3. 每秒签名面
const marks = [
  ['bake', /bake|Bake/], ['shine', /[Ss]hine/], ['light', /[Ll]ight(?!ning)|compositeLight/], ['shim/emit', /shim|Shim|emit|Emit/],
  ['present/flush', /present|Present|flush|Flush/], ['ghost', /ghost|Ghost/], ['proj', /proj|Proj/], ['npc', /\bnpc|Npc|NPC|drawEnemy|Empress|empress/],
  ['dust', /dust|Dust/], ['ai', /subStepAI|aiStyle|AI_/], ['wave', /wave|Wave/], ['player', /player|Player/], ['texCache', /texFromRegion|resolveTex|evictLRU|texReady|tintedTex/],
  ['UI/Text', /overlay|Overlay|\bui\b|\bUI\b|Text/], ['GC', /garbage|GC|allocate/],
];
const secAgg = new Map();
for (const { ts, nid, d } of ms) {
  if (d <= 0) continue;
  if (fnOf(MAIN, nid) === '(idle)') continue;
  const k = Math.floor((ts - t0) / 1e6);
  let a = secAgg.get(k); if (!a) { a = { __busy: 0 }; secAgg.set(k, a); }
  a.__busy += d;
  const cf = cfOf(MAIN, nid);
  for (const [nm, re] of marks) if (re.test(cf)) a[nm] = (a[nm] || 0) + d;
}
const names = marks.map(m => m[0]);
console.log('\n== 每秒签名面(ms/s) ==');
console.log('sec | busy | ' + names.join(' | '));
for (const [s, a] of [...secAgg.entries()].sort((x, y) => x[0] - y[0]))
  console.log(String(s).padStart(3) + ' | ' + String(Math.round(a.__busy / 1000)).padStart(4) + ' | ' + names.map(n => String(Math.round((a[n] || 0) / 1000)).padStart(n.length)).join(' | '));

// 4. prof8 直扫(去污染)
console.log('\n== prof8 直扫 delta>25ms(主线程) ==');
let bigN = 0;
for (const { ts, nid, d } of ms) if (d > 25000) { bigN++; console.log('  @' + ((ts - t0) / 1e6).toFixed(2) + 's ' + (d / 1000).toFixed(1) + 'ms  ' + cfOf(MAIN, nid).slice(0, 110)); }
console.log('  总数:', bigN);

// 5. worker 真身(命名空间版): 栈 top5 + 忙曲线
console.log('\n== worker 真身(去污染) ==');
for (const P of [...profTid.keys()]) {
  if (P === MAIN) continue;
  const ws = buildSamples(P);
  const chains = new Map(); const secBusy = new Map(); let busy = 0, idle = 0;
  for (const { ts, nid, d } of ws) {
    if (d <= 0) continue;
    const fn = fnOf(P, nid);
    if (fn === '(idle)') { idle += d; continue; }
    busy += d;
    const k = Math.floor((ts - profStart.get(P)) / 1e6);
    secBusy.set(k, (secBusy.get(k) || 0) + d);
    const chain = []; let cur = P + ':' + nid, g = 0;
    while (cur != null && g++ < 4) { chain.push(cfOf(P, cur.split(':')[1])); cur = parentOf.get(cur); }
    chains.set(chain.join(' ← '), (chains.get(chain.join(' ← ')) || 0) + d);
  }
  console.log(`-- ${P} tid=${profTid.get(P)} busy=${(busy / 1000).toFixed(0)}ms idle=${(idle / 1000).toFixed(0)}ms --`);
  for (const [k, v] of [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5))
    console.log('    ' + (v / 1000).toFixed(0).padStart(6) + 'ms  ' + k.slice(0, 230));
  console.log('    忙曲线ms/s:', [...secBusy.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => s + ':' + Math.round(v / 1000)).join(' ').slice(0, 360));
}
