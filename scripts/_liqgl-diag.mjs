// liqgl 诊断:liqMode 是否真活/批钩是否被调/warpOn 形态
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', gen?.ok);
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel);
  const x0 = px - 44, x1 = px + 44, ry = gy + 2, depth = 5;
  for (let x = x0 - 8; x <= x1 + 8; x++) for (let y = ry - 10; y <= ry + depth + 8; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  for (let x = x0; x <= x1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, BRICK); st.setTile(x1 + 1, y, BRICK); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  g.player.x = (x1 + 6) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  window.__diag = () => {
    const r = g.renderer;
    return {
      playerTx: Math.floor(g.player.cx / 16),
      camX: Math.round(r.camera?.x ?? g.camera.x), camY: Math.round(g.camera.y),
      poolTx: px,
      inv: r._waveLiquidInView,
      bgl: true, acc: r._accMode,
      path: r.bglPathUsed,
    };
  };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => import('/src/render/Renderer.ts').then((m) => { window.__rMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__drive(20));
console.log('diag:', JSON.stringify(await page.evaluate(() => window.__diag())));

// 中帧钩:drawLiquids 进入时读 liqMode 相关内部态
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const proto = Object.getPrototypeOf(r);
  const orig = proto.drawLiquids;
  window.__mid = [];
  r.drawLiquids = function (...a) {
    window.__mid.push({
      acc: this._accMode,
      isBg: a[5],
      shimActive: this.bglEntShim?.active ?? null,
      avail: this.liqBatchAvail?.() ?? null,
      waveQ: (window.__wwMod?.waterWaves ?? {}).quality,
    });
    return orig.apply(this, a);
  };
});
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__mid = []; window.__vlMod.liqglSetForTest(true); });
// 钩 emitLiquidQuadBatch 计数 + warpOn 探针
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const origEmit = r.emitLiquidQuadBatch;
  window.__emitN = 0; window.__emitQuads = 0;
  r.emitLiquidQuadBatch = function (img, key, data, quads, replay) {
    const ok = origEmit.call(this, img, key, data, quads, replay);
    if (ok) { window.__emitN++; window.__emitQuads += quads; }
    return ok;
  };
  const origBegin = Object.getPrototypeOf(r.waterWarp).beginFgPass;
  window.__fgN = 0;
  Object.getPrototypeOf(r.waterWarp).beginFgPass = function (c) { window.__fgN++; return origBegin.call(this, c); };
});
await page.evaluate(() => window.__drive(4));
console.log('mid-frame:', JSON.stringify(await page.evaluate(() => window.__mid.slice(0, 2))));
console.log('emit calls:', await page.evaluate(() => window.__emitN), 'quads:', await page.evaluate(() => window.__emitQuads), 'fgPass calls:', await page.evaluate(() => window.__fgN));
console.log('shim stats:', JSON.stringify(await page.evaluate(() => window.__swGame.renderer.bglShimStats()?.stats)));
// warpOn 判定四门逐项
console.log('warp gates:', JSON.stringify(await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    cpuRender: r.isCpuRender(),
    waveCss: !!r._waveCss,
    q: window.__wwMod.waterWaves.quality,
    texReady: window.__wwMod.waveTexReady(),
    warpActive: r.waterWarp.active(),
    warpOnComposite: !!(r._waveCss && window.__wwMod.waterWaves.quality > 0 && (!r.constructor.dryWarpSkip || r._waveLiquidInView)),
  };
})));
process.exit(0);
