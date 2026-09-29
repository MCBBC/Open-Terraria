#!/usr/bin/env node
// _txr-win3-waitform4.mjs — win3 第四轮: ①30-90ms AsyncTaskRun 家族栈确证(3 个样本窗)
// ②主帧窗外采样构成(dt加权,尾隙=vsync 等待验证) ③render tick 内 getImageData/drawImage 调用方
import fs from 'node:fs';
import { scanTraceStream } from './trace-x-ray.mjs';
const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];
const T0 = 947199560817;
const rel = (ts) => (ts - T0) / 1000;
const threadNames = new Map();
let mainTidKey = null;
const pageAnim = [];
const probes = [[26828.9, 26916.5], [17322.3, 17394.5], [2101.3, 2143.5]];
const winEvents = probes.map(() => []);
let mainS = null;
const sessions = new Map(); let seq = 0; const idToSession = new Map();
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
  if (tk === mainTidKey) {
    if (ph === 'X') {
      if (name === 'PageAnimator::serviceScriptedAnimations') pageAnim.push([t, ev.dur || 0]);
      const r = t ? rel(t) : -1;
      for (let w = 0; w < probes.length; w++) {
        if (r >= probes[w][0] && r <= probes[w][1]) winEvents[w].push({ t: r, name, dur: ev.dur || 0 });
      }
    }
  }
}
let t0 = Date.now();
{ const it = scanTraceStream(tracePath, onEvent); console.error(`[waitform4] total=${it.total} ${Date.now() - t0}ms`); }
mainS = [...sessions.values()].find((s) => s.isMain);
const ms = (us) => (us / 1000).toFixed(1);

// ① 三个大任务窗的栈
for (let w = 0; w < probes.length; w++) {
  console.log(`\n== 任务窗 [${probes[w][0]},${probes[w][1]}] ==`);
  const byName = new Map();
  for (const e of winEvents[w]) {
    let o = byName.get(e.name);
    if (!o) { o = { n: 0, dur: 0 }; byName.set(e.name, o); }
    o.n++; o.dur += e.dur;
  }
  for (const [k, o] of [...byName.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 6)) console.log(`  ${k}: n=${o.n} dur=${ms(o.dur)}ms`);
  if (mainS) {
    const cnt = new Map();
    for (let j = 0; j < mainS.tsVec.length; j++) {
      const rr = rel(mainS.tsVec[j]);
      if (rr < probes[w][0] || rr > probes[w][1]) continue;
      const chain = [];
      let id = mainS.idVec[j];
      for (let hop = 0; hop < 6 && id !== undefined;) {
        const nd = mainS.nodes.get(id);
        if (!nd) break;
        chain.push(nd.fn);
        id = nd.p; hop++;
        if (chain.length >= 5) break;
      }
      const key = chain.join('<-');
      cnt.set(key, (cnt.get(key) || 0) + 1);
    }
    for (const [k, c] of [...cnt.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`    ${c}× ${k}`);
  }
}

// ② 主帧窗外采样构成
console.log('\n== 主帧窗外采样(dt加权) ==');
if (mainS) {
  const merged = [];
  for (const [ts, d] of pageAnim.map(([ts, d]) => [ts, ts + d]).sort((a, b) => a[0] - b[0])) {
    if (merged.length && ts <= merged[merged.length - 1][1]) { merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], ts + d); continue; }
    merged.push([ts, ts + d]);
  }
  const cls = new Map();
  let mi = 0;
  for (let j = 0; j < mainS.tsVec.length; j++) {
    const ts = mainS.tsVec[j];
    const dt = j + 1 < mainS.tsVec.length ? Math.max(0, mainS.tsVec[j + 1] - mainS.tsVec[j]) : 0;
    while (mi < merged.length && merged[mi][1] <= ts) mi++;
    if (mi < merged.length && merged[mi][0] <= ts) continue;
    const nd = mainS.nodes.get(mainS.idVec[j]);
    if (!nd) continue;
    const c = ['(root)', '(program)', '(idle)', '(garbage collector)'].includes(nd.fn) ? nd.fn : (nd.url ? 'js:' + nd.fn : 'api:' + nd.fn);
    cls.set(c, (cls.get(c) || 0) + dt);
  }
  const tot = [...cls.values()].reduce((a, b) => a + b, 0);
  console.log(`  窗外采样墙=${ms(tot)}ms top:`);
  for (const [c, v] of [...cls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`    ${c}: ${ms(v)}ms`);
}
console.log('\n[done4]');
