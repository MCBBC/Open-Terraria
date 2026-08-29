// 原版环境判定（SceneMetrics.cs 1:1 精简核）：
// 玩家中心 169×124 tile 采样计数（ZoneScanSize = 1920/16+49 × 120/16+49, SceneMetrics.cs:12-16）
// → 阈值聚合（L24-64/L603-670）→ Zone 标志（CalculateZones L673-708）。
// BGM 选择链(Music.ts)与群系背景(BiomeBackground)共用本份结果。
import { TILE_DEFS } from '../data/tiles';
import type { World } from './World';
import { WALL_HOUSE } from './Housing';
import { sceneMetricDualOverride } from './DungeonDualZones';
import { musicBoxStyleOf, fountainColorOf, monolithTypeOf, bloodMoonMonolithOf } from './wiring/devices';

/** vanilla tile sheet id → 本仓库内部 tile id（TILE_DEFS 下标即内部 id；未注册的 sheet 缺席=计数 0） */
const SHEET_MAP = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  if (d?.vanilla && !SHEET_MAP.has(d.vanilla.sheet)) SHEET_MAP.set(d.vanilla.sheet, i);
}
const ids = (arr: number[]) => new Set(arr.map((n) => SHEET_MAP.get(n)).filter((v): v is number => v != null));

/** 群系计数 tile 集合（SceneMetrics.cs:603-625 AggregateTileCounts 原表） */
const HOLY_TILES = ids([109, 492, 110, 113, 117, 116, 164, 403, 402]);
const SNOW_TILES = ids([147, 148, 161, 162, 164, 163, 200]);
const JUNGLE_TILES = ids([60, 61, 62, 74, 226, 225]);               // 非 remixWorld 分支 L607
const EVIL_TILES = ids([23, 661, 24, 25, 32, 112, 163, 400, 398]);  // + 向日葵×(-10) 另计
const BLOOD_TILES = ids([199, 662, 201, 203, 200, 401, 399, 234, 352]);
const MUSHROOM_TILES = ids([70, 71, 72, 528]);
const METEOR_TILES = ids([37]);
const DUNGEON_TILES = ids([41, 43, 44, 481, 482, 483]);
const SAND_TILES = ids([53, 112, 116, 234, 397, 398, 402, 399, 396, 400, 403, 401]);
/** 沙尘暴四色权重（Sandstorm.EmitDust :171-178 GetTileCount 逐格计数）：
 *  普通沙 (200,160,20)=[53,396,397] / 黑檀沙 (103,98,122)=[112,400,398] /
 *  猩红沙 (135,43,34)=[234,401,399] / 珍珠沙 (213,196,197)=[116,403,402] */
const SAND_COLORS: Array<[string, number[]]> = [
  ['#C8A014', [53, 396, 397]],
  ['#67627A', [112, 400, 398]],
  ['#872B22', [234, 401, 399]],
  ['#D5C4C5', [116, 403, 402]],
];
/** TileID.Sets.isDesertBiomeSand（TileID.cs:189）——只有普通沙三色变体计入海洋沙。
 *  此前误用整张 SAND_TILES（含珍珠沙 112/116/234 与沙岩砖族）→ 海岸沙漠沙多扣、
 *  desertSandTileCount 系统性偏低 */
const DESERT_BIOME_SAND = ids([53, 397, 396, 400, 403, 401]);
const SUNFLOWER = SHEET_MAP.get(27) ?? -1;
const GRAVEYARD_TILES = ids([85]);
/** HoneyBlockCount / PartyMonolithCount 计数源 tile（AggregateTileCounts cs:601/621） */
const HONEY_BLOCK = SHEET_MAP.get(229) ?? -1;
const PARTY_MONOLITH = SHEET_MAP.get(455) ?? -1;

/** 器件帧态 tile（内部 id → sheet）：139 八音盒 / 207 喷泉 / 410·509 天塔柱 / 480 血月柱
 *  / 657 回声腔（EchoMonolith，SceneMetrics.cs:545-549；涂层隐形位显示门） */
const FX_SHEET_IDS = new Map<number, number>();
for (const sh of [139, 207, 410, 480, 509, 657]) {
  const id = SHEET_MAP.get(sh);
  if (id !== undefined) FX_SHEET_IDS.set(id, sh);
}

// 阈值（SceneMetrics.cs:24-64）
const CORRUPTION_THRESHOLD = 300;
const CRIMSON_THRESHOLD = 300;
const HALLOW_THRESHOLD = 125;
const JUNGLE_THRESHOLD = 140;
const SNOW_THRESHOLD = 1500;
const DESERT_THRESHOLD = 1500;
const MUSHROOM_THRESHOLD = 100;
const METEOR_THRESHOLD = 75;
const DUNGEON_THRESHOLD = 250;
const GRAVEYARD_THRESHOLD = 28;
/** ShimmerTileThreshold（SceneMetrics.cs:21 =300）：EnoughTilesForShimmer（:252）=
 *  窗口内非实心格微光液计数 ≥300 → ZoneShimmer 三条件之一（:707）。
 *  注意传送塔微光门读的是 EnoughTilesForShimmer 本身（TeleportPylonsSystem.cs:308），
 *  与 ZoneShimmer（另需深度带+非地牢）不同——TeleportPylons.ts 现读 shimmerTileCount
 *  即此语义，勿改成 zoneShimmer */
const SHIMMER_TILE_THRESHOLD = 300;
/** GraveyardTileMin（SceneMetrics.cs:62 =16）：不做 Zone 判定（阈值是 28）——只驱动
 *  HasSunflower 压制门（:628-631）与视觉强度分级下界（SceneState.UpdateGraveyard :415-418
 *  GetLerpValue(16,36,count)，消费端 Game.updateWeather 已按 16/36 字面实现） */
const GRAVEYARD_TILE_MIN = 16;

/** 地牢墙集合（Main.cs:10507-10514 wallDungeon 全表：主题墙 7/8/9 + 1.4 变体墙 94-99；
 *  41/43/44 是地牢"砖 tile"的 id,不是墙——此前误混入导致变体墙区域 zoneDungeon 永假） */
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** ★IIIII61：SkyblockRuntime 复用（WorldGen.Skyblock.Calculate 的 wallDungeon 面） */
export const DUNGEON_WALL_IDS: number[] = [7, 8, 9, 94, 95, 96, 97, 98, 99];
/** 地下沙漠墙（SceneMetrics.cs:694 CalculateZones：WallID.Sets.Conversion.Sandstone
 *  {187,220,222,221,275,308,310,309} ∪ HardenedSand {216,217,219,218,304,305,307,306}
 *  ∪ DesertFossil 223，再排除 Main.wallHouse 玩家可放置墙——WallID.cs:21/23/509。
 *  旧表 {216,217,187,188,189} 漏三分之二变体墙（188/189 是 CorruptionUnsafe 不在内） */
const UNDERGROUND_DESERT_WALLS = (() => {
  const s = new Set<number>([187, 216, 217, 218, 219, 220, 221, 222, 223, 275, 304, 305, 306, 307, 308, 309, 310]);
  for (const w of WALL_HOUSE) s.delete(w);
  return s;
})();
/** WorldGen.beachDistance（WorldGen.cs:4102）：常量 380，不随世界尺寸缩放。
 *  oceanDepths（WorldGen.cs:10978-10988）专用 */
const BEACH_DISTANCE = 380;

export interface SceneFlags {
  tileX: number; tileY: number;
  belowSurface: boolean;
  zoneSkyHeight: boolean;
  zoneOverworldHeight: boolean;
  zoneDirtLayerHeight: boolean;
  zoneRockLayerHeight: boolean;
  zoneUnderworldHeight: boolean;
  zoneCorrupt: boolean;
  zoneCrimson: boolean;
  zoneHallow: boolean;
  zoneJungle: boolean;
  zoneSnow: boolean;
  zoneDesert: boolean;
  /** 精确计数（SceneMetrics L604-665：视区扫描聚合计数，天气渲染/沙尘门用） */
  snowTileCount: number;
  /** JungleTileCount（:613 同源 zone 扫描；地下背景雪/丛林让位判定 :53476 用） */
  jungleTileCount: number;
  desertSandTileCount: number;
  /** 沙尘暴四色权重（EmitDust :171-178）：[普通沙,黑檀沙,猩红沙,珍珠沙] 扫描窗格数 */
  sandColorWeights: [number, number, number, number];
  graveyardTileCount: number;
  zoneGlowshroom: boolean;
  zoneMeteor: boolean;
  zoneGraveyard: boolean;
  zoneShadowCandle: boolean;   // tile 646 暗影蜡烛（NPC.cs:328-333）
  /** HasClock（SceneMetrics.cs:465-467）：扫描窗内有落地座钟 104 → 玩家 accWatch
   *  提到 3（金表精度时间行,Player.cs:12593-12596）。窗=ZoneScanSize 169×124,
   *  与原版 VisualScanArea(1920/16+49 × 1200/16+49) 同尺寸 */
  hasClock: boolean;
  /** 群系光照影响(0-1,Game 每 tick 写入:SetBackColor 群系变色的输入;
   *  蘑菇/墓园为帧平滑值 Main.cs:61380-61404/SceneState.cs:412-418) */
  biomeLightInfluence?: {
    corrupt: number; crimson: number; jungle: number; mushroom: number; graveyard: number;
  };
  zoneDungeon: boolean;
  zoneTemple: boolean;
  zoneBeach: boolean;
  zoneUndergroundDesert: boolean;
  townNPCCount: number;
  /** ---- 器件态（SceneMetrics.cs:471-585 ScanEnums 精简核；开关由电路/右键翻帧）----
   *  八音盒：-1 关；否则曲目 style（frameY/36），100 = 静音。BGM 覆盖（Main.cs:11002） */
  musicBoxStyle: number;
  /** 喷泉水色 id（SceneMetrics.ActiveFountainColor）：-1 关；水色短路（Main.cs:56766） */
  fountainColor: number;
  /** 天塔柱：-1 关；0 星璇/1 星云/2 星尘/3 耀斑/4 月总（SceneState.cs:111-115） */
  monolithType: number;
  /** 血月柱激活（SceneMetrics.cs:542-546 → Main.cs:61417 并入 BloodMoonActive） */
  bloodMoonMonolith: boolean;
  /** 回声腔激活（SceneMetrics.cs:545-549 case 657：frameY>=54 开帧 → EchoMonolith）。
   *  消费 = Main.ShouldShowInvisibleBlocksAndWalls（Main.cs:57403-57408）——涂层
   *  隐形位（TileStore.coat）的显示门，Game 每 tick 装配进 store.showInvisibleBlocks */
  echoMonolith: boolean;
  /** 派对进行中（BirthdayParty.PartyIsUp：ManualParty/GenuineParty；入夜 CheckNight 结束） */
  partyUp: boolean;
  /** 生日自然派对（BirthdayParty.GenuineParty——NPC.cs:61055 史莱姆内部物品等判据
   *  用 GenuineParty 本体而非 PartyIsUp 并集；Game 侧从 partyState 传入） */
  partyGenuine: boolean;
  /** HasSunflower（SceneMetrics.cs:594/626-630）：窗口内有向日葵 且 墓碑计数 ≤ GraveyardTileMin(16)。
   *  墓地压制向日葵的"快乐！"buff（Player.cs:25262-25265 授予链 → buff 146） */
  hasSunflower: boolean;
  /** ---- CalculateZones cs:675-692 补齐（2026-08-13 复审）----
   *  四墙 Zone 全部取中心格 wall（与 ZoneLihzhardTemple 同源）：
   *  花岗岩 184/180、大理石 183/178、蜂巢 108/86、宝石洞 48-53——
   *  原版消费 = Player.ZoneGranite 等（Player.cs:16552-16555，图鉴/出生表上下文），
   *  本仓尚无消费端（登记：bestiary/刷怪上下文未接） */
  zoneGranite: boolean;
  zoneMarble: boolean;
  zoneHive: boolean;
  zoneGemCave: boolean;
  /** BehindBackwall（cs:675）：中心格 wall>0——原版唯一消费 SceneState.cs:175
   *  室外天气效应强度 ±0.005/t 逼近（BehindBackwall → -0.1），本仓天气渲染未接（登记） */
  behindBackwall: boolean;
  /** ShimmerTileCount（cs:601 = _liquidCounts[Shimmer]）：窗口内非实心格的微光
   *  液格数（ScanTiles cs:361-366 只在 !active() 格计液）→ EnoughTilesForShimmer
   *  ≥300 → ZoneShimmer（cs:707，另需 worldSurface+84<Y<maxTilesY-396 且非地牢）。
   *  消费：TeleportPylons 微光传送塔（EnoughTilesForShimmer 直读，勿混用 zoneShimmer）、BGM */
  shimmerTileCount: number;
  /** SurfaceAtmospherics（cs:695 = WorldGen.IsSurfaceForAtmospherics :10991-11001）：
   *  普通世界 = 玩家 tileY ≤ worldSurface（地表及以上）；remix 世界 = rockLayer <
   *  tileY < maxTilesY-350，且 remix+ZoneDungeon 时强制 false（:697-699）。
   *  消费：Main.cs:11508 风声轨门 / :12972 地表雪粒子门（渲染侧，接线清单） */
  surfaceAtmospherics: boolean;
  /** ZoneRain（cs:700 = Main.raining && SurfaceAtmospherics；:703-705 ZoneSandstorm
   *  成立时强制 false）。地下玩家此位恒 false——天气渲染/环境音消费，刷怪侧
   *  ★不读此位（NPC.Spawner.SetSpawnFlags NPC.cs:282 的 raining = Main.raining
   *  全局旗，VanillaSpawner 直读 weather.raining 即 1:1，勿改） */
  zoneRain: boolean;
  /** ZoneSandstorm（cs:701 = ZoneDesert && SurfaceAtmospherics && Sandstorm.Happening）。
   *  消费：SceneState.cs:104 沙漠风声门（接线清单） */
  zoneSandstorm: boolean;
  /** UndergroundForShimmering（cs:706 = worldSurface+84 < tileY < maxTilesY-396）——
   *  ZoneShimmer 的深度带条件，独立位照抄 */
  undergroundForShimmering: boolean;
  /** ZoneShimmer（cs:707 = EnoughTilesForShimmer && UndergroundForShimmering &&
   *  !ZoneDungeon）。消费：Player.cs:16557 → 玩家微光区行为（入水判定 :39584 等）、
   *  BGM/图鉴上下文（接线清单） */
  zoneShimmer: boolean;
  /** HoneyBlockCount（cs:601 = _tileCounts[229]）：消费 SceneState 蜂蜜块环境光效（登记） */
  honeyBlockCount: number;
  /** PartyMonolithCount（cs:621 = _tileCounts[455]）：消费生日派对视觉（登记） */
  partyMonolithCount: number;
  /** ---- 金属探测器（SceneMetrics.cs:22/152 BestOreType/BestOrePosition；
   *      UpdateOreFinder cs:883-918,优先级表 Main.cs:6355-6391）----
   *  bestOreSheet=-1 = 附近无珍宝;消费 DrawInfoAccs Treasure 行 */
  bestOreSheet: number;
  bestOreX: number;
  bestOreY: number;
}

export const EMPTY_SCENE: SceneFlags = {
  tileX: 0, tileY: 0, belowSurface: false,
  zoneSkyHeight: false, zoneOverworldHeight: false, zoneDirtLayerHeight: false,
  zoneRockLayerHeight: false, zoneUnderworldHeight: false,
  zoneCorrupt: false, zoneCrimson: false, zoneHallow: false, zoneJungle: false,
  zoneSnow: false, zoneDesert: false, snowTileCount: 0, jungleTileCount: 0, desertSandTileCount: 0, graveyardTileCount: 0,
  sandColorWeights: [0, 0, 0, 0],
  zoneGlowshroom: false, zoneMeteor: false,
  zoneGraveyard: false, zoneShadowCandle: false, hasClock: false, zoneDungeon: false, zoneTemple: false, zoneBeach: false,
  zoneUndergroundDesert: false, townNPCCount: 0,
  musicBoxStyle: -1, fountainColor: -1, monolithType: -1, bloodMoonMonolith: false, echoMonolith: false, partyUp: false,
  partyGenuine: false,
  hasSunflower: false,
  zoneGranite: false, zoneMarble: false, zoneHive: false, zoneGemCave: false,
  behindBackwall: false, shimmerTileCount: 0, honeyBlockCount: 0, partyMonolithCount: 0,
  surfaceAtmospherics: false, zoneRain: false, zoneSandstorm: false,
  undergroundForShimmering: false, zoneShimmer: false,
  bestOreSheet: -1, bestOreX: 0, bestOreY: 0,
};

/** tileOreFinderPriority(Main.cs:6355-6391 全 34 条字面量) */
const ORE_FINDER_PRIORITY: Record<number, number> = {
  28: 100, 407: 150, 404: 150, 7: 200, 166: 210, 6: 220, 167: 230, 9: 240,
  168: 250, 8: 260, 169: 270, 22: 300, 204: 310, 37: 400, 21: 500, 467: 500,
  441: 500, 468: 500, 12: 550, 665: 550, 639: 550, 107: 600, 221: 610, 108: 620,
  222: 630, 111: 640, 223: 650, 129: 675, 211: 700, 227: 750, 656: 760, 701: 760,
  751: 770, 752: 770, 236: 810, 702: 810,
};

/** isValidForOreFinder(SceneMetrics.cs:904-918):227(宝石)限 272≤fx≤374、
 *  129(宝石钻石族变体)限 fx≥324;其余恒真 */
function isValidForOreFinder(sheet: number, fx: number): boolean {
  if (sheet === 227) return fx >= 272 && fx <= 374;
  if (sheet === 129) return fx >= 324;
  return true;
}

const countSet = (counts: Map<number, number>, set: Set<number>): number => {
  let n = 0;
  for (const t of set) n += counts.get(t) ?? 0;
  return n;
};

/** 以玩家中心扫描并计算全部 Zone 标志（对应 ScanAndApplyToPlayer 主链）。
 *  partyUp：BirthdayParty.PartyIsUp（器件态，非 tile 扫描；Game 侧传入）。
 *  partyGenuine：BirthdayParty.GenuineParty 本体（NPC.cs:61055 史莱姆判据） */
export function scanScene(
  world: World, centerX: number, centerY: number, townNPCCount: number,
  partyUp = false,
  partyGenuine = false,
): SceneFlags {
  const st = world.store;
  const w = st.w, h = st.h;
  // Main.UnderworldLayer = maxTilesY-200(Main.cs:2863,恒 h-200)。曾误用
  // world.lavaLine(GenVars.lavaLine≈(rockLayer+h)/2,非 h-200)——地狱高度带提前
  // ~170 格,污染地狱背景与丛林深度抑制(2026-08-13 全仓审计)
  const underworldLayer = h - 200;
  const worldSurface = world.groundLevel;
  const rockLevel = world.rockLevel;
  const tileX = Math.floor(centerX / 16);
  const tileY = Math.floor(centerY / 16);

  // 169×124 采样窗口（SceneMetrics.ZoneScanSize = (1920/16+49)×(1200/16+49)；
  // CenteredRectangle(Utils.cs:936) Top=Y-124/2=Y-62、Bottom 排他 = Y+62 →
  // Y-62..Y+61 整体向上偏 1 格（偶数尺寸窗口天然不对称，X 侧 169 奇数对称 ±84）
  const sx0 = Math.max(0, tileX - 84), sx1 = Math.min(w - 1, tileX + 84);
  const sy0 = Math.max(0, tileY - 62), sy1 = Math.min(h - 1, tileY + 61);
  const counts = new Map<number, number>();
  let sunflower = 0;
  let oceanSand = 0;
  // 金属探测器累加器(BestOre 三元组 + 优先级/距离;SceneMetrics.cs:152)
  let bestOreP = 0, bestOreD = Infinity, bestOreS = -1, bestOrePx = 0, bestOrePy = 0;
  // 液量计数（ScanTiles cs:361-366）：只计 !active()（无实心 tile）格的液体，
  // 实心格内液体不进 _liquidCounts——shimmerTileCount 的口径来源
  let shimmerLiquid = 0;
  // 器件态累加器（SceneMetrics.cs:471-585 ScanEnums；后扫到者覆盖 = 原版逐格覆写语义）
  let mbStyle = -1, fountain = -1, monolith = -1, bloodMoonMono = false, echoMono = false;
  const oceanTopY = (worldSurface + rockLevel) / 2 + 40; // oceanLevel（WorldGen.cs:4393）
  const beachDist = BEACH_DISTANCE;
  for (let y = sy0; y <= sy1; y++) {
    for (let x = sx0; x <= sx1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) {
        if (st.liquid[i] > 0 && st.liquidType[i] === 4) shimmerLiquid++;
        continue;
      }
      const t = st.type[i];
      counts.set(t, (counts.get(t) ?? 0) + 1);
      // 金属探测器(UpdateOreFinder cs:883-902:优先级 ≥ 当前 且 合法则取距离
      // 平方小者——同优先级取近,高级别直接顶替;isValidForOreFinder cs:904-918)
      {
        const pr = ORE_FINDER_PRIORITY[t] ?? 0;
        if (pr > 0 && isValidForOreFinder(t, st.frameX[i]) && pr >= bestOreP) {
          const d = (x - tileX) ** 2 + (y - tileY) ** 2;
          if (pr > bestOreP || d < bestOreD) {
            bestOreP = pr; bestOreD = d; bestOreS = t; bestOrePx = x; bestOrePy = y;
          }
        }
      }
      if (t === SUNFLOWER) sunflower++;
      // isDesertBiomeSand && oceanDepths（SceneMetrics L376-380）：只有普通沙族在
      // 海洋深度带内才计海洋沙；邪恶/神圣沙与沙岩砖族不是 isDesertBiomeSand
      if (DESERT_BIOME_SAND.has(t) && y <= oceanTopY && (x < beachDist || x > w - beachDist)) oceanSand++;
      // 器件帧态（八音盒/喷泉/天塔柱；读取器与电路开关同源 wiring/devices.ts）。
      // 天塔柱只认激活帧（SceneMetrics.cs:524-536 是"激活才赋值"——关帧不回写 -1）：
      // 同屏多柱时后扫到的激活柱生效；渲染侧权威扫描在 render/MonolithFilters.ts
      const fxSh = FX_SHEET_IDS.get(t);
      if (fxSh !== undefined) {
        // 帧态门（cs:471-525：八音盒/喷泉须激活帧才赋值——关态器件不得清掉先前
        // 扫到的激活态;天塔柱同款门已有 mt>=0）
        if (fxSh === 139) { const s = musicBoxStyleOf(st.frameX[i], st.frameY[i]); if (s >= 0) mbStyle = s; }
        else if (fxSh === 207) { const c = fountainColorOf(st.frameX[i], st.frameY[i]); if (c >= 0) fountain = c; }
        else if (fxSh === 410 || fxSh === 509) {
          const mt = monolithTypeOf(fxSh, st.frameX[i], st.frameY[i]);
          if (mt >= 0) monolith = mt;
        } else if (fxSh === 480) bloodMoonMono = bloodMoonMonolithOf(fxSh, st.frameY[i]) || bloodMoonMono;
        // 回声腔 657（SceneMetrics.cs:545-549 case 657：frameY>=54 激活帧 → EchoMonolith）
        else if (fxSh === 657) echoMono = echoMono || st.frameY[i] >= 54;
      }
    }
  }

  // 聚合（AggregateTileCounts cs:588-664：互减前后各钳位一次——向日葵过剩使
  // evil/blood 为负时,漏前置钳位会把 holy 虚增(2026-08-13 审计修正)）
  // 向日葵压制系数 num（cs:588-592）：-10；Main.infectedSeed（1.4.5 worldIsInfected
  // 秘密种子）时 ×3 = 每株 -30。本仓 SeedFlags 预留位尚无种子映射 → 恒 ×1
  const infectedSeed = !!world.seedFlags?.infectedSeed;
  const sunflowerMul = infectedSeed ? -30 : -10;
  let holy = Math.max(0, countSet(counts, HOLY_TILES));
  let evil = Math.max(0, countSet(counts, EVIL_TILES) + sunflower * sunflowerMul);
  let blood = Math.max(0, countSet(counts, BLOOD_TILES) + sunflower * sunflowerMul);
  const holyRaw = holy;
  holy -= evil; holy -= blood;
  evil -= holyRaw; blood -= holyRaw;
  holy = Math.max(0, holy); evil = Math.max(0, evil); blood = Math.max(0, blood);

  const jungle = countSet(counts, JUNGLE_TILES);
  const snow = countSet(counts, SNOW_TILES);
  const mushroom = countSet(counts, MUSHROOM_TILES);
  const shadowCandleCount = counts.get(646) ?? 0;   // ShadowCandle tile 646
  // HasClock（cs:465-467 `if (tile.type == 104) HasClock = true`——ScanTiles 窗内任一）
  const CLOCK_TILE = SHEET_MAP.get(104) ?? -1;
  const hasClock = CLOCK_TILE >= 0 && (counts.get(CLOCK_TILE) ?? 0) > 0;
  const meteor = countSet(counts, METEOR_TILES);
  const dungeonTiles = countSet(counts, DUNGEON_TILES);
  // ShimmerTileCount/HoneyBlockCount/PartyMonolithCount（cs:601/621）
  const shimmerTileCount = shimmerLiquid;
  const honeyBlockCount = HONEY_BLOCK >= 0 ? (counts.get(HONEY_BLOCK) ?? 0) : 0;
  const partyMonolithCount = PARTY_MONOLITH >= 0 ? (counts.get(PARTY_MONOLITH) ?? 0) : 0;
  // DesertSandTileCount（SceneMetrics L665：sand - oceanSand；oceanSand 在扫描循环内按 oceanDepths 逐格计）
  const desert = Math.max(0, countSet(counts, SAND_TILES) - oceanSand);
  // 墓碑族（L622-623）：GraveyardTileCount = _tileCounts[85] − _tileCounts[27]/2（下取整、负值钳 0）。
  // tile 85 = Tombstones 全部 6 种墓碑变体（同 tile 不同 style），无独立 tile——旧注疑 545 有误
  const graveyard = Math.max(0, countSet(counts, GRAVEYARD_TILES) - (sunflower >> 1));
  // HasSunflower（L626-631）：有向日葵 且 GraveyardTileCount ≤ GraveyardTileMin(16)——
  // 墓碑够多时向日葵的快乐 buff 被压制（比较在 <0 钳位之前，但 >16 必为正，顺序无差）
  const hasSunflower = sunflower > 0 && graveyard <= GRAVEYARD_TILE_MIN;

  // Zone 判定（CalculateZones L673-697）
  const zoneUnderworldHeight = tileY > underworldLayer;
  const belowSurface = tileY > worldSurface;
  const centerWall = st.inBounds(tileX, tileY) ? st.wall[st.idx(tileX, tileY)] : 0;
  const zoneDungeon = dungeonTiles >= DUNGEON_THRESHOLD && belowSurface && DUNGEON_WALLS.has(centerWall);
  const zoneDesert = desert >= DESERT_THRESHOLD;
  // 四墙 Zone + BehindBackwall（cs:675/687-690）：全部取中心格 wall（与神庙 87 同源）
  const zoneGranite = centerWall === 184 || centerWall === 180;
  const zoneMarble = centerWall === 183 || centerWall === 178;
  const zoneHive = centerWall === 108 || centerWall === 86;
  const zoneGemCave = centerWall >= 48 && centerWall <= 53;
  const behindBackwall = centerWall > 0;

  // oceanDepths（WorldGen.cs:10978-10988：y > oceanLevel 恒假；否则 x 距边 < beachDistance(380)）
  const oceanTop = (worldSurface + rockLevel) / 2 + 40;
  const zoneBeach = tileY <= oceanTop && (tileX < BEACH_DISTANCE || tileX > w - BEACH_DISTANCE);

  // ---- 天气/微光三件套（CalculateZones cs:695-708 1:1，2026-08-13 派生）----
  // SurfaceAtmospherics（cs:695 = WorldGen.IsSurfaceForAtmospherics WorldGen.cs:10991-11001）：
  // remix 世界 rockLayer < y < maxTilesY-350；普通世界 y ≤ worldSurface（地表及以上）。
  // cs:697-699：remix && ZoneDungeon → 强制 false
  const remixWorld = !!world.seedFlags?.remix;
  const surfaceAtmospherics = (remixWorld && zoneDungeon)
    ? false
    : (remixWorld ? (tileY > rockLevel && tileY < h - 350) : tileY <= worldSurface);
  // cs:700-705：ZoneRain = Main.raining && SurfaceAtmospherics；ZoneSandstorm =
  // ZoneDesert && SurfaceAtmospherics && Sandstorm.Happening，成立时 ZoneRain 置 false
  const zoneSandstorm = zoneDesert && surfaceAtmospherics && !!world.weather.sandstorm.happening;
  const zoneRain = world.weather.raining && surfaceAtmospherics && !zoneSandstorm;
  // cs:706-707：深度带 worldSurface+84 < y < maxTilesY-396（严格不等，无取整）；
  // ZoneShimmer = EnoughTilesForShimmer && UndergroundForShimmering && !ZoneDungeon
  const undergroundForShimmering = tileY > worldSurface + 84 && tileY < h - 396;
  const zoneShimmer = shimmerTileCount >= SHIMMER_TILE_THRESHOLD && undergroundForShimmering && !zoneDungeon;

  // ---- ★IIIII22b：双地牢玩家 Zone 重扫（SceneMetrics.cs:714-738 CalculateZones 尾部支，
  //      本批接面②）。vanilla 序：此段位于 ZoneShimmer/水蜡烛系之后、CalculateZones 返回前——
  //      故 shimmer/atmospherics 等先算位不吃覆盖值。dual 世界 BelowSurface 时自玩家行向下
  //      ≤300 格找首个可判格重写九位；非双地牢世界恒 null 零改动。
  const ddScan = world.seedFlags?.dualDungeons
    ? sceneMetricDualOverride(
        st, tileX, tileY, worldSurface, underworldLayer, rockLevel, centerWall,
        (sheet) => WALL_HOUSE.has(sheet))
    : null;

  return {
    tileX, tileY,
    belowSurface,
    // 0.3499999940395355 = C# 0.35f 的 float32 表示(:672-673 原文)——JS 双精度
    // 0.35 会在 worldSurface*0.35 恰为整数时把该行判错档(Math.fround 复原)
    zoneSkyHeight: tileY <= worldSurface * Math.fround(0.35),
    zoneOverworldHeight: tileY <= worldSurface && tileY > worldSurface * Math.fround(0.35),
    zoneDirtLayerHeight: tileY <= rockLevel && tileY > worldSurface,
    zoneRockLayerHeight: tileY <= underworldLayer && tileY > rockLevel,
    zoneUnderworldHeight,
    zoneCorrupt: ddScan ? ddScan.ZoneCorrupt : evil >= CORRUPTION_THRESHOLD,
    zoneCrimson: ddScan ? ddScan.ZoneCrimson : blood >= CRIMSON_THRESHOLD,
    zoneHallow: ddScan ? ddScan.ZoneHallow : holy >= HALLOW_THRESHOLD,
    zoneJungle: ddScan ? ddScan.ZoneJungle : jungle >= JUNGLE_THRESHOLD && !zoneUnderworldHeight,
    zoneSnow: ddScan ? ddScan.ZoneSnow : snow >= SNOW_THRESHOLD,
    zoneDesert,
    snowTileCount: snow,
    jungleTileCount: jungle,
    desertSandTileCount: desert, // DesertSandTileCount = max(0, SandTileCount - OceanSandTileCount)（L665，
    // EmitDust 四色权重（:171-178 按【格数】非区旗——曾用 zone 旗近似）
    sandColorWeights: SAND_COLORS.map(([ , sheets]) => countSet(counts, ids(sheets))) as [number, number, number, number],
    // 海洋沙 = isDesertBiomeSand ∩ oceanDepths 逐格计，扫描窗内与原版一致）
    graveyardTileCount: graveyard,
    hasSunflower,
    zoneGlowshroom: ddScan ? ddScan.ZoneGlowshroom : mushroom >= MUSHROOM_THRESHOLD,
    zoneMeteor: meteor >= METEOR_THRESHOLD,
    zoneGraveyard: graveyard >= GRAVEYARD_THRESHOLD,
    zoneShadowCandle: shadowCandleCount > 0,   // tile 646
    hasClock,
    zoneDungeon: ddScan ? ddScan.ZoneDungeon : zoneDungeon,
    zoneTemple: ddScan ? ddScan.ZoneLihzhardTemple : centerWall === 87,
    zoneBeach,
    zoneUndergroundDesert: ddScan
      ? ddScan.ZoneUndergroundDesert
      : zoneDesert && belowSurface && UNDERGROUND_DESERT_WALLS.has(centerWall),
    townNPCCount,
    musicBoxStyle: mbStyle,
    fountainColor: fountain,
    monolithType: monolith,
    bloodMoonMonolith: bloodMoonMono,
    echoMonolith: echoMono,
    partyUp,
    partyGenuine,
    zoneGranite,
    zoneMarble,
    zoneHive,
    zoneGemCave,
    behindBackwall,
    shimmerTileCount,
    surfaceAtmospherics,
    zoneRain,
    zoneSandstorm,
    undergroundForShimmering,
    zoneShimmer,
    honeyBlockCount,
    partyMonolithCount,
    bestOreSheet: bestOreS, bestOreX: bestOrePx, bestOreY: bestOrePy,
  };
}

// ============================================================================
// 群系光照影响计数(2026-08-20 原版化:SetBackColor 群系变色 1:1 的数据源)
// ============================================================================

/** 群系影响扫描结果(原始计数;除以 Max/平滑在消费侧——见 Game.update)。
 *  上限常量(SceneMetrics.cs:28-62):CorruptionTileMax=1000/CrimsonTileMax=1000/
 *  JungleTileMax=700/MushroomTileMax=160/GraveyardTileMin=16/GraveyardTileMax=36 */
export interface BiomeLightCounts {
  evil: number;      // EvilTileCount(AggregateTileCounts :614)
  blood: number;     // BloodTileCount(:615)
  jungle: number;    // JungleTileCount(:613)
  mushroom: number;  // MushroomTileCount(:620)
  graveyard: number; // GraveyardTileCount(:622-623:墓碑 − 向日葵/2 钳 0)
}

/** 可视域群系计数(Main.UpdateSceneMetrics → SceneMetrics.Scan VisualScanArea):
 *  窗口 = GetAreaToLight(Main.cs:63363-63380:floor(左)−1 .. floor(右)+2 的
 *  可视 tile 矩形)再 Inflate(28,28)(:61979)——与 Zone 窗(169×124)不同源。
 *  每 15tick 随场景扫描刷新(原版每帧,计数随相机缓变,250ms 采样无感)。 */
export function scanBiomeLightCounts(
  world: World, camX: number, camY: number, viewWpx: number, viewHpx: number,
): BiomeLightCounts {
  const st = world.store;
  const hw = viewWpx / 2, hh = viewHpx / 2;   // 调用方传世界像素(camX 同系)
  const x0 = Math.max(0, Math.floor((camX - hw) / 16) - 1 - 28);
  const x1 = Math.min(st.w - 1, Math.floor((camX + hw) / 16) + 2 + 28);
  const y0 = Math.max(0, Math.floor((camY - hh) / 16) - 1 - 28);
  const y1 = Math.min(st.h - 1, Math.floor((camY + hh) / 16) + 2 + 28);
  const counts = new Map<number, number>();
  let sunflower = 0, tomb = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      counts.set(t, (counts.get(t) ?? 0) + 1);
      if (t === SUNFLOWER) sunflower++;
      else if (GRAVEYARD_TILES.has(t)) tomb++;
    }
  }
  // 向日葵压制 ×(−10)(AggregateTileCounts :588-592;infectedSeed ×3 无种子映射恒 ×1)
  const sunflowerMul = -10;
  return {
    evil: Math.max(0, countSet(counts, EVIL_TILES) + sunflower * sunflowerMul),
    blood: Math.max(0, countSet(counts, BLOOD_TILES) + sunflower * sunflowerMul),
    jungle: countSet(counts, JUNGLE_TILES),
    mushroom: countSet(counts, MUSHROOM_TILES),
    graveyard: Math.max(0, tomb - (sunflower >> 1)),
  };
}
