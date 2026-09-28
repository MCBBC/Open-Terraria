// ★dustrb A/B 对拍探针 v2（2026-09-28 尘 premul 链性能刀）：
// 三段分离（防插桩互相污染——CountingMap 的 override 在旧臂 touch 路径被额外计次计时）：
//   P0 构成定谳：CountingMap 换装（只计数,计时作废）→ pair/命中/miss/逐出构成
//   P1 纯帧墙钟：零包装（只 frame 包一层）A/B×3 轮 → frameMs 中位
//   P2 包装归因：pair/draw 包装 inclusive（插桩偏差两臂同构,看比值）+ 微基准
//   P3 像素逐位：paused 冻结全 updating,恢复同一尘池快照 → A/B 交错步进 byte-eq
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
  const r = g.renderer;
  window.__pause = (v) => { g.paused = v; };
  window.__arm = (v) => r.constructor.dustrbSetForTest(v);
  g.lighting.clock.tick = () => {};
  window.__vnow = performance.now();
  window.__step = (n, spawn = true) => {
    for (let i = 0; i < n; i++) {
      if (spawn) window.__spawnBatch(1);
      window.__vnow += 16.6667;
      g.frame(window.__vnow);
    }
  };
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.waveQuality = 0; m.options.data.swayInWind = false; }));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));

// 负载发生器（海盗级:主体 a>0 premul 带 color=每尘本体+colorPass 2 次 pair;130 拖影;
//   A=0 快径;264/331 特档=拖影逐段独立 pair——trace 17k pair/帧口径来源）
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  window.__spawnBatch = (mult) => {
    const vd = r.vanillaDust;
    const px = g.player.x, py = g.player.y;
    const R = () => Math.random();
    const col = () => ({ r: 120 + R() * 135, g: 60 + R() * 135, b: 40 + R() * 135, a: 255 });
    let n = 0;
    const sp = (...a) => { if (vd.spawn(...a)) n++; };
    for (let i = 0; i < 14 * mult; i++) sp(px + (R() - 0.5) * 1400, py + (R() - 0.5) * 900, 8, 8, 27, (R() - 0.5) * 2, -1 - R(), 0, R() < 0.7 ? col() : null, 0.8);
    for (let i = 0; i < 6 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 130, 6 + R() * 4, (R() - 0.5) * 6, 0, R() < 0.5 ? col() : null, 1);
    for (let i = 0; i < 3 * mult; i++) sp(px + (R() - 0.5) * 1400, py + (R() - 0.5) * 900, 8, 8, 86, (R() - 0.5) * 4, (R() - 0.5) * 4, 0, null, 1);
    for (let i = 0; i < 2 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 6, (R() - 0.5) * 2, -1 - R(), 0, null, 1);
    for (let i = 0; i < 3 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 264, 4 + R() * 2, (R() - 0.5) * 4, 0, col(), 1);
    for (let i = 0; i < 2 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 331, 0, -1 - R(), 0, col(), 1);
    for (let i = 0; i < 2 * mult; i++) sp(px + (R() - 0.5) * 1200, py + (R() - 0.5) * 800, 8, 8, 31, (R() - 0.5) * 2, -1 - R(), 0, R() < 0.5 ? col() : null, 0.8);
    return n;
  };
  window.__vdAlive = () => {
    let alive = 0; const types = new Map();
    for (const d of r.vanillaDust.pool) { if (!d.active) continue; alive++; types.set(d.type, (types.get(d.type) || 0) + 1); }
    return { alive, types: [...types.entries()].sort((a, b) => b[1] - a[1]) };
  };
});

// ---- P0 构成定谳（paused+同一尘池快照重放:两臂同尘态,严格可比） ----
console.log('=== P0 构成定谳（paused,快照重放:两臂同 6400 尘态×120 帧） ===');
{
  const s0 = await page.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    window.__pause(true);
    // 造固定尘态（32/帧×200 帧的等价规模,一次铺满）
    window.__spawnBatch(200);
    window.__step(1, false);
    const snap = [];
    for (const d of r.vanillaDust.pool) {
      snap.push(d.active ? { on: true, x: d.x, y: d.y, vx: d.vx, vy: d.vy, type: d.type, scale: d.scale, alpha: d.alpha, fadeIn: d.fadeIn, noGravity: d.noGravity, noLight: d.noLight, color: d.color ? { ...d.color } : null, rotation: d.rotation, fx: d.fx, fy: d.fy } : { on: false });
    }
    window.__dustSnap = snap;
    window.__restoreDust = () => {
      const pool = r.vanillaDust.pool;
      for (let i = 0; i < pool.length; i++) {
        const sp = snap[i], d = pool[i];
        if (!sp.on) { d.active = false; continue; }
        Object.assign(d, sp, sp.color ? { color: { ...sp.color } } : { color: null });
      }
    };
    class CountingMap extends Map {
      get(k) { const v = super.get(k); window.__dS.gets++; return v; }
      set(k, v) { const had = super.has(k); if (!had) window.__dS.fresh++; window.__dS.sets++; return super.set(k, v); }
      delete(k) { const had = super.delete(k); if (had) window.__dS.dels++; return had; }
    }
    window.__CM = CountingMap;
    return { alive: window.__vdAlive() };
  });
  console.log('尘池快照 alive=', s0.alive.alive);
  const perArm = await page.evaluate(() => {
    const r = window.__swGame.renderer;
    const out = {};
    for (const flag of [false, true]) {
      window.__arm(flag);
      r.dustPmCache = new window.__CM();
      window.__dS = { gets: 0, sets: 0, fresh: 0, dels: 0 };
      for (let i = 0; i < 120; i++) { window.__restoreDust(); window.__step(1, false); }
      out[flag ? 'B' : 'A'] = { gets: window.__dS.gets / 120, fresh: window.__dS.fresh / 120, dels: window.__dS.dels / 120, cache: r.dustPmCache.size };
      r.dustPmCache = new Map();
    }
    window.__arm(false);
    return out;
  });
  console.log(`A(旧): pair调用/帧=${(perArm.A.gets / 2).toFixed(0)}(gets/2,touch 含 1 get) 真miss/帧≈${(perArm.A.fresh - perArm.A.dels + (perArm.A.gets / 2)).toFixed(0)}..(口径含重插) Map删/帧=${perArm.A.dels.toFixed(0)} cache=${perArm.A.cache}`);
  console.log(`B(新): pair调用/帧=${perArm.B.gets.toFixed(0)} 真miss/帧=${perArm.B.fresh.toFixed(1)} Map删/帧=${perArm.B.dels.toFixed(1)}(=仅逐出) cache=${perArm.B.cache}`);
  console.log(`→ 旧臂每帧 Map 结构操作=touch(delete+set)×命中 + 逐出;新臂=仅逐出。命中/帧≈${(perArm.A.gets / 2).toFixed(0)}`);
}

// ---- P1 纯帧墙钟（零插桩,只 frame 计时） ----
console.log('=== P1 纯帧墙钟 A/B×3 轮 ×240 帧（分块 evaluate） ===');
{
  const t0 = Date.now();
  await page.evaluate(() => window.__step(300));   // 再预热
  console.log(`预热完 ${Date.now() - t0}ms`);
  const arms = [];
  for (let round = 0; round < 3; round++) {
    for (const flag of [false, true]) {
      const s = await page.evaluate((v) => {
        window.__arm(v);
        window.__frameMs = 0; window.__frameN = 0;
        if (!window.__frameWrapped) {
          window.__frameWrapped = true;
          const g = window.__swGame;
          const origFrame = g.frame.bind(g);
          g.frame = (v) => { const t0 = performance.now(); try { origFrame(v); } finally { window.__frameMs += performance.now() - t0; window.__frameN++; } };
        }
        for (let i = 0; i < 240; i++) {
          window.__spawnBatch(1);
          window.__vnow += 16.6667;
          const t0 = performance.now();
          try { g.frame(window.__vnow); } finally { window.__frameMs += performance.now() - t0; window.__frameN++; }
        }
        return { flag: v, frameMs: window.__frameMs / Math.max(1, window.__frameN), alive: window.__vdAlive().alive };
      }, flag);
      arms.push(s);
      console.log(`R${round} arm=${flag ? 'B(dustrb)' : 'A(旧)'}: frameMs/帧=${s.frameMs.toFixed(2)} alive=${s.alive} (+${Date.now() - t0}ms)`);
    }
  }
  const A = arms.filter((s) => !s.flag).map((s) => s.frameMs).sort((a, b) => a - b);
  const B = arms.filter((s) => s.flag).map((s) => s.frameMs).sort((a, b) => a - b);
  const am = A[1], bm = B[1];
  console.log(`=== P1 汇总: frameMs/帧 中位 A(旧)=${am.toFixed(2)} B(dustrb)=${bm.toFixed(2)} 省=${(am - bm).toFixed(2)}ms (${(((am - bm) / am) * 100).toFixed(1)}%) 比=${(am / bm).toFixed(2)}x`);
}

// ---- P2 包装归因 + 微基准 ----
console.log('=== P2 pair/draw 包装归因（插桩偏差两臂同构,看比值） ===');
{
  const s = await page.evaluate(() => {
    const r = window.__swGame.renderer;
    const RP = r.constructor.prototype;
    if (!RP.__dw) {
      RP.__dw = true;
      const origPair = RP.dustPremulPair;
      RP.dustPremulPair = function (...a) {
        const t0 = performance.now();
        try { return origPair.apply(this, a); } finally { window.__pairMs += performance.now() - t0; window.__pairN++; }
      };
      const origDraw = RP.drawDustPremul;
      RP.drawDustPremul = function (...a) {
        const t0 = performance.now();
        try { return origDraw.apply(this, a); } finally { window.__drawMs += performance.now() - t0; window.__drawN++; }
      };
    }
    const out = {};
    for (const flag of [false, true]) {
      window.__arm(flag);
      window.__pairMs = 0; window.__pairN = 0; window.__drawMs = 0; window.__drawN = 0;
      window.__step(180);
      out[flag ? 'B' : 'A'] = {
        pairMs: window.__pairMs / 180, pairN: window.__pairN / 180,
        drawMs: window.__drawMs / 180, drawN: window.__drawN / 180,
      };
    }
    window.__arm(false);
    return out;
  });
  console.log(`A: pairIncl/帧=${s.A.pairMs.toFixed(3)}ms(${s.A.pairN.toFixed(0)}次) drawIncl/帧=${s.A.drawMs.toFixed(3)}ms(${s.A.drawN.toFixed(0)}次)`);
  console.log(`B: pairIncl/帧=${s.B.pairMs.toFixed(3)}ms(${s.B.pairN.toFixed(0)}次) drawIncl/帧=${s.B.drawMs.toFixed(3)}ms(${s.B.drawN.toFixed(0)}次)`);
  console.log(`比: pair=${(s.A.pairMs / s.B.pairMs).toFixed(2)}x draw=${(s.A.drawMs / s.B.drawMs).toFixed(2)}x`);
  const mb = await page.evaluate(() => {
    const N = 2048;
    const m = new Map();
    for (let i = 0; i < N; i++) m.set(i * 7919 % (N * 7), { add: null, erase: null, gen: 0 });
    const keys = [...m.keys()];
    let t0 = performance.now();
    for (let i = 0; i < 1e6; i++) { const k = keys[i & 2047]; const v = m.get(k); m.delete(k); m.set(k, v); }
    const oldNs = (performance.now() - t0);
    const vals = [...m.values()];
    t0 = performance.now();
    for (let i = 0; i < 1e6; i++) vals[i & 2047].gen = 1;
    const newNs = (performance.now() - t0);
    return { oldNs, newNs };
  });
  console.log(`微基准 @2048: touch旧(delete+set)=${mb.oldNs.toFixed(1)}ns/op touch新(gen写)=${mb.newNs.toFixed(1)}ns/op 比=${(mb.oldNs / Math.max(mb.newNs, 0.01)).toFixed(0)}x`);
}

// ---- P3 像素逐位（paused 全冻结 + 同一尘池快照重放） ----
console.log('=== P3 像素逐位配对（paused,尘池快照重放,A/B 交错） ===');
{
  await page.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    window.__pause(true);
    window.__step(2, false);   // 进入暂停渲染态
    const snap = [];
    for (const d of r.vanillaDust.pool) {
      snap.push(d.active ? { on: true, x: d.x, y: d.y, vx: d.vx, vy: d.vy, type: d.type, scale: d.scale, alpha: d.alpha, fadeIn: d.fadeIn, noGravity: d.noGravity, noLight: d.noLight, color: d.color ? { ...d.color } : null, rotation: d.rotation, fx: d.fx, fy: d.fy } : { on: false });
    }
    window.__dustSnap = snap;
    window.__restoreDust = () => {
      const pool = r.vanillaDust.pool;
      for (let i = 0; i < pool.length; i++) {
        const s = snap[i], d = pool[i];
        if (!s.on) { d.active = false; continue; }
        Object.assign(d, s, s.color ? { color: { ...s.color } } : { color: null });
      }
    };
  });
  const res = await page.evaluate(() => {
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
    // 先同臂自检（A vs A）:排除环境非确定性
    window.__arm(false); window.__restoreDust();
    window.__vnow += 16.6667; g.frame(window.__vnow);
    const P0 = snapCanvas();
    window.__restoreDust();
    window.__vnow += 16.6667; g.frame(window.__vnow);
    const P1 = snapCanvas();
    let selfDiff = 0;
    for (let i = 0; i < P0.length; i += 4) {
      if (Math.max(Math.abs(P0[i] - P1[i]), Math.abs(P0[i + 1] - P1[i + 1]), Math.abs(P0[i + 2] - P1[i + 2]), Math.abs(P0[i + 3] - P1[i + 3])) > 0) selfDiff++;
    }
    // A/B 交错 6 帧
    const FA = [], FB = [];
    for (let i = 0; i < 6; i++) {
      window.__restoreDust(); window.__arm(false);
      window.__vnow += 16.6667; g.frame(window.__vnow);
      FA.push(snapCanvas());
      window.__restoreDust(); window.__arm(true);
      window.__vnow += 16.6667; g.frame(window.__vnow);
      FB.push(snapCanvas());
    }
    let nd = 0, maxd = 0;
    for (let f = 0; f < FA.length; f++) {
      const P = FA[f], Q = FB[f];
      for (let i = 0; i < P.length; i += 4) {
        const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
        if (dd > 0) { nd++; if (dd > maxd) maxd = dd; }
      }
    }
    window.__arm(false);
    return { selfDiff, diffPx: nd, maxd, byteEq: nd === 0 };
  });
  console.log(`同臂自检 diffPx=${res.selfDiff}（非零=环境非确定,判读作废）`);
  console.log(`A/B 配对: ${res.byteEq && res.selfDiff === 0 ? 'BYTE-EQ ✓（6 帧×两臂逐位同）' : `DIFF px=${res.diffPx} maxΔ=${res.maxd} ${res.selfDiff > 0 ? '（含环境噪声,须换判读法）' : '✗ 真差异'}`}`);
  await page.evaluate(() => window.__pause(false));
}

if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 6)); }
await browser.close();
console.log('DONE');
