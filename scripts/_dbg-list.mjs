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
  const ui = window.__swUI, g = window.__swGame;
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
  g.player.inv.add(iidOf(9), 99); g.player.inv.add(iidOf(23), 99);
  ui.openInventory(true);
  await ui.refreshAllAsync();
  await new Promise((r) => setTimeout(r, 150));
  const vinv = document.querySelector('.sw-vinv');
  const list = [...vinv.querySelectorAll('.sw-slot')].filter((s) => {
    const x = s.offsetLeft, y = s.offsetTop;
    return x >= 0 && x <= 100 && y >= 380 && y <= 1100;
  }).map((s) => ({ x: s.offsetLeft, y: s.offsetTop, t: s.style.transform, o: s.style.opacity, d: s.style.display }));
  return JSON.stringify({
    focus: ui.vinvCraftFocusV, avail: ui.vinvCraftAvailV.length,
    cells: ui.vinvCraftCellEls.length, listRect: ui.vinvCraftListEl ? { x: ui.vinvCraftListEl.offsetLeft, y: ui.vinvCraftListEl.offsetTop, w: ui.vinvCraftListEl.offsetWidth, h: ui.vinvCraftListEl.offsetHeight } : null,
    list,
  });
}));
await browser.close();
