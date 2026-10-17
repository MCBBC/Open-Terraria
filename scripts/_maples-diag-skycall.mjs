// 一次性诊断:sky.draw 补丁被绕过案——调用计数 + C10e/skyCtx 状态采样
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5211/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
let inGame = false;
for (let i = 0; i < 300 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.world)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(async () => { await window.__swGame.newWorld('05162020', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 300 && !ready; i++) {
  ready = await page.evaluate(() => window.__swGame?.world?.store?.w === 4200).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
await new Promise((r) => setTimeout(r, 2000));
// 原型打点(不替换——只数原生 draw 被调的次数与目标 ctx)
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const proto = Object.getPrototypeOf(sky);
  const orig = proto.draw;
  window.__skyCalls = { n: 0, ctxKinds: {}, firstTs: Date.now() };
  proto.draw = function (ctx, ...rest) {
    window.__skyCalls.n++;
    const k = ctx === g.renderer.skyCtx ? 'skyCtx' : (ctx === g.renderer.ctx ? 'mainCtx' : 'other');
    window.__skyCalls.ctxKinds[k] = (window.__skyCalls.ctxKinds[k] ?? 0) + 1;
    return orig.call(this, ctx, ...rest);
  };
  window.__skyHasOwnDraw = Object.prototype.hasOwnProperty.call(sky, 'draw');
  window.__rendererHasOwnDraw = Object.prototype.hasOwnProperty.call(g.renderer, 'drawSky');
});
await page.evaluate(() => { window.__swGame.paused = true; });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const cc = c.getContext('2d');
  const px = (x, y) => { const d = cc.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; };
  return {
    skyCalls: window.__skyCalls,
    hasOwnDraw: window.__skyHasOwnDraw,
    skyCtx: !!window.__swGame.renderer.skyCtx,
    pixels: { 'y40': px(200, 40), 'y200': px(200, 200), 'y400': px(200, 400) },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
