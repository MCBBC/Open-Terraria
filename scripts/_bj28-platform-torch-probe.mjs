// SW-BJ28 2026-09-08 真实管线复现探针（一次性诊断）：
// 症状一：平台放不了火把——真 tryPlace 火把支 × 几何矩阵：
//   A 平台上放置（目标=平台上空格,底锚·平台臂） B 贴平台侧（侧锚,原版应拒）
//   C 背景墙直立（墙锚对照） D 坡块上放置（AssortedThings 拍平前置）
//   E 平台上火把的失撑判定（torchStillAnchored 平台臂）
// 症状二："单向墙"歧义定谳采样：
//   (a) 手持墙对平台格/平台上空格放置（tryPlaceWall 真链）
//   (b) 平台单向通行真实物理：下跳上穿 / 顶面站立 / 按下下穿
//   (c) 致动平台（致动位后 isPlatform/hasTile/isActive）
//   (d) 平台竖排"单向墙"横向穿越（真实行走）
// 世界 = 合成空 World（patch WorldGenClient,同 _bj10-platform.mjs 先例）。
// 运行：SW_ORIGIN=http://localhost:5215 node tools/run-diag.mjs scripts/_bj28-platform-torch-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = '/tmp/bj28-shots';
fs.mkdirSync(OUT, { recursive: true });

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
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj28-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj28', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const T = tilesMod.T;
  const platId = tilesMod.TILE_BY_KEY['platform'];
  const dirtId = tilesMod.TILE_BY_KEY['dirt'];
  const stoneId = tilesMod.TILE_BY_KEY['stone'];
  const torchItem = items.ITEM_DEFS.find((d) => d.key === 'vi_8_Torch');
  const wallItem = items.ITEM_DEFS.find((d) => d.key === 'vi_26_stone_wall');
  const report = { torch: {}, wall: {}, platform: {}, errors: [] };
  g.__bj28tiles = tilesMod;   // 截图相重建用
  try {
    // ---- 地形：石地板行 130（列 40-80）----
    for (let x = 40; x <= 100; x++) st.setTileSilent(x, 130, stoneId, 0, 0);
    // 世界出生点钉到探针地板（合成世界默认 spawn 在虚空,死亡重生即虚空摔死循环）
    g.world.spawnX = 62; g.world.spawnY = 128; g.world.spawnX0 = 62; g.world.spawnY0 = 128;
    g.player.maxHp = 999999; g.player.hp = 999999; g.player.dead = false;

    const inv = g.player.inv;
    const selIdx = inv.selected;
    const savedSlot = inv.slots[selIdx];
    const holdItem = (id) => { inv.slots[selIdx] = { id, stack: 999, favorited: false, prefix: 0 }; inv.selected = selIdx; };
    const stand = (px, py) => {
      g.player.x = px * 16 + 8; g.player.y = py * 16 - 42;   // 站在 (px,py) 格（脚在格底）
      g.player.vx = 0; g.player.vy = 0; g.player.useTime = 0; g.player.dead = false;
    };
    const wait = (ms) => new Promise((r2) => setTimeout(r2, ms));
    const place = async (cx, cy, item) => {
      stand(cx, cy - 2);              // 站目标下方 2 格（够射程）
      await wait(40);
      holdItem(items.ITEM_DEFS.indexOf(item));
      g.player.useTime = 0;
      g['tryPlace'].call(g, cx, cy, item);
    };

    // ============ 症状一：火把 × 平台 ============
    // A. 平台上放置：平台行 126（列 46-56）,火把目标=平台上方空格 (50,125)
    for (let x = 46; x <= 56; x++) st.setTile(x, 126, platId, 0, 0);
    await place(50, 125, torchItem);
    report.torch.A_onPlatform = {
      tile: st.get(50, 125), frameX: st.frameX[st.idx(50, 125)],
      placed: st.get(50, 125) === T.TORCH,
    };

    // B. 贴平台侧：单块平台 (60,126) 左侧空格 (59,126)——原版应拒（平台 tileSolidTop+noAttach）
    st.setTile(60, 126, platId, 0, 0);
    await place(59, 126, torchItem);
    report.torch.B_sideOfPlatform = {
      tile: st.get(59, 126), placed: st.get(59, 126) === T.TORCH, expect: false,
    };

    // C. 墙锚对照：无块有墙 (52,127)
    st.setWallSilent(52, 127, 1);
    await place(52, 127, torchItem);
    report.torch.C_onWall = { tile: st.get(52, 127), placed: st.get(52, 127) === T.TORCH };

    // D. 坡块上放置：坡 1 石块 (68,127),目标 (68,126)——原版 AssortedThings 先拍平再放
    st.setTile(68, 127, stoneId, 0, 0);
    st.setSlope(68, 127, 1);
    await place(68, 126, torchItem);
    report.torch.D_onSlope = {
      tile: st.get(68, 126), placed: st.get(68, 126) === T.TORCH,
      slopeAfter: st.slope[st.idx(68, 127)],
    };

    // E. 平台上火把失撑判定：A 的火把在 (50,125),底锚=平台——torchStillAnchored 平台臂
    const torchMod = await import('/src/world/Torch.ts');
    report.torch.E_anchors = {
      stillAnchoredOnPlat: torchMod.torchStillAnchored(st, 50, 125, st.frameX[st.idx(50, 125)]),
      anchorFrameOnPlat: torchMod.torchAnchorFrame(st, 52, 125),
    };
    inv.slots[selIdx] = savedSlot;

    // ============ 症状二 (a)：手持墙对平台格/平台上空格放置（真 tryPlaceWall）============
    if (wallItem) {
      holdItem(items.ITEM_DEFS.indexOf(wallItem));
      stand(50, 127); await wait(40);
      g.player.useTime = 0;
      g['tryPlaceWall'].call(g, 50, 126, wallItem);       // 平台占位格放墙
      report.wall.a1_wallIntoPlatformCell = {
        wall: st.wall[st.idx(50, 126)], platformIntact: st.get(50, 126) === platId,
      };
      g.player.useTime = 0;
      g['tryPlaceWall'].call(g, 51, 125, wallItem);       // 平台上空格放墙
      report.wall.a2_wallAbovePlatform = { wall: st.wall[st.idx(51, 125)] };
      g.player.useTime = 0;
      g['tryPlaceWall'].call(g, 49, 124, wallItem);       // 平台下方空格放墙
      report.wall.a3_wallBelowPlatform = { wall: st.wall[st.idx(49, 124)] };
      inv.slots[selIdx] = savedSlot;
    } else {
      report.wall.a1_wallIntoPlatformCell = 'vi_26_stone_wall not found';
    }

    // ============ 症状二 (b)：平台单向通行真实物理（键盘真键驱动,真实 rAF 循环） ============
    // 场地：平台行 126（列 46-52,症状一 A 的同排）,玩家站地板（脚=130*16,头顶
    // 2038 vs 平台底 2032 不相交）;跳跃/下穿/横走由 Input.keys 桶驱动（fixedUpdate
    // 每拍重灌 inp.downAction,直改 player 字段会被 7749-7756 覆写）
    window.__bj28Sample = () => ({
      feetRow: (g.player.y + g.player.h) / 16,
      onGround: g.player.onGround, vy: g.player.vy, dead: g.player.dead,
      hp: g.player.hp, respawnTimer: g.player.respawnTimer,
    });
    // 复活（合成世界出生坠虚早期死亡链残留——dead/respawnTimer 需一并清）
    window.__bj28Alive = () => {
      const pl = g.player;
      pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.deadTime = 0;
      pl.respawnTimer = 0; pl._deathHandled = false; pl.ghost = false;
      pl.fallStartY = null;   // 清出生坠虚累计摔距（落地即 1050 摔伤=探针死亡环根因）
    };
    // 键注入（Input.keys=物理桶,downAction 每 tick 消费——fixedUpdate 重灌源,
    // 直改 player.inputX/inputJump 会被 7749-7756 每拍覆写,必须走键位桶）
    window.__bj28Key = (code, down) => {
      if (down) g.input.keys.add(code); else g.input.keys.delete(code);
    };
    window.__bj28Alive();
    g.player.x = 49 * 16 + 8; g.player.y = 130 * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0; g.player.dead = false;
    'probe-ready';
  } catch (e) {
    report.errors.push(String((e && e.stack) || e));
  }
  return report;
});

// ---- (b) 跳跃上穿平台（Space 按住 0.55s,真实循环推进;死亡环自愈重试×3）----
const jumpSample = [];
let standingOnPlat = false;
for (let attempt = 0; attempt < 3 && !standingOnPlat; attempt++) {
  jumpSample.length = 0;
  await page.evaluate(() => { window.__bj28Alive(); window.__bj28Key('Space', false);
    const g = window.__swGame;
    g.player.x = 49 * 16 + 8; g.player.y = 130 * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0;
    g.player.fallStartY = null;
    window.__bj28Key('Space', true); });
  for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 90)); jumpSample.push(await page.evaluate(() => window.__bj28Sample())); }
  await page.evaluate(() => window.__bj28Key('Space', false));
  await new Promise((r) => setTimeout(r, 1600));
  const fin = await page.evaluate(() => window.__bj28Sample());
  standingOnPlat = Math.abs(fin.feetRow - 126) < 0.6;
}
result.platform.b_jumpThrough = { samples: jumpSample, final: await page.evaluate(() => window.__bj28Sample()) };
result.platform.b_jumpThrough.standingOnPlat = standingOnPlat;

// ---- (b2) 顶面站立按下下穿（S 按住 0.8s）----
await page.evaluate(() => window.__bj28Key('KeyS', true));
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => window.__bj28Key('KeyS', false));
await new Promise((r) => setTimeout(r, 900));
result.platform.b_dropThrough = await page.evaluate(() => ({ ...window.__bj28Sample(), dropped: window.__bj28Sample().feetRow > 126.5 }));

// ---- (d) 平台竖排"单向墙"横向穿越（D 按住 2.6s 向右走）----
await page.evaluate(() => {
  const g = window.__swGame; const st = g.world.store;
  const platId = st.get(66, 128); // 平台内部 id（行 128 已是平台）
  for (let y = 112; y <= 128; y++) st.setTile(92, y, platId, 0, 0);
  window.__bj28Alive();
  g.player.x = 84 * 16; g.player.y = 130 * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0; g.player.dead = false;
  g.player.fallStartY = null;
});
await page.evaluate(() => window.__bj28Key('KeyD', true));
await new Promise((r) => setTimeout(r, 2600));
await page.evaluate(() => window.__bj28Key('KeyD', false));
await new Promise((r) => setTimeout(r, 400));
result.platform.d_horizontalThroughPlatformWall = await page.evaluate(() => {
  const g = window.__swGame;
  const col = (g.player.x + g.player.w / 2) / 16;
  return { playerCol: col, passed: col > 93.5 };
});

await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const report = { platform: {} };
  try {
    // (c) 致动平台采样：致动 (70,128)（平台行 128 一员）
    const wireIdx = st.idx(70, 128);
    st.wire[wireIdx] |= 32; // TileStore.WIRE_ACTUATED（=32,原版 inActive 位）
    report.platform.c_actuatedPlatform = {
      isPlatform: st.isPlatform(70, 128), hasTile: st.hasTile(70, 128), isActive: st.isActive(70, 128),
    };
    st.wire[wireIdx] &= ~32;
  } catch (e) { report.errors = [String(e)]; }
  window.__bj28c = report;
});
result.platform.c_actuatedPlatform = (await page.evaluate(() => window.__bj28c)).platform.c_actuatedPlatform;

console.log(JSON.stringify(result, null, 2));

// 截图：展场（平台+火把区 + 平台竖墙区）——先关欢迎弹窗
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, .btn, [role=button]')];
  const ok = btns.find((b) => (b.textContent || '').includes('我已知晓'));
  if (ok) ok.click();
  for (const id of ['sw-welcome-announce', 'sw-boot-prime', 'sw-splash']) {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  }
});
await new Promise((r) => setTimeout(r, 400));
// 展场重置：合成世界在此深度自带地形/岩浆（DeathScreen 复现源）——清 30×22 盒后重建
// 展示内容（平台行+火把+坡+墙锚），再移相机截图
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = g.__bj28tiles;
  const platId = tilesMod.TILE_BY_KEY['platform'];
  const stoneId = tilesMod.TILE_BY_KEY['stone'];
  const T = tilesMod.T;
  for (let x = 36; x <= 72; x++) for (let y = 110; y <= 132; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0;
  }
  for (let x = 40; x <= 66; x++) st.setTileSilent(x, 130, stoneId, 0, 0);
  for (let x = 46; x <= 56; x++) st.setTile(x, 126, platId, 0, 0);
  st.setTile(50, 125, T.TORCH, 0, 0);            // A 平台上火把
  st.setTile(60, 126, platId, 0, 0); st.setTile(59, 126, 0, 0, 0); // B 侧锚位留空
  st.setWallSilent(52, 122, 1); st.setTile(52, 122, T.TORCH, 0, 0); // C 墙锚火把
  st.setTile(64, 126, stoneId, 0, 0); st.setSlope(64, 127, 0);      // D 坡（平块对照）
  st.setTile(64, 127, stoneId, 0, 0); st.setSlope(64, 127, 1);
  st.setTile(64, 126, T.TORCH, 0, 0);
  window.__bj28Alive();
  g.player.x = 50 * 16 + 8; g.player.y = 129 * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0;
  g.player.fallStartY = null;
  g.chunks.markDirtyArea(36, 110, 72, 132);
  g.camera.x = 52 * 16; g.camera.y = 124 * 16;
});
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: OUT + '/bj28-showcase.png' });
await page.evaluate(() => {
  const g = window.__swGame;
  g.camera.x = 70 * 16; g.camera.y = 122 * 16;
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: OUT + '/bj28-platform-wall.png' });
await browser.close();
