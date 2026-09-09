// IIII233 探针①：高尔夫进洞计分全链（headless）
//   A. 洞口正上自由落体 → 捕获链（GolfHelper.PutBallInCup :86-115：捕获+杀球+计时重置）
//   B. 远距挥杆进洞 → 轨迹分 ⌊dist/16⌋÷(hits+2) >0 → AccumulateGolfingScore
//      （clubHit 记击点=发射位,落洞记终点;两记录相距 >48px 必得正分——
//       探针用传送辅助保证几何收敛,计分链全真）
//   C. 镜头跟踪（TryGetCameraTrackingPosition :52-67）：持杆跟踪 + 落点 2s 驻留
// 运行:SW_ORIGIN=http://localhost:5289 node tools/run-diag.mjs scripts/_iii233-golf-hole.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000,
});
const p = await b.newPage();
p.on('pageerror', (e) => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small&golfprobe=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.5;
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const res = { errors: [] };

  const vanToInternal = {};
  for (const [key, tid] of Object.entries(TILE_BY_KEY)) {
    const vd = TILE_DEFS[tid]?.vanilla?.sheet;
    if (vd !== undefined && vanToInternal[vd] === undefined) vanToInternal[vd] = tid;
  }
  const GOLFCUP_GRASS = vanToInternal[477], CUP = vanToInternal[476], STONE = vanToInternal[1];
  res.tileIds = { GOLFCUP_GRASS, CUP, STONE };

  // ---- 场地：60 tile 修剪草（GolfGrass 477）果岭 + 端点球洞（476）----
  const ptx = Math.floor(g.player.cx / TILE);
  const pty = Math.floor(g.player.cy / TILE) + 2;
  let gy = pty;
  while (gy < st.h - 4 && !st.isSolid(ptx, gy)) gy++;
  const x0 = ptx - 10;
  for (let x = x0; x < x0 + 60; x++) {
    for (let y = gy - 6; y < gy; y++) { st.setTile(x, y, 0); st.setWall(x, y, 0); }
    st.setTile(x, gy, GOLFCUP_GRASS);
    for (let y = gy + 1; y <= gy + 3; y++) st.setTile(x, y, STONE);
  }
  const cupX = x0 + 52;
  st.setTile(cupX, gy, CUP);
  g.camera.x = (x0 + 30) * TILE; g.camera.y = (gy - 3) * TILE;
  res.site = { cupX, gy };
  await sleep(300);

  // 持高尔夫球杆（IsAGolfingItem → 跟踪态不被 Update 掐断）
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const clubKey = VANILLA_ITEM_KEY_BY_ID[4039];
  g.player.inv.slots[0] = { id: g.ITEM_BY_KEY?.[clubKey] ?? (await import('/src/data/items.ts')).ITEM_BY_KEY[clubKey], stack: 1 };
  g.player.inv.selected = 0;
  await sleep(200);

  const waitShouldScoreHole = async () => {
    for (let i = 0; i < 40; i++) {
      if (g.golfState.shouldScoreHole) return true;
      await sleep(100);
    }
    return g.golfState.shouldScoreHole;
  };
  await waitShouldScoreHole();

  const GolfBallMod = await import('/src/entities/GolfBall.ts');
  const mkBall = (px, py, vid) => {
    const own = g.player;
    const ball = new GolfBallMod.GolfBall(px, py, vid, () => own, false);
    g.entities.add(ball, 'projectiles');
    return ball;
  };

  // ---- A. 洞口正上落体进洞（捕获链）----
  const beforeScore = g.player.golferScoreAccumulated;
  const ballA = mkBall(cupX * TILE + 8, (gy - 4) * TILE, 721);
  ballA.clubHit(0.01, -0.01, 0, GOLFCUP_GRASS);   // 1 杆（swings=1+RecordSwing）
  await sleep(2500);
  res.A = {
    ballDead: !!ballA.dead,
    score: g.player.golferScoreAccumulated - beforeScore,
    shouldScoreHole: g.golfState.shouldScoreHole,
  };

  // ---- B. 远距挥杆进洞（轨迹分>0 → AccumulateGolfingScore）----
  // clubHit 在发射位记击点 → 传送球至洞口上方 → 落洞记终点 →
  // GetGolfBallScore = ⌊(dist/16)⌋ ÷ (1+2)，再乘 ScoreAdjustment（golfScoreTime/3600
  // ——A 进洞 ResetScoreTime 归零,须等满 3600t 折扣窗回升到 1.0,否则 ⌊20×0.04⌋=0）
  await sleep(62000);
  res.B_prep = { scoreTime: g.golfState.scoreTime, adjustment: g.golfState.scoreAdjustment };
  const swingDistPx = 1000;                        // 62 tile → 62÷3 = 20 分
  const ballB = mkBall(cupX * TILE + 8 - swingDistPx, (gy - 3) * TILE, 721);
  ballB.clubHit(1, -0.01, 0, GOLFCUP_GRASS);       // 击点 = (cupX-62.5, gy-3) tile
  ballB.x = cupX * TILE + 4; ballB.y = (gy - 4) * TILE;   // 传送至洞口上方落洞
  ballB.vx = 0; ballB.vy = 0;
  await sleep(2500);
  res.B = {
    ballDead: !!ballB.dead,
    scoreB: g.player.golferScoreAccumulated - beforeScore - res.A.score,
    totalScore: g.player.golferScoreAccumulated,
  };

  // ---- C. 镜头跟踪 + 落点驻留 ----
  const ballC = mkBall(cupX * TILE + 8 - 120, (gy - 6) * TILE, 721);
  ballC.clubHit(0.8, -0.01, 0, GOLFCUP_GRASS);
  await sleep(150);
  res.C = {
    tracking: !!g.golfState.tryGetCameraTrackingPosition(),
    waiting: g.golfState.waitingForBallToSettle,
  };
  g.golfState.recordBallInfo(ballC);               // 等价进洞时的 RecordBallInfo
  const rec = g.golfState.tryGetCameraTrackingPosition();
  ballC.dead = true;
  await sleep(120);
  res.C.lingerAfterDeath = !!g.golfState.tryGetCameraTrackingPosition();
  res.C.lingerPos = rec;
  return res;
});
console.log(JSON.stringify(out, null, 2));
const ok = !!(out && out.A && out.A.ballDead && out.B && out.B.scoreB > 0
  && out.C && out.C.tracking && out.C.lingerAfterDeath);
console.log(ok ? 'III233-GOLF-PROBE: PASS' : 'III233-GOLF-PROBE: FAIL');
await b.close();
process.exit(ok ? 0 : 1);
