// BJ214 八段: 用户世界 seed 长泡 soak——自然花苞自愈证明(非 burst)。
// 30000 tick ≈ 8.3 分钟游戏时;分段泵;自然 238 出现即记录+截图。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';
import { relight } from '../tools/probe/lib/staging.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214s]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '5162020', size: 'medium', pinRandom: 913, settleMs: 1200 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    await page.evaluate(async () => {
      const g = window.__swGame, w = g.world;
      w.flags.hardMode = true;
      w.flags.downed_134 = true; w.flags.downed_125 = true; w.flags.downed_127 = true;
      w.flags.downedMechBossAny = true;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      window.__bj214s = { g238: TILE_INTERNAL_BY_SHEET.get(238), C: { entries: 0, try238: 0, ok238: 0 }, seen: [] };
      const ev = g.evolution;
      const ma = ev['mechAll'].bind(ev);
      ev['mechAll'] = () => { window.__bj214s.C.entries++; return ma(); };
      const pjp = ev['placeJunglePlant'].bind(ev);
      ev['placeJunglePlant'] = (x, y, s, sx, sy) => {
        if (s === 238) window.__bj214s.C.try238++;
        const r = pjp(x, y, s, sx, sy);
        if (s === 238 && r) window.__bj214s.C.ok238++;
        return r;
      };
    });
    log('flags set, soaking...');

    // 分段 30×1000 tick;每段扫自然苞
    for (let seg = 0; seg < 30; seg++) {
      await pump(page, 1000, { step: 50, clearEnemies: true });
      const found = await page.evaluate(() => {
        const g = window.__swGame, st = g.world.store;
        const g238 = window.__bj214s.g238;
        const bulbs = [];
        for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
          const i = st.idx(x, y);
          if (st.flags[i] && st.type[i] === g238) bulbs.push([x, y]);
        }
        return { n: bulbs.length, first: bulbs[0] ?? null, C: window.__bj214s.C };
      });
      if (found.n > 0 || seg === 29) {
        log(`seg ${seg}: 自然苞=${found.n} first=${JSON.stringify(found.first)} C=${JSON.stringify(found.C)}`);
      }
      if (found.n > 0) {
        // 截自然苞
        const [bx, by] = found.first;
        await page.evaluate(([x, y]) => {
          const g = window.__swGame, st = g.world.store;
          for (let dy = -5; dy <= -1; dy++) for (let dx = -2; dx <= 3; dx++) {
            const i = st.idx(x + dx, y + dy);
            if (st.flags[i]) st.setTileSilent(x + dx, y + dy, 0, 0, 0);
          }
        }, [bx, by]);
        await teleport(page, (bx + 1) * 16, (by - 4) * 16);
        await pump(page, 15, { step: 15 });
        await page.evaluate(() => {
          const g = window.__swGame;
          if (g.camera) { g.camera.zoomTarget = 2; g.camera.zoom = 2; }
        });
        await relight(page, { wx: (bx + 1) * 16, wy: (by - 1) * 16, rgb: [1, 1, 0.85], grid: 3, spacing: 7 });
        await pump(page, 1, { step: 1 });
        await saveCanvasShot(page, '/tmp/probe-out/shots/bj214-natural-bulb-soak.png');
        log('natural bulb shot saved', JSON.stringify({ at: [bx, by], tick: (seg + 1) * 1000 }));
        break;
      }
    }
    const fin = await page.evaluate(() => window.__bj214s.C);
    log('final C:', JSON.stringify(fin));
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214s] FAIL', e?.stack ?? e);
  process.exit(1);
}
