// 找低地形柱:spawn 附近 firstSolid 最大的列(海面/深谷),供门线空中扫描
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
await new Promise((r) => setTimeout(r, 1500));
const rep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const base = (g.world.spawnX * 16 + 400) >> 4;
  let best = -1, bestCol = -1;
  const prof = [];
  for (let c = base - 300; c <= base + 300; c += 10) {
    let fs = -1;
    for (let y = 60; y < 700; y++) if (st.isSolid(c, y)) { fs = y; break; }
    prof.push(`${c}:${fs}`);
    if (fs > best) { best = fs; bestCol = c; }
  }
  return { base, best, bestCol, prof: prof.join(' ') };
});
console.log(JSON.stringify(rep, null, 1));
process.exit(0);
