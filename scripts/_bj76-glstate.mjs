// BJ76 一次性诊断:GL 管线为何 off + 相机跟随行为
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 },
});
const page = await browser.newPage();
page.on('console', (m) => console.log('LOG:', m.text().slice(0, 180)));
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const d1 = await page.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const WW = await import('/src/render/WaterWaves.ts');
  const LR = await import('/src/render/VanillaLiquidRenderer.ts');
  return {
    renderMode: (window.__swOptions ?? g.options)?.data?.renderMode ?? 'n/a',
    cpuRender: r.cpuRender, isCpuRender: r.isCpuRender(),
    cam: [g.camera.x, g.camera.y, g.camera.zoom],
    player: [g.player.x, g.player.y],
    paused: g.paused,
    wave: WW.waterWaves.debug(),
    warp: LR.liquidDebugState().warp,
    glProbe: (() => { try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 'no-webgl'; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)); } catch (e) { return 'err:' + e.message; } })(),
  };
});
console.log('state:', JSON.stringify(d1, null, 1));
// 移动玩家,看相机是否跟
await page.evaluate(() => { const g = window.__swGame; g.player.x += 300; g.player.y -= 20; });
await new Promise((r) => setTimeout(r, 1500));
const d2 = await page.evaluate(() => {
  const g = window.__swGame;
  return { cam: [g.camera.x, g.camera.y], player: [g.player.x, g.player.y], paused: g.paused };
});
console.log('after move:', JSON.stringify(d2));
await browser.close();
