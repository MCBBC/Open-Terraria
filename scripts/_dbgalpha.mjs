// 调试：怪物屏幕坐标与画布像素采样对齐
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
const dbg = await page.evaluate(() => {
  const g = window.__swGame;
  const canvas = document.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const out = { canvas: [canvas.width, canvas.height], zoom: g.camera?.zoom, enemies: [] };
  out.canvases = [...document.querySelectorAll('canvas')].map(c => [c.width, c.height, getComputedStyle(c).zIndex, c.id || c.className]);
  out.playerScreen = g.camera.worldToScreen(g.player.x, g.player.y);
  for (const e of g.entities.enemies.slice(0, 6)) {
    const rec = { id: e.vanillaId, x: Math.round(e.x), y: Math.round(e.y), alpha: e.spawnAlpha };
    try {
      const [sx, sy] = g.camera.worldToScreen(e.x, e.y);
      rec.screen = [Math.round(sx), Math.round(sy)];
      const img = ctx.getImageData(Math.max(0, Math.round(sx)), Math.max(0, Math.round(sy)), 4, 4).data;
      rec.px = [img[0], img[1], img[2], img[3]];
    } catch (err) { rec.err = String(err); }
    out.enemies.push(rec);
  }
  return out;
});
console.log(JSON.stringify(dbg, null, 1));
await browser.close();
