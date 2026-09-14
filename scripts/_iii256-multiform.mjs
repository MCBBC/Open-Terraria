// IIII256 多形态验证:灰砖坡(3508 slope1 / 3521 slope2 变异 gray_brick)→截图→还原
import fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5305';
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii256-out';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii256m]', ...a);
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
await sleep(1500);
await camSnapToTile(page, 3517, 394, { player: false });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
await page.evaluate(() => {
  const g = window.__swGame;
  g.__iii256Pin = { x: 3517 * 16, y: 394 * 16 };
  if (!g.__iii256PinLoop) {
    g.__iii256PinLoop = true;
    const loop = () => { const g2 = window.__swGame; if (g2?.__iii256Pin && g2.camera) { g2.camera.x = g2.__iii256Pin.x; g2.camera.y = g2.__iii256Pin.y; } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
});
await sleep(2000);

const shot = () => page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  c2.getContext('2d').drawImage(cv, 0, 0);
  return { full: c2.toDataURL('image/png'), wc: g.renderer._waveCss };
});

// ① 变异:3508/3521 → gray_brick 同 slope
const mut = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const brick = TILE_DEFS.findIndex(d => d && d.key === 'gray_brick');
  if (brick < 0) return { err: 'gray_brick not found' };
  const orig = [[3508, 394], [3521, 394]].map(([x, y]) => { const i = st.idx(x, y); return [x, y, st.type[i], st.slope[i]]; });
  for (const [x, y] of [[3508, 394], [3521, 394]]) {
    const i = st.idx(x, y);
    const sl = st.slope[i];
    st.setTile(x, y, brick);
    st.setSlope(x, y, sl);
  }
  return { brick, orig };
});
log('mutate:', JSON.stringify(mut));
await sleep(2500);
const s1 = await shot();
writeFileSync(`${OUT}/multiform-brick.png`, Buffer.from(s1.full.split(',')[1], 'base64'));
log('wc:', JSON.stringify(s1.wc));
// ② 还原
if (mut.orig) {
  await page.evaluate((orig) => {
    const g = window.__swGame;
    const st = g.world.store;
    for (const [x, y, t, sl] of orig) {
      st.setTile(x, y, t);
      if (sl) st.setSlope(x, y, sl);
    }
  }, mut.orig);
  await sleep(2500);
  const s2 = await shot();
  writeFileSync(`${OUT}/multiform-restored.png`, Buffer.from(s2.full.split(',')[1], 'base64'));
}
log('MULTIFORM-DONE');
process.exit(0);
