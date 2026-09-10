// SW-BJ53 平台×浮标碰撞实机矩阵（2026-09-10，用户实报「平台会阻挡钓钩,原版可穿过」）。
// 私有实例：SW_PORT=5206 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5206（SW_ORIGIN 可覆写）。
// 金标（1457=1458 同域逐行核对）：
//   · 浮标 SetDefaults 无 tileCollide 行 → 字段缺省 true（Projectile.cs:4510-4518/:777）
//   · 通用弹幕运动 fallThrough=fall2=flag6=true（:17587），aiStyle 61 无例外（:17590-17700）
//     → Collision.TileCollision 平台支永不落地（Collision.cs:2391 门 fallThrough&fall2 恒假）
//       + 横向/上穿守卫 !tileSolidTop（:2406/:2426/:2446）→ 平台四向全穿
//   · aiStyle61 命【实心】反弹支（:19730-19740）：X 恒 ×-0.3f；Y 仅 lastVelocity.Y>1 ×-0.3f
//   · 收竿段显式 tileCollide=false（:54654）→ 全部图格无关
// 矩阵：DOWN(上→下) / UP(下→上) / SIDE(横向) / TOPREST(平台顶落停语义=应不停) /
//       FLOAT(平台桥下水面停浮) / SOLID(实心反弹 -0.3) / REEL(收竿穿平台穿墙)。
// 每例与「原版公式直算镜像」对拍（vanillaPlatformStops：fallThrough&fall2 ⇒ 恒 PASS）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5206';
const browser = await puppeteer.launch({
  protocolTimeout: 590000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const options = await import('/src/core/Options.ts');
  for (let i = 0; i < 100; i++) {
    if (options.options?.data) { options.options.data.renderMode = 'cpu'; return; }
    await new Promise((r) => setTimeout(r, 50));
  }
});
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
const clickEl = (sel) => page.evaluate((q) => { const el = document.querySelector(q); if (el) el.click(); return !!el; }, sel);
for (let i = 0; i < 5 && !(await page.$('.sw-vsel')); i++) {
  await clickEl('[data-act=sp]');
  try { await page.waitForSelector('.sw-vsel', { timeout: 8000 }); } catch { await new Promise((r) => setTimeout(r, 1200)); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickEl('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ53');
  await new Promise((r) => setTimeout(r, 300));
  await clickEl('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 500));
}
await clickEl('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickEl('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // 小世界
  });
  await new Promise((r) => setTimeout(r, 300));
  await clickEl('[data-act=create]');
} else {
  await clickEl('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const R = { fatal: null, cases: {}, errs: [] };
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const { Bobber } = await import('/src/entities/Bobber.ts');
  const PLAT = tiles.TILE_DEFS.findIndex((d) => d.key === 'platform');
  const DIRT = tiles.TILE_DEFS.findIndex((d) => d.key === 'dirt');
  if (PLAT < 0 || DIRT < 0) { R.fatal = 'tile-def-missing'; return R; }
  const itemOfVid = (vid) => items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[vid]];

  // ---- 天空实验场：x 300..330，强清空（tile=0 液=0）----
  const AX0 = 300, AX1 = 330, AY0 = 30, AY1 = 80;
  for (let i = AX0; i <= AX1; i++) for (let j = AY0; j <= AY1; j++) { st.setTileSilent(i, j, 0); st.setLiquid(i, j, 0, 0); }

  // ---- 玩家泊位：实验场内自铺地面（x=320..324 行 74）——距浮标 <900px 免触发自动收线 ----
  const PARKY = 74;
  for (let i = 320; i <= 324; i++) st.setTileSilent(i, PARKY, DIRT);
  const park = () => {
    g.player.x = 322 * TILE; g.player.y = PARKY * TILE - g.player.h - 2;
    g.player.vx = 0; g.player.vy = 0;
  };
  // 手持钓竿（AI_061 存活门）：2289 → shoot 360 = 直构 Bobber 缺省 projId（:80-94 映射表）
  g.player.inv.selected = 2;
  g.player.inv.slots[2] = { id: itemOfVid(2289), stack: 1 };

  const liveBobber = () => g.entities.projectiles.find((e) => e instanceof Bobber && !e.dead);
  const clearBobbers = () => { for (const e of g.entities.projectiles) if (e instanceof Bobber) e.dead = true; g.fixedUpdate(1 / 60); };

  // 原版公式直算镜像：Collision.TileCollision :2331-2446 平台支（fallThrough=true, fall2=true）
  //  实心门 :2331 tileSolidTop&&frameY==0 → 平台计入；着陆门 :2391
  //  (!(solidTop&fallThrough) || !(vy<=1|fall2)) ≡ false；横向/上穿 :2406/:2426/:2446 带 !tileSolidTop 恒假
  const vanillaPlatformStops = (fromAbove, vy) => {
    const fallThrough = true, fall2 = true;
    const landingGate = (!(true & fallThrough) || !((vy <= 1) | fall2));   // 恒 false
    return fromAbove && landingGate;   // 恒 false ⇒ 平台从不拦浮标
  };

  const spawnBobber = (x, y, vx, vy) => {
    const b = new Bobber(x, y, vx, vy, 50, 0, 50, () => g.player);
    g.entities.projectiles.push(b);
    return b;
  };
  const step = (n) => { for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60); };

  // ============ ① DOWN：上→下穿越平台（用户实报主诉） ============
  {
    clearBobbers();
    const py = 60;                                   // 平台行
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, PLAT);
    park(); step(5);
    const b = spawnBobber(307 * TILE + 1, 52 * TILE, 0, 2);
    let passedBelow = false, restedOnTop = false, stoppedByPlatform = false;
    let minVyAtRest = null;
    for (let t = 0; t < 200; t++) {
      g.fixedUpdate(1 / 60);
      if (b.dead) break;
      const feet = b.y + b.h;
      if (feet > (py + 2) * TILE) { passedBelow = true; break; }
      if (b.onGround && Math.abs(feet - py * TILE) < 1.5) {
        restedOnTop = true; minVyAtRest = b.vy;
        const mirror = vanillaPlatformStops(true, b.vy);
        stoppedByPlatform = mirror;   // 镜像若判停即对拍失败
      }
    }
    R.cases.DOWN = { passedBelow, restedOnTop, minVyAtRest, mirrorPass: !vanillaPlatformStops(true, 2) };
    st.setTileSilent(307, py, 0);
  }

  // ============ ② UP：下→上穿越平台 ============
  {
    clearBobbers();
    const py = 60;
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, PLAT);
    park(); step(5);
    const b = spawnBobber(307 * TILE + 1, 64 * TILE, 0, -8);
    let passedAbove = false;
    for (let t = 0; t < 120 && !b.dead; t++) {
      g.fixedUpdate(1 / 60);
      if (b.y + b.h < py * TILE - 1) { passedAbove = true; break; }
    }
    R.cases.UP = { passedAbove, mirrorPass: true };
    st.setTileSilent(307, py, 0);
  }

  // ============ ③ SIDE：横向穿越平台带 ============
  {
    clearBobbers();
    const py = 60;
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, PLAT);
    park(); step(5);
    const b = spawnBobber(300 * TILE, py * TILE - 7, 5, 0);
    let crossedRight = false;
    for (let t = 0; t < 120 && !b.dead; t++) {
      g.fixedUpdate(1 / 60);
      if (b.x + b.w > 312 * TILE) { crossedRight = true; break; }
    }
    R.cases.SIDE = { crossedRight, finalX: Math.round(b.x), mirrorPass: true };
    st.setTileSilent(307, py, 0);
  }

  // ============ ④ TOPREST：平台顶落停语义（应「从不落停」） ============
  {
    clearBobbers();
    const py = 60;
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, PLAT);
    park(); step(5);
    const b = spawnBobber(307 * TILE + 1, 56 * TILE, 0, 1);
    step(300);
    const feet = b.y + b.h;
    R.cases.TOPREST = {
      dead: b.dead, feet: Math.round(feet * 10) / 10, platformTop: py * TILE,
      onGround: b.onGround, floating: b.floating, vy: Math.round(b.vy * 1000) / 1000,
      belowPlatform: feet > (py + 1) * TILE,
      note: 'dead=坠出 900px 自动收线到玩家 Kill（原版 :54703-54705 语义,非平台拦停）',
      mirrorPass: true,
    };
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, 0);   // 全行清（防残留渗入后案）
  }

  // ============ ⑤ FLOAT：平台桥横跨水面上方 → 穿桥入水停浮 ============
  {
    clearBobbers();
    const py = 62;                                     // 平台行 = 水面行
    for (let i = 304; i <= 311; i++) {
      st.setTileSilent(i, py, PLAT);                   // 平台与液同格（平台 holds liquid）
      st.setTileSilent(i, py + 3, DIRT);               // 池底
      st.setLiquid(i, py, 255, 1); st.setLiquid(i, py + 1, 255, 1); st.setLiquid(i, py + 2, 255, 1);
    }
    // 池侧墙（世界液体模拟在跑——无侧墙水会摊平,液面下降致浮标落底）
    for (let j = py; j <= py + 2; j++) { st.setTileSilent(303, j, DIRT); st.setTileSilent(312, j, DIRT); }
    park(); step(5);
    const b = spawnBobber(307 * TILE + 1, 54 * TILE, 0, 2);
    let floating = false, kind = null, wlErr = null;
    const WL = (py + 1) * TILE - Math.floor(255 / 16);   // GetWaterLine：行底−liquid/16
    for (let t = 0; t < 400 && !b.dead; t++) {
      g.fixedUpdate(1 / 60);
      if (b.floating) { floating = true; kind = b.liquidKind; wlErr = Math.abs(b.cy - WL); if (t > 240) break; }
    }
    R.cases.FLOAT = { floating, kind, waterLine: WL, cyErr: wlErr == null ? null : Math.round(wlErr * 100) / 100, mirrorPass: true };
    for (let i = 304; i <= 311; i++) { st.setTileSilent(i, py, 0); st.setTileSilent(i, py + 3, 0); st.setLiquid(i, py, 0, 0); st.setLiquid(i, py + 1, 0, 0); st.setLiquid(i, py + 2, 0, 0); }
    st.setTileSilent(303, py, 0); st.setTileSilent(303, py + 1, 0); st.setTileSilent(303, py + 2, 0);
    st.setTileSilent(312, py, 0); st.setTileSilent(312, py + 1, 0); st.setTileSilent(312, py + 2, 0);
  }

  // ============ ⑥ SOLID：实心地面反弹（aiStyle61 :19730-19740 ×-0.3） ============
  {
    clearBobbers();
    const py = 62;
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, DIRT);
    park(); step(5);
    const b = spawnBobber(307 * TILE + 1, 52 * TILE, 0, 0);
    let preVy = 0, postVy = null, impactSeen = false;
    for (let t = 0; t < 200 && !b.dead; t++) {
      preVy = b.vy;
      g.fixedUpdate(1 / 60);
      if (b.collideY && preVy > 1) { impactSeen = true; postVy = Math.round(b.vy * 1000) / 1000; break; }
      if (b.floating) break;
    }
    const expect = impactSeen ? Math.round((preVy * -0.3) * 1000) / 1000 : null;
    R.cases.SOLID = { impactSeen, preVy: Math.round(preVy * 1000) / 1000, postVy, expect, onGround: b.onGround };
    st.setTileSilent(307, py, 0);
  }

  // ============ ⑦ REEL：收竿段穿平台穿实心（tileCollide=false :54654） ============
  {
    clearBobbers();
    const py = 60;
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, PLAT);
    for (let j = py - 2; j <= py + 2; j++) st.setTileSilent(308, j, DIRT);   // 平台后立一堵实心墙
    park(); step(5);
    const b = spawnBobber(303 * TILE, py * TILE - 30, 0, 0);   // 平台+墙西侧空中
    let alive0 = !b.dead;
    let reached = false;
    if (alive0) {
      b.retract = 1;                                       // startReel(1) 等价置位（收线飞行无碰撞）
      for (let t = 0; t < 300; t++) { g.fixedUpdate(1 / 60); park(); if (b.dead) { reached = true; break; } }
    }
    R.cases.REEL = { alive0, retracted: reached, mirrorPass: true };
    for (let i = 304; i <= 311; i++) st.setTileSilent(i, py, 0);
    st.setTileSilent(308, py - 2, 0); st.setTileSilent(308, py - 1, 0); st.setTileSilent(308, py, 0); st.setTileSilent(308, py + 1, 0); st.setTileSilent(308, py + 2, 0);
  }

  clearBobbers();
  return R;
});

console.log('=== SW-BJ53 平台×浮标 实机矩阵账目 ===');
console.log(JSON.stringify(out, null, 2));
if (errs.length) { console.log('pageerrors:', errs.slice(0, 5)); }
await browser.close();
