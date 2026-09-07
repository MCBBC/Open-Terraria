import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', (e.stack || e.message).slice(0, 300)));
await page.goto('http://localhost:5202/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1000));
console.log(await page.evaluate(async () => {
  const ui = window.__swUI;
  ui.openInventory();
  await new Promise((r) => setTimeout(r, 200));
  const openState = ui.hotbarEl.style.display;
  let closeErr = 'ok';
  try { ui.closeInventory(); } catch (e) { closeErr = String(e && e.stack || e).slice(0, 300); }
  await new Promise((r) => setTimeout(r, 200));
  const closedState = ui.hotbarEl.style.display;
  return JSON.stringify({ openState, closeErr, closedState, queued: ui._refreshAllQueued });
}));
await browser.close();
