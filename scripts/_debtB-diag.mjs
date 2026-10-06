import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261006 });
await godMode(page, true);
await freezeClock(page, { tod: 0.5 });
const info = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const out = { canvases: [], rCanvasId: null, sample: [] };
  document.querySelectorAll('canvas').forEach((c) => {
    out.canvases.push({ id: c.id || '(no id)', cls: c.className, w: c.width, h: c.height, z: getComputedStyle(c).zIndex, pos: getComputedStyle(c).position });
  });
  out.rCanvasId = r.canvas?.id || '(renderer canvas no id)';
  // 渲染一帧后采样 renderer.canvas 与各 DOM canvas 中心像素
  window.__vnow = performance.now();
  for (let i = 0; i < 5; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
  const sample = (c) => {
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(lc.width >> 1, lc.height >> 1, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  };
  out.rCenter = sample(r.canvas);
  out.dom = [];
  document.querySelectorAll('canvas').forEach((c) => { try { out.dom.push({ id: c.id, px: sample(c) }); } catch (e) { out.dom.push({ id: c.id, err: String(e) }); } });
  return out;
});
console.log(JSON.stringify(info, null, 1));
process.exit(0);
