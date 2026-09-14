// BJ76 一次性诊断:波场项死因隔离——平噪+棋盘波场;FRAG 源回显
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
const out = await page.evaluate(async () => {
  const { GLWaterDistortion } = await import('/src/render/GLWaterDistortion.ts');
  const W = 256, H = 256;
  // 平噪（恒 0.5 灰）→ gy 恒 0 → 位移只来自波场项
  const nc = document.createElement('canvas'); nc.width = 8; nc.height = 8;
  const nctx = nc.getContext('2d');
  nctx.fillStyle = '#808080'; nctx.fillRect(0, 0, 8, 8);
  const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
  const sctx = scene.getContext('2d');
  for (let y = 0; y < H; y += 16) {
    sctx.fillStyle = (y / 16) % 2 ? '#ffffff' : '#000000';
    sctx.fillRect(0, y, W, 16);   // 横条纹（垂直位移可感）
  }
  const water = document.createElement('canvas'); water.width = W; water.height = H;
  water.getContext('2d').fillStyle = 'rgba(0,0,255,1)';
  water.getContext('2d').fillRect(0, 0, W, H);
  const gw = W / 4, gh = H / 4;
  const neutral = new Float32Array(gw * gh).fill(0.5);
  // 波场棋盘:左半 1.0(强下沉)右半 0.5(中性)——若波场活,左右位移不同
  const cb = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) cb[y * gw + x] = x < gw / 2 ? 1.0 : 0.5;

  const glw = new GLWaterDistortion();
  if (glw.unavailable) return { fail: 'unavailable' };
  const grab = () => {
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const x = c2.getContext('2d', { willReadFrequently: true });
    x.drawImage(glw.canvas, 0, 0);
    return x.getImageData(0, 0, W, H).data;
  };
  const okN = glw.composite(scene, water, nc, W, H, 1.0, 1.5, neutral, gw, gh);
  const nShot = grab();
  const okC = glw.composite(scene, water, nc, W, H, 1.0, 1.5, cb, gw, gh);
  const cShot = grab();
  // 左半/右半行差分(横向条纹在垂直位移下不变!——改用竖条纹场景测垂直位移)
  // → 重画场景为竖条纹
  const sceneV = document.createElement('canvas'); sceneV.width = W; sceneV.height = H;
  const vctx = sceneV.getContext('2d');
  for (let x = 0; x < W; x += 16) {
    vctx.fillStyle = (x / 16) % 2 ? '#ffffff' : '#000000';
    vctx.fillRect(x, 0, 16, H);
  }
  const okN2 = glw.composite(sceneV, water, nc, W, H, 1.0, 1.5, neutral, gw, gh);
  const n2Shot = grab();
  const okC2 = glw.composite(sceneV, water, nc, W, H, 1.0, 1.5, cb, gw, gh);
  const c2Shot = grab();
  const colDiff = (d1, d2, x0, x1) => {
    let sum = 0, n = 0, mx = 0;
    for (let y = 8; y < H - 8; y++) for (let x = x0; x < x1; x++) {
      const o = (y * W + x) * 4;
      const d = Math.abs(d1[o] - d2[o]);
      sum += d; n++; if (d > mx) mx = d;
    }
    return { mean: +(sum / n).toFixed(3), max: mx };
  };
  return {
    ok: [okN, okC, okN2, okC2],
    // 横条纹场景(垂直位移可感): 左半(波=1.0) vs 右半(波=0.5) 的 neutral-vs-cb 差
    leftDiff: colDiff(nShot, cShot, 8, W / 2 - 8),
    rightDiff: colDiff(nShot, cShot, W / 2 + 8, W - 8),
    // 竖条纹场景(水平位移可感——波场只产垂直位移,应≈0 差)
    leftDiffV: colDiff(n2Shot, c2Shot, 8, W / 2 - 8),
    rightDiffV: colDiff(n2Shot, c2Shot, W / 2 + 8, W - 8),
    fragHead: GLWaterDistortion.FRAG.slice(0, 120),
    fragHasWave: GLWaterDistortion.FRAG.includes('uWaveSize'),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
