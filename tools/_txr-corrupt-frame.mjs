#!/usr/bin/env node
// _txr-corrupt-frame.mjs — 一次性取证：腐化入场巨帧(~279.9ms)构成拆解
// ①定位巨帧窗（主线程 FireAnimationFrame 相邻 gap>150ms 的锚对）
// ②窗内全线程 X 事件家族交并（ImageDecode/GPURasterizerTask/PrePaint/Layout/Compile/JIT/Commit/RunTask…）
// ③窗内 CPU 采样归属（主线程/其他线程 self by fn + (program)/(idle) 的 JS 祖先栈归因）
// ④解码链定性：ImageDecode 家族全 trace 时间线 + sprites/ 资源请求时间线（一次性验证）
// 用法: node tools/run-diag.mjs --timeout=600000 tools/_txr-corrupt-frame.mjs <trace.json>
import fs from 'node:fs';
import { scanTraceStream } from './trace-x-ray.mjs';

const argv = process.argv.slice(2);
if (argv[0] === '--_child') argv.splice(0, 2);
const tracePath = argv[0];

const threadNames = new Map();  // pid:tid -> name
const procNames = new Map();    // pid -> process label
let mainTidKey = null;
const rafMain = [];             // [ts,dur] FireAnimationFrame on main
const imgDecAll = [];           // [ts,dur,tk,name] 全 trace 解码家族
const resAll = [];              // [ts,kind,url] 全 trace 资源请求(仅 sprites/)
const v8CompileAll = [];        // [ts,dur,tk,name] 全 trace 编译家族
// 窗内捕获（W 后处理填充；扫描期先全收 X,窗判定放后处理以省内存——不行,X 太多;
// 折中:扫描期对 X 只收 dur>0 且(窗外丢弃)。W 在扫描前未知 → 两遍扫描。）

let W0 = -1, W1 = -1; // µs 绝对

function onMeta(ev) {
  const name = ev.name || '', cat = ev.cat || '';
  if (cat !== '__metadata') return false;
  if (name === 'thread_name') {
    threadNames.set(ev.pid + ':' + ev.tid, ev.args?.name || '?');
    if (ev.args?.name === 'CrRendererMain' && !mainTidKey) mainTidKey = ev.pid + ':' + ev.tid;
  } else if (name === 'process_name') {
    procNames.set(ev.pid, ev.args?.name || '?');
  }
  return true;
}

// ── PASS 1: 锚点定位（只要主线程 FireAnimationFrame） ──
{
  const it = scanTraceStream(tracePath, (ev) => {
    if (onMeta(ev)) return;
    if (ev.ph !== 'X') return;
    if (ev.pid + ':' + ev.tid !== mainTidKey) return;
    if ((ev.name || '') === 'FireAnimationFrame') rafMain.push([ev.ts || 0, ev.dur || 0]);
  });
  console.error(`[corrupt] pass1 anchors done: ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}
rafMain.sort((a, b) => a[0] - b[0]);
// 去重(>1500µs) 与 trace-x-ray 同口径
const anchors = [];
{
  let last = -Infinity;
  for (const [ts] of rafMain) if (ts - last > 1500) { anchors.push(ts); last = ts; }
}
let maxGap = 0, gi = -1;
for (let i = 1; i < anchors.length; i++) {
  const g = anchors[i] - anchors[i - 1];
  if (g > maxGap) { maxGap = g; gi = i; }
}
const t0 = anchors.length ? anchors[0] : 0; // 仅用于打印相对值;绝对值另算
console.log(`anchors=${anchors.length} maxGap=${(maxGap / 1000).toFixed(1)}ms`);
if (gi > 0) {
  W0 = anchors[gi - 1]; W1 = anchors[gi];
  console.log(`GIANT FRAME window: [${W0}, ${W1}] dur=${((W1 - W0) / 1000).toFixed(2)}ms`);
} else {
  console.error('NO GIANT GAP FOUND — abort');
  process.exit(1);
}

// ── PASS 2: 窗内 X 事件（全线程） + 全 trace 家族时间线 ──
const WIN = 15000; // ±15ms 缓冲
const lo = W0 - WIN, hi = W1 + WIN;
const winX = [];   // {ts,dur,tk,name,args(可选)}
const inWinNames = new Map(); // name -> count(全量计数,防丢)
const decodeFamRe = /ImageDecode|DecodeImage|ImageDecodeTask|GpuImageDecode|ImagesCopied|ImageDecodeCache/i;
const compileFamRe = /^v8\.compile$|V8\.CompileCode|^V8\.Compile$|^v8\.compileModule$|ScriptCompilation|CompileLazy|CompileBaseline|CompileOptimized/i;
const keepArgsRe = /Resource|Image|Decode|Request|URL|FunctionCall|RunTask|Task/i;
{
  const it = scanTraceStream(tracePath, (ev) => {
    if (onMeta(ev)) return;
    const name = ev.name || '', cat = ev.cat || '';
    const ts = ev.ts || 0;
    const tk = ev.pid + ':' + ev.tid;
    if (decodeFamRe.test(name) && ev.ph) {
      imgDecAll.push([ts, ev.dur || 0, tk, name]);
    }
    if (compileFamRe.test(name) && ev.ph === 'X') {
      v8CompileAll.push([ts, ev.dur || 0, tk, name]);
    }
    if (/Resource(WillSend)?SendRequest|ResourceReceiveResponse|ResourceFinish/.test(name) && cat.includes('devtools.timeline')) {
      const url = ev.args?.data?.url || ev.args?.url || '';
      if (url) resAll.push([ts, name, url]);
    }
    // 覆盖语义:事件区间与窗重叠(含起于窗前长任务)
    if (ev.ph === 'X' && (ts + (ev.dur || 0)) >= lo && ts <= hi) {
      inWinNames.set(name, (inWinNames.get(name) || 0) + 1);
      const keepArgs = keepArgsRe.test(name) && ev.args && JSON.stringify(ev.args).length < 400;
      winX.push({ ts, dur: ev.dur || 0, tk, name, cat, args: keepArgs ? ev.args : undefined });
    }
  });
  console.error(`[corrupt] pass2 winX done: ${JSON.stringify(it && { total: it.total, bad: it.bad })} winX=${winX.length}`);
}

// ── PASS 3: CPU 采样（全 session;窗内样本逐个记 ts+node） ──
const sessions = new Map(); // id -> session
let seq3 = 0;
{
  const it = scanTraceStream(tracePath, (ev) => {
    const name = ev.name || '', cat = ev.cat || '';
    if (!cat.includes('cpu_profiler')) return;
    if (name === 'Profile') {
      const sk = (ev.id || '0x0') + '#' + (++seq3);
      sessions.set(sk, {
        key: sk, pid: ev.pid, tid: ev.tid, tidKey: ev.pid + ':' + ev.tid,
        nodes: new Map(), selfUs: new Map(), ts: [], ids: [],
        pending: null, lastTs: 0, lastTsInit: false,
        startTs: ev.args?.data?.startTime ?? ev.ts ?? 0,
      });
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
        // 窗内样本(±15ms)单独记
        if (s.lastTs >= lo && s.lastTs < hi) { s.ts.push(s.lastTs); s.ids.push(node); }
      }
    }
  });
  console.error(`[corrupt] pass3 samples done: ${JSON.stringify(it && { total: it.total, bad: it.bad })}`);
}

const relMs = (ts) => ((ts - W0) / 1000).toFixed(2);

// ── 窗内 X 事件家族聚合 ──
console.log('\n=== 窗内 X 事件 (按 线程×名称 聚合, dur 总和降序) ===');
const agg = new Map(); // tk|name -> {n, tot, max, args}
for (const e of winX) {
  const k = e.tk + ' | ' + e.name;
  let r = agg.get(k);
  if (!r) { r = { n: 0, tot: 0, max: 0, tk: e.tk, name: e.name, argsSample: null }; agg.set(k, r); }
  r.n++; r.tot += e.dur; if (e.dur > r.max) r.max = e.dur;
  if (!r.argsSample && e.args) r.argsSample = e.args;
}
const tname = (tk) => `${procNames.get(+tk.split(':')[0]) || '?'}/${threadNames.get(tk) || '?'}`;
for (const r of [...agg.values()].sort((a, b) => b.tot - a.tot).slice(0, 45)) {
  console.log(`${(r.tot / 1000).toFixed(2)}ms  n=${r.n} max=${(r.max / 1000).toFixed(2)}ms  [${tname(r.tk)}] ${r.name}${r.argsSample ? ' ' + JSON.stringify(r.argsSample).slice(0, 200) : ''}`);
}
console.log(`(窗内 X 事件名总数=${inWinNames.size}, 总条数=${winX.length})`);

// 长事件明细（>3ms 全列）
console.log('\n=== 窗内 >3ms X 事件明细 ===');
const longEv = winX.filter((e) => e.dur > 3000).sort((a, b) => b.dur - a.dur);
for (const e of longEv.slice(0, 60)) {
  console.log(`+${relMs(e.ts)}ms ${(e.dur / 1000).toFixed(2)}ms [${tname(e.tk)}] ${e.name}${e.args ? ' ' + JSON.stringify(e.args).slice(0, 220) : ''}`);
}
if (!longEv.length) console.log('(无 >3ms 的 X 事件——主线程在窗内没有长切片,阻塞在未插桩原生段或线程停摆)');

// ── 窗内 CPU 采样归属 ──
console.log('\n=== 窗内 CPU 采样 (每线程) ===');
const kidsCache = new Map();
function buildKids(s) {
  let k = kidsCache.get(s.key);
  if (k) return k;
  k = new Map();
  for (const [id, nd] of s.nodes) {
    const pk = nd.p ?? 0;
    if (!k.has(pk)) k.set(pk, []);
    k.get(pk).push(id);
  }
  kidsCache.set(s.key, k);
  return k;
}
function chainOf(s, id) {
  const out = [];
  let cur = id;
  const seen = new Set();
  while (cur !== undefined && cur !== 0 && !seen.has(cur)) {
    seen.add(cur);
    const nd = s.nodes.get(cur);
    if (!nd) break;
    out.push(nd);
    cur = nd.p;
  }
  return out;
}
for (const s of sessions.values()) {
  if (!s.ts.length) continue;
  const nSamples = s.ts.length;
  const covered = s.ts.length > 1 ? (s.ts[s.ts.length - 1] - s.ts[0]) : 0;
  console.log(`\n--- ${tname(s.tidKey)} samples=${nSamples} spanInWin=${(covered / 1000).toFixed(1)}ms ---`);
  const selfByFn = new Map();
  for (let j = 0; j < s.ids.length; j++) {
    const nd = s.nodes.get(s.ids[j]);
    if (!nd) continue;
    const dt = j + 1 < s.ts.length ? Math.max(0, s.ts[j + 1] - s.ts[j]) : 0;
    selfByFn.set(nd.fn, (selfByFn.get(nd.fn) || 0) + dt);
  }
  const tot = [...selfByFn.values()].reduce((a, b) => a + b, 0);
  console.log(`(self 合计=${(tot / 1000).toFixed(1)}ms)`); // 含窗缘截断,略小于窗宽=停摆期无样本
  for (const [fn, t] of [...selfByFn.entries()].sort((a, b) => b - a).slice(0, 18)) {
    console.log(`  self ${(t / 1000).toFixed(2)}ms  ${fn}`);
  }
  // (program)/(idle)/native 叶的 JS 祖先归因
  const natives = ['(program)', '(idle)', '(garbage collector)', '(root)'];
  if (selfByFn.size && [...selfByFn.keys()].some((f) => natives.includes(f))) {
    const kids = buildKids(s);
    const jsAnc = new Map(); // fn -> incl µs (窗内)
    for (let j = 0; j < s.ids.length; j++) {
      const id = s.ids[j];
      const nd = s.nodes.get(id);
      if (!nd) continue;
      const dt = j + 1 < s.ts.length ? Math.max(0, s.ts[j + 1] - s.ts[j]) : 0;
      if (!natives.includes(nd.fn)) continue;
      const seen = new Set();
      let cur = nd.p;
      while (cur !== undefined && cur !== 0 && !seen.has(cur)) {
        seen.add(cur);
        const a = s.nodes.get(cur);
        if (!a) break;
        if (!a.fn.startsWith('(')) jsAnc.set(a.fn, (jsAnc.get(a.fn) || 0) + dt);
        cur = a.p;
      }
    }
    console.log(`  [native 叶的 JS 祖先 incl]`);
    for (const [fn, t] of [...jsAnc.entries()].sort((a, b) => b - a).slice(0, 18)) {
      console.log(`    incl ${(t / 1000).toFixed(2)}ms  ${fn}`);
    }
    kidsCache.delete(s.key);
  }
  // 采样间隔分布（判断停摆期是否丢采样）
  const dts = [];
  for (let j = 1; j < s.ts.length; j++) dts.push(s.ts[j] - s.ts[j - 1]);
  if (dts.length > 5) {
    dts.sort((a, b) => a - b);
    const q = (p) => dts[Math.min(dts.length - 1, Math.floor(dts.length * p))];
    console.log(`  (窗内采样 dt p50=${q(0.5)}µs p90=${q(0.9)}µs max=${dts[dts.length - 1]}µs; max 大=该段无样本/线程停摆)`);
  }
}

// ── 解码家族全 trace 时间线 ──
console.log('\n=== ImageDecode 家族 全 trace (全部列出) ===');
imgDecAll.sort((a, b) => a[0] - b[0]);
console.log(`(总数=${imgDecAll.length})`);
const relTrace = (ts) => ((ts - W0) / 1000).toFixed(1);
for (const [ts, dur, tk, name] of imgDecAll) {
  console.log(`t=${relTrace(ts)}ms dur=${(dur / 1000).toFixed(2)}ms [${tname(tk)}] ${name}`);
}

// ── 编译家族全 trace（聚合到秒桶） ──
console.log('\n=== V8 compile 家族 全 trace (秒桶聚合) ===');
const compBuckets = new Map();
for (const [ts, dur, tk, name] of v8CompileAll) {
  const b = Math.floor((ts - W0) / 1e6);
  let r = compBuckets.get(b);
  if (!r) { r = { n: 0, tot: 0, names: new Map() }; compBuckets.set(b, r); }
  r.n++; r.tot += dur; r.names.set(name, (r.names.get(name) || 0) + 1);
}
for (const [b, r] of [...compBuckets.entries()].sort((a, b2) => a[0] - b2[0]).slice(0, 60)) {
  const top = [...r.names.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, n]) => `${k}×${n}`).join(',');
  console.log(`t=${b}s n=${r.n} tot=${(r.tot / 1000).toFixed(1)}ms ${top}`);
}

// ── 资源请求时间线（sprites/, 窗口附近 ±3s 全列 + 全 trace 计数） ──
console.log('\n=== sprites/ 资源请求 ===');
resAll.sort((a, b) => a[0] - b[0]);
const near = resAll.filter(([ts]) => ts >= W0 - 3e6 && ts <= W1 + 3e6);
console.log(`(全 trace sprites/ 资源事件=${resAll.length}; 巨帧 ±3s 内=${near.length})`);
const seenReq = new Map();
for (const [ts, kind, url] of near) {
  if (kind === 'ResourceSendRequest') {
    console.log(`t=${relTrace(ts)}ms REQ ${url}`);
  } else if (kind === 'ResourceFinish') {
    console.log(`t=${relTrace(ts)}ms FIN ${url}`);
  } else if (!seenReq.has(url)) { seenReq.set(url, 1); }
}
// 巨帧之后还在请求的 sprites（晚到链证据）
const after = resAll.filter(([ts]) => ts > W1);
const afterReqs = new Map();
for (const [ts, kind, url] of after) if (kind === 'ResourceSendRequest') afterReqs.set(url, relTrace(ts));
if (afterReqs.size) {
  console.log(`(巨帧后仍发起的 sprites 请求 ${afterReqs.size} 种:)`);
  for (const [url, t] of [...afterReqs.entries()].slice(0, 40)) console.log(`  t=${t}ms ${url}`);
}
