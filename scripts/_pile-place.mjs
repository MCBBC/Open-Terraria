// 小石块(185 SmallPiles) vs 家具放置占位豁免面探针（TileObject.cs:357/:84-86 对齐）
// 流程:①在合成平地上找到工作台可放锚点 A 与其点击格 C
//      ②把障碍(tileCut 杂草/BreakableWhenPlacing 小石块/石块对照)放进 A 占位矩形内,
//        用同一点击格 C 单发放置——石块必须被拒,杂草/小石块必须清除并放成。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (23).json';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
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
  const vav = await import('/src/world/TileAnchorValidator.ts');
  const idOfSheet = (sh) => {
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i;
    return -1;
  };
  const PILE = idOfSheet(185), STONE = idOfSheet(1), WEED = idOfSheet(3);
  let W = -1;
  for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.key === 'workbench') W = i;
  let wbDef = null;
  for (let i = 0; i < items.ITEM_DEFS.length; i++) {
    if (items.ITEM_DEFS[i]?.tile === tiles.TILE_DEFS[W]?.key) { wbDef = items.ITEM_DEFS[i]; break; }
  }
  if (!wbDef || W < 0 || PILE < 0 || STONE < 0 || WEED < 0) {
    return { fail: 'resolve', PILE, STONE, WEED, W };
  }
  const wbIdx = items.ITEM_DEFS.indexOf(wbDef);
  // 合成场景：中线高空,无天然液体/建筑干扰
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 20), st.w - 20);
  const F = Math.floor(st.h / 2) - 260;   // 抬到天空层
  if (!st.inBounds(x0 + 6, F + 2)) return { fail: 'bounds', x0, F };
  const clearBox = () => { for (let x = x0 - 2; x <= x0 + 6; x++) for (let y = F - 5; y <= F + 2; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    const i2 = st.idx(x, y);
    if (st.liquid[i2] > 0) st.liquid[i2] = 0;
  } };
  const fillFloor = () => { for (let x = x0; x <= x0 + 4; x++) st.setTile(x, F, STONE, 0, 0); };
  const wipe = () => { clearBox(); fillFloor(); };
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
  // ---- ①找基准锚点：裸地放置直到扫到工作台 ----
  wipe();
  holdItem(wbIdx);
  let base = null;
  for (let cx = x0 - 2; cx <= x0 + 6 && !base; cx++) {
    for (let cy = F - 3; cy <= F && !base; cy++) {
      stand(cx, cy);
      await new Promise((r) => setTimeout(r, 40));
      g['tryPlace'].call(g, cx, cy, wbDef);
      const p = findTileIn(W, x0 - 2, x0 + 6, F - 5, F + 2);
      if (p) base = { click: [cx, cy], placed: p };
      wipe();
    }
  }
  if (!base) return { fail: 'no-base-anchor', x0, F };
  const rec18 = vav.anchorSpecOf(18);
  const [qx, qy] = base.placed;
  const rw = rec18 ? rec18.w : 2, rh = rec18 ? rec18.h : 1;
  // 障碍落点：占位矩形内取一格(矩形不足时取脚点本身)
  const ox = Math.min(qx + rw - 1, qx + 1), oy = qy;
  // ---- ②同点击格单发对拍 ----
  const singleShot = async (mode) => {
    wipe();
    if (mode !== 'bare') {
      const tid = mode === 'pile' ? PILE : mode === 'stone' ? STONE : WEED;
      st.setTile(ox, oy, tid, 0, 0);
    }
    stand(base.click[0], base.click[1]);
    await new Promise((r) => setTimeout(r, 40));
    holdItem(wbIdx);
    g.player.useTime = 0;
    g['tryPlace'].call(g, base.click[0], base.click[1], wbDef);
    const placedHere = findTileIn(W, qx - 2, qx + rw + 1, oy - 2, oy + rh + 1) !== null;
    const cleanCleared = st.get(ox, oy) !== { pile: PILE, stone: STONE, weed: WEED }[mode];
    return { mode, placedHere, cleanCleared, obsLeft: st.get(ox, oy) };
  };
  const res = {
    ids: { pile: PILE, stone: STONE, weed: WEED, workbench: W },
    itemKey: wbDef.key, anchorProbe: vav.validateAnchors(st, qx, qy, rec18),
    base,
    bare: await singleShot('bare'),
    pile: await singleShot('pile'),
    weed: await singleShot('weed'),
    stone: await singleShot('stone'),
  };
  res.verdict = res.base.placed && res.bare.placedHere && res.pile.placedHere && res.pile.cleanCleared
    && res.weed.placedHere && res.weed.cleanCleared && !res.stone.placedHere ? 'PASS' : 'FAIL';
  inv.slots[selIdx] = savedSlot;
  return res;
});
fs.writeFileSync('/tmp/pile-place.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
