// IIII255 波场位移时序 + 缓冲环剖面（ON 臂）——mark1 为何零位移定谳
// 用法(game/): SW_ORIGIN=http://localhost:5304 node tools/run-diag.mjs --timeout=300000 scripts/_iii255-timeseries.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5304';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii255t]', ...a);

const seedDef = (json) => {
  globalThis.__swSeededPut = new Promise((res) => {
    try {
      const req = indexedDB.open('sandboxworld', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(json, 'sandboxworld.quicksave');
          tx.oncomplete = () => { db.close(); res(); };
          tx.onerror = () => { db.close(); res(); };
          tx.onabort = () => { db.close(); res(); };
        } catch { db.close(); res(); }
      };
      req.onerror = () => res();
    } catch { res(); }
  });
};

const saveJsonTxt = fs.readFileSync(needInput(join(DOWNLOADS, 'map-Starter_World (30).json')), 'utf8');
const browser = await launchBrowser({ errors: [] });
const page = await openPage(browser, { errors: [] });
page.__probeOrigin = ORIGIN;
await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
await cleanStorage(page, {});
await gotoApp(page, ORIGIN, { extraQuery: '?slopewave=1', tries: 30 });
await waitForBridge(page, { timeout: 240000 });
await front(page);
await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
for (let k = 0; k < 10; k++) {
  const r = await page.evaluate(() => {
    if (!window.__swFlow?.quickLoad) return 'no-flow';
    void window.__swFlow.quickLoad();
    return 'dispatched';
  }).catch(() => 'err');
  if (r === 'dispatched') break;
  await sleep(3000);
}
for (let i = 0; i < 240; i++) {
  await sleep(1000);
  if (await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break;
}
await dismissWelcome(page).catch(() => {});
await godMode(page, true);
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
await sleep(1200);
await camSnapToTile(page, 3517, 394, { player: false });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
await page.evaluate(() => {
  const g = window.__swGame;
  g.__iii251Pin = { x: 3517 * 16, y: 394 * 16 };
  if (!g.__iii251PinLoop) {
    g.__iii251PinLoop = true;
    const loop = () => {
      const g2 = window.__swGame;
      if (g2?.__iii251Pin && g2.camera) { g2.camera.x = g2.__iii251Pin.x; g2.camera.y = g2.__iii251Pin.y; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
});
await sleep(2000);

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ww = await import('/src/render/WaterWaves.ts');
  const W = ww.waterWaves;
  const wcss = g.renderer._waveCss;
  const camL = wcss.camL, camT = wcss.camT, cssZoom = wcss.cssZoom;
  const bCoord = (wx, wy) => [Math.floor((wx - camL) * cssZoom * 0.25), Math.floor((wy - camT) * cssZoom * 0.25)];
  const pts = { mark1: [3508 * 16 + 8, 394 * 16 + 8], half: [3518 * 16 + 8, 394 * 16 + 8], flat: [3513 * 16 + 8, 394 * 16 + 8], mark2: [3521 * 16 + 8, 394 * 16 + 8] };
  const bpts = {};
  for (const [k, [wx, wy]] of Object.entries(pts)) bpts[k] = bCoord(wx, wy);
  // 时序:180 帧,每 30 帧注波
  const series = { mark1: [], half: [], flat: [], mark2: [] };
  const disp = [0, 0];
  let f = 0;
  await new Promise((res) => {
    const step = () => {
      f++;
      if (f % 30 === 15) { try { ww.queueRipple(3513 * 16 + 8, 394 * 16 + 8, 2.5); } catch { } }
      for (const k of Object.keys(pts)) {
        W.sampleDisplace(pts[k][0], pts[k][1], disp);
        series[k].push(+disp[1].toFixed(3));   // dy 为主信号(垂直起伏)
      }
      if (f >= 180) { res(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const stat = (arr) => {
    const min = Math.min(...arr), max = Math.max(...arr);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length);
    let zc = 0;
    for (let i = 1; i < arr.length; i++) if ((arr[i - 1] < 0) !== (arr[i] < 0)) zc++;
    return { min: +min.toFixed(3), max: +max.toFixed(3), mean: +mean.toFixed(3), sd: +sd.toFixed(4), zc };
  };
  const stats = {};
  for (const k of Object.keys(series)) stats[k] = stat(series[k]);
  // 缓冲剖面:水行 bpts.flat[1] 行,R−0.5 有符号,全宽
  const grid = W.readGridR();
  const gw = W.gridW(), gh = W.gridH();
  const rowY = Math.min(gh - 1, Math.max(0, bpts.flat[1]));
  const prof = [];
  for (let x = 0; x < gw; x++) {
    const v = grid[rowY * gw + x] - 0.5;
    prof.push(Math.abs(v) < 0.004 ? '.' : v < 0 ? 'n' : 'N');
  }
  // 波源列与两 mark 列在剖面的位置
  const srcX = bCoord(3513 * 16 + 8, 0)[0];
  return { bpts, srcX, rowY, gw, gh, stats, profStr: prof.join(''), profMark1: prof.slice(bpts.mark1[0] - 4, bpts.mark1[0] + 5).join(''), profMark2: prof.slice(bpts.mark2[0] - 4, bpts.mark2[0] + 5).join(''), dbg: W.debug() };
});
log('bpts:', JSON.stringify(out.bpts), 'srcX:', out.srcX, 'rowY:', out.rowY, 'grid:', out.gw + 'x' + out.gh);
log('stats:', JSON.stringify(out.stats));
log('dbg:', JSON.stringify(out.dbg));
log('profMark1:', out.profMark1, ' profMark2:', out.profMark2);
log('PROF(row ' + out.rowY + '):');
for (let i = 0; i < out.profStr.length; i += 100) {
  log(String(i).padStart(3), out.profStr.slice(i, i + 100));
}
process.exit(0);
