import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, 'http://localhost:5204/?dustbatch=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261017 });
await pump(page, 30);
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const proto = Object.getPrototypeOf(r);
  window.__dbLive = [];
  const orig = proto.drawVanillaDustPass;
  proto.drawVanillaDustPass = function (...a) {
    const sh = r.bglEntShim;
    window.__dbLive.push({
      shimNull: !sh, active: sh?.active ?? null,
      glw: !!sh?.glwNow?.() ?? null, accMode: r._accMode,
      path: r.bglPathUsed,
      avail: sh ? sh.batchAvail() : null,
      clipped: sh?.clipped ?? null, filter: sh?.filterV ?? null, ga: sh?.ga ?? null, gco: sh?.gco ?? null,
      bglFlag: r.constructor.bgl, bglShimFlag: r.constructor.bglShim,
      worldLayerActive: r.worldLayerActive, cpuRender: r.isCpuRender(),
    });
    return orig.apply(this, a);
  };
});
await page.evaluate(() => { window.__vnow = (window.__vnow || performance.now()) + 16.7; window.__swGame.frame(window.__vnow); });
const out = await page.evaluate(() => window.__dbLive.slice(-4));
for (const o of out) console.log(JSON.stringify(o));
await browser.close();
