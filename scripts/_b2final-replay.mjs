// B2 终局裁决·真实 FrameBeat 回放:trace 流喂现行引擎,逐回调对账 skip 机制归属+A/B 三配置
import fs from 'node:fs';
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/core/FrameBeat.ts'],
  bundle: true, format: 'esm', outfile: '/tmp/framebeat-bundle.mjs', logLevel: 'silent',
});
const FB = await import('/tmp/framebeat-bundle.mjs');
const { FrameBeat, GRID_MS } = FB;

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
const THRESH = 1.0;
const observed = dur.map(x => x >= THRESH);

const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))];

// ── 回放驱动器:make=引擎工厂,capGate=是否保留 v9.4 门(子类可禁) ──
class NoGateBeat extends FB.FrameBeat {
  shouldRender(now) {   // v8 真身:无 cap 门,其余逐行同构
    if (this.ordinal < this.k) return false;
    if (this.k * this.vsyncPeriod >= this.targetMs() - 2) return true;
    return now - this.lastRenderAt >= this.targetMs() - 2;
  }
}
class LegacyNoGateBeat extends NoGateBeat {
  estimateVsync() { return this.legacyEstimate(); }   // 估计器也回旧=B2 前完整真身
}
class LegacyGateBeat extends FB.FrameBeat {           // 任务字面 A:旧估计器+保留门
  estimateVsync() { return this.legacyEstimate(); }
}

function replay(make, cap, label) {
  const beat = make();
  const decisions = [];       // true=render
  const est = [], minKs = [], ks = [], gates = [];   // gates: 'gate'|'ordinal'|'render'|'guard'
  let lastRenderAt = -1;
  for (let i = 0; i < game.length; i++) {
    const now = t[i];
    beat.observeVsync(now, cap);
    est.push(beat.vsyncPeriod);
    minKs.push(beat.minK());
    ks.push(beat.k);
    // skip 归因(与引擎同判据)
    let why = 'render';
    if (beat.ordinal < beat.k) why = 'ordinal';
    else if (cap > 0 && lastRenderAt >= 0 && now - lastRenderAt < beat.targetMs() - 2) why = 'gate';
    else if (beat.k * beat.vsyncPeriod < beat.targetMs() - 2 && lastRenderAt >= 0 && now - lastRenderAt < beat.targetMs() - 2) why = 'guard';
    const go = beat.shouldRender(now);
    if (!go && why === 'render') why = '???';
    decisions.push(go);
    gates.push(why);
    if (go) {
      beat.beginRender(now);
      beat.endRender(now + (observed[i] ? dur[i] : 0.5));   // skip 帧被渲染则给最小成本
      lastRenderAt = now;
    }
  }
  // 对账
  let agree = 0;
  for (let i = 0; i < game.length; i++) if (decisions[i] === observed[i]) agree++;
  const replaySkips = decisions.filter(x => !x).length;
  const whyTally = {};
  for (const w of gates) if (w !== 'render') whyTally[w] = (whyTally[w] || 0) + 1;
  const kFlips = ks.slice(1).filter((k, i) => k !== ks[i]).length;
  const kSet = [...new Set(ks)];
  const floorFlips = minKs.slice(1).filter((m, i) => m !== minKs[i]).length;
  // 渲染帧距/fps 读数
  const rIdx = [];
  for (let i = 0; i < game.length; i++) if (decisions[i]) rIdx.push(i);
  const gaps = [];
  for (let j = 1; j < rIdx.length; j++) gaps.push(t[rIdx[j]] - t[rIdx[j - 1]]);
  const gmean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const gsd = Math.sqrt(gaps.reduce((a, b) => a + (b - gmean) ** 2, 0) / gaps.length);
  const fps = [];
  for (let j = 60; j < gaps.length; j++) {
    let sum = 0; for (let k = j - 60; k < j; k++) sum += gaps[k];
    fps.push(1000 / (sum / 60));
  }
  const fs2 = [...fps].sort((a, b) => a - b);
  let cross = 0;
  for (let i = 1; i < fps.length; i++) if ((fps[i - 1] < 120) !== (fps[i] < 120)) cross++;
  const longGaps = gaps.filter(g => g > 13).length;
  const estS = [...est].sort((a, b) => a - b);
  console.log(`\n== ${label} ==`);
  console.log(`  agree-with-observed: ${agree}/${game.length} (${(100 * agree / game.length).toFixed(2)}%)  replaySkips=${replaySkips} (observed 278)`);
  console.log(`  skip why: ${JSON.stringify(whyTally)}  capSkips(引擎账)=${beat.capSkips}`);
  console.log(`  k: set=${JSON.stringify(kSet)} flips=${kFlips}  minK flips=${floorFlips}`);
  console.log(`  est ms: p01=${q(estS, .01).toFixed(2)} p50=${q(estS, .5).toFixed(2)} p99=${q(estS, .99).toFixed(2)}  minK: p50=${q(minKs, .5)}`);
  console.log(`  render rate=${(1000 / gmean).toFixed(1)}fps  gap sd=${gsd.toFixed(3)} CV=${(gsd / gmean).toFixed(4)} longGaps>13ms=${longGaps}`);
  console.log(`  fps readout: p05=${q(fs2, .05).toFixed(1)} p50=${q(fs2, .5).toFixed(1)} p95=${q(fs2, .95).toFixed(1)} min=${fs2[0].toFixed(1)} max=${fs2[fs2.length - 1].toFixed(1)} crossings120=${cross}(${(cross / ((t[t.length - 1] - t[0]) / 1000)).toFixed(2)}/s)`);
  return { beat, est, decisions };
}

// 现行 v9.4(B2 估计器+门)
replay(() => new FrameBeat(), 120, '现行 v9.4(B2 est + cap 门)');
// 任务字面 A:旧估计器+保留门
replay(() => new LegacyGateBeat(), 120, '任务字面 A(旧 est + cap 门)');
// 完整回退 A':B2 前真身(旧 est + 无门)
replay(() => new LegacyNoGateBeat(), 120, "完整回退 A'(旧 est + 无门 = B2 前真身)");
// 对照:现行估计器+无门(隔离门的贡献)
replay(() => new NoGateBeat(), 120, '隔离对照(B2 est + 无门)');
