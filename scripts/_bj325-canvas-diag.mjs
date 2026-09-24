// 一次性诊断：canvas 类型/尺寸、worldToScreen 空间、DPR、读回内容
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, { errors: [] });
try {
  await bootstrap(page, ORIGIN);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await new Promise(r => setTimeout(r, 1000));
  const info = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas ?? document.querySelectorAll('canvas')[1];
    const cs = getComputedStyle(cv);
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(400 * 16, 60 * 16);
    return {
      tag: cv.tagName, w: cv.width, h: cv.height, cssW: cs.width, cssH: cs.height,
      dpr: window.devicePixelRatio,
      wts: [sx, sy], zoom: cam.zoom, cam: { x: cam.x, y: cam.y },
      nCanvases: document.querySelectorAll('canvas').length,
      gl: !!cv.getContext('webgl2') || !!cv.getContext('webgl'),
      is2d: !!cv.getContext('2d'),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} finally { await closeAllBrowsers().catch(() => {}); }
