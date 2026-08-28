// 一次性:配方列表对齐右缘列底 + 字号断言(2026-08-27)——
//  ①列表底 ≤ 右缘列底(±14px);②数量数字 11px=热键栏号;③合成标题 14px;
//  ④ wood 入包 → 配方行出现。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-fresh' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame?.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓')?.click(); });
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 800));
const st = await page.evaluate(() => {
  const ui = window.__swUI;
  const cl = ui.craftListEl;
  const clR = cl.getBoundingClientRect();
  const advR = ui.advRailEl.getBoundingClientRect();
  const cnt = document.querySelector('.sw-panel .sw-slot .cnt');
  const title = [...document.querySelectorAll('.sw-title')].find((t) => t.textContent === '合成');
  return {
    rows: cl.querySelectorAll('.sw-recipe').length,
    listBottom: Math.round(clR.bottom),
    railBottom: Math.round(advR.bottom),
    aligned: Math.abs(clR.bottom - advR.bottom) < 14,
    cntFont: cnt ? getComputedStyle(cnt).fontSize : null,
    titleFont: title ? getComputedStyle(title).fontSize : null,
    fits: clR.bottom <= window.innerHeight - 8,
  };
});
console.log(JSON.stringify(st, null, 1));
await page.screenshot({ path: '/tmp/inv-align2.png' });
await browser.close();
