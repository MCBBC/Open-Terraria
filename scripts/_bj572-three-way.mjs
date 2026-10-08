// ★BJ572 条带刀单会话三态取证（免疫跨运行污染）：
//   F_on  = 活体帧（网格走条带路径）
//   F_off = 网格关帧（世界底图）
//   F_ref = F_off 副本 + 页内旧逐格双 pass 重放（7a-pre 变换精确复刻）
//   掩膜  = 连续两拍 F_off 的动画像素（水波等渲染侧动画）
//   判据  = 非掩膜像素上 F_on ≡ F_ref 逐字节。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj572-three-way.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky; const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch {}
  try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } const fx = g.renderer.weatherFx; if (fx) { fx.update = () => {}; (fx.pool||[]).forEach(d=>d.active=false); (fx.snow||[]).forEach(d=>d.active=false); (fx.sand||[]).forEach(d=>d.active=false); } } catch {}
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[0] = 1;   // 标尺线关
  g.player.builderAccStatus[1] = 0;   // 网格开
});
await freezeClock(page, { tod: 0.5 });
await page.mouse.move(1050, 650);
await pump(page, 90);
await page.evaluate(() => { const g = window.__swGame; g.paused = true; g._uiPausedByAutoPause = false; });
await pump(page, 4);

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const brState = r.builderRulers ? { ...r.builderRulers } : null;
  if (!brState) return { err: 'builderRulers null' };
  const cam = g.camera;
  const ctxInfo = { camX: cam.x, camY: cam.y, zoom: cam.zoom };
  // 主画布快照函数
  const c = r.canvas;
  const lc = document.createElement('canvas');
  lc.width = c.width; lc.height = c.height;
  const lctx = lc.getContext('2d', { willReadFrequently: true });
  const snap = () => { lctx.clearRect(0, 0, lc.width, lc.height); lctx.drawImage(c, 0, 0); return lctx.getImageData(0, 0, lc.width, lc.height); };
  // ① F_on（条带路径活体帧）
  const F_on = snap();
  // ② 网格关 → F_off ×2（动画掩膜）
  g.player.builderAccStatus[1] = 1;
  await new Promise((res2) => requestAnimationFrame(() => requestAnimationFrame(res2)));
  const F_off1 = snap();
  await new Promise((res2) => requestAnimationFrame(() => requestAnimationFrame(res2)));
  const F_off2 = snap();
  // ③ F_ref = F_off1 副本 + 旧逐格重放（旧码 1:1 抄录）
  const F_ref = document.createElement('canvas');
  F_ref.width = c.width; F_ref.height = c.height;
  const rctx = F_ref.getContext('2d', { willReadFrequently: true });
  rctx.drawImage(c, 0, 0);          // 注意：此刻主画布=网格关帧（与 F_off1/F_off2 同态,重放底图用主画布直拷）
  // tintedExtra 复刻
  const tpl = await new Promise((done) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => done(null); im.src = 'sprites/vanilla/Extra_68.png'; });
  if (!tpl) return { err: 'template fail' };
  const tint = (src, rr, gg, bb) => {
    const cc = document.createElement('canvas');
    cc.width = src.width; cc.height = src.height;
    const o = cc.getContext('2d');
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'multiply';
    o.fillStyle = `rgb(${rr},${gg},${bb})`;
    o.fillRect(0, 0, cc.width, cc.height);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'source-over';
    return cc;
  };
  const num3 = 0.2 + 0.5 * Math.max(0, Math.min(1, 1 - brState.gridDist / 6));
  const img = tint(tpl, Math.floor(61 * 0.4 * num3), Math.floor(204 * 0.4 * num3), Math.floor(229 * 0.4 * num3));
  const imgHi = tint(tpl, Math.floor(127.5 * num3), Math.floor(102 * num3), Math.floor(114.5 * num3));
  const imgMask = tint(tpl, 0, 0, 0);
  const ts = 16;
  const z = ctxInfo.zoom, viewW = c.width, viewH = c.height;
  const leftPx = ctxInfo.camX - viewW / 2 / z;
  const topPx = ctxInfo.camY - viewH / 2 / z;
  const ox = Math.floor((leftPx - 50) / ts);
  const oy = Math.floor((topPx - 50) / ts);
  const nx = Math.floor((viewW / z + 100) / ts);
  const ny = Math.floor((viewH / z + 100) / ts);
  const px = brState.mouseTx - ox, py = brState.mouseTy - oy;
  rctx.save();
  rctx.setTransform(1, 0, 0, 1, 0, 0);
  rctx.imageSmoothingEnabled = false;
  rctx.translate(Math.round(viewW / 2), Math.round(viewH / 2));
  rctx.scale(z, z);
  rctx.translate(-Math.round(ctxInfo.camX * z) / z, -Math.round(ctxInfo.camY * z) / z);
  const gMaskA = Math.floor(127 * 0.4 * num3) / 255;
  const xMaskA = Math.floor(127 * 0.5 * num3) / 255;
  // ---- 旧逐格双 pass（BJ448 定稿序）----
  rctx.globalCompositeOperation = 'multiply';
  rctx.globalAlpha = gMaskA;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === px || j === py) continue;
    const insetX = i === px + 1, insetY = j === py + 1;
    const sx = insetX ? 2 : 0, sw = insetX ? 14 : 16;
    const sy = insetY ? 2 : 18, sh = insetY ? 14 : 16;
    rctx.drawImage(imgMask, sx, sy, sw, sh, (ox + i) * ts + (insetX ? 2 : 0) - 1, (oy + j) * ts + (insetY ? 2 : 0) - 1, sw, sh);
  }
  rctx.globalAlpha = xMaskA;
  for (let k = 0; k < nx; k++) rctx.drawImage(imgMask, 0, 0, 16, k === px ? 16 : 18, (ox + k) * ts - 1, (oy + py) * ts - 1, 16, k === px ? 16 : 18);
  rctx.globalCompositeOperation = 'lighter';
  rctx.globalAlpha = 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (i === px || j === py) continue;
    const insetX = i === px + 1, insetY = j === py + 1;
    const sx = insetX ? 2 : 0, sw = insetX ? 14 : 16;
    const sy = insetY ? 2 : 18, sh = insetY ? 14 : 16;
    rctx.drawImage(img, sx, sy, sw, sh, (ox + i) * ts + (insetX ? 2 : 0) - 1, (oy + j) * ts + (insetY ? 2 : 0) - 1, sw, sh);
  }
  for (let k = 0; k < nx; k++) rctx.drawImage(imgHi, 0, 0, 16, k === px ? 16 : 18, (ox + k) * ts - 1, (oy + py) * ts - 1, 16, k === px ? 16 : 18);
  rctx.globalCompositeOperation = 'multiply';
  rctx.globalAlpha = xMaskA;
  for (let l = 0; l < ny; l++) { if (l === py) continue; rctx.drawImage(imgMask, 0, 0, 18, 16, (ox + px) * ts - 1, (oy + l) * ts - 1, 18, 16); }
  rctx.globalCompositeOperation = 'lighter';
  rctx.globalAlpha = 1;
  for (let l = 0; l < ny; l++) { if (l === py) continue; rctx.drawImage(imgHi, 0, 0, 18, 16, (ox + px) * ts - 1, (oy + l) * ts - 1, 18, 16); }
  rctx.restore();
  // ---- 页内条带重放（第二参照）----
  const F_ref2 = document.createElement('canvas');
  F_ref2.width = c.width; F_ref2.height = c.height;
  const sctx = F_ref2.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(F_ref, 0, 0);   // 以旧重放底图（=F_off 副本）为基,再叠页内条带
  // 先清掉旧重放网格:重建纯底图副本
  const sctx2 = F_ref2.getContext('2d');
  sctx2.clearRect(0, 0, c.width, c.height);
  sctx2.drawImage(c, 0, 0);
  const mkStrip = (key, w, h, src, sx, sy, sw, sh, vert, store) => {
    if (store[key]) return store[key];
    const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
    const o = cc.getContext('2d');
    o.imageSmoothingEnabled = false;
    const n = vert ? Math.ceil(h / 16) : Math.ceil(w / 16);
    for (let q = 0; q < n; q++) vert ? o.drawImage(src, sx, sy, sw, sh, 0, q * 16, sw, sh) : o.drawImage(src, sx, sy, sw, sh, q * 16, 0, sw, sh);
    store[key] = cc;
    return cc;
  };
  const st = {};
  const stripU = mkStrip('U', 16, ny * 16, img, 0, 18, 16, 16, true, st);
  const stripUM = mkStrip('UM', 16, ny * 16, imgMask, 0, 18, 16, 16, true, st);
  const stripCI = mkStrip('CI', 14, ny * 16, img, 2, 18, 14, 16, true, st);
  const stripCIM = mkStrip('CIM', 14, ny * 16, imgMask, 2, 18, 14, 16, true, st);
  const stripRI = mkStrip('RI', nx * 16, 14, img, 0, 2, 16, 14, false, st);
  const stripRIM = mkStrip('RIM', nx * 16, 14, imgMask, 0, 2, 16, 14, false, st);
  const stripCR = mkStrip('CR', nx * 16, 18, imgHi, 0, 0, 16, 18, false, st);
  const stripCRM = mkStrip('CRM', nx * 16, 18, imgMask, 0, 0, 16, 18, false, st);
  const stripCC = mkStrip('CC', 18, ny * 16, imgHi, 0, 0, 18, 16, true, st);
  const stripCCM = mkStrip('CCM', 18, ny * 16, imgMask, 0, 0, 18, 16, true, st);
  sctx2.save();
  sctx2.setTransform(1, 0, 0, 1, 0, 0);
  sctx2.imageSmoothingEnabled = false;
  sctx2.translate(Math.round(viewW / 2), Math.round(viewH / 2));
  sctx2.scale(z, z);
  sctx2.translate(-Math.round(ctxInfo.camX * z) / z, -Math.round(ctxInfo.camY * z) / z);
  const a2 = Math.min(Math.max(px, 0), nx), b2 = Math.max(Math.min(px + 2, nx), 0);
  const c2 = Math.min(Math.max(py, 0), ny), d2 = Math.max(Math.min(py + 2, ny), 0);
  const DY02 = oy * ts - 1, DX02 = ox * ts - 1;
  const px1In2 = px >= -1 && px + 1 < nx, py1In2 = py >= -1 && py + 1 < ny;
  const drawVSeg2 = (strip, sw, j0, j1, dx) => { if (j1 > j0) sctx2.drawImage(strip, 0, j0 * ts, sw, (j1 - j0) * ts, dx, DY02 + j0 * ts, sw, (j1 - j0) * ts); };
  const drawHSeg2 = (strip, sh, i0, i1, dy) => { if (i1 > i0) sctx2.drawImage(strip, i0 * ts, 0, (i1 - i0) * ts, sh, DX02 + i0 * ts, dy, (i1 - i0) * ts, sh); };
  const inRangePx2 = px >= 0 && px < nx, inRangePy2 = py >= 0 && py < ny;
  const rowSegs2 = inRangePx2 ? [[0, px], [px + 1, nx]] : [[0, nx]];
  const colSegsL2 = inRangePy2 ? [[0, py], [py + 1, ny]] : [[0, ny]];
  sctx2.globalCompositeOperation = 'multiply';
  sctx2.globalAlpha = gMaskA;
  for (let i = 0; i < nx; i++) {
    if (i === px || i === px + 1) continue;
    drawVSeg2(stripUM, 16, 0, c2, DX02 + i * ts);
    drawVSeg2(stripUM, 16, d2, ny, DX02 + i * ts);
  }
  if (px1In2) { const dx = DX02 + (px + 1) * ts + 2; drawVSeg2(stripCIM, 14, 0, c2, dx); drawVSeg2(stripCIM, 14, d2, ny, dx); }
  if (py1In2) { const dy = DY02 + (py + 1) * ts + 2; drawHSeg2(stripRIM, 14, 0, a2, dy); drawHSeg2(stripRIM, 14, b2, nx, dy); }
  if (px1In2 && py1In2) sctx2.drawImage(imgMask, 2, 2, 14, 14, DX02 + (px + 1) * ts + 2, DY02 + (py + 1) * ts + 2, 14, 14);
  sctx2.globalAlpha = xMaskA;
  for (const [k0, k1] of rowSegs2) drawHSeg2(stripCRM, 18, k0, k1, DY02 + py * ts);
  if (inRangePx2) sctx2.drawImage(imgMask, 0, 0, 16, 16, DX02 + px * ts, DY02 + py * ts, 16, 16);
  sctx2.globalCompositeOperation = 'lighter';
  sctx2.globalAlpha = 1;
  for (let i = 0; i < nx; i++) {
    if (i === px || i === px + 1) continue;
    drawVSeg2(stripU, 16, 0, c2, DX02 + i * ts);
    drawVSeg2(stripU, 16, d2, ny, DX02 + i * ts);
  }
  if (px1In2) { const dx = DX02 + (px + 1) * ts + 2; drawVSeg2(stripCI, 14, 0, c2, dx); drawVSeg2(stripCI, 14, d2, ny, dx); }
  if (py1In2) { const dy = DY02 + (py + 1) * ts + 2; drawHSeg2(stripRI, 14, 0, a2, dy); drawHSeg2(stripRI, 14, b2, nx, dy); }
  if (px1In2 && py1In2) sctx2.drawImage(img, 2, 2, 14, 14, DX02 + (px + 1) * ts + 2, DY02 + (py + 1) * ts + 2, 14, 14);
  for (const [k0, k1] of rowSegs2) drawHSeg2(stripCR, 18, k0, k1, DY02 + py * ts);
  if (inRangePx2) sctx2.drawImage(imgHi, 0, 0, 16, 16, DX02 + px * ts, DY02 + py * ts, 16, 16);
  sctx2.globalCompositeOperation = 'multiply';
  sctx2.globalAlpha = xMaskA;
  for (const [l0, l1] of colSegsL2) drawVSeg2(stripCCM, 18, l0, l1, DX02 + px * ts);
  sctx2.globalCompositeOperation = 'lighter';
  sctx2.globalAlpha = 1;
  for (const [l0, l1] of colSegsL2) drawVSeg2(stripCC, 18, l0, l1, DX02 + px * ts);
  sctx2.restore();
  // ---- 三态比对 ----
  const R1 = rctx.getImageData(0, 0, F_ref.width, F_ref.height).data;   // F_ref（旧重放）
  const R2 = sctx2.getImageData(0, 0, F_ref2.width, F_ref2.height).data; // F_ref2（页内条带重放）
  const A = F_on.data, O1 = F_off1.data, O2 = F_off2.data;
  let animPx = 0, cmpPx = 0, badPx = 0, badPx2 = 0, maxd = 0, maxd2 = 0; const samples = []; const samples2 = [];
  const modHist = new Map();
  for (let i = 0; i < A.length; i += 4) {
    const anim = Math.max(Math.abs(O1[i] - O2[i]), Math.abs(O1[i + 1] - O2[i + 1]), Math.abs(O1[i + 2] - O2[i + 2]));
    if (anim > 0) { animPx++; continue; }                                // 动画像素掩膜
    const on = Math.max(Math.abs(A[i] - O1[i]), Math.abs(A[i + 1] - O1[i + 1]), Math.abs(A[i + 2] - O1[i + 2]));
    const ref = Math.max(Math.abs(R1[i] - O1[i]), Math.abs(R1[i + 1] - O1[i + 1]), Math.abs(R1[i + 2] - O1[i + 2]));
    const ref2 = Math.max(Math.abs(R2[i] - O1[i]), Math.abs(R2[i + 1] - O1[i + 1]), Math.abs(R2[i + 2] - O1[i + 2]));
    if (on === 0 && ref === 0 && ref2 === 0) continue;                    // 网格未及像素
    cmpPx++;
    const dd = Math.max(Math.abs(A[i] - R1[i]), Math.abs(A[i + 1] - R1[i + 1]), Math.abs(A[i + 2] - R1[i + 2]));
    const dd2 = Math.max(Math.abs(A[i] - R2[i]), Math.abs(A[i + 1] - R2[i + 1]), Math.abs(A[i + 2] - R2[i + 2]));
    if (dd2 > 0) { badPx2++; if (dd2 > maxd2) maxd2 = dd2; if (samples2.length < 3) { const idx = i >> 2; samples2.push({ x: idx % c.width, y: (idx / c.width) | 0 }); } }
    if (dd > 0) {
      badPx++; if (dd > maxd) maxd = dd;
      const idx0 = i >> 2; const mx = (idx0 % c.width) % 16, my = ((idx0 / c.width) | 0) % 16;
      const k2 = mx + ',' + my; modHist.set(k2, (modHist.get(k2) || 0) + 1);
      if (samples.length < 8) { const idx = i >> 2; samples.push({ x: idx % c.width, y: (idx / c.width) | 0, on: [A[i], A[i + 1], A[i + 2]], ref: [R1[i], R1[i + 1], R1[i + 2]], ref2: [R2[i], R2[i + 1], R2[i + 2]], base: [O1[i], O1[i + 1], O1[i + 2]] }); }
    }
  }
  const topMod = [...modHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  // 坏像素 24x24 结构转储（首坏像素为左上;o=on!=ref标记,r=ref!=base,g=on!=base,.=同）
  let dump = null;
  if (samples.length) {
    const x0 = samples[0].x - 4, y0 = samples[0].y - 4;
    const rows = [];
    for (let yy = y0; yy < y0 + 24; yy++) {
      let line = '';
      for (let xx = x0; xx < x0 + 24; xx++) {
        const i2 = (yy * c.width + xx) * 4;
        const onD = Math.max(Math.abs(A[i2] - R1[i2]), Math.abs(A[i2 + 1] - R1[i2 + 1]), Math.abs(A[i2 + 2] - R1[i2 + 2]));
        const refD = Math.max(Math.abs(R1[i2] - O1[i2]), Math.abs(R1[i2 + 1] - O1[i2 + 1]), Math.abs(R1[i2 + 2] - O1[i2 + 2]));
        const onBD = Math.max(Math.abs(A[i2] - O1[i2]), Math.abs(A[i2 + 1] - O1[i2 + 1]), Math.abs(A[i2 + 2] - O1[i2 + 2]));
        line += onD > 0 ? 'X' : refD > 0 ? 'r' : onBD > 0 ? 'g' : '.';
      }
      rows.push(line);
    }
    dump = { x0, y0, rows, vals: { on: [...A.slice((samples[0].y * c.width + samples[0].x) * 4, (samples[0].y * c.width + samples[0].x) * 4 + 3)], ref: [...R1.slice((samples[0].y * c.width + samples[0].x) * 4, (samples[0].y * c.width + samples[0].x) * 4 + 3)], base: [...O1.slice((samples[0].y * c.width + samples[0].x) * 4, (samples[0].y * c.width + samples[0].x) * 4 + 3)] } };
  }
  return { num3, ox, oy, nx, ny, px, py, animPx, cmpPx, badPx, maxd, badPx2, maxd2, topMod, dump, samples, samples2 };
});
console.log('THREE-WAY:', JSON.stringify(res, null, 1));
await browser.close();
