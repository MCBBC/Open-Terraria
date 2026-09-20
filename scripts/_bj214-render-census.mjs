// BJ214 四段: f 合格立地普查 + 定点种苞截图(渲染可见性) + 长泵自然计数。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { screenshot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214r]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    // ---- 置旗 + 计数包桩 ----
    await page.evaluate(() => {
      const w = window.__swGame.world;
      w.flags.hardMode = true;
      w.flags.downed_134 = true; w.flags.downed_125 = true; w.flags.downed_127 = true;
      w.flags.downedMechBossAny = true;
      const ev = window.__swGame.evolution;
      const C = window.__bj214r = { entries: 0, try238: 0, ok238: 0, try236: 0, ok236: 0 };
      const ma = ev['mechAll'].bind(ev);
      ev['mechAll'] = () => { C.entries++; return ma(); };
      const pjp = ev['placeJunglePlant'].bind(ev);
      ev['placeJunglePlant'] = (x, y, s, sx, sy) => {
        if (s === 238) C.try238++; if (s === 236) C.try236++;
        const r = pjp(x, y, s, sx, sy);
        if (s === 238 && r) C.ok238++;
        if (s === 236 && r) C.ok236++;
        return r;
      };
    });

    // ---- f 普查:全地下 60 格,238 门只读重放 ----
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
          // 238 锚=(x, y-1):box=(x-1..x, y-2..y-1) 支承=(x-1..x, y)
          let ok = true, why = '';
          for (const dx of [-1, 0]) {
            const si = st.idx(x + dx, y);
            const isSup = ev['solidTile'](x + dx, y) && st.flags[si] && (rev.get(st.type[si]) ?? -1) === 60;
            if (!isSup) { ok = false; why = 'sup'; break; }
          }
          if (!ok) { supBad++; continue; }
          outer:
          for (let dx = -1; dx <= 0; dx++) {
            for (let dy = -2; dy <= -1; dy++) {
              const ii = st.idx(x + dx, y + dy);
              if (!st.flags[ii]) continue;
              const s = rev.get(st.type[ii]) ?? -1;
              if (!FAM.has(s) || (s === 185 && st.frameY[ii] !== 0)) { ok = false; why = 'box:' + s; break outer; }
            }
          }
          if (!ok) { boxBad++; continue; }
          eligible++;
          if (xs.length < 8) xs.push([x, y]);
        }
      }
      return { total, eligible, supBad, boxBad, frac: +(eligible / Math.max(1, total)).toFixed(4), xs };
    });
    log('census:', JSON.stringify(census));

    // ---- 定点种苞+果 → 传送 → 截图 ----
    const planted = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const ev = g.evolution;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const rev = new Map();
      for (const [s, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, s);
      const sh = (x, y) => { const i = st.idx(x, y); return st.flags[i] ? (rev.get(st.type[i]) ?? -1) : -1; };
      const g60 = TILE_INTERNAL_BY_SHEET.get(60);
      // 找一个干净 2 宽 60 平底(上下 3 行空,支撑双列非 slope/half)
      let site = null;
      outerX:
      for (let x = Math.floor(st.w * 0.2); x < st.w * 0.8; x++) {
        for (let y = Math.floor(g.world.groundLevel) + 30; y < st.h - 220; y++) {
          const i = st.idx(x, y);
          if (!st.flags[i] || st.type[i] !== g60) continue;
          if (!ev['solidTile'](x - 1, y) || !ev['solidTile'](x, y)) continue;
          if (sh(x - 1, y) !== 60 || sh(x, y) !== 60) continue;
          let clear = true;
          for (let dx = -1; dx <= 0 && clear; dx++) for (let dy = -3; dy <= -1; dy++) {
            if (st.flags[st.idx(x + dx, y + dy)]) { clear = false; break; }
          }
          if (!clear) continue;
          site = [x, y]; break outerX;
        }
      }
      if (!site) return { site: null };
      const [x, y] = site;
      const r238 = ev['placeJunglePlant'](x, y - 1, 238, 0, 0);
      const bulbAt = [[x - 1, y - 2], [x, y - 2], [x - 1, y - 1], [x, y - 1]].map(([a, b]) => sh(a, b));
      // 236 种在旁边(清 2×3)
      for (let dx = -1; dx <= 2; dx++) for (let dy = -3; dy <= 0; dy++) st.setTileSilent(x + 3 + dx, y + dy, 0, 0, 0);
      const r236 = ev['placeJunglePlant'](x + 3, y - 1, 236, 0, 0);
      return { site, r238, r236, bulbAt, fruitAt: sh(x + 2, y - 1) + '/' + sh(x + 3, y - 1) };
    });
    log('planted:', JSON.stringify(planted));

    if (planted.site) {
      const [x, y] = planted.site;
      await teleport(page, x * 16, (y - 2) * 16);
      await pump(page, 30, { step: 30 });
      const shot = await screenshot(page, 'bj214-bulb-visible', {
        time: 'day', wx: x * 16, wy: (y - 2) * 16, w: 160, h: 120, onDark: 'day', layer: 'canvas',
      });
      log('shot:', JSON.stringify({ ok: shot.ok, path: shot.path, lit: shot.lit }));
    }

    // ---- 长泵 5400f 自然计数 ----
    const p = await pump(page, 5400, { step: 30, clearEnemies: true });
    const post = await page.evaluate(() => window.__bj214r);
    log('natural:', JSON.stringify(post));
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214r] FAIL', e?.stack ?? e);
  process.exit(1);
}
