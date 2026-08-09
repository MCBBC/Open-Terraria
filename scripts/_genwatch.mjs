import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 250)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CERR:', m.text().slice(0, 250)); });
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.evaluate(() => { const s = document.querySelector('select'); if (s) s.selectedIndex = 0; });
await page.evaluate(() => document.querySelector('button').click());
// 轮询进度文字 + 错误，最多 150 秒
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await page.evaluate(() => ({
    game: !!window.__swGame,
    label: document.querySelector('.sw-progress')?.textContent?.slice(0, 20) ?? null,
  }));
  console.log(`t=${(i + 1) * 5}s`, JSON.stringify(s));
  if (s.game) break;
}
await browser.close();
