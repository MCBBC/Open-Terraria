// IIII256 性能闸:同点位(3517,394) zoom2 rAF 300 帧(含 3 轮) vs III255 基线 on=16.638ms
import fs from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5305';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii256p]', ...a);
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
await gotoApp(page, ORIGIN, { extraQuery: '?slopewave=1', tries: 30 });
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
await sleep(1500);
const rounds = [];
for (let r = 0; r < 3; r++) {
  const st = await page.evaluate(() => new Promise((res) => {
    const ds = [];
    let last = performance.now(), n = 0;
    const step = () => {
      const t = performance.now();
      ds.push(t - last); last = t;
      if (++n >= 300) { ds.shift(); res(ds); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }));
  const avg = st.reduce((s, v) => s + v, 0) / st.length;
  const sorted = [...st].sort((a, b) => a - b);
  rounds.push({ avg: +avg.toFixed(3), p50: +sorted[st.length >> 1].toFixed(3), p95: +sorted[Math.floor(st.length * 0.95)].toFixed(3) });
  await sleep(400);
}
log('rAF rounds:', JSON.stringify(rounds));
log('baseline III255 on-arm: avg 16.638');
process.exit(0);
