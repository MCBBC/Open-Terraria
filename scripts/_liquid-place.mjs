// M-3 液体放置面两维建模探针（TileObjectData.LiquidPlace :1853-1907 翻正实机验证）。
// 背景：旧 liqAllow 单维布尔（缺省 false=液体中一律拒）与原版 382/382 反向；
//   翻正后基样式缺省 water=allowed/lava=notAllowed（SetupBaseObject TileObjectData.cs:1767-1768）。
// 场景（合成密封箱，端到端 Game.tryPlace）：
//   ①翻正代表件：工作台18/箱21/门10（基样式 WaterPlacement=Allowed）→ 满水中放成
//   ②水禁族：篝火215/吊灯93（显式 NotAllowed，:3326/:2409）→ 水中拒
//   ③岩浆维：箱21（缺省 NotAllowed）→ 拒；蜥蜴祭坛237（显式 LavaPlacement=Allowed :3213）→ 放成
//   ④onlyInFull 语义（基样式无数据,合成记录直打 validateAnchors 门）：半液拒/满液放/dry 拒
//   ⑤蜜/微光同走 water 维（原版 liquidType 0/2/3 同 case :1876-1884）
//   ⑦子样式液体档（M-3b：newSubTile.* → liqStyles per-style 记录,placeStyle 透传
//     validateAnchors）——药草 83 style4 水/style5 岩浆/style0 全拒（门级,药草
//     AlternateTile 豁免回落不走 anchor 路径）；黑曜石工作台 18 style14/43 岩浆放/
//     style0 拒（无在册物品,门级）；染料 227 style5 满水门槛；篝火 215 style1 水；
//     火把 4 liqStyles ↔ Game.ts 专用分支口径对拍；宝石树苗 590 非零 placeStyle
//     端到端管线（无 liqStyles 回落基记录）
//   ⑥dry 回归：工作台/箱 干地放成
//   ⑧门岩浆门（M-3c liqGateDoor 端到端）：普通门 style0 满岩浆拒/不耗品；黑曜石门
//     1458（placeStyle=19 子样式 LavaPlacement=Allowed :2245-2247）满岩浆放成
//   ⑨药草 legacy 岩浆门（M-3c liqGateHerb 端到端,Player.cs:40058/:41809-41824 定谳
//     =岩浆 only 门）：daybloom(82 style0) 满岩浆拒/不耗种；火焰花(style5 :4777-4778)
//     满岩浆+灰烬地基放成；daybloom 满水+草地基放成（原版水中可植,CheckAlch :46371
//     不杀水格——legacy 门不设水维）
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

  // ---- ⑦子样式液体档（M-3b：placeStyle → liqStyles per-style 记录）----
  // 端到端说明：liqStyles 持有族中唯一带 placeStyle>0 物品的药草 82/83/84 走
  // AlternateTile 豁免回落（anchorRec=null）不经 validateAnchors → 本段全门级直打；
  // 端到端非零 placeStyle 管线用宝石树苗 590（anchor 路径、无 liqStyles=回落基记录）。
  {
    const rawTiles = (await (await fetch('/src/data/tile-anchors.json')).json()).tiles;
    // ⑦a 药草 83（原始记录直打——基记录水/岩浆全禁 StyleAlch :4750-4752）
    const herb = rawTiles['83'];
    if (herb) {
      const hx = DRY.xa;
      const setLiq = (type, amt) => { for (let i = 0; i < herb.w; i++) st.setLiquid(hx + i, F - 1, amt, type); };
      setLiq(LIQUID_TYPE.WATER, 255);
      check('⑦a药草83 style4 满水放（:4772）', vav.validateAnchors(st, hx, F - 1, herb, 4));
      check('⑦a药草83 style5 满水拒（水禁,style5 只放岩浆 :4777）', !vav.validateAnchors(st, hx, F - 1, herb, 5));
      check('⑦a药草83 style0 满水拒（daybloom 基档 :4750）', !vav.validateAnchors(st, hx, F - 1, herb, 0));
      setLiq(LIQUID_TYPE.LAVA, 255);
      check('⑦a药草83 style5 满岩浆放（火焰花 :4777-4778）', vav.validateAnchors(st, hx, F - 1, herb, 5));
      check('⑦a药草83 style4 满岩浆拒 / style0 亦拒', !vav.validateAnchors(st, hx, F - 1, herb, 4) && !vav.validateAnchors(st, hx, F - 1, herb, 0));
      setLiq(LIQUID_TYPE.NONE, 0);
    } else check('⑦a药草83（manifest 缺 83 记录）', false);

    // ⑦b 黑曜石工作台 18 style14/43（无在册物品 → 门级；岩浆放行 :2823-2825）
    const wb = vav.anchorSpecOf(18);
    if (wb?.liqStyles) {
      const wx = DRY.xa;
      const setLiq = (type, amt) => { for (let i = 0; i < wb.w; i++) st.setLiquid(wx + i, F - 1, amt, type); };
      setLiq(LIQUID_TYPE.LAVA, 255);
      check('⑦b工作台18 style14 满岩浆放（黑曜石 :2823-2825）', vav.validateAnchors(st, wx, F - 1, wb, 14));
      check('⑦b工作台18 style43 满岩浆放', vav.validateAnchors(st, wx, F - 1, wb, 43));
      check('⑦b工作台18 style0 满岩浆拒（基档 :1768）', !vav.validateAnchors(st, wx, F - 1, wb, 0));
      setLiq(LIQUID_TYPE.NONE, 0);
    } else check('⑦b工作台18 liqStyles（缺记录）', false);

    // ⑦c 染料 227 style5 满水门槛（onlyInFull :2196）/ style7 半水放
    const dye = vav.anchorSpecOf(227);
    if (dye?.liqStyles) {
      const dx = DRY.xa;
      const setLiq = (amt) => { for (let i = 0; i < dye.w; i++) st.setLiquid(dx + i, F - 1, amt, LIQUID_TYPE.WATER); };
      setLiq(120);
      check('⑦c染料227 style5 半水拒（onlyInFull :2196）', !vav.validateAnchors(st, dx, F - 1, dye, 5));
      check('⑦c染料227 style7 半水放（Allowed :2205）', vav.validateAnchors(st, dx, F - 1, dye, 7));
      setLiq(255);
      check('⑦c染料227 style5 满水放', vav.validateAnchors(st, dx, F - 1, dye, 5));
      setLiq(0);
      check('⑦c染料227 style5 dry 拒（:1886-1904 else 支）', !vav.validateAnchors(st, dx, F - 1, dye, 5));
    } else check('⑦c染料227 liqStyles（缺记录）', false);

    // ⑦d 篝火 215 子样式 1/4/9/17/20/25 水放（:3330-3352）、style0/基档水拒
    const cf = vav.anchorSpecOf(215);
    if (cf?.liqStyles) {
      const cx2 = DRY.xa;
      // 占位矩形 = rows F-2..F-1（h=2,锚行 F=石台）
      for (let y = F - 2; y <= F - 1; y++) for (let i = 0; i < cf.w; i++) st.setLiquid(cx2 + i, y, 255, LIQUID_TYPE.WATER);
      check('⑦d篝火215 style1/4/9/17/20/25 满水放（:3330-3352）',
        [1, 4, 9, 17, 20, 25].every((s) => vav.validateAnchors(st, cx2, F - 2, cf, s)));
      check('⑦d篝火215 style0 满水拒（基档 :3324-3326）', !vav.validateAnchors(st, cx2, F - 2, cf, 0));
      check('⑦d篝火215 style2 无档回落基记录拒', !vav.validateAnchors(st, cx2, F - 2, cf, 2));
      for (let y = F - 2; y <= F - 1; y++) for (let i = 0; i < cf.w; i++) st.setLiquid(cx2 + i, y, 0, LIQUID_TYPE.NONE);
    } else check('⑦d篝火215 liqStyles（缺记录）', false);

    // ⑦e 火把 4 口径对拍（Game.ts 专用分支勿双改）：liqStyles ≡ WATER_TORCH_STYLES{8,11,17}
    const torch = vav.anchorSpecOf(4);
    if (torch?.liqStyles) {
      const keys = Object.keys(torch.liqStyles).map(Number).sort((a, b) => a - b);
      check('⑦e火把4 liqStyles ≡ {8,11,17}（Torch.ts WATER_TORCH_STYLES 对拍）', JSON.stringify(keys) === '[8,11,17]');
      check('⑦e火把4 子样式水岩浆均放 / 基档双禁（Game.ts 分支 liquid>0 恒拒等价）',
        [8, 11, 17].every((s) => torch.liqStyles[s].water === 'allowed' && torch.liqStyles[s].lava === 'allowed')
        && torch.liq.water === 'notAllowed' && torch.liq.lava === 'notAllowed');
    } else check('⑦e火把4 liqStyles（缺记录）', false);

    // ⑦f 宝石树苗 590 非零 placeStyle 端到端管线（anchor 路径、无 liqStyles → 回落基记录）
    const gemSeedIdx = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_4855_GemTreeRubySeed');
    const gemSheetTile = 590;
    if (gemSeedIdx >= 0 && rawTiles[String(gemSheetTile)]) {
      const gsTileId = idOfSheet(gemSheetTile);
      // 干地放成（基座=石台 DRY）
      await shot(gemSeedIdx, DRY.xb - 1, F - 1);
      const placedDry = (() => { for (let x = DRY.xa; x <= DRY.xb; x++) for (let y = CEIL; y <= F; y++) if (st.get(x, y) === gsTileId) return [x, y]; return null; })();
      check('⑦f宝石树苗590 placeStyle=4 干地放成（端到端管线）', placedDry !== null);
      const clearGems = () => { for (let x = DRY.xa; x <= DRY.xb; x++) for (let y = CEIL; y <= F; y++) if (st.get(x, y) === gsTileId) st.setTile(x, y, 0, 0, 0); };
      clearGems();   // 1×2 件须清整件（只清顶格留半件会堵后续场景）
      // 水中拒（590 基记录 water=notAllowed;placeStyle 非零不改变回落语义）
      for (let i = 0; i < 2; i++) st.setLiquid(DRY.xb - 1, F - 1 - i, 255, LIQUID_TYPE.WATER);
      const wetDbg = [0, 1].map((i) => `${DRY.xb - 1},${F - 1 - i}:amt=${st.liquid[st.idx(DRY.xb - 1, F - 1 - i)]},tile=${st.get(DRY.xb - 1, F - 1 - i)}`);
      await shot(gemSeedIdx, DRY.xb - 1, F - 1);
      const placedWet = (() => { for (let x = DRY.xa; x <= DRY.xb; x++) for (let y = CEIL; y <= F; y++) if (st.get(x, y) === gsTileId) return [x, y]; return null; })();
      check('⑦f宝石树苗590 placeStyle=4 满水拒（基记录 water=notAllowed）', placedWet === null);
      clearGems();
      for (let i = 0; i < 2; i++) st.setLiquid(DRY.xb - 1, F - 1 - i, 0, LIQUID_TYPE.NONE);
    } else {
      check('⑦f宝石树苗590（缺物品/记录 → 跳过端到端）', true, 'no item');
    }
  }

  // ---- ⑧门岩浆门（M-3c liqGateDoor 端到端）----
  //  场地：岩浆箱内取全空列（门 1×3 需顶锚 CEIL 石台+底锚 F 石台）。普通门=首个
  //  tile=door_closed 的在册物品（wooden door,placeStyle 缺省 0=基档岩浆禁 :1768）；
  //  黑曜石门 vid 1458（placeStyle=19 子样式岩浆放 :2245-2247）。失败路径必须不耗品。
  {
    const doorKey = tiles.TILE_DEFS[TIDS.door]?.key;
    const doorIdx = items.ITEM_DEFS.findIndex((it) => it?.tile === doorKey && !it?.placeStyle);   // style0 门（基档）
    const obsIdx = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_1458_obsidian_door');
    const colFree = (xa, xb) => {
      for (let x = xa; x <= xb; x++) {
        let ok = true;
        for (let y = CEIL + 1; y <= F - 1 && ok; y++) if (st.isActive(x, y)) ok = false;
        if (ok) return x;
      }
      return -1;
    };
    const hasDoorIn = (x) => {
      for (let y = CEIL; y <= F; y++) if (st.inBounds(x, y) && st.get(x, y) === TIDS.door) return true;
      return false;
    };
    if (doorIdx >= 0) {
      const c1 = colFree(LT_.xa, LT_.xb);
      if (c1 >= 0) {
        const before = inv.slots[selIdx].stack;
        await shot(doorIdx, c1, CEIL + 1, [c1 + 1, F - 1]);
        const consumed = inv.slots[selIdx].stack < before;
        check('⑧普通门(style0)满岩浆拒（基档 LavaPlacement=NotAllowed :1768）',
          !hasDoorIn(c1) && !consumed, `col=${c1} consumed=${consumed}`);
      } else check('⑧普通门岩浆拒（无全空列 → 跳过）', true, 'no free col');
    } else check('⑧普通门岩浆拒（缺放置物品）', true, 'no item');
    if (obsIdx >= 0) {
      const c2 = colFree(LT_.xa, LT_.xb);
      if (c2 >= 0) {
        await shot(obsIdx, c2, CEIL + 1, [c2 + 1, F - 1]);
        check('⑧黑曜石门1458(placeStyle=19)满岩浆放成（:2245-2247）', hasDoorIn(c2),
          `col=${c2} ps=${items.ITEM_DEFS[obsIdx].placeStyle}`);
      } else check('⑧黑曜石门岩浆放（无全空列 → 跳过）', true, 'no free col');
    } else check('⑧黑曜石门岩浆放（vi_1458_obsidian_door 缺在册物品）', true, 'no item');
  }

  // ---- ⑨药草 legacy 岩浆门（M-3c liqGateHerb 端到端,岩浆 only 门）----
  //  种子物品 = vi_307_daybloom_seeds(placeStyle 0)/vi_312_fireblossom_seeds(5)。
  //  原版定谳：createTile=82 被 CustomCanPlace 排除（Player.cs:40083）→ legacy 链,
  //  液体门 = IsBlockedByLava（:41809-41824 岩浆 only）→ CheckLiquidPlacement
  //  per-style 档。放置成败外,还须过 CheckAlch 地基列（Game.ts ALCH_GROUND_RUNTIME）：
  //  火焰花 case5 地基=灰烬(57)/灰烬草(633) → 岩浆箱地板换灰烬；daybloom case0
  //  地基=草族(2/109/477/492) → 水箱地板换草。
  {
    const seedDay = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_307_daybloom_seeds');
    const seedFire = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_312_fireblossom_seeds');
    const GRASS = idOfSheet(2), ASH = idOfSheet(57), HERB = idOfSheet(83);
    const colFree = (xa, xb) => {
      for (let x = xa; x <= xb; x++) {
        let ok = true;
        for (let y = CEIL + 1; y <= F - 1 && ok; y++) if (st.isActive(x, y)) ok = false;
        if (ok) return x;
      }
      return -1;
    };
    const herbAt = (x, y) => st.inBounds(x, y) && st.get(x, y) === HERB
      ? Math.trunc(st.frameX[st.idx(x, y)] / 18) : null;
    // ⑨a daybloom 满岩浆拒（style0 基档 lava=NotAllowed :4752）+ 不耗种
    if (seedDay >= 0) {
      const c = colFree(LT_.xa, LT_.xb);
      if (c >= 0) {
        const before = inv.slots[selIdx].stack;
        await shot(seedDay, c, F - 1);
        const consumed = inv.slots[selIdx].stack < before;
        check('⑨a daybloom(82 style0) 满岩浆拒（IsBlockedByLava :41809→CheckLiquidPlacement）',
          herbAt(c, F - 1) === null && !consumed, `col=${c} consumed=${consumed}`);
      } else check('⑨a daybloom 岩浆拒（无全空列 → 跳过）', true, 'no free col');
    } else check('⑨a daybloom 岩浆拒（缺种子物品）', true, 'no item');
    // ⑨b 火焰花 style5 满岩浆+灰烬地基放成（liqStyles[5].lava=allowed :4777-4778）
    if (seedFire >= 0) {
      const c = colFree(LT_.xa, LT_.xb);
      if (c >= 0) {
        if (ASH >= 0) st.setTile(c, F, ASH, 0, 0);   // CheckAlch case5 地基列（Game.ts ALCH_GROUND_RUNTIME[5]）
        await shot(seedFire, c, F - 1);
        check('⑨b 火焰花(82 style5) 满岩浆+灰烬地基放成（:4777-4778）', herbAt(c, F - 1) === 5,
          `col=${c} got=${herbAt(c, F - 1)}`);
      } else check('⑨b 火焰花岩浆放（无全空列 → 跳过）', true, 'no free col');
    } else check('⑨b 火焰花岩浆放（缺种子物品）', true, 'no item');
    // ⑨c daybloom 满水+草地基放成（legacy 门【岩浆 only】,水/蜜/微光不设门;
    //  CheckAlch case0 亦只杀岩浆格 :46146-46148）
    if (seedDay >= 0) {
      const c = colFree(WT.xa, WT.xb);
      if (c >= 0) {
        if (GRASS >= 0) st.setTile(c, F, GRASS, 0, 0);   // CheckAlch case0 地基列
        await shot(seedDay, c, F - 1);
        check('⑨c daybloom(style0) 满水+草地基放成（水中可植,原版水不设门）', herbAt(c, F - 1) === 0,
          `col=${c} got=${herbAt(c, F - 1)}`);
      } else check('⑨c daybloom 水放（无全空列 → 跳过）', true, 'no free col');
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
