// LiquidSlope/Liquid 贴图 alpha 形状转储(浏览器解码,无 node-canvas 依赖)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/texdump-profile',
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
  return [
    await dump('LiquidSlope_0.png', 4, 18),
    await dump('Liquid_0.png', 1, 16),
  ];
});
for (const t of out) {
  console.log(`== ${t.file} ${t.w}x${t.h}`);
  t.cols.forEach((rows, i) => {
    console.log(` col${i} (x=${i * (t.file.includes('Slope') ? 18 : 16)}):`);
    console.log(rows.map((r) => '   ' + r).join('\n'));
  });
}
await browser.close();
