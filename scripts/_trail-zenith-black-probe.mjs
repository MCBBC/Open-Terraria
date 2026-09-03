// 天顶剑拖尾黑 texel 修复验证（2026-09-03 用户实报"拖尾变黑不透明"）。
// FinalFractal（obj58）在 ?trailgl=0 强制 CPU 退化路径下离屏画带 →
// 统计 (rgb 全 0 && a>0) 像素数：修复前=黑块来源（>0），修复后=0。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&trailgl=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { drawStripTrail, prewarmTrailTextures } = await import('/src/fx/TrailShader.ts');
  prewarmTrailTextures(g.renderer.atlas);
  await new Promise(r => setTimeout(r, 800));
  const off = document.createElement('canvas');
  off.width = 640; off.height = 200;
  const octx = off.getContext('2d', { willReadFrequently: true });
  const pts = Array.from({ length: 12 }, (_, i) => ({
    x: 60 + i * 46, y: 100, hw: 12,
    r: 0.9, g: 0.75, b: 0.4, a: 0.5, rot: 0,
  }));
  const ok = drawStripTrail(octx, g.renderer, { set: 'FinalFractal', pts, opacity: 1, time: 1.25 });
  const img = octx.getImageData(0, 0, 640, 200).data;
  let blackOpaque = 0, lit = 0;
  for (let i = 0; i < img.length; i += 4) {
    const rgb0 = img[i] === 0 && img[i + 1] === 0 && img[i + 2] === 0;
    if (rgb0 && img[i + 3] > 0) blackOpaque++;       // 黑 texel 被写（修复前黑块来源）
    if (img[i] + img[i + 1] + img[i + 2] > 30) lit++;
  }
  // 顶点带几何内的已写像素总数（a>0）
  let written = 0;
  for (let i = 3; i < img.length; i += 4) if (img[i] > 0) written++;
  return { ok, blackOpaque, lit, written };
});
console.log(JSON.stringify(out));
await browser.close();
