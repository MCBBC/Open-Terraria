// 躺床渲染探针：摆双向床(变体A枕右/变体B枕左)→真实 interactAt 入睡→
// 逐帧观察 sleeping 存活 + 截图躺姿(头端 vs 枕端)。
// 原版标杆(PlayerSleepingHelper/BoringSetup/TransformDrawData):
//   fullRotation = π/2·(−direction);origin=Size/2;Position+=posOffset(床型偏移×Directions)
//   → 变体A(dir −1)头朝右(枕右)、变体B(dir +1)头朝左(枕左)
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 360000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });

const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world && window.__swTiles)) {
    if (Date.now() - t0 > 280000) return { fatal: 'timeout' };
    await new Promise((res) => setTimeout(res, 300));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const T = window.__swTiles;
  const bed = T['bed'];
  if (bed === undefined) return { fatal: 'no-bed-key' };
  // 找一块平地:地表往下找一条实心地板线
  const px0 = Math.floor(st.w / 2);
  let gy = Math.floor(g.world.groundLevel) + 30;
  while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const floorY = gy;   // 地板行(实心)
  // 清出一块 20×8 空腔 + 垫平地板
  const bx = px0 - 10;
  for (let x = bx; x < bx + 20; x++) {
    for (let y = floorY - 8; y < floorY; y++) st.setTileSilent(x, y, 0);
    st.setTileSilent(x, floorY, T['stone_rock'] ?? T['dirt'] ?? 1);
    st.setTileSilent(x, floorY + 1, T['stone_rock'] ?? T['dirt'] ?? 1);
  }
  // 摆床:床底行 = floorY-1,顶行 = floorY-2(踩地板躺床)
  const placeBed = (x0, variantBase) => {
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 2; row++) {
        st.setTileSilent(x0 + col, floorY - 2 + row, bed, variantBase + col * 18, row * 18);
      }
    }
  };
  const results = [];
  for (const [name, base] of [['A-pillow-right', 0], ['B-pillow-left', 72]]) {
    placeBed(bx + 2, base);
    // 玩家站床旁
    const p = g.player;
    p.x = (bx + 2) * 16 - 24; p.y = (floorY - 1) * 16 - p.h;
    p.vx = 0; p.vy = 0; p.sleeping = false;
    // 真实交互:遍历床 8 格调 interactAt 直到入睡
    let slept = false;
    for (let col = 0; col < 4 && !slept; col++) {
      for (let row = 0; row < 2 && !slept; row++) {
        try { g.interactAt(bx + 2 + col, floorY - 2 + row); } catch (e) { /* 记录继续 */ }
        if (p.sleeping) slept = true;
      }
    }
    // 相机对准床中心
    g.camera.x = (bx + 4) * 16; g.camera.y = (floorY - 1) * 16;
    p.timeSleeping = 300;   // 全闭眼档
    // 渲一帧(入住当帧截图)

    g.frame(performance.now());   // 同步驱动一帧(渲染+物理)
    // 存活观察:60 tick
    const alive = [];
    for (let i = 0; i < 60; i++) { g.fixedUpdate(1 / 60); alive.push(p.sleeping ? 1 : 0); }
    g.frame(performance.now());
    results.push({
      name, slept, facing: p.facing,
      px: Math.round(p.x), py: Math.round(p.y),
      aliveTicks: alive.reduce((a, b) => a + b, 0),
      bedBottomRow: floorY - 1,
      shotTag: name + '-' + Math.round(p.x) + '-' + p.facing,
    });
    // 清床
    for (let col = 0; col < 4; col++) for (let row = 0; row < 2; row++) st.setTileSilent(bx + 2 + col, floorY - 2 + row, 0);
    p.sleeping = false;
  }
  return results;
}, { timeout: 180000 });

if (errors.length) console.log('PAGEERRORS:', errors.slice(0, 5));
if (r.fatal) { console.log('FATAL:', r.fatal); process.exit(1); }


// 逐床重做:状态设置在 page 里,截图用 page.screenshot(相机对准床中心)
for (const name of ['A-pillow-right', 'B-pillow-left']) {
  const st = await page.evaluate(async (nm) => {
    const g = window.__swGame;
    const store = g.world.store;
    const T = window.__swTiles;
    // 与第一轮同法重建场景(世界已生成,直接找地板)
    const px0 = Math.floor(store.w / 2);
    const floorY = Math.floor(g.world.groundLevel) + 3;   // 地表之上,白昼天光
    const bx = px0 - 10;
    for (let x = bx; x < bx + 20; x++) {
      for (let y = floorY - 8; y < floorY; y++) store.setTileSilent(x, y, 0);
      store.setTileSilent(x, floorY, T['stone_rock'] ?? 1);
      store.setTileSilent(x, floorY + 1, T['stone_rock'] ?? 1);
    }
    const base = nm.startsWith('A') ? 0 : 72;
    for (let col = 0; col < 4; col++) for (let row = 0; row < 2; row++)
      store.setTileSilent(bx + 2 + col, floorY - 2 + row, T['bed'], base + col * 18, row * 18);
    const p = g.player;
    p.x = (bx + 2) * 16 - 24; p.y = (floorY - 1) * 16 - p.h;
    p.vx = 0; p.vy = 0; p.sleeping = false;
    for (let col = 0; col < 4 && !p.sleeping; col++)
      for (let row = 0; row < 2 && !p.sleeping; row++)
        g.interactAt(bx + 2 + col, floorY - 2 + row);
    g.camera.x = (bx + 4) * 16; g.camera.y = (floorY - 1) * 16;
    p.timeSleeping = 300;
    for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
    g.frame(performance.now());
    // 亮度自检:屏中心 40×40 平均亮度(全黑=场景无光,截图不可用)
    const cvv = g.renderer.canvas, cc = cvv.getContext('2d');
    const d = cc.getImageData(600, 380, 40, 40).data;
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return { slept: p.sleeping, facing: p.facing, px: Math.round(p.x), py: Math.round(p.y),
             brightness: Math.round(sum / (d.length / 4)) };
  }, name);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => { window.__swGame.frame(performance.now()); });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: `/tmp/sleepbed-${name}-full.png` });
  await page.screenshot({ path: `/tmp/sleepbed-${name}.png`, clip: { x: 640 - 200, y: 400 - 130, width: 400, height: 260 } });
  console.log(`${name}: slept=${st.slept} facing=${st.facing} pos=(${st.px},${st.py}) brightness=${st.brightness} PNG: /tmp/sleepbed-${name}.png`);
}

// ---- 补充断言:CheckSpawn 门禁 / RemoveSpawn 回退 / boss actUp ----
const extra = await page.evaluate(async () => {
  const g = window.__swGame;
  const store = g.world.store;
  const T = window.__swTiles;
  const w = g.world;
  const out = {};
  const px0 = Math.floor(store.w / 2);
  let gy = Math.floor(w.groundLevel) + 30;
  while (gy < store.h - 10 && !store.isSolid(px0, gy)) gy++;
  const floorY = gy;
  const bx = px0 - 10;
  for (let x = bx; x < bx + 20; x++) {
    for (let y = floorY - 8; y < floorY; y++) store.setTileSilent(x, y, 0);
    store.setTileSilent(x, floorY, T['stone_rock'] ?? 1);
    store.setTileSilent(x, floorY + 1, T['stone_rock'] ?? 1);
  }
  // 变体A床(枕右):脚端 = 左半两列 → 设点侧
  for (let col = 0; col < 4; col++) for (let row = 0; row < 2; row++)
    store.setTileSilent(bx + 2 + col, floorY - 2 + row, T['bed'], col * 18, row * 18);
  const p = g.player;
  p.x = (bx + 2) * 16 - 24; p.y = (floorY - 1) * 16 - p.h;
  p.vx = 0; p.vy = 0; p.sleeping = false;
  const spawnBefore = [w.spawnX, w.spawnY];
  const spawn0Before = [w.spawnX0, w.spawnY0];
  // 脚端(变体A左半)点击 → 设点侧:开阔地无房间 → CheckSpawn 拒绝,spawn 不变
  g.interactAt(bx + 2, floorY - 1);
  out.spawnRefused = (w.spawnX === spawnBefore[0] && w.spawnY === spawnBefore[1]);
  // 强制"已设点"态 → 再点 → RemoveSpawn 回退 spawnX0
  const sx = (bx + 2) + 2, sy = floorY;   // bedLeft+2 / bedTop+2 = (bx+4, floorY-2+2)
  w.spawnX = sx; w.spawnY = sy;
  g.interactAt(bx + 3, floorY - 1);
  out.removeSpawnRestored = (w.spawnX === spawn0Before[0] && w.spawnY === spawn0Before[1]);
  out.spawn0Snapshot = spawn0Before;
  // boss actUp:入睡 + timeSleeping=50 → 召 boss → 计时应归零(不唤醒)
  for (let col = 0; col < 4 && !p.sleeping; col++)
    for (let row = 0; row < 2 && !p.sleeping; row++)
      g.interactAt(bx + 2 + col, floorY - 2 + row);
  if (p.sleeping) {
    p.timeSleeping = 50;
    const e = g.entities.enemies.find?.call ?? null; void e;
    const boss = (g.entities).enemies;
    // 召 EoC(vid 4,boss)
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const be = Enemy.fromVanilla(4, p.cx + 100, p.y - 60);   // EoC(boss)
    if (be) { be.id = g.entities.nextId++; g.entities.enemies.push(be); }
    g.fixedUpdate(1 / 60);
    out.bossActUpReset = p.sleeping && p.timeSleeping === 0;
    // 清 boss
    for (const en of g.entities.enemies) if (en && !en.dead) en.dead = true;
  } else out.bossActUpReset = 'no-sleep';
  // 物品使用唤醒:持剑使用 → 应唤醒(手动推 useTime 近似 itemAnimTicks)
  // 手持放一把剑:直接借 inventory? 简化:仅推 itemAnimTicks + 手持木剑
  // 手持铜短剑(damage>0 且无 noMelee) → 挥砍中(swing)应唤醒
  const items = window.__swItems;
  const swordKey = Object.keys(items).find((k) => /shortsword/.test(k));
  if (swordKey) {
    p.inv.slots[0] = { id: items[swordKey], stack: 1 };
    p.sleeping = true; p.timeSleeping = 200;
    // ★itemAnimTicks 每帧由 swing.t 注入（Game.ts:3627）——须造 swing 而非直写字段
    g.swing = { t: 5, dur: 20, item: items[swordKey] };
    g.fixedUpdate(1 / 60);
    out.itemWake = p.sleeping === false;
    out.swordKey = swordKey;
  } else out.itemWake = 'no-sword-key';
  // CanSnapToPosition 拒绝路径:床上方两行堵实心(目标盒嵌实心) → 入睡应被拒
  for (let col = 0; col < 5; col++) {
    store.setTileSilent(bx + 1 + col, floorY - 4, T['stone_rock'] ?? 1);
    store.setTileSilent(bx + 1 + col, floorY - 3, T['stone_rock'] ?? 1);
  }
  p.sleeping = false; p.useTime = 0; g.swing = null;
  p.x = (bx + 2) * 16 - 40; p.y = (floorY - 1) * 16 - p.h;   // 玩家挪到堵塞带旁
  let sleptBlocked = false;
  for (let col = 0; col < 4 && !sleptBlocked; col++)
    for (let row = 0; row < 2 && !sleptBlocked; row++) {
      g.interactAt(bx + 2 + col, floorY - 2 + row);
      sleptBlocked = p.sleeping;
    }
  out.snapBlockedRefused = !sleptBlocked;
  for (let col = 0; col < 5; col++) {
    store.setTileSilent(bx + 1 + col, floorY - 4, 0);
    store.setTileSilent(bx + 1 + col, floorY - 3, 0);
  }
  return out;
});
console.log('EXTRA', JSON.stringify(extra));
await browser.close();
