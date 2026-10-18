// EoL2 xray1: Profile 流归属 + 真帧时间轴(PageAnimator/Commit) + 游戏自带 mark/measure 面 + 慢帧嵌套归因
// run: node --max-old-space-size=8192 scripts/_eol2-xray1.mjs [trace.json]
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
const PATH = process.argv[2] || needInput(join(DOWNLOADS, 'Trace-20261005T020627.json'));
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];
const tidName = new Map();
for (const e of evs) if (e.ph === 'M' && e.name === 'thread_name') tidName.set(e.pid + ':' + e.tid, e.args?.name || '');
const MPID = 2349, MAIN_TID = 28208914, MAIN = MPID + ':' + MAIN_TID;

// 1. Profile 事件归属
console.log('== Profile 事件(id → tid) ==');
for (const e of evs) if (e.name === 'Profile') console.log('  ' + e.id, 'tid=' + e.tid, '<' + (tidName.get(e.pid + ':' + e.tid) || '?') + '>', 'start=' + ((e.args?.data?.startTime || e.ts) / 1e6).toFixed(2) + 's(abs)');

// 2. 真帧时间轴: PageAnimator::serviceScriptedAnimations 为主
const rafs = evs.filter(e => e.ph === 'X' && e.name === 'FireAnimationFrame' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
const pa = evs.filter(e => e.ph === 'X' && e.name === 'PageAnimator::serviceScriptedAnimations' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
console.log('\n== 帧级事件: PageAnimator n=' + pa.length + ' FireAnimationFrame n=' + rafs.length + ' ==');
// PageAnimator 的 gap 分布 = 真帧距
const pg = [];
for (let i = 1; i < pa.length; i++) pg.push((pa[i].ts - pa[i - 1].ts) / 1000);
const sp = [...pg].sort((a, b) => a - b);
const pq = p => sp[Math.floor(sp.length * p)] || 0;
console.log('PageAnimator gap p50/p75/p90/p95/p99/max:', pq(.5).toFixed(1), pq(.75).toFixed(1), pq(.9).toFixed(1), pq(.95).toFixed(1), pq(.99).toFixed(1), (sp.at(-1) || 0).toFixed(1));
// 慢帧清单(>20ms)
console.log('== 慢帧清单(gap>20ms, 时间轴 s 相对首帧) ==');
const t0 = pa[0]?.ts ?? 0;
const slowFrames = [];
for (let i = 1; i < pa.length; i++) {
  const g = (pa[i].ts - pa[i - 1].ts) / 1000;
  if (g > 20) { slowFrames.push({ sec: ((pa[i].ts - t0) / 1e6).toFixed(2), gap: g, dur: pa[i].dur / 1000 }); console.log('  @' + ((pa[i].ts - t0) / 1e6).toFixed(2) + 's gap=' + g.toFixed(1) + 'ms frameDur=' + (pa[i].dur / 1000).toFixed(1) + 'ms'); }
}
console.log('slow(>20ms)总数:', slowFrames.length, '/ 帧', pa.length);

// 3. 每帧 rAF 回调数分布(判定多回调注册)
const perFrame = new Map();
for (const r of rafs) {
  // 归属到包含它的 PageAnimator 窗
  let lo = 0, hi = pa.length - 1, fi = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (pa[m].ts <= r.ts) { fi = m; lo = m + 1; } else hi = m - 1; }
  if (fi >= 0 && r.ts <= pa[fi].ts + pa[fi].dur) perFrame.set(fi, (perFrame.get(fi) || 0) + 1);
}
const dist = new Map();
for (const v of perFrame.values()) dist.set(v, (dist.get(v) || 0) + 1);
console.log('每帧 rAF 回调数分布:', [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => k + 'cb:' + v + '帧').join('  '));

// 4. 游戏自带 mark/measure/user timing 面
const nameAgg = new Map();
for (const e of evs) {
  if (e.pid !== MPID) continue;
  const nm = e.name || '';
  if (/measure|TimeStamp|mark|swperf|Frame\b|paint|Probe|Instrument/i.test(nm) || e.cat === 'disabled-by-default-devtools.timeline.frame') {
    let a = nameAgg.get(nm); if (!a) { a = { n: 0, dur: 0, ph: e.ph }; nameAgg.set(nm, a); }
    a.n++; a.dur += e.dur || 0;
  }
}
console.log('\n== 疑似 mark/measure/帧面事件(pid=2349 全线程) ==');
for (const [n, a] of [...nameAgg.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 30))
  console.log('  ' + (a.dur / 1000).toFixed(1).padStart(8) + 'ms n=' + String(a.n).padStart(6) + ' ph=' + a.ph + ' ' + n.slice(0, 100));

// 5. 慢帧内嵌套 X 事件归因(直接子事件, 按 ts 区间包含)
console.log('\n== 慢帧(top8 by gap)内部嵌套 X 子事件构成 ==');
const mainX = evs.filter(e => e.ph === 'X' && e.pid + ':' + e.tid === MAIN).sort((a, b) => a.ts - b.ts);
for (const sf of slowFrames.sort((a, b) => b.gap - a.gap).slice(0, 8)) {
  const abs = t0 + sf.sec * 1e6;
  const fi = pa.findIndex(p => Math.abs(p.ts - abs) < 500);
  if (fi < 0) continue;
  const win0 = pa[fi].ts, win1 = pa[fi].ts + pa[fi].dur;
  const inner = new Map();
  for (const e of mainX) {
    if (e.ts >= win0 && e.ts + e.dur <= win1 && e.name !== 'PageAnimator::serviceScriptedAnimations' && e.name !== 'FireAnimationFrame' && e.name !== 'RunTask') {
      let a = inner.get(e.name); if (!a) { a = { n: 0, dur: 0, max: 0 }; inner.set(e.name, a); }
      a.n++; a.dur += e.dur; a.max = Math.max(a.max, e.dur);
    }
  }
  console.log('-- 慢帧 @' + sf.sec + 's gap=' + sf.gap.toFixed(1) + 'ms --');
  for (const [n, a] of [...inner.entries()].sort((x, y) => y[1].dur - x[1].dur).slice(0, 8))
    console.log('     ' + (a.dur / 1000).toFixed(1) + 'ms n=' + a.n + ' max=' + (a.max / 1000).toFixed(1) + ' ' + n.slice(0, 80));
}
