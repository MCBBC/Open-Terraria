import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 1200, 400));   // 小世界快加载
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
const r = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  const key = items.VANILLA_ITEM_KEY_BY_ID[4];
  const id = items.ITEM_BY_KEY[key];
  g.player.inv.slots[0] = { id, stack: 1 };
  g.player.inv.selected = 0;
  ui['showTooltipFor'](0, 'inv');
  await new Promise((r2) => setTimeout(r2, 600));
  return { filter: ui.tooltip.style.filter, txt: ui.tooltip.innerText.slice(0, 40) };
});
console.log(JSON.stringify(r));
const el = await page.$('.sw-tooltip');
await el.screenshot({ path: '/tmp/tt-el.png' }).catch((e) => console.log('shot fail', String(e).slice(0, 80)));
console.log('done');
await browser.close();
