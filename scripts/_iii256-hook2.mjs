// IIII256 钩子 v2:全画布上下文记录坡面 tile 上的绘制调用(世界系+设备系双域)
import fs from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5305';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii256h2]', ...a);
const seedDef = (json) => {
  globalThis.__swSeededPut = new Promise((res) => {
    try {
      const req = indexedDB.open('sandboxworld', 2);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
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
const saveJsonTxt = fs.readFileSync('/Users/vinlic/Downloads/map-Starter_World (30).json', 'utf8');
const browser = await launchBrowser({ errors: [] });
const page = await openPage(browser, { errors: [] });
page.__probeOrigin = ORIGIN;
await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
await cleanStorage(page, {});
await gotoApp(page, ORIGIN, { extraQuery: '?slopewave=1&wwarp=0', tries: 30 });
await waitForBridge(page, { timeout: 240000 });
await front(page);
await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
for (let k = 0; k < 10; k++) {
  const r = await page.evaluate(() => { if (!window.__swFlow?.quickLoad) return 'no-flow'; void window.__swFlow.quickLoad(); return 'dispatched'; }).catch(() => 'err');
  if (r === 'dispatched') break;
  await sleep(3000);
}
let ok = false;
for (let i = 0; i < 240; i++) { await sleep(1000); ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store)); if (ok) break; }
if (!ok) throw new Error('game-timeout');
await dismissWelcome(page).catch(() => {});
await godMode(page, true);
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
await sleep(1200);
await camSnapToTile(page, 3517, 394, { player: false });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
await sleep(800);
await page.evaluate(() => {
  const g = window.__swGame;
  const wc = g.renderer._waveCss;
  const Z = wc.cssZoom;
  const WRECTS = [[3508 * 16, 394 * 16, 16, 16], [3521 * 16, 394 * 16, 16, 16]];
  const DRECTS = WRECTS.map(([x, y, w, h]) => [Math.round((x - wc.camL) * Z), Math.round((y - wc.camT) * Z), Math.round(w * Z), Math.round(h * Z)]);
  const hitAny = (r) => {
    const [x, y, w, h] = r;
    const inter = (t) => x < t[0] + t[2] && x + w > t[0] && y < t[1] + t[3] && y + h > t[1];
    return WRECTS.some(inter) || DRECTS.some(inter);
  };
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__iii256h2) {
    proto.__iii256h2 = true;
    const od = proto.drawImage, of = proto.fillRect;
    window.__iii256Calls = [];
    let n = 0;
    proto.drawImage = function (...a) {
      try {
        if (n < 4000 && a.length >= 5) {
          const tr = a.length === 9 ? [a[5], a[6], a[7], a[8]] : [a[1], a[2], a[3], a[4]];
          if (hitAny(tr)) {
            n++;
            let src = '?', tag = '';
            try {
              const im = a[0];
              src = `${im.width}x${im.height}`;
              if (im.__swTag) tag = im.__swTag;
            } catch { }
            const m = this.getTransform();
            window.__iii256Calls.push(`img ${src}${tag ? '[' + tag + ']' : ''} ${a.length === 9 ? `src(${a[1]},${a[2]},${a[3]},${a[4]})` : ''} dst(${tr.map(v => Math.round(v)).join(',')}) a=${this.globalAlpha.toFixed(2)} xf=${m.a.toFixed(2)},${m.e.toFixed(1)},${m.f.toFixed(1)} cv=${this.canvas.width}x${this.canvas.height}`);
          }
        }
      } catch { }
      return od.apply(this, a);
    };
    proto.fillRect = function (x, y, w, h) {
      try {
        if (n < 4000 && hitAny([x, y, w, h])) {
          n++;
          const m = this.getTransform();
          window.__iii256Calls.push(`rect dst(${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}) a=${this.globalAlpha.toFixed(2)} xf=${m.a.toFixed(2)},${m.e.toFixed(1)},${m.f.toFixed(1)} cv=${this.canvas.width}x${this.canvas.height} fill=${String(this.fillStyle).slice(0, 30)}`);
        }
      } catch { }
      return of.apply(this, arguments);
    };
  }
});
await sleep(500);
const calls = await page.evaluate(() => { const c = window.__iii256Calls ?? []; window.__iii256Calls = []; return c; });
log('calls (' + calls.length + '):');
const seen = new Map();
for (const c of calls) seen.set(c, (seen.get(c) ?? 0) + 1);
for (const [c, n] of seen) log(`  x${n} ${c}`);
process.exit(0);
