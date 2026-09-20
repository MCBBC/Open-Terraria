// BJ214 六段: 花苞视觉证据终拍——环布火把+光照收敛,深部自然位+近表点位双照。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { screenshot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214f]', ...a);

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
      const rev = new Map();
      for (const [s, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, s);
      const sh = (x, y) => { const i = st.idx(x, y); return st.flags[i] ? (rev.get(st.type[i]) ?? -1) : -1; };
      const ev = g.evolution;
      const g60 = TILE_INTERNAL_BY_SHEET.get(60), g238 = TILE_INTERNAL_BY_SHEET.get(238), torch = TILE_INTERNAL_BY_SHEET.get(8);
      // ① 深部自然位:burst 兜底链种一朵(seed 5162020 已验证落在丛林带)
      const burst = ev.planteraBulbBurst();
      let deep = null;
      for (let y = 0; y < st.h && !deep; y++) for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === g238) { deep = [x, y]; break; }
      }
      // ② 近表点位:找 surf+10..surf+60 的合格平底,再种一朵+清出观赏台
      let near = null;
      outer:
      for (let y = Math.floor(w.groundLevel) + 8; y < Math.floor(w.groundLevel) + 80; y++) {
        for (let x = Math.floor(st.w * 0.55); x < st.w * 0.9; x++) {
          const i = st.idx(x, y);
          if (!st.flags[i] || st.type[i] !== g60) continue;
          if (!ev['solidTile'](x - 1, y) || !ev['solidTile'](x, y)) continue;
          if (sh(x - 1, y) !== 60 || sh(x, y) !== 60) continue;
          let clear = true;
          for (let dx = -2; dx <= 3 && clear; dx++) for (let dy = -4; dy <= -1; dy++) {
            if (st.flags[st.idx(x + dx, y + dy)]) { clear = false; break; }
          }
          if (!clear) continue;
          near = [x, y]; break outer;
        }
      }
      if (near) ev['placeJunglePlant'](near[0], near[1] - 1, 238, 0, 0);
      return { burst, deep, near, torchId: torch, deepIs238: deep ? sh(deep[0], deep[1]) : null,
        nearIs238: near ? sh(near[0], near[1] - 1) : null };
    });
    log('prep:', JSON.stringify(prep));

    const shootAt = async (bx, by, name) => {
      // 环布火把(左右上+后方)+清理观看区+传送
      await page.evaluate(async ([x, y]) => {
        const g = window.__swGame, st = g.world.store;
        const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
        const torch = TILE_INTERNAL_BY_SHEET.get(8);
        for (let dy = -6; dy <= -1; dy++) for (let dx = -3; dx <= 4; dx++) {
          const i = st.idx(x + dx, y + dy);
          if (st.flags[i]) st.setTileSilent(x + dx, y + dy, 0, 0, 0);
        }
        // 花苞左侧/右侧各一支落地火把(落在承重面上)
        st.setTile(x - 3, y - 1, torch, 0, 0);
        st.setTile(x + 2, y - 1, torch, 0, 0);
        g.chunks?.markDirtyArea?.(x - 5, y - 7, x + 5, y + 2);
        if (g.lighting) g.lighting.dirty = true;
      }, [bx, by]);
      await teleport(page, (bx + 1) * 16, (by - 4) * 16);
      await pump(page, 45, { step: 15 });
      const shot = await screenshot(page, name, {
        time: 'day', wx: (bx + 1) * 16, wy: (by - 2) * 16, w: 160, h: 120,
        onDark: 'off', layer: 'canvas', convergeTicks: 30,
      });
      log('shot:', JSON.stringify({ ok: shot.ok, path: shot.path, lit: shot.lit, at: [bx, by] }));
      return shot;
    };

    if (prep.deep) await shootAt(prep.deep[0], prep.deep[1], 'bj214-final-deep-bulb');
    if (prep.near) await shootAt(prep.near[0], prep.near[1] - 1, 'bj214-final-near-bulb');
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214f] FAIL', e?.stack ?? e);
  process.exit(1);
}
