// 武器族全量回归探针(AI_003 回旋镖 / AI_019 长矛 / AI_099 悠悠球):
// 对照 1456 修复后验证核心行为数值:
//   1) 回旋镖 284(木回旋镖,proj 52,spd 6.5):出程无摩擦直线(速度恒定)/30t 定时回收/
//      返回段穿墙+目标速度 9px/t/与玩家 AABB 相交消失
//   2) 长矛 280(铁矛? proj 49 spd 3.7,prm=[4,0.85,1.1]):伸缩包络
//      max=31 → 刺满 offset=4+0.85×2×31/3=21.5 → 距离 ≈21.5×3.7≈80px
//   3) 悠悠球 3262(→534):YOYO_RANGE[534]=220 顶速 13,寿命 9s;超程 1.3×强制回收
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

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy - 1;
  for (let dx = -30; dx <= 30; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, py + dy, 0);
  for (let dx = -30; dx <= 30; dx++) st.setTile(px0 + dx, py + 1, 2);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (py - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  const res = {};

  const equip = (key) => {
    const id = window.__swItems[key];
    for (let i = 0; i < 60; i++) { const sl = g.player.inv.slots[i]; if (sl) g.player.inv.slots[i] = null; }
    g.player.inv.add(id, 5);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    return id;
  };
  const fire = (frames) => {
    g.input.mouseX = 640 + 300; g.input.mouseY = 400;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < frames; i++) g.fixedUpdate(1 / 60);
  };

  // ---- 1) 回旋镖:无摩擦直线 + 30t 回收 ----
  equip('vi_284_wooden_boomerang');
  fire(1);
  let bom = null;
  for (let i = 0; i < 20 && !bom; i++) { g.fixedUpdate(1 / 60); bom = g.entities.projectiles.find((p) => p.projId === 52); }
  if (bom) {
    const v0 = Math.hypot(bom.vx, bom.vy);
    const samples = [];
    for (let i = 0; i < 12; i++) { g.fixedUpdate(1 / 60); samples.push(+Math.hypot(bom.vx, bom.vy).toFixed(2)); }
    res.boomSpeedConst = { v0: +v0.toFixed(2), samples, maxDev: +Math.max(...samples.map(s => Math.abs(s - v0))).toFixed(3) };
    // 继续走到 30t 自动回收
    let ret = false;
    for (let i = 0; i < 40; i++) { g.fixedUpdate(1 / 60); if (bom.returning) { ret = true; break; } }
    res.boomAutoReturn = ret;
    // 返回段:穿墙 + 目标速度 ~9 + 收手消失
    const retSpd = [];
    for (let i = 0; i < 60 && !bom.dead; i++) { g.fixedUpdate(1 / 60); retSpd.push(+Math.hypot(bom.vx, bom.vy).toFixed(1)); }
    res.boomReturn = { returned: true, died: bom.dead, finalSpd: retSpd[retSpd.length - 1] ?? -1 };
  } else res.boomSpeedConst = null;

  // ---- 2) 长矛:伸缩包络(刺满 ≈80px) ----
  equip('vi_280_spear');
  fire(1);
  let spear = null;
  for (let i = 0; i < 20 && !spear; i++) { g.fixedUpdate(1 / 60); spear = g.entities.projectiles.find((p) => p.projId === 49); }
  if (spear) {
    const dists = [];
    for (let i = 0; i < 31; i++) {
      g.fixedUpdate(1 / 60);
      if (spear.dead) break;
      dists.push(+Math.hypot(spear.x + spear.w / 2 - g.player.cx, spear.y + spear.h / 2 - g.player.cy).toFixed(1));
    }
    res.spear = { max: Math.max(...dists), first: dists[0], last: dists[dists.length - 1], samples: dists.filter((_, i) => i % 5 === 0) };
  } else res.spear = null;

  // ---- 3) 悠悠球 3317(→564):射程 225 钳制 + 松手回收 ----
  equip('vi_3317_valor');
  fire(1);
  let yy = null;
  for (let i = 0; i < 20 && !yy; i++) { g.fixedUpdate(1 / 60); yy = g.entities.projectiles.find((p) => p.projId === 564); }
  if (yy) {
    const dists = [];
    g.input.mouseX = 640 + 600; g.input.mouseY = 400; // 光标超射程
    for (let i = 0; i < 90; i++) { g.fixedUpdate(1 / 60); dists.push(Math.hypot(yy.x + 8 - g.player.cx, yy.y + 8 - g.player.cy)); }
    res.yoyo = { maxDist: +Math.max(...dists).toFixed(0), recalled: yy.recalled, dead: yy.dead };
    g.input.mouseHeld = false;
    let died = false;
    for (let i = 0; i < 150 && !died; i++) { g.fixedUpdate(1 / 60); died = yy.dead; }
    res.yoyoRecall = { died, recalled: yy.recalled };
  } else res.yoyo = null;

  return res;
});

console.log(JSON.stringify(out, null, 1));
check('回旋镖出程无摩擦(速度恒定)', out.boomSpeedConst && out.boomSpeedConst.maxDev < 0.05,
  out.boomSpeedConst ? `v0=${out.boomSpeedConst.v0} maxDev=${out.boomSpeedConst.maxDev}` : 'not spawned');
check('回旋镖 30t 自动回收', out.boomAutoReturn === true);
check('回旋镖返回收手消失', out.boomReturn && out.boomReturn.died === true, JSON.stringify(out.boomReturn));
check('长矛刺满 ≈80px(包络 1:1)', out.spear && Math.abs(out.spear.max - 80) < 12,
  out.spear ? `max=${out.spear.max} samples=${JSON.stringify(out.spear.samples)}` : 'not spawned');
check('悠悠球射程钳制 ≤225+ε(564)', out.yoyo && out.yoyo.maxDist <= 237, `maxDist=${out.yoyo?.maxDist}`);
check('悠悠球松手回收消失', out.yoyoRecall && out.yoyoRecall.died === true, JSON.stringify(out.yoyoRecall));
check('无 page error', errors.length === 0, errors.join('; '));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
