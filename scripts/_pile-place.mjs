// 小石块(185 SmallPiles) vs 家具放置占位豁免面探针（TileObject.cs:357/:84-86 对齐）
// 场景:合成平地+工作台,足迹行内分别压 bare/小石块/石块(对照)/杂草(tileCut 对照)
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
  const idOfSheet = (sh) => {
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i;
    return -1;
  };
  const PILE = idOfSheet(185);   // SmallPiles 微小石块
  const STONE = idOfSheet(1);    // 石块（阻挡对照）
  const WEED = idOfSheet(3);     // 杂草 Plants（tileCut 对照）
  let W = -1;
  for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.key === 'workbench') W = i;
  let wbId = -1, wbDef = null;
  const cands = [];
  for (let i = 0; i < items.ITEM_DEFS.length; i++) {
    const d = items.ITEM_DEFS[i];
    const k = String(d?.key ?? ''), t = String(d?.tile ?? '');
    if (k.includes('workbench') || t.includes('workbench') || k === 'vi_22_workbench') cands.push([i, k, t]);
    if ((d?.tile === tiles.TILE_DEFS[W]?.key || t.endsWith('_workbench')) && !wbDef) { wbDef = d; wbId = i; }
  }
  if (!wbDef && items.ITEM_BY_KEY['workbench'] !== undefined) {
    wbId = items.ITEM_BY_KEY['workbench']; wbDef = items.ITEM_DEFS[wbId];
  }
  if (!wbDef || W < 0 || PILE < 0 || STONE < 0 || WEED < 0) return { fail: 'id resolve', PILE, STONE, WEED, W, cands };
  // 合成场景：x0 中线高空
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 20), st.w - 20);
  const F = Math.floor(st.h / 2);
  if (!st.inBounds(x0 + 6, F + 1)) return { fail: 'bounds', x0, F };
  const clearBox = () => { for (let x = x0 - 1; x <= x0 + 6; x++) for (let y = F - 3; y <= F + 1; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    const i2 = st.idx(x, y);
    if (st.liquid[i2] > 0 || st.isPlatform?.(x, y)) st.liquid[i2] = 0;
  } };
  const reset = (mode) => {
    clearBox();
    for (let x = x0; x <= x0 + 4; x++) st.setTile(x, F, STONE, 0, 0);      // 地面行
    const obs = mode === 'pile' ? PILE : mode === 'stone' ? STONE : mode === 'weed' ? WEED : -1;
    if (obs >= 0) st.setTile(x0 + 1, F - 1, obs, 0, 0);                    // 足迹行内障碍格
  };
  const foundPlaced = (expectTid) => {
    for (let x = x0 - 1; x <= x0 + 6; x++) for (let y = F - 3; y <= F - 1; y++) if (st.get(x, y) === expectTid) return [x, y];
    return null;
  };
  const inv = g.player.inv;
  const selIdx = inv.selected;
  const savedSlot = inv.slots[selIdx];
  let dirtId = items.ITEM_BY_KEY['stone_block'] ?? -1;
  let dirtDef = dirtId >= 0 ? items.ITEM_DEFS[dirtId] : null;
  if (!dirtDef) {
    for (let i = 0; i < items.ITEM_DEFS.length; i++) {
      if (items.ITEM_DEFS[i]?.tile === tiles.TILE_DEFS[STONE]?.key) { dirtId = i; dirtDef = items.ITEM_DEFS[i]; break; }
    }
  }
  const DIAG = { wbKey: wbDef?.key, wbTile: wbDef?.tile, dirtOk: !!dirtDef };
  const attempt = async (mode, useDef, holdId, expectTid) => {
    inv.slots[selIdx] = { id: holdId, stack: 10, favorited: false, prefix: 0 };
    inv.selected = selIdx;
    reset(mode);
    let okAt = null, err = null;
    for (let cx = x0 - 2; cx <= x0 + 6 && !okAt; cx++) {
      for (let cy = F - 2; cy <= F && !okAt; cy++) {
        g.player.x = cx * 16 + 8; g.player.y = (F - 3) * 16 - 8;   // 站到目标旁（放置有触达半径门）
        g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
        await new Promise((r) => setTimeout(r, 40));   // 物理帧同步（触碰达半径门用实时坐标）
        if (!useDef) break;
        try { g['tryPlace'].call(g, cx, cy, useDef); } catch (e) { err = String(e); }
        const p = expectTid >= 0 ? foundPlaced(expectTid) : foundPlaced(expectTid);
        if (p) okAt = [cx, cy];
        reset(mode);   // 复位进下一次尝试
      }
    }
    if (!okAt) { return { placedOk: false, err }; }
    // 成功后重放一次并检查障碍物清除
    reset(mode);
    g.player.x = okAt[0] * 16 + 8; g.player.y = (F - 3) * 16 - 8; g.player.vx = 0; g.player.vy = 0;
    g.player.useTime = 0;
    g['tryPlace'].call(g, okAt[0], okAt[1], wbDef);
    const p2 = foundPlaced();
    let removed = true;
    if (mode === 'pile') removed = st.get(x0 + 1, F - 1) !== PILE;
    if (mode === 'weed') removed = st.get(x0 + 1, F - 1) !== WEED;
    if (mode === 'stone') removed = false;
    if (p2 === null) removed = false;
    return { placedOk: true, at: okAt, obstructRemoved: removed };
  };
  // 直接单元调用锚点验证器，隔离“是闸门拒绝还是 tryPlace 前置门拦截”
  const vav = await import('/src/world/TileAnchorValidator.ts');
  const rec18 = vav.anchorSpecOf(18);
  reset('bare');
  const vaBare = rec18 ? vav.validateAnchors(st, x0 + 1, F - 1, rec18) : 'no-rec';
  reset('pile');
  const vaPile = rec18 ? vav.validateAnchors(st, x0 + 1, F - 1, rec18) : 'no-rec';
  // 存档写位探针：观察 bare 场景 tryPlace 是否真正写格
  const writes = [];
  const origSet = st.setTile.bind(st);
  st.setTile = (...a) => { writes.push([a[0], a[1], a[2]]); return origSet(...a); };
  g.player.x = (x0 + 1) * 16; g.player.y = (F - 3) * 16 - 8; g.player.vx = 0; g.player.vy = 0;
  g.player.useTime = 0;
  await new Promise((r) => setTimeout(r, 40));
  g['tryPlace'].call(g, x0 + 1, F - 1, wbDef);
  st.setTile = origSet;
  const res = {
    ids: { pile: PILE, stone: STONE, weed: WEED, workbench: W },
    DIAG,
    anchorProbe: { recW: rec18 ? { w: rec18.w, h: rec18.h } : null, vaBare, vaPile, writes },
    sanity: await attempt('bare', dirtDef, dirtId, STONE),
    bare: await attempt('bare', wbDef, items.ITEM_DEFS.indexOf(wbDef), W),
    pile: await attempt('pile', wbDef, items.ITEM_DEFS.indexOf(wbDef), W),
    stone: await attempt('stone', wbDef, items.ITEM_DEFS.indexOf(wbDef), W),
    weed: await attempt('weed', wbDef, items.ITEM_DEFS.indexOf(wbDef), W),
  };
  res.verdict = res.bare.placedOk && res.pile.placedOk && res.pile.obstructRemoved
    && !res.stone.placedOk && res.weed.placedOk ? 'PASS' : 'FAIL';
  inv.slots[selIdx] = savedSlot;
  return res;
});
fs.writeFileSync('/tmp/pile-place.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
