// B2 终局裁决·全量分析:帧结构/摆动形态/回声指纹/fps 复算/Beat 回放
// 用法: node scripts/_b2final-analyze.mjs [--replay]
import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync('/tmp/b2final-data.json', 'utf8'));
const names = d.fnNames;
const GAME_LOOP_LINE = 744791;

// ── 游戏主循环回调序列(FunctionCall fn=loop line=744791) ──
const game = [];
for (const c of d.callsInFire) {
  for (const call of c) {
    if (names[call[2]] === 'loop' && call[3] === GAME_LOOP_LINE) { game.push(call); break; }
  }
}
game.sort((a, b) => a[0] - b[0]);
const t = game.map(c => c[0] / 1000);          // ms
const dur = game.map(c => c[1] / 1000);        // ms
console.log('game loop callbacks:', game.length, 'window(s):', ((t[t.length-1]-t[0])/1000).toFixed(2));

// dur 分布(分类 rendered/skip)
const durs = [...dur].sort((a, b) => a - b);
const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))];
console.log('dur ms: min', durs[0].toFixed(3), 'p10', q(durs, .1).toFixed(2), 'p50', q(durs, .5).toFixed(2),
  'p90', q(durs, .9).toFixed(2), 'p99', q(durs, .99).toFixed(2), 'max', durs[durs.length-1].toFixed(1));
// 双谷探查:0-1ms 与 2ms+ 的计数
const tiny = dur.filter(x => x < 1).length, mid = dur.filter(x => x >= 1 && x < 3).length, big = dur.filter(x => x >= 3).length;
console.log('dur<1ms:', tiny, ' 1-3ms:', mid, ' >=3ms:', big);

// ── 相位切分:按时间每秒的成本中位数 ──
console.log('\n== per-second cost p50 / render count ==');
for (let s = 0; s * 1000 + t[0] < t[t.length - 1]; s++) {
  const seg = [];
  let renders = 0;
  for (let i = 0; i < game.length; i++) {
    if (t[i] >= t[0] + s * 1000 && t[i] < t[0] + (s + 1) * 1000) { seg.push(dur[i]); if (dur[i] >= 1.5) renders++; }
  }
  if (seg.length) console.log(`  s${String(s).padStart(2)}: n=${String(seg.length).padStart(3)} renders=${String(renders).padStart(3)} p50cost=${q([...seg].sort((a,b)=>a-b), .5).toFixed(2)}ms`);
}

// ── delta 流(observeVsync 所见;相邻主循环回调间隔) ──
const deltas = [];
for (let i = 1; i < t.length; i++) deltas.push(t[i] - t[i - 1]);
const ds = [...deltas].sort((a, b) => a - b);
console.log('\n== delta(all callbacks) ms: p01', q(ds, .01).toFixed(2), 'p50', q(ds, .5).toFixed(2),
  'p90', q(ds, .9).toFixed(2), 'max', ds[ds.length-1].toFixed(1));
// 低族(<8.33)占比与形态
const low = deltas.filter(x => x < 8.33).length;
const vlow = deltas.filter(x => x < 7.2).length;
console.log('delta<8.33:', low, `(${(100*low/deltas.length).toFixed(1)}%)  <7.2:`, vlow, `(${(100*vlow/deltas.length).toFixed(1)}%)`);

// ── 渲染帧序列与帧距 ──
const THRESH = 1.5;   // rendered 判定(dur ms)
const renders = [];
for (let i = 0; i < game.length; i++) if (dur[i] >= THRESH) renders.push(i);
console.log('\n== rendered frames:', renders.length, '/', game.length, `(${(100*renders.length/game.length).toFixed(2)}%)  skips=${game.length - renders.length}`);
const gaps = [];
for (let j = 1; j < renders.length; j++) gaps.push(t[renders[j]] - t[renders[j-1]]);
const gs = [...gaps].sort((a, b) => a - b);
console.log('render gap ms: p01', q(gs, .01).toFixed(2), 'p10', q(gs, .1).toFixed(2), 'p50', q(gs, .5).toFixed(2),
  'p90', q(gs, .9).toFixed(2), 'p99', q(gs, .99).toFixed(2), 'max', gs[gs.length-1].toFixed(1));
const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
console.log('render gap mean', mean.toFixed(3), 'sd', sd.toFixed(3), 'CV', (sd/mean).toFixed(4));

// 直方图(2ms 桶,0-40ms)
const hist = new Array(21).fill(0);
for (const g of gaps) { const b = Math.min(20, Math.floor(g / 2)); hist[b]++; }
console.log('gap hist(2ms bins 0-40+):', hist.map((v, i) => v ? `${i*2}-${i*2+2}:${v}` : '').filter(Boolean).join(' '));

// ── fps 读数复算(60 帧滚动窗,game.frameDts 语义) ──
const fpsSeries = [];
for (let j = 60; j < gaps.length; j++) {
  let sum = 0; for (let k = j - 60; k < j; k++) sum += gaps[k];
  fpsSeries.push({ at: t[renders[j]], fps: 1000 / (sum / 60) });
}
if (fpsSeries.length) {
  const fs2 = fpsSeries.map(x => x.fps);
  const fs2s = [...fs2].sort((a, b) => a - b);
  console.log('\n== fps readout(60-frame rolling) : p05', q(fs2s, .05).toFixed(1), 'p25', q(fs2s, .25).toFixed(1),
    'p50', q(fs2s, .5).toFixed(1), 'p75', q(fs2s, .75).toFixed(1), 'p95', q(fs2s, .95).toFixed(1),
    ' min', fs2s[0].toFixed(1), 'max', fs2s[fs2s.length-1].toFixed(1));
  const below119 = fs2.filter(f => f < 119).length, above121 = fs2.filter(f => f > 121).length;
  console.log(`  <119fps: ${(100*below119/fs2.length).toFixed(1)}%  >121fps: ${(100*above121/fs2.length).toFixed(1)}%  ∈[119,121]: ${(100*(fs2.length-below119-above121)/fs2.length).toFixed(1)}%`);
  // 读数过零(120 穿越)率:每秒穿越次数
  let cross = 0;
  for (let i = 1; i < fs2.length; i++) if ((fs2[i-1] < 120) !== (fs2[i] < 120)) cross++;
  console.log('  120-crossings total:', cross, ` rate=${(cross / ((t[t.length-1]-t[0])/1000)).toFixed(2)}/s`);
}

// ── 摆动形态:游走 vs 双峰 vs 周期 ──
// autocorrelation of gaps (lag 1..8)
function acf(arr, lag) {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  let num = 0, den = 0;
  for (let i = 0; i < arr.length; i++) {
    den += (arr[i] - m) ** 2;
    if (i + lag < arr.length) num += (arr[i] - m) * (arr[i + lag] - m);
  }
  return num / den;
}
console.log('\n== gap autocorrelation(lag1-8):', [1,2,3,4,5,6,7,8].map(L => `L${L}:${acf(gaps, L).toFixed(3)}`).join(' '));
// lag-1 parity 交替检验(双峰交替:gap_i 高则 gap_i+1 低)
const hiLo = gaps.map(g => g > mean ? 1 : 0);
let altern = 0;
for (let i = 1; i < hiLo.length; i++) if (hiLo[i] !== hiLo[i-1]) altern++;
console.log(`  alternation rate: ${(100*altern/hiLo.length).toFixed(1)}% (random=50%)`);

// ── 回声指纹:corr(delta_i, cost_{i-1}) 主循环回调流 ──
// 回调流口径(observeVsync 所见):delta=相邻回调间隔,cost=上一回调渲染成本(非渲染=0)
{
  const pairs = [];
  for (let i = 1; i < game.length; i++) {
    const prevCost = dur[i-1] >= THRESH ? dur[i-1] : 0;
    pairs.push([deltas[i-1], prevCost]);
  }
  const n = pairs.length;
  const mc = pairs.reduce((a, p) => a + p[0], 0) / n, md = pairs.reduce((a, p) => a + p[1], 0) / n;
  let scc = 0, sdd = 0, scd = 0;
  for (const [c, cost] of pairs) { const dc = c - mc, dd = cost - md; scc += dc*dc; sdd += dd*dd; scd += dc*dd; }
  const corr = scd / Math.sqrt(scc * sdd);
  // 残差:delta - prevCost
  const resids = pairs.map(([c, cost]) => c - cost);
  const rm = resids.reduce((a, b) => a + b, 0) / n;
  const rsd = Math.sqrt(resids.reduce((a, b) => a + (b - rm) ** 2, 0) / n);
  console.log('\n== echo fingerprint (callback stream): corr(delta, prevRenderCost) =', corr.toFixed(3), ' resid sd =', rsd.toFixed(2), ' resid p50 =', q([...resids].sort((a,b)=>a-b), .5).toFixed(2));
  // 渲染帧口径(delta=渲染帧距 vs 前帧成本)
  const rp = [];
  for (let j = 1; j < renders.length; j++) rp.push([t[renders[j]] - t[renders[j-1]], dur[renders[j-1]]]);
  const rn = rp.length;
  const rmc = rp.reduce((a, p) => a + p[0], 0) / rn, rmd = rp.reduce((a, p) => a + p[1], 0) / rn;
  let rc1 = 0, rc2 = 0, rc3 = 0;
  for (const [g, cost] of rp) { const a1 = g - rmc, a2 = cost - rmd; rc1 += a1*a1; rc2 += a2*a2; rc3 += a1*a2; }
  console.log('   render-gap stream: corr(gap, prevCost) =', (rc3 / Math.sqrt(rc1 * rc2)).toFixed(3), ` n=${rn}`);
}

// ── 真帧锚:PageAnimator/BeginMainThreadFrame/DrawFrame/Presentation 速率 ──
function rateSeries(events, label) {
  if (!events.length) return;
  const durS = (events[events.length-1] - events[0]) / 1e6;
  console.log(`  ${label}: n=${events.length} rate=${(events.length / durS).toFixed(1)}/s over ${durS.toFixed(1)}s`);
}
console.log('\n== true-frame anchors ==');
rateSeries(d.pageAnim.map(e => e[0]), 'PageAnimator');
rateSeries(d.beginMain, 'BeginMainThreadFrame');
rateSeries(d.drawFrames, 'DrawFrame(compositor)');
rateSeries(d.presentation, 'AnimationFrame::Presentation');
// 合成器 ticker 节奏(pageAnim gaps)
{
  const pg = [];
  for (let i = 1; i < d.pageAnim.length; i++) pg.push((d.pageAnim[i][0] - d.pageAnim[i-1][0]) / 1000);
  const pgs = [...pg].sort((a, b) => a - b);
  console.log('  ticker gap ms: p01', q(pgs, .01).toFixed(2), 'p10', q(pgs, .1).toFixed(2), 'p50', q(pgs, .5).toFixed(3),
    'p90', q(pgs, .9).toFixed(2), 'p99', q(pgs, .99).toFixed(2), 'max', pgs[pgs.length-1].toFixed(1));
  const pmean = pg.reduce((a, b) => a + b, 0) / pg.length;
  const psd = Math.sqrt(pg.reduce((a, b) => a + (b - pmean) ** 2, 0) / pg.length);
  console.log('  ticker mean', pmean.toFixed(3), 'sd', psd.toFixed(3), ' =>', (1000/pmean).toFixed(1), 'fps');
  const pgHist = new Array(12).fill(0);
  for (const g of pg) { const b = Math.max(0, Math.min(11, Math.floor((g - 5) / 1.5))); pgHist[b]++; }
  console.log('  ticker hist(1.5ms bins from 5ms):', pgHist.map((v, i) => v ? `${5+i*1.5}:${v}` : '').filter(Boolean).join(' '));
}

// ── skip 形态:短帧(dur<1.5)的时间分布 ──
{
  const skipTs = [];
  for (let i = 0; i < game.length; i++) if (dur[i] < THRESH) skipTs.push(t[i]);
  console.log('\n== skips:', skipTs.length);
  if (skipTs.length) {
    // 相邻 skip 间隔
    const sg = [];
    for (let i = 1; i < skipTs.length; i++) sg.push(skipTs[i] - skipTs[i-1]);
    const sgs = [...sg].sort((a, b) => a - b);
    console.log('  skip-interval ms: p10', q(sgs, .1).toFixed(1), 'p50', q(sgs, .5).toFixed(1), 'p90', q(sgs, .9).toFixed(1));
    // skip 前后帧距(与 lastRender 的关系——v9.4 门形态:skip 后下一渲染帧距≈2×ticker)
    let pair = 0;
    for (let i = 1; i < game.length - 1; i++) {
      if (dur[i] < THRESH && dur[i-1] >= THRESH && dur[i+1] >= THRESH) {
        const g1 = t[i] - t[i-1], g2 = t[i+1] - t[i];
        if (g1 < 8.33 && g2 > 9) pair++;
      }
    }
    console.log('  skip 形态 [短帧距→skip→长帧距] 对数:', pair);
  }
}

// ── GC 大事件与慢帧 ──
{
  const gcBig = d.gcEvents.filter(e => e[1] > 4000);
  console.log('\n== GC>4ms:', gcBig.length, gcBig.slice(0, 10).map(e => `${(e[0]/1e6).toFixed(1)}s:${(e[1]/1000).toFixed(1)}ms`).join(' '));
}
