// BJ535 层1调试 v2:page.mouse 通道 hover 建立对照
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
console.log('Chrome 版本:', process.version, await browser_version());
async function browser_version() {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 800, height: 600 } });
  const v = await b.version();
  await b.close();
  return v;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
await page.goto('about:blank');
await page.bringToFront();
const X = 200, Y = 110;
await page.evaluate(() => {
  document.body.style.margin = '0';
  const host = document.createElement('div');
  host.id = 'host';
  host.style.cssText = 'position:absolute; left:100px; top:100px; width:300px; height:400px;';
  const row = document.createElement('div');
  row.id = 'r1';
  row.style.cssText = 'height:40px; background:#463764;';
  host.appendChild(row);
  document.body.appendChild(host);
  window.__ev = { mm: 0, me: 0 };
  document.addEventListener('mousemove', () => window.__ev.mm++);
  document.getElementById('r1').addEventListener('mouseenter', () => window.__ev.me++);
});
const read = () => page.evaluate(() => ({
  hover: document.getElementById('r1').matches(':hover'),
  ev: { ...window.__ev },
  fp: (() => { const t = document.elementFromPoint(200, 110); return t ? (t.id || t.tagName) : null; })(),
}));

// T1: page.mouse.move
await page.mouse.move(X, Y);
await new Promise((r) => setTimeout(r, 400));
console.log('T1 page.mouse.move:    ', JSON.stringify(await read()));
// T2: page.mouse.move 分步
await page.mouse.move(700, 550);
await new Promise((r) => setTimeout(r, 150));
await page.mouse.move(X, Y, { steps: 5 });
await new Promise((r) => setTimeout(r, 400));
console.log('T2 page.mouse 分步:    ', JSON.stringify(await read()));
// T3: page.hover
await page.hover('#r1');
await new Promise((r) => setTimeout(r, 400));
console.log('T3 page.hover:         ', JSON.stringify(await read()));
await browser.close();
