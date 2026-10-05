// fps-over 裁决 xray1:四大锚全量提取+逐秒分箱+gap 分布
// 锚语义:
//  - FireAnimationFrame(CrRendererMain):rAF 回调调度面(全链;dur=回调执行时长)
//  - FunctionCall(CrRendererMain):回调体(找游戏主链)
//  - DrawFrame / BeginFrame:合成器呈现面(impl/viz)
//  - BeginMainThreadFrame:主线程帧起始
// 真帧率裁决:呈现面每秒计数 vs rAF 调度率 vs 计数器读数(1000/mean gap)。
import { readFileSync } from 'node:fs';

const TRACE = '/Users/vinlic/Downloads/Trace-20261005T153007.json';
const buf = readFileSync(TRACE);
const NL = 0x0a;
const lineSlice = (pos) => {
  const start = buf.lastIndexOf(NL, pos) + 1;
  let end = buf.indexOf(NL, pos);
  if (end === -1) end = buf.length;
  let s = buf.toString('utf8', start, end);
  if (s.endsWith(',')) s = s.slice(0, -1);
  return s;
};

const MAIN = 29321645, COMP = 29321679;
const want = new Set(['FireAnimationFrame', 'FunctionCall', 'DrawFrame', 'BeginFrame', 'BeginMainThreadFrame', 'RequestAnimationFrame']);
const evs = { FireAnimationFrame: [], FunctionCall: [], DrawFrame: [], BeginFrame: [], BeginMainThreadFrame: [] };

let pos = buf.indexOf(Buffer.from(',"name":"DrawFrame"'));
// 简化:直接顺序扫一遍这几类(行级)
const needles = [...want].map((n) => Buffer.from(`,"name":"${n}"`));
const found = needles.map(() => []);
for (let i = 0; i < needles.length; i++) {
  let p = buf.indexOf(needles[i]);
  while (p !== -1) { found[i].push(p); p = buf.indexOf(needles[i], p + 1); }
}
for (let i = 0; i < needles.length; i++) {
  const name = want.has([...want][i]) ? [...want][i] : '';
  for (const p of found[i]) {
    try {
      const ev = JSON.parse(lineSlice(p));
      const key = [...want][i];
      const t = ev.pid + ':' + ev.tid;
      // 只留渲染进程事件(主线程+合成器线程)
      if (ev.pid !== 39638) continue;
      if (!evs[key]) continue;
      evs[key].push({ ts: ev.ts, dur: (ev.dur ?? 0) / 1000, t: ev.tid, ph: ev.ph, fn: ev.args?.data?.functionName ?? '', url: ev.args?.data?.url ?? '' });
    } catch {}
  }
}

const stats = (arr) => {
  if (!arr.length) return 'n=0';
  const s = [...arr].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return `n=${s.length} mean=${mean.toFixed(2)} p05=${q(0.05).toFixed(2)} p50=${q(0.5).toFixed(2)} p95=${q(0.95).toFixed(2)} min=${s[0].toFixed(2)} max=${s[s.length - 1].toFixed(2)}`;
};

for (const k of Object.keys(evs)) {
  const list = evs[k];
  list.sort((a, b) => a.ts - b.ts);
  console.log(`\n== ${k} (总 ${list.length}) ==`);
  const threads = new Map();
  for (const e of list) threads.set(e.t, (threads.get(e.t) || 0) + 1);
  console.log('  线程分布:', [...threads.entries()].map(([t, c]) => `${t === MAIN ? 'MAIN' : t === COMP ? 'COMP' : t}=${c}`).join(' '));
  const main = list.filter((e) => e.t === MAIN);
  const comp = list.filter((e) => e.t === COMP);
  if (main.length >= 2) {
    const gaps = main.slice(1).map((e, i) => (e.ts - main[i].ts) / 1000).filter((g) => g < 100);
    console.log(`  MAIN 逐秒: ${binPerSec(main)}`);
    console.log(`  MAIN gap: ${stats(gaps)}`);
  }
  if (comp.length >= 2) {
    const gaps = comp.slice(1).map((e, i) => (e.ts - comp[i].ts) / 1000).filter((g) => g < 100);
    console.log(`  COMP 逐秒: ${binPerSec(comp)}`);
    console.log(`  COMP gap: ${stats(gaps)}`);
  }
}

// FireAnimationFrame MAIN:dur 分布→链拆分
const rafMain = evs.FireAnimationFrame.filter((e) => e.t === MAIN);
console.log('\n== FireAnimationFrame MAIN dur 分布 ==');
const durs = rafMain.map((e) => e.dur);
const buckets = [0, 0.05, 0.1, 0.2, 0.5, 1, 2, 4, 8, 16, 32, 1000];
for (let i = 0; i < buckets.length - 1; i++) {
  const c = durs.filter((d) => d >= buckets[i] && d < buckets[i + 1]).length;
  if (c) console.log(`  [${buckets[i]},${buckets[i + 1]})ms: ${c}`);
}
console.log('  dur stats:', stats(durs));

// 每条链(按 gap 连续性/dur 特征拆):先看 dur>=1ms(渲染帧)子集的 cadence
const big = rafMain.filter((e) => e.dur >= 1);
const tiny = rafMain.filter((e) => e.dur < 1);
console.log(`\nbig(>=1ms 渲染帧) n=${big.length} 逐秒: ${binPerSec(big)}`);
console.log('  big gap: ' + stats(big.slice(1).map((e, i) => (e.ts - big[i].ts) / 1000).filter((g) => g < 100)));
console.log(`tiny(<1ms 跳帧/其他链) n=${tiny.length} 逐秒: ${binPerSec(tiny)}`);

function binPerSec(list) {
  if (!list.length) return '';
  const t0 = list[0].ts, t1 = list[list.length - 1].ts;
  const nsec = Math.ceil((t1 - t0) / 1e6);
  const bins = new Array(nsec).fill(0);
  for (const e of list) bins[Math.min(nsec - 1, Math.floor((e.ts - t0) / 1e6))]++;
  return bins.map((c) => c).join(',');
}
