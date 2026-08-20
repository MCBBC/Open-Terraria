// 一次性:Aurora 像素公式微基准拆分(pow / 双线性采样 / 强度链)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const out = await page.evaluate(async () => {
  const N = 1_000_000;
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = (i % 1000) / 1000;
  const bench = (name, f) => {
    for (let i = 0; i < N; i++) f(x[i], x[(i + 7) % N]);    // 预热
    const t = performance.now();
    let acc = 0;
    for (let i = 0; i < N; i++) acc += f(x[i], x[(i + 7) % N]);
    const ms = performance.now() - t;
    return { ns: +(ms * 1e6 / N).toFixed(2), acc: +(acc % 1).toFixed(6) };
  };
  const P = 1.2000000476837158;
  const r = {};
  r.pow = bench('pow', (a) => Math.pow(a, P));
  r.sqrtDiv = bench('div', (a, b) => a / b + Math.sqrt(a));
  r.bilerp1 = bench('bilerp', (a, b) => {
    const xx = a * 256 - 0.5, yy = b * 256 - 0.5;
    const x0 = Math.floor(xx), y0 = Math.floor(yy);
    const fx = xx - x0, fy = yy - y0;
    return x0 & 255 ? fx + fy : fx - fy;     // 假读(同型算术,无数组)
  });
  const t286 = new Float32Array(256 * 256);
  for (let i = 0; i < t286.length; i++) t286[i] = (i % 251) / 251;
  r.bilerpTex = bench('bilerpTex', (a, b) => {
    const xx = a * 256 - 0.5, yy = b * 256 - 0.5;
    const x0 = Math.floor(xx), y0 = Math.floor(yy);
    const fx = xx - x0, fy = yy - y0;
    const xa = x0 & 255, xb = (x0 + 1) & 255, ya = y0 & 255, yb = (y0 + 1) & 255;
    const aa = t286[ya * 256 + xa], bb = t286[ya * 256 + xb];
    const cc = t286[yb * 256 + xa], dd = t286[yb * 256 + xb];
    const top = aa + (bb - aa) * fx, bot = cc + (dd - cc) * fx;
    return top + (bot - top) * fy;
  });
  const NZ = 0.699999988079071, A01 = 0.10000000149011612, M09 = 0.8999999761581421, A03 = 0.30000001192092896, M07 = 0.699999988079071;
  const inten = (n1, n2, n3, grad, sdY) => {
    const a = NZ * (n1 * n1 * n1) * -1 + 1;
    const f1 = grad + A01;
    const b = f1 + (1 - f1) * a;
    const b2 = sdY * (1 - b) + b;
    const f2 = grad * sdY;
    const c = f2 + (1 - f2) * b2;
    const t15 = A01 + M09 * c;
    const n2sq = n2 * n2;
    const d = n2sq * -n2sq + 1;
    const e = d > 0 ? d : 0;
    const ff = sdY * (1 - e) + e;
    const g = f2 + (1 - f2) * ff;
    const t16 = A03 + M07 * g;
    return (t15 * t16) * ((grad * 3) * Math.pow(n3, P));
  };
  r.intenChain = bench('inten', (a, b) => inten(a, b, a * 0.5 + 0.25, 0.5, 0.6));
  r.intenNoPow = bench('intenNoPow', (a, b) => { const v = inten(a, b, 0.5, 0.5, 0.6); return v; });
  // LUT pow 对照(4096 档)
  const LUT = new Float64Array(4097);
  for (let i = 0; i <= 4096; i++) LUT[i] = Math.pow(i / 4096, P);
  r.powLUT = bench('powLUT', (a) => {
    const p = a * 4096, i = p | 0, fr = p - i;
    return LUT[i] + (LUT[i + 1] - LUT[i]) * fr;
  });
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
