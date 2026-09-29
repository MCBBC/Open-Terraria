#!/usr/bin/env node
// _txr-firstuse-buckets3.mjs — 一次性取证 v3：腐化首入案 三审
// v2 定谳:渲染链恒 120/s、DrawFrame 恒 120/s → digest anchor-fps(94.3)疑为 ≥3ms 滤波伪迹。
// v3 增:
//  ①双 loop 链分链普查(heavy 归属定谳=哪条是游戏链)
//  ②FrameBeat 状态机离线重放(主链 [ts,dur] 序列 → k 时间线+原因直方图)——权威定谳"是否降拍"
//  ③渲染节拍真口径:游戏链回调间距 gap p50/p90/p99/max + >12ms 失步数/桶(真掉帧分布)
//  ④DroppedFrame/桶 + 原始 LPR/桶
//  ⑤贵帧普查:>8.33ms/>16.67ms 帧计数 + top20 贵帧 + top10 贵帧的 CPU 采样归因
//  ⑥资源 first-seen 修复(v2 被 main 分支吞掉 ph=I 事件)
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-firstuse-buckets3.mjs <trace.json>
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];

const threadNames = new Map();
const procNames = new Map();
let tmin = Infinity;
const rafByTk = new Map();
const loopByTk = new Map();   // tk -> [ts,dur,fn,line][]
const drawFrameTs = new Map();
const droppedTs = [];

// ── PASS 1 ──
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
    if (name === 'DroppedFrame') { droppedTs.push(ts); return; }
    if (ev.ph !== 'X') return;
    const tk = ev.pid + ':' + ev.tid;
    if (name === 'FireAnimationFrame') {
      let a = rafByTk.get(tk); if (!a) { a = []; rafByTk.set(tk, a); }
      a.push([ts, ev.dur || 0]);
    } else if (name === 'FunctionCall') {
      const fn = ev.args?.data?.functionName || '';
      if (fn === 'loop' || fn === 'render' || fn === 'fixedUpdate' || fn === 'step') {
        let a = loopByTk.get(tk); if (!a) { a = []; loopByTk.set(tk, a); }
        a.push([ts, ev.dur || 0, fn, ev.args?.data?.lineNumber ?? -1]);
      }
    }
  });
  console.error(`[fb3] pass1 ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}
if (!Number.isFinite(tmin)) { console.error('no events'); process.exit(1); }
let mainTk = null, mainRafN = 0;
for (const [tk, a] of rafByTk) if (a.length > mainRafN) { mainTk = tk; mainRafN = a.length; }
const mainPid = +mainTk.split(':')[0];
let dfTk = null, dfN = 0;
for (const [tk, a] of drawFrameTs) if (a.length > dfN) { dfTk = tk; dfN = a.length; }
console.log(`mainTk=${mainTk} rafEvents=${mainRafN} | drawFrameTk=${dfTk} [${threadNames.get(dfTk)}] n=${dfN} | DroppedFrame=${droppedTs.length}`);

const workerTks = [...threadNames.entries()].filter(([tk, n]) => /DedicatedWorker|ServiceWorker thread/.test(n) && tk.startsWith(mainPid + ':')).map(([tk]) => tk);
const gpuPidSet = new Set([...procNames.entries()].filter(([, n]) => /GPU/.test(n)).map(([pid]) => pid));

const NB = 24;
const bucketOf = (ts) => Math.min(NB - 1, Math.max(0, Math.floor((ts - tmin) / 2e6)));
const mkB = () => ({
  postMain: 0, lpr: 0, imgDecN: 0, compN: 0, compUs: 0,
  gcMinorN: 0, gcMinorUs: 0, gcMajorN: 0, gcMajorUs: 0,
  resReq: 0, dropN: 0, worker: new Map(), urlSet: new Set(),
});
const B = Array.from({ length: NB }, mkB);
const urlFirst = new Map();
const imgDecAll = [];
const compBig = [];
const DECODE_RE = /ImageDecode|DecodeImage|ImageDecodeTask|GpuImageDecode|ImagesCopied|ImageDecodeCache/i;
const COMP_RE = /^v8\.compile$|V8\.Compile|v8\.compileModule|ScriptCompilation|CompileLazy|CompileBaseline|CompileOptimized|CompileBackground/i;

// ── PASS 2 ──
{
  const isRes = (name) => /ResourceSendRequest|ResourceFinish/.test(name);
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    if (cat === '__metadata') return;
    const ts = ev.ts || 0, tk = ev.pid + ':' + ev.tid, dur = ev.dur || 0;
    // 资源(先于 main 分支,防 ph=I 被吞)
    if (isRes(name) && cat.includes('devtools.timeline')) {
      const url = ev.args?.data?.url || ev.args?.url || '';
      if (!url) return;
      const b = bucketOf(ts);
      let r = urlFirst.get(url);
      if (!r) { r = { firstReq: 0, firstFin: 0, n: 0 }; urlFirst.set(url, r); }
      if (name === 'ResourceSendRequest') { if (!r.firstReq) r.firstReq = ts; r.n++; B[b].resReq++; B[b].urlSet.add(url); }
      if (name === 'ResourceFinish' && !r.firstFin) r.firstFin = ts;
      return;
    }
    if (tk === mainTk) {
      if ((ev.ph === 'I' || ev.ph === 'i') && name === 'Draw LazyPixelRef') { B[bucketOf(ts)].lpr++; return; }
      if (ev.ph !== 'X') return;
      const e = B[bucketOf(ts)];
      if (name === 'postMessage' || name === 'PostMessage') e.postMain++;
      else if (DECODE_RE.test(name)) { e.imgDecN++; if (dur > 300) imgDecAll.push([ts, dur, tk, name]); }
      else if (COMP_RE.test(name)) { e.compN++; e.compUs += dur; if (dur > 2000) compBig.push([ts, dur, tk, name]); }
      else if (name === 'V8.GC_SCAVENGER') { e.gcMinorN++; e.gcMinorUs += dur; }
      else if (name === 'V8.GC_MARK_COMPACTOR') { e.gcMajorN++; e.gcMajorUs += dur; }
      return;
    }
    if (name === 'DroppedFrame') { B[bucketOf(ts)].dropN++; return; }
    if (DECODE_RE.test(name) && ev.ph === 'X') {
      B[bucketOf(ts)].imgDecN++;
      if (dur > 300) imgDecAll.push([ts, dur, tk, name]);
      return;
    }
    if (workerTks.includes(tk) && ev.ph === 'X') {
      const b = bucketOf(ts);
      let w = B[b].worker.get(tk); if (!w) { w = { busyUs: 0, n: 0 }; B[b].worker.set(tk, w); }
      w.busyUs += dur; w.n++;
    }
  });
  console.error(`[fb3] pass2 ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}

// ── PASS 3: CPU 采样（分桶 top + 贵帧归因用样本流） ──
const sessions = new Map(); let seq3 = 0;
const bucketFns = new Map();
const bucketFnSeen = new Map();
const bucketBusyUs = new Map();
const workerBucketFns = new Map();
const bucketTags = new Map();
function bucketTagsAcc(b) { let tm = bucketTags.get(b); if (!tm) { tm = new Map(); bucketTags.set(b, tm); } return tm; }
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
let mainSamples = null; // {ts:[], ids:[]} 贵帧归因
let mainSession = null;
{
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    if (!cat.includes('cpu_profiler')) return;
    if (name === 'Profile') {
      const sk = (ev.id || '0x0') + '#' + (++seq3);
      sessions.set(sk, { key: sk, tidKey: ev.pid + ':' + ev.tid, nodes: new Map(), selfUs: new Map(), pending: null, lastTs: 0, init: false, startTs: ev.args?.data?.startTime ?? ev.ts ?? 0 });
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
        s.nodes.set(nd.id, { p: nd.parent, fn: cf.functionName || '(anonymous)', url: cf.url || '' });
        if (cf.url) sessionUrls.get(sk)?.add(cf.url.split('/').pop());
      }
      const samples = cp.samples || [], td = d.timeDeltas || [];
      const m = Math.min(samples.length, td.length);
      if (!s.init) { s.lastTs = s.startTs || 0; s.init = true; }
      const isMain = s.tidKey === mainTk;
      if (isMain && !mainSamples) { mainSamples = { ts: [], ids: [] }; mainSession = s; }
      for (let j = 0; j < m; j++) {
        const dt = td[j] >= 0 ? td[j] : 0;
        s.lastTs += dt;
        const node = samples[j];
        if (s.pending !== null) { s.selfUs.set(s.pending, (s.selfUs.get(s.pending) || 0) + dt); s.pending = null; }
        if (j + 1 < m) { const nx = td[j + 1] >= 0 ? td[j + 1] : 0; s.selfUs.set(node, (s.selfUs.get(node) || 0) + nx); }
        else s.pending = node;
        const b = bucketOf(s.lastTs);
        if (isMain) {
          mainSamples.ts.push(s.lastTs); mainSamples.ids.push(node);
          const nd = s.nodes.get(node); if (!nd) continue;
          let bb = bucketBusyUs.get(b); if (!bb) { bb = { busy: 0, idle: 0 }; bucketBusyUs.set(b, bb); }
          if (nd.fn === '(idle)') bb.idle += dt; else bb.busy += dt;
          let fm = bucketFns.get(b); if (!fm) { fm = new Map(); bucketFns.set(b, fm); bucketFnSeen.set(b, new Set()); }
          fm.set(nd.fn, (fm.get(nd.fn) || 0) + dt);
          bucketFnSeen.get(b).add(nd.fn);
          const tg = tagOfFn.get(nd.fn);
          if (tg) { let tm = bucketTagsAcc(b); tm.set(tg, (tm.get(tg) || 0) + dt); }
        } else if (workerTks.includes(s.tidKey)) {
          let bm = workerBucketFns.get(s.tidKey); if (!bm) { bm = new Map(); workerBucketFns.set(s.tidKey, bm); }
          let fm = bm.get(b); if (!fm) { fm = new Map(); bm.set(b, fm); }
          const nd = s.nodes.get(node); if (!nd) continue;
          fm.set(nd.fn, (fm.get(nd.fn) || 0) + dt);
        }
      }
    }
  });
  console.error(`[fb3] pass3 ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
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
  wkName.set(s.tidKey, nm);
}

// ── 链归属定谳 ──
const rafMain = (rafByTk.get(mainTk) || []).slice().sort((a, b) => a[0] - b[0]);
const loopMain = (loopByTk.get(mainTk) || []).slice().sort((a, b) => a[0] - b[0]);
const chains = new Map(); // "fn@line" -> {n, heavy, sumDur, durs:[]}
for (const [ts, dur, fn, line] of loopMain) {
  const k = `${fn}@${line}`;
  let c = chains.get(k); if (!c) { c = { n: 0, heavy: 0, sumDur: 0, durs: [], ts: [] }; chains.set(k, c); }
  c.n++; c.sumDur += dur; c.durs.push(dur); c.ts.push(ts);
  if (dur >= 1500) c.heavy++;
}
console.log('\n=== 链普查（主线程 FunctionCall） ===');
for (const [k, c] of chains) {
  const d = c.durs.slice().sort((a, b) => a - b);
  const q = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
  console.log(`${k}: n=${c.n} heavy(≥1.5ms)=${c.heavy} mean=${(c.sumDur / c.n / 1000).toFixed(2)}ms p50=${(q(0.5) / 1000).toFixed(2)} p95=${(q(0.95) / 1000).toFixed(2)} max=${(d[d.length - 1] / 1000).toFixed(2)}ms`);
}
// 游戏链 = heavy 最多者
let gameKey = null, gameHeavy = -1;
for (const [k, c] of chains) if (c.heavy > gameHeavy) { gameHeavy = c.heavy; gameKey = k; }
const game = chains.get(gameKey);
console.log(`游戏链=${gameKey} (heavy=${gameHeavy}/${game.n})`);

// ── FrameBeat 离线重放 ──
// 状态机逐字重放(FrameBeat.ts 语义):observeVsync 每回调;shouldRender 决定;cost=回调 dur(仅渲染回调)
{
  const GRID_MS = 1000 / 60, BEAT_K_MAX = 6, UPGRADE_WIN = 30, UPGRADE_HOLD = 2, MISS_SLACK = 0.7;
  const VSYNC_WIN = 31, COST_WIN = 60, VSYNC_MIN = 2, VSYNC_MAX = 100, GAP_RESET = 250, GUARD = 2, FLOOR_TOL = 0.04;
  let cap = 0, k = 1, ordinal = 0, vsyncPeriod = GRID_MS;
  let vsyncDeltas = [], lastVsyncTs = -1, costWin = [], lastRenderAt = -1, lastGap = 0, upHoldN = 0, missStreak = 0;
  const targetMs = () => (cap > 0 ? 1000 / cap : vsyncPeriod);
  const minK = () => Math.max(1, Math.ceil((targetMs() * (1 - FLOOR_TOL)) / vsyncPeriod));
  const budget = (kk = k) => kk * vsyncPeriod;
  const pctl = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
  const kTimeline = [];  // [ts, k, reason] 拍变更点
  let skips = 0, renders = 0;
  const skipDurs = [], reasonHist = new Map();
  const stepDownAt = [], stepUpAt = [];
  for (let i = 0; i < game.ts.length; i++) {
    const now = game.ts[i], dur = game.durs[i];
    // observeVsync
    cap = 0; // frameCap 由 options 注入;cap=0 语义=不设限(若实机 cap>0 会改变 floor——下文敏感性另算)
    let d;
    if (lastVsyncTs >= 0) {
      d = now - lastVsyncTs;
      if (d > GAP_RESET) vsyncDeltas = [];
      else {
        vsyncDeltas.push(d);
        if (vsyncDeltas.length > VSYNC_WIN) vsyncDeltas.shift();
        const s = [...vsyncDeltas].sort((a, b) => a - b);
        const trim = Math.min(Math.ceil(s.length * 0.1), (s.length - 1) >> 1);
        let sum = 0;
        for (let j = trim; j < s.length - trim; j++) sum += s[j];
        vsyncPeriod = Math.min(VSYNC_MAX, Math.max(VSYNC_MIN, sum / (s.length - 2 * trim)));
      }
    }
    lastVsyncTs = now;
    ordinal += d === undefined ? 1 : Math.min(8, Math.max(1, Math.round(d / vsyncPeriod)));
    // shouldRender
    let willRender;
    if (ordinal < k) willRender = false;
    else if (k * vsyncPeriod >= targetMs() - GUARD) willRender = true;
    else willRender = (now - lastRenderAt >= targetMs() - GUARD);
    if (!willRender) { skips++; skipDurs.push(dur); continue; }
    renders++;
    // beginRender
    lastGap = lastRenderAt >= 0 ? now - lastRenderAt : 0;
    lastRenderAt = now; ordinal = 0;
    // endRender(cost=dur)
    const cost = dur;
    costWin.push(cost);
    if (costWin.length > COST_WIN) costWin.shift();
    const vs = vsyncPeriod, floor = minK(), prevK = k;
    if (lastGap > (k + MISS_SLACK) * vs) missStreak++; else missStreak = 0;
    if (k < BEAT_K_MAX && cost > budget()) { k++; stepDownAt.push([now, k, 'overbudget', cost]); }
    while (k < BEAT_K_MAX && pctl(costWin, 0.95) > budget()) { k++; stepDownAt.push([now, k, 'capacity', pctl(costWin, 0.95)]); }
    if (k < floor) { k = floor; stepDownAt.push([now, k, 'floor', 0]); }
    if (k !== prevK) { ordinal = 0; missStreak = 0; upHoldN = 0; kTimeline.push([now, k, stepDownAt[stepDownAt.length - 1]?.[2] || '?']); }
    else {
      if (missStreak > 0) upHoldN = 0;
      if (k > floor && pctl(costWin, 0.5) < budget(k - 1)) {
        if (++upHoldN >= UPGRADE_WIN * UPGRADE_HOLD) { k--; stepUpAt.push([now, k]); kTimeline.push([now, k, 'upgrade']); ordinal = 0; upHoldN = 0; missStreak = 0; }
      } else upHoldN = 0;
      if (missStreak >= 2 && k < BEAT_K_MAX) { k++; kTimeline.push([now, k, 'miss-streak']); ordinal = 0; missStreak = 0; upHoldN = 0; }
    }
  }
  console.log(`\n=== FrameBeat 重放（cap=0 语义） ===`);
  console.log(`重放渲染帧=${renders} 跳帧=${skips} (实查链 n=${game.n} heavy=${game.heavy})`);
  console.log(`拍变更点 n=${kTimeline.length}:`);
  for (const [ts, kk, why] of kTimeline.slice(0, 40)) console.log(`  t=+${((ts - tmin) / 1e6).toFixed(2)}s → k=${kk} (${why})`);
  if (kTimeline.length > 40) console.log(`  ...共 ${kTimeline.length} 次`);
  if (skips) {
    const sd = skipDurs.slice().sort((a, b) => a - b);
    console.log(`跳帧回调 dur p50=${(sd[Math.floor(sd.length / 2)] / 1000).toFixed(2)}ms max=${(sd[sd.length - 1] / 1000).toFixed(2)}ms (真跳帧应 <0.5ms)`);
  }
  // cap=120 敏感性:minK = ceil((1000/120×0.96)/8.33)=1 同 → 拍不变;cap=60 → floor=2
}

// ── 渲染节拍真口径（游戏链回调间距） ──
console.log('\n=== 2s 分桶·渲染节拍真口径 ===');
console.log('t   | rend/s skipN | gapP50 gapP90 gapP99 gapMax >12.5ms | LPR/fr | busy% | drop | GCm/s | worker busy(ms): bake/light/wave');
{
  const gts = game.ts, gd = game.durs;
  for (let b = 0; b < NB; b++) {
    const t0b = tmin + b * 2e6, t1b = t0b + 2e6;
    const e = B[b];
    let n = 0, sk = 0;
    const gaps = [];
    for (let i = 0; i < gts.length; i++) {
      if (gts[i] < t0b || gts[i] >= t1b) continue;
      n++;
      if (gd[i] < 1500) sk++;
      if (i > 0 && gts[i - 1] >= t0b - 2e6) { const g = (gts[i] - gts[i - 1]) / 1000; if (g < 100) gaps.push(g); }
    }
    gaps.sort((a, b2) => a - b2);
    const gq = (p) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0;
    const over12 = gaps.filter((g) => g > 12.5).length;
    const bb = bucketBusyUs.get(b);
    const busyPct = bb ? (bb.busy / Math.max(1, bb.busy + bb.idle) * 100).toFixed(0) : '-';
    const wB = (prefix) => { let s = 0; for (const [tk, w] of e.worker) { if ((wkName.get(tk) || '').startsWith(prefix)) s += w.busyUs; } return (s / 1000).toFixed(0); };
    console.log(
      `${String(b * 2).padStart(3)}s | ${(n / 2).toFixed(0).padStart(5)} ${String(sk).padStart(4)} | ` +
      `${gq(0.5).toFixed(1).padStart(6)} ${gq(0.9).toFixed(1).padStart(6)} ${gq(0.99).toFixed(1).padStart(6)} ${gq(1).toFixed(1).padStart(6)} ${String(over12).padStart(5)} | ` +
      `${(n ? (e.lpr / n).toFixed(0) : '-').padStart(5)} | ${(busyPct + '%').padStart(5)} | ${String(e.dropN).padStart(4)} | ${(e.gcMinorN / 2).toFixed(1).padStart(4)} | ` +
      `bake=${wB('Bake')} light=${wB('Light')} wave=${wB('Wave')}`
    );
  }
}

// ── 贵帧普查 ──
console.log('\n=== 贵帧普查（游戏链回调 dur） ===');
{
  const idx = game.durs.map((d, i) => i).sort((a, b) => game.durs[b] - game.durs[a]);
  let over8 = 0, over16 = 0, over33 = 0;
  for (const d of game.durs) { if (d > 8333) over8++; if (d > 16667) over16++; if (d > 33333) over33++; }
  console.log(`>8.33ms 帧=${over8}  >16.67ms=${over16}  >33.3ms=${over33}  (n=${game.durs.length})`);
  console.log('top20 贵帧:');
  for (const i of idx.slice(0, 20)) console.log(`  t=+${((game.ts[i] - tmin) / 1e6).toFixed(3)}s dur=${(game.durs[i] / 1000).toFixed(2)}ms`);
  // top10 贵帧 CPU 归因
  if (mainSamples) {
    console.log('top10 贵帧窗内 CPU 自耗 top5:');
    const mts = mainSamples.ts, mids = mainSamples.ids;
    for (const i of idx.slice(0, 10)) {
      const w0 = game.ts[i], w1 = game.ts[i] + game.durs[i];
      const agg = new Map();
      let lo = 0, hi = mts.length - 1, start = mts.length;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (mts[mid] >= w0) { start = mid; hi = mid - 1; } else lo = mid + 1; }
      for (let j = start; j < mts.length && mts[j] < w1; j++) {
        const nd = mainSession?.nodes.get(mids[j]);
        if (!nd) continue;
        agg.set(nd.fn, (agg.get(nd.fn) || 0) + 90);
      }
      const top = [...agg.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 5).map(([k2, v]) => `${k2}:~${(v / 1000).toFixed(1)}ms`).join(' ');
      console.log(`  t=+${((w0 - tmin) / 1e6).toFixed(3)}s dur=${(game.durs[i] / 1000).toFixed(2)}ms ${top}`);
    }
  }
}

// ── 三窗节拍（真口径） ──
const WINDOWS = [
  ['A 首入 (+0.5~5s)', 0.5e6, 5e6],
  ['B 稳态腐化 (+10~25s)', 10e6, 25e6],
  ['C 出腐化地表 (+28.1~42.36s)', 28.1e6, 42.36e6],
];
const inWin = (ts, w) => ts >= tmin + w[1] && ts < tmin + w[2];
console.log('\n=== 三窗节拍真口径 ===');
for (const [nm, a, b2] of WINDOWS) {
  const w = [0, a, b2];
  const span = (b2 - a) / 1e6;
  let n = 0, sk = 0;
  const gaps = [];
  for (let i = 0; i < game.ts.length; i++) {
    if (!inWin(game.ts[i], w)) continue;
    n++;
    if (game.durs[i] < 1500) sk++;
    if (i > 0 && inWin(game.ts[i - 1], w)) { const g = (game.ts[i] - game.ts[i - 1]) / 1000; if (g < 100) gaps.push(g); }
  }
  gaps.sort((x, y) => x - y);
  const gq = (p) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : 0;
  const dfW = (drawFrameTs.get(dfTk) || []).filter((ts) => inWin(ts, w)).length;
  console.log(`${nm}: rend/s=${(n / span).toFixed(1)} skip=${sk} df/s=${(dfW / span).toFixed(1)} gapP50=${gq(0.5).toFixed(2)} p90=${gq(0.9).toFixed(2)} p99=${gq(0.99).toFixed(2)} max=${gq(1).toFixed(1)}ms >12.5ms=${gaps.filter((g) => g > 12.5).length}`);
}

// ── 三窗 CPU 自耗 top15 ──
console.log('\n=== 三窗主线程 CPU 自耗 top15 ===');
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
  const rows = [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 15);
  console.log(`--- ${nm} (sampledWall=${(wall / 1000).toFixed(0)}ms) ---`);
  for (const [fn, us] of rows) console.log(`  ${(us / 1000).toFixed(1).padStart(8)}ms ${(us / Math.max(1, wall) * 100).toFixed(1).padStart(5)}%  ${fn}`);
}

console.log('\n=== 分桶标签自耗(ms/桶) + top6 fn ===');
for (let b = 0; b < NB; b++) {
  const tm = bucketTags.get(b), fm = bucketFns.get(b);
  const tg = tm ? [...tm.entries()].sort((x, y) => y[1] - x[1]).map(([k2, v]) => `${k2}=${(v / 1000).toFixed(0)}`).join(' ') : '';
  const top = fm ? [...fm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k2, v]) => `${k2}:${(v / 1000).toFixed(0)}`).join(' ') : '';
  console.log(`t=${(b * 2).toFixed(0).padStart(3)}s [${tg}] ${top}`);
}

console.log('\n=== 主线程首见函数集（按桶;排除桶0;self≥1ms） ===');
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
    console.log(`t=${b * 2}s fresh=${fresh.length}: ${fresh.slice(0, 12).map(([k2, v]) => `${k2}(${(v / 1000).toFixed(1)}ms)`).join(', ')}`);
  }
}

console.log('\n=== worker 分桶 top (busy≥5ms/桶) ===');
for (const [tk, bm] of workerBucketFns) {
  const nm = wkName.get(tk) || tk;
  if (nm === 'ServiceWorker' || nm === 'BackgroundPump') continue;
  console.log(`--- ${nm} ---`);
  for (const [b, fm] of [...bm.entries()].sort((x, y) => x[0] - y[0])) {
    const tot = [...fm.values()].reduce((a2, c) => a2 + c, 0);
    if (tot < 5000) continue;
    const top = [...fm.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k2, v]) => `${k2}:${(v / 1000).toFixed(1)}`).join(' ');
    console.log(`  t=${b * 2}s tot=${(tot / 1000).toFixed(1)}ms ${top}`);
  }
}

console.log('\n=== 资源请求 first-seen（全列） ===');
{
  const rows = [...urlFirst.entries()].map(([url, r]) => ({ url, ...r })).sort((a, b2) => a.firstReq - b2.firstReq);
  for (const r of rows) {
    const tRel = (r.firstReq - tmin) / 1e6;
    const fin = r.firstFin ? `fin=+${((r.firstFin - r.firstReq) / 1000).toFixed(0)}ms` : 'fin=?';
    console.log(`t=+${tRel.toFixed(2)}s n=${r.n} ${fin} ${r.url.slice(0, 110)}`);
  }
  if (!rows.length) console.log('(无 ResourceSendRequest 事件)');
}

imgDecAll.sort((a, b2) => a[0] - b2[0]);
console.log(`\n=== ImageDecode >0.3ms (n=${imgDecAll.length}) ===`);
for (const [ts, dur, tk, name] of imgDecAll.slice(0, 40)) console.log(`t=+${((ts - tmin) / 1e6).toFixed(2)}s dur=${(dur / 1000).toFixed(2)}ms [${threadNames.get(tk) || tk}] ${name}`);

console.log(`\n=== v8 compile >2ms (n=${compBig.length}) ===`);
for (const [ts, dur, tk, name] of compBig.slice(0, 30)) console.log(`t=+${((ts - tmin) / 1e6).toFixed(2)}s dur=${(dur / 1000).toFixed(2)}ms [${threadNames.get(tk) || tk}] ${name}`);

console.log('\n=== DroppedFrame 分布 ===');
{
  const byB = new Map();
  for (const ts of droppedTs) { const b = bucketOf(ts); byB.set(b, (byB.get(b) || 0) + 1); }
  for (const [b, n] of [...byB.entries()].sort((x, y) => x[0] - y[0])) console.log(`t=${b * 2}s: ${n}`);
}
