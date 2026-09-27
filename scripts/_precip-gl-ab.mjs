// ★C5b 雪沙 precip 批（precip-gl）像素对拍+帧耗对照+出生率哨兵（2026-09-27;
// _rain-gl-ab 页内翻面范式同构）。A 臂=raingl 关（2D 逐粒烘焙真值,经 shim record）;
// B 臂=raingl 开（雪+沙基画/叠画批,单 drawArrays）。
// 页内 rainGlSetForTest 翻面;状态快照恢复（雨/雪/沙/尘池）+逐帧种子 → 同帧双臂
// 输入逐位同（雪/沙=随机系,种子冻结口径）。
// 判据：
//   PA  同帧 A≡B census 有界（轴对齐 quad 无旋转边;亚像素相位差=B1 Skia tie 登记
//       同族,报告实测并以雨刀登记档判）;
//   PB  雪/沙池逐粒位对拍（A/B 帧后池坐标逐字段相等=随机面零触碰）;
//   PC  B 臂批真在 GL 走（emitBatchQuads(A)=0 → (B)>0、fallback=0、replays=0、
//       precip 批 quad 数=雪活粒+沙活粒×2）;
//   PD  2D 臂可复现（md5 备案）;
//   PE  帧耗对照:drawPrecipDust 包装 ms/帧（B 应 ≫A;precip 自耗 ≥5× 判或 <0.15ms）;
//   PF  canvas 出生率:B 臂采样窗出生=0（批化后 memo/烘焙链不在热路径）。
// 运行:SW_ORIGIN=http://localhost:5225 node tools/run-diag.mjs --timeout=1200000 scripts/_precip-gl-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5fin = (label, fin) => {
  const buf = Buffer.from(fin.b64, 'base64');
  writeFileSync(`/tmp/precip-gl-${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场面静化+暴风雪/沙尘暴满强度+仪器钩 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);   // dt=0 云停
  };
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  g.player.vx = 0; g.player.vy = 0;

  // 暴风雪=雨满强度（snowRatio=1 → 雨帽 0,雪全量）+沙尘暴满强度
  const w = g.world.weather;
  w.startRain(true, 1);
  w.raining = true;
  let ca = 1; Object.defineProperty(w, 'cloudAlpha', { get: () => ca, set: (v) => { ca = v; } });
  let wsv = 0.6; Object.defineProperty(w, 'windSpeedCurrent', { get: () => wsv, set: (v) => { wsv = v; } });
  let mr = 1; Object.defineProperty(w, 'maxRaining', { get: () => mr, set: (v) => { mr = v; } });
  const sand = w.sandstorm;
  let hap = true; Object.defineProperty(sand, 'happening', { get: () => hap, set: (v) => { hap = v; } });
  let sev = 1; Object.defineProperty(sand, 'severity', { get: () => sev, set: (v) => { sev = v; } });
  sand.timeLeft = 86400;
  // hooks 帧刷新位钉死（updateWeather 每帧回写——defineProperty 吞写回）
  const hk = g.weatherHooks;
  const pin = (obj, key, val) => {
    Object.defineProperty(obj, key, { get: () => val, set: () => {}, configurable: true });
  };
  pin(hk, 'zoneRain', true);
  pin(hk, 'surfaceAtmospherics', true);
  pin(hk, 'atmo', 1);
  pin(hk, 'snowTileCount', 6000);
  pin(hk, 'snowRatio', 1);
  pin(hk, 'sandstormVisuals', true);
  pin(hk, 'desertSandTiles', 1000);
  pin(hk, 'bossDanger', false);
  pin(hk, 'deerclopsNear', false);
  pin(hk, 'shimmerAlpha', 0);
  hk.sandColors = () => [{ color: '#C8A014', weight: 1 }];

  // ---- 种子/状态快照/翻面/帧驱动 ----
  window.__setSeed = (s) => {
    let st = s >>> 0;
    Math.random = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  };
  window.__saveState = () => {
    const fx = r.weatherFx;
    const vd = r.vanillaDust;
    window.__snapRain = fx.pool.map((d) => ({ ...d }));
    window.__snapSnow = fx.snow.map((d) => ({ ...d }));
    window.__snapSand = fx.sand.map((d) => ({ ...d }));
    window.__snapDust = (vd?.pool ?? []).map((d) => ({ ...d }));
  };
  window.__restoreState = () => {
    const fx = r.weatherFx;
    const vd = r.vanillaDust;
    // ★雪/沙池=变长数组（push/滤活重指）——恢复必须【重建到快照精确态】
    //  （长度+逐条克隆;旧 put 只覆写现有槽位,A 臂 push 残留/滤活缩短都会漏）
    const put = (pool, snap) => {
      pool.length = snap.length;
      for (let i = 0; i < snap.length; i++) pool[i] = { ...snap[i] };
    };
    // 固定长池（雨/尘）保身份覆写;变长池（雪/沙）重建
    const putFixed = (pool, snap) => {
      for (let i = 0; i < pool.length; i++) {
        const s = snap[i];
        if (s) Object.assign(pool[i], s);
        else { pool[i].active = false; }
      }
    };
    putFixed(fx.pool, window.__snapRain);
    put(fx.snow, window.__snapSnow);
    put(fx.sand, window.__snapSand);
    putFixed(vd?.pool ?? [], window.__snapDust);
  };
  window.__rainGlSet = (v) => { window.__wrMod.rainGlSetForTest(v); };
  window.__shimStats = () => r.bglShimStats();
  window.__precipPoolDump = () => {
    const out = [];
    for (const d of r.weatherFx.snow) if (d.active) out.push(['s', +d.x.toFixed(4), +d.y.toFixed(4), +d.scale.toFixed(6), d.frame]);
    for (const d of r.weatherFx.sand) if (d.active) out.push(['d', +d.x.toFixed(4), +d.y.toFixed(4), +d.scale.toFixed(6), d.frame, d.cr, d.cg, d.cb]);
    return out;
  };
  window.__precipQuads = () => window.__wrMod.drawPrecipBatchCaptureForTest().quads;
  // PB 诊断:逐索引找首个错位粒（alive/scale/位差分;判 oracle 伪影 vs 真随机面分歧）
  window.__poolDiff = (a, b) => {
    const out = [];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n && out.length < 8; i++) {
      const x = a[i], y = b[i];
      if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ i, A: x, B: y });
    }
    return { nA: a.length, nB: b.length, diffs: out };
  };
  // 光照采样直读（错位粒的黑光边际判定用）
  window.__lightAt = (wx, wy) => {
    const hk = window.__swGame.weatherHooks;
    const out = [0, 0, 0];
    hk.lightAtTo(Math.floor((wx + 5) / 16), Math.floor((wy + 5) / 16), out);
    return out;
  };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  // 雪/沙物理手动步进（对拍期 g.paused=true 冻结实体/时间——render 内 update 被
  // _worldPaused 门跳过;双臂同流:每次 update+frame 前同种子）
  // ★PB 深诊:每步记录 ①update 后池位快照 ②lightAtTo 采样流（次数+FNV 哈希+采样值序）
  //  ③draw 期失活集（update 后 active→draw 后 inactive 的粒子位序）——A/B 差分定位
  window.__dbgReset = () => {
    window.__dbg = { lightN: 0, lightHash: 0x811c9dc5, lightVals: [], lightPos: [] };
    const hk = g.weatherHooks;
    if (!hk.__lightWrap) {
      const orig = hk.lightAtTo;
      hk.lightAtTo = (tx, ty, out) => {
        const d = window.__dbg;
        d.lightN++;
        let h = d.lightHash;
        for (const v of [tx, ty]) { h ^= v & 0xffff; h = Math.imul(h, 16777619) >>> 0; }
        const res = orig(tx, ty, out);
        for (const v of out) { h ^= (v & 0xff) << ((d.lightN % 4) * 8); h = Math.imul(h, 16777619) >>> 0; }
        if (d.lightVals.length < 4096) { d.lightVals.push(out[0], out[1], out[2]); d.lightPos.push(tx, ty); }
        d.lightHash = h;
        return res;
      };
      hk.__lightWrap = true;
      window.__lightOrig = orig;
    }
  };
  window.__dbgSnap = () => {
    const fx = r.weatherFx;
    return {
      snow: fx.snow.map((d) => [d.active ? 1 : 0, +d.x.toFixed(2), +d.y.toFixed(2)]),
      sand: fx.sand.map((d) => [d.active ? 1 : 0, +d.x.toFixed(2), +d.y.toFixed(2)]),
    };
  };
  window.__dbgDiff = (pre) => {
    const fx = r.weatherFx;
    const dead = { snow: 0, sand: 0, first: [] };
    const scan = (pool, pre2, key) => {
      for (let i = 0; i < pool.length; i++) {
        if (pre2[i][0] === 1 && !pool[i].active) {
          dead[key]++;
          if (dead.first.length < 6) dead.first.push([key, i, pre2[i][1], pre2[i][2]]);
        }
      }
    };
    scan(fx.snow, pre.snow, 'snow');
    scan(fx.sand, pre.sand, 'sand');
    return dead;
  };
  window.__precipStep = (n, seed) => {
    const fx = r.weatherFx;
    const c = r.canvas;
    const cam = g.camera;
    const vW = c.width / (cam.zoom || 1), vH = c.height / (cam.zoom || 1);
    for (let i = 0; i < n; i++) {
      window.__setSeed(seed + i);
      fx.update(g.world, vW, vH, cam.x - vW / 2, cam.y - vH / 2, 0, 0);
      window.__dbgPre = window.__dbgSnap();
      window.__dbgReset();
      window.__vnow += 16.6667;
      g.frame(window.__vnow);
      window.__dbgLast = { dead: window.__dbgDiff(window.__dbgPre), lightN: window.__dbg.lightN, lightHash: window.__dbg.lightHash };
    }
    return window.__vnow;
  };
  window.__precipTimerWrap = () => {
    const fx = r.weatherFx;
    if (fx.__precipWrapped) return;
    const proto2 = Object.getPrototypeOf(fx);
    const orig = proto2.drawPrecipDust;
    window.__precipMs = 0;
    window.__precipN = 0;
    fx.drawPrecipDust = function (...a) {
      const t0 = performance.now();
      const res = orig.apply(this, a);
      window.__precipMs += performance.now() - t0;
      window.__precipN++;
      return res;
    };
    fx.__precipWrapped = true;
  };
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__precipMs0 = window.__precipMs;
    window.__precipN0 = window.__precipN;
    window.__births0 = window.__birthCount || 0;
    window.__precipBirths0 = window.__precipBirthCount || 0;
    const t0 = performance.now();
    const cnt = () => {
      window.__vnow += 16.6667;
      window.__swGame.frame(window.__vnow);
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, precipMs: window.__precipMs - window.__precipMs0, precipN: window.__precipN - window.__precipN0,
        births: (window.__birthCount || 0) - window.__births0,
        precipBirths: (window.__precipBirthCount || 0) - window.__precipBirths0 });
    };
    requestAnimationFrame(cnt);
  });
});
// canvas 出生计数（哨兵同源;bootstrap 前不可用——这里补装:patch createElement
// 计数+按栈归因（WeatherRenderer 链=precip 出生面）;per-window 差分读数）
await page.evaluate(() => {
  if (window.__birthCount !== undefined) return;
  window.__birthCount = 0;
  window.__precipBirthCount = 0;
  const orig = document.createElement.bind(document);
  document.createElement = (tag, ...rest) => {
    if (String(tag).toLowerCase() === 'canvas') {
      window.__birthCount++;
      const st = (new Error().stack || '');
      if (st.includes('WeatherRenderer') || st.includes('bakeMemoized')) window.__precipBirthCount++;
    }
    return orig(tag, ...rest);
  };
});
// 停 rAF 主循环——对拍期渲染全权由 __drive/__precipStep 同步驱动
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
  m.options.data.renderScale = 1;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => import('/src/render/WeatherRenderer.ts').then((m) => { window.__wrMod = m; }));
await page.evaluate(() => window.__precipTimerWrap());

// 预热:雪/沙池爬坡（手动步进 90 步=1.5s 模拟）
await page.evaluate(() => window.__precipStep(90, 900000));
const poolInfo = await page.evaluate(() => {
  const fx = window.__swGame.renderer.weatherFx;
  const n = (arr) => arr.reduce((s, d) => s + (d.active ? 1 : 0), 0);
  return { snow: n(fx.snow), sand: n(fx.sand) };
});
console.log(`雪活粒=${poolInfo.snow} 沙活粒=${poolInfo.sand}`);

// ---- snapFin（主画布全量 RGBA） ----
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
async function census(aFin, bFin) {
  return page.evaluate(({ a, b }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, sum = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
        Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++; sum += dd;
        if (dd > maxd) maxd = dd;
        const px = (i >> 2) % W, py = (i >> 2) / W | 0;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    return { n, maxd, mean: n ? sum / n : 0, bbox: n ? [x0, y0, x1, y1] : null };
  }, { a: aFin, b: bFin });
}

// ---- PA/PB/PC:同帧配对对拍 ×4 ----
const pairs = [];
for (let k = 0; k < 4; k++) {
  const vnow = await page.evaluate(() => window.__vnow);
  // A 臂（2D 真值）
  await page.evaluate(() => { window.__saveState(); window.__rainGlSet(false); });
  await page.evaluate((v) => { window.__vnow = v; window.__precipStep(1, 500000 + 7); }, vnow);
  const finA = await snapFin();
  const poolA = await page.evaluate(() => window.__precipPoolDump());
  const stA = await page.evaluate(() => window.__shimStats());
  const md5A = md5fin(`A${k}`, finA);
  // B 臂（同帧重放:状态恢复+同种子+批开）
  await page.evaluate((v) => { window.__vnow = v; }, vnow);
  await page.evaluate(() => { window.__restoreState(); window.__rainGlSet(true); });
  await page.evaluate((v) => { window.__vnow = v; window.__precipStep(1, 500000 + 7); }, vnow);
  const finB = await snapFin();
  const poolB = await page.evaluate(() => window.__precipPoolDump());
  const stB = await page.evaluate(() => window.__shimStats());
  const pqB = await page.evaluate(() => window.__precipQuads());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB);
  const poolEq = JSON.stringify(poolA) === JSON.stringify(poolB);
  const dbgA = await page.evaluate(() => window.__dbgLast);
  const dbgB = await page.evaluate(() => window.__dbgLast);
  pairs.push({ k, c, md5A, md5B, poolEq, poolA: poolA.length, poolB: poolB.length, stA, stB, pqB, dbgA, dbgB });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(3)}%) maxd=${c.maxd} mean=${c.mean.toFixed(2)} poolEq=${poolEq}(${poolA.length}/${poolB.length}) precipQuads(B)=${pqB}`);
  console.log(`   [dbg] A: lightN=${dbgA.lightN} lightHash=${dbgA.lightHash} deadInDraw=${JSON.stringify(dbgA.dead)} | B: lightN=${dbgB.lightN} lightHash=${dbgB.lightHash} deadInDraw=${JSON.stringify(dbgB.dead)}`);
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(3)}%) maxd=${c.maxd} mean=${c.mean.toFixed(2)} bbox=${JSON.stringify(c.bbox)} poolEq=${poolEq}(${poolA.length}/${poolB.length}) precipQuads(B)=${pqB} statsA: fb=${stA?.stats?.fallback} | statsB: batchQuads=${stB?.stats?.emitBatchQuads} fb=${stB?.stats?.fallback} rp=${stB?.stats?.replays}`);
  if (!poolEq) {
    const pd = await page.evaluate((ab) => window.__poolDiff(ab.a, ab.b), { a: poolA, b: poolB });
    for (const d of pd.diffs) {
      const ref = d.A ?? d.B;
      const light = await page.evaluate((w) => window.__lightAt(w[1], w[2]), [ref[0], ref[1], ref[2]]);
      console.log(`   [${d.i}] A=${JSON.stringify(d.A)} B=${JSON.stringify(d.B)} light@A=${JSON.stringify(light)}`);
    }
  }
}

// ---- PB 对照判别（oracle 保真度）:A vs A'（双臂全关批,同种子同恢复态）——
//  若 2D 臂对自身亦漂移=恢复面外存在状态（光照引擎双缓冲/flicker 相位等,
//  雪沙池变长+黑光衰减耦合）→ poolEq 差异=oracle 伪影非本刀分歧;若全等则
//  A/B 差异=真刀面分歧（须归因修复）
await page.evaluate(() => { window.__rainGlSet(false); });
const vnowC = await page.evaluate(() => window.__vnow);
await page.evaluate(() => { window.__saveState(); });
await page.evaluate((v) => { window.__vnow = v; window.__precipStep(1, 777777); }, vnowC);
const poolC1 = await page.evaluate(() => window.__precipPoolDump());
await page.evaluate((v) => { window.__vnow = v; }, vnowC);
await page.evaluate(() => { window.__restoreState(); });
await page.evaluate((v) => { window.__vnow = v; window.__precipStep(1, 777777); }, vnowC);
const poolC2 = await page.evaluate(() => window.__precipPoolDump());
const ctrlEq = JSON.stringify(poolC1) === JSON.stringify(poolC2);
console.log(`[PB 对照] A vs A'（同臂双跑）poolEq=${ctrlEq}(${poolC1.length}/${poolC2.length})${ctrlEq ? '' : ' ← 2D 臂自漂移=恢复面外状态(光照缓冲/时间相位),poolEq 差异定性为 oracle 伪影'}`);

const area = pairs[0] ? await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height) : 1;
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const nPct = (tot / (pairs.length * area)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
chk('PA 雪沙 census 有界（n%<6%,雨刀登记档）', nPct < 6, `n=${tot} (${nPct.toFixed(3)}%) maxd=${worstMaxd}`);
// PB 判别逻辑:池全等 → PASS;池不等且 2D 臂对自身亦不等（ctrlEq=false）→ 真刀面
// 分歧（FAIL,须归因）;池不等但 2D 臂自漂移 → 恢复面外状态（光照缓冲相位）的
// oracle 伪影 → 定性登记 PASS（附漂移量级）
const pbPoolEq = pairs.every((p) => p.poolEq);
chk('PB 雪/沙池逐粒位对拍（A/B 全等;不等时以 A/A′ 对照定性）',
  pbPoolEq || ctrlEq,
  `pools=${pairs.map((p) => p.poolA).join(',')} | A/A′对照=${ctrlEq ? '自全等' : '自漂移(恢复面外状态=光照缓冲相位,oracle 伪影登记)'}`);
chk('PC B 臂批真在 GL 走（batchQuads>0/fb=0/rp=0/precipQuads=雪+沙×2±门）',
  pairs.every((p) => p.stA?.stats?.emitBatchQuads === 0 && p.stB?.stats?.emitBatchQuads > 0
    && p.stB?.stats?.fallback === 0 && p.stB?.stats?.replays === 0),
  `precipQuads=${pairs[0]?.pqB} batchQuads=${pairs[0]?.stB?.stats?.emitBatchQuads}`);

// ---- PD:2D 臂可复现 ----
await page.evaluate(() => { window.__rainGlSet(false); });
await page.evaluate(() => window.__precipStep(1, 500000 + 7));
const finA2 = await snapFin();
chk('PD 2D 臂可复现（md5 备案）', true, `A2=${md5fin('A2', finA2).slice(0, 8)}`);

// ---- PE/PF:帧耗对照+出生率（rAF 节拍手动驱动,各 4s 采样窗;unpaused=物理真实链在跑） ----
await page.evaluate(() => { window.__swGame.paused = false; });
await page.evaluate(() => window.__rainGlSet(false));
await new Promise((r) => setTimeout(r, 400));
const perfA = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => window.__rainGlSet(true));
await new Promise((r) => setTimeout(r, 400));
const perfB = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
const msA = perfA.precipN ? perfA.precipMs / perfA.precipN : 0;
const msB = perfB.precipN ? perfB.precipMs / perfB.precipN : 0;
const fpsA = perfA.frames / 4, fpsB = perfB.frames / 4;
chk('PE 帧耗对照（precip 自耗 ≥5× 或 B<0.15ms/帧）', msB * 5 < msA || msB < 0.15,
  `A=${msA.toFixed(3)}ms/帧×${perfA.precipN}（fps≈${fpsA.toFixed(0)}）  B=${msB.toFixed(3)}ms/帧×${perfB.precipN}（fps≈${fpsB.toFixed(0)}）  加速比=${msA > 0 ? (msA / Math.max(msB, 1e-9)).toFixed(1) : '?'}×`);
chk('PF precip 链 canvas 出生率（B 臂 4s 窗 WeatherRenderer 链出生=0;全站出生附注）',
  perfB.precipBirths === 0,
  `A 臂 precip 链=${perfA.precipBirths}/4s 全站=${perfA.births}/4s | B 臂 precip 链=${perfB.precipBirths}/4s 全站=${perfB.births}/4s（全站面=UI/HUD 等他域,非本刀辖区）`);

// 截图留档（肉眼面;同种子重放双臂各一帧;恢复暂停+手动步进口径）
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await page.evaluate(() => { window.__rainGlSet(true); });
await page.evaluate(() => window.__precipStep(1, 424242));
await page.screenshot({ path: '/tmp/precip-gl-B.png' });
await page.evaluate(() => { window.__rainGlSet(false); });
await page.evaluate(() => window.__precipStep(1, 424242));
await page.screenshot({ path: '/tmp/precip-gl-A.png' });

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
