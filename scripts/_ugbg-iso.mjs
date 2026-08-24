// 蓝色来源隔离:全画布采样网格 + 逐层关闭对照
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const boot = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  window.__g = g;
  pl.x = 341 * 16; pl.y = 422 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1500));
  return { at: [Math.floor(pl.cx / 16), Math.floor(pl.cy / 16)] };
});
// 采样网格:全屏 8×6 采色
const grid = await page.evaluate(() => {
  const cv = window.__g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  ctx2.drawImage(cv, 0, 0);
  const out = [];
  for (let gy = 0; gy < 6; gy++) {
    const row = [];
    for (let gx = 0; gx < 8; gx++) {
      const d = ctx2.getImageData(Math.floor(cv.width * (gx + 0.5) / 8), Math.floor(cv.height * (gy + 0.5) / 6), 1, 1).data;
      row.push(`${d[0]},${d[1]},${d[2]}`);
    }
    out.push(row.join(' | '));
  }
  return out;
});
console.log('网格(R,G,B):\n' + grid.join('\n'));
await page.screenshot({ path: '/tmp/iso-full.png' });
// 关 biomeBg
await page.evaluate(() => { const d = window.__g.renderer.biomeBg.draw; window.__g.renderer.biomeBg.draw = () => {}; window.__origDraw = d; });
await new Promise((r) => setTimeout(r, 300));
const grid2 = await page.evaluate(() => {
  const cv = window.__g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  ctx2.drawImage(cv, 0, 0);
  const out = [];
  for (let gy = 0; gy < 6; gy++) {
    const row = [];
    for (let gx = 0; gx < 8; gx++) {
      const d = ctx2.getImageData(Math.floor(cv.width * (gx + 0.5) / 8), Math.floor(cv.height * (gy + 0.5) / 6), 1, 1).data;
      row.push(`${d[0]},${d[1]},${d[2]}`);
    }
    out.push(row.join(' | '));
  }
  return out;
});
console.log('关biomeBg后:\n' + grid2.join('\n'));
await page.screenshot({ path: '/tmp/iso-nobg.png' });
await page.evaluate(() => { window.__g.renderer.biomeBg.draw = window.__origDraw; });
await browser.close();
