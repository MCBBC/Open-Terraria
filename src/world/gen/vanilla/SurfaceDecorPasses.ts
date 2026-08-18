// 原版表面装饰子 pass 群 1:1 移植（1456 WorldGen.cs AddGenerationPass 注册段）：
//   SurfaceOreAndStone(18559)      地表铜/铁矿露头 + 石块露头（OrePatch/StonePatch）
//   FallenLogsAndWaterFeatures(18625) 倒木（PlaceTile 488，50% 登记 GenVars.logX/logY）
//   DyePlants(20126)               染料植物 plantDye + MatureTheHerbPlants +
//                                  GrowGlowTulips(656) + PlaceChilletEggs(752)
//   Vines(20338)                   六类藤蔓垂直生长（52/382/62/528/636/205/638）
//   Flowers(20592)                 地表花圃（tile 3→73 重帧，消费 GenVars.logX）
//   Mushrooms(20744)               地表蘑菇斑（tile 3/24 frameX=144、201 frameX=270）
//   LongMoss(20915)                苔藓块四向冒苔藓芽（PlaceTile 184 + TileFrame 184）
//   LilypadsCattailsBambooAndSeaweed(22131) 睡莲 518/香蒲 519/竹 571/海藻 549
//
// 已知近似（逐条对照源码后保留，注释标 1456 行号）：
//  - PlaceTile 后置 SquareTileFrame 的邻格重帧链只移植本组放置的类型
//    （184 苔藓芽帧 / 571 CheckBamboo / 519 CheckCatTail / 549 CheckUnderwaterPlant）；
//    CheckDye/CheckLog/PlantCheck/CheckLilyPad 因放置门已保证支撑，恒为 no-op，未移植。
//  - KillTile 生成期语义（active=false + type=0，保留液体）经 setTileSilent(0) 达成；
//    原版还把 frameX/frameY 置 -1（本仓库 Uint16 无法存 -1，帧对渲染/对账均无影响）。
//  - ★GGGG 2026-08-18：Flowers 击杀位改走 killTileTree（KillTile 尾部 SquareTileFrame →
//    TileFrame case 5 → CheckTree 整树坍塌级联，零 genRand）——此前只杀单格 = 干基被
//    花草替换后整干浮空一格（"无根树"，seed 12345 小世界 15 列实锤）；原版整树消失。
//    其余击杀位（185/186/187 堆、香蒲、海藻、蜂巢凹龛、233 容忍格）邻域无树干/级联
//    恒 no-op，维持单格杀；529/530 邻接重帧为存量近似（稀有、零掷骰）备案不改。
//  - 秘密种子分支（notTheBees / remix / frozen / extraLiquid）全部不触发，未移植。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { solidTile } from './HalfBrickPass';
import { matureHerbPlants } from './StructuresPass';

// ---------- 内部 tile id → 原版 sheet id 查找表（模块级一次构建，热循环零分配） ----------
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** sheet 0（泥土/空格）特判：空格 type=0 恰好也是 dirt 的 sheet——与原版 type==0 语义一致 */
const sheetAt = (st: TileStore, x: number, y: number): number => {
  if (!st.inBounds(x, y)) return -1;
  return SHEET[st.type[st.idx(x, y)]];
};

// ---------- 原版集合表（TileID.cs / Main.cs 实证，按 sheet id 存放） ----------
/** TileID.Sets.Conversion.Grass（TileID.cs:51）——OrePatch/StonePatch 的草面门 */
const CONV_GRASS = new Set([2, 23, 199, 109, 477, 492]);
/** TileID.Sets.Conversion.Sand（:55）——OrePatch 深层扫描排除 */
const CONV_SAND = new Set([53, 112, 116, 234]);
/** TileID.Sets.Clouds（:197） */
const CLOUDS = new Set([189, 196, 460, 717, 718, 719]);
/** Main.tileDungeon（Main.cs:7941-7946） */
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
/** TileID.Sets.Corrupt（:329）/ Crimson（:347）——倒木 50×50 回避扫描 */
const SET_CORRUPT = new Set([23, 661, 25, 112, 163, 398, 400, 636]);
const SET_CRIMSON = new Set([199, 662, 203, 234, 200, 399, 401, 205]);
/** TileID.Sets.Ore（:399）——Flowers pass 的矿石→草转换判定 */
const SET_ORE = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
/** TileID.Sets.IsVine（:237）——GrowMoreVines 密度计数（按 type 计，含幽灵） */
const IS_VINE = new Set([52, 382, 62, 115, 205, 528, 636, 638]);
/** Main.tileMoss（Main.cs:6956-6996） */
const TILE_MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
/** TileID.Sets.tileMossBrick */
const TILE_MOSS_BRICK = new Set([512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]);
/** Main.tileCut（Main.cs 全量 41 项）——Vines 444 蜂巢凹龛净空判定 */
const TILE_CUT = new Set([654, 518, 519, 549, 529, 637, 231, 484, 711, 201, 3, 24, 28, 32, 51, 52, 61,
  62, 69, 655, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 205, 352, 382, 528, 636, 638, 444, 485, 454, 254, 236]);
/** TileID.Sets.Boulders（:195）——InvalidTileForPilesOrSpeleothems */
const BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** WallID.Sets.AllowsPlantsToGrow（WallID.cs:58）——PlaceTile(3) 的墙门（含 0=无墙） */
const WALL_ALLOWS_PLANTS = new Set([0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317,
  63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80]);
/** Main.wallHouse（Main.cs 全量，含 153-166 循环段）——Vines 444 凹龛墙门 */
const WALL_HOUSE = new Set([
  224, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340,
  341, 342, 343, 344, 345, 346, 60, 225, 226, 227, 231, 232, 233, 235, 234, 312, 313, 237, 238,
  239, 240, 173, 183, 179, 184, 181, 186, 168, 169, 142, 143, 144, 149, 151, 150, 152, 145, 148,
  175, 176, 182, 146, 147, 167, 133, 134, 135, 136, 137, 75, 76, 78, 82, 77, 1, 4, 5, 6, 10, 11,
  12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  41, 42, 43, 44, 45, 46, 47, 66, 67, 68, 72, 73, 107, 106, 245, 315, 316, 317, 109, 110, 111,
  112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 108, 100, 101, 102, 103,
  104, 105, 84, 74, 241, 85, 88, 89, 90, 91, 92, 93, 126, 127, 128, 129, 130, 131, 132, 138, 139,
  140, 141, 177, 172, 242, 243, 174, 230, 228, 229, 236, 319, 318, 321, 322, 320, 347, 348, 351,
  352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 246, 247, 248, 249,
  250, 251, 252, 253, 254, 255, 314, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267,
  268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286,
  287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305,
  306, 307, 308, 309, 310, 311, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166,
]);
/** plantDye 上格豁免族（cs:71310/71394）：上方是这些植物时仍可种 */
const DYE_PLANT_ABOVE = new Set([3, 51, 61, 73, 74, 184]);
/** PlaceDye 上/下格豁免族（cs:54013/54024，多 697/703） */
const DYE_PLANT_SIDE = new Set([3, 51, 697, 61, 703, 73, 74, 184]);
/** GetTileMossColor（cs:81954）：苔藓 sheet → 色号（TileFrame 184 的 frameX=22*色号） */
const MOSS_COLOR: Record<number, number> = {
  179: 0, 512: 0, 180: 1, 513: 1, 181: 2, 514: 2, 182: 3, 515: 3, 183: 4, 516: 4,
  381: 5, 517: 5, 534: 6, 535: 6, 536: 7, 537: 7, 539: 8, 540: 8, 625: 9, 626: 9, 627: 10, 628: 10,
};

// ---------- 本组放置的 tile（内部 id） ----------
const DYE_PLANT = TILE_BY_KEY['v_227_dye_plants']!;
const FALLEN_LOG = TILE_BY_KEY['v_488_fallen_log']!;
const GLOW_TULIP = TILE_BY_KEY['v_656_glow_tulip']!;
const CHILLET_EGG = TILE_BY_KEY['v_752_chillet_egg']!;
const MOSS_SPROUT = TILE_BY_KEY['v_184_moss_plants']!;
const VINE = TILE_BY_KEY['v_52_vines']!;
const VINE_FLOWER = TILE_BY_KEY['v_382_flower_vines']!;
const VINE_JUNGLE = TILE_BY_KEY['v_62_jungle_vines']!;
const VINE_MUSHROOM = TILE_BY_KEY['v_528_mushroom_vines']!;
const VINE_CORRUPT = TILE_BY_KEY['v_636_corrupt_vines']!;
const VINE_CRIMSON = TILE_BY_KEY['v_205_crimson_vines']!;
const VINE_ASH = TILE_BY_KEY['v_638_ash_vines']!;
const PLANT_SHORT = TILE_BY_KEY['v_3_forest_short_plants']!;
const PLANT_TALL = TILE_BY_KEY['v_73_forest_tall_plants']!;
const LILY_PAD = TILE_BY_KEY['v_518_lily_pads']!;
const CATTAIL = TILE_BY_KEY['v_519_cattails']!;
const BAMBOO = TILE_BY_KEY['v_571_bamboo']!;
const SEAWEED = TILE_BY_KEY['v_549_seaweed']!;
const PILE_SMALL = TILE_BY_KEY['v_185_small_decos']!;
const PILE_LARGE = TILE_BY_KEY['v_186_decos_3x2']!;
const HIVE = TILE_BY_KEY['v_444_bee_hive']!;  // ★s111 定罪 2026-08-17：曾引 'v_444_hive'
//  （local-item 退役批已更名 v_444_bee_hive）→ undefined 被 Uint16Array 静默吞成 0
//  → 藤蔓 pass 蜂巢凹龛全部"击杀后放空"= 2×2 洞（t0>444 ×192/种子）。掷流不受影响。

// ---------- 通用小工具 ----------
const inWorld = (st: TileStore, x: number, y: number, fluff = 0): boolean =>
  x >= fluff && y >= fluff && x < st.w - fluff && y < st.h - fluff;
const activeAt = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
/** WorldGen.SolidTile2（cs:70231 近似）：active && tileSolid（半砖/坡面放行） */
const solidTile2 = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  return !!TILE_DEFS[st.type[i]]?.solid;
};
/** WorldGen.SolidTileAllowBottomSlope（cs:70211）：active && (solid||solidTop) && 非顶坡 && 非半砖 */
const solidAllowBottomSlope = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return true; // 原版越界 return true
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !(d.solid || d.platform)) return false;
  const sl = st.slope[i];
  return !(sl === 1 || sl === 2) && !st.half[i];
};
const topSlope = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const s = st.slope[st.idx(x, y)];
  return s === 1 || s === 2;
};
const bottomSlope = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const s = st.slope[st.idx(x, y)];
  return s === 3 || s === 4;
};
/** 生成期 KillTile（cs:63559）：仅清除活性/类型（noItem=true），保留液体 */
const killTile = (st: TileStore, x: number, y: number): void => {
  if (!activeAt(st, x, y)) return;
  st.setTileSilent(x, y, 0);
};

// ============================================================
// 0. 树坍塌级联（GGGG 2026-08-18）：
//    KillTile(干基) → SquareTileFrame(cs:80924) → TileFrame(cs:82067) →
//    TileFrameImportant case 5 → CheckTree(cs:54598)——下方支撑失效时
//    干身逐格上杀 + 侧枝/根须按邻干判定连杀 = 整树坍塌（游戏内砍树同机制）。
//    Flowers pass（cs:20692）的 KillTile 干基格在原版因此绝不留下浮空树：
//    整树消失 + PlaceTile(3) 在原干基位放花/草。
//    级联全程零 genRand（CheckTree 纯格效应；KillTile 尘埃走 Main.rand，
//    且 type 5/3/73/185-187 分支均无 genRand 掷点）——掷流零扰动。
// ============================================================

/** CheckTree num4 归一化族（cs:54620-54636）：下方这些 sheet 一律视作 2（草） */
const TREE_GROUND_NORM = new Set([23, 661, 477, 60, 70, 109, 147, 199, 662, 492]);
/** VanityTreeGroundTest（cs:30474）：Conversion.Grass{2,23,199,109,477,492} 去 23/199（无归一化） */
const VANITY_GROUND = new Set([2, 109, 477, 492]);

/** TileFrame 生成期树域子集（cs:82067 边界 + inactive 早退；TileFrameCosmetic
 *  生成期跳过；PlantCheck(3/73 on 草)恒 no-op）。宝石树 583-589/灰烬树 634 在
 *  地下/地狱，花圃扫描窗（地表 ±30）不可达；棕榈 323 只长在沙族上、花圃击杀门
 *  要求下方草 2，恒不触发——均不派发（CheckPalmTree 在本域亦恒 no-op）。 */
function frameCellTree(st: TileStore, x: number, y: number): void {
  if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return;   // cs:82069 边界
  const k = st.idx(x, y);
  if (!st.flags[k]) return;                                          // inactive 早退
  const s = SHEET[st.type[k]];
  if (s === 5) checkTreeAt(st, x, y, false);
  else if (s === 596 || s === 616) checkTreeAt(st, x, y, true);
}

/** SquareTileFrame（cs:80926-80934）列优先 3×3 调用序 */
function squareFrameTree(st: TileStore, x: number, y: number): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) frameCellTree(st, x + dx, y + dy);
  }
}

/** KillTile + 尾部 SquareTileFrame（cs:63559 的生成期有效子集）——树坍塌入口 */
export function killTileTree(st: TileStore, x: number, y: number): void {
  if (!activeAt(st, x, y)) return;
  st.setTileSilent(x, y, 0);
  squareFrameTree(st, x, y);
}

/** CheckTree（cs:54598-54808）/ CheckTreeWithSettings·Vanity（cs:54430-54597）1:1。
 *  vanity=true 走 CheckTreeWithSettings 分支（地面谓词换 VANITY_GROUND、
 *  R3 杀后不再重帧——两版 cs 差异逐条保留）。帧读写走 cfx/cfy 虚拟值：
 *  原版 KillTile 置 frameX/Y=-1 后续规则仍重读（死格重帧对输出无影响，
 *  但尾部传播判定消费），Uint16 数组无法存 -1 故用虚拟值跟踪。 */
function checkTreeAt(st: TileStore, x: number, y: number, vanity: boolean): void {
  const k = st.idx(x, y);
  const frameX0 = st.frameX[k], frameY0 = st.frameY[k];
  const self = SHEET[st.type[k]];
  const typeAt = (cx: number, cy: number): number => {
    if (!st.inBounds(cx, cy)) return -1;                 // 原版 null tile → -1
    const i = st.idx(cx, cy);
    return st.flags[i] ? SHEET[st.type[i]] : -1;          // inactive → -1（幽灵 type 不读）
  };
  const num2 = typeAt(x - 1, y), num3 = typeAt(x + 1, y), num = typeAt(x, y - 1);
  let num4 = typeAt(x, y + 1);                                          // cs:54613 下方格
  if (!vanity && TREE_GROUND_NORM.has(num4)) num4 = 2;    // cs:54620-54636 归一化（仅 CheckTree）
  const groundOk = vanity ? VANITY_GROUND.has(num4) : num4 === 2;
  let cfx = frameX0, cfy = frameY0;
  let dead = false;
  const kill = (): void => {
    if (dead) return;                                      // 原版 KillTile inactive 早退
    st.setTileSilent(x, y, 0);
    dead = true; cfx = -1; cfy = -1;
    squareFrameTree(st, x, y);                             // cs:63950 KillTile 尾扫
  };
  const wr = (nfx: number, nfy: number): void => {
    cfx = nfx; cfy = nfy;
    if (!dead) { st.frameX[k] = nfx; st.frameY[k] = nfy; }
  };
  // R1（cs:54640 / 54449）：下方非草族非同类干 + 直干帧（fx∈{0,22,44} 且 fy≤130）
  if (!groundOk && num4 !== self
    && ((cfx === 0 && cfy <= 130) || (cfx === 22 && cfy <= 130) || (cfx === 44 && cfy <= 130))) kill();
  // R2 根须/基座侧格（cs:54646 / 54455）：fx∈[22,44]×fy∈[132,176]，须站草且贴干
  if (cfx >= 22 && cfx <= 44 && cfy >= 132 && cfy <= 176) {
    if (!groundOk) kill();
    else if ((cfx !== 22 || num2 !== self) && (cfx !== 44 || num3 !== self)) kill();
  } else if ((cfx === 88 && cfy >= 0 && cfy <= 44) || (cfx === 66 && cfy >= 66 && cfy <= 130)
    || (cfx === 110 && cfy >= 66 && cfy <= 110) || (cfx === 132 && cfy >= 0 && cfy <= 176)) {
    // R2else 侧枝干身重帧（cs:54685 / 54483）：按左右邻干选变体帧
    const n5 = cfy % 66;
    if (num2 === self && num3 === self) wr(110, 66 + n5);
    else if (num2 === self) wr(88, n5);
    else if (num3 === self) wr(66, 66 + n5);
    else wr(0, n5);
  }
  // R3 基座干身（cs:54708 / 54525）：fy∈[132,176] 且 fx∈{0,66,88}
  if (cfy >= 132 && cfy <= 176 && (cfx === 0 || cfx === 66 || cfx === 88)) {
    const n6 = cfy % 66;
    if (vanity) {
      if (!groundOk) kill();                               // CheckTreeWithSettings：杀后不重帧
      else if (num2 !== self && num3 !== self) wr(0, n6);
      else if (num2 !== self) wr(0, 132 + n6);
      else if (num3 !== self) wr(66, 132 + n6);
      else wr(88, 132 + n6);
    } else {
      if (!groundOk) kill();                               // CheckTree：杀后仍重帧（写死格对象）
      if (num2 !== self && num3 !== self) wr(0, n6);
      else if (num2 !== self) wr(0, 132 + n6);
      else if (num3 !== self) wr(66, 132 + n6);
      else wr(88, 132 + n6);
    }
  }
  // R4 侧枝贴干存活链（cs:54734-54749 / 54550-54565）
  if ((cfx === 66 && (cfy === 0 || cfy === 22 || cfy === 44)) || (cfx === 44 && (cfy === 198 || cfy === 220 || cfy === 242))) {
    if (num3 !== self) kill();
  } else if ((cfx === 88 && (cfy === 66 || cfy === 88 || cfy === 110)) || (cfx === 66 && (cfy === 198 || cfy === 220 || cfy === 242))) {
    if (num2 !== self) kill();
  } else if (num4 === -1) {
    kill();                                                 // cs:54747（|| num4==23 被前置归一化致死代码）
  } else if (num !== self && cfy < 198 && ((cfx !== 22 && cfx !== 44) || cfy < 132)) {
    // R4else3 干身孤立重帧（cs:54750-54796 / 54568-54597）
    const n7 = cfy % 66;
    if (num2 === self || num3 === self) {
      if (num4 === self) {
        if (num2 === self && num3 === self) wr(132, 132 + n7);
        else if (num2 === self) wr(132, n7);
        else wr(132, 66 + n7);
      } else {
        if (num2 === self && num3 === self) wr(154, 132 + n7);
        else if (num2 === self) wr(154, n7);
        else wr(154, 66 + n7);
      }
    } else wr(110, n7);
  }
  // 尾部传播（cs:54798-54806 / 54593-54601）：双帧均变才四邻重帧
  if (cfx !== frameX0 && cfy !== frameY0 && frameX0 >= 0 && frameY0 >= 0) {
    frameCellTree(st, x - 1, y);
    frameCellTree(st, x + 1, y);
    frameCellTree(st, x, y - 1);
    frameCellTree(st, x, y + 1);
  }
}

// ============================================================
// 1. SurfaceOreAndStone（cs:18559）
// ============================================================

/** OreHelper（cs:10192）：矿块 ±1 邻域的石头(1)/黏土(40) 改回泥土(0) */
function oreHelper(st: TileStore, x: number, y: number): void {
  for (let i = x - 1; i <= x + 1; i++) {
    for (let j = y - 1; j <= y + 1; j++) {
      if (!st.inBounds(i, j)) continue;
      const s = SHEET[st.type[st.idx(i, j)]];
      if (s === 1 || s === 40) st.type[st.idx(i, j)] = TILE_BY_KEY['dirt']!;
    }
  }
}

/** OrePatch（cs:10577）1:1：草面露头矿脉（先竖走丝带后随机游走团） */
function orePatch(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number): boolean {
  let type = gs.oreTiers.copper;
  if (rng.int(0, 2) === 0) type = gs.oreTiers.iron;                    // Next(3)==0 → 铁
  let num = X, num2 = Y;
  while (!solidTile(st, num, num2)) {
    num2++;
    if (num2 > gs.worldSurface) return false;
  }
  if (!CONV_GRASS.has(sheetAt(st, num, num2)) || !CONV_GRASS.has(sheetAt(st, num - 1, num2))
    || !CONV_GRASS.has(sheetAt(st, num + 1, num2))) return false;
  if (!st.inBounds(num, num2) || st.wall[st.idx(num, num2)] > 0) return false;
  for (let i = num - 10; i <= num + 10; i++) {
    for (let j = num2 + 7; j <= num2 + 30; j++) {
      if (!st.inBounds(i, j)) return false;                            // Main.tile 越界 = null
      const k = st.idx(i, j);
      const s = SHEET[st.type[k]];
      if (!st.flags[k] || TILE_DUNGEON.has(s) || CLOUDS.has(s) || CONV_SAND.has(s) || st.wall[k] === 0) {
        return false;
      }
    }
  }
  const setOre = (x: number, y: number): void => {
    if (!st.inBounds(x, y)) return;
    const k = st.idx(x, y);
    st.type[k] = type;
    st.flags[k] = 1;                                                   // 仅 type+active（原版不清半砖/坡）
  };
  num2 += rng.int(0, 1);                                               // Next(2)
  setOre(num, num2);
  oreHelper(st, num, num2);
  const num3 = num2;
  // 注意：C# while 条件里的 genRand.Next(8,13) 每圈重掷——1:1 保留
  while (num2 < num3 + rng.int(8, 12)) {
    num += rng.int(-1, 1);                                             // Next(-1,2)
    num2 += rng.int(1, 2);                                             // Next(1,3)
    if (rng.int(0, 2) === 0) num2++;
    setOre(num, num2);
    oreHelper(st, num, num2);
    if (rng.int(0, 3) === 0) {                                         // Next(4)
      const n4 = num + rng.int(-2, 2);                                 // Next(-2,3)
      const n5 = num2 + rng.int(1, 1);                                 // Next(2)
      setOre(n4, n5);
      oreHelper(st, n4, n5);
    }
  }
  // 随机游走团（cs:10659-10712）
  let vx = num, vy = num2;
  let v2x = rng.next() * 0.6 - 0.3;
  let v2y = rng.next() * 0.5 + 0.5;
  let n6 = rng.int(5, 8);                                              // Next(5,9)
  let n7 = rng.int(9, 13);                                             // Next(9,14)
  if (rng.int(0, 2) === 0) n6 += rng.int(1, 1);                        // Next(2)
  if (rng.int(0, 2) === 0) n7 += rng.int(1, 1);
  while (n7 > 0) {
    n7--;
    const lo = (n6 * 4) | 0;
    for (let k = num - lo; k <= num + n6 * 4; k++) {
      for (let l = num2 - lo; l <= num2 + n6 * 4; l++) {
        const n8 = n6 * (0.5 + rng.next() * 0.5) * 0.1;
        let n9 = n6 * (0.7 + rng.next() * 0.6) * 0.3;
        if (rng.int(0, 7) === 0) n9 *= 2;                              // Next(8)
        if (!st.inBounds(k, l)) continue;
        const dx = vx - k, dy = vy - l;
        const d = Math.sqrt(dx * dx + dy * dy);
        const kk = st.idx(k, l);
        if (d < n8) {
          st.flags[kk] = 0;                                            // 挖空（留幽灵 type）
        } else if (d < n9) {
          st.type[kk] = type;
          if (rng.int(0, 3) === 0) st.flags[kk] = 1;                   // Next(4)
          oreHelper(st, k, l);
        }
      }
    }
    vx += v2x; vy += v2y;
    v2x += rng.next() * 0.2 - 0.1;
    v2y += rng.next() * 0.2 - 0.1;
    // 原版此处的 Utils.Clamp(...) 是无赋值语句（返回值被丢弃）——不夹紧，1:1 保留
  }
  return true;
}

/** PlaceSmallPile（cs:46831）1:1：185 小堆（size 0 单格 / size 1 双格） */
function placeSmallPile(st: TileStore, x: number, y: number, pileStyle: number, pileSize: number): boolean {
  if (!st.inBounds(x, y) || !st.inBounds(x + 1, y + 1)) return false;
  const i0 = st.idx(x, y);
  if (st.liquid[i0] > 0 && st.liquidType[i0] === 2) return false;      // anyLava
  if (pileSize === 1) {
    const frameX = pileStyle * 36, frameY = 18;
    if (solidTile2(st, x, y + 1) && solidTile2(st, x + 1, y + 1)
      && !activeAt(st, x, y) && !activeAt(st, x + 1, y)
      && !invalidForPiles(st, x, y + 1) && !invalidForPiles(st, x + 1, y + 1)) { // cs:46863
      st.setTileSilent(x, y, PILE_SMALL, frameX, frameY);
      st.setTileSilent(x + 1, y, PILE_SMALL, frameX + 18, frameY);
      return true;
    }
    return false;
  }
  if (solidTile2(st, x, y + 1) && !activeAt(st, x, y)) {
    st.setTileSilent(x, y, PILE_SMALL, pileStyle * 18, 0);
    return true;
  }
  return false;
}

/** InvalidTileForPilesOrSpeleothems（cs:39005）：活性巨石族 */
const invalidForPiles = (st: TileStore, x: number, y: number): boolean =>
  inWorld(st, x, y, 2) && activeAt(st, x, y) && BOULDERS.has(sheetAt(st, x, y));

/** Place3x2（cs:52097）1:1：3×2 大堆/倒木，锚点 = 底行中间格 */
function place3x2(st: TileStore, x: number, y: number, tileId: number, sheet: number, style: number): boolean {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;
  for (let i = x - 1; i < x + 2; i++) {
    for (let j = y - 1; j < y + 1; j++) {
      if (activeAt(st, i, j)) return false;
    }
    if (sheet === 186 && invalidForPiles(st, i, y + 1)) return false;
    if (!solidTile2(st, i, y + 1)) return false;
  }
  const base = 54 * style;
  for (let i = 0; i < 3; i++) {
    st.setTileSilent(x - 1 + i, y - 1, tileId, base + i * 18, 0);
    st.setTileSilent(x - 1 + i, y, tileId, base + i * 18, 18);
  }
  return true;
}

/** StonePatch（cs:10206）1:1：草面石块露头（带 185/186 碎石装饰） */
function stonePatch(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number): boolean {
  void gs;
  let num = Y;
  while (!solidTile(st, X, num)) {
    num++;
    if (num > gs.worldSurface) return false;
  }
  if (!CONV_GRASS.has(sheetAt(st, X, num)) || !CONV_GRASS.has(sheetAt(st, X - 1, num))
    || !CONV_GRASS.has(sheetAt(st, X + 1, num))) return false;
  if (!st.inBounds(X, num) || st.wall[st.idx(X, num)] > 0) return false;
  for (let i = X - 10; i <= X + 10; i++) {
    for (let j = num + 7; j <= num + 30; j++) {
      if (!st.inBounds(i, j)) return false;
      const k = st.idx(i, j);
      const s = SHEET[st.type[k]];
      if (!st.flags[k] || TILE_DUNGEON.has(s) || CLOUDS.has(s) || CONV_SAND.has(s)
        || st.wall[k] === 0 || s === 199 || s === 23) return false;
    }
  }
  // 随机游走团（cs:10245-10303）
  let vx = X, vy = num;
  let v2x = rng.next() * 0.6 - 0.3;
  let v2y = rng.next() * 0.5 + 0.5;
  let n2 = rng.int(13, 17);                                            // Next(13,18)
  let n3 = rng.int(13, 18);                                            // Next(13,19)
  if (rng.int(0, 2) === 0) n2 += rng.int(1, 2);                        // Next(3)==0 → +Next(3)
  if (rng.int(0, 2) === 0) n3 += rng.int(1, 2);
  const stone = TILE_BY_KEY['stone']!;
  while (n3 > 0) {
    n3--;
    const lo = (n2 * 4) | 0;
    for (let k = X - lo; k <= X + n2 * 4; k++) {
      for (let l = num - lo; l <= num + n2 * 4; l++) {
        let n4 = n2 * (0.7 + rng.next() * 0.6) * 0.3;
        if (rng.int(0, 7) === 0) n4 *= 2;                              // Next(8)
        if (!st.inBounds(k, l) || !st.inBounds(k, l + 1)) continue;
        const dx = vx - k, dy = vy - l;
        const d = Math.sqrt(dx * dx + dy * dy);
        const kk = st.idx(k, l);
        const gk = st.idx(k, l + 1);
        if (d < n4 * 2 && !st.flags[kk] && st.flags[gk] && SHEET[st.type[gk]] === 1
          && rng.int(0, 6) === 0                                       // Next(7)
          && solidTile(st, k - 1, l + 1) && solidTile(st, k + 1, l + 1)) {
          if (rng.int(0, 2) !== 0) {                                   // Next(3)
            place3x2(st, k, l, PILE_LARGE, 186, rng.int(7, 12));        // Next(7,13)
          }
          if (rng.int(0, 2) !== 0) placeSmallPile(st, k, l, rng.int(0, 5), 1); // Next(6)
          placeSmallPile(st, k, l, rng.int(0, 5), 0);
        }
        if (d < n4) {
          const t = st.type[kk];
          if (TILE_DEFS[t]?.solid) st.type[kk] = stone;                // 仅实心格转石
        }
      }
    }
    vx += v2x; vy += v2y;
    v2x += rng.next() * 0.2 - 0.1;
    v2y += rng.next() * 0.2 - 0.1;
  }
  return true;
}

/** SurfaceOreAndStone pass（cs:18559）：先矿脉后石块，均带中心带回避 + 矿点登记。
 *  rng.int 闭区间 ≡ Next(a, b+1)——所有上界传原版第二参 -1。 */
export function runSurfaceOreAndStonePass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w;
  let num = rng.int(((w * 5) / 4200) | 0, (((w * 10) / 4200) | 0) - 1); // Next(w*5/4200, w*10/4200)
  for (let i = 0; i < num; i++) {
    let tries = (w / 420) | 0;
    while (tries > 0) {
      tries--;
      let x = rng.int(gs.beachDistance, w - gs.beachDistance - 1);     // Next(bd, w-bd)
      while (x >= w * 0.48 && x <= w * 0.52) x = rng.int(gs.beachDistance, w - gs.beachDistance - 1);
      const y = rng.int(gs.worldSurfaceLow, gs.worldSurface - 1);      // Next((int)wsLow, (int)ws)
      let near = false;
      for (let j = 0; j < gs.numOrePatch; j++) {
        if (Math.abs(x - gs.orePatchX[j]) < 200) near = true;
      }
      if (!near && orePatch(st, rng, gs, x, y)) {
        if (gs.numOrePatch < 49) {                                     // maxOrePatch-1
          gs.orePatchX[gs.numOrePatch] = x;
          gs.numOrePatch++;
        }
        break;
      }
    }
  }
  num = rng.int(1, (((w * 7) / 4200) | 0) - 1);                         // Next(1, w*7/4200)
  for (let k = 0; k < num; k++) {
    let tries = (w / 420) | 0;
    while (tries > 0) {
      tries--;
      let x = rng.int(gs.beachDistance, w - gs.beachDistance - 1);
      while (x >= w * 0.47 && x <= w * 0.53) x = rng.int(gs.beachDistance, w - gs.beachDistance - 1);
      const y = rng.int(gs.worldSurfaceLow, gs.worldSurface - 1);
      let near = false;
      for (let l = 0; l < gs.numOrePatch; l++) {
        if (Math.abs(x - gs.orePatchX[l]) < 100) near = true;
      }
      if (!near && stonePatch(st, rng, gs, x, y)) break;
    }
  }
}

// ============================================================
// 2. FallenLogsAndWaterFeatures（cs:18625，仅倒木段——水景段属秘密种子）
// ============================================================

/** FallenLogsAndWaterFeatures pass 1:1（cs:18637-18765） */
export function runFallenLogsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  let num = (w / 2100) | 0;
  num += rng.int(-1, 1);                                               // Next(-1,2)
  for (let i = 0; i < num; i++) {
    const x0 = gs.beachDistance + 20;
    let budget = 30000;
    const relaxAt = 5000;
    while (budget > 0) {
      budget--;
      let x = rng.int(x0, w - x0 - 1);                                  // Next(x0, w-x0)
      let j = rng.int(10, gs.worldSurface - 1);                         // Next(10, (int)worldSurface)
      const relaxed = budget < relaxAt;
      if (budget > relaxAt / 2) {
        while (x > w * 0.4 && x < w * 0.6) x = rng.int(x0, w - x0 - 1);
      }
      if (!activeAt(st, x, j) && st.inBounds(x, j) && st.wall[st.idx(x, j)] === 0) {
        let ok = true;
        for (; !activeAt(st, x, j) && st.inBounds(x, j) && st.wall[st.idx(x, j)] === 0 && j <= gs.worldSurface; j++) {
          // 下落至首个活性格（cs:18682）
        }
        if (j > gs.worldSurface - 10) {
          ok = false;
        } else if (!relaxed) {
          // 50×50 群系回避（cs:18692-18728）：云 189/沙 53/地牢砖/腐化/猩红
          for (let k = x - 50; k < x + 50 && ok; k++) {
            if (k <= 10 || k >= w - 10) continue;
            for (let l = j - 50; l < j + 50 && ok; l++) {
              if (l <= 10 || l >= h - 10) continue;
              const s = sheetAt(st, k, l);
              if (s === 189 || s === 53 || TILE_DUNGEON.has(s)
                || SET_CRIMSON.has(s) || SET_CORRUPT.has(s)) ok = false;
            }
          }
          if (ok) {
            // 上方 20×10 须净空无墙（cs:18731-18747）
            for (let m = x - 10; m < x + 10 && ok; m++) {
              for (let n = j - 10; n < j - 1 && ok; n++) {
                if (!st.inBounds(m, n)) { ok = false; break; }
                const k = st.idx(m, n);
                if (st.flags[k] && TILE_DEFS[st.type[k]]?.solid) ok = false;
                else if (st.wall[k] !== 0) ok = false;
              }
            }
          }
        }
        const grassHere = sheetAt(st, x, j) === 2;
        const grassL = sheetAt(st, x - 1, j) === 2;
        const grassR = sheetAt(st, x + 1, j) === 2;
        const dryAbove = st.inBounds(x, j - 1) && (st.liquid[st.idx(x, j - 1)] === 0 || budget < relaxAt / 5);
        if (ok && dryAbove && grassHere && grassL && grassR) {
          j--;
          const placed = place3x2(st, x, j, FALLEN_LOG, 488, 0);       // PlaceTile(x, j, 488)
          if (placed) {
            if (rng.int(0, 1) === 0) {                                 // Next(2)——GenVars.logX/logY
              gs.logX = x;
              gs.logY = j;
            }
            budget = -1;
          }
        }
      }
    }
  }
}

// ============================================================
// 3. DyePlants（cs:20126）
// ============================================================

/** ±num 方框内是否已有染料植物（cs:71316-71325，上界排他）。
 *  生成期只种非奇异株（frameX<272），而生成不会产出奇异株 → 等价于"任意 227" */
function dyeNearby(st: TileStore, i: number, j: number, rad: number): boolean {
  const w = st.w, h = st.h;
  const x0 = Math.max(1, Math.min(w - 2, i - rad));
  const x1 = Math.max(1, Math.min(w - 2, i + rad));
  const y0 = Math.max(1, Math.min(h - 2, j - rad));
  const y1 = Math.max(1, Math.min(h - 2, j + rad));
  for (let k = x0; k < x1; k++) {
    for (let l = y0; l < y1; l++) {
      const k2 = st.idx(k, l);
      if (st.flags[k2] && SHEET[st.type[k2]] === 227 && st.frameX[k2] < 272) return true;
    }
  }
  return false;
}

/** PlaceDye（cs:54004）1:1：style 门（上方豁免族/下方支撑/液体/墙） */
function placeDye(st: TileStore, x: number, y: number, style: number): boolean {
  if (!st.inBounds(x, y + 1) || !st.inBounds(x, y - 1)) return false;
  let ok = false;
  const i0 = st.idx(x, y);
  if (style === 7) {
    // 垂吊株：钉在天花板下
    if (activeAt(st, x, y + 1) && !DYE_PLANT_SIDE.has(sheetAt(st, x, y + 1))) return false;
    if (solidTile(st, x, y - 1) && !activeAt(st, x, y + 1)) ok = true;
  } else {
    if (activeAt(st, x, y - 1) && !DYE_PLANT_SIDE.has(sheetAt(st, x, y - 1))) return false;
    if (style === 6) {
      // 冰刺株（style 6）：须长在仙人掌 80 顶上且两侧空（nactive = active）
      if (activeAt(st, x, y + 1) && sheetAt(st, x, y + 1) === 80
        && !activeAt(st, x - 1, y + 1) && !activeAt(st, x + 1, y + 1)) ok = true;
    } else if (solidTile(st, x, y + 1) && !activeAt(st, x, y - 1)) {
      const liq = st.liquid[i0];
      const lt = st.liquidType[i0];
      if (style === 5) {
        // 水中株：满水且非岩浆/蜂蜜/微光
        if (liq === 255 && lt !== 2 && lt !== 3 && lt !== 4) ok = true;
      } else if (style >= 8 && style <= 11) {
        ok = true;                                                      // 奇异株（生成期不走）
      } else {
        if (liq !== 0) ok = false;
        else if (style === 3 || style === 4) {
          if (st.wall[i0] === 0) ok = true;                             // 地表株须无墙
        } else ok = true;
      }
    }
  }
  if (ok) {
    st.setTileSilent(x, y, DYE_PLANT, 34 * style, 0);                  // frameX = 34*style（cs:54078）
    st.half[i0] = 0;
    st.slope[i0] = 0;
  }
  return ok;
}

/** plantDye（cs:71298）1:1：表层/地下/垂吊三段（exoticPlant=false 生成路径） */
function plantDye(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): void {
  const w = st.w, h = st.h;
  if (!activeAt(st, i, j) || i < 95 || i > w - 95 || j < 95 || j > h - 95) return;
  const rad = 90;
  const aboveFree = !activeAt(st, i, j - 1) || DYE_PLANT_ABOVE.has(sheetAt(st, i, j - 1));
  // ---- 表层段（cs:71310-71389）----
  if (j < gs.worldSurface && aboveFree) {
    if (dyeNearby(st, i, j, rad)) return;
    const t = sheetAt(st, i, j);
    if (t === 2 || t === 109) {
      placeDye(st, i, j - 1, rng.int(0, 3) === 0 ? 4 : 3);              // Next(4)==0 → 4
    } else if (t === 60) {
      placeDye(st, i, j - 1, rng.int(0, 1) === 0 ? 2 : 4);              // Next(2)
    } else if (t === 53 && st.inBounds(i, j - 2)
      && st.liquid[st.idx(i, j - 1)] === 255 && st.liquid[st.idx(i, j - 2)] === 255) {
      placeDye(st, i, j - 1, 2);                                        // 水下沙滩株
    } else if (t === 80 && !activeAt(st, i - 1, j - 1) && !activeAt(st, i + 1, j - 1)) {
      // 仙人掌顶（cs:71365-71388）：±5×(j-5..j+15) 内无黑檀/猩红沙 112/234
      let clear = true;
      for (let m = i - 5; m <= i + 5 && clear; m++) {
        for (let n = j - 5; n <= j + 15 && clear; n++) {
          if (!st.inBounds(m, n)) { clear = false; break; }
          const s = sheetAt(st, m, n);
          if (st.flags[st.idx(m, n)] && (s === 112 || s === 234)) clear = false;
        }
      }
      if (clear) placeDye(st, i, j - 1, 6);
    }
  }
  // ---- 段位门（cs:71390）：表层或地狱层直接返回 ----
  if (j < gs.worldSurface || j >= h - 200) return;                      // UnderworldLayer = h-200
  // ---- 地下段（cs:71394-71447）----
  if (aboveFree) {
    if (dyeNearby(st, i, j, rad)) return;
    const t = sheetAt(st, i, j);
    if (t === 60) {
      if (rng.int(0, 1) === 0) placeDye(st, i, j - 1, 2);
      else if (rng.int(0, 1) === 0) placeDye(st, i, j - 1, 0);
      else placeDye(st, i, j - 1, 1);
    } else if (t === 0 || t === 1 || t === 59) {
      if (rng.int(0, 1) === 0) placeDye(st, i, j - 1, 0);
      else placeDye(st, i, j - 1, 1);
    } else if (st.inBounds(i, j - 2)
      && st.liquid[st.idx(i, j - 1)] === 255 && st.liquid[st.idx(i, j - 2)] === 255) {
      placeDye(st, i, j - 1, 5);
    }
  }
  // ---- 垂吊段（cs:71449-71466）：天花板上垂下的 style 7 ----
  if (activeAt(st, i, j + 1)) return;
  {
    // 无 clamp 扫描（cs:71453-71461），越界格视为非活性
    let found = false;
    for (let k = i - rad; k < i + rad && !found; k++) {
      for (let l = j - rad; l < j + rad && !found; l++) {
        if (activeAt(st, k, l) && sheetAt(st, k, l) === 227) found = true;
      }
    }
    if (found) return;
    if (sheetAt(st, i, j) === 0) placeDye(st, i, j + 1, 7);
  }
}

/** GrowGlowTulips（cs:45628）+ TryGrowingGlowTulip（cs:73171）+ NoNearbyGlowTulips（cs:73196）1:1 */
function growGlowTulips(st: TileStore, rng: RNG, gs: GenState): void {
  void gs;
  const w = st.w, h = st.h;
  const worldSize = w <= 4200 ? 0 : w <= 6400 ? 1 : 2;                 // GetWorldSize（cs:6518）
  const n2 = 100, n3 = 300;
  const target = worldSize === 1 ? 4 : worldSize === 2 ? 6 : 2;
  let placed = 0;
  let budget = 10000;
  while (placed < target) {
    budget--;
    if (budget <= 0) break;
    const pickLeft = placed >= ((target / 2) | 0) && (budget <= 7500 || rng.int(0, 1) !== 0);
    const i = pickLeft ? rng.int(w - n3, w - n2 - 1) : rng.int(n2, n3 - 1);
    const j = rng.int(gs.worldSurface, h - 201);                        // Next(ws, h-200)
    if (tryGrowGlowTulip(st, rng, i, j)) placed++;
  }
}

/** HasValidGroundForGlowTulipBelowSpot（cs:73148）1:1 */
function glowTulipGround(st: TileStore, x: number, y: number): boolean {
  if (!inWorld(st, x, y, 2)) return false;
  if (!activeAt(st, x, y + 1)) return false;
  const t = sheetAt(st, x, y + 1);
  const okType = t === 0 || t === 70 || t === 633 || t === 59 || t === 225
    || CONV_GRASS.has(t) || t === 1 || t === 25 || t === 117 || t === 203 || TILE_MOSS.has(t);
  if (!okType) return false;
  return solidAllowBottomSlope(st, x, y + 1);
}

function tryGrowGlowTulip(st: TileStore, rng: RNG, i: number, j: number): boolean {
  const w = st.w, h = st.h;
  for (let k = 0; k < 5; k++) {
    const x = rng.int(Math.max(10, i - 10), Math.min(w - 10, i + 10) - 1);
    const y = rng.int(Math.max(10, j - 10), Math.min(h - 10, j + 10) - 1);
    if (!glowTulipGround(st, x, y)) continue;
    // NoNearbyGlowTulips（cs:73196）：±120 方框内无 656
    let near = false;
    const x0 = Math.max(10, Math.min(w - 11, x - 120));
    const x1 = Math.max(10, Math.min(w - 11, x + 120));
    const y0 = Math.max(10, Math.min(h - 11, y - 120));
    const y1 = Math.max(10, Math.min(h - 11, y + 120));
    for (let a = x0; a <= x1 && !near; a++) {
      for (let b = y0; b <= y1 && !near; b++) {
        if (activeAt(st, a, b) && sheetAt(st, a, b) === 656) near = true;
      }
    }
    if (near) continue;
    // PlaceTile(x, y, 656)（cs:59519）：(!active || tileCut || Breakable) && 地面有效
    const k0 = st.idx(x, y);
    const cutOk = !st.flags[k0] || TILE_CUT.has(SHEET[st.type[k0]]);
    if (!cutOk) continue;
    st.setTileSilent(x, y, GLOW_TULIP, 0, 0);
    st.half[k0] = 0;
    st.slope[k0] = 0;
    return true;
  }
  return false;
}

/** PlaceChilletEggs（cs:45659）+ TryPlacingChilletEgg（cs:45709）1:1（Place2x2 锚=右下角） */
function placeChilletEggs(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  const worldSize = w <= 4200 ? 0 : w <= 6400 ? 1 : 2;
  const target = worldSize === 1 ? 9 : worldSize === 2 ? 12 : 6;
  let placed = 0;
  let budget = 10000;
  while (placed < target) {
    budget--;
    if (budget <= 0) break;
    const i = rng.int(100, w - 101);
    const j = rng.int(Math.floor(gs.rockLevel), h - 201);               // Next(rockLayer, h-200)
    if (tryPlaceChilletEgg(st, rng, i, j)) placed++;
  }
}

/** chillet 蛋地面门 = glow tulip 同款（cs:45734 与 73148 逐字一致） */
const chilletGround = glowTulipGround;

function tryPlaceChilletEgg(st: TileStore, rng: RNG, i: number, j: number): boolean {
  const w = st.w, h = st.h;
  for (let k = 0; k < 5; k++) {
    const x = rng.int(Math.max(10, i - 10), Math.min(w - 10, i + 10) - 1);
    const y = rng.int(Math.max(10, j - 10), Math.min(h - 10, j + 10) - 1);
    if (!chilletGround(st, x, y)) continue;
    // NoNearbyChilletEggs（cs:45689）：±20 方框内无 752
    let near = false;
    const x0 = Math.max(10, Math.min(w - 11, x - 20));
    const x1 = Math.max(10, Math.min(w - 11, x + 20));
    const y0 = Math.max(10, Math.min(h - 11, y - 20));
    const y1 = Math.max(10, Math.min(h - 11, y + 20));
    for (let a = x0; a <= x1 && !near; a++) {
      for (let b = y0; b <= y1 && !near; b++) {
        if (activeAt(st, a, b) && sheetAt(st, a, b) === 752) near = true;
      }
    }
    if (near) continue;
    // PlaceTile(x, y, 752) → Place2x2（cs:51352）：2×2 净空 + 双列地面 SolidTile2
    if (x < 5 || x > w - 5 || y < 5 || y > h - 5) continue;
    let ok = true;
    for (let a = x - 1; a <= x && ok; a++) {
      for (let b = y - 1; b <= y && ok; b++) {
        if (activeAt(st, a, b)) ok = false;
      }
      if (!solidTile2(st, a, y + 1)) ok = false;
    }
    if (!ok) continue;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        st.setTileSilent(x - 1 + a, y - 1 + b, CHILLET_EGG, a * 18, b * 18); // frameY = style*36 + b*18
      }
    }
    return true;
  }
  return false;
}

/** DyePlants pass（cs:20126）：w 次 plantDye + 熟成 + 荧光郁金香 + 啮龙蛋 */
export function runDyePlantsPass(st: TileStore, rng: RNG, gs: GenState): void {
  for (let i = 0; i < st.w; i++) {
    plantDye(st, rng, gs, rng.int(100, st.w - 101), rng.int(100, st.h - 201));
  }
  matureHerbPlants(st, rng, gs);                                        // cs:20135（原版在此 pass 内调用）
  growGlowTulips(st, rng, gs);
  placeChilletEggs(st, rng, gs);
}

// ============================================================
// 4. Vines（cs:20338）
// ============================================================

/** Collision.CanHitLine（Collision.cs:590）1:1：Tile 级视线（3 格宽扫掠） */
function canHitLine(st: TileStore, x1: number, y1: number, x2: number, y2: number): boolean {
  let num = Math.max(1, Math.min(st.w - 1, x1));                        // 越界钳制（cs:596-627）
  let num2 = Math.max(1, Math.min(st.h - 40, y1));
  const num3 = Math.max(1, Math.min(st.w - 1, x2));
  const num4 = Math.max(1, Math.min(st.h - 40, y2));
  const n5 = Math.abs(num - num3);
  const n6 = Math.abs(num2 - num4);
  if (n5 === 0 && n6 === 0) return true;
  let n7 = 1, n8 = 1;
  if (n5 === 0 || n6 === 0) {
    if (n5 === 0) n7 = 0;
    if (n6 === 0) n8 = 0;
  } else if (n5 > n6) {
    n7 = n5 / n6;
  } else {
    n8 = n6 / n5;
  }
  let f1 = 0, f2 = 0;
  let mode: 1 | 2 = num2 < num4 ? 2 : 1;
  let rx = (n5 | 0), ry = (n6 | 0);
  const sx = Math.sign(num3 - num);
  const sy = Math.sign(num4 - num2);
  let done = false, done2 = false;
  // 3 格宽 swath 任一实心非顶面格 → false（越界 = null → 直接 miss）
  const blocked = (cx: number, cy: number): boolean =>
    !st.inBounds(cx - 1, cy) || !st.inBounds(cx, cy) || !st.inBounds(cx + 1, cy)
    || solidTile(st, cx - 1, cy) || solidTile(st, cx, cy) || solidTile(st, cx + 1, cy);
  do {
    if (mode === 2) {
      f1 += n7;
      const step = f1 | 0;
      f1 -= step;
      for (let s = 0; s < step; s++) {
        if (blocked(num, num2)) return false;
        if (rx === 0 && ry === 0) { done = true; break; }
        num += sx; rx--;
        if (rx === 0 && ry === 0 && step === 1) done2 = true;
      }
      if (ry !== 0) mode = 1;
    } else {
      f2 += n8;
      const step = f2 | 0;
      f2 -= step;
      for (let s = 0; s < step; s++) {
        if (blocked(num, num2)) return false;
        if (rx === 0 && ry === 0) { done = true; break; }
        num2 += sy; ry--;
        if (rx === 0 && ry === 0 && step === 1) done2 = true;
      }
      if (rx !== 0) mode = 2;
    }
    if (solidTile(st, num, num2)) return false;                          // 中心格复检（cs:763-771）
  } while (!(done || done2));
  return true;
}

/** GrowMoreVines（cs:45592）1:1：±4×(-6..10) 内藤蔓密度门 */
function growMoreVines(st: TileStore, x: number, y: number): boolean {
  if (!inWorld(st, x, y, 30)) return false;
  let cap = 60;
  if (sheetAt(st, x, y) === 528) cap = (cap / 5) | 0;
  let count = 0;
  for (let i = x - 4; i <= x + 4; i++) {
    for (let j = y - 6; j <= y + 10; j++) {
      if (!st.inBounds(i, j)) continue;
      const k = st.idx(i, j);
      const s = SHEET[st.type[k]];                                      // 按 type 计（含幽灵，1:1）
      if (!IS_VINE.has(s)) continue;
      count++;
      if (j > y && canHitLine(st, x, y, i, j)) {
        count = s !== 528 ? count + (j - y) * 2 : count + (j - y) * 20;
      }
      if (count > cap) return false;
    }
  }
  return true;
}

/** CountNearBlocksTypes（cs:69621）：方框内指定 sheet 计数（含钳制） */
function countNearBlocksTypes(st: TileStore, i: number, j: number, radius: number, type: number): number {
  const x0 = Math.max(0, Math.min(st.w - 1, i - radius));
  const x1 = Math.max(0, Math.min(st.w - 1, i + radius));
  const y0 = Math.max(0, Math.min(st.h - 1, j - radius));
  const y1 = Math.max(0, Math.min(st.h - 1, j + radius));
  let n = 0;
  for (let k = x0; k <= x1; k++) {
    for (let l = y0; l <= y1; l++) {
      if (!activeAt(st, k, l)) continue;
      if (SHEET[st.type[st.idx(k, l)]] === type) n++;
    }
  }
  return n;
}

/** TooManyJungleVinesNearby（cs:73241）：±9×±5 内 62 计数 > 6 */
function tooManyJungleVines(st: TileStore, i: number, j: number, maxCount = 6): boolean {
  const x0 = Math.max(10, Math.min(st.w - 11, i - 9));
  const x1 = Math.max(10, Math.min(st.w - 11, i + 9));
  const y0 = Math.max(10, Math.min(st.h - 11, j - 5));
  const y1 = Math.max(10, Math.min(st.h - 11, j + 5));
  let n = 0;
  for (let k = x0; k <= x1; k++) {
    for (let l = y0; l <= y1; l++) {
      if (activeAt(st, k, l) && sheetAt(st, k, l) === 62) {
        n++;
        if (n > maxCount) return true;
      }
    }
  }
  return false;
}

/** 单格藤蔓写入（cs:20357：active+type+ClearSlope） */
const putVine = (st: TileStore, x: number, y: number, id: number): void => {
  const k = st.idx(x, y);
  st.type[k] = id;
  st.flags[k] = 1;
  st.slope[k] = 0;
};

/** Vines pass（cs:20338-20590）1:1：六类藤蔓逐列垂直生长 + 丛林蜂巢凹龛 444 */
export function runVinesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const g0 = globalThis as { __swVnCap?: (gs: GenState, st: TileStore) => void };
  try { g0.__swVnCap?.(gs, st); } catch { /* probe */ }
  const w = st.w, h = st.h;
  const grassWalls = new Set([68, 65, 66, 63]);
  for (let i = 5; i < w - 5; i++) {
    // ---- ① 普通藤 52 / 花藤 382（草面/树叶下，地表以上）（cs:20346-20387）----
    let pending = 0;
    let type = VINE;
    const surfLimit = gs.worldSurface;
    for (let j = 0; j < surfLimit; j++) {
      if (pending > 0 && !activeAt(st, i, j)) {
        putVine(st, i, j, type);
        pending--;
      } else {
        pending = 0;
      }
      const sj = sheetAt(st, i, j);
      if (activeAt(st, i, j) && !bottomSlope(st, i, j)
        && (sj === 2 || (sj === 192 && rng.int(0, 3) === 0))            // Next(4)
        && growMoreVines(st, i, j)) {
        type = VINE;
        const wallHere = st.inBounds(i, j) ? st.wall[st.idx(i, j)] : 0;
        const wallBelow = st.inBounds(i, j + 1) ? st.wall[st.idx(i, j + 1)] : 0;
        if (grassWalls.has(wallHere) || grassWalls.has(wallBelow)) type = VINE_FLOWER;
        if (rng.int(0, 4) < 3) pending = rng.int(1, 9);                 // Next(5)/Next(1,10)
      }
    }
    // ---- ② 丛林藤 62（丛林草/蜥蜴砖下，全高）（cs:20389-20511）----
    pending = 0;
    for (let k = 5; k < h - 5; k++) {
      if (pending > 0 && !activeAt(st, i, k)) {
        putVine(st, i, k, VINE_JUNGLE);
        pending--;
      } else {
        pending = 0;
      }
      const sk = sheetAt(st, i, k);
      if (activeAt(st, i, k) && (sk === 60 || sk === 226) && !bottomSlope(st, i, k)
        && growMoreVines(st, i, k)) {
        // 蜂巢凹龛（cs:20453-20501）：右侧也是丛林草时 1/40 放 2×2 蜂巢块
        if (i < w - 1 && k < h - 2 && activeAt(st, i + 1, k)
          && sheetAt(st, i + 1, k) === 60 && !bottomSlope(st, i + 1, k)
          && rng.int(0, 39) === 0) {                                    // Next(40)
          let ok = true;
          for (let a = i; a < i + 2 && ok; a++) {
            for (let b = k + 1; b < k + 3 && ok; b++) {
              if (!st.inBounds(a, b)) { ok = false; break; }
              const kb = st.idx(a, b);
              const sb = SHEET[st.type[kb]];
              if (st.flags[kb] && (!TILE_CUT.has(sb) || sb === 444)) ok = false;
              else if (st.liquid[kb] > 0 || WALL_HOUSE.has(st.wall[kb])) ok = false;
            }
          }
          if (ok && countNearBlocksTypes(st, i, k, 20, 444) > 0) ok = false;
          if (ok) {
            for (let a = i; a < i + 2; a++) {
              for (let b = k + 1; b < k + 3; b++) {
                killTile(st, a, b);
                st.setTileSilent(a, b, HIVE, (a - i) * 18, (b - k - 1) * 18);
              }
            }
            continue;
          }
        }
        let go = true;
        if (sk === 226 && tooManyJungleVines(st, i, k)) go = false;
        if (go && rng.int(0, 4) < 3) pending = rng.int(1, 9);
      }
    }
    // ---- ③ 蘑菇藤 528（蘑菇草 70 下，1/5 起藤）（cs:20514-20531）----
    pending = 0;
    for (let y = 0; y < h; y++) {
      if (pending > 0 && !activeAt(st, i, y)) {
        putVine(st, i, y, VINE_MUSHROOM);
        pending--;
      } else {
        pending = 0;
      }
      if (activeAt(st, i, y) && sheetAt(st, i, y) === 70
        && rng.int(0, 4) === 0 && !bottomSlope(st, i, y)                 // Next(5)
        && growMoreVines(st, i, y) && rng.int(0, 4) < 3) {
        pending = rng.int(1, 9);
      }
    }
    // ---- ④ 腐化藤 636（腐化草 23 下）（cs:20533-20550）----
    pending = 0;
    for (let y = 0; y < h; y++) {
      if (pending > 0 && !activeAt(st, i, y)) {
        putVine(st, i, y, VINE_CORRUPT);
        pending--;
      } else {
        pending = 0;
      }
      if (activeAt(st, i, y) && !bottomSlope(st, i, y) && sheetAt(st, i, y) === 23
        && growMoreVines(st, i, y) && rng.int(0, 4) < 3) {
        pending = rng.int(1, 9);
      }
    }
    // ---- ⑤ 猩红藤 205（猩红草 199 下）（cs:20552-20569）----
    pending = 0;
    for (let y = 0; y < h; y++) {
      if (pending > 0 && !activeAt(st, i, y)) {
        putVine(st, i, y, VINE_CRIMSON);
        pending--;
      } else {
        pending = 0;
      }
      if (activeAt(st, i, y) && !bottomSlope(st, i, y) && sheetAt(st, i, y) === 199
        && growMoreVines(st, i, y) && rng.int(0, 4) < 3) {
        pending = rng.int(1, 9);
      }
    }
    // ---- ⑥ 灰烬藤 638（灰烬草 633 下）（cs:20571-20588）----
    pending = 0;
    for (let y = 0; y < h; y++) {
      if (pending > 0 && !activeAt(st, i, y)) {
        putVine(st, i, y, VINE_ASH);
        pending--;
      } else {
        pending = 0;
      }
      if (activeAt(st, i, y) && !bottomSlope(st, i, y) && sheetAt(st, i, y) === 633
        && growMoreVines(st, i, y) && rng.int(0, 4) < 3) {
        pending = rng.int(1, 9);
      }
    }
  }
}

// ============================================================
// 5. Flowers（cs:20592）
// ============================================================

const FLOWER_LIST = [21, 24, 27, 30, 33, 36, 39, 42];                   // NextFromList 池（cs:20619/20683）
const GRASS = TILE_BY_KEY['grass']!;
const DIRT = TILE_BY_KEY['dirt']!;

/** Flowers pass（cs:20592-20742）1:1：地表花圃（非 remix 分支）。
 *  消费 GenVars.logX/logY（倒木锚点优先）——须在 FallenLogs 之后运行 */
export function runFlowersPass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  const spots = Math.floor(w * 0.004);
  for (let i = 0; i < spots; i++) {
    let cx = rng.int(100, w - 101);
    const rx = rng.int(15, 29);                                        // Next(15,30)
    const ry = rng.int(15, 29);
    // 列下扫：首个活性格（cs:20673-20682），命中后若 logX>=0 跳倒木锚
    for (let l = ry; l < gs.worldSurface - ry - 1; l++) {
      if (!activeAt(st, cx, l)) continue;
      if (gs.logX >= 0) {
        cx = gs.logX;
        l = gs.logY;
        gs.logX = -1;
      }
      const num7 = FLOWER_LIST[rng.int(0, 7)];                          // Next(8)
      for (let m = cx - rx; m < cx + rx; m++) {
        for (let n = l - ry; n < l + ry; n++) {
          if (!inWorld(st, m, n, 5)) continue;
          const t4 = st.idx(m, n);
          const t5 = st.idx(m, n + 1);
          const t6 = st.idx(m, n + 2);
          const s4 = SHEET[st.type[t4]];
          // 倒木/实心格跳过（cs:20693）
          if ((st.flags[t4] && s4 === 488) || (st.flags[t4] && TILE_DEFS[st.type[t4]]?.solid)) continue;
          if (st.flags[t4] && s4 === 3) {
            // 既有草丛重帧：2/3 升级为高草 73（cs:20695-20701）
            st.frameX[t4] = (num7 + rng.int(0, 2)) * 18;                // Next(3)
            if (rng.int(0, 2) !== 0) st.type[t4] = PLANT_TALL;
          } else {
            const s5 = SHEET[st.type[t5]];
            const oreLike = (k: number): boolean => {
              const s = SHEET[st.type[k]];
              return s === 40 || s === 1 || SET_ORE.has(s);
            };
            const allowOver = !st.flags[t4] || s4 === 185 || s4 === 186 || s4 === 187
              || (s4 === 5 && m < w * 0.48) || m > w * 0.52;
            if (st.wall[t5] === 0 && st.flags[t5]
              && (s5 === 2 || (oreLike(t5) && !st.flags[t4])) && allowOver) {
              if (oreLike(t5)) {
                st.type[t5] = GRASS;                                    // 基座矿石/石 → 草
                if (oreLike(t6)) st.type[t6] = GRASS;
              }
              killTileTree(st, m, n);   // 干基被杀 → CheckTree 级联整树坍塌（原版语义，见文件头）
              if (rng.int(0, 1) === 0) {                                // Next(2)
                st.slope[t5] = 0;
                st.half[t5] = 0;
              }
              // PlaceTile(m, n, 3)：液体拒绝（tile 3 在 cs:59492 黑名单）+
              // IsFitToPlaceFlowerIn（cs:58247：下方草族整砖）+ 墙门 + 帧三选一
              let placed = false;
              const kk = st.idx(m, n);
              if (st.liquid[kk] === 0
                && st.flags[t5] && st.slope[t5] === 0 && !st.half[t5]
                && (s5 === 2 || s5 === 78 || s5 === 380 || s5 === 477 || s5 === 579 || st.type[t5] === GRASS)
                && WALL_ALLOWS_PLANTS.has(st.wall[kk]) && WALL_ALLOWS_PLANTS.has(st.wall[t5])) {
                let fx: number;
                if (rng.int(0, 49) === 0) fx = 144;                     // 蘑菇 1/50
                else if (rng.int(0, 34) === 0 || (st.wall[kk] >= 63 && st.wall[kk] <= 70)) {
                  fx = [6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20][rng.int(0, 13)] * 18;
                } else fx = rng.int(0, 5) * 18;                         // 草丛 6 变体
                st.setTileSilent(m, n, PLANT_SHORT, fx, 0);
                placed = true;
              }
              if (placed && st.flags[kk] && SHEET[st.type[kk]] === 3) {
                st.frameX[kk] = (num7 + rng.int(0, 2)) * 18;            // 花圃重帧（cs:20720）
                if (rng.int(0, 2) !== 0) st.type[kk] = PLANT_TALL;      // 2/3 → 高草/花 73
              }
              if (oreLike(t6)) st.type[t6] = DIRT;                      // 第三层矿石 → 泥土
            }
          }
        }
      }
      break;                                                            // 每个锚点只做一圈
    }
  }
  // 坍塌树的登记表修剪：树冠格 (x,y) 失活 = 整树已消（花圃击杀链级联到顶）。
  // ★不能查基座格——花圃 PlaceTile(3) 恰在原干基位放花草（活性非树）会漏筛
  //（spawn-tree-regression 种子 x=976 实锤：登记树残留 → 运行期砍伐/树冠摆动误读）
  if (gs.genTrees.length) {
    gs.genTrees = gs.genTrees.filter((e) => activeAt(st, e.x, e.y));
  }
}

// ============================================================
// 6. Mushrooms（cs:20744）
// ============================================================

/** Mushrooms pass（cs:20744-20840）1:1：蘑菇斑帧重刷（不消耗内层 RNG） */
export function runMushroomsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  const spots = Math.floor(w * 0.002);
  for (let i = 0; i < spots; i++) {
    const cx = rng.int(20, w - 21);                                     // Next(20, w-20)
    const rx = rng.int(4, 9);                                           // Next(4,10)
    const ry = rng.int(15, 29);                                         // Next(15,30)
    for (let l = 1; l < gs.worldSurface - 1; l++) {
      if (!activeAt(st, cx, l)) continue;
      for (let m = cx - rx; m < cx + rx; m++) {
        for (let n = l - ry; n < l + ry; n++) {
          if (m < 10 || n < 0 || m > w - 10 || n > h - 10) break;       // 原版逐层 break（cs:20809-20824）
          const s = sheetAt(st, m, n);
          if (s === 3 || s === 24) st.frameX[st.idx(m, n)] = 144;       // 普通草/腐化草 → 蘑菇帧
          else if (s === 201) st.frameX[st.idx(m, n)] = 270;            // 猩红草 → 恶魔蘑菇帧
        }
      }
      break;
    }
  }
}

// ============================================================
// 7. LongMoss（cs:20915）
// ============================================================

/** TileFrame case 184（cs:85890-85953）1:1：按四向首个苔藓邻格定色/定向，
 *  frameY 不在带内才重掷（因此 PlaceTile 掷的 0/18/36 只有"下方附着"能存活原值） */
function tileFrame184(st: TileStore, rng: RNG, x: number, y: number): void {
  const side = (dx: number, dy: number): number => {
    if (!st.inBounds(x + dx, y + dy)) return -1;
    const k = st.idx(x + dx, y + dy);
    if (!st.flags[k]) return -1;
    // cs:85900-85907：上邻须 !bottomSlope，下邻须 !halfBrick && !topSlope；左右仅 active
    if (dy === -1 && bottomSlope(st, x, y - 1)) return -1;
    if (dy === 1 && (st.half[k] || topSlope(st, x, y + 1))) return -1;
    return SHEET[st.type[k]];
  };
  const below = side(0, 1), above = side(0, -1), leftS = side(-1, 0), rightS = side(1, 0);
  const k = st.idx(x, y);
  const apply = (src: number, bandLo: number, bandHi: number, bandBase: number): void => {
    const color = MOSS_COLOR[src] ?? -1;
    if (color < 0) return;
    st.frameX[k] = 22 * color;
    if (st.frameY[k] < bandLo || st.frameY[k] > bandHi) {
      st.frameY[k] = bandBase + rng.int(0, 2) * 18;                     // Next(3)
    }
  };
  if (below >= 0 && MOSS_COLOR[below] !== undefined) apply(below, 0, 36, 0);
  else if (above >= 0 && MOSS_COLOR[above] !== undefined) apply(above, 54, 90, 54);
  else if (leftS >= 0 && MOSS_COLOR[leftS] !== undefined) apply(leftS, 108, 144, 108);
  else if (rightS >= 0 && MOSS_COLOR[rightS] !== undefined) apply(rightS, 162, 198, 162);
  else killTile(st, x, y);                                              // 无苔藓邻格 → 移除
}

/** PlaceTile case 184（cs:59727-59744）+ SquareTileFrame 的本格重帧 */
function placeMossSprout(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const mossAdj = (dx: number, dy: number): boolean =>
    st.inBounds(x + dx, y + dy) && TILE_MOSS.has(sheetAt(st, x + dx, y + dy))
    && solidTile(st, x + dx, y + dy);
  const brickAdj = (dx: number, dy: number): boolean =>
    st.inBounds(x + dx, y + dy) && TILE_MOSS_BRICK.has(sheetAt(st, x + dx, y + dy))
    && solidTile(st, x + dx, y + dy);
  let placed = false;
  if (mossAdj(-1, 0) || mossAdj(1, 0) || mossAdj(0, -1) || mossAdj(0, 1)) {
    st.setTileSilent(x, y, MOSS_SPROUT, 0, rng.int(0, 2) * 18);         // frameX = style*18 = 0
    placed = true;
  }
  if (brickAdj(-1, 0) || brickAdj(1, 0) || brickAdj(0, -1) || brickAdj(0, 1)) {
    st.setTileSilent(x, y, MOSS_SPROUT, 0, rng.int(0, 2) * 18);
    placed = true;
  }
  if (placed) tileFrame184(st, rng, x, y);
}

/** LongMoss pass（cs:20915-20961）1:1：苔藓块四向冒芽 */
export function runLongMossPass(st: TileStore, rng: RNG, _gs: GenState): void {
  for (let i = 5; i < st.w - 5; i++) {
    for (let j = 5; j < st.h - 5; j++) {
      if (!activeAt(st, i, j)) continue;
      if (!TILE_MOSS.has(sheetAt(st, i, j))) continue;
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? i - 1 : k === 1 ? i + 1 : i;
        const ny = k === 2 ? j - 1 : k === 3 ? j + 1 : j;
        if (!activeAt(st, nx, ny)) placeMossSprout(st, rng, nx, ny);
      }
    }
  }
}

// ============================================================
// 8. LilypadsCattailsBambooAndSeaweed（cs:22131）
// ============================================================

/** GetWaterDepth（cs:58372）1:1 */
function getWaterDepth(st: TileStore, x: number, y: number): number {
  let n = y;
  while (!solidTile(st, x, n)) {
    n++;
    if (n > st.h - 1) return 0;
  }
  n--;
  let m = n;
  while (st.inBounds(x, m) && st.liquid[st.idx(x, m)] > 0 && !solidTile(st, x, m)) m--;
  return n - m;
}

/** CountGrowingPlantTiles（cs:58392）1:1：±range × ±3range 方框计数 */
function countGrowingPlantTiles(st: TileStore, x: number, y: number, range: number, sheet: number): number {
  let n = 0;
  for (let i = x - range; i <= x + range; i++) {
    for (let j = y - range * 3; j <= y + range * 3; j++) {
      if (activeAt(st, i, j) && sheetAt(st, i, j) === sheet) n++;
    }
  }
  return n;
}

/** CheckBamboo（cs:58466）1:1：竹节帧状态机（TileFrame case 571） */
function checkBamboo(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y + 1)) return;
  const k = st.idx(x, y);
  const upBamboo = activeAt(st, x, y - 1) && sheetAt(st, x, y - 1) === 571;
  const dnBamboo = activeAt(st, x, y + 1) && sheetAt(st, x, y + 1) === 571;
  const col = (st.frameX[k] / 18) | 0;
  st.frameY[k] = 0;
  if (upBamboo) {
    if (SHEET[st.type[k]] === 571) {
      if (col < 5 || col > 14) st.frameX[k] = rng.int(5, 14) * 18;      // 中段帧
    } else if (col < 1 || col > 4) {
      st.frameX[k] = rng.int(1, 4) * 18;                                // 顶段帧
    }
  } else if (dnBamboo) {
    if (col < 1 || col > 4) st.frameX[k] = rng.int(1, 4) * 18;          // 底段帧
  } else if (col !== 0) {
    st.frameX[k] = 0;                                                   // 独节
  }
}

/** PlaceBamboo（cs:58408）1:1（含 SquareTileFrame 的 571 邻格重帧） */
function placeBamboo(st: TileStore, rng: RNG, gs: GenState, x: number, y: number): boolean {
  void gs;
  const h = st.h;
  const growCap = rng.int(1, 20);                                       // Next(1,21)——恒消耗
  if (!st.inBounds(x, y)) return false;
  const k = st.idx(x, y);
  if (st.wall[k] > 0 && y <= gs.worldSurface) return false;
  if (st.flags[k] && SHEET[st.type[k]] === 314) return false;           // 已是竹笋顶？
  if (!st.inBounds(x, y + 1)) return false;
  const g = st.idx(x, y + 1);
  if (st.flags[g] && (SHEET[st.type[g]] === 571 || SHEET[st.type[g]] === 60)) {
    const depth = getWaterDepth(st, x, y);
    if (depth < 2 || depth > 5) return false;
    let cnt = countGrowingPlantTiles(st, x, y, 5, 571);
    let run = 1;
    if (SHEET[st.type[g]] === 571) {
      while (!solidTile(st, x, y + run) && y + run < h) run++;
      if (run + ((cnt / rng.int(1, 20)) | 0) > growCap) return false;   // C# int 除法
    } else {
      cnt += 25;                                                        // 丛林草基座加成
    }
    cnt += run * 2;
    if (cnt > rng.int(40, 60)) return false;                            // Next(40,61)
    st.setTileSilent(x, y, BAMBOO, 0, 0);
    st.half[k] = 0;
    st.slope[k] = 0;
    squareTileFrame(st, rng, x, y);
    return true;
  }
  return false;
}

/** SquareTileFrame（cs:80924）的子集实现：3×3 内只重帧本组放置的类型 */
function squareTileFrame(st: TileStore, rng: RNG, x: number, y: number): void {
  // 3×3 列优先（cs:80926-80934 的调用序）：x-1 列三行 → x 列三行 → x+1 列三行
  for (let d = 0; d < 9; d++) {
    const dx = ((d / 3) | 0) - 1, dy = (d % 3) - 1;
    const nx = x + dx, ny = y + dy;
    if (!st.inBounds(nx, ny)) continue;
    const kk = st.idx(nx, ny);
    const s = SHEET[st.type[kk]];
    if (!st.flags[kk]) continue;
    if (s === 571) checkBamboo(st, rng, nx, ny);
    else if (s === 519) checkCatTail(st, rng, nx, ny);
    else if (s === 549) checkUnderwaterPlant(st, rng, nx, ny);
    // 184 的重帧仅在放置时调用（LongMoss pass）；518 的 CheckLilyPad 恒 no-op 未移植
  }
}

/** PlaceLilyPad（cs:59109）1:1 */
function placeLilyPad(st: TileStore, rng: RNG, x: number, y: number): boolean {
  const w = st.w, h = st.h;
  let n = y;
  if (x < 50 || x > w - 50 || n < 50 || n > h - 50) return false;
  const k0 = st.idx(x, n);
  if (st.flags[k0] || st.liquid[k0] === 0 || st.liquidType[k0] !== 1) return false; // 液体须为水
  while (st.liquid[st.idx(x, n)] > 0 && n > 50) n--;
  n++;
  const ka = st.idx(x, n);
  if (st.flags[ka] || st.flags[st.idx(x, n - 1)] || st.liquid[ka] === 0 || st.liquidType[ka] !== 1) {
    return false;
  }
  const wall = st.wall[ka];
  if (wall !== 0 && wall !== 15 && wall !== 70 && (wall < 63 || wall > 68)) return false;
  // ±5 方框内睡莲 ≤3（cs:59133-59148）
  let cnt = 0;
  for (let i = x - 5; i <= x + 5; i++) {
    for (let j = n - 5; j <= n + 5; j++) {
      if (activeAt(st, i, j) && sheetAt(st, i, j) === 518) cnt++;
    }
  }
  if (cnt > 3) return false;
  // 水深 3..12，且下扫途中遇香蒲拒绝（cs:59149-59165）
  let l = n;
  for (; st.inBounds(x, l) && l < h - 50; l++) {
    const kl = st.idx(x, l);
    if (st.flags[kl] && TILE_DEFS[st.type[kl]]?.solid && !TILE_DEFS[st.type[kl]]?.platform) break;
    if (st.flags[kl] && SHEET[st.type[kl]] === 519) return false;
  }
  if (l - n > 12 || l - n < 3) return false;
  const ground = sheetAt(st, x, l);
  let fy = -1;
  if (ground === 2 || ground === 477) fy = 0;
  if (ground === 109 || ground === 492 || ground === 116) fy = 18;
  if (ground === 60) fy = 36;
  if (fy < 0) return false;
  let fx: number;
  if (rng.int(0, 1) === 0) fx = 18 * rng.int(0, 2);                     // Next(3)
  else if (rng.int(0, 14) === 0) fx = 18 * rng.int(0, 17);              // Next(15)/Next(18)
  else {
    const band = (w / 5) | 0;
    if (x < band) fx = 18 * rng.int(6, 8);
    else if (x < band * 2) fx = 18 * rng.int(9, 11);
    else if (x < band * 3) fx = 18 * rng.int(3, 5);
    else if (x < band * 4) fx = 18 * rng.int(15, 17);
    else fx = 18 * rng.int(12, 14);
  }
  st.setTileSilent(x, n, LILY_PAD, fx, fy);
  st.half[ka] = 0;
  st.slope[ka] = 0;
  return true;
}

/** CheckCatTail（cs:58764）1:1：香蒲存活校验/重帧（生成期强制浅水/深水判定） */
function checkCatTail(st: TileStore, rng: RNG, x: number, j: number): void {
  const h = st.h;
  if (!st.inBounds(x, j)) return;
  let num = j;
  let flag = false;
  // 下扫实心底（cs:58773-58788）
  let num2 = num;
  for (; st.inBounds(x, num2) && num2 < h - 50; num2++) {
    const k = st.idx(x, num2);
    if (st.flags[k] && TILE_DEFS[st.type[k]]?.solid && !TILE_DEFS[st.type[k]]?.platform) break;
    if (st.flags[k] && SHEET[st.type[k]] !== 519) flag = true;
    if (!st.flags[k]) break;
  }
  num = num2 - 1;
  if (!st.inBounds(x, num)) return;
  // 上扫水面（cs:58794-58806）
  for (; st.inBounds(x, num) && st.liquid[st.idx(x, num)] > 0 && num > 50; num--) {
    const k = st.idx(x, num);
    if ((st.flags[k] && SHEET[st.type[k]] !== 519) || st.liquidType[k] !== 1) flag = true;
  }
  num++;
  if (!st.inBounds(x, num)) return;
  const num3 = num;
  if (num2 - num3 > 8) flag = true;                                    // catTailDistance = 8（cs:4347）
  const groundSheet = sheetAt(st, x, num2);
  let style = -1;
  if (groundSheet === 2 || groundSheet === 477) style = 0;
  else if (groundSheet === 53) style = 18;
  else if (groundSheet === 199 || groundSheet === 234 || groundSheet === 662) style = 54;
  else if (groundSheet === 23 || groundSheet === 112 || groundSheet === 661) style = 72;
  else if (groundSheet === 70) style = 90;
  if (!st.flags[st.idx(x, num2)]) flag = true;                          // nactive（cs:58842）
  if (style < 0) flag = true;
  num = num2 - 1;
  const kNum = st.idx(x, num);
  if (st.flags[kNum] === 0) {
    // 找回本株最上格（cs:58851-58865）
    for (let n = num; n >= num3; n--) {
      if (!st.inBounds(x, n)) return;
      if (st.flags[st.idx(x, n)] && SHEET[st.type[st.idx(x, n)]] === 519) { num = n; break; }
    }
  }
  while (st.inBounds(x, num) && st.flags[st.idx(x, num)] && SHEET[st.type[st.idx(x, num)]] === 519) num--;
  num++;
  const kTop = st.idx(x, num);
  const kAboveFloor = st.idx(x, num2 - 1);
  if (st.liquid[kAboveFloor] < 127) flag = true;                        // 浅水上的香蒲（生成期恒判死）
  if (st.frameX[kTop] >= 180 && st.liquid[kTop] > 127) flag = true;
  if (st.frameX[kTop] > 18 && st.liquid[kAboveFloor] !== 0) {
    if (st.frameX[kAboveFloor] < 36 || st.frameX[kAboveFloor] > 72) flag = true;
    else if (st.frameX[kTop] < 90) flag = true;
    else if (st.frameX[kTop] >= 108 && st.frameX[kTop] <= 162) st.frameX[kTop] = 90;
  }
  if (num2 > num + 4 && st.inBounds(x, num + 4) && st.inBounds(x, num + 3)
    && st.liquid[st.idx(x, num + 4)] === 0 && SHEET[st.type[st.idx(x, num + 3)]] === 519) {
    flag = true;
  }
  if (flag) {
    // 整株移除（cs:58900-58917）
    let from = num3;
    if (num < num3) from = num;
    from -= 4;
    for (let i = from; i <= num2; i++) {
      if (st.inBounds(x, i) && st.flags[st.idx(x, i)] && SHEET[st.type[st.idx(x, i)]] === 519) {
        killTile(st, x, i);
      }
    }
  } else if (style !== st.frameY[st.idx(x, num)]) {
    for (let k = num; k < num2; k++) {
      const kk = st.idx(x, k);
      if (st.flags[kk] && SHEET[st.type[kk]] === 519) st.frameY[kk] = style;
    }
  }
  void rng;
}

/** PlaceCatTail（cs:58648）1:1：返回锚点（-1,-1 = 失败） */
function placeCatTail(st: TileStore, rng: RNG, gs: GenState, x: number, j: number): [number, number] {
  const w = st.w, h = st.h;
  let n = j;
  if (x < 50 || x > w - 50 || n < 50 || n > h - 50) return [-1, -1];
  const k0 = st.idx(x, n);
  if ((st.flags[k0] && SHEET[st.type[k0]] !== 71) || st.liquid[k0] === 0 || st.liquidType[k0] !== 1) {
    return [-1, -1];
  }
  while (st.liquid[st.idx(x, n)] > 0 && n > 50) n--;
  n++;
  const ka = st.idx(x, n);
  if (st.flags[ka] || st.flags[st.idx(x, n - 1)] || st.liquid[ka] === 0 || st.liquidType[ka] !== 1) {
    return [-1, -1];
  }
  const wall = st.wall[ka];
  if (wall !== 0 && wall !== 80 && wall !== 81 && wall !== 69 && (wall < 63 || wall > 68)) {
    return [-1, -1];
  }
  // ±7 方框内香蒲列 ≤3（cs:58673-58689，内层命中即 break=按列计）
  let cols = 0;
  for (let i = x - 7; i <= x + 7; i++) {
    for (let k = n - 7; k <= n + 7; k++) {
      if (activeAt(st, i, k) && sheetAt(st, i, k) === 519) { cols++; break; }
    }
  }
  if (cols > 3) return [-1, -1];
  // 下扫实心底（cs:58690-58697），途中遇非蘑菇植物拒绝
  let l = n;
  for (; st.inBounds(x, l) && l < h - 50; l++) {
    const kl = st.idx(x, l);
    if (st.flags[kl] && TILE_DEFS[st.type[kl]]?.solid && !TILE_DEFS[st.type[kl]]?.platform) break;
    if (st.flags[kl] && SHEET[st.type[kl]] !== 71) return [-1, -1];
  }
  if (l - n > 7) return [-1, -1];                                       // catTailDistance - 1
  if (l - n < 2) return [-1, -1];
  const ground = sheetAt(st, x, l);
  const gl = st.idx(x, l);
  if (!st.flags[gl]) return [-1, -1];                                   // nactive（cs:58708）
  let style = -1;
  if (ground === 2 || ground === 477) style = 0;
  else if (ground === 53) {
    if (x < gs.beachDistance || x > w - gs.beachDistance) return [-1, -1];
    style = 18;
  } else if (ground === 199 || ground === 234 || ground === 662) style = 54;
  else if (ground === 23 || ground === 112 || ground === 661) style = 72;
  else if (ground === 70) style = 90;
  if (style < 0) return [-1, -1];
  if (topSlope(st, x, l) && rng.int(0, 2) !== 0) st.slope[gl] = 0;      // Next(3)：2/3 削平顶坡
  else if (topSlope(st, x, l) || st.half[gl]) return [-1, -1];
  n = l - 1;
  st.setTileSilent(x, n, CATTAIL, 0, style);
  st.half[st.idx(x, n)] = 0;
  st.slope[st.idx(x, n)] = 0;
  squareTileFrame(st, rng, x, n);
  return [x, n];
}

/** GrowCatTail（cs:58996）1:1：香蒲向上生长/结穗 */
function growCatTail(st: TileStore, rng: RNG, x: number, j: number): void {
  const h = st.h;
  let n = j;
  while (st.inBounds(x, n) && st.liquid[st.idx(x, n)] > 0 && n > 50) n--;
  n++;
  let i = n;
  for (; st.inBounds(x, i) && i < h - 50; i++) {
    const k = st.idx(x, i);
    if (st.flags[k] && TILE_DEFS[st.type[k]]?.solid && !TILE_DEFS[st.type[k]]?.platform) break;
  }
  n = i - 1;
  while (st.inBounds(x, n) && st.flags[st.idx(x, n)] && SHEET[st.type[st.idx(x, n)]] === 519) n--;
  n++;
  const kn = st.idx(x, n);
  if (!st.flags[kn] || SHEET[st.type[kn]] !== 519) return;
  const above = st.idx(x, n - 1);
  if (st.frameX[kn] === 90 && st.flags[above] && TILE_CUT.has(SHEET[st.type[above]])) {
    killTile(st, x, n - 1);
  }
  if (st.flags[above]) return;
  const sprout = (fx: number): void => {
    st.setTileSilent(x, n - 1, CATTAIL, fx, st.frameY[kn]);
    st.half[above] = 0;
    st.slope[above] = 0;
  };
  if (st.frameX[kn] === 0) {
    st.frameX[kn] = 18;
  } else if (st.frameX[kn] === 18) {
    st.frameX[kn] = 18 * rng.int(2, 4);                                 // Next(2,5)
    sprout(90);
  } else if (st.frameX[kn] === 90) {
    if (st.liquid[above] === 0) {
      const above2 = st.idx(x, n - 2);
      const wet = st.liquid[kn] > 0 || st.liquid[st.idx(x, n + 1)] > 0 || st.liquid[st.idx(x, n + 2)] > 0;
      if (!st.flags[above2] && wet && rng.int(0, 2) === 0) {            // Next(3)
        st.frameX[kn] = 108;
        sprout(90);
      } else {
        const v = rng.int(0, 2);                                        // Next(3)
        st.frameX[kn] = 126 + v * 18;
        sprout(180 + v * 18);
      }
    } else {
      st.frameX[kn] = 108;
      sprout(90);
    }
  }
  squareTileFrame(st, rng, x, n - 1);
}

/** CanUnderwaterPlantGrowHere（cs:58560）1:1 */
function canUnderwaterPlantGrow(st: TileStore, x: number, y: number, sheet: number, ignoreSelf: boolean): boolean {
  if (!inWorld(st, x, y, 50)) return false;
  const k = st.idx(x, y);
  if (!ignoreSelf && st.flags[k]) return false;
  for (let i = 0; i < 3; i++) {                                         // 上方 3 格须满水
    if (!st.inBounds(x, y - i)) return false;
    const kk = st.idx(x, y - i);
    if (st.liquid[kk] === 0 || st.liquidType[kk] !== 1) return false;
  }
  if (!st.inBounds(x, y + 1)) return false;
  const g = st.idx(x, y + 1);
  if (!st.flags[g] || st.half[g] || st.slope[g] !== 0) return false;    // nactive
  const gs = SHEET[st.type[g]];
  const sandOk = CONV_SAND.has(gs) && solidAllowBottomSlope(st, x, y + 1);
  if (!sandOk && gs !== sheet) return false;
  const wall = st.wall[k];
  if (wall !== 0 && (wall - 63 < 0 || wall - 63 > 6) && (wall - 80 < 0 || wall - 80 > 1)) return false;
  return true;
}

/** CheckUnderwaterPlant（cs:58597）1:1：海藻邻接帧重排 */
function checkUnderwaterPlant(st: TileStore, rng: RNG, x: number, y: number): void {
  const sheet = 549;
  if (!canUnderwaterPlantGrow(st, x, y, sheet, true)) {
    killTile(st, x, y);
    return;
  }
  const k = st.idx(x, y);
  const up = st.idx(x, y - 1), dn = st.idx(x, y + 1);
  const upIs = st.flags[up] && SHEET[st.type[up]] === sheet;
  const dnIs = st.flags[dn] && SHEET[st.type[dn]] === sheet;
  const col = (st.frameX[k] / 18) | 0;
  st.frameY[k] = 0;
  if (upIs) {
    if (col < 1 || col > 7) st.frameX[k] = rng.int(1, 7) * 18;          // Next(1,8)
  } else if (dnIs) {
    if (col < 7 || col > 12) st.frameX[k] = rng.int(7, 12) * 18;        // Next(7,13)
  } else if (col !== 0) {
    st.frameX[k] = 0;
  }
}

/** GrowCheckSeaweed（cs:58939）1:1 */
function growCheckSeaweed(st: TileStore, rng: RNG, x: number, y: number): void {
  const h = st.h;
  const k = st.idx(x, y);
  const ka = st.idx(x, y - 1);
  if ((SHEET[st.type[k]] === 549 && st.flags[k] && st.liquid[k] < 200) || st.liquid[ka] < 200) {
    if (st.flags[k] && SHEET[st.type[k]] === 549 && rng.int(0, 1) === 0) killTile(st, x, y); // Next(2)
    return;
  }
  // 深水生长门（cs:58959）：Next(1) 恒为 0（保留消耗）
  if (st.flags[st.idx(x, y - 1)] || st.flags[st.idx(x, y - 2)]
    || rng.int(0, 0) !== 0
    || !st.inBounds(x, y - 2) || !st.inBounds(x, y - 3)
    || st.liquid[st.idx(x, y - 2)] !== 255 || st.liquid[st.idx(x, y - 3)] !== 255) {
    return;
  }
  // ±4 × (y..y+12) 内海藻 ≤30
  let cnt = 0;
  for (let i = x - 4; i <= x + 4; i++) {
    for (let j = y; j <= y + 12; j++) {
      if (activeAt(st, i, j) && sheetAt(st, i, j) === 549) {
        cnt++;
        if (cnt > 30) return;
      }
    }
  }
  let k2 = y;
  for (; !solidTile(st, x, k2) && k2 < h - 50; k2++) {
    // 下扫实心底
  }
  if (k2 - y < 17 - rng.int(0, 19)) {                                  // Next(20)
    // PlaceTile(x, y-1, 549) → PlaceUnderwaterPlant（cs:58540）
    if (canUnderwaterPlantGrow(st, x, y - 1, 549, false)) {
      st.setTileSilent(x, y - 1, SEAWEED, 0, 0);
      const kk = st.idx(x, y - 1);
      st.half[kk] = 0;
      st.slope[kk] = 0;
      squareTileFrame(st, rng, x, y - 1);
    }
  }
}

/** LilypadsCattailsBambooAndSeaweed pass（cs:22131-22194）1:1 */
export function runLilypadsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  const surfLimit = gs.worldSurface;
  for (let i = 20; i < w - 20; i++) {
    for (let j = 1; j < surfLimit; j++) {
      if (rng.int(0, 4) !== 0) continue;                                // Next(5) 恒掷
      const k = st.idx(i, j);
      if (st.liquid[k] === 0) continue;
      if (!st.flags[k]) {
        if (rng.int(0, 1) === 0) {                                      // Next(2)
          placeLilyPad(st, rng, i, j);
        } else {
          const [px, py] = placeCatTail(st, rng, gs, i, j);
          if (inWorld(st, px, py)) {
            const grows = rng.int(0, 13);                               // Next(14)
            for (let n = 0; n < grows; n++) growCatTail(st, rng, px, py);
          }
        }
      }
      const s = SHEET[st.type[k]];
      if ((!st.flags[k] || s === 61 || s === 74) && placeBamboo(st, rng, gs, i, j)) {
        const up = rng.int(10, 19);                                     // Next(10,20)
        for (let l = 0; l < up && placeBamboo(st, rng, gs, i, j - l); l++) {
          // 逐节向上长（cs:22170-22173）
        }
      }
    }
    // 海藻：自地狱层上扫至地表之上（cs:22177-22192）
    let y = h - 200;                                                    // UnderworldLayer
    while (y > gs.worldSurface) {
      if (activeAt(st, i, y)) {
        const s = sheetAt(st, i, y);
        if (s === 53 && rng.int(0, 2) !== 0) growCheckSeaweed(st, rng, i, y); // Next(3)
        else if (s === 549) growCheckSeaweed(st, rng, i, y);
      }
      y--;
    }
  }
}

// ============================================================
// 8. GrassPlants（cs:20209-20265）+ GlowingMushroomPlants（cs:20267-20308）
// ============================================================

const CORRUPT_THORNS = TILE_BY_KEY['v_32_corruption_thorns']!;
const CRIMSON_THORNS = TILE_BY_KEY['v_352_crimtane_thorns']!;
const JUNGLE_SHORT = TILE_BY_KEY['v_61_jungle_short_plants']!;
const JUNGLE_SPORES = TILE_BY_KEY['v_69_jungle_thorns']!;
const ASH_SHORT = TILE_BY_KEY['v_637_ash_short_plants']!;
const GLOW_SHROOM = TILE_BY_KEY['v_71_mushroom_plant']!;
/** PlaceTile(3) 蘑菇草基座帧表（cs:59546：21/24/27/30/33/36/39/42 抽中再 +Next(3)） */
const MUSHROOM_FX_LIST = [6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24, 27, 30, 33, 36, 39, 42];
/** 帧表（花窗）——num==3/24 共用（cs:59571） */
const FLOWER_FX_LIST = [6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
/** num==201 的花窗帧表（cs:59574） */
const FLOWER_FX_LIST_201 = [6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22];
/** num==637 的花窗帧表（cs:59578） */
const FLOWER_FX_LIST_637 = [6, 7, 8, 9, 10];

/** IsFitToPlaceFlowerIn 的下方草族表（cs:58247）：num → 允许的下方 sheet 集 */
const PLANT_FIT: Record<number, Set<number>> = {
  3: new Set([2, 78, 380, 477, 579]),
  24: new Set([23, 661]),
  201: new Set([199, 662]),
  637: new Set([633]),
};
const CORRUPT_PLANTS = TILE_BY_KEY['v_24_corruption_short_plants']!;
const CRIMSON_PLANTS = TILE_BY_KEY['v_201_crimson_short_plants']!;
const plantTileOf = (num: number): number =>
  num === 24 ? CORRUPT_PLANTS : num === 201 ? CRIMSON_PLANTS : num === 637 ? ASH_SHORT : PLANT_SHORT;

/** PlaceTile 的 num∈{3,24,201,637} 分支（cs:59533-59654）1:1。
 *  门禁：液体拒绝（cs:59492）+ IsFitToPlaceFlowerIn（cs:58247：下方草族整砖）；
 *  帧：1/13 荆棘化（24→32 / 201→352）→ 蘑菇草基座特殊帧表 → 墙门内
 *  1/50 蘑菇帧(144/270) / 花窗 / Next(6) 草丛。返回是否放置。 */
export function placePlantTile(st: TileStore, rng: RNG, x: number, y: number, num: number): boolean {
  const i = st.idx(x, y);
  if (st.liquid[i] > 0) return false;
  const bi = st.idx(x, y + 1);
  if (!st.flags[bi] || st.slope[bi] !== 0 || st.half[bi]) return false;
  const below = SHEET[st.type[bi]];
  const fit = PLANT_FIT[num];
  if (!fit || !fit.has(below)) return false;
  if (num === 24 && rng.int(0, 12) === 0) {                               // Next(13) → 荆棘 32
    st.setTileSilent(x, y, CORRUPT_THORNS, 0, 0);                         // SquareTileFrame
    return true;
  }
  if (num === 201 && rng.int(0, 12) === 0) {                              // Next(13) → 352
    st.setTileSilent(x, y, CRIMSON_THORNS, 0, 0);
    return true;
  }
  if (below === 78 || below === 380 || below === 579) {                   // 蘑菇草基座（cs:59546）
    let fx = MUSHROOM_FX_LIST[rng.int(0, MUSHROOM_FX_LIST.length - 1)];
    if (fx >= 21 && fx % 3 === 0) fx += rng.int(0, 2);                    // 21/24/27/…/42 抽中再 +Next(3)
    st.setTileSilent(x, y, plantTileOf(num), fx * 18, 0);
    return true;
  }
  if (WALL_ALLOWS_PLANTS.has(st.wall[i]) && WALL_ALLOWS_PLANTS.has(st.wall[bi])) {
    let fx: number;
    if (rng.int(0, 49) === 0 || ((num === 24 || num === 201) && rng.int(0, 39) === 0)) {
      fx = num === 201 ? 270 : 144;                                       // 蘑菇/恶魔蘑菇帧
    } else if (rng.int(0, 34) === 0 || (st.wall[i] >= 63 && st.wall[i] <= 70)) {
      const list = num === 201 ? FLOWER_FX_LIST_201 : num === 637 ? FLOWER_FX_LIST_637 : FLOWER_FX_LIST;
      fx = list[rng.int(0, list.length - 1)];
    } else {
      fx = rng.int(0, 5);                                                 // Next(6) 草丛
    }
    st.setTileSilent(x, y, plantTileOf(num), fx * 18, 0);
    return true;
  }
  return false;                                                           // 墙不允许植物生长 → 不放
}

/** TooManyJunglePlantsNearby（cs:73216）：19×11 盒内 61/74 > 2 即过密 */
function tooManyJunglePlants(st: TileStore, i: number, j: number): boolean {
  const x0 = Math.max(10, Math.min(i - 9, st.w - 11));
  const x1 = Math.max(10, Math.min(i + 9, st.w - 11));
  const y0 = Math.max(10, Math.min(j - 5, st.h - 11));
  const y1 = Math.max(10, Math.min(j + 5, st.h - 11));
  let count = 0;
  for (let k = x0; k <= x1; k++) {
    for (let l = y0; l <= y1; l++) {
      if (activeAt(st, k, l) && (SHEET[st.type[st.idx(k, l)]] === 61 || SHEET[st.type[st.idx(k, l)]] === 74)) {
        count++;
        if (count > 2) return true;
      }
    }
  }
  return false;
}

/** PlaceTile(61) 分支（cs:59603-59652）1:1：下方 60/226 整砖门 + 五段帧链 */
function placeJunglePlant(st: TileStore, rng: RNG, gs: GenState, x: number, y: number): void {
  const bi = st.idx(x, y + 1);
  if (y + 1 >= st.h || !st.flags[bi] || st.slope[bi] !== 0 || st.half[bi]) return;
  const below = SHEET[st.type[bi]];
  if (below !== 60 && below !== 226) return;
  const temple = below === 226;
  const deep = y > gs.rockLevel;                                          // remix 恒 false
  const deepOk = temple ? false : deep;
  if (rng.int(0, 15) === 0 && y > gs.worldSurface && !temple) {           // Next(16) → 孢子 69
    st.setTileSilent(x, y, JUNGLE_SPORES, 0, 0);
    return;
  }
  let fx: number;
  if (rng.int(0, 59) === 0 && deepOk) fx = 144;                           // Next(60)
  else if (rng.int(0, 229) === 0 && deepOk) fx = 162;                     // Next(230)
  else if (rng.int(0, 14) === 0 && !temple) {                             // Next(15)
    fx = rng.int(0, 2) !== 0                                              // Next(3)
      ? rng.int(0, 1) * 18 + 108
      : rng.int(0, 12) * 18 + 180;                                        // Next(13)
  } else {
    fx = rng.int(0, 5);                                                   // Next(6)
  }
  st.setTileSilent(x, y, JUNGLE_SHORT, fx, 0);
}

/** GrassPlantsEvilPlantsAndPumpkinsOnSurface pass（cs:20232-20263）：
 *  草族（2/23/199/633）→ 上方空格 PlaceTile(3/24/201/637)。原版不处理丛林草 60
 *  （60 的植物在 GlowingMushroomPlants pass 的 61 分支），也没有 pass 级荆棘掷骰——
 *  荆棘 32/352 是 PlaceTile(24/201) 内部的 1/13 转化。 */
export function runGrassPlantsPass(st: TileStore, rng: RNG): void {
  for (let x = 0; x < st.w; x++) {
    for (let y = 1; y < st.h; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const s = SHEET[st.type[i]];
      if (s === 2) {
        if (!st.flags[st.idx(x, y - 1)]) placePlantTile(st, rng, x, y - 1, 3);
      } else if (s === 23) {
        if (!st.flags[st.idx(x, y - 1)]) placePlantTile(st, rng, x, y - 1, 24);
      } else if (s === 199) {
        if (!st.flags[st.idx(x, y - 1)]) placePlantTile(st, rng, x, y - 1, 201);
      } else if (s === 633 && !st.flags[st.idx(x, y - 1)]) {
        placePlantTile(st, rng, x, y - 1, 637);
      }
    }
  }
}

/** GlowingMushroomPlantsUndergroundAndJunglePlants pass（cs:20278-20303）1:1。
 *  蘑菇草 70（地下）：先 3 次 TryGrowingTreeByType(5) 巨型蘑菇树，全败才 PlaceTile(71)
 *  （巨型蘑菇树未移植——见 C 组备案，此处尝试恒败零掷骰）；丛林草 60 → 61；
 *  蜥蜴砖 226 → 1/5 且非过密 → 61。 */
export function runGlowingMushroomPlantsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const ws = Math.floor(gs.worldSurface);
  for (let i = 5; i < st.w - 5; i++) {
    for (let j = 5; j < st.h - 5; j++) {
      const i0 = st.idx(i, j);
      if (!st.flags[i0]) continue;
      const s = SHEET[st.type[i0]];
      if (j >= ws && s === 70 && !st.flags[st.idx(i, j - 1)]) {
        // TryGrowingTreeByType(5)×3（cs:20280-20286）——巨型蘑菇树（GrowTreeWithSettings
        // Tree_Mushroom）未移植，恒败不消耗 RNG；备案见报告
        if (!st.flags[st.idx(i, j - 1)]) {
          st.setTileSilent(i, j - 1, GLOW_SHROOM, rng.int(0, 4) * 18, 0); // PlaceTile(71)：Next(5) 帧
        }
      }
      if (!st.flags[st.idx(i, j - 1)]) {
        if (s === 60) {
          placeJunglePlant(st, rng, gs, i, j - 1);
        } else if (s === 226 && rng.int(0, 4) === 0 && !tooManyJunglePlants(st, i, j - 1)) {
          placeJunglePlant(st, rng, gs, i, j - 1);
        }
      }
    }
  }
}

// ===================== SunflowersPart2（cs:20043-20084）1:1 =====================
// 普通种子向日葵的唯一生成来源（SpreadingGrass pass 18349-18460 的"Sunflowers"
// 段实为 remix 专属 18460-18559，普通世界零向日葵；2026-08-13 前整 pass 缺失 =
// 生成世界草地上永不长向日葵）。注册序：GrassWalls(19734) → SpawnStarterNPCs
// （19830，十周年专属→普通种子 no-op）→ 本 pass(20043) → Trees(20085)。

const SUNFLOWER_T = TILE_BY_KEY['v_27_sunflower']!;

/** WorldGen.PlaceSunflower（cs:53650-53686）1:1：2 列×4 行向日葵块。
 *  净空 = 2×4 区域非活跃且无墙；地面 = 下方两格 nactive 整砖且 ∈ {2, 109}。
 *  帧模式：上两行（l<=-2）共用一次 Next(3) 款式；下两行每格独立 Next(3)。
 *  frameY = (l+3)*18（0..54）。inheritPaint 不适用（生成期地面无漆，恒 no-op）。
 *  OOB ≙ 原版 null Tile（不活跃、无墙，净空通过）；写入时 OOB 跳过。 */
function placeSunflower(st: TileStore, rng: RNG, gs: GenState, x: number, y: number): void {
  if (y > gs.worldSurface - 1) return;   // （remix 恒假，不入判定）
  const air = (cx: number, cy: number): boolean => {
    if (!st.inBounds(cx, cy)) return true;
    const i = st.idx(cx, cy);
    return !st.flags[i] && st.wall[i] === 0;
  };
  let flag = true;
  for (let i = x; i < x + 2; i++) {
    for (let j = y - 3; j < y + 1; j++) {
      if (!air(i, j)) flag = false;
    }
    if (!st.inBounds(i, y + 1)) { flag = false; continue; }
    const gi = st.idx(i, y + 1);
    if (!st.flags[gi] || st.half[gi] || st.slope[gi] !== 0
      || (SHEET[st.type[gi]] !== 2 && SHEET[st.type[gi]] !== 109)) flag = false;
  }
  if (!flag) return;
  const styleTop = rng.int(0, 2);        // Next(3)——上两行共用
  for (let k = 0; k < 2; k++) {
    for (let l = -3; l < 1; l++) {
      const fx = k * 18 + (l <= -2 ? styleTop : rng.int(0, 2)) * 36;
      if (st.inBounds(x + k, y + l)) {
        st.setTileSilent(x + k, y + l, SUNFLOWER_T, fx, (l + 3) * 18);
      }
    }
  }
}

/** SunflowersPart2 主体：w*0.002 次带状扫描。每次：中心列 Next(w)，带宽
 *  [c-Next(10)-7, c+Next(10)+7] 钳界；列内自上而下扫到首格活跃止，草 2 上方
 *  空气 → PlaceTile(27)（→ case 27 → PlaceSunflower + SquareTileFrame；
 *  SquareTileFrame 对完整写入的 2×4 块为恒 no-op，未移植）。 */
export function runSunflowersPart2Pass(st: TileStore, rng: RNG, gs: GenState): void {
  const count = Math.floor(st.w * 0.002);
  const ws = Math.floor(gs.worldSurface);
  for (let i = 0; i < count; i++) {
    const c = rng.nextInt(st.w);                       // Next(w)
    const lo = Math.max(0, c - rng.nextInt(10) - 7);   // Next(10)
    const hi = Math.min(st.w - 1, c + rng.nextInt(10) + 7);
    for (let j = lo; j <= hi; j++) {
      for (let k = 1; k < ws - 1; k++) {
        const ji = st.idx(j, k);
        if (st.flags[ji] && SHEET[st.type[ji]] === 2 && !st.flags[st.idx(j, k - 1)]) {
          placeSunflower(st, rng, gs, j, k - 1);
        }
        if (st.flags[ji]) break;                       // 列内首格活跃即止
      }
    }
  }
}

// ===================== JunglePlantsPart2（cs:20310-20337）1:1 =====================
// 地表丛林大株植物 233（PlaceJunglePlant 的 233 两分支）。注册序：
// GlowingMushroomPlants…JunglePlants(20267，我方"地表植物"槽) → 本 pass(20310)
// → Vines(20338)。2026-08-13 前整段缺失 = 丛林地表无大株植物。

const JUNGLE_LARGE = TILE_BY_KEY['v_233_jungle_large_plants']!;

/** PlaceJunglePlant（cs:47785-47960）对 type 233 的 1:1。styleY==0 走 3×2 分支
 *  （cs:47872-47928，frameX=54*styleX+{0,18,36}），styleY>0 走 2×2 分支
 *  （cs:47790-47840，frameX=36*styleX+{0,18}、frameY=36 起）。
 *  容忍活跃格白名单（两分支同表）：{61,703,62,69,655,74} ∪ {185 且 frameY==0}；
 *  净空通过先 KillTile 白名单格再写块。地面 = 放置列正下方 nactive 整砖且
 *  type==60。inheritPaint 恒 no-op（生成期无漆）。返回是否成块（主循环
 *  失败回退用）。 */
function placeJunglePlant233(
  st: TileStore, x: number, y: number, styleX: number, styleY: number,
): boolean {
  const dxLo = -1, dxHi = styleY > 0 ? 0 : 1;   // 2×2 分支 x-1..x；3×2 分支 x-1..x+1
  const inB = (cx: number, cy: number) => st.inBounds(cx, cy);
  let ok = true;
  for (let dx = dxLo; dx <= dxHi; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      if (!inB(x + dx, y + dy)) { ok = false; continue; }
      const ni = st.idx(x + dx, y + dy);
      if (st.flags[ni]) {
        const s = SHEET[st.type[ni]];
        const tolerated = s === 61 || s === 703 || s === 62 || s === 69 || s === 655 || s === 74
          || (s === 185 && st.frameY[ni] === 0);
        if (!tolerated) ok = false;
      }
    }
    const gx = x + dx;
    if (!inB(gx, y + 1) || !solidTile(st, gx, y + 1) || SHEET[st.type[st.idx(gx, y + 1)]] !== 60) {
      ok = false;
    }
  }
  if (!ok) return false;
  for (let dx = dxLo; dx <= dxHi; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      if (inB(x + dx, y + dy) && st.flags[st.idx(x + dx, y + dy)]) {
        st.setTileSilent(x + dx, y + dy, 0, 0, 0);   // KillTile（active=false+type=0）
      }
    }
  }
  if (styleY > 0) {
    const fx0 = 36 * styleX;
    for (let dx = -1; dx <= 0; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        if (!inB(x + dx, y + dy)) continue;
        st.setTileSilent(x + dx, y + dy, JUNGLE_LARGE, fx0 + (dx + 1) * 18, 36 + (dy + 1) * 18);
      }
    }
  } else {
    const fx0 = 54 * styleX;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        if (!inB(x + dx, y + dy)) continue;
        st.setTileSilent(x + dx, y + dy, JUNGLE_LARGE, fx0 + (dx + 1) * 18, (dy + 1) * 18);
      }
    }
  }
  return true;
}

/** JunglePlantsPart2 主体：w*100 次尝试。每次列 = Next(40, w/2-40)，地牢在左
 *  （dungeonSide<=-1 ≙ DungeonSide.Left=-1）则 +w/2 取另一半（丛林侧）；起始行
 *  Next(h-300) 向下扫到首格活跃；若为丛林草 60 → 行上移一格 PlaceJunglePlant
 *  （233, Next(8), 0），失败（落点非 233）回退 (233, Next(12), 1)。 */
export function runJunglePlantsPart2Pass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w;
  for (let i = 0; i < w * 100; i++) {
    let num = rng.int(40, Math.floor(w / 2) - 41);      // Next(40, w/2-40)
    if (gs.dungeonSide <= -1) num += Math.floor(w / 2);
    let j = rng.nextInt(st.h - 300);                    // Next(h-300)
    while (!st.flags[st.idx(num, j)] && j < st.h - 300) j++;
    const ji = st.idx(num, j);
    if (st.flags[ji] && SHEET[st.type[ji]] === 60) {
      j--;
      placeJunglePlant233(st, num, j, rng.int(0, 7), 0);            // Next(8)
      const ti = st.inBounds(num, j) ? st.idx(num, j) : -1;
      if (ti < 0 || !st.flags[ti] || SHEET[st.type[ti]] !== 233) {
        placeJunglePlant233(st, num, j, rng.int(0, 11), 1);         // Next(12)
      }
    }
  }
}
