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
  await page.keyboard.type('层检查');
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
  const r = g.renderer;
  const c = g.world.clock;
  c.timeOfDay = 0; c.isDay = false; c.moonPhase = 0;
  return new Promise(resolve => setTimeout(() => {
    const out = {};
    out.enabled = r.worldLayerEnabled;
    out.active = r.worldLayerActive;
    out.hasWorld = !!r.worldCanvas;
    if (r.worldCanvas) {
      const wc = r.worldCanvas.getContext('2d');
      const px = wc.getImageData(665, 165, 30, 30).data;
      let s = 0, n = 0, a = 0;
      for (let i = 0; i < px.length; i += 4) { s += (px[i]+px[i+1]+px[i+2])/3; n++; a += px[i+3]; }
      out.worldLayerMoonPx = +(s/n).toFixed(1);
      out.worldLayerAlpha = +(a/n).toFixed(1);
    }
    const mc = r.ctx.canvas.getContext('2d');
    const px2 = mc.getImageData(665, 165, 30, 30).data;
    let s2 = 0, n2 = 0;
    for (let i = 0; i < px2.length; i += 4) { s2 += (px2[i]+px2[i+1]+px2[i+2])/3; n2++; }
    out.mainMoonPx = +(s2/n2).toFixed(1);
    const mid = mc.getImageData(680, 430, 20, 20).data;
    let s3 = 0, n3 = 0;
    for (let i = 0; i < mid.length; i += 4) { s3 += (mid[i]+mid[i+1]+mid[i+2])/3; n3++; }
    out.mainMidPx = +(s3/n3).toFixed(1);
    resolve(out);
  }, 600));
});
console.log(JSON.stringify({ res, errs }, null, 2));
await browser.close();
