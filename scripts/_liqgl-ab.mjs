// ★liqgl 微光液体批化+染色 GL 化——像素对拍+帧耗对照（2026-09-27;_rain-gl-ab 页内翻面范式）。
// A 臂=liqgl 关（现 CPU 真值:fgCanvas 原生 2D+canvas multiply）;B 臂=liqgl 开（批化+
// 顶点色调制+gate FBO）。页内 liqglSetForTest 翻面;液体=确定性系（暂停态渲染纯函数）,
// 同帧双臂直接重放（同 vnow 同 animTick）。
// 判据：
//   LA  同帧 A≡B census 有界——【登记域】①canvas multiply 半透明 dst 补正项
//       color×(1−αdst)（批化支=原版 XNA modulate 单式,无此项——池体 fg 0.75 面
//       ≤0.25×color≈52LSB;贴图 AA 边缘同类）②坡面足迹可见 +2% tint 缺席
//       （251 头注「不可辨」域）→ n% 有界/maxd≤72/mean 有界/bbox ⊆ 液面邻域;
//   LB  B 臂批真在 GL 走（emitBatchQuads>0/fallback=0/replays=0）;
//   LC  B 臂 gate 上传退役（uploads 帧间零增长;A 臂 fgCanvas texRefresh 每帧 +1）;
//   LD  2D 臂可复现（md5 备案）;
//   LE  帧耗对照:drawLiquids 包装 ms/帧 + rAF fps。
// 运行:SW_ORIGIN=http://localhost:5230 node tools/run-diag.mjs --timeout=1200000 scripts/_liqgl-ab.mjs
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
  writeFileSync(`/tmp/liqgl-${label}.rgba`, buf);
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

// ---- 场面:地表砖砌微光池（贴玩家站位,池面在视口内=_waveLiquidInView 真）----
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel);
  const x0 = px - 44, x1 = px + 44, ry = gy + 2, depth = 5;
  for (let x = x0 - 8; x <= x1 + 8; x++) {
    for (let y = ry - 10; y <= ry + depth + 8; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  }
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  for (let x = x0; x <= x1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, BRICK); st.setTile(x1 + 1, y, BRICK); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  g.player.x = (x1 + 6) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  // ★相机钉位（暂停态相机不追人——forensic2 判例;不钉=池在视口外=对拍空转）
  g.camera.x = g.player.x; g.camera.y = g.player.y;

  // 帧驱动（暂停态渲染纯函数;同 vnow 重放=同帧）
  window.__vnow = performance.now();
  window.__drive = (n) => {
    for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); }
    return window.__vnow;
  };
  window.__liqglSet = (v) => { window.__vlMod.liqglSetForTest(v); };
  window.__shimStats = () => g.renderer.bglShimStats();
  window.__renderState = () => {
    const r = g.renderer;
    return {
      inv: r._waveLiquidInView,
      accMode: r._accMode,
      path: r.bglPathUsed,
    };
  };
  // drawLiquids 包装计时
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
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
// ★波场冻结（dt=0 注入——updateWaterWaves 的 dt 源=真 performance.now,双臂重放
//  间隔的真实时间差会推进 progress=水面 bob 相位漂移=对拍伪差;dt=0 后波场定格）
await page.evaluate(() => {
  const ww = window.__wwMod.waterWaves;
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});
await page.evaluate(() => { window.__liqTimerWrap(); });

// 预热（波场纹理/批程序暖机）+ 状态核实
await page.evaluate(() => window.__drive(30));
await page.evaluate(() => { const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
await page.evaluate(() => window.__drive(5));
const st1 = await page.evaluate(() => window.__renderState());
chk('场面就绪(acc+液体在视+相机钉位)', st1.inv === true && (st1.accMode === 'off' || st1.accMode === 'acc'), JSON.stringify(st1));

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

// ---- LA/LB/LC:同帧配对对拍 ×3（g.frame 渲染/跳帧交替——同 vnow 序列双臂重放,
// 每臂 K 帧保证至少一次真渲染;暂停态=状态零演化,序列重放=逐位同帧） ----
const K = 3;
const pairs = [];
for (let k = 0; k < 3; k++) {
  const v0 = await page.evaluate(() => window.__vnow);
  await page.evaluate(() => { window.__liqglSet(false); });
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
  const finA = await snapFin();
  const stA = await page.evaluate(() => window.__shimStats());
  const md5A = md5fin(`A${k}`, finA);
  await page.evaluate(() => { window.__liqglSet(true); });
  await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0, K });
  const finB = await snapFin();
  const stB = await page.evaluate(() => window.__shimStats());
  const md5B = md5fin(`B${k}`, finB);
  const c = await census(finA, finB);
  pairs.push({ k, c, md5A, md5B, stA, stB });
  console.log(`[pair ${k}] md5 A=${md5A.slice(0, 8)} B=${md5B.slice(0, 8)} census n=${c.n}(${(c.n * 100 / (finA.w * finA.h)).toFixed(3)}%) maxd=${c.maxd} mean=${c.mean.toFixed(2)} bbox=${JSON.stringify(c.bbox)} | B stats: batch=${stB?.stats?.emitBatchQuads} fb=${stB?.stats?.fallback} rp=${stB?.stats?.replays} up=${stB?.stats?.uploads}`);
}
const area = pairs[0] ? pairs[0].c.n ? (await page.evaluate(() => window.__swGame.renderer.canvas.width * window.__swGame.renderer.canvas.height)) : 1 : 1;
const tot = pairs.reduce((s, p) => s + p.c.n, 0);
const nPct = (tot / (pairs.length * area)) * 100;
const worstMaxd = Math.max(...pairs.map((p) => p.c.maxd));
const meanAll = pairs.reduce((s, p) => s + p.c.mean, 0) / pairs.length;
chk('LA census 有界（登记域:n% 有界/maxd≤72）', worstMaxd <= 72 && nPct < 40,
  `n=${tot}(${nPct.toFixed(3)}%) maxd=${worstMaxd} mean=${meanAll.toFixed(2)} bbox=${JSON.stringify(pairs[0]?.c.bbox)}`);
chk('LB B 臂批真在 GL 走（batchQuads>0/fb=0/rp=0）',
  pairs.every((p) => p.stB?.stats?.emitBatchQuads > 0 && p.stB?.stats?.fallback === 0 && p.stB?.stats?.replays === 0),
  `batchQuads=${pairs[0]?.stB?.stats?.emitBatchQuads}`);

// LC2:gate FBO 句柄活性（B 臂 compose 直采;null=发射失败=本帧无扭曲=静默降级禁下面）
const gateOk = await page.evaluate(() => {
  window.__liqglSet(true); window.__drive(2);
  const r = window.__swGame.renderer;
  return { handle: !!r._liqGateHandle, warpDebug: r.liquidDebugState?.()?.warp ?? null };
});
chk('LC2 gate FBO 句柄活性（批化帧 compose 直采）', gateOk.handle === true, JSON.stringify(gateOk));

// LC:uploads 帧间零增长（gate 上传退役面;B 臂暖机后 uploads 恒定）
const up0 = await page.evaluate(() => { window.__liqglSet(true); window.__drive(3); return window.__shimStats()?.stats?.uploads ?? -1; });
const up1 = await page.evaluate(() => { window.__drive(5); return window.__shimStats()?.stats?.uploads ?? -1; });
chk('LC B 臂 gate 上传退役（uploads 帧间零增长）', up0 === up1, `up@t0=${up0} up@t5=${up1}`);

// LD:2D 臂可复现（同 vnow 序列重放）
const v0ld = await page.evaluate(() => window.__vnow);
await page.evaluate(() => { window.__liqglSet(false); });
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: v0ld, K });
const finA2 = await snapFin();
chk('LD 2D 臂可复现（md5 备案）', true, `A2=${md5fin('A2', finA2).slice(0, 8)}`);

// ---- LE:帧耗对照（4s 采样窗×双臂） ----
await page.evaluate(() => { window.__swGame.paused = false; });
await page.evaluate(() => { window.__liqglSet(false); });
await new Promise((r) => setTimeout(r, 400));
const perfA = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
await page.evaluate(() => { window.__liqglSet(true); });
await new Promise((r) => setTimeout(r, 400));
const perfB = await page.evaluate((ms) => window.__perfWindow(ms), 4000);
const msA = perfA.liqN ? perfA.liqMs / perfA.liqN : 0;
const msB = perfB.liqN ? perfB.liqMs / perfB.liqN : 0;
const fmA = perfA.frameMs / Math.max(1, perfA.frames), fmB = perfB.frameMs / Math.max(1, perfB.frames);
chk('LE 帧耗对照（B < A;含整帧 ms/渲染帧）', msB < msA,
  `A=${msA.toFixed(3)}ms/帧×${perfA.liqN}（fps≈${(perfA.frames / 4).toFixed(0)}）  B=${msB.toFixed(3)}ms/帧×${perfB.liqN}（fps≈${(perfB.frames / 4).toFixed(0)}）  加速比=${msA > 0 ? (msA / Math.max(msB, 1e-9)).toFixed(2) : '?'}×  整帧 A=${fmA.toFixed(2)}ms B=${fmB.toFixed(2)}ms`);

// 截图留档
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
const v0s = await page.evaluate(() => window.__vnow);
await page.evaluate(() => { window.__liqglSet(true); });
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: v0s, K });
await page.screenshot({ path: '/tmp/liqgl-B.png' });
await page.evaluate(() => { window.__liqglSet(false); });
await page.evaluate(({ v0, K }) => { window.__vnow = v0; for (let i = 0; i < K; i++) window.__drive(1); }, { v0: v0s, K });
await page.screenshot({ path: '/tmp/liqgl-A.png' });

const errs = pageErrors.filter((e) => !e.includes('favicon'));
chk('页面零错误', errs.length === 0, errs.slice(0, 3).join(' | '));
const fails = results.filter((r) => !r.ok).length;
console.log(fails === 0 ? '== ALL PASS ==' : `== ${fails} FAIL ==`);
process.exit(fails === 0 ? 0 : 1);
