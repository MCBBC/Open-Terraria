// ★opresent 诊断:合并门逐项取值（一次性）
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?opresent=1');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);
await page.evaluate(() => window.__swGame.renderer.sky.ambNextAttempt = 1000000);
await page.evaluate(() => { window.__vnow = performance.now(); window.__swGame.frame(window.__vnow); });
const d = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const sky = r.sky;
  // ★运行时翻面探针:opresentSetForTest 是否可用/生效（bootstrap 洗参防线同款）
  let flipWorks = false;
  try { r.constructor.opresentSetForTest(true); flipWorks = r.constructor.opresent === true; r.constructor.opresentSetForTest(false); } catch (e) { flipWorks = 'exc:' + e.message; }
  return {
    flag: r.constructor.opresent,
    flipWorks,
    ctorName: r.constructor?.name,
    capture: r._capturePass,
    fullbright: r.fullbright,
    wfbo: r.constructor.wfbo,
    cpu: r.isCpuRender(),
    worldLayerEnabled: r.worldLayerEnabled,
    worldLayerActive: r.worldLayerActive,
    shimmer: r.monoFilters.shimmerAlpha,
    pred: sky.opresentInterlayerPending(),
    predParts: {
      lantern: sky.lanternOpacity,
      party: sky.fx?.party,
      slime: sky.slimeSky?.isActive,
      martian: sky.martianSky?.isActive,
      dramaCore: sky.dramaCore !== null,
      pieces: sky.dramaPieces?.length,
      explosions: sky.dramaExplosions?.length,
      amb: sky.ambEntities?.length,
      pending: sky.pendingAmbientSpawns?.length,
      nextAttempt: sky.ambNextAttempt,
      remote: sky.ambientRemoteDriven,
    },
    cloudPipe: r.constructor.cloudPipe,
    merge: r.cloudMergeUsed,
    compose: r.composePathUsed,
  };
});
console.log(JSON.stringify(d, null, 1));
await browser.close();
