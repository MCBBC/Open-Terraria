// IIII255 门控画布直接取证（ON 臂单臂,快):
//  1. 主 ctx 世界变换实测(getTransform) → 精确 w2s
//  2. endFgPass 时刻门控画布全量 PNG 落盘 + applyFullScreen 后再抓一张
//  3. warp 调试态(liquidDebugState().warp) + isCpuRender
// 用法(game/): SW_ORIGIN=http://localhost:5304 node tools/run-diag.mjs --timeout=300000 scripts/_iii255-gatesnap.mjs
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
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const saveDataUrl = async (p, url) => {
  if (!url) return 'null';
  await import('node:fs/promises').then((f) => f.writeFile(p, Buffer.from(url.split(',')[1], 'base64')));
  return p;
};
const log = (...a) => console.log('[iii255g]', ...a);

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
  const lr = await import('/src/render/VanillaLiquidRenderer.ts');
  const wwc = g.renderer.waterWarp;
  const shots = {};
  // 主 ctx 世界变换(帧中段抓——渲染后 persist 到下帧开头,值即上一帧世界变换)
  const m = g.renderer.ctx.getTransform();
  const xform = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
  // 钩两个时机
  let atEnd = null, atApply = null;
  if (!wwc.__iii255g) {
    wwc.__iii255g = true;
    const oEF = wwc.endFgPass.bind(wwc);
    wwc.endFgPass = (ctx) => {
      try { const gc = wwc.gateCanvas(); if (gc) { const c2 = document.createElement('canvas'); c2.width = gc.width; c2.height = gc.height; c2.getContext('2d').drawImage(gc, 0, 0); atEnd = c2.toDataURL('image/png'); } } catch { }
      oEF(ctx);
    };
    const oAF = wwc.applyFullScreen.bind(wwc);
    wwc.applyFullScreen = (scene, st, noise) => {
      const r = oAF(scene, st, noise);
      try {
        const sceneCv = r ?? scene;
        const c3 = document.createElement('canvas'); c3.width = sceneCv.width; c3.height = sceneCv.height;
        c3.getContext('2d').drawImage(sceneCv, 0, 0);
        atApply = c3.toDataURL('image/png');
        // 门控画布在 apply 时刻(alpha 应未清)
        const gc = wwc.gateCanvas();
        if (gc) { const c4 = document.createElement('canvas'); c4.width = gc.width; c4.height = gc.height; c4.getContext('2d').drawImage(gc, 0, 0); atEnd = atEnd ?? c4.toDataURL('image/png'); shots.gateAtApply = c4.toDataURL('image/png'); }
      } catch { }
      return r;
    };
  }
  await new Promise((r) => setTimeout(r, 900));
  const ld = lr.liquidDebugState();
  const w2s = (wx, wy) => {
    // device = M · (world px)
    return [Math.round(xform.a * wx + xform.c * wy + xform.e), Math.round(xform.b * wx + xform.d * wy + xform.f)];
  };
  return { xform, warp: JSON.parse(JSON.stringify(ld.warp ?? {})), cpu: g.renderer.isCpuRender ? g.renderer.isCpuRender() : 'n/a',
    hasAtEnd: !!atEnd, hasAtApply: !!atApply,
    atEnd, gateAtApply: shots.gateAtApply ?? null, atApply,
    probePts: (() => {
      const pts = {};
      for (const [k, [tx, ty]] of Object.entries({ mark1: [3508, 394], mark2: [3521, 394], half: [3518, 394], flat: [3513, 394], water3517: [3517, 394] })) {
        pts[k] = { tl: w2s(tx * 16, ty * 16), c: w2s(tx * 16 + 8, ty * 16 + 8) };
      }
      return pts;
    })() };
});
log('warp:', JSON.stringify(out.warp), 'cpu:', out.cpu);
log('xform:', JSON.stringify(out.xform));
log('probePts:', JSON.stringify(out.probePts));
log('hasAtEnd:', out.hasAtEnd, 'hasAtApply:', out.hasAtApply);
await saveDataUrl(join(OUT, 'gate-atEndFgPass.png'), out.atEnd);
await saveDataUrl(join(OUT, 'gate-atApply.png'), out.gateAtApply);
await saveDataUrl(join(OUT, 'scene-atApply.png'), out.atApply);
log('GATESNAP-DONE');
process.exit(0);
