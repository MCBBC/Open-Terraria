// 修齐批②探针：钛金屏障（5240）。
// (a) 穿钛金三件 → Enemy.hurt(fromPlayer) → buff306 在 + 碎片 908 生成
// (b) 连续命中 → 碎片 ≤7 上限（ownedProjectileCounts 门）
// (c) 碎片环绕（位移动画：位置随 tick 变化）+ buff 摘除后碎片消亡
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5240';
const browser = await puppeteer.launch({
  protocolTimeout: 400000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('TI');
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
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { checks: [], dbg: {} };
  const ck = (n, ok, d) => R.checks.push({ n, ok, d });
  const p = g.player;
  const st0 = g.world.store;
  const px = Math.floor(p.x / TILE);
  let sy = Math.max(5, Math.floor(g.world.groundLevel));
  p.x = px * TILE;
  for (let t = 0; t < 40; t++) {
    p.y = sy * TILE - p.h - 2;
    if (!st0.isSolid(Math.floor(p.cx / 16), Math.floor((p.y + p.h / 2) / 16))) break;
    sy -= 1;
  }
  p.vx = 0; p.vy = 0;
  for (let i = 0; i < 100; i++) g.fixedUpdate(1 / 60);
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;

  // 穿钛金三件（1215 头/1218 胸/1219 腿）
  const items = await import('/src/data/items.ts');
  const give = (vid, slot) => {
    const key = items.VANILLA_ITEM_KEY_BY_ID[vid];
    const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_${vid}_`];
    p.inv.armor[slot] = { id, stack: 1 };
  };
  give(1215, 0); give(1218, 1); give(1219, 2);
  // 刷新装备聚合（等一拍）
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  const tiOn = !!(p.equipStats && p.equipStats.titaniumStorm);
  ck('(a0) 钛金套装位生效(equipStats.titaniumStorm)', tiOn, `=${tiOn}`);

  // 假人
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const foe = Enemy.fromVanilla(3, (px + 6) * TILE, (sy - 4) * TILE);
  g.entities.add(foe, 'enemies');
  foe.hpMax = 999999; foe.hp = 999999;

  // 直接走中央漏斗（Enemy.hurt fromPlayer=true）
  const count908 = () => g.entities.projectiles.filter((q) => !q.dead && (q).projId === 908).length;
  foe.hurt(10, 1, 0, g, 0, false, 0, true);
  for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
  const hasBuff = p.buffs && p.buffs.has ? p.buffs.has(306) : false;
  ck('(a1) buff 306 钛金屏障在', hasBuff, `has=${hasBuff}`);
  ck('(a2) 碎片 908 生成', count908() >= 1, `n=${count908()}`);

  // 连发 12 次 → 上限 7
  for (let i = 0; i < 12; i++) {
    p.titaniumStormCd = 0;                                  // 清冷却模拟连续命中
    foe.hurt(10, 1, 0, g, 0, false, 0, true);
    g.fixedUpdate(1 / 60);
  }
  const n = count908();
  ck('(b) 碎片上限 7(ownedProjectileCounts 门)', n === 7, `n=${n}`);

  // 环绕动画：碎片位置随 tick 变化
  const s0 = g.entities.projectiles.find((q) => !q.dead && q.projId === 908);
  let moved = false;
  if (s0) {
    const p0 = { x: s0.cx, y: s0.cy };
    for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    moved = Math.hypot(s0.cx - p0.x, s0.cy - p0.y) > 4;
  }
  ck('(c1) 碎片环绕动画(位置随 tick 变化)', moved, `moved=${moved}`);

  // buff 摘除 → 碎片消亡
  p.buffs.remove?.(306);
  if (p.buffs && p.buffs.active) p.buffs.active.delete(306);
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  ck('(c2) buff 摘除 → 碎片消亡(AI_175 存续门)', count908() === 0, `n=${count908()}`);
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
const bad = out.checks.filter((c) => !c.ok);
console.log(`\n== TI PROBE: ${out.checks.length - bad.length}/${out.checks.length} passed ==`);
process.exit(bad.length ? 1 : 0);
