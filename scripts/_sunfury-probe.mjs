// 阳炎之怒(vi_220_sunfury, flail aiStyle 15)AI_015 全语义探针:
//   1) 按住 = 绕体旋转(半径 37px,type 35 参数)而非追光标,且存活不闪消
//   2) noUseGraphic:使用期间 swing 为空(角色旁无静态持物图标)
//   3) 松手 = 朝鼠标掷出(初速 17,type 35 参数)
//   4) 命中施加 OnFire(StatusNPC:35 → 50% AddBuff(24,300)=5s,Math.random 固定 0.1 强制命中)
//   5) 链条贴图 Chain6.png 可加载
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  for (let dx = -25; dx <= 25; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -25; dx <= 25; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;

  const sunfuryId = window.__swItems['vi_220_sunfury'];
  g.player.inv.add(sunfuryId, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === sunfuryId);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  g.player.useTime = 0;

  const res = {};
  // ---- 链条贴图加载 ----
  res.chain6 = await new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im.naturalWidth > 0);
    im.onerror = () => resolve(false);
    im.src = 'sprites/vanilla/Chain6.png';
  });

  // ---- 1) 按住:旋转态 ----
  g.input.mouseX = 640 + 300; g.input.mouseY = 400; // 光标在右侧
  g.input.mouseDown = true; g.input.mouseHeld = true;
  let flail = null;
  for (let i = 0; i < 40 && !flail; i++) {
    g.fixedUpdate(1 / 60);
    flail = g.entities.projectiles.find((p) => p.projId === 35 && !p.dead);
  }
  res.spawned = !!flail;
  if (flail) {
    res.spawnFrame = 'ok';
    // 旋转 60+ tick,采样球心距
    const dists = [];
    for (let i = 0; i < 70; i++) {
      g.fixedUpdate(1 / 60);
      const d = Math.hypot(flail.x + flail.w / 2 - g.player.cx, flail.y + flail.h / 2 - g.player.cy);
      dists.push(+d.toFixed(1));
    }
    res.orbitDists = { min: Math.min(...dists), max: Math.max(...dists), samples: dists.slice(0, 8) };
    res.aliveAfterSpin = !flail.dead;
    // 2) 静态图标:使用期间不应有 swing 持物动画
    res.swingNull = !g.swing || g.swing.item !== sunfuryId;
    // 2b) GetWeaponCrit:4 基础 + 武器 crit 7(Item.cs case 220) = 11%
    res.critChance = flail.critChance;
  }

  // ---- 4) 灼烧:摆敌怪在旋转路径上,固定 Math.random=0.1(50% 掷骰必过) ----
  if (flail) {
    const en = g.spawnEnemy('v_6', g.player.cx + 30, g.player.cy - 20); // 僵尸(原版 6)
    const realRandom = Math.random;
    Math.random = () => 0.1;
    en.onFireT = 0;
    let fired = false;
    for (let i = 0; i < 240; i++) {
      g.fixedUpdate(1 / 60);
      if ((en.onFireT ?? 0) > 0) { fired = true; break; }
    }
    Math.random = realRandom;
    res.burnApplied = fired;
    res.enemyOnFire = +(en.onFireT ?? 0).toFixed(2);
    en.dead = true;
  }

  // ---- 3) 松手:掷出(初速 17 type 35) ----
  if (flail && !flail.dead) {
    const x0 = flail.x, y0 = flail.y;
    g.input.mouseHeld = false;
    for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
    res.throwV = { vx: +flail.vx.toFixed(1), vy: +flail.vy.toFixed(1), x: +flail.x.toFixed(0) };
    res.thrownRight = flail.vx > 14;
    // 再走 20 tick:掷出态直线
    for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    res.aliveAfterThrow = !flail.dead;
  }
  return res;
});

console.log(JSON.stringify(out, null, 1));
check('装备 vi_220_sunfury', true);
check('掷出链球(projid 35)', !!out.spawned);
if (out.orbitDists) {
  // 原版椭圆轨迹(:41189-41197):水平向 R=37,向下 Y×0.8 再×0.5 → 最低点 37×0.4≈14.8
  check('按住=绕体旋转(椭圆 R=37/下压 0.4)', Math.abs(out.orbitDists.max - 37) < 2 && Math.abs(out.orbitDists.min - 14.8) < 2,
    `min=${out.orbitDists.min} max=${out.orbitDists.max}`);
}
check('旋转期间存活(channel 语义)', out.aliveAfterSpin !== false);
check('无静态持物图标(noUseGraphic)', out.swingNull !== false);
check('暴击率 = 4基础+武器crit(GetWeaponCrit)', out.critChance !== undefined && Math.abs(out.critChance - 0.11) < 0.001, `crit=${out.critChance}`);
check('命中施加 OnFire(StatusNPC)', out.burnApplied === true, `onFireT=${out.enemyOnFire}s`);
check('松手朝鼠标掷出(初速 17)', out.thrownRight === true, JSON.stringify(out.throwV));
check('链条贴图 Chain6.png 可加载', out.chain6 === true);
check('无 page error', errors.length === 0, errors.join('; '));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
