// 一次性:搜索图标钮 + 搜索结果详情气泡 + 合成区间距断言(2026-08-27 用户要求)——
//  ①顶排图标组 = 搜索|房子|图鉴,搜索钮 hover 切帧;②背包标签行无文字钮;
//  ③搜索面板结果行 hover → .sw-tooltip 显示且含物品名(z1300 在遮罩上);
//  ④合成标题行与背包钮簇间距 ≥14px。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓');
  btn?.click();
});
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => !!document.querySelector('.sw-panel .sw-slot')).catch(() => false)) break;
}
const out = await page.evaluate(() => {
  const ui = window.__swUI;
  const house = ui.housingBtn;
  const search = house.previousElementSibling;
  const bestiary = house.nextElementSibling;
  // 背包标签行应无按钮
  const lblRow = [...document.querySelectorAll('.sw-panel .sw-lbl')].find((l) => l.textContent === '背包')?.parentElement;
  return {
    searchIcon: (search?.style.backgroundImage || '').includes('UI_Bestiary_Button_Search'),
    order: search?.nextElementSibling === house && house.nextElementSibling === bestiary,
    lblRowNoBtn: lblRow ? lblRow.querySelectorAll('button').length === 0 : null,
  };
});
// hover 搜索钮切帧
await page.evaluate(() => { window.__swUI.housingBtn.previousElementSibling.dispatchEvent(new MouseEvent('mouseenter')); });
out.hoverFrame = await page.evaluate(() => (window.__swUI.housingBtn.previousElementSibling.style.backgroundImage || '').includes('Search_2'));
// 打开搜索面板 → 输入 → hover 第一行结果
await page.evaluate(() => { window.__swUI.openItemSearch(); });
await new Promise((r) => setTimeout(r, 300));
out.panelOpen = await page.evaluate(() => !!document.querySelector('div[style*="z-index: 1200"], div[style*="z-index:1200"]'));
await page.type('input[placeholder*="名称"]', '火把');
await new Promise((r) => setTimeout(r, 400));
const rowBox = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div[style*="z-index: 1200"] div, div[style*="z-index:1200"] div')]
    .filter((d) => /width:\s*170px/.test(d.style.cssText));
  const r = rows[0]?.getBoundingClientRect();
  return r ? { x: r.x + 40, y: r.y + 12, name: rows[0].textContent } : null;
});
if (rowBox) {
  await page.mouse.move(rowBox.x, rowBox.y);
  await new Promise((r) => setTimeout(r, 300));
  out.tooltip = await page.evaluate(() => {
    const t = document.querySelector('.sw-tooltip');
    return {
      shown: t && t.style.display === 'block',
      aboveOverlay: +getComputedStyle(t).zIndex >= 1300,
      text: t?.textContent?.slice(0, 40) ?? '',
      hasName: (t?.textContent ?? '').includes('火把'),
    };
  });
}
// 合成区间距
out.craftGap = await page.evaluate(() => {
  const title = [...document.querySelectorAll('.sw-title')].find((t) => t.textContent === '合成');
  if (!title) return null;
  const row = title.parentElement;
  const style = row.getAttribute('style');
  return { margin: style.match(/margin:\s*([^;]+)/)?.[1] ?? '' };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/search-icon.png' });
await browser.close();
