// IIII257 CPU 路与逃生门双臂验证:
//   臂 cpu   (?wwarp=0)          = CPU 合成路,257 转正后坡面亮线/浸润带随波场 bob → 坡面线位帧差非零
//   臂 esc   (?wwarp=0&slopewave=0) = 逃生门:坡面静态(灰度期行为),平水面仍 bob(waveOn 路),干地静
// 共用浏览器两页先后开;ROI/线位法同 _iii257-glsync.mjs。
// 用法: node tools/probe.mjs run scripts/_iii257-cpuesc.mjs --vite=5306 --out=/tmp/iii257-out
import fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5306';
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii257-out';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (30).json';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii257c]', ...a);

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
const saveJsonTxt = fs.readFileSync(MAP, 'utf8');
const browser = await launchBrowser({ errors: [] });

async function openArm(query, tag) {
  const page = await openPage(browser, { errors: [] });
  page.on('pageerror', (e) => log('PAGEERROR', tag, String(e).slice(0, 160)));
  page.__probeOrigin = ORIGIN;
  await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
  await cleanStorage(page, {});
  await gotoApp(page, ORIGIN, { extraQuery: query, tries: 30 });
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
  let ok = false;
  for (let i = 0; i < 240; i++) { await sleep(1000); ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store)); if (ok) break; }
  if (!ok) throw new Error('game-timeout ' + tag);
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
    g.__iii257Pin = { x: 3517 * 16, y: 394 * 16 };
    if (!g.__iii257PinLoop) {
      g.__iii257PinLoop = true;
      const loop = () => {
        const g2 = window.__swGame;
        if (g2?.__iii257Pin && g2.camera) { g2.camera.x = g2.__iii257Pin.x; g2.camera.y = g2.__iii257Pin.y; }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  });
  await sleep(2500);
  await page.evaluate(() => {
    const g = window.__swGame;
    const sweep = (c) => {
      if (!c) return false;
      try {
        if (c.x > 3490 * 16 && c.x < 3545 * 16 && c.y > 380 * 16 && c.y < 405 * 16) {
          c.x = 3000 * 16; c.y = 300 * 16; c.vx = 0; c.vy = 0;
          if (c.oldPos) { c.oldPos.x = c.x; c.oldPos.y = c.y; }
          return true;
        }
      } catch { return false; }
      return false;
    };
    try { for (const c of g.critters?.() ?? []) sweep(c); } catch { }
    try { for (const c of g.entities.critters ?? []) sweep(c); } catch { }
  });
  return page;
}

async function sample(page, tag) {
  return page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const wcss = g.renderer._waveCss;
    const dpr = cv.width / g.camera.viewW;
    const zoom = (wcss ? wcss.cssZoom * wcss.cssScale : g.camera.zoom);
    const camL = wcss ? wcss.camL : g.camera.x - g.camera.viewW / 2 / zoom;
    const camT = wcss ? wcss.camT : g.camera.y - g.camera.viewH / 2 / zoom;
    const isBright = (r, gg, b) => Math.abs(r - 147) <= 10 && Math.abs(gg - 177) <= 10 && Math.abs(b - 253) <= 10;
    const ROIS = {
      slope1: { wx: 3508 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 12, cols: [8, 14] },
      slope2: { wx: 3521 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 12, cols: [0, 6] },
      flat: { wx: 3513 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 12, cols: [0, 14] },
      land: { wx: 3504 * 16 + 1, wy: 396 * 16 - 6, ww: 14, wh: 12, cols: [0, 14] },
    };
    const rects = {};
    for (const [k, r] of Object.entries(ROIS)) {
      rects[k] = {
        x: Math.round((r.wx - camL) * zoom * dpr), y: Math.round((r.wy - camT) * zoom * dpr),
        w: Math.round(r.ww * zoom * dpr), h: Math.round(r.wh * zoom * dpr),
      };
    }
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const octx = off.getContext('2d', { willReadFrequently: true });
    const grab = () => {
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.drawImage(cv, 0, 0);
      const out = {};
      for (const [k, r] of Object.entries(rects)) out[k] = octx.getImageData(r.x, r.y, r.w, r.h).data;
      return out;
    };
    const diffFrac = (a, b) => {
      let changed = 0, n = 0;
      for (let i = 0; i < a.length; i += 4) {
        n++;
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > 8) changed++;
      }
      return changed / n;
    };
    const lineTop = (img, r, W, H) => {
      const c0 = Math.round(r.cols[0] / 14 * W), c1 = Math.max(c0 + 1, Math.round(r.cols[1] / 14 * W));
      const need = Math.max(1, Math.floor((c1 - c0) * 0.25));
      for (let y = 0; y < H; y++) {
        let hit = 0;
        for (let x = c0; x < c1; x++) {
          const i = (y * W + x) * 4;
          if (isBright(img[i], img[i + 1], img[i + 2])) hit++;
        }
        if (hit >= need) return y;
      }
      return -1;
    };
    const series = { slope1: [], slope2: [], flat: [], land: [] };
    const diffs = { slope1: [], slope2: [], flat: [], land: [] };
    const longs = { slope1: [], slope2: [], flat: [], land: [] };
    const rippleSrc = import('/src/render/WaterWaves.ts');
    const sweepCritters = () => {
      const sweep = (c) => {
        if (!c) return;
        try {
          if (c.x > 3490 * 16 && c.x < 3545 * 16 && c.y > 380 * 16 && c.y < 405 * 16) {
            c.x = 3000 * 16; c.y = 300 * 16; c.vx = 0; c.vy = 0;
            if (c.oldPos) { c.oldPos.x = c.x; c.oldPos.y = c.y; }
          }
        } catch { }
      };
      try { for (const c of g.critters?.() ?? []) sweep(c); } catch { }
      try { for (const c of g.entities.critters ?? []) sweep(c); } catch { }
    };
    return new Promise(async (res) => {
      let f = 0, s = 0, prev = null, firstSnap = null;
      const N = 64;
      const step = async () => {
        f++;
        if (f % 15 === 7) sweepCritters();   // 采样中途游入的鱼群清除(时域差分污染源)
        if (f % 30 === 15) { try { (await rippleSrc).queueRipple(3513 * 16 + 8, 394 * 16 + 8, 2.5); } catch { } }
        if (f % 4 === 0) {
          const snap = grab();
          if (!firstSnap) firstSnap = snap;
          for (const k of Object.keys(series)) {
            series[k].push(lineTop(snap[k], ROIS[k], rects[k].w, rects[k].h));
            if (prev) diffs[k].push(diffFrac(prev[k], snap[k]));
            longs[k].push(diffFrac(firstSnap[k], snap[k]));
          }
          prev = snap;
          if (++s >= N) { res({ series, diffs, longs }); return; }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const report = {};
const fails = [];
const pass = (k, cond, detail) => { log((cond ? 'PASS' : 'FAIL') + ' ' + k, detail ?? ''); if (!cond) fails.push(k); };

for (const [tag, query] of [['cpu', '?wwarp=0'], ['esc', '?wwarp=0&slopewave=0']]) {
  const page = await openArm(query, tag);
  const r = await sample(page, tag);
  const st = {};
  for (const k of Object.keys(r.series)) {
    st[k] = {
      lineTop: r.series[k],
      diffMean: +mean(r.diffs[k]).toFixed(5),
      longMean: +mean(r.longs[k]).toFixed(5),
      longMax: +Math.max(...r.longs[k]).toFixed(5),
      uniqTops: [...new Set(r.series[k].filter((v) => v >= 0))].length,
    };
  }
  report[tag] = st;
  await page.close();
}
writeFileSync(join(OUT, 'cpuesc-report.json'), JSON.stringify(report, null, 1));

// 断言:CPU 路坡面亮线随波场 bob(257 转正);逃生门坡面静态;平水面两臂均动
pass('cpu-slope1-motion', report.cpu.slope1.longMean > 0.0005 || report.cpu.slope1.uniqTops > 1,
  `longMean=${report.cpu.slope1.longMean} uniqTops=${report.cpu.slope1.uniqTops}(CPU bob 量化级)`);
pass('cpu-slope2-motion', report.cpu.slope2.longMean > 0.0005 || report.cpu.slope2.uniqTops > 1,
  `longMean=${report.cpu.slope2.longMean} uniqTops=${report.cpu.slope2.uniqTops}`);
pass('cpu-flat-motion', report.cpu.flat.longMean > 0.005, `longMean=${report.cpu.flat.longMean}`);
pass('cpu-land-static', report.cpu.land.longMean <= 0.004, `longMean=${report.cpu.land.longMean}`);
pass('esc-slope1-static', report.esc.slope1.uniqTops <= 1 && report.esc.slope1.longMean <= 0.02,
  `longMean=${report.esc.slope1.longMean} uniqTops=${report.esc.slope1.uniqTops}(?slopewave=0 灰度期行为:线位恒定)`);
pass('esc-slope2-static', report.esc.slope2.uniqTops <= 1 && report.esc.slope2.longMean <= 0.02,
  `longMean=${report.esc.slope2.longMean} uniqTops=${report.esc.slope2.uniqTops}(?slopewave=0 灰度期行为:线位恒定)`)
pass('esc-flat-motion', report.esc.flat.longMean > 0.005, `longMean=${report.esc.flat.longMean}(表层 bob 不回归)`);
pass('esc-land-static', report.esc.land.longMean <= 0.004, `longMean=${report.esc.land.longMean}`);
log(fails.length ? 'FAILS: ' + fails.join(',') : 'ALL-GREEN');
process.exit(fails.length ? 3 : 0);
