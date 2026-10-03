// 主归因:帧距修正+每秒桶签名+慢帧窗聚合+主线程(0x7)自耗时×调用方
import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('/tmp/hell-xray-cache.json', 'utf8'));
const { mainX, dict, chunks } = c;
const nameId = new Map(); dict.forEach((n, i) => nameId.set(n, i));
const RAF = nameId.get('FireAnimationFrame');
const rafs = mainX.filter(e => e[0] === RAF).map(e => e[1]).sort((a, b) => a - b);
// 帧内回调去重:gap>2.5ms 视为帧边界(帧内回调串 gap<2ms)
const frameStarts = [rafs[0]];
for (let i = 1; i < rafs.length; i++) if (rafs[i] - rafs[i - 1] > 2500) frameStarts.push(rafs[i]);
const gaps = [];
for (let i = 1; i < frameStarts.length; i++) gaps.push(frameStarts[i] - frameStarts[i - 1]);
const s = [...gaps].sort((a, b) => a - b);
const q = (p) => s[Math.floor(s.length * p)] || 0;
console.log('== 真帧距(帧首回调) n=' + gaps.length + ' ==');
console.log('p50/p90/p95/p99/max ms:', (q(.5) / 1000).toFixed(2), (q(.9) / 1000).toFixed(2), (q(.95) / 1000).toFixed(2), (q(.99) / 1000).toFixed(2), (s[s.length - 1] / 1000).toFixed(1));
const slow = gaps.filter(g => g > 12500);
console.log('慢帧>12.5ms(<80fps):', slow.length, '(' + (100 * slow.length / gaps.length).toFixed(1) + '%)  >16.6ms(<60fps):', gaps.filter(g => g > 16600).length);
// FunctionCall 序列(带函数名)
const FC = nameId.get('FunctionCall');
const fc = [];
for (const [ni, ts, dur] of mainX) if (ni === FC) fc.push({ ts, dur });
console.log('FunctionCall events:', fc.length);
// FunctionCall 函数名需从原始 trace 拿——缓存只存了 name=FunctionCall。
// FunctionCall 的 args.data.functionName 在 dict 里没有。改用 ProfileChunk 0x7 的自耗时承担归因;
// 这里用 X 事件名聚合作补充。
const t0 = frameStarts[0];
// 每秒桶:帧数/慢帧/最差 + 事件签名(该秒内 dur 最大的 3 个非 rAF 事件名)
const secFrames = new Map();
for (let i = 1; i < frameStarts.length; i++) {
  const g = frameStarts[i] - frameStarts[i - 1];
  const k = Math.floor((frameStarts[i - 1] - t0) / 1e6);
  let a = secFrames.get(k); if (!a) secFrames.set(k, a = { n: 0, slow: 0, worst: 0 });
  a.n++; if (g > 12500) a.slow++; if (g > a.worst) a.worst = g;
}
// 主线程 X 事件按秒×名聚合(排除 rAF/RunTask/v8 等噪声)
const NOISE = new Set(['FireAnimationFrame', 'RequestAnimationFrame', 'RunTask', 'v8.callFunction', 'FunctionCall', 'v8::Debugger::AsyncTaskCanceled', 'v8::Debugger::AsyncTaskRun', 'v8::Debugger::AsyncTaskScheduled', 'UpdateCounters']);
const secSig = new Map();
for (const [ni, ts, dur] of mainX) {
  const nm = dict[ni];
  if (NOISE.has(nm)) continue;
  const k = Math.floor((ts - t0) / 1e6);
  let m = secSig.get(k); if (!m) secSig.set(k, m = new Map());
  m.set(nm, (m.get(nm) || 0) + (dur || 0));
}
console.log('\nsec | fps | slow | worst(ms) | top X-event durations(ms)');
const rows = [...secFrames.entries()].sort((a, b) => a[0] - b[0]);
for (const [k, a] of rows) {
  const m = secSig.get(k) || new Map();
  const sig = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n, d]) => n.slice(0, 26) + '=' + (d / 1000).toFixed(0)).join(' ');
  console.log(String(k).padStart(3), String(Math.round(a.n)).padStart(4), String(a.slow).padStart(3), (a.worst / 1000).toFixed(1).padStart(6), sig);
}
// ProfileChunk 0x7(主线程)自耗时 top40
const main = chunks.filter(ch => ch.id === '0x7');
console.log('\n== 主线程 0x7 chunks:', main.length, '==');
const nodes = new Map(); const parentOf = new Map();
for (const ch of main) for (const n of ch.nodes) {
  if (!nodes.has(n.id)) { nodes.set(n.id, n.f); if (n.parent != null) parentOf.set(n.id, n.parent); }
}
const selfUs = new Map();
let totalUs = 0;
for (const ch of main) {
  for (let i = 0; i < ch.s.length; i++) { const d = ch.td[i] ?? 0; selfUs.set(ch.s[i], (selfUs.get(ch.s[i]) || 0) + d); totalUs += d; }
}
console.log('sampled total:', (totalUs / 1000).toFixed(0) + 'ms over', ((c.meta.span1 - c.meta.span0) / 1e6).toFixed(1) + 's');
const fn = new Map();
for (const [nid, us] of selfUs) {
  const f = dict[nodes.get(nid)] || '?';
  fn.set(f, (fn.get(f) || { n: 0, us: 0 })); const a = fn.get(f); a.n++; a.us += us;
}
console.log('== 主线程自耗时 top40 ==');
for (const [f, a] of [...fn.entries()].sort((x, y) => y[1].us - x[1].us).slice(0, 40))
  console.log((a.us / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(6), String(f).slice(0, 110));
// 自耗时×JS 调用方 top30(上溯到有 url 的帧;dict 里 native 帧 f 带 |native 后缀)
const jsAncestor = (id) => {
  let cur = parentOf.get(id), g = 0;
  while (cur != null && g++ < 20) { const f = dict[nodes.get(cur)] || ''; if (!f.includes('|native')) return f; cur = parentOf.get(cur); }
  return '(none)';
};
const byPar = new Map();
for (const [nid, us] of selfUs) {
  const f = dict[nodes.get(nid)] || '?';
  const key = f + '  ⟵ ' + jsAncestor(nid);
  const a = byPar.get(key) || (byPar.set(key, { n: 0, us: 0 }), byPar.get(key)); a.n++; a.us += us;
}
console.log('\n== 自耗时×调用方 top30 ==');
for (const [k, a] of [...byPar.entries()].sort((x, y) => y[1].us - x[1].us).slice(0, 30))
  console.log((a.us / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(6), String(k).slice(0, 150));
// 雪签名/下坠签名专项 census:名字含关键字的函数自耗时(0x7)+分秒
const KEYS = /tint|precip|weather|snow|biome|bg|bake|chunk|light|minimap|miniMap|shake|dust|liquid|water|rain/i;
const sigFn = [];
for (const [f, a] of fn) if (KEYS.test(f)) sigFn.push([f, a]);
sigFn.sort((x, y) => y[1].us - x[1].us);
console.log('\n== 签名函数(名含 tint/precip/weather/snow/biome/bg/bake/chunk/light/minimap…)自耗时 top35 ==');
for (const [f, a] of sigFn.slice(0, 35)) console.log((a.us / 1000).toFixed(1).padStart(8) + 'ms n=' + String(a.n).padStart(6), String(f).slice(0, 110));
