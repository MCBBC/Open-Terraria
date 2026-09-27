// BJ372 探针:群系交界处背景远景 ABAB 抖动复现。
// 流程:固定种子建世界 → scanScene 沿地表扫 zone 翻转点 → 玩家双向穿越边界
// → rAF 逐帧采样(bgStyle/want/双源几何/alpha/flash) → 输出切换事件序列。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const SEED = process.env.SW_SEED ?? '12345';
const W = 4200, H = 1200;

const b = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1024, height: 640 },
  args: ['--disable-gpu-sandbox'],
});
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
const gen = await p.evaluate(async (seed, w, h) => {
  await window.__swGame.newWorld(seed, w, h, () => {});
  return 'ok';
}, SEED, W, H).catch((e) => String(e));
console.log('worldgen:', gen);
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  if (await p.evaluate(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player?.x > 0).catch(() => false)) break;
}
await new Promise((r) => setTimeout(r, 3000));

// ---- 安装采样器 + 走查器 ----
await p.evaluate(() => {
  window.__bj372 = { samples: [], walk: null };
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  if (g.world.weather) { g.world.weather.windSpeedCurrent = 0; g.world.weather.windSpeedTarget = 0; g.world.weather.maxRaining = 0; }
  window.__bj372Sample = () => {
    const s = window.__bj372, bb = g.renderer.biomeBg;
    const af = [];
    for (let i = 0; i < 16; i++) if (bb.alphaFront[i] > 0.01) af.push(+bb.alphaFront[i].toFixed(2));
    const camTx = Math.floor(g.camera.x / 16), plTx = Math.floor(g.player.cx / 16);
    s.samples.push({
      t: Math.round(performance.now()), walk: s.walk,
      camTx, plTx, tick: g.tickCount,
      want: bb.preferredStyle(g.scene, camTx), wantP: bb.preferredStyle(g.scene, plTx),
      bg: bb.bgStyle, delay: +bb.bgDelay.toFixed(1), inst: bb.instantBG,
      af,
      zSnow: !!g.scene.zoneSnow, zDes: !!g.scene.zoneDesert, zJun: !!g.scene.zoneJungle,
      zBeach: !!g.scene.zoneBeach, zCorr: !!g.scene.zoneCorrupt, zHall: !!g.scene.zoneHallow,
      snowCnt: g.scene.snowTileCount, desCnt: g.scene.desertSandTileCount,
      ug: bb.ugStyle, uga: +bb.ugAlpha.toFixed(2), ugOld: bb.ugOld,
      flash: +Math.max(...bb.bgFlash).toFixed(2),
    });
  };
  window.__bj372Raf = requestAnimationFrame(function loop() {
    window.__bj372Sample();
    window.__bj372Raf = requestAnimationFrame(loop);
  });
  window.__bj372Walk = async (fromPx, toPx, speed = 3, tag = '') => {
    const g2 = window.__swGame, st = g2.world.store;
    window.__bj372.walk = tag;
    const dir = Math.sign(toPx - fromPx);
    let x = fromPx;
    const groundTopPx = (px) => {
      const tx = Math.max(1, Math.min(st.w - 2, Math.floor(px / 16)));
      for (let y = 2; y < st.h; y++) if (st.isSolid(tx, y)) return y * 16;
      return (g2.world.groundLevel + 10) * 16;
    };
    while ((dir > 0 && x < toPx) || (dir < 0 && x > toPx)) {
      x += dir * speed;
      g2.player.x = x;
      g2.player.y = groundTopPx(x) - g2.player.h - 1;
      g2.player.vx = dir * speed; g2.player.vy = 0;
      g2.player.statLife = g2.player.statLifeMax;   // 防摔死污染(zero 死亡重生会瞬移玩家)
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.__bj372.walk = null;
  };
  // 阈值往复振荡:在 [cx-delta,cx+delta] 间以 half 帧半周期往返
  window.__bj372Osc = async (cxTiles, deltaTiles, halfMs, seconds, tag = 'OSC') => {
    const g2 = window.__swGame, st = g2.world.store;
    window.__bj372.walk = tag;
    const t0 = performance.now();
    const groundTopPx = (px) => {
      const tx = Math.max(1, Math.min(st.w - 2, Math.floor(px / 16)));
      for (let y = 2; y < st.h; y++) if (st.isSolid(tx, y)) return y * 16;
      return (g2.world.groundLevel + 10) * 16;
    };
    while (performance.now() - t0 < seconds * 1000) {
      const ph = ((performance.now() - t0) % (2 * halfMs)) / halfMs;   // 0..2
      const tri = ph < 1 ? ph : 2 - ph;                                 // 0..1..0
      const x = (cxTiles + (tri * 2 - 1) * deltaTiles) * 16;
      g2.player.x = x;
      g2.player.y = groundTopPx(x) - g2.player.h - 1;
      g2.player.vx = 0; g2.player.vy = 0;
      g2.player.statLife = g2.player.statLifeMax;
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.__bj372.walk = null;
  };
});

// ---- 扫边界 ----
const bounds = await p.evaluate(async () => {
  const mod = await import('/src/world/SceneMetrics.ts');
  const scan = mod.scanScene;
  const g = window.__swGame, w = g.world, st = w.store;
  const gl = w.groundLevel;
  const row = [];
  for (let x = 8; x < st.w - 8; x += 4) {
    const f = scan(w, x * 16, (gl + 2) * 16, 0);
    row.push({ x, snow: !!f.zoneSnow, des: !!f.zoneDesert, jun: !!f.zoneJungle, corr: !!f.zoneCorrupt, crim: !!f.zoneCrimson, hall: !!f.zoneHallow, beach: !!f.zoneBeach, mush: !!f.zoneGlowshroom });
  }
  const flips = [];
  for (let i = 1; i < row.length; i++) {
    const a = row[i - 1], c = row[i];
    for (const k of ['snow', 'des', 'jun', 'corr', 'crim', 'hall', 'beach', 'mush']) {
      if (a[k] !== c[k]) flips.push({ x: c.x, kind: k, from: a[k], to: c[k] });
    }
  }
  return { treeX: w.treeX, caveBackX: g.renderer.biomeBg.caveBackX, caveBackStyle: g.renderer.biomeBg.caveBackStyle,
    treeStyle: w.treeStyle, forestStyles: g.renderer.biomeBg.forestStyles,
    groundLevel: gl, spawnX: w.spawnX, flips: flips.slice(0, 60) };
});
console.log('bounds:', JSON.stringify({ treeX: bounds.treeX, caveBackX: bounds.caveBackX, caveBackStyle: bounds.caveBackStyle, treeStyle: bounds.treeStyle, forestStyles: bounds.forestStyles, gl: bounds.groundLevel, spawn: bounds.spawnX }, null, 1));
console.log('flips:', JSON.stringify(bounds.flips));

// ---- 选雪原↔森林翻转点(优先),否则第一个翻转;SW_TARGET_X 可指定中心 x ----
const forcedX = Number(process.env.SW_TARGET_X ?? '0');
const target = forcedX > 0 ? { x: forcedX, kind: 'forced' }
  : bounds.flips.find((f) => f.kind === 'snow')
    ?? bounds.flips.find((f) => f.kind === 'des' || f.kind === 'jun') ?? bounds.flips[0];
if (!target) { console.log('FAIL: 无边界可测'); await b.close(); process.exit(1); }
console.log('target:', JSON.stringify(target));
const bxPx = target.x * 16;
const spanTiles = Number(process.env.SW_SPAN ?? '70');

// ---- 穿界:SW_FROM_X/SW_TO_X 自定义区间,否则 bx±span 双向;SW_SWEEP=1 全图单程;SW_OSC=1 阈值振荡 ----
const sweep = process.env.SW_SWEEP === '1';
const osc = process.env.SW_OSC === '1';
const oscDelta = Number(process.env.SW_OSC_DELTA ?? '10');
const oscHalf = Number(process.env.SW_OSC_HALF_MS ?? '900');
const fromX = Number(process.env.SW_FROM_X ?? '0') || (forcedX > 0 ? forcedX - spanTiles : target.x - spanTiles);
const toX = Number(process.env.SW_TO_X ?? '0') || (forcedX > 0 ? forcedX + spanTiles : target.x + spanTiles);
const walkSpeed = Number(process.env.SW_SPEED ?? '2.5');
await p.evaluate(async (fx, tx, spd, sweep, osc, bx, od, oh) => {
  const g = window.__swGame;
  g.player.x = fx * 16;
  await new Promise((r) => setTimeout(r, 2500));
  if (osc) {
    await window.__bj372Osc(bx, od, oh, 30, 'OSC');
    await new Promise((r) => setTimeout(r, 3000));
  } else if (sweep) {
    await window.__bj372Walk(fx * 16, tx * 16, spd, 'SWEEP');
    await new Promise((r) => setTimeout(r, 3000));
  } else {
    await window.__bj372Walk(fx * 16, tx * 16, spd, 'A2B');
    await new Promise((r) => setTimeout(r, 4000));
    await window.__bj372Walk(tx * 16, fx * 16, spd, 'B2A');
    await new Promise((r) => setTimeout(r, 4000));
  }
}, fromX, toX, walkSpeed, sweep, osc, forcedX > 0 ? forcedX : target.x, oscDelta, oscHalf).catch((e) => console.log('walk err:', String(e).slice(0, 300)));

const samples = await p.evaluate(() => { cancelAnimationFrame(window.__bj372Raf); return window.__bj372.samples; });
console.log('samples:', samples.length);
const fs = await import('node:fs');
fs.writeFileSync('/tmp/bj372-samples.json', JSON.stringify(samples));

// ---- 事件序列分析 ----
const ev = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], c = samples[i];
  if (a.bg !== c.bg) ev.push({ t: c.t, dt: c.t - samples[0].t, from: a.bg, to: c.bg, walk: c.walk, camTx: c.camTx, plTx: c.plTx, zSnow: c.zSnow, zDes: c.zDes, zJun: c.zJun, zBeach: c.zBeach, via: c.inst > 0 ? 'instant' : 'delay' });
}
console.log('bg switch events:', JSON.stringify(ev, null, 1));
// want 翻转统计(与 scene 刷新对齐)
const wantEv = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], c = samples[i];
  if (a.want !== c.want) wantEv.push({ dt: c.t - samples[0].t, from: a.want, to: c.want, walk: c.walk, camTx: c.camTx });
}
console.log('want(cam) flips:', wantEv.length, JSON.stringify(wantEv.slice(0, 40)));
const wantPEv = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], c = samples[i];
  if (a.wantP !== c.wantP) wantPEv.push({ dt: c.t - samples[0].t, from: a.wantP, to: c.wantP, walk: c.walk, plTx: c.plTx, zSnow: c.zSnow, snowCnt: c.snowCnt });
}
console.log('wantP(player) flips:', wantPEv.length, JSON.stringify(wantPEv.slice(0, 40)));
// ug 切换
const ugEv = [];
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1], c = samples[i];
  if (a.ug !== c.ug) ugEv.push({ dt: c.t - samples[0].t, from: a.ug, to: c.ug, walk: c.walk, camTx: c.camTx });
}
console.log('ug switch events:', JSON.stringify(ugEv.slice(0, 40)));
console.log('pageerrors:', JSON.stringify(errors.slice(0, 5)));
await b.close();
console.log('PROBE DONE');
