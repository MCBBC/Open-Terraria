// 夜间对照:玩家自然站立地表,无驱动/无柱,8s 后截图
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
  g.player.debugGod = true;
  g.player.x = g.world.spawnX * 16 + 400;
  g.player.y = ((g.world.store.surfaceY ?? 300) - 6) * 16;
  g.player.vy = 0;
});
await new Promise((r) => setTimeout(r, 8000));
const s = await page.evaluate(() => {
  const g = window.__swGame;
  return { py: Math.round(g.player.y), camY: Math.round(g.camera.y), ws: Math.floor(g.world.groundLevel) * 16, tod: +(+g.world.clock.timeOfDay).toFixed(3) };
});
console.log(JSON.stringify(s));
await page.screenshot({ path: 'shots/c10e-trail/nv-control-day.png' });
process.exit(0);
