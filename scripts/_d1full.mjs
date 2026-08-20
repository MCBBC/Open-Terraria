import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 300, height: 200 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async () => {
  const im = new Image();
  im.src = '/sprites/vanilla/Tiles_2.png';
  await new Promise((ok, e2) => { im.onload = ok; im.onerror = e2; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const out = [];
  for (let y = 0; y < 8; y++) {
    let segs = [];
    let start = -1;
    for (let px = 0; px < im.width; px++) {
      const a = x.getImageData(px, y, 1, 1).data[3];
      if (a === 0 && start === -1) start = px;
      if (a !== 0 && start !== -1) { if (px - start >= 2) segs.push(start + '-' + (px-1) + '(' + (px-start) + 'px)'); start = -1; }
    }
    if (start !== -1 && im.width - start >= 2) segs.push(start + '-' + (im.width-1) + '(' + (im.width-start) + 'px)');
    out.push('y' + y + ': ' + (segs.length ? segs.join(', ') : '(opaque)'));
  }
  return { w: im.width, h: im.height, rows: out };
});
console.log('Tiles_2 ' + r.w + 'x' + r.h);
console.log(r.rows.join('\n'));
await browser.close();
