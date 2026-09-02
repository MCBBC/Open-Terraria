// 召唤路径验证:debugSpawnNpc(87) 应建 14 段链(曾=光杆头)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
const r = await page.evaluate(() => {
  const g = window.__swGame;
  g.entities.enemies.length = 0;
  const err = g.debugSpawnNpc(87, 1, false);
  const chain = g.entities.enemies.filter((e) => e.vanillaId != null && e.vanillaId >= 87 && e.vanillaId <= 92);
  return { err, total: chain.length, ids: chain.map((e) => e.vanillaId) };
});
console.log('召唤结果:', JSON.stringify(r));
console.log('段表正确:', r.ids.join(',') === ['87','89','88','89','89','89','89','89','89','88','89','89','90','91','92'].join(','));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
