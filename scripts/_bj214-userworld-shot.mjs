// BJ214 五段: 用户世界复刻(seed 5162020, medium 6400x1800) → 自然花苞生成 → 视觉截图证据。
// 纪律: 先扫自然苞(手工未种)再截图——证明自然链路;截图带火把照明,花苞居中。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame, teleport } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { screenshot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214v]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '5162020', size: 'medium', pinRandom: 913, settleMs: 1200 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    const base = await page.evaluate(() => {
      const g = window.__swGame, w = g.world;
      w.flags.hardMode = true;
      w.flags.downed_134 = true; w.flags.downed_125 = true; w.flags.downed_127 = true;
      w.flags.downedMechBossAny = true;
      const ev = g.evolution;
      const C = window.__bj214v = { entries: 0, try238: 0, ok238: 0, try236: 0, ok236: 0 };
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
      return { size: `${w.store.w}x${w.store.h}`, surf: Math.floor(w.groundLevel), dungeonX: w.dungeonX };
    });
    log('base:', JSON.stringify(base));

    // 泵 7200f(=2 分钟游戏时;rate=1,该世界 173 采样/f)
    const p1 = await pump(page, 7200, { step: 30, clearEnemies: true });
    const scan1 = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const rev = new Map();
      for (const [s, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, s);
      const g238 = TILE_INTERNAL_BY_SHEET.get(238), g60 = TILE_INTERNAL_BY_SHEET.get(60);
      const surf = Math.floor(g.world.groundLevel);
      const bulbs = [], grassU = { n: 0 };
      for (let y = 0; y < st.h; y++) {
        for (let x = 0; x < st.w; x++) {
          const i = st.idx(x, y);
          if (!st.flags[i]) continue;
          if (st.type[i] === g238) bulbs.push([x, y]);
          else if (st.type[i] === g60 && y >= surf) grassU.n++;
        }
      }
      return { naturalBulbs: bulbs, n: bulbs.length, grassU: grassU.n, C: window.__bj214v };
    });
    log('scan1:', JSON.stringify(scan1));

    // 截图:取一个自然苞(或保底 burst 兜底),传送到其上方 6 格
    const bulbs = scan1.naturalBulbs;
    if (!bulbs.length) {
      // 保底链兜底(三旗置位后 Game 杀王时本会调;此处手动触发一次验证)
      const burst = await page.evaluate(() => {
        const r = window.__swGame.evolution.planteraBulbBurst();
        return { burstRet: r };
      });
      log('burst:', JSON.stringify(burst));
    }
    const scan2 = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const g238 = TILE_INTERNAL_BY_SHEET.get(238);
      const bulbs = [];
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === g238) bulbs.push([x, y]);
      }
      return { bulbs, n: bulbs.length };
    });
    log('scan2:', JSON.stringify(scan2));

    if (scan2.n > 0) {
      const [bx, by] = scan2.bulbs[0];
      // 传送:花苞中心上方 ~8 格,先清落点一小块防卡
      await page.evaluate(([x, y]) => {
        const g = window.__swGame, st = g.world.store;
        for (let dy = -6; dy <= -1; dy++) for (let dx = -2; dx <= 3; dx++) {
          const i = st.idx(x + dx, y + dy);
          if (st.flags[i] && !st.isPlatform?.(x + dx, y + dy)) st.setTileSilent(x + dx, y + dy, 0, 0, 0);
        }
      }, [bx, by]);
      await teleport(page, (bx + 1) * 16, (by - 4) * 16);
      await pump(page, 30, { step: 30 });
      const shot = await screenshot(page, 'bj214-userworld-natural-bulb', {
        time: 'day', wx: (bx + 1) * 16, wy: (by - 2) * 16, w: 220, h: 160, onDark: 'torch', layer: 'canvas',
      });
      log('shot:', JSON.stringify({ ok: shot.ok, path: shot.path, lit: shot.lit, bulb: [bx, by] }));
      // 若多苞:再截一朵远景(验密度观感)
      if (scan2.n > 1) {
        const [cx, cy] = scan2.bulbs[1];
        await teleport(page, (cx + 1) * 16, (cy - 4) * 16);
        await pump(page, 20, { step: 20 });
        const shot2 = await screenshot(page, 'bj214-userworld-bulb-2nd', {
          time: 'day', wx: (cx + 1) * 16, wy: (cy - 2) * 16, w: 220, h: 160, onDark: 'torch', layer: 'canvas',
        });
        log('shot2:', JSON.stringify({ ok: shot2.ok, path: shot2.path, bulb: [cx, cy] }));
      }
    }
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214v] FAIL', e?.stack ?? e);
  process.exit(1);
}
