// ★K1-2b Stack 腿持久纹理上传——活机字节对拍+census+微基准探针（2026-10-04）
// 范式：_k12-stack-ab.mjs 同款（单页+世界出生冻结+塔桩+uTime 钉面+冻结钟）。
// ★活机定谳（2026-10-04）：现 HEAD 的 7x 加算垫底扫尾（c10eCompositeIntoHud,
//   2026-10-03/04 判语）使合成闩每帧为真 → 常规帧链路由走 drawChainPipe(this.canvas)
//   合成档,Stack 档不可达。本探针桩 c10eCompositeIntoHud=no-op（HUD 回 K1-2 语义
//   =覆盖层-only,合成闩恒 false）强置 Stack 档——桩对 ON/OFF 两臂等量施加=插桩中立。
//   A. census：WebGL2 原型包装 texImage2D/texSubImage2D（按源身份 sky/hud 分账,自耗
//      ms 累计）——Stack 稳态期望:tiSky=0∧tiHud=0（旧路径=2 texImage2D/帧）,
//      tsSky=帧数∧tsHud=帧数（两腿每帧 texSubImage2D 原位）。
//   B. 字节读回对拍（冻结态）:
//      ① OLD(texImage2D) vs NEW(texImage2D 分配+texSubImage2D 原位) 同 clone 源同参数
//        （LINEAR+CLAMP+premul=true+FLIP_Y=true）→ temp FBO readPixels 逐位;
//      ② 活机持久槽（screenFx.pipeTexStackSky/pipeTexHud）vs OLD 新传同 clone → 逐位;
//      ③ resize 重分配路径（半尺寸 clone）同①。
//   C. 整帧 A/B:ON(强置 Stack)=drawChainPipeStack vs OFF(?c10ek1=0 折叠链源) 冻结态
//      整帧逐字节（PA 口径——porter-duff over 结合律,单层覆盖期望 n=0）。
//   D. 微基准:同上下文/同 clone 画布,texImage2D vs texSubImage2D 每调自耗
//      （墙钟+gl.finish 强制完成双口径——headless GPU 上下文 DOM 上传异步提交,
//      墙钟只测提交段,finish 口径含 GPU 拷贝段）。
// 运行:SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=280000 scripts/_k12-persist-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const dec64 = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
function diffB64(x, y) {
  const P = dec64(x), Q = dec64(y);
  const W = 1280;
  let n = 0, maxd = 0, hist = {};
  for (let i = 0; i < P.length; i += 4) {
    const dd = Math.max(Math.abs(P[i]-Q[i]), Math.abs(P[i+1]-Q[i+1]), Math.abs(P[i+2]-Q[i+2]));
    if (dd > 0) { n++; maxd = Math.max(maxd, dd); hist[dd] = (hist[dd] || 0) + 1; }
  }
  return { n, maxd, hist };
}

const ARM_TOWER = `(() => {
  const r = window.__swGame.renderer;
  if (!window.__origTow) {
    window.__origTow = r._lunarTowerFilterTargets.bind(r);
    r._lunarTowerFilterTargets = () => {
      const p = window.__swGame.player;
      return { solar: { x: p.cx, y: p.cy - 40, ai3: 120, shieldUp: true } };
    };
  }
  r._towerFilterOpacity = { solar: 1, vortex: 1, nebula: 1, stardust: 1 };
  return 'armed';
})()`;
// ★强置 Stack 档:桩合成垫底（合成闩不再置真——HUD 回覆盖层-only;两臂等量施加）
const ARM_STACK = `(() => {
  const r = window.__swGame.renderer;
  if (!window.__origComp) { window.__origComp = r.c10eCompositeIntoHud.bind(r); r.c10eCompositeIntoHud = () => {}; }
  return 'stack-armed';
})()`;
const K1 = (v) => `(() => { window.__swGame.renderer.constructor.c10eK1SetForTest(${v}); return 'k1=' + ${v}; })()`;

const INSTALL = `(() => {
  const r = window.__swGame.renderer;
  if (window.__persistCensus) return 'already';
  window.__persistCensus = { tiSky: 0, tiHud: 0, tiOther: 0, tsSky: 0, tsHud: 0, tsOther: 0,
    tiMsSky: 0, tiMsHud: 0, tsMsSky: 0, tsMsHud: 0, tiMsOther: 0, rawTi: 0, rawTs: 0 };
  const P = WebGL2RenderingContext.prototype;
  const tag = (src) => src === r.skyCanvas ? 'Sky' : src === r.canvas ? 'Hud' : (src && src.width !== undefined ? 'Other' : 'Alloc');
  for (const [name, cnt, msKey] of [['texImage2D', 'ti', 'tiMs'], ['texSubImage2D', 'ts', 'tsMs']]) {
    const orig = P[name];
    P[name] = function (...a) {
      const t0 = performance.now();
      const ret = orig.apply(this, a);
      const dt = performance.now() - t0;
      const c = window.__persistCensus;
      c[name === 'texImage2D' ? 'rawTi' : 'rawTs']++;
      const t = tag(a[a.length - 1]);
      if (t !== 'Alloc') { c[cnt + t]++; c[msKey + t] += dt; }
      return ret;
    };
  }
  // ★uTime 钉面（插桩中立:两臂等量施加）——passes time 统一钉常数;
  //   Stack 包装器随帧抢 HUD-so-far 快照（HUD 槽读回对拍源——链输出回写 r.canvas 前的输入态）
  const sfx = r.screenFx;
  const pin = (passes) => passes.map((p) => ({ ...p, time: 1234.5 }));
  if (sfx.drawChainPipeStack) {
    const o = sfx.drawChainPipeStack.bind(sfx);
    sfx.drawChainPipeStack = (pipe, src, passes, tint) => {
      const c = document.createElement('canvas'); c.width = src.hud.width; c.height = src.hud.height;
      c.getContext('2d').drawImage(src.hud, 0, 0);
      window.__hudSoFar = c;
      return o(pipe, src, pin(passes), tint);
    };
  }
  if (sfx.drawChainPipe) { const o = sfx.drawChainPipe.bind(sfx); sfx.drawChainPipe = (pipe, src, passes, tint) => o(pipe, src, pin(passes), tint); }
  if (sfx.drawChain) { const o = sfx.drawChain.bind(sfx); sfx.drawChain = (src, passes, tint) => o(src, pin(passes), tint); }
  window.__snapB64 = () => {
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
  // 自检:包装器活着（手动上传计数）
  const c8 = document.createElement('canvas'); c8.width = 4; c8.height = 4;
  const g8 = c8.getContext('webgl2');
  g8.texSubImage2D(g8.TEXTURE_2D, 0, 0, 0, g8.RGBA, g8.UNSIGNED_BYTE, c8);
  window.__wrapSelfCheck = window.__persistCensus.tsOther;
  return 'installed';
})()`;
const RESET_CENSUS = `(() => { const c = window.__persistCensus; for (const k of Object.keys(c)) c[k] = 0; return 'reset'; })()`;
const READ_CENSUS = `(() => window.__persistCensus)()`;
const ROUTE = `(() => { const r = window.__swGame.renderer; return { path: r.sfxPathUsed, comp: r._c10eComposited, stats: r.sfxPathStats }; })()`;

const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
await page.bringToFront().catch(() => {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await bootstrap(page, ORIGIN + '/?c10e=1');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');
await page.evaluate(() => {
  const g = window.__swGame; const r = g.renderer; const sky = r.sky;
  g.paused = true;
  try { const w = g.world.weather; if (w) { w.cloudAlpha = 0; w.maxRaining = 0; w.raining = false; w.lightning = 0; } } catch {}
  try { const fx = r.weatherFx; if (fx) fx.update = () => {}; } catch {}
  g.lighting.clock.tick = () => {};
  sky.ambEntities.length = 0; sky.ambNextAttempt = 1000000; sky.pendingAmbientSpawns.length = 0;
  sky.maintainClouds = () => {}; sky.updateClouds = () => {};
  sky.vclouds = [
    { type: 1, x: 180, y: 60, scale: 0.9, alpha: 1, rot: 0, flip: false },
    { type: 3, x: 1050, y: 50, scale: 0.8, alpha: 0.85, rot: 0, flip: false },
    { type: 0, x: 420, y: 130, scale: 1.25, alpha: 1, rot: 0, flip: false },
  ];
  for (const st of sky.stars) { st.falling = false; st.hidden = false; }
  Object.defineProperty(r, 'animTick', { get: () => 7777, set: () => {}, configurable: true });
});
await freezeClock(page, { tod: 0.5 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => {
  const r = window.__swGame?.renderer;
  return !!(r && typeof r._lunarTowerFilterTargets === 'function' && r.screenFx && r.skyCanvas);
}, { timeout: 30000 });
await page.evaluate(ARM_TOWER);
await page.evaluate(ARM_STACK);
await page.evaluate(INSTALL);
chk('census 包装器自检（手动上传计数=1）', (await page.evaluate(() => window.__wrapSelfCheck)) === 1, `self=${JSON.stringify(await page.evaluate(() => window.__wrapSelfCheck))}`);

async function waitFrames(frames, tag = '') {
  const was = await page.evaluate(() => window.__swGame._paintedFrames);
  const t0 = Date.now();
  for (;;) {
    const now = await page.evaluate(() => window.__swGame._paintedFrames);
    if (now >= was + frames) return now - was;
    if (Date.now() - t0 > 15000) {
      const ev = errs.slice(0, 3).join(' | ');
      throw new Error(`waitFrames timeout [${tag}] was=${was} now=${now}${ev ? ' errs=' + ev : ''}`);
    }
    await new Promise((r) => setTimeout(r, 60));
  }
}

// ---- C. 整帧 A/B+census:ON(强置 Stack) vs OFF(K1=0 折叠) ----
await page.evaluate(K1(true));
await waitFrames(20, 'warmup-on');
const routeOn = await page.evaluate(ROUTE);
chk('[C] ON 强置 Stack 档在（path=pipe-stack∧合成闩 false）', routeOn.path === 'pipe-stack' && routeOn.comp === false, JSON.stringify(routeOn));
await page.evaluate(RESET_CENSUS);
const framesOn = await waitFrames(60, 'census-on');
const cen = await page.evaluate(READ_CENSUS);
const pf = (x) => (x / framesOn).toFixed(3);
console.log(`CENSUS  n=${framesOn} 帧  texImage2D/帧: sky=${pf(cen.tiSky)} hud=${pf(cen.tiHud)} other=${pf(cen.tiOther)} raw=${pf(cen.rawTi)}  texSubImage2D/帧: sky=${pf(cen.tsSky)} hud=${pf(cen.tsHud)} other=${pf(cen.tsOther)} raw=${pf(cen.rawTs)}`);
console.log(`CENSUS  自耗 ms/帧: tiSky=${pf(cen.tiMsSky)} tiHud=${pf(cen.tiMsHud)} tsSky=${pf(cen.tsMsSky)} tsHud=${pf(cen.tsMsHud)}`);
chk('[A] 稳态 Stack 滤镜帧 sky/hud 腿零 texImage2D（旧路径=2/帧）', cen.tiSky === 0 && cen.tiHud === 0, `tiSky=${cen.tiSky} tiHud=${cen.tiHud}`);
chk('[A] 两腿每帧 texSubImage2D 原位更新', Math.abs(cen.tsSky - framesOn) <= 1 && Math.abs(cen.tsHud - framesOn) <= 1, `tsSky=${cen.tsSky} tsHud=${cen.tsHud} n=${framesOn}`);
const snapOn = await page.evaluate(() => window.__snapB64());

await page.evaluate(K1(false));
await waitFrames(20, 'warmup-off');
const routeOff = await page.evaluate(ROUTE);
chk('[C] OFF=折叠档在（path=pipe;合成桩中立两臂同态）', routeOff.path === 'pipe', JSON.stringify(routeOff));
await waitFrames(30, 'off-settle');
const snapOff = await page.evaluate(() => window.__snapB64());
const dC = diffB64(snapOn, snapOff);
chk('[C] 整帧 ON(Stack 持久槽)-vs-OFF(折叠) 冻结态逐字节', dC.n === 0, `n=${dC.n} maxΔ=${dC.maxd} hist=${JSON.stringify(dC.hist)}`);

// ---- B. 字节读回对拍（回到 ON 态;冻结态 clone 快照源） ----
await page.evaluate(K1(true));
await waitFrames(10, 'back-on');
const exp = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const pipe = r.swPipe, sfx = r.screenFx;
  if (!pipe?.glx || !sfx) return { why: 'no pipe/sfx' };
  const gl = pipe.glx;
  const clone = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };
  const skyC = clone(r.skyCanvas), hudC = window.__hudSoFar ?? clone(r.canvas);
  const W = skyC.width, H = skyC.height;
  const newTex = () => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const oldUpload = (src) => {   // 旧路径逐字面:texImage2D 全幅
    const t = newTex();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    return t;
  };
  const newUpload = (src) => {   // 新路径:texImage2D 分配+texSubImage2D 原位（同源同参数）
    const t = newTex();
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    return t;
  };
  const readTex = (tex, w, h) => {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return px;
  };
  const diff = (a, b) => {
    let n = 0, maxd = 0;
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > 0) { n++; if (d > maxd) maxd = d; } }
    return { n, maxd };
  };
  const out = { W, H };
  {
    const o = oldUpload(skyC), nw = newUpload(skyC);
    out.skyNewVsOld = diff(readTex(o, W, H), readTex(nw, W, H));
    gl.deleteTexture(o); gl.deleteTexture(nw);
  }
  {
    const o = oldUpload(hudC), nw = newUpload(hudC);
    out.hudNewVsOld = diff(readTex(o, W, H), readTex(nw, W, H));
    gl.deleteTexture(o); gl.deleteTexture(nw);
  }
  const slotSky = sfx.pipeTexStackSky, slotHud = sfx.pipeTexHud;
  out.slotSkyPresent = !!slotSky; out.slotHudPresent = !!slotHud;
  if (slotSky) {
    const o = oldUpload(skyC);
    out.slotSkyVsOld = diff(readTex(o, W, H), readTex(slotSky, W, H));
    gl.deleteTexture(o);
  }
  if (slotHud) {
    const o = oldUpload(hudC);
    out.slotHudVsOld = diff(readTex(o, W, H), readTex(slotHud, W, H));
    gl.deleteTexture(o);
  }
  {
    const sw = document.createElement('canvas'); sw.width = W >> 1; sw.height = H >> 1;
    sw.getContext('2d').drawImage(skyC, 0, 0, sw.width, sw.height);
    const o = oldUpload(sw), nw = newUpload(sw);
    out.smallNewVsOld = diff(readTex(o, sw.width, sw.height), readTex(nw, sw.width, sw.height));
    gl.deleteTexture(o); gl.deleteTexture(nw);
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  return out;
});
console.log('EXP  ' + JSON.stringify(exp));
chk('[B] sky 腿 NEW(texSubImage2D 原位) vs OLD(texImage2D) 逐位', exp.skyNewVsOld?.n === 0, `n=${exp.skyNewVsOld?.n} maxΔ=${exp.skyNewVsOld?.maxd}`);
chk('[B] HUD 腿 NEW vs OLD 逐位（含 α 域预乘）', exp.hudNewVsOld?.n === 0, `n=${exp.hudNewVsOld?.n} maxΔ=${exp.hudNewVsOld?.maxd}`);
chk('[B] 活机 sky 持久槽字节=OLD 新传', exp.slotSkyPresent && exp.slotSkyVsOld?.n === 0, `present=${exp.slotSkyPresent} n=${exp.slotSkyVsOld?.n} maxΔ=${exp.slotSkyVsOld?.maxd}`);
chk('[B] 活机 HUD 持久槽字节=OLD 新传', exp.slotHudPresent && exp.slotHudVsOld?.n === 0, `present=${exp.slotHudPresent} n=${exp.slotHudVsOld?.n} maxΔ=${exp.slotHudVsOld?.maxd}`);
chk('[B] resize 重分配路径逐位', exp.smallNewVsOld?.n === 0, `n=${exp.smallNewVsOld?.n} maxΔ=${exp.smallNewVsOld?.maxd}`);

// ---- D. 微基准:同上下文/同 clone,墙钟+finish 强制双口径 ----
const bench = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const gl = r.swPipe.glx;
  const clone = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  };
  const skyC = clone(r.skyCanvas), hudC = window.__hudSoFar ?? clone(r.canvas);
  const W = skyC.width, H = skyC.height;
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const REPS = 60;
  const tOld = gl.createTexture(), tNew = gl.createTexture();
  for (const t of [tOld, tNew]) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skyC);
  }
  const stat = (xs) => { xs.sort((a, b) => a - b); return { p50: xs[REPS >> 1], mean: xs.reduce((x, y) => x + y, 0) / REPS }; };
  const bench1 = (fn, src, finish) => {
    const xs = [];
    for (let i = 0; i < REPS; i++) {
      const t0 = performance.now();
      fn(src);
      if (finish) gl.finish();
      xs.push(performance.now() - t0);
    }
    return stat(xs);
  };
  const ti = (src) => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tOld); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); };
  const ts = (src) => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tNew); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src); };
  bench1(ti, skyC, true); bench1(ts, skyC, true);   // 热身
  const out = {
    skyTI: bench1(ti, skyC, false), skyTS: bench1(ts, skyC, false),
    hudTI: bench1(ti, hudC, false), hudTS: bench1(ts, hudC, false),
    skyTIf: bench1(ti, skyC, true), skyTSf: bench1(ts, skyC, true),
    hudTIf: bench1(ti, hudC, true), hudTSf: bench1(ts, hudC, true),
  };
  gl.deleteTexture(tOld); gl.deleteTexture(tNew);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  return { W, H, REPS, detail: out };
});
const b = bench.detail;
const fmt = (s) => s.mean.toFixed(3);
console.log(`BENCH  ${bench.W}×${bench.H} n=${bench.REPS}  墙钟/调: sky TI=${fmt(b.skyTI)} TS=${fmt(b.skyTS)}  hud TI=${fmt(b.hudTI)} TS=${fmt(b.hudTS)} ms`);
console.log(`BENCH  finish 口径/调: sky TI=${fmt(b.skyTIf)} TS=${fmt(b.skyTSf)}  hud TI=${fmt(b.hudTIf)} TS=${fmt(b.hudTSf)} ms`);
const oldF = fmt(b.skyTIf) * 2, newF = fmt(b.skyTSf) * 2;
console.log(`BENCH  每帧两腿(finish 口径): 旧=${(b.skyTIf.mean + b.hudTIf.mean).toFixed(3)}ms  新=${(b.skyTSf.mean + b.hudTSf.mean).toFixed(3)}ms  差=${((b.skyTIf.mean + b.hudTIf.mean) - (b.skyTSf.mean + b.hudTSf.mean)).toFixed(3)}ms/帧`);
void oldF; void newF;

// ---- D2. CPU-backed 源画布（willReadFrequently=readback 路径,贴近真机 trace 的
//      主线程自耗形态——GPU 画布源=异步 GPU-GPU 拷贝,墙钟只含提交段）----
const bench2 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const gl = r.swPipe.glx;
  const cloneCpu = (src) => {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d', { willReadFrequently: true }).drawImage(src, 0, 0);
    return c;
  };
  const skyC = cloneCpu(r.skyCanvas), hudC = window.__hudSoFar ? cloneCpu(window.__hudSoFar) : cloneCpu(r.canvas);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const REPS = 60;
  const tOld = gl.createTexture(), tNew = gl.createTexture();
  for (const t of [tOld, tNew]) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skyC);
  }
  const stat = (xs) => { xs.sort((a, b) => a - b); return { p50: xs[REPS >> 1], mean: xs.reduce((x, y) => x + y, 0) / REPS }; };
  const bench1 = (fn, src) => {
    const xs = [];
    for (let i = 0; i < REPS; i++) { const t0 = performance.now(); fn(src); xs.push(performance.now() - t0); }
    return stat(xs);
  };
  const ti = (src) => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tOld); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); };
  const ts = (src) => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tNew); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src); };
  bench1(ti, skyC); bench1(ts, skyC);
  const out = { skyTI: bench1(ti, skyC), skyTS: bench1(ts, skyC), hudTI: bench1(ti, hudC), hudTS: bench1(ts, hudC) };
  gl.deleteTexture(tOld); gl.deleteTexture(tNew);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  return { W: skyC.width, H: skyC.height, REPS, detail: out };
});
const b2 = bench2.detail;
console.log(`BENCH2 CPU源 ${bench2.W}×${bench2.H} n=${bench2.REPS}  旧路径 TI: sky p50=${b2.skyTI.p50.toFixed(3)} mean=${fmt(b2.skyTI)}  hud p50=${b2.hudTI.p50.toFixed(3)} mean=${fmt(b2.hudTI)} ms/调`);
console.log(`BENCH2 CPU源 新路径 TS: sky p50=${b2.skyTS.p50.toFixed(3)} mean=${fmt(b2.skyTS)}  hud p50=${b2.hudTS.p50.toFixed(3)} mean=${fmt(b2.hudTS)} ms/调`);
console.log(`BENCH2 每帧两腿: 旧=${(b2.skyTI.mean + b2.hudTI.mean).toFixed(3)}ms  新=${(b2.skyTS.mean + b2.hudTS.mean).toFixed(3)}ms  省=${((b2.skyTI.mean + b2.hudTI.mean) - (b2.skyTS.mean + b2.hudTS.mean)).toFixed(3)}ms/帧（60fps≈${(((b2.skyTI.mean + b2.hudTI.mean) - (b2.skyTS.mean + b2.hudTS.mean)) * 60).toFixed(1)}ms/s）`);

writeFileSync('/tmp/k12-persist-results.json', JSON.stringify({ results, errs, cen, exp, bench }, null, 2));
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} PASS${errs.length ? '  页错误:' + errs.slice(0, 3).join(' | ') : ''}`);
process.exit(fails ? 1 : 0);
