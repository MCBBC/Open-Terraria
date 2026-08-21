// 放置域 review 探针（2026-08-21 全面 review）：
// #39 射程门：tryPlace 超距（>reach.x）拒绝 / 距内成功
// #40 失撑掉落：工作台放实心上 → 挖支撑 → 整件消失+掉落物
// #41 合成站范围：工作台在 dx=5（原 reach 旧值 ±4 漏）→ stationsNearby 含 workbench
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
  const world = new World(200, 120, 777, 'place-review');
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
  const benchId = items.ITEM_BY_KEY['vi_36_work_bench'];
  const benchDef = items.ITEM_DEFS[benchId];
  const benchTile = TILE_BY_KEY[benchDef.tile];
  const WEED = TILE_BY_KEY['tallgrass'];
  const countBench = () => {
    let n = 0;
    for (let x = 0; x < 200; x++) for (let y = 40; y < 120; y++) if (st.get(x, y) === benchTile) n++;
    return n;
  };
  const drops = () => g.entities.drops.length;
  const place = (tx, ty, move = true) => {
    g.player.inv.slots[0] = { id: benchId, stack: 9 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    if (move) { g.player.x = tx * 16 - 8; g.player.y = (ty - 3) * 16; }
    g.player.vx = 0; g.player.vy = 0;
    const before = countBench();
    g.tryPlace(tx, ty, benchDef);
    return countBench() > before;
  };
  // 场地：x 90..110 地形面 y=70，上方全清
  for (let x = 90; x <= 110; x++) { for (let y = 40; y <= 69; y++) st.setTile(x, y, 0); st.setTile(x, 70, 1); }
  // ---- #39 射程门 ----
  const reach = g.tileReach(0);
  const farX = 100 + reach.x + 3;   // 超出射程
  for (let y = 40; y <= 69; y++) st.setTile(farX, y, 0);
  st.setTile(farX, 70, 1); st.setTile(farX + 1, 70, 1);
  g.player.x = 100 * 16; g.player.y = 66 * 16;
  const farOk = place(farX, 69, false);     // 期望 false（超距拒；不挪玩家）
  const nearOk = place(100, 69);            // 期望 true（距内放）
  // ---- #40 失撑掉落 ----
  // 工作台在 (100,69)（上面刚放的），支撑行 (100,70)(101,70)
  const dropsBefore = drops();
  const benchBefore = countBench();
  st.setTile(100, 70, 0);                    // 挖左支撑
  g.checkFurnitureSupport(100, 69);          // 钩子等价调用（onTileChanged 同参）
  const benchAfter = countBench();
  const dropSpawned = drops() > dropsBefore;
  // ---- #41 合成站范围 ----
  // 工作台放在玩家右 5 格处（旧 ±4 漏检）
  st.setTile(105, 69, benchTile); st.setTile(106, 69, benchTile);
  g.player.x = 100 * 16; g.player.y = 66 * 16;
  const stations = g.stationsNearby();
  const hasWorkbench = stations.has('workbench');
  return {
    reach: { ...reach },
    farOk, nearOk,
    supportLoss: { benchBefore, benchAfter, dropSpawned },
    stationRange: { hasWorkbench, stations: [...stations] },
  };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.farOk === false && r.nearOk === true
  && r.supportLoss.benchAfter === r.supportLoss.benchBefore - 2 && r.supportLoss.dropSpawned
  && r.stationRange.hasWorkbench;
console.log(ok ? 'PASS: 射程门/失撑掉落/合成站范围 全过' : 'FAIL');
await browser.close();
