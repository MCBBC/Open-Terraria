// 一次性:夜远山淡化 A/B 对拍——同一时序(深夜 16200 定态)截一张,
// TAG 环境变量命名输出;dump alphaFar 双槽坡道终值作淡化机制证据。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TAG = process.env.TAG ?? 'ab';
const OUT = process.env.OUT ?? '/tmp/menu-align1458/final';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
if (!menuReady) { console.log('FAIL: menu handle missing'); process.exit(1); }
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1000));
// 深夜定态:time 16200(夜初)→ 坡道 0.02/帧,3s 足以吸合到 1
await page.evaluate(() => { const mb = window.__swMenuBg; mb.vTime = 16200; mb.dayTime = false; });
await new Promise((r) => setTimeout(r, 3000));
await page.screenshot({ path: `${OUT}/menu-night-${TAG}.png` });
const state = await page.evaluate(() => {
  const bb = window.__swMenuBg.biomeBg;
  return {
    bgStyle: bb.bgStyle,
    alphaFar0: +bb.alphaFar[0].toFixed(3), alphaFar2: +bb.alphaFar[2].toFixed(3),
    alphaFront: [bb.alphaFront[0], bb.alphaFront[1]].map((v) => +v.toFixed(3)),
  };
});
console.log(`AB[${TAG}]:`, JSON.stringify(state));
await browser.close();
