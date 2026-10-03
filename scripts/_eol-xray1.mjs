// EoL xray1: 帧结构(帧距分布/个位数帧/DroppedFrame) + 帧窗口导出供后续脚本复用
// run: node --max-old-space-size=8192 scripts/_eol-xray1.mjs
import fs from 'node:fs';
const PATH = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261003T161320.json';
const OUT = '/tmp/eol-frame-windows.json';
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
const MAIN = '97833:25363119';
const MPID = 97833;

// --- 帧标记:FireAnimationFrame 为主,顺带查 FrameBeat 类自定义标记 ---
const frameNames = new Map();
for (const e of evs) {
  if (e.ph !== 'X' || e.pid + ':' + e.tid !== MAIN) continue;
  if (/frame|beat|tick|loop/i.test(e.name)) frameNames.set(e.name, (frameNames.get(e.name) || 0) + 1);
}
console.log('== 主线程 frame/tick 类事件名 ==', JSON.stringify([...frameNames.entries()]));

const rafs = evs.filter(e => e.ph === 'X' && e.name === 'FireAnimationFrame' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
console.log('FireAnimationFrame:', rafs.length);
const gaps = [];
for (let i = 1; i < rafs.length; i++) gaps.push((rafs[i].ts - rafs[i - 1].ts) / 1000);
const s = [...gaps].sort((a, b) => a - b);
const q = p => s[Math.floor(s.length * p)] || 0;
const sum = s.reduce((a, b) => a + b, 0);
console.log('帧距 p50/p90/p95/p99/max ms:', q(.5).toFixed(2), q(.9).toFixed(2), q(.95).toFixed(2), q(.99).toFixed(2), (s[s.length - 1] || 0).toFixed(1));
console.log('均值', (sum / s.length).toFixed(2), ' 帧数', s.length, ' 预算120Hz=8.33ms');
// 分桶
const buckets = [8.5, 10, 14, 17, 25, 40, 60, 100, 200, 500, 1000];
const bc = new Array(buckets.length + 1).fill(0);
for (const g of gaps) { let i = 0; while (i < buckets.length && g > buckets[i]) i++; bc[i]++; }
console.log('帧距分桶:', buckets.map((b, i) => `<=${b}:${bc[i]}`).join(' '), `>${buckets.at(-1)}:${bc[buckets.length]}`);

// --- 个位数帧(>100ms) ---
const t0 = rafs[0].ts;
const giant = [];
for (let i = 1; i < rafs.length; i++) {
  const gap = (rafs[i].ts - rafs[i - 1].ts) / 1000;
  if (gap > 100) giant.push({ idx: i, t0: rafs[i - 1].ts, t1: rafs[i].ts, gap, startSec: (rafs[i - 1].ts - t0) / 1e6 });
}
console.log('\n>100ms 巨帧数:', giant.length, ' 合计丢失时间:', (giant.reduce((a, g) => a + g.gap - 8.33, 0) / 1000).toFixed(2) + 's');
// >50ms 慢帧也列出
const slow50 = gaps.filter(g => g > 50).length;
const slow30 = gaps.filter(g => g > 30).length;
const slow17 = gaps.filter(g => g > 17).length;
console.log('>17ms:', slow17, ' >30ms:', slow30, ' >50ms:', slow50);

// 时间分布:每 4s 桶巨帧数
const span = (rafs.at(-1).ts - t0) / 1e6;
const hist = new Map();
for (const g of giant) { const k = Math.floor(g.startSec / 4) * 4; const a = hist.get(k) || (hist.set(k, a = []), a); a.push(g); }
console.log('巨帧时间分布(4s 桶, sec: count):', [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}s:${v.length}`).join(' '));
console.log('\n== 巨帧逐个(sec, gap ms) ==');
console.log(giant.map(g => `${g.startSec.toFixed(2)}s:${g.gap.toFixed(0)}ms`).join(' '));

// --- DroppedFrame ---
const df = evs.filter(e => e.name === 'DroppedFrame' && e.pid === MPID);
let dfn = 0; const dfBySec = new Map();
for (const e of df) {
  const n = e.args?.count || 1;
  dfn += n;
  if (e.ts > 0) { const k = Math.floor((e.ts - t0) / 1e6 / 4) * 4; dfBySec.set(k, (dfBySec.get(k) || 0) + n); }
}
console.log('\nDroppedFrame 总计:', dfn, ' (4s 桶):', [...dfBySec.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}s:${v}`).join(' '));

// --- 导出帧窗口供 xray2/3 复用 ---
const wins = [];
for (let i = 1; i < rafs.length; i++) {
  wins.push({ i, t0: rafs[i - 1].ts, t1: rafs[i].ts, gap: +((rafs[i].ts - rafs[i - 1].ts) / 1000).toFixed(3) });
}
fs.writeFileSync(OUT, JSON.stringify({ t0, wins, giant: giant.map(g => ({ i: g.idx, t0: g.t0, t1: g.t1, gap: +g.gap.toFixed(1), startSec: +g.startSec.toFixed(2) })) }));
console.log('\n窗口导出 ->', OUT, wins.length, '帧');

// 顺带:每帧窗内主线程自耗时合计(事件覆盖度),导出 per-frame busy
const busy = new Array(wins.length).fill(0);
for (const e of evs) {
  if (e.ph !== 'X' || e.pid + ':' + e.tid !== MAIN) continue;
  const d = e.dur || 0;
  // 归入事件起点所在帧窗(近似)
  const k = Math.floor((e.ts - t0));
  // 二分
  let lo = 0, hi = wins.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (wins[m].t1 < e.ts) lo = m + 1; else hi = m; }
  busy[lo] += d;
}
const busyStats = wins.map((w, i) => ({ i, gap: w.gap, busy: +busy[i].toFixed(0) })).filter(x => x.gap > 100);
console.log('巨帧窗内主线程 X 覆盖 busy(µs):', busyStats.map(x => `${x.busy / 1000 | 0}ms/${x.gap | 0}ms`).join(' '));
fs.writeFileSync('/tmp/eol-frame-busy.json', JSON.stringify(wins.map((w, i) => ({ i, t0: w.t0, t1: w.t1, gap: w.gap, busy: busy[i] }))));
console.log('busy 导出 -> /tmp/eol-frame-busy.json');
