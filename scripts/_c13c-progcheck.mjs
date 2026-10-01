// ★C13c 程序因果判谳（2026-10-01 一次性诊断）:
//  ①liqshimmer 程序调用计数（c13c 开/关）;②uTVis 扰动判谳（+30 帧相位→帧必变
//  =FS 场真在像素链;复原→帧复原）。运行:SW_ORIGIN=... run-diag scripts/_c13c-progcheck.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261001 });
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const surf = Math.floor(g.world.groundLevel);
  const px = Math.floor(g.player.cx / 16);
  const DIRT = window.__swTiles?.['dirt'] ?? 1;
  const x0 = px - 60, x1 = px + 60, ry = surf + 1, depth = 8;
  for (let x = x0 - 12; x <= x1 + 12; x++) for (let y = ry - 10; y <= ry + depth + 10; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry + depth; y <= ry + depth + 2; y++) st.setTile(x, y, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  g.player.x = (x1 + 8) * 16; g.player.y = (ry - 3) * 16; g.camera.x = g.player.x; g.camera.y = g.player.y;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  window.__sceneRect = { x0, x1, ry, depth };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } };
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlm = m; }));
await page.evaluate(() => import('/src/render/GLSpriteLayer.ts').then((m) => {
  window.__glsl = m;
  window.__cnt = { shim: 0, rgba: 0 };
  const P = m.GLSpriteLayer.prototype;
  const os = P.quadBatchLiqShimmer, or = P.quadBatchRgba;
  P.quadBatchLiqShimmer = function (...a) { window.__cnt.shim++; return os.apply(this, a); };
  P.quadBatchRgba = function (...a) { window.__cnt.rgba++; return or.apply(this, a); };
}));
for (let i = 0; i < 8; i++) await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(10); });
const r = await page.evaluate(async () => {
  window.__cnt.shim = 0; window.__cnt.rgba = 0;
  window.__vlm.liqC13cSetForTest(true);
  window.__drive(3);
  const on = { ...window.__cnt };
  window.__cnt.shim = 0; window.__cnt.rgba = 0;
  window.__vlm.liqC13cSetForTest(false);
  window.__drive(3);
  const off = { ...window.__cnt };
  window.__vlm.liqC13cSetForTest(true);
  return { on, off };
});
console.log('progcalls:', JSON.stringify(r));
const d = await page.evaluate(() => {
  // ★GL 层拦截:uTVis uniform 提交点拦 +30（模块态不可外部改=命名空间赋值静默失败）
  {
    const P = window.__glsl.GLSpriteLayer.prototype;
    const origQ = P.quadBatchLiqShimmer;
    P.quadBatchLiqShimmer = function (...a) {
      const gl = this.gl;
      if (gl && !gl.__utvisPatched && this.shimUni && this.shimUni.uTVis) {
        gl.__utvisPatched = true;
        const loc = this.shimUni.uTVis;
        const ouf = gl.uniform1f.bind(gl);
        gl.uniform1f = (l, v, ...rest) => (l === loc ? ouf(l, v + 30, ...rest) : ouf(l, v, ...rest));
      }
      return origQ.apply(this, a);
    };
  }
  const snap = () => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    return lx.getImageData(0, 0, lc.width, lc.height).data;
  };
  const diff = (P, Q) => {
    let n = 0, maxd = 0;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      if (dd > 0) { n++; if (dd > maxd) maxd = dd; }
    }
    return { n, maxd };
  };
  window.__vlm.liqC13cSetForTest(true);
  window.__drive(3);
  const base = snap();
  const origSet = window.__glsl.setLiqShimmerTVis;
  window.__glsl.setLiqShimmerTVis = (v) => origSet(v + 30);
  window.__drive(3);
  const pert = snap();
  window.__glsl.setLiqShimmerTVis = origSet;
  window.__drive(3);
  const back = snap();
  window.__drive(30);
  const later = snap();
  // ★湖面像素采样（快照活性+内容判谳;A/B 探针同款冻结态下 census 面有效性前提）
  const cv = window.__swGame.renderer.canvas;
  const lc = document.createElement('canvas');
  lc.width = cv.width; lc.height = cv.height;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  lx.drawImage(cv, 0, 0);
  const W = cv.width;
  const g2 = window.__swGame;
  const camX = g2.camera.x, camY = g2.camera.y, z = g2.camera.zoom ?? 1.25;
  const dw = W / 2;
  const lakeCx = Math.round(W / 2 + (window.__sceneRect.x0 + 30) * 16 * z - camX * z * 0 + (window.__sceneRect.x0 + 30) * 16 - 0) ;
  void lakeCx;
  const samples = [];
  const rect = window.__sceneRect;
  const toScreen = (wx, wy) => [Math.round((wx * 16 - camX) * z + W / 2), Math.round((wy * 16 - camY) * z + cv.height / 2)];
  const [sx1, sy1] = toScreen((rect.x0 + rect.x1) / 2, rect.ry + rect.depth / 2);
  for (let dy2 = -8; dy2 <= 8; dy2 += 4) for (let dx2 = -8; dx2 <= 8; dx2 += 4) {
    const o = ((sy1 + dy2) * W + (sx1 + dx2)) * 4;
    samples.push([sx1 + dx2, sy1 + dy2, lc.width ? [lx.getImageData(sx1 + dx2, sy1 + dy2, 1, 1).data[0], lx.getImageData(sx1 + dx2, sy1 + dy2, 1, 1).data[1], lx.getImageData(sx1 + dx2, sy1 + dy2, 1, 1).data[2]] : null]);
    void o;
  }
  void dw;
  // ★快照面普查:枚举全部 canvas,找「随 drive 内容变化」的活呈现面
  const cvs = [...document.querySelectorAll('canvas')];
  const s1 = cvs.map((c) => {
    const lc = document.createElement('canvas');
    lc.width = Math.min(c.width, 256); lc.height = Math.min(c.height, 256);
    try {
      const lx = lc.getContext('2d', { willReadFrequently: true });
      lx.drawImage(c, 0, 0, lc.width, lc.height);
      return lx.getImageData(0, 0, lc.width, lc.height).data;
    } catch (e) { return null; }
  });
  window.__drive(30);
  const live = [];
  cvs.forEach((c, i) => {
    if (!s1[i] || !c.width) return;
    const lc = document.createElement('canvas');
    lc.width = Math.min(c.width, 256); lc.height = Math.min(c.height, 256);
    try {
      const lx = lc.getContext('2d', { willReadFrequently: true });
      lx.drawImage(c, 0, 0, lc.width, lc.height);
      const d2 = lx.getImageData(0, 0, lc.width, lc.height).data;
      let n = 0;
      for (let k = 0; k < d2.length; k += 4) if (Math.abs(d2[k] - s1[i][k]) > 0) n++;
      live.push({ i, w: c.width, h: c.height, id: c.id, cls: c.className, changed: n });
    } catch (e) { live.push({ i, err: String(e) }); }
  });
  return { uTVisPert: diff(base, pert), liveness: diff(base, later), lakeSamples: samples, canvases: live };
});
console.log('uTVisPert:', JSON.stringify(d));
await browser.close();
process.exit(0);
