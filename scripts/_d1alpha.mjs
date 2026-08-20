import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 300, height: 200 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async () => {
  // Tiles_2 的 D1 补丁(草半砖左接缝):x=144-147, y=0-7
  const im = new Image();
  im.src = '/sprites/vanilla/Tiles_2.png';
  await new Promise((ok, e2) => { im.onload = ok; im.onerror = e2; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  // 逐像素 dump D1 补丁区 (144,0)-(159,8)
  const out = [];
  for (let y = 0; y < 8; y++) {
    let row = '';
    for (let px = 144; px < 160; px++) {
      const d = x.getImageData(px, y, 1, 1).data;
      row += d[3] === 0 ? '·' : d[3] < 128 ? '▒' : '█';
    }
    out.push(`y${y}: ${row}`);
  }
  return { patch: out };
});
console.log(r.patch.join('\n'));
await browser.close();
