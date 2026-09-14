// BJ76 一次性诊断:页内复刻游戏 composite 调用(真 fg 水层/真噪声/真网格 200×130)
// progress 1 vs 41 → 差分;同时读游戏实例噪声态。
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
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const { GLWaterDistortion } = await import('/src/render/GLWaterDistortion.ts');
  const noise = r.atlas.ensureVImage('vanilla/Misc_noise.png');
  // 主画布快照当场景
  const cv = [...document.querySelectorAll('canvas')].filter((c) => !c.classList.contains('sw-credits')).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const snap = () => {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    return c;
  };
  const fg = r.waterWarp.gateCanvas();
  const W = cv.width, H = cv.height;
  const gw = r.waterWarp.gl ? 200 : 200, gh = 130;
  const neutral = new Float32Array(gw * gh).fill(0.5);
  const gl2 = new GLWaterDistortion();
  if (gl2.unavailable) return { fail: 'unavailable' };
  const scene1 = snap();
  const ok1 = gl2.composite(scene1, fg, noise, W, H, 1.0, 1.2, neutral, gw, gh);
  const s1 = ok1 ? (() => { const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(gl2.canvas, 0, 0);
    return x.getImageData(0, 0, W, H).data; })() : null;
  const ok2 = gl2.composite(scene1, fg, noise, W, H, 41.0, 1.2, neutral, gw, gh);
  const s2 = ok2 ? (() => { const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(gl2.canvas, 0, 0);
    return x.getImageData(0, 0, W, H).data; })() : null;
  let diff = null;
  if (s1 && s2) {
    let sum = 0, n = 0, mx = 0;
    for (let i = 0; i < s1.length; i += 4) {
      const d = Math.abs(s1[i] - s2[i]);
      sum += d; n++; if (d > mx) mx = d;
    }
    diff = { mean: +(sum / n).toFixed(3), max: mx };
  }
  return {
    ok: [ok1, ok2], diff,
    fgSize: fg ? [fg.width, fg.height] : null, noiseSize: noise ? [noise.width, noise.height] : null,
    gameGl: r.waterWarp.gl ? { noiseReady: r.waterWarp.gl.noiseReady, noiseW: r.waterWarp.gl.noiseW,
      canvas: [r.waterWarp.gl.canvas.width, r.waterWarp.gl.canvas.height] } : null,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
