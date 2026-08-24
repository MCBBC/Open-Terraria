// 一次性:菜单流星视觉验证——深夜 6 连拍(150ms 间隔)+ 坠星状态。
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
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const mb = window.__swMenuBg;
  mb.vTime = 16200;
  mb.dayTime = false;
});
await new Promise((r) => setTimeout(r, 1200));
for (let k = 0; k < 6; k++) {
  await page.screenshot({ path: `/tmp/met-${k}.png`, clip: { x: 0, y: 0, width: 1280, height: 420 } });
  await new Promise((r) => setTimeout(r, 150));
}
const state = await page.evaluate(() => {
  const sky = window.__swMenuBg.sky;
  const f = sky.stars.filter((s) => s.falling && !s.hidden);
  return { falling: f.length, total: sky.stars.length };
});
console.log('STARS:', JSON.stringify(state));
await browser.close();
