import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
await page.evaluate(() => {
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[0] = 1; g.player.builderAccStatus[1] = 0;
  const r = g.renderer;
  window.__zoomSnap = null;
  const orig = r.drawBuilderRulers.bind(r);
  r.drawBuilderRulers = function (ctx, world, cam, viewW, viewH, z) {
    if (!window.__zoomSnap) {
      window.__zoomSnap = { z, viewW, viewH, zoom: cam.zoom, m: ctx.getTransform ? JSON.stringify(ctx.getTransform()) : 'n/a' };
    }
    return orig(ctx, world, cam, viewW, viewH, z);
  };
});
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);
console.log('ZOOM-SNAP:', JSON.stringify(await page.evaluate(() => window.__zoomSnap)));
await browser.close();
