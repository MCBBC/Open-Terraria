// BJ76 一次性诊断:GL 扭曲管线活性正对照——同相机、progress 大幅改写,水带 vs 干带
// 差分（gate=1 的水带必须显著差分;gate=0 的干带必须≈0）;另读 fg 水 canvas α。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  g.paused = true;
  const ptx = Math.floor(g.player.x / 16);
  let solidY = Math.floor(g.player.y / 16);
  for (let y = solidY; y < solidY + 60; y++) if (st.isSolid(ptx, y)) { solidY = y; break; }
  const tx = ptx + 6, ty = solidY + 8;
  const W = 20, H = 6, WATER_COLS = 10, WATER_TOP = 2;
  for (let x = tx; x < tx + W; x++) {
    for (let y = ty; y < ty + H; y++) {
      st.setTile(x, y, 0);
      st.setWall(x, y, ((x + y) % 2 === 0) ? 1 : 0);
      if (x < tx + WATER_COLS && y >= ty + WATER_TOP) {
        const i = st.idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 1;
      }
    }
  }
  g.player.x = (tx - 5) * 16 + 8 - g.player.w / 2;
  g.player.vx = 0; g.player.vy = 0;
  return { tx, ty, surfaceWorldY: (ty + 2) * 16 };
});
const pump = (n) => page.evaluate((n) => new Promise((res) => {
  let k = 0; const f = () => (k++ >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f);
}), n);
await pump(40);
const out = await page.evaluate(async (setup) => {
  const g = window.__swGame;
  const WW = await import('/src/render/WaterWaves.ts');
  const w = WW.waterWaves;
  const c = g.world.clock; c.tick = () => {}; c.timeOfDay = 0.5;
  w.frame = () => {};
  const store = window.__bj76 = { caps: [] };
  const cv = [...document.querySelectorAll('canvas')].filter((x) => !x.classList.contains('sw-credits')).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  store.cap = () => {
    const off = document.createElement('canvas');
    off.width = cv.width; off.height = cv.height;
    const c2 = off.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    store.caps.push({ cam: [g.camera.x, g.camera.y], zoom: g.camera.zoom, devW: cv.width, devH: cv.height,
      data: c2.getImageData(0, 0, cv.width, cv.height).data });
    return store.caps.length - 1;
  };
  store.band = (surfaceWorldY, txCols) => {
    const camL = g.camera.x - cv.width / 2, camT = g.camera.y - cv.height / 2;
    const y0 = Math.round((surfaceWorldY - camT)) - 8;
    return { y0, y1: y0 + 16, x0: Math.round(txCols[0] * 16 - camL), x1: Math.round(txCols[1] * 16 - camL) };
  };
  store.diff = (ia, ib, b) => {
    const A = store.caps[ia], B = store.caps[ib];
    let sum = 0, n = 0;
    for (let y = b.y0; y < b.y1; y++) for (let x = b.x0; x < b.x1; x++) {
      const o = (y * A.devW + x) * 4;
      sum += Math.abs(B.data[o] - A.data[o]) + Math.abs(B.data[o + 1] - A.data[o + 1]) + Math.abs(B.data[o + 2] - A.data[o + 2]);
      n++;
    }
    return +(sum / (n * 3)).toFixed(3);
  };
  // fg 水 canvas α 采样（水半 vs 干半）
  const r = g.renderer;
  const fg = r.waterWarp?.gateCanvas?.();
  let gateA = null;
  if (fg) {
    const off = document.createElement('canvas');
    off.width = fg.width; off.height = fg.height;
    const c2 = off.getContext('2d', { willReadFrequently: true });
    c2.drawImage(fg, 0, 0);
    const d = c2.getImageData(0, 0, fg.width, fg.height).data;
    const camL = g.camera.x - cv.width / 2, camT = g.camera.y - cv.height / 2;
    const sc = fg.width / cv.width;
    const sample = (txc, tyc) => {
      const x = Math.round(((txc * 16 + 8 - camL)) * sc), y = Math.round(((tyc * 16 + 8 - camT)) * sc);
      const o = (y * fg.width + x) * 4;
      return d[o + 3];
    };
    gateA = { water: [sample(setup.tx + 5, setup.ty + 3), sample(setup.tx + 7, setup.ty + 4)],
      dry: [sample(setup.tx + 12, setup.ty + 3), sample(setup.tx + 14, setup.ty + 4)] };
  }
  // 进度改写正对照
  const raf = (n) => new Promise((res) => { let k = 0; const f = () => (k++ >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  const bw = store.band(setup.surfaceWorldY, [setup.tx + 5, setup.tx + 8]);
  const bd = store.band(setup.surfaceWorldY, [setup.tx + 12, setup.tx + 14]);
  const liquidNowAt = () => g.renderer._liquidNow;
  const LR0 = await import('/src/render/VanillaLiquidRenderer.ts');
  const passes0 = LR0.liquidDebugState().warp.passes;
  const glUnavailable0 = g.renderer.waterWarp.glUnavailable();
  w.progress = 1.0; await raf(3); const lnA = liquidNowAt(); const iA = store.cap();
  w.progress = 41.0; await raf(3); const lnB = liquidNowAt(); const iB = store.cap();   // 0.04·40 = 1.6 uv 滚动
  w.progress = 1.0; await raf(3); const lnA2 = liquidNowAt(); const iA2 = store.cap();
  const passes1 = LR0.liquidDebugState().warp.passes;
  return {
    gateA, bw, bd,
    glLive: { glUnavailable0, passes0, passes1, passesDelta: passes1 - passes0,
      diedAt: g.renderer.waterWarp.gl?.diedAt ?? null,
      unavailable: g.renderer.waterWarp.gl?.unavailable ?? null },
    loopAlive: { lnA: +lnA.toFixed(0), lnB: +lnB.toFixed(0), lnA2: +lnA2.toFixed(0),
      advancing: lnB > lnA && lnA2 > lnB },
    progressEcho: w.progress,
    waveCss: g.renderer._waveCss ? { cssW: g.renderer._waveCss.cssW, cssH: g.renderer._waveCss.cssH, camL: +g.renderer._waveCss.camL.toFixed(1), cssZoom: +g.renderer._waveCss.cssZoom.toFixed(3) } : null,
    waterDiff: store.diff(iA, iB, bw), dryDiff: store.diff(iA, iB, bd),
    waterCtrl: store.diff(iA, iA2, bw), dryCtrl: store.diff(iA, iA2, bd),
    warp: LR0.liquidDebugState().warp, fgSize: fg ? [fg.width, fg.height] : null,
  };
}, setup);
console.log(JSON.stringify(out, null, 1));
await browser.close();
