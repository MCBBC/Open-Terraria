// 诊断6:昼/地表 A-vs-B diff 可视化(B 页内抓 B,传 base64 至 A 页抓 A?——跨页 diff
// 在 node 侧做:两页各回 base64,node diff 出坐标直方图,再让 B 页按 bbox 渲 diff PNG)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errs = [];
async function arm(url, tag) {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push(`[${tag}] ` + e.message));
  await bootstrap(page, url);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await page.evaluate(() => {
    const g = window.__swGame; const r = g.renderer; const sky = r.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
    try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } const fx = r.weatherFx; if (fx) fx.update = () => {}; } catch {}
    g.lighting.clock.tick = () => {};
    sky.ambEntities.length = 0; sky.ambNextAttempt = 1000000;
    const FIXED_T = 12345678;
    Object.defineProperty(r, '_liquidNow', { get: () => FIXED_T, set: () => {}, configurable: true });
    g.running = false;
    window.__step = (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); g.render(); } };
    window.__shotB64 = () => {
      const lc = document.createElement('canvas');
      lc.width = r.canvas.width; lc.height = r.canvas.height;
      const c = lc.getContext('2d', { willReadFrequently: true });
      if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
      c.drawImage(r.canvas, 0, 0);
      const d = c.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return btoa(bin);
    };
  });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => window.__step(240));
  return page;
}
const pageA = await arm(ORIGIN + '/?fx=0', 'A');
const pageB = await arm(ORIGIN + '/?c10e=1&fx=0', 'B');
const A = await pageA.evaluate(() => window.__shotB64());
const B = await pageB.evaluate(() => window.__shotB64());
fs.writeFileSync('shots/c10e/ab-day-A.raw', Buffer.from(A, 'base64'));
fs.writeFileSync('shots/c10e/ab-day-B.raw', Buffer.from(B, 'base64'));
console.log('raw saved', A.length, B.length);
process.exit(0);
