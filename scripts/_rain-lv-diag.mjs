// 雷击雨探针预诊:为何 drops=0 / 为何 lightning=1 天空不白
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5252';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const pre = await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  return {
    raining: w.raining, cloudAlpha: w.cloudAlpha, maxRaining: w.maxRaining,
    storming: w.storming, zoneRain: g.world.scene?.zoneRain,
    surfAtmo: g.world.scene?.surfaceAtmospherics,
    playerY: g.player.y, playerCY: g.player.cy,
    worldSurface: g.world.worldSurface ?? g.world.surface ?? null,
    weatherRefNull: !g.renderer.sky.weatherRef,
    weatherRefIsW: g.renderer.sky.weatherRef === w,
  };
});
console.log('PRE', JSON.stringify(pre));

await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  g.world.clock.timeOfDay = 0.9;
  w.cloudAlpha = 0.9; w.maxRaining = 0.9; w.raining = true;
  w.windSpeedTarget = 0.7; w.windSpeedCurrent = 0.7;
  w.shouldUseStormMusic = true; w.storming = true;
  w.newLightning = () => {};
  w.lightning = 1; w.lightningSpeed = 0; w.lightningDecay = 0;
});
await new Promise((r) => setTimeout(r, 3000));
const post = await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  const fx = g.renderer.weatherFx;
  const drops = fx.pool.reduce((n, d) => n + (d.active ? 1 : 0), 0);
  const hooks = fx.hooks;
  return {
    raining: w.raining, cloudAlpha: w.cloudAlpha, maxRaining: w.maxRaining, storming: w.storming,
    lightning: w.lightning, lightningDecay: w.lightningDecay,
    zoneRain: g.world.scene?.zoneRain, surfAtmo: g.world.scene?.surfaceAtmospherics,
    drops,
    hooksNull: !hooks,
    zoneRainHook: hooks?.zoneRain, atmoHook: hooks?.atmo, shimmerHook: hooks?.shimmerAlpha,
    cloudAlphaField: w.cloudAlpha,
    weatherRefNull: !g.renderer.sky.weatherRef,
    lightVal: w.lightning,
  };
});
console.log('POST', JSON.stringify(post));
// 渲染侧帧状态(SkyColor 模块级 frameLightning)
const frame = await page.evaluate(async () => {
  const SC = await import('/src/lighting/SkyColor.ts');
  const st = SC.getSkyFrameState();
  return { lightning: st.lightning, cloudDim: st.cloudDim, atmo: st.atmo };
});
console.log('FRAME', JSON.stringify(frame));
await browser.close();
