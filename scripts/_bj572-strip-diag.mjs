// ★BJ572 条带刀隔离诊断：页内同画布 A/B——旧逐格双 pass vs 新条带批,
//  恒等变换 + 分数变换两档,定位差异性质（几何错位 / 边界AA / 量化±1）。
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj572-strip-diag.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
await pump(page, 10);
const res = await page.evaluate(() => {
  // 模板实读（Extra_68.png）
  const img0 = new Image();
  img0.src = 'sprites/vanilla/Extra_68.png';
  function tint(src, r, g, b) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const o = c.getContext('2d');
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'multiply';
    o.fillStyle = `rgb(${r},${g},${b})`;
    o.fillRect(0, 0, c.width, c.height);
    o.globalCompositeOperation = 'destination-in';
    o.drawImage(src, 0, 0);
    o.globalCompositeOperation = 'source-over';
    return c;
  }
  function runTest(src) {
    const num3 = 0.7;
    const uR = Math.floor(61 * 0.4 * num3), uG = Math.floor(204 * 0.4 * num3), uB = Math.floor(229 * 0.4 * num3);
    const hR = Math.floor(127.5 * num3), hG = Math.floor(102 * num3), hB = Math.floor(114.5 * num3);
    const img = tint(src, uR, uG, uB);
    const imgHi = tint(src, hR, hG, hB);
    const imgMask = tint(src, 0, 0, 0);
    const ts = 16, ox = 0, oy = 0, nx = 16, ny = 16, px = 5, py = 7;
    const gMaskA = Math.floor(127 * 0.4 * num3) / 255;
    const xMaskA = Math.floor(127 * 0.5 * num3) / 255;
    const strips = {};
    const mkStrip = (key, w, h, s, sx, sy, sw, sh, vert) => {
      if (strips[key]) return strips[key];
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const o = c.getContext('2d');
      o.imageSmoothingEnabled = false;
      const n = vert ? Math.ceil(h / 16) : Math.ceil(w / 16);
      for (let i = 0; i < n; i++) vert ? o.drawImage(s, sx, sy, sw, sh, 0, i * 16, sw, sh) : o.drawImage(s, sx, sy, sw, sh, i * 16, 0, sw, sh);
      strips[key] = c;
      return c;
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

    function oldLoop(ctx) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = gMaskA;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (i === px || j === py) continue;
        const insetX = i === px + 1, insetY = j === py + 1;
        const sx = insetX ? 2 : 0, sw = insetX ? 14 : 16;
        const sy = insetY ? 2 : 18, sh = insetY ? 14 : 16;
        ctx.drawImage(imgMask, sx, sy, sw, sh, (ox + i) * ts + (insetX ? 2 : 0) - 1, (oy + j) * ts + (insetY ? 2 : 0) - 1, sw, sh);
      }
      ctx.globalAlpha = xMaskA;
      for (let k = 0; k < nx; k++) ctx.drawImage(imgMask, 0, 0, 16, k === px ? 16 : 18, (ox + k) * ts - 1, (oy + py) * ts - 1, 16, k === px ? 16 : 18);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        if (i === px || j === py) continue;
        const insetX = i === px + 1, insetY = j === py + 1;
        const sx = insetX ? 2 : 0, sw = insetX ? 14 : 16;
        const sy = insetY ? 2 : 18, sh = insetY ? 14 : 16;
        ctx.drawImage(img, sx, sy, sw, sh, (ox + i) * ts + (insetX ? 2 : 0) - 1, (oy + j) * ts + (insetY ? 2 : 0) - 1, sw, sh);
      }
      for (let k = 0; k < nx; k++) ctx.drawImage(imgHi, 0, 0, 16, k === px ? 16 : 18, (ox + k) * ts - 1, (oy + py) * ts - 1, 16, k === px ? 16 : 18);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = xMaskA;
      for (let l = 0; l < ny; l++) { if (l === py) continue; ctx.drawImage(imgMask, 0, 0, 18, 16, (ox + px) * ts - 1, (oy + l) * ts - 1, 18, 16); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      for (let l = 0; l < ny; l++) { if (l === py) continue; ctx.drawImage(imgHi, 0, 0, 18, 16, (ox + px) * ts - 1, (oy + l) * ts - 1, 18, 16); }
      ctx.restore();
    }

    function newStrip(ctx) {
      const a = Math.min(Math.max(px, 0), nx), b = Math.max(Math.min(px + 2, nx), 0);
      const c = Math.min(Math.max(py, 0), ny), d = Math.max(Math.min(py + 2, ny), 0);
      const DY0 = oy * ts - 1, DX0 = ox * ts - 1;
      const px1In = px >= -1 && px + 1 < nx, py1In = py >= -1 && py + 1 < ny;
      const drawVSeg = (strip, sw, j0, j1, dx) => { if (j1 > j0) ctx.drawImage(strip, 0, j0 * ts, sw, (j1 - j0) * ts, dx, DY0 + j0 * ts, sw, (j1 - j0) * ts); };
      const drawHSeg = (strip, sh, i0, i1, dy) => { if (i1 > i0) ctx.drawImage(strip, i0 * ts, 0, (i1 - i0) * ts, sh, DX0 + i0 * ts, dy, (i1 - i0) * ts, sh); };
      const inRangePx = px >= 0 && px < nx, inRangePy = py >= 0 && py < ny;
      const rowSegs = inRangePx ? [[0, px], [px + 1, nx]] : [[0, nx]];
      const colSegsL = inRangePy ? [[0, py], [py + 1, ny]] : [[0, ny]];
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = gMaskA;
      for (let i = 0; i < nx; i++) {
        if (i === px || i === px + 1) continue;
        drawVSeg(stripUM, 16, 0, c, DX0 + i * ts);
        drawVSeg(stripUM, 16, d, ny, DX0 + i * ts);
      }
      if (px1In) { const dx = DX0 + (px + 1) * ts + 2; drawVSeg(stripCIM, 14, 0, c, dx); drawVSeg(stripCIM, 14, d, ny, dx); }
      if (py1In) { const dy = DY0 + (py + 1) * ts + 2; drawHSeg(stripRIM, 14, 0, a, dy); drawHSeg(stripRIM, 14, b, nx, dy); }
      if (px1In && py1In) ctx.drawImage(imgMask, 2, 2, 14, 14, DX0 + (px + 1) * ts + 2, DY0 + (py + 1) * ts + 2, 14, 14);
      ctx.globalAlpha = xMaskA;
      for (const [k0, k1] of rowSegs) drawHSeg(stripCRM, 18, k0, k1, DY0 + py * ts);
      if (inRangePx) ctx.drawImage(imgMask, 0, 0, 16, 16, DX0 + px * ts, DY0 + py * ts, 16, 16);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      for (let i = 0; i < nx; i++) {
        if (i === px || i === px + 1) continue;
        drawVSeg(stripU, 16, 0, c, DX0 + i * ts);
        drawVSeg(stripU, 16, d, ny, DX0 + i * ts);
      }
      if (px1In) { const dx = DX0 + (px + 1) * ts + 2; drawVSeg(stripCI, 14, 0, c, dx); drawVSeg(stripCI, 14, d, ny, dx); }
      if (py1In) { const dy = DY0 + (py + 1) * ts + 2; drawHSeg(stripRI, 14, 0, a, dy); drawHSeg(stripRI, 14, b, nx, dy); }
      if (px1In && py1In) ctx.drawImage(img, 2, 2, 14, 14, DX0 + (px + 1) * ts + 2, DY0 + (py + 1) * ts + 2, 14, 14);
      for (const [k0, k1] of rowSegs) drawHSeg(stripCR, 18, k0, k1, DY0 + py * ts);
      if (inRangePx) ctx.drawImage(imgHi, 0, 0, 16, 16, DX0 + px * ts, DY0 + py * ts, 16, 16);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = xMaskA;
      for (const [l0, l1] of colSegsL) drawVSeg(stripCCM, 18, l0, l1, DX0 + px * ts);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      for (const [l0, l1] of colSegsL) drawVSeg(stripCC, 18, l0, l1, DX0 + px * ts);
      ctx.restore();
    }

    function diff(canA, canB) {
      const oA = canA.getContext('2d').getImageData(0, 0, canA.width, canA.height).data;
      const oB = canB.getContext('2d').getImageData(0, 0, canB.width, canB.height).data;
      let n = 0, maxd = 0; const samples = [];
      for (let i = 0; i < oA.length; i += 4) {
        const dd = Math.max(Math.abs(oA[i] - oB[i]), Math.abs(oA[i + 1] - oB[i + 1]), Math.abs(oA[i + 2] - oB[i + 2]));
        if (dd > 0) {
          n++; if (dd > maxd) maxd = dd;
          if (samples.length < 6) { const idx = i >> 2; samples.push({ x: idx % canA.width, y: (idx / canA.width) | 0, a: [oA[i], oA[i + 1], oA[i + 2]], b: [oB[i], oB[i + 1], oB[i + 2]] }); }
        }
      }
      return { n, maxd, samples };
    }
    const mk = (fill) => {
      const c = document.createElement('canvas');
      c.width = nx * ts + 40; c.height = ny * ts + 40;
      const o = c.getContext('2d');
      o.fillStyle = fill; o.fillRect(0, 0, c.width, c.height);
      return c;
    };
    const out = {};
    // ① 恒等变换 + 2px 平移（整数格相位,模拟 view 偏移）
    {
      const A = mk('rgb(100,110,120)'), B = mk('rgb(100,110,120)');
      const ctxA = A.getContext('2d'); ctxA.translate(2, 3); oldLoop(ctxA);
      const ctxB = B.getContext('2d'); ctxB.translate(2, 3); newStrip(ctxB);
      out.identity = diff(A, B);
    }
    // ② 分数相位（模拟非整数 zoom 相机）
    {
      const A = mk('rgb(100,110,120)'), B = mk('rgb(100,110,120)');
      const ctxA = A.getContext('2d'); ctxA.translate(2.4, 3.6); oldLoop(ctxA);
      const ctxB = B.getContext('2d'); ctxB.translate(2.4, 3.6); newStrip(ctxB);
      out.fractional = diff(A, B);
    }
    return out;
  }
  return new Promise((done) => {
    img0.onload = () => done(runTest(img0));
    img0.onerror = () => done({ err: 'template load fail' });
  });
});
console.log('IDENTITY:', JSON.stringify(res.identity, null, 1));
console.log('FRACTIONAL:', JSON.stringify(res.fractional, null, 1));
await browser.close();
