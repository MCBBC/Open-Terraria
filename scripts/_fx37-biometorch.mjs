// SW-FX37 探针（2026-09-15）：群系炬自动转换——解锁旗 + 各群系摆普通火把真链验证。
// 原版链：PlaceThing_Tiles_PlaceIt :40447 → BiomeTorchPlaceStyle（:40550-40585）；
// 门 UsingBiomeTorches = unlockedBiomeTorches ∧ builderAccStatus[11]==0。
// 运行：SW_ORIGIN=http://localhost:5236 node tools/run-diag.mjs scripts/_fx37-biometorch.mjs
// 产物：/tmp/fx37-biometorch.png + 控制台 JSON 报表（style 值逐行对照）。
import puppeteer from 'puppeteer-core';

const SHOT = '/tmp/fx37-biometorch.png';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'fx37-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('fx37', 420, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

const report = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const stoneId = tilesMod.TILE_BY_KEY['stone'];
  const torchItem = items.ITEM_DEFS.find((d) => d.key === 'vi_8_Torch');
  const cursedItem = items.ITEM_DEFS.find((d) => d.key === 'vi_523_CursedTorch');
  const T = tilesMod.T;

  // ---- 解锁旗 + 开关 ON（[11]=0）----
  g.world.flags.unlockedBiomeTorches = true;
  g.player.builderAccStatus[11] = 0;

  // ---- 展示台：14 行石地板（x 40..96,y=124+8k）----
  const rows = [];
  for (let k = 0; k < 14; k++) {
    const fy = 124 + k * 8;
    for (let x = 40; x <= 96; x++) st.setTileSilent(x, fy, stoneId, 0, 0);
    rows.push(fy);
  }
  // 出生点钉到展示台,防虚空摔死
  g.world.spawnX = 60; g.world.spawnY = 118; g.world.spawnX0 = 60; g.world.spawnY0 = 118;
  g.player.maxHp = 999999; g.player.hp = 999999; g.player.dead = false;

  const inv = g.player.inv;
  const selIdx = inv.selected;
  const holdItem = (item) => { inv.slots[selIdx] = { id: items.ITEM_DEFS.indexOf(item), stack: 999, favorited: false, prefix: 0 }; inv.selected = selIdx; };
  const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
  // 在 (tx,fy-1) 摆火把：站旁边,同步打补丁 scene 群系旗,真 tryPlace
  const placeWith = async (tx, fy, item, zonePatch) => {
    g.player.x = (tx + 3) * 16 + 8; g.player.y = (fy - 1) * 16 - 42;
    g.player.vx = 0; g.player.vy = 0; g.player.dead = false;
    await wait(30);
    holdItem(item);
    g.player.useTime = 0;
    const savedScene = {};
    for (const k of Object.keys(zonePatch ?? {})) { savedScene[k] = g.scene[k]; g.scene[k] = zonePatch[k]; }
    g['tryPlace'].call(g, tx, fy - 1, item);
    for (const k of Object.keys(savedScene)) g.scene[k] = savedScene[k];
    const i = st.idx(tx, fy - 1);
    return {
      placed: st.type[i] === T.TORCH,
      style: st.type[i] === T.TORCH ? Math.floor(st.frameY[i] / 22) : -1,
    };
  };

  // ---- 逐群系行（真实 tryPlace + scene 旗补丁）----
  const cases = [
    ['森林(无命中)', {}],
    ['雪原', { zoneSnow: true }],
    ['丛林', { zoneJungle: true }],
    ['神圣', { zoneHallow: true }],
    ['腐化', { zoneCorrupt: true }],
    ['猩红', { zoneCrimson: true }],
    ['沙漠地表', { zoneDesert: true, belowSurface: false }],
    ['沙漠地下', { zoneDesert: true, belowSurface: true, zoneUndergroundDesert: true }],
    ['蘑菇', { zoneGlowshroom: true }],
    ['地牢', { zoneDungeon: true }],
    ['神庙', { zoneTemple: true }],
    ['微光', { zoneShimmer: true }],
    ['地狱', { zoneUnderworldHeight: true }],
  ];
  const want = [0, 9, 21, 20, 18, 19, 16, 16, 22, 13, 21, 23, 7];
  const out = [];
  for (let k = 0; k < cases.length; k++) {
    const [name, patch] = cases[k];
    const tx = 42 + k * 4;
    const r = await placeWith(tx, rows[k], torchItem, patch);
    out.push({ name, tx, ty: rows[k] - 1, ...r, want: want[k], ok: r.style === want[k] });
  }
  // 开关 OFF 行：解锁 + [11]=1 → 雪原仍普通炬（行 13 独占:tx 42）
  g.player.builderAccStatus[11] = 1;
  const offRow = await placeWith(42, rows[13], torchItem, { zoneSnow: true });
  out.push({ name: '开关OFF雪原', tx: 42, ty: rows[13] - 1, ...offRow, want: 0, ok: offRow.style === 0 });
  g.player.builderAccStatus[11] = 0;
  // 水下特支（行 13 独占格）：普通炬入水拒;咒火炬(8)入水放行
  const wx = 50, wy = rows[13] - 1;
  st.liquid[st.idx(wx, wy)] = 255;
  const waterPlain = await placeWith(wx, rows[13], torchItem, { zoneSnow: true });
  out.push({ name: '水下普通炬(雪原)', tx: wx, ty: wy, ...waterPlain, want: -1, ok: !waterPlain.placed });
  const wx2 = 58, wy2 = rows[13] - 1;
  st.liquid[st.idx(wx2, wy2)] = 255;
  const waterCursed = await placeWith(wx2, rows[13], cursedItem, {});
  out.push({ name: '水下咒火炬', tx: wx2, ty: wy2, ...waterCursed, want: 8, ok: waterCursed.style === 8 });

  // 解锁旗持存面（world.flags 全量进存档）
  return { rows, flags: { unlockedBiomeTorches: g.world.flags.unlockedBiomeTorches }, out };
});

const okAll = report.out.every((r) => r.ok);
console.log(JSON.stringify({ unlocked: report.flags.unlockedBiomeTorches, okAll, rows: report.out }, null, 2));

// ---- 截图：相机对准展示台（欢迎弹窗后建,截图前摘除;复活去死亡幕）----
await page.evaluate((rows) => {
  const g = window.__swGame;
  const w = document.getElementById('sw-welcome-announce');
  if (w) w.style.display = 'none';
  g.player.hp = g.player.maxHp; g.player.dead = false;
  g.player.x = 70 * 16; g.player.y = (rows[6] - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = 68 * 16; g.camera.y = (rows[6] - 3) * 16;
}, report.rows);
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: SHOT });
console.log('SHOT ->', SHOT);
await browser.close();
process.exit(okAll ? 0 : 2);
