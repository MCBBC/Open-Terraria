// BJ314 落刀偏差定量：现模块路径（CPU 面缓存烘焙）vs 落刀前原始配方（GPU 面 scratch
// 现烘）逐像素差分——确认漂移纯源=烘焙面 GPU/CPU 舍入（±1/255 级）且无结构差。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 640, height: 480 } });
const page = await browser.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await page.evaluate(async () => {
  const { projSprite } = await import('/src/entities/Arrow.ts');
  for (let i = 0; i < 300; i++) {
    const img = projSprite(972);
    if (img && img.width > 0) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const img = projSprite(972);
  const arcMod = await import('/src/entities/SwingArc.ts');
  const W = 400;
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = W;
    return cv.getContext('2d', { willReadFrequently: true });
  };
  // ---- 落刀前原始配方逐字复刻（GPU scratch + 每层现烘）----
  const oldScratch = document.createElement('canvas');
  oldScratch.width = img.width; oldScratch.height = img.height / 4;
  const os = oldScratch.getContext('2d');
  const fw = img.width, fh = img.height / 4;
  const oldTinted = (frame, rgb) => {
    os.globalCompositeOperation = 'source-over';
    os.clearRect(0, 0, fw, fh);
    os.imageSmoothingEnabled = false;
    os.drawImage(img, 0, frame * fh, fw, fh, 0, 0, fw, fh);
    os.globalCompositeOperation = 'multiply';
    os.fillStyle = `rgb(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0})`;
    os.fillRect(0, 0, fw, fh);
    os.globalCompositeOperation = 'destination-in';
    os.drawImage(img, 0, frame * fh, fw, fh, 0, 0, fw, fh);
    os.globalCompositeOperation = 'source-over';
    return oldScratch;
  };
  const drawOld = (ctx, cx, cy, rot, ai0, sc, layers) => {
    ctx.imageSmoothingEnabled = false;
    for (const l of layers) {
      if (l.alpha < 0.004) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, l.alpha));
      ctx.translate(cx, cy);
      ctx.rotate(rot + l.rotAi * ai0 + l.rotAbs);
      if (ai0 < 0) ctx.scale(1, -1);
      const dw = fw * l.scale * sc, dh = fh * l.scale * sc;
      const t = oldTinted(l.frame, l.rgb);
      ctx.drawImage(t, 0, 0, fw, fh, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  };
  const compare = (label, layers, rot, ai0) => {
    const a = mk(), b = mk();
    drawOld(a, 200, 200, rot, ai0, 1.1, layers);
    arcMod.drawArcLayers(b, img, 200, 200, rot, ai0, 1.1, layers);
    const da = a.getImageData(0, 0, W, W).data, db = b.getImageData(0, 0, W, W).data;
    let maxD = 0, diffPx = 0, sumD = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
      if (d > 0) { diffPx++; sumD += d; if (d > maxD) maxD = d; }
    }
    return { label, diffPx, maxDelta: maxD, avgDelta: diffPx ? +(sumD / diffPx).toFixed(2) : 0 };
  };
  return [
    compare('arc972-mid', arcMod.arcLayerList(972, 0.4, 1, 0.8), 0.7, 1),
    compare('arc972-late', arcMod.arcLayerList(972, 0.85, 1, 0.62), 2.2, 1),
    compare('tne-ghost', arcMod.tneGhostLayers(0.6, 0.5, 0.8, 0.7), 1.1, 1),
    compare('arc984-mid', arcMod.arcLayerList(984, 0.4, 0.6, 0.8), 0.7, 1),
  ];
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
