// 假人渲染深探:vframeAt(378) 命中率 + Tiles_378 drawImage 次数/落点。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const SAVE = needInput(join(DOWNLOADS, 'map-Starter_World (27).json'));
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
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g.renderer);
  const stat = { vf378calls: 0, vf378hits: 0, drawCalls: 0, firstDrawAt: null };
  const vorig = proto.vframeAt;
  proto.vframeAt = function (sheetId, fx, fy) {
    const r2 = vorig.call(this, sheetId, fx, fy);
    if (sheetId === 378) { stat.vf378calls++; if (r2) stat.vf378hits++; }
    return r2;
  };
  const drawOrig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...a) {
    const img = a[0];
    const src = img && img.src ? String(img.src) : '';
    if (src.includes('Tiles_378')) {
      stat.drawCalls++;
      if (!stat.firstDrawAt) stat.firstDrawAt = [Math.round(a[5]), Math.round(a[6])];
    }
    return drawOrig.apply(this, a);
  };
  g.player.x = 3242 * 16 - 48;
  g.player.y = 348 * 16 - 40;
  await new Promise((r2) => setTimeout(r2, 1500));
  return stat;
});
console.log('深补统计:', JSON.stringify(r));
await page.screenshot({ path: join(HOME, '.claude/jobs/4a66e745/tmp/dummy-deep.png') });
await browser.close();
