// 原版 #32 Dungeon pass 1:1（1456）：cs:14816 注册段 + DungeonCrawler.MakeDungeon +
// Legacy* 全家（LegacyDungeonLayoutProvider / LegacyDungeonHall / LegacyEntranceDungeonHall /
// LegacyDungeonRoom / LegacyDungeonEntrance）+ DungeonGlobal* 特征管线。与
// tools/golden/caves-oracle.cs 逐段同构对账（caves-checkpoint.test.ts 逐哈希裁决）。
// ★头部掷骰：SetupDungeonGenVarVariables 的入口类型 2 掷 + entrance RandomSeed 原版在
// **Dunes pass 头**消耗（cs:11542）——2026-08-16 每 pass 重播改造已归位 Dunes（主题掷
// gs.dungeonTheme + 种子 gs.dungeonEntSeed 均由 DunesPass 落盘；本 pass 头只余
// shelf→lantern→skewed 序，见 :211 兜底注释）。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import { UnifiedRandom } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../../../data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { tileRunner } from './TileRunner';
import { growTree } from './TreePass';
import { furnitureStyleBase } from '../../FurnitureStyle';
import { flipGenSolid, genSolidType, vanGenSolidType } from './GenSolid';
import { runLavaLayerCaverer } from './LavaLayerCavererPass';
// 1457 地牢域对齐（docs/worldgen/dungeon-1457-alignment.md）：双地牢旗→行为接线
// （trap 窗口/潜在界域回填）+ GOTHIC 平台档（DungeonGlobalPlatforms.cs:42-45,仅帧通道）。
import { dualDungeonState, dualDungeonTrapWindow, createPotentialDungeonBounds } from './DungeonStyles1457';
import type { PotentialDungeonBounds } from './DungeonStyles1457'; // ★IIIII93b 双座 pb 面
// ★LLL 批（2026-08-25）：placeTrap0 补 noTraps 巨石非实心窗（WorldGen.SetBoulderSolidity
//   经 GenSolid 全局表翻转,dgSolid/genSolidType 即见）——与 TrapsPass 同源单实现。
import { setBoulderSolidity } from './TrapsPass';
// ★IIIII59：双地牢家族二件套（DungeonDropTrap/DungeonTileClump，1457=1458）——
// 结构位接线见 dgEarlyDualFamilies；现行一切链形参表下纯惰性零掷。
import { dropTrap as deDropTrap, tileClump as deTileClump } from './DungeonEarlyFeatures';
import { runDualDungeonLayout } from './DungeonDualLayout';   // ★IIIII92 双地牢布局域
import { dualSnakes } from './DitherSnakePass';
// node:fs 动态导入（探针落盘 SW_DG_LIGHTS_GRID 才用）——顶层静态导入会进
// worker bundle 被 vite 外部化炸构建（2026-08-18 实锤：writeFileSync is not
// exported by "__vite-browser-external"）。改运行时 require，浏览器恒 false 门
type NodeFs = typeof import('node:fs');
let fsMod: NodeFs | null = null;
function nodeFs(): NodeFs | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fsMod ??= (typeof require === 'function' ? require('node:fs') : null) as NodeFs | null;
  } catch { fsMod = null; }
  return fsMod;
}

const __swProcessEnv: Record<string, string | undefined> = (typeof process !== 'undefined') ? (process as unknown as { env?: Record<string, string | undefined> }).env ?? {} : {};


const BLUE = TILE_BY_KEY['v_41_blue_brick']!;
const GREEN = TILE_BY_KEY['v_43_green_brick']!;
const PINK = TILE_BY_KEY['v_44_pink_brick']!;
const CRACKED_FOR_BRICK: Record<number, number> = {
  [BLUE]: TILE_BY_KEY['v_481_cracked_blue_brick'] ?? BLUE,
  [GREEN]: TILE_BY_KEY['v_482_cracked_green_brick'] ?? GREEN,
  [PINK]: TILE_BY_KEY['v_483_cracked_pink_brick'] ?? PINK,
};
const DOOR = TILE_BY_KEY['door_closed']!;
const BANNER = TILE_BY_KEY['v_91_banners']!;
const SPIKE = TILE_BY_KEY['v_48_spike']!;
const PLATFORM = TILE_BY_KEY['platform']!;
const LANTERN = TILE_BY_KEY['lantern']!;
const CHANDELIER = TILE_BY_KEY['chandelier']!;
const DSWITCH = TILE_BY_KEY['v_136_switch']!;
const HANGING = TILE_BY_KEY['v_240_wall_hangings_3x3']!;
const CATACOMB = TILE_BY_KEY['v_241_catacombs']!;
const PAINTING = TILE_BY_KEY['v_242_paintings_6x4']!;
const BOOKCASE = TILE_BY_KEY['bookcase']!;
const BENCH = TILE_BY_KEY['bench']!;
const BATHTUB = TILE_BY_KEY['bathtub']!;
const BED = TILE_BY_KEY['bed']!;
const PIANO = TILE_BY_KEY['piano']!;
const DRESSER = TILE_BY_KEY['dresser']!;
const CANDELABRA = TILE_BY_KEY['candelabra']!;
const LAMP = TILE_BY_KEY['v_93_lamps']!;
const CLOCK = TILE_BY_KEY['grandfather_clock']!;
const STATUE = TILE_BY_KEY['v_105_statue']!;
const CANDLE = TILE_BY_KEY['candle']!;
const WATER_CANDLE = TILE_BY_KEY['water_candle']!;
const BOOKS = TILE_BY_KEY['v_50_books']!;
const TABLE = TILE_BY_KEY['table']!;
const CHAIR = TILE_BY_KEY['chair']!;
const WORKBENCH = TILE_BY_KEY['workbench']!;
const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const ALCHEMY = TILE_BY_KEY['v_355_alchemy_table']!;
const BEWITCH = TILE_BY_KEY['v_354_bewitching_table']!;

type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }>;
type SnapFn = (name: string) => void;

// Main.tileSolidTop（Main.cs:6764-7841 全表 78 项）——SolidTile 判定的第二道门。
// 与 TILE_DEFS[].platform 近似集不同：桌14/工作台18/箱87/书架101/旗339 等皆 solidTop。
const DG_SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
const DG_DUNGEON_TILES = new Set([41, 43, 44, 677, 678, 679]);
const DG_DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
const DG_FRAMED_NOT_CUT = new Set<number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  if (d?.vanilla?.sheet == null) continue;
  if (d.framed && !d.decor) DG_FRAMED_NOT_CUT.add(d.vanilla.sheet);
}
// 全量 tileFrameImportant（Main.cs 404 赋值 + AddEchoFurnitureTile 家族 + 循环 435-439 = 411；
// 与 FRAMED_NOT_CUT 不同：不扣 tileCut——GenerateDungeonStairs_CanPlaceTile 判定用全表，
// sheet 空间勿混入内部 id，比较走 TILE_DEFS[t]?.vanilla?.sheet）
/** tileFrameImportant 全表（Main.cs 赋值全集，sheet 空间）。★★IIII28 批改为导出：
 *  NotTheBeesPass.placeLarva 的 PlaceTile 头 ResetsHalfBrickPlacementAttempt 支
 *  （cs:60241-60246）需要 `!Main.tileFrameImportant[tile.type]` 精确判定——
 *  曾硬编码 false 致 mile8 ntb #105 大面积回归（A=3716/T=7606：幼虫尝试域把
 *  225/231 等 FI 型的帧清零），改接本表后与 vanilla 逐格同效。 */
export const DG_FRAMED_ALL = new Set<number>([
  3, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24, 26, 27, 28, 29, 31, 33, 34, 35,
  36, 42, 49, 50, 55, 61, 71, 72, 73, 74, 77, 78, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91,
  92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 110, 113, 114, 125, 126, 128, 129, 132, 133,
  134, 135, 136, 137, 138, 139, 141, 142, 143, 144, 149, 165, 171, 172, 173, 174, 178, 184, 185, 186, 187, 201, 207, 209,
  210, 212, 215, 216, 217, 218, 219, 220, 227, 228, 231, 233, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246,
  247, 254, 269, 270, 271, 275, 276, 277, 278, 279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294,
  295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 314, 316, 317, 318, 319, 320, 323, 324,
  334, 335, 337, 338, 339, 349, 354, 355, 356, 358, 359, 360, 361, 362, 363, 364, 372, 373, 374, 375, 376, 377, 378, 380,
  386, 387, 388, 389, 390, 391, 392, 393, 394, 395, 405, 406, 410, 411, 412, 413, 414, 419, 420, 423, 424, 425, 427, 428,
  429, 435, 436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 452, 453, 454, 455, 456, 457, 461, 462, 463, 464, 465, 466,
  467, 468, 469, 470, 471, 475, 476, 480, 484, 485, 486, 487, 488, 489, 490, 491, 493, 494, 497, 499, 505, 506, 509, 510,
  511, 518, 519, 520, 521, 522, 523, 524, 525, 526, 527, 529, 530, 531, 532, 533, 538, 542, 543, 544, 545, 547, 548, 549,
  550, 551, 552, 553, 554, 555, 556, 558, 559, 560, 564, 565, 567, 568, 569, 570, 571, 572, 573, 579, 580, 581, 582, 583,
  584, 585, 586, 587, 588, 589, 590, 591, 592, 593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604, 605, 606, 607,
  608, 609, 610, 611, 612, 613, 614, 615, 616, 617, 619, 620, 621, 622, 623, 624, 629, 630, 631, 632, 634, 637, 639, 640,
  642, 643, 644, 645, 646, 647, 648, 649, 650, 651, 652, 653, 654, 656, 657, 658, 660, 663, 664, 665, 693, 694, 695, 696,
  698, 699, 700, 701, 702, 703, 704, 705, 706, 707, 709, 710, 711, 712, 713, 714, 715, 716, 720, 721, 723, 724, 725, 726,
  733, 751, 752,
]);
// —— TileObject.CanPlace chest21/467 锚定门常量（sheet 空间；Main.cs/TileID.cs 原值）——
// tileCut（Main.cs:7312-10158 全 41 项）/ BreakableWhenPlacing（TileID.cs:379）/
// 巨石族 / anchorInvalidTiles（TileObjectData.cs:2113）/ Platforms（TileID.cs:243）/
// tileNoAttach（Main.cs:7725-9901 含 435-439）/ tileTable（Main.cs:9900 段）
const DG_BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const DG_TILE_CUT = new Set([3, 24, 28, 32, 51, 52, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 201, 205, 231, 236, 254, 352, 382, 444, 454, 484, 485, 518, 519, 528, 529, 549, 636, 637, 638, 654, 655, 711]);
/** WorldGen.beachDistance（WorldGen.cs:4102）——原单例壳内局部常量,IIIII93b 提升模块级
 *  （消费面=入口 precalc 海滩带 dgSetup + AddBuriedChest NTB 蜂蜜箱带两侧短路边界）。 */
const BEACH = 380;
const DG_BREAK_PLACE = new Set([324, 186, 187, 185, 165, 530, 233, 227, 485, 81, 624]);
const DG_CHEST_ANCH_INVALID = new Set([127, 138, 664, 665, 484, 711, 712, 713, 714, 715, 716]);
const DG_PLATFORMS = new Set([19, 427, 435, 436, 437, 438, 439]);
const DG_NO_ATTACH = new Set([3, 4, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 27, 50, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102, 110, 114, 134, 387, 388, 390, 427, 435, 436, 437, 438, 439, 441, 467, 468, 469, 486, 487, 488, 489, 490, 497, 507, 564, 565, 568, 569, 570, 572, 580, 590, 593, 594, 595, 615, 620, 704, 707]);
/** ★IIIII44 复核导出：Main.tileTable（Main.cs:9900 段 + :10131 循环族）唯一权威表
 *  ——跨模块消费端（SkyblockPass placeMB 支撑臂等）一律 import 本表,禁止局部手抄子集
 *  （「常量表有/装配漏」家族教训:SkyblockRuntime anchorSets 手写装配漏键案 2026-08-29）。 */
export const DG_TILE_TABLE: ReadonlySet<number> = new Set([14, 18, 19, 280, // ★IIIII44 审计补位：Main.cs:7018（diff 定罪,曾缺 1/81）
 87, 88, 101, 114, 275, 276, 277, 278, 279, 281, 285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
// PrefixLegacy.Prefixes 前缀池（PrefixLegacy.cs:9-64）+ ReducedNaturalChance（PrefixID.cs:9）
const DG_PRE: Record<string, number[]> = {
  swords: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 81],
  spears: [36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 59, 60, 61],
  guns: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 58, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 82],
  magic: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 52, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 83],
  summon: [85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 55, 38, 54, 53, 57, 40, 56, 41, 39],
  boom: [36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 59, 60, 61],
  acc: [62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80],
};
const DG_PRE_REDUCED = new Set([7, 8, 9, 10, 11, 22, 23, 24, 29, 30, 31, 39, 40, 56, 41, 47, 48, 49]);
// ★BBBBB 勘误（2026-08-19）：TryGetPrefixStatMultipliersForItem 的 switch（Item.cs:704-1031）
//   内【零】return false——81-89（Legendary 族）均有乘子（case 81: kb/dmg/crt/spd/size）。
//   唯四条后置门（Round(damage*dmg)==damage 等，:1039-1060）可 false→Prefix 重掷，但对
//   地牢箱族 item 常量（damage≥24/useAnimation≥15/mana∈{7,14}/knockBack>0）恒不触发——
//   Prefix(-1) 单轮即止，无重掷链。曾误建 {81-89} 结构集 → 12345 #32 爆 1688 格
//   （其箱掷中 81 被多耗 2 骰）——已回退。
const DG_PRE_CLASS: Record<number, string> = {
  155: 'swords', 156: 'acc', 157: 'magic', 163: 'spears', 113: 'magic', 3317: 'boom',
  164: 'guns', 1156: 'guns', 1571: 'boom', 1569: 'boom', 1260: 'magic', 1572: 'summon',
  4607: 'summon', 5465: 'acc',
  // ★KKKKKKK（2026-08-24）：6156 银护腕（1.4.5 新饰品，Item.cs:47452 DefaultToAccessory）
  //   ——1457 地牢箱 flag9 组第三掷（WG.cs:37252 金支 :36951/中深支）Next(4)==0→
  //   SetDefaults(6156)+Prefix(-1)。缺此掷=G 段起主流永久相移（七链 #32 首差共同根因）。
  6156: 'acc',
  // ★BBBBB 勘误：327=Golden Key（ItemID.cs:2193）——非 accessory/无任何前缀类
  //   （Item.cs case 327 仅 width/height）→ GetRollablePrefixes=null → Prefix(-1) 零掷。
  //   水覆写箱（num2<ws+50 → itemType=327）的 loot 修正点在 surf 支门（见 dgChestLoot），
  //   非此处——曾误登 'acc' 反致 +2 掷流错位。
};
// 家具 item → 原版 tile id（Item.cs createTile；sheet 空间）
// ★2026-08-13 id 空间碰撞修复：曾直存 sheet id 给 placeSimple 裸写 st.type——
// 落地钟 sheet104 命中内部 #104=活木（"地牢诡异装饰物"真身！）、蜡烛 33=猩红矿、
// 灯 93=氙苔、椅 15=铁砧、烛台 100=石板、书架 101=熔岩苔、床 79=中式灯笼、
// 工作台 18=开门图块…（陶罐案同款）。现统一换算成内部 id（placeSimple/place4x2/
// :2101 比较三消费点同源）。
const DG_ITEM_SHEET: Record<number, number> = {
  1396: 15, 1399: 15, 1402: 15, 1509: 15,
  1397: 14, 1400: 14, 1403: 14, 1510: 14,
  1398: 18, 1401: 18, 1404: 18, 1511: 18,
  1405: 33, 1406: 33, 1407: 33, 5743: 33,
  1408: 105, 1409: 105, 1410: 105,
  1414: 101, 1415: 101, 1416: 101, 1512: 101,
  1470: 79, 1471: 79, 1472: 79, 5740: 79,
  2376: 87, 2377: 87, 2378: 87, 5750: 87,
  2386: 88, 2387: 88, 2388: 88, 5741: 88,
  2402: 89, 2403: 89, 2404: 89, 5753: 89,
  2658: 90, 2659: 90, 2660: 90, 5739: 90,
  2664: 100, 2665: 100, 2666: 100, 5742: 100,
  2645: 93, 2646: 93, 2647: 93, 5748: 93,
  3900: 104, 3901: 104, 3902: 104, 5746: 104,
};
const DG_ITEM_TILE: Record<number, number> = {};
for (const k of Object.keys(DG_ITEM_SHEET)) {
  DG_ITEM_TILE[Number(k)] = TILE_INTERNAL_BY_SHEET.get(DG_ITEM_SHEET[+k]) ?? -1;
}
/** 地牢陈设 item → placeStyle（Item.cs SetDefaults 提取，2026-08-17）：
 *  主题 0/1/2 = 蓝/绿/粉砖（item 三连号），5739+ = 1.4.4 新砖族专列。
 *  调用方按此写帧（style*objW+col*18 / row*18，raw 存储绘制端分带换算）。 */
const DG_ITEM_STYLE: Record<number, number> = {
  1396: 13, 1399: 14, 1402: 15, 1509: 17,
  1397: 10, 1400: 11, 1403: 12, 1510: 14,
  1398: 11, 1401: 12, 1404: 13, 1511: 15,
  1405: 1, 1406: 2, 1407: 3, 5743: 46,
  1408: 46, 1409: 47, 1410: 48,
  1414: 1, 1415: 2, 1416: 3, 1512: 5,
  1470: 5, 1471: 6, 1472: 7, 5740: 47,
  2376: 11, 2377: 12, 2378: 13, 5750: 47,
  2386: 5, 2387: 6, 2388: 7, 5741: 47,
  2402: 6, 2403: 7, 2404: 8, 5753: 51,
  2658: 21, 2659: 22, 2660: 23, 5739: 47,
  2664: 22, 2665: 23, 2666: 24, 5742: 47,
  2645: 24, 2646: 25, 2647: 26, 5748: 47,
  3900: 30, 3901: 31, 3902: 32, 5746: 48,
};

// DungeonBounds（DungeonBounds.cs）：Left/Right 钳 [10,w-10]、Top/Bottom 钳 [10,h-10]；
// CalculateHitbox 保证 R>L、B>T；Contains=Rectangle.Contains 半开区间。
class DBnd {
  L = 10; R = 10; T = 10; B = 10;
  has = false;
  constructor(public w: number, public h: number) {}
  private cx(v: number): number { return Math.max(10, Math.min(this.w - 10, v)); }
  private cy(v: number): number { return Math.max(10, Math.min(this.h - 10, v)); }
  set(l: number, t: number, r: number, b: number): void {
    this.L = this.cx(l); this.R = this.cx(r); this.T = this.cy(t); this.B = this.cy(b);
    this.calc();
  }
  calc(): void {
    if (this.R <= this.L) this.R = this.L + 1;
    if (this.B <= this.T) this.B = this.T + 1;
    this.has = true;
  }
  upd(x: number, y: number): void;
  upd(minX: number, minY: number, maxX: number, maxY: number): void;
  upd(a: number, b: number, c?: number, d?: number): void {
    if (c === undefined || d === undefined) {
      if (a < this.L) this.L = this.cx(a);
      if (a > this.R) this.R = this.cx(a);
      if (b < this.T) this.T = this.cy(b);
      if (b > this.B) this.B = this.cy(b);
    } else {
      if (a < this.L) this.L = this.cx(a);
      if (c > this.R) this.R = this.cx(c);
      if (b < this.T) this.T = this.cy(b);
      if (d > this.B) this.B = this.cy(d);
    }
    this.has = true;
  }
  topSet(t: number): void { this.T = this.cy(t); this.has = true; }
  inflate(a: number): void { this.set(this.L - a, this.T - a, this.R + a, this.B + a); }
  contains(x: number, y: number): boolean {
    return this.has && x >= this.L && x < this.R && y >= this.T && y < this.B;
  }
  containsF(x: number, y: number, fluff: number): boolean {
    if (fluff === 0) return this.contains(x, y);
    return this.has && x >= this.L - fluff && x < this.R + fluff && y >= this.T - fluff && y < this.B + fluff;
  }
}

interface DRoom {
  seed: number; x: number; y: number; start: boolean; generated: boolean;
  inner: DBnd; outer: DBnd; ex: number; ey: number; strength: number;
}
interface DHall {
  seed: number; generated: boolean; forceX: boolean; isEntrance: boolean;
  bounds: DBnd; sx: number; sy: number; ex: number; ey: number;
  sdx: number; sdy: number; edx: number; edy: number;
}
interface DDoor { x: number; y: number; dir: number; hall: boolean; skipOther: boolean; skipSpace: boolean; clear: boolean; fluff: number; }
/** hf = OverrideHeightFluff（DungeonPlatformData.cs:14）：房间候选=3、走廊/入口候选缺省=5。
 *  XX 批（2026-08-18）扩：Tower/Dome 入口候选带 ForcePlacement + 置物概率
 *  （pots/bottles/books/candles——IsAShelf=任一>0（DungeonPlatformData.cs:34-43
 *  计算属性），书架链每列 1-3 道门掷 + 命中放置掷）。
 *  FFFF 批（2026-08-18）扩 nowb=NoWaterbolt（DungeonPlatformData.cs）：Dome 入口
 *  上对平台（num7-25）true / 下对（num7-20）false——false 时 books 命中先掷
 *  Next(50)（DU:432-435 默认支 waterbolt 门）。 */
interface DPlat { x: number; y: number; hall: boolean; hf: number;
  force?: boolean; pots?: number; bottles?: number; books?: number; candles?: number;
  nowb?: boolean; }

/** ★IIIII93b：单座地牢实例参数束（dgSetup 产物 → oneDungeon 消费）。
 *  对应 vanilla GenVars.dungeonGenVars[k]（genvars 面）+ DungeonData[k]（表/预计算面）
 *  的最小集——普通世界 k=0 全量来自 gs 单套（逐位零差），dual 第二座来自
 *  dualDungeonState.dungeons[1]（Reset/Dunes 头装配）。 */
interface DgInstBundle {
  k: number;
  /** genvars 派生面（theme=brickTile/Wall/Cracked 族色,DC.cs:56-77） */
  theme: number; brick: number; wall: number; crack: number; wallVariants: number[];
  doorStyle: number; platformStyle: number;
  winGlass: number; winGlassClosed: number; winEdge: number; winPlatStyle: number;
  /** DungeonData 表面（SetupDungeonDataVariables DC.cs:243-273） */
  shelf: number[]; lantern: number[]; bannerStyles: number[]; skewed: boolean;
  side: number; locInit: number; locFinal: number;
  /** outerPotentialDungeonBounds（createPotentialDungeonBounds 单源,potT 下游同名承接） */
  pb: PotentialDungeonBounds;
  /** 入口三掷/precalc 终值（失败回退支已含 data==null 支新 entSeed=HHHHHHH⑥ 口径） */
  entSeed: number; entKind: number; entX: number; entY: number; precalcOK: boolean;
  isDual: boolean;
}

/** #32 Dungeon pass（1456 1:1，与 caves-oracle.cs 同构）。snap 回调用于逐段检查点。 */
// ★IIIII93 取证开关缓存（spikeRun 伴查格旧行为复归用；缺省 false=修复生效）
const _i93LegacySpike = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I93_LEGACYSPIKE === '1';
export function runDungeonPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, snapRaw: SnapFn = () => {},
): void {
  // ★KKKKKKK 段级网格观察钩（诊断用，常态零开销）：globalThis.__dgSegWatch=(name,st)=>…
  const segWatch = (globalThis as { __dgSegWatch?: (name: string, s2: TileStore) => void }).__dgSegWatch;
  // ★IIIII93 DGP 镜像标记（x86 rig UpdateDungeonProgress 同位；__i97dgp 存在时生效）
  const dgpMark = (name: string): void => {
    const g = (globalThis as unknown as { __i97dgp?: Array<{ name: string; cum: number }>, __i97cum?: { n: number } }).__i97dgp;
    if (g) {
      const c = (globalThis as unknown as { __i97cum?: { n: number } }).__i97cum;
      g.push({ name, cum: c ? c.n : -1 });
    }
  };
  dgpMark("variables_setup");
const snap: SnapFn = (name) => {
    snapRaw(name);
    // ★IIII61 阶段掷账标（SW_WVLOG 批仪）：与 x86 rig MakeDungeon _mark61 同位同 tag
    const WV61 = typeof globalThis !== 'undefined' ? (globalThis as { __swWvLog?: unknown }).__swWvLog : undefined;
    if (WV61) {
      const L = ((globalThis as { __wvLines?: string[] }).__wvLines ??= []);
      // ★IIIII84：mc=__swOnRoll 主实例样本镜像计数（main 实例逐样本真账；
      //   dgMainRolls 只记本文件 ri/rn/rd/raw 包装面,树/引擎内部 rng.int 直呼漏计,
      //   与 x86 JJHook.RollCount2 同口径对拍时以 mc 为准）
      const mrc = (typeof globalThis !== 'undefined'
        ? (globalThis as { __swRollN?: number }).__swRollN : undefined);
      L.push(`MARK|${name}|rc=${dgMainRolls}` + (mrc !== undefined ? `|mc=${mrc}` : ''));
    }
    if ((__swProcessEnv ?? {}).SW_I101_MARK) {
      // ★IIIII96：BOX96 分相盒指纹（与 rig BoxProbe(646,1036,212,708) 同算法同域）
      let h = 2166136261 >>> 0;
      const bx0 = 646, bx1 = 1036, by0 = 212, by1 = 708;
      for (let jj = by0; jj <= by1; jj++) {
        for (let ii = bx0; ii <= bx1; ii++) {
          const qi = st.idx(ii, jj);
          const sh2 = TILE_DEFS[st.type[qi]]?.vanilla?.sheet;
          const tv = (typeof sh2 === 'number' && sh2 >= 0) ? sh2 : 0;
          h = ((h ^ (tv >>> 0)) * 16777619) >>> 0;
          h = ((h ^ ((st.flags[qi] ? 1 : 0) >>> 0)) * 16777619) >>> 0;
        }
      }
      const L2 = (globalThis as { __wvLines?: string[] }).__wvLines;
      L2?.push(`MARK|BOX96 ${h.toString()} @${name}`);
    }
    if (segWatch) segWatch(name, st);
  };
  // ★MakeDungeon 头 SetCrackedBrickSolidity(false)（DungeonCrawler.cs:344）——裂纹砖族
  //   481/482/483 自本 pass 起恒非实心（还原点 SmoothWorld 头 cs:16510 在 Beaches 之后，
  //   不在本段覆盖范围；oracle 同构内联 SOLID.Remove 于 caves-oracle.cs）。CaveWallsPass
  //   同款 pass 内接线；WorldGen.ts 管线处的同参调用为幂等重复，保留为时间线存档。
  //   ★dungeonI 转写债根因（2026-08-16）：此前仅 dgSolid 打了 481-483 排除补丁，
  //   dgLights 的 canHitLocal/placeChand/灯笼上格门仍读静态 TILE_DEFS.solid(=true)，
  //   裂纹砖对把开关视线(CanHit)整段拦死 → 开关/灯放置集两侧分叉（同型种子
  //   1511931452 绿=数据未踩中，9293480 踩中）。消费端一律走 genSolidType。
  flipGenSolid([481, 482, 483], false);
  const { w, h } = st;
  const ws = gs.worldSurface, rock = gs.rockLevel;
  const dgUR = (seed: number): UnifiedRandom => new UnifiedRandom(seed);
  // 掷骰适配：ri(a,b)=Next(a,b+1)；rn(n)=Next(n)；rd()=NextDouble()；raw()=Next()
  // （dgMainRolls=主流掷骰计数器——仅 __dgLayoutTrace 插桩消费，常态零开销）
  let dgMainRolls = 0;
  const ri = (a: number, b: number): number => { dgMainRolls++; return rng.int(a, b); };
  const rn = (n: number): number => { dgMainRolls++; return rng.nextInt(n); };
  const rd = (): number => { dgMainRolls++; return rng.next(); };
  const raw = (): number => { dgMainRolls++; return rng.vanilla.next(); };
  // ================= ★IIIII93b 双座参数化驱动（ddual 第二座地牢）=================
  // 原版 Dungeon pass 头（WorldGen.cs:14833-14837）：对 dungeonGenVars 列表**整体先跑**
  // SetupDungeonData(i,i==0)+SetupDungeonDataVariables(i,genRand)——两座的 Setup 掷序在
  // 【任何 MakeDungeon 之前】；随后 cs:14824-14848 首座 y 锚掷 Next(-200,200)+
  // MakeDungeon(#0)，`DungeonCrawler.dungeonData.Count > 1` 时循环 l=1.. 再次掷锚并
  // MakeDungeon(l)——**WorldGen.cs:14849-14937 二次循环=IIIII92 批定罪的地牢#1 缺席域
  // 主残差源**；收尾 GenVars.CurrentDungeon=0 + dungeonData.Clear()（cs:14932-14933）。
  // d1 样式表=Snow/Desert/Hallow/Temple 四族（DC.cs:111-128 CurrentDungeon%2 分派，
  // 与 G2 残差族 Desert396/Snow161/Hallow117/Temple 一一对应）。跨 pass 消费端
  // （Pyramids 回避带 cs:15462/Temple 镜像锚 cs:16006/老人锚 DU.cs:1660-1683）都只认
  // CurrentDungeonGenVars ⇔ 循环收尾回 0 后的 **d0 视图**——JS 回填面随之固定取 results[0]。
  // JS 侧原为 d0 单例闭包 ⇒ 本批拆壳：
  //   dgSetup(k)      = SetupDungeonDataVariables 第 k 座全序（shelf→lantern→skewed→
  //                     入口 precalc 环；主题 Next(3)/drunk 墙重掷/入口①② Next(3)+entSeed
  //                     四掷由 Dunes pass 头先行消耗——普通世界取 gs 面,dual 第二座从
  //                     dualDungeonState.dungeons[k] 取；兜底自掷仅限绕过 Dunes 直调本
  //                     pass 的诊断路径，流位与 oracle 不同构）。
  //   oneDungeon(k,b) = 第 k 座 MakeDungeon 全壳（DC.cs:344-523：入口四强掷+步数掷+
  //                     布局 provider/爬升走廊/GetEntrance+CalculatePlatformsAndDoors+
  //                     DgEarly..DgLate 十五特征段）。rooms/halls/bounds/pits/winBoxes/
  //                     platData/doorData/posX-posY/topX/lootStyle/pitFlood 私有态与
  //                     房/厅内层 UnifiedRandom(seed) 各自成套互不串扰。普通世界
  //                     INST_COUNT=1、bundle 全量来自 gs 单套=逐位零差。
  const dualFlagRaw = !!gs.seedFlags?.dualDungeons;
  // ★IIIII93b 取证开关：SW_I99_MAXINST=n 截断双座循环（d0 单座 A/B 定位用,默认全跑）
  const MAXI = typeof process !== 'undefined' ? Number((__swProcessEnv ?? {}).SW_I99_MAXINST ?? 99) : 99;
  const IS_DUAL = dualFlagRaw && dualSnakes[0] != null;             // 蛇缓存缺失=非正统调用面,保持旧单例口径
  const INST_COUNT = Math.min(IS_DUAL ? 2 : 1, isNaN(MAXI) ? 99 : MAXI);
  const dgBundles: DgInstBundle[] = [];
  for (let kk = 0; kk < INST_COUNT; kk++) dgBundles.push(dgSetup(kk));
  // ★potentialBounds 注册表改双套：原 IIII88 批在这里被 d0 单条覆写掉了 d1 项
  //   （placeTrap 双地牢界拒门 WorldGen.cs:8865/InAnyPotentialDungeonBounds DU.cs:2146
  //   本就遍历全部 genVars ⇒ dual 半盲是既存偏差）。公式走 createPotentialDungeonBounds
  //   单源（CreatePotentialDungeonBounds DU.cs:2106-2133,:109 参 0.10/0.05——原 inline
  //   右臂 w*0.525 与 C# w*(0.5+num)=w*0.55000000074 分叉,一并并轨）。非双链消费端
  //   全部 seedFlags.dualDungeons 门控 → 仅数值面变化、无语义面（七链回归背书）。
  dualDungeonState.enabled = dualFlagRaw;
  dualDungeonState.potentialBounds =
    dgBundles.map((bb) => ({ l: bb.pb.l, t: bb.pb.t, r: bb.pb.r, b: bb.pb.b }));
  const dgResults: Array<{ posX: number; posY: number; dungeonX: number; dungeonY: number }> = [];
  for (let kk = 0; kk < INST_COUNT; kk++) dgResults.push(oneDungeon(kk, dgBundles[kk]!));

  /** 第 kk 座 DungeonData 面（SetupDungeonDataVariables DC.cs:213-341 全序投影 +
   *  SetupDungeonGenVarVariables 主题/窗口面派生 + 潜在地牢界域）。 */
  function dgSetup(kk: number): DgInstBundle {
    let themeK: number, wallStyleK: number | undefined, sideK: number, locK: number,
      entSeedK: number, entAK: number, entBK: number;
    if (kk === 0) {
      themeK = gs.dungeonTheme >= 0 ? gs.dungeonTheme : ri(0, 2);
      wallStyleK = gs.dungeonWallStyle;
      // ★R11-D3 / HHHHHHH⑥ 口径随壳迁移：precalc 失败回退支的新 entSeed 在下方失败支
      //   （data==null 支 DC.cs:856 RandomSeed=Next()）——曾丢弃掷值仍传旧种子。
      entSeedK = gs.dungeonEntSeed ?? raw();   // preGenDungeonEntranceSettings.RandomSeed
      entAK = gs.dungeonEntA ?? rn(3);         // 入口类型掷①（Dome 候选）
      entBK = gs.dungeonEntB ?? rn(3);         // 入口类型掷②（Tower 覆盖）
      sideK = gs.dungeonSide;
      locK = gs.dungeonLocation;
    } else {
      // 第 1 座四掷=Reset 对偶锚(DC side/location)+Dunes 头 SetupDungeonGenVarVariables(#1)
      // 已耗的主题/drunk 重掷/入口三掷（dualDungeonState.dungeons[kk],WorldGen.ts Reset
      // 支 + DunesPass.ts 头 dual 分支装配）。
      const de = dualDungeonState.dungeons[kk];
      if (!de) throw new Error(`runDungeonPass: dualDungeonState.dungeons[${kk}] 缺失（Reset/Dunes 双地牢装配失效）`);
      themeK = de.theme >= 0 ? de.theme : ri(0, 2);
      wallStyleK = de.wallStyle;               // 非 drunk=undefined（DC.cs:94 drunk 分支零掷零触碰）
      entSeedK = de.entSeed >= 0 ? de.entSeed : raw();
      entAK = de.entA >= 0 ? de.entA : rn(3);
      entBK = de.entB >= 0 ? de.entB : rn(3);
      sideK = de.side;
      locK = de.location;
    }
    const brickK = themeK === 0 ? BLUE : themeK === 1 ? GREEN : PINK;
    // ★IIIII21（DungeonCrawler.cs:94-110）：drunk 世界 genVars.brickWallType 被 Next(3)
    //   重掷（7/8/9 任一）——与砖色解耦（wallVariants 随 wall 派生 DC.cs:221-241）。
    //   值由 Dunes pass 头消耗并留痕 wallStyle（★IIIII93b 起第二座可派生;非 drunk 分支
    //   整段短路未动骰）。
    const wallK = (wallStyleK !== undefined
      ? ([7, 8, 9][wallStyleK] ?? 7)
      : themeK === 0 ? 7 : themeK === 1 ? 8 : 9);
    const crackK = CRACKED_FOR_BRICK[brickK] ?? brickK;
    const wallVariantsK: number[] = wallK === 8 ? [8, 98, 99] : wallK === 9 ? [9, 96, 97] : [7, 94, 95];
    const shelfK = [ri(9, 12), 0, 0];    // SetupDungeonDataVariables（cs:243-254）
    do { shelfK[1] = ri(9, 12); } while (shelfK[1] === shelfK[0]);
    shelfK[2] = ri(9, 12);
    while (shelfK[2] === shelfK[0] || shelfK[2] === shelfK[1]) shelfK[2] = ri(9, 12);
    const lanternK = [rn(7), 0, 0];      // cs:255-266
    do { lanternK[1] = rn(7); } while (lanternK[1] === lanternK[0]);
    lanternK[2] = rn(7);
    while (lanternK[2] === lanternK[0] || lanternK[2] === lanternK[1]) lanternK[2] = rn(7);
    const bannerStylesK = [10, 11, 12, 13, 14, 15];   // cs:267-273 恒表
    const skewedK = rn(4) === 0;         // cs:274 useSkewedDungeonEntranceHalls
    const doorStyleK = themeK === 0 ? 16 : themeK === 1 ? 17 : 18;  // Item 1411-1413 placeStyle
    const platformStyleK = themeK === 0 ? 6 : themeK === 1 ? 8 : 7; // Item 1384-1386 placeStyle(蓝6/绿8/粉7)
    // ★窗口玻璃/边墙/窗台平台样式（SetupDungeonGenVarVariables cs:80-105 + Item 表）：
    //   玻璃 glass/closed、边墙 edge；窗台平台=WindowPlatformItemTypes 单元素
    //   （蓝1386/绿1385/粉1384 → placeStyle 8/7/6——与主平台 6/8/7 恰为倒置，原版如此）
    const winGlassK = themeK === 0 ? 91 : themeK === 1 ? 92 : 90;
    const winGlassClosedK = themeK === 0 ? 96 : themeK === 1 ? 94 : 98;
    const winEdgeK = themeK === 0 ? 8 : themeK === 1 ? 9 : 7;
    const winPlatStyleK = themeK === 0 ? 8 : themeK === 1 ? 7 : 6;
    // ============ PrecalculateEntrancePosition 拒绝环（DungeonCrawler.cs:275-322）============
    // ★XX 批（2026-08-18）双侧转录：Tower/Dome 入口（entKind 1/2）预计算入口位置——
    //   3000 次尝试内掷 Next(200) 偏移 dungeonLocation ±100，海滩带内从 y=10 下爬到首个
    //   active/liquid/wall 格，双云层排除（±15/max(50,y-50)±50，TileID.Sets.Clouds=
    //   {189,196,460,717,718,719}）+ RoughHeight 门槛（num2-40-rough>0）。成功：
    //   dungeonLocation ← num+25-Next(50)（genVars 改写,本座 x0 锚/MakeDungeon x 全跟）
    //   + entrancePosition=(num,num2)。★IIIII53/21：drunk 起点=(int)GenVars.rockLayer-20
    //   是 Reset 期【未平滑】原始量（gs.genRockLayer），非主世界 rockLevel。
    //   Legacy 种子（entBK!=0 且 entAK!=0）整段零掷零触碰（caves-checkpoint 金标不动）。
    //   ★本批迁移要点：环内的每座各自一套,且两座 Setup 环都在任何 y 锚掷之前
    //   （cs:14833-14837 整体先 Setup 再进两段 MakeDungeon 序）。
    const DG_CLOUDS = new Set([189, 196, 460, 717, 718, 719]);
    const cloudsNear = (cx: number, cy: number, dist: number): boolean => {
      for (let x = cx - dist; x <= cx + dist; x++) {
        for (let y = cy - dist; y <= cy + dist; y++) {
          if (!st.inBounds(x, y)) continue;
          const ii = st.idx(x, y);
          if (st.flags[ii] && DG_CLOUDS.has(TILE_DEFS[st.type[ii]]?.vanilla?.sheet ?? -1)) return true;
        }
      }
      return false;
    };
    let entKind = entBK === 0 ? 2 : entAK === 0 ? 1 : 0;   // 0=Legacy 1=Dome 2=Tower（XX 批 DC.cs:802-838）
    let entX = 0, entY = 0, precalcOK = false;             // dungeonEntrancePosition（Zero=未预计算）
    if (entKind !== 0) {
      const rough = entKind === 2 ? 120 : 55;    // RoughHeight：Tower 120 / Dome 55（DC.cs:830-834）
      let tries = 3000;
      while (true) {
        tries--;
        if (tries <= 0) break;
        const nx = locK - 100 + rn(200);
        if (nx > BEACH && nx < w - BEACH) {
          let ny = gs.seedFlags.drunkWorld ? Math.trunc(gs.genRockLayer) - 20 : 10;
          while (ny < h && st.flags[st.idx(nx, ny)] === 0
            && st.liquid[st.idx(nx, ny)] <= 0 && st.wall[st.idx(nx, ny)] <= 0) ny++;
          if (!cloudsNear(nx, ny, 15) && !cloudsNear(nx, Math.max(50, ny - 50), 50)
            && ny - 40 - rough > 0) {
            locK = nx + 25 - rn(50);            // genVars.dungeonLocation 改写（DC.cs:308）
            entX = nx; entY = ny;
            precalcOK = true;
            break;
          }
        }
      }
      // ★R11-D3 失败支（DC.cs:337-341）——回退 Legacy + data==null 支 1 掷新 entSeed
      //  （HHHHHHH⑥：该掷=preSettings.RandomSeed,捕获传入口构建;曾丢弃=回退路径种子偏差）
      if (!precalcOK) {
        entSeedK = raw();
        entKind = 0;
      }
    }
    // ★potential bounds 每座一套（createPotentialDungeonBounds=DU.cs:2106-2133 单源,
    //   ：109 参 percentInMiddle=0.10000000149011612/percentOnEdges=0.05000000074505806；
    //   underground 特典分母=worldSurfaceHigh——drunk/noSurface 双态与 DitherSnake/
    //   Dunes 两装配点同参。potT 下游消费者=入口台阶深度(:1753)/CanPlaceTileAt(:2817/:2843)）
    const pb = createPotentialDungeonBounds(w, h, ws, gs.genWorldSurfaceHigh, sideK < 0,
      !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface);
    return {
      k: kk, theme: themeK, brick: brickK, wall: wallK, crack: crackK, wallVariants: wallVariantsK,
      doorStyle: doorStyleK, platformStyle: platformStyleK,
      winGlass: winGlassK, winGlassClosed: winGlassClosedK, winEdge: winEdgeK, winPlatStyle: winPlatStyleK,
      shelf: shelfK, lantern: lanternK, bannerStyles: bannerStylesK, skewed: skewedK,
      side: sideK, locInit: locK, locFinal: locK,
      pb, entSeed: entSeedK, entKind, entX, entY, precalcOK, isDual: IS_DUAL,
    };
  }

  /**
   * oneDungeon —— 第 instIdx 座 MakeDungeon 全壳（DC.cs:344-523,15 特征段 1:1 既有移植体）。
   * 私有可变态自本函数作用域生灭;输出 {posX,posY,dungeonX,dungeonY} 供 d0 回填面消费
   * （跨 pass 消费端只认 CurrentDungeon=0 视图,见上方驱动注释）。
   */
  function oneDungeon(instIdx: number, b: DgInstBundle): { posX: number; posY: number; dungeonX: number; dungeonY: number } {
    void instIdx;
    const {
      theme, brick, wall, crack, wallVariants, doorStyle, platformStyle,
      winGlass, winGlassClosed, winEdge, winPlatStyle,
      shelf, lantern, bannerStyles, skewed,
    } = b;
    const potT = b.pb.t;                      // 台阶深度/CanPlaceTileAt 门消费（旧 potT 同名承接）
    const isDualWorld = b.isDual;             // 布局分支按本座旗分派（==IS_DUAL）
    let dgLoc = b.locFinal;                   // precalc 改写后的【本座】dungeonLocation
    let entSeed = b.entSeed;                  // 失败回退支已在 dgSetup 定稿（终值）
    const entKind = b.entKind, entX = b.entX, entY = b.entY, precalcOK = b.precalcOK;
    // ★IIIII93b：outerPotentialDungeonBounds.Contains（原 potContains 同名承接）——
    //   pb 已在 createPotentialDungeonBounds 预钳 [10,cap-10]，查询期表达式与旧 inline
    //   完全同构（半开矩形含端语义 DU.cs:2146 ContainsWithFluff fluff=0）
    const potContains = (x: number, y: number): boolean =>
      x >= Math.max(10, Math.min(w - 10, b.pb.l)) && x < Math.max(10, Math.min(w - 10, b.pb.r))
      && y >= b.pb.t && y < b.pb.b;
  // （★IIIII93b：precalc 拒绝环/BEACH/cloudsNear/dgLoc 改写全部迁入 dgSetup——两座
  //   的 Setup 全序先于任何 MakeDungeon,环值经 bundle 下发。下方自「状态」起为
  //   per-instance 私有域。）
  // —— 状态（DungeonData/GenVars 第 instIdx 座私有视图）——
  const rooms: DRoom[] = [];
  const halls: DHall[] = [];
  const doorData: DDoor[] = [];
  const platData: DPlat[] = [];
  const pits: DBnd[] = [];
  // ★QQQQQQ（2026-08-22）：已生成窗盒（DungeonWindow 子类构造即入 dungeonFeatures，
  //   GenerateFeature 恒 true→generated=true；Bounds=逐写格 UpdateBounds）——
  //   DungeonWindow.CanGenerateFeatureAt 对**非 WallVariants** 特征恒 false
  //   （DungeonWindow.cs:9-17），CanGenerateFeatureAt 的 dungeonFeatures 环逐盒拒。
  //   JS 曾缺此门：CONST 塔 seed 一书架候选落入窗盒 → vanilla 拒/JS 收 → +4 掷
  //   流位移（span 首consumption差 @34324）→ 下游 DgBanners/LavaLayerCaverer 全连坐。
  const winBoxes: DBnd[] = [];
  const bounds = new DBnd(w, h);
  const entBounds = new DBnd(w, h);
  let entExists = false;
  let entOnSurface = false;
  let lastHallX = 0, lastHallY = 0;
  let pitFlood = true;
  let lootStyle = 0;
  let posX = 0, posY = 0, topX = 0;
  let dungeonX = 0, dungeonY = 0;
  let shadowKey = false, ramRune = false;
  // —— 深度锚点（cs:14828-14870）——★x0 取 precalc 改写后的 genVars.dungeonLocation
  //   （原版 :14827 在 SetupDungeonDataVariables 之后才读——precalc 成功时已偏移
  //   num+25-Next(50)；Legacy/失败路径原值不动）
  dgpMark("oneDungeon_head");
  const x0 = dgLoc;
  let y0 = Math.trunc((ws + rock) / 2) + ri(-200, 199);
  {
    const cap = Math.trunc((ws + rock) / 2) + 200;
    let solid = false;
    for (let k = 0; k < 10; k++) if (dgSolid(x0, y0 + k)) { solid = true; break; }
    if (!solid) { while (y0 < cap && !dgSolid(x0, y0 + 10)) y0++; }
    if (solid) {
      let n4 = 0;
      while (dgSolid(x0, y0 - n4)) { n4++; if (n4 === 60) break; }
      if (n4 < 60) y0 += 60 - n4;
    }
  }
  // ★IIIII14（cs:14874-14877）：drunk 地牢无地表入口——y 强制 worldSurface+70
  //   （老人预置地下屋/守卫限深放宽同族）；零骰。SecretSeed.noSurface 豁免支不适用。
  if (gs.seedFlags.drunkWorld) {
    y0 = Math.trunc(ws) + 70;
  }
  // —— MakeDungeon（cs:327-505）——
  dgpMark("before_strengths");
  const s1x = ri(25, 29) + 0.0, s1y = ri(20, 24) + 0.0;
  const s2x = ri(35, 49) + 0.0, s2y = ri(10, 14) + 0.0;
  let num = Math.trunc(w / 60); num += rn(Math.trunc(num / 3));          // cs:353-355 num += Next(0, num/3)
  dgpMark("after_steps");

  // ================= 基础谓词（DungeonUtils / WorldGen 门禁同构）=================
  function dgSolid(x: number, y: number): boolean {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    if ((st.wire[i] >>> 5) & 1) return false;    // SolidTile(i,j) !inActive()（WG:70155）——MMMM 批：Dome/Tower 致动柱入实心语义
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    if (!genSolidType(st.type[i]) || DG_SOLID_TOP.has(sheet)) return false;
    if (sheet === 481 || sheet === 482 || sheet === 483) return false;   // SetCrackedBrickSolidity(false)（DC:344；pass 头 flipGenSolid 后冗余双保险）
    return true;
  }

  /** ★IIIII65：SpreadWallDungeon 专用 SolidTile（WorldGen.cs:70650-70666 全项版）。
   *  与 dgSolid 的差异=补齐 `!halfBrick() && slope()==0` 两判项（cs:70664-70665），
   *  以及 null-tile→true 怪癖（BFS 的 InWorld(item,1) 已挡外圈,tile 恒非 null,省略）。
   *  ★定罪记录（CELEB #32 四格 W99↔8 @ (3519,185)(3490,186)(3520,186)(3489,187)）：
   *  塔顶檐角 type43 帽石带 s3/s4 坡位；原版把坡位/半砖判【非实心】⇒ 洪水穿坡面
   *  继续传播并涂到角柱（写 wall=num 且向四邻派发）；JS dgSolid 漏两判项 ⇒ 坡帽
   *  石被判实心 → 只"else-if 涂自身不派发"，角柱永不入队 → 留基墙 8。
   *  反演重放实证：dungeonL..dungeonD 双侧八通道逐字节相等，dungeonW 时点仅此四格
   *  99>8 分叉、其下游全链零差——分叉源唯一收敛于本谓词。★只在本洪水改用全项版,
   *  不动共享 dgSolid（七链满绿由既有谓词认证,域外翻转面不可证）。 */
  function dgSpreadSolid(x: number, y: number): boolean {
    if (!st.inBounds(x, y)) return false;
    const ti = st.idx(x, y);
    if (!st.flags[ti]) return false;                                 // !active()
    const sheet = TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1;
    if (!genSolidType(st.type[ti]) || DG_SOLID_TOP.has(sheet)) return false;   // tileSolid/!solidTop
    if (st.half[ti] !== 0 || st.slope[ti] !== 0) return false;       // cs:70664 !halfBrick() && slope()==0
    if ((st.wire[ti] >>> 5) & 1) return false;                       // !inActive()（cs:70665）
    if (sheet === 481 || sheet === 482 || sheet === 483) return false;         // SetCrackedBrickSolidity(false)
    return true;
  }

  /** ★IIIII96：GroundFurniture 专用 SolidTile（WorldGen.cs:70650 全项版=active∧tileSolid
   *  ∧!solidTop∧!halfBrick∧slope0∧!inActive）。定罪=rainbow #32 残差 A262/T13:
   *  Furniture 候选落点下扫/柱宽扫描用裸 dgSolid 缺 half/slope 两判项 ⇒ 落点行差一截,
   *  候选坐标序全链漂移（rig fuA 对拍实证 首∈#63: X(694,709) vs J(835,701)）。
   *  仅替换家具域五处消费,dgSolid 共享面保持七链认证口径。 */
  const dgSolidFT = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const ti = st.idx(x, y);
    if (!st.flags[ti]) return false;
    const sheet = TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1;
    if (!genSolidType(st.type[ti]) || DG_SOLID_TOP.has(sheet)) return false;
    if (st.half[ti] !== 0 || st.slope[ti] !== 0) return false;       // cs:70664-70665 两判项
    if ((st.wire[ti] >>> 5) & 1) return false;
    return true;
  };
  // 锚腿判定（TileObject.cs:376-442 AnchorBottom 链，chest 21/467；sheet 空间）：
  // ①SolidTile：tileSolid&&!solidTop&&!noAttach&&!anchorInvalid（FlattenAnchors=false 须
  //   blockType()==0——pass 内无半砖/坡，恒真）；②SolidWithTop|Table：平台/solidTop/桌
  //   （生成期 G/C 箱腿实测全砖，平台 properTopFrame 未建模备案）；EmptyTile 不在锚类型。
  function chestLegOK(lx: number, ly: number): boolean {
    const i = st.idx(lx, ly);
    if (!st.flags[i]) return false;                                   // nactive()=false
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    const internal = st.type[i];
    if (genSolidType(internal) && !DG_SOLID_TOP.has(sheet) && !DG_NO_ATTACH.has(sheet) && !DG_CHEST_ANCH_INVALID.has(sheet)) return true;
    if (DG_PLATFORMS.has(sheet)) return !DG_CHEST_ANCH_INVALID.has(sheet);
    if (genSolidType(internal) && DG_SOLID_TOP.has(sheet)) return true;
    if (DG_TILE_TABLE.has(sheet)) return true;
    return false;
  }

  // GetHighestProtectionTypeFromPoint（DungeonUtils.cs:1704-1724）。
  // ★2026-08-13 逐源核实：Legacy 管线（LegacyDungeonLayoutProvider）只调 GenerateRoom/
  //   GenerateHall、从不调 CalculateRoom/CalculateHall → LegacyDungeonRoom.calculated 恒 false
  //   且 _outerShapeData/_innerShapeData 恒空（LegacyDungeonRoom.cs:252-259 仅 !generating 时
  //   填充）→ GetProtectionTypeFromPoint（:56-67）走 `!_outerShapeData.Contains(...)` 恒返
  //   ProtectionType.None。即原版 Legacy 地牢对走廊/挖空 **无任何房间保护**（TilesAndWalls
  //   分支在 Legacy 房型上不可达——覆写至多返 Walls）。本仓 prot() 返 Walls（外框内）是
  //   "同值重刷跳过"级近似：下游三循环仅用它跳过 chWall(chWall 写的就是同一 wall 值)，
  //   与原版 None 的最终方块态零差；保持现状不改（按审计要求补内框保护反而会偏离原版）。
  function prot(x: number, y: number, list: DRoom[]): number {
    let p = 0;
    for (const rm of list) {
      const q: number = rm.outer.contains(x, y) ? 2 : 0;
      if (q === 1) p = p === 2 ? 3 : 1;
      else if (q === 2) p = p === 1 ? 3 : 2;
      if (p === 3) break;
    }
    return p;
  }
  // GetAllRoomsInSpots（:1773）：起/中/终三取样
  function roomsInSpots(sx: number, sy: number, ex: number, ey: number, fluff: number): DRoom[] {
    const mx = sx + (ex - sx) / 2, my = sy + (ey - sy) / 2;
    return rooms.filter((rm) =>
      rm.outer.containsF(Math.trunc(sx), Math.trunc(sy), fluff)
      || rm.outer.containsF(Math.trunc(mx), Math.trunc(my), fluff)
      || rm.outer.containsF(Math.trunc(ex), Math.trunc(ey), fluff));
  }
  // ★EE 批清坡（2026-08-17）：DungeonUtils.ChangeTileType（DU:1605-1618）= 可选
  //   ClearEverything + active(true) + **无条件 Clear(TileDataType.Slope)**（slope=0+
  //   halfBrick=false，Tile.cs:815-818）+ type。JS 此前只写 flags/type → 地牢砖压在
  //   洞穴坡面格上不清坡 → @52 全图残余 219 格幻影坡主根（Y 批定谳移交）。
  //   全部调用点（房/厅/入口城堡/垛口/顶齿/阶梯/坑陷阱/门柱/平台/灯/箱/书架/陷阱族）
  //   走此一处收口，同 X 批 TemplePass.setBrick 修法。
  function chTile(i: number, t: number, reset: boolean): void {
    if (reset) {
      st.type[i] = 0; st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0; st.flags[i] = 0;
      st.slope[i] = 0; st.half[i] = 0;   // ClearEverything（Tile.cs:140-151）含坡位
    }
    st.flags[i] = 1; st.type[i] = t;
    st.slope[i] = 0; st.half[i] = 0;     // Clear(Slope) 无条件（DU:1612；非 reset 也清）
  }
  function chWall(i: number, wl: number, reset: boolean): void {
    if (reset) {
      st.type[i] = 0; st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0; st.flags[i] = 0;
      st.slope[i] = 0; st.half[i] = 0;   // ClearEverything；ChangeWallType 本体不清坡（DU:1620-1631）
    }
    st.wall[i] = wl;
  }
  /** ★IIIII97b（toad #32 Sl14 定罪刀）：Tower/Dome 基座箱 overwrite 臂
   *  （TowerDungeonEntrance.cs:135-215 / DomeDungeonEntrance.cs:130-223 的
   *  `else if (!flag4)` 族）是**裸赋值写**：liquid=0+active(true)+type(+color+wall)
   *  ——不经 ChangeTileType ⇒ **不清 slope/half**，陈旧坡位在砖下存活。
   *  旧镜统一走 chTile(reset:false)=DU.ChangeTileType 无条件 Clear(Slope)，多清
   *  了坡位 ⇒ x86 保留 / JS 抹零 → toad mile8 #32 起 Sl14 残差（塔基线 j=219
   *  楼梯带 (3298..3314,280..295) 全为「沙岩/沙漠化石坡面格上叠粉砖」格）。 */
  function chTileRaw(i: number, t: number): void {
    st.flags[i] = 1; st.type[i] = t;                 // active(true)+type；slope/half 保留原值
  }

  // ==================================================================
  // ★IIIII21 drunk 死生命树（GenerateDungeonTree + GrowDungeonTree +
  // GrowDungeonTree_MakePassage，DungeonUtils.cs:615-1151 全量移植）。
  // 调用面：drunk 世界入口族尾段（Legacy cs:582-585 generateRoots=true；Tower
  // cs:493-495 / Dome cs:473-475 roots=false）。SpecialSeedFeatures.DungeonEntranceHasATree
  // （drunk && !NoDungeonGuardian）；掷骰走主流 rng（C# 内 genRand=WorldGen.genRand）。
  // 主干/枝/叶 = 191 活木 / 192 活叶；paint b=b2=28（notTheBees 组合域才归零——登记不接线）；
  // 墙写 244 活木墙；MakePassage 平台 PlaceTile(19) style 23（裸）/6（蓝砖平台 item1384，
  // ItemID.Sets.DerivedPlacementDetails[1384]={19,6}，ItemID.cs PostSetupContent）。
  // Main.tileSolid[48] 关-复开两拍按原版序经 flipGenSolid 保真（SMOOTH 还原在 Beaches 后，
  // 本函数尾提前复开=C# 同位）。生成期 SquareTileFrame/SquareWallFrame 段（DU:1141-1144）
  // 在 !isGeneratingOrLoadingWorld 门内恒跳过，不移植。
  // ★IIIII57：passage 家族/粘土→土换算——原版 sheet id → 内部 id
  const CHAIRS = TILE_INTERNAL_BY_SHEET.get(15) ?? -1;
  const LOOMV = TILE_INTERNAL_BY_SHEET.get(304) ?? -1;      // LivingLoom（1458 新）
  const CLAYV = TILE_INTERNAL_BY_SHEET.get(40) ?? -1;
  const DIRTV = TILE_INTERNAL_BY_SHEET.get(0) ?? -1;      // Clay→Dirt conversion target
  const TREE_WOOD = TILE_BY_KEY['v_191_living_wood_block']!;
  const TREE_LEAF = TILE_BY_KEY['v_192_living_leaf_block']!;

  /** IIII57 勘误 ClearTileAndPaint()（Tile.cs:138-142）：= ClearTile(清 slope/half/
   *  active/inActive 四位) + ClearBlockPaintAndCoating(tile 漆+荧光/隐形涂层)。
   *  不清 type/wall/liquid/liquidType/frameX/Y/paintWall！旧移植全位抹除,幽灵 type、
   *  既有液体、活木墙全丢,MakePassage 竖井/叶团残留域错乱。 */
  function clearTileAndPaint(i: number): void {
    st.flags[i] = 0;                    // active(false)
    st.wire[i] &= ~32;                  // inActive(false)
    st.slope[i] = 0; st.half[i] = 0;    // ClearSlope()
    st.paint[i] = 0;                    // ClearBlockPaintAndCoating（block 漆；wall 漆不动）
  }
  /** 树格主写：type=活木+active+Clear(Slope)+color(b)；leaf=true 写活叶 */
  function treeCell(x: number, y: number, leaf: boolean): void {
    if (!st.inBounds(x, y)) return;    // 原版裸写；越界域外安全垫（语义等价）
    const i2 = st.idx(x, y);
    chTile(i2, leaf ? TREE_LEAF : TREE_WOOD, false);
    st.paint[i2] = 28;                 // b / b2 同值 28（NTB 才归零，组合域不接线）
  }
  /** 非激活树格支写（type+Clear(Slope)+color 不置 active——枝条上向节专用 DU:811-817） */
  function treeCellGhost(x: number, y: number): void {
    if (!st.inBounds(x, y)) return;
    const i2 = st.idx(x, y);
    st.type[i2] = TREE_WOOD;
    st.slope[i2] = 0;
    st.paint[i2] = 28;
  }

  function generateDungeonTree(x: number, y: number, attachmentY: number, generateRoots = true): void {
    if (!inW(x, y, 20)) return;                                   // !InWorld(x,y,20)
    let num = y;
    for (;;) {                                                    // 上行找 5 行净窗
      let busy = false;
      for (let d2 = 0; d2 <= 4; d2++) {
        const yy = num - d2;
        if (!st.inBounds(x, yy)) continue;
        const ti = st.idx(x, yy);
        if (st.flags[ti] !== 0 || st.wall[ti] > 0) { busy = true; break; }
      }
      if (!busy) break;
      num--;
      if (num < 50) break;
    }
    if (num > 50) growDungeonTree(x, num, attachmentY, false, generateRoots);
  }

  function growDungeonTree(i: number, j: number, attachmentY: number, patch: boolean, generateRoots: boolean): void {
    void patch;                       // patch 分支仅 remix 域 MakePassage noSecretRoom 门
    flipGenSolid([48], false);        // Main.tileSolid[48]=false（DU:738）
    const arr: number[] = [], arr2: number[] = [], arr3: number[] = [], arr4: number[] = [];
    const arr5: number[] = [], arr6: number[] = [], arr7: boolean[] = [];
    let n2 = 0;                       // C# num：主干行游标（仅 trunk 推进；branch 界用）
    let nA = 0;                       // ★IIIII57 勘误：C# num2＝叶锚独立游标（枝/冠写
                                      //   array5/6/7 用 num2++，与 num 完全分离）——旧移植
                                      //   曾把两者合一，branch 界 l<num-1 被锚点虚增出 l=3 臂，
                                      //   冠部锚/叶团全体漂移（DRUNK #32 树形残余根因）
    let n3 = i - rng.int(2, 2);       // i - Next(2,3)
    let n4 = i + rng.int(2, 2);       // i + Next(2,3)
    if (rng.int(0, 4) === 0) {        // Next(5)==0 → 单侧加宽
      if (rng.int(0, 1) === 0) n3--; else n4++;
    }
    const wdt = n4 - n3;              // num5
    let n6 = n3, n7c = n4;            // num6/num7 窄化游标
    const minL0 = n3, minR0 = n4;     // minimumLeft/Right 初值快照（roots 域）
    let flag = true;
    let n8 = rng.int(-8, -5);         // Next(-8,-4)
    let n9 = rng.int(0, 1);
    let n10 = j;
    let n11 = rng.int(5, 14);         // Next(5,15)
    while (flag) {
      n8++;
      if (n8 > n11) {
        n11 = rng.int(5, 14);
        n8 = 0;
        arr2[n2] = n10 + rng.int(0, 4);                    // Next(5)
        if (rng.int(0, 4) === 0) n9 = n9 === 0 ? 1 : 0;
        if (n9 === 0) {
          arr3[n2] = -1; arr[n2] = n3; arr4[n2] = n4 - n3;
          if (rng.int(0, 1) === 0) n3++;
          n6++; n9 = 1;
        } else {
          arr3[n2] = 1; arr[n2] = n4; arr4[n2] = n4 - n3;
          if (rng.int(0, 1) === 0) n4--;
          n7c--; n9 = 0;
        }
        if (n6 === n7c) flag = false;
        n2++;
      }
      for (let k = n3; k <= n4; k++) treeCell(k, n10, false);   // 行绘制（每迭代必跑）
      n10--;
    }
    // ---- 枝条段（l < num-1）----
    for (let l = 0; l < n2 - 1; l++) {
      let n12 = arr[l]! + arr3[l]!;                         // num12=基点内缩一格
      let n13 = arr2[l]!;
      let n14 = Math.trunc(arr4[l]! * (1.0 + rng.int(20, 29) * 0.1));
      treeCell(n12, n13 + 1, false);
      let n15 = rng.int(3, 4);                              // Next(3,5)
      while (n14 > 0) {
        n14--;
        treeCell(n12, n13, false);
        if (rng.int(0, 9) === 0) {
          n13 = rng.int(0, 1) !== 0 ? n13 + 1 : n13 - 1;
        } else {
          n12 += arr3[l]!;
        }
        if (n15 > 0) n15--;
        else if (rng.int(0, 1) === 0) {
          n15 = rng.int(2, 4);                              // Next(2,5)
          if (rng.int(0, 1) === 0) {                        // 上向节（-1 格不置 active）
            treeCell(n12, n13, false);
            treeCellGhost(n12, n13 - 1);
            arr5[nA] = n12; arr6[nA] = n13; nA++;
          } else {                                          // 下向节
            treeCell(n12, n13, false);
            treeCell(n12, n13 + 1, false);
            arr5[nA] = n12; arr6[nA] = n13; nA++;
          }
        }
        if (n14 === 0) { arr5[nA] = n12; arr6[nA] = n13; nA++; }   // 枝端叶团锚
      }
    }
    // ---- 冠部（中柱下行 + 双侧横伸；num18 从 Next(num5*3,num5*5) 起）----
    {
      let n16 = Math.trunc((n3 + n4) / 2);
      let n17 = n10;
      let n18 = rng.int(wdt * 3, wdt * 5 - 1);
      let n19 = 0, n20 = 0;
      while (n18 > 0) {
        treeCell(n16, n17, false);
        if (n19 > 0) n19--;
        if (n20 > 0) n20--;
        for (let m = -1; m <= 1; m++) {
          if (m === 0 || ((m >= 0 || n19 !== 0) && (m <= 0 || n20 !== 0)) || rng.int(0, 1) !== 0) continue;
          let n21 = n16, n22 = n17;
          let n23 = rng.int(wdt, wdt * 3 - 1);              // Next(num5, num5*3)
          if (m < 0) n19 = rng.int(3, 4);
          if (m > 0) n20 = rng.int(3, 4);
          let n24 = 0;
          while (n23 > 0) {
            n23--;
            n21 += m;
            treeCell(n21, n22, false);
            if (n23 === 0) { arr5[nA] = n21; arr6[nA] = n22; arr7[nA] = true; nA++; }
            if (rng.int(0, 4) === 0) {
              n22 = rng.int(0, 1) !== 0 ? n22 + 1 : n22 - 1;
              treeCell(n21, n22, false);
            }
            if (n24 > 0) n24--;
            else if (rng.int(0, 2) === 0) {
              n24 = rng.int(2, 3);                          // Next(2,4)
              const n25 = n21;
              let n26 = n22;
              n26 = rng.int(0, 1) !== 0 ? n26 + 1 : n26 - 1;
              treeCell(n25, n26, false);
              arr5[nA] = n25; arr6[nA] = n26; arr7[nA] = true; nA++;
              arr5[nA] = n25 + rng.int(-5, 5); arr6[nA] = n26 + rng.int(-5, 5); arr7[nA] = true; nA++;   // Next(-5,6)
            }
          }
        }
        arr5[nA] = n16; arr6[nA] = n17; nA++;
        if (rng.int(0, 3) === 0) {                          // Next(4)==0 中柱摆动
          n16 = rng.int(0, 1) !== 0 ? n16 + 1 : n16 - 1;
          treeCell(n16, n17, false);
        }
        n17--;
        n18--;
      }
    }
    // ---- 根系（generateRoots=true：Legacy 入口座）----
    if (generateRoots) {
      for (let n = minL0; n <= minR0; n++) {
        let n27 = rng.int(1, 5);                            // Next(1,6)
        let n28 = j + 1;
        while (n27 > 0) {
          if (dgSolid(n, n28)) n27--;
          treeCell(n, n28, false);
          n28++;
        }
        const n29 = n28;
        const n30 = rng.int(2, wdt);                        // Next(2, num5+1)
        for (let c = 0; c < n30; c++) {
          n28 = n29;
          const n32 = Math.trunc((minL0 + minR0) / 2);
          let n33 = 0, n34 = 1;
          n33 = n >= n32 ? 1 : -1;
          if (n === n32 || (wdt > 6 && (n === n32 - 1 || n === n32 + 1))) n33 = 0;
          const n35 = n33;
          let n36 = n;
          n27 = rng.int(Math.trunc(wdt * 3.5), wdt * 6 - 1);
          while (n27 > 0) {
            n27--;
            n36 += n33;
            if (!st.inBounds(n36, n28)) continue;
            if (st.wall[st.idx(n36, n28)] !== 244) treeCell(n36, n28, false);
            n28 += n34;
            if (st.inBounds(n36, n28) && st.wall[st.idx(n36, n28)] !== 244) treeCell(n36, n28, false);
            if (st.inBounds(n36, n28 + 1) && st.flags[st.idx(n36, n28 + 1)] === 0) { n33 = 0; n34 = 1; }
            if (rng.int(0, 2) === 0) {                      // Next(3)==0 走向换挡
              n33 = n35 < 0 ? (n33 === 0 ? -1 : 0)
                : (n35 <= 0 ? rng.int(-1, 1) : (n33 === 0 ? 1 : 0));
            }
            if (rng.int(0, 2) === 0) n34 = n34 === 0 ? 1 : 0;
          }
        }
      }
    }
    // ---- 叶团（DU:1010 `if (!WorldGen.remixWorldGen)` 整段门——★IIIII84 刀①定罪：
    //   remx/remix 类世界（zenith/dontdigup）整段跳过；旧注释「支恒走」系对 :1013
    //   读漏 —— JS 曾无门恒跑 ⇒ 每 anchor 多耗 2-3 掷且涂 192 叶块，树区 ±74 掷
    //   与冠部 192 污染（地牢域掷流/内容双残差根源之一） ----
    if (!gs.seedFlags.remix) {
      for (let idx2 = 0; idx2 < nA; idx2++) {   // C#: num37 < num2（叶锚独立游标）
      let n38 = rng.int(5, 7);                              // Next(5,8)
      n38 = Math.trunc(n38 * (1.0 + wdt * 0.05));
      if (arr7[idx2]) n38 = rng.int(6, 11) + wdt;           // Next(6,12)+num5
      const ax = arr5[idx2]!, ay = arr6[idx2]!;
      const x0 = ax - n38 * 2, x1 = ax + n38 * 2, y0 = ay - n38 * 2, y1 = ay + n38 * 2;
      const n43 = 2.0 - rng.int(0, 4) * 0.1;                // 2.0 - Next(5)*0.1
      for (let xx = x0; xx <= x1; xx++) {
        for (let yy = y0; yy <= y1; yy++) {
          if (!st.inBounds(xx, yy)) continue;
          const k = st.idx(xx, yy);
          if (st.type[k] === TREE_WOOD) continue;           // type==191 continue
          if (arr7[idx2]) {
            const dx2 = ax - xx, dy2 = ay - yy;
            if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < n38 * 0.9) {
              chTile(k, TREE_LEAF, false);
              st.paint[k] = 28;
            }
          } else if (Math.abs(ax - xx) + Math.abs(ay - yy) * n43 < n38) {
            chTile(k, TREE_LEAF, false);
            st.paint[k] = 28;
          }
        }
      }
      }
    }
    makeTreePassage(j, attachmentY, wdt, minL0, minR0);
    flipGenSolid([48], true);           // Main.tileSolid[48]=true（DU:1056，passage 之后）
  }

  /** GrowDungeonTree_MakePassage（DU:1060-1149）：冠底 j-6 下行至 attachmentY 的竖井+
   *  活木墙廊道。C# 的 ref minimumLeft/Right 只在本函数内部演化且终值回滚（restore 快照），
   *  无外部消费面 → 传值即可。width=num5（walk 宽），用于 num7 加宽门（<=4 时 2 格）。 */
  function makeTreePassage(j: number, attachmentY: number, width: number, argL: number, argR: number): void {
    const GLASS_WALLS = new Set([21, 88, 89, 90, 91, 92, 241, 93, 243, 242]);   // WallID.Sets.Glass
    const isDWv = (v: number): boolean => v > 0 && DG_DUNGEON_WALLS.has(v);
    const snapL = argL, snapR = argR;
    let minLeft = argL, minRight = argR;
    const PROBE = 5;                    // num3
    rng.int(5, 15);                     // Next(5,16) 弃掷（DU:1075，结果不消费）
    let num4 = j - 6;
    let cnt = 0;                        // num5 局部（与外层 wdt 无关的同名遮蔽）
    let topFlag = true;                 // flag（首候选强制平台）
    for (;;) {
      num4++;
      if (num4 > attachmentY) break;
      const n6p = Math.trunc((minLeft + minRight) / 2);
      const n7s = (num4 > j && width <= 4) ? 2 : 1;
      for (let i2 = minLeft - n7s; i2 <= minRight + n7s; i2++) {
        if (i2 > n6p - 2 && i2 <= n6p + 1) {
          if (num4 > j - 4) {
            const at = (ax: number, ay: number): { ty: number; wl: number; idx: number } => {
              const idx0 = st.inBounds(ax, ay) ? st.idx(ax, ay) : -1;
              return idx0 >= 0
                ? { ty: st.type[idx0], wl: st.wall[idx0], idx: idx0 }
                : { ty: -1, wl: 0, idx: -1 };
            };
            const c0 = at(i2, num4);
            const u1 = at(i2, num4 - 1);
            const d1 = at(i2, num4 + 1);
            // 竖井芯带：只保平台(19)/椅15/织布机304/箱21/门10 族——★IIIII57 勘误：
            //  上述为原版 sheet id，st.type 存内部 id → 用 TILE_INTERNAL_BY_SHEET 映射。
            const keepSelf = c0.ty === PLATFORM || c0.ty === CHAIRS || c0.ty === LOOMV
              || c0.ty === CHEST || c0.ty === DOOR;
            const keepUp = u1.ty === CHAIRS || u1.ty === LOOMV || u1.ty === CHEST || u1.ty === DOOR;
            const keepDown = d1.ty === DOOR;
            if (!keepSelf && !keepUp && !keepDown && c0.idx >= 0) clearTileAndPaint(c0.idx);
            if (!isDWv(c0.wl) && c0.idx >= 0) st.wall[c0.idx] = 244;
            const cl = at(i2 - 1, num4);
            if (!isDWv(cl.wl) && (cl.wl > 0 || num4 >= ws) && cl.idx >= 0) st.wall[cl.idx] = 244;
            const cr = at(i2 + 1, num4);
            if (!isDWv(cr.wl) && (cr.wl > 0 || num4 >= ws) && cr.idx >= 0) st.wall[cr.idx] = 244;
            if (num4 === j) {
              const fl = at(i2, num4 + 1);
              if (fl.idx >= 0) clearTileAndPaint(fl.idx);
              placePlatformAt(fl.idx, 23);
            }
          }
        } else {
          const at = (ax: number, ay: number): { ty: number; wl: number; idx: number } => {
            const idx0 = st.inBounds(ax, ay) ? st.idx(ax, ay) : -1;
            return idx0 >= 0 ? { ty: st.type[idx0], wl: st.wall[idx0], idx: idx0 } : { ty: -1, wl: 0, idx: -1 };
          };
          const c0 = at(i2, num4);
          const cl = at(i2 - 1, num4);
          const cr = at(i2 + 1, num4);
          const keepAll = c0.ty === CHAIRS || c0.ty === LOOMV || c0.ty === CHEST || c0.ty === DOOR
            || cl.ty === DOOR || cr.ty === DOOR;
          if (!keepAll) {
            if (!isDWv(c0.wl) && c0.idx >= 0) {
              chTile(c0.idx, TREE_WOOD, false);       // type+active+slope-clear（此处无 paint）
            }
            if (cl.ty === CLAYV && cl.idx >= 0) st.type[cl.idx] = DIRTV;   // 粘土→土（vanilla .type=0=土，内部 id 换算——写裸 0 会变未登记幽灵）
            if (cr.ty === CLAYV && cr.idx >= 0) st.type[cr.idx] = DIRTV;
          }
          if (num4 <= j && num4 > j - 4 && i2 > minLeft - n7s && i2 <= minRight + n7s - 1 && c0.idx >= 0) {
            st.wall[c0.idx] = 244;
          }
        }
        // C# !isGeneratingOrLoadingWorld 内的 SquareTileFrame/SquareWallFrame——生成期恒跳过
      }
      cnt++;
      if (cnt < 6) continue;
      cnt = 0;
      let d8 = rng.int(0, 2);                         // Next(3)
      if (d8 === 0) d8 = -1;
      if (topFlag) d8 = 2;
      if (d8 === -1 && wallEq(minLeft - PROBE, num4, 244)) d8 = 1;
      else if (d8 === 1 && wallEq(minRight + PROBE, num4, 244)) d8 = -1;
      if (d8 === 2) {
        topFlag = false;
        let style = 23;
        let flag2 = false;
        for (const px2 of [minLeft, minLeft + 1, minLeft + 2]) {
          if (wallIdx(px2, num4 + 1) >= 0 && isDWv(st.wall[st.idx(px2, num4 + 1)])) { flag2 = true; break; }
        }
        if (!dgSolid(minLeft - 1, num4 + 1) && !dgSolid(minRight + 1, num4 + 1) && flag2) continue;
        for (let k = minLeft; k <= minRight; k++) {
          if (k > n6p - 2 && k <= n6p + 1) {
            if (!st.inBounds(k, num4 + 1)) continue;
            const fi = st.idx(k, num4 + 1);
            clearTileAndPaint(fi);
            placePlatformAt(fi, flag2 ? 6 : 23);
          }
        }
      } else {
        minLeft += d8;
        minRight += d8;
      }
    }
    minLeft = snapL; minRight = snapR;                 // ref 回滚（无外部消费）
    for (let l2 = minLeft; l2 <= minRight; l2++) {
      for (let m2 = j - 3; m2 <= j; m2++) {
        if (!st.inBounds(l2, m2)) continue;
        const ti = st.idx(l2, m2);
        clearTileAndPaint(ti);
        if (!isDWv(st.wall[ti]) && !GLASS_WALLS.has(st.wall[ti])) st.wall[ti] = 244;
      }
    }
  }
  // ---- makeTreePassage 小工具（闭包态 ws/inW 可用）----
  function wallIdx(x: number, y: number): number {
    return st.inBounds(x, y) ? st.idx(x, y) : -1;
  }
  function wallEq(x: number, y: number, v: number): boolean {
    const ix = wallIdx(x, y);
    return ix >= 0 && st.wall[ix] === v;
  }
  /** PlaceTile(k,l,19,...,-1,style)：静置平台写入（同 dgPlatforms 帧 = style*18） */
  function placePlatformAt(idxOrMinus: number, style: number): void {
    if (idxOrMinus < 0) return;
    const i2 = idxOrMinus;
    st.flags[i2] = 1; st.type[i2] = PLATFORM;
    st.slope[i2] = 0; st.half[i2] = 0; st.liquid[i2] = 0; st.liquidType[i2] = 0;
    st.frameX[i2] = 0; st.frameY[i2] = 18 * style;
  }


  // DungeonHall.CanPlaceTileAt（DungeonHall.cs:161）——普通世界：仅非地牢墙置砖
  function canPlaceTileAt(i: number): boolean {
    if (isDW(st.wall[i])) {
      if (st.flags[i]) {
        if (isDT(st.type[i])) return false;
        return st.type[i] !== crack;
      }
      return false;
    }
    return true;
  }
  // ================= LegacyDungeonLayoutProvider.LegacyDungeonLayout（:25-98）=================
  function dgLayout(steps: number): void {
    // ★XX 批（2026-08-18）：LegacyDungeonLayoutProvider.cs:27-31 precalc 起点漂移——
    //   posX=-10+entranceX+Next(20)（1 掷）、posY=entranceY+30。初始 bounds 由
    //   MakeDungeon 头（:348 SetBounds(x,y,x,y)）以改写后 dungeonLocation/y0 落定，
    //   provider 内不重置——原 dgLayout 首行 bounds.set(posX,posY) 对 Legacy 与调用
    //   点同值冗余、precalc 时会错抹锚点，已收口到调用侧（:2847 bounds.set(x0,y0)）。
    if (precalcOK) { posX = -10 + entX + rn(20); posY = entY + 30; }
    // ★LegacyDungeonLayoutProvider.cs:37/:42——起始房之前先耗两颗 settings.RandomSeed
    //  (hall-settings 与 room-settings 对象的种子;本仓 settings 复用单流,掷而不用。
    //  曾缺失→起始房种子前移 2 颗,全地牢分叉;oracle 对账时揪出)
    raw(); raw();
    dgRoom({ seed: raw(), x: posX, y: posY, start: true, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
      let roomDelay = 5;
    let s = steps;
    // 对账插桩(dormant)：__dgLayoutTrace 存在时逐迭代记掷数/门值/roomDelay（离群种子
    // dungeonL 微差定位用；零开销常驻，同 __dgHallTrace 惯例）
    const LT = (globalThis as { __dgLayoutTrace?: Array<Record<string, number>> }).__dgLayoutTrace;
    const ltIt = LT ? LT.length : 0;
    let ltRolls0 = 0;
    if (LT) ltRolls0 = dgMainRolls;
    if (LT) LT.push({ it: -1, rolls: ltRolls0, gate: -1, rd: 5, branch: -1 });
    while (s > 0) {
      bounds.upd(posX, posY);
      s--;
      try {
        const it53 = num - s;
      } catch { /* probe */ }
      if (roomDelay > 0) roomDelay--;
      // ★LegacyDungeonLayoutProvider.cs:61 `(roomDelay == 0) & (Next(3) == 0)` 是
      //  非短路 &——roomDelay>0 时也**照耗**一颗 Next(3)(曾 && 短路少耗;oracle
      //  同款偏差已在 caves-oracle.cs 同步修正)。TS 禁 bool &,先掷后判语义等价。
      //  入口循环(DungeonCrawler.cs:426)才是 && 短路,勿混
      const roomRoll = rn(3);
      let ltBranch = 0;
      if (roomDelay === 0 && roomRoll === 0) {
        roomDelay = 5;
        ltBranch = 1;
        if (rn(2) === 0) {
          const sx = posX, sy = posY;
          dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
          if (rn(2) === 0) { ltBranch = 3; dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 }); }
          dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
          posX = sx; posY = sy;
        } else {
          ltBranch = 2;
          dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
        }
      } else {
        dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
      }
      if (LT) LT.push({ it: ltIt + (steps - s) - 1, rolls: dgMainRolls - ltRolls0, gate: roomRoll, rd: roomDelay, branch: ltBranch });
    }
    dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
  }
  // ================= LegacyDungeonRoom.LegacyRoom（:104-304）=================
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function dgRoom(s: any): void {
    const hr = dgUR(s.seed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const hrd = (): number => hr.nextDouble();
    const num2 = Math.trunc(15.0) + hri(0, 14);                 // 15 + Next(15)
    // ★III 终清（2026-08-18）：LegacyDungeonRoom.cs:135-137 原文是 float 算术
    //   `(double)((float)Next(-10,11) * 0.1f)`——曾按 double 转录，速度累计 ~1e-8 漂移
    //   在 (int)(px±…) 盒边上翻转 → R0 内 (445,567)/(425,586) 残砖（#32 布局债）。
    //   Math.fround(k*fround(0.1)) = C# (float)(k*0.1f)（双精度积精确、单次舍入同 f32 乘）。
    let vx = Math.fround(hri(-10, 10) * Math.fround(0.1)), vy = Math.fround(hri(-10, 10) * Math.fround(0.1));
    if (vx === 0 && vy === 0) {
      if (hrn(2) === 0) vx = hrn(2) !== 0 ? 1 : -1;
      else vy = hrn(2) !== 0 ? 1 : -1;
    }
    let px = s.x + 0.0, py = s.y - num2 / 2.0;
    let num4 = Math.trunc(10.0) + hri(0, 9);                    // 10 + Next(10)
    const num5 = num2, num6 = 0.5;
    const rm: DRoom = { seed: s.seed, x: s.x, y: s.y, start: s.start, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 };
    rm.inner.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    rm.outer.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    rooms.push(rm);
    while (num4 > 0) {
      num4--;
      const x0 = Math.max(0, Math.min(w - 1, Math.trunc(px - num2 * 0.800000011920929 - 5.0)));
      const x1 = Math.max(0, Math.min(w - 1, Math.trunc(px + num2 * 0.800000011920929 + 5.0)));
      const y0 = Math.max(0, Math.min(h - 1, Math.trunc(py - num2 * 0.800000011920929 - 5.0)));
      const y1 = Math.max(0, Math.min(h - 1, Math.trunc(py + num2 * 0.800000011920929 + 5.0)));
      bounds.upd(x0, y0, x1 - 1, y1 - 1);
      rm.outer.upd(x0, y0, x1 - 1, y1 - 1);
      const ix0 = Math.max(0, Math.min(w - 1, Math.trunc(px - num2 * num6)));
      const ix1 = Math.max(0, Math.min(w - 1, Math.trunc(px + num2 * num6)));
      const iy0 = Math.max(0, Math.min(h - 1, Math.trunc(py - num2 * num6)));
      const iy1 = Math.max(0, Math.min(h - 1, Math.trunc(py + num2 * num6)));
      rm.inner.upd(ix0, iy0, ix1 - 1, iy1 - 1);
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = st.idx(x, y);
          st.liquid[i] = 0;
          // ★HHHHHHH（2026-08-24）③ 房砖环缘 resetTile 计算化（LegacyDungeonRoom.cs
          //  :263-268）：1456 恒 resetTile:true（ChangeTileType→ClearEverything=墙清零）,
          //  1457=内域判定（k≥num7+1&&k<num8-1&&l≥num9+1&&l<num10-1）——环缘格保留
          //  既有墙（walls 通道真实差,GGG 三方 ONLY-oracle ③④ 墙体）。门 1457
          //  CanPlaceTileAt（DungeonRoom.cs:365）=wall350 拒+tier 判定,普通世界 tier
          //  支与 1456 单行公式等价（dungeon-1457 批 B6/B19 全 id 断言在案）→ 门补
          //  wall350 卫士即可。曾恒 true → 环缘墙被抹。
          const resetTile = x >= x0 + 1 && x < x1 - 1 && y >= y0 + 1 && y < y1 - 1;
          if (st.wall[i] !== 350 && !isDW(st.wall[i])) chTile(i, brick, resetTile);
        }
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) {
          // 1457 内域墙写加 CanRemoveTileAt 门（DungeonRoom.cs:374,wall350 拒——
          //  普通世界地牢域无 350=零行为差,转录保真）
          const wi = st.idx(x, y);
          if (st.wall[wi] !== 350) chWall(wi, wall, false);
        }
      }
      for (let x = ix0; x < ix1; x++) {
        for (let y = iy0; y < iy1; y++) chWall(st.idx(x, y), wall, true);
      }
      px += vx; py += vy;
      // ★III 终清：:152-155 原文 float——`(double)((float)Next(-10,11) * 0.05f)`
      vx = Math.max(-1, Math.min(1, vx + Math.fround(hri(-10, 10) * Math.fround(0.05))));
      vy = Math.max(-1, Math.min(1, vy + Math.fround(hri(-10, 10) * Math.fround(0.05))));
    }
    rm.ex = px; rm.ey = py; rm.strength = Math.trunc(num5);
    // ★2026-08-16 审计：LegacyDungeonRoom **不回写** generatingDungeonPositionX/Y
    //   （1456 全 Rooms 目录零赋值，仅 Halls 两处：LegacyDungeonHall.cs:862 /
    //   LegacyEntranceDungeonHall.cs:367；1405 DungeonRoom 同样只记 dRoomX 数组）。
    //   曾 `posX=trunc(px)` 使房间后位置瞬移到房尾——起始房后首走廊起点、循环
    //   room-only 分支后续走廊全部错位（oracle DgRoom 同款偏差，转录时须同步摘除）。
  }

  // ================= LegacyDungeonHall.LegacyHall（Halls/LegacyDungeonHall.cs:65-876）=================
  function dgHall(s: DHall): void {
    const hr = dgUR(s.seed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const hrd = (): number => hr.nextDouble();
    let vx = 0, vy = 0;
    let nnum = 4 + hrn(2);                                      // (int)(4*hallStrengthScalar)+Next(2)
    let px = posX + 0.0, py = posY + 0.0;
    const sx = px, sy = py;
    let num2 = 1;
    let num3 = 35 + hrn(45);                                    // (int)(35*hallStepScalar)+Next(45)
    const dangerous = hrd() <= 0.166;                            // CrackedBrickChance（DungeonHallSettings.cs:15）
    if (s.forceX) { num3 += 20; lastHallX = 0; lastHallY = 0; }
    else if (hrn(5) === 0) { nnum *= 2; num3 = Math.trunc(num3 / 2); }
    const steps0 = num3;
    const num4 = nnum;
    const num5 = 0.5;                                           // hallInteriorToExteriorRatio
    let flag2 = false;                                          // Zigzag
    const num6 = (h - 200) - 100;                               // UnderworldLayer-100*max(scalars)
    let first = true, done = false;
    let z2x = 0, z2y = 0;
    while (!done) {
      let horiz = false;
      if (first && !s.forceX) {
        let f7 = true, f8 = true, f9 = true, f10 = true, f11 = false;
        const n7 = num3;
        let f12 = false;
        for (let y = Math.trunc(py); y > Math.trunc(py) - n7; y--) {
          if (!inW(Math.trunc(px), y, 50)) { f7 = false; break; }
          if (isDW(wallAt(Math.trunc(px), y))) { if (f12) { f7 = false; break; } } else f12 = true;
        }
        f12 = false;
        for (let y = Math.trunc(py); y < Math.trunc(py) + n7; y++) {
          if (!inW(Math.trunc(px), y, 50)) { f8 = false; break; }
          if (y >= num6) { f11 = true; f8 = false; break; }
          if (isDW(wallAt(Math.trunc(px), y))) { if (f12) { f8 = false; break; } } else f12 = true;
        }
        f12 = false;
        for (let x = Math.trunc(px); x > Math.trunc(px) - n7; x--) {
          if (!inW(x, Math.trunc(py), 50)) { f9 = false; break; }
          if (isDW(wallAt(x, Math.trunc(py)))) { if (f12) { f9 = false; break; } } else f12 = true;
        }
        f12 = false;
        for (let x = Math.trunc(px); x < Math.trunc(px) + n7; x++) {
          if (!inW(x, Math.trunc(py), 50)) { f10 = false; break; }
          if (isDW(wallAt(x, Math.trunc(py)))) { if (f12) { f10 = false; break; } } else f12 = true;
        }
        if (!f9 && !f10 && !f7 && !f8) {
          num2 = hrn(2) !== 0 ? 1 : -1;
          if (hrn(2) === 0) horiz = true;
          if (num2 === 1 && !horiz && f11) {
            num2 = hrn(2) === 0 ? 1 : -1;
            horiz = true;
          }
        } else {
          let n10 = 0, n11 = 100;
          do {
            n11--;
            if (n11 <= 0) { n10 = 0; break; }
            n10 = hrn(4);
            if (n10 === 1 && f11) n10 = hrn(2) === 0 ? 2 : 3;
          } while (!((n10 === 0 && f7) || (n10 === 1 && f8) || (n10 === 2 && f9) || (n10 === 3 && f10)));
          if (n10 === 0) num2 = -1;
          else if (n10 === 1) num2 = 1;
          else { horiz = true; num2 = n10 !== 2 ? 1 : -1; }
        }
      } else {
        num2 = hrn(2) !== 0 ? 1 : -1;
        if (hrn(2) === 0) horiz = true;
        if (num2 === 1 && py + num3 >= num6) {
          num2 = hrn(2) !== 0 ? 1 : -1;
          horiz = true;
        }
      }
      first = false;
      if (s.forceX) horiz = true;
      if (horiz) {
        z2x = -num2; z2y = 0;
        vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else {
        nnum++;
        vy = num2; vx = 0;
        z2x = 0; z2y = -num2;
        if (hrd() <= 0.66) {                                    // ZigzagChance=0.66
          flag2 = true;
          vx = hrn(2) === 0 ? hri(10, 19) * 0.1 : -hri(10, 19) * 0.1;
        } else if (hrn(2) === 0) {
          vx = hrn(2) === 0 ? hri(20, 39) * 0.01 : -hri(20, 39) * 0.01;
        } else num3 = Math.trunc(num3 / 2);
      }
      if (lastHallX !== z2x || lastHallY !== z2y) done = true;
    }
    const n13 = w * 0.25, n14 = w * 0.75;
    // ★IIIII70 REMIX（1457 LegacyDungeonHall.cs:518-523）：remix 下 flag13 的下压阈值
    //   从 rockLayer+100 换成 Main.worldSurface+100——remix「反向体」里世界 content
    //   域浅表化（worldSurface=337/rockLevel=769 @ seed 1138154190），未接此支时走廊
    //   一直被压向下越带，remix 地牢布局整体改向（mile8 #32 T41 大域首差根因之一）。
    const f13 = py < (gs.seedFlags.remix ? ws : rock) + 100.0;
    const f14 = px < w / 2 && px > n13;
    const f15 = px > w / 2 && px < n14;
    // ★D2 残留偏差（2026-08-13 复核）：原版该 else-if 链只写 zero=(num2,0)/zero=(0,num2)
    //   （LegacyDungeonHall.cs:524-673，zero2 不重算），下游 startDirection/lastDungeonHall/
    //   走廊截停判定全部取 zero（正向）。本仓 sd=-z2 约定下水平四支必须写 z2x=-num2；
    //   旧代码写 z2x=num2 使 sdX 反号→"贴边强制反向"走廊被 sdX>0&&px>w-100 当帧截停成
    //   1 步残段，且 lastDungeonHall 存反号破坏下条走廊防回头（:501 比对）。
    if (!s.forceX) {
      if (px > w - 200) {
        num2 = -1; z2x = -num2; z2y = 0; vx = num2; vy = 0;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (px < 200.0) {
        num2 = 1; z2x = -num2; z2y = 0; vx = num2; vy = 0;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (py >= num6) {
        num2 = -1; nnum++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
        // ★III 终清：:574-578 原文 float——`(double)((float)Next(20,50) * 0.01f)`
        if (hrn(2) === 0) vx = hrn(2) === 0 ? Math.fround(hri(20, 49) * Math.fround(0.01)) : -Math.fround(hri(20, 49) * Math.fround(0.01));
      } else if (py < 200.0) {
        num2 = 1; nnum++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
        // ★III 终清：:594-598 原文 float（曾 double 转录致 H6 带边 -1 格→(417,748) 残砖）
        if (hrn(2) === 0) vx = hrn(2) === 0 ? Math.fround(hri(20, 49) * Math.fround(0.01)) : -Math.fround(hri(20, 49) * Math.fround(0.01));
      } else if (f13) {
        num2 = 1; nnum++; z2x = 0; z2y = -num2; vx = 0; vy = num2;
        if (hrd() <= 0.66) {
          flag2 = true;
          vx = hrn(2) === 0 ? hri(10, 19) * 0.1 : -hri(10, 19) * 0.1;
        } else if (hrn(2) === 0) {
          vx = hrn(2) === 0 ? hri(20, 49) * 0.01 : hri(20, 49) * 0.01;   // ★反编译原样：else 同号（:628-633）
        }
      } else if (f14) {
        num2 = -1; z2y = 0; z2x = -num2; vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      } else if (f15) {
        num2 = 1; z2y = 0; z2x = -num2; vy = 0; vx = num2;
        if (hrn(3) === 0) vy = hrn(2) === 0 ? -0.20000000298023224 : 0.20000000298023224;
      }
    }
    const sdX = -z2x, sdY = -z2y;
    lastHallX = sdX; lastHallY = sdY;
    if (Math.abs(vx) > Math.abs(vy) && hrn(3) !== 0) {
      // ★原版是**逐运算 float32** 算术(LegacyDungeonHall.cs:680 `(float)num4 *
      //  (((float)Next(110,150))*0.01f)`)——C# 每个 float*float 各自舍入到 float,
      //  非"double 乘完再舍一次"。曾单层 fround 致 trunc 边界偶发翻 1(轨迹对账
      //  H#30 num 6↔7 实锤);现逐二元运算 fround 复刻(oracle :4551 同款)
      nnum = Math.trunc(Math.fround(Math.fround(num4) * Math.fround(Math.fround(hri(110, 149)) * Math.fround(0.01))));
    }
    const hb = new DBnd(w, h);
    hb.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    const hall: DHall = { seed: s.seed, generated: true, forceX: s.forceX, isEntrance: false, bounds: hb, sx: sx, sy: sy, ex: 0, ey: 0, sdx: sdX, sdy: sdY, edx: sdX, edy: sdY };
    halls.push(hall);
    const roomsArea = roomsInSpots(px, py, px + vx * num3, py + vy * num3, Math.trunc(num3 / 2 + nnum));
    // 对账插桩(dormant):globalThis.__dgHallTrace 存在时逐步记录,与 caves-oracle.cs 的
    // DG_TRACE 输出逐行 diff(dungeonL 微差定位用,零开销常驻)
    const TRACE = (globalThis as { __dgHallTrace?: Array<Record<string, number>> }).__dgHallTrace;
    const hIdx = TRACE ? TRACE.length : -1;
    if (TRACE) TRACE.push({ h: 1, idx: hIdx, seed: s.seed, sx, sy, num2, vx, vy, num: nnum, steps: num3, zig: flag2 ? 1 : 0, sdX, sdY });
    let cnt = 0;
    while (num3 > 0) {
      cnt++;
      if (sdX > 0 && px > w - 100) num3 = 0;
      else if (sdX < 0 && px < 100) num3 = 0;
      else if (sdY > 0 && py >= num6) num3 = 0;
      else if (sdY < 0 && py < 100) num3 = 0;
      // ★IIIII70 REMIX（1457 LegacyDungeonHall.cs:720-727）：上爬走廊截停界 remix 支
      //   =(Main.rockLayer+Main.worldSurface)/2（普通支 rockLayer+50 在后）——remix
      //   地牢爬升到中带即止，是「反向体」布局的第二个门。
      else if (gs.seedFlags.remix && sdY < 0 && py < (rock + ws) / 2.0) num3 = 0;
      else if (!gs.seedFlags.remix && sdY < 0 && py < rock + 50.0) num3 = 0;
      num3--;
      const x0 = Math.max(0, Math.min(w - 1, Math.trunc(px - nnum - 4.0 - hrn(6))));
      const x1 = Math.max(0, Math.min(w - 1, Math.trunc(px + nnum + 4.0 + hrn(6))));
      const y0 = Math.max(0, Math.min(h - 1, Math.trunc(py - nnum - 4.0 - hrn(6))));
      const y1 = Math.max(0, Math.min(h - 1, Math.trunc(py + nnum + 4.0 + hrn(6))));
      bounds.upd(x0, y0, x1, y1);
      hb.upd(x0, y0, x1, y1);
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          const f16 = p !== 1;
          st.liquid[i] = 0;
          // ★HHHHHHH（2026-08-24）④ 廊砖环缘 resetTile 计算化（LegacyDungeonHall.cs
          //  :756-759）——与 ③ 同语义：1456 恒 true,1457=内域判定,环缘格墙保留。
          const resetTile = x >= x0 + 1 && x < x1 - 1 && y >= y0 + 1 && y < y1 - 1;
          if (f16 && y <= h - 200 + 7 && canPlaceTileAt(i)) chTile(i, brick, resetTile);
        }
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) {
          if (y >= h - 200 + 7) continue;
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          let f17 = true;
          if (p === 2 && isDW(st.wall[i])) f17 = false;
          if (f17) chWall(i, wall, false);
        }
      }
      let n21 = 0;
      if (vy === 0 && hrn(nnum + 1) === 0) n21 = hri(1, 2);
      else if (vx === 0 && hrn(nnum - 1) === 0) n21 = hri(1, 2);
      else if (hrn(nnum * 3) === 0) n21 = hri(1, 2);
      if (TRACE) TRACE.push({ s: 1, idx: hIdx, cnt, px: +px.toFixed(3), py: +py.toFixed(3), num: nnum, n21, x0, x1, y0, y1, left: num3 });
      const kx0 = Math.max(0, Math.min(w - 1, Math.trunc(px - nnum * num5 - n21)));
      const kx1 = Math.max(0, Math.min(w - 1, Math.trunc(px + nnum * num5 + n21)));
      const ky0 = Math.max(0, Math.min(h - 1, Math.trunc(py - nnum * num5 - n21)));
      const ky1 = Math.max(0, Math.min(h - 1, Math.trunc(py + nnum * num5 + n21)));
      for (let x = kx0; x < kx1; x++) {
        for (let y = ky0; y < ky1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          const f18 = p !== 1;
          let f19 = true;
          if (p === 2 && isDW(st.wall[i])) f19 = false;
          if (dangerous) {
            if ((st.flags[i] || !isDW(st.wall[i])) && y < h - 200) {
              st.flags[i] = 0;
              st.slope[i] = 0; st.half[i] = 0;   // ClearTile()（LDH:820 清坡+半砖，f18=false 支也清）
              if (f18) chTile(i, crack, false);
            }
          } else { st.flags[i] = 0; st.slope[i] = 0; st.half[i] = 0; }   // ClearTile()（LDH:830）
          if (f19 && y < h - 200) chWall(i, wall, false);
        }
      }
      px += vx; py += vy;
      if (flag2 && cnt > hri(10, 19)) { cnt = 0; vx = -vx; }
    }
    posX = Math.trunc(px); posY = Math.trunc(py);
    hall.ex = px; hall.ey = py;
  }

  // ============ LegacyEntranceDungeonHall.LegacyHall（:23-380，UsePrecalculatedEntrance=false）============
  function dgEntHall(seed: number): void {
    const hr = dgUR(seed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    let px = posX + 0.0, py = posY + 0.0;
    const num = hri(5, 8);
    // ★2026-08-16 审计：C# 掷序 num4=Next(10,30) 在 :136（startPosition 之后、
    //   方向掷段 :148-158 **之前**）——原 JS/oracle 把它挪到了方向掷后，种子流
    //   全体错位（strength 吃了方向骰、方向骰吃 steps 骰）。归位原版序。
    const steps = hri(10, 29);
    let dir = px <= topX ? 1 : -1;
    if (px > w - 400) dir = -1;
    else if (px < 400) dir = 1;
    let vx = dir + 0.0, vy = -1.0;
    // ★III 终清：LegacyEntranceDungeonHall.cs:150/154 原文 float——
    //   `val2.X *= 1f + (float)Next(0,200)*0.01f` / `*= (float)Next(50,76)*0.01f`
    if (hrn(3) !== 0) vx *= Math.fround(1 + Math.fround(hri(0, 199) * Math.fround(0.01)));
    else if (hrn(3) === 0) vx *= Math.fround(hri(50, 75) * Math.fround(0.01));
    else if (hrn(6) === 0) vy *= 2.0;
    if (skewed) {
      if (posX < w / 2 && vx < 0 && vx < -0.5) vx = 0.5;
      if (posX > w / 2 && vx > 0 && vx > 0.5) vx = -0.5;
    } else {
      if (posX < w / 2 && vx < -0.5) vx = -0.5;
      if (posX > w / 2 && vx > 0.5) vx = 0.5;
    }
    // ★IIIII21（LegacyEntranceDungeonHall.cs:182-186）：drunk/noSurface=入口廊方向
    //   反转——`num3 *= -1; val2.X *= -1.0`（hall 终态 Direction 与行进向量同翻；
    //   本仓 hall.Direction 无消费面，翻转只作用 vx；普通世界零扰动）。
    if (gs.seedFlags.drunkWorld || gs.seedFlags.noSurface) {
      dir = (dir === 1 ? -1 : 1);
      vx = -vx;
    }
    const num5 = 0.5;
    const n6 = 30;
    const hb = new DBnd(w, h);
    hb.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    const hall: DHall = { seed, generated: true, forceX: false, isEntrance: true, bounds: hb, sx: px, sy: py, ex: 0, ey: 0, sdx: vx, sdy: vy, edx: vx, edy: vy };
    halls.push(hall);
    const roomsArea = roomsInSpots(px, py, px + vx * steps, py + vy * steps, Math.trunc(steps / 2 + num));
    let num4 = steps;
    while (num4 > 0) {
      num4--;
      if (!inW(Math.trunc(px), Math.trunc(py), n6 + 5)) break;
      const x0 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px - num - 4.0 - hrn(6))));
      const x1 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px + num + 4.0 + hrn(6))));
      const y0 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py - num - 4.0)));
      const y1 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py + num + 4.0 + hrn(6))));
      bounds.upd(x0, y0, x1, y1);
      hb.upd(x0, y0, x1, y1);
      const n13 = px > w / 2 ? -1 : 1;
      const n14 = Math.trunc(px + s1x * 0.6 * n13 + s2x * n13);
      const n15 = Math.trunc(s2y * 0.5);
      if (py < ws - 5.0) {
        const wy = Math.trunc(py - num - 6.0 + n15);
        const open = inW(n14, wy, 0) && wallAt(n14, wy) === 0
          && inW(n14, wy - 1, 0) && wallAt(n14, wy - 1) === 0
          && inW(n14, wy - 2, 0) && wallAt(n14, wy - 2) === 0;
        if (open) {
          entOnSurface = true;
          tileRunner(st, rng, gs, n14, wy, { strength: hri(25, 34), steps: hri(10, 19), type: -1, speedX: 0, speedY: -1 });
        }
      }
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          const f2 = p !== 1;
          st.liquid[i] = 0;
          if (f2 && canPlaceTileAt(i)) chTile(i, brick, true);
        }
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          let f3 = true;
          if (p === 2 && isDW(st.wall[i])) f3 = false;
          if (f3) chWall(i, wall, false);
        }
      }
      let n16 = 0;
      if (hrn(num) === 0) n16 = hri(1, 2);
      const kx0 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px - num * num5 - n16)));
      const kx1 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px + num * num5 + n16)));
      const ky0 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py - num * num5 - n16)));
      const ky1 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py + num * num5 + n16)));
      for (let x = kx0; x < kx1; x++) {
        for (let y = ky0; y < ky1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          let f4 = true;
          if (p === 2 && isDW(st.wall[i])) f4 = false;
          st.flags[i] = 0;
          st.slope[i] = 0; st.half[i] = 0;       // ClearTile()（LEDH:348 内挖——清坡+半砖）
          if (f4) chWall(i, wall, false);
        }
      }
      if (entOnSurface) num4 = 0;
      px += vx; py += vy;
      if (py < ws) vy *= 0.9800000190734863;
    }
    posX = Math.trunc(px); posY = Math.trunc(py);
    hall.ex = px; hall.ey = py;
  }

  // ============ LegacyDungeonEntrance.LegacyEntrance（Entrances/LegacyDungeonEntrance.cs:31-619）============
  function dgEntrance(seed: number, preSeed: number): void {
    const hr = dgUR(preSeed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const dgEntProbe = typeof process !== 'undefined' && (__swProcessEnv ?? {})?.DG_ENT_PROBE != null;   // 诊断钩：入口 rr 掷序对拍
    if (dgEntProbe) {
      const pv = new UnifiedRandom(preSeed);
      const pdraws: number[] = [];
      for (let q = 0; q < 12; q++) pdraws.push(pv.next());
      console.log(`DGE-PRE preSeed=${preSeed} draws12=${pdraws.join(',')}`);
    }
    const i = posX, j = posY;
    for (let x = i - 60; x < i + 60; x++) {
      for (let y = j - 60; y < j + 60; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0; st.liquidType[ti] = 0;
      }
    }
    let cx = i + 0.0, cy = j - s1y / 2.0;
    bounds.topSet(Math.trunc(cy));
    let num2 = i > w / 2 ? -1 : 1;
    // ★IIIII21（LegacyDungeonEntrance.cs:114-117）：drunk/getGood 入口朝向翻转
    //   （num2 *= -1，作用于墙簇垛口侧/台阶方向/门洞内半边全部下游）。
    if (gs.seedFlags.drunkWorld || gs.seedFlags.getGoodWorld) num2 *= -1;
    entBounds.set(Math.trunc(cx), Math.trunc(cy), Math.trunc(cx), Math.trunc(cy));
    entExists = true;    const solidBox = (x0: number, y0: number, x1: number, y1: number, inner: boolean): void => {
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (st.wall[ti] !== wall) {
            st.wall[ti] = 0;
            if (inner && x > x0 + 1 && x < x1 - 2 && y > y0 + 1 && y < y1 - 2) st.wall[ti] = wall;
            chTile(ti, brick, false);
          }
        }
      }
    };
    const fillIfNotDW = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (!isDW(st.wall[ti])) chTile(ti, brick, false);
        }
      }
    };
    const clampX = (v: number): number => Math.max(0, Math.min(w - 1, v));
    const clampY = (v: number): number => Math.max(0, Math.min(h - 1, v));
    let n3 = clampX(Math.trunc(cx - s1x * 0.6000000238418579 - hri(2, 4)));
    let n4 = clampX(Math.trunc(cx + s1x * 0.6000000238418579 + hri(2, 4)));
    let n5 = clampY(Math.trunc(cy - s1y * 0.6000000238418579 - hri(2, 4)));
    let n6 = clampY(Math.trunc(cy + s1y * 0.6000000238418579 + hri(8, 15)));
    if (dgEntProbe) console.log(`DGE i=${i} j=${j} cx=${cx.toFixed(1)} cy=${cy.toFixed(1)} s1x=${s1x} s1y=${s1y} s2x=${s2x} s2y=${s2y} n3=${n3} n4=${n4} n5=${n5} n6=${n6}`);
    entBounds.upd(n3, n5, n4, n6);
    solidBox(n3, n5, n4, n6, true);
    // 垛口（左/右）
    {
      const a0 = clampX(n3);
      const a1 = clampX(n3 + 5 + hrn(4));
      const b0 = clampY(n5 - 3 - hrn(3));
      if (dgEntProbe) console.log(`DGE-BAT a1=${a1} b0=${b0} (n5=${n5})`);
      entBounds.upd(a0, b0, a1, n5);
      fillIfNotDW(a0, b0, a1, n5);
      const c0 = clampX(n4 - 5 - hrn(4));
      const c1 = clampX(n4);
      const d0 = clampY(n5 - 3 - hrn(3));
      if (dgEntProbe) console.log(`DGE-BAT2 c0=${c0} d0=${d0}`);
      entBounds.upd(c0, d0, c1, n5);
      fillIfNotDW(c0, d0, c1, n5);
    }
    // 顶齿（周期 num15 刷 num15 跳）
    {
      const n15 = 2 + hrn(4);
      const n16 = 1 + hrn(2);
      if (dgEntProbe) console.log(`DGE-TEETH n15=${n15} n16=${n16} n18=${clampY(n5 - n16)}`);
      let n17 = 0;
      const n18 = clampY(n5 - n16);
      bounds.upd(n3, n18, n4, n5);
      for (let x = n3; x < n4; x++) {
        for (let y = n18; y < n5; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (!isDW(st.wall[ti])) chTile(ti, brick, false);
        }
        n17++;
        if (n17 >= n15) { x += n15; n17 = 0; }
      }
    }
    // 下延到 worldSurface（cs:215-251：TileIsInStyle 判定 + 潜在带跳过）
    for (let x = n3; x < n4; x++) {
      for (let y = n5; y < ws; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0;
        if (potContains(x, y - 5)) continue;
        const f1 = st.flags[ti] !== 0 && typAt(x, y) !== brick && typAt(x, y) !== crack;
        const f2 = st.wall[ti] !== wall;
        const f3 = isDW(st.wall[ti]);
        if ((st.flags[ti] !== 0 && f1) || !f3) {
          chTile(ti, brick, false);
          if (x > n3 && x < n4 - 1) st.wall[ti] = wall;
        } else if (f2 && x > n3 && x < n4 - 1) st.wall[ti] = wall;
      }
    }
    // 0.5 框塔内厅
    {
      const a0 = clampX(Math.trunc(cx - s1x * 0.5));
      const a1 = clampX(Math.trunc(cx + s1x * 0.5));
      const b0 = clampY(Math.trunc(cy - s1y * 0.5));
      const b1 = clampY(Math.trunc(cy + s1y * 0.5));
      entBounds.upd(a0, b0, a1, b1);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0; st.flags[ti] = 0; st.wall[ti] = wall;
        }
      }
    }
    // 门厅平台候选（:269-303）
    // ★Z 批修复 2：vanilla :270-275 的 0.5 框把 num5/num6 重赋为 ±S1Y*0.5，:277
    //   num27=num6 取的是该 0.5 框底（=zero.Y+S1Y*0.5≈入口 j），非首段城堡盒的
    //   num6（zero.Y+S1Y*0.6+Next(8,16)）。曾沿用旧 n6 → 平台行落到 251..263
    //   （实测 257）而 vanilla 在 611..622,249。
    {
      let n26 = Math.trunc(cx);
      const n27 = clampY(Math.trunc(cy + s1y * 0.5));   // = 0.5 框底（:275 num6）
      for (let k = 0; k < 20; k++) {
        n26 = Math.trunc(cx) - k;
        if (n26 <= 0) break;
        if (actAt(n26, n27) === 0 && isDW(wallAt(n26, n27))) { platData.push({ x: n26, y: n27, hall: false, hf: 5 }); break; }
        n26 = Math.trunc(cx) + k;
        if (n26 >= w) break;
        if (actAt(n26, n27) === 0 && isDW(wallAt(n26, n27))) { platData.push({ x: n26, y: n27, hall: false, hf: 5 }); break; }
      }
    }
    // —— 第二段（外门厅）——
    cx += s1x * 0.6000000238418579 * num2;
    cy += s1y * 0.5;
    const sx2 = s2x, sy2 = s2y;
    cx += sx2 * 0.550000011920929 * num2;
    cy -= sy2 * 0.5;
    n3 = clampX(Math.trunc(cx - sx2 * 0.6000000238418579 - hri(1, 2)));    n4 = clampX(Math.trunc(cx + sx2 * 0.6000000238418579 + hri(1, 2)));
    n5 = clampY(Math.trunc(cy - sy2 * 0.6000000238418579 - hri(1, 2)));
    n6 = clampY(Math.trunc(cy + sy2 * 0.6000000238418579 + hri(6, 15)));
    entBounds.upd(n3, n5, n4, n6);
    for (let x = n3; x < n4; x++) {
      for (let y = n5; y < n6; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        if (st.flags[ti] !== 0 && st.type[ti] === brick) continue;
        st.liquid[ti] = 0;
        let f4 = true;
        if (num2 < 0) { if (x < cx - sx2 * 0.5) f4 = false; }
        else if (x > cx + sx2 * 0.5 - 1.0) f4 = false;
        if (f4) { st.wall[ti] = 0; chTile(ti, brick, false); }
      }
    }
    entBounds.upd(n3, n5, n4, Math.trunc(ws));
    for (let x = n3; x < n4; x++) {
      for (let y = n6; y < ws; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0;
        if (potContains(x, y - 5)) continue;
        const f5 = st.flags[ti] !== 0 && st.type[ti] !== brick && st.type[ti] !== crack;
        const f6 = st.wall[ti] !== wall;
        const f7 = isDW(st.wall[ti]);
        if ((st.flags[ti] !== 0 && f5) || !f7) {
          chTile(ti, brick, false);
          if (x > n3 && x < n4 - 1) st.wall[ti] = wall;
        } else if (f6 && x > n3 && x < n4 - 1) st.wall[ti] = wall;
      }
    }
    // 第二段垛口+顶齿
    const m7 = clampX(Math.trunc(cx - sx2 * 0.5));
    let m8 = m7;
    if (num2 < 0) m8 = clampX(m8 + 1);
    const e1 = clampX(m8 + 5 + hrn(4));
    const f1v = clampY(n5 - 3 - hrn(3));
    entBounds.upd(m8, f1v, e1, n5);
    fillIfNotDW(m8, f1v, e1, n5);
    const g0 = clampX(clampX(Math.trunc(cx + sx2 * 0.5)) - 5 - hrn(4));
    const g1 = clampX(Math.trunc(cx + sx2 * 0.5));
    const h0 = clampY(n5 - 3 - hrn(3));
    entBounds.upd(g0, h0, g1, n5);
    fillIfNotDW(g0, h0, g1, n5);
    const n4b = num2 < 0 ? g1 + 1 : g1;
    {
      const n16b = 1 + hrn(2);
      const n15b = 2 + hrn(4);
      let n17 = 0;
      for (let x = m7 + 1; x < n4b - 1; x++) {
        for (let y = clampY(n5 - n16b); y < n5; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0;
          if (st.wall[ti] !== wall) chTile(ti, brick, false);
        }
        n17++;
        if (n17 >= n15b) { x += n15b; n17 = 0; }
      }
    }
    // 0.6 框清墙（cs:465-483：normal 世界必跑；★IIIII21——drunk=入口地下，
    //   `!dungeonEntranceIsUnderground && !dungeonEntranceIsBuried` 门（cs:540）
    //   恒假 → 0.6 收窄+清墙段整跳。noSurface 秘种子同支（组合域登记不接线）。
    // ★BBBBB（2026-08-19）：0.6f 乘积按 float 语义取整（Math.fround）——m20260811
    //   入口 (cx=1054.45, cy=319, sx2=43, sy2=10)：double 直乘 10×0.6000000238418579
    //   =6.000000238418579 → 319-x=312.99999976 → b0=312；而 golden 二进制 b0=313
    //   （清墙上缘越过的 (1028-1031,312) 四格墙 7 残留实锤）。float 乘积
    //   fl(10×0.6f)=6.0（中点 2^-22 恰在 [4,8) 段半 ulp——round-half-to-even 归 6.0）
    //   → 313.0 → b0=313 ✓。9293480 侧（12×0.6f=7.200000286… 可精确表示）两模型
    //   同值 235——零回退。金字塔案同族：二进制在刀口边界与反编译 double 算术分歧。
    {
      const f06 = Math.fround(0.6);
      // ★IIIII21：drunk 跳整段（含 UpdateBounds）——括在门内
      if (!(gs.seedFlags.drunkWorld)) {
      const a0 = clampX(Math.trunc(cx - Math.fround(sx2 * f06)));
      const a1 = clampX(Math.trunc(cx + Math.fround(sx2 * f06)));
      const b0 = clampY(Math.trunc(cy - Math.fround(sy2 * f06)));
      const b1 = clampY(Math.trunc(cy + Math.fround(sy2 * f06)));
      entBounds.upd(a0, b0, a1, b1);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0; st.wall[ti] = 0;
        }
      }
      }
    }    // 0.5 框开放门厅 + 老头锚（★IIIII21：drunk 入口地下 → num3/num4 右移一格
    //   ——cs:567-571 `(underground|buried) && num2==-1`；num2 取翻转后值）
    {
      const shiftR = gs.seedFlags.drunkWorld && num2 === -1 ? 1 : 0;
      const a0 = clampX(Math.trunc(cx - sx2 * 0.5) + shiftR);
      const a1 = clampX(Math.trunc(cx + sx2 * 0.5) + shiftR);
      const b0 = clampY(Math.trunc(cy - sy2 * 0.5));
      const b1 = clampY(Math.trunc(cy + sy2 * 0.5));
      entBounds.upd(a0, b0, a1, b1);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0; st.flags[ti] = 0; st.wall[ti] = 0;
        }
      }
      dungeonX = Math.trunc(cx); dungeonY = b1;
      // ★IIIII98b2：SetOldManSpawn(generating:true)→NPC.NewNPC(37) 头 FTW 支
      //   （NPC.cs:81576 `Main.getGoodWorld && Main.rand.Next(3)!=0`）每次世界生成期
      //   NPC 落地必耗 1 颗主流掷；老头 id37 不在 46/62 换型表,值弃置。曾缺失 →
      //   入口段 −1 主掷、此后 pass32 骰流整体错位一位（x86 H97|oldman0→1 420→421 实证）。
      if (instIdx === 0 && gs.seedFlags.getGoodWorld) rn(3);
      // ★IIIII21（cs:582-585）：drunk 死生命树座——x=generatingDungeonPositionX、
      //   y=(int)Main.worldSurface、attachmentY=generatingDungeonPositionY；
      //   generateRoots=true。掷骰走主流 rng。HasATree=drunk&&!NoDungeonGuardian
      //   （NoDungeonGuardian=onlyShimmerOcean 组合，不在本仓旗域，登记）。
      if (gs.seedFlags.drunkWorld) {
        generateDungeonTree(posX, Math.trunc(gs.worldSurface), posY, true);
      }
    }    // ★2026-08-17 移植：GenerateDungeonStairs（DungeonUtils.cs:1222-1310，调用点
    //   LegacyDungeonEntrance.cs:511-516——HasStairs 普通世界=TRUE；★IIIII21：
    //   drunk=入口地下 → HasStairs 恒假，台阶整跳）。曾整段缺失 →
    //   堡右 45° 阶梯丢失 + 后续段起墙判定/变体锚/掷流全错位（oracle Q 批同补并
    //   真值对拍）。i2=num2==1?0.5盒右缘:左缘（:512 时 num3/num4 已被 0.5 框重算）、
    //   j=0.5 盒底缘、depth=GetDualDungeonBrickSupportCutoffY(普通世界=outerPotTop-10)
    //   -num6+5；drunk 下 cutoff=-5（DungeonUtils.cs:1636）——门关死仅作语义登记。
    if (!(gs.seedFlags.drunkWorld)) {
      const sti = num2 === 1 ? clampX(Math.trunc(cx + sx2 * 0.5)) : clampX(Math.trunc(cx - sx2 * 0.5));
      const stj = clampY(Math.trunc(cy + sy2 * 0.5));
      const stdep = ((gs.seedFlags.drunkWorld ? potT - 5 : potT - 10)) - stj + 5;
      dgStairs(sti, stj, num2, stdep);
    }    // 条纹窗墙（PlaceWall：墙==0 才写）
    {
      const n16c = 1 + hrn(2);
      const n15c = 2 + hrn(4);
      let n17 = 0;
      const b0 = clampY(Math.trunc(cy - sy2 * 0.5));
      const b1 = clampY(Math.trunc(cy + sy2 * 0.5));
      let a0 = clampX(Math.trunc(cx - sx2 * 0.5) + 2);
      let a1 = clampX(Math.trunc(cx + sx2 * 0.5) - 2);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1 + 1; y++) {
          // ★Z 批修复 1：WorldGen.PlaceWall 每次调用耗 1 颗主流骰（vanilla 探针
          //   实证：条纹窗墙 169 连调用=169 连掷 6661→6830 逐位 k+1，SquareWallFrame
          //   链，与 wall==0 写门无关）。曾零耗 → E 段少掷 +169 全链流偏。
          raw();
          if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && wallAt(x, y) === 0) st.wall[st.idx(x, y)] = wall;
        }
        n17++;
        if (n17 >= n15c) { x += n15c * 2; n17 = 0; }
      }
    }    // 门洞 15×3 清空 + PlaceTile(10, style13)
    cx -= sx2 * 0.6000000238418579 * num2;
    cy += sy2 * 0.5;
    cy -= 1.5;
    {
      const dL = Math.trunc(cx - 7.5), dR = Math.trunc(cx + 7.5);
      const dT = Math.trunc(cy - 1.5), dB = Math.trunc(cy + 1.5);
      entBounds.upd(dL, dT, dR, dB);   // ★Bounds.UpdateBounds(:600，num2<0 偏移-1 前)——曾缺（影响 BiomeChests 排除带）
      // ★2026-08-16 审计：cs:606-611 门洞清空时对"内侧半边"（num2>0 取 x<val.X、
      //   num2<0 取 x>val.X，val.X 为 num2<0 偏移-1 后的 zero.X）回写 brickWallType
      //   ——曾只清 active 不写墙，门洞内半边墙缺失（渲染+wallDungeon 判定双差）。
      if (num2 < 0) cx -= 1.0;
      const valX = cx;
      for (let x = dL; x < dR; x++) {
        for (let y = dT; y < dB; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.flags[ti] = 0;
          if ((num2 > 0 && x < valX) || (num2 < 0 && x > valX)) st.wall[ti] = wall;
        }
      }
      // 入口门零掷骰：LegacyDungeonEntrance.cs:616 硬编码 PlaceTile(...,10,...,13)。
      // 勿在此掷 rn(3)——1/3 主题门掷骰属 dungeonD 门特征段（DungeonGlobalDoors.cs:47-50，见下方 doorData 落放处）。
      dgPlaceDoor(Math.trunc(cx), Math.trunc(cy) + 1, 13);
    }
  }

  // ============ LegacyEntranceDungeonHall precalc 支（:23-380，UsePrecalculatedEntrance=true）============
  // XX 批（2026-08-18）。CalculateHall(OverrideStart=currentPos→OverrideEnd=lerp 目标)
  // 后生成：方向/步数被覆写成**直线 + steps=ceil(段距)**（:157-171 v=End-Start 归一），
  // strength=Next(5,9) 存活；无出地表探测（!UsePrecalc 门）/TileRunner/0.98 衰减
  //（!flag 门）；每 10 步记平台候选（InAHallway → hf=5）。头部掷序与 Legacy 支逐位
  // 同构（strength→steps→方向链），覆写值弃而位次保留——种子流两支等价推进。
  function dgEntHallPrecalc(seed: number, sx0: number, sy0: number, tgx: number, tgy: number): void {
    // flag 支直线：v=End-Start，SafeNormalize(v,UnitX)，steps=ceil(|v|/1)
    const dvx = tgx - sx0, dvy = tgy - sy0;
    const len = Math.sqrt(dvx * dvx + dvy * dvy);
    const vx = len === 0 ? 1 : dvx / len, vy = len === 0 ? 0 : dvy / len;
    const num5 = 0.5;
    const n6 = 30;
    const hb = new DBnd(w, h);
    hb.set(Math.trunc(sx0), Math.trunc(sy0), Math.trunc(sx0), Math.trunc(sy0));
    const hall: DHall = { seed, generated: true, forceX: false, isEntrance: true, bounds: hb, sx: sx0, sy: sy0, ex: 0, ey: 0, sdx: vx, sdy: vy, edx: vx, edy: vy };
    halls.push(hall);
    // ★QQQQQQ（2026-08-22）precalc 支每步跑 LegacyHall **两次**：DungeonCrawler.cs:540-541
    //   dungeonHall.CalculateHall(data,currentPos,val) → LegacyHall(generating:false)
    //   + dungeonHall.GenerateHall(data) → LegacyHall(generating:true)——两跑各自
    //   new UnifiedRandom(RandomSeed)（LEH.cs:26-27），私有掷流同值重放两遍；写门/
    //   平台候选在 generating 门内（LEH.cs:243/:297-313），边界更新在门外（:246-249，
    //   两跑同值幂等）。JS 曾单跑=每步少耗一遍私有流（CONST 链 #32 塔段「掷形差」
    //   根因之一；span 对拍 vanilla 每颗主流 Next(10,30) 配两段相同厅头 b5 9|b10 30）。
    for (let dryP = 0; dryP < 2; dryP++) {
    const dry = dryP === 0;                        // pass0=CalculateHall（只掷不写）
    const hr = dgUR(seed);                         // ★每跑各 new UnifiedRandom(RandomSeed)——头掷全量重放
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const num = hri(5, 8);                       // strength（存活——盒宽/Fluff 用）
    hri(10, 29);                                 // steps 掷（覆写弃值保位）
    if (hrn(3) !== 0) hri(0, 199);               // 方向掷链（覆写弃值保位）
    else if (hrn(3) === 0) hri(50, 75);
    else if (hrn(6) === 0) { /* vy*=2 分支无掷 */ }
    let steps = Math.ceil(len);
    let px = sx0 + 0.0, py = sy0 + 0.0;
    const roomsArea = roomsInSpots(px, py, px + vx * steps, py + vy * steps, Math.trunc(steps / 2 + num));
    let n8 = 0;                                  // 平台节奏计数（num8 初 0，num7=10）
    while (steps > 0) {
      steps--;
      if (!inW(Math.trunc(px), Math.trunc(py), n6 + 5)) break;
      const x0 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px - num - 4.0 - hrn(6))));
      const x1 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px + num + 4.0 + hrn(6))));
      const y0 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py - num - 4.0)));
      const y1 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py + num + 4.0 + hrn(6))));
      bounds.upd(x0, y0, x1, y1);
      hb.upd(x0, y0, x1, y1);
      if (!dry) for (let x = x0; x < x1; x++) {
        for (let y = y0; y < y1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          const f2 = p !== 1;
          st.liquid[i] = 0;
          if (f2 && canPlaceTileAt(i)) chTile(i, brick, true);
        }
      }
      if (!dry) for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) {
          const i = st.idx(x, y);
          const p = prot(x, y, roomsArea);
          if (p === 3) continue;
          let f3 = true;
          if (p === 2 && isDW(st.wall[i])) f3 = false;
          if (f3) chWall(i, wall, false);
        }
      }
      let n16 = 0;
      if (hrn(num) === 0) n16 = hri(1, 2);
      const kx0 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px - num * num5 - n16)));
      const kx1 = Math.max(n6, Math.min(w - n6 - 1, Math.trunc(px + num * num5 + n16)));
      const ky0 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py - num * num5 - n16)));
      const ky1 = Math.max(n6, Math.min(h - n6 - 1, Math.trunc(py + num * num5 + n16)));
      if (!dry) {
        n8--;
        if (n8 <= 0) { n8 = 10; platData.push({ x: Math.trunc(px), y: Math.trunc(py), hall: true, hf: 5, pots: 0.25 }); }
        for (let x = kx0; x < kx1; x++) {
          for (let y = ky0; y < ky1; y++) {
            const i = st.idx(x, y);
            const p = prot(x, y, roomsArea);
            if (p === 3) continue;
            let f4 = true;
            if (p === 2 && isDW(st.wall[i])) f4 = false;
            st.flags[i] = 0;
            st.slope[i] = 0; st.half[i] = 0;       // ClearTile()（清坡+半砖）
            if (f4) chWall(i, wall, false);
          }
        }
      }
      px += vx; py += vy;                        // flag=true → 无 0.98 纵向衰减
    }
    posX = Math.trunc(px); posY = Math.trunc(py);
    hall.ex = px; hall.ey = py;
    }
  }

  // ================= TowerDungeonEntrance.TowerEntrance（Entrances/TowerDungeonEntrance.cs:40-461）=================
  // XX 批（2026-08-18）1:1 转录。常量族（:80-97）：num2=5/num3=35/num4=40（基座半宽）
  // /num5=100（阶梯深）/num6=30（基线抬升）/num7=j-30（塔基线）/num8=30/num9=25/
  // num10=30/num11=20/num12=50/num13=15/num14=20/num15=40/num16=95（顶层高）。
  // ★Tile.SmoothSlope（Tile.cs:821-880 applyToNeighbors=false）：CanPound&&SolidOrSloped
  //   门后按 上<<3|下<<2|左<<1|右 位形写坡（10→slope3/9→slope4/6→slope1/5→slope2/
  //   4→半砖/余→平）。近似备案：CanPound 全门（NO_POUND/BOULDERS/FORBIDS 表）以
  //   !FRAMED_ALL 简化——楔底平滑目标全是砖/泥土岩（均不在豁免表）；SolidOrSloped
  //   含 !inActive()（MMMM 批——致动柱邻格平滑语义对齐，#32 Sl 8 格差根因）。
  const solidOrSlopedD = (x: number, y: number): boolean =>
    inW(x, y, 0) && actAt(x, y) !== 0 && genSolidType(typAt(x, y))
    && ((st.wire[st.idx(x, y)] >>> 5) & 1) === 0;   // SolidOrSlopedTile !inActive()（WG:70046）
  function dgSmoothSlope(x: number, y: number): void {
    if (!solidOrSlopedD(x, y)) return;
    const sheet = TILE_DEFS[typAt(x, y)]?.vanilla?.sheet ?? -1;
    if (DG_FRAMED_ALL.has(sheet)) return;
    const i = st.idx(x, y);
    const fUp = inW(x, y - 1, 0) && actAt(x, y - 1) !== 0;
    const f2 = fUp && !solidOrSlopedD(x, y - 1);
    const num = ((fUp ? 1 : 0) << 3) | ((solidOrSlopedD(x, y + 1) ? 1 : 0) << 2)
      | ((solidOrSlopedD(x - 1, y) ? 1 : 0) << 1) | (solidOrSlopedD(x + 1, y) ? 1 : 0);
    if (num === 10 && !f2) { st.slope[i] = 3; st.half[i] = 0; }
    else if (num === 9 && !f2) { st.slope[i] = 4; st.half[i] = 0; }
    else if (num === 6) { st.slope[i] = 1; st.half[i] = 0; }
    else if (num === 5) { st.slope[i] = 2; st.half[i] = 0; }
    else if (num === 4) { st.slope[i] = 0; st.half[i] = 1; }
    else { st.slope[i] = 0; st.half[i] = 0; }
  }
  // DungeonPillar.GenerateTileStrip（Features/DungeonPillar.cs:88-190，Pillar 版）
  // ——height 0=自动扫描（向 scan 向至首个 active，上限 100，InWorld fluff10）；
  // up 支 num6<=10 break、down 支 num8>=H-10 break；!always 时遇 active break。
  // 返回 [topY, bottomY]（写入带）。
  function dgPillarStrip(px: number, py: number, height: number, up: boolean,
    smoothTop: boolean, smoothBottom: boolean, always: boolean, inact = false): [number, number] {
    let placeY = py;
    let num3 = height;
    if (num3 === 0) {
      num3 = 0;
      let i2 = 0;
      if (up) { while (i2 > -100 && inW(px, placeY + i2, 10) && actAt(px, placeY + i2) === 0) i2--; num3 = -i2; }
      else {
        while (i2 < 100 && inW(px, placeY + i2, 10) && actAt(px, placeY + i2) === 0) i2++;
        num3 = i2;
        placeY += num3 - 1;
      }
    }
    if (num3 === 0) return [placeY, placeY];
    const lo = -num3 + 1, hi = 0;
    let topY = placeY, bottomY = placeY;
    if (up) {
      for (let j = lo; j <= hi; j++) {
        const cy = placeY + j;
        if (cy <= 10) break;
        if (!st.inBounds(px, cy)) continue;
        const ti = st.idx(px, cy);
        if (!always && st.flags[ti] !== 0) break;
        // ClearTile()（Tile.cs:153——清 slope/half/active/inActive）+active+type
        st.flags[ti] = 1; st.type[ti] = brick; st.slope[ti] = 0; st.half[ti] = 0;
        st.wire[ti] &= ~32;
        if ((j === lo && smoothTop) || (j === hi && smoothBottom)) dgSmoothSlope(px, cy);
        // MMMM 批：DungeonPillar.GenerateTileStrip :151-154/:200-203——BlockActuated 族
        //   平滑后置 inActive(true)（wire bit5；SolidTop/Bottom 变体的 ±2 豁免不涉 Dome/Tower）
        if (inact) st.wire[ti] |= 32;
        if (cy < topY) topY = cy;
        if (cy > bottomY) bottomY = cy;
      }
    } else {
      for (let j = hi; j >= lo; j--) {
        const cy = placeY + j;
        if (cy >= h - 10) break;
        if (!st.inBounds(px, cy)) continue;
        const ti = st.idx(px, cy);
        if (!always && st.flags[ti] !== 0) break;
        st.flags[ti] = 1; st.type[ti] = brick; st.slope[ti] = 0; st.half[ti] = 0;
        st.wire[ti] &= ~32;
        if ((j === lo && smoothTop) || (j === hi && smoothBottom)) dgSmoothSlope(px, cy);
        if (inact) st.wire[ti] |= 32;
        if (cy < topY) topY = cy;
        if (cy > bottomY) bottomY = cy;
      }
    }
    return [topY, bottomY];
  }
  // DungeonPillar.Pillar（:28-84）——逐列主带（height，crownStops=false→crown 高 0=
  // 自动扫描）+ 顶/底冠（k==0/-1 列外扩 1，num=3 间距；smoothBottom/Top:true）
  function dgPillar(px: number, py: number, width: number, crownTop: boolean, crownBottom: boolean,
    height: number, always: boolean, inact = false): void {
    const num = 3;
    for (let k = 0; k < width; k++) {
      const cx = px + k - Math.trunc(width / 2);
      const [topY2, bottomY] = dgPillarStrip(cx, py, height, true, false, false, always, inact);
      if (crownTop) {
        if (k === 0) dgPillarStrip(cx - 1, topY2 + num, 0, true, false, true, always, inact);
        else if (k === width - 1) dgPillarStrip(cx + 1, topY2 + num, 0, true, false, true, always, inact);
      }
      if (crownBottom) {
        if (k === 0) dgPillarStrip(cx - 1, bottomY - num, 0, false, true, false, always, inact);
        else if (k === width - 1) dgPillarStrip(cx + 1, bottomY - num, 0, false, true, false, always, inact);
      }
    }
  }
  // DungeonUtils.GenerateTileStrip（DU:461-539，Wedge 版——无 active-break、InWorld
  // continue）+ GenerateBottomWedge（:447-459）：crowningBottom → width+=2；逐列三角
  // 带（left? i+1 : width-(i-1)）+ 尾部 SmoothSlope——★原版平滑的是**中心列 placeX**
  // 逐深度（非逐列，机械照抄）
  function dgBottomWedge(px: number, py: number, width0: number, left: boolean): void {
    const width = width0 + 2;
    for (let i2 = 0; i2 <= width; i2++) {
      const cx = px + i2 - Math.trunc(width / 2);
      const hgt = left ? i2 + 1 : width - (i2 - 1);
      for (let j = 0; j <= hgt - 1; j++) {
        const cy = py + j;
        if (!inW(cx, cy, 10)) continue;
        const ti = st.idx(cx, cy);
        st.flags[ti] = 1; st.type[ti] = brick; st.slope[ti] = 0; st.half[ti] = 0;
      }
    }
    for (let j2 = 0; j2 <= width; j2++) {
      const num = left ? j2 + 1 : width - (j2 - 1);
      dgSmoothSlope(px, py + num);
    }
  }
  // WorldGen.PlaceWall(...,245)：每次调用耗 1 颗主流骰（Z 批 169 连调实证），写门
  //   x>1&&y>1&&x<w-2&&y<h-2 且 wall==0（245=铅栅栏）
  const FENCE = 245;
  const dgTW = (globalThis as { __dgTowerTrace?: Record<string, number | string> }).__dgTowerTrace;
  function dgPlaceWallFence(x: number, y: number): void {
    // ★PlaceWall(245) 掷在写门内（XX 批 x86 对拍定谳：s4444 tower 段 E 哈希
    //   b4788d7e 仅在 write-gated 模型下命中——与 jungle 段 PlaceWall
    //   "成功落墙必掷 SquareWallFrame" 同口径；155 次调用仅 151 写=151 掷）
    //   ★QQQQQQ：掷的过载=WallFrame(resetFrame) 的 Next(0,3)（Framing.cs:395，
    //   span 实证 vanilla 记 b 0 3×151）——曾用 raw()=Next()（同耗 1 样本流等价，
    //   但 span 签名不合）；ri(0,2)=nextIntRange(0,3) 精确同构。
    if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && wallAt(x, y) === 0) { ri(0, 2); st.wall[st.idx(x, y)] = FENCE; }
  }
  // TowerEntrance_LineOfFence（:463-476）：y<=10 直退；条件循环不变量→全或无
  function dgLineOfFence(lx: number, rx: number, y: number): void {
    if (y <= 10) return;
    if (!(lx >= 10 && rx <= w - 10)) return;
    for (let x = lx; x <= rx; x++) { dgPlaceWallFence(x, y); if (dgTW) dgTW.fence = (dgTW.fence as number) + 1; }
  }
  // TowerEntrance_OuterPillar（:478-516）：7×3+5×7 方柱（DungeonPillar 无冠）+
  // PlaceTile(215 篝火,Place3x2 门)+9 格 245 栅栏墙
  const CAMPFIRE = TILE_INTERNAL_BY_SHEET.get(215) ?? -1;
  function dgOuterPillar(px: number, py: number): void {
    if (dgTW) dgTW.opw = (dgTW.opw as number) + 1;
    // ★IIIII57：DungeonPillarSettings 默认 AlwaysPlaceEntirePillar=**true**（Features/DungeonPillarSettings.cs:14，
    //   Tower 只覆写宽高不改 always）——OuterPillar 方柱/檐口方柱全部无条件落带；
    //   旧移植传 false → 底部步块在活动地形上整列 break，塔脚 400-409/440-469 残差。
    dgPillar(px, py - 1, 7, false, false, 3, true);
    dgPillar(px, py - 4, 5, false, false, 7, true);
    if (py - 11 >= 10 && CAMPFIRE > 0) place3x2D(px, py - 11, CAMPFIRE);   // PlaceTile(215)→Place3x2 零掷
    for (let k = 0; k < 5; k++) dgPlaceWallFence(px - 2 + k, py - 11);
    if (py - 12 >= 10) { dgPlaceWallFence(px - 2, py - 12); dgPlaceWallFence(px + 2, py - 12); }
    if (py - 10 >= 10) { dgPlaceWallFence(px - 2, py - 10); dgPlaceWallFence(px + 2, py - 10); }
  }
  // DungeonWindowBasic.Window（:26-105）——GetWindowPlatformStyle 恒耗 1 骰
  // （WindowPlatformItemTypes 单元素 Next(1)）；十字边墙+玻璃墙；下缘越界处放
  // 平台窗台（type19+frameY=style*18；TileFrame 不建模——帧不入四通道）
  const winValidSpot = (x: number, y: number, ww: number, wh: number): boolean => {
    if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
    return !(y === 0 && (x === 0 || x === ww - 1));
  };
  function dgWindowBasic(px: number, py: number, ww: number, wh: number, overrideGlass: number): void {
    rn(1);                                        // style.GetWindowPlatformStyle（Next(1) 单元素）
    if (dgTW) dgTW.win = (dgTW.win as number) + 1;
    const glass = overrideGlass > 0 ? overrideGlass : winGlass;
    const box = new DBnd(w, h);
    box.set(px, py, px, py);                      // Bounds.SetBounds(placeX,placeY,placeX,placeY)
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) { st.wall[st.idx(x, y)] = v; box.upd(x, y); }   // 每写格 UpdateBounds
    };
    for (let i2 = 0; i2 < ww; i2++) {
      const cx = px + i2 - Math.trunc(ww / 2);
      for (let j2 = 0; j2 < wh; j2++) {
        if (!winValidSpot(i2, j2, ww, wh)) continue;
        const cy = py + j2 - Math.trunc(wh / 2);
        if (i2 === Math.trunc(ww / 2) || j2 === Math.trunc(wh / 2)) setW(cx, cy, winEdge);
        else setW(cx, cy, glass);
        if (!winValidSpot(i2 - 1, j2, ww, wh)) setW(cx - 1, cy, winEdge);
        if (!winValidSpot(i2 + 1, j2, ww, wh)) setW(cx + 1, cy, winEdge);
        if (!winValidSpot(i2, j2 - 1, ww, wh)) setW(cx, cy - 1, winEdge);
        if (!winValidSpot(i2, j2 + 1, ww, wh)) {
          setW(cx, cy + 1, winEdge);
          if (st.inBounds(cx, cy + 1)) {
            const ti = st.idx(cx, cy + 1);
            st.flags[ti] = 1; st.type[ti] = PLATFORM; st.slope[ti] = 0; st.half[ti] = 0;
            st.frameY[ti] = winPlatStyle * 18;
          }
        }
      }
    }
    box.calc();                                   // Bounds.CalculateHitbox()
    winBoxes.push(box);                           // GenerateFeature 恒 true → generated=true
  }
  // DungeonWindowMosaic.Window_Skeletron（:46-190）——17×15 颅 + 11×7 颚 + 边缘描线
  function dgWindowMosaicSkel(px: number, py: number, glass: number): void {
    const box = new DBnd(w, h);
    box.set(px, py, px + 1, py + 1);              // Mosaic: SetBounds(placeX,placeY,placeX+1,placeY+1)
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) { st.wall[st.idx(x, y)] = v; box.upd(x, y); }
    };
    const skullOK = (x: number, y: number, ww: number, wh: number): boolean => {
      if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
      if (y === 0 && (x <= 5 || x >= ww - 6)) return false;
      if (y === 1 && (x <= 3 || x >= ww - 4)) return false;
      if (y === 2 && (x <= 1 || x >= ww - 2)) return false;
      if (y === 3 && (x === 0 || x >= ww - 1)) return false;
      if ((x === 0 && y >= wh - 2) || (x <= 1 && y === wh - 1) || (x === ww - 1 && y >= wh - 2) || (x >= ww - 2 && y === wh - 1)) return false;
      return true;
    };
    const jawOK = (x: number, y: number, isGlass: boolean, ww: number, wh: number): boolean => {
      if (isGlass) return true;
      if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
      if (y === wh - 1 && (x <= 2 || x >= ww - 3)) return false;
      if (y === wh - 2 && (x <= 1 || x >= ww - 2)) return false;
      if (y === wh - 3 && (x === 0 || x === ww - 1)) return false;
      return true;
    };
    const n1 = 17, n2 = Math.trunc(n1 / 2), n3 = 15, n4 = Math.trunc(n3 / 2);
    const n5 = 11, n6 = Math.trunc(n5 / 2), n7 = 7, n8 = Math.trunc(n7 / 2);
    for (let i2 = 0; i2 < n1; i2++) {
      const cx = px + i2 - n2;
      for (let j2 = 0; j2 < n3; j2++) {
        if (!skullOK(i2, j2, n1, n3)) continue;
        const cy = py + j2 - n4;
        setW(cx, cy, glass);
        if (!skullOK(i2 - 1, j2, n1, n3)) setW(cx - 1, cy, winEdge);
        if (!skullOK(i2 + 1, j2, n1, n3)) setW(cx + 1, cy, winEdge);
        if (!skullOK(i2, j2 - 1, n1, n3)) setW(cx, cy - 1, winEdge);
        if (j2 < n3 - 1 && !skullOK(i2, j2 + 1, n1, n3)) setW(cx, cy + 1, winEdge);
      }
    }
    for (let k = 0; k < n5; k++) {
      const cx = px + k - n6;
      for (let l = 0; l < n7; l++) {
        const cy = py + l + n4 + n8 - 2;
        if (!st.inBounds(cx, cy)) continue;
        const jawIsGlass = wallAt(cx, cy) === glass;
        if (!jawOK(k, l, jawIsGlass, n5, n7)) continue;
        setW(cx, cy, glass);
        if (!jawOK(k - 1, l, wallAt(cx - 1, cy) === glass, n5, n7)) setW(cx - 1, cy, winEdge);
        if (!jawOK(k + 1, l, wallAt(cx + 1, cy) === glass, n5, n7)) setW(cx + 1, cy, winEdge);
        if (!jawOK(k, l - 1, wallAt(cx, cy - 1) === glass, n5, n7)) setW(cx, cy - 1, winEdge);
        if (!jawOK(k, l + 1, wallAt(cx, cy + 1) === glass, n5, n7)) setW(cx, cy + 1, winEdge);
      }
    }
    const p2y = py + n4 - 2;
    for (let m = 0; m < n1; m++) {
      const cx = px - n2 + m;
      if (m >= 2 && m <= 5) {
        const n14 = m - 2;
        for (let n9 = 0; n9 < 6; n9++)
          if ((n14 !== 3 || n9 > 1) && (n14 !== 2 || n9 !== 0) && (n14 !== 1 || n9 !== 5) && (n14 !== 0 || n9 < 4))
            setW(cx, py + n9 - 1, winEdge);
      }
      if (m >= 11 && m <= 14) {
        const n15 = m - 11;
        for (let n16v = 0; n16v < 6; n16v++)
          if ((n15 !== 0 || n16v > 1) && (n15 !== 1 || n16v !== 0) && (n15 !== 2 || n16v !== 5) && (n15 !== 3 || n16v < 4))
            setW(cx, py + n16v - 1, winEdge);
      }
      if (m >= 7 && m <= 9) {
        const n17 = m - 7;
        for (let n18 = 0; n18 < 4; n18++)
          if (((n17 !== 0 && n17 !== 2) || n18 !== 0) && (n17 !== 1 || n18 !== 3))
            setW(cx, py + n18 + 3, winEdge);
      }
      let n19 = p2y + 1;
      if (m >= 2 && m <= 3) n19++;
      else if (m >= 4 && m <= 6) n19 += 2;
      else if (m >= 7 && m <= 9) n19 += 3;
      else if (m >= 10 && m <= 12) n19 += 2;
      else if (m >= 13 && m <= 14) n19++;
      setW(cx, n19, winEdge);
      if (m === 0 || m === n1 - 1) { setW(cx, n19 - 1, winEdge); setW(cx, n19 + 1, winEdge); }
      if (m === 4 || m === 6 || m === 8 || m === 10 || m === 12)
        for (let n20 = 0; n20 < 4; n20++) setW(cx, n19 + n20, winEdge);
      if (m >= 5 && m <= 11) {
        let n21 = p2y + 7;
        if (m >= 7 && m <= 9) n21++;
        setW(cx, n21, winEdge);
      }
    }
    box.calc();
    winBoxes.push(box);
  }
  // DungeonWindowMosaic.Window_MoonLord（:192-330）——左右 8×7+7×6 侧眼 + 7×8 中眼
  function dgWindowMosaicMoon(px: number, py: number, glass: number): void {
    const box = new DBnd(w, h);
    box.set(px, py, px + 1, py + 1);              // Mosaic: SetBounds(placeX,placeY,placeX+1,placeY+1)
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) { st.wall[st.idx(x, y)] = v; box.upd(x, y); }
    };
    const sideOK = (x: number, y: number, left: boolean, ww: number, wh: number): boolean => {
      if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
      if (left && ((x <= 1 && y === wh - 1) || (x === ww - 1 && y <= 1))) return false;
      if (left && ((x === 0 && y >= wh - 2) || (x >= ww - 2 && y === 0))) return false;
      if (!left && ((x <= 1 && y === 0) || (x >= ww - 2 && y === wh - 1))) return false;
      if (!left && ((x === 0 && y <= 1) || (x === ww - 1 && y >= wh - 2))) return false;
      return true;
    };
    const midOK = (x: number, y: number, ww: number, wh: number): boolean => {
      if (x < 0 || y < 0 || x >= ww || y >= wh) return false;
      if ((y === 1 && (x === 0 || x === ww - 1)) || (y === wh - 2 && (x === 0 || x === ww - 1))) return false;
      if (y === 0 && ((x >= 0 && x <= 1) || (x >= ww - 2 && x <= ww - 1))) return false;
      if (y === wh - 1 && ((x >= 0 && x <= 1) || (x >= ww - 2 && x <= ww - 1))) return false;
      return true;
    };
    const n1 = 8, n2 = n1 - 1, n3 = 7, n4 = n3 - 1, n5 = 7, n6 = n5 + 1, n7 = 9;
    for (let side = 0; side < 2; side++) {
      const left = side === 0;
      for (let j = 0; j < n1; j++) {
        for (let k = 0; k < n2; k++) {
          if (!sideOK(j, k, left, n1, n2)) continue;
          const cx = px + j + (left ? -n7 - 1 : n7 - n1 + 2);
          const cy = py + k + n2 - 2;
          setW(cx, cy, glass);
          if (!sideOK(j - 1, k, left, n1, n2)) setW(cx - 1, cy, winEdge);
          if (!sideOK(j + 1, k, left, n1, n2)) setW(cx + 1, cy, winEdge);
          if (!sideOK(j, k - 1, left, n1, n2)) setW(cx, cy - 1, winEdge);
          if (!sideOK(j, k + 1, left, n1, n2)) setW(cx, cy + 1, winEdge);
        }
      }
      for (let l = 0; l < n3; l++) {
        for (let m = 0; m < n4; m++) {
          if (!sideOK(l, m, left, n3, n4)) continue;
          const cx = px + l + (left ? -n7 + 1 : n7 - n3);
          const cy = py + m - n4 + 2;
          setW(cx, cy, glass);
          if (!sideOK(l - 1, m, left, n3, n4)) setW(cx - 1, cy, winEdge);
          if (!sideOK(l + 1, m, left, n3, n4)) setW(cx + 1, cy, winEdge);
          if (!sideOK(l, m - 1, left, n3, n4)) setW(cx, cy - 1, winEdge);
          if (!sideOK(l, m + 1, left, n3, n4)) setW(cx, cy + 1, winEdge);
        }
      }
    }
    for (let n9 = 0; n9 < n5; n9++) {
      for (let n12 = 0; n12 < n6; n12++) {
        if (!midOK(n9, n12, n5, n6)) continue;
        const cx = px + n9 - Math.trunc(n5 / 2);
        const cy = py + n12 - n4 - n6;
        setW(cx, cy, glass);
        if (!midOK(n9 - 1, n12, n5, n6)) setW(cx - 1, cy, winEdge);
        if (!midOK(n9 + 1, n12, n5, n6)) setW(cx + 1, cy, winEdge);
        if (!midOK(n9, n12 - 1, n5, n6)) setW(cx, cy - 1, winEdge);
        if (!midOK(n9, n12 + 1, n5, n6)) setW(cx, cy + 1, winEdge);
      }
    }
    box.calc();
    winBoxes.push(box);
  }
  // TowerEntrance_Door（:433-461）：num/num2 门洞扫带 + 墙清/k≥-2..0 清块 +
  // 双 PlaceTile(10,style13)（PlaceDoor 3×Next(3) 成功即掷）
  function dgTowerDoor(i: number, floorY: number, outer: number, inner: number, left: boolean): void {
    const num = left ? inner - 1 : -outer - 2;
    const num2 = left ? outer + 2 : -inner + 1;
    const p1x = i + (left ? outer - 1 : -outer + 1);
    const p2x = i + (left ? inner + 1 : -inner - 1);
    for (let j = num; j <= num2; j++) {
      for (let k = -3; k <= 1; k++) {
        const x = i + j, y = floorY + k;
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        if ((left && x >= p1x) || (!left && x <= p1x)) st.wall[ti] = 0;
        if (k >= -2 && k <= 0) { st.flags[ti] = 0; st.slope[ti] = 0; st.half[ti] = 0; }
      }
    }
    dgPlaceDoor(p1x, floorY, 13);
    dgPlaceDoor(p2x, floorY, 13);
  }
  function dgTowerEntrance(i: number, j: number, preSeed: number): void {    if (dgTW) { dgTW.tower0 = dgMainRolls; dgTW.i = i; dgTW.j = j; dgTW.pw = 0; dgTW.win = 0; dgTW.door = 0; dgTW.fence = 0; dgTW.opw = 0; dgTW.wt = 'na'; }
    const hr = dgUR(preSeed);
    const hrn = (n: number): number => hr.nextInt(n);
    const windowType = hrn(3);                    // 0=Regular 1=Skeletron 2=MoonLord
    if (dgTW) dgTW.wt = ['reg', 'skel', 'moon'][windowType];
    const leftSide = b.side < 0;          // flag = dungeonSide==Left（★IIIII93b per-instance）
    // 120×120 清液+清坡（:62-76 Clear(Slope)）
    for (let x = i - 60; x < i + 60; x++) {
      for (let y = j - 60; y < j + 60; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0; st.liquidType[ti] = 0;
        st.slope[ti] = 0; st.half[ti] = 0;
      }
    }
    const n2 = 5, n3 = 35, n4 = 40;
    // ★IIIII57（TowerDungeonEntrance.cs:81-104）：num5 基座箱行界按
    //   SpecialSeedFeatures.DungeonEntranceIsUnderground 分派——drunk（或
    //   noSurface/mole-people）入口恒地下 ⇒ num5 = num17-m+5 = 50-10+5 = **45**
    //   （m==10 常量点）→ 基座箱仅覆盖 y∈[n7-5,n7+40)，其余与
    //   `Closed=underground` 窗玻璃共为 #32 内壁带残余根因。DualDungeon 支
    //   （GetDualDungeonBrickSupportCutoffY(data)-num7）本链不涉，登记待接线。
    const entUnderground = !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface;
    const entBuried = !!gs.seedFlags.surfaceIsDesert && !entUnderground;
    const n5 = entUnderground ? (50 - 10 + 5) : 100;
    const n7 = j - 30;                            // 塔基线（num7=j-num6, num6=30）
    // ★PPPPP（2026-08-22）n16 勘误：原版 num16 = num8+num11+num15 = 30+20+40 = **90**
    //   （TowerDungeonEntrance.cs:66-70）。JS/oracle 曾同抄 95（双源同错——顶柱/顶檐
    //   整体高 5 格,篝火 y 156≠161 实证）；四链种子恰无 Tower 入口故未暴露,CONST 链
    //   首差定罪。caves-oracle.cs 侧同步勘误归 golden 工具所有方（本批禁区）。
    const n8 = 30, n9 = 25, n10 = 30, n11 = 20, n12 = 50, n13 = 15, n14 = 20, n16 = 90;
    const minY = n7 - n16, maxY = n7 + 10;
    // 塔侧地表圆清 Circle(15)（:92-98 Shapes.Circle.Perform 椭圆逐行 + Actions.Clear
    // =ClearEverything；★IIIII21：drunk 入口地下 → `!buried&&!underground` 门恒假
    // （cs:105）→ 整段跳过。掷流中性（Actions.Clear 零骰）。）
    if (!entBuried && !entUnderground) {          // C# !buried && !underground（:105）
      const cx = leftSide ? i + n3 - 1 : i - n3 + 1;
      const cy = n7 - 15, rad = 15, sq = (rad + 1) * (rad + 1);
      for (let yy = cy - rad; yy <= cy + rad; yy++) {
        const num2 = yy - cy;
        const num3 = Math.min(rad, Math.trunc(Math.sqrt(sq - num2 * num2)));
        for (let xx = cx - num3; xx <= cx + num3; xx++) {
          if (!st.inBounds(xx, yy)) continue;
          const ti = st.idx(xx, yy);
          st.type[ti] = 0; st.wall[ti] = 0; st.liquid[ti] = 0; st.liquidType[ti] = 0;
          st.flags[ti] = 0; st.slope[ti] = 0; st.half[ti] = 0;
        }
      }
    }
    // ★RRRRRR（2026-08-23）Bounds 语义对齐：原版 = SetBounds(i,j,i,j)（:59）+
    //   UpdateBounds(i-n4,minY,i+n4+1,maxY)（:112，**只扩不缩**）→ 底边保持 **j**
    //   （maxY=j-20<j 不扩）；尾 CalculateHitbox（:462）→ hitbox=[i-40,j-120)..[i+41,j)。
    //   JS 曾直接 set(i-n4,minY,i+n4+1,maxY) → 底边 j-20，塔盒短 20 格 → 盒内书架/画/
    //   尖刺候选 JS 多放行（vanilla 经 TowerDungeonEntrance.CanGenerateFeatureAt:31-37
    //   拒 Bookshelves/Paintings/Spikes）——CONST 链 #32 首差根因（x86 CGFA 探针实证：
    //   vanilla 于掷 34324 对候选 (3693,284) VERDICT REJECT，JS 同位放行）。QQQQQQ ⑥
    //   「入口 hitbox=陈旧单格」结论不成立（:462 无条件重算 hitbox）。Dome 侧 JS
    //   （:1966-67 set(i,j,i,j)+upd）本就同构，无需改。
    entBounds.set(i, j, i, j);
    entBounds.upd(i - n4, minY, i + n4 + 1, maxY);
    entExists = true;
    // 基座箱（:100-213）：n∈[-40,40]×m∈[-5,100)——m<0 全清；0..5/5..10 双带（窗带
    // ClearEverything+!flag4 补墙 / 实体带 !flag4 置砖）；m≥10 表层换装（!flag4 或
    // (active&&!inStyle) 置砖 / inWall 但 !WallInStyle 补墙）
    const tileInStyle = (t: number): boolean => t === brick || t === crack;
    const wallInStyle = (v: number): boolean => v === wall;
    const clrAll = (ti: number): void => {
      st.type[ti] = 0; st.wall[ti] = 0; st.liquid[ti] = 0; st.liquidType[ti] = 0;
      st.flags[ti] = 0; st.slope[ti] = 0; st.half[ti] = 0;
    };
    for (let n = -n4; n <= n4; n++) {
      for (let m = -5; m < n5; m++) {
        const x = i + n, y = n7 + m;
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        const f2 = st.flags[ti] !== 0 && !tileInStyle(st.type[ti]);
        const f3 = !wallInStyle(st.wall[ti]);
        const f4 = isDW(st.wall[ti]);
        if (m < 0) clrAll(ti);
        else if (m < 5) {
          if ((n >= -n4 + n2 && n <= -n4 + n2 * 2 - 1) || (n >= n4 - n2 * 2 + 1 && n <= n4 - n2)) {
            clrAll(ti);
            if (!f4) st.wall[ti] = wall;
          } else if (!f4) {
            st.liquid[ti] = 0; st.liquidType[ti] = 0;
            chTileRaw(ti, brick);                // ★IIIII97b：cs:145-156 裸赋值写（坡位保留）
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if (m < 10) {
          if (n >= -n4 + n2 && n <= n4 - n2) {
            clrAll(ti);
            st.wall[ti] = wall;                   // ClearEverything 后判恒真——无条件补墙
          } else if (!f4) {
            st.liquid[ti] = 0; st.liquidType[ti] = 0;
            chTileRaw(ti, brick);                // ★IIIII97b：cs:175-190 裸赋值写
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if ((st.flags[ti] !== 0 && f2) || !f4) {
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          chTileRaw(ti, brick);                  // ★IIIII97b：cs:203-215 裸赋值写
          if (n !== -n4 && n !== n4) st.wall[ti] = wall;
        } else if (f3) {
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          if (n !== -n4 && n !== n4) st.wall[ti] = wall;
        }
        if (m === 1 && (n === -n4 + n2 || n === n4 - n2 * 2)) platData.push({ x, y, hall: false, hf: 0, force: true, pots: 0.33000001311302185 });
        if (m === 10 && n === 0) platData.push({ x, y, hall: false, hf: 0, force: true, pots: 0.33000001311302185 });
      }
    }

    // 下行收敛通道（:214-244）：num23 计数器（首 inactive 起 15 递减，尾 5 步收窄）
    {
      let num23 = -1, num24 = 6;
      for (let m = 10; m < 50; m++) {
        if (num23 === -1 && actAt(i, n7 + m) === 0) num23 = 15;
        if (num23 > 0) {
          num23--;
          if (num23 <= 0) break;
          if (num23 <= 5) num24--;
        }
        for (let k = -num24; k <= num24; k++) {
          const x = i + k, y = n7 + m;
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          clrAll(ti);
          st.wall[ti] = wall;                     // Clear 后 IsConsideredDungeonWall 恒假
        }
      }
    }
    // 塔体（:246-301）：三段收窄（0..30 |n|≤40 / 25..50 |n|≤30 / 45..95 |n|≤20），
    // 内芯 ChangeWallType(reset)（清空+墙），环带 ChangeTileType(reset:false) 叠砖
    for (let n26 = -n4; n26 <= n4; n26++) {
      const x = i + n26;
      for (let n28 = 0; n28 <= n16; n28++) {
        const y = n7 - n28;
        if (!inW(x, y, 5)) continue;
        const ti = st.idx(x, y);
        if (n28 <= n8) {
          if (n26 >= -n3 && n26 <= n3) chWall(ti, wall, true);
          else {
            if (n26 > -n4 && n26 < n4) chWall(ti, wall, true);
            chTile(ti, brick, false);
          }
          if (n28 >= n8 - n2 && (n26 < -n9 || n26 > n9)) chTile(ti, brick, false);
        } else if (n28 >= n8 - n2 && n28 <= n12 && n26 >= -n10 && n26 <= n10) {
          if (n26 >= -n9 && n26 <= n9) chWall(ti, wall, true);
          else {
            if (n26 > -n10 && n26 < n10) chWall(ti, wall, true);
            chTile(ti, brick, false);
          }
          if (n28 >= n12 - n2 && (n26 < -n13 || n26 > n13)) chTile(ti, brick, false);
        } else {
          if (n28 < n12 - n2 || n28 > n16 || n26 < -n14 || n26 > n14) continue;
          if (n26 >= -n13 && n26 <= n13) chWall(ti, wall, true);
          else {
            if (n26 > -n14 && n26 < n14) chWall(ti, wall, true);
            chTile(ti, brick, false);
          }
          if (n28 >= n16 - n2) chTile(ti, brick, false);
        }
      }
    }

    // 四根 3 宽 BlockActuated 立柱（:303-313）——MMMM 批补 inActive 位（wire bit5）
    dgPillar(i - n9 - 3, n7, 3, true, true, 0, true, true);
    dgPillar(i + n9 + 3, n7, 3, true, true, 0, true, true);
    dgPillar(i - n13 - 3, n7, 3, true, true, 0, true, true);
    dgPillar(i + n13 + 3, n7, 3, true, true, 0, true, true);

    // 六组楔底+外柱（:315-331）
    dgBottomWedge(i - n4 - 4, n7 - n8, 5, true);
    dgOuterPillar(i - n4 - 4, n7 - n8);
    dgBottomWedge(i - n10 - 4, n7 - n12, 5, true);
    dgOuterPillar(i - n10 - 4, n7 - n12);
    dgBottomWedge(i - n14 - 4, n7 - n16, 5, true);
    dgOuterPillar(i - n14 - 4, n7 - n16);
    dgBottomWedge(i + n4 + 3, n7 - n8, 5, false);
    dgOuterPillar(i + n4 + 4, n7 - n8);
    dgBottomWedge(i + n10 + 3, n7 - n12, 5, false);
    dgOuterPillar(i + n10 + 4, n7 - n12);
    dgBottomWedge(i + n14 + 3, n7 - n16, 5, false);
    dgOuterPillar(i + n14 + 4, n7 - n16);

    // 檐口 5 宽方柱 + 栅栏线 + 双顶楔（:333-360）
    dgPillar(i - n4 + 5, n7 - n8 - 1, 5, false, false, 2, true);
    dgLineOfFence(i - n4 - 2, i - n10 + 1, n7 - n8 - 1);
    dgPillar(i - n10 + 5, n7 - n12 - 1, 5, false, false, 2, true);
    dgLineOfFence(i - n10 - 2, i - n14 + 1, n7 - n12 - 1);
    dgPillar(i - n14 + 5, n7 - n16 - 1, 5, false, false, 2, true);
    dgPillar(i - n14 + 13, n7 - n16 - 1, 5, false, false, 2, true);
    dgPillar(i + n4 - 5, n7 - n8 - 1, 5, false, false, 2, true);
    dgLineOfFence(i + n10 - 1, i + n4 + 2, n7 - n8 - 1);
    dgPillar(i + n10 - 5, n7 - n12 - 1, 5, false, false, 2, true);
    dgLineOfFence(i + n14 - 1, i + n10 + 2, n7 - n12 - 1);
    dgPillar(i + n14 - 5, n7 - n16 - 1, 5, false, false, 2, true);
    dgPillar(i + n14 - 13, n7 - n16 - 1, 5, false, false, 2, true);
    dgLineOfFence(i - n14 - 2, i + n14 + 2, n7 - n16 - 1);
    dgBottomWedge(i - n13, n7 - n16 + n2, 3, false);
    dgBottomWedge(i + n13 - 1, n7 - n16 + n2, 3, true);
    // 九处平台候选（:362-373，OverrideHeightFluff=0）
    platData.push({ x: i - n10 - 2, y: n7 - n8 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i - n10 - 2, y: n7 - n8 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i - n14 - 2, y: n7 - n12 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i - n14 - 2, y: n7 - n12 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i + n10 + 2, y: n7 - n8 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i + n10 + 2, y: n7 - n8 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i + n14 + 2, y: n7 - n12 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i + n14 + 2, y: n7 - n12 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）
    platData.push({ x: i, y: n7 - n12 + n2 - 3, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });   // ★TowerEntrance_AddPlatform NoWaterbolt=true（TED.cs:587）

    // 窗族（:375-429）——num30=n7-75；Regular=3+2+2+1 八窗 / Mosaic=大窗+2+2+1 五窗
    {
      const n30 = n7 - n16 + 20;
      // ★IIIII57（TED.cs:436-486 + DungeonWindowBasic.Window :32 / Mosaic :29）：
      //   Basic/Mosaic 窗玻璃 = Closed ? WindowClosedGlassWallType : WindowGlassWallType；
      //   入口地下（drunk/noSurface）⇒ Closed=true ⇒ 用 winGlassClosed（粉=98/绿=94/
      //   蓝=96）。旧移植恒用 winGlass(90) → W98>90×836 残差。Mosaic OverrideGlassType
      //   仅 !underground 时注入（:461-473）。
      const twG = entUnderground ? winGlassClosed : winGlass;
      if (windowType === 0) {
        dgWindowBasic(i - 9, n30 + 4, 5, 24, twG);
        dgWindowBasic(i + 9, n30 + 4, 5, 24, twG);
        dgWindowBasic(i, n30 + 3, 5, 28, twG);
      } else if (windowType === 1) {
        dgWindowMosaicSkel(i, n30 - 1, entUnderground ? winGlassClosed : 89);   // Override=89 仅非地下
      } else {
        dgWindowMosaicMoon(i, n30 + 5, entUnderground ? winGlassClosed : 91);
      }
      dgWindowBasic(i - 8, n7 - 16, 9, 24, twG);
      dgWindowBasic(i + 8, n7 - 16, 9, 24, twG);
      dgWindowBasic(i - 10, n7 - 37, 7, 11, twG);
      dgWindowBasic(i + 10, n7 - 37, 7, 11, twG);
      dgWindowBasic(i, n7 - 39, 7, 13, twG);
    }

    // 双侧门洞（:431-433）
    dgTowerDoor(i, n7, n4, n3, leftSide);
    dgTowerDoor(i, n7, n4, n3, !leftSide);
    // 老头锚（SetOldManSpawnAndSpawnOldManIfDefaultDungeon :1659——dungeonX/Y=(i,num7)）
    dungeonX = i; dungeonY = n7;
    // ★IIIII98b2：FTW NewNPC 头 Next(3) 主流掷镜像（同 legacy 锚注释；Tower :492）
    if (instIdx === 0 && gs.seedFlags.getGoodWorld) rn(3);
    // ★IIIII21（cs:493-495）：drunk 死生命树——x=i、y=(int)worldSurface、
    //   attachmentY=num7-num16+8、generateRoots=false。
    // ★IIIII84 刀①取证钩（WVLOG 门控零开销）：树前/树后主流样本序数（x86 侧对照=
    //   rig dg_tree_0/dg_te_post 段间 Δ）
    const mark88 = (tag: string): void => {
      const L = typeof globalThis !== 'undefined' ? (globalThis as { __wvLines?: string[] }).__wvLines : undefined;
      if (!L) return;
      const mrc = (typeof globalThis !== 'undefined' ? (globalThis as { __swRollN?: number }).__swRollN : undefined);
      L.push(`MARK|${tag}|mc=${mrc}`);
    };
    if (gs.seedFlags.drunkWorld) {
      mark88('tower.treePre');
      generateDungeonTree(i, Math.trunc(gs.worldSurface), n7 - n16 + 8, false);
      mark88('tower.treePost');
    }
    // 阶梯双侧（:437-443，depth=num5=100；★IIIII21：drunk 入口地下 → HasStairs 恒假
    //   整跳；num5 地下改 num17-m+5=45 同步登记不接线——阶梯关死无消费面）
    if (!entUnderground && !(gs.seedFlags.roundLandmasses)) {   // HasStairs（SpecialSeedFeatures.cs:41-51）
      dgStairs(i + n4, n7, 1, n5);
      dgStairs(i - n4, n7, -1, n5);
    }
    if (dgTW) dgTW.tower1 = dgMainRolls;
  }
  // ============ DomeDungeonEntrance.DomeEntrance（DomeDungeonEntrance.cs:40-441）============
  // ★FFFF 批（2026-08-18）1:1 转录，替换 XX 批备案的 Legacy 近似体（s12345 地牢盒
  //   typ 残差 13,433/墙 16,400 的根因）。正常种子路径：buried/underground/dual/
  //   desert 特典支不接线（同 Tower 备案；DungeonEntranceHasATree=drunk 专属跳过，
  //   DungeonEntranceHasStairs 正常种子=真→单侧阶梯 cs:435-439）。
  //   掷流：入口私有流 hr=UnifiedRandom(entSeed)——①flag2=Next(4)!=0（cs:52 树饰
  //   3/4）②windowType=Next(3)（cs:54-59）③TreeOnPillar 柱顶补土 Next(2/3/4)
  //   （cs:501 短路逐掷）；主流掷：门 PlaceTile×2+每窗 Next(1)+GrowTree 链。
  function dgDomeEntrance(i: number, j: number, preSeed: number): void {
    if (dgTW) { dgTW.tower0 = dgMainRolls; dgTW.i = i; dgTW.j = j; dgTW.pw = 0; dgTW.win = 0; dgTW.door = 0; dgTW.fence = 0; dgTW.opw = 0; dgTW.wt = 'na'; }
    const hr = dgUR(preSeed);
    const hrn = (n: number): number => hr.nextInt(n);
    const flag2 = hrn(4) !== 0;                    // 树饰开关（cs:52）
    const windowType = hrn(3);                     // 0=Regular 1=Skeletron 2=MoonLord
    if (dgTW) dgTW.wt = ['reg', 'skel', 'moon'][windowType] as string;
    const leftSide = b.side < 0;           // flag = dungeonSide==Left（★IIIII93b per-instance;drunkWorld 翻转=特典）
    // 120×120 清液+清坡（cs:63-76：liquid=0/lava(false)/Clear(Slope)）
    for (let x = i - 60; x < i + 60; x++) {
      for (let y = j - 60; y < j + 60; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0; st.liquidType[ti] = 0;
        st.slope[ti] = 0; st.half[ti] = 0;
      }
    }
    const n2 = 5, n3 = 35, n4 = 40, n5 = 100;
    const n7 = j - 30;                             // 基线（num6=30，cs:81）
    const num18 = n7 + 1;                          // cs:239
    // 地表侧圆清 Circle(20)（cs:93-102——Tower 是 Circle(15)@±num3，Dome 半径 20@±num4；
    // ★IIIII21：drunk 入口地下 → `!buried&&!underground` 门恒假（cs:95）→ 整段跳过）
    if (!(gs.seedFlags.drunkWorld)) {
      const cx = leftSide ? i + n4 - 1 : i - n4 + 1;
      const cy = n7 - 20, rad = 20, sq = (rad + 1) * (rad + 1);
      for (let yy = cy - rad; yy <= cy + rad; yy++) {
        const num2 = yy - cy;
        const num3 = Math.min(rad, Math.trunc(Math.sqrt(sq - num2 * num2)));
        for (let xx = cx - num3; xx <= cx + num3; xx++) {
          if (!st.inBounds(xx, yy)) continue;
          const ti = st.idx(xx, yy);
          st.type[ti] = 0; st.wall[ti] = 0; st.liquid[ti] = 0; st.liquidType[ti] = 0;
          st.flags[ti] = 0; st.slope[ti] = 0; st.half[ti] = 0;
        }
      }
    }
    // Bounds.SetBounds(i,j,i,j)+UpdateBounds(i-n4, n7-n4, i+n4+1, n7+10)（cs:60/:103）
    entBounds.set(i, j, i, j);
    entBounds.upd(i - n4, n7 - n4, i + n4 + 1, n7 + 10);
    entExists = true;
    // 基座箱（cs:104-237）——n 外 m 内（列优先，同 Tower）。Dome 窗带以 num3=35 为基：
    //   m∈[0,5) 带 [-30,-25]∪[25,30]、m∈[5,10) 内芯 [-30,30]、m≥10 表层换装；
    //   平台角点 (i-30,m=1)/(i+25,m=1)（Tower 是 ∓[31,35] 族）+(i,m=10)。
    const tileInStyle = (t: number): boolean => t === brick || t === crack;
    const wallInStyle = (v: number): boolean => v === wall;
    const clrAll = (ti: number): void => {
      st.type[ti] = 0; st.wall[ti] = 0; st.liquid[ti] = 0; st.liquidType[ti] = 0;
      st.flags[ti] = 0; st.slope[ti] = 0; st.half[ti] = 0;
    };
    for (let n = -n4; n <= n4; n++) {
      for (let m = -5; m < n5; m++) {
        const x = i + n, y = n7 + m;
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        const f2 = st.flags[ti] !== 0 && !tileInStyle(st.type[ti]);
        const f3 = !wallInStyle(st.wall[ti]);
        const f4 = isDW(st.wall[ti]);
        if (m < 0) clrAll(ti);
        else if (m < 5) {
          if ((n >= -n3 + n2 && n <= -n3 + n2 * 2) || (n >= n3 - n2 * 2 && n <= n3 - n2)) {
            clrAll(ti);
            if (!f4) st.wall[ti] = wall;
          } else if (!f4) {
            st.liquid[ti] = 0; st.liquidType[ti] = 0;
            chTileRaw(ti, brick);                // ★IIIII97b：Dome cs:135-148 裸赋值写（坡位保留）
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if (m < 10) {
          if (n >= -n3 + n2 && n <= n3 - n2) {
            clrAll(ti);
            st.wall[ti] = wall;                   // Clear 后 IsConsideredDungeonWall 恒假——无条件补墙
          } else if (!f4) {
            st.liquid[ti] = 0; st.liquidType[ti] = 0;
            chTileRaw(ti, brick);                // ★IIIII97b：Dome cs:166-180 裸赋值写
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if ((st.flags[ti] !== 0 && f2) || !f4) {
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          chTileRaw(ti, brick);                  // ★IIIII97b：Dome cs:191-203 裸赋值写
          if (n !== -n4 && n !== n4) st.wall[ti] = wall;
        } else if (f3) {
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          if (n !== -n4 && n !== n4) st.wall[ti] = wall;
        }
        if (m === 1 && (n === -n3 + n2 || n === n3 - n2 * 2)) platData.push({ x, y, hall: false, hf: 0, force: true, pots: 0.33000001311302185 });
        if (m === 10 && n === 0) platData.push({ x, y, hall: false, hf: 0, force: true, pots: 0.33000001311302185 });
      }
    }
    // 下行收敛通道（cs:207-237）：中列首 inactive 起 15 递减、尾 5 步收窄（同 Tower :214-244）
    {
      let n15 = -1, n16 = 6;
      for (let m = 10; m < 50; m++) {
        if (n15 === -1 && actAt(i, n7 + m) === 0) n15 = 15;
        if (n15 > 0) {
          n15--;
          if (n15 <= 0) break;
          if (n15 <= 5) n16--;
        }
        for (let k = -n16; k <= n16; k++) {
          const x = i + k, y = n7 + m;
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          clrAll(ti);
          st.wall[ti] = wall;                     // Clear 后 IsConsideredDungeonWall 恒假
        }
      }
    }
    // —— Slime 形状族（cs:242-263）——Shapes.Slime.Perform（Shapes.cs:114-143）：上半球
    //   oy-(int)(r*ys)..oy 全圆截面 + 下半球 oy+1..oy+(int)(r*ys*0.5)-1 的 (2/ys) 纵压
    //   截面；链 Fail=该格中断（_quitOnFail=false 形状续走），IsAboveHeight 严格小于。
    const slime = (ox: number, oy: number, radius: number, xs: number, ys: number,
      fn: (x: number, y: number) => void): void => {
      const sq = (radius + 1) * (radius + 1);
      for (let yy = oy - Math.trunc(radius * ys); yy <= oy; yy++) {
        const dy = (yy - oy) / ys;
        const hw = Math.trunc(Math.min(radius * xs, xs * Math.sqrt(sq - dy * dy)));
        for (let xx = ox - hw; xx <= ox + hw; xx++) fn(xx, yy);
      }
      for (let yy = oy + 1; yy <= oy + Math.trunc(radius * ys * 0.5) - 1; yy++) {
        const dy = (yy - oy) * (2.0 / ys);
        const hw = Math.trunc(Math.min(radius * xs, xs * Math.sqrt(sq - dy * dy)));
        for (let xx = ox - hw; xx <= ox + hw; xx++) fn(xx, yy);
      }
    };
    const DIRT = TILE_INTERNAL_BY_SHEET.get(0) ?? -1;    // num19（desert 特典=53 不接线）
    const GRASS = TILE_INTERNAL_BY_SHEET.get(2) ?? -1;   // num20（desert 特典=-1 不接线）
    // ①穹壳（cs:242）：Slime(40,1,1)@(i,n7) y<n7+1 且 wall≠主墙 → UpdateBounds
    //   (data.dungeonBounds)+Clear+SetTile(brick)——入口体是 dungeonBounds 的扩界源
    const DOME_SOLID = (x: number, y: number): boolean => {
      const d = TILE_DEFS[st.type[st.idx(x, y)]];
      return !!d?.solid && !d.platform;
    };
    const exposedToAir = (x: number, y: number): boolean => {   // TileIsExposedToAir（cs:54810）
      if (!inW(x, y, 2)) return false;
      for (let a = x - 1; a <= x + 1; a++) {
        for (let b = y - 1; b <= y + 1; b++) {
          const ti = st.idx(a, b);
          if (st.flags[ti] === 0 || !DOME_SOLID(a, b)) return true;
        }
      }
      return false;
    };
    slime(i, n7, n4, 1.0, 1.0, (x, y) => {
      if (y >= num18 || !st.inBounds(x, y)) return;
      const ti = st.idx(x, y);
      if (st.wall[ti] === wall) return;           // SkipWalls(brickWallType)
      bounds.upd(x, y);                           // Actions.UpdateBounds(data.dungeonBounds)
      clrAll(ti);                                 // Actions.Clear
      st.flags[ti] = 1; st.type[ti] = brick;      // SetTile(clearTile:false)——不清坡（Clear 已先行）
    });
    // ②穹内墙（cs:243）：Slime(38,1,1) y<n7+2 且 wall≠主墙 → SetWall（clearTile:false）
    slime(i, n7, n4 - 2, 1.0, 1.0, (x, y) => {
      if (y >= num18 + 1 || !st.inBounds(x, y)) return;
      const ti = st.idx(x, y);
      if (st.wall[ti] === wall) return;
      st.wall[ti] = wall;
    });
    // ③表土穹丘（cs:254）：Slime(40,0.9,1.1)@(i,n7-4) y<n7-1 且非砖/非主墙 → 清+置土(0)
    slime(i, n7 - n2 + 1, n4, 0.9, 1.1, (x, y) => {
      if (y >= num18 - 2 || !st.inBounds(x, y)) return;
      const ti = st.idx(x, y);
      if (st.flags[ti] !== 0 && st.type[ti] === brick) return;   // SkipTiles(brickTileType)
      if (st.wall[ti] === wall) return;                          // SkipWalls(brickWallType)
      clrAll(ti);
      st.flags[ti] = 1; st.type[ti] = DIRT;
    });
    // ④草皮（cs:255-258）：同形状 OnlyTiles(0)+IsTouchingAir(对角) → SetTile(2)
    slime(i, n7 - n2 + 1, n4, 0.9, 1.1, (x, y) => {
      if (y >= num18 - 2 || !st.inBounds(x, y)) return;
      const ti = st.idx(x, y);
      if (st.flags[ti] === 0 || st.type[ti] !== DIRT) return;    // OnlyTiles(num19)
      if (!exposedToAir(x, y)) return;                           // IsTouchingAir(useDiagonals:true)
      st.flags[ti] = 1; st.type[ti] = GRASS;
    });
    // ⑤内腔清块（cs:262）：Slime(35,1,1)@(i,n7) y<n7+1 → ClearTile（保墙）
    slime(i, n7, n3, 1.0, 1.0, (x, y) => {
      if (y >= num18 || !st.inBounds(x, y)) return;
      const ti = st.idx(x, y);
      st.flags[ti] = 0; st.slope[ti] = 0; st.half[ti] = 0;       // Actions.ClearTile→Tile.ClearTile（亦清 inActive；本段在柱族①之前无交叉）
    });
    // 门（cs:264-271）：DomeEntrance_Door 与 TowerEntrance_Door 逐行同源——正常种子
    //   仅 dungeon 侧单门（buried/underground 特典才补镜像门）
    //   ★IIIII21：drunk=入口地下 → `buried|underground` 支（cs:309-311）追加对侧门
    dgTowerDoor(i, n7, n4, n3, leftSide);
    if (gs.seedFlags.drunkWorld) {
      dgTowerDoor(i, n7, n4, n3, !leftSide);
    }
    // 窗族（cs:272-343）——Dome 点位（Basic 宽恒 5；OverrideGlassPaint=26 墙漆不入
    //   四通道不建模，同 Tower 备案）
    {
      if (windowType === 0) {
        dgWindowBasic(i - 8, n7 - 16, 5, 24, -1);
        dgWindowBasic(i + 8, n7 - 16, 5, 24, -1);
        dgWindowBasic(i, n7 - 17, 5, 28, -1);
        dgWindowBasic(i - n3 + 6, n7 - 8, 5, 10, -1);
        dgWindowBasic(i + n3 - 6, n7 - 8, 5, 10, -1);
        dgWindowBasic(i - n3 + 15, n7 - 11, 5, 11, -1);
        dgWindowBasic(i + n3 - 15, n7 - 11, 5, 11, -1);
      } else if (windowType === 1) {
        dgWindowMosaicSkel(i, n7 - 19, 89);      // OverrideGlassType=89（非 underground）
        dgWindowBasic(i - n3 + 6, n7 - 8, 5, 10, -1);
        dgWindowBasic(i + n3 - 6, n7 - 8, 5, 10, -1);
        dgWindowBasic(i - n3 + 15, n7 - 11, 5, 11, -1);
        dgWindowBasic(i + n3 - 15, n7 - 11, 5, 11, -1);
      } else {
        dgWindowMosaicMoon(i, n7 - 17, 91);      // OverrideGlassType=91
        dgWindowBasic(i - n3 + 6, n7 - 8, 5, 10, 241);
        dgWindowBasic(i + n3 - 6, n7 - 8, 5, 10, 91);
        dgWindowBasic(i - n3 + 15, n7 - 11, 5, 11, 90);
        dgWindowBasic(i + n3 - 15, n7 - 11, 5, 11, 88);
      }
    }
    // 柱族①（cs:344-358）：两根 3 宽 BlockActuated 全高柱@i±(num3-21)——MMMM 批补
    //   inActive 位（wire bit5；Height=0=上行自动扫描至穹顶）
    dgPillar(i - n3 + 21, n7, 3, true, true, 0, true, true);
    dgPillar(i + n3 - 21, n7, 3, true, true, 0, true, true);
    // 四平台候选（cs:359-400）：上对 NoWaterbolt=true / 下对无（books 链 Next(50) 分野）
    platData.push({ x: i - n3 + 15, y: n7 - 25, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });
    platData.push({ x: i + n3 - 15, y: n7 - 25, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612, nowb: true });
    platData.push({ x: i - n3 + 15, y: n7 - 20, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i + n3 - 15, y: n7 - 20, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    // 柱族②（cs:402-419）：Block 楔柱 5×16@i±(num4-2),n7-10 / 4×14@i±(num3-8),n7-28 /
    //   3×13@i±(num3-21),n7-37（无冠、AlwaysPlaceEntirePillar）
    dgPillar(i - n4 + 2, n7 - 10, 5, false, false, 16, true);
    dgPillar(i + n4 - 2, n7 - 10, 5, false, false, 16, true);
    dgPillar(i - n3 + 8, n7 - 28, 4, false, false, 14, true);
    dgPillar(i + n3 - 8, n7 - 28, 4, false, false, 14, true);
    dgPillar(i - n3 + 21, n7 - 37, 3, false, false, 13, true);
    dgPillar(i + n3 - 21, n7 - 37, 3, false, false, 13, true);
    // 柱顶树（cs:420-428，flag2=3/4）：补土掷走 hr 流、GrowTree 走主流（ignoreWalls）
    if (flag2) {
      const treeOnPillar = (pillarX: number, pillarY: number): void => {
        // DomeEntrance_TreeOnPillar（cs:475-522）
        if (!inW(pillarX, pillarY, 5) || actAt(pillarX, pillarY - 1) !== 0) return;
        for (let a = 0; a < 5; a++) {
          const x = pillarX + a - 2;
          for (let b = 0; b <= 3; b++) {
            const y = pillarY + b;
            if (!st.inBounds(x, y)) continue;
            const ti = st.idx(x, y);
            if (st.wall[ti] !== wall) st.wall[ti] = 0;            // 非主墙清墙（cs:497-500）
            // j==0 恒置；j==1 Next(2)!=0；j==2 Next(3)==0；j==3 Next(4)==0（短路逐掷）
            if ((b !== 1 || hrn(2) !== 0) && (b !== 2 || hrn(3) === 0) && (b !== 3 || hrn(4) === 0)) {
              st.type[ti] = exposedToAir(x, y) ? GRASS : DIRT;    // TileIsExposedToAir→草否则土
            }
          }
        }
        // TryGrowingTreeByType(5,…,ignoreWalls:true)（cs:516-521）→ TreePass.growTree 桥接
        growTree(st, rng, gs, pillarX, pillarY, true);
      };
      treeOnPillar(i - n4 + 2, n7 - 10 - 16 + 1);
      treeOnPillar(i - n3 + 8, n7 - 28 - 16 + 2 + 1);
      treeOnPillar(i - n3 + 21, n7 - 37 - 16 + 3 + 1);
      treeOnPillar(i + n4 - 2, n7 - 10 - 16 + 1);
      treeOnPillar(i + n3 - 8, n7 - 28 - 16 + 2 + 1);
      treeOnPillar(i + n3 - 21, n7 - 37 - 16 + 3 + 1);
    }
    // 老头锚（cs:430 SetOldManSpawnAndSpawnOldManIfDefaultDungeon :1659——
    //   CurrentDungeon==0 时 Main.dungeonX/Y=(i,num7)。AAAA 批 :3864 的锚语义在此本体化）
    dungeonX = i; dungeonY = n7;
    // ★IIIII98b2：FTW NewNPC 头 Next(3) 主流掷镜像（同 legacy 锚注释；Dome :472）
    if (instIdx === 0 && gs.seedFlags.getGoodWorld) rn(3);
    // ★IIIII21（cs:473-475）：drunk 死生命树——x=i、y=(int)worldSurface、
    //   attachmentY=num7-num3+5、generateRoots=false（穹顶座无根）。
    if (gs.seedFlags.drunkWorld) {
      generateDungeonTree(i, Math.trunc(gs.worldSurface), n7 - n3 + 5, false);
    }
    // 阶梯（cs:435-439，HasStairs 正常种子=真；★IIIII21：drunk 入口地下恒假 → 整跳；
    //   num5 地下改 50-10+5=45 同步登记不接线——阶梯关死无消费面）
    if (!(gs.seedFlags.drunkWorld)) {
      dgStairs(leftSide ? i + n4 : i - n4, n7, leftSide ? 1 : -1, n5);
    }
    if (dgTW) dgTW.tower1 = dgMainRolls;
  }
  // shelf 段定标（dgPlatforms 尾）——dormant 计数

  // ============ DungeonUtils.GenerateDungeonStairs（:1222-1310）+ CanPlaceTile（:1312-1329）============
  // GenerateDungeonStairs_CanPlaceTile：outerPotTop-5 门 + CanKillTile + tileFrameImportant 全表
  function stairsCanPlace(x: number, y: number): boolean {
    if (y >= potT - 5) return false;                       // outerPotentialBounds.Top-5 门（:1316）
    if (x < 0 || x >= w || y < 0 || y >= h) return false;  // Main.tile 越界守卫（原版隐式）
    const ti = st.idx(x, y);
    if (st.flags[ti] !== 0) {
      if (!canKill(x, y)) return false;                    // WorldGen.CanKillTile（DoorsF 同款建模）
      const sheet = TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1;
      if (DG_FRAMED_ALL.has(sheet)) return false;          // tileFrameImportant（:1324）
    }
    return true;
  }
  function dgStairs(i: number, j: number, dir: number, depth: number): void {
    if (!inW(i, j, 20)) return;                            // :1226
    let num = depth, num2 = depth;
    const num3 = dir === 1 ? 1 : -1;
    let num4 = 0;
    for (let k = i; dir === 1 ? k < i + num2 : k > i - num2; k += num3) {
      num4++;
      for (let l = j + num4; l < j + num; l++)
        if (inW(k, l, 10) && !stairsCanPlace(k, l + 5) && num > l) { num = l; break; }
    }
    num2 = num;
    const sdep = num;
    num4 = 0;
    for (let m = i; dir === 1 ? m < i + num2 : m > i - num2; m += num3) {
      num4++;
      for (let n = j + num4; n < j + sdep; n++) {
        if (!inW(m, n, 10) || n >= potT - 5) continue;
        for (let q = 0; q < 4; q++)                        // n..n-3 清液（:1276-1279）
          if (n - q >= 0 && m >= 0 && m < w) st.liquid[(n - q) * w + m] = 0;
        if (!stairsCanPlace(m, n)) continue;
        const ti = st.idx(m, n);
        const fl = wallAt(m, n) === wall;                  // WallIsInStyle（Default 单样式=BrickWallType）
        if (fl) {
          if (actAt(m, n) !== 0) chTile(ti, brick, false); // 原版仅 active 格改 type（幽灵保 type）
          st.wall[ti] = wall;
        } else {
          chTile(ti, brick, false);                        // active(true)+type+清 slope
          if (n !== j + num4) st.wall[ti] = wall;          // 台面行不写墙（:1301-1304）
        }
      }
    }
  }

  // ============ 门/平台候选 ============
  // CalculatePlatformsAndDoorsOnEdgesOfRoom（DungeonUtils.cs:91-224，fluff=3）
  function roomPlatformsDoors(rm: DRoom): void {
    const num = Math.max(5, rm.inner.L), num2 = Math.min(w - 5, rm.inner.R);
    const num3 = Math.max(5, rm.inner.T), num4 = Math.min(h - 5, rm.inner.B);
    let f2 = false, f3 = false;
    for (let x = num; x <= num2; x++) {
      if (!f2 && inW(x, num3 - 1, 0) && actAt(x, num3 - 1) === 0) {
        platData.push({ x, y: num3 - 1, hall: false, hf: 3 }); f2 = true;
      }
      if (!f3 && inW(x, num4 + 1, 0) && actAt(x, num4 + 1) === 0) {
        platData.push({ x, y: num4 + 1, hall: false, hf: 3 }); f3 = true;
      }
      if (f2 && f3) break;
    }
    let f4 = false, f5 = false;
    for (let y = num3; y <= num4; y++) {
      if (!f4 && inW(num - 1, y, 0) && actAt(num - 1, y) === 0) {
        doorData.push({ x: num - 1, y, dir: -1, hall: false, skipOther: false, skipSpace: false, clear: true, fluff: 3 }); f4 = true;
      }
      if (!f5 && inW(num2 + 1, y, 0) && actAt(num2 + 1, y) === 0) {
        doorData.push({ x: num2 + 1, y, dir: 1, hall: false, skipOther: false, skipSpace: false, clear: true, fluff: 3 }); f5 = true;
      }
      if (f4 && f5) break;
    }
  }
  // LegacyDungeonHall.CalculatePlatformsAndDoors（:26-34；LegacyEntrance 覆写为空）
  // ★2026-08-16 审计：走廊门无 OverrideWidthFluff → DungeonGlobalDoors.cs:58 num4=10
  //   （20 列扫描窗）；曾写 0 = 只扫门位单列。房间门才覆写 3。
  function hallPlatformsDoors(hl: DHall): void {
    if (hl.isEntrance) return;
    if (Math.abs(hl.sdy) <= 0.1) doorData.push({ x: Math.trunc(hl.sx), y: Math.trunc(hl.sy), dir: 0, hall: true, skipOther: false, skipSpace: false, clear: true, fluff: 10 });
    else platData.push({ x: Math.trunc(hl.sx), y: Math.trunc(hl.sy), hall: true, hf: 5 });
    if (Math.abs(hl.edy) <= 0.1) doorData.push({ x: Math.trunc(hl.ex), y: Math.trunc(hl.ey), dir: 0, hall: true, skipOther: false, skipSpace: false, clear: true, fluff: 10 });
    else platData.push({ x: Math.trunc(hl.ex), y: Math.trunc(hl.ey), hall: true, hf: 5 });
  }
  // DungeonData.CanGenerateFeatureAt（:132-166）。feat: 0=常规 1=BiomeChests 2=Paintings/WallVariants
  function featOK(x: number, y: number, feat: number): boolean {
    if (!inW(x, y, 5)) return false;
    if (wallAt(x, y) === 350) return false;
    if (feat === 1 && entExists && entBounds.contains(x, y)) return false;
    // feat 3=WallVariants（pit/window 门均放行：DungeonPitTrap.cs:35/DungeonWindow.cs:11）
    if (feat !== 2 && feat !== 3) {
      for (const pb of pits) if (pb.contains(x, y)) return false;
    }
    if (feat !== 3) {
      for (const wb of winBoxes) if (wb.contains(x, y)) return false;   // ★QQQQQQ 窗盒门
    }
    return true;
  }
  // ★MMMM 批：Dome/Tower 入口盒内拒 Spikes/Bookshelves/Paintings——DomeDungeonEntrance.cs:31-38
  //   与 TowerDungeonEntrance.cs:31-38 的 CanGenerateFeatureAt 覆写同款（Legacy 只拒
  //   BiomeChests=feat1，上表已覆）。入口 hitbox=Bounds（CalculateHitbox 后）=entBounds。
  const entNoFeat = (x: number, y: number): boolean =>
    entKind !== 0 && entExists && entBounds.contains(x, y);
  const featAreaOK = (x: number, y: number, fluff: number): boolean => {
    for (let a = x - fluff; a <= x + fluff; a++) {
      for (let b = y - fluff; b <= y + fluff; b++) {
        if (!featOK(a, b, 0)) return false;
      }
    }
    return true;
  };
  // ============ Early（Default：仅 pit 陷阱循环，cs:662-700）+ DungeonPitTrap（:42-390）============
  function dgEarly(): void {
    dgpMark('early_features_start');
    const cnt = Math.trunc(w * 2.0);
    for (let n = 0; n < cnt; n++) {
      const x3 = ri(bounds.L, bounds.R - 1);
      let n44 = bounds.T;
      if (n44 < dungeonY + 25) n44 = dungeonY + 25;
      if (n44 < ws) n44 = Math.trunc(ws);
      const y2 = ri(n44, bounds.B - 1);
      const flooded = pitFlood || rn(8) === 0;
      const n45 = ri(6, 9);
      const wid = ri(8, 18), hgt = ri(19, 45), ew = ri(6, 9);
      // ★IIIII93 取证钩（dormant）：__dgPitTrace 挂载时逐 attempt 记账（与 x86 rig
      //   p97|n|in/out 同位同序；普通路径零开销）。
      const pitT = (globalThis as { __dgPitTrace?: Array<Record<string, number>> }).__dgPitTrace;
      const okP = dgPitTrap(x3, y2, wid, hgt, ew, n45, flooded);
      const cumN = (globalThis as { __i97cum?: { n: number } }).__i97cum;
      if (pitT) pitT.push({ s: x3, t: y2, w: wid, h: hgt, e: ew, d: n45, f: flooded ? 1 : 0, r: okP ? 1 : 0, cum: cumN ? cumN.n : -1 });
      if (okP) {
        if (flooded) pitFlood = false;
        n += 1500;
      } else n++;
    }
  }
  function dgPitTrap(ix: number, jy: number, width: number, height: number, edgeW: number, topD: number, flooded: boolean): boolean {
    // ★IIIII98b2 取证钩（dormant）：x86 rig PFR|rN| 失败码镜像——__dgPitTrace 挂载时，
    //  每次尝试按 C# DungeonPitTrap.PitTrap 受理谓词原序记 R 码（成功='OK'），与
    //  __dgPitTrace 序号一一对应；普通路径零开销零行为差。
    const pitR = (globalThis as { __dgPitTrace?: unknown }).__dgPitTrace != null
      ? (code: string): void => {
          const g = globalThis as unknown as { __dgPitReason?: string[] };
          (g.__dgPitReason ??= []).push(code);
        }
      : null;
    let num = jy, num2 = jy;
    if (width < 1 || height < 1) { if (pitR) pitR('R1'); return false; }
    const n6 = width + edgeW, n7 = height + topD;
    if (!inW(ix, num, Math.max(n6, n7))) { if (pitR) pitR('R2'); return false; }
    if (!isDW(wallAt(ix, num))) { if (pitR) pitR('R3'); return false; }
    if (actAt(ix, num) !== 0) { if (pitR) pitR('R5'); return false; }
    for (let k = num; k < h; k++) {
      if (k > h - 200) { if (pitR) pitR('R6'); return false; }
      // ★IIIII93-FTW（DungeonPitTrap.cs:100-102）：竖向落底扫描的实心判定 =
      //   原版 **WorldGen.SolidTile(i,k) 全项版**（active∧tileSolid∧!solidTop∧
      //   !halfBrick()∧slope()==0∧!inActive）。旧 JS 用窄化 dgSolid（缺 half/slope
      //   两判项）⇒ 落底行钉在坡位/半砖帽上（FTW 本种子 pit 锚恰逢其上），
      //   num/num2 抬升一格 → 壳写/裂缝转换/刺梳全体错位（Face-A：stcmp masked
      //   表首分叉 @dungeonPi，W9161+T11224+L1168；#4/#5 号 pit 右缘缩格、后段
      //   整阱洗牌）。本域改用 IIII65 全项版谓词，其余 dgSolid 站点不动。
      if (actAt(ix, k) !== 0 && dgSpreadSolid(ix, k)) {
        if (typAt(ix, k) === SPIKE) { if (pitR) pitR('R7'); return false; }
        num = k; num2 = k;
        break;
      }
    }
    if (!isDW(wallAt(ix - width, num)) || !isDW(wallAt(ix + width, num))) { if (pitR) pitR('R8'); return false; }
    const n8 = 30;
    for (let n = num; n < num + n8; n++) {
      let ok = true;
      for (let x = ix - width; x <= ix + width; x++) {
        if (actAt(x, n) !== 0 && isDT(typAt(x, n))) { ok = false; break; }
      }
      if (ok) { num = n; break; }
    }
    if (num + n7 >= h - 200) { if (pitR) pitR('R11'); return false; }
    for (let x = ix - width; x <= ix + width; x++) {
      for (let y = num; y <= num + height; y++) {
        if (actAt(x, y) !== 0 && (isDT(typAt(x, y)) || typAt(x, y) === crack)) { if (pitR) pitR('R14'); return false; }
      }
    }
    for (let x = ix - width; x <= ix + width; x++) {
      for (let y = num2; y <= num + height; y++) {
        const ti = st.idx(x, y);
        if (st.flags[ti] !== 0 && isDT(st.type[ti])) {
          chTile(ti, crack, true);
          chWall(ti, wall, false);
        }
      }
    }
    for (let x = ix - n6; x <= ix + n6; x++) {
      for (let y = num2; y <= num + n7; y++) {
        const ti = st.idx(x, y);
        st.liquidType[ti] = 0; st.liquid[ti] = 0;
        if (isDW(st.wall[ti])) continue;
        if (x > ix - n6 && x < ix + n6 && y < num + n7) {
          const ow = st.wall[ti];
          chTile(ti, brick, true);
          if (!isDW(ow)) chWall(ti, wall, false);
        } else chTile(ti, brick, false);
      }
    }
    for (let x = ix - width; x <= ix + width; x++) {
      for (let y = num2; y <= num + height; y++) {
        const ti = st.idx(x, y);
        const f6 = st.type[ti] !== crack;
        if (!f6) continue;
        // ★III 批 2026-08-18：flooded pit trap 是 lava(false)=**水**（DungeonPitTrap
        //   cs:161 liquid=255 + lava(false)）——本仓 +1 编码水=1，曾写 0 → 032 Lt=946
        //   格差（x86 lty 0=水 ↔ JS 0=无类型）。
        if (flooded) { st.liquidType[ti] = 1; st.liquid[ti] = 255; }
        else { st.liquidType[ti] = 0; st.liquid[ti] = 0; }
        const a = x === ix - width && actAt(x - 1, y) !== 0;
        const b = x === ix + width && actAt(x + 1, y) !== 0;
        const c = y === num + height && actAt(x, y + 1) !== 0;
        const d = x === ix - width + 1 && y % 2 === 0 && actAt(x - 1, y) !== 0;
        const e = x === ix + width - 1 && y % 2 === 0 && actAt(x + 1, y) !== 0;
        const f = y === num + height - 1 && x % 2 === 0 && actAt(x, y + 1) !== 0;
        if (a || b || c || d || e || f) chTile(ti, SPIKE, false);
        else st.flags[ti] = 0;
      }
    }
    const pb = new DBnd(w, h);
    pb.set(ix - n6, num2, ix + n6, num + n7);
    pits.push(pb);
    if (pitR) pitR('OK');
    return true;
  }

  // ============ DungeonGlobalSpikes（:900-1105）============
  const canSupportSpike = (x: number, y: number): boolean => {
    if (actAt(x, y) === 0) return false;
    const t = typAt(x, y);
    const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    if (DG_FRAMED_NOT_CUT.has(sheet)) return false;
    if (sheet === 481 || sheet === 482 || sheet === 483) return false;
    return true;
  };
  function spikeRun(round: number, cx: number, cy: number, wx: number, wy: number, d: number, n11: number, step: number): number {
    // ★IIIII93 取证钩（SW_DGSPK_TRACE=1+SW_DGSPK_BOX=x0,y0,x1,y1 窗内打印；缺省零开销）
    const spkT = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DGSPK_TRACE != null
      ? (kind: string, s0: string): void => {
          const b = ((__swProcessEnv ?? {}).SW_DGSPK_BOX ?? '').split(',').map(Number) as number[];
          if (!b.length) return;
          const inside = cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3];
          if (inside) console.log(`SPK r${round} ${kind} @${cx},${cy} d=${d} st=${step} n11=${n11} ${s0}`);
        }
      : null as ((k: string, s0: string) => void) | null;
    if (spkT) {
      const bb = ((__swProcessEnv ?? {}).SW_DGSPK_BOX ?? '').split(',').map(Number);
      const inB = (q: number, r: number): boolean => q >= bb[0] && q <= bb[2] && r >= bb[1] && r <= bb[3];
      if (inB(cx, cy) || inB(wx, wy)) console.log(`SPK r${round} RUN @${cx},${cy}|${wx},${wy} d=${d} st=${step} n11=${n11}`);
    }
    while (n11 > 0) {
      let cond: boolean;
      if (round === 0) {
        const nb = cx + step;
        cond = inW(nb, wy, 0) && actAt(nb, wy) !== 0 && canSupportSpike(nb, wy)
          && inW(cx, wy + d, 0) && actAt(cx, wy + d) !== 0
          && inW(cx, wy, 0) && actAt(cx, wy) !== 0
          && inW(cx, wy - d, 0) && actAt(cx, wy - d) === 0;
      } else {
        const nb = cy + step;
        cond = inW(wx, nb, 0) && actAt(wx, nb) !== 0 && canSupportSpike(wx, nb)
          && inW(wx + d, cy, 0) && actAt(wx + d, cy) !== 0
          && inW(wx, cy, 0) && actAt(wx, cy) !== 0
          && inW(wx - d, cy, 0) && actAt(wx - d, cy) === 0;
      }
      if (!cond) break;
      const fx = round === 0 ? cx : wx, fy = round === 0 ? wy : cy;
      // ★IIIII93 勘误（DungeonGlobalSpikes.cs:83/:173）：拒绝门的第二查格 =
      //   【舌格】——round0(纵向行写)为 (num8, i-num10) 竖移；round1(纵列写,
      //   num14 为横符号)为 (j-num14, num12) **横移**。旧 JS 两轮共用 (fx, fy-d)
      //   把 round1 的伴查格转成竖向 ⇒ 在边界砖沿（下方/上方恰有保护域或窗格）
      //   处误拒一整步：single-cell spike↔brick 面（bigcrc (3795,901) 实证；
      //   反演重放基座 selfcheck=0 + 全流值级逐位等、仅多掷末位 RunPass sink）。
      // ★IIIII93：伴查格（DGS:83/:173）——取证开关经 _i93LegacySpike 缓存，热循环零 env 读。
      const compX = round === 0 ? fx : (_i93LegacySpike ? fx : wx - d);
      const compY = round === 0 ? fy - d : (_i93LegacySpike ? fy - d : cy);
      if (spkT) spkT('STEP', `cell=${fx},${fy} comp=${compX},${compY}`
        + ` fA=${featOK(fx, fy, 0) ? 1 : 0}/${entNoFeat(fx, fy) ? 1 : 0}`
        + ` fB=${featOK(compX, compY, 0) ? 1 : 0}/${entNoFeat(compX, compY) ? 1 : 0}`);
      if (!featOK(fx, fy, 0) || entNoFeat(fx, fy) || !featOK(compX, compY, 0)
        || entNoFeat(compX, compY)) {
        if (spkT) spkT('REFUSE', '');
        if (round === 0) cx += step; else cy += step;
        n11 = 0;
        continue;
      }
      if (spkT) spkT('WRITE', '');
      st.type[st.idx(fx, fy)] = SPIKE;   // 支承格本就 active（DGS:81 直写 type 不清坡）
      if (round === 0) {
        if (inW(cx - 1, wy - d, 0) && actAt(cx - 1, wy - d) === 0
          && inW(cx + 1, wy - d, 0) && actAt(cx + 1, wy - d) === 0) {
          let ti = st.idx(cx, wy - d);
          st.type[ti] = SPIKE; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;   // DGS:84-86
          ti = st.idx(cx, wy - d * 2);
          st.type[ti] = SPIKE; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;   // DGS:89-91
        }
        cx += step;
      } else {
        if (inW(wx - d, cy - 1, 0) && actAt(wx - d, cy - 1) === 0
          && inW(wx - d, cy + 1, 0) && actAt(wx - d, cy + 1) === 0) {
          let ti = st.idx(wx - d, cy);
          st.type[ti] = SPIKE; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;   // DGS:110-116 同款
          ti = st.idx(wx - d * 2, cy);
          st.type[ti] = SPIKE; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;
        }
        cy += step;
      }
      n11--;
    }
    return n11;
  }
  function dgSpikes(): void {
    const num = wallVariants[0];
    // ★IIIII50（DungeonGlobalSpikes.cs:33-36）：getGoodWorldGen → 刺配额 num7×3。
    //   该 feature 每轮至少 2 掷×num7，漏接即本 pass 后半（墙变体扫描/下层房群）
    //   全部掷流顺移——FTW 链 #32 Dungeon 起万格级混乱的根因；其他七链 flag 关闭
    //   不触，故历次回归全绿独漏此臂。
    const num7 = Math.trunc(42 * (w / 4200) * Math.max(1, 0.25))
      * (gs.seedFlags.getGoodWorld ? 3 : 1);
    for (let round = 0; round < 2; round++) {
      let n3 = 0;
      const n4 = 1000;
      let n5 = 0;
      while (n5 < num7) {
        n3++;
        const x = ri(bounds.L, bounds.R - 1);
        // ★IIIII59（2026-08-30 掷账定罪）：vanilla round1 是【两步掷】——先
        //   Next(worldSurface+25,Bottom)（cs:352），drunk/noSurface 才**重掷**
        //   Next(generatingDungeonPositionY+25,Bottom)（cs:353-355）。旧 JS 把两步压成
        //   单掷 ⇒ drunk 每 attempt 少耗 1 主流骰（≈1050 attempt 级 ×Δ=round1 缺口），
        //   S→D 段 Δ+508 主源（mile8 row32 W{8,98,99} 家族+尖刺互换的直接根因）。
        let y = ri(Math.trunc(ws) + 25, bounds.B - 1);   // cs:352/:520 首掷恒 ws 域
        // ★IIIII59：重掷门按轮取异——round1(cs:353-355)=drunk∨noSurface；
        //   round2(cs:521-523)=**仅 noSurface**（drunk 不重掷，沿用 ws 域样本）。
        //   旧 JS 两轮共用单掷且 round2 也吃 drunk 深域——正链(旗关)零暴露、
        //   DRUNK 双重错位：每 attempt 少 1 骰(round1)+深窗误判(round2)。
        if (round === 0 ? (gs.seedFlags.drunkWorld || gs.seedFlags.noSurface) : gs.seedFlags.noSurface) {
          y = ri(posY + 25, bounds.B - 1);               // DeepSpike 重掷支
        }
        if (wallAt(x, y) === num && actAt(x, y) === 0) {
          const d = rn(2) === 0 ? -1 : 1;
          const oy = y;                                   // num13：原始采样点（第二段起点基准）
          let wx = x, wy = y;
          // cs:68-70/:168 扫描循环逐句保形：round1【无界】(仅活性终止)；round2 带
          //   `j>5 && j<maxTilesX-5` 界（cs:171）。越出 store 视同原版异常中止。
          for (;;) {
            if (!st.inBounds(wx, wy)) break;
            if (actAt(wx, wy) !== 0) break;
            if (round === 1 && !(wx > 5 && wx < w - 5)) break;
            if (round === 0) wy += d; else wx += d;
          }
          const hit = st.inBounds(wx, wy);
          let okA: boolean, okB: boolean, okC: boolean, okD2: boolean, okE: boolean;
          if (round === 0) {
            okA = hit && inW(wx - 1, wy, 0) && actAt(wx - 1, wy) !== 0;
            okB = hit && inW(wx + 1, wy, 0) && actAt(wx + 1, wy) !== 0;
            okC = hit && inW(wx - 1, wy, 0) && canSupportSpike(wx - 1, wy);
            okD2 = hit && inW(wx - 1, wy - d, 0) && actAt(wx - 1, wy - d) === 0;
            okE = hit && inW(wx + 1, wy - d, 0) && actAt(wx + 1, wy - d) === 0;
          } else {
            okA = hit && inW(wx, wy - 1, 0) && actAt(wx, wy - 1) !== 0;
            okB = hit && inW(wx, wy + 1, 0) && actAt(wx, wy + 1) !== 0;
            okC = hit && inW(wx, wy - 1, 0) && canSupportSpike(wx, wy - 1);
            okD2 = hit && inW(wx - d, wy - 1, 0) && actAt(wx - d, wy - 1) === 0;
            okE = hit && inW(wx - d, wy + 1, 0) && actAt(wx - d, wy + 1) === 0;
          }
          if (okA && okB && okC && okD2 && okE) {
            n5++;
            let n11 = ri(5, 12);
            // ★D8（2026-08-13 复核）：首段起点 = 命中格本身。原版 num8/num12 在命中判定后
            //   不预偏移（DungeonGlobalSpikes.cs:66-72/:163-170），while 条件查"步进方向下一格"
            //   支撑、放置"当前格"（:73-96/:170-193）→ 首刺落在命中格，再向两侧延伸。旧代码
            //   先 -1 使整段尖刺列（含 2-3 层带）整体错位一格、丢命中格尖刺。
            const c1x = wx, c1y = wy;
            spikeRun(round, c1x, c1y, wx, wy, d, n11, -1);
            n11 = ri(5, 12);
            const c2x = round === 0 ? x + 1 : wx, c2y = round === 0 ? wy : oy + 1;
            spikeRun(round, c2x, c2y, wx, wy, d, n11, 1);
          }
        }
        if (n3 > n4) { n3 = 0; n5++; }
      }
    }
  }
  // ============ DungeonGlobalDoors（:24-294）============
  const canKill = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const ti = st.idx(x, y);
    if (st.flags[ti] === 0) return false;
    if (st.wall[ti] === 350) return false;
    const t = st.type[ti];
    if (t === DOOR) return false;                       // IsLockedDoor(style13)
    if (t === CHEST || t === CHEST2) return false;      // CanDestroyChest：生成期有物
    return true;
  };
  function dgDoorsF(): void {
    // 对账插桩(dormant)：SW_DG_DOOR_TRACE=1 时逐 doorData 记选列/开区/清墙段（D 段猎杀用）
    const drT = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_DOOR_TRACE === '1';
    for (const d of doorData) {
      if (drT) console.log(`DGD-IN x=${d.x} y=${d.y} dir=${d.dir} clear=${d.clear ? 1 : 0} hall=${d.hall ? 1 : 0}`);
      if (!inW(d.x, d.y, 30)) continue;
      const style = rn(3) === 0 ? doorStyle : 13;
      const num4 = d.fluff;
      const n5 = Math.max(25, Math.min(w - 25, d.x - num4));
      const n6 = Math.max(25, Math.min(w - 25, Math.max(n5, d.x + num4 - 1)));
      let n7 = 100, n8 = 0, n9 = 0, n10 = 0;
      for (let x = n5; x <= n6; x++) {
        let flag = true;
        let y = d.y;
        while (y > 10 && actAt(x, y) === 0) y--;
        if (!isDT(typAt(x, y))) flag = false;
        n9 = y;
        for (y = d.y; actAt(x, y) === 0; y++) { if (!st.inBounds(x, y + 1)) break; }
        if (!isDT(typAt(x, y))) flag = false;
        n10 = y;
        if (n10 - n9 < 3) continue;
        if (!d.skipOther) {
          outer1:
          for (let a = x - 20; a < x + 20; a++) {
            for (let b = n10 - 10; b < n10 + 10; b++) {
              if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === DOOR) { flag = false; break outer1; }
            }
          }
        }
        if (flag && !d.skipSpace) {
          outer2:
          for (let m = n10 - 3; m < n10; m++) {
            for (let n = x - 3; n <= x + 3; n++) {
              if (inW(n, m, 0) && actAt(n, m) !== 0) { flag = false; break outer2; }
            }
          }
        }
        if (flag && n10 - n9 < 20) {
          let f2 = false;
          if (d.dir === 0 && n10 - n9 < n7) f2 = true;
          if (d.dir === -1 && x > n8) f2 = true;
          if (d.dir === 1 && (x < n8 || n8 === 0)) f2 = true;
          if (f2) { n8 = x; n7 = n10 - n9; }
        }
      }
      if (n7 >= 20) continue;
      if (drT) console.log(`DGD-PICK x=${d.x} y=${d.y} n8=${n8} n7=${n7}`);
      let n16 = n8;
      let n17 = d.y, n18 = d.y;
      while (inW(n16, n17, 0) && actAt(n16, n17) === 0) n17++;
      while (n18 > 0 && actAt(n16, n18) === 0) n18--;
      n17--; n18++;
      for (let y = n18; y < n17 - 2; y++) {
        chTile(st.idx(n16, y), brick, false);
        for (const off of [-1, -2, 1, 2]) {
          if (inW(n16 + off, y, 0) && actAt(n16 + off, y) !== 0 && canKill(n16 + off, y)) {
            const k = st.idx(n16 + off, y);
            st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = wall;   // ClearEverything+wall（DGD:173-190）
          }
        }
      }
      dgPlaceDoor(n16, n17, style);
      n16--;
      let n20 = n17 - 3;
      while (n20 > 0 && actAt(n16, n20) === 0) n20--;
      let f3 = n17 - n20 < n17 - n18 + 5 && isDT(typAt(n16, n20));
      if (d.clear || f3) {
        for (let y = n17 - 4 - ri(0, 2); y > n20; y--) {
          if (f3) chTile(st.idx(n16, y), brick, false);
          for (const off of [-1, -2]) {
            if (d.clear || typAt(n16 + off, y) === brick) {
              const k = st.idx(n16 + off, y);
              st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = wall;   // ClearEverything+wall（DGD:173-190）
            }
          }
        }
      }
      n16 += 2;
      n20 = n17 - 3;
      while (n20 > 0 && actAt(n16, n20) === 0) n20--;
      f3 = n17 - n20 < n17 - n18 + 5 && isDT(typAt(n16, n20));
      if (d.clear || f3) {
        for (let y = n17 - 4 - ri(0, 2); y > n20; y--) {
          if (f3) chTile(st.idx(n16, y), brick, false);
          for (const off of [1, 2]) {
            if (d.clear || typAt(n16 + off, y) === brick) {
              const k = st.idx(n16 + off, y);
              st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = wall;   // ClearEverything+wall（DGD:173-190）
            }
          }
        }
      }
      n17++;
      n16--;
      for (let y = n17 - 8; y < n17; y++) {
        for (const off of [2, 3, -2, -3]) {
          if (d.clear || typAt(n16 + off, y) === brick) {
            const k = st.idx(n16 + off, y);
            st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = wall;   // ClearEverything+wall（DGD:173-190）
          }
        }
      }
      chTile(st.idx(n16 - 1, n17), brick, false);
      chTile(st.idx(n16 + 1, n17), brick, false);
    }
  }
  // PlaceTile(10)（WorldGen.cs:59868 门分支）+ PlaceDoor（:31938：成功 3×Next(3)）
  function dgPlaceDoor(x: number, y: number, style: number): void {
    if (!inW(x, y, 1)) return;
    const solidAt = (yy: number): boolean => {
      const d = TILE_DEFS[typAt(x, yy)];
      return actAt(x, yy) !== 0 && !!d?.solid;
    };
    if (actAt(x, y - 1) === 0 && actAt(x, y - 2) === 0 && actAt(x, y - 3) !== 0 && solidAt(y - 3)) {
      dgPlaceDoorAt(x, y - 1, style);
    } else if (actAt(x, y + 1) === 0 && actAt(x, y + 2) === 0 && actAt(x, y + 3) !== 0 && solidAt(y + 3)) {
      dgPlaceDoorAt(x, y + 1, style);
    }
  }
  function dgPlaceDoorAt(i2: number, j2: number, style: number): void {
    if (!inW(i2, j2 - 2, 0) || !inW(i2, j2 + 2, 0)) return;
    const above = TILE_DEFS[typAt(i2, j2 - 2)];
    if (!(actAt(i2, j2 - 2) !== 0 && above?.solid)) return;
    if (!dgSolid(i2, j2 + 2)) return;
    // PlaceDoor 1:1(:31938-31958):style→帧映射 frameX=54*(style/36)、
    // frameY=54*(style%36);三格 frameY 递增 18,每格独立 frameX=base+Next(3)*18。
    // ★此前 style 参数被完全忽略(帧不写)= 全部退化木门(style 0)——
    // 用户报告"地牢门是木门"根因(2026-08-13)
    const fx0 = 54 * Math.floor(style / 36);
    const fy0 = 54 * (style % 36);
    if (dgTW) dgTW.door = (dgTW.door as number) + 3;
    const wasInactive = st.flags[st.idx(i2, j2)] === 0;   // PlaceTile(10) 前奏清坡门
    for (let k = -1; k <= 1; k++) {
      const ti = st.idx(i2, j2 + k);
      st.flags[ti] = 1; st.type[ti] = DOOR;
      // PlaceTile(10) 前奏（:59499）仅作用锚格且仅原 inactive 时清；PlaceDoor（:31957-31966）
      // 三格直写 active+type 不清坡——j2±1 格保留原坡位（原版如此）
      if (k === 0 && wasInactive) { st.slope[ti] = 0; st.half[ti] = 0; }
      st.frameX[ti] = fx0 + rn(3) * 18;
      st.frameY[ti] = fy0 + (k + 1) * 18;
    }
  }

  // ============ DungeonGlobalWallVariants（:1149-1252）============
  function dgWallVariants(): void {
    const WVLOG = typeof globalThis !== 'undefined' ? (globalThis as { __swWvLog?: unknown }).__swWvLog : undefined;
    const WVLINES = WVLOG ? ((globalThis as { __wvLines?: string[] }).__wvLines ??= []) : null;
    const wvReset = (): { vis: number; ch: number; chS: number; rjSelf: number; rjOther: number; rjCG: number } =>
      ({ vis: 0, ch: 0, chS: 0, rjSelf: 0, rjOther: 0, rjCG: 0 });
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const rPre = dgMainRolls;
        const n2 = ri(40, 239);
        const n3 = ri(bounds.L, bounds.R - 1);
        const n4 = ri(bounds.T, bounds.B - 1);
        if (WVLINES) WVLINES.push(`BOX|${i}|${j}|${n2}|${n3}|${n4}|rc=${rPre}`);
        for (let x = n3 - n2; x < n3 + n2; x++) {
          for (let y = n4 - n2; y < n4 + n2; y++) {
            if (y <= ws || !inW(x, y, 2)) continue;
            const dx = Math.abs(n3 - x), dy = Math.abs(n4 - y);
            // ★IIIII56 备案：cs 判据= !(Math.Sqrt(dx²+dy²) >= (double)((float)num2 * 0.4f))
            //   （DungeonGlobalWallVariants.cs:44）——阈值走 **f32 域**。JS 曾用双精度
            //   n2*0.4；本批改 fround 三段仿真 f32 乘法保持语义忠实（整数距离与该阈值
            //   实际不相等 ⇒ 本例不构成翻转源，CELEB mile8 slot32 实测 W×4 不变——
            //   残差真因=SpreadWallDungeon 洪水【可达集】差（queue 序/去重位/邻序），
            //   非谓词数值面；单刀移交掷流仪器批，详见 content-parity「IIII56 批」章。
            const __thr = Math.fround(Math.fround(n2) * Math.fround(0.4)); // ((float)n2)*0.4f
            if (Math.sqrt(dx * dx + dy * dy) >= __thr) continue;
            if (isDW(wallAt(x, y))) {
              const m = WVLOG ? wvReset() : null;
              dgSpreadWall(x, y, wallVariants[j], m);
              if (m && WVLINES) WVLINES.push(`SPR|${j}|${x}|${y}|wt=${wallVariants[j]}|vis=${m.vis}|ch=${m.ch}|chS=${m.chS}|rjSelf=${m.rjSelf}|rjOther=${m.rjOther}|rjCG=${m.rjCG}`);
            }
          }
        }
      }
    }
  }
  type WvM = { vis: number; ch: number; chS: number; rjSelf: number; rjOther: number; rjCG: number };
  function dgSpreadWall(x: number, y: number, wallType: number, m?: WvM | null): void {
    if (!inW(x, y, 0)) return;
    let list2: Array<[number, number]> = [[x, y]];
    const seen = new Set<string>();
    const key = (a: number, b: number): string => a + ',' + b;
    while (list2.length > 0) {
      const list = list2;
      list2 = [];
      while (list.length > 0) {
        const p = list.shift()!;
        if (!inW(p[0], p[1], 1)) continue;
        seen.add(key(p[0], p[1]));
        const ti = st.idx(p[0], p[1]);
        if (m) m.vis++;
        const cgOK = featOK(p[0], p[1], 3);
        if (st.wall[ti] === 0 || st.wall[ti] === wallType || st.wall[ti] === 244 || st.wall[ti] === 62
          || !cgOK) {           // ★feat3=WallVariants（pit/window 放行）
          if (m) { if (cgOK) m.rjSelf++; else m.rjCG++; }
          continue;
        }
        if (entExists && entBounds.contains(p[0], p[1])) {
          if (st.wall[ti] !== wall) { if (m) m.rjOther++; continue; }
        } else if (st.wall[ti] !== wall) { if (m) m.rjOther++; continue; }
        if (!dgSpreadSolid(p[0], p[1])) {          // ★IIIII65：cs:70650 全项 SolidTile（含 half/slope 判项）——原误用窄化版 dgSolid
          st.wall[ti] = wallType;
          if (m) m.ch++;
          for (const q of [[p[0] - 1, p[1]], [p[0] + 1, p[1]], [p[0], p[1] - 1], [p[0], p[1] + 1]] as Array<[number, number]>) {
            if (!seen.has(key(q[0], q[1]))) list2.push(q);
          }
        } else if (st.flags[ti] !== 0) { st.wall[ti] = wallType; if (m) m.chS++; }
      }
    }
  }
  // ============ DungeonGlobalPlatforms（:24-214）============
  // ★XX 批（2026-08-18）扩 ForcePlacement/IsAShelf 支（DGP.cs:66-121 力置门 +
  // :168-213 书架链）：force 候选跳中心 active 拒绝/长度门/邻平台门/净空门，
  // 尾门改 (!force || num2<=0)；IsAShelf（pots/bottles/books/candles 任一>0，
  // DungeonPlatformData.cs:34-43 计算属性）逐列 else-if 链——门掷短路（上位
  // 概率>0 才掷本位），命中即放置（pot: Next(10,13)+PlacePot(28) 内含成功
  // Next(3)；bottle: PlaceOnTable1x1(13)+type==13 后 Next(2)；book: 内含
  // Next(5)（NoWaterbolt=true 无 Next(50)）；candle: 零掷）。Default 房/廊候选
  // 概率全 0 → IsAShelf=false 链整段跳过——Legacy 种子流零变化。
  function dgPlatforms(): void {
    for (const d of platData) {
      if (!inW(d.x, d.y, 30)) continue;
      const force = !!d.force;
      const x = d.x, y = d.y;
      // ★dungeon-1457 批（DungeonGlobalPlatforms.cs:42-45,1457 新增）：平台锚点墙
      //   ∈[94,105]（地牢 slab/tile 墙变体族,含 1456 即有的 94-99）→ 平台档强制
      //   54（GOTHIC 平台）。仅帧通道（frameY=18*54）,不改 tile/掷序——四通道金标
      //   零扰动。C# 判定用锚点 (x,y) 原位墙（行搜索前），此处同位。
      const platStyleEff = (wallAt(x, y) >= 94 && wallAt(x, y) <= 105) ? 54 : platformStyle;
      let row = -1;
      // ★2026-08-16 审计：num3 = OverrideHeightFluff ?? 5（DungeonGlobalPlatforms.cs:44-57）
      //   ——房间候选（roomPlatformsDoors，platformFluff=3）扫 y±3；走廊/入口候选 ±5。
      const n3 = d.hf;
      let n4 = y < ws + 50.0 ? 20 : 10;
      n4 = Math.trunc(n4 * ((d.hall ? 1.0 : 1.0)));   // Hall/RoomSizeScalar=(1+1)/2=1（DungeonData.cs:88）
      for (let j = y - n3; j <= y + n3; j++) {
        let n6 = x, n7 = x;
        let bad = false;
        if (!force && actAt(x, j) !== 0) bad = true;
        else {
          while (inW(n6, j, 0) && actAt(n6, j) === 0) {
            n6--;
            if (!inW(n6, j, 0)) break;
            if (!force && (actAt(n6, j) !== 0 && !isDT(typAt(n6, j)) || n6 === 0)) { bad = true; break; }
            if (n6 <= 10) break;
          }
          while (inW(n7, j, 0) && actAt(n7, j) === 0) {
            n7++;
            if (!inW(n7, j, 0)) break;
            if (!force && (actAt(n7, j) !== 0 && !isDT(typAt(n7, j)) || n7 === w - 1)) { bad = true; break; }
            if (n7 >= w - 10) break;
          }
        }
        if (bad || (!force && n7 - n6 > n4)) continue;
        let ok = true;
        if (!force) {
          const a0 = Math.max(0, x - Math.trunc(n4 / 2) - 2), a1 = Math.min(w - 1, x + Math.trunc(n4 / 2) + 2);
          const b0 = j - n3, b1 = j + n3;
          outer3:
          for (let a = a0; a <= a1; a++) {
            for (let b = b0; b <= b1; b++) {
              if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === PLATFORM) { ok = false; break outer3; }
            }
          }
          if (ok) {
            for (let b = j + 3; b >= j - 5; b--) {
              if (inW(x, b, 0) && actAt(x, b) !== 0) { ok = false; break; }
            }
          }
        }
        if (ok) { row = j; break; }
      }
      if ((!force || row <= 0) && (row <= y - n3 - 5 || row >= y + n3 + 5)) continue;
      let px = x;
      const py = row;
      let qx = x + 1;
      while (inW(px, py, 0) && actAt(px, py) === 0) {
        chTile(st.idx(px, py), PLATFORM, false);
        st.frameY[st.idx(px, py)] = 18 * platStyleEff; // DungeonGlobalPlatforms:158+42-45(1457 GOTHIC 档)
        px--;
        if (px <= 10) break;
      }
      while (inW(qx, py, 0) && actAt(qx, py) === 0) {
        chTile(st.idx(qx, py), PLATFORM, false);
        st.frameY[st.idx(qx, py)] = 18 * platStyleEff;
        qx++;
        if (qx >= w - 10) break;
      }
      // 书架链（:168-213）——num13/num15 为两侧首个 active 格（含端点）
      if ((d.pots ?? 0) > 0 || (d.bottles ?? 0) > 0 || (d.books ?? 0) > 0 || (d.candles ?? 0) > 0) {
        if (dgTW) { dgTW.shelfC = (dgTW.shelfC as number) + 1; dgTW.shelfM = ((dgTW.shelfM as number) || 0) + (qx - px); }
        for (let m = px; m < qx; m++) {
          if ((d.candles ?? 0) > 0 && rd() < (d.candles ?? 0)) {
            placeOnTableD(m, py - 1, WATER_CANDLE);          // GenerateDungeonWaterCandle（PlaceOnTable1x1 零掷）
          } else if ((d.pots ?? 0) > 0 && rd() < (d.pots ?? 0)) {
            dgDungeonPot(m, py - 1);                          // style=Next(10,13)+PlacePot(28)
          } else if ((d.bottles ?? 0) > 0 && rd() < (d.bottles ?? 0)) {
            placeOnTableD(m, py - 1, TILE_BY_KEY['v_13_placed_bottles']!);
            if (typAt(m, py - 1) === TILE_BY_KEY['v_13_placed_bottles']) rn(2);   // type==13 后 Next(2)
          } else if ((d.books ?? 0) > 0 && rd() < (d.books ?? 0)) {
            // ★FFFF 批（2026-08-18）：NoWaterbolt=false（Dome 下对平台）走
            //   GenerateDungeonBook 默认支（DU:432-435）——Next(50) 掷在参数位
            //   （PlaceTile(50) 内的 Next(5) 之前）；waterbolt 帧门 :441 原版手滑读
            //   Main.tile[placeY, placeY]（非 placeX,placeY）——1:1 照抄。
            //   ★MMMM 批：`=== false` 对缺省 nowb（undefined）不成立——Dome 下对平台
            //   （候选无 NoWaterbolt 字段=false）曾整族漏掷 Next(50) → #32 全链掷位漂移。
            const wb = d.nowb !== true && rn(50) === 0;
            placeOnTableD(m, py - 1, BOOKS);                  // 内含 Next(5)（cs:45377）
            if (wb && py - 1 > (ws + rock) / 2 && typAt(py - 1, py - 1) === BOOKS) {
              st.frameX[st.idx(m, py - 1)] = 90;              // frameX=90（水书帧，DU:439-444）
            }
          }
        }
      }
    }
  }
  // GenerateDungeonPot（DU:447-452）：style=Next(10,13) + PlacePot(28,style)
  //（2×2 净空+双列 nactive 整砖无坡；成功即 Next(3) 变体掷——PotsPass.placePot 同构）
  const DGPOT = TILE_BY_KEY['pot']!;
  function dgDungeonPot(x: number, y: number): void {
    const style = ri(10, 12);
    let ok = true;
    for (let dx = 0; dx < 2 && ok; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        if (!st.inBounds(x + dx, y + dy) || st.flags[st.idx(x + dx, y + dy)] !== 0) { ok = false; break; }
      }
      if (!st.inBounds(x + dx, y + 1)) { ok = false; break; }
      const gi = st.idx(x + dx, y + 1);
      // ★MMMM 批：WorldGen.PlacePot（:54082，门 :54099-54102）支撑门=**nactive()
      //   （含 !inActive）+ Main.tileSolid[type]**——平台 19 在生成期 tileSolid=true
      //   （GenSolid vanGenSolidType 差集 9 类之一）。曾用碰撞语义 genSolidType →
      //   Dome 平台上的瓦罐全数放置失败 → 每罐少掷 1 颗 Next(3) → 全链掷位漂移
      //   （#32 残余的主根因——Legacy 种子平台无 pots 候选故 9293480 不可见）。
      if (!st.flags[gi] || ((st.wire[gi] >>> 5) & 1) !== 0 || st.half[gi] || st.slope[gi] !== 0
        || !vanGenSolidType(st.type[gi])) { ok = false; break; }
    }
    if (!ok) return;
    const variant = rn(3) * 36;
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        const ti = st.idx(x + dx, y + dy);
        st.flags[ti] = 1; st.type[ti] = DGPOT;
        st.slope[ti] = 0; st.half[ti] = 0;
        st.frameX[ti] = dx * 18 + variant;
        st.frameY[ti] = (dy + 1) * 18 + style * 36;
      }
    }
  }
  // ============ 宝箱：BiomeChests/BasicChests + AddBuriedChest（战利品掷骰流对齐）============
  function prefixRolls(item: number): void {
    const cls = DG_PRE_CLASS[item];
    if (!cls) return;
    // Prefix(-1)（Item.cs:486-560）单轮：Next(4)==0→rolledPrefix=0（乘子恒 1→真，止）；
    // 否则 RollAPrefix=Next(len)；Reduced 且 Next(3)!=0 → 降 0 止。（无重掷链——见
    // DG_PRE_REDUCED 上方 BBBBB 勘误注：switch 内零 false，后置四门对本族恒真。）
    if (rn(4) !== 0) {
      const arr = DG_PRE[cls];
      const rolled = arr[rn(arr.length)];
      if (DG_PRE_REDUCED.has(rolled)) rn(3);
    }
  }
  function dgAddBuriedChest(ix: number, jy: number, mainItem: number, style: number, chestTile: number): boolean {
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_CHEST_TRACE) {
      const uL = (rng as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
      let fh = 0x811c9dc5;
      for (let q = 0; q < 56; q++) { const v = uL.seedArray[q]! >>> 0; for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((v >>> s2) & 0xff), 16777619) >>> 0; }
      const uix = uL.inext >>> 0;
      for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((uix >>> s2) & 0xff), 16777619) >>> 0;
      console.log(`C|${ix}|${jy}|${mainItem}|${style}|${chestTile === CHEST ? 21 : 467}|${fh.toString(16)}`);
    }
    for (let k = jy; k < h - 10; k++) {
      if (actAt(ix, k) !== 0 && typAt(ix, k) === TILE_BY_KEY['v_231_larva']) return false;
      let boulder = false;
      for (let a = ix - 2; a <= ix + 2 && !boulder; a++) {
        for (let b = k - 2; b <= k + 2; b++) {
          if (!inW(a, b, 100)) continue;
          const sheet = TILE_DEFS[typAt(a, b)]?.vanilla?.sheet ?? -1;
          if (actAt(a, b) !== 0 && (sheet === 138 || sheet === 484 || sheet === 664 || sheet === 665
            || (sheet >= 711 && sheet <= 716) || typAt(a, b) === TILE_BY_KEY['v_26_altars'] || typAt(a, b) === TILE_BY_KEY['v_237_lihzahrd_altar'])) {
            boulder = true; break;
          }
        }
      }
      if (boulder) return false;
      if (!dgSolid(ix, k)) continue;
      const num7 = k;
      const num9 = style, num10 = mainItem;
      let flag9 = false, flag10 = false;
      // ★BBBBB（2026-08-19）：vanilla flag（WG.cs:36062）——21 号箱 chestStyle==0
      //   （含 dgBasicChests 的水覆写箱：num2<ws+50 → itemType=327/chestStyle=0）
      //   即"地表箱"标记；loot 的 surface 支门 = (flag23 && (flag || flag6)) || flag11
      //   （:36280）。曾 surf 恒 false → 水箱误走金箱支 → 掷流错位连坐全段
      //   （s22222 room0 首箱 C|502|283|327|0 实证）。flag6（style12 丛林）/flag11
      //   （848/857/934）地牢调用点恒 false，不建模。
      const flag0 = chestTile === TILE_BY_KEY['chest'] && (style === 0 || (style === -1 && num9 === 0));
      if (chestTile === TILE_BY_KEY['chest'] && num9 !== 0 && num7 >= ws && isDW(wallAt(ix, num7))) flag9 = true;
      if ((chestTile === TILE_BY_KEY['chest'] && num9 >= 23 && num9 <= 27) || (chestTile === CHEST2 && num9 === 13)) {
        flag9 = true; flag10 = true;
      }
      // ★NTB32（2026-08-23）：AddBuriedChest 的 notTheBees 蜂蜜箱带判定支（WG.cs:36104-36112
      //   `if (notTheBees && !remixWorldGen && !dontStarveWorldGen)`）——Next(5)+Next(-2,3)
      //   恒耗 2 颗；深度带（num13=ws+Next(-2,3)+35 门）命中再按 `i<beach+180-Next(-2,3)`
      //   `|| i>maxX-beach-180+Next(-2,3)` 短路再耗 1-2 颗 Next(-2,3)。位置=SolidTile
      //   行命中后、PlaceChest 前——**PlaceChest 败也照耗**（:37578 败即 return false，
      //   但 NTB 支在其前；G 段 8 连败调用=8 连 quad 的 x86 span 实证 v[128164..195]）。
      //   地牢/生物箱 num10>0 → flag21 下游 style-11 支恒不触发，纯掷流语义。缺此支 =
      //   每次找到实心行的调用少耗 2-4 颗 → G 段起主流永久相移 → I/Pa/Ba 段灯笼/画作/
      //   横幅全 displaced（NTB 链 #32 首差根因）。
      if (gs.seedFlags.notTheBees && !gs.seedFlags.remix && !gs.seedFlags.theConstant) {
        const num12 = gs.lavaLine + rn(5);
        const num13 = Math.trunc(ws) + ri(-2, 2) + 35;
        if (num7 > num13 && num7 <= num12
          && (ix < BEACH + 180 - ri(-2, 2) || ix > w - BEACH - 180 + ri(-2, 2))) {
          // flag21=true：蜂蜜箱带——本 pass 箱族 num10>0 无下游消费，仅掷流
        }
      }
      // —— PlaceChest（:57828）→ TileObject.CanPlace chest21/467 全链（TileObject.cs:174-857）——
      // ★U 批修正（oracle DGSEGHASH/宝箱落位实证，2026-08-17）：旧近似只查右列实心 +
      // 2×2 act==0——缺左腿锚定门/可切覆盖/边界 5 垫/巨石双腿门（读 type 不读 act）。
      // chest TileObjectData（TileObjectData.cs:3459-3466）：Style2x2、Origin(0,1)、
      // AnchorBottom=SolidTile|SolidWithTop|Table|SolidSide ×2 列（FlattenAnchors=false，
      // 生成期无半砖/坡 → blockType==0 恒真）。调用点 PlaceChest(i-1, num7-1) → 内盒占
      // (px,py-1)..(px+1,py)、锚腿 (px,num7)/(px+1,num7) 双过。
      const px = ix - 1, py = num7 - 1;
      const cx = px, cy = py - 1;
      {
        const sheetB = TILE_DEFS[typAt(px, num7)]?.vanilla?.sheet ?? 0;
        const sheetB2 = TILE_DEFS[typAt(px + 1, num7)]?.vanilla?.sheet ?? 0;
        let ok = !(DG_BOULDERS.has(sheetB) || DG_BOULDERS.has(sheetB2));   // :57832 双腿巨石（type 不读 act）
        if (ok) ok = cx >= 5 && cx + 2 <= w - 5 && cy >= 5 && cy + 2 <= h - 5;  // :215 边界 5 垫
        for (let a = 0; ok && a < 2; a++) {                                 // 内盒 :337-375（可覆盖 = tileCut∖{484,654}∪BreakableWhenPlacing）
          for (let b = 0; b < 2; b++) {
            if (actAt(cx + a, cy + b) === 0) continue;
            const t2 = TILE_DEFS[typAt(cx + a, cy + b)]?.vanilla?.sheet ?? 0;
            if (!((DG_TILE_CUT.has(t2) && t2 !== 484 && t2 !== 654) || DG_BREAK_PLACE.has(t2))) { ok = false; break; }
          }
        }
        // 锚腿×2：①SolidTile（tileSolid&&!solidTop&&!noAttach&&!anchorInvalid）；
        // ②平台/solidTop/桌（SolidWithTop|Table 路——本段实测腿全 41/43/44 砖，备案近似）
        if (ok && !(chestLegOK(px, num7) && chestLegOK(px + 1, num7))) ok = false;
        // ★cs:37578：PlaceChest 败 = 本调用即 return false——k 循环只在首实心行掷一次
        // （vanilla DgCanPlaceProbe 实证：失败调用恰 1 条 CanPlace 记录）。旧版续扫会在
        // 更深处凭空落箱。
        if (!ok) return false;
      }
      for (let a = 0; a < 2; a++) {
        for (let b = -1; b <= 0; b++) {
          const ti = st.idx(px + a, py + b);
          chTile(ti, chestTile, false);
          // PlaceChestDirect 帧式（:57864-57903）：顶行 fy=0 / 底行 fy=18；
          // 列 fx=36*style / 18+36*style。★此前不写帧=残留旧帧,宝箱单格贴图错乱
          st.frameX[ti] = 36 * style + a * 18;
          st.frameY[ti] = b === -1 ? 0 : 18;
        }
      }
      dgChestLoot(num7, num10, flag9, flag10, num9, chestTile, flag0);
      chests.push({ x: px, y: py - 1, locked: flag10, items: dgLootItems(num10) });
      return true;
    }
    return false;
  }
  // 战利品掷骰流（AddBuriedChest 深三分支 + 尾段；与 oracle DgAddBuriedChest 同构）
  function dgChestLoot(num7: number, num10: number, flag9: boolean, flag10: boolean, num9: number, chestTile: number, flag0 = false): void {
    dgLoot.length = 0;
    if (num10 > 0) dgLoot.push(num10);
    // ★BBBBB：surface 支门 = flag23 && (flag0 || flag6)（WG.cs:36280）——flag0=地表箱
    //   标记（chestStyle==0）。曾 && false 恒假。
    // ★IIIII70 REMIX（1457 WorldGen.cs:36740-36745）：flag23 的 remix 覆写——
    //   阈值从 worldSurface+25 换成 (rockLayer+2*(maxTilesY-350))/3（反向体 content
    //   域的「地表」翻到下方）；同段 :37020-37024 中深支判定在 remix 下取
    //   `num7>rockLayer && num7<maxTilesY-250`（与普通支互补）、:37322 深支条件补
    //   `(remix&&(style==7||style==14))`。REMIX 地牢宝箱因此走【深/地狱】支而非金支，
    //   战利品掷骰流位整体平移——mile8 REMIX #32 首段级联（C→I→T→F→Pa→Ba 全族
    //   displaced）根因。本 pass flag6(活木墙 244)/flag11(848/857/934) 恒假不建。
    const f23 = gs.seedFlags.remix ? num7 >= (rock + 2 * (h - 350)) / 3.0 : num7 < ws + 25;
    const surf = f23 && flag0;
    const bandMid = gs.seedFlags.remix ? (num7 > rock && num7 < h - 250) : num7 < rock;
    if (surf) {
      if (num10 > 0) prefixRolls(num10);
      else rn(10);
      // ★RRRRRR（2026-08-23）surface 支 stack 掷值域八连勘误（QQQQQ ③-3 同族残留——
      //   掷数 1:1 流位中性,纯值域保真;WG.cs 行号实测）：rn(N)→ri(min,max)。
      if (rn(6) === 0) ri(40, 75);                   // 282 荧光棒 stack=Next(40,76)（cs:36367）
      if (rn(6) === 0) ri(150, 300);                 // 279 飞刀 stack=Next(150,301)（cs:36378）
      if (rn(6) === 0) { if (rn(5) === 0) rn(2); if (rn(10) === 0) rn(3); }
      if (rn(6) === 0) { if (rn(5) === 0) rn(2); if (rn(10) === 0) rn(3); }
      if (rn(3) === 0) ri(3, 5);                     // 168 stack=Next(3,6)（cs:36427）
      if (rn(2) === 0) { rn(2); rn(8); }
      if (rn(2) === 0) ri(50, 100);                  // 965 stack=Next(50,101)（cs:36440）
      if (rn(3) !== 0) { rn(2); rn(26); }
      if (rn(2) === 0) rn(3);
      if (rn(3) !== 0) ri(3, 5);                     // 2350 stack=Next(3,6)（cs:36470）
      if (rn(3) > 0) { rn(6); ri(1, 2); }            // stack7=Next(1,3)（cs:36473）
      if (rn(2) === 0) { rn(2); rn(11); }
      if (rn(2) === 0) ri(10, 29);                   // 72 金币 stack=Next(10,30)（cs:36535）
      if (rn(2) === 0) ri(50, 99);                   // 9 铜币 stack=Next(50,100)（cs:36541）
    } else if (bandMid) {
      if (num10 > 0) {
        prefixRolls(num10);
        if (flag9 && !flag10) {
          // ★KKKKKKK：金支同款第三掷（WG.cs:36951-36958）——Next(4)==0→6156+Prefix(-1)。
          if (!shadowKey || rn(3) === 0) shadowKey = true;
          if (!ramRune || rn(8) === 0) { ramRune = true; prefixRolls(5465); dgLoot.push(5465); }
          if (rn(4) === 0) { prefixRolls(6156); dgLoot.push(6156); }
        }
      } else {
        rn(6);
        if (rn(20) === 0) { /* 997 类 */ }
        else if (rn(20) === 0) rn(26);
      }
      if (rn(3) === 0) rn(20);
      if (rn(5) === 0) { /* 52 */ }
      if (rn(3) === 0) rn(51);
      if (rn(2) === 0) { rn(2); rn(10); }
      if (rn(2) === 0) { rn(2); rn(25); }
      if (rn(2) === 0) rn(3);
      if (rn(3) > 0) { rn(9); rn(3); }
      if (rn(3) !== 0) rn(5);
      if (rn(2) === 0) rn(11);
      if (rn(2) === 0) rn(40);
    // ★IIIII70：深支条件补 remix 外延——`(remix&&(chestStyle==7||chestStyle==14))`
    //   （1457 WorldGen.cs:37322）。REMIX 下中深支条件反转为 y∈(rockLevel,h-350 帽…)
    //   即 y>rockLevel 段才进金支，本带承接 rock 以上余量。
    } else if (num7 < h - 250 || (gs.seedFlags.remix && (num9 === 7 || num9 === 14))) {
      if (num10 > 0) {
        prefixRolls(num10);
        // flag2（冰）/flag3（沙）地牢箱恒 false → 两段掷骰不触发（cs:36846-36858）
        if (flag9 && !flag10) {
          if (!shadowKey || rn(3) === 0) { shadowKey = true; dgLoot.push(329); }
          if (!ramRune || rn(8) === 0) { ramRune = true; prefixRolls(5465); dgLoot.push(5465); }
          // ★KKKKKKK：中深支第三掷（WG.cs:37252-37258）——Next(4)==0→6156+Prefix(-1)
          if (rn(4) === 0) { prefixRolls(6156); dgLoot.push(6156); }
        }
      } else {
        rn(7);
        if (rn(20) === 0 && num7 > gs.lavaLine) { /* 906 */ }
        else if (rn(15) === 0) { /* 997 */ }
        else if (false) rn(26);
      }
      if (rn(5) === 0) { /* 43 */ }
      if (rn(3) === 0) { /* 167 */ }
      if (rn(4) === 0) rn(26);
      if (rn(2) === 0) { rn(2); rn(8); }
      if (rn(2) === 0) { rn(2); rn(26); }
      if (rn(2) === 0) rn(3);
      // ★QQQQQQ 勘误（span 签名对拍 cs:37086/:37116/:37151-37152）：stack 掷过载
      //   Next(1,3)≠Next(3)、Next(2,5)≠Next(3)、Next(15,31)≠Next(16)——同耗 1 样本
      //   （DGSEGHASH 流对拍不可见），值域不同=真宝箱 stack 语义差。
      if (rn(3) > 0) { rn(6); ri(1, 2); }
      if (rn(3) > 1) { rn(6); ri(1, 2); }
      if (rn(2) === 0) ri(2, 4);
      if (rn(2) === 0) { rn(2); ri(15, 30); }
      if (rn(2) === 0) ri(1, 2);          // ★QQQQQQ：73 钱 stack=Next(1,3)（cs:37186）
    } else {
      if (num10 > 0) prefixRolls(num10);
      else rn(4);
      if (rn(3) === 0) { /* 167 */ }
      if (rn(2) === 0) { rn(2); rn(15); }
      if (rn(2) === 0) { rn(2); rn(25); }
      if (rn(2) === 0) rn(6);
      if (rn(3) > 0) { rn(8); rn(3); }
      if (rn(3) > 1) { rn(8); rn(3); }
      rn(3); rn(2);
      if (rn(2) === 0) { rn(2); rn(15); }
      if (rn(2) === 0) rn(3);
    }
    // 尾段（cs:37414-37560）★U 批修正（oracle DGSEGHASH 实证）：
    //   21 块 = flag9 1/8 砍刀（:37432 无 !flag10 门——上锁箱也掷）+ (num9∈23..27)&&1/2
    //   残片 5234（:37476）；467 块独立 = (num9==13)&&Next(2)（:37543，无 flag9 掷）；
    //   voice 门 Next(12) 命中再 GetRandomVoiceItem=Next(14)（:37554+Item.cs:49024）。
    //   旧近似 flag9 误挂 !flag10 门 + 残片门误并 flag10 → 上锁 21 箱每箱少掷 1 颗。
    if (flag9 && chestTile === TILE_BY_KEY['chest']) { if (rn(8) === 0) { /* 2192 */ } }
    if (chestTile === TILE_BY_KEY['chest'] && num9 >= 23 && num9 <= 27) { if (rn(2) === 0) { /* 5234 */ } }
    else if (chestTile === CHEST2 && num9 === 13) { if (rn(2) === 0) { /* 5234 */ } }
    if (rn(12) === 0) rn(14);
  }
  const dgLoot: number[] = [];
  const dgLootItems = (mainVid: number): Array<{ id: number; stack: number } | null> => {
    const out: Array<{ id: number; stack: number } | null> = [];
    for (const vid of dgLoot) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      const id = key !== undefined ? ITEM_BY_KEY[key] : undefined;
      if (id !== undefined) out.push({ id, stack: 1 });
    }
    void mainVid;
    return out;
  };
  function dgBiomeChests(): void {
    // ★IIIII21（DungeonGlobalBiomeChests.cs:76-79/:88）：drunk → 箱组数 5→6，
    //   case5=对侧邪恶箱（crimson?24/1571:25/1569）。switch(i % num) 纯 drunk
    //   （num=6）与原版枚举一致；普通世界（num=5）i%5≡i 零扰动。
    const numChests = gs.seedFlags.drunkWorld ? 6 : 5;
    for (let i = 0; i < numChests; i++) {
      let flag = false;
      let n3 = 1000;
      while (!flag) {
        n3--;
        if (n3 <= 0) break;
        const x = ri(bounds.L, bounds.R - 1);
        const y = ri(Math.trunc(ws), bounds.B - 1);
        // ★IIIII70 对账仪（SW_DG_BCTRACE）：与 rig MARK|bcA/bcR 同位同格式
        const bcT = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_DG_BCTRACE;
        if (bcT) console.log(`MARK|bcA|i=${i}|${x},${y}|rc=${dgMainRolls}`);
        if ((entExists && entBounds.contains(x, y)) || !isDW(wallAt(x, y)) || actAt(x, y) !== 0) continue;
        let chestTile = CHEST, mainItem = 0, chestStyle = 0;
        switch (i % numChests) {
          case 0: chestStyle = 23; mainItem = 1156; break;
          case 1:
            if (!gs.crimson) { chestStyle = 24; mainItem = 1571; } else { chestStyle = 25; mainItem = 1569; }
            break;
          case 2: chestStyle = 26; mainItem = 1260; break;
          case 3: chestStyle = 27; mainItem = 1572; break;
          case 4: chestTile = CHEST2; chestStyle = 13; mainItem = 4607; break;
          case 5: // ★IIIII21：对侧邪恶生物群系箱（同 globalWorldGen.crimson 判定）
            if (gs.crimson) { chestStyle = 24; mainItem = 1571; } else { chestStyle = 25; mainItem = 1569; }
            break;
        }
        flag = dgAddBuriedChest(x, y, mainItem, chestStyle, chestTile);
        if (bcT) console.log(`MARK|bcR|i=${i}|st=${chestStyle}|${flag ? 'OK' : 'FAIL'}|rc=${dgMainRolls}`);
      }
    }
  }
  function dgBasicChests(): void {
    // 对账插桩(dormant)：SW_DG_GC=1 时逐房/逐尝试记 lo/hi/num/num2（G 段流对拍用）
    const gcT = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1';
    let gcRm = 0;
    for (const rm of rooms) {
      if (gcT) console.log(`GC-RM ${gcRm++} exI=${Math.trunc(rm.ex)} eyI=${Math.trunc(rm.ey)} half=${Math.trunc(rm.strength * 0.4)} str=${rm.strength} exf=${rm.ex.toFixed(6)} eyf=${rm.ey.toFixed(6)}`);
      // ★#32 终清（2026-08-18）：LegacyDungeonRoom.cs:86-87 原文
      //   `(int)endPosition.X - num`——**先 (int) 截断再 ± half**。曾以 double 的
      //   rm.ex 直接 ±half 后 Lerp → 房尾坐标 369.9999 类小数尾巴把 (int)(Lerp)
      //   抬高 1 格（dgchest 逐箱对拍 #19 例：v369 j370 同哈希）→ 箱位错 → G 段
      //   流差（+7 掷）→ I/T/F/Pa/Ba 全段级联（#32 残余 A=1319 主根因）。
      const half = Math.trunc(rm.strength * 0.4);
      const exI = Math.trunc(rm.ex), eyI = Math.trunc(rm.ey);
      for (let j = 0; j < 1000; j++) {
        const lo = exI - half, hi = exI + half;
        const num = Math.trunc(lo + (hi - lo) * rd());
        const num2 = Math.trunc((eyI - half) + ((eyI + half) - (eyI - half)) * rd());
        if (!featAreaOK(num, num2, 1)) continue;
        let itemType = 0, chestStyle = 2;
        if (lootStyle >= 8) lootStyle = 0;
        switch (lootStyle) {
          case 0: itemType = 155; break;
          case 1: itemType = 156; break;
          case 2: itemType = 157; break;
          case 3: itemType = 163; break;
          case 4: itemType = 113; break;
          case 5: itemType = 3317; break;
          case 6: itemType = 327; chestStyle = 0; break;
          default: itemType = 164; break;
        }
        if (num2 < ws + 50) { itemType = 327; chestStyle = 0; }
        const gcOk = dgAddBuriedChest(num, num2, itemType, chestStyle, CHEST);
        if (gcT) console.log(`GC-TRY rm=${gcRm - 1} num=${num} num2=${num2} ok=${gcOk ? 1 : 0}`);
        if (gcOk) { lootStyle++; break; }
      }
    }
  }

  // ============ DungeonGlobalBookshelves（:23-208）============
  function dgBookshelves(): void {
    // __bsEv 探针（GGG 批 2026-08-18）：书架事件表 [k0,k1,x,y,n10,flag3,n7,dist]
    // （k0=迭代起 dgMainRolls 内部计数——主流真位需 +TileRunner 侧滞后，见
    // tools/_gggreplay.test.ts 对拍注记）——B 尾 -3 掷定位用，常态零开销。
    const bsEvG = (globalThis as { __bsEv?: unknown[][] }).__bsEv;
    let ncount = 0, num3 = 0;
    while (num3 < Math.trunc(w / 20)) {
      ncount++;
      let k0 = 0;
      if (bsEvG) k0 = dgMainRolls;
      // ★IIIII98c：书架 attempt 级标记（与 rig bsDr/bsDi/bsS/bsA/bsPF/bsOK/bsGO 同位同 tag）
      const I110bs = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I110_MARK;
      const emitBS = (ln: string): void => { if ((globalThis as { __wvLines?: string[] }).__wvLines) (globalThis as { __wvLines?: string[] }).__wvLines!.push(`MARK|${ln}`); };
      let x = 0;
      let y = 0;
      {
        const GSIR = globalThis as unknown as { __swLastRollIdx?: number };
        const iA = (GSIR.__swLastRollIdx ?? 0) + 1;
        const dxv = ri(bounds.L, bounds.R - 1);
        const iB = iA + 1;
        const dyv = ri(bounds.T, bounds.B - 1);
        if (I110bs) emitBS(`bsDr|${num3},${ncount}|${dxv},${dyv} i=${iA},${iB} m=${dgMainRolls - 2},${dgMainRolls}`);
        x = dxv;
        y = dyv;
      }
      let flag = true;
      if (isDW(wallAt(x, y)) && actAt(x, y) === 0) {
        const iC = ((globalThis as unknown as { __swLastRollIdx?: number }).__swLastRollIdx ?? 0) + 1;
        const d98c = rn(2);
        if (I110bs) emitBS(`bsDi|${num3},${ncount}|${d98c} m=${dgMainRolls} i=${iC}`);
        const n7 = d98c === 0 ? -1 : 1;
        while (flag && inW(x, y, 0) && actAt(x, y) === 0) {
          x -= n7;
          if (x < 5 || x > w - 5) flag = false;
          else if (actAt(x, y) !== 0 && !isDT(typAt(x, y))) flag = false;
        }
        emitBS(`bsS|${num3},${ncount}|${x},${y} fl=${flag ? 1 : 0}`);
        if (flag && inW(x, y, 0) && actAt(x, y) !== 0 && isDT(typAt(x, y))
          && actAt(x, y - 1) !== 0 && isDT(typAt(x, y - 1))
          && actAt(x, y + 1) !== 0 && isDT(typAt(x, y + 1))) {
          x += n7;
          emitBS(`bsA|${num3},${ncount}|${x},${y}`);
          outer4:
          for (let a = x - 3; a <= x + 3; a++) {
            for (let b = y - 3; b <= y + 3; b++) {
              if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === PLATFORM) { flag = false; break outer4; }
            }
          }
          emitBS(`bsPF|${num3},${ncount}|${x},${y} fl=${flag ? 1 : 0}`);
          if (flag && inW(x, y - 1, 0) && actAt(x, y - 1) === 0
            && inW(x, y - 2, 0) && actAt(x, y - 2) === 0
            && inW(x, y - 3, 0) && actAt(x, y - 3) === 0) {
            if (!featOK(x, y, 0) || entNoFeat(x, y)) { flag = false; continue; }
            emitBS(`bsOK|${num3},${ncount}|${x},${y}`);
            let k = x;
            const num8 = x;
            while (k > bounds.L && k < bounds.R && actAt(k, y) === 0 && actAt(k, y - 1) === 0 && actAt(k, y + 1) === 0) k += n7;
            k = Math.abs(x - k);
            const flag3 = rn(2) === 0;
            if (k > 5) {
              // ★III 批 2026-08-18：styleForWall 四件套（DungeonGlobalBookshelves.cs:96-110）。
              //   普通世界样式表=[Default]（SetupDungeonGenVarVariables 仅 dualDungeons
              //   追加特殊样式；GetCurrentDungeonStyle 的 PlatformItemTypes=new int[0]
              //   ——x86 IL 实证）⇒ GetStyleForWall(wall)=wall==brickWallType→Default：
              //   flag2=true、GetPlatformStyle 恒 -1 **不掷**、minmax=(1,4)；其余墙→null：
              //   四件套整体跳过。本种子锚墙 {96/0:null, 9:Default} 均零掷差——B 段 -3 掷
              //   真根因=pre-pit 布局债（见 caves-oracle.cs 头注 III 批取证）。
              let flag2 = true;
              let num9 = -1, min = 1, max = 4;
              if (wallAt(x, y) === wall) {
                flag2 = true;                       // Default.Style == 0（!flag2 时 flag3 已在上文置 false——特殊房间才可能）
                num9 = -1;                           // PlatformItemTypes 空 → -1，不掷
                // GetBookshelfMinMaxSizes 基类实现 → (1, 4)（LivingWood 覆写 (3,7) 仅 dual/remix）
              }
              void num9;
              const cnt98 = ri(min, max - 1);        // ri 闭区间 ↔ Next(min, max)（IIIII98c 捕获名）
              emitBS(`bsGO|${num3},${ncount}|${x},${y} c=${cnt98} min=${min} max=${max} n9=${num9} f3=${flag3 ? 1 : 0} w=${wallAt(x, y)}`);
              let n10 = cnt98;
              if (bsEvG) bsEvG.push([k0, dgMainRolls, num8, y, n10, flag3, n7, k,
                featOK(num8, y, 0), entNoFeat(num8, y),
                winBoxes.findIndex((wb) => wb.contains(num8, y)),
                entBounds.contains(num8, y) && entExists]);
              while (n10 > 0) {
                chTile(st.idx(x, y), PLATFORM, false);
                // ★2026-08-16 审计：书架平台样式 = shelfStyles 按墙变体三档
                //   （Bookshelves.cs:112-138：shelfStyles[0]，墙==variants[1]/[2] 换 [1]/[2]；
                //   GetPlatformStyle 对 Default 样式恒 -1 不覆写）——曾误用
                //   platformStyle(6/8/7，那是 dgPlatforms 平台件的样式)。
                const swl = wallAt(x, y);
                const shelfStyle = swl === wallVariants[1] ? shelf[1] : swl === wallVariants[2] ? shelf[2] : shelf[0];
                st.frameY[st.idx(x, y)] = 18 * shelfStyle;
                if (flag3) {
                  placeOnTableD(x, y - 1, BOOKS);   // ★平台19 ∈ tileTable
                  // GenerateDungeonBook（DungeonUtils.cs:437-446）：Next(50) 水书掷 +
                  // 深度门 (ws+rock)/2 + ★1456 typo 检查 Main.tile[placeY, placeY].type==50
                  // （X/Y 互换读对角格—— DungeonGlobalPlatforms.cs:206 唯一调用链，
                  // 实战对角格几乎恒非书 → 帧恒不落；1405 同处是正确的 [i2, j2-1]。
                  // RNG 序两版亦反（1456 先掷 50 后掷 5；本仓 5→50 已冻结金标，保留）
                  if (rn(50) === 0 && y > (ws + rock) / 2.0
                    && inW(y, y, 0) && typAt(y, y) === BOOKS) {
                    st.frameX[st.idx(x, y - 1)] = 90;   // frameX = 90 水书伪装帧
                  }
                }
                x += n7;
                n10--;
              }
              ncount = 0; num3++;
              if (!flag3 && rn(2) === 0) {
                x = num8; y--;
                // flag2 门（cs:148-196）：true → Next(4) 选 13/49；false → 直放 13（少 1 掷）。
                //   普通世界 flag2 恒 true；dual/remix 特殊房间（LivingWood 等）才有 false 支。
                const n12v = flag2 ? (rn(4) === 0 ? 49 : 13) : 13;
                // v_13_placed_bottles（sheet 13）——曾误写 'v_13_bottles'（不存在的键）：
                // undefined 被 Uint16Array 吞成 type 0，且下行 frameX 掷骰恒不触发（流欠耗）。
                placeSimple(x, y, n12v === 49 ? WATER_CANDLE : TILE_BY_KEY['v_13_placed_bottles']!);
                if (inW(x, y, 0) && typAt(x, y) === TILE_BY_KEY['v_13_placed_bottles']) rn(2);
              }
            }
          }
        }
      }
      if (ncount > 1000) { ncount = 0; num3++; }
    }
    // ★QQQQQQ 探针旁路：窗盒汇总（tools/_qqqqq3.test.ts 消费）
    (globalThis as { __bsWin?: unknown[][] }).__bsWin =
      winBoxes.map((wb: DBnd) => [wb.L, wb.T, wb.R, wb.B]);
  }
  // PlaceTile 近似：目标格净空 + 有墙/侧邻/底邻锚 → 单格放置（帧不入哈希）
  function placeSimple(x: number, y: number, tile: number): boolean {
    if (!st.inBounds(x, y) || tile < 0) return false;
    const ti = st.idx(x, y);
    if (st.flags[ti] !== 0) return false;
    const solidNb = (xx: number, yy: number): boolean => {
      if (!st.inBounds(xx, yy) || st.flags[st.idx(xx, yy)] === 0) return false;
      const d = TILE_DEFS[st.type[st.idx(xx, yy)]];
      return !!d?.solid && !DG_SOLID_TOP.has(d.vanilla?.sheet ?? -1);
    };
    const anchor = st.wall[ti] > 0 || solidNb(x - 1, y) || solidNb(x + 1, y) || solidNb(x, y + 1);
    if (!anchor) return false;
    st.flags[ti] = 1; st.type[ti] = tile;
    st.slope[ti] = 0; st.half[ti] = 0;   // PlaceTile 前奏（目标格 inactive 才到达此）
    return true;
  }
  // ============ DungeonGlobalLights（:24-141）+ Lights_GenerateSwitch（:144-193）============
  function dgLights(): void {
    const lgTr = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_DG_LIGHTS_TRACE;
    if (lgTr) {
      console.log(`DG LG n5=${Math.trunc(28 * (w / 4200) * 1.0)} bnd=${bounds.L},${bounds.T},${bounds.R},${bounds.B} ent=${entExists ? 1 : 0} eb=${entBounds.L},${entBounds.T},${entBounds.R},${entBounds.B}`);
      console.log(`DG PITS${pits.map((p: DBnd) => ` ${p.L},${p.T},${p.R},${p.B}`).join('')}`);
    }
    // #32 终清批 III：Lights 入口全网格落盘（SW_DG_LIGHTS_GRID=<path 前缀>）——与
    //   vanilla 探针 SW_DGLIGHTS_GRID 同口径对拍（typ/act/wal/half/slope 五通道）。
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_LIGHTS_GRID) {
      const pfx = (typeof process !== 'undefined' ? (__swProcessEnv ?? {})?.SW_DG_LIGHTS_GRID : undefined) as string | undefined;   // 浏览器无 process——守卫
      const vtyp = new Uint16Array(w * h), vact = new Uint8Array(w * h);
      const vhalf = new Uint8Array(w * h), vslope = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        vact[i] = st.flags[i]! & 1;
        vtyp[i] = st.type[i] === 0 ? 0 : (TILE_DEFS[st.type[i]!]?.vanilla?.sheet ?? 9999);   // ★原始 type（inactive 保留 stale）
        vhalf[i] = st.half[i]! ? 1 : 0;
        vslope[i] = st.slope[i]!;
      }
      const wrGrid = (nm: string, a: Uint8Array | Uint16Array): void => {
        const fsw = nodeFs();
        if (!fsw) return;                                  // 浏览器 worker 无 node:fs
        const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
        fsw.writeFileSync(`${pfx}.${nm}`, b.slice());
      };
      wrGrid('typ', vtyp); wrGrid('act', vact); wrGrid('wal', st.wall);
      wrGrid('half', vhalf); wrGrid('slope', vslope);
      console.log(`DG GRID dumped -> ${pfx}.*`);
    }
    const num5 = Math.trunc(28 * (w / 4200) * 1.0);
    let ncount = 0, num4 = 0;
    while (num4 < num5) {
      ncount++;
      const x = ri(bounds.L, bounds.R - 1);
      const y = ri(bounds.T, bounds.B - 1);
      if (isDW(wallAt(x, y))) {
        for (let cy = y; cy > bounds.T; cy--) {
          if (lgTr && inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && isDT(typAt(x, cy - 1))) {
            const uL = (rng as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
            let fh = 0x811c9dc5;
            for (let q = 0; q < 56; q++) { const v = uL.seedArray[q]! >>> 0; for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((v >>> s2) & 0xff), 16777619) >>> 0; }
            const uix = uL.inext >>> 0;
            for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((uix >>> s2) & 0xff), 16777619) >>> 0;
            console.log(`A|${x}|${cy}|${fh.toString(16)}`);
          }
          if (!(inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && isDT(typAt(x, cy - 1))
            && featOK(x, cy, 0)
            && ((entExists && entBounds.contains(x, cy)) || isDW(wallAt(x, cy))))) continue;
          let near = false;
          outer5:
          for (let a = x - 15; a < x + 15; a++) {
            for (let b = cy - 15; b < cy + 15; b++) {
              // ★IIIII87（DungeonGlobalLights.cs:54-66）：原版近旁灯/吊灯扫描读的是
              //   Main.tile[i,j].type **裸值**——不含 active() 门！被前序 pass 击杀的
              //   灯具幽灵残型同样命中 near ⇒ 光源段受理面按幽灵位收窄。曾误加 act
              //   门使 JS 在幽灵区多挂吊灯（sparkle/rainbow #32 装饰漂移主簇之一）。
              if (inW(a, b, 0) && (typAt(a, b) === LANTERN || typAt(a, b) === CHANDELIER)) {
                near = true; break outer5;
              }
            }
          }
          if ((inW(x - 1, cy, 0) && actAt(x - 1, cy) !== 0)
            || (inW(x + 1, cy, 0) && actAt(x + 1, cy) !== 0)
            || (inW(x - 1, cy + 1, 0) && actAt(x - 1, cy + 1) !== 0)
            || (inW(x + 1, cy + 1, 0) && actAt(x + 1, cy + 1) !== 0)
            || (inW(x, cy + 2, 0) && actAt(x, cy + 2) !== 0)) near = true;
          if (lgTr) console.log(`DG CAN n2=${ncount} n4=${num4} x=${x} y=${y} cy=${cy} near=${near ? 1 : 0}`);
          if (near) break;
          let placed = false;
          const r7 = rn(7);
          if (lgTr) console.log(`DG R7 x=${x} cy=${cy} v=${r7}`);
          if (r7 === 0) {
            // ★HHHHHHH（2026-08-24）② 吊灯资格门 1457 化（DungeonGlobalLights.cs:81-87
            //   + DungeonGenerationStyles.GetStyleForWall :745-766）：1456 门
            //   `wall==brickWallType`（Default 样式 WallIsInStyle 仅主砖墙）；1457
            //   GetStyleForWall 加 `Style==0 && Main.wallDungeon[wall]` 快路径——
            //   wallDungeon 全族 {7,8,9,94-99}（Main.cs:10737-10745）全有吊灯资格
            //   （JS isDW≡该表）。Default 路径零掷差（ChandelierItemTypes=空数组,
            //   Next(7) 在门之前）→ 纯放置集扩宽。
            //   命中且墙∈[94,105] → GOTHIC 吊灯 item 5744（Lights.cs:85-88）=
            //   DerivedPlacementDetails[5744]=tile34 style53（Item.cs:45030）。
            const chGate = isDW(wallAt(x, cy));
            let blocked = !chGate;
            for (let k = 0; k < 15 && !blocked; k++) {
              // ★IIIII87（DungeonGlobalLights.cs:75-80）：阻挡扫描用 WorldGen.SolidTile
              //   全项版（含 !halfBrick && slope==0，cs:70664）——与 IIII68 横幅停船
              //   循环同刀。窄化版 dgSolid 曾让坡位/半砖格漏判实心 → JS 在真值拒绝带
              //   多挂吊灯（sparkle/rainbow #32 残差主因之一）。
              if (inW(x, cy + k, 0) && dgSpreadSolid(x, cy + k)) { blocked = true; break; }
            }
            if (lgTr) console.log(`DG CH x=${x} cy=${cy} gate=${chGate ? 1 : 0} blocked=${blocked ? 1 : 0}`);
            if (!blocked && placeChand(x, cy)) {
              if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(`MARK|LCHD|${x},${cy}`);
              {
                const ev = (globalThis as { __swDgDecor?: Array<unknown> }).__swDgDecor;
                if (ev) ev.push({ k: 'C', n4: num4, x, y: cy });
              }
              placed = true; ncount = 0; num4++;
              dgSwitch(x, cy);
            }
          }
          if (placed) break;
          // ★R11-D2（2026-08-24）：灯笼支补 Next(3) 主流掷（DungeonGlobalLights.cs:128
          //  ——`genRand.Next(3) == 0 && wall >= 94 && wall <= 105`，**Next(3) 在 && 左侧
          //  恒掷**：Default style（普通世界唯一档）每次进入灯笼段必耗 1 掷,与锚定成败
          //  无关——故掷点在锚定预检**之前**。命中且墙∈[94,105]（变体墙）→ GOTHIC
          //  灯笼 53 覆写三档查表值。曾缺 → 每盏灯笼少 1 颗主流掷,dungeon 段尾起全链流位移。
          const gothicRoll = rn(3);
          // 灯笼（Place1x2Top :46694：上方实心且下方净空 → 42 两格）
          const aboveSheet = TILE_DEFS[typAt(x, cy - 1)]?.vanilla?.sheet ?? -1;
          // 上格实心判定走生成期覆写表（裂纹砖 481-483 本 pass 起非实心——DC:344），
          // 勿读静态 TILE_DEFS.solid（dungeonI 转写债根因之一）
          const aboveSolid = genSolidType(typAt(x, cy - 1));
          // nactive()（active&&!inActive）——MMMM 批：致动柱格不可挂灯笼（Place1x2Top :46705）
          const abvInact = inW(x, cy - 1, 0) && ((st.wire[st.idx(x, cy - 1)] >>> 5) & 1) !== 0;
          if (inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && aboveSolid && !abvInact && !DG_SOLID_TOP.has(aboveSheet)
            && inW(x, cy + 1, 0) && actAt(x, cy + 1) === 0) {
            if (lgTr) console.log(`DG LP x=${x} cy=${cy} typAbv=${aboveSheet}`);
            // 灯笼样式按墙变体三档（Lights :109-118）：wall==variants[1]/[2] 换档,余用 [0]；
            // ★R11-D2：gothic 命中（1/3 × 变体墙）→ 53 覆写（cs:128-132 在三档之后）
            const wl = wallAt(x, cy);
            const lStyle = (gothicRoll === 0 && wl >= 94 && wl <= 105) ? 53
              : wl === wallVariants[1] ? lantern[1] : wl === wallVariants[2] ? lantern[2] : lantern[0];
            if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(`MARK|LLNT|${x},${cy}|s=${lStyle}`);
            chTile(st.idx(x, cy), LANTERN, false);
            chTile(st.idx(x, cy + 1), LANTERN, false);
            // Place1x2Top 帧式（:46711-46717）：frameY=style*36（下格 +18）、frameX=0（亮档；
            // 灭档 frameX=18 由 dgSwitch 2/3 掷写）。★此前不写帧=残留砖帧,样式全丢
            st.frameY[st.idx(x, cy)] = lStyle * 36;
            st.frameY[st.idx(x, cy + 1)] = lStyle * 36 + 18;
            st.frameX[st.idx(x, cy)] = 0;
            st.frameX[st.idx(x, cy + 1)] = 0;
            {
              const ev = (globalThis as { __swDgDecor?: Array<unknown> }).__swDgDecor;
              if (ev) ev.push({ k: 'L', n4: num4, x, y: cy, s: lStyle });
            }
            placed = true; ncount = 0; num4++;
            dgSwitch(x, cy);
          }
          break;                                              // 灯笼尝试后必 break（:131）
        }
      }
      if (ncount > 1000) { num4++; ncount = 0; }
    }
  }
  function placeChand(x: number, y: number): boolean {
    for (let a = x - 1; a < x + 2; a++) {
      for (let b = y; b < y + 3; b++) {
        if (!inW(a, b, 0) || actAt(a, b) !== 0) return false;
      }
    }
    const sheet = TILE_DEFS[typAt(x, y - 1)]?.vanilla?.sheet ?? -1;
    // 上格实心走生成期覆写表（裂纹砖 481-483 本 pass 起非实心——DC:344，勿读静态 solid）；
    // nactive()（active&&!inActive）——MMMM 批：致动柱格不可挂吊灯（PlaceChand :52769）
    if (!(inW(x, y - 1, 0) && actAt(x, y - 1) !== 0 && ((st.wire[st.idx(x, y - 1)] >>> 5) & 1) === 0
      && genSolidType(typAt(x, y - 1)) && !DG_SOLID_TOP.has(sheet))) return false;
    // PlaceChand 帧式（:52753-52824）：样式=蓝/绿/粉地牢吊灯 placeStyle 27/28/29
    //（Item.cs:25748-25757 `27 + type - 2652`，chandelierItemType 2652+theme）。
    // ★HHHHHHH ②：墙∈[94,105] → GOTHIC 吊灯 item 5744（Lights.cs:85-88）→
    //   DerivedPlacementDetails[5744]=PlaceChand(34,53)（Item.cs:45030）——样式 53。
    // 页列 num2=108*(style/36)（27-29 无分页=0）、行基 num3=style*54（分页修正同式）；
    // 三列 fx=num2+{0,18,36}、三行 fy=num3+{0,18,36}。★此前不写帧=残留砖帧
    //（53 档：num2=108、num3=53*54-54*1*37=864——分页修正式对 53 同构,公式通用）
    const wl = wallAt(x, y);
    const style = (wl >= 94 && wl <= 105) ? 53 : 27 + theme;
    const n2 = Math.floor(style / 36) * 108;
    let n3 = style * 54;
    if (n2 >= 108) n3 -= 54 * Math.floor(n2 / 108) * 37;
    for (let a = x - 1; a < x + 2; a++) {
      for (let b = y; b < y + 3; b++) {
        const ti = st.idx(a, b);
        chTile(ti, CHANDELIER, false);
        st.frameX[ti] = n2 + (a - (x - 1)) * 18;
        st.frameY[ti] = n3 + (b - y) * 18;
      }
    }
    return true;
  }
  function dgSwitch(x: number, y: number): void {
    const swTr = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_DG_LIGHTS_TRACE;
    for (let i = 0; i < 1000; i++) {
      const a = x + ri(-12, 12);
      const b = y + ri(3, 20);
      const sgInW = inW(a, b, 0) && inW(a, b + 1, 0);
      const sgAct = sgInW && actAt(a, b) === 0 && actAt(a, b + 1) === 0;
      const sgL = sgAct && inW(a - 1, b, 0) && isDT(typAt(a - 1, b));
      const sgR = sgL && inW(a + 1, b, 0) && isDT(typAt(a + 1, b));
      const sgH = sgR && canHitLocal(a, b, x, y);
      if (swTr) console.log(`DG SW i=${i} x=${x} y=${y} a=${a} b=${b} inW=${sgInW ? 1 : 0} act=${sgAct ? 1 : 0} dtL=${sgL ? 1 : 0} dtR=${sgR ? 1 : 0} hit=${sgH ? 1 : 0} tL=${inW(a - 1, b, 0) ? TILE_DEFS[typAt(a - 1, b)]?.vanilla?.sheet ?? -1 : -1} tR=${inW(a + 1, b, 0) ? TILE_DEFS[typAt(a + 1, b)]?.vanilla?.sheet ?? -1 : -1} aL=${inW(a - 1, b, 0) ? actAt(a - 1, b) : -1} aR=${inW(a + 1, b, 0) ? actAt(a + 1, b) : -1}`);
      if (!sgInW) continue;
      if (!sgAct) continue;
      if (!sgL) continue;
      if (!sgR) continue;
      if (!sgH) continue;
      const anchor = (dgSolid(a - 1, b) && typAt(a - 1, b) !== DOOR)
        || (dgSolid(a + 1, b) && typAt(a + 1, b) !== DOOR) || dgSolid(a, b + 1);
      if (anchor && isDW(wallAt(a, b)) && (isDT(typAt(a - 1, b)) || isDT(typAt(a + 1, b)))) {
        if (actAt(a, b) === 0) {
          const si = st.idx(a, b);
          st.flags[si] = 1; st.type[si] = DSWITCH;
          st.slope[si] = 0; st.half[si] = 0;   // PlaceTile(136)（DGL Lights_GenerateSwitch:173）
        }
      }
      if (actAt(a, b) === 0) continue;
      // L 形红线逐格铺（Lights_GenerateSwitch :173-185）：横一步铺线、纵一步铺线，
      // 三连 wire 写直到灯位（含开关格、不含灯格）——原版 Main.tile.wire(true)=红线。
      // ★此前只放开关不铺线：开关无信号源=死件（用户报告"灯和开关配套但没连线"）
      let wa = a, wb = b;
      while (wa !== x || wb !== y) {
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
        if (wa > x) wa--;
        if (wa < x) wa++;
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
        if (wb > y) wb--;
        if (wb < y) wb++;
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
      }
      // 2/3 灯初始灭档（:186-190）：frameX=18 绝对写——灯笼 1×2 全格=亮灭档在 X；
      // 吊灯中心列本就 num2+18=18（27-29 无分页）→ 原版同款无操作,照抄不"修"
      if (rn(3) > 0) {
        st.frameX[st.idx(x, y)] = 18;
        st.frameX[st.idx(x, y + 1)] = 18;
      }
      if (swTr) console.log(`DG SWX i=${i} a=${a} b=${b}`);
      break;
    }
  }
  // Collision.CanHit（Collision.cs:388-460）——两点视线。★#32 终清（2026-08-18）：
  //   原版是 do-while，**三重**终止：①到点 true；②步进后邻对（横步查上下格/
  //   纵步查左右格）双双「非致动+active+solid+非solidTop+slope0+非半砖」→false；
  //   ③while 条件=当前格是「非致动+active+solid+非solidTop」（此处不看坡/半砖）
  //   →**步进踩上实心格即退出循环 return false**。此前缺 ③、②也缺坡/半砖/致动
  //   三门槛 → 视线恒偏松 → dgSwitch 提前命中 → Lights 段少 ~910 掷（B 末流全等
  //   而 END 差 -1906 的主项 -1820 即此）。
  function canHitLocal(x1: number, y1: number, x2: number, y2: number): boolean {
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_CANHIT_LEGACY) return canHitLegacy(x1, y1, x2, y2);
    let cx = Math.max(1, Math.min(w - 1, x1)), cy = Math.max(1, Math.min(h - 40, y1));
    const tx = Math.max(1, Math.min(w - 1, x2)), ty = Math.max(1, Math.min(h - 40, y2));
    // ②邻对门槛：slope==0 且非半砖且非致动（Collision.cs:437-440/447-450）
    const pairBlk = (x: number, y: number): boolean => {
      if (!inW(x, y, 0) || actAt(x, y) === 0) return false;
      if ((st.wire[st.idx(x, y)] >>> 5) & 1) return false;        // inActive() 豁免
      const t = typAt(x, y);
      // 实心走生成期覆写表（裂纹砖 481-483 本 pass 起非实心——DC:344）：
      // ★dungeonI 转写债主根因——此前读静态 TILE_DEFS.solid，裂纹砖对把开关
      // 视线整段拦死（金标仍放），开关位/后续灯放置集两侧分叉级联到 beaches。
      return genSolidType(t) && !DG_SOLID_TOP.has(TILE_DEFS[t]?.vanilla?.sheet ?? -1)
        && st.slope[st.idx(x, y)] === 0 && st.half[st.idx(x, y)] === 0;
    };
    // ③踩格门槛：不看坡/半砖（while 条件 :470-472）
    const stepBlk = (x: number, y: number): boolean => {
      if (!inW(x, y, 0) || actAt(x, y) === 0) return false;
      if ((st.wire[st.idx(x, y)] >>> 5) & 1) return false;        // inActive() → while 续走
      return genSolidType(typAt(x, y)) && !DG_SOLID_TOP.has(TILE_DEFS[typAt(x, y)]?.vanilla?.sheet ?? -1);
    };
    for (;;) {
      const dx = Math.abs(cx - tx), dy = Math.abs(cy - ty);
      if (cx === tx && cy === ty) return true;                    // ①到点
      if (dx > dy) {
        cx += cx >= tx ? -1 : 1;
        if (!inW(cx, cy - 1, 0) || !inW(cx, cy + 1, 0)) return false;
        if (pairBlk(cx, cy - 1) && pairBlk(cx, cy + 1)) return false;
      } else {
        cy += cy >= ty ? -1 : 1;
        if (!inW(cx - 1, cy, 0) || !inW(cx + 1, cy, 0)) return false;
        if (pairBlk(cx - 1, cy) && pairBlk(cx + 1, cy)) return false;
      }
      if (stepBlk(cx, cy)) return false;                          // ③踩上实心格
    }
  }
  /** A/B 对照用：旧版视线（缺 ③ 踩格终止 + ②坡/半砖/致动门槛） */
  function canHitLegacy(x1: number, y1: number, x2: number, y2: number): boolean {
    let cx = Math.max(1, Math.min(w - 1, x1)), cy = Math.max(1, Math.min(h - 41, y1));
    const tx = Math.max(1, Math.min(w - 1, x2)), ty = Math.max(1, Math.min(h - 41, y2));
    const blk = (x: number, y: number): boolean => {
      if (!inW(x, y, 0) || actAt(x, y) === 0) return false;
      return genSolidType(typAt(x, y)) && !DG_SOLID_TOP.has(TILE_DEFS[typAt(x, y)]?.vanilla?.sheet ?? -1);
    };
    for (;;) {
      const dx = Math.abs(cx - tx), dy = Math.abs(cy - ty);
      if (cx === tx && cy === ty) return true;
      if (dx > dy) {
        cx += cx >= tx ? -1 : 1;
        if (!inW(cx, cy - 1, 0) || !inW(cx, cy + 1, 0)) return false;
        if (blk(cx, cy - 1) && blk(cx, cy + 1)) return false;
      } else {
        cy += cy >= ty ? -1 : 1;
        if (!inW(cx - 1, cy, 0) || !inW(cx + 1, cy, 0)) return false;
        if (blk(cx - 1, cy) && blk(cx + 1, cy)) return false;
      }
    }
  }

  // ============ DungeonGlobalTraps（:23-152，Default：placeTrap(x,y,0) 飞镖）============
  // ★dungeon-1457 批（DungeonGlobalTraps.cs:33/:154）：陷阱窗口首尾设
  //   GenVars.DualDungeon_AllowTrapGenerationInDungeon=true/false——窗口内世界
  //   placeTrap 的双地牢界拒门放行（原版窗口覆盖本特征全程;JS 侧世界 placeTrap
  //   只在 TrapsPass（后置 pass）跑,窗口此处开闭即还原原版时序语义）。
  function dgTraps(): void {
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = true;
    const num5 = Math.trunc(8.4 * (w / 4200) * 1.0);
    let ncount = 0, num4 = 0;
    while (num4 < num5) {
      ncount++;
      const x = ri(bounds.L, bounds.R - 1);
      const y = ri(Math.trunc(ws), bounds.B - 1);
      if (isDW(wallAt(x, y)) && placeTrap0(x, y)) {
        ncount = 1000;
        const WV65t = (globalThis as { __wvLines?: string[] }).__wvLines;
        if (WV65t) WV65t.push(`MARK|dg_trap ok ${num4} ${x},${y}`);
      }
      if (ncount > 1000) { num4++; ncount = 0; }
    }
    dualDungeonTrapWindow.allowTrapGenerationInDungeon = false;
  }
  // PlatformProperTopFrame（cs:70197）：帧列号 ∈[0,7]∪[12,16]∪[25,26]
  function platformProperFrameDg(fx: number): boolean {
    const col = Math.floor(fx / 18);
    if ((col < 0 || col > 7) && (col < 12 || col > 16)) {
      if (col >= 25) return col <= 26;
      return false;
    }
    return true;
  }
  // placeTrap type=0（WorldGen.cs:8875-9150 飞镖分支）
  // ★LLL 批（2026-08-25）NOTRAPS #32 残差 A=131 定罪清偿——本函数此前缺
  //   noTrapsWorldGen 分支与两处 vanilla 拒门：
  //   ①深扫 flag2（cs:8889/:8899-8902 标记 + :8975-8977 `flag2 && type!=3` 拒）
  //     ——下扫触及 h-300 以下时 vanilla 拒而 JS 受理 → 多掷+错位陷阱（KKK 批
  //     掷流窗②「JS 已到压板偏移 ri(0,2) 而 x86 仍在采样」的主犯,方向吻合）；
  //   ②巨石非实心窗#1（cs:8892-8894 开 / :8913 关）——noTraps 下扫穿巨石；
  //   ③蘑菇草 70 回避的 `!noTrapsWorldGen &&` 跳过位（cs:8911-8914）；
  //   ④下扫步进 CanContinue（cs:8896-8898；dgTraps 窗口期内 dual 支恒放行→仅 wall350 可达）；
  //   ⑤九格净空门 nactive() 位（active && !inActive,cs:8963-8973）——曾只查 active；
  //   ⑥CanGeneratePressurePlateAt 精确形（cs:11054-11071）：InWorld(3) +
  //     SolidTileAllowBottomSlope(i,j+1)（允许 solidTop/平台 proper 帧!非 SolidTile）。
  //   早退路径不还原窗#1=原版同款泄漏语义（TrapsPass 同款备案）。①③⑤⑥对六条
  //   非 notraps 链为经验无操作（链 #32..45 全绿 ⇒ 差异路径未被触达）。
  function placeTrap0(x2: number, y2: number): boolean {
    const nfNoTraps = !!gs.seedFlags?.noTraps;
    let flag2 = false;                                        // cs:8889
    if (nfNoTraps) setBoulderSolidity(false);                 // 窗#1 开（cs:8892-8894）
    let num = y2;
    while (!dgSolid(x2, num)) {
      num++;
      if (num > h - 10) return false;
      if (wallAt(x2, num) === 350) return false;              // cs:8896-8898 步进门
      if (num >= h - 300) flag2 = true;                       // cs:8899-8902
    }
    if (nfNoTraps) setBoulderSolidity(true);                  // 窗#1 闭（cs:8913-8915）
    num--;
    if (!inW(x2, num, 3)) return false;
    if (!nfNoTraps) {                                         // cs:8911-8914 noTraps 跳过
      for (let a = x2 - 20; a <= x2 + 20; a++) {
        for (let b = num - 20; b <= num + 20; b++) {
          if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === TILE_BY_KEY['v_70_mushroom_grass_block']) return false;
        }
      }
    }
    if (wallAt(x2, num) === 87 || wallAt(x2, num) === 350) return false;
    const lava = st.liquid[st.idx(x2, num)] > 0 && st.liquidType[st.idx(x2, num)] === 2;
    if (lava) return false;                                   // cs:8921-8925 flag+type!=3 合并（type=0）
    if (flag2) return false;                                  // cs:8975-8977（type 0≠3）
    // 九格净空门：nactive()（WG:70086 active&&!inActive）——cs:8963-8973
    const nactOffs = (x: number, y: number): boolean => {
      if (!st.inBounds(x, y)) return false;
      const i = st.idx(x, y);
      return st.flags[i] !== 0 && ((st.wire[i] >>> 5) & 1) === 0;
    };
    const offs: Array<[number, number]> = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]];
    for (const [ax, ay] of offs) {
      if (nactOffs(x2 + ax, num + ay)) return false;
    }
    if (inW(x2, num + 1, 0) && (typAt(x2, num + 1) === SPIKE || typAt(x2, num + 1) === TILE_BY_KEY['v_232_wooden_spike'])) return false;
    // CanGeneratePressurePlateAt（cs:11054-11071）精确形：InWorld(i,j,3) +
    //   SolidTileAllowBottomSlope(i,j+1)（cs:70211：tileSolid||solidTop、顶坡须平台
    //   proper 帧、非半砖、!inActive——**非** SolidTile,曾误用 dgSolid 漏 solidTop 地面）
    {
      const px2 = x2, py2 = num;
      if (!(px2 >= 3 && px2 < w - 3 && py2 >= 3 && py2 < h - 3)) return false;   // InWorld(i,j,3)
      const fi = st.inBounds(px2, py2 + 1) ? st.idx(px2, py2 + 1) : -1;
      let allowBottom = false;
      if (fi >= 0 && st.flags[fi]) {
        const ft = st.type[fi]!;
        const fsheet = TILE_DEFS[ft]?.vanilla?.sheet ?? -1;
        const fd = TILE_DEFS[ft];
        const topSlope = st.slope[fi] === 1 || st.slope[fi] === 2;
        allowBottom = (genSolidType(ft) || DG_SOLID_TOP.has(fsheet))
          && (!topSlope || ((fd?.platform ?? false) && platformProperFrameDg(st.frameX[fi]!)))
          && !st.half[fi]
          && ((st.wire[fi] >>> 5) & 1) === 0;
      }
      if (!allowBottom) return false;                       // SolidTileAllowBottomSlope
      const bt = typAt(px2, py2 + 1);
      const sheet = TILE_DEFS[bt]?.vanilla?.sheet ?? -1;
      if (sheet === 138 || sheet === 484 || sheet === 664 || sheet === 665 || (sheet >= 711 && sheet <= 716)) return false;   // Boulders
      if (wallAt(px2, py2 + 1) === 350) return false;
    }
    const num27 = num - ri(0, 2);
    const anchorOK = (xx: number, yy: number): boolean =>
      dgSolid(xx, yy) || (inW(xx, yy, 0) && actAt(xx, yy) !== 0 && (typAt(xx, yy) === TILE_BY_KEY['v_481_cracked_blue_brick']
        || typAt(xx, yy) === TILE_BY_KEY['v_482_cracked_green_brick'] || typAt(xx, yy) === TILE_BY_KEY['v_483_cracked_pink_brick']));
    let num28 = x2;
    while (!anchorOK(num28, num27)) {
      num28--;
      if (num28 < 0) return false;
    }
    let num29 = x2;
    while (!anchorOK(num29, num27)) {
      num29++;
      if (num29 > w) return false;
    }
    const n30 = x2 - num28, n31 = num29 - x2;
    let f5 = n30 > 5 && n30 < 50, f6 = n31 > 5 && n31 < 50;
    if (f5 && !dgSolid(num28, num27 + 1)) f5 = false;
    if (f6 && !dgSolid(num29, num27 + 1)) f6 = false;
    const badAnchor = (xx: number, yy: number): boolean => typAt(xx, yy) === DOOR || typAt(xx, yy) === SPIKE;
    if (f5 && ((inW(num28, num27, 0) && actAt(num28, num27) !== 0 && badAnchor(num28, num27))
      || (inW(num28, num27 + 1, 0) && actAt(num28, num27 + 1) !== 0 && badAnchor(num28, num27 + 1)))) f5 = false;
    if (f6 && ((inW(num29, num27, 0) && actAt(num29, num27) !== 0 && badAnchor(num29, num27))
      || (inW(num29, num27 + 1, 0) && actAt(num29, num27 + 1) !== 0 && badAnchor(num29, num27 + 1)))) f6 = false;
    let num26: number;
    if (f5 && f6) {
      num26 = num28;
      if (rn(2) === 0) num26 = num29;
    } else if (f6) num26 = num29;
    else {
      if (!f5) return false;
      num26 = num28;
    }
    if (typAt(num26, num27) === TILE_BY_KEY['v_190_glowing_mushroom_block']) return false;
    if (wallAt(num26, num27) === 350) return false;
    // 压板（:9104-9110）：PlaceTile(135, style)——墙>0（地牢内）style 2，否则
    // Next(2,4)∈{2,3}；★XXXX 轴修正：135 样式在 **frameY**（style*18；fx 归零）——
    // 金标 077 对拍 8 格 gold=(0,36)（style2）vs js=(36,0) 定罪（岩浆陷阱 style7=
    // frameY 126 同轴佐证；PlaceTile 1×1 族样式轴=frameY）
    const pStyle = wallAt(x2, num) > 0 ? 2 : ri(2, 3);
    chTile(st.idx(x2, num), TILE_BY_KEY['v_135_pressure_plates'], false);
    st.frameX[st.idx(x2, num)] = 0;
    st.frameY[st.idx(x2, num)] = pStyle * 18;
    st.flags[st.idx(num26, num27)] = 0;                         // KillTile（生成期 noItem）
    {
      const WVt0 = (globalThis as { __wvLines?: string[] }).__wvLines;
      if (WVt0 && (globalThis as { __swDgFx?: boolean }).__swDgFx === true) WVt0.push(`MARK|js_t0 KILL x2=${x2},num=${num} anch=${num26},${num27}`);
      // ★IIIII66 终刀：原版 KillTile 尾部级联（WorldGen.cs:64488-64493 type=0 →
      //   SquareTileFrame(i,j)=8 邻 TileFrame；上邻若为压板(135, tileFrameImportant
      //   Main.cs:7860)经 TileFrameImportant case 36/135(:86880-86894) → Check1x1
      //   (:45663) SolidTileAllowBottomSlope 门——支撑格刚被 Kill ⇒ 必杀）。
      //   JS 此前只清锚格写 137、无此级联：同 pass 更早 trap 实例压板正压在本锚
      //   上时成孤儿滞留（drunk x6 实证：trap#2 压板 (3367,671)，trap#3 锚
      //   ktsrc=(3367,672) Kill 后原版即刻 dg_k135 拆除、JS 滞留 → dungeonF
      //   c246 中枢活跃门翻转 → Pa/Ba ~530 格漂移）。仅模拟本路径可达面
      //   （锚格直邻上方压板）；SquareTileFrame 其余邻格对非板件无生成期可见差。
      const ax2 = num26, ay2 = num27 - 1;
      if (st.inBounds(ax2, ay2)) {
        const pi2 = st.idx(ax2, ay2);
        if (st.flags[pi2] !== 0) {
          const sh = TILE_DEFS[st.type[pi2]]?.vanilla?.sheet;
          if (sh === 135) {
            st.flags[pi2] = 0;                                  // Check1x1 → KillTile
            st.type[pi2] = 0;                                   // 同 KillTile 尾部 tile.type=0（快照 ghost 面对齐）
            if ((globalThis as { __wvLines?: string[] }).__wvLines && (globalThis as { __swDgFx?: boolean }).__swDgFx === true) {
              (globalThis as { __wvLines?: string[] }).__wvLines!.push(`MARK|js_k135 ${ax2},${ay2} wasSheet=${sh}`);
            }
          }
          void sh;
        }
      }
    }
    chTile(st.idx(num26, num27), TILE_BY_KEY['v_137_traps'], false);
    // 朝向（:9069-9085 num32 + :9119-9121 `if (num32==1) frameX += 18`）：
    // 左锚（num28，num32=1）→ fx=18 朝右射向压板；右锚（num29，num32=-1）→
    // fx=0 朝左（Wiring case 137：fx 0=左 18=右）。fy 归零 = 飞镖档（弹种=fy/18）
    const n32 = num26 === num28 ? 1 : -1;
    st.frameX[st.idx(num26, num27)] = n32 === 1 ? 18 : 0;
    st.frameY[st.idx(num26, num27)] = 0;
    // 铺线（:9122-9136）：压板 (x2,num) → 机关 (num26,num27) L 形楼梯红线
    // （横一步铺线、纵一步铺线，与 Lights_GenerateSwitch 同款循环——含两端格）
    {
      let wa = x2, wb = num;
      while (wa !== num26 || wb !== num27) {
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
        if (wa > num26) wa--;
        if (wa < num26) wa++;
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
        if (wb > num27) wb--;
        if (wb < num27) wb++;
        if (inW(wa, wb, 0)) st.wire[st.idx(wa, wb)] |= TileStore.WIRE_RED;
      }
    }
    return true;
  }
  // ============ DungeonGlobalGroundFurniture（Default，:187-253 + :255-861）============
  function dgFurniture(): void {
    const num2 = Math.trunc(2000 * (w / 4200) * 1.0);
    let alch = 1 + Math.trunc(w / 4200), bew = 1 + Math.trunc(w / 4200);
    let num3 = 2000;
    const I101m = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I101_MARK;
    const emit101 = (ln: string): void => { if (I101m) (globalThis as { __wvLines?: string[] }).__wvLines?.push(ln); };
    // ★IIIII98c：家具候选试掷格状态仪（与 rig Mark98FutCell 同 tag 同字段序；只读）
    const I110m = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I110_MARK;
    const emit110 = (ln: string): void => { if (I110m) ((globalThis as { __wvLines?: string[] }).__wvLines ??= []).push(ln); };
    const JRNG = I110m ? ((typeof process !== 'undefined' ? (__swProcessEnv ?? {}).SW_I110_JRNG : '') ?? '') : '';
    const jWin = (j: number): boolean => {
      if (!JRNG) return true;
      const dash = JRNG.indexOf('-');
      if (dash <= 0) return true;
      const lo = Number(JRNG.slice(0, dash)), hi = Number(JRNG.slice(dash + 1));
      return j >= lo && j <= hi;
    };
    const cellRow = (xx: number, yy: number): string => {
      if (!st.inBounds(xx, yy)) return `${yy},${xx}:OOB`;
      const ti = st.idx(xx, yy);
      return `${yy},${xx}:w${st.wall[ti]}t${st.type[ti]}a${st.flags[ti] !== 0 ? 1 : 0}hb${st.half[ti] !== 0 ? 1 : 0}sl${st.slope[ti]}lq${st.liquid[ti]}|`;
    };
    const futxMark = (jj: number, ph: number, xx: number, yy: number): void => {
      if (!I110m) return;
      const dw = isDW(wallAt(xx, yy)) ? 1 : 0;
      let sp = `MARK|futx|j=${jj} ph=${ph} ${xx},${yy} w=${wallAt(xx, yy)} a=${actAt(xx, yy) !== 0 ? 1 : 0} t=${typAt(xx, yy)} dw=${dw} st=${dgSolidFT(xx, yy) ? 1 : 0}`;
      if (jWin(jj)) {
        const rows: string[] = [];
        for (let wy = yy - 2; wy <= yy + 10; wy++) for (let wx = xx - 3; wx <= xx + 3; wx++) rows.push(cellRow(wx, wy));
        sp += '@' + rows.join('');
      }
      emit110(sp);
    };
    for (let j = 0; j < num2; j++) {
      emit101(`MARK|fuC|${j}|${alch}|${bew}`);
      if (alch > 0 || bew > 0) {
        j--;
        num3--;
        if (num3 <= 0) break;
      }
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(Math.max(bounds.T, Math.trunc(ws) + 10), bounds.B - 1);
      emit101(`MARK|fut|${x},${y}`);
      futxMark(j, 0, x, y);
      let n5 = 1000;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n5--;
        if (n5 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(Math.max(bounds.T, Math.trunc(ws) + 10), bounds.B - 1);
        emit101(`MARK|fut|${x},${y}`);
        futxMark(j, 1, x, y);
      }
      if (isDW(wallAt(x, y)) && actAt(x, y) === 0) {
        while (!dgSolidFT(x, y) && y < h - 200) { if (I110m) emit110(`MARK|fudes|${x},${y} w=${wallAt(x, y)} t=${typAt(x, y)} a=${actAt(x, y) !== 0 ? 1 : 0}`); y++; }
        y--;
        {
          const WV65f = (globalThis as { __wvLines?: string[] }).__wvLines;
          if (WV65f) WV65f.push(`MARK|dg_fC ${x},${y} j=${j}`);
        }
        emit101(`MARK|fuA|${x},${y}|${j < num2 / 2 ? 1 : 0}`);
        dgFurnAt(x, y, alch, bew, j < num2 / 2);
        const res = dgFurnResult as string;
        emit101(`MARK|fuR|${x},${y}|${res || 'none'}`);
        if ((globalThis as { __wvLines?: string[] }).__wvLines) (globalThis as { __wvLines?: string[] }).__wvLines!.push(`MARK|dg_fR ${res || 'none'} ${x},${y}`);
        if (res === 'alch') alch--;
        else if (res === 'bew') bew--;
      }
    }
  }
  let dgFurnResult: '' | 'alch' | 'bew' | 'ok' = '';
  function dgFurnAt(i: number, j: number, alch: number, bew: number, stricter: boolean): void {
    dgFurnResult = '';
    let num = i, k = i;
    while (inW(num, j, 0) && actAt(num, j) === 0 && dgSolidFT(num, j + 1)) num--;
    num++;
    while (inW(k, j, 0) && actAt(k, j) === 0 && dgSolidFT(k, j + 1)) k++;
    k--;
    const num2 = k - num, num3 = Math.trunc((k + num) / 2);
    {
      // IIII68 一次性对账仪（与 iii68-rig dg_fs/dg_fc/dg_fw 同构，仅观测不改行为）
      const WV68 = (globalThis as { __wvLines?: string[] }).__wvLines;
      const DGFX = WV68 !== undefined && (globalThis as { __swDgFx?: boolean }).__swDgFx === true;
      if (DGFX) WV68!.push(`MARK|dg_fs ${i},${j} n=${num} k=${k} n2=${num2} n3=${num3} alch=${alch} bew=${bew} m=${dgMainRolls}`);
      if (!featOK(num3, j, 0)) { if (DGFX) WV68!.push(`MARK|dg_fX CANREJ ${num3},${j} m=${dgMainRolls}`); return; }
      const ccA = inW(num3, j, 0) && actAt(num3, j) === 0;
      const ccW = isDW(wallAt(num3, j));
      const ccS = dgSolidFT(num3, j + 1);
      const ccB = ccA && ccW && ccS ? typAt(num3, j + 1) !== SPIKE : false;
      if (!(ccA && ccW && ccS && ccB)) { if (DGFX) WV68!.push(`MARK|dg_fc CR a=${ccA ? 1 : 0} w=${ccW ? 1 : 0} s=${ccS ? 1 : 0} b=${ccB ? 1 : 0} ${num3},${j} m=${dgMainRolls}`); }
      else {
        (globalThis as { __swDgFxBt?: string }).__swDgFxBt = '-';
        void 0;
      }
      void DGFX;
    }
    if (inW(num3, j, 0) && actAt(num3, j) === 0 && isDW(wallAt(num3, j)) && dgSolidFT(num3, j + 1) && typAt(num3, j + 1) !== SPIKE) {
      const base = theme === 0
        ? [1396, 1397, 1398, 1405, 1408, 1414, 1470, 2376, 2386, 2402, 2658, 2664, 2645, 3900]
        : theme === 1
          ? [1399, 1400, 1401, 1406, 1409, 1415, 1471, 2377, 2387, 2403, 2659, 2665, 2646, 3901]
          : [1402, 1403, 1404, 1407, 1410, 1416, 1472, 2378, 2388, 2404, 2660, 2666, 2647, 3902];
      let iChair = base[0], iTable = base[1], iWork = base[2], iCandle = base[3], iVase = base[4];
      let iBook = base[5], iBed = base[6], iPiano = base[7], iDress = base[8], iSofa = base[9];
      let iTub = base[10], iCand = base[11], iLamp = base[12], iClock = base[13];
      const wv = wallAt(num3, j);
      if (wv >= 94 && wv <= 105) {
        iChair = 1509; iTable = 1510; iWork = 1511; iCandle = 5743; iVase = -1; iBook = 1512; iBed = 5740;
        iPiano = 5750; iDress = 5741; iSofa = 5753; iTub = 5739; iCand = 5742; iLamp = 5748; iClock = 5746;
      }
      let num18 = rn(13);
      if ((num18 === 10 || num18 === 11 || num18 === 12) && rn(4) !== 0) num18 = rn(13);
      while ((num18 === 2 && iVase === -1) || (num18 === 5 && iBed === -1) || (num18 === 6 && iPiano === -1)
        || (num18 === 7 && iDress === -1) || (num18 === 8 && iSofa === -1) || (num18 === 9 && iTub === -1)
        || (num18 === 10 && iCand === -1) || (num18 === 11 && iLamp === -1) || (num18 === 12 && iClock === -1)) {
        num18 = rn(13);
      }
      {
        // IIII68：rn13 后镜像（rig dg_fw 同位）
        const WV68b = (globalThis as { __wvLines?: string[] }).__wvLines;
        if (WV68b && (globalThis as { __swDgFx?: boolean }).__swDgFx === true) WV68b.push(`MARK|dg_fw n3=${num3},${j} st=-9 wl=${wv} n18=${num18} m=${dgMainRolls}`);
      }
      const num19 = [5, 4, 3, 4, 3, 5, 5, 5, 5, 5, 2, 3, 2][num18];
      const num20 = [4, 3, 5, 6, 3, 3, 4, 4, 4, 3, 4, 3, 5][num18];
      let flag3 = false, flag4 = false;
      const num21 = (alch > 0 || bew > 0) ? 15 : 0;
      outer6:
      for (let a = num3 - num19 - num21; a <= num3 + num19 + num21; a++) {
        for (let b = j - num20 - num21; b <= j + num21; b++) {
          if (!inW(a, b, 0)) continue;
          if (a >= num3 - num19 && a <= num3 + num19 && b >= j - num20 && b <= j) {
            // ★#32 终清批 III：原版两处 break **只跳内层 m 循环**（DGGF:525-537）——
            //   外层 l 扫描继续，后续列仍参与 flag4（±15 邻域已有 354/355 表）检测。
            //   此前 break outer6 整体跳出 → (481,769) 锚没扫到 (501,768) 的巫惑台 →
            //   flag4 漏置 → bew 计数在错位消耗（vanilla bew@401,735 vs JS@481,769）。
            if (!featOK(a, b, 0)) { flag3 = true; break; }
            if (actAt(a, b) !== 0) { num18 = -1; break; }
          }
          if (stricter && (alch > 0 || bew > 0) && actAt(a, b) !== 0 && (typAt(a, b) === ALCHEMY || typAt(a, b) === BEWITCH)) flag4 = true;
        }
      }
      if (flag3) return;
      if (num2 < num19 * 1.75) num18 = -1;
      {
        const WV68c = (globalThis as { __wvLines?: string[] }).__wvLines;
        if (WV68c && (globalThis as { __swDgFx?: boolean }).__swDgFx === true) WV68c.push(`MARK|dg_fz n3=${num3},${j} n18=${num18} f4=${flag4 ? 1 : 0} n2=${num2} m=${dgMainRolls}`);
      }
      const fTr = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_DG_FURN_TRACE;
      if (fTr) console.log(`DG FU i=${i} j=${j} num3=${num3} span=${num2} flag4=${flag4 ? 1 : 0} alch=${alch} bew=${bew} n18=${num18} n19=${num19} n20=${num20}`);
      if (!flag4 && (alch > 0 || bew > 0)) {
        if (alch > 0) {
          if (place3x3D(num3, j, ALCHEMY)) { if (fTr) console.log(`DG FU ALCH ok @${num3},${j}`); dgFurnResult = 'alch'; return; }
        } else if (place3x3D(num3, j, BEWITCH)) { dgFurnResult = 'bew'; return; }
      } else if (num18 === 0) {
        if (place3x2D(num3, j, DG_ITEM_TILE[iTable], DG_ITEM_STYLE[iTable] ?? 0)) {
          if (iChair > -1) {
            if (inW(num3 - 2, j, 0) && actAt(num3 - 2, j) === 0 && place1x2D(num3 - 2, j, DG_ITEM_TILE[iChair], DG_ITEM_STYLE[iChair] ?? 0)) {
              // cs:591-592 左椅朝向翻转：放置成功 → 两格 frameX += 18
              st.frameX[st.idx(num3 - 2, j)] = (st.frameX[st.idx(num3 - 2, j)] ?? 0) + 18;
              st.frameX[st.idx(num3 - 2, j - 1)] = (st.frameX[st.idx(num3 - 2, j - 1)] ?? 0) + 18;
            }
            if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) place1x2D(num3 + 2, j, DG_ITEM_TILE[iChair], DG_ITEM_STYLE[iChair] ?? 0);
          }
          for (let n = num3 - 1; n <= num3 + 1; n++) {
            if (rn(2) !== 0 || !inW(n, j - 2, 0) || actAt(n, j - 2) !== 0) continue;
            const n23 = rn(5);
            const lt = inW(n - 1, j - 2, 0) ? st.type[st.idx(n - 1, j - 2)] : 0;   // tileLighted 门（ghost 亦读）
            if (iCandle > -1 && n23 <= 1 && !TILE_LIGHTED_D.has(lt)) placeOnTableD(n, j - 2, DG_ITEM_TILE[iCandle]);
            else if (n23 === 2 && !TILE_LIGHTED_D.has(lt)) placeOnTableD(n, j - 2, WATER_CANDLE);
            else if (n23 === 3) placeOnTableD(n, j - 2, BOOKS);
            else if (n23 === 4) place2x1D(n, j - 2, TILE_BY_KEY['v_103_bowls']!);
          }
          dgFurnResult = 'ok';
          return;
        }
      } else if (num18 === 1) {
        if (place2x1D(num3, j, DG_ITEM_TILE[iWork], DG_ITEM_STYLE[iWork] ?? 0)) {
          if (iChair > -1) {
            if (rn(2) === 0) {
              if (inW(num3 - 1, j, 0) && actAt(num3 - 1, j) === 0 && place1x2D(num3 - 1, j, DG_ITEM_TILE[iChair], DG_ITEM_STYLE[iChair] ?? 0)) {
                // cs:668-671 左椅翻转（工作台分支，桌分支同型）
                st.frameX[st.idx(num3 - 1, j)] = (st.frameX[st.idx(num3 - 1, j)] ?? 0) + 18;
                st.frameX[st.idx(num3 - 1, j - 1)] = (st.frameX[st.idx(num3 - 1, j - 1)] ?? 0) + 18;
              }
            } else if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) place1x2D(num3 + 2, j, DG_ITEM_TILE[iChair], DG_ITEM_STYLE[iChair] ?? 0);
          }
          for (let n = num3; n <= num3 + 1; n++) {
            if (rn(2) !== 0 || !inW(n, j - 1, 0) || actAt(n, j - 1) !== 0) continue;
            const n26 = rn(5);
            const lt = inW(n - 1, j - 1, 0) ? st.type[st.idx(n - 1, j - 1)] : 0;
            if (iCandle > -1 && n26 <= 1 && !TILE_LIGHTED_D.has(lt)) placeOnTableD(n, j - 1, DG_ITEM_TILE[iCandle]);
            else if (n26 === 2 && !TILE_LIGHTED_D.has(lt)) placeOnTableD(n, j - 1, WATER_CANDLE);
            else if (n26 === 3) placeOnTableD(n, j - 1, BOOKS);
            else if (n26 === 4) place2x1D(n, j - 1, TILE_BY_KEY['v_103_bowls']!);
          }
          dgFurnResult = 'ok';
          return;
        }
      } else if (num18 === 2) {
        if (iVase > -1 && place2xXD(num3, j, DG_ITEM_TILE[iVase], 3, DG_ITEM_STYLE[iVase] ?? 0)) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 3) {
        if (iBook > -1) place3x4D(num3, j, DG_ITEM_TILE[iBook]);
      } else if (num18 === 4) {
        // ★cs:794-807 椅分支：Next(2) 方向掷（0=翻转镜像帧 +=18；掷必耗）
        if (iChair > -1) {
          const flip = rn(2) === 0;
          place1x2D(num3, j, DG_ITEM_TILE[iChair], DG_ITEM_STYLE[iChair] ?? 0);
          if (flip) {
            st.frameX[st.idx(num3, j)] = (st.frameX[st.idx(num3, j)] ?? 0) + 18;
            st.frameX[st.idx(num3, j - 1)] = (st.frameX[st.idx(num3, j - 1)] ?? 0) + 18;
          }
          if (inW(num3, j, 0) && actAt(num3, j) !== 0 && st.type[st.idx(num3, j)] === DG_ITEM_TILE[iChair]) {
            dgFurnResult = 'ok'; return;
          }
        }
      } else if (num18 === 5) {
        // ★cs:820-829 床分支：Next(2) direction 掷 → Place4x2(dir)
        if (iBed > -1) {
          const dir = rn(2) === 0 ? 1 : -1;
          if (place4x2D(num3, j, DG_ITEM_TILE[iBed], dir)) { dgFurnResult = 'ok'; return; }
        }
      } else if (num18 === 6) {
        if (iPiano > -1 && place3x2D(num3, j, DG_ITEM_TILE[iPiano], DG_ITEM_STYLE[iPiano] ?? 0)) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 7) {
        if (iDress > -1 && place3x2D(num3, j, DG_ITEM_TILE[iDress], DG_ITEM_STYLE[iDress] ?? 0)) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 8) {
        if (iSofa > -1 && place3x2D(num3, j, DG_ITEM_TILE[iSofa], DG_ITEM_STYLE[iSofa] ?? 0)) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 9) {
        // ★cs:833-842 浴缸分支：Next(2) direction 掷
        if (iTub > -1) {
          const dir = rn(2) === 0 ? 1 : -1;
          if (place4x2D(num3, j, DG_ITEM_TILE[iTub], dir)) { dgFurnResult = 'ok'; return; }
        }
      } else if (num18 === 10) {
        if (iLamp > -1 && place1xXD(num3, j, DG_ITEM_TILE[iLamp], 3, DG_ITEM_STYLE[iLamp] ?? 0)) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 11) {
        if (iCand > -1 && place2x2D(num3, j, DG_ITEM_TILE[iCand], DG_ITEM_STYLE[iCand] ?? 0)) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 12) {
        if (iClock > -1 && place2xXD(num3, j, DG_ITEM_TILE[iClock], 5, DG_ITEM_STYLE[iClock] ?? 0)) { dgFurnResult = 'ok'; return; }
      }
      {
        // IIII68：链尾未命中（=原版 return false 落底）镜像
        const WV68d = (globalThis as { __wvLines?: string[] }).__wvLines;
        if (WV68d && (globalThis as { __swDgFx?: boolean }).__swDgFx === true) WV68d.push(`MARK|dg_ff n3=${num3},${j} n18=${num18} f4=${flag4 ? 1 : 0} m=${dgMainRolls}`);
      }
    }
    {
      const WV68e = (globalThis as { __wvLines?: string[] }).__wvLines;
      if (WV68e && (globalThis as { __swDgFx?: boolean }).__swDgFx === true) WV68e.push(`MARK|dg_fo ${num3},${j} m=${dgMainRolls}`);
    }
  }
  const dgTileOfSheet = (sheet: number): number => TILE_INTERNAL_BY_SHEET.get(sheet) ?? -1;  // （DG_ITEM_TILE 已源头换算后无内部消费者,留作家具重构期过渡）
  // —— ★Place* 家族（2026-08-17 终清批，与 oracle DgP* 同构；帧走 setTileSilent 由调用方
  //    追加——此处保成功判定+写集 footprint；tileTable/tileLighted = Main.cs 全表提取）——
  const TILE_TABLE_D = new Set<number>([14,18,19,87,88,101,114,275,276,277,278,279,280,281,285,286,296,297,298,
    299,309,310,339,358,359,361,362,363,364,376,380,391,392,393,394,405,413,414,427,469,532,533,538,542,
    544,550,551,553,554,555,556,558,559,582,599,600,601,602,603,604,605,606,607,608,609,610,611,612,619,
    629,632,640,643,644,645,710].map(dgTileOfSheet));
  const TILE_LIGHTED_D = new Set<number>([4,17,19,20,22,26,27,31,33,34,35,37,42,49,58,61,70,71,72,76,77,83,
    84,92,93,95,96,98,100,109,125,126,129,133,140,149,160,171,173,174,184,190,204,209,215,237,238,270,271,
    286,302,316,317,318,327,336,340,341,342,343,344,346,347,348,349,350,354,356,370,372,381,390,391,405,
    415,416,417,418,429,463,491,500,501,502,503,517,519,528,534,535,536,537,539,540,548,564,568,569,570,
    572,578,580,581,582,592,593,594,597,598,613,614,619,620,625,626,627,628,633,634,637,638,646,656,658,
    659,660,663,667,684,687,688,689,690,691,692,695,696,699,701,703,708,711,717,718,719,739].map(dgTileOfSheet));
  const dgWr = (x: number, y: number, t: number): void => {
    const i = st.idx(x, y);
    st.flags[i] = 1; st.type[i] = t;
    // PlaceTile 前奏（WorldGen.cs:59499-59501 !active → Clear(Tile|TilePaint|Slope)）；
    // 全部调用方先 dgClr（inactive）→ 此处清坡=原版逐格语义
    st.slope[i] = 0; st.half[i] = 0;
  };
  const dgClr = (x: number, y: number): boolean => inW(x, y, 0) && st.flags[st.idx(x, y)] === 0;
  // Place3x2（cs:52097 桌14/钢琴87/梳妆台88/长凳89/篝火215）
  // ★VVVVV 帧补（cs:52183-52234）：frameX=54*style+col*18、frameY=0(顶)/18(底)。
  //   曾 dgWr 只写 type 帧全 0——下游 Piles/FinalCleanup 的 Check3x2 完整性门按
  //   帧锚反解原点必得假原点 → 整物误杀（#77 首差 m 链钢琴 87×6 / 12345 链
  //   长凳 89×6 根因；vanilla 金标帧完好存活）。style 缺省 0（塔篝火原文）。
  function place3x2D(x: number, y: number, t: number, style = 0): boolean {
    if (x < 5 || x > w - 5 || y < 5 || y > h - 5) return false;
    for (let i = x - 1; i < x + 2; i++) {
      for (let j = y - 1; j < y + 1; j++) if (!dgClr(i, j)) return false;
      if (!solidTile2D(i, y + 1)) return false;
    }
    const bx = 54 * style;
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 1; j < y + 1; j++) {
      dgWr(i, j, t);
      const fi = st.idx(i, j);
      st.frameX[fi] = bx + (i - (x - 1)) * 18;
      st.frameY[fi] = j === y - 1 ? 0 : 18;
    }
    return true;
  }
  // Place2x1（cs:47371 工作台18；103 骷髅=桌上版）
  // ★VVVVV 帧补（cs:47405-47413）：frameX=36*style+0/18、frameY=0
  function place2x1D(x: number, y: number, t: number, style = 0): boolean {
    const skull = t === dgTileOfSheet(103);
    for (let i = x; i <= x + 1; i++) {
      if (!dgClr(i, y)) return false;
      const bi = st.idx(i, y + 1);
      if (skull) { if (st.flags[bi] === 0 || !TILE_TABLE_D.has(st.type[bi])) return false; }
      else if (!solidTile2D(i, y + 1)) return false;
    }
    dgWr(x, y, t); dgWr(x + 1, y, t);
    const bx = 36 * style;
    st.frameX[st.idx(x, y)] = bx;
    st.frameX[st.idx(x + 1, y)] = bx + 18;
    st.frameY[st.idx(x, y)] = 0;
    st.frameY[st.idx(x + 1, y)] = 0;
    return true;
  }
  // Place1x2（cs:46665 椅15）
  // ★VVVVV 帧补（cs:46685-46691）：frameY=40*style+0(上)/18(下)、frameX=0
  //   （type 20 苗的随机 fx 不适用椅）。曾零帧——Check1x2 完整性链按 40 行剥
  //   锚必败（#77 引擎补 Check1x2 臂后地牢椅将全误杀，故同批补帧）。
  function place1x2D(x: number, y: number, t: number, style = 0): boolean {
    if (!solidTile2D(x, y + 1) || !dgClr(x, y - 1) || !dgClr(x, y)) return false;
    dgWr(x, y - 1, t); dgWr(x, y, t);
    const by = 40 * style;
    st.frameY[st.idx(x, y - 1)] = by;
    st.frameY[st.idx(x, y)] = by + 18;
    st.frameX[st.idx(x, y - 1)] = 0;
    st.frameX[st.idx(x, y)] = 0;
    return true;
  }
  // PlaceOnTable1x1（cs:45346 蜡烛33/水瓶49/书50/瓶13）
  // ★type 50 书：命中放置即 frameX = 18*Next(5)（cs:45377）——每次成功的书放置耗 1 骰
  //   （oracle DgPlaceTileProbe 实证 B 段 177 本书全带此掷）。
  function placeOnTableD(x: number, y: number, t: number): boolean {
    if (!dgClr(x, y) || !inW(x, y + 1, 0)) return false;
    const bi = st.idx(x, y + 1);
    // PlaceOnTable1x1 :45360 锚=!active && **nactive()** && tileTable（MMMM 批补 !inActive）
    if (st.flags[bi] === 0 || ((st.wire[bi] >>> 5) & 1) !== 0 || !TILE_TABLE_D.has(st.type[bi])) return false;
    dgWr(x, y, t);
    // cs:45377 书帧 = 18*Next(5)（五书色随机；掷值此前被丢弃=恒帧 0，2026-08-18 补写）
    if (t === BOOKS) st.frameX[st.idx(x, y)] = 18 * rn(5);
    return true;
  }
  // Place2xX（cs:39705 钟104 h5/雕像105 h3）
  // ★XXXX 帧补：num=style*36（105 族 style≥55 时 num-=1980*num4/num2+=54*num4 回卷，
  //   cs:39717-39723）；左列 fx=num、右列 +18；fy=num2+row*18（自顶行 0）。
  //   曾无 style 参数帧落 0——金标 077 对拍 105 族 18 格（三座粉花瓶 1410 style48
  //   (329,763)(159,879)(171,879) gold=(1728+col*18,row*18) js=(0,0)）定罪。
  function place2xXD(x: number, y: number, t: number, hgt: number, style = 0): boolean {
    for (let j = y - hgt + 1; j <= y; j++) if (!dgClr(x, j) || !dgClr(x + 1, j)) return false;
    if (!solidTile2D(x, y + 1) || !solidTile2D(x + 1, y + 1)) return false;
    let num = style * 36, num2 = 0;
    if (t === STATUE) {
      const num4 = Math.trunc(style / 55);
      num -= 1980 * num4;
      num2 += 54 * num4;
    }
    for (let j = 0; j < hgt; j++) {
      const yy = y - hgt + 1 + j;
      dgWr(x, yy, t); dgWr(x + 1, yy, t);
      st.frameX[st.idx(x, yy)] = num;
      st.frameY[st.idx(x, yy)] = num2 + j * 18;
      st.frameX[st.idx(x + 1, yy)] = num + 18;
      st.frameY[st.idx(x + 1, yy)] = num2 + j * 18;
    }
    return true;
  }
  // Place1xX（cs:39570 路灯93 h3；92 吊灯族 h6）
  // ★NNN 帧补（cs:39595-39600）：frameY=j*18+hgt*style*18（hgt=3 → style*54）、
  //   frameX=0。曾裸写零帧——帧不在 mile8 八通道内潜伏，const #49 残 ×1 定罪：
  //   水淹灯 Check1xX 整组杀依赖六格帧一致（LiquidSim.check1xXGen 级联），零帧灯
  //   杀后留孤儿（MMM 批 ×2→×1,本批归零）。
  function place1xXD(x: number, y: number, t: number, hgt: number, style = 0): boolean {
    for (let j = y - hgt + 1; j <= y; j++) if (!dgClr(x, j) || st.liquid[st.idx(x, j)] > 0) return false;
    if (!solidTile2D(x, y + 1)) return false;
    for (let j2 = 0; j2 < hgt; j2++) {
      const yy = y - hgt + 1 + j2;
      dgWr(x, yy, t);
      const fi = st.idx(x, yy);
      st.frameX[fi] = 0;
      st.frameY[fi] = j2 * 18 + hgt * style * 18;
    }
    return true;
  }
  // Place3x4（cs:51943 书架101）
  function place3x4D(x: number, y: number, t: number): boolean {
    for (let i = x - 1; i < x + 2; i++) {
      for (let j = y - 3; j < y + 1; j++) if (!dgClr(i, j)) return false;
      if (!solidTile2D(i, y + 1)) return false;
    }
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 3; j < y + 1; j++) dgWr(i, j, t);
    return true;
  }
  // Place4x2（cs:50534 床79/浴缸90 direction）
  function place4x2D(x: number, y: number, t: number, dir: number): boolean {
    if (x < 5 || x > w - 5 || y < 5 || y > h - 5) return false;
    for (let a = x - 1; a < x + 3; a++) {
      for (let b = y - 1; b < y + 1; b++) if (!dgClr(a, b)) return false;
      if (!solidTile2D(a, y + 1)) return false;
    }
    const fx0 = dir === 1 ? 72 : 0;
    for (let a = x - 1; a < x + 3; a++) for (let b = y - 1; b < y + 1; b++) dgWr(a, b, t);
    return true;
  }
  // Place2x2（cs:51352 烛台100）
  function place2x2D(x: number, y: number, t: number, style = 0): boolean {
    for (let i = x - 1; i < x + 1; i++) {
      for (let j = y - 1; j < y + 1; j++) if (!dgClr(i, j)) return false;
      const bi = st.idx(i, y + 1);
      if (st.flags[bi] === 0 || (!solidTile2D(i, y + 1) && !TILE_TABLE_D.has(st.type[bi]))) return false;
    }
    const num22 = TILE_DEFS[t]?.vanilla?.sheet === 172 ? 38 : 36;
    for (let i = x - 1; i < x + 1; i++) for (let j = y - 1; j < y + 1; j++) {
      dgWr(i, j, t);
      const fi = st.idx(i, j);
      st.frameX[fi] = (i - x + 1) * 18;
      st.frameY[fi] = style * num22 + (j - y + 1) * 18;
    }
    return true;
  }
  // Place3x3（cs:53549 354/355 分支A；★53650 起 = PlaceSunflower，勿混——
  // 53683 的 9 颗 Next(3) 掷属向日葵帧族，Place3x3 本体零掷，GGG 批 2026-08-18 勘误）
  function place3x3D(x: number, y: number, t: number): boolean {
    for (let i = x - 1; i < x + 2; i++) {
      for (let j = y - 2; j < y + 1; j++) if (!dgClr(i, j)) return false;
      if (!solidTile2D(i, y + 1)) return false;
    }
    // Place3x3（WorldGen.cs:53610-53652）逐格帧：frameX/frameY = 0/18/36
    // （num2 = style*54，地牢恒 style 0）。此前 dgWr 只写 type 帧全 0——静态
    // 家具靠渲染端零帧重建兜底无恙，动画家具（炼金台 355/巫惑台 354，本函数
    // 唯二调用方）曾因动画偏移破坏重建门而整物碎裂
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 2; j < y + 1; j++) {
      dgWr(i, j, t);
      const fi = st.idx(i, j);
      st.frameX[fi] = (i - x + 1) * 18;
      st.frameY[fi] = (j - y + 2) * 18;
    }
    return true;
  }
  // Place3x3Wall（cs:44281 画240）/ Place4x3Wall（cs:44874 画241）/ Place6x4Wall（cs:44959 画242）
  // ★PPPPP 批（2026-08-20）：补 style 帧步进（三函数零掷不扰流）——旧版裸 dgWr
  //   帧全 f0,0，下游 Piles/FinalCleanup 的 Check3x3Wall 一致性校验按帧反解原点
  //   必得假原点 → 整幅误杀（#77 首差 9 格 (300-302,761-763) 根因；JS 杀除逻辑
  //   本身忠实）。三族帧公式互异：3x3=style 分解双基（X=余*54/Y=商*54）、
  //   4x3=style 只进 Y（X 纯列偏移）、6x4=27 进制（X=⌊s/27⌋*108/Y=s%27*72）
  function place3x3WallD(x: number, y: number, t: number, style = 0): boolean {
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 1; j < y + 2; j++)
      if (!dgClr(i, j) || st.wall[st.idx(i, j)] === 0) return false;
    // cs:44304-44319：while(style>35){sy++;style-=36} → X基=style*54、Y基=sy*54
    let s3 = style, sy = 0;
    while (s3 > 35) { sy++; s3 -= 36; }
    const bx3 = s3 * 54, by3 = sy * 54;
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 1; j < y + 2; j++) {
      dgWr(i, j, t);
      const fi = st.idx(i, j);
      st.frameX[fi] = bx3 + (i - (x - 1)) * 18;
      st.frameY[fi] = by3 + (j - (y - 1)) * 18;
    }
    return true;
  }
  function place4x3WallD(x: number, y: number, t: number, style = 0): boolean {
    for (let i = x - 1; i < x + 3; i++) for (let j = y - 1; j < y + 2; j++)
      if (!dgClr(i, j) || st.wall[st.idx(i, j)] === 0) return false;
    // cs:44900-44914：num3=0 恒（frameX 纯列偏移 0/18/36/54）、Y基=style*54
    const by4 = style * 54;
    for (let i = x - 1; i < x + 3; i++) for (let j = y - 1; j < y + 2; j++) {
      dgWr(i, j, t);
      const fi = st.idx(i, j);
      st.frameX[fi] = (i - (x - 1)) * 18;
      st.frameY[fi] = by4 + (j - (y - 1)) * 18;
    }
    return true;
  }
  function place6x4WallD(x: number, y: number, t: number, style = 0): boolean {
    for (let i = x - 2; i < x + 4; i++) for (let j = y - 2; j < y + 2; j++)
      if (!dgClr(i, j) || st.wall[st.idx(i, j)] === 0) return false;
    // cs:44984-44998：X基=⌊style/27⌋*108、Y基=style%27*72（6×4=108×72px 大画）
    const bx6 = Math.floor(style / 27) * 108, by6 = (style % 27) * 72;
    for (let i = x - 2; i < x + 4; i++) for (let j = y - 2; j < y + 2; j++) {
      dgWr(i, j, t);
      const fi = st.idx(i, j);
      st.frameX[fi] = bx6 + (i - (x - 2)) * 18;
      st.frameY[fi] = by6 + (j - (y - 2)) * 18;
    }
    return true;
  }
  // PlaceBanner（cs:46270 旗91：竖 3 格，上挂实心非 solidTop）
  // ★NNN 批 ②（2026-08-18）：补 style 帧链——DungeonGlobalBanners.cs:95 走
  //   `num7 = data.bannerStyles[num8]` → PlaceTile(91,style) → PlaceBanner 写
  //   frameX=style*18（s>=111 时 fx-=1998/fy+=54，dungeon styles 10-15 不触发）、
  //   frameY=0/18/36。旧版裸 dgWr 不落帧 → 378 格 banner frameX 恒 0 全第一帧
  function placeBannerD(x: number, y: number, t: number, style = 0): boolean {
    const WV99b = (globalThis as { __wvLines?: string[] }).__wvLines;
    let failWhy = '';
    {
      const ui = st.idx(x, y - 1);
      if (!inW(x, y - 1, 0)) failWhy = 'oob';
      else if (st.flags[ui] === 0) failWhy = 'upInact';
      else {
        const dUp = TILE_DEFS[st.type[ui]];
        if (!dUp || !dUp.solid || dUp.platform) failWhy = `upSheet=${dUp?.vanilla?.sheet ?? -1}`;
      }
      if (!failWhy && (!dgClr(x, y) || !dgClr(x, y + 1) || !dgClr(x, y + 2))) failWhy = 'occupied';
    }
    if (failWhy) {
      if (WV99b) WV99b.push(`MARK|i99BFAIL ${x},${y} why=${failWhy} mc=${(globalThis as { __swRollN?: number }).__swRollN}`);
      return false;
    }
    dgWr(x, y, t); dgWr(x, y + 1, t); dgWr(x, y + 2, t);
    // PlaceBanner 帧写（cs:46293-46313；PlaceBanner 零掷，不扰流）
    let fx = style * 18, fy = 0, s3 = style;
    while (s3 >= 111) { s3 -= 111; fx -= 1998; fy += 54; }
    st.frameX[st.idx(x, y)] = fx; st.frameY[st.idx(x, y)] = fy;
    st.frameX[st.idx(x, y + 1)] = fx; st.frameY[st.idx(x, y + 1)] = fy + 18;
    st.frameX[st.idx(x, y + 2)] = fx; st.frameY[st.idx(x, y + 2)] = fy + 36;
    if (WV99b) WV99b.push(`MARK|i99WROTE ${x},${y} mc=${(globalThis as { __swRollN?: number }).__swRollN}`);
    return true;
  }
  /**
   * ★IIIII92 吊灯组完整性复验 v2 —— WorldGen.CheckChand 全句直译
   * （Terarria1458 WorldGen.cs:53262-53445，与 IIII87 批 first 版本质差别=组框不再用
   * flood-fill 包围盒，而是**页式帧重构**：从触发格自身 frameX/frameY 推导组左列/顶行/
   * 页基，再对矩形内逐格校验「活性+同型+帧位 == 页基+组内偏移」逐句还原；另含
   * destroyObject 门（kill 循环内 KillTile 尾 SquareTileFrame 的再入被原版同款短路）、
   * 每击杀格 KillTile 尾态直写（active=false/halfBrick=false/frame=-1/type=0/inActive=false，
   * rig #032 出口 dump 实证 typ=0/frames=65535）与 **KillTile_GetTileDustAmount 骰面**
   * （cs:67127 default !fail=10 次 MakeTileDust；cs:69069 `(type==34||type==42)&&Next(2)`
   * ——每调 1×Next(2)，故 sheet34 每击杀格恒耗 10 掷，x86 sparkle KCH rc∈[279707..279787]
   * 九连步进恰 +90 实证=1..106 族「rollwin 尾段 +90」账本闭合源）。
   * 相邻烛台互检：相邻 PlaceTile 写/重帧把组成员冲成他型或页外帧位 ⇒ 该组在任一成员
   * 被 SquareTileFrame 重帧时整组拆除——尾巴 5×5 TileFrame 环（cs:53438-53444）的跨族
   * 级联在本引擎镜像面无消费方（Kill 循环本身已处 destroyObject 门内），不建模。 */
  let dgDestroyObject = false;
  function dgCheckChand(i: number, j: number, tChand: number): void {
    if (dgDestroyObject) return;                                  // cs:53264 destroyObject 门
    let flag = false;
    // 组框推导（cs:53269-53310）：num=frameX/18 列号、num4 整组数、num5 左列、
    // num6=18*num3*num4 帧基px、num7 行组数、num8=54*num7(≥108 分页折返修正)
    let num = Math.floor(st.frameX[st.idx(i, j)] / 18);
    const num3 = 3;                                               // 吊灯族 sheet454 4 列宽——地牢域不可达,常数照录
    let num4 = 0;
    while (num >= num3) { num4++; num -= num3; }                  // cs:53279-53282
    const num5 = i - num;                                         // cs:53283 组首列
    const num6 = 18 * num3 * num4;                                // cs:53284
    if (num >= num3) { num -= num3; }                             // cs:53286 死代码保形（while 后必 <num3）
    num = i - num;                                                // cs:53289 num=num5 同值
    let num2 = Math.floor(st.frameY[st.idx(i, j)] / 18);          // cs:53290
    let num7 = 0;
    while (num2 >= 3) { num7++; num2 -= 3; }                      // cs:53293-53295
    if (num6 >= 108) { num7 += 37 * Math.floor(num6 / 108); }     // cs:53298 页带折返(字面常量,num3 无关)
    let num8 = 54 * num7;                                         // cs:53301
    if (num6 >= 108) { num8 -= 54 * Math.floor(num6 / 108) * 37; }// cs:53303-53304
    if (num2 >= 3) { num2 -= 3; }                                 // cs:53307 死代码保形
    num2 = j - num2;                                              // cs:53310 组首行
    // 组内逐格校验（cs:53311-53324）：活性+同型+两轴帧位==期望值
    for (let m = num; m < num + num3; m++) {
      for (let n = num2; n < num2 + 3; n++) {
        if (!inW(m, n, 0)) { flag = true; continue; }             // vanilla null tile
        const ci = st.idx(m, n);
        if (!(st.flags[ci] !== 0 && st.type[ci] === tChand
          && st.frameX[ci] === (m - num5) * 18 + num6
          && st.frameY[ci] === (n - num2) * 18 + num8)) flag = true;
      }
    }
    // 顶锚（cs:53325-53331）：(num+1,num2-1) 须 nactive()（active&&!inActive）+
    // Main.tileSolid[type] 且非 Main.tileSolidTop[type]（solid 表走生成期覆写表 genSolidType,
    // solidTop 走 DG_SOLID_TOP——与 placeChand 放置门同表同判项）
    if (!flag) {
      if (!inW(num + 1, num2 - 1, 0)) flag = true;
      else {
        const ai = st.idx(num + 1, num2 - 1);
        const upSheet = TILE_DEFS[st.type[ai]]?.vanilla?.sheet ?? -1;
        if (!(st.flags[ai] !== 0 && ((st.wire[ai] >>> 5) & 1) === 0
          && genSolidType(st.type[ai]) && !DG_SOLID_TOP.has(upSheet))) flag = true;
      }
    }
    if (!flag) return;                                            // cs:53333-53336
    dgDestroyObject = true;                                       // cs:53337 kill 循环期间挡再入
    for (let m = num; m < num + num3; m++) {
      for (let n = num2; n < num2 + 3; n++) {
        if (!inW(m, n, 0)) continue;
        const ci = st.idx(m, n);
        if (!(st.flags[ci] !== 0 && st.type[ci] === tChand)) continue;  // 仅组型活格走 KillTile(cs:53342-53346)
        // KillTile 终态段（cs:64447-64473）：active(false)+halfBrick(false)+frame=-1×2
        // +type=0+inActive(false)；尘骰=GetTileDustAmount(!fail)=default10 × MakeTileDust
        // 各 1×Next(2)（仅 sheet34/42 有条件表达式→掷,其余型零掷）。
        st.flags[ci] = 0; st.half[ci] = 0; st.slope[ci] = 0;
        st.frameX[ci] = -1; st.frameY[ci] = -1;                   // Uint16 环绕落盘=65535,与 rig .frx/.fry 同形
        st.type[ci] = 0;
        st.wire[ci] &= ~32;                                        // inActive(false)（cs:64471）
        const kSheet = TILE_DEFS[tChand]?.vanilla?.sheet ?? -1;
        if (kSheet === 34 || kSheet === 42) {
          for (let d = 0; d < 10; d++) rng.nextInt(2);            // cs:64220-64226+cs:69069
        }
      }
    }
    // cs:53348-53436 item 掉落（454 特典/main.rand 面 + 34 GetItemDrop_Chandeliers(num7)）
    // ——本引擎装饰掉落在世界生成域无实体无掷（CaveHouse 三级探针 certified 90 掷净耗），
    // 直写终态等价，故省略。
    dgDestroyObject = false;                                      // cs:53437
    // 尾环 TileFrame(num-1..num+num3+1 × num2-1..num2+3)（cs:53438-53444）：跨族互检级联
    // （Banners/门/画框等）在本域无可观测八通道消费方（未建模备案）；灯族再触发不可达
    // （组已灭+destroyObject 已清但成员全 type=0）。
    {
      const evd = (globalThis as { __swDgDecor?: Array<unknown> }).__swDgDecor;
      if (evd) evd.push({ k: 'KCHv2', rc: dgMainRolls, at: `${i},${j}`, rect: `${num},${num2}`, dice: 90, t: TILE_DEFS[tChand]?.vanilla?.sheet });
    }
  }
  /** ★IIIII92 挂点改型：WorldGen.PlaceTile case91 尾的无条件 SquareTileFrame(i,j)
   *  （cs:60614-60617 成败两侧必走）→ TileFrame(i±1,j±1...) 环列式派发（保持原版
   *  列主序：(-1,-1)(-1,0)(-1,+1)(0,-1)...）。环内任何活性吊灯格各自 CheckChand 一轮；
   *  旧 ±2×[-4,+5] 近扫版废弃（越界多杀/少杀都不含于原版环）。 */
  function sqTfLightsRing(x: number, y: number): void {
    const cells: Array<[number, number]> = [
      [x - 1, y - 1], [x - 1, y], [x - 1, y + 1],
      [x, y - 1], [x, y], [x, y + 1],
      [x + 1, y - 1], [x + 1, y], [x + 1, y + 1],
    ];
    const WV99 = (globalThis as { __wvLines?: string[] }).__wvLines;
    for (const [a, b] of cells) {
      if (!inW(a, b, 0)) continue;
      const ti = st.idx(a, b);
      if (st.flags[ti] !== 0 && st.type[ti] === CHANDELIER) {
        if (WV99) WV99.push(`MARK|i99CHK ${a},${b} bx=${x},by=${y} rc=${dgMainRolls}`);
        dgCheckChand(a, b, CHANDELIER);
      }
    }
  }
  // 画作分发（cs:59962-59985）：240→3x3Wall / 241→4x3Wall / 242→6x4Wall
  // ★PPPPP 批：style 透传入帧（Place3x3Wall 族逐格帧步进，见上）
  function placePaintingD(x: number, y: number, t: number, style = 0): boolean {
    if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(`MARK|ppP|${x},${y}|${TILE_DEFS[t]?.vanilla?.sheet ?? -1},${style}`);
    if (t === HANGING) return place3x3WallD(x, y, t, style);
    if (t === CATACOMB) return place4x3WallD(x, y, t, style);
    if (t === PAINTING) return place6x4WallD(x, y, t, style);
    return placeSimple(x, y, t);
  }
  // SolidTile2（WorldGen.cs：active+tileSolid，无 solidTop 排除）
  function solidTile2D(x: number, y: number): boolean {
    if (!inW(x, y, 0)) return false;
    const i = st.idx(x, y);
    if (st.flags[i] === 0) return false;
    const d = TILE_DEFS[st.type[i]];
    return !!d && !!d.solid && !d.platform;
  }
  // Place4x2（WorldGen.cs:50534）：4×2 净空 + 下方实心
  function place4x2(x: number, y: number, type: number): boolean {
    if (type === undefined || type < 0 || x < 5 || x > w - 5 || y < 5 || y > h - 5) return false;
    const solid2 = (xx: number, yy: number): boolean => {
      if (!inW(xx, yy, 0) || actAt(xx, yy) === 0) return false;
      return !!TILE_DEFS[typAt(xx, yy)]?.solid;
    };
    for (let a = x - 1; a < x + 3; a++) {
      for (let b = y - 1; b < y + 1; b++) {
        if (!inW(a, b, 0) || actAt(a, b) !== 0) return false;
      }
      if (!solid2(a, y + 1)) return false;
    }
    for (let a = x - 1; a < x + 3; a++) {
      for (let b = y - 1; b < y + 1; b++) chTile(st.idx(a, b), type, false);  // DG_ITEM_TILE 已是内部 id（2026-08-13 碰撞修复）
    }
    return true;
  }

  // ============ DungeonGlobalPaintings（:28-321）============
  function dgPaintings(): void {
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DGPA_TRACE) console.log(`P0 rolls=${dgMainRolls}`);
    // ★IIIII65 对账仪：与 rig JJHook.Mark(dg_pa*) 同位同 tag（__swWvLog 门控零开销）
    const WV65 = (globalThis as { __wvLines?: string[] }).__wvLines;
    const t65 = (ln: string): void => { if (WV65) WV65.push(ln); };
    t65(`MARK|dg_pa0 n4=${Math.trunc(100 * (w / 4200) * Math.max(1, 0.75))} L=${bounds.L} R=${bounds.R} T=${bounds.T} B=${bounds.B} ws=${Math.trunc(ws)} wv0=${wallVariants[0]}`);
    // lihzahrdPaintingsMax（DungeonGlobalPaintings.cs:36-42）：GetWorldSize()（WG:6518）
    // 4200 宽 → **0**（≤4200 case）→ switch default → max=1——**零掷**（仅 >6400 的
    // case 2 才掷 Next(2)）。★#32 终清批 III：此前误按"Large=4200"恒掷 → Pa 段全程
    // 流错位 +1（x86 逐事件反解：vanilla 首 PE@+5 而旧 JS@+6 起）。
    void 0;
    const num2v = wallVariants[0];
    const num4 = Math.trunc(100 * (w / 4200) * Math.max(1, 0.75));
    let num5 = num4 * 3;
    const paEmit101 = (ln: string): void => { if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(ln); };
    for (let i = 0; i < num4; i++) {
      paEmit101(`MARK|paC|${i}|${num5}`);
      num5--;
      if (num5 <= 0) break;
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(Math.trunc(ws), bounds.B - 1);
      paEmit101(`MARK|pat|${x},${y}`);
      let n8 = 1000;
      if (WV65 && i < 12) WV65.push(`MARK|dg_paT i=${i} ${x},${y}`);
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n8--;
        if (n8 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(Math.trunc(ws), bounds.B - 1);
        paEmit101(`MARK|pat|${x},${y}`);
      }
      if ((typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DGPA_TRACE)) console.log(`S ${x} ${y}`);
      for (let t = 0; t < 2; t++) {
        let n9 = x, n10 = x;
        while (n9 > 20 && actAt(n9, y) === 0 && isDW(wallAt(n9, y))) n9--;
        n9++;
        while (n10 < w - 20 && actAt(n10, y) === 0 && isDW(wallAt(n10, y))) n10++;
        n10--;
        x = Math.trunc((n9 + n10) / 2);
        let n11 = y, n12 = y;
        while (n11 > 20 && actAt(x, n11) === 0 && isDW(wallAt(x, n11))) n11--;
        n11++;
        while (n12 < h - 20 && actAt(x, n12) === 0 && isDW(wallAt(x, n12))) n12++;
        n12--;
        y = Math.trunc((n11 + n12) / 2);
      }
      let n9 = x, n10 = x;
      while (n9 > 20 && actAt(n9, y) === 0 && actAt(n9, y - 1) === 0 && actAt(n9, y + 1) === 0) n9--;
      n9++;
      while (n10 < w - 20 && actAt(n10, y) === 0 && actAt(n10, y - 1) === 0 && actAt(n10, y + 1) === 0) n10++;
      n10--;
      let n11 = y, n12 = y;
      while (n11 > 20 && actAt(x, n11) === 0 && actAt(x - 1, n11) === 0 && actAt(x + 1, n11) === 0) n11--;
      n11++;
      while (n12 < h - 20 && actAt(x, n12) === 0 && actAt(x - 1, n12) === 0 && actAt(x + 1, n12) === 0) n12++;
      n12--;
      x = Math.trunc((n9 + n10) / 2);
      y = Math.trunc((n11 + n12) / 2);
      const n13 = n10 - n9, n14 = n12 - n11;
      if ((typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DGPA_TRACE)) console.log(`A ${n13} ${n14} @${x},${y}`);
      if (WV65) WV65.push(`MARK|dg_paQ ${x},${y} n13=${n13} n14=${n14}`);
      if (n13 <= 7 || n14 <= 5) continue;
      const arr = [true, false, false];
      if (n13 > n14 * 3 && n13 > 21) arr[1] = true;
      if (n14 > n13 * 3 && n14 > 21) arr[2] = true;
      let n15 = rn(3);
      if (wallAt(x, y) === num2v) n15 = 0;
      while (!arr[n15]) n15 = rn(3);
      if (nearPicture2(st, x, y, wall)) n15 = -1;
      paEmit101(`MARK|paT|${i}|${x},${y}|${n13},${n14}|${n15}`);
      if ((typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DGPA_TRACE)) console.log(`N ${n15} np2=${n15 === -1}`);
      // ★D10（2026-08-14）：Paintings 段对齐原版调用序——GetPaintingEntry 的选型掷骰在
      // 门槛判定**之前**消耗（cs:167-168/:183-184/:281-283/:296-298），即使最终不放画也耗；
      // CanGenerateFeatureInArea 的 fluff=3（cs:169/186/281/297 等，7×7 区）非 2。
      const paTrace = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_DGPA_TRACE;
      if (paTrace && n15 >= 0) {
        // 拒因分解（仅诊断路径）：fa=CanGenerateFeatureInArea / np=nearPicture / pl=Place*Wall 返回值
        const fa = featArea3(x, y, 3), np = nearPicture(st, x, y);
        if (!fa || np) console.log(`RJ i${i} @${x},${y} n15=${n15} fa=${fa ? 1 : 0} np=${np ? 1 : 0}`);
      }
      if (n15 === 0) {
        const e = paintingEntry(x, y);
        if (featArea3(x, y, 3) && !nearPicture(st, x, y)) {
          if (!placePaintingD(x, y, e.tile, e.style) && paTrace) console.log(`PF i${i} place fail @${x},${y} t=${e.tile} s=${e.style}`);
        } else if (paTrace && n15 >= 0) console.log(`E1 i${i} miss @${x},${y}`);
      } else if (n15 === 1) {
        let e = paintingEntry(x, y);
        if (!featArea3(x, y, 3)) continue;
        if (actAt(x, y) === 0) placePaintingD(x, y, e.tile, e.style);
        if (actAt(x, y) !== 0) continue;
        // ★#32 终清批 III：攀爬起点**链式**（vanilla num21 :198/:221——第 m 轮从上轮
        //   中心起爬，非每轮从 baseY 起）；num21 在两轮间无条件更新、向后循环前重置
        //   num7（:221）。此前恒 baseY → 第 2 轮中心错 → featArea3/paintingEntry 掷差。
        const baseY = y;
        let nyPrev = baseY;
        for (let m = 0; m < 2; m++) {
          x += 7;
          let a1 = nyPrev, a2 = nyPrev;
          while (a1 > 0 && actAt(x, a1) === 0 && actAt(x - 1, a1) === 0 && actAt(x + 1, a1) === 0) a1--;
          a1++;
          while (a2 < h - 1 && actAt(x, a2) === 0 && actAt(x - 1, a2) === 0 && actAt(x + 1, a2) === 0) a2++;
          a2--;
          const ny = Math.trunc((a1 + a2) / 2);
          nyPrev = ny;
          if (featArea3(x, ny, 3)) {
            e = paintingEntry(x, ny);
            if (Math.abs(baseY - ny) >= 4 || nearPicture(st, x, ny)) break;
            placePaintingD(x, ny, e.tile, e.style);
          }
        }
        nyPrev = baseY;
        for (let m = 0; m < 2; m++) {
          x -= 7;
          let a1 = nyPrev, a2 = nyPrev;
          while (a1 > 0 && actAt(x, a1) === 0 && actAt(x - 1, a1) === 0 && actAt(x + 1, a1) === 0) a1--;
          a1++;
          while (a2 < h - 1 && actAt(x, a2) === 0 && actAt(x - 1, a2) === 0 && actAt(x + 1, a2) === 0) a2++;
          a2--;
          const ny = Math.trunc((a1 + a2) / 2);
          nyPrev = ny;
          if (featArea3(x, ny, 3)) {
            e = paintingEntry(x, ny);
            if (Math.abs(baseY - ny) >= 4 || nearPicture(st, x, ny)) break;
            placePaintingD(x, ny, e.tile, e.style);
          }
        }
      } else if (n15 === 2) {
        let e = paintingEntry(x, y);
        if (!featArea3(x, y, 3)) continue;
        if (actAt(x, y) === 0) placePaintingD(x, y, e.tile, e.style);
        if (actAt(x, y) !== 0) continue;
        const baseX = x;
        let nxPrev = baseX;                              // num16 链式（:265-291 同款）
        for (let m = 0; m < 3; m++) {
          y += 7;
          let a1 = nxPrev, a2 = nxPrev;
          while (a1 > 0 && actAt(a1, y) === 0 && actAt(a1, y - 1) === 0 && actAt(a1, y + 1) === 0) a1--;
          a1++;
          while (a2 < w - 1 && actAt(a2, y) === 0 && actAt(a2, y - 1) === 0 && actAt(a2, y + 1) === 0) a2++;
          a2--;
          const nx = Math.trunc((a1 + a2) / 2);
          nxPrev = nx;
          if (featArea3(nx, y, 3)) {
            e = paintingEntry(nx, y);
            if (Math.abs(baseX - nx) >= 4 || nearPicture(st, nx, y)) break;
            placePaintingD(nx, y, e.tile, e.style);
          }
        }
        nxPrev = baseX;
        for (let m = 0; m < 3; m++) {
          y -= 7;
          let a1 = nxPrev, a2 = nxPrev;
          while (a1 > 0 && actAt(a1, y) === 0 && actAt(a1, y - 1) === 0 && actAt(a1, y + 1) === 0) a1--;
          a1++;
          while (a2 < w - 1 && actAt(a2, y) === 0 && actAt(a2, y - 1) === 0 && actAt(a2, y + 1) === 0) a2++;
          a2--;
          const nx = Math.trunc((a1 + a2) / 2);
          nxPrev = nx;
          if (featArea3(nx, y, 3)) {
            e = paintingEntry(nx, y);
            if (Math.abs(baseX - nx) >= 4 || nearPicture(st, nx, y)) break;
            placePaintingD(nx, y, e.tile, e.style);
          }
        }
      }
    }
  }
  const featArea3 = (x: number, y: number, fluff: number): boolean => {
    for (let a = x - fluff; a <= x + fluff; a++) {
      for (let b = y - fluff; b <= y + fluff; b++) {
        if (!featOK(a, b, 2) || entNoFeat(a, b)) return false;   // Paintings 入口盒拒（Dome/Tower 覆写）
      }
    }
    return true;
  };
  /** Paintings_GetPaintingEntry（DungeonGlobalPaintings.cs:327-360）：只取 tile 型
   * （style 走帧不入哈希——但选型掷骰必须照原版序全部消耗）。★PPPPP 批起 style
   * 随 tile 一并返回（Place*Wall 帧步进消费者；掷序不变零扰流）。 */
  function paintingEntry(x: number, y: number): { tile: number; style: number } {
    if ((typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DGPA_TRACE)) console.log(`E ${x} ${y} wall=${wallAt(x, y)} rolls=${dgMainRolls}`);
    let tile = HANGING;
    let style = 0;
    if (wallAt(x, y) === wall) {
      // RandomDungeonPainting（:364-385）：Next(3)≤1→240 Next(7)(==6 重掷)style{12,13,14,15,18,19,23}；
      // 否则 242 Next(17) style(14→15/15→16/16→30)
      const n = rn(3);
      if (n <= 1) {
        let n2 = rn(7);
        if (n2 === 6) n2 = rn(7);
        style = [12, 13, 14, 15, 18, 19, 23][n2]!;
      } else {
        tile = PAINTING;
        const n2 = rn(17);
        style = n2 === 14 ? 15 : n2 === 15 ? 16 : n2 === 16 ? 30 : n2;
      }
    } else {
      // RandomBonePainting（:387-410）：Next(2)→0:240 style Next(2)(16/17)；1:241 style Next(9)
      const n = rn(2);
      if (n === 0) { tile = HANGING; style = 16 + rn(2); }
      else { tile = CATACOMB; style = rn(9); }
    }
    return { tile, style };
  }
  // ============ DungeonGlobalBanners（:24-104）============
  function dgBanners(): void {
    const num3 = Math.trunc(200 * (w / 4200) * Math.max(1, 0.75));
    // ★IIIII65 对账仪：与 rig JJHook.Mark(dg_ba*) 同位同 tag（__swWvLog 门控零开销）
    const WV65b = (globalThis as { __wvLines?: string[] }).__wvLines;
    if (WV65b) WV65b.push(`MARK|dg_ba0 n3=${num3} L=${bounds.L} R=${bounds.R} T=${bounds.T} B=${bounds.B}`);
    // ★IIIII72 实验室快照钩（__swDgLab 由探针注入；生产恒 undefined 零开销）：
    //   Ba 相位起点的区域全通道真值 + 受理门结构（pits/winBoxes/entBounds/variants/styles）
    const LAB72 = (globalThis as {
      __swDgLab?: { dump?: (ctx: unknown) => void };
    }).__swDgLab;
    if (LAB72?.dump) LAB72.dump({ st, bounds, pits, winBoxes, entExists, entBounds, wallVariants, bannerStyles });
    // ★IIIII98c：Banners 候选重掷仪（与 rig BANHD/BANRET 同位同 tag；只读零行为差）
    const I110b = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I110_MARK;
    const emit110b = (ln: string): void => { if (I110b) ((globalThis as { __wvLines?: string[] }).__wvLines ??= []).push(ln); };
    for (let i = 0; i < num3; i++) {
      emit110b(`MARK|BANHD i=${i}`);
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(bounds.T, bounds.B - 1);
      if (WV65b && i < 12) WV65b.push(`MARK|dg_baT i=${i} ${x},${y}`);
      let n6 = 1000;
      let rr = 0;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n6--;
        if (n6 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(bounds.T, bounds.B - 1);
        rr++;
        emit110b(`MARK|BANRET i=${i} ${x},${y} w=${wallAt(x, y)} a=${actAt(x, y) !== 0 ? 1 : 0}`);
      }
      const sxB = x, syB = y, rrB = rr, exB = n6 <= 0 ? 1 : 0;
      n6 = 1000;
      let dd = 0;
      // ★IIIII68 终刀（2026-08-30）：DungeonGlobalBanners.cs:47 的下降扫描用
      //   WorldGen.SolidTile(num4,num5)（WorldGen.cs:70650 全项版，含
      //   !halfBrick() && slope()==0 && !inActive()）——共享 dgSolid 缺坡位/半砖
      //   两判项，曾把坡帽檐下当实心停靠：x86 在 (3771,419) 域停到下一块平帽后
      //   锚点自身 active 静默拒置（零掷），JS 却挂上了横幅三格——单点受理差
      //   触发整支流 +1 掷漂移（115vs114 swap + 尾段两个级联伪对象）。修=
      //   本循环改用 dgSpreadSolid（IIIII65 已认证的全项版副本），仅此处换刀，
      //   不动共享 dgSolid（七链满绿由既有谓词认证）。
      while (!dgSpreadSolid(x, y) && y > 10) {
        n6--;
        if (n6 <= 0) break;
        y--;
        dd++;
      }
      y++;
      // ★IIIII72 细化仪（仅 __wvLines 挂钩时输出，零行为差）：每轮受理面全量快照。
      //   定罪 IIII68 残差三案 (3771,419)/(3490,778)/(3430,852) 的 big-if 谓词域。
      if (WV65b && ((__swProcessEnv ?? {}).SW_I99_ALLBA === '1' || i < 14 || i >= num3 - 8)) {   // ★IIIII99 诊断全量窗
        let dr = 0;
        for (let a2 = x - 1; a2 <= x + 1; a2++) {
          for (let b2 = y; b2 <= y + 3; b2++) {
            if (inW(a2, b2, 0) && actAt(a2, b2) !== 0
              && (typAt(a2, b2) === DOOR || typAt(a2, b2) === TILE_BY_KEY['door_open'] || typAt(a2, b2) === BANNER)) dr = 1;
          }
        }
        const mc99 = (globalThis as { __swRollN?: number }).__swRollN;
        WV65b.push(`MARK|dg_bz i=${i} acc=${sxB},${syB} rr=${rrB} ex=${exB} an=${x},${y} drop=${dd}`
          + ` wl=${wallAt(x, y)} upT=${typAt(x, y - 1)}`
          + ` f=${actAt(x, y)}${actAt(x, y + 1)}${actAt(x, y + 2)}${actAt(x, y + 3)}`
          + ` ok=${featOK(x, y, 0) ? 1 : 0}${isDW(wallAt(x, y)) ? 1 : 0} spk=${typAt(x, y - 1) === SPIKE ? 1 : 0} dr=${dr}`
          + (mc99 !== undefined ? ` mc=${mc99}` : ''));   // ★IIIII99 主实例累计样本镜像
      }
      if (!featOK(x, y, 0) || !isDW(wallAt(x, y))
        || typAt(x, y - 1) === SPIKE
        || actAt(x, y) !== 0
        || actAt(x, y + 1) !== 0
        || actAt(x, y + 2) !== 0
        || actAt(x, y + 3) !== 0) continue;
      let near = false;
      for (let a = x - 1; a <= x + 1; a++) {
        for (let b = y; b <= y + 3; b++) {
          if (inW(a, b, 0) && actAt(a, b) !== 0
            && (typAt(a, b) === DOOR || typAt(a, b) === TILE_BY_KEY['door_open'] || typAt(a, b) === BANNER)) near = true;
        }
      }
      if (near) continue;
      let num8 = 0;
      if (wallAt(x, y) === wallVariants[1]) num8 = 1;
      if (wallAt(x, y) === wallVariants[2]) num8 = 2;
      num8 = num8 * 2 + rn(2);
      // ★横幅 key 是 v_91_banners 非 'banner'（tiles.ts:258）——曾 TILE_BY_KEY['banner']
      //  =undefined:近旁横幅排除恒假（横幅贴横幅照放）+ placeSimple 写 type=undefined
      //  （tile<0 拦下=横幅全部静默丢弃，JS 轨迹 134 vs oracle 129 的根因）。
      //  双侧逐样本轨迹对账实锤（N 426,570 typ=91，2026-08-15）
      // ★NNN 批 ②（2026-08-18）：style 经 bannerStyles[num8] 入帧（DungeonGlobal-
      //  Banners.cs:95 `num7 = data.bannerStyles[num8]`；查表零掷不扰流）
      if (WV65b) WV65b.push(`MARK|dg_baP ${x},${y} t=${BANNER} s=${bannerStyles[num8]}`);
      const baOk = placeBannerD(x, y, BANNER, bannerStyles[num8]);
      // ★IIIII92 改型：vanilla PlaceTile case91（cs:60615-60618）PlaceBanner 后
      //   **无条件** SquareTileFrame(i,j)——成败同走；环=TileFrame(i±1,j-1..j+1)
      //   列主序九格，环内活性吊灯(34)格各自 CheckChand 全句复验（v2 页式帧重构
      //   版，见 sqTfLightsRing/dgCheckChand 注）。IIIII87 的 ±2×[-4,+5] 近扫
      //   validateLightsNearby 版废弃（几何越界+无页帧判据=批内 replay 残差不动）。
      //   （baOk 仅存档诊断面；原版 case91 不读 PlaceBanner 结果）
      void baOk;
      sqTfLightsRing(x, y);
    }
    // ★IIIII72 收尾标记（实验室重放锚点；__wvLines 门控）
    const WV72e = (globalThis as { __wvLines?: string[] }).__wvLines;
    if (WV72e) WV72e.push(`MARK|dg_baDone n3=${num3}`);
  }
  // ============ DungeonGlobalLateDualDungeonFeatures（:20-69，Default style==0 支）============
  // ★HHHHHHH（2026-08-24）⑤ Late GOTHIC 门替换：1456 该段普通世界纯空转（style==0
  //   扫描域内无 GOTHIC 变体墙语义），1457 扫 outerProgressionBounds[0]（Legacy
  //   provider :97 布局尾改写 =dungeonBounds）内门底格（活性 tile10 且下格非 10，
  //   :57-60）墙∈[94,105] → KillTile+PlaceTile(10,mute,forced:false,-1,53)（:64-65）。
  //   掷流=每门 PlaceDoor 3×Next(3)（败 0 掷）；KillTile→SquareTileFrame 级联
  //   CheckDoorClosed（WorldGen.cs:87714：门三格任一失活/上下非实心→destroyObject
  //   整列 KillTile）→PlaceTile case A（:60360 上两格净空+上三格实心）重挂同位。
  //   9293480 实测命中 22 门 +66 掷（GGG 三方 ONLY-oracle ⑤ 级联主体）。
  function dgLate(): void {
    if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(`MARK|LATE BEGIN|mc=${dgMainRolls}`);
    for (let x = bounds.L; x <= bounds.R; x++) {
      for (let y = bounds.T; y <= bounds.B; y++) {
        if (!inW(x, y, 1)) continue;
        const ti = st.idx(x, y);
        if (st.flags[ti] === 0 || st.type[ti] !== DOOR) continue;
        const bi = st.idx(x, y + 1);
        if (st.flags[bi] !== 0 && st.type[bi] === DOOR) continue;   // 下格仍门=非底格
        const wl = st.wall[ti];
        if (wl < 94 || wl > 105) continue;
        // KillTile(x,y)（:64）尾段语义（WorldGen.cs:4441-4447）：active=false、
        //   halfBrick=false、frameX/Y=-1、type=0——随后 SquareTileFrame 级联把
        //   门三格整列灭（此处直写终态,级联无掷无额外写）
        for (let k = -2; k <= 0; k++) {
          const di = st.idx(x, y + k);
          if (st.flags[di] !== 0 && st.type[di] === DOOR) {
            st.flags[di] = 0; st.type[di] = 0; st.half[di] = 0;
            st.frameX[di] = -1; st.frameY[di] = -1;
          }
        }
        // PlaceTile(x,y,10,mute,forced:false,-1,53)（:65）——dgPlaceDoor=PlaceTile(10)
        //   case A/B 谓词+PlaceDoor 3×Next(3)+帧写 1:1（败支 0 掷同构）
        if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(`MARK|GDOOR|${x},${y}|mc=${dgMainRolls}`);
        dgPlaceDoor(x, y, 53);
      }
    }
    if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(`MARK|LATE END|mc=${dgMainRolls}`);
  }
  posX = x0; posY = y0;
  bounds.set(x0, y0, x0, y0);
  const isDW = (v: number): boolean => v > 0 && DG_DUNGEON_WALLS.has(v);   // 墙 id 即原版 id
  const isDT = (t: number): boolean => {
    const sh = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    return sh > 0 && DG_DUNGEON_TILES.has(sh);
  };
  const inW = (x: number, y: number, fluff: number): boolean =>
    x >= fluff && x < w - fluff && y >= fluff && y < h - fluff;
  const wallAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0);
  const actAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.flags[st.idx(x, y)] : 0);
  const typAt = (x: number, y: number): number => (st.inBounds(x, y) ? st.type[st.idx(x, y)] : 0);
  {
    const WV61b = typeof globalThis !== 'undefined' ? (globalThis as { __swWvLog?: unknown }).__swWvLog : undefined;
    if (WV61b) ((globalThis as { __wvLines?: string[] }).__wvLines ??= []).push(`MARK|d61layoutStart|rc=${dgMainRolls}`);
  }
  // ★IIIII92 双地牢布局域分流：provider 全家族（rooms/halls/计分连路/换皮表）。
  //   ★IIIII93b：本座旗 isDualWorld=b.isDual;opts.k=instIdx——dualSnakes[k]/样式表/
  //   界域/genvars 全按座分流（DC.cs:14849 循环第 k 次迭代 = MakeDungeon(CurrentDungeon=k)）。
  //   蛇槽缓存缺失（或非 dual 链）一律落回 legacy 布局——普通世界零扰动口径。
  if (isDualWorld) {
    const res = runDualDungeonLayout({
      st, gs, rng, w, h, ws, rock,
      undergroundLayer: h - 200,
      ri, rn, rd, raw,
      jsBoundUpd: (a, b, c, d) => bounds.upd(a, b, c ?? a, d ?? b),
      roomSink: (rmv) => {
        const view: DRoom = {
          seed: 0, x: rmv.x, y: rmv.y, start: false, generated: true,
          inner: new DBnd(w, h), outer: new DBnd(w, h),
          ex: rmv.ex, ey: rmv.ey, strength: rmv.strength,
        };
        view.inner.set(rmv.innerL, rmv.innerT, rmv.innerR, rmv.innerB);
        view.outer.set(Math.max(10, rmv.innerL - 8), Math.max(10, rmv.innerT - 8), Math.min(w - 10, rmv.innerR + 8), Math.min(h - 10, rmv.innerB + 8));
        rooms.push(view);
      },
      platSink: (pl) => platData.push({ x: pl.x, y: pl.y, hall: false, hf: pl.hf || 5, force: !!pl.force }),
      snap,
    }, { x0, y0, precalcOK, entX, entY, worldSize: 1, k: instIdx });
    posX = Math.trunc(res.posX); posY = Math.trunc(res.posY); topX = posX;
  } else {
    dgLayout(num);
  }
  {
    const WV61c = typeof globalThis !== 'undefined' ? (globalThis as { __swWvLog?: unknown }).__swWvLog : undefined;
    if (WV61c) ((globalThis as { __wvLines?: string[] }).__wvLines ??= []).push(`MARK|d61layoutEnd|rc=${dgMainRolls}`);
  }
  if (!isDualWorld) {
  // cs:374-396：最高已生成房 InnerBounds 顶部中心回写（dual 支跳过——Provider 已按
  // dungeonRooms[0].InnerBounds 直接定位，DC.cs:391-413 分型语义）
    const ib = rooms[0].inner;
    let bx = (ib.L + ib.R) / 2, by = ib.T;
    for (let i = 1; i < rooms.length; i++) {
      if (!rooms[i].generated) continue;
      const b2 = rooms[i].inner;
      const cx = (b2.L + b2.R) / 2, cy = b2.T;
      if (cy < by) { bx = cx; by = cy; }
    }
    posX = Math.trunc(bx); posY = Math.trunc(by); topX = Math.trunc(bx);
  }
  snap('dungeonL');
  // —— 爬升入口大厅（cs:398-449）——★XX 批（2026-08-18）precalc 支：
  //   MakeDungeon :418-420 dungeonEntrancePosition!=Zero（=precalc 成功）时改走
  //   MakeDungeon_GenerateNextEntranceHall_Precalculated（DC.cs:558-585）：dist=爬升
  //   起点到入口的全程距离（循环外一次定格）、amountPassed=(int)dist 递减 Next(10,30)
  //   （超余量钳 max(1,(int)dist-amountPassed)）、目标=Lerp(currentPos,entrance,
  //   amountPassed/dist)、每厅 2 掷（步数+种子）；amountPassed<=0 → 出地表门。
  //   currentPos 是**上一厅的 lerp 目标**（非实际走终点—— halls 链由目标点接力，
  //   与 genVars 终值解耦，原版如此）。Legacy 支照旧盲爬。
  dgpMark("hallway_surface_start");
  entOnSurface = false;
  // ★IIIII21（DungeonCrawler.cs:404-409）：drunk(noSurface 同支)=
  //   createdDungeonEntranceOnSurface 恒 true——爬升入口走廊 while 循环**零迭代**
  //   （含 roomDelay Next(5) 内嵌掷），入口直接在最高房中心生成。
  if (gs.seedFlags.drunkWorld) entOnSurface = true;
  {
    const TT = (globalThis as { __dgTowerTrace?: Record<string, number | string> }).__dgTowerTrace;
    let curX = posX + 0.0, curY = posY + 0.0;               // currentPos（局部，不随 genVars）
    const dist = precalcOK ? Math.hypot(entX - curX, entY - curY) : 0.0;   // Vector2D.Distance
    let amountPassed = Math.trunc(dist);
    let roomDelay = 5, guard = 100;
    if (TT) { TT.dist = dist; TT.entX = entX; TT.entY = entY; TT.climb0 = dgMainRolls; TT.inserts = 0; TT.halls = 0; }
    dgpMark("climb0");
    while (!entOnSurface) {
      guard--;
      if (guard <= 0) break;
      if (roomDelay > 0) roomDelay--;
      if (roomDelay === 0 && rn(5) === 0 && posY > ws + 100) {
        roomDelay = 10;
        const sx = posX, sy = posY;
        dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
        dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
        posX = sx; posY = sy;
        if (TT) TT.inserts = (TT.inserts as number) + 1;
      }
      if (precalcOK) {
        let nsteps = ri(10, 29);                            // genRand.Next(10,30)
        if (nsteps > dist - amountPassed) nsteps = Math.max(1, Math.trunc(dist) - amountPassed);
        const t = dist > 0 ? amountPassed / dist : 0;
        const tgX = curX + (entX - curX) * t;               // Vector2D.Lerp
        const tgY = curY + (entY - curY) * t;
        dgEntHallPrecalc(raw(), curX, curY, tgX, tgY);
        amountPassed -= nsteps;
        curX = tgX; curY = tgY;
        if (TT) { TT.halls = (TT.halls as number) + 1; TT['ns' + TT.halls] = nsteps; TT['ap' + TT.halls] = amountPassed; }
        if (amountPassed <= 0) entOnSurface = true;
      } else {
        dgEntHall(raw());
      }
    }
    if (TT) TT.climb1 = dgMainRolls;
    dgpMark("climb1");
    dgpMark("preent");
  }
  // MakeDungeon_GetEntrance（:450）——Tower=TowerDungeonEntrance（XX 批 1:1 转录）；
  // Dome=DomeDungeonEntrance（FFFF 批 2026-08-18 1:1 转录——XX 批备案的"Legacy 近似
  // 体"已退役；AAAA 批的 Dome 锚补丁同步本体化进 dgDomeEntrance 尾部）。
  // GetEntranceSettings 的 1 颗废弃掷在两支同位（settings.RandomSeed=Next() 后被
  // preSettings.RandomSeed 覆写）——tower/dome 支先 raw() 再传 entSeed。
  if (entKind === 2) { raw(); dgTowerEntrance(posX, posY, entSeed); }
  else if (entKind === 1) { raw(); dgDomeEntrance(posX, posY, entSeed); }
  else dgEntrance(raw(), entSeed);
  dgpMark("entdone");
  // ★IIIII80（2026-08-30，DungeonCrawler.cs:467-470）：surfaceIsInSpace →
  //   入口生成后 dungeonBounds.Top=25（Clamp[10,h-10] 同 DBnd.topSet）——房间
  //   Processing/平台门刷与装饰的上下文界面向天空扩展。仅 sgis 世界改值。
  if (gs.seedFlags.surfaceIsInSpace) bounds.topSet(25);
  snap('dungeonE');
  for (const rm of rooms) if (rm.generated) roomPlatformsDoors(rm);
  for (const hl of halls) if (hl.generated) hallPlatformsDoors(hl);
  snap('dungeonPD');
  dgpMark('finding_doors_end');
  // ★IIIII59 EarlyDual 家族调用面壳（DungeonGlobalEarlyDualDungeonFeatures.EarlyDungeonFeatures
  //   的 DropTrap/TileClump 段落占位，cs:287/:314/:341 与 cs:395-589）。可达域由
  //   【房间 style 字典 {3 Desert,2 Snow,1 Cavern}】与【dungeonGenerationStyles 内
  //   Style∈{3,2} 条目】唯一决定——单地牢世界（现八链全部）：字典键恒 {0}（房间样式
  //   恒 style0）、样式表恒 [style0] ⇒ 下面两段门恒假、零进入、零主流掷骰（与原版
  //   同构：ContainsKey false→while 不启；styles 迭代 continue 在任何 Next 之前）。
  //   函数本体已在 src/world/gen/vanilla/DungeonEarlyFeatures.ts 全量落地（dropTrap/
  //   tileClump），dualDungeons 链激活时在守卫内展开实参即可——禁止绕过本守卫直呼。
  const d61RoomStyleKeys: ReadonlySet<number> = new Set();            // 单地牢={}
  const d61StylesList: ReadonlyArray<{ style: number }> = [{ style: 0 }]; // [style0]
  if (d61RoomStyleKeys.has(3) || d61RoomStyleKeys.has(2) || d61RoomStyleKeys.has(1)) {
    // dual-only：按 cs 样式表逐房抽样下扫 + Next(2) 选 Lava/Sand 后调 deDropTrap(ctx,...)
    void deDropTrap;
    void deTileClump;
  }
  for (const d61s of d61StylesList) {
    if ((d61s.style === 3 || d61s.style === 2)) {
      // dual-only：style3=×num7,num7,num7*2（53/397/404 沙族）；style2=×num8,num8（147/224 雪族）
      void deTileClump;
    }
  }
  // ★IIIII98c：阶段级靶窗状态仪（SW_I110_STAGE="x0,x1,y0,y1" 只读；诊断后可移除）
  const I110STG = typeof process !== 'undefined' ? (__swProcessEnv ?? {}).SW_I110_STAGE : undefined;
  const stageDump = (tag: string): void => {
    if (!I110STG) return;
    const p = I110STG.split(',').map(Number);
    const rows: string[] = [];
    for (let y = p[2]; y <= p[3]; y++) for (let x = p[0]; x <= p[1]; x++) {
      if (!st.inBounds(x, y)) { rows.push(`${y},${x}:OOB`); continue; }
      const ti = st.idx(x, y);
      rows.push(`${y},${x}:w${st.wall[ti]}t${st.type[ti]}a${st.flags[ti] !== 0 ? 1 : 0}|`);
    }
    ((globalThis as { __wvLines?: string[] }).__wvLines ??= []).push(`MARK|STAGE ${tag} ${rows.join('')}`);
  };
  dgpMark('early_features_done');
  dgEarly();
  snap('dungeonPi');
  dgpMark('pit_loop_end');
  dgSpikes(); snap('dungeonS'); stageDump('S');
  dgDoorsF(); snap('dungeonD'); stageDump('D');
  dgWallVariants(); snap('dungeonW'); stageDump('W');
  if (dgTW) dgTW.plat1 = dgMainRolls;
  dgPlatforms(); snap('dungeonP'); stageDump('P');
  dgBiomeChests(); snap('dungeonC'); stageDump('C');
  dgBookshelves(); snap('dungeonB'); stageDump('B');
  dgBasicChests(); snap('dungeonG'); stageDump('G');
  bounds.inflate(25);
  dgLights(); snap('dungeonI'); stageDump('I');
  dgTraps(); snap('dungeonT'); stageDump('T');
  dgFurniture(); snap('dungeonF'); stageDump('F');
  dgPaintings(); snap('dungeonPa'); stageDump('Pa');
  dgBanners(); snap('dungeonBa'); stageDump('Ba');
  // ★HHHHHHH ⑤：DungeonGlobalLateDualDungeonFeatures（DungeonCrawler.cs:522-523,
  //   progress 0.99 DungeonLate）——Banners 之后、pass 收尾前
  dgLate(); snap('dungeonLate');
  snap('dungeon');
    return { posX, posY, dungeonX, dungeonY };
  }
  // —— GenState 回填（消费端：Pyramids 回避带 / 刷怪门槛 / 老头锚；仅 d0 视图）——
  // ★IIIII93b：dual 循环收尾 CurrentDungeon=0（cs:14932-14933），跨 pass 消费端
  //   （Pyramids cs:15462/Temple cs:16006/SetOldManSpawn DU.cs:1660 `CurrentDungeon==0`
  //   门）读的都是 **dungeon#0** genVars ⇒ 回填固定取 results[0]（曾单例=end 实例,
  //   双座化后会错拿 d1 爬升终点）。
  // ★2026-08-16 审计：generatingDungeonPositionX 的**终值**是爬升入口走廊的终点
  //   （每条 LegacyEntranceDungeonHall 收尾都回写 genVars，LegacyEntranceDungeonHall.cs:367-368；
  //   MakeDungeon:394 的最高房中心 X 是中途瞬态，随即被爬升覆写）。Dungeon pass(#36)
  //   先于 Pyramids(#44)/LihzahrdTemple(#50)，cs:15450/:15994 读到的就是爬升终点=入口 X。
  //   曾回填 topX（把瞬态当终值）→ 金字塔回避带整体平移数百格。
  {
    const r0 = dgResults[0]!;
    gs.generatingDungeonPositionX = r0.posX;
    gs.dungeonY = r0.dungeonY;
    gs.dungeonEntX = r0.dungeonX; gs.dungeonEntY = r0.dungeonY;
  }
  // ★PPPPP（2026-08-22）LavaLayerCaverer（cs:74003）：Dungeon pass 尾段（cs:14926-14929，
  //   dungeonData.Clear() 之后、pass 委托结束前）——饥荒世界岩浆层隧道。同 pass 内
  //   调用（无重播）,流位紧接两座 MakeDungeon 序之后（cs:14849 循环+Clear 后）,全 pass 恰一次。
  runLavaLayerCaverer(st, rng, gs);
}
export function placeFurn(st: TileStore, cx: number, anchorY: number, tile: number, style: number, anchor: 'bottom' | 'top' = 'bottom', flip = 1, support = true, styleRowH?: number, styleColW?: number): boolean {
  const def = TILE_DEFS[tile];
  if (!def) return false;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const x0 = cx - Math.floor(fw / 2);
  const yTop = anchor === 'bottom' ? anchorY - fh + 1 : anchorY;
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, yTop + dy) || st.flags[st.idx(x0 + dx, yTop + dy)]) return false;
    }
  }
  if (anchor === 'bottom' && support) {
    for (let dx = 0; dx < fw; dx++) {
      if (!st.inBounds(x0 + dx, yTop + fh) || !st.flags[st.idx(x0 + dx, yTop + fh)]
        || !TILE_DEFS[st.type[st.idx(x0 + dx, yTop + fh)]]?.solid) return false;
    }
  }
  const sheet = TILE_DEFS[tile]?.vanilla?.sheet ?? -1;
  // 权威布局表(FurnitureStyle.ts,TileObjectData+贴图实测):表内 sheet 直接用,
  // 表外尊重调用参数(竖排 styleRowH / 横排列步 styleColW),最终回退通用横排。
  // 15/139/187 曾漏登记→椅子全落通用横排回退而实为竖排(神庙木椅 2026-08-12),
  // 已补全与 FurnitureStyle.ts 覆盖面同步
  const inTable = [42, 33, 49, 34, 100, 93, 91, 240, 241, 242, 245, 246, 15, 139, 187, 79, 90].includes(sheet);
  let bx: number, by: number;
  if (inTable) [bx, by] = furnitureStyleBase(sheet, style, fw);
  else if (styleRowH !== undefined) { bx = 0; by = style * styleRowH; }
  else { bx = style * (styleColW ?? fw * 18); by = 0; }
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      const fx = flip < 0 ? fw - 1 - dx : dx;
      st.setTileSilent(x0 + dx, yTop + dy, tile, bx + fx * 18, by + dy * 18);
      // PlaceTile 前奏清坡（WorldGen.cs:59499-59501 !active → Clear(Slope)）；目标格
      // 已全量校验 inactive（见上）——EE 批清坡收口（X 批 Temple 同族）
      const ci = st.idx(x0 + dx, yTop + dy);
      st.slope[ci] = 0; st.half[ci] = 0;
    }
  }
  return true;
}

/** 家具水平镜像(帧 X 翻转:桌椅等 1-3 宽物件整体 +18*fw) */
export function flipFurn(st: TileStore, cx: number, floorY: number, tile: number): void {
  const def = TILE_DEFS[tile];
  if (!def) return;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const x0 = cx - Math.floor(fw / 2);
  const yTop = floorY - fh + 1;
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, yTop + dy)) continue;
      const i = st.idx(x0 + dx, yTop + dy);
      if (st.type[i] === tile) st.frameX[i] += fw * 18;
    }
  }
}

/** 墙饰(画/骨/挂毯):顶行=topY,锚点左上;须净空 */
function placeWallArt(st: TileStore, x: number, y: number, tile: number, style: number): void {
  const def = TILE_DEFS[tile];
  if (!def) return;
  const fw = def.vanilla?.fw ?? def.w ?? 1;
  const fh = def.vanilla?.fh ?? def.h ?? 1;
  const sheet = def.vanilla?.sheet ?? -1;
  const x0 = x - Math.floor(fw / 2);
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      if (!st.inBounds(x0 + dx, y + dy) || st.flags[st.idx(x0 + dx, y + dy)]) return;
    }
  }
  // 样式基偏移(TileObjectData + Tiles_N.png 尺寸实测):
  //  240(1944×162):横排 36 列×54,wrap36 → 超 36 换下行 54
  //  241(4×3):竖排行 54(wrap0 单列)
  //  242(324×1944):竖排 27 行×72,wrap27 → 超 27 换右列 108
  let bx: number, by: number;
  if (sheet === 240) { bx = (style % 36) * 54; by = Math.floor(style / 36) * 54; }
  else if (sheet === 241) { bx = 0; by = style * 54; }
  else if (sheet === 242) { bx = Math.floor(style / 27) * 108; by = (style % 27) * 72; }
  else { bx = style * fw * 18; by = 0; }
  for (let dx = 0; dx < fw; dx++) {
    for (let dy = 0; dy < fh; dy++) {
      st.setTileSilent(x0 + dx, y + dy, tile, bx + dx * 18, by + dy * 18);
      const ci = st.idx(x0 + dx, y + dy);
      st.slope[ci] = 0; st.half[ci] = 0;   // PlaceTile 前奏清坡（目标格已验 inactive）
    }
  }
}

/** nearPicture(cs L17966):±4×±3 有任意实心 */
function nearPicture(st: TileStore, x: number, y: number): boolean {
  for (let dx = -4; dx <= 3; dx++) {
    for (let dy = -3; dy <= 2; dy++) {
      if (st.inBounds(x + dx, y + dy) && st.flags[st.idx(x + dx, y + dy)]) return true;
    }
  }
  return false;
}

/** nearPicture2(cs L17979):±15/±10(主墙)或 ±8/±5(变体墙)内已有墙饰 */
function nearPicture2(st: TileStore, x: number, y: number, mainWall: number): boolean {
  const wall = st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0;
  // ★#32 终清批 III：±15 大盒判据=wall∈{7,8,9} 三主墙**集合**（cs:34719-34725），
  //   非"等于本局主墙"——wall 7/8 样本盒被缩到 ±8 → 漏检邻画 → 多耗选型掷（Pa +15）。
  const big = wall === 7 || wall === 8 || wall === 9;
  const rx = big ? 15 : 8;
  const ry = big ? 10 : 5;
  for (let dx = -rx; dx <= rx; dx++) {
    for (let dy = -ry; dy <= ry; dy++) {
      if (!st.inBounds(x + dx, y + dy) || !st.flags[st.idx(x + dx, y + dy)]) continue;
      const t = st.type[st.idx(x + dx, y + dy)];
      if (t === HANGING || t === CATACOMB || t === PAINTING) return true;
    }
  }
  return false;
}

/**
 * 灯具→墙上开关 + 红线布线(cs L18942-18975/18990-19023):
 * 在灯具 ±12/+3..20 内找两侧皆砖的嵌墙位放开关(136),沿曼哈顿路径铺红线。
 * chandelier=true 时开关位禁邻尖刺(原版两分支条件差异)。
function canHit(st: TileStore, x1: number, y1: number, x2: number, y2: number): boolean {
  const w = st.w, h = st.h;
  let num = x1, num2 = y1;
  const num3 = Math.max(1, Math.min(w - 1, x2));
  const num4 = Math.max(1, Math.min(h - 40, y2));
  num = Math.max(1, Math.min(w - 1, num));
  num2 = Math.max(1, Math.min(h - 40, num2));
  const fullBrick = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    if (!st.flags[k]) return false;
    const d = TILE_DEFS[st.type[k]];
    return !!d?.solid && !d.platform && st.slope[k] === 0 && !st.half[k];
  };
  for (;;) {
    if (num === num3 && num2 === num4) return true;
    const dAbs = Math.abs(num - num3), dOrd = Math.abs(num2 - num4);
    if (dAbs > dOrd) {
      num += num >= num3 ? -1 : 1;
      if (fullBrick(num, num2 - 1) && fullBrick(num, num2 + 1)) return false;
    } else {
      num2 += num2 >= num4 ? -1 : 1;
      if (fullBrick(num - 1, num2) && fullBrick(num + 1, num2)) return false;
    }
    // do-while 条件：落点格"非活性 / 非实心 / 平台"才继续步进；实心非平台 → 穿墙阻挡
    const k = st.idx(num, num2);
    const d = TILE_DEFS[st.type[k]];
    const passable = !st.flags[k] || !d?.solid || !!d.platform;
    if (!passable) return false;
    if (num < 1 || num >= w - 1 || num2 < 1 || num2 >= h - 40) return false;
  }
}

/** AddBuriedChest（1456 cs:35920）下落段 1:1：自 y 向下扫至 h-10，
 *  首个 SolidTile（半砖/坡面不算）落定；±2 邻域有 Boulders/26/237 → 失败。
 *  样式/主件由调用方显式给定（地牢战利品序），2×2 箱落其上后推入 chests */
/** 内部物品 id → 原版 id（ITEM_DEFS 反查 vid 字段；非 vi_ 返回 0） */
function vidOfInternal(internalId: number): number {
  const d = ITEM_DEFS[internalId];
  if (!d) return 0;
  if (d.vid != null) return d.vid;
  const m = /^vi_(\d+)_/.exec(d.key);
  return m ? parseInt(m[1], 10) : 0;
}

