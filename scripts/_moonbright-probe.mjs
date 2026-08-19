// 月亮夜间可见性/亮度探针（2026-08-19 用户实报"夜里的月亮不会亮"+Trace 零 Moon_ 光栅）：
// 拨到午夜 → 拦截 drawImage 找 Moon 帧 → 采样月亮理论屏幕位像素亮度 → 输出
// isDay/moonType/moonEventKind/tex 状态链。经 tools/run-diag.mjs 运行。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('月亮探针');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const worldItem = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (worldItem) {
  await page.click('.sw-list-panel .sw-item');
} else {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 3000));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};
  const sky = g.renderer.sky;

  // ===== 0. 状态链 =====
  const c = g.world.clock;
  out.before = { timeOfDay: c.timeOfDay, isDay: c.isDay, moonPhase: c.moonPhase, bloodMoon: !!c.bloodMoon };
  out.fx = { moonEventKind: sky.fx.moonEventKind, surfaceY: sky.fx.surfaceY };
  out.moonType = sky.moonType;
  out.moonTexs = sky.moonTexs.map((t) => (t ? { w: t.width, h: t.height } : null));

  // ===== 1. 拨到午夜（满月相位 0）=====
  c.timeOfDay = 0; c.isDay = false; c.moonPhase = 0; c.bloodMoon = false;

  // ===== 2. 拦截 drawImage：找 Moon_ 贴图绘制 =====
  const cv = g.renderer.canvas;
  const ctx2d = cv.getContext('2d');
  const seen = [];
  const origDraw = CanvasRenderingContext2D.prototype.drawImage;
  let armed = false;
  CanvasRenderingContext2D.prototype.drawImage = function (...a) {
    if (armed) {
      const src = a[0];
      const url = src?.src ?? '';
      if (/Moon|Sun|Smiley|Pumpkin/i.test(url)) {
        seen.push({ url: url.split('/').pop(), dx: a[a.length - 4] ?? a[a.length - 2], dy: a[a.length - 3] ?? a[a.length - 1], w: a[5], h: a[6], ga: this.globalAlpha });
      }
    }
    return origDraw.apply(this, a);
  };
  armed = true;
  await wait(700);   // 若干帧
  armed = false;
  CanvasRenderingContext2D.prototype.drawImage = origDraw;
  out.moonDraws = seen.slice(0, 8);
  out.moonDrawCount = seen.length;

  // ===== 3. 月亮理论屏幕位亮度采样（Main.cs:62292-62322 公式）=====
  // x = ft*(viewW+mw*2)-mw；y = dip*250+180；ft = nightTime/32400（午夜 0.5）
  const viewW = cv.width, viewH = cv.height;
  const nightTime = ((0 - 0.75 + 1) % 1) / 0.5 * 32400;   // t=0
  const ft = nightTime / 32400;
  const tex = sky.moonTexs[sky.moonType] ?? sky.moonTexs[0];
  const mw = tex?.width ?? 50;
  const dip = Math.pow(Math.abs(ft * 2 - 1), 2);
  const mx = ft * (viewW + mw * 2) - mw, my = dip * 250 + 180;
  out.moonGeom = { viewW, viewH, ft, mw, mx, my, scale: 1.2 - dip * 0.4 };
  // 采样月亮中心 20×20（canvas 原生坐标;getBoundingClientRect 换算 CSS→canvas）
  const rect = cv.getBoundingClientRect();
  const sx = Math.round((mx / viewW) * rect.width + rect.left + (rect.left ? 0 : 0));
  void sx;
  // 直接在 canvas 上 getImageData（ctx2d 权威，不经 DPR 换算）
  const px = ctx2d.getImageData(Math.max(0, Math.round(mx - 15)), Math.max(0, Math.round(my - 15)), 30, 30).data;
  let sum = 0, n = 0, max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
    sum += l; n++; if (l > max) max = l;
  }
  out.moonPx = { avg: +(sum / n).toFixed(1), max: +max.toFixed(1), alphaAvg: +(px.slice(0, 400).filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0) / 100).toFixed(1) };
  // 对照：屏幕角落背景亮度
  const bg = ctx2d.getImageData(10, 10, 10, 10).data;
  let bs = 0; for (let i = 0; i < bg.length; i += 4) bs += (bg[i] + bg[i + 1] + bg[i + 2]) / 3;
  out.skyPx = +(bs / (bg.length / 4)).toFixed(1);

  // ===== 4. 时间源推导核对：nightTime 在 t=0 时是否 16200 =====
  out.derived = { nightTime, isDayNow: c.isDay };
  return out;
});

// 截图取证
fs.writeFileSync('/tmp/sw-moon-night.png', await page.screenshot({ type: 'png' }));
console.log(JSON.stringify({ res, errs: errs.slice(0, 10) }, null, 2));
await browser.close();
