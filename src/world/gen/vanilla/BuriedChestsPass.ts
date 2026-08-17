// 原版 "Buried Chests"(L7907)+ "Surface Chests"(L8019)+ "Water Chests"(L8058)移植。
// 样式语义(AddBuriedChest L21335+ / PlaceChestDirect L34112:frameX=36*style 横排):
//   -1 默认:y≥ws+25 → 金(1);冰系 tile(147/161/162)→ 冰箱(11)+冰系战利品;
//   地下沙漠 → tile467 style10+沙漠战利品;y>h-205 → 地狱箱(4)+地狱武器序;
//   Water Chests pass 固定 style17(水箱)+水中战利品;地表箱 style0 木箱(墙 244 → 12 天空箱)。
// 宝箱数量(Configuration.json):CaveChestCount 35-40 ScaleWith:WorldArea(÷5040000)、
//   UnderworldChestCount 10-15 ScaleWith:WorldWidth(÷4200)。
// 战利品 = AddBuriedChest(cs:35920-37560)1:1:按深度四分支(地表/金/洞穴/地狱),
//   主件 + 概率杂物表 + 主题旗标池(ice/desert/ivy/water/hell/sky 附加物)。
import { LIQUID_TYPE } from '../../TileStore';
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../../../data/items';
import { idsByVanillaSheet } from './TileRunner';
import { solidTile as solidTileHB } from './HalfBrickPass';
import { genSolidType } from './GenSolid';

const CHEST = TILE_BY_KEY['chest']!;
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;
const ALTAR = TILE_BY_KEY['v_26_altars']!;
const TALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;
const LARVA = TILE_BY_KEY['v_231_larva']!;
/** TileID.Sets.Boulders（TileID.cs:195）：138/484/664/665/711-716 */
const BOULDER_TILES = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
// ---- PlaceChest → TileObject.CanPlace 全链（TileObject.cs:174-857；sheet 空间表。
//      与 DungeonPass U 批同源（表副本，2026-08-17 箱族批移植——DungeonPass 为并行
//      会话禁区，不 import 防耦合））。旧 placeBuriedChest 只查「2×2 全空 + 双腿实心」，
//      漏：可切覆盖门（tileCut∖{484,654}∪BreakableWhenPlacing——vanilla 落箱可覆蛛网
//      51/洞穴装饰 165 等，首例 (2759,567) 隔离重放+vanilla AB 探针实锤）/边界 5 垫/
//      PlaceChest 双腿巨石门（读 type 不读 act）/锚腿平台-桌变体。 */
const PC_BOULDERS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** Main.tileCut（Main.cs；TileObject.cs:337-375 可覆盖集 = tileCut∖{484,654}）∪
 *  TileID.Sets.BreakableWhenPlacing（TileObjectData.cs:1768） */
const PC_TILE_CUT = new Set([3, 24, 28, 32, 51, 52, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 201, 205, 231, 236, 254, 352, 382, 444, 454, 484, 485, 518, 519, 528, 529, 549, 636, 637, 638, 654, 655, 711]);
const PC_BREAK_PLACE = new Set([324, 186, 187, 185, 165, 530, 233, 227, 485, 81, 624]);
/** Main.tileSolidTop（sheet 空间，U 批 DG_SOLID_TOP 同表）——锚腿②类门 */
const PC_SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** TileID.Sets.TileAnchorIfZero... noAttach 族（U 批 DG_NO_ATTACH 同表） */
const PC_NO_ATTACH = new Set([3, 4, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 27, 50, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 101, 102, 110, 114, 134, 387, 388, 390, 427, 435, 436, 437, 438, 439, 441, 467, 468, 469, 486, 487, 488, 489, 490, 497, 507, 564, 565, 568, 569, 570, 572, 580, 590, 593, 594, 595, 615, 620, 704, 707]);
/** 锚定无效表（U 批 DG_CHEST_ANCH_INVALID 同表） */
const PC_CHEST_ANCH_INVALID = new Set([127, 138, 664, 665, 484, 711, 712, 713, 714, 715, 716]);
const PC_PLATFORMS = new Set([19, 427, 435, 436, 437, 438, 439]);
/** 桌族（AnchorBottom 的 Table 类锚，U 批 DG_TILE_TABLE 同表） */
const PC_TILE_TABLE = new Set([14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 281, 285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);

/** 锚腿判定（TileObject.cs:376-442 AnchorBottom 链 = U 批 chestLegOK 同构）：
 *  ①SolidTile（tileSolid&&!solidTop&&!noAttach&&!anchorInvalid）②平台 ③solidTop
 *  ④桌。★SolidTile 路须 blockType()==0（cs:388 `FlattenAnchors || blockType()==0`，
 *  chest FlattenAnchors=false）——半砖/坡腿不算实心锚。野外洞穴地形有大量半砖/坡
 *  （SmoothWorld 产物），曾漏检致 (755,695) 站坡腿上 vanilla 拒/JS 收的流分叉
 *  （2026-08-17 x86 AB 探针+hs54 half/slope 真值实锤）。 */
function chestLegOK(st: TileStore, lx: number, ly: number): boolean {
  if (!st.inBounds(lx, ly)) return false;
  const i = st.idx(lx, ly);
  if (!st.flags[i]) return false;                                   // nactive()=false
  const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
  const internal = st.type[i];
  const blockType0 = st.half[i] === 0 && st.slope[i] === 0;
  if (blockType0 && genSolidType(internal) && !PC_SOLID_TOP.has(sheet) && !PC_NO_ATTACH.has(sheet) && !PC_CHEST_ANCH_INVALID.has(sheet)) return true;
  if (PC_PLATFORMS.has(sheet)) return !PC_CHEST_ANCH_INVALID.has(sheet) && st.half[i] === 0;  // !halfBrick（properTopFrame 帧位不建模，备案）
  if (genSolidType(internal) && PC_SOLID_TOP.has(sheet)) return true;                          // solidTop 路（cs:402 无 blockType 门）
  if (PC_TILE_TABLE.has(sheet)) return blockType0;                   // Table 路（cs:407 blockType==0）
  return false;
}

export type ChestSink = Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }>;

/** 宝箱主题旗标(AddBuriedChest flag2/3/4/5/6/8) */
export interface ChestFlags {
  ice?: boolean;    // flag2 冰箱(style 11)
  desert?: boolean; // flag3 沙漠箱(tile467 style10)
  ivy?: boolean;    // flag4 常春藤箱(style 10)
  water?: boolean;  // flag5 水箱(style 17)
  sky?: boolean;    // flag6 天空箱(style 12)
  hell?: boolean;   // flag8 地狱箱(style 4)
  wooden?: boolean; // flag 木箱(style 0)——地表战利品分支门禁
  mushroom?: boolean; // flag7 蘑菇箱(style 32,cs:36201)
  dungeon?: boolean;  // flag9 地牢箱（位置 IsDungeon 或上锁生物群系箱,cs:36211/:36219）
  skyTheme?: boolean; // flag12 天空主题箱（style 13 或主件 159/65/158/2219,cs:36227）
  temple?: boolean;   // flag13 神庙箱（style 16,cs:36206）
  lockedBiome?: boolean; // flag10 上锁生物群系箱（IsLockedDungeonBiomeChest,cs:36219）
}

/** Main.wallDungeon（Main.cs:10507-10513）：7/8/9 + 94-99（不含神庙墙 87——
 *  cs:17109 的 `wallDungeon[wall] || wall == 87` 是两道独立门） */
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
function isDungeonWall(wl: number): boolean {
  return DUNGEON_WALLS.has(wl);
}

// ---------- 战利品辅助 ----------
/** 原版物品 id → 本仓库物品 id;未注册返回 -1。
 *  VANILLA_ITEM_KEY_BY_ID 全量映射（vi_ 表覆盖 6146 件）——旧 vanillaItemKey
 *  只认 snake_case 显式注册（少数），宝箱战利品曾整条静默丢失 */
function vid(id: number): number {
  const k = VANILLA_ITEM_KEY_BY_ID[id];
  return k ? (ITEM_BY_KEY[k] ?? -1) : -1;
}

/** vi_N_… 键反解原版 id;legacy 键返回 null(主件直接用物品 id 入箱) */
function vanillaIdOfKey(key: string): number | null {
  const m = /^vi_(\d+)_/.exec(key);
  return m ? parseInt(m[1], 10) : null;
}

/** 锭 id(GenVars.copperBar 等语义:按本世界替代矿档位) */
function barIds(gs: GenState): { copper: number; iron: number; silver: number; gold: number } {
  const keyOf = (t: number) => TILE_DEFS[t]?.key ?? '';
  return {
    copper: keyOf(gs.oreTiers.copper).includes('tin') ? 703 : 20,
    iron: keyOf(gs.oreTiers.iron).includes('lead') ? 704 : 22,
    silver: keyOf(gs.oreTiers.silver).includes('tungsten') ? 705 : 21,
    gold: keyOf(gs.oreTiers.gold).includes('platinum') ? 706 : 19,
  };
}

/** 地狱箱主件序：Reset 已按原版位置洗牌（WorldGen.ts vanillaTerrain ④，
 *  cs:11262-11274——种子等价要求该洗牌发生在 pass 循环前，此处只轮换取用） */
function nextHellItem(gs: GenState): number {
  const items = gs.hellChestItems ?? [274, 220, 112, 218, 3019]; // 兜底（探针直调）
  return items[gs.hellChestIdx % items.length]; // 自增移到放置成功后（cs:36257-36264）
}

/** Chest.NearOtherChests（Terraria/Chest.cs:524-538）1:1：[x-25,x+25) × [y-8,y+8)
 *  内已有 BasicChest{21,467} → true。本仓"已有箱"按 chest/dresser 键族近似
 *  （与 MicroBiomesPass isContainer/TileID.Sets.IsAContainer 同口径，含 467/88） */
function nearOtherChests(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 25; i < x + 25; i++) {
    for (let j = y - 8; j < y + 8; j++) {
      if (!st.inBounds(i, j)) continue;   // Framing.GetTileSafely 界外 = 空格
      const k = st.idx(i, j);
      if (!st.flags[k]) continue;
      const key = TILE_DEFS[st.type[k]]?.key ?? '';
      if (key.includes('chest') || key.includes('dresser')) return true;
    }
  }
  return false;
}

/** 常春藤箱主件序(GetNextJungleChestItem cs:10130:循环 211/212/213/964 + 稀有替换) */
export function nextJungleItem(gs: GenState, rng: RNG): number {
  let result = [211, 212, 213, 964][gs.jungleItemIdx % 4];
  if (rng.int(0, 49) === 0) result = 753;       // 1/50 海草
  else if (rng.int(0, 14) === 0) result = 2292; // 1/15 玻璃钢鱼竿
  else if (rng.int(0, 19) === 0) result = 3017; // 1/20 花之靴
  gs.jungleItemIdx++;
  return result;
}

// ---- Item.Prefix(-1) 耗掷模型（cs:36253+ 战利品区 SetDefaults→Prefix(-1) 调用点 ×
// PrefixLegacy 前缀池，2026-08-17 箱族批）：原版每件【调用了 Prefix(-1) 且可前缀化】
// 的战利品消耗 1×Next(4)（25% 无前缀早退）；否则池内 Next(len) 选 1；命中
// ReducedNaturalChance 集（PrefixID.cs:9）再掷 Next(3)（2/3 弃前缀）。调用点全集 =
// {49,50,53,54,280,281,284,285,517,900,906,930,946,953,975,997,1260,1800,3068,
// 3069,3084,4341,4978,5010,5011,5465}（WorldGen.cs 36240-37580 逐行提取）；
// 其余物品（158/159/2219/277/274/220/112/218/3019/863/4404/187 等主件与全部杂物）
// 原版【不调 Prefix】→ 零掷。可前缀化并真正耗掷的交集：
//   49/53/54/285/906/953/975/3068/3084/4341/4978/5465/5010=acc、280=spears、
//   281=guns、284=boom、946=swords、3069=magic、5011=spears
//   （50 魔镜非武器非配饰/997 提炼机可放置/930 信号枪不在 GunsBows 集 → 真零掷）。
const PRE_POOLS: Record<string, number[]> = {
  swords: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 81],
  spears: [36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 59, 60, 61],
  guns: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 58, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 82],
  magic: [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 52, 36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 59, 60, 61, 83],
  boom: [36, 37, 38, 53, 54, 55, 39, 40, 56, 41, 57, 59, 60, 61],
  acc: [62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80],
};
const PRE_CLASS: Record<number, string> = {
  280: 'spears', 281: 'guns', 284: 'boom', 946: 'swords', 3069: 'magic', 5011: 'spears',
  49: 'acc', 53: 'acc', 54: 'acc', 285: 'acc', 906: 'acc', 953: 'acc', 975: 'acc',
  3068: 'acc', 3084: 'acc', 4341: 'acc', 4978: 'acc', 5465: 'acc',
};
// ---- 主件 Prefix(-1)（尾批 2-C）：四分支头 SetDefaults(num10)+Prefix(-1) 无条件调用
//   （surface cs:36287 / gold cs:36554 / cave cs:36841 / hell cs:37167）——可前缀化
//   即耗掷。类表 = PrefixLegacy.ItemSets 全集合逐一对号（x86 实证：冰箱 (1149,654)
//   vanilla 25 掷 vs JS 18 = 雪球炮 1319 Prefix Next(4) 早退 1 掷 + 门级联 6）。
Object.assign(PRE_CLASS, {
  // guns（GunsBows 集）：1319 雪球炮/964 巨口枪/3019 地狱翼弓
  1319: 'guns', 964: 'guns', 3019: 'guns',
  // swords（SwordsHammersAxesPicks 集）：724 寒冰刃/213 再生法杖/186 呼吸苇/65 星怒
  724: 'swords', 213: 'swords', 186: 'swords', 65: 'swords',
  // spears（SpearsMacesChainsaws… 集）：4061 风暴矛/277 三叉戟/274 暗黑长枪/220 日怒
  4061: 'spears', 277: 'spears', 274: 'spears', 220: 'spears',
  // magic（Magic 集）：4062 雷击杖/112 火之花/218 烈焰鞭
  4062: 'magic', 112: 'magic', 218: 'magic',
  // boom（BoomerangsChakrams 集）：670 寒冰回旋镖
  670: 'boom',
  // acc（accessory&&!vanity&&CanGetPrefixes 全过）：冰 950/987/1579、沙 4055/4056、
  // 丛林 211/212/3017、水 863/4404/187、金字塔 848/857、天空 159/158/2219
  950: 'acc', 987: 'acc', 1579: 'acc', 4055: 'acc', 4056: 'acc',
  211: 'acc', 212: 'acc', 3017: 'acc', 863: 'acc', 4404: 'acc', 187: 'acc',
  848: 'acc', 857: 'acc', 159: 'acc', 158: 'acc', 2219: 'acc',
  // ★5010 宝藏磁铁（GG 尾案①）：CanGetPrefixes 默认 true、非排除表（ItemID.cs:175
  //   CreateBoolSet(true, 排除 90 件) 无 5010）→ acc 可前缀化【耗掷】——曾两处注释
  //   自相矛盾（cs:37173-37177 调用点已接、类表漏登记："调而不耗"系误判）。
  //   x86 实证：(1318,1003) 双 PFX 且 vanilla loot 段比 JS 多掷（地狱尾 3-4 掷族）
  5010: 'acc',
  // 不可前缀化（零掷，勿加）：4262/4263/4276 沙漠杂件、753 海草、2292 玻璃钢鱼竿
  //   （GetRollablePrefixes 无 fishing 分支）、934 法老面罩、832 活木魔棒、997/669
});
const PRE_REDUCED = new Set([7, 8, 9, 10, 11, 22, 23, 24, 29, 30, 31, 39, 40, 56, 41, 47, 48, 49]);
// ---- TryGetPrefixStatMultipliersForItem 四失败门（Item.cs:1045-1060，GG 批尾案）：
//   dmg≠1 && Math.Round(damage×dmg)==damage（.NET 银行家舍入 + float32 乘）
//   spd≠1 && Math.Round(useAnimation×spd)==useAnimation
//   mcst≠1 && Math.Round(mana×mcst)==mana
//   kb≠1 && knockBack==0
//   失败 → Prefix while 环重进（rolledPrefix=-1 → 再掷 Next(4)+池(+Next3)）。
//   池内前缀乘子表（switch 1-61/81-83，只记检查消费的 dmg/kb/spd/mcst 四元）：
const PRE_MULT: Record<number, readonly [number, number, number, number]> = {
  //                    dmg    kb    spd   mcst
  3: [1.05, 1, 1, 1], 4: [1.1, 1.1, 1, 1], 5: [1.15, 1, 1, 1], 6: [1.1, 1, 1, 1],
  8: [0.85, 0.85, 1, 1], 10: [0.85, 1, 1, 1],
  11: [1, 0.9, 1.1, 1], 12: [1.05, 1.1, 1.15, 1], 13: [0.9, 0.8, 1, 1],
  14: [1, 1.15, 1.1, 1], 15: [1, 0.9, 0.85, 1],
  16: [1.1, 1, 1, 1], 17: [1, 1, 0.85, 1], 18: [1, 1, 0.9, 1],
  19: [1, 1.15, 1, 1], 20: [1.1, 1.05, 0.95, 1], 21: [1.1, 1.15, 1, 1],
  22: [0.85, 0.9, 1, 1], 23: [1, 1, 1.15, 1], 24: [1, 0.8, 1.1, 1],
  25: [1.15, 1, 1.1, 1], 58: [0.85, 1, 0.85, 1],
  26: [1.1, 1, 1, 0.85], 27: [1, 1, 1, 0.85], 28: [1.15, 1.05, 1, 0.85],
  29: [1, 1, 1, 1.1], 30: [0.9, 1, 1, 1.2], 31: [0.9, 0.9, 1, 1],
  32: [1.1, 1, 1, 1.15], 33: [1, 1.1, 0.9, 1.1], 34: [1.1, 1.1, 1.1, 0.9],
  35: [1.15, 1.15, 1, 1.2], 52: [0.9, 1, 0.9, 0.9],
  81: [1.15, 1.15, 0.9, 1], 82: [1.15, 1.15, 0.9, 1], 83: [1.15, 1.15, 0.9, 0.9],
  37: [1.1, 1.1, 1, 1], 38: [1, 1.15, 1, 1], 53: [1.1, 1, 1, 1],
  54: [1, 1.15, 1, 1], 55: [1.05, 1.15, 1, 1], 56: [1, 0.8, 1, 1],
  57: [1.18, 0.9, 1, 1], 59: [1.15, 1.15, 1, 1], 60: [1.15, 1, 1, 1],
  39: [0.7, 0.8, 1, 1], 40: [0.85, 1, 1, 1], 41: [0.9, 0.85, 1, 1],
  42: [1, 1, 0.9, 1], 43: [1.1, 1, 0.9, 1], 44: [1, 1, 0.9, 1],
  45: [1, 1, 0.95, 1], 46: [1.07, 1, 0.94, 1], 47: [1, 1, 1.15, 1],
  48: [1, 1, 1.2, 1], 49: [1, 1, 1.08, 1], 50: [0.8, 1, 1.15, 1],
  51: [1.05, 0.9, 0.9, 1],
  // 62-80 配饰前缀无 case（全乘子=1）→ 恒通过；1/2/7/9/36/61 等仅动 size/crt → 恒通过
};
// per-item 基础属性（SetDefaults 终值；4061/4062 为 DefaultToSpear/Staff 派生，
// itemcombat 提取表缺这两件故手抄源码）。kb 只需区分 ==0（四失败门之四）。
const PRE_STATS: Record<number, { d: number; ua: number; mana: number; kb0: boolean }> = {
  280: { d: 8, ua: 31, mana: 0, kb0: false }, 281: { d: 9, ua: 25, mana: 0, kb0: false },
  284: { d: 10, ua: 20, mana: 0, kb0: false }, 946: { d: 10, ua: 22, mana: 0, kb0: false },
  // ★3069：mana=2（全 mcst≠1 前缀失败）+ knockBack=0（全 kb≠1 前缀失败）——
  //   池 36 项中 12 项失败 → 地表木箱十选一的主要再掷源
  3069: { d: 14, ua: 26, mana: 2, kb0: true },
  5011: { d: 9, ua: 45, mana: 0, kb0: false }, 1319: { d: 10, ua: 19, mana: 0, kb0: false },
  964: { d: 14, ua: 40, mana: 0, kb0: false }, 3019: { d: 22, ua: 13, mana: 0, kb0: false },
  724: { d: 17, ua: 20, mana: 0, kb0: false }, 213: { d: 7, ua: 25, mana: 0, kb0: false },
  186: { d: 10, ua: 27, mana: 0, kb0: false }, 65: { d: 25, ua: 20, mana: 0, kb0: false },
  277: { d: 14, ua: 31, mana: 0, kb0: false }, 274: { d: 34, ua: 22, mana: 0, kb0: false },
  220: { d: 32, ua: 45, mana: 0, kb0: false }, 112: { d: 48, ua: 16, mana: 12, kb0: false },
  218: { d: 32, ua: 30, mana: 21, kb0: false }, 670: { d: 21, ua: 20, mana: 0, kb0: false },
  4061: { d: 14, ua: 28, mana: 0, kb0: false }, 4062: { d: 24, ua: 17, mana: 6, kb0: false },
};
const __fr = Math.fround;
/** .NET Math.Round(float32 积, MidpointRounding.ToEven) == base（银行家舍入） */
function netRoundEq(base: number, mult: number): boolean {
  const v = __fr(__fr(base) * __fr(mult));   // (float)base * mult 在 float32 域
  const fl = Math.floor(v);
  const diff = v - fl;
  let r: number;
  if (diff > 0.5) r = fl + 1;
  else if (diff < 0.5) r = fl;
  else r = fl % 2 === 0 ? fl : fl + 1;       // 恰 .5 → 取偶
  return r === base;
}
/** Item.Prefix while 环四失败门（cs:546-550 → flag=true 重进环） */
function prefixTryGetFails(rolled: number, item: number): boolean {
  const s = PRE_STATS[item];
  if (!s) return false;                      // 配饰池（62-80）无乘子 → 恒通过
  const m = PRE_MULT[rolled];
  if (!m) return false;                      // 前缀无四项乘子 → 恒通过
  if (m[0] !== 1 && netRoundEq(s.d, m[0])) return true;
  if (m[2] !== 1 && netRoundEq(s.ua, m[2])) return true;
  if (m[3] !== 1 && netRoundEq(s.mana, m[3])) return true;
  if (m[1] !== 1 && s.kb0) return true;
  return false;
}
/** Prefix(-1) 耗掷（结果不入箱——原版前缀只改数值；此函数只保流）。
 *  1:1 while 环（cs:523-556）：Next(4)==0 早退 → 池 Next(len) → Reduced Next(3)
 *  → TryGet 四失败门失败则重进环（Next(4)+池再掷——GG 批残余①：地狱尾 3-4 掷） */
function prefixRolls(rng: RNG, item: number): void {
  const cls = PRE_CLASS[item];
  if (!cls) return;                       // 调用点但不可前缀化（50/997/930/5010…）或原版未调
  const arr = PRE_POOLS[cls]!;
  let rolled = -1;
  for (let flag = true; flag; ) {
    flag = false;
    if (rolled === -1 && rng.int(0, 3) === 0) rolled = 0;          // cs:526 Next(4)
    if (rolled === -1) rolled = arr[rng.int(0, arr.length - 1)]!;  // cs:534 RollAPrefix
    if (PRE_REDUCED.has(rolled) && rng.int(0, 2) !== 0) rolled = 0; // cs:538 Next(3)
    if (prefixTryGetFails(rolled, item)) { flag = true; rolled = -1; } // cs:546 失败重掷
  }
}

interface LootCtx { rng: RNG; gs: GenState; gy: number; flags: ChestFlags; mainKey: string | null; worldH: number }

/**
 * AddBuriedChest 战利品主体(cs:36283-37360)1:1:按深度四分支。
 * mainVanillaId>0 → 主题主件(冰箱/沙箱/常春藤/水箱/地狱/金字塔等),
 * 否则按分支掷默认主件;各分支再按原版顺序逐项掷概率杂物表。
 */
export function rollChestLoot(ctx: LootCtx, mainVanillaId: number): Array<{ id: number; stack: number } | null> {
  const { rng, gs, gy, flags } = ctx;
  const bars = barIds(gs);
  const out: Array<{ id: number; stack: number }> = [];
  const push = (v: number, stack = 1) => {
    const id = vid(v);
    if (id >= 0 && out.length < 40) out.push({ id, stack });
  };
  const pick = (arr: number[]) => arr[rng.int(0, arr.length - 1)];

  // ---- 分支判定(cs:36283 flag23 / 36563 / 36789 / 37163)----
  // 地表分支 = 木箱(style0 flag)/天空箱(style12 flag6)且深度(ws+25) 之外，
  // ★flag11（cs:36221：tile21+style≠0+主件∈{848,857,934}）= 金字塔主件箱
  //   **无视深度恒走地表/金字塔分支**——曾只按深度判（深层金字塔箱误入金箱分支，
  //   掷骰序列整体偏移，金字塔出口隧道相位漂移，dump 对拍实锤）
  const isPyrMain = mainVanillaId === 848 || mainVanillaId === 857 || mainVanillaId === 934;
  const isSurface = isPyrMain || (gy < gs.worldSurface + 25 && !!(flags.wooden || flags.sky));
  const isGold = gy < gs.rockLevel;

  if (isSurface) {
    // ===== 地表木箱/天空箱(cs:36283-36468)=====
    if (mainVanillaId > 0) {
      push(mainVanillaId);
      prefixRolls(rng, mainVanillaId);   // cs:36287 SetDefaults+Prefix(-1)
      if (mainVanillaId === 832) push(933); // cs:36287-36291 世界树主件后插叶法杖
      if (mainVanillaId === 848) push(866); // cs:36283-36286 金字塔主件附赠法老袍
      if (flags.sky) {
        if (rng.int(0, 2) === 0) push(5629);
        if (rng.int(0, 5) === 0) push(rng.int(0, 1) === 0 ? 4429 : 4427);
        if (rng.int(0, 2) !== 0) push(5528);
      }
    } else {
      const m = pick([280, 281, 284, 285, 953, 946, 3068, 3069, 3084, 4341]);
      push(m);
      prefixRolls(rng, m);   // cs:36322-36415：十选一 SetDefaults+Prefix(-1)
    }
    if (rng.int(0, 5) === 0) push(282, rng.int(40, 75));   // 1/6 荧光棒
    if (rng.int(0, 5) === 0) push(279, rng.int(150, 300)); // 1/6 飞刀
    if (rng.int(0, 5) === 0) {                             // 1/6 草药袋(附赠叠层)
      let n = 1;
      if (rng.int(0, 4) === 0) n += rng.int(0, 1);
      if (rng.int(0, 9) === 0) n += rng.int(0, 2);
      push(3093, n);
    }
    if (rng.int(0, 5) === 0) {                             // 1/6 虫罐
      let n = 1;
      if (rng.int(0, 4) === 0) n += rng.int(0, 1);
      if (rng.int(0, 9) === 0) n += rng.int(0, 2);
      push(4345, n);
    }
    if (rng.int(0, 2) === 0) push(168, rng.int(3, 5));     // 1/3 手雷
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? bars.copper : bars.iron, rng.int(3, 10));
    if (rng.int(0, 1) === 0) push(965, rng.int(50, 100));  // 绳
    if (rng.int(0, 2) !== 0) push(rng.int(0, 1) === 0 ? 40 : 42, rng.int(25, 50)); // 木箭/手里剑
    if (rng.int(0, 1) === 0) push(28, rng.int(3, 5));      // 弱效治疗药水
    if (rng.int(0, 2) !== 0) push(2350, rng.int(3, 5));    // 回城药水
    if (rng.int(0, 2) > 0) push(pick([292, 298, 299, 290, 2322, 2325]), rng.int(1, 2));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 8 : 31, rng.int(10, 20));  // 火把/瓶子
    if (rng.int(0, 1) === 0) push(72, rng.int(10, 29));    // 银币
    if (rng.int(0, 1) === 0) push(9, rng.int(50, 99));     // 木材
  } else if (isGold) {
    // ===== 地下金箱(ws+25 ≤ gy < rockLevel,cs:36563-36789)=====
    // flag12 派生（cs:36227）：主件 159 气球/65 抓钩/158 瓶中云/2219 星磁铁 或 style13
    const flag12 = !!flags.skyTheme || mainVanillaId === 159 || mainVanillaId === 65
      || mainVanillaId === 158 || mainVanillaId === 2219;
    if (mainVanillaId > 0) {
      if (mainVanillaId === 832) push(933); // cs:36549-36553 主件前插叶法杖
      push(mainVanillaId);
      prefixRolls(rng, mainVanillaId);   // cs:36554 SetDefaults+Prefix(-1)
      if (flags.water) {
        if (rng.int(0, 1) === 0) push(4425);
        if (rng.int(0, 1) === 0) push(4460);
      }
      if (flag12 && rng.int(0, 39) === 0) { push(4978); prefixRolls(rng, 4978); } // cs:36568 1/40 幼翼（Prefix 调用点）
      // 蘑菇箱 flag7（cs:36689-36702）：1/2 蘑菇矿车；1/3 三件套
      if (flags.mushroom) {
        if (rng.int(0, 1) === 0) push(4450);
        if (rng.int(0, 2) === 0) { push(4779); push(4780); push(4781); }
      }
      // 地牢箱 flag9 门（cs:36597-36611，flag10 上锁箱不给钥匙）：
      // 首只暗影钥匙必给（无则 1/3）、Ram Rune 1/8
      if (flags.dungeon && !flags.lockedBiome) {
        if (!gs.generatedShadowKey || rng.int(0, 2) === 0) {
          gs.generatedShadowKey = true;
          push(329);
        }
        if (!gs.generatedRamRune || rng.int(0, 7) === 0) {
          gs.generatedRamRune = true;
          push(5465);
          prefixRolls(rng, 5465);
        }
      }
      // ★ivy(3360/3361/4426/5525) 附赠原版只在洞穴分支（cs:36864-36880）——
      // 金箱分支无 flag4 段（cs:36545-36703），曾误带致常春藤箱落金箱深度多整套附赠
    } else {
      const m = pick([49, 50, 53, 54, 5011, 975]);
      push(m);
      prefixRolls(rng, m);   // cs:36563+：金箱主件 SetDefaults+Prefix(-1)（50 魔镜 0 掷）
      if (rng.int(0, 19) === 0) push(997);                    // 1/20 提炼机
      else if (rng.int(0, 19) === 0) { push(930); push(931, rng.int(25, 50)); } // 1/20 信号枪+闪光弹
    }
    if (flags.desert) { if (rng.int(0, 2) === 0) push(4423, rng.int(10, 19)); }
    else if (rng.int(0, 2) === 0) push(166, rng.int(10, 19)); // 炸弹
    if (rng.int(0, 4) === 0) push(52);                        // 1/5 天使雕像
    if (rng.int(0, 2) === 0) push(965, rng.int(50, 100));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? bars.iron : bars.silver, rng.int(5, 14));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 40 : 42, rng.int(25, 49));
    if (rng.int(0, 1) === 0) push(28, rng.int(3, 5));
    if (rng.int(0, 2) > 0) push(pick([289, 298, 299, 290, 303, 291, 304, 2322, 2329]), rng.int(1, 2));
    if (rng.int(0, 2) !== 0) push(2350, rng.int(2, 4));
    if (rng.int(0, 1) === 0) push(flags.ice ? 974 : 8, rng.int(10, 20)); // 冰火把/火把 cs:36820 Next(11)+10=[10,20]（曾 10,19 漏 20）
    if (rng.int(0, 1) === 0) push(72, rng.int(50, 89));
  } else if (gy <= ctx.worldH - 250) {
    // ===== 洞穴箱(rockLevel ≤ gy ≤ h-250,cs:36789-37163)=====
    // ★门勘误：洞穴/地狱【战利品】分界是 h-250（cs:36839）；h-205 是【样式】门
    // （cs:36162 style4）。[h-250,h-205) 带 = 金箱样式 + 地狱战利品（原版如此）——
    // 曾误并一道门带出地狱战利品装洞穴箱
    if (mainVanillaId > 0) {
      push(mainVanillaId);
      prefixRolls(rng, mainVanillaId);   // cs:36841 SetDefaults+Prefix(-1)（★冰箱 ±7 根因）
      if (flags.ice && rng.int(0, 4) === 0) push(3199);       // 1/5 冰镜
      if (flags.desert) {
        if (rng.int(0, 6) === 0) push(4346);                  // 1/7 沙漠矿车
        if (rng.int(0, 14) === 0) push(4066);                 // 1/15 沙漠矿车(副)
      }
      if (flags.ivy) {
        if (!gs.gennedMahoganyWands || rng.int(0, 4) === 0) {
          gs.gennedMahoganyWands = true;
          push(3360); push(3361);
        }
        if (rng.int(0, 9) === 0) push(4426);
        if (rng.int(0, 9) === 0) push(5525);
      }
      if (flags.water) {
        if (rng.int(0, 1) === 0) push(4425);
        if (rng.int(0, 1) === 0) push(4460);
      }
      // 蘑菇箱 flag7（cs:37007-37021：1/2 矿车 否则三件套）
      if (flags.mushroom) {
        if (rng.int(0, 1) === 0) push(4450);
        else { push(4779); push(4780); push(4781); }
      }
      // 地牢箱 flag9 门（cs:36892-36906，flag10 上锁箱不给钥匙）
      if (flags.dungeon && !flags.lockedBiome) {
        if (!gs.generatedShadowKey || rng.int(0, 2) === 0) {
          gs.generatedShadowKey = true;
          push(329);
        }
        if (!gs.generatedRamRune || rng.int(0, 7) === 0) {
          gs.generatedRamRune = true;
          push(5465);
          prefixRolls(rng, 5465);
        }
      }
    } else {
      // 主件(cs:36911-36975)：num25=Next(7) 先掷恒消耗（种子对齐），再掷 906/997 门
      const num25 = rng.int(0, 6);
      if (rng.int(0, 19) === 0 && gy > gs.lavaLine) { push(906); prefixRolls(rng, 906); }
      else if (rng.int(0, 14) === 0) push(997);
      else {
        if (num25 === 6) { push(930); push(931, rng.int(25, 50)); }
        else { const m = [49, 50, 53, 54, 5011, 975][num25]!; push(m); prefixRolls(rng, m); }
      }
    }
    if (rng.int(0, 4) === 0) push(flags.ice ? 5120 : 43);     // 1/5(冰箱特殊项/可疑眼球)
    if (rng.int(0, 2) === 0) push(167);                       // 1/3 炸药
    if (rng.int(0, 3) === 0) push(51, rng.int(25, 50));       // 1/4 小丑箭
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? bars.gold : bars.silver, rng.int(3, 10));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 41 : 279, rng.int(25, 50)); // 烈焰箭/飞刀
    if (rng.int(0, 1) === 0) push(188, rng.int(3, 5));        // 治疗药水
    if (rng.int(0, 2) > 0) push(pick([296, 295, 299, 302, 303, 305]), rng.int(1, 2));
    if (rng.int(0, 2) > 1) push(pick([301, 297, 304, 2329, 2351, 2326]), rng.int(1, 2));
    if (rng.int(0, 1) === 0) push(2350, rng.int(2, 4));
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? (flags.ice ? 974 : 8) : 282, rng.int(15, 30)); // 火把/荧光棒
    if (rng.int(0, 1) === 0) push(73, rng.int(1, 2));         // 金币
  } else {
    // ===== 地狱箱(gy > h-205,cs:37163-37360;与 style 4 同门)=====
    if (mainVanillaId > 0) {
      push(mainVanillaId);
      prefixRolls(rng, mainVanillaId);   // cs:37167 SetDefaults+Prefix(-1)
      // cs:37173-37177：5010 宝藏磁铁命中也 Prefix(-1)（acc 可前缀化耗掷——
      //   x86 PFX 探针实证 #458 (1318,1003) 双 PFX；4443/4737/4551 无 Prefix）
      if (rng.int(0, 4) === 0) { push(5010); prefixRolls(rng, 5010); }
      if (rng.int(0, 9) === 0) push(4443);
      if (rng.int(0, 9) === 0) push(4737);
      if (rng.int(0, 9) === 0) push(4551);
    } else {
      // cs:37220-37242：四选一各配 Prefix(-1)（49/53/54 acc 耗掷；50 魔镜 0 掷）
      // ——★曾缺（尾批 2-C：(179,950) 实证 vanilla +2 掷 + 门级联 9）
      const m = [49, 50, 53, 54][rng.int(0, 3)];
      push(m);
      prefixRolls(rng, m);
    }
    if (rng.int(0, 2) === 0) push(167);                       // 1/3 炸药
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 117 : bars.gold, rng.int(15, 29)); // 陨铁锭/金锭
    if (rng.int(0, 1) === 0) {
      // 地狱火箭矢 或 银弹(银矿为钨时换钨弹 4915,cs:37242)
      const silverIsTungsten = (TILE_DEFS[gs.oreTiers.silver]?.key ?? '').includes('tungsten');
      push(rng.int(0, 1) === 0 ? 265 : (silverIsTungsten ? 4915 : 278), rng.int(50, 74));
    }
    if (rng.int(0, 1) === 0) push(227, rng.int(15, 20));      // 再生药水 cs:37290 Next(6)+15=[15,20]（曾 15,29）
    if (rng.int(0, 3) > 0) push(pick([296, 295, 293, 288, 294, 297, 304, 2323]), rng.int(1, 2));
    // ★cs:37334 门是 Next(3)>0（非洞穴分支的 >1——曾误抄 >1 致 2/3 概率漏整组掷，
    //   地狱尾 3-4 掷残余族：(1318,1003) vanilla ABX k=2094 vs JS 2091 实锤）
    if (rng.int(0, 2) > 0) push(pick([305, 301, 302, 288, 300, 2351, 2348, 2345]), rng.int(1, 2));
    { // cs:37370-37384：门 Next(3)==0 → stack27=Next(1,3) → Next(2) 选物（★门掷曾缺，
      //   尾批 2-C 补——地狱无主件箱 (1615,911) 实证 JS 欠 1 掷致流漂）
      if (rng.int(0, 2) === 0) {
        const stack27 = rng.int(1, 2);
        push(rng.int(0, 1) === 0 ? 2350 : 4870, stack27); // 回城/回归药水
      }
    }
    if (rng.int(0, 1) === 0) push(rng.int(0, 1) === 0 ? 8 : 282, rng.int(15, 29));    // 火把/荧光棒
    if (rng.int(0, 1) === 0) push(73, rng.int(2, 4));         // 金币
  }

  // ---- 尾段(theme 附加,cs:37361-37560;tile 21 箱)----
  const items: Array<{ id: number; stack: number } | null> = out.map((it) => ({ ...it }));
  // 主题尾件
  if (flags.ivy && rng.int(0, 3) === 0) {
    const id = vid(2204);
    if (id >= 0 && items.length < 40) items.push({ id, stack: 1 });
  }
  if (flags.ice && rng.int(0, 6) === 0) {
    const id = vid(2198);
    if (id >= 0 && items.length < 40) items.push({ id, stack: 1 });
  }
  // flag12 天空主题（cs:37424-37474）：1/3 天空磨坊；Next(6) 五选一装饰画；
  // 751 云 [50,100]（cs:37469）
  {
    const f12 = !!flags.skyTheme || mainVanillaId === 159 || mainVanillaId === 65
      || mainVanillaId === 158 || mainVanillaId === 2219;
    if (f12 && rng.int(0, 2) === 0) push(2197);
    if (flags.temple) push(2195); // flag13（cs:37428）：蜥蜴炉恒给
    if (flags.dungeon && rng.int(0, 7) === 0) push(2192); // flag9（cs:37432）1/8 血腥砍刀
    if (f12) {
      const n38 = rng.int(0, 5);
      push([5258, 5226, 5254, 5238, 5255, 5388][n38]); // cs:37440-37468
      push(751, rng.int(50, 100));
    }
    // 上锁生物群系箱 1/2 → 5234 虔诚残片（cs:37494-37498）
    if (flags.lockedBiome && rng.int(0, 1) === 0) push(5234);
    if (flags.temple) { // flag13 尾（cs:37479-37491）：1/5 日耀碑 否则碎片 [3,7]
      if (rng.int(0, 4) === 0) push(2767);
      else push(2766, rng.int(3, 7));
    }
    // voice 门（cs:37557）：恒掷 Next(12)；命中 1/12 时 AddVoiceChangeItemToChest
    // 内 Item.GetRandomVoiceItem 还要掷 Next(14)——曾漏（命中即短一掷，流漂移）
    if (rng.int(0, 11) === 0) rng.int(0, 13);
  }
  // 键主件(如金字塔/蛛网/世界树的特殊掉落直接给 key)置首。
  // 同一原版物品可能有两个注册键:调用方显式键(如 vi_832_living_wood_wand)与
  // vid() 的规范驼峰键(items.ts 自动注册循环 vi_832_LivingWoodWand)。mainKey 与
  // mainVanillaId 同源(placeBuriedChest 由键反解)时,先剔除 push(mainVanillaId)
  // 经 vid() 入箱的那份,再按调用方指定键入箱——否则世界树宝箱会出现两根活木魔棒。
  if (ctx.mainKey) {
    const keyId = ITEM_BY_KEY[ctx.mainKey];
    if (keyId !== undefined) {
      if (vanillaIdOfKey(ctx.mainKey) !== null && vanillaIdOfKey(ctx.mainKey) === mainVanillaId) {
        const viaVid = vid(mainVanillaId);
        const idx = items.findIndex((it) => it && it.id === viaVid);
        if (idx >= 0) items.splice(idx, 1);
      }
      if (!items.some((it) => it && it.id === keyId)) items.unshift({ id: keyId, stack: 1 });
    }
  }
  return items;
}

/** AddBuriedChest（1456 cs:35920）下落/门禁段 1:1：
 *  自 j 向下扫至 k < maxTilesY-10，逐行检查 anyShimmer / 幼虫 231 → 整体失败；
 *  首个 SolidTile（半砖/坡面不算，WorldGen.SolidTile）落定。
 *  ±2 邻域（InWorld 100 边距）有 Boulders{138,484,664,665,711-716}/祭坛 26/蜥蜴祭坛 237 → 失败
 *  ——该检查在扫描循环内**逐行**执行（锚=当前行 k，cs:35992-36002），非仅起始行。
 *  notNearOtherChests:true 时经 Chest.NearOtherChests（±25×±8 已有箱）拒绝（cs:36253 透传）。
 *  样式/战利品解析与 2×2 放置沿用本仓库 rollChestLoot 管线。 */
export function placeBuriedChest(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  i: number, j: number, opts: { style?: number; tile?: number; loot?: number | string; flags?: ChestFlags; trySlope?: boolean; notNearOtherChests?: boolean } = {},
): boolean {
  // 探针（AB/ABX 对拍 vanilla ChestProbe；无钩零开销）
  const __ab = (globalThis as { __swChestEv?: (p: string, i: number, j: number, x?: number) => void }).__swChestEv;
  const __n0 = (globalThis as { __swRollN?: number }).__swRollN ?? -1;
  __ab?.('ab', i, j, __n0);
  try {
    const r = placeBuriedChestInner(st, rng, gs, chests, i, j, opts);
    __ab?.('abx', i, j, r ? 1 : 0);
    return r;
  } catch (e) {
    __ab?.('abx', i, j, -1);
    throw e;
  }
}

function placeBuriedChestInner(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink,
  i: number, j: number, opts: { style?: number; tile?: number; loot?: number | string; flags?: ChestFlags; trySlope?: boolean; notNearOtherChests?: boolean } = {},
): boolean {
  // 下落到地面（cs:35931 `for k=j; k<maxTilesY-10; k++`）
  let gy = j;
  let slopeL = -1, slopeR = -1;   // trySlope 压平的坡度（失败时回填，cs:37567-37575）
  for (; gy < st.h - 10; gy++) {
    const k = st.idx(i, gy);
    if (st.liquid[k] > 0 && st.liquidType[k] === 4) return false;              // anyShimmer → 整体失败
    if (st.flags[k] && st.type[k] === LARVA) return false;                      // 幼虫 231 → 整体失败
    // ★±2 巨石/祭坛拒绝在扫描循环内**逐行**执行（cs:35992-36002，锚=当前行 k：
    //   InWorld(n,num6,100) && Boulders{138,484,664,665,711-716} || 26 || 237）。
    //   曾在进循环前以起始行 j 只查一次——起始行下方 2 格内的滚石/祭坛全部漏检
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const xx = i + dx, yy = gy + dy;
        if (xx < 100 || yy < 100 || xx >= st.w - 100 || yy >= st.h - 100) continue;
        const kk = st.idx(xx, yy);
        if (!st.flags[kk]) continue;
        const tt = st.type[kk];
        if (BOULDER_TILES.has(tt) || tt === ALTAR || tt === TALTAR) return false;
      }
    }
    if (solidTileHB(st, i, gy)) {
      // trySlope 门（cs:35951-35968）：style 17 时 ±30 盒内不得有箱/越界；
      // 压平 (i-1,gy)/(i,gy) 的顶坡供放置（失败时回填）
      if (opts.trySlope && opts.style === 17) {
        for (let l = i - 30; l <= i + 30; l++) {
          for (let m = gy - 30; m <= gy + 30; m++) {
            if (l < 5 || m < 5 || l >= st.w - 5 || m >= st.h - 5) return false;  // InWorld(l,m,5)
            const nk = st.idx(l, m);
            if (st.flags[nk] && (st.type[nk] === CHEST || st.type[nk] === CHEST2)) return false;
          }
        }
      }
      if (opts.trySlope) {
        if (st.slope[st.idx(i - 1, gy)] >= 1 && st.slope[st.idx(i - 1, gy)] <= 2) {
          slopeL = st.slope[st.idx(i - 1, gy)];
          st.slope[st.idx(i - 1, gy)] = 0;
        }
        if (st.slope[k] >= 1 && st.slope[k] <= 2) {
          slopeR = st.slope[k];
          st.slope[k] = 0;
        }
      }
      break;
    }
  }
  if (gy >= st.h - 10) return false;
  if (!solidTileHB(st, i, gy)) return false;
  // trySlope 失败回填（cs:37567-37575：仅压平过的格才恢复）
  const restoreSlopes = (): void => {
    if (slopeL > -1) st.slope[st.idx(i - 1, gy)] = slopeL;
    if (slopeR > -1) st.slope[st.idx(i, gy)] = slopeR;
  };

  let tile = opts.tile ?? CHEST;
  let style = opts.style;
  const flags: ChestFlags = { ...(opts.flags ?? {}) };
  let mainId = 0;
  let mainKey: string | null = null;
  if (typeof opts.loot === 'string') {
    mainKey = opts.loot;
    mainId = vanillaIdOfKey(opts.loot) ?? 0;
    if (mainId === 0 && ITEM_BY_KEY[opts.loot] === undefined) mainKey = null; // 无效键丢弃
  } else if (opts.loot !== undefined) {
    mainId = opts.loot;
  }
  if (style === undefined) {
    if (gy > st.h - 205) {
      // 地狱箱:style 4 + 地狱武器序(cs:36158-36171)。★同门置 flag13（cs:36167 反编译
      //   命名——消费点 = 尾段 2195 蜥蜴炉恒给 + 日耀碑 1/5 门，cs:37428/37479）
      style = 4;
      flags.hell = true;
      if (!mainId) mainId = nextHellItem(gs);
    } else {
      style = gy >= gs.worldSurface + 25 ? 1 : 0;
      if (style === 0) flags.wooden = true;
    }
  }
  // ---- 冰箱门（cs:36107-36130 1:1）：三析取——(tile21&&style11) ||
  // (tile467&&style24) || (无主件 && 位置 && 脚下冰系)。★原版显式传 style 11
  // 也进本池（HouseBuilder 冰屋正是此路径）——旧实现 style===undefined 单门漏此
  const tBelow = st.type[st.idx(i, gy)];
  if ((tile === CHEST && style === 11) || (tile === CHEST2 && style === 24)
    || (!mainId && gy >= gs.worldSurface + 25 && gy <= st.h - 205
      && (tBelow === SNOW || tBelow === ICE || tBelow === THIN_ICE))) {
    flags.ice = true;
    if (!mainId) {
      mainId = [670, 724, 950, 1319, 987, 1579][rng.int(0, 5)]; // cs:36121-36125
      if (rng.int(0, 19) === 0) mainId = 997; // 1/20 提炼机
      if (rng.int(0, 49) === 0) mainId = 669; // 1/50 鱼
    }
  }
  // ---- 沙漠箱门（cs:36066-36091 1:1）：三析取——(tile467&&style10) ||
  // (tile21&&style42&&flag16) || (无主件 && ≤h-205 && IsUndergroundDesert)。
  //  ★IsUndergroundDesert（cs:35798-35824）= y≥worldSurface && x∈[0.15W,0.85W] &&
  //   **±15 邻域扫描 wall∈{187,216}**——曾用 gs.undergroundDesert 矩形近似：
  //   沙漠边缘（墙带内外 ±15）矩形判定与扫描判定不同 → 漏掷沙漠主件骰
  //   （vanilla (2783,605) 实证：邻墙 187 → 掷 1 骰后 PlaceChest 拒 =1 耗掷，
  //   旧 JS 矩形外 0 耗掷——流分叉，2026-08-17 箱族批）。
  const inUd = !mainId && gy >= gs.worldSurface && i > st.w * 0.15 && i < st.w * 0.85
    && (() => {
      if (gy > st.h - 205) return false;
      const num = 15;
      for (let x = i - num; x <= i + num; x++) {
        for (let y = gy - num; y <= gy + num; y++) {
          if (!st.inBounds(x, y)) continue;
          const wl = st.wall[st.idx(x, y)];
          if (wl === 187 || wl === 216) return true;
        }
      }
      return false;
    })();
  if ((tile === CHEST2 && style === 10) || inUd) {
    tile = CHEST2;
    style = 10;
    flags.desert = true;
    // cs:36084：分位点用蜂巢**实际雕刻范围**（desertHiveHigh/Low，PlaceClustersArea
    // 逐点收缩），非静态矩形 ±10（曾用 ud.y0/y1 → 分层界偏移）
    const deep = gy > (gs.desertHiveHigh * 3 + gs.desertHiveLow * 4) / 7;
    if (!mainId) {
      mainId = deep
        ? [4061, 4062, 4276][rng.int(0, 2)]
        : [4056, 4055, 4262, 4263][rng.int(0, 3)];
    }
  }

  // ---- 位置地牢门（cs:36211-36213）：tile21 && style≠0 && IsDungeon(i,gy)
  //   （cs:35798 同款：y≥worldSurface && wallDungeon[wall(落定格)]）→ flag9 地牢战利品
  //   （首暗影钥匙/Ram Rune+Prefix/尾段 1/8 血腥砍刀）。曾漏：坠入地牢的洞穴箱
  //   (2930,830) vanilla 多掷 2（Ram Rune Prefix Next(4)+池选）→ 流分叉（尾批 2-C）
  if (tile === CHEST && style !== 0 && gy >= gs.worldSurface && isDungeonWall(st.wall[st.idx(i, gy)])) {
    flags.dungeon = true;
  }

  // ---- notNearOtherChests 通道（cs:36253 透传 → PlaceChest cs:57838-57840）：
  // 原版 `notNearOtherChests && Chest.NearOtherChests(x-1, y-1)` → 拒。PlaceChest 收到
  // (i-1, num7-1)（num7=落定行 gy），故 NearOtherChests 实扫锚 = (i-2, gy-2)。
  // 本仓消费点：蜘蛛巢/神庙宝箱应传 true（HiveSpiderPass/TemplePass 两处调用点
  // 由并行代理接线，此处先开通道；缺省 false = 与原版 notNearOtherChests:false 同义）
  if (opts.notNearOtherChests && nearOtherChests(st, i - 2, gy - 2)) { restoreSlopes(); return false; }

  // 2×2 放置（PlaceChest → TileObject.CanPlace 全链，cs:57828/:174-857；★2026-08-17
  // 箱族批移植 U 批引擎）：AddBuriedChest 调 PlaceChest(i-1, num7-1)，chest
  // TileObjectData Origin=(0,1)、Width=2 → 箱体落 **(i-1..i)×(gy-2..gy-1)**、
  // 锚腿 (i-1)/i 行 gy。四道门：①PlaceChest 双腿巨石（读 type 不读 act）
  // ②边界 5 垫 ③内盒可覆盖（空 或 tileCut∖{484,654}∪BreakableWhenPlacing——
  // 原版落箱可切掉蛛网 51/洞穴饰 165 等；旧"2×2 全空"过严，首例 (2759,567)
  // vanilla AB 探针 ret=1 vs JS 拒——#58 窗 14.7k 自因主根因）④双腿锚定
  // （SolidTile|平台|solidTop|桌，chestLegOK）。
  const topY = gy - 2;
  if (topY < 1) { restoreSlopes(); return false; }
  {
    const sheetOf = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
    const legL = sheetOf(st.type[st.idx(i - 1, gy)]);
    const legR = sheetOf(st.type[st.idx(i, gy)]);
    let ok = !(PC_BOULDERS.has(legL) || PC_BOULDERS.has(legR));
    if (ok) ok = i - 1 >= 5 && i + 1 <= st.w - 5 && topY >= 5 && topY + 2 <= st.h - 5;
    for (let dx = -1; ok && dx <= 0; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const x = i + dx, y = topY + dy;
        if (!st.inBounds(x, y)) { ok = false; break; }
        const k = st.idx(x, y);
        // ⑤液体放置门（TileObject.cs:342 flag3=！LiquidPlace；chest 默认
        //   WaterPlacement=Allowed/LavaPlacement=NotAllowed，TileObjectData.cs:1767）：
        //   箱体格液体=岩浆 → 拒（尾批 2-C：(3283,903) 岩浆 255 vanilla 拒/JS 放实锤）
        if (st.liquid[k] > 0 && st.liquidType[k] === 2) { ok = false; break; }
        if (!st.flags[k]) continue;                       // 空 → 可放
        const sh = sheetOf(st.type[k]);
        if (!((PC_TILE_CUT.has(sh) && sh !== 484 && sh !== 654) || PC_BREAK_PLACE.has(sh))) { ok = false; break; }
      }
    }
    if (ok && !(chestLegOK(st, i - 1, gy) && chestLegOK(st, i, gy))) ok = false;
    if (!ok) {
      const __dbg = (globalThis as { __swChestDbg?: (i: number, gy: number, why: string) => void }).__swChestDbg;
      if (__dbg) {
        const sheetOf2 = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
        let why = '?';
        const legL2 = sheetOf2(st.type[st.idx(i - 1, gy)]), legR2 = sheetOf2(st.type[st.idx(i, gy)]);
        if (PC_BOULDERS.has(legL2) || PC_BOULDERS.has(legR2)) why = `boulder ${legL2}/${legR2}`;
        else if (!(i - 1 >= 5 && i + 1 <= st.w - 5 && topY >= 5 && topY + 2 <= st.h - 5)) why = 'bounds';
        else if (!chestLegOK(st, i - 1, gy)) why = `legL(${i - 1},${gy}) sheet${legL2} act${st.flags[st.idx(i - 1, gy)] ? 1 : 0}`;
        else if (!chestLegOK(st, i, gy)) why = `legR(${i},${gy}) sheet${legR2} act${st.flags[st.idx(i, gy)] ? 1 : 0}`;
        else for (let dx = -1; dx <= 0; dx++) for (let dy = 0; dy < 2; dy++) {
          const k = st.idx(i + dx, topY + dy);
          if (st.liquid[k] > 0 && st.liquidType[k] === 2) { why = `lava(${i + dx},${topY + dy})`; }
          else if (st.flags[k]) {
            const sh = sheetOf2(st.type[k]);
            if (!((PC_TILE_CUT.has(sh) && sh !== 484 && sh !== 654) || PC_BREAK_PLACE.has(sh))) why = `occ(${i + dx},${topY + dy}) t${st.type[k]} sheet${sh}`;
          }
          if (why !== '?') break;
        }
        __dbg(i, gy, why);
      }
      restoreSlopes(); return false;
    }
  }
  // 样式派生 flag 族（cs:36201-36229）：32 蘑菇 / 16 神庙 / 13 天空主题
  if (style === 32) flags.mushroom = true;
  if (style === 16) flags.temple = true;
  if (style === 13) flags.skyTheme = true;
  const fw = TILE_DEFS[tile].vanilla?.fw ?? 2;
  for (let dx = -1; dx <= 0; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(i + dx, topY + dy, tile, style * fw * 18 + (dx + 1) * 18, dy * 18);
    }
  }
  // 战利品:四深度分支完整表(此前仅主件+火把/药水,体感稀缺主因之一)
  const items = rollChestLoot({ rng, gs, gy, flags, mainKey, worldH: st.h }, mainId);
  chests.push({ x: i - 1, y: topY, items });   // Chest.CreateChest(xCoord,yCoord)=(i-1,gy-2)
  if (flags.hell) gs.hellChestIdx++; // cs:36257-36264 放置成功才前进（失败重试取同一件）
  return true;
}

/** Buried Chests pass:L7907 洞穴段(CaveChestCount 35-40 × WorldArea/5040000)。
 *  ★地狱段拆出 runUnderworldChestsPass:本函数曾在 hellPass 之前执行,
 *  地狱箱被后续地狱地形重写 100% 抹除(实际 0 个) */
export function runBuriedChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w, h } = st;
  const yMin = Math.floor((gs.worldSurfaceHigh + 20 + gs.rockLevel) / 2);
  // 洞穴箱:35-40 × 面积缩放(Configuration.json CaveChestCount ScaleWith:WorldArea)。
  // ★WorldGenRange.GetRandom(WorldGenRange.cs:34-57):先缩放边界再 (int) 截断 →
  //   Next((int)(35s), (int)(40s)+1)。曾"先掷后乘+Math.round"(C10 同款旧公式)
  const target = gs.caveChestCount >= 0 ? gs.caveChestCount
    : rng.int(Math.trunc(35 * (w * h) / 5040000), Math.trunc(40 * (w * h) / 5040000));
  let fail = 10000;
  // cs:17112-17124 拒绝门：wallDungeon[wall] || wall==87 || oceanDepths(x,y)
  //   （oceanDepths = y ≤ oceanLevel(=(ws+rl)/2+40) 且 x<380 || x>w-380——尾批 2-C 补；
  //   曾漏致海带尝试多掷 1 次 AB，流分叉 @AB#69 (3826,490) 实证）
  const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  for (let n = 0; n < target && fail > 0; ) {
    const x = rng.int(20, w - 21);
    const y = rng.int(yMin, h - 231);
    const wl = st.inBounds(x, y) ? st.wall[st.idx(x, y)] : -1;
    // cs:17109：wallDungeon[wall] || wall == 87（神庙墙 87 独立门）→ 整体重掷
    if (isDungeonWall(wl) || wl === 87 || (y <= oceanLevel && (x < gs.beachDistance || x > w - gs.beachDistance))
      || !placeBuriedChest(st, rng, gs, chests, x, y)) {
      fail--; continue;
    }
    n++;
  }
}

/** 地狱箱(UnderworldChestCount 10-15 × WorldWidth/4200)。
 *  必须在 hellPass + 地狱屋之后调用(原版 Underworld(cs:13697) < Buried Chests(cs:17066)) */
export function runUnderworldChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w, h } = st;
  // gs 预掷优先(cs:17082 流位);回退公式同步 WorldGenRange 化(先缩放后截,
  // 曾 Math.round(rng.int(10,15)*(w/4200)) 旧式)
  const target = gs.underworldChestCount >= 0 ? gs.underworldChestCount
    : rng.int(Math.trunc(10 * (w / 4200)), Math.trunc(15 * (w / 4200)));
  let fail = 10000;
  for (let n = 0; n < target && fail > 0; ) {
    const x = rng.int(20, w - 21);
    const y = rng.int(h - 200, h - 51);
    // cs:17134-17140：wallDungeon[wall] → 整体重掷（无 wall==87/oceanDepths 门）
    const wl = st.inBounds(x, y) ? st.wall[st.idx(x, y)] : -1;
    if (isDungeonWall(wl) || !placeBuriedChest(st, rng, gs, chests, x, y)) {
      fail--; continue;
    }
    n++;
  }
}

/** Surface Chests pass(L8019):w*0.005 个地表木箱(style 0;墙 244 → 天空箱 style 12) */
export function runSurfaceChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w } = st;
  const count = Math.floor(w * 0.005);
  for (let n = 0; n < count; n++) {
    let ok = false;
    for (let tries = 0; tries < 2000 && !ok; tries++) {
      // cs:17244 首掷 Next(200, w-200);仅落点命中 oceanDepths(cs:17246-17254:
      // y ≤ oceanLevel=(ws+rl)/2+40 且 x 在海滩带内)才改掷 Next(300, w-300)——
      // 原版 WorldGen.beachDistance 是常量 380(cs:4102)
      let x = rng.int(200, w - 201);
      let y = rng.int(Math.floor(gs.worldSurfaceLow), Math.floor(gs.worldSurface) - 1);
      const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
      while (y <= oceanLevel && (x < gs.beachDistance || x > w - gs.beachDistance)) {
        x = rng.int(300, w - 301);
        y = rng.int(Math.floor(gs.worldSurfaceLow), Math.floor(gs.worldSurface) - 1);
      }
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      // cs:17260-17284 两分支：空格走墙门（2/59/244，墙 244 → 天空箱）；
      // 落点活性格走 101×101（步 2）蓄水池采样找墙 244 空格（Next(num8) 命中即换点）
      let sky = false;
      let cx = x, cy = y;
      if (!st.flags[i]) {
        if (st.wall[i] === 2 || st.wall[i] === 59 || st.wall[i] === 244) {
          if (st.wall[i] === 244) sky = true;
        } else {
          continue;   // flag3=false → 本轮作废
        }
      } else {
        // ★GG 批尾案②根因：原版扫描界用**固定锚** num6/num7（cs:17274 = 初掷 x/y），
        //   命中点写进独立的 num3/num4——曾直接用 cx/cy 兼任界与选中点，命中后界随
        //   选中点漂移（越扫越远+候选序错乱：初掷 (409,252) 选中 (547,328) 越出
        //   [359,459] 框，AB#2 k=314 vs vanilla k=175 实锤 → 位置半数差+8.2k 欠掷）
        let num8 = 1;
        let hit = false;
        for (let j = x - 50; j <= x + 50; j += 2) {
          for (let k = y - 50; k <= y + 50; k += 2) {
            if (k >= gs.worldSurface) continue;
            if (!st.inBounds(j, k) || st.flags[st.idx(j, k)]) continue;
            if (st.wall[st.idx(j, k)] !== 244) continue;
            if (rng.int(0, num8 - 1) !== 0) continue;                    // Next(num8)==0
            sky = true;
            num8++;
            hit = true;
            cx = j; cy = k;
          }
        }
        if (!hit) continue;   // 蓄水池无墙 244 空格 → 本轮作废
      }
      const flags: ChestFlags = sky ? { sky: true } : { wooden: true };
      // cs:17282：notNearOtherChests:true（NearOtherChests 拒绝 → 重试多掷——#60 欠掷
      //   15.9k 主因之一，2026-08-17 尾批 2-C 补传）；style 原版传 flag2?12:-1，
      //   -1 走落点解析（地表恒 y<worldSurface → style 0）与显式 0 等价
      if (placeBuriedChest(st, rng, gs, chests, cx, cy, { style: sky ? 12 : 0, flags, notNearOtherChests: true })) ok = true;
    }
  }
}

/** UnderwaterChests 的 9×w/4200 段（cs:17381-17453）：每下标两趟 while 各 1 箱——
 *  ① y∈[1, UnderworldLayer)（内层液体重掷域 [50, UnderworldLayer)）
 *  ② y∈[worldSurface, UnderworldLayer)。主件序：单次 Next(10)==0 → 863，
 *  否则计数器 186→4404→277→187（num4 每迭代无条件 ++，命中 863 也前进）。 */
export function runWaterChestsPass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  const { w } = st;
  const num5 = w / 4200;
  const count = 9 * num5;
  let num4 = 0;
  for (let n = 0; n < count; n++) {
    num4++;
    let main: number;
    if (rng.int(0, 9) === 0) {                                          // Next(10)
      main = 863;
    } else {
      switch (num4) {
        case 1: main = 186; break;
        case 2: main = 4404; break;
        case 3: main = 277; break;
        default: main = 187; num4 = 0; break;
      }
    }
    // 第一趟（cs:17424-17431）：y 首掷 [1, h-200)，重掷 [50, h-200)
    for (let loop = 0; loop < 2; loop++) {
      const yLo = loop === 0 ? 1 : Math.floor(gs.worldSurface);
      let ok = false;
      for (let tries = 0; tries < 10000 && !ok; tries++) {
        let x = rng.int(50, w - 51);                                    // Next(50, w-50)
        let y = rng.int(yLo, st.h - 201);                               // Next(?, h-200)
        // cs:17425-17428：液体不足或非水 → 重掷（重掷 y 域换 [50, h-200)）。
        // liquidType 修 2026-08-12：本仓库 +1 编码(水=LIQUID_TYPE.WATER=1)——照抄原版
        // !==0(原版 Water=0) 会让水格恒不命中,拒绝采样死循环(世界生成卡"生物群系"根因)。
        // 守卫:100 万掷未命中 → 大声报错降级继续(防同类移植错位再变静默死循环)
        let __guard = 0;
        while (st.liquid[st.idx(x, y)] < 250 || st.liquidType[st.idx(x, y)] !== LIQUID_TYPE.WATER) {
          x = rng.int(50, w - 51);
          y = rng.int(50, st.h - 201);
          if (++__guard >= 1_000_000) {
            console.error('[worldgen] runWaterChestsPass 拒绝采样 100 万掷未命中水中格——疑似 liquidType/liquid 编码错位或本世界无合格水体,降级跳过本箱');
            break;
          }
        }
        if (__guard >= 1_000_000) continue;
        // cs:17427：trySlope 门 = 落点在海滩带内（x < 380 || x > w-380）
        if (placeBuriedChest(st, rng, gs, chests, x, y, {
          style: 17, loot: main, flags: { water: true },
          trySlope: x < gs.beachDistance || x > w - gs.beachDistance,
        })) ok = true;
      }
    }
  }
}
