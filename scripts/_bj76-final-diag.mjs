// BJ76 一次性诊断:等待 warp 激活后,挂钩 composite 记录实参 + progress 1 vs 41 像素差分
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  g.paused = true;
  const ptx = Math.floor(g.player.x / 16);
  let solidY = Math.floor(g.player.y / 16);
  for (let y = solidY; y < solidY + 60; y++) if (st.isSolid(ptx, y)) { solidY = y; break; }
  const tx = ptx + 6, ty = solidY + 8;
  for (let x = tx; x < tx + 20; x++) {
    for (let y = ty; y < ty + 6; y++) {
      st.setTile(x, y, 0);
      st.setWall(x, y, ((x + y) % 2 === 0) ? 1 : 0);
      if (x < tx + 10 && y >= ty + 2) { const i = st.idx(x, y); st.liquid[i] = 255; st.liquidType[i] = 1; }
    }
  }
  for (const sx of [[tx + 5, tx + 6], [tx + 12, tx + 13]]) {
    for (let x = sx[0]; x <= sx[1]; x++) for (let y = solidY; y < ty; y++) st.setTile(x, y, 0);
  }
  g.player.x = (tx - 5) * 16 + 8 - g.player.w / 2;
  const WW = await import('/src/render/WaterWaves.ts');
  const w = WW.waterWaves;
  const clock = g.world.clock; clock.tick = () => {}; clock.timeOfDay = 0.5;
  const raf = (n) => new Promise((res) => { let k = 0; const f = () => (k++ >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  await raf(30);
  // 等 warp 激活（passes 前进）
  const LR = await import('/src/render/VanillaLiquidRenderer.ts');
  const dbg = () => LR.liquidDebugState().warp;
  const p0 = dbg().passes;
  for (let i = 0; i < 40 && dbg().passes === p0; i++) await raf(10);
  const warpActive = dbg().passes > p0;
  // 挂钩 composite 实参
  const glw = g.renderer.waterWarp.gl;
  const calls = [];
  if (glw) {
    const orig = glw.composite.bind(glw);
    glw.composite = function (...args) {
      calls.push({ prog: +args[5].toFixed(2), inten: +args[6].toFixed(2), gw: args[8], gh: args[9], waterW: args[1]?.width ?? 0 });
      return orig(...args);
    };
    window.__restoreComposite = () => { glw.composite = orig; };
  }
  // 捕获
  const cv = [...document.querySelectorAll('canvas')].filter((c) => !c.classList.contains('sw-credits')).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const store = window.__bj76x = { caps: [] };
  store.cap = () => {
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    store.caps.push(x.getImageData(0, 0, cv.width, cv.height).data);
    return store.caps.length - 1;
  };
  const camL = g.camera.x - cv.width / 2, camT = g.camera.y - cv.height / 2;
  const band = { y0: Math.round((ty + 2) * 16 - camT) - 8, y1: Math.round((ty + 2) * 16 - camT) + 8,
    x0: Math.round((tx + 5) * 16 - camL), x1: Math.round((tx + 8) * 16 - camL) };
  const diff = (ia, ib) => { const A = store.caps[ia], B = store.caps[ib]; let sum = 0, n = 0, mx = 0;
    for (let y = band.y0; y < band.y1; y++) for (let x = band.x0; x < band.x1; x++) {
      const o = (y * cv.width + x) * 4; const d = Math.abs(A[o] - B[o]);
      sum += d; n++; if (d > mx) mx = d; }
    return { mean: +(sum / n).toFixed(3), max: mx }; };
  w.progress = 1.0; await raf(4); const iA = store.cap();
  w.progress = 41.0; await raf(4); const iB = store.cap();
  w.progress = 1.0; await raf(4); const iA2 = store.cap();
  const res = { warpActive, calls: calls.length, callSample: calls.slice(0, 3), callLast: calls[calls.length - 1],
    band, diffAB: diff(iA, iB), diffCtrl: diff(iA, iA2), noiseReady: glw?.noiseReady, noiseW: glw?.noiseW };
  if (window.__restoreComposite) window.__restoreComposite();
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
