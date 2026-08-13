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
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 600));
const grids = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.sw-panel *')) {
    if (!el.className || typeof el.className !== 'string') continue;
    if (!/grid|slot-wrap|bag|bank|storage/i.test(el.className)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 30) continue;
    const slots = el.querySelectorAll('.sw-slot').length;
    out.push({ cls: el.className.slice(0, 50), slots, w: Math.round(r.width), h: Math.round(r.height) });
  }
  // 面板内的标题行
  const titles = [...document.querySelectorAll('.sw-panel .sw-title, .sw-panel h3, .sw-panel .sw-lbl')].map((t) => t.textContent.trim().slice(0, 20));
  return { grids: out.slice(0, 20), titles: titles.slice(0, 25) };
});
console.log(JSON.stringify(grids, null, 1));
await browser.close();
