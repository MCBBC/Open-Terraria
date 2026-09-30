// BJ427 调试2：setCam 后相机是否保持
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5660';
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
if (!gen.ok) { await browser.close(); process.exit(1); }
const r = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera;
  g.camera.follow = () => {};
  cam.x = 33584; cam.y = 4176;
  return { after: { x: cam.x, y: cam.y }, hasFollow: typeof cam.follow, keys: Object.keys(cam).slice(0, 30) };
});
console.log('[dbg2] set', JSON.stringify(r));
await pump(page, 4);
for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise((res) => requestAnimationFrame(res)));
const r2 = await page.evaluate(() => {
  const cam = window.__swGame.camera;
  return { x: cam.x, y: cam.y, z: cam.zoom, vw: cam.viewW, vh: cam.viewH };
});
console.log('[dbg2] after pump+rAF', JSON.stringify(r2));
await browser.close();
