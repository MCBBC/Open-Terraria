// GGGG（用户报障"无根树"）：树底地面格分类对账 —— JS 生成 vs x86 金标 s12345.wld。
// 判据：逐列扫树干(sheet 5)连续竖跑(≥3)的最低格 yb，取 (x, yb+1) 分类。
// x86 原版树底只有实心族（花圃击杀干基后 CheckTree 级联整树坍塌，不留浮空树）；
// 修复前 JS 干基被花草替换后整干浮空一格（seed 12345 小世界 15 列实锤）。
// 用法：cd game && SW_GGGG=1 npx vitest run tools/_gggg.test.ts
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { parseWld } from '../src/wld/WldParser';

const RUN = process.env.SW_GGGG === '1';

interface Col { yb: number; gKey: string; gFx: number; run: number }
type Cols = Map<number, Col>;

/** 列扫：连续竖跑 ≥ minRun 才算干列（滤侧枝列/冠标孤格）；yb = 跑底 */
function scanCols(w: number, h: number, act: (x: number, y: number) => boolean,
  sheet: (x: number, y: number) => number, fx: (x: number, y: number) => number, minRun = 3): Cols {
  const m: Cols = new Map();
  for (let x = 0; x < w; x++) {
    let bestEnd = -1, bestRun = 0, run = 0;
    for (let y = 0; y < h; y++) {
      if (act(x, y) && sheet(x, y) === 5) {
        run++;
        if (run >= bestRun) { bestRun = run; bestEnd = y; }   // 跑底 = 连续段最后一格
      } else run = 0;
    }
    const bestYb = bestEnd;
    if (bestRun < minRun) continue;
    const gA = bestYb + 1 < h ? act(x, bestYb + 1) : false;
    const gS = bestYb + 1 < h ? sheet(x, bestYb + 1) : -1;
    m.set(x, { yb: bestYb, gKey: gA ? String(gS) : 'air', gFx: gA && bestYb + 1 < h ? fx(x, bestYb + 1) : -1, run: bestRun });
  }
  return m;
}
const histOf = (m: Cols) => {
  const h = new Map<string, number>();
  for (const v of m.values()) h.set(v.gKey, (h.get(v.gKey) ?? 0) + 1);
  return Object.fromEntries([...h.entries()].sort());
};
const badOf = (m: Cols) => [...m.entries()].filter(([, v]) => v.gKey === '73' || v.gKey === '3')
  .map(([x, v]) => ({ x, yb: v.yb, g: v.gKey, fx: v.gFx }));

(RUN ? it : it.skip)('seed 12345：树底地面格全实心族，无 73/3 垫底', async () => {
  const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const s = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof s === 'number') SHEET[i] = s;
  }
  // ---- x86 金标（只读）----
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
  const wt = wld.tiles, WW = wld.tilesWide;
  const x86 = scanCols(WW, wld.tilesHigh,
    (x, y) => wt.active[y * WW + x] === 1,
    (x, y) => wt.type[y * WW + x],
    (x, y) => wt.frameX[y * WW + x]);
  console.log('[x86] 干列:', x86.size, JSON.stringify(histOf(x86)), 'bad:', badOf(x86).length);

  // ---- JS 生成 ----
  const snaps: Array<{ name: string; cols: Cols }> = [];
  const SNAP = new Set(['栽树', '地表植物', '地表花']);
  const world = await generateWorld({
    width: 4200, height: 1200, seedText: '12345', name: 'gggg',
    onWorldPartial: (wd, _i, name) => {
      if (!SNAP.has(name)) return;
      const st = wd.store;
      const gsY = Math.floor(lastGenState()?.worldSurface ?? 400);
      snaps.push({
        name,
        cols: scanCols(st.w, Math.min(st.h, gsY + 80),
          (x, y) => st.flags[st.idx(x, y)] !== 0,
          (x, y) => SHEET[st.type[st.idx(x, y)]],
          (x, y) => st.frameX[st.idx(x, y)]),
      });
    },
  });
  const st = world.store;
  const gsY = Math.floor(lastGenState()?.worldSurface ?? 400);
  const js = scanCols(st.w, Math.min(st.h, gsY + 80),
    (x, y) => st.flags[st.idx(x, y)] !== 0,
    (x, y) => SHEET[st.type[st.idx(x, y)]],
    (x, y) => st.frameX[st.idx(x, y)]);
  for (const s of snaps) console.log(`[js:${s.name}] 干列:`, s.cols.size, JSON.stringify(histOf(s.cols)), 'bad:', badOf(s.cols).length);
  const bad = badOf(js);
  console.log('[js:final] 干列:', js.size, JSON.stringify(histOf(js)), 'bad:', bad.length, JSON.stringify(bad.slice(0, 10)));

  // ---- 断言：无 73/3 垫底（实心族+air 边缘列合法）----
  expect(bad.length).toBe(0);
  // ---- 树列错位清单（终局复验移交：上游槽 54-105 债级联，非本批修复域）----
  const jsXs = new Set(js.keys()), x86Xs = new Set(x86.keys());
  const onlyJs = [...jsXs].filter((x) => !x86Xs.has(x)).sort((a, b) => a - b);
  const onlyX86 = [...x86Xs].filter((x) => !jsXs.has(x)).sort((a, b) => a - b);
  const common = [...jsXs].filter((x) => x86Xs.has(x));
  const sameFrame = common.filter((x) => {
    const a = js.get(x)!, b = x86.get(x)!;
    return a.yb === b.yb && a.gKey === b.gKey;
  });
  console.log('[cols] js:', jsXs.size, 'x86:', x86Xs.size, '同位:', common.length, '同位同底:', sameFrame.length);
  console.log('[cols] 仅JS列(', onlyJs.length, '):', JSON.stringify(onlyJs));
  console.log('[cols] 仅x86列(', onlyX86.length, '):', JSON.stringify(onlyX86));
}, 600_000);
