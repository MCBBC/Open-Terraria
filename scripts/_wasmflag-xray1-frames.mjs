// wasmflag xray1: 帧结构 — rAF 聚类帧距分布/慢帧时间轴/DroppedFrame
// run: node scripts/_wasmflag-xray1-frames.mjs
import fs from 'node:fs';
const x = JSON.parse(fs.readFileSync('/tmp/wasmflag-xray/extract.json', 'utf8'));

// 帧驱动锚:PageAnimator::serviceScriptedAnimations(每 BeginFrame 服务一次)
const frames = x.mainEvents.filter(e => e[0] === 'PageAnimator::serviceScriptedAnimations').map(e => ({ name: e[0], ts: e[1], dur: e[2] })).sort((a, b) => a.ts - b.ts);
const t0 = frames[0].ts, t1 = frames[frames.length - 1].ts;
const spanS = (t1 - t0) / 1e6;
console.log(`frames(PageAnimator)=${frames.length} span=${spanS.toFixed(2)}s mean=${(spanS * 1000 / frames.length).toFixed(2)}ms/帧`);

// 帧距分布
const gaps = [];
for (let i = 1; i < frames.length; i++) gaps.push((frames[i].ts - frames[i - 1].ts) / 1000);
const s = [...gaps].sort((a, b) => a - b);
const q = p => s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0;
console.log(`gap p50=${q(.5).toFixed(2)} p90=${q(.9).toFixed(2)} p95=${q(.95).toFixed(2)} p99=${q(.99).toFixed(2)} p99.9=${q(.999).toFixed(2)} max=${s[s.length - 1].toFixed(1)}ms`);
const buckets = [8.33, 9, 10, 12.5, 16.7, 20, 25, 33, 50, 100, 250];
let prev = 0;
for (const b of buckets) {
  const n = gaps.filter(g => g > prev && g <= b).length;
  console.log(`  (${prev.toFixed(2)}, ${b}]ms: ${n}`);
  prev = b;
}
console.log(`  >250ms: ${gaps.filter(g => g > 250).length}`);

// 慢帧(>12.5ms)计数与时间轴(按 5s 桶)
const slow = gaps.map((g, i) => ({ g, ts: frames[i].ts })).filter(o => o.g > 12.5);
console.log(`\n慢帧>12.5ms: ${slow.length} (${(100 * slow.length / gaps.length).toFixed(2)}%)`);
const buckets5 = new Map();
for (const o of slow) {
  const k = Math.floor((o.ts - t0) / 5e6);
  buckets5.set(k, (buckets5.get(k) || 0) + 1);
}
console.log('时间轴(5s桶: 慢帧数 | 全帧数):');
for (let k = 0; k <= Math.ceil(spanS / 5); k++) {
  const all = frames.filter(f => Math.floor((f.ts - t0) / 5e6) === k).length;
  console.log(`  ${String(k * 5).padStart(3)}-${String(k * 5 + 5).padStart(3)}s: ${String(buckets5.get(k) || 0).padStart(3)} | ${all}`);
}

// 慢帧明细 top20
console.log('\n最慢 20 帧:');
const sorted = [...slow].sort((a, b) => b.g - a.g);
for (const o of sorted.slice(0, 20)) {
  console.log(`  t=${((o.ts - t0) / 1e6).toFixed(2)}s gap=${o.g.toFixed(1)}ms 帧 dur=${(o.name ? '' : '')}`);
}

// 帧执行时长(dur)分布 — rAF 服务本体
const durs = frames.map(f => f.dur).sort((a, b) => a - b);
const qq = p => durs[Math.min(durs.length - 1, Math.floor(durs.length * p))] || 0;
console.log(`\n帧服务时长 dur p50=${qq(.5).toFixed(2)} p90=${qq(.9).toFixed(2)} p95=${qq(.95).toFixed(2)} p99=${qq(.99).toFixed(2)} max=${durs[durs.length - 1].toFixed(1)}ms`);
console.log('dur>8.33ms 帧:', durs.filter(d => d > 8333).length, ' dur>12.5ms:', durs.filter(d => d > 12500).length, ' dur>20ms:', durs.filter(d => d > 20000).length);

// FireAnimationFrame 每帧回调数分布(3 个 rAF 消费者?)
const rafSorted = x.rafs.slice().sort((a, b) => a - b);
const perFrame = new Map();
let fi = 0;
for (const r of rafSorted) {
  while (fi + 1 < frames.length && frames[fi + 1].ts <= r) fi++;
  const key = Math.round((frames[fi].ts - t0) / 1000);
  perFrame.set(key, (perFrame.get(key) || 0) + 1);
}
const cnt = new Map();
for (const v of perFrame.values()) cnt.set(v, (cnt.get(v) || 0) + 1);
console.log('\n每帧 FireAnimationFrame 回调数分布:', [...cnt.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => k + '×' + v).join(' '));

// rAF 回调的身份:用 mainFunc 中 FireAnimationFrame 窗口内的顶层 FunctionCall?——
// 改用 mainFunc 的顶层入口(url+fn)普查,单独脚本 xray2 做。这里给 rAF 间隔的重聚类:
// 逐个 rAF 回调间隔
const rgaps = [];
for (let i = 1; i < rafSorted.length; i++) rgaps.push((rafSorted[i].ts - rafSorted[i - 1].ts) / 1000);
const rs = [...rgaps].sort((a, b) => a - b);
console.log(`\nrAF 回调级 gap p50=${rs[Math.floor(rs.length * .5)].toFixed(2)} p95=${rs[Math.floor(rs.length * .95)].toFixed(2)} p99=${rs[Math.floor(rs.length * .99)].toFixed(2)} max=${rs[rs.length - 1].toFixed(1)}ms  n=${rgaps.length}`);
