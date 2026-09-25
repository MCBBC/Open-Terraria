// ★一次性:四柱掉帧机制分解实验（default 链,远塔场景）。
// 臂:
//   control   原样（预期 b2b-acc-degraded 100% + towerShield ~10ms/帧）
//   expA      drawTowerShield 运行时 no-op（预期帧耗塌回 baseline 量级=盾路径=全 excess）
//   expBgl    页内翻 ?bgl=0（纯 2D 世界层,无 acc 可降——同盾成本下的旧链对照）
// 只读探针:全部为页内运行时包裹,零生产码改动。
import { launchBrowser, openPage, bootstrap, createGame, front } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { sleep } from '../tools/probe/lib/perf.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const N = Number(process.env.PILLAR_FRAMES || 80);
const errors = [];
const browser = await launchBrowser({});
const page = await openPage(browser, { errors });
await bootstrap(page, `${ORIGIN}/?cloudcache=0`);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });

await front(page);
await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer, sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  sky.maintainClouds = () => {}; sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; }
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* */ }
  g.enemySpawnEnabled = false;
  // 分段计时塔盾（保留包裹引用供 expBgl 恢复）
  const RP = Object.getPrototypeOf(r);
  window.__tsMs = 0; window.__tsN = 0;
  const origTs = RP.drawTowerShield;
  const tsWrapped = function (...a) {
    const t0 = performance.now();
    try { return origTs.apply(this, a); }
    finally { window.__tsMs += performance.now() - t0; window.__tsN++; }
  };
  RP.drawTowerShield = tsWrapped;
  window.__tsRestore = () => { RP.drawTowerShield = tsWrapped; };
  window.__tsNuke = () => { RP.drawTowerShield = function () { /* expA no-op */ }; };
  // 页内辅助:列地表
  window.__surfaceYAt = (wx) => {
    const st = g.world.store;
    const tx = Math.max(0, Math.min(st.w - 1, Math.floor(wx / 16)));
    for (let ty = 20; ty < st.h; ty++) { if (st.isSolid(tx, ty) || st.isActive(tx, ty)) return ty; }
    return Math.floor(g.world.groundLevel);
  };
});
await page.evaluate(() => import('/src/core/GfxQuality.ts').then((m) => {
  window.__pinQ = () => { m.gfxQuality.value = 1; m.gfxQuality.rate = 0.005; m.gfxQuality.drawsThisSecond = 0; };
}));
await freezeClock(page, { tod: 0.5 });

// 造 4 塔（盾 100,远塔 4200px 起）+ soak 落位
await page.evaluate(async () => {
  const g = window.__swGame;
  const flow = window.__swFlow;
  const px = g.player.x, gy = g.world.groundLevel * 16;
  for (let i = 0; i < 4; i++) await flow.spawnVanillaEnemy([422, 517, 507, 493][i], px + 4200 + i * 700, gy - 320);
  const le = g.world.lunarEvent;
  le.active = true; le.towerActive = { solar: true, vortex: true, nebula: true, stardust: true };
  le.shield = { solar: 100, vortex: 100, nebula: 100, stardust: 100 };
});
await page.evaluate(() => { window.__swGame.start(); });
await sleep(2500);
await page.evaluate(() => { window.__swGame.running = false; });

async function measure(label) {
  await page.evaluate(() => { window.__pinQ?.(); });
  const out = await page.evaluate(({ n }) => {
    const g = window.__swGame, R = g.renderer;
    window.__tsMs = 0; window.__tsN = 0;
    const paths = {};
    let lastWcNull = R.worldCanvas === null;
    window.__vnow = performance.now();
    const t0 = performance.now();
    const times = [];
    for (let i = 0; i < n; i++) {
      window.__vnow += 16.6667;
      const f0 = performance.now();
      g.frame(window.__vnow);
      times.push(performance.now() - f0);
      paths[R.bglPathUsed] = (paths[R.bglPathUsed] || 0) + 1;
    }
    const wall = performance.now() - t0;
    const sorted = [...times].sort((a, b) => a - b);
    return {
      mean: +(wall / n).toFixed(3), p50: +sorted[Math.floor(n / 2)].toFixed(3),
      p95: +sorted[Math.floor(n * 0.95)].toFixed(3),
      paths, tsMsPerFrame: +(window.__tsMs / n).toFixed(3), tsCallsPerFrame: +(window.__tsN / n).toFixed(2),
      wcNullAfter: R.worldCanvas === null, creations: R.b2bWorldCanvasCreations,
    };
  }, { n: N });
  console.log(`[${label}] mean=${out.mean}ms p50=${out.p50} p95=${out.p95} paths=${JSON.stringify(out.paths)} towerShield=${out.tsMsPerFrame}ms/帧(${out.tsCallsPerFrame}calls) creations=${out.creations}`);
  return out;
}

console.log('--- 远塔场景（玩家在出生点,4 塔在 4200px 外全部离屏,盾 100）---');
await measure('control(缺省 acc)');
// expA:盾路径 no-op
await page.evaluate(() => { window.__tsNuke(); });
await measure('expA(drawTowerShield=noop)');
// expBgl:翻 2D 世界层（盾路径恢复原样）
await page.evaluate(() => {
  window.__tsRestore();
  window.__swGame.renderer.constructor.bglSetForTest(false);
});
await measure('expBgl(?bgl=0 纯2D,盾恢复)');
await page.evaluate(() => { window.__swGame.renderer.constructor.bglSetForTest(true); });
await measure('control2(翻回 acc)');

if (errors.length) console.log('ERRORS:', errors.slice(0, 6));
await browser.close();
console.log('DONE');
