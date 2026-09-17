// RB31b r5(A5c 仪表化):向导态点选后 selected/detail/监听器运行取证。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5265';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e.stack || e.message).slice(0, 300)));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(400);
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  window.__swUI.closeInventory();
  window.__md = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
});
await sleep(150);
const R = await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wid = g.itemId('vi_9_Wood');
  if (wid > 0) g.player.inv.add(wid, 500);
  await ui.refreshAllAsync();
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  window.__md(toggle);
  await new Promise((r) => setTimeout(r, 300));
  window.__dlgSaved = g.dialogNpc;
  g.dialogNpc = { npcKey: 'guide', vanillaId: 22 };
  ui.vinvCloseModernCraft(true);
  ui.openVanillaGuideCraft();
  const wood = g.itemId('vi_9_Wood');
  ui.guidePlaced = { id: wood, stack: 10 };
  ui.vinvUpdateModernCraft();
  const cell = ui.vinvModernCellEls[0]?.el;
  const attached = cell ? cell.isConnected : null;
  const sameAsEntry0 = cell ? ui.vinvModernCellEls[0].r === ui.vinvModernEntries[0].r : null;
  // 捕获阶段监听取证
  let fired = 0;
  cell?.addEventListener('mousedown', () => { fired++; }, { capture: false });
  window.__md(cell);
  await new Promise((r) => setTimeout(r, 600));   // 让游戏 tick 跑 36 拍(逐拍 vinvUpdateModernCraft)
  const detail = ui.vinvModernDetailEl;
  const win = ui.vinvModernCraftEl;
  const dw = win.getBoundingClientRect(), dd = detail.getBoundingClientRect();
  const relD = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - dd.x).toFixed(1), t: +(b.y - dd.y).toFixed(1) }; };
  const kids = [...detail.children].map(relD);
  const cntEls = [...detail.children].filter((c) => c.tagName === 'DIV' && c.style.pointerEvents === 'none');
  const after = {
    fired,
    selected: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
    detailDisplay: detail.style.display,
    dRelWin: { l: +(dd.x - dw.x).toFixed(1), t: +(dd.y - dw.y).toFixed(1) },
    kids,
    ownedShown: cntEls.some((d) => d.style.display !== 'none'),
  };
  ui.vinvCloseModernCraft(true);
  ui.vinvGuideMenuOpen = false;
  ui.vinvReturnGuidePlaced?.();
  g.dialogNpc = window.__dlgSaved;
  return { attached, sameAsEntry0, after };
});
console.log(JSON.stringify(R, null, 1));
await browser.close();
