// ★C13c 竖条纹显微探针（2026-10-07;_c13c-feel-ab 的差值图判读跟进面）。
// _c13c-ab diff-pair0 显示湖域 A/B 差呈竖条纹（~8-16px 周期）——本探针单相位
// 高倍目检:双臂水体 RGB 裁剪 ×2 + A/B RGB 差 ×8 + 列均值剖面 CSV + 行均值剖面。
// 运行:SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs scripts/_c13c-feel-micro.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5208';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261001 });
console.log('createGame', !!gen?.ok);
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const surf = Math.floor(g.world.groundLevel);
  const px = Math.floor(g.player.cx / 16);
  const DIRT = window.__swTiles?.['dirt'] ?? 1;
  const x0 = px - 60, x1 = px + 60, ry = surf + 1, depth = 8;
  for (let x = x0 - 12; x <= x1 + 12; x++) {
    for (let y = ry - 10; y <= ry + depth + 10; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); if (st.setWall) st.setWall(x, y, 0); }
  }
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = ry + depth; y <= ry + depth + 2; y++) st.setTile(x, y, DIRT);
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  g.player.x = (x1 + 8) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__scene = { x0, x1, ry, depth, surf };
  window.__vnow = performance.now();
  const gp = Object.getPrototypeOf(g);
  const __origFrame = gp.frame;
  gp.frame = function (t) { return window.__manualDrive ? __origFrame.call(this, t) : undefined; };
  window.__seek = (t) => { window.__vnow = t; g.lastTime = t; };
  window.__bump = (n) => { for (let i = 0; i < n; i++) window.__venv.stepVisEffectTick(); return window.__venv.visEffectFrames(); };
  window.__drive = (n) => {
    window.__manualDrive = true;
    try { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } } finally { window.__manualDrive = false; }
    return window.__vnow;
  };
  window.__c13cSet = (v) => window.__vlm?.liqC13cSetForTest?.(v);
  window.__pinAt = (wx, wy) => {
    const gg = window.__swGame;
    gg.player.x = wx; gg.player.y = wy; gg.player.vx = 0; gg.player.vy = 0;
    gg.camera.x = wx; gg.camera.y = wy;
    window.__pin = { x: wx, y: wy };
  };
  window.__drivePinned = (n) => {
    window.__manualDrive = true;
    try {
      for (let i = 0; i < n; i++) {
        window.__vnow += 16.6667;
        g.player.x = window.__pin.x; g.player.y = window.__pin.y;
        g.player.vx = 0; g.player.vy = 0;
        g.frame(window.__vnow);
      }
    } finally { window.__manualDrive = false; }
    return window.__vnow;
  };
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlm = m; }));
await page.evaluate(() => import('/src/entities/Enemy.ts').then((m) => { window.__venv = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => {
  const g = window.__swGame;
  window.__drive(90);
  window.__pinAt((window.__scene.x1 + 8) * 16, (window.__scene.ry - 3) * 16);
  window.__drivePinned(30);
});
await page.evaluate(() => {
  const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y;
  const ww = window.__wwMod.waterWaves;
  if (!ww.__fieldFrozen) {
    ww.__origApplyField = ww._wwApplyField.bind(ww);
    ww._wwApplyField = function () { };
    ww.__fieldFrozen = true;
  }
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
  g.acc = -1e9;
  g.lastTime = window.__vnow;
});
await page.evaluate(() => window.__bump((500 - window.__venv.visEffectFrames() + 216000) % 216000));

// 水体裁剪域（列 64..576=纯水;行 surf 行+8..湖底-8）
const crop = await page.evaluate(() => {
  const g = window.__swGame, sc = window.__scene;
  const z = g.camera.zoom ?? 1.25, H = g.renderer.canvas.height;
  const sx = (wx) => Math.round((wx * 16 - g.camera.x) * z + g.renderer.canvas.width / 2);
  const sy = (wy) => Math.round((wy * 16 - g.camera.y) * z + H / 2);
  return { cx0: sx(sc.x1 - 26), cx1: sx(sc.x1 - 2), cy0: sy(sc.ry) + 20, cy1: sy(sc.ry + sc.depth) - 4, z };
});
console.log('[crop]', JSON.stringify(crop));

await page.evaluate((c) => {
  window.__snapCv = document.createElement('canvas');
  window.__snapCv.width = c.cx1 - c.cx0; window.__snapCv.height = c.cy1 - c.cy0;
  window.__crop = c;
}, crop);
const grab = async () => page.evaluate(() => {
  const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
  const cr = window.__crop;
  const lx = window.__snapCv.getContext('2d', { willReadFrequently: true });
  lx.clearRect(0, 0, cr.cx1 - cr.cx0, cr.cy1 - cr.cy0);
  lx.drawImage(c, cr.cx0, cr.cy0, cr.cx1 - cr.cx0, cr.cy1 - cr.cy0, 0, 0, cr.cx1 - cr.cx0, cr.cy1 - cr.cy0);
  const d = lx.getImageData(0, 0, window.__snapCv.width, window.__snapCv.height).data;
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
  // 列/行均值剖面（RGB 分列）
  const W = window.__snapCv.width, H2 = window.__snapCv.height;
  const colR = new Float64Array(W), colG = new Float64Array(W), colB = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    let r = 0, gg = 0, b = 0;
    for (let y = 0; y < H2; y++) { const i = (y * W + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    colR[x] = r / H2; colG[x] = gg / H2; colB[x] = b / H2;
  }
  return { w: W, h: H2, b64: btoa(bin), colR: Array.from(colR, v => Math.round(v * 10) / 10), colG: Array.from(colG, v => Math.round(v * 10) / 10), colB: Array.from(colB, v => Math.round(v * 10) / 10) };
});
const savePng = (buf, name, zoom) => {
  // 放大落盘:用 sharp 不可用 → 直接原尺寸写 PNG（readpreview 可缩放）;补 zoom 用页内放大重抓
  writeFileSync(`/tmp/${name}.rgba`, buf);
};
async function armSnap(arm, tag) {
  await page.evaluate((a) => {
    window.__bump((500 - window.__venv.visEffectFrames() + 216000) % 216000);
    window.__c13cSet(a === 'B');
  }, arm);
  await page.evaluate(() => window.__drivePinned(3));
  const s = await grab();
  writeFileSync(`/tmp/c13c-micro-${tag}.rgba`, Buffer.from(s.b64, 'base64'));
  return s;
}
const A = await armSnap('A', 'a');
const B = await armSnap('B', 'b');
// 页内 2× 放大 PNG（目检面）
const zoomPng = async (tag) => page.evaluate((t) => {
  const cv = document.createElement('canvas');
  cv.width = window.__snapCv.width * 2; cv.height = window.__snapCv.height * 2;
  const cx = cv.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(window.__snapCv, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/png');
}, tag).then((u) => writeFileSync(`/tmp/c13c-micro-${tag}-x2.png`, Buffer.from(u.split(',')[1], 'base64')));
await zoomPng('a'); await zoomPng('b');
// A/B 差值 ×8 PNG
const diffUrl = await page.evaluate(({ a, b }) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const P = dec(a.b64), Q = dec(b.b64);
  const out = new Uint8ClampedArray(P.length);
  for (let i = 0; i < P.length; i += 4) {
    const dr = P[i] - Q[i], dg = P[i + 1] - Q[i + 1], db = P[i + 2] - Q[i + 2];
    out[i] = Math.min(255, Math.abs(dr) * 8); out[i + 1] = Math.min(255, Math.abs(dg) * 8); out[i + 2] = Math.min(255, Math.abs(db) * 8); out[i + 3] = 255;
  }
  const cv = document.createElement('canvas');
  cv.width = a.w; cv.height = a.h;
  cv.getContext('2d').putImageData(new ImageData(out, a.w, a.h), 0, 0);
  return cv.toDataURL('image/png');
}, { a: A, b: B });
writeFileSync('/tmp/c13c-micro-diffx8.png', Buffer.from(diffUrl.split(',')[1], 'base64'));
// 列剖面 CSV（A/B 的 R 通道——波带面）
const csvR = ['x,A_R,B_R', ...A.colR.map((v, i) => `${i},${v},${B.colR[i]}`)].join('\n');
writeFileSync('/tmp/c13c-micro-colR.csv', csvR);
// 剖面统计:主频（FFT 简化=相邻差符号翻转率）+ 峰谷
const prof = (arr) => {
  const n = arr.length;
  let zc = 0; const dm = arr.map((v) => v - arr.reduce((s, x) => s + x, 0) / n);
  for (let i = 1; i < n; i++) if ((dm[i - 1] < 0 && dm[i] >= 0) || (dm[i - 1] > 0 && dm[i] <= 0)) zc++;
  const mn = Math.min(...arr), mx = Math.max(...arr);
  return { ptp: +(mx - mn).toFixed(1), zc };
};
console.log('[A] colR ptp=', prof(A.colR).ptp, 'zc=', prof(A.colR).zc, '| [B] colR ptp=', prof(B.colR).ptp, 'zc=', prof(B.colR).zc);
console.log('[A] colG ptp=', prof(A.colG).ptp, '| [B] colG ptp=', prof(B.colG).ptp);
console.log('落盘 /tmp/c13c-micro-{a,b}-x2.png diffx8.png colR.csv');
process.exit(0);
