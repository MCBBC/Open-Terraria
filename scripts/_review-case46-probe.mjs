// 对抗审查 A：兔子帧分支（Renderer.ts vanillaFrameIdx case46 族）运行时抽验。
// ① 出生兔行走 120t 帧序列采样：换帧步距 ≈ 7/(|vx|+1)、全 0..6 循环含帧 0
// ② 腾空：vy<0 → 帧4、vy>0 → 帧6（frames=7 无钳差）
// ③ 站定→起步相位：vanilla 站定清 frameCounter → 起步必从帧 0 起；观察我们
//    （walkCycleT+t 连续相位）起步首帧是否可能 ≠0（登记性差异量化）
// ④ 646-652 族抽 649（Emerald Bunny）确认走 case46 分支且帧 7
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { vanillaFrameIdx } = await import('/src/render/Renderer');
  const res = { fail: [] };
  const eq = (n, c, detail) => { if (!c) res.fail.push(n + (detail ? ' | ' + detail : '')); };

  const spawnAt = (id) => {
    const st = g.world.store;
    const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
    for (const dx of [30, 35, 40, 25]) {
      const tx = px + dx;
      if (tx < 4 || tx >= st.w - 4) continue;
      for (let y = Math.max(4, py - 30); y < Math.min(st.h - 4, py + 40); y++) {
        if (st.isSolid(tx, y)) {
          const e = g.spawnNpcByVanilla(id, tx * 16 + 8, y * 16 - 10);
          return e ?? null;
        }
      }
    }
    return null;
  };

  // ---------- ①⑥ 行走帧序列（46 与 649 各一只） ----------
  const sampleWalk = (id) => {
    const e = spawnAt(id);
    if (!e) return { noSpawn: true };
    const frames = e.vanilla?.frames ?? 0;
    const seq = [];
    const vxs = [];
    for (let f = 0; f < 160; f++) {
      g.fixedUpdate(1 / 60);
      if (!e || e.dead) return { died: true, frames };
      const fr = vanillaFrameIdx(e, frames);
      seq.push([fr, +e.vx.toFixed(2), e.onGround ? 1 : 0]);
    }
    // 只取连续 onGround 且 |vx|>0.05 的段做换帧统计
    const walk = seq.filter(s => s[2] === 1 && Math.abs(s[1]) > 0.05);
    const steps = [];
    for (let i = 1; i < walk.length; i++) if (walk[i][0] !== walk[i - 1][0]) steps.push(i);
    const vxAvg = walk.length ? walk.reduce((a, s) => a + Math.abs(s[1]), 0) / walk.length : 0;
    const tpf = steps.length > 1 ? (steps[steps.length - 1] - steps[0]) / (steps.length - 1) : 0;
    const distinct = [...new Set(walk.map(s => s[0]))].sort((a, b) => a - b);
    return { id, frames, walkTicks: walk.length, vxAvg: +vxAvg.toFixed(2), ticksPerFrame: +tpf.toFixed(2), expectTpf: +(7 / (vxAvg + 1)).toFixed(2), distinct, monotonicRun: walk.slice(0, 30).map(s => s[0]) };
  };
  res.bunny46 = sampleWalk(46);
  res.bunny649 = sampleWalk(649);
  const b = res.bunny46;
  if (!b.noSpawn && !b.died && b.walkTicks > 40) {
    eq('①46 换帧步距≈7/(|vx|+1)', Math.abs(b.ticksPerFrame - b.expectTpf) <= 0.8, `got ${b.ticksPerFrame} expect≈${b.expectTpf} vx=${b.vxAvg}`);
    eq('①46 帧含0', b.distinct.includes(0), JSON.stringify(b.distinct));
    eq('①46 覆盖≥5档', b.distinct.length >= 5, JSON.stringify(b.distinct));
  } else res.fail.push('①46 采样不足: ' + JSON.stringify(b));
  const b649 = res.bunny649;
  if (!b649.noSpawn && !b649.died) {
    eq('④649 走 case46 帧循环', b649.walkTicks > 40 && b649.distinct.length >= 3 && b649.frames === 7, JSON.stringify({ frames: b649.frames, distinct: b649.distinct, walkTicks: b649.walkTicks }));
  } else res.fail.push('④649 采样不足: ' + JSON.stringify(b649));

  // ---------- ② 腾空帧（直接驱动状态） ----------
  const e2 = spawnAt(46);
  if (e2) {
    const frames = e2.vanilla?.frames ?? 7;
    const sv = { onGround: e2.onGround, vy: e2.vy, vx: e2.vx };
    e2.onGround = false; e2.vy = -5; res.airUp = vanillaFrameIdx(e2, frames);
    e2.vy = 5; res.airDown = vanillaFrameIdx(e2, frames);
    Object.assign(e2, sv);
    eq('②腾空 vy<0=帧4', res.airUp === 4, 'got ' + res.airUp);
    eq('②腾空 vy>0=帧6', res.airDown === 6, 'got ' + res.airDown);
  } else res.fail.push('②无兔');

  // ---------- ③ 站定→起步相位（vanilla 清 counter 必从帧0起） ----------
  const e3 = spawnAt(46);
  if (e3) {
    const frames = e3.vanilla?.frames ?? 7;
    // 手工钉住状态：先站 30t（vx=0），随后步行 vx=1.5 持续 40t，采样起步首帧
    e3.vx = 0;
    for (let i = 0; i < 30; i++) { e3.animT++; e3.vx = 0; g.fixedUpdate(1 / 60); e3.vx = 0; }
    const startPhase = (e3.walkCycleT + e3.animT) % 7;
    e3.vx = 1.5;
    const firstFrames = [];
    for (let i = 0; i < 40; i++) { e3.animT++; e3.walkCycleT += 1.5; firstFrames.push(vanillaFrameIdx(e3, frames)); g.fixedUpdate(1 / 60); e3.vx = 1.5; e3.walkCycleT += 0; }
    res.standResume = { standPhase: +startPhase.toFixed(1), firstFrame: firstFrames[0], firstSix: firstFrames.slice(0, 8) };
    eq('③站定后起步首帧=0（vanilla 清 counter）', firstFrames[0] === 0, `首帧 ${firstFrames[0]}（相位 ${(e3.walkCycleT + e3.animT) % 7}）`);
  } else res.fail.push('③无兔');

  res.pass = res.fail.length === 0;
  return res;
}, { timeout: 120000 }).catch(e => ({ crash: String(e), stack: e.stack?.slice(0, 500) }));

console.log(JSON.stringify(out, null, 1));
await browser.close();
