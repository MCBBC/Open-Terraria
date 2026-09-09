// SW-BJ44 岩浆钓鱼实机探针（2026-09-09，用户实报「地狱鱼饵也没能在岩浆钓鱼」）。
// 私有实例：SW_PORT=5203 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5203。
// 场景：天然地狱岩浆湖 + 木钓竿 + 岩浆饵（地狱蝴蝶 4845）→ 抛竿。
//   A. 岩浆饵：浮标入岩浆【漂浮不烧毁】→ 有机咬钩 → 收竿渔获入包 + 饵 −1
//   B. 普通饵 2674、三源皆无：浮标存活但永不咬钩（stopper 静默面）+ 饵不耗
//   C. 配饰 4881（accLavaFishing）+ 普通饵：合法咬钩 → 渔获
// 变异基线：修复前 A/C 在「入岩浆即烧毁」门处即死（=用户实报根因）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
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
  await page.keyboard.type('BJ44');
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
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(async () => { const B = await import('/src/stats/Buffs.ts'); window.__swBuffType = B.BuffType; });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILE = 16;
  const items = await import('/src/data/items.ts');
  const itemOfVid = (vid) => items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[vid]];
  const R = { fatal: null, dbg: {} };
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  const isBobber = (e) => e && e.constructor && e.constructor.name === 'Bobber';
  const liveBobber = () => g.entities.projectiles.find((e) => isBobber(e) && !e.dead);
  const baitStack = (vid) => {
    const id = itemOfVid(vid);
    const s = g.player.inv.slots.find((x) => x && x.id === id);
    return s ? s.stack : 0;
  };
  const invCountOf = (vid) => {
    const id = itemOfVid(vid);
    return g.player.inv.slots.filter((x) => x && x.id === id).reduce((a, x) => a + x.stack, 0);
  };

  // ---- 找地狱岩浆湖：候选 run ≥ 20 列 → 池容实测（GetFishingPondState 同算法）≥ 75 ----
  const measurePond = (x, y) => {
    const liquidAt = (i, j) => (st.inBounds(i, j) ? st.liquid[st.idx(i, j)] : 0);
    let minX = x, maxX = x;
    while (minX > 10 && liquidAt(minX, y) > 0 && !st.isSolid(minX, y)) minX--;
    while (maxX < st.w - 10 && liquidAt(maxX, y) > 0 && !st.isSolid(maxX, y)) maxX++;
    let n = 0, lava = false;
    for (let i = minX; i <= maxX; i++) {
      for (let j = y; st.inBounds(i, j) && liquidAt(i, j) > 0 && !st.isSolid(i, j) && j < st.h - 10; j++) {
        n++;
        if (st.liquidType[st.idx(i, j)] === 2) lava = true;
      }
    }
    return { n, lava };
  };
  let runStart = -1, surfY = -1;
  outer:
  for (let y = st.h - 320; y < st.h - 25; y++) {
    let x = 60;
    while (x < st.w - 60) {
      const liq = st.liquid[st.idx(x, y)];
      if (liq > 60 && st.liquidType[st.idx(x, y)] === 2) {
        let e = x;
        while (e < st.w - 60 && st.liquid[st.idx(e, y)] > 60 && st.liquidType[st.idx(e, y)] === 2) e++;
        if (e - x >= 20) {
          const m = measurePond(x + ((e - x) >> 1), y);
          if (m.lava && m.n >= 75) { runStart = x; surfY = y; R.dbg.pondMeasure = m; break outer; }
        }
        x = e + 1;
      } else x++;
    }
  }
  if (runStart < 0) { R.fatal = 'no-lava-pool'; return R; }
  const mid = runStart + 10;
  const waterCX = mid * TILE, waterCY = (surfY + 1) * TILE;

  // ---- 岸点：runStart 向左找无液且脚下实心的柱 ----
  let shoreX = runStart - 1;
  while (shoreX > 20 && (st.liquid[st.idx(shoreX, surfY)] > 0 || !st.isSolid(shoreX, surfY + 1))) shoreX--;
  const place = () => { g.player.x = shoreX * TILE - 2; g.player.y = (surfY - 3) * TILE; g.player.vx = 0; g.player.vy = 0; };
  place();
  for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
  R.dbg.pool = { runStart, surfY, shoreX, lavaTiles: (st.h - 20 - surfY) };

  const equip = (rodVid, baitVid, accVid) => {
    g.player.inv.selected = 2;
    g.player.inv.slots[2] = { id: itemOfVid(rodVid), stack: 1 };
    g.player.inv.slots[6] = { id: itemOfVid(baitVid), stack: 20 };
    if (accVid) g.player.inv.armor[3] = { id: itemOfVid(accVid), stack: 1 };
    else g.player.inv.armor[3] = null;
    // 撤掉其它饵避免 Fishing_GetBait 扫到（槽 7 清空）
    g.player.inv.slots[7] = null;
    // 渔力增益（药水 121 渔奖 +15,Player.cs:9831 fishingSkill +15）——探针提速用,
    // 不改合法性语义（三源门与渔力无关）
    const Buffs = g.player.buffs;
    if (Buffs && Buffs.apply && Buffs.has) {
      const BT = g.__swBuffType;
      if (BT && BT.Fishing != null && !Buffs.has(BT.Fishing)) Buffs.apply(BT.Fishing, 60000);
    }
  };
  const aim = () => {
    const [sx, sy] = g.camera.worldToScreen(waterCX, waterCY);
    g.input.mouseX = sx / (g.renderer.dpr || 1);
    g.input.mouseY = sy / (g.renderer.dpr || 1);
  };
  const cast = async (label, needLavaFloat) => {
    for (let att = 1; att <= 8; att++) {
      place();
      for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
      g.player.inv.selected = 2;
      aim();
      g.input.mouseDown = true;
      g.fixedUpdate(1 / 60);
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
      let b = null;
      for (let i = 0; i < 900; i++) {
        g.fixedUpdate(1 / 60);
        b = liveBobber();
        if (b && b.floating && (!needLavaFloat || b.liquidKind === 'lava')) break;
        if (b && b.dead) b = null;
        if (i % 400 === 399) place();   // 长等防玩家漂移
      }
      if (b && b.floating) {
        R.dbg['cast_' + label] = { attempts: att, floating: true, liquidKind: b.liquidKind, projId: b.projId };
        return b;
      }
      if (!needLavaFloat) break;   // 非岩浆落点也可接受时只试一次
    }
    R.dbg['cast_' + label] = { attempts: 8, floating: false, saw: liveBobber() ? 'bobber-alive' : 'none' };
    return null;
  };
  const waitBite = (b, maxTicks) => {
    let info = '';
    for (let i = 0; i < maxTicks; i++) {
      g.fixedUpdate(1 / 60);
      if (b.dead) return 'dead';
      if (b.biteT > 0) return 'bite';
      if (i % 500 === 499) { place(); info = g.player.displayedFishingInfo ?? info; }
    }
    R.dbg.fishingInfo = info;
    return 'timeout';
  };
  const reel = async (b) => {
    const before = { catchId: b.catchId, catchEnemy: b.catchEnemy };
    g.player.inv.selected = 2;
    aim();
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
    return before;
  };

  // ================= A：地狱蝴蝶 4845 无配饰 =================
  equip(2294, 4849, null);   // 金竿45+岩浆蜗牛35+渔奖15=95（探针提速;合法性三源不变）
  const sA0 = baitStack(4849);
  const bA = await cast('A_lavaBait', true);
  if (!bA) { R.fatal = 'A-no-float'; return R; }
  await new Promise((r) => requestAnimationFrame(r));
  const biteA = waitBite(bA, 30000);
  if (biteA !== 'bite') { R.fatal = 'A-no-bite:' + biteA; R.dbg.A = { biteT: bA.biteT, catchId: bA.catchId }; return R; }
  const preA = await reel(bA);
  const sA1 = baitStack(4849);
  const gotA = invCountOf(preA.catchId || 0);
  R.A = {
    bite: biteA, catchId: preA.catchId, baitBefore: sA0, baitAfter: sA1,
    catchItemInInv: gotA, bobberDead: bA.dead,
  };

  // ================= B：普通饵 2674、三源皆无 → 静默不咬 =================
  equip(2294, 2674, null);
  const sB0 = baitStack(2674);
  const bB = await cast('B_plainBait', true);
  if (!bB) { R.fatal = 'B-no-float'; return R; }
  let bit = false;
  for (let i = 0; i < 30000; i++) {
    g.fixedUpdate(1 / 60);
    if (bB.biteT > 0 || bB.catchId > 0) { bit = true; break; }
    if (bB.dead) { R.fatal = 'B-bobber-dead'; return R; }
    if (i % 500 === 499) place();
  }
  R.B = { bit, baitBefore: sB0, baitAfter: baitStack(2674), floating: bB.floating, dead: bB.dead };
  // 收尾：竿点击正常收线清场（勿传送杀玩家——死亡/重生会连坐 C 臂浮标）
  if (liveBobber()) {
    g.player.inv.selected = 2;
    aim();
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    for (let i = 0; i < 600 && liveBobber(); i++) { g.fixedUpdate(1 / 60); if (i % 100 === 99) place(); }
  }
  R.dbg.cleanup = { bobberLeft: !!liveBobber(), playerDead: g.player.dead };

  // ================= C：配饰 4881 + 普通饵 =================
  equip(2294, 2674, 4881);
  const sC0 = baitStack(2674);
  const bC = await cast('C_accLava', true);
  if (!bC) { R.fatal = 'C-no-float'; return R; }
  const biteC = waitBite(bC, 30000);
  if (biteC !== 'bite') { R.fatal = 'C-no-bite:' + biteC; return R; }
  const preC = await reel(bC);
  R.C = {
    bite: biteC, catchId: preC.catchId, baitBefore: sC0, baitAfter: baitStack(2674),
    catchItemInInv: invCountOf(preC.catchId || 0), accLavaFishing: g.player.equipStats.lavaFishing === true,
  };
  return R;
});

console.log('=== SW-BJ44 实机账目 ===');
console.log(JSON.stringify(out, null, 2));
if (errs.length) console.log('pageerrors:', errs.slice(0, 5));
await browser.close();
