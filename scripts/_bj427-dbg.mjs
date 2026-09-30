// BJ427 采样调试：canvas 尺寸/坐标映射 sanity
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5660';
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '0522', size: 'small' });
if (!gen.ok) { await browser.close(); process.exit(1); }
await page.evaluate(() => {
  const g = window.__swGame;
  g.camera.follow = () => {};
});
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);
for (let i = 0; i < 30; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
const dbg = await page.evaluate(() => {
  const g = window.__swGame, cam = g.camera;
  const cv = g.renderer.canvas;
  return {
    cvW: cv.width, cvH: cv.height,
    vw: cam.viewW, vh: cam.viewH, z: cam.zoom,
    dpr: window.devicePixelRatio || 1,
    camX: cam.x, camY: cam.y,
    ctor: cv.constructor.name,
    ctxProto: Object.getOwnPropertyDescriptor(window.CanvasRenderingContext2D.prototype, 'canvas') ? '2d' : '?',
    hasWorldLow: [g.renderer._worldLowW, g.renderer._worldLowH],
    wK: g.renderer._wK,
  };
});
console.log('[dbg]', JSON.stringify(dbg));
// 中心像素 sanity：直接读 canvas 中心 1px
const center = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const w = document.createElement('canvas');
  w.width = cv.width; w.height = cv.height;
  const c = w.getContext('2d', { willReadFrequently: true });
  c.drawImage(cv, 0, 0);
  const d = c.getImageData(Math.floor(w.width / 2), Math.floor(w.height / 2), 1, 1).data;
  return { cx: Math.floor(w.width / 2), cy: Math.floor(w.height / 2), rgba: [...d] };
});
console.log('[dbg] center px', JSON.stringify(center));
await browser.close();
