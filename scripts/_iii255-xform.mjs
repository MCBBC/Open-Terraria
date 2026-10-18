// IIII255 渲染变换定谳:endFgPass 时刻读 fgCtx 世界变换 + camera.viewW/zoom
// → 验算 verify 探针矩形映射落点 vs 门控画布真值
// 用法(game/): SW_ORIGIN=http://localhost:5304 node tools/run-diag.mjs --timeout=300000 scripts/_iii255-xform.mjs
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5304';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii255x]', ...a);
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
    void window.__swFlow.quickLoad(); return 'dispatched';
  }).catch(() => 'err');
  if (r === 'dispatched') break;
  await sleep(3000);
}
for (let i = 0; i < 240; i++) { await sleep(1000); if (await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
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
    const loop = () => { const g2 = window.__swGame; if (g2?.__iii251Pin && g2.camera) { g2.camera.x = g2.__iii251Pin.x; g2.camera.y = g2.__iii251Pin.y; } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
});
await sleep(2000);
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wwc = g.renderer.waterWarp;
  let xform = null, gateAlphaAtVerifyRects = null;
  if (!wwc.__iii255x) {
    wwc.__iii255x = true;
    const oEF = wwc.endFgPass.bind(wwc);
    wwc.endFgPass = (ctx) => {
      try {
        const m = wwc.fgCtx ? wwc.fgCtx.getTransform() : null;
        if (m) xform = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
        const gc = wwc.gateCanvas();
        if (gc && xform) {
          const x2 = gc.getContext('2d', { willReadFrequently: true });
          const w2d = (wx, wy) => [xform.a * wx + xform.c * wy + xform.e, xform.b * wx + xform.d * wy + xform.f];
          // verify 口径矩形
          const cv = g.renderer.canvas;
          const dprV = cv.width / g.camera.viewW;
          const zoomV = g.camera.zoom;
          const camLV = g.camera.x - g.camera.viewW / 2 / zoomV;
          const camTV = g.camera.y - g.camera.viewH / 2 / zoomV;
          const regions = {
            mark1: [3508 * 16, 394 * 16, 16, 16], mark2: [3521 * 16, 394 * 16, 16, 16],
            half: [3518 * 16, 394 * 16, 16, 8], flat: [3513 * 16, 394 * 16, 16, 16],
          };
          gateAlphaAtVerifyRects = {};
          for (const [k, [wx, wy, ww2, wh2]] of Object.entries(regions)) {
            const x0 = Math.round((wx - camLV) * zoomV * dprV), y0 = Math.round((wy - camTV) * zoomV * dprV);
            const wpx = Math.max(2, Math.round(ww2 * zoomV * dprV)), hpx = Math.max(2, Math.round(wh2 * zoomV * dprV));
            let sum = 0, n = 0, mx = 0;
            for (let yy = y0; yy < y0 + hpx; yy += 2) for (let xx = x0; xx < x0 + wpx; xx += 2) {
              if (xx < 0 || yy < 0 || xx >= gc.width || yy >= gc.height) continue;
              const a = x2.getImageData(xx, yy, 1, 1).data[3];
              sum += a; n++; mx = Math.max(mx, a);
            }
            // 该矩形四角对应的世界坐标(用真变换反推)
            const inv = (dx, dy) => [(dx - xform.e) / xform.a, (dy - xform.f) / xform.d];
            const [wx00, wy00] = inv(x0, y0);
            const [wx11, wy11] = inv(x0 + wpx, y0 + hpx);
            gateAlphaAtVerifyRects[k] = { rect: [x0, y0, wpx, hpx], meanA: +(sum / Math.max(1, n)).toFixed(2), maxA: mx, worldSpan: [wx00, wy00, wx11, wy11].map(Math.round) };
          }
        }
      } catch (e) { xform = { err: String(e) }; }
      oEF(ctx);
    };
  }
  await new Promise((r) => setTimeout(r, 700));
  return {
    xform, gateAlphaAtVerifyRects,
    cam: { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom, viewW: g.camera.viewW, viewH: g.camera.viewH },
    cv: { w: g.renderer.canvas.width, h: g.renderer.canvas.height },
    wcss: g.renderer._waveCss ? { camL: g.renderer._waveCss.camL, camT: g.renderer._waveCss.camT, cssZoom: g.renderer._waveCss.cssZoom, cssScale: g.renderer._waveCss.cssScale, cssW: g.renderer._waveCss.cssW } : null,
  };
});
log('cam:', JSON.stringify(out.cam), 'cv:', JSON.stringify(out.cv));
log('wcss:', JSON.stringify(out.wcss));
log('xform:', JSON.stringify(out.xform));
log('verifyRects on gate canvas:', JSON.stringify(out.gateAlphaAtVerifyRects, null, 1));
process.exit(0);
