// 一次性诊断③：复现液体探针相机/读回链路,直接报 cam、wts(D 块)、grab 内容
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, godMode, teleport } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, { errors: [] });
try {
  await bootstrap(page, ORIGIN);
  await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
  await godMode(page, true);
  await freezeClock(page, { tod: 270 });
  await teleport(page, 400 * 16, 60 * 16);
  const scene = await page.evaluate(() => {
    const g = window.__swGame;
    g.paused = true;
    const st = g.world.store;
    const STONE = 2;
    const set = (x, y, t, liquid = 0, slope = 0, half = 0) => {
      const i = st.idx(x, y);
      st.type[i] = t; st.flags[i] = t ? 1 : 0;
      st.liquid[i] = liquid; st.liquidType[i] = liquid > 0 ? 1 : 0;
      st.slope[i] = slope; st.half[i] = half; st.wall[i] = 0;
    };
    set(420, 60, STONE, 0, 2); set(419, 60, 0, 255); set(420, 59, STONE, 0, 0, 1);
    return true;
  });
  await teleport(page, 417 * 16, 60 * 16 + 8);
  await new Promise(r => setTimeout(r, 600));
  const dbg = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas;
    const cam = g.camera;
    const [sx, sy] = cam.worldToScreen(420 * 16, 60 * 16);
    const c2 = document.createElement('canvas');
    c2.width = 16; c2.height = 16;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, Math.round(sx), Math.round(sy), 16, 16, 0, 0, 16, 16);
    const d = cx.getImageData(0, 0, 16, 16).data;
    let aSum = 0, colSum = 0;
    for (let k = 0; k < d.length; k += 4) { aSum += d[k + 3]; colSum += d[k] + d[k + 1] + d[k + 2]; }
    // 中心 16px 对照（应=玩家已移开? 玩家在 417 格——中心画面应有内容）
    const c3 = document.createElement('canvas');
    c3.width = 8; c3.height = 8;
    const cx3 = c3.getContext('2d', { willReadFrequently: true });
    cx3.drawImage(cv, cv.width / 2 - 4, cv.height / 2 - 4, 8, 8, 0, 0, 8, 8);
    const d3 = cx3.getImageData(0, 0, 8, 8).data;
    let a3 = 0;
    for (let k = 0; k < d3.length; k += 4) a3 += d3[k + 3];
    return {
      cam: { x: cam.x, y: cam.y }, zoom: cam.zoom, wts: [sx, sy],
      cvW: cv.width, cvH: cv.height,
      grabMeanA: aSum / 256, grabMeanRGB: colSum / 256 / 3,
      centerMeanA: a3 / 64,
      playerAt: { x: g.player.x, y: g.player.y },
    };
  });
  console.log(JSON.stringify(dbg, null, 1));
} finally { await closeAllBrowsers().catch(() => {}); }
