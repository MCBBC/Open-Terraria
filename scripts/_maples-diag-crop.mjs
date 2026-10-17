// 一次性诊断:crop64 坐标与像素采样
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5211';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 180000 });
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
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.__swGame.paused = true; });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const rect = c.getBoundingClientRect();
  const z = g.camera.zoom;
  // 玩家右侧 18 格的世界点(模拟特征锚)
  const wx = (Math.floor(g.player.cx / 16) - 18) * 16 + 8;
  const wy = g.player.cy;
  const sx = ((wx - g.camera.x) * z + rect.width / 2) * (c.width / rect.width);
  const sy = ((wy - g.camera.y) * z + rect.height / 2) * (c.height / rect.height);
  // 直接读画布该处 64×64
  const lc = document.createElement('canvas'); lc.width = 64; lc.height = 64;
  const lctx = lc.getContext('2d', { willReadFrequently: true });
  lctx.drawImage(c, Math.round(sx) - 32, Math.round(sy) - 32, 64, 64, 0, 0, 64, 64);
  const d = lctx.getImageData(0, 0, 64, 64).data;
  let opaque = 0; const sample = [];
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;
  for (let k = 0; k < 8; k++) sample.push([d[k * 800], d[k * 800 + 1], d[k * 800 + 2], d[k * 800 + 3]]);
  return {
    canvas: [c.width, c.height], rect: [rect.width, rect.height], zoom: z,
    cam: [g.camera.x, g.camera.y], player: [g.player.cx, g.player.cy],
    anchor: [wx, wy], crop: [Math.round(sx) - 32, Math.round(sy) - 32],
    opaquePx: opaque, sample,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
