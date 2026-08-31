// 原版 pass 24 "Dirt To Mud"（cs:13172-13191）+ 25 "Silt"（cs:13192-13231）1:1。
// Dirt To Mud：area×0.001 个小泥 runner 铺深层（ignoreTileType=53 避沙）；
// Silt：两档淤泥 123 脉（沙漠墙 187/216 区跳过）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner } from './TileRunner';

const MUD = TILE_BY_KEY['mud']!;
const SILT = TILE_BY_KEY['silt']!;
const SAND = T.SAND;

/** #24 Dirt To Mud（cs:13172）：Next(0,w) × Next(GenVars.rockLayerLow, h)，
 *  强度 Next(2,6)/步数 Next(2,40)，overRide + ignoreTileType=53（沙不可覆盖）。
 *  ★IIIII58 REMIX（cs:13180-13182 三元第二支）：Y 带 = Next((int)Main.worldSurface,
 *  (int)GenVars.rockLayerLow)——泥 runner 整体抬到浅层带。 */
export function runDirtToMudPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const count = (w * h) * 0.001;
  for (let n = 0; n < count; n++) {
    // ★IIIII58：REMIX 世界 Y ∈ [(int)Main.worldSurface, (int)GenVars.rockLayerLow)
    const jLo = !!gs.seedFlags.remix ? gs.worldSurface : gs.rockLevelLow;
    const jHi = !!gs.seedFlags.remix ? gs.rockLevelLow - 1 : h - 1;
    tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(jLo, jHi), {
      strength: rng.int(2, 5), steps: rng.int(2, 39), type: MUD, ignoreTileType: SAND,
    });
  }
}

/** #25 Silt（cs:13192）：大脉 area×0.0001（Next(5,12)/Next(15,50)）+
 *  小脉 area×0.0005（Next(2,5)/Next(2,5)）；起点墙 187/216 跳过（掷点照掷）。
 *  ★IIIII58 REMIX（cs:13217-13219/13234-13236）：Y 深掷 **无条件先掷**
 *  Next((int)GenVars.rockLayerHigh, h)，remix 下再补一掷 Next((int)Main.worldSurface,
 *  (int)Main.rockLayer) 覆写——每 runner 两掷，漏先掷则流位错位。 */
export function runSiltPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  for (let n = 0, count = Math.floor(w * h * 0.0001); n < count; n++) {
    const i = rng.int(0, w - 1);
    let j = rng.int(gs.rockLevelHigh, h - 1);
    if (!!gs.seedFlags.remix) j = rng.int(gs.worldSurface, gs.rockLevel - 1);
    const wall = st.wall[st.idx(i, j)];
    if (wall !== 187 && wall !== 216) {
      tileRunner(st, rng, gs, i, j, { strength: rng.int(5, 11), steps: rng.int(15, 49), type: SILT });
    }
  }
  for (let n = 0, count = Math.floor(w * h * 0.0005); n < count; n++) {
    const i = rng.int(0, w - 1);
    let j = rng.int(gs.rockLevelHigh, h - 1);
    if (!!gs.seedFlags.remix) j = rng.int(gs.worldSurface, gs.rockLevel - 1);
    const wall = st.wall[st.idx(i, j)];
    if (wall !== 187 && wall !== 216) {
      tileRunner(st, rng, gs, i, j, { strength: rng.int(2, 4), steps: rng.int(2, 4), type: SILT });
    }
  }
}

/** 合并入口（WorldGen.ts 原调用点：两 pass 注册序相邻）。DirtToMud(13172)/Silt(13192)
 *  各自是独立 GenPass——RunPass 每 pass 前重播种子。★进度：DirtToMud 窗由包装层
 *  beginVan；本层只补 Silt 子窗。 */
export function runDirtToMudAndSiltPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  rng.reseed(gs.seed);                        // ▶DirtToMud cs:13172
  runDirtToMudPass(st, rng, gs);
  rng.reseed(gs.seed); gp?.beginVan('Silt');  // ▶Silt cs:13192
  runSiltPass(st, rng, gs);
}
