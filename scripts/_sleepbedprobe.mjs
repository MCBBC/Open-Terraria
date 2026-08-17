// 躺床渲染探针：摆双向床(变体A枕右/变体B枕左)→真实 interactAt 入睡→
// 逐帧观察 sleeping 存活 + 截图躺姿(头端 vs 枕端)。
// 原版标杆(PlayerSleepingHelper/BoringSetup/TransformDrawData):
//   fullRotation = π/2·(−direction);origin=Size/2;Position+=posOffset(床型偏移×Directions)
//   → 变体A(dir −1)头朝右(枕右)、变体B(dir +1)头朝左(枕左)
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });

const r = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!(window.__swGame?.player && window.__swGame.world)) {
    if (Date.now() - t0 > 120000) return { fatal: 'timeout' };
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
    // 存活观察:60 tick
    const alive = [];
    for (let i = 0; i < 60; i++) { g.fixedUpdate(1 / 60); alive.push(p.sleeping ? 1 : 0); }
    // 截图(以床为中心 320×160 裁剪)
    const cv = g.renderer.canvas;
    const scale = cv.width / 1280;
    const crop = document.createElement('canvas');
    crop.width = 360; crop.height = 200;
    const cctx = crop.getContext('2d');
    // 屏幕坐标:床中心 world → screen
    const sx = ((bx + 4) * 16 - (g.camera.x - 640)) * scale;
    const sy = ((floorY - 1) * 16 - (g.camera.y - 400)) * scale;
    cctx.drawImage(cv, sx - 180 * scale, sy - 100 * scale, 360 * scale, 200 * scale, 0, 0, 360, 200);
    results.push({
      name, slept, facing: p.facing,
      px: Math.round(p.x), py: Math.round(p.y),
      aliveTicks: alive.reduce((a, b) => a + b, 0),
      bedBottomRow: floorY - 1,
      png: crop.toDataURL('image/png'),
    });
    // 清床
    for (let col = 0; col < 4; col++) for (let row = 0; row < 2; row++) st.setTileSilent(bx + 2 + col, floorY - 2 + row, 0);
    p.sleeping = false;
  }
  return results;
}, { timeout: 180000 });

if (errors.length) console.log('PAGEERRORS:', errors.slice(0, 5));
if (r.fatal) { console.log('FATAL:', r.fatal); process.exit(1); }
for (const res of r) {
  console.log(`${res.name}: slept=${res.slept} facing=${res.facing} pos=(${res.px},${res.py}) aliveTicks=${res.aliveTicks}/60`);
  writeFileSync(`/tmp/sleepbed-${res.name}.png`, Buffer.from(res.png.split(',')[1], 'base64'));
  console.log(`  PNG: /tmp/sleepbed-${res.name}.png`);
}
await browser.close();
