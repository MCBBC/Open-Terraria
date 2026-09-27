// 定谳补充:前景微光 pass 是否走【原生 2D fgCtx】（beginFgPass 返回 raw ctx）——
// 对 beginFgPass 返回值包计数代理,统计单帧内 fgCtx.drawImage/fillRect 次数,
// 与 shim stats（bg pass 的 quad 数）对照。
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', gen?.ok);
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel);
  const x0 = px - 40, x1 = px + 40, ry = gy + 2, depth = 5;
  for (let x = x0 - 8; x <= x1 + 8; x++) for (let y = ry - 10; y <= ry + depth + 8; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  for (let x = x0; x <= x1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, BRICK); st.setTile(x1 + 1, y, BRICK); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  g.player.x = (x1 + 6) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  let nliq = 0;
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) if (st.liquid[st.idx(x, y)] > 0) nliq++;
  window.__poolInfo = { nliq, x0, x1, ry, depth, px: g.player.x, py: g.player.y };

  window.__fgProbe = () => {
    const r = g.renderer;
    if (r.__fgWrapped) return;
    const WW = window.__wwcMod;
    const proto = Object.getPrototypeOf(r.waterWarp);
    const origBegin = proto.beginFgPass;
    window.__fgCounts = { drawImage: 0, fillRect: 0, setTransform: 0, other: 0 };
    proto.beginFgPass = function (srcCtx) {
      const c = origBegin.call(this, srcCtx);
      if (!c) return c;
      if (!this.__countProxy) {
        this.__countProxy = new Proxy(c, {
          get(t, p) {
            if (p === 'drawImage') return (...a) => { window.__fgCounts.drawImage++; return t.drawImage(...a); };
            if (p === 'fillRect') return (...a) => { window.__fgCounts.fillRect++; return t.fillRect(...a); };
            if (p === 'setTransform') return (...a) => { window.__fgCounts.setTransform++; return t.setTransform(...a); };
            const v = Reflect.get(t, p, t);
            return typeof v === 'function' ? v.bind(t) : v;
          },
          set(t, p, v) { t[p] = v; return true; },
        });
      }
      return this.__countProxy;
    };
    r.__fgWrapped = true;
  };
  window.__drive = (n) => {
    window.__vnow = (window.__vnow ?? performance.now());
    for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
    return window.__vnow;
  };
});
await page.evaluate(() => import('/src/render/WaterWarpCompositor.ts').then((m) => { window.__wwcMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { window.__fgProbe(); });
await page.evaluate(() => { const cam = window.__swGame.camera; const g = window.__swGame; cam.x = g.player.x; cam.y = g.player.y; });
await page.evaluate(() => window.__drive(10));
console.log('pool:', JSON.stringify(await page.evaluate(() => ({ ...window.__poolInfo, camX: window.__swGame.camera.x, camY: window.__swGame.camera.y, inv: window.__swGame.renderer._waveLiquidInView }))));
const counts = await page.evaluate(() => {
  const c = window.__fgCounts;
  return { ...c };
});
const shim = await page.evaluate(() => window.__swGame.renderer.bglShimStats());
console.log('fgCtx 单帧调用计数:', JSON.stringify(counts));
console.log('shim stats(累计):', JSON.stringify(shim?.stats ?? null));
await page.evaluate(() => { window.__fgCounts.drawImage = 0; window.__fgCounts.fillRect = 0; });
await page.evaluate(() => window.__drive(1));
const counts1 = await page.evaluate(() => ({ ...window.__fgCounts }));
console.log('fgCtx 单帧(delta):', JSON.stringify(counts1));
process.exit(0);
