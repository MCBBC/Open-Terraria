// 一次性诊断⑤：暂停+夜相下火把能否点亮邻石（光照渲染侧收敛验证）
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
  await freezeClock(page, { tod: 0.5 });
  await teleport(page, 6600, 968);
  const placed = await page.evaluate(() => {
    const g = window.__swGame;
    g.paused = true;
    const st = g.world.store;
    const set = (x, y, t) => { const i = st.idx(x, y); st.type[i] = t; st.flags[i] = t ? 1 : 0; st.wall[i] = 0; };
    set(420, 60, 2);   // 石块
    set(421, 60, 8);   // 火把(8)邻格
    return true;
  });
  await teleport(page, 420 * 16, 60 * 16 + 8);
  for (let k = 0; k < 15; k++) { await new Promise(r => setTimeout(r, 100)); }
  const dbg = await page.evaluate(() => {
    const g = window.__swGame;
    const cv = g?.renderer?.canvas;
    const [sx, sy] = g.camera.worldToScreen(420 * 16, 60 * 16);
    const c2 = document.createElement('canvas');
    c2.width = 16; c2.height = 16;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, Math.round(sx), Math.round(sy), 16, 16, 0, 0, 16, 16);
    const d = cx.getImageData(0, 0, 16, 16).data;
    let rSum = 0, gSum = 0, bSum = 0;
    for (let k = 0; k < d.length; k += 4) { rSum += d[k]; gSum += d[k + 1]; bSum += d[k + 2]; }
    return { stoneMean: [rSum / 256, gSum / 256, bSum / 256].map((v) => Math.round(v)) };
  });
  console.log(JSON.stringify(dbg));
} finally { await closeAllBrowsers().catch(() => {}); }
