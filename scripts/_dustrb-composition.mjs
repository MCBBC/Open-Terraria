// ★dustrb A/B 对拍探针（2026-09-28 尘 premul 链性能刀）：
// 构成定谳（trace 锚 dustPmCacheTouch self 1198.5ms/2.91%、drawDustPremul self 529.4ms、
// dustPremulBake self 0.9ms=miss 稀有）+ 优化双臂 A/B：
//   A = ?dustrb 缺省关（旧 delete+set touch + 出口复位）
//   B = dustrbSetForTest(true)（gen 标记 + 二次机会逐出 + 出口复位省略）
// 判据：①同尘态像素逐位（bgl 与 2D 双模式）②pair/draw 包装 inclusive 前后 ③稳态命中/未中构成。
// 运行:SW_ORIGIN=http://localhost:5255 node tools/run-diag.mjs --timeout=560000 scripts/_dustrb-composition.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const MODE = process.env.SW_DUST_MODE || 'bgl';   // bgl | 2d
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
await bootstrap(page, ORIGIN + `/?${MODE === 'bgl' ? 'bgl=1&' : 'bgl=0&'}cloudcache=0`);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
console.log(`createGame ${!!gen?.ok} mode=${MODE}`);

await page.evaluate(() => {
  const g = window.__swGame;
  g.running = false;
  window.__pause = (v) => { g.paused = v; };
  window.__swGame.lighting.clock.tick = () => {};
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; m.options.data.swayInWind = false; }));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));

// ---- 计数面 + A/B 翻面 + 快照 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__arm = (v) => r.constructor.dustrbSetForTest(v);
  class CountingMap extends Map {
    get(k) { const v = super.get(k); window.__dustStats.gets++; if (v !== undefined) window.__dustStats.hits++; return v; }
    set(k, v) { if (!super.has(k)) window.__dustStats.freshSets++; window.__dustStats.sets++; return super.set(k, v); }
    delete(k) { const had = super.delete(k); if (had) window.__dustStats.dels++; return had; }
  }
  window.__dustStats = { gets: 0, hits: 0, sets: 0, freshSets: 0, dels: 0, pairMs: 0, drawMs: 0, drawN: 0, pairN: 0 };
  r.dustPmCache = new CountingMap();   // 无条件换装（原字段出生为 null）
  const RP = r.constructor.prototype;
  if (!RP.__dustrbWrapped) {
    RP.__dustrbWrapped = true;
    const origPair = RP.dustPremulPair;
    RP.dustPremulPair = function (...a) {
      const t0 = performance.now();
      try { return origPair.apply(this, a); } finally { window.__dustStats.pairMs += performance.now() - t0; window.__dustStats.pairN++; }
    };
    const origDraw = RP.drawDustPremul;
    RP.drawDustPremul = function (...a) {
      const t0 = performance.now();
      try { return origDraw.apply(this, a); } finally { window.__dustStats.drawMs += performance.now() - t0; window.__dustStats.drawN++; }
    };
  }
  window.__frameMs = 0; window.__frameN = 0;
  if (!g.__dustrbFrameWrapped) {
    g.__dustrbFrameWrapped = true;
    const origFrame = g.frame.bind(g);
    g.frame = (v) => { const t0 = performance.now(); try { origFrame(v); } finally { window.__frameMs += performance.now() - t0; window.__frameN++; } };
  }
  window.__resetStats = () => {
    Object.assign(window.__dustStats, { gets: 0, hits: 0, sets: 0, freshSets: 0, dels: 0, pairMs: 0, drawMs: 0, drawN: 0, pairN: 0 });
    window.__frameMs = 0; window.__frameN = 0;
  };
  // 海盗级负载发生器（主体 a>0 premul 族带 color=每尘 2 次 pair;130 拖影;A=0 快径;
  //   264/331 特档=拖影逐段独立 pair——trace 17k pair/帧口径的主要来源）
  window.__spawnBatch = (mult) => {
    const vd = r.vanillaDust;
    const px = g.player.x, py = g.player.y;
    const R = () => Math.random();
    const col = () => ({ r: 120 + R() * 135, g: 60 + R() * 135, b: 40 + R() * 135, a: 255 });
    const ok = { n: 0 };
    const sp = (...a) => { if (vd.spawn(...a)) ok.n++; };
    for (let i = 0; i < 14 * mult; i++) sp(px + (R() - 0.5) * 1400, py + (R() - 0.5) * 900, 8, 8, 27, (R() - 0.5) * 2, -1 - R(), 0, R() < 0.7 ? col() : null, 0.8);
    for (let i = 0; i < 6 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 130, 6 + R() * 4, (R() - 0.5) * 6, 0, R() < 0.5 ? col() : null, 1);
    for (let i = 0; i < 3 * mult; i++) sp(px + (R() - 0.5) * 1400, py + (R() - 0.5) * 900, 8, 8, 86, (R() - 0.5) * 4, (R() - 0.5) * 4, 0, null, 1);
    for (let i = 0; i < 2 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 6, (R() - 0.5) * 2, -1 - R(), 0, null, 1);
    for (let i = 0; i < 3 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 264, 4 + R() * 2, (R() - 0.5) * 4, 0, col(), 1);
    for (let i = 0; i < 2 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 331, 0, -1 - R(), 0, col(), 1);
    for (let i = 0; i < 2 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 31, (R() - 0.5) * 2, -1 - R(), 0, R() < 0.5 ? col() : null, 0.8);
    return ok.n;
  };
  window.__vdAlive = () => {
    const vd = r.vanillaDust;
    let alive = 0; const types = new Map();
    for (const d of vd.pool) { if (!d.active) continue; alive++; types.set(d.type, (types.get(d.type) || 0) + 1); }
    return { alive, types: [...types.entries()].sort((a, b) => b[1] - a[1]) };
  };
  window.__step = (n) => {
    for (let i = 0; i < n; i++) {
      window.__spawnBatch(1);
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    }
  };
});
await page.evaluate(() => window.__step(400));   // 预热到稳态
{
  const st = await page.evaluate(() => ({ ...window.__vdAlive(), cacheSize: window.__swGame.renderer.dustPmCache.size }));
  console.log('稳态 alive=', st.alive, 'cacheSize=', st.cacheSize, 'types=', JSON.stringify(st.types));
}

// ---- Phase A/B 交替 3 轮 × 240 帧（各臂独立重置统计） ----
const arms = [];
for (let round = 0; round < 3; round++) {
  for (const flag of [false, true]) {
    const s = await page.evaluate((v) => {
      window.__arm(v);
      window.__resetStats();
      window.__step(240);
      const d = window.__dustStats;
      const F = Math.max(1, window.__frameN);
      return {
        flag: v, F,
        pairN: d.pairN / F, hits: d.hits / F, miss: d.freshSets / F, dels: d.dels / F,
        drawN: d.drawN / F, pairMs: d.pairMs / F, drawMs: d.drawMs / F,
        frameMs: window.__frameMs / F, cacheSize: window.__swGame.renderer.dustPmCache.size,
        alive: window.__vdAlive().alive,
      };
    }, flag);
    arms.push(s);
    console.log(`R${round} arm=${flag ? 'B(dustrb)' : 'A(旧)'}: pair/帧=${s.pairN.toFixed(0)} 命中/帧=${s.hits.toFixed(0)} miss/帧=${s.miss.toFixed(2)} del/帧=${s.dels.toFixed(1)} draw/帧=${s.drawN.toFixed(0)} | pairMs/帧=${s.pairMs.toFixed(3)} drawMs/帧=${s.drawMs.toFixed(3)} frameMs/帧=${s.frameMs.toFixed(2)} cache=${s.cacheSize} alive=${s.alive}`);
  }
}

// ---- 汇总 ----
{
  const A = arms.filter((s) => !s.flag), B = arms.filter((s) => s.flag);
  const med = (arr, f) => arr.map((s) => s[f]).sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  console.log('=== 汇总（3 轮中位） ===');
  console.log(`pairMs/帧: A=${med(A, 'pairMs').toFixed(3)} B=${med(B, 'pairMs').toFixed(3)}  比=${(med(A, 'pairMs') / Math.max(med(B, 'pairMs'), 1e-9)).toFixed(2)}x`);
  console.log(`drawMs/帧: A=${med(A, 'drawMs').toFixed(3)} B=${med(B, 'drawMs').toFixed(3)}  比=${(med(A, 'drawMs') / Math.max(med(B, 'drawMs'), 1e-9)).toFixed(2)}x`);
  console.log(`frameMs/帧: A=${med(A, 'frameMs').toFixed(2)} B=${med(B, 'frameMs').toFixed(2)}  省=${(med(A, 'frameMs') - med(B, 'frameMs')).toFixed(2)}ms`);
  console.log(`del/帧(重插次数): A=${med(A, 'dels').toFixed(0)} B=${med(B, 'dels').toFixed(0)}`);
}

// ---- 像素逐位配对（同尘态序列 A→B 逐帧 byte-eq,交错臂步进） ----
console.log('=== 像素逐位配对（同尘态 A/B 交错步进） ===');
await page.evaluate(() => {
  // 快照当前尘池（固定尘态序列,两臂各重放同一序列渲染）
  const g = window.__swGame;
  const snap = [];
  for (const d of g.renderer.vanillaDust.pool) {
    snap.push(d.active ? { on: true, x: d.x, y: d.y, vx: d.vx, vy: d.vy, type: d.type, scale: d.scale, alpha: d.alpha, fadeIn: d.fadeIn, noGravity: d.noGravity, noLight: d.noLight, color: d.color ? { ...d.color } : null, rotation: d.rotation, fx: d.fx, fy: d.fy } : { on: false });
  }
  window.__dustSnap = snap;
  window.__restoreDust = () => {
    const vd = g.renderer.vanillaDust;
    const pool = vd.pool;
    for (let i = 0; i < pool.length; i++) {
      const s = snap[i], d = pool[i];
      if (!s.on) { d.active = false; continue; }
      Object.assign(d, s, s.color ? { color: { ...s.color } } : { color: null });
    }
  };
});
const pairCheck = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const snapCanvas = () => {
    const c = r.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    return lx.getImageData(0, 0, lc.width, lc.height).data;
  };
  const FA = [], FB = [];
  for (let i = 0; i < 6; i++) {
    window.__restoreDust();
    r.constructor.dustrbSetForTest(false);
    window.__vnow += 16.6667;
    g.frame(window.__vnow);
    FA.push(snapCanvas());
    window.__restoreDust();
    r.constructor.dustrbSetForTest(true);
    window.__vnow += 16.6667;
    g.frame(window.__vnow);
    FB.push(snapCanvas());
  }
  let maxd = 0, nd = 0;
  for (let f = 0; f < FA.length; f++) {
    const P = FA[f], Q = FB[f];
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) { nd++; if (dd > maxd) maxd = dd; }
    }
  }
  r.constructor.dustrbSetForTest(false);
  return { frames: FA.length, diffPx: nd, maxd, byteEq: nd === 0 };
});
console.log(`配对结果: ${pairCheck.byteEq ? 'BYTE-EQ ✓（6 帧×A/B 两臂逐位同）' : `DIFF px=${pairCheck.diffPx} maxΔ=${pairCheck.maxd} ✗`}`);

if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 6)); }
await browser.close();
console.log('DONE');
