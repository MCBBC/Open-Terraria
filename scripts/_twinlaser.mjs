// 双子激光眼 387 出弹位置探针（用户报"激光起始位置不对"）：
// 合成存档入场 → 直挂 387+目标怪 → 逐 tick 抓 389 出弹帧,记录
// 随从/激光双方 (x,y,w,h,cx,cy) + 原版期望锚(随从Center=389左上) + 截图。
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
  const W = 300, H = 180;
  const world = new World(W, H, 777, 'twin-laser-probe');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < W; x++) { for (let y = 95; y < H; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  // 目标怪在玩家右侧 180px 地表
  const tgt = Enemy.fromVanilla(3, 153 * 16, 93 * 16);
  tgt.id = g.entities.nextId++;
  g.entities.add(tgt, 'enemies');
  // 387 激光眼挂在玩家头顶
  const m = new MinionProj(g.player.cx - 8, g.player.cy - 60, 387, 20, 3, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  // 逐 tick 盯 389 出弹（比对实体引用身份）
  const before = new Set(g.entities.projectiles);
  let fired = null;
  for (let t = 0; t < 600 && !fired; t++) {
    g.fixedUpdate(1 / 60);
    for (const p of g.entities.projectiles) {
      if (!before.has(p) && p.projId === 389) { fired = { t, p, m: { ...m } }; break; }
    }
  }
  const box = (e) => ({ x: Math.round(e.x), y: Math.round(e.y), w: e.w, h: e.h, cx: Math.round(e.cx), cy: Math.round(e.cy) });
  if (!fired) return { why: 'no fire in 600t', m: box(m), tgt: box(tgt), minionClass: m.constructor.name };
  const { p, t } = fired;
  const mn = box(m), lz0 = box(p);
  // 追 30t 看激光轨迹首点方向
  const track = [];
  for (let k = 0; k < 30; k++) { g.fixedUpdate(1 / 60); if (k % 6 === 0) track.push([Math.round(p.x), Math.round(p.y)]); }
  return {
    fireTick: t,
    minion: mn,
    laser0: lz0,
    // 原版:389 左上 = 随从Center(cx,cy)（NewProjectile 直传 Center,position=左上）
    vanillaLaserTL: [mn.cx, mn.cy],
    delta: [lz0.x - mn.cx, lz0.y - mn.cy],
    laserVel: [Math.round(p.vx * 10) / 10, Math.round(p.vy * 10) / 10],
    track,
    tgtBox: box(tgt),
    minionBoxAtFire: box(fired.m),
  };
});
console.log(JSON.stringify(r, null, 1));
await new Promise((r2) => setTimeout(r2, 300));
await page.screenshot({ path: '/tmp/twin-laser.png' });
console.log('shot saved');
await browser.close();
