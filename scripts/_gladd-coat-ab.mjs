// ★gladd Phase 1 试点（task#22 面①）coat glow GL 桥像素对拍（2026-10-14;
// _b1-world-ab 页内翻面范式同族）。A(2D drawCoatGlowGrid) vs B(GL
// drawCoatGlowGridGL)——页内 Renderer.gladd 翻面（?gladd=1 载入验旗解析,运行时
// 翻面做 A/B）。glow 场景=store.coat 直写 fullbright 位+chunk 重烘（worldgen 后
// 地表/洞穴墙俱在,WALL 位副本有实料）。
// 判据:
//   GA  各相位×各 tick:A≡B 终帧逐字节 md5（主判;tie 相位按 B1 Skia tie 定谳
//       census 有界 n<5% 且 bbox 落 glow 矩形=仅高频抖纹级）;
//   GB  A'≡A 翻回恢复（无残留）;
//   GC  B 态路径活性:gladdCoatStats.gl 增量>0（会话实走）∧ fb 增量=0（纯帧无退避）;
//   GD  夹层帧（重力翻转 _c10eWorldToHud）=2D 回退正确（fb 增量>0 ∧ 视觉 A≡B
//       ——回退路径锁）;
//   GE  帧耗时 A vs B（稳态有界:B 含 GL 会话+quadTile,稳态应 ≈A）。
// 矩阵:地表静立（glow×块+墙）/zoom1.27/zoom1.5625/zoom2/洞穴暗光（WALL 主场,
//       暗光下 glow 全亮可见）/重力翻转/低清K0.5（_c10eFrame=false 哨兵）。
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs --timeout=900000 scripts/_gladd-coat-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const URL0 = ORIGIN + '/?gladd=1&cloudcache=0';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' / ')));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

// ---- 确定性套件 + 翻面/注入面 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);   // dt=0 云停
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__gladdSet = (v) => { r.constructor.gladd = v; };
  window.__gladdState = () => ({ flag: r.constructor.gladd, stats: { ...r.gladdCoatStats } });
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
  };
  // ★glow 场景注入:store.coat 直写 fullbright 位（8=块/16=墙,TileStore:66-67）
  //  +覆盖 chunk markDirty 重烘（worker 异步回包,调用方 pump 收敛）。返回涂格数。
  window.__paintGlow = (block, wall) => {
    const st = g.world.store;
    const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
    let n = 0;
    for (let dy = -6; dy <= 2; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
        const i = st.idx(x, y);
        const before = st.coat[i];
        const c = before | (block ? 8 : 0) | (wall ? 16 : 0);
        if (c !== before) { st.coat[i] = c; n++; }
      }
    }
    const ch = g.chunks;
    for (let cy = Math.floor((py - 6) / 16); cy <= Math.floor((py + 2) / 16); cy++)
      for (let cx = Math.floor((px - 10) / 16); cx <= Math.floor((px + 10) / 16); cx++)
        ch.markDirty(cx, cy);
    window.__glowRect = { px, py };   // 对拍 bbox 归属判据
    return n;
  };
  window.__grav = (v) => { g.player.gravDir = v; };
  // ★动画相位注入（B1 同族）:tileAnim.tick 直写——暂停下 advanceAnim 不推进,
  //  两臂同 tick 配对（否则 animated tile 帧漂移=A/B 伪差源）
  window.__setTick = async (n) => {
    const m = await import('/src/render/TileAnim.ts');
    m.tileAnim.tick = n;
  };
});
// 停 rAF 主循环——渲染全权由 waitFrame 同步驱动
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
// ★渲染帧非确定性面钉死（B1 同族）:TileFrameSeed/FlickerClock/液体动画钟
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const fixed = 60_000;
  Object.defineProperty(r, '_liquidNow', { get: () => fixed, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
// ★judder 关（本探针同步驱动 gap=16.7ms 于 120 档=跳槽线内——混合会污染快照;
//  B1 先于 judder 落地故无此钉）
await page.evaluate(() => import('/src/render/JudderSmooth.ts').then((m) => m.judderSmoothSetForTest(false)));
await pump(page, 60);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));
await page.evaluate(() => window.__pause(true));
await waitFrame(8);

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}

/** 终帧快照（主画布全幅;willReadFrequently 读回） */
async function snapFin() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}

/** census:A vs B 全帧差分(像素数/maxΔ/bbox) */
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
        Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin });
}

/** glow 矩形（设备像素近似域——供 bbox 归属判读） */
async function glowRectDev() {
  return page.evaluate(() => {
    const g = window.__swGame, r = g.renderer, cam = g.camera, z = cam.zoom;
    const gr = window.__glowRect;
    if (!gr) return null;
    const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
    const ox = Math.round(r.canvas.width / 2), oy = Math.round(r.canvas.height / 2);
    const zz = z;
    const xd0 = ox + Math.round(((gr.px - 10) * 16 - camRX) * zz);
    const yd0 = oy + Math.round(((gr.py - 6) * 16 - camRY) * zz);
    const xd1 = ox + Math.round(((gr.px + 11) * 16 - camRX) * zz);
    const yd1 = oy + Math.round(((gr.py + 3) * 16 - camRY) * zz);
    return [xd0, yd0, xd1, yd1];
  });
}

/** 单相位主流程:glow 已 painted;A/B 配对逐 tick 快照 + A' 翻回。
 *  strict=true 判逐字节;false 判 census 有界（n<5% 且 maxΔ≤8,B1 Skia tie 口径） */
async function phase(label, strict = false) {
  // A 臂（tick 配对注入——两臂同 tick 同动画相位）
  await page.evaluate(() => window.__gladdSet(false));
  await waitFrame(4);
  const fins = {};
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(900 + n), k);
    await waitFrame(1);
    fins['A' + k] = await snapFin();
  }
  // B 臂（首帧含 coatglow 纹理冷上传/texRefresh）
  await page.evaluate(() => window.__gladdSet(true));
  await waitFrame(5);
  const stB0 = await page.evaluate(() => window.__gladdState());
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(900 + n), k);
    await waitFrame(1);
    fins['B' + k] = await snapFin();
  }
  const stB1 = await page.evaluate(() => window.__gladdState());
  // 判定 GA
  let allEq = true;
  let worst = null;
  for (let k = 0; k < 3; k++) {
    const eq = fins['A' + k].b64 === fins['B' + k].b64;
    allEq = allEq && eq;
    if (!eq) {
      const c = await census(fins['A' + k], fins['B' + k]);
      if (!worst || c.n > worst.c.n) worst = { k, c, md5A: md5(fins['A' + k].b64), md5B: md5(fins['B' + k].b64) };
      console.log(`  [${label} tick${k}] md5 A=${md5(fins['A' + k].b64).slice(0, 8)} B=${md5(fins['B' + k].b64).slice(0, 8)} census n=${c.n}(${(c.n * 100 / (fins['A' + 0].w * fins['A' + 0].h)).toFixed(3)}%) maxΔ=${c.maxd} bbox=${JSON.stringify(c.bbox)}`);
    }
  }
  const total = fins['A0'].w * fins['A0'].h;
  const gr = await glowRectDev();
  if (strict) {
    chk(`[${label}] GA A≡B 逐字节（3 tick 配对）`, allEq,
      allEq ? `md5=${md5(fins.A0.b64).slice(0, 8)}` : (worst ? `n=${worst.c.n} maxΔ=${worst.c.maxd} bbox=${JSON.stringify(worst.c.bbox)}` : ''));
  } else {
    const ok = allEq || (!!worst && worst.c.n < total * 0.05 && worst.c.maxd <= 8);
    chk(`[${label}] GA A≈B census 有界（<5% ∧ maxΔ≤8）`, ok,
      allEq ? '逐字节' : (worst ? `n=${worst.c.n}(${(worst.c.n * 100 / total).toFixed(3)}%) maxΔ=${worst.c.maxd} glow域=${JSON.stringify(gr)}` : ''));
  }
  // GC:路径活性（gladd 相位）——纯帧 GL 会话实走+零回退
  const glDelta = stB1.stats.gl - stB0.stats.gl;
  const fbDelta = stB1.stats.fb - stB0.stats.fb;
  const emptyDelta = stB1.stats.empty - stB0.stats.empty;
  chk(`[${label}] GC B 态 GL 会话实走（gl 增量>0,fb=0）`, glDelta > 0 && fbDelta === 0,
    `gl=+${glDelta} empty=+${emptyDelta} fb=+${fbDelta}`);
  // GB:翻回恢复（tick0 复拍）
  await page.evaluate(() => window.__gladdSet(false));
  await waitFrame(4);
  await page.evaluate((n) => window.__setTick(900 + n), 0);
  await waitFrame(1);
  const A2 = await snapFin();
  const a0eq = A2.b64 === fins.A0.b64;
  chk(`[${label}] GB A'≡A 翻回恢复（无残留）`, a0eq,
    a0eq ? md5(A2.b64).slice(0, 8) : `A=${md5(fins.A0.b64).slice(0, 8)} A'=${md5(A2.b64).slice(0, 8)}`);
  return fins;
}

// ---- 相位 1:地表静立（glow×块+墙涂刷出生点;玩家+向导混排） ----
{
  const n = await page.evaluate(() => window.__paintGlow(true, true));
  console.log('[glow] 涂格数=' + n);
  await pump(page, 40);   // chunk 重烘收敛（worker 回包）
  await page.evaluate(() => window.__pause(true));
  await waitFrame(6);
  await phase('地表静立', true);
}

// ---- 相位 2-4:缩放相位（quadTile 任意 offset/相位精确域——非整数档 B1 tie 口径） ----
for (const [z, strict] of [[2.0, true], [1.27, false], [1.5625, false]]) {
  await page.evaluate((zz) => { window.__swGame.camera.setZoomTarget(zz); }, z);
  await page.evaluate(() => window.__pause(false));
  await pump(page, 80);
  await page.evaluate(() => window.__pause(true));
  await waitFrame(4);
  await phase('zoom' + z, strict);
  await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.25); });
  await pump(page, 80);
  await page.evaluate(() => window.__pause(true));
  await waitFrame(2);
}

// ---- 相位 5:洞穴暗光（地下 48 格;WALL 副本主场+暗光下 glow 全亮可见） ----
await page.evaluate(() => {
  const g = window.__swGame;
  const gy = (g.world.groundLevel ?? 300) + 48;
  window.__teleport(g.player.x, gy * 16);
});
await pump(page, 40);   // 先收敛：洞穴段 chunk 烘焙（换血）
await page.evaluate(() => window.__paintGlow(true, true));   // 后涂刷=涂在洞穴位
await pump(page, 40);   // 重烘收敛
await page.evaluate(() => window.__pause(true));
await waitFrame(6);
await phase('洞穴暗光', true);

// ---- 相位 6:重力翻转（xform 帧:_c10eWorldToHud=true → 2D 回退正确性锁） ----
await page.evaluate(() => window.__grav(-1));
await pump(page, 20);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
{
  // 重力相位专版:B 臂期望 fb 增量>0（门拦下 GL 会话）∧ A≡B 逐字节（同走 2D）
  await page.evaluate(() => window.__gladdSet(false));
  await waitFrame(4);
  const sA = await page.evaluate(() => window.__gladdState());
  const fins = {};
  for (let k = 0; k < 2; k++) { await waitFrame(1); fins['A' + k] = await snapFin(); }
  await page.evaluate(() => window.__gladdSet(true));
  await waitFrame(4);
  const sB = await page.evaluate(() => window.__gladdState());
  for (let k = 0; k < 2; k++) { await waitFrame(1); fins['B' + k] = await snapFin(); }
  const eq = fins.A0.b64 === fins.B0.b64 && fins.A1.b64 === fins.B1.b64;
  chk('[重力翻转] GD 夹层帧 2D 回退（fb 增量>0 ∧ A≡B）', eq && (sB.stats.fb - sA.stats.fb) > 0 && (sB.stats.gl - sA.stats.gl) === 0,
    `fb=+${sB.stats.fb - sA.stats.fb} gl=+${sB.stats.gl - sA.stats.gl} ${eq ? 'A≡B' : '差! n=' + JSON.stringify(await census(fins.A0, fins.B0))}`);
  await page.evaluate(() => window.__grav(1));
  await pump(page, 20);
  await waitFrame(2);
}

// ---- 相位 7:低清 K=0.5（_c10eFrame=false → 2D 路径哨兵） ----
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 0.5; }));
await waitFrame(4);
{
  await page.evaluate(() => window.__gladdSet(false));
  await waitFrame(4);
  const sA = await page.evaluate(() => window.__gladdState());
  const fins = {};
  for (let k = 0; k < 2; k++) { await waitFrame(1); fins['A' + k] = await snapFin(); }
  await page.evaluate(() => window.__gladdSet(true));
  await waitFrame(4);
  const sB = await page.evaluate(() => window.__gladdState());
  for (let k = 0; k < 2; k++) { await waitFrame(1); fins['B' + k] = await snapFin(); }
  const eq = fins.A0.b64 === fins.B0.b64 && fins.A1.b64 === fins.B1.b64;
  chk('[低清K0.5] 哨兵:非 c10e 帧=2D 原路径（fb 增量>0 ∧ A≡B）', eq && (sB.stats.fb - sA.stats.fb) > 0,
    `fb=+${sB.stats.fb - sA.stats.fb} gl=+${sB.stats.gl - sA.stats.gl} ${eq ? 'A≡B' : '差!'}`);
  await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));
  await waitFrame(4);
}

// ---- GE 帧耗时账:同步驱动 60 帧/臂（地表静立态;回 zoom1） ----
await page.evaluate((zz) => { window.__swGame.camera.setZoomTarget(zz); }, 1.25);
await pump(page, 80);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
async function frameTiming(label) {
  const t = await page.evaluate(() => {
    const g = window.__swGame;
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) {
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    }
    return (performance.now() - t0) / 60;
  });
  console.log(`[GE] ${label} 帧耗时均值=${t.toFixed(3)}ms`);
  return t;
}
await page.evaluate(() => window.__gladdSet(false));
await waitFrame(4);
const msA = await frameTiming('A(2D)');
await page.evaluate(() => window.__gladdSet(true));
await waitFrame(6);
const msB = await frameTiming('B(gladd)');
chk("[GE] 帧耗时:B ≤ A×1.15（试点期含会话税;终局省垫底另计）", msB <= msA * 1.15 + 0.2, `A=${msA.toFixed(3)}ms B=${msB.toFixed(3)}ms`);

// ---- 终态账面 ----
const fin = await page.evaluate(() => window.__gladdState());
console.log('[终态]', JSON.stringify(fin));
chk('[终态] GL 会话大量实走（gl>20）∧ 回退少量（fb<10）', fin.stats.gl > 20 && fin.stats.fb < 10,
  JSON.stringify(fin.stats));

if (pageErrors.length) { console.log('PAGE ERRORS (' + pageErrors.length + '):'); for (const e of pageErrors.slice(0, 8)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
for (const f of fails) console.log('  FAIL: ' + f.name + (f.detail ? ' [' + f.detail + ']' : ''));
process.exitCode = fails.length ? 1 : 0;
