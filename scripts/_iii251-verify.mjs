// IIII251 斜坡水缘波纹 A/B 验证探针(?slopewave=1 off/on 双臂,同浏览器同世界):
//   · 时域差分断言:冻结时钟+定机位,对标记格区域连拍采样,统计相邻帧像素变化率
//     ——OFF 臂坡面格恒静(现状定谳),ON 臂坡面格进入波场(>阈值);平水面两臂均动
//     (不回归);干燥陆地两臂均静(对照)。
//   · 标记 JSON 坐标逐一核(store 真值 vs marks-*.json)。
//   · 截图证据(off/on 各一张全帧)。
// 用法(game/ 下):SW_ORIGIN=http://localhost:5301 node tools/run-diag.mjs \
//   --timeout=600000 scripts/_iii251-verify.mjs
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

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

// 断言阈值(时域差分,mean = 相邻帧变化像素占比均值)
const TH = { slopeOffMax: 0.005, slopeOnMin: 0.01, flatMin: 0.01, landMax: 0.005, onOverOff: 4 };

/** 页内种子:把整档 JSON 预置进 quicksave 键(v6 worker saveParse 只认 IDB key,
 *  __swLoadJson 的 json 源已断——探针走 quickLoad→loadFromKey 主路径) */
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

/** 打开一臂页面(flag 查询参数)并载入世界 */
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
  const fireLoad = () => page.evaluate(() => {
    if (!window.__swFlow?.quickLoad) return 'no-flow';
    void window.__swFlow.quickLoad();
    return 'dispatched';
  });
  for (let k = 0; k < 10; k++) {
    const r = await fireLoad().catch((e) => 'eval-err:' + String(e).slice(0, 80));
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

/** 定格时辰+定机位+时域差分采样 */
async function sampleArm(page, tag) {
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
  await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
  await sleep(1500);
  await camSnapToTile(page, 3514, 394, { player: false });
  await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
  await sleep(2500);   // 光照收敛+传送涟漪衰减
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
  const camDump = await page.evaluate(() => {
    const g = window.__swGame;
    return { cam: { x: Math.round(g.camera.x), y: Math.round(g.camera.y), zoom: g.camera.zoom },
      player: { x: Math.round(g.player.x), y: Math.round(g.player.y) },
      cv: { w: g.renderer.canvas.width, h: g.renderer.canvas.height } };
  });
  log(tag, 'camDump', JSON.stringify(camDump));
  const result = await page.evaluate(() => {
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
    const samples = [];
    let firstShot = null;
    return new Promise((res) => {
      let f = 0;
      const step = () => {
        f++;
        if (f % 5 === 0) {
          const snap = grab();
          if (!firstShot) firstShot = off.toDataURL('image/png');
          samples.push(snap);
          if (samples.length >= 24) {
            const stats = {};
            for (const k of Object.keys(rects)) {
              const fracs = [];
              for (let i = 1; i < samples.length; i++) fracs.push(diffFrac(samples[i - 1][k], samples[i][k]));
              fracs.sort((a, b) => a - b);
              stats[k] = {
                mean: fracs.reduce((s2, v) => s2 + v, 0) / fracs.length,
                median: fracs[fracs.length >> 1], max: fracs[fracs.length - 1], pairs: fracs.length,
              };
            }
            res({ stats, dpr, zoom, camL, camT, shot: firstShot });
            return;
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  });
  if (result.shot) {
    await import('node:fs/promises').then((f) => f.writeFile(join(OUT, 'shots', `${tag}-full.png`),
      Buffer.from(result.shot.split(',')[1], 'base64')));
  }
  delete result.shot;
  log(tag, JSON.stringify(result.stats));
  return { truth, ...result, query: tag };
}

const saveJsonTxt = fs.readFileSync(MAP, 'utf8');
const browser = await launchBrowser({ errors: [] });
log('browser up');

const pageA = await openArm(browser, { flagQuery: '', tag: 'off' });
const A = await sampleArm(pageA, 'off');
const pageB = await openArm(browser, { flagQuery: 'slopewave=1', tag: 'on' });
const B = await sampleArm(pageB, 'on');

// —— 标记 JSON 坐标核 ——
const marks = JSON.parse(fs.readFileSync(MARKS, 'utf8')).marks;
const coordCheck = marks.map((m) => ({
  no: m.no, x: m.x, y: m.y, typeKey: m.typeKey,
  storeOff: (() => { const h = Object.values(A.truth).find((c) => c.x === m.x && c.y === m.y); return h ? { slope: h.slope, half: h.half, liquid: h.liquid, type: h.type } : null; })(),
  storeOn: (() => { const h = Object.values(B.truth).find((c) => c.x === m.x && c.y === m.y); return h ? { slope: h.slope, half: h.half, liquid: h.liquid, type: h.type } : null; })(),
}));

// —— 断言 ——
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

fs.writeFileSync(join(OUT, 'verify-report.json'),
  JSON.stringify({ th: TH, off: { stats: A.stats, truth: A.truth, query: A.query }, on: { stats: B.stats, truth: B.truth, query: B.query }, coordCheck, fails }, null, 1));
log('coordCheck', JSON.stringify(coordCheck));
if (fails.length) { log('FAIL', fails.join(' | ')); process.exit(2); }
log('ALL-GREEN');
process.exit(0);
