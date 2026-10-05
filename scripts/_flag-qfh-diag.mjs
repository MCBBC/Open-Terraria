import { launchBrowser, openPage, bootstrap, createGame, findTileBySheet } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5220';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
const tbl = await findTileBySheet(page, 14, { maxScan: 200000 });
const d = await page.evaluate(async (t) => {
  const g = window.__swGame, st = g.world.store;
  const H = await import(`/src/world/Housing.ts?t=${Date.now()}`);
  const q = H.quickFindHome(st, [], t.x, t.y, 22);
  const q2 = H.quickFindHome(st, [], t.x, t.y - 1, 22);
  // 泛洪:墙采样
  return { q1: q.home, q2: q2.home, fail: H.lastRoomCheckFail,
    wall: [st.wall[st.idx(t.x, t.y)], st.wall[st.idx(t.x, t.y - 1)], st.wall[st.idx(t.x, t.y - 2)]],
    type: [st.type[st.idx(t.x, t.y)], st.flags[st.idx(t.x, t.y)], st.type[st.idx(t.x, t.y - 1)], st.flags[st.idx(t.x, t.y - 1)]] };
}, tbl);
console.log(JSON.stringify(d));
await browser.close();
