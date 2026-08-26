import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
console.log(JSON.stringify(await page.evaluate(() => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const before = { panel: ui.invPanel?.style.display ?? 'none', listChildren: ui.craftListEl?.children.length ?? -1, avail: g.vanillaAvailableRecipes().length };
  ui.openInventory();
  return new Promise((res) => setTimeout(() => {
    const after = { panel: ui.invPanel?.style.display ?? 'none', listChildren: ui.craftListEl?.children.length ?? -1, avail: g.vanillaAvailableRecipes().length, availRef: ui.craftAvailRef?.length ?? -1 };
    res({ before, after });
  }, 800));
})));
await browser.close();
