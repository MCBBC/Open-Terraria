// ★perf-textbake 2026-09-19 落刀前定谳实验(铁律:先定谳,再动刀)。
// 问题:染色合成缓存(单张最终图 = tinted∘sil,单 blit)与旧「sil blit + tinted blit」
// 两 blit 在本机 Chrome 是否**逐像素相等**?
//   · pixel 档(12px binarize 0/255 + NN 放大):α∈{0,255} ⇒ 舍入消失,理论上恒等。
//   · hidpi 档(28px 灰度 AA + 线性采样 ÷2):两处机制性风险——
//     ① 8bit 舍入序:(T∘S)∘B 中间舍入 vs T∘(S∘B) 两次舍入(±1 LSB 域);
//     ② 采样/合成次序:先合成后线性采样 vs 先各自采样后合成(over 与 bilinear
//        不可交换,cross-term αT×αS 域)——旧路径两次 blit 各自采样各自合成,
//        新路径合成后再采样,非交换差可超 1 LSB。
// 本实验用真实 fillText 字形位图(与 MouseTextBake 同构)对拍两种渲染序,
// 全案例矩阵输出 maxΔ/ndiff。判据:pixel 档全 0 才允许合成缓存进 pixel 档;
// hidpi 档若非 0,合成缓存只进 pixel 档(或另择 tint 缓存设计)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 400, height: 300, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
await page.goto('about:blank');
const report = await page.evaluate(() => {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const cx = (c) => c.getContext('2d', { willReadFrequently: true });
  function binarize(cv) {
    const c = cx(cv); const img = c.getImageData(0, 0, cv.width, cv.height); const d = img.data;
    for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 128 ? 255 : 0;
    c.putImageData(img, 0, 0);
  }
  // 与 MouseTextBake.bake 同构的行烘焙(pixel=12px binarize ±1 环;hidpi=28px 灰度 ±4 环)
  function bakeLine(text, regime) {
    const bakePx = regime === 'hidpi' ? 28 : 12;
    const outline = regime === 'hidpi' ? 4 : 1;
    const font = `${bakePx}px monospace`;
    const mm = cx(mk(8, 8)); mm.font = font; mm.textBaseline = 'alphabetic';
    const met = mm.measureText(text);
    const w12 = met.width;
    const ascI = Math.ceil(met.actualBoundingBoxAscent || bakePx * 0.85);
    const descI = Math.ceil(met.actualBoundingBoxDescent || bakePx * 0.25);
    const padL = outline + 1;
    const w = Math.ceil(padL + w12 + outline + 1);
    const baseY = outline + 1 + ascI;
    const h = baseY + descI + outline + 1;
    const sil = mk(w, h); const sc = cx(sil);
    sc.font = font; sc.textBaseline = 'alphabetic'; sc.fillStyle = '#000';
    for (const [ox, oy] of [[outline, 0], [-outline, 0], [0, outline], [0, -outline]]) sc.fillText(text, padL + ox, baseY + oy);
    sc.fillText(text, padL, baseY);
    const mask = mk(w, h); const mc = cx(mask);
    mc.font = font; mc.textBaseline = 'alphabetic'; mc.fillStyle = '#fff'; mc.fillText(text, padL, baseY);
    if (regime === 'pixel') { binarize(sil); binarize(mask); }
    return { sil, mask, w, h };
  }
  // 与 MouseTextBake.tinted 同构(source-in 染色,写入指定画布)
  function tintInto(dst, mask, color) {
    const c = cx(dst);
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, dst.width, dst.height);
    c.drawImage(mask, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, dst.width, dst.height);
    c.globalCompositeOperation = 'source-over';
  }
  // 背景域:恒黑/恒白/中灰/横向渐变/棋盘/噪点(对抗 B 项舍入)
  function drawBg(c, kind, w, h) {
    if (kind === 'black') { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); return; }
    if (kind === 'white') { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); return; }
    if (kind === 'mid') { c.fillStyle = '#808080'; c.fillRect(0, 0, w, h); return; }
    if (kind === 'grad') {
      const g = c.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#808080'); g.addColorStop(1, '#102040');
      c.fillStyle = g; c.fillRect(0, 0, w, h); return;
    }
    if (kind === 'checker') {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        c.fillStyle = ((x >> 1) + (y >> 1)) & 1 ? '#f0f0f0' : '#303040';
        c.fillRect(x, y, 1, 1);
      }
      return;
    }
    // noise:伪随机灰度
    let s = 12345;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const v = (s >>> 16) & 255;
      c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, y, 1, 1);
    }
  }
  // 旧两 blit:sil blit → tinted(现场 scratch)blit
  function renderOld(main, bgKind, baked, color, o) {
    const c = cx(main);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    drawBg(c, bgKind, main.width, main.height);
    c.save();
    c.imageSmoothingEnabled = o.smoothing;
    if (o.alpha < 1) c.globalAlpha = o.alpha;
    c.drawImage(baked.sil, 0, 0, o.dw, o.dh);
    const s = mk(baked.w, baked.h);
    tintInto(s, baked.mask, color);
    c.drawImage(s, 0, 0, o.dw, o.dh);
    c.restore();
  }
  // 新单 blit:composed = tinted∘sil(destination-over)预合成 → 单 drawImage
  function compose(baked, color) {
    const comp = mk(baked.w, baked.h);
    tintInto(comp, baked.mask, color);
    const c = cx(comp);
    c.globalCompositeOperation = 'destination-over';
    c.drawImage(baked.sil, 0, 0);
    c.globalCompositeOperation = 'source-over';
    return comp;
  }
  function renderNew(main, bgKind, comp, o) {
    const c = cx(main);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    drawBg(c, bgKind, main.width, main.height);
    c.save();
    c.imageSmoothingEnabled = o.smoothing;
    if (o.alpha < 1) c.globalAlpha = o.alpha;
    c.drawImage(comp, 0, 0, o.dw, o.dh);
    c.restore();
  }
  function diff(a, b) {
    const da = cx(a).getImageData(0, 0, a.width, a.height).data;
    const db = cx(b).getImageData(0, 0, b.width, b.height).data;
    let maxD = 0, n = 0, sum = 0;
    for (let i = 0; i < da.length; i++) {
      const d = Math.abs(da[i] - db[i]);
      if (d > 0) { n++; sum += d; if (d > maxD) maxD = d; }
    }
    return { maxD, n };
  }
  const texts = ['附近无特殊植物', 'Depth 123 FT', '混排 CJK+EN 42'];
  const colors = ['#e8e4f0', '#FFE745', '#646464', 'rgb(207,207,207)'];
  const bgs = ['black', 'white', 'mid', 'grad', 'checker', 'noise'];
  const out = [];
  for (const regime of ['pixel', 'hidpi']) {
    const smoothing = regime === 'hidpi';
    for (const text of texts) {
      const baked = bakeLine(text, regime);
      // 尺度:hidpi = ÷2 盒滤波;pixel = ×1.167 NN(14/12 非整倍率)+ 钳制 ×0.7
      const k = regime === 'hidpi' ? 0.5 : 14 / 12;
      for (const [scaleX, scaleY] of [[1, 1], [0.7, 1], [0.5, 0.83]]) {
        const dw = Math.round(baked.w * k * scaleX * 100) / 100;
        const dh = Math.round(baked.h * k * scaleY * 100) / 100;
        for (const color of colors) {
          for (const alpha of [1, 0.34]) {
            const o = { smoothing, dw, dh, alpha };
            const comp = compose(baked, color);
            for (const bgKind of bgs) {
              const A = mk(300, 40); renderOld(A, bgKind, baked, color, o);
              const B = mk(300, 40); renderNew(B, bgKind, comp, o);
              const d = diff(A, B);
              out.push({ regime, text, color, alpha, scaleX, bgKind, ...d });
            }
          }
        }
      }
    }
  }
  // 汇总
  const sum = {};
  for (const r of out) {
    const kk = r.regime;
    sum[kk] ??= { cases: 0, maxD: 0, worst: null, totalDiffPx: 0 };
    sum[kk].cases++;
    sum[kk].totalDiffPx += r.n;
    if (r.maxD > sum[kk].maxD) { sum[kk].maxD = r.maxD; sum[kk].worst = r; }
  }
  return { summary: sum, worstByRegime: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v.worst])), nonZero: out.filter((r) => r.n > 0).slice(0, 40) };
});
console.log(JSON.stringify(report, (k, v) => (v > 2000000 ? 'big' : v), 1));
await browser.close();
