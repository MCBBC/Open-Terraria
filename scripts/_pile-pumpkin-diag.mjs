// 对照实验：现役 DECOR 多格件（花盆28/向日葵27）经 tryPlace 放置是否自毁
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (23).json';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 600000 });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (t) => { await window.__swFlow.loadJson(t); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const idOfSheet = (sh) => {
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i;
    return -1;
  };
  const STONE = idOfSheet(1);
  const findItem = (tileKey) => {
    for (let i = 0; i < items.ITEM_DEFS.length; i++) {
      if (items.ITEM_DEFS[i]?.tile === tileKey) return i;
    }
    return -1;
  };
  const POT_T = idOfSheet(28), SUN_T = idOfSheet(27), GRASS = idOfSheet(2);
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 20), st.w - 20) + 30;
  const F = Math.floor(st.h / 2) - 260;
  const clearBox = () => { for (let x = x0 - 3; x <= x0 + 8; x++) for (let y = F - 8; y <= F + 3; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    const i2 = st.idx(x, y);
    if (st.liquid[i2] > 0) st.liquid[i2] = 0;
  } };
  const fillGrass = () => { for (let x = x0; x <= x0 + 7; x++) st.setTile(x, F, GRASS, 0, 0); };
  const count = (tid) => {
    let n = 0;
    for (let x = x0 - 2; x <= x0 + 6; x++) for (let y = F - 6; y <= F + 2; y++) {
      if (st.inBounds(x, y) && st.get(x, y) === tid) n++;
    }
    return n;
  };
  const inv = g.player.inv;
  const selIdx = inv.selected;
  const savedSlot = inv.slots[selIdx];
  const res = {};
  // 花盆（28, 2×2, DECOR 'pot'）
  clearBox(); fillGrass();
  const potIdx = findItem(tiles.TILE_DEFS[POT_T]?.key);
  res.potIdx = potIdx;
  if (potIdx >= 0) {
    inv.slots[selIdx] = { id: potIdx, stack: 10, favorited: false, prefix: 0 };
    inv.selected = selIdx;
    g.player.x = (x0 + 2) * 16 + 8; g.player.y = (F - 3) * 16; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
    await new Promise((r) => setTimeout(r, 40));
    g['tryPlace'].call(g, x0 + 1, F - 2, items.ITEM_DEFS[potIdx]);
    res.potCells = count(POT_T);
  }
  // 向日葵（27, 2×4, DECOR 'sunflower'）
  clearBox(); fillGrass();
  const sunIdx = findItem(tiles.TILE_DEFS[SUN_T]?.key);
  res.sunIdx = sunIdx;
  if (sunIdx >= 0) {
    inv.slots[selIdx] = { id: sunIdx, stack: 10, favorited: false, prefix: 0 };
    inv.selected = selIdx;
    g.player.x = (x0 + 2) * 16 + 8; g.player.y = (F - 3) * 16; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
    await new Promise((r) => setTimeout(r, 40));
    g['tryPlace'].call(g, x0 + 1, F - 4, items.ITEM_DEFS[sunIdx]);
    res.sunCells = count(SUN_T);
  }
  inv.slots[selIdx] = savedSlot;
  return res;
});
fs.writeFileSync('/tmp/decor-place-diag.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
