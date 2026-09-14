// IIII255 性能闸（?slopewave=1 边际成本 <0.5%）
//  a. rAF 整帧耗时(300 帧 avg/p50/p95)——on/off 双臂各测 3 轮交替
//  b. waterWaves.frame 微基准(固定输入 ×400)——_step 所在路径,flag 不应有任何差异
//  c. ON 臂足迹序列微基准(gateFootprintCtx 清屏+3 次 α=0.02 小画+setTransform ×5000)
// 用法(game/): SW_ORIGIN=http://localhost:5304 node tools/run-diag.mjs --timeout=600000 scripts/_iii255-perf.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5304';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii255p]', ...a);
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
const saveJsonTxt = fs.readFileSync('/Users/vinlic/Downloads/map-Starter_World (30).json', 'utf8');
const browser = await launchBrowser({ errors: [] });

async function openArm(tag, flagQuery) {
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
  await cleanStorage(page, {});
  await gotoApp(page, ORIGIN, { extraQuery: flagQuery, tries: 30 });
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
  await sleep(1000);
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
  log(tag, 'ready');
  return page;
}

const measure = async (page, tag) => {
  await front(page);   // ★headless 后台 rAF 节流坑:计量前必须 bringToFront(probe-guide B1)
  return page.evaluate(async () => {
  // a. rAF 整帧
  const deltas = [];
  let last = performance.now();
  await new Promise((res) => {
    let n = 0;
    const step = () => {
      const now = performance.now();
      deltas.push(now - last); last = now;
      if (++n >= 300) { res(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const sorted = [...deltas].sort((a, b) => a - b);
  const avg = deltas.reduce((s, v) => s + v, 0) / deltas.length;
  const frame = { avg: +avg.toFixed(3), p50: +sorted[150].toFixed(3), p95: +sorted[285].toFixed(3) };
  // b. waterWaves.frame 微基准(固定输入;flag 不入此路径,差异应为 0)
  const ww = await import('/src/render/WaterWaves.ts');
  const W = ww.waterWaves;
  const inp = {
    camX: 56272, camY: 6304, zoom: 2, viewW: 1280, viewH: 800,
    tileX: 3517, tileY: 394, maxTilesX: 6400, maxTilesY: 1800,
    worldSurface: 493, rockLayer: 679, windAbs: 0.3, rain: 0, dt: 1 / 60,
  };
  W.frame(inp);   // 预热(分配缓冲)
  const t0 = performance.now();
  const N = 400;
  for (let i = 0; i < N; i++) { inp.dt = 1 / 60; W.frame(inp); }
  const frameMs = (performance.now() - t0) / N;
  // c. ON 臂:足迹序列微基准(模拟 gateFootprintCtx 每帧增量:1 全幅 clear+setTransform+3 小画;
  //    贴图用 72x16 合成画布代替 LiquidSlope_0——测的是绘制开销非纹理内容)
  const cv = document.createElement('canvas');
  cv.width = 1280; cv.height = 800;
  const cx = cv.getContext('2d');
  const stex = document.createElement('canvas');
  stex.width = 72; stex.height = 16;
  const sc = stex.getContext('2d');
  sc.fillStyle = '#4080ff'; sc.fillRect(0, 0, 72, 16);
  const M = new DOMMatrix([2, 0, 0, 2, -111821, -12202]);
  const warm = () => { cx.setTransform(M); cx.clearRect(0, 0, 1280, 800); cx.globalAlpha = 0.02; cx.drawImage(stex, 0, 0, 16, 16, 56128, 6304, 16, 16); cx.drawImage(stex, 18, 0, 16, 16, 56336, 6304, 16, 16); cx.fillRect(56288, 6304, 16, 8); cx.setTransform(1, 0, 0, 1, 0, 0); };
  for (let i = 0; i < 50; i++) warm();
  const t1 = performance.now();
  for (let i = 0; i < 5000; i++) warm();
  const footUs = (performance.now() - t1) / 5000 * 1000;
  return { frame, frameMs: +frameMs.toFixed(4), footUs: footUs == null ? null : +footUs.toFixed(2) };
  });
};

const pageOff = await openArm('off', '');
const pageOn = await openArm('on', '?slopewave=1');
const rounds = { off: [], on: [] };
for (let r = 0; r < 3; r++) {
  rounds.off.push(await measure(pageOff, 'off'));
  rounds.on.push(await measure(pageOn, 'on'));
  log(`round ${r}: off=${JSON.stringify(rounds.off[r])} on=${JSON.stringify(rounds.on[r])}`);
}
const med = (arr, k) => {
  const v = arr.map((x) => x[k === 'frameMs' ? 'frameMs' : 'frame'][k === 'frameMs' ? 0 : k]).sort((a, b) => a - b);
  return v[(v.length - 1) >> 1];
};
const offAvg = med(rounds.off, 'avg'), onAvg = med(rounds.on, 'avg');
const offMs = med(rounds.off, 'frameMs'), onMs = med(rounds.on, 'frameMs');
log(`SUMMARY rAF: off=${offAvg}ms on=${onAvg}ms delta=${((onAvg - offAvg) / offAvg * 100).toFixed(3)}%`);
log(`SUMMARY waveFrameCPU: off=${offMs}ms on=${onMs}ms delta=${((onMs - offMs) / offMs * 100).toFixed(3)}%`);
const footOn = rounds.on.map((r) => r.footUs).filter((v) => v != null);
if (footOn.length) log(`SUMMARY footprintSeq: median=${footOn.sort((a, b) => a - b)[1]}us/frame (vs 16667us frame budget = ${(footOn[1] / 16667 * 100).toFixed(4)}%)`);
process.exit(0);
