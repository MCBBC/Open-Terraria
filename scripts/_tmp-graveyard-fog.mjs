// 一次性诊断:墓地雾最终验证(审完即删)——贴地/不上升/密度/昼夜
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
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 60000 });
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
await new Promise((r) => setTimeout(r, 6000));   // 雾带饱和
await page.screenshot({ path: '/tmp/va9-graveyard-day.png' });
const stats = await page.evaluate(() => {
  const np = window.__swGame.constructor; // 占位
  return null;
});
const r2 = await page.evaluate(async () => {
  const np = (await import('/src/render/NatureParticles.ts')).natureParticles;
  const cs = np.clouds;
  const ys = cs.map((c) => c.y);
  return { n: cs.length, minY: ys.length ? Math.round(Math.min(...ys)) : 0, maxY: ys.length ? Math.round(Math.max(...ys)) : 0,
    playerY: Math.round(window.__swGame.player.y) };
});
console.log(JSON.stringify(r2, null, 1));
await browser.close();
