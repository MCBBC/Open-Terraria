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
  // ---- ③二轮 review 增补场景 ----
  const TORCH = idOfSheet(4), WEB = idOfSheet(51);
  let torchDef = null, torchIdx = -1;
  for (let i = 0; i < items.ITEM_DEFS.length; i++) {
    if (items.ITEM_DEFS[i]?.tile === tiles.TILE_DEFS[TORCH]?.key) { torchDef = items.ITEM_DEFS[i]; torchIdx = i; break; }
  }
  if (!torchDef && items.ITEM_BY_KEY['torch'] !== undefined) { torchIdx = items.ITEM_BY_KEY['torch']; torchDef = items.ITEM_DEFS[torchIdx]; }
  const standClick = async () => {
    stand(base.click[0], base.click[1]);
    await new Promise((r) => setTimeout(r, 40));
    g.player.useTime = 0;
    g['tryPlace'].call(g, base.click[0], base.click[1], torchDef ?? wbDef);
  };
  // 火把顶杂草（TileObject.Place 同款清格）；石块对照拒绝
  const torchTest = async (mode) => {
    wipe();
    if (mode !== 'bare') st.setTile(qx, qy, mode === 'weed' ? WEED : STONE, 0, 0);
    if (torchDef) { holdItem(torchIdx); await standClick(); }
    return { nowTorch: st.get(qx, qy) === TORCH, obstacleKept: mode === 'stone' ? st.get(qx, qy) === STONE : true };
  };
  // 蛛网纵向对(footprint 内 2 格 + 占位矩形外上方孤格)：原版无 TileFrame 支 → 孤格必须幸存
  // （撤除同型纵扫的回归哨兵——旧扫会多杀外格）
  const webSurvivor = async () => {
    wipe();
    st.setTile(qx, qy, WEB, 0, 0); st.setTile(qx + 1, qy, WEB, 0, 0); st.setTile(qx, qy - 1, WEB, 0, 0);
    holdItem(wbIdx);
    stand(base.click[0], base.click[1]);
    await new Promise((r) => setTimeout(r, 40));
    g.player.useTime = 0;
    g['tryPlace'].call(g, base.click[0], base.click[1], wbDef);
    return { benchAt: st.get(qx, qy) === W || st.get(qx + 1, qy) === W, outerWebSurvives: st.get(qx, qy - 1) === WEB };
  };
  // 违规堆叠双杂草：占位格 + 其正上一格外格。原版 KillTile 尾 SquareTileFrame →
  // PlantCheck(down=家具=-1型失配) 杀孤儿；本仓等价链 onTileChanged→checkDecorSupport。
  const weedOrphan = async () => {
    wipe();
    st.setTile(qx, qy, WEED, 0, 0); st.setTile(qx, qy - 1, WEED, 0, 0);
    holdItem(wbIdx);
    stand(base.click[0], base.click[1]);
    await new Promise((r) => setTimeout(r, 40));
    g.player.useTime = 0;
    g['tryPlace'].call(g, base.click[0], base.click[1], wbDef);
    return { benchAt: st.get(qx, qy) === W, orphanCleaned: st.get(qx, qy - 1) !== WEED };
  };
  // ---- ④ 三轮 review：多格豁免件部分覆盖（Check2x2Style 254 / CheckSuper 444·485 /
  //      Check3x3 231 整件 wipe 真值,WorldGen.cs:52753/:48523/:53520）----
  // 免除件与工作台占位矩形只交 1 格 → 原版 Check* 族=整件消除+特支效应
  // （南瓜帧段掉 1725(:52831-52855)/蜂巢 → 655 弹落地蜂群(:48697+76611)/
  //   蚁狮幼虫 → 放 582(:48731-48750)/幼虫 → 召蜂后(KillTile case 231)）。
  const GRASS2 = idOfSheet(2);
  const PUMPKIN = idOfSheet(254), HIVES = idOfSheet(444), ANTL = idOfSheet(485), LARVA3 = idOfSheet(231);
  const enemyCount = (vid) => (g.entities.enemies ?? []).filter((e) => !e.dead && e.vanillaId === vid).length;
  const dropCount = (vid) => (g.entities.drops ?? []).filter((d) => !d.dead
    && String(items.ITEM_DEFS[d.itemId]?.key ?? '').startsWith(`vi_${vid}_`)).length;
  // 合成多格件（帧 fxBase+col*18 / row*18;bl=底左原点,底行=bl.y=占位矩形行。
  //  南瓜 fxBase=144（GrowPumpkin 第四阶段,frameX<72 原版不掉 1725,探针须成熟株）
  const buildObj = (tid, blx, bly, ow2, oh2, fxBase = 0) => {
    for (let dx = 0; dx < ow2; dx++) {
      for (let dy = 0; dy < oh2; dy++) {
        // setTileSilent：四件均非放置物品,真实构建面 = worldgen/导入静默写;
        // 逐格 setTile 会在合成中途触发 D-1 Check* 整件裁决(原版写完才级联)
        st.setTileSilent(blx + dx, bly - (oh2 - 1) + dy, tid, fxBase + dx * 18, dy * 18);
      }
    }
  };
  const envFloorGrass = (blx, bly, ow2) => { for (let dx = 0; dx < ow2; dx++) st.setTileSilent(blx + dx, bly + 1, GRASS2, 0, 0); };
  const envFloorStone = (blx, bly, ow2) => { for (let dx = 0; dx < ow2; dx++) st.setTileSilent(blx + dx, bly + 1, STONE, 0, 0); };
  const envCeil = (blx, bly, ow2) => { for (let dx = 0; dx < ow2; dx++) st.setTileSilent(blx + dx, bly - 2, STONE, 0, 0); };
  const objTest = async (tid, ow2, oh2, env, fxBase = 0) => {
    wipe();
    const blx = qx + 1, bly = qy;
    env(blx, bly, ow2);
    buildObj(tid, blx, bly, ow2, oh2, fxBase);
    const pre = { p1725: dropCount(1725), bees: enemyCount(210) + enemyCount(211), a582: enemyCount(582) };
    holdItem(wbIdx);
    stand(base.click[0], base.click[1]);
    await new Promise((r) => setTimeout(r, 40));
    g.player.useTime = 0;
    g['tryPlace'].call(g, base.click[0], base.click[1], wbDef);
    let residue = 0;
    for (let cx2 = blx - 1; cx2 <= blx + ow2; cx2++) {
      for (let cy2 = bly - oh2; cy2 <= bly + 1; cy2++) {
        if (st.inBounds(cx2, cy2) && st.get(cx2, cy2) === tid) residue++;
      }
    }
    return {
      residue,
      benchPlaced: findTileIn(W, qx - 2, qx + 5, qy - 3, qy + 1) !== null,
      p1725: dropCount(1725) - pre.p1725,
      bees: enemyCount(210) + enemyCount(211) - pre.bees,
      a582: enemyCount(582) - pre.a582,
    };
  };
  // 支撑方向：挖掉南瓜下方草 → D-1 链 checkFurnitureSupport(南瓜底行) →
  // Check2x2Style 底质门 → 整件消除 + 1725（原版 TileFrame 级联同款）
  const pumpkinSupport = async () => {
    wipe();
    const blx = qx + 1, bly = qy;
    envFloorGrass(blx, bly, 2);
    buildObj(PUMPKIN, blx, bly, 2, 2, 144);
    const pre = dropCount(1725);
    g['breakTile'].call(g, blx, bly + 1);   // 挖支撑草（等价 TileFrame 级联触发源）
    let residue = 0;
    for (let cx2 = blx - 1; cx2 <= blx + 2; cx2++) {
      for (let cy2 = bly - 2; cy2 <= bly + 1; cy2++) {
        if (st.inBounds(cx2, cy2) && st.get(cx2, cy2) === PUMPKIN) residue++;
      }
    }
    return { residue, p1725: dropCount(1725) - pre };
  };
  const res = {
    ids: { pile: PILE, stone: STONE, weed: WEED, workbench: W, torch: TORCH, web: WEB,
      pumpkin: PUMPKIN, hive: HIVES, antlion: ANTL, larva3: LARVA3, grass: GRASS2 },
    itemKey: wbDef.key, anchorProbe: vav.validateAnchors(st, qx, qy, rec18),
    base,
    bare: await singleShot('bare'),
    pile: await singleShot('pile'),
    weed: await singleShot('weed'),
    stone: await singleShot('stone'),
    torchWeed: torchDef ? await torchTest('weed') : 'no-torch-def',
    torchStone: torchDef ? await torchTest('stone') : 'no-torch-def',
    webSurvivor: await webSurvivor(),
    weedOrphan: await weedOrphan(),
    pumpkinHalf: PUMPKIN >= 0 ? await objTest(PUMPKIN, 2, 2, envFloorGrass, 144) : 'no-def',
    hiveHalf: HIVES >= 0 ? await objTest(HIVES, 2, 2, envCeil) : 'no-def',
    antlionHalf: ANTL >= 0 ? await objTest(ANTL, 2, 2, envFloorStone) : 'no-def',
    larvaHalf: LARVA3 >= 0 ? await objTest(LARVA3, 3, 3, envFloorStone) : 'no-def',
    pumpkinSupport: PUMPKIN >= 0 ? await pumpkinSupport() : 'no-def',
  };
  const halfOk = (r) => typeof r === 'object' && r.residue === 0 && r.benchPlaced;
  res.verdict = res.base.placed && res.bare.placedHere && res.pile.placedHere && res.pile.cleanCleared
    && res.weed.placedHere && res.weed.cleanCleared && !res.stone.placedHere
    && (torchDef ? res.torchWeed.nowTorch && res.torchStone.obstacleKept : true)
    && res.webSurvivor.benchAt && res.webSurvivor.outerWebSurvives
    && res.weedOrphan.benchAt && res.weedOrphan.orphanCleaned
    // 多格豁免件整件消除 + 原版特支效应（南瓜掉 1725/蜂巢出蜂/蚁狮幼虫放 582）
    && halfOk(res.pumpkinHalf) && res.pumpkinHalf.p1725 > 0
    && halfOk(res.hiveHalf) && res.hiveHalf.bees > 0
    && halfOk(res.antlionHalf) && res.antlionHalf.a582 > 0
    && halfOk(res.larvaHalf)
    && typeof res.pumpkinSupport === 'object' && res.pumpkinSupport.residue === 0
    && res.pumpkinSupport.p1725 > 0 ? 'PASS' : 'FAIL';
  inv.slots[selIdx] = savedSlot;
  return res;
});
fs.writeFileSync('/tmp/pile-place.json', JSON.stringify(out));
console.log(JSON.stringify(out));
process.exit(0);
