// IIII255 斜坡水缘波纹·取证探针（接手 IIII251 verify 两 fail 的根因定位）：
//   fail1 "off half-static longMean=0.4453" —— (3518,394) 半砖上半 16x8 区 OFF 臂为何动
//   fail2 "on mark1-waves longMean=0.0000" —— mark1(3508,394) slope1 ON 臂足迹为何没生效
// 手段（on/off 双臂，同浏览器同世界）：
//   a. store 邻域表（type/slope/half/liquid/liquidType/wall, 3502..3526 × 388..398）
//   b. 钩 waterWarp.gateFootprintCtx → 包装返回 ctx 的 drawImage/fillRect → 记录足迹矩形
//   c. 钩 endFgPass → 抓门控画布快照 → 池缘 alpha 图（4 世界 px 网格 ASCII）
//   d. 时域差分（同 verify 口径, short+long 基线）
// 用法(game/): SW_ORIGIN=http://localhost:5304 node tools/run-diag.mjs --timeout=600000 \
//   scripts/_iii255-forensics.mjs
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5304';
const OUT = process.env.III255_OUT ?? '/tmp/iii255-out';
const MAP = process.env.III251_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (30).json';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROG = '/tmp/iii255-progress.log';
const log = (...a) => {
  const line = `[iii255] ${a.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(PROG, line + '\n'); } catch { /* 忽略 */ }
};

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

async function openArm(browser, { flagQuery = '', tag }) {
  const page = await openPage(browser, { errors: [] });
  page.on('dialog', async (d) => { log('DIALOG:', d.message().slice(0, 200)); await d.dismiss().catch(() => {}); });
  page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 200)));
  page.__probeOrigin = ORIGIN;
  await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
  await cleanStorage(page, {});
  const okGoto = await gotoApp(page, ORIGIN, { extraQuery: flagQuery, tries: 30 });
  if (!okGoto) throw new Error('goto failed ' + tag);
  const bridge = await waitForBridge(page, { timeout: 240000 });
  log(tag, 'goto ok, bridge', bridge);
  if (!bridge) throw new Error('bridge-timeout ' + tag);
  await front(page);
  await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
  for (let k = 0; k < 10; k++) {
    const r = await page.evaluate(() => {
      if (!window.__swFlow?.quickLoad) return 'no-flow';
      void window.__swFlow.quickLoad();
      return 'dispatched';
    }).catch((e) => 'eval-err:' + String(e).slice(0, 80));
    if (r === 'dispatched') { log(tag, 'quickLoad dispatched'); break; }
    log(tag, 'quickLoad retry', k, r);
    await sleep(3000);
  }
  let ok = false;
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store));
    if (ok) break;
  }
  if (!ok) throw new Error('game-timeout ' + tag);
  await dismissWelcome(page).catch(() => {});
  await godMode(page, true);
  return page;
}

async function forensics(page, tag) {
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
  await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
  await sleep(1500);
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
  await sleep(2500);

  // a. 邻域表
  const hood = await page.evaluate(() => {
    const st = window.__swGame.world.store;
    const rows = [];
    for (let y = 388; y <= 398; y++) {
      const row = [];
      for (let x = 3502; x <= 3526; x++) {
        const i = st.idx(x, y);
        row.push([st.type[i], st.slope[i], st.half[i], st.liquid[i], st.liquidType[i], st.wall[i]]);
      }
      rows.push(row);
    }
    return { rows, xs: [3502, 3526], ys: [388, 398] };
  });
  // 渲染成紧凑表
  let hoodTxt = '';
  for (let ri = 0; ri < hood.rows.length; ri++) {
    const y = hood.ys[0] + ri;
    hoodTxt += `y${y}: `;
    for (let ci = 0; ci < hood.rows[ri].length; ci++) {
      const [t, sl, hf, lq, lt, wl] = hood.rows[ri][ci];
      hoodTxt += `${t}/${sl}${hf ? 'H' : ''}${lq ? 'L' + lq + (lt ? '~' + lt : '') : ''}${wl ? 'W' + wl : ''} `;
    }
    hoodTxt += '\n';
  }
  log(tag, 'HOOD x3502..3526 (type/slope, H=half, L=liquid, ~=liqtype, W=wall):\n' + hoodTxt);

  // b+c. 足迹矩形记录 + 门控画布 alpha 图 + 时域差分
  const result = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const dpr = cv.width / g.camera.viewW;
    const zoom = g.camera.zoom;
    const camL = g.camera.x - g.camera.viewW / 2 / zoom;
    const camT = g.camera.y - g.camera.viewH / 2 / zoom;
    const w2s = (wx, wy) => [Math.round((wx - camL) * zoom * dpr), Math.round((wy - camT) * zoom * dpr)];
    const regions = {
      mark1: [3508 * 16, 394 * 16, 16, 16],
      mark2: [3521 * 16, 394 * 16, 16, 16],
      half: [3518 * 16, 394 * 16, 16, 8],
      halfFull: [3518 * 16, 394 * 16, 16, 16],
      flat: [3513 * 16, 394 * 16, 16, 16],
      land: [3504 * 16, 396 * 16, 16, 16],
    };
    const rects = {};
    for (const [k, [wx, wy, ww, wh]] of Object.entries(regions)) {
      const [x0, y0] = w2s(wx, wy);
      rects[k] = { x: x0, y: y0, w: Math.max(2, Math.round(ww * zoom * dpr)), h: Math.max(2, Math.round(wh * zoom * dpr)) };
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

    // ---- b. 足迹矩形记录（包装 gateFootprintCtx 返回的 ctx）----
    const wwc = g.renderer.waterWarp;
    const paints = [];
    let gateSnap = null;
    if (wwc && !wwc.__iii255Hooked) {
      wwc.__iii255Hooked = true;
      const origGF = wwc.gateFootprintCtx.bind(wwc);
      wwc.gateFootprintCtx = (w, h) => {
        const ctx = origGF(w, h);
        if (!ctx) return null;
        if (!ctx.__iii255Wrapped) {
          ctx.__iii255Wrapped = true;
          const od = ctx.drawImage.bind(ctx);
          const of = ctx.fillRect.bind(ctx);
          ctx.drawImage = (...a) => {
            paints.push({ k: 'img', sx: a[1], sy: a[2], sw: a[3], sh: a[4], dx: a[5], dy: a[6], dw: a[7], dh: a[8] });
            return od(...a);
          };
          ctx.fillRect = (x, y, w2, h2) => {
            paints.push({ k: 'rect', dx: x, dy: y, dw: w2, dh: h2 });
            return of(x, y, w2, h2);
          };
        }
        return ctx;
      };
      const origEF = wwc.endFgPass.bind(wwc);
      wwc.endFgPass = (ctx) => {
        try {
          const gc = wwc.gateCanvas();
          if (gc && gc.width) {
            const c2 = document.createElement('canvas');
            c2.width = gc.width; c2.height = gc.height;
            c2.getContext('2d').drawImage(gc, 0, 0);
            gateSnap = c2;
          }
        } catch { /* 取证失败不碍渲染 */ }
        origEF(ctx);
      };
    }
    // 确定性波源（同 verify:每 30 帧池心涟漪）
    const rippleSrc = import('/src/render/WaterWaves.ts');
    const injectRipple = async () => {
      try { (await rippleSrc).queueRipple(3513 * 16 + 8, 394 * 16 + 8, 2.5); } catch { }
    };
    const paintLog = [];
    return new Promise((res) => {
      let f = 0;
      const samples = [];
      let firstShot = null;
      const step = async () => {
        f++;
        if (f % 30 === 15) await injectRipple();
        if (f === 20) paintLog.push(...paints.splice(0, paints.length));   // 第 20 帧的足迹矩形
        if (f % 5 === 0) {
          const snap = grab();
          if (!firstShot) firstShot = off.toDataURL('image/png');
          samples.push(snap);
          if (samples.length >= 24) {
            const stats = {};
            for (const [k, r] of Object.entries(rects)) {
              const fracs = [];
              for (let i = 1; i < samples.length; i++) fracs.push(diffFrac(samples[i - 1][k], samples[i][k]));
              fracs.sort((a, b) => a - b);
              const mean = fracs.reduce((s2, v) => s2 + v, 0) / fracs.length;
              const longs = [];
              for (let i = 4; i < samples.length; i++) longs.push(diffFrac(samples[0][k], samples[i][k]));
              longs.sort((a, b) => a - b);
              stats[k] = {
                mean, longMean: longs.reduce((s2, v) => s2 + v, 0) / longs.length,
                longMax: longs[longs.length - 1], median: fracs[fracs.length >> 1],
                max: fracs[fracs.length - 1], pairs: fracs.length,
              };
            }
            // ---- c. 门控画布 alpha 图（4 世界 px 网格,x 3504..3524,y 390..398）----
            let gateMap = null, gateInfo = null;
            if (gateSnap) {
              const gctx = gateSnap.getContext('2d', { willReadFrequently: true });
              const lines = [];
              for (let wy = 390 * 16; wy < 398 * 16; wy += 4) {
                let line = '';
                for (let wx = 3504 * 16; wx < 3524 * 16; wx += 4) {
                  const [sx, sy] = w2s(wx + 2, wy + 2);
                  if (sx < 0 || sy < 0 || sx >= gateSnap.width || sy >= gateSnap.height) { line += '?'; continue; }
                  const a = gctx.getImageData(sx, sy, 1, 1).data[3];
                  line += a === 0 ? '.' : a < 3 ? '1' : a < 30 ? '+' : a < 128 ? 'x' : '#';
                }
                lines.push(line);
              }
              gateMap = lines;
              gateInfo = { w: gateSnap.width, h: gateSnap.height };
            }
            res({ stats, paintLog, paintTotal: paints.length, gateMap, gateInfo, shot: firstShot });
            return;
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
  if (result.shot) {
    await import('node:fs/promises').then((f) => f.writeFile(join(OUT, `${tag}-forensics.png`),
      Buffer.from(result.shot.split(',')[1], 'base64')));
  }
  delete result.shot;
  log(tag, 'PAINTS(f20): ' + JSON.stringify(result.paintLog));
  log(tag, 'paintTotal-after: ' + result.paintTotal);
  log(tag, 'GATE alpha map (x3504..3524 step4, y390..398 step4; .=0 1=<3 +,<30 x,<128 #):\n' + (result.gateMap ?? []).join('\n'));
  log(tag, 'STATS ' + JSON.stringify(result.stats));
  return { hoodTxt, stats: result.stats, gateMap: result.gateMap, paintLog: result.paintLog };
}

const saveJsonTxt = fs.readFileSync(MAP, 'utf8');
const browser = await launchBrowser({ errors: [] });
log('browser up');
const report = {};
const pageA = await openArm(browser, { flagQuery: '', tag: 'off' });
report.off = await forensics(pageA, 'off');
const pageB = await openArm(browser, { flagQuery: '?slopewave=1', tag: 'on' });
report.on = await forensics(pageB, 'on');
fs.writeFileSync(join(OUT, 'forensics-report.json'), JSON.stringify(report, null, 1));
log('FORENSICS-DONE');
process.exit(0);
