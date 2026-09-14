// BJ76 一次性诊断:双模块实例定谳——composite 实参 vs 探针模块 progress + 调用栈 URL
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
  const WW = await import('/src/render/WaterWaves.ts');
  const w = WW.waterWaves;
  const LR = await import('/src/render/VanillaLiquidRenderer.ts');
  const raf = (n) => new Promise((res) => { let k = 0; const f = () => (k++ >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  // 等 warp 激活
  const p0 = LR.liquidDebugState().warp.passes;
  for (let i = 0; i < 40 && LR.liquidDebugState().warp.passes === p0; i++) await raf(10);
  const glw = g.renderer.waterWarp.gl;
  if (!glw) return { fail: 'no-gl' };
  const recs = [];
  const orig = glw.composite.bind(glw);
  glw.composite = function (...args) {
    recs.push({ argProg: +args[5].toFixed(3), probeModuleProg: +w.progress.toFixed(3),
      same: Math.abs(args[5] - w.progress) < 1e-9,
      stack: new Error().stack.split('\n').slice(1, 5).map((s) => s.trim().slice(0, 110)) });
    return orig(...args);
  };
  await raf(10);
  w.progress = 999;
  await raf(10);
  glw.composite = orig;
  return { recs: recs.slice(0, 2), lastRec: recs[recs.length - 1], n: recs.length };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
