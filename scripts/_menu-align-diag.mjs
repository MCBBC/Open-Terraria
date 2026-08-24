// 一次性:菜单昼态黑屏诊断——console/pageerror 捕获 + 不动时钟的自然流逝截图序列
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT ?? '/tmp/menu-align1458/diag';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[console.${m.type()}]`, m.text().slice(0, 500)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 800)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const t of [0, 2000, 4000]) { await wait(t === 0 ? 1500 : 2000); await page.screenshot({ path: `${OUT}/natural-${t}.png` }); }
const st = await page.evaluate(() => {
  const mb = window.__swMenuBg;
  return { vTime: mb.vTime, dayTime: mb.dayTime, clock: mb.clockTime?.(), style: mb.style };
});
console.log('STATE:', JSON.stringify(st));
// 再试 setTime 跳昼
await page.evaluate(() => { const mb = window.__swMenuBg; mb.dayTime = true; mb.vTime = 27000; });
await wait(1500);
await page.screenshot({ path: `${OUT}/jump-noon.png` });
const st2 = await page.evaluate(() => {
  const mb = window.__swMenuBg;
  const cv = mb.canvas;
  const g = cv.getContext('2d');
  const d = g.getImageData(0, 0, cv.width, Math.min(200, cv.height)).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 40) sum += d[i] + d[i + 1] + d[i + 2];
  return { vTime: mb.vTime, dayTime: mb.dayTime, topLum: sum / (d.length / 40) };
});
console.log('JUMP:', JSON.stringify(st2));
await browser.close();
