// IIII256 绘制调用钩子:一帧内落在 slope1(3508,394)/slope2(3521,394) 目标矩形上的
// 全部 drawImage/fillRect(含源矩形/alpha/图源尺寸) → 定性坡面水线亮边缺失方
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import fs from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5305';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii256h]', ...a);
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
const saveJsonTxt = fs.readFileSync(needInput(join(DOWNLOADS, 'map-Starter_World (30).json')), 'utf8');
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

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const wc = g.renderer._waveCss;
  const camL = wc.camL, camT = wc.camT, Z = wc.cssZoom;
  // 目标矩形:tile 3508/3521 行 394(世界 px)→ 设备 px
  const targets = {
    slope1: [3508 * 16, 394 * 16, 16, 16],
    slope2: [3521 * 16, 394 * 16, 16, 16],
  };
  const hit = (t, r) => {
    const [tx, ty, tw, th] = t;
    const [x, y, w, h] = r;
    return x < tx + tw && x + w > tx && y < ty + th && y + h > ty;
  };
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__iii256hooked) {
    proto.__iii256hooked = true;
    const od = proto.drawImage, of = proto.fillRect;
    window.__iii256Calls = [];
    proto.drawImage = function (...a) {
      try {
        const ctx = this;
        const cv = ctx.canvas;
        if (cv === g.renderer.canvas) {
          const tr = a.length === 9 ? [a[5], a[6], a[7], a[8]] : [a[1], a[2], a[3], a[4]];
          for (const [k, t] of Object.entries(targets)) {
            if (hit(t, tr)) {
              let src = '?';
              try { const im = a[0]; src = `${im.width}x${im.height}`; } catch { }
              window.__iii256Calls.push({ t: k, op: 'img', src, a: [a.length === 9 ? `src(${a[1]},${a[2]},${a[3]},${a[4]})` : '', `dst(${tr.join(',')})`].join(' '), alpha: ctx.globalAlpha, xf: (() => { try { const m = ctx.getTransform(); return `${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}`; } catch { return '?'; } })() });
            }
          }
        }
      } catch { }
      return od.apply(this, a);
    };
    proto.fillRect = function (x, y, w, h) {
      try {
        if (this.canvas === g.renderer.canvas) {
          for (const [k, t] of Object.entries(targets)) {
            if (hit(t, [x, y, w, h])) window.__iii256Calls.push({ t: k, op: 'rect', src: `dst(${x},${y},${w},${h})`, alpha: this.globalAlpha, xf: (() => { try { const m = this.getTransform(); return `${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}`; } catch { return '?'; } })() });
          }
        }
      } catch { }
      return of.apply(this, arguments);
    };
  }
  return { targets, wc };
});
log('targets:', JSON.stringify(out.targets));
await sleep(600);
const calls = await page.evaluate(() => { const c = window.__iii256Calls ?? []; window.__iii256Calls = []; return c; });
log('calls on slope tiles in ~600ms (' + calls.length + '):');
for (const c of calls.slice(0, 120)) log(`  [${c.t}] ${c.op} ${c.src} a=${c.alpha} xf=${c.xf}`);
process.exit(0);
