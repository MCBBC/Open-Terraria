// ★shim 队列取证:挂 GLShimExecutor.push/resolveTex,记录水晶帧的全部 rec
//   (tier/sx/sy/sw/sh/texKind/img)——验证 shine scratch rec 是否存在/纹理是否 stale。
// 运行: SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs --timeout=600000 scripts/_lifeheart-shim-trace.mjs
import { launchBrowser, openPage, bootstrap, pump, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', gen?.ok);

await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const HEART = tiles.TILE_BY_KEY['crystal_heart'];
  const SOLID = tiles.TILE_BY_KEY['stone'];
  const cx = 400, cy = 260;
  for (let y = cy - 5; y <= cy + 3; y++) for (let x = cx - 7; x <= cx + 6; x++) {
    const i = st.idx(x, y);
    if (st.flags[i]) st.setTileSilent(x, y, 0, 0, 0);
    st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = cx - 7; x <= cx + 6; x++) { st.setTileSilent(x, cy + 2, SOLID, 1, 1); st.setTileSilent(x, cy + 3, SOLID, 1, 1); }
  st.setTileSilent(cx - 1, cy - 1, HEART, 0, 0);
  st.setTileSilent(cx, cy - 1, HEART, 18, 0);
  st.setTileSilent(cx - 1, cy, HEART, 0, 18);
  st.setTileSilent(cx, cy, HEART, 18, 18);
  g.player.x = (cx + 3) * 16; g.player.y = (cy + 2) * 16 - 42;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = cx * 16; g.camera.y = cy * 16;
  if (!window.__camFollowOrig) {
    window.__camFollowOrig = Object.getPrototypeOf(g.camera).follow;
    Object.getPrototypeOf(g.camera).follow = function () {};
  }
  g.lighting.dirty = true;
  window.__spot = { cx, cy };
});
await page.evaluate(() => { window.__swGame.running = false; });
for (let i = 0; i < 30; i++) await pump(page, 1);

const trace = await page.evaluate(async () => {
  const mod = await import('/src/render/glshim/GLShimExecutor.ts');
  const E = mod.GLShimExecutor;
  const recs = [];
  if (!E.prototype.__pushPatched) {
    E.prototype.__pushPatched = true;
    const origPush = E.prototype.push;
    E.prototype.push = function (tier, _e, solid, img, sx, sy, sw, sh, dx, dy, dw, dh, rot, alpha, fr, fg, fb, flipX, flipY, smooth, dynamic, pair, preTex) {
      let srcDesc = 'null';
      try {
        srcDesc = img instanceof HTMLCanvasElement ? `cv(${img.width}x${img.height})`
          : img instanceof ImageBitmap ? `bmp(${img.width}x${img.height})`
          : img instanceof HTMLImageElement ? `img@${(img.src || '').split('/').pop()}` : String(img);
      } catch { srcDesc = '?'; }
      recs.push({ tier, solid, src: srcDesc, sx, sy, sw, sh, dx: Math.round(dx), dy: Math.round(dy), dw: Math.round(dw), dh: Math.round(dh), dynamic });
      return origPush.call(this, tier, _e, solid, img, sx, sy, sw, sh, dx, dy, dw, dh, rot, alpha, fr, fg, fb, flipX, flipY, smooth, dynamic, pair, preTex);
    };
    const origResolve = E.prototype.resolveTex;
    E.prototype.resolveTex = function (glw, p) {
      const e = origResolve.call(this, glw, p);
      if (e && p.texKind === 'region' && p.sw === 40 && p.sh === 40) {
        recs.push({ resolve40: true, key: e.key, w: e.w, h: e.h });
      }
      return e;
    };
  }
  await import('/src/render/TileAnim.ts').then((m) => { m.tileAnim.tick = 48; });
  window.__swGame.frame((window.__vnow = (window.__vnow || performance.now()) + 16.6667));
  await import('/src/render/TileAnim.ts').then((m) => { m.tileAnim.tick = 54; });
  window.__swGame.frame((window.__vnow = (window.__vnow || performance.now()) + 16.6667));
  return recs;
});
console.log('recs:', trace.length);
const shine = trace.filter((r) => (r.sw === 40 && r.sh === 40) || r.resolve40);
console.log('shine-40x40:', JSON.stringify(shine, null, 1));
const heart = trace.filter((r) => r.src && r.src.includes('bmp(36x396)'));
console.log('heart cells:', JSON.stringify(heart));
console.log('DONE');
await browser.close();
