// ★BJ679 塔场景诊断:493 收集链定位（drawNpcGlow 调用/队列/onscreen/存活）
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5214', {});
await createGame(page, { size: 'small', settleMs: 1200 });
await godMode(page, true);
await clockSet(page, 0.5);
await freezeClock(page, { tod: 0.5 });
await pump(page, 20);

const spot = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, w = st.w, h = st.h;
  const seg = new Map();
  for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x++) {
    let y0 = -1, bestD = 0, bestY0 = -1;
    for (let y = 2; y < h - 40; y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] === 1) { if (y0 < 0) y0 = y; }
      else if (y0 >= 0) { if (y - y0 > bestD) { bestD = y - y0; bestY0 = y0; } y0 = -1; }
    }
    if (bestD >= 10) seg.set(x, { y0: bestY0, d: bestD });
  }
  const bottomOf = (x, y0, d) => {
    for (let y = y0 + 3; y < y0 + d + 12; y++) {
      const i = st.idx(x, y);
      if (st.w[i] !== 0 && st.liquid[i] === 0) return y;
    }
    return -1;
  };
  const xs = [...seg.keys()];
  for (const x of xs.sort((a, b) => seg.get(b).d - seg.get(a).d)) {
    const c = seg.get(x);
    if (!(seg.get(x - 1)?.d >= 10 && seg.get(x + 1)?.d >= 10)) continue;
    const bottom = bottomOf(x, c.y0, c.d);
    if (bottom > c.y0 + Math.floor(c.d * 0.6)) return { tx: x, tyBottom: bottom, tySurface: c.y0 };
  }
  return null;
});
console.log('spot', JSON.stringify(spot));

await page.evaluate(async (s) => {
  const g = window.__swGame;
  const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
  g.world.lunarEvent.shield = { solar: 100, vortex: 100, nebula: 100, stardust: 100 };
  const e = spawnVanillaEnemy(g, 493, (s.tx - 5) * 16, (s.tyBottom - 10) * 16);
  e.facing = -1;   // BJ510:塔 spriteDirection 恒 -1（收集门 !mirror）
  window.__t = e;
  // 钉玩家
  const p = g.player;
  p.x = (s.tx + 0.5) * 16 - p.w / 2;
  p.y = s.tyBottom * 16 - p.h - 1;
  // 每帧记录塔状态
  window.__towerLog = [];
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  const od = proto.drawLiquids;
  proto.drawLiquids = function (...a) {
    if (a[5] === false) {
      const t = window.__t;
      const cam = window.__swGame.camera;
      const cv = window.__swGame.renderer.canvas;
      const sx = (t.cx - cam.x) * cam.zoom + cv.width / 2;
      const sy = (t.cy - cam.y) * cam.zoom + cv.height / 2;
      window.__towerLog.push({
        dead: t.dead, cx: Math.round(t.cx), cy: Math.round(t.cy),
        onscreen: sx > 0 && sx < cv.width && sy > 0 && sy < cv.height,
        visAngle: t.visAngle, facing: t.facing, spawnAlpha: t.spawnAlpha,
        towerQ: this.towerGlowQueue.length, whipQ: this.whipFullbrightQueue.length,
      });
      // 每拍钉回（模拟探针 pin）
      t.x = (s.tx - 5) * 16; t.y = (s.tyBottom - 10) * 16; t.vx = 0; t.vy = 0;
    }
    return od.apply(this, a);
  };
}, spot);
await pump(page, 30);
// 冻结塔 AI（towerAI 自主重定位到地表=离屏;fixedUpdate 实例遮蔽=渲染字段静止）
await page.evaluate((s) => {
  const t = window.__t;
  t.x = (s.tx - 5) * 16; t.y = (s.tyBottom - 10) * 16; t.vx = 0; t.vy = 0;
  t.fixedUpdate = () => {};
}, spot);
await page.evaluate(async () => {
  window.__f = 0;
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  if (!proto.__diagfp) { proto.__diagfp = true; const o = proto.render; proto.render = function (...a) { window.__f++; return o.apply(this, a); }; }
});
const f0 = await page.evaluate(() => window.__f);
await page.waitForFunction((n) => window.__f >= n, { timeout: 30000 }, f0 + 10);
const log = await page.evaluate(() => window.__towerLog.slice(-12));
console.log(JSON.stringify(log, null, 1));
console.log('errors:', errors.length, errors.slice(0, 3));
await browser.close();
