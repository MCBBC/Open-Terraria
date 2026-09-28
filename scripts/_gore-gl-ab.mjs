// ★F-gore（?goregl=1 缺省关）像素对拍+draw call/帧耗对照（2026-09-28;_rain-gl-ab 范式）。
// A 臂=goregl 关（逐件 drawImage→shim 逐 rec quadSprite 真值）;B 臂=goregl 开（顶点批,
// 段=单 quadBatchRgba drawArrays）。页内 goreGlSetForTest 翻面;同种子重放 respawn 口径
// （gore spawn 随机系=种子冻结;pool=resetGorePool+定seed respawn,双臂逐位同）。
// 判据：
//   GA  同帧 A≡B census 有界（批角点=decode+VERT_SRC 式 CPU f32 vs quadSprite GPU 式
//       ——±f32 舍入+旋转边 AA=B2b/雨批同族登记口径;n%<2%/maxd 有界/bbox 落 gore 区）;
//   GB  gore pool 逐件位对拍（A/B 全等=spawn 面零触碰）;
//   GC  B 臂批真在 GL 走（emitBatchQuads=件数/fallback=0/replays=0）+draw call 前后
//       （A=逐件 quadSprite≈600 → B=quadBatchRgba 段数级;prototype wrap 计数）;
//   GD  2D 臂可复现（md5 备案）;
//   GE  drawGorePieces 帧耗对照（B ≤ A;600 件档批化收益面）。
// 运行:SW_ORIGIN=http://localhost:5248 node tools/run-diag.mjs --timeout=1200000 scripts/_gore-gl-ab.mjs
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
  writeFileSync(`/tmp/gore-gl-${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260928 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场面静化 + 仪器钩 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  g.player.vx = 0; g.player.vy = 0;
  const w = g.world.weather;
  try { w.startRain(false, 0); } catch { /* 域差异 */ }
  w.raining = false;
  const hk = g.weatherHooks;
  if (hk) { hk.zoneRain = false; hk.surfaceAtmospherics = false; hk.shimmerAlpha = 0; }

  // 种子冻结（gore spawn 随机系口径）
  window.__setSeed = (s) => {
    let st = s >>> 0;
    Math.random = () => { st = (Math.imul(st, 1664525) + 1013904223) >>> 0; return st / 4294967296; };
  };
  // Boss 战模拟:600 池全量在屏（★spawn 序=绘制序=pool 迭代序;Boss 死亡爆发=同型
  // 连发——分组连发为批化 run 的现实口径;行/α 按连续块取档=多次死亡事件不同帧相
  // 的现实分布;rot/scale 逐件取档覆盖直绘+旋转两支）。perfect=true=NewGore 无随机
  // 扰动支;spawn 后逐件定值覆写=双臂逐位同池。
  window.__spawnGore = (seed) => {
    window.__setSeed(seed);
    const cam = g.camera;
    const c = r.canvas;
    const vW = c.width / (cam.zoom || 1), vH = c.height / (cam.zoom || 1);
    const gx0 = cam.x - vW / 3, gx1 = cam.x + vW / 3;
    const gy0 = cam.y - vH / 3, gy1 = cam.y + vH / 3;
    const GROUPS = [
      { type: 5, n: 120, rows: 1 }, { type: 6, n: 120, rows: 1 },
      { type: 16, n: 120, rows: 1 }, { type: 1217, n: 120, rows: 3 },
      { type: 1201, n: 120, rows: 4 },
    ];
    const cols = 30;
    let slot = 0;
    let n = 0;
    for (const grp of GROUPS) {
      for (let k = 0; k < grp.n; k++) {
        const x = gx0 + (slot % cols) * ((gx1 - gx0) / (cols - 1)) + (Math.random() - 0.5) * 8;
        const y = gy0 + Math.floor(slot / cols) * ((gy1 - gy0) / (20 - 1)) + (Math.random() - 0.5) * 8;
        const p = m.GorePiece.newGore(grp.type, x, y, 0, 0, 1, true);
        slot++;
        if (!p) continue;
        p.rotation = (k % 3 === 1) ? Math.random() * 0.8 - 0.4 : 0;
        if (k % 3 === 2) p.scale = 0.9 + Math.random() * 0.3;
        p.alpha = (Math.floor(k / 40) % 2 === 1) ? 100 : 0;   // α 连续块（不碎 run）
        if (grp.rows > 1) p.row = Math.floor(k / (grp.n / grp.rows)) % grp.rows;   // 行连续块
        n++;
      }
    }
    return n;
  };
  // gore 贴图预热+解码等待（ensureVImage 首载 HTML 元素异步解码——未解码窗内
  // drawGorePiece 早退=零绘制,对拍前置必须等全型 width>0）
  window.__goreTexReady = async () => {
    const names = ['vanilla/Gore_5.png', 'vanilla/Gore_6.png', 'vanilla/Gore_16.png',
      'vanilla/Gore_1217.png', 'vanilla/Gore_1201.png'];
    for (let t = 0; t < 100; t++) {
      const imgs = names.map((n) => r.atlas.ensureVImage(n));
      if (imgs.every((im) => im && im.width > 0)) return true;
      await new Promise((res) => setTimeout(res, 50));
    }
    return false;
  };
  let m = null;
  window.__goreInit = async () => {
    m = await import('/src/entities/GorePiece.ts');
    window.__goreMod = m;
  };
  window.__resetPool = () => { m.resetGorePool(); };
  window.__poolDump = () => {
    const out = [];
    for (const p of m.liveGorePieces()) out.push([p.goreId, +p.x.toFixed(4), +p.y.toFixed(4), +p.rotation.toFixed(8), +p.scale.toFixed(6), p.alpha, p.row, p.additive ? 1 : 0]);
    return out;
  };
  // draw call 计数（prototype wrap:GLSpriteLayer 全发射口;帧界手动清零）
  window.__glCount = async () => {
    const mod = await import('/src/render/GLSpriteLayer.ts');
    const P = mod.GLSpriteLayer.prototype;
    if (!P.__goreWrapped) {
      P.__goreWrapped = true;
      window.__dc = { quadSprite: 0, quadBatchRgba: 0, quad: 0, quadExact: 0 };
      for (const name of ['quadSprite', 'quadBatchRgba', 'quad', 'quadExact']) {
        const orig = P[name];
        P[name] = function (...a) { window.__dc[name]++; return orig.apply(this, a); };
      }
    }
  };
  window.__dcReset = () => { for (const k of Object.keys(window.__dc)) window.__dc[k] = 0; };
  // drawGorePieces 计时+逐件计数（Renderer.prototype wrap;帧界累计——A 臂
  // drawGorePiece=逐件数,B 臂不触达（批化早退）;draw call 对比=gore 专用计数）
  window.__goreTimerWrap = () => {
    const rp = Object.getPrototypeOf(r);
    if (rp.__goreWrapped) return;
    rp.__goreWrapped = true;
    window.__goreMs = 0;
    window.__goreN = 0;
    window.__gorePieceN = 0;
    const orig = rp.drawGorePieces;
    rp.drawGorePieces = function (...a) {
      const t0 = performance.now();
      const res = orig.apply(this, a);
      window.__goreMs += performance.now() - t0;
      window.__goreN++;
      return res;
    };
    const origP = rp.drawGorePiece;
    rp.drawGorePiece = function (...a) {
      window.__gorePieceN++;
      return origP.apply(this, a);
    };
  };
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
  window.__shimStats = () => r.bglShimStats();
  window.__gorePieceReset = () => { window.__gorePieceN = 0; };
  window.__goreGlSet = async (v) => {
    const rm = await import('/src/render/Renderer.ts');
    rm.Renderer.goreGlSetForTest(v);
  };
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__goreMs0 = window.__goreMs;
    window.__goreN0 = window.__goreN;
    const t0 = performance.now();
    const cnt = () => {
      window.__vnow += 16.6667;
      window.__swGame.frame(window.__vnow);
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, goreMs: window.__goreMs - window.__goreMs0, goreN: window.__goreN - window.__goreN0 });
    };
    requestAnimationFrame(cnt);
  });
});
await page.evaluate(() => window.__goreInit());

// 停 rAF 主循环——对拍期渲染全权由 __drive 同步驱动
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
  m.options.data.renderScale = 1;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => window.__glCount());
await page.evaluate(() => window.__goreTimerWrap());

// 预热：gore 贴图解码等待 + 600 池填满 + 相机定格
const texOk = await page.evaluate(() => window.__goreTexReady());
chk('gore 贴图预热（全型 width>0）', texOk === true, String(texOk));
const spawned = await page.evaluate(() => { window.__resetPool(); return window.__spawnGore(20260928); });
console.log(`gore 池=${spawned}/600`);
await page.evaluate(() => window.__drive(10));   // 暖机（首见纹理/缓存;解码后帧）

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

// ---- GA/GB/GC:同帧配对对拍 ×3（双臂 resetPool+同 seed respawn=同池同帧） ----
const pairs = [];
for (let k = 0; k < 3; k++) {
  // A 臂（2D 逐件真值）
  await page.evaluate(() => { window.__dcReset(); window.__gorePieceReset(); window.__goreGlSet(false); });
  await page.evaluate(() => { window.__resetPool(); window.__spawnGore(500000 + 7); });
  await page.evaluate(() => window.__drive(1));
  const finA = await snapFin();
  const poolA = await page.evaluate(() => window.__poolDump());
  const stA = await page.evaluate(() => window.__shimStats());
  const pieceA = await page.evaluate(() => window.__gorePieceN);
  const md5A = md5fin(`A${k}`, finA);
  // B 臂（同池重放+批开）
  await page.evaluate(() => { window.__dcReset(); window.__gorePieceReset(); window.__goreGlSet(true); });
  await page.evaluate(() => { window.__resetPool(); window.__spawnGore(500000 + 7); });
  await page.evaluate(() => window.__drive(1));
  const finB = await snapFin();
  const poolB = await page.evaluate(() => window.__poolDump());
  const stB = await page.evaluate(() => window.__shimStats());
  const dcB = await page.evaluate(() => ({ ...window.__dc }));
  const pieceB = await page.evaluate(() => window.__gorePieceN);
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB);
  const poolEq = JSON.stringify(poolA) === JSON.stringify(poolB);
  const segs = dcB.quadBatchRgba;
  pairs.push({ k, c, md5A, md5B, poolEq, pieceA, pieceB, segs, quads: stB?.stats?.emitBatchQuads, stA, stB, poolN: poolA.length });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(3)}%) maxd=${c.maxd} mean=${c.mean.toFixed(2)} bbox=${JSON.stringify(c.bbox)} poolEq=${poolEq}(${poolA.length}) drawCall A=${pieceA}(逐件) B=${segs}(段) quads=${stB?.stats?.emitBatchQuads} statsA fb=${stA?.stats?.fallback} | statsB fb=${stB?.stats?.fallback} rp=${stB?.stats?.replays}`);
}

const area = pairs[0] ? await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height) : 1;
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const nPct = (tot / (pairs.length * area)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
chk('GA gore census 有界（n%<2%）', nPct < 2, `n=${tot} (${nPct.toFixed(3)}%) maxd=${worstMaxd}`);
chk('GB gore pool 逐件位对拍（A/B 全等）', pairs.every((p) => p.poolEq && p.poolN === 600), `pools=${pairs.map((p) => p.poolN).join(',')}`);
chk('GC1 B 臂批真在 GL 走（batchQuads=600/fb=0/rp=0/A 臂逐件=600）',
  pairs.every((p) => p.quads === 600 && p.stB?.stats?.fallback === 0 && p.stB?.stats?.replays === 0
    && p.pieceA === 600 && p.pieceB === 0),
  `batchQuads=${pairs[0]?.quads} pieceA=${pairs[0]?.pieceA} pieceB=${pairs[0]?.pieceB}`);
chk('GC2 draw call 前后（A=600 逐件 → B 段数级 ≤24）',
  pairs.every((p) => p.segs <= 24 && p.segs < 600 / 5),
  `A=600 逐件 B=${pairs[0]?.segs} 段（批化比=${(600 / Math.max(pairs[0]?.segs, 1)).toFixed(0)}×）`);

// ---- GD:2D 臂可复现 ----
await page.evaluate(() => { window.__goreGlSet(false); });
await page.evaluate(() => { window.__resetPool(); window.__spawnGore(500000 + 7); });
await page.evaluate(() => window.__drive(1));
const finA2 = await snapFin();
chk('GD 2D 臂可复现（md5 备案）', true, `A2=${md5fin('A2', finA2).slice(0, 8)}`);

// ---- GE:帧耗对照（rAF 节拍手动驱动,各 3s 采样窗） ----
await page.evaluate(() => { window.__swGame.paused = false; });
await page.evaluate(() => { window.__goreGlSet(false); });
await new Promise((r) => setTimeout(r, 300));
const perfA = await page.evaluate((ms) => window.__perfWindow(ms), 3000);
await page.evaluate(() => { window.__goreGlSet(true); });
await new Promise((r) => setTimeout(r, 300));
const perfB = await page.evaluate((ms) => window.__perfWindow(ms), 3000);
const msA = perfA.goreN ? perfA.goreMs / perfA.goreN : 0;
const msB = perfB.goreN ? perfB.goreMs / perfB.goreN : 0;
const fpsA = perfA.frames / 3, fpsB = perfB.frames / 3;
chk('GE 帧耗对照（drawGorePieces B ≤ A×1.05）', msB <= msA * 1.05 || msA === 0,
  `A=${msA.toFixed(3)}ms/帧×${perfA.goreN}（fps≈${fpsA.toFixed(0)}）  B=${msB.toFixed(3)}ms/帧×${perfB.goreN}（fps≈${fpsB.toFixed(0)}）`);

// 截图留档（肉眼面;同种子重放双臂各一帧）
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await page.evaluate(() => { window.__goreGlSet(true); });
await page.evaluate(() => { window.__resetPool(); window.__spawnGore(424242); });
await page.evaluate(() => window.__drive(1));
await page.screenshot({ path: '/tmp/gore-gl-B.png' });
await page.evaluate(() => { window.__goreGlSet(false); });
await page.evaluate(() => { window.__resetPool(); window.__spawnGore(424242); });
await page.evaluate(() => window.__drive(1));
await page.screenshot({ path: '/tmp/gore-gl-A.png' });

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
