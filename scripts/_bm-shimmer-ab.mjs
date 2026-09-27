// 血月×微光湖底水洼——用户场景复刻 + 洁净 liqgl A/B(同 vnow 重放;ab 判例)。
// 场景:大微光池(底部中央嵌 5×2 水洼)+ 水池对照;血月夜。
// F1 水洼 cell 两臂皆红(vanilla 语义:血月染 Type0 水,与 liqgl 无关)
// F2 微光池体两臂皆淡紫(不变色)
// F3 同帧 A/B census(liqgl 回归判定:登记域 vs 超域)
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

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
  const ry = pty + 1, depth = 4;
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  // 大微光池:x ∈ [ptx-40, ptx+40]——底部中央嵌水洼
  const x0 = ptx - 40, x1 = ptx + 40;
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry - 6; y <= ry + depth + 2; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = x0 - 1; x <= x1 + 1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, BRICK); st.setTile(x1 + 1, y, BRICK); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  // 池底中央嵌 5×2 水洼(类型1,世界数据甄别假设:用户湖底红洼=水)
  const wx0 = ptx - 2, wx1 = ptx + 2;
  for (let x = wx0; x <= wx1; x++) for (let y = ry + depth - 2; y < ry + depth; y++) st.setLiquid(x, y, 255, 1);
  // 池底两端 slope 台阶
  st.setTile(x0, ry + depth - 1, 0); st.setLiquid(x0, ry + depth - 1, 0, 0);
  st.setSlope(x0, ry + depth, 1);
  st.setTile(x1, ry + depth - 1, 0); st.setLiquid(x1, ry + depth - 1, 0, 0);
  st.setSlope(x1, ry + depth, 2);
  // 对照水池(左,与微光池隔 4 格)
  const px0 = x0 - 26, px1 = x0 - 6;
  for (let x = px0 - 2; x <= px1 + 2; x++) for (let y = ry - 6; y <= ry + depth + 2; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = px0 - 1; x <= px1 + 1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(px0 - 1, y, BRICK); st.setTile(px1 + 1, y, BRICK); }
  for (let x = px0; x <= px1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 1);
  g.player.x = ptx * 16; g.player.y = (pty - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__liqglSet = (v) => window.__vlMod.liqglSetForTest(v);
  window.__camPin = () => { g.camera.x = ptx * 16; g.camera.y = (ry + 1) * 16; };
  window.__geom = { ptx, pty, ry, depth, x0, x1, wx0, wx1, px0, px1 };
  window.__state = () => {
    const r = g.renderer;
    return { waterStyle: r.waterStyle, bm: g.world.clock.bloodMoon, day: g.world.clock.isDay, acc: r._accMode };
  };
  window.__devOf = (tx, ty) => {
    const r = g.renderer;
    const cam = g.camera;
    const cnv = r.canvas;
    return [Math.round((tx * 16 + 8 - cam.x) * cam.zoom + cnv.width / 2), Math.round((ty * 16 + 10 - cam.y) * cam.zoom + cnv.height / 2)];
  };
  window.__cam = () => { const c = g.camera; const r = g.renderer; return [c.x, c.y, c.zoom, r.canvas.width, r.canvas.height]; };
});
console.log('scene built');

await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
// ★波场冻结(ab 判例):dt=0 注入——双臂间真实时间差推进 progress=对拍伪差
await page.evaluate(() => {
  const ww = window.__wwMod.waterWaves;
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});
await freezeClock(page, { tod: 0.9 });
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = true; });
await page.evaluate(() => window.__drive(30));
await page.evaluate(() => window.__camPin());
await page.evaluate(() => window.__drive(130));
await page.evaluate(() => window.__camPin());
await page.evaluate(() => window.__drive(5));
console.log('state:', JSON.stringify(await page.evaluate(() => window.__state())));

async function shotPNG(_path) {
  // 画布直读(无 DOM UI——page.screenshot 含 DOM 动画=对拍污染,lab3 教训)
  const fin = await page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { width: c.width, height: c.height, b64: btoa(bin) };
  });
  const data = new Uint8Array(Buffer.from(fin.b64, 'base64'));
  return { width: fin.width, height: fin.height, data };
}
const sample = (png, dx, dy) => {
  const x = Math.max(0, Math.min(png.width - 1, dx)), y = Math.max(0, Math.min(png.height - 1, dy));
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};

const G = await page.evaluate(() => window.__geom);
const pts = {
  pocketWater: [G.ptx, G.ry + G.depth - 1],        // 湖底中央水洼
  pocketWater2: [G.ptx - 2, G.ry + G.depth - 2],
  shimmerAbovePocket: [G.ptx, G.ry + 1],           // 洼上方微光池体
  shimmerLeft: [G.ptx - 20, G.ry + 1],             // 微光池体
  shimmerNearPocket: [G.ptx - 4, G.ry + G.depth - 1], // 水洼旁微光(底行)
  ctrlWater: [G.px0 + 5, G.ry + 1],                // 对照水池
  slopeL: [G.x0, G.ry + G.depth],                  // 微光池底 slope1 台阶
};
const devs = {};
for (const [k, [tx, ty]] of Object.entries(pts)) devs[k] = await page.evaluate(({ tx, ty }) => window.__devOf(tx, ty), { tx, ty });

// ---- 洁净 A/B:同 vnow 重放 ×3(ab 判例) ----
async function snapArm(on, v0) {
  await page.evaluate(({ on, v0 }) => { window.__liqglSet(on); window.__vnow = v0; for (let i = 0; i < 3; i++) window.__drive(1); }, { on, v0 });
  return shotPNG();
}
const pairs = [];
for (let k = 0; k < 3; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  const A = await snapArm(false, v0);
  const md5A = createHash('md5').update(A.data).digest('hex');
  const B = await snapArm(true, v0);
  const md5B = createHash('md5').update(B.data).digest('hex');
  let n = 0, maxd = 0, sum = 0;
  const hot = new Map();
  for (let i = 0; i < A.data.length; i += 4) {
    const dd = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (dd > 2) {
      n++; sum += dd; if (dd > maxd) maxd = dd;
      const bx = ((i >> 2) % A.width) >> 4, by = ((i >> 2) / A.width | 0) >> 4;
      hot.set(bx + ',' + by, (hot.get(bx + ',' + by) || 0) + 1);
    }
  }
  pairs.push({ k, n, maxd, mean: n ? +(sum / n).toFixed(2) : 0, md5A, md5B, A, B });
  console.log(`[pair ${k}] n=${n} maxd=${maxd} mean=${pairs[k].mean} A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)}`);
  if (k === 0) {
    writeFileSync('/tmp/bm5-A.rgba', Buffer.from(A.data));
    writeFileSync('/tmp/bm5-B.rgba', Buffer.from(B.data));
    const cam = await page.evaluate(() => window.__cam());
    const tileOf = (bx, by) => [Math.floor((((bx * 16 + 8) - cam[3] / 2) / cam[2] + cam[0]) / 16), Math.floor((((by * 16 + 8) - cam[4] / 2) / cam[2] + cam[1]) / 16)];
    const hotT = [...hot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([kk, v]) => { const [bx, by] = kk.split(',').map(Number); const [tx, ty] = tileOf(bx, by); return `${tx},${ty}:${v}`; });
    console.log('hot tiles:', hotT.join('  ') || '(zero)');
  }
}
// ---- 逐 cell 采样(A 臂与 B 臂) ----
const pngA = pairs[0].A, pngB = pairs[0].B;
for (const [k] of Object.entries(pts)) {
  console.log(`BM夜 ${k}: OFF=${JSON.stringify(sample(pngA, devs[k][0], devs[k][1]))}  ON=${JSON.stringify(sample(pngB, devs[k][0], devs[k][1]))}`);
}

// ---- 对照臂2:夜间无血月(水=蓝) A/B ----
await page.evaluate(() => { window.__swGame.world.clock.bloodMoon = false; });
await page.evaluate(() => window.__drive(130));
async function pairRun(tag) {
  const v0 = await page.evaluate(() => window.__vnow);
  const A = await snapArm(false, v0);
  const B = await snapArm(true, v0);
  let n = 0, maxd = 0;
  for (let i = 0; i < A.data.length; i += 4) {
    const dd = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
    if (dd > 2) { n++; if (dd > maxd) maxd = dd; }
  }
  console.log(`[${tag}] census n=${n} maxd=${maxd}`);
  for (const [k] of Object.entries(pts)) {
    console.log(`${tag} ${k}: OFF=${JSON.stringify(sample(A, devs[k][0], devs[k][1]))}  ON=${JSON.stringify(sample(B, devs[k][0], devs[k][1]))}`);
  }
}
await pairRun('夜无血月');
// ---- 对照臂3:正午(无血月) A/B ----
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__drive(40));
await page.evaluate(() => window.__camPin());
await page.evaluate(() => window.__drive(5));
await pairRun('正午');
console.log('== DONE ==');
process.exit(0);
