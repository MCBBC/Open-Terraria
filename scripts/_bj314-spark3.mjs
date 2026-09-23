// BJ314 sparkle 终形态基准：拉伸缓存（CPU 面精确尺寸,5 参拉伸入 + 3 参 1:1 出）。
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
    { rot: Math.PI / 2 + 0.78, sw: 0.25, sh: 1, a: 0.25 },
    { rot: 0.78, sw: 0.25, sh: 0.5, a: 0.25 },
    { rot: Math.PI / 2 + 0.78, sw: 0.15, sh: 0.6, a: 0.25 },
    { rot: 0.78, sw: 0.15, sh: 0.3, a: 0.25 },
  ];
  const bench = (fn, iters) => { fn(); const t0 = performance.now(); for (let i = 0; i < iters; i++) fn(); return +((performance.now() - t0) / iters * 1000).toFixed(1); };
  const cache = new Map();
  const bakeCount = { n: 0 };
  const getOrBake = (w, h) => {
    const key = `${w}x${h}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0, img.width, img.height, 0, 0, w, h);
    bakeCount.n++;
    cache.set(key, c);
    return c;
  };
  // 终形态：miss 率 100%（尺寸每帧漂移=最坏面）
  const t1 = bench(() => {
    for (const s of strokes) {
      const w = Math.max(1, Math.round(img.width * s.sw)) + (bakeCount.n % 3), h = Math.max(1, Math.round(img.height * s.sh)) + (bakeCount.n % 2);
      const tex = getOrBake(w, h);
      wctx.save(); wctx.globalCompositeOperation = 'lighter'; wctx.globalAlpha = s.a;
      wctx.translate(300, 200); wctx.rotate(s.rot);
      wctx.drawImage(tex, -w / 2, -h / 2);
      wctx.restore();
    }
  }, 500);
  // 稳态：命中 100%
  const t2 = bench(() => {
    for (const s of strokes) {
      const w = Math.max(1, Math.round(img.width * s.sw)), h = Math.max(1, Math.round(img.height * s.sh));
      const tex = getOrBake(w, h);
      wctx.save(); wctx.globalCompositeOperation = 'lighter'; wctx.globalAlpha = s.a;
      wctx.translate(300, 200); wctx.rotate(s.rot);
      wctx.drawImage(tex, -w / 2, -h / 2);
      wctx.restore();
    }
  }, 500);
  return { allMiss_us: t1, allHit_us: t2, baked: bakeCount.n, cacheSize: cache.size };
});
console.log(JSON.stringify(out));
await browser.close();
process.exit(0);
