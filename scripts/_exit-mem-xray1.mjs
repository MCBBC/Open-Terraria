// _exit-mem-xray1.mjs — 分段时间轴 + 退出时刻定位 + 内存行为面证据
// run: node scripts/_exit-mem-xray1.mjs [tracePath]
import fs from 'node:fs';
import { scanTrace } from './_exit-mem-scan.mjs';

const TRACE = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261004T130359.json';
const OUT = '/tmp/exit-mem';
const recon = JSON.parse(fs.readFileSync(OUT + '/recon.json', 'utf8'));
const T0 = recon.summary.windowUs[0];

// watched threads
const threadNames = new Map(recon.summary.threads.map(t => [t.pid + '|' + t.tid, t.nm]));
const poolTids = new Set(recon.summary.threads.filter(t => /ThreadPool/.test(t.nm) && t.pid === 84464).map(t => t.tid));
const WORKERS = [27080049, 27080193, 27080232, 27080242, 27080243, 27082635];
const MAIN = 27036070, COMP = 27036083;

const NB = 110;
const bucket = (ts) => Math.floor((ts - T0) / 1e6);

// per-bucket accumulators
const rafTs = [];            // FireAnimationFrame on MAIN
const presTs = [];           // AnimationFrame::Presentation on MAIN
const drawTs = [];           // DrawFrame on COMP
const evDisp = new Array(NB).fill(0);      // input events on main
const gcB = [];              // {b,name,tid-class,dur,count}
const gcIncr = new Array(NB).fill(0);      // V8.GC_MC_INCREMENTAL count
const cntNodes = new Array(NB).fill(-1);   // last UpdateCounters value per bucket
const cntLis = new Array(NB).fill(-1);
const workerAct = new Map(); // tid → per-bucket counts
const poolAct = new Array(NB).fill(0);
const asyncTasks = new Array(NB).fill(0);  // AsyncTaskScheduled on main (postMessage burst)
let lastNodes = -1, lastLis = -1;

scanTrace(TRACE, (e) => {
  const nm = e.name;
  const tid = e.tid, pid = e.pid;
  if (pid !== 84464) return;
  const b = bucket(e.ts);
  if (b < 0 || b >= NB) return;
  if (tid === MAIN) {
    if (nm === 'FireAnimationFrame') rafTs.push(e.ts);
    else if (nm === 'AnimationFrame::Presentation') presTs.push(e.ts);
    else if (nm === 'EventDispatch') evDisp[b]++;
    else if (nm === 'UpdateCounters') { const d = e.args?.data || {}; lastNodes = d.nodes ?? lastNodes; lastLis = d.jsEventListeners ?? lastLis; cntNodes[b] = lastNodes; cntLis[b] = lastLis; }
    else if (nm === 'V8.GC_MC_INCREMENTAL' || nm.startsWith('V8.GC_')) gcIncr[b]++;
  }
  if (tid === COMP && nm === 'DrawFrame') drawTs.push(e.ts);
  if (nm === 'MajorGC' || nm === 'MinorGC') {
    const cls = WORKERS.includes(tid) ? 'worker' : (tid === MAIN ? 'main' : 'other');
    let arr = gcB.find(x => x.b === b && x.name === nm && x.cls === cls);
    if (!arr) { arr = { b, name: nm, cls, dur: 0, count: 0 }; gcB.push(arr); }
    arr.dur += (e.dur || 0) / 1000; arr.count++;
  }
  if (WORKERS.includes(tid)) {
    let w = workerAct.get(tid); if (!w) { w = new Array(NB).fill(0); workerAct.set(tid, w); }
    w[b]++;
  }
  if (poolTids.has(tid)) poolAct[b]++;
  if (tid === MAIN && nm === 'v8::Debugger::AsyncTaskScheduled') asyncTasks[b]++;
});

// frame distance stats helper
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))] || 0; };
const deltas = (ts) => { const d = []; for (let i = 1; i < ts.length; i++) { const x = (ts[i] - ts[i - 1]) / 1000; if (x > 0 && x < 5000) d.push(x); } return d; };

function frameStats(ts, label) {
  const d = deltas(ts);
  if (!d.length) { console.log(label, 'EMPTY'); return null; }
  const med = pct(d, .5), p95 = pct(d, .95), p99 = pct(d, .99), mx = d[d.length - 1];
  const avg = d.reduce((a, c) => a + c, 0) / d.length;
  console.log(`${label}  n=${d.length}  avg=${avg.toFixed(1)}ms med=${med.toFixed(1)} p95=${p95.toFixed(1)} p99=${p99.toFixed(1)} max=${mx.toFixed(0)}ms  >33ms帧=${d.filter(x => x > 33).length} >50=${d.filter(x => x > 50).length} >100=${d.filter(x => x > 100).length}`);
  return d;
}

// rAF per-second fps + 慢帧窗
const rafPerSec = new Array(NB).fill(0);
for (const ts of rafTs) { const b = bucket(ts); if (b >= 0 && b < NB) rafPerSec[b]++; }

console.log('== 全程帧距(主线程 rAF 回调) ==');
const rafD = frameStats(rafTs, 'rAF   ');
const drawD = frameStats(drawTs, 'DrawF ');
console.log('\n== 每秒总览: fps | 输入 | GC(m/µ) | nodes | workers事件 | pool | incrGC ==');
console.log('sec  fps  input  MajorGC MinorGC  nodes  lis  wkrEv  pool  incrGC');
for (let b = 0; b < NB; b++) {
  const gm = gcB.find(x => x.b === b && x.name === 'MajorGC' && x.cls === 'main');
  const gw = gcB.find(x => x.b === b && x.name === 'MajorGC' && x.cls === 'worker');
  const um = gcB.find(x => x.b === b && x.name === 'MinorGC' && x.cls === 'main');
  const uw = gcB.find(x => x.b === b && x.name === 'MinorGC' && x.cls === 'worker');
  const wsum = [...workerAct.values()].reduce((a, w) => a + (w[b] || 0), 0);
  const nodes = cntNodes[b];
  const line = `${String(b).padStart(3)} ${String(rafPerSec[b]).padStart(4)} ${String(evDisp[b]).padStart(5)} ${String((gm?.count || 0) + '/' + (gw?.count || 0)).padStart(7)} ${String((um?.count || 0) + '/' + (uw?.count || 0)).padStart(7)} ${String(nodes < 0 ? '-' : nodes).padStart(6)} ${String(cntLis[b] < 0 ? '-' : cntLis[b]).padStart(5)} ${String(wsum).padStart(6)} ${String(poolAct[b]).padStart(5)} ${String(gcIncr[b]).padStart(6)}`;
  // 只打印有内容的秒
  if (rafPerSec[b] || wsum || nodes > 0 || evDisp[b] || gcIncr[b]) console.log(line);
}
console.log('\n== worker 分线程每秒事件数(尾段 90-109s) ==');
for (const [tid, w] of workerAct) {
  const tail = w.map((v, i) => v ? `${i}:${v}` : null).filter(Boolean);
  console.log(`tid ${tid} 全程秒分布: ${tail.slice(0, 200).join(' ')}`);
}
fs.writeFileSync(OUT + '/timeline.json', JSON.stringify({
  T0, rafTs: rafTs.length, presTs: presTs.length,
  rafPerSec, evDisp, gcB, gcIncr, nodes: cntNodes, lis: cntLis,
  workerAct: [...workerAct.entries()], poolAct, asyncTasks,
  rafD: rafD && { med: pct(rafD, .5), p95: pct(rafD, .95), p99: pct(rafD, .99) },
}));
console.log('\n→ ' + OUT + '/timeline.json');
