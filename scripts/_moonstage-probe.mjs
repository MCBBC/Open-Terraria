// 月亮逐层定位：包住 sky.draw / biomeBg.draw / drawCloudsNear，每层画完同步采样月亮位像素。
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
  await page.keyboard.type('月亮逐层');
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
  const sky = g.renderer.sky, bg = g.renderer.biomeBg;
  const c = g.world.clock;
  c.timeOfDay = 0; c.isDay = false; c.moonPhase = 0;

  const ctx = g.renderer.ctx;
  const probe = (tag) => {
    const px = ctx.getImageData(Math.round(ctx.canvas.width / 2 - 15), 165, 30, 30).data;
    let s = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { s += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
    out[tag] = +(s / n).toFixed(1);
  };

  // 包三层：每层画完探一次月亮位
  const wrap = (obj, name, tag) => {
    const orig = obj[name].bind(obj);
    obj[name] = (...a) => { const r = orig(...a); probe(tag); return r; };
    return () => { obj[name] = orig; };
  };
  const unwraps = [
    wrap(sky, 'draw', 'afterSkyDraw'),
    wrap(bg, 'draw', 'afterBiomeBg'),
    wrap(sky, 'drawCloudsNear', 'afterCloudsNear'),
  ];
  await wait(400);   // 活循环跑几帧
  unwraps.forEach(u => u());

  // 附加：月亮理论 x 依 viewW 中点（ft=0.5）→ 取整像素列/行探一轮横带
  const strip = [];
  for (let y = 140; y <= 240; y += 10) {
    const px = ctx.getImageData(Math.round(ctx.canvas.width / 2 - 5), y, 10, 1).data;
    let s = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { s += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; }
    strip.push([y, +(s / n).toFixed(0)]);
  }
  out.moonStrip = strip;
  return out;
});
console.log(JSON.stringify({ res, errs: errs.slice(0, 8) }, null, 2));
await browser.close();
