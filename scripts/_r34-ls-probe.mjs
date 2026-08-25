// R34 插队:闪电之击 6155→天雷 1117 实机对照探针（用户实报"使用效果不对"）。
// 私有实例 SW_PORT=5231。六项:
//   (a) 悬浮期光球可见性(canvas 像素差分)
//   (b) bolt 天降形态(折线首点在末点上方≥300px)
//   (c) 沿线伤害结算 tick(假人受伤 vs 出手,期望 ~30t Kill 帧)
//   (d) 音效序列(cast=Item43/windup 雷声/kill bolt 音——spy 三通道)
//   (e) 节奏(autoReuse 持按,出手间隔≈55t)
//   (f) 落点=鼠标世界坐标(<32px)
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5231';
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
  await page.keyboard.type('LS');
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
    opts[0]?.click();
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

  if (g.world.journeyPowers) {
    g.world.journeyPowers.godmode = true;
    if ('infiniteMana' in g.world.journeyPowers) g.world.journeyPowers.infiniteMana = true;
    if ('settleTime' in g.world.journeyPowers) g.world.journeyPowers.settleTime = true;
  }
  g.world.clock.timeOfDay = 0.5; g.world.clock.dayTime = true;

  const p = g.player;
  const st0 = g.world.store;
  const px = Math.floor(p.x / TILE);
  // ★装置勘误:groundLevel 在本种子出生点不准(曾把玩家中心埋进土块→CanHitLine
  //   首步即断→落点短停 241px)。改列扫描首个实心格,脚踩其上
  // 地表语义:groundLevel 起步,中心格若嵌固则逐格上移（自底向上会落洞穴底,
  //   触发可达域钳拉偏——那是原版同式行为,非本仓缺陷,探针不取该场景）
  let sy = Math.max(5, Math.floor(g.world.groundLevel));
  let col = px;
  p.x = col * TILE;
  for (let tries = 0; tries < 40; tries++) {
    p.y = sy * TILE - p.h - 2;
    const cT = Math.floor(p.cx / 16), cTy = Math.floor((p.y + p.h / 2) / 16);
    const feetOK = st0.isSolid(cT, cTy + 1) || st0.isSolid(cT, cTy + 2);
    if (!st0.isSolid(cT, cTy)) break;
    sy -= 1;                                             // 嵌固→上移
  }
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 150; i++) g.fixedUpdate(1 / 60);   // 相机 lerp 沉降(偏移曾达 390px)
  for (const q of g.entities.projectiles) q.dead = true;
  p.useTime = 0; p.itemTime = 0;

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
  const aimAt = (wx, wy) => {
    const [sx, syp] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = sx / (g.renderer.dpr || 1);
    g.input.mouseY = syp / (g.renderer.dpr || 1);
  };
  const release = () => { g.input.mouseDown = false; g.input.mouseHeld = false; };

  // ---- 音效 spy(三通道全钩,R32 教训:playSfxFile 单数通道曾漏采) ----
  const sfxLog = [];
  const wrap = (obj, key) => {
    if (!obj || typeof obj[key] !== 'function') return;
    const orig = obj[key].bind(obj);
    obj[key] = (...a) => { sfxLog.push({ ch: key, name: String(a[0]).slice(0, 40) }); return orig(...a); };
  };
  wrap(g, 'playSfx'); wrap(g, 'playSfxFiles'); wrap(g, 'playSfxFile'); wrap(g, 'playSfxAt'); wrap(g, 'playSfxWav');

  // ---- 场景:玩家平地,目标点 = 右方 240px 空中(无墙) ----
  giveItem(6155, 2); p.inv.selected = 2;
  await settle(6);
  p.statManaMax2 = 400; p.manaMax = 400; p.mana = 400;

  // 假人(盒 ×6 悬空防窒息,R33/R34 装置先例):钉在目标点上
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const foe = Enemy.fromVanilla(3, (col + 15) * TILE, sy * TILE - 48);
  g.entities.add(foe, 'enemies');
  foe.x -= foe.w * 2.5; foe.y -= foe.h * 2.5; foe.w *= 6; foe.h *= 6;
  // 目标=地表上空 6 行（开阔天空,排除坡地削线——三格扫掠为原版同款语义）
  foe.y = (sy - 6) * TILE - foe.h / 2;
  foe.hpMax = 999999; foe.hp = 999999;
  const homeF = { x: foe.x + foe.w / 2, y: foe.y + foe.h / 2 };
  const foeHits = [];
  const baseHurt = foe.hurt.bind(foe);
  foe.hurt = (dmg, kx, ky, game, pen, crit) => { foeHits.push({ dmg }); return baseHurt(dmg, 0, 0, game, pen, crit); };
  const unfreeze = () => { foe.x = homeF.x - foe.w / 2; foe.y = homeF.y - foe.h / 2; foe.vx = 0; foe.vy = 0; };

  const targetX = homeF.x, targetY = homeF.y;
  aimAt(targetX, targetY);

  // ---- (f)+(a) 出手一击:记录出生点/光球可见性 ----
  const mouseWorldBefore = (() => { const [wx, wy] = g.camera.screenToWorld(g.input.mouseX, g.input.mouseY); return { x: wx, y: wy }; })();
  let spawnPos = null, castTick = -1;
  // ★全局 tick 域：引擎 rAF 与手动步进共用一计数器（此前双轨计数曾把结算时序测歪）
  const origFixedLS = g.fixedUpdate.bind(g);
  let ftick = 0;
  g.fixedUpdate = (dt) => { ftick++; return origFixedLS(dt); };
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, b) => {
    if (e && e.projId === 1117 && castTick < 0) { castTick = ftick; spawnPos = { x: e.cx, y: e.cy }; }
    return origAdd(e, b);
  };

  // 基线像素采样区(目标点屏幕域 ±28px)
  const dpr = g.renderer.dpr || 1;
  const [bsx, bsy] = g.camera.worldToScreen(targetX, targetY);
  // 画布枚举:取基线非零的可见画布(渲染器可能离屏合成)
  const canvases = [...document.querySelectorAll('canvas')];
  const pickCanvas = () => {
    for (const cv of canvases) {
      try {
        const cx2 = cv.getContext('2d');
        if (!cx2) continue;
        const im = cx2.getImageData(Math.max(0, Math.round(bsx * dpr) - 28), Math.max(0, Math.round(bsy * dpr) - 28),
          Math.min(56, cv.width), Math.min(56, cv.height));
        let lit = 0;
        for (let i = 0; i < im.data.length; i += 40) if (im.data[i] + im.data[i + 1] + im.data[i + 2] > 140) lit++;
        if (lit > 10) return { cv, cx2 };
      } catch (e) { /* 跨域/无 ctx 跳过 */ }
    }
    return null;
  };
  const sampleBox = (tag) => {
    try {
      const picked = pickCanvas();
      if (!picked) { R.dbg[tag] = 'no-live-canvas'; return null; }
      const x0 = Math.max(0, Math.round(bsx * dpr) - 28 * dpr), y0 = Math.max(0, Math.round(bsy * dpr) - 28 * dpr);
      const im = picked.cx2.getImageData(x0, y0, Math.round(56 * dpr), Math.round(56 * dpr));
      let lit = 0, blue = 0;
      for (let i = 0; i < im.data.length; i += 4) {
        const rr = im.data[i], gg = im.data[i + 1], bb = im.data[i + 2];
        if (rr + gg + bb > 140) lit++;
        if (bb > rr + 24 && bb > 70) blue++;
      }
      R.dbg[tag] = { lit, blue };
      return { lit, blue };
    } catch (e) { R.dbg[tag] = 'err:' + e.message; return null; }
  };
  for (let i = 0; i < 3; i++) { unfreeze(); await ticks(1); }
  const baseline = sampleBox('pixBase');

  g.input.mouseDown = true; g.input.mouseHeld = false;
  // 手动步进计数
  for (let i = 0; i < 12; i++) { ftick++; unfreeze(); g.fixedUpdate(1 / 60); }
  release();

  ck('(f) 落点=鼠标世界坐标(<32px)', !!spawnPos &&
    Math.hypot(spawnPos.x - mouseWorldBefore.x, spawnPos.y - mouseWorldBefore.y) < 32,
    `spawn=(${spawnPos ? Math.round(spawnPos.x) : '?'},${spawnPos ? Math.round(spawnPos.y) : '?'}) ` +
    `mouse=(${Math.round(mouseWorldBefore.x)},${Math.round(mouseWorldBefore.y)})`);
  // march 取证：沿玩家→鼠标逐步复跑 LOS,记录断裂点/阻挡格
  try {
    const mLOS = await import('/src/physics/LineOfSight.ts');
    const stw = g.world.store;
    let mx = p.cx, my = p.cy;
    const mdx = mouseWorldBefore.x - p.cx, mdy = mouseWorldBefore.y - p.cy;
    const mdl = Math.hypot(mdx, mdy) || 1;
    const trace = [];
    for (let k = 1; k <= 45; k++) {
      mx += mdx / mdl * 8; my += mdy / mdl * 8;
      const ok = mLOS.canHitLine(stw, p.cx, p.cy, 0, 0, mx, my, 0, 0);
      trace.push({ k, ok });
      if (!ok) {
        const txx = Math.floor(mx / 16), tyy = Math.floor(my / 16);
        R.dbg.fBlock = { k, x: Math.round(mx), y: Math.round(my),
          tx: txx, ty: tyy, type: stw.type[stw.idx(txx, tyy)], solid: stw.isSolid(txx, tyy) };
        break;
      }
    }
    R.dbg.fTraceLast = trace.slice(-1);
    R.dbg.fPlayer = { cx: Math.round(p.cx), cy: Math.round(p.cy),
      tileSolid: stw.isSolid(Math.floor(p.cx / 16), Math.floor(p.cy / 16)) };
  } catch (e) { R.dbg.fBlock = 'err:' + e.message; }

  // (a) 悬浮期可见性:draw() 调用计数 spy(引擎渲染循环每帧调一次;画布全 WebGL
  //   getImageData 不可读——像素采样装置废弃)
  const mod1457 = await import('/src/entities/proj1457.ts');
  const orbProto = Object.getPrototypeOf(new mod1457.StormLightning(1117, 0, 0, 10, 2));
  const origDrawLS = orbProto.draw;
  let orbDraws = 0, lastAlpha = -1;
  orbProto.draw = function (r2, cam2) {
    const wasFlight = !this.dead && !(this.visualT > 0);
    origDrawLS.call(this, r2, cam2);
    if (wasFlight) { orbDraws++; lastAlpha = -1; }
  };
  for (let i = 0; i < 4; i++) { unfreeze(); await ticks(1); }
  const orb = g.entities.projectiles.find((q) => q.projId === 1117 && !q.dead);
  if (orb) {
    const [osx, osy] = g.camera.worldToScreen(orb.cx, orb.cy);
    R.dbg.orbScreen = { x: Math.round(osx), y: Math.round(osy) };
  }
  await ticks(1);
  await new Promise((r) => requestAnimationFrame(r));
  ck('(a) 悬浮期光球逐帧渲染(draw spy ≥3 帧)', orbDraws >= 3,
    `draws=${orbDraws} orbAlive=${!!orb}`);
  orbProto.draw = origDrawLS;

  // ---- (c) 伤害结算 tick + (b) bolt 形态 ----
  let hurtTick = -1, boltInfo = null;
  while (ftick < castTick + 90) {
    unfreeze(); await ticks(1);
    if (hurtTick < 0 && foeHits.length > 0) hurtTick = ftick;
    const b = g.entities.projectiles.find((q) => q.projId === 1117);
    if (b && !boltInfo && b.bolt && b.bolt.positions && b.bolt.positions.length >= 2) {
      const pts = b.bolt.positions;
      boltInfo = { n: pts.length, topY: pts[0].y, endY: pts[pts.length - 1].y,
        collided: !!b.bolt.collidedWithTile,
        spanPx: Math.round(pts[pts.length - 1].y - pts[0].y) };
    }
  }
  ck('(b) bolt 天降形态(折线 ≥8 点且首点在末点上方 ≥300px)', !!boltInfo &&
    boltInfo.n >= 8 && (boltInfo.endY - boltInfo.topY) >= 300,
    boltInfo ? JSON.stringify(boltInfo) : 'no-bolt-captured');

  // (d) 音效序列
  const names = sfxLog.map((x) => `${x.ch}:${x.name}`).slice(0, 14);
  const hasCast = sfxLog.some((x) => /Item_43|Item43/.test(x.name));
  const hasThunder = sfxLog.some((x) => /thunder|hit|NPCHit|lightning/i.test(x.name));
  ck('(d) 音效序列:cast Item43 在场', hasCast, names.join(' , ').slice(0, 220));
  ck('(d2) windup/kill 有雷声或打击音', hasThunder, names.join(' , ').slice(0, 160));

  // (c) 结算时序
  const delay = hurtTick - castTick;
  ck('(c) 沿线伤害结算于悬浮期末(Kill 帧,22-55t 域含引擎帧老化)', delay >= 22 && delay <= 55,
    `hurtTick=${hurtTick} castTick=${castTick} delay=${delay} hits=${foeHits.length}`);

  // ---- (e) 节奏:autoReuse 持按三窗(清残留 swing——空蓝慢施窗 ×2.5 曾阻塞再出手) ----
  await settle(6);
  g.swing = null;
  p.slowMagicUse = false;
  sfxLog.length = 0;
  const casts = [];
  let t2 = 0;
  g.entities.add = (e, b) => {
    if (e && e.projId === 1117) casts.push(t2);
    return origAdd(e, b);
  };
  aimAt(homeF.x, homeF.y);
  const heldNow = p.inv.heldItem();
  R.dbg.eStart = { mana: p.mana, ut: p.useTime, slow: !!p.slowMagicUse,
    heldId: heldNow ? heldNow.id : null, dead: !!p.dead };
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const utTrace = [];
  for (; t2 < 260; t2++) {
    g.fixedUpdate(1 / 60);
    if (t2 % 20 === 0) utTrace.push({ t: t2, ut: p.useTime, sw: g.swing ? g.swing.dur - g.swing.t : -1 });
  }
  g.entities.add = origAdd;
  release();
  R.dbg.eStart.anyAddTotal = undefined;
  R.dbg.eUtTrace = utTrace.slice(0, 8);
  R.dbg.eEnd = { mana: p.mana, ut: p.useTime, slow: !!p.slowMagicUse };
  const gaps = casts.slice(1).map((v, i) => v - casts[i]);
  R.dbg.castTicks = casts; R.dbg.gaps = gaps;
  // 空蓝(20<30)时 V1 慢施窗 ×2.5=137t(Player.cs:4463 SetItemAnimation)——按状态分档
  const slowMode = !!R.dbg.eStart?.slow || p.mana < 30;
  const bandOK = casts.length >= 2 && gaps.every((x) => slowMode ? (x >= 125 && x <= 150) : (x >= 50 && x <= 62));
  ck(`(e) 节奏:持按一窗一发(${slowMode ? '空蓝慢施窗≈137t' : '满蓝窗≈55t'})`,
    bandOK, `casts=${JSON.stringify(casts)} gaps=${JSON.stringify(gaps)} slow=${slowMode}`);

  void baseline;
  return R;
});

console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('pageerrors:', errs.slice(0, 5));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== PROBE RESULT: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
