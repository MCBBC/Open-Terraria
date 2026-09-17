// RB31b r7:normal 态选中跨拍存活(逐拍 vinvUpdateModernCraft 的 sync 三臂)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5265';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e.stack || e.message).slice(0, 240)));
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
  await new Promise((r) => setTimeout(r, 250));
  const cell = ui.vinvModernCellEls[0]?.el;
  const sel0 = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
  window.__md(cell);
  const sel1 = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
  await new Promise((r) => setTimeout(r, 800));     // 48 拍:逐拍 vinvRefreshCraft→vinvUpdateModernCraft
  const end = {
    open: ui.vinvModernCraftOpen,
    selected: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
    lookup: ui.vinvModernLookup.size,
    detail: ui.vinvModernDetailEl.style.display,
    dRel: (() => { const w = ui.vinvModernCraftEl.getBoundingClientRect(), d = ui.vinvModernDetailEl.getBoundingClientRect(); return { l: +(d.x - w.x).toFixed(1), t: +(d.y - w.y).toFixed(1) }; })(),
  };
  ui.vinvCloseModernCraft(true);
  return { sel0, sel1, end };
});
console.log(JSON.stringify(R));
await browser.close();
