// 一次性诊断:墓地雾位置的光照采样值(审完即删)——夜/昼各测一轮
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
const r = await page.evaluate(async (night) => {
  const g = window.__swGame;
  if (night) {
    const c = g.world.clock;
    c.time = c.dayLength * 0.5;
  }
  await new Promise((r2) => setTimeout(r2, 6000));   // 雾积累 + 光照稳定
  const np = (await import('/src/render/NatureParticles.ts')).natureParticles;
  const rd = window.__swGame.renderer;
  const cs = np.clouds.slice(0, 8).map((c) => ({
    tx: Math.floor((c.x + 15) / 16), ty: Math.floor(c.y / 16),
    light: rd.lighting ? rd.lighting.lightAt(Math.floor((c.x + 15) / 16), Math.floor(c.y / 16)) : null,
    hasLighting: !!rd.lighting,
  }));
  return { night, sample: cs };
}, false);
console.log('DAY:', JSON.stringify(r));
// 切夜再测
const r2 = await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.clock.time = g.world.clock.dayLength * 0.5;
  await new Promise((r2) => setTimeout(r2, 4000));
  const rd = g.renderer;
  const np = (await import('/src/render/NatureParticles.ts')).natureParticles;
  const cs = np.clouds.slice(0, 8).map((c) => ({
    light: rd.lighting ? rd.lighting.lightAt(Math.floor((c.x + 15) / 16), Math.floor(c.y / 16)) : null,
  }));
  return { night: true, sample: cs };
});
console.log('NIGHT:', JSON.stringify(r2));
await browser.close();
