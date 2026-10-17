// 一次性诊断:sky 纯色填充隔离测试——补丁后读 skyCtx 画布+主画布像素
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { const t = m.text(); if (t.includes('[skypatch]')) console.log(t); });
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
await new Promise((r) => setTimeout(r, 1500));
// 填充补丁 + 打点(异常/参数 dump)
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const proto = Object.getPrototypeOf(sky);
  window.__skyDbg = { n: 0, errs: 0, lastArgs: null };
  proto.draw = function swProbeSolidSky(ctx, clock, viewW, viewH, camX, dtMs, camY) {
    const D = window.__skyDbg;
    D.n++;
    if (D.n <= 2) D.lastArgs = { viewW, viewH, camX, camY, ctxW: ctx.canvas?.width, ctxH: ctx.canvas?.height, isSkyCtx: ctx === g.renderer.skyCtx };
    try {
      ctx.fillStyle = '#ff0000';   // ★亮红:上屏与否一目了然
      ctx.fillRect(0, 0, viewW, viewH);
    } catch (e) { D.errs++; console.log('[skypatch] ERR', e.message); }
  };
});
await page.evaluate(() => { window.__swGame.paused = true; });
await new Promise((r) => setTimeout(r, 1000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const readPx = (cnv) => {
    if (!cnv) return null;
    try {
      const c2 = document.createElement('canvas');
      c2.width = 4; c2.height = 4;
      const cx = c2.getContext('2d', { willReadFrequently: true });
      cx.drawImage(cnv, 200, 40, 4, 4, 0, 0, 4, 4);
      return [...cx.getImageData(0, 0, 1, 1).data];
    } catch (e) { return 'ERR:' + e.message; }
  };
  const main = g.renderer.canvas;
  const allCanvases = [...document.querySelectorAll('canvas')];
  const canvasPx = allCanvases.map((c, k) => ({ k, w: c.width, h: c.height, px: readPx(c), gl: c.getContext('webgl2') != null || c.getContext('webgl') != null }));
  return {
    dbg: window.__skyDbg,
    mainPx: readPx(main),
    skyCtxPx: readPx(g.renderer.skyCtx?.canvas),
    canvasPx,
    sky2dCanvasExists: !!g.renderer.skyCtx,
    otherCanvases: [...document.querySelectorAll('canvas')].map((c) => [c.width, c.height, String(c.id || '')]).slice(0, 10),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
