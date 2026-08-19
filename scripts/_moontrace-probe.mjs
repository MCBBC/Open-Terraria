// 月亮绘制二分定位：A) 渲染循环是否调用 sky.draw；B) 手动调 sky.draw 月亮分支是否执行。
import puppeteer from 'puppeteer-core';
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
  await page.keyboard.type('月亮二分');
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
  const c = g.world.clock;
  c.timeOfDay = 0; c.isDay = false; c.moonPhase = 0;

  // ---- A. 渲染循环 500ms 内 sky.draw 调用计数 + 进场 t/isDay ----
  const entries = [];
  const orig = sky.draw.bind(sky);
  sky.draw = (ctx, clock, ...rest) => {
    entries.push({ t: clock.timeOfDay, isDayField: clock.isDay });
    return orig(ctx, clock, ...rest);
  };
  await wait(500);
  sky.draw = orig;
  out.loopCalls = entries.length;
  out.loopSample = entries.slice(0, 5);

  // ---- B. drawImage 拦截 + 手动调一次 sky.draw ----
  const seen = [];
  const od = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...a) {
    const url = a[0]?.src ?? '';
    if (/Moon|Sun|Smiley|Pumpkin/i.test(url)) {
      seen.push({ url: url.split('/').pop(), nArgs: a.length, ga: this.globalAlpha, tf: [this.getTransform().a, this.getTransform().e, this.getTransform().f] });
    }
    return od.apply(this, a);
  };
  const ctx = g.renderer.ctx;
  const cam = g.camera ?? g.cam;
  sky.draw(ctx, c, ctx.canvas.width, ctx.canvas.height, 0, 16.7, 0);
  CanvasRenderingContext2D.prototype.drawImage = od;
  out.manualDrawMoonCalls = seen.length;
  out.manualDrawSample = seen.slice(0, 6);

  // ---- C. 手动复算月亮几何（与 B 同参）----
  const t = c.timeOfDay;
  const isDay = t > 0.25 && t < 0.75;
  const nightTime = !isDay ? ((((t - 0.75) + 1) % 1) / 0.5) * 32400 : 0;
  out.calc = { t, isDay, nightTime, ft: nightTime / 32400 };
  return out;
});
console.log(JSON.stringify({ res, errs: errs.slice(0, 8) }, null, 2));
await browser.close();
