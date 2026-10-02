// 白天地表回归目检:玩家站真实地表(首实心格上方),与修复前 locate-t2s 对照
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await clockSet(page, 0.3);
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  g.player.debugGod = true;
  g.player.x = g.world.spawnX * 16 + 400;
  const col = g.player.x >> 4;
  let fs = 269;
  for (let y = 60; y < 700; y++) if (st.isSolid(col, y)) { fs = y; break; }
  g.player.y = fs * 16 - 20;
  g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 6000));
await page.screenshot({ path: 'shots/c10e-trail/nv-regress-day-surface.png' });
console.log('saved');
process.exit(0);
