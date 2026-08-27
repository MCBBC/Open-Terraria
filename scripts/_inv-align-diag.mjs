// 一次性:背包面板贴位/透明度/边框断言(v2,确定性开关)——
//  关闭态起手 → E 开 → 等 250ms(含二次校正) → 量面板左缘 vs 热键栏首格 inline left。
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
await new Promise((r) => setTimeout(r, 500));
// 确保背包关闭起手（可能被此前流程开着——直接 closeInventory 语义:连按两次 E 不稳,
// 用 UI 内部关:再开前先按一次）
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 400));
const out = await page.evaluate(() => {
  const ui = window.__swUI;
  const panel = ui.invPanel;
  const hb0 = ui.hotbarEl.querySelector('.sw-slot');
  const hbLeft = parseFloat(hb0?.style.left ?? '');
  const hbTop = parseFloat(hb0?.style.top ?? '');
  const pr = panel.getBoundingClientRect();
  const style = panel.getAttribute('style');
  return {
    invOpen: ui.inventoryOpen,
    hbFirst: { left: hb0?.style.left, top: hb0?.style.top, cls: hb0?.className },
    panelLeft: panel.style.left, panelTop: panel.style.top,
    alignLeft: Number.isFinite(hbLeft) ? +(pr.left - hbLeft).toFixed(1) : null,
    topGap: Number.isFinite(hbTop) ? +(pr.top - (hbTop + 52)).toFixed(0) : null,
    opacity: style.match(/opacity:\s*([\d.]+)/)?.[1] ?? null,
    borderColor: style.match(/border-color:\s*([^;]+)/)?.[1] ?? null,
  };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/inv-align.png' });
await browser.close();
