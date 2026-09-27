// 黑屏二分:逐级加场景步骤,找哪步杀死渲染
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5233';
const STEP = process.env.STEP || '0';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
if (STEP !== '0') await godMode(page, true);
await page.evaluate((step) => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel);
  if (step >= '1') {   // 清场
    for (let x = px - 60; x <= px + 60; x++) for (let y = gy - 14; y <= gy + 12; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  }
  if (step >= '2') {   // 双池
    const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
    const ry = gy, depth = 4;
    const pools = [
      { x0: px - 46, x1: px - 26, lt: 1 },
      { x0: px + 26, x1: px + 46, lt: 4 },
    ];
    for (const p of pools) {
      for (let x = p.x0 - 1; x <= p.x1 + 1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
      for (let y = ry; y <= ry + depth; y++) { st.setTile(p.x0 - 1, y, BRICK); st.setTile(p.x1 + 1, y, BRICK); }
      for (let x = p.x0; x <= p.x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, p.lt);
    }
  }
  if (step >= '3') {   // 坡面
    const ry = gy, depth = 4;
    for (const p of [{ x0: px - 46, x1: px - 26 }, { x0: px + 26, x1: px + 46 }]) {
      st.setTile(p.x0, ry + depth - 1, 0); st.setLiquid(p.x0, ry + depth - 1, 0, 0);
      st.setSlope(p.x0, ry + depth, 1);
      st.setTile(p.x1, ry + depth - 1, 0); st.setLiquid(p.x1, ry + depth - 1, 0, 0);
      st.setSlope(p.x1, ry + depth, 2);
    }
  }
  g.player.x = px * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
}, STEP);
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__drive(30));
await page.evaluate(() => { const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
await page.evaluate(() => window.__drive(5));
const dbg = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const c = r.canvas;
  const lc = document.createElement('canvas');
  lc.width = c.width; lc.height = c.height;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  lx.drawImage(c, 0, 0);
  const d = lx.getImageData(0, 0, lc.width, lc.height).data;
  let nonBlack = 0, samples = 0;
  for (let i = 0; i < d.length; i += 4 * 997) { samples++; if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++; }
  return { step: process.env.STEP, nonBlackPct: (nonBlack * 100 / samples).toFixed(1), path: r.bglPathUsed, accMode: r._accMode };
});
console.log(JSON.stringify(dbg));
process.exit(0);
