// B2 终局裁决·全量分析 v2(主循环=loop@967623):帧结构/摆动形态/回声指纹/fps 复算/skip 归因
import fs from 'node:fs';

const d = JSON.parse(fs.readFileSync('/tmp/b2final-data.json', 'utf8'));
const names = d.fnNames;
const GAME_LOOP_LINE = 967623;

const game = [];
for (const c of d.callsInFire) {
  for (const call of c) {
    if (names[call[2]] === 'loop' && call[3] === GAME_LOOP_LINE) { game.push(call); break; }
  }
}
game.sort((a, b) => a[0] - b[0]);
const t = game.map(c => c[0] / 1000);
const dur = game.map(c => c[1] / 1000);
const W = (t[t.length - 1] - t[0]) / 1000;
console.log('game loop callbacks:', game.length, 'window(s):', W.toFixed(2), `rate=${(game.length / W).toFixed(1)}/s`);

const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))];

// ── 渲染/skip 分类:找双谷 ──
const durs = [...dur].sort((a, b) => a - b);
console.log('dur ms: p10', q(durs, .1).toFixed(2), 'p25', q(durs, .25).toFixed(2), 'p50', q(durs, .5).toFixed(2),
  'p75', q(durs, .75).toFixed(2), 'p90', q(durs, .9).toFixed(2), 'max', durs[durs.length - 1].toFixed(1));
// dur 直方图 0-8ms 0.5ms 桶
const dh = new Array(16).fill(0);
for (const x of dur) { const b = Math.min(15, Math.floor(x / 0.5)); dh[b]++; }
console.log('dur hist(0.5ms):', dh.map((v, i) => v ? `${(i * 0.5).toFixed(1)}:${v}` : '').filter(Boolean).join(' '));
const THRESH = 1.0;   // skip 判定:主循环空身 ≈0.03ms,渲染 ≥1.5ms
const skips = [], renderIdx = [];
for (let i = 0; i < game.length; i++) (dur[i] < THRESH ? skips : renderIdx).push(i);
console.log('renders:', renderIdx.length, 'skips:', skips.length, `skip rate=${(100 * skips.length / game.length).toFixed(2)}%`);

// ── 渲染帧距/fps 读数 ──
const gaps = [];
for (let j = 1; j < renderIdx.length; j++) gaps.push(t[renderIdx[j]] - t[renderIdx[j - 1]]);
const gs = [...gaps].sort((a, b) => a - b);
console.log('\nrender gap ms: p01', q(gs, .01).toFixed(2), 'p10', q(gs, .1).toFixed(2), 'p50', q(gs, .5).toFixed(2),
  'p90', q(gs, .9).toFixed(2), 'p99', q(gs, .99).toFixed(2), 'max', gs[gs.length - 1].toFixed(1));
const gmean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
const gsd = Math.sqrt(gaps.reduce((a, b) => a + (b - gmean) ** 2, 0) / gaps.length);
console.log('render gap mean', gmean.toFixed(3), 'sd', gsd.toFixed(3), 'CV', (gsd / gmean).toFixed(4), '=>', (1000 / gmean).toFixed(1), 'fps');
const gh = new Array(24).fill(0);
for (const g of gaps) { const b = Math.min(23, Math.floor(g / 1.5)); gh[b]++; }
console.log('gap hist(1.5ms bins):', gh.map((v, i) => v ? `${(i * 1.5).toFixed(1)}:${v}` : '').filter(Boolean).join(' '));

// fps 读数复算(60 帧滚动窗)
const fpsSeries = [];
for (let j = 60; j < gaps.length; j++) {
  let sum = 0; for (let k = j - 60; k < j; k++) sum += gaps[k];
  fpsSeries.push({ at: t[renderIdx[j]], fps: 1000 / (sum / 60) });
}
{
  const fs2 = fpsSeries.map(x => x.fps).sort((a, b) => a - b);
  console.log('\nfps readout(rolling 60): p05', q(fs2, .05).toFixed(1), 'p25', q(fs2, .25).toFixed(1),
    'p50', q(fs2, .5).toFixed(1), 'p75', q(fs2, .75).toFixed(1), 'p95', q(fs2, .95).toFixed(1),
    ' min', fs2[0].toFixed(1), 'max', fs2[fs2.length - 1].toFixed(1));
  const below119 = fpsSeries.filter(x => x.fps < 119).length, above121 = fpsSeries.filter(x => x.fps > 121).length;
  console.log(`  <119: ${(100 * below119 / fpsSeries.length).toFixed(1)}%  >121: ${(100 * above121 / fpsSeries.length).toFixed(1)}%`);
  let cross = 0;
  const fss = fpsSeries.map(x => x.fps);
  for (let i = 1; i < fss.length; i++) if ((fss[i - 1] < 120) !== (fss[i] < 120)) cross++;
  console.log('  120-crossings:', cross, `rate=${(cross / W).toFixed(2)}/s`);
  // 每秒 fps 读数 band
  console.log('  per-second fps p50 band:');
  for (let s = 0; s < Math.ceil(W); s++) {
    const seg = fss.filter((_, i) => fpsSeries[i].at >= t[0] + s * 1000 && fpsSeries[i].at < t[0] + (s + 1) * 1000);
    if (seg.length >= 20) {
      const ss = [...seg].sort((a, b) => a - b);
      console.log(`   s${String(s).padStart(2)}: p10=${q(ss, .1).toFixed(0)} p50=${q(ss, .5).toFixed(0)} p90=${q(ss, .9).toFixed(0)}`);
    }
  }
}

// ── delta 流直方图 + 低族形态 ──
const deltas = [];
for (let i = 1; i < t.length; i++) deltas.push(t[i] - t[i - 1]);
{
  const dgs = [...deltas].sort((a, b) => a - b);
  console.log('\ndelta(all callbacks): p01', q(dgs, .01).toFixed(2), 'p05', q(dgs, .05).toFixed(2),
    'p25', q(dgs, .25).toFixed(2), 'p50', q(dgs, .5).toFixed(2), 'p75', q(dgs, .75).toFixed(2),
    'p95', q(dgs, .95).toFixed(2), 'max', dgs[dgs.length - 1].toFixed(1));
  const hh = new Array(20).fill(0);
  for (const g of deltas) { const b = Math.max(0, Math.min(19, Math.floor((g - 2) / 0.75))); hh[b]++; }
  console.log('delta hist(0.75ms from 2ms):', hh.map((v, i) => v ? `${(2 + i * 0.75).toFixed(2)}:${v}` : '').filter(Boolean).join(' '));
}

// ── skip 归因:skip 前渲染帧距(skip 时 now-lastRenderAt)──
console.log('\n== skip attribution ==');
{
  const gBefore = [], gAfter = [], cBefore = [];
  for (const si of skips) {
    // 上一个渲染帧
    let pr = -1; for (let j = si - 1; j >= 0; j--) if (dur[j] >= THRESH) { pr = j; break; }
    let nr = -1; for (let j = si + 1; j < game.length; j++) if (dur[j] >= THRESH) { nr = j; break; }
    if (pr >= 0) { gBefore.push(t[si] - t[pr]); cBefore.push(dur[pr]); }
    if (nr >= 0) gAfter.push(t[nr] - t[si]);
  }
  const gb = [...gBefore].sort((a, b) => a - b), ga = [...gAfter].sort((a, b) => a - b);
  console.log('skip: now-lastRenderAt ms p10', q(gb, .1).toFixed(2), 'p50', q(gb, .5).toFixed(2), 'p90', q(gb, .9).toFixed(2), 'max', gb[gb.length - 1].toFixed(2));
  console.log('  <6.33(=cap-gate 咬合带):', gBefore.filter(x => x < 6.33).length, `  ∈[6.33,7.08):`, gBefore.filter(x => x >= 6.33 && x < 7.08).length, '  ≥7.08(=floor 带外,k/ordinal 域):', gBefore.filter(x => x >= 7.08).length);
  console.log('skip→next render 帧距 ms p10', q(ga, .1).toFixed(2), 'p50', q(ga, .5).toFixed(2), 'p90', q(ga, .9).toFixed(2), 'max', ga[ga.length - 1].toFixed(1));
  const cb = [...cBefore].sort((a, b) => a - b);
  console.log('prev render cost ms p50', q(cb, .5).toFixed(2), 'p90', q(cb, .9).toFixed(2));
}

// ── 渲染帧距 16.7 段(k=2 stretches / 长帧距) ──
{
  const long2 = gaps.filter(g => g > 13).length;
  console.log('\nrender gaps >13ms:', long2, `(${(100 * long2 / gaps.length).toFixed(2)}%)`);
  // 游程:连续渲染(skip=0)序列里,skip 是否孤立(单发)还是连发
  let iso = 0, run = 0;
  for (let i = 0; i < game.length; i++) {
    if (dur[i] < THRESH) run++;
    else { if (run === 1) iso++; run = 0; }
  }
  console.log('skip runs: isolated(1):', iso, ' total skips:', skips.length);
}

// ── 回声指纹(回调流口径;与 FrameBeat echoLedger 同构) ──
{
  const pairs = [];
  for (let i = 1; i < game.length; i++) {
    const prevCost = dur[i - 1] >= THRESH ? dur[i - 1] : 0;
    pairs.push([deltas[i - 1], prevCost]);
  }
  const n = pairs.length;
  const mc = pairs.reduce((a, p) => a + p[0], 0) / n, md = pairs.reduce((a, p) => a + p[1], 0) / n;
  let scc = 0, sdd = 0, scd = 0;
  for (const [c, cost] of pairs) { const dc = c - mc, dd = cost - md; scc += dc * dc; sdd += dd * dd; scd += dc * dd; }
  const corr = scd / Math.sqrt(scc * sdd);
  const resids = pairs.map(([c, cost]) => c - cost);
  const rm = resids.reduce((a, b) => a + b, 0) / n;
  const rsd = Math.sqrt(resids.reduce((a, b) => a + (b - rm) ** 2, 0) / n);
  const rs = [...resids].sort((a, b) => a - b);
  console.log('\necho fingerprint(callback stream): corr=', corr.toFixed(3), 'resid sd=', rsd.toFixed(2),
    'resid p50=', q(rs, .5).toFixed(2), 'p90=', q(rs, .9).toFixed(2));
}

// ── ticker 节奏(step@834758 链=合成器真帧锚) ──
{
  const step = [];
  for (const c of d.callsInFire) for (const call of c) {
    if (names[call[2]] === 'step' && call[3] === 834758) { step.push(call[0] / 1000); break; }
  }
  step.sort((a, b) => a - b);
  const sg = [];
  for (let i = 1; i < step.length; i++) sg.push(step[i] - step[i - 1]);
  const sgs = [...sg].sort((a, b) => a - b);
  const smean = sg.reduce((a, b) => a + b, 0) / sg.length;
  const ssd = Math.sqrt(sg.reduce((a, b) => a + (b - smean) ** 2, 0) / sg.length);
  console.log(`\nticker(step chain) rate=${(step.length / ((step[step.length - 1] - step[0]) / 1000)).toFixed(1)}/s mean=${smean.toFixed(3)}ms sd=${ssd.toFixed(2)} p50=${q(sgs, .5).toFixed(2)} p01=${q(sgs, .01).toFixed(2)} p99=${q(sgs, .99).toFixed(2)}`);
  const sh = new Array(16).fill(0);
  for (const g of sg) { const b = Math.max(0, Math.min(15, Math.floor((g - 4) / 0.6))); sh[b]++; }
  console.log('ticker hist(0.6ms from 4ms):', sh.map((v, i) => v ? `${(4 + i * 0.6).toFixed(1)}:${v}` : '').filter(Boolean).join(' '));
  // ticker 游走:每 2s 均值
  console.log('ticker per-2s mean:');
  for (let s = 0; s < Math.ceil(W / 2); s++) {
    const seg = sg.filter((g, i) => step[i] >= step[0] + s * 2000 && step[i] < step[0] + (s + 1) * 2000);
    if (seg.length > 50) console.log(`   ${(s * 2).toFixed(0)}s: ${(seg.reduce((a, b) => a + b, 0) / seg.length).toFixed(3)}ms => ${(1000 / (seg.reduce((a, b) => a + b, 0) / seg.length)).toFixed(1)}/s`);
  }
}

// ── 每秒 skip 计数 ──
console.log('\nper-second skip count:');
for (let s = 0; s < Math.ceil(W); s++) {
  const n = skips.filter(i => t[i] >= t[0] + s * 1000 && t[i] < t[0] + (s + 1) * 1000).length;
  const rn = game.filter((_, i) => t[i] >= t[0] + s * 1000 && t[i] < t[0] + (s + 1) * 1000).length;
  process.stdout.write(` s${s}:${n}/${rn}`);
}
console.log();
