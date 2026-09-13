// 调试2:切换钮点击链取证(elementFromPoint/直发事件)+附近箱钮 hover
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', (e.stack || e.message).slice(0, 120)));
page.on('console', (m) => { const t = m.text(); if (t.includes('[tog]') || t.includes('[near]')) console.log('LOG', t.slice(0, 160)); });
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(async () => {
  const ui = window.__swUI;
  const g = window.__swGame;
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  if (VANILLA_ITEM_KEY_BY_ID[9]) g.player.inv.add(ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[9]], 99);
  ui.openInventory(true);
  await ui.refreshAllAsync();
  await new Promise((r) => setTimeout(r, 150));
});
const v1 = await page.evaluate(() => {
  const ui = window.__swUI;
  const tog = ui.vinvGridToggleImg.parentElement;
  const r = tog.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const top = document.elementFromPoint(cx, cy);
  const chain = [];
  let e = top;
  while (e && chain.length < 6) { chain.push(`${e.tagName}.${(e.className || '').toString().slice(0, 24)}`); e = e.parentElement; }
  return { rect: { x: cx, y: cy }, top: chain, pips: ui.vinvPipsUseGrid, disp: tog.style.display, z: tog.style.zIndex };
});
console.log('TOG-STATE', JSON.stringify(v1));
// 真鼠标点击
await page.mouse.click(v1.rect.x, v1.rect.y);
await new Promise((r) => setTimeout(r, 250));
console.log('AFTER-CLICK', await page.evaluate(() => JSON.stringify({ pips: window.__swUI.vinvPipsUseGrid, gridDisp: window.__swUI.vinvCraftGridEl?.style.display })));
await browser.close();
