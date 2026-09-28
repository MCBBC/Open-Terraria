// ★liqgl 水色差·修后残差归因(2026-09-28):预乘刀后 census n=678(mean 1.58)非零——
//  判别残差层级:①warp on(默认):ON 臂 gate=liqgate FBO 重发射 vs OFF 臂 gate=fgCanvas
//  ——门控面差异 → 位移场亚像素差 → 边缘结构差(maxd 高,集中在 16px 界);
//  ②warp off(quality=0):双臂同走 else 直画支,无 gate/离屏——若 census=0 则
//  texel/混合面完全闭合,残差归 liqgl 门控面(先在登记域,非本刀新增)。
// 运行:SW_ORIGIN=http://localhost:5240 node tools/run-diag.mjs scripts/_slope-water-resid.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
await page.goto(ORIGIN + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
{ const t0 = Date.now(); let ok = false;
  while (Date.now() - t0 < 180000) {
    ok = await page.evaluate(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld).catch(() => false);
    if (ok) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
await godMode(page, true);
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const JG = window.__swTiles?.['v_60_jungle_grass_block'] ?? 0;
  const PX = Math.floor(g.player.cx / 16);
  const G = Math.floor(g.player.y / 16) + 3, XE = PX + 24, X0 = XE - 26;
  for (let x = X0 - 6; x <= XE + 10; x++) for (let y = G - 12; y <= G + 8; y++) {
    st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); st.setHalfBrick(x, y, false); st.setSlope(x, y, 0);
  }
  for (let x = XE; x <= XE + 8; x++) for (let y = G; y <= G + 6; y++) st.setTile(x, y, JG);
  st.setTile(XE, G, JG); st.setSlope(XE, G, 2);
  st.setTile(XE - 1, G + 1, JG); st.setSlope(XE - 1, G + 1, 2);
  st.setTile(XE - 3, G + 2, JG); st.setSlope(XE - 3, G + 2, 2);
  st.setTile(XE - 4, G + 3, JG); st.setSlope(XE - 4, G + 3, 2);
  st.setTile(XE - 1, G + 2, JG); st.setTile(XE - 1, G + 3, JG);
  st.setTile(XE - 2, G + 3, JG); st.setTile(XE - 2, G + 4, JG); st.setTile(XE - 1, G + 4, JG);
  st.setTile(XE - 3, G + 4, JG); st.setTile(XE - 2, G + 5, JG); st.setTile(XE - 3, G + 5, JG);
  for (let x = X0; x <= XE - 1; x++) {
    for (let y = G + 1; y <= G + 4; y++) if (!st.flags[st.idx(x, y)]) st.setLiquid(x, y, 255, 1);
    st.setLiquid(x, G, 60, 1);
  }
  st.setTile(X0 + 8, G + 4, JG); st.setHalfBrick(X0 + 8, G + 4, true);
  for (let x = X0; x <= XE - 5; x++) st.setTile(x, G + 5, JG);
  g.player.x = (X0 + 12) * 16; g.player.y = (G + 1) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = (G + 2) * 16;
  window.__scene = { G, X0, XE };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vl = m; }));
await page.evaluate(() => import('/src/core/GameTime.ts').then((m) => { window.__gt = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => {
  const ww = window.__wwMod.waterWaves;
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});
await page.evaluate(() => window.__drive(20));
await page.evaluate(() => { window.__gt.pinGameTimeTicks(12345); window.__swGame.paused = true; });
await page.evaluate(() => window.__drive(3));

const snap = () => page.evaluate(() => {
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

const census = (a, b) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const P = dec(a.b64), Q = dec(b.b64), W = a.w;
  let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  let edge = 0, interior = 0;
  const spots = [];
  for (let i = 0; i < P.length; i += 4) {
    const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
    if (dd > 0) {
      n++; sum += dd; if (dd > maxd) maxd = dd;
      const px = (i >> 2) % W, py = (i >> 2) / W | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
      // 16px tile 界分类(设备 zoom=1 假定;以世界格 16px 网格相位判)
      if (px % 16 === 0 || px % 16 === 15 || py % 16 === 0 || py % 16 === 15) edge++; else interior++;
      if (spots.length < 6 && dd >= maxd * 0.8) spots.push([px, py, dd,
        [P[i], P[i + 1], P[i + 2]], [Q[i], Q[i + 1], Q[i + 2]]]);
    }
  }
  return { n, maxd, mean: n ? +(sum / n).toFixed(2) : 0, bbox: n ? [x0, y0, x1, y1] : null, edge, interior, spots };
};

// ---- 相位 A:warp on(默认 quality)——5 对 ----
const pairsOn = [];
for (let k = 0; k < 5; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  const a = await page.evaluate(({ v0 }) => {
    window.__vl.liqglSetForTest(true);
    window.__vnow = v0;
    window.__drive(1);
    return v0;
  }, { v0 });
  const fa = await snap();
  await page.evaluate(({ v0 }) => {
    window.__vl.liqglSetForTest(false);
    window.__vnow = v0;
    window.__drive(1);
  }, { v0: a });
  const fb = await snap();
  pairsOn.push([fa, fb]);
}
console.log('A: warp on census:');
for (const [a, b] of pairsOn) {
  const c = census(a, b);
  console.log('  ' + JSON.stringify({ n: c.n, maxd: c.maxd, mean: c.mean, edge: c.edge, interior: c.interior }));
}
console.log('A: max 档样本(px,py,dd,onRGB,offRGB):');
{
  const c = census(pairsOn[0][0], pairsOn[0][1]);
  for (const s of c.spots) console.log('  ' + JSON.stringify(s));
}

// ---- 相位 B:warp off(quality=0)——5 对 ----
await page.evaluate(() => { window.__wwMod.waterWaves.quality = 0; });
await page.evaluate(() => window.__drive(2));
const pairsOff = [];
for (let k = 0; k < 5; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  const a = await page.evaluate(({ v0 }) => {
    window.__vl.liqglSetForTest(true);
    window.__vnow = v0;
    window.__drive(1);
    return v0;
  }, { v0 });
  const fa = await snap();
  await page.evaluate(({ v0 }) => {
    window.__vl.liqglSetForTest(false);
    window.__vnow = v0;
    window.__drive(1);
  }, { v0: a });
  const fb = await snap();
  pairsOff.push([fa, fb]);
}
console.log('B: warp off census:');
for (const [a, b] of pairsOff) {
  const c = census(a, b);
  console.log('  ' + JSON.stringify({ n: c.n, maxd: c.maxd, mean: c.mean, bbox: c.bbox }));
}
console.log('errors:', errs.slice(0, 3));
process.exit(0);
