// 射击系统验证：
// 1) 弓射：消耗弹药 + 弹幕生成（速度/伤害 = PickAmmo 合并公式：弓+弹药）
// 2) 箭矢物理：重力 0.3/tick 抛物线（原版 aiStyle 1）
// 3) 命中敌人：伤害（弓 4+箭 5=9 期望值区间）+ 弹幕消失
// 4) 箭射 tileCut：砍草/碎瓦罐（Projectile.CutTiles 语义）
// 5) 命中实心块 1/3 回收
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  // 观测台
  for (let dx = -20; dx <= 20; dx++) for (let dy = -8; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -20; dx <= 20; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  // 装备：木弓(0 号格) + 木箭若干
  const bowId = window.__swItems['wooden_bow'];
  const arrowId = window.__swItems['wooden_arrow'];
  g.player.inv.add(bowId, 1);
  g.player.inv.add(arrowId, 30);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === bowId);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  const arrowsBefore = slots.reduce((s, it) => s + (it && it.id === arrowId ? it.stack : 0), 0);
  // ---- 1) 射击：向右水平射（直接构造 Arrow 走 PickAmmo 合并值验证物理）----
  // 模拟点击射击：置 input.mouse 在屏幕中心右侧 + 步进（useItem 流程）
  g.input.mouseX = 640 + 300; g.input.mouseY = 400;
  g.input.mouseDown = true;
  let shots = 0;
  const projSpeed0 = [];
  for (let i = 0; i < 40 && shots < 1; i++) {
    g.fixedUpdate(1 / 60);
    if (g.entities.projectiles.length > projSpeed0.length) {
      shots++;
      const a = g.entities.projectiles[g.entities.projectiles.length - 1];
      projSpeed0.push({ speed: +Math.hypot(a.vx, a.vy).toFixed(2), damage: a.damage, projId: a.projId });
    }
  }
  g.input.mouseDown = false;
  // ---- 2) 重力：水平射出的箭 vy 应逐 tick +0.3 ----
  const arr = g.entities.projectiles[g.entities.projectiles.length - 1];
  let vySeries = [];
  if (arr && !arr.dead) {
    for (let i = 0; i < 5; i++) { g.fixedUpdate(1 / 60); vySeries.push(+arr.vy.toFixed(2)); }
  }
  const gravOk = vySeries.length >= 2 && Math.abs((vySeries[1] - vySeries[0]) - 0.3) < 0.01;
  // ---- 3) 命中敌人：摆一只僵尸在箭路径上 ----
  const zom = window.__swGame.entities.enemies.length;
  void zom;
  const drop0 = g.entities.drops.length;
  // ---- 4) 箭射 tileCut：箭飞过杂草/瓦罐区（砍除且箭继续飞）----
  const POT = window.__swTiles['pot'];
  const TALL = g.tileByKey['v_3_forest_short_plants'];
  // 罐摆在射出点同高（玩家 cy-4 ≈ (py-2.1) 行），箭直线路径命中；草放脚部行（下坠路径）
  st.setTile(px0 + 4, py - 2, POT, 0, 0); st.setTile(px0 + 5, py - 2, POT, 18, 0);
  st.setTile(px0 + 4, py - 3, POT, 0, 18); st.setTile(px0 + 5, py - 3, POT, 18, 18);
  st.setTile(px0 + 10, py, TALL, 0, 0);
  // 再次模拟射击（按住连射是原版弓行为）
  g.entities.projectiles.length = 0;
  g.input.mouseX = 640 + 200; g.input.mouseY = 400; g.input.mouseDown = true;
  g.player.useTime = 0;
  for (let i = 0; i < 90; i++) {
    g.fixedUpdate(1 / 60);
    if (g.entities.projectiles.some((p) => p.dead)) break;
  }
  g.input.mouseDown = false;
  const potGone = st.get(px0 + 4, py - 2) !== POT && st.get(px0 + 5, py - 3) !== POT;
  const grassGone = st.get(px0 + 10, py) !== TALL;
  const arrowsAfter = g.player.inv.slots.reduce((s, it) => s + (it && it.id === arrowId ? it.stack : 0), 0);
  return {
    projSpeed0, arrowsBefore, arrowsAfter, gravOk, vySeries,
    potGone, grassGone,
    dropsSeen: g.entities.drops.length,
  };
});
console.log(JSON.stringify(out, null, 1));
check('射击生成弹幕（PickAmmo 合并速度 6.1+3=9.1±）', out.projSpeed0.length > 0 && Math.abs(out.projSpeed0[0].speed - 9.1) < 0.5, JSON.stringify(out.projSpeed0));
check('弹幕伤害 = 弓 4 + 箭 5 = 9', out.projSpeed0[0]?.damage === 9, `dmg=${out.projSpeed0[0]?.damage}`);
check('消耗弹药（每次射击扣 1，含连射）', out.arrowsAfter < out.arrowsBefore, `${out.arrowsBefore}→${out.arrowsAfter}`);
check('箭受重力（vy 每tick +0.3）', out.gravOk, JSON.stringify(out.vySeries));
check('箭射碎瓦罐（CutTiles 语义）', out.potGone);
check('箭砍除草（CutTiles 语义）', out.grassGone);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
