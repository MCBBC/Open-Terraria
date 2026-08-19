// 月亮手术探针：Proxy 盯 moonTexs 索引访问 + 手动 draw 后【同步】读像素（防下帧覆写）。
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
  await page.keyboard.type('月亮手术');
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

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const out = {};
  const sky = g.renderer.sky;
  const c = g.world.clock;
  c.timeOfDay = 0; c.isDay = false; c.moonPhase = 0;

  // 运行代码自证：draw 源码里是否真有月亮段（防陈旧模块/双实例）
  out.drawHasMoon = sky.draw.toString().includes('moonTexs');
  out.drawLen = sky.draw.toString().length;

  // Proxy 盯 moonTexs 数组索引访问
  const reads = [];
  const origArr = sky.moonTexs;
  const proxy = new Proxy(origArr, {
    get(t, k) {
      if (typeof k === 'string' && /^\d+$/.test(k)) {
        reads.push({ idx: k, w: t[k]?.width ?? null, h: t[k]?.height ?? null });
      }
      return t[k];
    },
  });
  Object.defineProperty(sky, 'moonTexs', { get() { return proxy; }, configurable: true });
  out.fxKind = sky.fx.moonEventKind;
  out.moonType = sky.moonType;
  out.moonTypeType = typeof sky.moonType;

  // 手动 draw（ctx 清屏后，同步读像素防下帧覆写）
  const ctx = g.renderer.ctx;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  try {
    sky.draw(ctx, c, ctx.canvas.width, ctx.canvas.height, 0, 16.7, 0);
    out.drawOk = true;
  } catch (e) {
    out.drawOk = false;
    out.drawErr = String(e);
  }
  Object.defineProperty(sky, 'moonTexs', { value: origArr, configurable: true, writable: true });
  out.moonTexReads = reads;

  // 同步像素：月亮理论位（ft=0.5 → x≈viewW/2）
  const w = ctx.canvas.width, h = ctx.canvas.height;
  const px = ctx.getImageData(Math.round(w / 2 - 15), 165, 30, 30).data;
  let sum = 0, n = 0, max = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = (px[i] + px[i + 1] + px[i + 2]) / 3;
    sum += l; n++; if (l > max) max = l;
  }
  out.moonPx = { avg: +(sum / n).toFixed(1), max: +max.toFixed(1) };
  return out;
});
console.log(JSON.stringify({ res, errs: errs.slice(0, 8) }, null, 2));
await browser.close();
