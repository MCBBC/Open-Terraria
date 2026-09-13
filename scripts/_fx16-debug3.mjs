// 调试3:枚举 body 子元素,找覆盖 (110,667) 的无类 DIV
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
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
const v = await page.evaluate(() => {
  const out = [];
  for (const e of document.body.children) {
    const r = e.getBoundingClientRect();
    const covers = r.left <= 110 && r.right > 110 && r.top <= 667 && r.bottom > 667;
    const cs = getComputedStyle(e);
    out.push({
      tag: e.tagName, id: e.id, cls: (e.className || '').toString().slice(0, 40),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      covers, pe: cs.pointerEvents, z: cs.zIndex, disp: cs.display,
    });
  }
  return out.filter((o) => o.covers || o.pe !== 'none');
});
console.log(JSON.stringify(v, null, 1));
await browser.close();
