// 假人终验:72x594 canvas drawImage 计数 + 相机/锚点覆盖关系 + 截图
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SAVE = '/Users/vinlic/Downloads/map-Starter_World (27).json';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
const text = readFileSync(SAVE, 'utf8');
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, text);
await new Promise((r) => setTimeout(r, 2000));
const r = await page.evaluate(() => {
  const g = window.__swGame;
  const stat = { draws: 0, first: null, cam: null, player: null };
  const dOrig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...a) {
    const img = a[0];
    if (img && img.width === 72 && img.height === 594) {
      stat.draws++;
      if (!stat.first) stat.first = [Math.round(a[5]), Math.round(a[6]), Math.round(a[7]), Math.round(a[8])];
    }
    return dOrig.apply(this, a);
  };
  g.player.x = 3242 * 16 - 48;
  g.player.y = 348 * 16 - 40;
  setTimeout(() => {
    stat.cam = [Math.round(g.camera.x), Math.round(g.camera.y)];
    stat.player = [Math.round(g.player.cx), Math.round(g.player.cy)];
  }, 1400);
  return new Promise((res) => setTimeout(() => res(stat), 1600));
});
console.log('终验:', JSON.stringify(r));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/4a66e745/tmp/dummy-final.png' });
await browser.close();
