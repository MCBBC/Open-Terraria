// IIII257 性能闸:同点位(3517,394) zoom2 rAF 300 帧×2 轮,双臂 GL:
//   缺省(257 转正=足迹+位移门开) vs ?slopewave=0(灰度期=足迹缺席)
// 基线:IIII255 on=16.638 / IIII256(亮线过画) 16.669-16.720。判据 Δavg<0.5%(vsync 噪声级)。
// 用法: node tools/probe.mjs run scripts/_iii257-perf.mjs --vite=5306 --out=/tmp/iii257-out
import { DOWNLOADS, needInput } from './_pathlib.mjs';
import fs from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile } from '../tools/probe/lib/camera.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5306';
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii257-out';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (30).json'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[iii257p]', ...a);
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
  await sleep(1200);
  await camSnapToTile(page, 3517, 394, { player: false });
  await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
  await sleep(1500);
  return page;
}

const rounds = {};
for (const [tag, query] of [['default', ''], ['escape', '?slopewave=0']]) {
  const page = await openArm(query, tag);
  const rs = [];
  for (let r = 0; r < 2; r++) {
    const st = await page.evaluate(() => new Promise((res) => {
      const ds = [];
      let last = performance.now(), n = 0;
      const step = () => {
        const t = performance.now();
        ds.push(t - last); last = t;
        if (++n >= 300) { ds.shift(); res(ds); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }));
    const avg = st.reduce((s, v) => s + v, 0) / st.length;
    const sorted = [...st].sort((a, b) => a - b);
    rs.push({ avg: +avg.toFixed(3), p50: +sorted[st.length >> 1].toFixed(3), p95: +sorted[Math.floor(st.length * 0.95)].toFixed(3) });
    await sleep(400);
  }
  rounds[tag] = rs;
  await page.close();
  log(tag, JSON.stringify(rs));
}
const dAvg = (rounds.default.reduce((s, r) => s + r.avg, 0) / rounds.default.length)
  - (rounds.escape.reduce((s, r) => s + r.avg, 0) / rounds.escape.length);
const escAvg = rounds.escape.reduce((s, r) => s + r.avg, 0) / rounds.escape.length;
const out = { rounds, deltaMs: +dAvg.toFixed(3), deltaPct: +(dAvg / escAvg * 100).toFixed(3), baseline: { i255: 16.638, i256: [16.669, 16.72] } };
writeFileSync(join(OUT, 'perf-report.json'), JSON.stringify(out, null, 1));
log('Δ(avg default-escape)=', out.deltaMs, 'ms (', out.deltaPct, '% )');
log(out.deltaPct < 0.5 ? 'PASS perf-gate (Δ<0.5%)' : 'FAIL perf-gate');
process.exit(out.deltaPct < 0.5 ? 0 : 3);
