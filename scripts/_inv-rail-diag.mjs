// 一次性:垃圾桶/弹药/钱币列迁移断言(2026-08-27 用户要求)——
//  弹药|钱币 顺序 + 该列夹在背包网格与右缘成就/杂项列之间 + 背包贴装备列。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 900 }, userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => { document.querySelector('.sw-welcome, [class*="welcome"]')?.remove(); });
for (let i = 0; i < 10; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 600));
  if (await page.evaluate(() => !!document.querySelector('.sw-panel .sw-slot')).catch(() => false)) break;
}
const out = await page.evaluate(() => {
  const inv = document.querySelector('.sw-panel');
  const grid = [...inv.querySelectorAll('div')].find((d) => /grid-template-columns:\s*repeat\(10/.test(d.style.cssText));
  // 弹药/钱币列:找含 LegacyInterface.27/26 标签的列——用标签文本定位
  const lbls = [...inv.querySelectorAll('.sw-lbl')];
  const ammoLbl = lbls.find((l) => l.textContent === '弹药');
  const coinLbl = lbls.find((l) => l.textContent === '钱币');
  const ammoCol = ammoLbl?.parentElement;
  const coinCol = coinLbl?.parentElement;
  // 右缘列 = 含宠物标签(杂项)的容器祖先——取 advRail:包含宠物槽的列容器
  const petLbl = lbls.find((l) => l.textContent === '宠物');
  const advRail = petLbl?.closest('div[style*="flex-direction: column"], div[style*="flex-direction:column"]');
  const g = (el) => el?.getBoundingClientRect();
  const gridR = g(grid).right, ammoL = g(ammoCol).left, ammoR = g(ammoCol).right;
  const coinL = g(coinCol).left;
  const advL = g(advRail).left;
  return {
    ammoLeftOfCoins: ammoR <= coinL + 1,
    railRightOfGrid: ammoL >= gridR - 1,
    railLeftOfAdv: ammoR <= advL + 1,
    trashBelowAmmo: (() => {
      const trash = inv.querySelector('.sw-trash');
      const t = g(trash), a = g(ammoCol);
      return t.top >= a.bottom - 2 && Math.abs(t.left - a.left) < 24;
    })(),
    rects: {
      grid: { l: Math.round(g(grid).left), r: Math.round(gridR) },
      ammo: { l: Math.round(ammoL) }, coin: { l: Math.round(coinL) },
      adv: { l: Math.round(advL) },
    },
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/inv-rail.png' });
await browser.close();
