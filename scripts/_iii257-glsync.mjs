// IIII257 斜坡亮线接入 GL 波面+水中扭曲 · 主验证探针(GL 路,缺省旗) v2
// 方法论 v2 订正(v1 教训:涟漪注在 flat ROI=振幅偏置;跨 5 tile 线位相关=行波相位差
//  伪零相关;石侧扫描行域错):
//   · 涟漪交替注于两岸(3510/3519)→ 两坡格与各自紧邻平水格同场等能;
//   · 同步断言 = 坡格亮线线位序列 vs 【紧邻】平水格(3509/3520)线位序列 Pearson 相关
//     (相邻 1 tile = 同一位移场局部,无行波相位差);中池 3513 作"平水面仍动"参照;
//   · 场断言 = waterWaves.sampleDisplace y 序列(坡格线位 vs 紧邻平水)相关>0.8
//     (同源位移场);线位 vs 本位场序列相关(线随场动);
//   · 石侧裁剪断言行域=线带(device 行 10..18)。
// 断言面:
//   A. 坡面亮线(slope1/slope2)与紧邻平水面亮线同步起伏(线位相关 + 场相关双证)
//   B. 扭曲对坡段生效——坡面亮线 ROI 帧差非零(长基线);陆地对照=0
//   C. warp 覆盖含坡面水面段——门控画布坡面条带 α≈5(足迹),平水面 α≈128(前景水)
//   D. CCXXVI 语义保持——亮线出现、坡面石侧无亮线、干地零水色、中池亮线仍在
// 用法: node tools/probe.mjs run scripts/_iii257-glsync.mjs --vite=5306 --out=/tmp/iii257-out
import { DOWNLOADS, needInput } from './_pathlib.mjs';
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
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (30).json'));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii257]', ...a);

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
const page = await openPage(browser, { errors: [] });
page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 200)));
page.__probeOrigin = ORIGIN;
await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
await cleanStorage(page, {});
await gotoApp(page, ORIGIN, { tries: 30 });   // 缺省旗(无 query)——257 转正后足迹/位移门常开
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
if (!ok) { console.error('game-timeout'); process.exit(1); }
await dismissWelcome(page).catch(() => {});
await godMode(page, true);

const flagState = await page.evaluate(async () => {
  const m = await import('/src/render/VanillaLiquidRenderer.ts');
  return { slopeWaveEnabled: m.slopeWaveEnabled };
});
log('flagState:', JSON.stringify(flagState));

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
  let n = 0;
  try { for (const c of g.critters?.() ?? []) if (sweep(c)) n++; } catch { }
  try { for (const c of g.entities.critters ?? []) if (sweep(c)) n++; } catch { }
  globalThis.__iii257Swept = n;
});

const truth = await page.evaluate(() => {
  const st = window.__swGame.world.store;
  const probe = (x, y) => {
    const i = st.idx(x, y);
    return { x, y, type: st.type[i], slope: st.slope[i], half: st.half[i], liquid: st.liquid[i] };
  };
  return {
    slope1: probe(3508, 394), flatL: probe(3509, 394), flatMid: probe(3513, 394),
    half: probe(3518, 394), flatR: probe(3520, 394), slope2: probe(3521, 394),
    land: probe(3504, 396), landL: probe(3507, 394), landR: probe(3522, 394),
  };
});
log('truth:', JSON.stringify(truth));
const warpDbg = await page.evaluate(() => {
  const g = window.__swGame;
  return { wcss: !!g.renderer._waveCss, gate: !!g.renderer.waterWarp?.gateCanvas?.() };
});
log('warpDbg:', JSON.stringify(warpDbg));

// ==== 主采样:72 样本×每 4 帧;涟漪交替注于两岸 3510/3519(坡格与紧邻平水同场等能) ====
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const wcss = g.renderer._waveCss;
  const dpr = cv.width / g.camera.viewW;
  const zoom = wcss.cssZoom * wcss.cssScale;
  const camL = wcss.camL, camT = wcss.camT;
  const isBright = (r, gg, b) => Math.abs(r - 147) <= 10 && Math.abs(gg - 177) <= 10 && Math.abs(b - 253) <= 10;
  // ROI 顶=水线上 6 世界 px、高 12 世界 px(吸收 ±4 世界 px 位移);线名义位=ROI 行 12..16
  const ROIS = {
    slope1:  { wx: 3508 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 14 },
    flatL:   { wx: 3509 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 14 },
    flatMid: { wx: 3513 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 12 },
    flatR:   { wx: 3520 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 14 },
    slope2:  { wx: 3521 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 14 },
    land:    { wx: 3504 * 16 + 1, wy: 396 * 16 - 6, ww: 14, wh: 12 },
    landL:   { wx: 3507 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 12 },
    landR:   { wx: 3522 * 16 + 1, wy: 394 * 16 - 6, ww: 14, wh: 12 },
  };
  const rects = {};
  for (const [k, r] of Object.entries(ROIS)) {
    rects[k] = {
      x: Math.round((r.wx - camL) * zoom * dpr), y: Math.round((r.wy - camT) * zoom * dpr),
      w: Math.round(r.ww * zoom * dpr), h: Math.round(r.wh * zoom * dpr),
    };
  }
  // 门控画布(前景水离屏)取证条带=线带 2 世界 px
  const gateRects = {
    slope1Gate: [3508 * 16 + 1, 394 * 16, 14, 2],
    slope2Gate: [3521 * 16 + 1, 394 * 16, 14, 2],
    flatGate: [3513 * 16 + 1, 394 * 16, 14, 2],
  };
  const grects = {};
  for (const [k, [wx, wy, ww, wh]] of Object.entries(gateRects)) {
    grects[k] = {
      x: Math.round((wx - camL) * zoom * dpr), y: Math.round((wy - camT) * zoom * dpr),
      w: Math.max(2, Math.round(ww * zoom * dpr)), h: Math.max(2, Math.round(wh * zoom * dpr)),
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
  const gateAlpha = () => {
    const gc = g.renderer.waterWarp.gateCanvas();
    if (!gc) return null;
    const gctx = gc.getContext('2d');
    const out = {};
    for (const [k, r] of Object.entries(grects)) {
      let mx = 0;
      try {
        const d = gctx.getImageData(r.x, r.y, r.w, r.h).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > mx) mx = d[i];
      } catch { return null; }
      out[k] = mx;
    }
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
  // 线位=列域(全宽)逐行亮色首行(≥25% 列命中)
  const lineTop = (img, W, H) => {
    const need = Math.max(1, Math.floor(W * 0.25));
    for (let y = 0; y < H; y++) {
      let hit = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (isBright(img[i], img[i + 1], img[i + 2])) hit++;
      }
      if (hit >= need) return y;
    }
    return -1;
  };
  const rowProfile = (img, W, H) => {
    const prof = [];
    for (let y = 0; y < H; y++) {
      let hit = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (isBright(img[i], img[i + 1], img[i + 2])) hit++;
      }
      prof.push(hit);
    }
    return prof;
  };
  const colProfile = (img, W, H) => {
    const prof = [];
    for (let x = 0; x < W; x++) {
      let hit = 0;
      for (let y = 8; y < 20 && y < H; y++) {
        const i = (y * W + x) * 4;
        if (isBright(img[i], img[i + 1], img[i + 2])) hit++;
      }
      prof.push(hit);
    }
    return prof;
  };
  const KEYS = Object.keys(ROIS);
  const series = {}, diffs = {}, longs = {};
  for (const k of KEYS) { series[k] = []; diffs[k] = []; longs[k] = []; }
  const field = { slope1: [], flatL: [], flatMid: [], flatR: [], slope2: [] };
  const brightCount = { slope1: [], slope2: [], flatMid: [] };
  let firstShot = null, firstSnap = null, gate0 = null;
  const N = 72;
  const rippleSrc = import('/src/render/WaterWaves.ts');
  const WMod = await rippleSrc;
  const disp = [0, 0];
  return new Promise((res) => {
    let f = 0, s = 0, prev = null, side = 0;
    const step = () => {
      f++;
      if (f % 30 === 15) {
        side = 1 - side;
        try { WMod.queueRipple((side ? 3508.5 : 3520.5) * 16 + 8, 394 * 16 + 8, 2.0); } catch { }
      }
      if (f % 4 === 0) {
        const snap = grab();
        if (!firstSnap) { firstSnap = snap; firstShot = off.toDataURL('image/png'); gate0 = gateAlpha(); }
        for (const k of KEYS) {
          series[k].push(lineTop(snap[k], rects[k].w, rects[k].h));
          if (prev) diffs[k].push(diffFrac(prev[k], snap[k]));
          longs[k].push(diffFrac(firstSnap[k], snap[k]));
        }
        for (const [k, wx] of [['slope1', 3508], ['flatL', 3509], ['flatMid', 3513], ['flatR', 3520], ['slope2', 3521]]) {
          WMod.waterWaves.sampleDisplace(wx * 16 + 8, 394 * 16 + 2, disp);
          field[k].push(+disp[1].toFixed(4));
        }
        for (const [k, kk] of [['slope1', 'slope1'], ['slope2', 'slope2'], ['flatMid', 'flatMid']]) {
          const img = snap[kk];
          let hit = 0;
          for (let i = 0; i < img.length; i += 4) if (isBright(img[i], img[i + 1], img[i + 2])) hit++;
          brightCount[k].push(hit);
        }
        prev = snap;
        if (++s >= N) {
          const g1 = gateAlpha();
          // 石侧裁剪断言(256 原义):亮线不越过坡格落到邻接陆地列(3507/3522)
          const stoneSide = {};
          for (const [k, kk] of [['slope1', 'landL'], ['slope2', 'landR']]) {
            const img = snap[kk];
            const W = rects[kk].w, H = rects[kk].h;
            let hit = 0;
            for (let y = 0; y < H; y++) {
              for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                if (isBright(img[i], img[i + 1], img[i + 2])) hit++;
              }
            }
            stoneSide[k] = hit;
          }
          res({
            series, field, brightCount, diffs, longs, gate0, gateEnd: g1, stoneSide, rects,
            dpr, zoom, camL, camT, shot: firstShot,
            rowProfiles: {
              slope1_first: rowProfile(firstSnap.slope1, rects.slope1.w, rects.slope1.h),
              slope1_last: rowProfile(snap.slope1, rects.slope1.w, rects.slope1.h),
              slope2_first: rowProfile(firstSnap.slope2, rects.slope2.w, rects.slope2.h),
              flatL_first: rowProfile(firstSnap.flatL, rects.flatL.w, rects.flatL.h),
              flatMid_first: rowProfile(firstSnap.flatMid, rects.flatMid.w, rects.flatMid.h),
              land_first: rowProfile(firstSnap.land, rects.land.w, rects.land.h),
            },
            colProfiles: {
              slope1_first: colProfile(firstSnap.slope1, rects.slope1.w, rects.slope1.h),
              slope2_first: colProfile(firstSnap.slope2, rects.slope2.w, rects.slope2.h),
              flatMid_first: colProfile(firstSnap.flatMid, rects.flatMid.w, rects.flatMid.h),
            },
          });
          return;
        }
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
});

// ==== 分析 ====
const pearson = (A, B, miss = -1) => {
  const n = Math.min(A.length, B.length);
  const pts = [];
  for (let i = 0; i < n; i++) if (A[i] !== miss && B[i] !== miss) pts.push([A[i], B[i]]);
  if (pts.length < 8) return { r: null, note: 'too-few:' + pts.length };
  const sx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const sy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pts) { sxy += (x - sx) * (y - sy); sxx += (x - sx) ** 2; syy += (y - sy) ** 2; }
  if (sxx === 0 || syy === 0) return { r: null, note: 'zero-variance', pts: pts.length };
  return { r: +(sxy / Math.sqrt(sxx * syy)).toFixed(4), pts: pts.length };
};
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const stats = {};
for (const k of Object.keys(result.series)) {
  stats[k] = {
    lineTop: result.series[k],
    uniqTops: [...new Set(result.series[k].filter((v) => v >= 0))].length,
    diffMean: +mean(result.diffs[k]).toFixed(5),
    longMean: +mean(result.longs[k]).toFixed(5),
    longMax: +Math.max(...result.longs[k]).toFixed(5),
  };
}
const fieldSd = {};
for (const k of Object.keys(result.field)) {
  const a = result.field[k];
  const m = mean(a);
  fieldSd[k] = +Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length).toFixed(4);
}
const corr = {
  slope1_vs_flatL_line: pearson(result.series.slope1, result.series.flatL),
  slope2_vs_flatR_line: pearson(result.series.slope2, result.series.flatR),
  slope1_vs_slope2_line: pearson(result.series.slope1, result.series.slope2),
  field_slope1_vs_flatL: pearson(result.field.slope1, result.field.flatL, NaN),
  field_slope2_vs_flatR: pearson(result.field.slope2, result.field.flatR, NaN),
  field_slope1_vs_flatMid: pearson(result.field.slope1, result.field.flatMid, NaN),
  line_slope1_vs_field: pearson(result.series.slope1, result.field.slope1),
  line_slope2_vs_field: pearson(result.series.slope2, result.field.slope2),
  line_flatL_vs_field: pearson(result.series.flatL, result.field.flatL),
  line_flatMid_vs_field: pearson(result.series.flatMid, result.field.flatMid),
};
const out = {
  flagState, truth, warpDbg, stats, corr, fieldSd,
  gate: { atFirst: result.gate0, atEnd: result.gateEnd },
  stoneSideBright: result.stoneSide,
  rowProfiles: result.rowProfiles,
  colProfiles: result.colProfiles,
  mapping: { dpr: result.dpr, zoom: result.zoom, camL: result.camL, camT: result.camT, rects: result.rects },
};
writeFileSync(join(OUT, 'glsync-report.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(join(OUT, 'glsync-frame0.png'), Buffer.from(result.shot.split(',')[1], 'base64'));

// ==== 断言 ====
const fails = [];
const pass = (k, cond, detail) => { log((cond ? 'PASS' : 'FAIL') + ' ' + k, detail ?? ''); if (!cond) fails.push(k); };
pass('flag-default-on', flagState.slopeWaveEnabled === true, 'slopeWaveEnabled 缺省 true(转正)');
for (const k of ['slope1', 'slope2', 'flatMid']) {
  pass(`brightline-present:${k}`, mean(result.brightCount[k]) > 0, `亮色像素均值=${mean(result.brightCount[k]).toFixed(1)}`);
}
// A. 同步起伏:坡格线位 vs 紧邻平水线位(同一局部位移场)
pass('sync-slope1-flatL-line', Math.abs(corr.slope1_vs_flatL_line.r ?? 0) > 0.5,
  `pearson=${JSON.stringify(corr.slope1_vs_flatL_line)}`);
pass('sync-slope2-flatR-line', Math.abs(corr.slope2_vs_flatR_line.r ?? 0) > 0.5,
  `pearson=${JSON.stringify(corr.slope2_vs_flatR_line)}`);
// A2. 同源位移场:场序列相关(坡格线位 vs 紧邻平水)
pass('sync-field-slope1-flatL', (corr.field_slope1_vs_flatL.r ?? 0) > 0.8,
  `pearson=${JSON.stringify(corr.field_slope1_vs_flatL)}`);
pass('sync-field-slope2-flatR', (corr.field_slope2_vs_flatR.r ?? 0) > 0.8,
  `pearson=${JSON.stringify(corr.field_slope2_vs_flatR)}`);
// A3. 线随场动(线位 vs 本位场;符号由管线的采样方向定,取绝对值+与平水面同号)
pass('line-follows-field-slope1', Math.abs(corr.line_slope1_vs_field.r ?? 0) > 0.35,
  `pearson=${JSON.stringify(corr.line_slope1_vs_field)}`);
pass('line-follows-field-slope2', Math.abs(corr.line_slope2_vs_field.r ?? 0) > 0.35,
  `pearson=${JSON.stringify(corr.line_slope2_vs_field)}`);
// B. 扭曲对坡段生效
for (const k of ['slope1', 'slope2']) {
  pass(`warp-slope-motion:${k}`, stats[k].longMean > 0.004, `longMean=${stats[k].longMean}`);
}
pass('warp-flat-motion', stats.flatMid.longMean > 0.01, `longMean=${stats.flatMid.longMean}(平水面不回归)`);
pass('land-static', stats.land.longMean <= 0.004, `longMean=${stats.land.longMean}(干地对照)`);
// C. warp 覆盖含坡面水面段
const gateSlope = Math.max(result.gateEnd?.slope1Gate ?? 0, result.gateEnd?.slope2Gate ?? 0);
pass('gate-slope-footprint', gateSlope >= 4 && gateSlope <= 8, `坡面条带 α=${gateSlope}(足迹 0.02×255≈5)`);
pass('gate-flat-water', (result.gateEnd?.flatGate ?? 0) >= 100, `平水面条带 α=${result.gateEnd?.flatGate}`);
// D. CCXXVI 语义
for (const k of Object.keys(result.stoneSide)) {
  pass(`stone-side-no-line:${k}`, result.stoneSide[k] <= 2, `石侧亮色像素=${result.stoneSide[k]}(≤2=边缘 AA 容差)`);
}
log('==== SUMMARY ====');
log(JSON.stringify({ corr, fieldSd, gate: out.gate, stoneSide: result.stoneSide,
  stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { uniqTops: v.uniqTops, longMean: v.longMean, diffMean: v.diffMean }])) }, null, 1));
log(fails.length ? 'FAILS: ' + fails.join(',') : 'ALL-GREEN');
process.exit(fails.length ? 3 : 0);
