// 一次性:面具 2112 完整 UI 路径实测（内部 API 拖放 + 真实右键事件链）
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
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const inv = g.player.inv;
  const mask = window.__swFlow.itemByKey('vi_2112_EyeMask');
  inv.slots[20] = { id: mask, stack: 1 };
  ui.openInventory();
  ui.refreshAll();
  return new Promise((resolve) => {
    setTimeout(() => {
      const slot20 = document.querySelector('[data-idx="20"][data-where="inv"]');
      const social10 = document.querySelector('[data-idx="10"][data-where="armor"]');
      let drag = null, rightClick = null, heldSnapshot = null;
      // ① 内部 API 链:pickUp → placeHeld
      try {
        ui.pickUp(20, 'inv');
        heldSnapshot = ui.heldStack ? { id: ui.heldStack.id, stack: ui.heldStack.stack } : null;
        ui.placeHeld(10, 'armor');
        drag = { heldWasMask: heldSnapshot?.id === mask, slot10After: inv.armor[10]?.id === mask };
      } catch (e) { drag = { err: String(e) }; }
      inv.armor[10] = null; ui.heldStack = null;
      inv.slots[20] = { id: mask, stack: 1 }; ui.refreshAll();
      // ② 真实右键事件链
      try {
        slot20.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true, cancelable: true }));
        rightClick = { slot10: inv.armor[10]?.id === mask, slot20Still: inv.slots[20]?.id === mask };
      } catch (e) { rightClick = { err: String(e) }; }
      // 清理
      inv.armor[10] = null; inv.slots[20] = null; ui.refreshAll(); ui.closeInventory();
      resolve({ mask, heldSnapshot, drag, rightClick });
    }, 600);
  });
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
