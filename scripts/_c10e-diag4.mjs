// 诊断5:昼/地表 B 帧间漂移像素可视化(diff 图落 PNG)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?c10e=1&fx=0');
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
  window.__driftMap = () => {
    const lc = document.createElement('canvas');
    lc.width = r.canvas.width; lc.height = r.canvas.height;
    const c = lc.getContext('2d', { willReadFrequently: true });
    if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
    c.drawImage(r.canvas, 0, 0);
    const P = c.getImageData(0, 0, lc.width, lc.height).data;
    return P;
  };
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__step(240));
const png = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const grab = () => {
    const lc = document.createElement('canvas');
    lc.width = r.canvas.width; lc.height = r.canvas.height;
    const c = lc.getContext('2d', { willReadFrequently: true });
    if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
    c.drawImage(r.canvas, 0, 0);
    return c.getImageData(0, 0, lc.width, lc.height).data;
  };
  const P = grab();
  window.__pageBStore = P;
  return { staged: true };
});
const staged = await page.evaluate(() => 0);
// 用 B 臂自身做不了 A/B 跨页 diff——本诊断页改走:抓 B 合成存 window,再由 A 页传——
// 简化:本页只可视化 B 帧间漂移(已验证)。A-vs-B diff 走 _c10e-ab 主探针。
const png = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const grab = () => {
    const lc = document.createElement('canvas');
    lc.width = r.canvas.width; lc.height = r.canvas.height;
    const c = lc.getContext('2d', { willReadFrequently: true });
    if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
    c.drawImage(r.canvas, 0, 0);
    return c.getImageData(0, 0, lc.width, lc.height).data;
  };
  const P = grab();
  window.__step(1);
  const Q = grab();
  const lc = document.createElement('canvas');
  lc.width = r.canvas.width; lc.height = r.canvas.height;
  const c = lc.getContext('2d');
  const img = c.createImageData(r.canvas.width, r.canvas.height);
  let n = 0;
  for (let i = 0; i < P.length; i += 4) {
    const dd = Math.max(Math.abs(P[i]-Q[i]), Math.abs(P[i+1]-Q[i+1]), Math.abs(P[i+2]-Q[i+2]));
    if (dd > 0) { n++; img.data[i] = 255; img.data[i+1] = 0; img.data[i+2] = 0; img.data[i+3] = 255; }
  }
  c.putImageData(img, 0, 0);
  return { url: lc.toDataURL('image/png'), n };
});
console.log('drift n=', png.n);
fs.writeFileSync('shots/c10e/drift-day.png', Buffer.from(png.url.split(',')[1], 'base64'));
process.exit(0);
