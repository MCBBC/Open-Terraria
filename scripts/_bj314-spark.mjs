// BJ314 sparkle 微分解：4-stroke 序列（resize vs grow-only vs GPU 面 vs 免 scratch 直绘）
// 在真实 worldCtx（暂停态空闲面）上的 JS 侧时长。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 640, height: 480 } });
const page = await browser.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await page.evaluate(async () => {
  const rr = await import('/src/render/Renderer.ts');
  const img = rr.loadExtraSprite(98);
  for (let i = 0; i < 300 && !(img && img.width > 0); i++) await new Promise((r) => setTimeout(r, 100));
  if (!img || img.width <= 0) return { error: 'extra98 not loaded' };
  const g = window.__swGame;
  const wctx = g?.renderer?.worldCtxLayer ?? (() => {
    const cv = document.createElement('canvas');
    cv.width = 1280; cv.height = 800;
    return cv.getContext('2d', { willReadFrequently: true });
  })();
  // 972 调用参数（num=0.5, op=1）
  const num = 0.5;
  const v1x = 1 * 0.5 * num, v1y = 2 * num, v2x = 1 * 0.5 * num, v2y = 1 * num;
  const strokes = [
    { rot: Math.PI / 2 + 0.78, sw: v1x, sh: v1y, a: 0.25 },
    { rot: 0.78, sw: v2x, sh: v2y, a: 0.25 },
    { rot: Math.PI / 2 + 0.78, sw: v1x * 0.6, sh: v1y * 0.6, a: 0.25 },
    { rot: 0.78, sw: v2x * 0.6, sh: v2y * 0.6, a: 0.25 },
  ];
  const mkRun = (makeScratch, useScratch) => () => {
    const sbuf = makeScratch();
    for (const s of strokes) {
      const tw = img.width, th = img.height;
      const w = Math.max(1, Math.round(tw * s.sw)), h = Math.max(1, Math.round(th * s.sh));
      if (useScratch) {
        if (sbuf.width !== w || sbuf.height !== h) { sbuf.width = w; sbuf.height = h; }
        const bc = sbuf.getContext('2d');
        bc.clearRect(0, 0, w, h);
        bc.imageSmoothingEnabled = false;
        bc.drawImage(img, 0, 0, w, h);
        wctx.save();
        wctx.globalCompositeOperation = 'lighter';
        wctx.globalAlpha = s.a;
        wctx.translate(300, 200);
        wctx.rotate(s.rot);
        wctx.drawImage(sbuf, -w / 2, -h / 2);
        wctx.restore();
      } else {
        wctx.save();
        wctx.globalCompositeOperation = 'lighter';
        wctx.globalAlpha = s.a;
        wctx.translate(300, 200);
        wctx.rotate(s.rot);
        wctx.drawImage(img, -w / 2, -h / 2, w, h);
        wctx.restore();
      }
    }
  };
  const bench = (fn, iters) => {
    fn();
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) fn();
    return +((performance.now() - t0) / iters * 1000).toFixed(1);   // µs
  };
  const cpuSb = document.createElement('canvas');
  const gpuSb = document.createElement('canvas');
  const growSb = document.createElement('canvas');
  growSb.width = 256; growSb.height = 256;
  return {
    v1_resize_cpu: bench(mkRun(() => cpuSb, true), 300),
    v3_resize_gpu: bench(mkRun(() => gpuSb, true), 300),
    v2_growonly_cpu: bench(() => {
      for (const s of strokes) {
        const w = Math.max(1, Math.round(img.width * s.sw)), h = Math.max(1, Math.round(img.height * s.sh));
        const bc = growSb.getContext('2d', { willReadFrequently: true });
        bc.clearRect(0, 0, w, h);
        bc.imageSmoothingEnabled = false;
        bc.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
        wctx.save();
        wctx.globalCompositeOperation = 'lighter';
        wctx.globalAlpha = s.a;
        wctx.translate(300, 200);
        wctx.rotate(s.rot);
        wctx.drawImage(growSb, 0, 0, w, h, -w / 2, -h / 2, w, h);
        wctx.restore();
      }
    }, 300),
    v4_noscratch: bench(mkRun(() => null, false), 300),
    worldCtxIsCpu: !!(g && g.renderer && g.renderer.worldCtxLayer),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
