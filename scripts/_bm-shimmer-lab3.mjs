// 血月×微光 实验台 v3:场景验真(store 读回)+正午可见性+夜间 BM 双臂
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5233';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await godMode(page, true);

const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
  const ry = pty + 1, depth = 4;
  const pools = [
    { x0: ptx - 38, x1: ptx - 18, lt: 1 },
    { x0: ptx + 18, x1: ptx + 38, lt: 4 },
  ];
  for (const p of pools) {
    for (let x = p.x0 - 2; x <= p.x1 + 2; x++) for (let y = ry - 6; y <= ry + depth + 2; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
    const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
    for (let x = p.x0 - 1; x <= p.x1 + 1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
    for (let y = ry; y <= ry + depth; y++) { st.setTile(p.x0 - 1, y, BRICK); st.setTile(p.x1 + 1, y, BRICK); }
    for (let x = p.x0; x <= p.x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, p.lt);
    st.setTile(p.x0, ry + depth - 1, 0); st.setLiquid(p.x0, ry + depth - 1, 0, 0);
    st.setSlope(p.x0, ry + depth, 1);
    st.setTile(p.x1, ry + depth - 1, 0); st.setLiquid(p.x1, ry + depth - 1, 0, 0);
    st.setSlope(p.x1, ry + depth, 2);
  }
  // 验真:读回池心格
  const verify = pools.map((p) => {
    const i = st.idx(p.x0 + 6, ry + 1);
    return { lt: p.lt, liquid: st.liquid[i], lty: st.liquidType[i], tile: st.type[i] };
  });
  g.player.x = ptx * 16; g.player.y = (pty - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__liqglSet = (v) => window.__vlMod.liqglSetForTest(v);
  window.__camPin = () => { g.camera.x = ptx * 16; g.camera.y = (ry + 1) * 16; };
  window.__geom = { ptx, pty, ry, depth, pools };
  window.__state = () => {
    const r = g.renderer;
    return { waterStyle: r.waterStyle, bm: g.world.clock.bloodMoon, day: g.world.clock.isDay, tod: g.world.clock.timeOfDay };
  };
  window.__devOf = (tx, ty) => {
    const r = g.renderer;
    const cam = g.camera;
    const cnv = r.canvas;
    return [
      Math.round((tx * 16 + 8 - cam.x) * cam.zoom + cnv.width / 2),
      Math.round((ty * 16 + 10 - cam.y) * cam.zoom + cnv.height / 2),
    ];
  };
  window.__cam = () => { const c = g.camera; const r = g.renderer; return [c.x, c.y, c.zoom, r.canvas.width, r.canvas.height]; };
  return { ptx, pty, ry, verify };
});
console.log('scene:', JSON.stringify(scene));

await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });

async function shotPNG(path) {
  const buf = await page.screenshot();
  writeFileSync(path, buf);
  return PNG.sync.read(buf);
}
const sample = (png, dx, dy) => {
  const x = Math.max(0, Math.min(png.width - 1, dx)), y = Math.max(0, Math.min(png.height - 1, dy));
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};
const driveK = async (K) => {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
};
const ptsOf = async () => {
  const G = await page.evaluate(() => window.__geom);
  const out = {};
  for (const [k, [tx, ty]] of Object.entries({
    waterBody: [G.pools[0].x0 + 6, G.ry + 1],
    shimmerBody: [G.pools[1].x0 + 6, G.ry + 1],
    waterSlope: [G.pools[0].x0, G.ry + G.depth],
    shimmerSlope: [G.pools[1].x0, G.ry + G.depth],
    dryRef: [G.ptx, G.ry - 3],
  })) out[k] = { tile: [tx, ty], dev: await page.evaluate(({ tx, ty }) => window.__devOf(tx, ty), { tx, ty }) };
  return out;
};

// --- 正午可见性 ---
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__drive(30));
await page.evaluate(() => window.__camPin());
await page.evaluate(() => window.__drive(5));
console.log('noon state:', JSON.stringify(await page.evaluate(() => window.__state())));
const pngNoon = await shotPNG('/tmp/bm3-noon.png');
let pts = await ptsOf();
const sNoon = {};
for (const [k, p] of Object.entries(pts)) sNoon[k] = sample(pngNoon, p.dev[0], p.dev[1]);
console.log('noon samples:', JSON.stringify(sNoon));

// --- 夜间 BM on ---
await freezeClock(page, { tod: 0.9 });
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
await driveK(130);
await page.evaluate(() => window.__camPin());
await driveK(5);
console.log('bm state:', JSON.stringify(await page.evaluate(() => window.__state())));
const pngBM = await shotPNG('/tmp/bm3-bm.png');
pts = await ptsOf();
const sBM = {};
for (const [k, p] of Object.entries(pts)) sBM[k] = sample(pngBM, p.dev[0], p.dev[1]);
console.log('bm samples:', JSON.stringify(sBM));

// --- 夜间 noBM ---
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = false; });
await driveK(130);
await page.evaluate(() => window.__camPin());
await driveK(5);
const pngNo = await shotPNG('/tmp/bm3-nobm.png');
const sNo = {};
for (const [k, p] of Object.entries(pts)) sNo[k] = sample(pngNo, p.dev[0], p.dev[1]);
console.log('nobm samples:', JSON.stringify(sNo));

// --- 血月下 liqgl A/B ---
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
await driveK(130);
await page.evaluate(() => { window.__liqglSet(false); });
await driveK(5);
await page.evaluate(() => window.__camPin());
await driveK(2);
const pngA = await shotPNG('/tmp/bm3-liqgl0.png');
const md5A = createHash('md5').update(pngA.data).digest('hex');
await page.evaluate(() => { window.__liqglSet(true); });
await driveK(5);
await page.evaluate(() => window.__camPin());
await driveK(2);
const pngB = await shotPNG('/tmp/bm3-liqgl1.png');
const md5B = createHash('md5').update(pngB.data).digest('hex');
let n = 0, maxd = 0;
const hot = new Map();
for (let i = 0; i < pngA.data.length; i += 4) {
  const dd = Math.max(Math.abs(pngA.data[i] - pngB.data[i]), Math.abs(pngA.data[i + 1] - pngB.data[i + 1]), Math.abs(pngA.data[i + 2] - pngB.data[i + 2]));
  if (dd > 2) {
    n++; if (dd > maxd) maxd = dd;
    const bx = ((i >> 2) % pngA.width) >> 4, by = ((i >> 2) / pngA.width | 0) >> 4;
    hot.set(bx + ',' + by, (hot.get(bx + ',' + by) || 0) + 1);
  }
}
const cam = await page.evaluate(() => window.__cam());
const tileOf = (bx, by) => [Math.floor((((bx * 16 + 8) - cam[3] / 2) / cam[2] + cam[0]) / 16), Math.floor((((by * 16 + 8) - cam[4] / 2) / cam[2] + cam[1]) / 16)];
const hotT = [...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .map(([k, v]) => { const [bx, by] = k.split(',').map(Number); const [tx, ty] = tileOf(bx, by); return `${tx},${ty}:${v}`; });
console.log(`liqgl A/B census: n=${n} maxd=${maxd} md5A=${md5A.slice(0, 8)} md5B=${md5B.slice(0, 8)}`);
console.log('hot tiles:', hotT.join('  ') || '(zero)');
console.log('== DONE ==');
process.exit(0);
