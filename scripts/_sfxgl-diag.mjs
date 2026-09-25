// ★A1 定谳辅诊（一次性）：heat pass A/B 差异定位——噪声纹理逐字节读回+行差分剖面。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=600000 scripts/_sfxgl-diag.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?sfxgl=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });

await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  sky.drawAmbience = () => {};
  sky.ambEntities.length = 0;
  sky.ambNextAttempt = 1000000;
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; w.update = () => {}; }
  window.__pause = (v) => { g.paused = v; };
  window.__sfxSet = (v) => r.constructor.sfxPipeSetForTest(v);
  window.__heat = (i) => {
    const m = r.monoFilters;
    m.update = () => {};
    for (const f of m.filters) { f.active = false; f.opacity = 0; }
    m.heatActive = true; m.heatOpacity = 1; m.heatIntensity = i;
    return true;
  };
  window.__chain = (spec) => {
    const m = r.monoFilters;
    m.update = () => {};
    for (const f of m.filters) { f.active = false; f.opacity = 0; }
    m.heatActive = false; m.heatOpacity = 0; m.heatIntensity = 0;
    m.bloodMoonUseOpacity = 0; m.graveyardProgress = 0;
    const set = (key, op) => { const f = m.state(key); if (f) { f.active = true; f.opacity = op; } };
    if (spec.blood) { set('BloodMoon', 1); m.bloodMoonUseOpacity = 0.6; }
    if (spec.grave) { set('Graveyard', 1); m.graveyardProgress = 0.6; }
    if (spec.crt) set('CRT', 1);
    if (spec.heat) { m.heatActive = true; m.heatOpacity = 1; m.heatIntensity = 2; }
    if (spec.tower) {
      r._lunarTowerFilterTarget = () => ({ key: 'nebula', x: g.camera.x + 260, y: g.camera.y - 10, ai3: 0, shieldUp: true });
      r._towerFilterOpacity = 1; r._towerFilterLastMs = performance.now();
    } else { delete r._lunarTowerFilterTarget; r._towerFilterOpacity = 0; r._towerFilterLastMs = performance.now(); }
    return true;
  };
  // 噪声纹理读回（各上下文:FBO attach→readPixels 16px 角+中心）
  window.__noiseReadback = () => {
    const out = {};
    const grab = (gl, tex, label) => {
      if (!gl || !tex) { out[label] = null; return; }
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const px = new Uint8Array(4 * 8);
      gl.readPixels(0, 0, 8, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const px2 = new Uint8Array(4 * 8);
      gl.readPixels(124, 124, 8, 1, gl.RGBA, gl.UNSIGNED_BYTE, px2);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      out[label] = { corner: Array.from(px.slice(0, 16)), mid: Array.from(px2.slice(0, 16)) };
    };
    const sfx = r.screenFx;
    grab(sfx.gl, sfx.texNoise, 'old');
    const pipe = r.worldCompose?.pipeline ?? null;
    if (pipe?.glx) grab(pipe.glx, sfx.pipeTexNoise, 'pipe');
    return out;
  };
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await pump(page, 120);
await page.evaluate(() => window.__pause(true));
await page.evaluate(() => window.__heat(2));
await waitFrame(30);   // 噪声图就绪窗

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
async function snap() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    return Array.from(lx.getImageData(0, 0, lc.width, lc.height).data);
  });
}

await page.evaluate(() => window.__sfxSet(false));
await waitFrame(4);
const A = await snap();
await page.evaluate(() => window.__sfxSet(true));
await waitFrame(4);
const B = await snap();
console.log('[路径]', await page.evaluate(() => ({
  used: window.__swGame.renderer.sfxPathUsed,
  A_draws: window.__swGPULog.snapshot().ctxs['screenFx']?.frameDraws,
})));
// 基线（无滤镜帧——poke 清除 → 早退 → 主画布未经链）
await page.evaluate(() => window.__heat(0));
await waitFrame(4);
const BASE = await snap();
await page.evaluate(() => window.__heat(2));
const W = 1280, H = 800;
const eqc = (P, Q) => { let n = 0; for (let i = 0; i < P.length; i += 4) { if (P[i] === Q[i] && P[i + 1] === Q[i + 1] && P[i + 2] === Q[i + 2]) n++; } return n; };
const TOT = W * H;
console.log(`[基线对照] A==BASE ${eqc(A, BASE)}/${TOT}  B==BASE ${eqc(B, BASE)}/${TOT}`);
// 高差区 8×8 补丁数值（y=420,x=640）
const patch = (P) => {
  const out = [];
  for (let y = 420; y < 424; y++) { const row = []; for (let x = 640; x < 644; x++) { const i = (y * W + x) * 4; row.push(P[i]); } out.push(row.join(',')); }
  return out.join(' | ');
};
console.log('[补丁A]', patch(A));
console.log('[补丁B]', patch(B));
console.log('[补丁BASE]', patch(BASE));

const noise = await page.evaluate(() => window.__noiseReadback());
console.log('[噪声读回]', JSON.stringify(noise));
const same = noise.old && noise.pipe
  && JSON.stringify(noise.old.corner) === JSON.stringify(noise.pipe.corner)
  && JSON.stringify(noise.old.mid) === JSON.stringify(noise.pipe.mid);
console.log('[噪声读回] 两上下文逐字节同:', same);

// 全幅噪声 diff + 双程序 uniform 实值
const deep = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const sfx = r.screenFx;
  const out = {};
  const readAll = (gl, tex) => {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const px = new Uint8Array(256 * 256 * 4);
    gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    return px;
  };
  const pipe = r.worldCompose?.pipeline;
  if (sfx.gl && sfx.texNoise && pipe?.glx && sfx.pipeTexNoise) {
    const a = readAll(sfx.gl, sfx.texNoise);
    const b = readAll(pipe.glx, sfx.pipeTexNoise);
    let n = 0, maxd = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) { n++; if (d > maxd) maxd = d; } }
    out.noiseDiff = { n, maxd };
  }
  // uniform 实值（heat 程序:旧链 this.progs / 管线 pipeProgHandles）
  const dumpUni = (gl, prog, names) => {
    if (!gl || !prog) return null;
    gl.useProgram(prog);
    const o = {};
    for (const nm of names) {
      const loc = gl.getUniformLocation(prog, nm);
      if (!loc) continue;
      const v = gl.getUniform(prog, loc);
      o[nm] = Array.isArray(v) ? Array.from(v) : v;
    }
    return o;
  };
  const NAMES = ['uScreenRes', 'uScreenPos', 'uNoiseRcp', 'uTimeScroll', 'uOffset', 'uTint'];
  const g = window.__swGame;
  window.__sfxSet(true);
  for (let i = 0; i < 3; i++) { window.__vnow = (window.__vnow || performance.now()) + 16.6667; g.frame(window.__vnow); }
  const oldEntry = sfx.progs?.get?.('FilterHeatDistortion');
  out.oldUni = dumpUni(sfx.gl, oldEntry?.prog, NAMES);
  const keys = sfx.pipeProgHandles ? Array.from(sfx.pipeProgHandles.keys()) : [];
  out.pipeKeys = keys;
  const pipeEntry = sfx.pipeProgHandles?.get?.('F:FilterHeatDistortion');
  out.pipeEntryAlive = !!(pipeEntry?.prog);
  out.pipeUni = dumpUni(pipe?.glx, pipeEntry?.prog, NAMES);
  out.samePipeObj = pipe === r.swPipe;
  return out;
});
console.log('[深检]', JSON.stringify(deep));

// ---- 中间跳定位:blood 单 pass vs blood+crt 双 pass（无噪声面）----
async function chainAB(label, spec) {
  await page.evaluate((s) => window.__chain(s), spec);
  await waitFrame(6);
  await page.evaluate(() => window.__sfxSet(true));
  await waitFrame(4);
  const Bc = await snap();
  await page.evaluate(() => window.__sfxSet(false));
  await waitFrame(4);
  const Ac = await snap();
  let n = 0, maxd = 0, bbox = null;
  for (let i = 0; i < Ac.length; i++) {
    const d = Math.abs(Ac[i] - Bc[i]);
    if (d) { n++; if (d > maxd) maxd = d; if (!bbox) bbox = (i >> 2); }
  }
  console.log(`[${label}] A vs B: n=${n} maxΔ=${maxd} firstPx=${bbox}`);
  return { A: Ac, B: Bc };
}
await chainAB('blood单', { blood: true });
await chainAB('blood+crt双', { blood: true, crt: true });
await chainAB('grave+crt双', { grave: true, crt: true });
await chainAB('crt单', { crt: true });
await chainAB('tower单', { tower: true });
await chainAB('tower+heat', { tower: true, heat: true });
{
  const { A: Ac, B: Bc } = await chainAB('tower+heat复测', { tower: true, heat: true });
  const diffs = [];
  for (let i = 0; i < Ac.length; i++) if (Ac[i] !== Bc[i]) diffs.push(`px${i >> 2}(x${(i >> 2) % 1280},y${(i >> 2) / 1280 | 0},ch${i & 3}) A=${Ac[i]} B=${Bc[i]} Δ=${Math.abs(Ac[i] - Bc[i])}`);
  console.log('[tower+heat明细]', diffs.join('; '));
}
// 稳定性:blood+crt 重跑 3 轮（A/B 翻面顺序交替）——差异字节是否恒定
for (let round = 0; round < 3; round++) {
  const r = await chainAB(`blood+crt第${round + 2}轮`, { blood: true, crt: true });
  const { A: Ac, B: Bc } = r;
  const diffs = [];
  for (let i = 0; i < Ac.length; i++) {
    if (Ac[i] !== Bc[i]) diffs.push(`byte${i}(px${i >> 2},ch${i & 3}) A=${Ac[i]} B=${Bc[i]}`);
  }
  console.log(`[第${round + 2}轮差异明细]`, diffs.length ? diffs.join('; ') : '无');
}

// ---- 判别实验:GTW 钉 0 → uTimeScroll=0 → nA==nB → delta 恒 −0.5（常数移位）——
// 若 A==B:差异在噪声相位面;若 A≠B:差异在常数移位重采样面（源/vUv 映射）----
// tower+heat 版:常数移位下 A≠B ⇒ 中间产物面有差（同 tower单 n=0 矛盾→编译面）;A==B ⇒ 变差场白噪声相位面
// ★中间产物直比:[heat,tower] 链后 old staging=heat 输出（上传为 tower 输入）,
//   pipe FBO('sfxA')=heat 输出（'I:' 编译单元直写）——两中间产物逐字节直比
await page.evaluate(() => window.__pause(true));
const midCmp = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const sfx = r.screenFx;
  const pipe = r.worldCompose?.pipeline;
  const g = window.__swGame;
  const grabOld = () => {
    const st = sfx.staging;
    if (!st) return null;
    const cx = st.getContext('2d', { willReadFrequently: true });
    return Array.from(cx.getImageData(0, 0, st.width, st.height).data);
  };
  const grabPipe = () => {
    if (!pipe?.glx) return null;
    const f = pipe.fbo('sfxA', 1280, 800);
    if (!f?.fbo) return null;
    const gl = pipe.glx;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
    const px = new Uint8Array(1280 * 800 * 4);
    gl.readPixels(0, 0, 1280, 800, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // ★sfx FBO=no-flip 写入（v0=图像顶）→ readPixels row0=图像顶 ≙ getImageData 行序,直比不翻转
    return Array.from(px);
  };
  // A 态:跑一帧 [heat,tower] → staging=heat 输出
  window.__sfxSet(false);
  window.__vnow = (window.__vnow || performance.now()) + 16.6667;
  g.frame(window.__vnow);
  const oldMid = grabOld();
  // B 态:跑一帧 → FBO sfxA=heat 输出（注意 sfxA=pass0 出口仅在奇数长度链成立;
  // [heat,tower] 长度 2 → pass0→sfxA ✓）
  window.__sfxSet(true);
  window.__vnow = (window.__vnow || performance.now()) + 16.6667;
  g.frame(window.__vnow);
  const pipeMid = grabPipe();
  if (!oldMid || !pipeMid) return { ok: false, old: !!oldMid, pipe: !!pipeMid };
  let n = 0, maxd = 0;
  const spots = [];
  for (let i = 0; i < oldMid.length; i++) {
    const d = Math.abs(oldMid[i] - pipeMid[i]);
    if (d) { n++; if (d > maxd) maxd = d; if (spots.length < 6) spots.push(`px${i >> 2} ch${i & 3} old=${oldMid[i]} pipe=${pipeMid[i]}`); }
  }
  return { ok: true, n, maxd, spots };
});
console.log('[中间产物直比 heat]', JSON.stringify(midCmp));
await page.evaluate(() => import('/src/core/GameTime.ts').then((m) => m.pinGameTimeTicks(0)));
await page.evaluate(() => window.__sfxSet(true));
await waitFrame(4);
const B0 = await snap();
await page.evaluate(() => window.__sfxSet(false));
await waitFrame(4);
const A0 = await snap();
{
  let n = 0, maxd = 0;
  for (let i = 0; i < A0.length; i++) { const d = Math.abs(A0[i] - B0[i]); if (d) { n++; if (d > maxd) maxd = d; } }
  console.log(`[scroll0] A vs B: n=${n} maxΔ=${maxd}  ${n === 0 ? '→ 差异在噪声相位面(不可能:内容已证等)' : '→ 差异在常数移位重采样面'}`);
}

// 行差分剖面（每行差异数）→ 边界行
const rowDiff = [];
for (let y = 0; y < H; y += 40) {
  let n = 0;
  for (let y2 = y; y2 < Math.min(y + 40, H); y2++) {
    for (let x = 0; x < W; x++) {
      const i = (y2 * W + x) * 4;
      if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++;
    }
  }
  rowDiff.push([y, n]);
}
console.log('[行差分] y→diff数(40行窗):', JSON.stringify(rowDiff));
// B 是否=A 垂直翻转?（抽 3 行对照）
for (const y of [100, 300, 500]) {
  const fy = H - 1 - y;
  let eqFlip = 0, eqDirect = 0;
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, j = (fy * W + x) * 4;
    if (A[i] === B[j] && A[i + 1] === B[j + 1] && A[i + 2] === B[j + 2]) eqFlip++;
    if (A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2]) eqDirect++;
  }
  console.log(`[行${y}] A==B直接:${eqDirect}/${W}  A(r)==B(翻${fy}):${eqFlip}/${W}`);
}
// 差异幅度分布（heat 子像素位移特征=小Δ;内容不同=大Δ）
const hist = [0, 0, 0, 0, 0];
for (let i = 0; i < A.length; i += 4) {
  const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
  hist[d === 0 ? 0 : d <= 4 ? 1 : d <= 30 ? 2 : d <= 120 ? 3 : 4]++;
}
console.log('[Δ分布] =0:≤4:≤30:≤120:>120 =', JSON.stringify(hist));
// GTW 值
console.log('[GTW]', await page.evaluate(() => {
  return import('/src/core/GameTime.ts').then((m) => m.globalTimeWrappedHourly());
}));
if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors.slice(0, 4));
await browser.close();
