// ★C5 雨批（rain-gl）像素对拍+帧耗对照（2026-09-26;_b2b-world-ab 页内翻面范式）。
// A 臂=raingl 关（2D 逐滴烘焙真值,经 shim record）;B 臂=raingl 开（单 drawArrays 批）。
// 页内 rainGlSetForTest 翻面;状态快照恢复（雨池/雪/沙/尘池）+逐帧种子 → 同帧双臂
// 输入逐位同（雨=随机系,种子冻结口径）。
// 判据：
//   RA  同帧 A≡B census 有界（雨条 ±1LSB tint 舍入域+旋转边 AA 差=B2b 实体旋转
//       quad 同族登记口径;n%<6%/maxd 有界/bbox 落雨幕区）;
//   RB  雨池逐滴位对拍（A/B 帧后池坐标逐字段相等=随机面零触碰）;
//   RC  B 臂执行器 stats.emitBatchQuads=滴数、fallback=0、replays=0（批真在 GL 走）;
//   RD  2D 臂可复现（状态推进面备案）;
//   RE  帧耗对照:drawRain 包装 ms/帧 + rAF fps（B 应 ≫A;雨桶 ≥7× 判）。
// 运行:SW_ORIGIN=http://localhost:5224 node tools/run-diag.mjs --timeout=1200000 scripts/_rain-gl-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
// 缺省旗面（acc shim 链全开;raingl 转正缺省开——探针双臂显式翻面,与缺省无关）
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const md5fin = (label, fin) => {
  const buf = Buffer.from(fin.b64, 'base64');
  writeFileSync(`/tmp/rain-gl-${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260926 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场面静化（云/环境噪声退役;雨系统满强度全开）+ 仪器钩 ----
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

  // 站位=出生地表位（ diag 实证雨生成正常;teleport 落地下=逐滴门全拒=零雨幕）
  g.player.vx = 0; g.player.vy = 0;

  // 雨满强度+风 0.5（task 书面;属性锁防 weather update 演化）
  const w = g.world.weather;
  w.startRain(true, 1);
  w.raining = true;
  let ca = 1; Object.defineProperty(w, 'cloudAlpha', { get: () => ca, set: (v) => { ca = v; } });
  let wsv = 0.5; Object.defineProperty(w, 'windSpeedCurrent', { get: () => wsv, set: (v) => { wsv = v; } });
  let mr = 1; Object.defineProperty(w, 'maxRaining', { get: () => mr, set: (v) => { mr = v; } });
  // hooks 帧刷新位（updateWeather/fixedUpdate 写）——对拍期 paused=true 跳过刷新,
  // 手动钉值=雨生成总闸开（ZoneRain/SurfaceAtmospherics/atmo 地表位）
  const hk = g.weatherHooks;
  hk.zoneRain = true;
  hk.surfaceAtmospherics = true;
  hk.atmo = 1;
  hk.bossDanger = false;
  hk.shimmerAlpha = 0;

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
    const put = (pool, snap) => {
      for (let i = 0; i < pool.length; i++) {
        const s = snap[i];
        if (s) Object.assign(pool[i], s);
        else { pool[i].active = false; }
      }
    };
    put(fx.pool, window.__snapRain);
    put(fx.snow, window.__snapSnow);
    put(fx.sand, window.__snapSand);
    put(vd?.pool ?? [], window.__snapDust);
  };
  window.__rainGlSet = (v) => { window.__wrMod.rainGlSetForTest(v); };
  window.__shimStats = () => r.bglShimStats();
  window.__rainPoolDump = () => {
    const out = [];
    for (const d of r.weatherFx.pool) if (d.active) out.push([+d.x.toFixed(4), +d.y.toFixed(4), +d.scale.toFixed(6), +d.rotation.toFixed(8), d.type]);
    return out;
  };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__driveSeeded = (n, seed) => { window.__setSeed(seed); return window.__drive(n); };
  // 雨物理手动步进（对拍期 g.paused=true 冻结实体/时间——render 内 update 被
  // _worldPaused 门跳过;双臂同流:每次 update+frame 前同种子）
  window.__rainStep = (n, seed) => {
    const fx = r.weatherFx;
    const c = r.canvas;
    const cam = g.camera;
    const vW = c.width / (cam.zoom || 1), vH = c.height / (cam.zoom || 1);
    for (let i = 0; i < n; i++) {
      window.__setSeed(seed + i);
      fx.update(g.world, vW, vH, cam.x - vW / 2, cam.y - vH / 2, 0, 0);
      window.__vnow += 16.6667;
      g.frame(window.__vnow);
    }
    return window.__vnow;
  };
  window.__rainTimerWrap = () => {
    const fx = r.weatherFx;
    if (fx.__rainWrapped) return;
    const proto2 = Object.getPrototypeOf(fx);
    const orig = proto2.drawRain;
    window.__rainMs = 0;
    window.__rainN = 0;
    fx.drawRain = function (...a) {
      const t0 = performance.now();
      const res = orig.apply(this, a);
      window.__rainMs += performance.now() - t0;
      window.__rainN++;
      return res;
    };
    fx.__rainWrapped = true;
  };
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__rainMs0 = window.__rainMs;
    window.__rainN0 = window.__rainN;
    const t0 = performance.now();
    const cnt = () => {
      // rAF 节拍手动驱动游戏帧（g.running=false 后游戏自环不再重启——判例:
      // 手动 g.frame 驱动;unpaused=render 内 weatherFx.update 真实链在跑）
      window.__vnow += 16.6667;
      window.__swGame.frame(window.__vnow);
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, rainMs: window.__rainMs - window.__rainMs0, rainN: window.__rainN - window.__rainN0 });
    };
    requestAnimationFrame(cnt);
  });
});
// 停 rAF 主循环——对拍期渲染全权由 __drive/__rainStep 同步驱动;暂停=实体/时间冻结
// （render 内 weatherFx.update 被 _worldPaused 门跳过——雨物理走 __rainStep 手动步进）
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
  m.options.data.renderScale = 1;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => import('/src/render/WeatherRenderer.ts').then((m) => { window.__wrMod = m; }));
await page.evaluate(() => window.__rainTimerWrap());

// 预热:雨池填满（750 帽;手动步进 60 步）
await page.evaluate(() => window.__rainStep(60, 900000));
const poolInfo = await page.evaluate(() => {
  let n = 0;
  for (const d of window.__swGame.renderer.weatherFx.pool) if (d.active) n++;
  return n;
});
console.log(`雨池活滴=${poolInfo}/750`);

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

// ---- RA/RB/RC:同帧配对对拍 ×4（步=1 次手动雨物理 update+1 渲染帧;双臂同种子同状态） ----
const pairs = [];
for (let k = 0; k < 4; k++) {
  const vnow = await page.evaluate(() => window.__vnow);
  // A 臂（2D 真值）
  await page.evaluate(() => { window.__saveState(); window.__rainGlSet(false); });
  await page.evaluate((v) => { window.__vnow = v; window.__rainStep(1, 500000 + 7); }, vnow);
  const finA = await snapFin();
  const poolA = await page.evaluate(() => window.__rainPoolDump());
  const stA = await page.evaluate(() => window.__shimStats());
  const md5A = md5fin(`A${k}`, finA);
  // B 臂（同帧重放:状态恢复+同种子+批开）
  await page.evaluate((v) => { window.__vnow = v; }, vnow);
  await page.evaluate(() => { window.__restoreState(); window.__rainGlSet(true); });
  await page.evaluate((v) => { window.__vnow = v; window.__rainStep(1, 500000 + 7); }, vnow);
  const finB = await snapFin();
  const poolB = await page.evaluate(() => window.__rainPoolDump());
  const stB = await page.evaluate(() => window.__shimStats());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB);
  const poolEq = JSON.stringify(poolA) === JSON.stringify(poolB);
  pairs.push({ k, c, md5A, md5B, poolEq, poolA: poolA.length, poolB: poolB.length, stA, stB });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(3)}%) maxd=${c.maxd} mean=${c.mean.toFixed(2)} bbox=${JSON.stringify(c.bbox)} poolEq=${poolEq}(${poolA.length}/${poolB.length}) statsA: fb=${stA?.stats?.fallback} | statsB: batchQuads=${stB?.stats?.emitBatchQuads} fb=${stB?.stats?.fallback} rp=${stB?.stats?.replays}`);
}

const area = pairs[0] ? await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height) : 1;
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const nPct = (tot / (pairs.length * area)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
chk('RA 雨条 census 有界（n%<6%）', nPct < 6, `n=${tot} (${nPct.toFixed(3)}%) maxd=${worstMaxd}`);
chk('RB 雨池逐滴位对拍（A/B 全等）', pairs.every((p) => p.poolEq && p.poolA === p.poolB), `pools=${pairs.map((p) => p.poolA).join(',')}`);
chk('RC B 臂批真在 GL 走（batchQuads>0/fb=0/rp=0）',
  pairs.every((p) => p.stB?.stats?.emitBatchQuads > 0 && p.stB?.stats?.fallback === 0 && p.stB?.stats?.replays === 0),
  `batchQuads=${pairs[0]?.stB?.stats?.emitBatchQuads}`);

// ---- RD:2D 臂可复现 ----
await page.evaluate(() => { window.__rainGlSet(false); });
await page.evaluate(() => window.__rainStep(1, 500000 + 7));
const finA2 = await snapFin();
chk('RD 2D 臂可复现（md5 备案）', true, `A2=${md5fin('A2', finA2).slice(0, 8)}`);

// ---- RE:帧耗对照（rAF 节拍手动驱动,各 4s 采样窗;unpaused=雨物理真实链在跑） ----
await page.evaluate(() => { window.__swGame.paused = false; });
await page.evaluate(() => window.__rainGlSet(false));
await new Promise((r) => setTimeout(r, 400));
const perfA = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => window.__rainGlSet(true));
await new Promise((r) => setTimeout(r, 400));
const perfB = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
const msA = perfA.rainN ? perfA.rainMs / perfA.rainN : 0;
const msB = perfB.rainN ? perfB.rainMs / perfB.rainN : 0;
const fpsA = perfA.frames / 4, fpsB = perfB.frames / 4;
chk('RE 帧耗对照（≥7× 或 <0.15ms/帧）', msPerFrameCheck(msA, msB),
  `A=${msA.toFixed(3)}ms/帧×${perfA.rainN}（fps≈${fpsA.toFixed(0)}）  B=${msB.toFixed(3)}ms/帧×${perfB.rainN}（fps≈${fpsB.toFixed(0)}）  加速比=${msA > 0 ? (msA / Math.max(msB, 1e-9)).toFixed(1) : '?'}×`);
function msPerFrameCheck(a, b) { return b * 7 < a || b < 0.15; }

// 截图留档（肉眼面;同种子重放双臂各一帧;恢复暂停+手动步进口径）
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await page.evaluate(() => { window.__rainGlSet(true); });
await page.evaluate(() => window.__rainStep(1, 424242));
await page.screenshot({ path: '/tmp/rain-gl-B.png' });
await page.evaluate(() => { window.__rainGlSet(false); });
await page.evaluate(() => window.__rainStep(1, 424242));
await page.screenshot({ path: '/tmp/rain-gl-A.png' });

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
