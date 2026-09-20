// BJ214 九段: 用户世界 f(238 合格立地占比) 直测 + 失败原因分布。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214fc]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '5162020', size: 'medium', pinRandom: 913, settleMs: 1200 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    const census = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const surf = Math.floor(g.world.groundLevel);
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const rev = new Map();
      for (const [s, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, s);
      const ev = g.evolution;
      const g60 = TILE_INTERNAL_BY_SHEET.get(60);
      const FAM = new Set([61, 703, 62, 655, 69, 74, 233, 185]);
      let total = 0, eligible = 0, supBad = 0, boxBad = 0;
      const xs = [];
      for (let y = surf; y < st.h - 200; y++) {
        for (let x = 1; x < st.w - 1; x++) {
          const i = st.idx(x, y);
          if (!st.flags[i] || st.type[i] !== g60) continue;
          total++;
          let ok = true;
          for (const dx of [-1, 0]) {
            const si = st.idx(x + dx, y);
            if (!(ev['solidTile'](x + dx, y) && st.flags[si] && (rev.get(st.type[si]) ?? -1) === 60)) { ok = false; break; }
          }
          if (!ok) { supBad++; continue; }
          outer:
          for (let dx = -1; dx <= 0; dx++) {
            for (let dy = -2; dy <= -1; dy++) {
              const ii = st.idx(x + dx, y + dy);
              if (!st.flags[ii]) continue;
              const s = rev.get(st.type[ii]) ?? -1;
              if (!FAM.has(s) || (s === 185 && st.frameY[ii] !== 0)) { ok = false; break outer; }
            }
          }
          if (!ok) { boxBad++; continue; }
          eligible++;
          if (xs.length < 10) xs.push([x, y]);
        }
      }
      return { surf, total, eligible, supBad, boxBad, frac: +(eligible / Math.max(1, total)).toFixed(4), xs };
    });
    log('f-census:', JSON.stringify(census));
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214fc] FAIL', e?.stack ?? e);
  process.exit(1);
}
