// 列剖面:col 2127 tile 255..305 类型+实心位;玩家落点核验
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await new Promise((r) => setTimeout(r, 2000));
const rep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const col = (g.world.spawnX * 16 + 400) >> 4;
  const rows = [];
  for (let y = 255; y <= 305; y++) {
    const i = st.idx(col, y);
    rows.push(`${y}:${st.type[i]}${st.isSolid(col, y) ? 'S' : ''}`);
  }
  return { col, groundLevel: g.world.groundLevel, storeSurfaceY: st.surfaceY, rows: rows.join(' ') };
});
console.log(JSON.stringify(rep, null, 1));
process.exit(0);
