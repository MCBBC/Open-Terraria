// BJ374 探针：无限智慧巨著 3852 左键 712 命中面 + 右键 704 龙卷风轨迹面（私有实例 5201）
//   (a) 左键每窗发数（原版 4 发：窗 26t,t=0/3/6/9;t=12 被尾窗 itemAnimation<max−12 压掉）
//   (b) 左键窗内锁向（Player.cs:47615/47739 自锁——续发沿首拍鼠标向;修前=跟鼠标扫）
//   (c) 左键命中敌怪 → killNow → onProjectileDeath(712) Kill 面（尘15+gore1008+Item10）
//   (d) 右键风暴方向=鼠标侧（原版 ChangeDir 点积;修前=陈旧 facing）
//   (e) 右键轨迹：vx 恒 ±11、vy 阶梯 ±2/±4 钳 ±16、垂直物理（探测柱支撑→升/悬空→坠）
//   (f) 右键彩带 gore 1007/1008（1/5+1/7+1/7 每拍——修前整缺）
//   (g) 右键被埋提前收口（localAI[0]≥16 → ai[0]=285;修前 localAI0 不消费）
// 设备注记：敌盒放大=bolt 命中采样装置(R33/R34 先例);段间清场+useTime 归零。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ374');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // 小世界
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const R = { fatal: null, checks: [], dbg: {} };
  const ck = (name, ok, detail) => R.checks.push({ name, ok, detail });

  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;

  const p = g.player;
  const sy = g.world.groundLevel;
  const px = Math.floor(p.x / TILE);
  p.x = px * TILE; p.y = sy * TILE - p.h; p.vx = 0; p.vy = 0;

  const giveItem = (vid, slot) => {
    const key = items.VANILLA_ITEM_KEY_BY_ID[vid];
    const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_${vid}_`];
    p.inv.slots[slot] = { id, stack: 1 };
    return id;
  };
  const settle = async (n) => {
    for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60);
    for (const q of g.entities.projectiles) q.dead = true;
    for (const q of [...g.entities.enemies]) q.dead = true;
    g.entities.enemies.length = 0;
    p.useTime = 0; p.itemTime = 0;
    await new Promise((r) => requestAnimationFrame(r));
  };
  const ticks = async (n) => {
    for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
  };
  const { Enemy } = await import('/src/entities/Enemy.ts');
  let foeLog = null;
  const makeFoe = (tx0) => {
    const e = Enemy.fromVanilla(3, tx0 * TILE, sy * TILE - 48);
    g.entities.add(e, 'enemies');
    if (!e) return null;
    e.hpMax = 99999; e.hp = 99999;
    e.x -= e.w * 2.5; e.y -= e.h * 2.5; e.w *= 6; e.h *= 6;   // ×6 采样盒
    e.y = sy * TILE - 120 - e.h / 2;
    const home = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
    foeLog = { hits: [], baseHurt: e.hurt.bind(e), home, e };
    e.hurt = (dmg, kx, ky, game, pen, crit) => {
      foeLog.hits.push({ dmg });
      return foeLog.baseHurt(dmg, 0, 0, game, pen, crit);
    };
    foeLog.unfreeze = () => { e.x = home.x - e.w / 2; e.y = home.y - e.h / 2; e.vx = 0; e.vy = 0; };
    return e;
  };
  const aimAt = (wx, wy) => {
    const [sx, syp] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = sx / (g.renderer.dpr || 1);
    g.input.mouseY = syp / (g.renderer.dpr || 1);
  };
  const release = () => { g.input.mouseDown = false; g.input.mouseHeld = false; g.input.rightDown = false; };

  // ---- 712 出膛记录仪（entities.add spy + 出膛速度/角度） ----
  const shot712Log = [];
  const origAdd = g.entities.add.bind(g.entities);
  const arm712Spy = () => {
    g.entities.add = (e, b) => {
      if (e && e.projId === 712 && !e.dead) {
        shot712Log.push({ x: e.x, y: e.y, vx: e.vx, vy: e.vy, ang: Math.atan2(e.vy, e.vx) });
      }
      return origAdd(e, b);
    };
  };
  const disarm712Spy = () => { g.entities.add = origAdd; };

  // ---------- (a+b) 左键：每窗发数 + 窗内锁向 ----------
  try {
    giveItem(3852, 2); p.inv.selected = 2;
    await settle(5);
    const aimA = { x: p.cx + 300, y: p.cy - 120 };     // A 向：右上 22°
    const aimB = { x: p.cx + 300, y: p.cy + 160 };     // B 向：右下 28°（与 A 差 ~50°）
    shot712Log.length = 0;
    arm712Spy();
    aimAt(aimA.x, aimA.y);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    // 窗 1：t=0 瞄 A;t=4 起鼠标移到 B——原版=续发沿 A（锁向）
    for (let i = 0; i < 14; i++) {
      if (i === 4) aimAt(aimB.x, aimB.y);
      g.fixedUpdate(1 / 60);
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    await ticks(1);
    disarm712Spy();
    const win1 = shot712Log.slice();
    const angA = Math.atan2(aimA.y - p.cy, aimA.x - p.cx);
    const dev = win1.map((s) => {
      let d = s.ang - angA;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    });
    ck('(a1) 窗 1 发数=4（原版尾窗压掉第 5 发）', win1.length === 4, `n=${win1.length} shotTicks=${win1.map((s) => Math.round(s.vx * 10) / 10 + ',' + Math.round(s.vy * 10) / 10).join(' | ')}`);
    const speedOk = win1.every((s) => Math.abs(Math.hypot(s.vx, s.vy) - 11) < 0.6);
    ck('(a2) 出膛速度模=shootSpeed 11', speedOk, win1.map((s) => Math.round(Math.hypot(s.vx, s.vy) * 100) / 100).join(','));
    const allParallelA = dev.every((d) => Math.abs(d) < 0.06);
    const laterFollowB = win1.length >= 4 && Math.abs(dev[2]) + Math.abs(dev[3]) > Math.abs(dev[0]) + Math.abs(dev[1]) + 0.1;
    ck('(b1) 窗内锁向：4 发全平行于窗首 A 向（:47615 自锁）', allParallelA, `dev(rad)=${dev.map((d) => Math.round(d * 1000) / 1000).join(',')}`);
    R.dbg.laterFollowB = laterFollowB;   // true=修前跟鼠标扫（真差异证据）
    release();
    await settle(4);
  } catch (e) { R.fatal = R.fatal ?? '(a/b) ' + e.message; }

  // ---------- (c) 左键命中 → Kill 面（onProjectileDeath 712） ----------
  try {
    shot712Log.length = 0;
    arm712Spy();
    const foe = makeFoe(px + 6);
    await ticks(2); foeLog.unfreeze();
    aimAt(foeLog.home.x, foeLog.home.y);
    const deaths712 = [];
    const origDeath = g.onProjectileDeath?.bind(g);
    g.onProjectileDeath = (pid, x, y, w, h, vx, vy) => {
      if (pid === 712) deaths712.push({ hitFoe: foeLog.hits.length > 0, x, y });
      return origDeath?.(pid, x, y, w, h, vx, vy);
    };
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 12; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    await ticks(3);
    g.onProjectileDeath = origDeath;
    disarm712Spy();
    ck('(c1) 命中敌怪弹死亡走 Kill 面（onProjectileDeath 712）', deaths712.length > 0 && foeLog.hits.length > 0,
      `deaths=${deaths712.length} foeHits=${foeLog.hits.length} shots=${shot712Log.length}`);
    ck('(c2) 命中即亡（penetrate=1,非穿透）', shot712Log.length > 0 && deaths712.length >= Math.min(4, shot712Log.length) - 1,
      `shots=${shot712Log.length} deaths=${deaths712.length}`);
    await settle(4);
  } catch (e) { R.fatal = R.fatal ?? '(c) ' + e.message; }

  // ---------- (d) 右键风暴方向=鼠标侧（陈旧 facing 判别） ----------
  try {
    giveItem(3852, 2); p.inv.selected = 2;
    await settle(5);
    p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;
    const storms = [];
    const origAddB = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && e.projId === 704 && !e.dead) storms.push(e);
      return origAddB(e, b);
    };
    // 玩家面朝左（陈旧),鼠标在右侧远处 → 原版 ChangeDir 点积=+1 → 风暴向右
    p.facing = -1;
    aimAt(p.cx + 400, p.cy);
    g.input.rightDown = true;
    for (let i = 0; i < 3; i++) { g.input.rightDown = true; g.fixedUpdate(1 / 60); }
    g.input.rightDown = false;
    await ticks(1);
    g.entities.add = origAddB;
    const s0 = storms[0];
    ck('(d1) 风暴出生（右键 alt）', !!s0, `n=${storms.length}`);
    if (s0) {
      ck('(d2) 风暴方向=鼠标侧（vx=+11 而非陈旧 facing −11）', s0.vx > 0, `vx=${s0.vx} facingWas=-1 mouseRight`);
      ck('(d3) 出生位 Bottom−100 居中盒', Math.abs((s0.y + s0.h / 2) - (p.y + p.h - 100)) < 3,
        `stormCy=${Math.round(s0.y + s0.h / 2)} expect=${Math.round(p.y + p.h - 100)}`);
    }
    for (const q of storms) q.dead = true;
    await settle(4);
  } catch (e) { R.fatal = R.fatal ?? '(d) ' + e.message; }

  // ---------- (e) 右键轨迹：vx 恒定 + vy 阶梯物理 ----------
  try {
    await settle(5);
    p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;
    const storms = [];
    const origAddB = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && e.projId === 704 && !e.dead) storms.push(e);
      return origAddB(e, b);
    };
    p.facing = 1;
    aimAt(p.cx + 400, p.cy);
    g.input.rightDown = true;
    for (let i = 0; i < 2; i++) { g.input.rightDown = true; g.fixedUpdate(1 / 60); }
    g.input.rightDown = false;
    await ticks(1);
    g.entities.add = origAddB;
    const s0 = storms[0];
    if (s0) {
      const trace = [];
      for (let i = 0; i < 60; i++) {
        g.fixedUpdate(1 / 60);
        trace.push({ x: s0.x, y: s0.y, vx: s0.vx, vy: s0.vy, t: s0.t, lai0: s0.localAI0 });
      }
      const vxConst = trace.every((s) => Math.abs(s.vx - trace[0].vx) < 1e-6);
      const vySteps = new Set(trace.map((s) => Math.round(s.vy * 100) / 100));
      const vyCapped = trace.every((s) => Math.abs(s.vy) <= 16.0001);
      const yMoved = Math.abs(trace[59].y - trace[0].y) > 8 || Math.abs(trace[59].x - trace[0].x) > 8;
      ck('(e1) vx 恒定（AI_145 无 vx 编辑）', vxConst, `vx=${trace[0].vx}`);
      ck('(e2) vy 阶梯 ±2/±4 钳 ±16（:71475-71510）', vyCapped && vySteps.size >= 3,
        `steps=${[...vySteps].slice(0, 10).join(',')} n=${vySteps.size}`);
      ck('(e3) 风暴在移动（横移+垂直振荡）', yMoved, `dx=${Math.round(trace[59].x - trace[0].x)} dy=${Math.round(trace[59].y - trace[0].y)}`);
      R.dbg.vyTrace = trace.filter((_, i) => i % 8 === 0).map((s) => `t${s.t}:vy${Math.round(s.vy * 10) / 10}`);
      s0.dead = true;
    } else ck('(e1) 风暴出生', false, 'no storm');
    await settle(4);
  } catch (e) { R.fatal = R.fatal ?? '(e) ' + e.message; }

  // ---------- (f) 右键彩带 gore 1007/1008 ----------
  try {
    await settle(5);
    p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;
    const storms = [];
    const goreCount = { n: 0 };
    const origAddB = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && e.projId === 704 && !e.dead) storms.push(e);
      return origAddB(e, b);
    };
    // GorePiece 静态池 spy
    const GP = await import('/src/entities/GorePiece.ts');
    const origNew = GP.GorePiece.newGore;
    GP.GorePiece.newGore = function (type, ...rest) {
      if (type === 1007 || type === 1008) goreCount.n++;
      return origNew.call(this, type, ...rest);
    };
    p.facing = 1;
    aimAt(p.cx + 400, p.cy);
    g.input.rightDown = true;
    for (let i = 0; i < 2; i++) { g.input.rightDown = true; g.fixedUpdate(1 / 60); }
    g.input.rightDown = false;
    if (storms[0]) {
      for (let i = 0; i < 60; i++) { if (storms[0].dead) break; g.fixedUpdate(1 / 60); }
    }
    GP.GorePiece.newGore = origNew;
    g.entities.add = origAddB;
    ck('(f1) 彩带 gore 1007/1008 拖尾（原版 1/5+1/7+1/7 每拍≈0.49/拍）', goreCount.n > 20,
      `gore60t=${goreCount.n}（期望≈29）`);
    for (const q of storms) q.dead = true;
    await settle(4);
  } catch (e) { R.fatal = R.fatal ?? '(f) ' + e.message; }

  // ---------- (g) 被埋提前收口（localAI0≥16 → t 跳 285,300t 帽提前 15t） ----------
  try {
    await settle(5);
    const tw = new (await import('/src/entities/proj1457.ts')).BookStormTwister(p.cx, p.cy, 11, 63, 9);
    g.entities.add(tw, 'projectiles');
    // 直移到地下实心区（探针世界 groundLevel 深处必为实心）
    const deepY = (sy + 60) * TILE;
    tw.x = p.cx - 30; tw.y = deepY; tw.vx = 0; tw.vy = 0;
    let jumped = false; let diedAt = -1;
    for (let i = 0; i < 300; i++) {
      if (tw.dead) { diedAt = i; break; }
      g.fixedUpdate(1 / 60);
      if (tw.t >= 285) jumped = true;
    }
    ck('(g1) 被埋 localAI0 累积（原版快升支 +2/拍）', (tw.localAI0 ?? 0) >= 16 || jumped || diedAt > 0,
      `localAI0=${tw.localAI0}`);
    ck('(g2) 提前收口：t 跳 285 → 300t 内死亡（diedAt≈285 非 300）', diedAt > 0 && diedAt <= 287,
      `diedAt=${diedAt} jumped=${jumped}`);
    await settle(3);
  } catch (e) { R.fatal = R.fatal ?? '(g) ' + e.message; }

  return R;
});
console.log('PAGEERR:', JSON.stringify(errs.slice(0, 3)));
console.log(JSON.stringify(out, null, 1));
await browser.close();
