// BJ76 一次性诊断:GLWaterDistortion 模块级合成输入测试（脱离游戏管线）。
// 场景=竖条纹;水 α=全 1;波场:中性(0.5) vs 极性(1.0→dispy=−9.6px)。
// 若模块正常:极性波场下条纹位移 ~10px 显著可测;progress 改写也应改变条纹相位。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 400, height: 300 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => console.log('LOG:', m.text().slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
// 不进游戏——只要 atlas 就绪:直接用 __swFlow 的预载?此处手工造 noise 贴图
const out = await page.evaluate(async () => {
  const { GLWaterDistortion } = await import('/src/render/GLWaterDistortion.ts');
  const W = 256, H = 256;
  // 合成噪声 64×64 高频噪声（每 texel 随机）—CanvasTexture
  const nc = document.createElement('canvas'); nc.width = 64; nc.height = 64;
  const nctx = nc.getContext('2d');
  const id = nctx.createImageData(64, 64);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 64 * 64; i++) {
    id.data[i * 4] = rnd() * 255; id.data[i * 4 + 1] = rnd() * 255;
    id.data[i * 4 + 2] = rnd() * 255; id.data[i * 4 + 3] = 255;
  }
  nctx.putImageData(id, 0, 0);
  // 场景:8px 竖条纹（强 1px 结构）
  const scene = document.createElement('canvas'); scene.width = W; scene.height = H;
  const sctx = scene.getContext('2d');
  for (let x = 0; x < W; x += 16) {
    sctx.fillStyle = (x / 16) % 2 ? '#ffffff' : '#000000';
    sctx.fillRect(x, 0, 16, H);
  }
  // 水:全 1 α
  const water = document.createElement('canvas'); water.width = W; water.height = H;
  const wctx = water.getContext('2d');
  wctx.fillStyle = 'rgba(0,0,255,1)';
  wctx.fillRect(0, 0, W, H);
  // 波场:64×64 网格（屏 1/4）
  const gw = W / 4, gh = H / 4;
  const neutral = new Float32Array(gw * gh).fill(0.5);
  const polar = new Float32Array(gw * gh).fill(1.0);   // h−0.5=0.5→clamp 0.3→dispy=−9.6px

  const glw = new GLWaterDistortion();
  if (glw.unavailable) return { fail: 'unavailable' };
  const grab = () => {
    const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
    const x = c2.getContext('2d', { willReadFrequently: true });
    x.drawImage(glw.canvas, 0, 0);
    return x.getImageData(0, 0, W, H).data;
  };
  const rowDiff = (d1, d2) => {
    let sum = 0, n = 0, mx = 0;
    for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
      const o = (y * W + x) * 4;
      const d = Math.abs(d1[o] - d2[o]);
      sum += d; n++; if (d > mx) mx = d;
    }
    return { mean: +(sum / n).toFixed(3), max: mx };
  };
  const ok1 = glw.composite(scene, water, nc, W, H, 1.0, 1.5, neutral, gw, gh);
  const neutralShot = grab();
  const ok2 = glw.composite(scene, water, nc, W, H, 1.0, 1.5, polar, gw, gh);
  const polarShot = grab();
  const ok3 = glw.composite(scene, water, nc, W, H, 41.0, 1.5, neutral, gw, gh);
  const progShot = grab();
  // 极性波场下的位移方向测量:条纹边界位移(比较 polar vs neutral 在垂直方向的相关)
  const shiftDetect = (dRef, dTest) => {
    // 对每一行找白条纹左边界位置,统计平均边界 y 偏移 → 简化:整体行相关在 dy=−10..10 找 min
    let best = null;
    for (let dy = -12; dy <= 12; dy++) {
      let sum = 0, n = 0;
      for (let y = 20; y < H - 20; y++) for (let x = 20; x < W - 20; x++) {
        const ya = y + dy; if (ya < 0 || ya >= H) continue;
        const o1 = (y * W + x) * 4, o2 = (ya * W + x) * 4;
        sum += Math.abs(dRef[o1] - dTest[o2]); n++;
      }
      const m = sum / n;
      if (!best || m < best.m) best = { dy, m: +m.toFixed(2) };
    }
    return best;
  };
  return {
    ok: [ok1, ok2, ok3],
    unavailable: glw.unavailable, diedAt: glw.diedAt,
    polarVsNeutral: rowDiff(neutralShot, polarShot),
    progVsBase: rowDiff(neutralShot, progShot),
    bestShiftPolar: shiftDetect(neutralShot, polarShot),
    bestShiftProg: shiftDetect(neutralShot, progShot),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
