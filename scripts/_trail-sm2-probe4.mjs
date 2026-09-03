import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 640, height: 200 },
});
const page = await browser.newPage();
const out = await page.evaluate(() => {
  // 最小实验：putImageData(a=0, rgb>0) → drawImage('lighter') 是否吞 rgb
  const s = document.createElement('canvas'); s.width = 4; s.height = 1;
  const sc = s.getContext('2d');
  const im = sc.createImageData(4, 1);
  im.data[0] = 200; im.data[2] = 100; im.data[3] = 0;   // a=0
  im.data[4] = 200; im.data[6] = 100; im.data[7] = 255; // a=255
  sc.putImageData(im, 0, 0);
  const t = document.createElement('canvas'); t.width = 4; t.height = 1;
  const tc = t.getContext('2d');
  tc.globalCompositeOperation = 'lighter';
  tc.drawImage(s, 0, 0);
  const d = tc.getImageData(0, 0, 4, 1).data;
  return { a0_rgb: [d[0], d[1], d[2]], a255_rgb: [d[4], d[5], d[6]], a0_alpha: d[3], a255_alpha: d[7] };
});
console.log(JSON.stringify(out));
await browser.close();
