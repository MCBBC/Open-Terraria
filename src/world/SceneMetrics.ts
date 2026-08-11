// 原版环境判定（SceneMetrics.cs 1:1 精简核）：
// 玩家中心 169×124 tile 采样计数（ZoneScanSize = 1920/16+49 × 120/16+49, SceneMetrics.cs:12-16）
// → 阈值聚合（L24-64/L603-670）→ Zone 标志（CalculateZones L673-697）。
// BGM 选择链(Music.ts)与群系背景(BiomeBackground)共用本份结果。
import { TILE_DEFS } from '../data/tiles';
import type { World } from './World';
import { WALL_HOUSE } from './Housing';
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
/** TileID.Sets.isDesertBiomeSand（TileID.cs:189）——只有普通沙三色变体计入海洋沙。
 *  此前误用整张 SAND_TILES（含珍珠沙 112/116/234 与沙岩砖族）→ 海岸沙漠沙多扣、
 *  desertSandTileCount 系统性偏低 */
const DESERT_BIOME_SAND = ids([53, 397, 396, 400, 403, 401]);
const SUNFLOWER = SHEET_MAP.get(27) ?? -1;
const GRAVEYARD_TILES = ids([85]);

/** 器件帧态 tile（内部 id → sheet）：139 八音盒 / 207 喷泉 / 410·509 天塔柱 / 480 血月柱 */
const FX_SHEET_IDS = new Map<number, number>();
for (const sh of [139, 207, 410, 480, 509]) {
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

/** 地牢墙集合（Main.cs:10507-10514 wallDungeon 全表：主题墙 7/8/9 + 1.4 变体墙 94-99；
 *  41/43/44 是地牢"砖 tile"的 id,不是墙——此前误混入导致变体墙区域 zoneDungeon 永假） */
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
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
  desertSandTileCount: number;
  graveyardTileCount: number;
  zoneGlowshroom: boolean;
  zoneMeteor: boolean;
  zoneGraveyard: boolean;
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
  /** 派对进行中（BirthdayParty.PartyIsUp：ManualParty/GenuineParty；入夜 CheckNight 结束） */
  partyUp: boolean;
}

export const EMPTY_SCENE: SceneFlags = {
  tileX: 0, tileY: 0, belowSurface: false,
  zoneSkyHeight: false, zoneOverworldHeight: false, zoneDirtLayerHeight: false,
  zoneRockLayerHeight: false, zoneUnderworldHeight: false,
  zoneCorrupt: false, zoneCrimson: false, zoneHallow: false, zoneJungle: false,
  zoneSnow: false, zoneDesert: false, snowTileCount: 0, desertSandTileCount: 0, graveyardTileCount: 0,
  zoneGlowshroom: false, zoneMeteor: false,
  zoneGraveyard: false, zoneDungeon: false, zoneTemple: false, zoneBeach: false,
  zoneUndergroundDesert: false, townNPCCount: 0,
  musicBoxStyle: -1, fountainColor: -1, monolithType: -1, bloodMoonMonolith: false, partyUp: false,
};

const countSet = (counts: Map<number, number>, set: Set<number>): number => {
  let n = 0;
  for (const t of set) n += counts.get(t) ?? 0;
  return n;
};

/** 以玩家中心扫描并计算全部 Zone 标志（对应 ScanAndApplyToPlayer 主链）。
 *  partyUp：BirthdayParty.PartyIsUp（器件态，非 tile 扫描；Game 侧传入） */
export function scanScene(
  world: World, centerX: number, centerY: number, townNPCCount: number,
  partyUp = false,
): SceneFlags {
  const st = world.store;
  const w = st.w, h = st.h;
  const underworldLayer = world.lavaLine || (h - 200); // Main.UnderworldLayer = maxTilesY-200
  const worldSurface = world.groundLevel;
  const rockLevel = world.rockLevel;
  const tileX = Math.floor(centerX / 16);
  const tileY = Math.floor(centerY / 16);

  // 169×124 采样窗口（SceneMetrics.ZoneScanSize）
  const sx0 = Math.max(0, tileX - 84), sx1 = Math.min(w - 1, tileX + 84);
  const sy0 = Math.max(0, tileY - 61), sy1 = Math.min(h - 1, tileY + 62);
  const counts = new Map<number, number>();
  let sunflower = 0;
  let oceanSand = 0;
  // 器件态累加器（SceneMetrics.cs:471-585 ScanEnums；后扫到者覆盖 = 原版逐格覆写语义）
  let mbStyle = -1, fountain = -1, monolith = -1, bloodMoonMono = false;
  const oceanTopY = (worldSurface + rockLevel) / 2 + 40; // oceanLevel（WorldGen.cs:4393）
  const beachDist = BEACH_DISTANCE;
  for (let y = sy0; y <= sy1; y++) {
    for (let x = sx0; x <= sx1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      counts.set(t, (counts.get(t) ?? 0) + 1);
      if (t === SUNFLOWER) sunflower++;
      // isDesertBiomeSand && oceanDepths（SceneMetrics L376-380）：只有普通沙族在
      // 海洋深度带内才计海洋沙；邪恶/神圣沙与沙岩砖族不是 isDesertBiomeSand
      if (DESERT_BIOME_SAND.has(t) && y <= oceanTopY && (x < beachDist || x > w - beachDist)) oceanSand++;
      // 器件帧态（八音盒/喷泉/天塔柱；读取器与电路开关同源 wiring/devices.ts）
      const fxSh = FX_SHEET_IDS.get(t);
      if (fxSh !== undefined) {
        if (fxSh === 139) mbStyle = musicBoxStyleOf(st.frameX[i], st.frameY[i]);
        else if (fxSh === 207) fountain = fountainColorOf(st.frameX[i], st.frameY[i]);
        else if (fxSh === 410 || fxSh === 509) monolith = monolithTypeOf(fxSh, st.frameX[i], st.frameY[i]);
        else if (fxSh === 480) bloodMoonMono = bloodMoonMonolithOf(fxSh, st.frameY[i]);
      }
    }
  }

  // 聚合（AggregateTileCounts L603-670：含神圣/邪恶/猩红互减、向日葵 -10）
  let holy = countSet(counts, HOLY_TILES);
  let evil = countSet(counts, EVIL_TILES) + sunflower * -10;
  let blood = countSet(counts, BLOOD_TILES) + sunflower * -10;
  const holyRaw = holy;
  holy -= evil; holy -= blood;
  evil -= holyRaw; blood -= holyRaw;
  holy = Math.max(0, holy); evil = Math.max(0, evil); blood = Math.max(0, blood);

  const jungle = countSet(counts, JUNGLE_TILES);
  const snow = countSet(counts, SNOW_TILES);
  const mushroom = countSet(counts, MUSHROOM_TILES);
  const meteor = countSet(counts, METEOR_TILES);
  const dungeonTiles = countSet(counts, DUNGEON_TILES);
  // DesertSandTileCount（SceneMetrics L665：sand - oceanSand；oceanSand 在扫描循环内按 oceanDepths 逐格计）
  const desert = Math.max(0, countSet(counts, SAND_TILES) - oceanSand);
  const graveyard = Math.max(0, countSet(counts, GRAVEYARD_TILES) - (sunflower >> 1));

  // Zone 判定（CalculateZones L673-697）
  const zoneUnderworldHeight = tileY > underworldLayer;
  const belowSurface = tileY > worldSurface;
  const centerWall = st.inBounds(tileX, tileY) ? st.wall[st.idx(tileX, tileY)] : 0;
  const zoneDungeon = dungeonTiles >= DUNGEON_THRESHOLD && belowSurface && DUNGEON_WALLS.has(centerWall);
  const zoneDesert = desert >= DESERT_THRESHOLD;

  // oceanDepths（WorldGen.cs:10978-10988：y > oceanLevel 恒假；否则 x 距边 < beachDistance(380)）
  const oceanTop = (worldSurface + rockLevel) / 2 + 40;
  const zoneBeach = tileY <= oceanTop && (tileX < BEACH_DISTANCE || tileX > w - BEACH_DISTANCE);

  return {
    tileX, tileY,
    belowSurface,
    zoneSkyHeight: tileY <= worldSurface * 0.35,
    zoneOverworldHeight: tileY <= worldSurface && tileY > worldSurface * 0.35,
    zoneDirtLayerHeight: tileY <= rockLevel && tileY > worldSurface,
    zoneRockLayerHeight: tileY <= underworldLayer && tileY > rockLevel,
    zoneUnderworldHeight,
    zoneCorrupt: evil >= CORRUPTION_THRESHOLD,
    zoneCrimson: blood >= CRIMSON_THRESHOLD,
    zoneHallow: holy >= HALLOW_THRESHOLD,
    zoneJungle: jungle >= JUNGLE_THRESHOLD && !zoneUnderworldHeight,
    zoneSnow: snow >= SNOW_THRESHOLD,
    zoneDesert,
    snowTileCount: snow,
    desertSandTileCount: desert, // DesertSandTileCount = max(0, SandTileCount - OceanSandTileCount)（L665，
    // 海洋沙 = isDesertBiomeSand ∩ oceanDepths 逐格计，扫描窗内与原版一致）
    graveyardTileCount: graveyard,
    zoneGlowshroom: mushroom >= MUSHROOM_THRESHOLD,
    zoneMeteor: meteor >= METEOR_THRESHOLD,
    zoneGraveyard: graveyard >= GRAVEYARD_THRESHOLD,
    zoneDungeon,
    zoneTemple: centerWall === 87,
    zoneBeach,
    zoneUndergroundDesert: zoneDesert && belowSurface && UNDERGROUND_DESERT_WALLS.has(centerWall),
    townNPCCount,
    musicBoxStyle: mbStyle,
    fountainColor: fountain,
    monolithType: monolith,
    bloodMoonMonolith: bloodMoonMono,
    partyUp,
  };
}
