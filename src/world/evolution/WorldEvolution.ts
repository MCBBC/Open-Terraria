// 原版世界运行时演化系统 1:1 移植（Terarria1456）：
//   WorldGen.UpdateWorld（WorldGen.cs:71507）每 tick 随机采样驱动：
//     地表 = w×h×3e-5（雨天 ×1.5）样本走 UpdateWorld_OvergroundTile（:72066）
//     地下 = w×h×1.5e-5 样本走 UpdateWorld_UndergroundTile（:73266）
//     ★⑤（2026-09-05）remix 世界 = 地下 2.5e-5 双调样本（每样本 Underground→
//     Overground 两采样器,growGrassUnderground 包络,cs:72145-72156）
//     每地表样本 1/(num7×100) 概率 PlantAlch 药草自播种（:45910，num7=151..422.8 随世界宽）
//   UpdateWorld_GrassGrowth（:74333）：草/丛林草/蘑菇草/灰烬草/邪恶草蔓延 + 顶部植物
//   hardUpdateWorld（:69661，困难模式）：邪恶/神圣草蔓延 + 水晶碎块(129) + 叶绿(211) + 邪恶矿退化
//   藤蔓各族生长（GrowMoreVines 密度门 :45592）+ 仙人掌（:56584）+ 染料植物（:71298）
//   苔藓蔓延（MossConversion :71469）+ 藓堆(184) + 钟乳石再生（PlaceTight :38329）
//   蛛网再生（GrowWeb :74141）+ 贝壳/珊瑚沉积 + 药草三态（GrowAlch :45786）
//   墙蔓延（SpreadGrassWalls :74958 / SpreadDesertWalls :75073）→ Convert 墙半区（:55113）
//   SpreadGrass 运行时版（:75210）：普通草仅地表（j<worldSurface 且 dirt==0）、邪恶草不受限、
//   3×3 封死不转、邻岩浆不转、上方向日葵(27)挡邪恶草、草→草走 Convert tiles-only
//   依存物拆除级联（W2/NB-F 2026-09-03）：kill/改型写后 SquareTileFrame 3×3 派发面——
//   PlantCheck/CheckAlch/CheckVines/长苔藓 case184/睡莲 CheckLilyPad（详见级联段头注）
// RNG 源（NB-F 定谳 2026-09-03）：原版 UpdateWorld 全部采样/掷骰在 Main.Update 的
//   `using (Main.SwapRandom("UpdateWorldGen"))` 作用域内跑（Main.cs:17985-17988）——
//   SwapRandom（Main.cs:3300-3312）按 key 惰性 `new UnifiedRandom(ActiveWorldFileData.Seed)`
//   建命名流并存 _rngs 表，**跨 tick 持续不重置**（UpdateWorld_WorldGenAndInvasion 每 tick
//   换入同一条世界种子流）。本仓等价 = 构造时 `new RNG(world.seed)` 专用实例、
//   每 tick update() 续流不重置；106 处 Math.random() 活流偏差全部改走 this.rng()
//   （[0,1) 双精度直换，掷位/概率式 1:1）。Convert 链（溶液/净化粉经 convertArea 进来）
//   在原版走 "UpdateProjectiles"/"UpdateItems" 等别的命名流——同为世界种子持久流、
//   单机观测面等价，本仓并入本流消费（流域归属注记，非行为近似）。
//   ★⑦定谳（2026-09-05,Main.cs 流作用域）：WorldGen.genRand ≡ Main.rand（别名属性,
//   WorldGen.cs:4362 `public static UnifiedRandom genRand => Main.rand`）——UpdateWorld
//   作用域内两写法是同一条 "UpdateWorldGen" 命名流,原版无第二基流。新写骰位一律
//   this.rng();存量 killDropFace 等处"Main.rand 骰→Math.random"口径系流归属偏差,
//   金标已锚按登记债保留（翻动须同步重冻金标+测试）。
// 近似项（原版依赖系统缺失，注释标明）：
//   - Collision.CanHitLine（GrowMoreVines 的加权计数）→ 仅计数不判视线
//   - PlayerLOS（球茎/蜂巢/蚁狮幼虫隐藏性）→ 玩家距离 >50 格视为不可见
//   - 装饰变体帧（PlaceTile 后 TileFrame 随机化）→ 直接随机变体帧
//   - Convert case 0-21 全量移植（2026-08-20 环境转换器全族批）：case 0 绿溶液
//     纯净化（Clentaminator 779/5134 消费）；case 14-21 1.4.4 Forced* 反转换
//     （API 档，1456 运行时无消费方——照抄备用）；火把转换
//     （Convert_ActuallyConvertTorch）已随各 case 全链接入
import type { TileStore } from '../TileStore';
import { getTreeTypeAndTreeBottom, TreeTypes } from '../TreeShake';   // ★⑤ 掉落族批：树底/树型单源
import { TILE_DEFS, TILE_BY_KEY, TILE_CUT_SHEETS, BREAKABLE_WHEN_PLACING_SHEETS, IS_A_TREE_TRUNK_SHEETS, PLATFORMS_SHEETS, CONV_JUNGLE_GRASS_SHEETS, CONV_GRASS_SHEETS, CONV_GOLF_GRASS_SHEETS, CONV_STONE_SHEETS, CONV_ICE_SHEETS, CONV_SAND_SHEETS, CONV_HARDENED_SAND_SHEETS, CONV_SANDSTONE_SHEETS, CONV_THORN_SHEETS, CONV_SNOW_SHEETS, TILE_MOSS_SHEETS, MOSS_BRICK_SHEETS, GETS_CHECKED_FOR_LEAVES_SHEETS, IS_VINE_SHEETS, SPREADS_CORRUPTION_SHEETS, SPREADS_CRIMSON_SHEETS, SPREADS_HALLOW_SHEETS, ICES_SNOW_SHEETS, SPREAD_OVERGROUND_SHEETS, SPREAD_UNDERGROUND_SHEETS, CAN_GROW_CRYSTAL_SHARDS_SHEETS, SLOWLY_DIES_IN_WATER_SHEETS } from '../../data/tiles';
import { holidayLightVid } from '../../data/vanillaStyleDrops';   // ★红蓝-G①（2026-09-18）节日彩灯掉落单源
import { RNG } from '../../core/rng';
import { rollLuck } from '../../stats/Luck';
import { NOT_CLEARABLE } from '../gen/vanilla/TileRunner';
import { WALL_HOUSE } from '../Housing';   // Main.wallHouse 全表(含 :10506 153-166 循环段)★BJ204 单源(曾经 SurfaceDecorPasses 中转)
import { flowerGroundOk, plantBadMatch, plantNewType, PLANT_CHECK_SHEETS,
  PLANT_CONVERT_KEY } from './PlantRules';

/** sheet id → 内部 tile id（首匹配；TILE_DEFS 顺序固定，模块加载时一次构建） */
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

// ---- 原版集合表（TileID.cs / WallID.cs / Main.cs 实证）----
// TileID.Sets.SpreadOverground（:417）/SpreadUnderground（:419）/CanGrowCrystalShards（:345）
// ——★BJ221 收编单源 data/tiles.ts（§6k;旧注 :413/:415/:341 系行号漂移）
const SPREAD_OVERGROUND = SPREAD_OVERGROUND_SHEETS;
const SPREAD_UNDERGROUND = SPREAD_UNDERGROUND_SHEETS;
// TileID.Sets.IsVine（:237）——★BJ218 收编单源 data/tiles.ts:IS_VINE_SHEETS（§6j）
const IS_VINE = IS_VINE_SHEETS;
const CAN_GROW_SHARDS = CAN_GROW_CRYSTAL_SHARDS_SHEETS;
// TileID.Sets.Boulders（:195）——多向锚定物（129/149 水晶碎块/节日彩灯）无效锚族
const MULTI_DIR_ANCHOR_INVALID = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716, 10]);
// TileID.Sets.Spreads{Corruption,Crimson,Hallow}（:335/:353/:343）——★BJ218 收编单源（§6j）
const SPREADS_CORRUPTION = SPREADS_CORRUPTION_SHEETS;
const SPREADS_CRIMSON = SPREADS_CRIMSON_SHEETS;
const SPREADS_HALLOW = SPREADS_HALLOW_SHEETS;
// Main.tileAlch（Main.cs:7755）
const TILE_ALCH = new Set([82, 83, 84]);
// Main.tileMoss（= TileID.Sets.Conversion.Moss，TileID.cs:38）——★BJ210 收编单源（§6i）
const TILE_MOSS = TILE_MOSS_SHEETS;
const TILE_MOSS_BRICK = MOSS_BRICK_SHEETS;
// WorldGen.GetTileMossColor（WorldGen.cs:82492-82523）：苔/苔砖 11 对 → 色序号
// 0..10（184 苔藓植物 frameX = 22×序号,TileFrame case 184 cs:86449-86488）;域外 -1
const MOSS_COLOR_OF = new Map<number, number>([
  [179, 0], [512, 0], [180, 1], [513, 1], [181, 2], [514, 2], [182, 3], [515, 3],
  [183, 4], [516, 4], [381, 5], [517, 5], [534, 6], [535, 6], [536, 7], [537, 7],
  [539, 8], [540, 8], [625, 9], [626, 9], [627, 10], [628, 10],
]);
// TileID.Sets.Conversion.*（TileID.cs:14-36）——★BJ210 收编单源 data/tiles.ts（sheet 域,§6i）
const CONV_JUNGLE_GRASS = CONV_JUNGLE_GRASS_SHEETS;
const CONV_GRASS = CONV_GRASS_SHEETS;
const CONV_GOLF_GRASS = CONV_GOLF_GRASS_SHEETS;
const CONV_STONE = CONV_STONE_SHEETS;
const CONV_ICE = CONV_ICE_SHEETS;
const CONV_SAND = CONV_SAND_SHEETS;
const CONV_HARD_SAND = CONV_HARDENED_SAND_SHEETS;
const CONV_SANDSTONE = CONV_SANDSTONE_SHEETS;
const CONV_THORN = CONV_THORN_SHEETS;
const CONV_SNOW = CONV_SNOW_SHEETS;
// TileID.Sets.Conversion.Dirt（TileID.cs:23）= CreateBoolSet(default(int)) → 仅泥土 0
const CONV_DIRT = new Set([0]);
// WallID.Sets.Conversion.*（WallID.cs:11-33）
const WALL_CONV_GRASS = new Set([63, 64, 65, 66, 67, 68, 69, 70, 81, 264, 265, 268]);
const WALL_CONV_STONE = new Set([1, 61, 185, 3, 28, 83, 262, 274, 246, 248, 269, 349]);
const WALL_CONV_HARD_SAND = new Set([216, 217, 219, 218, 304, 305, 307, 306]);
// WallID.Sets.Conversion.Dirt（WallID.cs:15）——净化的墙分支（Convert case 11）专用
const WALL_CONV_DIRT = new Set([2, 16]);
// WallID.Sets.Conversion.Snow / Ice（WallID.cs:20-21）——case 5/6 沙化/雪化墙分支用
const WALL_CONV_SNOW = new Set([40, 249]);
const WALL_CONV_ICE = new Set([71, 266]);
const WALL_CONV_SANDSTONE = new Set([187, 220, 222, 221, 275, 308, 310, 309]);
const WALL_CONV_PURE_SAND = new Set([216, 187, 304, 275]);
const WALL_CONV_NEW1 = new Set([188, 192, 200, 204, 212, 276, 280, 288, 292, 300]);
const WALL_CONV_NEW2 = new Set([189, 193, 201, 205, 213, 277, 281, 289, 293, 301]);
const WALL_CONV_NEW3 = new Set([190, 194, 202, 206, 214, 278, 282, 290, 294, 302]);
const WALL_CONV_NEW4 = new Set([191, 195, 203, 207, 215, 279, 283, 291, 295, 303]);
// WallID.Sets.Spreads*（WallID.cs:48-52）
const WALL_SPREADS_CORRUPTION = new Set([69, 217, 220, 3]);
const WALL_SPREADS_CRIMSON = new Set([83, 81, 218, 221]);
const WALL_SPREADS_HALLOW = new Set([70, 219, 222, 28]);
// 雪族（UndergroundTile/OvergroundTile 的钟乳石再生分支）
const SNOW_FAMILY = ICES_SNOW_SHEETS;   // ★BJ218 收编单源 data/tiles.ts:ICES_SNOW_SHEETS（TileID.cs:297=Ices∪Snow;§6j;cs:45854 雪冰段同值）
// TileID.Sets.SlowlyDiesInWater（TileID.cs:249）——OvergroundTile liquid>32 支水淹杀
// （cs:72761-72768：活性格命中即 KillTile，无掷骰）——★BJ221 收编单源（§6k）
const SLOWLY_DIES_IN_WATER = SLOWLY_DIES_IN_WATER_SHEETS;
// 上面所有 sheet 集合 → 内部 id 集合（运行时比较用）
const sheetOf = (id: number): number => TILE_DEFS[id]?.vanilla?.sheet ?? -1;
/** TileID.Sets.Conversion.Torch（TileID.cs:42-74）：该 conversionType 下火把可否被转。
 *  case 0 纯净化：仅邪恶/神圣火把(18/19/20)+蘑菇火把(22)；case 11 净化粉：18/19/20；
 *  其余 case：常规(0)+群系（9 冰/16 沙漠/18-20 邪恶神圣/21 丛林/22 蘑菇）全收 */
function torchConvertible(convType: number, style: number): boolean {
  if (convType === 0) return (style >= 18 && style <= 20) || style === 22;
  if (convType === 11) return style >= 18 && style <= 20;
  return style === 0 || style === 9 || style === 16 || (style >= 18 && style <= 22);
}
// 保底球茎 forceBulb 计分黑名单（WorldGen.cs:74266-74281，sheet=原版 id）：
// IsAContainer（BasicChest{21,88,467} 近似）+ 蜥蜴砖/祭坛/门/各结构块/轨道/巨石。
// Paintings 近似取 242-244，Boulders 取 379（TileID.Sets 两集合的已知成员）
const BURST_BLACKLIST = new Set<number>([
  21, 88, 467,            // IsAContainer
  226, 237, 10, 11, 26, 16, 15, 14, 104, 158, 105, 531, 349, 137, 443, 12, 314,
  242, 243, 244,          // TileID.Sets.Paintings 近似
  379,                    // TileID.Sets.Boulders
]);
// ★②（2026-09-05 派发补齐批）：TileID.Sets 三表（Terraria.ID/TileID.cs 实证）——
//   Platforms（:243）= {19,427,435-439}（守望矮人地基 ∨ 门,SolidTileAllowBottomSlope
//   之外的额外放行位）;IsATreeTrunk（:161）;GetsCheckedForLeaves（:167）——
//   ConsideredSolidTileForAnchor（cs:54352）/IsTileALeafyTreeTop（cs:29960）消费。
//   ★BJ168-债2（2026-09-19）：TILE_PLATFORMS/IS_A_TREE_TRUNK 两本地副本拆除,收编
//   data/tiles.ts 单源 PLATFORMS_SHEETS/IS_A_TREE_TRUNK_SHEETS（逐值对拍 7≡7/12≡12;
//   消费面同名直改）;GETS_CHECKED_FOR_LEAVES——★BJ210（2026-09-20）收编单源
//   data/tiles.ts:GETS_CHECKED_FOR_LEAVES_SHEETS（面二三名同值案,§6i）。
const GETS_CHECKED_FOR_LEAVES = GETS_CHECKED_FOR_LEAVES_SHEETS;

export interface EvolutionHost {
  store: TileStore;
  worldSurface: number;
  rockLevel: number;
  /** Main.dungeonX（保底花苞搜索框用，GeneratePlanteraBulbOnAllMechsDefeated cs:74182） */
  dungeonX: number;
  /** 世界难度 0/1/2（生命果密度门 cs:74514-74528） */
  difficulty: number;
  flags: Record<string, boolean>;
  crimson: boolean;
  isDay: boolean;
  raining: boolean;
  maxRaining: number;
  windSpeedCurrent: number;
  /** 玩家 tile 坐标（LOS 近似用；null = 无玩家） */
  playerTile: () => { x: number; y: number } | null;
  /** 静默直写后的渲染补标（陨石同款：chunks.markDirtyArea+lighting.dirty）。
   *  缺省 = 宿主无 chunk 缓存（离线测试），仅写数据不通知渲染。 */
  afterSilentTileWrite?: (x0: number, y0: number, x1: number, y1: number) => void;
  /** WorldGen.GetWorldUpdateRate（cs:72056-72063）= min(desiredWorldTilesUpdateRate, 24)、
   *  FreezeTime 时 0。desiredWorldTilesUpdateRate 随 dayRate 走（Main.cs:6290——全员熟睡
   *  ×5；快进中恒 1 与 dayRate=60 解耦）。缺省 1 = 无时间倍率系统（单测/离线宿主） */
  worldUpdateRate?: number;
  /** 旅程力量·停止感染蔓延（CreativePowers.StopBiomeSpreadPower.Enabled，
   *  CreativePowers.cs:1550；WorldGen.UpdateWorld :71515-71519
   *  AllowedToSpreadInfections = !Enabled）。缺省 false = 允许蔓延 */
  journeyStopBiomeSpread?: boolean;
  /** ★演化域相邻批 ⑨（2026-09-04）：种子变体旗（seedFlags 直配，缺省 false=普通世界）。
   *  drunkWorld → GrowCactus 顶密度骰 Next(11,20)（cs:57181-57187，非 drunk=Next(11,13)）；
   *  remixWorld → GrowCactus 水量门地表豁免（cs:57075 `!remix || !(j>worldSurface)`）。
   *  halloween → UpdateWorld_GrassGrowth 地表南瓜窗（Main.halloween，cs:75122-75142：
   *  1/75 掷 **只在窗口开时消费**——缺省/关窗=原版短路不掷）。
   *  dontStarveWorld → TryGrowingAbigailsFlower 尝试次数 2（cs:73651-73656，缺省 1）。 */
  drunkWorld?: boolean;
  remixWorld?: boolean;
  halloween?: boolean;
  dontStarveWorld?: boolean;
  /** ★演化域顺带批 ①（2026-09-04）：NPC.AnyNPCs(262)（WorldGen.cs:72630）——655 世纪之花
   *  荆棘清除门（overgroundTile 链首支：场上无存活世纪之花 → KillTile）。缺省 undefined
   *  = 场上无世纪之花（原版无 NPC 同相,荆棘照清）。 */
  anyPlantera?: () => boolean;
  /** ★⑤（2026-09-04 掉落族批）：演化域 kill 位次的 KillTile 掉落出口（宿主实现=
   *  Game 侧 vid→物品键→spawnDrop,盒锚 (x*16,y*16)）。缺省 = 无掉落且整面跳过
   *  （离线测试零掷签零流差）。 */
  spawnKillDrop?: (vid: number, x: number, y: number, stack: number) => void;
  /** KillTile_GetTreeDrops :66744-66746 最近玩家选中物品 axe（:66745 单机=本地手持）。 */
  selectedAxePower?: () => number;
  /** SpecialSeedFeatures.ShouldDropExtraWood（SpecialSeedFeatures.cs:15-24 =
   *  tenth && drunk && !remix && !ntb）缺的两侧——drunkWorld/remixWorld 上已有 */
  tenthAnniversary?: boolean;
  notTheBees?: boolean;
  /** 世界种子（NB-F：蔓延专用持久流 = 原版 Main.SwapRandom("UpdateWorldGen") 的
   *  `new UnifiedRandom(ActiveWorldFileData.Seed)`，Main.cs:3300-3312——跨 tick
   *  持续、每 tick 不重置）。缺省 0 = 离线测试兜底（同样确定性）。 */
  seed?: number;
  /** ★②（2026-09-05 kill 掉落面扩展批）：KillTile_GetItemDrops 玩家位门/骰的宿主出口
   *  （原版 GetPlayerForTile(x,y)=Player.FindClosest 最近玩家,单机=本地玩家;缺省
   *  false = 原版"无玩家/无饰品"态——离线测试零掉落零骰）。
   *  · playerHasItem = Player.HasItem（背包全扫）——KillTile_ShouldDropSeeds
   *    （cs:66688-66698）的 281 吹管/986 吹枪持有判（种子是弹药）;
   *  · playerCordage =饰品 3068 植物纤维绳索宝典装备位（Player.cs:15125 UpdateEquips,
   *    case 52/62/382 藤绳 2996 的 GetPlayerForTile.cordage 门）;
   *  · alchemyHarvestable = IsAlchemyPlantHarvestable（cs:66647-66669,case 83/84
   *    种子臂;Game 侧同型谓词已移植,经此注入）;
   *  · playerStaffOfRegrowthBonus = Player.cs:41360/:45021 持杖（213/5295）挥动帧瞬态
   *    ——演化 kill 位次无可达 true 态（挥杆砍取走 Game 侧 breakTile 面）,Game 侧
   *    接线取其 _staffHarvestBonus 同型位（右键采收窗,近似度登记）。 */
  playerHasItem?: (vid: number) => boolean;
  playerCordage?: () => boolean;
  alchemyHarvestable?: (style: number, y: number) => boolean;
  playerStaffOfRegrowthBonus?: () => boolean;
  /** ★⑧（2026-09-05 饵料小动物掷批）：KillTile_DropBait（cs:66784-66944）玩家/实体位
   *  宿主出口。缺省 = 原版"无玩家/无小动物"基态（离线测试零生成,cap 门按 0 计）。
   *  · flowerBoots = 花靴装备位（×10000 自长植株门,fx>=108 判在域内做）;
   *  · zoneGraveyard = 破坏点最近玩家 ZoneGraveyard（worm 357→606 覆写 + 金掷短路）;
   *  · countCritters = NPC.CountNPCS 合计（cap 短路门——原版 && 序在掷前,掷流计数敏感）;
   *  · closestLuck = Player.GetClosestRollLuck 的最近玩家 luck（金变体三态掷入参）;
   *  · spawnBaitNpc = 小动物生成出口（原版 NewNPC+TargetClosest+velocity 三掷;
   *    rand 形参=掷源——演化域传蔓延流,Game 侧单源缺省 Math.random）。 */
  flowerBoots?: () => boolean;
  zoneGraveyard?: () => boolean;
  countCritters?: (vids: number[]) => number;
  closestLuck?: (x: number, y: number) => number;
  spawnBaitNpc?: (vid: number, x: number, y: number, rand: () => number) => void;
}

export class WorldEvolution {
  private hardMode = false;
  private allowedToSpread = true;
  /** ★⑤（2026-09-05）：原版 WorldGen.growGrassUnderground（cs:4338）——remix 双调
   *  包络/notTheBees 地表采样窗内为 true（cs:72150/:72098）。唯一消费位=SpreadGrass
   *  地表下禁蔓门（cs:75764 `… && !growGrassUnderground`）→ spreadGrass 接线。 */
  private growGrassUnderground = false;
  /** 蔓延专用 RNG 流（世界种子）。★与全局不共享、逐 tick 续流（原版 _rngs
   *  命名流语义——UpdateWorld_WorldGenAndInvasion 每 tick 换入同一条流）。 */
  private readonly spreadRng: RNG;

  constructor(private host: EvolutionHost) {
    this.spreadRng = new RNG(host.seed ?? 0);
  }

  /** 消费蔓延流一个 [0,1) 样本（≡ 原版 genRand.NextDouble()；Math.random 的 1:1 替位） */
  private rng(): number {
    return this.spreadRng.next();
  }

  /** 每 tick 调用（Game.fixedUpdate）。原版 UpdateWorld 采样骨架（cs:71507-71639） */
  update(): void {
    const st = this.host.store;
    const { w, h } = st;
    this.hardMode = !!this.host.flags.hardMode;
    // 感染蔓延门（WorldGen.cs:71513-71519：AllowedToSpreadInfections =
    // !StopBiomeSpreadPower.Enabled——旅程力量"停止感染蔓延"）
    this.allowedToSpread = !this.host.journeyStopBiomeSpread;
    // WorldGen.GetWorldUpdateRate（cs:71545/:72056-72063）：=0 时 UpdateWorld 整体跳过
    // （采样数全零,演化停摆——FreezeTime 语义）；desiredWorldTilesUpdateRate 随 dayRate
    // 走（Main.cs:6290：TargetTimeRate × 全员熟睡 5；快进中恒 1,与 dayRate=60 解耦）
    const rate = this.host.worldUpdateRate ?? 1;
    if (rate === 0) return;
    const wallDist = 3;
    // 地表采样（雨天 ×1.5，cs:71552-71557）。num7=PlantAlch 分母基（vanilla
    //  `(int)Utils.Lerp(151,151×2.8,…)` 整型截断,cs:72094——此前漏截=概率式微偏差,
    //  ★⑤ 2026-09-05 对齐）
    let surfaceN = w * h * 3e-5 * rate;
    if (this.host.raining) surfaceN *= 1.5;
    const num7 = Math.floor(151 + (151 * 2.8 - 151) * Math.min(1, Math.max(0, w / 4200 - 1)));
    for (let n = 0; n < surfaceN; n++) {
      if (this.rng() * (num7 * 100) < 1) this.plantAlch();
      const i = 10 + Math.floor(this.rng() * (w - 20));
      const j = 10 + Math.floor(this.rng() * (Math.floor(this.host.worldSurface) - 1 - 10));
      if (j < 10) continue;
      this.overgroundTile(i, j, wallDist);
    }
    // 地下采样（cs:72144-72157 原版序）——★⑤ remix 双调：remix 世界 2.5e-5 样本率,
    //  每样本先 UndergroundTile 再 OvergroundTile（两采样器同 (i2,j2),每格双调）
    //  且包络在 growGrassUnderground=true 内（cs:75764 SpreadGrass 地表下禁蔓门的
    //  豁免旗,spreadGrass 已接）;非 remix 世界 1.5e-5 单调 UndergroundTile。
    if (this.host.remixWorld) {
      const remixN = w * h * 2.5e-5 * rate;
      for (let n = 0; n < remixN; n++) {
        const i = 10 + Math.floor(this.rng() * (w - 20));
        const j = Math.floor(this.host.worldSurface) - 1 + Math.floor(this.rng() * (h - 20 - (Math.floor(this.host.worldSurface) - 1)));
        if (j < 10 || j >= h - 20) continue;
        this.growGrassUnderground = true;
        this.undergroundTile(i, j, wallDist);
        this.overgroundTile(i, j, wallDist);
        this.growGrassUnderground = false;
      }
    } else {
      const underN = w * h * 1.5e-5 * rate;
      for (let n = 0; n < underN; n++) {
        const i = 10 + Math.floor(this.rng() * (w - 20));
        const j = Math.floor(this.host.worldSurface) - 1 + Math.floor(this.rng() * (h - 20 - (Math.floor(this.host.worldSurface) - 1)));
        if (j < 10 || j >= h - 20) continue;
        this.undergroundTile(i, j, wallDist);
      }
    }
  }

  // ================= 通用读写助手 =================

  private at(x: number, y: number) { return this.host.store.idx(x, y); }
  private active(x: number, y: number): boolean {
    const st = this.host.store;
    return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
  }
  private typeAt(x: number, y: number): number {
    const st = this.host.store;
    return st.inBounds(x, y) ? st.type[st.idx(x, y)] : -1;
  }
  private isLava(x: number, y: number): boolean {
    const st = this.host.store;
    return st.inBounds(x, y) && st.liquid[st.idx(x, y)] > 0 && st.liquidType[st.idx(x, y)] === 2;
  }
  private liquidAt(x: number, y: number): number {
    const st = this.host.store;
    return st.inBounds(x, y) ? st.liquid[st.idx(x, y)] : 0;
  }
  private setType(x: number, y: number, type: number): void {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    const before = st.type[i];
    st.setTile(x, y, type);
    // ★W2 级联：改型=锚定语义变化（苔→邪石、草→荆棘…）→ 原版
    //   Convert_ActuallyConvertTile（cs:56800）写型后 SquareTileFrame(x,y) 同款
    if (before !== type) this.frameDependents(x, y);
  }
  private kill(x: number, y: number): void {
    const st = this.host.store;
    // ★RD-F10（2026-09-04）：头门=原版字面 `if (!tile.active()) return;`（KillTile
    //   cs:64043-64045）——幽灵残型格（flags=0,type≠0）不可被 kill。现调用点全前置
    //   active 判（行为不变），此门防新增调用点误杀残型（此前以 type!==0 代 active 位,
    //   幽灵格会连残型一起清=KillTile 语义外的硬清）。
    if (!st.inBounds(x, y) || !st.hasTile(x, y)) return;
    // ★⑤（2026-09-04 掉落族批）：KillTile 掉落面——原版 DropBait/DropItems
    //   （cs:64375-64376）在清格（:64430 tile.type=0）前跑,帧/基座须读活格。
    this.killDropFace(x, y);
    st.setTile(x, y, 0);
    // ★W2 级联：原版 KillTile 尾 SquareTileFrame(i,j)（cs:64432）→ 3×3 TileFrame
    //   派发 Check 族——锚定物被移除后依存物连锁拆除
    this.frameDependents(x, y);
  }

  // ================= ★SW-BJ39（2026-09-09）：树砍伐面单源化公共入口 =================
  //  用户实报「不从根部砍会留下这些砍不掉」：Game 玩家砍伐面（fellTree/fellImportedTree）
  //  手工整段清除 + 树干族误落 Game.checkFurnitureSupport 通用家具支撑校验（tree def
  //  framed+非 solid → 中段干格判「无支撑家具」被腰斩），与演化域 CheckTree 级联核
  //  （treeCheckCore 1:1,evolution-tree-cascade.test）双轨分叉。本批把玩家砍伐面与
  //  TileFrame 派发面统一委托到本域：掉落（killDropFace=KillTile_GetTreeDrops :66710
  //  逐格账）/杀臂（:55045-55256）/重帧臂（切口风格 :55125/:55193）/3×3 续推全单源。

  /** KillTile 默认参等价（带掉落）+ 尾 SquareTileFrame 级联——玩家砍伐/破坏链入口
   *  （原版 Player.cs:46120 `WorldGen.KillTile(x,y)` → WorldGen.cs:64432）。
   *  @returns 是否真的发生了击杀 */
  killTileCascadeAt(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y) || !st.hasTile(x, y)) return false;
    this.kill(x, y);
    return true;
  }

  /** SquareTileFrame 3×3 等价（WorldGen.cs:81462-81473 列优先含中心格）——TileFrame
   *  派发面依存物复检入口（Game 装饰支撑链 'tree'/'treebase' kind 委托）。
   *  队列预算 4096 同 frameDependents（杀空格幂等,重复派发无行为差）。 */
  tileFrameCascadeAt(cx: number, cy: number): void {
    this.frameDependents(cx, cy);
  }

  /** ★⑤（2026-09-04 掉落族批,★② 2026-09-05 扩展）：kill 位次的 KillTile 掉落面 =
   *  KillTile_GetItemDrops（cs:64477 起 switch(tileCache.type)）在本域可达型的逐支
   *  移植。可达性（演化域 kill()/级联 killFlat 的全部杀位次 × case 表）：
   *   · 树干族 5/596/616/634（cs:65730-65745 → KillTile_GetTreeDrops :66710-66768,
   *     getTreeTypeAndTreeBottom@TreeShake.ts 单源）：dropItem=9 起步；冠/枝标记帧
   *     （frameX>=22 && frameY>=198）掷 genRand.Next(2)==0 → TreeTypeDropsAcorns
   *     （:63621-63627 None/Mushroom/Jungle 外）附橡实 27；树型按基座草族换木
   *     （Ash 5215/Corrupt 619/Crimson 911/Jungle 620/Hallowed 621/Mushroom
   *     genRand.Next(2)→183|0/Snow 2503）；**斧骰无条件**（cs:66763-66768 在树型
   *     switch 之后——genRand.Next(35)<=最近玩家 axe || Main.rand.Next(3)==0 → stack
   *     1→2,蘑菇 0 木档照掷=骰位保真）；ShouldDropExtraWood（tenth&&drunk&&!remix
   *     &&!ntb）& dropIsWood → stack ×2（cs:65742）。
   *   · 棕榈 323（cs:65748-65778）：木 2504 起步;tenth → stack += genRand.Next(2,5)
   *     （蔓延流骰）;frameX∈[88,132] → 附橡实 27;向下扫首个实心基座——猩红沙 234→911 /
   *     珍珠沙 116→621 / 黑檀沙 112→619（其余保 2504）;ShouldDropExtraWood → ×3（无
   *     dropIsWood 门,原文如斯）。
   *   · 宝石树 583-589（cs:66219-66262 → SetGemTreeDrops :66614-66624）：
   *     Main.rand.Next(10)==0 → 宝石（589:999 琥珀/584:181 红玉/583:180 绿玉/
   *     586:179 蓝玉/585:177 紫晶/587:178 黄晶/588:182 钻石）else 泥土 3;冠帧
   *     （fx>=22 && fy>=198）Main.rand.Next(2)==0 → 附宝石树种（4851-4857）;
   *     掉泥土档 stack = Main.rand.Next(1,3)。
   *   · 蘑菇族 71/72（cs:66163-66172）：Main.rand.Next(40)==0 → 194 发光蘑菇
   *     else Next(2)==0 → 183 蘑菇（71 小株经 PlantCheck 级联、72 树经 case 72 坍塌）。
   *   · 仙人掌 80（cs:65232）→ 276（水淹 SlowlyDiesInWater cs:72761 区可达）。
   *   · 草族 3/24/110/201/73（cs:65506/:65534/:65528/:65540/:65546）：蘑菇株帧
   *     （3/110@fx144→5、24@fx144→60、201@fx270→2887）;3/73 种子臂
   *     KillTile_ShouldDropSeeds（cs:66688：Main.rand.Next(2)==0 且最近玩家有 281/986）。
   *   · 丛林株 61/74（cs:66142-66161）：61@fx144→331×Next(2,4) / @fx162→223 /
   *     @fx108-126→Next(20)==0→208 / else Next(100)==0→195（74 只走末支）。
   *   · 药草 83/84（cs:66194-66213）：草 313+style（style6→2358）;再生法杖加成位
   *     （GetPlayerForTile.staffOfRegrowthBonus）→ 草 ×Next(1,3)+种子 307+style
   *     （style6→2357）×Next(1,6);否则 IsHarvestableHerbWithSeed（84 恒真/83 走
   *     IsAlchemyPlantHarvestable）→ 种子 ×Next(1,4)。82 芽∈no-drop 组（cs:66291）。
   *   · 藤 52/62/382（cs:65552-65558）：Main.rand.Next(2)==0 且 cordage → 2996;
   *     528 蘑菇藤（cs:65522-65527）：genRand.Next(2)==0 → 183。
   *   · 637 灰烬株（cs:65490）：Main.rand.Next(100)==0 → 5214。
   *   · 703 丛林垂藤（cs:65471-65488）：frameX/18 整除分档 default→195 / 6·7→208 /
   *     8→331 / 9→223（noPrefix——本仓掉件无前缀滚骰=恒等;全支无 RNG）。可达杀位=
   *     plantCheckAt 的 703 特支（基格 SolidTileAllowBottomSlope 失败→killFlat 带掉落;
   *     sanitizePlants 的 noItem 位次仍零掉落）。★R-H1/F1。
   *   · 51 蛛网（cs:65193）→150（无 RNG 无前缀）;519 香蒲（cs:65516）：frameY==90 ∧
   *     genRand.Next(2)==0 → 183（genRand 骰=蔓延流）。★R-H1/F4/F6 归属勘定:两型在
   *     F4 蜂巢覆写表对齐 Main.tileCut 前无 kill 位次（519 不在 PLANT_CHECK_SHEETS,
   *     51 同）故曾不设 case;F4 后 placeJungleBlock2x2 覆写面（cs:74135-74144 KillTile
   *     默认参=带掉落）使 tileCut 全表可达→补设两 case（F4 连锁注记点名 51→150 勿截断,
   *     519 独立 case 按原文补齐）。
   *   · 不可达/零掉面（登记,不设 case）：655 荆棘∈no-drop 组（cs:66580）、595/615 苗、
   *     529/530/549/518/32/352/69/205/636/638/184/113/28/115/231/236/254 均属 no-drop
   *     大组（cs:66270-66586 裸 break）=原版本就不掉;227 染料（cs:65563）/泥土·苔藓族
   *     （case 0/2/109/…→2、633→172、moss→3）在本域无 kill 位次（演化杀位次清单见上）;
   *     KillTile_DropBait（cs:66784-66944 蠕虫/蜗牛/蚱蜢/萤火虫株 genRand 骰面,til
   *     3/73/637/61/74/62/185-187/233）★⑧（2026-09-05）已接=本函数头 killDropBait
   *     （原版序 DropBait（:64375）先于 DropItems（:64376）;演化可达型
   *     3/73/637/61/74/62,185-187/233 表内备案不可达）。Game 侧 killTileDropBait
   *     仍覆盖玩家破坏面（各自位次各自掷源）。
   *  掷签流归属：genRand 骰=本域蔓延流（UpdateWorld 期 WorldGen.genRand ⇒
   *  SwapRandom("UpdateWorldGen") 命名流,this.rng()）；Main.rand 骰=宿主全局流
   *  （Math.random,Game.killTileDropItems 同口径——不占蔓延流位）。各 case 内骰序
   *  =原文序。宿主无出口（离线测试）→ 整面跳过=零掷签零流差。
   *  ★⑦批定谳（2026-09-05,Main.cs 流作用域）：原版 WorldGen.genRand ≡ Main.rand
   *  （WorldGen.cs:4362 别名属性）且 UpdateWorld 全链在 SwapRandom("UpdateWorldGen")
   *  作用域内跑——两写法在 UpdateWorld 域【同一命名流】。本函数历史"Main.rand 骰→
   *  Math.random"口径与原版流归属有偏差（金标已锚,按登记债保留未翻,见
   *  hardUpdateWorld ⑦注）；★⑧起新增面（killDropBait 全部骰位含 gold 掷）一律走
   *  蔓延流。 */
  private killDropFace(x: number, y: number): void {
    const host = this.host;
    if (!host.spawnKillDrop) return;
    const st = host.store;
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    const sheet = sheetOf(st.type[i]);
    const fx = st.frameX[i];
    const fy = st.frameY[i];
    // ★⑧：原版 KillTile 掉落段序 = DropBait（:64375）→ DropItems（:64376）——骰位在先
    this.killDropBait(x, y, sheet, fx, fy);
    const drop = (vid: number, stack = 1): void => {
      if (vid > 0) host.spawnKillDrop!(vid, x, y, stack);
    };
    switch (sheet) {
      case 129:                                               // ★G-129（2026-09-18）水晶碎块
        drop(fx >= 324 ? 4988 : 502);                         // cs:65496-65504：大簇→软体女王水晶
        break;                                                // （Gelatin Crystal）/普通→碎魔晶 502
      case 149:                                               // ★红蓝-G①（2026-09-18）节日彩灯
        drop(holidayLightVid(fx));                            // cs:66036-66046：三色帧域 fx 0/54→596、
        break;                                                // 18/72→597、36/90→598（域外 0=不掉）
      case 5:
      case 596:
      case 616:
      case 634: {
        const tt = getTreeTypeAndTreeBottom(st, x, y);        // :63093-63105（清格前读活格）
        let vid = 9;
        let acorns = false;
        if (fx >= 22 && fy >= 198 && this.rng() < 0.5) {      // :66712-66727 冠/枝帧 50% 掷
          acorns = tt.type !== TreeTypes.None && tt.type !== TreeTypes.Mushroom
            && tt.type !== TreeTypes.Jungle;                  // TreeTypeDropsAcorns :63621
        }
        switch (tt.type) {                                    // :66745-66762 树型换木
          case TreeTypes.Ash: vid = 5215; break;
          case TreeTypes.Corrupt: vid = 619; break;
          case TreeTypes.Crimson: vid = 911; break;
          case TreeTypes.Jungle: vid = 620; break;
          case TreeTypes.Hallowed: vid = 621; break;
          case TreeTypes.Mushroom: vid = this.rng() < 0.5 ? 183 : 0; break;   // :66754-66761
          case TreeTypes.Snow: vid = 2503; break;
          default: break;
        }
        // :66763-66768 斧骰无条件（dropItem=0 蘑菇档照掷——骰位在树型 switch 之后）
        const axe = host.selectedAxePower?.() ?? 0;
        const bonus = Math.floor(this.rng() * 35) <= axe      // genRand.Next(35)<=axe
          || Math.floor(Math.random() * 3) === 0;             // || Main.rand.Next(3)==0（全局流）
        let stack = bonus ? 2 : 1;                            // dropItemStack 1+bonus（:65736-65738）
        if (host.tenthAnniversary && host.drunkWorld && !host.remixWorld
          && !host.notTheBees) stack *= 2;                    // ShouldDropExtraWood & dropIsWood（:65742）
        drop(vid, stack);                                     // :64473 if(dropItem>0)
        if (acorns) drop(27);                                 // secondaryItem 27 ×1（:64478 默认 stack 1）
        break;
      }
      case 323: {                                             // cs:65748-65778 棕榈
        let stack = 1;
        if (host.tenthAnniversary) stack += 2 + Math.floor(this.rng() * 3);   // genRand.Next(2,5)
        let secondary = false;
        if (fx >= 88 && fx <= 132) secondary = true;          // secondaryItem 27（frameX∈[88,132]）
        // 向下扫首个实心基座（cs:65763-65766 `for(j=y; !active||!tileSolid[type]; j++)`）
        let vid = 2504;
        for (let gy = y; gy < st.h; gy++) {
          if (!st.hasTile(x, gy)) continue;
          const d = TILE_DEFS[st.type[st.idx(x, gy)]];
          if (d?.solid) {
            const gs = sheetOf(st.type[st.idx(x, gy)]);
            if (gs === 234) vid = 911;
            else if (gs === 116) vid = 621;
            else if (gs === 112) vid = 619;
            break;
          }
        }
        if (host.tenthAnniversary && host.drunkWorld && !host.remixWorld
          && !host.notTheBees) stack *= 3;                    // ShouldDropExtraWood（:65776-65778,无门 ×3）
        drop(vid, stack);                                     // 主件先出（:64476-64479 次序）
        if (secondary) drop(27);
        break;
      }
      case 589: case 584: case 583: case 586: case 585: case 587: case 588: {
        // SetGemTreeDrops（cs:66614-66624）——gemType/seedType 按 case 表（cs:66219-66262）
        const gemPair: Record<number, [number, number]> = {
          589: [999, 4857], 584: [181, 4852], 583: [180, 4851], 586: [179, 4854],
          585: [177, 4853], 587: [178, 4855], 588: [182, 4856],
        };
        const [gem, seed] = gemPair[sheet];
        let vid = 3;
        let seedHit = false;
        if (Math.floor(Math.random() * 10) === 0) vid = gem;  // Main.rand.Next(10)==0 → 宝石
        if (fx >= 22 && fy >= 198 && Math.floor(Math.random() * 2) === 0) seedHit = true;   // 冠帧附树种
        drop(vid, vid === 3 ? 1 + Math.floor(Math.random() * 2) : 1);   // 泥土档 stack=Next(1,3)（:66221-66223）
        if (seedHit) drop(seed);                              // 次件后出（:64476-64479 次序）
        break;
      }
      case 71:
      case 72:                                                // cs:66163-66172 蘑菇族
        if (Math.floor(Math.random() * 40) === 0) drop(194);
        else if (Math.floor(Math.random() * 2) === 0) drop(183);
        break;
      case 80:                                                // cs:65232 仙人掌 → 276
        drop(276);
        break;
      case 3:                                                 // cs:65506-65513
        if (fx === 144) drop(5);
        else if (this.shouldDropSeeds()) drop(283);
        break;
      case 24:                                                // cs:65534-65539
        if (fx === 144) drop(60);
        break;
      case 110:                                               // cs:65528-65533（无种子支）
        if (fx === 144) drop(5);
        break;
      case 201:                                               // cs:65540-65545
        if (fx === 270) drop(2887);
        break;
      case 73:                                                // cs:65546-65551
        if (this.shouldDropSeeds()) drop(283);
        break;
      case 61:                                                // cs:66142-66161 丛林株
        if (fx === 144) drop(331, 2 + Math.floor(Math.random() * 2));         // Next(2,4)
        else if (fx === 162) drop(223);
        else if (fx >= 108 && fx <= 126) {
          if (Math.floor(Math.random() * 20) === 0) drop(208);
        } else if (Math.floor(Math.random() * 100) === 0) drop(195);
        break;
      case 74:                                                // cs:66142-66161（61 专帧支全不中→末支）
        if (Math.floor(Math.random() * 100) === 0) drop(195);
        break;
      case 83:
      case 84: {                                              // cs:66194-66213 药草
        const style = Math.floor(fx / 18);
        const herb = style === 6 ? 2358 : 313 + style;
        const seed = style === 6 ? 2357 : 307 + style;
        const harvestable = sheet === 84                      // IsHarvestableHerbWithSeed（cs:66627-66645）
          || !!(host.alchemyHarvestable?.(style, y));
        if (host.playerStaffOfRegrowthBonus?.() ?? false) {
          drop(herb, 1 + Math.floor(Math.random() * 2));      // Next(1,3)
          drop(seed, 1 + Math.floor(Math.random() * 5));      // Next(1,6)
        } else if (harvestable) {
          drop(herb);
          drop(seed, 1 + Math.floor(Math.random() * 3));      // Next(1,4)
        } else {
          drop(herb);
        }
        break;
      }
      case 52:
      case 62:
      case 382:                                               // cs:65552-65558 藤 cordage
        if (Math.floor(Math.random() * 2) === 0 && (host.playerCordage?.() ?? false)) drop(2996);
        break;
      case 528:                                               // cs:65522-65527 蘑菇藤（genRand 骰）
        if (this.rng() < 0.5) drop(183);
        break;
      case 637:                                               // cs:65490-65496 灰烬株
        if (Math.floor(Math.random() * 100) === 0) drop(5214);
        break;
      case 703:                                               // cs:65471-65488 丛林垂藤
        // frameX/18 整除分档（无 RNG）:default→195 / 6·7→208 / 8→331 / 9→223(noPrefix)。
        // ★R-H1/F1：可达杀位=plantCheckAt 703 特支→killFlat（清格前读活帧,此处 fx 已捕获）
        {
          const tier = Math.floor(fx / 18);
          if (tier === 6 || tier === 7) drop(208);
          else if (tier === 8) drop(331);
          else if (tier === 9) drop(223);                     // noPrefix=本仓掉件无前缀滚骰
          else drop(195);
        }
        break;
      case 51:                                                // cs:65193 蛛网（无 RNG）★F4 后可达
        drop(150);
        break;
      case 519:                                               // cs:65516 香蒲（genRand 骰）★F4 后可达
        if (fy === 90 && this.rng() < 0.5) drop(183);         // frameY==90 ∧ genRand.Next(2)==0
        break;
      default:
        break;
      }
  }

  /** ★⑧（2026-09-05 饵料小动物掷批）：KillTile_DropBait（cs:66784-66944）演化域 1:1。
   *  五分母表（num worm/num2 hop/num3 clover/num4 grub/num5 firefly）+ 帧带门 +
   *  花靴 ×10000 + 序贯独立 if（原版无早退：每支门过即掷,**掷流计数敏感**——
   *  DropBait.ts dropBaitRoll 的单产物早退结构系 Game 侧玩家位口径,演化域不沿用）。
   *  骰位（原文序,&& 短路=掷前门）：
   *   worm：num>0 ∧ CountNPCS(num7)<5 ∧ Next(num)==0 → 墓地 606/金 448/普通 357;
   *     金掷 GetClosestRollLuck==0（Luck.RollLuck 三态）仅 worm 中且非墓地掷（:66887）。
   *   clover：num3>0（仅 73∧fx<108）∧ Next(1000)==0 → 5574 幸运四叶草（:66891-66894）。
   *   hop：num2>0 ∧ CountNPCS(377)<5 ∧ Next(num2)==0 → 金 446/普通 377（金掷同上,无墓地带）。
   *   grub：num4>0 ∧ CountNPCS(485..487)<8 ∧ Next(num4×1.25)==0 → 485 起步,
   *     中后 Next(4)==0→486、独立 Next(12)==0→487 覆写（:66955-66961,两掷仅中后消费）。
   *   firefly：num5>0 ∧ CountNPCS(653·654)<8 ∧ Next(num5)==0 → 653,中后 Next(2)==0→654。
   *  分母表逐支（fx>=108 ∧ 花靴 → ×10000；62/233/185-187 无花靴门=原文）。
   *  流归属：全部 genRand 骰=蔓延流（★⑦定谳：gold 掷 Luck.RollLuck 内部走 Main.rand
   *  ≡ genRand 同流）;velocity 掷在宿主 spawnBaitNpc 单源（spawnBaitNpcAt）。 */
  private killDropBait(x: number, y: number, sheet: number, fx: number, fy: number): void {
    const host = this.host;
    let num = -1;        // worm 357/606
    let num2 = -1;       // hop 377
    let num3 = -1;       // clover 5574
    let num4 = -1;       // grub 485-487
    let num5 = -1;       // firefly 653/654
    const fb = fx >= 108 && (host.flowerBoots?.() ?? false);
    if (sheet === 3) {
      num = 400; num2 = 100;
      if (fb) { num *= 10000; num2 *= 10000; }
    } else if (sheet === 73) {
      if (fx < 108) num3 = 1000;
      num = 200; num2 = 50;
      if (fb) { num *= 10000; num2 *= 10000; }
    } else if (sheet === 637) {
      num5 = 100;
      if (fb) num5 *= 10000;
    } else if (sheet === 61) {
      num4 = 80;
      if (fb) num4 *= 10000;
    } else if (sheet === 74) {
      num4 = 40;
      if (fb) num4 *= 10000;
    } else if (sheet === 62) {
      num4 = 250;
    } else if (sheet === 185) {
      if ((fy === 0 && fx < 214) || (fy === 18 && (fx < 214 || fx >= 1368))) num = 6;
    } else if (sheet === 186) {
      if (fx >= 378 && fx <= 700) num = 6;
    } else if (sheet === 187) {
      if ((fx >= 756 && fx <= 916) || fx <= 322) num = 6;
    } else if (sheet === 233) {
      num4 = 10;
    }
    const critters = (vids: number[]): number => host.countCritters?.(vids) ?? 0;
    const gold = (): boolean =>
      rollLuck(host.closestLuck?.(x * 16, y * 16) ?? 0, 400, () => this.rng()) === 0;
    // worm（墓地小气候：num7 先被 606 覆写 → 金掷门 num7==357 短路【不掷】,cs:66885-66887）
    const graveyard = host.zoneGraveyard?.() ?? false;
    if (num > 0 && critters([graveyard ? 606 : 357]) < 5 && this.rng() < 1 / num) {
      const goldHit = !graveyard && gold();
      host.spawnBaitNpc?.(graveyard ? 606 : goldHit ? 448 : 357, x, y, () => this.rng());
    }
    if (num3 > 0 && this.rng() < 1 / num3) {
      host.spawnKillDrop?.(5574, x, y, 1);
    }
    if (num2 > 0 && critters([377]) < 5 && this.rng() < 1 / num2) {
      host.spawnBaitNpc?.(gold() ? 446 : 377, x, y, () => this.rng());
    }
    if (num4 > 0 && critters([485, 486, 487]) < 8 && this.rng() < 1 / Math.floor(num4 * 1.25)) {
      let vid: 485 | 486 | 487 = 485;
      if (this.rng() < 1 / 4) vid = 486;                       // Next(4)==0
      if (this.rng() < 1 / 12) vid = 487;                      // Next(12)==0 独立覆写
      host.spawnBaitNpc?.(vid, x, y, () => this.rng());
    }
    if (num5 > 0 && critters([654, 653]) < 8 && this.rng() < 1 / num5) {
      const vid: 653 | 654 = this.rng() < 1 / 2 ? 654 : 653;   // Next(2)==0 → 654
      host.spawnBaitNpc?.(vid, x, y, () => this.rng());
    }
  }

  /** KillTile_ShouldDropSeeds（cs:66688-66698）：Main.rand.Next(2)==0（全局流,先掷）
   *  且最近玩家有 281 吹管/986 吹枪（Player.HasItem;种子=弹药）。宿主无出口 → false。 */
  private shouldDropSeeds(): boolean {
    if (Math.floor(Math.random() * 2) !== 0) return false;
    if (this.host.playerHasItem?.(281)) return true;
    return this.host.playerHasItem?.(986) ?? false;
  }
  /** WorldGen.SolidTile：active && tileSolid && !solidTop && !half && slope==0
   *  && !inActive（WorldGen.cs:70652-70658）。★G1谓词批(2026-09-04)：补致动位半边
   *  ——原位读漏 !inActive,已致动格被当有效支撑（约 10 消费点随之正确） */
  private solidTile(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i] || st.isActuated(x, y)) return false;
    const d = TILE_DEFS[st.type[i]];
    return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
  }
  /** PlayerLOS 近似：50 格内有玩家视为可见（原版逐玩家 Collision.CanHitLine 扫描） */
  private playerLOS(x: number, y: number): boolean {
    const p = this.host.playerTile();
    if (!p) return false;
    return Math.abs(p.x - x) < 50 && Math.abs(p.y - y) < 40;
  }

  // ================= 依存物拆除级联（★W2/NB-F 2026-09-03） =================
  //  原版链：KillTile 尾 SquareTileFrame(i,j)（cs:64432）/ Convert_ActuallyConvertTile
  //  尾 SquareTileFrame(x,y)（cs:56800）→ SquareTileFrame :81462 对 3×3（x 外层列优先）
  //  逐格 TileFrame → TileFrameImportant/Check 族按型派发：锚定物（草/苔/水）被移除或
  //  改型后，依存物连锁拆除——上方植物 PlantCheck（:81818）/ 药草 CheckAlch（:46371）/
  //  下方垂藤 CheckVines（:86137，TileFrame :82652 IsVine 派发）/ 四邻长苔藓
  //  TileFrameImportant case 184（:86428，锚表 GetTileMossColor :82492）/ 水面睡莲
  //  case 518 → CheckLilyPad（:59694）。NB-F x86 3000tick 窗口实证：184 塌落 ×24 /
  //  518 拆除 ×5，本域此前零级联。Game 侧 checkDecorSquareFrame 是同一派发面的
  //  DECOR 子集（双端幂等：对空格/已判合格格均 no-op，重复派发无行为差）。
  //  实现注：工作队列+预算帽（vanilla 无帽；杀空格幂等，帽只防病态存档藤柱爆栈），
  //  级联内部走 killFlat 不重入 frameDependents——传播由队列显式续接（=原版
  //  KillTile→SquareTileFrame→TileFrame 的递归面，展开为显式队列）。

  /** 无级联写空（KillTile 的 type 面：setTile(0) 已含 half/slope/漆清位）。
   *  ★RD-F9/F10 配套：头门随原版 KillTile（cs:64043 `!active() → return`）——幽灵
   *  残型格掷而不落（现调用点全在 active 域内=行为不变）。
   *  ★②（2026-09-05 掉落面扩展批）：本函数升级为 KillTile 默认参等价——清格前走
   *  killDropFace（原版 :64375-64376 DropBait/DropItems 在 :64430 清格前,帧/基座读活格;
   *  Check* 级联杀与树坍塌杀的 KillTile 同为默认参=带掉落）。级联传播仍由调用方
   *  （frameDependents 队列 / kill() 尾派发）显式续接,此处不重入。
   *  @returns 是否真的发生了击杀 */
  private killFlat(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.hasTile(x, y)) return false;
    this.killDropFace(x, y);
    st.setTile(x, y, 0);
    return true;
  }

  /** KillTile(noItem:true) 等价（原版覆写位次零掉落：PlaceJunglePlant cs:48242 /
   *  PlaceOasisPlant cs:47994 均 `KillTile(k,l,false,false,noItem:true)`;
   *  AttemptToGeneratePlanteraBulbAt force 支 cs:74788-74830 为 ClearTile+SquareTileFrame
   *  ——同为无掉落）。级联（KillTile 尾 SquareTileFrame cs:64432）照走。
   *  @returns 是否真的发生了击杀 */
  private killFlatNoItem(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    if (!st.hasTile(x, y)) return false;
    st.setTile(x, y, 0);
    return true;
  }

  /** KillTile(noItem:true) 全位次（清格 + SquareTileFrame 级联,零掉落）——覆写放置族
   *  （placeJunglePlant/placeOasisPlant/attemptBulbAt）专用入口（★②：掉落面扩展后,
   *  这些原版 noItem 位次若续走 kill() 会对被覆写株凭空掉落=偏差）。 */
  private killNoItem(x: number, y: number): void {
    if (this.killFlatNoItem(x, y)) this.frameDependents(x, y);
  }

  /** 锚定物变更后派发 3×3 依存物复检（含中心格）。 */
  private frameDependents(cx: number, cy: number): void {
    const st = this.host.store;
    if (!st.inBounds(cx, cy)) return;
    const q: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (st.inBounds(cx + dx, cy + dy)) q.push(cx + dx, cy + dy);
      }
    }
    let head = 0;
    let budget = 4096;                                   // 病态链护栏（级联杀≤4096 格）
    while (head < q.length && budget-- > 0) {
      const x = q[head++], y = q[head++];
      if (this.killDependentAt(x, y)) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (st.inBounds(x + dx, y + dy)) q.push(x + dx, y + dy);
          }
        }
      }
    }
  }

  /** 单格依存物复检（TileFrame 派发面子集；vanilla 活性门=各 Check 自带）。
   *  ★①（2026-09-05 树坍塌批）：补 TileFrame 帧重要块 default 支的树干族 case
   *  （cs:87146-87195）——case 5→CheckTree / 583-589→GemTreeGroundTest /
   *  596·616→VanityTreeGroundTest / 634→AshTreeGroundTest / 323→CheckPalmTree /
   *  72→case 72 内联。
   *  ★②（2026-09-05 派发补齐批）：同支非树干族 case 567→CheckGnome（cs:54400）、
   *  630·631→CheckStinkbugBlocker（cs:54373）、723·724→CheckAnchor（cs:54290）
   *  补接（逐支语义见各 Check 注）;case 80 仙人掌 CheckCactus（cs:54579,派发
   *  cs:82646 非 frameImportant 非 solid 支=IsVine 同支前置位）补接——杀基悬空
   *  （沙基被杀/被转后整段折断）由此承接,杀面走 KillTile 默认参=killDropFace
   *  case 80→276 既有口。
   *  @returns 本格是否被杀（级联继续扩散） */
  private killDependentAt(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y) || !this.active(x, y)) return false;
    const sh = sheetOf(this.typeAt(x, y));
    if (sh === 703) return this.plantCheckAt(x, y);          // 丛林垂藤（PlantCheck 特支）
    if (PLANT_CHECK_SHEETS.includes(sh)) return this.plantCheckAt(x, y);
    if (TILE_ALCH.has(sh)) return this.alchCheckAt(x, y);    // CheckAlch {82,83,84}
    if (sh === 80) return this.cactusCheckAt(x, y);          // ★② CheckCactus（cs:82646 前位于 IsVine）
    if (IS_VINE.has(sh)) return this.vineCheckAt(x, y);      // CheckVines IsVine 全族
    if (sh === 184) return this.mossCheckAt(x, y);           // 长苔藓 case 184
    if (sh === 518) return this.checkLilyPad(x, y);          // 睡莲 case 518
    if (sh === 5) return this.treeCheckAt(x, y);             // case 5 → CheckTree（cs:87152-87154）
    if (sh === 72) return this.mushroomTreeCheckAt(x, y);    // case 72 内联（cs:87106-87140）
    if (sh === 323) return this.palmCheckAt(x, y);           // case 323 → CheckPalmTree（cs:87191）
    if (sh >= 583 && sh <= 589) {                            // cs:87155-87163 宝石树族
      return this.treeCheckSettingsAt(x, y, 'gem');
    }
    if (sh === 596 || sh === 616) {                          // cs:87164-87176 景观树族
      return this.treeCheckSettingsAt(x, y, 'vanity');
    }
    if (sh === 634) {                                        // cs:87177-87183 灰烬树
      return this.treeCheckSettingsAt(x, y, 'ash');
    }
    if (sh === 567) {                                        // ★② cs:87194 守望矮人
      this.gnomeCheckAt(x, y);
      return false;                                          // 杀面在 gnomeCheckAt 内,级联由各 killFlat 自续
    }
    if (sh === 630 || sh === 631) {                          // ★② cs:87198 驱虫剂
      return this.stinkbugBlockerCheckAt(x, y);
    }
    if (sh === 723 || sh === 724) {                          // ★② cs:87202 锚桩（纯重锚,永不杀）
      this.anchorCheckAt(x, y);
      return false;
    }
    if (sh === 129 || sh === 149) {                          // ★G-129（2026-09-18）水晶碎块/节日彩灯
      return this.multiDirCheckAt(x, y);                     // TileFrameImportant case 129/149（cs:86339-86369）
    }
    return false;
  }

  /** TileFrameImportant case 129/149（cs:86339-86369）运行时臂：CheckAndAdjust
   *  （cs:60805）无锚 → KillTile（默认参=带掉落,本仓 killFlat;掉落面=killDropFace
   *  case 129 → 502/4988 按帧（cs:65496-65504）/case 149 → 596/597/598 三色帧域
   *  （cs:66036-66046,holidayLightVid 单源））；有锚 → 帧向重落（原版无条件按优先向
   *  写 frameY）。此前运行时缺此派发:锚块被挖/被转后碎块悬空不落。 */
  private multiDirCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    const fy = this.multiDirFrameY(x, y);
    if (fy < 0) return this.killFlat(x, y);
    const i = st.idx(x, y);
    if (st.frameY[i] !== fy) {
      st.frameY[i] = fy;
      this.host.afterSilentTileWrite?.(x, y, x, y);
    }
    return false;
  }

  // ================= ★② TileFrame 派发补齐族（CheckCactus/CheckGnome/
  //                     CheckStinkbugBlocker/CheckAnchor,2026-09-05） =================

  /** CheckCactus（cs:54579-54621,TileFrame case 80 派发 cs:82646）：下扫找基（臂移
   *  跟随 lean 位移）→ 基格须 nactive+非半砖+坡 0+沙族 {53,112,116,234} 否则整杀
   *  杀基悬空;倾斜柱（i≠num2）须下/左/右任一仙人掌续接,直柱下格须
   *  仙人掌∨沙族。杀面=KillTile(i,j) 默认参（killFlat 带掉落,case 80→276）,
   *  整段折断由 frameDependents 队列逐格续推（杀后 3×3 重派发=原版
   *  KillTile 尾 SquareTileFrame 面）。掷骰：全支无 RNG。 */
  private cactusCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    let num = y;                       // 行（下扫）
    let num2 = x;                      // 列（臂移跟随）
    while (st.inBounds(num2, num) && this.active(num2, num) && sheetOf(this.typeAt(num2, num)) === 80) {
      num++;
      if (!st.inBounds(num2, num)) return false;             // 原版 null → return false（cs:54588）
      if (!this.active(num2, num) || sheetOf(this.typeAt(num2, num)) !== 80) {
        if (this.active(num2 - 1, num) && sheetOf(this.typeAt(num2 - 1, num)) === 80
          && this.active(num2 - 1, num - 1) && sheetOf(this.typeAt(num2 - 1, num - 1)) === 80
          && num2 >= x) num2--;
        if (this.active(num2 + 1, num) && sheetOf(this.typeAt(num2 + 1, num)) === 80
          && this.active(num2 + 1, num - 1) && sheetOf(this.typeAt(num2 + 1, num - 1)) === 80
          && num2 <= x) num2++;
      }
    }
    // 基座门（cs:54597-54603）：nactive + 非半砖 + 坡 0 + 沙族
    const gi = st.inBounds(num2, num) ? st.idx(num2, num) : -1;
    const gs = gi >= 0 ? sheetOf(st.type[gi]) : -1;
    if (gi < 0 || !st.isActive(num2, num) || st.half[gi] !== 0 || st.slope[gi] !== 0
      || (gs !== 53 && gs !== 112 && gs !== 116 && gs !== 234)) {
      this.killFlat(x, y);
      return true;
    }
    if (x !== num2) {
      // 倾斜柱采样格（cs:54604-54613）：下/左/右任一仙人掌续接,否则杀
      if ((!this.active(x, y + 1) || sheetOf(this.typeAt(x, y + 1)) !== 80)
        && (!this.active(x - 1, y) || sheetOf(this.typeAt(x - 1, y)) !== 80)
        && (!this.active(x + 1, y) || sheetOf(this.typeAt(x + 1, y)) !== 80)) {
        this.killFlat(x, y);
        return true;
      }
    } else {
      // 直柱采样格（cs:54614-54620）：下格须仙人掌∨沙族
      const bAct = this.active(x, y + 1);
      const bs = bAct ? sheetOf(this.typeAt(x, y + 1)) : -1;
      if (!bAct || (bs !== 80 && bs !== 53 && bs !== 112 && bs !== 116 && bs !== 234)) {
        this.killFlat(x, y);
        return true;
      }
    }
    return false;
  }

  /** SolidTileAllowTopSlope（cs:70851）：active+非致动+（solid∨380 花盆箱）+
   *  ((!Platforms∧坡∉{3,4})∨(Platforms∧半砖))。原版 null→true/越界 catch→false
   *  ——本仓越界=false（运行时格全分配,无 null 态）。 */
  private solidTileAllowTopSlope(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i] || st.isActuated(x, y)) return false;
    const d = TILE_DEFS[st.type[i]];
    const sheet = sheetOf(st.type[i]);
    if (!d || (!d.solid && sheet !== 380)) return false;
    const plat = PLATFORMS_SHEETS.has(sheet);
    const sl = st.slope[i];
    return (!plat && sl !== 3 && sl !== 4) || (plat && st.half[i] !== 0);
  }

  /** SolidTileAllowLeftSlope（cs:70871）：active+非致动+solid+非半砖+!rightSlope
   *  （坡∉{1,3}）+非平台。 */
  private solidTileAllowLeftSlope(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i] || st.isActuated(x, y)) return false;
    const d = TILE_DEFS[st.type[i]];
    if (!d || !d.solid || PLATFORMS_SHEETS.has(sheetOf(st.type[i]))) return false;
    const sl = st.slope[i];
    return !st.half[i] && sl !== 1 && sl !== 3;
  }

  /** SolidTileAllowRightSlope（cs:70891）：active+非致动+solid+非半砖+!leftSlope
   *  （坡∉{2,4}）+非平台。 */
  private solidTileAllowRightSlope(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i] || st.isActuated(x, y)) return false;
    const d = TILE_DEFS[st.type[i]];
    if (!d || !d.solid || PLATFORMS_SHEETS.has(sheetOf(st.type[i]))) return false;
    const sl = st.slope[i];
    return !st.half[i] && sl !== 2 && sl !== 4;
  }

  /** IsTileALeafyTreeTop（cs:29960）：GetsCheckedForLeaves 族 ∧ (323∧fx>=88 ∨
   *  fx==22∧fy∈[198,242])。 */
  private isTileALeafyTreeTop(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) return false;
    const i = st.idx(x, y);
    const sheet = sheetOf(st.type[i]);
    if (!GETS_CHECKED_FOR_LEAVES.has(sheet)) return false;
    if (sheet === 323 && st.frameX[i] >= 88) return true;
    return st.frameX[i] === 22 && st.frameY[i] >= 198 && st.frameY[i] <= 242;
  }

  /** IsTileATreeBranch（cs:29998）：InWorld(·,2) 门 + IsATreeTrunk 族枝帧
   *  （offset ±1 出参被 ConsideredSolidTileForAnchor 弃用,略）。 */
  private isTileATreeBranch(x: number, y: number): boolean {
    const st = this.host.store;
    if (x < 2 || y < 2 || x >= st.w - 2 || y >= st.h - 2) return false;
    if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) return false;
    const i = st.idx(x, y);
    const sheet = sheetOf(st.type[i]);
    if (sheet === 323 || !IS_A_TREE_TRUNK_SHEETS.has(sheet)) return false;
    const fx = st.frameX[i], fy = st.frameY[i];
    if ((fx === 44 && (fy === 198 || fy === 220 || fy === 242))
      || (fx === 66 && (fy === 0 || fy === 22 || fy === 44))) return true;
    if ((fx === 66 && (fy === 198 || fy === 220 || fy === 242))
      || (fx === 88 && (fy === 66 || fy === 88 || fy === 110))) return true;
    return false;
  }

  /** ConsideredSolidTileForAnchor（cs:54352）：!InWorld→true、!active→false、
   *  树干族（323 ∨ IsATreeTrunk∧非叶冠）且非枝格 → true。 */
  private consideredSolidTileForAnchor(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return true;                     // 原版 !InWorld → true（cs:54355）
    if (!st.hasTile(x, y)) return false;
    const sheet = sheetOf(st.type[st.idx(x, y)]);
    if (sheet === 323 || (IS_A_TREE_TRUNK_SHEETS.has(sheet) && !this.isTileALeafyTreeTop(x, y))) {
      if (!this.isTileATreeBranch(x, y)) return true;
    }
    return false;
  }

  /** ValidateOrAttemptReorientingAnchor（cs:54299-54350）：style 逐向校验 → -1 时
   *  按 下/上/左/右/墙 序重锚（switchToWallIfInvalid 时 -1 兜底转墙挂 4）。
   *  @returns {ok, style}——ok=style>-1（调用方按 ref 语义消费 style） */
  private validateOrAttemptReorientingAnchor(x: number, y: number, wall: number,
    styleIn: number, switchToWallIfInvalid: boolean): { ok: boolean; style: number } {
    let style = styleIn;
    const solidFor = (sx: number, sy: number): boolean =>
      this.solidTileAllowBottomSlope(sx, sy) || this.consideredSolidTileForAnchor(sx, sy);
    if (style === 0 && !solidFor(x, y + 1)) style = -1;
    if (style === 1 && !(this.solidTileAllowTopSlope(x, y - 1) || this.consideredSolidTileForAnchor(x, y - 1))) style = -1;
    if (style === 2 && !(this.solidTileAllowLeftSlope(x - 1, y) || this.consideredSolidTileForAnchor(x - 1, y))) style = -1;
    if (style === 3 && !(this.solidTileAllowRightSlope(x + 1, y) || this.consideredSolidTileForAnchor(x + 1, y))) style = -1;
    if (style === 4 && wall <= 0) style = -1;
    if (style === -1 && solidFor(x, y + 1)) style = 0;
    if (style === -1 && (this.solidTileAllowTopSlope(x, y - 1) || this.consideredSolidTileForAnchor(x, y - 1))) style = 1;
    if (style === -1 && (this.solidTileAllowLeftSlope(x - 1, y) || this.consideredSolidTileForAnchor(x - 1, y))) style = 2;
    if (style === -1 && (this.solidTileAllowRightSlope(x + 1, y) || this.consideredSolidTileForAnchor(x + 1, y))) style = 3;
    if (style === -1 && wall > 0) style = 4;
    if (switchToWallIfInvalid && style === -1) style = 4;
    return { ok: style > -1, style };
  }

  /** CheckAnchor（cs:54290-54298,case 723/724）：纯重锚——validate(switchToWall)
   *  过且 style 变 → frameX 重写;永不杀、无掷。 */
  private anchorCheckAt(x: number, y: number): void {
    const st = this.host.store;
    const i = st.idx(x, y);
    const num = Math.floor(st.frameX[i] / 18);
    const r = this.validateOrAttemptReorientingAnchor(x, y, st.wall[i], num, true);
    if (r.ok && r.style !== num) st.frameX[i] = r.style * 18;
  }

  /** CheckStinkbugBlocker（cs:54373-54398,case 630/631）：validate(不 switchToWall)
   *  失败 → KillTile（默认参=带掉落;630/631 无 GetItemDrops case=零掉落走面）;
   *  过门 → frameX 重锚（原 style 2↔3 互换比较——原版字面 quirk：重锚到原向对面
   *  档时不写）。 */
  private stinkbugBlockerCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    const i = st.idx(x, y);
    const num = Math.floor(st.frameX[i] / 18);
    const r = this.validateOrAttemptReorientingAnchor(x, y, st.wall[i], num, false);
    if (!r.ok) {
      this.killFlat(x, y);
      return true;
    }
    let num2 = num;
    if (num2 === 2) num2 = 3;
    else if (num2 === 3) num2 = 2;
    if (r.style !== num2) st.frameX[i] = r.style * 18;
    return false;
  }

  /** CheckGnome（cs:54400-54448,case 567）：1×2 矮人完整性+地基复检——采样格
   *  frameY>0（下半）→ 锚上移一行;上帧 0/下帧 20 双 567 齐则完好;地基
   *  SolidTileAllowBottomSlope ∨ Platforms（TileID.cs:243）否则坏。坏 → 双半
   *  KillTile（destroyObject 包络=防重入,本域 killFlat 无重派发=天然等价）+
   *  Item.NewItem 4609（守望矮人,spawnKillDrop 出口）。无掷。 */
  private gnomeCheckAt(x: number, j: number): void {
    const st = this.host.store;
    let num2 = j;
    if (st.inBounds(x, num2) && st.frameY[st.idx(x, num2)] > 0) num2--;   // 下半采样 → 锚上半
    let flag = true;
    const ti = st.idx(x, num2);
    const bi = st.idx(x, num2 + 1);
    if (st.frameY[ti] === 0 && st.frameY[bi] === 20
      && sheetOf(st.type[ti]) === 567 && sheetOf(st.type[bi]) === 567) {
      flag = false;
    }
    const baseSheet = this.typeAt(x, num2 + 2);
    if (!this.solidTileAllowBottomSlope(x, num2 + 2) && !PLATFORMS_SHEETS.has(sheetOf(baseSheet))) {
      flag = true;
    }
    if (!flag) return;
    if (sheetOf(this.typeAt(x, num2)) === 567) this.killFlat(x, num2);
    if (sheetOf(this.typeAt(x, num2 + 1)) === 567) this.killFlat(x, num2 + 1);
    this.host.spawnKillDrop?.(4609, x, num2, 1);
  }

  /** WorldGen.SolidTileAllowBottomSlope（cs:70698）：active+非致动+非半砖+
   *  (solid||solidTop)+坡 ∈ {0,3,4}（顶坡 1/2 不算地基）。wire bit5=已致动
   *  （TileStore.WIRE_ACTUATED，类型态 import 不引值——字面量 32 同源） */
  private solidTileAllowBottomSlope(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i] || st.half[i] || (st.wire[i] & 32) !== 0) return false;
    const d = TILE_DEFS[st.type[i]];
    if (!d || (!d.solid && !d.platform)) return false;
    const sl = st.slope[i];
    return sl === 0 || sl === 3 || sl === 4;
  }

  /** PlantCheck（cs:81818）：下格地基失配 → TryGetNewType 换型（腐化过境变型，原版
   *  不杀）/ 无法变型即杀。703 特支（cs:81847-81853）：下方须 SolidTileAllowBottomSlope。
   *  ★②（2026-09-05）：noItem 位次（sanitizePlants=读档/导入期清整,原版
   *  isGeneratingOrLoadingWorld → KillTile 强制 noItem,cs:64057-64059）零掉落。 */
  private plantCheckAt(x: number, y: number, noItem = false): boolean {
    const st = this.host.store;
    const sheet = sheetOf(this.typeAt(x, y));
    // PlantCheck down 判据（cs:81838-81844）：下格 nactive+非半砖+slope==0 才认地基
    let down = -1;
    if (y + 1 < st.h) {
      const bi2 = st.idx(x, y + 1);
      if (st.isActive(x, y + 1) && !st.half[bi2] && st.slope[bi2] === 0) {
        down = sheetOf(st.type[bi2]);
      }
    }
    if (sheet === 703) {
      if (!this.solidTileAllowBottomSlope(x, y + 1)) {
        return noItem ? this.killFlatNoItem(x, y) : this.killFlat(x, y);
      }
      return false;
    }
    if (!plantBadMatch(down, sheet)) return false;
    const r = plantNewType(sheet, down, st.frameX[st.idx(x, y)]);
    if (r.type !== sheet) {
      const key = PLANT_CONVERT_KEY[r.type];
      const nid = key ? TILE_BY_KEY[key] : undefined;
      if (nid !== undefined) {
        st.setTile(x, y, nid, r.spore ? (r.type === 201 ? 270 : 144) : r.fx, st.frameY[st.idx(x, y)]);
        return false;
      }
    }
    return noItem ? this.killFlatNoItem(x, y) : this.killFlat(x, y);
  }

  /** CheckAlch（cs:46371）锚定面：下格 nactive 失效/半砖/类型表失配/自身岩浆 → 杀。
   *  ★style5（火冠花）岩浆豁免（cs:46451-46468 case5 无岩浆杀支，其浸泡 83⇄84 翻面
   *  属生长态机 GrowAlch 域，不在此重复）。 */
  private alchCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    const i = st.idx(x, y);
    const style = Math.floor(st.frameX[i] / 18);
    let bad = !st.isActive(x, y + 1) || st.half[st.idx(x, y + 1)] !== 0;
    if (!bad) {
      const ground = sheetOf(st.type[st.idx(x, y + 1)]);
      const ok = (g: number[]): boolean => g.includes(ground);
      switch (style) {
        case 0: bad = !ok([109, 2, 477, 492, 78, 380]); break;
        case 1: bad = !ok([60, 78, 380]); break;
        case 2: bad = !ok([0, 59, 78, 380]); break;
        case 3: bad = !ok([661, 662, 199, 203, 23, 25, 78, 380]); break;
        case 4: bad = !ok([53, 78, 380, 116]); break;
        case 5: bad = !ok([57, 633, 78, 380]); break;
        case 6: bad = !ok([78, 380, 147, 161, 163, 164, 200]); break;
        default: bad = true; break;
      }
    }
    // ★⑨（cs:46451-46468 case5 尾段）火冠花岩浆浸泡 83⇄84 翻面（非杀支,此前整缺——
    //    旧注"属 GrowAlch 域"误归属,原文在 CheckAlch）：芽 82 豁免;anyLava（liquid>0∧
    //    岩浆型）时 liquid>16 → 83→84 / else 84→83。原版裸 type 直写（帧原样、无
    //    SquareTileFrame）且在 bad（地基失配）判后仍执行,写面后统一 KillTile。
    if (style === 5) {
      const sh5 = sheetOf(st.type[i]);
      if (sh5 !== 82 && st.liquid[i] > 0 && st.liquidType[i] === 2) {
        if (st.liquid[i] > 16) {
          if (sh5 === 83) st.setTile(x, y, S(84), st.frameX[i], st.frameY[i]);
        } else if (sh5 === 84) {
          st.setTile(x, y, S(83), st.frameX[i], st.frameY[i]);
        }
      }
    }
    if (!bad && style !== 5 && st.liquid[i] > 0 && st.liquidType[i] === 2) bad = true;   // 岩浆浸泡
    if (bad) return this.killFlat(x, y);
    return false;
  }

  /** CheckVines（cs:86137）：上格同型续接 ∨ 锚定草族；跨群系锚 → 改型（藤随草变）；
   *  无锚 → 杀。锚表/改型表逐支照抄（含 192 棕榈挂普通藤、384 丛林叶挂丛林藤）。 */
  private vineCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    const i = st.idx(x, y);
    const sheet = sheetOf(st.type[i]);
    // 上格 nactive+非底坡 才认锚（cs:86142-86146）
    let num = -1;
    if (y - 1 >= 0 && st.isActive(x, y - 1)) {
      const ai = st.idx(x, y - 1);
      const sl = st.slope[ai];
      if (sl !== 3 && sl !== 4) num = sheetOf(st.type[ai]);
    }
    if (num === sheet) return false;
    // 改型面（cs:86155-86181，末支优先——源序覆盖）
    let num6 = 0;
    if (num === 633 || num === 638) num6 = 638;
    if (num === 70 || num === 528) num6 = 528;
    if (num === 109 || num === 115 || num === 492) num6 = 115;
    if (num === 60 || num === 226 || num === 62) num6 = 62;
    if (num === 23 || num === 636 || num === 661) num6 = 636;
    if (num === 199 || num === 205 || num === 662) num6 = 205;
    if ((num === 2 || num === 52 || num === 477) && sheet !== 382) num6 = 52;
    if (num === 382) num6 = 382;
    if (num6 !== 0 && num6 !== sheet) {
      st.setTile(x, y, S(num6), st.frameX[i], st.frameY[i]);   // 原版 tileCache.type 直改（帧原样）
      return false;
    }
    // 杀面（cs:86183-86225）
    let die = num === -1;
    if ((sheet === 52 || sheet === 382) && num !== 2 && num !== 477 && num !== 192) die = true;
    if (sheet === 62 && num !== 60 && num !== 384 && num !== 226) die = true;
    if (sheet === 115 && num !== 109 && num !== 492) die = true;
    if (sheet === 528 && num !== 70) die = true;
    if (sheet === 636 && num !== 23 && num !== 661) die = true;
    if (sheet === 205 && num !== 199 && num !== 662) die = true;
    if (sheet === 638 && num !== 633) die = true;
    if (die) return this.killFlat(x, y);
    return false;
  }

  /** GetTileMossColor（cs:82492）!= -1 判定：苔藓族 ∪ 苔砖族都是长苔藓合法锚 */
  private hasMossColor(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const sh = sheetOf(st.type[i]);
    return TILE_MOSS.has(sh) || TILE_MOSS_BRICK.has(sh);
  }

  /** TileFrameImportant case 184（cs:86428-86472）：四邻须苔藓色（各向带坡/半砖门），
   *  全失 → KillTile。苔块被邪恶蔓延转成邪石（Convert case1/2/4 tileMoss 支）后的
   *  塌落由此承接（NB-F ×24 残差的根因面）。 */
  private mossCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    const slopeAt = (xx: number, yy: number): number =>
      st.inBounds(xx, yy) ? st.slope[st.idx(xx, yy)] : 0;
    const act = (xx: number, yy: number): boolean =>
      st.inBounds(xx, yy) && st.flags[st.idx(xx, yy)] !== 0;
    const isBottomSlope = (sl: number): boolean => sl === 3 || sl === 4;
    const isTopSlope = (sl: number): boolean => sl === 1 || sl === 2;
    // 上：active+非底坡（cs:86431）；下：active+非半砖+非顶坡（:86434）；左右：active
    const above = act(x, y - 1) && !isBottomSlope(slopeAt(x, y - 1));
    const below = act(x, y + 1) && st.half[st.idx(x, y + 1)] === 0 && !isTopSlope(slopeAt(x, y + 1));
    const left = act(x - 1, y);
    const right = act(x + 1, y);
    const ok = (above && this.hasMossColor(x, y - 1)) || (below && this.hasMossColor(x, y + 1))
      || (left && this.hasMossColor(x - 1, y)) || (right && this.hasMossColor(x + 1, y));
    if (!ok) return this.killFlat(x, y);
    return false;
  }

  /** CheckLilyPad（cs:59694）：非水型杀；按塘底重锚 frameY；水位涨落 → 上浮/下沉
   *  （裸数组直写不清液，cs:59741-59767）；下方非实体残件 → 杀（:59782-59790）。
   *  本仓直写走 setTileSilent+渲染补标（花苞同款：带水格写非实体件绕开液体监听）。 */
  private checkLilyPad(x: number, y: number): boolean {
    const st = this.host.store;
    const i = st.idx(x, y);
    const lty = st.liquidType[i];
    // ★⑩（cs:59699-59706）杀支=原版字面 `liquidType() != 0`——water(0) 以外全杀,
    //    含微光。store 编码 +1（NONE=0/WATER=1/LAVA=2/HONEY=3/SHIMMER=4）→
    //    `!=0` ≙ `>=2`（此前只杀岩浆/蜂蜜,微光塘睡莲不拆=偏差）。
    if (lty >= 2) return this.killFlat(x, y);
    // 向下找塘底（cs:59699-59710：!active||!solid||solidTop 期间下扫，maxY-50 界）
    let num = y;
    while (num < st.h - 50) {
      const gi = st.idx(x, num);
      const gd = TILE_DEFS[st.type[gi]];
      if (st.flags[gi] && gd?.solid && !gd.platform) break;
      num++;
    }
    const ground = sheetOf(this.typeAt(x, num));
    const num2 = ground === 2 || ground === 477 ? 0
      : ground === 109 || ground === 116 ? 18
      : ground === 60 ? 36 : -1;
    if (num2 < 0) return this.killFlat(x, y);
    if (st.frameY[i] !== num2) {
      // 原版裸 frameY 直写（cs:59731-59737）——幽灵残型格不得经 setTile 复活
      // （setTile 会按 type≠0 重置 active 位,残型即失保）
      if (st.hasTile(x, y)) st.setTile(x, y, st.type[i], st.frameX[i], num2);
      else st.frameY[i] = num2;
    }
    const aboveWet = y - 1 >= 0 && st.liquid[st.idx(x, y - 1)] > 0 && !st.flags[st.idx(x, y - 1)];
    if (aboveWet) {
      // 上浮（cs:59741-59757）：水面上涨 → 垫上移一行
      st.setTileSilent(x, y - 1, S(518), st.frameX[i], num2);
      st.setTileSilent(x, y, 0);
      this.host.afterSilentTileWrite?.(x - 1, y - 2, x + 1, y + 1);
      return false;
    }
    if (st.liquid[i] !== 0) return false;
    // 下方格活性门=原版 active()（非 nactive——cs:59761/:59782 两支都读 active）
    const belowActive = st.inBounds(x, y + 1) && st.flags[st.idx(x, y + 1)] !== 0;
    if (!belowActive) {
      // 下沉（cs:59761-59779）：水位退 → 垫下移一行
      st.setTileSilent(x, y + 1, S(518), st.frameX[i], num2);
      st.setTileSilent(x, y, 0);
      this.host.afterSilentTileWrite?.(x - 1, y, x + 1, y + 2);
      return false;
    }
    const bd = TILE_DEFS[st.type[st.idx(x, y + 1)]];
    // 下方残件（active 且非平台且非实心实底）→ 杀（cs:59782-59790）
    if (bd && !bd.platform && (!bd.solid || bd.platform)) return this.killFlat(x, y);
    return false;
  }

  // ================= ★③ 519 香蒲列维护（CheckCatTail/GrowCatTail,2026-09-05） =================

  /** CheckCatTail（cs:59231-59461,519 采样支派发 cs:72748 地表/73853 地下）：水面列
   *  维护/杀。逐支：下扫找实心底（active∧solid∧!solidTop 为止,途中 active 非 519
   *  记坏、非活格即断）;上扫水面（liquid>0,途中 active 非 519 或非水型记坏）;
   *  列深 >catTailDistance(8,cs:4318) 记坏;底格 nactive+型表（2/477→0、53→18、
   *  199/234/662→54、23/112/661→72、70→90）失配记坏;两掷 Next(4)（水面格水浅
   *  <127 / 顶格带穗 frameX>=180∧深水>127——**条件掷**）后帧位校验+露头门;
   *  坏 → 列区间 [min(num,num3)-4, num2] 全 519 KillTile（默认参=带掉落,case 519
   *  →183 genRand 骰）+ SquareTileFrame（KillTile 尾已含,幂等省略）;否则全列
   *  frameY 重锚。 */
  private checkCatTail(x: number, j: number): void {
    const st = this.host.store;
    if (!st.inBounds(x, j)) return;
    let flag = false;
    let num2 = j;
    // 下扫（cs:59240-59255）
    while (st.inBounds(x, num2) && (!this.active(x, num2)
      || !(TILE_DEFS[this.typeAt(x, num2)]?.solid)
      || (TILE_DEFS[this.typeAt(x, num2)]?.platform ?? false)) && num2 < st.h - 50) {
      if (this.active(x, num2) && sheetOf(this.typeAt(x, num2)) !== 519) flag = true;
      if (!this.active(x, num2)) break;
      num2++;
      if (!st.inBounds(x, num2)) return;                     // 原版 null → return
    }
    let num = num2 - 1;
    if (!st.inBounds(x, num)) return;
    // 上扫水面（cs:59256-59271）
    while (st.inBounds(x, num) && this.liquidAt(x, num) > 0 && num > 50) {
      if ((this.active(x, num) && sheetOf(this.typeAt(x, num)) !== 519)
        || st.liquidType[st.idx(x, num)] !== 1) flag = true;   // liquidType()!=0（store 码 1=水）
      num--;
      if (!st.inBounds(x, num)) return;
    }
    num++;
    if (!st.inBounds(x, num)) return;
    const num3 = num;                                          // 水面格
    if (num2 - num3 > 8) flag = true;                          // catTailDistance=8
    const groundSheet = this.typeAt(x, num2);
    let num5 = -1;
    switch (sheetOf(groundSheet)) {
      case 2: case 477: num5 = 0; break;
      case 53: num5 = 18; break;
      case 199: case 234: case 662: num5 = 54; break;
      case 23: case 112: case 661: num5 = 72; break;
      case 70: num5 = 90; break;
    }
    if (!st.isActive(x, num2)) flag = true;                    // 底格非 nactive
    if (num5 < 0) flag = true;
    // 519 列顶定位（cs:59290-59304）
    num = num2 - 1;
    if (st.inBounds(x, num) && !this.active(x, num)) {
      for (let num6 = num; num6 >= num3; num6--) {
        if (!st.inBounds(x, num6)) return;
        if (this.active(x, num6) && sheetOf(this.typeAt(x, num6)) === 519) { num = num6; break; }
      }
    }
    while (st.inBounds(x, num) && this.active(x, num) && sheetOf(this.typeAt(x, num)) === 519) num--;
    num++;
    // 掷 1（cs:59306-59308）：水面格水浅 <127 → 1/4 记坏（条件掷）
    if (st.inBounds(x, num2 - 1) && this.liquidAt(x, num2 - 1) < 127 && this.rng() < 1 / 4) flag = true;
    // 掷 2（cs:59309-59311）：顶格带穗（frameX>=180）∧深水 >127 → 1/4 记坏（条件掷）
    const topFx = st.inBounds(x, num) ? st.frameX[st.idx(x, num)] : -1;
    if (st.inBounds(x, num) && topFx >= 180 && this.liquidAt(x, num) > 127 && this.rng() < 1 / 4) flag = true;
    // 帧位校验（cs:59312-59323）
    if (st.inBounds(x, num) && st.inBounds(x, num2 - 1) && topFx > 18) {
      const belowFx = st.frameX[st.idx(x, num2 - 1)];
      if (belowFx < 36 || belowFx > 72) flag = true;
      else if (topFx < 90) flag = true;
      else if (topFx >= 108 && topFx <= 162) st.frameX[st.idx(x, num)] = 90;
    }
    // 露头门（cs:59324-59325）：列顶上方 4 格干水
    if (num2 > num + 4 && st.inBounds(x, num + 4) && st.inBounds(x, num + 3)
      && this.liquidAt(x, num + 4) === 0 && sheetOf(this.typeAt(x, num + 3)) === 519) {
      flag = true;
    }
    if (flag) {
      // 杀列（cs:59327-59344）：[min(num,num3)-4, num2] 全 519 KillTile+SquareTileFrame
      let num7 = num3;
      if (num < num3) num7 = num;
      num7 -= 4;
      for (let i = num7; i <= num2; i++) {
        if (st.inBounds(x, i) && this.active(x, i) && sheetOf(this.typeAt(x, i)) === 519) {
          this.kill(x, i);                                     // KillTile 尾 SquareTileFrame 已含（幂等）
        }
      }
      return;
    }
    if (st.inBounds(x, num) && num5 === st.frameY[st.idx(x, num)]) return;   // 帧已对
    for (let k = num; k < num2; k++) {
      if (st.inBounds(x, k) && this.active(x, k) && sheetOf(this.typeAt(x, k)) === 519) {
        st.frameY[st.idx(x, k)] = num5;
      }
    }
  }

  /** GrowCatTail（cs:59463-59568,生长掷）：水面定位→列顶→顶格 frameX 态机——
   *  0→18（无掷）/ 18→Next(2,5)×18（36/54/72）并向上添 90 段（CopyPaintAndCoating
   *  cs:59519）/ 90→分叉 Next(3)==0（分叉株 108+上 90,cs:59539）或 Next(3) 选
   *  穗位（126+Δ×18 / 上 180+Δ×18,cs:59552）/ 90∧上格带水 → 108+上 90（无掷,
   *  cs:59565）。尾 SquareTileFrame(x,num-1)。tileCut 占顶 → 先 KillTile 让位
   *  （cs:59491-59497）;上格被占 → 不长。 */
  private growCatTail(x: number, j: number): void {
    const st = this.host.store;
    let num = j;
    while (st.inBounds(x, num) && this.liquidAt(x, num) > 0 && num > 50) num--;
    num++;
    let i = num;
    for (; st.inBounds(x, i) && (!this.active(x, i) || !(TILE_DEFS[this.typeAt(x, i)]?.solid)
      || (TILE_DEFS[this.typeAt(x, i)]?.platform ?? false)) && i < st.h - 50; i++) {
    }
    num = i - 1;
    while (st.inBounds(x, num) && this.active(x, num) && sheetOf(this.typeAt(x, num)) === 519) num--;
    num++;
    if (!st.inBounds(x, num) || !this.active(x, num) || sheetOf(this.typeAt(x, num)) !== 519) return;
    const ti = st.idx(x, num);
    // 顶被 tileCut 装饰占据 → KillTile 让位（cs:59491-59497）
    if (st.frameX[ti] === 90 && this.active(x, num - 1)
      && TILE_CUT_SHEETS.has(sheetOf(this.typeAt(x, num - 1)))) {
      this.kill(x, num - 1);
    }
    if (this.active(x, num - 1)) return;                       // 上格被占 → 不长
    const fx = st.frameX[ti];
    const spawnUpper = (upperFx: number): void => {
      const ui = st.idx(x, num - 1);
      st.setTileSilent(x, num - 1, S(519), upperFx, st.frameY[ti]);   // 原版裸写（不清液共存）
      st.half[ui] = 0;
      st.slope[ui] = 0;
      this.copyPaintAndCoating(x, num, x, num - 1);            // CopyPaintAndCoating(下格)
    };
    if (fx === 0) {
      st.frameX[ti] = 18;                                      // cs:59501-59507（无掷）
    } else if (fx === 18) {
      st.frameX[ti] = 18 * (2 + Math.floor(this.rng() * 3));   // genRand.Next(2,5)∈{2,3,4}
      spawnUpper(90);                                          // cs:59513-59521
    } else if (fx === 90) {
      if (this.liquidAt(x, num - 1) === 0) {
        if (!this.active(x, num - 2)
          && (this.liquidAt(x, num) > 0 || this.liquidAt(x, num + 1) > 0 || this.liquidAt(x, num + 2) > 0)
          && this.rng() < 1 / 3) {                             // genRand.Next(3)==0 → 分叉株
          st.frameX[ti] = 108;
          spawnUpper(90);                                      // cs:59536-59544
        } else {
          const num2 = Math.floor(this.rng() * 3);             // genRand.Next(3) 选穗位
          st.frameX[ti] = 126 + num2 * 18;
          spawnUpper(180 + num2 * 18);                         // cs:59546-59557
        }
      } else {
        st.frameX[ti] = 108;
        spawnUpper(90);                                        // cs:59558-59568（上格带水,无掷）
      }
    }
    this.frameDependents(x, num);                              // SquareTileFrame(x,num)
    this.frameDependents(x, num - 1);                          // SquareTileFrame(x,num-1,resetFrame:false)
    this.host.afterSilentTileWrite?.(x - 1, num - 2, x + 1, num + 1);
  }

  /** CopyPaintAndCoating（Tile.cs:869-874：color/invisibleBlock/fullbrightBlock
   *  方块侧三位）等价——mossUpdate 同款口（setPaint/setCoat=发 listeners 的原语,
   *  COAT_BLOCK_MASK=2|8 字面,类型态 import 不引值）。★⑥（2026-09-05 漆继承批）
   *  共用出口。 */
  private copyPaintAndCoating(fx: number, fy: number, tx: number, ty: number): void {
    const st = this.host.store;
    if (!st.inBounds(fx, fy) || !st.inBounds(tx, ty)) return;
    st.setPaint(tx, ty, st.paint[st.idx(fx, fy)]);
    st.setCoat(tx, ty, 2 | 8, st.coat[st.idx(fx, fy)] & (2 | 8));
  }

  // ================= ① 树坍塌级联（TileFrame 帧重要块 default 支树干族,2026-09-05） =================
  //  原版链：KillTile 尾 SquareTileFrame(i,j)（cs:64432）→ TileFrame 3×3 → 树干族
  //  case（cs:87146-87195）——任意树格失基（下方亡）/失续（侧接帧亡）→ KillTile
  //  （killFlat 带掉落面=逐格掉木）→ 本域由 frameDependents 队列显式续推 3×3
  //  （=原版 KillTile→SquareTileFrame→TileFrame 的递归面,树干向上爬+已清格
  //  hasTile 头门终止,无死循环）。掷骰核：CheckTree/CheckTreeWithSettings 全支
  //  无掷（帧重锚=确定性算术）;CheckPalmTree 重锚 genRand.Next(7,10)（cs:54851,
  //  杀臂后 frameX=-1 ≤44 照掷=原版字面）;case 72 重锚 genRand.Next(3)（cs:87117）。
  //  重锚尾的 4 邻 TileFrame 重派发（cs:54872-54876/:55007-55011/:55244-55248）省略
  //  =等价：杀臂只读邻格 type 与自身帧型,重锚输出（0/66/88/110/132/154）永不落入
  //  杀臂帧型（22/44/66+{0,22,44}/88+{66,88,110}）且邻格 type 不因重锚变化 → 杀集
  //  不变;杀后重派发与 KillTile 自身 SquareTileFrame 3×3 重合;棕榈/72 的骰臂帧收敛
  //  （重锚后 frameX>44 / ≠0）→ 骰位不增不减。

  /** CheckTree（cs:55045-55249,case 5 派发）：地基=草族归一表 → 2（cs:55083-55106）。 */
  private treeCheckAt(x: number, y: number): boolean {
    return this.treeCheckCore(x, y, false, () => false);
  }

  /** CheckTreeWithSettings（cs:54877-55043）：宝石 583-589/景观 596·616/灰烬 634 派发
   *  （cs:87155-87183）,地基谓词=GemTreeGroundTest（cs:30585,Conversion.Stone∪Moss）/
   *  VanityTreeGroundTest（cs:30598,Conversion.Grass-{23,199}）/AshTreeGroundTest
   *  （cs:30611,633）。 */
  private treeCheckSettingsAt(x: number, y: number, ground: 'gem' | 'vanity' | 'ash'): boolean {
    return this.treeCheckCore(x, y, true, (below: number) => {
      if (below < 0) return false;                          // 三测试共通头门（:30587/:30600/:30613）
      if (ground === 'gem') return CONV_STONE.has(below) || TILE_MOSS.has(below);
      if (ground === 'vanity') return CONV_GRASS.has(below) && below !== 23 && below !== 199;
      return below === 633;
    });
  }

  /** CheckTree / CheckTreeWithSettings 合流核（两函数逐臂对照仅四点异：地基判据
   *  flag vs 归一 num4==2、臂 4 杀后续写 vs else-if、尾臂 num4==23 附加支、对角
   *  四读(无消费)——其余臂完全同构,且 WithSettings 的 flag3=左/flag2=右 与 CheckTree
   *  裸 num2=左/num3=右 一一对应）。@returns 是否被杀（队列续推） */
  private treeCheckCore(x: number, y: number, settings: boolean,
    groundValid: (belowSheet: number) => boolean): boolean {
    const st = this.host.store;
    const i = st.idx(x, y);
    const type = sheetOf(st.type[i]);
    const fx0 = st.frameX[i];
    const fy0 = st.frameY[i];
    let fx = fx0;
    let fy = fy0;
    const num = this.active(x, y - 1) ? sheetOf(this.typeAt(x, y - 1)) : -1;      // 上（cs:54887-54890/:55056-55059）
    const num2 = this.active(x - 1, y) ? sheetOf(this.typeAt(x - 1, y)) : -1;     // 左
    const num3 = this.active(x + 1, y) ? sheetOf(this.typeAt(x + 1, y)) : -1;     // 右
    const raw4 = this.active(x, y + 1) ? sheetOf(this.typeAt(x, y + 1)) : -1;     // 下
    let num4: number;
    let flag: boolean;
    if (settings) {
      num4 = raw4;
      flag = groundValid(raw4);                           // cs:54894 settings.IsGroundValid(num4)
    } else {
      // CheckTree 地基归一（cs:55083-55106）：草族全表 → 2
      num4 = (raw4 === 2 || raw4 === 23 || raw4 === 661 || raw4 === 477 || raw4 === 60
        || raw4 === 70 || raw4 === 109 || raw4 === 147 || raw4 === 199 || raw4 === 662
        || raw4 === 492) ? 2 : raw4;
      flag = num4 === 2;
    }
    const flag2 = num3 === type;                          // cs:54895（右）
    const flag3 = num2 === type;                          // cs:54896（左）
    let killed = false;
    const kill = (): void => {
      if (this.killFlat(x, y)) {
        killed = true;
        fx = -1; fy = -1;                                 // KillTile 清帧（cs:64428-64429 frameX/Y=-1）
      }
    };
    // 杀臂 1（cs:54897-54901 WithSettings / cs:55107-55111 CheckTree）
    if (!flag && num4 !== type
      && ((fx === 0 && fy <= 130) || (fx === 22 && fy <= 130) || (fx === 44 && fy <= 130))) {
      kill();
    }
    // 杀臂 2（cs:54903-54912 / cs:55112-55122）——臂 3 是它的 else-if
    if (fx >= 22 && fx <= 44 && fy >= 132 && fy <= 176) {
      if (!flag) kill();
      else if (!((fx === 22) && flag3) && !((fx === 44) && flag2)) kill();
    } else if ((fx === 88 && fy >= 0 && fy <= 44) || (fx === 66 && fy >= 66 && fy <= 130)
      || (fx === 110 && fy >= 66 && fy <= 110) || (fx === 132 && fy >= 0 && fy <= 176)) {
      const num5 = fy % 66;                               // cs:54916 / cs:55125
      if (flag3 && flag2) { fx = 110; fy = 66 + num5; }
      else if (flag3) { fx = 88; fy = num5; }             // cs:54920-54923（左接续帧）
      else if (flag2) { fx = 66; fy = 66 + num5; }        // cs:54924-54927（右接续帧）
      else { fx = 0; fy = num5; }
    }
    // 杀臂 4（cs:54938-54964 WithSettings=else-if 链 / cs:55147-55174 CheckTree=杀后续写）
    if (fy >= 132 && fy <= 176 && (fx === 0 || fx === 66 || fx === 88)) {
      const num6 = fy % 66;
      const reframe = (): void => {
        if (num2 !== type && num3 !== type) { fx = 0; fy = num6; }
        else if (num2 !== type) { fx = 0; fy = 132 + num6; }
        else if (num3 !== type) { fx = 66; fy = 132 + num6; }
        else { fx = 88; fy = 132 + num6; }
      };
      if (settings) {
        if (!flag) kill();
        else reframe();
      } else {
        if (num4 !== 2) kill();
        if (!killed) reframe();                           // CheckTree 杀后续写=原版字面（死格写,本仓跳过）
      }
    }
    // 杀臂 5（cs:54966-54979 / cs:55175-55192）——两函数在 5a/5b 的左右判镜像同构
    if ((fx === 66 && (fy === 0 || fy === 22 || fy === 44))
      || (fx === 44 && (fy === 198 || fy === 220 || fy === 242))) {
      if (!flag2) kill();                                 // 5a：右邻失续（cs:54968/cs:55177）
    } else if ((fx === 88 && (fy === 66 || fy === 88 || fy === 110))
      || (fx === 66 && (fy === 198 || fy === 220 || fy === 242))) {
      if (!flag3) kill();                                 // 5b：左邻失续（cs:54975/cs:55184）
    } else if (num4 === -1 || (!settings && num4 === 23)) {
      kill();                                             // 5c：下方亡（cs:54980/cs:55189——23 支系归一后死码,照抄）
    } else if (num !== type && fy < 198 && ((fx !== 22 && fx !== 44) || fy < 132)) {
      // 5d 干身重锚（cs:54984-55028 / cs:55193-55236）
      const num7 = fy % 66;
      if (flag3 || flag2) {
        if (num4 === type) {
          if (flag3 && flag2) { fx = 132; fy = 132 + num7; }
          else if (flag3) { fx = 132; fy = num7; }
          else if (flag2) { fx = 132; fy = 66 + num7; }
        } else if (flag3 && flag2) { fx = 154; fy = 132 + num7; }
        else if (flag3) { fx = 154; fy = num7; }
        else if (flag2) { fx = 154; fy = 66 + num7; }
      } else {
        fx = 110; fy = num7;
      }
    }
    if (!killed && (fx !== fx0 || fy !== fy0)) {
      st.frameX[i] = fx;
      st.frameY[i] = fy;
    }
    return killed;
  }

  /** CheckPalmTree（cs:54821-54877,case 323 派发 cs:87191）：棕榈单格整树——下格
   *  沙族归一（234/116/112→53,cs:54834-54847）失配即杀;frameX 66/220 特支（顶段
   *  沙门）;上邻异型重锚掷 genRand.Next(7,10)（cs:54851,杀臂后 -1≤44 照掷=原版字面）。 */
  private palmCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    const i = st.idx(x, y);
    const type = sheetOf(st.type[i]);
    const fx0 = st.frameX[i];
    const fy0 = st.frameY[i];
    let fx = fx0;
    let fy = fy0;
    const num = this.active(x, y - 1) ? sheetOf(this.typeAt(x, y - 1)) : -1;      // 上（cs:54828-54831）
    let num2 = this.active(x, y + 1) ? sheetOf(this.typeAt(x, y + 1)) : -1;       // 下
    if (num2 === 234 || num2 === 116 || num2 === 112) num2 = 53;                  // cs:54834-54847
    let killed = false;
    if (num2 !== 53 && num2 !== type) {
      if (this.killFlat(x, y)) { killed = true; fx = -1; fy = -1; }
    }
    if ((fx === 66 || fx === 220) && num2 !== 53) {                               // cs:54848-54851
      if (this.killFlat(x, y)) { killed = true; fx = -1; fy = -1; }
    }
    if (num !== type && fx <= 44) fx = (7 + Math.floor(this.rng() * 3)) * 22;     // genRand.Next(7,10)
    else if (num !== type && fx === 66) fx = 220;                                 // cs:54854-54856
    if (!killed && (fx !== fx0 || fy !== fy0)) {
      st.frameX[i] = fx;
      st.frameY[i] = fy;
    }
    return killed;
  }

  /** TileFrame case 72 内联（cs:87106-87140 蘑菇树）：下格 ∉{72,70} → 杀（整树
   *  单列坍塌面）;上邻异型且 frameX==0 → 重锚掷 genRand.Next(3)（frameX=18,
   *  frameY=0/18/36）。 */
  private mushroomTreeCheckAt(x: number, y: number): boolean {
    const st = this.host.store;
    const i = st.idx(x, y);
    const type = sheetOf(st.type[i]);
    const fx0 = st.frameX[i];
    const fy0 = st.frameY[i];
    let fx = fx0;
    let fy = fy0;
    const num12 = this.active(x, y - 1) ? sheetOf(this.typeAt(x, y - 1)) : -1;    // 上（cs:87109-87114）
    const num11 = this.active(x, y + 1) ? sheetOf(this.typeAt(x, y + 1)) : -1;    // 下
    let killed = false;
    if (num11 !== type && num11 !== 70) {
      if (this.killFlat(x, y)) { killed = true; fx = -1; fy = -1; }
    } else if (num12 !== type && fx === 0) {                                      // cs:87117-87131
      const num13 = Math.floor(this.rng() * 3);                                   // genRand.Next(3)
      fx = 18;
      fy = num13 * 18;
    }
    if (!killed && (fx !== fx0 || fy !== fy0)) {
      st.frameX[i] = fx;
      st.frameY[i] = fy;
    }
    return killed;
  }

  private mechAny(): boolean {
    const f = this.host.flags;
    return !!(f['downed_125'] || f['downed_126'] || f['downed_127'] || f['downed_134']);
  }
  private mechAll(): boolean {
    const f = this.host.flags;
    // 原版 downedMechBoss1/2/3 = 毁灭者(134)/双子(125)/机械骷髅王(127)
    return !!(f['downed_134'] && f['downed_125'] && f['downed_127']);
  }

  /** WorldGen.IsFitToPlaceFlowerIn（:58714-58734）+ PlaceTile 61/71 内联锚支
   *  （:60073/:60142）1:1：支撑格 active+slope==0+非半砖，类型严格配对。
   *  ★蔓延生成端此前无此门 → 斜面/半砖草上长蘑菇、腐化地长森林草（2026-08-26 用户实报,
   *  存档 (2059,242)=S1 草块上 1023 蘑菇 / (1014,241)=H 腐化草上 73 森林高草实证） */
  private fitTopPlant(x: number, y: number, want: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y + 1)) return false;
    const bi = st.idx(x, y + 1);
    if (!st.flags[bi] || st.slope[bi] !== 0 || st.half[bi]) return false;
    return flowerGroundOk(sheetOf(st.type[bi]), want);
  }

  /** 丛林株双列整平底门（PlaceJunglePlant :48226-48229 地基段：占宽两列的底行
   *  逐格 SolidTile && type==60）。bulb 238/fruit 236 底行 = j 行、第二列 i+1 */
  private fitJunglePairFlat(i: number, j: number): boolean {
    return this.solidTile(i, j) && sheetOf(this.typeAt(i, j)) === 60
      && this.solidTile(i + 1, j) && sheetOf(this.typeAt(i + 1, j)) === 60;
  }

  /** 进图一次性植物孤儿清整：全网格按 PlantCheck 处置历史遗留（读档/导入期写入的
   *  非法锚植株——运行时监听只护支撑变化后状态，粘滞件在此收口）。换型用
   *  TryGetNewType 同表；无法变型即静默清除（等价导入期 FinalCleanupPass）。
   *  ★②（2026-09-05）：noItem=true（原版生成/读档期 isGeneratingOrLoadingWorld →
   *  KillTile 强制 noItem,cs:64057-64059）——清整零掉落零骰。
   *  O(w·h) 单次线性，flags 先筛实活格，几十 ms 级。 */
  sanitizePlants(): void {
    const st = this.host.store;
    const { w } = st;
    const n = w * st.h;
    for (let i = 0; i < n; i++) {
      if (!st.flags[i]) continue;
      const sheet = sheetOf(st.type[i]);
      // PlantCheck 派发族 + 703 特支（与 killDependentAt 同一 single-source：plantCheckAt）
      if (!PLANT_CHECK_SHEETS.includes(sheet) && sheet !== 703) continue;
      const x = i % w, y = Math.floor(i / w);
      this.plantCheckAt(x, y, true);
    }
  }

  /** 放置 1×1 装饰（帧 style×18,0；目标须为空——PlaceTile EmptyTile 门） */
  private place1(x: number, y: number, sheet: number, style = 0, variants = 1, fy = 0): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y) || this.active(x, y)) return false;
    const t = S(sheet);
    if (!t) return false;
    st.setTile(x, y, t, (style + (variants > 1 ? Math.floor(this.rng() * variants) : 0)) * 18, fy);
    return true;
  }

  /** CheckAndAdjustMultiDirectionalTile（cs:60805-60855）× TileFrameImportant case 129/149
   *  （cs:86339-86369）帧向落定：锚=active 且非巨石/关门（TileID.Sets.Boulders :195 +
   *  type 10）且按向 SolidTileAllow*Slope（ValidAnchorForMultiDirectionalTile cs:60788-
   *  60803）且锚型 tileSolid && !tileSolidTop（cs:60838-60852）。优先级 下>左>右>上 →
   *  frameY 0(站立)/54(左锚右伸)/36(右锚左伸)/18(垂挂)。无锚返回 -1（=原版 KillTile/
   *  PlaceTile 拒绝语义,调用方决定杀或不落）。 */
  private multiDirFrameY(x: number, y: number): number {
    const st = this.host.store;
    const anchor = (ax: number, ay: number, dir: number): boolean => {
      if (!st.inBounds(ax, ay) || !this.active(ax, ay)) return false;
      const sh = sheetOf(this.typeAt(ax, ay));
      if (sh < 0 || MULTI_DIR_ANCHOR_INVALID.has(sh)) return false;
      if (dir === 0 && !this.solidTileAllowTopSlope(ax, ay)) return false;
      if (dir === 1 && !this.solidTileAllowBottomSlope(ax, ay)) return false;
      if (dir === 2 && !this.solidTileAllowLeftSlope(ax, ay)) return false;
      if (dir === 3 && !this.solidTileAllowRightSlope(ax, ay)) return false;
      const d = TILE_DEFS[this.typeAt(ax, ay)];
      return !!d && d.solid && !d.platform;
    };
    if (anchor(x, y + 1, 1)) return 0;    // 下方锚 → 站立（cs:60838 newFrameDirection=0）
    if (anchor(x - 1, y, 2)) return 54;   // 左锚 → frameY 54
    if (anchor(x + 1, y, 3)) return 36;   // 右锚 → frameY 36
    if (anchor(x, y - 1, 0)) return 18;   // 上锚 → 垂挂
    return -1;
  }
  /** 放置 w×h 整件（帧 dx*18, dy*18；区域全空才放）。styleX=样式基偏移（X 轴，
   *  如 2×2 横排样式族 style*36，TileObjectData StyleHorizontal=true） */
  private placeBlock(x: number, y: number, sheet: number, w: number, h: number, styleX = 0): boolean {
    const st = this.host.store;
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
      if (!st.inBounds(x + dx, y + dy) || this.active(x + dx, y + dy)) return false;
    }
    const t = S(sheet);
    if (!t) return false;
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
      st.setTile(x + dx, y + dy, t, styleX + dx * 18, dy * 18);
    }
    return true;
  }

  // ================= 保底世花球茎（GeneratePlanteraBulbOnAllMechsDefeated） =================

  /** WorldGen.GeneratePlanteraBulbOnAllMechsDefeated（cs:74180-74248）+ AttemptTo
   *  GeneratePlanteraBulbAt（cs:74250-74329）：三王全灭时在丛林侧搜索框
   *  [worldSurface, UnderworldLayer) 内掷 2500 点，逐点向上走找丛林草 60
   *  （<500 次后 forceBulb 允许泥 59，<200 次后允许非活动格）；找到即试
   *  (X,Y-1)/(X-1,Y-1)/(X+1,Y-1) 三锚，**恰好生成一个**花苞即返回。 */
  planteraBulbBurst(): boolean {
    const st = this.host.store;
    const { w } = st;
    const jungleLeft = this.host.dungeonX > w * 0.5;   // 丛林在地牢对侧（cs:74182）
    const x0 = Math.floor(jungleLeft ? w * 0.15 : w * 0.65);
    const x1 = Math.floor(jungleLeft ? w * 0.35 : w * 0.85);
    const yTop = Math.floor(this.host.worldSurface);
    const yBot = st.h - 200;                            // Main.UnderworldLayer（Main.cs:2863）
    let tries = 2500;
    while (tries > 0) {
      const forceBulb = tries < 500;                     // cs:74197 允许泥 59+计分档
      const allowInactive = tries < 200;                 // cs:74198
      tries--;
      let px = x0 + Math.floor(this.rng() * (x1 - x0));
      let py = yTop + Math.floor(this.rng() * (yBot - yTop));
      // 逐点向上走（≤500 步,cs:74206-74230）：flag2 时非活动格也算；命中 60/59 停
      let foundSheet = -1;
      let steps = 500;
      while (steps-- > 0) {
        py--;
        if (py < yTop) break;
        const sheet = sheetOf(this.typeAt(px, py));
        const act = this.active(px, py);
        if (allowInactive || act) {
          if (sheet === 60 || (forceBulb && sheet === 59)) { foundSheet = sheet; break; }
        }
      }
      if (foundSheet < 0) continue;
      // 三锚尝试（cs:74232-74246）：PlaceJunglePlant 锚=2×2 右下角 → placeBlock 左上角
      for (const ox of [0, -1, 1]) {
        if (this.attemptBulbAt(px + ox, py - 1, forceBulb)) return true;
      }
    }
    return false;
  }

  /** AttemptToGeneratePlanteraBulbAt（cs:74788-74869）+ PlaceJunglePlant 238 支
   *  （cs:48191-48256）。锚 (i,j)=花苞 2×2 右下角。
   *  ★BJ214 门结构修正（2026-09-20）：原版 force/非 force 两支门位不同——
   *  · force 支（cs:74790-74851）【无】前置底承/允许族门：计分 → ClearTile 4×4+
   *    边环转 60 → PlaceJunglePlant（其门在清场后天然满足：支撑行 j+1=n==1 全环
   *    转草 60、2×2=净空）——力档专为泥芯丛林内部掏窝设计；
   *  · 非力支（cs:74853-74867）经 PlaceJunglePlant 门（cs:48204-48230）+KillTile
   *    noItem 覆写。
   *  此前两门被提升到 force 之前 → 2×2 含泥即拒=力档在泥芯场景恒拒（bj214 探针
   *  定谳:自然再生面/burst 非力档均正常,唯 force 档死门）。
   *  2×2 允许族（cs:48204-48212）：空 / 强势草61 / 藤62 / 丛林植物233 /
   *  短草69 / 香蒲74 / 幌菊703 / 655 / 旗185(fy=0)——其余活动格即拒（仅非力档门）。
   *  非 force 先 KillTile(noItem) 覆写允许族再直写；force 档 4×4 计分
   *  （泥/草 +1,其余活动格 -1,黑名单 -1）≥12 才放,清 4×4+外环转草。
   *  ★写入走 setTileSilent：PlaceJunglePlant 是裸数组直写——非实体植物可与
   *  带水格共存（不清液）；普通 setTile 会唤起本仓液体监听器按"保水"语义把
   *  新块 kill 成 L 形残件（2026-08-30 实测定罪）。写完经 afterSilentTileWrite
   *  补渲染脏标（陨石同款）。 */
  private attemptBulbAt(i: number, j: number, forceBulb: boolean): boolean {
    const st = this.host.store;
    // PlaceJunglePlant 边距门（cs:48197-48199）：±5 内圈禁放
    if (i < 5 || i > st.w - 5 || j < 5 || j > st.h - 5) return false;
    if (forceBulb) {
      // ★BJ214 修：力档无前置底承/允许族门（原版序=计分→清 4×4+边环→落位,见头注）
      // 计分（cs:74255-74296）：4×4 邻域泥/草 +1、其余活动 -1；黑名单即 -1
      let score = 0;
      outer:
      for (let k = -2; k < 2; k++) {
        for (let l = -2; l < 2; l++) {
          const sh = sheetOf(this.typeAt(i + k, j + l));
          if (sh === 59 || sh === 60) score++;
          else if (this.active(i + k, j + l)) score--;
          if (BURST_BLACKLIST.has(sh)) { score = -1; break outer; }
        }
      }
      if (score < 12) return false;
      // 清 4×4 + 外环转丛林草（cs:74823-74831）——零掉落位次（原版 force 支 =
      //  ClearTile 非 KillTile,不掉落;此前 killNoItem 即为守住此面）。
      //  ★R-H1/F3：原版每格序 = ClearTile() → 边环直写 type=60 → SquareTileFrame
      //  （写后派发,每格一次,cs:74828-74831）;旧移植 killNoItem（清后立即派发）→
      //  setType(60)（再派发）=净偏差:底边环下方丛林藤 62 被第一拍"锚空"先杀
      //  （原版以新草 60 为锚存活）。改按原版序:静默清格（setTileSilent(0)=清
      //  active/half/slope/漆,不触发监听与派发）+边环直写 60（setTypeSilent）,
      //  每格末尾一次 frameDependents（SquareTileFrame 等价派发面）——格内全部
      //  写完再派发。原版 SquareTileFrame 对 16 格无条件（非活动格也派发）,本域
      //  killDependentAt 头门 active 对空格 no-op=可忽略差异,备案（R-H1/F3 注记）。
      for (let m = -2; m < 2; m++) {
        for (let n = -2; n < 2; n++) {
          st.setTileSilent(i + m, j + n, 0);
          if (m === -2 || m === 1 || n === -2 || n === 1) {
            st.setTileSilent(i + m, j + n, S(60)!, 0, 0);
          }
          this.frameDependents(i + m, j + n);
        }
      }
    } else {
      // 非力档=直落 PlaceJunglePlant（cs:74853-74867）——门=cs:48204-48230：
      // 底承:两列 j+1 行须实心丛林草
      if (!(st.inBounds(i - 1, j + 1) && st.inBounds(i, j + 1))) return false;
      if (!(this.solidTile(i - 1, j + 1) && sheetOf(this.typeAt(i - 1, j + 1)) === 60)) return false;
      if (!(this.solidTile(i, j + 1) && sheetOf(this.typeAt(i, j + 1)) === 60)) return false;
      // 2×2 允许族校验（原版字面集合；185 旗须 frameY===0）
      for (let dx = -1; dx <= 0; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          const ii = st.idx(i + dx, j + dy);
          if (!st.flags[ii]) continue;
          const sh = sheetOf(st.type[ii]!);
          const allow = sh === 61 || sh === 62 || sh === 233 || sh === 69 || sh === 74
            || sh === 703 || sh === 655 || (sh === 185 && (st.frameY[ii] ?? 0) === 0);
          if (!allow) return false;
        }
      }
      // 覆写允许族（cs:48238-48245 KillTile noItem）——非活动水格不动（原版同款共存）
      // ★②：noItem 位次（同上）,零掉落
      for (let dx = -1; dx <= 0; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          if (this.active(i + dx, j + dy)) this.killNoItem(i + dx, j + dy);
        }
      }
    }
    // 直写 2×2（frames：fx=36*styleX 列步 18,fy=行步 18;238 styleX=0 → 0/18 双列）,
    // 原版 num3=0（cs:48252-48268）。静默口=绕开液体监听保水互斥(见头注)
    const t = S(238);
    if (!t) return false;
    for (let dx = -1; dx <= 0; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        st.setTileSilent(i + dx, j + dy, t, dx === 0 ? 18 : 0, dy === 0 ? 18 : 0);
        // ★⑥ inheritPaint（AttemptToGeneratePlanteraBulbAt cs:74840/:74855 传 true,
        //  源=锚右列下一格 (i,j+1)——force 支该格=先写的外环草 60）
        this.copyPaintAndCoating(i, j + 1, i + dx, j + dy);
      }
    }
    // 静默口补渲染脏标（陨石同款）:force 支写面=4×4（含外环转草,R-H1/F3 静默化后
    // 监听器脏标一并消失）,非 force=2×2
    this.host.afterSilentTileWrite?.(forceBulb ? i - 2 : i - 1, forceBulb ? j - 2 : j - 1,
      forceBulb ? i + 1 : i, forceBulb ? j + 1 : j);
    return true;
  }

  // ================= 采样子分发（OvergroundTile cs:72066） =================

  private overgroundTile(i: number, j: number, wallDist: number): void {
    const st = this.host.store;
    const minI = Math.max(10, i - 1), maxI = Math.min(st.w - 10, i + 2);
    const minJ = Math.max(10, j - 1), maxJ = Math.min(st.h - 10, j + 2);
    if (!st.inBounds(i, j)) return;
    const t = this.typeAt(i, j);
    const act = this.active(i, j);
    // ★① 655 世纪之花荆棘清除（cs:72630-72636）：场上无存活世纪之花（NPC.AnyNPCs(262),
    //  NPCID.cs:11595 Plantera=262）→ KillTile（无掷骰）。独立 if 在 85/药草/贝壳链之前
    //  ——FTW 钩蔓撒的荆棘（bossAI_queenbee_plantera spawnPlanteraThorns,cs:76867）在
    //  花死亡/消散后由运行时演化收走。
    if (sheetOf(t) === 655 && !this.host.anyPlantera?.()) this.kill(i, j);
    // 药草族 → GrowAlch（三态生长/开花/淹死）。★RD-F9：链首支 type 裸读（cs:72626
    //  `else if (Main.tileAlch[Main.tile[i,j].type])` 无 active 门）——幽灵药草残型
    //  同走本支并吞后续贝壳支（else-if 优先级）;GrowAlch 头门 `!active() → return`
    //  （cs:46178-46180）=幽灵格掷而不落（本支无掷骰面,零流差）。
    // ★终审 A 收口（2026-09-04）：原版药草支在 else-if 链内（cs:72626）只吞其后的
    //  贝壳 else-if，**不拦**独立的 518/519/液体/nactive 链（cs:72734+）与墙蔓延段
    //  ——曾提前 return 吞掉药草样本的后续段（行为差+流位差）
    // 墓碑 85 → Abigail 花 624 播种（cs:72631-72634 链首支，type 裸读无 active 门——
    //  幽灵墓碑同走本支；门/掷骰见 tryGrowingAbigailsFlower）
    if (sheetOf(t) === 85) {
      this.tryGrowingAbigailsFlower(i, j);
    } else if (TILE_ALCH.has(sheetOf(t))) { this.growAlch(i, j); } else if (!act && j < this.host.worldSurface + 10) {
      // 海岸带判定（oceanDepths 简化：两侧 7% 带）
      const beach = 380;
      if (i < beach || i > st.w - beach) {
        let num5 = 3000 - Math.floor(Math.abs(this.host.windSpeedCurrent) * 1250);
        if (this.host.raining) num5 -= Math.floor(1250 * this.host.maxRaining);
        if (num5 < 300) num5 = 300;
        if (this.rng() * num5 < 1) {
          let k = j;
          while (k < this.host.worldSurface + 10 && !this.active(i, k) && k - j < 15) k++;
          if (this.active(i, k) && sheetOf(this.typeAt(i, k)) === 53) {
            const sandY = k;                                    // other=沙格（漆源,cs:72666）
            k--;
            if (this.typeAt(i, k) === S(324)) return;
            const need = 2 + Math.floor(this.rng() * 3);        // genRand.Next(2,5)
            const num7 = 8 + Math.floor(this.rng() * 3);        // ★⑥批补骰 genRand.Next(8,11)（cs:72664,此前漏掷+半径误恒 10）
            let cnt = 0;
            for (let l = i - num7; l <= i + num7; l++) for (let m = k - num7; m <= k + num7; m++) {
              const s = sheetOf(this.typeAt(l, m));
              if (this.active(l, m) && (s === 324 || s === 81)) cnt++;
            }
            if (cnt < need && this.solidTile(i, k + 1)) {
              // 贝壳/珊瑚锚面门（PlaceTile num==81 支 :59922-59934：下方 active+solid
              // +非半砖+slope==0；324 珊瑚同经 PlaceTile 口）——坡沙上不再放
              if (this.rng() < 0.5 && this.liquidAt(i, k) >= 230) {
                if (this.place1(i, k, 81, 0, 5)) this.copyPaintAndCoating(i, sandY, i, k);   // ★⑥ cs:72694
              } else if (this.place1(i, k, 324, 0, 8)) {
                this.copyPaintAndCoating(i, sandY, i, k);       // ★⑥ cs:72709
              }
            }
          }
        }
      }
    }
    // ★① 邪恶地树苗清除（cs:72721-72729）：595/596/615/616 树苗底承腐化草 23 ∨ 猩红草
    //  199（TileID.cs:483/:835——邪恶草双族）→ KillTile（无掷骰;底承 type 裸读无
    //  active 门=原版字面,幽灵残型照样比对）。独立 if——位次在贝壳链（cs:72642-72719）
    //  后、竹支（cs:72728）前。
    if ((sheetOf(t) === 596 || sheetOf(t) === 616 || sheetOf(t) === 595 || sheetOf(t) === 615)
      && (sheetOf(this.typeAt(i, j + 1)) === 199 || sheetOf(this.typeAt(i, j + 1)) === 23)) {
      this.kill(i, j);
    }
    // ★⑦ 竹 571/水下丛林草 60（cs:72728-72734 独立 if，先于 518 链）：
    //   Next(5)（type 门过即掷）→（60 源再掷 Next(30)）→ 上格空/61/74/518 →
    //   PlaceBamboo(i, j-1)（内掷见 placeBamboo）
    if ((sheetOf(t) === 571 || (sheetOf(t) === 60 && this.liquidAt(i, j - 1) > 0)) && this.rng() < 1 / 5
      && (!this.active(i, j - 1) || [61, 74, 518].includes(sheetOf(this.typeAt(i, j - 1))))
      && (sheetOf(t) !== 60 || this.rng() < 1 / 30)
      && this.placeBamboo(i, j - 1)) {
      // 原版仅 NetMessage.SendTileSquare（联机面,单机无对应）
    }
    // 睡莲采样品维护（cs:72734-72748）：干涸/半埋/上格实体浸水 → 拆除，否则 CheckLilyPad。
    // ★RD-F9：本支 type 裸读（cs:72734 `if (Main.tile[i,j].type == 518)` 无 active 门）
    //  ——幽灵 518 残型同走本支：kill 走 KillTile 头门（幽灵掷而不落,见 kill()）、
    //  CheckLilyPad 无 active 头门（liquidType 判/上格带水且空时上方生成真睡莲并清
    //  残型 cs:59741-59757,无掷骰面=零流差）。519 香蒲 CheckCatTail/GrowCatTail 列
    //  维护未接=既有口径（登记）——支位以排除式保留:幽灵/活性 519 均不落下方水面滚
    //  （cs:72743 else-if 互斥）。本支 return=原版 518/519/liquid>32/nactive 四段
    //  else-if 尾（墙蔓延两支在其链外,由下方共用段承接——本仓既有口径）。
    if (sheetOf(t) === 518) {
      const own = this.liquidAt(i, j);
      if (own === 0
        || (Math.floor(own / 16) >= 9 && this.solidTile(i, j - 1))
        || (this.liquidAt(i, j - 1) > 0 && this.active(i, j - 1))) {
        this.kill(i, j);
      } else {
        this.checkLilyPad(i, j);
      }
      return;
    }
    // ★③（2026-09-05）519 香蒲列维护（cs:72748-72756 地表支,else-if 链第 2 段——
    //  518 之后/flooded 之前,幽灵/已致动格同走 CheckCatTail（无活性门））：
    //  CheckCatTail 列维护/杀 + 活性 1/8（genRand.Next(8)==0）→ GrowCatTail + 复检。
    //  return=既有口径（同 518 注：链后墙蔓延/藤尾段对 519 样本无掷位无写面,登记）。
    //  活性 519 此前坠入 !flooded 段消费 hardUpdateWorld/plantDye 骰（原版 else-if
    //  互斥不该消费）——本支接入即原版流位对齐（采样骰位差=修复面,登记）。
    if (sheetOf(t) === 519) {
      this.checkCatTail(i, j);
      if (this.active(i, j) && this.rng() < 1 / 8) {
        this.growCatTail(i, j);
        this.checkCatTail(i, j);
      }
      return;
    }
    // ---- 原版链 5（cs:72734-73121）：518 / 519 / liquid>32 / nactive() 主链 / else 蛛网
    //      五段 else-if。★①主链门=nactive()（active&&!inActive）——已致动格落 else 支
    //      原地停摆=原版（cs:72793 `else if (nactive())` / :73114 else）。★⑦ liquid>32 支
    //      （cs:72757-72790）：活性格 SlowlyDiesInWater 水淹杀（TileID.cs:249 表,无掷骰）
    //      ∨ 60/226 水淹 GrassGrowth；非活性格 1/600 睡莲/香蒲——浸水格不入主链
    //      （else-if 互斥）,但链后仍走墙蔓延+藤尾共用段。
    const flooded = this.liquidAt(i, j) > 32;
    if (flooded) {
      if (act) {
        if (SLOWLY_DIES_IN_WATER.has(sheetOf(t))) {
          this.kill(i, j);
        } else if (sheetOf(t) === 60 || sheetOf(t) === 226) {
          this.grassGrowth(i, j, minI, maxI, minJ, maxJ, false);
        }
      } else if (sheetOf(t) !== 519) {
        // ★RD-F9：519 残型格不落本支（cs:72743 else-if 先吞,支位以排除式保留——既有口径）
        if (this.rng() < 1 / 600) this.place1(i, j, 518);
        else if (this.rng() < 1 / 600) this.place1(i, j, 519);
      }
    } else if (!st.isActive(i, j)) {
      // else 支（cs:73114-73121）：非 nactive（幽灵残型/已致动/纯空格）——墙 62+无液 GrowWeb
      if (st.wall[this.at(i, j)] === 62 && this.liquidAt(i, j) === 0) this.growWeb(i, j);
      return; // TrySpawningTownNPC 走独立刷怪系统
    }
    if (!flooded) {
      // hardUpdateWorld（困难模式邪恶/神圣/水晶/叶绿）+ 染料植物
      this.hardUpdateWorld(i, j);
      if (this.rng() < 1 / 3000) this.plantDye(i, j, false);
      else if (this.hardMode && (i < st.w * 0.4 || i > st.w * 0.6) && this.rng() < 1 / 15000) this.plantDye(i, j, true);

      const sheet = sheetOf(t);
      if (sheet === 80) { // 仙人掌
        if (this.rng() < 1 / 15) this.growCactus(i, j);
      } else if (sheet === 529) {
        // ★⑦ 海燕麦 529（cs:72800-72805）：CheckSeaOat 失败即 KillTile（海况门）；
        //   过门后 1/20 → GrowSeaOat（frameX<180 → +=90）
        if (this.seaOatWaterCheck(i, j)) {
          if (this.rng() < 1 / 20) this.growSeaOat(i, j);
        } else {
          this.kill(i, j);
        }
      } else if (CONV_SAND.has(sheet)) {
        // 沙族（cs:72817-72871）：★⑦ 绿洲植物 530（1/25）+ 海燕麦播种 549（1/20,
        //   成功则跳过贝壳/仙人掌段）+ 海洋贝壳（oceanDistance=250 带,cs:4069,1/500）
        //   / 内陆仙人掌（1/300）
        if (!this.active(i, minJ)) {
          if (this.rng() < 1 / 25) this.placeOasisPlant(i, minJ);
          if (this.rng() >= 1 / 20 || !this.plantSeaOat(i, minJ)) {
            const oceanBand = i < 250 || i > st.w - 250;
            if (oceanBand) {
              if (this.rng() < 1 / 500) {
                let cnt = 0;
                for (let n = i - 7; n <= i + 7; n++) for (let m = minJ - 7; m <= minJ + 7; m++) {
                  if (this.active(n, m) && sheetOf(this.typeAt(n, m)) === 81) cnt++;
                }
                if (cnt < 6 && this.liquidAt(i, minJ) === 255 && this.liquidAt(i, minJ - 1) === 255
                  && this.liquidAt(i, minJ - 2) === 255 && this.liquidAt(i, minJ - 3) === 255
                  && this.liquidAt(i, minJ - 4) === 255) {
                  this.place1(i, minJ, 81, 0, 5);
                }
              }
            } else if (i > 380 + 20 && i < st.w - 380 - 20 && this.rng() < 1 / 300) {
              this.growCactus(i, j);
            }
          }
        }
      } else if (sheet === 530) {
        // ★⑦ 绿洲植物维护（cs:72873-72882）：OasisPlantWaterCheck(boost) 失败 → KillTile
        if (!this.oasisPlantWaterCheck(i, j, true)) this.kill(i, j);
      } else if (SNOW_FAMILY.has(sheet)) {
        // 雪原/冰：1/10 悬挂钟乳石（cs:72310-72351 PlaceTight）
        if (this.rng() < 1 / 10 && !this.active(i, j + 1) && !this.active(i, j + 2)) {
          let cnt = 0;
          for (let x = i - 3; x < i + 4; x++) for (let y = j; y <= j + 3; y++) {
            if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 165) cnt++;
          }
          if (cnt < 2) this.placeTight(i, j + 1);
        }
      } else if (sheet === 254) {
        // 南瓜株成长（⚠️3 2026-08-22 批，cs:72376-72380）：Next((frameX+10)/10)==0 →
        // GrowPumpkin（:52522——stage=fx/36 逐档 1/1·1/4·1/8·1/11,stage≥4 停）
        if (this.rng() < 1 / Math.max(1, Math.floor((st.frameX[this.at(i, j)] + 10) / 10))) {
          this.growPumpkin(i, j);
        }
      } else if (sheet === 78 || sheet === 380 || sheet === 579) {
        // 陶罐 78/花盆箱 380/石魔像头 579 顶部随机杂草（⚠️3,cs:72381-72390）：
        // 上格空 + genRand.Next(2)==0 → PlaceTile(3)（杂草 frameX=Next(5)*18,cs:59700-59704）
        if (!this.active(i, j - 1) && this.rng() < 0.5) this.place1(i, j - 1, 3, 0, 5);
      } else if (SPREAD_OVERGROUND.has(sheet)) {
        this.grassGrowth(i, j, minI, maxI, minJ, maxJ, false);
        if ((sheet === 32 || sheet === 352) && this.rng() < 1 / 3) {
          this.growSpike(i, j, sheet, sheet === 32 ? 23 : 199);
        }
      } else if (TILE_MOSS.has(sheet) || TILE_MOSS_BRICK.has(sheet)) {
        this.mossUpdate(i, j, minI, maxI, minJ, maxJ);
      } else if (sheet === 3 && this.rng() < 1 / 20) {
        // 杂草 → 花（cs:72465-72476；帧 144=蘑菇位除外）
        const fx = st.frameX[this.at(i, j)];
        if (fx !== 144) this.setType(i, j, S(73));
      } else if (sheet === 110 && this.rng() < 1 / 20) {
        // 神圣杂草 → 花
        const fx = st.frameX[this.at(i, j)];
        if (fx < 144) this.setType(i, j, S(113));
      }
    }
    // 墙蔓延（邪恶草墙/硬化沙墙）
    if (this.allowedToSpread) {
      this.spreadGrassWalls(wallDist, i, j);
      this.spreadDesertWalls(wallDist, i, j);
    }
    // ---- 藤蔓各族（cs:73123-72852 尾段,cs:73123 `if (nactive())` 二次门）——
    //      ★①与主链同门 nactive()：已致动格不入（原版字面）
    if (!st.isActive(i, j)) return;
    const t2 = this.typeAt(i, j);
    const s2 = sheetOf(t2);
    // 61 丛林矮草 1/3 → 74 高草（神庙砖上方不长，cs:72591）
    if (s2 === 61 && this.rng() < 1 / 3 && sheetOf(this.typeAt(i, j + 1)) !== 226
      && st.frameX[this.at(i, j)] < 144) {
      if (this.rng() < 1 / 4) st.setTile(i, j, t2, 162 + Math.floor(this.rng() * 8) * 18, st.frameY[this.at(i, j)]);
      this.setType(i, j, S(74));
      return;
    }
    // 普通藤（cs:72537-72589）：草 2/藤 52/花藤 382（墙 68/65/66/63 → 花藤）。
    // 原版 num24 归一为 1（cs:72551-72554）——挂靠草存在即长
    if (s2 === 2 || s2 === 52 || s2 === 382 || (s2 === 192 && this.rng() < 1 / 10)) {
      // num24 归一 1（cs:73087-73090）——Next(1) 恒 0 但**消费一掷**（UnifiedRandom.Next
      // (maxValue) 恒走 Sample(),UnifiedRandom.cs:135-147;同 growCheckSeaweed Next(1) 先例,
      // 旧码漏掷=块内所有掷位整体前移一掷,一并归位）
      if (this.rng() < 1 && this.growMoreVines(i, j) && !this.active(i, j + 1) && !this.isLava(i, j + 1)) {
        let vine = 52;
        if (s2 === 382) {
          vine = 382;
        } else if (s2 !== 52) {
          const wl = st.wall[this.at(i, j)], wl2 = st.wall[this.at(i, j + 1)];
          if (wl === 68 || wl === 65 || wl === 66 || wl === 63) vine = 382;
          else if (wl2 === 68 || wl2 === 65 || wl2 === 66 || wl2 === 63) vine = 382;
          // ★④ remix 花藤掷（cs:73108-73111）：remix ∧ Next(5)==0 → 花藤 382——原版
          //  独立 if,在两段墙判之后、无论墙判成败都掷（仅顶格非 52/382 时进此域）
          if (this.host.remixWorld && this.rng() < 1 / 5) vine = 382;
        }
        if (this.hasSupport(i, j, 2)) {
          this.setType(i, j + 1, S(vine));
          this.copyPaintAndCoating(i, j, i, j + 1);              // ★⑥ cs:73129-73131
        }
      }
      return;
    }
    this.vineFamily(i, j, s2);
  }

  /** 各色藤蔓家族通用段（cs:72614-72852 Underground/Overground 同构）：
   *  grassSheet=蔓挂靠的草族, vineSheet=要长的藤, vineCap=1/N 概率, vineTopSheet=可续接的顶 */
  private vineFamily(i: number, j: number, s2: number): void {
    let maxV = 0, anchorSheets: number[] = [], vineSheet = -1;
    switch (s2) {
      // 丛林藤（60 草/62 藤/384 叶/226 神庙砖）：30；62=10；226=20 且密度门（cs:72602-72649）
      case 60: case 384: maxV = 30; anchorSheets = [60, 384, 226]; vineSheet = 62; break;
      case 62: maxV = 10; anchorSheets = [60, 384, 226]; vineSheet = 62; break;
      case 226:
        if (this.tooManyJungleVines(i, j)) return;
        maxV = 20; anchorSheets = [60, 384, 226]; vineSheet = 62; break;
      // 蘑菇藤（70/528）：70 / 7（cs:72652-72684）
      case 70: maxV = 70; anchorSheets = [70]; vineSheet = 528; break;
      case 528: maxV = 7; anchorSheets = [70]; vineSheet = 528; break;
      // 神圣藤（109/115）：60 / 20（cs:72687-72720）
      case 109: maxV = 60; anchorSheets = [109]; vineSheet = 115; break;
      case 115: maxV = 20; anchorSheets = [109]; vineSheet = 115; break;
      // 腐化藤（23/661/636）：60 / 20（cs:72723-72756）
      case 23: case 661: maxV = 60; anchorSheets = [23, 661]; vineSheet = 636; break;
      case 636: maxV = 20; anchorSheets = [23, 661]; vineSheet = 636; break;
      // 猩红藤（199/662/205）：60 / 20（cs:72759-72792）
      case 199: case 662: maxV = 60; anchorSheets = [199, 662]; vineSheet = 205; break;
      case 205: maxV = 20; anchorSheets = [199, 662]; vineSheet = 205; break;
      // 灰烬藤（633/638）：70 / 7（cs:72795-72831）
      case 633: maxV = 70; anchorSheets = [633]; vineSheet = 638; break;
      case 638: maxV = 7; anchorSheets = [633]; vineSheet = 638; break;
      default: return;
    }
    if (!this.growMoreVines(i, j)) return;
    if (this.rng() >= 1 / maxV) return;
    if (this.active(i, j + 1) || this.isLava(i, j + 1)) return;
    // 向上 10 格内找挂靠草（原版扫描任一途经格 bottomSlope 即中断——cs:72602-72792
    // 各族同构；曾仅判 type 漏坡底中断=下缘削坡草上垂藤，全族审查补齐）
    let ok = false;
    for (let y = j; y > j - 10; y--) {
      if (!this.host.store.inBounds(i, y)) break;
      const sl = this.host.store.slope[this.host.store.idx(i, y)];
      if (sl === 3 || sl === 4) break;
      if (this.active(i, y) && anchorSheets.includes(sheetOf(this.typeAt(i, y)))) { ok = true; break; }
    }
    if (ok) {
      this.setType(i, j + 1, S(vineSheet));
      this.copyPaintAndCoating(i, j, i, j + 1);                  // ★⑥ cs:73184-73373 各族同构
    }
  }

  /** 藤顶挂靠检查（普通藤专用：向上找 2 号草，cs:72563-72579） */
  private hasSupport(i: number, j: number, grassSheet: number): boolean {
    const st = this.host.store;
    for (let y = j; y > j - 10; y--) {
      if (!st.inBounds(i, y)) break;
      // 原版扫描任一途经格 bottomSlope 即败（cs:73097-73107/72733 同构——
      // 下缘削坡的块挂不住藤；hasSupportMulti 早已有此中断，此处补齐）
      const sl = st.slope[st.idx(i, y)];
      if (sl === 3 || sl === 4) return false;
      if (this.active(i, y) && sheetOf(this.typeAt(i, y)) === grassSheet) return true;
    }
    return false;
  }

  // ================= UndergroundTile（cs:73266） =================

  private undergroundTile(i: number, j: number, wallDist: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const minI = Math.max(10, i - 1), maxI = Math.min(st.w - 10, i + 2);
    const minJ = Math.max(10, j - 1), maxJ = Math.min(st.h - 10, j + 2);
    const t = this.typeAt(i, j);
    const sheet = sheetOf(t);
    // ★RD-F4（2026-09-04）按原版括号深度重构（UpdateWorld_UndergroundTile cs:73804-74555）：
    //  ① 药草支 type 裸读（cs:73839 `if (Main.tileAlch[…type])`）——幽灵药草残型同走
    //     GrowAlch（其头门 `!active() → return` cs:46178-46180=掷而不落,无掷骰面零流差）;
    //  ② nactive() 主链（cs:73841）——幽灵/已致动格不入主链（此前整段 active 早退=
    //     幽灵格零演化、蛛网/墙蔓延两支整缺）;
    //  ③ else 支（cs:74422-74429）：非活性格（含幽灵残型/已致动）墙 62+无液 → GrowWeb
    //     （1/10 先掷 cs:74682-74684;GrowWeb 内 `!active()` 门使已致动格掷而不落
    //     cs:74693-74694）+ TrySpawningTownNPC（本仓由独立刷怪系统承载,无对应面——
    //     登记不补）;
    //  ④ 墙蔓延两支（cs:74430-74435）对所有采样格跑、不分活性——WALL 支裸读
    //     Spreads*[wall],tile 支自带 active 门（spreadGrassWalls 内已归一,复用）;
    //  ⑤ cs:74437 `if (!nactive()) return;` 其后 61→74 / 60·226·62 / 633·638 …
    //     藤尾第二掷段（cs:74439+）★④（2026-09-05）已接（见函数尾）。
    // ★终审 A 收口（2026-09-04）：原版药草支是 else-if 链首支（cs:73838），其后的
    //  墙蔓延段（cs:74430-35）与 !nactive 尾门对【包括药草在内】的所有采样格执行
    //  ——曾提前 return 吞掉药草样本的墙蔓延（行为差+流位差 0-2 掷）
    // ★①F1（2026-09-04 蓝队 M24 补遗）：地下 655 荆棘清除（cs:73830-73837
    //  UndergroundTile 首个独立 if,位次在药草支 cs:73838-73839 之前）——地表支
    //  （cs:72630-72636）的孪生：场上无存活世纪之花（NPC.AnyNPCs(262)）→ KillTile
    //  （无掷骰）。FTW 荆棘在花死后由地下采样同样收走（此前整缺）。
    if (sheet === 655 && !this.host.anyPlantera?.()) this.kill(i, j);
    if (TILE_ALCH.has(sheet)) { this.growAlch(i, j); } else if (!st.isActive(i, j)) {
      if (st.wall[this.at(i, j)] === 62 && this.liquidAt(i, j) === 0) this.growWeb(i, j);
    } else {
      this.hardUpdateWorld(i, j);
      if (this.rng() < 1 / 2500) this.plantDye(i, j, false);
      else if (this.hardMode && this.rng() < 1 / 10000) this.plantDye(i, j, true);
      // ★③ 519 香蒲列维护（cs:73853-73861 地下支）：nactive() 段内【独立 if】（非
      //  else-if——其后 549 链继续求值,519 不入各支=零骰零写）；CheckCatTail 无活性门,
      //  生长掷 1/2（地下 genRand.Next(2)==0,≠地表 Next(8),cs:73858 字面）。
      if (sheet === 519) {
        this.checkCatTail(i, j);
        if (this.active(i, j) && this.rng() < 1 / 2) {
          this.growCatTail(i, j);
          this.checkCatTail(i, j);
        }
      }
      // ---- 原版 else-if 链（cs:73305-73788）：60 走 GrassGrowth 被消费，
      //      丛林藤(62)/蜂巢由既有藤 tile 驱动生长 ----
      // ★⑦ 海草 549（cs:73908-73916）：549 直档 / 沙 53 播种档（非顶坡+非半砖+
      //    上格空+1/20）→ GrowCheckSeaweed（浅水杀 1/2 ∨ 深水播种）
      if (sheet === 549) {
        this.growCheckSeaweed(i, j);
      } else if (sheet === 53 && st.slope[this.at(i, j)] !== 1 && st.slope[this.at(i, j)] !== 2
        && !st.half[this.at(i, j)] && !this.active(i, j - 1) && this.rng() < 1 / 20) {
        this.growCheckSeaweed(i, j);
      } else if (SPREAD_UNDERGROUND.has(sheet)) {
        this.grassGrowth(i, j, minI, maxI, minJ, maxJ, true);
        if ((sheet === 32 || sheet === 352) && this.rng() < 1 / 3) {
          this.growSpike(i, j, sheet, sheet === 32 ? 23 : 199);
        }
      } else if (sheet === 61 && this.rng() < 1 / 3 && sheetOf(this.typeAt(i, j + 1)) !== 226
        && st.frameX[this.at(i, j)] < 144) {
        // 61 → 74 高草（cs:73336-73352）
        if (this.rng() < 1 / 4) st.setTile(i, j, t, 162 + Math.floor(this.rng() * 8) * 18, st.frameY[this.at(i, j)]);
        this.setType(i, j, S(74));
      } else if ((sheet === 60 || sheet === 62) && this.rng() < 1 / 5 && this.growMoreVines(i, j)) {
        // 丛林藤延长（62 驱动，cs:73355-73393）
        if (!this.active(i, j + 1) && !this.isLava(i, j + 1) && this.hasSupportMulti(i, j, [60])) {
          this.setType(i, j + 1, S(62));
          this.copyPaintAndCoating(i, j, i, j + 1);              // ★⑥ cs:73923-73925
        }
      } else if ((sheet === 633 || sheet === 638) && this.growMoreVines(i, j)) {
        // 灰烬藤（cs:73403-73430）
        const maxV = sheet === 638 ? 7 : 70;
        if (this.rng() < 1 / maxV && !this.active(i, j + 1) && !this.isLava(i, j + 1)
          && this.hasSupportMulti(i, j, [633])) {
          this.setType(i, j + 1, S(638));
          this.copyPaintAndCoating(i, j, i, j + 1);              // ★⑥ cs:74081-74083
        }
      } else if ((sheet === 60 || sheet === 62) && this.rng() < 1 / 80 && !this.playerLOS(i, j)) {
        // 蜂巢再生（444 2×2，cs:73541-73605）：62 藤位锚定，主体行 = j（替换藤位，
        // 原版 num15 = j for 62）；60 驱动则为 j+1
        this.placeJungleBlock2x2(i, j, 444, sheet === 62 ? j : j + 1);
      } else if (sheet === 396 && this.rng() < 1 / 80 && !this.playerLOS(i, j)) {
        // 蚁狮幼虫（485/稀有 751，cs:73608-73693）：PlaceTile(i, j-1, num24, style)——
        // 两 id 均 Style2x2（TileObjectData.cs:3504-3511 / 3997-4011），主体占 j-2..j-1 两行
        // （锚 Origin=(0,1) 底行坐沙面）；485 变体 StyleHorizontal+WrapLimit4 →
        // frameX=style*36（cs:73687 style=genRand.Next(4)；此前 1×1+style*18 双错）
        // 双列整平底门（原版 Style2x2 走 PlaceTile→TileObject 锚校验：底行两列
        // 均须 active+solid+非半砖+slope0——沙岩坡缘不再挂幼虫堆；底行=j 本排）
        if (this.solidTile(i, j) && this.solidTile(i + 1, j)) {
          if (this.rng() < 1 / 100) {
            this.placeBlock(i, j - 2, 751, 2, 2);
            this.inheritAntLarvaPaint(i, j, 751);
          } else {
            let clear = true;
            for (let d = -1; d >= -3; d--) { if (this.active(i, j + d)) { clear = false; break; } }
            if (clear) {
              this.placeBlock(i, j - 2, 485, 2, 2, Math.floor(this.rng() * 4) * 36);
              this.inheritAntLarvaPaint(i, j, 485);
            }
          }
        }
      } else if (sheet === 69) {
        this.growSpike(i, j, 69, 60);
      } else if (SNOW_FAMILY.has(sheet)) {
        // 冰雪钟乳石再生（cs:73704-73751）
        if (this.rng() < 1 / 10 && !this.active(i, j + 1) && !this.active(i, j + 2)) {
          let cnt = 0;
          for (let x = i - 3; x < i + 4; x++) for (let y = j; y <= j + 3; y++) {
            if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 165) cnt++;
          }
          if (cnt < 2) this.placeTight(i, j + 1);
        }
      } else if (TILE_MOSS.has(sheet) || TILE_MOSS_BRICK.has(sheet)) {
        this.mossUpdate(i, j, minI, maxI, minJ, maxJ);
      } else if (sheet === 661 || sheet === 636 || sheet === 662 || sheet === 205 || sheet === 70 || sheet === 528) {
        // 地下藤族延长（cs:73433-73502）：70/528 蘑菇藤、661/636 腐化藤、662/205 猩红藤
        if (sheet === 70 || sheet === 528) {
          const maxV = sheet === 528 ? 7 : 70;
          if (this.growMoreVines(i, j) && this.rng() < 1 / maxV
            && !this.active(i, j + 1) && !this.isLava(i, j + 1)
            && this.hasSupportMulti(i, j, [70])) {
            this.setType(i, j + 1, S(528));
            this.copyPaintAndCoating(i, j, i, j + 1);            // ★⑥ cs:73961-73963
          }
        } else {
          const corrupt = sheet === 661 || sheet === 636;
          const maxV = (sheet === 636 || sheet === 205) ? 7 : 70;
          if (this.growMoreVines(i, j) && this.rng() < 1 / maxV
            && !this.active(i, j + 1) && !this.isLava(i, j + 1)
            && this.hasSupportMulti(i, j, corrupt ? [661] : [662])) {
            this.setType(i, j + 1, S(corrupt ? 636 : 205));
            this.copyPaintAndCoating(i, j, i, j + 1);            // ★⑥ cs:74001-74003/:74041-74043
          }
        }
      }
    }
    // ④ 墙蔓延（邪恶草墙/硬化沙墙）——所有采样格（cs:74430-74435 无活性前置）
    if (this.allowedToSpread) {
      this.spreadGrassWalls(wallDist, i, j);
      this.spreadDesertWalls(wallDist, i, j);
    }
    // ⑤ cs:74437 !nactive() 即返
    if (!st.isActive(i, j)) return;
    // ★④（2026-09-05）藤尾第二掷段（cs:74439-74534,nactive 域内=活性格才达）：
    //  61→74（cs:74439-74450）+ 60·226·62 / 633·638 / 70·528 三段藤尾（独立
    //  if/else-if/else,主链同名支之外的原版第二位次——同格每 tick 至多两掷藤骰）。
    //  掷位：GrowMoreVines 短路在前、Next(cap) 在后、目标 active/anyLava 同支短路;
    //  写面 CopyPaintAndCoating（cs:74451/74489/74531,源=采样格 i,j）。
    const t2 = this.typeAt(i, j);
    const s2 = sheetOf(t2);
    if (s2 === 61 && this.rng() < 1 / 3 && sheetOf(this.typeAt(i, j + 1)) !== 226
      && st.frameX[this.at(i, j)] < 144) {
      if (this.rng() < 1 / 4) {                                // Main.rand.Next(4)（⑦定谳=同流）
        st.setTile(i, j, t2, 162 + Math.floor(this.rng() * 8) * 18, st.frameY[this.at(i, j)]);
      }
      this.setType(i, j, S(74));                               // 原版裸 type 写（主链同款 setType 口）
    }
    if ((s2 === 60 || s2 === 226 || s2 === 62) && this.growMoreVines(i, j)) {
      const maxV = s2 === 62 ? 10 : 30;
      if (this.rng() >= 1 / maxV || this.active(i, j + 1) || this.isLava(i, j + 1)) return;
      if (this.hasSupportMulti(i, j, [60, 226])) {
        this.setType(i, j + 1, S(62));
        this.copyPaintAndCoating(i, j, i, j + 1);
      }
    } else if ((s2 === 633 || s2 === 638) && this.growMoreVines(i, j)) {
      const maxV = s2 === 638 ? 7 : 70;
      if (this.rng() >= 1 / maxV || this.active(i, j + 1) || this.isLava(i, j + 1)) return;
      if (this.hasSupportMulti(i, j, [633])) {
        this.setType(i, j + 1, S(638));
        this.copyPaintAndCoating(i, j, i, j + 1);
      }
    } else if (s2 === 70 || s2 === 528) {
      if (!this.growMoreVines(i, j)) return;
      const maxV = s2 === 528 ? 7 : 70;
      if (this.rng() >= 1 / maxV || this.active(i, j + 1) || this.isLava(i, j + 1)) return;
      if (this.hasSupportMulti(i, j, [70])) {
        this.setType(i, j + 1, S(528));
        this.copyPaintAndCoating(i, j, i, j + 1);
      }
    }
  }

  /** ★⑥ 蚁狮幼虫位次的漆继承（cs:74227-74242）：PlaceTile(num24=485/751) 落位后
   *  3×2 扫描 (i..i+2)×(j-2..j-1) 内 num24 格 CopyPaintAndCoating(other=Main.tile[i,j]
   *  =沙面采样格）。蜂巢 444 支原版无漆继承（cs:74236 前后无 CopyPaint）不在此列。 */
  private inheritAntLarvaPaint(i: number, j: number, sheet: number): void {
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (this.active(i + dx, j - 1 - dy) && sheetOf(this.typeAt(i + dx, j - 1 - dy)) === sheet) {
          this.copyPaintAndCoating(i, j, i + dx, j - 1 - dy);
        }
      }
    }
  }

  /** 五族藤蔓支撑扫描（cs:73897-73905 丛林 60/62 / :73947-73955 灰烬 633/638 /
   *  :74000± 蘑菇 70/528 / :74020± 腐化 661/636 / :74055-74063 猩红 662/205 同构）。
   *  ★R12-13（2026-08-24）补 bottomSlope 双腿：①途中（含幽灵格）遇下坡沿
   *  （slope 3/4,Tile.cs:302-306）即败——坡面上不长藤;②锚格须非坡（①已拦,
   *  原版 `!bottomSlope()` 为冗余双写,保真）。曾只查 active+同型 → 坡面灰烬/
   *  丛林/蘑菇块挂藤。 */
  private hasSupportMulti(i: number, j: number, sheets: number[]): boolean {
    const st = this.host.store;
    for (let y = j; y > j - 10; y--) {
      if (!st.inBounds(i, y)) break;
      const sl = st.slope[st.idx(i, y)];
      if (sl === 3 || sl === 4) return false;          // ① bottomSlope 即败（不查 active）
      if (this.active(i, y) && sheets.includes(sheetOf(this.typeAt(i, y)))) return true;
    }
    return false;
  }

  /** 蜂巢 2×2 放置（cs:74093-74160）：锚 2 宽实心+无液+非房墙（wallHouse 锚门
   *  cs:74108 `Main.wallHouse[wall]`），主体区仅 Main.tileCut 族可被覆写——
   *  ★R-H1/F4：原版阻断条件 `!tileCut[type] || type==444`（cs:74118）→ 可覆写集
   *  =Main.tileCut 全表扣 444 特例（444 即被放件,在场即阻）。表取仓内
   *  TILE_CUT_SHEETS（≡Main.cs tileCut 41 项全表,同源复用勿重刻）——旧硬编码表
   *  多 233（∈BreakableWhenPlacing 非 tileCut,现即阻断）缺 3/24/28/32/51/82/83/84/
   *  231/236/254/444/484/485/518/519/529/549/654/655/711 等。实心块/岩浆阻断；
   *  20 格密度门。flag6 过后（cs:74135-74144）:锚行 slope(0)/halfBrick(false) 整平
   *  （本域锚门 solidTile 已拒坡/半砖=冗余保真）+主体区 KillTile 默认参（带掉落,
   *  本域 kill()→killDropFace 同口径）。★连锁（F4 注记）:表补齐后药草 82/83/84→
   *  313/蛛网 51→150/香蒲 519→183 等被覆写即走掉落面=原版语义,勿截断。 */
  private placeJungleBlock2x2(i: number, j: number, sheet: number, floorY: number): boolean {
    void j;
    for (let k = i; k < i + 2; k++) {
      if (!this.solidTile(k, floorY - 1)) return false;
      if (this.liquidAt(k, floorY - 1) > 0) return false;
      if (WALL_HOUSE.has(this.host.store.wall[this.at(k, floorY - 1)])) return false;   // 房墙锚门（cs:74108）
      for (let l = floorY; l < floorY + 2; l++) {
        if (this.isLava(k, l)) return false;
        if (this.active(k, l)) {
          const s = sheetOf(this.typeAt(k, l));
          // tileCut 全表可覆写（原版阻断条件 !tileCut[type] || type==444,cs:74118）
          if (!TILE_CUT_SHEETS.has(s) || s === 444) return false;
        }
      }
    }
    // 20 格内既有 >0 → 不放（CountNearBlocksTypes cap 1）
    for (let x = i - 20; x <= i + 20; x += 2) for (let y = floorY - 20; y <= floorY + 20; y += 2) {
      if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === sheet) return false;
    }
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      if (this.active(i + dx, floorY + dy)) this.kill(i + dx, floorY + dy);
    }
    const placed = this.placeBlock(i, floorY, sheet, 2, 2);
    return placed;
  }

  // ================= GrassGrowth（cs:74333） =================

  private grassGrowth(i: number, j: number, minI: number, maxI: number, minJ: number, maxJ: number, underground: boolean): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const sheet = sheetOf(this.typeAt(i, j));

    if (underground) {
      // 地下半区（cs:74342-74451）：邪恶草转泥/土 + 顶植物；丛林/蘑菇/灰烬草转泥/灰
      let toDirt = -1, toMud = -1, plant = -1, plantChance = 1, self = sheet, evilPair = -1;
      switch (sheet) {
        // ★⑥（cs:74888/:74900/:74913/:74926）邪恶族四支内联 journey 门——
        //    !AllowedToSpreadInfections → return（整段演化停摆：顶植物/蔓延/233 兜底全跳）
        case 23: toDirt = 0; toMud = 59; self = 23; evilPair = 661; plant = 24; plantChance = 2;
          if (!this.allowedToSpread) return; break;
        case 199: toDirt = 0; toMud = 59; self = 199; evilPair = 662; plant = 201; plantChance = 2;
          if (!this.allowedToSpread) return; break;
        case 661: toDirt = 59; toMud = 0; self = 661; evilPair = 23; plant = 24; plantChance = 2;
          if (!this.allowedToSpread) return; break;
        case 662: toDirt = 59; toMud = 0; self = 662; evilPair = 199; plant = 201; plantChance = 2;
          if (!this.allowedToSpread) return; break;
        case 60: toDirt = 59; plant = 61; plantChance = 10; break;
        case 70: toDirt = 59; plant = 71; plantChance = 10; break;
        case 633: toDirt = 57; plant = 637; plantChance = 2; break;
        case 226: plant = 61; plantChance = 10; toDirt = -1; break;
      }
      // ★⑨（2026-09-18 生命果实报）：顶植物掷旗 flag=掷过即置（cs:74956-74971——
      //    置位先于 PlaceTile,落位失败不影响;唯一短路=226 密度门 flag2）。case 60
      //    门= `flag || genRand.Next(25) != 0 || liquid != 0`（cs:75013 字面,短路
      //    位次同序:flag 真则 Next(25) 不掷）——上格有旧株(61/233 等)时 Next(25)
      //    照掷,果/株经 PlaceJunglePlant 允许族覆写旧株。此前以「上格空」代旗 →
      //    顶植物占位后该格整段停摆（长世界丛林地表 61 饱和=单向无 churn,原版靠
      //    覆写持续刷新）→ 生命果/233 兜底双双永不落=用户实报机械后无果根因;
      //    并修上格占用时的骰位差（原版掷 Next(25),本仓短路不掷）。
      let topPlantFlag = false;
      if (plant !== -1 && !this.active(i, minJ) && this.rng() < 1 / plantChance) {
        if (!(sheet === 226 && this.tooManyJunglePlants(i, minJ))) {
          topPlantFlag = true;
          // 地下顶植物同受 PlaceTile→IsFit 锚门（原版 PlaceTile 唯一口,谱系/坡面一致拒绝）
          if (this.fitTopPlant(i, minJ, plant)) {
            if (this.place1(i, minJ, plant, 0, plant === 61 ? 8 : 1)) {
              // ★⑥ CopyPaintAndCoating(Main.tile[i,j])（cs:74971-74973 落位后漆继承）
              this.copyPaintAndCoating(i, j, i, minJ);
            }
          }
        }
      }
      // 丛林草花苞专段（cs:74480-74558/1457 cs:75011-75094 地下第二个 switch 的
      // case 60;两个【独立 if】——238 检查无论成败继续 236 检查,非 else-if 串行）
      if (sheet === 60 && !topPlantFlag && this.rng() < 1 / 25
        && this.liquidAt(i, minJ) === 0) {
        // ★⑧（cs:75046-75094）：花苞/生命果/丛林植物全走 PlaceJunglePlant（本仓
        //    placeJunglePlant 1:1——2×2 允许族+底承 SolidTile+60+KillTile 覆写+
        //    裸帧直写；锚=右下角 (i,minJ),底承行 minJ+1）。此前 fitJunglePairFlat(i,j)+
        //    placeBlock(i,minJ-1) 锚定右移一格且 2×2 须全空=双偏差,一并按原版重接。
        if (this.hardMode && this.mechAll() && this.rng() < 1 / 60) {
          // 世花球茎 238（cs:75046-75060:mechBoss1∧2∧3 全灭 + 1/60 + 150 格内无 238）
          let has = false;
          for (let x = i - 150; x < i + 150 && !has; x += 2) for (let y = j - 150; y < j + 150; y += 2) {
            if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 238) { has = true; break; }
          }
          if (!has) this.placeJunglePlant(i, minJ, 238, 0, 0);
        }
        const expert = (this.host.difficulty ?? 0) >= 1;
        const lifeDoor = expert ? 30 : 40;   // expert 1/30 / 其余 1/40（cs:75062）
        const lifeRange = expert ? 50 : 60;  // expert 60-10（cs:75065-75067）
        if (this.hardMode && this.mechAny() && this.rng() < 1 / lifeDoor) {
          // 生命果 236（cs:75061-75077:mechAny + 距离内无 236）——
          //   ★补掷 styleX=genRand.Next(3)（帧 36×styleX,cs:75071——此前恒 0 少一掷）
          let has = false;
          for (let x = i - lifeRange; x < i + lifeRange && !has; x += 2) for (let y = j - lifeRange; y < j + lifeRange; y += 2) {
            if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 236) { has = true; break; }
          }
          if (!has) this.placeJunglePlant(i, minJ, 236, Math.floor(this.rng() * 3), 0);
          // cs:75076 236 门过（无论落果成败）即 break——不落 233 兜底
        } else {
          // 丛林植物 233 兜底（cs:75079-75094 地下段,此前整缺）：Next(8) style0
          //   失败（3×2 档未落）→ 再掷 Next(12) styleY=1（2×2 档）
          this.placeJunglePlant(i, minJ, 233, Math.floor(this.rng() * 8), 0);
          if (sheetOf(this.typeAt(i, minJ)) !== 233) {
            this.placeJunglePlant(i, minJ, 233, Math.floor(this.rng() * 12), 1);
          }
        }
      }
      if (toDirt !== -1) {
        for (let k = minI; k < maxI; k++) {
          for (let l = minJ; l < maxJ; l++) {
            if ((i === k && j === l) || !this.active(k, l)) continue;
            const s = sheetOf(this.typeAt(k, l));
            if (s === toDirt) this.spreadGrass(k, l, toDirt, self);
            else if (evilPair !== -1 && s === toMud) this.spreadGrass(k, l, toMud, evilPair);
          }
        }
      }
      return;
    }

    // ---- 地表半区（cs:74566-74928）----
    switch (sheet) {
      case 2: case 23: case 32: case 109: case 199: case 352: case 477: case 492: case 661: case 662: {
        // ★⑦ 万圣南瓜窗（cs:75122-75142）：Main.halloween 开窗 ∧ 2/109 档 → 1/75 掷 →
        //    ±100(step2) 计 254 株 <6 → PlacePumpkin(i, minJ)。窗关=原版短路不掷（本仓
        //    host.halloween 缺省 false=普通世界零掷,流位同原版关窗态）
        if (this.host.halloween && (sheet === 2 || sheet === 109) && this.rng() < 1 / 75) {
          let cnt = 0;
          for (let m = i - 100; m < i + 100; m += 2) {
            for (let n = j - 100; n < j + 100; n += 2) {
              if (m > 1 && m < st.w - 2 && n > 1 && n < st.h - 2
                && this.active(m, n) && sheetOf(this.typeAt(m, n)) === 254) cnt++;
            }
          }
          if (cnt < 6) this.placePumpkin(i, minJ);
        }
        // 顶植物（cs:74599-74626）：2→3(1/12) 23/661→24 199/662→201 109→110（均 1/10）
        if (!this.active(i, minJ) && this.liquidAt(i, minJ) === 0) {
          let plant = -1;
          if (sheet === 2 && this.rng() < 1 / 12) plant = 3;
          else if ((sheet === 23 || sheet === 661) && this.rng() < 1 / 10) plant = 24;
          else if ((sheet === 199 || sheet === 662) && this.rng() < 1 / 10) plant = 201;
          else if (sheet === 109 && this.rng() < 1 / 10) plant = 110;
          if (plant !== -1 && this.fitTopPlant(i, minJ, plant)) {
            if (this.place1(i, minJ, plant, 0, plant === 3 ? 7 : 1)) {
              this.copyPaintAndCoating(i, j, i, minJ);          // ★⑥ cs:75184-75186
            }
          }
        }
        // 类型归一（cs:74629-74657）：32→23 352→199 477→2 492→109；邪恶对 23/661、199/662
        let grass = sheet;
        let evilPair = -1;
        if (sheet === 32) grass = 23;
        else if (sheet === 352) grass = 199;
        else if (sheet === 477) grass = 2;
        else if (sheet === 492) grass = 109;
        // ★⑥（cs:75195-75202 归一 switch 内联门）：地表荆棘 32/352 同受 journey 门
        if ((sheet === 32 || sheet === 352) && !this.allowedToSpread) return;
        if (sheet === 23 || sheet === 661) { grass = 23; evilPair = 661; }
        if (sheet === 199 || sheet === 662) { grass = 199; evilPair = 662; }
        const evilSelf = sheet === 23 || sheet === 199 || sheet === 661 || sheet === 662;
        const evilSpread = this.allowedToSpread && evilSelf;
        const convGrassSelf = sheet === 109 || sheet === 492;
        // ★⑥ flag8 外层过滤（cs:75217/:75227-75229）：flag8 = AllowedToSpreadInfections
        //    ∧ num10 ∈ {23,199,109,492,661,662}（InWorld(i,j,10) 恒真——函数入口已挡）。
        //    !flag8 时邻格只放行泥(0)/邪恶对泥(59)——journey 停蔓延下神圣 109 对普通草
        //    2/477/23/199 的吞并（B 段）与邪恶草对草族的吞并（A 段三支）由此被拦。
        const flag8 = this.allowedToSpread
          && (sheet === 23 || sheet === 199 || sheet === 109 || sheet === 492 || sheet === 661 || sheet === 662);
        // 邻域转换（cs:74658-74786）
        for (let k = minI; k < maxI; k++) {
          for (let l = minJ; l < maxJ; l++) {
            if ((i === k && j === l) || !this.active(k, l)) continue;
            const s = sheetOf(this.typeAt(k, l));
            if (!flag8 && s !== 0 && (evilPair === -1 || s !== 59)) continue;   // cs:75227-75229
            // A 段：普通草转泥+泥转邪恶对+邪恶草吞并普通草族（cs:74679-74705）
            if (s === 0 || (evilPair !== -1 && s === 59)
              || (evilSelf && (s === 2 || s === 109 || s === 477 || s === 492))) {
              this.spreadGrass(k, l, 0, grass);
              if (evilPair !== -1) this.spreadGrass(k, l, 59, evilPair);
              if (evilSpread) {
                this.spreadGrass(k, l, 2, grass);
                this.spreadGrass(k, l, 109, grass);
                this.spreadGrass(k, l, 477, grass);
                this.spreadGrass(k, l, 492, grass);
                if (evilPair !== -1) this.spreadGrass(k, l, 60, evilPair);
              }
            }
            // B 段：神圣草吞并（cs:74707-74761）
            if (s === 0 || (convGrassSelf && (s === 2 || s === 477 || s === 23 || s === 199))) {
              this.spreadGrass(k, l, 0, grass);
              if (sheet === 109) this.spreadGrass(k, l, 2, grass);
              if (sheet === 492) this.spreadGrass(k, l, 477, grass);
              if (sheet === 109) this.spreadGrass(k, l, 477, 492);
              if (convGrassSelf && this.allowedToSpread) {
                this.spreadGrass(k, l, 23, 109);
                this.spreadGrass(k, l, 199, 109);
              }
            }
          }
        }
        return;
      }
      case 70: {
        // 蘑菇草（cs:74765-74818）：顶蘑菇草植物 71（1/10）+ 蘑菇树（未接）+ 泥→70
        if (!this.active(i, minJ) && this.rng() < 1 / 10 && this.fitTopPlant(i, minJ, 71)) {
          if (this.place1(i, minJ, 71, 0, 1)) this.copyPaintAndCoating(i, j, i, minJ);   // ★⑥ cs:75312-75314
        }
        for (let k = minI; k < maxI; k++) for (let l = minJ; l < maxJ; l++) {
          if ((i === k && j === l) || !this.active(k, l)) continue;
          if (sheetOf(this.typeAt(k, l)) === 59) this.spreadGrass(k, l, 59, 70);
        }
        return;
      }
      case 60: {
        // 丛林草（cs:74821-74886）：顶 61（1/7）+ 世花球茎 238 + 生命果 236 + 丛林植物 233 + 泥→60
        if (!this.active(i, minJ) && this.rng() < 1 / 7 && this.fitTopPlant(i, minJ, 61)) {
          if (this.place1(i, minJ, 61, 0, 8)) this.copyPaintAndCoating(i, j, i, minJ);   // ★⑥ cs:75358-75360
        } else if (this.rng() < 1 / 500 && (!this.active(i, minJ)
          || [61, 74, 69].includes(sheetOf(this.typeAt(i, minJ))))) {
          void 0; // 蘑菇树再生（TryGrowingTreeByType(5)）——树系统运行时接口未接
        } else if (this.rng() < 1 / 25 && this.liquidAt(i, minJ) === 0) {
          // ★③ 丛林植物 233 兜底 3×2 化（cs:75375-75390 地表 case 60 段：
          //  else-if :75375/PlaceJunglePlant :75377/重试 :75387——★F7 勘误,曾误锚
          //  cs:75295-75308 那是猩红 SpreadGrass flag7 段）：PlaceJunglePlant 3×2
          //  株（styleX=Next(8)）,失手（锚格裸 type 复读≠233=原版字面）→ Next(12)
          //  styleY=1 的 2×2 档重试——此前 place1+fitTopPlant 1×1 近似整支替换。
          //  花苞 238/生命果 236 属【地下半区】case 60（cs:74480-74558,flag 作用域
          //  :74429 证实）,2026-08-13 自地表误植段移除——此前地下丛林永不长花苞,保持
          this.placeJunglePlant(i, minJ, 233, Math.floor(this.rng() * 8), 0);
          if (sheetOf(this.typeAt(i, minJ)) !== 233) {
            this.placeJunglePlant(i, minJ, 233, Math.floor(this.rng() * 12), 1);
          }
        }
        for (let k = minI; k < maxI; k++) for (let l = minJ; l < maxJ; l++) {
          if ((i === k && j === l) || !this.active(k, l)) continue;
          if (sheetOf(this.typeAt(k, l)) === 59) this.spreadGrass(k, l, 59, 60);
        }
        return;
      }
      case 226: {
        // 神庙砖顶 61（1/7，密度门，cs:74880-74899）
        if (!this.active(i, minJ) && this.rng() < 1 / 7 && !this.tooManyJunglePlants(i, minJ)
          && this.fitTopPlant(i, minJ, 61)) {
          if (this.place1(i, minJ, 61, 0, 8)) this.copyPaintAndCoating(i, j, i, minJ);   // ★⑥ cs:75420-75422
        }
        return;
      }
      case 633: {
        // 灰烬草（cs:74902-74928）：顶 637（1/10）+ 灰烬→633
        if (!this.active(i, minJ) && this.rng() < 1 / 10 && this.fitTopPlant(i, minJ, 637)) {
          if (this.place1(i, minJ, 637, 0, 4)) this.copyPaintAndCoating(i, j, i, minJ);  // ★⑥ cs:75435-75437
        }
        for (let k = minI; k < maxI; k++) for (let l = minJ; l < maxJ; l++) {
          if ((i === k && j === l) || !this.active(k, l)) continue;
          if (sheetOf(this.typeAt(k, l)) === 57) this.spreadGrass(k, l, 57, 633);
        }
        return;
      }
    }
  }

  // ================= 运行时 SpreadGrass（cs:75210） =================

  private spreadGrass(i: number, j: number, dirt: number, grass: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const ti = this.at(i, j);
    if (!st.flags[ti]) return;
    if (sheetOf(st.type[ti]) !== dirt) return;
    // 运行时守卫（cs:75223-75230 → 1457 cs:75764）：非邪恶草 + (j≥worldSurface 且
    //  dirt==0) → 不转（普通草只在 worldSurface 以上蔓延；邪恶草/丛林草/蘑菇草不受限）。
    //  ★⑤：growGrassUnderground 豁免旗（cs:75764 `… && !growGrassUnderground`）——
    //  remix 双调包络内地下样本照转普通草。
    const evil = grass === 23 || grass === 661 || grass === 199 || grass === 662;
    if (!evil && j >= this.host.worldSurface && dirt === 0 && !this.growGrassUnderground) return;
    // 3×3 封死不转（★⑤ cs:75786-75799 双层循环+内层 break：岩浆命中 flag=true 只断
    //   内层,后续列的洞会把 flag 打回 false→原版可能放行——此前 JS 外层 !lavaNear
    //   直接终止=熔岩后列有洞也恒拒,偏差已修）
    let enclosed = true;
    outer:
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const x = i + dx, y = j + dy;
        if (!st.inBounds(x, y)) continue;
        const k = this.at(x, y);
        const d = TILE_DEFS[st.type[k]];
        if (!st.flags[k] || !d?.solid) enclosed = false;
        if (st.liquid[k] > 0 && st.liquidType[k] === 2) { enclosed = true; continue outer; }
      }
    }
    if (enclosed) return;
    // CanBeClearedDuringGeneration 守卫（NOT_CLEARABLE = 沙岩族等不可转换表）
    if (NOT_CLEARABLE.has(st.type[ti])) return;
    // 上方向日葵(27)挡邪恶/神圣草（★② cs:75793-75798 三段并列含 grass==109——
    //   此前缺神圣支;type 裸读无 active 门=原版本相）
    if ((evil || grass === 109) && sheetOf(this.typeAt(i, j - 1)) === 27) return;
    // 草→草转换走 Convert tiles-only（cs:75273-75283）
    if (dirt > 0 && CONV_GRASS.has(dirt)) {
      if (grass === 23 || grass === 661) this.convert(i, j, 1, true, false);
      else if (grass === 199 || grass === 662) this.convert(i, j, 4, true, false);
      else if (grass === 109) this.convert(i, j, 2, true, false);
      return;
    }
    this.setType(i, j, S(grass));
  }

  // ================= Convert（cs:55113）=================
  //  演化路径用 case 1/2/3/4/8/9/11；case 0/5/6/7/10/12/13 为环境转换器/还原链
  //  补全（case 0 = 绿溶液纯净 spray/AI_31 消费）；case 14-21 1.4.4 Forced*
  //  反转换（1456 运行时无调用方，API 档照抄——BiomeConversionID.cs:22-36）。

  /** WorldGen.Convert 尺寸重载（cs:55095-55110）：方形窗 ±size 遍历 + 菱形门
   *  |k-i|+|l-j| < 6（恒 6 不随 size 变——size≥5 才扩窗）。环境转换器族
   *  （溶液弹 size 2/3、三瓶水 size 4）全走本入口 */
  convertArea(i: number, j: number, conversionType: number, size: number,
    tiles = true, walls = true): void {
    const st = this.host.store;
    if (!tiles && !walls) return;
    for (let k = i - size; k <= i + size; k++) {
      for (let l = j - size; l <= j + size; l++) {
        // InWorld(k,l,1)（WorldGen.cs:9635-9643：fluff=1 → x/y ∈ [1, max-2]，留 1 格
        // 世界边框）+ 菱形门 <6。本仓 inBounds 是 0 边框——曾多转最外 1 圈
        // （2026-08-21 复审 P3④，WorldGen.cs:55108 原文照抄）
        if (k >= 1 && k < st.w - 1 && l >= 1 && l < st.h - 1
          && Math.abs(k - i) + Math.abs(l - j) < 6) {
          this.convert(k, l, conversionType, tiles, walls);
        }
      }
    }
  }

  /** BlockBelowMakesSandConvertIntoHardenedSand（cs:87307-87327）：下方非 nactive
   *  或非实心 → 沙转硬化沙（防塌；nactive=active&&!inActive,已致动格视为不支撑） */
  private blockBelowHardensSand(i: number, j: number): boolean {
    const st = this.host.store;
    if (j >= st.h - 1) return false;
    if (!st.inBounds(i, j + 1)) return false;
    if (!st.isActive(i, j + 1)) return true;
    const d = TILE_DEFS[st.type[st.idx(i, j + 1)]];
    return !!d && !d.solid;
  }

  /** TileIsExposedToAir（cs:54810-54830）：3×3 内任一格非活动/非实心/平台 → 露天 */
  private tileExposedToAir(i: number, j: number): boolean {
    const st = this.host.store;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = i + dx, y = j + dy;
      if (!st.inBounds(x, y)) continue;
      const k = st.idx(x, y);
      const d = TILE_DEFS[st.type[k]];
      if (!st.flags[k] || !d?.solid || d.platform) return true;
    }
    return false;
  }

  /** Main.tileFrameImportant[type]——多帧物（家具/火把/门等）不可被"满转"吞并。
   *  荆棘族 32/352/69/655 原版非重要帧（Main.cs 404 条 true 表无此四型）但本仓
   *  TILE_DEFS 因渲染帧需求把 32 标了 framed——转换豁免按原版表覆写 */
  private frameImportant(sheet: number): boolean {
    if (sheet === 32 || sheet === 352 || sheet === 69 || sheet === 655) return false;
    return !!TILE_DEFS[S(sheet)]?.framed;
  }

  convert(i: number, j: number, conversionType: number, tiles = true, walls = true): void {
    const st = this.host.store;
    // InWorld(i,j,1)（cs:55117 与 convertArea 同款 1 格边框门——直调路径
    // （applyPowder/spreadGrass 草转）也过此门；曾用 0 边框 inBounds，2026-08-21 P3④）
    if (i < 1 || i >= st.w - 1 || j < 1 || j >= st.h - 1 || (!tiles && !walls)) return;
    const ti = this.at(i, j);
    const wall = st.wall[ti];
    const act = st.flags[ti] !== 0;
    if (!act && wall <= 0) return;
    const sheet = act ? sheetOf(st.type[ti]) : -1;
    const convWall = (to: number) => { if (wall !== 0 && wall !== to) st.setWall(i, j, to); };
    const convTile = (to: number) => { if (act && sheet !== to) this.setType(i, j, S(to)); };
    // 火把现样式（frameY/22；仅 tile 4 有意义,其余 -1）
    const torchStyle = act && sheet === 4 ? Math.floor(st.frameY[ti] / 22) : -1;
    // Convert_ActuallyConvertTorch（cs:56296-56319）：只改 frameY=style×22,锚帧 frameX
    // 原样保留（原版随后 SquareTileFrame 重锚,语义等价）。conversionType==0 时
    // 蘑菇火把(22)目标改判丛林火把(21)——cs:56304 净化链专属特例
    const convTorch = (newStyle: number) => {
      if (torchStyle < 0) return;
      const ns = conversionType === 0 && torchStyle === 22 ? 21 : newStyle;
      if (torchStyle !== ns) st.setTile(i, j, st.type[ti], st.frameX[ti], ns * 22);
    };
    // 火把可转门（TileID.Sets.Conversion.Torch，TileID.cs:42-74）
    const torchOk = torchStyle >= 0 && torchConvertible(conversionType, torchStyle);
    // 后置转换（ActuallyConvertTile 现场重读 theTile——先 Kill 再转的独立 if 段
    // （case 15/19/20/21）用本变体：被杀格不再补放,且与刚写入的新型比对）
    const convTileLive = (to: number) => {
      if (st.flags[ti] !== 0 && st.type[ti] !== S(to)) this.setType(i, j, S(to));
    };
    switch (conversionType) {
      case 4: // 猩红化
        if (walls) {
          if (WALL_CONV_GRASS.has(wall) && wall !== 81) convWall(81);
          else if (WALL_CONV_STONE.has(wall) && wall !== 83) convWall(83);
          else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 218) convWall(218);
          else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 221) convWall(221);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 192) convWall(192);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 193) convWall(193);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 194) convWall(194);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 195) convWall(195);
        }
        if (tiles) {
          if (torchOk) convTorch(19);            // 猩红火把（cs:55167）
          else if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet)) && sheet !== 203) convTile(203);
          else if (CONV_JUNGLE_GRASS.has(sheet) && sheet !== 662) convTile(662);
          else if (CONV_GRASS.has(sheet) && sheet !== 199) convTile(199);
          else if (CONV_ICE.has(sheet) && sheet !== 200) convTile(200);
          else if (CONV_SAND.has(sheet) && sheet !== 234) convTile(234);
          else if (CONV_HARD_SAND.has(sheet) && sheet !== 399) convTile(399);
          else if (CONV_SANDSTONE.has(sheet) && sheet !== 401) convTile(401);
          else if (CONV_THORN.has(sheet) && sheet !== 352) convTile(352);
        }
        break;
      case 2: // 神圣化
        if (walls) {
          if (WALL_CONV_GRASS.has(wall) && wall !== 70) convWall(70);
          else if (WALL_CONV_STONE.has(wall) && wall !== 28) convWall(28);
          else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 219) convWall(219);
          else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 222) convWall(222);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 200) convWall(200);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 201) convWall(201);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 202) convWall(202);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 203) convWall(203);
        }
        if (tiles) {
          if (torchOk) convTorch(20);            // 神圣火把（cs:55245）
          else if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet)) && sheet !== 117) convTile(117);
          else if (CONV_GOLF_GRASS.has(sheet) && sheet !== 492) convTile(492);
          else if (CONV_GRASS.has(sheet) && sheet !== 109 && sheet !== 492) convTile(109);
          else if (CONV_ICE.has(sheet) && sheet !== 164) convTile(164);
          else if (CONV_SAND.has(sheet) && sheet !== 116) convTile(116);
          else if (CONV_HARD_SAND.has(sheet) && sheet !== 402) convTile(402);
          else if (CONV_SANDSTONE.has(sheet) && sheet !== 403) convTile(403);
          else if (CONV_THORN.has(sheet)) this.kill(i, j);
          if (sheet === 59 && ([109].includes(sheetOf(this.typeAt(i - 1, j)))
            || [109].includes(sheetOf(this.typeAt(i + 1, j)))
            || [109].includes(sheetOf(this.typeAt(i, j - 1)))
            || [109].includes(sheetOf(this.typeAt(i, j + 1))))) {
            this.setType(i, j, S(0));
          }
        }
        break;
      case 1: // 腐化化
        if (walls) {
          if (WALL_CONV_GRASS.has(wall) && wall !== 69) convWall(69);
          else if (WALL_CONV_STONE.has(wall) && wall !== 3) convWall(3);
          else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 217) convWall(217);
          else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 220) convWall(220);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 188) convWall(188);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 189) convWall(189);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 190) convWall(190);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 191) convWall(191);
        }
        if (tiles) {
          if (torchOk) convTorch(18);            // 腐化火把（cs:55328）
          else if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet)) && sheet !== 25) convTile(25);
          else if (CONV_JUNGLE_GRASS.has(sheet) && sheet !== 661) convTile(661);
          else if (CONV_GRASS.has(sheet) && sheet !== 23) convTile(23);
          else if (CONV_ICE.has(sheet) && sheet !== 163) convTile(163);
          else if (CONV_SAND.has(sheet) && sheet !== 112) convTile(112);
          else if (CONV_HARD_SAND.has(sheet) && sheet !== 398) convTile(398);
          else if (CONV_SANDSTONE.has(sheet) && sheet !== 400) convTile(400);
          else if (CONV_THORN.has(sheet) && sheet !== 32) convTile(32);
        }
        break;
      case 3: // 蘑菇化（环境转换器蘑菇）
        if (walls && (wall === 64 || wall === 67 || wall === 15 || wall === 247)) convWall(80);
        if (tiles) {
          if (torchOk) convTorch(22);            // 蘑菇火把（cs:55374）
          else if (sheet === 60) convTile(70);
          else if (CONV_THORN.has(sheet)) this.kill(i, j);
        }
        break;
      case 5: // 沙化（cs:55391-55436：沙墙 187/硬化沙墙 216 + 沙漠火把 16）
        if (walls) {
          if ((WALL_CONV_STONE.has(wall) || WALL_CONV_NEW1.has(wall) || WALL_CONV_NEW2.has(wall)
            || WALL_CONV_NEW3.has(wall) || WALL_CONV_NEW4.has(wall) || WALL_CONV_ICE.has(wall)
            || WALL_CONV_SANDSTONE.has(wall)) && wall !== 187) convWall(187);
          else if ((WALL_CONV_HARD_SAND.has(wall) || WALL_CONV_DIRT.has(wall) || WALL_CONV_SNOW.has(wall))
            && wall !== 216) convWall(216);
        }
        if (!tiles) break;
        if (torchOk) convTorch(16);
        else if ((CONV_GRASS.has(sheet) || CONV_SAND.has(sheet) || CONV_SNOW.has(sheet) || CONV_DIRT.has(sheet))
          && sheet !== 53) convTile(this.blockBelowHardensSand(i, j) ? 397 : 53);
        else if (CONV_HARD_SAND.has(sheet) && sheet !== 397) convTile(397);
        else if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet) || CONV_ICE.has(sheet) || CONV_SANDSTONE.has(sheet))
          && sheet !== 396) convTile(396);
        else if (CONV_THORN.has(sheet) && sheet !== 69) this.kill(i, j);
        break;
      case 6: // 雪化（cs:55437-55473：冰雪墙 71/雪墙 40 + 冰火把 9）
        if (walls) {
          if ((WALL_CONV_STONE.has(wall) || WALL_CONV_NEW1.has(wall) || WALL_CONV_NEW2.has(wall)
            || WALL_CONV_NEW3.has(wall) || WALL_CONV_NEW4.has(wall) || WALL_CONV_ICE.has(wall)
            || WALL_CONV_SANDSTONE.has(wall)) && wall !== 71) convWall(71);
          else if ((WALL_CONV_HARD_SAND.has(wall) || WALL_CONV_DIRT.has(wall) || WALL_CONV_SNOW.has(wall))
            && wall !== 40) convWall(40);
        }
        if (!tiles) break;
        if (torchOk) convTorch(9);
        else if ((CONV_GRASS.has(sheet) || CONV_SAND.has(sheet) || CONV_HARD_SAND.has(sheet)
          || CONV_SNOW.has(sheet) || CONV_DIRT.has(sheet)) && sheet !== 147) convTile(147);
        else if ((TILE_MOSS.has(sheet) || CONV_STONE.has(sheet) || CONV_ICE.has(sheet) || CONV_SANDSTONE.has(sheet))
          && sheet !== 161) convTile(161);
        else if (CONV_THORN.has(sheet) && sheet !== 69) this.kill(i, j);
        break;
      case 7: // 纯净化（cs:55474-55554：石 1/草 2/泥土 0 + 火把归 0；与 case 11 净化粉
        //  同族但墙分支带化石豁免、泥土分支露天判 Grass——环境转换器"纯净"路径）
        if (walls) {
          const fossilW = wall === 61 || wall === 185 || wall === 262 || wall === 274;
          if ((WALL_CONV_STONE.has(wall) || WALL_CONV_ICE.has(wall) || WALL_CONV_SANDSTONE.has(wall))
            && wall !== 349 && !fossilW) convWall(349);
          else if (wall === 262) convWall(61);
          else if (wall === 274) convWall(185);
          else if ((WALL_CONV_HARD_SAND.has(wall) || WALL_CONV_SNOW.has(wall) || WALL_CONV_DIRT.has(wall))
            && wall !== 2) convWall(2);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 212) convWall(212);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 213) convWall(213);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 214) convWall(214);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 215) convWall(215);
        }
        if (!tiles) break;
        if (torchOk) convTorch(0);
        else if ((CONV_STONE.has(sheet) || CONV_ICE.has(sheet) || CONV_SANDSTONE.has(sheet)) && sheet !== 1) convTile(1);
        else if (CONV_GOLF_GRASS.has(sheet) && sheet !== 477) convTile(477);
        else if (CONV_GRASS.has(sheet) && sheet !== 2 && sheet !== 477) convTile(2);
        else if ((CONV_SAND.has(sheet) || CONV_HARD_SAND.has(sheet) || CONV_SNOW.has(sheet) || CONV_DIRT.has(sheet))
          && sheet !== 0) convTile(this.tileExposedToAir(i, j) ? 2 : 0);
        else if (CONV_THORN.has(sheet) && sheet !== 69) this.kill(i, j);
        break;
      case 0: // 纯净化（cs:55555-55692：绿溶液 spray/AI_31 → conv 0——纯净还原 +
        //  蘑菇墙 80 深度带 + 裂纹化石墙 292-295 归自然；tiles 只杀邪恶荆棘 32/352）
        if (walls) {
          if (wall === 69 || wall === 70 || wall === 81) {
            // 邪恶/神圣草墙 → 地表原版草墙族（9/10 → 63，1/10 → 65；地下 64）
            convWall(j < this.host.worldSurface ? (this.rng() * 10 < 9 ? 63 : 65) : 64);
          } else if (wall === 262) convWall(61);   // 化石裂纹墙归自然（cs:55606-55617）
          else if (wall === 274) convWall(185);
          else if (wall === 292) convWall(204);
          else if (wall === 293) convWall(205);
          else if (wall === 294) convWall(206);
          else if (wall === 295) convWall(207);
          // 61/185/204-207 空 case 豁免（已是自然态,cs:55686-55688 尾空 case 组）
          else if (!(wall === 61 || wall === 185 || (wall >= 204 && wall <= 207))) {
            if (WALL_CONV_STONE.has(wall) && wall !== 349) convWall(349);
            else if (WALL_CONV_NEW1.has(wall) && wall !== 212) convWall(212);
            else if (WALL_CONV_NEW2.has(wall) && wall !== 213) convWall(213);
            else if (WALL_CONV_NEW3.has(wall) && wall !== 214) convWall(214);
            else if (WALL_CONV_NEW4.has(wall) && wall !== 215) convWall(215);
            else if (wall === 80) {
              // 蘑菇墙深度带（cs:55638-55652）：地表带/深岩带以下 → 土墙 15，
              // 中段 → 草墙 64（genRand.Next(3) → Math.random 取整；运行时演化链
              // 无种子契约（世界生成 genRand 不进运行时），行为等价保持不改——
              // 2026-08-21 复审 P3④ 登记项）
              const h = st.h;
              if (j < this.host.worldSurface + 4 + Math.floor(this.rng() * 3)
                || j > (h + this.host.rockLevel) / 2 - 3 + Math.floor(this.rng() * 3)) convWall(15);
              else convWall(64);
            }
            else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 216) convWall(216);
            else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 187) convWall(187);
          }
        }
        if (!tiles) break;
        if (torchOk) convTorch(0);                 // 普通/丛林火把（22 特判 21 已在 convTorch）
        else if (sheet === 492) convTile(477);     // 高尔夫草 → 修剪草（cs:55657）
        else if (CONV_JUNGLE_GRASS.has(sheet) && sheet !== 60) convTile(60);
        else if (CONV_GRASS.has(sheet) && sheet !== 2 && sheet !== 477) convTile(2);
        else if (CONV_STONE.has(sheet) && sheet !== 1) convTile(1);
        else if (CONV_SAND.has(sheet) && sheet !== 53) convTile(53);
        else if (CONV_HARD_SAND.has(sheet) && sheet !== 397) convTile(397);
        else if (CONV_SANDSTONE.has(sheet) && sheet !== 396) convTile(396);
        else if (CONV_ICE.has(sheet) && sheet !== 161) convTile(161);
        else if (sheet === 70) convTile(60);       // 蘑菇草 → 丛林草（MushroomGrass {70}）
        else if (sheet === 32 || sheet === 352) this.kill(i, j);  // 仅邪恶荆棘（丛林棘 69 保留）
        break;
      case 8: // 叶绿生长（cs:55693-55700：泥/丛林草 → 叶绿矿 211）
        if (tiles && (sheet === 59 || sheet === 60)) this.setType(i, j, S(211));
        break;
      case 9: // 邪恶退化（cs:55712-55749：邪恶草族 → 泥/丛林草）
        if (!tiles) break;
        if ([23, 199, 661, 662].includes(sheet)) this.setType(i, j, S(60));
        else if (sheet === 0) this.setType(i, j, S(59));
        else if (sheet === 25 || sheet === 203) this.setType(i, j, S(1));
        else if (sheet === 112 || sheet === 234) this.setType(i, j, S(53));
        else if (sheet === 398 || sheet === 399) this.setType(i, j, S(397));
        else if (sheet === 400 || sheet === 401) this.setType(i, j, S(396));
        else if ([24, 32, 201, 205, 352, 636].includes(sheet)) this.kill(i, j);
        break;
      case 11: { // 净化（cs:55792-55902：净化粉弹体 10 逐格调用——邪恶/神圣族还原原状）
        if (walls) {
          const fossil = wall === 61 || wall === 185 || wall === 262 || wall === 274;
          if (WALL_CONV_STONE.has(wall) && wall !== 349 && !fossil) convWall(349);
          else if (wall === 69 || wall === 70 || wall === 81) {
            // 腐化/猩红/神圣草墙 → 地表原版草墙族（9/10 → 63，1/10 → 65；地下 64）
            convWall(j < this.host.worldSurface ? (this.rng() * 10 < 9 ? 63 : 65) : 64);
          } else if (wall === 262) convWall(61);
          else if (wall === 274) convWall(185);
          else if (WALL_CONV_DIRT.has(wall) && wall !== 2) convWall(2);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 212) convWall(212);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 213) convWall(213);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 214) convWall(214);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 215) convWall(215);
          else if (WALL_CONV_HARD_SAND.has(wall) && wall !== 216) convWall(216);
          else if (WALL_CONV_SANDSTONE.has(wall) && wall !== 187) convWall(187);
        }
        // 火把净化（cs:55867：邪恶/神圣火把 → 普通 style 0——Convert_ActuallyConvertTorch；
        //  case 1/2/3/4 的火把分支同链已在各 case 首支接入）
        if (!tiles) break;
        if (torchOk) convTorch(0);
        else if (CONV_JUNGLE_GRASS.has(sheet) && sheet !== 60) convTile(60);
        else if (CONV_GOLF_GRASS.has(sheet) && sheet !== 477) convTile(477);
        else if (CONV_GRASS.has(sheet) && sheet !== 2 && sheet !== 477) convTile(2);
        else if (CONV_STONE.has(sheet) && sheet !== 1) convTile(1);
        else if (CONV_ICE.has(sheet) && sheet !== 161) convTile(161);
        else if (CONV_SAND.has(sheet) && sheet !== 53) convTile(53);
        else if (CONV_HARD_SAND.has(sheet) && sheet !== 397) convTile(397);
        else if (CONV_SANDSTONE.has(sheet) && sheet !== 396) convTile(396);
        break;
      }
      case 10: // 邪恶退化 tiles-only 版（cs:55749-55789：与 case 9 同表但走 Convert 链,
        //  无墙分支——神庙砖致动等还原路径用）
        if (!tiles) break;
        if ([23, 199, 661, 662].includes(sheet)) convTile(60);
        else if (sheet === 0) convTile(59);
        else if (sheet === 25 || sheet === 203) convTile(1);
        else if (sheet === 112 || sheet === 234) convTile(53);
        else if (sheet === 398 || sheet === 399) convTile(397);
        else if (sheet === 400 || sheet === 401) convTile(396);
        else if ([24, 32, 201, 205, 352, 636].includes(sheet)) this.kill(i, j);
        break;
      case 12: // 腐化"满转"（cs:55892-55928：任意墙 → 腐化石墙 3,非重要帧块 → 黑檀石 25）
        if (walls) {
          if (WALL_CONV_NEW1.has(wall) && wall !== 188) convWall(188);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 189) convWall(189);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 190) convWall(190);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 191) convWall(191);
          else if (wall !== 0 && wall !== 3) convWall(3);
        }
        if (tiles) {
          if (torchOk) convTorch(18);
          else if (CONV_THORN.has(sheet) && sheet !== 32) convTile(32);
          else if (sheet !== 25 && !this.frameImportant(sheet)) convTile(25);
        }
        break;
      case 13: // 猩红"满转"（cs:55932-55968：任意墙 → 猩红石墙 83,非重要帧块 → 猩红石 203）
        if (walls) {
          if (WALL_CONV_NEW1.has(wall) && wall !== 192) convWall(192);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 193) convWall(193);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 194) convWall(194);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 195) convWall(195);
          else if (wall !== 0 && wall !== 83) convWall(83);
        }
        if (tiles) {
          if (torchOk) convTorch(19);
          else if (CONV_THORN.has(sheet) && sheet !== 352) convTile(352);
          else if (sheet !== 203 && !this.frameImportant(sheet)) convTile(203);
        }
        break;
      case 14: // 强制神圣（ForcedHallow，cs:55972-56016：1.4.4 API 档,1456 无运行时调用方）
        if (walls) {
          if (WALL_CONV_NEW1.has(wall) && wall !== 200) convWall(200);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 201) convWall(201);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 202) convWall(202);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 203) convWall(203);
          else if (wall !== 0 && wall !== 28) convWall(28);
        }
        if (!tiles) break;
        if (torchOk) convTorch(20);
        else if (CONV_THORN.has(sheet)) this.kill(i, j);
        else if (sheet !== 117 && !this.frameImportant(sheet)) convTile(117);
        break;
      case 15: // 强制蘑菇（ForcedGlowingMushroom，cs:56017-56049）
        if (walls) convWall(80);                   // 无条件（convWall 内含 wall≠0/≠80 门）
        if (!tiles) break;
        if (torchOk) convTorch(22);
        else if (CONV_THORN.has(sheet)) this.kill(i, j);
        if (!this.frameImportant(sheet)) {          // 独立 if（非 else）：露天蘑菇草 70 / 泥 59
          convTileLive(this.tileExposedToAir(i, j) ? 70 : 59);
        }
        break;
      case 16: // 强制沙漠（ForcedSand，cs:56050-56095）
        if (walls) {
          if ((WALL_CONV_HARD_SAND.has(wall) || WALL_CONV_DIRT.has(wall) || WALL_CONV_SNOW.has(wall))
            && wall !== 216) convWall(216);
          else if (wall !== 187) convWall(187);
        }
        if (!tiles) break;
        if (torchOk) convTorch(16);
        else if ((CONV_GRASS.has(sheet) || CONV_SAND.has(sheet) || CONV_SNOW.has(sheet) || CONV_DIRT.has(sheet))
          && sheet !== 53) convTile(this.blockBelowHardensSand(i, j) ? 397 : 53);
        else if (CONV_HARD_SAND.has(sheet) && sheet !== 397) convTile(397);
        else if (CONV_THORN.has(sheet) && sheet !== 69) this.kill(i, j);
        else if (sheet !== 396 && !this.frameImportant(sheet)) convTile(396);
        break;
      case 17: // 强制雪原（ForcedSnow，cs:56096-56132）
        if (walls) {
          if ((WALL_CONV_STONE.has(wall) || WALL_CONV_NEW1.has(wall) || WALL_CONV_NEW2.has(wall)
            || WALL_CONV_NEW3.has(wall) || WALL_CONV_NEW4.has(wall) || WALL_CONV_ICE.has(wall)
            || WALL_CONV_SANDSTONE.has(wall)) && wall !== 71) convWall(71);
          else if (wall !== 40) convWall(40);
        }
        if (!tiles) break;
        if (torchOk) convTorch(9);
        else if ((CONV_GRASS.has(sheet) || CONV_SAND.has(sheet) || CONV_HARD_SAND.has(sheet)
          || CONV_SNOW.has(sheet) || CONV_DIRT.has(sheet)) && sheet !== 147) convTile(147);
        else if (CONV_THORN.has(sheet) && sheet !== 69) this.kill(i, j);
        else if (sheet !== 161 && !this.frameImportant(sheet)) convTile(161);
        break;
      case 18: // 强制森林（ForcedDirt，cs:56133-56198）
        if (walls) {
          if ((WALL_CONV_HARD_SAND.has(wall) || WALL_CONV_SNOW.has(wall) || WALL_CONV_DIRT.has(wall))
            && wall !== 2) convWall(2);
          else if (WALL_CONV_NEW1.has(wall) && wall !== 212) convWall(212);
          else if (WALL_CONV_NEW2.has(wall) && wall !== 213) convWall(213);
          else if (WALL_CONV_NEW3.has(wall) && wall !== 214) convWall(214);
          else if (WALL_CONV_NEW4.has(wall) && wall !== 215) convWall(215);
          else if (wall !== 349) convWall(349);
        }
        if (!tiles) break;
        if (torchOk) convTorch(0);
        else if (CONV_GOLF_GRASS.has(sheet) && sheet !== 477) convTile(477);
        else if (CONV_GRASS.has(sheet) && sheet !== 2 && sheet !== 477) convTile(2);
        else if ((CONV_SAND.has(sheet) || CONV_HARD_SAND.has(sheet) || CONV_SNOW.has(sheet)
          || CONV_DIRT.has(sheet)) && sheet !== 0) convTile(this.tileExposedToAir(i, j) ? 2 : 0);
        else if (CONV_THORN.has(sheet)) this.kill(i, j);
        else if (sheet !== 1 && !this.frameImportant(sheet)) convTile(1);
        break;
      case 19: // 强制丛林（ForcedJungle，cs:56199-56240）
        if (walls && wall > 0) {
          if (wall === 63 || wall === 69 || wall === 70 || wall === 81) convWall(64);
          else if (wall !== 15) convWall(15);      // 蘑菇墙带（15 自身豁免）
        }
        if (!tiles) break;
        if (torchOk) convTorch(21);
        else if (CONV_THORN.has(sheet)) convTile(69);   // 荆棘转丛林棘（非击杀）
        if (!this.frameImportant(sheet)) {          // 独立 if：露天丛林草 60 / 泥 59
          convTileLive(this.tileExposedToAir(i, j) ? 60 : 59);
        }
        break;
      case 20: // 强制神庙（ForcedTemple，cs:56241-56261）
        if (walls) convWall(87);                   // 蜥蜴砖墙
        if (tiles) {
          if (torchOk) convTorch(21);
          else if (sheet !== 69 && CONV_THORN.has(sheet)) convTile(69);
          if (!this.frameImportant(sheet)) convTileLive(226);  // 蜥蜴砖
        }
        break;
      case 21: { // 强制地牢（ForcedDungeon，cs:56262-56298：GenVars.CurrentDungeonGenVars
        //  仅世界生成期非空——运行时取兜底蓝砖 41/墙 17（`?.brickTileType ?? 41`），
        //  本仓地牢主题未入 World 状态,同取兜底）
        const brickTile = 41, brickWall = 17;
        if (walls) convWall(brickWall);
        if (!tiles) break;
        if (torchOk) convTorch(21);
        else if (CONV_THORN.has(sheet)) this.kill(i, j);
        if (!this.frameImportant(sheet)) convTileLive(brickTile);
        break;
      }
    }
  }

  // ================= hardUpdateWorld（cs:69661，困难模式） =================

  private hardUpdateWorld(i: number, j: number): void {
    if (!this.hardMode) return;                        // hardModeWorldUpdates（cs:71508/:70131）
    const st = this.host.store;
    // ★RD-F1（2026-09-04）：头门=原版字面 `!hardModeWorldUpdates || Main.tile[i,j].inActive()`
    //  （cs:70130-70133）——只挡已致动（inActive=wire bit5），幽灵残型格放行、type 裸读：
    //  四条臂（水晶碎块 cs:70134 / 叶绿播种 :70172 / 211·346 衰减 :70203 / 蔓延 SELF 判
    //  :70324/:70351）全部直比 Main.tile.type。调用点=Overground/UndergroundTile 的
    //  nactive() 段（cs:72793/:73844），不另设 active 门（幽灵格不入主链=原版相）。
    if (!st.inBounds(i, j) || st.isActuated(i, j)) return;
    const sheet = sheetOf(this.typeAt(i, j));
    // 水晶碎块生长（cs:69668-69709）：珍珠石/珍珠沙/神圣冰/神圣硬化沙岩 族 + 岩层下 + 1/5
    // ★④ remix 深度带放宽（cs:70137 `((double)j > Main.rockLayer || Main.remixWorld)`）——
    //  remix 世界岩层之上也长水晶碎块（骰位不变：带过不过都在 Next(5) 之前）
    if (CAN_GROW_SHARDS.has(sheet) && (j > this.host.rockLevel || !!this.host.remixWorld) && this.rng() < 1 / 5) {
      // ★F3（2026-09-04 蓝队 M24 补遗）方向表 vanilla 化（cs:70141-51）：Next(4) 后
      //  case 0→左 / case 1→右 / default→`num3=(num!=0)?1:-1`——num∈{2,3} 恒 ≠0,
      //  故 dy 恒 +1（向下）,原版【永不向上】。此前 [0,-1] 上向支系自创。
      const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, 1], [0, 1]];
      const [dx, dy] = dirs[Math.floor(this.rng() * 4)];
      if (!this.active(i + dx, j + dy)) {
        let cnt = 0;
        for (let k = i - 6; k <= i + 6; k++) for (let l = j - 6; l <= j + 6; l++) {
          if (this.active(k, l) && sheetOf(this.typeAt(k, l)) === 129) cnt++;
        }
        if (cnt < 2) {
          // ★F4（2026-09-04 蓝队 M24 补遗）掷序对齐（cs:70160-63）：先 style=Next(18),
          //  再 Next(50)==0 条件才掷 Next(6)（rare 3 掷/普通 2 掷不变,序变——此前
          //  先 Next(50) 后 Next(18),流位差同掷数异序）。
          let style = Math.floor(this.rng() * 18);
          if (this.rng() < 1 / 50) style = 18 + Math.floor(this.rng() * 6);
          // ★G-129（2026-09-18）：PlaceTile case 129（cs:60171-60180）只写 frameX=style*18,
          //  frameY 由 SquareTileFrame→TileFrameImportant case 129（cs:86339-86369）→
          //  CheckAndAdjustMultiDirectionalTile（cs:60805-60855,锚向优先 下>左>右>上）落定
          //  ——此前恒 frameY=0:侧生/垂生碎块渲染地面行精灵（贴错帧行=形态偏差同源）。
          const fy = this.multiDirFrameY(i + dx, j + dy);
          if (fy >= 0) this.place1(i + dx, j + dy, 129, style, 1, fy);
        }
      }
    }
    // 叶绿生长（cs:69712-69731）：深处丛林草 1/300 → 周围 10 格泥块(59) → 叶绿
    //（原版目标严格 ==59,曾误含丛林草 60 直转矿）
    // ★④ remix 深度带放宽（cs:70180 `> (worldSurface + rockLayer) / 2.0 || remixWorld`）
    //  ——带内两臂（60 播种 / 211·346 自增殖+退化）同享放宽,remix 世界中带之上也演化
    if (j > (this.host.worldSurface + this.host.rockLevel) / 2 || !!this.host.remixWorld) {
      if (sheet === 60 && this.rng() < 1 / 300) {
        const x = i + Math.floor(this.rng() * 21) - 10;
        const y = j + Math.floor(this.rng() * 21) - 10;
        const s2 = sheetOf(this.typeAt(x, y));
        if (this.active(x, y) && s2 === 59
          && (!this.active(x, y - 1) || ![5, 236, 702, 238].includes(sheetOf(this.typeAt(x, y - 1))))
          && this.canChlorophyteGrow(x, y)) {
          this.convert(x, y, 8);
        }
      }
      // 叶绿砖/矿扩散（cs:70179-70227：211/346 双臂）——★R12-9（2026-08-24）补
      //  **自增殖臂**：Next(3)!=0（2/3）→ Next(4) 四向一步 → 目标 active 且
      //  泥(59)/丛林草(60) 且 CanChlorophyteGrow → Convert(8)=转叶绿 211。
      //  这是叶绿在泥/丛林草中蔓延的主机制（叶绿农场/自然增殖全靠它）——曾整缺,
      //  叶绿只被消耗（挖/退化）永不增殖,长期世界存量单调递减。
      //  退化臂（Convert 9,±6 随机格单次）——★⑦（2026-09-05）流归属定谳：原版该臂
      //  掷骰写作 Main.rand.Next(-6,7)（cs:70209-70210）,但 WorldGen.genRand ≡
      //  Main.rand（WorldGen.cs:4362 别名属性）且 hardUpdateWorld 全部调用点都在
      //  UpdateWorld → SwapRandom("UpdateWorldGen") 命名流作用域内（Main.cs:17985-
      //  17988）——两写法同流,本域 this.rng()（蔓延流）=正确归属,原"Main.rand 流"
      //  注系误标（非 genRand/Main.rand 分流的分流面;原版无第二基流）。
      //  ★⑦顺带补 InWorld(num8,num9,2) 门（cs:70211 原文,此前漏——世界 2 格边距内
      //  不落 Convert 9;无掷位差,只拦边带写面）。
      if (sheet === 211 || sheet === 346) {
        if (this.rng() >= 1 / 3) {                    // genRand.Next(3) != 0
          const d = Math.floor(this.rng() * 4);       // genRand.Next(4)
          const nx = i + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const ny = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
          const s2 = sheetOf(this.typeAt(nx, ny));
          // InWorld(num8,num9,2)（cs:70217）——2 格边距
          if (nx >= 2 && nx < st.w - 2 && ny >= 2 && ny < st.h - 2
            && this.active(nx, ny) && (s2 === 59 || s2 === 60)
            && this.canChlorophyteGrow(nx, ny)) {
            this.convert(nx, ny, 8);
          }
        }
        const x = i + Math.floor(this.rng() * 13) - 6;   // Main.rand.Next(-6,7)（≡genRand）
        const y = j + Math.floor(this.rng() * 13) - 6;
        if (x >= 2 && x < st.w - 2 && y >= 2 && y < st.h - 2   // InWorld(num8,num9,2)（cs:70211）
          && this.active(x, y)) this.convert(x, y, 9);
      }
    }
    // 世花已死则邪恶不再蔓延（cs:69757-69759）
    if ((this.host.flags['downed_262'] && this.rng() < 1 / 2) || !this.allowedToSpread) return;
    // 邪恶草蔓延（cs:69761-69806 腐化 / :69808-69895 猩红 / :69897-69955 神圣 同构）
    if (SPREADS_CORRUPTION.has(sheet)) this.evilSpread(i, j, 1);
    else if (SPREADS_CRIMSON.has(sheet)) this.evilSpread(i, j, 4);
    else if (SPREADS_HALLOW.has(sheet)) this.evilSpread(i, j, 2);
  }

  /** 邪恶/神圣蔓延主体（cs:69761+ 同构三分支合并）：±3 随机点，1/2 链式重试，
   *  向日葵 2 格内不转，叶绿附近防御性退化。
   *  可转换集差异（腐化/猩红 cs:69774-69805 vs 神圣 cs:69919-69955）：神圣不含
   *  丛林草(60)/丛林刺(69)——神圣不吞丛林 */
  private evilSpread(i: number, j: number, convType: number): void {
    const st = this.host.store;
    const ALLOW: Record<number, number[]> = {
      1: [2, 477, 1, 53, 396, 397, 60, 69, 161],
      4: [2, 477, 1, 53, 396, 397, 60, 69, 161],
      2: [2, 477, 1, 53, 396, 397, 161],
    };
    let again = true;
    while (again) {
      again = false;
      const x = i + Math.floor(this.rng() * 7) - 3;
      const y = j + Math.floor(this.rng() * 7) - 3;
      if (!st.inBounds(x, y)) continue;
      // nearbyChlorophyte → 防御退化（cs:69768-69770；ChlorophyteDefense 非 remix 无操作）。
      // ★R12-10（2026-08-24）：补 1-2 矿**概率防御臂**（cs:70068-70082）——count>0 时
      //  非 remix 走 `genRand.Next(-1,4) < count`（Next(-1,4)∈{-1..3} 5 值 →
      //  count=1→2/5、count=2→3/5 概率 true）→ 本次蔓延尝试被跳过（叶绿对邪恶的
      //  软光环）;曾只有 ≥3 硬挡。世界边 10 格内 nearbyChlorophyte 恒 false（cs:70051
      //  -70059）=不拦蔓延（勿写成 return——那是"跳过蔓延",方向相反）。
      if (!(x <= 10 || x >= st.w - 10 || y <= 10 || y >= st.h - 10)) {
        let chlor = 0;
        for (let k = x - 5; k <= x + 5; k++) for (let l = y - 5; l <= y + 5; l++) {
          const s = sheetOf(this.typeAt(k, l));
          if (this.active(k, l) && (s === 211 || s === 346)) chlor++;
        }
        if (chlor >= 3 || (chlor > 0 && this.rng() < (chlor + 1) / 5)) return;
      }
      // 向日葵 2 格内（CountNearBlocksTypes(x,y,2,cap1,27)）→ 中止本次
      let sunflower = false;
      for (let k = x - 2; k <= x + 2 && !sunflower; k++) for (let l = y - 2; l <= y + 2; l++) {
        if (this.active(k, l) && sheetOf(this.typeAt(k, l)) === 27) { sunflower = true; break; }
      }
      if (sunflower) continue;
      const s = sheetOf(this.typeAt(x, y));
      // ★RD-F2（2026-09-04）：蔓延目标格 type 裸读（cs:70319-70431 三条蔓延臂均
      //  `Main.tile[num,num].type == N` 直比，无 active 门）——幽灵残型目标照样命中
      //  → 掷 Next(2) 续走链（RNG 流对齐关键：骰已掷、游走已续）；写入面由
      //  Convert_ActuallyConvertTile 的 active 门（cs:56788）+本仓 convert 头门
      //  （!act && wall<=0 即返）自然落空 = 幽灵目标「掷骰续走、写面不落」。
      const convertible = ALLOW[convType].includes(s) || TILE_MOSS.has(s);
      if (convertible) {
        if (this.rng() < 1 / 2) again = true;
        this.convert(x, y, convType, true, false);
      }
    }
  }

  /** CanChlorophyteGrow（cs:69525-69576）：35 格内 ≤40 且 85 格内 ≤130（岩层上减半） */
  private canChlorophyteGrow(i: number, j: number): boolean {
    let cap1 = 40, cap2 = 130, r1 = 35, r2 = 85;
    if (j < this.host.rockLevel) { cap1 = 20; cap2 = 65; r1 = 52; r2 = 127; }
    const count = (r: number) => {
      let n = 0;
      for (let x = i - r; x < i + r; x++) for (let y = j - r; y < j + r; y++) {
        if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 211) n++;
      }
      return n;
    };
    return count(r1) <= cap1 && count(r2) <= cap2;
  }

  // ================= 墙蔓延（cs:74958/75073） =================

  private spreadGrassWalls(wallDist: number, i: number, j: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const wall = st.wall[this.at(i, j)];
    const sheet = this.active(i, j) ? sheetOf(this.typeAt(i, j)) : -1;
    let conv = -1;
    if (WALL_SPREADS_CRIMSON.has(wall) || (sheet >= 0 && SPREADS_CRIMSON.has(sheet))) conv = 4;
    else if (WALL_SPREADS_CORRUPTION.has(wall) || (sheet >= 0 && SPREADS_CORRUPTION.has(sheet))) conv = 1;
    else if (WALL_SPREADS_HALLOW.has(wall) || (sheet >= 0 && SPREADS_HALLOW.has(sheet))) conv = 2;
    if (conv === -1) return;
    const x = i + Math.floor(this.rng() * 5) - 2;
    const y = j + Math.floor(this.rng() * 5) - 2;
    if (!st.inBounds(x, y)) return;
    const tw = st.wall[this.at(x, y)];
    // 腐化/猩红：目标墙须为草墙族 63-68（cs:74975）；神圣：63/65/66/68（cs:75027）
    const grassWall = tw >= 63 && tw <= 68;
    if (conv === 2 ? !(tw === 63 || tw === 65 || tw === 66 || tw === 68) : !grassWall) return;
    // wallDist 范围内有同族邪恶 tile 才转化（cs:74982-75000）
    const spreads = conv === 1 ? SPREADS_CORRUPTION : conv === 4 ? SPREADS_CRIMSON : SPREADS_HALLOW;
    let near = false;
    for (let k = i - wallDist; k <= i + wallDist && !near; k++) for (let l = j - wallDist; l <= j + wallDist; l++) {
      if (this.active(k, l) && spreads.has(sheetOf(this.typeAt(k, l)))) { near = true; break; }
    }
    if (near) this.convert(x, y, conv, false, true);
  }

  private spreadDesertWalls(wallDist: number, i: number, j: number): void {
    const st = this.host.store;
    if (!st.inBounds(i, j)) return;
    const wall = st.wall[this.at(i, j)];
    const sheet = this.active(i, j) ? sheetOf(this.typeAt(i, j)) : -1;
    // 仅沙岩/硬化沙墙/块（cs:75077-75085）
    const isSandWall = WALL_CONV_SANDSTONE.has(wall) || WALL_CONV_HARD_SAND.has(wall);
    const isSandTile = sheet >= 0 && (CONV_SANDSTONE.has(sheet) || CONV_HARD_SAND.has(sheet));
    if (!isSandWall && !isSandTile) return;
    let conv = -1;
    if (WALL_SPREADS_CORRUPTION.has(wall) || SPREADS_CORRUPTION.has(sheet)) conv = 1;
    else if (WALL_SPREADS_HALLOW.has(wall) || SPREADS_HALLOW.has(sheet)) conv = 2;
    else if (WALL_SPREADS_CRIMSON.has(wall) || SPREADS_CRIMSON.has(sheet)) conv = 4;
    if (conv === -1) return;
    const x = i + Math.floor(this.rng() * 5) - 2;
    const y = j + Math.floor(this.rng() * 5) - 2;
    if (!st.inBounds(x, y)) return;
    // 目标须为纯沙墙族（cs:75112-75120）
    if (!WALL_CONV_PURE_SAND.has(st.wall[this.at(x, y)])) return;
    const spreads = conv === 1 ? SPREADS_CORRUPTION : conv === 4 ? SPREADS_CRIMSON : SPREADS_HALLOW;
    let near = false;
    for (let k = i - wallDist; k <= i + wallDist && !near; k++) for (let l = j - wallDist; l <= j + wallDist; l++) {
      if (this.active(k, l) && spreads.has(sheetOf(this.typeAt(k, l)))) { near = true; break; }
    }
    if (near) this.convert(x, y, conv, false, true);
  }

  // ==== 苔藓（UpdateWorld_OvergroundTile tileMoss 支 cs:72946-73003;★A-1 2026-09-04
  //  换锚——旧注 cs:72400-72462 系 1456 代行号,1457 该区已为 SpawnThunderStorm/雷暴落雷） ====

  private mossUpdate(i: number, j: number, minI: number, maxI: number, minJ: number, maxJ: number): void {
    if (this.rng() >= 0.5) return;
    const st = this.host.store;
    const self = sheetOf(this.typeAt(i, j));
    for (let k = minI; k < maxI; k++) {
      for (let l = minJ; l < maxJ; l++) {
        if ((i === k && j === l) || !this.active(k, l)) continue;
        const other = sheetOf(this.typeAt(k, l));
        if (other !== 1 && other !== 38) continue;
        const to = this.mossConversion(self, other);
        if (to) {
          this.spreadGrass(k, l, other, to);
        }
      }
    }
    // 藓堆 184（★A-1 2026-09-04 换锚+支级对齐）：掷门=cs:72974 `genRand.Next(6)==0`
    //  → cs:72978 Next(4) 定向（dirs 序=case 0..3）→ cs:72992 裸 active() 空格门 →
    //  PlaceTile(184,mute)（cs:72995）：支撑门=四邻 (tileMoss|tileMossBrick)+SolidTile
    //  （cs:60196-60199/:60205-60208,两支并列=并集;两表并集≡GetTileMossColor 域）→
    //  写面 frameX=style*18=0/frameY=Next(3)*18（cs:60200-60203）→ PlaceTile 尾
    //  SquareTileFrame 的 TileFrame case 184（cs:86428-86499）重锚 frameX=22×
    //  GetTileMossColor(首支苔邻,序=下/上/左/右)+frameY 分带（下0/上54/左108/右162,
    //  variant*18 ∈[0,36] 恒在带外→恒赋值 base+variant*18）→ cs:72997
    //  CopyPaintAndCoating(源格)。与原版次序的等同性：TileFrame 重锚只读四邻,与
    //  本格写面先后无关 → 一次 setTile 直达终态（掷位不增不减=Next(3) 一掷,
    //  原版 tileMoss/tileMossBrick 双支同过时二掷重写 frameY,分布同形,流域注记）。
    if (this.rng() < 1 / 6) {
      const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const [dx, dy] = dirs[Math.floor(this.rng() * 4)];
      const tx = i + dx, ty = j + dy;
      if (st.inBounds(tx, ty) && !this.active(tx, ty)) {
        const actN = (ax: number, ay: number): boolean =>
          st.inBounds(ax, ay) && st.flags[st.idx(ax, ay)] !== 0;
        // GetTileMossColor（cs:82492）：苔/苔砖 11 对 → 色序号 0..10,域外 -1
        const colorAt = (ax: number, ay: number): number => {
          if (!actN(ax, ay)) return -1;
          const sh = sheetOf(st.type[st.idx(ax, ay)]);
          return MOSS_COLOR_OF.get(sh) ?? -1;
        };
        // PlaceTile 支撑门（cs:60196-60199∪60205-60208）：任一邻 (苔|苔砖)+SolidTile
        const mossAnchor = (ax: number, ay: number): boolean =>
          colorAt(ax, ay) >= 0 && this.solidTile(ax, ay);
        if (mossAnchor(tx - 1, ty) || mossAnchor(tx + 1, ty)
          || mossAnchor(tx, ty - 1) || mossAnchor(tx, ty + 1)) {
          const variant = Math.floor(this.rng() * 3);        // cs:60203 Next(3)*18
          // TileFrame case 184（cs:86428-86499）：四邻序 下/上/左/右取首支苔邻
          // （下+!half+!顶坡 cs:86434、上+!底坡 cs:86431、左右裸 active cs:86438-86441）
          const isTopSlope = (sl: number): boolean => sl === 1 || sl === 2;
          const isBottomSlope = (sl: number): boolean => sl === 3 || sl === 4;
          const slopeAt = (ax: number, ay: number): number =>
            st.inBounds(ax, ay) ? st.slope[st.idx(ax, ay)] : 0;
          let anchor = colorAt(tx, ty + 1); let bandBase = 0;   // 下邻支（带 [0,36]）
          if (anchor < 0 || !actN(tx, ty + 1) || st.half[st.idx(tx, ty + 1)] !== 0
            || isTopSlope(slopeAt(tx, ty + 1))) {
            anchor = colorAt(tx, ty - 1); bandBase = 54;        // 上邻支（带 [54,90]）
            if ((anchor < 0 || !actN(tx, ty - 1) || isBottomSlope(slopeAt(tx, ty - 1)))) {
              anchor = colorAt(tx - 1, ty); bandBase = 108;     // 左邻支（带 [108,144]）
              if (anchor < 0) { anchor = colorAt(tx + 1, ty); bandBase = 162; }  // 右邻支
            }
          }
          if (anchor >= 0) {
            st.setTile(tx, ty, S(184), anchor * 22, bandBase + variant * 18);
            this.frameDependents(tx, ty);                       // PlaceTile 尾 SquareTileFrame
            // CopyPaintAndCoating(源格)（cs:72997）：paint + invisible/fullbright 两位
            st.setPaint(tx, ty, st.paint[st.idx(i, j)]);
            st.setCoat(tx, ty, 2 | 8, st.coat[st.idx(i, j)] & (2 | 8));  // COAT_BLOCK_MASK
          }
        }
      }
    }
  }

  /** MossConversion（cs:71469-71494）：苔↔苔砖对照表 */
  private mossConversion(thisType: number, otherType: number): number {
    if (TILE_MOSS_BRICK.has(thisType) && otherType === 38) return thisType;
    if (TILE_MOSS.has(thisType) && otherType === 1) return thisType;
    const pairs: Record<number, number> = {
      182: 515, 515: 182, 180: 513, 513: 180, 179: 512, 512: 179,
      381: 517, 517: 381,
      534: 535, 535: 534, 536: 537, 537: 536, 539: 540, 540: 539,
      625: 626, 626: 625, 627: 628, 628: 627, 183: 516, 516: 183, 181: 514, 514: 181,
    };
    return pairs[thisType] ?? 0;
  }

  // ================= 药草（PlantAlch cs:45910 / GrowAlch cs:45786 / PlaceAlch） =================

  private plantAlch(): void {
    const st = this.host.store;
    const x = 20 + Math.floor(this.rng() * (st.w - 40));
    // 深度分布（cs:45917-45921）：1/40 深层、9/10 地表下、1/10 全域
    let y: number;
    const r = this.rng();
    if (r < 1 / 40) y = Math.floor((this.host.rockLevel + st.h) / 2) + Math.floor(this.rng() * (st.h - 20 - Math.floor((this.host.rockLevel + st.h) / 2)));
    else if (r < 1 / 40 + 9 / 10) y = Math.floor(this.host.worldSurface) + Math.floor(this.rng() * (st.h - 20 - Math.floor(this.host.worldSurface)));
    else y = 20 + Math.floor(this.rng() * (st.h - 40));
    if (y >= st.h - 20) return;
    // 向下找首个实心
    let k = y;
    while (k < st.h - 20 && !this.active(x, k)) k++;
    if (!this.active(x, k) || this.active(x, k - 1) || this.liquidAt(x, k - 1) !== 0) return;
    // 密度门（cs:45928-45945）：15×15（随世界宽缩放）内药草 <5
    const rad = Math.floor(15 * (st.w / 4200));
    let cnt = 0;
    for (let dx = Math.max(4, x - rad); dx <= Math.min(st.w - 4, x + rad); dx++) {
      for (let dy = Math.max(4, k - rad); dy <= Math.min(st.h - 4, k + rad); dy++) {
        // ★RD-F3（2026-09-04）：密度普查裸读（cs:46320-46327 `if (Main.tileAlch[
        //   Main.tile[i,j].type]) num5++` 无 active 门）——幽灵药草残型计入密度,
        //  去掉本仓多加的 active 门。
        if (TILE_ALCH.has(sheetOf(this.typeAt(dx, dy)))) cnt++;
      }
    }
    if (cnt >= 5) return;
    // PlaceSuitableHerbHere（cs:45948-45977）：按脚下方块选药草种
    const ground = sheetOf(this.typeAt(x, k));
    let style = -1;
    if (ground === 2 || ground === 109) style = 0;
    else if (ground === 60) style = 1;
    else if (ground === 0 || ground === 59) style = 2;
    else if ([23, 661, 25, 203, 199, 662].includes(ground)) style = 3;
    else if ((ground === 53 || ground === 116) && x >= 380 && x <= st.w - 380) style = 4;
    else if (ground === 57 || ground === 633) style = 5;
    else if (SNOW_FAMILY.has(ground)) style = 6;
    if (style === -1) return;
    // PlaceAlch：82 号芽，frameX = style*18；★⑥ CopyPaintAndCoating(tile2=脚下方块)
    // （PlaceAlch cs:45870 落位后漆继承）
    if (this.place1(x, k - 1, 82, style)) this.copyPaintAndCoating(x, k, x, k - 1);
  }

  private growAlch(x: number, y: number): void {
    const st = this.host.store;
    if (!this.active(x, y)) return;
    const i = this.at(x, y);
    const fx = st.frameX[i];
    const herb = Math.floor(fx / 18); // 药草种（0-6）
    // 淹死规则（cs:45796-45807）：岩浆除火冠花(5)、水除月光花(1)/水叶(4) 外死亡
    if (this.liquidAt(x, y) > 0) {
      const isLava = st.liquidType[i] === 2;
      const isWater = st.liquidType[i] === 1;
      if (!((isLava && herb === 5) || (isWater && (herb === 1 || herb === 4)))) {
        this.kill(x, y);
        return;
      }
    }
    const sheet = sheetOf(st.type[i]);
    if (sheet === 82) {
      // 芽 → 成熟（cs:45809-45867）：开花条件各自满足时 1/50 直跳 84
      const bloom = (herb === 0 && this.host.isDay) || (herb === 1 && !this.host.isDay)
        || (herb === 2) || (herb === 3) || (herb === 4 && this.host.raining)
        || (herb === 5) || (herb === 6 && y > this.host.worldSurface);
      if (bloom && this.rng() < 1 / 50) {
        // 帧内已有花位的直接成花（帧 0/18/72/36/90 各条件段）；否则走 83
        st.setTile(x, y, S(84), fx, 0);
      } else if (this.rng() < 1 / 50) {
        st.setTile(x, y, S(83), fx, 0);
      }
      return;
    }
    if (sheet === 83) {
      // 成熟 ⇌ 开花（cs:45870-45897）：帧 36 的 1/3 权重摆动
      if (fx === 36 && this.rng() < 2 / 3) {
        if (this.rng() < 1 / 2) st.setTile(x, y, S(84), fx, 0);
      } else if (fx === 108 && this.rng() < 1 / 30) {
        st.setTile(x, y, S(84), fx, 0);
      } else {
        // 满足开花条件 → 1/50 转 84（cs:45809 同构，成熟态沿用）
        const herb2 = herb;
        const bloom = (herb2 === 0 && this.host.isDay) || (herb2 === 1 && !this.host.isDay)
          || (herb2 === 4 && this.host.raining) || (herb2 === 6 && y > this.host.worldSurface);
        if (bloom && this.rng() < 1 / 50) st.setTile(x, y, S(84), fx, 0);
      }
      return;
    }
    if (sheet === 84 && fx === 36 && this.rng() < 1 / 2) {
      // 开花 → 成熟回落（cs:45874-45885 else-if 链）
      st.setTile(x, y, S(83), fx, 0);
    }
  }

  // ================= 南瓜株成长（GrowPumpkin cs:52522-52586） =================

  /** GrowPumpkin（cs:52522）1:1：2×2 整株 stage=fx/36（0..4）,完整性与草族支撑
   *  （下方两柱须 SolidTile ∈ {2,477,109,492},cs:52552-52556）双门 → 全格 fx+=36。
   *  采样格可为株内任意格（锚=fx%2/fy%2 归一,cs:52527-52540） */
  private growPumpkin(i: number, j: number): void {
    const st = this.host.store;
    const i0 = st.idx(i, j);
    const t = this.typeAt(i, j);
    const fx = st.frameX[i0], fy = st.frameY[i0];
    const stage = Math.floor(fx / 36);
    if (stage >= 4) return;                       // cs:52541-52543（num4>=4 不再长）
    const ax = i - (Math.floor(fx / 18) % 2);     // cs:52531-52539 列归一
    const ay = j - (Math.floor(fy / 18) % 2);     // cs:52527-52530 行归一
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (!st.inBounds(ax + dx, ay + dy)) return;
        const ii = st.idx(ax + dx, ay + dy);
        if (!st.flags[ii] || st.type[ii] !== t || st.frameX[ii] !== dx * 18 + stage * 36) return;
      }
      // 支撑：SolidTile 且 草族（2 草/477 草变体/109 圣草/492 圣草变体,cs:52552-52556）
      const bi = st.idx(ax + dx, ay + 2);
      if (!this.solidTile(ax + dx, ay + 2)) return;
      const bs = sheetOf(st.type[bi]);
      if (bs !== 2 && bs !== 477 && bs !== 109 && bs !== 492) return;
    }
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const ii = st.idx(ax + dx, ay + dy);
      st.setTile(ax + dx, ay + dy, t, st.frameX[ii] + 36, st.frameY[ii]);   // cs:52570-52580 全格 frameX+=36
    }
  }

  // ================= 仙人掌（cs:56584） =================

  private growCactus(i: number, j: number): void {
    const st = this.host.store;
    // ★② 头门 nactive 化（cs:57059 原版字面 `!tile.nactive()`）——已致动（致动器翻位）
    //  仙人掌不再长。本文件主链 nactive=原版字面（TileStore.isActive=active∧!inActive,
    //  幽灵残型/已致动都判不活跃）;体支沙上新生（cs:57093 tile2.active() 等）仍原版
    //  active() 字面,不动。
    if (j <= 0 || !st.isActive(i, j)) return;
    const base = this.typeAt(i, j);
    const baseSheet = sheetOf(base);
    // ★支撑形态双态门（cs:57060-57061）：半砖/坡面基格运行时不长——原版
    //   `(!isGeneratingOrLoadingWorld && slope!=0)||halfBrick` 拒绝,生成期窗口
    //   放行=沙漠山坡原生仙人掌是原版相（worker 侧不受此限）;运行时演化恒属
    //   "非生成期",坡/半砖根一律拒绝（2026-08-26 用户报 S1 坡沙生根仙人掌实证）
    const bi = st.idx(i, j);
    if (st.half[bi] || st.slope[bi] !== 0) return;
    if (this.liquidAt(i, j - 1) > 0) return;
    // 水量门（cactusWaterWidth 50/Height 25/Limit 25，cs:57065-57076）——
    // ★⑨ remix 地表水豁免（cs:57075 `(!Main.remixWorld || !(j > worldSurface)) && …`）：
    //   remix 世界地表以下（j>worldSurface）格不受水量门
    let water = 0;
    for (let k = i - 50; k < i + 50; k++) for (let l = j - 25; l < j + 25; l++) {
      if (st.inBounds(k, l)) water += this.liquidAt(k, l);
    }
    if (!(!!this.host.remixWorld && j > this.host.worldSurface) && Math.floor(water / 255) > 25) return;
    if (CONV_SAND.has(baseSheet)) {
      // 沙上新生（cs:56613-56660）：上方净空 + 6×5 内仙人掌 <4 + 沙 >10
      if (this.active(i, j - 1) || this.active(i - 1, j - 1) || this.active(i + 1, j - 1)) return;
      let cacti = 0, sands = 0;
      for (let m = i - 6; m <= i + 6; m++) for (let n = j - 3; n <= j + 1; n++) {
        if (!this.active(m, n)) continue;
        const s = sheetOf(this.typeAt(m, n));
        if (s === 80) { cacti++; if (cacti >= 4) return; }
        if (CONV_SAND.has(s)) { sands++; if (sands > 10) break; }
      }
      if (sands > 10) {
        st.setTile(i, j - 1, S(80), 0, 0);
        this.copyPaintAndCoating(i, j, i, j - 1);               // ★⑥ GrowCactus cs:57135（源=沙）
      }
      return;
    }
    if (baseSheet !== 80) return;
    // 仙人掌增长（cs:56664-56809）：找顶、密度检查、1/3 分支/直立
    let tx = i, ty = j;
    while (this.active(tx, ty) && sheetOf(this.typeAt(tx, ty)) === 80) {
      ty++;
      if (!this.active(tx, ty) || sheetOf(this.typeAt(tx, ty)) !== 80) {
        if (this.active(tx - 1, ty) && sheetOf(this.typeAt(tx - 1, ty)) === 80
          && this.active(tx - 1, ty - 1) && sheetOf(this.typeAt(tx - 1, ty - 1)) === 80 && tx >= i) tx--;
        if (this.active(tx + 1, ty) && sheetOf(this.typeAt(tx + 1, ty)) === 80
          && this.active(tx + 1, ty - 1) && sheetOf(this.typeAt(tx + 1, ty - 1)) === 80 && tx <= i) tx++;
      }
    }
    ty--;
    const height = ty - j;
    const lean = i - tx;
    tx = i - lean;
    ty = j;
    // 顶密度检查（11-12 格窗口，cs:56715-56730）
    let cnt = 0;
    for (let m = tx - 2; m <= tx + 2; m++) for (let n = ty - (11 - height); n <= ty + height; n++) {
      if (this.active(m, n) && sheetOf(this.typeAt(m, n)) === 80) cnt++;
    }
    // ★⑨ 顶密度门（cs:57181-57187）：drunkWorld → Next(11,20)（=11+Next(9)）,
    //   其余 Next(11,13)（=11+Next(2)）——两支同为一掷,值域随种子变体
    if (cnt >= 11 + Math.floor(this.rng() * (this.host.drunkWorld ? 9 : 2))) return;
    tx = i; ty = j;
    if (lean === 0) {
      if (height === 0) {
        if (!this.active(i, j - 1)) {
          st.setTile(i, j - 1, S(80), 0, 0);
          this.copyPaintAndCoating(i, j, i, j - 1);             // ★⑥ cs:57201-57203
        }
        return;
      }
      // 分支判定（cs:56748-56783）：1/3 左/右/直上
      const sideClear = (d: number) => !this.active(i + d, j) && !this.active(i + 2 * d, j + 1)
        && !this.active(i + d, j - 1) && !this.active(i + d, j + 1) && !this.active(i + 2 * d, j);
      const roll = Math.floor(this.rng() * 3);
      if (roll === 0 && sideClear(-1)) {
        st.setTile(i - 1, j, S(80), 0, 0);
        this.copyPaintAndCoating(i, j, i - 1, j);               // ★⑥ cs:57227-57229
        return;
      }
      if (roll === 1 && sideClear(1)) {
        st.setTile(i + 1, j, S(80), 0, 0);
        this.copyPaintAndCoating(i, j, i + 1, j);               // ★⑥ cs:57238-57240
        return;
      }
      if (height < 2 + Math.floor(this.rng() * 6) && !this.active(i - 1, j - 1) && !this.active(i + 1, j - 1) && !this.active(i, j - 1)) {
        st.setTile(i, j - 1, S(80), 0, 0);
        this.copyPaintAndCoating(i, j, i, j - 1);               // ★⑥ cs:57249-57251
      }
      return;
    }
    // 斜顶延续（cs:56785-56809）
    if (!this.active(i, j - 1) && !this.active(i, j - 2) && !this.active(i + lean, j - 1)
      && this.active(i - lean, j - 1) && sheetOf(this.typeAt(i - lean, j - 1)) === 80) {
      st.setTile(i, j - 1, S(80), 0, 0);
      this.copyPaintAndCoating(i, j, i, j - 1);                 // ★⑥ cs:57261-57263
    }
  }

  // ================= ⑦⑧ 缺支族补接（演化域相邻批 2026-09-04） =================

  /** PlaceJunglePlant（cs:48191-48367）1:1。2×2 档（styleY>0 ∨ type∈{236,238,702}）
   *  与 3×2 档（233 常规株）双分支；允许族+底承 SolidTile+丛林草 60+KillTile(noItem)
   *  覆写+裸帧直写（本仓走 setTileSilent=不清液,与原版裸写共存水格语义一致——
   *  attemptBulbAt 同款,写后经 afterSilentTileWrite 补渲染脏标）。
   *  帧：2×2 num2=36*styleX（fx）/ num3（236/238/702=0,233 styleY1 档=36）；
   *  3×2 num6=54*styleX / fy∈{0,18}。★⑥（2026-09-05）inheritPaint 漆继承已接
   *  （原版演化域调用方全传 true——源=锚右列下一格,cs:48271-48274/:48348-48353）。
   *  CheckJunglePlant 完整性派发未接=既有口径。
   *  @returns 是否落位（233 兜底链二次尝试判据用） */
  private placeJunglePlant(X2: number, Y2: number, sheet: number, styleX: number, styleY: number): boolean {
    const st = this.host.store;
    const t = S(sheet);
    if (!t) return false;
    if (styleY > 0 || sheet === 236 || sheet === 238 || sheet === 702) {
      const num = Y2;
      if (X2 < 5 || X2 > st.w - 5 || num < 5 || num > st.h - 5) return false;
      // 2×2 允许族（cs:48204-48212）：61/703/62/655/69/74 +（236/702/238 档加 233）
      //  + 185 旗（frameY==0）；其余活动格即拒
      for (let dx = -1; dx <= 0; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          const ii = st.idx(X2 + dx, num + dy);
          if (!st.flags[ii]) continue;
          const sh = sheetOf(st.type[ii]!);
          const allow = sh === 61 || sh === 703 || sh === 62 || sh === 655 || sh === 69 || sh === 74
            || ((sheet === 236 || sheet === 702 || sheet === 238) && sh === 233)
            || (sh === 185 && (st.frameY[ii] ?? 0) === 0);
          if (!allow) return false;
        }
        // 底承：两列 num+1 行须 SolidTile+丛林草 60（cs:48226-48229）
        if (!this.solidTile(X2 + dx, num + 1) || sheetOf(this.typeAt(X2 + dx, num + 1)) !== 60) return false;
      }
      // 覆写允许族（cs:48238-48245 KillTile noItem）——非活动水格不动（原版同款共存）
      // ★②：noItem 位次零掉落（掉落面扩展后防凭空掉株）
      for (let dx = -1; dx <= 0; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          if (this.active(X2 + dx, num + dy)) this.killNoItem(X2 + dx, num + dy);
        }
      }
      const num2 = 36 * styleX;
      const num3 = (sheet === 236 || sheet === 238 || sheet === 702) ? 0 : 36;
      st.setTileSilent(X2 - 1, num - 1, t, num2, num3);
      st.setTileSilent(X2, num - 1, t, num2 + 18, num3);
      st.setTileSilent(X2 - 1, num, t, num2, num3 + 18);
      st.setTileSilent(X2, num, t, num2 + 18, num3 + 18);
      // ★⑥ inheritPaint（cs:48268-48275,原版演化域调用方全传 true——cs:75041/:75073/
      //  :75083/:75092/:75377/:74840/:74855）：漆源=锚右列下一格（other=X2,num+1）
      for (let dx = -1; dx <= 0; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          this.copyPaintAndCoating(X2, num + 1, X2 + dx, num + dy);
        }
      }
      this.host.afterSilentTileWrite?.(X2 - 1, num - 1, X2, num);
      return true;
    }
    // 3×2 档（cs:48272-48360，233 常规株）：允许族无 233；底承三列 SolidTile+60
    if (X2 < 5 || X2 > st.w - 5 || Y2 < 5 || Y2 > st.h - 5) return false;
    for (let m = X2 - 1; m < X2 + 2; m++) {
      for (let n = Y2 - 1; n < Y2 + 1; n++) {
        const ii = st.idx(m, n);
        if (!st.flags[ii]) continue;
        const sh = sheetOf(st.type[ii]!);
        const allow = sh === 61 || sh === 703 || sh === 62 || sh === 69 || sh === 655 || sh === 74
          || (sh === 185 && (st.frameY[ii] ?? 0) === 0);
        if (!allow) return false;
      }
      if (!this.solidTile(m, Y2 + 1) || sheetOf(this.typeAt(m, Y2 + 1)) !== 60) return false;
    }
    for (let k = X2 - 1; k < X2 + 2; k++) {
      for (let l = Y2 - 1; l < Y2 + 1; l++) {
        // ★②：cs:48238-48245 同位 noItem（3×2 档覆写）——零掉落
        if (this.active(k, l)) this.killNoItem(k, l);
      }
    }
    const num6 = 54 * styleX;
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(X2 - 1 + dx, Y2 - 1 + dy, t, num6 + dx * 18, dy * 18);
      // ★⑥ inheritPaint（cs:48347-48354,other2=X2,Y2+1 锚右列下一格）
      this.copyPaintAndCoating(X2, Y2 + 1, X2 - 1 + dx, Y2 - 1 + dy);
    }
    this.host.afterSilentTileWrite?.(X2 - 1, Y2 - 1, X2 + 1, Y2);
    return true;
  }

  /** TryGrowingAbigailsFlower（cs:73639-73661）：墓碑 85 采样 → Abigail 花 624 播种。
   *  ★Main.rand.Next(30) 门——原版走全局 Main.rand 流（非蔓延流）,本仓并入 spreadRng
   *  消费（流域归属注记,同 Convert 链先例——单机观测面等价,非行为近似）。
   *  尝试次数 = dontStarveWorld?2:1（cs:73651-73656）;每次 genRand ±10 掷点（两掷）,
   *  地基（70 蘑菇草/633 灰烬草/Conversion.Grass + SolidTileAllowBottomSlope）∧
   *  ±120 无同类 ∧ PlaceTile(624)（tileCut∪BreakableWhenPlacing 覆写面+帧 0/0,
   *  cs:59973-59986）全过即止。 */
  private tryGrowingAbigailsFlower(i: number, j: number): void {
    if (this.rng() >= 1 / 30) return;                       // Main.rand.Next(30) != 0
    const st = this.host.store;
    const attempts = this.host.dontStarveWorld ? 2 : 1;
    for (let k = 0; k < attempts; k++) {
      const lox = Math.max(10, i - 10), hix = Math.min(st.w - 10, i + 10);
      const loy = Math.max(10, j - 10), hiy = Math.min(st.h - 10, j + 10);
      const x = lox + Math.floor(this.rng() * Math.max(0, hix - lox));   // genRand.Next(lox,hix)
      const y = loy + Math.floor(this.rng() * Math.max(0, hiy - loy));
      if (!this.abigailGroundOk(x, y) || !this.noNearbyAbigailsFlower(x, y)) continue;
      // PlaceTile 624 支（cs:59973-59986）：目标空 ∨ tileCut ∨ BreakableWhenPlacing
      const ti = st.idx(x, y);
      if (st.flags[ti]) {
        const shT = sheetOf(st.type[ti]);
        if (!TILE_CUT_SHEETS.has(shT) && !BREAKABLE_WHEN_PLACING_SHEETS.has(shT)) continue;
      }
      st.setTileSilent(x, y, S(624), 0, 0);
      st.half[ti] = 0;
      st.slope[ti] = 0;
      this.host.afterSilentTileWrite?.(x, y, x, y);
      return;
    }
  }

  /** HasValidGroundForAbigailsFlowerBelowSpot（cs:73616-73637）：下格 70/633/草族 +
   *  SolidTileAllowBottomSlope */
  private abigailGroundOk(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return false;
    if (!st.flags[st.idx(x, y + 1)]) return false;
    const g = sheetOf(st.type[st.idx(x, y + 1)]);
    if (g !== 70 && g !== 633 && !CONV_GRASS.has(g)) return false;
    return this.solidTileAllowBottomSlope(x, y + 1);
  }

  /** NoNearbyAbigailsFlower（cs:73663-73682）：±120 窗内活性 624 即败 */
  private noNearbyAbigailsFlower(i: number, j: number): boolean {
    const st = this.host.store;
    const x0 = Math.max(10, i - 120), x1 = Math.min(st.w - 11, i + 120);
    const y0 = Math.max(10, j - 120), y1 = Math.min(st.h - 11, j + 120);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 624) return false;
      }
    }
    return true;
  }

  /** GetWaterDepth（cs:58828-58846）：列内水下探至底,返回水位格数（竹播水量门用） */
  private waterDepthAt(x: number, y: number): number {
    const st = this.host.store;
    let num = y;
    while (!this.solidTile(x, num)) {
      num++;
      if (num > st.h - 1) return 0;
    }
    num--;
    let num2 = num;
    while (num2 >= 0 && this.liquidAt(x, num2) > 0 && !this.solidTile(x, num2)) num2--;
    return num - num2;
  }

  /** CountGrowingPlantTiles（cs:58848-58862）：±range/±range*3 窗内同类株计数 */
  private countGrowingPlantTiles(x: number, y: number, range: number, sheet: number): number {
    let n = 0;
    for (let i = x - range; i <= x + range; i++) {
      for (let j = y - range * 3; j <= y + range * 3; j++) {
        if (this.active(i, j) && sheetOf(this.typeAt(i, j)) === sheet) n++;
      }
    }
    return n;
  }

  /** PlaceBamboo（cs:58875-58933）1:1：竹 571 / 水下丛林草 60 上方播新竹段。
   *  掷位（顺序敏感）：①Next(1,21)（入函数即掷,任何早退前）②571 源列深扫后的
   *  Next(1,21)（整除密度）③Next(40,61)（株重门）。写入=active+type 571+帧 0/0+
   *  slope/half 清位（原版字面）,SquareTileFrame→本仓 frameDependents。 */
  private placeBamboo(x: number, y: number): boolean {
    const st = this.host.store;
    const num3 = Math.floor(this.rng() * 20) + 1;            // genRand.Next(1, 21)
    if (st.inBounds(x, y) && st.wall[this.at(x, y)] > 0 && y <= this.host.worldSurface) return false;
    if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 314) return false;
    if (!this.active(x, y + 1)) return false;
    const below = sheetOf(this.typeAt(x, y + 1));
    if (below !== 571 && below !== 60) return false;
    const waterDepth = this.waterDepthAt(x, y);
    if (waterDepth < 2 || waterDepth > 5) return false;
    let num4 = this.countGrowingPlantTiles(x, y, 5, 571);
    let len = 1;
    if (below === 571) {
      while (!this.solidTile(x, y + len)) {
        len++;
        if (y + len > st.h - 1) return false;                // 原版缺底即崩,本仓护栏早退
      }
      if (len + Math.floor(num4 / (Math.floor(this.rng() * 20) + 1)) > num3) return false;
    } else {
      num4 += 25;
    }
    num4 += len * 2;
    if (num4 > Math.floor(this.rng() * 21) + 40) return false;   // genRand.Next(40, 61)
    if (!st.inBounds(x, y)) return false;
    const ti = this.at(x, y);
    st.setTileSilent(x, y, S(571), 0, 0);
    st.half[ti] = 0;
    st.slope[ti] = 0;
    this.frameDependents(x, y);                              // 原版 SquareTileFrame(x,y)
    return true;
  }

  /** SeaOatWaterCheck（cs:58736-58780）：海燕麦海况门——非 beach 带要求窗内水量
   *  ≥20 格位,beach 带（beachDistance=380）要求不足（沙洲海燕麦相）;带内窗扩
   *  65/±25。 */
  private seaOatWaterCheck(x: number, y: number): boolean {
    const st = this.host.store;
    let num = 45, num2 = 20;
    const num3 = 20;
    const num5init = num + 1;
    let num5 = num5init;
    let sum = 0;
    const beach = x <= 380 || x >= st.w - 380;
    if (beach) { num = 65; num2 += 5; }
    for (let i = x - num; i <= x + num; i++) {
      for (let j = y - num2; j <= y + num2; j++) {
        if (!st.inBounds(i, j) || this.solidTile(i, j)) continue;
        const liq = this.liquidAt(i, j);
        if (liq > 0) {
          sum += liq;
          const dist = Math.abs(i - x);
          if (dist < num5) num5 = dist;
        }
      }
    }
    if (Math.floor(sum / 255) >= num3) return !beach;
    return beach;
  }

  /** GrowSeaOat（cs:58824-58831）：frameX<180 → +=90（三档生长帧,原版裸 frameX 直写） */
  private growSeaOat(x: number, y: number): void {
    const st = this.host.store;
    const i = this.at(x, y);
    if (st.frameX[i] < 180) st.frameX[i] += 90;
  }

  /** PlantSeaOat（cs:58782-58810）：沙面播海燕麦 529（styleX=Next(5)*18,只在成功
   *  路径掷——掷位敏感）。墙>0/带液/底承非 SolidTileAllowBottomSlope+沙 → 败。 */
  private plantSeaOat(x: number, y: number): boolean {
    const st = this.host.store;
    if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return false;
    if (st.wall[this.at(x, y)] > 0 || this.active(x, y) || this.liquidAt(x, y) > 0) return false;
    if (!this.solidTileAllowBottomSlope(x, y + 1) || !CONV_SAND.has(sheetOf(this.typeAt(x, y + 1)))) return false;
    if (!this.seaOatWaterCheck(x, y)) return false;
    const ti = this.at(x, y);
    st.setTileSilent(x, y, S(529), Math.floor(this.rng() * 5) * 18, 0);
    st.half[ti] = 0;
    st.slope[ti] = 0;
    this.host.afterSilentTileWrite?.(x, y, x, y);
    return true;
  }

  /** OasisPlantWaterCheck（cs:47917-47947）：窗（45/20,boost 49/23）内非实心格水量
   *  ≥20 格位;beach 带内整列跳过（cs:47928-47930）。 */
  private oasisPlantWaterCheck(x: number, y: number, boost = false): boolean {
    const st = this.host.store;
    let num = 45, num2 = 20;
    if (boost) { num += 4; num2 += 3; }
    let sum = 0;
    for (let i = x - num; i <= x + num; i++) {
      if (x <= 380 || x >= st.w - 380) continue;
      for (let j = y - num2; j <= y + num2; j++) {
        if (st.inBounds(i, j) && !this.solidTile(i, j)) sum += this.liquidAt(i, j);
      }
    }
    return Math.floor(sum / 255) >= 20;
  }

  /** PlaceOasisPlant（cs:47949-48037）1:1：绿洲植物 530（3×2,styleX=Next(9)*54——
   *  ★掷在一切门之前,失败也消费=掷位敏感）。允许族=空∨529、无液、底承三列
   *  SolidTile+沙;X 出 beach 带（380）或 Y<5/>h-5 即拒;过门再验 OasisPlantWaterCheck。
   *  覆写面 KillTile(noItem);帧 fy∈{0,18}。 */
  private placeOasisPlant(X: number, Y: number): boolean {
    const st = this.host.store;
    const styleRoll = Math.floor(this.rng() * 9);            // genRand.Next(9)
    const t = S(530);
    if (!t) return false;
    if (X < 380 || X > st.w - 380 || Y < 5 || Y > st.h - 5) return false;
    for (let i = X - 1; i < X + 2; i++) {
      for (let j = Y - 1; j < Y + 1; j++) {
        if (!st.inBounds(i, j)) return false;
        if (this.active(i, j) && sheetOf(this.typeAt(i, j)) !== 529) return false;
        if (this.liquidAt(i, j) > 0) return false;
      }
      if (!this.solidTile(i, Y + 1) || !CONV_SAND.has(sheetOf(this.typeAt(i, Y + 1)))) return false;
    }
    if (!this.oasisPlantWaterCheck(X, Y)) return false;
    for (let k = X - 1; k < X + 2; k++) {
      for (let l = Y - 1; l < Y + 1; l++) {
        // ★②：PlaceOasisPlant 覆写 = KillTile noItem（cs:47994）——零掉落
        if (this.active(k, l)) this.killNoItem(k, l);
      }
    }
    const num3 = 54 * styleRoll;
    for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
      st.setTileSilent(X - 1 + dx, Y - 1 + dy, t, num3 + dx * 18, dy * 18);
    }
    this.host.afterSilentTileWrite?.(X - 1, Y - 1, X + 1, Y);
    return true;
  }

  /** GrowCheckSeaweed（cs:59406-59459）1:1：海草 549 维护/播种。
   *  浅水支（自身 549 且 liquid<200 ∨ 上格 liquid<200）：活性 549 1/2 KillTile。
   *  深水支：上两格空 ∧ Next(1)（恒 0 但**消费一掷**,掷位敏感）∧ y-2/y-3 满水
   *  ∧ ±4/×3 窗 549 ≤30 ∧ 底距 <17-Next(20) → PlaceTile(x, y-1, 549)。 */
  private growCheckSeaweed(x: number, y: number): void {
    const st = this.host.store;
    if ((sheetOf(this.typeAt(x, y)) === 549 && this.liquidAt(x, y) < 200)
      || this.liquidAt(x, y - 1) < 200) {
      if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 549 && this.rng() < 1 / 2) {
        this.kill(x, y);
      }
      return;
    }
    if (this.active(x, y - 1) || this.active(x, y - 2) || this.rng() >= 1
      || this.liquidAt(x, y - 2) !== 255 || this.liquidAt(x, y - 3) !== 255) return;
    let cnt = 0;
    for (let i = x - 4; i <= x + 4; i++) {
      for (let j = y; j <= y + 12; j++) {
        if (this.active(i, j) && sheetOf(this.typeAt(i, j)) === 549) {
          cnt++;
          if (cnt > 30) return;
        }
      }
    }
    let k = y;
    while (!this.solidTile(x, k) && k < st.h - 50) k++;
    if (k - y < 17 - Math.floor(this.rng() * 20)) {
      this.place1(x, y - 1, 549);
    }
  }

  /** PlacePumpkin（cs:52898-52947）1:1：万圣南瓜株 254（2×2,style=Next(6)*36 落在
   *  frameY 轴——★掷在边界门前,失败也消费）。允许族=空∨{3,73,113,110,185(fy=0)}
   *  ∧无液;底承两列 SolidTile+{2,109}。 */
  private placePumpkin(x: number, superY: number): void {
    const st = this.host.store;
    const num = Math.floor(this.rng() * 6) * 36;
    const t = S(254);
    if (!t) return;
    if (x < 5 || x > st.w - 5 || superY < 5 || superY > st.h - 5) return;
    for (let dx = -1; dx <= 0; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        const ii = st.idx(x + dx, superY + dy);
        if (st.flags[ii]) {
          const sh = sheetOf(st.type[ii]!);
          const allow = sh === 3 || sh === 73 || sh === 113 || sh === 110
            || (sh === 185 && (st.frameY[ii] ?? 0) === 0);
          if (!allow) return;
        }
        if (this.liquidAt(x + dx, superY + dy) > 0) return;
      }
      if (!this.solidTile(x + dx, superY + 1)) return;
      const bs = sheetOf(this.typeAt(x + dx, superY + 1));
      if (bs !== 2 && bs !== 109) return;
    }
    st.setTileSilent(x - 1, superY - 1, t, 0, num);
    st.setTileSilent(x, superY - 1, t, 18, num);
    st.setTileSilent(x - 1, superY, t, 0, num + 18);
    st.setTileSilent(x, superY, t, 18, num + 18);
    this.host.afterSilentTileWrite?.(x - 1, superY - 1, x, superY);
  }

  // ================= 杂项助手 =================

  /** GrowMoreVines（cs:45592-45620）：9×17 窗藤密度门（LOS 加权近似为纯计数） */
  private growMoreVines(x: number, y: number): boolean {
    const st = this.host.store;
    let cap = 60;
    if (sheetOf(this.typeAt(x, y)) === 528) cap = 12;
    let cnt = 0;
    for (let i = x - 4; i <= x + 4; i++) {
      for (let j = y - 6; j <= y + 10; j++) {
        if (st.inBounds(i, j) && this.active(i, j) && IS_VINE.has(sheetOf(this.typeAt(i, j)))) {
          cnt++;
          if (cnt > cap) return false;
        }
      }
    }
    return true;
  }

  private tooManyJunglePlants(i: number, j: number): boolean {
    let cnt = 0;
    for (let x = Math.max(10, i - 9); x <= Math.min(this.host.store.w - 10, i + 9); x++) {
      for (let y = Math.max(10, j - 5); y <= Math.min(this.host.store.h - 10, j + 5); y++) {
        const s = this.active(x, y) ? sheetOf(this.typeAt(x, y)) : -1;
        if (s === 61 || s === 74) { cnt++; if (cnt > 2) return true; }
      }
    }
    return false;
  }

  private tooManyJungleVines(i: number, j: number): boolean {
    let cnt = 0;
    for (let x = Math.max(10, i - 9); x <= Math.min(this.host.store.w - 10, i + 9); x++) {
      for (let y = Math.max(10, j - 5); y <= Math.min(this.host.store.h - 10, j + 5); y++) {
        if (this.active(x, y) && sheetOf(this.typeAt(x, y)) === 62) { cnt++; if (cnt > 6) return true; }
      }
    }
    return false;
  }

  /** GrowSpike（cs:45877-45975）：荆棘在草上蔓延（|dx|*2+|dy|<9 菱形域内有同类锚）。
   *  ★④（cs:45898-45914）方向骰前的 4 邻过密计数：num4>=3 且源格非 land/pair 草
   *  → 早退（计数不掷骰,早退在 genRand.Next(4) 之前——掷位严格对齐）。
   *  ★同函数第二道门（cs:45930-45950）移动后 4 邻计数 num4>=2 → return（同批补齐,
   *  无掷骰,位于方向骰之后/菱形域锚扫之前）。 */
  private growSpike(i: number, j: number, spikeSheet: number, landSheet: number): void {
    let pair = -1;
    if (landSheet === 23) pair = 661;
    else if (landSheet === 199) pair = 662;
    let tx = i, ty = j;
    // 首段过密早退（cs:45898-45914）：4 邻同类 spike 计数;源格 type 裸读（幽灵残型同判）
    let near = 0;
    if (this.active(i + 1, j) && sheetOf(this.typeAt(i + 1, j)) === spikeSheet) near++;
    if (this.active(i - 1, j) && sheetOf(this.typeAt(i - 1, j)) === spikeSheet) near++;
    if (this.active(i, j + 1) && sheetOf(this.typeAt(i, j + 1)) === spikeSheet) near++;
    if (this.active(i, j - 1) && sheetOf(this.typeAt(i, j - 1)) === spikeSheet) near++;
    if (near >= 3 && sheetOf(this.typeAt(i, j)) !== landSheet && sheetOf(this.typeAt(i, j)) !== pair) return;
    const dir = Math.floor(this.rng() * 4);
    if (dir === 0) ty--; else if (dir === 1) ty++; else if (dir === 2) tx--; else tx++;
    if (this.active(tx, ty)) return;
    // 第二道门（cs:45930-45950）：目标位 4 邻同类 spike >=2 → 不长
    near = 0;
    if (this.active(tx + 1, ty) && sheetOf(this.typeAt(tx + 1, ty)) === spikeSheet) near++;
    if (this.active(tx - 1, ty) && sheetOf(this.typeAt(tx - 1, ty)) === spikeSheet) near++;
    if (this.active(tx, ty + 1) && sheetOf(this.typeAt(tx, ty + 1)) === spikeSheet) near++;
    if (this.active(tx, ty - 1) && sheetOf(this.typeAt(tx, ty - 1)) === spikeSheet) near++;
    if (near >= 2) return;
    // 菱形域锚检查（cs:45563-45579）：有 land/pair 草且其上挂着同类 spike
    let found = false;
    for (let k = tx - 7; k < tx + 7 && !found; k++) {
      for (let l = ty - 7; l < ty + 7; l++) {
        if (Math.abs(k - tx) * 2 + Math.abs(l - ty) >= 9) continue;
        const s = this.active(k, l) ? sheetOf(this.typeAt(k, l)) : -1;
        const above = this.active(k, l - 1) ? sheetOf(this.typeAt(k, l - 1)) : -1;
        if ((s === landSheet || s === pair) && above === spikeSheet && this.liquidAt(k, l - 1) === 0) {
          found = true; break;
        }
      }
    }
    if (found) {
      this.setType(tx, ty, S(spikeSheet));
      this.copyPaintAndCoating(i, j, tx, ty);                   // ★⑥ GrowSpike cs:45973-45975（源=采样格）
    }
  }

  /** PlaceTight（cs:38696-38708）→ PlaceUncheckedStalactite（cs:38710-38730）。
   *  ★RD-F8（2026-09-04）：门=原版字面 `!anyShimmer() && (!active || type != 231)`
   *  或语义——幽灵残型格（!active,含幽灵 231 大瓶残型）照样落钟乳石,仅微光池格与
   *  活性 231 拒（曾写成 type==231 裸判=幽灵 231 被吞）。anyShimmer()=liquid>0 且
   *  微光型（Tile.cs:430-435;本仓 liquidType 4=LIQUID_TYPE.SHIMMER）。
   *  preferSmall=Next(2)/variation=Next(3) 在门内即掷、先于 SolidTile/空位校验
   *  （cs:38710 流位,失败也 consumption）;preferSmall → frameY=72 单格小体
   *  （cs:38716-38722）,否则 frameY=0/18 双格（cs:38724-38730）。 */
  private placeTight(x: number, y: number): void {
    const st = this.host.store;
    if (!st.inBounds(x, y)) return;
    const i0 = st.idx(x, y);
    if (st.liquid[i0] > 0 && st.liquidType[i0] === 4) return;    // anyShimmer()
    if (this.active(x, y) && this.typeAt(x, y) === S(231)) return;
    const preferSmall = this.rng() < 0.5;                        // genRand.Next(2) == 0
    const variation = Math.floor(this.rng() * 3);                // genRand.Next(3)
    // SolidTile(x, y-1) + 自身上下空（cs:38712）
    if (!this.solidTile(x, y - 1) || this.active(x, y) || this.active(x, y + 1)) return;
    const t = S(165);
    if (!t) return;
    // 冰族专属列（GetDesiredStalagtiteStyle :39113 区,TileFrame 再锚折算）：147/161→0、
    // 163→594、164→540、200→648（锚=调用方 SNOW_FAMILY 格的上方实心，sheet 直查）
    const anchor = this.solidTile(x, y - 1) ? sheetOf(this.typeAt(x, y - 1)) : 0;
    const base = anchor === 147 || anchor === 161 ? 0
      : anchor === 163 ? 594 : anchor === 164 ? 540 : 648;
    if (preferSmall) {
      st.setTile(x, y, t, base + variation * 18, 72);
      this.copyPaintAndCoating(x, y - 1, x, y);                 // ★⑥ PlaceUncheckedStalactite（other=顶锚）
      return;
    }
    st.setTile(x, y, t, base + variation * 18, 0);
    st.setTile(x, y + 1, t, base + variation * 18, 18);
    this.copyPaintAndCoating(x, y - 1, x, y);                   // ★⑥（cs:38735 区 other=x,y-1）
    this.copyPaintAndCoating(x, y - 1, x, y + 1);
  }

  /** GrowWeb（cs:74141-74175）：1/10 + ±2-3 内有实心 → 放蛛网 51 */
  private growWeb(i: number, j: number): void {
    if (this.rng() >= 1 / 10) return;
    const r = 2 + Math.floor(this.rng() * 2);
    let solid = false;
    for (let k = i - r; k <= i + r && !solid; k++) for (let l = j - r; l <= j + r; l++) {
      if (this.solidTile(k, l)) { solid = true; break; }
    }
    if (solid && !this.active(i, j)) this.place1(i, j, 51, 0, 3);
  }

  /** plantDye（cs:71298-71390）：染料植物自生（普通 90 / 奇异 240 密度门） */
  private plantDye(i: number, j: number, exotic: boolean): void {
    const st = this.host.store;
    if (!this.active(i, j) || i < 95 || i > st.w - 95 || j < 95 || j > st.h - 95) return;
    const rad = exotic ? 240 : 90;
    if (j < this.host.worldSurface) {
      const above = this.active(i, j - 1) ? sheetOf(this.typeAt(i, j - 1)) : -1;
      if (above !== -1 && ![3, 51, 61, 73, 74, 184].includes(above)) return;
    }
    // 密度门：窗口内同档染料植物存在即放弃（cs:71322-71335）
    for (let k = Math.max(1, i - rad); k < Math.min(st.w - 1, i + rad); k++) {
      for (let l = Math.max(1, j - rad); l < Math.min(st.h - 1, j + rad); l++) {
        if (!this.active(k, l) || sheetOf(this.typeAt(k, l)) !== 227) continue;
        const fx = st.frameX[this.at(k, l)];
        if (exotic ? fx >= 272 : fx < 272) return;
      }
    }
    const ground = sheetOf(this.typeAt(i, j));
    if (exotic) {
      if (CONV_GRASS.has(ground) || TILE_MOSS.has(ground) || ground === 0) {
        const aboveLiq = this.liquidAt(i, j - 1);
        const liqType = st.liquidType[this.at(i, j - 1)];
        if (aboveLiq > 0 && (liqType === 2 || liqType === 3)) return;
        this.place1(i, j - 1, 227, 8 + Math.floor(this.rng() * 4));
      }
      return;
    }
    if (ground === 2 || ground === 109) {
      this.place1(i, j - 1, 227, this.rng() < 1 / 4 ? 4 : 3);
    } else if (ground === 60) {
      this.place1(i, j - 1, 227, this.rng() < 1 / 2 ? 2 : 4);
    } else if (ground === 53 && this.liquidAt(i, j - 1) === 255 && this.liquidAt(i, j - 2) === 255) {
      this.place1(i, j - 1, 227, 2);
    }
  }
}
