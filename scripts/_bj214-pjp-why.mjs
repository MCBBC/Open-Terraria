// BJ214 二段: placeJunglePlant 失败原因分类 + 手工净地直落测试。
// 分类: bounds / family:<sheet> / support:<sheets> / unknown;附失败点上下文。
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const log = (...a) => console.log('[bj214w]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    const pre = await page.evaluate(() => {
      const g = window.__swGame;
      const w = g.world;
      w.flags.hardMode = true;
      w.flags.downed_134 = true; w.flags.downed_125 = true; w.flags.downed_127 = true;
      w.flags.downedMechBossAny = true;
      return { surf: Math.floor(w.groundLevel), W: w.store.w };
    });

    // 泵 900 帧触发自然 case60 段,期间分类失败
    const inst = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      // internal→sheet 反查
      const rev = new Map();
      for (const [sh, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, sh);
      const sh = (x, y) => { const i = st.idx(x, y); return st.flags[i] ? (rev.get(st.type[i]) ?? -1) : -1; };
      const C = window.__bj214c = { calls: 0, fail: 0, ok238: 0, ok236: 0, ok233: 0,
        why: { bounds: 0, family: {}, support: {}, unknown: 0 }, samples: [] };
      const ev = g.evolution;
      const pjpOrig = ev['placeJunglePlant'].bind(ev);
      ev['placeJunglePlant'] = (X2, Y2, sheet, sx, sy) => {
        C.calls++;
        const is2 = (sy > 0 || sheet === 236 || sheet === 238 || sheet === 702);
        // 逐门复刻分类(先跑原函数取真值,再自查原因)
        const r = pjpOrig(X2, Y2, sheet, sx, sy);
        if (r) { if (sheet === 238) C.ok238++; if (sheet === 236) C.ok236++; if (sheet === 233) C.ok233++; return r; }
        C.fail++;
        const num = is2 ? Y2 : Y2;
        const cols = is2 ? [-1, 0] : [-1, 0, 1];
        const rows = is2 ? [-1, 0] : [-1, 0];
        let why = 'unknown';
        if (X2 < 5 || X2 > st.w - 5 || num < 5 || num > st.h - 5) why = 'bounds';
        else {
          outer:
          for (const dx of cols) {
            for (const dy of rows) {
              const x = X2 + dx, y = num + dy;
              const i = st.idx(x, y);
              if (!st.flags[i]) continue;
              const s = rev.get(st.type[i]) ?? -1;
              const allow = s === 61 || s === 703 || s === 62 || s === 655 || s === 69 || s === 74
                || ((sheet === 236 || sheet === 702 || sheet === 238) && s === 233)
                || (s === 185 && st.frameY[i] === 0);
              // 3×2 分支允许族无 233/655 有 655?原版 3×2: 61/703/62/69/655/74
              if (!is2 && (s === 233)) { why = 'family:233-in-3x2'; break outer; }
              if (!allow && !(s === 655 && !is2)) { why = 'family:' + s; break outer; }
            }
            const sup = sh(X2 + dx, num + 1);
            if (sup !== 60) { why = 'support:' + sup; break outer; }
          }
        }
        C.why[why] = (C.why[why] ?? 0) + 1;
        if (C.samples.length < 12) {
          const ctx = [];
          for (const dy of [-2, -1, 0]) {
            const row = [];
            for (let dx = -2; dx <= 1; dx++) row.push(sh(X2 + dx, Y2 + dy));
            ctx.push(row);
          }
          C.samples.push({ sheet, X2, Y2, is2, why, ctx });
        }
        return r;
      };
      return { inst: true };
    });
    log('inst ok');

    const p1 = await pump(page, 900, { step: 30, clearEnemies: true });
    const post = await page.evaluate(() => ({ C: window.__bj214c }));
    log('C:', JSON.stringify(post.C, null, 1));

    // ---- 手工净地直落测试:找 2 宽平底 60,清上方 2×2,直落 238/236/233 ----
    const manual = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const rev = new Map();
      for (const [sh_, id] of TILE_INTERNAL_BY_SHEET) rev.set(id, sh_);
      const sh = (x, y) => { const i = st.idx(x, y); return st.flags[i] ? (rev.get(st.type[i]) ?? -1) : -1; };
      const ev = g.evolution;
      const g60 = TILE_INTERNAL_BY_SHEET.get(60);
      const surf = Math.floor(g.world.groundLevel);
      // 找: (i-1..i, j) 双 60 实心平底,上方 2 行空
      const sites = [];
      for (let x = st.w * 0.25; x < st.w * 0.75 && sites.length < 5; x++) {
        for (let y = surf + 20; y < st.h - 220; y++) {
          const i = st.idx(x, y);
          if (st.flags[i] && st.type[i] === g60) {
            const iL = st.idx(x - 1, y);
            if (st.flags[iL] && st.type[iL] === g60
              && !st.flags[st.idx(x, y - 1)] && !st.flags[st.idx(x - 1, y - 1)]
              && !st.flags[st.idx(x, y - 2)] && !st.flags[st.idx(x - 1, y - 2)]) {
              sites.push([x, y]); break;
            }
          }
        }
      }
      const out = [];
      for (const [x, y] of sites) {
        const r238 = ev['placeJunglePlant'](x, y - 1, 238, 0, 0);
        const got238 = sh(x - 1, y - 2) === 238 || sh(x, y - 1) === 238;
        out.push({ site: [x, y], r238, got238, supL: sh(x - 1, y), supR: sh(x, y) });
        // 清掉再试 236
        if (r238) {
          for (let dx = -1; dx <= 0; dx++) for (let dy = -2; dy <= -1; dy++) {
            const i = st.idx(x + dx, y + 1 + dy); st.setTileSilent(x + dx, y + 1 + dy, 0, 0, 0);
          }
        }
      }
      return out;
    });
    log('manual:', JSON.stringify(manual));
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214w] FAIL', e?.stack ?? e);
  process.exit(1);
}
