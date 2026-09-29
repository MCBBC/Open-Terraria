#!/usr/bin/env node
// _txr-corrupt-census.mjs — 一次性补证：CpuProfiler::StartProfiling 唯一性 + step/loop 全 trace 时长普查
// 用法: node tools/run-diag.mjs tools/_txr-corrupt-census.mjs <trace.json>
const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];
import { scanTraceStream } from './trace-x-ray.mjs';

const threadNames = new Map();
let mainTidKey = null;
const startProfiling = []; // [ts, dur, tk]
const fnCalls = new Map(); // tk|fn -> {n, tot, max, top:[]}
let minTs = Infinity, maxTs = -Infinity;

scanTraceStream(tracePath, (ev) => {
  const name = ev.name || '', cat = ev.cat || '';
  if (cat === '__metadata') {
    if (name === 'thread_name') {
      threadNames.set(ev.pid + ':' + ev.tid, ev.args?.name || '?');
      if (ev.args?.name === 'CrRendererMain' && !mainTidKey) mainTidKey = ev.pid + ':' + ev.tid;
    }
    return;
  }
  const ts = ev.ts || 0;
  if (ts < minTs) minTs = ts;
  if (ts > maxTs) maxTs = ts;
  if (name === 'CpuProfiler::StartProfiling') {
    startProfiling.push([ts, ev.dur || 0, ev.pid + ':' + ev.tid]);
    return;
  }
  if (ev.ph === 'X' && name === 'FunctionCall') {
    const fn = ev.args?.data?.functionName || '';
    if (fn === 'step' || fn === 'loop') {
      const tk = ev.pid + ':' + ev.tid;
      const k = tk + '|' + fn;
      let r = fnCalls.get(k);
      if (!r) { r = { n: 0, tot: 0, max: 0, top: [] }; fnCalls.set(k, r); }
      r.n++; r.tot += ev.dur || 0;
      if ((ev.dur || 0) > r.max) {
        r.max = ev.dur || 0;
        r.top = [ts, ev.args?.data?.lineNumber, ev.args?.data?.url?.slice(-40)];
      }
    }
  }
});

const rel = (ts) => ((ts - minTs) / 1000).toFixed(1);
console.log(`trace span: t0=${minTs} .. +${((maxTs - minTs) / 1e6).toFixed(2)}s`);
console.log(`\n=== CpuProfiler::StartProfiling (all, n=${startProfiling.length}) ===`);
for (const [ts, dur, tk] of startProfiling.sort((a, b) => a[0] - b[0])) {
  console.log(`t=+${rel(ts)}ms dur=${(dur / 1000).toFixed(2)}ms [${tk} ${threadNames.get(tk) || '?'}]`);
}
console.log(`\n=== FunctionCall step/loop 全 trace 普查 ===`);
for (const [k, r] of [...fnCalls.entries()].sort((a, b) => b[1].max - a[1].max)) {
  const [tk, fn] = k.split('|');
  console.log(`[${threadNames.get(tk) || tk}] ${fn}: n=${r.n} mean=${(r.tot / r.n / 1000).toFixed(2)}ms max=${(r.max / 1000).toFixed(2)}ms (max@+${rel(r.top[0])}ms line=${r.top[1]} ${r.top[2]})`);
}
// 主线程 loop p50/p90
const main = [...fnCalls.keys()].find((k) => k.startsWith(mainTidKey + '|loop'));
if (main) console.log(`(主线程 loop n=${fnCalls.get(main).n} → 与 digest 渲染帧口径一致)`);
