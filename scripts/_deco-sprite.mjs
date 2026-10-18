// 读 v_185/v_74 等装饰精灵帧的底部行(16x20 表),验证 2px 下探越界与灰色像素。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/wetslope-profile14'),
  args: ['--no-first-run'], defaultViewport: { width: 400, height: 300 },
});
const page = await browser.newPage();
await page.goto('http://localhost:5204/', { waitUntil: 'domcontentloaded' });
const out = await page.evaluate(async () => {
  const read = async (file, fx, fy, w, h) => {
    const img = new Image();
    img.src = '/sprites/vanilla/' + file;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(fx, fy, w, h).data;
    const rows = [];
    for (let y = 0; y < h; y++) {
      let line = '';
      const hex = [];
      for (let xx = 0; xx < w; xx++) {
        const k = (y * w + xx) * 4;
        if (d[k + 3] < 60) { line += '.'; }
        else { line += '#'; hex.push([d[k], d[k + 1], d[k + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')); }
      }
      rows.push({ line, hex });
    }
    return { file: file + `@(${fx},${fy})`, size: [img.width, img.height], rows };
  };
  return [
    await read('Tiles_185.png', 72, 0, 16, 20),
    await read('Tiles_185.png', 162, 0, 16, 20),
    await read('Tiles_74.png', 0, 0, 16, 20),
  ];
});
for (const t of out) {
  console.log(`== ${t.file} sheet ${t.size[0]}x${t.size[1]}`);
  t.rows.forEach((r, y) => console.log(` y${String(y).padStart(2, '0')} ${r.line}   ${r.hex.slice(0, 6).join(' ')}`));
}
await browser.close();
