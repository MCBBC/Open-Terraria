import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
// 关掉欢迎弹窗(裸 div 覆盖层会吞 CDP 点击——取证用,与本次改动无关)
const welcome = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === '我知道了');
  btn?.click();
  return !!btn;
});
await new Promise((r) => setTimeout(r, 200));
const prep = await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  const swordId = g.itemId('vi_3507_CopperShortsword');
  g.player.inv.slots[10] = { id: swordId, stack: 1 };
  g.player.inv.selected = 5;   // 空手档,持物挥击只能来自误穿透
  ui.openInventory();
  const el = document.querySelector('.sw-panel .sw-slot[data-idx="10"][data-where="inv"]');
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + 10, r.y + 10);
  return { x: r.x + 10, y: r.y + 10, hitIsSlot: hit === el };
});
await page.mouse.click(prep.x, prep.y);
const held = await page.evaluate(() => ({ held: !!window.__swUI.heldStack, blocking: window.__swGame.input.uiBlocking }));
await page.mouse.move(900, 500);
await page.mouse.down(); await page.mouse.up();
const swing = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    res({ useTime: window.__swGame.player.useTime, held: !!window.__swUI.heldStack });
  }));
}));
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 200));
const after = await page.evaluate(() => {
  const g = window.__swGame;
  return { held: !!window.__swUI.heldStack, swordBack: g.player.inv.slots.some((s) => s && s.id === g.itemId('vi_3507_CopperShortsword')) };
});
console.log(JSON.stringify({ prep, held, swing, after, errs: errs.slice(0, 3) }, null, 1));
await browser.close();
