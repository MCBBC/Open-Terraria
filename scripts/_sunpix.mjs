// Sun.png 逐像素采样:是纯圆还是带光芒/光晕?
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
  im.src = '/sprites/vanilla/Sun.png';
  await new Promise((ok, e2) => { im.onload = ok; im.onerror = e2; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  // 中心行扫描:alpha 分布(圆=平坦;光芒=毛刺/延伸)
  const midY = Math.floor(im.height / 2);
  const row = [];
  for (let px = 0; px < im.width; px++) {
    const d = x.getImageData(px, midY, 1, 1).data;
    row.push({ x: px, a: d[3], r: d[0], g: d[1], b: d[2] });
  }
  // 有效像素(alpha>0)范围
  const valid = row.filter(p => p.a > 0);
  return { w: im.width, h: im.height, validPx: valid.length, range: [valid[0]?.x, valid[valid.length-1]?.x],
    midRow: row.map(p => p.a > 0 ? (p.r > 200 ? 'W' : p.r > 100 ? 'w' : '.') : ' ').join(''),
    // 顶行和底行也采样
    topRow: Array.from({length: im.width}, (_, i) => { const d = x.getImageData(i, 10, 1, 1).data; return d[3] > 0 ? 'W' : ' '; }).join(''),
    botRow: Array.from({length: im.width}, (_, i) => { const d = x.getImageData(i, im.height - 10, 1, 1).data; return d[3] > 0 ? 'W' : ' '; }).join(''),
  };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
