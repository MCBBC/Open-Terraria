// BJ76 一次性诊断:挂钩游戏内 composite——记录每帧实参(progress/intensity/gridW)
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
  const gl = g.renderer.waterWarp.gl;
  if (!gl) return { fail: 'no-gl-instance' };
  const calls = [];
  const orig = gl.composite.bind(gl);
  gl.composite = function (...args) {
    calls.push({ prog: +args[5].toFixed(2), inten: +args[6].toFixed(2), gw: args[8], gh: args[9],
      sceneW: args[0].width, waterNull: !args[1], waterW: args[1]?.width ?? 0 });
    return orig(...args);
  };
  const raf = (n) => new Promise((res) => { let k = 0; const f = () => (k++ >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  await raf(5);
  const before = { moduleProgress: w.progress, calls: calls.length, last: calls[calls.length - 1] };
  w.progress = 41;
  await raf(5);
  const after = { moduleProgress: w.progress, calls: calls.length, last: calls[calls.length - 1] };
  gl.composite = orig;
  return { before, after, note: 'calls 记录 composite 实参——若 prog 恒等于模块 progress 的旧值/0 → 实参链断' };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
