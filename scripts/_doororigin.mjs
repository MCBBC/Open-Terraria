// 门/高物件 Origin 点击语义探针（用户报"3 高门只能点顶格"）：
// 原版 = TileObjectData.Origin（落地家具底行/门中格）+ PlaceTile :59880 门特判
// （3 格净空内任意格点击自动寻位）。断言：
//  门：3 格净空内点顶/中/底格都放上；桌(h=2)：点底行放上、点顶行悬空拒（原版同）；
//  工作台(h=1)不受影响。
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
  const world = new World(200, 120, 777, 'door-origin');
  world.spawnX = 100; world.spawnY = 60;
  world.groundLevel = 40; world.rockLevel = 80; world.lavaLine = 100;
  const s0 = world.store;
  for (let x = 0; x < 200; x++) for (let y = 65; y < 120; y++) s0.setTile(x, y, 1);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame;
  const st = g.world.store;
  const items = await import('/src/data/items.ts');
  const t = await import('/src/data/tiles.ts');
  const { TILE_DEFS, TILE_BY_KEY } = t;
  const doorId = items.ITEM_BY_KEY['vi_25_wooden_door'] ?? items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[25]];
  const doorDef = items.ITEM_DEFS[doorId];
  const doorTile = TILE_BY_KEY[doorDef.tile];
  const tableId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[34]];   // 木桌 item 34
  const tableDef = items.ITEM_DEFS[tableId];
  const count = (tile) => {
    let n = 0;
    for (let x = 0; x < 200; x++) for (let y = 40; y < 120; y++) if (st.get(x, y) === tile) n++;
    return n;
  };
  const place = (def2, tx, ty, ptx, pty) => {
    g.player.inv.slots[0] = { id: items.ITEM_BY_KEY[def2.key] ?? 0, stack: 9 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.player.x = (ptx ?? tx) * 16 - 8; g.player.y = (pty ?? ty - 2) * 16;
    g.player.vx = 0; g.player.vy = 0;
    const tile = TILE_BY_KEY[def2.tile];
    const before = count(tile);
    g.tryPlace(tx, ty, def2);
    return count(tile) > before;
  };
  // 场地：x 94..112 地形面 y=70，上方清空；每场景 3 格净空（y 67-69）+ 两侧立柱
  const mk = (x0) => {
    for (let x = x0 - 1; x <= x0 + 2; x++) { for (let y = 60; y <= 69; y++) st.setTile(x, y, 0); st.setTile(x, 70, 1); }
    st.setTile(x0 - 1, 67, 1); st.setTile(x0 - 1, 68, 1); st.setTile(x0 - 1, 69, 1);   // 左立柱
    st.setTile(x0 + 1, 67, 1); st.setTile(x0 + 1, 68, 1); st.setTile(x0 + 1, 69, 1);   // 右立柱
    st.setTile(x0, 66, 1);                                                              // 门楣
  };
  // 门 3 格净空 (x,67..69)，楣 (x,66)，底支撑 70
  // 玩家站门外（门 solid——站门格=重叠拒,原版同）
  mk(96); const dTop = place(doorDef, 96, 67, 94, 68);     // 点顶格
  mk(99); const dMid = place(doorDef, 99, 68, 97, 68);     // 点中格
  mk(102); const dBot = place(doorDef, 102, 69, 100, 68);  // 点底格
  // 桌 h=2：净空 (x,68..69) 底支撑 70——点底行 69 放；点顶行 68 → 悬空拒
  const mkT = (x0) => {
    for (let x = x0 - 1; x <= x0 + 3; x++) { for (let y = 60; y <= 69; y++) st.setTile(x, y, 0); st.setTile(x, 70, 1); }
  };
  mkT(105); const tBottom = place(tableDef, 105, 69);
  mkT(109); const tTop = place(tableDef, 109, 68);
  return {
    door: { dTop, dMid, dBot },
    table: { tBottom, tTop },
    doorDefH: doorDef.vanilla?.fh, tableDefH: tableDef.vanilla?.fh,
  };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.door.dTop && r.door.dMid && r.door.dBot
  && r.table.tBottom === true && r.table.tTop === false;
console.log(ok ? 'PASS: 门净空任意格可放；桌点底行放/顶行拒（原版 Origin 语义）' : 'FAIL');
await browser.close();
