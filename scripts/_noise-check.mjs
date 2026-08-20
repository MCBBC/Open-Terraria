// 噪声采样幅度诊断:WaterWaves 噪声贴图提取 + gy 场幅度 vs 字节码期望(RMS≈0.2)
// 用法:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs --timeout=120000 scripts/_noise-check.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/noisechk2-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5204', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/render/WaterWaves.ts');
  // 贴图原尺寸(从 atlas)
  const img = g.renderer.atlas.ensureVImage('vanilla/Misc_noise.png');
  // sampleDisplace 的原始 n1/n2 重算(公式照抄 WaterWaves.sampleDisplace 内部)
  const cvs = document.createElement('canvas');
  cvs.width = img.width; cvs.height = img.height;
  const cc = cvs.getContext('2d');
  cc.drawImage(img, 0, 0);
  const nd = cc.getImageData(0, 0, cvs.width, cvs.height).data;
  const noiseAt = (ch, u, v) => {
    const w = cvs.width, h = cvs.height;
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    const xa = ((x0 % w) + w) % w, ya = ((y0 % h) + h) % h;
    const x1 = (xa + 1) % w, y1 = (ya + 1) % h;
    const i00 = (ya * w + xa) * 4 + ch, i10 = (ya * w + x1) * 4 + ch;
    const i01 = (y1 * w + xa) * 4 + ch, i11 = (y1 * w + x1) * 4 + ch;
    return ((nd[i00] * (1 - fx) + nd[i10] * fx) * (1 - fy) + (nd[i01] * (1 - fx) + nd[i11] * fx) * fy) / 255;
  };
  // 模拟 sampleDisplace 的 gy(u·0.1 带 prog 漂移 vs u·0.2 反漂移)在屏幕 40×20 网格上的分布
  const W = cvs.width, H = cvs.height;
  const gys = [], gxs = [];
  for (let sy = 0; sy < 20; sy++) for (let sx = 0; sx < 40; sx++) {
    const px = sx * 38, py = sy * 43;             // 屏幕像素
    const u = px / 256, v = py / 256;
    const prog = 10;
    const d1v = v * 0.1 + prog * 0.04;
    const gx = noiseAt(0, u * 0.1, d1v) - noiseAt(0, u * 0.2, v * 0.2 - prog * 0.04);
    const gy = noiseAt(1, u * 0.1, d1v) - noiseAt(1, u * 0.2, v * 0.2 - prog * 0.04);
    gxs.push(gx); gys.push(gy);
  }
  const stat = (a) => {
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
    return { mean: +mean.toFixed(4), sd: +sd.toFixed(4), min: +Math.min(...a).toFixed(3), max: +Math.max(...a).toFixed(3) };
  };
  return {
    imgW: img.width, imgH: img.height,
    gx: stat(gxs), gy: stat(gys),
    debug: m.waterWaves.debug(),
    // 原始单点采样噪声分布(无插值,texel 中心)
    rawG: stat(Array.from({ length: 64 }, (_, i) => nd[((i * 37) % 256) * 256 * 4 % (256 * 256 * 4) + 1] / 255)),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
