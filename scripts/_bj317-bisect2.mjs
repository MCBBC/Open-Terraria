import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, 'http://localhost:5201');
await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
await pump(page, 30);
const raf = async (n) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r))); };
const snap = async (label) => {
  await raf(6);
  const info = await page.evaluate(() => {
    const g = window.__swGame, cv = g.renderer.canvas;
    const sc = document.createElement('canvas'); sc.width = 64; sc.height = 8;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, cv.height - 100, 256, 40, 0, 0, 64, 8);
    const d = c2.getImageData(0, 0, 64, 8).data;
    let ground = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 1] < 140 && d[i] < 160) ground++; }
    const cam = g.camera;
    return { camX: Math.round(cam.x), camY: Math.round(cam.y), groundPx: ground };
  });
  console.log(`[bisect2] ${label}: cam=(${info.camX},${info.camY}) groundPx=${info.groundPx}/512`);
};
await page.evaluate(() => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  p.x = (2099 + 60) * 16 + 8; p.y = (286) * 16 - p.h - 2; p.vx = 0; p.vy = 0;
  g.camera.follow = () => {};
  try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } } catch {}
});
await snap('A. playerMoved+followNoop+weatherPin');
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);
await raf(60);
await snap('B. freezeClock+raf60');
await page.evaluate(() => { const c = window.__swGame.camera; c.x = 34376; c.y = 4528; });
await snap('C. camTeleport');
// hook
await page.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  if (globalThis.__wf317h) return;
  const orig = proto.drawImage;
  proto.drawImage = function (img, a1, a2, a3, a4, a5, a6, a7, a8) {
    return orig.call(this, img, a1, a2, a3, a4, a5, a6, a7, a8);
  };
  globalThis.__wf317h = true;
});
await snap('D. hookInstalled');
await pump(page, 4);
await snap('E. pumped4');
await browser.close();
