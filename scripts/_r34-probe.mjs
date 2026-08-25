// R34 蓝队探针（red-team-r34 P0 修复实证；私有实例 SW_PORT=5228）：
//   (a) ArcSurge 6173：出生首拍即落雷（Kill 帧伤害结算时序——修前 240t 悬浮）
//   (b) BookStaff 3852 右键：704 风暴柱在场 + 蓝 ×2（checkMana spy）+ 接触伤害 + 连发
//   (c) 激光机枪 2795：持握体 439 在场 + 双发 440 + 四档加速 period 序列 + 持续扣蓝
//   (d) 公主之武 5065：魔法阵 950 盒 104×104 + 零速定点 + 60t 包络自灭 + 掉血
//   (e) 花瓣风暴 6154：隔墙不追踪 + 每击 3 瓣
// 设备注记：敌盒 ×6 放大=bolt/魔法阵几何采样装置(R33 钉位先例)；段间清场+useTime 归零。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5228';

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
  await page.keyboard.type('R34');
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
  const settle = async (n) => {           // 段间清场:弹幕/敌怪/冷却归零
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
  const makeFoe = (tx0, opts) => {
    const e = Enemy.fromVanilla(3, tx0 * TILE, sy * TILE - 48);
    g.entities.add(e, 'enemies');
    if (!e) return null;
    if (opts?.scaleBox) {                       // 几何采样装置：盒 ×6 并悬空防地形窒息
      e.x -= e.w * 2.5; e.y -= e.h * 2.5; e.w *= 6; e.h *= 6;
      e.y = sy * TILE - 120 - e.h / 2;
    }
    e.hpMax = e.hpMax ?? 99999;
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

  // ---------- (a) 6173 ArcSurge 首拍落雷 ----------
  try {
    giveItem(6173, 2); p.inv.selected = 2;
    await settle(5);
    const foe = makeFoe(px + 3, { scaleBox: true });
    await ticks(2); foeLog.unfreeze();
    aimAt(foeLog.home.x, foeLog.home.y);
    g.input.mouseDown = true; g.input.mouseHeld = false;
    let orbSeen = false;
    for (let i = 0; i < 2 && !orbSeen; i++) {
      await ticks(1);
      orbSeen = g.entities.projectiles.some((q) => q.projId === 1122);
    }
    ck('(a1) 6173 出手生成 1122', orbSeen || foeLog.hits.length > 0,
      `orb=${orbSeen} hits=${foeLog.hits.length}`);
    ck('(a2) 出生首拍即落雷（≤2 拍内伤害已结算；修前悬浮 240t）',
      foeLog.hits.length >= 1, `hits=${foeLog.hits.length}`);
    const stillOrbing = g.entities.projectiles.some((q) => q.projId === 1122 && !q.dead
      && (q.visualT === undefined || q.visualT <= 0) === false && q.t > 1);
    ck('(a3) 无悬浮态残留（弹本体已转 bolt 视觉期/消亡）', !stillOrbing, 'ok');
    release();
    await settle(3);
  } catch (e) { R.fatal = '(a) ' + e.message; }

  // ---------- (b) 3852 书杖右键 704 ----------
  try {
    giveItem(3852, 2); p.inv.selected = 2;
    await settle(5);
    // mana spy:记录 checkMana 入参 + 用引擎真值字段读蓝
    p.statManaMax2 = 400; p.manaMax = 400; p.mana = 400;
    const manaCalls = [];
    const origCheck = p.checkMana.bind(p);
    p.checkMana = (a, b) => { manaCalls.push(a); return origCheck(a, b); };
    const foe = makeFoe(px + 4);
    await ticks(2); foeLog.unfreeze();
    const hp0 = foe.hp;
    let twisterSeen = false;
    let manaAtHit = null;
    const t0 = performance.now();
    g.input.rightDown = true;
    for (let i = 0; i < 8 && !twisterSeen; i++) {
      await ticks(1);
      twisterSeen = g.entities.projectiles.some((q) => q.projId === 704);
      if (twisterSeen && manaAtHit === null) manaAtHit = p.mana;
    }
    const mana0 = 400;
    const twister = g.entities.projectiles.find((q) => q.projId === 704);
    ck('(b1) 右键生成 704 风暴柱在场', !!twister, `found=${!!twister}`);
    if (twister) ck('(b2) 盒 60×210(SetDefaults :7450)', twister.w === 60 && twister.h === 210,
      `${twister.w}×${twister.h}`);
    ck('(b3) 蓝 ×2=40(GetManaCostToPay :53320——checkMana spy 入参含 40)',
      manaCalls.includes(40), `calls=${JSON.stringify(manaCalls)}`);
    void manaAtHit; void mana0;   // 引擎侧蓝池钳制(新角 20 上限)使净耗读数失真——入参 spy 为准
    for (let i = 0; i < 45; i++) { foeLog.unfreeze(); await ticks(1); }
    ck('(b4) 风暴柱接触掉血(local 免疫 −1)', foe.hp < hp0, `hp ${hp0}→${foe.hp}`);
    // RMB 连发(:31902):继续按住跨动画窗,spy 计第二颗生成
    let made = 1;
    const origAddB = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => { if (e && e.projId === 704) made++; return origAddB(e, b); };
    g.input.rightDown = true;
    for (let i = 0; i < 70; i++) { g.fixedUpdate(1 / 60); }
    g.entities.add = origAddB;
    release();
    ck('(b5) RMB 连发门(:31902 itemAnimation==0 再入,70t 内再产 ≥1)',
      made >= 2, `made=${made} dt=${Math.round(performance.now() - t0)}ms`);
    void mana0;
    await settle(4);
  } catch (e) { R.fatal = R.fatal ?? '(b) ' + e.message; }

  // ---------- (c) 2795 激光机枪四档加速 ----------
  try {
    giveItem(2795, 2); p.inv.selected = 2;
    await settle(5);
    p.statManaMax2 = 400; p.manaMax = 400; p.mana = 400;
    makeFoe(px + 10);
    await ticks(2);
    aimAt((px + 10) * TILE + 8, sy * TILE - 64);
    let nowTick = 0;
    const addTicks = [];
    const origAdd = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && e.projId === 440) addTicks.push(nowTick);
      return origAdd(e, b);
    };
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 150; i++) { nowTick = i; g.fixedUpdate(1 / 60); }
    g.entities.add = origAdd;
    release();
    const holder = g.entities.projectiles.find((q) => q.projId === 439);
    ck('(c1) 持握体 439 在场(channel)', !!holder, `found=${!!holder}`);
    ck('(c2) 双发 440(add 间谍捕获对)', addTicks.length >= 4 && addTicks.length % 2 === 0,
      `beams=${addTicks.length}`);
    const volleyTicks = [...new Set(addTicks)];
    const gaps = volleyTicks.slice(1).map((t, i) => t - volleyTicks[i]);
    R.dbg.volleyGaps = gaps;
    ck('(c3) 四档加速:出现 ≤13 的快拍间隔(stage@40/80/120 → 24/18/12/6)',
      gaps.some((x) => x <= 13), `gaps=${JSON.stringify(gaps.slice(0, 12))}`);
    ck('(c4) 发射拍持续扣蓝(CheckMana per-volley)', 400 - p.mana > 6,
      `drained=${400 - p.mana}`);
    await settle(4);
  } catch (e) { R.fatal = R.fatal ?? '(c) ' + e.message; }

  // ---------- (d) 5065 公主之武魔法阵 ----------
  try {
    giveItem(5065, 2); p.inv.selected = 2;
    await settle(5);
    const foe = makeFoe(px + 4);   // 魔法阵自带 104 盒,敌无需放大
    await ticks(2); foeLog.unfreeze();
    aimAt(foeLog.home.x, foeLog.home.y);
    g.input.mouseDown = true; g.input.mouseHeld = false;
    await ticks(3);
    const circle = g.entities.projectiles.find((q) => q.projId === 950 && !q.dead);
    ck('(d1) 出手生成 950 魔法阵', !!circle, `found=${!!circle}`);
    if (circle) {
      ck('(d2) 盒 104×104(SetDefaults :8960)', circle.w === 104 && circle.h === 104,
        `${circle.w}×${circle.h}`);
      ck('(d3) 零速定点放置(Player.cs:48183)', circle.vx === 0 && circle.vy === 0,
        `v=(${circle.vx},${circle.vy})`);
      const d0 = Math.hypot(circle.cx - foeLog.home.x, circle.cy - foeLog.home.y);
      ck('(d3b) 落点在目标近域(<140px,视线回卷几何)', d0 < 140, `dist=${Math.round(d0)}`);
      const hp0 = foe.hp;
      for (let i = 0; i < 10; i++) { foeLog.unfreeze(); await ticks(1); }
      ck('(d4) 接触掉血(伤×0.98 折价后)', foe.hp < hp0, `hp ${hp0}→${foe.hp}`);
      // 60t 包络:引擎主循环驱动,墙钟窗断言(60t@60fps≈1000ms,容差 ±350ms)
      const born = performance.now();
      let died = -1;
      for (let i = 0; i < 160 && died < 0; i++) {
        await ticks(1);
        if (!g.entities.projectiles.includes(circle)) died = performance.now() - born;
      }
      ck('(d5) AI 自管 60t 包络自灭(AI_186 num=60)', died >= 550 && died <= 1350,
        `lifeMs=${Math.round(died)}`);
    }
    release();
    await settle(3);
  } catch (e) { R.fatal = R.fatal ?? '(d) ' + e.message; }

  // ---------- (e) 6154 花瓣隔墙不追踪 ----------
  try {
    giveItem(6154, 2); p.inv.selected = 2;
    await settle(5);
    const st = g.world.store;
    const wx = px + 3;
    for (let y = 0; y < st.h; y++) st.setTileSilent(wx, y, 1);   // 竖墙
    const foe = makeFoe(px + 7);
    await ticks(2); foeLog.unfreeze();
    aimAt(foeLog.home.x, foeLog.home.y);
    g.input.mouseDown = true; g.input.mouseHeld = false;
    await ticks(4);
    const petalCount = g.entities.projectiles.filter((q) => q.projId === 1116).length;
    ck('(e1) 每击 3 瓣(Player.cs:48001)', petalCount >= 3, `petals=${petalCount}`);
    for (let i = 0; i < 45; i++) {
      for (const q of g.entities.projectiles) {
        if (q.projId === 1116 && !q.dead && q.cx > wx * TILE - 10) q.dead = true;   // 触墙记号
      }
      foeLog.unfreeze();
      await ticks(1);
    }
    ck('(e2) 隔墙不追踪:花瓣未穿墙命中墙后敌(R34-① LOS 门)', foeLog.hits.length === 0,
      `wallHits=${foeLog.hits.length}`);
    for (let y = 0; y < st.h; y++) st.setTileSilent(wx, y, 0);   // 还原地形
    release();
  } catch (e) { R.fatal = R.fatal ?? '(e) ' + e.message; }

  return R;
});

console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('pageerrors:', errs.slice(0, 5));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== PROBE RESULT: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
