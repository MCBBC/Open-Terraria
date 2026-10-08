// ★BJ572 条带刀最终判据（同底图页内 A/B,零漂移）：
//   基座 = 活体游戏网格关帧的真实像素（GPU 主画布转储,含真实明暗/色彩分布）;
//   臂 A = 基座副本 + 旧逐格双 pass（BJ448 定稿序 1:1）
//   臂 B = 基座副本 + 条带批（活体同构页内复刻）
//   同一变换（7a-pre 复刻,cam/zoom 活体读数）;判据 = A≡B 逐字节。
//   另测分数相位（zoom=0.75 模拟）以钉「整数 zoom 门」的必要性。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj572-samebase-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
await page.evaluate(() => {
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[0] = 1;
  g.player.builderAccStatus[1] = 0;
});
await freezeClock(page, { tod: 0.5 });
await page.mouse.move(1050, 650);
await pump(page, 60);
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const br = r.builderRulers ? { ...r.builderRulers } : null;
  if (!br) return { err: 'builderRulers null' };
  // 基座：网格关帧（先关网格,等两帧,转储）
  g.player.builderAccStatus[1] = 1;
  return new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const c = r.canvas;
    const base = document.createElement('canvas');
    base.width = c.width; base.height = c.height;
    const bctx = base.getContext('2d', { willReadFrequently: true });
    bctx.drawImage(c, 0, 0);
    const cam = g.camera;
    const ctxInfo = { camX: cam.x, camY: cam.y, zoom: cam.zoom };
    const num3 = 0.2 + 0.5 * Math.max(0, Math.min(1, 1 - br.gridDist / 6));
    const ts = 16, z0 = ctxInfo.zoom, viewW = c.width, viewH = c.height;
    const leftPx = ctxInfo.camX - viewW / 2 / z0;
    const topPx = ctxInfo.camY - viewH / 2 / z0;
    const ox = Math.floor((leftPx - 50) / ts);
    const oy = Math.floor((topPx - 50) / ts);
    const nx = Math.floor((viewW / z0 + 100) / ts);
    const ny = Math.floor((viewH / z0 + 100) / ts);
    const px = br.mouseTx - ox, py = br.mouseTy - oy;
    // 模板调色
    const tpl = new Image();
    tpl.onload = () => {
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
      const img = tint(tpl, Math.floor(61 * 0.4 * num3), Math.floor(204 * 0.4 * num3), Math.floor(229 * 0.4 * num3));
      const imgHi = tint(tpl, Math.floor(127.5 * num3), Math.floor(102 * num3), Math.floor(114.5 * num3));
      const imgMask = tint(tpl, 0, 0, 0);
      const gMaskA = Math.floor(127 * 0.4 * num3) / 255;
      const xMaskA = Math.floor(127 * 0.5 * num3) / 255;

      function runArm(canvas, mode, phaseX, phaseY) {
        const o = canvas.getContext('2d', { willReadFrequently: true });
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.clearRect(0, 0, canvas.width, canvas.height);
        o.drawImage(base, 0, 0);
        o.save();
        o.imageSmoothingEnabled = false;
        o.translate(Math.round(viewW / 2) + phaseX, Math.round(viewH / 2) + phaseY);
        o.scale(z0, z0);
        o.translate(-Math.round(ctxInfo.camX * z0) / z0, -Math.round(ctxInfo.camY * z0) / z0);
        const DX0 = ox * ts - 1, DY0 = oy * ts - 1;
        if (mode === 'old') {
          o.globalCompositeOperation = 'multiply';
          o.globalAlpha = gMaskA;
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            if (i === px || j === py) continue;
            const insetX = i === px + 1, insetY = j === py + 1;
            const sx = insetX ? 2 : 0, sw = insetX ? 14 : 16;
            const sy = insetY ? 2 : 18, sh = insetY ? 14 : 16;
            o.drawImage(imgMask, sx, sy, sw, sh, (ox + i) * ts + (insetX ? 2 : 0) - 1, (oy + j) * ts + (insetY ? 2 : 0) - 1, sw, sh);
          }
          o.globalAlpha = xMaskA;
          for (let k = 0; k < nx; k++) o.drawImage(imgMask, 0, 0, 16, k === px ? 16 : 18, (ox + k) * ts - 1, (oy + py) * ts - 1, 16, k === px ? 16 : 18);
          o.globalCompositeOperation = 'lighter';
          o.globalAlpha = 1;
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            if (i === px || j === py) continue;
            const insetX = i === px + 1, insetY = j === py + 1;
            const sx = insetX ? 2 : 0, sw = insetX ? 14 : 16;
            const sy = insetY ? 2 : 18, sh = insetY ? 14 : 16;
            o.drawImage(img, sx, sy, sw, sh, (ox + i) * ts + (insetX ? 2 : 0) - 1, (oy + j) * ts + (insetY ? 2 : 0) - 1, sw, sh);
          }
          for (let k = 0; k < nx; k++) o.drawImage(imgHi, 0, 0, 16, k === px ? 16 : 18, (ox + k) * ts - 1, (oy + py) * ts - 1, 16, k === px ? 16 : 18);
          o.globalCompositeOperation = 'multiply';
          o.globalAlpha = xMaskA;
          for (let l = 0; l < ny; l++) { if (l === py) continue; o.drawImage(imgMask, 0, 0, 18, 16, (ox + px) * ts - 1, (oy + l) * ts - 1, 18, 16); }
          o.globalCompositeOperation = 'lighter';
          o.globalAlpha = 1;
          for (let l = 0; l < ny; l++) { if (l === py) continue; o.drawImage(imgHi, 0, 0, 18, 16, (ox + px) * ts - 1, (oy + l) * ts - 1, 18, 16); }
        } else {
          const store = {};
          const mkStrip = (key, w, h, src, sx, sy, sw, sh, vert) => {
            if (store[key]) return store[key];
            const cc = document.createElement('canvas'); cc.width = w; cc.height = h;
            const oo = cc.getContext('2d');
            oo.imageSmoothingEnabled = false;
            const n = vert ? Math.ceil(h / 16) : Math.ceil(w / 16);
            for (let q = 0; q < n; q++) vert ? oo.drawImage(src, sx, sy, sw, sh, 0, q * 16, sw, sh) : oo.drawImage(src, sx, sy, sw, sh, q * 16, 0, sw, sh);
            store[key] = cc;
            return cc;
          };
          const stripU = mkStrip('U', 16, ny * 16, img, 0, 18, 16, 16, true);
          const stripUM = mkStrip('UM', 16, ny * 16, imgMask, 0, 18, 16, 16, true);
          const stripCI = mkStrip('CI', 14, ny * 16, img, 2, 18, 14, 16, true);
          const stripCIM = mkStrip('CIM', 14, ny * 16, imgMask, 2, 18, 14, 16, true);
          const stripRI = mkStrip('RI', nx * 16, 14, img, 0, 2, 16, 14, false);
          const stripRIM = mkStrip('RIM', nx * 16, 14, imgMask, 0, 2, 16, 14, false);
          const stripCR = mkStrip('CR', nx * 16, 18, imgHi, 0, 0, 16, 18, false);
          const stripCRM = mkStrip('CRM', nx * 16, 18, imgMask, 0, 0, 16, 18, false);
          const stripCC = mkStrip('CC', 18, ny * 16, imgHi, 0, 0, 18, 16, true);
          const stripCCM = mkStrip('CCM', 18, ny * 16, imgMask, 0, 0, 18, 16, true);
          const a = Math.min(Math.max(px, 0), nx), b = Math.max(Math.min(px + 2, nx), 0);
          const cc2 = Math.min(Math.max(py, 0), ny), d = Math.max(Math.min(py + 2, ny), 0);
          const px1In = px >= -1 && px + 1 < nx, py1In = py >= -1 && py + 1 < ny;
          const drawVSeg = (strip, sw, j0, j1, dx) => { if (j1 > j0) o.drawImage(strip, 0, j0 * ts, sw, (j1 - j0) * ts, dx, DY0 + j0 * ts, sw, (j1 - j0) * ts); };
          const drawHSeg = (strip, sh, i0, i1, dy) => { if (i1 > i0) o.drawImage(strip, i0 * ts, 0, (i1 - i0) * ts, sh, DX0 + i0 * ts, dy, (i1 - i0) * ts, sh); };
          const inRangePx = px >= 0 && px < nx, inRangePy = py >= 0 && py < ny;
          const rowSegs = inRangePx ? [[0, px], [px + 1, nx]] : [[0, nx]];
          const colSegsL = inRangePy ? [[0, py], [py + 1, ny]] : [[0, ny]];
          o.globalCompositeOperation = 'multiply';
          o.globalAlpha = gMaskA;
          for (let i = 0; i < nx; i++) {
            if (i === px || i === px + 1) continue;
            drawVSeg(stripUM, 16, 0, cc2, DX0 + i * ts);
            drawVSeg(stripUM, 16, d, ny, DX0 + i * ts);
          }
          if (px1In) { const dx = DX0 + (px + 1) * ts + 2; drawVSeg(stripCIM, 14, 0, cc2, dx); drawVSeg(stripCIM, 14, d, ny, dx); }
          if (py1In) { const dy = DY0 + (py + 1) * ts + 2; drawHSeg(stripRIM, 14, 0, a, dy); drawHSeg(stripRIM, 14, b, nx, dy); }
          if (px1In && py1In) o.drawImage(imgMask, 2, 2, 14, 14, DX0 + (px + 1) * ts + 2, DY0 + (py + 1) * ts + 2, 14, 14);
          o.globalAlpha = xMaskA;
          for (const [k0, k1] of rowSegs) drawHSeg(stripCRM, 18, k0, k1, DY0 + py * ts);
          if (inRangePx) o.drawImage(imgMask, 0, 0, 16, 16, DX0 + px * ts, DY0 + py * ts, 16, 16);
          o.globalCompositeOperation = 'lighter';
          o.globalAlpha = 1;
          for (let i = 0; i < nx; i++) {
            if (i === px || i === px + 1) continue;
            drawVSeg(stripU, 16, 0, cc2, DX0 + i * ts);
            drawVSeg(stripU, 16, d, ny, DX0 + i * ts);
          }
          if (px1In) { const dx = DX0 + (px + 1) * ts + 2; drawVSeg(stripCI, 14, 0, cc2, dx); drawVSeg(stripCI, 14, d, ny, dx); }
          if (py1In) { const dy = DY0 + (py + 1) * ts + 2; drawHSeg(stripRI, 14, 0, a, dy); drawHSeg(stripRI, 14, b, nx, dy); }
          if (px1In && py1In) o.drawImage(img, 2, 2, 14, 14, DX0 + (px + 1) * ts + 2, DY0 + (py + 1) * ts + 2, 14, 14);
          for (const [k0, k1] of rowSegs) drawHSeg(stripCR, 18, k0, k1, DY0 + py * ts);
          if (inRangePx) o.drawImage(imgHi, 0, 0, 16, 16, DX0 + px * ts, DY0 + py * ts, 16, 16);
          o.globalCompositeOperation = 'multiply';
          o.globalAlpha = xMaskA;
          for (const [l0, l1] of colSegsL) drawVSeg(stripCCM, 18, l0, l1, DX0 + px * ts);
          o.globalCompositeOperation = 'lighter';
          o.globalAlpha = 1;
          for (const [l0, l1] of colSegsL) drawVSeg(stripCC, 18, l0, l1, DX0 + px * ts);
        }
        o.restore();
        return o.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const A = runArm(Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }), 'old', 0, 0).slice();
      const canvasB = document.createElement('canvas');
      canvasB.width = c.width; canvasB.height = c.height;
      const B = runArm(canvasB, 'strip', 0, 0);
      let n = 0, maxd = 0; const samples = [];
      for (let i = 0; i < A.length; i += 4) {
        const dd = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
        if (dd > 0) { n++; if (dd > maxd) maxd = dd; if (samples.length < 5) { const idx = i >> 2; samples.push({ x: idx % c.width, y: (idx / c.width) | 0, a: [A[i], A[i + 1], A[i + 2]], b: [B[i], B[i + 1], B[i + 2]] }); } }
      }
      const out = { identity: { n, maxd, samples } };
      // 分数相位（zoom 模拟不可行,以亚像素平移近似非整数设备相位）
      const A2 = runArm(Object.assign(document.createElement('canvas'), { width: c.width, height: c.height }), 'old', 0.5, 0.25).slice();
      const canvasC = document.createElement('canvas');
      canvasC.width = c.width; canvasC.height = c.height;
      const B2 = runArm(canvasC, 'strip', 0.5, 0.25);
      let n2 = 0, maxd2 = 0;
      for (let i = 0; i < A2.length; i += 4) {
        const dd = Math.max(Math.abs(A2[i] - B2[i]), Math.abs(A2[i + 1] - B2[i + 1]), Math.abs(A2[i + 2] - B2[i + 2]));
        if (dd > 0) { n2++; if (dd > maxd2) maxd2 = dd; }
      }
      out.subpixel = { n: n2, maxd: maxd2 };
      done(out);
    };
    tpl.onerror = () => done({ err: 'tpl fail' });
    tpl.src = 'sprites/vanilla/Extra_68.png';
  })));
});
console.log('SAMEBASE-AB:', JSON.stringify(res, null, 1));
await browser.close();
