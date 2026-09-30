// BJ427 调试3：像素采样算术 sanity（与探针同式）
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5660';
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
if (!gen.ok) { await browser.close(); process.exit(1); }
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player, st = g.world.store;
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  for (let dx = -40; dx <= 40; dx++) for (let dy = -20; dy <= 24; dy++) st.setTile(bx + dx, by + dy, 0);
  for (const wx of [-22, -21, 21, 22]) for (let dy = -3; dy <= 16; dy++) st.setTile(bx + wx, by + dy, 1);
  for (let dx = -20; dx <= 20; dx++) for (let dy = 14; dy <= 16; dy++) st.setTile(bx + dx, by + dy, 1);
  for (let dx = -20; dx <= 20; dx++) for (let dy = 0; dy <= 13; dy++) st.setLiquid(bx + dx, by + dy, 255, 2);
  p.x = (bx + 60) * 16 + 8; p.y = (by - 4) * 16; p.vx = 0; p.vy = 0;
  g.camera.follow = () => {};
  return { bx, by };
});
console.log('[dbg3] scene', JSON.stringify(scene));
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);
for (let i = 0; i < 60; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
const out = await page.evaluate(({ bx, by }) => {
  const g = window.__swGame, cam = g.camera;
  const sB = by + 12;
  cam.x = bx * 16; cam.y = sB * 16 - 400;
  const cv = g.renderer.canvas;
  const work = document.createElement('canvas');
  work.width = cv.width; work.height = cv.height;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  wctx.drawImage(cv, 0, 0);
  const img = wctx.getImageData(0, 0, work.width, work.height);
  const D = img.data, W = work.width;
  const dpr = window.devicePixelRatio || 1;
  const topPx = cam.y - cam.viewH / 2 / cam.zoom, leftPx = cam.x - cam.viewW / 2 / cam.zoom;
  const s = cam.zoom * dpr;
  const px = (wx, wy) => {
    const dx = Math.round((wx - leftPx) * s), dy = Math.round((wy - topPx) * s);
    if (dx < 0 || dy < 0 || dx >= W || dy >= work.height) return { oob: [dx, dy] };
    const o = (dy * W + dx) * 4;
    return [D[o], D[o + 1], D[o + 2]];
  };
  return {
    cam: { x: cam.x, y: cam.y, topPx, leftPx, s, cvW: cv.width, cvH: cv.height },
    samples: {
      skyRow: px((bx) * 16 + 8, (by - 2) * 16 + 8),
      lavaMid: px((bx) * 16 + 8, (by + 5) * 16 + 8),
      lavaDeep: px((bx) * 16 + 8, (by + 11) * 16 + 8),
      center: px(cam.x, cam.y),
      rawCenter: [D[(400 * W + 640) * 4], D[(400 * W + 640) * 4 + 1], D[(400 * W + 640) * 4 + 2]],
    },
  };
}, scene);
console.log('[dbg3]', JSON.stringify(out, null, 1));
await browser.close();
