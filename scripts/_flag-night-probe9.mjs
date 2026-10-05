// ★房间无效原因诊断:quickFindHome + lastRoomCheckFail + 手动 housingCheckAt(2026-10-05)
import { launchBrowser, openPage, bootstrap, createGame, godMode,
  spawnTownNPC } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await godMode(page, true);

const scene = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const { TILE_DEFS, WALL_DEFS } = await import(`/src/data/tiles.ts?t=${Date.now()}`);
  const s2 = new Map(), w2 = new Map();
  TILE_DEFS.forEach((d, i) => { if (d?.vanilla && !s2.has(d.vanilla.sheet)) s2.set(d.vanilla.sheet, i); });
  WALL_DEFS.forEach((d, i) => { if (d?.vanilla && !w2.has(d.vanilla.sheet)) w2.set(d.vanilla.sheet, i); });
  const sx = Math.floor(g.player.cx / 16), sy = Math.floor(g.player.cy / 16);
  const wood = s2.get(30), torch = s2.get(4), table = s2.get(14), chair = s2.get(15), plat = s2.get(19);
  for (let x = sx - 11; x <= sx + 11; x++) {
    for (let y = sy - 9; y <= sy + 3; y++) { const i = st.idx(x, y); st.setTile(x, y, 0, 0, 0); st.liquid[i] = 0; st.setWall(x, y, w2.has(4) ? w2.get(4) : 4); }
    st.setTile(x, sy - 9, wood, 0, 0); st.setTile(x, sy + 3, wood, 0, 0);
  }
  for (let y = sy - 8; y <= sy + 2; y++) { st.setTile(sx - 11, y, wood, 0, 0); st.setTile(sx + 11, y, wood, 0, 0); }
  st.setTile(sx - 6, sy + 2, table, 0, 0); st.setTile(sx - 5, sy + 2, table, 18, 0); st.setTile(sx - 4, sy + 2, table, 36, 0);
  st.setTile(sx - 6, sy + 1, chair, 0, 0);
  st.setTile(sx + 7, sy + 2, torch, 0, 0);
  st.setTile(sx + 9, sy + 3, plat, 0, 0); st.setTile(sx + 9, sy + 2, 0, 0, 0);
  g.player.x = sx * 16; g.player.y = (sy - 2) * 16; g.player.vx = 0; g.player.vy = 0;
  return { sx, sy, wallUsed: w2.has(4) ? w2.get(4) : 4, ids: { wood, torch, table, chair, plat } };
});
console.log('SCENE', JSON.stringify(scene));
await spawnTownNPC(page, 'guide', { tx: scene.sx, ty: scene.sy + 2, home: { x: scene.sx, y: scene.sy + 2 } });

const diag = await page.evaluate(async (sceneIn) => {
  const g = window.__swGame, st = g.world.store;
  const H = await import(`/src/world/Housing.ts?t=${Date.now()}`);
  // 直接调 housingCheckAt(game 内部门?)——走 quickFindHome 纯函数:
  const others = [];
  const q = H.quickFindHome(st, others, sceneIn.sx, sceneIn.sy + 3, 22);
  return { q: { home: q.home, noop: q.noop }, fail: H.lastRoomCheckFail,
    wallSample: st.wall[st.idx(sceneIn.sx, sceneIn.sy)],
    checkEnclosure: (() => { try { return !!H.checkRoomEnclosure(st, sceneIn.sx, sceneIn.sy + 2); } catch (e) { return 'ERR:' + e.message; } })() };
}, scene);
console.log('DIAG', JSON.stringify(diag));
await browser.close();
