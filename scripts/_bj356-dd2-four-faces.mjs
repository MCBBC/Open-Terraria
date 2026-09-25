// BJ356 DD2 四面探针：①穿墙相位（AI_107 noTileCollide 本相复现+退出）②事件期自然生成抑制门
// ③水晶受击面（NPC 互伤通道+i-frame）④事件结束埃特尼亚魔力(3822)清除链
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('424242', 4200, 1200));
await page.waitForFunction(() => window.__swGame?.player, { timeout: 300000 });
await new Promise(r => setTimeout(r, 2000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { TILE } = await import('/src/core/constants.ts');
  const st = g.world.store;
  const w = g.world;

  // ---- 平整场地：清 ±34×±16,铺 3 格厚土（y=by..by+2 实心）----
  const bx = Math.floor(g.player.cx / TILE), by = Math.floor(g.player.cy / TILE) + 4;
  for (let dx = -34; dx <= 34; dx++) for (let dy = -16; dy <= 4; dy++) st.setTile(bx + dx, by + dy, 0);
  for (let dx = -34; dx <= 34; dx++) for (let dy = 1; dy <= 3; dy++) st.setTile(bx + dx, by + dy, 1);
  await new Promise(r => setTimeout(r, 400));
  const groundY = by * TILE;
  g.player.x = (bx - 20) * TILE; g.player.y = groundY - 60; g.player.vx = 0; g.player.vy = 0;
  await new Promise(r => setTimeout(r, 300));

  // ============ ① 穿墙相位（AI_107,本相复现）============
  // 水晶 548 在左端地面;哥布林 552 右端【贴地】(feet=groundY);中间 3×8 实心墙。
  // 原版语义:无 LOS+面向目标 → noGravity/noTileCollide → 飘行穿墙;LOS 恢复 → 落地。
  const crystal = Enemy.fromVanilla(548, (bx - 24) * TILE, groundY - 44);
  g.entities.add(crystal, 'enemies');
  for (let wx = -6; wx <= -4; wx++) for (let wy = -8; wy <= -1; wy++) st.setTile(bx + wx, by + wy, 1);
  const goblin = Enemy.fromVanilla(552, (bx + 16) * TILE, groundY - 44);
  g.entities.add(goblin, 'enemies');
  await new Promise(r => setTimeout(r, 800));
  const o1 = { crystalAlive: !crystal.dead, goblinAlive: !goblin.dead, spawnFeetOnGround: Math.abs(goblin.y + goblin.h - groundY) < 24 };
  // 900 帧轨迹：中心入实心帧段 + 终态
  let solidStart = -1, solidEnd = -1, solidFrames = 0;
  for (let i = 0; i < 900; i++) {
    const tx = Math.floor(goblin.cx / TILE), ty = Math.floor(goblin.cy / TILE);
    if (st.isSolid(tx, ty)) { solidFrames++; if (solidStart < 0) solidStart = i; solidEnd = i; }
    if (i % 150 === 0) (o1.traj ??= []).push({ f: i, x: Math.round(goblin.x), y: Math.round(goblin.y), vy: +goblin.vy.toFixed(2) });
    await new Promise(r => setTimeout(r, 16));
  }
  const feet = goblin.y + goblin.h;
  o1.phaseObserved = solidFrames > 30;                        // 相位穿墙发生
  o1.exitedPhase = solidEnd < 880;                            // 最终不再嵌实心
  o1.landedOnGround = !goblin.dead && Math.abs(feet - groundY) < 20 && Math.abs(goblin.vy) < 1;
  o1.solidFrames = solidFrames; o1.solidStart = solidStart; o1.solidEnd = solidEnd;
  o1.f3SameSource = true;
  out.face1 = o1;
  // 清场①
  goblin.dead = true; crystal.dead = true;
  for (let wx = -6; wx <= -4; wx++) for (let wy = -8; wy <= -1; wy++) st.setTile(bx + wx, by + wy, 0);

  // ============ ② 事件期自然生成抑制门 ============
  // 手动置 ongoing（等同 startInvasion 后态）+ 门 549 在 4000px 内
  w.oldOnesArmy.ongoing = true;
  w.oldOnesArmy.waveNumber = 1; w.oldOnesArmy.timeLeftUntilSpawningBegins = 0;
  const portal = Enemy.fromVanilla(549, (bx + 10) * TILE, groundY - 90);
  if (portal) g.entities.add(portal, 'enemies');
  await new Promise(r => setTimeout(r, 600));
  const f2 = { ongoing: w.oldOnesArmy.ongoing, portalNear: false };
  for (const e of g.entities.enemies) {
    if (e.dead || e.vanillaId !== 549) continue;
    const dx = e.cx - g.player.cx, dy = e.cy - g.player.cy;
    if (dx * dx + dy * dy <= 4000 * 4000) f2.portalNear = true;
  }
  // 60 轮强制刷怪周期：修复后应零自然生成（DD2 怪/门/水晶除外）
  const isDD2 = (id) => (id >= 547 && id <= 578) || id === 549;
  const before = new Set(g.entities.enemies.filter(e => !e.dead).map(e => e.vanillaId));
  g.boss = null; g.player.dead = false;
  for (let i = 0; i < 60; i++) { try { g.trySpawnEnemy(); } catch (e) { f2.spawnErr = String(e); } }
  await new Promise(r => setTimeout(r, 500));
  f2.naturalSpawned = g.entities.enemies.filter(e => !e.dead && !before.has(e.vanillaId) && !isDD2(e.vanillaId)).map(e => e.vanillaId);
  f2.spawnRateNow = (() => { try { const s = g.vanillaSpawner; return s.getSpawnRate(g.player.cy, 0, false, g.camera.viewH, g.player.cx, false, false, false, false, 0, true, false, false, false, false, false); } catch (e) { return String(e); } })();
  out.face2 = f2;
  // 清场②（portal 留给 face4 前的最后状态使用后清）
  w.oldOnesArmy.ongoing = false;

  // ============ ③ 水晶受击面（NPC 互伤通道）============
  const crystal2 = Enemy.fromVanilla(548, (bx - 24) * TILE, groundY - 44);
  g.entities.add(crystal2, 'enemies');
  await new Promise(r => setTimeout(r, 300));
  const hp0 = crystal2.hp;
  const zombie = Enemy.fromVanilla(3, crystal2.cx + 30, groundY - 40);
  g.entities.add(zombie, 'enemies');
  zombie.x = crystal2.x + 8; zombie.y = crystal2.y + 4; zombie.vx = 0; zombie.vy = 0;
  await new Promise(r => setTimeout(r, 700));
  out.face3 = { crystalHurtByZombie: crystal2.hp < hp0, dmg: hp0 - crystal2.hp, vanillaIframe548: 20, oursIframe: 30 };
  crystal2.dead = true; zombie.dead = true;

  // ============ ④ 事件结束魔力清除链 ============
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const manaKey = VANILLA_ITEM_KEY_BY_ID[3822];
  const manaIid = window.__swFlow.itemByVid(3822);
  out.face4 = { manaKey, manaIid };
  w.oldOnesArmy.ongoing = true;   // 事件进行中给魔力 → 结束后应被清
  const addRes = g.player.inv.add(manaIid, 5);
  const worldDrop = g.spawnDrop(g.player.cx + 30, g.player.cy - 10, manaKey, 3, 0, 0);
  await new Promise(r => setTimeout(r, 300));
  const slotHasMana = () => g.player.inv.slots.some(s => s && (s.id === manaIid || s.key === manaKey));
  out.face4.invHadManaBefore = slotHasMana();
  out.face4.addRes = addRes;
  w.oldOnesArmy.ongoing = false;  // = 事件结束帧（vanilla: 世界掉落蒸散 + 背包逐帧 Purge）
  await new Promise(r => setTimeout(r, 1500));
  out.face4.invManaAfterEventEnd = slotHasMana();
  out.face4.worldDropGone = !worldDrop || worldDrop.dead;
  return out;
});

console.log(JSON.stringify(res, null, 2));
if (errs.length) console.log('PAGE_ERRORS:', errs.slice(0, 10));
await browser.close();
