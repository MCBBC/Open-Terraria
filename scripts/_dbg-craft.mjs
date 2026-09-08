import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', (e.stack || e.message).slice(0, 500)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202' + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
console.log(await page.evaluate(async () => {
  const ui = window.__swUI;
  const g = window.__swGame;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const woodId = ITEM_BY_KEY['Wood'];
  const addRes = woodId ? g.player.inv.add(woodId, 99) : 'no-wood-key';
  document.getElementById('sw-welcome-announce')?.remove();
  ui.openInventory(true);
  const panel = document.querySelector('[data-role="vinv-craft"]');
  const cells = panel ? [...panel.children].find((c) => c.style.overflowY === 'auto') : null;
  let refreshErr = 'ok';
  try { await ui.refreshAllAsync(); } catch (e) { refreshErr = String(e && e.stack || e).slice(0, 400); }
  return JSON.stringify({
    woodId, addRes,
    panelExists: !!panel,
    cellsFound: !!cells,
    cellCount: cells ? cells.children.length : -1,
    availLen: g.vanillaAvailableRecipes().length,
    refreshErr,
  });
}));
await browser.close();
