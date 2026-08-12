// 食人怪头部旋转探针（scripts/_maneater-rotate-probe.mjs）
// 锚点附近生成 43，玩家分别在锚点右上/左下，断言 visAngle 差 ~π 且 facing 翻转；
// 截图确认渲染（茎蔓+旋转头）不炸。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
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
  await page.keyboard.type('食人怪探针');
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
  throw e;
}
await new Promise(r => setTimeout(r, 1500));

const res = await page.evaluate(async () => {
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  // 锚点:地表下挖一格放土块,头顶空旷
  const ax = g.world.spawnX + 10, ay = g.world.spawnY;
  for (let dx = -8; dx <= 12; dx++) for (let dy = -8; dy <= 2; dy++) st.setTileSilent(ax + dx, ay + dy, 0);
  st.setTileSilent(ax, ay, 2); // 锚点格(实心)——清空后再放,否则被清掉 → 锚失效
  const e = Enemy.fromVanilla(43, ax * 16 + 8, (ay - 2) * 16);
  e.ai0 = ax; e.ai1 = ay;
  g.entities.add(e, 'enemies');
  const observe = (px, py) => {
    p.x = px * 16; p.y = py * 16; p.vx = 0; p.vy = 0;
    for (let t = 0; t < 30; t++) e.fixedUpdate(1, g);
    const axPx = ax * 16 + 8, ayPx = ay * 16 + 8;
    const ox = p.cx - e.w / 2 - axPx, oy = p.cy - e.h / 2 - ayPx;
    const expect = Math.atan2(oy, ox) + (ox < 0 ? Math.PI : 0);
    return { visAngle: e.visAngle, facing: e.facing, expect, x: Math.round(e.x), y: Math.round(e.y) };
  };
  const upRight = observe(ax + 6, ay - 4);
  const downLeft = observe(ax - 6, ay + 4);
  return { upRight, downLeft };
});
console.log(JSON.stringify(res, null, 2));
await page.screenshot({ path: '/tmp/maneater-rotate.png' });

let ok = true;
for (const [name, side] of [['upRight', res.upRight], ['downLeft', res.downLeft]]) {
  const diff = Math.abs(side.visAngle - side.expect);
  if (diff > 0.01) { ok = false; console.log(`✗ ${name} visAngle 偏离期望角 ${diff.toFixed(4)}rad`); }
  else console.log(`✓ ${name} visAngle = atan2(朝玩家)${side.facing < 0 ? '+π' : ''} (${side.visAngle.toFixed(3)}rad)`);
}
if (res.upRight.facing !== 1 || res.downLeft.facing !== -1) { ok = false; console.log('✗ facing 未随目标侧翻转'); }
else console.log('✓ facing: 右上→1 / 左下→-1');
if (errs.length) { ok = false; console.log('✗ 页面错误:', errs.slice(0, 3)); }
console.log(ok ? '✓ 食人怪头部旋转生效' : '✗ 探针失败');
await browser.close();
process.exit(ok ? 0 : 1);
