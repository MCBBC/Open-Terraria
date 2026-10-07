// ★C13c 活机（无冻结）观感 A/B——用户实报「果冻感/下水波动变小」的活机复测面。
// _c13c-feel-ab（冻结 rig）已定谳基体场两臂逐像素等价（ptp/列带/频响 B/A≈1.03）,
// 差异集中闪纹。本探针不冻任何子系统（纹理动画/液面 bob/obj19 扭曲/光照脉动全活）,
// 仅钉玩家+重锚 tVis 相位,逐帧驱动 420 帧（=完整 6s 波周期+噪声周期整数倍）,
// 活机口径重测 M1/M3/M4 + PNG。两臂 tVis/tick 序列确定同相（fixedUpdate 驱动）。
// 运行:SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs --timeout=900000 scripts/_c13c-feel-live.mjs
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
  window.__bump = (n) => { for (let i = 0; i < n; i++) window.__venv.stepVisEffectTick(); return window.__venv.visEffectFrames(); };
  window.__pinAt = (wx, wy) => {
    const gg = window.__swGame;
    gg.player.x = wx; gg.player.y = wy; gg.player.vx = 0; gg.player.vy = 0;
    gg.camera.x = wx; gg.camera.y = wy;
    window.__pin = { x: wx, y: wy };
  };
  window.__driveLive = (n) => {
    // 活机驱动:钉位防漂移,其余全真（fixedUpdate/纹理动画/bob/obj19/光照全走）
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
  window.__c13cSet = (v) => window.__vlm?.liqC13cSetForTest?.(v);
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlm = m; }));
await page.evaluate(() => import('/src/entities/Enemy.ts').then((m) => { window.__venv = m; }));
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => {
  const g = window.__swGame;
  // 落底 settle:先临时钉位（__pin 未立前用直驱）再正式钉
  window.__manualDrive = true;
  try { for (let i = 0; i < 90; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } } finally { window.__manualDrive = false; }
  window.__pinAt((window.__scene.x1 + 8) * 16, (window.__scene.ry - 3) * 16);
  window.__driveLive(30);
});

// ---- 测量机（同 feel-ab 但不减震:只钉位）----
await page.evaluate(() => {
  window.__liveInit = (band) => {
    const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
    const w = c.width, y0 = Math.max(0, band[0] | 0), y1 = Math.min(c.height, band[1] | 0);
    const h = y1 - y0;
    const F = window.__feel = {
      w, bandY0: y0, h,
      sum: new Float64Array(w * h), min: new Float64Array(w * h).fill(1e9), max: new Float64Array(w * h).fill(-1e9),
      colMean: [], tVis: [],
    };
    const lc = document.createElement('canvas'); lc.width = w; lc.height = h;
    F.lc = lc; F.lx = lc.getContext('2d', { willReadFrequently: true });
    return { w, h };
  };
  window.__liveSample = (tVis) => {
    const F = window.__feel;
    const c = document.getElementById('sw-c10e-glcanvas') ?? window.__swGame.renderer.canvas;
    F.lx.drawImage(c, 0, -F.bandY0);
    const d = F.lx.getImageData(0, 0, F.w, F.h).data;
    const { w, h } = F;
    const colA = new Float64Array(w); const colN = new Float64Array(w);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const L = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        const p = y * w + x;
        F.sum[p] += L;
        if (L < F.min[p]) F.min[p] = L;
        if (L > F.max[p]) F.max[p] = L;
        colA[x] += L; colN[x]++;
      }
    }
    const cm = new Float64Array(w); for (let x = 0; x < w; x++) cm[x] = colA[x] / colN[x];
    F.colMean.push(cm); F.tVis.push(tVis);
  };
  window.__livePng = (kind) => {
    const F = window.__feel;
    const N = F.colMean.length;
    const cv = document.createElement('canvas');
    cv.width = F.w; cv.height = F.h;
    const cx = cv.getContext('2d');
    const img = cx.createImageData(F.w, F.h);
    const o = img.data;
    for (let p = 0; p < F.w * F.h; p++) {
      let v;
      if (kind === 'mean') v = F.sum[p] / N;
      else v = F.max[p] - F.min[p];
      v = Math.max(0, Math.min(255, v));
      const i = p * 4;
      o[i] = v; o[i + 1] = v; o[i + 2] = v; o[i + 3] = 255;
      if (kind === 'ptp' && v > 0) { o[i] = Math.min(255, 64 + v); o[i + 1] = v; o[i + 2] = 255 - Math.min(255, v); }
    }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  };
  window.__liveAnalyze = () => {
    const F = window.__feel;
    const N = F.colMean.length, w = F.w;
    // M3-L: 列带去趋势 ptp（波带相干面;每列减去滑动均值去慢漂→ptp）
    const out = [];
    for (let x = 0; x < w; x++) {
      let s = 0; for (let k = 0; k < N; k++) s += F.colMean[k][x];
      const m = s / N;
      let mn = 1e9, mx = -1e9;
      for (let k = 0; k < N; k++) { const v = F.colMean[k][x]; if (v < mn) mn = v; if (v > mx) mx = v; }
      out.push(mx - mn);
    }
    const sorted = out.slice().sort((a, b) => a - b);
    // M1-L: 逐像素 ptp（全带）
    const ptp = new Float64Array(F.w * F.h);
    for (let p = 0; p < F.w * F.h; p++) ptp[p] = F.max[p] - F.min[p];
    const s2 = Array.from(ptp).sort((a, b) => a - b);
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    return {
      colPtpMean: mean(out), colPtpP50: sorted[Math.floor(w / 2)], colPtpP90: sorted[Math.floor(w * 0.9)],
      pxPtpMean: mean(s2), pxPtpP50: s2[Math.floor(s2.length / 2)], pxPtpP90: s2[Math.floor(s2.length * 0.9)],
      N,
    };
  };
});
async function bandOf() {
  return page.evaluate(() => {
    const g = window.__swGame, sc = window.__scene;
    const z = g.camera.zoom ?? 1.25, H = g.renderer.canvas.height;
    const sy = (wy) => Math.round((wy * 16 - g.camera.y) * z + H / 2);
    return [sy(sc.ry), sy(sc.ry + sc.depth)];
  });
}
const NL = 420;
async function runArmLive(arm, tag) {
  await page.evaluate((a) => {
    window.__bump((500 - window.__venv.visEffectFrames() + 216000) % 216000);
    window.__c13cSet(a === 'B');
  }, arm);
  await page.evaluate(() => window.__driveLive(3));
  const band = await bandOf();
  await page.evaluate((b) => window.__liveInit(b), band);
  // 分批驱动+采样（每 evaluate 30 帧防超时）
  for (let k = 0; k < NL; k++) {
    await page.evaluate(() => { window.__driveLive(1); window.__liveSample(window.__venv.visEffectFrames()); });
  }
  const res = await page.evaluate(() => window.__liveAnalyze());
  for (const kind of ['mean', 'ptp']) {
    const url = await page.evaluate((k) => window.__livePng(k), kind);
    writeFileSync(`/tmp/c13c-live-${tag}-${kind}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  return { band, res };
}
console.log('== S1 活机岸观（420 帧=完整波周期） ==');
const LA = await runArmLive('A', 's1a');
console.log(`[L/A] band=${JSON.stringify(LA.band)} N=${LA.res.N}`);
console.log(`[L/A] 列带 ptp mean=${LA.res.colPtpMean.toFixed(2)} p50=${LA.res.colPtpP50.toFixed(2)} p90=${LA.res.colPtpP90.toFixed(2)} | 逐像素 ptp mean=${LA.res.pxPtpMean.toFixed(2)} p50=${LA.res.pxPtpP50.toFixed(1)} p90=${LA.res.pxPtpP90.toFixed(1)}`);
const LB = await runArmLive('B', 's1b');
console.log(`[L/B] band=${JSON.stringify(LB.band)} N=${LB.res.N}`);
console.log(`[L/B] 列带 ptp mean=${LB.res.colPtpMean.toFixed(2)} p50=${LB.res.colPtpP50.toFixed(2)} p90=${LB.res.colPtpP90.toFixed(2)} | 逐像素 ptp mean=${LB.res.pxPtpMean.toFixed(2)} p50=${LB.res.pxPtpP50.toFixed(1)} p90=${LB.res.pxPtpP90.toFixed(1)}`);
const rCol = LB.res.colPtpMean / Math.max(1e-6, LA.res.colPtpMean);
const rPx = LB.res.pxPtpMean / Math.max(1e-6, LA.res.pxPtpMean);
console.log(`== 活机汇总 == 列带 B/A=${rCol.toFixed(3)} | 逐像素 ptp B/A=${rPx.toFixed(3)}`);
process.exit(0);
