// 黄蜂毒刺探针 v2（scripts/_hornet-stinger-probe.mjs）
// 根因链验证：挥击重启门 !this.swing 使每周期 1 帧 useTime==0 对 AI 可见 → ai1 清零 → 不射。
// 修复后三组：
//   A 直接驱动 AI + 持续 useTime>0（持械战斗代理）：期望发射
//   B 待机 useTime=0：原版 itemAnimation 门 → 不发射
//   C 真实游戏循环：手持剑按住鼠标 + 真黄蜂入实体桶 → 期望真实 AI 发射毒刺
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('黄蜂探针');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
try {
  await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 420000 });
} catch (e) {
  console.log('等待进世界超时,诊断:', JSON.stringify(errs.slice(-10), null, 2));
  await page.screenshot({ path: '/tmp/hornet-stuck.png' });
  throw e;
}
await new Promise(r => setTimeout(r, 1500));

// ---- A/B：直接驱动 AI ----
const ab = await page.evaluate(async () => {
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const sx = g.world.spawnX, sy = g.world.spawnY;
  const clearSky = (x0, y0) => {
    for (let x = x0; x < x0 + 60; x++) {
      for (let y = y0 - 30; y < y0; y++) if (st.isSolid(x, y)) return false;
    }
    return true;
  };
  let px = sx;
  for (let dx = 0; dx < 500 && !clearSky(px, sy); dx += 20) px = sx + dx;
  p.x = px * 16; p.y = (sy - 6) * 16; p.vx = 0; p.vy = 0;
  p.fixedUpdate(1, g);

  const run = (vid, useTimeFn) => {
    const h = Enemy.fromVanilla(vid, p.cx + 200, p.cy - 10);
    if (!h) return { err: 'fromVanilla null' };
    g.entities.add(h, 'enemies');
    let fired = 0, maxAi1 = 0;
    for (let t = 0; t < 600; t++) {
      p.useTime = useTimeFn(t);
      const n0 = g.entities.projectiles.length;
      h.fixedUpdate(1, g);
      if (g.entities.projectiles.length > n0) fired++;
      maxAi1 = Math.max(maxAi1, h.ai1 ?? 0);
      if (fired >= 3) break;
    }
    g.entities.enemies.splice(g.entities.enemies.indexOf(h), 1);
    return { fired, maxAi1: Math.round(maxAi1) };
  };
  return {
    A_42_combat: run(42, () => 5),          // 持械战斗：useTime 恒 >0
    B_42_idle: run(42, () => 0),            // 待机
  };
});
console.log('A/B:', JSON.stringify(ab));

// ---- C：真实游戏循环端到端 ----
const cRes = await page.evaluate(async () => {
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const g = window.__swGame;
  const p = g.player;
  const swordId = window.__swItems['copper_sword'] ?? window.__swItems['wood_sword'];
  p.inv.slots[0] = { id: swordId, stack: 1 };
  p.inv.selected = 0;
  // 计数 projectiles 桶新增
  let spawned = 0;
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, b) => { if (b === 'projectiles') spawned++; return origAdd(e, b); };
  // 观察实体更新时刻 AI 可见的 useTime 最小值
  let minUseTimeAtAI = 99;
  const origUpdate = g.entities.update.bind(g.entities);
  g.entities.update = (dt, gg) => {
    if (p.useTime < minUseTimeAtAI) minUseTimeAtAI = p.useTime;
    return origUpdate(dt, gg);
  };
  // 放真黄蜂
  const h = Enemy.fromVanilla(42, p.cx + 200, p.cy - 10);
  g.entities.add(h, 'enemies');
  g.input.mouseDown = true;
  // 真实循环跑 ~6 秒
  await new Promise(r => setTimeout(r, 6000));
  g.input.mouseDown = false;
  g.entities.add = origAdd;
  g.entities.update = origUpdate;
  const idx = g.entities.enemies.indexOf(h);
  if (idx >= 0) g.entities.enemies.splice(idx, 1);
  return { spawned, minUseTimeAtAI, hornetAi1: Math.round(h.ai1 ?? 0), swordId };
});
console.log('C:', JSON.stringify(cRes));

let ok = true;
if (!ab.A_42_combat || !ab.A_42_combat.fired) { ok = false; console.log('✗ A 持械战斗未发射 (maxAi1=' + (ab.A_42_combat?.maxAi1) + ')'); }
else console.log('✓ A 持械战斗发射', ab.A_42_combat.fired, '发');
if (ab.B_42_idle && ab.B_42_idle.fired) { ok = false; console.log('✗ B 待机也发射(违背原版 itemAnimation 门)'); }
else console.log('✓ B 待机不发射(原版门语义)');
if (cRes.minUseTimeAtAI === 0) { ok = false; console.log('✗ C 挥剑期间 AI 仍观察到 useTime==0(重启门未闭合)'); }
else console.log('✓ C 挥剑期间 AI 可见 useTime 最小值 =', cRes.minUseTimeAtAI);
if (!cRes.spawned) { ok = false; console.log('✗ C 真实循环黄蜂未发射毒刺'); }
else console.log('✓ C 真实循环毒刺新增', cRes.spawned, '发');
if (errs.length) { ok = false; console.log('✗ 页面错误:', errs.slice(0, 3)); }
console.log(ok ? '✓ 黄蜂毒刺全链路符合原版' : '✗ 探针失败');
await browser.close();
process.exit(ok ? 0 : 1);
