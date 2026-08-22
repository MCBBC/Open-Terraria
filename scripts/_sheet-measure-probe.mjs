// 用浏览器解码 Tiles_378,测每行(54px)变体 A(36px)内容 bbox + 底部行内容对比
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 120000 });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
const out = await page.evaluate(async () => {
  const img = new Image();
  img.src = 'sprites/vanilla/Tiles_378.png';
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const W = c.width;
  const bbox = (x0, x1, y0, y1) => {
    let minx = 9999, miny = 9999, maxx = -1, maxy = -1;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (d[(y * W + x) * 4 + 3] > 10) {
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
    return maxx < 0 ? null : { x: minx - x0, y: miny - y0, w: maxx - minx + 1, h: maxy - miny + 1 };
  };
  const rows = [];
  for (let r = 0; r < 11; r++) rows.push(bbox(0, 36, r * 54, (r + 1) * 54));
  return { size: [c.width, c.height], rows };
});
console.log(JSON.stringify(out));
await browser.close();
