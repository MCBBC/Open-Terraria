// BJ76 一次性诊断:模块级测试但喂【真 atlas 噪声图】(游戏管线同源)——
// 若位移=0 → 游戏噪声图源为平图;若位移≠0 → 游戏管线别处断链。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 400, height: 300 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const { GLWaterDistortion } = await import('/src/render/GLWaterDistortion.ts');
  const { ensureWaveTextures, waveTexReady } = await import('/src/render/WaterWaves.ts');
  // atlas 从哪拿?主流程挂 window?——从 game 实例拿（若在菜单则无 game）。
  // 备选:直接 fetch 图片。先试 window.__swGame?.atlas / flow
  const g = window.__swGame;
  const atlas = g?.renderer?.atlas ?? g?.atlas ?? null;
  let noiseImg = null;
  if (atlas?.ensureVImage) noiseImg = atlas.ensureVImage('vanilla/Misc_noise.png');
  // 探测图像内容
  let noiseStats = null;
  if (noiseImg) {
    const c = document.createElement('canvas');
    c.width = noiseImg.width; c.height = noiseImg.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(noiseImg, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let mn = 255, mx = 0, sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { const v = d[i]; mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; n++; }
    noiseStats = { w: c.width, h: c.height, rMin: mn, rMax: mx, rMean: +(sum / n).toFixed(1) };
  }
  const W = 256, H = 256;
  const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
  const sctx = scene.getContext('2d');
  for (let y = 0; y < H; y += 16) {
    sctx.fillStyle = (y / 16) % 2 ? '#ffffff' : '#000000';
    sctx.fillRect(0, y, W, 16);
  }
  const water = document.createElement('canvas'); water.width = W; water.height = H;
  water.getContext('2d').fillStyle = 'rgba(0,0,255,1)';
  water.getContext('2d').fillRect(0, 0, W, H);
  const gw = W / 4, gh = H / 4;
  const neutral = new Float32Array(gw * gh).fill(0.5);
  const glw = new GLWaterDistortion();
  if (glw.unavailable) return { fail: 'unavailable', noiseStats };
  const grab = () => {
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const x = c2.getContext('2d', { willReadFrequently: true });
    x.drawImage(glw.canvas, 0, 0);
    return x.getImageData(0, 0, W, H).data;
  };
  const ok1 = glw.composite(scene, water, noiseImg, W, H, 1.0, 1.5, neutral, gw, gh);
  if (!ok1) return { fail: 'composite1-false', hasAtlas: !!atlas, hasImg: !!noiseImg, noiseStats, imgW: noiseImg?.width, diedAt: glw.diedAt };
  const s1 = grab();
  const ok2 = glw.composite(scene, water, noiseImg, W, H, 41.0, 1.5, neutral, gw, gh);
  if (!ok2) return { fail: 'composite2-false', noiseStats };
  const s2 = grab();
  let sum = 0, n = 0, mx = 0;
  for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
    const o = (y * W + x) * 4;
    const d = Math.abs(s1[o] - s2[o]);
    sum += d; n++; if (d > mx) mx = d;
  }
  return { hasAtlas: !!atlas, hasImg: !!noiseImg, noiseStats,
    ok: [ok1, ok2], progDiff: { mean: +(sum / n).toFixed(3), max: mx } };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
