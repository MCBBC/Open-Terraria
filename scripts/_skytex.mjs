// Background_0 横向均匀性采样(x=0.05/0.5/0.95 三列)
import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 300, height: 200 } });
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async () => {
  const im = new Image();
  im.src = '/sprites/vanilla/Background_0.png';
  await new Promise((ok, e2) => { im.onload = ok; im.onerror = e2; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const at = (px, fy) => Array.from(x.getImageData(px, Math.floor(im.height * fy), 1, 1).data.slice(0, 3));
  return { w: im.width, h: im.height,
    top: [at(2, 0.02), at(24, 0.02), at(46, 0.02)],
    mid: [at(2, 0.5), at(24, 0.5), at(46, 0.5)],
    bot: [at(2, 0.98), at(24, 0.98), at(46, 0.98)] };
});
console.log(JSON.stringify(r));
await browser.close();
