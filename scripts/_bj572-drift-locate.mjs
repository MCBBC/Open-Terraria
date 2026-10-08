import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky; const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch {}
  try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } const fx = g.renderer.weatherFx; if (fx) { fx.update = () => {}; (fx.pool||[]).forEach(d=>d.active=false); (fx.snow||[]).forEach(d=>d.active=false); (fx.sand||[]).forEach(d=>d.active=false); } } catch {}
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[0] = 1; g.player.builderAccStatus[1] = 0;
  const lc = document.createElement('canvas'); const lctx = lc.getContext('2d', { willReadFrequently: true });
  window.__snap = () => {
    const c = g.renderer.canvas;
    if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
    lctx.clearRect(0,0,lc.width,lc.height); lctx.drawImage(c,0,0);
    return lctx.getImageData(0,0,lc.width,lc.height).data;
  };
  window.__diff = (A, B) => {
    let cnt = 0; const col = new Map(); const row = new Map(); let maxd = 0;
    const W = 1280;
    for (let i = 0; i < A.length; i += 4) {
      const d = Math.max(Math.abs(A[i]-B[i]), Math.abs(A[i+1]-B[i+1]), Math.abs(A[i+2]-B[i+2]));
      if (d > 0) { cnt++; if (d > maxd) maxd = d; const idx = i>>2; const x = idx % W, y = (idx / W) | 0;
        col.set((x/80|0)*80, (col.get((x/80|0)*80)||0)+1); row.set((y/80|0)*80, (row.get((y/80|0)*80)||0)+1); }
    }
    const top = (m) => [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);
    return { cnt, maxd, cols: top(col), rows: top(row) };
  };
});
await freezeClock(page, { tod: 0.5 });
await page.mouse.move(930, 470);
await pump(page, 90);
await page.evaluate(() => { window.__A = window.__snap(); });
await pump(page, 1);
await page.evaluate(() => { window.__B = window.__snap(); });
const d = await page.evaluate(() => window.__diff(window.__A, window.__B));
console.log('DIFF px:', d.cnt, 'maxd:', d.maxd);
console.log('hot 80px-cols:', JSON.stringify(d.cols));
console.log('hot 80px-rows:', JSON.stringify(d.rows));
await browser.close();
