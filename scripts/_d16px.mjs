// 精确读 Dust.png (160,0/10/20) 三格逐像素 RGBA（不经视觉模型）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 400, height: 300 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/', { waitUntil: 'domcontentloaded' });
const out = await page.evaluate(async () => {
  const img = new Image();
  img.src = '/sprites/vanilla/Dust.png';
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const cells = {};
  for (const fy of [0, 10, 20]) {
    const rows = [];
    for (let y = 0; y < 8; y++) {
      const row = [];
      for (let x = 0; x < 8; x++) {
        const d = g.getImageData(160 + x, fy + y, 1, 1).data;
        row.push(d[3] === 0 ? '·' : `${d[0]},${d[1]},${d[2]}@${d[3]}`);
      }
      rows.push(row.join('  '));
    }
    cells[fy] = rows;
  }
  return cells;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
