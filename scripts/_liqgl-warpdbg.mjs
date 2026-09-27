// liqgl gate 病灶定位:?liqgl=1 下 obj19 扭曲（水面波动）是否真在跑。
// W1: gate FBO readPixels——水 α 带在 FBO 内的位置 vs 屏幕水带位置（朝向核对）;
// W2: 连帧水线位移——liqgl ON vs OFF 各连拍两帧（真 dt,波场活着）,水线 bbox 内
//     帧间运动像素数（扭曲活着=水线果冻逐帧移动;死=恒等静止）。
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await bootstrap(page, ORIGIN + '/');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', gen?.ok);
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const px = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel);
  const x0 = px - 40, x1 = px + 40, ry = gy + 2, depth = 5;
  for (let x = x0 - 8; x <= x1 + 8; x++) for (let y = ry - 10; y <= ry + depth + 8; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  const BRICK = window.__swTiles?.['gray_brick'] ?? 1;
  for (let x = x0; x <= x1; x++) { st.setTile(x, ry + depth, BRICK); st.setTile(x, ry + depth + 1, BRICK); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, BRICK); st.setTile(x1 + 1, y, BRICK); }
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 4);
  g.player.x = (x1 + 6) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
});
await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__vlMod = m; }));
await page.evaluate(() => { window.__vlMod.liqglSetForTest(true); });
// compose 包裹:ok 面+water 入参型
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__composeLog = [];
  const tryWrap = () => {
    if (!r.worldCompose || !r.worldCompose.acquire) { setTimeout(tryWrap, 500); return; }
    const origAcquire = r.worldCompose.acquire.bind(r.worldCompose);
    r.worldCompose.acquire = function () {
      const wc = origAcquire();
      if (wc && !wc.__wrapped) {
        const orig = wc.compose.bind(wc);
        wc.compose = function (world, light, lr, ds, lb, water, ...rest) {
          const ok = orig(world, light, lr, ds, lb, water, ...rest);
          window.__composeLog.push({ ok, waterKind: water ? (water.tex ? 'fbo-handle' : 'canvas') : 'null', wH: !!r._liqGateHandle });
          if (window.__composeLog.length > 6) window.__composeLog.shift();
          return ok;
        };
        wc.__wrapped = true;
      }
      return wc;
    };
  };
  tryWrap();
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__drive(20));
await page.evaluate(() => { const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
await page.evaluate(() => window.__drive(5));

// W1: gate FBO 内容（readPixels α 行剖面）
const w1 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const glw = r._accGlw;
  if (!glw) return { why: 'no accGlw' };
  const pipe = glw.pipe;
  const f = pipe?.fbos?.get?.('liqgate');
  if (!f || !f.fbo) return { why: 'no liqgate fbo', pipeNames: pipe ? [...pipe.fbos.keys()] : null };
  const gl = pipe.glx;
  gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
  const W = f.w, H = f.h;
  // 抽 5 行（0%/25%/50%/75%/100% 高）的 α 剖面（每 16px 采样）
  const rows = [];
  for (const fy of [0, 0.25, 0.5, 0.75, 0.999]) {
    const y = Math.min(H - 1, Math.floor(fy * H));
    const buf = new Uint8Array(W * 4);
    gl.readPixels(0, y, W, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let hi = 0, lo = W, sum = 0, n = 0;
    for (let x = 0; x < W; x++) {
      const a = buf[x * 4 + 3];
      if (a > 10) { hi = Math.max(hi, x); lo = Math.min(lo, x); sum += a; n++; }
    }
    rows.push({ y, glRowAlphaSpan: n ? [lo, hi] : null, meanA: n ? +(sum / n).toFixed(1) : 0 });
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { W, H, rows, handle: !!r._liqGateHandle };
});
console.log('W1 gate FBO α 剖面（GL row0=FBO 底）:', JSON.stringify(w1));

// W1c: 水下静区帧间运动（扭曲判别器——水体内部砖墙/贴图静止,唯一运动源=obj19 位移;
//      ON/OFF 双臂都应显著>0;若 ON≈0=扭曲仍死）
const w1c = await page.evaluate(async () => {
  const g = window.__swGame;
  const cam = g.camera, c = g.renderer.canvas;
  const z = cam.zoom;
  const gy = Math.floor(g.world.groundLevel);
  const ry = gy + 2;
  const wy = (ry * 16 - cam.y) * z + c.height / 2;   // 水线屏幕 y
  const y0 = Math.round(wy + 14), y1 = Math.min(c.height - 1, Math.round(wy + 74));
  const x0 = Math.round(c.width * 0.15), x1 = Math.round(c.width * 0.7);
  const snap = () => {
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    return lx.getImageData(0, 0, lc.width, lc.height).data;
  };
  const f1 = snap();
  await new Promise((r2) => setTimeout(r2, 90));
  await new Promise((r2) => requestAnimationFrame(() => { window.__vnow += 16.6667; g.frame(window.__vnow); r2(); }));
  const f2 = snap();
  let moved = 0, maxd = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * c.width + x) * 4;
      const dd = Math.max(Math.abs(f1[i] - f2[i]), Math.abs(f1[i + 1] - f2[i + 1]), Math.abs(f1[i + 2] - f2[i + 2]));
      if (dd > 6) { moved++; maxd = Math.max(maxd, dd); }
    }
  }
  return { band: [x0, y0, x1, y1], moved, maxd };
});
console.log('W1c 水下静区运动（liqgl ON）:', JSON.stringify(w1c));
// A2 compose 路由死因:acquire/unavailable/lastFail/starvedLock
console.log('A2 state:', JSON.stringify(await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__vlMod.liqglSetForTest(true);
  const wc = r.worldCompose ?? null;
  return {
    hasWc: !!wc,
    unavailable: wc?.unavailable ?? null,
    lastFail: wc?.lastFail ?? null,
    starved: (window.__glStats?.starvedLock?.() ?? 'noglobals'),
    wfbo: r.constructor.wfbo,
    cpu: r.isCpuRender(),
  };
})));
console.log('W1b compose log:', JSON.stringify(await page.evaluate(() => window.__composeLog ?? null)));

// 屏幕上水带位置（主画布 α>0 的行剖面,微光水在暗夜里显著）
const w2 = await page.evaluate(() => {
  const c = window.__swGame.renderer.canvas;
  const lc = document.createElement('canvas');
  lc.width = c.width; lc.height = c.height;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  lx.drawImage(c, 0, 0);
  const d = lx.getImageData(0, 0, lc.width, lc.height).data;
  const W = c.width, H = c.height;
  const out = [];
  for (let y = 0; y < H; y += 8) {
    let n = 0;
    for (let x = 0; x < W; x += 4) {
      const i = (y * W + x) * 4;
      if (d[i + 3] > 10) n++;
    }
    if (n > W / 16) out.push(y);
  }
  return { W, H, alphaRows: out.slice(0, 40) };
});
console.log('W2 屏幕不透明行（前 40）:', JSON.stringify(w2));

// W3: 连帧水线运动（真 dt——两帧间隔真实时间,波场推进）ON vs OFF
async function motionProbe() {
  return page.evaluate(async () => {
    const g = window.__swGame;
    const snap = () => {
      const c = g.renderer.canvas;
      const lc = document.createElement('canvas');
      lc.width = c.width; lc.height = c.height;
      const lx = lc.getContext('2d', { willReadFrequently: true });
      lx.drawImage(c, 0, 0);
      return lx.getImageData(0, 0, lc.width, lc.height).data;
    };
    // 水线邻域 bbox（池面上下 32px）——取画面中央横带
    const c = g.renderer.canvas;
    const y0 = Math.max(0, Math.floor(c.height * 0.45)), y1 = Math.min(c.height, Math.floor(c.height * 0.62));
    const x0 = Math.floor(c.width * 0.2), x1 = Math.floor(c.width * 0.8);
    const f1 = snap();
    await new Promise((r2) => requestAnimationFrame(() => { window.__vnow += 16.6667; g.frame(window.__vnow); r2(); }));
    await new Promise((r2) => setTimeout(r2, 60));   // 真实时间推进=波场 dt
    await new Promise((r2) => requestAnimationFrame(() => { window.__vnow += 16.6667; g.frame(window.__vnow); r2(); }));
    const f2 = snap();
    let moved = 0, maxd = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * c.width + x) * 4;
        const dd = Math.max(Math.abs(f1[i] - f2[i]), Math.abs(f1[i + 1] - f2[i + 1]), Math.abs(f1[i + 2] - f2[i + 2]));
        if (dd > 6) { moved++; maxd = Math.max(maxd, dd); }
      }
    }
    return { moved, maxd, band: [x0, y0, x1, y1] };
  });
}
const mOn = await motionProbe();
console.log('W3 liqgl=ON 水线邻域帧间运动:', JSON.stringify(mOn));
const w1cOn = w1c;
await page.evaluate(() => { window.__vlMod.liqglSetForTest(false); });
const mOff = await motionProbe();
console.log('W3 liqgl=OFF 水线邻域帧间运动:', JSON.stringify(mOff));
// W1c-OFF 对照（同 band 重测）
const w1cOff = await page.evaluate(async () => {
  const g = window.__swGame;
  const cam = g.camera, c = g.renderer.canvas;
  const gy = Math.floor(g.world.groundLevel);
  const ry = gy + 2;
  const wy = (ry * 16 - cam.y) * c.height / (c.height) * 0 + (ry * 16 - cam.y) * cam.zoom + c.height / 2;
  const y0 = Math.round(wy + 14), y1 = Math.min(c.height - 1, Math.round(wy + 74));
  const x0 = Math.round(c.width * 0.15), x1 = Math.round(c.width * 0.7);
  const snap = () => {
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    return lx.getImageData(0, 0, lc.width, lc.height).data;
  };
  const f1 = snap();
  await new Promise((r2) => setTimeout(r2, 90));
  await new Promise((r2) => requestAnimationFrame(() => { window.__vnow += 16.6667; g.frame(window.__vnow); r2(); }));
  const f2 = snap();
  let moved = 0, maxd = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * c.width + x) * 4;
      const dd = Math.max(Math.abs(f1[i] - f2[i]), Math.abs(f1[i + 1] - f2[i + 1]), Math.abs(f1[i + 2] - f2[i + 2]));
      if (dd > 6) { moved++; maxd = Math.max(maxd, dd); }
    }
  }
  return { moved, maxd };
});
console.log('W1c 水下静区运动（liqgl OFF 对照）:', JSON.stringify(w1cOff));
console.log('判读: ON.moved 与 OFF.moved 同量级=扭曲两臂皆活;ON≈0=仍死');
console.log('DBG:', JSON.stringify(await page.evaluate(() => (globalThis).__liqDbg ?? null)));
console.log('DBG2:', JSON.stringify(await page.evaluate(() => (globalThis).__liqDbg2 ?? null)));
console.log('probeMod liqgl:', JSON.stringify(await page.evaluate(() => window.__vlMod?.liqgl)));
console.log('location:', JSON.stringify(await page.evaluate(() => location.href)));
console.log('handle:', JSON.stringify(await page.evaluate(() => { const r = window.__swGame.renderer; return { h: !!r._liqGateHandle, acc: r._accMode, path: r.bglPathUsed, glUnavail: r._accGlw?.unavailable ?? null, worldOpen: r._accGlw?.isAccumOpen?.('world') ?? null }; })));
process.exit(0);
