// LiquidSlope/Liquid 贴图 alpha 形状转储(浏览器解码,无 node-canvas 依赖)
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/texdump3-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 400, height: 300 },
});
const page = await browser.newPage();
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded' });
const out = await page.evaluate(async () => {
  const dump = async (file, cols, w) => {
    const img = new Image();
    img.src = '/sprites/vanilla/' + file;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const res = { file, w: img.width, h: img.height, cols: [] };
    for (let col = 0; col < cols; col++) {
      const rows = [];
      for (let y = 0; y < Math.min(18, img.height); y++) {
        let line = '';
        for (let xx = 0; xx < 16; xx++) {
          const i = (y * img.width + col * w + xx) * 4;
          line += d[i + 3] > 60 ? '#' : '.';
        }
        rows.push(line);
      }
      res.cols.push(rows);
    }
    return res;
  };
  const dumpRect = async (file, x0, y0, rw, rh) => {
    const img = new Image();
    img.src = '/sprites/vanilla/' + file;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const rows = [];
    for (let y = y0; y < y0 + rh; y++) {
      let line = '';
      for (let xx = x0; xx < x0 + rw; xx++) {
        const i = (y * img.width + xx) * 4;
        line += d[i + 3] > 60 ? '#' : (d[i+3] > 0 ? '+' : '.');
      }
      rows.push(line);
    }
    return { file, rect: [x0, y0, rw, rh], rows };
  };
  return [
    await dumpRect('Tiles_495.png', 144, 0, 16, 8),
    await dumpRect('Tiles_60.png', 144, 0, 16, 8),
  ];
});
for (const t of out) {
  console.log(`== ${t.file} rect(${t.rect})`);
  console.log(t.rows.map((r) => '   ' + r).join('\n'));
}
await browser.close();
