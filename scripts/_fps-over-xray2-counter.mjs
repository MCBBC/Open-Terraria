// fps-over 裁决 xray2:链身份配对+计数器滚动窗模拟+抖动形态+GPU 呈现面普查
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
const MAIN = 29321645, COMP = 29321679, GPU_PID = 7688;

const grab = (name, pidFilter) => {
  const nd = Buffer.from(`,"name":"${name}"`);
  const out = [];
  let p = buf.indexOf(nd);
  while (p !== -1) {
    try {
      const ev = JSON.parse(lineSlice(p));
      if (!pidFilter || pidFilter(ev.pid)) out.push(ev);
    } catch {}
    p = buf.indexOf(nd, p + 1);
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
};

// ── 1) 链身份:每个 FireAnimationFrame 与其后 ts 落在其 [ts, ts+dur] 内的 FunctionCall 配对
const raf = grab('FireAnimationFrame', (pid) => pid === 39638).filter((e) => e.tid === MAIN);
const fcs = grab('FunctionCall', (pid) => pid === 39638).filter((e) => e.tid === MAIN);
const chainOf = new Map(); // rafIdx -> 'fn@url'
{
  let j = 0;
  for (const r of raf) {
    while (j < fcs.length && fcs[j].ts < r.ts) j++;
    let k = j, found = '';
    while (k < fcs.length && fcs[k].ts <= r.ts + (r.dur ?? 0)) {
      const d = fcs[k].args?.data ?? {};
      if (d.functionName || d.url) { found = `${d.functionName || '(anon)'} @ ${(d.url || '').split('/').pop()}`; break; }
      k++;
    }
    chainOf.set(r, found || '(无 FunctionCall)');
  }
}
const chainCount = new Map();
for (const r of raf) {
  const key = chainOf.get(r);
  const bucket = (r.dur ?? 0) >= 1000 ? 'BIG' : 'tiny';
  const k = `${bucket} ${key}`;
  chainCount.set(k, (chainCount.get(k) || 0) + 1);
}
console.log('== 链身份(FireAnimationFrame×FunctionCall 配对) ==');
for (const [k, c] of [...chainCount.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${c}`);

// ── 2) 游戏主链=配到游戏 loop 且 dur≥1ms;回退 dur≥1ms 全集
const bigFc = [...chainCount.keys()].filter((k) => k.startsWith('BIG'));
let big = raf.filter((r) => (r.dur ?? 0) >= 1000);
const gapsOf = (list) => { const g = []; for (let i = 1; i < list.length; i++) g.push((list[i].ts - list[i - 1].ts) / 1000); return g; };
const G = gapsOf(big).filter((g) => g < 100);

// ── 3) 计数器滚动窗模拟:frameDts=last60 gaps,fps=1000/mean
const sim = (gaps, label) => {
  const W = 60;
  const fpsArr = [];
  let sum = 0;
  for (let i = 0; i < gaps.length; i++) {
    sum += gaps[i];
    if (i >= W) sum -= gaps[i - W];
    if (i >= W - 1) fpsArr.push(1000 / (sum / W));
  }
  fpsArr.sort((a, b) => a - b);
  const q = (p) => fpsArr[Math.floor(p * fpsArr.length)];
  const frac = (lo) => (fpsArr.filter((f) => f >= lo).length / fpsArr.length * 100).toFixed(1);
  console.log(`  [${label}] 滚动60帧fps: n=${fpsArr.length} p01=${q(0.01).toFixed(1)} p50=${q(0.5).toFixed(1)} p99=${q(0.99).toFixed(1)} min=${fpsArr[0].toFixed(1)} max=${fpsArr[fpsArr.length - 1].toFixed(1)} | ≥120: ${frac(120)}% ≥125: ${frac(125)}% ≥130: ${frac(130)}%`);
};
console.log('\n== 计数器读数模拟(1000/mean(last 60 gaps)) ==');
sim(G, '游戏渲染链事件-start gaps');
const bf = grab('BeginFrame', (pid) => pid === 39638).filter((e) => e.tid === COMP);
sim(gapsOf(bf).filter((g) => g < 100), 'BeginFrame(合成器节拍) gaps');

// ── 4) gap 分布+抖动形态
const hist = (gaps, lo, hi, step) => {
  const rows = [];
  for (let x = lo; x < hi; x += step) {
    const c = gaps.filter((g) => g >= x && g < x + step).length;
    if (c) rows.push(`${x.toFixed(1)}-${(x + step).toFixed(1)}:${c}`);
  }
  return rows.join(' ');
};
console.log('\n== 渲染链 gap 直方图(0.5ms 桶) ==');
console.log('  ' + hist(G, 5, 11, 0.5));
const sub77 = G.filter((g) => g < 7.7).length, sub8 = G.filter((g) => g < 8).length;
console.log(`  <7.7ms: ${sub77}(${(100 * sub77 / G.length).toFixed(1)}%)  <8.0ms: ${sub8}(${(100 * sub8 / G.length).toFixed(1)}%)  >8.33: ${G.filter((g) => g > 8.33).length}  >10: ${G.filter((g) => g > 10).length}`);
// 滞后1自相关+对和结构
const n = G.length;
const mg = G.reduce((a, b) => a + b, 0) / n;
let scc = 0, sdd = 0, scd = 0;
for (let i = 0; i < n - 1; i++) {
  const a = G[i] - mg, b = G[i + 1] - mg;
  scc += a * a; sdd += b * b; scd += a * b;
}
console.log(`  lag-1 自相关: ${(scd / Math.sqrt(scc * sdd)).toFixed(3)}  mean=${mg.toFixed(3)}ms`);
const pairs = [];
for (let i = 0; i + 1 < n; i++) pairs.push(G[i] + G[i + 1]);
pairs.sort((a, b) => a - b);
console.log(`  相邻对和 G[i]+G[i+1]: p10=${pairs[Math.floor(0.1 * pairs.length)].toFixed(2)} p50=${pairs[Math.floor(0.5 * pairs.length)].toFixed(2)} p90=${pairs[Math.floor(0.9 * pairs.length)].toFixed(2)} (2×vsync 若=16.6 则锁 8.3 网格;=16.0 则锁 8.0 网格)`);

// ── 5) BeginFrame 帧序连续性(frameSeqId 跳变=丢帧)与周期
const seqs = bf.map((e) => e.args?.frameSeqId).filter((x) => x != null);
let seqSkip = 0;
for (let i = 1; i < seqs.length; i++) if (seqs[i] - seqs[i - 1] > 1) seqSkip += seqs[i] - seqs[i - 1] - 1;
const bfGaps = gapsOf(bf).filter((g) => g < 100);
const bfMean = bfGaps.reduce((a, b) => a + b, 0) / bfGaps.length;
console.log(`\n== BeginFrame 周期定谳 ==`);
console.log(`  n=${bf.length} 全程均值=${bfMean.toFixed(3)}ms (=${(1000 / bfMean).toFixed(2)}/s) frameSeqId 跳变=${seqSkip}`);

// ── 6) GPU 进程事件普查(呈现面证据)
const gpuNames = new Map();
{
  const pat = /"pid":7688/g;
  let m;
  const gpuLines = [];
  let p = buf.indexOf(Buffer.from('"pid":7688'));
  while (p !== -1) {
    gpuLines.push(lineSlice(p));
    p = buf.indexOf(Buffer.from('"pid":7688'), p + 1);
  }
  for (const s of gpuLines) {
    const mm = s.match(/"name":"([^"]+)"/);
    if (mm) gpuNames.set(mm[1], (gpuNames.get(mm[1]) || 0) + 1);
  }
}
console.log('\n== GPU 进程(pid 7688)事件普查 ==');
for (const [k, c] of [...gpuNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${k}: ${c}`);

// ── 7) DrawFrame vs BeginFrame 差与 vsync 锚
const df = grab('DrawFrame', (pid) => pid === 39638).filter((e) => e.tid === COMP);
const bmt = grab('BeginMainThreadFrame', (pid) => pid === 39638).filter((e) => e.tid === MAIN);
const dfGaps = gapsOf(df).filter((g) => g < 100);
const dfMean = dfGaps.reduce((a, b) => a + b, 0) / dfGaps.length;
const bmtGaps = gapsOf(bmt).filter((g) => g < 100);
const bmtMean = bmtGaps.reduce((a, b) => a + b, 0) / bmtGaps.length;
console.log(`\n== 三锚对账 ==`);
console.log(`  BeginFrame ${bf.length}: ${(1000 / bfMean).toFixed(2)}/s | BeginMainThreadFrame ${bmt.length}: ${(1000 / bmtMean).toFixed(2)}/s | DrawFrame ${df.length}: ${(1000 / dfMean).toFixed(2)}/s | 游戏渲染帧 ${big.length}: ${(1000 / (G.reduce((a, b) => a + b, 0) / G.length)).toFixed(2)}/s`);
