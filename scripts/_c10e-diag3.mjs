// 诊断4:shots 同序列——分画布 toDataURL 长度+8x8 画像,定位黑屏来源
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?c10e=1&fx=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => {
  const g = window.__swGame; const r = g.renderer; const sky = r.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } const fx = r.weatherFx; if (fx) fx.update = () => {}; } catch {}
  g.lighting.clock.tick = () => {};
  sky.ambEntities.length = 0; sky.ambNextAttempt = 1000000;
  g.running = false;
  window.__step = (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); g.render(); } };
  window.__probe = () => {
    const r2 = window.__swGame.renderer;
    const info = (src) => {
      const lc = document.createElement('canvas'); lc.width = 8; lc.height = 8;
      const c = lc.getContext('2d'); c.drawImage(src, 0, 0, src.width, src.height, 0, 0, 8, 8);
      return [...c.getImageData(0, 0, 8, 8).data.slice(0, 8)].join(',');
    };
    const gl = document.getElementById('sw-c10e-glcanvas');
    const url = (src) => { const lc = document.createElement('canvas'); lc.width = 64; lc.height = 64; const c = lc.getContext('2d'); c.drawImage(src, 0, 0); return lc.toDataURL().length; };
    return {
      sky: info(r2.skyCanvas), gl: info(gl), hud: info(r2.canvas),
      urlSky: url(r2.skyCanvas), urlGl: url(gl),
      path: r2.composePathUsed, frame: r2._c10eFrame, inter: r2._c10eWorldToHud,
      skyW: r2.skyCanvas.width, glW: gl.width,
    };
  };
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__step(40));
console.log('step40:', JSON.stringify(await page.evaluate(() => window.__probe())));
await page.evaluate(() => { const g = window.__swGame; g.camera.x = 620*16; g.camera.y = 420*16; g.player.x = 620*16; g.player.y = 420*16; });
await page.evaluate(() => window.__step(6));
console.log('cave:', JSON.stringify(await page.evaluate(() => window.__probe())));
process.exit(0);
