// BJ76:读游戏内 GLWaterDistortion 实例的 noise 纹理状态 + atlas 图源
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const ww = g.renderer.waterWarp;
  const gl = ww.gl;
  const atlas = g.renderer.atlas;
  const img = atlas?.ensureVImage?.('vanilla/Misc_noise.png');
  let stats = null;
  if (img && img.width > 0) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let mn = 255, mx = 0, sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const v = d[i]; mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; n++; }
    stats = { rMin: mn, rMax: mx, rMean: +(sum / n).toFixed(1) };
  }
  return {
    glExists: !!gl, noiseReady: gl?.noiseReady, noiseW: gl?.noiseW, noiseH: gl?.noiseH,
    canvasSize: gl ? [gl.canvas.width, gl.canvas.height] : null,
    imgSize: img ? [img.width, img.height] : null, imgType: img?.constructor?.name,
    stats,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
