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
  await page.keyboard.type('终检');
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

// 夜景：月亮位采样 + 截图
const night = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  c.timeOfDay = 0; c.isDay = false; c.moonPhase = 0;
  return new Promise(res => setTimeout(() => {
    const mc = g.renderer.ctx.canvas.getContext('2d');
    const w = mc.canvas.width;
    const sample = (x, y) => {
      const px = mc.getImageData(x - 10, y - 10, 20, 20).data;
      let s = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) { s += (px[i]+px[i+1]+px[i+2])/3; n++; }
      return +(s/n).toFixed(1);
    };
    res({ moon: sample(Math.round(w/2), 180), skyCorner: sample(60, 60), ground: sample(Math.round(w/2), 500) });
  }, 800));
});
fs.writeFileSync('/tmp/sw-moon-fixed-night.png', await page.screenshot({ type: 'png' }));

// 白天：太阳位采样（正午 t=0.5 → 太阳 x=w/2, y=180）
const day = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  c.timeOfDay = 0.5; c.isDay = true;
  return new Promise(res => setTimeout(() => {
    const mc = g.renderer.ctx.canvas.getContext('2d');
    const w = mc.canvas.width;
    const sample = (x, y) => {
      const px = mc.getImageData(x - 10, y - 10, 20, 20).data;
      let s = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) { s += (px[i]+px[i+1]+px[i+2])/3; n++; }
      return +(s/n).toFixed(1);
    };
    res({ sun: sample(Math.round(w/2), 180), sky: sample(60, 60), ground: sample(Math.round(w/2), 500) });
  }, 800));
});
fs.writeFileSync('/tmp/sw-moon-fixed-day.png', await page.screenshot({ type: 'png' }));
console.log(JSON.stringify({ night, day, errs }, null, 2));
await browser.close();
