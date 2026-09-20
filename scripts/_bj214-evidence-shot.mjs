// BJ214 七段(终): 花苞视觉证据——relight 瞬态光阵 + 相机 2× 特写直落画布帧。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';
import { relight } from '../tools/probe/lib/staging.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214e]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '5162020', size: 'medium', pinRandom: 913, settleMs: 1200 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    const prep = await page.evaluate(async () => {
      const g = window.__swGame, w = g.world, st = w.store;
      w.flags.hardMode = true;
      w.flags.downed_134 = true; w.flags.downed_125 = true; w.flags.downed_127 = true;
      w.flags.downedMechBossAny = true;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const g238 = TILE_INTERNAL_BY_SHEET.get(238);
      const ev = g.evolution;
      // 自然面先跑 2400f 的等效:直接多 burst 两发(=三旗首翻时 Game 会发的原版链)
      const b1 = ev.planteraBulbBurst();
      const b2 = ev.planteraBulbBurst();
      const bulbs = [];
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === g238) bulbs.push([x, y]);
      }
      return { b1, b2, bulbs: bulbs.slice(0, 6), n: bulbs.length };
    });
    log('prep:', JSON.stringify(prep));
    if (!prep.n) throw new Error('no bulb after burst');

    const [bx, by] = prep.bulbs[0];
    // 传送至花苞上方清一小块落脚区
    await page.evaluate(([x, y]) => {
      const g = window.__swGame, st = g.world.store;
      for (let dy = -5; dy <= -1; dy++) for (let dx = -2; dx <= 3; dx++) {
        const i = st.idx(x + dx, y + dy);
        if (st.flags[i]) st.setTileSilent(x + dx, y + dy, 0, 0, 0);
      }
    }, [bx, by]);
    await teleport(page, (bx + 1) * 16, (by - 4) * 16);
    await pump(page, 20, { step: 20 });

    // 相机 2× 特写
    await page.evaluate(() => {
      const g = window.__swGame;
      if (g.camera) { g.camera.zoomTarget = 2; g.camera.zoom = 2; }
    });

    // 光阵 + 同周期直落
    const wx = (bx + 1) * 16, wy = (by - 1) * 16;
    await relight(page, { wx, wy, rgb: [1, 1, 0.85], grid: 3, spacing: 7 });
    await pump(page, 1, { step: 1 });
    await saveCanvasShot(page, '/tmp/probe-out/shots/bj214-evidence-bulb-zoom.png');
    log('shot1 saved (zoom 2x)');

    // 广角(相机 1×,大光阵)
    await page.evaluate(() => {
      const g = window.__swGame;
      if (g.camera) { g.camera.zoomTarget = 1; g.camera.zoom = 1; }
    });
    await relight(page, { wx, wy, rgb: [1, 1, 0.85], grid: 5, spacing: 12 });
    await pump(page, 1, { step: 1 });
    await saveCanvasShot(page, '/tmp/probe-out/shots/bj214-evidence-bulb-wide.png');
    log('shot2 saved (wide)');

    // 第三朵:换一株若有多苞
    if (prep.n > 4) {
      const [cx, cy] = prep.bulbs[4];
      await teleport(page, (cx + 1) * 16, (cy - 4) * 16);
      await pump(page, 10, { step: 10 });
      await relight(page, { wx: (cx + 1) * 16, wy: (cy - 1) * 16, rgb: [1, 1, 0.85], grid: 3, spacing: 7 });
      await pump(page, 1, { step: 1 });
      await saveCanvasShot(page, '/tmp/probe-out/shots/bj214-evidence-bulb-3rd.png');
      log('shot3 saved', JSON.stringify({ at: [cx, cy] }));
    }
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214e] FAIL', e?.stack ?? e);
  process.exit(1);
}
