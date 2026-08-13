import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.goto('http://localhost:5202', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 500));
const out = await page.evaluate(async () => {
  const img = new Image();
  img.src = '/sprites/vanilla/Projectile_938.png';
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('load fail')); });
  const c = document.createElement('canvas'); c.width = 320; c.height = 320;
  const ctx = c.getContext('2d');
  const dx = 1, dy = 0, sd = 1;
  const ang = Math.atan2(dy, dx) + Math.PI / 2 - Math.PI / 4 * sd;
  ctx.translate(160, 160); ctx.rotate(ang);
  ctx.drawImage(img, -16, -16, 32, 32);
  const d = ctx.getImageData(0, 0, 320, 320).data;
  let n = 0, sx = 0, sy = 0, minx = 999, maxx = -1, miny = 999, maxy = -1;
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
    const a = d[(y * 320 + x) * 4 + 3];
    if (a > 60) { n++; sx += x; sy += y; minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  }
  return { natW: img.naturalWidth, natH: img.naturalHeight, n, gx: sx / n - 160, gy: sy / n - 160, bbox: [minx, miny, maxx, maxy] };
});
console.log(JSON.stringify(out));
await browser.close();
