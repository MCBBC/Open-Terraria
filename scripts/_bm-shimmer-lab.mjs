// 血月×微光/水 坡面浸润——地表实验台 v2(pngjs 截图解码采样;2026-09-27)。
// 场景:玩家真实站位两侧砖砌双池——左池水(1)/右池微光(4),池底 slope1/2 台阶。
// 判据:
//  E1 血月夜同帧:水池 cell 红、微光 cell 淡紫、坡面浸润带随邻液类型(=vanilla 语义)
//  E2 血月 on/off census 热区分类(水池域/微光域/天空域)
//  E3 血月下 liqgl on/off census(回归定位面)
// 运行:SW_ORIGIN=http://localhost:5233 node tools/run-diag.mjs --timeout=1200000 scripts/_bm-shimmer-lab.mjs
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
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场景:玩家真实站位(groundLevel≠实际地表——上一版实验台建进地下黑区的教训) ----
const scene = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
  const ry = pty + 1, depth = 4;
  const pools = [
    { x0: ptx - 38, x1: ptx - 18, lt: 1 },   // 水(左)
    { x0: ptx + 18, x1: ptx + 38, lt: 4 },   // 微光(右)
  ];
  for (const p of pools) {
    for (let x = p.x0 - 2; x <= p.x1 + 2; x++) for (let y = ry - 6; y <= ry + depth + 2; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
    const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
    for (let x = p.x0 - 1; x <= p.x1 + 1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
    for (let y = ry; y <= ry + depth; y++) { st.setTile(p.x0 - 1, y, BRICK); st.setTile(p.x1 + 1, y, BRICK); }
    for (let x = p.x0; x <= p.x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, p.lt);
    // 池底坡面台阶(开放侧朝池内)——浸润带/坡面增强语义观察点
    st.setTile(p.x0, ry + depth - 1, 0); st.setLiquid(p.x0, ry + depth - 1, 0, 0);
    st.setSlope(p.x0, ry + depth, 1);
    st.setTile(p.x1, ry + depth - 1, 0); st.setLiquid(p.x1, ry + depth - 1, 0, 0);
    st.setSlope(p.x1, ry + depth, 2);
  }
  // 玩家移到两池之间上空,相机钉两池中间
  g.player.x = ptx * 16; g.player.y = (pty - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = ptx * 16; g.camera.y = (ry + 1) * 16;
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__liqglSet = (v) => window.__vlMod.liqglSetForTest(v);
  window.__geom = { ptx, pty, ry, depth, pools };
  window.__map = () => {
    const r = g.renderer;
    const cam = g.camera;
    const cnv = r.canvas;
    const rect = cnv.getBoundingClientRect();
    const dpr = cnv.width / (cnv.clientWidth || cnv.width);
    const z = cam.zoom;
    return {
      left: rect.left, top: rect.top, W: cnv.width, H: cnv.height, dpr, z,
      cam: [cam.x, cam.y],
      devOf: (tx, ty) => [
        Math.round((tx * 16 + 8 - cam.x) * z * dpr + cnv.width / 2),
        Math.round((ty * 16 + 10 - cam.y) * z * dpr + cnv.height / 2),
      ],
      tileOf: (bx, by) => {
        const wx = ((bx + 8) - cnv.width / 2) / (z * dpr) + cam.x;
        const wy = ((by + 8) - cnv.height / 2) / (z * dpr) + cam.y;
        return [Math.floor(wx / 16), Math.floor(wy / 16)];
      },
      state: () => ({ waterStyle: r.waterStyle, acc: r._accMode, bm: g.world.clock.bloodMoon, day: g.world.clock.isDay }),
    };
  };
  return { ptx, pty, ry, pools };
});
console.log('scene:', JSON.stringify(scene));

await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.9 });   // 夜(血月生效窗)
await page.evaluate(() => window.__drive(30));
await page.evaluate(() => { const g = window.__swGame; g.camera.x = window.__geom.ptx * 16; g.camera.y = (window.__geom.ry + 1) * 16; });
await page.evaluate(() => window.__drive(5));

// ---- PNG 截图与采样(Node 侧) ----
const CANVAS_RECT = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const rect = r.canvas.getBoundingClientRect();
  return { left: rect.left, top: rect.top, w: r.canvas.width, h: r.canvas.height };
});
async function shotPNG(path) {
  const buf = await page.screenshot({ clip: { x: CANVAS_RECT.left, y: CANVAS_RECT.top, width: CANVAS_RECT.w, height: CANVAS_RECT.h } });
  writeFileSync(path, buf);
  return PNG.sync.read(buf);
}
function sample(png, devX, devY) {
  const i = (devY * png.width + devX) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}
function censusPNG(a, b) {
  let n = 0, maxd = 0, sum = 0;
  const hot = new Map();
  const W = a.width;
  for (let i = 0; i < a.data.length; i += 4) {
    const dd = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (dd > 2) {
      n++; sum += dd; if (dd > maxd) maxd = dd;
      const bx = ((i >> 2) % W) >> 4, by = ((i >> 2) / W | 0) >> 4;
      hot.set(bx + ',' + by, (hot.get(bx + ',' + by) || 0) + 1);
    }
  }
  return { n, maxd, mean: n ? +(sum / n).toFixed(2) : 0, top: [...hot.entries()].sort((p, q) => q[1] - p[1]).slice(0, 14) };
}
const driveK = async (K) => {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
};

// ---- E1:血月夜同帧逐 cell 采样 ----
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
await driveK(130);
console.log('BM state:', JSON.stringify(await page.evaluate(() => window.__map().state())));
const pngBM = await shotPNG('/tmp/bm-lab-on.png');
const map = await page.evaluate(() => { const m = window.__map(); return { devOf: m.devOf, tileOf: m.tileOf, meta: { left: m.left, top: m.top, W: m.W, H: m.H, dpr: m.dpr, z: m.z, cam: m.cam } }; });
const G = await page.evaluate(() => window.__geom);
const pts = {
  waterBody: [G.pools[0].x0 + 6, G.ry + 1],
  shimmerBody: [G.pools[1].x0 + 6, G.ry + 1],
  waterSlopeTile: [G.pools[0].x0, G.ry + G.depth],       // slope1 台阶格(浸润带所在)
  shimmerSlopeTile: [G.pools[1].x0, G.ry + G.depth],
  waterSlopeNbr: [G.pools[0].x0, G.ry + G.depth - 1],    // 台阶开放侧上方(水面格)
  dryRef: [G.ptx, G.ry - 4],
  skyRef: [G.ptx, G.ry - 18],
};
const sBM = {};
for (const [k, [tx, ty]] of Object.entries(pts)) {
  const [dx, dy] = await page.evaluate(({ tx, ty }) => window.__map().devOf(tx, ty), { tx, ty });
  sBM[k] = { tile: [tx, ty], dev: [dx, dy], rgb: sample(pngBM, dx, dy) };
}
console.log('E1 BM 逐 cell:', JSON.stringify(sBM, null, 1));

// ---- E2:血月 on/off census ----
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = false; });
await driveK(130);
const pngNo = await shotPNG('/tmp/bm-lab-off.png');
const c1 = censusPNG(pngNo, pngBM);
const tileOfDev = (bx, by) => {
  const wx = ((bx + 8) - map.meta.W / 2) / (map.meta.z * map.meta.dpr) + map.meta.cam[0];
  const wy = ((by + 8) - map.meta.H / 2) / (map.meta.z * map.meta.dpr) + map.meta.cam[1];
  return [Math.floor(wx / 16), Math.floor(wy / 16)];
};
const hotTiles = c1.top.map(([k, v]) => {
  const [bx, by] = k.split(',').map(Number);
  const [tx, ty] = tileOfDev(bx * 16, by * 16);
  return `${tx},${ty}:${v}`;
});
console.log('E2 census:', JSON.stringify({ n: c1.n, maxd: c1.maxd, mean: c1.mean }));
console.log('E2 热区tile:', hotTiles.join('  '));
console.log('E2 参照: 水池x', G.pools[0].x0 + '-' + G.pools[0].x1, '微光池x', G.pools[1].x0 + '-' + G.pools[1].x1, 'ry=' + G.ry);

// ---- E3:血月下 liqgl A/B ----
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
await driveK(130);
await page.evaluate(() => { window.__liqglSet(false); });
await driveK(5);
const pngA = await shotPNG('/tmp/bm-lab-liqgl0.png');
const md5A = createHash('md5').update(pngA.data).digest('hex');
await page.evaluate(() => { window.__liqglSet(true); });
await driveK(5);
const pngB = await shotPNG('/tmp/bm-lab-liqgl1.png');
const md5B = createHash('md5').update(pngB.data).digest('hex');
const c2 = censusPNG(pngA, pngB);
const hotTiles2 = c2.top.map(([k, v]) => {
  const [bx, by] = k.split(',').map(Number);
  const [tx, ty] = tileOfDev(bx * 16, by * 16);
  return `${tx},${ty}:${v}`;
});
console.log('E3 census:', JSON.stringify({ n: c2.n, maxd: c2.maxd, mean: c2.mean }), `md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)}`);
console.log('E3 热区tile:', hotTiles2.join('  ') || '(zero)');

writeFileSync('/tmp/bm-lab.json', JSON.stringify({ scene, sBM, c1, hotTiles, c2, hotTiles2, map: map.meta }, null, 1));
console.log('== DONE ==');
process.exit(0);
