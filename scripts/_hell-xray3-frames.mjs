// 帧结构:主线程 rAF 帧距分布 + 每秒慢帧桶(读缓存)
import fs from 'node:fs';
const c = JSON.parse(fs.readFileSync('/tmp/hell-xray-cache.json', 'utf8'));
const mainX = c.mainX, dict = c.dict;
const nameId = new Map(); dict.forEach((n, i) => nameId.set(n, i));
const RAF = nameId.get('FireAnimationFrame');
const rafs = mainX.filter(e => e[0] === RAF).map(e => e[1]).sort((a, b) => a - b);
console.log('rAF events:', rafs.length, 'span:', ((rafs[rafs.length - 1] - rafs[0]) / 1e6).toFixed(2) + 's', 'avg/s:', (rafs.length / ((rafs[rafs.length - 1] - rafs[0]) / 1e6)).toFixed(1));
// 相邻差直方图(µs)
const gaps = [];
for (let i = 1; i < rafs.length; i++) gaps.push(rafs[i] - rafs[i - 1]);
const hist = new Map();
for (const g of gaps) { const b = g < 2000 ? '<2' : g < 5000 ? '2-5' : g < 9000 ? '5-9' : g < 12500 ? '9-12.5' : g < 16600 ? '12.5-16.6' : g < 25000 ? '16.6-25' : g < 40000 ? '25-40' : g < 100000 ? '40-100' : '>100'; hist.set(b, (hist.get(b) || 0) + 1); }
console.log('gap histogram:', [...hist.entries()]);
const s = [...gaps].sort((a, b) => a - b);
const q = (p) => s[Math.floor(s.length * p)] || 0;
console.log('gap p50/p90/p95/p99/max (ms):', (q(.5) / 1000).toFixed(2), (q(.9) / 1000).toFixed(2), (q(.95) / 1000).toFixed(2), (q(.99) / 1000).toFixed(2), (s[s.length - 1] / 1000).toFixed(1));
// 每秒桶:帧数(=rAF 数)、慢帧数(>12.5ms)、最差帧
const t0 = rafs[0];
const sec = new Map();
for (let i = 1; i < rafs.length; i++) {
  const g = rafs[i] - rafs[i - 1];
  const k = Math.floor((rafs[i - 1] - t0) / 1e6);
  let a = sec.get(k); if (!a) sec.set(k, a = { n: 0, slow: 0, worst: 0, sum: 0 });
  a.n++; a.sum += g; if (g > 12500) a.slow++; if (g > a.worst) a.worst = g;
}
console.log('sec | frames | slow>12.5 | avg | worst(ms)');
const rows = [...sec.entries()].sort((a, b) => a[0] - b[0]);
for (const [k, a] of rows) console.log(String(k).padStart(3), String(a.n).padStart(4), String(a.slow).padStart(3), (a.sum / a.n / 1000).toFixed(1).padStart(6), (a.worst / 1000).toFixed(1).padStart(6));
// 慢帧 run 聚类(>12.5ms 连续≥3 帧)
let runs = [], cur = null;
for (let i = 1; i < rafs.length; i++) {
  const g = rafs[i] - rafs[i - 1];
  if (g > 12500) { if (!cur) { cur = { t0: rafs[i - 1], n: 0, worst: 0 }; runs.push(cur); } cur.n++; cur.worst = Math.max(cur.worst, g); }
  else cur = null;
}
console.log('== slow runs(>12.5ms) ==');
for (const r of runs) console.log('t=' + ((r.t0 - t0) / 1e6).toFixed(1) + 's n=' + r.n + ' worst=' + (r.worst / 1000).toFixed(1) + 'ms');
