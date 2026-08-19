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
const DG_FRAMED_ALL = new Set<number>([
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
const DG_BREAK_PLACE = new Set([324, 186, 187, 185, 165, 530, 233, 227, 485, 81, 624]);
const DG_CHEST_ANCH_INVALID = new Set([127, 138, 664, 665, 484, 711, 712, 713, 714, 715, 716]);
const DG_PLATFORMS = new Set([19, 427, 435, 436, 437, 438, 439]);
const DG_NO_ATTACH = new Set([3, 4, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 27, 50, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102, 110, 114, 134, 387, 388, 390, 427, 435, 436, 437, 438, 439, 441, 467, 468, 469, 486, 487, 488, 489, 490, 497, 507, 564, 565, 568, 569, 570, 572, 580, 590, 593, 594, 595, 615, 620, 704, 707]);
const DG_TILE_TABLE = new Set([14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 281, 285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
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
// ★BBBBB（2026-08-19）：Item.cs TryGetPrefixStatMultipliersForItem（:691-1080）对
//   Legendary 族 81-89 直接 return false → Prefix(-1) 的 while(flag) 重掷链（:546）。
//   值依赖四门（Round(damage*dmg)==damage 等）对地牢箱族 item 常量恒不触发
//   （damage≥24/useAnimation≥15/mana∈{7,14}/knockBack 全非 0——四门全空转，备案），
//   唯此结构集生效。
const DG_PRE_NOSTAT = new Set([81, 82, 83, 84, 85, 86, 87, 88, 89]);
const DG_PRE_CLASS: Record<number, string> = {
  155: 'swords', 156: 'acc', 157: 'magic', 163: 'spears', 113: 'magic', 3317: 'boom',
  164: 'guns', 1156: 'guns', 1571: 'boom', 1569: 'boom', 1260: 'magic', 1572: 'summon',
  4607: 'summon', 5465: 'acc',
  // ★BBBBB：327 水靴（地牢"水覆写箱" num2<ws+50 → itemType=327）——accessory=true
  //   且 CanGetPrefixes 默认 true（ItemID.cs:175 CreateBoolSet(true,…) 列外）→ 可前缀，
  //   Next(4)+Next(19) 两掷。曾漏登 → 该箱掷流 -2 连坐 G/F/Pa/Ba 全段。
  327: 'acc',
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

/** #32 Dungeon pass（1456 1:1，与 caves-oracle.cs 同构）。snap 回调用于逐段检查点。 */
export function runDungeonPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, snap: SnapFn = () => {},
): void {
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
  const theme = gs.dungeonTheme >= 0 ? gs.dungeonTheme : ri(0, 2);
  const brick = theme === 0 ? BLUE : theme === 1 ? GREEN : PINK;
  const wall = theme === 0 ? 7 : theme === 1 ? 8 : 9;
  const crack = CRACKED_FOR_BRICK[brick] ?? brick;
  const wallVariants: number[] = wall === 8 ? [8, 98, 99] : wall === 9 ? [9, 96, 97] : [7, 94, 95];
  // outerPotentialDungeonBounds（CreatePotentialDungeonBounds，DungeonUtils.cs:2058）
  const potTp = (ws + 10.0) / h, potBt = ((h - 200) - 10.0) / h;
  const potL = gs.dungeonSide > 0 ? Math.trunc(w * 0.525) : Math.trunc(w * 0.05);
  const potR = gs.dungeonSide > 0 ? w - Math.trunc(w * 0.05) : Math.trunc(w * 0.45);
  const potT = Math.max(10, Math.min(h - 10, Math.trunc(h * potTp)));
  const potB = Math.max(10, Math.min(h - 10, Math.trunc(h * potBt)));
  const potContains = (x: number, y: number): boolean =>
    x >= Math.max(10, Math.min(w - 10, potL)) && x < Math.max(10, Math.min(w - 10, potR)) && y >= potT && y < potB;
  // ★入口三掷已随每 pass 重播改造（2026-08-16）归位 **Dunes pass 头**（cs:11542
  //   SetupDungeonGenVarVariables 尾段——主题掷后紧跟）：掷①② Next(3) 与 RandomSeed
  //   Next() 原版在 Dunes 消耗，此处只取 Dunes 落盘的 entSeed/A/B（兜底自掷仅限绕过
  //   Dunes 直调本 pass 的诊断路径，流位与 oracle 不同构）。
  // ★XX 批（2026-08-18）：②==0→Tower、①==0→Dome＝PrecalculateEntrancePosition 路径
  //   （MakeDungeon_GetEntranceSettings data==null 支 DC.cs:802-838：Dome/Tower 置
  //   precalc=true，RoughHeight=Legacy40/Dome55/Tower120）。entKind: 0=Legacy 1=Dome 2=Tower。
  const entSeed = gs.dungeonEntSeed ?? raw(); // preGenDungeonEntranceSettings.RandomSeed
  const entA = gs.dungeonEntA ?? rn(3);       // 入口类型掷①（Dome 候选）
  const entB = gs.dungeonEntB ?? rn(3);       // 入口类型掷②（Tower 覆盖）
  const entKind = entB === 0 ? 2 : entA === 0 ? 1 : 0;
  const shelf = [ri(9, 12), 0, 0];    // SetupDungeonDataVariables（cs:243-254）
  do { shelf[1] = ri(9, 12); } while (shelf[1] === shelf[0]);
  shelf[2] = ri(9, 12);
  while (shelf[2] === shelf[0] || shelf[2] === shelf[1]) shelf[2] = ri(9, 12);
  const lantern = [rn(7), 0, 0];      // cs:255-266
  do { lantern[1] = rn(7); } while (lantern[1] === lantern[0]);
  lantern[2] = rn(7);
  while (lantern[2] === lantern[0] || lantern[2] === lantern[1]) lantern[2] = rn(7);
  const bannerStyles = [10, 11, 12, 13, 14, 15];
  const skewed = rn(4) === 0;         // cs:274 useSkewedDungeonEntranceHalls
  const doorStyle = theme === 0 ? 16 : theme === 1 ? 17 : 18;  // Item 1411-1413 placeStyle
  const platformStyle = theme === 0 ? 6 : theme === 1 ? 8 : 7; // Item 1384-1386 placeStyle(蓝6/绿8/粉7)
  // ★窗口玻璃/边墙/窗台平台样式（SetupDungeonGenVarVariables cs:80-105 + Item 表）：
  //   玻璃 glass/closed、边墙 edge；窗台平台=WindowPlatformItemTypes 单元素
  //   （蓝1386/绿1385/粉1384 → placeStyle 8/7/6——与主平台 6/8/7 恰为倒置，原版如此）
  const winGlass = theme === 0 ? 91 : theme === 1 ? 92 : 90;
  const winGlassClosed = theme === 0 ? 96 : theme === 1 ? 94 : 98;
  const winEdge = theme === 0 ? 8 : theme === 1 ? 9 : 7;
  const winPlatStyle = theme === 0 ? 8 : theme === 1 ? 7 : 6;
  // ============ PrecalculateEntrancePosition 拒绝环（DungeonCrawler.cs:275-322）============
  // ★XX 批（2026-08-18）双侧转录：Tower/Dome 入口（entKind 1/2）在 SetupDungeon-
  //   DataVariables 尾段预计算入口位置——3000 次尝试内掷 Next(200) 偏移 dungeonLocation
  //   ±100，海滩带内从 y=10 下爬到首个 active/liquid/wall 格，双云层排除（±15 /
  //   max(50,y-50)±50，TileID.Sets.Clouds={189,196,460,717,718,719}）+ RoughHeight
  //   门槛（num2-40-rough>0）。成功：dungeonLocation ← num+25-Next(50)（**genVars 被
  //   改写**——pass :14827 随后读的就是新值，本 pass 的 y0 锚/初始 bounds/MakeDungeon
  //   x 全部跟着走）+ entrancePosition=(num,num2)；失败：回退 Legacy 设置（无掷）。
  //   Legacy 种子（b≠0）整段零掷零触碰——caves-checkpoint 9293480 金标不动。
  const BEACH = 380;                  // WorldGen.beachDistance（cs:4102）
  const DG_CLOUDS = new Set([189, 196, 460, 717, 718, 719]);
  const cloudsNear = (cx: number, cy: number, dist: number): boolean => {
    for (let x = cx - dist; x <= cx + dist; x++) {
      for (let y = cy - dist; y <= cy + dist; y++) {
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        if (st.flags[i] && DG_CLOUDS.has(TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1)) return true;
      }
    }
    return false;
  };
  let dgLoc = gs.dungeonLocation;
  let entX = 0, entY = 0, precalcOK = false;   // dungeonEntrancePosition（Zero=未预计算）
  if (entKind !== 0) {
    const rough = entKind === 2 ? 120 : 55;    // RoughHeight：Tower 120 / Dome 55（DC.cs:830-834）
    let tries = 3000;
    while (true) {
      tries--;
      if (tries <= 0) break;
      const nx = dgLoc - 100 + rn(200);
      if (nx > BEACH && nx < w - BEACH) {
        let ny = 10;
        // tile!=null ⟺ 界内；界外/首 active/liquid/wall 格停（此处直读 st——actAt/
        // wallAt 常量在函数尾才初始化，TDZ）
        while (ny < h && st.flags[st.idx(nx, ny)] === 0
          && st.liquid[st.idx(nx, ny)] <= 0 && st.wall[st.idx(nx, ny)] <= 0) ny++;
        if (!cloudsNear(nx, ny, 15) && !cloudsNear(nx, Math.max(50, ny - 50), 50)
          && ny - 40 - rough > 0) {
          dgLoc = nx + 25 - rn(50);            // genVars.dungeonLocation 改写（:308）
          entX = nx; entY = ny;
          precalcOK = true;
          break;
        }
      }
    }
  }
  // —— 状态（DungeonData/GenVars）——
  const rooms: DRoom[] = [];
  const halls: DHall[] = [];
  const doorData: DDoor[] = [];
  const platData: DPlat[] = [];
  const pits: DBnd[] = [];
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
  // —— MakeDungeon（cs:327-505）——
  const s1x = ri(25, 29) + 0.0, s1y = ri(20, 24) + 0.0;
  const s2x = ri(35, 49) + 0.0, s2y = ri(10, 14) + 0.0;
  let num = Math.trunc(w / 60); num += rn(Math.trunc(num / 3));          // cs:353-355 num += Next(0, num/3)

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
          if (!isDW(st.wall[i])) chTile(i, brick, true);
        }
      }
      for (let x = x0 + 1; x < x1 - 1; x++) {
        for (let y = y0 + 1; y < y1 - 1; y++) chWall(st.idx(x, y), wall, false);
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
    const f13 = py < rock + 100.0;
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
      else if (sdY < 0 && py < rock + 50.0) num3 = 0;
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
          if (f16 && y <= h - 200 + 7 && canPlaceTileAt(i)) chTile(i, brick, true);
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
    const dgEntProbe = typeof process !== 'undefined' && process.env?.DG_ENT_PROBE != null;   // 诊断钩：入口 rr 掷序对拍
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
    const num2 = i > w / 2 ? -1 : 1;
    entBounds.set(Math.trunc(cx), Math.trunc(cy), Math.trunc(cx), Math.trunc(cy));
    entExists = true;
    // 对账插桩(dormant)：SW_DG_ENT_CELLS="x0,y0,x1,y1" 时逐子段打目标格墙值（E 段猎杀用）
    const entCellsEnv = typeof process !== 'undefined' ? process.env.SW_DG_ENT_CELLS : undefined;
    const entCells = entCellsEnv ? (entCellsEnv.split(',').map(Number) as [number, number, number, number]) : null;
    const entSnap = (tag: string): void => {
      if (!entCells) return;
      const [x0, y0, x1, y1] = entCells;
      let s = '';
      for (let y = y0!; y <= y1!; y++) {
        for (let x = x0!; x <= x1!; x++) {
          const ti = st.idx(x, y);
          s += `(${x},${y})w${st.wall[ti]}a${st.flags[ti] & 1} `;
        }
        s += '| ';
      }
      console.log(`ENT[${tag}] rolls=${dgMainRolls} ${s}`);
    };
    entSnap('head');
    const solidBox = (x0: number, y0: number, x1: number, y1: number, inner: boolean): void => {
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
    entSnap('fort1');
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
    n3 = clampX(Math.trunc(cx - sx2 * 0.6000000238418579 - hri(1, 2)));
    entSnap('teeth1');
    n4 = clampX(Math.trunc(cx + sx2 * 0.6000000238418579 + hri(1, 2)));
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
    // 0.6 框清墙（cs:465-483：normal 世界必跑）
    {
      const a0 = clampX(Math.trunc(cx - sx2 * 0.6000000238418579));
      const a1 = clampX(Math.trunc(cx + sx2 * 0.6000000238418579));
      const b0 = clampY(Math.trunc(cy - sy2 * 0.6000000238418579));
      const b1 = clampY(Math.trunc(cy + sy2 * 0.6000000238418579));
      entBounds.upd(a0, b0, a1, b1);
      for (let x = a0; x < a1; x++) {
        for (let y = b0; y < b1; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          st.liquid[ti] = 0; st.wall[ti] = 0;
        }
      }
    }
    entSnap('walls2');
    // 0.5 框开放门厅 + 老头锚
    {
      const a0 = clampX(Math.trunc(cx - sx2 * 0.5));
      const a1 = clampX(Math.trunc(cx + sx2 * 0.5));
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
    }
    entSnap('open');
    // ★2026-08-17 移植：GenerateDungeonStairs（DungeonUtils.cs:1222-1310，调用点
    //   LegacyDungeonEntrance.cs:511-516——HasStairs 普通世界=TRUE）。曾整段缺失 →
    //   堡右 45° 阶梯丢失 + 后续段起墙判定/变体锚/掷流全错位（oracle Q 批同补并
    //   真值对拍）。i2=num2==1?0.5盒右缘:左缘（:512 时 num3/num4 已被 0.5 框重算）、
    //   j=0.5 盒底缘、depth=GetDualDungeonBrickSupportCutoffY(普通世界=outerPotTop-10)-num6+5。
    {
      const sti = num2 === 1 ? clampX(Math.trunc(cx + sx2 * 0.5)) : clampX(Math.trunc(cx - sx2 * 0.5));
      const stj = clampY(Math.trunc(cy + sy2 * 0.5));
      const stdep = (potT - 10) - stj + 5;
      dgStairs(sti, stj, num2, stdep);
    }
    entSnap('stairs');
    // 条纹窗墙（PlaceWall：墙==0 才写）
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
    }
    entSnap('stripes');
    // 门洞 15×3 清空 + PlaceTile(10, style13)
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
    entSnap('door');
  }

  // ============ LegacyEntranceDungeonHall precalc 支（:23-380，UsePrecalculatedEntrance=true）============
  // XX 批（2026-08-18）。CalculateHall(OverrideStart=currentPos→OverrideEnd=lerp 目标)
  // 后生成：方向/步数被覆写成**直线 + steps=ceil(段距)**（:157-171 v=End-Start 归一），
  // strength=Next(5,9) 存活；无出地表探测（!UsePrecalc 门）/TileRunner/0.98 衰减
  //（!flag 门）；每 10 步记平台候选（InAHallway → hf=5）。头部掷序与 Legacy 支逐位
  // 同构（strength→steps→方向链），覆写值弃而位次保留——种子流两支等价推进。
  function dgEntHallPrecalc(seed: number, sx0: number, sy0: number, tgx: number, tgy: number): void {
    const hr = dgUR(seed);
    const hri = (a: number, b: number): number => hr.nextIntRange(a, b + 1);
    const hrn = (n: number): number => hr.nextInt(n);
    const num = hri(5, 8);                       // strength（存活——盒宽/Fluff 用）
    hri(10, 29);                                 // steps 掷（覆写弃值保位）
    if (hrn(3) !== 0) hri(0, 199);               // 方向掷链（覆写弃值保位）
    else if (hrn(3) === 0) hri(50, 75);
    else if (hrn(6) === 0) { /* vy*=2 分支无掷 */ }
    // flag 支直线：v=End-Start，SafeNormalize(v,UnitX)，steps=ceil(|v|/1)
    const dvx = tgx - sx0, dvy = tgy - sy0;
    const len = Math.sqrt(dvx * dvx + dvy * dvy);
    const vx = len === 0 ? 1 : dvx / len, vy = len === 0 ? 0 : dvy / len;
    let steps = Math.ceil(len);
    let px = sx0 + 0.0, py = sy0 + 0.0;
    const num5 = 0.5;
    const n6 = 30;
    const hb = new DBnd(w, h);
    hb.set(Math.trunc(px), Math.trunc(py), Math.trunc(px), Math.trunc(py));
    const hall: DHall = { seed, generated: true, forceX: false, isEntrance: true, bounds: hb, sx: px, sy: py, ex: 0, ey: 0, sdx: vx, sdy: vy, edx: vx, edy: vy };
    halls.push(hall);
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
      px += vx; py += vy;                        // flag=true → 无 0.98 纵向衰减
    }
    posX = Math.trunc(px); posY = Math.trunc(py);
    hall.ex = px; hall.ey = py;
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
        // ClearTile()（Tile.cs:153——清 slope/half/active/**inActive**）+active+type
        st.flags[ti] = 1; st.type[ti] = brick; st.slope[ti] = 0; st.half[ti] = 0;
        st.wire[ti] &= ~32;
        if ((j === lo && smoothTop) || (j === hi && smoothBottom)) dgSmoothSlope(px, cy);
        // ★MMMM 批：DungeonPillar.GenerateTileStrip :151-154/:200-203——BlockActuated 族
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
    if (x > 1 && y > 1 && x < w - 2 && y < h - 2 && wallAt(x, y) === 0) { raw(); st.wall[st.idx(x, y)] = FENCE; }
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
    dgPillar(px, py - 1, 7, false, false, 3, false);
    dgPillar(px, py - 4, 5, false, false, 7, false);
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
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) st.wall[st.idx(x, y)] = v;
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
  }
  // DungeonWindowMosaic.Window_Skeletron（:46-190）——17×15 颅 + 11×7 颚 + 边缘描线
  function dgWindowMosaicSkel(px: number, py: number, glass: number): void {
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) st.wall[st.idx(x, y)] = v;
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
  }
  // DungeonWindowMosaic.Window_MoonLord（:192-330）——左右 8×7+7×6 侧眼 + 7×8 中眼
  function dgWindowMosaicMoon(px: number, py: number, glass: number): void {
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) st.wall[st.idx(x, y)] = v;
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
  function dgTowerEntrance(i: number, j: number, preSeed: number): void {
    if (dgTW) { dgTW.tower0 = dgMainRolls; dgTW.i = i; dgTW.j = j; dgTW.pw = 0; dgTW.win = 0; dgTW.door = 0; dgTW.fence = 0; dgTW.opw = 0; dgTW.wt = 'na'; }
    const hr = dgUR(preSeed);
    const hrn = (n: number): number => hr.nextInt(n);
    const windowType = hrn(3);                    // 0=Regular 1=Skeletron 2=MoonLord
    if (dgTW) dgTW.wt = ['reg', 'skel', 'moon'][windowType];
    const leftSide = gs.dungeonSide < 0;          // flag = dungeonSide==Left
    // 120×120 清液+清坡（:62-76 Clear(Slope)）
    for (let x = i - 60; x < i + 60; x++) {
      for (let y = j - 60; y < j + 60; y++) {
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        st.liquid[ti] = 0; st.liquidType[ti] = 0;
        st.slope[ti] = 0; st.half[ti] = 0;
      }
    }
    const n2 = 5, n3 = 35, n4 = 40, n5 = 100;
    const n7 = j - 30;                            // 塔基线（num7=j-num6, num6=30）
    const n8 = 30, n9 = 25, n10 = 30, n11 = 20, n12 = 50, n13 = 15, n14 = 20, n16 = 95;
    const minY = n7 - n16, maxY = n7 + 10;
    // 塔侧地表圆清 Circle(15)（:92-98 Shapes.Circle.Perform 椭圆逐行 + Actions.Clear
    // =ClearEverything）
    {
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
    entBounds.set(i - n4, minY, i + n4 + 1, maxY);
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
            chTile(ti, brick, false);
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if (m < 10) {
          if (n >= -n4 + n2 && n <= n4 - n2) {
            clrAll(ti);
            st.wall[ti] = wall;                   // ClearEverything 后判恒真——无条件补墙
          } else if (!f4) {
            st.liquid[ti] = 0; st.liquidType[ti] = 0;
            chTile(ti, brick, false);
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if ((st.flags[ti] !== 0 && f2) || !f4) {
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          chTile(ti, brick, false);
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
    dgPillar(i - n4 + 5, n7 - n8 - 1, 5, false, false, 2, false);
    dgLineOfFence(i - n4 - 2, i - n10 + 1, n7 - n8 - 1);
    dgPillar(i - n10 + 5, n7 - n12 - 1, 5, false, false, 2, false);
    dgLineOfFence(i - n10 - 2, i - n14 + 1, n7 - n12 - 1);
    dgPillar(i - n14 + 5, n7 - n16 - 1, 5, false, false, 2, false);
    dgPillar(i - n14 + 13, n7 - n16 - 1, 5, false, false, 2, false);
    dgPillar(i + n4 - 5, n7 - n8 - 1, 5, false, false, 2, false);
    dgLineOfFence(i + n10 - 1, i + n4 + 2, n7 - n8 - 1);
    dgPillar(i + n10 - 5, n7 - n12 - 1, 5, false, false, 2, false);
    dgLineOfFence(i + n14 - 1, i + n10 + 2, n7 - n12 - 1);
    dgPillar(i + n14 - 5, n7 - n16 - 1, 5, false, false, 2, false);
    dgPillar(i + n14 - 13, n7 - n16 - 1, 5, false, false, 2, false);
    dgLineOfFence(i - n14 - 2, i + n14 + 2, n7 - n16 - 1);
    dgBottomWedge(i - n13, n7 - n16 + n2, 3, false);
    dgBottomWedge(i + n13 - 1, n7 - n16 + n2, 3, true);
    // 九处平台候选（:362-373，OverrideHeightFluff=0）
    platData.push({ x: i - n10 - 2, y: n7 - n8 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i - n10 - 2, y: n7 - n8 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i - n14 - 2, y: n7 - n12 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i - n14 - 2, y: n7 - n12 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i + n10 + 2, y: n7 - n8 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i + n10 + 2, y: n7 - n8 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i + n14 + 2, y: n7 - n12 + 15, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i + n14 + 2, y: n7 - n12 + 21, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    platData.push({ x: i, y: n7 - n12 + n2 - 3, hall: false, hf: 0, force: true, pots: 0.33000001311302185, books: 0.75, bottles: 0.10000000149011612 });
    // 窗族（:375-429）——num30=n7-75；Regular=3+2+2+1 八窗 / Mosaic=大窗+2+2+1 五窗
    {
      const n30 = n7 - n16 + 20;
      if (windowType === 0) {
        dgWindowBasic(i - 9, n30 + 4, 5, 24, -1);
        dgWindowBasic(i + 9, n30 + 4, 5, 24, -1);
        dgWindowBasic(i, n30 + 3, 5, 28, -1);
      } else if (windowType === 1) {
        dgWindowMosaicSkel(i, n30 - 1, 89);       // OverrideGlassType=89（非地下）
      } else {
        dgWindowMosaicMoon(i, n30 + 5, 91);       // OverrideGlassType=91
      }
      dgWindowBasic(i - 8, n7 - 16, 9, 24, -1);
      dgWindowBasic(i + 8, n7 - 16, 9, 24, -1);
      dgWindowBasic(i - 10, n7 - 37, 7, 11, -1);
      dgWindowBasic(i + 10, n7 - 37, 7, 11, -1);
      dgWindowBasic(i, n7 - 39, 7, 13, -1);
    }
    // 双侧门洞（:431-433）
    dgTowerDoor(i, n7, n4, n3, leftSide);
    dgTowerDoor(i, n7, n4, n3, !leftSide);
    // 老头锚（SetOldManSpawnAndSpawnOldManIfDefaultDungeon :1659——dungeonX/Y=(i,num7)）
    dungeonX = i; dungeonY = n7;
    // 阶梯双侧（:437-443，depth=num5=100）
    dgStairs(i + n4, n7, 1, n5);
    dgStairs(i - n4, n7, -1, n5);
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
    const leftSide = gs.dungeonSide < 0;           // flag = dungeonSide==Left（drunkWorld 翻转=特典）
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
    // 地表侧圆清 Circle(20)（cs:93-102——Tower 是 Circle(15)@±num3，Dome 半径 20@±num4）
    {
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
            chTile(ti, brick, false);
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if (m < 10) {
          if (n >= -n3 + n2 && n <= n3 - n2) {
            clrAll(ti);
            st.wall[ti] = wall;                   // Clear 后 IsConsideredDungeonWall 恒假——无条件补墙
          } else if (!f4) {
            st.liquid[ti] = 0; st.liquidType[ti] = 0;
            chTile(ti, brick, false);
            if (n !== -n4 && n !== n4) st.wall[ti] = wall;
          }
        } else if ((st.flags[ti] !== 0 && f2) || !f4) {
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          chTile(ti, brick, false);
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
    dgTowerDoor(i, n7, n4, n3, leftSide);
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
    // 阶梯（cs:435-439，HasStairs 正常种子=真）：dungeon 侧单侧，depth=num5=100
    dgStairs(leftSide ? i + n4 : i - n4, n7, leftSide ? 1 : -1, n5);
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
    if (feat !== 2) {
      for (const pb of pits) if (pb.contains(x, y)) return false;
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
      if (dgPitTrap(x3, y2, wid, hgt, ew, n45, flooded)) {
        if (flooded) pitFlood = false;
        n += 1500;
      } else n++;
    }
  }
  function dgPitTrap(ix: number, jy: number, width: number, height: number, edgeW: number, topD: number, flooded: boolean): boolean {
    let num = jy, num2 = jy;
    if (width < 1 || height < 1) return false;
    const n6 = width + edgeW, n7 = height + topD;
    if (!inW(ix, num, Math.max(n6, n7))) return false;
    if (!isDW(wallAt(ix, num))) return false;
    if (actAt(ix, num) !== 0) return false;
    for (let k = num; k < h; k++) {
      if (k > h - 200) return false;
      if (actAt(ix, k) !== 0 && dgSolid(ix, k)) {
        if (typAt(ix, k) === SPIKE) return false;
        num = k; num2 = k;
        break;
      }
    }
    if (!isDW(wallAt(ix - width, num)) || !isDW(wallAt(ix + width, num))) return false;
    const n8 = 30;
    for (let n = num; n < num + n8; n++) {
      let ok = true;
      for (let x = ix - width; x <= ix + width; x++) {
        if (actAt(x, n) !== 0 && isDT(typAt(x, n))) { ok = false; break; }
      }
      if (ok) { num = n; break; }
    }
    if (num + n7 >= h - 200) return false;
    for (let x = ix - width; x <= ix + width; x++) {
      for (let y = num; y <= num + height; y++) {
        if (actAt(x, y) !== 0 && (isDT(typAt(x, y)) || typAt(x, y) === crack)) return false;
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
      if (!featOK(fx, fy, 0) || entNoFeat(fx, fy) || !featOK(fx, round === 0 ? wy - d : cy - d, 0)
        || entNoFeat(fx, round === 0 ? wy - d : cy - d)) {
        if (round === 0) cx += step; else cy += step;
        n11 = 0;
        continue;
      }
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
    const num7 = Math.trunc(42 * (w / 4200) * Math.max(1, 0.25));
    for (let round = 0; round < 2; round++) {
      let n3 = 0;
      const n4 = 1000;
      let n5 = 0;
      while (n5 < num7) {
        n3++;
        const x = ri(bounds.L, bounds.R - 1);
        const y = ri(ws + 25, bounds.B - 1);
        if (wallAt(x, y) === num && actAt(x, y) === 0) {
          const d = rn(2) === 0 ? -1 : 1;
          const oy = y;                                   // num13：原始采样点（第二段起点基准）
          let wx = x, wy = y;
          while (inW(wx, wy, 0) && actAt(wx, wy) === 0) {
            if (round === 0) wy += d; else wx += d;
          }
          const hit = inW(wx, wy, 0);
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
    for (const d of doorData) {
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
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 3; j++) {
        const n2 = ri(40, 239);
        const n3 = ri(bounds.L, bounds.R - 1);
        const n4 = ri(bounds.T, bounds.B - 1);
        for (let x = n3 - n2; x < n3 + n2; x++) {
          for (let y = n4 - n2; y < n4 + n2; y++) {
            if (y <= ws || !inW(x, y, 2)) continue;
            const dx = Math.abs(n3 - x), dy = Math.abs(n4 - y);
            if (Math.sqrt(dx * dx + dy * dy) >= n2 * 0.4) continue;
            if (isDW(wallAt(x, y))) dgSpreadWall(x, y, wallVariants[j]);
          }
        }
      }
    }
  }
  function dgSpreadWall(x: number, y: number, wallType: number): void {
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
        if (st.wall[ti] === 0 || st.wall[ti] === wallType || st.wall[ti] === 244 || st.wall[ti] === 62
          || !featOK(p[0], p[1], 2)) continue;
        if (entExists && entBounds.contains(p[0], p[1])) {
          if (st.wall[ti] !== wall) continue;
        } else if (st.wall[ti] !== wall) continue;
        if (!dgSolid(p[0], p[1])) {
          st.wall[ti] = wallType;
          for (const q of [[p[0] - 1, p[1]], [p[0] + 1, p[1]], [p[0], p[1] - 1], [p[0], p[1] + 1]] as Array<[number, number]>) {
            if (!seen.has(key(q[0], q[1]))) list2.push(q);
          }
        } else if (st.flags[ti] !== 0) st.wall[ti] = wallType;
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
        st.frameY[st.idx(px, py)] = 18 * platformStyle; // DungeonGlobalPlatforms:158
        px--;
        if (px <= 10) break;
      }
      while (inW(qx, py, 0) && actAt(qx, py) === 0) {
        chTile(st.idx(qx, py), PLATFORM, false);
        st.frameY[st.idx(qx, py)] = 18 * platformStyle;
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
    const arr = DG_PRE[cls];
    // Prefix(-1)（Item.cs:486-560）逐轮：Next(4)==0→rolledPrefix=0（乘子恒 1→真，止）；
    // 否则 RollAPrefix=Next(len)；Reduced 且 Next(3)!=0 → 降 0 止；
    // TryGetPrefixStatMultipliersForItem 假（81-89）→ rolledPrefix=-1 重掷。
    for (;;) {
      if (rn(4) === 0) return;
      const rolled = arr[rn(arr.length)];
      if (DG_PRE_REDUCED.has(rolled) && rn(3) !== 0) return;
      if (!DG_PRE_NOSTAT.has(rolled)) return;
    }
  }
  function dgAddBuriedChest(ix: number, jy: number, mainItem: number, style: number, chestTile: number): boolean {
    if (typeof process !== 'undefined' && process.env.SW_DG_CHEST_TRACE) {
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
    const surf = num7 < ws + 25 && flag0;
    const gold = num7 < rock;
    if (surf) {
      if (num10 > 0) prefixRolls(num10);
      else rn(10);
      if (rn(6) === 0) rn(1);                        // 282 荧光棒（弃值掷）
      if (rn(6) === 0) rn(1);                        // 279 飞刀
      if (rn(6) === 0) { if (rn(5) === 0) rn(2); if (rn(10) === 0) rn(3); }
      if (rn(6) === 0) { if (rn(5) === 0) rn(2); if (rn(10) === 0) rn(3); }
      if (rn(3) === 0) rn(6);
      if (rn(2) === 0) { rn(2); rn(8); }
      if (rn(2) === 0) rn(51);
      if (rn(3) !== 0) { rn(2); rn(26); }
      if (rn(2) === 0) rn(3);
      if (rn(3) !== 0) rn(6);
      if (rn(3) > 0) { rn(6); rn(3); }
      if (rn(2) === 0) { rn(2); rn(11); }
      if (rn(2) === 0) rn(30);
      if (rn(2) === 0) rn(100);
    } else if (gold) {
      if (num10 > 0) {
        prefixRolls(num10);
        if (flag9 && !flag10) {
          if (!shadowKey || rn(3) === 0) shadowKey = true;
          if (!ramRune || rn(8) === 0) { ramRune = true; prefixRolls(5465); dgLoot.push(5465); }
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
    } else if (num7 < h - 250) {
      if (num10 > 0) {
        prefixRolls(num10);
        // flag2（冰）/flag3（沙）地牢箱恒 false → 两段掷骰不触发（cs:36846-36858）
        if (flag9 && !flag10) {
          if (!shadowKey || rn(3) === 0) { shadowKey = true; dgLoot.push(329); }
          if (!ramRune || rn(8) === 0) { ramRune = true; prefixRolls(5465); dgLoot.push(5465); }
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
      if (rn(3) > 0) { rn(6); rn(3); }
      if (rn(3) > 1) { rn(6); rn(3); }
      if (rn(2) === 0) rn(3);
      if (rn(2) === 0) { rn(2); rn(16); }
      if (rn(2) === 0) rn(3);
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
    for (let i = 0; i < 5; i++) {
      let flag = false;
      let n3 = 1000;
      while (!flag) {
        n3--;
        if (n3 <= 0) break;
        const x = ri(bounds.L, bounds.R - 1);
        const y = ri(Math.trunc(ws), bounds.B - 1);
        if ((entExists && entBounds.contains(x, y)) || !isDW(wallAt(x, y)) || actAt(x, y) !== 0) continue;
        let chestTile = CHEST, mainItem = 0, chestStyle = 0;
        switch (i) {
          case 0: chestStyle = 23; mainItem = 1156; break;
          case 1:
            if (!gs.crimson) { chestStyle = 24; mainItem = 1571; } else { chestStyle = 25; mainItem = 1569; }
            break;
          case 2: chestStyle = 26; mainItem = 1260; break;
          case 3: chestStyle = 27; mainItem = 1572; break;
          case 4: chestTile = CHEST2; chestStyle = 13; mainItem = 4607; break;
        }
        flag = dgAddBuriedChest(x, y, mainItem, chestStyle, chestTile);
      }
    }
  }
  function dgBasicChests(): void {
    // 对账插桩(dormant)：SW_DG_GC=1 时逐房/逐尝试记 lo/hi/num/num2（G 段流对拍用）
    const gcT = typeof process !== 'undefined' && process.env.SW_DG_GC === '1';
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
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(bounds.T, bounds.B - 1);
      let flag = true;
      if (isDW(wallAt(x, y)) && actAt(x, y) === 0) {
        const n7 = rn(2) === 0 ? -1 : 1;
        while (flag && inW(x, y, 0) && actAt(x, y) === 0) {
          x -= n7;
          if (x < 5 || x > w - 5) flag = false;
          else if (actAt(x, y) !== 0 && !isDT(typAt(x, y))) flag = false;
        }
        if (flag && inW(x, y, 0) && actAt(x, y) !== 0 && isDT(typAt(x, y))
          && actAt(x, y - 1) !== 0 && isDT(typAt(x, y - 1))
          && actAt(x, y + 1) !== 0 && isDT(typAt(x, y + 1))) {
          x += n7;
          outer4:
          for (let a = x - 3; a <= x + 3; a++) {
            for (let b = y - 3; b <= y + 3; b++) {
              if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === PLATFORM) { flag = false; break outer4; }
            }
          }
          if (flag && inW(x, y - 1, 0) && actAt(x, y - 1) === 0
            && inW(x, y - 2, 0) && actAt(x, y - 2) === 0
            && inW(x, y - 3, 0) && actAt(x, y - 3) === 0) {
            if (!featOK(x, y, 0) || entNoFeat(x, y)) { flag = false; continue; }
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
              let n10 = ri(min, max - 1);            // ri 闭区间 ↔ Next(min, max)
              if (bsEvG) bsEvG.push([k0, dgMainRolls, num8, y, n10, flag3, n7, k]);
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
    const lgTr = typeof process !== 'undefined' && !!process.env.SW_DG_LIGHTS_TRACE;
    if (lgTr) {
      console.log(`DG LG n5=${Math.trunc(28 * (w / 4200) * 1.0)} bnd=${bounds.L},${bounds.T},${bounds.R},${bounds.B} ent=${entExists ? 1 : 0} eb=${entBounds.L},${entBounds.T},${entBounds.R},${entBounds.B}`);
      console.log(`DG PITS${pits.map((p: DBnd) => ` ${p.L},${p.T},${p.R},${p.B}`).join('')}`);
    }
    // #32 终清批 III：Lights 入口全网格落盘（SW_DG_LIGHTS_GRID=<path 前缀>）——与
    //   vanilla 探针 SW_DGLIGHTS_GRID 同口径对拍（typ/act/wal/half/slope 五通道）。
    if (typeof process !== 'undefined' && process.env.SW_DG_LIGHTS_GRID) {
      const pfx = process.env.SW_DG_LIGHTS_GRID as string;
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
              if (inW(a, b, 0) && actAt(a, b) !== 0 && (typAt(a, b) === LANTERN || typAt(a, b) === CHANDELIER)) {
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
            // ★2026-08-16 审计：吊灯支要求 GetStyleForWall != null（Lights.cs:77-78）
            //   ——Default 样式表 WallIsInStyle = wall==brickWallType，即**主砖墙才有
            //   吊灯资格**；变体墙(94-99)返 null 直接跳过吊灯落灯笼。曾变体墙也试吊灯。
            const chGate = wallAt(x, cy) === wall;
            let blocked = !chGate;
            for (let k = 0; k < 15 && !blocked; k++) {
              if (inW(x, cy + k, 0) && dgSolid(x, cy + k)) { blocked = true; break; }
            }
            if (lgTr) console.log(`DG CH x=${x} cy=${cy} gate=${chGate ? 1 : 0} blocked=${blocked ? 1 : 0}`);
            if (!blocked && placeChand(x, cy)) {
              placed = true; ncount = 0; num4++;
              dgSwitch(x, cy);
            }
          }
          if (placed) break;
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
            // 灯笼样式按墙变体三档（Lights :109-118）：wall==variants[1]/[2] 换档,余用 [0]
            const wl = wallAt(x, cy);
            const lStyle = wl === wallVariants[1] ? lantern[1] : wl === wallVariants[2] ? lantern[2] : lantern[0];
            chTile(st.idx(x, cy), LANTERN, false);
            chTile(st.idx(x, cy + 1), LANTERN, false);
            // Place1x2Top 帧式（:46711-46717）：frameY=style*36（下格 +18）、frameX=0（亮档；
            // 灭档 frameX=18 由 dgSwitch 2/3 掷写）。★此前不写帧=残留砖帧,样式全丢
            st.frameY[st.idx(x, cy)] = lStyle * 36;
            st.frameY[st.idx(x, cy + 1)] = lStyle * 36 + 18;
            st.frameX[st.idx(x, cy)] = 0;
            st.frameX[st.idx(x, cy + 1)] = 0;
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
    // 页列 num2=108*(style/36)（27-29 无分页=0）、行基 num3=style*54（分页修正同式）；
    // 三列 fx=num2+{0,18,36}、三行 fy=num3+{0,18,36}。★此前不写帧=残留砖帧
    const style = 27 + theme;
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
    const swTr = typeof process !== 'undefined' && !!process.env.SW_DG_LIGHTS_TRACE;
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
    if (typeof process !== 'undefined' && process.env.SW_DG_CANHIT_LEGACY) return canHitLegacy(x1, y1, x2, y2);
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
  function dgTraps(): void {
    const num5 = Math.trunc(8.4 * (w / 4200) * 1.0);
    let ncount = 0, num4 = 0;
    while (num4 < num5) {
      ncount++;
      const x = ri(bounds.L, bounds.R - 1);
      const y = ri(Math.trunc(ws), bounds.B - 1);
      if (isDW(wallAt(x, y)) && placeTrap0(x, y)) ncount = 1000;
      if (ncount > 1000) { num4++; ncount = 0; }
    }
  }
  // placeTrap type=0（WorldGen.cs:8875-9150 飞镖分支）
  function placeTrap0(x2: number, y2: number): boolean {
    let num = y2;
    while (!dgSolid(x2, num)) {
      num++;
      if (num > h - 10) return false;
    }
    num--;
    if (!inW(x2, num, 3)) return false;
    for (let a = x2 - 20; a <= x2 + 20; a++) {
      for (let b = num - 20; b <= num + 20; b++) {
        if (inW(a, b, 0) && actAt(a, b) !== 0 && typAt(a, b) === TILE_BY_KEY['v_70_mushroom_grass_block']) return false;
      }
    }
    if (wallAt(x2, num) === 87 || wallAt(x2, num) === 350) return false;
    const lava = st.liquid[st.idx(x2, num)] > 0 && st.liquidType[st.idx(x2, num)] === 2;
    if (lava) return false;
    const offs: Array<[number, number]> = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2], [-1, -2], [1, -2]];
    for (const [ax, ay] of offs) {
      if (inW(x2 + ax, num + ay, 0) && actAt(x2 + ax, num + ay) !== 0) return false;
    }
    if (inW(x2, num + 1, 0) && (typAt(x2, num + 1) === SPIKE || typAt(x2, num + 1) === TILE_BY_KEY['v_232_wooden_spike'])) return false;
    if (!inW(x2, num + 1, 0) || !dgSolid(x2, num + 1)) return false;   // CanGeneratePressurePlateAt
    {
      const bt = typAt(x2, num + 1);
      const sheet = TILE_DEFS[bt]?.vanilla?.sheet ?? -1;
      if (sheet === 138 || sheet === 484 || sheet === 664 || sheet === 665 || (sheet >= 711 && sheet <= 716)) return false;
      if (wallAt(x2, num + 1) === 350) return false;
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
    for (let j = 0; j < num2; j++) {
      if (alch > 0 || bew > 0) {
        j--;
        num3--;
        if (num3 <= 0) break;
      }
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(Math.max(bounds.T, Math.trunc(ws) + 10), bounds.B - 1);
      let n5 = 1000;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n5--;
        if (n5 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(Math.max(bounds.T, Math.trunc(ws) + 10), bounds.B - 1);
      }
      if (isDW(wallAt(x, y)) && actAt(x, y) === 0) {
        while (!dgSolid(x, y) && y < h - 200) y++;
        y--;
        dgFurnAt(x, y, alch, bew, j < num2 / 2);
        const res = dgFurnResult as string;
        if (res === 'alch') alch--;
        else if (res === 'bew') bew--;
      }
    }
  }
  let dgFurnResult: '' | 'alch' | 'bew' | 'ok' = '';
  function dgFurnAt(i: number, j: number, alch: number, bew: number, stricter: boolean): void {
    dgFurnResult = '';
    let num = i, k = i;
    while (inW(num, j, 0) && actAt(num, j) === 0 && dgSolid(num, j + 1)) num--;
    num++;
    while (inW(k, j, 0) && actAt(k, j) === 0 && dgSolid(k, j + 1)) k++;
    k--;
    const num2 = k - num, num3 = Math.trunc((k + num) / 2);
    if (!featOK(num3, j, 0)) return;
    if (inW(num3, j, 0) && actAt(num3, j) === 0 && isDW(wallAt(num3, j)) && dgSolid(num3, j + 1) && typAt(num3, j + 1) !== SPIKE) {
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
      const fTr = typeof process !== 'undefined' && !!process.env.SW_DG_FURN_TRACE;
      if (fTr) console.log(`DG FU i=${i} j=${j} num3=${num3} span=${num2} flag4=${flag4 ? 1 : 0} alch=${alch} bew=${bew} n18=${num18} n19=${num19} n20=${num20}`);
      if (!flag4 && (alch > 0 || bew > 0)) {
        if (alch > 0) {
          if (place3x3D(num3, j, ALCHEMY)) { if (fTr) console.log(`DG FU ALCH ok @${num3},${j}`); dgFurnResult = 'alch'; return; }
        } else if (place3x3D(num3, j, BEWITCH)) { dgFurnResult = 'bew'; return; }
      } else if (num18 === 0) {
        if (place3x2D(num3, j, DG_ITEM_TILE[iTable])) {
          if (iChair > -1) {
            if (inW(num3 - 2, j, 0) && actAt(num3 - 2, j) === 0) place1x2D(num3 - 2, j, DG_ITEM_TILE[iChair]);
            if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) place1x2D(num3 + 2, j, DG_ITEM_TILE[iChair]);
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
        if (place2x1D(num3, j, DG_ITEM_TILE[iWork])) {
          if (iChair > -1) {
            if (rn(2) === 0) {
              if (inW(num3 - 1, j, 0) && actAt(num3 - 1, j) === 0) place1x2D(num3 - 1, j, DG_ITEM_TILE[iChair]);
            } else if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) place1x2D(num3 + 2, j, DG_ITEM_TILE[iChair]);
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
        // ★cs:794-807 椅分支：Next(2) 方向掷（镜像帧；掷必耗）
        if (iChair > -1) {
          rn(2);
          place1x2D(num3, j, DG_ITEM_TILE[iChair]);
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
        if (iPiano > -1 && place3x2D(num3, j, DG_ITEM_TILE[iPiano])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 7) {
        if (iDress > -1 && place3x2D(num3, j, DG_ITEM_TILE[iDress])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 8) {
        if (iSofa > -1 && place3x2D(num3, j, DG_ITEM_TILE[iSofa])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 9) {
        // ★cs:833-842 浴缸分支：Next(2) direction 掷
        if (iTub > -1) {
          const dir = rn(2) === 0 ? 1 : -1;
          if (place4x2D(num3, j, DG_ITEM_TILE[iTub], dir)) { dgFurnResult = 'ok'; return; }
        }
      } else if (num18 === 10) {
        if (iLamp > -1 && place1xXD(num3, j, DG_ITEM_TILE[iLamp], 3)) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 11) {
        if (iCand > -1 && place2x2D(num3, j, DG_ITEM_TILE[iCand])) { dgFurnResult = 'ok'; return; }
      } else if (num18 === 12) {
        if (iClock > -1 && place2xXD(num3, j, DG_ITEM_TILE[iClock], 5, DG_ITEM_STYLE[iClock] ?? 0)) { dgFurnResult = 'ok'; return; }
      }
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
  // Place3x2（cs:52097 桌14/钢琴87/梳妆台88/长凳89）
  function place3x2D(x: number, y: number, t: number): boolean {
    if (x < 5 || x > w - 5 || y < 5 || y > h - 5) return false;
    for (let i = x - 1; i < x + 2; i++) {
      for (let j = y - 1; j < y + 1; j++) if (!dgClr(i, j)) return false;
      if (!solidTile2D(i, y + 1)) return false;
    }
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 1; j < y + 1; j++) dgWr(i, j, t);
    return true;
  }
  // Place2x1（cs:47371 工作台18；103 骷髅=桌上版）
  function place2x1D(x: number, y: number, t: number): boolean {
    const skull = t === dgTileOfSheet(103);
    for (let i = x; i <= x + 1; i++) {
      if (!dgClr(i, y)) return false;
      const bi = st.idx(i, y + 1);
      if (skull) { if (st.flags[bi] === 0 || !TILE_TABLE_D.has(st.type[bi])) return false; }
      else if (!solidTile2D(i, y + 1)) return false;
    }
    dgWr(x, y, t); dgWr(x + 1, y, t);
    return true;
  }
  // Place1x2（cs:46665 椅15）
  function place1x2D(x: number, y: number, t: number): boolean {
    if (!solidTile2D(x, y + 1) || !dgClr(x, y - 1) || !dgClr(x, y)) return false;
    dgWr(x, y - 1, t); dgWr(x, y, t);
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
  // Place1xX（cs:39203 路灯93 h3）
  function place1xXD(x: number, y: number, t: number, hgt: number): boolean {
    for (let j = y - hgt + 1; j <= y; j++) if (!dgClr(x, j) || st.liquid[st.idx(x, j)] > 0) return false;
    if (!solidTile2D(x, y + 1)) return false;
    for (let j = y - hgt + 1; j <= y; j++) dgWr(x, j, t);
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
  function place2x2D(x: number, y: number, t: number): boolean {
    for (let i = x - 1; i < x + 1; i++) {
      for (let j = y - 1; j < y + 1; j++) if (!dgClr(i, j)) return false;
      const bi = st.idx(i, y + 1);
      if (st.flags[bi] === 0 || (!solidTile2D(i, y + 1) && !TILE_TABLE_D.has(st.type[bi]))) return false;
    }
    for (let i = x - 1; i < x + 1; i++) for (let j = y - 1; j < y + 1; j++) dgWr(i, j, t);
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
  function place3x3WallD(x: number, y: number, t: number): boolean {
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 1; j < y + 2; j++)
      if (!dgClr(i, j) || st.wall[st.idx(i, j)] === 0) return false;
    for (let i = x - 1; i < x + 2; i++) for (let j = y - 1; j < y + 2; j++) dgWr(i, j, t);
    return true;
  }
  function place4x3WallD(x: number, y: number, t: number): boolean {
    for (let i = x - 1; i < x + 3; i++) for (let j = y - 1; j < y + 2; j++)
      if (!dgClr(i, j) || st.wall[st.idx(i, j)] === 0) return false;
    for (let i = x - 1; i < x + 3; i++) for (let j = y - 1; j < y + 2; j++) dgWr(i, j, t);
    return true;
  }
  function place6x4WallD(x: number, y: number, t: number): boolean {
    for (let i = x - 2; i < x + 4; i++) for (let j = y - 2; j < y + 2; j++)
      if (!dgClr(i, j) || st.wall[st.idx(i, j)] === 0) return false;
    for (let i = x - 2; i < x + 4; i++) for (let j = y - 2; j < y + 2; j++) dgWr(i, j, t);
    return true;
  }
  // PlaceBanner（cs:46270 旗91：竖 3 格，上挂实心非 solidTop）
  // ★NNN 批 ②（2026-08-18）：补 style 帧链——DungeonGlobalBanners.cs:95 走
  //   `num7 = data.bannerStyles[num8]` → PlaceTile(91,style) → PlaceBanner 写
  //   frameX=style*18（s>=111 时 fx-=1998/fy+=54，dungeon styles 10-15 不触发）、
  //   frameY=0/18/36。旧版裸 dgWr 不落帧 → 378 格 banner frameX 恒 0 全第一帧
  function placeBannerD(x: number, y: number, t: number, style = 0): boolean {
    const ui = st.idx(x, y - 1);
    if (!inW(x, y - 1, 0) || st.flags[ui] === 0) return false;
    const dUp = TILE_DEFS[st.type[ui]];
    if (!dUp || !dUp.solid || dUp.platform) return false;
    if (!dgClr(x, y) || !dgClr(x, y + 1) || !dgClr(x, y + 2)) return false;
    dgWr(x, y, t); dgWr(x, y + 1, t); dgWr(x, y + 2, t);
    // PlaceBanner 帧写（cs:46293-46313；PlaceBanner 零掷，不扰流）
    let fx = style * 18, fy = 0, s3 = style;
    while (s3 >= 111) { s3 -= 111; fx -= 1998; fy += 54; }
    st.frameX[st.idx(x, y)] = fx; st.frameY[st.idx(x, y)] = fy;
    st.frameX[st.idx(x, y + 1)] = fx; st.frameY[st.idx(x, y + 1)] = fy + 18;
    st.frameX[st.idx(x, y + 2)] = fx; st.frameY[st.idx(x, y + 2)] = fy + 36;
    return true;
  }
  // 画作分发（cs:59962-59985）：240→3x3Wall / 241→4x3Wall / 242→6x4Wall
  function placePaintingD(x: number, y: number, t: number): boolean {
    if (t === HANGING) return place3x3WallD(x, y, t);
    if (t === CATACOMB) return place4x3WallD(x, y, t);
    if (t === PAINTING) return place6x4WallD(x, y, t);
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
    if (typeof process !== 'undefined' && process.env.SW_DGPA_TRACE) console.log(`P0 rolls=${dgMainRolls}`);
    // lihzahrdPaintingsMax（DungeonGlobalPaintings.cs:36-42）：GetWorldSize()（WG:6518）
    // 4200 宽 → **0**（≤4200 case）→ switch default → max=1——**零掷**（仅 >6400 的
    // case 2 才掷 Next(2)）。★#32 终清批 III：此前误按"Large=4200"恒掷 → Pa 段全程
    // 流错位 +1（x86 逐事件反解：vanilla 首 PE@+5 而旧 JS@+6 起）。
    void 0;
    const num2v = wallVariants[0];
    const num4 = Math.trunc(100 * (w / 4200) * Math.max(1, 0.75));
    let num5 = num4 * 3;
    for (let i = 0; i < num4; i++) {
      num5--;
      if (num5 <= 0) break;
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(Math.trunc(ws), bounds.B - 1);
      let n8 = 1000;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n8--;
        if (n8 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(Math.trunc(ws), bounds.B - 1);
      }
      if ((typeof process !== 'undefined' && process.env.SW_DGPA_TRACE)) console.log(`S ${x} ${y}`);
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
      if ((typeof process !== 'undefined' && process.env.SW_DGPA_TRACE)) console.log(`A ${n13} ${n14} @${x},${y}`);
      if (n13 <= 7 || n14 <= 5) continue;
      const arr = [true, false, false];
      if (n13 > n14 * 3 && n13 > 21) arr[1] = true;
      if (n14 > n13 * 3 && n14 > 21) arr[2] = true;
      let n15 = rn(3);
      if (wallAt(x, y) === num2v) n15 = 0;
      while (!arr[n15]) n15 = rn(3);
      if (nearPicture2(st, x, y, wall)) n15 = -1;
      if ((typeof process !== 'undefined' && process.env.SW_DGPA_TRACE)) console.log(`N ${n15} np2=${n15 === -1}`);
      // ★D10（2026-08-14）：Paintings 段对齐原版调用序——GetPaintingEntry 的选型掷骰在
      // 门槛判定**之前**消耗（cs:167-168/:183-184/:281-283/:296-298），即使最终不放画也耗；
      // CanGenerateFeatureInArea 的 fluff=3（cs:169/186/281/297 等，7×7 区）非 2。
      if (n15 === 0) {
        const e = paintingEntry(x, y);
        if (featArea3(x, y, 3) && !nearPicture(st, x, y)) placePaintingD(x, y, e);
      } else if (n15 === 1) {
        let e = paintingEntry(x, y);
        if (!featArea3(x, y, 3)) continue;
        if (actAt(x, y) === 0) placePaintingD(x, y, e);
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
            placePaintingD(x, ny, e);
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
            placePaintingD(x, ny, e);
          }
        }
      } else if (n15 === 2) {
        let e = paintingEntry(x, y);
        if (!featArea3(x, y, 3)) continue;
        if (actAt(x, y) === 0) placePaintingD(x, y, e);
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
            placePaintingD(nx, y, e);
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
            placePaintingD(nx, y, e);
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
   * （style 走帧不入哈希，placeSimple 不落帧）——但选型掷骰必须照原版序全部消耗。 */
  function paintingEntry(x: number, y: number): number {
    if ((typeof process !== 'undefined' && process.env.SW_DGPA_TRACE)) console.log(`E ${x} ${y} wall=${wallAt(x, y)} rolls=${dgMainRolls}`);
    let tile = HANGING;
    if (wallAt(x, y) === wall) {
      // RandomDungeonPainting（:364-385）：Next(3)≤1→240 Next(7)(==6 重掷)style{12,13,14,15,18,19,23}；
      // 否则 242 Next(17) style(14→15/15→16/16→30)
      const n = rn(3);
      if (n <= 1) {
        let n2 = rn(7);
        if (n2 === 6) n2 = rn(7);
      } else {
        tile = PAINTING;
        rn(17);
      }
    } else {
      // RandomBonePainting（:387-410）：Next(2)→0:240 style Next(2)(16/17)；1:241 style Next(9)
      const n = rn(2);
      if (n === 0) { tile = HANGING; rn(2); }
      else { tile = CATACOMB; rn(9); }
    }
    return tile;
  }
  // ============ DungeonGlobalBanners（:24-104）============
  function dgBanners(): void {
    const num3 = Math.trunc(200 * (w / 4200) * Math.max(1, 0.75));
    for (let i = 0; i < num3; i++) {
      let x = ri(bounds.L, bounds.R - 1);
      let y = ri(bounds.T, bounds.B - 1);
      let n6 = 1000;
      while (!isDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n6--;
        if (n6 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(bounds.T, bounds.B - 1);
      }
      n6 = 1000;
      while (!dgSolid(x, y) && y > 10) {
        n6--;
        if (n6 <= 0) break;
        y--;
      }
      y++;
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
      placeBannerD(x, y, BANNER, bannerStyles[num8]);   // ★PlaceBanner（cs:46270 竖 3 格）
    }
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
  dgLayout(num);
  // cs:374-396：最高已生成房 InnerBounds 顶部中心回写
  {
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
  entOnSurface = false;
  {
    const TT = (globalThis as { __dgTowerTrace?: Record<string, number | string> }).__dgTowerTrace;
    let curX = posX + 0.0, curY = posY + 0.0;               // currentPos（局部，不随 genVars）
    const dist = precalcOK ? Math.hypot(entX - curX, entY - curY) : 0.0;   // Vector2D.Distance
    let amountPassed = Math.trunc(dist);
    let roomDelay = 5, guard = 100;
    if (TT) { TT.dist = dist; TT.entX = entX; TT.entY = entY; TT.climb0 = dgMainRolls; TT.inserts = 0; TT.halls = 0; }
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
  }
  // MakeDungeon_GetEntrance（:450）——Tower=TowerDungeonEntrance（XX 批 1:1 转录）；
  // Dome=DomeDungeonEntrance（FFFF 批 2026-08-18 1:1 转录——XX 批备案的"Legacy 近似
  // 体"已退役；AAAA 批的 Dome 锚补丁同步本体化进 dgDomeEntrance 尾部）。
  // GetEntranceSettings 的 1 颗废弃掷在两支同位（settings.RandomSeed=Next() 后被
  // preSettings.RandomSeed 覆写）——tower/dome 支先 raw() 再传 entSeed。
  if (entKind === 2) { raw(); dgTowerEntrance(posX, posY, entSeed); }
  else if (entKind === 1) { raw(); dgDomeEntrance(posX, posY, entSeed); }
  else dgEntrance(raw(), entSeed);
  snap('dungeonE');
  for (const rm of rooms) if (rm.generated) roomPlatformsDoors(rm);
  for (const hl of halls) if (hl.generated) hallPlatformsDoors(hl);
  snap('dungeonPD');
  dgEarly(); snap('dungeonPi');
  dgSpikes(); snap('dungeonS');
  dgDoorsF(); snap('dungeonD');
  dgWallVariants(); snap('dungeonW');
  if (dgTW) dgTW.plat1 = dgMainRolls;
  dgPlatforms(); snap('dungeonP');
  dgBiomeChests(); snap('dungeonC');
  dgBookshelves(); snap('dungeonB');
  dgBasicChests(); snap('dungeonG');
  bounds.inflate(25);
  dgLights(); snap('dungeonI');
  dgTraps(); snap('dungeonT');
  dgFurniture(); snap('dungeonF');
  dgPaintings(); snap('dungeonPa');
  dgBanners(); snap('dungeonBa');
  snap('dungeon');
  // —— GenState 回填（消费端：Pyramids 回避带 / 刷怪门槛 / 老头锚）——
  // ★2026-08-16 审计：generatingDungeonPositionX 的**终值**是爬升入口走廊的终点
  //   （每条 LegacyEntranceDungeonHall 收尾都回写 genVars，LegacyEntranceDungeonHall.cs:367-368；
  //   MakeDungeon:394 的最高房中心 X 是中途瞬态，随即被爬升覆写）。Dungeon pass(#36)
  //   先于 Pyramids(#44)/LihzahrdTemple(#50)，cs:15450/:15994 读到的就是爬升终点=入口 X。
  //   曾回填 topX（把瞬态当终值）→ 金字塔回避带整体平移数百格。
  gs.generatingDungeonPositionX = posX;
  gs.dungeonY = dungeonY;
  gs.dungeonEntX = dungeonX; gs.dungeonEntY = dungeonY;
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

