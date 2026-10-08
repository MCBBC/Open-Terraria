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
  window.__args = null;
  const orig = r.drawBuilderRulers.bind(r);
  r.drawBuilderRulers = function (ctx, world, cam, viewW, viewH, z) {
    const rec = [];
    const origDI = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (...a) {
      if (rec.length < 24 && a.length >= 9) {
        const src = a[0];
        rec.push({ dim: src.width + 'x' + src.height, s: [a[1], a[2], a[3], a[4]], d: [a[5], a[6], a[7], a[8]], gco: ctx.globalCompositeOperation, ga: Math.round(ctx.globalAlpha * 1000) / 1000 });
      }
      return origDI(...a);
    };
    try { return orig(ctx, world, cam, viewW, viewH, z); }
    finally { ctx.drawImage = origDI; window.__args = { rec, camX: cam.x, camY: cam.y, z, viewW, viewH, br: r.builderRulers ? { mouseTx: r.builderRulers.mouseTx, mouseTy: r.builderRulers.mouseTy, gridDist: r.builderRulers.gridDist } : null }; }
  };
});
await freezeClock(page, { tod: 0.5 });
await page.mouse.move(1050, 650);
await pump(page, 60);
console.log('ARGS:', JSON.stringify(await page.evaluate(() => window.__args)));
await browser.close();
