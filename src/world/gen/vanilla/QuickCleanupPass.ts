// 原版 pass #70 "QuickCleanup"（1456 WorldGen.cs:17987-18107）1:1——2026-08-16 前
// 整 pass 缺失（GenSolid.ts 备案「cs:17997 头 137/130=false 本仓缺,备案」）。
// 注册序 FloatingIslandHouses(17971) < 本 pass < Pots(18108)；五子段常态全跑
// （notTheBees/roundLandmasses/dualDungeonsSeed 均秘种子门，普通种子不走）：
//   (a) 海洋带非水液体 → 水（liquidType(0)）；
//   (b) 海洋带表面沙（53）下方 Next(4,7) 深度填土（type 0=泥土！遇沙岩 397/
//       沙 53（k+1/k+2 再容 495 贝壳堆）即停）；★Next(4,7) 在 for 条件内=
//       每次判定各掷一次（含失败那掷），掷序=cs 实参左→右；
//   (c) 沙岩墙 187/硬化沙墙 216（地下沙漠天然墙，非大理石/花岗岩——墙 178/180
//       是 MarbleUnsafe/GraniteUnsafe）：泥 59/粉沙淤泥 123/雪泥 224/花岗 368/
//       大理 367 → 硬化沙 397（不查 active，幽灵 type 同改=原版语义）；液体二分：
//       j<=rockLayer 清液，否则任何液体→满 255 岩浆；
//   (d) 表面悬空沙下墙补齐：沙下格无墙且非实心 → 7×7 扫描取墙值回填。★C# 的
//       break 只断内层 m 循环——num=最右一列（含墙者）的最上方墙值，bug-for-bug；
//   (e) SaveSlopes 归一：非 active 或非 SaveSlopes 类型一律 ClearSlope（slope=0
//       +halfBrick=false）；平台外的可清生成块若上坡/半砖且下方不实心→清除
//       （225 蜂巢块半砖档豁免），下坡同理查上方；邻 137（机关陷阱）一并清除。
//
// SaveSlopes=Main.tileSolid∪NonSolidSaveSlopes{131,351,336,340,341,342,343,344}
// （TileID.cs:179/425-429）；Platforms={19,427,435-439}（TileID.cs:243）；
// CanBeClearedDuringGeneration=false 集=NOT_CLEARABLE（TileRunner，TileID.cs:321）。
// SolidTile（cs:42370）tileSolidTop 以 TILE_DEFS.platform 近似（TileCleanupPass
// 同口径，既有约定）。
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import { idsByVanillaSheet, NOT_CLEARABLE } from './TileRunner';
import { flipGenSolid, genSolidType } from './GenSolid';

/** sheet(=原版 tile id)→ 内部 id;未实装时 0（空格）安全退化 */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
const sid = (sheet: number): number => SHEET_TO_INTERNAL.get(sheet) ?? 0;

const SAND = sid(53);
const DIRT = sid(0);            // 原版 type 0 = 泥土（内部 EMPTY=0≠原版 0，见 tiles.ts）
const HARDSAND = sid(397);
const SHELLPILE = sid(495);     // (b) k+1/k+2 停止条件额外容许的贝壳堆
const MUD = sid(59);
const SILT = sid(123);
const SLUSH = sid(224);
const MARBLE = sid(367);
const GRANITE = sid(368);
const HIVE = sid(225);          // (e) 半砖豁免档（cs:18078）
const TRAP = sid(137);          // (e) 邻格机关陷阱 → 清除（cs:18084/18096）

const WALL_SANDSTONE = 187;     // WallID.Sandstone（地下沙漠天然沙岩墙）
const WALL_HARDSAND = 216;      // WallID.HardenedSand（天然硬化沙墙）

const NON_SOLID_SAVE_SLOPES = idsByVanillaSheet(131, 351, 336, 340, 341, 342, 343, 344);
const PLATFORMS = idsByVanillaSheet(19, 427, 435, 436, 437, 438, 439);

/** SaveSlopes[t] = tileSolid[t]（含 pass 头 137/130 翻转）∪ NonSolidSaveSlopes */
function isSaveSlope(t: number): boolean {
  return (genSolidType(t) && !!TILE_DEFS[t]?.solid) || NON_SOLID_SAVE_SLOPES.has(t);
}

/** WorldGen.SolidTile(cs:42370)：active && tileSolid && !tileSolidTop && !halfBrick
 *  && slope==0（tileSolidTop 以 platform 近似=TileCleanupPass 同口径） */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i];
  const d = TILE_DEFS[t];
  return genSolidType(t) && !!d && d.solid && !d.platform && st.half[i] === 0 && st.slope[i] === 0;
}

/** oceanDepths(cs:10978-10989)：y 超海洋层 false；横向进沙滩带 true
 *  （与 CorruptionPass/FinalCleanupPass 同式，oceanLevel=(ws+rl)/2+40 cs:4393） */
function oceanDepths(st: TileStore, gs: GenState, x: number, y: number): boolean {
  if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
  return x < gs.beachDistance || x > st.w - gs.beachDistance;
}

export function runQuickCleanupPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ★pass 头翻转（cs:17997-17998：机关陷阱 137/活性石 130 非实心），尾 cs:18104-05 还原
  flipGenSolid([137, 130], false);
  const { w, h } = st;
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const t = st.idx(i, j);

      // (a) 海洋带液体转水（cs:18005-18008）
      if (oceanDepths(st, gs, i, j) && st.liquid[t] > 0 && st.liquidType[t] !== LIQUID_TYPE.WATER) {
        st.liquidType[t] = LIQUID_TYPE.WATER;
      }

      // (b) 海洋带表面沙下方填土（cs:18009-18022）。Next(4,7) 在条件里=逐判定消耗
      if (j < gs.worldSurface && oceanDepths(st, gs, i, j) && st.flags[t] === 1 && st.type[t] === SAND) {
        if (st.slope[t] === 3 || st.slope[t] === 4) st.slope[t] = 0; // bottomSlope → slope(0)
        for (
          let k = j + 1;
          k < j + rng.int(4, 6)
            && (!st.flags[st.idx(i, k)] || (st.type[st.idx(i, k)] !== HARDSAND && st.type[st.idx(i, k)] !== SAND))
            && (!st.flags[st.idx(i, k + 1)] || (st.type[st.idx(i, k + 1)] !== HARDSAND && st.type[st.idx(i, k + 1)] !== SAND && st.type[st.idx(i, k + 1)] !== SHELLPILE))
            && (!st.flags[st.idx(i, k + 2)] || (st.type[st.idx(i, k + 2)] !== HARDSAND && st.type[st.idx(i, k + 2)] !== SAND && st.type[st.idx(i, k + 2)] !== SHELLPILE));
          k++
        ) {
          st.setTileSilent(i, k, DIRT);
          // cs:18017-18018：type=0(active) 落格后显式 halfBrick(false)+slope(0)——
          // setTileSilent 对非 0 内部 id 不清半砖/坡面（QQ 备案 2026-08-17；不补则
          // 残留 slope/half 进入 (e) 段 SaveSlopes 分支 → 半砖/坡门下被误清成空气，
          // 并污染后续 pass 的 SolidTile/树基门（#103 宝石树 half/slope 门级联）。
          st.half[st.idx(i, k)] = 0;
          st.slope[st.idx(i, k)] = 0;
        }
      }

      // (c) 沙岩/硬化沙墙内杂块转硬化沙 + 液体二分（cs:18023-18045，不查 active）
      if (st.wall[t] === WALL_SANDSTONE || st.wall[t] === WALL_HARDSAND) {
        if (st.type[t] === MUD || st.type[t] === SILT || st.type[t] === SLUSH) st.type[t] = HARDSAND;
        if (st.type[t] === GRANITE || st.type[t] === MARBLE) st.type[t] = HARDSAND;
        if (j <= gs.rockLevel) {
          st.liquid[t] = 0;
        } else if (st.liquid[t] > 0) {
          st.liquid[t] = 255;
          st.liquidType[t] = LIQUID_TYPE.LAVA;
        }
      }

      // (d) 表面悬空沙下墙补齐（cs:18046-18069）。★break 只断内层 m 循环——
      //     num 最终=从左到右各列首个墙值的最后覆盖（bug-for-bug 保留）
      if (j < gs.worldSurface && st.flags[t] === 1 && st.type[t] === SAND
        && st.wall[st.idx(i, j + 1)] === 0 && !solidTile(st, i, j + 1)) {
        let num = 0;
        for (let l = i - 3; l <= i + 3; l++) {
          for (let m = j - 3; m <= j + 3; m++) {
            const wm = st.wall[st.idx(l, m)];
            if (wm > 0) {
              num = wm;
              break; // 仅断 m 循环（原版 cs:18058 同）
            }
          }
        }
        if (num > 0) {
          st.wall[st.idx(i, j + 1)] = num;
          if (st.wall[t] === 0) st.wall[t] = num;
        }
      }

      // (e) SaveSlopes 坡面/半砖归一（cs:18070-18101）
      if (!st.flags[t] || !isSaveSlope(st.type[t])) {
        st.slope[t] = 0;
        st.half[t] = 0; // ClearSlope = slope(0)+halfBrick(false)（Tile.cs:158-163）
      } else if (!PLATFORMS.has(st.type[t]) && !NOT_CLEARABLE.has(st.type[t])) {
        const topSlope = st.slope[t] === 1 || st.slope[t] === 2;
        const bottomSlope = st.slope[t] === 3 || st.slope[t] === 4;
        if (topSlope || st.half[t] === 1) {
          if (st.type[t] !== HIVE || st.half[t] === 0) {
            if (!solidTile(st, i, j + 1)) st.setTileSilent(i, j, 0);
            if (st.type[st.idx(i + 1, j)] === TRAP || st.type[st.idx(i - 1, j)] === TRAP) st.setTileSilent(i, j, 0);
          }
        } else if (bottomSlope) {
          if (!solidTile(st, i, j - 1)) st.setTileSilent(i, j, 0);
          if (st.type[st.idx(i + 1, j)] === TRAP || st.type[st.idx(i - 1, j)] === TRAP) st.setTileSilent(i, j, 0);
        }
      }
    }
  }
  // pass 尾还原（cs:18104-18105）
  flipGenSolid([137, 130], true);
}
