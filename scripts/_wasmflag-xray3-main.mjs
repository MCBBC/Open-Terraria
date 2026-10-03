// wasmflag xray3: 主线程(8560:0x1) 自耗时×调用父链 / >8ms 段 / 慢帧窗构成 / 原生调用归因 / 每秒曲线
// run: node scripts/_wasmflag-xray3-main.mjs
import fs from 'node:fs';
const x = JSON.parse(fs.readFileSync('/tmp/wasmflag-xray/extract.json', 'utf8'));
const P = x.profs['8560:0x1'];
const nodes = new Map(P.nodes.map(([nid, a]) => [nid, { fn: a[0], url: a[1], line: a[2] }]));
const parentOf = new Map(P.parents.map(([nid, par]) => [nid, par]));
const cf = nid => {
  const c = nodes.get(nid) || {};
  return (c.fn || '?') + '@' + (c.url || '?').split('/').slice(-1)[0] + ':' + (c.line ?? '?');
};
const isGameUrl = nid => { const c = nodes.get(nid) || {}; return /LightWorker|WaveWorker|BakeWorker|save\.worker|worldGen|sw-|src\/|Game|Render|Light|Snow|Rain|Weather/i.test(c.url || ''); };

// ---- 1. 自耗时 top × JS 父链 ----
const selfUs = new Map();
for (let i = 0; i < P.S.length; i++) {
  const d = P.D[i] || 0; if (d <= 0) continue;
  const nid = P.S[i]; if (!nodes.has(nid)) continue;
  selfUs.set(nid, (selfUs.get(nid) || 0) + d);
}
const byParent = new Map();
for (const [nid, us] of selfUs) {
  const frame = cf(nid);
  let cur = parentOf.get(nid), jsParent = '(root)', g = 0;
  while (cur != null && g++ < 24) {
    const c2 = nodes.get(cur) || {};
    if (c2.url) { jsParent = cf(cur); break; }
    if (c2.fn === '(garbage collector)') { jsParent = '(GC)'; break; }
    cur = parentOf.get(cur);
  }
  const key = frame + '  ⟵ ' + jsParent;
  const a = byParent.get(key) || (byParent.set(key, { n: 0, us: 0 }), byParent.get(key));
  a.n++; a.us += us;
}
let totalBusy = 0;
for (const [, us] of selfUs) totalBusy += us;
console.log(`== 主线程自耗时×JS调用父链 top34 (busy总采样=${(totalBusy / 1000).toFixed(0)}ms / span 76.1s) ==`);
for (const [k, a] of [...byParent.entries()].sort((p, q) => q[1].us - p[1].us).slice(0, 34))
  console.log(((a.us / 1000).toFixed(0)).padStart(7) + 'ms n=' + String(a.n).padStart(6) + '  ' + k.slice(0, 150));

// ---- 2. 函数级自耗时合并(跨调用方) top30 ----
const byFn = new Map();
for (const [nid, us] of selfUs) {
  const key = cf(nid);
  byFn.set(key, (byFn.get(key) || 0) + us);
}
console.log('\n== 函数级自耗时 top30 ==');
for (const [k, v] of [...byFn.entries()].sort((p, q) => q[1] - p[1]).slice(0, 30))
  console.log(((v / 1000).toFixed(0)).padStart(7) + 'ms  ' + k.slice(0, 140));

// ---- 3. >8ms 连续段(慢帧构成) ----
const t0 = P.TS[0];
const seg = new Map(); const segTimeline = new Map();
for (let i = 0; i < P.S.length; i++) {
  const d = P.D[i] || 0;
  if (d < 8000) continue;
  const nid = P.S[i];
  const frame = cf(nid);
  let cur = parentOf.get(nid), jsParent = '(root)', g = 0;
  while (cur != null && g++ < 24) {
    const c2 = nodes.get(cur) || {};
    if (c2.url) { jsParent = cf(cur); break; }
    if (c2.fn === '(garbage collector)') { jsParent = '(GC)'; break; }
    cur = parentOf.get(cur);
  }
  const key = frame + ' ⟵ ' + jsParent;
  seg.set(key, (seg.get(key) || 0) + d / 1000);
  if (d > 12000) {
    const sec = Math.floor((P.TS[i] - t0) / 1e6);
    const a = segTimeline.get(sec) || (segTimeline.set(sec, []), segTimeline.get(sec));
    a.push((d / 1000).toFixed(0) + 'ms ' + key.slice(0, 110));
  }
}
console.log('\n== >8ms 连续采样段 按构成(合计) ==');
for (const [k, v] of [...seg.entries()].sort((p, q) => q[1] - p[1]).slice(0, 18))
  console.log(v.toFixed(0).padStart(7) + 'ms  ' + k.slice(0, 150));
console.log('\n== >12ms 段逐秒明细(前 24 秒桶) ==');
for (const [sec, arr] of [...segTimeline.entries()].sort((p, q) => p[0] - q[0]).slice(0, 24))
  console.log(String(sec).padStart(3) + 's:', arr.slice(0, 3).join(' | ') + (arr.length > 3 ? ` (+${arr.length - 3})` : ''));

// ---- 4. 慢帧窗(rAF gap>12.5ms)内的 X 事件构成 ----
const frames = x.mainEvents.filter(e => e[0] === 'PageAnimator::serviceScriptedAnimations').map(e => ({ ts: e[1], dur: e[2] })).sort((a, b) => a.ts - b.ts);
const slowWins = [];
for (let i = 1; i < frames.length; i++) {
  const gap = (frames[i].ts - frames[i - 1].ts) / 1000;
  if (gap > 12.5) slowWins.push({ t0: frames[i - 1].ts, t1: frames[i].ts, gap });
}
const inSlow = new Map();
for (const e of x.mainEvents) {
  if (e[2] < 300) continue;   // 只看 >0.3ms 的事件
  for (const w of slowWins) {
    if (e[1] >= w.t0 && e[1] < w.t1) {
      const a = inSlow.get(e[0]) || (inSlow.set(e[0], { n: 0, dur: 0 }), inSlow.get(e[0]));
      a.n++; a.dur += e[2];
      break;
    }
  }
}
console.log('\n== 慢帧窗(' + slowWins.length + '个)内 X 事件构成(dur>0.3ms) ==');
for (const [k, a] of [...inSlow.entries()].sort((p, q) => q[1].dur - p[1].dur).slice(0, 16))
  console.log((a.dur / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(5) + '  ' + k);

// 慢帧窗内 FunctionCall 函数
const inSlowFn = new Map();
for (const f of x.mainFunc) {
  const [, url, line, ts, dur] = f;
  for (const w of slowWins) {
    if (ts >= w.t0 && ts < w.t1) {
      const key = f[0] + '@' + String(url).split('/').slice(-1)[0] + ':' + line;
      const a = inSlowFn.get(key) || (inSlowFn.set(key, { n: 0, dur: 0 }), inSlowFn.get(key));
      a.n++; a.dur += dur;
      break;
    }
  }
}
console.log('\n== 慢帧窗内 FunctionCall(入口函数) ==');
for (const [k, a] of [...inSlowFn.entries()].sort((p, q) => q[1].dur - p[1].dur).slice(0, 16))
  console.log((a.dur / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a.n).padStart(5) + '  ' + k.slice(0, 130));

// ---- 5. 原生调用归因:X 事件中的原生 API ----
const NATIVE = /DrawImage|PutImageData|GetImageData|TexImage2D|TexSubImage2D|ReadPixels|CompressedTex|BindTexture|UseProgram|DrawElements|DrawArrays|BufferData|BufferSubData|WebGL|Canvas.*Context|Paint|Composite|Raster|Gpu|GPU|Upload|Blit|Present|Swap/i;
console.log('\n== 原生/渲染 API X 事件(主线程) ==');
for (const [n, a] of Object.entries(x.censusMain)) {
  if (NATIVE.test(n) && a[1] > 2000) console.log((a[1] / 1000).toFixed(0).padStart(7) + 'ms n=' + String(a[0]).padStart(7) + '  ' + n);
}

// ---- 6. 每秒曲线:top 函数的时间集中度 ----
console.log('\n== 主线程 top 函数每秒曲线(采样 µs/秒,仅列 >8ms/秒 的秒) ==');
const topFns = [...byFn.entries()].sort((p, q) => q[1] - p[1]).slice(0, 6).map(([k]) => k);
const curves = new Map(topFns.map(k => [k, new Map()]));
for (let i = 0; i < P.S.length; i++) {
  const d = P.D[i] || 0; if (d <= 0) continue;
  const key = cf(P.S[i]);
  const curve = curves.get(key); if (!curve) continue;
  const sec = Math.floor((P.TS[i] - t0) / 1e6);
  curve.set(sec, (curve.get(sec) || 0) + d);
}
for (const k of topFns) {
  const curve = curves.get(k);
  const hot = [...curve.entries()].filter(([, v]) => v > 8000).sort((p, q) => p[0] - q[0]);
  const total = [...curve.values()].reduce((s, v) => s + v, 0);
  console.log(`\n  ${k.slice(0, 110)}  total=${(total / 1000).toFixed(0)}ms hotSecs=${hot.length}`);
  console.log('    ' + hot.slice(0, 20).map(([s, v]) => s + 's:' + (v / 1000).toFixed(0)).join(' '));
}
