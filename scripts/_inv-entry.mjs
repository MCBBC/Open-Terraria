// 一次性:背包双入口排查——按 E 后 dump 可见面板
// SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_inv-entry.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
// 按 E 开背包
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 700));
const dom = await page.evaluate(() => {
  const visible = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) continue;
    const cls = (el.className && typeof el.className === 'string') ? el.className : '';
    if (/inv|bag|chest|craft|equip|armor|pause|panel/i.test(cls) || /背包|物品|合成/i.test(el.textContent?.slice(0, 30) ?? '')) {
      visible.push({ tag: el.tagName, cls: cls.slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), id: el.id });
    }
  }
  return visible.slice(0, 30);
});
console.log(JSON.stringify(dom, null, 1));
// 再试 Esc 链路开背包看是否同一面板
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 500));
const afterEsc = await page.evaluate(() => ({
  invVisible: !!document.querySelector('.sw-inv') && getComputedStyle(document.querySelector('.sw-inv')).display !== 'none',
  invCount: document.querySelectorAll('.sw-inv, [class*="inv"]').length,
  classes: [...new Set([...document.querySelectorAll('[class*="inv"]')].map((e) => e.className).filter((c) => typeof c === 'string'))].slice(0, 12),
}));
console.log(JSON.stringify(afterEsc));
await browser.close();
