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
import { wgSpawnNpc, type GenState } from './GenState';   // ★IIIII194 值引入（老头 wg 实体落地）
import { TILE_BY_KEY, TILE_DEFS, TILE_INTERNAL_BY_SHEET } from '../../../data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { tileRunner } from './TileRunner';
import { growTree } from './TreePass';
import { furnitureStyleBase } from '../../FurnitureStyle';
import { flipGenSolid, genSolidType, vanGenSolidType } from './GenSolid';
import { VAN_TILE_CUT, VAN_TILE_FRAME_IMPORTANT } from './VanillaTileFlags';   // ★IIIII215：原版 FI/CUT 真表
import { genSquareTileFrame } from './FinalCleanupPass';   // ★IIIII161：campfire PlaceTile 尾 SquareTileFrame 级联
import { runLavaLayerCaverer } from './LavaLayerCavererPass';
import { mayanTrap } from './TemplePass';
// 1457 地牢域对齐（docs/worldgen/dungeon-1457-alignment.md）：双地牢旗→行为接线
// （trap 窗口/潜在界域回填）+ GOTHIC 平台档（DungeonGlobalPlatforms.cs:42-45,仅帧通道）。
import { dualDungeonState, dualDungeonTrapWindow, createPotentialDungeonBounds, wallIsInStyle, tileIsInStyle, DungeonGenerationStyles, STYLE_PLAT_ITEM_IDS, PLAT_ITEM_STYLE } from './DungeonStyles1457';
import type { PotentialDungeonBounds } from './DungeonStyles1457'; // ★IIIII93b 双座 pb 面
// ★IIIII105b：风格家具 item 表（ItemID.Sets.DerivedPlacementDetails 提取域）
import { ITEM_PLACE, STYLE_LIGHTCHEST_TABLES, STYLE_DOOR_ITEM_TABLES, DOOR_ITEM_STYLE } from './DungeonStyleItems';   // ★105c 灯/箱/生物箱表 ★111c PD 门表
// ★LLL 批（2026-08-25）：placeTrap0 补 noTraps 巨石非实心窗（WorldGen.SetBoulderSolidity
//   经 GenSolid 全局表翻转,dgSolid/genSolidType 即见）——与 TrapsPass 同源单实现。
import { setBoulderSolidity, placePlate } from './TrapsPass';
// ★IIIII59：双地牢家族二件套（DungeonDropTrap/DungeonTileClump，1457=1458）——
// 结构位接线见 dgEarlyDualFamilies；现行一切链形参表下纯惰性零掷。
import { dropTrap as deDropTrap, tileClump as deTileClump } from './DungeonEarlyFeatures';
import { runDualDungeonLayout, dualRuggedEarlyFeatures, WINDOW_PLAT_ITEM_STYLE, i138EarlyGate } from './DungeonDualLayout';   // ★IIIII92 双地牢布局域 ★109b 早特征面 ★164 门单源化
import { registerChest, findLiveChest } from '../ChestRegistry';   // ★IIII102c 洞数组 sink
import type { SparseChestSink } from '../ChestRegistry';
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
// ★IIIII112：TileID.Sets.Clouds（TileID.cs:197）——DungeonDesertCleanup→FindLowestCloud
//   的活性格判定面（vanilla sheet 域→内部 id）
const DG_CLOUD_SHEETS = new Set(
  [189, 196, 460, 717, 718, 719].map((sh) => TILE_INTERNAL_BY_SHEET.get(sh)).filter((v) => v !== undefined),
);
const DG_FRAMED_NOT_CUT = new Set<number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  if (d?.vanilla?.sheet == null) continue;
  if (d.framed && !d.decor) DG_FRAMED_NOT_CUT.add(d.vanilla.sheet);
}
// 全量 tileFrameImportant（Main.cs 404 赋值 + AddEchoFurnitureTile 家族 + 循环 435-439 = 411；
// 与 FRAMED_NOT_CUT 不同：不扣 tileCut——GenerateDungeonStairs_CanPlaceTile 判定用全表，
// sheet 空间勿混入内部 id，比较走 TILE_DEFS[t]?.vanilla?.sheet）
// ★2026-09-03 表体抽出至 ./dungeonFramedSheets（叶子模块,TDZ 断环——NotTheBeesPass
//  顶层面读本表而本模块 import 子树回流 NTB,红蓝对抗 R4-F5a）。此处 re-export 兼容。
import { DG_FRAMED_ALL } from './dungeonFramedSheets';
export { DG_FRAMED_ALL };
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
  // ★IIIII188：dgBasicChests 表支/箱型支主件前缀池补全（PrefixLegacy.cs 集表逐 id 认证）
  //   ——211/212=accessory+CanGetPrefixes 缺省 true（ItemID.cs:179 异常表无此二 id）
  //   →'acc';213(Staff of Regrowth)∈SwordsHammersAxesPicks(:81);964∈GunsBows(:77);
  //   4281∈Summon(:75);670∈BoomerangsChakrams(:69);724∈Swords(:81);1319∈GunsBows(:77);
  //   6153∈Magic(:73);4061∈Spears(:79);4062∈Magic(:73)。缺登=Prefix(-1) 零掷 →
  //   每 jungle/flag2 主件少 1-2 骰（style8/9 ok 成本 x86 30.78/28.60 vs JS 23.48/24.40 实证）。
  211: 'acc', 212: 'acc', 213: 'swords', 964: 'guns', 4281: 'summon',
  670: 'boom', 724: 'swords', 1319: 'guns', 6153: 'magic', 4061: 'spears', 4062: 'magic',
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
  /** ★IIIII105c：房 StyleData.Style（GenerateDungeonRegularChest/BiomeChests_DualDungeons 消费）。
   *  普通世界未标注=0 → legacy Default 支逐位同。 */
  st?: number;
  /** ★IIIII111c：PD 面载荷——bio=BiomeDungeonRoom（fluff 3→0+SkipOther/SkipSpace=true）；
   *  forceDP=ForceStyleForDoorsAndPlatforms（LivingTree，DC.cs:646）。
   *  leg=LegacyDungeonRoom 实例（G 面受理窗支键,Rooms/LegacyDungeonRoom.cs:78-92 覆写；
   *  未标注（dgRoom 直造/climb 插入房）⇒ C# 同为 LegacyDungeonRoom=true）。 */
  bio?: boolean; forceDP?: boolean; leg?: boolean;
}
interface DHall {
  seed: number; generated: boolean; forceX: boolean; isEntrance: boolean;
  bounds: DBnd; sx: number; sy: number; ex: number; ey: number;
  sdx: number; sdy: number; edx: number; edy: number;
}
interface DDoor { x: number; y: number; dir: number; hall: boolean; skipOther: boolean; skipSpace: boolean; clear: boolean; fluff: number;
  /** ★IIIII111c：PD 面 OverrideStyle（≥0 才覆盖 writer 的 Next(3) 档位）；gsty=
   *  OverrideGenerationStyle（writer 的砖/墙换风格,DU.cs:97-104）。 */
  os?: number; gsty?: import('./DungeonStyles1457').DungeonStyleData; }
/** hf = OverrideHeightFluff（DungeonPlatformData.cs:14）：房间候选=3、走廊/入口候选缺省=5。
 *  XX 批（2026-08-18）扩：Tower/Dome 入口候选带 ForcePlacement + 置物概率
 *  （pots/bottles/books/candles——IsAShelf=任一>0（DungeonPlatformData.cs:34-43
 *  计算属性），书架链每列 1-3 道门掷 + 命中放置掷）。
 *  FFFF 批（2026-08-18）扩 nowb=NoWaterbolt（DungeonPlatformData.cs）：Dome 入口
 *  上对平台（num7-25）true / 下对（num7-20）false——false 时 books 命中先掷
 *  Next(50)（DU:432-435 默认支 waterbolt 门）。 */
interface DPlat { x: number; y: number; hall: boolean; hf: number;
  force?: boolean; pots?: number; bottles?: number; books?: number; candles?: number;
  nowb?: boolean;
  /** ★IIIII111c：PD 面 OverrideStyle（GetPlatformStyle 掷,≥0 覆盖座平台档位）。 */
  os?: number; }

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
  DG_JUNGLE_CHEST_COUNT = 0;                              // ★105c：GenVars.JungleItemCount 每世界复位
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
      // ★IIIII112（cs:286-303）：下爬起点 y 三态门补「被埋」支——cs 序为
      //   num2=10；`if(DungeonEntranceIsBuried) num2=(int)worldSurface-10+BuriedEntranceYOffset`
      //   （DungeonEntranceIsBuried=surfaceIsDesert&&!IsUnderground，SpecialSeedFeatures.cs:53-59；
      //    Tower/Dome 的 BuriedEntranceYOffset=20+dualNum，DC.cs:831/:846/:852）；随后
      //   `if(IsUnderground) num2=…rockLayer-20…` 覆写。此前 JS 只有 drunk 支 ⇒ sandy 塔墩
      //   类入口下爬自地表以上起扫、落点与尝试耗骰双差（首差即结构级联的全域移位）。
      const eBuriedF = !!gs.seedFlags.surfaceIsDesert && !gs.seedFlags.noSurface && !gs.seedFlags.drunkWorld;
      const nyStart = eBuriedF ? Math.trunc(ws) - 10 + 20 + (IS_DUAL ? 30 : 0)
        : (gs.seedFlags.drunkWorld ? Math.trunc(gs.genRockLayer) - 20 : 10);
      while (true) {
        tries--;
        if (tries <= 0) break;
        const nx = locK - 100 + rn(200);
        if (nx > BEACH && nx < w - BEACH) {
          let ny = nyStart;                  // cs:num2 每 attempt 重置（:295-303）
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
  // ★IIIII108c 第④刀：DropTrap 成功盒（dual S5-S7 deDropTrap 上报；CanGenerateFeatureAt
  //   恒 false ⇒ 全特征拒收区）。普通世界零追加=零扰动。
  const dropBoxes: DBnd[] = [];
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
  // ★IIIII188：CurrentDungeonGenVars.desertChestLootState（DungeonGenVars.cs:66,每座
  //  一份,初值 false）——flag3 沙漠支（WG.cs:36416-36418）取反翻转选 loot 池,零掷。
  let desertChestLootState = false;
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
  // ★IIIII112（cs:14878-14882）：sandy britches（surfaceIsDesert）被埋地牢入口的
  //   沙「挖空臂」——每座 MakeDungeon 前必跑（首座 :14881，dual 座循环 :14931 同臂）。
  //   此前 JS 整缺：功能面=门口上方漏斗形掏空（行内 tile.active(false)+本/下行
  //   wall 清零），掷账面=Next(25,46)×1 + 每行 num2/num3 各一掷——缺掷令 MakeDungeon
  //   全部骰位整体后移（#32 双向砖体级联的定罪链；IIIII112 批窗口对拍实证）。
  //   offset=preGenDungeonEntranceSettings.BuriedEntranceSandDugoutYOffset=−num，
  //   num=0（普通）/30（dualDungeons）（DC.cs:831/:840/:846/:852）。
  /** DungeonDesertCleanup（WorldGen.cs:35531-35557）：自 num 起逐行上掏至
   *  FindLowestCloud()（cs:25637：y∈[20,worldSurface) 行扫 x∈[20,maxTilesX−20)
   *  任一活性 Clouds{189,196,460,717,718,719} 格，取最下一行、无云 0；sandy 链在
   *  本调用前全管线无 FindLowestCloud 前序消费点（Corruption :13939 只在
   *  surfaceIsInSpace 分支、DoSurfaceIsDesertFinish 属收尾段在 Dungeon 之后）——
   *  fresh 计算与 GenVars.lowestCloud 缓存同值）。行尾 num-- 且 num2/num3=半宽：
   *  <20 加 Next(4,5)（恒 4）、<40 加 Next(2,4)、其余加 Next(1,3)，两计各一掷。 */
  const dgDesertCleanup = (x: number): void => {
    const offset = IS_DUAL ? 30 : 0;
    let num = Math.trunc(ws) - 10 - offset - ri(25, 45);
    let num2 = 1, num3 = 1;
    const cloudLowest = (() => {
      let lowest = 0;
      for (let yy = 20; yy < ws; yy++) {
        for (let xx = 20; xx < w - 20; xx++) {
          const qi = st.idx(xx, yy);
          if (st.flags[qi] && DG_CLOUD_SHEETS.has(st.type[qi])) { lowest = yy; break; }
        }
      }
      return lowest;
    })();
    while (num > cloudLowest) {
      for (let i = x - num2; i <= x + num3; i++) {
        if (i >= 5 && i < w - 5 && num >= 5 && num < h - 5) {          // InWorld(i,num,5)
          const ti = st.idx(i, num);
          st.flags[ti] &= ~1;                                          // tile.active(active:false)
          st.wall[ti] = 0;
          st.wall[st.idx(i, num + 1)] = 0;                             // tile2.wall=0
        }
      }
      num--;
      num2 += num2 >= 20 ? ((num2 >= 40) ? ri(1, 2) : ri(2, 3)) : ri(4, 4);
      num3 += num3 >= 20 ? ((num3 >= 40) ? ri(1, 2) : ri(2, 3)) : ri(4, 4);
    }
  };
  if (gs.seedFlags.surfaceIsDesert) {
    dgDesertCleanup(dgLoc);
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
    entExists = true;
    // ★IIIII211：入口分段窗仪（SW_I211WW 门,零掷）——楔区 x[620,700)y[275,340) 状态
    //   逐段 emit,定位 (41,7,alive) 楔格写入段（x86 该域=stage-2 清空后的 (38,7,dead) 残迹）。
    const wwOn = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I211WW === '1';
    const ww = (tag: string): void => {
      if (!wwOn) return;
      const i211w = (globalThis as unknown as { __swI211?: (line: string) => void }).__swI211;
      if (!i211w) return;
      const cnt: Record<string, number> = {};
      for (let x = 620; x < 700; x++) {
        for (let y = 275; y < 340; y++) {
          if (!st.inBounds(x, y)) continue;
          const ti = st.idx(x, y);
          const k = `t${TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1}w${st.wall[ti]}a${st.flags[ti] & 1}`;
          cnt[k] = (cnt[k] ?? 0) + 1;
        }
      }
      const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([k, v]) => `${k}:${v}`).join('|');
      i211w(`I211|WW|${tag}|${top}`);
    };
    ww('start');
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
    ww('mass');
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
    ww('battress');
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
    ww('teeth');
    // 下延到 worldSurface（非 dual）/dual=砖承 cutoff（cs:243-251：num21=Main.worldSurface，
    //   data.Type==DualDungeon → num21=GetDualDungeonBrickSupportCutoffY(data)=
    //   outerPotentialDungeonBounds.Top−(DungeonEntranceIsUnderground?5:10)（SPF.cs:65-75
    //   underground=drunk∨noSurface）；TileIsInStyle 判定 + InAnyPotentialDungeonBounds(x,y−5)
    //   潜在带跳过（JS potContains=本座 pb,两座 pb 恒异侧不相交=行为等价,备案）。
    // ★IIIII206：dual 支整缺（曾恒 worldSurface）⇒ 入口阶梯楔 y∈[ws,cutoff) 侧翼
    //   brick/wall 带整缺（座1 实测 ~5.2k 格,x557-776/y296-336）→ SPIKES 起掷流错位
    //   放大（座1 后段净 +27,101）→ 座2 入口房 Next(20) 变值 → 座2 布局整体重洗（#33 根因链）。
    const dgeUg = !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface;   // SPF.DungeonEntranceIsUnderground
    const dgeFill21 = isDualWorld ? potT - (dgeUg ? 5 : 10) : ws;
    for (let x = n3; x < n4; x++) {
      for (let y = n5; y < dgeFill21; y++) {
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
    ww('fill21');
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
    ww('halfbox');
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
    ww('sec2');
    entBounds.upd(n3, n5, n4, Math.trunc(ws));
    // ★IIIII206：第二段下延 dual 支（cs:398-414：num31=Main.worldSurface；
    //   data.Type==DualDungeon → num31=CurrentDungeonData.genVars.outerPotentialDungeonBounds.Top
    //   **−5 直取**（不经 GetDualDungeonBrickSupportCutoffY,无 underground 再分叉）；
    //   Bounds.UpdateBounds 末参仍恒 (int)Main.worldSurface（:396）——仅填充环界变。
    const dgeFill31 = isDualWorld ? potT - 5 : ws;
    for (let x = n3; x < n4; x++) {
      for (let y = n6; y < dgeFill31; y++) {
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
    ww('fill31');
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
    ww('sec2bt');
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
      // ★IIIII194：SetOldManSpawnAndSpawnOldManIfDefaultDungeon(generating:true) 后段
      //   （DungeonUtils.cs:1664-1672，CurrentDungeon==0 ⇔ instIdx===0）——老头实体落地：
      //   NewNPC(37) @ Bottom(dungeonX*16+8, dungeonY*16) → 左上 (X−9, Y−40)（18×40）。
      //   生成期无 AI 更新（x86 rig 逐 pass 普查位置恒定）；EmptyTile 实体支消费者=
      //   SurfaceDecorPasses 1b bubble 写环（#75 三格残差裁决实证 /tmp/iii194-out）。
      if (instIdx === 0) wgSpawnNpc(gs, 37, dungeonX * 16 + 8, dungeonY * 16, 18, 40);
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
      // ★IIIII206：cutoff 的 underground 臂=drunk∨noSurface（SPF.cs:65-75）——曾只认
      //   drunk,noSurface 世界台阶深度差 5（GetDualDungeonBrickSupportCutoffY 消费点同族）。
      const stdep = ((dgeUg ? potT - 5 : potT - 10)) - stj + 5;
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
    ww('end');
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
    let ehS = 0, ehL = 0, ehT = 0, ehR = 0, ehB = 0;      // ★IIIII168 bbox 快照暂存（零掷）
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
    // ★IIIII168 bbox 快照钩（dormant,零掷）——与 x86 rig climb LegacyEntrance 厅
    //   eh{seq}a/b 同位（'a'=CalculateHall(pass0) 后 Bounds,'b'=GenerateHall(pass1) 后,
    //   域固定取 'a' 时刻值）。seq 与 x86 JJHook.BbSeq 同序（cl/eh 交替 ++）。
    const bbEh = (globalThis as { __swI168BB?: (tag: string, l: number, t: number, r: number, b: number) => void }).__swI168BB;
    if (bbEh) {
      if (dryP === 0) {
        const gsB = globalThis as { __swI168BBSeq?: number };
        gsB.__swI168BBSeq = (gsB.__swI168BBSeq ?? 0) + 1;
        ehS = gsB.__swI168BBSeq;
        ehL = hb.L; ehT = hb.T; ehR = hb.R; ehB = hb.B;
        bbEh(`eh${ehS}a`, ehL, ehT, ehR, ehB);
      } else {
        bbEh(`eh${ehS}b`, ehL, ehT, ehR, ehB);
      }
    }
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
    smoothTop: boolean, smoothBottom: boolean, always: boolean, inact = false,
    // ★IIIII109b：结构房柱面扩展（BiomeStructuredDungeonRoom → DungeonPillar）——
    // styBrick=风格砖（−1=旧全局 brick）；styPaint=风格 TilePaintColor（−1=null 不写漆）；
    // solidTop/solidBottom=BlockActuatedSolidTop/Bottom 的 ±2 inActive 豁免
    // （DungeonPillar.cs:151 `(!flag2||j>=num3+2)&&(!flag3||j<=num4-2)&&flag4`）。
    styBrick = -1, styPaint = -1, solidTop = false, solidBottom = false): [number, number] {
    const styTile = styBrick >= 0 ? styBrick : brick;
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
        st.flags[ti] = 1; st.type[ti] = styTile; st.slope[ti] = 0; st.half[ti] = 0;
        st.wire[ti] &= ~32;
        if (styPaint > 0) st.paint[ti] = styPaint & 0xff;
        if ((j === lo && smoothTop) || (j === hi && smoothBottom)) dgSmoothSlope(px, cy);
        // MMMM 批：DungeonPillar.GenerateTileStrip :151-154/:200-203——BlockActuated 族
        //   平滑后置 inActive(true)（wire bit5；SolidTop/Bottom 变体的 ±2 豁免不涉 Dome/Tower）
        //   ★IIIII109b：SolidTop/Bottom 豁免随结构房柱面接入（j 域钳制）
        if (inact && (!solidTop || j >= lo + 2) && (!solidBottom || j <= hi - 2)) st.wire[ti] |= 32;
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
        st.flags[ti] = 1; st.type[ti] = styTile; st.slope[ti] = 0; st.half[ti] = 0;
        st.wire[ti] &= ~32;
        if (styPaint > 0) st.paint[ti] = styPaint & 0xff;
        if ((j === lo && smoothTop) || (j === hi && smoothBottom)) dgSmoothSlope(px, cy);
        if (inact && (!solidTop || j >= lo + 2) && (!solidBottom || j <= hi - 2)) st.wire[ti] |= 32;
        if (cy < topY) topY = cy;
        if (cy > bottomY) bottomY = cy;
      }
    }
    return [topY, bottomY];
  }
  // DungeonPillar.Pillar（:28-84）——逐列主带（height，crownStops=false→crown 高 0=
  // 自动扫描）+ 顶/底冠（k==0/-1 列外扩 1，num=3 间距；smoothBottom/Top:true）
  function dgPillar(px: number, py: number, width: number, crownTop: boolean, crownBottom: boolean,
    height: number, always: boolean, inact = false, styBrick = -1, styPaint = -1,
    solidTop = false, solidBottom = false): void {
    const num = 3;
    for (let k = 0; k < width; k++) {
      const cx = px + k - Math.trunc(width / 2);
      const [topY2, bottomY] = dgPillarStrip(cx, py, height, true, false, false, always, inact, styBrick, styPaint, solidTop, solidBottom);
      if (crownTop) {
        if (k === 0) dgPillarStrip(cx - 1, topY2 + num, 0, true, false, true, always, inact, styBrick, styPaint, solidTop, solidBottom);
        else if (k === width - 1) dgPillarStrip(cx + 1, topY2 + num, 0, true, false, true, always, inact, styBrick, styPaint, solidTop, solidBottom);
      }
      if (crownBottom) {
        if (k === 0) dgPillarStrip(cx - 1, bottomY - num, 0, false, true, false, always, inact, styBrick, styPaint, solidTop, solidBottom);
        else if (k === width - 1) dgPillarStrip(cx + 1, bottomY - num, 0, false, true, false, always, inact, styBrick, styPaint, solidTop, solidBottom);
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
    if (py - 11 >= 10 && CAMPFIRE > 0) {
      // ★IIIII161：PlaceTile case 215（cs:60621-60627）= Place3x2 + SquareTileFrame——
      //   SquareTileFrame **无条件**跟在 Place3x2 之后（净空受阻也级联）——x86 rig 实证：
      //   塔 P=357 篝火盒被 active t165 钟乳石阻置(ok=False)仍 STF → TileFrame 3×3 →
      //   CheckStalactite 失承杀 (357,495 fY=36)/(357,496 fY=54)/(358,496 fY=90)
      //   三格＝GFB #32 家族-α「T0>165×3」真源。
      //   post-switch active-anchor 支（cs:60887-60893）：锚格 active → 再 STF+result=true。
      //   零掷（x86 ENTR 段 472 样点全账无 framing 掷；destroyObject 杀无尘掷）。
      place3x2D(px, py - 11, CAMPFIRE);
      genSquareTileFrame(st, rng, px, py - 11);
      if (actAt(px, py - 11) !== 0) genSquareTileFrame(st, rng, px, py - 11);
    }
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
  // ★IIIII109（2026-09-01）：glassPaint 面（OverrideGlassPaint→Window_Skeletron paint 参）。
  //   Window_Skeletron 对玻璃格恒 wallColor(paint>0?paint:0)、对边缘/描线格恒 wallColor(0)
  //   （DungeonWindowMosaic.cs:70-77/:80-96/:111-137）。x86 rig 插桩实证（i139 trace）：
  //   invis 塔 mosaic@ (777,135) 共写 288 格=204 格 89+p26 ∪ 84 格 edge=9+c0（嘴眼腔
  //   即描线写入体），随后无任何回改——八通道 W 全等、唯 Pw 差的纯漆面残差由此闭环。
  function dgWindowMosaicSkel(px: number, py: number, glass: number, glassPaint = 0): void {
    const gpE = glassPaint > 0 ? glassPaint : 0;   // Mosaic.Window :39 byte((ovp>0)?ovp:0)
    const box = new DBnd(w, h);
    box.set(px, py, px + 1, py + 1);              // Mosaic: SetBounds(placeX,placeY,placeX+1,placeY+1)
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) {
        const ti = st.idx(x, y);
        st.wall[ti] = v;
        st.paintWall[ti] = v === glass ? gpE : 0;
        box.upd(x, y);
      }
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
  // ★IIIII109：同 Skeletron 接 glassPaint 参（Tower/Dome MoonLord 分支不注 OverrideGlassPaint
  //   ⇒ 调用点传 0；玻璃格 wallColor(0)、边缘格 wallColor(0) 与 CS 恒等）
  function dgWindowMosaicMoon(px: number, py: number, glass: number, glassPaint = 0): void {
    const gpE = glassPaint > 0 ? glassPaint : 0;
    const box = new DBnd(w, h);
    box.set(px, py, px + 1, py + 1);              // Mosaic: SetBounds(placeX,placeY,placeX+1,placeY+1)
    const setW = (x: number, y: number, v: number): void => {
      if (st.inBounds(x, y)) {
        const ti = st.idx(x, y);
        st.wall[ti] = v;
        st.paintWall[ti] = v === glass ? gpE : 0;
        box.upd(x, y);
      }
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
  // ★IIIII112：补 buried 形参（DomeDungeonEntrance.cs:485-502 / TowerDungeonEntrance.cs:507-524
  //  两体逐行同源）——buried 支三件：①跨度 num+=2(右门)/num2-=2(左门) ②wall=0 清墙支整跳
  //  ③PlaceTile 玻璃点不变。此前恒按 !buried 口径跑 ⇒ sandy 被埋穹门右侧多清 2×3 沙岩窗。
  function dgTowerDoor(i: number, floorY: number, outer: number, inner: number, left: boolean, buried: boolean): void {
    let num = left ? inner - 1 : -outer - 2;
    let num2 = left ? outer + 2 : -inner + 1;
    if (buried) {
      num += (!left) ? 2 : 0;
      num2 += left ? -2 : 0;
    }
    const p1x = i + (left ? outer - 1 : -outer + 1);
    const p2x = i + (left ? inner + 1 : -inner - 1);
    for (let j = num; j <= num2; j++) {
      for (let k = -3; k <= 1; k++) {
        const x = i + j, y = floorY + k;
        if (!st.inBounds(x, y)) continue;
        const ti = st.idx(x, y);
        if (!buried && ((left && x >= p1x) || (!left && x <= p1x))) st.wall[ti] = 0;
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
    const n7 = j - 30;                            // 塔基线（num7=j-num6, num6=30）
    // ★IIIII206：dual 支接线（TowerDungeonEntrance.cs:97-103：if(Type==DualDungeon)
    //   num5=GetDualDungeonBrickSupportCutoffY(data)-num7; else if(underground)
    //   num5=num17-m+5=45——原 JS 只接 underground 支,dual 支登记待接线）。
    const n5 = isDualWorld ? (potT - (entUnderground ? 5 : 10) - n7)
      : (entUnderground ? (50 - 10 + 5) : 100);
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
        // ★IIIII109：OverrideGlassPaint=26 无条件（TED.cs:465）——Pw26 首例真债（Tower 入口）
        dgWindowMosaicSkel(i, n30 - 1, entUnderground ? winGlassClosed : 89, 26);   // Override=89 仅非地下
      } else {
        dgWindowMosaicMoon(i, n30 + 5, entUnderground ? winGlassClosed : 91);
      }
      dgWindowBasic(i - 8, n7 - 16, 9, 24, twG);
      dgWindowBasic(i + 8, n7 - 16, 9, 24, twG);
      dgWindowBasic(i - 10, n7 - 37, 7, 11, twG);
      dgWindowBasic(i + 10, n7 - 37, 7, 11, twG);
      dgWindowBasic(i, n7 - 39, 7, 13, twG);
    }

    // 双侧门洞（:431-433/:489-490 无条件双门）★IIIII112 补 buried 形参
    dgTowerDoor(i, n7, n4, n3, leftSide, entBuried);
    dgTowerDoor(i, n7, n4, n3, !leftSide, entBuried);
    // 老头锚（SetOldManSpawnAndSpawnOldManIfDefaultDungeon :1659——dungeonX/Y=(i,num7)）
    dungeonX = i; dungeonY = n7;
    // ★IIIII98b2：FTW NewNPC 头 Next(3) 主流掷镜像（同 legacy 锚注释；Tower :492）
    if (instIdx === 0 && gs.seedFlags.getGoodWorld) rn(3);
    // ★IIIII194：老头实体落地（同 legacy 锚注；Tower 入口 DungeonUtils.cs:1664-1672）
    if (instIdx === 0) wgSpawnNpc(gs, 37, dungeonX * 16 + 8, dungeonY * 16, 18, 40);
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
    const n2 = 5, n3 = 35, n4 = 40;
    const n7 = j - 30;                             // 基线（num6=30，cs:81）
    // ★IIIII206：cs:85-91 if(Type==DualDungeon){num5=GetDualDungeonBrickSupportCutoffY(data)
    //   -num7} else if(underground){num5=num8-m+5=45}——dual/underground 两支整缺（曾恒 100；
    //   旧备案「特典支不接线」清偿）。n7 提前定义仅为取值依赖,声明序与掷流无关。
    const dgeUgD = !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface;
    const n5 = isDualWorld ? (potT - (dgeUgD ? 5 : 10) - n7)
      : (dgeUgD ? 45 : 100);
    const num18 = n7 + 1;                          // cs:239
    // 地表侧圆清 Circle(20)（cs:93-102——Tower 是 Circle(15)@±num3，Dome 半径 20@±num4；
    // ★IIIII21：drunk 入口地下 → 门恒假 → 整段跳过；★IIIII112（cs:95）：门原文=
    //   `!dungeonEntranceIsBuried && !dungeonEntranceIsUnderground`——buried（sandy 被埋
    //   穹顶）同样整跳。此前只挡 drunk ⇒ JS 把穹顶右侧沙带 Circle 清空（T53/L255 残差带）。
    {
      const ugD = !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface;
      const buriedD = !!gs.seedFlags.surfaceIsDesert && !ugD;
      if (!buriedD && !ugD) {
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
    // ③表土穹丘（cs:254-261）：Slime(40,0.9,1.1)@(i,n7-4) y<n7-1 且非砖/非主墙 → 清+置土。
    //   ★IIIII112（cs:287-302）：`num19=0,num20=2; if(surfaceIsDesert){num19=53;num20=-1}`
    //   —— sandy 世界穹壳表土改写【沙(53)】且草皮臂整跳（num20=-1 ⇒ OnlyTiles+IsTouchingAir
    //   → SetTile(2) 的 Gen 不执行）；此前 JS 只有 vanilla 土/草两臂 ⇒ 穹丘土/草 vs x86 沙。
    const domeSurfaceDesert = !!gs.seedFlags.surfaceIsDesert;
    const entUgDome = !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface;   // DungeonEntranceIsUnderground
    const domeBuried = !!gs.seedFlags.surfaceIsDesert && !entUgDome;           // DungeonEntranceIsBuried
    const SANDV = TILE_INTERNAL_BY_SHEET.get(53) ?? -1;
    slime(i, n7 - n2 + 1, n4, 0.9, 1.1, (x, y) => {
      if (y >= num18 - 2 || !st.inBounds(x, y)) return;
      const ti = st.idx(x, y);
      if (st.flags[ti] !== 0 && st.type[ti] === brick) return;   // SkipTiles(brickTileType)
      if (st.wall[ti] === wall) return;                          // SkipWalls(brickWallType)
      clrAll(ti);
      st.flags[ti] = 1; st.type[ti] = domeSurfaceDesert ? SANDV : DIRT;
    });
    // ④草皮（cs:255-258→cs:299-302）：同形状 OnlyTiles(num19)+IsTouchingAir(对角) →
    //   SetTile(num20)；desert num20=-1 / underground ⇒ 双跳。
    if (!domeSurfaceDesert && !entUgDome) {
      slime(i, n7 - n2 + 1, n4, 0.9, 1.1, (x, y) => {
        if (y >= num18 - 2 || !st.inBounds(x, y)) return;
        const ti = st.idx(x, y);
        if (st.flags[ti] === 0 || st.type[ti] !== DIRT) return;    // OnlyTiles(num19)
        if (!exposedToAir(x, y)) return;                           // IsTouchingAir(useDiagonals:true)
        st.flags[ti] = 1; st.type[ti] = GRASS;
      });
    }
    // ⑤内腔清块（cs:262）：Slime(35,1,1)@(i,n7) y<n7+1 → ClearTile（保墙）
    slime(i, n7, n3, 1.0, 1.0, (x, y) => {
      if (y >= num18 || !st.inBounds(x, y)) return;
      const ti = st.idx(x, y);
      st.flags[ti] = 0; st.slope[ti] = 0; st.half[ti] = 0;       // Actions.ClearTile→Tile.ClearTile（亦清 inActive；本段在柱族①之前无交叉）
    });
    // 门（cs:264-271）：DomeEntrance_Door 与 TowerEntrance_Door 逐行同源——正常种子
    //   仅 dungeon 侧单门（buried/underground 特典才补镜像门）
    //   ★IIIII21：drunk=入口地下 → `buried|underground` 支（cs:309-311）追加对侧门
    dgTowerDoor(i, n7, n4, n3, leftSide, domeBuried);
    if (domeBuried || entUgDome) {          // cs:309-311 `buried | underground` 补镜像门
      dgTowerDoor(i, n7, n4, n3, !leftSide, domeBuried);
    }
    // 窗族（cs:272-343）——Dome 点位（Basic 宽恒 5；★IIIII109 Mosaic 已建模 glassPaint，
    //   Dome Basic 对 paint26 仍未建模——Dome+windowType1/2 组合在四涂装链基线 P/Pw
    //   全程零差，未见触发样本，如现新种子红再扩 dgWindowBasic 参）
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
        // ★IIIII109：Dome Skeletron 分支同注 OverrideGlassPaint=26（DDD.cs:349 前行）
        dgWindowMosaicSkel(i, n7 - 19, 89, 26);      // OverrideGlassType=89（非 underground）
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
    // ★IIIII194：老头实体落地（同 legacy 锚注；Dome 入口 DungeonUtils.cs:1664-1672）
    if (instIdx === 0) wgSpawnNpc(gs, 37, dungeonX * 16 + 8, dungeonY * 16, 18, 40);
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
        // ★IIIII211 定罪刀（DU.cs:1289-1298 二段查）：flag 先查 dungeonStyle.WallIsInStyle，
        //   失败再【遍历本座 dungeonGenerationStyles 全员】WallIsInStyle（=BrickWallType
        //   相等,cs:131-150 默认参）。dual 座=四族墙 {349,3,64,7}——曾只查 Default(7) ⇒
        //   蛇厅幽灵格(38,349,dead) 走 else 支被激活成 (41,7,alive) 250+36 格（座1 楔区
        //   x641-660/y281-336 实测）,PD 写面 296 格残差→SPIKES −170→掷流错位→座2 布局
        //   重洗（#33 根因链首环）。单样式世界 gfStyles=[]/仅 Default ⇒ 循环恒 no-op
        //   （掷流/写面零扰动）。
        let wv211 = wallAt(m, n);
        let fl = wv211 === wall;                           // dungeonStyle.WallIsInStyle
        if (!fl) {
          for (const s211 of gfStyles) {
            if (wv211 === s211.BrickWallType) { fl = true; break; }
          }
        }
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
  // CalculatePlatformsAndDoorsOnEdgesOfRoom（DungeonUtils.cs:91-224，房间 fluff=3/砖房 0）
  // ★IIIII111c 掷位落地（PD −765 主刀）：①平台闩锁 OverrideStyle=GetPlatformStyle
  //   （DU.cs:150-158——发现 Inactive 格才掷、空表不掷）②门样式 num5=DoorItemTypes[
  //   Next(len)]（DU.cs:131 每房恰一次；Style==0∨空表不掷）③非 ForceStyle 房按房心格
  //   三级解析（墙→活性砖→genVars.dungeonStyle，DU.cs:69-84）。
  const PD_STUB = { Style: 0, PlatformItemTypes: [] as number[] };   // gfStyles 未装配面（普通世界恒零掷）
  type PDStyle = import('./DungeonStyles1457').DungeonStyleData | typeof PD_STUB;
  const __pdCnt: Record<string, number> = (globalThis as { __pdCnt?: Record<string, number> }).__pdCnt ??= {};
  const __pdTag = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I152_PD === '1';
  // ★IIIII118：段内仪具（SW_I158_PDC 门控,零掷）——PD 收集流 PDC-*/D 门 REJ-PLC/B 段 attempt 流 BATT-*。
  //   镜像 x86 rig（/tmp/i158-rig-src）同名 marks；console.log 线由采集器按前缀收（|mr= 自动附）。
  const I158PDC = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I158_PDC === '1';
  const i158Log = (ln: string): void => { if (I158PDC) console.log(ln); };
  const pdGetPlatformStyle = (sty: PDStyle, tag = 'hp'): number => {
    // ⚠ C# GetCurrentDungeonStyle（DC.cs:699）的 Default style0 对象
    //  PlatformItemTypes=new int[0]（空表,恒 -1 不掷）——JS 的 DungeonStyleData.
    //  PlatformItemTypes 被【窗台】WindowPlatformItemTypes([1386]族)占用（S9 窗面消费,
    //  勿动),故 PD 面在此按 Style===0 早退等效空表。
    if (sty.Style === 0) return -1;
    // ★IIIII118：改用真实 PlatformItemTypes（item id 域,STYLE_PLAT_ITEM_IDS）——
    //   sty.PlatformItemTypes 字段被窗台项占用,曾致 biome 样式 os 值全错（x86 50 vs JS 0）。
    const tbl = STYLE_PLAT_ITEM_IDS[sty.Style];
    if (!tbl || tbl.length === 0) return -1;
    const it = tbl[rn(tbl.length)]!;
    if (__pdTag) __pdCnt[tag] = (__pdCnt[tag] ?? 0) + 1;
    return PLAT_ITEM_STYLE[it] ?? -1;                       // DerivedPlacementDetails.tileStyle
  };
  const pdDoorNum5 = (sty: PDStyle, tag = 'hd'): number => {
    const tbl = STYLE_DOOR_ITEM_TABLES[sty.Style];
    if (tbl === undefined || tbl === null) return -1;       // DoorItemTypes==null 早退（本域无此档）
    if (sty.Style === 0 || tbl.length === 0) return -1;     // flag ∨ len==0 → 不掷（DU.cs:131）
    const it = tbl[rn(tbl.length)]!;
    if (__pdTag) __pdCnt[tag === 'rp' ? 'rd' : 'hd'] = (__pdCnt[tag === 'rp' ? 'rd' : 'hd'] ?? 0) + 1;
    return DOOR_ITEM_STYLE[it] ?? -1;
  };
  /** 房心/廊点三级解析（DU.cs:69-84）：GetStyleForWall → GetStyleForTile →
   *  genVars.dungeonStyle。返回 null=InWorld(center,5) 失败=整房早退零掷。 */
  const pdResolveStyle = (cx: number, cy: number, forceSty: import('./DungeonStyles1457').DungeonStyleData | null): PDStyle | null => {
    if (forceSty) return forceSty;
    if (!inW(cx, cy, 5)) return null;
    const qi = st.idx(cx, cy);
    const wl = st.wall[qi];
    let sty = gfStyles.length > 0 ? gfStyleForWall(wl) : null;
    if (sty === null && (st.flags[qi] & 1) !== 0) {
      const sheet = TILE_DEFS[st.type[qi]]?.vanilla?.sheet ?? -1;
      if (sheet >= 0) {
        styLoop: for (const s0 of gfStyles) {
          if (tileIsInStyle(s0, sheet, false, true)) { sty = s0; break; }
          if (s0.SubStyles !== undefined && s0.SubStyles.length > 0) {
            for (const ss of s0.SubStyles) {
              if (tileIsInStyle(ss, sheet, false, true)) { sty = ss; break styLoop; }
            }
          }
        }
      }
    }
    return sty ?? (gfDefaultStyle ?? (gfStyles.length > 0 ? gfStyles[gfStyles.length - 1]! : PD_STUB));
  };
  /** 走廊单点分派（DU.cs:211-269）：|dirY|<=0.1 门支（DoorItemTypes!=null 恒入,
   *  num5 非 Style0∧非空表才掷）否则平台支（GetPlatformStyle 一掷）。 */
  const pdHallPoint = (px: number, py: number, dirY: number, forceSty: import('./DungeonStyles1457').DungeonStyleData | null): void => {
    const sty = pdResolveStyle(px, py, forceSty);
    if (__pdTag) {
      const c2 = __pdCnt;
      c2.pts = (c2.pts ?? 0) + 1;
      c2['sty' + (sty === null ? 'X' : sty.Style)] = (c2['sty' + (sty === null ? 'X' : sty.Style)] ?? 0) + 1;
    }
    if (sty === null) return;
    i158Log(`PDC-H s=${instIdx + 1} x=${px} y=${py} dy=${dirY} sty=${sty.Style}`);
    if (Math.abs(dirY) <= 0.1) {
      const num5 = pdDoorNum5(sty, 'hp');
      const d: DDoor = { x: px, y: py, dir: 0, hall: true, skipOther: false, skipSpace: false, clear: true, fluff: 10, gsty: sty.Style === 0 ? undefined : (sty as import('./DungeonStyles1457').DungeonStyleData) };
      if (num5 >= 0) d.os = num5;
      doorData.push(d);
      i158Log(`PDC-DH s=${instIdx + 1} x=${px} y=${py} os=${num5}`);
    } else {
      const os = pdGetPlatformStyle(sty, 'hp');
      const p: DPlat = { x: px, y: py, hall: true, hf: 5 };
      if (os >= 0) p.os = os;
      platData.push(p);
      i158Log(`PDC-PH s=${instIdx + 1} x=${px} y=${py} os=${os}`);
    }
  };
  function roomPlatformsDoors(rm: DRoom): void {
    // 房心三级解析（ForceStyle 房直接用 settings.StyleData；DU.cs:69-84）
    // ★IIIII118 定罪：force 查找必须**含 SubStyles**——LivingWood(13)/Beehive(14) 等
    //   专用房 rm.st 是子样式号，不在 gfStyles 顶表（=[Cavern,Crimson,Jungle,blue]）；
    //   C# 直传 settings.StyleData 对象无查找 ⇒ 曾 find 落空回退 Default(0)，
    //   房心样式解析/门表/平台表全错（LivingWood 房 os/门表位移,PD 收集流首差）。
    const cx = Math.trunc((rm.inner.L + rm.inner.R) / 2), cy = Math.trunc((rm.inner.T + rm.inner.B) / 2);
    const gfForceSty = rm.forceDP === true ? (() => {
      for (const s0 of gfStyles) {
        if (s0.Style === rm.st) return s0;
        for (const ss of s0.SubStyles ?? []) if (ss.Style === rm.st) return ss;
      }
      return gfDefaultStyle ?? null;
    })() : null;
    const sty = pdResolveStyle(cx, cy, gfForceSty);
    if (sty === null) return;
    // 平台闩锁（顶先于底,x 扫描序内先到先掷,DU.cs:99-125）
    const num = Math.max(5, rm.inner.L), num2 = Math.min(w - 5, rm.inner.R);
    const num3 = Math.max(5, rm.inner.T), num4 = Math.min(h - 5, rm.inner.B);
    i158Log(`PDC-R s=${instIdx + 1} L=${num} R=${num2} T=${num3} B=${num4} sty=${sty.Style}`);
    let f2 = false, f3 = false;
    for (let x = num; x <= num2; x++) {
      if (!f2 && inW(x, num3 - 1, 0) && actAt(x, num3 - 1) === 0) {
        const p: DPlat = { x, y: num3 - 1, hall: false, hf: rm.bio === true ? 0 : 3 };
        const os = pdGetPlatformStyle(sty, 'rp');
        if (os >= 0) p.os = os;
        platData.push(p); f2 = true;
        i158Log(`PDC-P s=${instIdx + 1} x=${p.x} y=${p.y} os=${os}`);
      }
      if (!f3 && inW(x, num4 + 1, 0) && actAt(x, num4 + 1) === 0) {
        const p: DPlat = { x, y: num4 + 1, hall: false, hf: rm.bio === true ? 0 : 3 };
        const os = pdGetPlatformStyle(sty, 'rp');
        if (os >= 0) p.os = os;
        platData.push(p); f3 = true;
        i158Log(`PDC-P s=${instIdx + 1} x=${p.x} y=${p.y} os=${os}`);
      }
      if (f2 && f3) break;
    }
    // 门样式掷（每房恰一次,DU.cs:129-131）+ 门闩锁（DU.cs:134-176）
    const num5 = pdDoorNum5(sty, 'rp');
    // biome 房 doorFluff=0 ⇒ flag6=true ⇒ SkipOtherDoorsCheck/SkipSpaceCheck=true
    // （BiomeDungeonRoom.cs:46 + DU.cs:105/:135）
    const flag6 = rm.bio === true;
    const styObj = sty.Style === 0 ? undefined : (sty as import('./DungeonStyles1457').DungeonStyleData);
    let f4 = false, f5 = false;
    for (let y = num3; y <= num4; y++) {
      if (!f4 && inW(num - 1, y, 0) && actAt(num - 1, y) === 0) {
        const d: DDoor = { x: num - 1, y, dir: -1, hall: false, skipOther: flag6, skipSpace: flag6, clear: true, fluff: rm.bio === true ? 0 : 3, gsty: styObj };
        if (num5 >= 0) d.os = num5;
        doorData.push(d); f4 = true;
        i158Log(`PDC-D s=${instIdx + 1} x=${d.x} y=${d.y} dir=${d.dir} os=${num5}`);
      }
      if (!f5 && inW(num2 + 1, y, 0) && actAt(num2 + 1, y) === 0) {
        const d: DDoor = { x: num2 + 1, y, dir: 1, hall: false, skipOther: flag6, skipSpace: flag6, clear: true, fluff: rm.bio === true ? 0 : 3, gsty: styObj };
        if (num5 >= 0) d.os = num5;
        doorData.push(d); f5 = true;
        i158Log(`PDC-D s=${instIdx + 1} x=${d.x} y=${d.y} dir=${d.dir} os=${num5}`);
      }
      if (f4 && f5) break;
    }
  }
  // LegacyDungeonHall.CalculatePlatformsAndDoors（:26-34；LegacyEntrance 覆写为空）
  // ★2026-08-16 审计：走廊门无 OverrideWidthFluff → DungeonGlobalDoors.cs:58 num4=10
  //   （20 列扫描窗）；曾写 0 = 只扫门位单列。房间门才覆写 3。
  // ★IIIII111c：掷位同 roomPlatformsDoors（pdHallPoint 三级解析+闩锁掷）。
  function hallPlatformsDoors(hl: DHall): void {
    if (hl.isEntrance) return;
    pdHallPoint(Math.trunc(hl.sx), Math.trunc(hl.sy), hl.sdy, null);
    pdHallPoint(Math.trunc(hl.ex), Math.trunc(hl.ey), hl.edy, null);
  }
  // DungeonData.CanGenerateFeatureAt（:132-166）。feat: 0=常规 1=BiomeChests 2=Paintings/WallVariants
  function featOK(x: number, y: number, feat: number): boolean {
    if (!inW(x, y, 5)) return false;
    if (wallAt(x, y) === 350) return false;
    if (feat === 1 && entExists && entBounds.contains(x, y)) return false;
    // feat 3=WallVariants（pit/window 门均放行：DungeonPitTrap.cs:35/DungeonWindow.cs:11）
    // ★IIIII108c 第④刀：DropTrap 成功盒（DungeonDropTrap.CanGenerateFeatureAt 恒 false
    //   ⇒ data.CanGenerateFeatureAt 的 dungeonFeatures 扫描对**一切**特征恒拒收,
    //   含窗/PitTrap 本身——故必须先于下面两个 feat!== 条件,全特征生效）。
    for (const db of dropBoxes) if (db.contains(x, y)) return false;
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
  // ★IIIII211：座面裂纹砖集（Spikes_CanSupportSpike 消费 DU.IsConsideredCrackedDungeonTile
  //   =genVars.isCrackedBrick【本座】=Sets.CrackedBricks{481,482,483} 基表+本座 styles
  //   (∪SubStyles,DC.cs:150-163) 的 BrickCrackedTileType；PitTrapTileType 入 isPitTrapTile
  //   不入本集）。dgSpikes 入口按 gfStyles 重建；非 dual gfStyles=[] ⇒ 集=基表=旧径。
  let spkCracked211: Set<number> | null = null;
  const buildSpkCracked211 = (): void => {
    const s = new Set<number>([481, 482, 483]);
    const addOf = (st0: import('./DungeonStyles1457').DungeonStyleData): void => {
      s.add(st0.BrickCrackedTileType);
      for (const sb of st0.SubStyles ?? []) addOf(sb);
    };
    for (const st0 of gfStyles) addOf(st0);
    spkCracked211 = s;
  };
  const canSupportSpike = (x: number, y: number): boolean => {
    if (actAt(x, y) === 0) return false;
    const t = typAt(x, y);
    const sheet = TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    // ★IIIII211 定罪刀②（DGS:241-247）：原版拒 Main.tileFrameImportant[type]∨
    //   Main.tileCut[type]【并集】。
    // ★IIIII215 二刀（DGS:237 真表化）：消费改 VAN_TILE_FRAME_IMPORTANT∨VAN_TILE_CUT
    //   （1457 Main.cs 终态提取）——曾以 d.framed||d.decor 代真表，而 TILE_DEFS.framed
    //   是「多格框架物体」建模旗：平台 19（frame:'style' 单格族）等未置 framed:true ⇒
    //   平台支承误受理（(981,727) 实证 x86 拒/JS 收）→ SPIKES 段值流二段分叉。
    if (sheet >= 0 && (VAN_TILE_FRAME_IMPORTANT.has(sheet) || VAN_TILE_CUT.has(sheet))) return false;
    if (spkCracked211?.has(sheet)) return false;
    return true;
  };
  // ★IIIII109b：sType/sFlag=dual 支扩展（cs :77 type=232 木刺、:88-92 flag 门=三段带
  //  i−num10*2 只在 flag=true 写；round2 :180-186 同构）。缺省=旧 48/true 普通世界逐位同。
  function spikeRun(round: number, cx: number, cy: number, wx: number, wy: number, d: number, n11: number, step: number,
    sType: number = SPIKE, sFlag = true): number {
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
      st.type[st.idx(fx, fy)] = sType;   // 支承格本就 active（DGS:81 直写 type 不清坡）
      if (round === 0) {
        if (inW(cx - 1, wy - d, 0) && actAt(cx - 1, wy - d) === 0
          && inW(cx + 1, wy - d, 0) && actAt(cx + 1, wy - d) === 0) {
          let ti = st.idx(cx, wy - d);
          st.type[ti] = sType; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;   // DGS:84-86
          if (sFlag) {                                                                    // DGS:88-92 flag 门
            ti = st.idx(cx, wy - d * 2);
            st.type[ti] = sType; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;   // DGS:89-91
          }
        }
        cx += step;
      } else {
        if (inW(wx - d, cy - 1, 0) && actAt(wx - d, cy - 1) === 0
          && inW(wx - d, cy + 1, 0) && actAt(wx - d, cy + 1) === 0) {
          let ti = st.idx(wx - d, cy);
          st.type[ti] = sType; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;   // DGS:110-116 同款
          if (sFlag) {                                                                    // DGS:118-122 flag 门
            ti = st.idx(wx - d * 2, cy);
            st.type[ti] = sType; st.flags[ti] = 1; st.slope[ti] = 0; st.half[ti] = 0;
          }
        }
        cy += step;
      }
      n11--;
    }
    return n11;
  }
  function dgSpikes(): void {
    buildSpkCracked211();                     // ★IIIII211：座面裂纹集按座重建（零掷）
    // ★IIIII215 逐 attempt 仪（SW_I215=1;零掷,__swI113 未挂载=零开销;x86 rig DR|SPK/SPKW 同构）：
    //   SPK=逐 attempt 采样位(x,y,w=墙,g=座墙门,a=活性) / SPKW=门内走查后(hx,hy=走后位,d=向,ok=受理)
    const i215S = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I215;
    const mk215S = (ln: string): void => { (globalThis as { __swI113?: (line: string) => void }).__swI113?.(ln); };
    const num = wallVariants[0];
    // ★IIIII50（DungeonGlobalSpikes.cs:33-36）：getGoodWorldGen → 刺配额 num7×3。
    //   该 feature 每轮至少 2 掷×num7，漏接即本 pass 后半（墙变体扫描/下层房群）
    //   全部掷流顺移——FTW 链 #32 Dungeon 起万格级混乱的根因；其他七链 flag 关闭
    //   不触，故历次回归全绿独漏此臂。
    // ★IIIII109b（S 族定罪①）：num7 漏乘 globalFeatureScalar（DungeonGlobalSpikes.cs:31
    //   num6=Max(1.0,scalar*0.25)、num7=(int)(42*num2*num6)——dual 座≈×1.61=67）。JS 旧
    //   Max(1,0.25)=1 恒 42。普通世界 scalar=1.0 ⇒ Max(1,0.25) 原语义逐位同。
    const num7 = Math.trunc(42 * (w / 4200) * Math.max(1, gfFeatScalar * 0.25))
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
        // ★IIIII109b（S 族定罪②）：dual 支整缺（DungeonGlobalSpikes.cs:59-66 round1 /
        //  :166-174 round2）——flag2=IsConsideredDungeonWall（座面并集,gfIsDW）；墙 87
        //  (Temple)→type=232 木刺+flag=false（i−num10*2 三段不写）。JS 旧恒
        //  wall==wallVariants[0]/type 48/flag true=普通世界语义 ⇒ dual 座拒真墙
        //  （更多 attempt=+11k 掷）且 Temple 域零木刺。非 dual 零扰动（旧径）。
        const walHere = wallAt(x, y);
        const isDualSpk = gfStyles.length > 0;
        let spkType = SPIKE;
        let spkFlag = true;
        let gateOk = walHere === num;
        if (isDualSpk) {
          gateOk = gfIsDW(walHere);
          if (walHere === (TILE_INTERNAL_BY_SHEET.get(87) ?? -1)) {
            spkType = TILE_INTERNAL_BY_SHEET.get(232) ?? spkType;
            spkFlag = false;
          }
        }
        if (i215S) mk215S(`DR|SPK|r=${round}|n3=${n3}|x=${x}|y=${y}|w=${walHere}|g=${gateOk ? 1 : 0}|a=${actAt(x, y) !== 0 ? 1 : 0}`);
        if (gateOk && actAt(x, y) === 0) {
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
          if (i215S) mk215S(`DR|SPKW|r=${round}|hx=${wx}|hy=${wy}|d=${d}|ok=${(hit && okA && okB && okC && okD2 && okE) ? 1 : 0}`);
          if (okA && okB && okC && okD2 && okE) {
            n5++;
            let n11 = ri(5, 12);
            // ★D8（2026-08-13 复核）：首段起点 = 命中格本身。原版 num8/num12 在命中判定后
            //   不预偏移（DungeonGlobalSpikes.cs:66-72/:163-170），while 条件查"步进方向下一格"
            //   支撑、放置"当前格"（:73-96/:170-193）→ 首刺落在命中格，再向两侧延伸。旧代码
            //   先 -1 使整段尖刺列（含 2-3 层带）整体错位一格、丢命中格尖刺。
            const c1x = wx, c1y = wy;
            spikeRun(round, c1x, c1y, wx, wy, d, n11, -1, spkType, spkFlag);
            n11 = ri(5, 12);
            const c2x = round === 0 ? x + 1 : wx, c2y = round === 0 ? wy : oy + 1;
            spikeRun(round, c2x, c2y, wx, wy, d, n11, 1, spkType, spkFlag);
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
      // ★IIIII111c：OverrideStyle 消费（DungeonGlobalDoors.cs:50-54——Next(3) 恒掷,
      //  PD 面 num5 掷值 ≥0 时覆盖档位）；OverrideGenerationStyle 换砖/墙（:40-47）。
      //  ⚠ BrickTileType=vanilla sheet 域 → 写 st.type 前经 TILE_INTERNAL_BY_SHEET 映射
      //  （BrickWallType=vanilla 墙域,TileStore 墙即原版 id,直写）。
      const styD = d.gsty;
      const dBrick = styD ? (TILE_INTERNAL_BY_SHEET.get(styD.BrickTileType) ?? brick) : brick;
      const dWall = styD ? styD.BrickWallType : wall;
      let style = rn(3) === 0 ? doorStyle : 13;
      if (d.os !== undefined && d.os >= 0) style = d.os;
      const num4 = d.fluff;
      const n5 = Math.max(25, Math.min(w - 25, d.x - num4));
      const n6 = Math.max(25, Math.min(w - 25, Math.max(n5, d.x + num4 - 1)));
      let n7 = 100, n8 = 0, n9 = 0, n10 = 0;
      for (let x = n5; x <= n6; x++) {
        let flag = true;
        let y = d.y;
        // ★IIIII215：列搜索上下沿 DungeonTile 门座面化（DU.IsConsideredDungeonTile=
        //   tileDungeon∪本座 isDungeonTile 合并集）——曾用静态 isDT ⇒ st4 腐化砖(25)/
        //   shimmer(667) 等本座风格砖门柱全拒（x86 收 249/JS 全拒实证）→ DOORS 段 −355。
        while (y > 10 && actAt(x, y) === 0) y--;
        if (!gfIsBkDT(typAt(x, y))) flag = false;
        n9 = y;
        for (y = d.y; actAt(x, y) === 0; y++) { if (!st.inBounds(x, y + 1)) break; }
        if (!gfIsBkDT(typAt(x, y))) flag = false;
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
      if (drT && n7 >= 20) console.log(`DGD-REJ x=${d.x} y=${d.y} n7=${n7} n8=${n8}`);
      if (n7 >= 20) continue;
      if (drT) console.log(`DGD-PICK x=${d.x} y=${d.y} n8=${n8} n7=${n7}`);
      let n16 = n8;
      let n17 = d.y, n18 = d.y;
      while (inW(n16, n17, 0) && actAt(n16, n17) === 0) n17++;
      while (n18 > 0 && actAt(n16, n18) === 0) n18--;
      n17--; n18++;
      for (let y = n18; y < n17 - 2; y++) {
        chTile(st.idx(n16, y), dBrick, false);
        for (const off of [-1, -2, 1, 2]) {
          if (inW(n16 + off, y, 0) && actAt(n16 + off, y) !== 0 && canKill(n16 + off, y)) {
            const k = st.idx(n16 + off, y);
            st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = dWall;   // ClearEverything+wall（DGD:173-190）
          }
        }
      }
      dgPlaceDoor(n16, n17, style);
      if (drT) console.log(`DGD-PLC x=${d.x} y=${d.y} n16=${n16} n17=${n17} st=${style}`);
      n16--;
      let n20 = n17 - 3;
      while (n20 > 0 && actAt(n16, n20) === 0) n20--;
      let f3 = n17 - n20 < n17 - n18 + 5 && gfIsBkDT(typAt(n16, n20));   // ★IIIII215 座面化
      if (d.clear || f3) {
        for (let y = n17 - 4 - ri(0, 2); y > n20; y--) {
          if (f3) chTile(st.idx(n16, y), dBrick, false);
          for (const off of [-1, -2]) {
            if (d.clear || typAt(n16 + off, y) === dBrick) {
              const k = st.idx(n16 + off, y);
              st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = dWall;   // ClearEverything+wall（DGD:173-190）
            }
          }
        }
      }
      n16 += 2;
      n20 = n17 - 3;
      while (n20 > 0 && actAt(n16, n20) === 0) n20--;
      f3 = n17 - n20 < n17 - n18 + 5 && gfIsBkDT(typAt(n16, n20));   // ★IIIII215 座面化
      if (d.clear || f3) {
        for (let y = n17 - 4 - ri(0, 2); y > n20; y--) {
          if (f3) chTile(st.idx(n16, y), dBrick, false);
          for (const off of [1, 2]) {
            if (d.clear || typAt(n16 + off, y) === dBrick) {
              const k = st.idx(n16 + off, y);
              st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = dWall;   // ClearEverything+wall（DGD:173-190）
            }
          }
        }
      }
      n17++;
      n16--;
      for (let y = n17 - 8; y < n17; y++) {
        for (const off of [2, 3, -2, -3]) {
          if (d.clear || typAt(n16 + off, y) === dBrick) {
            const k = st.idx(n16 + off, y);
            st.type[k] = 0; st.liquid[k] = 0; st.liquidType[k] = 0;   // ClearEverything 本体（Tile.cs:140 type=0!）
            st.flags[k] = 0; st.slope[k] = 0; st.half[k] = 0; st.wall[k] = dWall;   // ClearEverything+wall（DGD:173-190）
          }
        }
      }
      chTile(st.idx(n16 - 1, n17), dBrick, false);
      chTile(st.idx(n16 + 1, n17), dBrick, false);
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
      // ★IIIII111c：OverrideStyle 消费（DungeonGlobalPlatforms.cs:47-50——PD 面
      //   GetPlatformStyle 掷值 ≥0 时覆盖座平台档位；54 钳制仍最后生效）。
      const platBase = (d.os !== undefined && d.os >= 0) ? d.os : platformStyle;
      const platStyleEff = (wallAt(x, y) >= 94 && wallAt(x, y) <= 105) ? 54 : platBase;
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
            // ★IIIII204：DungeonUtils.GenerateDungeonPotionBottle（DU:392-404）——type==13
            //   后 Next(2)==0→frameX=18 否则 36。旧码掷已耗而值被丢弃=恒帧 0（瓶版帧债
            //   ×30，DGP 平台架活格视觉真差；书族 FFFF 批同病已补，瓶族漏）。
            if (typAt(m, py - 1) === TILE_BY_KEY['v_13_placed_bottles']) {
              st.frameX[st.idx(m, py - 1)] = rn(2) === 0 ? 18 : 36;   // type==13 后 Next(2)
            }
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
  // ★IIIII114b2：G 段受理失败原因镜像钩（x86 rig GC-RSN/GC-PC 同格式；dormant——
  //   仅 dgBasicChests 房环内 + SW_DG_GC=1 时发 log，零掷）
  let gcRsnOn = false;
  // ★IIIII188：WorldGen.IsUndergroundDesert（WG.cs:36136-36162 1:1）——y≥ws、
  //   x∈[0.15W,0.85W]、remix∧y>rock 早退、±15 邻域 wall∈{187,216} 扫描。零掷纯谓词。
  //   （BuriedChestsPass 有同源 cert 实现;此处 dgAddBuriedChest flag3 支消费面。）
  const isUndergroundDesert = (x: number, y: number): boolean => {
    if (y < ws) return false;
    if (x < w * 0.15 || x > w * 0.85) return false;
    if (gs.seedFlags.remix && y > rock) return false;
    for (let a = x - 15; a <= x + 15; a++) {
      for (let b = y - 15; b <= y + 15; b++) {
        if (!inW(a, b, 0)) continue;
        const wl = wallAt(a, b);
        if (wl === 187 || wl === 216) return true;
      }
    }
    return false;
  };
  // ★IIIII188：flag2 冰 tile 门（WG.cs:36454 `Main.tile[i,k].type ∈ {147,161,162,197}`）
  //   ——雪原/冰族（147 冰、161 雪块、162 雪砖、197 紫冰）。零掷纯谓词。
  const iceTileAt = (x: number, y: number): boolean => {
    const sh = TILE_DEFS[typAt(x, y)]?.vanilla?.sheet ?? -1;
    return sh === 147 || sh === 161 || sh === 162 || sh === 197;
  };
  function dgAddBuriedChest(ix: number, jy: number, mainItem: number, style: number, chestTile: number): boolean {
    const rsn = gcRsnOn && typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1';
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_CHEST_TRACE) {
      const uL = (rng as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
      let fh = 0x811c9dc5;
      for (let q = 0; q < 56; q++) { const v = uL.seedArray[q]! >>> 0; for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((v >>> s2) & 0xff), 16777619) >>> 0; }
      const uix = uL.inext >>> 0;
      for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((uix >>> s2) & 0xff), 16777619) >>> 0;
      console.log(`C|${ix}|${jy}|${mainItem}|${style}|${chestTile === CHEST ? 21 : 467}|${fh.toString(16)}`);
    }
    for (let k = jy; k < h - 10; k++) {
      // ★IIIII114b2 定罪（G 混沌·shimmer 群）：C# AddBuriedChest 扫描步首检
      //   `if (Main.tile[i, k].anyShimmer()) return false;`（WorldGen.cs:36486-36489，
      //   anyShimmer=liquid>0 且 liquidType==3）——ddual 双座地牢下沿房间整体浸没
      //   于世界底 shimmer 池，x86 每样本 k=j 即拒 ⇒ 房耗满 1000；JS 曾整缺此检
      //   ⇒ 扫描穿液到底落箱 ⇒ rm17 型房 JS 首试即成（G 族 −15.8k 主源之一）。
      //   零掷纯谓词；失败原因仪 GC-RSN why=shimmer 与 rig 同格式。
      if (st.liquid[st.idx(ix, k)]! > 0 && st.liquidType[st.idx(ix, k)]! === 4) {   // LIQUID_TYPE.SHIMMER（+1 编码）
        if (rsn) console.log(`GC-RSN rm=${(globalThis as { __swI154GRm?: number }).__swI154GRm ?? -1} i=${ix} j=${jy} k=${k} why=shimmer`);
        return false;
      }
      if (actAt(ix, k) !== 0 && typAt(ix, k) === TILE_BY_KEY['v_231_larva']) {
        if (rsn) console.log(`GC-RSN rm=${(globalThis as { __swI154GRm?: number }).__swI154GRm ?? -1} i=${ix} j=${jy} k=${k} why=231`);
        return false;
      }
      let boulder = false;
      for (let a = ix - 2; a <= ix + 2 && !boulder; a++) {
        for (let b = k - 2; b <= k + 2; b++) {
          if (!inW(a, b, 100)) continue;
          const sheet = TILE_DEFS[typAt(a, b)]?.vanilla?.sheet ?? -1;
          if (actAt(a, b) !== 0 && (sheet === 138 || sheet === 484 || sheet === 664 || sheet === 665
            || (sheet >= 711 && sheet <= 716) || typAt(a, b) === TILE_BY_KEY['v_26_altars'] || typAt(a, b) === TILE_BY_KEY['v_237_lihzahrd_altar'])) {
            if (rsn) console.log(`GC-RSN rm=${(globalThis as { __swI154GRm?: number }).__swI154GRm ?? -1} i=${ix} j=${jy} k=${k} why=bld tx=${TILE_DEFS[typAt(a, b)]?.vanilla?.sheet ?? -1} at=${a},${b}`);
            boulder = true; break;
          }
        }
      }
      if (boulder) return false;
      if (!dgSolid(ix, k)) continue;
      const num7 = k;
      // ★IIIII188：C# num9/num10 初值语义（WG.cs:36279-36287）——num9=0 起,(flag15∨
      //   num10>0) 升 1,chestStyle≥0 覆写;num10=mainItemInChest≥0?mainItemInChest:0。
      //   曾 num10 恒传 -1 ⇒ C# 的 num10==0 支（flag3 沙 tile 门/flag2 冰 tile 门/
      //   flag8 hell 门/939 填充）在本域整失活=dgBasicChests 无主件房掷序债主源之一。
      let num9 = style;
      let num10 = mainItem >= 0 ? mainItem : 0;
      if ((num7 >= ws + 25 || num10 > 0) && style < 0) num9 = 1;   // flag15 臂;本调用面 chestStyle 恒≥0 → 覆写,照抄
      let chestTileType = chestTile;                               // flag3/flag6 等支可改写（21↔467）
      let flag9 = false, flag10 = false;
      // ★BBBBB（2026-08-19）：vanilla flag（WG.cs:36309）——21 号箱 chestStyle==0
      //   （含 dgBasicChests 的水覆写箱：num2<ws+50 → itemType=327/chestStyle=0）
      //   即"地表箱"标记；loot 的 surface 支门 = (flag23 && (flag || flag6)) || flag11
      //   （:36280）。曾 surf 恒 false → 水箱误走金箱支 → 掷流错位连坐全段。
      let flag0 = chestTileType === TILE_BY_KEY['chest'] && (style === 0 || (style === -1 && num9 === 0));
      let flag2 = false, flag3 = false, flag4 = false, flag5 = false, flag6 = false;
      let flag7 = false, flag8 = false, flag11 = false, flag12 = false, flag13 = false, flag14 = false;
      const IS_21 = TILE_BY_KEY['chest'], IS_467 = CHEST2;
      // —— ★IIIII188 style→箱型支链（WG.cs:36409-36583 全序 1:1；dual 座表支触发面：
      //    467/10(4267 Desert 表)→flag3、21/11(681)·467/24(5805)→flag2、21/8(626)·
      //    21/10(680)·21/29(2249,dual 门)→flag4、21/15(952)→939 填充、21/12(831)→
      //    flag6、21/32(2544)→flag7、21/16(1142)→flag13。骰面支=flag3 SelectRandom
      //    1 掷+flag2 SelectRandom(7)+Next(20) 2 掷。曾整缺 → x86 每 attempt 多掷
      //    （rig 实测 seat1 st2=5.00/st3=4.00 vs JS 3.00）=BASICCHESTS 掷序债主源。
      // flag3 沙漠支（WG.cs:36409-36425）
      if ((chestTileType === IS_467 && num9 === 10)
        || (num10 === 0 && num7 <= h - 205 && isUndergroundDesert(ix, k))) {
        flag3 = true;
        num9 = 10;
        chestTileType = IS_467;
        // (flag16 && chestStyle == 42) & flag19 — remix∧getGood 交组合,本 seed 恒假
        let flag20: boolean;
        if (dualDungeonState.enabled) {
          flag20 = desertChestLootState;
          desertChestLootState = !desertChestLootState;    // WG.cs:36417-36418（零掷状态翻转）
        } else {
          flag20 = num7 > (gs.desertHiveHigh * 3 + gs.desertHiveLow * 4) / 7;
        }
        // Utils.SelectRandom = 池表 Next(len),恰 1 骰（:36421）
        num10 = flag20 ? [4061, 4062, 4276][rn(3)]! : [4056, 4055, 4262, 4263][rn(4)]!;
      }
      // ★NTB32（2026-08-23）：AddBuriedChest 的 notTheBees 蜂蜜箱带判定支（WG.cs:36426-36450
      //   `if (notTheBees && !remixWorldGen && !dontStarveWorldGen)`）——Next(5)+Next(-2,3)
      //   恒耗 2 颗；深度带（num13=ws+Next(-2,3)+35 门）命中再按 `i<beach+180-Next(-2,3)`
      //   `|| i>maxX-beach-180+Next(-2,3)` 短路再耗 1-2 颗 Next(-2,3)。位置=flag3 支后、
      //   flag2 支前（:36426;flag21 是 flag2 冰 tile 门的析取支）——**PlaceChest 败也照耗**。
      //   地牢/生物箱 num10>0 → flag21 下游 style-11 支恒不触发,纯掷流语义。缺此支 =
      //   每次找到实心行的调用少耗 2-4 颗 → G 段起主流永久相移（NTB 链 #32 首差根因）。
      //   ★IIIII188：位置从链尾前移到 C# 原位（flag3 与 flag2 之间）+ flag21 接线。
      let flag21 = false;
      if (gs.seedFlags.notTheBees && !gs.seedFlags.remix && !gs.seedFlags.theConstant) {
        const num12 = gs.lavaLine + rn(5);
        const num13 = Math.trunc(ws) + ri(-2, 2) + 35;
        if (num7 > num13 && num7 <= num12
          && (ix < BEACH + 180 - ri(-2, 2) || ix > w - BEACH - 180 + ri(-2, 2))) {
          flag21 = true;   // SkipOnDualDungeons 拒面:dual 座内=原版 false(见下)
        }
      }
      // flag2 冰支（WG.cs:36452-36468）
      if ((chestTileType === IS_21 && num9 === 11) || (chestTileType === IS_467 && num9 === 24)
        || (num10 === 0 && num7 >= ws + 25 && num7 <= h - 205 && (flag21 || iceTileAt(ix, k)))) {
        flag2 = true;
        if (chestTileType === IS_21) num9 = 11;
        // (flag17 && chest21 && chestStyle==34) — drunk∧tenth 交组合,本 seed 恒假
        num10 = [670, 724, 950, 1319, 987, 1579, 6153][rn(7)]!;   // :36457 SelectRandom 1 骰
        if (rn(20) === 0) num10 = 997;                            // :36461 1 骰（remix 1319→725 恒假）
      }
      // flag4 丛林支（WG.cs:36470-36495）——GeneratingDungeon 全程 true（DungeonCrawler.cs:356
      //   置位/:521 才清）⇒ `if (!GeneratingDungeon)` 改写臂恒跳,零骰纯旗
      if ((chestTileType === IS_21 && (num9 === 10 || ((num9 === 8 || num9 === 29) && dualDungeonState.enabled)))
        || (chestTileType === IS_467 && num9 === 11)
        || num10 === 211 || num10 === 212 || num10 === 213 || num10 === 753) {
        flag4 = true;
      }
      // flag8 地狱支（WG.cs:36497-36508）
      if (chestTileType === IS_21 && (num9 === 4 || (num7 > h - 205 && num10 === 0))) {
        flag8 = true;
        // num10=GenVars.hellChestItem[hellChest]（:36500）;本 pass chestStyle==4/h-205 带
        // 不可达,items 空值兜底仅护型（BuriedChestsPass 同源语义）。
        num10 = gs.hellChestItems ? gs.hellChestItems[gs.hellChestIdx % gs.hellChestItems.length]! : 0;
        num9 = 4;
        flag14 = true;
      }
      // flag5（:36510）/flag6（:36517-36527）/flag7（:36530）/flag13（:36536）
      if (chestTileType === IS_21 && num9 === 17) flag5 = true;
      if (chestTileType === IS_21 && num9 === 12) {
        if (wallAt(ix - 1, num7 - 1) !== 244) { num9 = 0; num10 = 0; flag0 = true; }
        else flag6 = true;
      }
      if (chestTileType === IS_21 && num9 === 32) flag7 = true;
      if (chestTileType === IS_21 && num9 === 16) flag13 = true;
      // flag9/flag10（:36540-36547）——**在 style 支链之后**（消费改写后的
      //   num9/chestTileType;曾置于链前=flag3 改 467 后仍误记 dungeon 箱旗）
      if (chestTileType === IS_21 && num9 !== 0 && num7 >= ws && isDW(wallAt(ix, num7))) flag9 = true;
      if ((chestTileType === IS_21 && num9 >= 23 && num9 <= 27) || (chestTileType === IS_467 && num9 === 13)) {
        flag9 = true; flag10 = true;
      }
      // flag11（:36548）/flag12（:36551）
      if (chestTileType === IS_21 && num9 !== 0 && (num10 === 848 || num10 === 857 || num10 === 934)) flag11 = true;
      if (chestTileType === IS_21 && (num9 === 13 || num10 === 159 || num10 === 65 || num10 === 158 || num10 === 2219)) flag12 = true;
      // 939 填充（:36574-36577）
      if ((num10 === 939 || (chestTileType === IS_21 && num9 === 15) || (chestTileType === IS_467 && num9 === 2)) && num10 === 0) {
        num10 = 939;
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
        if (!ok && rsn) console.log(`GC-PC x=${px} y=${num7 - 1} why=legs t=${sheetB},${sheetB2}`);
        if (ok) ok = cx >= 5 && cx + 2 <= w - 5 && cy >= 5 && cy + 2 <= h - 5;  // :215 边界 5 垫
        for (let a = 0; ok && a < 2; a++) {                                 // 内盒 :337-375（可覆盖 = tileCut∖{484,654}∪BreakableWhenPlacing）
          for (let b = 0; b < 2; b++) {
            if (actAt(cx + a, cy + b) === 0) continue;
            const t2 = TILE_DEFS[typAt(cx + a, cy + b)]?.vanilla?.sheet ?? 0;
            if (!((DG_TILE_CUT.has(t2) && t2 !== 484 && t2 !== 654) || DG_BREAK_PLACE.has(t2))) { ok = false; if (rsn) console.log(`GC-PC x=${px} y=${num7 - 1} why=cp box t=${t2} at=${cx + a},${cy + b}`); break; }
          }
        }
        // 锚腿×2：①SolidTile（tileSolid&&!solidTop&&!noAttach&&!anchorInvalid）；
        // ②平台/solidTop/桌（SolidWithTop|Table 路——本段实测腿全 41/43/44 砖，备案近似）
        if (ok && !(chestLegOK(px, num7) && chestLegOK(px + 1, num7))) { ok = false; if (rsn) console.log(`GC-PC x=${px} y=${num7 - 1} why=cp legs t=${sheetB},${sheetB2}`); }
        // ★cs:37578：PlaceChest 败 = 本调用即 return false——k 循环只在首实心行掷一次
        // （vanilla DgCanPlaceProbe 实证：失败调用恰 1 条 CanPlace 记录）。旧版续扫会在
        // 更深处凭空落箱。
        if (!ok) return false;
      }
      for (let a = 0; a < 2; a++) {
        for (let b = -1; b <= 0; b++) {
          const ti = st.idx(px + a, py + b);
          chTile(ti, chestTileType, false);   // ★IIIII188：用改写后 chestTileType（flag3→467）
          // PlaceChestDirect 帧式（:57864-57903）：顶行 fy=0 / 底行 fy=18；
          // 列 fx=36*style / 18+36*style。★此前不写帧=残留旧帧,宝箱单格贴图错乱
          st.frameX[ti] = 36 * num9 + a * 18; // ★IIIII188：style→num9（style 支链改写后值）
          st.frameY[ti] = b === -1 ? 0 : 18;
        }
      }
      // ★IIIII188：loot 旗全量下传（flag2/3/4/5/6/7/8/11/12/13/14 新建模）
      dgChestLoot(num7, num10, flag9, flag10, num9, chestTileType, flag0,
        flag2, flag3, flag4, flag5, flag6, flag7, flag8, flag11, flag12, flag13);
      // ★IIII102c：push → registerChest（Main.chest 首空槽复用,Chest.cs:584）
      registerChest(chests as SparseChestSink, { x: px, y: py - 1, locked: flag10, items: dgLootItems(num10) });
      // ★IIIII188：hell 箱轮转推进（WG.cs:36600-36604 `if (flag14) { GenVars.hellChest++ ... }`）
      if (flag14 && gs.hellChestItems) gs.hellChestIdx = (gs.hellChestIdx + 1) % gs.hellChestItems.length;
      return true;
    }
    return false;
  }
  // 战利品掷骰流（AddBuriedChest 深三分支 + 尾段；与 oracle DgAddBuriedChest 同构）
  // ★IIIII188：旗面扩展——flag2(冰)/flag3(沙)/flag4(丛林)/flag5(17 号常春藤)/flag6(活木墙)/
  //   flag7(32 蜂巢死箱)/flag8(地狱)/flag11(848/857/934)/flag12(13 号或暗影珠族)/
  //   flag13(16 号)全量 1:1（WG.cs:36306-36583 计算面）。
  function dgChestLoot(num7: number, num10: number, flag9: boolean, flag10: boolean, num9: number, chestTile: number, flag0 = false,
    flag2 = false, flag3 = false, flag4 = false, flag5 = false, flag6 = false, flag7 = false, flag8 = false,
    flag11 = false, flag12 = false, flag13 = false): void {
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
    // ★IIIII188：surface 支门补全 `(flag23 && (flag|flag6)) | flag11`（WG.cs:36822）——
    //   flag6=21 号 12 型箱落在活木墙 244 侧（flag6 支置位）;flag11=主件 848/857/934。
    const surf = (f23 && (flag0 || flag6)) || flag11;
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
        // ★IIIII188：中深支 flag5/flag12/flag6 附加支（WG.cs:36896-36935 全序 1:1）——
        //   LivingWood 表 831→21/12 → flag6 支三掷（5629/4429|4427/5528）;flag5=17 号;
        //   flag12=13 号暗影珠族（Next(40)→4978）。
        if (flag5) {
          if (rn(2) === 0) dgLoot.push(4425);             // WG.cs:36898-36901
          if (rn(2) === 0) dgLoot.push(4460);             // :36902-36905
        }
        if (flag12 && rn(40) === 0) { prefixRolls(4978); dgLoot.push(4978); }   // :36907-36912
        if (flag6) {
          if (rn(3) === 0) dgLoot.push(5629);             // :36913-36916
          if (rn(6) === 0) { dgLoot.push(rn(2) === 0 ? 4429 : 4427); }    // :36917-36931（Next(6)+命中 Next(2)）
          if (rn(3) !== 0) dgLoot.push(5528);             // :36932-36935
        }
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
        // ★IIIII188：flag2/3/4/5 loot 附加支（WG.cs:37191-37235 全序 1:1）——旧注
        //   「flag2（冰）/flag3（沙）地牢箱恒 false」系**误判**：dgBasicChests 表支把
        //   chestStyle 落到 11/24（681/5805→冰）、10（4267→沙）、8/10/29（626/680/2249
        //   →丛林 flag4）,num10 又被 flag2/flag3 支改写为真主件 → 三旗在 dual 座实触发。
        //   flag2→Next(5) 命中 3199;flag3→Next(7) 4346+Next(15) 4066;flag4→首件免掷
        //   （gennedLivingMahoganyWands 世界旗）否则 Next(5) 3360+3361、Next(10) 4426、
        //   Next(10) 5525;flag5→Next(2) 4425+Next(2) 4460。
        if (flag2 && rn(5) === 0) dgLoot.push(3199);                      // WG.cs:37191-37195
        if (flag3) {
          if (rn(7) === 0) dgLoot.push(4346);                             // :37198-37202
          if (rn(15) === 0) dgLoot.push(4066);                            // :37203-37207
        }
        if (flag4) {
          if (!gs.gennedMahoganyWands || rn(5) === 0) {                   // :37211-37216（GenVars.gennedLivingMahoganyWands）
            gs.gennedMahoganyWands = true;
            dgLoot.push(3360); dgLoot.push(3361);
          }
          if (rn(10) === 0) dgLoot.push(4426);                            // :37217-37220
          if (rn(10) === 0) dgLoot.push(5525);                            // :37221-37224
        }
        if (flag5) {
          if (rn(2) === 0) dgLoot.push(4425);                             // :37228-37231
          if (rn(2) === 0) dgLoot.push(4460);                             // :37232-37235
        }
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
    // ★IIIII99d2（2026-08-31）：FTW 追加掷（1457 WG.cs:37795-37797 / 1456 :37436-37438 /
    //   1458 :37803-37805，1457 即终值）——`flag9 && Main.getGoodWorld && genRand.Next(5)==0
    //   → SetDefaults(5515)`。位序=flag9 砍刀掷(:37792)之后、num9∈23..27 残片掷(:37834)
    //   之前；仅 tile21 块有此支（467 尾段无 getGoodWorld 掷）。缺此掷=FTW 下每座
    //   dungeon-wall 21 号箱少耗 1 颗主流骰 → BiomeChests 段 −N 起全城邦相位漂移
    //   （本批 rig 定罪：x86 fill21 vs JS20 @i=0 同坐标逐格同 attempt；467 箱两侧相等）。
    //   vanilla 内容面与 2192/5234 同口径（dice 记账为主,5515 不入 SW 箱列——
    //   本仓 items 表无此 id,dgLootItems 对未注册 id 自动跳过）。
    if (flag9 && chestTile === TILE_BY_KEY['chest'] && gs.seedFlags.getGoodWorld) {
      if (rn(5) === 0) { /* 5515 */ }
    }
    if (chestTile === TILE_BY_KEY['chest'] && num9 >= 23 && num9 <= 27) { if (rn(2) === 0) { /* 5234 */ } }
    else if (chestTile === CHEST2 && num9 === 13) { if (rn(2) === 0) { /* 5234 */ } }
    // ★IIIII99d（2026-08-31）：rainbowStuff 生物群系箱追加 1260（1458 WG.cs:37920-37927）——
    //   `if (SecretSeed.rainbowStuff.Enabled && (num10==1156||1571||1569||1572||4607))
    //   { SetDefaults(1260); Prefix(-1); itemIndex++; }`。位序=21 块残片掷(:37833)/467 块
    //   残片掷(:37877)之后、vampire 门(:37929)与 voice 门(:37934)之前；1260 是魔法类
    //   （Item.cs prefix 池 'magic'，DG_PRE_CLASS 已注册）⇒ Prefix(-1) 走单轮
    //   Next(4)→[Next(36)+Reduced Next(3)] 链。**该支不名单含 1260 本尊**——丛林箱
    //   （i%5==2, item=1260）落空、其余四族必中 ⇒ 每座 gold/crimson/frozen/desert
    //   锁箱多耗一颗前缀簇（rb-pc rig 实证 bcRB×4 @rc26826/26912/27045/27076，
    //   st26 无此掷）。缺此支 = rainbow 链 BiomeChests 窗 −N 骰 → 位点下游相位记账
    //   全体漂移（XX·IIIII98c 的 +61/+142/−100 尾账与 ±1 边界差皆此 mask 伪影）。
    //   净效果与其他链零交集：rainbowStuff 关闭时短路，骰流不变。
    if (gs.seedFlags.rainbowStuff && (num10 === 1156 || num10 === 1571 || num10 === 1569 || num10 === 1572 || num10 === 4607)) {
      prefixRolls(1260);
    }
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
    // ★IIIII105c：DualDungeon 臂=BiomeChests_DualDungeons（cs:30-77）整缺补移植——
    //   组表 [Jungle8, 邪恶(4/5), Hallow6, Snow2, Desert3]（drunk 追加对侧邪恶）,
    //   按【房样式】分桶受理：每样式优先 BiomeDungeonRoom×50 试,否则随机房
    //   num3=30×count 次（Next(list.Count)+Remove）。GenerateDungeonBiomeChest
    //   （DU.cs:291-323）：InnerBounds Lerp(rd×2)→CanGenerateFeatureInArea→
    //   BiomeChestItemType 表(LootItemType<0 早退)→Locked 覆写 style。双座分别
    //   各跑一遍；普通世界 gfChestPlan undefined → legacy 全图 bounds 掷法逐位同。
    if (gfStyles.length > 0 && gfChestPlan !== undefined) {
      // ★IIIII215 逐 attempt 仪挂点（SW_I215;__swI113 未挂载=零开销;x86 rig DR|BCG/BCB/BCP/BCX 同构）
      const i215B = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I215;
      const mk215B = (ln: string): void => { (globalThis as { __swI113?: (line: string) => void }).__swI113?.(ln); };
      const groups: number[] = [8, gs.crimson ? 5 : 4, 6, 2, 3];
      if (gs.seedFlags.drunkWorld) groups.push(gs.crimson ? 4 : 5);
      const tryRoom = (bnd: { L: number; T: number; R: number; B: number }, stId: number): boolean => {
        const spec = STYLE_LIGHTCHEST_TABLES[stId];
        if (spec === undefined) return false;
        // ★IIIII215：Lerp 域统一 8 参重载（DU.cs:300-302 (int)Lerp(minX,maxX,NextDouble())×2）
        //  ——bnd 即 (minX,minY,maxX,maxY)（InnerBounds 形=T=Center.Y 预折；Legacy 形=对称盒）。
        //  曾 InnerBounds 形硬编码 cY 中垂 Lerp ⇒ Legacy 房（EndPosition±(int)(Strength×0.4f)）
        //  采样域错 → BIOMECHESTS +1 掷 → 值流四段分叉。
        const num = Math.trunc(bnd.L + (bnd.R - bnd.L) * rd());
        const num2 = Math.trunc(bnd.T + (bnd.B - bnd.T) * rd());
        // ★IIIII215 取证钩（SW_I215;x86 rig DR|BCX 同构,零掷）
        const bcGate = featAreaOK(num, num2, 1);             // CanGenerateFeatureInArea(:296)
        if (i215B) mk215B(`DR|BCX|num=${num}|num2=${num2}|ok=${bcGate ? 1 : 0}`);
        if (!bcGate) return false;
        if (spec.BiomeChestLootItemType < 0) return false;   // num3==0 早退(:317-320)
        let chestTileInternal = CHEST, chestStyleV = 2;      // 缺省 21/2(:301-302)
        if (spec.BiomeChestItemType >= 0) {
          const pd = ipOf(spec.BiomeChestItemType);
          // ★IIIII188：pd.t 已是 internal 域——曾二次映射 get(16)=15(铁砧) 同源病
          if (pd.t >= 0) { chestTileInternal = pd.t; chestStyleV = pd.s ?? 0; }
        }
        if (spec.LockedBiomeChestStyle >= 0) chestStyleV = spec.LockedBiomeChestStyle;   // locked=true
        return dgAddBuriedChest(num, num2, spec.BiomeChestLootItemType, chestStyleV, chestTileInternal);
      };
      for (let giB = 0; giB < groups.length; giB++) {
        const gsty = groups[giB]!;
        const ent = gfChestPlan[gsty];
        let flagG = false;
        if (i215B) mk215B(`DR|BCG|g=${giB}|st=${gsty}|bio=${ent?.biome != null ? 1 : 0}|cnt=${ent?.rooms.length ?? -1}`);
        if (ent?.biome != null) {                            // array2[style]=BiomeDungeonRoom
          let n50 = 50;
          while (n50 > 0) {
            n50--;
            const okB = tryRoom(ent.biome!, gsty);
            if (i215B) mk215B(`DR|BCB|g=${giB}|ok=${okB ? 1 : 0}`);
            if (okB) { flagG = true; break; }
          }
        }
        if (!flagG && ent !== undefined && ent.rooms.length > 0) {
          let n30c = 30 * ent.rooms.length;
          while (n30c > 0 && ent.rooms.length > 0) {
            n30c--;
            const pick = ent.rooms[rn(ent.rooms.length)]!;
            const okP = tryRoom(pick, gsty);
            if (i215B) mk215B(`DR|BCP|g=${giB}|ok=${okP ? 1 : 0}|cnt=${ent.rooms.length}`);
            if (okP) flagG = true;
            ent.rooms.splice(ent.rooms.indexOf(pick), 1);    // Remove(pick)（试后除）
            if (flagG) break;
          }
        }
      }
      return;
    }
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
  /** ★IIIII105c：GetNextJungleChestItem（WG.cs:10146-10168）——计数器模 4 选基础品,
   *  Next(15)==0→2292 else-if Next(20)==0→3017（Next(20) 仅在 Next(15)!=0 时耗）,
   *  计数恒 ++。 */
  function dgNextJungleChestItem(): number {
    let result = 211;
    switch (DG_JUNGLE_CHEST_COUNT % 4) {
      case 1: result = 212; break;
      case 2: result = 213; break;
      case 3: result = 964; break;
      default: result = 211; break;
    }
    if (rn(15) === 0) result = 2292;
    else if (rn(20) === 0) result = 3017;
    DG_JUNGLE_CHEST_COUNT++;
    return result;
  }
  // ★IIIII118：G 段 dump 闭包提为 oneDungeon 级工厂（原 dgBasicChests 局部）——
  //   PD_OUT dump（snap('dungeonPD') 处）与 G 段共用同一 dump 通道。
  const mkGcDumpGrid = (): ((tag: string) => void) | null => {
    const gcDumpPfx = typeof process !== 'undefined' ? (__swProcessEnv ?? {}).SW_DG_GC_DUMP : undefined;
    if (!gcDumpPfx) return null;
    return (tag: string): void => {
      const fsw = nodeFs();
      if (!fsw) return;
      const n = w * h;
      const vtyp = new Uint16Array(n), vact = new Uint8Array(n), vhf = new Uint8Array(n), vsl = new Uint8Array(n), vlt = new Uint8Array(n), via = new Uint8Array(n), vwr = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const ty = st.type[i]!;
        vtyp[i] = ty === 0 ? 0 : (TILE_DEFS[ty]?.vanilla?.sheet ?? 9999);
        vact[i] = st.flags[i]! & 1;
        vhf[i] = st.half[i]!;
        vsl[i] = st.slope[i]!;
        vlt[i] = st.liquidType[i]!;
        via[i] = (st.wire[i]! >>> 5) & 1;                      // inActive 位（WG wire bit5 惯例）
        vwr[i] = st.wire[i]! & 1;
      }
      const wrB = (nm: string, a: Uint8Array | Uint16Array): void => {
        const buf = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
        fsw.writeFileSync(`${gcDumpPfx}${tag}.${nm}`, buf);
      };
      wrB('typ', vtyp); wrB('act', vact); wrB('wal', st.wall); wrB('half', st.half);
      wrB('slope', st.slope); wrB('lty', vlt); wrB('inact', via); wrB('wire', vwr);
    };
  };
  function dgBasicChests(): void {
    // 对账插桩(dormant)：SW_DG_GC=1 时逐房/逐尝试记 lo/hi/num/num2（G 段流对拍用）
    const gcT = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1';
    // ★IIIII114b2：G 段入口/出口 tile 快照（SW_DG_GC_DUMP=<pfx>；与 x86 rig SW_GDUMP
    //   同通道 typ(vanilla sheet)/act/wal/half/slope/lty/inact/wire，零掷 logging-only）
    let gcDumpGrid: ((tag: string) => void) | null = null;
    if (typeof process !== 'undefined' ? (__swProcessEnv ?? {}).SW_DG_GC_DUMP : undefined) {
      const g = globalThis as { __swI154GSeat?: number };
      const seatG = (g.__swI154GSeat ?? 0) + 1;
      g.__swI154GSeat = seatG;
      gcDumpGrid = mkGcDumpGrid();
      gcDumpGrid!(`_js_s${seatG}_G_in`);
    }
    let gcRm = 0;
    for (const rm of rooms) {
      // ★IIIII111c：受理窗按【房型】分派（C# TryGenerateChestInRoom 两支）——
      //   LegacyDungeonRoom 覆写支（Rooms/LegacyDungeonRoom.cs:78-92）=EndPosition±
      //   (int)(Strength*0.4f) 方窗；基类支（Rooms/DungeonRoom.cs:259-263→DU.cs:325-331）
      //   =InnerBounds 且 **minY=Center.Y=(Top+Bottom)/2（房下半）**。曾按 rm.st 分派且
      //   基类支 minY=T（整高）——房型/窗域双偏差（G −15.9k 主因之一）。
      //   非 dual（gfStyles 空）全房=Legacy 支逐位同（certified 面不动）；dual 的
      //   provider 房由 roomSink 透传 leg=instanceof DLegacyRoom，climb 插入房
      //   （dgRoom 直造,无 leg 字段）C# 亦为 LegacyDungeonRoom ⇒ 缺省 true。
      const rmSt = rm.st ?? 0;
      const leg = gfStyles.length === 0 ? true : (rm.leg !== undefined ? rm.leg : true);
      let lo: number, hi: number, loY: number, hiY: number;
      if (leg) {
        const half = Math.trunc(rm.strength * 0.4);
        const exI = Math.trunc(rm.ex), eyI = Math.trunc(rm.ey);
        lo = exI - half; hi = exI + half; loY = eyI - half; hiY = eyI + half;
      } else {
        lo = rm.inner.L; hi = rm.inner.R;
        loY = Math.trunc((rm.inner.T + rm.inner.B) / 2); hiY = rm.inner.B;
      }
      // ★IIIII188：GC-RM/GC-FA/GC-TRY 补 |mr=|rc= 注脚（x86 rig JJHook.Mark 同构格式,
      //   per-style 掷率对账用;logging-only 零掷）
      const gcRc = (): number => (globalThis as { __swRollTotal?: number }).__swRollTotal ?? 0;
      if (gcT) console.log(`GC-RM ${gcRm++} leg=${leg ? 1 : 0} lo=${lo} hi=${hi} loY=${loY} hiY=${hiY} st=${rmSt}|mr=${dgMainRolls}|rc=${gcRc()}`);
      (globalThis as { __swI154GRm?: number }).__swI154GRm = gcRm - 1;
      gcRsnOn = true;
      for (let j = 0; j < 1000; j++) {
        // num=(int)Lerp(minX,maxX,rd)、num2=(int)Lerp(minY,maxY,rd)（DU.cs:337-338）
        const num = Math.trunc(lo + (hi - lo) * rd());
        const num2 = Math.trunc(loY + (hiY - loY) * rd());
        if (!featAreaOK(num, num2, 1)) {
          // ★IIIII188：GC-FA 镜像（rig DU.cs:347-353 gate 拒支,曾整缺=JS 侧 gate 拒无声）
          if (gcT) console.log(`GC-FA rm=${gcRm - 1} num=${num} num2=${num2}|mr=${dgMainRolls}|rc=${gcRc()}`);
          continue;                                        // data.CanGenerateFeatureInArea(:339)
        }
        let itemType = rmSt === 0 ? 0 : -1, chestStyle = 2;
        let chestTileVid = 21;                              // ushort chestTileType=21（sheet 域,日志用）
        let chestTileInternal = CHEST;                      // ★IIIII188：缺省 21 号箱 internal（ chestTileType=21）
        if (rmSt === 0) {
          // GetDungeonLootAndChestStyle（WorldGen.cs:36189-36238，style0 旗 face）
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
          if (num2 < ws + 50) { itemType = 327; chestStyle = 0; }   // :36231-36236
        } else {
          switch (rmSt) {
            case 8: case 9: case 14: itemType = dgNextJungleChestItem(); break;   // :353-357
            case 10: itemType = 1293; break;                  // :358-360 Temple
            case 13:                                          // :361-367（itemType=832/Next(3)→4281）
              itemType = 832;
              if (rn(3) === 0) itemType = 4281;
              break;
            default: break;                                   // flag=false 支（2/3/6/…）
          }
          // :369-374 `!flag && ChestItemTypes.Length != 0`——Style!=0 恒 !flag ⇒ 全部非
          // Default 房都掷表支（含 case10/13/8 已设 itemType 者,C# 同构！）
          const spec137 = STYLE_LIGHTCHEST_TABLES[rmSt];
          if (spec137 !== undefined && spec137.ChestItemTypes !== null && spec137.ChestItemTypes.length !== 0) {
            const it = spec137.ChestItemTypes[rn(spec137.ChestItemTypes.length)]!;
            const pd = ipOf(it);
            // ★IIIII188：pd.t 已是 **internal 域**（ipOf 内部过 TILE_INTERNAL_BY_SHEET）——
            //   曾再喂 get(chestTileVid) 二次映射：get(16)=15(铁砧)/get(175)=289(锡砖) →
            //   表支箱格全写错 tile 且 chestStyle 域失配（flag2/3/4/6/7 支全瘫）。
            //   js033 实证：座0 铁砧 342 格+锡砖 120 格、座1 铁砧 560+锡砖 176。
            if (pd.t >= 0) chestTileInternal = pd.t;
            chestStyle = pd.s ?? 0;
          }
        }
        if (itemType === 0 && rn(2) === 0) break;           // :375-378 空手受领（本域不可达,照抄）
        const gcOk = dgAddBuriedChest(num, num2, itemType, chestStyle, chestTileInternal);   // :379
        // ★IIIII179：BCH=箱逐 attempt（x86 同构）
        if (i179F) mk179R(`DR|BCH|r=${gcRm - 1}|j=${j}|ok=${gcOk ? 1 : 0}`);
        // ★IIIII188：sty=/it=/cs= 注脚为本批排障扩展（x86 GC-TRY 无此字段,对账仪忽略）
        if (gcT) console.log(`GC-TRY rm=${gcRm - 1} num=${num} num2=${num2} ok=${gcOk ? 1 : 0} sty=${rmSt} it=${itemType} c=${chestStyle}/${chestTileVid}|mr=${dgMainRolls}|rc=${gcRc()}`);
        if (gcOk) {
          if (rmSt === 0) lootStyle++;                      // :380-383 仅 style0 面 lootStyle++
          break;
        }
      }
      gcRsnOn = false;
    }
    if (gcDumpGrid) {
      const g = globalThis as { __swI154GSeat?: number };
      gcDumpGrid(`_js_s${g.__swI154GSeat}_G_out`);
    }
  }

  // ============ DungeonGlobalBookshelves（:23-208）============
  function dgBookshelves(): void {
    // __bsEv 探针（GGG 批 2026-08-18）：书架事件表 [k0,k1,x,y,n10,flag3,n7,dist]
    // （k0=迭代起 dgMainRolls 内部计数——主流真位需 +TileRunner 侧滞后，见
    // tools/_gggreplay.test.ts 对拍注记）——B 尾 -3 掷定位用，常态零开销。
    const bsEvG = (globalThis as { __bsEv?: unknown[][] }).__bsEv;
    let ncount = 0, num3 = 0;
    // ★IIIII105b：Bookshelves 自持 minimumWaterCandles（Bookshelves.cs:33-42；GetWorldSize 同 :54-63）
    const bkMinWC = { v: gfStyles.length > 0 ? (worldSizeIdx() === 0 ? 5 : worldSizeIdx() === 1 ? 10 : 15) : -1 };
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
      i158Log(`BATT-H s=${instIdx + 1} n3=${num3} st=${ncount} n5=${x} n6=${y}`);
      // ★IIIII179：BSK=书架逐 attempt（x86 同构;墙门位直读）
      if (i179F) mk179R(`DR|BSK|n=${ncount}|x=${x}|y=${y}|g=${gfIsBkDW(wallAt(x, y)) && actAt(x, y) === 0 ? 1 : 0}`);
      let flag = true;
      // ★IIIII105b：Books 座面化（逐族分步 #1）——IsConsideredDungeonWall/Tile 的
      // per-seat 全集（DungeonUtils.cs:1929-1950/:1844-1869 genVars 克隆合并族）；
      // 普通世界 gfStyles 空 ⇒ 与旧 isDW/isDT 逐位同径零扰动。
      // ★IIIII105c：候选门座面化正式接线（此前 gfIsBkDW/gfIsBkDT 建成未消费——
      //   XXX 章 §③1①「已挂装配点」半落地状态补全）。IsConsideredDungeonWall/Tile
      //   消费 CurrentDungeonGenVars 合并表（DU.cs:1929-1950/:1844-1869）；_gfSeat*
      //   未装配（普通世界）时回退静态 DG_DUNGEON_* 集=旧径逐位同。
      if (gfIsBkDW(wallAt(x, y)) && actAt(x, y) === 0) {
        const iC = ((globalThis as unknown as { __swLastRollIdx?: number }).__swLastRollIdx ?? 0) + 1;
        const d98c = rn(2);
        if (I110bs) emitBS(`bsDi|${num3},${ncount}|${d98c} m=${dgMainRolls} i=${iC}`);
        const n7 = d98c === 0 ? -1 : 1;
        while (flag && inW(x, y, 0) && actAt(x, y) === 0) {
          x -= n7;
          if (x < 5 || x > w - 5) flag = false;
          else if (actAt(x, y) !== 0 && !gfIsBkDT(typAt(x, y))) flag = false;   // ★105c
        }
        emitBS(`bsS|${num3},${ncount}|${x},${y} fl=${flag ? 1 : 0}`);
        if (flag && inW(x, y, 0) && actAt(x, y) !== 0 && gfIsBkDT(typAt(x, y))          // ★105c ×3
          && actAt(x, y - 1) !== 0 && gfIsBkDT(typAt(x, y - 1))
          && actAt(x, y + 1) !== 0 && gfIsBkDT(typAt(x, y + 1))) {
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
            if (!featOK(x, y, 0) || entNoFeat(x, y)) { flag = false; i158Log(`BATT-CG s=${instIdx + 1} n5=${x} n6=${y}`); continue; }
            emitBS(`bsOK|${num3},${ncount}|${x},${y}`);
            let k = x;
            const num8 = x;
            while (k > bounds.L && k < bounds.R && actAt(k, y) === 0 && actAt(k, y - 1) === 0 && actAt(k, y + 1) === 0) k += n7;
            k = Math.abs(x - k);
            let flag3 = rn(2) === 0;   // ★IIIII105b：座面 !flag2 ⇒ false 重赋（cs:101）
            if (k > 5) {
              // ★III 批 2026-08-18 注记 + ★IIIII105b 座面化终案：
              //   普通世界（gfStyles 空）沿用旧判 wall==brickWallType→Default(0)；
              //   dual 座面按 DungeonGlobalBookshelves.cs:96-110 原文序接 GetStyleForWall：
              //     flag2=(Style==0)；!flag2 ⇒ flag3=false；GetPlatformStyle=
              //     Next(len)→DerivedPlacementDetails.tileStyle（:150-158 空表恒 -1 不掷）；
              //     GetBookshelfMinMaxSizes 缺省 (1,4)/LivingWood 覆写 (3,7)
              //     （DungeonGenerationStyles.cs:38-44）。
              let flag2 = true;
              let num9 = -1, min = 1, max = 4;
              const _bksFW = gfStyles.length > 0 ? gfStyleForWall(wallAt(x, y))
                : (wallAt(x, y) === wall ? { Style: 0 } as import('./DungeonStyles1457').DungeonStyleData : null);
              if (_bksFW !== null) {
                flag2 = _bksFW.Style === 0;
                if (!flag2) flag3 = false;          // cs:101 !flag2 ⇒ flag3=false（首排平台不再带书/瓶尾挂件）
                // ★IIIII118：GetPlatformStyle 改真实平台项表（PLATFORM item id→tileStyle）——
                //   曾用窗台占用字段+ITEM_PLACE 映射（书架平台样式错档+掷序错位）。
                const bPlat = STYLE_PLAT_ITEM_IDS[_bksFW.Style] ?? [];
                if (_bksFW.Style === 0 || bPlat.length === 0) num9 = -1;
                else {
                  num9 = PLAT_ITEM_STYLE[bPlat[rn(bPlat.length)]!] ?? -1;   // GetPlatformStyle
                }
                const mmBk = _bksFW.BookshelfMinMaxOverride;
                min = mmBk ? mmBk[0]! : 1;
                max = mmBk ? mmBk[1]! : 4;
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
                // ★IIIII105b：num9>-1 ⇒ 平台样式覆写（Bookshelves.cs:131 num11=num9）
                let shelfStyle = swl === wallVariants[1] ? shelf[1] : swl === wallVariants[2] ? shelf[2] : shelf[0];
                if (num9 > -1) shelfStyle = num9;
                st.frameY[st.idx(x, y)] = 18 * shelfStyle;
                if (flag3) {
                  placeOnTableD(x, y - 1, BOOKS);   // ★平台19 ∈ tileTable
                  // ★IIIII204 勘误：本块是 DungeonGlobalBookshelves（DGB:131-138）的镜像，
                  //   不是 DGP/DungeonUtils.GenerateDungeonBook 链——原版 DGB 检查的就是
                  //   【刚放的书格】Main.tile[num5, num6-1].type == 50（1456/1457/1458 三版
                  //   逐字同，无 typo）；typo 版 Main.tile[placeY,placeY] 只存在于
                  //   DungeonUtils.GenerateDungeonBook（DGP:214 唯一调用方，本文件 :4025
                  //   的 DGP 镜像已按 typo 照抄）。旧码错把 typo 语义带进 DGB 镜像 →
                  //   对角格几乎恒非书 → 水书帧 90 恒不落（g 链活格 T50 帧债 ×5）。
                  if (rn(50) === 0 && y > (ws + rock) / 2.0
                    && inW(x, y - 1, 0) && typAt(x, y - 1) === BOOKS) {
                    st.frameX[st.idx(x, y - 1)] = 90;   // frameX = 90 水书伪装帧（DGB:135-137）
                  }
                }
                x += n7;
                n10--;
              }
              i158Log(`BATT-OK s=${instIdx + 1} x=${num8} y=${y} c=${cnt98} min=${min} max=${max} n9=${num9} f3=${flag3 ? 1 : 0} w=${wallAt(num8, y)}`);
              ncount = 0; num3++;
              if (!flag3 && rn(2) === 0) {
                x = num8; y--;
                // flag2 门（cs:148-196）：true → Next(4) 选 13/49；false → 直放 13（少 1 掷）。
                //   ★IIIII105b：dual 座 minimumWaterCandles>0 ⇒ num12 强制 49（cs:169-171）；
                //   bookMinWC 特性内自持（Bookshelves.cs:33-42 非 Furniture 共享 ref）。
                let n12v: number;
                if (flag2) {
                  if (gfStyles.length > 0 && bkMinWC.v > 0) n12v = 49;
                  else n12v = rn(4) === 0 ? 49 : 13;
                } else n12v = 13;
                // v_13_placed_bottles（sheet 13）——曾误写 'v_13_bottles'（不存在的键）：
                // undefined 被 Uint16Array 吞成 type 0，且下行 frameX 掷骰恒不触发（流欠耗）。
                const bkPlaced = placeSimple(x, y, n12v === 49 ? WATER_CANDLE : TILE_BY_KEY['v_13_placed_bottles']!);
                if (gfStyles.length > 0 && bkMinWC.v > 0 && bkPlaced
                  && inW(x, y, 0) && typAt(x, y) === WATER_CANDLE) bkMinWC.v--;   // cs:184-186
                // ★IIIII204：DungeonGlobalBookshelves（DGB:177-190 两臂同构 DU:397-403）——
                //   type==13 后 Next(2)==0→frameX=18 否则 36。旧码掷已耗而值被丢弃=恒帧 0。
                if (inW(x, y, 0) && typAt(x, y) === TILE_BY_KEY['v_13_placed_bottles']) {
                  st.frameX[st.idx(x, y)] = rn(2) === 0 ? 18 : 36;
                }
              }
            }
          }
        }
      }
      if (ncount > 1000) { i158Log(`BATT-ST s=${instIdx + 1} n5=${x} n6=${y}`); ncount = 0; num3++; }
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
    // ★IIIII179 观测钩（SW_I179=1;零掷 logging-only,x86 DR| 同构）：
    //   LN=near 破位 / L7=Next(7) 耗骰位 / LCHS·LLN=吊灯·灯笼臂样式表态 / LPCF=吊灯试后未落型
    const i179L = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I179;
    const mk179L = (ln: string): void => { (globalThis as { __swI113?: (line: string) => void }).__swI113?.(ln); };
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
    // ★IIIII109b 定罪（I 族=Lights 窗 −207k 主项）：num5 漏乘 data.globalFeatureScalar
    //   （DungeonGlobalLights.cs:31 `(int)((double)(28f*num)*data.globalFeatureScalar)`）。
    //   dual 座 scalar=Max(1,rooms.Count/20)≈6.45（DC.cs:381，gfFeatScalar=provider 出口
    //   原值），普通世界恒 1.0（DC.cs:375 默认支不覆写）⇒ 非 dual 零扰动。x86 每"灯位"
    //   掷耗 JS≈1417 vs 1371（3.3% 残差）——几何面已对齐，缺口全在本配额。
    const num5 = Math.trunc(28 * (w / 4200) * gfFeatScalar);
    let ncount = 0, num4 = 0;
    // ★105c 取证仪（dormant）：SW_I137_LIGHTS=1 时漏斗计数——批后可整段移除。
    const lgSt137 = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I137_LIGHTS;
    const LF = lgSt137 ? ((globalThis as unknown as { __dglF?: Record<string, number> }).__dglF ??= {}) : null;
    while (num4 < num5) {
      ncount++;
      const x = ri(bounds.L, bounds.R - 1);
      const y = ri(bounds.T, bounds.B - 1);
      // ★IIIII179：LAT=逐 attempt 墙门（x86 同构;受理面直读）
      if (i179L) mk179L(`DR|LAT|x=${x}|y=${y}|g=${gfIsDW(wallAt(x, y)) ? 1 : 0}`);
      if (LF) { LF.attempt = (LF.attempt ?? 0) + 1;
        if (!(globalThis as { __dglPrint?: number[] }).__dglPrint) (globalThis as { __dglPrint?: number[] }).__dglPrint = [bounds.L, bounds.T, bounds.R, bounds.B]; }
      // ★IIIII105c：Lights 全域谓词座面化（IsConsideredDungeonWall/Tile 消费
      //   CurrentDungeonGenVars 合并表，DU.cs:1929-1950/:1844-1869）——seat1 的
      //   Snow71/Desert187/Hallow28/Temple87 族墙此前被静态集整门拒斥=G→I 窗
      //   −201k/−221k under-roll 主源。_gfSeat* 未装配（普通世界）回退旧径逐位同。
      if (gfIsDW(wallAt(x, y))) {
        for (let cy = y; cy > bounds.T; cy--) {
          if (lgTr && inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && gfIsBkDT(typAt(x, cy - 1))) {
            const uL = (rng as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
            let fh = 0x811c9dc5;
            for (let q = 0; q < 56; q++) { const v = uL.seedArray[q]! >>> 0; for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((v >>> s2) & 0xff), 16777619) >>> 0; }
            const uix = uL.inext >>> 0;
            for (let s2 = 0; s2 < 32; s2 += 8) fh = Math.imul(fh ^ ((uix >>> s2) & 0xff), 16777619) >>> 0;
            console.log(`A|${x}|${cy}|${fh.toString(16)}`);
          }
          if (!(inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && gfIsBkDT(typAt(x, cy - 1))
            && featOK(x, cy, 0)
            && ((entExists && entBounds.contains(x, cy)) || gfIsDW(wallAt(x, cy))))) continue;
          if (LF) LF.cand = (LF.cand ?? 0) + 1;
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
          // ★IIIII179 观测钩（SW_I179=1;零掷,__swI113 未挂载=零开销）：LN=near 破位
          if (near) { if (i179L) mk179L(`DR|LN|x=${x}|cy=${cy}`); break; }
          let placed = false;
          const r7 = rn(7);
          if (i179L) mk179L(`DR|L7|x=${x}|cy=${cy}|v=${r7}`);
          if (lgTr) console.log(`DG R7 x=${x} cy=${cy} v=${r7}`);
          if (r7 === 0) {
            // ★HHHHHHH（2026-08-24）② 吊灯资格门 1457 化 + ★IIIII105c 座面化：
            //   DungeonGlobalLights.cs:71-100 原文序——Next(7) 在前；阻挡扫描
            //   SolidTile 全项版 k<15；GetStyleForWall(座表)=null∨ChandelierItemTypes
            //   ==null ⇒ 整支不进；len==0∨Style==0 ⇒ data.chandelierItemType
            //   （2652+theme）/GOTHIC 5744（墙 94-105），否则 items[Next(len)]。
            //   成功判定=落型后 type==34（全部吊灯 item 的 Derived 均 tile34，
            //   style 来自 ITEM_PLACE：Item.cs 25748(27+type−2652)/45030/样式各档）。
            let blocked = false;
            for (let k = 0; k < 15 && !blocked; k++) {
              // ★IIIII87（DungeonGlobalLights.cs:75-80）：阻挡扫描用 WorldGen.SolidTile
              //   全项版（含 !halfBrick && slope==0，cs:70664）——与 IIII68 横幅停船
              //   循环同刀。窄化版 dgSolid 曾让坡位/半砖格漏判实心 → JS 在真值拒绝带
              //   多挂吊灯（sparkle/rainbow #32 残差主因之一）。
              if (inW(x, cy + k, 0) && dgSpreadSolid(x, cy + k)) { blocked = true; break; }
            }
            const chwl = wallAt(x, cy);
            const cSty = gfStyles.length > 0
              ? gfStyleForWall(chwl)
              : (gfIsDW(chwl) ? DG_DEFAULT_STUB : null);
            let chOK = false;
            // ★IIIII179：LCHS=吊灯臂样式/表态（x86 同构;仅 !blocked 臂与 cs 位置对位）
            if (i179L && !blocked) mk179L(`DR|LCHS|x=${x}|cy=${cy}|s=${cSty === null ? -1 : cSty.Style}|ct=${cSty === null || cSty.Lch === undefined || cSty.Lch.ChandelierItemTypes === null ? -2 : cSty.Lch.ChandelierItemTypes.length}`);
            if (!blocked && cSty !== null && cSty.Lch !== undefined && cSty.Lch.ChandelierItemTypes !== null) {
              const chT = cSty.Lch.ChandelierItemTypes;
              let chStyleNum = 0, chPlace = false, chItemId = -1;
              if (chT.length === 0 || cSty.Style === 0) {
                // Default 支：data.chandelierItemType（2652+theme）→ Derived=(34,27+theme)
                chStyleNum = (chwl >= 94 && chwl <= 105) ? 53 : 27 + theme;   // GOTHIC=item5744
                chItemId = (chwl >= 94 && chwl <= 105) ? 5744 : 2652 + theme;
                chPlace = true;
              } else {
                const chItem = chT[rn(chT.length)]!;
                chItemId = chItem;
                const pd = ipOf(chItem);
                if (pd.t >= 0) { chStyleNum = pd.s ?? 0; chPlace = true; }    // tileType<0 整支跳过
              }
              chOK = chPlace && placeChand(x, cy, chStyleNum);
              // ★IIIII179：LPCF=吊灯尝试后未落型（x86 同构;i=item id）
              if (i179L && chPlace && !chOK) mk179L(`DR|LPCF|x=${x}|cy=${cy}|i=${chItemId}`);
            }
            if (lgTr) console.log(`DG CH x=${x} cy=${cy} gate=${cSty !== null ? 1 : 0} blocked=${blocked ? 1 : 0}`);
            if (chOK) {
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
          // 灯笼支（DungeonGlobalLights.cs:104-135）★IIIII105c 座面化：
          //   GetStyleForWall=null∨LanternItemTypes==null ⇒ 整支不进且**不 break**
          //   （上扫继续——本表全部风格档 Lantern 非 null,该分支目前不可达,照抄）。
          //   Default 支（null∨Style==0∨len==0）：变体三档 ladder→Next(3)&&墙94-105
          //   GOTHIC 53 覆写（★R11-D2：Next(3) 在锚定预检前恒耗）；表支：
          //   items[Next(len)]→Derived（tileType+tileStyle）直进 Place1x2Top，
          //   无 Next(3)、无变体 ladder。成功判定 type==num10 ⇔ 预检通过即落型。
          const lwl = wallAt(x, cy);
          const lSty = gfStyles.length > 0 ? gfStyleForWall(lwl) : (gfIsDW(lwl) ? DG_DEFAULT_STUB : null);
          const lantT = lSty !== null && lSty.Lch !== undefined ? lSty.Lch.LanternItemTypes : undefined;
          // ★IIIII179：LLN=灯笼臂样式/表态（x86 同构;cs:104-112 位置）
          if (i179L) mk179L(`DR|LLN|x=${x}|cy=${cy}|s=${lSty === null ? -1 : lSty.Style}|lt=${lSty === null || lSty.Lch === undefined || lSty.Lch.LanternItemTypes === null ? -2 : lSty.Lch.LanternItemTypes.length}`);
          // 外层门（cs:112）：null ∨ LanternItemTypes != null 才进两臂（否则不置不破）
          if (lSty === null || (lSty.Lch !== undefined && lantT !== null)) {
            const isDefArm = lSty === null || lSty.Style === 0
              || (lantT as number[]).length === 0;
            if (LF) LF.lanArm = (LF.lanArm ?? 0) + 1;
            const gothicRoll = isDefArm ? rn(3) : -1;         // Next(3) 仅 Default 臂（cs:128）
            // 灯笼（Place1x2Top :46694：上方实心且下方净空 → 两格）
            const aboveSheet = TILE_DEFS[typAt(x, cy - 1)]?.vanilla?.sheet ?? -1;
            // 上格实心判定走生成期覆写表（裂纹砖 481-483 本 pass 起非实心——DC:344），
            // 勿读静态 TILE_DEFS.solid（dungeonI 转写债根因之一）
            const aboveSolid = genSolidType(typAt(x, cy - 1));
            // nactive()（active&&!inActive）——MMMM 批：致动柱格不可挂灯笼（Place1x2Top :46705）
            const abvInact = inW(x, cy - 1, 0) && ((st.wire[st.idx(x, cy - 1)] >>> 5) & 1) !== 0;
            if (inW(x, cy - 1, 0) && actAt(x, cy - 1) !== 0 && aboveSolid && !abvInact && !DG_SOLID_TOP.has(aboveSheet)
              && inW(x, cy + 1, 0) && actAt(x, cy + 1) === 0) {
              if (lgTr) console.log(`DG LP x=${x} cy=${cy} typAbv=${aboveSheet}`);
              let lNum10 = 42, lStyle: number;
              if (!isDefArm) {
                const lItem = (lantT as number[])[rn((lantT as number[]).length)]!;
                const pd = ipOf(lItem);
                lNum10 = pd.t >= 0 ? pd.t : -1;               // 表支无 Next(3)/无 ladder
                lStyle = pd.s ?? 0;
              } else {
                // Default：变体三档（Lights :109-118）+ GOTHIC 覆写（cs:128-132）
                lStyle = (gothicRoll === 0 && lwl >= 94 && lwl <= 105) ? 53
                  : lwl === wallVariants[1] ? lantern[1] : lwl === wallVariants[2] ? lantern[2] : lantern[0];
              }
              if (lNum10 >= 0) {
                const ltInternal = TILE_INTERNAL_BY_SHEET.get(lNum10) ?? LANTERN;
                if ((__swProcessEnv ?? {}).SW_I101_MARK) (globalThis as { __wvLines?: string[] }).__wvLines?.push(`MARK|LLNT|${x},${cy}|s=${lStyle}`);
                chTile(st.idx(x, cy), ltInternal, false);
                chTile(st.idx(x, cy + 1), ltInternal, false);
                // Place1x2Top 帧式（:46711-46717）：frameY=style*36（下格 +18）、frameX=0
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
            }
            break;                                            // 两臂同以 break 终结上扫（:131/:134）
          }
        }
      }
      if (ncount > 1000) { num4++; ncount = 0; }
    }
    if (lgSt137) console.log(`LGST attempt=${LF!.attempt} outerDW=${LF!.outerDW ?? 0} cand=${LF!.cand ?? 0} lanArm=${LF!.lanArm ?? 0} num4=${num4} n5=${num5} bounds=${bounds.L},${bounds.T},${bounds.R},${bounds.B}`);
  }
  function placeChand(x: number, y: number, styleOverride?: number): boolean {
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
    // ★IIIII105c：styleOverride——表支（ChandelierItemTypes→Derived.placeStyle）直传；
    // 缺省=旧 Default 支内部推导（GOTHIC?53 : 27+theme），普通世界逐位同。
    const wl = wallAt(x, y);
    const style = styleOverride ?? ((wl >= 94 && wl <= 105) ? 53 : 27 + theme);
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
    // ★IIIII165：LSW 每调用 iters/ok 账（__swI113 未挂载=零开销 dormant；x86 DR|LSW 同构）
    const i165 = (globalThis as { __swI113?: (line: string) => void }).__swI113;
    let lswIters = 0, lswOk = 0;
    for (let i = 0; i < 1000; i++) {
      lswIters++;
      const a = x + ri(-12, 12);
      const b = y + ri(3, 20);
      const sgInW = inW(a, b, 0) && inW(a, b + 1, 0);
      const sgAct = sgInW && actAt(a, b) === 0 && actAt(a, b + 1) === 0;
      const sgL = sgAct && inW(a - 1, b, 0) && gfIsBkDT(typAt(a - 1, b));   // ★105c 座面化
      const sgR = sgL && inW(a + 1, b, 0) && gfIsBkDT(typAt(a + 1, b));
      const sgH = sgR && canHitLocal(a, b, x, y);
      if (swTr) console.log(`DG SW i=${i} x=${x} y=${y} a=${a} b=${b} inW=${sgInW ? 1 : 0} act=${sgAct ? 1 : 0} dtL=${sgL ? 1 : 0} dtR=${sgR ? 1 : 0} hit=${sgH ? 1 : 0} tL=${inW(a - 1, b, 0) ? TILE_DEFS[typAt(a - 1, b)]?.vanilla?.sheet ?? -1 : -1} tR=${inW(a + 1, b, 0) ? TILE_DEFS[typAt(a + 1, b)]?.vanilla?.sheet ?? -1 : -1} aL=${inW(a - 1, b, 0) ? actAt(a - 1, b) : -1} aR=${inW(a + 1, b, 0) ? actAt(a + 1, b) : -1}`);
      if (!sgInW) continue;
      if (!sgAct) continue;
      if (!sgL) continue;
      if (!sgR) continue;
      if (!sgH) continue;
      const anchor = (dgSolid(a - 1, b) && typAt(a - 1, b) !== DOOR)
        || (dgSolid(a + 1, b) && typAt(a + 1, b) !== DOOR) || dgSolid(a, b + 1);
      if (anchor && gfIsDW(wallAt(a, b)) && (gfIsBkDT(typAt(a - 1, b)) || gfIsBkDT(typAt(a + 1, b)))) {   // ★105c
        if (actAt(a, b) === 0) {
          const si = st.idx(a, b);
          st.flags[si] = 1; st.type[si] = DSWITCH;
          st.slope[si] = 0; st.half[si] = 0;   // PlaceTile(136)（DGL Lights_GenerateSwitch:173）
          lswOk = 1;
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
    i165?.(`DR|LSW|x=${x}|y=${y}|iters=${lswIters}|ok=${lswOk}`);
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
    // ★IIIII114b2（T 同刀·三件套同落）：①配额 gfFeatScalar——C# `(int)((double)(8.4f*num)*
    //   data.globalFeatureScalar)`（DungeonGlobalTraps.cs:31）dual 座≈6.55、普通世界恒 1.0
    //   （XLIII 遗账「Traps:31 全额档」）；②dual 支受理序补齐 CanGenerateFeatureAt +
    //   !Temple.WallIsInStyle（:515-517 三谓词序；legacy 支原文两谓词不动）；
    //   ③Temple mayan 尾整缺补移植（:523-620：num8=30/50/70+Next 档→style10 厅/房/
    //   progression 界域三段掷位，may_trap=TemplePass mayanTrap 复用，rng=主流同源）。
    const isDual = gfStyles.length > 0;
    const tAtt = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1';
    const TF = tAtt && isDual ? ((globalThis as unknown as { __swT154?: Record<string, number> }).__swT154 ??= {}) : null;
    const num5 = Math.trunc(8.4 * (w / 4200) * gfFeatScalar);
    let ncount = 0, num4 = 0;
    while (num4 < num5) {
      ncount++;
      const x = ri(bounds.L, bounds.R - 1);
      const y = ri(Math.trunc(ws), bounds.B - 1);
      // ★IIIII179：TRP=陷阱逐 attempt（x86 同构;dual 支三门直读）
      if (i179F) mk179R(`DR|TRP|x=${x}|y=${y}|g=${isDual ? (gfIsDW(wallAt(x, y)) && featOK(x, y, 0) && !wallIsInStyle(DungeonGenerationStyles.Temple, wallAt(x, y)) ? 1 : 0) : (gfIsDW(wallAt(x, y)) ? 1 : 0)}`);
      let okT = false;
      if (isDual) {
        // ★IIIII114b2：dual 支谓词一=**座面合并集** gfIsDW（C# IsConsideredDungeonWall=
        //   Main.wallDungeon ∪ CurrentDungeonGenVars.isDungeonWall,DU.cs:1937-1957——
        //   seat1 Snow/Desert/Hallow/Temple 墙 349/187/28/87 全靠座内扩张）；旧 isDW
        //   静态 {7,8,9,94..99} 仅 legacy 等价。
        const d1 = gfIsDW(wallAt(x, y));
        const d2 = d1 && featOK(x, y, 0);
        const d3 = d2 && !wallIsInStyle(DungeonGenerationStyles.Temple, wallAt(x, y));
        okT = d3 && placeTrap0(x, y);
        if (TF) {
          TF.att = (TF.att ?? 0) + 1;
          if (d1) TF.dw = (TF.dw ?? 0) + 1;
          if (d2) TF.feat = (TF.feat ?? 0) + 1;
          if (d3) TF.temple = (TF.temple ?? 0) + 1;
          if (okT) TF.placed = (TF.placed ?? 0) + 1;
        }
      } else {
        okT = isDW(wallAt(x, y)) && placeTrap0(x, y);
      }
      if (okT) {
        ncount = 1000;
        const WV65t = (globalThis as { __wvLines?: string[] }).__wvLines;
        if (WV65t) WV65t.push(`MARK|dg_trap ok ${num4} ${x},${y}`);
      }
      if (tAtt) console.log(`T-ATT w=${num4} x=${x} y=${y} c=${ncount}|mr=${dgMainRolls}`);
      if (ncount > 1000) { num4++; ncount = 0; }
    }
    if (TF) {
      console.log(`T-GATES att=${TF.att} dw=${TF.dw ?? 0} feat=${TF.feat ?? 0} temple=${TF.temple ?? 0} placed=${TF.placed ?? 0}|mr=${dgMainRolls}`);
      (globalThis as unknown as { __swT154?: Record<string, number> }).__swT154 = undefined;
    }
    // —— Temple mayan 尾（cs:523-620，dual 独占；普通世界整跳零扰动）——
    if (isDual) {
      let num8 = 30;
      switch (worldSizeIdx()) {
        case 0: num8 = 30 + ri(0, 10); break;
        case 1: num8 = 50 + ri(0, 15); break;
        default: num8 = 70 + ri(0, 20); break;
      }
      if (gs.seedFlags.actuallyNoTraps) num8 = 0;
      if (num8 > 0) {
        if (tAtt) console.log(`T-TAIL num8=${num8}|mr=${dgMainRolls}`);
        let num9 = num8;
        let hhN = 0;
        const mayanTry = (tx: number, ty: number, styObj: import('./DungeonStyles1457').DungeonStyleData): boolean =>
          !((st.flags[st.idx(tx, ty)] ?? 0) & 1)
          && wallIsInStyle(styObj, wallAt(tx, ty))
          && mayanTrap(st, rng, gs, tx, ty);
        // ①厅段（Style==10 且 generated，Bounds 半开界）
        for (const hh of gfPdHalls) {
          if (!hh.gen || hh.st !== 10 || hh.gL === undefined) continue;
          hhN++;
          const x = ri(hh.gL, hh.gR! - 1);
          const y = ri(hh.gT!, hh.gB! - 1);
          if (mayanTry(x, y, DungeonGenerationStyles.Temple)) { num9--; if (num9 <= 0) break; }
        }
        if (tAtt) console.log(`T-HALLS n=${hhN} left=${num9}|mr=${dgMainRolls}`);
        // ②房段（Style==10 且 generated，InnerBounds）
        if (num9 > 0) {
          let rmN = 0;
          for (const rm2 of rooms) {
            if (rm2.st !== 10) continue;
            rmN++;
            const x = ri(rm2.inner.L, rm2.inner.R - 1);
            const y = ri(rm2.inner.T, rm2.inner.B - 1);
            if (mayanTry(x, y, DungeonGenerationStyles.Temple)) { num9--; if (num9 <= 0) break; }
          }
          if (tAtt) console.log(`T-ROOMS n=${rmN} left=${num9}|mr=${dgMainRolls}`);
        }
        // ③界域段（genVars.dungeonGenerationStyles style10 席 × outerProgressionBounds）
        if (num9 > 0 && _gfSeatProgBounds !== null) {
          for (let k2 = 0; k2 < gfStyles.length; k2++) {
            if (gfStyles[k2]!.Style !== 10) continue;
            const bb = _gfSeatProgBounds[k2]!;
            let num14 = 1000;
            let bbN = 0;
            while (num9 > 0) {
              num14--;
              if (num14 <= 0) break;
              const x = ri(bb.L, bb.R - 1);
              const y = ri(bb.T, bb.B - 1);
              bbN++;
              if (mayanTry(x, y, gfStyles[k2]!)) num9--;
            }
            if (tAtt) console.log(`T-BOUNDS n=${bbN} left=${num9}|mr=${dgMainRolls}`);
            break;
          }
        }
      }
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
        // ★IIIII99d：style 透传（vanilla PlaceTile(101,style)，曾丢 style=帧带恒 0）
        if (iBook > -1) place3x4D(num3, j, DG_ITEM_TILE[iBook], DG_ITEM_STYLE[iBook] ?? 0);
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
          // ★IIIII99d：style 透传（Place4x2(...,direction,style) 原版形）
          if (place4x2D(num3, j, DG_ITEM_TILE[iBed], dir, DG_ITEM_STYLE[iBed] ?? 0)) { dgFurnResult = 'ok'; return; }
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
          // ★IIIII99d：style 透传（浴缸 item2658-60→21/22/23、5739→47）
          if (place4x2D(num3, j, DG_ITEM_TILE[iTub], dir, DG_ITEM_STYLE[iTub] ?? 0)) { dgFurnResult = 'ok'; return; }
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
  // ============ ★IIIII105b DungeonGlobalGroundFurniture —— DualDungeons 分派 ============
  // 裁决源 Terarria1458/Terraria.GameContent.Generation.Dungeon.Features/
  //   DungeonGlobalGroundFurniture.cs：分派 GenerateFeature:22-31（Type==DualDungeon →
  //   GroundFurniture_DualDungeons :34-185；else legacy GroundFurniture :187-253=上方
  //   dgFurniture 已认证体）。本段=d1/d0 双座分派全函数 + ActuallyGenerateFurniture
  //   (:255-861) 的 dual 全参体（legacy 体上方 dgFurnAt 保留七链金标零扰动）。
  // 关键语义（与本仓静态表差异）：
  //   · IsConsideredDungeonWall（DU.cs:1929-1950）＝Main.wallDungeon{7,8,9,94-99} ∪
  //     **CurrentDungeonGenVars.isDungeonWall**（per-seat styles 扩张：Snow71/Desert187/
  //     Hallow28/Temple87+ExtraWallTypes40/216/223 等，DC.cs:147-185 克隆合并族）——
  //     d1 房间内恒可命中候选（x86 box-snapshot 序列 046_dg_dungeonF 实证 w71 空格上
  //     workbench/piano/sofa 入场），旧 JS isDW 静态集为 F 相样本爆炸根源。
  //   · alch/bew 清零臂(:41-53)：genVars.dungeonGenerationStyles 无 Style==0 ⇒ 清零——
  //     seat1=[Snow2,Desert3,Hallow6,Temple10] 恒无 ⇒ d1 双计数恒 0/0；
  //     seat0 含 Default0(主题砖座) ⇒ (int)((1f+(int)(w/4200))*scalar)=int(2*6.55)=13/13。
  //   · minimumWaterCandles(:54-63)：GetWorldSize()==maxTilesX<=4200→**0**→5
  //     （switch{1=>10,2=>15,_=>5}；本世界 W=4200 ⇒ 5。批注勘误"10"不成立）。
  //   · halls 臂(:126-183)：Bounds 框、count=GetFurnitureCount(6)、第二尝试 strict:true+
  //     noRegularFurnitureAreaChecks:true（noReg 尺寸全表 :440-507 + num22=num19 :549-555 +
  //     area-check active 中止门关闭 :529-535 + bew 支 :566-573 原文同构）。

  type GFSeatFeat = NonNullable<import('./DungeonDualLayout').DualLayoutResult['featRooms']>;
  interface GFItemRef { v: number }
  let dgFurnDualResult: '' | 'alch' | 'bew' | 'ok' = '';
  /** per-seat 特征载荷与 climb 大厅基线（runDualDungeonLayout 返回后装配） */
  // ★IIIII107c：+o*/bio 可选字段（S1..S7 臂 OuterBounds/BiomeDungeonRoom 门消费面）
  const gfFeatRooms: Array<{ gen: boolean; st: number; L: number; T: number; R: number; B: number;
    oL?: number; oT?: number; oR?: number; oB?: number; bio?: boolean }> = [];
  const gfFeatHalls: Array<{ gen: boolean; st: number; L: number; T: number; R: number; B: number }> = [];
  /** ★IIIII109b：GenerateEarlyDungeonFeaturesInRoom 每房分派载荷（cs:588-591 循环序）。
   *  provider 出口装配 + climb 插入房尾随追加（cs :446-458 Legacy 插入房亦属
   *  data.dungeonRooms ⇒ 基类窗/FloodRoom 支可达）。 */
  const gfEarlyRooms: import('./DungeonDualLayout').DualEarlyRoom[] = [];
  let gfFeatScalar = 1.0;
  let gfStyles: import('./DungeonStyles1457').DungeonStyleData[] = [];
  /** ★IIIII111c：本座 genVars.dungeonStyle（PD 面三级解析的末级回退,seat1 表无 style0）。 */
  let gfDefaultStyle: import('./DungeonStyles1457').DungeonStyleData | null = null;
  /** ★IIIII111c：PD 面厅载荷（provider 厅序=entrance stairwell→calculator 厅；climb 厅
   *  由 halls 数组尾随=C# dungeonHalls 全序）。 */
  const gfPdHalls: NonNullable<import('./DungeonDualLayout').DualLayoutResult['pdHalls']> = [];
  /** ★IIIII105c：BiomeChests_DualDungeons 桶（provider chestPlan 桥,普通世界恒 undefined） */
  let gfChestPlan: NonNullable<import('./DungeonDualLayout').DualLayoutResult['chestPlan']> | undefined;
  const _I132M = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I132_MARK;
  const emit132 = (ln: string): void => {
    if (!_I132M) return;
    ((globalThis as { __wvLines?: string[] }).__wvLines ??= []).push(`${ln}|rc=${dgMainRolls}`);
  };
  /** WorldGen.SolidTileAllowBottomSlope（WorldGen.cs:70706-70730）——FirstSolid 下扫谓词。
   *  平台集合=TileID.Sets.Platforms={19}（生成域内其余平台型皆不入该 Set）。 */
  const _GF_PLATS = new Set<number>([19]);
  const solidAllowBottomDg = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const ti = st.idx(x, y);
    if (!(st.flags[ti] & 1)) return false;
    if ((st.wire[ti] >>> 5) & 1) return false;
    const sheet = TILE_DEFS[st.type[ti]]?.vanilla?.sheet ?? -1;
    if (!(genSolidType(st.type[ti]) || DG_SOLID_TOP.has(sheet))) return false;   // ★vanilla tileSolid||tileSolidTop（cs:70706-70730）；solidTop 语义=本文件 DG_SOLID_TOP 集合
    const slope = st.slope[ti];
    if ((slope === 1 || slope === 2)) {                 // topSlope → 平台 properTopFrame 例外
      if (!_GF_PLATS.has(sheet) || st.half[ti] === 0) return false;
      return true;
    }
    return st.half[ti] === 0;
  };
  /** GetStyleForWall（DungeonGenerationStyles.cs:745-764）：style0 ∧ Main.wallDungeon；
   *  其余档 WallIsInStyle(includeWindows:false, includeExtras:true)；递归 SubStyles 一层。 */
  const gfStyleForWall = (wallType: number): import('./DungeonStyles1457').DungeonStyleData | null => {
    for (const style of gfStyles) {
      if (style.Style === 0 && wallType >= 0 && DG_DUNGEON_WALLS.has(wallType)) return style;
      if (wallIsInStyle(style, wallType, false, true)) return style;
      if (style.SubStyles !== undefined && style.SubStyles.length > 0) {
        for (const sub of style.SubStyles) if (wallIsInStyle(sub, wallType, false, true)) return sub;
      }
    }
    return null;
  };
  /** GroundFurniture_GetFurnitureItem（cs:863-874）：null→-1 不掷；空表∨Style==0→default；
   *  否则 items[Next(len)]（恰一掷）。 */
  const gfGetItem = (
    styleData: import('./DungeonStyles1457').DungeonStyleData,
    defaultItem: number, items: readonly number[] | null,
  ): number => {
    if (items === null) return -1;
    if (items.length === 0 || styleData.Style === 0) return defaultItem;
    return items[rn(items.length)]!;
  };
  // noRegularFurnitureAreaChecks 尺寸全表（cs:466-509）×常规表（cs:375-439）
  const _G19 = [5, 4, 3, 4, 3, 5, 5, 5, 5, 5, 2, 3, 2];
  const _G20 = [4, 3, 5, 6, 3, 3, 4, 4, 4, 3, 4, 3, 5];
  const _GN19R = [3, 2, 3, 3, 1, 4, 4, 4, 4, 4, 1, 2, 2];
  const _GN20R = [4, 3, 5, 6, 3, 4, 4, 4, 4, 3, 4, 3, 5];
  const ipOf = (item: number): { t: number; s: number } => {
    const rec = ITEM_PLACE[item];
    return { t: rec ? TILE_INTERNAL_BY_SHEET.get(rec.t) ?? -1 : -1, s: rec?.s ?? 0 };
  };
  /**
   * GroundFurniture_ActuallyGenerateFurniture（cs:255-861）dual 全参体。
   * refs.alch/bew/minWC 以 holder 模拟 C# ref（tmp 零计数支原文共享同一变量，但在
   * num21 门处必双双为零 ⇒ 两独立零值行为等价）；minWC 恒共享同一 ref。
   */
  // ★IIIII179 观测钩（SW_I179=1;零掷,x86 DR|GFC 同构）：GA=采点门 / GFC=逐呼叫
  //   （ss=GetStyleForWall.Style,n18=终抽型,rin=入口 jrc → 出口 jrc−rin=本呼叫掷耗）
  const i179G = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I179;
  const mk179G = (ln: string): void => { (globalThis as { __swI113?: (line: string) => void }).__swI113?.(ln); };
  let gfdArm = '?';
  let gfdSFW = -9;
  let gfdN18 = -9;
  function gfDActual(
    i: number, j: number, wallType: number,
    refs: { alch: GFItemRef; bew: GFItemRef; minWC: GFItemRef },
    stricterSpecialCheck: boolean, noReg: boolean,
  ): boolean {
    const rin = i179G ? ((globalThis as { __swRollTotal?: number }).__swRollTotal ?? -1) : -1;
    gfdSFW = -9; gfdN18 = -9;                                      // ★IIIII179 每呼复位（残值防污染）
    const res = gfDActualInner(i, j, wallType, refs, stricterSpecialCheck, noReg);
    if (i179G) mk179G(`DR|GFC|arm=${gfdArm}|x=${i}|y=${j}|w=${wallType}|ss=${gfdSFW}|n18=${gfdN18}|res=${res ? 1 : 0}|rin=${rin}`);
    return res;
  }
  function gfDActualInner(
    i: number, j: number, wallType: number,
    refs: { alch: GFItemRef; bew: GFItemRef; minWC: GFItemRef },
    stricterSpecialCheck: boolean, noReg: boolean,
  ): boolean {
    dgFurnDualResult = '';
    let num = i, k = i;
    while (inW(num, j, 0) && actAt(num, j) === 0 && dgSolidFT(num, j + 1)) num--;   // :259-262（左沿）
    num++;
    while (inW(k, j, 0) && actAt(k, j) === 0 && dgSolidFT(k, j + 1)) k++;            // :264-266（右沿）
    k--;
    const num2 = k - num, num3 = Math.trunc((k + num) / 2);                          // :268-269
    emit132(`MARK|dg_fs ${i},${j} n=${num} k=${k} n2=${num2} n3=${num3} alch=${refs.alch.v} bew=${refs.bew.v}`);
    if (!featOK(num3, j, 0)) return false;                        // data.CanGenerateFeatureAt(this,num3,j) :270
    // :274 候选门（active∨dungeon-wall∨下格实心∨下格 spike 簇四连判——wall=per-seat IsConsideredDungeonWall）
    if (!(inW(num3, j, 0) && actAt(num3, j) === 0 && gfIsDW(wallAt(num3, j))
      && dgSolidFT(num3, j + 1) && typAt(num3, j + 1) !== SPIKE)) {
      emit132(`MARK|dg_fc CR ${num3},${j}`); return false;
    }
    // :276-289 默认族基值（switch(wallType)：default=蓝蓝蓝…、case 8=绿、case 9=粉）
    let iChair = 1396, iTable = 1397, iWork = 1398, iCandle = 1405, iVase = 1408;
    let iBook = 1414, iBed = 1470, iPiano = 2376, iDress = 2386, iSofa = 2402;
    let iTub = 2658, iCand = 2664, iLamp = 2645, iClock = 3900;
    if (wallType === 8) {
      iChair = 1399; iTable = 1400; iWork = 1401; iCandle = 1406; iVase = 1409;
      iBook = 1415; iBed = 1471; iPiano = 2377; iDress = 2387; iSofa = 2403;
      iTub = 2659; iCand = 2665; iLamp = 2646; iClock = 3901;
    } else if (wallType === 9) {
      iChair = 1402; iTable = 1403; iWork = 1404; iCandle = 1407; iVase = 1410;
      iBook = 1416; iBed = 1472; iPiano = 2378; iDress = 2388; iSofa = 2404;
      iTub = 2660; iCand = 2666; iLamp = 2647; iClock = 3902;
    }
    const cw2 = wallAt(num3, j);
    if (cw2 >= 94 && cw2 <= 105) {                                // :325-341 GOTHIC 变体墙族
      iChair = 1509; iTable = 1510; iWork = 1511; iCandle = 5743; iVase = -1; iBook = 1512;
      iBed = 5740; iPiano = 5750; iDress = 5741; iSofa = 5753; iTub = 5739;
      iCand = 5742; iLamp = 5748; iClock = 5746;
    }
    // :342-363 风格表替换（flag/flag2 语义 + 14 家族按原文顺序逐项 GetFurnitureItem）
    let flag = true, flag2v = true;
    const styleForWall = gfStyleForWall(cw2);
    gfdSFW = styleForWall === null ? -1 : styleForWall.Style;   // ★IIIII179 观测
    const FURNOFF = styleForWall?.Furn ?? null;
    if (styleForWall !== null) {
      flag = styleForWall.Style === 0;
      flag2v = flag;
      iTable = gfGetItem(styleForWall, iTable, FURNOFF ? FURNOFF.TableItemTypes : null);
      iWork = gfGetItem(styleForWall, iWork, FURNOFF ? FURNOFF.WorkbenchItemTypes : null);
      iCandle = gfGetItem(styleForWall, iCandle, FURNOFF ? FURNOFF.CandleItemTypes : null);
      iVase = gfGetItem(styleForWall, iVase, FURNOFF ? FURNOFF.VaseOrStatueItemTypes : null);
      iBook = gfGetItem(styleForWall, iBook, FURNOFF ? FURNOFF.BookcaseItemTypes : null);
      iChair = gfGetItem(styleForWall, iChair, FURNOFF ? FURNOFF.ChairItemTypes : null);
      iBed = gfGetItem(styleForWall, iBed, FURNOFF ? FURNOFF.BedItemTypes : null);
      iPiano = gfGetItem(styleForWall, iPiano, FURNOFF ? FURNOFF.PianoItemTypes : null);
      iDress = gfGetItem(styleForWall, iDress, FURNOFF ? FURNOFF.DresserItemTypes : null);
      iSofa = gfGetItem(styleForWall, iSofa, FURNOFF ? FURNOFF.SofaItemTypes : null);
      iTub = gfGetItem(styleForWall, iTub, FURNOFF ? FURNOFF.BathtubItemTypes : null);
      iLamp = gfGetItem(styleForWall, iLamp, FURNOFF ? FURNOFF.LampItemTypes : null);
      iCand = gfGetItem(styleForWall, iCand, FURNOFF ? FURNOFF.CandelabraItemTypes : null);
      iClock = gfGetItem(styleForWall, iClock, FURNOFF ? FURNOFF.ClockItemTypes : null);
    }
    emit132(`MARK|dg_fw n3=${num3},${j} st=${styleForWall === null ? '-1' : String(styleForWall.Style)} n18=?`);
    // :364-372 家具型抽奖（13 型 + 大件二次机会 + 空缺重抽环）
    let num18 = rn(13);
    if ((num18 === 10 || num18 === 11 || num18 === 12) && rn(4) !== 0) num18 = rn(13);
    while ((num18 === 2 && iVase === -1) || (num18 === 5 && iBed === -1) || (num18 === 6 && iPiano === -1)
      || (num18 === 7 && iDress === -1) || (num18 === 8 && iSofa === -1) || (num18 === 9 && iTub === -1)
      || (num18 === 10 && iCand === -1) || (num18 === 11 && iLamp === -1) || (num18 === 12 && iClock === -1)) {
      num18 = rn(13);
    }
    // :373-439 常规尺寸表 / :440-507 noReg 尺寸全表
    let num19 = _G19[num18], num20 = _G20[num18];
    if (noReg) {
      num19 = _GN19R[num18];
      num20 = _GN20R[num18];
    }
    // :508-542 特征区扫描（内 rect break 只跳内层；stricter 时 A/B 台邻域旗号）
    let flag3 = false, flag4 = false;
    const num21 = (refs.alch.v > 0 || refs.bew.v > 0) ? 15 : 0;
    scanOuter:
    for (let a = num3 - num19 - num21; a <= num3 + num19 + num21; a++) {
      for (let b = j - num20 - num21; b <= j + num21; b++) {
        if (!inW(a, b, 0)) continue;
        if (a >= num3 - num19 && a <= num3 + num19 && b >= j - num20 && b <= j) {
          if (!featOK(a, b, 0)) { flag3 = true; break; }         // CanGenerateFeatureAt 逐格门
          if (!noReg && actAt(a, b) !== 0) { num18 = -1; break; }// noReg 时中止门关闭(:531)
        }
        if (stricterSpecialCheck && (refs.alch.v > 0 || refs.bew.v > 0)
          && actAt(a, b) !== 0 && (typAt(a, b) === ALCHEMY || typAt(a, b) === BEWITCH)) flag4 = true;
      }
    }
    if (flag3) return false;
    const widthMin = noReg ? num19 : num19 * 1.75;                // :547-555（noReg ⇒ num19）
    if (num2 < widthMin) num18 = -1;
    gfdN18 = num18;                                             // ★IIIII179 观测（终抽型）
    if (i179G) mk179G(`DR|GFN|x=${i}|y=${j}|n18=${num18}`);      // ★IIIII179 表+抽奖段检查点
    // :556-576 alch/bew 臂（stricterSpecialCheck 与 num18 无关照常受理）
    if (!(flag4 && flag2v) && flag2v && (refs.alch.v > 0 || refs.bew.v > 0)) {
      if (refs.alch.v > 0) {
        if (place3x3D(num3, j, ALCHEMY)) { refs.alch.v--; dgFurnDualResult = 'alch'; return true; }
      } else if (refs.bew.v > 0) {
        if (place3x3D(num3, j, BEWITCH)) { refs.bew.v--; dgFurnDualResult = 'bew'; return true; }
      }
    }
    const lightedAt = (x2: number, y2: number): boolean =>
      inW(x2, y2, 0) ? TILE_LIGHTED_D.has(st.type[st.idx(x2, y2)]) : false;
    /** candle 排池（cs:600-650 表支 / cs:637-649 非 Default 支） */
    const candlePool = (
      nFrom: number, nTo: number, rowOff: number,
    ): void => {
      for (let n = nFrom; n <= nTo; n++) {
        if (rn(2) !== 0) continue;                                 // :602 掷恒耗
        if (!inW(n, j + rowOff, 0) || actAt(n, j + rowOff) !== 0) continue;
        const lt = lightedAt(n - 1, j + rowOff);
        if (flag) {
          const num23raw = rn(5);                                  // :608 先掷后钳
          const num23 = refs.minWC.v > 0 ? 2 : num23raw;
          if (iCandle > -1 && num23 <= 1 && !lt) {
            const cd = ipOf(iCandle); placeOnTableD(n, j + rowOff, cd.t);
          } else if (num23 === 2 && !lt) {                         // :618-626 水烛臂数递减
            if (placeOnTableD(n, j + rowOff, WATER_CANDLE)) refs.minWC.v--;
            continue;
          } else if (num23 === 3) {
            placeOnTableD(n, j + rowOff, BOOKS);
          } else if (num23 === 4) {
            place2x1D(n, j + rowOff, TILE_BY_KEY['v_103_bowls']!);
          }
        } else {
          const num24 = rn(3);
          if (iCandle > -1 && num24 <= 1 && !lt) {
            const cd = ipOf(iCandle); placeOnTableD(n, j + rowOff, cd.t);
          } else if (num24 === 2) {
            place2x1D(n, j + rowOff, TILE_BY_KEY['v_103_bowls']!);
          }
        }
      }
    };
    // :577-652 十三型放置级联（顺序=cs 原文；书架支不置成功位/不递减配额 :744-748）
    if (iTable > -1 && num18 === 0) {
      const dd = ipOf(iTable);
      if (place3x2D(num3, j, dd.t, dd.s)) {
        if (iChair > -1) {
          const ch = ipOf(iChair);
          if (inW(num3 - 2, j, 0) && actAt(num3 - 2, j) === 0
            && place1x2D(num3 - 2, j, ch.t, ch.s)) {
            st.frameX[st.idx(num3 - 2, j)] = (st.frameX[st.idx(num3 - 2, j)] ?? 0) + 18;
            st.frameX[st.idx(num3 - 2, j - 1)] = (st.frameX[st.idx(num3 - 2, j - 1)] ?? 0) + 18;
          }
          if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) place1x2D(num3 + 2, j, ch.t, ch.s);
        }
        candlePool(num3 - 1, num3 + 1, -2);
        dgFurnDualResult = 'ok'; return true;
      }
    } else if (iWork > -1 && num18 === 1) {
      const dw = ipOf(iWork);
      if (place2x1D(num3, j, dw.t, dw.s)) {
        if (iChair > -1) {
          const ch = ipOf(iChair);
          if (rn(2) === 0) {
            if (inW(num3 - 1, j, 0) && actAt(num3 - 1, j) === 0
              && place1x2D(num3 - 1, j, ch.t, ch.s)) {
              st.frameX[st.idx(num3 - 1, j)] = (st.frameX[st.idx(num3 - 1, j)] ?? 0) + 18;
              st.frameX[st.idx(num3 - 1, j - 1)] = (st.frameX[st.idx(num3 - 1, j - 1)] ?? 0) + 18;
            }
          } else if (inW(num3 + 2, j, 0) && actAt(num3 + 2, j) === 0) {
            place1x2D(num3 + 2, j, ch.t, ch.s);
          }
        }
        candlePool(num3, num3 + 1, -1);
        dgFurnDualResult = 'ok'; return true;
      }
    } else if (iVase > -1 && num18 === 2) {
      const dv = ipOf(iVase);
      if (dv.t >= 0 && place2xXD(num3, j, dv.t, 3, dv.s)) { dgFurnDualResult = 'ok'; return true; }
    } else if (iBook > -1 && num18 === 3) {
      const db = ipOf(iBook);
      place3x4D(num3, j, db.t, db.s);                              // :744-748 无成功位
    } else if (iChair > -1 && num18 === 4) {
      const dc = ipOf(iChair);
      if (rn(2) === 0) {                                           // :752 方向掷两支必耗
        place1x2D(num3, j, dc.t, dc.s);
        st.frameX[st.idx(num3, j)] = (st.frameX[st.idx(num3, j)] ?? 0) + 18;
        st.frameX[st.idx(num3, j - 1)] = (st.frameX[st.idx(num3, j - 1)] ?? 0) + 18;
      } else {
        place1x2D(num3, j, dc.t, dc.s);
      }
      if (inW(num3, j, 0) && actAt(num3, j) !== 0 && st.type[st.idx(num3, j)] === dc.t) {
        dgFurnDualResult = 'ok'; return true;
      }
    } else if (iBed > -1 && num18 === 5) {
      const dbd = ipOf(iBed);
      if (dbd.t >= 0) {                                            // :770 tileType>=0 门
        const dir = rn(2) === 0 ? 1 : -1;
        if (place4x2D(num3, j, dbd.t, dir, dbd.s)) { dgFurnDualResult = 'ok'; return true; }
      }
    } else if (iPiano > -1 && num18 === 6) {
      const dp = ipOf(iPiano);
      if (place3x2D(num3, j, dp.t, dp.s)) { dgFurnDualResult = 'ok'; return true; }
    } else if (iDress > -1 && num18 === 7) {
      const dd2 = ipOf(iDress);
      if (place3x2D(num3, j, dd2.t, dd2.s)) { dgFurnDualResult = 'ok'; return true; }
    } else if (iSofa > -1 && num18 === 8) {
      const ds = ipOf(iSofa);
      if (place3x2D(num3, j, ds.t, ds.s)) { dgFurnDualResult = 'ok'; return true; }
    } else if (iTub > -1 && num18 === 9) {
      const dt = ipOf(iTub);
      if (dt.t >= 0) {                                             // :816
        const dir = rn(2) === 0 ? 1 : -1;
        if (place4x2D(num3, j, dt.t, dir, dt.s)) { dgFurnDualResult = 'ok'; return true; }
      }
    } else if (iLamp > -1 && num18 === 10) {
      const dl = ipOf(iLamp);
      if (dl.t >= 0 && place1xXD(num3, j, dl.t, 3, dl.s)) { dgFurnDualResult = 'ok'; return true; }
    } else if (iCand > -1 && num18 === 11) {
      const dca = ipOf(iCand);
      if (place2x2D(num3, j, dca.t, dca.s)) { dgFurnDualResult = 'ok'; return true; }
    } else if (iClock > -1 && num18 === 12) {
      const dk = ipOf(iClock);
      if (dk.t >= 0 && place2xXD(num3, j, dk.t, 5, dk.s)) { dgFurnDualResult = 'ok'; return true; }
    }
    return false;
  }

  /** DungeonUtils.FirstSolid(ceiling:false,…,:532-559) 下扫版（mscale=Main.maxTilesX*5 上限）。 */
  function gfFirstSolidDown(sx: number, sy: number, bd: { L: number; T: number; R: number; B: number } | null): { x: number; y: number } {
    let px = sx, py = sy;
    let mscale = w * 5;
    const inB = (): boolean => bd === null || (px >= bd.L && px < bd.R && py >= bd.T && py < bd.B);
    do {
      mscale--;
      if (mscale <= 0) break;
      if (solidAllowBottomDg(px, py)) return { x: px, y: py };
      py++;
    } while (py > 10 && py < h - 10 && inB());
    return { x: px, y: py };
  }

  /** GroundFurniture_DualDungeons 分派主循环（cs:34-185：房间臂 InnerBounds / 大厅臂 Bounds）。 */
  function dgFurnitureDual(): void {
    const alb = { alch: { v: Math.trunc((1 + Math.trunc(w / 4200)) * gfFeatScalar) },
      bew: { v: Math.trunc((1 + Math.trunc(w / 4200)) * gfFeatScalar) }, minWC: { v: worldSizeIdx() === 0 ? 5 : worldSizeIdx() === 1 ? 10 : 15 } };
    {                                                              // :41-53 清零臂
      let hasStyle0 = false;
      for (const s of gfStyles) if (s.Style === 0) { hasStyle0 = true; break; }
      if (!hasStyle0) { alb.alch.v = 0; alb.bew.v = 0; }
    }
    emit132(`MARK|I132 fhead alch=${alb.alch.v} bew=${alb.bew.v} wc=${alb.minWC.v} scalar=${gfFeatScalar}`);
    const runArm = (
      entries: Array<{ gen: boolean; st: number; L: number; T: number; R: number; B: number }>,
      defaultCount: number, hallMode: boolean,
    ): void => {
      // ★IIIII165：GFD 每臂 picks/ok 账（dormant 同 LSW；x86 DR|GFD 同构）
      const i165g = (globalThis as { __swI113?: (line: string) => void }).__swI113;
      gfdArm = hallMode ? 'H' : 'R';                                 // ★IIIII179 观测
      let gPicks = 0, gOk = 0;
      for (const ent of entries) {
        if (!ent.gen) continue;
        let count = defaultCount;
        let flagA = ent.st === 0 && (alb.alch.v > 0 || alb.bew.v > 0);   // :77/:136 flag2/flag4
        let nTry = 50;
        while (count > 0) {
          nTry--;
          if (nTry <= 0) break;
          gPicks++;
          const px = ri(ent.L, ent.R), py = ri(ent.T, ent.B);            // RandomPointInBounds
          // ★IIIII179：GA=采点门（g=IsConsideredDungeonWall∧inactive;x86 同构）
          if (i179G) mk179G(`DR|GA|arm=${hallMode ? 'H' : 'R'}|x=${px}|y=${py}|g=${gfIsDW(wallAt(px, py)) && actAt(px, py) === 0 ? 1 : 0}`);
          if (!(gfIsDW(wallAt(px, py)) && actAt(px, py) === 0)) continue;// :88/:146 采点门
          const fs = gfFirstSolidDown(px, py, hallMode ? { L: ent.L, T: ent.T, R: ent.R, B: ent.B } : null);
          const fy = fs.y - 1;                                           // :92/:151-152 Y--
          const fw2 = wallAt(fs.x, fy);
          emit132(`MARK|I132 att st=${ent.st} p=${fs.x},${fy}`);
          const snapA = alb.alch.v, snapB = alb.bew.v;
          let ok = false;
          if (flagA) {
            if (hallMode) {
              ok = gfDActual(fs.x, fy, fw2, alb, true, false);
              if (!ok) ok = gfDActual(fs.x, fy, fw2, zeroRefs(alb.minWC), true, true);
            } else {
              ok = gfDActual(fs.x, fy, fw2, alb, true, false);
              if (!ok) ok = gfDActual(fs.x, fy, fw2, zeroRefs(alb.minWC), false, nTry > 25);
            }
          } else if (hallMode) {
            ok = gfDActual(fs.x, fy, fw2, zeroRefs(alb.minWC), true, false);
            if (!ok) ok = gfDActual(fs.x, fy, fw2, zeroRefs(alb.minWC), true, true);
          } else {
            ok = gfDActual(fs.x, fy, fw2, zeroRefs(alb.minWC), false, nTry > 25);
            if (!ok) ok = gfDActual(fs.x, fy, fw2, zeroRefs(alb.minWC), false, nTry > 25);
          }
          if ((flagA && snapA !== alb.alch.v) || snapB !== alb.bew.v) flagA = false;   // :115/:174
          if (ok) { count--; gOk++; }                                    // :119-123/:178-182
        }
      }
      i165g?.(`DR|GFD|arm=${hallMode ? 'hall' : 'room'}|picks=${gPicks}|ok=${gOk}`);
    };
    runArm(gfFeatRooms, 4, false);
    runArm(gfFeatHalls, 6, true);
  }
  const zeroRefs = (minWC: GFItemRef) => ({ alch: { v: 0 }, bew: { v: 0 }, minWC });

  // GetWorldSize()（WorldGen.cs:6507-6514）：<=4200→0 / <=6400→1 / else 2
  function worldSizeIdx(): number { return w <= 4200 ? 0 : w <= 6400 ? 1 : 2; }
  /** IsConsideredDungeonWall 的 dual 全量版（DU.cs:1929-1950）：Main.wallDungeon 静态族 ∪
   *  CurrentDungeonGenVars.isDungeonWall（本座 styles+SubStyles 克隆合并扩张,DC.cs:147-185）。
   *  普通/未装配 gfStyles 时退化为静态集（与旧 isDW 同口径）。 */
  let _gfSeatDWSet: Set<number> | null = null;
  // ★IIIII106b：本座 outerProgressionBounds（res.progBounds 直通,styles 同序；
  //  EarlyDual TileClump 抽样窗消费源。普通世界恒 null=零扰动）
  let _gfSeatProgBounds: Array<{ L: number; T: number; R: number; B: number }> | null = null;
  const gfIsDW = (v2: number): boolean =>
    v2 > 0 && (_gfSeatDWSet !== null ? _gfSeatDWSet.has(v2) : DG_DUNGEON_WALLS.has(v2));
  /** ★IIIII105b 逐族分步 #1：Bookshelves 座面谓词（wall/tile 双集，同样克隆合并语义——
   *  tile 集=DG_DUNGEON_TILES 基线 ∪ 本座 BrickTileType/BrickGrass/ExtraTileTypes）。 */
  let _gfSeatDTSet: Set<number> | null = null;
  const gfIsBkDW = (v3: number): boolean => gfIsDW(v3);
  const gfIsBkDT = (t4: number): boolean => {
    if (!(_gfSeatDTSet !== null)) return isDT(t4);
    const sh4 = TILE_DEFS[t4]?.vanilla?.sheet ?? -1;
    return sh4 > 0 && _gfSeatDTSet.has(sh4);
  };

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
    let flag2 = true;
    for (let i = x - 1; i < x + 2; i++) {
      for (let j = y - 1; j < y + 1; j++) if (!dgClr(i, j)) flag2 = false;
      if (!solidTile2D(i, y + 1)) flag2 = false;
    }
    // ★IIII102c（2026-09-01）：cs:52601-52610 `type==88 → Chest.CreateChest(x−1,y−1)`
    //   ——在 clearance 终判(flag2)之后、瓦片写入之前。-1(同位被任何活箱占,FindEmptyChest
    //   cs:516) → flag2=false 拒置；**flag2 已 false 时照样注册**(失败尝试烧一个注册表
    //   槽=孤儿条目,vanilla 同构,HellFortPass.place3x2HF TTTT 同款先例)。本仓曾漏挂此
    //   支 → 全部地牢梳妆台不进 chest sink（首个实证=x86 CHEST slot24 3237,759 t88
    //   fx2538 于 JS 掉辖,IIIII101e §②首裂点）。
    // ★browser-worker 守卫(worker 无 process;沿用 LT_TRACE 同仓惯用法):
    //   缺省走本分支(node 面未设 SW_102C_DRESSER 或设非'0'——与旧真值一致)
    const SW_102C_ON = typeof process === 'undefined' || process.env.SW_102C_DRESSER !== '0';
    if (t === DRESSER && SW_102C_ON) {                        // ★A/B 开关：0=回退为无挂号旧行为(drunk 归因实验)
      const sink = chests as SparseChestSink;
      if (findLiveChest(sink, x - 1, y - 1) !== null) flag2 = false;   // 同位重占→拒置
      else registerChest(sink, { x: x - 1, y: y - 1, items: [], locked: false });
    }
    // ★IIIII161（2026-09-02）：cs:52611-52695 `if (flag2) { …写入… }`——净空终判**在写入前**,
    //   任一格 active(或 campfire 带液)→ 整件拒置且【不写不掷】。JS 曾算 flag2 而从未判定
    //   (写入循环无条件跑) ⇒ 塔外柱篝火/桌椅钢琴梳妆台在受阻格强写成功——GFB #32 家族-α
    //   (268..270/356..358@495..496 T215×30)与家族-β 首锚 KIND/锚序翻转(alch/bew 配额被
    //   虚假成功提前耗尽)同根。本行补回终判;成功返回值不变(true)。
    if (!flag2) return false;
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
  // Place3x4（cs(1458):52379 书架101）
  // ★IIIII99d 帧写落地（cs:52416-52434）+ style 参数补通（vanilla 经 PlaceTile
  //   style 入参，item1414-16→1/2/3、1512→5）：frameX=style*54+col*18、frameY=row*18。
  //   曾裸 dgWr 帧全 0——Check3x4(cs:50526) 锚反解必得假原点（派发于本批
  //   FinalCleanupPass check3x4Sweep 同批启用，消费者照原版读帧）。
  function place3x4D(x: number, y: number, t: number, style = 0): boolean {
    if (x < 5 || x > w - 5 || y < 5 || y > h - 5) return false;
    for (let i = x - 1; i < x + 2; i++) {
      for (let j = y - 3; j < y + 1; j++) if (!dgClr(i, j)) return false;
      if (!solidTile2D(i, y + 1)) return false;
    }
    const bx = style * 54;
    for (let k = 0; k < 3; k++) for (let l = 0; l < 4; l++) {
      dgWr(x - 1 + k, y - 3 + l, t);
      const fi = st.idx(x - 1 + k, y - 3 + l);
      st.frameX[fi] = bx + k * 18;
      st.frameY[fi] = l * 18;
    }
    return true;
  }
  // Place4x2（cs(1458):50969 床79/浴缸90 direction）
  // ★IIIII99d 帧写落地（cs:51010-51064）——旧版 fx0 算而未用、style 行缺失：
  //   frameX=col*18+(direction==1?72:0)（72=镜像帧页基，Tiles_79 带二页）、
  //   frameY=36*style+row*18（样式【竖带】，床 item1470-72→5/6/7、5740→47；
  //   浴缸 item2658-60→21/22/23、5739→47）。Check4x2(cs:47825) 按 fx≥72 反解
  //   镜像锚（num+=4），写侧错锚即整组误杀——本批 FinalCleanupPass
  //   check4x2Sweep 同批启用，两公式对拍成立。
  function place4x2D(x: number, y: number, t: number, dir: number, style = 0): boolean {
    if (x < 5 || x > w - 5 || y < 5 || y > h - 5) return false;
    for (let a = x - 1; a < x + 3; a++) {
      for (let b = y - 1; b < y + 1; b++) if (!dgClr(a, b)) return false;
      if (!solidTile2D(a, y + 1)) return false;
    }
    const fx0 = dir === 1 ? 72 : 0;
    const fy0 = 36 * style;
    for (let k = 0; k < 4; k++) for (let l = 0; l < 2; l++) {
      dgWr(x - 1 + k, y - 1 + l, t);
      const fi = st.idx(x - 1 + k, y - 1 + l);
      st.frameX[fi] = fx0 + k * 18;
      st.frameY[fi] = fy0 + l * 18;
    }
    return true;
  }
  // Place2x2（cs:51352 烛台100）
  function place2x2D(x: number, y: number, t: number, style = 0): boolean {
    for (let i = x - 1; i < x + 1; i++) {
      for (let j = y - 1; j < y + 1; j++) if (!dgClr(i, j)) return false;
      const bi = st.idx(i, y + 1);
      if (st.flags[bi] === 0 || (!solidTile2D(i, y + 1) && !TILE_TABLE_D.has(st.type[bi]))) return false;
    }
    // ★IIIII99d 帧写落地（Place2x2 cs(1458):51872-51881 逐句）：frameX=k*18（列
    //   偏移）、frameY=style*36+l*18（样式【竖带】，烛台 item2664-66→22/23/24、
    //   5742→47；x86 实测绿链读数 1692/1710=47*36+{0,18} 同式）。Tiles_100 表高
    //   2014px 容纳至 style≈55 带，finalize 帧净化(fy<2014)不劫持。
    //   99b「Piles/Stalac 掷流二次漂移」经查证为并行车道 WIP 混流伪影（同签名亦随
    //   睡莲臂出现且 XIII 章『并行车道单次回归不可采信』在案），非隐性读帧消费者；
    //   连带收口=Check2x2 主组派发全集启用（FinalCleanupPass C2X2_MAIN_GROUP），
    //   写侧与验侧同批落刀保流水线自洽。
    for (let k = 0; k < 2; k++) for (let l = 0; l < 2; l++) {
      dgWr(x - 1 + k, y - 1 + l, t);
      const fi = st.idx(x - 1 + k, y - 1 + l);
      st.frameX[fi] = k * 18;
      st.frameY[fi] = style * 36 + l * 18;
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
    // ★IIIII161：SolidTile2 读【运行时 tileSolid】——MakeDungeon 头 SetCrackedBrickSolidity(false)
    //   （DungeonCrawler.cs:361）窗口内裂纹砖 481/482/483 非实心。旧实现裸读 TILE_DEFS.solid
    //   ⇒ 炼金/巫惑台 Place3x3 支撑判定在裂纹砖地上假真 → 家族-β KIND/锚序翻转首裂点
    //   （x86 P33 ok=False s2=False @(514,719) 实证）。genSolidType 无 override 时回落
    //   TILE_DEFS.solid ⇒ 窗口外零行为差。
    if (!genSolidType(st.type[i])) return false;
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
    t65(`MARK|dg_pa0 n4=${Math.trunc(100 * (w / 4200) * Math.max(1, gfFeatScalar * 0.75))} L=${bounds.L} R=${bounds.R} T=${bounds.T} B=${bounds.B} ws=${Math.trunc(ws)} wv0=${wallVariants[0]}`);
    // lihzahrdPaintingsMax（DungeonGlobalPaintings.cs:36-42）：GetWorldSize()（WG:6518）
    // 4200 宽 → **0**（≤4200 case）→ switch default → max=1——**零掷**（仅 >6400 的
    // case 2 才掷 Next(2)）。★#32 终清批 III：此前误按"Large=4200"恒掷 → Pa 段全程
    // 流错位 +1（x86 逐事件反解：vanilla 首 PE@+5 而旧 JS@+6 起）。
    void 0;
    const num2v = wallVariants[0];
    // ★IIIII179 配额标量补（DungeonGlobalPaintings.cs:44-46 num3=Max(1,globalFeatureScalar*0.75)
    //  ——曾漏乘 ⇒ dual 座 num4 少 ~5×(=491vs100),Pa 段掷差主源;单座世界 scalar=1.0 零扰动）
    const num4 = Math.trunc(100 * (w / 4200) * Math.max(1, gfFeatScalar * 0.75));
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
      // ★IIIII179 座面化（DungeonGlobalPaintings.cs:63 重掷环 IsConsideredDungeonWall
      //  =座面合并集;曾静态 isDW ⇒ seat1 墙 71/187/28/87 全拒 → 1000 重掷烧骰 +191k）
      while (!gfIsDW(wallAt(x, y)) || actAt(x, y) !== 0) {
        n8--;
        if (n8 <= 0) break;
        x = ri(bounds.L, bounds.R - 1);
        y = ri(Math.trunc(ws), bounds.B - 1);
        paEmit101(`MARK|pat|${x},${y}`);
      }
      if ((typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DGPA_TRACE)) console.log(`S ${x} ${y}`);
      for (let t = 0; t < 2; t++) {
        let n9 = x, n10 = x;
        while (n9 > 20 && actAt(n9, y) === 0 && gfIsDW(wallAt(n9, y))) n9--;   // ★IIIII179 座面化
        n9++;
        while (n10 < w - 20 && actAt(n10, y) === 0 && gfIsDW(wallAt(n10, y))) n10++;
        n10--;
        x = Math.trunc((n9 + n10) / 2);
        let n11 = y, n12 = y;
        while (n11 > 20 && actAt(x, n11) === 0 && gfIsDW(wallAt(x, n11))) n11--;
        n11++;
        while (n12 < h - 20 && actAt(x, n12) === 0 && gfIsDW(wallAt(x, n12))) n12++;
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
    // ★IIIII179 配额标量补（DungeonGlobalBanners.cs:34 num2=Max(1,globalFeatureScalar*0.75);
    //  曾漏乘 ⇒ dual 座 num3 少 ~5×(=982vs200) + BannerItemTypes 表支整缺）
    const num3 = Math.trunc(200 * (w / 4200) * Math.max(1, gfFeatScalar * 0.75));
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
      // ★IIIII179 座面化（DungeonGlobalBanners.cs:40 重掷环 IsConsideredDungeonWall
      //  =座面合并集;曾静态 isDW ⇒ seat1 墙 71/187/28/87 全拒 → 1000 重掷烧骰 +98.5k）
      while (!gfIsDW(wallAt(x, y)) || actAt(x, y) !== 0) {
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
      if (!featOK(x, y, 0) || !gfIsDW(wallAt(x, y))   // ★IIIII179 座面化（Banners.cs:66）
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
      // ★IIIII179 风格臂 1:1（Banners.cs:72-96）：null 表（Spider/LivingWood/LivingMahogany/
      //  Snow/Corruption/Crimson/Hallow/GlowingMushroom/Beehive/Temple/Crystal）→ 整支跳过；
      //  Default(0/空表/null 样式)→ ladder+Next(2)（原文序在 null 门之后）；表支→Next(len)。
      //  曾无 null 门无表支 ⇒ seat1 Spider 墙横幅照挂 + Next(2) 多掷。
      const baSty = gfStyles.length > 0 ? gfStyleForWall(wallAt(x, y)) : null;
      const baTab = baSty === null ? (gfStyles.length > 0 ? null : []) : (baSty.Style === 0 ? [] : (baSty.Banner ?? null));
      if (baSty !== null && baTab === null) continue;
      let bType = BANNER, bStyleV = 0;
      if (baSty === null || baSty.Style === 0 || baTab === null || baTab.length === 0) {
        let num8 = 0;
        if (wallAt(x, y) === wallVariants[1]) num8 = 1;
        if (wallAt(x, y) === wallVariants[2]) num8 = 2;
        num8 = num8 * 2 + rn(2);
        bStyleV = bannerStyles[num8] ?? 0;
      } else {
        const bItem = baTab[rn(baTab.length)]!;
        const bpd = ipOf(bItem);
        bType = bpd.t >= 0 ? bpd.t : BANNER;
        bStyleV = bpd.s ?? 0;
      }
      // ★横幅 key 是 v_91_banners 非 'banner'（tiles.ts:258）——曾 TILE_BY_KEY['banner']
      //  =undefined:近旁横幅排除恒假（横幅贴横幅照放）+ placeSimple 写 type=undefined
      //  （tile<0 拦下=横幅全部静默丢弃，JS 轨迹 134 vs oracle 129 的根因）。
      //  双侧逐样本轨迹对账实锤（N 426,570 typ=91，2026-08-15）
      // ★NNN 批 ②（2026-08-18）：style 经 bannerStyles[num8] 入帧（DungeonGlobal-
      //  Banners.cs:95 `num7 = data.bannerStyles[num8]`；查表零掷不扰流）
      if (WV65b) WV65b.push(`MARK|dg_baP ${x},${y} t=${bType} s=${bStyleV}`);
      const baOk = placeBannerD(x, y, bType, bStyleV);
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
  // ★IIIII109b：provider ctx 句柄（函数域,早特征窗 rugged 面复用——rng/platSink 同实例=
  //  主流掷序与平台投影面与 provider 域完全同构）
  let dualLayoutCtxS: Parameters<typeof runDualDungeonLayout>[0] | null = null;
  if (isDualWorld) {
    // ★IIIII109b：ctx 具名化（早特征窗 rugged 面复用同一 ctx——rng/platSink 同实例=主流
    //  掷序与平台投影面与 provider 域完全同构）
    const dualLayoutCtx: Parameters<typeof runDualDungeonLayout>[0] = {
      st, gs, rng, w, h, ws, rock,
      undergroundLayer: h - 200,
      ri, rn, rd, raw,
      jsBoundUpd: (a, b, c, d) => bounds.upd(a, b, c ?? a, d ?? b),
      roomSink: (rmv) => {
        const view: DRoom = {
          seed: 0, x: rmv.x, y: rmv.y, start: false, generated: true,
          inner: new DBnd(w, h), outer: new DBnd(w, h),
          ex: rmv.ex, ey: rmv.ey, strength: rmv.strength,
          st: rmv.st ?? 0,                                    // ★105c：房样式透传
          bio: rmv.bio === true, forceDP: rmv.forceDP === true,   // ★111c：PD 面载荷
          leg: rmv.leg === true,                              // ★111c：G 面窗域支键
        };
        view.inner.set(rmv.innerL, rmv.innerT, rmv.innerR, rmv.innerB);
        view.outer.set(Math.max(10, rmv.innerL - 8), Math.max(10, rmv.innerT - 8), Math.min(w - 10, rmv.innerR + 8), Math.min(h - 10, rmv.innerB + 8));
        rooms.push(view);
      },
      platSink: (pl) => platData.push({ x: pl.x, y: pl.y, hall: false, hf: pl.hf || 5, force: !!pl.force }),
      snap,
    };
    dualLayoutCtxS = dualLayoutCtx;
    const res = runDualDungeonLayout(dualLayoutCtx, { x0, y0, precalcOK, entX, entY, worldSize: 1, k: instIdx });
    posX = Math.trunc(res.posX); posY = Math.trunc(res.posY); topX = posX;
    // ★IIIII105b：特征域载荷装配（GroundFurniture_DualDungeons 消费面）
    if (res.styles !== undefined && res.styles.length > 0) {
      gfStyles = res.styles;
      gfDefaultStyle = res.defaultStyle ?? gfStyles.find((s0) => s0.Style === 0) ?? null;   // ★111c PD 回退样式
      for (const ph of res.pdHalls ?? []) gfPdHalls.push(ph);                               // ★111c PD 厅载荷
      const set2 = new Set<number>(DG_DUNGEON_WALLS);   // Main.wallDungeon 克隆基线
      const addAll = (s0: import('./DungeonStyles1457').DungeonStyleData): void => {
        set2.add(s0.BrickWallType);
        for (const w3 of s0.ExtraWallTypes ?? []) set2.add(w3);
        for (const sb of s0.SubStyles ?? []) addAll(sb);
      };
      for (const s0 of res.styles) addAll(s0);
      _gfSeatDWSet = set2;
      const tset = new Set<number>(DG_DUNGEON_TILES);   // Main.tileDungeon 克隆基线
      const addT = (s0: import('./DungeonStyles1457').DungeonStyleData): void => {
        tset.add(s0.BrickTileType);
        if (s0.BrickGrassTileType !== undefined) tset.add(s0.BrickGrassTileType);
        for (const tt of s0.ExtraTileTypes ?? []) tset.add(tt);
        for (const sb of s0.SubStyles ?? []) addT(sb);
      };
      for (const s0 of res.styles) addT(s0);
      _gfSeatDTSet = tset;   // IIII105b：座面 tile 集基建保留（Books 窗口接刀用,当前无消费者）
    }
    // ★IIIII106b：本座 outerProgressionBounds（EarlyDual TileClump 抽样窗；styles 同序）
    _gfSeatProgBounds = (res.progBounds !== undefined && res.progBounds.length > 0) ? res.progBounds : null;
    gfChestPlan = res.chestPlan;                            // ★105c：生物箱桶
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I137_CHESTS) {
      const hist137: Record<string, number> = {};
      for (const [kk2, vv2] of Object.entries(res.chestPlan ?? {})) hist137[kk2] = vv2.rooms.length;
      console.log(`BCPLAN k=${instIdx} rooms=${JSON.stringify(hist137)} keys=${Object.keys(res.chestPlan ?? {}).join(',')}`);
    }
    for (const fr of res.featRooms ?? []) gfFeatRooms.push(fr);
    for (const fh of res.featHalls ?? []) gfFeatHalls.push(fh);
    for (const er of res.earlyRooms ?? []) gfEarlyRooms.push(er);   // ★109b：早特征分派载荷
    gfFeatScalar = res.scalar ?? 1.0;                    // DC.cs:381（provider 出口时点）
  }
  // ★IIIII108b 紧急解堵（2026-09-01）：dgLayout(num) 曾被并行车道落进 isDualWorld
  //   分支内——非 dual 世界（含全部常规链+remix）不再执行 legacy 布局 ⇒ rooms 空，
  //   下行 `rooms[0].inner`（本文件 :6224）读 undefined 'inner'，pass4 全链炸面
  //   （g/remix #59 双实锤=base0.log；与 XXXII 章「DungeonPass.ts:6227 reading
  //   'inner'」同族）。按上文注释「蛇槽缓存缺失（或非 dual 链）一律落回 legacy
  //   布局——普通世界零扰动口径」恢复双分流原语义：dual=provider 布局（rooms 经
  //   roomSink 注入,legacy 不重跑）;非 dual=legacy dgLayout。备份
  //   /tmp/iii134-out/DungeonPass.broken.bak。
  if (!isDualWorld) dgLayout(num);
  {
    const WV61c = typeof globalThis !== 'undefined' ? (globalThis as { __swWvLog?: unknown }).__swWvLog : undefined;
    if (WV61c) ((globalThis as { __wvLines?: string[] }).__wvLines ??= []).push(`MARK|d61layoutEnd|rc=${dgMainRolls}`);
  }
  // ★IIIII105b：provider 大厅/房间基线（此后 halls/rooms 数组内新增=爬升走廊、
  // roomDelay 插入厅房,均 Default style0 语义——dgHall/dgEntHall*/dgRoom 的
  // StyleData=genVars.dungeonStyle,DC.cs:446-458/:455-473 同位）
  const gfClimbBase = isDualWorld ? { rooms: rooms.length, halls: halls.length } : null;
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
        // ★IIIII168 bbox 快照钩（dormant,零掷）——与 x86 rig climb 插入臂 cl{seq}a/b 同位
        //   （域=插入点 ±80 固定窗,与 x86 JJHook.DumpBox cl 臂同值）。
        const bbCl = (globalThis as { __swI168BB?: (tag: string, l: number, t: number, r: number, b: number) => void }).__swI168BB;
        let clN = 0;
        if (bbCl) {
          const gsB = globalThis as { __swI168BBSeq?: number };
          gsB.__swI168BBSeq = (gsB.__swI168BBSeq ?? 0) + 1;
          clN = gsB.__swI168BBSeq;
          bbCl(`cl${clN}a`, sx - 80, sy - 80, sx + 80, sy + 80);
        }
        dgHall({ seed: raw(), generated: true, forceX: false, isEntrance: false, bounds: new DBnd(w, h), sx: 0, sy: 0, ex: 0, ey: 0, sdx: 0, sdy: 0, edx: 0, edy: 0 });
        dgRoom({ seed: raw(), x: posX, y: posY, start: false, generated: true, inner: new DBnd(w, h), outer: new DBnd(w, h), ex: 0, ey: 0, strength: 0 });
        posX = sx; posY = sy;
        bbCl?.(`cl${clN}b`, sx - 80, sy - 80, sx + 80, sy + 80);
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
    // ★IIIII211：climb→entrance 间检查点（SW_I211CHAIN 仪 WANT 命名 'dungeonClimb'）——
    //   楔区 (41,7,alive) 写入者二分（climb/插入房 vs 入口结构）。
    snap('dungeonClimb');
  }
  // MakeDungeon_GetEntrance（:450）——Tower=TowerDungeonEntrance（XX 批 1:1 转录）；
  // Dome=DomeDungeonEntrance（FFFF 批 2026-08-18 1:1 转录——XX 批备案的"Legacy 近似
  // 体"已退役；AAAA 批的 Dome 锚补丁同步本体化进 dgDomeEntrance 尾部）。
  // GetEntranceSettings 的 1 颗废弃掷在两支同位（settings.RandomSeed=Next() 后被
  // preSettings.RandomSeed 覆写）——tower/dome 支先 raw() 再传 entSeed。
  if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I211 === '1') {
    ((globalThis as unknown as { __swI211?: (line: string) => void }).__swI211
      ?? ((l: string) => { void l; }))(`I211|ENT|i${instIdx + 1}|kind=${entKind}|pos=${posX},${posY}|pre=${precalcOK ? 1 : 0}`);
  }
  if (entKind === 2) { raw(); dgTowerEntrance(posX, posY, entSeed); }
  else if (entKind === 1) { raw(); dgDomeEntrance(posX, posY, entSeed); }
  else dgEntrance(raw(), entSeed);
  dgpMark("entdone");
  // ★IIIII80（2026-08-30，DungeonCrawler.cs:467-470）：surfaceIsInSpace →
  //   入口生成后 dungeonBounds.Top=25（Clamp[10,h-10] 同 DBnd.topSet）——房间
  //   Processing/平台门刷与装饰的上下文界面向天空扩展。仅 sgis 世界改值。
  if (gs.seedFlags.surfaceIsInSpace) bounds.topSet(25);
  // ★IIIII105b：爬升/插入大厅并入特征域载荷（dungeonHalls 全集=C# data.dungeonHalls
  // 含 LegacyEntrance 支；style=genVars.dungeonStyle=Default(style0)）
  if (isDualWorld && gfClimbBase !== null) {
    for (let hi = gfClimbBase.halls; hi < halls.length; hi++) {
      const hl = halls[hi]!;
      gfFeatHalls.push({ gen: !!hl.generated, st: 0,
        L: hl.bounds.L, T: hl.bounds.T, R: hl.bounds.R, B: hl.bounds.B });
    }
    // roomDelay 插入房（LegacyDungeonRoom → data.dungeonRooms 全集成员，DC.cs:446-458）
    for (let ri2 = gfClimbBase.rooms; ri2 < rooms.length; ri2++) {
      const rr = rooms[ri2]!;
      gfFeatRooms.push({ gen: !!rr.generated, st: 0,
        L: rr.inner.L, T: rr.inner.T, R: rr.inner.R, B: rr.inner.B });
      // ★IIIII109b：climb 插入房=LegacyDungeonRoom（cs:446-458 RandomSeed=Next 一次,
      //  GenerateRoom 消费同 seed）——早特征窗基类支（窗 self-seed+FloodRoom）可达。
      //  样式面=genVars.dungeonStyle（Default 主题档,gfStyles 的 Style0 条目）。
      const defSty0 = gfStyles.find((s0) => s0.Style === 0);
      gfEarlyRooms.push({
        kind: 0, st: 0, seed: rr.seed,
        L: rr.inner.L, T: rr.inner.T, R: rr.inner.R, B: rr.inner.B,
        cx: (rr.inner.L + rr.inner.R) >> 1, cy: (rr.inner.T + rr.inner.B) >> 1,
        opt: -1, opw: -1, shape: -1, hr: 0, vr: 0,
        liquid: defSty0?.LiquidType ?? -1,
        brick: defSty0?.BrickTileType ?? 41, bwall: defSty0?.BrickWallType ?? 7,
        bPaint: -1, bwPaint: -1,
        winG: defSty0?.WindowGlassWallType ?? 21,
        winGC: defSty0?.WindowClosedGlassWallType ?? 4,
        winE: defSty0?.WindowEdgeWallType ?? 5,
        winPlatS: (defSty0?.PlatformItemTypes ?? []).map((it) => WINDOW_PLAT_ITEM_STYLE[it] ?? -1),
        plat: defSty0?.PlatformItemTypes ?? [],
        winOK: true,
      });
    }
    emit132(`MARK|I132 feats rooms=${gfFeatRooms.length} halls=${gfFeatHalls.length}`);
  }
  snap('dungeonE');
  // ★IIIII179 特征窗每段 entry/exit rc 钩（SW_I179;x86 DR|FEAT 同构,零掷）——
  //   HG→Lights 窗 11.4k 掷差定位仪（PD_r/PD_h/EARLY..LATE 十六段）
  const i179F = typeof process !== 'undefined' && !!(__swProcessEnv ?? {}).SW_I179;
  const mk179F = (n: string, p: string): void => {
    if (i179F) (globalThis as { __swI113?: (line: string) => void }).__swI113?.(`DR|FEAT|s=${instIdx}|n=${n}|p=${p}`);
  };
  const mk179R = (ln: string): void => { if (i179F) (globalThis as { __swI113?: (line: string) => void }).__swI113?.(ln); };
  mk179F('PDR', 'i');
  for (const rm of rooms) if (rm.generated) roomPlatformsDoors(rm);
  mk179F('PDR', 'o');
  // ★IIIII111c：C# 厅循环=rooms 循环后遍历 dungeonHalls 全序（DC.cs:484-487）——
  //  provider 厅（entrance stairwell→calculator 厅,gfPdHalls 序）先于 climb 厅（halls
  //  数组尾随）；Stairwell 无 extra、Sine 走 pp（|dy|≥0.65 已滤）、Legacy/Regular 走
  //  AddExtraPlatformsIfNeeded（载荷侧已展开）。entrance stairwell 厅**不**跳
  //  （StairwellDungeonHall.cs:16-25 无 IsEntranceHall 门;空体覆写只属
  //  LegacyEntranceDungeonHall=climb 走廊厅,JS 侧由 hallPlatformsDoors isEntrance 跳）。
  mk179F('PDH', 'i');
  for (const ph of gfPdHalls) {
    pdHallPoint(Math.trunc(ph.sx), Math.trunc(ph.sy), ph.sdy, null);
    pdHallPoint(Math.trunc(ph.ex), Math.trunc(ph.ey), ph.edy, null);
    for (const e of ph.pp ?? []) pdHallPoint(Math.trunc(e.x), Math.trunc(e.y), e.dy, null);
  }
  for (const hl of halls) if (hl.generated) hallPlatformsDoors(hl);
  mk179F('PDH', 'o');
  snap('dungeonPD');
  // ★IIIII118：PD_OUT 全网格 dump（SW_DG_GC_DUMP 门控）——与 x86 rig DumpOnly
  //   x86_s*_PD_out 同位对拍（PD 收集完成时点 tile 状态=下游段共同初态）。
  {
    const pdDump = mkGcDumpGrid();
    if (pdDump) pdDump(`_js_s${instIdx + 1}_PD_out`);
  }
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
  // ★IIIII107c（2026-09-01）：EarlyDualDungeonFeatures.EarlyDungeonFeatures【S1..S7 七臂】
  //   （§⑥ 清单第 1 刀；cs=Terarria1458/DungeonGlobalEarlyDualDungeonFeatures.cs 终态，
  //   与 1457 同文件 diff 零差，Terarria1458 为唯一裁决）：
  //    S1 cs:76-122  Style4/5 outerProgressionBounds 标枪探针 + Place3x2(26) 恶魔祭坛
  //                  （style=flag?1:0=Crimson/Corruption 变体；x86 #033 a26 0→+108 实证）
  //    S2 cs:126-160 dict[4]/dict[5] AddShadowOrb 臂（tile31 ×num2=GetWorldSize 档）
  //    S3 cs:163-172 dict[9] AddBeeLarva 臂——奇偶样式表两支均无 Beehive(9) 房 ⇒ 双座
  //                  现行链不可达（落码备案；尾 PlaceTile(231,mute) 亦零主流掷）
  //    S4 cs:174-303 dual per-room PitTrap 三段收窄梯（h*0.75→max(10,h*0.5)→w*0.75；
  //                  ConnectedRoom 外框门 + genVars.outerPotentialDungeonBounds 门 +
  //                  styleHook(Beehive9/Temple10/Shimmer11/LivingWood13/LivingMahogany14→拒)
  //                  + DungeonPitTrap.cs:42-403 的 Type==DualDungeon 支全写面（heights 数组/
  //                  TopDensity 洪带/crack 族 Falling 分派/135 板线/AddWire 链））
  //    S5 cs:304-350 Desert dict[3] DropTrap（Lava|Sand 由命中后 Next(2) 定；deDropTrap）
  //    S6 cs:352-385 Snow   dict[2] DropTrap（Slush；deDropTrap）
  //    S7 cs:386-412 Cavern dict[1] DropTrap（Silt；deDropTrap）——seat0 主活臂
  //   ★掷位序严格随 cs：S1 每候选 Next(W)+Next(H)（wall gate 失败即 continue 再掷）；
  //     S2 每 try Next(list.Count)；S3 零主流掷；S4 每 try Next(count)+flag2 短路门
  //     （配额>0 时 Next(8) 不掷！C# num16>0||Next(8)==0）；S5-S7 每 attempt Next(W)+Next(H)
  //     +Desert 命中 Next(2)；deDropTrap 自身恰两掷 Next(6,12)/Next(6,14)。clump 五臂仍在其后。
  //   ★门=SW_I138_EARLY（★IIIII164 缺省 ON，=0 显式回退 IIII106b 账面）：与五臂 TileClump 同门共批。
  //   ★IIIII192：EARLY 窗补标（x86 rig DungeonCrawler.cs:495-499 同位——EARLY i/o 包裹
  //   DungeonGlobalEarlyDualDungeonFeatures.GenerateFeature 整段=本仓 S1..S9 新径∨dgEarly
  //   旧径两态；此前 JS 仅旧径分支发行 ⇒ dual 链 EARLY 窗无行、+190 差只能借
  //   PDH_o↔SPIKES_i 未标记窗间接测得，无法归因到臂）。
  mk179F('EARLY', 'i');
  // ★IIIII192 观测（零掷）：EARLY 入态特征登记处对拍（x86 EAR|FEATS 同位）——
  //   pits=已登记 PitTrap 成功盒 / winBoxes=窗盒 / dropBoxes=DropTrap 盒。
  mk179R(`EAR|FEATS|n=${pits.length + winBoxes.length + dropBoxes.length}|pits=${pits.length}|win=${winBoxes.length}|drop=${dropBoxes.length}`
    + winBoxes.map((b2, k2) => `|W${k2}:${b2.L},${b2.T},${b2.R},${b2.B}`).join(''));
  if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1') {
    console.log(`GC-S7GATE styles=${gfStyles.length} pbg=${_gfSeatProgBounds === null ? 'null' : _gfSeatProgBounds.length} featRooms=${gfFeatRooms.length} flag=${i138EarlyGate() ? '1' : '0'}`);
  }
  if (gfStyles.length > 0 && _gfSeatProgBounds !== null && gfFeatRooms.length > 0
    && i138EarlyGate()) {
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1') {
      console.log(`GC-S7BLK styles=${gfStyles.length} featRooms=${gfFeatRooms.length} st9=${gfFeatRooms.filter((r) => r.st === 9).length}`);
    }
    const insSh = (sheetId: number): number => TILE_INTERNAL_BY_SHEET.get(sheetId) ?? -1;
    const shOfAt = (x2: number, y2: number): number => TILE_DEFS[typAt(x2, y2)]?.vanilla?.sheet ?? -1;
    const dwSh = (v: number): boolean => v > 0 && (_gfSeatDWSet !== null ? _gfSeatDWSet.has(v) : DG_DUNGEON_WALLS.has(v));   // ★null 回退=基表（同 :6359 语义）
    const dtSh = (v: number): boolean => v > 0 && (_gfSeatDTSet !== null ? _gfSeatDTSet.has(v) : isDT(v));       // IsConsideredDungeonTile（null 回退=基表，同 gfIsBkDT 语义）
    // ★IIIII200：座面判定集 dump（x86 JJHook.DumpSeatSets 同位镜像,SW_I200 门,零掷）——
    //   SET|i<seat>|s<n>bt=..bw=..|DT=..|DW=..——坑井受理谓词差直检面。
    const i200On = typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I200 === '1';
    if (i200On) {
      const dtSet200 = _gfSeatDTSet ?? new Set<number>();
      const dwSet200 = _gfSeatDWSet ?? new Set<number>();
      mk179R(`SET|i${instIdx + 1}|${gfStyles.map((s0) => `s${s0.Style}bt=${s0.BrickTileType}bw=${s0.BrickWallType}`).join('|')}`
        + `|DT=${[...dtSet200].join(',')}|DW=${[...dwSet200].join(',')}`);
    }
    // ★IIIII211：per-room style 归桶仪（SW_I211 门,零掷）——S4 建桶前逐房 emit
    //   （房序/st/bio/inner bb/outer bb），对 x86 S4 st=n 计数 + RB 全集做归桶差定谳。
    if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_I211 === '1') {
      const i211 = (globalThis as unknown as { __swI211?: (line: string) => void }).__swI211;
      if (i211) {
        i211(`I211|SEAT|i${instIdx + 1}|rooms=${gfFeatRooms.length}|styles=${gfStyles.map((s0) => s0.Style).join(',')}`);
        gfFeatRooms.forEach((rr, ri211) => {
          i211(`I211|DICT|i${instIdx + 1}|r=${ri211}|st=${rr.st}|bio=${rr.bio ? 1 : 0}`
            + `|L=${rr.L}|T=${rr.T}|R=${rr.R}|B=${rr.B}|oL=${rr.oL}|oT=${rr.oT}|oR=${rr.oR}|oB=${rr.oB}`);
        });
        const bySt211: Record<number, number> = {};
        for (const rr of gfFeatRooms) bySt211[rr.st] = (bySt211[rr.st] ?? 0) + 1;
        i211(`I211|SUM|i${instIdx + 1}|` + Object.keys(bySt211).map(Number).sort((a, b) => a - b).map((k) => `st${k}=${bySt211[k]}`).join('|'));
      }
    }
    // TileID.Sets.Falling / CrackedBricks / Boulders（1458 TileID.cs :195/:183/:395）
    const E137_FALLING = new Set<number>([53, 234, 112, 116, 224, 123, 330, 331, 332, 333, 495]);
    const E137_BOULDERS = new Set<number>([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
    const crSet = new Set<number>([481, 482, 483]);                          // Sets.CrackedBricks 基表
    const addCrackOf = (st0: import('./DungeonStyles1457').DungeonStyleData): void => {
      crSet.add(st0.BrickCrackedTileType);
      crSet.add(st0.PitTrapTileType);
      for (const sb of st0.SubStyles ?? []) addCrackOf(sb);
    };
    for (const s0 of gfStyles) addCrackOf(s0);
    const solidT2E = (x2: number, y2: number): boolean => {                  // WorldGen.SolidTile2(:70673)
      if (!st.inBounds(x2, y2)) return true;                                 // C# null tile→true 支
      const ti2 = st.idx(x2, y2);
      if (!(st.flags[ti2] & 1)) return false;
      if (!TILE_DEFS[st.type[ti2]]?.solid) return false;                     // Main.tileSolid
      if (st.slope[ti2] !== 0 || st.half[ti2] !== 0) return false;
      if ((st.wire[ti2] >>> 5) & 1) return false;                            // !inActive()
      return true;
    };
    const dgECss = (tileSheet: number): number | null => {                   // GetStyleForTile(cs:722-743)
      if (tileSheet < 0) return null;
      for (const s0 of gfStyles) {
        if (tileIsInStyle(s0, tileSheet, false, true)) return s0.Style;
        for (const ss of s0.SubStyles ?? []) {
          if (tileIsInStyle(ss, tileSheet, false, true)) return ss.Style;
        }
      }
      return null;
    };
    // —— 原版裸写型助手（仅 active/type/frame 位，不走 ChangeTileType）——
    const rawType = (x2: number, y2: number, typeSheet: number): void => {
      if (!st.inBounds(x2, y2)) return;
      const ti2 = st.idx(x2, y2);
      st.flags[ti2] |= 1;
      st.type[ti2] = insSh(typeSheet);
    };
    const inWorldOf = (x2: number, y2: number): boolean =>
      x2 >= 10 && x2 < w - 10 && y2 >= 10 && y2 < h - 10;
    /** WorldGen.AddShadowOrb（cs:32392-32434）。零主流掷。 */
    const addShadowOrbE = (x2: number, y2: number, crimsonHeart: boolean): void => {
      if (x2 < 10 || x2 > w - 10 || y2 < 10 || y2 > h - 10) return;
      for (let i2 = x2 - 1; i2 < x2 + 1; i2++) {
        for (let j2 = y2 - 1; j2 < y2 + 1; j2++) {
          if (!st.inBounds(i2, j2)) continue;
          const ti2 = st.idx(i2, j2);
          if ((st.flags[ti2] & 1) && st.type[ti2] === insSh(31)) return;     // 已有 orb → 早退
        }
      }
      const fh = crimsonHeart ? 36 : 0;
      const put = (px: number, py: number, fx: number, fy: number): void => {
        if (!st.inBounds(px, py)) return;
        const ti2 = st.idx(px, py);
        st.flags[ti2] |= 1;
        st.type[ti2] = insSh(31);
        st.frameX[ti2] = (fx as unknown as number) & 0xffff;
        st.frameY[ti2] = fy & 0xffff;
      };
      put(x2 - 1, y2 - 1, fh, 0);
      put(x2, y2 - 1, 18 + fh, 0);
      put(x2 - 1, y2, fh, 18);
      put(x2, y2, 18 + fh, 18);
    };
    /** WorldGen.Place3x2 type=26 DemonAltar（cs:52533-52641 内 type26 分派；零主流掷） */
    const place3x2Altar = (x2: number, y2: number, styleBit: number): void => {
      if (x2 < 5 || x2 > w - 5 || y2 < 5 || y2 > h - 5) return;
      let ok = true;
      for (let i2 = x2 - 1; i2 <= x2 + 1 && ok; i2++) {
        for (let j2 = y2 - 1; j2 < y2 + 1; j2++) {
          if (!st.inBounds(i2, j2)) continue;
          if (st.flags[st.idx(i2, j2)] & 1) { ok = false; break; }
        }
      }
      if (!ok) return;
      for (let i2 = x2 - 1; i2 <= x2 + 1 && ok; i2++) {
        if (E137_BOULDERS.has(shOfAt(i2, y2 + 1))) ok = false;
        else if (!solidT2E(i2, y2 + 1)) ok = false;
      }
      if (!ok) return;
      for (let col = 0; col < 3; col++) {
        rawType(x2 - 1 + col, y2 - 1, 26);
        const tiT = st.idx(x2 - 1 + col, y2 - 1);
        st.frameX[tiT] = (54 * styleBit + col * 18) & 0xffff;
        st.frameY[tiT] = 0;
        rawType(x2 - 1 + col, y2, 26);
        const tiB = st.idx(x2 - 1 + col, y2);
        st.frameX[tiB] = (54 * styleBit + col * 18) & 0xffff;
        st.frameY[tiB] = 18;
      }
    };
    /** WorldGen.AddLarva 写体（cs:32347-32364 的 ClearEverything 族 + 尾 PlaceTile(231,mute)）。
     *  ★IIIII156 补尾：x86 实证 seat0 有 5 个 Beehive(9) 房（G_in t231=45 格,旧「双座
     *  不可达」备案翻案）——补 PlaceTile(231)：3×3 Origin(1,2)，盒=(x−1..x+1, y−2..y)
     *  恰覆 ClearTile 三行；帧按 18*col/18*row（帧面不进门闸,仅渲染）。零主流掷。 */
    const beeLarvaWrite = (x2: number, y2: number): void => {
      const larvaI = insSh(225);
      for (let i2 = x2 - 1; i2 <= x2 + 1; i2++) {
        for (let j2 = y2 - 2; j2 <= y2 + 1; j2++) {
          if (!st.inBounds(i2, j2)) continue;
          const ti2 = st.idx(i2, j2);
          if (j2 !== y2 + 1) {                       // ClearTile（保 type/wall/liquid 的半清）
            st.slope[ti2] = 0; st.half[ti2] = 0;
            st.flags[ti2] &= ~1;
            st.wire[ti2] &= ~(1 << 5);
            continue;
          }
          const wallKeep = st.wall[ti2];             // ClearEverything 后回填 wall
          st.type[ti2] = 0; st.wall[ti2] = 0; st.liquid[ti2] = 0; st.liquidType[ti2] = 0;
          st.flags[ti2] = 0; st.slope[ti2] = 0; st.half[ti2] = 0;
          st.paint[ti2] = 0; st.paintWall[ti2] = 0;
          st.flags[ti2] |= 1;
          st.type[ti2] = larvaI;
          st.wall[ti2] = wallKeep;
        }
      }
      const larva231 = insSh(231);                   // PlaceTile(x2,y2,231,mute)（cs:32365）
      if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1') {
        console.log(`GC-LV231 x=${x2} y=${y2} id=${larva231}`);
      }
      if (larva231 > 0) {
        for (let i2 = x2 - 1; i2 <= x2 + 1; i2++) {
          for (let j2 = y2 - 2; j2 <= y2; j2++) {
            if (!st.inBounds(i2, j2)) continue;
            const ti2 = st.idx(i2, j2);
            st.flags[ti2] |= 1;
            st.type[ti2] = larva231;
            st.liquid[ti2] = 0; st.liquidType[ti2] = 0;
            st.slope[ti2] = 0; st.half[ti2] = 0;
            st.wire[ti2] &= ~(1 << 5);
            st.frameX[ti2] = (i2 - (x2 - 1)) * 18;
            st.frameY[ti2] = (j2 - (y2 - 2)) * 18;
          }
        }
      }
    };
    /** DungeonPitTrap.PitTrap 的 Type==DualDungeon(flag=true) 支（cs:42-403）。 */
    let pitGate = '';                                     // ★IIIII192 观测：末次拒绝门（零掷）
    let i200PitSeq = 0;                                   // ★IIIII200：坑井仪序号（x86 JJHook.PitBegin 同位,EARLY 每座恰一）
    const dualPitTrap = (
      i: number, j: number, widthA: number, heightA: number,
      edgeW: number, edgeH: number, topD: number, flooded: boolean,
      styleObj: import('./DungeonStyles1457').DungeonStyleData,
      roomOuter: { oL?: number; oT?: number; oR?: number; oB?: number },
    ): boolean => {
      const brickSheet = styleObj.BrickTileType;
      const pitSheet = styleObj.PitTrapTileType;
      const brickI = insSh(brickSheet);
      const pitI = insSh(pitSheet);
      const flagFalling = E137_FALLING.has(pitSheet);       // TileID.Sets.Falling[pit]
      // ★Sets.CrackedBricks 直接读静态基表{481,482,483}（DungeonPitTrap.cs:53）——与
      //   genVars.isCrackedBrick 合并表（heights 扫描消费）区分,勿混用。
      const flagCrack = pitSheet === 481 || pitSheet === 482 || pitSheet === 483;
      const uw = h - 200;
      let num = j, num2 = j;
      if (widthA < 1 || heightA < 1) { pitGate = 'wlt1'; return false; }   // ★IIIII200 门标
      let num3 = heightA;
      if (flooded) {                                        // cs:63-70 Flooded 收深扩延（300 cap）
        for (;;) {
          const cap = widthA * Math.max(1, num3 - topD);
          if (cap >= 300) break;
          num3++;
        }
      }
      const num6 = widthA + edgeW;
      const num7 = num3 + edgeH;
      // ★IIIII200：x86 PG() 门标链镜像（DungeonPitTrap.cs:45-190 每拒支同名）——
      //   观测面（S4G/S4T 行 g=）与 x86 逐门可 diff;label 写仅赋值零掷。
      pitGate = 'start';
      if (!inW(i, num, Math.max(num6, num7))) { pitGate = 'inw'; return false; }
      if (!dwSh(wallAt(i, num))) { pitGate = 'wall'; return false; }        // IsConsideredDungeonWall(per-seat 合并面)
      if (instIdx >= 0) {                                   // outerPotentialDungeonBounds 门（dual 必走）
        const pbk = dualDungeonState.potentialBounds[instIdx];
        if (!pbk || !(i >= pbk.l && i < pbk.r && num >= pbk.t && num < pbk.b)) { pitGate = 'pot'; return false; }
      }
      if (actAt(i, num) !== 0) { pitGate = 'act'; return false; }
      for (let k = num; k < h; k++) {
        if (k > uw) { pitGate = 'uw1'; return false; }
        if (actAt(i, k) !== 0 && dgSpreadSolid(i, k)) {
          if (typAt(i, k) === SPIKE) { pitGate = 'sp48'; return false; }
          num = k; num2 = k;
          break;
        }
      }
      if (!(dwSh(wallAt(i - widthA, num)) && dwSh(wallAt(i + widthA, num)))) { pitGate = 'side'; return false; }
      for (let l2 = i - num6; l2 <= i + num6; l2++) {       // cs:110-127 双座族全箱自检
        for (let m2 = num; m2 < num + num7 + 2; m2++) {
          if (!st.inBounds(l2, m2)) continue;
          const ti2 = st.idx(l2, m2);
          const sh2 = TILE_DEFS[st.type[ti2]]?.vanilla?.sheet ?? -1;
          if ((st.flags[ti2] & 1) && sh2 !== brickSheet) { pitGate = 'brick'; return false; }
          if (st.wall[ti2] !== styleObj.BrickWallType) { pitGate = 'wall2'; return false; }
        }
      }
      for (let n = num; n < num + 30; n++) {                // cs:128-147 净空头扫
        let clean = true;
        for (let x2 = i - widthA; x2 <= i + widthA; x2++) {
          if (actAt(x2, n) !== 0 && dtSh(shOfAt(x2, n))) { clean = false; break; }
        }
        if (clean) { num = n; break; }
      }
      if (num + num7 >= uw) { pitGate = 'uw2'; return false; }
      const heights: number[] = [];                         // cs:152-166 heights 数组
      for (let c = i - num6; c <= i + num6; c++) {
        let m11 = num;
        for (;;) {
          if (!(m11 > 10 && actAt(c, m11) !== 0 && (dtSh(shOfAt(c, m11))
            || crSet.has(shOfAt(c, m11))))) break;
          m11--;
        }
        heights.push(m11 + 1);
      }
      const hit = new DBnd(w, h);
      hit.set(i - num6, num2, i + num6, num + num7);
      // ★IIIII200：坑井受理态逐格仪（x86 JJHook.PitDump 同构镜像,SW_I200 门,零掷）——
      //   PT| 行=坑井内部量（x86 同字段）+ __swI168BB('pt<k>')=区域快照（同 DumpBox 5B/格格式）。
      if (i200On) {
        i200PitSeq++;
        mk179R(`PT|k=${i200PitSeq}|i=${i}|j=${j}|w=${widthA}|h3=${num3}|n6=${num6}|n7=${num7}`
          + `|num=${num}|num2=${num2}|hb=${hit.L},${hit.T},${hit.R},${hit.B}`
          + `|bt=${brickSheet}|bw=${styleObj.BrickWallType}`);
        (globalThis as { __swI168BB?: (tag: string, l: number, t: number, r: number, b: number) => void })
          .__swI168BB?.(`i${instIdx + 1}pt${i200PitSeq}`, i - num6 - 4, num2 - 4, i + num6 + 5,
            num + num7 + 6 > num2 + 40 ? num + num7 + 6 : num2 + 40);
      }
      // ★IIIII200 定谳：C# DungeonData.CanGenerateFeatureInArea 的逐格环是
      //   `i <= hitbox.Right; j <= hitbox.Bottom`（DungeonData.cs:111-113）——XNA
      //   Rectangle.Right=Left+Width/Bottom=Top+Height 是【排他界】但环用 **≤** ⇒ 实扫
      //   域=[Left..Right]×[Top..Bottom] **含末行末列**（比 SetBounds 原值域多一行列）。
      //   JS 旧版半开盒 [L,R)×[T,B) 漏扫末行末列 ⇒ 坑盒 Bottom 恰=邻房 OuterBounds.Top
      //   时 x86 拒（room:k,坑盒伸进邻房）而 JS 受理——S4 st=8 attempt19 实锤
      //   （x86 PT k=46 hb=628,734,664,748 扫到 y=748∈r73[748,802) 拒;JS 漏 y=748 受理,
      //   三段梯 att 24 vs 20 的真根）。修=≤ 环（DropTrap cs:196 域 JS 已是 ≤ 环正确,勿动）。
      for (let px = hit.L; px <= hit.R; px++) {             // CanGenerateFeatureInArea=含 Right/Bottom（cs:111）
        for (let py = hit.T; py <= hit.B; py++) {
          if (!featOK(px, py, 0)) { pitGate = 'area'; return false; }
          // ★IIIII192：DungeonData.CanGenerateFeatureAt 尾部 **per-room 门**（DungeonRoom.cs:40-51
          //  经 CanGenerateFeatureInArea→CanGenerateFeatureAt 逐格调用的收尾支）——命中已生成房
          //  OuterBounds 的格：ConnectedRoom≠本房 → 拒（坑盒伸进邻房即整盒拒）；=本房 →
          //  StyleData 门（Shimmer11/LivingWood13/14/Beehive9/Temple10 拒 PitTrap——已由
          //  pick 侧 styleHook 等效执行,此处不重复）。旧版整缺 ⇒ JS 坑盒跨房仍受理
          //  （x86 S4 st=8 att=24 vs JS 20 的实锤签名）。
          for (const rm of gfFeatRooms) {
            if (!rm.gen) continue;
            const ol = rm.oL, ot = rm.oT, or2 = rm.oR, ob = rm.oB;
            if (ol === undefined || ot === undefined || or2 === undefined || ob === undefined) continue;
            if (px >= ol && px < or2 && py >= ot && py < ob && rm !== roomOuter) { pitGate = 'room:' + gfFeatRooms.indexOf(rm); return false; }
          }
        }
      }
      for (let c12 = i - num6; c12 <= i + num6; c12++) {    // ConnectedRoom 外框补拒门 cs:175-192
        for (let m13 = num2; m13 <= num + num7; m13++) {
          if (!(c12 < i - widthA || c12 > i + widthA || m13 < num || m13 > num + num3)) continue;
          const ol = roomOuter.oL, ot = roomOuter.oT, or2 = roomOuter.oR, ob = roomOuter.oB;
          const inside = ol !== undefined && ot !== undefined && or2 !== undefined && ob !== undefined
            && c12 >= ol && c12 < or2 && m13 >= ot && m13 < ob;
          if (inside) continue;
          if (!st.inBounds(c12, m13)) continue;
          const ti2 = st.idx(c12, m13);
          if (!(st.flags[ti2] & 1) && dwSh(st.wall[ti2])) return false;
        }
      }
      for (let c = i - num6; c <= i + num6; c++) {          // 外壳写 cs:223-255
        const startO = heights[c - (i - num6)]!;
        for (let yy = startO; yy <= num + num7; yy++) {
          if (!st.inBounds(c, yy)) continue;
          const ti2 = st.idx(c, yy);
          st.liquidType[ti2] = 0; st.liquid[ti2] = 0;
          if (dwSh(st.wall[ti2])) continue;
          if (c > i - num6 && c < i + num6 && yy < num + num7) {
            const ow = st.wall[ti2];
            chTile(ti2, brickI, true);
            if (!dwSh(ow)) chWall(ti2, styleObj.BrickWallType, false);
          } else {
            chTile(ti2, brickI, false);
          }
        }
      }
      const offIn = num6 - widthA;                          // GetHeight inner 偏移
      for (let c = i - widthA; c <= i + widthA; c++) {      // 内腔写 cs:257-328
        const startI = heights[(c - (i - widthA)) + offIn]!;
        for (let yy = startI; yy <= num + num3; yy++) {
          if (!st.inBounds(c, yy)) continue;
          const ti2 = st.idx(c, yy);
          let f6 = false;
          // ★IIIII200 定谳：顶带 pit-trap 瓷砖重铸门=C# `flag && num23 <= num2+TopDensity`
          //  （DungeonPitTrap.cs:269，flag=dual 恒真）——与 Flooded **无关**！JS 旧版误加
          //  `flooded &&` ⇒ 非洪水坑顶带缺 pit-trap 瓷砖（cavern=123）且下游 135 板线
          //  链（PlaceTile(…135…7) 需上方邻格= pit-trap 瓷砖）整链不产——pt10p 区域
          //  397 格差（x86 123/135 vs JS 48/清）实锤。修=去 flooded 条件。
          if (yy <= num2 + topD) {
            f6 = false;
            if (st.flags[ti2] & 1) chTile(ti2, pitI, false);
            st.liquidType[ti2] = 0; st.liquid[ti2] = 0;
            continue;                                       // flag6=false → skip 尾段处理
          }
          f6 = st.type[ti2] !== pitI;
          if (!f6) continue;
          if (flooded) { st.liquidType[ti2] = 1; st.liquid[ti2] = 255; }
          else { st.liquidType[ti2] = 0; st.liquid[ti2] = 0; }
          const e1 = c === i - widthA && actAt(c - 1, yy) !== 0;
          const e2 = c === i + widthA && actAt(c + 1, yy) !== 0;
          const e3 = yy === num + num3 && actAt(c, yy + 1) !== 0;
          const e4 = c === i - widthA + 1 && yy % 2 === 0 && actAt(c - 1, yy) !== 0;
          const e5 = c === i + widthA - 1 && yy % 2 === 0 && actAt(c + 1, yy) !== 0;
          const e6 = yy === num + num3 - 1 && c % 2 === 0 && actAt(c, yy + 1) !== 0;
          if (e1 || e2 || e3 || e4 || e5 || e6) chTile(ti2, SPIKE, false);
          else if (flagFalling) {
            if (c <= i - widthA + 2 || c >= i + widthA - 2 || yy >= num + num3 - 2) {
              chTile(ti2, brickI, false);
              st.wire[ti2] |= (1 << 5);                     // inActive(true)=wire bit5
            } else {
              st.flags[ti2] &= ~1;                          // active(false)
            }
          } else {
            st.flags[ti2] &= ~1;
          }
        }
      }
      if (!flagCrack) {                                     // 板线链 cs:330-400（Falling 族均走此支）
        let prevX = 0, prevY = 0;
        for (let c = i - num6; c <= i + num6; c++) {
          const startP = heights[c - (i - num6)]!;
          for (let q = startP - 1; q <= num + num7; q++) {
            if (!st.inBounds(c, q)) continue;
            let ti2 = st.idx(c, q);
            if (!(st.flags[ti2] & 1) || shOfAt(c, q) !== pitSheet) continue;
            let f12 = false, f13 = false;
            if (!flagFalling) {                             // flag4=!Falling&&!Cracked（现形族必不出）
              f12 = f13 = true;
            } else {
              const ti9 = st.inBounds(c, q + 1) ? st.idx(c, q + 1) : -1;
              if (c === i - widthA) f12 = true;
              if (ti9 < 0 || !(st.flags[ti9] & 1) || shOfAt(c, q + 1) !== pitSheet) {
                f12 = f13 = true;
                st.type[ti2] = brickI;                      // 直接改型（保活动/坡位原值,cs:362-368）
              }
            }
            if (f12) st.wire[ti2] |= 1;
            if (f13) st.wire[ti2] |= 16;
            if (st.slope[ti2] !== 0 || st.half[ti2] !== 0) continue;
            if (!st.inBounds(c, q - 1) || (st.flags[st.idx(c, q - 1)] & 1)) continue;
            placePlate(st, c, q - 1, 7, rng);               // PlaceTile(135,mute,true,false,-1,7)
            const tp = st.idx(c, q - 1);
            if ((st.flags[tp] & 1) && shOfAt(c, q - 1) === 135) {
              st.wire[tp] |= 1;
              if (prevX !== 0 || prevY !== 0) { /* AddWireFromPointToPoint：纯 wire 通道(8ch 不比),账面恒进 */ }
              prevX = c; prevY = q - 1;
            }
          }
        }
      }
      pits.push(hit);                                       // dungeonFeatures 登记（featOK veto 面）
      // ★IIIII200：受理成功后的写面终态（pt<k>p——与 pt<k> 入态同域对拍=本坑写迹）
      if (i200On) {
        mk179R(`PTP|k=${i200PitSeq}|i=${i}|j=${j}|num=${num}|num2=${num2}|hb=${hit.L},${hit.T},${hit.R},${hit.B}`);
        (globalThis as { __swI168BB?: (tag: string, l: number, t: number, r: number, b: number) => void })
          .__swI168BB?.(`i${instIdx + 1}pt${i200PitSeq}p`, i - num6 - 4, num2 - 4, i + num6 + 5,
            num + num7 + 6 > num2 + 40 ? num + num7 + 6 : num2 + 40);
      }
      return true;
    };
    // —— 计数表（cs:29-75）——
    const wszE = worldSizeIdx();
    let nAlt = 20, nOrb = 8, nDesert = 8, nSnow = 6, nCav = 4, nPitPerStyle = 4, nClump = 40, nClumpSnow = 40;
    if (wszE === 1) { nAlt = 30; nOrb = 14; nDesert = 12; nSnow = 10; nCav = 6; nPitPerStyle = 8; nClump = 60; nClumpSnow = 60; }
    else if (wszE === 2) { nAlt = 40; nOrb = 18; nDesert = 16; nSnow = 14; nCav = 8; nPitPerStyle = 12; nClump = 80; nClumpSnow = 80; }
    if (gs.seedFlags.noTraps) { nDesert = 0; nSnow = 0; nCav = 0; }   // actuallyNoTrapsForRealIMeanIt(cs:70-75)
    // ======== S1：标枪探针（cs:76-122）========
    for (let s1 = 0; s1 < gfStyles.length; s1++) {
      const stlS1 = gfStyles[s1]!;
      if (stlS1.Style !== 4 && stlS1.Style !== 5) continue;
      const bbS1 = _gfSeatProgBounds[s1];
      if (!bbS1) continue;
      const flagS1 = stlS1.Style === 5;
      let nCount = nAlt;
      let guard = 1000;
      let s1att = 0, s1hit = 0, s1ok = 0;   // ★IIIII192 观测（零掷）
      mk179R(`EAR|S1|st=${stlS1.Style}|i|bb=${bbS1.L},${bbS1.T},${bbS1.R},${bbS1.B}`);
      while (nCount > 0) {
        guard--;
        if (guard <= 0) break;
        s1att++;
        const nx = bbS1.L + ri(0, bbS1.R - bbS1.L - 1);
        let ny = bbS1.T + ri(0, bbS1.B - bbS1.T - 1);
        while (!(actAt(nx, ny) !== 0) && ny < h - 10) ny++;
        ny--;
        if (!(actAt(nx, ny) !== 0) && wallAt(nx, ny) === stlS1.BrickWallType) {
          s1hit++;
          const belowSheet = shOfAt(nx, ny + 1);
          const sft = dgECss(belowSheet);
          if (sft !== null && sft === (flagS1 ? 5 : 4)
            && belowSheet !== stlS1.BrickCrackedTileType && belowSheet !== stlS1.PitTrapTileType) {
            place3x2Altar(nx, ny, flagS1 ? 1 : 0);
            if ((actAt(nx, ny) !== 0) && typAt(nx, ny) === insSh(26)) { nCount--; s1ok++; }
          }
        }
      }
      mk179R(`EAR|S1|st=${stlS1.Style}|o|att=${s1att}|hit=${s1hit}|ok=${s1ok}|rem=${nCount}`);
    }
    // ======== S2：orb 臂（cs:126-160）========
    for (const orbKey of [4, 5]) {
      if (!gfFeatRooms.some((rr) => rr.st === orbKey)) continue;
      const list = gfFeatRooms.filter((rr) => rr.st === orbKey).slice();
      let placed = nOrb;
      let s2att = 0, s2ok = 0;              // ★IIIII192 观测（零掷）
      mk179R(`EAR|S2|k=${orbKey}|i|n=${list.length}`);
      while (list.length > 0 && placed > 0) {
        s2att++;
        const pick = list[rn(list.length)]!;
        const cx2 = Math.trunc((pick.L + pick.R) / 2);
        const cy2 = Math.trunc((pick.T + pick.B) / 2);
        addShadowOrbE(cx2, cy2, orbKey === 5);
        if (typAt(cx2, cy2) === insSh(31)) { placed--; s2ok++; }
        list.splice(list.indexOf(pick), 1);
      }
      mk179R(`EAR|S2|k=${orbKey}|o|att=${s2att}|ok=${s2ok}|rem=${placed}`);
    }
    // ======== S3：bee larva 臂（cs:163-172；dict[9] 双座不可达备案）========
    {
      const list = gfFeatRooms.filter((rr) => rr.st === 9).slice();
      if (typeof process !== 'undefined' && (__swProcessEnv ?? {}).SW_DG_GC === '1') {
        console.log(`GC-S3 n=${list.length} st9=` + list.map((r) => `${r.L},${r.T},${r.R},${r.B}`).join('|'));
      }
      while (list.length > 0) {
        const rm = list.shift()!;
        const cx3 = Math.trunc((rm.L + rm.R) / 2);
        const cy3 = Math.trunc((rm.T + rm.B) / 2);
        beeLarvaWrite(cx3 - 1, cy3 - 3);
      }
    }
    // ======== S4：dual per-room PitTrap（cs:174-303）========
    // ★IIIII192：C# dictionary 语义（EarlyDual.cs:127-141 建 dict[style]；S4 的
    //   `list4 = dictionary[style]` 是**引用**且逐 attempt Remove（cs:178 无 ToList），
    //   S5-S7 的 `dictionary[style].ToList()` 快照在 S4 **之后** ⇒ 起始名单=S4 消费后
    //   余量（x86 实锤：seat0 S7 n=7 vs 旧 JS 20；S4 st=1 att=13 → 20−13=7）。
    //   修=建共享 per-style 数组，S4 原地 splice；S5-S7 快照取修后余量并按 cs 固定
    //   序 3→2→1 分派（旧版按 gfStyles 迭代序,与 cs 块序可分歧）。
    const dictByStyle = new Map<number, typeof gfFeatRooms>();
    for (const rr of gfFeatRooms) {
      const arr = dictByStyle.get(rr.st);
      if (arr) arr.push(rr); else dictByStyle.set(rr.st, [rr]);
    }
    for (let k4 = 0; k4 < gfStyles.length; k4++) {
      const stlS4 = gfStyles[k4]!;
      const list4 = dictByStyle.get(stlS4.Style);
      let n15 = nPitPerStyle;                               // num6（世界规模档）
      let n16 = wszE === 1 ? 4 : wszE === 2 ? 6 : 2;        // Flooded 配额（cs:192-197）
      if (!list4 || list4.length === 0) continue;
      let s4att = 0, s4ok = 0, s4f2 = 0;                    // ★IIIII192 观测（零掷）
      mk179R(`EAR|S4|st=${stlS4.Style}|i|n=${list4.length}`);
      while (list4.length > 0 && n15 > 0) {
        s4att++;
        const pick = list4[rn(list4.length)]!;              // list4[Next(count)]
        if (pick.bio) { list4.splice(list4.indexOf(pick), 1); continue; }
        const iw = pick.R - pick.L;                         // DungeonBounds.Width=R−L
        const ih = pick.B - pick.T;
        const px = Math.trunc((pick.L + pick.R) / 2);
        const py = pick.B - 5;
        let wid = Math.trunc(iw / 2);
        let hgt = Math.trunc(Math.fround(ih * 0.75));
        const flag2 = n16 > 0 || rn(8) === 0;               // ★短路：配额>0 时 Next(8) 不掷
        if (flag2) s4f2++;
        // styleHook：DungeonGenerationStyles.cs Shimmer/LivingWood/Beehive/Temple/LivingMahogany 覆写
        const styleHookOk = !(pick.st === 9 || pick.st === 10 || pick.st === 11
          || pick.st === 13 || pick.st === 14);
        if (!styleHookOk) { mk179R(`EAR|S4X|st=${stlS4.Style}|rs=${pick.st}|hook=1`); list4.splice(list4.indexOf(pick), 1); continue; }
        const findSty = (cand: import('./DungeonStyles1457').DungeonStyleData | undefined):
          import('./DungeonStyles1457').DungeonStyleData | undefined => {
          if (!cand) return undefined;
          if (cand.Style === pick.st) return cand;
          for (const sb of cand.SubStyles ?? []) {
            const got = findSty(sb);
            if (got) return got;
          }
          return undefined;
        };
        let styObj: import('./DungeonStyles1457').DungeonStyleData | undefined;
        for (const s0 of gfStyles) {
          const got = findSty(s0);
          if (got) { styObj = got; break; }
        }
        if (styObj === undefined) { mk179R(`EAR|S4X|st=${stlS4.Style}|rs=${pick.st}|sty=0`); list4.splice(list4.indexOf(pick), 1); continue; }
        /** 三段梯共用受理+计数尾（cs 成功支：features.Add→quota→num15--） */
        const pitTry = (wN: number, hN: number): boolean =>
          dualPitTrap(px, py, wN, hN, 2, 2, 8, flag2, styObj!, pick)
          ? ((flag2 && n16 > 0 && (n16--, true)), n15--, true)
          : false;
        let stage = 0;
        if (!pitTry(wid, hgt)) {
          mk179R(`EAR|S4G|st=${stlS4.Style}|s=1|g=${pitGate}`);       // ★IIIII192 观测（零掷）
          hgt = Math.max(10, Math.trunc(Math.fround(ih * 0.5)));      // 第二段收窄（cs:243）
          if (!pitTry(wid, hgt)) {
            mk179R(`EAR|S4G|st=${stlS4.Style}|s=2|g=${pitGate}`);
            wid = Math.trunc(Math.fround(Math.trunc(iw / 2) * 0.75));  // 第三段（cs:271,W/2 先整除）
            stage = pitTry(wid, hgt) ? 3 : 0;
            if (stage === 0) mk179R(`EAR|S4G|st=${stlS4.Style}|s=3|g=${pitGate}`);
          } else { stage = 2; }
        } else { stage = 1; }
        if (stage > 0) s4ok++;
        mk179R(`EAR|S4T|st=${stlS4.Style}|rs=${pick.st}|f2=${flag2 ? 1 : 0}|w=${wid}|h=${hgt}|sg=${stage}|g=${stage > 0 ? 'ok' : pitGate}`);
        list4.splice(list4.indexOf(pick), 1);
      }
      mk179R(`EAR|S4|st=${stlS4.Style}|o|att=${s4att}|ok=${s4ok}|f2=${s4f2}|rem=${n15}`);
    }
    // ======== S5/S6/S7：DropTrap 字典三臂（cs:304-412）========
    //   ★IIIII192：快照=dictByStyle（S4 消费后余量）.slice()；分派序=cs 固定块序 3→2→1。
    const dropArm = (roomStyleKey: number, styObj: import('./DungeonStyles1457').DungeonStyleData,
      budget: number, kindPick: 'random' | 'Slush' | 'Silt'): void => {
      const listX = (dictByStyle.get(roomStyleKey) ?? []).slice();
      let datt = 0, dtile = 0, dkind = 0, dok = 0;          // ★IIIII192 观测（零掷）
      const armName = roomStyleKey === 3 ? 'S5' : roomStyleKey === 2 ? 'S6' : 'S7';
      mk179R(`EAR|${armName}|st=${roomStyleKey}|i|n=${listX.length}|bud=${budget}`);
      while (listX.length > 0 && budget > 0) {
        datt++;
        const pick = listX[rn(listX.length)]!;
        let tries = 20;                                     // num17/num20/num23=20 内环
        const proj = { style: styObj.Style, brickTileType: styObj.BrickTileType, brickWallType: styObj.BrickWallType };
        while (tries > 0 && budget > 0) {
          tries--;
          const px = pick.L + ri(0, pick.R - pick.L - 1);
          let py = pick.T + ri(0, pick.B - pick.T - 1);
          if (!inW(px, py, 25)) continue;
          let sy = py;
          while (sy < (h - 200) - 10 && !(actAt(px, sy) !== 0)) sy++;
          if (actAt(px, sy) === 0) continue;                 // C# 读 tile.active() 终判
          if (shOfAt(px, sy) !== styObj.BrickTileType) continue;
          dtile++;
          const kind = kindPick === 'random' ? (rn(2) !== 0 ? 'Lava' : 'Sand')
            : kindPick === 'Slush' ? 'Slush' : 'Silt';
          if (kindPick === 'random') dkind++;
          const okD = deDropTrap({ st, w, h, ws, uw: h - 200, rng,
            canGenerateFeatureAt: (qx, qy) => featOK(qx, qy, 0),
            // ★IIIII108c 第④刀：成功盒登记（cs SetBounds 直值,hitbox 半开语义同构）
            registerDropBox: (box) => {
              const db = new DBnd(w, h);
              db.set(box.L, box.T, box.R, box.B);
              dropBoxes.push(db);
            } },
            px, sy, proj, kind);
          if (okD) { budget--; dok++; }
        }
        listX.splice(listX.indexOf(pick), 1);
      }
      mk179R(`EAR|${armName}|st=${roomStyleKey}|o|att=${datt}|tile=${dtile}|kind=${dkind}|ok=${dok}|rem=${budget}`);
    };
    // ★IIIII192：cs:304/:352/:386 三块固定序 dict[3]→dict[2]→dict[1]（与 gfStyles 迭代序解耦）
    for (const s0 of gfStyles) if (s0.Style === 3) dropArm(3, s0, nDesert, 'random');
    for (const s0 of gfStyles) if (s0.Style === 2) dropArm(2, s0, nSnow, 'Slush');
    for (const s0 of gfStyles) if (s0.Style === 1) dropArm(1, s0, nCav, 'Silt');
    // （后续 cs:420-589 五臂 TileClump、cs:588-591 GenerateEarlyDungeonFeaturesInRoom/
    //   Biome 祭坛尾/dual 早退由 IIII106b 五臂块与 §⑥ 第 4 刀分别承接——次序同 cs）
  }
  // ★IIIII106b（2026-09-01）：DungeonGlobalEarlyDualDungeonFeatures.EarlyDungeonFeatures
  //   的【TileClump 臂】双座实装（cs:394-589 终态）——②号移交件「ExtraWallTypes 写笔
  //   定位」定谳=写笔在本段：style3(Desert) 三臂 Tile{53,397,404}/Wall{216,216,223}、
  //   style2(Snow) 两臂 Tile{147,224}/Wall{40}，OnlyReplace=本风格 Brick 对——x86 在
  //   biome 房体把风格主砖洗成天然生物系块+墙（G2@033 D 族 HardenedSand216/SnowWall40/
  //   DesertFossil223 全部源此；Crystal186 系 style15 房体 BrickWallType 正常涂墙）。
  //   此前 JS 恒 stub ⇒ 整面漏写。掷面=每候选 Next(W)+Next(H)（wall gate 失败即
  //   continue）+命中后 seed/strength/steps 三掷；clump 本体走内部 UnifiedRandom(
  //   RandomSeed) 零主流掷（deTileClump=IIIII59 认证体 1:1）。num7/num8 按 GetWorldSize()
  //   case 取值（cs:36-75；4200²=case0→40/40）。GetStyleForTile 门按 cs:722-743 直译。
  //   ★启用门=SW_I138_EARLY（★IIIII164 缺省 ON）：本臂依赖 S1..S7（标枪探针/字典 DropTrap 臂）
  //   掷位与上游 ±Δ 归零——s1 PD_OUT 门开 14,590→9,614 零新差后翻转。
  if (gfStyles.length > 0 && _gfSeatProgBounds !== null
    && i138EarlyGate()) {
    const dgECss = (tileSheet: number): number | null => {
      if (tileSheet < 0) return null;
      for (const s0 of gfStyles) {
        if (tileIsInStyle(s0, tileSheet, false, true)) return s0.Style;
        for (const ss of s0.SubStyles ?? []) {
          if (tileIsInStyle(ss, tileSheet, false, true)) return ss.Style;
        }
      }
      return null;
    };
    const sheetE = (x2: number, y2: number): number => TILE_DEFS[typAt(x2, y2)]?.vanilla?.sheet ?? -1;
    const dgECtx = {
      st, w, h, ws,
      uw: h - 200,
      rng,
      canGenerateFeatureAt: (qx: number, qy: number): boolean => featOK(qx, qy, 0),
    };
    const wszEI6 = worldSizeIdx();
    const num7E = wszEI6 === 0 ? 40 : wszEI6 === 1 ? 60 : 80;    // cs:47-49/:55-57/:64-66
    const num8E = num7E;                                        // cs:50/:58/:67 num8=num7 同值
    for (let lE = 0; lE < gfStyles.length; lE++) {
      const stlE = gfStyles[lE]!;
      const bbE = _gfSeatProgBounds[lE]!;
      if (!bbE) continue;
      if (stlE.Style === 3) {
        // arm1 ×num7：TileType=53(Sand) WallType=216(HardenedSand)（cs:443-477）
        let a1att = 0, a1ok = 0;
        mk179R(`EAR|CL|arm=1|st=3|i`);
        for (let nA = num7E, capA = 1000; nA > 0 && capA > 0;) {
          capA--; a1att++;
          const ax = bbE.L + ri(0, bbE.R - bbE.L - 1);
          const ay = bbE.T + ri(0, bbE.B - bbE.T - 1);
          if (!inW(ax, ay, 0) || st.wall[st.idx(ax, ay)] !== stlE.BrickWallType) continue;
          if (dgECss(sheetE(ax, ay)) !== 3) continue;
          deTileClump(dgECtx, ax, ay, {
            randomSeed: raw(), strength: 25 + ri(0, 9), steps: 25 + ri(0, 9),
            tileType: 53, wallType: 216,
            onlyReplaceThisTileType: stlE.BrickTileType, onlyReplaceThisWallType: stlE.BrickWallType,
          });
          nA--; a1ok++;
        }
        mk179R(`EAR|CL|arm=1|st=3|o|att=${a1att}|ok=${a1ok}`);
        // arm2 ×num7：TileType=397(HardenedSand 块) WallType=216（cs:480-514）
        let a2att = 0, a2ok = 0;
        mk179R(`EAR|CL|arm=2|st=3|i`);
        for (let nB = num7E, capB = 1000; nB > 0 && capB > 0;) {
          capB--; a2att++;
          const bx2 = bbE.L + ri(0, bbE.R - bbE.L - 1);
          const by2 = bbE.T + ri(0, bbE.B - bbE.T - 1);
          if (!inW(bx2, by2, 0) || st.wall[st.idx(bx2, by2)] !== stlE.BrickWallType) continue;
          if (dgECss(sheetE(bx2, by2)) !== 3) continue;
          deTileClump(dgECtx, bx2, by2, {
            randomSeed: raw(), strength: 25 + ri(0, 9), steps: 25 + ri(0, 9),
            tileType: 397, wallType: 216,
            onlyReplaceThisTileType: stlE.BrickTileType, onlyReplaceThisWallType: stlE.BrickWallType,
          });
          nB--; a2ok++;
        }
        mk179R(`EAR|CL|arm=2|st=3|o|att=${a2att}|ok=${a2ok}`);
        // arm3 ×num8*2：TileType=404(DesertFossil) WallType=223；strength/steps=15+N(5)（cs:517-551）
        let a3att = 0, a3ok = 0;
        mk179R(`EAR|CL|arm=3|st=3|i`);
        for (let nC = num8E * 2, capC = 1000; nC > 0 && capC > 0;) {
          capC--; a3att++;
          const cx2 = bbE.L + ri(0, bbE.R - bbE.L - 1);
          const cy2 = bbE.T + ri(0, bbE.B - bbE.T - 1);
          if (!inW(cx2, cy2, 0) || st.wall[st.idx(cx2, cy2)] !== stlE.BrickWallType) continue;
          if (dgECss(sheetE(cx2, cy2)) !== 3) continue;
          deTileClump(dgECtx, cx2, cy2, {
            randomSeed: raw(), strength: 15 + ri(0, 4), steps: 15 + ri(0, 4),
            tileType: 404, wallType: 223,
            onlyReplaceThisTileType: stlE.BrickTileType, onlyReplaceThisWallType: stlE.BrickWallType,
          });
          nC--; a3ok++;
        }
        mk179R(`EAR|CL|arm=3|st=3|o|att=${a3att}|ok=${a3ok}`);
      }
      if (stlE.Style !== 2) {
        continue;                                               // cs:554 continue（styles 迭代）
      }
      // arm4 ×num8：TileType=147(SnowBlock) WallType=40（cs:561-597）
      let a4att = 0, a4ok = 0;
      mk179R(`EAR|CL|arm=4|st=2|i`);
      for (let nD = num8E, capD = 1000; nD > 0 && capD > 0;) {
        capD--; a4att++;
        const dx2 = bbE.L + ri(0, bbE.R - bbE.L - 1);
        const dy2 = bbE.T + ri(0, bbE.B - bbE.T - 1);
        if (!inW(dx2, dy2, 0) || st.wall[st.idx(dx2, dy2)] !== stlE.BrickWallType) continue;
        if (dgECss(sheetE(dx2, dy2)) !== 2) continue;
        deTileClump(dgECtx, dx2, dy2, {
          randomSeed: raw(), strength: 25 + ri(0, 9), steps: 25 + ri(0, 9),
          tileType: 147, wallType: 40,
          onlyReplaceThisTileType: stlE.BrickTileType, onlyReplaceThisWallType: stlE.BrickWallType,
        });
        nD--; a4ok++;
      }
      mk179R(`EAR|CL|arm=4|st=2|o|att=${a4att}|ok=${a4ok}`);
      // arm5 ×num8：TileType=224(Slush) WallType=40（cs:599-635）
      let a5att = 0, a5ok = 0;
      mk179R(`EAR|CL|arm=5|st=2|i`);
      for (let nE2 = num8E, capE = 1000; nE2 > 0 && capE > 0;) {
        capE--; a5att++;
        const ex2 = bbE.L + ri(0, bbE.R - bbE.L - 1);
        const ey2 = bbE.T + ri(0, bbE.B - bbE.T - 1);
        if (!inW(ex2, ey2, 0) || st.wall[st.idx(ex2, ey2)] !== stlE.BrickWallType) continue;
        if (dgECss(sheetE(ex2, ey2)) !== 2) continue;
        deTileClump(dgECtx, ex2, ey2, {
          randomSeed: raw(), strength: 25 + ri(0, 9), steps: 25 + ri(0, 9),
          tileType: 224, wallType: 40,
          onlyReplaceThisTileType: stlE.BrickTileType, onlyReplaceThisWallType: stlE.BrickWallType,
        });
        nE2--; a5ok++;
      }
      mk179R(`EAR|CL|arm=5|st=2|o|att=${a5att}|ok=${a5ok}`);
    }
  }
  // ======== S9 每房分派面（cs:588-591 GenerateEarlyDungeonFeaturesInRoom 循环；★IIIII109b）========
  //   次序=clump 五臂之后、祭坛尾之前（cs 原序）。分支按房间类：
  //    · BiomeRugged(5)  → dualRuggedEarlyFeatures（钟乳石+浮石,主流掷!——自 PRH 错置窗迁回）
  //    · BiomeStructured(6) → 窗×3（自种子 Next(2) 选支；1=柱×3 BlockActuatedSolidTop——
  //                         null 特征 StyleData 门全档恒 true 故 num2 不被改写）
  //    · 其余（Regular/Wormlike/Legacy/GenShape/LivingTree/BiomeSquare）
  //      = 基类 DungeonRoom.cs:61-125：自种子 Next(3)==0 → 窗（Closed=!(Bottom<=worldSurface)；
  //      GenShape Mound 中心 +Height/5；窗支=GetRoomCenterForDungeonFeature+room 级窗门）+
  //      LiquidType>=0 → FloodRoom（cs:293-304,Beehive 蜜/Shimmer 液）
  //   主流掷面=每窗 GetWindowPlatformStyle 1 掷（cs:161-168,表空不掷）。
  if (gfStyles.length > 0 && gfEarlyRooms.length > 0
    && i138EarlyGate()) {
    mk179R(`EAR|S9|i|rooms=${gfEarlyRooms.length}`);        // ★IIIII192 观测（零掷）
    // ★IIIII110c 诊断钩（零开销常态：__wvLines 未装配时全程空转）：S9 每房分派面
    //   写时账——room 序/kind/style/seed/box/门 + 每窗写位/档，供 x86 窗簇逐房对拍。
    const _w9L = (globalThis as { __wvLines?: string[] }).__wvLines ?? null;
    const w9 = (l: string): void => { if (_w9L) _w9L.push(`MARK|W9|${l}`); };
    let _w9i = 0;
    /** 每房窗写体（DungeonWindowBasic.Window :26-105 1:1,风格参数化）——
     *  玻璃=Closed?winGC:winG、边=winE、wallColor(0)（OverrideGlassPaint 本域恒 −1）、
     *  下缘越界支窗台（type19+frameY=style*18+color(0)+TileFrame 不建模）。
     *  Bounds=逐写格 UpdateBounds→winBoxes（DungeonWindow.CanGenerateFeatureAt 拒收面）。 */
    const winValidSpotS = (i2: number, j2: number, ww: number, wh: number): boolean => {
      if (i2 < 0 || j2 < 0 || i2 >= ww || j2 >= wh) return false;
      return !(j2 === 0 && (i2 === 0 || i2 === ww - 1));
    };
    const dgWindowSty = (px: number, py: number, ww: number, wh: number, closed: boolean, er: import('./DungeonDualLayout').DualEarlyRoom): void => {
      // GetWindowPlatformStyle（cs:161-168）：空表不掷恒 −1；Next(len)→Derived.tileStyle
      let plat = -1;
      if (er.winPlatS.length > 0) plat = er.winPlatS[rn(er.winPlatS.length)]!;
      const glass = closed ? er.winGC : er.winG;
      const box = new DBnd(w, h);
      box.set(px, py, px, py);
      const setW = (x2: number, y2: number, v: number): void => {
        if (st.inBounds(x2, y2)) {
          const ti2 = st.idx(x2, y2);
          st.wall[ti2] = v;
          st.paintWall[ti2] = 0;                    // wallColor(0)（DungeonWindowBasic.cs:47/:53/:59…）
          box.upd(x2, y2);
        }
      };
      const setTileP = (x2: number, y2: number): void => {
        if (!st.inBounds(x2, y2)) return;
        const ti2 = st.idx(x2, y2);
        st.flags[ti2] |= 1; st.wire[ti2] &= ~32;
        st.type[ti2] = PLATFORM; st.slope[ti2] = 0; st.half[ti2] = 0;
        st.frameY[ti2] = plat * 18;
        st.paint[ti2] = 0;                          // color(0)
      };
      for (let i2 = 0; i2 < ww; i2++) {
        const cx = px + i2 - Math.trunc(ww / 2);
        for (let j2 = 0; j2 < wh; j2++) {
          if (!winValidSpotS(i2, j2, ww, wh)) continue;
          const cy = py + j2 - Math.trunc(wh / 2);
          if (i2 === Math.trunc(ww / 2) || j2 === Math.trunc(wh / 2)) setW(cx, cy, er.winE);
          else setW(cx, cy, glass);
          if (!winValidSpotS(i2 - 1, j2, ww, wh)) setW(cx - 1, cy, er.winE);
          if (!winValidSpotS(i2 + 1, j2, ww, wh)) setW(cx + 1, cy, er.winE);
          if (!winValidSpotS(i2, j2 - 1, ww, wh)) setW(cx, cy - 1, er.winE);
          if (!winValidSpotS(i2, j2 + 1, ww, wh)) {
            setW(cx, cy + 1, er.winE);
            if (plat > -1) setTileP(cx, cy + 1);
          }
        }
      }
      box.calc();
      winBoxes.push(box);
      w9(`win|rm=${_w9i - 1}|x=${px}|y=${py}|w=${ww}|h=${wh}|cl=${closed ? 1 : 0}|plat=${plat}|st=${er.st}`);
    };
    for (const er of gfEarlyRooms) {
      w9(`room|${_w9i++}|kind=${er.kind}|st=${er.st}|seed=${er.seed}|box=${er.L},${er.T},${er.R},${er.B}|c=${er.cx},${er.cy}|ok=${er.winOK ? 1 : 0}|liq=${er.liquid}`);
      if (er.kind === 5) {                                       // BiomeRugged
        mk179R(`EAR|S9RUG|i=${_w9i - 1}|st=${er.st}|rc0=${dgMainRolls}`);
        if (dualLayoutCtxS) dualRuggedEarlyFeatures(dualLayoutCtxS, er);
        mk179R(`EAR|S9RUG|i=${_w9i - 1}|o|rc1=${dgMainRolls}`);
      } else if (er.kind === 6) {                                // BiomeStructured
        const ur = new UnifiedRandom(er.seed);
        const width = er.R - er.L, height = er.B - er.T, bottom = er.B;
        const x = er.cx, y = er.cy;
        const num = Math.trunc(Math.fround(width * 0.25));       // (int)((float)width*0.25f)
        let num2v = ur.nextInt(2);
        // CanGenerateFeatureAt(data,this,null,x,y)=房级 StyleData 门（DungeonGenerationStyleData.cs:97
        // 基类 true；Shimmer/Temple/Beehive/LivingWood 覆写对 **null 特征**全档 true）⇒ num2 不改写。
        if (num2v === 0) {
          const closed = ur.nextInt(3) !== 0;
          const h5 = Math.trunc(height / 5);
          w9(`struct|rm=${_w9i - 1}|n2=0|cl=${closed ? 1 : 0}|h5=${h5}|num=${num}|c=${x},${y}`);
          dgWindowSty(x, y, 9, h5, closed, er);
          dgWindowSty(x - num, y + 3, 7, h5 - 4, closed, er);
          dgWindowSty(x + num, y + 3, 7, h5 - 4, closed, er);
        } else {
          const num3 = 4;
          w9(`struct|rm=${_w9i - 1}|n2=1|pillars|num=${num}|c=${x},${y}|bot=${bottom}`);
          // BlockActuatedSolidTop：inact+SolidTop ±2 豁免；AlwaysPlaceEntirePillar=false；
          // 柱漆 b=OverridePaintTile>−1?Override:TilePaintColor（DungeonPillar.cs:107-113）
          const sp = er.opt > -1 ? er.opt : er.bPaint;
          dgPillar(x + 1, bottom + num3, 10, true, false, bottom - y + 5, false, true, er.brick, sp, true, false);
          dgPillar(x - num + 1, bottom + num3, 7, true, false, bottom - y, false, true, er.brick, sp, true, false);
          dgPillar(x + num, bottom + num3, 7, true, false, bottom - y, false, true, er.brick, sp, true, false);
        }
      } else {                                                   // 基类支（DungeonRoom.cs:61-125）
        // ★IIIII215 定谳刀：GenShape 房 Doughnut 内环填砖（GenShapeDungeonRoom.cs:53-64
        //   GenerateEarlyDungeonFeaturesInRoom override）——此前整缺 ⇒ st4(腐化,t25) 等 doughnut
        //   房内环空洞残缺。语义：InnerBounds.Center 为心、InnerShape 半径整除半(Max(1,hr/2),
        //   Max(1,vr/2)) 的 CircleRoom 填充域，动作链 ClearTile(Tile.cs:125 ClearSlope+inactive+
        //   inActive=false，type/color/帧保留)→SetTile(本房 BrickTileType,setSelfFrames:false,
        //   setNeighborFrames:false,clearTile:false ⇒ 裸 type+active 写)→SetTilePaint(0=null 不写)。
        //   零主流掷（WorldUtils.Gen 形状枚举+Actions 全直写）。实证=SPIKES attempt174 (957,560)
        //   a 0↔1 首差（x86 t25 活带 13 格 x[950,962]@cy560 与 hrF=6/vrF=7 椭圆逐格吻合）→
        //   值流自此漂移 → WALLVARIANTS blob 37k 墙差 → LIGHTS +22,250 等十四段全链投影。
        if (er.shape === 3 && er.brick >= 0) {
          const hrF = Math.max(1, Math.trunc(er.hr / 2));
          const vrF = Math.max(1, Math.trunc(er.vr / 2));
          const brickT = TILE_INTERNAL_BY_SHEET.get(er.brick) ?? -1;
          const paintD = er.opt > -1 ? er.opt : er.bPaint;      // Override>−1?Override:TilePaintColor
          for (let dyF = -vrF; dyF <= vrF; dyF++) {
            const yyF = er.cy + dyF;
            if (!st.inBounds(er.cx, yyF)) continue;
            const ratioF = (hrF / vrF) * dyF;                   // (double)hr/vr*(i−origin.Y)
            const dxF = Math.min(hrF, Math.trunc(Math.sqrt((hrF + 1) * (hrF + 1) - ratioF * ratioF)));
            for (let xxF = er.cx - dxF; xxF <= er.cx + dxF; xxF++) {
              if (!st.inBounds(xxF, yyF)) continue;
              const tiF = st.idx(xxF, yyF);
              st.slope[tiF] = 0; st.half[tiF] = 0;              // ClearTile: ClearSlope
              st.wire[tiF] &= ~32;                              // inActive(false)（inactive 位=wire:5）
              st.type[tiF] = brickT;                            // SetTile: type=brick
              st.flags[tiF] |= 1;                               // SetTile: active(true)（ClearTile 的 inactive 被覆写,净=活）
              if (paintD > 0) st.paint[tiF] = paintD;           // SetTilePaint: paintID!=0 才写
            }
          }
        }
        const ur = new UnifiedRandom(er.seed);
        const _n3 = ur.nextInt(3);
        w9(`base|rm=${_w9i - 1}|n3=${_n3}|st=${er.st}`);
        if (_n3 === 0) {
          let num = 1;
          const width = er.R - er.L, height = er.B - er.T;
          const closed = !(er.B <= ws);                          // Closed=!(Bottom<=worldSurface)
          let num2v = ur.nextInt(3);
          if (num2v >= 1 && num2v <= 2 && (width <= 36 || height <= 15)) num2v = 0;
          let flag = true;
          if (num2v === 0 && (width <= 14 || height <= 10)) flag = false;
          w9(`basewin|rm=${_w9i - 1}|n2=${num2v}|flag=${flag ? 1 : 0}|cl=${closed ? 1 : 0}|wh=${width}x${height}|ok=${er.winOK ? 1 : 0}`);
          if (flag) {
            let cxF = er.cx, cyF = er.cy;
            // GetRoomCenterForDungeonFeature：GenShape Mound → cy += Height/5（:76-85）
            if (er.shape === 1) cyF += Math.trunc(height / 5);
            // 窗门=房级 CanGenerateFeatureAt(data,window,·,·)（DungeonRoom.cs:66-71 →
            //   StyleData 静态门+GenShape Hourglass/Doughnut 拒）——winOK 载荷已并档；
            //   非 data 级 featOK 链（cs 此处不查 feature-veto 盒）。
            if (num2v === 0) {                                   // (num2==0||(uint)(num2−1)>1) ≡ num2==0
              num = Math.max(3, Math.trunc(width / 3));
              if (num % 2 === 0) num++;
              const ww = Math.max(3, num), wh = Math.max(5, Math.trunc(height / 3));
              if (er.winOK) dgWindowSty(cxF, cyF, ww, wh, closed, er);
            } else {
              num = Math.min(7, Math.max(3, Math.trunc(width / 5)));
              if (num % 2 === 0) num++;
              const ww = Math.max(3, num), wh0 = Math.max(5, Math.trunc(height / 3));
              if (er.winOK) dgWindowSty(cxF, cyF, ww, wh0, closed, er);
              if (er.winOK) dgWindowSty(cxF - num - 2, cyF, ww, wh0 - 2, closed, er);
              if (er.winOK) dgWindowSty(cxF + num + 2, cyF, ww, wh0 - 2, closed, er);
            }
          }
        }
        if (er.liquid >= 0) {                                    // FloodRoom（cs:293-304）
          // ★IIIII114b2 定罪（G 混沌·FloodRoom 编码）：er.liquid=风格表 LiquidType
          //   （vanilla/C# 基：Shimmer=3/Beehive=2/水=0）而本仓 liquidType 为 **+1 编码**
          //   （TileStore.LIQUID_TYPE：水1/岩浆2/蜜3/微光4）——曾裸写 ⇒ shimmer 房整室
          //   浸"蜜"(3)、beehive 房浸"岩浆"(2)、水泛写 0=无液。同族病 dgPitTrap 曾修
          //   （:3402 写 1）此处漏跟。x86 侧 shimmer 房浸 shimmer ⇒ AddBuriedChest 扫描
          //   步 anyShimmer()（WG.cs:36486）整房拒箱（rm17 型 1000/1000 why=shimmer 实证）。
          for (let i2 = er.L; i2 <= er.R; i2++) {
            for (let j2 = er.cy; j2 <= er.B; j2++) {
              if (!st.inBounds(i2, j2)) continue;
              const ti2 = st.idx(i2, j2);
              if (!(st.flags[ti2] & 1)) {
                st.liquid[ti2] = 255;
                st.liquidType[ti2] = er.liquid + 1;
              }
            }
          }
        }
      }
    }
    mk179R(`EAR|S9|o`);                                     // ★IIIII192 观测（零掷）
  }
  // ======== S9 祭坛尾（cs:592-637；★IIIII108c 第③刀·纯写面零主流掷）========
  //   temple(style10) Biome 房末席制（cs:124-140 赋值不覆盖已选）→ 顶沿下扫首活性行，
  //   三列(−1..1)自该行起逐格「ClearTile+active+type226」充砖至下一活性格，尾接
  //   WorldGen.AddLihzahrdAltar(x2−1,y−2) 3×2 祭坛(t237)+底缘 t226（ClearEverything 全清保墙）。
  //   ★启用门与 S1..S7 同（SW_I138_EARLY，★IIIII164 缺省 ON）；GenerateEarlyDungeonFeaturesInRoom 每房分派面
  //   未随本小节移植（Biome 结构房窗柱/rugged 钟乳石系），另行承接——本段按 cs 次序恰位于其后。
  if (gfStyles.length > 0 && _gfSeatProgBounds !== null && gfFeatRooms.length > 0
    && i138EarlyGate()) {
    const insSh = (sheetId: number): number => TILE_INTERNAL_BY_SHEET.get(sheetId) ?? -1;   // 本块局部映射
    let templeRm: { L: number; T: number; R: number; B: number } | null = null;
    for (const rr of gfFeatRooms) {                         // cs 循环内持续赋值=末席制
      if (rr.bio && rr.st === 10) templeRm = rr;
    }
    if (templeRm !== null) {
      const cxT = (templeRm.L + templeRm.R) >> 1;           // InnerBounds.Center.X
      const cyT = (templeRm.T + templeRm.B) >> 1;           // Center.Y
      void cyT;
      let num40 = (templeRm.T + cyT) >> 1;                  // cs:595 (Top+Center.Y)/2
      const actAtI = (x3: number, y3: number): boolean => st.inBounds(x3, y3) && (st.flags[st.idx(x3, y3)] & 1) !== 0;
      while (num40 < h - 1 && !actAtI(cxT, num40)) num40++;  // cs:596-601 首活性下扫
      for (let nA2 = -1; nA2 <= 1; nA2++) {                  // cs:602-616 三列充砖
        const colX = cxT + nA2;
        let num42 = num40;
        while (num42 < h - 1 && !actAtI(colX, num42)) {
          if (!st.inBounds(colX, num42)) break;
          const ti2 = st.idx(colX, num42);
          st.flags[ti2] |= 1;                               // active(true)
          st.wire[ti2] &= ~32;                              // inActive(false)（inactive 位=wire:5）
          st.slope[ti2] = 0; st.half[ti2] = 0;              // ClearSlope（type/wall/liquid/paint 均保留）
          st.type[ti2] = insSh(226);
          num42++;
        }
      }
      const ax0 = cxT - 1, ay0 = num40 - 2;                 // cs:617 AddLihzahrdAltar(x2−1,num40−2)
      for (let i2b = 0; i2b < 3; i2b++) {
        for (let j2b = 0; j2b < 2; j2b++) {
          if (!st.inBounds(ax0 + i2b, ay0 + j2b)) continue;
          const ti3 = st.idx(ax0 + i2b, ay0 + j2b);
          st.flags[ti3] |= 1; st.wire[ti3] &= ~32;          // ClearEverything 后重激活（保原墙号）
          st.type[ti3] = insSh(237);
          st.frameX[ti3] = (i2b * 18) & 0xffff;
          st.frameY[ti3] = (j2b * 18) & 0xffff;
          st.liquid[ti3] = 0; st.liquidType[ti3] = 0;
          st.slope[ti3] = 0; st.half[ti3] = 0;
          st.paint[ti3] = 0; st.paintWall[ti3] = 0;
          st.coat[ti3] = 0;                                 // bTileHeader3=0：涂装四链全清
        }
        if (!st.inBounds(ax0 + i2b, ay0 + 2)) continue;
        const tb2 = st.idx(ax0 + i2b, ay0 + 2);
        st.flags[tb2] |= 1; st.wire[tb2] &= ~32;
        st.type[tb2] = insSh(226);
        st.slope[tb2] = 0; st.half[tb2] = 0;
        st.liquid[tb2] = 0; st.liquidType[tb2] = 0;
        st.paint[tb2] = 0; st.paintWall[tb2] = 0; st.coat[tb2] = 0;
        st.frameX[tb2] = 0; st.frameY[tb2] = 0;
      }
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
  // ★IIIII106b：DungeonPitTrap 大循环门取证结论（cs:620-621）——vanilla 对
  //   DualDungeon 座**整跳**本循环（坑洞由 cs:172-303 per-room S4 臂承担）。但 S1..S7
  //   字典臂尚未移植、上游 ±Δ 未归零，现阶段跳过=−25,200 掷账缺口而保留=实测全拒
  //   （旧「PD→Pi 25,200 全常数 R3 风暴」）零写仅 +25,200 幻掷——两态下游同不可对齐。
  //   故默认维持旧行为；★IIIII164 缺省已翻转 ON（S4/S1..S7 写面认证后,双座整跳=vanilla 本相；
  //   SW_I138_EARLY=0 显式回退旧径对照态）。
  if (!(gfStyles.length > 0 && i138EarlyGate())) {
    dgEarly();
  }
  // ★IIIII192：EARLY o 与 i 成对（包裹 S1..S9 新径∨dgEarly 旧径；x86 同窗 SPIKES_i 前）
  mk179F('EARLY', 'o');
  snap('dungeonPi');
  dgpMark('pit_loop_end');
  mk179F('SPIKES', 'i'); dgSpikes(); mk179F('SPIKES', 'o'); snap('dungeonS'); stageDump('S');
  mk179F('DOORS', 'i'); dgDoorsF(); mk179F('DOORS', 'o'); snap('dungeonD'); stageDump('D');
  mk179F('WALLVARIANTS', 'i'); dgWallVariants(); mk179F('WALLVARIANTS', 'o'); snap('dungeonW'); stageDump('W');
  // ★IIIII104b 诊断钩（零开销常态）：W 段末 bounds/wv 快照对账（与 x86 rigA 'dg_bW' mark 同位）
  if (segWatch) {
    (globalThis as unknown as { __gfbxBounds?: Record<string, number> }).__gfbxBounds =
      { L: bounds.L, R: bounds.R, T: bounds.T, B: bounds.B, wv0: wallVariants[0], wv1: wallVariants[1], wv2: wallVariants[2], ws: Math.trunc(ws) };
  }
  if (dgTW) dgTW.plat1 = dgMainRolls;
  mk179F('PLATFORMS', 'i'); dgPlatforms(); mk179F('PLATFORMS', 'o'); snap('dungeonP'); stageDump('P');
  mk179F('BIOMECHESTS', 'i'); dgBiomeChests(); mk179F('BIOMECHESTS', 'o'); snap('dungeonC'); stageDump('C');
  mk179F('BOOKSHELVES', 'i'); dgBookshelves(); mk179F('BOOKSHELVES', 'o'); snap('dungeonB'); stageDump('B');
  mk179F('BASICCHESTS', 'i'); dgBasicChests(); mk179F('BASICCHESTS', 'o'); snap('dungeonG'); stageDump('G');
  bounds.inflate(25);
  mk179F('LIGHTS', 'i'); dgLights(); mk179F('LIGHTS', 'o'); snap('dungeonI'); stageDump('I');
  mk179F('TRAPS', 'i'); dgTraps(); mk179F('TRAPS', 'o'); snap('dungeonT'); stageDump('T');
  // ★IIIII105b：GroundFurniture_DualDungeons 分派（cs:22-31 Type==DualDungeon 支）。
  // gfStyles 空数组=非 dual/未装配 ⇒ 零掷零写（普通世界走 legacy 认证体不变）。
  mk179F('FURNITURE', 'i');
  if (gfStyles.length > 0) { dgFurnitureDual(); } else { dgFurniture(); }
  mk179F('FURNITURE', 'o');
  snap('dungeonF'); stageDump('F');
  mk179F('PAINTINGS', 'i'); dgPaintings(); mk179F('PAINTINGS', 'o'); snap('dungeonPa'); stageDump('Pa');
  mk179F('BANNERS', 'i'); dgBanners(); mk179F('BANNERS', 'o'); snap('dungeonBa'); stageDump('Ba');
  // ★HHHHHHH ⑤：DungeonGlobalLateDualDungeonFeatures（DungeonCrawler.cs:522-523,
  //   progress 0.99 DungeonLate）——Banners 之后、pass 收尾前
  mk179F('LATE', 'i'); dgLate(); mk179F('LATE', 'o'); snap('dungeonLate');
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

/** ★IIIII105c：GenVars.JungleItemCount 镜像（WG.cs:10146 GetNextJungleChestItem）——
 *  计数跨双座共享不分座（C# GenVars 静态面）；runDungeonPass 头重置=每世界一次。 */
let DG_JUNGLE_CHEST_COUNT = 0;

/** ★IIIII105c：Default 样式存根=GetCurrentDungeonStyle()（DC.cs :683-733）：Style0、
 *  item 表全【空数组非 null】。gfStyles 未装配时 Lights 候选判定的展开面 ——与旧
 *  isDW 门下 chGate/lantern 默认臂逐位同径（空数组→len==0 分支）。 */
const DG_DEFAULT_STUB = {
  Style: 0,
  Lch: {
    ChestItemTypes: [] as number[],
    ChandelierItemTypes: [] as number[],
    LanternItemTypes: [] as number[],
    LockedBiomeChestType: -1,
    LockedBiomeChestStyle: -1,
    BiomeChestItemType: -1,
    BiomeChestLootItemType: -1,
  },
};

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

