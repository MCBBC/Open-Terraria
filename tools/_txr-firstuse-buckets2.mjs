#!/usr/bin/env node
// _txr-firstuse-buckets2.mjs — 一次性取证 v2：腐化首入 120→80-90fps 早期窗 vs 稳态窗分桶对比
// ①主线程 2s 桶：渲染帧(loop链分链) / DrawFrame(合成器呈现节拍) / LPR / GC / postMessage / busy%
// ②first-seen 清单：资源请求 URL / ImageDecode 家族 / v8 compile 家族 / 首见函数集(JIT)
// ③worker 分桶忙碌(BakeWorker/LightWorker/WaveWorker/BackgroundPump) — C4 wbake 波次
// ④CPU 采样分桶自耗 top 函数 + 标签和(战役同款词表) + 三窗聚合
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-firstuse-buckets2.mjs <trace.json>
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];

const threadNames = new Map();
const procNames = new Map();
let tmin = Infinity;
const rafByTk = new Map();
const loopByTk = new Map();   // tk -> [ts,dur,fn,line,url][]
const drawFrameTs = new Map(); // tidKey -> [ts]

// ── PASS 1: metadata + tmin + rAF/loop/DrawFrame 普查 ──
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
    if (name === 'DrawFrame') {
      const tk = ev.pid + ':' + ev.tid;
      let a = drawFrameTs.get(tk); if (!a) { a = []; drawFrameTs.set(tk, a); }
      a.push(ts);
      return;
    }
    if (ev.ph !== 'X') return;
    const tk = ev.pid + ':' + ev.tid;
    if (name === 'FireAnimationFrame') {
      let a = rafByTk.get(tk); if (!a) { a = []; rafByTk.set(tk, a); }
      a.push([ts, ev.dur || 0]);
    } else if (name === 'FunctionCall') {
      const fn = ev.args?.data?.functionName || '';
      if (fn === 'loop' || fn === 'render' || fn === 'fixedUpdate') {
        let a = loopByTk.get(tk); if (!a) { a = []; loopByTk.set(tk, a); }
        a.push([ts, ev.dur || 0, fn, ev.args?.data?.lineNumber ?? -1, ev.args?.data?.url || '']);
      }
    }
  });
  console.error(`[fb] pass1 done ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}
if (!Number.isFinite(tmin)) { console.error('no events'); process.exit(1); }
let mainTk = null, mainRafN = 0;
for (const [tk, a] of rafByTk) if (a.length > mainRafN) { mainTk = tk; mainRafN = a.length; }
const mainPid = +mainTk.split(':')[0];
let dfTk = null, dfN = 0;
for (const [tk, a] of drawFrameTs) if (a.length > dfN) { dfTk = tk; dfN = a.length; }
console.log(`mainTk=${mainTk} [${procNames.get(mainPid)}/${threadNames.get(mainTk)}] rafEvents=${mainRafN} | drawFrameTk=${dfTk} [${threadNames.get(dfTk)}] n=${dfN}`);

const workerTks = [...threadNames.entries()].filter(([tk, n]) => /DedicatedWorker|ServiceWorker thread/.test(n) && tk.startsWith(mainPid + ':')).map(([tk]) => tk);
const gpuPidSet = new Set([...procNames.entries()].filter(([, n]) => /GPU/.test(n)).map(([pid]) => pid));

const NB = 24;
const bucketOf = (ts) => Math.min(NB - 1, Math.max(0, Math.floor((ts - tmin) / 2e6)));
const mkB = () => ({
  mainXn: 0, rafN: 0, postMain: 0, lpr: 0,
  imgDecN: 0, imgDecUs: 0, compN: 0, compUs: 0,
  gcMinorN: 0, gcMinorUs: 0, gcMajorN: 0, gcMajorUs: 0, gcIncrN: 0, gcIncrUs: 0,
  resReq: 0, gpuTexN: 0, gpuTexUs: 0, gpuXUs: 0,
  worker: new Map(), urlSet: new Set(),
});
const B = Array.from({ length: NB }, mkB);
const imgDecAll = [];
const compBig = [];
const urlFirst = new Map();
const DECODE_RE = /ImageDecode|DecodeImage|ImageDecodeTask|GpuImageDecode|ImagesCopied|ImageDecodeCache/i;
const COMP_RE = /^v8\.compile$|V8\.Compile|v8\.compileModule|ScriptCompilation|CompileLazy|CompileBaseline|CompileOptimized|CompileBackground/i;

// ── PASS 2: 主/worker/GPU X + LPR(I) 分桶 ──
{
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    if (cat === '__metadata') return;
    const ts = ev.ts || 0, tk = ev.pid + ':' + ev.tid, dur = ev.dur || 0;
    if (tk === mainTk) {
      if ((ev.ph === 'I' || ev.ph === 'i') && name === 'Draw LazyPixelRef') { B[bucketOf(ts)].lpr++; return; }
      if (ev.ph !== 'X') return;
      const b = bucketOf(ts); const e = B[b];
      e.mainXn++;
      if (name === 'FireAnimationFrame') e.rafN++;
      else if (name === 'postMessage' || name === 'PostMessage') e.postMain++;
      else if (DECODE_RE.test(name)) { e.imgDecN++; e.imgDecUs += dur; imgDecAll.push([ts, dur, tk, name]); }
      else if (COMP_RE.test(name)) { e.compN++; e.compUs += dur; if (dur > 2000) compBig.push([ts, dur, tk, name]); }
      else if (name === 'V8.GC_SCAVENGER') { e.gcMinorN++; e.gcMinorUs += dur; }
      else if (name === 'V8.GC_MARK_COMPACTOR') { e.gcMajorN++; e.gcMajorUs += dur; }
      else if (name === 'V8.GC_MC_INCREMENTAL') { e.gcIncrN++; e.gcIncrUs += dur; }
      return;
    }
    if (/ResourceSendRequest|ResourceFinish/.test(name) && cat.includes('devtools.timeline')) {
      const url = ev.args?.data?.url || ev.args?.url || '';
      if (!url) return;
      const b = bucketOf(ts);
      let r = urlFirst.get(url);
      if (!r) { r = { firstReq: 0, firstFin: 0, n: 0 }; urlFirst.set(url, r); }
      if (name === 'ResourceSendRequest') { if (!r.firstReq) r.firstReq = ts; r.n++; B[b].resReq++; B[b].urlSet.add(url); }
      if (name === 'ResourceFinish' && !r.firstFin) r.firstFin = ts;
      return;
    }
    if (DECODE_RE.test(name) && ev.ph === 'X') {
      const b = bucketOf(ts); B[b].imgDecN++; B[b].imgDecUs += dur;
      if (dur > 300) imgDecAll.push([ts, dur, tk, name]);
      return;
    }
    if (gpuPidSet.has(ev.pid) && ev.ph === 'X') {
      const b = bucketOf(ts); B[b].gpuXUs += dur;
      if (/tex/i.test(name)) { B[b].gpuTexN++; B[b].gpuTexUs += dur; }
      return;
    }
    if (workerTks.includes(tk) && ev.ph === 'X') {
      const b = bucketOf(ts);
      let w = B[b].worker.get(tk); if (!w) { w = { busyUs: 0, n: 0 }; B[b].worker.set(tk, w); }
      w.busyUs += dur; w.n++;
    }
  });
  console.error(`[fb] pass2 done ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}

// ── PASS 3: CPU 采样分桶 ──
const sessions = new Map(); let seq3 = 0;
const bucketFns = new Map();
const bucketFnSeen = new Map();
const bucketTags = new Map();
const bucketBusyUs = new Map();
const workerBucketFns = new Map();
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
const sessionUrls = new Map();
{
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    if (!cat.includes('cpu_profiler')) return;
    if (name === 'Profile') {
      const sk = (ev.id || '0x0') + '#' + (++seq3);
      sessions.set(sk, { key: sk, tidKey: ev.pid + ':' + ev.tid, nodes: new Map(), selfUs: new Map(), ts: [], ids: [], pending: null, lastTs: 0, init: false, startTs: ev.args?.data?.startTime ?? ev.ts ?? 0 });
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
        if (url) sessionUrls.get(sk)?.add(url.split('/').pop());
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
          let bb = bucketBusyUs.get(b); if (!bb) { bb = { busy: 0, idle: 0 }; bucketBusyUs.set(b, bb); }
          if (nd.fn === '(idle)') bb.idle += dt; else bb.busy += dt;
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

// ── 帧节拍数据准备 ──
const rafMain = (rafByTk.get(mainTk) || []).slice().sort((a, b) => a[0] - b[0]);
const anchors = [];
{ let last = -Infinity; for (const [ts, dur] of rafMain) if (dur >= 3000 && ts - last > 1500) { anchors.push(ts); last = ts; } }
const loopMain = (loopByTk.get(mainTk) || []).slice().sort((a, b) => a[0] - b[0]);
const dfMain = (drawFrameTs.get(dfTk) || []).slice().sort((a, b) => a - b);

const chainIds = new Map();
for (const [, , fn, line] of loopMain) {
  const k = `${fn}@${line}`;
  chainIds.set(k, (chainIds.get(k) || 0) + 1);
}
console.log('\n=== loop/render/fixedUpdate 链识别 (主线程 FunctionCall) ===');
for (const [k, n] of [...chainIds.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: n=${n}`);
let gameChain = null, gameChainN = 0;
for (const [k, n] of chainIds) if (k.startsWith('render@')) { gameChain = k; gameChainN = n; }
if (!gameChain) {
  for (const [k, n] of chainIds) if (k.startsWith('loop@') && n > gameChainN) { gameChain = k; gameChainN = n; }
}

console.log('\n=== 2s 分桶总表 ===');
console.log('t   | rend/s loopAll | df/s dfP50 dfP90 | anch/s ancGapP50 | LPR/fr | busy% | GCm/s post/s | imgDec comp(ms) resR | worker busy(ms): bake/light/wave/bg');
for (let b = 0; b < NB; b++) {
  const t0b = tmin + b * 2e6, t1b = t0b + 2e6;
  const e = B[b];
  const inB = (ts) => ts >= t0b && ts < t1b;
  const loops = loopMain.filter(([ts]) => inB(ts));
  const chainLoops = gameChain ? loops.filter(([, , fn, line]) => `${fn}@${line}` === gameChain) : [];
  const heavy = chainLoops.filter(([, d]) => d >= 1500).length;
  const rendN = gameChain && gameChain.startsWith('render@') ? chainLoops.length : heavy;
  const dfs = dfMain.filter(inB);
  const dgaps = [];
  for (let i = 1; i < dfMain.length; i++) if (inB(dfMain[i])) dgaps.push((dfMain[i] - dfMain[i - 1]) / 1000);
  dgaps.sort((a, b2) => a - b2);
  const dq = (p) => dgaps.length ? dgaps[Math.min(dgaps.length - 1, Math.floor(dgaps.length * p))] : 0;
  const agaps = [];
  for (let i = 1; i < anchors.length; i++) if (inB(anchors[i])) agaps.push((anchors[i] - anchors[i - 1]) / 1000);
  agaps.sort((a, b2) => a - b2);
  const aq = (p) => agaps.length ? agaps[Math.min(agaps.length - 1, Math.floor(agaps.length * p))] : 0;
  const bb = bucketBusyUs.get(b);
  const busyPct = bb ? (bb.busy / Math.max(1, bb.busy + bb.idle) * 100).toFixed(0) : '-';
  const lprPer = rendN ? (e.lpr / rendN).toFixed(0) : '-';
  const wB = (prefix) => { let s = 0; for (const [tk, w] of e.worker) { const nm = wkName.get(tk) || tk; if (nm.startsWith(prefix)) s += w.busyUs; } return (s / 1000).toFixed(0); };
  console.log(
    `${String(b * 2).padStart(3)}s | ${(rendN / 2).toFixed(0).padStart(5)} ${String(loops.length).padStart(5)} | ` +
    `${(dfs.length / 2).toFixed(0).padStart(4)} ${dq(0.5).toFixed(1).padStart(5)} ${dq(0.9).toFixed(1).padStart(5)} | ` +
    `${(agaps.length / 2).toFixed(0).padStart(4)} ${aq(0.5).toFixed(1).padStart(6)} | ` +
    `${lprPer.padStart(6)} | ${(busyPct + '%').padStart(5)} | ` +
    `${(e.gcMinorN / 2).toFixed(1).padStart(4)} ${(e.postMain / 2).toFixed(0).padStart(5)} | ` +
    `${String(e.imgDecN).padStart(4)} ${(e.compUs / 1000).toFixed(1).padStart(6)} ${String(e.resReq).padStart(3)} | ` +
    `bake=${wB('BakeWorker')} light=${wB('LightWorker')} wave=${wB('WaveWorker')} bg=${wB('BackgroundPump')}`
  );
}

let artGap = 0, artEnd = 0;
for (let i = 1; i < anchors.length; i++) { const g = anchors[i] - anchors[i - 1]; if (g > artGap) { artGap = g; artEnd = anchors[i]; } }
console.log(`\n伪影巨帧: t=+${((artEnd - artGap) / 1000).toFixed(1)}..${((artEnd - tmin) / 1000).toFixed(1)}ms gap=${(artGap / 1000).toFixed(1)}ms`);

const WINDOWS = [
  ['A 首入 (+0.5~5s)', 0.5e6, 5e6],
  ['B 稳态腐化 (+10~25s)', 10e6, 25e6],
  ['C 出腐化地表 (+28.1~42.36s)', 28.1e6, 42.36e6],
];
const inWin = (ts, w) => ts >= tmin + w[1] && ts < tmin + w[2];

console.log('\n=== 三窗节拍（含伪影帧的 drawFrame 口径已按窗天然排除桶0大部分） ===');
for (const [nm, a, b2] of WINDOWS) {
  const w = [0, a, b2];
  const span = (b2 - a) / 1e6;
  const rendN = loopMain.filter(([ts, d, fn, line]) => `${fn}@${line}` === gameChain && inWin(ts, w) && (gameChain.startsWith('render@') || d >= 1500)).length;
  const dfsW = dfMain.filter((ts) => inWin(ts, w));
  const dgaps = [];
  for (let i = 1; i < dfMain.length; i++) if (inWin(dfMain[i], w)) dgaps.push((dfMain[i] - dfMain[i - 1]) / 1000);
  dgaps.sort((x, y) => x - y);
  const dq = (p) => dgaps.length ? dgaps[Math.min(dgaps.length - 1, Math.floor(dgaps.length * p))] : 0;
  console.log(`${nm}: renderFps=${(rendN / span).toFixed(1)} drawFrame/s=${(dfsW.length / span).toFixed(1)} dfGapP50=${dq(0.5).toFixed(2)} p90=${dq(0.9).toFixed(2)} p99=${dq(0.99).toFixed(2)} max=${dq(1).toFixed(1)}ms`);
}

console.log('\n=== 三窗主线程 CPU 自耗 top20 (ms; 括号=占采样wall%) ===');
{
  for (const [nm, a, b2] of WINDOWS) {
    const agg = new Map(); let wall = 0;
    for (let b = 0; b < NB; b++) {
      const t0b = tmin + b * 2e6, t1b = t0b + 2e6;
      if (t1b <= tmin + a || t0b >= tmin + b2) continue;
      const fm = bucketFns.get(b); if (!fm) continue;
      for (const [fn, us] of fm) agg.set(fn, (agg.get(fn) || 0) + us);
      const bb = bucketBusyUs.get(b);
      if (bb) wall += bb.busy + bb.idle;
    }
    const rows = [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 20);
    console.log(`--- ${nm} (sampledWall=${(wall / 1000).toFixed(0)}ms) ---`);
    for (const [fn, us] of rows) console.log(`  ${(us / 1000).toFixed(1).padStart(8)}ms ${(us / Math.max(1, wall) * 100).toFixed(1).padStart(5)}%  ${fn}`);
  }
}

console.log('\n=== 三窗标签自耗(ms) ===');
for (const [nm, a, b2] of WINDOWS) {
  const agg = new Map();
  for (let b = 0; b < NB; b++) {
    const t0b = tmin + b * 2e6, t1b = t0b + 2e6;
    if (t1b <= tmin + a || t0b >= tmin + b2) continue;
    const tm = bucketTags.get(b); if (!tm) continue;
    for (const [tg, us] of tm) agg.set(tg, (agg.get(tg) || 0) + us);
  }
  const s = [...agg.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${(v / 1000).toFixed(0)}`).join(' ');
  console.log(`${nm}: ${s}`);
}

console.log('\n=== 分桶标签自耗(ms/桶) + top6 fn ===');
for (let b = 0; b < NB; b++) {
  const tm = bucketTags.get(b), fm = bucketFns.get(b);
  const tg = tm ? [...tm.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${(v / 1000).toFixed(0)}`).join(' ') : '';
  const top = fm ? [...fm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k}:${(v / 1000).toFixed(0)}`).join(' ') : '';
  console.log(`t=${(b * 2).toFixed(0).padStart(3)}s [${tg}] ${top}`);
}

console.log('\n=== 主线程首见函数集（按桶;排除桶0;self≥1ms;top15/桶） ===');
{
  const seen = new Set();
  for (let b = 0; b < NB; b++) {
    const fs = bucketFnSeen.get(b); const fm = bucketFns.get(b);
    if (!fs) continue;
    const fresh = [];
    for (const fn of fs) if (!seen.has(fn)) { const us = fm.get(fn) || 0; if (us >= 1000) fresh.push([fn, us]); }
    for (const fn of fs) seen.add(fn);
    if (b === 0 || !fresh.length) continue;
    fresh.sort((x, y) => y[1] - x[1]);
    console.log(`t=${b * 2}s fresh=${fresh.length}: ${fresh.slice(0, 15).map(([k, v]) => `${k}(${(v / 1000).toFixed(1)}ms)`).join(', ')}`);
  }
}

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

console.log('\n=== 资源请求 first-seen（全列,按首请求时刻） ===');
{
  const rows = [...urlFirst.entries()].map(([url, r]) => ({ url, ...r })).sort((a, b2) => a.firstReq - b2.firstReq);
  for (const r of rows) {
    const tRel = (r.firstReq - tmin) / 1e6;
    const fin = r.firstFin ? `fin=+${((r.firstFin - r.firstReq) / 1000).toFixed(0)}ms` : 'fin=?';
    console.log(`t=+${tRel.toFixed(2)}s n=${r.n} ${fin} ${r.url.slice(0, 120)}`);
  }
}

imgDecAll.sort((a, b2) => a[0] - b2[0]);
console.log(`\n=== ImageDecode 家族 (主线程全量+他线>0.3ms; n=${imgDecAll.length}) ===`);
for (const [ts, dur, tk, name] of imgDecAll.slice(0, 60)) {
  console.log(`t=+${((ts - tmin) / 1e6).toFixed(2)}s dur=${(dur / 1000).toFixed(2)}ms [${threadNames.get(tk) || tk}] ${name}`);
}

console.log(`\n=== v8 compile >2ms 事件 (n=${compBig.length}) ===`);
for (const [ts, dur, tk, name] of compBig.slice(0, 40)) console.log(`t=+${((ts - tmin) / 1e6).toFixed(2)}s dur=${(dur / 1000).toFixed(2)}ms [${threadNames.get(tk) || tk}] ${name}`);

console.log('\n=== 每桶新增请求 URL（桶≥1） ===');
{
  const seenUrl = new Set();
  for (let b = 0; b < NB; b++) {
    const fresh = [...B[b].urlSet].filter((u) => !seenUrl.has(u));
    for (const u of fresh) seenUrl.add(u);
    if (b > 0 && fresh.length) console.log(`t=${b * 2}s +${fresh.length}: ${fresh.slice(0, 10).map((u) => u.slice(0, 90)).join(' | ')}`);
  }
}
