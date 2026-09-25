// A/B 帧差分:玩家区域非背景像素量 + 逐像素差异统计
import { readFileSync } from 'node:fs';
const dec = (p) => { const b = readFileSync(p); return b; };
// 用 pngjs? 无依赖——改用 Chrome 解码:起 puppeteer 读像素
import puppeteer from 'puppeteer-core';
const b64 = (p) => readFileSync(p).toString('base64');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const stat = async (p) => page.evaluate(async (b) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b;
  await new Promise(r => { img.onload = r; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let opaque = 0, sum = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { opaque++; sum += d[i] + d[i + 1] + d[i + 2]; }
  return { opaque, avg: opaque ? Math.round(sum / opaque / 3) : 0 };
}, b64(p));
const a = await stat('/tmp/swimmer-probe2/A-shim-full.png');
const b = await stat('/tmp/swimmer-probe2/B-2d-full.png');
const c2 = await stat('/tmp/swimmer-probe2/C-shim-half.png');
const d2 = await stat('/tmp/swimmer-probe2/D-2d-half.png');
console.log('A-shim-full:', JSON.stringify(a));
console.log('B-2d-full  :', JSON.stringify(b));
console.log('C-shim-half:', JSON.stringify(c2));
console.log('D-2d-half  :', JSON.stringify(d2));
// 逐像素 A vs B
const diff = await page.evaluate(async (ba, bb) => {
  const load = (b) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + b; });
  const [ia, ib] = await Promise.all([load(ba), load(bb)]);
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
  const x = c.getContext('2d'); x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
  let big = 0, tot = 0;
  for (let i = 0; i < da.length; i += 4) {
    const dd = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    tot++; if (dd > 90) big++;
  }
  return { bigDiffPx: big, totalPx: tot, pct: +(100 * big / tot).toFixed(2) };
}, b64('/tmp/swimmer-probe2/A-shim-full.png'), b64('/tmp/swimmer-probe2/B-2d-full.png'));
console.log('A-vs-B diff:', JSON.stringify(diff));
await browser.close();
