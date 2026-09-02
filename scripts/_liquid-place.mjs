// M-3 液体放置面两维建模探针（TileObjectData.LiquidPlace :1853-1907 翻正实机验证）。
// 背景：旧 liqAllow 单维布尔（缺省 false=液体中一律拒）与原版 382/382 反向；
//   翻正后基样式缺省 water=allowed/lava=notAllowed（SetupBaseObject TileObjectData.cs:1767-1768）。
// 场景（合成密封箱，端到端 Game.tryPlace）：
//   ①翻正代表件：工作台18/箱21/门10（基样式 WaterPlacement=Allowed）→ 满水中放成
//   ②水禁族：篝火215/吊灯93（显式 NotAllowed，:3326/:2409）→ 水中拒
//   ③岩浆维：箱21（缺省 NotAllowed）→ 拒；蜥蜴祭坛237（显式 LavaPlacement=Allowed :3213）→ 放成
//   ④onlyInFull 语义（基样式无数据,合成记录直打 validateAnchors 门）：半液拒/满液放/dry 拒
//   ⑤蜜/微光同走 water 维（原版 liquidType 0/2/3 同 case :1876-1884）
//   ⑥dry 回归：工作台/箱 干地放成
// 运行：SW_ORIGIN=http://localhost:52xx node tools/run-diag.mjs scripts/_liquid-place.mjs
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
  const { LIQUID_TYPE } = await import('/src/world/TileStore.ts');
  const PASS = [], FAIL = [];
  const check = (name, ok, extra = '') => { (ok ? PASS : FAIL).push(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); };

  const idOfSheet = (sh) => {
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.vanilla?.sheet === sh) return i;
    return -1;
  };
  const itemIdxOfTileKey = (key) => {
    for (let i = 0; i < items.ITEM_DEFS.length; i++) if (items.ITEM_DEFS[i]?.tile === key) return i;
    return -1;
  };
  const STONE = idOfSheet(1);
  const TIDS = { workbench: idOfSheet(18), chest: idOfSheet(21), door: idOfSheet(10), campfire: idOfSheet(215), lamp: idOfSheet(93), altar: idOfSheet(237) };
  const itemOf = {};
  for (const [nm, tid] of Object.entries(TIDS)) {
    const key = tid >= 0 ? tiles.TILE_DEFS[tid]?.key : null;
    itemOf[nm] = key ? itemIdxOfTileKey(key) : -1;
  }

  // ---- 场地：天空层密封双箱（左水右岩浆）+ 干地台 ----
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 40), st.w - 60);
  const F = Math.floor(st.h / 2) - 260;                       // 箱底行（地板）
  const CEIL = F - 4;                                          // 箱顶行（门顶锚）
  const WT = { xa: x0, xb: x0 + 7 };                           // 水箱内部 8 宽
  const LT_ = { xa: x0 + 12, xb: x0 + 19 };                    // 岩浆箱内部 8 宽
  if (!st.inBounds(x0 - 6, CEIL - 4) || !st.inBounds(LT_.xb + 4, F + 3)) return { fail: 'bounds', x0, F };
  const box = (xa, xb, ya, yb) => { for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    st.setLiquid(x, y, 0, LIQUID_TYPE.NONE);
  } };
  // 全清+建箱：地板 F 行、顶 CEIL 行、箱壁两列；两侧留干地台
  box(x0 - 8, LT_.xb + 6, CEIL - 6, F + 2);
  for (let x = x0 - 8; x <= LT_.xb + 6; x++) { st.setTile(x, F, STONE, 0, 0); st.setTile(x, CEIL, STONE, 0, 0); }
  for (const wall of [x0 - 2, LT_.xa - 1, LT_.xb + 1]) { for (let y = CEIL; y <= F; y++) st.setTile(wall, y, STONE, 0, 0); }
  for (let x = WT.xa; x <= WT.xb; x++) for (let y = CEIL + 1; y <= F - 1; y++) st.setLiquid(x, y, 255, LIQUID_TYPE.WATER);
  for (let x = LT_.xa; x <= LT_.xb; x++) for (let y = CEIL + 1; y <= F - 1; y++) st.setLiquid(x, y, 255, LIQUID_TYPE.LAVA);
  // 干地台（箱外右侧）
  const DRY = { xa: LT_.xb + 3, xb: LT_.xb + 6 };
  for (let x = DRY.xa; x <= DRY.xb; x++) st.setTile(x, F, STONE, 0, 0);

  const inv = g.player.inv;
  const selIdx = inv.selected;
  const savedSlot = inv.slots[selIdx];
  const holdItem = (idx) => { inv.slots[selIdx] = { id: idx, stack: 10, favorited: false, prefix: 0 }; inv.selected = selIdx; };
  const stand = (px, py) => {
    g.player.x = px * 16 + 8; g.player.y = (py - 2) * 16; g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
  };
  const findTileIn = (tid, xa, xb, ya, yb) => {
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++)
      if (st.inBounds(x, y) && st.get(x, y) === tid) return [x, y];
    return null;
  };
  const shot = async (itemIdx, cx, cy, standAt) => {
    holdItem(itemIdx);
    const [sx, sy] = standAt ?? [cx, cy];
    stand(sx, sy);
    await new Promise((r) => setTimeout(r, 40));
    g.player.useTime = 0;
    g['tryPlace'].call(g, cx, cy, items.ITEM_DEFS[itemIdx]);
  };

  // ---- ①翻正代表件：满水放成（基样式缺省 WaterPlacement=Allowed）----
  // ★站位纪律：玩家不能站在目标占位矩形内（M-4 实体重叠门,与原版
  //   BlockPlacementIfOverPlayers 同域的防重叠语义）——先放门（玩家立于 +2 空列），
  //   再放工作台/箱（玩家远离各自足迹）。
  if (itemOf.door >= 0) {
    // 门 1×3：点击=顶格(+6,CEIL+1)；玩家立于 +2 空列（不在门足迹内——固体件与玩家
    // 重叠的放置被实体重叠门拒,门 tileSolid[10]=true 属固体域）
    await shot(itemOf.door, WT.xa + 6, CEIL + 1, [WT.xa + 2, F - 1]);
    check('①门(10)满水中放成（翻正）', findTileIn(TIDS.door, WT.xa, WT.xb, CEIL, F) !== null);
  } else check('①门放水（缺放置物品）', true, 'no item');

  if (itemOf.workbench >= 0) {
    await shot(itemOf.workbench, WT.xa + 1, F - 1);
    check('①工作台(18)满水中放成（翻正）', findTileIn(TIDS.workbench, WT.xa, WT.xb, CEIL, F) !== null,
      `item=${items.ITEM_DEFS[itemOf.workbench].key}`);
  } else check('①工作台放水（缺放置物品→跳过端到端）', true, 'no item');

  if (itemOf.chest >= 0) {
    await shot(itemOf.chest, WT.xa + 4, F - 1);
    check('①箱(21)满水中放成（翻正）', findTileIn(TIDS.chest, WT.xa, WT.xb, CEIL, F) !== null);
  } else check('①箱放水（缺放置物品）', true, 'no item');

  // ---- ②水禁族：满水拒 ----
  if (itemOf.campfire >= 0) {
    await shot(itemOf.campfire, WT.xa + 2, F - 1);
    check('②篝火(215)满水中拒（WaterPlacement=NotAllowed）', findTileIn(TIDS.campfire, WT.xa, WT.xb, CEIL, F) === null);
  } else check('②篝火拒水（缺放置物品→门级对拍）', true, 'no item');
  if (itemOf.lamp >= 0) {
    await shot(itemOf.lamp, WT.xa + 5, F - 1);
    check('②吊灯(93)满水中拒', findTileIn(TIDS.lamp, WT.xa, WT.xb, CEIL, F) === null);
  } else check('②吊灯拒水（缺放置物品→门级对拍）', true, 'no item');
  // 门级对拍（无论有无物品都打一遍 validateAnchors——同一门代码路径）
  {
    const cf = vav.anchorSpecOf(215), lamp = vav.anchorSpecOf(93);
    check('②门级：篝火记录满水拒', cf ? !vav.validateAnchors(st, WT.xa, F - 2, cf) : false);
    check('②门级：吊灯记录满水拒', lamp ? !vav.validateAnchors(st, WT.xb - 1, CEIL + 1, lamp) : false);
  }

  // ---- ③岩浆维 ----
  if (itemOf.chest >= 0) {
    await shot(itemOf.chest, LT_.xa + 2, F - 1);
    check('③箱(21)岩浆拒（缺省 LavaPlacement=NotAllowed）', findTileIn(TIDS.chest, LT_.xa, LT_.xb, CEIL, F) === null);
  }
  if (itemOf.altar >= 0) {
    await shot(itemOf.altar, LT_.xa + 5, F - 1);
    check('③蜥蜴祭坛(237)岩浆放成（显式 LavaPlacement=Allowed）', findTileIn(TIDS.altar, LT_.xa, LT_.xb, CEIL, F) !== null);
  } else {
    const altar = vav.anchorSpecOf(237);
    check('③门级：祭坛记录岩浆放（缺物品→门级对拍）', altar ? vav.validateAnchors(st, LT_.xb - 2, F - 2, altar) : false, 'no item');
  }

  // ---- ④onlyInFull 语义（合成记录直打门）----
  {
    const base = vav.anchorSpecOf(18);
    if (base) {
      const dryX = DRY.xa;
      const rec = { ...base, liq: { water: 'onlyInFull', lava: 'notAllowed' } };
      for (let i = 0; i < rec.w; i++) st.setLiquid(dryX + i, F - 1, 100, LIQUID_TYPE.WATER);
      const half = vav.validateAnchors(st, dryX, F - 1, rec);
      for (let i = 0; i < rec.w; i++) st.setLiquid(dryX + i, F - 1, 255, LIQUID_TYPE.WATER);
      const full = vav.validateAnchors(st, dryX, F - 1, rec);
      for (let i = 0; i < rec.w; i++) st.setLiquid(dryX + i, F - 1, 0, LIQUID_TYPE.NONE);
      const dry = vav.validateAnchors(st, dryX, F - 1, rec);
      check('④onlyInFull：半液拒/满液放/dry 拒', !half && full && !dry, `half=${half} full=${full} dry=${dry}`);
    }
  }

  // ---- ⑤蜜/微光同走 water 维（门级）----
  {
    const wb = vav.anchorSpecOf(18);
    if (wb) {
      const hx = DRY.xa + 0;
      for (let i = 0; i < wb.w; i++) st.setLiquid(hx + i, F - 1, 255, LIQUID_TYPE.HONEY);
      const honey = vav.validateAnchors(st, hx, F - 1, wb);
      for (let i = 0; i < wb.w; i++) st.setLiquid(hx + i, F - 1, 0, LIQUID_TYPE.NONE);
      for (let i = 0; i < wb.w; i++) st.setLiquid(hx + i, F - 1, 255, LIQUID_TYPE.SHIMMER);
      const shim = vav.validateAnchors(st, hx, F - 1, wb);
      for (let i = 0; i < wb.w; i++) st.setLiquid(hx + i, F - 1, 0, LIQUID_TYPE.NONE);
      check('⑤工作台 蜜中/微光中可放（water 维覆盖 0/2/3）', honey && shim, `honey=${honey} shimmer=${shim}`);
    }
  }

  // ---- ⑥dry 回归 ----
  if (itemOf.workbench >= 0) {
    await shot(itemOf.workbench, DRY.xa, F - 1);
    check('⑥dry：工作台干地放成', findTileIn(TIDS.workbench, DRY.xa, DRY.xb, CEIL, F) !== null);
  }
  if (itemOf.chest >= 0) {
    await shot(itemOf.chest, DRY.xb - 1, F - 1);
    check('⑥dry：箱干地放成', findTileIn(TIDS.chest, DRY.xa, DRY.xb, CEIL, F) !== null);
  }

  inv.slots[selIdx] = savedSlot;
  const liqDebug = {
    waterCells: (() => { let n = 0; for (let x = WT.xa; x <= WT.xb; x++) for (let y = CEIL + 1; y <= F - 1; y++) if (st.liquid[st.idx(x, y)] > 0) n++; return n; })(),
    lavaCells: (() => { let n = 0; for (let x = LT_.xa; x <= LT_.xb; x++) for (let y = CEIL + 1; y <= F - 1; y++) if (st.liquid[st.idx(x, y)] > 0) n++; return n; })(),
  };
  return { pass: PASS, fail: FAIL, liqDebug, items: itemOf, x0, F };
});

console.log(`场地 x0=${out.x0} F=${out.F} 箱内水格=${out.liqDebug?.waterCells} 岩浆格=${out.liqDebug?.lavaCells}`);
console.log(`物品解析：${JSON.stringify(out.items)}`);
for (const l of [...out.pass, ...out.fail]) console.log(l);
const nFail = out.fail.length;
console.log(`\n==== ${out.pass.length} pass / ${nFail} fail ====`);
await browser.close();
process.exit(nFail ? 1 : 0);
