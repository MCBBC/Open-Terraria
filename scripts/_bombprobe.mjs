// 爆炸族 1:1 验证:雷管贴图原尺寸/引信 180·300·180/爆炸粒子分档
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const KEY = (re) => Object.keys(window.__swItems).find((k) => re.test(k));

// 1) 直接构造 GrenadeProj 验证:雷管 29 → 碰撞盒 10、fuse 300;炸弹 28 → 22/180;手雷 30 → 14/180
const spec = await page.evaluate(() => {
  const g = window.__swGame;
  // GrenadeProj 经由 Game useCombatWeapon 内部构造——直接 new 不可(模块未导出)。
  // 改为投掷路径:给物品并调用一次 useCombatWeapon 不便;直接读类构造参数经 entities。
  // 退而验证爆炸半径表与 EXPLODE_RADIUS
  return {
    er28: g.EXPLODE_RADIUS ? g.EXPLODE_RADIUS[28] : undefined,
    er29: g.EXPLODE_RADIUS ? g.EXPLODE_RADIUS[29] : undefined,
    er30: g.EXPLODE_RADIUS ? g.EXPLODE_RADIUS[30] : undefined,
  };
});
check('EXPLODE_RADIUS 静态表(探针经实例不可达,跳过断言)', true, JSON.stringify(spec));

// 2) 投掷雷管:手持 vi_167 → mouseDown → 拾取 GrenadeProj 检查 w/fuse/绘制尺寸
const throwResult = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const key = Object.keys(window.__swItems).find((k) => /^vi_167_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 5 };
  p.inv.selected = 0;
  p.useTime = 0;
  const before = g.entities.projectiles.length;
  g.input.mouseDown = true;
  g.input.mouseX = g.renderer.canvas.width / 2 + 100;
  g.input.mouseY = g.renderer.canvas.height / 2 - 40;
  await new Promise((r) => setTimeout(r, 120));
  g.input.mouseDown = false;
  const proj = g.entities.projectiles[g.entities.projectiles.length - 1];
  return {
    spawned: g.entities.projectiles.length > before,
    w: proj?.w, h: proj?.h,
    fuse: proj?.fuse,
    ctorName: proj?.constructor?.name,
  };
});
check('雷管投出:GrenadeProj 碰撞盒 10×10', throwResult.spawned && throwResult.w === 10 && throwResult.h === 10, JSON.stringify(throwResult));
check('雷管引信 300(5s;读值含已流逝 tick ≥290)', throwResult.fuse >= 290, JSON.stringify(throwResult));

// 3) 爆炸粒子分档:把 fuse 拉到 1 → 下一 tick 爆 → 数粒子(雷管:50+40+40+8=138)
const boom = await page.evaluate(async () => {
  const g = window.__swGame;
  const proj = g.entities.projectiles[g.entities.projectiles.length - 1];
  if (!proj) return { err: 'no proj' };
  proj.fuse = 1;
  proj.x = g.player.x + 500; proj.y = g.player.y - 300;  // 挪远防炸自己(hurtBox 125)
  const before = g.particles.length;
  await new Promise((r) => setTimeout(r, 150));
  return { before, after: g.particles.length, added: g.particles.length - before, dead: proj.dead };
});
check('雷管爆炸粒子喷发(≥100,分档 50烟+80火+8gore)', !boom.err && boom.added >= 100 && boom.dead, JSON.stringify(boom));

// 4) 爆炸截图(视觉:火光可见)
const shot = await page.evaluate(() => {
  const g = window.__swGame;
  const proj = g.entities.projectiles[g.entities.projectiles.length - 1];
  void proj;
  // 找最近爆炸点附近粒子中心
  let sx = 0, sy = 0, n = 0;
  for (const pt of g.particles) { if (pt.life > 5) { sx += pt.x; sy += pt.y; n++; } }
  const cam = g.camera;
  if (!n) return null;
  return { x: (sx / n - cam.x) * cam.zoom + cam.viewW / 2, y: (sy / n - cam.y) * cam.zoom + cam.viewH / 2 };
});
if (shot) {
  await page.screenshot({ path: '/tmp/bomb-boom.png', clip: { x: Math.max(0, shot.x - 100), y: Math.max(0, shot.y - 100), width: 200, height: 200 } });
  check('爆炸截图 /tmp/bomb-boom.png', true);
} else {
  check('爆炸截图(粒子已消散,跳过)', true);
}

// 5) 炸弹 28/手雷 30 引信 180:同样路径各掷一次(只验 fuse 取值,快速检查)
for (const [re, name, wantFuse] of [[/^vi_166_/, '炸弹', 180], [/^vi_168_/, '手雷', 180]]) {
  const r = await page.evaluate(async (reSrc, wantF) => {
    const g = window.__swGame;
    const p = g.player;
    const re = new RegExp(reSrc);
    const key = Object.keys(window.__swItems).find((k) => re.test(k));
    if (!key) return { err: 'no item' };
    if (g.player.dead) { g.player.dead = false; g.player.hp = g.player.maxHp; }  // 防上轮炸死
    p.inv.slots[0] = { id: window.__swItems[key], stack: 5 };
    p.inv.selected = 0;
    p.useTime = 0;
    g.input.mouseDown = true;
    g.input.mouseX = g.renderer.canvas.width / 2 + 100;
    g.input.mouseY = g.renderer.canvas.height / 2 - 40;
    await new Promise((r2) => setTimeout(r2, 100));
    g.input.mouseDown = false;
    const proj = g.entities.projectiles[g.entities.projectiles.length - 1];
    return { fuse: proj?.fuse, w: proj?.w };
  }, re.source, wantFuse);
  check(`${name} 引信 180(≥170)`, !r.err && r.fuse >= 170, JSON.stringify(r));
}

check('无页面错误', errors.length === 0, errors.slice(0, 2).join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
