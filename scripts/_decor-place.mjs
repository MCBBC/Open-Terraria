// 债 A 探针：可放置多格 DECOR 件放置自毁（向日葵 27 实测 6/8 格）
// 原版时点（证据）：TileObject.Place（TileObject.cs:94-110）对 w×h 全格【裸写】
// （active/frameX/frameY/type 直赋,无逐格 TileFrame;清格相 :79-93 的 KillTile 自带
// SquareTileFrame 且发生在写入前）→ 级联由调用方在放置完成后对目标点一次
// SquareTileFrame（WorldGen.PlaceObject :51886-51888 / Player.PlaceThing_Tiles_PlaceIt
// :40438-40439）。本仓修复 = 写循环期间抑制 DECOR 分派（_decorPlaceBuilding 构造旗 +
// checkDecorSupport 入口早退 + checkDecorSquareFrame 早退）,循环结束后对放置目标点
// 补一次 DECOR 3×3 扫（checkDecorSquareFrame(tx,ty)）。
// 场景：
//  ①sunflowerPlace      向日葵(27) 2×4 经 tryPlace 放草地 → 8/8 格存活
//  ②altMultiCellPlace   另一件可放置多格 DECOR（候选 35 南瓜灯/567 侏儒/530 绿洲植物…,
//                       运行时扫 ITEM_DEFS.tile×TILE_DEFS.decor,w×h>1）→ ow×oh 全存活
//  ③dirtSingle          泥土单格放置对照 → 1/1
//  ④sunflowerDigSupport 放置后立即挖其支撑草格（构造期外级联仍生效）→ 整株清除
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const MAP = process.env.SW_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
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
  const SUN_T = idOfSheet(27), DIRT = idOfSheet(0), GRASS2 = idOfSheet(2), SAND = idOfSheet(53), JUNGLE = idOfSheet(60), STONEC = idOfSheet(1);
  const x0 = Math.min(Math.max(Math.floor(st.w / 2), 20), st.w - 20) + 90;
  const F = Math.floor(st.h / 2) - 260;
  if (!st.inBounds(x0 + 10, F + 3)) return { fail: 'bounds', x0, F };
  const clearBox = () => { for (let x = x0 - 3; x <= x0 + 10; x++) for (let y = F - 8; y <= F + 3; y++) {
    if (!st.inBounds(x, y)) continue;
    if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
    const i2 = st.idx(x, y);
    if (st.liquid[i2] > 0) st.liquid[i2] = 0;
  } };
  const fillFloor = (tid) => { for (let x = x0; x <= x0 + 7; x++) st.setTileSilent(x, F, tid, 0, 0); };
  const countIn = (tid, xa, xb, ya, yb) => {
    let n = 0;
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++)
      if (st.inBounds(x, y) && st.get(x, y) === tid) n++;
    return n;
  };
  const inv = g.player.inv;
  const selIdx = inv.selected;
  const savedSlot = inv.slots[selIdx];
  const holdItem = (id) => { inv.slots[selIdx] = { id, stack: 10, favorited: false, prefix: 0 }; inv.selected = selIdx; };
  const findItem = (tileKey) => {
    for (let i = 0; i < items.ITEM_DEFS.length; i++) if (items.ITEM_DEFS[i]?.tile === tileKey) return i;
    return -1;
  };
  // 候选地板（支撑判据的底质门）：南瓜灯/侏儒=草,绿洲植物=沙,丛林大型植物=丛林草
  const floorOfSheet = { 35: GRASS2, 567: GRASS2, 27: GRASS2, 530: SAND, 233: JUNGLE, 236: JUNGLE, 238: JUNGLE, 702: JUNGLE };
  // 多格 DECOR 放置通用跑法：ty = 顶行（底行落在 F-1,坐在地板行 F 上）
  // placed 判别 = 持物堆减量（tryPlace 成功才消耗 1）——放置被拒与"放置后自毁归零"
  // 二者 cells 都可能是 0,须用消耗区分
  const placeMulti = async (itemIdx, ceilRow = -1) => {
    const idef = items.ITEM_DEFS[itemIdx];
    const tKey = idef.tile;
    let tid = -1;
    for (let i = 0; i < tiles.TILE_DEFS.length; i++) if (tiles.TILE_DEFS[i]?.key === tKey) { tid = i; break; }
    const tdef = tiles.TILE_DEFS[tid];
    const ow = tdef?.w ?? 1, oh = tdef?.h ?? 1;
    const floorTid = floorOfSheet[tdef?.vanilla?.sheet ?? -1] ?? GRASS2;
    clearBox();
    fillFloor(floorTid);
    if (ceilRow >= 0) {
      for (let x = x0; x <= x0 + 7; x++) st.setTileSilent(x, ceilRow, STONEC, 0, 0);
    }
    holdItem(itemIdx);
    const stackBefore = inv.slots[selIdx]?.stack ?? -1;
    g.player.x = (x0 + 5) * 16 + 8; g.player.y = (F - 5) * 16; g.player.vx = 0; g.player.vy = 0;
    g.player.useTime = 0;
    await new Promise((r) => setTimeout(r, 40));
    const tx = x0 + 1, ty = ceilRow >= 0 ? ceilRow + 1 : F - oh;
    g['tryPlace'].call(g, tx, ty, idef);
    const stackAfter = inv.slots[selIdx]?.stack ?? -1;
    return {
      sheet: tdef?.vanilla?.sheet ?? -1, tileKey: tKey, ow, oh,
      placed: stackBefore - stackAfter === 1,
      cells: countIn(tid, x0 - 2, x0 + 9, F - 8, F + 2),
      full: ow * oh,
      framesOk: countIn(tid, tx, tx + ow - 1, ty, ty + oh - 1) === ow * oh,
    };
  };
  const res = { ids: { sun: SUN_T, dirt: DIRT, grass: GRASS2, x0, F } };
  // 运行时扫可放置多格 DECOR（decor 标记 + w×h>1 + 有放置物品）
  const cand = [];
  {
    const seen = new Set();
    for (let i = 0; i < items.ITEM_DEFS.length; i++) {
      const tKey = items.ITEM_DEFS[i]?.tile;
      if (!tKey || seen.has(tKey)) continue;
      let tid = -1;
      for (let k = 0; k < tiles.TILE_DEFS.length; k++) if (tiles.TILE_DEFS[k]?.key === tKey) { tid = k; break; }
      const td = tiles.TILE_DEFS[tid];
      if (!td?.decor || ((td.w ?? 1) <= 1 && (td.h ?? 1) <= 1)) continue;
      seen.add(tKey);
      cand.push({ itemIdx: i, tileKey: tKey, sheet: td.vanilla?.sheet ?? -1, w: td.w ?? 1, h: td.h ?? 1 });
    }
  }
  res.multiCellDecorCandidates = cand;
  // ① 向日葵（2×4）
  const sunIdx = findItem(tiles.TILE_DEFS[SUN_T]?.key);
  res.sunIdx = sunIdx;
  if (sunIdx >= 0) res.sunflowerPlace = await placeMulti(sunIdx);
  // ② 另一件可放置多格 DECOR：优先 35 南瓜灯（任务指定）,否则取首个候选（排除 27）
  const alt = cand.find((c) => c.sheet === 35) ?? cand.find((c) => c.sheet !== 27);
  if (alt) res.altMultiCellPlace = await placeMulti(alt.itemIdx);
  else res.altMultiCellPlace = 'no-candidate';
  // ③ 单格对照：泥土
  {
    clearBox();
    fillFloor(GRASS2);
    const dirtIdx = findItem(tiles.TILE_DEFS[DIRT]?.key);
    res.dirtIdx = dirtIdx;
    if (dirtIdx >= 0) {
      holdItem(dirtIdx);
      g.player.x = (x0 + 5) * 16 + 8; g.player.y = (F - 5) * 16; g.player.vx = 0; g.player.vy = 0;
      g.player.useTime = 0;
      await new Promise((r) => setTimeout(r, 40));
      g['tryPlace'].call(g, x0 + 1, F - 1, items.ITEM_DEFS[dirtIdx]);
      res.dirtSingle = { cells: countIn(DIRT, x0 - 2, x0 + 9, F - 8, F + 2) };
    } else res.dirtSingle = 'no-item';
  }
  // ④ 放置后立即挖支撑草格（构造期外,级联必须仍生效）→ 整株清除
  if (sunIdx >= 0) {
    const r1 = await placeMulti(sunIdx);
    g['breakTile'].call(g, x0 + 1, F);   // 挖左列下方草块（CheckSunflower 地基行）
    res.sunflowerDigSupport = {
      placedBefore: r1.cells,
      residue: countIn(SUN_T, x0 - 2, x0 + 9, F - 8, F + 2),
    };
  }
  const okPlace = (r) => !!r && typeof r === 'object' && r.cells === r.full;
  // ---- ⑥ 七件放置门原版真值定谳（2026-09-02）：前序批次暴露 7 件候选被本仓放置门
  //  拒绝（合成环境:草地板+可选石天花板,无墙）。每件一个 vanilla-faithful 场景
  //  （环境按反编译 TileObjectData 锚面搭）+ 双向断言：
  //    vanilla 可放 → 本仓必须放成且整件存活（placed && cells===full）
  //    vanilla 不可放 → 本仓必须拒绝（!placed && cells===0）
  //  ★vanilla 真值 = 探针内独立实现的 CanPlace 子集（TileObject.cs:174-858 语义,
  //  不读仓内 tile-anchors.json,防同源污染）：锚 spec 逐件硬编码自反编译源（行号见
  //  VAN_SPEC 注释）。合成环境只有实心块/空气/墙 → 占位阻挡简化为 isActive、
  //  液体门略（场景全干）、tileCut 豁免面不触发（场景不含割草族）。
  //  占位豁免面/清格相已由前序批次钉死（TileObject.cs:357/:79-93）,不在此重复。
  const VAN_SPEC = {
    // 吊灯 3×3 Origin(1,0)：AnchorTop SolidTile|SolidSide cnt1 start1（顶行中列上方
    // 1 格即锚）,AnchorBottom=Empty（TileObjectData.cs:3144-3161,Empty 于 :3147）
    34: { w: 3, h: 3, ox: 1, oy: 0, top: { t: ['SolidTile', 'SolidSide'], cnt: 1, start: 1 }, bottom: null, left: null, right: null, wall: false },
    // 中式灯笼/迪斯科球 2×2 Origin(1,0)：AnchorTop SolidTile|SolidSide cnt2 start0,
    // AnchorBottom=Empty（TileObjectData.cs:3556-3561 / :3562-3567,Empty 于 :3559/:3565）
    95: { w: 2, h: 2, ox: 1, oy: 0, top: { t: ['SolidTile', 'SolidSide'], cnt: 2, start: 0 }, bottom: null, left: null, right: null, wall: false },
    126: { w: 2, h: 2, ox: 1, oy: 0, top: { t: ['SolidTile', 'SolidSide'], cnt: 2, start: 0 }, bottom: null, left: null, right: null, wall: false },
    // 开态活板门 2×2 Origin(0,1)：AnchorLeft/Right SolidTile cnt1 start1（中部行左右
    // 外各 1 格）,AnchorBottom=Empty（TileObjectData.cs:3806-3812,Empty 于 :3808）
    386: { w: 2, h: 2, ox: 0, oy: 1, top: null, bottom: null, left: { t: ['SolidTile'], cnt: 1, start: 1 }, right: { t: ['SolidTile'], cnt: 1, start: 1 }, wall: false },
    // 高门(开态) 1×5 Origin(0,0)：AnchorTop+AnchorBottom SolidTile cnt1 start0
    // （TileObjectData.cs:2293-2325 addTile(388);389=FullCopyFrom(388) :2324-2325）
    389: { w: 1, h: 5, ox: 0, oy: 0, top: { t: ['SolidTile'], cnt: 1, start: 0 }, bottom: { t: ['SolidTile'], cnt: 1, start: 0 }, left: null, right: null, wall: false },
    // 高门(闭态) 388=FullCopyFrom(389) 同锚面（TileObjectData.cs:2324-2325）;
    // ★M-4⑂：388 solid:true 且【不在】BlockPlacementIfOverPlayers 名单 → 原版无实体
    // 门,玩家压占位框仍放成（runSeven 缺省玩家位 (x0+5,F-5) 恰在门列内=重叠态）
    388: { w: 1, h: 5, ox: 0, oy: 0, top: { t: ['SolidTile'], cnt: 1, start: 0 }, bottom: { t: ['SolidTile'], cnt: 1, start: 0 }, left: null, right: null, wall: false },
    // 宝石锁 3×3 Origin(1,1)：AnchorWall=true,无侧面锚（TileObjectData.cs:4790-4807
    // ——isValidWallAnchor 默认支 wall==0 拒 TileObjectData.cs:1948-1962）
    440: { w: 3, h: 3, ox: 1, oy: 1, top: null, bottom: null, left: null, right: null, wall: true },
    // 巨石像 2×3 Origin(0,0)：AnchorTop SolidTile|SolidSide|SolidBottom cnt2 start0,
    // AnchorBottom=default(AnchorData)（TileObjectData.cs:2987-2993,default 于 :2990;
    // CopyFrom(Style2xX) 模板底锚被显式清空）
    531: { w: 2, h: 3, ox: 0, oy: 0, top: { t: ['SolidTile', 'SolidSide', 'SolidBottom'], cnt: 2, start: 0 }, bottom: null, left: null, right: null, wall: false },
  };
  // 原版 CanPlace 子集（TileObject.cs:174-858）：ax,ay=占位左上。满分制=all-or-nothing
  const vanillaCanPlace = (ax, ay, spec) => {
    const inB = (x, y) => st.inBounds(x, y);
    // :215 num8<5 || num8+W>max-5 …（五格边界门）
    if (ax < 5 || ay < 5 || ax + spec.w > st.w - 5 || ay + spec.h > st.h - 5) return false;
    const btOf = (x, y) => { const i2 = st.idx(x, y); return st.half[i2] ? 1 : (st.slope[i2] > 0 ? st.slope[i2] + 1 : 0); };
    const defAt2 = (x, y) => tiles.TILE_DEFS[st.get(x, y)];
    // 占位格（:337-374 合成环境简化=active 即阻挡）+ AnchorWall（:344-355）
    for (let dx = 0; dx < spec.w; dx++) for (let dy = 0; dy < spec.h; dy++) {
      const x = ax + dx, y = ay + dy;
      if (!inB(x, y) || st.isActive(x, y)) return false;
      if (spec.wall && st.wall[st.idx(x, y)] === 0) return false;   // isValidWallAnchor 默认支
    }
    // 锚格（:376-720）：SolidTile=nactive+tileSolid+非 solidTop+blockType==0;
    // SolidSide(top)=bt 2/3 (bottom)=4/5;SolidBottom(:465)=实心非 solidTop ∪ 半砖 ∪ 顶坡
    const anchorOK = (x, y, ts) => {
      if (!inB(x, y)) return false;
      if (!st.isActive(x, y)) return ts.includes('EmptyTile');
      const d = defAt2(x, y);
      if (!d) return false;
      const bt = btOf(x, y);
      let ok = false;
      if (ts.includes('SolidTile')) ok = ok || (d.solid && !d.platform && bt === 0);
      if (ts.includes('SolidSide')) ok = ok || (d.solid && !d.platform && (bt === 2 || bt === 3 || bt === 4 || bt === 5));
      if (ts.includes('SolidBottom')) ok = ok || (d.solid && !d.platform) || st.half[st.idx(x, y)] === 1 || bt === 3 || bt === 4;
      return ok;
    };
    const side = (a, rowOf) => {
      if (!a) return true;
      for (let k = 0; k < a.cnt; k++) { const [cx2, cy2] = rowOf(k); if (!anchorOK(cx2, cy2, a.t)) return false; }
      return true;
    };
    if (!side(spec.bottom, (k) => [ax + spec.bottom.start + k, ay + spec.h])) return false;
    if (!side(spec.top, (k) => [ax + spec.top.start + k, ay - 1])) return false;
    if (!side(spec.left, (k) => [ax - 1, ay + spec.left.start + k])) return false;
    if (!side(spec.right, (k) => [ax + spec.w, ay + spec.right.start + k])) return false;
    return true;
  };
  // 场景 runner：setEnv() 搭环境 → vanilla 真值 → 本仓 tryPlace（点击=Origin 格）→
  // 存活性（cells/frames）。每个 sheet 跑 positive + negative 两环境。
  const findItem2 = (tileKey) => {
    for (let i = 0; i < items.ITEM_DEFS.length; i++) if (items.ITEM_DEFS[i]?.tile === tileKey) return i;
    return -1;
  };
  const tidOfSheet = (sh) => idOfSheet(sh);
  const vanillaSeven = [];
  const vFail = [];
  const runSeven = async (sheet, setEnv, ax, ay) => {
    const spec = VAN_SPEC[sheet];
    const tid = tidOfSheet(sheet);
    const tdef = tiles.TILE_DEFS[tid];
    const itemIdx = findItem2(tdef?.key);
    if (itemIdx < 0) return { sheet, error: 'no-item' };
    // 环境构造（setEnv 内含 clearBox+wall 清零）
    setEnv();
    const van = vanillaCanPlace(ax, ay, spec);
    holdItem(itemIdx);
    g.player.x = (x0 + 5) * 16 + 8; g.player.y = (F - 5) * 16; g.player.vx = 0; g.player.vy = 0;
    g.player.useTime = 0;
    await new Promise((r) => setTimeout(r, 40));
    const stackBefore = inv.slots[selIdx]?.stack ?? -1;
    g['tryPlace'].call(g, ax + spec.ox, ay + spec.oy, items.ITEM_DEFS[itemIdx]);
    const placed = stackBefore - (inv.slots[selIdx]?.stack ?? -1) === 1;
    const cells = countIn(tid, ax - 2, ax + spec.w + 2, ay - 2, ay + spec.h + 2);
    const framesOk = countIn(tid, ax, ax + spec.w - 1, ay, ay + spec.h - 1) === spec.w * spec.h;
    // ★M-2（2026-09-02 九批）：放置帧序列捕获（按行主序）——388/389 判定=原版
    // TileObject.Place heights+padding 累进 0/20/38/56/74（TileObject.cs:96-108,
    // heights{18,16,16,16,18}+pad2 TileObjectData.cs:2301-2303）
    const frameSeq = [];
    for (let dy = 0; dy < spec.h; dy++) for (let dx = 0; dx < spec.w; dx++) {
      const qx = ax + dx, qy = ay + dy, qi = st.idx(qx, qy);
      if (st.inBounds(qx, qy) && st.get(qx, qy) === tid) frameSeq.push([st.frameX[qi], st.frameY[qi]]);
    }
    return { sheet, key: tdef?.key, vanilla: van, placed, cells, full: spec.w * spec.h, framesOk, frameSeq };
  };
  // 环境基元：清场（tile+wall+liquid）/行/列/单格
  const clearEnv = (xa, xb, ya, yb) => {
    for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
      if (!st.inBounds(x, y)) continue;
      if (st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
      const i2 = st.idx(x, y);
      st.wall[i2] = 0;
      if (st.liquid[i2] > 0) st.liquid[i2] = 0;
    }
  };
  const put = (x, y, tid2) => st.setTileSilent(x, y, tid2, 0, 0);
  const STONEC2 = idOfSheet(1);
  // —— 34 吊灯：positive=3 宽石天花 F-4（锚=中列上方 1 格）;negative=无天花
  vanillaSeven.push(await runSeven(34, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 5; x <= x0 + 7; x++) put(x, F - 4, STONEC2);
  }, x0 + 5, F - 3));
  vanillaSeven.push(await runSeven(34, () => { clearEnv(x0 - 2, x0 + 10, F - 8, F + 2); }, x0 + 5, F - 3));
  // —— 95 中式灯笼：positive=2 宽石天花 F-3;negative=无天花
  vanillaSeven.push(await runSeven(95, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 5; x <= x0 + 6; x++) put(x, F - 3, STONEC2);
  }, x0 + 5, F - 2));
  vanillaSeven.push(await runSeven(95, () => { clearEnv(x0 - 2, x0 + 10, F - 8, F + 2); }, x0 + 5, F - 2));
  // —— 126 迪斯科球：同 95
  vanillaSeven.push(await runSeven(126, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 5; x <= x0 + 6; x++) put(x, F - 3, STONEC2);
  }, x0 + 5, F - 2));
  vanillaSeven.push(await runSeven(126, () => { clearEnv(x0 - 2, x0 + 10, F - 8, F + 2); }, x0 + 5, F - 2));
  // —— 386 开态活板门：positive=中部行左右外各 1 实心块;negative=无侧块
  vanillaSeven.push(await runSeven(386, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    put(x0 + 4, F - 1, STONEC2); put(x0 + 7, F - 1, STONEC2);
  }, x0 + 5, F - 2));
  vanillaSeven.push(await runSeven(386, () => { clearEnv(x0 - 2, x0 + 10, F - 8, F + 2); }, x0 + 5, F - 2));
  // —— 389 高门开态：positive=地面 F+天花 F-6（恰 5 格净空,双锚）;negative=天花 F-7
  //（6 格净空 → 顶锚落空=原版亦拒——前序探针 attempt:'rejected' 的正确拒绝根因）
  vanillaSeven.push(await runSeven(389, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 4; x <= x0 + 6; x++) put(x, F, STONEC2);
    for (let x = x0 + 4; x <= x0 + 6; x++) put(x, F - 6, STONEC2);
  }, x0 + 5, F - 5));
  vanillaSeven.push(await runSeven(389, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 4; x <= x0 + 6; x++) put(x, F, STONEC2);
    for (let x = x0 + 4; x <= x0 + 6; x++) put(x, F - 7, STONEC2);
  }, x0 + 5, F - 5));
  // —— 388 高门闭态（★九批 M-2 帧序列断言 + M-4⑂ 名单外 solid 表驱动件玩家重叠放成：
  //  runSeven 缺省玩家位 (x0+5,F-5)*16 恰压门列 F-5..F-3 行=重叠态,388 不在
  //  BlockPlacementIfOverPlayers 名单 → 原版无实体门 → 必须放成）
  vanillaSeven.push(await runSeven(388, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 4; x <= x0 + 6; x++) put(x, F, STONEC2);
    for (let x = x0 + 4; x <= x0 + 6; x++) put(x, F - 6, STONEC2);
  }, x0 + 5, F - 5));
  // —— 440 宝石锁：positive=3×3 背墙 wall=1;negative=无墙（原版 isValidWallAnchor 拒）
  vanillaSeven.push(await runSeven(440, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 4; x <= x0 + 6; x++) for (let y = F - 3; y <= F - 1; y++) st.wall[st.idx(x, y)] = 1;
  }, x0 + 4, F - 3));
  vanillaSeven.push(await runSeven(440, () => { clearEnv(x0 - 2, x0 + 10, F - 8, F + 2); }, x0 + 4, F - 3));
  // —— 531 巨石像：positive=2 宽石天花 F-4;negative=无天花
  vanillaSeven.push(await runSeven(531, () => {
    clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
    for (let x = x0 + 5; x <= x0 + 6; x++) put(x, F - 4, STONEC2);
  }, x0 + 5, F - 3));
  vanillaSeven.push(await runSeven(531, () => { clearEnv(x0 - 2, x0 + 10, F - 8, F + 2); }, x0 + 5, F - 3));
  res.vanillaSeven = vanillaSeven;
  for (const r of vanillaSeven) {
    const okVan = r.vanilla === true && r.placed && r.cells === r.full && r.framesOk;
    const okRej = r.vanilla === false && !r.placed && r.cells === 0;
    // ★M-2：388/389 放置帧序列必须===原版约定 0/20/38/56/74
    if ((r.sheet === 388 || r.sheet === 389) && r.placed
      && JSON.stringify(r.frameSeq?.map((p) => p[1]) ?? []) !== JSON.stringify([0, 20, 38, 56, 74])) {
      vFail.push(`${r.sheet}:frameSeq=${JSON.stringify(r.frameSeq)}`);
      continue;
    }
    if (!okVan && !okRej) vFail.push(`${r.sheet}:van=${r.vanilla},placed=${r.placed},cells=${r.cells}/${r.full}`);
  }
  res.vanillaSevenFailures = vFail;

  // ---- ⑦ M-4（2026-09-02 九批）放置实体重叠门两档建模（Player.cs:41747-41810 名单
  //  {138,664,711-716,484}32×32/{235}48×16/{476}16×16/{387}32×16 只查 Main.player
  //  active&&!dead&&!ghost;legacy 实心件=PlaceTile→Collision.EmptyTile(Collision.cs:1361)
  //  查玩家+敌怪;名单外表驱动件无实体门）+ 门在清格相【之前】（失败零格变更）。
  //  ㊀ 235 传送器（名单内 48×16px=3×1）：玩家与占位框重叠 → 拒,且占位格内的
  //     tileCut 障碍（杂草 3）【不被清】=残段清偿断言;玩家移开 → 放成（对照）。
  const TP = tidOfSheet(235);
  const tpItem = findItem2(tiles.TILE_DEFS[TP]?.key);
  res.m4TeleporterOverlap = 'no-item';
  if (tpItem >= 0) {
    const WEED = idOfSheet(3);
    const tpEnv = () => {
      clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
      for (let x = x0 + 3; x <= x0 + 6; x++) put(x, F, STONEC2);   // 底锚行（3 宽）
    };
    tpEnv();
    put(x0 + 5, F - 1, WEED);                          // 占位格内 tileCut 障碍
    holdItem(tpItem);
    g.player.useTime = 0;
    g.player.x = (x0 + 4) * 16 + 8; g.player.y = (F - 2) * 16;   // 玩家压占位框（行 F-2..F-1）
    g.player.vx = 0; g.player.vy = 0;
    await new Promise((r) => setTimeout(r, 40));
    const sb1 = inv.slots[selIdx]?.stack ?? -1;
    g['tryPlace'].call(g, x0 + 4 + 1, F - 1 + 0, items.ITEM_DEFS[tpItem]);   // 点击=Origin(1,0)
    const sb1b = inv.slots[selIdx]?.stack ?? -1;   // ★即时取（对照调用会再动堆栈）
    const weedBefore = st.get(x0 + 5, F - 1) === WEED;
    // 对照：玩家移开 → 放成（ weed 被清格相正常清除=tileCut ∪ BreakableWhenPlacing 面不变）
    g.player.x = (x0 + 8) * 16 + 8; g.player.y = (F - 6) * 16;
    g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0;
    await new Promise((r) => setTimeout(r, 40));
    const sb2 = inv.slots[selIdx]?.stack ?? -1;
    g['tryPlace'].call(g, x0 + 4 + 1, F - 1 + 0, items.ITEM_DEFS[tpItem]);
    res.m4TeleporterOverlap = {
      rejected: sb1 - sb1b === 0,
      weedIntact: weedBefore,                          // 拒绝路径零格变更
      placedAfter: sb2 - (inv.slots[selIdx]?.stack ?? -1) === 1,
      tpCells: countIn(TP, x0 + 2, x0 + 9, F - 3, F + 1),
    };
  }
  // ㊁ legacy 实心件（泥土）+ 敌怪重叠 → 拒（Collision.EmptyTile :1361 查 NPC）;
  //   无敌怪对照 → 放成。敌怪用最小 AABB 桩压目标格（overlapsEntity 消费面）。
  {
    const DIRT2 = idOfSheet(0);
    const dirtIdx2 = findItem2(tiles.TILE_DEFS[DIRT2]?.key);
    res.m4DirtEnemyOverlap = 'no-item';
    if (dirtIdx2 >= 0) {
      clearEnv(x0 - 2, x0 + 10, F - 8, F + 2);
      for (let x = x0 + 3; x <= x0 + 6; x++) put(x, F, STONEC2);
      const mock = { x: (x0 + 5) * 16, y: (F - 1) * 16, w: 16, h: 16, dead: false };
      g.entities.enemies.push(mock);
      holdItem(dirtIdx2);
      g.player.useTime = 0;
      g.player.x = (x0 + 8) * 16 + 8; g.player.y = (F - 6) * 16;   // 玩家让开,只敌怪压格
      g.player.vx = 0; g.player.vy = 0;
      await new Promise((r) => setTimeout(r, 40));
      const sb1 = inv.slots[selIdx]?.stack ?? -1;
      g['tryPlace'].call(g, x0 + 5, F - 1, items.ITEM_DEFS[dirtIdx2]);
      const rejected = sb1 - (inv.slots[selIdx]?.stack ?? -1) === 0;
      g.entities.enemies = g.entities.enemies.filter((e) => e !== mock);   // 对照:移除敌怪
      g.player.useTime = 0;
      await new Promise((r) => setTimeout(r, 40));
      const sb2 = inv.slots[selIdx]?.stack ?? -1;
      g['tryPlace'].call(g, x0 + 5, F - 1, items.ITEM_DEFS[dirtIdx2]);
      res.m4DirtEnemyOverlap = {
        rejected,
        placedAfter: sb2 - (inv.slots[selIdx]?.stack ?? -1) === 1,
        dirtCells: countIn(DIRT2, x0 + 3, x0 + 8, F - 3, F + 1),
      };
    }
  }
  // ---- ⑤ 备案②清零（2026-09-01 五批）：全部可放置多格 decor 候选逐件跑——
  // 放置成功（持物堆 -1）→ 必须整件存活（cells===full,自毁=部分格被吃）;
  // 双尝试：先地板,被拒再试天花板（34 吊灯/42 挂灯等顶锚件）;
  // 双拒 = 放置门拒绝（本体合法,非自毁）,记 rejected 不判红
  res.allCandidates = [];
  const cFail = [];
  for (const c of cand) {
    let r = await placeMulti(c.itemIdx);
    if (!r.placed) {
      const r2 = await placeMulti(c.itemIdx, F - 7);
      if (r2.placed) r = { ...r2, attempt: 'ceil' };
      else r = { ...r, attempt: 'rejected' };
    }
    res.allCandidates.push({ sheet: c.sheet, key: c.tileKey, placed: r.placed, cells: r.cells, full: r.full, attempt: r.attempt ?? 'floor' });
    if (r.placed && r.cells !== r.full) cFail.push(c.sheet);
  }
  res.candidateFailures = cFail;
  res.verdict = okPlace(res.sunflowerPlace)
    && (typeof res.altMultiCellPlace === 'object'
      ? (res.altMultiCellPlace.cells === res.altMultiCellPlace.full && res.altMultiCellPlace.framesOk)
      : res.altMultiCellPlace === 'no-candidate')
    && (typeof res.dirtSingle === 'object' ? res.dirtSingle.cells === 1 : true)
    && typeof res.sunflowerDigSupport === 'object'
    && res.sunflowerDigSupport.placedBefore === 8 && res.sunflowerDigSupport.residue === 0
    && cFail.length === 0
    && vFail.length === 0
    // —— 九批 M-4（两档实体重叠门 + 残段清偿）——
    && (typeof res.m4TeleporterOverlap === 'object'
      ? res.m4TeleporterOverlap.rejected && res.m4TeleporterOverlap.weedIntact
        && res.m4TeleporterOverlap.placedAfter && res.m4TeleporterOverlap.tpCells === 3
      : res.m4TeleporterOverlap === 'no-item')
    && (typeof res.m4DirtEnemyOverlap === 'object'
      ? res.m4DirtEnemyOverlap.rejected && res.m4DirtEnemyOverlap.placedAfter
        && res.m4DirtEnemyOverlap.dirtCells === 1
      : res.m4DirtEnemyOverlap === 'no-item')
    ? 'PASS' : 'FAIL';
  inv.slots[selIdx] = savedSlot;
  return res;
});
fs.writeFileSync('/tmp/decor-place.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
