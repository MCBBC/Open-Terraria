// 一次性诊断:夜晚地表光照采样(审完即删)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  const ready = await page.evaluate(() => ({
    menu: !!window.__swFlow?.newWorld || !!document.querySelector('.sw-title-menu'),
    splashUp: !!document.querySelector('#sw-splash'),
  }));
  if (ready.menu && !ready.splashUp) break;
  await new Promise((r) => setTimeout(r, 100));
}
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('12345', 4200, 1200));
for (let i = 0; i < 90 && !(await page.evaluate(() => !!window.__swGame?.world?.store?.w)); i++) {
  await new Promise((r) => setTimeout(r, 1000));
}
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const rd = g.renderer;
  const px = g.player.cx, py = g.player.cy;
  const sample = () => ({
    timeOfDay: +g.world.clock.timeOfDay.toFixed(3),
    player: rd.lighting ? rd.lighting.lightAt(Math.floor(px / 16), Math.floor(py / 16)) : null,
    above: rd.lighting ? rd.lighting.lightAt(Math.floor(px / 16), Math.floor(py / 16) - 3) : null,
  });
  // 白天
  g.world.clock.timeOfDay = 0.5;
  await new Promise((r2) => setTimeout(r2, 2000));
  const day = sample();
  // 夜(0.9 = 夜段中段)
  g.world.clock.timeOfDay = 0.9;
  await new Promise((r2) => setTimeout(r2, 3000));
  const night = sample();
  return { day, night };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
