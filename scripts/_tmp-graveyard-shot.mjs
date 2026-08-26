// 一次性诊断:墓地雾光照染色视觉验证(审完即删)——夜/昼对比
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 600; i++) {
  const ready = await page.evaluate(() => ({
    menu: !!document.querySelector('.sw-title-menu'),
    splashUp: !!document.querySelector('#sw-splash'),
  }));
  if (ready.menu && !ready.splashUp) break;
  await new Promise((r) => setTimeout(r, 100));
}
await page.evaluate(() => window.__swFlow.newWorld('12345', 4200, 1200));
for (let i = 0; i < 90 && !(await page.evaluate(() => !!window.__swGame?.world?.store?.w)); i++) {
  await new Promise((r) => setTimeout(r, 1000));
}
await page.evaluate(async () => {
  const g = window.__swGame;
  Object.defineProperty(g, 'biomeCounts', {
    configurable: true,
    get: () => ({ evil: 0, blood: 0, jungle: 0, mushroom: 0, graveyard: 40 }),
    set: () => {},
  });
  let realScene = g.scene;
  Object.defineProperty(g, 'scene', {
    configurable: true,
    get: () => ({ ...realScene, zoneGraveyard: true, graveyardTileCount: 40 }),
    set: (v) => { realScene = v; },
  });
  Object.defineProperty(g, 'graveyardIntensity', { configurable: true, get: () => 1, set: () => {} });
  Object.defineProperty(g.world.weather, 'graveyardVisual', { configurable: true, get: () => 1, set: () => {} });
});
await new Promise((r) => setTimeout(r, 5000));   // 雾积累 + opacity 斜坡
await page.screenshot({ path: '/tmp/va8-graveyard-day.png' });
await page.evaluate(() => {
  const c = window.__swGame.world.clock;
  c.time = c.dayLength * 0.5;   // 切夜
});
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: '/tmp/va8-graveyard-night.png' });
console.log('shots done');
await browser.close();
