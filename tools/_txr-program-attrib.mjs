#!/usr/bin/env node
// _txr-program-attrib.mjs — 一次性取证：(program) 自耗时间归属交叉验证
// ①主线程 CPU 采样 (program) 节点的时间区间 × 主线程原生 X 事件家族并集求交
// ②GPU 进程纹理尺寸直方图（定视口格数）
// ③emitTileParticles 家族 self/incl + 子节点清单
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-program-attrib.mjs <trace.json>
import fs from 'node:fs';
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];

const sessions = new Map();
const threadNames = new Map();
let mainTidKey = null;
let seq = 0;

// 主线程原生 X 事件家族（时间戳区间）
const famNames = new Set([
  'Commit', 'MinorGC', 'MajorGC', 'IncrementalMarking', 'IncrementalMarkingFinalize',
  'IncrementalMarkingStep', 'GCTask', 'ThreadStateSafePoint', 'CollectGarbage',
  'PrePaint', 'Paint', 'PaintImage', 'Layerize', 'UpdateLayerTree', 'PrePaintInvalidation',
  'CommitUpToDate', 'Animate', 'EventDispatch', 'TimerFire', 'ThreadTimerFire',
  'FunctionCall', 'EvaluateScript', 'FireAnimationFrame', 'RunAnimationFrameCallbacks',
  'RequestAnimationFrame', 'ImageDecode', 'DecodeImage', 'Layout', 'HitTest',
  'InvalidateLayout', 'CompositeLayers', 'DrawFrame', 'RunTask', 'Task', 'V8.Task',
  'Script', 'v8.compile', 'V8.CompileCode', 'V8.Compile', 'Deoptimize', 'WebGL', 'GL',
  'PerformAnimationFrame', 'FireIdleCallback', 'MessageLoop::RunTask', 'ResourceFetch',
]);
const fam = new Map(); // name -> [ts,dur][]
const gpuTex = new Map(); // w×h -> count
const gpuNameTop = new Map();
let gpuPidSet = new Set();
let commitMain = []; // 主线程 Commit 明细

function onEvent(ev) {
  const name = ev.name || '', cat = ev.cat || '';
  if (cat === '__metadata') {
    if (name === 'thread_name') {
      threadNames.set(ev.pid + ':' + ev.tid, ev.args?.name || '?');
      if (ev.args?.name === 'CrRendererMain' && !mainTidKey) mainTidKey = ev.pid + ':' + ev.tid;
      if (ev.args?.name === 'CrGpuMain') gpuPidSet.add(ev.pid);
    }
    return;
  }
  // GPU 进程纹理尺寸
  if (gpuPidSet.has(ev.pid) && ev.ph === 'X') {
    if (/tex(Image|SubImage)2D|DoTexImage2D|DoTexSubImage2D|WebGL/.test(name)) {
      const d = ev.args?.data || ev.args || {};
      const w = d.width, h = d.height;
      if (w && h) {
        const k = `${w}x${h}`;
        gpuTex.set(k, (gpuTex.get(k) || 0) + 1);
      }
    }
    gpuNameTop.set(name, (gpuNameTop.get(name) || 0) + 1);
    return;
  }
  if (!cat.includes('cpu_profiler')) {
    if (ev.ph === 'X' && famNames.has(name)) {
      const tk = ev.pid + ':' + ev.tid;
      if (tk === mainTidKey || threadNames.get(tk) === 'CrRendererMain') {
        if (!fam.has(name)) fam.set(name, []);
        fam.get(name).push([ev.ts || 0, (ev.ts || 0) + (ev.dur || 0)]);
        if (name === 'Commit') commitMain.push([ev.ts || 0, (ev.ts || 0) + (ev.dur || 0)]);
      }
    }
    return;
  }
  if (name === 'Profile') {
    const sk = (ev.id || '0x0') + '#' + (++seq);
    sessions.set(sk, {
      key: sk, pid: ev.pid, tid: ev.tid, tidKey: ev.pid + ':' + ev.tid,
      nodes: new Map(), selfUs: new Map(), ts: [], ids: [],
      pending: null, lastTs: 0, lastTsInit: false,
      startTs: ev.args?.data?.startTime ?? ev.ts ?? 0,
    });
    return;
  }
  if (name === 'ProfileChunk') {
    const s = sessions.get((ev.id || '') + '#' + [...sessions.keys()].length || '');
    // 简化：由 id 反查（与 _txr-tree 相同两步法）
    return;
  }
}

// ProfileChunk 需要 id→session 映射；重放一遍（两遍扫描，第一遍建 Profile，第二遍收 Chunk）
const idToSession = new Map();
function onEvent2(ev) {
  const name = ev.name || '', cat = ev.cat || '';
  if (cat === '__metadata') return;
  if (!cat.includes('cpu_profiler')) return;
  if (name === 'Profile') {
    const sk = (ev.id || '0x0') + '#' + (++seq);
    sessions.set(sk, {
      key: sk, pid: ev.pid, tid: ev.tid, tidKey: ev.pid + ':' + ev.tid,
      nodes: new Map(), selfUs: new Map(), ts: [], ids: [],
      pending: null, lastTs: 0, lastTsInit: false,
      startTs: ev.args?.data?.startTime ?? ev.ts ?? 0,
    });
    idToSession.set(ev.id, sk);
    return;
  }
  if (name === 'ProfileChunk') {
    const sk = idToSession.get(ev.id); if (!sk) return;
    const s = sessions.get(sk); if (!s) return;
    const d = ev.args?.data || {};
    const cp = d.cpuProfile || {};
    if (cp.nodes) for (const nd of cp.nodes) {
      const cf = nd.callFrame || {};
      s.nodes.set(nd.id, { p: nd.parent, fn: cf.functionName || '(anonymous)', url: cf.url || '', line: cf.lineNumber ?? -1 });
    }
    const samples = cp.samples || [], td = d.timeDeltas || [];
    const m = Math.min(samples.length, td.length);
    if (!s.lastTsInit) { s.lastTs = s.startTs || 0; s.lastTsInit = true; }
    for (let j = 0; j < m; j++) {
      const dt = td[j] >= 0 ? td[j] : 0;
      s.lastTs += dt;
      const node = samples[j];
      if (s.pending !== null) { s.selfUs.set(s.pending, (s.selfUs.get(s.pending) || 0) + dt); s.pending = null; }
      if (j + 1 < m) { const nx = td[j + 1] >= 0 ? td[j + 1] : 0; s.selfUs.set(node, (s.selfUs.get(node) || 0) + nx); }
      else s.pending = node;
      s.ts.push(s.lastTs); s.ids.push(node);
    }
  }
}

let t0 = Date.now();
{
  const it = scanTraceStream(tracePath, onEvent);
  console.error(`[attrib] pass1 done: ${JSON.stringify(it && { total: it.total, bad: it.bad })} ${Date.now() - t0}ms`);
}
sessions.clear(); seq = 0;
t0 = Date.now();
{
  const it = scanTraceStream(tracePath, onEvent2);
  console.error(`[attrib] pass2 done: ${JSON.stringify(it && { total: it.total, bad: it.bad })} ${Date.now() - t0}ms`);
}

// ── ③ emitTileParticles 家族 ──
const main = [...sessions.values()].find((s) => threadNames.get(s.tidKey) === 'CrRendererMain');
if (main) {
  const kids = new Map();
  for (const [id, nd] of main.nodes) {
    const pk = nd.p ?? 0;
    if (!kids.has(pk)) kids.set(pk, []);
    kids.get(pk).push(id);
  }
  const totalMemo = new Map();
  const totalOf = (id) => {
    let m = totalMemo.get(id);
    if (m !== undefined) return m;
    m = main.selfUs.get(id) || 0;
    const ch = kids.get(id) || [];
    if (ch.length <= 20000) for (const c of ch) m += totalOf(c);
    totalMemo.set(id, m);
    return m;
  };
  const byFn = new Map(); // fn -> {self, incl, n}
  for (const [id, nd] of main.nodes) {
    const fn = nd.fn;
    let r = byFn.get(fn);
    if (!r) { r = { self: 0, incl: 0, n: 0 }; byFn.set(fn, r); }
    r.self += main.selfUs.get(id) || 0;
    r.incl += totalOf(id);
    r.n++;
  }
  const want = ['emitTileParticles', 'emitTileOrchestraAmbient', 'emitTorchSparks', 'lightAt',
    'hasTile', 'acquireParticle', 'spawnDust', '(program)', '(garbage collector)', 'sheetOf',
    'releaseParticle', 'walkableAbove', 'grassParticleFold', '(idle)', '(root)'];
  console.log('=== FN TABLE (main) ===');
  for (const fn of want) {
    const r = byFn.get(fn);
    if (r) console.log(`${fn}: self=${(r.self / 1000).toFixed(1)}ms incl=${(r.incl / 1000).toFixed(1)}ms nodes=${r.n}`);
    else console.log(`${fn}: ABSENT`);
  }
  // emitTileParticles 直接子节点
  for (const [id, nd] of main.nodes) {
    if (nd.fn === 'emitTileParticles') {
      const ch = (kids.get(id) || []).map((c) => ({ fn: main.nodes.get(c)?.fn, t: totalOf(c) }))
        .sort((a, b) => b.t - a.t).slice(0, 12);
      if (ch.some((c) => c.t > 1000)) {
        console.log(`emitTileParticles@${id} children:`);
        for (const c of ch) if (c.t > 500) console.log(`  ${c.fn}: ${(c.t / 1000).toFixed(1)}ms`);
        break;
      }
    }
  }
  // ── ① (program) 区间 × 事件家族求交 ──
  const progIv = [];
  for (let j = 0; j < main.ids.length; j++) {
    const nd = main.nodes.get(main.ids[j]);
    if (!nd || nd.fn !== '(program)') continue;
    const dt = j + 1 < main.ts.length ? Math.max(0, main.ts[j + 1] - main.ts[j]) : 0;
    if (dt > 0) progIv.push([main.ts[j], main.ts[j] + dt]);
  }
  progIv.sort((a, b) => a[0] - b[0]);
  const progTotal = progIv.reduce((a, b) => a + (b[1] - b[0]), 0);
  console.log(`\n=== (program) intervals: n=${progIv.length} total=${(progTotal / 1000).toFixed(1)}ms ===`);

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
    let total = 0;
    let mi = 0;
    for (const [s, e] of ivs) {
      while (mi < miv.length && miv[mi][1] <= s) mi++;
      let k = mi;
      while (k < miv.length && miv[k][0] < e) {
        total += Math.min(e, miv[k][1]) - Math.max(s, miv[k][0]);
        k++;
      }
    }
    return Math.max(0, total);
  };

  // 家族组
  const groups = {
    Commit: ['Commit'],
    GC: ['MinorGC', 'MajorGC', 'IncrementalMarking', 'IncrementalMarkingFinalize', 'IncrementalMarkingStep', 'GCTask', 'ThreadStateSafePoint', 'CollectGarbage'],
    prepaint_paint: ['PrePaint', 'Paint', 'PaintImage', 'Layerize', 'UpdateLayerTree', 'PrePaintInvalidation', 'CommitUpToDate', 'CompositeLayers'],
    animate_rAF: ['Animate', 'FireAnimationFrame', 'RunAnimationFrameCallbacks', 'RequestAnimationFrame', 'PerformAnimationFrame'],
    input: ['EventDispatch', 'HitTest'],
    timer: ['TimerFire', 'ThreadTimerFire'],
    js_entry: ['FunctionCall', 'EvaluateScript', 'Script', 'v8.compile', 'V8.CompileCode', 'V8.Compile', 'Deoptimize'],
    imgdec: ['ImageDecode', 'DecodeImage'],
    task: ['RunTask', 'Task', 'V8.Task', 'MessageLoop::RunTask'],
  };
  const covered = mergeIv(progIv.map(() => [Infinity, -Infinity]).filter(() => false));
  const allMerged = [];
  console.log('--- family overlap with (program) intervals ---');
  for (const [g, names] of Object.entries(groups)) {
    const ivs = [];
    for (const n of names) for (const iv of (fam.get(n) || [])) ivs.push(iv);
    const merged = mergeIv(ivs);
    const totUs = ivs.reduce((a, b) => a + b[1], 0);
    const ov = intersect(progIv, merged);
    console.log(`${g}: evtTotal=${(totUs / 1000).toFixed(1)}ms mergedSpans=${merged.length} overlapWithProgram=${(ov / 1000).toFixed(1)}ms (${(ov / progTotal * 100).toFixed(1)}%)`);
    if (g !== 'task') for (const iv of merged) allMerged.push(iv);
  }
  const allM = mergeIv(allMerged);
  const allOv = intersect(progIv, allM);
  console.log(`ALL families union coverage of (program): ${(allOv / 1000).toFixed(1)}ms (${(allOv / progTotal * 100).toFixed(1)}%); residual=${((progTotal - allOv) / 1000).toFixed(1)}ms`);

  // Commit 明细分位
  const ds = commitMain.map((x) => x[1]).sort((a, b) => a - b);
  if (ds.length) {
    const q = (p) => ds[Math.min(ds.length - 1, Math.floor(ds.length * p))];
    console.log(`Commit n=${ds.length} p50=${(q(0.5) / 1000).toFixed(2)}ms p90=${(q(0.9) / 1000).toFixed(2)}ms max=${(ds[ds.length - 1] / 1000).toFixed(2)}ms total=${(ds.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}ms`);
  }
  // (program) 单区间分布
  const dl = progIv.map((x) => x[1] - x[0]).sort((a, b) => a - b);
  const q2 = (p) => dl[Math.min(dl.length - 1, Math.floor(dl.length * p))];
  console.log(`(program) interval n=${dl.length} p50=${(q2(0.5) / 1000).toFixed(3)}ms p90=${(q2(0.9) / 1000).toFixed(3)}ms max=${(dl[dl.length - 1] / 1000).toFixed(2)}ms`);
  // 采样间隔（判断采样周期）
  const dts = [];
  for (let j = 1; j < main.ts.length; j++) dts.push(main.ts[j] - main.ts[j - 1]);
  dts.sort((a, b) => a - b);
  console.log(`sample dt p50=${(dts[Math.floor(dts.length / 2)]).toFixed(0)}us p90=${(dts[Math.floor(dts.length * 0.9)]).toFixed(0)}us`);
}

// ── ② GPU 纹理尺寸 ──
console.log('\n=== GPU texture dims (top) ===');
const texTop = [...gpuTex.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [k, n] of texTop) console.log(`${k}: n=${n}`);
if (!texTop.length) console.log('(no width/height args captured)');
console.log('\n=== GPU X names (top20) ===');
for (const [k, n] of [...gpuNameTop.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${k}: n=${n}`);
