// 一次性诊断:雾运行时 tint 值 + 截图像素对照(审完即删)
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
  g.world.clock.timeOfDay = 0.9;   // 夜
});
await new Promise((r) => setTimeout(r, 6000));
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const np = (await import('/src/render/NatureParticles.ts')).natureParticles;
  const rd = g.renderer;
  const cs = np.clouds.slice(0, 6).map((c) => {
    const tx = Math.floor((c.x + 15) / 16), ty = Math.floor(c.y / 16);
    return { tx, ty, light: rd.lighting?.lightAt(tx, ty), alpha: c.alpha, screenY: null };
  });
  // 屏幕位(供像素采样)
  const cam = { x: rd.camera?.x ?? 0, y: rd.camera?.y ?? 0 };
  const pts = np.clouds.slice(0, 6).map((c) => ({
    sx: Math.round(c.x - cam.x), sy: Math.round(c.y - cam.y),
  }));
  return { clouds: cs, pts, camY: cam.y, camX: cam.x, time: +g.world.clock.timeOfDay.toFixed(2) };
});
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: '/tmp/va10-night.png' });
// 采截图像素(雾中心)
await browser.close();
