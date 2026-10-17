// 一次性诊断:两张整屏 PNG 像素 diff(bbox 定位)——puppeteer 页内 canvas 解码
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [aPath, bPath] = [process.argv[2], process.argv[3]];
if (!aPath || !bPath) { console.error('usage: node _maples-diag-imgdiff.mjs a.png b.png'); process.exit(1); }
const a = 'data:image/png;base64,' + readFileSync(aPath).toString('base64');
const b = 'data:image/png;base64,' + readFileSync(bPath).toString('base64');
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
const out = await page.evaluate(async ([au, bu]) => {
  const load = (u) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = u; });
  const A = await load(au), B = await load(bu);
  const c = document.createElement('canvas');
  c.width = A.width; c.height = A.height;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(A, 0, 0);
  const da = cx.getImageData(0, 0, c.width, c.height).data;
  cx.clearRect(0, 0, c.width, c.height);
  cx.drawImage(B, 0, 0);
  const db = cx.getImageData(0, 0, c.width, c.height).data;
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, maxd = 0, sum = 0;
  const colCount = new Array(c.width).fill(0);
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
    if (d > 0) {
      n++; sum += d; if (d > maxd) maxd = d;
      const px = (i >> 2) % c.width, py = (i >> 2) / c.width | 0;
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      colCount[px]++;
    }
  }
  // 差异列分布(每 64px 桶)
  const buckets = [];
  for (let x = 0; x < c.width; x += 64) {
    let s = 0; for (let k = x; k < x + 64 && k < c.width; k++) s += colCount[k];
    buckets.push(s);
  }
  return { size: [c.width, c.height], n, maxd, avg: (sum / Math.max(1, n)).toFixed(2), bbox: [x0, y0, x1, y1], buckets };
}, [a, b]);
console.log(JSON.stringify(out));
await browser.close();
