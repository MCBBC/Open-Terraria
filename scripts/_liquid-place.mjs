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
//   ⑩legacy 岩浆门（★备1 liqGateLegacy 端到端,Player.cs:40058 头门 + IsBlockedByLava
//     :41809-41824 全量定谳）：石块/泥土（tileSolid 短路 :41815-41817）满岩浆拒/满水放
//     （legacy 门岩浆 only=EmptyTile 语义）；平台 19（tileSolid[19]=true Main.cs:8032）
//     满岩浆拒/满水放；蛛网 150→tile51（legacy 无 TileObjectData → 静态 LiquidPlace
//     回落 TileObjectData.cs:5045-5062,tileLavaDeath[51] → 拒）
//   ⑪alch 岩浆熟转换（★备5 alchBloom,CheckAlch case 5 WorldGen.cs:46446-46474）：
//     83 col5 满岩浆(>16) → 84；84 岩浆≤16 → 83；82 不转换
//   ⑫门层1（★备3 liqGateDoor·层1,Player.cs:40058 tileSolid[10]=true Main.cs:8027）：
//     黑曜石门点岩浆格=恒拒（tileSolid 短路比逐格门严一格）；点干格+底格岩浆=放成
//     （per-style 19 LavaPlacement=Allowed TileObjectData.cs:2245-2247 逐格门域）
//   ⑬绳索液体门（★ropeLavaGate 十四批）：下延遇岩浆截断（CheckRopeUsability
//     Player.cs:41835 同位同语义）；点岩浆格拒（liqGateLegacy 静态回落
//     tileLavaDeath[213] Main.cs:8292）+不耗品；满水格放成+液体保留（tileWaterDeath[213]
//     全表未置 Main.cs:8200-8206/:8448/:9643/:9647=绳水共存）；干地下延回归
//   ⑭液体零写入终态（★十四批备A 清偿=原版最终态）：固体件植满水格液体【驻留】不灭
//     不迁（⑭a 同步即断）+放置后挖块→邻液回流（⑭b,TileFrame→AddWater :82621）；
//     非固体保留面=①b 工作台占格液体
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
  // 同步版（无 40ms 等待）：⑬a 场地凹槽会被液体模拟在等待期回灌,须即设即放
  const shotNow = (itemIdx, cx, cy, standAt) => {
    holdItem(itemIdx);
    const [sx, sy] = standAt ?? [cx, cy];
    stand(sx, sy);
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
    // ★dispSolidGate（十四批）非固体保留面：工作台植入后占格液体保留（原版放置链
    //  全程不动液体,PlaceTile WorldGen.cs:59499-59501 只清 Tile|TilePaint|Slope）
    if (findTileIn(TIDS.workbench, WT.xa, WT.xb, CEIL, F) !== null) {
      const wbCells = [];
      for (let x = WT.xa; x <= WT.xb; x++) for (let y = CEIL; y <= F; y++)
        if (st.inBounds(x, y) && st.get(x, y) === TIDS.workbench) wbCells.push([x, y]);
      const wbWet = wbCells.filter(([x, y]) => st.liquid[st.idx(x, y)] > 0).length;
      const wbDef = tiles.TILE_DEFS[TIDS.workbench];
      const rowMap = [];
      for (let x = WT.xa; x <= WT.xb; x++) rowMap.push(`${x}:${st.get(x, F - 1)}/${st.liquid[st.idx(x, F - 1)]}`);
      check('①b 工作台占格液体保留（dispSolidGate 非固体不挤,Liquid.cs:1171-1173 驻留）',
        wbCells.length > 0 && wbWet === wbCells.length,
        `cells=${wbCells.length} wet=${wbWet} solid=${wbDef?.solid} plat=${wbDef?.platform} rowF-1=[${rowMap.join(' ')}]`);
    }
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
        // ★⑫（备3 层1）：点岩浆格 → tileSolid[10] 短路（:40058→:41815-41817,
        //  Main.cs:8027）恒拒——比逐格两维门严一格,黑曜石 19 Allowed 也轮不到
        const beforeL1 = inv.slots[selIdx].stack;
        await shot(obsIdx, c2, CEIL + 1, [c2 + 1, F - 1]);
        const consumedL1 = inv.slots[selIdx].stack < beforeL1;
        check('⑫黑曜石门1458 点岩浆格=拒（tileSolid[10] 短路 :41815,比逐格门宽一格）',
          !hasDoorIn(c2) && !consumedL1, `col=${c2} consumed=${consumedL1}`);
        // per-style 允许域复验：点击【干格】+ 足迹内另一格岩浆 → 层1 不拦,
        // 逐格门 style19 lava=Allowed（TileObjectData.cs:2245-2247）放成
        const c3 = colFree(LT_.xa, LT_.xb);
        if (c3 >= 0) {
          for (let y = CEIL + 1; y <= F - 1; y++) st.setLiquid(c3, y, 0, LIQUID_TYPE.NONE);
          st.setLiquid(c3, F - 1, 255, LIQUID_TYPE.LAVA);   // 仅足迹底格岩浆
          await shot(obsIdx, c3, F - 2, [c3 + 1, F - 1]);   // 点击=中格（干）,锚=c3 的 1×3=F-3..F-1
          check('⑫黑曜石门1458 点干格+足迹底格岩浆=放成（per-style :2245-2247）', hasDoorIn(c3),
            `col=${c3}`);
          // 复原岩浆箱（后续 dry 回归与统计用）
          for (let y = CEIL + 1; y <= F - 1; y++) st.setLiquid(c3, y, 255, LIQUID_TYPE.LAVA);
          if (hasDoorIn(c3)) for (let y = CEIL; y <= F; y++) if (st.get(c3, y) === TIDS.door) st.setTile(c3, y, 0, 0, 0);
        } else check('⑫黑曜石门干格点击（无全空列 → 跳过）', true, 'no free col');
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
    // ⑨b 火焰花 style5 满岩浆+灰烬地基放成（liqStyles[5].lava=allowed :4777-4778）。
    //  ★新账清偿（dispSolidGate,十四批）：此前写循环无差别挤液 → 植入后本格岩浆=0,
    //  放置级联 CheckAlch case5 观察不到岩浆,熟转 83→84 不在放置级联触发（原版植入后
    //  本格保有岩浆,CheckAlch 当场转 84——WorldGen.cs:46455-46464）。现非固体件不挤
    //  → 本格岩浆保留,断言升级为：植入后【当场转 84 col5】+ 本格岩浆保留（liq>0）。
    if (seedFire >= 0) {
      const c = colFree(LT_.xa, LT_.xb);
      if (c >= 0) {
        if (ASH >= 0) st.setTile(c, F, ASH, 0, 0);   // CheckAlch case5 地基列（Game.ts ALCH_GROUND_RUNTIME[5]）
        await shot(seedFire, c, F - 1);
        const HERB83T = st.get(c, F - 1);
        const fxCol = st.inBounds(c, F - 1) ? Math.trunc(st.frameX[st.idx(c, F - 1)] / 18) : -1;
        const liqAfter = st.inBounds(c, F - 1) ? st.liquid[st.idx(c, F - 1)] : -1;
        check('⑨b 火焰花(83 style5) 满岩浆+灰烬地基放成→当场转 84（CheckAlch :46455-46464;dispSolidGate 岩浆保留）',
          HERB83T === idOfSheet(84) && fxCol === 5 && liqAfter > 0,
          `col=${c} tile=${HERB83T} colIdx=${fxCol} liq=${liqAfter}`);
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

  // ---- ⑩legacy 岩浆门（★备1 liqGateLegacy 端到端）----
  //  石块/泥土=legacy 实心件（无 TileObjectData）: tileSolid 短路 → 满岩浆拒、
  //  满水放（IsBlockedByLava 岩浆 only=原版 EmptyTile 语义）。平台 19:
  //  tileSolid[19]=true（Main.cs:8032）同短路（tileLavaDeath[19]=true Main.cs:8226）。
  //  蛛网 150→tile51: legacy 非固体且无 TileObjectData → 静态 LiquidPlace 回落
  //  （TileObjectData.cs:5045-5062）tileLavaDeath[51]=true → 拒；水维不可达=放。
  {
    const colFreeAll = (xa, xb) => {
      for (let x = xa; x <= xb; x++) {
        let ok = true;
        for (let y = CEIL + 1; y <= F - 1 && ok; y++) if (st.isActive(x, y)) ok = false;
        if (ok) return x;
      }
      return -1;
    };
    const stoneIdx = items.ITEM_DEFS.findIndex((it) => it?.key === 'stone_block' || it?.key === 'vi_3_stone_block');
    const dirtIdx = items.ITEM_DEFS.findIndex((it) => it?.key === 'dirt_block' || it?.key === 'vi_0_dirt_block');
    const platIdx = items.ITEM_DEFS.findIndex((it) => it?.tile === 'platform' || it?.key === 'platform');
    const webIdx = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_150_Cobweb');
    const STONE_T = idOfSheet(1);
    const at = (tid, x, y) => st.inBounds(x, y) && st.get(x, y) === tid;
    // ⑩a 石块 满岩浆拒 + 不耗
    const blockIdx = stoneIdx >= 0 ? stoneIdx : dirtIdx;
    if (blockIdx >= 0) {
      const c = colFreeAll(LT_.xa, LT_.xb);
      if (c >= 0) {
        const before = inv.slots[selIdx].stack;
        await shot(blockIdx, c, F - 1, [c + 2 >= LT_.xb ? c - 2 : c + 2, F - 1]);   // 站位出足迹（M-4 实体重叠门,固体件）
        const consumed = inv.slots[selIdx].stack < before;
        check('⑩a 石块(legacy 实心) 满岩浆拒（tileSolid 短路 :41815-41817）+ 不耗品',
          !at(STONE_T, c, F - 1) && !consumed, `item=${items.ITEM_DEFS[blockIdx].key} consumed=${consumed}`);
      } else check('⑩a 石块岩浆拒（无全空列 → 跳过）', true, 'no free col');
    } else check('⑩a 石块（缺物品 → 跳过端到端）', true, 'no item');
    // ⑩b 石块 满水放（legacy 门岩浆 only）
    if (blockIdx >= 0) {
      const c = colFreeAll(WT.xa, WT.xb);
      if (c >= 0) {
        await shot(blockIdx, c, F - 1, [c + 2 >= WT.xb ? c - 2 : c + 2, F - 1]);   // 站位出足迹
        check('⑩b 石块(legacy 实心) 满水放（岩浆 only 门,EmptyTile 语义 :40058）', at(STONE_T, c, F - 1),
          `col=${c} got=${st.get(c, F - 1)}`);
        if (at(STONE_T, c, F - 1)) st.setTile(c, F - 1, 0, 0, 0);
      } else check('⑩b 石块水放（无全空列 → 跳过）', true, 'no free col');
    }
    // ⑩c 平台 19：满岩浆拒（tileSolid[19]=true 短路）/ 满水放
    if (platIdx >= 0) {
      const pc = colFreeAll(LT_.xa, LT_.xb);
      if (pc >= 0) {
        await shot(platIdx, pc, F - 1);
        check('⑩c 平台(19) 满岩浆拒（tileSolid[19]=true Main.cs:8032 短路）', !at(idOfSheet(19), pc, F - 1),
          `col=${pc} got=${st.get(pc, F - 1)}`);
      } else check('⑩c 平台岩浆拒（无全空列 → 跳过）', true, 'no free col');
      const pc2 = colFreeAll(WT.xa, WT.xb);
      if (pc2 >= 0) {
        await shot(platIdx, pc2, F - 1);
        check('⑩c 平台(19) 满水放（:40058 无水维;CanPlace water=Allowed）', at(idOfSheet(19), pc2, F - 1),
          `col=${pc2} got=${st.get(pc2, F - 1)}`);
        if (at(idOfSheet(19), pc2, F - 1)) st.setTile(pc2, F - 1, 0, 0, 0);
      } else check('⑩c 平台水放（无全空列 → 跳过）', true, 'no free col');
    } else check('⑩c 平台（缺物品 → 跳过端到端）', true, 'no item');
    // ⑩d 蛛网 150→51：静态回落 tileLavaDeath[51] → 岩浆拒；水放（岩浆 only 门）
    if (webIdx >= 0) {
      const wc = colFreeAll(LT_.xa, LT_.xb);
      const WEB = idOfSheet(51);
      if (wc >= 0) {
        await shot(webIdx, wc, F - 1);
        check('⑩d 蛛网(150→tile51 legacy) 满岩浆拒（静态 LiquidPlace 回落 :5045-5062,tileLavaDeath[51]）',
          !at(WEB, wc, F - 1), `col=${wc} got=${st.get(wc, F - 1)}`);
      } else check('⑩d 蛛网岩浆拒（无全空列 → 跳过）', true, 'no free col');
      const wc2 = colFreeAll(WT.xa, WT.xb);
      if (wc2 >= 0) {
        await shot(webIdx, wc2, F - 1);
        check('⑩d 蛛网(51) 满水放（IsBlockedByLava 岩浆 only,静态回落水支不可达）', at(WEB, wc2, F - 1),
          `col=${wc2} got=${st.get(wc2, F - 1)}`);
        if (at(WEB, wc2, F - 1)) st.setTile(wc2, F - 1, 0, 0, 0);
      } else check('⑩d 蛛网水放（无全空列 → 跳过）', true, 'no free col');
    } else check('⑩d 蛛网（vi_150_Cobweb 缺物品 → 跳过端到端）', true, 'no item');
  }

  // ---- ⑪alch 岩浆熟转换（★备5 alchBloom,CheckAlch case 5 WorldGen.cs:46446-46474）----
  {
    const colFreeAll = (xa, xb) => {
      for (let x = xa; x <= xb; x++) {
        let ok = true;
        for (let y = CEIL + 1; y <= F - 1 && ok; y++) if (st.isActive(x, y)) ok = false;
        if (ok) return x;
      }
      return -1;
    };
    const seedFire2 = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_312_fireblossom_seeds');
    const HERB83 = idOfSheet(83), HERB84 = idOfSheet(84), ASH2 = idOfSheet(57);
    const dec = g['checkDecorSupport']?.bind(g);
    if (seedFire2 >= 0 && typeof dec === 'function') {
      const c = colFreeAll(LT_.xa, LT_.xb);
      if (c >= 0) {
        // ★真阳性序列（挤出面备案→十四批已清偿）：干灰烬地植入 → 直注岩浆 255
        //   （模拟自然流淌）→ 复跑 CheckAlch（=DelWater :46323 同入口）→ 断言转换。
        //   植入为干地（无液体可挤），直注路径与 dispSolidGate 无交——保留直注口径。
        if (ASH2 >= 0) st.setTile(c, F, ASH2, 0, 0);
        await shot(seedFire2, c, F - 1);   // 干地植入（col5 熟株 83）
        st.setLiquid(c, F - 1, 255, LIQUID_TYPE.LAVA);
        const def83 = tiles.TILE_DEFS[HERB83];
        dec(c, F - 1, def83, 83, 'alch');
        const is84 = st.get(c, F - 1) === HERB84 && Math.trunc(st.frameX[st.idx(c, F - 1)] / 18) === 5;
        check('⑪a 83 col5 + 岩浆255(>16) → 84 col5（MatureHerbs→BloomingHerbs :46457-46464）',
          is84, `got tile=${st.get(c, F - 1)} fx=${st.frameX[st.idx(c, F - 1)]}`);
        // 岩浆抽干至 ≤16 → 复跑 CheckAlch → 84 退回 83（:46466-46473）
        st.setLiquid(c, F - 1, 10, LIQUID_TYPE.LAVA);
        const def84 = tiles.TILE_DEFS[HERB84];
        dec(c, F - 1, def84, 84, 'alch');
        const back83 = st.get(c, F - 1) === HERB83 && Math.trunc(st.frameX[st.idx(c, F - 1)] / 18) === 5;
        check('⑪b 84 col5 岩浆≤16 → 83 col5（退回熟 :46466-46473）', back83,
          `got tile=${st.get(c, F - 1)} fx=${st.frameX[st.idx(c, F - 1)]}`);
        // 82（未熟）不转换（:46451 break）：直写 82 col5 于满岩浆再复跑
        const HERB82 = idOfSheet(82);
        if (HERB82 >= 0) {
          st.setTile(c, F - 1, HERB82, 5 * 18, 0);
          st.setLiquid(c, F - 1, 255, LIQUID_TYPE.LAVA);
          const def82 = tiles.TILE_DEFS[HERB82];
          dec(c, F - 1, def82, 82, 'alch');
          check('⑪c 82 col5 满岩浆不转换不杀（:46451 break;case5 无枯杀支）',
            st.get(c, F - 1) === HERB82, `got=${st.get(c, F - 1)}`);
        }
        // 复原
        if (st.get(c, F - 1) !== 0) st.setTile(c, F - 1, 0, 0, 0);
        st.setLiquid(c, F - 1, 255, LIQUID_TYPE.LAVA);
      } else check('⑪（无全空列 → 跳过）', true, 'no free col');
    } else check('⑪（缺种子/checkDecorSupport → 跳过）', true, 'skip');
  }

  // ---- ⑬绳索 965 液体门（★ropeLavaGate 十四批端到端）----
  //  定谳：tileLavaDeath[213]=true（Main.cs:8292）;水维 tileWaterDeath[213] 全表未置
  //  （Main.cs:8200-8206/:8448/:9643/:9647）→ 岩浆拒/水放。粒度=下延遇岩浆截断
  //  （CheckRopeUsability Player.cs:41835 `(flag || !…lava())` 同位同语义）;水格绳水
  //  共存（setTile 不动液体,PlaceTile WorldGen.cs:59501-59506 排除表无 213）。
  {
    const ropeIdx = items.ITEM_DEFS.findIndex((it) => it?.key === 'vi_965_rope');
    const ROPE_T = tiles.TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 213);
    const at2 = (tid, x, y) => st.inBounds(x, y) && st.get(x, y) === tid;
    if (ropeIdx >= 0 && ROPE_T >= 0) {
      const colFree2 = (xa, xb) => {
        for (let x = xa; x <= xb; x++) {
          let ok = true;
          for (let y = CEIL + 1; y <= F - 1 && ok; y++) if (st.isActive(x, y)) ok = false;
          if (ok) return x;
        }
        return -1;
      };
      // ⑬a 干格点击+下延伸入岩浆 → 截断（岩浆格无绳,干格有绳）。
      //  场地：箱内整柱皆岩浆 → 人工把顶格(CEIL+1)清成干格,点击它,下延撞岩浆。
      const cA = colFree2(LT_.xa, LT_.xb);
      if (cA >= 0) {
        st.setLiquid(cA, CEIL + 1, 0, LIQUID_TYPE.NONE);   // 顶格清干=点击位
        shotNow(ropeIdx, cA, CEIL + 1, [cA, CEIL - 2]);    // 即设即放（防模拟回灌）,站箱顶外
        const ropeAbove = at2(ROPE_T, cA, CEIL + 1) ? 1 : 0;
        check('⑬a 绳索下延遇岩浆截断（ropeLavaGate）：干段有绳且岩浆格无绳',
          ropeAbove === 1 && !at2(ROPE_T, cA, CEIL + 2) && !at2(ROPE_T, cA, F - 1),
          `col=${cA} ropeAbove=${ropeAbove} lavaCellRope=${at2(ROPE_T, cA, CEIL + 2)}/${at2(ROPE_T, cA, F - 1)}`);
        // 清理+复原整柱岩浆
        for (let y = CEIL + 1; y <= F - 1; y++) { if (at2(ROPE_T, cA, y)) st.setTile(cA, y, 0, 0, 0); st.setLiquid(cA, y, 255, LIQUID_TYPE.LAVA); }
      } else check('⑬a（无全空列 → 跳过）', true, 'no free col');
      // ⑬b 直接点岩浆格 → liqGateLegacy 静态回落拒（tileLavaDeath[213]）+ 不耗品
      const cB = colFree2(LT_.xa, LT_.xb);
      if (cB >= 0) {
        const before = inv.slots[selIdx].stack;
        await shot(ropeIdx, cB, F - 1);
        const consumed = inv.slots[selIdx].stack < before;
        check('⑬b 绳索点岩浆格=拒（liqGateLegacy 静态 LiquidPlace 回落 :5045-5062）+ 不耗品',
          !at2(ROPE_T, cB, F - 1) && !consumed, `col=${cB} consumed=${consumed}`);
      } else check('⑬b（无全空列 → 跳过）', true, 'no free col');
      // ⑬c 满水格放绳 → 放成且水保留（绳水共存=原版语义）
      const cC = colFree2(WT.xa, WT.xb);
      if (cC >= 0) {
        await shot(ropeIdx, cC, F - 1);
        const wet = st.inBounds(cC, F - 1) ? st.liquid[st.idx(cC, F - 1)] : -1;
        check('⑬c 绳索满水格放成+液体保留（tileWaterDeath[213] 未置;setTile 不动液体）',
          at2(ROPE_T, cC, F - 1) && wet === 255, `col=${cC} wet=${wet}`);
        if (at2(ROPE_T, cC, F - 1)) st.setTile(cC, F - 1, 0, 0, 0);
      } else check('⑬c（无全空列 → 跳过）', true, 'no free col');
      // ⑬d 干地下延回归（干地放行不变）：干地台列（保留 F 行地板石）清上空,
      // 点击 F-2 → 下延 F-2/F-1 两格（F 地板石=活动格截断）
      const dryCol = LT_.xb + 4;
      if (st.inBounds(dryCol, F - 1)) {
        for (let y = CEIL; y <= F - 1; y++) { if (st.isActive(dryCol, y)) st.setTile(dryCol, y, 0, 0, 0); st.setLiquid(dryCol, y, 0, LIQUID_TYPE.NONE); }
        await shot(ropeIdx, dryCol, F - 2);
        const n = [F - 2, F - 1].filter((y) => at2(ROPE_T, dryCol, y)).length;
        check('⑬d 绳索干地下延回归（2 格放成,干地放行不变）', n === 2, `placed=${n}`);
        for (let y = CEIL; y <= F - 1; y++) if (at2(ROPE_T, dryCol, y)) st.setTile(dryCol, y, 0, 0, 0);
      } else check('⑬d（界外 → 跳过）', true, 'oob');
    } else check('⑬绳索（vi_965_rope 缺物品/tile → 跳过端到端）', true, 'no item');
  }

  // ---- ⑭液体零写入终态（★十四批备A 清偿=原版最终态,固体/非固体一致）----
  //  原版定谳：放置写面不动液体（PlaceTile WorldGen.cs:59966 只清 Tile|TilePaint|
  //  Slope;TileObject.cs:100-106 只写 active/frame/type）→ 固体件植入满水格后液体
  //  数据【驻留本格】。⑭a=放置终态（同步即断：旧挤液代码在同帧清本格/转邻格,
  //  本断言即鉴别器）。⑭b=放置后挖块→邻液回流（KillTile 尾 SquareTileFrame→
  //  TileFrame→AddWater WorldGen.cs:82621-82624 唤醒驻留液入列;隔离场地里唯一
  //  水源=本格驻留液,挖除后水必铺开=唤醒+流动实证;密封场 x∈[cL-1,+7] 行
  //  CEIL+1..F-1,守恒窗=同域）。场地自足,不依赖水箱。
  {
    const stoneIdx2 = items.ITEM_DEFS.findIndex((it) => it?.key === 'stone_block' || it?.key === 'vi_3_stone_block');
    const STONE_T2 = idOfSheet(1);
    const at14 = (tid, x, y) => st.inBounds(x, y) && st.get(x, y) === tid;
    const cL = LT_.xb + 3, cW = LT_.xb + 4, cN = LT_.xb + 5, cN2 = LT_.xb + 6;
    const cSealL = LT_.xb + 2, cSealR = LT_.xb + 7;   // 密封壁（左借岩浆箱壁 +1 外一列,右临时补墙）
    const sumStrip = () => { let s = 0; for (let x = cSealL; x <= cSealR; x++) for (let y = CEIL; y <= F - 1; y++) s += st.liquid[st.idx(x, y)]; return s; };
    if (stoneIdx2 >= 0 && st.inBounds(cSealR, F)) {
      // 场地：仅放置格 (cW,F-1) 注满水,其余全干（隔离——回流观测不被大水体摊平淹没）
      for (let x = cSealL; x <= cSealR; x++) for (let y = CEIL; y <= F - 1; y++) {
        if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
        st.setLiquid(x, y, 0, LIQUID_TYPE.NONE);
      }
      for (let y = CEIL; y <= F; y++) st.setTile(cSealR, y, STONE_T2, 0, 0);   // 右密封壁（含 F 行防沿台沿落水）
      st.setLiquid(cW, F - 1, 255, LIQUID_TYPE.WATER);
      shotNow(stoneIdx2, cW, F - 1, [cN, F - 1]);   // 同步放置（防模拟先行流动）
      const cellLiq = st.liquid[st.idx(cW, F - 1)];
      const nextLiq = st.liquid[st.idx(cN, F - 1)];
      const sumAfterPlace = sumStrip();
      check('⑭a 固体件(石块)植满水格 → 本格液体驻留255+邻格零转移（放置写面不动液体,WorldGen.cs:59966）',
        at14(STONE_T2, cW, F - 1) && cellLiq === 255 && nextLiq === 0 && sumAfterPlace === 255,
        `cell=${cellLiq} next=${nextLiq} sum=${sumAfterPlace}`);
      // ⑭b 放置后挖块 → 邻液回流（原版行为锚,WorldGen.cs:82621-82624）
      if (at14(STONE_T2, cW, F - 1)) {
        g.breakTile(cW, F - 1, true);   // KillTile 全语义（清格面不动液体→setTile 监听 3×3 addWater）
        await new Promise((r) => setTimeout(r, 1200));
        const afterCell = st.liquid[st.idx(cW, F - 1)];
        const afterN = st.liquid[st.idx(cN, F - 1)];
        const afterL = st.liquid[st.idx(cL, F - 1)];
        const afterSum = sumStrip();
        const air = !st.isActive(cW, F - 1);
        check('⑭b 挖块后驻留液唤醒回流：本格空且水离格铺开+总量守恒（TileFrame→AddWater :82621）',
          air && afterCell < 250 && afterCell > 0 && afterSum >= 247 && (afterN > 0 || afterL > 0),
          `air=${air} cell=${afterCell} N=${afterN} L=${afterL} sum=${afterSum}`);
      }
      // 复原干地台（⑥dry 依赖干地）+拆右密封壁
      for (let x = cSealL; x <= cSealR; x++) for (let y = CEIL; y <= F; y++) {
        if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
        st.setLiquid(x, y, 0, LIQUID_TYPE.NONE);
      }
      for (let x = cSealL; x <= cN2; x++) st.setTile(x, F, STONE_T2, 0, 0);   // 干地台地板复原（含 cSealL=原地板域,右密封壁位不还原）
    } else check('⑭（缺物品/界外 → 跳过端到端）', true, 'skip');
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
