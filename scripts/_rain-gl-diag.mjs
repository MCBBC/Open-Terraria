import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260926 });
await godMode(page, true);
await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world.weather;
  w.startRain(true, 1);
  w.raining = true;
  const hk = g.weatherHooks;
  hk.zoneRain = true; hk.surfaceAtmospherics = true; hk.atmo = 1;
  window.__diag = { g: !!g, raining: w.raining, cloudAlpha: w.cloudAlpha, maxRaining: w.maxRaining,
    zoneRain: hk.zoneRain, atmo: hk.atmo, worldSurface: g.world.worldSurface, playerY: g.player.y,
    wType: w.constructor.name, hasFx: !!g.renderer.weatherFx, active: g.renderer.weatherFxActive,
    fxWeather: !!g.renderer.weatherFx.weather, fxHooks: !!g.renderer.weatherFx.hooks };
  // 手动 update 一次
  const fx = g.renderer.weatherFx;
  const c = g.renderer.canvas, cam = g.camera;
  const vW = c.width / (cam.zoom || 1), vH = c.height / (cam.zoom || 1);
  fx.update(g.world, vW, vH, cam.x - vW / 2, cam.y - vH / 2, 0, 0);
  let n = 0; for (const d of fx.pool) if (d.active) n++;
  window.__diag.afterUpdate = n;
  window.__diag.fxCloudAlpha = fx.weather?.cloudAlpha;
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await page.evaluate(() => {
  const g = window.__swGame;
  const fx = g.renderer.weatherFx;
  const c = g.renderer.canvas, cam = g.camera;
  const vW = c.width / (cam.zoom || 1), vH = c.height / (cam.zoom || 1);
  for (let i = 0; i < 30; i++) fx.update(g.world, vW, vH, cam.x - vW / 2, cam.y - vH / 2, 0, 0);
  let n = 0; for (const d of fx.pool) if (d.active) n++;
  window.__diag.after30 = n;
  window.__diag.paused = g.paused;
});
console.log(JSON.stringify(await page.evaluate(() => window.__diag), null, 1));
await browser.close();
process.exit(0);
