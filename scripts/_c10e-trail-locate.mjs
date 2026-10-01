// C10e 拖影定位探针:夜幕+走路复现后,对 sky2D/glCanvas/HUD 三画布同区读回,
// 以「红色占比」判别拖影宿主层(R≫G,B 的像素占比——拖影弧=红色巨弧)
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
const FLAG = process.env.TRAIL_MODE === 'base' ? '/?c10e=0&' : process.env.TRAIL_MODE === 'default' ? '?' : '/?c10e=1&';
await bootstrap(page, ORIGIN + FLAG);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
if (process.env.TRAIL_NIGHT === '1') await clockSet(page, 0.05);
await page.evaluate(() => {
  const g = window.__swGame;
  const beat = g.beat;
  if (beat && !beat.__capPin) { beat.__capPin = 1; const o = beat.observeVsync.bind(beat); beat.observeVsync = (n, c) => o(n, 120); }
});
// 三画布同区读回:取天空中带 320×160,下采样 8×8,统计 R-G>40 且 R-B>40 的「红格」数
await page.evaluate(() => {
  // 全宽细条带【原像素】红度(无降采样——细弧在降采样里被背景稀释,判别失效判例)
  const redCells = (src, sx, sy, sw, sh) => {
    try {
      const w = Math.min(sw, 2048);
      const lc = document.createElement('canvas'); lc.width = w; lc.height = 4;
      const c = lc.getContext('2d', { willReadFrequently: true });
      c.imageSmoothingEnabled = false;
      c.drawImage(src, sx, sy, sw, sh, 0, 0, w, 4);
      const d = c.getImageData(0, 0, w, 4).data;
      let red = 0;
      for (let i = 0; i < w * 4; i++) if (d[i * 4] - d[i * 4 + 1] > 40 && d[i * 4] - d[i * 4 + 2] > 40) red++;
      return red;
    } catch { return -1; }
  };
  window.__layerProbe = () => {
    const r = window.__swGame.renderer;
    const p = r.swPipe;
    const glc = p?.canvas;
    const sky = r.skyCanvas, hud = r.canvas;
    // 天空中带(无墙区):视口中央偏上
    const cx = 0, cy = Math.round((glc?.height ?? 0) * 0.40), cw = glc?.width ?? 320, ch = 6;
    return {
      c10e: r._c10eFrame, inter: r._c10eWorldToHud,
      stack: p ? p.screenStack.map((f) => f.name).join('|') : 'n',
      skyRed: sky ? redCells(sky, cx, cy, cw, ch) : -2,
      glRed: glc ? redCells(glc, cx, cy, cw, ch) : -2,
      hudRed: hud ? redCells(hud, cx, cy, cw, ch) : -2,
      cam: Math.round(window.__swGame.camera.x),
    };
  };
});
const out = [];
await page.keyboard.down('KeyD');
for (let t = 1; t <= 20; t++) {
  await new Promise((r) => setTimeout(r, 1000));
  const s = await page.evaluate(() => window.__layerProbe());
  out.push(`t=${t}s ${JSON.stringify(s)}`);
  await page.screenshot({ path: `shots/c10e-trail/locate-t${t}s.png` });
}
await page.keyboard.up('KeyD');
console.log(out.join('\n'));
console.log('errs:', errs.slice(0, 4));
process.exit(0);
