// 工作台支撑规则探针（用户报"居然能把工作台放在杂草上面"）：
// 原版 Place2x1（WorldGen.cs:47391，tile 18 工作台 2×1）= 支撑行【逐格 SolidTile2】
// (active+tileSolid+无坡+无半砖) + 本体区全空气（tileCut 草先切）。断言：
//  ①杂草上放 → 拒绝  ②实心上放 → 成功  ③平台上放 → 拒绝  ④半砖上放 → 拒绝
//  ⑤本体压草丛 → 切草放成功  ⑥挂墙 → 成功
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(200, 120, 777, 'wb-support');
  world.spawnX = 100; world.spawnY = 60;
  world.groundLevel = 40; world.rockLevel = 80; world.lavaLine = 100;
  const st0 = world.store;
  for (let x = 0; x < 200; x++) for (let y = 65; y < 120; y++) st0.setTile(x, y, 1);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const st = g.world.store;   // ★loadJson 重建 world——旧 store 引用已失效
  const items = await import('/src/data/items.ts');
  const t = await import('/src/data/tiles.ts');
  const { TILE_DEFS, TILE_BY_KEY } = t;
  const benchId = items.ITEM_BY_KEY['vi_36_work_bench'];
  const benchDef = items.ITEM_DEFS[benchId];          // ★物品表（曾误拿 TILE_DEFS）
  const benchTile = TILE_BY_KEY[benchDef.tile];       // 内部 tile id
  const benchSheet = TILE_DEFS[benchTile]?.vanilla?.sheet;   // 应=18
  const benchW = benchDef.vanilla?.grid?.[0] ?? 2;
  const benchH = benchDef.vanilla?.grid?.[1] ?? 1;
  // 各场景放置（走真实 tryPlace：手持+选中格+清 useTime）
  const attempt = (tx, ty) => {
    g.player.inv.slots[0] = { id: benchId, stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.input.uiBlocking = false;
    g.player.x = tx * 16 - 8; g.player.y = (ty - 3) * 16;   // 挪到目标旁（防到达/重叠门）
    g.player.vx = 0; g.player.vy = 0;
    const before = { bench: 0, weeds: 0 };
    for (let x = 0; x < 200; x++) for (let y = 60; y < 120; y++) {
      if (st.get(x, y) === benchTile) before.bench++;
    }
    g.tryPlace(tx, ty, items.ITEM_DEFS[benchId]);
    let placed = 0;
    for (let x = 0; x < 200; x++) for (let y = 60; y < 120; y++) {
      if (st.get(x, y) === benchTile) placed++;
    }
    g.player.inv.slots[0] = null;
    return placed > before.bench;
  };
  // 场景挪到玩家出生点旁（tile 95-105；tryPlace 有到达距离门）
  const dbg = { benchId, tile: benchDef?.tile, tileId: benchTile,
    tileSheet: TILE_DEFS[benchTile]?.vanilla?.sheet, w: benchW, h: benchH };
  const clearCol = (x, y0, y1) => { for (let y = y0; y <= y1; y++) st.setTile(x, y, 0); };
  // 地形面 y=70；工作台放 y=69（本体），支撑行=70
  for (let x = 95; x <= 105; x++) { clearCol(x, 60, 69); st.setTile(x, 70, 1); }
  const setWeed = (x, y) => { st.setTile(x, y - 1, 2); st.setTile(x, y, 3); };   // 草上草丛
  // ① 杂草支撑：(95,70) 草+草丛(95,69)，台放 (95,69)? 本体区会撞草丛→ 放 (94,69)?
  //    干净场景：支撑行 (95,70)=草(实心✓) (96,70)=土✓，但 (95,69) 放草丛 → 台放 (95,69)
  //    本体区撞草丛 → 走切草支。纯"杂草当支撑"场景 = 支撑行 (95,69)? 台在 (95,68)，
  //    支撑行 y=69: (95,69)=草丛 ✗ (96,69)=空 ✗ → 拒
  const WEED = TILE_BY_KEY['tallgrass'];
  st.setTile(95, 70, 2); st.setTile(95, 69, WEED); st.setTile(96, 69, 0); st.setTile(96, 70, 1);
  const onWeed = attempt(95, 68);
  // ② 实心支撑
  clearCol(98, 60, 69); clearCol(99, 60, 69); st.setTile(98, 70, 1); st.setTile(99, 70, 1);
  const onSolid = attempt(98, 69);
  // ③ 平台支撑
  st.setTile(100, 70, 19); st.setTile(101, 70, 19);
  const onPlatform = attempt(100, 69);
  // ④ 半砖支撑
  st.setTile(102, 70, 1); st.setTile(103, 70, 1);
  st.half[st.idx(102, 70)] = 1; st.half[st.idx(103, 70)] = 1;
  const onHalf = attempt(102, 69);
  // ⑤ 本体压草丛（草丛在 (104,69) 本体区，支撑 (104,70)(105,70) 实心）→ 切草放成功
  st.setTile(104, 69, WEED);
  const overWeedArea = attempt(104, 69);
  // ⑥ 挂墙（无支撑行,背后有墙）
  clearCol(96, 60, 70); clearCol(97, 60, 70);
  st.setTile(96, 70, 0); st.setTile(97, 70, 0);
  for (let y = 60; y <= 70; y++) { st.setWall(96, y, 1); st.setWall(97, y, 1); }
  const onWall = attempt(96, 69);
  // 诊断:直接调 hasSupport 各场景（绕过 tryPlace 其它门）
  const hs = (x, y) => g.hasSupport.call(g, x, y, benchW, benchH, true, false);
  const diag = {
    solidGround: [st.get(98, 70), st.get(99, 70)],
    hsOnSolid: hs(98, 69),
    hsOnWeed: (() => { st.setTile(95, 70, 2); st.setTile(95, 69, 3); st.setTile(96, 69, 0); st.setTile(96, 70, 1); return hs(95, 68); })(),
    benchTileId: benchTile,
  };
  return { dbg, diag,
    onWeed, onSolid, onPlatform, onHalf, overWeedArea, onWall };
});
console.log(JSON.stringify(r, null, 1));
const ok = (r.dbg.tileSheet ?? r.dbg.sheet) === 18 && r.onWeed === false && r.onSolid === true
  && r.onPlatform === false && r.onHalf === false && r.overWeedArea === true && r.onWall === true;
console.log(ok ? 'PASS: 原版支撑规则（杂草/平台/半砖拒,实心/切草/挂墙过）' : 'FAIL');
await browser.close();
