#!/usr/bin/env node
// _txr-firstuse-buckets.mjs — 一次性取证：腐化首入 120→80-90fps 早期窗 vs 稳态窗分桶对比
// ①主线程 2s 桶：rAF 率 / 渲染帧(loop≥1.5ms) / 帧距 / LPR / GC / postMessage / RunTask
// ②first-seen 清单：资源请求 URL / ImageDecode 家族 / GPU tex 尺寸首传 / v8 compile 家族
// ③worker 分桶忙碌(BakeWorker/LightWorker/WaveWorker/BackgroundPump) — C4 wbake 波次
// ④CPU 采样分桶自耗 top 函数 + 首见函数集（JIT/首执行证据）+ 标签和(战役同款词表)
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-firstuse-buckets.mjs <trace.json>
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];

const threadNames = new Map(); // pid:tid -> name
const procNames = new Map();   // pid -> name
let tmin = Infinity;
const tidEvCount = new Map();  // pid:tid -> n (X events)
const rafByTk = new Map();     // tk -> [ts,dur][]
const loopByTk = new Map();    // tk -> [ts,dur,line,url][]

// ── PASS 1: metadata + tmin + rAF/loop 普查 ──
{
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    const ts = ev.ts || 0;
    if (ts && ts < tmin) tmin = ts;
    if (cat === '__metadata') {
      if (name === 'thread_name') threadNames.set(ev.pid + ':' + ev.tid, ev.args?.name || '?');
      else if (name === 'process_name') procNames.set(ev.pid, ev.args?.name || '?');
      return;
    }
    if (ev.ph !== 'X') return;
    const tk = ev.pid + ':' + ev.tid;
    tidEvCount.set(tk, (tidEvCount.get(tk) || 0) + 1);
    if (name === 'FireAnimationFrame') {
      let a = rafByTk.get(tk); if (!a) { a = []; rafByTk.set(tk, a); }
      a.push([ts, ev.dur || 0]);
    } else if (name === 'FunctionCall') {
      const fn = ev.args?.data?.functionName || '';
      if (fn === 'loop') {
        let a = loopByTk.get(tk); if (!a) { a = []; loopByTk.set(tk, a); }
        a.push([ts, ev.dur || 0, ev.args?.data?.lineNumber ?? -1, ev.args?.data?.url || '']);
      }
    }
  });
  console.error(`[fb] pass1 done ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}
if (!Number.isFinite(tmin)) { console.error('no events'); process.exit(1); }
// 主线程 = FireAnimationFrame 事件最多的 tk
let mainTk = null, mainRafN = 0;
for (const [tk, a] of rafByTk) if (a.length > mainRafN) { mainTk = tk; mainRafN = a.length; }
const mainPid = +mainTk.split(':')[0];
console.log(`mainTk=${mainTk} [${procNames.get(mainPid)}/${threadNames.get(mainTk)}] rafEvents=${mainRafN}`);

// worker 线程清单（按名字）
const workerTks = [...threadNames.entries()].filter(([tk, n]) => /DedicatedWorker|ServiceWorker thread/.test(n) && tk.startsWith(mainPid + ':')).map(([tk]) => tk);
const gpuPidSet = new Set([...procNames.entries()].filter(([, n]) => /GPU/.test(n)).map(([pid]) => pid));

// ── 分桶聚合容器（bucket = floor((ts-tmin)/2e6)） ──
const NB = 24;
const bucketOf = (ts) => Math.min(NB - 1, Math.max(0, Math.floor((ts - tmin) / 2e6)));
const mk = () => ({
  mainBusyUs: 0, mainXn: 0, rafN: 0, postMain: 0, lpr: 0,
  imgDecN: 0, imgDecUs: 0, compN: 0, compUs: 0,
  gcMinorN: 0, gcMinorUs: 0, gcMajorN: 0, gcMajorUs: 0, gcIncrN: 0, gcIncrUs: 0,
  resReq: 0, resFin: 0,
  gpuTexN: 0, gpuTexBytes: 0, gpuTexUs: 0,
  worker: new Map(),   // tk -> {busyUs, n}
  urlSet: new Set(),
});
const B = Array.from({ length: NB }, mk);
const imgDecAll = [];       // [ts,dur,tk,name]
const compBig = [];         // [ts,dur,tk,name] >2ms
const gpuTexDims = new Map(); // WxH -> {first, n, bytes, us}
const urlFirst = new Map();   // url -> {firstReq, firstFin, n, kind}

const DECODE_RE = /ImageDecode|DecodeImage|ImageDecodeTask|GpuImageDecode|ImagesCopied|ImageDecodeCache/i;
const COMP_RE = /^v8\.compile$|V8\.Compile|v8\.compileModule|ScriptCompilation|CompileLazy|CompileBaseline|CompileOptimized|CompileBackground/i;

// ── PASS 2: 主/worker/GPU X 事件分桶 ──
{
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    if (cat === '__metadata') return;
    const ts = ev.ts || 0, tk = ev.pid + ':' + ev.tid, dur = ev.dur || 0;
    if (tk === mainTk && ev.ph === 'X') {
      const b = bucketOf(ts); const e = B[b];
      e.mainBusyUs += dur; e.mainXn++;
      if (name === 'FireAnimationFrame') e.rafN++;
      else if (name === 'Draw LazyPixelRef') e.lpr++;
      else if (name === 'postMessage' || name === 'PostMessage') e.postMain++;
      else if (DECODE_RE.test(name)) { e.imgDecN++; e.imgDecUs += dur; imgDecAll.push([ts, dur, tk, name]); }
      else if (COMP_RE.test(name)) { e.compN++; e.compUs += dur; if (dur > 2000) compBig.push([ts, dur, tk, name]); }
      else if (name === 'V8.GC_SCAVENGER') { e.gcMinorN++; e.gcMinorUs += dur; }
      else if (name === 'V8.GC_MARK_COMPACTOR') { e.gcMajorN++; e.gcMajorUs += dur; }
      else if (name === 'V8.GC_MC_INCREMENTAL') { e.gcIncrN++; e.gcIncrUs += dur; }
      return;
    }
    // 资源请求（全线程）
    if (/ResourceSendRequest|ResourceReceiveResponse|ResourceFinish/.test(name) && cat.includes('devtools.timeline')) {
      const url = ev.args?.data?.url || ev.args?.url || '';
      if (!url) return;
      const b = bucketOf(ts); B[b].resReq += name === 'ResourceSendRequest' ? 1 : 0;
      B[b].resFin += name === 'ResourceFinish' ? 1 : 0;
      let r = urlFirst.get(url);
      if (!r) { r = { firstReq: 0, firstFin: 0, n: 0 }; urlFirst.set(url, r); }
      if (name === 'ResourceSendRequest') { if (!r.firstReq) r.firstReq = ts; r.n++; B[b].urlSet.add(url); }
      if (name === 'ResourceFinish' && !r.firstFin) r.firstFin = ts;
      return;
    }
    // 解码家族（全线程）
    if (DECODE_RE.test(name) && ev.ph) {
      imgDecAll.push([ts, dur, tk, name]);
      if (ev.ph === 'X') { const b = bucketOf(ts); B[b].imgDecN++; B[b].imgDecUs += dur; }
      return;
    }
    // GPU 纹理上传
    if (gpuPidSet.has(ev.pid) && ev.ph === 'X' && /tex/i.test(name)) {
      const d = ev.args?.data || ev.args || {};
      const w = d.width, h = d.height;
      const b = bucketOf(ts); B[b].gpuTexN++; B[b].gpuTexUs += dur;
      if (w && h) {
        const bytes = w * h * 4;
        B[b].gpuTexBytes += bytes;
        let g = gpuTexDims.get(`${w}x${h}`);
        if (!g) { g = { first: ts, n: 0, bytes: 0, us: 0 }; gpuTexDims.set(`${w}x${h}`, g); }
        g.n++; g.bytes += bytes; g.us += dur;
      }
      return;
    }
    // worker 忙碌
    if (workerTks.includes(tk) && ev.ph === 'X') {
      const b = bucketOf(ts);
      let w = B[b].worker.get(tk); if (!w) { w = { busyUs: 0, n: 0 }; B[b].worker.set(tk, w); }
      w.busyUs += dur; w.n++;
    }
  });
  console.error(`[fb] pass2 done ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}

// ── PASS 3: CPU 采样分桶（主线程 top fns + 首见集;worker busy+top） ──
const sessions = new Map(); let seq3 = 0;
const bucketFns = new Map();  // bucket -> Map(fn -> us)   主线程
const bucketFnSeen = new Map(); // bucket -> Set(fn)        主线程
const bucketTags = new Map(); // bucket -> Map(tag -> us)   主线程
const workerBucketFns = new Map(); // tk -> Map(bucket -> Map(fn->us))
const TAGS = {
  bolt: ['drawBolt', 'stormTexBrightness', 'generateBolt'],
  rain: ['drawRain', 'drawPrecipDust', 'bakeMemoized'],
  raster: ['rasterizePathOp', 'recordPathOp', 'accScratch', 'rasterizeOp'],
  present: ['presentBatch', 'flushAcc', 'replay2D'],
  trail: ['flushTrailShade', 'prettyStarSparkle'],
  hud: ['mmHudBlit'],
  liquid: ['drawVanillaLiquids', 'drawLiquidBehindTilesOnly'],
  atlas: ['atlasIcon', 'atlasIconForKey', 'sheetOf', 'sheetOf$1'],
  light: ['exportTo', 'blurLine', 'surfaceSky', 'compositeLight'],
};
const tagOfFn = new Map();
for (const [t, fns] of Object.entries(TAGS)) for (const f of fns) tagOfFn.set(f, t);
const sessionUrls = new Map(); // sk -> Set(url basename)
{
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    if (!cat.includes('cpu_profiler')) return;
    if (name === 'Profile') {
      const sk = (ev.id || '0x0') + '#' + (++seq3);
      sessions.set(sk, { key: sk, tidKey: ev.pid + ':' + ev.tid, nodes: new Map(), ts: [], ids: [], pending: null, lastTs: 0, init: false, startTs: ev.args?.data?.startTime ?? ev.ts ?? 0 });
      sessionUrls.set(sk, new Set());
      return;
    }
    if (name === 'ProfileChunk') {
      const sk = [...sessions.keys()].find((k) => k.startsWith((ev.id || '') + '#'));
      if (!sk) return;
      const s = sessions.get(sk); if (!s) return;
      const d = ev.args?.data || {};
      const cp = d.cpuProfile || {};
      if (cp.nodes) for (const nd of cp.nodes) {
        const cf = nd.callFrame || {};
        const fn = cf.functionName || '(anonymous)', url = cf.url || '';
        s.nodes.set(nd.id, { p: nd.parent, fn, url, line: cf.lineNumber ?? -1 });
        if (url && !url.endsWith('(idle)')) sessionUrls.get(sk)?.add(url.split('/').pop());
      }
      const samples = cp.samples || [], td = d.timeDeltas || [];
      const m = Math.min(samples.length, td.length);
      if (!s.init) { s.lastTs = s.startTs || 0; s.init = true; }
      const isMain = s.tidKey === mainTk;
      for (let j = 0; j < m; j++) {
        const dt = td[j] >= 0 ? td[j] : 0;
        s.lastTs += dt;
        const node = samples[j];
        if (s.pending !== null) { s.selfUs.set(s.pending, (s.selfUs.get(s.pending) || 0) + dt); s.pending = null; }
        if (j + 1 < m) { const nx = td[j + 1] >= 0 ? td[j + 1] : 0; s.selfUs.set(node, (s.selfUs.get(node) || 0) + nx); }
        else s.pending = node;
        const b = bucketOf(s.lastTs);
        if (isMain) {
          const nd = s.nodes.get(node); if (!nd) continue;
          let fm = bucketFns.get(b); if (!fm) { fm = new Map(); bucketFns.set(b, fm); bucketFnSeen.set(b, new Set()); }
          fm.set(nd.fn, (fm.get(nd.fn) || 0) + dt);
          bucketFnSeen.get(b).add(nd.fn);
          const tg = tagOfFn.get(nd.fn);
          if (tg) { let tm = bucketTags.get(b); if (!tm) { tm = new Map(); bucketTags.set(b, tm); } tm.set(tg, (tm.get(tg) || 0) + dt); }
        } else if (workerTks.includes(s.tidKey)) {
          let bm = workerBucketFns.get(s.tidKey); if (!bm) { bm = new Map(); workerBucketFns.set(s.tidKey, bm); }
          let fm = bm.get(b); if (!fm) { fm = new Map(); bm.set(b, fm); }
          const nd = s.nodes.get(node); if (!nd) continue;
          fm.set(nd.fn, (fm.get(nd.fn) || 0) + dt);
        }
      }
    }
  });
  console.error(`[fb] pass3 done ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}

// worker 命名
const wkName = new Map();
for (const [sk, urls] of sessionUrls) {
  const s = sessions.get(sk);
  const joined = [...urls].join(',');
  let nm = 'worker';
  if (/BakeWorker/.test(joined)) nm = 'BakeWorker';
  else if (/LightWorker/.test(joined)) nm = 'LightWorker';
  else if (/WaveWorker/.test(joined)) nm = 'WaveWorker';
  else if (/BackgroundPump/.test(joined)) nm = 'BackgroundPump';
  else if (/sw\.js/.test(joined)) nm = 'ServiceWorker';
  else if (joined) nm = joined.slice(0, 40);
  wkName.set(s.tidKey, nm + '@' + s.tidKey.split(':')[1]);
}
void 0;

// ── 渲染帧/锚点统计（digest 同口径） ──
const rafMain = (rafByTk.get(mainTk) || []).slice().sort((a, b) => a[0] - b[0]);
const anchors = [];
{ let last = -Infinity; for (const [ts, dur] of rafMain) if (dur >= 3000 && ts - last > 1500) { anchors.push(ts); last = ts; } }
const loopMain = (loopByTk.get(mainTk) || []).slice().sort((a, b) => a[0] - b[0]);

console.log('\n=== 2s 分桶总表 (t 相对 trace 起点) ===');
console.log('t    raf/s rend/s loopMean loopP90 gapP50 gapP90 gapMax | LPR/fr GCm/s post/s | imgDec comp(ms) | resR gpuTex(MB) | workerBusy(ms): bake/light/wave/bg');
const loopLine = loopMain.map(([ts, dur]) => [ts, dur]);
for (let b = 0; b < NB; b++) {
  const t0b = tmin + b * 2e6, t1b = t0b + 2e6;
  const spanS = Math.min(2, (Date.now(), (t1b - tmin) / 1e6 > 42.36 ? 0 : 2)); // 后处理桶可能不满 2s
  const e = B[b];
  const raf = e.rafN;
  const loops = loopLine.filter(([ts]) => ts >= t0b && ts < t1b);
  const heavy = loops.filter(([, d]) => d >= 1500);
  const durs = loops.map(([, d]) => d).sort((a, b2) => a - b2);
  const q = (p) => durs.length ? durs[Math.min(durs.length - 1, Math.floor(durs.length * p))] : 0;
  const gaps = [];
  for (let i = 1; i < anchors.length; i++) { const g = anchors[i] - anchors[i - 1]; if (anchors[i] >= t0b && anchors[i] < t1b) gaps.push(g / 1000); }
  gaps.sort((a, b2) => a - b2);
  const gq = (p) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0;
  const gmax = gaps.length ? gaps[gaps.length - 1] : 0;
  const rendN = heavy.length, rendUs = heavy.reduce((a, [, d]) => a + d, 0);
  const lprPer = rendN ? (e.lpr / rendN).toFixed(1) : '-';
  const wB = (prefix) => { let s = 0; for (const [tk, w] of e.worker) { const nm = wkName.get(tk) || tk; if (nm.startsWith(prefix)) s += w.busyUs; } return (s / 1000).toFixed(1); };
  console.log(
    `${(b * 2).toFixed(0).padStart(3)}s ${(raf / 2).toFixed(0).padStart(4)} ${(rendN / 2).toFixed(0).padStart(4)} ` +
    `${(loops.length ? rendUs / Math.max(1, rendN) / 1000 : 0).toFixed(1).padStart(5)}ms ${(q(0.9) / 1000).toFixed(1).padStart(5)} ` +
    `${gq(0.5).toFixed(1).padStart(5)} ${gq(0.9).toFixed(1).padStart(5)} ${gmax.toFixed(1).padStart(6)} | ` +
    `${lprPer.padStart(6)} ${(e.gcMinorN / 2).toFixed(1).padStart(4)} ${(e.postMain / 2).toFixed(0).padStart(5)} | ` +
    `${String(e.imgDecN).padStart(4)} ${(e.compUs / 1000).toFixed(1).padStart(6)} | ` +
    `${String(e.resReq).padStart(3)} ${(e.gpuTexBytes / 1048576).toFixed(2).padStart(7)} | ` +
    `bake=${wB('BakeWorker')} light=${wB('LightWorker')} wave=${wB('WaveWorker')} bg=${wB('BackgroundPump')}`
  );
}

// 三窗定义
const WINDOWS = [
  ['首入窗 A (+0.5~5s)', 0.5e6, 5e6],
  ['稳态腐化窗 B (+10~25s)', 10e6, 25e6],
  ['出腐化地表窗 C (+28.1~42.36s)', 28.1e6, 42.36e6],
];
const inWin = (ts, w) => ts >= tmin + w[1] && ts < tmin + w[2];

// ── 伪影帧定位 ──
let artIdx = -1, artGap = 0;
for (let i = 1; i < anchors.length; i++) { const g = anchors[i] - anchors[i - 1]; if (g > artGap) { artGap = g; artIdx = i; } }
console.log(`\n伪影巨帧: anchor[${artIdx}] t=+${((anchors[artIdx] - tmin) / 1000).toFixed(1)}ms gap=${(artGap / 1000).toFixed(1)}ms (窗 [${((anchors[artIdx - 1] - tmin) / 1000).toFixed(1)}, ${((anchors[artIdx] - tmin) / 1000).toFixed(1)}]ms)`);
const ART0 = anchors[artIdx - 1], ART1 = anchors[artIdx];

// 渲染帧率 per window (loop heavy)
console.log('\n=== 三窗渲染帧率（主线程 loop≥1.5ms 计渲染帧） ===');
for (const [nm, a, b2] of WINDOWS) {
  const n = loopMain.filter(([ts, d]) => d >= 1500 && inWin(ts, [0, a, b2])).length;
  const span = (b2 - a) / 1e6;
  const gapsW = [];
  for (let i = 1; i < anchors.length; i++) if (inWin(anchors[i], [0, a, b2]) && !(anchors[i] <= ART1 && anchors[i - 1] >= ART0)) gapsW.push((anchors[i] - anchors[i - 1]) / 1000);
  gapsW.sort((x, y) => x - y);
  const gq = (p) => gapsW.length ? gapsW[Math.min(gapsW.length - 1, Math.floor(gapsW.length * p))] : 0;
  console.log(`${nm}: renderFps=${(n / span).toFixed(1)} gapP50=${gq(0.5).toFixed(2)} p90=${gq(0.9).toFixed(2)} p99=${gq(0.99).toFixed(2)}ms (n=${n})`);
}

// ── 分桶标签和 + top fns（主线程） ──
console.log('\n=== 分桶标签自耗(ms/桶) + top8 fn ===');
for (let b = 0; b < NB; b++) {
  const tm = bucketTags.get(b), fm = bucketFns.get(b);
  const tg = tm ? [...tm.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${(v / 1000).toFixed(0)}`).join(' ') : '';
  const top = fm ? [...fm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k}:${(v / 1000).toFixed(0)}`).join(' ') : '';
  console.log(`t=${(b * 2).toFixed(0).padStart(3)}s [${tg}] ${top}`);
}

// ── 首见函数（JIT/首执行证据） ──
console.log('\n=== 主线程首见函数集（按桶;排除桶0;self≥0.5ms;top15/桶） ===');
{
  const seen = new Set();
  for (let b = 0; b < NB; b++) {
    const fs = bucketFnSeen.get(b); const fm = bucketFns.get(b);
    if (!fs) continue;
    const fresh = [];
    for (const fn of fs) if (!seen.has(fn)) { const us = fm.get(fn) || 0; if (us >= 500) fresh.push([fn, us]); }
    for (const fn of fs) seen.add(fn);
    if (b === 0 || !fresh.length) continue;
    fresh.sort((x, y) => y[1] - x[1]);
    console.log(`t=${b * 2}s fresh=${fresh.length}: ${fresh.slice(0, 15).map(([k, v]) => `${k}(${(v / 1000).toFixed(1)}ms)`).join(', ')}`);
  }
}

// ── worker 分桶 top ──
console.log('\n=== worker 分桶 top fns (busy≥5ms/桶才列) ===');
for (const [tk, bm] of workerBucketFns) {
  console.log(`--- ${wkName.get(tk) || tk} ---`);
  for (const [b, fm] of [...bm.entries()].sort((x, y) => x[0] - y[0])) {
    const tot = [...fm.values()].reduce((a, c) => a + c, 0);
    if (tot < 5000) continue;
    const top = [...fm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k}:${(v / 1000).toFixed(1)}`).join(' ');
    console.log(`  t=${b * 2}s tot=${(tot / 1000).toFixed(1)}ms ${top}`);
  }
}

// ── first-seen 资源 ──
console.log('\n=== 资源请求 first-seen（按首请求时刻;桶0-2 全列, 之后 sprites/ 或大文件） ===');
{
  const rows = [...urlFirst.entries()].map(([url, r]) => ({ url, ...r })).sort((a, b2) => a.firstReq - b2.firstReq);
  for (const r of rows) {
    const tRel = (r.firstReq - tmin) / 1e6;
    const fin = r.firstFin ? `fin=+${((r.firstFin - r.firstReq) / 1000).toFixed(0)}ms` : 'fin=?';
    const keep = tRel < 6 || /sprites\/|\.png|\.webp|\.mp3|\.opus|\.wld|\.plr/i.test(r.url);
    if (!keep) continue;
    if (tRel >= 6 && r.n < 2) continue;
    console.log(`t=+${tRel.toFixed(2)}s n=${r.n} ${fin} ${r.url.slice(0, 120)}`);
  }
}

// ── ImageDecode 家族时间线 ──
imgDecAll.sort((a, b2) => a[0] - b2[0]);
console.log(`\n=== ImageDecode 家族全 trace (n=${imgDecAll.length}) ===`);
for (const [ts, dur, tk, name] of imgDecAll) {
  console.log(`t=+${((ts - tmin) / 1e6).toFixed(2)}s dur=${(dur / 1000).toFixed(2)}ms [${threadNames.get(tk) || tk}] ${name}`);
}

// ── GPU tex 尺寸首传 ──
console.log('\n=== GPU tex 尺寸 first-seen (按首传时刻; ≤40 行) ===');
{
  const rows = [...gpuTexDims.entries()].map(([k, g]) => ({ k, ...g })).sort((a, b2) => a.first - b2.first).slice(0, 40);
  for (const g of rows) console.log(`t=+${((g.first - tmin) / 1e6).toFixed(2)}s ${g.k} n=${g.n} bytes=${(g.bytes / 1048576).toFixed(1)}MB us=${(g.us / 1000).toFixed(1)}ms`);
}

// ── compile 大事件 ──
console.log(`\n=== v8 compile >2ms 事件 (n=${compBig.length}) ===`);
for (const [ts, dur, tk, name] of compBig.slice(0, 40)) console.log(`t=+${((ts - tmin) / 1e6).toFixed(2)}s dur=${(dur / 1000).toFixed(2)}ms [${threadNames.get(tk) || tk}] ${name}`);

// ── 每桶资源 URL 新增 ──
console.log('\n=== 每桶新增请求 URL（桶≥1;去重跨桶） ===');
{
  const seenUrl = new Set();
  for (let b = 0; b < NB; b++) {
    const fresh = [...B[b].urlSet].filter((u) => !seenUrl.has(u));
    for (const u of fresh) seenUrl.add(u);
    if (b > 0 && fresh.length) console.log(`t=${b * 2}s +${fresh.length}: ${fresh.slice(0, 10).map((u) => u.slice(0, 90)).join(' | ')}`);
  }
}
