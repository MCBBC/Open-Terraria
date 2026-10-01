// 诊断6:昼/地表 A-vs-B diff 可视化(B 页内抓 B,传 base64 至 A 页抓 A?——跨页 diff
// 在 node 侧做:两页各回 base64,node diff 出坐标直方图,再让 B 页按 bbox 渲 diff PNG)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errs = [];
async function arm(url, tag) {
  const page = await openPage(browser, {});
  page.on('pageerror', (e) => errs.push(`[${tag}] ` + e.message));
  await bootstrap(page, url);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await page.evaluate(() => {
    const g = window.__swGame; const r = g.renderer; const sky = r.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
    try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; } const fx = r.weatherFx; if (fx) fx.update = () => {}; } catch {}
    g.lighting.clock.tick = () => {};
    // 光照闪烁振荡器钉常量(boot 期分叉→冻结值不同=光照色差)
    try {
      const ck = g.lighting.clock;
      ck.cursorAlpha = 1; ck.cursorDir = -1; ck.mouseTextColor = 255; ck.mouseDir = -1;
      ck.masterColor = 1; ck.masterColorDir = -1; ck.demonTorch = 1; ck.demonDir = -1;
      ck.discoR = 255; ck.discoG = 255; ck.discoB = 255; ck.discoStyle = 0; ck.essScale = 1;
    } catch {}
    sky.ambEntities.length = 0; sky.ambNextAttempt = 1000000;
    sky.maintainClouds = () => {};
    sky.updateClouds = () => {};
    sky.vclouds = [
      { type: 1, x: 180, y: 60, scale: 0.9, alpha: 1, rot: 0, flip: false },
      { type: 2, x: 640, y: 90, scale: 1.1, alpha: 1, rot: 0, flip: false },
      { type: 3, x: 1050, y: 50, scale: 0.8, alpha: 1, rot: 0, flip: true },
      { type: 0, x: 420, y: 130, scale: 1.25, alpha: 1, rot: 0, flip: false },
      { type: 4, x: 860, y: 150, scale: 1.0, alpha: 1, rot: 0, flip: false },
    ];
    for (const st of sky.stars) { st.falling = false; st.hidden = false; }
    import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true));
    const FIXED_T = 12345678;
    Object.defineProperty(r, '_liquidNow', { get: () => FIXED_T, set: () => {}, configurable: true });
    // 风速钉死(windSpeedCurrent 随机游走=树/草摆动相位两臂分叉源)
    try {
      const w = g.world.weather;
      if (w) {
        Object.defineProperty(w, 'windSpeedCurrent', { get: () => 0, set: () => {}, configurable: true });
        Object.defineProperty(w, 'windSpeedTarget', { get: () => 0, set: () => {}, configurable: true });
      }
    } catch {}
    // chunk 池全量重烤(钉风前已烤的摆动偏移驻留缓存——失效后按风=0 重烤对齐)
    try { r.chunks.invalidateAll(); } catch {}
    try { g.chunks?.invalidateAll?.(); } catch {}
    g.running = false;
    g.paused = true;
    import('/src/render/WindSway.ts').then((m) => { m.windSway.active = false; const c = m.windCounters(); c.tree = 0; c.grass = 0; c.sunflower = 0; c.vine = 0; });
    window.__step = (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); g.render(); } };
    window.__shotB64 = () => {
      const lc = document.createElement('canvas');
      lc.width = r.canvas.width; lc.height = r.canvas.height;
      const c = lc.getContext('2d', { willReadFrequently: true });
      if (r.skyCanvas) { c.drawImage(r.skyCanvas, 0, 0); c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0); }
      c.drawImage(r.canvas, 0, 0);
      const d = c.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return btoa(bin);
    };
  });
  await freezeClock(page, { tod: 0.5 });
  await page.evaluate(() => { window.__step(240); try { window.__swGame.natureParticles?.clear?.(); } catch {} });
  return page;
}
const pageA = await arm(ORIGIN + '/?fx=0', 'A');
const pageB = await arm(ORIGIN + '/?c10e=1&fx=0', 'B');
const pageA2 = await arm(ORIGIN + '/?fx=0', 'A2');
const Bgl = await pageB.evaluate(() => {
  const r = window.__swGame.renderer;
  const lc = document.createElement('canvas');
  lc.width = r.canvas.width; lc.height = r.canvas.height;
  const c = lc.getContext('2d', { willReadFrequently: true });
  c.drawImage(document.getElementById('sw-c10e-glcanvas'), 0, 0);
  const d = c.getImageData(0, 0, lc.width, lc.height).data;
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
  return btoa(bin);
});
fs.writeFileSync('shots/c10e/ab-day-BGL.raw', Buffer.from(Bgl, 'base64'));
const cloudState = await pageA.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  return { clouds: sky.vclouds.slice(0, 6).map(c => ({ t: c.type, x: Math.round(c.x), y: Math.round(c.y), s: c.scale })), n: sky.vclouds.length };
});
const cloudStateB = await pageB.evaluate(() => {
  const sky = window.__swGame.renderer.sky;
  return { clouds: sky.vclouds.slice(0, 6).map(c => ({ t: c.type, x: Math.round(c.x), y: Math.round(c.y), s: c.scale })), n: sky.vclouds.length };
});
console.log('A clouds:', JSON.stringify(cloudState));
console.log('B clouds:', JSON.stringify(cloudStateB));
const dumpState = (page) => page.evaluate(() => {
  const g = window.__swGame; const r = g.renderer;
  return {
    fade: r.sky.fade, path: r.composePathUsed, c10eFrame: r._c10eFrame,
    clouds: r.sky.vclouds.length, blackFade: (g.blackFade ?? null),
    blackFadeCam: (g.blackFadeCameraTeleport ?? null),
  };
});
const chunkProbe = (page) => page.evaluate(() => {
  const g = window.__swGame;
  const cc = g.chunks;
  if (!cc) return 'no-chunks';
  const keys = [...cc.chunks.keys()].slice(0, 5);
  const stats = { n: cc.chunks.size, hasUndefined: 0 };
  for (const [, v] of cc.chunks) if (!v) stats.hasUndefined++;
  return JSON.stringify(stats);
});
console.log('A chunks:', await chunkProbe(pageA));
console.log('B chunks:', await chunkProbe(pageB));
const tileDump = (page) => page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const out = [];
  for (let ty = 300; ty < 330; ty += 3) for (let tx = 600; tx < 640; tx += 5) {
    const i = st.idx(tx, ty);
    out.push(`${tx},${ty}:${st.type[i]}/${st.frameX[i] >> 4},${st.frameY[i] >> 4}`);
  }
  return out.join(' ');
});
console.log('A tiles:', await tileDump(pageA));
console.log('B tiles:', await tileDump(pageB));
console.log('A state:', JSON.stringify(await dumpState(pageA)));
console.log('B state:', JSON.stringify(await dumpState(pageB)));
const lightDump = (page) => page.evaluate(() => {
  const g = window.__swGame;
  const L = g.lighting;
  const px = 455 * 16, py = 200 * 16;
  const tx = px >> 4, ty = py >> 4;
  const out = { tx, ty };
  try {
    const w = g.world.store.w;
    const at = (a) => a ? a[ty * w + tx] : 'null';
    out.rgb = `${at(L.r)},${at(L.g)},${at(L.b)}`;
    // 周边三格
    out.rgb2 = `${at(L.r) === 'undefined' ? '?' : L.r[(ty + 1) * w + tx]},${L.g[(ty + 1) * w + tx]},${L.b[(ty + 1) * w + tx]}`;
    out.mushroomTile = st ? `${st.type[st.idx(tx, ty)]}` : '?';
  } catch (e) { out.err = String(e); }
  try { out.flicker = { cursorAlpha: L.clock.cursorAlpha, demonTorch: L.clock.demonTorch, discoR: L.clock.discoR }; } catch (e2) {}
  return out;
});
console.log('A light:', JSON.stringify(await lightDump(pageA)));
console.log('B light:', JSON.stringify(await lightDump(pageB)));
const A = await pageA.evaluate(() => window.__shotB64());
const B = await pageB.evaluate(() => window.__shotB64());
fs.writeFileSync('shots/c10e/ab-day-A.raw', Buffer.from(A, 'base64'));
fs.writeFileSync('shots/c10e/ab-day-B.raw', Buffer.from(B, 'base64'));
console.log('raw saved', A.length, B.length);
const A2 = await pageA2.evaluate(() => window.__shotB64());
fs.writeFileSync('shots/c10e/ab-day-A2.raw', Buffer.from(A2, 'base64'));
process.exit(0);
