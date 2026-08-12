// 原版 1.4.5.6 NPC.Spawner 内嵌类 1:1 移植（Terarria1456/Terraria/NPC.cs:39-5952）。
// ★简化纪律:任何"未移植/近似/恒X"必须在 docs/spawn-parity-gaps.md 登记(含原版行号+
// 可见影响+依赖),否则视为未完成。先例:spawnFriendly 曾标"恒放行"导致兔鼠刷浮空岛。
// 结构：SetSpawnFlags(L276) → GetSpawnRate(L383-640) → FindSpawnTile(L879) →
//       SetSpawnFlagsForChosenTile(L950) → SpawnAnNPC(L1186-5144 巨型 if-else 链)。
// 权重语义：Main.rand.Next(N)==0（1/N 命中）；越靠前优先级越高。
// 困难模式分支保留并挂在 world.flags.hardMode（当前默认 false → 只走肉前）。
// 净 ID（负数）= SetDefaultsFromNetId(L7633)：基底类型 × scale + 属性/颜色覆盖。
// 原版 spawnTileType = NPC 落脚处上方格（GetProperGroundSpawnTileTypeAndWallType L5789）；
// 我们的等价 = 落脚格下方第一个实心格的 tile type。
import { TILE } from '../../core/constants';
import { RNG } from '../../core/rng';
import type { World } from '../World';
import { TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import { Enemy } from '../../entities/Enemy';
import { debugPoolOverride } from '../../data/vanillaNpcs';
import { MOON_KIND_FROST, MOON_KIND_PUMPKIN } from '../MoonEvent';
import { TileStore } from '../TileStore';

/** 星璇塔刷怪上下文（Game 每帧随 setPlayerFlags 传入；null=事件未开启/不在任何塔区） */
export interface LunarSpawnCtx {
  /** 玩家 4000px 内各塔是否在场（SceneMetrics.CloseEnoughTo*Tower = WithinRangeOfNPC(塔id, 4000)，
   *  SceneMetrics.cs:276-282 / NPCEventZoneRadius=4000） */
  zone: { solar: boolean; vortex: boolean; nebula: boolean; stardust: boolean };
  /** 场上存活 NPC 计数（选表 CountNPCS 用；与月事件共用 Game 统计的 counts 表） */
  counts: ReadonlyMap<number, number>;
}

/** 月事件刷怪上下文（Game 每帧随 setPlayerFlags 传入） */
export interface MoonEventSpawnCtx {
  /** 1=霜月 2=南瓜月（MoonEventState.kind） */
  kind: number;
  /** 当前波（MoonEventState.waveNumber） */
  wave: number;
  /** 场上存活 NPC 计数（id → 数量；选表 CountNPCS 用） */
  counts: ReadonlyMap<number, number>;
  /** Boss 族 npcSlots 总和（reachedInvasionBossCap 判定用，NPC.cs:159-183） */
  bossSlotSum: number;
}

/** Boss 族（npcSlots 计入 reachedInvasionBossCap 的集合，NPC.cs:166-180） */
const MOON_BOSS_IDS = new Set([315, 325, 327, 328, 344, 345, 346]);
export { MOON_BOSS_IDS };
/** 单人 maxSpawns 上限 = ⌊5×(2+0.3×1)⌋ = 11（NPC.cs:174 num2） */
const MOON_BOSS_CAP_SLOTS = Math.floor(5 * (2 + 0.3 * 1));

// ---- 原版 tile type 常量（TileID），我们通过 TILE_BY_KEY 反查内部 id ----
const T = (() => {
  const get = (k: string) => TILE_BY_KEY[k] ?? 0;
  return {
    DIRT: get('dirt'), GRASS: get('grass'), STONE: get('stone'),
    SAND: get('sand'), SNOW: get('snow'), ICE: get('ice'), MUD: get('mud'),
    JUNGLE_GRASS: get('v_60_jungle_grass_block'), CORRUPT_GRASS: get('v_23_corrupt_grass_block'),
    CRIMSON_GRASS: get('v_199_crimson_grass_block'), MUSHROOM_GRASS: get('v_70_mushroom_grass_block'),
    EBONSAND: get('v_112_ebonsand_block'), CRIMSAND: get('v_234_crimsand_block'),
    PEARLSAND: get('v_116_pearlsand_block'), HARDENED_SAND: get('hardened_sand'),
    SANDSTONE: get('sandstone'), FOSSIL: get('desert_fossil'),
    MARBLE: get('v_367_marble_block'), GRANITE: get('v_368_granite_block'),
    // 23 陨石（tiles.ts key 为 ore_meteorite，非 v_23_*）
    METEORITE: get('ore_meteorite'),
    CACTUS: get('v_80_cactus'), SNOW_BRICK: get('snow_brick'), CATTAIL: get('v_519_cattails'),
    CORRUPT_ICE: get('v_163_purple_ice_block'), CRIMSON_ICE: get('v_200_red_ice_block'),
    // 164 粉冰(=神圣冰)：key 实为 v_164_pink_ice_block（旧注"未注册→0"有误，已注册）
    HOLLOW_ICE: get('v_164_pink_ice_block'), DUNGEON_BLUE: get('v_41_blue_brick'),
    DUNGEON_GREEN: get('v_43_green_brick'), DUNGEON_PINK: get('v_44_pink_brick'),
    // 恶土系计数(SceneMetrics.cs:614-615 非 remix 的 _tileCounts 公式)
    EBONSTONE: get('v_25_ebonstone_block'), CORRUPT_PLANT: get('v_24_corruption_short_plants'),
    CORRUPT_THORN: get('v_32_corruption_thorns'), CORRUPT_HARDSAND: get('v_398_corrupt_hardened_sand_block'),
    CRIMSTONE: get('v_203_crimstone_block'), CRIMSON_PLANT: get('v_201_crimson_short_plants'),
    CRIMSAND_THORN: get('v_352_crimtane_thorns'), CRIMSON_HARDSAND: get('v_399_crimson_hardened_sand_block'),
    SUNFLOWER: get('v_27_sunflower'),
    // 墓碑 85（SceneMetrics.cs:622 GraveyardTileCount）：Tombstones 单 tile 覆盖全部
    // 6 种墓碑（GraveMarker/Cross/Headstone/Gravestone/Obelisk/Golden 均为 style 变体）
    TOMBSTONE: get('tombstone_v'),
    // 神圣族计数(SceneMetrics.cs:603)：109 神圣草/492 神圣修剪草/110 神圣矮草/
    // 113 神圣高草/117 珍珠岩/402 神圣硬化沙/403 神圣沙岩（116 珍珠沙/164 粉冰见上）
    HALLOW_GRASS: get('v_109_hallowed_grass_block'), HALLOW_MOWED_GRASS: get('v_492_hallowed_mowed_grass_block'),
    HALLOW_PLANT: get('v_110_hallow_short_plants'), HALLOW_TALL_PLANT: get('v_113_hallow_tall_plants'),
    PEARLSTONE_BLOCK: get('v_117_pearlstone_block'), HALLOW_HARDSAND: get('v_402_hallow_hardened_sand_block'),
    HALLOW_SANDSTONE: get('v_403_hallow_sandstone_block'),
    // 雪族计数(SceneMetrics.cs:604)：162 薄冰（147/148/161/163/200/164 见上/常量区）
    THIN_ICE: get('thin_ice'),
    // 丛林族计数(SceneMetrics.cs:613)：61 矮草/62 藤/74 高草/225 蜂巢块/226 神庙砖
    JUNGLE_PLANT: get('v_61_jungle_short_plants'), JUNGLE_VINE: get('v_62_jungle_vines'),
    JUNGLE_TALL_PLANT: get('v_74_jungle_tall_plants'), HIVE: get('v_225_hive_block'),
    LIHZAHRD_BRICK: get('v_226_lihzahrd_brick'),
    // 蘑菇族计数(SceneMetrics.cs:617)：71 植株/72 蘑菇树/528 藤（70 蘑菇草见上）
    MUSHROOM_PLANT: get('v_71_mushroom_plant'), MUSHROOM_TREE: get('v_72_mushroom_tree'),
    MUSHROOM_VINE: get('v_528_mushroom_vines'),
    // 190 发光蘑菇块（NPC.cs:5010/5109 glowshroom 出怪门 tile 70||190 之一）
    MUSHROOM_BLOCK: get('v_190_glowing_mushroom_block'),
    // Moss 族（TileID.Sets.Conversion.Moss，TileID.cs:38）：CheckToSpawnRockGolem 落脚门
    // 179 绿/180 黄/181 红/182 蓝/183 紫/381 熔岩/534 氪/536 氙/539 氩/625 氖/627 氦
    MOSS_GREEN: get('v_179_green_moss_block'), MOSS_YELLOW: get('v_180_yellow_moss_block'),
    MOSS_RED: get('v_181_red_moss_block'), MOSS_BLUE: get('v_182_blue_moss_block'),
    MOSS_PURPLE: get('v_183_purple_moss_block'), MOSS_LAVA: get('v_381_lava_moss'),
    MOSS_KRYPTON: get('v_534_krypton_moss_block'), MOSS_XENON: get('v_536_xenon_moss_block'),
    MOSS_ARGON: get('v_539_argon_moss_block'), MOSS_NEON: get('v_625_neon_moss_block'),
    MOSS_HELIUM: get('v_627_helium_moss_block'),
    // 恶地族补齐（SceneMetrics.cs:614-615）：661 腐化丛林草/400 腐化沙岩/662/401 猩红对位
    // （旧注释称引擎无 def——实际均已注册，按 0 计是漏）
    CORRUPT_JUNGLE_GRASS: get('v_661_corrupt_jungle_grass_block'),
    CORRUPT_SANDSTONE: get('v_400_corrupt_sandstone_block'),
    CRIMSON_JUNGLE_GRASS: get('v_662_crimson_jungle_grass_block'),
    CRIMSON_SANDSTONE: get('v_401_crimson_sandstone_block'),
  };
})();
/** 房屋墙表（Main.cs wallHouse[N]=true 全提取，265 项）：可由玩家放置的墙。
 *  FindSpawnTile L886：落点格带房屋墙 → 弃选（房屋内不刷怪的主守卫）；
 *  SetSpawnFlags L321：玩家所站格带房屋墙 → noWorms（房屋内不出蠕虫） */
const WALL_HOUSE = new Set([1, 4, 5, 6, 10, 11, 12, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 42, 43, 44, 45, 46, 47, 60, 66, 67, 68, 72, 73, 74, 75, 76, 77, 78, 82, 84, 85, 88, 89, 90, 91, 92, 93, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 167, 168, 169, 172, 173, 174, 175, 176, 177, 179, 181, 182, 183, 184, 186, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255, 256, 257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 282, 283, 284, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366]);

/** EvilTileCount 计数表(SceneMetrics.cs:614):23/661/24/25/32/112/163/400/398 计 1,27 向日葵 −10 */
const EVIL_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.CORRUPT_GRASS, T.CORRUPT_JUNGLE_GRASS, T.EBONSTONE, T.CORRUPT_PLANT,
    T.CORRUPT_THORN, T.EBONSAND, T.CORRUPT_ICE, T.CORRUPT_SANDSTONE, T.CORRUPT_HARDSAND]) if (id) t[id] = 1;
  return t;
})();
/** BloodTileCount 计数表(SceneMetrics.cs:615):199/662/201/203/200/401/399/234/352 计 1 */
const BLOOD_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.CRIMSON_GRASS, T.CRIMSON_JUNGLE_GRASS, T.CRIMSTONE, T.CRIMSON_PLANT,
    T.CRIMSON_ICE, T.CRIMSON_SANDSTONE, T.CRIMSON_HARDSAND, T.CRIMSAND, T.CRIMSAND_THORN]) if (id) t[id] = 1;
  return t;
})();
/** HolyTileCount 计数表(SceneMetrics.cs:603):109/492/110/113/117/116/164/403/402 计 1 */
const HOLY_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.HALLOW_GRASS, T.HALLOW_MOWED_GRASS, T.HALLOW_PLANT, T.HALLOW_TALL_PLANT,
    T.PEARLSTONE_BLOCK, T.PEARLSAND, T.HOLLOW_ICE, T.HALLOW_SANDSTONE, T.HALLOW_HARDSAND]) if (id) t[id] = 1;
  return t;
})();
/** SnowTileCount 计数表(SceneMetrics.cs:604):147/148/161/162/164/163/200 计 1
 *  （注意 164 粉冰/163 紫冰/200 红冰同时计入雪族——转化冰都算雪原） */
const SNOW_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.SNOW, T.SNOW_BRICK, T.ICE, T.THIN_ICE, T.HOLLOW_ICE,
    T.CORRUPT_ICE, T.CRIMSON_ICE]) if (id) t[id] = 1;
  return t;
})();
/** JungleTileCount 计数表(SceneMetrics.cs:613 非 remix):60/61/62/74/226/225 计 1 */
const JUNGLE_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.JUNGLE_GRASS, T.JUNGLE_PLANT, T.JUNGLE_VINE, T.JUNGLE_TALL_PLANT,
    T.LIHZAHRD_BRICK, T.HIVE]) if (id) t[id] = 1;
  return t;
})();
/** MushroomTileCount 计数表(SceneMetrics.cs:617):70/71/72/528 计 1 */
const MUSHROOM_LOOKUP = (() => {
  const t = new Uint8Array(TILE_DEFS.length);
  for (const id of [T.MUSHROOM_GRASS, T.MUSHROOM_PLANT, T.MUSHROOM_TREE, T.MUSHROOM_VINE]) if (id) t[id] = 1;
  return t;
})();
/** Main.tileSand 全表（Main.cs:7177-7180，1.4.5.6 仅 4 项）：
 *  isOcean 判定（NPC.cs L1104）用沙族集合而非只认 53 黄沙 */
const TILE_SAND = new Set([T.SAND, T.EBONSAND, T.PEARLSAND, T.CRIMSAND]);
/** TileID.Sets.Conversion.Moss（TileID.cs:38）全表：CheckToSpawnRockGolem 落脚 tile 门
 *  （NPC.cs:5715：spawnTileType==1 石 或 Moss 族） */
const TILE_MOSS = new Set([T.MOSS_GREEN, T.MOSS_YELLOW, T.MOSS_RED, T.MOSS_BLUE, T.MOSS_PURPLE,
  T.MOSS_LAVA, T.MOSS_KRYPTON, T.MOSS_XENON, T.MOSS_ARGON, T.MOSS_NEON, T.MOSS_HELIUM]);

// ---- 洞穴主池 cavernMonsterType 表（NPC.cs:6498 + 世界生成时 18058-18064 填充） ----
export let cavernMonsterType: number[][] = [[49, 49, 49], [49, 49, 49]];
export function rollCavernMonsterType(rng: RNG): void {
  for (let i = 0; i < 2; i++) {
    // 原版 Next(494,496)/Next(496,498)/Next(498,507)（WorldGen L18058-18064）——
    // 本仓库 RNG.int 为闭区间，此前写 int(494,496) 会多出 496/498/507 三个越界 id
    cavernMonsterType[i][0] = rng.int(494, 495); // 洞穴蝾螈族 v_494/v_495
    cavernMonsterType[i][1] = rng.int(496, 497);
    cavernMonsterType[i][2] = rng.int(498, 506);
  }
}

// ---- 原版 netID（负数）→ SetDefaultsFromNetId（L7633-7820）：基底 id + scale + 属性覆盖 ----
// scale/color/alpha 一律取源数据（public/sprites/vanilla-npcnetid.json，extract-npccolors.mjs 提取）
import vanillaNetIdJson from '../../data/vanilla-npcnetid.json';
const NET_ID_OVERRIDE: Record<string, { scale?: number; color?: number[]; alpha?: number }> = vanillaNetIdJson;

const NET_ID_MAP: Record<number, { base: number; scale: number; hp?: number; dmg?: number; def?: number }> = {
  '-1': { base: 16, scale: 0.6, hp: 90, dmg: 45, def: 10 },   // 母史莱姆
  '-2': { base: 16, scale: 0.9, hp: 90, dmg: 45, def: 20 },
  '-3': { base: 1, scale: 0.9, hp: 14, dmg: 6, def: 0 },   // 绿史莱姆
  '-4': { base: 1, scale: 0.6, hp: 150, dmg: 5, def: 5 },
  '-5': { base: 1, scale: 0.9, hp: 30, dmg: 13, def: 4 },  // 黑史莱姆
  '-6': { base: 1, scale: 1.05, hp: 45, dmg: 15, def: 4 },
  '-7': { base: 1, scale: 1.2, hp: 40, dmg: 12, def: 6 },
  '-8': { base: 1, scale: 1.025, hp: 35, dmg: 12, def: 4 }, // 红（母史莱姆子代）
  '-9': { base: 1, scale: 1.2, hp: 45, dmg: 15, def: 7 },   // 黄
  '-10': { base: 1, scale: 1.1, hp: 60, dmg: 18, def: 6 },  // 丛林
  '-11': { base: 6, scale: 0.85 },   // 小噬魂怪
  '-12': { base: 6, scale: 1.15 },   // 大噬魂怪
  // 黄蜂族大小变体（FromNetId NetIdMap[55..64]：两两一族 231-235；scale 取 netid 表）
  '-16': { base: 42, scale: 0.85 }, '-17': { base: 42, scale: 1.2 },    // Little/Big Stinger
  '-56': { base: 231, scale: 0.85 }, '-57': { base: 231, scale: 1.25 },
  '-58': { base: 232, scale: 0.8 }, '-59': { base: 232, scale: 1.17 },
  '-60': { base: 233, scale: 0.83 }, '-61': { base: 233, scale: 1.21 },
  '-62': { base: 234, scale: 0.78 }, '-63': { base: 234, scale: 1.16 },
  '-64': { base: 235, scale: 0.87 }, '-65': { base: 235, scale: 1.21 },
  // 地牢骷髅变体（SetDefaultsFromNetId L7770-7788：scale 后再乘 stat）
  '-13': { base: 31, scale: 0.9, hp: 72, dmg: 23, def: 7 },    // Short Bones(80/26/8 ×0.9)
  '-14': { base: 31, scale: 1.15, hp: 101, dmg: 33, def: 10 }, // Big Boned(×1.15 再 ×1.1)
  '-15': { base: 1, scale: 1.15 },   // 史莱姆王子
  '-22': { base: 223, scale: 1.0 }, '-23': { base: 223, scale: 1.0 },
  '-24': { base: 223, scale: 1.0 }, '-25': { base: 223, scale: 1.0 },
  // 僵尸/骷髅/眼变种 = 基底 + scale（贴图同基底，属性缩放）。
  // 基底一律以 NPCID.NetIdMap（NPCID.cs:12457-12465，index = -id-1）为准：
  // -26..-37 僵尸族基底 3/132/186/187/188/189；-38..-42 恶魔眼族基底 190-194
  // （旧表误写 base:3——贴图/属性全错）；-43 基底 2；-44/-45 基底 200
  '-26': { base: 3, scale: 0.9 }, '-27': { base: 3, scale: 1.1 },
  '-28': { base: 132, scale: 0.85 }, '-29': { base: 132, scale: 1.15 },
  '-30': { base: 186, scale: 0.93 }, '-31': { base: 186, scale: 1.13 },
  '-32': { base: 187, scale: 0.89 }, '-33': { base: 187, scale: 1.11 },
  '-34': { base: 188, scale: 0.87 }, '-35': { base: 188, scale: 1.13 },
  '-36': { base: 189, scale: 0.92 }, '-37': { base: 189, scale: 1.08 },
  '-38': { base: 190, scale: 1.15 }, '-39': { base: 191, scale: 1.1 },
  '-40': { base: 192, scale: 0.9 }, '-41': { base: 193, scale: 0.85 },
  '-42': { base: 194, scale: 1.1 },
  '-43': { base: 2, scale: 0.85 },  // 小恶魔眼
  '-44': { base: 200, scale: 0.87 }, '-45': { base: 200, scale: 1.05 },
  '-46': { base: 21, scale: 0.9 }, '-47': { base: 21, scale: 0.9 },
  '-48': { base: 201, scale: 0.9 }, '-49': { base: 201, scale: 0.9 },
  '-50': { base: 202, scale: 0.9 }, '-51': { base: 202, scale: 0.9 },
  '-52': { base: 203, scale: 0.9 }, '-53': { base: 203, scale: 0.9 },
  '-54': { base: 223, scale: 0.9 }, '-55': { base: 223, scale: 1.1 },
};

export class VanillaSpawner {
  // ---- SpawnFlags（Spawner 字段 L39-137） ----
  private pX = 0; private pY = 0;
  private dayTime = true;
  private hardMode = false;
  private waterTile = false;
  private noWorms = false;         // 原版 wallHouse（房屋内不出蠕虫）
  private skyMob = false;
  private surfaceSpawn = false;
  /** 本轮 spawnFriendly（NPC.cs:711-832 掷骰）：true = 本轮只走友好小动物链
   *  （SpawnAnNPC `else if (spawnFriendly)` :2006 段）;false = 小动物/宝石鼠兔/水黾段全跳过 */
  private spawnFriendlyCycle = false;
  /** Game 每轮尝试前置入(原版在 GetSpawnRate 同一例程内掷,本仓拆到 Game 侧以便
   *  同步 spawnRate/maxSpawns 修正;语义同序:掷骰失败时的 spawnRate 罚倍由 Game 应用) */
  setFriendlyCycle(v: boolean): void {
    this.spawnFriendlyCycle = v;
  }
  private underGround = false;      // 原 underGround = worldSurface < y < rockLayer
  private deeperThanRockLayer = false;
  private isOcean = false;
  private isBeach = false;
  private nearMarble = false;
  private nearGranite = false;
  private spawnUndergroundDesert = false;
  /** 蜘蛛巢旗标（L1066/L1074）：落点邻域 ±5..15 格内有墙 62（1/3 概率扫描），
   *  或玩家所站格墙 62（2/3 概率查玩家位）——蜘蛛巢内/附近必出蜘蛛的真正触发器 */
  private spawnSpider = false;
  private ZoneSnow = false; private ZoneCorrupt = false; private ZoneCrimson = false;
  private ZoneHallow = false; private ZoneJungle = false; private ZoneGlowshroom = false;
  /** 陨石带（SceneMetrics.cs:56/685：窗口内陨石 tile ≥ MeteorTileThreshold=75） */
  private ZoneMeteor = false;
  private ZoneDungeon = false; private ZoneGraveyard = false; private ZoneBeach = false;
  /** 原版 downedBoss3（杀过骷髅王）：地牢分支切换 守卫→常规怪池 */
  private downedBoss3 = false;
  private spawnTileX = 0; private spawnTileY = 0;
  /** FindSpawnTile 的 xRange 输出（L911：落脚点横向在 safeArea 内，传给 SpawnAnNPC） */
  private xRange = false;
  private spawnTileType = 0;
  /** 落脚点（Game 放置用） */
  currentSpawnX = 0;
  currentSpawnY = 0;
  /** GetZombieSettings（L5495）的地表夜僵尸 style（SpawnAnNPC 入口 Next(7) roll，L1193） */
  private zombieStyle = 0;
  /** GetZombieSettings（L5499-5514）：火把僵尸 590/591 的概率门分母。
   *  基础 12；playerHasStartingHealth（statLifeMax≤100，L327）→ 5 − 活跃玩家数/2（下限 2） */
  private torchZombieChance = 12;
  /** 玩家 statLifeMax（playerHasStartingHealth 判定用；未传入视为非初始血量 → 概率门 12） */
  private playerLifeMax = 0;

  constructor(private world: World) {}

  /** 玩家级 Zone 旗标（原版 Spawner.SetSpawnFlags L300：ZoneDungeon = player.ZoneDungeon——
   *  SceneMetrics 按玩家中心窗口判定，与落脚点无关）。Game 每帧刷怪前调用。
   *  invaders = ShouldSpawnInvasionEnemies(NPC.cs:352，入侵前线 3000px 内的地表玩家)；
   *  activeIds = 场上存活 NPC 的 vanillaId 集（选表 AnyNPCs 去重用）；
   *  moonEvent = 月事件上下文（事件开启时 Game 传入；null=无事件） */
  invaders = false;
  activeIds: Set<number> = new Set();
  /** 月事件上下文（null=无事件）+ 当帧 Boss 上限旗标（Spawner.ctor NPC.cs:159-183） */
  moonEvent: MoonEventSpawnCtx | null = null;
  moonBossCap = false;
  /** 星璇塔 Zone 上下文（null=不在塔区）；invaders 语义（SetSpawnFlags :315-318）由此驱动 */
  lunar: LunarSpawnCtx | null = null;
  setPlayerFlags(zoneDungeon: boolean, downedSkeletron: boolean,
    invaders = false, activeIds: Set<number> = new Set(),
    moonEvent: MoonEventSpawnCtx | null = null,
    lunar: LunarSpawnCtx | null = null,
    playerLifeMax = 0): void {
    this.ZoneDungeon = zoneDungeon;
    this.downedBoss3 = downedSkeletron;
    this.invaders = invaders;
    this.activeIds = activeIds;
    this.moonEvent = moonEvent;
    this.lunar = lunar;
    this.playerLifeMax = playerLifeMax;
    // reachedInvasionBossCap（Spawner 构造器 NPC.cs:159-183）：Boss 族 npcSlots 总和
    // ≥ 玩家数 × maxSpawns 上限（单人 ⌊5×2.3⌋=11）时当帧不刷 Boss
    this.moonBossCap = moonEvent != null && moonEvent.bossSlotSum >= 1 * MOON_BOSS_CAP_SLOTS;
  }

  /** 天气注入（Game 每 15 tick 下发）：cloudAlpha（雨强度，雪原刷怪修正）与沙尘暴态（怪池） */
  rainCloudAlpha = 0;
  sandstormHappening = false;
  zoneSandstorm = false;
  setWeather(cloudAlpha: number, sandstormHappening: boolean, zoneSandstorm: boolean): void {
    this.rainCloudAlpha = cloudAlpha;
    this.sandstormHappening = sandstormHappening;
    this.zoneSandstorm = zoneSandstorm;
  }

  /** SlimeRainSpawns（NPC.cs:5829-5898 1:1）：史莱姆雨天空落怪。
   *  独立于常规 spawnRate 概率门（原版每玩家每帧先调本函数再 TrySpawnAnNPC）。
   *  nearbySlots>15 / 玩家过深直接拒绝；num3=45+450×(nearby/15)（专家 ×0.85）。
   *  落点：x=玩家±viewW、y=玩家上方 (1.5~0.75)×viewH 带 → 格门：
   *  x∈[10,w+10]、y∈[surface×0.3, surface]、周围 7×8 无实心、落点无房屋墙。
   *  选怪：1/200 蓝(-4)；专家 1/7 大(-7)、1/3 绿(-3)；普通 1/10 大、2/5 绿；默认蓝(1) */
  slimeRainSpawns(px: number, py: number, nearbySlots: number, viewW: number, viewH: number, rng: RNG, expert: boolean): Enemy | null {
    const w = this.world;
    const worldSurface = w.groundLevel;
    if (py > worldSurface * 16 + viewH / 2 || nearbySlots > 15) return null;
    const num2 = nearbySlots / 15;
    let num3 = 45 + Math.floor(450 * num2);
    if (expert) num3 = Math.floor(num3 * 0.85);
    if (num3 < 1) num3 = 1;
    if (rng.int(0, num3 - 1) !== 0) return null;
    const x0 = Math.floor(px - viewW), x1 = x0 + viewW * 2;
    const y0 = Math.floor(py - viewH * 1.5), y1 = Math.floor(py - viewH * 0.75);
    const tx = Math.floor(rng.int(x0, x1 - 1) / 16);
    const ty = Math.floor(rng.int(y0, y1 - 1) / 16);
    const st = w.store;
    if (tx < 10 || tx > st.w + 10 || ty < worldSurface * 0.3 || ty > worldSurface) return null;
    if (!st.inBounds(tx, ty)) return null;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -5; dy <= 2; dy++) {
        if (st.inBounds(tx + dx, ty + dy) && st.isSolid(tx + dx, ty + dy)) return null;
      }
    }
    if (WALL_HOUSE.has(st.wall[st.idx(tx, ty)])) return null;
    let netId = 1;
    if (rng.int(0, 199) === 0) netId = -4;
    else if (expert) {
      if (rng.int(0, 6) === 0) netId = -7;
      else if (rng.int(0, 2) === 0) netId = -3;
    } else {
      if (rng.int(0, 9) === 0) netId = -7;
      else if (rng.int(0, 4) < 2) netId = -3;
    }
    return this.spawnNPC(tx * 16 + 8, ty * 16, netId, rng);
  }

  /** 造怪入口：netId 可为负（SetDefaultsFromNetId 映射）；
   *  ai0/ai1 = 原版 SpawnNPC 第 6/7 参（如攀爬者 101 的锚点格，NPC.cs:4040） */
  private spawnNPC(x: number, y: number, netId: number, rng: RNG, ai0?: number, ai1?: number): Enemy | null {
    const map = NET_ID_MAP[netId];
    const baseId = map?.base ?? netId;
    const e = Enemy.fromVanilla(baseId, x, y);
    if (!e) return null;
    // 原版 NewNPC 锚点(NPC.cs:46596-46597):X-width/2, Y-height(底部贴格顶)。
    // 此前 fromVanilla 中心锚(y-h/2)把怪埋进落脚实心格半格高——飞行怪沿地面内沿
    // 漂移穿过侧壁,看起来像穿墙(噬魂怪等 ai5 族)
    e.y = y - e.h;
    const ov = NET_ID_OVERRIDE[String(netId)];
    e.vanillaNetId = netId;
    if (map) {
      e.vanillaScale = ov?.scale ?? map.scale;   // scale 优先源数据（SetDefaults_ForNetId 第 3 参）
      if (map.hp != null) e.hp = e.maxHp = map.hp;
      if (map.dmg != null) e.def.damage = map.dmg;
      if (map.def != null) e.def.defense = map.def;
    } else if (ov?.scale != null) {
      e.vanillaScale = ov.scale;
    }
    // SetDefaultsFromNetId 覆盖 color/alpha（L7633+：color = new Color(...) / alpha = N）
    if (ov?.color) e.colorRGBA = [ov.color[0], ov.color[1], ov.color[2], ov.color[3] ?? 255];
    if (ov?.alpha != null) e.spawnAlpha = ov.alpha;
    // 植物族锚点（aiStyle 13：锚点格存 ai0/ai1）
    if (ai0 !== undefined && ai1 !== undefined) { e.ai0 = ai0; e.ai1 = ai1; }
    e.id = this.world.store.w; // 占位，Game 侧会重编
    return e;
  }

  // ---- SetSpawnFlagsForChosenTile（L950-1185） ----
  private setFlagsForChosenTile(spawnTileX: number, spawnTileY: number, spawnTileType: number, rng: RNG): void {
    const st = this.world.store;
    this.spawnTileX = spawnTileX; this.spawnTileY = spawnTileY; this.spawnTileType = spawnTileType;
    // waterTile（L957）：落脚格上方两格都是液体且为水
    const above1 = st.idx(spawnTileX, spawnTileY - 1), above2 = st.idx(spawnTileX, spawnTileY - 2);
    this.waterTile = st.liquid[above1] > 0 && st.liquid[above2] > 0 && st.liquidType[above1] === 1;
    // nearMarble/nearGranite（L960-1046）：落点 tile → 玩家 tile → 两轮邻近扫描
    // (落点 ±Next(20,30) 步长 Next(1,4) + 玩家 ±Next(30,60) 步长 Next(3,7) 抽样)。
    // 只查落点/玩家两格会让小体量大理石/花岗岩洞几乎永远探测不到
    if (spawnTileType === T.MARBLE) this.nearMarble = true;
    else if (spawnTileType === T.GRANITE) this.nearGranite = true;
    else if (st.type[st.idx(this.pX, this.pY)] === T.MARBLE) this.nearMarble = true;
    else if (st.type[st.idx(this.pX, this.pY)] === T.GRANITE) this.nearGranite = true;
    else {
      const scanType = (cx0: number, cy0: number, r: number, stepI: number, stepJ: number) => {
        const x0 = Math.max(0, cx0 - r), x1 = Math.min(st.w - 1, cx0 + r);
        const y0 = Math.max(0, cy0 - r), y1 = Math.min(st.h - 1, cy0 + r);
        for (let i = x0; i <= x1; i += stepI) {
          for (let j = y0; j <= y1; j += stepJ) {
            const tt = st.type[st.idx(i, j)];
            if (tt === T.MARBLE) this.nearMarble = true;
            else if (tt === T.GRANITE) this.nearGranite = true;
          }
        }
      };
      scanType(spawnTileX, spawnTileY, rng.int(20, 30), rng.int(1, 3), 1 + (rng.next() * 3 | 0));
      scanType(this.pX, this.pY, rng.int(30, 60), rng.int(3, 6), 3 + (rng.next() * 4 | 0));
    }
    // 地下沙漠（L1078-1100）：同蜘蛛巢的双路触发——1/3 扫落点 ±Next(5,15) 墙集
    // {216,217,187};2/3 查玩家所站格墙。此前只查落点一格(巢腔墙多在空气格,地板格常是天然墙)
    const DESERT_WALL = (w: number) => w === 216 || w === 217 || w === 187;
    if (spawnTileY < this.world.rockLevel && spawnTileY > 200 && !this.ZoneDungeon) {
      if (rng.next() < 1 / 3) {
        const r = rng.int(5, 14);
        const x0 = Math.max(0, spawnTileX - r), x1 = Math.min(st.w - 1, spawnTileX + r - 1);
        const y0 = Math.max(0, spawnTileY - r), y1 = Math.min(st.h - 1, spawnTileY + r - 1);
        for (let sx = x0; sx <= x1 && !this.spawnUndergroundDesert; sx++) {
          for (let sy = y0; sy <= y1; sy++) {
            if (DESERT_WALL(st.wall[st.idx(sx, sy)])) { this.spawnUndergroundDesert = true; break; }
          }
        }
      } else if (DESERT_WALL(st.wall[st.idx(this.pX, this.pY)])) {
        this.spawnUndergroundDesert = true;
      }
    }
    this.surfaceSpawn = spawnTileY <= this.world.groundLevel;
    // L1146-1153 第二支：岩石层-20 以下的落点在血月（或日食昼）且处于世界中带
    // （x ∈ (0.38w+50, 0.62w)）→ 强制地表化（血月僵尸从地下刷怪口涌向地表的语义）
    if (spawnTileY > this.world.rockLevel - 20
      && ((this.world.clock?.bloodMoon) || (this.world.clock?.eclipse && this.world.clock?.isDay))
      && spawnTileX > st.w * 0.38 + 50 && spawnTileX < st.w * 0.62) {
      this.surfaceSpawn = true;
    }
    this.deeperThanRockLayer = spawnTileY >= this.world.rockLevel;
    this.underGround = spawnTileY > this.world.groundLevel && spawnTileY < this.world.rockLevel;
    // isOcean（L1104 1:1）：(边缘 && Main.tileSand[spawnTileType] && 岩石层上)
    //  || (spawnTileType==53 && oceanDepths)。沙族 = Main.cs:7177-7180 全表（53/112/116/234），
    //  只认 53 会漏黑檀沙/珍珠沙/猩红沙海床。
    // oceanDepths（WorldGen.cs:10978-10988 1:1）：y ≤ oceanLevel（=（worldSurface+rockLayer)/2+40，
    //  WorldGen.cs:4393）&& x < beachDistance。oceanDistance/beachDistance 是
    //  **不随图宽缩放**的常量（WorldGen.cs:4100/4102 = 250/380）——BeachPass 的
    //  oceanWater 220~260 / beachSandRandomCenter+20=340 是另一套生成期随机值，
    //  与本判定的 250/380 无对应关系，此前借它近似（260/340）属错位：
    //  第二项 beachX 340→380 会漏判 40 格沙滩海床。本仓世界恒 4200 宽（van=1），
    //  直接取原版常量。
    const oceanX = 250;    // WorldGen.oceanDistance
    const beachX = 380;    // WorldGen.beachDistance
    this.isOcean = ((spawnTileX < oceanX || spawnTileX > st.w - oceanX)
      && TILE_SAND.has(spawnTileType) && spawnTileY < this.world.rockLevel)
      || (spawnTileType === T.SAND
        && spawnTileY <= (this.world.groundLevel + this.world.rockLevel) / 2 + 40
        && (spawnTileX < beachX || spawnTileX > st.w - beachX));
    this.isBeach = spawnTileY <= this.world.groundLevel && (spawnTileX < beachX || spawnTileX > st.w - beachX);
    // Zone 判定（SceneMetrics.cs:24-64/648-697）：全部六族走玩家中心 169×123 窗口计数，
    // 阈值 Snow 1500 / Corrupt·Crimson 300 / Hallow 125 / Jungle 140 / Mushroom 100。
    // 旧实现只有恶地走窗口计数，其余只看落脚单格 → 雪原/神圣/丛林/蘑菇地常漏判
    this.refreshZoneCounts(this.pX, this.pY);
    this.ZoneSnow = this.zoneCounts.snow >= 1500;
    this.ZoneCorrupt = this.zoneCounts.evil >= 300;
    this.ZoneCrimson = this.zoneCounts.blood >= 300;
    this.ZoneHallow = this.zoneCounts.holy >= 125;
    this.ZoneJungle = this.zoneCounts.jungle >= 140;
    this.ZoneGlowshroom = this.zoneCounts.mushroom >= 100;
    this.ZoneMeteor = this.zoneCounts.meteor >= 75;
    // ZoneGraveyard（SceneMetrics.cs:622-623/686）：墓碑 85 计数 − 向日葵/2（下取整、钳 ≥0）
    //  ≥ GraveyardTileThreshold 28——向日葵每 2 株抵 1 块墓碑
    this.ZoneGraveyard = this.zoneCounts.graveyard >= 28;
    // ZoneDungeon 不在此设置：原版取玩家 SceneMetrics（SetSpawnFlags L300），见 setPlayerFlags
    // ---- 蜘蛛巢旗标（L1045-1079）:岩石层~地狱层 && 非地牢时 ----
    // 1/3 概率扫落点 ±Next(5,15) 立方盒内任意墙 62;否则查玩家所站格墙 62。
    // 此前只查落点一格,玩家站巢里时屏幕外环带点几乎全在巢外 → 蜘蛛永不触发
    if (spawnTileY > this.world.rockLevel && spawnTileY < st.h - 200 && !this.ZoneDungeon) {
      if (rng.next() < 1 / 3) {
        const r = rng.int(5, 14);
        const x0 = Math.max(0, spawnTileX - r), x1 = Math.min(st.w - 1, spawnTileX + r - 1);
        const y0 = Math.max(0, spawnTileY - r), y1 = Math.min(st.h - 1, spawnTileY + r - 1);
        for (let sx = x0; sx <= x1 && !this.spawnSpider; sx++) {
          for (let sy = y0; sy <= y1; sy++) {
            if (st.wall[st.idx(sx, sy)] === 62) { this.spawnSpider = true; break; }
          }
        }
      } else if (st.wall[st.idx(this.pX, this.pY)] === 62) {
        this.spawnSpider = true;
      }
    }
  }

  /** tileDungeon 集（Main.cs:7941-7946）：41/43/44 主砖（677-679 安全变体未注册缺席=0）。
   *  PostCheckChosenSpawnTile L922-927：ZoneDungeon 时落脚点必须踩地牢砖且
   *  spawnWallType（=落脚格上方一格的墙，GetProperGroundSpawnTileTypeAndWallType L5792）非 0。
   *  查落脚格自身的墙会因地板砖 wall=0 恒拒 → 地牢几乎不刷怪 */
  /** IsThisAGoodPlaceForAStatueMimic（NPC.cs:43751-43761 1:1）：落脚 x/x+1 两格
   *  SolidTile2（活跃+实心+无坡+非半砖+非致动），上方 3 格两列全净空。
   *  与附近是否存在雕像无关（函数名历史遗留）——纯落点预检 */
  private isGoodPlaceForAStatueMimic(): boolean {
    const st = this.world.store;
    const x = this.spawnTileX, y = this.spawnTileY;
    const solid2 = (tx: number, ty: number): boolean => {
      if (!st.inBounds(tx, ty)) return false;
      const i = st.idx(tx, ty);
      if (!st.flags[i]) return false;                    // active()
      if (st.wire[i] & TileStore.WIRE_ACTUATED) return false;   // inActive()（致动位）
      if (st.half[i]) return false;                      // halfBrick()
      if (st.slope[i] !== 0) return false;               // slope()==0
      return !!TILE_DEFS[st.type[i]]?.solid;             // Main.tileSolid
    };
    if (!solid2(x, y) || !solid2(x + 1, y)) return false;
    for (let dy = 1; dy <= 3; dy++) {
      if (st.inBounds(x, y - dy) && st.flags[st.idx(x, y - dy)]) return false;
      if (st.inBounds(x + 1, y - dy) && st.flags[st.idx(x + 1, y - dy)]) return false;
    }
    return true;
  }

  private isDungeonTile(t: number): boolean {
    return t === T.DUNGEON_BLUE || t === T.DUNGEON_GREEN || t === T.DUNGEON_PINK;
  }

  /** SceneMetrics.ScanTiles 近似：玩家中心 169×123 窗口(zoneScanSize=1920/16+49 × 1200/16+49)
   *  一次扫描同时产出全部六族计数，setFlagsForChosenTile 与 getSpawnRate 共用。
   *  原版 SceneMetrics 每帧增量维护；本类无帧钩子 → 0.5s 或玩家移动 ≥32 格才重算（近似） */
  private zoneStamp = -1;
  private zoneCX = -99999; private zoneCY = -99999;
  private zoneCounts = { evil: 0, blood: 0, holy: 0, snow: 0, jungle: 0, mushroom: 0, meteor: 0, graveyard: 0 };

  private refreshZoneCounts(cx: number, cy: number): void {
    const now = performance.now();
    if (this.zoneStamp >= 0 && now - this.zoneStamp < 500
      && Math.abs(cx - this.zoneCX) < 32 && Math.abs(cy - this.zoneCY) < 32) return;
    this.zoneStamp = now; this.zoneCX = cx; this.zoneCY = cy;
    const st = this.world.store;
    const x0 = Math.max(2, cx - 84), x1 = Math.min(st.w - 3, cx + 84);
    const y0 = Math.max(2, cy - 61), y1 = Math.min(st.h - 3, cy + 61);
    let evil = 0, blood = 0, holy = 0, snow = 0, jungle = 0, mushroom = 0, sunflower = 0, meteor = 0, tomb = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * st.w;
      for (let x = x0; x <= x1; x++) {
        const i = row + x;
        if (!st.flags[i]) continue;   // 仅活跃格（SceneMetrics.ScanTiles 同语义）
        const t = st.type[i];
        if (EVIL_LOOKUP[t]) evil++;
        else if (BLOOD_LOOKUP[t]) blood++;
        else if (HOLY_LOOKUP[t]) holy++;
        else if (SNOW_LOOKUP[t]) snow++;
        else if (JUNGLE_LOOKUP[t]) jungle++;
        else if (MUSHROOM_LOOKUP[t]) mushroom++;
        else if (t === T.METEORITE) meteor++;
        else if (t === T.TOMBSTONE) tomb++;
        else if (t === T.SUNFLOWER) sunflower++;
      }
    }
    // SceneMetrics.cs:588-592/608-615：向日葵每株 −10 计入恶/血两族。
    //  num = −10，infectedSeed 种子（10xx 醉酒世界）时 num ×3 → 每株 −30——
    //  本仓无种子系统（恒非 infectedSeed）→ 恒 ×1
    evil += sunflower * -10; blood += sunflower * -10;
    // SceneMetrics.cs:648-662：神圣/邪恶/猩红两两互减后钳 ≥0
    const holyRaw = holy;
    holy -= evil; holy -= blood;
    evil -= holyRaw; blood -= holyRaw;
    this.zoneCounts = {
      evil: Math.max(0, evil), blood: Math.max(0, blood), holy: Math.max(0, holy),
      snow, jungle, mushroom, meteor,
      // GraveyardTileCount（SceneMetrics.cs:622-623/632-634）：85 计数 − 向日葵/2，钳 ≥0
      graveyard: Math.max(0, tomb - (sunflower >> 1)),
    };
  }

  // ---- FindSpawnTile（L879-920）----
  /** GetSpawnRate（L383-668，单机非 remix 分支）：
   *  defaultSpawnRate=600 / defaultMaxSpawns=5（L6108/6110）。
   *  深度带/昼夜/附近怪分层/水蜡烛修正 + clamp（L655-662）。
   *  血月/日食/南瓜月（月事件覆盖见函数首分支）/和平蜡烛/向日葵/calmed 均已实现（:581-642）；
   *  隐身/仙女倍率未实现（依赖 stealth/luck 子系统，登记 docs/spawn-parity-gaps.md）。
   *  UnderworldLayer = maxTilesY-200(Main.cs:2863 属性表达式,精确非近似) */
  getSpawnRate(playerYpx: number, nearbySlots: number, waterCandle: boolean, sHeightPx: number,
    playerXpx = this.pX * TILE, peaceCandle = false, sunflower = false, calmed = false, battle = false,
    townNPCs = 0, dayTime = true, zoneEvil = false, bloodMoon = false): { spawnRate: number; maxSpawns: number } {
    // 月事件覆盖（L681-685）：南瓜月/霜月且玩家在地表（remix 省略）→
    // rate=20、max=⌊5×(2+0.3n)⌋（单人 11）；先于 invaders 覆盖（原版即此顺序）
    if (this.moonEvent && playerYpx < this.world.groundLevel * 16) {
      return { spawnRate: 20, maxSpawns: Math.floor(5 * (2 + 0.3 * 1)) };
    }
    // 入侵覆盖（L691-695）：rate=20（每帧 1/20 尝试），上限 5*(2+0.3n)（单人 11）。
    // 星璇塔 Zone 同走 invaders 语义（SetSpawnFlags :315-318 任一塔 Zone → invaders=true）
    if (this.invaders || this.lunar) {
      return { spawnRate: 20, maxSpawns: Math.floor(5 * (2 + 0.3 * 1)) };
    }
    let spawnRate = 600;
    let maxSpawns = 5;
    const w = this.world;
    // L389-392：困难模式 spawnRate×0.9 / maxSpawns+1——最先施加，后续修正全部叠在其上。
    // 直接读 world.flags（this.hardMode 要等 spawn() 才刷新，首帧会漏乘）
    if (w.flags.hardMode) {
      spawnRate = Math.floor(spawnRate * 0.9);
      maxSpawns += 1;
    }
    const underworldY = (w.store.h - 200) * 16;
    if (playerYpx > underworldY) {
      // L393-396：地狱 maxSpawns×2
      maxSpawns = Math.floor(maxSpawns * 2);
    } else if (playerYpx > w.rockLevel * 16 + sHeightPx) {
      // L402-407：洞穴层 spawnRate×0.4 / max×1.9
      spawnRate = Math.floor(spawnRate * 0.4);
      maxSpawns = Math.floor(maxSpawns * 1.9);
    } else if (playerYpx > w.groundLevel * 16 + sHeightPx) {
      // L418-422：地下层 spawnRate×0.5 / max×1.7
      spawnRate = Math.floor(spawnRate * 0.5);
      maxSpawns = Math.floor(maxSpawns * 1.7);
    } else if (!w.clock.isDay) {
      // L455-459：夜晚 spawnRate×0.6 / max×1.3；血月再 ×0.3/×1.8（L447-450）
      // （昼/夜直接读 clock，同 hardMode——this.dayTime 要等 spawn() 才刷新，首帧会漏判）
      spawnRate = Math.floor(spawnRate * 0.6);
      maxSpawns = Math.floor(maxSpawns * 1.3);
      if (w.clock.bloodMoon) {
        spawnRate = Math.floor(spawnRate * 0.3);
        maxSpawns = Math.floor(maxSpawns * 1.8);
      }
    } else if (w.clock.isDay && w.clock.eclipse) {
      // L458-461：日食白天 spawnRate×0.2 / max×1.9（血月同层级的 else-if 支）
      spawnRate = Math.floor(spawnRate * 0.2);
      maxSpawns = Math.floor(maxSpawns * 1.9);
    }
    // Zone 判定现取（原版每次从玩家 SceneMetrics 取，非上次生成残留 flag）：
    // 玩家中心窗口计数（0.5s 缓存近似，见 refreshZoneCounts），本函数每帧被调
    this.refreshZoneCounts(Math.floor(playerXpx / TILE), Math.floor(playerYpx / TILE));
    const zoneCorrupt = this.zoneCounts.evil >= 300;
    const zoneCrimson = this.zoneCounts.blood >= 300;
    const zoneSnow = this.zoneCounts.snow >= 1500;
    // 雨天雪原（L493-496，深度修正之后、地牢倍率之前）：ZoneSnow 且玩家在地表 →
    // max×(1+cloudAlpha) / rate×(1-cloudAlpha+1)/2（cloudAlpha=0 时为恒等变换）
    if (zoneSnow && playerYpx / TILE < w.groundLevel) {
      maxSpawns = Math.floor(maxSpawns * (1 + this.rainCloudAlpha));
      spawnRate = Math.floor(spawnRate * (1 - this.rainCloudAlpha + 1) / 2);
    }
    // 地牢（L504-505）：spawnRate×0.3 / max×1.8——必须发生在 clamp（L661-664）之前，
    // 否则可产出 max>15（旧实现放 clamp 后漏判）
    if (this.ZoneDungeon) {
      spawnRate = Math.floor(spawnRate * 0.3);
      maxSpawns = Math.floor(maxSpawns * 1.8);
    }
    // L583-591（无条件）：附近怪 <20%/40%/60%/80% 上限时 ×0.6/×0.7/×0.8/×0.9
    if (nearbySlots < maxSpawns * 0.2) spawnRate = Math.floor(spawnRate * 0.6);
    else if (nearbySlots < maxSpawns * 0.4) spawnRate = Math.floor(spawnRate * 0.7);
    else if (nearbySlots < maxSpawns * 0.6) spawnRate = Math.floor(spawnRate * 0.8);
    else if (nearbySlots < maxSpawns * 0.8) spawnRate = Math.floor(spawnRate * 0.9);
    // L592-604：地下中点以下/腐化/猩红再叠加（Zone 用上面现取值）
    if (playerYpx / TILE > (w.groundLevel + w.rockLevel) / 2 || zoneCorrupt || zoneCrimson) {
      if (nearbySlots < maxSpawns * 0.2) spawnRate = Math.floor(spawnRate * 0.7);
      else if (nearbySlots < maxSpawns * 0.4) spawnRate = Math.floor(spawnRate * 0.9);
    }
    // L617-620：镇静药水（calmed）×1.65 / ×0.6
    if (calmed) {
      spawnRate = Math.floor(spawnRate * 1.65);
      maxSpawns = Math.floor(maxSpawns * 0.6);
    }
    // L624-628：向日葵（buff 146 标志）×1.2 / ×0.8
    if (sunflower) {
      spawnRate = Math.floor(spawnRate * 1.2);
      maxSpawns = Math.floor(maxSpawns * 0.8);
    }
    // L632-635：战斗药水（enemySpawns）×0.5 / ×2
    if (battle) {
      spawnRate = Math.floor(spawnRate * 0.5);
      maxSpawns = Math.floor(maxSpawns * 2);
    }
    // L640-646：水蜡烛 spawnRate×0.75 / max×1.5；天空层再 ×0.5
    if (waterCandle) {
      spawnRate = Math.floor(spawnRate * 0.75);
      maxSpawns = Math.floor(maxSpawns * 1.5);
      if (playerYpx / TILE < w.groundLevel * 0.35) spawnRate = Math.floor(spawnRate * 0.5);
    } else if (peaceCandle) {
      // L645-648：和平蜡烛 ×1.3 / ×0.7（与水蜡烛互斥——原版 else if）
      spawnRate = Math.floor(spawnRate * 1.3);
      maxSpawns = Math.floor(maxSpawns * 0.7);
    }
    // L655-662：下限 spawnRate≥60，上限 maxSpawns≤15
    if (spawnRate < 60) spawnRate = 60;
    if (maxSpawns > 15) maxSpawns = 15;
    // L696：未杀骷髅王 rate=10（clamp 之后赋值，不受 ≥60 下限影响——守卫快速轮换）
    if (this.ZoneDungeon && !this.downedBoss3) spawnRate = 10;
    // ---- spawnFriendly 掷骰（NPC.cs:711-832;原版在 SetSpawnFlags 与 rate 同例程内）----
    // 外层门 :710：!invaders && 非血/南瓜/霜月(或白天) && 非日食白天 && !腐化/猩红/陨石/旧军
    // （墓地/Skyblock/infectedSeed 变体未实装;eclipse/陨石/旧军系统缺席恒 false）
    // ★此前未移植:小动物链（SpawnAnNPC :2006 `else if (spawnFriendly)`）恒放行 →
    //  无城镇 NPC 也会满地兔鼠(甚至刷到浮空岛——原版岛边 townNPCs=0 永不出小动物)
    this.spawnFriendlyCycle = false;
    if (!this.invaders && ((!bloodMoon) || dayTime) && !zoneEvil) {
      const deep = playerYpx / TILE > w.h - 200;   // :711 player.Center.Y/16 > UnderworldLayer
      if (deep) {
        // 地狱侧(:713-763)：友好概率低；命中时 maxSpawns×0.5（:724/:741/:757——
        // 削减只在 friendly 命中分支内，未命中只放宽 spawnRate）
        if (townNPCs === 1) {
          if (this.rateRng() < 1 / 10) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.5); } // :722-727
          else spawnRate = Math.floor(spawnRate * 1.25);
        } else if (townNPCs === 2) {
          if (this.rateRng() < 1 / 5) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.5); } // :736-743
          else spawnRate = Math.floor(spawnRate * 1.5);
        } else if (townNPCs >= 3) {
          if (this.rateRng() < 1 / 3) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.5); } // :753-759
          else spawnRate = Math.floor(spawnRate * 2);
        }
      } else {
        // 地表/洞穴侧(:765-832)：高友好率；命中时 maxSpawns×0.6（:782/:805/:821）；
        // townNPCs==0 → 永不友好(不出小动物)。
        // 墓地段（:770-778/:793-800/:815-822）：ZoneGraveyard && (!ZonePeaceCandle || 1/3)
        //  → spawnRate 放宽（×1.66/×2.33/×3）且友好掷骰概率骤降（1/9 / 1/6 / 1/3）——
        //  墓地有城镇 NPC 也会高密度刷怪（墓地小动物只有蛆/鼠，:2008-2014）
        const gy = this.ZoneGraveyard && (!peaceCandle || this.rateRng() < 1 / 3);
        if (townNPCs === 1) {
          if (gy) {
            spawnRate = Math.floor(spawnRate * 1.66);                       // :771
            if (this.rateRng() < 1 / 9) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.6); } // :773-775
          } else if (this.rateRng() < 1 / 3) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.6); } // :779-783
          else spawnRate = Math.floor(spawnRate * 2);
        } else if (townNPCs === 2) {
          if (gy) {
            spawnRate = Math.floor(spawnRate * 2.33);                       // :794
            if (this.rateRng() < 1 / 6) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.6); } // :796-798
          } else if (this.rateRng() < 2 / 3) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.6); } // :802-806
          else spawnRate = Math.floor(spawnRate * 3);
        } else if (townNPCs >= 3) {
          if (gy) {
            spawnRate = Math.floor(spawnRate * 3);                          // :816
            if (this.rateRng() < 1 / 3) { this.friendlyHit(); maxSpawns = Math.floor(maxSpawns * 0.6); } // :818-820
          } else {
            this.friendlyHit();   // :826-828 非 ftw 恒友好(专家 1/30 例外未实装)
            maxSpawns = Math.floor(maxSpawns * 0.6); // :830 无条件削减（专家例外轮也削）
          }
        }
      }
    }
    return { spawnRate, maxSpawns };
  }
  /** friendly 命中（:723/:740/:756/:804/:828）：只置 spawnFriendlyCycle；
   *  maxSpawns 削减（地狱 ×0.5 / 地表 ×0.6，且 town≥3 地表无条件）在分支就地执行 */
  private friendlyHit(): void {
    this.spawnFriendlyCycle = true;
  }
  private rateRng(): number {
    return Math.random();
  }

  /** FindSpawnTile（L879-927）+ GetSpawnArea（L841-877）1:1：
   *  spawnArea = 玩家 ±(0.7×全屏格)（均匀取点，不是环带外扩！），
   *  safeArea = 玩家 ±(0.52×全屏格)——生成点必须落在画面外（!safeArea.Contains）。
   *  viewHalfW/H = 半屏格数 → 0.7×全屏 = ×1.4 半屏；0.52×全屏 = ×1.04 半屏 */
  private findSpawnTile(rng: RNG, viewHalfW: number, viewHalfH: number): boolean {
    const st = this.world.store;
    const px = this.pX, py = this.pY;
    const rangeX = Math.max(1, Math.floor(viewHalfW * 1.4));
    const rangeY = Math.max(1, Math.floor(viewHalfH * 1.4));
    const safeX = Math.max(1, Math.floor(viewHalfW * 1.04));
    const safeY = Math.max(1, Math.floor(viewHalfH * 1.04));
    // WorldUtils.ClampToWorld
    const areaL = Math.max(2, px - rangeX), areaR = Math.min(st.w - 3, px + rangeX);
    const areaT = Math.max(2, py - rangeY), areaB = Math.min(st.h - 3, py + rangeY);
    for (let attempt = 0; attempt < 50; attempt++) {
      const tx = rng.int(areaL, areaR);
      let ty = rng.int(areaT, areaB);
      // L886-888：点在实心格 或 带房屋墙 → 重试（房屋内不刷怪的主守卫）
      if (st.isSolid(tx, ty)) continue;
      if (WALL_HOUSE.has(st.wall[st.idx(tx, ty)])) continue;
      this.skyMob = false;
      // L890-897：天空怪——高于 worldSurface×0.35 且露天（原版以"两侧 45% 带外"为条件，
      // 隐含不变量 = 浮空岛只在两侧、中央带无高空地面。此处改判"落脚面上方两格无墙"，
      // 在合法原版世界上与原版等价（岛皆露天），且兼容含中央浮空岛的存量世界——
      // 否则中央岛会被当地表刷僵尸/水母）
      if (ty < this.world.groundLevel * 0.35 && st.wall[st.idx(tx, ty - 1)] === 0 && st.wall[st.idx(tx, ty - 2)] === 0) {
        this.skyMob = true;
      } else {
        // L900-906：向下找第一个实心格 = 落脚面（扫描上限 = spawnArea.Bottom，非世界底）
        let j = ty;
        while (j < areaB && !st.isSolid(tx, j)) j++;
        if (j >= areaB) continue;
        ty = j;
      }
      // L910：safeArea 内（画面内）一律拒绝 + HasTileSpawnSpace 落点空间校验
      if (Math.abs(tx - px) < safeX && Math.abs(ty - py) < safeY) continue;
      if (!this.hasTileSpawnSpace(tx, ty)) continue;
      // L911：xRange = 落脚点在 safeArea 横向范围内（原版传给 SpawnAnNPC 的水生成判定）
      this.xRange = tx >= px - safeX && tx < px + safeX;
      this.spawnTileX = tx; this.spawnTileY = ty;
      return true;
    }
    return false;
  }

  /** HasTileSpawnSpace（L5306+5330）：落脚格上方 spawnSpaceX=2 × spawnSpaceY=3 区域
   *  逐格 CanSpawnInTile——非实心且非岩浆（防刷进实心/岩浆里） */
  private hasTileSpawnSpace(tx: number, ty: number): boolean {
    const st = this.world.store;
    for (let dx = -1; dx <= 0; dx++) {
      for (let dy = -3; dy <= -1; dy++) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
        const i = st.idx(x, y);
        if (st.isSolid(x, y)) return false;
        if (st.liquid[i] > 0 && st.liquidType[i] === 2) return false;
      }
    }
    return true;
  }

  /** 联机远端玩家位置注入（px，玩家碰撞盒中心）：Game.trySpawnEnemy 每帧赋值一行。
   *  原版 CheckNotSpawningOnScreen（L5344-5366）遍历全部 255 名玩家——与任一活跃玩家
   *  的扩展屏相交即拒，不是只查本地玩家；否则分屏/异地队友眼前会凭空刷怪 */
  static remotePlayers: Array<{ x: number; y: number }> = [];

  /** CheckNotSpawningOnScreen（L5344-5366）像素级双保险：
   *  落脚格 16×16 与"玩家屏幕 ±safeRange"矩形相交 → 拒绝。
   *  注意原版单位混用（L5354）：safeRangeX/Y 是格数但直接当像素偏移加——实际外扩仅 ~2 格 */
  private checkNotSpawningOnScreen(px: number, py: number, viewHalfW: number, viewHalfH: number): boolean {
    const sW = viewHalfW * 2 * TILE, sH = viewHalfH * 2 * TILE;
    const safePxX = viewHalfW * 1.04, safePxY = viewHalfH * 1.04; // 格数直接当像素（原版 L5354 原样）
    const tX = this.spawnTileX * TILE, tY = this.spawnTileY * TILE;
    const clear = (cx: number, cy: number): boolean => {
      const rectX = cx - sW / 2 - safePxX, rectY = cy - sH / 2 - safePxY;
      const rectW = sW + safePxX * 2, rectH = sH + safePxY * 2;
      return !(tX < rectX + rectW && tX + TILE > rectX && tY < rectY + rectH && tY + TILE > rectY);
    };
    if (!clear(px, py)) return false;
    for (const rp of VanillaSpawner.remotePlayers) {
      if (!clear(rp.x, rp.y)) return false;
    }
    return true;
  }

  /** 向上 50 格找“干格 + 下两格非实心”的洞隙线（海洋段 L1711-1718 / L1737-1752、
   *  水池段 L1844-1852 四处共用的扫描体）：命中返回干格 y+2 并按 L1719-1722 /
   *  L1853-1856 钳到 spawnTileY，找不到返回 -1 */
  private findDryGapY(spawnTileY: number): number {
    const st = this.world.store;
    for (let y = spawnTileY - 1; y > spawnTileY - 50 && y >= 0; y--) {
      if (st.liquid[st.idx(this.spawnTileX, y)] === 0
        && !st.isSolid(this.spawnTileX, y) && !st.isSolid(this.spawnTileX, y + 1)
        && !st.isSolid(this.spawnTileX, y + 2)) {
        return Math.min(y + 2, spawnTileY);
      }
    }
    return -1;
  }

  /** SpawnHornet（NPC.cs:5189-5255 1:1）：Next(8) 选族——
   *  case0-4 黄蜂族 231-235（各 1/4 小 -2k/大 -2k+1 变体）；default(case5-7) 蜂刺族 42 */
  private spawnHornet(x: number, y: number, rng: RNG): Enemy | null {
    const v = rng.int(0, 8);
    const table: Array<[number, number, number]> = [
      [-56, -57, 231], [-58, -59, 232], [-60, -61, 233],
      [-62, -63, 234], [-64, -65, 235],
      [-16, -17, 42],
    ];
    const row = table[Math.min(v, 5)];
    if (rng.next() < 0.25) return this.spawnNPC(x, y, row[0], rng);
    if (rng.next() < 0.25) return this.spawnNPC(x, y, row[1], rng);
    return this.spawnNPC(x, y, row[2], rng);
  }

  // ---- 月事件选怪（霜月 NPC.cs:2714-3132 / 南瓜月 :3134-3455，1:1） ----
  /** CountNPCS（场内存活数）：activeIds 只去重，计数走 Game 传入的 counts 表 */
  private moonCount(id: number): number {
    return this.moonEvent?.counts.get(id) ?? 0;
  }

  /** 霜月选怪：返回 netId；0 = 本帧不刷（原版空过，勿加兜底——14 波三 Boss 唯一门
   *  全被占时不刷是原版行为）。任意波先掷 1/30 && CountNPCS(341)<4 → 礼物窃贼 341。 */
  private pickFrostMoonSpawn(wave: number, rng: RNG): number {
    const N = (n: number) => rng.next() < 1 / n;
    const C = (id: number) => this.moonCount(id);
    if (N(30) && C(341) < 4) return 341;
    if (wave >= 20) {
      const num45 = rng.int(0, 2);   // 原版在 bossCap 检查前先掷（RNG 流对齐）
      if (!this.moonBossCap) {
        if (num45 === 0) return 345;   // 冰雪女王
        if (num45 === 1) return 346;   // 圣诞坦克
        return 344;                    // 常世吼
      }
      return 0;
    }
    if (wave >= 19) {
      if (N(10) && C(345) < 4) return 345;
      if (N(10) && C(346) < 5) return 346;
      if (N(10) && C(344) < 7) return 344;
      return 343;                      // 雪怪兜底
    }
    if (wave >= 18) {
      if (N(10) && C(345) < 3) return 345;
      if (N(10) && C(346) < 4) return 346;
      if (N(10) && C(344) < 6) return 344;
      if (N(3)) return 348;            // 胡桃夹子
      if (N(3)) return 351;            // 坎卜斯
      return 343;
    }
    if (wave >= 17) {
      if (N(10) && C(345) < 2) return 345;
      if (N(10) && C(346) < 3) return 346;
      if (N(10) && C(344) < 5) return 344;
      if (N(4)) return 347;            // 玩具直升机
      if (N(2)) return 351;
      return 343;
    }
    if (wave >= 16) {
      if (N(10) && C(345) < 2) return 345;
      if (N(10) && C(346) < 2) return 346;
      if (N(10) && C(344) < 4) return 344;
      if (N(2)) return 352;            // 弗洛科
      return 343;
    }
    if (wave >= 15) {
      if (N(10) && C(345) < 1) return 345;
      if (N(10) && C(346) < 2) return 346;
      if (N(10) && C(344) < 3) return 344;
      if (N(3)) return 347;
      return 343;
    }
    switch (wave) {
      case 14:
        if (N(10) && C(345) < 1) return 345;
        if (N(10) && C(346) < 1) return 346;
        if (N(10) && C(344) < 1) return 344;
        if (N(3)) return 343;
        return 0;   // 原版 case 14 无 else 兜底：全落空即空刷（勿修）
      case 13:
        if (N(10) && C(345) < 1) return 345;
        if (N(10) && C(346) < 1) return 346;
        if (N(3)) return 352;
        if (N(6)) return 343;
        if (N(3)) return 342;
        return 347;
      case 12:
        if (N(10) && C(345) < 1) return 345;
        if (N(10) && C(344) < 1) return 344;
        if (N(8)) return 343;
        if (N(3)) return 342;
        return rng.int(338, 340);       // Main.rand.Next(338,341)
      case 11:
        if (N(10) && C(345) < 1) return 345;
        if (N(6)) return 352;
        if (N(2)) return 342;
        return rng.int(338, 340);
      case 10:
        if (N(10) && C(346) < 1) return 346;
        if (N(10) && C(344) < 2) return 344;
        if (N(6)) return 351;
        if (N(3)) return 348;
        if (N(3)) return 347;
        return rng.int(338, 340);
      case 9:
        if (N(10) && C(346) < 1) return 346;
        if (N(10) && C(344) < 1) return 344;
        if (N(2)) return 348;
        if (N(3)) return 347;
        return 342;
      case 8:
        if (N(10) && C(346) < 1) return 346;
        if (N(8)) return 351;
        if (N(3)) return 348;
        if (N(3)) return 347;
        return 350;                     // 精灵弓手
      case 7:
        if (N(10) && C(346) < 1) return 346;
        if (N(3)) return 342;
        if (N(4)) return 350;
        return rng.int(338, 340);
      case 6:
        if (N(10) && C(344) < 2) return 344;
        if (N(4)) return 347;
        if (N(2)) return 348;
        return 350;
      case 5:
        if (N(10) && C(344) < 1) return 344;
        if (N(4)) return 350;
        if (N(8)) return 348;
        return rng.int(338, 340);
      case 4:
        if (N(10) && C(344) < 1) return 344;
        if (N(4)) return 350;
        if (N(3)) return 342;
        return rng.int(338, 340);
      case 3:
        if (N(8)) return 348;
        if (N(4)) return 350;
        if (N(3)) return 342;
        return rng.int(338, 340);
      case 2:
        if (N(3)) return 350;
        return rng.int(338, 340);
      default:                           // wave 1
        if (N(3)) return 342;            // 姜饼人
        return rng.int(338, 340);        // 精灵僵尸
    }
  }

  /** 南瓜月选怪：返回 netId；0 = 本帧不刷（19 波 bossCap 占满后可能空刷，原版行为勿修）。
   *  注意 wave 15-18 首支是独立 if（原版命中后仍会落入后续 else-if 链再判一次；
   *  单返回值实现取首个命中即返回，语义等价） */
  private pickPumpkinMoonSpawn(wave: number, rng: RNG): number {
    const N = (n: number) => rng.next() < 1 / n;
    const C = (id: number) => this.moonCount(id);
    if (wave >= 20) {
      if (!this.moonBossCap) {
        if (N(2) && C(327) < 2) return 327;                 // 南瓜王
        if (rng.next() >= 1 / 3 && C(325) < 2) return 325;  // Next(3)!=0 → 悲木
        if (C(315) < 3) return 315;                          // 无头骑士
      }
      return 0;
    }
    switch (wave) {
      case 19:
        if (N(5) && C(327) < 2) return 327;
        if (N(5) && C(325) < 2) return 325;
        if (!this.moonBossCap && C(315) < 5) return 315;
        return 0;   // 原版 case 19 无 else：三支全落空即空刷（勿修）
      case 18:
        if (N(7) && C(327) < 2) return 327;
        if (N(7) && C(325) < 2) return 325;
        if (N(7) && C(315) < 3) return 315;
        return 330;                      // 胡闹鬼
      case 17:
        if (N(7) && C(327) < 2) return 327;
        if (N(7) && C(325) < 2) return 325;
        if (N(7) && C(315) < 2) return 315;
        if (N(3)) return 330;
        return 329;                      // 地狱犬
      case 16:
        if (N(10) && C(327) < 2) return 327;
        if (N(10) && C(315) < 2) return 315;
        if (N(6)) return 330;
        if (N(3)) return 329;
        return 326;                      // 树怪
      case 15:
        if (N(10) && C(327) < 1) return 327;
        if (N(7) && C(325) < 2) return 325;
        if (N(5)) return 330;
        if (N(3)) return 326;
        return rng.int(305, 314);        // 稻草人 Next(305,315)
      case 14:
        if (N(10) && C(327) < 1) return 327;
        if (N(7) && C(325) < 2) return 325;
        if (N(10) && C(315) < 1) return 315;
        if (N(10)) return 330;
        if (N(7)) return 329;
        if (N(3)) return 326;
        return rng.int(305, 314);
      case 13:
        if (N(7) && C(325) < 2) return 325;
        if (N(10) && C(315) < 2) return 315;
        if (N(6)) return 330;
        if (N(3)) return 329;
        return 326;
      case 12:
        if (N(5) && C(327) < 1) return 327;
        return 330;
      case 11:
        if (N(7) && C(325) < 2) return 325;
        if (N(3)) return 330;
        return 326;
      case 10:
        if (N(10) && C(327) < 1) return 327;
        if (N(3)) return 329;
        return rng.int(305, 314);
      case 9:
        if (N(10) && C(325) < 2) return 325;
        if (N(8)) return 330;
        if (N(5)) return 329;
        if (N(2)) return 326;
        return rng.int(305, 314);
      case 8:
        if (N(8) && C(315) < 2) return 315;
        if (N(4)) return 330;
        return 329;
      case 7:
        if (N(7) && C(325) < 2) return 325;
        if (N(4)) return 330;
        return 329;
      case 6:
        if (N(7) && C(325) < 2) return 325;
        if (N(2)) return 326;
        return rng.int(305, 314);
      case 5:
        if (N(10) && C(315) < 1) return 315;
        return 329;
      case 4:
        // 原版怪癖（NPC.cs:3421）：判定是 !AnyNPCs(325)（悲木唯一）却刷 330（胡闹鬼）
        // ——疑似复制粘贴笔误，照抄源码不"修"
        if (N(8) && C(325) < 1) return 330;
        if (N(2)) return 326;
        return rng.int(305, 314);
      case 3:
        if (N(3)) return 329;
        return 326;
      case 2:
        if (N(3)) return 326;
        return rng.int(305, 314);
      default:                           // wave 1
        return rng.int(305, 314);        // 稻草人
    }
  }

  // ---- SpawnAnNPC（L1186-5144）——肉前分支 1:1，hardMode 分支保留 ----
  private spawnAnNPC(rng: RNG): Enemy | null {
    const st = this.world.store;
    const x = this.spawnTileX * TILE + 8;
    const y = this.spawnTileY * TILE;
    const N = (n: number) => rng.next() < 1 / n;  // Main.rand.Next(n)==0
    const hardMode = this.hardMode;
    const t = this.spawnTileType;
    // SetSpawnFlags L709：日食白天关闭小动物段（(!eclipse || !dayTime) 门）——
    // 小动物块（下方 gem 支 + 地表森林块）须跳过
    const friendlyBlocked = this.world.clock.eclipse && this.dayTime;
    const D = (id: number) => this.spawnNPC(x, y, id, rng);
    const any = (id: number) => this.activeIds.has(id);
    // GetZombieSettings（L1193 调用，L5501：Next(7)）——地表夜最终僵尸 style，
    // 原版在函数入口 roll（此处同位置，保持后续 RNG 流顺序一致）
    this.zombieStyle = rng.int(0, 6);
    // GetZombieSettings L5499-5514：torchZombieChance 基础 12；
    //  playerHasStartingHealth（L327：statLifeMax ≤ 100）→ 5 − numberOfActivePlayers/2
    //  （下限 2；活跃玩家数未跟踪 → 单人取 1）。skyblock 的 spawnArmedZombies=false
    //  只影响 591 持械变体，不影响本概率门
    this.torchZombieChance = this.playerLifeMax > 0 && this.playerLifeMax <= 100
      ? Math.max(2, 5 - Math.floor(1 / 2)) : 12;

    // ---- 星璇塔 Zone（NPC.cs:1204-1289：SpawnAnNPC 链**第一**分支——原版先于
    //  天空怪/入侵/月事件段；逐塔 SelectRandom 权重表 + CountNPCS 上限重掷，1:1）----
    if (this.lunar) {
      const z = this.lunar.zone;
      const C = (id: number) => this.lunar!.counts.get(id) ?? 0;
      const pick = (arr: number[]) => arr[rng.int(0, arr.length - 1)];   // Utils.SelectRandom
      if (z.nebula) {
        // 星云（L1204-1229）：424×3/423×3/421×3/420×2；上限 424<3、423<3、420<3（421 无上限）
        let id = 0;
        for (;;) {
          id = pick([424, 424, 424, 423, 423, 423, 421, 421, 421, 420, 420]);
          if (id === 424 && C(424) >= 3) continue;
          if (id === 423 && C(423) >= 3) continue;
          if (id === 420 && C(420) >= 3) continue;
          break;
        }
        if (id !== 0) return D(id);
      } else if (z.vortex) {
        // 星旋（L1230-1255）：429×4/427×2/425×2/426×1；上限 425<3、426<3、429<4
        let id = 0;
        for (;;) {
          id = pick([429, 429, 429, 429, 427, 427, 425, 425, 426]);
          if (id === 425 && C(425) >= 3) continue;
          if (id === 426 && C(426) >= 3) continue;
          if (id === 429 && C(429) >= 4) continue;
          break;
        }
        if (id !== 0) return D(id);
      } else if (z.stardust) {
        // 星尘（L1256-1263）：411×3/409×2/407/402/405 各 1，无上限
        return D(pick([411, 411, 411, 409, 409, 407, 402, 405]));
      } else if (z.solar) {
        // 日耀（L1264-1289）：518/419/418/412/417/416/415 各 1；掷中 418 再 1/2 重选
        //  {415,416,419,417}；上限 518<2、412<1（千足蜈蚣场内唯一）
        let id = 0;
        for (;;) {
          id = pick([518, 419, 418, 412, 417, 416, 415]);
          if (id === 418 && rng.int(0, 1) === 0) id = pick([415, 416, 419, 417]);
          if (id === 518 && C(518) >= 2) continue;
          if (id === 412 && C(412) >= 1) continue;
          break;
        }
        if (id !== 0) return D(id);
      }
    }

    // ---- 天空怪（原版 NPC.cs:1290-1331：else-if 链最前、invaders 之前——
    //  skyMob 优先于入侵分支；肉前 = 兜底鸟妖 48，困难 = 1/10 飞龙 87（场内唯一））----
    if (this.skyMob) {
      // 火星入侵期间天空怪位出无人机（L1295-1297：invaders && invasionType==4 → 388）
      if (this.invaders && this.world.invasionType === 4) return D(388);
      // 火星探测器 399（L1302-1305）：困难+已败石巨人,首次未败火星 1/8 否则 1/30,
      // 场上无 399;flag5 的 skyBehindPlayer/AnyDanger 上下文本仓未跟踪,以 skyMob+带外
      // 距中央 >1/3 近似（探测器本就只在高空两侧刷出）
      if (hardMode && this.world.flags['downed_245'] && !any(399)
        && Math.abs(this.spawnTileX - this.world.store.w / 2) / (this.world.store.w / 2) > 0.33
        && (N(this.world.flags['downedMartians'] ? 30 : 8) || N(30))) {
        return D(399);
      }
      if (hardMode && !any(87) && N(10)) return D(87);
      return D(48);
    }
    // ---- 入侵分支（L1333-1401：else if (invaders)，与普通链互斥）----
    if (this.invaders) {
      const it = this.world.invasionType;
      if (it === 1) {
        // 哥布林（L1335-1360）：召唤师(1/30,困难,唯一)→法师→小兵→弓手→盗贼→兜底战士
        if (hardMode && !any(471) && N(30)) return D(471);
        if (N(9)) return D(29);
        if (N(5)) return D(26);
        if (N(3)) return D(111);
        if (N(3)) return D(27);
        return D(28);
      }
      if (it === 2) {
        // 雪人军团（L1362-1372）：雪球怪 1/7 → 黑帮雪人 1/3 → 兜底 刺客雪人
        if (N(7)) return D(145);
        if (N(3)) return D(143);
        return D(144);
      }
      if (it === 3) {
        // 海盗（L1377-1401；491 飞船为多部件飞行体暂缺，跳过其分支）：
        // 船长(1/30,唯一)→弩手→鹦鹉→神枪手→海盗→兜底 甲板水手
        if (N(30) && !any(216)) return D(216);
        if (N(11)) return D(215);
        if (N(9)) return D(252);
        if (N(7)) return D(214);
        if (N(3)) return D(213);
        return D(212);
      }
      if (it === 4) {
        // 火星疯狂（L1408-1463）。flag6 = 进度≥30% 且场上无飞碟（1/45 或高档位 1/20 出 395）;
        // num7=Next(7): ≥6 → 骑手 390/工程师 386 二选;≥4 → 炮手 382×2/无人机 388/扰脑者 381;
        // <4 → 灰兵 385/电侠 389/军官 383,3/4 概率出火星行者 520（场上唯一,否则重掷）
        const prog = (this.world.invasionSizeStart - this.world.invasionSize)
          / (this.world.invasionSizeStart || 1);
        const saucerOk = prog >= 0.3 && !any(395);
        const num7 = rng.int(0, 6);
        if (N(45) && saucerOk) return D(395);
        if (num7 >= 6) {
          if (N(20) && saucerOk) return D(395);
          return D(rng.int(0, 1) === 0 ? 390 : 386);
        }
        if (num7 >= 4) {
          const r9 = rng.int(0, 4);
          return D(r9 < 2 ? 382 : r9 >= 4 ? 388 : 381);
        }
        let r10 = rng.int(0, 3);
        if (r10 === 3) {
          if (!any(520)) return D(520);
          r10 = rng.int(0, 2);
        }
        return D(r10 === 0 ? 385 : r10 === 1 ? 389 : 383);
      }
    }

    // ---- 蜘蛛巢（L1569-1587）：落点墙 62 或 spawnSpider 旗标 ----
    const wall = st.wall[st.idx(this.spawnTileX, this.spawnTileY)];
    if (wall === 62 || this.spawnSpider) {
      // 造型师 354（1/8,岩石层深处+场内无 354）：解绑城镇 NPC 救援链路,注释保留
      if (this.hardMode && !N(10)) return D(163);  // hardMode 9/10 黑寡妇(L1577)
      return D(164);                               // 爬墙者
    }
    // ---- 地下沙漠（L1589-1672）----
    if (this.spawnUndergroundDesert) {
      if (N(15)) return D(537);
      const r = rng.next();
      if (r < 0.5) return D(580);
      if (r < 0.9) return D(581);
      return D(69);
    }
    // ---- 硬模式群系水面（:1673-1683,地下沙漠块尾 else-if 链;pre-hardmode 恒跳过）----
    //  丛林水 2/3 → 巨骨舌鱼 157(Arapaima);猩红水 2/3 → 242/241(毒骨鱼/血浆渗透者)
    //  ★此前未移植:困难模式丛林湖泊只有食人鱼/垂钓者兜底,原版主体是巨骨舌鱼
    if (hardMode && this.waterTile && this.ZoneJungle && !N(3)) return D(157);
    if (hardMode && this.waterTile && this.ZoneCrimson) {
      if (!N(3)) return D(242);
      if (!N(3)) return D(241);
    }
    // ---- 海洋（L1705-1834）----
    // 门（L1705）：(!spawnFriendly || (!savedAngler && !AnyNPCs(376))) && waterTile && isOcean。
    //  spawnFriendly（Spawner 字段 L71）：SetSpawnFlags L714-828 内**概率 roll** 的
    //  "友好刷怪位"——玩家近旁有 ≥1 名城镇 NPC 时按 1/10~1/3 概率置 true 并减
    //  maxSpawns（该帧只刷小动物）。本仓该 roll 未实装 → 恒 false（门恒放行）。
    //  savedAngler（NPC.savedAngler 静态）：由 AI_007_TownEntities_UpdateSavedStates
    //  （NPC.cs:53337-53361 case 369）在渔夫 369 城镇化运行 AI 时置位；本仓渔夫
    //  救援链未实装（376 睡渔夫可由本段刷出，但无 376→369 转换、flags 亦无
    //  savedAngler 位）→ 恒 false。AnyNPCs(376) 用 activeIds 现查
    if (this.waterTile && this.isOcean && !any(376)) {
      // 渔夫 376（L1708-1728）：表层水（spawnTileY < worldSurface-10）→ 向上 50 格
      //  找干隙线 num15 → 抬到该线落点；!xRange 才出（L1723）
      let angler: Enemy | null = null;
      if (!any(376) && this.spawnTileY < this.world.groundLevel - 10) {
        const num15 = this.findDryGapY(this.spawnTileY);
        if (num15 > 0 && !this.xRange) angler = this.spawnNPC(x, num15 * TILE, 376, rng);
      }
      // L1729-1732：出了渔夫或落点在玩家横向 safe 范围内 → 直接返回
      if (angler || this.xRange) return angler;
      // 水面线 num17 / 岸上净空位 num18（L1733-1761，仅 spawnTileY<worldSurface 且 >50）
      let num17 = -1, num18 = -1;
      if (this.spawnTileY < this.world.groundLevel && this.spawnTileY > 50) {
        for (let y2 = this.spawnTileY - 1; y2 > this.spawnTileY - 50; y2--) {
          if (st.liquid[st.idx(this.spawnTileX, y2)] === 0
            && !st.isSolid(this.spawnTileX, y2) && !st.isSolid(this.spawnTileX, y2 + 1)
            && !st.isSolid(this.spawnTileX, y2 + 2)) {
            num17 = y2 + 2;
            // L1742-1745：num17 下两格净空且 num17+2 墙非房屋墙 → 岸上落点 num18
            if (!st.isSolid(this.spawnTileX, num17 + 1) && !st.isSolid(this.spawnTileX, num17 + 2)
              && !WALL_HOUSE.has(st.wall[st.idx(this.spawnTileX, num17 + 2)])) num18 = num17 + 2;
            // L1746-1749：num17 自身在房屋墙内 → 作废水面线
            if (WALL_HOUSE.has(st.wall[st.idx(this.spawnTileX, num17)])) num17 = -1;
            break;
          }
        }
        if (num17 > this.spawnTileY) num17 = this.spawnTileY;   // L1753-1756
        if (num18 > this.spawnTileY) num18 = this.spawnTileY;   // L1757-1760
      }
      // 海鸥 602（L1762-1765）：干隙线存在 + !xRange + 1/10 → 落在水面线 num17
      if (num17 > 0 && !this.xRange && N(10)) return this.spawnNPC(x, num17 * TILE, 602, rng);
      // 鲨鱼 65（L1766-1769）：1/SharkSpawnChance。原版 SharkSpawnChance（L5458-5475）
      //  基础 10，落点水面上方可命中弹体 820（血腥诱饵 Chum，Chum Caster 鱼竿施放）时降为 2。
      //  依赖链未实装：items.ts 无 Chum 物品注册、无弹体 820 → 恒 10（依赖：
      //  Chum Bucket/Chum Caster 物品 + 鱼竿弹体系统）
      const sharkChance = 10;
      if (N(sharkChance)) return D(65);
      // 鲨鱼龙 692（L1770-1773，困难）：json 已有条目（1:1 虎鲸属性，aiStyle 16 游泳族）
      if (hardMode && N(sharkChance)) return D(692);
      // 海洋小动物（L1774-1817）：1/10 门 → Next(4) 四选
      if (N(10)) {
        const num20 = rng.int(0, 3);   // Main.rand.Next(4)
        if (num20 === 0 && num17 > 0) return this.spawnNPC(x, num17 * TILE, 625, rng);  // 海龟
        if (num20 === 1 && num18 > 0) return this.spawnNPC(x, num18 * TILE, 615, rng);  // 海豚
        if (num20 === 2) {   // 海马（L1789-1805）：金 1/goldCritterChance(400, NPC.cs:5976)
          const num22 = num18 > 0 ? num18 : this.spawnTileY;
          return this.spawnNPC(x, num22 * TILE, N(400) ? 627 : 626, rng);
        }
        if (num20 === 3) {   // 河豚（L1806-1815）
          const num21 = num18 > 0 ? num18 : this.spawnTileY;
          return this.spawnNPC(x, num21 * TILE, 688, rng);
        }
        return null;   // case0/1 落点条件不满足 → 原版 switch 空过不生成
      }
      if (N(40)) return D(220);   // 海蜗牛（L1818-1821）
      if (N(18)) return D(221);   // 鱿鱼（L1822-1825）
      if (N(3)) return D(67);     // 螃蟹（L1826-1829）
      return D(64);               // 粉水母兜底（L1830-1833）
    }
    // ---- 墓地雕像宝箱怪（NPC.cs:1478，原版链位在入侵段之后、水池段之前）----
    //  downedBoss3 && ZoneGraveyard && !noWorms && RollBadLuckExtreme(25) && 场上无 690
    //  && IsThisAGoodPlaceForAStatueMimic（:43751 = 落脚 2 格实心 + 上方 3 格净空，与
    //  邻近是否有雕像无关——名字只是历史）。该支不受 spawnFriendly 门（同链更早的
    //  兄弟分支），友好轮也可命中。690 immortal+aiStyle126（伪装雕像待敌靠近）
    if (this.downedBoss3 && this.ZoneGraveyard && !this.noWorms && N(25) && !any(690)
      && this.isGoodPlaceForAStatueMimic()) {
      return D(690);
    }
    // ---- 水池段（L1839-1905）----
    //  两支 else-if（原版 L1839 / L1895,均带 !spawnFriendly 门）;友好轮落 SpawnAnNPC
    //  :2006 的 spawnFriendly 段(水中小动物 :2136+),本仓该段走水中小动物近似于 A 段内
    if (this.waterTile && !this.isOcean && !this.spawnFriendlyCycle) {
      // 门 A（L1839）：!spawnFriendly && waterTile && ((deeperThanRockLayer && 1/2) || 丛林草 60)
      if ((this.deeperThanRockLayer && N(2)) || t === T.JUNGLE_GRASS) {
        let flag9 = false;
        // L1842：丛林草 + 表层 + y>50 + 1/3 + 白天 → 水面线小动物
        if (t === T.JUNGLE_GRASS && this.surfaceSpawn && this.spawnTileY > 50 && N(3) && this.dayTime) {
          const num23 = this.findDryGapY(this.spawnTileY);
          if (num23 > 0 && !this.xRange) {   // L1857
            flag9 = true;
            // 丛林龟 617（L1860-1864）：1/4
            if (N(4)) return this.spawnNPC(x, num23 * TILE, 617, rng);
            // 水黾群（L1865-1880）：无风（flag = |windSpeedTarget|>0.45, L1201）且非雨天
            //  → Next(1,4) 只、x 抖 ±16px、落 num23 上一格；金水黾 1/400
            //  spawner 单返回值 API 只能交付 1 只，其余丢弃（原版成群 1-3 只）
            const windy = Math.abs(this.world.weather.windSpeedTarget) > 0.45;
            const raining = this.world.weather.raining;
            if (!windy && !raining) {
              flag9 = true;
              const num25 = rng.int(1, 3);   // Main.rand.Next(1,4)
              const jx = x + rng.int(-16, 16);
              return this.spawnNPC(jx, num23 * TILE - TILE, N(400) ? 613 : 612, rng);
            }
          }
        }
        if (!flag9) {
          // L1883-1893：琵琶鱼（困难 Next(3)>0 = 2/3）/ 食人鱼兜底
          if (hardMode && rng.next() < 2 / 3) return D(102);
          return D(58);
        }
        return null;   // flag9 已置但雨天/有风未生成（L1883 守卫）→ 原版本帧不出怪
      }
      // 门 B（L1895）：!spawnFriendly && waterTile && spawnTileY>worldSurface && 1/3
      //  → 绿水母（困难 2/3）/ 蓝水母 63
      if (this.spawnTileY > this.world.groundLevel && N(3)) {
        if (hardMode && rng.next() < 2 / 3) return D(103);
        return D(63);
      }
      // A/B 均未命中 → 原版落入 L1906+ 腐化/猩红水段（非本段范围），交回主链
    }
    // ---- 墓地友好轮（SpawnAnNPC :2008-2014，spawnFriendly 段首支）----
    //  ZoneGraveyard 时友好轮恒走本支：非水域 50/50 蛆 606 / 鼠 610，水域直接空过——
    //  不受昼夜门限制（原版本支无 dayTime 条件），也不落后续小动物链
    if (this.spawnFriendlyCycle && this.ZoneGraveyard) {
      if (!this.waterTile) return D(N(2) ? 610 : 606);
      return null;
    }
    // ---- 雨天深层宝石松鼠/兔（NPC.cs:2289-2296，case 2/109/477/492 雨分支首两支）----
    //  门：raining && spawnTileY <= UnderworldLayer && deeperThanRockLayer，各 1/5；
    //  未命中则原版继续雨块尾段（金蚯蚓/蚯蚓/上岸金鱼——本仓雨块仅地表简化版，深处放行
    //  落后续洞穴段）。宝石档位按 GetGemSquirrel/BunnyToSpawn 权重表 roll，
    //  与落点附近是否有宝石 tile 无关（原版即如此）。
    //  tile 门 = case 2/109/477/492 或地下任意（default: y>worldSurface → goto case 2）；
    //  147/161/60/53 走各自 switch case（雪原/丛林蛙/沙地小动物），须排除
    const gemTileOK = !(t === T.JUNGLE_GRASS || t === T.SNOW || t === T.ICE || t === T.SAND);
    if (this.spawnFriendlyCycle && this.dayTime && !this.waterTile && this.world.weather.raining && gemTileOK
      && !friendlyBlocked
      && this.deeperThanRockLayer && this.spawnTileY <= st.h - 200) {
      if (N(5)) return D(this.getGemSquirrelToSpawn(rng));
      if (N(5)) return D(this.getGemBunnyToSpawn(rng));
    }
    // ---- 小动物（spawnFriendly 段 L2006-2535，白天 + 草/土 tile + Next(15) 门）----
    //  日食白天小动物段整体关闭（L709 门，friendlyBlocked）
    if (this.spawnFriendlyCycle && this.dayTime && !this.waterTile && this.surfaceSpawn && !friendlyBlocked &&
      (t === T.GRASS || t === T.DIRT || t === T.SNOW || t === T.SNOW_BRICK || t === 477)) {
      if (N(15)) {
        if (t === T.SNOW || t === T.SNOW_BRICK) {
          // 雪原小动物（L148→148|149 Next(2)）
          if (N(2)) return D(148);
          return D(149);
        }
        // 瓢虫 604/605（cs:2413-2445）：起风日（TooWindyForButterflies=|windSpeedTarget|
        // ≥0.4，NPC.cs:6801）替换蝴蝶段——仅草族 tile（case 2/109/477/492）。
        // butterflyChance 动态值 1..20（4/5 启用、1/5 关闭，cs:94582-94599），原版
        // 门 Next(butterflyChance/2) 取期望 ≈ 1/5；金瓢虫 RollLuck(goldCritterChance)
        // =1/400（luck 修正走 N(400)）。原版成群 1-4 只，本仓单只（API 限制同蜻蜓段）
        if ((t === T.GRASS || t === 477)
          && Math.abs(this.world.weather.windSpeedTarget) >= 0.4
          && !this.world.weather.raining && N(5)) {
          return D(N(400) ? 605 : 604);
        }
        // 森林小动物概率表（原版 butterflyChance/stinkBugChance 动态值，取代表值）
        const r = rng.next();
        if (r < 0.2) return D(357);       // 蚯蚓
        if (r < 0.45) return D(377);      // 蚱蜢
        if (r < 0.65) return D(46);       // 兔子
        if (r < 0.8) return D(299);       // 松鼠
        if (r < 0.9) return D(300);       // 老鼠
        return D(74);                     // 鸟
      }
    }
    // ---- 洞穴层宝石松鼠/兔（NPC.cs:2456-2531 case 2 尾段：flag11 = rockLayer ≤ y ≤ UnderworldLayer）----
    //  Next(3)==0 → 1/5 宝石松鼠；否则 1/5 宝石兔（合计 1/15 + 2/15 ≈ 1/5）；
    //  未命中则原版 switch 空过、落后续 else-if 链（地牢/陨石…），此处同序放行。
    //  tile 门同雨天支（case 2/default-underground；147/161/60/53 各有独立 case 须排除）。
    //  （原版该块外层为 spawnFriendly 小动物段；本仓小动物沿用 dayTime 简化门）
    if (this.spawnFriendlyCycle && this.dayTime && !this.waterTile && !this.surfaceSpawn && gemTileOK && !friendlyBlocked
      && this.spawnTileY >= this.world.rockLevel && this.spawnTileY <= st.h - 200) {
      if (N(3)) {
        if (N(5)) return D(this.getGemSquirrelToSpawn(rng));
      } else if (N(5)) {
        return D(this.getGemBunnyToSpawn(rng));
      }
    }
    // 友好轮守卫（SpawnAnNPC :2006 else-if 链语义）：friendly 轮只可能出小动物,
    // 前面各友好分支未命中(落点 tile 不合) → 本轮空过,绝不落入后续敌怪链
    if (this.spawnFriendlyCycle) return null;
    // ---- 地牢（L2536-2706：CheckToSpawnDungeonEnemies = ZoneDungeon 且玩家在 dungeonY+40 以下）----
    {
      const dungeonY = this.world.dungeonY || Math.floor(this.world.groundLevel);
      if (this.ZoneDungeon && !(this.pY < dungeonY + 40)) {
        // 墙变体（L2540-2552）：94/96/98→1、95/97/99→2；RollLuck(7) 重掷（0.9 尺度下 1/7≈1/7）
        const wallA = st.wall[st.idx(this.spawnTileX, this.spawnTileY)];
        const wallB = st.wall[st.idx(this.spawnTileX, this.spawnTileY - 1)];
        let variant = 0;
        if (wallA === 94 || wallA === 96 || wallA === 98 || wallB === 94 || wallB === 96 || wallB === 98) variant = 1;
        if (wallA === 95 || wallA === 97 || wallA === 99 || wallB === 95 || wallB === 97 || wallB === 99) variant = 2;
        if (N(7)) variant = rng.int(0, 3);
        // 未杀骷髅王（flag12）→ 地牢守卫 68（9999 伤，1:1 原版劝退机制）
        if (!this.downedBoss3) return D(68);
        // L2562 机械师(123)：1/5，未救出+场内唯一+深层门（(ws*4+rl)/5）
        const hardDungeon = this.hardMode && !!this.world.flags['downed_262']; // downedPlantBoss（世花 262，Game 击杀通用置位链 downed_{id}）
        if (this.downedBoss3 && N(5) && !this.waterTile && !any(123)
          && this.spawnTileY > (this.world.groundLevel * 4 + this.world.rockLevel) / 5) {
          return D(123);
        }
        // L2570-2585 hardDungeon（hardMode && downedPlantBoss）：1/30 技师 287 + 各墙变体 1/15
        if (hardDungeon && N(30)) return D(287);
        if (hardDungeon && variant === 0 && N(15)) return D(293);
        if (hardDungeon && variant === 1 && N(15)) return D(291);
        if (hardDungeon && variant === 2 && N(15)) return D(292);
        if (N(35)) return D(71);   // 地牢史莱姆
        if (variant === 1 && N(3)) return D(70);   // 火轮
        if (variant === 2 && N(5)) return D(72);   // 刺球
        if (variant === 0 && N(7)) return D(34);   // 诅咒头骨
        if (N(7)) return D(32);    // 黑魔法师
        // 书架书怪 693/694（AI_FindNearbyBook）：书架实体系统未实现，暂缺
        const av = rng.int(0, 5);
        if (av === 0) return D(294);
        if (av === 1) return D(295);
        if (av === 2) return D(296);
        if (N(4)) return D(-14);   // Big Boned
        if (N(5)) return D(-13);   // Short Bones
        return D(31);              // 愤怒骨怪
      }
    }
    // ---- 陨石带（L2704：else if (ZoneMeteor)）----
    //  ZoneMeteor = 玩家窗口内陨石 tile ≥75（SceneMetrics.cs:56 MeteorTileThreshold）→ 陨石头 23
    if (this.ZoneMeteor) return D(23);
    // ---- 月事件（NPC.cs:2714-3455：霜月在先、南瓜月在后，均位于陨石段之后、日食段之前）----
    //  门 = (spawnTileY <= worldSurface || remix) && !dayTime && 事件开启（remixWorld 省略）
    if (this.moonEvent && this.spawnTileY <= this.world.groundLevel && !this.dayTime) {
      const pick = this.moonEvent.kind === MOON_KIND_FROST
        ? this.pickFrostMoonSpawn(this.moonEvent.wave, rng)
        : this.pickPumpkinMoonSpawn(this.moonEvent.wave, rng);
      if (pick !== 0) return D(pick);
      return null;   // 波内全部分支落空（霜月 14 波 / 南瓜 19 波 bossCap 后）= 原版空过
    }
    // ---- 日食（NPC.cs:3459-3525：地表 && dayTime && eclipse——1.4.5.6 重做后的全表）----
    //  门 = spawnTileY <= worldSurface（remix 深层支省略）&& 白天 && eclipse；
    //  flag14 = 三机械全杀（downedMechBoss1/2/3 = 134 / 125|126 / 127）
    if (this.surfaceSpawn && this.dayTime && this.world.clock.eclipse) {
      const f = this.world.flags;
      const downedPlant = !!f['downed_262'];   // downedPlantBoss（世花 262）
      const flag14 = !!(f['downed_134'] && (f['downed_125'] || f['downed_126']) && f['downed_127']);
      let cnt467 = 0; for (const id of this.activeIds) if (id === 467) cnt467++;
      if (downedPlant && N(80) && !any(477)) return D(477);    // 飞蛾魔 Mothron（唯一）
      if (N(50) && !any(251)) return D(251);                   // 独眼怪 Eyezor（唯一）
      if (downedPlant && N(5) && !any(466)) return D(466);     // 精神病人 Psycho（唯一）
      if (downedPlant && N(20) && !any(463)) return D(463);    // 钉头 Nailhead（唯一）
      if (downedPlant && N(20) && cnt467 < 2) return D(467);   // 致命球 Deadly Sphere（≤2）
      if (N(15)) return D(159);                                // 吸血鬼 Vampire
      if (flag14 && N(13)) return D(253);                      // 死神 Reaper（需三机械全杀）
      if (N(8)) return D(469);                                 // 被附身者 The Possessed
      if (downedPlant && N(7)) return D(468);                  // 蝇博士 Dr. Man Fly
      if (downedPlant && N(5)) return D(460);                  // 屠夫 Butcher
      if (N(4)) return D(162);                                 // 科学怪人 Frankenstein
      if (N(3)) return D(461);                                 // 深海怪形 Creature from the Deep
      if (N(2)) return D(462);                                 // 弗里茨 Fritz
      return D(166);                                           // 沼泽怪 Swamp Thing（兜底）
    }
    // ---- 蘑菇地（L3540-3610，tile 70）----
    if (t === T.MUSHROOM_GRASS) {
      if (this.surfaceSpawn) {
        if (N(3)) {
          if (N(4)) return D(259);
          return D(257);
        }
        return D(254);
      }
      // L3581：洞穴级蘑菇草是**困难模式专属段**（70 && hard && y≥worldSurface &&
      //  Next(3)!=0 → 真菌族 374/360/259/260/257/258）。肉前须穿透本段落入洞穴
      //  主池/兜底段，由 L5010/5109 的 ZoneGlowshroom 门出 635/634——此前缺
      //  hardMode 门，肉前也被截断（635/634 因此永不可达）
      if (hardMode && N(3)) {
        if (N(8)) return D(360);
        if (N(4)) return D(259);
        return D(257);
      }
    }
    // ---- 洞穴稀有怪/小动物（L3644-3719；原版位于蘑菇地之后、丛林草之前）----
    //  RollLuck(n)≈Next(n)（玩家幸运度未接入）；goldCritterChance=400
    // L3644：hard && y>worldSurface && RollLuck(75) → 群系稀有元素怪。
    //  473/474/475/476 与 629 在 vanilla-npcs.json 无条目（fromVanilla→null 静默丢弃），
    //  实际可达的只有兜底 85（hellstone turtle）；分支按原版顺序保留
    if (hardMode && this.spawnTileY > this.world.groundLevel && N(75)) {
      if (N(2) && this.ZoneCorrupt && !any(473)) return D(473);
      if (N(2) && this.ZoneCrimson && !any(474)) return D(474);
      if (N(2) && this.ZoneHallow && !any(475)) return D(475);
      if (N(2) && this.ZoneJungle && !any(476)) return D(476);   // 原版还要求 tenthAnniversaryWorld
      if (this.ZoneSnow) return D(629);
      return D(85);
    }
    // L3671：hard && 落脚墙 2（天然泥土墙）&& 1/20 → 85
    if (hardMode && wall === 2 && N(20)) return D(85);
    // L3676：hard && 地表 && 夜 && (1/20 或 满月 1/5) → 狼人 82
    if (hardMode && this.surfaceSpawn && !this.dayTime
      && (N(20) || (N(5) && this.world.clock.moonPhase === 4))) return D(82);
    // L3681：丛林草 && RollLuck(500) && 夜 → 骨头博士 52(稀有,jungle 金表前置)
    if (t === T.JUNGLE_GRASS && N(500) && !this.dayTime) return D(52);
    // L3688：丛林草 && y>worldSurface && 1/60 → 龟甲虫 219
    if (t === T.JUNGLE_GRASS && this.spawnTileY > this.world.groundLevel && N(60)) return D(219);
    // L3690-3719：洞穴白天小动物（earthworm/mouse/grasshopper 族），条件排除群系旗标。
    //  原版只看 Zone 旗标；直接调用 spawnAnNPC 的场景（测试/探针）旗标未刷新恒 false，
    //  丛林草等群系 tile 会误漏小动物 → 补 tile 级守卫（现实世界群系 tile 必在对应
    //  Zone 窗口内，行为与原版等价）
    const neutralCave = t !== T.JUNGLE_GRASS;
    const critGates = this.spawnTileY > this.world.groundLevel
      && !this.ZoneSnow && !this.ZoneCrimson && !this.ZoneCorrupt && !this.ZoneJungle && !this.ZoneHallow
      && neutralCave;
    if (critGates && this.spawnTileY < st.h - 210 && N(8)) return D(N(400) ? 448 : 357);
    if (critGates && this.spawnTileY < st.h - 210 && N(13)) return D(N(400) ? 447 : 300);
    if (neutralCave && this.spawnTileY > this.world.groundLevel
      && this.spawnTileY < (this.world.rockLevel + st.h) / 2
      && !this.ZoneSnow && !this.ZoneCrimson && !this.ZoneCorrupt && !this.ZoneHallow && N(13)) return D(359);
    // ---- 蜂巢墙 86（NPC.cs:3833-3835）：7/8 SpawnHornet ----
    if (wall === 86 && !N(8)) return this.spawnHornet(x, y, rng);
    // ---- 丛林草 tile 60（NPC.cs:3839-3856；旧实现误在肉前出 158 巨型蝙蝠，原版无此分支）----
    if (t === T.JUNGLE_GRASS) {
      const midY = (this.world.groundLevel + this.world.rockLevel) / 2;
      if (this.spawnTileY > midY) {
        // 深层丛林（原版 remix 分支省略）：1/4 棘刺丛林史莱姆 / 1/4 食人怪(锚点) / else 黄蜂族
        if (N(4)) return D(204);
        if (N(4)) return this.spawnNPC(x, y, 43, rng, this.spawnTileX, this.spawnTileY);
        return this.spawnHornet(x, y, rng);
      }
      // 浅层：1/4 丛林蝙蝠 / 1/8 魔腾怪(锚点)
      if (N(4)) return D(51);
      if (N(8)) return this.spawnNPC(x, y, 56, rng, this.spawnTileX, this.spawnTileY);
    }
    // ---- 沙尘暴怪池（NPC.cs:3859-3885：Happening && ZoneSandstorm && 沙格落脚）----
    //  肉前：1/2 雨蚁狮(546)，否则 1/2 秃鹫(61)，否则蚁狮(69)；
    //  困难：1/20 沙尘元素(541)（场上≤1），1/3 沙虫(510)（≤4 段），其余落常规池
    if (this.sandstormHappening && this.zoneSandstorm && (t === T.SAND || t === T.HARDENED_SAND || t === T.SANDSTONE)) {
      const any541 = (id: number) => [...this.activeIds].includes(id);
      if (!hardMode) {
        if (N(2)) return D(546);
        else if (N(2)) return D(61);
        else return D(69);
      } else {
        if (N(20) && !any541(541)) return D(541);
        // 沙虫 510 段数检查以 activeIds 近似（>4 不出）
        let seg510 = 0;
        for (const id of this.activeIds) if (id === 510) seg510++;
        if (seg510 < 4 && N(3)) return D(510);
      }
    }
    // ---- 沙漠地表（L3859-3928，沙尘暴外简化为沙漠 tile 段）----
    // 原版 L3859 沙地族 = 53 沙/112 黑檀沙/116 珍珠沙/234 猩红沙/397 硬化沙/396 沙岩/404 化石；
    // L4374：黄沙 && 1/5 && Spawning_SandstoneCheck（spawningSandstoneCheck :1887 已 1:1 接入，
    // 旧注"近似恒真"为过期残留）→ 蚁狮 69，否则秃鹫 61
    if (t === T.SAND || t === T.HARDENED_SAND || t === T.SANDSTONE || t === T.FOSSIL) {
      if (!hardMode) {
        // L4374：!waterTile && 黄沙 53 && 1/5 && Spawning_SandstoneCheck（落脚向下 8 行、
        //  每行 ±4 格沙族邻接计数 ≥40——蚁狮只出成片沙地；孤沙/硬化沙面计数不足 → 秃鹫）
        if (!this.waterTile && t === T.SAND && N(5)
          && this.spawningSandstoneCheck(this.spawnTileX, this.spawnTileY)) return D(69);   // 蚁狮
        return D(61);             // 秃鹫（地表沙）
      }
    }
    // ---- 神圣 tiles（L3940-3967，tile 116 珍珠沙/117 珍珠石/109 神圣草/164 粉冰）----
    //  L3940：hard && 珍珠沙 && 1/2 → Light Mummy 80
    if (hardMode && t === T.PEARLSAND && N(2)) return D(80);
    const hallowFloor = t === T.PEARLSAND || t === T.PEARLSTONE_BLOCK
      || t === T.HALLOW_GRASS || t === T.HOLLOW_ICE;
    // L3946：hard && underGround && !waterTile && 神圣 tile →
    //  雨天 Enchanted Nightcrawler 244（唯一）/ 夜 毒气鼻涕虫 122 / 1/10 妖精 86 /
    //  downedPlantBoss（=flags['downed_262']，Game 击杀通用置位链）→ 661 蝶 / 兜底 75
    if (hardMode && this.underGround && !this.waterTile && hallowFloor) {
      if (this.world.weather.raining && !any(244) && N(10)) return D(244);
      if (this.world.flags['downed_262'] && N(10)) return D(661);
      if (!this.dayTime && N(2)) return D(122);
      if (N(10)) return D(86);
      return D(75);
    }
    // L3962：hard && 1/50 && !waterTile && 岩石层下 && 神圣 tile → 神圣噬魂怪 84
    if (!this.noWorms && hardMode && N(50) && !this.waterTile && this.deeperThanRockLayer && hallowFloor) {
      return D(84);
    }
    // ---- 猩红（L3973-4031）----
    if (this.ZoneCrimson) {
      if (N(5)) return D(182);
      if (N(2)) return D(268);
      if (N(2)) return D(181);
      return D(173);  // 默认 Crimera
    }
    // ---- 腐化(NPC.cs:4032-4074 一比一)----
    // 门禁 = 落脚面 tile:腐化草 23 / 黑檀石 25 / 黑沙 112 / 腐化冰 163 / 腐化丛林草 661,
    // 或(黄沙 22 && ZoneCorrupt)。攀爬者 101 仅困难模式+岩石层下 1/3,锚点格随 spawn 传入
    const corruptFloor = t === T.CORRUPT_GRASS || t === T.EBONSTONE || t === T.EBONSAND
      || t === T.CORRUPT_ICE || ((t === T.SAND) && this.ZoneCorrupt);
    const ugRock = this.spawnTileY >= this.world.rockLevel; // flag16
    if (corruptFloor) {
      if (hardMode && ugRock && N(40)) return D(83);       // World Feeder(蠕虫,1/40)
      if (hardMode && ugRock && N(3)) {
        return this.spawnNPC(x, y, 101, rng, this.spawnTileX, this.spawnTileY); // 攀爬者(锚点格)
      }
      if (hardMode && N(3)) return D(N(3) ? 121 : 81);     // 史莱姆法师/腐化史莱姆
      if (hardMode && (N(2) || ugRock)) return D(94);      // 腐化史莱姆
      if (N(3)) return D(-11);   // 小噬魂怪
      if (N(3)) return D(-12);   // 大噬魂怪
      return D(6);               // 默认 Eater of Souls
    }
    // ---- 地表（L4075-4717）----
    //  群系判定：雪原不走 ZoneSnow 旗标兜底段——原版白昼走小动物/基础史莱姆，
    //  夜晚走 IcesSnow 落脚 tile 段（L4555），此前的 ZoneSnow 拦截段为误植已移除
    if (this.surfaceSpawn) {
      const clock = this.world.clock;
      const raining = this.world.weather.raining;
      const moonPhase = clock.moonPhase;
      // TileID.Sets.IcesSnow（TileID.cs:297：161/200/163/164/147）+ 162
      const iceTile = t === T.ICE || t === T.CRIMSON_ICE || t === T.CORRUPT_ICE
        || t === T.HOLLOW_ICE || t === T.SNOW || t === T.THIN_ICE;
      // ---- 墓地蛆/鼠（L4082-4091，surfaceSpawn 段首、昼池之前）----
      //  ZoneGraveyard && !waterTile && 草族落脚（2/477）&& 1/10 → 50/50 蛆 606 / 鼠 610
      if (this.ZoneGraveyard && !this.waterTile && (t === T.GRASS || t === 477) && N(10)) {
        return D(N(2) ? 610 : 606);
      }
      // ---- 白昼（L4109-4435：!ZoneGraveyard && dayTime 大昼池）----
      //  ★墓地白天整体跳过昼池（原版门即 !ZoneGraveyard && Main.dayTime）→ 白天也落入
      //  夜间怪池（僵尸/眼球等）——"墓地白天刷夜怪"的本体语义；昼池兜底基础史莱姆同理不刷
      if (this.dayTime && !this.ZoneGraveyard) {
        // num46 = |落脚 x - 世界出生点 x|（L4108）
        const num46 = Math.abs(this.spawnTileX - this.world.spawnX);
        // L4412：哥布林侦察兵 73——距出生点 >1/3 图宽，1/15
        //  （或未破哥布林入侵 && 砸过暗影珠 → 1/7）
        if (!this.waterTile && num46 > st.w / 3
          && (N(15) || (!this.world.flags['downedGoblins'] && this.world.flags['shadowOrbSmashed'] && N(7)))) {
          return D(73);
        }
        // L4417：雨天飞行怪 224（1/4，无 waterTile 门）
        if (raining && N(4)) return D(224);
        // L4421：雨伞史莱姆 225（!waterTile 1/2）
        if (!this.waterTile && raining && N(2)) return D(225);
        // L4426/4431：大风天 594 风气球（2/3）→ 628 蒲公英（草地 9/10）。
        //  门：!waterTile && num==0（落点上格无墙，L1188 num=wall）&& IsItAHappyWindyDay
        //  （=_shouldUseWindyDayMusic）&& isSpawningInWindDirection（L1101
        //  (pX-spawnTileX)*windSpeedTarget>0，生成点在玩家下风侧）
        const windyDay = this.world.weather.shouldUseWindyDayMusic;
        const spawnWallEmpty = st.wall[st.idx(this.spawnTileX, this.spawnTileY - 1)] === 0;
        const downwind = (this.pX - this.spawnTileX) * this.world.weather.windSpeedTarget > 0;
        if (!this.waterTile && spawnWallEmpty && windyDay && downwind) {
          if (!N(3)) return D(594);
          if ((t === T.GRASS || t === 477) && !N(10)) return D(628);
        }
        // L4435：池底基础史莱姆
        if (!this.waterTile) return D(this.getBasicSlimeToSpawn(true, t, rng));
        return null;
      }
      // ---- 夜晚（L4437-4716；墓地白天亦落入本池——见上方昼池的 !ZoneGraveyard 门）----
      // L4409 `if (ZoneGraveyard) defaultTarget = target`（:4411→:5161 Target 兜底）——
      //  显式把刷出怪的目标设为玩家；本仓敌怪走最近玩家索敌，单人语义等价，不另设
      // L4410：萤火虫（原版带 !ZoneGraveyard 门 :4413）——草族 tile + 无风 + 无雨 +
      //  1/fireFlyChance（原版为每世界 roll 的随机值 setFireFlyChance L94555，取代表值 30）
      const tooWindy = Math.abs(this.world.weather.windSpeedTarget) >= 0.4;
      if (!this.ZoneGraveyard && !tooWindy && !raining
        && (t === T.GRASS || t === 477 || t === T.HALLOW_GRASS)
        && N(30) && this.spawnTileY <= this.world.groundLevel) {
        return D(t === T.HALLOW_GRASS ? 358 : 355);
      }
      // L4439：乌鸦 Raven 301——(万圣节 || 墓地) && 1/12（节日未接 → 墓地单门）
      if (this.ZoneGraveyard && N(12)) return D(301);
      // L4444：幽灵 Ghost 316——墓地专属 1/30
      if (this.ZoneGraveyard && N(30)) return D(316);
      // L4449：南瓜跳跳 Hoppin' Jack 304——(万圣节 || 墓地) && hardMode && 1/10
      if (this.ZoneGraveyard && hardMode && N(10)) return D(304);
      // L4454：Next(6) 或 满月（moonPhase==4）1/2 门
      if (N(6) || (moonPhase === 4 && N(2))) {
        // L4456：hard 1/3 → Wandering Eye 133
        if (hardMode && N(3)) return D(133);
        // L4464：1/2 → 恶魔眼族（1/4 小眼 -43）
        if (N(2)) return D(N(4) ? -43 : 2);
        // L4471-4516：switch(Next(5)) 僵尸族 190-194；各 1/3 小变体与本体【同帧同出】
        //  （原版先 SpawnNPC 小变体再 SpawnNPC 本体；单返回值 API 只能交付本体，
        //   小变体另调一次 spawnNPC 后丢弃）
        const zv = rng.int(0, 5);
        if (N(3)) this.spawnNPC(x, y, [-38, -39, -40, -41, -42][zv], rng);
        return D([190, 191, 192, 193, 194][zv]);
      }
      // L4518：hard 1/50 血月 && 场上无小丑 109 → Clown
      if (hardMode && N(50) && clock.bloodMoon && !any(109)) return D(109);
      // L4523/4529：(血月 || 墓地) && RollOnlyBadLuck(300) → The Groom 53 / The Bride 536。
      //  RollOnlyBadLuck 正运无加成（Luck.cs:31-38）→ luck≥0 时 N(300) 即精确；
      //  仅负运态有偏差（登记：负 luck 时应收窄为 [150,300)，见 src/stats/Luck.ts）
      if ((clock.bloodMoon || this.ZoneGraveyard) && N(300)) return D(53);
      if ((clock.bloodMoon || this.ZoneGraveyard) && N(300)) return D(536);
      // L4533：新月（moonPhase==0）hard 2/3 → Werewolf 104
      if (!this.dayTime && moonPhase === 0 && hardMode && !N(3)) return D(104);
      // L4538：hard 1/3 → Werewolf 140
      if (!this.dayTime && hardMode && N(3)) return D(140);
      // L4543：血月 2/5 → Blood Zombie 489 / Drippler 490
      if (clock.bloodMoon && rng.int(0, 5) < 2) return D(N(2) ? 490 : 489);
      // L4555：冰系落脚 tile → hard 1/4 Ice Elemental 169 / hard 1/3 Wolf 155 / else Frozen Zombie 161
      //  （两支 hard 概率均带 !ZoneGraveyard 门 :4557/:4561——墓地里冰面上冰元素/狼不出，
      //   兜底 Frozen Zombie 161 照刷；spawnArmedZombies && expertMode → 431 未接专家模式，略）
      if (iceTile) {
        if (!this.ZoneGraveyard && hardMode && N(4)) return D(169);
        if (!this.ZoneGraveyard && hardMode && N(3)) return D(155);
        return D(161);
      }
      // L4577：雨夜 1/2 → Raincoat Zombie 223（1/3 小变体 -54/-55）
      if (raining && N(2)) {
        if (!N(3)) return D(223);
        return D(N(2) ? -55 : -54);
      }
      // L4585：skyblock 火把僵尸段省略（skyblock 语义未接；原文本支亦带 !ZoneGraveyard 门）
      // L4612：苔藓僵尸 Moss Zombie 691——墓地专属 RollOnlyBadLuckExtreme(200)
      if (this.ZoneGraveyard && N(200)) return D(691);
      // L4617：蛆僵尸 Maggot Zombie 632——墓地专属 1/maggotZombieChance（GetZombieSettings
      //  L5500 恒 20；skyblock/初始血量只调 torch 门，不改本值）
      if (this.ZoneGraveyard && N(20)) return D(632);
      // L4622：火把僵尸 590/591——Next(torchZombieChance)。原版条件**仅此一个概率门**，
      //  与"点燃的火把/营火邻近"无关（590 贴图手持火把故俗名火把僵尸；
      //  GetZombieSettings L5495-5523 全文无火把/营火邻接扫描）。持械变体 591 需
      //  spawnArmedZombies && expertMode（专家模式未接 → 恒 false）→ 恒刷 590
      if (N(this.torchZombieChance)) return D(590);
      // L4634：halloween/xMas/墓园/专家持械僵尸 430-436 略（节日/专家模式未接）
      // ---- 最终僵尸 style 表（L4671-4716 + GetZombieSettings L5495）----
      //  zombieStyle = Next(7)（在 SpawnAnNPC 入口即 roll，L1193）；各 style 配大小变体
      const zrow = [
        [3, -26, -27], [132, -28, -29], [186, -30, -31], [187, -32, -33],
        [188, -34, -35], [189, -36, -37], [200, -44, -45],
      ][this.zombieStyle] ?? [3, -26, -27];
      let zid = zrow[0];
      if (N(3)) zid = rng.next() < 0.5 ? zrow[1] : zrow[2];
      return D(zid);
    }
    // ---- 地下层（L4718-4770，worldSurface < y < rockLayer）----
    if (this.underGround) {
      if (!this.noWorms && N(50) && !this.ZoneSnow) {
        // L4722：hard → 2/3 Digger 95 / 1/3 Giant Worm 10；肉前恒 10
        if (hardMode) return D(N(3) ? 10 : 95);
        return D(10);
      }
      // L4734/4738：hard 1/3→140（Possessed Armor）/ 1/2→141（Toxic Sludge）
      if (hardMode && N(3)) return D(140);
      if (hardMode && N(2)) return D(141);
      // L4748：落脚 147/161 或 ZoneSnow → 冰史莱姆 147
      if (t === T.SNOW || t === T.ICE || this.ZoneSnow) return D(147);
      return D(this.getBasicSlimeToSpawn(false, t, rng));
    }
    // ---- 地狱（L4771-4820，y > maxTilesY-190）----
    //  mechAny = downedMechBossAny（Main 旗标；我们取 flags.downed_125/126/127/134 任一，
    //  与 Game.ts flag 求值同源）
    if (this.spawnTileY > st.h - 190) {
      const mechAny = !!(this.world.flags['downed_125'] || this.world.flags['downed_126']
        || this.world.flags['downed_127'] || this.world.flags['downed_134']);
      // L4777：hard && 未救出税务官 && 1/20 && 场上无 534 → Tortured Soul 534
      if (hardMode && !this.world.flags['savedTaxCollector'] && N(20) && !any(534)) return D(534);
      // L4781：熔岩小动物 1/8（先于骨蛇——原版段序）。
      //  SpawnLavaBaitCritters（L5760）：2/3 → 白天 Hell Butterfly 653 / 夜 Lavafly 654
      //  （原版夜间成群 1-5 只，单返回值只交付 1 只）；else Magma Snail 655
      if (N(8)) {
        if (!N(3)) return D(this.dayTime ? 653 : 654);
        return D(655);
      }
      // L4787：Bone Serpent 1/40（场上唯一）
      if (N(40) && !any(39)) return D(39);
      // L4794：Fire Imp 1/14
      if (N(14)) return D(24);
      if (N(7)) {
        // L4799：Voodoo Demon 1/10；hard+mechAny 4/5 → Red Devil 156；else Demon
        if (N(10)) return D(66);
        if (hardMode && mechAny && !N(5)) return D(156);
        return D(62);
      }
      // L4810：Lava Slime 1/3
      if (N(3)) return D(59);
      // L4812：hard+mechAny 4/5 → Lava Bat 151；else Hellbat
      if (hardMode && mechAny && !N(5)) return D(151);
      return D(60);
    }
    // CheckToSpawnRockGolem（L4821/L5713 1:1）→ 岩石高仑 631：
    //  hard && (落脚=石 或 Moss 族) && !ZoneSnow && 1/50
    //  && 落点上方 4 格三连（x−1/x/x+1）净空（体型 36×48 的头部空间预检）
    if (this.checkToSpawnRockGolem(rng)) return D(631);
    // ---- 洞穴通用池（L4825-5142）----
    // 冰系 tile 分档（原版各段用不同子集）：
    //  iceAll=147/161/162/163/164/200（蠕虫段 L4842）、iceCave=147/161/162（L4981/5117/5128）
    const iceAll = t === T.SNOW || t === T.ICE || t === T.THIN_ICE
      || t === T.CORRUPT_ICE || t === T.HOLLOW_ICE || t === T.CRIMSON_ICE;
    const iceCave = t === T.SNOW || t === T.ICE || t === T.THIN_ICE;
    if (N(60)) {
      if (this.ZoneSnow) return D(218);
      return D(217);
    }
    // L4836：hard && 珍珠沙/珍珠石/粉冰 && 1/8 → Chaos Elemental 120
    if ((t === T.PEARLSAND || t === T.PEARLSTONE_BLOCK || t === T.HOLLOW_ICE)
      && hardMode && !this.noWorms && N(8)) return D(120);
    // L4842-4850：hard && 冰系 tile && 群系旗标 → Pigron 变体 170(腐化)/171(神圣)/180(猩红)
    if (iceAll && !this.noWorms && hardMode) {
      if (this.ZoneCorrupt && N(30)) return D(170);
      if (this.ZoneHallow && N(30)) return D(171);
      if (this.ZoneCrimson && N(30)) return D(180);
    }
    // L4852：hard && ZoneSnow && 1/10 → Ice Tortoise 154
    if (hardMode && this.ZoneSnow && N(10)) return D(154);
    // L4855：1/100 蠕虫——hard→Digger 95；肉前 ZoneSnow→Snow Flinx 185 / else Giant Worm 10
    if (!this.noWorms && N(100) && !this.ZoneHallow) {
      if (hardMode) return D(95);
      if (this.ZoneSnow) return D(185);
      return D(10);
    }
    // L4867：ZoneSnow && 1/20 → Snow Flinx 185
    if (this.ZoneSnow && N(20)) return D(185);
    // L4871：1/10(肉前)/1/20(hard) 母史莱姆族——雪/冰落脚 184，否则 1/3 黑 -6 / 母 16
    if ((!hardMode && N(10)) || (hardMode && N(20))) {
      if (this.ZoneSnow || t === T.ICE || t === T.SNOW) return D(184);
      if (N(3)) return D(-6);
      return D(16);
    }
    // L4890：(!hard || skyblock) && 1/4 史莱姆段——丛林→-10；雪/冰落脚→184；else -6
    if (!hardMode && N(4)) {
      if (this.ZoneJungle) return D(-10);
      if (this.ZoneSnow || t === T.ICE || t === T.SNOW) return D(184);
      return D(-6);
    }
    if (N(2)) {
      // 洞穴主池（L4896-5099）
      // 骷髅商 453（L4905-4910）：1/35，非水域（影烛未实现），场内唯一（CountNPCS==0）
      // —— Game.trySpawnEnemy 把 453 转成 TownNPC 放 npcs 桶
      if (N(35) && !this.waterTile && !any(453)) return D(453);
      // L4911：Lost Girl 195（Nymph）1/80
      if (N(80)) return D(195);
      // 深层半段 = y > (rockLayer + maxTilesY)/2（L4913/4917 共用门）
      const deepCave = this.spawnTileY > (this.world.rockLevel + st.h) / 2;
      // L4913：hard && 深层半段 && 1/200 → Rune Wizard 172
      if (hardMode && deepCave && N(200)) return D(172);
      // L4917：深层半段 && 1/200（offensiveToTim 1/50 buff 未接）→ Bound Goblin 45
      if (deepCave && N(200)) return D(45);
      // L4929/4941：Next(4)!=0（3/4）→ 大理石房：Next(6)!=0（5/6）且场内无 480
      //  且 hard → Medusa 480，else Hoplite 481（花岗岩同构 483/482）
      if (this.nearMarble && !N(4)) {
        if (!N(6) && !any(480) && hardMode) return D(480);
        return D(481);
      }
      if (this.nearGranite && !N(5)) {
        if (!N(6) && !any(483)) return D(483);
        return D(482);
      }
      // L4951：hard && Next(10)!=0（9/10）→ 洞穴主池：
      //  1/2 → ZoneSnow?197 : (深层半段 1/5→-15 Heavy Skeleton / else 77 Armored Skeleton)
      //  else → ZoneSnow?206 : 110 Skeleton Archer
      if (hardMode && !N(10)) {
        if (N(2)) {
          if (this.ZoneSnow) return D(197);
          if (deepCave && N(5)) return D(-15);
          return D(77);
        }
        return D(this.ZoneSnow ? 206 : 110);
      }
      // L4961：幽灵 Ghost 316——!noWorms && (万圣节 || 墓地) && 1/30（洞穴主池内）
      if (!this.noWorms && this.ZoneGraveyard && N(30)) return D(316);
      // L4969：Undead Miner 44（1/20）
      if (N(20)) return D(44);
      // L4979：冰洞池——落脚 147/161/162：1/15 Snow Flinx 185 / else Undead Viking 167
      if (iceCave) return D(N(15) ? 185 : 167);
      // L4993：ZoneSnow → Snow Flinx 185
      if (this.ZoneSnow) return D(185);
      // L5000：1/3 → cavernMonsterType[Next(2)][Next(3)]（洞穴蝾螈族，世界生成时 roll）
      if (N(3)) return D(cavernMonsterType[rng.int(0, 1)][rng.int(0, 2)]);
      // L5010：ZoneGlowshroom && tile 70/190 → 孢子骷髅 635（蘑菇草/发光蘑菇块落脚）
      if (this.ZoneGlowshroom && (t === T.MUSHROOM_GRASS || t === T.MUSHROOM_BLOCK)) return D(635);
      // L5018：halloween 南瓜精略；L5029：专家模式骨堆小动物 449-452 略（无专家模式）
      // switch(Next(4)) 骷髅系（L5050-5099）：2/3 本体，1/3 大小变体二选一
      const sv = rng.int(0, 3);
      const sm = [21, 201, 202, 203][sv] ?? 21;
      if (!N(3)) return D(sm);
      const small = [[-46, -47], [-48, -49], [-50, -51], [-52, -53]][sv] ?? [-46, -47];
      return D(rng.next() < 0.5 ? small[0] : small[1]);
    }
    // 洞穴兜底（L5101-5142，按原版段序）
    // L5101：hard && ZoneHallow && 1/2 → Illuminant Slime 138
    if (hardMode && this.ZoneHallow && N(2)) return D(138);
    // L5105：ZoneJungle → Jungle Bat 51
    if (this.ZoneJungle) return D(51);
    // L5109：ZoneGlowshroom && tile 70/190 → 孢子蝙蝠 634（洞穴兜底段的蘑菇地支，
    //  与 L5010 的 635 分居两支——命中本支说明洞穴主池 Next(2) 已先行掷空）
    if (this.ZoneGlowshroom && (t === T.MUSHROOM_GRASS || t === T.MUSHROOM_BLOCK)) return D(634);
    // L5113：hard && ZoneHallow → Illuminant Bat 137
    if (hardMode && this.ZoneHallow) return D(137);
    // L5117：hard && Next(6)>0（5/6）→ 冰落脚 1/3 Ice Bat 150 / else Giant Bat 93
    if (hardMode && !N(6)) {
      if (N(3) && iceCave) return D(150);
      return D(93);
    }
    // L5128：冰落脚 tile（147/161/162，非 ZoneSnow 旗标）→ hard?169 Ice Elemental : 150
    if (iceCave) return D(hardMode ? 169 : 150);
    return D(49);  // Cave Bat
  }

  /** GetGemBunnyToSpawn（NPC.cs:5587-5615 1:1）：Next(100) 分档——琥珀 5%/钻石 8%/
   *  红玉 10%/翠玉 12%/蓝玉 16%/黄玉 21%/紫晶 28%（越稀有权重越低） */
  private getGemBunnyToSpawn(rng: RNG): number {
    const n = Math.floor(rng.next() * 100);
    if (n < 5) return 651;      // Amber Bunny
    if (n < 13) return 652;     // Diamond Bunny
    if (n < 23) return 650;     // Ruby Bunny
    if (n < 35) return 649;     // Emerald Bunny
    if (n < 51) return 648;     // Sapphire Bunny
    if (n < 72) return 647;     // Topaz Bunny
    return 646;                 // Amethyst Bunny
  }

  /** GetGemSquirrelToSpawn（NPC.cs:5617-5645 1:1）：权重表同上（639-645 松鼠族） */
  private getGemSquirrelToSpawn(rng: RNG): number {
    const n = Math.floor(rng.next() * 100);
    if (n < 5) return 644;      // Amber Squirrel
    if (n < 13) return 645;     // Diamond Squirrel
    if (n < 23) return 643;     // Ruby Squirrel
    if (n < 35) return 642;     // Emerald Squirrel
    if (n < 51) return 641;     // Sapphire Squirrel
    if (n < 72) return 640;     // Topaz Squirrel
    return 639;                 // Amethyst Squirrel
  }

  /** CheckToSpawnRockGolem（NPC.cs:5713-5728 1:1）：
   *  !hardMode / (落脚≠石 且 非 Moss 族) / ZoneSnow 任一 → false；
   *  Next(50)≠0 → false；落点上方 4 格三连任一实心（WorldGen.SolidTile）→ false */
  private checkToSpawnRockGolem(rng: RNG): boolean {
    if (!this.hardMode) return false;
    if (this.spawnTileType !== T.STONE && !TILE_MOSS.has(this.spawnTileType)) return false;
    if (this.ZoneSnow) return false;
    if (rng.next() >= 1 / 50) return false;   // Main.rand.Next(50)==0
    const st = this.world.store;
    const y4 = this.spawnTileY - 4;
    if (st.isSolid(this.spawnTileX - 1, y4) || st.isSolid(this.spawnTileX, y4)
      || st.isSolid(this.spawnTileX + 1, y4)) return false;
    return true;
  }

  /** Spawning_SandstoneCheck（NPC.cs:5364-5403 1:1）：沙漠地表蚁狮门。
   *  WorldGen.InWorld(x,y,10) 外 → false；自落脚格向下 ≤8 行逐行计数——本行须为
   *  沙族 tile（中断止），并向两侧各延伸 ≤4 格（遇非沙族中断）；
   *  计数 ≥40 通过（remixWorld 阈值 10 未接——本仓无 remix 世界恒 40） */
  private spawningSandstoneCheck(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 10 || y < 10 || x > st.w - 10 || y > st.h - 10) return false;
    let num = 0;
    outer: for (let i = 0; i < 8; i++) {
      let t = st.type[st.idx(x, y + i)];
      if (!st.flags[st.idx(x, y + i)] || !TILE_SAND.has(t)) break;
      num++;
      for (let j = 1; j <= 4; j++) {
        t = st.type[st.idx(x + j, y + i)];
        if (!st.flags[st.idx(x + j, y + i)] || !TILE_SAND.has(t)) break;
        num++;
      }
      for (let k = 1; k <= 4; k++) {
        t = st.type[st.idx(x - k, y + i)];
        if (!st.flags[st.idx(x - k, y + i)] || !TILE_SAND.has(t)) break;
        num++;
      }
      if (num >= 40) break outer;
    }
    return num >= 40;
  }

  /** GetBasicSlimeToSpawn（L5537-5580） */
  private getBasicSlimeToSpawn(surface: boolean, tileType: number, rng: RNG): number {
    if (!surface) {
      // 地下：Next(5)==0→-9（黄），否则 Next(2)==0→1（蓝）/-8（红）
      if (rng.next() < 0.2) return -9;
      return rng.next() < 0.5 ? 1 : -8;
    }
    switch (tileType) {
      case T.MUD: return -10;     // 丛林
      case T.SNOW: case T.SNOW_BRICK: return 147;  // 冰
      default:
        if (rng.next() < 1 / 3) return -3;         // 绿
        if (rng.next() < 0.1) return -7;           // 紫
        return 1;                                   // 蓝
    }
  }

  /** 主入口：Game.trySpawnEnemy 调用 */
  spawn(playerX: number, playerY: number, rng: RNG, viewHalfW: number, viewHalfH: number): Enemy | null {
    this.pX = Math.floor(playerX / TILE);
    this.pY = Math.floor(playerY / TILE);
    this.dayTime = this.world.clock.isDay;
    this.hardMode = !!this.world.flags.hardMode;
    // SetSpawnFlags L321：noWorms = 玩家所站格带房屋墙（房屋内不出蠕虫）
    this.noWorms = this.world.store.inBounds(this.pX, this.pY)
      && WALL_HOUSE.has(this.world.store.wall[this.world.store.idx(this.pX, this.pY)]);
    this.skyMob = false;
    this.spawnSpider = false;
    // 邻近旗标每尝试复位(原版每次 TrySpawnAnNPC 全新置旗;
    // 泄漏会导致碰过大理石后全图永远出蛇发女妖)
    this.nearMarble = false;
    this.nearGranite = false;
    this.spawnUndergroundDesert = false;
    if (!this.findSpawnTile(rng, viewHalfW, viewHalfH)) return null;
    // TrySpawnAnNPC L220：CheckNotSpawningOnScreen 像素级二次校验（画面内/贴屏拒绝）
    if (!this.checkNotSpawningOnScreen(playerX, playerY, viewHalfW, viewHalfH)) return null;
    // GetProperGroundSpawnTileTypeAndWallType（L5789-5792）：tile = 落脚格自身 type，
    // wall = 落脚格【上方一格】的墙（skyMob 天空怪落点无实心面 → tile=0）
    const st = this.world.store;
    const groundType = this.skyMob ? 0 : st.type[st.idx(this.spawnTileX, this.spawnTileY)];
    const spawnWallType = this.spawnTileY > 0
      ? st.wall[st.idx(this.spawnTileX, this.spawnTileY - 1)] : 0;
    // PostCheckChosenSpawnTile（L922-927）：地牢内刷怪点必须踩地牢砖且上方格有墙。
    // 原版失败 = TrySpawnAnNPC return false（L227-230）——整帧放弃，不回选点循环换点重试
    if (this.ZoneDungeon && (!this.isDungeonTile(groundType) || spawnWallType === 0)) return null;
    this.setFlagsForChosenTile(this.spawnTileX, this.spawnTileY, groundType, rng);
    this.currentSpawnX = this.spawnTileX;
    this.currentSpawnY = this.spawnTileY;
    // 探针调试覆盖：debugPoolOverride 非空时绕过原版链直接从池选（确定性验证）
    if (debugPoolOverride && debugPoolOverride.length) {
      return this.spawnNPC(this.spawnTileX * 16 + 8, this.spawnTileY * 16,
        debugPoolOverride[rng.int(0, debugPoolOverride.length - 1)], rng);
    }
    return this.spawnAnNPC(rng);
  }
}
