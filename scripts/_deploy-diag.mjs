// 随机外观复现探针(v2,等待到位):进创建页→服装页签→连点骰子 12 次,
// 每次采样 look sheet 非透明像素,抓"随机几次后全空"。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 150)));
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await p.evaluate(() => !!document.querySelector('[data-act=sp]')).catch(() => false);
  if (menuOk) break;
}
await p.evaluate(() => { document.querySelector('[data-act=sp]').click(); });
let selOk = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  selOk = await p.evaluate(() => !!document.querySelector('[data-act=new]')).catch(() => false);
  if (selOk) break;
}
await p.evaluate(() => { document.querySelector('[data-act=new]').click(); });
let ccOk = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  ccOk = await p.evaluate(() => !!document.querySelector('.sw-cc-tab[data-tab=look]')).catch(() => false);
  if (ccOk) break;
}
await p.evaluate(() => { document.querySelector('.sw-cc-tab[data-tab=look]').click(); });
let thumbsOk = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  thumbsOk = await p.evaluate(() => document.querySelectorAll('.sw-cc-stylebtn .sw-cc-thumb').length > 0).catch(() => false);
  if (thumbsOk) break;
}
console.log('就绪:', JSON.stringify({ menuOk, selOk, ccOk, thumbsOk }));
if (!thumbsOk) { console.log('页面错误:', errs.slice(0, 2).join(' | ')); await b.close(); process.exit(1); }

const sampleSheet = () => p.evaluate(() => new Promise((resolve) => {
  const thumb = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
  if (!thumb) return resolve({ thumb: false, lit: -1 });
  const m = (thumb.style.backgroundImage || '').match(/url\("?(data:[^")]+)"?\)/);
  if (!m) return resolve({ thumb: true, lit: -1, noDataUrl: true });
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 16) lit++;
    resolve({ lit, w: c.width, h: c.height });
  };
  img.onerror = () => resolve({ lit: -2, err: 'onerror' });
  img.src = m[1];
}));
const clickDice = () => p.evaluate(() => {
  const dice = [...document.querySelectorAll('.sw-cc-looklow .sw-cc-small')][2];
  dice?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
const s0 = await sampleSheet();
console.log('初值:', JSON.stringify(s0));
for (let round = 1; round <= 12; round++) {
  await clickDice();
  await new Promise((r) => setTimeout(r, 450));
  const s = await sampleSheet();
  console.log(`骰#${round}: lit=${s.lit} (${s.w ?? '?'}x${s.h ?? '?'})${s.noDataUrl ? ' 无dataURL' : ''}${s.err ? ' ' + s.err : ''}`);
  if (s.lit === 0) { console.log(`>>> 骰#${round} 全空复现!`); break; }
}
console.log('页面错误:', errs.length, errs.slice(0, 2).join(' | '));
await b.close();
process.exit(0);
