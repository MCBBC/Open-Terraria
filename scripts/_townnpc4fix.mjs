// 城镇 NPC 四项行为修复的活体验证（2026-08-17 批，TownNPC.ts）：
//  P0-1 危险逃离：敌近 → 背向逃 + 逃速越 0.8 帽（满血 0.8×1.5=1.2）
//  P0-2 帧：弓攻击态帧 = num58+GetShootingFrame(aim)（平射 23）；坐姿帧 = num58−3（向导 18）
//  P1-3 白天随机坐椅：正午行走踩椅列 → 坐下（原版无昼夜门 NPC.cs:55774-55814）
//  P1-7 越障三档跳：2 格墙 vy=-5 / 3 格墙 vy=-6（观测含当 tick 重力 +0.4）；压顶 → 转身
// 探针经 vite dev server 页面内 import 模块表（/src/*.ts 由 vite 转 ESM 直服）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const [{ TILE_BY_KEY }, { VANILLA_NPCS }, { townNpcBaseFrame }] = await Promise.all([
    import('/src/data/tiles.ts'),
    import('/src/data/vanillaNpcs.ts'),
    import('/src/entities/TownNPC.ts'),
  ]);
  const CHAIR = TILE_BY_KEY['chair'];
  const g = window.__swGame, st = g.world.store;
  const TILE = 16;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const px = Math.floor(g.player.x / TILE), py = Math.floor(g.player.y / TILE);
  const floor = py + 8, L = px - 60, R = px + 60;
  const floorType = st.type[st.idx(px, floor + 1)] || 1;
  for (let x = L; x <= R; x++) {
    for (let y = floor - 14; y <= floor + 2; y++) st.setTileSilent(x, y, 0);
    st.setTileSilent(x, floor, floorType);
    st.setTileSilent(x, floor + 1, floorType);
  }
  const npc = (g.entities.npcs || []).find(n => n.npcKey === 'guide') || (g.entities.npcs || [])[0];
  if (!npc) return { error: 'no town npc in bucket' };
  const vid = npc.vanillaId;
  const frames = VANILLA_NPCS[String(vid)].frames;
  const base = townNpcBaseFrame(vid, frames);
  npc.home = null; npc.leashHome = false; npc.stationary = false; npc.dead = false;
  npc.x = (L + 8) * TILE; npc.y = floor * TILE - npc.h; npc.vx = 0; npc.vy = 0;
  const jumps = [];
  const origFU = npc.fixedUpdate.bind(npc);
  npc.fixedUpdate = (dt, game) => { origFU(dt, game); if (npc.vy < 0) jumps.push(+npc.vy.toFixed(2)); };
  const res = { npcKey: npc.npcKey, vanillaId: vid, frames, base, sitFrame: base - 3 };

  // ---------- Phase A（正午）：P0-1 逃离 + P0-2 攻击帧 ----------
  g.world.clock.timeOfDay = 0.5;
  await sleep(300);
  const slime = g.spawnEnemy('slime_green', npc.x + 6 * TILE, floor * TILE - 20);
  let minVx = 0; const atkStates = new Set(), atkFrames = new Set();
  const x0 = npc.cx;
  const t0 = performance.now();
  const keep = setInterval(() => {
    if (slime && !slime.dead) { slime.x = npc.cx + 4 * TILE; slime.y = floor * TILE - slime.h; slime.vx = 0; slime.vy = 0; }
  }, 60);
  while (performance.now() - t0 < 4000) {
    await sleep(50);
    minVx = Math.min(minVx, npc.vx);
    atkStates.add(npc.attackState);
    if (npc.attackState) atkFrames.add(npc.frame);
  }
  clearInterval(keep);
  res.flee = {
    fledLeft: npc.cx < x0 - 3 * TILE, dxTiles: +((npc.cx - x0) / TILE).toFixed(1),
    speedBoost: minVx <= -1.0, minVx: +minVx.toFixed(2),
    atkStates: [...atkStates], atkFrames: [...atkFrames].sort((a, b) => a - b),
    atkFramesInBand: [...atkFrames].every(f => f >= base && f <= base + 4),
  };
  if (slime) slime.dead = true;
  await sleep(500);

  // ---------- Phase B（正午）：P1-3 白天随机坐椅 + P0-2 坐姿帧 ----------
  for (let k = 0; k < 10; k++) {
    const cx = L + 20 + k * 3;
    st.setTileSilent(cx, floor - 2, CHAIR, 0, 0);
    st.setTileSilent(cx, floor - 1, CHAIR, 0, 18);
  }
  npc.sitting = false;
  npc.leashHome = true; npc.home = { x: L + 34, y: floor - 1 };   // 定向走进椅阵（>10 格恒折返向锚）
  npc.x = (L + 10) * TILE; npc.y = floor * TILE - npc.h; npc.vx = 0; npc.vy = 0;
  const t1 = performance.now();
  while (performance.now() - t1 < 25000 && !npc.sitting) await sleep(100);
  res.daySit = {
    isDay: g.world.clock.isDay, sat: npc.sitting,
    satAtMs: npc.sitting ? Math.round(performance.now() - t1) : -1,
    frame: npc.frame, frameIsSitBand: npc.frame === base - 3,
    cxTile: Math.floor(npc.cx / TILE), bottomRow: Math.floor((npc.y + npc.h) / TILE),
    facing: npc.facing,
  };
  npc.sitting = false; npc.leashHome = false; npc.home = null;
  npc.x = (L + 8) * TILE; npc.y = floor * TILE - npc.h; npc.vx = 0; npc.vy = 0;
  for (let k = 0; k < 10; k++) {
    const cx = L + 20 + k * 3;
    st.setTileSilent(cx, floor - 2, 0); st.setTileSilent(cx, floor - 1, 0);
  }
  await sleep(300);

  // ---------- Phase C（正午）：P1-7 三档跳 + 压顶转身 ----------
  jumps.length = 0;
  npc.leashHome = true; npc.home = { x: R - 6, y: floor - 1 };   // 定向右走
  const wA = Math.floor(npc.cx / TILE) + 14;
  for (let y = floor - 2; y <= floor - 1; y++) st.setTileSilent(wA, y, floorType);   // 2 格墙
  let j2 = 0;
  let t2 = performance.now();
  while (performance.now() - t2 < 12000 && !j2) { await sleep(100); j2 = jumps.length ? jumps[0] : 0; }
  res.jump2 = { obsVy: j2, expect: -5 + 0.4, ok: j2 === -5 + 0.4 };
  for (let y = floor - 3; y <= floor - 1; y++) st.setTileSilent(wA, y, floorType);   // 加到 3 格墙
  npc.x = (wA - 6) * TILE; npc.y = floor * TILE - npc.h; npc.vx = 0; npc.vy = 0;
  jumps.length = 0;
  let j3 = 0;
  t2 = performance.now();
  while (performance.now() - t2 < 12000 && !j3) { await sleep(100); j3 = jumps.length ? jumps[0] : 0; }
  res.jump3 = { obsVy: j3, expect: -6 + 0.4, ok: j3 === -6 + 0.4 };
  // 压顶：净空堵 → 转身（flag26 facing/vx 瞬时翻转——leash 每 tick 重推 wantDir 是
  // 仓库既有近似，翻转向后立即被锚向重置，故 20ms 高频采样捕捉瞬态；同期 vy<0
  // 采样应保持空 = 全程未跳）
  for (let x = wA - 2; x <= wA + 2; x++) st.setTileSilent(x, floor - 5, floorType);
  jumps.length = 0;
  let sawFlip = false;
  t2 = performance.now();
  while (performance.now() - t2 < 8000) {
    await sleep(20);
    if (npc.facing === -1 && Math.abs(npc.cx - wA * TILE) < 3 * TILE) sawFlip = true;
  }
  res.turn = { sawFlip, jumpsDuringCeiling: jumps.length, cxTile: Math.floor(npc.cx / TILE), wallTile: wA };
  npc.fixedUpdate = origFU;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
