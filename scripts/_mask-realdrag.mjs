// 一次性:面具 2112 真实鼠标拖放(page.mouse 全真输入:按下→移动→释放)
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
await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const mask = window.__swFlow.itemByKey('vi_2112_EyeMask');
  g.player.inv.slots[20] = { id: mask, stack: 1 };
  ui.openInventory();
  ui.refreshAll();
});
await new Promise((r) => setTimeout(r, 500));
const centers = await page.evaluate(() => {
  const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  return {
    from: c(document.querySelector('[data-idx="20"][data-where="inv"]')),
    to: c(document.querySelector('[data-idx="10"][data-where="armor"]')),
  };
});
// 真实拖放
await page.mouse.move(centers.from.x, centers.from.y);
await page.mouse.down();
await page.mouse.move(centers.from.x + 8, centers.from.y + 4, { steps: 3 });
await new Promise((r) => setTimeout(r, 120));
await page.mouse.move(centers.to.x, centers.to.y, { steps: 8 });
await new Promise((r) => setTimeout(r, 120));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 300));
const out = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const mask = window.__swFlow.itemByKey('vi_2112_EyeMask');
  const slot10 = document.querySelector('[data-idx="10"][data-where="armor"] img');
  return {
    armor10IsMask: g.player.inv.armor[10]?.id === mask,
    slot10HasImg: !!slot10,
    heldLeft: !!ui.heldStack,
    slot20: g.player.inv.slots[20]?.id ?? null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
