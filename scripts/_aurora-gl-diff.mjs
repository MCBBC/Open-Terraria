// 一次性:极光 GL 路径 vs CPU 字节码参考路径 逐像素对拍。
// 同一 AuroraSky 实例、同参各画一帧(GL 路径 → 强制 unavailable 走 CPU 兜底),
// 全帧 |Δ| 统计——GL 管线(顶点装配/GLSL 翻译)对 CPU 逐像素公式(已过 SM2 字节码
// 交叉对拍)的等价性验证。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

const out = await page.evaluate(async () => {
  const mod = await import('/src/render/AuroraSky.ts');
  const { AuroraSky, auroraNoiseReady } = mod;
  const sky = new AuroraSky();
  sky.setActive(true);
  sky.update(4); // opacity → 1
  const opts = {
    nightTicks: 6000, isDay: false, moonPhase: 0, globalTime: 123.4,
    camTopTiles: 0, surfaceTiles: 100, moonFrac: { x: 0.72, y: 0.18 }, dtSec: 0,
  };
  const W = 1920, H = 1080;
  // 首画一帧触发 ensureNoise(懒加载在 draw 内启动),再异步轮询等 Image load
  const warm = mk0();
  function mk0() {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 4;
    return cv.getContext('2d');
  }
  sky.draw(warm, 4, 4, opts);
  for (let i = 0; i < 100 && !auroraNoiseReady(); i++) await new Promise((r) => setTimeout(r, 50));
  const noiseReady = auroraNoiseReady();
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    return { cv, ctx };
  };
  const glReady = sky.glAurora.ready;
  // ---- GL 路径 ----
  const a = mk();
  sky.draw(a.ctx, W, H, opts);
  // ---- CPU 参考路径 ----
  sky.glAurora.unavailable = true;
  const b = mk();
  sky.draw(b.ctx, W, H, opts);
  const da = a.ctx.getImageData(0, 0, W, H).data;
  const db = b.ctx.getImageData(0, 0, W, H).data;
  let litGL = 0, litCPU = 0, onlyGL = 0, onlyCPU = 0, both = 0;
  let sumAbs = 0, maxAbs = 0, sumGL = 0, sumGLr = 0, sumGLg = 0, sumGLb = 0;
  for (let i = 0; i < da.length; i += 4) {
    const la = Math.max(da[i], da[i + 1], da[i + 2]);
    const lb = Math.max(db[i], db[i + 1], db[i + 2]);
    if (la > 2) {
      litGL++; sumGL += la; sumGLr += da[i]; sumGLg += da[i + 1]; sumGLb += da[i + 2];
    }
    if (lb > 2) litCPU++;
    if (la > 2 && lb <= 2) onlyGL++;
    if (lb > 2 && la <= 2) onlyCPU++;
    if (la > 2 && lb > 2) {
      both++;
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
      sumAbs += d;
      if (d > maxAbs) maxAbs = d;
    }
  }
  const pct = (n) => (n * 100 / (W * H)).toFixed(3) + '%';
  // ---- CPU 零输出定位:离屏缓冲/解释器/纯函数三层内省 ----
  let bandLit = -1, sm2Null = null, sm2Out = null, pureOut = null;
  try {
    const bc = sky.bandCanvas;
    if (bc) {
      const g2 = bc.getContext('2d');
      const dd = g2.getImageData(0, 0, Math.min(bc.width, 1920), Math.min(bc.height, 1080)).data;
      bandLit = 0;
      for (let i = 0; i < dd.length; i += 4) if (Math.max(dd[i], dd[i + 1], dd[i + 2]) > 2) bandLit++;
    }
    const fx = await import('/src/fx/SM2Effect.ts');
    const pass = fx.getPass('Aurora');
    sm2Null = pass === null;
    if (pass) {
      const u2 = fx.defaultUniforms();
      u2.uTime = 123.4;
      u2.uShaderSpecificData = [0, 0.5, 0, 0];
      const c2 = pass.setupConstants(u2);
      const regs = new Float64Array(128);
      const tex = new Float64Array(32); tex[2] = 30;
      const v0 = new Float64Array(8); v0[0] = 1; v0[1] = 0.6; v0[2] = 0.4; v0[3] = 1;
      const o2 = new Float64Array(4);
      const samplers = [
        (uu, vv) => [0.5, 0, 0, 1],
        (uu, vv) => [0.7, 0, 0, 1],
      ];
      sm2Out = pass.execPixel(c2, regs, tex, v0, o2, 0.5, 0.8, samplers);
    }
    pureOut = mod.auroraPixel(0.5, 0.5, 0.7, 0.8, 0, 0.5, 1, 0.6, 0.4);
  } catch (e) {
    sm2Out = 'THROW: ' + String(e).slice(0, 200);
  }
  return {
    noiseReady, glReady,
    bandLit, sm2Null, sm2Out, pureOut,
    litGL, litCPU, both,
    onlyGL: pct(onlyGL), onlyCPU: pct(onlyCPU),
    meanAbsDiff: both ? (sumAbs / both / 3).toFixed(2) : 'n/a',
    maxAbsDiff: maxAbs,
    glAvgRGB: litGL ? [Math.round(sumGLr / litGL), Math.round(sumGLg / litGL), Math.round(sumGLb / litGL)] : null,
    glAvgLum: litGL ? Math.round(sumGL / litGL) : 0,
  };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.slice(0, 8).join('\n'));
await browser.close();
