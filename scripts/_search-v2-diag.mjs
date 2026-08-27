// 一次性:图标钮尺寸/样式统一 + 搜索气泡顶层 + 小✕断言(2026-08-27 用户报)——
//  ①三图标钮均为裸 icon(无 sw-btn 类),按原生素材尺寸(22×22/22×24/32×30)等高居中;
//  ②hover 态齐备(搜索 Search_2/房 _7/书金帧);③搜索结果行 hover 气泡挂在 body
//  (不被面板压住,z≥1200);④面板右上角 ✕ 20×20;⑤背包/合成间距 14px。
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
  const info = (el) => ({
    cls: el.className, w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height),
  });
  const craftTitle = [...document.querySelectorAll('.sw-title')].find((t) => t.textContent === '合成')?.parentElement;
  return {
    search: info(search), house: info(house), bestiary: info(bestiary),
    noBtnClass: !search.className.includes('sw-btn') && !house.className.includes('sw-btn') && !bestiary.className.includes('sw-btn'),
    order: search.nextElementSibling === house && house.nextElementSibling === bestiary,
    craftMargin: craftTitle?.getAttribute('style')?.match(/margin:\s*([^;]+)/)?.[1] ?? null,
  };
});
// hover 三连
await page.evaluate(() => {
  const s = window.__swUI.housingBtn.previousElementSibling;
  s.dispatchEvent(new MouseEvent('mouseenter'));
});
out.searchHover = await page.evaluate(() => (window.__swUI.housingBtn.previousElementSibling.style.backgroundImage || '').includes('Search_2'));
// 开搜索 + hover 行 → tooltip 应在 body 且置顶
await page.evaluate(() => { window.__swUI.openItemSearch(); });
await new Promise((r) => setTimeout(r, 300));
await page.type('input[placeholder*="名称"]', '小丑之箭');
await new Promise((r) => setTimeout(r, 400));
const rowBox = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div[style*="z-index: 1200"] div, div[style*="z-index:1200"] div')]
    .filter((d) => /width:\s*170px/.test(d.style.cssText));
  const r = rows[0]?.getBoundingClientRect();
  return r ? { x: r.x + 40, y: r.y + 12 } : null;
});
if (rowBox) {
  await page.mouse.move(rowBox.x, rowBox.y);
  await new Promise((r) => setTimeout(r, 300));
  out.tooltip = await page.evaluate(() => {
    const t = document.querySelector('.sw-tooltip');
    const style = getComputedStyle(t);
    return {
      shown: t?.style.display === 'block',
      inBody: t?.parentElement === document.body,
      z: +style.zIndex,
      text: (t?.textContent ?? '').slice(0, 24),
    };
  });
}
out.xBtn = await page.evaluate(() => {
  const x = [...document.querySelectorAll('button')].find((b) => b.textContent === '✕');
  const r = x?.getBoundingClientRect();
  return x ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/search-v2.png' });
await browser.close();
