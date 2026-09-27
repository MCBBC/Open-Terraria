// 画布黑屏诊断:世界层尺寸/合成路径/读回计数
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5233';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.evaluate(() => {
  const g = window.__swGame;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
});
await page.evaluate(() => { window.__swGame.running = false; window.__swGame.paused = true; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => window.__drive(30));
const dbg = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const c = r.canvas;
  const lc = document.createElement('canvas');
  lc.width = c.width; lc.height = c.height;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  lx.drawImage(c, 0, 0);
  const d = lx.getImageData(0, 0, lc.width, lc.height).data;
  let nonBlack = 0, samples = 0;
  for (let i = 0; i < d.length; i += 4 * 997) { samples++; if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++; }
  // 世界层画布
  const wc = r.worldCanvas;
  let wcInfo = null;
  if (wc) {
    const l2 = document.createElement('canvas');
    l2.width = wc.width; l2.height = wc.height;
    const x2 = l2.getContext('2d', { willReadFrequently: true });
    x2.drawImage(wc, 0, 0);
    const d2 = x2.getImageData(0, 0, wc.width, wc.height).data;
    let nb2 = 0, s2 = 0;
    for (let i = 0; i < d2.length; i += 4 * 331) { s2++; if (d2[i] + d2[i + 1] + d2[i + 2] > 30) nb2++; }
    wcInfo = { w: wc.width, h: wc.height, nonBlackPct: (nb2 * 100 / s2).toFixed(1) };
  }
  return {
    main: { w: c.width, h: c.height, nonBlackPct: (nonBlack * 100 / samples).toFixed(1) },
    worldCanvas: wcInfo,
    worldLow: [r._worldLowW, r._worldLowH],
    path: r.bglPathUsed,
    accMode: r._accMode,
    cpuRender: r.isCpuRender(),
    bgl: !!r.constructor.bgl,
    viewport: { iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio },
    cam: [window.__swGame.camera.x, window.__swGame.camera.y],
    player: [window.__swGame.player.x, window.__swGame.player.y],
  };
});
console.log(JSON.stringify(dbg, null, 1));
process.exit(0);
