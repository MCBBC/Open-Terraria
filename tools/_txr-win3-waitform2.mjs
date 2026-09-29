#!/usr/bin/env node
// _txr-win3-waitform2.mjs — win3 "等待形态" 定谳 第二轮:
// A 409ms 巨任务(t≈22512.9) 内容+采样栈; B 采样↔X对齐阳性对照; C FunctionCall 函数名直方图
// D 每2s管线表(BeginMain/Commit/fires/heavy/RunTask/idle); E k=重渲染/主帧 轨迹
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-win3-waitform2.mjs <trace.json>
import fs from 'node:fs';
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];
const T0 = 947199560817;
const rel = (ts) => (ts - T0) / 1000;

const threadNames = new Map();
let mainTidKey = null;
const fires = []; // [ts,dur]
const pageAnim = []; // [ts,dur] PageAnimator::serviceScriptedAnimations
const commits = []; // [ts]
const reqMain = []; // (compositor I events) [ts]
const beginFrame = []; // (compositor I) [ts]
const funcCalls = []; // [ts,dur,fnName]
const bigTasks = []; // main X dur>20ms [ts,dur,name]
const runTaskMain = []; // [ts,dur]
// 双窗
const WINDOWS = [[22505, 22935, '409ms任务窗'], [22905, 23345, '巨帧后对照窗']];
const winEvents = WINDOWS.map(() => []);
// 主线程采样
let mainS = null;
const sessions = new Map();
let seq = 0;
const idToSession = new Map();

function onEvent(ev) {
  const name = ev.name || '', cat = ev.cat || '', ph = ev.ph;
  if (cat === '__metadata') {
    if (name === 'thread_name') {
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
      const s = { tk, isMain: tk === mainTidKey, nodes: new Map(), tsVec: [], idVec: [], lastTs: 0, init: false, startTs: ev.args?.data?.startTime ?? ev.ts ?? 0 };
      sessions.set(sk, s); idToSession.set(ev.id, sk);
      return;
    }
    if (name === 'ProfileChunk') {
      const s = sessions.get(idToSession.get(ev.id)); if (!s) return;
      const d = ev.args?.data || {}; const cp = d.cpuProfile || {};
      if (cp.nodes) for (const nd of cp.nodes) {
        const cf = nd.callFrame || {};
        s.nodes.set(nd.id, { p: nd.parent, fn: cf.functionName || '(anonymous)', url: cf.url || '' });
      }
      const samples = cp.samples || [], td = d.timeDeltas || [];
      const m = Math.min(samples.length, td.length);
      if (!s.init) { s.lastTs = s.startTs || 0; s.init = true; }
      for (let j = 0; j < m; j++) {
        s.lastTs += td[j] >= 0 ? td[j] : 0;
        if (s.isMain) { s.tsVec.push(s.lastTs); s.idVec.push(samples[j]); }
      }
      return;
    }
    return;
  }
  const tk = ev.pid + ':' + ev.tid;
  const t = ev.ts || 0;
  if (tk !== mainTidKey) {
    if (threadNames.get(tk) === 'Compositor' && ph === 'I') {
      if (name === 'RequestMainThreadFrame') reqMain.push(t);
      else if (name === 'BeginFrame') beginFrame.push(t);
    }
    return;
  }
  // 主线程
  const r = t ? rel(t) : -1;
  for (let w = 0; w < WINDOWS.length; w++) {
    if (r >= WINDOWS[w][0] && r <= WINDOWS[w][1] && (ph === 'X' || ph === 'I' || ph === 'i' || ph === 'b')) {
      winEvents[w].push({ t: r, name, ph, dur: ev.dur || 0 });
    }
  }
  if (ph === 'X') {
    if (name === 'FireAnimationFrame') fires.push(t, ev.dur || 0);
    else if (name === 'PageAnimator::serviceScriptedAnimations') pageAnim.push([t, ev.dur || 0]);
    else if (name === 'Commit') commits.push(t);
    else if (name === 'RunTask') runTaskMain.push([t, ev.dur || 0]);
    else if (name === 'FunctionCall') {
      const fn = ev.args?.data?.functionName ?? '?';
      funcCalls.push([t, ev.dur || 0, fn]);
    } else if ((ev.dur || 0) > 20000) bigTasks.push([t, ev.dur || 0, name]);
  }
}

let t0 = Date.now();
{
  const it = scanTraceStream(tracePath, onEvent);
  console.error(`[waitform2] scan total=${it.total} bad=${it.bad} ${Date.now() - t0}ms`);
}
mainS = [...sessions.values()].find((s) => s.isMain);
const ms = (us) => (us / 1000).toFixed(1);
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

// ── A. 409ms 巨任务窗 ──
for (let w = 0; w < WINDOWS.length; w++) {
  const [a, b, label] = WINDOWS[w];
  console.log(`\n===== 窗口 [${a},${b}] ${label} =====`);
  const byName = new Map();
  for (const e of winEvents[w]) {
    const k = e.name + (e.ph === 'X' ? '' : ':' + e.ph);
    let o = byName.get(k);
    if (!o) { o = { n: 0, dur: 0 }; byName.set(k, o); }
    o.n++; o.dur += e.dur;
  }
  for (const [k, o] of [...byName.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 14)) console.log(`  ${k}: n=${o.n} dur=${ms(o.dur)}ms`);
  // 采样栈
  if (mainS) {
    const cnt = new Map();
    for (let j = 0; j < mainS.tsVec.length; j++) {
      const rr = rel(mainS.tsVec[j]);
      if (rr < a || rr > b) continue;
      const chain = [];
      let id = mainS.idVec[j];
      for (let hop = 0; hop < 5 && id !== undefined;) {
        const nd = mainS.nodes.get(id);
        if (!nd) break;
        chain.push(nd.fn);
        id = nd.p; hop++;
        if (chain.length >= 4) break;
      }
      const key = chain.join('<-');
      cnt.set(key, (cnt.get(key) || 0) + 1);
    }
    const tot = [...cnt.values()].reduce((x, y) => x + y, 0);
    console.log(`  采样 n=${tot}≈${(tot * 0.19).toFixed(0)}ms top:`);
    for (const [k, c] of [...cnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 14)) console.log(`    ${c}× ${k}`);
  }
}

// ── B. 采样↔X 对齐阳性对照: 重 rAF span 内采样分类 ──
console.log('\n===== B. 对齐对照: heavy rAF span 内主线程采样顶帧分类 =====');
{
  const heavy = [];
  for (let i = 0; i < fires.length; i += 2) if (fires[i + 1] >= 3000) heavy.push([fires[i], fires[i + 1]]);
  heavy.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [ts, dur] of heavy) {
    if (merged.length && ts <= merged[merged.length - 1][1]) { merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], ts + dur); continue; }
    merged.push([ts, ts + dur]);
  }
  const cls = new Map();
  let inSpan = 0;
  if (mainS) {
    let mi = 0;
    for (let j = 0; j < mainS.tsVec.length; j++) {
      const ts = mainS.tsVec[j];
      const dt = j + 1 < mainS.tsVec.length ? Math.max(0, mainS.tsVec[j + 1] - mainS.tsVec[j]) : 0;
      while (mi < merged.length && merged[mi][1] <= ts) mi++;
      if (mi >= merged.length || merged[mi][0] > ts) continue;
      inSpan += Math.min(dt, merged[mi][1] - ts);
      const nd = mainS.nodes.get(mainS.idVec[j]);
      const c = nd ? (['(root)', '(program)', '(idle)', '(garbage collector)'].includes(nd.fn) ? nd.fn : (nd.url ? 'js:' + nd.fn : 'api:' + nd.fn)) : '?';
      cls.set(c, (cls.get(c) || 0) + 1);
    }
  }
  console.log(`heavy span 合计=${ms(merged.reduce((x, y) => x + (y[1] - y[0]), 0))}ms 内采样墙=${ms(inSpan)}ms`);
  for (const [c, n] of [...cls.entries()].sort((x, y) => y[1] - x[1]).slice(0, 20)) console.log(`  ${c}: ${n}`);
}

// ── C. FunctionCall 函数名直方图 + 每2s ──
console.log('\n===== C. FunctionCall(main) 函数名直方图 =====');
{
  const byFn = new Map();
  for (const [ts, dur, fn] of funcCalls) {
    let o = byFn.get(fn);
    if (!o) { o = { n: 0, dur: 0, durs: [] }; byFn.set(fn, o); }
    o.n++; o.dur += dur; o.durs.push(dur);
  }
  const rows = [...byFn.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 14);
  for (const [fn, o] of rows) {
    const ds = o.durs.sort((a, b) => a - b);
    console.log(`  ${fn}: n=${o.n} total=${ms(o.dur)}ms mean=${(o.dur / o.n / 1000).toFixed(2)}ms p50=${(pct(ds, 0.5) / 1000).toFixed(2)}ms p90=${(pct(ds, 0.9) / 1000).toFixed(2)}ms >=3ms=${o.durs.filter((d) => d >= 3000).length}`);
  }
  // 每2s: top 函数名计数
  const topFns = rows.slice(0, 5).map(([fn]) => fn);
  const per = new Map();
  for (const [ts, dur, fn] of funcCalls) {
    if (!topFns.includes(fn)) continue;
    const b = Math.floor(rel(ts) / 2000) * 2;
    if (!per.has(b)) per.set(b, Object.fromEntries(topFns.map((f) => [f, 0])));
    per.get(b)[fn]++;
  }
  console.log('  每2s计数(列=' + topFns.join('/') + '):');
  for (const [b, o] of [...per.entries()].sort((x, y) => x[0] - y[0])) console.log(`    t=${b}: ${topFns.map((f) => o[f]).join('/')}`);
}

// ── D. 每2s 管线表 ──
console.log('\n===== D. 每2s 管线表 =====');
{
  const B = (ts) => Math.floor(rel(ts) / 2000) * 2;
  const rows = new Map();
  const row = (ts) => {
    const b = B(ts);
    if (!rows.has(b)) rows.set(b, { pa: 0, cm: 0, fire: 0, heavy: 0, rt: 0, rm: 0, bf: 0 });
    return rows.get(b);
  };
  for (const [ts] of pageAnim) row(ts).pa++;
  for (const ts of commits) row(ts).cm++;
  for (let i = 0; i < fires.length; i += 2) { row(fires[i]).fire++; if (fires[i + 1] >= 3000) row(fires[i]).heavy++; }
  for (const [ts, d] of runTaskMain) row(ts).rt += d / 1000;
  for (const ts of reqMain) { const b = B(ts); if (!rows.has(b)) rows.set(b, { pa: 0, cm: 0, fire: 0, heavy: 0, rt: 0, rm: 0, bf: 0 }); rows.get(b).rm++; }
  for (const ts of beginFrame) { const b = B(ts); if (!rows.has(b)) rows.set(b, { pa: 0, cm: 0, fire: 0, heavy: 0, rt: 0, rm: 0, bf: 0 }); rows.get(b).bf++; }
  console.log('  t | bf(合成器BeginFrame) | reqMain | PageAnim(main帧) | Commit | fires | heavy | RunTask忙ms');
  for (const [b, o] of [...rows.entries()].sort((x, y) => x[0] - y[0])) {
    console.log(`  ${b} | ${o.bf} | ${o.rm} | ${o.pa} | ${o.cm} | ${o.fire} | ${o.heavy} | ${o.rt.toFixed(0)}`);
  }
}

// ── E. k=两次重渲染间的主帧数 ──
console.log('\n===== E. 渲染间隔内的主帧数 k(PageAnimator 计数) =====');
{
  const heavy = [];
  for (let i = 0; i < fires.length; i += 2) if (fires[i + 1] >= 3000) heavy.push(fires[i]);
  heavy.sort((a, b) => a - b);
  const ded = [];
  for (const ts of heavy) if (!ded.length || ts - ded[ded.length - 1] > 1500) ded.push(ts);
  let pi = 0;
  const kHist = new Map();
  const kList = [];
  for (let i = 1; i < ded.length; i++) {
    while (pi < pageAnim.length && pageAnim[pi][0] < ded[i - 1]) pi++;
    let k = 0;
    let pj = pi;
    while (pj < pageAnim.length && pageAnim[pj][0] < ded[i]) { k++; pj++; }
    kHist.set(k, (kHist.get(k) || 0) + 1);
    kList.push(k);
  }
  console.log('k 分布(两次≥3ms渲染间的 PageAnimator 帧数):', [...kHist.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${n}`).join(' '));
  // 时间轨迹 每5s k 中位
  const seg = new Map();
  for (let i = 0; i < kList.length; i++) {
    const b = Math.floor(rel(ded[i + 1]) / 5000) * 5;
    if (!seg.has(b)) seg.set(b, []);
    seg.get(b).push(kList[i]);
  }
  for (const [b, arr] of [...seg.entries()].sort((x, y) => x[0] - y[0])) console.log(`  t=${b}s: k中位=${pct(arr.slice().sort((a, b2) => a - b2), 0.5)} mean=${(arr.reduce((x, y) => x + y, 0) / arr.length).toFixed(2)} n=${arr.length}`);
}

// ── F. 大任务清单 ──
console.log('\n===== F. main X dur>20ms 任务清单 =====');
for (const [ts, dur, name] of bigTasks.sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  t=${rel(ts).toFixed(1)}s ${name} ${(dur / 1000).toFixed(1)}ms`);
console.log('\n[done2]');
