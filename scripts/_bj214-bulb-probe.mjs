// BJ214: 世纪之花花苞(238)生成链端到端探针。
// 构造 hardMode+三王全灭世界 → 计数器包桩 mechAll/placeJunglePlant → pump → 统计。
// 判读:
//   mechAllCalls=0                    → case60 段未达(上游断)
//   mechAllCalls>0 且 mechAllTrue=0   → 旗假(键域错位)
//   mechAllTrue>0 且 pjp238=0         → 1/60 掷位问题
//   pjp238>0 且全 fail                → 落位门(允许族/底承)断
//   落位>0 但盘面扫不到 238           → 落后即被杀
import { launchBrowser, openPage, closeAllBrowsers } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { createGame } from '../tools/probe/lib/game.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const log = (...a) => console.log('[bj214]', ...a);

try {
  const browser = await launchBrowser();
  const page = await openPage(browser, { errors: [] });
  page.__probeOrigin = ORIGIN;
  try {
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) throw new Error('bootstrap: ' + boot.why);
    const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 913, settleMs: 800 });
    if (!gen.ok) throw new Error('createGame: ' + gen.why);

    // ---- 置旗 + 定位丛林 + 基线计数 ----
    const base = await page.evaluate(() => {
      const g = window.__swGame;
      const w = g.world, st = w.store;
      w.flags.hardMode = true;
      w.flags.downed_134 = true;
      w.flags.downed_125 = true;
      w.flags.downed_127 = true;
      w.flags.downedMechBossAny = true;
      // 丛林精扫放第二段 evaluate(需 TILE_INTERNAL_BY_SHEET);此处只回基础面
      const W = st.w, H = st.h, surf = Math.floor(w.groundLevel);
      return {
        flags: { hardMode: w.flags.hardMode, d134: w.flags.downed_134, d125: w.flags.downed_125, d127: w.flags.downed_127 },
        size: `${W}x${H}`, surf, dungeonX: w.dungeonX,
      };
    });
    log('base:', JSON.stringify(base));

    // 页内:internal id 表 + 丛林草扫描 + 包桩 + 泵
    const scan = await page.evaluate(async () => {
      const g = window.__swGame;
      const w = g.world, st = w.store;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const g60 = TILE_INTERNAL_BY_SHEET.get(60), g238 = TILE_INTERNAL_BY_SHEET.get(238),
        g236 = TILE_INTERNAL_BY_SHEET.get(236), g233 = TILE_INTERNAL_BY_SHEET.get(233), g226 = TILE_INTERNAL_BY_SHEET.get(226);
      const W = st.w, H = st.h, surf = Math.floor(w.groundLevel);
      const countOf = (id) => {
        let n = 0; const xs = [];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = st.idx(x, y);
          if (st.flags[i] && st.type[i] === id) { n++; if (xs.length < 6) xs.push([x, y]); }
        }
        return { n, xs };
      };
      // 丛林带:地下 60 的 x 分布(粗分 64 桶)
      const buckets = new Array(64).fill(0);
      for (let y = surf; y < H - 200; y++) for (let x = 0; x < W; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === g60) buckets[(x / W * 64) | 0]++;
      }
      const jungleBand = buckets.indexOf(Math.max(...buckets));
      window.__bj214 = { g60, g238, g236, g233, g226, jungleBand, jungleX0: Math.floor(jungleBand * W / 64), jungleX1: Math.floor((jungleBand + 1) * W / 64), surf };

      // ---- 包桩 ----
      const ev = g.evolution;
      const C = window.__bj214c = { mechAll: 0, mechAllTrue: 0, mechAny: 0, mechAnyTrue: 0, pjp: 0, pjp238: 0, pjp236: 0, pjp233: 0, pjpFail: 0, pjp238Ok: 0 };
      const mechAllOrig = ev['mechAll'].bind(ev);
      ev['mechAll'] = () => { const r = mechAllOrig(); C.mechAll++; if (r) C.mechAllTrue++; return r; };
      const mechAnyOrig = ev['mechAny'].bind(ev);
      ev['mechAny'] = () => { const r = mechAnyOrig(); C.mechAny++; if (r) C.mechAnyTrue++; return r; };
      const pjpOrig = ev['placeJunglePlant'].bind(ev);
      ev['placeJunglePlant'] = (x2, y2, sheet, sx, sy) => {
        C.pjp++;
        if (sheet === 238) C.pjp238++;
        if (sheet === 236) C.pjp236++;
        if (sheet === 233) C.pjp233++;
        const r = pjpOrig(x2, y2, sheet, sx, sy);
        if (!r) C.pjpFail++;
        if (sheet === 238 && r) C.pjp238Ok++;
        return r;
      };
      // 保底链独立试一发(还原真实序:三旗首翻时 Game 调用)
      const burstBefore = countOf(g238).n;
      const burstRet = ev.planteraBulbBurst();
      const burstAfter = countOf(g238).n;
      return {
        ids: { g60, g238, g236, g233, g226 },
        grass60: countOf(g60).n, jungleBand, W, H, surf,
        burst: { ret: burstRet, before: burstBefore, after: burstAfter },
        pre238: countOf(g238).n, pre236: countOf(g236).n, pre233: countOf(g233).n, pre226: countOf(g226).n,
      };
    });
    log('scan+burst:', JSON.stringify(scan));

    // ---- 泵 1800 帧(30s 游戏时;rate=24 → 地下采样 ~1800/tick) ----
    const p1 = await pump(page, 1800, { step: 30, clearEnemies: true });
    const post = await page.evaluate(async () => {
      const g = window.__swGame;
      const st = g.world.store;
      const { TILE_INTERNAL_BY_SHEET } = await import('/src/data/tiles.ts');
      const ids = { 238: TILE_INTERNAL_BY_SHEET.get(238), 236: TILE_INTERNAL_BY_SHEET.get(236), 233: TILE_INTERNAL_BY_SHEET.get(233), 60: TILE_INTERNAL_BY_SHEET.get(60) };
      const countOf = (id) => {
        let n = 0; const xs = [];
        for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
          const i = st.idx(x, y);
          if (st.flags[i] && st.type[i] === id) { n++; if (xs.length < 8) xs.push([x, y]); }
        }
        return { n, xs };
      };
      const ev = g.evolution;
      return {
        counters: window.__bj214c,
        evHardMode: ev['hardMode'],
        post238: countOf(ids[238]), post236: countOf(ids[236]), post233: countOf(ids[233]),
        flagsNow: { hardMode: g.world.flags.hardMode, d134: g.world.flags.downed_134, d125: g.world.flags.downed_125, d127: g.world.flags.downed_127 },
      };
    });
    log('pump:', JSON.stringify(p1));
    log('post:', JSON.stringify(post));
  } finally {
    await closeAllBrowsers();
  }
} catch (e) {
  console.error('[bj214] FAIL', e?.stack ?? e);
  process.exit(1);
}
