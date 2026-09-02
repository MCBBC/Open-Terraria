// 一次性:补充验证(2026-09-02)
//  ① 背包开着右键开箱路径等价:openChestPanel(force) → 背包不翻转,箱+背包同开
//  ② 光标持物点世界 → 不挥击(uiHeldItemRef 门),持物保持
//  ③ Esc 收背包 → 持物归还背包
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// ① 背包开着 → force 开箱（储物面板 -2 存钱罐）
const chest = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  ui.openInventory();
  const before = document.querySelector('.sw-panel')?.style.display;
  ui.openChestPanel({ x: -2, y: 0, items: [] });
  return {
    invBefore: before,
    invAfter: document.querySelector('.sw-panel')?.style.display,
    chestAfter: document.getElementById?.('sw-chest') ? 'id' : (document.querySelector('.sw-panel:nth-of-type(2)') ? 'panel2' : 'check-inline'),
    chestVisible: [...document.querySelectorAll('.sw-panel')].some((p) => p.style.display === 'block' && p.textContent.includes('存钱罐')),
    blocking: g.input.uiBlocking,
  };
});
// 关箱（走 closeChestPanel=closeInventory 全关链）
const chestClose = await page.evaluate(() => {
  const g = window.__swGame;
  g.closeChestPanel?.();
  return {
    invAfter: document.querySelector('.sw-panel')?.style.display,
    dock: document.querySelector('.sw-eqdock')?.style.display,
  };
});

// ②③ 光标持物 → 点世界不挥 → Esc 归还
await page.evaluate(() => {
  const g = window.__swGame;
  g.closeInventory?.();
  const swordId = g.itemId('vi_3507_CopperShortsword');
  g.player.inv.slots[0] = { id: swordId, stack: 1 };
  g.player.inv.selected = 0;
  window.__swUI.openInventory();
});
await new Promise((r) => setTimeout(r, 200));
// 点击槽0 拾取到光标
const slot0 = await page.evaluate(() => {
  const el = document.querySelector('.sw-slot[data-idx="0"][data-where="inv"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(slot0.x, slot0.y);
const held = await page.evaluate(() => ({ held: !!window.__swUI.heldStack, heldId: window.__swUI.heldStack?.id ?? null }));
await page.mouse.move(900, 500);
await page.mouse.down(); await page.mouse.up();
const swingWhileHeld = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const g = window.__swGame;
    res({ useTime: g.player.useTime, held: !!window.__swUI.heldStack });
  }));
}));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 200));
const afterEsc = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    held: !!window.__swUI.heldStack,
    swordBack: g.player.inv.slots.some((s) => s && s.id === g.itemId('vi_3507_CopperShortsword')),
  };
});
console.log(JSON.stringify({ chest, chestClose, held, swingWhileHeld, afterEsc }, null, 1));
console.log('PAGE_ERRORS:', JSON.stringify(errs.slice(0, 5), null, 1));
await browser.close();
