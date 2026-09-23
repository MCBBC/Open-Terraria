import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 640, height: 480 } });
const page = await browser.newPage();
await page.goto('http://localhost:5201/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await page.evaluate(async () => {
  const rr = await import('/src/render/Renderer.ts');
  const img = rr.loadExtraSprite(98);
  for (let i = 0; i < 300 && !(img && img.width > 0); i++) await new Promise((r) => setTimeout(r, 100));
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 800;
  const wctx = cv.getContext('2d', { willReadFrequently: true });
  const num = 0.5;
  const strokes = [
    { rot: Math.PI / 2 + 0.78, sw: 1 * 0.5 * num, sh: 2 * num, a: 0.25 },
    { rot: 0.78, sw: 1 * 0.5 * num, sh: 1 * num, a: 0.25 },
    { rot: Math.PI / 2 + 0.78, sw: 0.3, sh: 0.6, a: 0.25 },
    { rot: 0.78, sw: 0.3, sh: 0.3, a: 0.25 },
  ];
  const bench = (fn, iters) => { fn(); const t0 = performance.now(); for (let i = 0; i < iters; i++) fn(); return +((performance.now() - t0) / iters * 1000).toFixed(1); };
  // W1: resize 每笔（现行）
  const sb1 = document.createElement('canvas');
  const w1 = bench(() => {
    for (const s of strokes) {
      const w = Math.max(1, Math.round(img.width * s.sw)), h = Math.max(1, Math.round(img.height * s.sh));
      if (sb1.width !== w || sb1.height !== h) { sb1.width = w; sb1.height = h; }
      const bc = sb1.getContext('2d');
      bc.clearRect(0, 0, w, h);
      bc.imageSmoothingEnabled = false;
      bc.drawImage(img, 0, 0, w, h);
      wctx.save(); wctx.globalCompositeOperation = 'lighter'; wctx.globalAlpha = s.a;
      wctx.translate(300, 200); wctx.rotate(s.rot);
      wctx.drawImage(sb1, -w / 2, -h / 2);
      wctx.restore();
    }
  }, 500);
  // W2: 固定 256² + 子矩形进出（getContext 提外）
  const sb2 = document.createElement('canvas');
  sb2.width = 256; sb2.height = 256;
  const bc2 = sb2.getContext('2d', { willReadFrequently: true });
  const w2 = bench(() => {
    for (const s of strokes) {
      const w = Math.max(1, Math.round(img.width * s.sw)), h = Math.max(1, Math.round(img.height * s.sh));
      bc2.clearRect(0, 0, w, h);
      bc2.imageSmoothingEnabled = false;
      bc2.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
      wctx.save(); wctx.globalCompositeOperation = 'lighter'; wctx.globalAlpha = s.a;
      wctx.translate(300, 200); wctx.rotate(s.rot);
      wctx.drawImage(sb2, 0, 0, w, h, -w / 2, -h / 2, w, h);
      wctx.restore();
    }
  }, 500);
  // W3: 固定 256² + GPU 面
  const sb3 = document.createElement('canvas');
  sb3.width = 256; sb3.height = 256;
  const bc3 = sb3.getContext('2d');
  const w3 = bench(() => {
    for (const s of strokes) {
      const w = Math.max(1, Math.round(img.width * s.sw)), h = Math.max(1, Math.round(img.height * s.sh));
      bc3.clearRect(0, 0, w, h);
      bc3.imageSmoothingEnabled = false;
      bc3.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
      wctx.save(); wctx.globalCompositeOperation = 'lighter'; wctx.globalAlpha = s.a;
      wctx.translate(300, 200); wctx.rotate(s.rot);
      wctx.drawImage(sb3, 0, 0, w, h, -w / 2, -h / 2, w, h);
      wctx.restore();
    }
  }, 500);
  return { w1_resize_cpu_us: w1, w2_fixed_cpu_us: w2, w3_fixed_gpu_us: w3 };
});
console.log(JSON.stringify(out));
await browser.close();
process.exit(0);
