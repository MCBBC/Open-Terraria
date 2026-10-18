// IIII256 斜坡水缘白色水面亮线·复现探针（方向纠正后交付物=白线延伸）
// 用户实报:平水面 tile 上缘的白色高光条(液体渲染器水面亮边=surface 带 srcY=1280
// 顶 2px 147,177,253)在斜坡格水面段断掉。本探针:
//   a. 同点位(3517,394) zoom2 全画布截图(flag on) + 三形态 3x 裁剪
//      (mark1 左坡1 / half 半砖 / mark2 右坡2 / flat 平水参照)
//   b. 水线逐列剖析:每设备列找水体顶缘(首个"水色"行)与其亮度 → 白线连续性量化
// 用法(game/): node tools/probe.mjs run scripts/_iii256-repro.mjs --vite=5305 --out=/tmp/iii256-out
import { DOWNLOADS, needInput } from './_pathlib.mjs';
import fs from 'node:fs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5305';
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii256-out';
const MAP = process.env.III256_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (30).json'));
const FLAG = process.env.III256_FLAG ?? '?slopewave=1';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii256]', ...a);

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

const saveJsonTxt = fs.readFileSync(MAP, 'utf8');
const browser = await launchBrowser({ errors: [] });
log('browser up');
const page = await openPage(browser, { errors: [] });
page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 200)));
page.__probeOrigin = ORIGIN;
await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
await cleanStorage(page, {});
const okGoto = await gotoApp(page, ORIGIN, { extraQuery: FLAG, tries: 30 });
if (!okGoto) throw new Error('goto failed');
log('goto ok');
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
let ok = false;
for (let i = 0; i < 240; i++) {
  await sleep(1000);
  ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store));
  if (ok) break;
}
if (!ok) throw new Error('game-timeout');
await dismissWelcome(page).catch(() => {});
await godMode(page, true);
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
await sleep(1500);
await camSnapToTile(page, 3517, 394, { player: false });
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
// 相机钉死(防漂移)
await page.evaluate(() => {
  const g = window.__swGame;
  g.__iii256Pin = { x: 3517 * 16, y: 394 * 16 };
  if (!g.__iii256PinLoop) {
    g.__iii256PinLoop = true;
    const loop = () => {
      const g2 = window.__swGame;
      if (g2?.__iii256Pin && g2.camera) { g2.camera.x = g2.__iii256Pin.x; g2.camera.y = g2.__iii256Pin.y; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
});
await sleep(2500);

const result = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const dpr = cv.width / g.camera.viewW;
  const zoom = g.camera.zoom;
  // ★渲染系精确锚(III255 定谳):_waveCss = endFgPass 时刻 fgCtx 变换(a=cssZoom,
  //  e=-camL·cssZoom)——与绘制变换逐位同源,camera.x 推算有 snap 偏差禁用
  const wc = g.renderer._waveCss ?? null;
  const camL = wc ? wc.camL : g.camera.x - g.camera.viewW / 2 / zoom;
  const camT = wc ? wc.camT : g.camera.y - g.camera.viewH / 2 / zoom;
  const zl = wc ? wc.cssZoom : zoom * dpr;
  const w2s = (wx, wy) => [Math.round((wx - camL) * zl), Math.round((wy - camT) * zl)];
  // 全画布
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const x2 = c2.getContext('2d', { willReadFrequently: true });
  x2.drawImage(cv, 0, 0);
  const full = c2.toDataURL('image/png');
  // 三形态+平水参照裁剪(x 3504..3526, y 390..400 → 同一横条)
  const [ax, ay] = w2s(3504 * 16, 390 * 16);
  const [bx, by] = w2s(3526 * 16, 400 * 16);
  const strip = x2.getImageData(ax, ay, bx - ax, by - ay);
  const sc = document.createElement('canvas');
  sc.width = bx - ax; sc.height = by - ay;
  sc.getContext('2d').putImageData(strip, 0, 0);
  // 3x 放大裁剪(最近邻)
  const s3 = document.createElement('canvas');
  s3.width = sc.width * 3; s3.height = sc.height * 3;
  const s3c = s3.getContext('2d');
  s3c.imageSmoothingEnabled = false;
  s3c.drawImage(sc, 0, 0, s3.width, s3.height);
  // ---- 水线逐列剖析:每设备列找水体顶缘行(首个蓝水色)与顶缘亮度 ----
  const img = x2.getImageData(0, 0, c2.width, c2.height).data;
  const colInfo = [];
  for (let tx = 3502; tx <= 3526; tx++) {
    const [sx] = w2s(tx * 16, 0);
    const cols = [];
    for (let dx = 0; dx < 16 * zoom * dpr; dx++) {
      const x = sx + dx;
      if (x < 0 || x >= c2.width) continue;
      // 自 y(392*16) 向下扫到 397*16,找第一个"蓝水色"像素(B>R 且 B>100 且 alpha 高)
      let topY = -1, topCol = null;
      const [, ys0] = w2s(0, 392 * 16);
      const [, ys1] = w2s(0, 397 * 16);
      for (let y = ys0; y < ys1; y++) {
        const i = (y * c2.width + x) * 4;
        const r = img[i], gg = img[i + 1], b = img[i + 2];
        if (b > 120 && b > r + 30 && b > gg + 20) { topY = y; topCol = [r, gg, b]; break; }
      }
      cols.push({ topY, topCol });
    }
    // 汇总本 tile 16 设备列:顶缘行分布 + 顶缘下 1px 亮度均值
    const tops = cols.filter(c => c.topY >= 0);
    const mean = (a) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : -1;
    colInfo.push({
      tx,
      waterCols: tops.length,
      topYmode: tops.length ? mode(tops.map(c => c.topY)) : -1,
      topRLum: mean(tops.map(c => c.topCol ? c.topCol[0] : -1).filter(v => v >= 0)),
      topGLum: mean(tops.map(c => c.topCol ? c.topCol[1] : -1).filter(v => v >= 0)),
      topBLum: mean(tops.map(c => c.topCol ? c.topCol[2] : -1).filter(v => v >= 0)),
    });
  }
  function mode(arr) {
    const m = new Map();
    for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
    let best = -1, bc = 0;
    for (const [v, c] of m) if (c > bc) { bc = c; best = v; }
    return best;
  }
  // store 状态表(与截图同帧):x 3502..3528, y 391..397
  const st = g.world.store;
  const hood = [];
  for (let y = 391; y <= 397; y++) {
    const row = [];
    for (let x = 3502; x <= 3528; x++) {
      const i = st.idx(x, y);
      row.push([st.type[i], st.slope[i], st.half[i], st.liquid[i], st.liquidType[i]]);
    }
    hood.push(row);
  }
  return { full, strip3x: s3.toDataURL('image/png'), colInfo, hood, wc, dpr, zoom, camL, camT, zl, cvW: cv.width, cvH: cv.height };
});

writeFileSync(join(OUT, 'repro-full.png'), Buffer.from(result.full.split(',')[1], 'base64'));
writeFileSync(join(OUT, 'repro-strip3x.png'), Buffer.from(result.strip3x.split(',')[1], 'base64'));
delete result.full; delete result.strip3x;
log('meta:', JSON.stringify({ dpr: result.dpr, zoom: result.zoom, wc: result.wc, camL: result.camL, camT: result.camT, zl: result.zl, cvW: result.cvW, cvH: result.cvH }));
log('HOOD x3502..3528 (type/slope H=half L=liquid ~lt):');
for (let ri = 0; ri < result.hood.length; ri++) {
  const y = 391 + ri;
  let line = `y${y}: `;
  for (let ci = 0; ci < result.hood[ri].length; ci++) {
    const [t, sl, hf, lq, lt] = result.hood[ri][ci];
    line += `${t}/${sl}${hf ? 'H' : ''}${lq ? 'L' + lq : ''} `;
  }
  log(line);
}
log('COL waterline profile (tx, waterCols/16, topYmode, topRGB mean):');
for (const c of result.colInfo) {
  log(`  tx${c.tx}: cols=${String(c.waterCols).padStart(2)} topY=${String(c.topYmode).padStart(4)} rgb=${c.topRLum},${c.topGLum},${c.topBLum}`);
}
log('REPRO-DONE');
process.exit(0);
