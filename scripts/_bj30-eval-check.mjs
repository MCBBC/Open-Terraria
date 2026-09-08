// SW-BJ30: evaluate/import 最小诊断
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5217';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => document.body && document.body.innerText.includes('单人模式'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1000));
const r1 = await page.evaluate(() => 'plain-return');
console.log('r1:', r1);
const r2 = await page.evaluate(async () => {
  const m = await import('/src/world/MinecartTrack.ts');
  return 'imported:' + (typeof m.frameTrack) + ':' + m.TRACK_TILE;
});
console.log('r2:', r2);
const r3 = await page.evaluate(async () => {
  const g = window.__swGame;
  return 'game:' + !!g + ':' + (g ? g.world.store.w : -1);
});
console.log('r3:', r3);
await browser.close();
