// 原版两个高可见小件 pass（1456 WorldGen.cs）1:1：
//   RemoveSurfaceWaterAboveSand（cs:16295-16326）：地表沙柱上方悬空水清除，
//     注册序 SettleLiquids(16215) < 本 pass < Oasis(16327)——须在贝壳堆之前。
//   FragileIceOverIceBiomeWater（cs:16756-16785 + MakeWateryIceThing cs:80206）：
//     冰原水面上铺 BreakableIce 162（薄冰），注册序 Waterfalls(16697) < 本 pass <
//     CaveWallVariety(16786)。
// 两 pass 均零掷骰（纯扫描），不影响 RNG 流。
import type { TileStore } from '../../TileStore';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';

const SAND = TILE_BY_KEY['sand']!;                 // 53
const SAND_HARD = TILE_BY_KEY['hardened_sand']!;   // 397
const SANDSTONE = TILE_BY_KEY['sandstone']!;       // 396？原版 404=Sandstone，见下
const THIN_ICE = TILE_BY_KEY['thin_ice']!;         // tile 162 BreakableIce

// 内部 tile id → 原版 sheet id
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** TileID.Sets.Snow（TileID.cs:291）= {147}；Sets.Ices（:293）= {161,200,163,164} */
const SNOW_OR_ICE = new Set([147, 161, 200, 163, 164]);

/** RemoveSurfaceWaterAboveSand（cs:16295-16326）：
 *  x∈[400,w-400]，自 y=100 下扫到首个 active 格即停（break 在任何分支后），
 *  沙族 {53,396,397,404,407,151} → 向上清液体直到遇到 active。零掷骰。 */
export function runRemoveSurfaceWaterAboveSandPass(st: TileStore, gs: GenState): void {
  for (let x = 400; x < st.w - 400; x++) {
    for (let y = 100; y < gs.worldSurface - 1; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const s = SHEET[st.type[i]];
      if (s === 53 || s === 396 || s === 397 || s === 404 || s === 407 || s === 151) {
        let num = y;
        while (num > 100) {
          num--;
          if (st.flags[st.idx(x, num)]) break;
          st.liquid[st.idx(x, num)] = 0;
        }
      }
      break;   // cs:16321：首格判定后无论命中与否都结束该列
    }
  }
  void SAND; void SAND_HARD; void SANDSTONE;
}

/** MakeWateryIceThing（cs:80206-80246）1:1：水柱底为雪/冰族 → 沿水面线左右铺薄冰 162。
 *  门禁：上格无液无块、前进侧邻格非半砖；越界即止。 */
function makeWateryIceThing(st: TileStore, i: number, j: number): void {
  const inWorld = (x: number, y: number): boolean =>
    x >= 1 && y >= 1 && x < st.w - 1 && y < st.h - 1;
  if (!inWorld(i, j)) return;
  const start = st.idx(i, j);
  if (st.liquid[start] <= 0 || st.flags[start]) return;
  if (st.liquidType[start] === 2) return;          // 岩浆跳过（remix 分支不触发）
  let num = j;
  while (!st.flags[st.idx(i, num)] && st.liquid[st.idx(i, num)] > 0) {
    num++;
    if (num > st.h - 50) return;
  }
  if (!st.flags[st.idx(i, num)] || !SNOW_OR_ICE.has(SHEET[st.type[st.idx(i, num)]])) return;
  num--;
  while (st.liquid[st.idx(i, num)] > 0) {
    num--;
    if (num < 10) return;
  }
  if (st.flags[st.idx(i, num)]) return;
  num++;
  if (!st.flags[st.idx(i, num)]) {
    // 水面线（num 行）：向左直到门禁破，再从 i+1 向右
    let x = i;
    for (;;) {
      if (!inWorld(x, num)) break;
      const k = st.idx(x, num);
      if (st.flags[k] || st.liquid[k] <= 0) break;
      const up = st.idx(x, num - 1);
      if (st.liquid[up] !== 0 || st.flags[up]) break;
      if (st.half[st.idx(x - 1, num)]) break;
      st.setTileSilent(x, num, THIN_ICE, 0, 0);    // PlaceTile(162, mute)
      x--;
    }
    for (let x2 = i + 1;; x2++) {
      if (!inWorld(x2, num)) break;
      const k = st.idx(x2, num);
      if (st.flags[k] || st.liquid[k] <= 0) break;
      const up = st.idx(x2, num - 1);
      if (st.liquid[up] !== 0 || st.flags[up]) break;
      if (st.half[st.idx(x2 + 1, num)]) break;
      st.setTileSilent(x2, num, THIN_ICE, 0, 0);
    }
  }
}

/** FragileIce pass（cs:16756-16785）：y∈[(int)worldSurface, h-100) 的液体格（岩浆跳过）
 *  → MakeWateryIceThing。零掷骰。 */
export function runFragileIcePass(st: TileStore, gs: GenState): void {
  const y0 = Math.floor(gs.worldSurface);
  const y1 = st.h - 100;
  for (let x = 10; x < st.w - 10; x++) {
    for (let y = y0; y < y1; y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] !== 2) makeWateryIceThing(st, x, y);
    }
  }
}
