// ★liqpolish 微光环境微抛光刀——四压力点 self 前后+像素对拍（2026-09-29;_liqgl-ab 页内翻面范式）。
// 场景=大面积微光湖（数百列,同 txr-shimmer3 digest 形态）。
// 判据：
//   P0  基线/改动双臂 CPU profile self 聚合:drawVanillaLiquids / drawLiquidBehindTilesOnly /
//       drawShimmerStars / texAlive 四点前后对照（trace-x-ray 同口径=V8 采样 self）;
//   LA  同帧 A≡B census 有界（A=liqpolish 关=现行逐位基线;B=开;星尘/波光批化面
//       GL vs Skia ±1LSB 登记域;纯外提面=位等）;
//   LB  B 臂批真在 GL 走（emitBatchQuads>0/fb=0/rp=0）;
//   LE  帧耗对照+rAF fps。
// 运行:SW_ORIGIN=http://localhost:5263 node tools/run-diag.mjs --timeout=1200000 scripts/_liqpolish-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5263';
const URL0 = ORIGIN + '/';
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};
const PROF_MS = Number(process.env.PROF_MS || 8000);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('CONSOLE.error: ' + m.text()); });
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await godMode(page, true);

// ---- 场面:地下宽幅微光湖（~300 列×14 深,砖岸,玩家岸边,相机钉位）----
// zoneShimmer 门（SceneMetrics :466）= 微光液 ≥300 ∧ 玩家 y > surface+84 ∧ 非地牢
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const px = Math.floor(g.player.cx / 16);
  const surf = Math.floor(g.world.groundLevel);
  const ry = surf + 100;                        // 地下湖面（surface+84 深度带内）
  const x0 = px - 160, x1 = px + 140, depth = 14;
  const STONE = window.__swTiles?.['stone_block'] ?? 1;
  for (let x = x0 - 10; x <= x1 + 10; x++) {
    for (let y = ry - 12; y <= ry + depth + 10; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); st.setWall?.(x, y, 0); }
  }
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  for (let x = x0; x <= x1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, BRICK); st.setTile(x1 + 1, y, BRICK); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  // 顶板（洞顶）+ 玩家站台（湖右岸,不落水）
  for (let x = x0 - 10; x <= x1 + 10; x++) { st.setTile(x, ry - 12, STONE); st.setTile(x, ry - 11, STONE); }
  for (let x = x1 + 3; x <= x1 + 9; x++) st.setTile(x, ry + 2, BRICK);
  g.player.x = (x1 + 6) * 16; g.player.y = (ry - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__sceneRef = { x0, x1, ry, depth };

  // 帧驱动（暂停态渲染纯函数;同 vnow 重放=同帧）
  window.__vnow = performance.now();
  window.__drive = (n) => {
    for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
    return window.__vnow;
  };
  window.__polishSet = (v) => { try { window.__pfMod?.liqpolishSetForTest?.(v); } catch { /* 基线旗未落地=no-op */ } };
  window.__shimStats = () => g.renderer.bglShimStats();
  window.__renderState = () => {
    const r = g.renderer;
    return { inv: r._waveLiquidInView, accMode: r._accMode, path: r.bglPathUsed };
  };
  window.__liqTimerWrap = () => {
    const r = g.renderer;
    if (r.__liqWrapped) return;
    const proto = Object.getPrototypeOf(r);
    const orig = proto.drawLiquids;
    window.__liqMs = 0; window.__liqN = 0;
    r.drawLiquids = function (...a) {
      const t0 = performance.now();
      const res = orig.apply(this, a);
      window.__liqMs += performance.now() - t0;
      window.__liqN++;
      return res;
    };
    r.__liqWrapped = true;
  };
  window.__perfWindow = (ms) => new Promise((res) => {
    let frames = 0;
    window.__liqMs0 = window.__liqMs; window.__liqN0 = window.__liqN;
    window.__frameMs = 0;
    const gf = window.__swGame.frame.bind(window.__swGame);
    const t0 = performance.now();
    const cnt = () => {
      window.__vnow += 16.6667;
      const tf = performance.now();
      gf(window.__vnow);
      window.__frameMs += performance.now() - tf;
      frames++;
      if (performance.now() - t0 < ms) requestAnimationFrame(cnt);
      else res({ frames, liqMs: window.__liqMs - window.__liqMs0, liqN: window.__liqN - window.__liqN0, frameMs: window.__frameMs });
    };
    requestAnimationFrame(cnt);
  });
});
await page.evaluate(() => import('/src/render/perfFlags.ts').then((m) => { window.__pfMod = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => { window.__liqTimerWrap(); });

// 活帧阶段（scene 15t 重扫 + shimmerAlpha 升满 + 玩家物理落台）——轮询至 zone∧shim∧acc
await page.evaluate(() => { window.__swGame.paused = false; window.__forceRescan = () => { window.__swGame._forceSceneRescan = true; }; });
for (let i = 0; i < 20; i++) {
  await page.evaluate(() => { window.__forceRescan(); window.__drive(15); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
  const s = await page.evaluate(() => ({ rs: window.__renderState(), shim: window.__swGame.renderer.monoFilters.shimmerAlpha, zone: !!window.__swGame.scene?.zoneShimmer }));
  if (s.rs.accMode === 'acc' && s.shim >= 0.999 && s.zone) break;
  await new Promise((r) => setTimeout(r, 300));
}
// 暂停（scene 冻结=zone 保持;shimmerAlpha 由渲染侧维持）+ 波场定格（对拍确定性）
// ★worker 波场冻结:_wwApplyField no-op 定格末场（worker 自有钟不受主线程 dt=0 管——
//   上轮对拍 A0≠A1 定谳面）;sampleDisplace 读静态场=同帧重放确定。
await page.evaluate(() => {
  window.__swGame.paused = true; window.__swGame.running = false;
  const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y;
  const ww = window.__wwMod.waterWaves;
  if (!ww.__fieldFrozen) {
    ww.__origApplyField = ww._wwApplyField.bind(ww);
    ww._wwApplyField = function (m) { /* 冻结:吞 worker 场 */ };
    ww.__fieldFrozen = true;
  }
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});
const st1 = await page.evaluate(() => {
  const g = window.__swGame;
  return { rs: window.__renderState(), shim: g.renderer.monoFilters.shimmerAlpha, zone: !!g.scene?.zoneShimmer,
    batch: g.renderer.bglShimStats()?.stats?.emitBatchQuads ?? 0 };
});
// accMode 读值在帧外（finishAccFrame 收口后归 'off'）——批证据（emitBatchQuads>0）
// + path b2b-acc-* 为准（_liqgl-ab LB 同判例）
chk('场面就绪(液体在视+acc+微光域)', st1.rs.inv === true && st1.rs.path.startsWith('b2b-acc') && st1.batch > 0 && st1.shim > 0.99 && st1.zone, JSON.stringify(st1));

// ---- texAlive 逐帧计数器（实例级包装;基线/改动同口径）----
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const glw = r._accGlw;
  if (glw && !glw.__taWrapped) {
    window.__taN = 0;
    const orig = glw.texAlive.bind(glw);
    glw.texAlive = function (e) { window.__taN++; return orig(e); };
    glw.__taWrapped = true;
  }
});

// ---- V8 采样 self 聚合（trace-x-ray 同口径）----
async function profileSelf(names) {
  const cdp = await page.target().createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const pw = await page.evaluate((ms) => window.__perfWindow(ms), PROF_MS);
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  // self time per node: samples+timeDeltas
  const selfUs = new Map();
  const { samples, timeDeltas } = profile;
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i];
    const dt = timeDeltas[i] || 0;
    selfUs.set(id, (selfUs.get(id) || 0) + dt);
  }
  const agg = {};
  for (const n of profile.nodes) {
    const fn = n.callFrame.functionName || '(anonymous)';
    const us = selfUs.get(n.id) || 0;
    if (us > 0) agg[fn] = (agg[fn] || 0) + us;
  }
  const out = {};
  for (const k of names) out[k] = (agg[k] || 0) / 1000;
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 36)
    .map(([k, v]) => `${k}:${(v / 1000).toFixed(1)}`);
  return { out, pw, top, totalMs: [...selfUs.values()].reduce((a, b) => a + b, 0) / 1000 };
}

const FNS = ['drawVanillaLiquids', 'drawLiquidBehindTilesOnly', 'drawShimmerStars', 'texAlive',
  'applyShimmerBaseTint', 'shimmerCornerColors', 'batQuad', 'drawStar', 'drawRec2D', 'resolveTex'];

await page.evaluate(() => { window.__pfMod?.liqpolishSetForTest?.(false); window.__polishSet(false); });
await page.evaluate(() => { window.__taN = 0; });
const profA = await profileSelf(FNS);
const taA = await page.evaluate(() => window.__taN);
console.log('[A 臂 polish=off]', JSON.stringify({ self: profA.out, fps: (profA.pw.frames / (PROF_MS / 1000)).toFixed(1), liqMs: (profA.pw.liqMs / Math.max(1, profA.pw.liqN)).toFixed(3), texAliveCallsPerFrame: (taA / Math.max(1, profA.pw.frames)).toFixed(1) }));
console.log('[A top]', profA.top.join(' '));
writeFileSync('/tmp/liqpolish-profA.json', JSON.stringify(profA, null, 1));

await page.evaluate(() => { window.__polishSet(true); });
await page.evaluate(() => { window.__taN = 0; });
const profB = await profileSelf(FNS);
const taB = await page.evaluate(() => window.__taN);
console.log('[B 臂 polish=on]', JSON.stringify({ self: profB.out, fps: (profB.pw.frames / (PROF_MS / 1000)).toFixed(1), liqMs: (profB.pw.liqMs / Math.max(1, profB.pw.liqN)).toFixed(3), texAliveCallsPerFrame: (taB / Math.max(1, profB.pw.frames)).toFixed(1) }));
console.log('[B top]', profB.top.join(' '));
writeFileSync('/tmp/liqpolish-profB.json', JSON.stringify(profB, null, 1));

const sum = (o) => FNS.slice(0, 4).reduce((s, k) => s + (o[k] || 0), 0);
const sA = sum(profA.out), sB = sum(profB.out);
chk('P0 四点 self 合计 ≥1.5×（目标 ≥2×）', sB <= sA / 1.5, `A=${sA.toFixed(1)}ms B=${sB.toFixed(1)}ms ratio=${(sA / Math.max(sB, 1e-9)).toFixed(2)}×`);
for (const k of FNS.slice(0, 4)) {
  const a = profA.out[k] || 0, b = profB.out[k] || 0;
  console.log(`  ${k}: ${a.toFixed(1)}ms -> ${b.toFixed(1)}ms  (${a > 0 ? (a / Math.max(b, 1e-9)).toFixed(2) : '?'}×)`);
}

// ---- snapFin/census（_liqgl-ab 同式）----
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
const md5fin = (label, fin) => {
  const buf = Buffer.from(fin.b64, 'base64');
  writeFileSync(`/tmp/liqpolish-${label}.rgba`, buf);
  return createHash('md5').update(buf).digest('hex');
};

const K = 3;
const pairs = [];
for (let k = 0; k < 3; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(() => { window.__polishSet(false); });
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
  const finA = await snapFin();
  const stA = await page.evaluate(() => window.__shimStats());
  const md5A = md5fin(`A${k}`, finA);
  await page.evaluate(() => { window.__polishSet(true); });
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
  const finB = await snapFin();
  const stB = await page.evaluate(() => window.__shimStats());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB);
  pairs.push({ k, c, md5A, md5B, stA, stB });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(4)}%) maxd=${c.maxd} mean=${c.mean.toFixed(3)} bbox=${JSON.stringify(c.bbox)} | B stats: batch=${stB?.stats?.emitBatchQuads} fb=${stB?.stats?.fallback} rp=${stB?.stats?.replays} up=${stB?.stats?.uploads}`);
}
const area = pairs[0] ? pairs[0].c.n ? (await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height)) : 1 : 1;
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const nPct = (tot / (pairs.length * area)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
chk('LA census 有界（登记域:sparkle/glint/带 modulate GL±1LSB + multiply 半透明 dst 补正项缺席=liqgl LA 同族 maxd≤72;纯外提面位等）', worstMaxd <= 72 && nPct < 20,
  `n=${tot}(${nPct.toFixed(4)}%) maxd=${worstMaxd} bbox=${JSON.stringify(pairs[0]?.c.bbox)}`);
chk('LB B 臂批真在 GL 走（batchQuads>0/fb=0/rp=0）',
  pairs.every((p) => p.stB?.stats?.emitBatchQuads > 0 && p.stB?.stats?.fallback === 0 && p.stB?.stats?.replays === 0),
  `batchQuads=${pairs[0]?.stB?.stats?.emitBatchQuads}`);

// LE:帧耗对照
const v0s = await page.evaluate(() => window.__vnow);
await page.evaluate(() => { window.__polishSet(true); });
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: v0s, K });
await page.screenshot({ path: '/tmp/liqpolish-B.png' });
await page.evaluate(() => { window.__polishSet(false); });
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: v0s, K });
await page.screenshot({ path: '/tmp/liqpolish-A.png' });

await page.evaluate(() => { window.__polishSet(false); });
await new Promise((r) => setTimeout(r, 300));
const perfA2 = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => { window.__polishSet(true); });
await new Promise((r) => setTimeout(r, 300));
const perfB2 = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
const fmA = perfA2.frameMs / Math.max(1, perfA2.frames), fmB = perfB2.frameMs / Math.max(1, perfB2.frames);
chk('LE 帧耗对照（B ≤ A）', fmB <= fmA * 1.02,
  `整帧 A=${fmA.toFixed(2)}ms（fps≈${(perfA2.frames / 4).toFixed(0)}） B=${fmB.toFixed(2)}ms（fps≈${(perfB2.frames / 4).toFixed(0)}）`);

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
