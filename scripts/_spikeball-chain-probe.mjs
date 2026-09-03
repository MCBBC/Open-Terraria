// 刺球 70 锚链渲染探针（Main.cs:23087-23113 移植验证）：
// ① ai[1]/ai[2] 锚点为【像素】（出生中心 = 下移 h/2+8 后的中心）
// ② 数值验证球-锚距离随摆荡变化 + 截图目检 Chain 链段 + Spike_Base 锚座
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 1500));
  const g = window.__swGame;
  const st = g.world.store;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const tiles = await import('/src/data/tiles.ts');
  const dirt = tiles.TILE_BY_KEY['dirt'];
  const res = {};

  // 场地：地表出生点右侧清空一块平地（球 noTileCollide 悬空无所谓，仅防遮挡）
  const Y = Math.floor(g.world.groundLevel) + 2;
  const X0 = g.world.spawnX;
  for (let dx = -20; dx <= 40; dx++) {
    for (let dy = -16; dy <= -1; dy++) {
      if (st.inBounds(X0 + dx, Y + dy) && st.get(X0 + dx, Y + dy) !== 0) st.setTile(X0 + dx, Y + dy, 0, 0, 0);
    }
  }
  for (let dx = -20; dx <= 40; dx++) st.setTile(X0 + dx, Y, dirt, 0, 0);
  const p = g.player;
  p.x = (X0 + 8) * 16; p.y = Y * 16 - p.h; p.vx = 0; p.vy = 0;

  // 球悬空出生（玩家头顶左侧 150px,高 120px）——锚点应 = 出生中心（下移 25px 后）
  const sx = p.cx - 150 - 17, sy = p.y - 120;
  const ball = Enemy.fromVanilla(70, sx, sy);
  ball.id = g.entities.nextId++;
  g.entities.add(ball, 'enemies');
  ball.hp = ball.maxHp;
  await new Promise((r) => setTimeout(r, 600));
  // fromVanilla 把 (sx,sy) 当【盒中心】（e.x = x − w/2, e.y = y − h/2）→ 盒 51×51
  // 实际顶 = (sx−25.5, sy−25.5)；锚 = AI 帧首 +h/2+8(=33.5) 下移后的中心 = (sx, sy+33.5)
  res.anchor = { ai1: +ball.ai1.toFixed(1), ai2: +ball.ai2.toFixed(1), expectX: +sx.toFixed(1), expectY: +(sy + 33.5).toFixed(1) };
  // 容差 12px：钉住 +h/2+8 偏移回归（丢偏移=差 33.5>12 必炸;格单位回归差 15 倍必炸）
  res.anchor.unitOk = Math.abs(ball.ai1 - sx) < 12 && Math.abs(ball.ai2 - (sy + 33.5)) < 12;
  const dist = (e) => Math.hypot(e.ai1 - e.cx, e.ai2 - e.cy).toFixed(0);
  res.dists = [];
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 500));
    res.dists.push(+dist(ball));
  }
  res.ballAtShot = { cx: +ball.cx.toFixed(0), cy: +ball.cy.toFixed(0), visAngle: +ball.visAngle.toFixed(2), dist: +dist(ball) };
  res.stillAlive = !ball.dead && g.entities.enemies.includes(ball);
  return res;
});
console.log(JSON.stringify(out, null, 1));
if (errs.length) console.log('PAGEERR:', errs.slice(0, 5).join(' | '));

// 截图（球在屏内玩家左上）——先关欢迎弹窗
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => /我已知晓/.test(b.textContent ?? ''));
  if (btn) btn.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/spikeball-chain.png' });
await browser.close();
