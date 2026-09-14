// BJ76 一次性诊断:composite 输入矩阵二分——找出哪个输入让 progress 响应归零
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
  const cv = [...document.querySelectorAll('canvas')].filter((c) => !c.classList.contains('sw-credits')).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const fg = r.waterWarp.gateCanvas();
  const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d')); return c; };
  const snap = () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c; };
  const stripes = (w, h) => mk(w, h, (x) => { for (let y = 0; y < h; y += 16) { x.fillStyle = (y / 16) % 2 ? '#fff' : '#000'; x.fillRect(0, y, w, 16); } });
  const fullWater = (w, h, a) => mk(w, h, (x) => { x.fillStyle = `rgba(0,0,255,${a})`; x.fillRect(0, 0, w, h); });
  const grab = (glw, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(glw.canvas, 0, 0);
    return x.getImageData(0, 0, w, h).data; };
  const diff = (s1, s2) => { let sum = 0, n = 0, mx = 0;
    for (let i = 0; i < s1.length; i += 4) { const d = Math.abs(s1[i] - s2[i]); sum += d; n++; if (d > mx) mx = d; }
    return { mean: +(sum / n).toFixed(2), max: mx }; };
  const run = (scene, water, w, h, gw, gh) => {
    const glw = new GLWaterDistortion();
    if (glw.unavailable) return { fail: 'unavailable' };
    const neutral = new Float32Array(gw * gh).fill(0.5);
    const ok1 = glw.composite(scene, water, noise, w, h, 1.0, 1.2, neutral, gw, gh);
    if (!ok1) return { fail: 'c1' };
    const s1 = grab(glw, w, h);
    const ok2 = glw.composite(scene, water, noise, w, h, 41.0, 1.2, neutral, gw, gh);
    if (!ok2) return { fail: 'c2' };
    const s2 = grab(glw, w, h);
    return diff(s1, s2);
  };
  return {
    a_stripes_full255_256: run(stripes(256, 256), fullWater(256, 256, 1), 256, 256, 64, 64),
    b_stripes_half05_256: run(stripes(256, 256), fullWater(256, 256, 0.5), 256, 256, 64, 64),
    c_stripes_full255_800: run(stripes(800, 520), fullWater(800, 520, 1), 800, 520, 200, 130),
    d_snap_full255_800: run(snap(), fullWater(800, 520, 1), 800, 520, 200, 130),
    e_snap_fgReal_800: run(snap(), fg, 800, 520, 200, 130),
    f_stripes_fgReal_256: run(stripes(256, 256), (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 256; c.getContext('2d').drawImage(fg, 0, 0, 256, 256); return c; })(), 256, 256, 64, 64),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
