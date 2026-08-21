// 用户报"放工作台到杂草地面要先打草再点"——穷举草丛场景复现：
// ①草丛在鼠标格(1×1 tallgrass) ②草丛在第二本体格 ③丛林高草 74(1×2)在鼠标格
// ④高草上半在本体区外(上方残留检查) ⑤草丛在支撑行(原版=拒)
// 每场景一次 tryPlace 断言：草被切 + 工作台放上（一次点击完成）
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
  const world = new World(200, 120, 777, 'weed-cut');
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
  const JP = TILE_BY_KEY['v_74_jungle_tall_plants'];
  // 场地：x 92..108 地形面 y=70（草块 2），上方清空
  for (let x = 92; x <= 108; x++) { for (let y = 40; y <= 69; y++) st.setTile(x, y, 0); st.setTile(x, 70, 2); }
  const run = (tx, ty) => {
    g.player.inv.slots[0] = { id: benchId, stack: 99 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.player.x = tx * 16 - 8; g.player.y = (ty - 3) * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.tryPlace(tx, ty, benchDef);
  };
  const snap = (x0, x1, y) => {
    let bench = 0, weed = 0;
    for (let x = x0; x <= x1; x++) {
      if (st.get(x, y) === benchTile) bench++;
      if (st.get(x, y) === WEED || st.get(x, y) === JP) weed++;
    }
    return { bench, weed };
  };
  // ① 草丛在鼠标格：(95,69)=tallgrass，台放 (95,69)-(96,69)
  st.setTile(95, 69, WEED);
  run(95, 69);
  const s1 = snap(95, 96, 69);
  // ② 草丛在第二本体格：(98,70) 草块上 (99,69)=tallgrass，台放 (98,69)-(99,69)
  st.setTile(99, 69, WEED);
  run(98, 69);
  const s2 = snap(98, 99, 69);
  // ③ 丛林高草 74 (1×2) 在鼠标格：(101,69)+(101,68)，台放 (101,69)-(102,69)
  if (JP) { st.setTile(101, 69, JP); st.setTile(101, 68, JP); }
  run(101, 69);
  const s3 = { ...snap(101, 102, 69), weedTop: st.get(101, 68) };
  // ④ 高草(整株 1×2)在第二本体格：台放 (104,69)-(105,69)，(104,69)+(104,68) 高草
  if (JP) { st.setTile(104, 69, JP); st.setTile(104, 68, JP); }
  run(104, 69);
  const s4 = { ...snap(104, 105, 69), weedTop: st.get(104, 68) };
  // ⑤ 草丛在支撑行旁（对照：支撑行实心，草丛在 y=68 非本体）——应直接放上
  st.setTile(107, 68, WEED);
  run(107, 69);
  const s5 = snap(107, 108, 69);
  return {
    weedId: WEED, jpId: JP,
    s1_weedAtCursor: s1,      // 期望 bench=2 weed=0
    s2_weedAtSecond: s2,      // 期望 bench=2 weed=0
    s3_jungleTall: s3,        // 期望 bench=2 weed=0 且 weedTop=0（上半也被清）
    s4_topOutside: s4,        // 上半在本体区外——检查残留
    s5_control: s5,           // 期望 bench=2
  };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.s1_weedAtCursor.bench === 2 && r.s1_weedAtCursor.weed === 0
  && r.s2_weedAtSecond.bench === 2
  && r.s3_jungleTall.bench === 2 && r.s3_jungleTall.weedTop === 0
  && r.s4_topOutside.weedTop === 0 && r.s4_topOutside.bench === 2
  && r.s5_control.bench === 2;
console.log(ok ? 'PASS: 一次点击切整株草+放台' : 'FAIL');
await browser.close();
