// 采样 Background_0.png 顶/中/底色(vanilla 夜空 = 贴图×月光地板)
import puppeteer from 'puppeteer-core';
const B = process.env.SW_ORIGIN || 'http://localhost:4173';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 300, height: 200 } });
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async () => {
  const im = new Image();
  im.src = '/sprites/vanilla/Background_0.png';
  await new Promise((ok, e2) => { im.onload = ok; im.onerror = e2; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const at = (fx, fy) => {
    const d = x.getImageData(Math.floor(im.width * fx), Math.floor(im.height * fy), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  return { size: [im.width, im.height], top: at(0.5, 0.02), mid: at(0.5, 0.5), bot: at(0.5, 0.98) };
});
console.log(JSON.stringify(r));
await browser.close();
