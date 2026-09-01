// 南瓜(254)放置对拍定位仪：为何占位矩形交 1 格时放置被拒/不wipe。
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
  const gm = await import('/src/core/Game.ts');
  const idOfSheet = (sh) => {
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i;
    return -1;
  };
  const PUMPKIN = idOfSheet(254), STONE = idOfSheet(1), GRASS = idOfSheet(2);
  let W = -1;
  for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.key === 'workbench') W = i;
  let wbDef = null;
  for (let i = 0; i < items.ITEM_DEFS.length; i++) {
    if (items.ITEM_DEFS[i]?.tile === tiles.TILE_DEFS[W]?.key) { wbDef = items.ITEM_DEFS[i]; break; }
  }
  const wbIdx = items.ITEM_DEFS.indexOf(wbDef);
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 20), st.w - 20);
  const F = Math.floor(st.h / 2) - 260;
  const clearBox = () => { for (let x = x0 - 2; x <= x0 + 8; x++) for (let y = F - 8; y <= F + 2; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    const i2 = st.idx(x, y);
    if (st.liquid[i2] > 0) st.liquid[i2] = 0;
  } };
  const fillFloor = () => { for (let x = x0; x <= x0 + 6; x++) st.setTile(x, F, STONE, 0, 0); };
  const inv = g.player.inv;
  const selIdx = inv.selected;
  const savedSlot = inv.slots[selIdx];
  const holdItem = (id) => { inv.slots[selIdx] = { id, stack: 10, favorited: false, prefix: 0 }; inv.selected = selIdx; };
  const stand = (px, py) => {
    g.player.x = px * 16 + 8; g.player.y = (py - 2) * 16; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
  };
  const findTileIn = (tid, xa, xb, ya, yb) => {
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++)
      if (st.inBounds(x, y) && st.get(x, y) === tid) return [x, y];
    return null;
  };
  // 场景 A：南瓜 2×2 底左 (x0+1, F-1)，工作台点击 (x0, F-1)（占位矩形交 1 格）
  clearBox(); fillFloor();
  st.setTile(x0 + 1, F, GRASS, 0, 0); st.setTile(x0 + 2, F, GRASS, 0, 0);
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    st.setTile(x0 + 1 + dx, F - 1 - 1 + dy + 1, PUMPKIN, dx * 18, dy * 18);
  }
  // 上面循环有歧义——显式重写：顶行 F-2、底行 F-1
  st.setTile(x0 + 1, F - 2, PUMPKIN, 0, 0);
  st.setTile(x0 + 2, F - 2, PUMPKIN, 18, 0);
  st.setTile(x0 + 1, F - 1, PUMPKIN, 0, 18);
  st.setTile(x0 + 2, F - 1, PUMPKIN, 18, 18);
  const cutHas = gm.TILE_CUT.has(PUMPKIN);
  // 直接 breakTile 底左格 → 看残段
  g['breakTile'].call(g, x0 + 1, F - 1, true);
  let residueAfterDirectBreak = 0;
  for (let x = x0; x <= x0 + 3; x++) for (let y = F - 3; y <= F; y++) if (st.get(x, y) === PUMPKIN) residueAfterDirectBreak++;
  // 场景 B：重建后完整 tryPlace
  clearBox(); fillFloor();
  st.setTile(x0 + 1, F, GRASS, 0, 0); st.setTile(x0 + 2, F, GRASS, 0, 0);
  st.setTile(x0 + 1, F - 2, PUMPKIN, 0, 0);
  st.setTile(x0 + 2, F - 2, PUMPKIN, 18, 0);
  st.setTile(x0 + 1, F - 1, PUMPKIN, 0, 18);
  st.setTile(x0 + 2, F - 1, PUMPKIN, 18, 18);
  holdItem(wbIdx);
  stand(x0, F - 1);
  await new Promise((r) => setTimeout(r, 40));
  g.player.useTime = 0;
  g['tryPlace'].call(g, x0, F - 1, wbDef);
  let residueAfterPlace = 0;
  for (let x = x0; x <= x0 + 3; x++) for (let y = F - 3; y <= F; y++) if (st.get(x, y) === PUMPKIN) residueAfterPlace++;
  const benchAt = findTileIn(W, x0 - 1, x0 + 3, F - 3, F);
  // 场景 C：对照——南瓜只 1 格（无多格件）放工作台
  clearBox(); fillFloor();
  st.setTile(x0 + 1, F - 1, PUMPKIN, 0, 0);
  holdItem(wbIdx);
  stand(x0, F - 1);
  await new Promise((r) => setTimeout(r, 40));
  g.player.useTime = 0;
  g['tryPlace'].call(g, x0, F - 1, wbDef);
  const singleResidue = st.get(x0 + 1, F - 1) === PUMPKIN;
  const benchAtSingle = findTileIn(W, x0 - 1, x0 + 3, F - 3, F);
  inv.slots[selIdx] = savedSlot;
  return { PUMPKIN, STONE, W, cutHas, residueAfterDirectBreak, residueAfterPlace, benchAt, singleResidue, benchAtSingle };
});
fs.writeFileSync('/tmp/pile-pumpkin-diag.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
