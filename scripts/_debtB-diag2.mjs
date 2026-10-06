import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261006 });
await godMode(page, true);
const info = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const out = {};
  out.swTiles = window.__swTiles ? Object.fromEntries(Object.entries(window.__swTiles).slice(0, 8)) : null;
  out.snowTileEntry = window.__swTiles ? Object.entries(window.__swTiles).filter(([k, v]) => /snow/i.test(k)) : null;
  out.worldW = g.world.store.width ?? g.world.width ?? null;
  out.groundLevel = g.world.groundLevel;
  // 试写 147 于 spawn 附近并读回
  const surf = Math.floor(g.world.groundLevel);
  st.setTile(300, surf + 3, 147);
  out.readback147 = st.isActive(300, surf + 3);
  out.typeAt = st.tileType ? st.tileType(300, surf + 3) : (st.getTile ? (() => { const t = st.getTile(300, surf + 3); return t ? (t.type ?? null) : null; })() : 'no-reader');
  st.setTile(300, surf + 4, 0);
  out.readback0 = st.isActive(300, surf + 4);
  return out;
});
console.log(JSON.stringify(info));
process.exit(0);
