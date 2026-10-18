// EoL2 xray0: trace 结构普查 + 帧距分布 + 慢帧时间轴(>25ms) + rAF 相位对齐
// run: node --max-old-space-size=8192 scripts/_eol2-xray0.mjs [trace.json]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
const PATH = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261005T020627.json'));
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
console.log('total events:', evs.length);

// 线程表
const tidName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');
const procName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'process_name') procName.set(e.pid, e.args?.name || '');
const byTid = new Map();
for (const e of evs) {
  if (e.ph !== 'X') continue;
  const k = e.pid + ':' + e.tid;
  let a = byTid.get(k); if (!a) byTid.set(k, a = { n: 0, dur: 0 });
  a.n++; a.dur += e.dur || 0;
}
console.log('== 线程表(X 事件总 dur top 15) ==');
for (const [k, a] of [...byTid.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 15))
  console.log(String(a.n).padStart(7), (a.dur / 1000).toFixed(0).padStart(7) + 'ms', k, '<' + (tidName.get(k) || '?') + '> proc<' + (procName.get(k.split(':')[0]) || '?') + '>');

let main = null;
for (const [k, a] of byTid) if (/CrRendererMain/.test(tidName.get(k) || '')) { main = { k, a }; break; }
if (!main) { for (const [k, a] of byTid) if (!main || a.dur > main.a.dur) main = { k, a }; }
const MAIN = main.k;
console.log('MAIN =', MAIN, '<' + (tidName.get(MAIN) || '?') + '> Xevents=' + main.a.n);

// rAF 帧距
const rafs = evs.filter(e => e.ph === 'X' && /FireAnimationFrame|RequestAnimationFrame/.test(e.name) && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
console.log('rAF events:', rafs.length, 'names:', [...new Set(rafs.map(e => e.name))].join(','));
const gaps = [];
for (let i = 1; i < rafs.length; i++) gaps.push({ gap: (rafs[i].ts - rafs[i - 1].ts) / 1000, ts: rafs[i].ts });
const s = [...gaps.map(g => g.gap)].sort((a, b) => a - b);
const q = p => s[Math.floor(s.length * p)] || 0;
console.log('gap p50/p75/p90/p95/p99/max(ms):', q(.5).toFixed(1), q(.75).toFixed(1), q(.9).toFixed(1), q(.95).toFixed(1), q(.99).toFixed(1), (s.at(-1) || 0).toFixed(1));
const buckets = [8.3, 12, 16.7, 20, 25, 33.3, 41.7, 50, 100, 250, 1000];
const bc = new Array(buckets.length + 1).fill(0);
for (const g of gaps) { let i = 0; while (i < buckets.length && g.gap > buckets[i]) i++; bc[i]++; }
console.log('gap 分布:', buckets.map((b, i) => `<=${b}:${bc[i]}`).join(' '), `>1000:${bc.at(-1)}`);
const t0 = rafs[0]?.ts ?? 0;
const fpsSeries = [];
let acc = 0, cnt = 0, winStart = 0;
for (const g of gaps) {
  if (g.ts - winStart > 1e6) { fpsSeries.push({ sec: ((winStart - t0) / 1e6).toFixed(0), fps: (cnt / ((g.ts - winStart + (winStart - acc)) / 1e6)).toFixed(0) }); }
  acc = winStart = g.ts - 1e6 * ((g.ts - winStart) / 1e6 | 0) * 1e6; // reset window
}
// 简化:按 2s 窗统计平均 fps 与 >25ms 帧数
const win = new Map();
for (const g of gaps) {
  const k = Math.floor((g.ts - t0) / 2e6);
  let a = win.get(k); if (!a) { a = { n: 0, sum: 0, slow: 0, max: 0 }; win.set(k, a); }
  a.n++; a.sum += g.gap; a.max = Math.max(a.max, g.gap); if (g.gap > 25) a.slow++;
}
console.log('== 2s 窗帧况(sec | n | avgGap | >25ms计数 | maxGap | 判级) ==');
for (const [k, a] of [...win.entries()].sort((x, y) => x[0] - y[0])) {
  const avg = a.sum / a.n;
  const grade = a.slow >= 20 ? 'BAD30' : a.slow >= 5 ? 'STUTTER' : avg > 19 ? 'SOFT' : 'OK';
  console.log(String(k * 2).padStart(4) + 's n=' + String(a.n).padStart(3), 'avg=' + avg.toFixed(1).padStart(5), '>25=' + String(a.slow).padStart(3), 'max=' + a.max.toFixed(0).padStart(4), grade);
}

// 主线程事件名聚合
const agg = new Map();
for (const e of evs) {
  if (e.ph !== 'X' || e.pid + ':' + e.tid !== MAIN) continue;
  let a = agg.get(e.name); if (!a) { a = { n: 0, dur: 0, max: 0 }; agg.set(e.name, a); }
  a.n++; a.dur += e.dur || 0; a.max = Math.max(a.max, e.dur || 0);
}
console.log('== 主线程 X 事件 top 30(总 dur) ==');
for (const [n, a] of [...agg.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 30))
  console.log((a.dur / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(7), 'max=' + (a.max / 1000).toFixed(1) + 'ms', n.slice(0, 90));

// ProfileChunk 存在性
const chunks = evs.filter(e => e.name === 'ProfileChunk');
const byId = new Map();
for (const c of chunks) {
  const k = c.pid + ' ' + (c.id || '?');
  let a = byId.get(k); if (!a) { a = { n: 0, samples: 0, tid: c.tid }; byId.set(k, a); }
  a.n++; a.samples += c.args?.data?.cpuProfile?.samples?.length || 0;
}
console.log('== ProfileChunk 流 ==');
for (const [k, a] of byId) console.log('  prof', k, 'tid=' + a.tid, '<' + (tidName.get(a.pid + ':' + a.tid) || procName.get(a.pid) || '?') + '>', 'chunks=' + a.n, 'samples=' + a.samples);
let tmin = Infinity, tmax = 0;
for (const e of evs) if (typeof e.ts === 'number' && e.ts > 0) { if (e.ts < tmin) tmin = e.ts; if (e.ts > tmax) tmax = e.ts; }
console.log('span:', ((tmax - tmin) / 1e6).toFixed(2) + 's t0=' + tmin);
