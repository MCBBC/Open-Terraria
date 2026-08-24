// 一次性:黄昏光斑验证——切到黄昏后段(紫红相),截标题 + 光斑状态。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
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
await new Promise((r) => setTimeout(r, 1200));
// 黄昏后段(紫红相):time ≈ 46500
await page.evaluate(() => {
  const mb = window.__swMenuBg;
  mb.dayTime = true;
  mb.vTime = 46500;
});
await new Promise((r) => setTimeout(r, 1200));
const state = await page.evaluate(() => {
  const sky = window.__swMenuBg.sky;
  return {
    sun: sky.sunScreen, vis: sky.horizonVisCache,
    sampled: sky.sunVisSampled, visVal: sky.sunVisibility,
  };
});
console.log('FLARE STATE:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/dusk-flare.png' });
console.log('saved /tmp/dusk-flare.png');
await browser.close();
