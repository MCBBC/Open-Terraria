#!/usr/bin/env node
// _txr-win3-waitform3.mjs — win3 第三轮: 主帧时长/帧间隙; fires dur 细分直方图;
// CrGpuMain 子切片 top; VizCompositor/合成器子事件; (root) 采样区间与 PageAnimator 交并
import fs from 'node:fs';
import { scanTraceStream } from './trace-x-ray.mjs';
const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];
const T0 = 947199560817;
const rel = (ts) => (ts - T0) / 1000;

let mainTidKey = null, gpuMainKey = null, vizKey = null, compKey = null;
const threadNames = new Map();
const procNames = new Map();
const fires = []; // [ts,dur]
const pageAnim = []; // [ts,dur]
const gpuMainX = new Map(); // name -> {n,dur}
const vizX = new Map();
const compI = new Map(); // 合成器线程 instant 事件名
const gpuTaskArgs = [];
let mainS = null;
const sessions = new Map(); let seq = 0; const idToSession = new Map();
// (root)/(idle) 采样区间粗存(降采样:只存 dt>200µs 的长区间)
const longRoot = [], longIdle = [], longProg = [];

function onEvent(ev) {
  const name = ev.name || '', cat = ev.cat || '', ph = ev.ph;
  if (cat === '__metadata') {
    if (name === 'process_name') procNames.set(ev.pid, ev.args?.name || '?');
    else if (name === 'thread_name') {
      const tk = ev.pid + ':' + ev.tid;
      threadNames.set(tk, ev.args?.name || '?');
      if (ev.args?.name === 'CrRendererMain' && !mainTidKey) mainTidKey = tk;
      if (ev.args?.name === 'CrGpuMain') gpuMainKey = tk;
      if (ev.args?.name === 'VizCompositorThread') vizKey = tk;
      if (ev.args?.name === 'Compositor') compKey = tk;
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
        const dt = td[j] >= 0 ? td[j] : 0;
        s.lastTs += dt;
        if (s.isMain) {
          s.tsVec.push(s.lastTs); s.idVec.push(samples[j]);
          const nd = s.nodes.get(samples[j]);
          if (nd && dt > 200) {
            const iv = [s.lastTs - dt, s.lastTs];
            if (nd.fn === '(root)') longRoot.push(iv);
            else if (nd.fn === '(idle)') longIdle.push(iv);
            else if (nd.fn === '(program)') longProg.push(iv);
          }
        }
      }
      return;
    }
    return;
  }
  const tk = ev.pid + ':' + ev.tid;
  const t = ev.ts || 0;
  if (tk === mainTidKey && ph === 'X') {
    if (name === 'FireAnimationFrame') fires.push(t, ev.dur || 0);
    else if (name === 'PageAnimator::serviceScriptedAnimations') pageAnim.push([t, ev.dur || 0]);
  } else if (tk === gpuMainKey && ph === 'X') {
    let e = gpuMainX.get(name);
    if (!e) { e = { n: 0, dur: 0 }; gpuMainX.set(name, e); }
    e.n++; e.dur += ev.dur || 0;
    if (name === 'GPUTask' && gpuTaskArgs.length < 3) gpuTaskArgs.push(ev.args);
  } else if (tk === vizKey && ph === 'X') {
    let e = vizX.get(name);
    if (!e) { e = { n: 0, dur: 0 }; vizX.set(name, e); }
    e.n++; e.dur += ev.dur || 0;
  } else if (tk === compKey && (ph === 'I' || ph === 'i')) {
    compI.set(name, (compI.get(name) || 0) + 1);
  }
}
let t0 = Date.now();
{ const it = scanTraceStream(tracePath, onEvent); console.error(`[waitform3] total=${it.total} ${Date.now() - t0}ms`); }
mainS = [...sessions.values()].find((s) => s.isMain);
const ms = (us) => (us / 1000).toFixed(1);
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

// 1. 主帧节奏: PageAnimator dur + 相邻间隔 + 间隔尾隙
console.log('\n== 主帧(PageAnimator) 节奏 ==');
{
  const durs = pageAnim.map((x) => x[1]).sort((a, b) => a - b);
  console.log(`n=${durs.length} dur p50=${(pct(durs, 0.5) / 1000).toFixed(2)}ms p75=${(pct(durs, 0.75) / 1000).toFixed(2)} p90=${(pct(durs, 0.9) / 1000).toFixed(2)} p99=${(pct(durs, 0.99) / 1000).toFixed(2)} max=${(durs[durs.length - 1] / 1000).toFixed(1)} total=${ms(durs.reduce((a, b) => a + b, 0))}ms`);
  const gaps = [];
  for (let i = 1; i < pageAnim.length; i++) gaps.push((pageAnim[i][0] - pageAnim[i - 1][0]) / 1000);
  const gs = gaps.slice().sort((a, b) => a - b);
  console.log(`主帧间隔 p10=${pct(gs, 0.1).toFixed(2)}ms p50=${pct(gs, 0.5).toFixed(2)} p90=${pct(gs, 0.9).toFixed(2)} p99=${pct(gs, 0.99).toFixed(2)} max=${gs[gs.length - 1].toFixed(1)}`);
  // 量化: vsync 8.333
  const q = new Map();
  for (const g of gaps) { const k = Math.max(1, Math.round(g / 8.333)); q.set(k, (q.get(k) || 0) + 1); }
  console.log('主帧间隔/vsync 倍数:', [...q.entries()].sort((a, b) => a[0] - b[0]).slice(0, 12).map(([k, n]) => `${k}x:${n}`).join(' '));
  // 主帧后空隙(主帧 dur 结束→下一主帧开始)
  const tails = [];
  for (let i = 1; i < pageAnim.length; i++) {
    const tail = (pageAnim[i][0] - (pageAnim[i - 1][0] + pageAnim[i - 1][1])) / 1000;
    if (tail >= 0) tails.push(tail);
  }
  const ts2 = tails.slice().sort((a, b) => a - b);
  console.log(`主帧尾隙(上一主帧结束→下一主帧开始) p50=${pct(ts2, 0.5).toFixed(2)}ms p90=${pct(ts2, 0.9).toFixed(2)} mean=${(tails.reduce((a, b) => a + b, 0) / tails.length).toFixed(2)} max=${ts2[ts2.length - 1]?.toFixed(1)} 总和=${ms(tails.reduce((a, b) => a + b, 0))}ms`);
}

// 2. fires dur 细分
console.log('\n== FireAnimationFrame dur 细分 ==');
{
  const list = [];
  for (let i = 0; i < fires.length; i += 2) list.push(fires[i + 1]);
  const buckets = [[0, 100], [100, 300], [300, 1000], [1000, 2000], [2000, 3000], [3000, 5000], [5000, 10000], [10000, 20000], [20000, 1e9]];
  for (const [a, b] of buckets) {
    const n = list.filter((d) => d >= a && d < b).length;
    if (n) console.log(`  ${a}-${b >= 1e9 ? '∞' : b}µs: ${n}`);
  }
  console.log(`  total n=${list.length} dur总=${ms(list.reduce((a, b) => a + b, 0))}ms`);
}

// 3. (root)/(idle)/(program) 长区间与 PageAnimator 交并
console.log('\n== 长(>0.2ms)伪帧区间与主帧窗交并 ==');
{
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
  const paMerged = mergeIv(pageAnim.map(([ts, d]) => [ts, ts + d]));
  const paTotal = paMerged.reduce((a, b) => a + (b[1] - b[0]), 0);
  for (const [nm, arr] of [['(root)', longRoot], ['(idle)', longIdle], ['(program)', longProg]]) {
    const m = mergeIv(arr.slice());
    const tot = m.reduce((a, b) => a + (b[1] - b[0]), 0);
    const ov = intersect(m, paMerged);
    console.log(`  ${nm}: 长区间 n=${arr.length} 总=${ms(tot)}ms ∩主帧窗(${ms(paTotal)}ms)=${ms(ov)}ms (${(ov / Math.max(1, tot) * 100).toFixed(1)}%)`);
  }
}

// 4. CrGpuMain 子切片
console.log('\n== CrGpuMain X 名录 top30 ==');
for (const [n, e] of [...gpuMainX.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 30)) console.log(`  ${n}: n=${e.n} total=${ms(e.dur)}ms mean=${(e.dur / e.n / 1000).toFixed(3)}ms`);
console.log('GPUTask args 样例:', JSON.stringify(gpuTaskArgs).slice(0, 300));

// 5. VizCompositor + 合成器 instant
console.log('\n== VizCompositorThread X top10 ==');
for (const [n, e] of [...vizX.entries()].sort((a, b) => b[1].dur - a[1].dur).slice(0, 10)) console.log(`  ${n}: n=${e.n} total=${ms(e.dur)}ms`);
console.log('\n== 合成器线程 instant 事件 top15 ==');
for (const [n, c] of [...compI.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${n}: ${c}`);

// 6. 主帧窗内采样分类(dt 加权)
console.log('\n== 主帧窗内主线程采样(dt加权 ms) ==');
if (mainS) {
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
  const paMerged = mergeIv(pageAnim.map(([ts, d]) => [ts, ts + d]));
  const cls = new Map();
  let mi = 0;
  for (let j = 0; j < mainS.tsVec.length; j++) {
    const ts = mainS.tsVec[j];
    const dt = j + 1 < mainS.tsVec.length ? Math.max(0, mainS.tsVec[j + 1] - mainS.tsVec[j]) : 0;
    while (mi < paMerged.length && paMerged[mi][1] <= ts) mi++;
    if (mi >= paMerged.length || paMerged[mi][0] > ts) continue;
    const nd = mainS.nodes.get(mainS.idVec[j]);
    if (!nd) continue;
    const c = ['(root)', '(program)', '(idle)', '(garbage collector)'].includes(nd.fn) ? nd.fn : (nd.url ? 'js' : 'nativeAPI');
    cls.set(c, (cls.get(c) || 0) + Math.min(dt, paMerged[mi][1] - ts));
  }
  const tot = [...cls.values()].reduce((a, b) => a + b, 0);
  console.log(`  主帧窗合计=${ms(paMerged.reduce((a, b) => a + (b[1] - b[0]), 0))}ms 采样覆盖=${ms(tot)}ms`);
  for (const [c, v] of [...cls.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${ms(v)}ms (${(v / tot * 100).toFixed(1)}%)`);
}
console.log('\n[done3]');
