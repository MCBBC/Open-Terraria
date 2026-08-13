import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
const ok = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 60000) { await new Promise(r => setTimeout(r, 500)); }
  if (!window.__swGame?.player) return 'no game';
  // 等成就系统与 UI 就绪
  while (!window.__swUI && Date.now() - t0 < 30000) { await new Promise(r => setTimeout(r, 300)); }
  if (!window.__swUI) return 'no ui';
  window.__swUI.achievementPopup('WOODEN_STORY', '木材物语');
  return 'ok';
});
console.log('trigger:', ok);
await new Promise(r => setTimeout(r, 1200));
const px = await page.evaluate(async () => {
  const c = document.querySelector('.sw-ach');
  const r = c.getBoundingClientRect();
  // 卡片裁剪截图 → 页内 canvas 直方图
  const shot = await new Promise(res => {
    // 用 html2canvas 不可用;改取 computed style + icn 内 sheet 定位断言
    res(null);
  });
  const cs = getComputedStyle(c);
  const sheet = c.querySelector('.sheet');
  return {
    bg: cs.backgroundColor, padding: cs.padding,
    sheetW: sheet.style.width, sheetL: sheet.style.left, sheetT: sheet.style.top,
    ttlAlign: getComputedStyle(c.querySelector('.ttl')).textAlign,
  };
});
console.log('style:', JSON.stringify(px));
await page.screenshot({ path: '/tmp/ach-1.png', clip: { x: 574, y: 727, width: 132, height: 33 } });
const geo = await page.evaluate(() => {
  const c = document.querySelector('.sw-ach');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const i = c.querySelector('.icn')?.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, icnW: i?.width, icnH: i?.height };
});
console.log('card rect:', JSON.stringify(geo));
await browser.close();
