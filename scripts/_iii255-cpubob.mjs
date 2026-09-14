// IIII255 CPU 路 bob 验证(?wwarp=0 双臂:slopewave 0/1)——浸润带/斜面覆盖逐格 bob
// 用法(game/): SW_ORIGIN=http://localhost:5304 node tools/run-diag.mjs --timeout=600000 scripts/_iii255-cpubob.mjs
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5304';
const OUT = '/tmp/iii255-out';
mkdirSync(join(OUT, 'cpu'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii255c]', ...a);
const seedDef = (json) => {
  globalThis.__swSeededPut = new Promise((res) => {
    try {
      const req = indexedDB.open('sandboxworld', 2);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
      req.onsuccess = () => {
        const db = req.result;
        try { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(json, 'sandboxworld.quicksave');
          tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => { db.close(); res(); }; tx.onabort = () => { db.close(); res(); };
        } catch { db.close(); res(); }
      };
      req.onerror = () => res();
    } catch { res(); }
  });
};

async function openArm(flagQuery, tag) {
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
  await cleanStorage(page, {});
  await gotoApp(page, ORIGIN, { extraQuery: flagQuery, tries: 30 });
  await waitForBridge(page, { timeout: 240000 });
  log(tag, 'bridge ok');
  await front(page);
  await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
  for (let k = 0; k < 10; k++) {
    const r = await page.evaluate(() => {
      if (!window.__swFlow?.quickLoad) return 'no-flow';
      void window.__swFlow.quickLoad(); return 'dispatched';
    }).catch(() => 'err');
    if (r === 'dispatched') break;
    await sleep(3000);
  }
  for (let i = 0; i < 240; i++) { await sleep(1000); if (await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
  await dismissWelcome(page).catch(() => {});
  await godMode(page, true);
  return page;
}

async function sample(page, tag) {
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
      const loop = () => { const g2 = window.__swGame; if (g2?.__iii251Pin && g2.camera) { g2.camera.x = g2.__iii251Pin.x; g2.camera.y = g2.__iii251Pin.y; } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  });
  await sleep(2000);
  const res = await page.evaluate(async () => {
    const g = window.__swGame;
    const lr = await import('/src/render/VanillaLiquidRenderer.ts');
    const wcss = g.renderer._waveCss ?? null;
    const dpr = g.renderer.canvas.width / g.camera.viewW;
    const zoom = wcss ? wcss.cssZoom * wcss.cssScale : g.camera.zoom;
    const camL = wcss ? wcss.camL : g.camera.x - g.camera.viewW / 2 / zoom;
    const camT = wcss ? wcss.camT : g.camera.y - g.camera.viewH / 2 / zoom;
    const regions = {
      mark1: [3508 * 16 + 1, 394 * 16, 14, 16],
      mark2: [3521 * 16 + 1, 394 * 16, 14, 16],
      half: [3518 * 16 + 1, 394 * 16, 14, 8],
      flat: [3513 * 16 + 1, 394 * 16, 14, 16],
    };
    const rects = {};
    for (const [k, [wx, wy, ww, wh]] of Object.entries(regions)) {
      rects[k] = { x: Math.round((wx - camL) * zoom), y: Math.round((wy - camT) * zoom), w: Math.round(ww * zoom), h: Math.round(wh * zoom) };
    }
    const cv = g.renderer.canvas;
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const octx = off.getContext('2d', { willReadFrequently: true });
    const grab = () => { octx.setTransform(1, 0, 0, 1, 0, 0); octx.drawImage(cv, 0, 0); const o = {}; for (const [k, r] of Object.entries(rects)) o[k] = octx.getImageData(r.x, r.y, r.w, r.h).data; return o; };
    const diffFrac = (a, b) => { let c = 0, n = 0; for (let i = 0; i < a.length; i += 4) { n++; const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d > 8) c++; } return c / n; };
    const rippleSrc = import('/src/render/WaterWaves.ts');
    const samples = [];
    let f = 0;
    return new Promise((res2) => {
      const step = async () => {
        f++;
        if (f % 30 === 15) { try { (await rippleSrc).queueRipple(3513 * 16 + 8, 394 * 16 + 8, 2.5); } catch { } }
        if (f % 5 === 0) {
          samples.push(grab());
          if (samples.length >= 24) {
            const stats = {};
            for (const k of Object.keys(regions)) {
              const longs = [];
              for (let i = 4; i < samples.length; i++) longs.push(diffFrac(samples[0][k], samples[i][k]));
              const mean = longs.reduce((s, v) => s + v, 0) / longs.length;
              stats[k] = +mean.toFixed(4);
            }
            res2({ stats, cpuRender: g.renderer.isCpuRender ? g.renderer.isCpuRender() : null, slopeFlag: lr.slopeWaveEnabled });
            return;
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
  log(tag, JSON.stringify(res));
  return res;
}

const saveJsonTxt = fs.readFileSync('/Users/vinlic/Downloads/map-Starter_World (30).json', 'utf8');
const browser = await launchBrowser({ errors: [] });
const pageA = await openArm('?wwarp=0', 'cpu-off');
const A = await sample(pageA, 'cpu-off');
const pageB = await openArm('?wwarp=0&slopewave=1', 'cpu-on');
const B = await sample(pageB, 'cpu-on');
log('CPU-VERDICT', JSON.stringify({ off: A.stats, on: B.stats }));
process.exit(0);
