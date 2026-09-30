// C10e 目检:A/B 合成快照落 PNG——洞穴/色罩/灯笼夜/翻转 相位
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errs = [];
async function arm(url, tag) {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push(`[${tag}] ` + e.message));
  await bootstrap(page, url);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await page.evaluate(() => {
    const g = window.__swGame; const r = g.renderer; const sky = r.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
      return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
    };
    try {
      const w = g.world.weather;
      if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; w.lightning = 0; }
      const fx = r.weatherFx; if (fx) fx.update = () => {};
    } catch {}
    g.lighting.clock.tick = () => {};
    sky.ambEntities.length = 0; sky.ambNextAttempt = 1000000;
    import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; m.options.data.swayInWind = false; });
    g.running = false;
    window.__step = (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); g.render(); } };
    window.__shot = () => {
      const lc = document.createElement('canvas');
      lc.width = r.canvas.width; lc.height = r.canvas.height;
      const c = lc.getContext('2d');
      if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
      c.drawImage(r.canvas, 0, 0);
      return lc.toDataURL('image/png');
    };
  });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => window.__step(40));
  return page;
}
const pageA = await arm(ORIGIN + '/?fx=0', 'A');
const pageB = await arm(ORIGIN + '/?c10e=1&fx=0', 'B');
fs.mkdirSync('shots/c10e', { recursive: true });

async function shot(name, setup) {
  await pageA.evaluate(setup); await pageB.evaluate(setup);
  await pageA.evaluate(() => window.__step(6)); await pageB.evaluate(() => window.__step(6));
  const a = await pageA.evaluate(() => window.__shot());
  const b = await pageB.evaluate(() => window.__shot());
  fs.writeFileSync(`shots/c10e/${name}-A.png`, Buffer.from(a.split(',')[1], 'base64'));
  fs.writeFileSync(`shots/c10e/${name}-B.png`, Buffer.from(b.split(',')[1], 'base64'));
  console.log(`${name}: saved`);
}
await shot('cave', () => {
  const g = window.__swGame;
  g.camera.x = 620 * 16; g.camera.y = 420 * 16; g.player.x = 620 * 16; g.player.y = 420 * 16;
});
await shot('tint', () => {
  const g = window.__swGame;
  g.renderer.sky.weatherTintPasses = () => [{ kind: 'SkyWeatherTint', alpha: 0.5, color: [1, 0.8, 0.5] }];
});
await shot('lantern', () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.0;
  delete g.renderer.sky.weatherTintPasses;
  g.renderer.sky.lanternOpacity = 0.8;
});
await shot('flip', () => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0.5;
  const p = g.player;
  Object.defineProperty(p, 'gravDir', { get: () => -1, set: () => {}, configurable: true });
});
console.log('errs:', errs.slice(0, 3));
process.exit(0);
