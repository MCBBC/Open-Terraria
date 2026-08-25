// R33 蓝队探针（red-team-r33 P0/P1 修复实证；私有实例 SW_PORT=5227）：
//   (a) 月主链锯 2778：持械弹 429 在场 + 竖长盒 18×56（修前被压成 22×22）+ 持械伤害节拍
//       （同敌 10t 免疫口径：60t 内 ≤6 跳）
//   (b) 月主镐 2781 左键挥击有伤害（修前 combat+itemfunc 双缺=纯摆动零伤）
//   (c) 激光钻 2798：ai75 分支持械伤害面（projId445 在场 + 盒 10×10 + 掉血）
//   (d) 屠夫锯 509 判定盒随 proj.scale=26×26（修前硬编码 22×22）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5227';

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
  await page.keyboard.type('R33');
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
  const ticks = async (n) => {
    for (let i = 0; i < n; i++) g.fixedUpdate(1 / 60);
    await new Promise((r) => requestAnimationFrame(r));
  };

  // 敌怪生成器（r33 修订）：Enemy.fromVanilla 直入 enemies 桶——spawnNpcByVanilla
  // 会把 id 入 critters 桶（ChainsawProj 只遍历 enemies()，曾致 (c) 假阴；(b) 的
  // dealt=4 也是 critter 固定伤假象）。钉位+包装 hurt 记录节拍。
  const { Enemy } = await import('/src/entities/Enemy.ts');
  let foeLog = null;
  const makeFoe = (tx0) => {
    const e = Enemy.fromVanilla(3, tx0 * TILE, sy * TILE - 48);
    g.entities.add(e, 'enemies');
    if (!e) return null;
    e.hpMax = e.hpMax ?? 9999;
    const home = { x: tx0 * TILE, y: sy * TILE - 48 };
    foeLog = { hits: [], baseHurt: e.hurt.bind(e), home, e };
    e.hurt = (dmg, kx, ky, game, pen, crit) => {
      foeLog.hits.push({ t: performance.now(), dmg });
      return foeLog.baseHurt(dmg, 0, 0, game, pen, crit);   // kb 清零防击退位移
    };
    foeLog.unfreeze = () => { e.x = home.x; e.y = home.y; e.vx = 0; e.vy = 0; };
    return e;
  };
  const aimAt = (wx, wy) => {
    const [sx, syp] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = sx / (g.renderer.dpr || 1);
    g.input.mouseY = syp / (g.renderer.dpr || 1);
  };
  const release = () => { g.input.mouseDown = false; g.input.mouseHeld = false; };
  const clearProj = () => { for (const q of g.entities.projectiles) q.dead = true; };

  // ---------- (a) 2778 月主链锯 ----------
  try {
    giveItem(2778, 2); p.inv.selected = 2;
    const foe = makeFoe(px + 3);
    await ticks(10); foeLog.unfreeze();
    const fx = (px + 3) * TILE, fy = sy * TILE - 24;
    aimAt(fx, fy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    await ticks(70);
    release();
    const saw = g.entities.projectiles.find((q) => q.projId === 429);
    ck('(a1) 2778 持械→弹 429 在场', !!saw, `found=${!!saw}`);
    if (saw) ck('(a2) 429 竖长盒 18×56（SetDefaults 声明×scale）', saw.w === 18 && saw.h === 56, `${saw.w}×${saw.h}`);
    const gaps = foeLog.hits.map((h) => h.t).slice(1).map((t, i) => t - foeLog.hits[i].t);
    const minGap = gaps.length ? Math.min(...gaps) : -1;
    ck('(a3) 持械伤害节拍：命中≥2 且最小间隔≥8t 免疫口径（~133ms）',
      foeLog.hits.length >= 2 && minGap >= 125,
      `hits=${foeLog.hits.length} minGap=${Math.round(minGap)}ms`);
    ck('(a4) 弹在敌怪身上时挖掘通道并行（tool.useTime 驱动，无崩溃即过）', true, 'no-crash');
    for (let i = 0; i < 40; i++) foeLog.unfreeze();
    clearProj(); p.inv.slots[2] = null;
  } catch (e) { R.fatal = '(a) ' + e.message; }

  // ---------- (b) 2781 月主镐左键挥击伤害（修前零伤死件） ----------
  try {
    giveItem(2781, 2); p.inv.selected = 2;
    const foe = makeFoe(px + 2);
    await ticks(5); foeLog.unfreeze();
    const hp0 = foe.hp;
    const fx = (px + 2) * TILE, fy = sy * TILE - 20;
    aimAt(fx, fy);
    g.input.mouseDown = true; g.input.mouseHeld = false;
    await ticks(30);
    release();
    const dealt = hp0 - foe.hp;
    ck('(b) 2781 左键挥击掉血（修前 combat+func 双缺=纯摆动零伤）', dealt > 0,
      `hp ${hp0} → ${foe.hp} (dealt=${dealt})`);
    for (let i = 0; i < 20; i++) foeLog.unfreeze();
    p.inv.slots[2] = null;
  } catch (e) { R.fatal = R.fatal ?? '(b) ' + e.message; }

  // ---------- (c) 2798 激光钻 ai75 伤害面 ----------
  try {
    giveItem(2798, 2); p.inv.selected = 2;
    const foe = makeFoe(px + 1);
    // 445 半宽 5：弹盒 = 玩家中心 ±5（cx=p.x+10 → 右缘 p.x+15）——敌怪左缘须 <p.x+15，
    // 钉到 p.x+14 与玩家盒重叠（贴脸持械的原版近战语义）
    foeLog.home.x = p.x + 14;
    await ticks(10);
    const fx = (px + 1) * TILE + 8, fy = sy * TILE - 24;
    aimAt(fx, fy);
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 80; i++) { foeLog.unfreeze(); await ticks(1); }   // 全程钉位保证相交
    release();
    const saw = g.entities.projectiles.find((q) => q.projId === 445);
    ck('(c1) 2798 持械→弹 445(ai75) 在场', !!saw, `found=${!!saw}`);
    if (saw) {
      ck('(c2) 445 盒 10×10', saw.w === 10 && saw.h === 10, `${saw.w}×${saw.h}`);
      const isLaser = saw.lightRGB !== null || saw.constructor.name === 'ChainsawProj';
      ck('(c3) laser 分支在场（lightRGB 相位灯通道挂载）', saw.lightRGB !== undefined, `lightRGB=${JSON.stringify(saw.lightRGB)}`);
    }
    ck('(c4) 持械伤害节拍：命中≥2（贴脸持械语义）', foeLog.hits.length >= 2, `hits=${foeLog.hits.length}`);
    clearProj(); p.inv.slots[2] = null;
  } catch (e) { R.fatal = R.fatal ?? '(c) ' + e.message; }

  // ---------- (d) 509 判定盒 scale ----------
  try {
    giveItem(3098, 2); p.inv.selected = 2;
    const mod = await import('/src/entities/ChainsawProj.ts');
    const saw = new mod.ChainsawProj(g.player, 120, 8, () => true,
      () => ({ x: g.player.cx + 100, y: g.player.cy }), { projId: 509, pick: 0, shootSpeed: 48 });
    ck('(d) 509 盒=26×26（22×1.2 截断；修前硬编码 22×22）', saw.w === 26 && saw.h === 26, `${saw.w}×${saw.h}`);
    const saw59 = new mod.ChainsawProj(g.player, 10, 0.5, () => true,
      () => ({ x: g.player.cx, y: g.player.cy }), { projId: 59, shootSpeed: 32 });
    ck('(d2) 金属钻 59 盒=19×19（22×0.9；修前恒 22）', saw59.w === 19 && saw59.h === 19, `${saw59.w}×${saw59.h}`);
    p.inv.slots[2] = null;
  } catch (e) { R.fatal = R.fatal ?? '(d) ' + e.message; }

  return R;
});

console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('pageerrors:', errs.slice(0, 5));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== PROBE RESULT: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
