// 黄蜂毒刺探针（scripts/_hornet-stinger-probe.mjs）
// 场景：地表开阔处，黄蜂距玩家 ~200px 有视线。两组对照：
//   A 玩家挥动中(useTime>0)：期望 ~130 计数后 entities.projectiles 增长（毒刺）
//   B 玩家待机(useTime=0)：原版 itemAnimation==0 门 → ai1 恒清零 → 不发射
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

const res = await page.evaluate(async () => {
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  // 开阔地表点：60×30 无实心
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

  const run = (vid, swinging) => {
    const before = g.entities.projectiles.length;
    const h = Enemy.fromVanilla(vid, p.cx + 200, p.cy - 10);
    if (!h) return { vid, swinging, err: 'fromVanilla null' };
    g.entities.add(h, 'enemies');
    let fired = 0;
    let maxAi1 = 0;
    for (let t = 0; t < 600; t++) {
      if (swinging) p.useTime = (t % 30 < 25) ? 5 : 0;  // 持续挥动感
      else p.useTime = 0;
      const n0 = g.entities.projectiles.length;
      h.fixedUpdate(1, g);
      if (g.entities.projectiles.length > n0) fired++;
      maxAi1 = Math.max(maxAi1, h.ai1 ?? 0);
      if (fired >= 3) break;
      // 防止掉出世界/被更新循环重复驱动：直接驱动本体即可
    }
    g.entities.enemies.splice(g.entities.enemies.indexOf(h), 1);
    return { vid, swinging, fired, maxAi1: Math.round(maxAi1), hp: h.hp };
  };

  return {
    A_42_swinging: run(42, true),
    B_42_idle: run(42, false),
    C_231_swinging: run(231, true),
    D_176_swinging: run(176, true),
    projCount: g.entities.projectiles.length,
  };
});
console.log(JSON.stringify(res, null, 2));

let ok = true;
const a = res.A_42_swinging, b = res.B_42_idle;
if (!a.fired) { ok = false; console.log('✗ 挥动中 42 未发射毒刺 (maxAi1=' + a.maxAi1 + ')'); } else console.log('✓ 挥动中 42 发射', a.fired, '发');
if (b.fired) { ok = false; console.log('✗ 待机时也发射(与原版 itemAnimation 门不符)'); } else console.log('✓ 待机不发射(原版门语义)');
if (!res.C_231_swinging.fired) { ok = false; console.log('✗ 231 变体未发射'); } else console.log('✓ 231 变体发射', res.C_231_swinging.fired, '发');
if (!res.D_176_swinging.fired) { ok = false; console.log('✗ 176 苔藓黄蜂未发射'); } else console.log('✓ 176 苔藓黄蜂发射', res.D_176_swinging.fired, '发');
if (errs.length) { ok = false; console.log('✗ 页面错误:', errs.slice(0, 3)); }
console.log(ok ? '✓ 黄蜂毒刺行为符合预期' : '✗ 探针失败');
await browser.close();
process.exit(ok ? 0 : 1);
