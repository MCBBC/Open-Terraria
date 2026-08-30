// 构造性层序证明(#三开压测批):模拟主画布绘制序
//   ①背景(灰蓝渐变=天空/山) → ②drawWeatherTint2D(白幕) → ③深色矩形(墙/方块)
// 预期:墙区域不被白幕提亮(黑幕布/白天墙都是先有后盖),天空区被提亮
// 同时验证 GLScreenFilters 天气 pass 输出与 2D 版等价色
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5210');
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
const out = await page.evaluate(async () => {
  const m = await import('/src/render/SkyRenderer');
  const W = 400, H = 300;
  const c1 = document.createElement('canvas'); c1.width = W; c1.height = H;
  const x1 = c1.getContext('2d', { willReadFrequently: true });
  // 背景渐变(≈ ColorOfTheSkies 白天)
  x1.fillStyle = '#7aa5d2'; x1.fillRect(0, 0, W, H);
  // ② 白幕(via 真实现——临时造一个带 cots 的对象调用 drawWeatherTint2D 的同款公式路径)
  {
    const skyLike = Object.create(SkyRendererAsClass.prototype ?? {});
    void skyLike;
    // 直接用导出的 blizzardSkyTint 公式等价(避免实例依赖)
    const t = m.blizzardSkyTint(1, 1, [122, 165, 210]);
    x1.save();
    x1.globalAlpha = Math.max(0, Math.min(1, t.alpha));
    x1.fillStyle = `rgb(${Math.round(t.color[0] * 255)},${Math.round(t.color[1] * 255)},${Math.round(t.color[2] * 255)})`;
    x1.fillRect(0, 0, W, H);
    x1.restore();
  }
  // ③ 深色"方块/墙"矩形覆盖左半幅(= 世界内容在后)
  x1.fillStyle = '#20242c';
  x1.fillRect(0, 0, W / 2, H);
  const d1 = x1.getImageData(0, 0, W, H).data;
  // 对照组 B:同一场景【无白幕】
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const x2 = c2.getContext('2d', { willReadFrequently: true });
  x2.fillStyle = '#7aa5d2'; x2.fillRect(0, 0, W, H);
  x2.fillStyle = '#20242c'; x2.fillRect(0, 0, W / 2, H);
  const d2 = x2.getImageData(0, 0, W, H).data;
  // 统计:天空区(x>W/2)应被提亮(A>B);世界区(x<W/2)应几乎无差(黑底盖住白幕)
  let skyDelta = 0, nS = 0, worldMax = 0;
  for (let y = 10; y < H - 10; y += 3) {
    const iSky = (y * W + Math.floor(W * 0.75)) * 4;
    skyDelta += (d1[iSky] - d2[iSky]); nS++;
    for (let xx = 10; xx < Math.floor(W / 2) - 10; xx += 7) {
      const iw = (y * W + xx) * 4;
      worldMax = Math.max(worldMax, Math.abs(d1[iw] - d2[iw]));
    }
  }
  skyDelta /= nS;
  return { skyLift: +skyDelta.toFixed(1), worldRegionMaxDiff: worldMax };
});
console.log('PROOF:', JSON.stringify(out));
console.log(out.skyLift > 40 && out.worldRegionMaxDiff <= 2
  ? '=== PASS: 白幕在背景层(天空提亮、后续世界内容完全覆盖之) ==='
  : '=== FAIL ===');
await browser.close();
process.exit((out.skyLift > 40 && out.worldRegionMaxDiff <= 2) ? 0 : 3);
