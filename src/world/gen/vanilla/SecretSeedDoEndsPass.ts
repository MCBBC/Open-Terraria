// IIIII16 批（2026-08-28）：秘种子「生成终结面」九枚 P0 端点（SecretSeed.Do* 族）。
// 真值锚 = Terarria1457/Terraria/WorldGen.cs（1458 增量已 diff 对拍——本文件覆盖的全部
// 函数体（2077-2182 / 2715-2869 / initializeHardMode 31858-31988）两树逐字节相等）。
//
// vanilla 调用位（照搬，不新增语义点；JS 接线见 WorldGen.ts 各「★IIIII16」注）：
//   - DoDigExtraHoles          :2853 → Grass pass 头（:12470，!Skyblock.denyAllGeneration
//                                 门内、DoRoundLandMasses 与撒草循环之前）
//   - DoSurfaceIsMushrooms 首掷 :2095 → MudCavesToJungleGrass pass 内 NotTheBees() 之后、
//                                 SpreadGrass 扫描之前（:12517-12520，仅 !noSurface 臂）
//   - 南瓜臂                   :20232 → GrassPlantsEvilPlantsAndPumpkinsOnSurface pass 头，
//                                 halloweenGen || endlessHalloween 门（PlacePumpkin :52898 /
//                                 GrowPumpkin :52950）
//   - SecretSeed.FinalizeSecretSeeds() :589-693（原版在 FinalCleanup pass 体 cs:22666、
//                                 ShimmerCleanUp 之前调用；本仓接线 = WorldGen.ts
//                                 finalCleanupPass 的 opts.beforeShimmer 钩，在既有
//                                 finalSeedCleanup 之前执行）。本模块只承接本批九旗标
//                                 对应的端点子集，执行序按原版 if 链逐条对齐：
//                                 space(:2077) → mushrooms(:607-614 的 ×2 重复调用怪癖照录)
//                                 → noInfection(:1911) → hallowOnTheSurface(:1956) →
//                                 startInHardmode(:1905) → rainbowStuff(:2715)。
//                                 未承接端点（surfaceIsDesertFinish/extraLiquidFinish/
//                                 actuallyNoTraps/worldIsFrozen/worldIsInfected/noSurface/
//                                 coat·paint 家族/randomSpawn/portalGun/teamBased/
//                                 errorWorld 等）属其他车道债（docs 批章）；旗标未开时
//                                 原版同样零行为零掷骰 → 普通种子对金标链零扰动。
//   - graveyardBloodmoonStart 初始态：WorldFile.ResetTempsToDayTime（WorldFile.cs:1011-
//                                 1024）——首存复位 dayTime=false/bloodMoon=true/time=1.0/
//                                 moonPhase=0。tile 面（SpawnGraveyardBiomesEverywhere）
//                                 已在 WorldGen.ts potPass 槽落地（graveyardSeedGate），
//                                 此处只补时钟初始态。
//
// RNG 纪律：每个 Do* 的 genRand 消费逐语句转录，含短路：
//   case0 墙 63/65 支 Next(10)、wall80 支 Next(3) 左支必掷右支短路；
//   hallow / mushroom 边界 per-column Next(3)；rainbow 巨石 Next(4)、旗帜 Next(5)||
//   (j<ws&&Next(2))、播种双掷（Next(w)×2 per attempt）、箱染 Next(3)（满箱无空槽时不掷池）、
//   苔砖扫掷 Next(50..)/Next(4,13)；南瓜 Next(15)/PlacePumpkin Next(6)/Next(5) 成长串。
// ★IIIII80 勘误：C# Next(a,b) 右开区间 ⇔ JS rng.nextIntRange(a, b)**原样直传**（helper
// 即 Exclusive-upper 镜像）；「-1 再收一格」系历史误读（曾全文件所有 b 偏低一格）。
// 整数掷 Next(n) 用 rng.nextInt(n)；含上界掷用 rng.int(a,b)。
// 普通种子（九旗全关）：模块零钩入零消费。
//
// 已知近似（零掷骰差，批章登记）：
//   ① Convert_ActuallyConvert{Tile,Wall} 后的 SquareTileFrame/SquareWallFrame 邻格重帧未
//      模拟——转化目标均为 auto-frame 虚拟化类（草/石/泥/冰/沙墙），绘制期虚拟帧兜底
//      （clay-blend-virtualized-frames 同判据）；
//   ② TryConvertingOrKillingTreesAboveIfTheyWouldBecomeInvalid 按 profile GroundTest ∪
//      Conversion 组合判定后杀干基单格（genKillTile 承载 CheckTree 整树坍塌级联）；
//      ConvertTreeAndGround 整树换种臂（596/616/634↔5/323 双向）未移植——finalize 时点
//      树基与转化面重叠罕见，出现即落为坍塌级联而非换种；
//   ③ DoRainbowStuff 播种臂 PlaceTile→Place2x2(126 discoball) 按 acceptance 门直译
//      （cs:51780-51873），不含通用 PlaceTile 全前置门清单——discoball 相关门已被函数体
//      自身条件 + 天花板实心门覆盖；
//   ④ 箱染尾段以 compact items 数组等价实现「首空槽插入」（SW ChestData 无稀疏槽位模型）；
//   ⑤ OverGrownDungeonWithRainbowMoss 的 PlaceTile(184, style=10) 苔芽简化为空格+任一实心
//      邻支撑门直写帧 frameX=180。

import type { RNG } from '../../../core/rng';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import { TileStore, LIQUID_TYPE } from '../../TileStore';
import type { GenState } from './GenState';
import type { World } from '../../World';
import type { SeedFlags } from '../SeedEasterEggs';
import { noSpiderCavesActuallyNoSpiderCaves } from '../SeedEasterEggs';   // ★IIIII41-T3② 变体门
import { flipGenSolid, genSolidType, VAN_TILE_SOLID_EXTRA } from './GenSolid';
import { initializeHardMode } from './HardmodePass';
import { genKillTile, genSquareTileFrame } from './FinalCleanupPass';
import { sheetId } from './TileCleanupPass';
import { tileRunner } from './TileRunner';
import { hurtTiles } from '../../../stats/TouchDamage';
import { TILE_REMOVE_WHEN_UNDER_SPAWN } from '../../../data/vanillaSets1457';
import { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } from '../../../data/items';
import { equipKindOfVid } from '../../../data/vanillaEquip';

// ---------- sheet ↔ 内部 id 映射 ----------
const SHEET_OF_TYPE = new Int32Array(TILE_DEFS.length).fill(-1);
for (let _i = 0; _i < TILE_DEFS.length; _i++) {
  const s = TILE_DEFS[_i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF_TYPE[_i] = s;
}
const INTERNAL_OF_SHEET = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const sh = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof sh === 'number' && !INTERNAL_OF_SHEET.has(sh)) INTERNAL_OF_SHEET.set(sh, i);
}
const idOf = (sheet: number): number => INTERNAL_OF_SHEET.get(sheet) ?? 0;

/** 物品 vid → 内部物品 id（BuriedChestsPass.vid 同型；-1 = 未注册静默丢） */
const VID_TABLE: Record<number, number> = (() => {
  const m: Record<number, number> = {};
  for (const [vidStr, k] of Object.entries(VANILLA_ITEM_KEY_BY_ID)) {
    m[Number(vidStr)] = ITEM_BY_KEY[k] ?? -1;
  }
  return m;
})();

// ---------- TileID.Sets.Conversion / WallID.Sets.Conversion / Main.tileMoss（1457 终值） ----------
const CONV_GRASS = new Set([2, 23, 199, 109, 477, 492]);            // TileID.cs:38
const CONV_JUNGLE_GRASS = new Set([60, 661, 662]);
const CONV_MUSHROOM_GRASS = new Set([70]);
const CONV_GOLF_GRASS = new Set([477, 492]);
const CONV_SNOW = new Set([147]);
const CONV_STONE = new Set([1, 25, 117, 203]);
const CONV_ICE = new Set([161, 163, 164, 200]);
const CONV_SAND = new Set([53, 112, 116, 234]);
const CONV_HARDENED_SAND = new Set([397, 398, 402, 399]);
const CONV_SANDSTONE = new Set([396, 400, 403, 401]);
const CONV_THORN = new Set([32, 352, 69, 655]);
const TILE_MOSS = new Set([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]); // Main.cs:7146-7187

const WALL_CONV_GRASS = new Set([63, 64, 65, 66, 67, 68, 69, 70, 81, 264, 265, 268]);
const WALL_CONV_STONE = new Set([1, 61, 185, 3, 28, 83, 262, 274, 246, 248, 269, 349]);
const WALL_CONV_HARDENED_SAND = new Set([216, 217, 219, 218, 304, 305, 307, 306]);
const WALL_CONV_SANDSTONE = new Set([187, 220, 222, 221, 275, 308, 310, 309]);
const WALL_CONV_NEW1 = new Set([188, 192, 200, 204, 212, 276, 280, 288, 292, 300]);
const WALL_CONV_NEW2 = new Set([189, 193, 201, 205, 213, 277, 281, 289, 293, 301]);
const WALL_CONV_NEW3 = new Set([190, 194, 202, 206, 214, 278, 282, 290, 294, 302]);
const WALL_CONV_NEW4 = new Set([191, 195, 203, 207, 215, 279, 283, 291, 295, 303]);
const WALL_GLOW_MUSHROOM = new Set([64, 67, 15, 247]);              // WallID.cs CanBeConvertedToGlowingMushroom

/** TileID.Sets.IsATreeTrunk（TileID.cs:161） */
const IS_A_TREE_TRUNK = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);

/** GrowTreeSettings profile GroundTest 集（TreePass.ts 同值；自持防横向耦合） */
const GEM_TREE_GROUND = new Set<number>([1, 25, 117, 203, ...TILE_MOSS]);
const VANITY_TREE_GROUND = new Set([2, 109, 477, 492]);
const ASH_TREE_GROUND = new Set([633]);
function treeGroundTest(trunkSheet: number, floorSheet: number): boolean | null {
  switch (trunkSheet) {
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
      return GEM_TREE_GROUND.has(floorSheet);
    case 596: case 616:
      return VANITY_TREE_GROUND.has(floorSheet);
    case 634:
      return ASH_TREE_GROUND.has(floorSheet);
    default:
      return null;        // 无 profile（森林树 5 等）→ 仅 Conversion 组合判定
  }
}

// ---------- 低层助手 ----------
/** SolidTile(i,j) = active && Main.tileSolid[type]（生成期口径；HalfBrick/slope 衍生语义
 *  由调用方叠加——仓库既有约定） */
function solidTileAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && genSolidType(st.type[i]);
}
/** nactive && tileSolid && !tileSolidTop —— discoball 天花板门（cs:51815） */
function solidNonTopAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if ((st.wire[i] & 32) !== 0) return false;                          // inActive(致动)
  const sh = SHEET_OF_TYPE[st.type[i]];
  if (sh < 0 || VAN_TILE_SOLID_EXTRA.has(sh)) return false;           // tileSolidTop 家族豁免
  return genSolidType(st.type[i]);
}
/** ClearBlockPaintAndCoating（Tile.cs:934-939：color/fullbright/invisible 三清，只清方块侧） */
function clearPaintCoat(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.paint[i] = 0;
  st.coat[i] &= ~TileStore.COAT_BLOCK_MASK;
}

// ---------- Convert_ActuallyConvert{Tile,Wall,Torch}（cs:56762-56818） ----------
/** tile 转化：活性且类型真变才写；树护栏上提显式化（vanilla 在 Convert_ActuallyConvertTile
 *  内部调用 TryConvertingOrKillingTreesAboveIfTheyWouldBecomeInvalid）。不清油漆。 */
function convertActuallyTile(st: TileStore, rng: RNG, x: number, y: number, newSheet: number): void {
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  if (SHEET_OF_TYPE[st.type[i]] === newSheet) return;
  tryConvertingOrKillingTreesAbove(st, rng, x, y, newSheet);          // cs:56792
  st.type[i] = idOf(newSheet);
}
/** Convert_ActuallyConvertWall（cs:56804-56817）：墙 0 或同值跳过；不清墙漆。 */
function convertActuallyWall(st: TileStore, x: number, y: number, newWall: number): void {
  const i = st.idx(x, y);
  if (st.wall[i] === 0 || st.wall[i] === newWall) return;
  st.wall[i] = newWall;
}
/** Convert_ActuallyConvertTorch（cs:56762-56785）：火把样式帧改写；num==22 时净化目标恒 21。 */
function convertActuallyTorch(st: TileStore, x: number, y: number, newStyle: number): void {
  const i = st.idx(x, y);
  if (!st.inBounds(x, y)) return;
  if (!st.flags[i] || SHEET_OF_TYPE[st.type[i]] !== 4) return;
  const num = Math.trunc(st.frameY[i] / 22);
  let style = newStyle;
  if (num === 22) style = 21;                                         // cs:56769-56772
  if (num !== style) st.frameY[i] = style * 22;
}

/** TileID.Conversion.Torch(tile, conversionType)（TileID.cs:44-70） */
function torchConvertible(sheet: number, frameY: number, conversionType: number): boolean {
  if (sheet !== 4) return false;
  const num = Math.trunc(frameY / 22);
  if (conversionType === 0) return (num >= 18 && num <= 20) || num === 22;
  return num === 0 || num === 9 || num === 16 || (num >= 18 && num <= 22);
}

/** TileID.Sets.IsATreeTrunk（不含 323 的分支/根判定用；vanilla 分支检测内部排除 323） */
function isTileATreeBranchCore(st: TileStore, x: number, y: number): -1 | 0 | 1 {
  if (!st.inBounds(x, y)) return 0;
  const i = st.idx(x, y);
  if (!st.flags[i]) return 0;
  const sh = SHEET_OF_TYPE[st.type[i]];
  if (sh === 323 || !IS_A_TREE_TRUNK.has(sh)) return 0;
  const fx = st.frameX[i], fy = st.frameY[i];
  // cs:55468-55477：fx44|fy198/220/242 与 fx66|fy0/22/44 → trunk 在右(+1)
  if ((fx === 44 && (fy === 198 || fy === 220 || fy === 242))
    || (fx === 66 && (fy === 0 || fy === 22 || fy === 44))) return 1;
  // fx66|fy198/220/242 与 fx88|fy66/88/110 → trunk 在左(−1)
  if ((fx === 66 && (fy === 198 || fy === 220 || fy === 242))
    || (fx === 88 && (fy === 66 || fy === 88 || fy === 110))) return -1;
  return 0;
}
function isTileATreeRootCore(st: TileStore, x: number, y: number): -1 | 0 | 1 {
  if (!st.inBounds(x, y)) return 0;
  const i = st.idx(x, y);
  if (!st.flags[i]) return 0;
  const sh = SHEET_OF_TYPE[st.type[i]];
  if (sh === 323 || !IS_A_TREE_TRUNK.has(sh)) return 0;
  const fx = st.frameX[i], fy = st.frameY[i];
  if (fx === 44 && (fy === 132 || fy === 154 || fy === 176)) return 1;   // +1 右根
  if (fx === 22 && (fy === 132 || fy === 154 || fy === 176)) return -1;  // −1 左根
  return 0;
}

/** ConvertTreeAndGround_Branches（cs:55372）：左右邻枝/根换种（零掷） */
function convertTreeAndGroundBranches(st: TileStore, x: number, y: number, newTreeSheet: number): void {
  const nt = idOf(newTreeSheet);
  const lB = isTileATreeBranchCore(st, x - 1, y), lR = isTileATreeRootCore(st, x - 1, y);
  if ((lB === 1) || (lR === 1)) st.type[st.idx(x - 1, y)] = nt;
  const rB = isTileATreeBranchCore(st, x + 1, y), rR = isTileATreeRootCore(st, x + 1, y);
  if ((rB === -1) || (rR === -1)) st.type[st.idx(x + 1, y)] = nt;
}

/** ConvertTreeAndGround（cs:55385-55519）整树换种+地面改型。x,y=地面格；掷骰域仅在
 *  old=323 支（base/top/middle 三段 Next）。全部帧写即原版字面量。 */
function convertTreeAndGround(
  st: TileStore, rng: RNG, gs: GenState,
  x: number, y: number, newFloorSheet: number, oldTreeSheet: number, newTreeSheet: number,
): void {
  if (!(x >= 5 && y >= 5 && x < st.w - 5 && y < st.h - 5)) return;       // InWorld(...,5)
  if (!st.flags[st.idx(x, y + 1)]) return;
  let num = 100, num2 = 1;
  while (num > 0) {
    num--;
    if (!(x >= 5 && (y - 1 - num2) >= 5 && x < st.w - 5 && (y - 1 - num2) < st.h - 5)) break;
    const k = st.idx(x, y - 1 - num2);
    const sh = st.flags[k] ? SHEET_OF_TYPE[st.type[k]] : -1;
    if (!st.flags[k] || (sh !== 323 && !IS_A_TREE_TRUNK.has(sh))) break;
    if (isTileATreeBranchCore(st, x, y - 1) !== 0) break;               // cs:55411 字面（注意查的是 y-1）
    num2++;
  }
  if (isTileATreeBranchCore(st, x, y) !== 0 || isTileATreeRootCore(st, x, y) !== 0) {
    genKillTile(st, rng, x, y);
    return;
  }
  const nt = idOf(newTreeSheet);
  if (newTreeSheet === 323) {
    for (let i2 = 0; i2 <= num2; i2++) {
      if (!st.inBounds(x, y - i2) || !st.flags[st.idx(x, y - i2)]) continue;
      if ((isTileATreeBranchCore(st, x - 1, y - i2) === 1)
        || (isTileATreeRootCore(st, x - 1, y - i2) === 1)) genKillTile(st, rng, x - 1, y - i2);
      if ((isTileATreeBranchCore(st, x + 1, y - i2) === -1)
        || (isTileATreeRootCore(st, x + 1, y - i2) === -1)) genKillTile(st, rng, x + 1, y - i2);
    }
  }
  for (let j = 0; j <= num2; j++) {
    if (!st.inBounds(x, y - j)) continue;
    const q = st.idx(x, y - j);
    if (!st.flags[q]) continue;
    st.type[q] = nt;
    const base = j === 0, top = j === num2;
    if (base) {
      if (newTreeSheet === 5 || newTreeSheet === 596 || newTreeSheet === 616) {
        if (oldTreeSheet === 323) { st.frameX[q] = 0; st.frameY[q] = 22 * rng.nextIntRange(0, 3); }
        else convertTreeAndGroundBranches(st, x, y - j, newTreeSheet);
      } else if (newTreeSheet === 323) { st.frameX[q] = 66; st.frameY[q] = 0; }
      continue;
    }
    if (top) {
      if (newTreeSheet === 5 || newTreeSheet === 596 || newTreeSheet === 616) {
        if (oldTreeSheet === 323) { st.frameX[q] = 22; st.frameY[q] = 22 * rng.nextIntRange(9, 12); }
        else convertTreeAndGroundBranches(st, x, y - j, newTreeSheet);
      } else if (newTreeSheet === 323) { st.frameX[q] = 22 * rng.nextIntRange(4, 7); st.frameY[q] = 0; }
      continue;
    }
    if (newTreeSheet === 5 || newTreeSheet === 596 || newTreeSheet === 616) {
      if (oldTreeSheet === 323) {
        if (rng.nextInt(2) === 0) { st.frameX[q] = 44; st.frameY[q] = 22 * rng.nextIntRange(3, 6); }
        else if (rng.nextInt(2) === 0) { st.frameX[q] = 22; st.frameY[q] = 22 * rng.nextIntRange(0, 6); }
        else { st.frameX[q] = 0; st.frameY[q] = 22 * rng.nextIntRange(0, 6); }
      } else convertTreeAndGroundBranches(st, x, y - j, newTreeSheet);
    } else if (newTreeSheet === 323) {
      st.frameX[q] = 22 * rng.nextIntRange(0, 3); st.frameY[q] = 0;
    }
  }
  st.type[st.idx(x, y)] = idOf(newFloorSheet);                          // tile.type=newFloorType
}

/** 草族四集合合并（Conversion.Grass ∪ JungleGrass ∪ Snow ∪ MushroomGrass） */
function convGrassFamily(sheet: number): boolean {
  return CONV_GRASS.has(sheet) || CONV_JUNGLE_GRASS.has(sheet)
    || CONV_SNOW.has(sheet) || CONV_MUSHROOM_GRASS.has(sheet);
}

/** TryConvertingOrKillingTreesAboveIfTheyWouldBecomeInvalid（cs:55281-55463 全臂）。
 *  ★IIIII80 翻案：原近似②只做「Keep 或 Kill」二态——official 有 596/616/5/323 的
 *  整树换种支（ConvertTreeAndGround），fish mox 全图净化把大量树基落在转化面上时该
 *  支高频命中（曾 ~200 格 sapling/树残差）。 */
function tryConvertingOrKillingTreesAbove(st: TileStore, rng: RNG, x: number, y: number, newSheet: number): void {
  if (!st.inBounds(x, y)) return;
  if (!st.flags[st.idx(x, y)]) return;
  if (y - 1 < 1 || !st.flags[st.idx(x, y - 1)]) return;               // InWorld(...,2)
  const upIdx = st.idx(x, y - 1);
  const upSheet = SHEET_OF_TYPE[st.type[upIdx]];
  if (!IS_A_TREE_TRUNK.has(upSheet) && upSheet !== 323) return;
  let flag = true;
  if (upSheet === 5) flag = convGrassFamily(newSheet);
  else if (upSheet === 323) flag = CONV_SAND.has(newSheet);
  if (flag) {
    const gt = treeGroundTest(upSheet, newSheet);
    if (gt !== null) flag = gt;
  }
  if (!flag) {
    if (upSheet === 596 || upSheet === 616) {
      if (convGrassFamily(newSheet)) convertTreeAndGround(st, rng, gs, x, y, newSheet, upSheet, 5);
      else if (CONV_SAND.has(newSheet)) convertTreeAndGround(st, rng, gs, x, y, newSheet, upSheet, 323);
      else genKillTile(st, rng, x, y - 1);
    } else if (upSheet === 5) {
      if (CONV_SAND.has(newSheet)) convertTreeAndGround(st, rng, gs, x, y, newSheet, upSheet, 323);
      else genKillTile(st, rng, x, y - 1);
    } else if (upSheet === 323) {
      if (convGrassFamily(newSheet)) convertTreeAndGround(st, rng, gs, x, y, newSheet, upSheet, 5);
      else genKillTile(st, rng, x, y - 1);
    } else {
      genKillTile(st, rng, x, y - 1);
    }
  }
}

/** WorldGen.Convert(i,j,conversionType,tiles,walls) 单格版——本批消费面只涉 0/2/3。
 *  逐支内每次先 fresh 读 sheet（原版每条 if 都重读 Main.tile[..].type/.wall）。 */
function convertCell(
  st: TileStore, rng: RNG, gs: GenState,
  i: number, j: number, conversionType: number, tiles: boolean, walls: boolean,
): void {
  if (i < 1 || j < 1 || i >= st.w - 1 || j >= st.h - 1) return;       // InWorld(i,j,1)
  if (!tiles && !walls) return;
  const ii = st.idx(i, j);
  if (!st.flags[ii] && st.wall[ii] <= 0) return;                      // cs:55562 !active&&wall<=0
  const wall = st.wall[ii];

  if (conversionType === 2) {                                         // ── case 2 神圣 ──
    if (walls) {
      if (WALL_CONV_GRASS.has(wall) && wall !== 70) convertActuallyWall(st, i, j, 70);
      else if (WALL_CONV_STONE.has(wall) && wall !== 28) convertActuallyWall(st, i, j, 28);
      else if (WALL_CONV_HARDENED_SAND.has(wall) && wall !== 219) convertActuallyWall(st, i, j, 219);
      else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 222) convertActuallyWall(st, i, j, 222);
      else if (WALL_CONV_NEW1.has(wall) && wall !== 200) convertActuallyWall(st, i, j, 200);
      else if (WALL_CONV_NEW2.has(wall) && wall !== 201) convertActuallyWall(st, i, j, 201);
      else if (WALL_CONV_NEW3.has(wall) && wall !== 202) convertActuallyWall(st, i, j, 202);
      else if (WALL_CONV_NEW4.has(wall) && wall !== 203) convertActuallyWall(st, i, j, 203);
    }
    if (!tiles) return;
    let t = SHEET_OF_TYPE[st.type[ii]];
    if (t === 4 && torchConvertible(t, st.frameY[ii], 2)) convertActuallyTorch(st, i, j, 20);
    else if ((TILE_MOSS.has(t) || CONV_STONE.has(t)) && t !== 117) convertActuallyTile(st, rng, i, j, 117);
    else if ((t = shOf(st, ii)), CONV_GOLF_GRASS.has(t) && t !== 492) convertActuallyTile(st, rng, i, j, 492);
    else if ((t = shOf(st, ii)), CONV_GRASS.has(t) && t !== 109 && t !== 492) convertActuallyTile(st, rng, i, j, 109);
    else if ((t = shOf(st, ii)), CONV_ICE.has(t) && t !== 164) convertActuallyTile(st, rng, i, j, 164);
    else if ((t = shOf(st, ii)), CONV_SAND.has(t) && t !== 116) convertActuallyTile(st, rng, i, j, 116);
    else if ((t = shOf(st, ii)), CONV_HARDENED_SAND.has(t) && t !== 402) convertActuallyTile(st, rng, i, j, 402);
    else if ((t = shOf(st, ii)), CONV_SANDSTONE.has(t) && t !== 403) convertActuallyTile(st, rng, i, j, 403);
    else if ((t = shOf(st, ii)), CONV_THORN.has(t)) genKillTile(st, rng, i, j);
    else if ((t = shOf(st, ii)) === 59
      && (shNb(st, i - 1, j) === 109 || shNb(st, i + 1, j) === 109
        || shNb(st, i, j - 1) === 109 || shNb(st, i, j + 1) === 109)) {
      convertActuallyTile(st, rng, i, j, 0);                          // cs:55737 泥邻珍珠草回土
    }
    return;
  }

  if (conversionType === 3) {                                         // ── case 3 蘑菇 ──
    if (walls && WALL_GLOW_MUSHROOM.has(wall)) convertActuallyWall(st, i, j, 80);
    if (!tiles) return;
    let t = shOf(st, ii);
    if (t === 4 && torchConvertible(t, st.frameY[ii], 3)) convertActuallyTorch(st, i, j, 22);
    else if (t === 60) convertActuallyTile(st, rng, i, j, 70);
    else if ((t = shOf(st, ii)), CONV_THORN.has(t)) genKillTile(st, rng, i, j);
    return;
  }

  if (conversionType === 0) {                                         // ── case 0 净化 ──
    if (walls) {
      const wl = st.wall[ii];
      if (wl === 69 || wl === 70 || wl === 81) {
        let nw = 64;
        if (j < Math.floor(gs.worldSurface)) {
          nw = rng.nextInt(10) !== 0 ? 63 : 65;                       // cs:56000-56004 必掷
        }
        convertActuallyWall(st, i, j, nw);
      } else if (wl === 262) convertActuallyWall(st, i, j, 61);
      else if (wl === 274) convertActuallyWall(st, i, j, 185);
      else if (wl === 292) convertActuallyWall(st, i, j, 204);
      else if (wl === 293) convertActuallyWall(st, i, j, 205);
      else if (wl === 294) convertActuallyWall(st, i, j, 206);
      else if (wl === 295) convertActuallyWall(st, i, j, 207);
      else if (wl === 61 || wl === 185 || wl === 204 || wl === 205 || wl === 206 || wl === 207) {
        // 空 arm：保持不变（须在 Stone 集判定前拦截——同 cs case 归组顺序）
      }
      // 上面 else-if 链中的 61/185/204-207 空 arm 已截流；以下为 default 支
      else if (WALL_CONV_STONE.has(wl) && wl !== 349) convertActuallyWall(st, i, j, 349);
      else if (WALL_CONV_NEW1.has(wl) && wl !== 212) convertActuallyWall(st, i, j, 212);
      else if (WALL_CONV_NEW2.has(wl) && wl !== 213) convertActuallyWall(st, i, j, 213);
      else if (WALL_CONV_NEW3.has(wl) && wl !== 214) convertActuallyWall(st, i, j, 214);
      else if (WALL_CONV_NEW4.has(wl) && wl !== 215) convertActuallyWall(st, i, j, 215);
      else if (wl === 80) {
        // cs:56054-56062：左支必掷 Next(3)，命中则右支不再掷（|| 短路）
        if (j < gs.worldSurface + 4 + rng.nextInt(3)) convertActuallyWall(st, i, j, 15);
        else if (j > (st.h + gs.rockLevel) / 2 - 3 + rng.nextInt(3)) convertActuallyWall(st, i, j, 64);
        else convertActuallyWall(st, i, j, 64);
      }
      else if (WALL_CONV_HARDENED_SAND.has(wl) && wl !== 216) convertActuallyWall(st, i, j, 216);
      else if (WALL_CONV_SANDSTONE.has(wl) && wl !== 187) convertActuallyWall(st, i, j, 187);
    }
    if (!tiles) return;
    let t = shOf(st, ii);
    if (t === 4 && torchConvertible(t, st.frameY[ii], 0)) convertActuallyTorch(st, i, j, 0);
    else if (t === 492) convertActuallyTile(st, rng, i, j, 477);
    else if ((t = shOf(st, ii)), CONV_JUNGLE_GRASS.has(t) && t !== 60) convertActuallyTile(st, rng, i, j, 60);
    else if ((t = shOf(st, ii)), CONV_GRASS.has(t) && t !== 2 && t !== 477) convertActuallyTile(st, rng, i, j, 2);
    else if ((t = shOf(st, ii)), CONV_STONE.has(t) && t !== 1) convertActuallyTile(st, rng, i, j, 1);
    else if ((t = shOf(st, ii)), CONV_SAND.has(t) && t !== 53) convertActuallyTile(st, rng, i, j, 53);
    else if ((t = shOf(st, ii)), CONV_HARDENED_SAND.has(t) && t !== 397) convertActuallyTile(st, rng, i, j, 397);
    else if ((t = shOf(st, ii)), CONV_SANDSTONE.has(t) && t !== 396) convertActuallyTile(st, rng, i, j, 396);
    else if ((t = shOf(st, ii)), CONV_ICE.has(t) && t !== 161) convertActuallyTile(st, rng, i, j, 161);
    else if ((t = shOf(st, ii)), CONV_MUSHROOM_GRASS.has(t)) convertActuallyTile(st, rng, i, j, 60);
    else if ((t = shOf(st, ii)), t === 32 || t === 352) genKillTile(st, rng, i, j);
    return;
  }
  // 其余 conversionType（1/4 corrupt/crimson、5/6/7…）不在本批旗标消费面内——
  // worldIsInfected 的 conversionType 1/4 为其他车道债（见批章）。
}
function shOf(st: TileStore, ii: number): number { return SHEET_OF_TYPE[st.type[ii]]; }
function shNb(st: TileStore, x: number, y: number): number {
  return st.inBounds(x, y) ? SHEET_OF_TYPE[st.type[st.idx(x, y)]] : -1;
}

// ============================================================
// ① DoDigExtraHoles（jagged rocks，cs:2853-2868；Grass pass 头 :12470）
// ============================================================
export function doDigExtraHoles(st: TileStore, rng: RNG, gs: GenState): void {
  const num = Math.trunc(st.w * 0.1);
  for (let k = 0; k < num; k++) {
    const i2 = rng.nextIntRange(50, st.w - 50);                         // Next(50, w-50)
    const j = rng.nextIntRange(50, st.h - 50);                          // Next(50, h-50)
    let num2 = rng.nextIntRange(5, 16);                                 // Next(5,16)
    if (rng.nextInt(3) === 0) num2 += rng.nextInt(15);
    const steps = rng.nextIntRange(30, 201);                            // Next(30,201)
    tileRunner(st, rng, gs, i2, j, {
      strength: num2, steps,
      type: -1, addTile: false,
      speedX: rng.nextIntRange(-15, 16) * 0.1,                           // Next(-15,16)*0.1f
      speedY: rng.nextIntRange(10, 26) * 0.1,                            // Next(10,26)*0.1f
      noYChange: true,
    });
  }
}

// ============================================================
// ② DoNoInfection（fish mox，cs:1911-1954；全图净化）
// ============================================================
export function doNoInfection(st: TileStore, rng: RNG, gs: GenState): void {
  const F = gs.seedFlags;
  if (!!F.skyblock) return;                                             // skyblockWorldGen 早退
  const infected = !!F.infectedSeed;                                    // worldIsInfected.Enabled
  for (let i = 0; i < st.w; i++) {
    for (let j = 0; j < st.h; j++) {
      const ii = st.idx(i, j);
      const t = shOf(st, ii);
      let flag = t !== 70;                                              // 蘑菇草豁免（原版字面）
      let flag2 = st.wall[ii] !== 80;
      if (infected) {
        if (flag) { if (t === 203 || t === 25) flag = false; }
        if (flag2) { if (st.wall[ii] === 83 || st.wall[ii] === 3) flag2 = false; }
      }
      if (flag || flag2) convertCell(st, rng, gs, i, j, 0, flag, flag2);
    }
  }
}

// ============================================================
// ③ DoHallowOnSurface（does that sparkle，cs:1956-2021）
// ============================================================
export function doHallowOnSurface(st: TileStore, rng: RNG, gs: GenState): void {
  const F = gs.seedFlags;
  if (!!F.skyblock) return;
  let num = Math.floor(gs.worldSurface);                                // (int)Main.worldSurface
  if (!!F.noSurface) {
    num = (!(!!F.infectedSeed) || !(!!F.noInfection))
      ? Math.floor(gs.rockLevel)
      : Math.floor(gs.rockLevel / 2);                                   // cs:1963-1966
  }
  for (let i = 0; i < st.w; i++) {
    const lim = num + rng.nextInt(3);                                   // per-column 必掷
    for (let j = 0; j < lim; j++) {
      const ii = st.idx(i, j);
      let t = shOf(st, ii);
      if (t === 2) convertCell(st, rng, gs, i, j, 2, true, false);
      if ((t = shOf(st, ii)) === 161) convertCell(st, rng, gs, i, j, 2, true, false);
      if (!!F.noSurface && shOf(st, ii) === 1) convertCell(st, rng, gs, i, j, 2, true, false);
      if (shOf(st, ii) === 53) convertCell(st, rng, gs, i, j, 2, true, false);
      if (shOf(st, ii) === 396) convertCell(st, rng, gs, i, j, 2, true, false);
      if (shOf(st, ii) === 397) convertCell(st, rng, gs, i, j, 2, true, false);
      const wl = st.wall[ii];
      if (wl === 187) convertCell(st, rng, gs, i, j, 2, false, true);
      if (wl === 216) convertCell(st, rng, gs, i, j, 2, false, true);
      if (wl === 63) convertCell(st, rng, gs, i, j, 2, false, true);
      if (wl === 65) convertCell(st, rng, gs, i, j, 2, false, true);
      if (wl === 66) convertCell(st, rng, gs, i, j, 2, false, true);
      if (wl === 68) convertCell(st, rng, gs, i, j, 2, false, true);
    }
  }
}

// ============================================================
// ④ DoSurfaceIsInSpace（such great heights，cs:2077-2093；零掷骰）
// ============================================================
export function doSurfaceIsInSpace(st: TileStore, gs: GenState): void {
  if (!!gs.seedFlags.skyblock) return;
  const wsInt = Math.floor(gs.worldSurface);
  for (let i = 0; i < st.w; i++) {
    for (let j = 0; j < wsInt; j++) {
      const ii = st.idx(i, j);
      if (st.wall[ii] === 73 && (!st.flags[ii] || shOf(st, ii) === 53)) {
        st.wall[ii] = 0;
      }
    }
  }
}

// ============================================================
// ⑤ DoSurfaceIsMushrooms（toadstool，cs:2095-2181）
// ============================================================
/** MudCavesToJungleGrass 首掷臂门（cs:12517：enabled && !noSurface） */
export function doSurfaceIsMushroomsEarly(st: TileStore, rng: RNG, gs: GenState): void {
  if (gs.seedFlags.surfaceIsMushrooms && !gs.seedFlags.noSurface) {
    doSurfaceIsMushroomsCore(st, rng, gs);
  }
}

export function doSurfaceIsMushroomsCore(st: TileStore, rng: RNG, gs: GenState): void {
  const F = gs.seedFlags;
  if (!!F.skyblock) return;
  if (!!F.noSurface) {                                                  // molepeople 组合域（照录）
    for (let i = 0; i < st.w; i++) {
      for (let j = 0; j < st.h; j++) {
        const ii = st.idx(i, j);
        if (st.flags[ii] && shOf(st, ii) === 60) convertCell(st, rng, gs, i, j, 3, true, true);
        else {
          const wl = st.wall[ii];
          if (wl === 64 || wl === 204 || wl === 205 || wl === 206 || wl === 207) st.wall[ii] = 80;
          else if (st.flags[ii] && shOf(st, ii) === 70) convertCell(st, rng, gs, i, j, 0, true, true);
          else if (wl === 80) convertCell(st, rng, gs, i, j, 0, true, true);
        }
      }
    }
    return;
  }
  for (let k = 0; k < st.w; k++) {
    const lim = Math.floor(gs.worldSurface) + rng.nextInt(3);           // per-column 必掷
    for (let l = 0; l < lim; l++) {
      const ii = st.idx(k, l);
      if (shOf(st, ii) === 60) convertCell(st, rng, gs, k, l, 3, true, true);
      if (st.wall[ii] === 15) convertCell(st, rng, gs, k, l, 3, true, true);
      if (shOf(st, ii) === 0) st.type[ii] = idOf(59);                    // 泥土直赋（保位）
      if (shOf(st, ii) === 2) st.type[ii] = idOf(60);                    // 草直赋
      const wl = st.wall[ii];
      if (wl === 63 || wl === 65 || wl === 66 || wl === 68 || wl === 64
        || wl === 205 || wl === 206 || wl === 207) st.wall[ii] = 80;
    }
  }
}

// ============================================================
// ⑥ DoStartInHardmode（too easy，cs:1905-1909）
// ============================================================
export function doStartInHardmode(world: World, rng: RNG): void {
  world.flags.hardMode = true;                                          // Main.hardMode = true
  initializeHardMode(world, rng);                                       // V 带 GERunner + 回填
}

// ============================================================
// ⑦ DoRainbowStuff（rainbow road，cs:2715-2851）
// ============================================================
const MOSS_CONVERSION = TILE_MOSS;                                      // Conversion.Moss 同集
const RAINBOW_CHEST_POOL = [3556, 2870, 1067, 1066, 5075, 4469];        // cs:2840 NextFromList

/** OverGrownDungeonWithRainbowMoss（cs:24303-24347） */
function overGrownDungeonWithRainbowMoss(st: TileStore, rng: RNG, gs: GenState): void {
  const num = Math.trunc(st.w / 2);
  const half = Math.trunc(st.w / 2);
  const sideRight = gs.dungeonSide === 1;
  const MOSS_BRICK = idOf(628);
  for (let n = 0; n < num; n++) {
    let cx = rng.nextIntRange(50, half);                               // Next(50, w/2)
    if (sideRight) cx = rng.nextIntRange(half, st.w - 50);
    const cy = rng.nextIntRange(50, st.h - 50);
    if (!st.inBounds(cx, cy) || !isDungeonWallId(st.wall[st.idx(cx, cy)])) continue;
    const r = rng.nextIntRange(4, 13);                                  // Next(4,13)
    for (let j = cx - r; j <= cx + r; j++) {
      for (let k = cy - r; k <= cy + r; k++) {
        if (j < 1 || k < 1 || j >= st.w - 1 || k >= st.h - 1) continue;
        const ii = st.idx(j, k);
        const hasActiveNeighbor =
          anyOf8(st, j, k);
        if (!TILE_DUNGEON_BRICK.has(shOf(st, ii))) continue;
        if (hasActiveNeighbor) continue;                                // cs:24323 八邻全空气才转
        st.setTileSilent(j, k, MOSS_BRICK);
        if (!tileFilledAny(st, j, k - 1)) placeMossTuft(st, j, k - 1);
        if (!tileFilledAny(st, j, k + 1)) placeMossTuft(st, j, k + 1);
        if (!tileFilledAny(st, j - 1, k)) placeMossTuft(st, j - 1, k);
        if (!tileFilledAny(st, j + 1, k)) placeMossTuft(st, j + 1, k);
      }
    }
  }
}
const TILE_DUNGEON_BRICK = new Set([41, 43, 44, 677, 678, 679]);        // Main.cs:8131-8136
function isDungeonWallId(wall: number): boolean {
  return wall === 7 || wall === 8 || wall === 9 || (wall >= 94 && wall <= 99);
}
/** cs:24323 判定逐项：任一八邻 active 即 false（非「有墙」）。注意 vanilla 读的是
 *  `!Main.tile[j,k±..].active()`——纯 tile 活性，不含墙。 */
function anyOf8(st: TileStore, j: number, k: number): boolean {
  const offs: Array<[number, number]> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  for (const [dx, dy] of offs) {
    const x = j + dx, y = k + dy;
    if (st.inBounds(x, y) && st.flags[st.idx(x, y)]) return true;
  }
  return false;
}
function tileFilledAny(st: TileStore, x: number, y: number): boolean {
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
}
/** 苔藓芽近似⑤：空格 + 任一实心邻 → 直写 style10 帧 */
function placeMossTuft(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (st.flags[i]) return;
  const supported =
    solidTileAt(st, x, y + 1) || solidTileAt(st, x, y - 1)
    || solidTileAt(st, x - 1, y) || solidTileAt(st, x + 1, y);
  if (!supported) return;
  st.setTileSilent(x, y, idOf(184), 10 * 18, 0);
}

/** Place2x2 discoball 臂（cs:51780-51873 的 126 支直译） */
function placeDiscoball(st: TileStore, x: number, y: number): boolean {
  const yy = y + 1;                                                     // type126 → y++
  if (x < 5 || x > st.w - 5 || yy < 5 || yy > st.h - 5) return false;
  for (let cx = x - 1; cx <= x; cx++) {
    for (let cy = yy - 1; cy <= yy; cy++) {
      if (!st.inBounds(cx, cy) || st.flags[st.idx(cx, cy)]) return false;
    }
    if (!solidNonTopAt(st, cx, yy - 2)) return false;                   // 天花板门（y++ 后的 y-2）
  }
  const tx = x - 1, ty = yy - 1;                                        // x--; y-- 写块左上
  for (let k = 0; k < 2; k++) {
    for (let l = 0; l < 2; l++) {
      const i3 = st.idx(tx + k, ty + l);
      st.type[i3] = idOf(126);
      st.flags[i3] = 1;
      st.frameX[i3] = k * 18;
      st.frameY[i3] = l * 18;                                           // style=0 → fy ∈ {0,18}
      st.paint[i3] = 0;
      st.coat[i3] &= ~TileStore.COAT_BLOCK_MASK;
    }
  }
  return true;
}

export function doRainbowStuff(st: TileStore, rng: RNG, gs: GenState, chests: World['chests']): void {
  flipGenSolid([379], false);                                           // cs:2717（spawnPointPass 同通道）
  try {
    const flag = !(!!gs.seedFlags.extraLiquid) || !(!!gs.seedFlags.roundLandmasses);
    const wsFloor = Math.floor(gs.worldSurface);
    for (let i = 0; i < st.w; i++) {
      for (let j = 0; j < st.h; j++) {
        const ii = st.idx(i, j);
        let t = shOf(st, ii);
        if (t === 189) { st.type[ii] = idOf(719); clearPaintCoat(st, i, j); }       // 云→彩虹云
        if ((t = shOf(st, ii)) === 4) {                                   // 火把全局 disco 帧
          st.frameY[ii] = 308;
          clearPaintCoat(st, i, j);
        }
        if (flag && st.half[ii] !== 0) {                                  // 半砖贴满水侧 → 彩虹砖 160
          const li = st.idx(Math.max(0, i - 1), j);
          const ri = st.idx(Math.min(st.w - 1, i + 1), j);
          const liOk = i - 1 >= 0, riOk = i + 1 < st.w;
          const fullWaterL = liOk && st.liquid[li] === 255 && st.liquidType[li] === LIQUID_TYPE.WATER;
          const fullWaterR = riOk && st.liquid[ri] === 255 && st.liquidType[ri] === LIQUID_TYPE.WATER;
          const rightEmptyOrHalf = !riOk || !st.flags[ri] || st.half[ri] !== 0;
          const leftEmptyOrHalf = !liOk || !st.flags[li] || st.half[li] !== 0;
          const rightLiquidZero = !riOk || st.liquid[ri] === 0;
          const leftLiquidZero = !liOk || st.liquid[li] === 0;
          if (fullWaterL && rightEmptyOrHalf && rightLiquidZero) { st.type[ii] = idOf(160); clearPaintCoat(st, i, j); }
          if (fullWaterR && leftEmptyOrHalf && leftLiquidZero) { st.type[ii] = idOf(160); clearPaintCoat(st, i, j); }
        }
        if ((t = shOf(st, ii)) === 138 && st.frameX[ii] === 0 && st.frameY[ii] === 0 && rng.nextInt(4) === 0) {
          for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {  // 巨石 2×2 → 711 彩虹巨石
            const q = st.idx(i + dx, j + dy);
            st.type[q] = idOf(711);
            clearPaintCoat(st, i + dx, j + dy);
          }
        }
        if ((t = shOf(st, ii)) === 202) { st.type[ii] = idOf(692); clearPaintCoat(st, i, j); }
        if (st.wall[ii] === 82) {
          st.wall[ii] = 346;                                            // WallID 直赋；ClearBlockPaintAndCoating 不含墙漆但原版此支带 Clear：
          st.paintWall[ii] = 0;
          st.coat[ii] &= ~TileStore.COAT_WALL_MASK;
        }
        if ((t = shOf(st, ii)) === 91 && st.frameY[ii] % 54 === 0
          && (rng.nextInt(5) === 0 || (j < wsFloor && rng.nextInt(2) === 0))) {
          for (let k = 0; k < 3; k++) {                                 // 旗帜三连特帧
            if (j + k >= st.h) break;
            const q = st.idx(i, j + k);
            st.frameX[q] = 1206;
            st.frameY[q] = 54 + k * 18;
            clearPaintCoat(st, i, j + k);
          }
        }
        t = shOf(st, ii);
        if (MOSS_CONVERSION.has(t)) { st.type[ii] = idOf(627); clearPaintCoat(st, i, j); }  // moss→彩虹苔 627
        else if (t === 184) { st.frameX[ii] = 220; clearPaintCoat(st, i, j); }              // disco 苔芽帧
      }
    }
    // ---- 彩虹巨石播种（cs:2790-2824）----
    let num = st.w * 2;
    if (gs.seedFlags.skyblock) num = Math.trunc(num / 2);
    else if (!flag) num *= 2;
    const margin = 40;
    for (let k = 0; k < num; k++) {
      const px = rng.nextIntRange(margin, st.w - margin);               // Next(40, w-40)
      let py = rng.nextIntRange(margin, st.h - margin);
      if (st.flags[st.idx(px, py)]) continue;
      while (!st.flags[st.idx(px, py)]) {
        py--;
        if (px < margin || py < margin || px >= st.w - margin || py >= st.h - margin) break;   // InWorld(...,40)
      }
      py++;
      if (py + 1 >= st.h) continue;
      const nbR = st.inBounds(px + 1, py) ? shOf(st, st.idx(px + 1, py)) : -1;
      const nbLUp = st.inBounds(px - 1, py - 1) ? shOf(st, st.idx(px - 1, py - 1)) : -1;
      const nbMUp = st.inBounds(px, py - 1) ? shOf(st, st.idx(px, py - 1)) : -1;
      const cond = !st.flags[st.idx(px + 1, py)]
        && nbR !== 162
        && solidTileAt(st, px - 1, py - 1) && solidTileAt(st, px, py - 1)
        && nbLUp !== 48 && nbMUp !== 48
        && nbLUp !== 232 && nbMUp !== 232
        && !isTileNearby126(st, px, py, 20);
      if (cond && placeDiscoball(st, px, py)) {
        clearPaintCoat(st, px - 1, py); clearPaintCoat(st, px, py);
        clearPaintCoat(st, px - 1, py + 1); clearPaintCoat(st, px, py + 1);
      }
    }
    // ---- 箱染料尾段（cs:2825-2848，近似④）----
    for (const chest of chests) {
      if (rng.nextInt(3) !== 0) continue;                               // cs:2832 必掷
      const it1 = chest.items[1];
      if (!it1 || it1.stack === 0) continue;
      for (let m = 1; m < 40; m++) {                                    // maxItems 域内找首空槽
        const slot = chest.items[m];
        if (slot == null || slot.stack === 0 || m >= chest.items.length) {
          const vidPick = RAINBOW_CHEST_POOL[rng.nextInt(RAINBOW_CHEST_POOL.length)];   // 六选一
          const iid = VID_TABLE[vidPick];
          if (iid < 0) break;
          const stack = equipKindOfVid(vidPick) === 'dye' ? 3 : 1;      // dye>0 → stack=3（cs:2841-2844）
          chest.items.splice(m, 0, { id: iid, stack });
          break;
        }
      }
    }
    overGrownDungeonWithRainbowMoss(st, rng, gs);
  } finally {
    flipGenSolid([379], true);                                          // cs:2850 还原
  }
}
/** IsTileNearby(num3,num4,126,20)：方形邻域扫 discoball（裸 active 判定同原版 IsTileNearby） */
function isTileNearby126(st: TileStore, x: number, y: number, distance: number): boolean {
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (!st.inBounds(i, j)) continue;
      if (shOf(st, st.idx(i, j)) === 126) return true;
    }
  }
  return false;
}

// ============================================================
// ⑧ 南瓜季（halloweenGen | endlessHalloween，cs:20227-20249）
// ============================================================
const PUMPKIN_VINE_SHEET = 254;

/** 南瓜季撒播（cs:20232 门：halloweenGen || endlessHalloween） */
export function pumpkinSeasonArm(st: TileStore, rng: RNG, gs: GenState): void {
  if (!(gs.seedFlags.halloweenGen || gs.seedFlags.endlessHalloween)) return;
  const wsInt = Math.floor(gs.worldSurface);
  for (let i = 40; i < st.w - 40; i++) {
    for (let j = 50; j < wsInt; j++) {
      const ii = st.idx(i, j);
      if (st.flags[ii] && shOf(st, ii) === 2 && rng.nextInt(15) === 0) {   // 草 2 上撒瓜
        placePumpkin(st, rng, i, j - 1);
        const grows = rng.nextInt(5);
        for (let k = 0; k < grows; k++) growPumpkinStep(st, i, j - 1);
      }
    }
  }
}

/** PlacePumpkin（cs:52898-52947） */
function placePumpkin(st: TileStore, rng: RNG, x: number, superY: number): void {
  const bandTop = rng.nextInt(6) * 36;                                  // style 带
  if (x < 5 || x > st.w - 5 || superY < 5 || superY > st.h - 5) return;
  let ok = true;
  for (let i = x - 1; i < x + 1; i++) {
    for (let j = superY - 1; j < superY + 1; j++) {
      if (!st.inBounds(i, j)) return;
      const ii = st.idx(i, j);
      const t = shOf(st, ii);
      if (st.flags[ii]) {
        if (!(t === 3 || t === 73 || t === 113 || t === 110 || (t === 185 && st.frameY[ii] === 0))) ok = false;
      }
      if (st.liquid[ii] > 0) ok = false;
    }
    if (!st.inBounds(i, superY + 1)) return;
    if (!solidTileAt(st, i, superY + 1)) ok = false;
    else {
      const bs = shOf(st, st.idx(i, superY + 1));
      if (bs !== 2 && bs !== 109) ok = false;                           // 地面限草/珍珠草
    }
  }
  if (!ok) return;
  writeQuad(st, PUMPKIN_VINE_SHEET, x - 1, superY - 1, bandTop);
}
function writeQuad(st: TileStore, sheet: number, ax: number, ay: number, bandTop: number): void {
  for (let l = 0; l < 2; l++) {
    for (let k = 0; k < 2; k++) {
      const i = st.idx(ax + k, ay + l);
      st.type[i] = idOf(sheet);
      st.flags[i] = 1;
      st.frameX[i] = k * 18;
      st.frameY[i] = bandTop + l * 18;
    }
  }
}

/** GrowPumpkin（cs:52950-53015）：块体成长（frameX += 36），次数上限 style≥4 弃 */
function growPumpkinStep(st: TileStore, i: number, superY: number): void {
  if (!st.inBounds(i, superY)) return;
  const bi = st.idx(i, superY);
  if (!st.flags[bi] || shOf(st, bi) !== PUMPKIN_VINE_SHEET) return;
  // frameY/18 归约到段首（底部行差 1；多 style 时向下走偶数步恒得 1）
  let offY = Math.trunc(st.frameY[bi] / 18);
  for (; offY > 1; offY -= 2) { /* 原版空循环 */ }
  const topY = superY - offY;
  let fxUnits = Math.trunc(st.frameX[bi] / 18);
  let grows = 0;
  while (fxUnits > 1) { fxUnits -= 2; grows++; }
  const ax = i - fxUnits;
  if (grows >= 4) return;
  if (!st.inBounds(ax, topY) || !st.inBounds(ax + 1, topY + 1)) return;
  let bad = false;
  for (let k = ax; k < ax + 2; k++) {
    for (let l = topY; l < topY + 2; l++) {
      const q = st.idx(k, l);
      if (!st.flags[q] || shOf(st, q) !== PUMPKIN_VINE_SHEET
        || st.frameX[q] !== (k - ax) * 18 + grows * 36) bad = true;
    }
    if (!st.inBounds(k, topY + 2)) return;
    if (!solidTileAt(st, k, topY + 2)) bad = true;
    else {
      const bs = shOf(st, st.idx(k, topY + 2));
      if (bs !== 2 && bs !== 477 && bs !== 492 && bs !== 109) bad = true;
    }
  }
  if (!bad) {
    for (let m = ax; m < ax + 2; m++) {
      for (let n = topY; n < topY + 2; n++) {
        const q = st.idx(m, n);
        if (st.flags[q] && shOf(st, q) === PUMPKIN_VINE_SHEET) st.frameX[q] += 36;
      }
    }
  }
}

// ============================================================
// finalize 入口（FinalizeSecretSeeds 本批子集，序 = 原 if 链 :589-663）
// ============================================================
export function finalizeSecretSeedDoEnds(
  store: TileStore, rng: RNG, gs: GenState, world: World,
): void {
  const F = gs.seedFlags;
  if (F.surfaceIsInSpace) doSurfaceIsInSpace(store, gs);
  if (F.surfaceIsMushrooms) {
    if (!F.noSurface) doSurfaceIsMushroomsCore(store, rng, gs);         // cs:607-614 ×2 怪癖照录
    doSurfaceIsMushroomsCore(store, rng, gs);
  }
  if (F.noInfection) doNoInfection(store, rng, gs);
  if (F.hallowOnTheSurface) doHallowOnSurface(store, rng, gs);
  if (F.startInHardmode) doStartInHardmode(world, rng);
  // ★IIIII41-T3①：randomSpawn「how did I get here」臂【不在此挂】——见 WorldGen.ts 尾段
  //   doRandomSpawnFinishPass 挂位注（原版 FinalizeSecretSeeds 在 SpawnPoint 写回之后，
  //   本仓 SpawnPoint 写回被上提到 finalize()＝管线末，臂须挂尾段才不被覆盖）。
  //   其互斥语义/掷骰域与 vampire 臂共核（randomizeWorldSpawnCore/doAdditional…）。
  if (F.rainbowStuff) doRainbowStuff(store, rng, gs, world.chests);
  // ★IIIII41-T3②：arachnophobia 运行时面首点（cs:688-691 `NPC.savedStylist = true`，
  //   原 if 链 teamBasedSpawns 之后、FinalSeedCleanup(:694) 之前；无掷骰序约束）。
  //   落键 = world.flags.savedStylist（VanillaSpawner.ts 刷怪条件/WldParser 导入路同键；
  //   SW 存档 flags 顶层持久）。count<4 支；count≥4（ILied）支不落——多秘计数另案
  //   （SeedEasterEggs.noSpiderCavesActuallyNoSpiderCaves 头注）。
  if (noSpiderCavesActuallyNoSpiderCaves(F)) {
    world.flags.savedStylist = true;
  }
}

/** graveyardBloodmoonStart：ResetTempsToDayTime 臂（WorldFile.cs:1019-1024）。
 *  夜相映射：Main.time 夜段独立计数 0..32400（7:30PM→4:30AM 九小时窗；celestefix 同判据
 *  「夜间独立计数」），time=1.0 ≈ 入夜一格 ⇒ SW clock.timeOfDay（0..1 线性 24h）=
 *  DUSK + n/32400×0.375。moonPhase 保持 0（_tempMoonPhase 缺省值）。 */
export function applyGraveyardInitialClockState(world: World): void {
  if (!world.seedFlags?.graveyardBloodmoonStart) return;
  const c = world.clock;
  c.timeOfDay = 19.5 / 24 + (1 / 32400) * 0.375;                        // DUSK(+1 tick)
  c.dayCount = 1;
  c.moonPhase = 0;
  c.bloodMoon = true;
}


// ═══════════════ ★IIIII41-T3① randomSpawn「how did I get here」出生重掷核心 ═══════════════
// vanilla：FinalizeSecretSeeds :655-658 → DoRandomSpawn :1896-1903 =
//   if (!GenVars.worldSpawnHasBeenRandomized) { RandomizeWorldSpawn(); DoAdditionalChangesAroundSpawnIfNeeded(); }
// RandomizeWorldSpawn :24112-24160（X 域 = 地牢对侧；Y 带 [worldSurface+200, +rockLayer]；
//   Utils.CheckForGoodTeleportationSpot cs:518-601 拒绝采样——5000 attempts，rng = Main.rand，
//   生成期 genRand≡Main.rand 单流，本仓按管线约定走 ctx/pass 流）。
// DoAdditionalChangesAroundSpawnIfNeeded :25211-25226 = PlaceTorchesAroundSpawn(:25264,
//   2000 掷半径 1→120 火把) + noTrapsWorldGen 门内 RemoveSpecificTilesUnderSpawn(:25228)。
// 本节自 vampireSeedFinishPass（WorldGen.ts）原位外提（语句序/掷骰序逐行保持），同核共宿：
//   ① randomSpawn 臂（本文件 finalizeSecretSeedDoEnds 内 cs 原位）
//   ② vampireSeed 臂（cs:22659-22662，!worldSpawnHasBeenRandomized 门后调用同核）
// ★避免表过滤四支补全（cs:24119-24148）：errorWorld 11 型 / worldIsFrozen 161·147·162 +
//   infected∧163·200 / notTheBees 60 + infected∧661·662 —— 原 vampire 内联版只带
//   noTraps/notTheBees/worldIsInfected 三支；此三支为与反编译对齐的修正（对纯单旗标
//   世界零影响——这些支全部要求第二枚秘种子同时在场才会改变拒收集）。

/** RandomizeWorldSpawn 36 格生物群系规避表（cs:24097-24101 原序）。 */
const SPAWN_AVOID_SHEETS = [60, 70, 23, 199, 661, 662, 161, 147, 162, 41, 43, 44,
  226, 57, 633, 53, 397, 396, 25, 163, 112, 398, 400, 203, 200, 234, 399, 401, 117,
  164, 116, 402, 403, 379, 135, 37];

/** errorWorld 规避子表（cs:24125-24127：57/70/161/53/397/396/163/200/135/379/37 → -1） */
const ERROR_WORLD_SPAWN_AVOID_SUB = [57, 70, 161, 53, 397, 396, 163, 200, 135, 379, 37];

/** 地牢砖/墙判定（DungeonUtils.IsConsideredDungeonTile/Wall：Main.tileDungeon 表 +
 *  wallDungeon {7,8,9,94-99}）——GetRight/LeftMostDungeonTile（cs:24027-24072）用 */
function isDungeonCell(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (st.flags[i]) {
    const sh = TILE_DEFS[st.type[i]]?.vanilla?.sheet;
    if (sh === 41 || sh === 43 || sh === 44 || (sh! >= 481 && sh! <= 483)) return true;
  }
  const wv = st.wall[i];
  return wv === 7 || wv === 8 || wv === 9 || (wv >= 94 && wv <= 99);
}

/** 规避集组装（内部 tile id；sheetId 缺席项剔除）。分支逐一照抄 cs:24119-24148。 */
function buildSpawnAvoidIds(sf: Partial<SeedFlags>): Set<number> {
  const keep = new Set<number>();
  for (const s of SPAWN_AVOID_SHEETS) {
    if (sf.noTraps && s === 135) continue;                                       // cs:24119-24123
    if (sf.errorWorld && ERROR_WORLD_SPAWN_AVOID_SUB.includes(s)) continue;      // cs:24125-24127
    if (sf.worldIsFrozen) {                                                       // cs:24129-24137
      if (s === 161 || s === 147 || s === 162) continue;
      if (sf.infectedSeed && (s === 163 || s === 200)) continue;
    }
    if (sf.notTheBees) {                                                          // cs:24138-24146
      if (s === 60) continue;
      if (sf.infectedSeed && (s === 661 || s === 662)) continue;
    }
    if (sf.infectedSeed && (s === 23 || s === 199 || s === 25 || s === 203)) continue; // cs:24147-24148
    keep.add(s);
  }
  const out = new Set<number>();
  for (const s of keep) { const id = sheetId(s); if (id > 0) out.add(id); }
  return out;
}

/** RandomizeWorldSpawn（cs:24112-24160）核心：重掷出生点到地牢对侧地下带。
 *  成功与否不改变返回值——vanilla 检索失败时保留原出生点；worldSpawnHasBeenRandomized
 *  首句即置位（:24114）=与 noSurface/vampire/remix 三臂的互斥键。 */
export function randomizeWorldSpawnCore(st: TileStore, rng: RNG, gs: GenState, world: World): void {
  gs.worldSpawnHasBeenRandomized = true;                                   // cs:24114
  const sf = world.seedFlags ?? {};
  const W = st.w;
  // ---- X 域（cs:24081-24091：dungeonSide<=Left → 域起点=右缘地牢砖；否则起点=margin
  //      终点=左缘地牢砖。GetRight/LeftMostDungeonTile 以 dungeonX ±170 带近似 GenVars
  //      外边界，仅扫 ws..ws+220——vampire 通道既有近似，误差 <1 格备案） ----
  const margin = Math.floor(W / 10);                        // cs:24080 num
  const dX = world.dungeonX || Math.floor(W * (gs.dungeonSide === 1 ? 0.66 : 0.33));
  const edgeScan = (fromLeft: boolean): number => {
    const lo = Math.max(10, dX - 170), hi = Math.min(W - 10, dX + 170);
    let found = fromLeft ? lo : hi;
    if (fromLeft) {
      for (let x = lo; x <= hi; x++) {
        for (let y = Math.floor(gs.worldSurface); y < Math.min(st.h - 40, gs.worldSurface + 220); y++) {
          if (isDungeonCell(st, x, y)) { found = x; break; }
        }
      }
    } else {
      for (let x = hi; x >= lo; x--) {
        for (let y = Math.floor(gs.worldSurface); y < Math.min(st.h - 40, gs.worldSurface + 220); y++) {
          if (isDungeonCell(st, x, y)) { found = x; break; }
        }
      }
    }
    return found;
  };
  const x0 = gs.dungeonSide <= -1 ? edgeScan(true) : margin;
  const x1 = gs.dungeonSide <= -1 ? W - x0 - margin : edgeScan(false) - margin;
  const y0 = Math.floor(gs.worldSurface) + 200;             // cs:24100 teleportStartY
  const y1 = y0 + Math.floor(gs.rockLevel);                 // cs:24101 teleportRangeY
  // ★CheckForGoodTeleportationSpot 签名是 (startX, rangeX, startY, rangeY)——
  //   y = startY + Next(rangeY)（cs:55258），带 = [surface+200, surface+200+rockLayer)
  if (x1 <= x0 || y1 <= y0) return;
  const avoidIds = buildSpawnAvoidIds(sf);
  // ---- CheckForGoodTeleportationSpot 精简核（cs:55234-55370）：保 SolidCollision 盒
  //      净空/avoidWalls/群系规避/100 格内坠落实心底/mostlySolidFloor/避液避岩浆避伤害块；
  //      SlopeCollision 逐帧下坠与四向 16px 逃逸探针省略（像素级等效,误差 <1 格） ----
  const solidAt = (x: number, y: number): boolean =>
    st.inBounds(x, y) && st.isActive(x, y) && TileStore.SOLID_LUT[st.type[st.idx(x, y)]] === 1;
  /** 着陆盒锚行 = floorY-3（cs:55303 num10 = int((floorY*16-42)/16)） */
  const lyOf = (fy: number): number => Math.max(45, fy - 3);
  let spawnX = world.spawnX, spawnY = world.spawnY;
  for (let attempt = 0; attempt < 5000; attempt++) {
    const ax = Math.max(45, Math.min(W - 45, x0 + rng.nextIntRange(0, x1 - x0)));
    const ay = Math.max(45, Math.min(st.h - 45, y0 + rng.nextIntRange(0, y1 - y0)));
    // avoidWalls（cs:55267：锚格 wall>0 拒）
    if (st.wall[st.idx(ax, ay)] > 0) continue;
    // SolidCollision 盒净空（teleporteeSize 20×42 → 锚格上方 2×3 带无实心）
    let clear = true;
    for (let dx = 0; dx < 2 && clear; dx++) {
      for (let dy = -2; dy <= 0 && clear; dy++) {
        if (solidAt(ax + dx, ay + dy)) clear = false;
      }
    }
    if (!clear) continue;
    // tilesToAvoid（±60 盒扫，CheckNoInvalidTiles cs:452-482 / tilesToAvoidRange=60）
    let bad = false;
    outerAvoid:
    for (let i = -60; i <= 60; i += 1) {
      for (let j = -60; j <= 60; j += 1) {
        const x = ax + i, y = ay + j;
        if (!st.inBounds(x, y)) continue;
        const idx = st.idx(x, y);
        if (st.flags[idx] && avoidIds.has(st.type[idx])) { bad = true; break outerAvoid; }
      }
    }
    if (bad) continue;
    // 坠落扫描（cs:55285-55302：≤100 格内找到实心底；strictRange 内着地）
    let fall = -1;
    for (let d = 0; d < 100; d++) {
      if (solidAt(ax, ay + d)) { fall = d; break; }
    }
    if (fall < 0 || fall >= 99) continue;
    const floorY = ay + fall;
    if (!solidAt(ax - 1, floorY) && !solidAt(ax + 1, floorY)) continue;
    // ★IIIII41-T3①（落点二段复核，cs:55305-55331）：vanilla 在【着陆位置】再做一轮——
    //   CheckNoInvalidTiles(num9,num10)（num10=着陆盒锚行 floorY-3，vector.Y=(y+fall)*16-42
    //   → /16 = floorY-3）+ tileSafely.wall(avoidWalls) + WetCollision/LavaCollision/
    //   AnyHurtingTiles（着陆盒 20×42）。原精简核只查起掷点，fall 大时两处相距可达数十行
    //   ——探针实证：规避压板(s135) 与满水层落进起掷点盒外、着陆点盒内的缝。
    let bad2 = false;
    outerAvoid2:
    for (let i = -60; i <= 60; i += 1) {
      for (let j = -60; j <= 60; j += 1) {
        const x2 = ax + i, y2 = lyOf(floorY) + j;
        if (!st.inBounds(x2, y2)) continue;
        const idx2 = st.idx(x2, y2);
        if (st.flags[idx2] && avoidIds.has(st.type[idx2])) { bad2 = true; break outerAvoid2; }
      }
    }
    if (bad2) continue;
    // avoidWalls @着陆锚（cs:55321 tileSafely.wall>0）
    if (st.wall[st.idx(ax, Math.max(45, lyOf(floorY)))] > 0) continue;
    // WetCollision@着陆盒（20×42 px ≈ 锚列 ax..ax+1 × 行 floorY-3..floorY-1）+ 底格避液
    let liquidBad = false;
    for (let dx = 0; dx < 2 && !liquidBad; dx++) {
      for (let dy = -3; dy <= -1 && !liquidBad; dy++) {
        const ii = st.idx(Math.min(st.w - 1, ax + dx), Math.max(0, floorY + dy));
        if (st.liquid[ii] > 0) liquidBad = true;           // avoidAnyLiquid/WetCollision
      }
    }
    if (st.liquid[st.idx(ax, floorY)] > 0) continue;
    if (liquidBad) continue;
    if (hurtTiles(st, (ax - 1) * 16, (floorY - 3) * 16, 32, 48, false)) continue;   // avoidHurtTiles
    spawnX = ax;
    spawnY = floorY;   // 消费端 (spawnY-3)*16 落在地板上（同地表出生口径）
    break;
  }
  world.spawnX = spawnX; world.spawnX0 = spawnX;
  world.spawnY = Math.max(4, spawnY); world.spawnY0 = Math.max(4, spawnY);
}

/** DoAdditionalChangesAroundSpawnIfNeeded（cs:25211-25226）核心：
 *  PlaceTorchesAroundSpawn（cs:25264-25330）+ noTrapsWorldGen 门内
 *  RemoveSpecificTilesUnderSpawn（cs:25228-25263）。掷骰照抄原版语句序。 */
export function doAdditionalChangesAroundSpawnCore(st: TileStore, rng: RNG, _gs: GenState, world: World): void {
  const sf = world.seedFlags ?? {};
  const spawnX = world.spawnX, spawnY = world.spawnY;
  // ---- PlaceTorchesAroundSpawn（cs:25264+：2000 掷,半径 1→120 逐帧扩张,随机点水平走
  //      到贴墙,距既有火把 ≥20 才放;skyblock 才收 15;群系风格表 cs:25240-25262） ----
  const TORCH = TILE_BY_KEY['torch']!;
  const isNearby = (x: number, y: number, sheet: number, dist: number): boolean => {
    const id = sheetId(sheet);
    if (!id) return false;
    for (let i = x - dist; i <= x + dist; i++) {
      for (let j = y - dist; j <= y + dist; j++) {
        if (st.inBounds(i, j) && st.flags[st.idx(i, j)] && st.type[st.idx(i, j)] === id) return true;
      }
    }
    return false;
  };
  let radius = 1;
  for (let i = 0; i < 2000; i++) {
    if (radius < 120) radius++;
    let tx = rng.nextIntRange(spawnX - radius, spawnX + radius);
    let ty = rng.nextIntRange(spawnY - radius, spawnY + radius);
    let retries = 200;
    while (retries-- > 0 && !(tx > 50 && ty > 50 && tx < st.w - 50 && ty < st.h - 50)) {
      tx = rng.nextIntRange(spawnX - radius, spawnX + radius);
      ty = rng.nextIntRange(spawnY - radius, spawnY + radius);
    }
    if (retries <= 0) break;
    const dir = rng.nextIntRange(0, 2) === 0 ? 1 : -1;
    const ti = st.idx(tx, ty);
    if (st.flags[ti] === 0 && st.liquid[ti] === 0) {
      let budget = Math.floor(st.w / 2);
      while (st.flags[st.idx(tx, ty)] === 0 && st.inBounds(tx, ty)) {
        if (--budget <= 0) break;
        tx += dir;
        if (!(tx > 50 && ty > 50 && tx < st.w - 50 && ty < st.h - 50)) { tx -= dir; break; }
      }
      if (budget <= 0) continue;
      tx -= dir;
      if (isNearby(tx, ty, 4, 20)) continue;   // distance=20（cs:25180;skyblock 才 15）
      // 群系风格（cs:25240-25262 IsTileNearby(·,25) 链:丛林 21/丛林草 22/雪 9×2/
      // 沙 16/黑檀沙 18/猩红沙 19）
      let style = 0;
      if (isNearby(tx, ty, 60, 25)) style = 21;
      else if (isNearby(tx, ty, 70, 25)) style = 22;
      else if (isNearby(tx, ty, 161, 25)) style = 9;
      else if (isNearby(tx, ty, 147, 25)) style = 9;
      else if (isNearby(tx, ty, 53, 25)) style = 16;
      else if (isNearby(tx, ty, 25, 25)) style = 18;
      else if (isNearby(tx, ty, 203, 25)) style = 19;
      st.setTileSilent(tx, ty, TORCH, 0, style * 22);
      // ★AAAAAA：PlaceTile(4) 成功尾 SquareTileFrame（cs:60281）→ CheckTorch 附着向
      genSquareTileFrame(st, rng, tx, ty);
    } else {
      i--;   // cs:25268 命中实格不消耗次数
    }
  }
  // ---- RemoveSpecificTilesUnderSpawn（cs:25228-25263，noTrapsWorldGen 门 :25222）----
  //      出生点竖带 5 列×50 行清 TileID.Sets.RemoveWhenUnderSpawn 族（压板 135/442/428+
  //      尖刺 48+间歇泉 443），KillTile(noItem) 直清。
  if (sf.noTraps) {
    const removeIds = new Set(TILE_REMOVE_WHEN_UNDER_SPAWN.map((s) => sheetId(s)).filter((v) => v > 0));
    for (let i = 0; i < 50; i++) {
      const num = spawnY + i;
      if (!(spawnX >= 5 && num >= 5 && spawnX < st.w - 5 && num < st.h - 5)) continue;   // InWorld(·,·,5)
      for (let dx = -2; dx <= 2; dx++) {
        const x = spawnX + dx;
        if (!st.inBounds(x, num)) continue;
        const k = st.idx(x, num);
        if (st.flags[k] && removeIds.has(st.type[k])) st.setTileSilent(x, num, 0);
      }
    }
  }
}
