// BJ214 三段: 地下 case60 段上下文普查 + 手工失败格 solidTile 重放。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214u]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    await page.evaluate(() => {
      const w = window.__swGame.world;
      w.flags.hardMode = true;
      w.flags.downed_134 = true; w.flags.downed_125 = true; w.flags.downed_127 = true;
      w.flags.downedMechBossAny = true;
    });

    const R = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const surf = Math.floor(g.world.groundLevel);
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const rev = new Map();
      for (const [s, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, s);
      const sh = (x, y) => { const i = st.idx(x, y); return st.flags[i] ? (rev.get(st.type[i]) ?? -1) : -1; };
      const ev = g.evolution;
      const C = window.__bj214u = {
        surf,
        grassGrowthUnder: 0, grassGrowthUnder60: 0,
        secEntries: 0, secClean: 0, secBuried: 0,
        pjpUnder: 0, pjpUnderFail: 0, pjpUnder238: 0,
        samples: [], manualWhy: [],
      };
      // 包 grassGrowth(underground=true) 入口统计 sheet60 采样
      const ggOrig = ev['grassGrowth'].bind(ev);
      ev['grassGrowth'] = (i, j, a, b, c, d, under) => {
        if (under) {
          C.grassGrowthUnder++;
          if (sh(i, j) === 60) C.grassGrowthUnder60++;
        }
        return ggOrig(i, j, a, b, c, d, under);
      };
      // 包 placeJunglePlant:只录地下(sheet 238/236 全录;233 仅地下)
      const pjpOrig = ev['placeJunglePlant'].bind(ev);
      ev['placeJunglePlant'] = (X2, Y2, sheet, sx, sy) => {
        const under = (Y2 + 1) >= C.surf;
        const r = pjpOrig(X2, Y2, sheet, sx, sy);
        if (under) {
          C.pjpUnder++;
          if (!r) C.pjpUnderFail++;
          if (sheet === 238) C.pjpUnder238++;
          if (C.samples.length < 14 && (sheet !== 233 || true)) {
            const map = [];
            for (const dy of [-1, 0, 1]) {
              const row = [];
              for (let dx = -2; dx <= 1; dx++) row.push(sh(X2 + dx, Y2 + dy));
              map.push(row);
            }
            C.samples.push({ sheet, X2, Y2, r, map });
          }
        }
        return r;
      };
      // 包 mechAll 统计地下段入场并分类干净/掩埋:干净=2×2(锚上两行)全非活动+底承双 60
      const maOrig = ev['mechAll'].bind(ev);
      ev['mechAll'] = () => {
        C.secEntries++;
        return maOrig();
      };
      return { ok: true };
    });
    log('inst:', JSON.stringify(R));

    await pump(page, 900, { step: 30, clearEnemies: true });

    const post = await page.evaluate(() => window.__bj214u);
    log('census:', JSON.stringify(post, null, 1));

    // ---- 手工失败格重放:复现探针2的 3 个失败点,用 ev.solidTile 逐门重放 ----
    const replay = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const rev = new Map();
      for (const [s, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, s);
      const sh = (x, y) => { const i = st.idx(x, y); return st.flags[i] ? (rev.get(st.type[i]) ?? -1) : -1; };
      const ev = g.evolution;
      const g60 = TILE_INTERNAL_BY_SHEET.get(60);
      const out = [];
      for (const [x, y] of [[1050, 784], [1057, 928], [1059, 735]]) {
        const X2 = x, num = y - 1;
        const det = {
          site: [x, y],
          bounds: !(X2 < 5 || X2 > st.w - 5 || num < 5 || num > st.h - 5),
          fam: [], sup: [],
        };
        for (let dx = -1; dx <= 0; dx++) {
          for (let dy = -1; dy <= 0; dy++) {
            const ii = st.idx(X2 + dx, num + dy);
            det.fam.push([X2 + dx, num + dy, st.flags[ii], rev.get(st.type[ii]) ?? -1]);
          }
          det.sup.push([X2 + dx, num + 1, ev['solidTile'](X2 + dx, num + 1), sh(X2 + dx, num + 1)]);
        }
        det.ret = ev['placeJunglePlant'](X2, num, 238, 0, 0);
        out.push(det);
      }
      return out;
    });
    log('replay:', JSON.stringify(replay, null, 1));
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214u] FAIL', e?.stack ?? e);
  process.exit(1);
}
