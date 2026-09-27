import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.player, { timeout: 120000 });
// 关 shim（页内静态翻面,免 URL 洗参）
await page.evaluate(() => import('/src/render/Renderer.ts').then((m) => m.Renderer.bglShimSetForTest(false)));
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));
const out = await page.evaluate(async () => {
  const g = window.__swGame; const p = g.player; const r = g.renderer;
  const cam = g.camera;
  const hash32 = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
  p.inv.armor[3] = { id: window.__swFlow.itemByVid(492), stack: 1 };
  p.inv.dye[3] = { id: window.__swFlow.itemByVid(1007), stack: 1 };
  let wingImg = null;
  for (let i = 0; i < 40 && !(wingImg && wingImg.width > 0); i++) { wingImg = r.atlas.ensureVImage('vanilla/Wings_1.png'); if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 50)); }
  try { const w = g.world.weather; if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; } } catch { /* ignore */ }
  await new Promise((res) => setTimeout(res, 300));
  g.input.setVirtualAction('Jump', true);
  const lc = document.createElement('canvas');
  lc.width = 480; lc.height = 320;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  const samples = [];
  const t0 = performance.now();
  let holdY = null, holdX = null, k = 0, lastShot = -1e9;
  const shots = [];
  while (performance.now() - t0 < 5000) {
    await new Promise((res) => requestAnimationFrame(res));
    const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
    if (!flyingNow) continue;
    if (holdY === null) { holdY = p.y; holdX = p.x; }
    p.y = holdY; p.x = holdX; p.vy = -0.5;
    const [sx, sy] = cam.worldToScreen(p.cx, p.y + 8);
    lx.setTransform(1, 0, 0, 1, 0, 0);
    lx.clearRect(0, 0, lc.width, lc.height);
    lx.imageSmoothingEnabled = false;
    lx.drawImage(r.canvas, Math.round(sx - 60), Math.round(sy - 40), 120, 80, 0, 0, 480, 320);
    samples.push(hash32(lx.getImageData(0, 0, 480, 320).data));
    const now = performance.now();
    if (now - lastShot > 420 && k < 4) { lastShot = now; shots.push({ t: Math.round(now - t0), wf: p.wingFrame, png: lc.toDataURL('image/png') }); k++; }
  }
  g.input.setVirtualAction('Jump', false);
  let run = 1, best = 1;
  for (let i = 1; i < samples.length; i++) { if (samples[i] === samples[i - 1]) { run++; if (run > best) best = run; } else run = 1; }
  return { urlSearch: location.search, hashDistinct: new Set(samples).size, maxRun: best, n: samples.length, shots };
});
const fs = await import('node:fs');
fs.mkdirSync('/tmp/wing-shimoff', { recursive: true });
out.shots.forEach((s, i) => fs.writeFileSync(`/tmp/wing-shimoff/shot${i}_t${s.t}_wf${s.wf}.png`, Buffer.from(s.png.split(',')[1], 'base64')));
console.log(JSON.stringify({ urlSearch: out.urlSearch, hashDistinct: out.hashDistinct, maxRun: out.maxRun, n: out.n }, null, 1));
await browser.close();
process.exit(0);
