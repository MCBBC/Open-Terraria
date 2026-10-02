// 星璇柱·玩家位置核验:真实地表扫描 vs store.surfaceY + 玩家嵌入判定
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
const rep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const col = (g.world.spawnX * 16 + 400) >> 4;   // 玩家列(tiles)
  const scanSolid = (cx) => {
    for (let y = 0; y < 400; y++) {
      if (st.isSolid(cx, y)) return y;
    }
    return -1;
  };
  const surf = scanSolid(col);
  return {
    storeSurfaceY: st.surfaceY,
    spawnX: g.world.spawnX,
    col,
    firstSolidY: surf,
    firstSolidPx: surf * 16,
    playerY: g.player.y,
    embedded: surf > 0 && g.player.y > (surf - 2) * 16,
    tileSolidAtPlayer: st.isSolid(col, g.player.y >> 4),
  };
});
console.log(JSON.stringify(rep, null, 1));
process.exit(0);
