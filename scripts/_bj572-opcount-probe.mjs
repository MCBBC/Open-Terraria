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
  window.__opSnap = null;
  const orig = r.drawBuilderRulers.bind(r);
  r.drawBuilderRulers = function (ctx, world, cam, viewW, viewH, z) {
    let di = 0; const origDI = ctx.drawImage.bind(ctx);
    ctx.drawImage = (...a) => { di++; return origDI(...a); };
    try { return orig(ctx, world, cam, viewW, viewH, z); }
    finally { ctx.drawImage = origDI; window.__opSnap = { di, gridOn: !!(r.builderRulers && r.builderRulers.gridOn), nx: r.builderRulers ? Math.floor((viewW / z + 100) / 16) : null }; }
  };
});
await freezeClock(page, { tod: 0.5 });
await page.mouse.move(1050, 650);
await pump(page, 60);
console.log('OPS:', JSON.stringify(await page.evaluate(() => window.__opSnap)));
await browser.close();
