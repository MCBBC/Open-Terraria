import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 982, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
for (let att = 0; att < 8; att++) { try { await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 }); break; } catch { await new Promise(r => setTimeout(r, 2500)); } }
await page.evaluate(async () => { const t0 = Date.now(); while (!window.__swGame?.player && Date.now() - t0 < 90000) await new Promise(r => setTimeout(r, 500)); });
const r1 = await page.evaluate(async () => {
  window.__swFlow.newWorld('seamtest', 4200, 1200);
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { if (window.__swGame?.world?.w === 4200) break; await new Promise(r => setTimeout(r, 300)); }
  return { w: window.__swGame?.world?.w, hasPlayer: !!window.__swGame?.player };
});
console.log('after newWorld:', JSON.stringify(r1));
const r2 = await page.evaluate(async () => {
  const g = window.__swGame, w = g.world, st2 = w.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const liq = (x, y) => st2.liquid[st2.idx(x, y)] / 255;
  let best = null;
  for (let rad = 0; rad < 1200 && !best; rad++)
    for (let dy = -rad; dy <= rad && !best; dy++)
      for (let dx = -rad; dx <= rad && !best; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 60 || x >= w.w - 60 || y < 60 || y >= w.h - 60) continue;
        if (liq(x, y) < 0.6 || liq(x, y - 1) > 0.05) continue;
        let wL = 0, wR = 0;
        while (wL < 120 && liq(x - wL - 1, y) > 0.6 && liq(x - wL - 1, y - 1) <= 0.05) wL++;
        while (wR < 120 && liq(x + wR + 1, y) > 0.6 && liq(x + wR + 1, y - 1) <= 0.05) wR++;
        if (wL + wR >= 40) best = { x0: x - wL, x1: x + wR, y };
      }
  if (!best) return { pool: null };
  const cxw = (best.x0 + best.x1) / 2 * 16, cyw = best.y * 16;
  g.camera.zoomTarget = 1.25; g.camera.zoom = 1.25;
  g.player.noClip = true;
  g.player.x = cxw; g.player.y = cyw - 40; g.player.vx = 0; g.player.vy = 0;
  await new Promise(r => setTimeout(r, 2000));
  const cv = g.renderer.canvas;
  const ctx2 = cv.getContext('2d');
  const mid = ctx2.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2) + 20, 1, 1).data;
  return { pool: best, playerPx: [g.player.x, g.player.y], cam: [g.camera.x, g.camera.y], mid: [...mid], noClip: g.player.noClip };
});
console.log(JSON.stringify(r2));
const shot = await page.screenshot({ path: '/tmp/wsdbg.png' });
await browser.close();
