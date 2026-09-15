import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5237';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 700 } });
const page = await browser.newPage();
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(500);
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const wb = window.__swTiles['workbench'];
  const { craftingFilterForTile } = await import('/src/ui/craftingGrid.ts');
  const { tileUsedInRecipes, COUNTS_AS_WATER_FOR_CRAFTING } = await import('/src/core/SmartInteractTiles.ts');
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
  st.setTileSilent(ptx + 3, pty - 1, wb, 0, 0);
  st.setTileSilent(ptx + 4, pty - 1, wb, 18, 0);
  const placed = st.get(ptx + 3, pty - 1);
  const tui = tileUsedInRecipes();
  return {
    wbKeyVal: wb,
    placedTileId: placed,
    inUsedRecipes: tui.has(wb),
    usedSample: [...tui].slice(0, 30),
    fOfWb: craftingFilterForTile(wb),
    waterHas: COUNTS_AS_WATER_FOR_CRAFTING.has(wb),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
