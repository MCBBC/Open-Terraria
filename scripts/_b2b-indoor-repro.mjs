// ★B2b 用户实报复现探针:角色合成到背景墙后面（室内场景=背景墙在角色身后）。
// 构造:玩家脚下铺地板 tile+身后满铺背景墙(木墙)+两侧墙,逐 tick A(2D)/B(acc) 配对。
// 判据:玩家矩形 census（若 B 臂玩家被墙盖=玩家矩形内出现墙色 diff,bbox=玩家形状）;
//       附:全帧 census + bglPathStats/降级账。
// 运行:SW_ORIGIN=http://localhost:5212 node tools/run-diag.mjs --timeout=600000 scripts/_b2b-indoor-repro.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 2).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
await bootstrap(page, ORIGIN + '/?bgl=1&cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
console.log('createGame', !!gen?.ok);

await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__armSet = (bgl) => r.constructor.bglSetForTest(bgl);
  window.__accState = () => ({ path: r.bglPathUsed, stats: r.bglPathStats, creations: r.b2bWorldCanvasCreations });
  // 室内构造:玩家站位脚下 tile(1 土→用石块 1? tile type 1=dirt) + 背后 wall(木墙 id 21? 用 1=stone wall→用 26 wood fence?) — 用 wall id 1(石墙)+tile type 1
  window.__buildIndoor = () => {
    const st = g.world.store;
    const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
    for (let y = py - 6; y <= py + 2; y++) {
      for (let x = px - 6; x <= px + 6; x++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        if (y >= py && y <= py + 1) { st.type[i] = 1; st.flags[i] = 1; }   // 地板两层实心
        else st.type[i] = 0, st.flags[i] = 0;
        st.wall[i] = (y < py) ? 1 : st.wall[i];   // 背景墙（头顶+身侧）
        st.liquid[i] = 0;
      }
    }
    g.chunks?.invalidateAll?.();
    return { px, py };
  };
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
  window.__pause = (v) => { g.paused = v; };
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; m.options.data.swayInWind = false; }));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await pump(page, 60);
await page.evaluate(() => window.__pause(true));
const pos = await page.evaluate(() => window.__buildIndoor());
console.log('indoor built at', JSON.stringify(pos));

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
async function snapFull() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin });
}

await waitFrame(8);
for (let k = 0; k < 2; k++) {
  await page.evaluate((n) => window.__setTick(500 + n), k);
  await page.evaluate(() => window.__armSet(false));   // A=2D
  await waitFrame(4);
  const A = await snapFull();
  await page.evaluate(() => window.__armSet(true));    // B=acc
  await waitFrame(5);
  const B = await snapFull();
  const eq = A.b64 === B.b64;
  const c = eq ? null : await census(A, B);
  const st = await page.evaluate(() => window.__accState());
  console.log(`tick${k} ${eq ? 'BYTE-EQ' : `census n=${c.n}(${(c.n * 100 / (A.w * A.h)).toFixed(3)}%) maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}`}  path=${st.path} degraded=${Object.keys(st.stats).filter((x) => x.includes('degraded')).map((x) => x + '=' + st.stats[x]).join(',') || 'none'}`);
  if (!eq && c.n > 0) {
    // 差异像素取色（A/B RGBA 对=定层）
    const samples = await page.evaluate(({ a, b }) => {
      const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
      const P = dec(a.b64), Q = dec(b.b64);
      const W = a.w;
      const out = [];
      let shown = 0;
      for (let i = 0; i < P.length && shown < 4; i += 4) {
        const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
        if (dd > 0) {
          const px = (i >> 2) % W, py = (i >> 2) / W | 0;
          out.push({ px, py, A: [P[i], P[i + 1], P[i + 2], P[i + 3]], B: [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]] });
          shown++;
        }
      }
      return out;
    }, { a: A, b: B });
    console.log('  diff samples:', JSON.stringify(samples));
    console.log('  player screen rect:', await page.evaluate(() => {
      const g = window.__swGame, cam = g.camera, z = cam.zoom;
      const p = g.player;
      const [sx, sy] = cam.worldToScreen(p.x, p.y);
      return { x: Math.round(sx), y: Math.round(sy), w: Math.round(p.w * z), h: Math.round(p.h * z) };
    }));
  }
}
if (errs.length) { console.log('ERRORS:'); for (const e of errs.slice(0, 10)) console.log(' ', e); }
await browser.close();
