// IIII251 斜坡水缘波纹 A/B 验证探针(?slopewave=1 off/on 双臂,同浏览器同世界):
//   · 时域差分断言:冻结时钟+定机位,对标记格区域连拍采样,统计相邻帧像素变化率
//     ——OFF 臂坡面格恒静(现状定谳),ON 臂坡面格进入波场(>阈值);平水面两臂均动
//     (不回归);干燥陆地两臂均静(对照)。
//   · 标记 JSON 坐标逐一核(store 真值 vs marks-*.json)。
//   · 截图证据(off/on 各一张全帧 + 池塘裁剪)。
// 用法(game/ 下):SW_ORIGIN=http://localhost:5301 node tools/run-diag.mjs \
//   --timeout=600000 scripts/_iii251-verify.mjs
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { __clockFreezeInPage } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5301';
const OUT = process.env.III251_OUT ?? '/tmp/iii251-out';
const MAP = process.env.III251_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (30).json';
const MARKS = process.env.III251_MARKS ?? '/Users/vinlic/Downloads/marks-Starter_World (45).json';
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'shots'), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROG = '/tmp/iii251-progress.log';
const log = (...a) => {
  const line = `[iii251] ${a.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(PROG, line + '\n'); } catch { /* 忽略 */ }
};

// 断言阈值(时域差分,changedFrac = 相邻帧变化像素占比均值)
const TH = { slopeOffMax: 0.005, slopeOnMin: 0.01, flatMin: 0.01, landMax: 0.005, onOverOff: 4 };

/** 打开一臂页面并载入世界 */
async function openArm(browser, { flagQuery = '' }) {
  const page = await openPage(browser, { errors: [] });
  page.on('dialog', async (d) => { log('DIALOG:', d.message().slice(0, 200)); await d.dismiss().catch(() => {}); });
  page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 200)));
  page.__probeOrigin = ORIGIN;
  await cleanStorage(page, {});
  const okGoto = await gotoApp(page, ORIGIN, { extraQuery: flagQuery, tries: 30 });
  if (!okGoto) throw new Error('goto failed');
  await waitForBridge(page);
  await front(page);
  await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
  void page.evaluate(() => window.__swFlow.quickLoad()).catch((e) => log('quickLoad rejected:', String(e).slice(0, 120)));
  let ok = false;
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store));
    if (ok) break;
  }
  if (!ok) throw new Error('game-timeout ' + flagQuery);
  await dismissWelcome(page).catch(() => {});
  await godMode(page, true);
  return page;
}

/** 机位+冻结+采样 */
async function sampleArm(page, tag) {
  // 定格时辰(正午)→光照平滑收敛窗
  await page.evaluate(() => globalThis.__clockFreezeInPage({ tod: 0.5 }));
  await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
  await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
  await sleep(1500);
  await camSnapToTile(page, 3514, 394, { player: false });
  await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
  await sleep(2500);   // 光照 4 态收敛+传送涟漪衰减
  // 标记格 store 真值(坐标核)
  const truth = await page.evaluate(() => {
    const st = window.__swGame.world.store;
    const probe = (x, y) => {
      const i = st.idx(x, y);
      return { x, y, type: st.type[i], slope: st.slope[i], half: st.half[i], liquid: st.liquid[i], liquidType: st.liquidType[i] };
    };
    return {
      mark1: probe(3508, 394), mark2: probe(3521, 394), half: probe(3518, 394),
      water1: probe(3509, 394), water2: probe(3520, 394), land: probe(3504, 396),
    };
  });
  // 时域差分采样(页内 rAF 驱动,24 样本×每 5 帧;区域=世界 px 矩形)
  const result = await page.evaluate(async ({ th }) => {
    const g = window.__swGame;
    const cv = g.renderer.canvas;
    const dpr = cv.width / g.camera.viewW;
    const zoom = g.camera.zoom;
    const camL = g.camera.x - g.camera.viewW / 2 / zoom;
    const camT = g.camera.y - g.camera.viewH / 2 / zoom;
    const regions = {
      mark1: [3508 * 16, 394 * 16, 16, 16],
      mark2: [3521 * 16, 394 * 16, 16, 16],
      half: [3518 * 16, 394 * 16, 16, 8],
      flat: [3513 * 16, 394 * 16, 16, 16],
      land: [3504 * 16, 396 * 16, 16, 16],
    };
    const rects = {};
    for (const [k, [wx, wy, ww, wh]] of Object.entries(regions)) {
      const x0 = Math.round((wx - camL) * zoom * dpr), y0 = Math.round((wy - camT) * zoom * dpr);
      rects[k] = { x: x0, y: y0, w: Math.round(ww * zoom * dpr), h: Math.round(wh * zoom * dpr) };
    }
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const octx = off.getContext('2d', { willReadFrequently: true });
    const grab = () => {
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.drawImage(cv, 0, 0);
      const out = {};
      for (const [k, r] of Object.entries(rects)) {
        out[k] = octx.getImageData(r.x, r.y, r.w, r.h).data;
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
    const samples = [];
    let firstShot = null;
    await new Promise((res) => {
      let f = 0, s = 0;
      const step = () => {
        f++;
        if (f % 5 === 0) {
          const snap = grab();
          if (!firstShot) {
            firstShot = off.toDataURL('image/png');
            for (const k of Object.keys(snap)) samples.push({ k, fracs: [] });   // 占位
            samples.length = 0;
          }
          samples.push(snap);
          if (samples.length >= 24) { res(); return; }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const stats = {};
    for (const k of Object.keys(rects)) {
      const fracs = [];
      for (let i = 1; i < samples.length; i++) fracs.push(diffFrac(samples[i - 1][k], samples[i][k]));
      fracs.sort((a, b) => a - b);
      const mean = fracs.reduce((s2, v) => s2 + v, 0) / fracs.length;
      stats[k] = { mean, median: fracs[fracs.length >> 1], max: fracs[fracs.length - 1], pairs: fracs.length };
    }
    return { stats, dpr, zoom, camL, camT, shot: firstShot };
  }, { th: TH });
  if (result.shot) {
    await import('node:fs/promises').then((f) => f.writeFile(join(OUT, 'shots', `${tag}-full.png`),
      Buffer.from(result.shot.split(',')[1], 'base64')));
  }
  delete result.shot;
  log(tag, JSON.stringify(result.stats));
  return { truth, ...result };
}

const saveJsonTxt = fs.readFileSync(MAP, 'utf8');
const browser = await launchBrowser({ errors: [] });
log('browser up');

// —— 种子 IDB 一次(evaluateOnNewDocument 每页导航重放,两臂共用) ——
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
await browser.version();   // 确保就绪
// evaluateOnNewDocument 需在 page 上注册:两臂 openArm 前逐页注册
const seedPage = async (page) => {
  await page.evaluateOnNewDocument(seedDef, saveJsonTxt);
};
// —— 臂 A:flag off ——
const pageA = await openPage(browser, { errors: [] });
await seedPage(pageA);
const A = await sampleArm({ ...{}, page: pageA } && pageA, 'off');
// —— 臂 B:?slopewave=1 ——
const pageB = await openPage(browser, { errors: [] });
await seedPage(pageB);
// openArm 内含 goto(cleanStorage)——重写:直接复用 openArm 但 page 已建
const B = await (async () => {
  const page = pageB;
  page.on('dialog', async (d) => { log('DIALOG:', d.message().slice(0, 200)); await d.dismiss().catch(() => {}); });
  page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 200)));
  page.__probeOrigin = ORIGIN;
  await cleanStorage(page, {});
  const okGoto = await gotoApp(page, ORIGIN, { extraQuery: 'slopewave=1', tries: 30 });
  if (!okGoto) throw new Error('goto failed B');
  await waitForBridge(page);
  await front(page);
  await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
  void page.evaluate(() => window.__swFlow.quickLoad()).catch((e) => log('quickLoad rejected:', String(e).slice(0, 120)));
  let ok = false;
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store));
    if (ok) break;
  }
  if (!ok) throw new Error('game-timeout B');
  await dismissWelcome(page).catch(() => {});
  await godMode(page, true);
  return sampleArm(page, 'on');
})();

// —— 断言 ——
const marks = JSON.parse(fs.readFileSync(MARKS, 'utf8')).marks;
const coordCheck = marks.map((m) => ({
  no: m.no, x: m.x, y: m.y, typeKey: m.typeKey,
  store: [A.truth, B.truth].map((t) => {
    const hit = Object.values(t).find((c) => c.x === m.x && c.y === m.y);
    return hit ? { slope: hit.slope, half: hit.half, liquid: hit.liquid, type: hit.type } : null;
  }),
}));
const fails = [];
const chk = (cond, name, detail) => { if (!cond) fails.push(`${name}: ${detail}`); };
for (const [tag, R] of [['off', A], ['on', B]]) {
  chk(R.stats.flat.mean > TH.flatMin, `${tag} flat-waves-present`, `mean=${R.stats.flat.mean.toFixed(4)}`);
  chk(R.stats.land.mean < TH.landMax, `${tag} land-static`, `mean=${R.stats.land.mean.toFixed(4)}`);
}
chk(A.stats.mark1.mean < TH.slopeOffMax, 'off mark1-static', `mean=${A.stats.mark1.mean.toFixed(4)}`);
chk(A.stats.mark2.mean < TH.slopeOffMax, 'off mark2-static', `mean=${A.stats.mark2.mean.toFixed(4)}`);
chk(A.stats.half.mean < TH.slopeOffMax, 'off half-static', `mean=${A.stats.half.mean.toFixed(4)}`);
chk(B.stats.mark1.mean > TH.slopeOnMin, 'on mark1-waves', `mean=${B.stats.mark1.mean.toFixed(4)}`);
chk(B.stats.mark2.mean > TH.slopeOnMin, 'on mark2-waves', `mean=${B.stats.mark2.mean.toFixed(4)}`);
chk(B.stats.half.mean > TH.slopeOnMin, 'on half-waves', `mean=${B.stats.half.mean.toFixed(4)}`);
chk(B.stats.mark1.mean > A.stats.mark1.mean * TH.onOverOff, 'on/off mark1-ratio',
  `on=${B.stats.mark1.mean.toFixed(4)} off=${A.stats.mark1.mean.toFixed(4)}`);
chk(B.stats.mark2.mean > A.stats.mark2.mean * TH.onOverOff, 'on/off mark2-ratio',
  `on=${B.stats.mark2.mean.toFixed(4)} off=${A.stats.mark2.mean.toFixed(4)}`);

const report = {
  th: TH, off: { stats: A.stats, truth: A.truth }, on: { stats: B.stats, truth: B.truth },
  coordCheck, fails,
  query: { off: A.query ?? '', on: 'slopewave=1' },
};
fs.writeFileSync(join(OUT, 'verify-report.json'), JSON.stringify(report, null, 1));
log('coordCheck', JSON.stringify(coordCheck));
if (fails.length) { log('FAIL', fails.join(' | ')); process.exit(2); }
log('ALL-GREEN');
process.exit(0);
