// 一次性:列出游戏内所有可见按钮文案（找背包双入口）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const btns = await page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('button, [role="button"], .sw-chip')) {
    const r = b.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) continue;
    out.push({ txt: (b.textContent || '').trim().slice(0, 24), cls: String(b.className).slice(0, 40) });
  }
  return out;
});
console.log('未开背包:', JSON.stringify(btns));
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 600));
const btns2 = await page.evaluate(() => {
  const out = [];
  for (const b of document.querySelectorAll('button, [role="button"], .sw-chip')) {
    const r = b.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) continue;
    out.push({ txt: (b.textContent || '').trim().slice(0, 24), cls: String(b.className).slice(0, 40) });
  }
  return out;
});
console.log('开背包后:', JSON.stringify(btns2));
await browser.close();
