// BJ76 一次性诊断:页面上所有 canvas 的尺寸/亮度,找主画布
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const list = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('canvas').forEach((c, i) => {
    let mean = -1;
    try {
      const off = document.createElement('canvas');
      off.width = c.width; off.height = c.height;
      const c2 = off.getContext('2d', { willReadFrequently: true });
      c2.drawImage(c, 0, 0);
      const d = c2.getImageData(0, 0, c.width, c.height).data;
      let s = 0, n = 0;
      for (let k = 0; k < d.length; k += 4 * 97) { s += (d[k] + d[k + 1] + d[k + 2]) / 3; n++; }
      mean = s / n;
    } catch (e) { mean = -2; }
    out.push({ i, id: c.id || '(noid)', cls: c.className || '', w: c.width, h: c.height, mean: +mean.toFixed(1), inRoot: !!c.closest('#game-root') });
  });
  return out;
});
for (const c of list) console.log(JSON.stringify(c));
// 全页截图对照
await page.screenshot({ path: '/tmp/bj76-page.png' });
console.log('page screenshot -> /tmp/bj76-page.png');
await browser.close();
