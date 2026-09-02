// IIII115c 一次性探针：LivingTrees pass 入口（__swLtCap 钩）实测
//   ①seedFlags.extraFloatingIslands 是否到场  ②世界云族格数/最低云行  ③num2 候选
// 用法: cd game && SW_MB_1457=1 SW_154A=1 npx vitest run tools/_iii154a.test.ts --no-file-parallelism
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_154A === '1';
const SEED = process.env.SW_154A_SEED ?? '1.1.1.0.thecarebearsmovie|106102';
const CLOUD_SHEETS = new Set([189, 196, 460, 717, 718, 719]);

(RUN ? it : it.skip)('iiii154c lt anchor probe', { timeout: 900000 }, async () => {
  const g0 = globalThis as { __swLtCap?: (gs: unknown, st: unknown) => void };
  g0.__swLtCap = (gsRaw: unknown, stRaw: unknown) => {
    const gs = gsRaw as { seedFlags?: Record<string, boolean>; worldSurface: number };
    const st = stRaw as { w: number; idx: (x: number, y: number) => number; flags: Uint8Array; type: Uint16Array };
    let lo = 0;
    let cnt = 0;
    const rowHits = new Map<number, number>();
    for (let y = 20; y < gs.worldSurface; y++) {
      for (let x = 20; x < st.w - 20; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && CLOUD_SHEETS.has(TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1)) {
          cnt++;
          lo = y;
          rowHits.set(y, (rowHits.get(y) ?? 0) + 1);
        }
      }
    }
    const rows = [...rowHits.keys()].sort((a, b) => a - b);
    console.log(`[154a] eFI=${gs.seedFlags?.extraFloatingIslands} eLT=${gs.seedFlags?.extraLivingTrees} ` +
      `wS=${gs.worldSurface} cloudCells=${cnt} lowestRow=${lo} num2=${lo + 1} ` +
      `rowRange=${rows[0]}..${rows[rows.length - 1]} distinctRows=${rows.length}`);
    // 兼查锚格样本：x=2540 列自 num2 起扫首个 active
    const x0 = 2540;
    let j = lo + 1;
    for (; j < gs.worldSurface; j++) {
      if (st.flags[st.idx(x0, j)]) break;
    }
    const t = st.flags[st.idx(x0, j)] ? TILE_DEFS[st.type[st.idx(x0, j)]]?.vanilla?.sheet : -1;
    let j0 = 0;
    for (; j0 < gs.worldSurface; j0++) {
      if (st.flags[st.idx(x0, j0)]) break;
    }
    const t0 = st.flags[st.idx(x0, j0)] ? TILE_DEFS[st.type[st.idx(x0, j0)]]?.vanilla?.sheet : -1;
    console.log(`[154a] col2540 scanFromNum2 firstActive=(${x0},${j}) sheet=${t} | scanFrom0 firstActive=(${x0},${j0}) sheet=${t0}`);
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: SEED, evil: -1 as -1 | 0 | 1,
      seedFlags: { extraFloatingIslands: true },
    });
  } finally {
    delete g0.__swLtCap;
  }
});
