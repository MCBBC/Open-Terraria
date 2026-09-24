// 一次性诊断②：四 canvas 盘点 + 各自中心读回 alpha/rgb
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport } from '../tools/probe/lib/game.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, { errors: [] });
try {
  await bootstrap(page, ORIGIN);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await teleport(page, 6400, 960);
  await new Promise(r => setTimeout(r, 1500));
  const info = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('canvas').forEach((cv, i) => {
      const c2 = document.createElement('canvas');
      const W = 8, H = 8;
      c2.width = W; c2.height = H;
      const cx = c2.getContext('2d', { willReadFrequently: true });
      cx.drawImage(cv, Math.round(cv.width / 2) - 4, Math.round(cv.height / 2) - 4, W, H, 0, 0, W, H);
      const d = cx.getImageData(0, 0, W, H).data;
      let aSum = 0, rSum = 0;
      for (let k = 0; k < d.length; k += 4) { aSum += d[k + 3]; rSum += d[k]; }
      out.push({ i, w: cv.width, h: cv.height, cls: cv.className || cv.id || '(anon)', meanA: aSum / 64, meanR: rSum / 64 });
    });
    const g = window.__swGame;
    return { canvases: out, rendererCanvasIdx: null, cam: { x: g.camera.x, y: g.camera.y } };
  });
  console.log(JSON.stringify(info, null, 1));
} finally { await closeAllBrowsers().catch(() => {}); }
