#!/usr/bin/env node
// _txr-win3-waitform.mjs — 一次性取证：win3 trace "等待形态" 定谳
// ①全量 FireAnimationFrame 节拍(含 <3ms 轻回调) → rAF 供给率 vs 渲染率(判:BeginFrame 节流 vs 循环内降拍)
// ②主线程 (root)/(program)/(idle) 采样区间 × X 事件家族交并(沿 _txr-program-attrib 判例)
// ③411ms 巨帧窗口(tRel≈22924.2-23335.3) 全线程事件 + 主线程采样栈
// ④可见性/遮挡/多进程清单; GPU 进程与合成器线程构成
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-win3-waitform.mjs <trace.json>
import fs from 'node:fs';
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];
if (!tracePath) { console.error('usage: <trace.json>'); process.exit(64); }

const T0 = 947199560817; // digest t0Us
const rel = (ts) => (ts - T0) / 1000;
const W0 = 22900, W1 = 23340; // 411ms 巨帧窗(留 margin)
const VSYNC = 8333; // 120Hz 网格 µs(待用 DrawFrame 复核)

const threadNames = new Map(); // tidKey -> name
const procNames = new Map();
const rendererPids = new Set();
const allPids = new Set();

let mainTidKey = null;
// 全量 rAF fires: [ts,dur,tid] 扁平
const fires = [];
// 主线程 X 名录: name -> {n, dur}
const mainX = new Map();
const compX = new Map(); // Compositor 线程
const gpuMainX = new Map(); // CrGpuMain
const gpuAllX = new Map(); // GPU 进程全部线程
const vsyncTs = [];
// 主线程家族明细(交并用): name -> [ts,dur][]
const famNames = new Set([
  'Commit', 'PrePaint', 'Paint', 'PaintImage', 'Layerize', 'UpdateLayerTree', 'PrePaintInvalidation',
  'CommitUpToDate', 'Animate', 'EventDispatch', 'TimerFire', 'ThreadTimerFire', 'FunctionCall',
  'EvaluateScript', 'FireAnimationFrame', 'RunAnimationFrameCallbacks', 'RequestAnimationFrame',
  'ImageDecode', 'DecodeImage', 'Layout', 'HitTest', 'InvalidateLayout', 'CompositeLayers',
  'RunTask', 'Task', 'V8.Task', 'BeginMainThreadFrame', 'RequestMainThreadFrame', 'DrawFrame',
  'MinorGC', 'MajorGC', 'IncrementalMarking', 'IncrementalMarkingStep', 'GCTask', 'ThreadStateSafePoint',
  'PaintSetup', 'UpdateLayoutTree', 'ParseHTML', 'XHRLoad', 'ResourceReceiveResponse', 'ResourceFinish',
  'AnimationFrame', 'BeginFrame', 'NeedsBeginFrameChanged', 'SetNeedsBeginFrame',
]);
const fam = new Map();
const runTaskMain = []; // [ts,dur]
const commitMain = []; // [ts,dur]
const droppedTs = [];
// 可见性/遮挡
const visHits = new Map(); // name -> n
const visSamples = new Map(); // name -> 首个 {t, args}
// 411ms 窗口
const winEvents = []; // {t, tidKey, name, ph, dur, cat}
// Profile 会话(仅主线程全存; 其他线程只存 nodes)
const sessions = new Map(); // id -> session
let seq = 0;
const idToSession = new Map();

function onEvent(ev) {
  const name = ev.name || '', cat = ev.cat || '', ph = ev.ph;
  if (cat === '__metadata') {
    if (name === 'process_name') {
      procNames.set(ev.pid, ev.args?.name || '?'); allPids.add(ev.pid);
      if (ev.args?.name === 'Renderer') rendererPids.add(ev.pid);
    } else if (name === 'thread_name') {
      const tk = ev.pid + ':' + ev.tid;
      threadNames.set(tk, ev.args?.name || '?');
      if (ev.args?.name === 'CrRendererMain' && !mainTidKey) mainTidKey = tk;
    }
    return;
  }
  if (cat.includes('cpu_profiler')) {
    if (name === 'Profile') {
      const sk = (ev.id || '0x0') + '#' + (++seq);
      const tk = ev.pid + ':' + ev.tid;
      const isMain = tk === mainTidKey;
      const s = { key: sk, tk, isMain, nodes: new Map(), selfUs: new Map(), tsVec: [], idVec: [], lastTs: 0, init: false, startTs: ev.args?.data?.startTime ?? ev.ts ?? 0 };
      sessions.set(sk, s); idToSession.set(ev.id, sk);
      return;
    }
    if (name === 'ProfileChunk') {
      const sk = idToSession.get(ev.id); if (!sk) return;
      const s = sessions.get(sk); if (!s) return;
      const d = ev.args?.data || {}; const cp = d.cpuProfile || {};
      if (cp.nodes) for (const nd of cp.nodes) {
        const cf = nd.callFrame || {};
        s.nodes.set(nd.id, { p: nd.parent, fn: cf.functionName || '(anonymous)', url: cf.url || '', line: cf.lineNumber ?? -1 });
      }
      const samples = cp.samples || [], td = d.timeDeltas || [];
      const m = Math.min(samples.length, td.length);
      if (!s.init) { s.lastTs = s.startTs || 0; s.init = true; }
      for (let j = 0; j < m; j++) {
        const dt = td[j] >= 0 ? td[j] : 0;
        s.lastTs += dt;
        const node = samples[j];
        if (s.pending !== null && s.pending !== undefined) { s.selfUs.set(s.pending, (s.selfUs.get(s.pending) || 0) + dt); s.pending = null; }
        if (j + 1 < m) { const nx = td[j + 1] >= 0 ? td[j + 1] : 0; s.selfUs.set(node, (s.selfUs.get(node) || 0) + nx); }
        else s.pending = node;
        if (s.isMain) { s.tsVec.push(s.lastTs); s.idVec.push(node); }
      }
      return;
    }
    return;
  }

  const tk = ev.pid + ':' + ev.tid;
  const t = ev.ts || 0;
  // 可见性/遮挡/背景 匹配(全事件)
  if (/visib|occlus|washidden|wasshown|background|foreground|lifecycle|throttl/i.test(name) && ph !== 'I' || /PageVisibility|WasHidden|WasShown|SetVisible|SetBackgrounded|occlusion/i.test(name)) {
    visHits.set(name, (visHits.get(name) || 0) + 1);
    if (!visSamples.has(name)) visSamples.set(name, { t: rel(t), args: ev.args });
  }
  // 411ms 窗口
  const r = t ? rel(t) : -1;
  if (r >= W0 && r <= W1 && (ph === 'X' || ph === 'I' || ph === 'i' || ph === 'b' || ph === 'S' || ph === 'P')) {
    winEvents.push({ t: r, tk, name, ph, dur: ev.dur || 0 });
  }

  if (tk === mainTidKey) {
    if (ph === 'X') {
      let e = mainX.get(name);
      if (!e) { e = { n: 0, dur: 0 }; mainX.set(name, e); }
      e.n++; e.dur += ev.dur || 0;
      if (name === 'FireAnimationFrame') fires.push(t, ev.dur || 0, ev.tid);
      if (name === 'RunTask') runTaskMain.push([t, ev.dur || 0]);
      if (famNames.has(name)) {
        if (!fam.has(name)) fam.set(name, []);
        fam.get(name).push([t, t + (ev.dur || 0)]);
        if (name === 'Commit') commitMain.push([t, t + (ev.dur || 0)]);
      }
    } else if (ph === 'I' || ph === 'i') {
      if (name === 'DroppedFrame') droppedTs.push(t);
    }
  } else if (threadNames.get(tk) === 'Compositor') {
    if (ph === 'X') {
      let e = compX.get(name);
      if (!e) { e = { n: 0, dur: 0 }; compX.set(name, e); }
      e.n++; e.dur += ev.dur || 0;
      if (famNames.has(name)) {
        if (!fam.has(name)) fam.set(name + '@comp', []);
        fam.get(name + '@comp').push([t, t + (ev.dur || 0)]);
      }
    }
  }
  if (ev.pid && threadNames.get(tk) === 'CrGpuMain') {
    if (ph === 'X') {
      let e = gpuMainX.get(name);
      if (!e) { e = { n: 0, dur: 0 }; gpuMainX.set(name, e); }
      e.n++; e.dur += ev.dur || 0;
    }
  }
  if (ev.pid && procNames.get(ev.pid) === 'GPU Process') {
    if (ph === 'X') {
      let e = gpuAllX.get(name);
      if (!e) { e = { n: 0, dur: 0 }; gpuAllX.set(name, e); }
      e.n++; e.dur += ev.dur || 0;
    }
    if (threadNames.get(tk) === 'GpuVSyncThread' && ph === 'X') vsyncTs.push(t);
  }
}

let t0 = Date.now();
{
  const it = scanTraceStream(tracePath, onEvent);
  console.error(`[waitform] scan done total=${it.total} bad=${it.bad} ${Date.now() - t0}ms`);
}
const main = [...sessions.values()].find((s) => s.isMain);

const ms = (us) => (us / 1000).toFixed(1);
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

// ── ① 全量 rAF 节拍 ──
console.log('\n===== ① FireAnimationFrame 全量节拍(main) =====');
{
  const list = [];
  for (let i = 0; i < fires.length; i += 3) if (fires[i + 2] === Number(mainTidKey.split(':')[1])) list.push([fires[i], fires[i + 1]]);
  list.sort((a, b) => a[0] - b[0]);
  // 去重:相邻 <100µs 视为同一回调双记
  const ded = [];
  for (const [ts, dur] of list) {
    if (ded.length && ts - ded[ded.length - 1][0] < 100) { ded[ded.length - 1][1] = Math.max(ded[ded.length - 1][1], dur); continue; }
    ded.push([ts, dur]);
  }
  const durs = ded.map((x) => x[1]).sort((a, b) => a - b);
  console.log(`fires n=${ded.length} (原始 ${list.length}) | dur µs p10=${pct(durs, 0.1).toFixed(0)} p50=${pct(durs, 0.5).toFixed(0)} p90=${pct(durs, 0.9).toFixed(0)} max=${durs[durs.length - 1]?.toFixed(0)}`);
  const ge3 = ded.filter((x) => x[1] >= 3000).length;
  const ge10 = ded.filter((x) => x[1] >= 10000).length;
  console.log(`dur>=3ms: ${ge3} (${(ge3 / ded.length * 100).toFixed(1)}%) | >=10ms: ${ge10} | <1ms: ${ded.filter((x) => x[1] < 1000).length}`);
  const gaps = [];
  for (let i = 1; i < ded.length; i++) gaps.push((ded[i][0] - ded[i - 1][0]) / 1000);
  const gs = gaps.slice().sort((a, b) => a - b);
  console.log(`gap ms p10=${pct(gs, 0.1).toFixed(2)} p50=${pct(gs, 0.5).toFixed(2)} p90=${pct(gs, 0.9).toFixed(2)} max=${gs[gs.length - 1]?.toFixed(2)}`);
  // vsync 网格量化: gap/8.333ms 比值
  const q = new Map();
  for (const g of gaps) { const k = Math.max(1, Math.round(g / 8.333)); q.set(k, (q.get(k) || 0) + 1); }
  console.log('gap/vsync(8.333ms) 倍数分布:', [...q.entries()].sort((a, b) => a[0] - b[0]).slice(0, 14).map(([k, n]) => `${k}x:${n}`).join(' '));
  // 每秒 fires 率
  const t0r = rel(ded[0][0]), t1r = rel(ded[ded.length - 1][0]);
  console.log(`fires 窗口 rel=[${t0r.toFixed(1)}, ${t1r.toFixed(1)}]s 平均率=${(ded.length / Math.max(0.001, t1r - t0r)).toFixed(1)}/s`);
  // 每秒 ≥3ms 渲染帧
  const heavy = ded.filter((x) => x[1] >= 3000);
  const perSec = new Map();
  for (const [ts] of heavy) { const s = Math.floor(rel(ts) / 2000) * 2; perSec.set(s, (perSec.get(s) || 0) + 1); }
  console.log('≥3ms 渲染帧/2s桶:', [...perSec.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join(' '));
  // 窗口内 fires(411ms 巨帧)
  const inWin = ded.filter(([ts]) => { const rr = rel(ts); return rr >= W0 && rr <= W1; });
  console.log(`411ms 窗口 [${W0},${W1}] 内 fires: n=${inWin.length}` + (inWin.length ? ` durs=${inWin.slice(0, 20).map((x) => x[1].toFixed(0)).join(',')}` : ' (rAF 完全断供)'));
  // 保存 heavy anchors 供后续
  globalThis.__heavy = heavy;
}

// ── ② (root)/(program)/(idle) 采样区间 × 家族交并 ──
console.log('\n===== ② 主线程采样顶帧分类与家族交并 =====');
let nodeClass;
if (main) {
  // 节点分类自耗
  const cls = new Map();
  const SYNTH = new Set(['(root)', '(program)', '(idle)', '(garbage collector)']);
  for (const [id, nd] of main.nodes) {
    let c;
    if (SYNTH.has(nd.fn)) c = nd.fn;
    else if (!nd.url && !nd.fn) c = '(root)';
    else if (!nd.url) c = 'nativeAPI/noURL';
    else c = 'js';
    cls.set(c, (cls.get(c) || 0) + (main.selfUs.get(id) || 0));
  }
  nodeClass = cls;
  const tot = [...cls.values()].reduce((a, b) => a + b, 0);
  for (const [c, v] of [...cls.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${ms(v)}ms (${(v / tot * 100).toFixed(1)}%)`);

  // 顶帧区间
  const ivOf = (fnName) => {
    const out = [];
    for (let j = 0; j < main.tsVec.length; j++) {
      const nd = main.nodes.get(main.idVec[j]);
      if (!nd || nd.fn !== fnName) continue;
      const dt = j + 1 < main.tsVec.length ? Math.max(0, main.tsVec[j + 1] - main.tsVec[j]) : 0;
      if (dt > 0) out.push([main.tsVec[j], main.tsVec[j] + dt]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out;
  };
  const mergeIv = (ivs) => {
    if (!ivs.length) return [];
    ivs.sort((a, b) => a[0] - b[0]);
    const out = [ivs[0].slice()];
    for (let k = 1; k < ivs.length; k++) {
      const last = out[out.length - 1];
      if (ivs[k][0] <= last[1]) last[1] = Math.max(last[1], ivs[k][1]);
      else out.push(ivs[k].slice());
    }
    return out;
  };
  const intersect = (ivs, miv) => {
    let total = 0, mi = 0;
    for (const [s, e] of ivs) {
      while (mi < miv.length && miv[mi][1] <= s) mi++;
      let k = mi;
      while (k < miv.length && miv[k][0] < e) { total += Math.min(e, miv[k][1]) - Math.max(s, miv[k][0]); k++; }
    }
    return Math.max(0, total);
  };
  const groups = {
    topRunTask: runTaskMain,
    Commit: fam.get('Commit') || [],
    prepaint_paint: ['PrePaint', 'Paint', 'PaintImage', 'Layerize', 'UpdateLayerTree', 'PrePaintInvalidation', 'CommitUpToDate', 'CompositeLayers', 'PaintSetup'].flatMap((n) => fam.get(n) || []),
    animate_rAF: ['Animate', 'FireAnimationFrame', 'RunAnimationFrameCallbacks', 'RequestAnimationFrame', 'AnimationFrame'].flatMap((n) => fam.get(n) || []),
    beginMain: ['BeginMainThreadFrame'].flatMap((n) => fam.get(n) || []),
    gc: ['MinorGC', 'MajorGC', 'IncrementalMarking', 'IncrementalMarkingStep', 'GCTask', 'ThreadStateSafePoint'].flatMap((n) => fam.get(n) || []),
    input: ['EventDispatch', 'HitTest'].flatMap((n) => fam.get(n) || []),
    timer: ['TimerFire', 'ThreadTimerFire'].flatMap((n) => fam.get(n) || []),
    jsEntry: ['FunctionCall', 'EvaluateScript'].flatMap((n) => fam.get(n) || []),
    imgdec: ['ImageDecode', 'DecodeImage'].flatMap((n) => fam.get(n) || []),
  };
  for (const fnName of ['(root)', '(program)', '(idle)']) {
    const ivs = ivOf(fnName);
    const total = ivs.reduce((a, b) => a + (b[1] - b[0]), 0);
    const lens = ivs.map((x) => x[1] - x[0]).sort((a, b) => a - b);
    console.log(`\n-- ${fnName}: n=${ivs.length} total=${ms(total)}ms p50=${(pct(lens, 0.5) / 1000).toFixed(3)}ms p90=${(pct(lens, 0.9) / 1000).toFixed(3)}ms max=${(lens[lens.length - 1] / 1000).toFixed(2)}ms`);
    let acc = 0;
    const mergedAll = [];
    for (const [g, iv] of Object.entries(groups)) {
      const merged = mergeIv(iv.slice());
      const ov = intersect(ivs, merged);
      acc += ov;
      if (g !== 'topRunTask') for (const x of merged) mergedAll.push(x);
      console.log(`   ∩ ${g}: ${ms(ov)}ms (${(ov / Math.max(1, total) * 100).toFixed(1)}%)`);
    }
    const allM = mergeIv(mergedAll);
    const allOv = intersect(ivs, allM);
    // RunTask 顶层已含所有 task;再算 all(非 task 家族) 联合
    const rtM = mergeIv(runTaskMain.slice());
    const unionM = mergeIv([...rtM, ...allM]);
    const unionOv = intersect(ivs, unionM);
    console.log(`   ∩ RunTask∪家族 联合: ${ms(unionOv)}ms (${(unionOv / Math.max(1, total) * 100).toFixed(1)}%) residual=${ms(total - unionOv)}ms`);
  }
  // (idle) 与 RunTask 的重叠(sanity: 应≈0)
  const idleIv = ivOf('(idle)');
  const rtM = mergeIv(runTaskMain.slice());
  const iOv = intersect(idleIv, rtM);
  console.log(`sanity: (idle)∩RunTask = ${ms(iOv)}ms (应≈0;若大=sampler idle 判定可疑)`);
  // 采样 dt
  const dts = [];
  for (let j = 1; j < main.tsVec.length; j++) dts.push(main.tsVec[j] - main.tsVec[j - 1]);
  dts.sort((a, b) => a - b);
  console.log(`sample dt p50=${pct(dts, 0.5).toFixed(0)}us p90=${pct(dts, 0.9).toFixed(0)}us n=${dts.length}`);
} else console.log('NO MAIN SESSION');

// ── 主线程 X 名录 top(RunTask 分布拆) ──
console.log('\n===== ③ 主线程 X 事件名录(按总 dur) =====');
{
  const rows = [...mainX.entries()].map(([n, e]) => [n, e.n, e.dur]).sort((a, b) => b[2] - a[2]).slice(0, 40);
  for (const [n, c, d] of rows) console.log(`  ${n}: n=${c} total=${ms(d)}ms mean=${(d / Math.max(1, c) / 1000).toFixed(3)}ms`);
  const rt = runTaskMain.map((x) => x[1]).sort((a, b) => a - b);
  console.log(`RunTask(main) n=${rt.length} total=${ms(rt.reduce((a, b) => a + b, 0))}ms p50=${(pct(rt, 0.5) / 1000).toFixed(3)} p90=${(pct(rt, 0.9) / 1000).toFixed(3)} p99=${(pct(rt, 0.99) / 1000).toFixed(3)} max=${(rt[rt.length - 1] / 1000).toFixed(2)}`);
  // >8ms 顶层任务清单 top20
  const big = runTaskMain.filter((x) => x[1] > 8000).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log('RunTask>8ms top20:', big.map(([ts, d]) => `t=${rel(ts).toFixed(1)}:${(d / 1000).toFixed(1)}ms`).join(' ') || '(none)');
  // 每秒 RunTask 忙
  const perSec = new Map();
  for (const [ts, d] of runTaskMain) { const s = Math.floor(rel(ts) / 2000) * 2; perSec.set(s, (perSec.get(s) || 0) + d); }
  console.log('RunTask busy/2s桶(ms):', [...perSec.entries()].sort((a, b) => a[0] - b[0]).map(([s, v]) => `${s}:${(v / 1000).toFixed(0)}`).join(' '));
}

// ── 生命周期/主帧计数 ──
console.log('\n===== ④ 主帧管线计数(main) =====');
for (const n of ['BeginMainThreadFrame', 'RequestMainThreadFrame', 'Commit', 'PrePaint', 'UpdateLayerTree', 'FireAnimationFrame', 'RunAnimationFrameCallbacks', 'RequestAnimationFrame', 'EventDispatch', 'TimerFire', 'PaintSetup']) {
  const e = mainX.get(n);
  console.log(`  ${n}: n=${e ? e.n : 0} total=${e ? ms(e.dur) : 0}ms`);
}
console.log(`DroppedFrame n=${droppedTs.length}`);
{
  const perSec = new Map();
  for (const ts of droppedTs) { const s = Math.floor(rel(ts) / 2000) * 2; perSec.set(s, (perSec.get(s) || 0) + 1); }
  console.log('DroppedFrame/2s桶:', [...perSec.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s}:${n}`).join(' ') || '(none)');
}

// ── 合成器线程 ──
console.log('\n===== ⑤ Compositor 线程 X 名录 =====');
{
  const rows = [...compX.entries()].map(([n, e]) => [n, e.n, e.dur]).sort((a, b) => b[2] - a[2]).slice(0, 20);
  for (const [n, c, d] of rows) console.log(`  ${n}: n=${c} total=${ms(d)}ms mean=${(d / Math.max(1, c) / 1000).toFixed(3)}ms`);
}

// ── GPU 进程 ──
console.log('\n===== ⑥ GPU 进程构成 =====');
console.log('-- CrGpuMain top25 --');
for (const [n, e] of [...gpuMainX.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 25)) console.log(`  ${n}: n=${e.n} total=${ms(e.dur)}ms mean=${(e.dur / Math.max(1, e.n) / 1000).toFixed(3)}ms`);
console.log('-- GPU proc all top15 --');
for (const [n, e] of [...gpuAllX.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 15)) console.log(`  ${n}: n=${e.n} total=${ms(e.dur)}ms`);
console.log(`GpuVSyncThread X n=${vsyncTs.length}`);
if (vsyncTs.length > 2) {
  const g = [];
  vsyncTs.sort((a, b) => a - b);
  for (let i = 1; i < vsyncTs.length; i++) g.push(vsyncTs[i] - vsyncTs[i - 1]);
  g.sort((a, b) => a - b);
  console.log(`  vsync gap p50=${pct(g, 0.5)}us p90=${pct(g, 0.9)}us max=${g[g.length - 1]}us`);
}

// ── 可见性/遮挡/进程清单 ──
console.log('\n===== ⑦ 可见性/遮挡/进程清单 =====');
console.log(`renderer pids: ${[...rendererPids].join(',')} | all pids: ${[...allPids].map((p) => `${p}=${procNames.get(p)}`).join(', ')}`);
for (const [n, c] of [...visHits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  const s = visSamples.get(n);
  console.log(`  ${n}: n=${c} first@t=${s ? s.t.toFixed(2) : '?'}s args=${s ? JSON.stringify(s.args).slice(0, 160) : ''}`);
}

// ── 411ms 巨帧窗口 ──
console.log('\n===== ⑧ 411ms 巨帧窗口 [' + W0 + ',' + W1 + '] =====');
{
  const byTK = new Map();
  for (const w of winEvents) {
    if (!byTK.has(w.tk)) byTK.set(w.tk, new Map());
    const m = byTK.get(w.tk);
    const k = w.name + (w.ph === 'X' ? '' : `:${w.ph}`);
    let e = m.get(k);
    if (!e) { e = { n: 0, dur: 0 }; m.set(k, e); }
    e.n++; e.dur += w.dur;
  }
  for (const [tk, m] of [...byTK.entries()].sort((a, b) => b[1].size - a[1].size)) {
    const nm = threadNames.get(tk) || '?';
    const tot = [...m.values()].reduce((a, b) => a + b.dur, 0);
    console.log(`-- ${tk} ${nm} (事件 ${[...m.values()].reduce((a, b) => a + b.n, 0)}, X总dur ${ms(tot)}ms)`);
    for (const [k, e] of [...m.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 12)) console.log(`    ${k}: n=${e.n} dur=${ms(e.dur)}ms`);
  }
  // 主线程采样栈
  if (main) {
    const cnt = new Map();
    for (let j = 0; j < main.tsVec.length; j++) {
      const rr = rel(main.tsVec[j]);
      if (rr < W0 || rr > W1) continue;
      // 根向 3 帧
      const chain = [];
      let id = main.idVec[j], hop = 0;
      while (id !== undefined && hop < 8) {
        const nd = main.nodes.get(id);
        if (!nd) break;
        chain.push(nd.fn + (nd.url ? '' : '§'));
        id = nd.p; hop++;
        if (chain.length >= 4) break;
      }
      const key = chain.slice(0, 4).join(' <- ');
      cnt.set(key, (cnt.get(key) || 0) + 1);
    }
    const tot = [...cnt.values()].reduce((a, b) => a + b, 0);
    console.log(`-- 窗口内主线程采样 n=${tot} (≈${(tot * 0.19).toFixed(0)}ms) top stacks:`);
    for (const [k, c] of [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${c}×  ${k}`);
  }
}
console.log('\n[done]');
