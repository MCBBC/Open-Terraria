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
    ? 'PASS' : 'FAIL';
  inv.slots[selIdx] = savedSlot;
  return res;
});
fs.writeFileSync('/tmp/decor-place.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
