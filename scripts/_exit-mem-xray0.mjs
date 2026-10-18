// _exit-mem-xray0.mjs — recon: 线程/进程图 + 事件直方图 + 关键事件抽取(内存/GC/worker/帧/ProfileChunk摘要)
// run: node scripts/_exit-mem-xray0.mjs [tracePath]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
import { scanTrace } from './_exit-mem-scan.mjs';

const TRACE = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261004T130359.json'));
const OUT = '/tmp/exit-mem';
fs.mkdirSync(OUT, { recursive: true });

const nameHist = new Map();            // name → count
const pidName = new Map();             // pid → process_name
const threadName = new Map();          // pid|tid → name
const tidSpan = new Map();             // pid|tid → {first,last,n}
const gc = [];                         // GC 族事件
const memCounters = [];                // UpdateCounters/DOMStats
const workerLife = [];                 // WorkerStart/WorkerTerminate/attach/detach
const profChunks = [];                 // ProfileChunk 摘要
const raf = new Map();                 // pid|tid → [ts]  (RequestAnimationFrame/FireAnimationFrame)
const frameEv = new Map();             // DrawFrame/BeginFrame/Presentation 计数+span
const miscCount = new Map();           // EventDispatch/FunctionCall 等高频计数
let minTs = Infinity, maxTs = -Infinity, nEvents = 0;

const isMeta = (e) => e.cat === '__metadata';

const pickGcArgs = (a) => {
  if (!a) return null;
  const out = {};
  const sd = a.startData || a.endData || {};
  for (const k of ['usedHeapSizeBefore', 'usedHeapSizeAfter', 'collected_size', 'allocated_objects_size', 'collection_reason', 'incremental_marking_start', 'requested_memory_limit', 'total_size', 'explorable'])
    if (sd[k] !== undefined) out[k] = sd[k];
  if (a.endData) {
    for (const k of ['usedHeapSizeBefore', 'usedHeapSizeAfter'])
      if (a.endData[k] !== undefined) out['end_' + k] = a.endData[k];
  }
  if (a.aggregateCount) out.aggregateCount = a.aggregateCount;
  return Object.keys(out).length ? out : undefined;
};

scanTrace(TRACE, (e) => {
  nEvents++;
  if (e.ts > 0) { if (e.ts < minTs) minTs = e.ts; if (e.ts > maxTs) maxTs = e.ts; }
  nameHist.set(e.name, (nameHist.get(e.name) || 0) + 1);
  if (isMeta(e)) {
    if (e.name === 'process_name') pidName.set(e.pid, e.args?.name);
    else if (e.name === 'thread_name') threadName.set(e.pid + '|' + e.tid, e.args?.name);
    return;
  }
  const key = e.pid + '|' + e.tid;
  let sp = tidSpan.get(key);
  if (!sp) { sp = { first: e.ts, last: e.ts, n: 0 }; tidSpan.set(key, sp); }
  sp.last = e.ts; sp.n++;

  const nm = e.name;
  if (nm === 'MajorGC' || nm === 'MinorGC' || nm === 'CppGC' || nm === 'CppGCCollector' || nm === 'ArrayBufferSweeper' || nm === 'VirtualMemorySweeper' || nm === 'Heap::CollectGarbage' || nm === 'ThreadState::PerformCleanup' || nm === 'BlinkGCAtomicPauseMarkIfNeeded' || nm === 'BlinkGCConcurrentSweep') {
    gc.push({ ts: e.ts, pid: e.pid, tid: e.tid, name: nm, ph: e.ph, dur: e.dur, args: pickGcArgs(e.args) });
  } else if (nm === 'UpdateCounters' || nm === 'DOMStats') {
    const d = e.args?.data || {};
    memCounters.push({ ts: e.ts, pid: e.pid, name: nm, nodes: d.nodes, listeners: d.jsEventListeners, documents: d.documents });
  } else if (nm === 'WorkerStart' || nm === 'WorkerTerminate' || nm === 'DedicatedWorkerHostImplCreated' || nm === 'WorkerThreadTerminated' || nm === 'ThreadStarted' || nm === 'ThreadDestroyed') {
    workerLife.push({ ts: e.ts, pid: e.pid, tid: e.tid, name: nm, data: e.args?.data });
  } else if (nm === 'ProfileChunk') {
    const d = e.args?.data || {};
    const cp = d.cpuProfile || {};
    const td = cp.timeDeltas || [];
    let us = 0; for (let i = 0; i < td.length; i++) us += (td[i] > 0 ? td[i] : 0);
    profChunks.push({ ts: e.ts, pid: e.pid, tid: e.tid, id: e.id, n: (cp.samples || []).length, us, nodes: (cp.nodes || []).length });
  } else if (nm === 'RequestAnimationFrame' || nm === 'FireAnimationFrame') {
    let arr = raf.get(key); if (!arr) { arr = []; raf.set(key, arr); }
    arr.push(e.ts);
  } else if (nm === 'DrawFrame' || nm === 'BeginFrame' || nm === 'AnimationFrame::Presentation' || nm === 'NeedsBeginFrameChanged') {
    let arr = frameEv.get(nm + '@' + key); if (!arr) { arr = { n: 0, first: e.ts, last: e.ts }; frameEv.set(nm + '@' + key, arr); }
    arr.n++; arr.last = e.ts;
  } else if (nm === 'EventDispatch' || nm === 'FunctionCall' || nm === 'RunTask' || nm === 'RunMicrotasks' || nm === 'EvaluateScript' || nm === 'v8.compile' || nm === 'TimerFire' || nm === 'ImageDecodeTask' || nm === 'DecodeImage' || nm === 'CommitLoad' || nm === 'ResourceFinish' || nm === 'XHRLoad' || nm === 'Animation' || nm === 'Layout' || nm === 'UpdateLayerTree' || nm === 'Paint' || nm === 'PrePaint' || nm === 'HitTest' || nm === 'InvalidateLayout' || nm === 'ScheduleStyleRecalculation' || nm === 'RecalculateStyles' || nm === 'IdleTask' || nm === 'WebGLJob' || nm === 'Task' || nm === 'MessageLoop::RunTask' || nm === 'ThreadControllerImpl::RunTask') {
    miscCount.set(nm + '@' + key, (miscCount.get(nm + '@' + key) || 0) + 1);
  }
});

const summary = {
  trace: TRACE, nEvents,
  windowUs: [minTs, maxTs], windowSec: ((maxTs - minTs) / 1e6).toFixed(2),
  processes: [...pidName.entries()].map(([pid, nm]) => ({ pid, nm })),
  threads: [...threadName.entries()].map(([k, nm]) => { const [pid, tid] = k.split('|'); const sp = tidSpan.get(k); return { pid: +pid, tid: +tid, nm, first: sp?.first, last: sp?.last, n: sp?.n }; }),
  topNames: [...nameHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 80),
  gcCount: gc.length, memCounters: memCounters.length, workerLife: workerLife.length, profChunks: profChunks.length,
};
fs.writeFileSync(OUT + '/recon.json', JSON.stringify({
  summary,
  gc, memCounters, workerLife, profChunks,
  raf: [...raf.entries()].map(([k, arr]) => ({ key: k, n: arr.length, first: arr[0], last: arr[arr.length - 1] })),
  frameEv: [...frameEv.entries()].map(([k, v]) => ({ key: k, ...v })),
  miscTop: [...miscCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60),
}, null, 1));

console.log('== window ==', ((minTs) / 1e6).toFixed(1), '→', (maxTs / 1e6).toFixed(1), '=', ((maxTs - minTs) / 1e6).toFixed(1) + 's,', nEvents, 'events');
console.log('== processes =='); for (const [pid, nm] of pidName) console.log(' pid', pid, nm);
console.log('== threads(有活动的) ==');
for (const [k, nm] of threadName) {
  const sp = tidSpan.get(k); if (!sp) continue;
  console.log(` ${k} ${nm}  n=${sp.n} span=${((sp.first - minTs) / 1e6).toFixed(1)}s→${((sp.last - minTs) / 1e6).toFixed(1)}s`);
}
console.log('== top names ==');
for (const [nm, c] of [...nameHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 45)) console.log(`  ${String(c).padStart(9)}  ${nm}`);
console.log('== counts ==', JSON.stringify({ gc: gc.length, memCounters: memCounters.length, workerLife: workerLife.length, profChunks: profChunks.length }));
console.log('== raf threads ==');
for (const [k, arr] of raf) console.log(`  ${k} n=${arr.length} ${(arr[0] - minTs) / 1e6 | 0}s→${(arr[arr.length - 1] - minTs) / 1e6 | 0}s`);
console.log('full →', OUT + '/recon.json');
