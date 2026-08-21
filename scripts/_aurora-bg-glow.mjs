// 一次性:极光→远景背景 渗入链数值验证。
// ① 纯链:setFrameAurora 有/无 时 colorOfTheSkies 输出差(夜/雪原/满月档);
// ② 量级:8% lerp 后背景 multiply tint 的绝对位移;
// ③ 地平线云链:updateCloudCelestial 的 uColor 极光渗入(经 SkyRenderer 私有方法
//   不可直调,改验其输入 aurora.tileColorState 的形状)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

const out = await page.evaluate(async () => {
  const sc = await import('/src/lighting/SkyColor.ts');
  const r = {};
  // 深夜档(原版夜 bgColor 曲线)+满月+雪原无群系影响
  const args = [0.95, 3, false, false, 0];
  sc.setFrameAurora(null);
  const base = sc.colorOfTheSkies(...args);
  // 典型极光 _lastSkyColor:hsl(0.33,1,0.5)≈绿 (64,191,64) 族;取 (0,255,64) 满饱和
  sc.setFrameAurora({ rgb: [0, 255, 64], opacity: 1, phase: 0 });
  const tinted = sc.colorOfTheSkies(...args);
  sc.setFrameAurora({ rgb: [0, 255, 64], opacity: 1, phase: 3 });  // QuarterAtLeft 门
  const gated = sc.colorOfTheSkies(...args);
  sc.setFrameAurora(null);
  r.base = base.map(Math.round);
  r.tinted = tinted.map(Math.round);
  r.gatedPhase3 = gated.map(Math.round);
  r.chainWorks = tinted.join() !== base.join();
  r.gateWorks = gated.join() === base.join();
  r.delta = tinted.map((v, i) => +(v - base[i]).toFixed(1));
  // 背景雪图乘 tint 后的观感位移(雪像素 ~200):tint/255 × 200
  r.snowPixelShift = tinted.map((v, i) => Math.round(200 * v / 255 - 200 * base[i] / 255));
  // tileColor 链(第二个导出,若同名函数族)
  r.hasTileColorFn = typeof sc.tileColor === 'function';
  return r;
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
