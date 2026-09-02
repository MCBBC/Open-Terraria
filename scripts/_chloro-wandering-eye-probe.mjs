// 终验：叶绿弹 207 对游荡眼球怪(133)索敌（用户实报失效——曾误列 vid 133 于
// canBeChasedBy 排除集）。生成真实体对账：锁定 chloAi1 + 转向朝目标
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const p = g.player;
  // 游荡眼球：头顶 120px 空中（曼哈顿 ~120,深锁圈;高空开膛视线无遮挡）
  const eye = Enemy.fromVanilla(133, p.cx + 60, p.cy - 120);
  if (!eye) return { err: 'fromVanilla(133) null' };
  eye.hostile = true;
  g.entities.add(eye, 'enemies');
  // 三发叶绿弹：一发散布在玩家位置（AI_001 索敌圈 300）
  const bullets = [];
  for (const [dx, dy] of [[0, 0], [40, -30], [-30, -50]]) {
    const b = new Arrow(p.cx + dx, p.cy + dy, 0.5, -3, 10, 0, 207, null, null);
    g.entities.add(b, 'projectiles');
    bullets.push(b);
  }
  // 对照组：训练假人 488（immortal,应保持不锁）
  const dummy = Enemy.fromVanilla(488, p.cx - 150, p.cy - 100);
  if (dummy) { g.entities.add(dummy, 'enemies'); }
  const bDummy = new Arrow(p.cx - 150, p.cy, 0.5, -3, 10, 0, 207, null, null);
  g.entities.add(bDummy, 'projectiles');
  // 诊断：门/视线/距离直接读数（弹[0]→眼）
  const { canBeChasedBy } = await import('/src/entities/projTargets.ts');
  const { canHitLine } = await import('/src/physics/LineOfSight.ts').catch(() => ({}));
  const b0 = bullets[0];
  const diag = {
    gate: canBeChasedBy ? canBeChasedBy(eye) : 'n/a',
    los: canHitLine ? canHitLine(g.world.store, b0.cx, b0.cy, 0, 0, eye.x, eye.y, eye.w, eye.h) : 'n/a',
    manh: Math.abs(b0.cx - (eye.x + eye.w / 2)) + Math.abs(b0.cy - (eye.y + eye.h / 2)),
    bulletAlive: b0.life > 0 || !b0.dead,
    projId: b0.projId,
  };
  // 隔离测试：手动驱动一个子步（绕过游戏循环），读锁与 enemies 桶
  const dbg = (() => {
    const bT = new Arrow(p.cx, p.cy - 10, 0.5, -3, 10, 0, 207, null, null);
    g.entities.add(bT, 'projectiles');
    const ids = (g.enemies() ?? []).map((e) => ({ id: e.id, vid: e.vanillaId, dead: e.dead }));
    bT.subStepAI?.(g);
    return { bucketHasEye: ids.some((i) => i.vid === 133), idsCount: ids.length,
      eyeId: ids.find((i) => i.vid === 133)?.id, lockAfterManual: bT.chloAi1 };
  })();
  await new Promise((r) => setTimeout(r, 1500));
  return {
    dbg,
    diag,
    eyeAlive: !eye.dead,
    eyeVid: eye.vanillaId,
    locks: bullets.map((b) => b.chloAi1),
    eyeLocked: bullets.some((b) => b.chloAi1 !== 0),
    steerToward: bullets.some((b) => {
      const dx = (eye.x + eye.w / 2) - b.cx, dy = (eye.y + eye.h / 2) - b.cy;
      return (b.vx * dx + b.vy * dy) > 0;   // 速度点乘目标向 > 0 = 朝目标
    }),
    dummyLock: bDummy.chloAi1,             // 应 0（immortal 族仍拒）
  };
});
console.log(JSON.stringify(res, null, 2));
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
