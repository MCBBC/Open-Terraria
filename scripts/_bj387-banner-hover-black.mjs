// ★BJ387 悬停 A 旗（猫咪Hill）→ B 旗（染匠 Muhammad,紫发）黑块 AB 探针——用户实存档
// （map-Starter_World (36) → public/_bj387-map.json）:夜晚+雨天,双旗=A=town_cat
// home[596,330] / B=dyer home[608,336]。帧A=鼠标角落（不悬停）,帧B=真实鼠标悬停
// A 旗中心 → B 旗矩形逐像素 diff + shim 事件序 + bglPathUsed 账。
// 运行：SW_ORIGIN=http://localhost:5251 node tools/run-diag.mjs scripts/_bj387-banner-hover-black.mjs
import fs from 'node:fs';
import { launchBrowser, openPage, bootstrap, waitForGame, ledger, godMode, nextFrame, freezeClock } from '../tools/probe/lib/index.mjs';
import { saveCanvasShot, saveJson } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5251';
const L = ledger();

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);

// ---- 载入用户存档 ----
const load = await page.evaluate(async () => {
  const t = await (await fetch('/_bj387-map.json')).text();
  void window.__swLoadJson(t);
  return { len: t.length };
});
L.chk('loadJson', load.len > 1000000, `bytes=${load.len}`);
const ok = await waitForGame(page, { timeout: 120000 });
L.chk('game-ready', !!ok);
await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 1500);

// ---- 夜 + 雨（雷闪钉 0 防 AB 亮场污染）----
await freezeClock(page, { tod: 22 / 24 });
await page.evaluate(() => {
  const w = window.__swGame.world;
  w.weather.raining = true; w.weather.rainTime = 1e9;
  w.weather.lightning = 0; w.weather.lightningSpeed = 0;
  Object.defineProperty(w.weather, 'lightning', { get() { return 0; }, set() {}, configurable: true });
});
await godMode(page, true);

// ---- 旗几何（drawHouseBanners 单源函数 in-page 直调）----
const geom = await page.evaluate(async () => {
  const g = window.__swGame;
  const { findBannerAnchorY } = await import('/src/world/Housing.ts');
  const npcs = (g.entities.npcs ?? []).filter((n) => !n.dead && !n.bound && n.home && n.npcKey !== 'old_man');
  const mk = (n) => {
    const cy = findBannerAnchorY(g.world.store, n.home.x, n.home.y);
    if (cy === null) return null;
    const onPlatform = false;
    const bx = n.home.x * 16 + 8;
    const by = (cy + 1) * 16 + (onPlatform ? 10 : 18);
    return { bx, by, w: 34, h: 46, cy, key: n.npcKey, name: n.givenName, vid: n.vanillaId };
  };
  const cat = npcs.find((n) => n.npcKey === 'town_cat');
  const dyer = npcs.find((n) => n.npcKey === 'dyer');
  return {
    A: cat ? mk(cat) : null,
    B: dyer ? mk(dyer) : null,
    npcs: npcs.map((n) => ({ key: n.npcKey, name: n.givenName, home: n.home })),
    ltA: cat ? (g.renderer.lighting?.lightAt(cat.home.x, mk(cat)?.cy) ?? null) : null,
    ltB: dyer ? (g.renderer.lighting?.lightAt(dyer.home.x, mk(dyer)?.cy) ?? null) : null,
  };
});
L.chk('旗几何', !!geom.A && !!geom.B, JSON.stringify({ A: geom.A, B: geom.B, ltA: geom.ltA, ltB: geom.ltB }));
if (!geom.A || !geom.B) { console.log('NPCS:', JSON.stringify(geom.npcs)); L.print(); process.exit(L.exitCode()); }

// ---- 相机钉两旗之间（zoom 4;等 follow 收敛）----
await page.evaluate((gm) => {
  const g = window.__swGame;
  const mx = (gm.A.bx + gm.B.bx) / 2, my = (gm.A.by + gm.B.by) / 2;
  const cat = (g.entities.npcs ?? []).find((n) => n.npcKey === 'town_cat');
  if (cat) { g.player.x = cat.x; g.player.y = cat.y; g.player.vx = 0; g.player.vy = 0; }
  g.camera.zoom = 4;
  g.camera.x = mx; g.camera.y = my;
}, geom);
await nextFrame(page);
for (let i = 0; i < 15; i++) {
  const stable = await page.evaluate(() => {
    const c = window.__swGame.camera;
    const px = window.__bj387cam ?? null;
    window.__bj387cam = { x: c.x, y: c.y };
    return px && Math.abs(px.x - c.x) < 0.05 && Math.abs(px.y - c.y) < 0.05;
  });
  await nextFrame(page);
  if (stable && i > 2) break;
}

// ---- shim 事件影子（push 序 + fillRect/bound 面 + presentBatch 的 wctx.gCO）----
await page.evaluate(() => {
  const shim = window.__swGame.renderer.bglEntShim;
  window.__bj387 = { events: [], mm: [] };
  window.addEventListener('mousemove', (e) => {
    const mm = window.__bj387.mm;
    mm.push([e.clientX, e.clientY, performance.now() | 0]);
    if (mm.length > 12) mm.shift();
  });
  if (!shim) return;
  const log = (e) => { window.__bj387.events.push(e); };
  const qdump = (shim) => {
    const out = [];
    let p = shim.head;
    while (p && out.length < 8) { out.push(`t${p.tier}s${p.solid?1:0}@${p.dx | 0},${p.dy | 0} ${p.dw | 0}x${p.dh | 0}`); p = p.next; }
    return out.join(' | ') || '(empty)';
  };
  const origPush = shim.push.bind(shim);
  shim.push = function (...args) {
    log({
      k: 'push', tier: args[0], solid: args[2],
      dx: args[8], dy: args[9], dw: args[10], dh: args[11],
      alpha: args[13], fr: args[14], fg: args[15], fb: args[16],
    });
    return origPush(...args);
  };
  // fillRect:Proxy 走 bound 表——替换表项（普查案②同款绕过面）
  const origBoundFill = shim.bound.fillRect;
  shim.bound.fillRect = function (x, y, w, h) {
    log({ k: 'fillRect', x, y, w, h, gco: this.gco, acc: this.accMode, q: qdump(this) });
    return origBoundFill(x, y, w, h);
  };
  const origFlush = shim.flush.bind(shim);
  shim.flush = function () {
    log({ k: 'flush', acc: this.accMode, q: qdump(this) });
    return origFlush();
  };
  const proto = shim.constructor.prototype;
  const origPB = proto.presentBatch;
  proto.presentBatch = function (glw, wctx, w, h, tier, additive) {
    log({ k: 'presentBatch', tier, additive, wctxGco: wctx.globalCompositeOperation, n: w, h });
    return origPB.call(this, glw, wctx, w, h, tier, additive);
  };
});

// ---- 像素工具 ----
await page.evaluate(() => {
  window.__bj387snap = () => {
    const cv = window.__swGame.renderer.canvas;
    const oc = document.createElement('canvas');
    oc.width = cv.width; oc.height = cv.height;
    const octx = oc.getContext('2d', { willReadFrequently: true });
    octx.drawImage(cv, 0, 0);
    return octx.getImageData(0, 0, cv.width, cv.height);
  };
});

const diffFn = ({ rect, label }) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const sc = cv.clientWidth / cv.width;
  const w2s = (wx, wy) => { const [sx, sy] = g.camera.worldToScreen(wx, wy); return [sx * sc, sy * sc]; };
  const [ax0, ay0] = w2s(rect.bx - rect.w / 2, rect.by - rect.h / 2);
  const [ax1, ay1] = w2s(rect.bx + rect.w / 2, rect.by + rect.h / 2);
  const x0 = Math.max(0, Math.floor(ax0)), y0 = Math.max(0, Math.floor(ay0));
  const x1 = Math.min(cv.width - 1, Math.ceil(ax1)), y1 = Math.min(cv.height - 1, Math.ceil(ay1));
  const snap = window.__bj387snap();
  const d = snap.data;
  let n = 0, sr = 0, sg = 0, sb = 0, dark = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * cv.width + x) * 4;
    n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
    if (d[i] + d[i + 1] + d[i + 2] < 120) dark++;
  }
  return { label, rect: [x0, y0, x1, y1], n, avg: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)], darkFrac: +(dark / n).toFixed(3) };
};

const diffVsA = ({ rect, label }) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const sc = cv.clientWidth / cv.width;
  const w2s = (wx, wy) => { const [sx, sy] = g.camera.worldToScreen(wx, wy); return [sx * sc, sy * sc]; };
  const [ax0, ay0] = w2s(rect.bx - rect.w / 2, rect.by - rect.h / 2);
  const [ax1, ay1] = w2s(rect.bx + rect.w / 2, rect.by + rect.h / 2);
  const x0 = Math.max(0, Math.floor(ax0)), y0 = Math.max(0, Math.floor(ay0));
  const x1 = Math.min(cv.width - 1, Math.ceil(ax1)), y1 = Math.min(cv.height - 1, Math.ceil(ay1));
  const A = window.__bj387snapA.data, B = window.__bj387snap().data;
  let changed = 0, sr = 0, sg = 0, sb = 0, ar = 0, ag = 0, ab = 0, darkB = 0, bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * cv.width + x) * 4;
    const df = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
    if (df > 36) {
      changed++;
      ar += A[i]; ag += A[i + 1]; ab += A[i + 2];
      sr += B[i]; sg += B[i + 1]; sb += B[i + 2];
      if (B[i] + B[i + 1] + B[i + 2] < 90) darkB++;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
  }
  const n = (x1 - x0 + 1) * (y1 - y0 + 1);
  return { label, rectN: n, changed, chgFrac: +(changed / n).toFixed(3),
    avgBefore: changed ? [Math.round(ar / changed), Math.round(ag / changed), Math.round(ab / changed)] : null,
    avgAfter: changed ? [Math.round(sr / changed), Math.round(sg / changed), Math.round(sb / changed)] : null,
    darkAfterFrac: changed ? +(darkB / changed).toFixed(3) : 0,
    chgBox: changed ? [bx0, by0, bx1, by1] : null };
};

const readDiag = () => ({
  mx: window.__swGame.renderer._mouseX, my: window.__swGame.renderer._mouseY,
  path: window.__swGame.renderer.bglPathUsed,
  mm: window.__bj387.mm.slice(-4),
});

// ---- 帧 A：不悬停（鼠标角落）----
await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  window.__bj387.mmCss = [2, 2];
});
await page.mouse.move(2, 2);
await page.evaluate(() => { window.__bj387.events.length = 0; });
await nextFrame(page);
await nextFrame(page);
const diagA = await page.evaluate(readDiag);
const frameA = await page.evaluate(diffFn, { rect: geom.B, label: 'B-nohover' });
const frameA_A = await page.evaluate(diffFn, { rect: geom.A, label: 'A-nohover' });
const evA = await page.evaluate(() => ({
  n: window.__bj387.events.length,
  tail: window.__bj387.events.slice(-30),
  all: window.__bj387.events,
  stats: JSON.parse(JSON.stringify(window.__swGame.renderer.bglEntShim?.stats ?? null)),
}));
await page.evaluate(() => { window.__bj387snapA = window.__bj387snap(); });
await saveCanvasShot(page, '/tmp/bj387-frameA-nohover.png');

// ---- 帧 B：真实鼠标悬停 A（猫咪Hill）旗中心 ----
const ptA = await page.evaluate((r) => {
  const cv = window.__swGame.renderer.canvas;
  const sc = cv.clientWidth / cv.width;
  const [sx, sy] = window.__swGame.camera.worldToScreen(r.bx, r.by);
  return { cssX: Math.round(sx * sc), cssY: Math.round(sy * sc) };
}, geom.A);
await page.mouse.move(ptA.cssX, ptA.cssY);
await page.evaluate(() => { window.__bj387.events.length = 0; });
await nextFrame(page);
await nextFrame(page);
const diagB = await page.evaluate(readDiag);
const frameB = await page.evaluate(diffFn, { rect: geom.B, label: 'B-hover' });
const frameB_A = await page.evaluate(diffFn, { rect: geom.A, label: 'A-hover' });
const diffB = await page.evaluate(diffVsA, { rect: geom.B, label: 'B-vs-A' });
const diffA = await page.evaluate(diffVsA, { rect: geom.A, label: 'A-vs-A' });
const evB = await page.evaluate(() => ({
  n: window.__bj387.events.length,
  tail: window.__bj387.events.slice(-30),
  all: window.__bj387.events,
  stats: JSON.parse(JSON.stringify(window.__swGame.renderer.bglEntShim?.stats ?? null)),
}));
await saveCanvasShot(page, '/tmp/bj387-frameB-hover.png');

console.log('GEOM:', JSON.stringify({ A: geom.A, B: geom.B, ltA: geom.ltA, ltB: geom.ltB }));
console.log('PT A:', JSON.stringify(ptA), 'diagA:', JSON.stringify(diagA), 'diagB:', JSON.stringify(diagB));
console.log('DIFF B:', JSON.stringify(diffB));
console.log('DIFF A:', JSON.stringify(diffA));
console.log('FRAME A B:', JSON.stringify(frameA));
console.log('FRAME B B:', JSON.stringify(frameB));
console.log('EV A:', JSON.stringify(evA.stats), 'path:', diagA.path);
console.log('EV B:', JSON.stringify(evB.stats), 'path:', diagB.path);
console.log('EV A tail:', JSON.stringify(evA.tail));
console.log('EV B tail:', JSON.stringify(evB.tail));
saveJson('/tmp/bj387-verdict.json', { geom, ptA, diagA, diagB, diffB, diffA, frameA, frameB, evA: evA.stats, evB: evB.stats, evATail: evA.tail, evBTail: evB.tail, evAAll: evA.all, evBAll: evB.all });

L.print();
process.exit(L.exitCode());
