// C10e 诊断3:手动步进模式(running=false)下的分画布状态取证
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await bootstrap(page, ORIGIN + '/?c10e=1&fx=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
const raf = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const rd = (src) => {
    const lc = document.createElement('canvas'); lc.width = 8; lc.height = 8;
    const c = lc.getContext('2d'); c.drawImage(src, 0, 0, src.width, src.height, 0, 0, 8, 8);
    return [...c.getImageData(0, 0, 8, 8).data.slice(0, 8)].join(',');
  };
  return { path: r.composePathUsed, sky: rd(r.skyCanvas), gl: rd(document.getElementById('sw-c10e-glcanvas')) };
});
console.log('rAF 模式:', JSON.stringify(raf));
await page.evaluate(() => {
  const g = window.__swGame;
  g.running = false;
  window.__step = (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); g.render(); } };
});
await page.evaluate(() => window.__step(5));
const manual = await page.evaluate(() => {
  const g = window.__swGame; const r = g.renderer;
  const rd = (src) => {
    const lc = document.createElement('canvas'); lc.width = 8; lc.height = 8;
    const c = lc.getContext('2d'); c.drawImage(src, 0, 0, src.width, src.height, 0, 0, 8, 8);
    return [...c.getImageData(0, 0, 8, 8).data.slice(0, 8)].join(',');
  };
  const gl = document.getElementById('sw-c10e-glcanvas');
  const out = { path: r.composePathUsed, gpuDegraded: r.gpuDegraded, c10eFrame: r._c10eFrame, worldToHud: r._c10eWorldToHud,
    sky: rd(r.skyCanvas), gl: rd(gl), glShown: gl.style.display, swPipeDead: r.swPipe ? r.swPipe.unavailable : 'null',
    pipeCanvasW: r.swPipe ? r.swPipe.canvas.width : 0, frameW: r.swPipe ? r.swPipe.frameW : 0 };
  return out;
});
console.log('手动步进模式:', JSON.stringify(manual, null, 1));
console.log('errs:', errs.slice(0, 4));
process.exit(0);
