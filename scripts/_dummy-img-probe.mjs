import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1000));
const r = await page.evaluate(() => {
  const a = window.__swGame.renderer.atlas;
  const out = {};
  for (const p of ['vanilla/Tiles_378.png', 'vanilla/Tiles_470.png', 'vanilla/Tiles_1.png', 'vanilla/NPC_488.png']) {
    try {
      const im = a.ensureVImage(p);
      out[p] = im ? `${im.width}x${im.height}` : 'NULL';
    } catch (e) { out[p] = 'THROW ' + e.message; }
  }
  // 也试 vnpc 路径(488 NPC 表)
  try { const v = a.vnpc(488, 0); out.vnpc488 = v ? `${v.sw}x${v.sh}` : 'NULL'; } catch (e) { out.vnpc488 = 'THROW'; }
  return out;
});
console.log('ensureVImage:', JSON.stringify(r));
await browser.close();
