// 原版环境判定（SceneMetrics.cs 1:1 精简核）：
// 玩家中心 169×124 tile 采样计数（ZoneScanSize = 1920/16+49 × 120/16+49, SceneMetrics.cs:12-16）
// → 阈值聚合（L24-64/L603-670）→ Zone 标志（CalculateZones L673-697）。
// BGM 选择链(Music.ts)与群系背景(BiomeBackground)共用本份结果。
import { TILE_DEFS } from '../data/tiles';
import type { World } from './World';

/** vanilla tile sheet id → 本仓库内部 tile id（TILE_DEFS 下标即内部 id；未注册的 sheet 缺席=计数 0） */
const SHEET_MAP = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i];
  if (d?.vanilla && !SHEET_MAP.has(d.vanilla.sheet)) SHEET_MAP.set(d.vanilla.sheet, i);
}
const ids = (arr: number[]) => arr.map((n) => SHEET_MAP.get(n)).filter((v): v is number => v != null);

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
const SUNFLOWER = SHEET_MAP.get(27) ?? -1;
const GRAVEYARD_TILES = ids([85]);

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
/** 地下沙漠墙（WallID.Sets.Conversion.Sandstone 216/217 + HardenedSand 187-189 近似） */
const SANDSTONE_WALLS = new Set([216, 217, 187, 188, 189]);

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
  zoneGlowshroom: boolean;
  zoneMeteor: boolean;
  zoneGraveyard: boolean;
  zoneDungeon: boolean;
  zoneTemple: boolean;
  zoneBeach: boolean;
  zoneUndergroundDesert: boolean;
  townNPCCount: number;
}

export const EMPTY_SCENE: SceneFlags = {
  tileX: 0, tileY: 0, belowSurface: false,
  zoneSkyHeight: false, zoneOverworldHeight: false, zoneDirtLayerHeight: false,
  zoneRockLayerHeight: false, zoneUnderworldHeight: false,
  zoneCorrupt: false, zoneCrimson: false, zoneHallow: false, zoneJungle: false,
  zoneSnow: false, zoneDesert: false, zoneGlowshroom: false, zoneMeteor: false,
  zoneGraveyard: false, zoneDungeon: false, zoneTemple: false, zoneBeach: false,
  zoneUndergroundDesert: false, townNPCCount: 0,
};

const countSet = (counts: Map<number, number>, set: number[]): number => {
  let n = 0;
  for (const t of set) n += counts.get(t) ?? 0;
  return n;
};

/** 以玩家中心扫描并计算全部 Zone 标志（对应 ScanAndApplyToPlayer 主链） */
export function scanScene(
  world: World, centerX: number, centerY: number, townNPCCount: number,
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
  for (let y = sy0; y <= sy1; y++) {
    for (let x = sx0; x <= sx1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      counts.set(t, (counts.get(t) ?? 0) + 1);
      if (t === SUNFLOWER) sunflower++;
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
  const desert = Math.max(0, countSet(counts, SAND_TILES));
  const graveyard = Math.max(0, countSet(counts, GRAVEYARD_TILES) - (sunflower >> 1));

  // Zone 判定（CalculateZones L673-697）
  const zoneUnderworldHeight = tileY > underworldLayer;
  const belowSurface = tileY > worldSurface;
  const centerWall = st.inBounds(tileX, tileY) ? st.wall[st.idx(tileX, tileY)] : 0;
  const zoneDungeon = dungeonTiles >= DUNGEON_THRESHOLD && belowSurface && DUNGEON_WALLS.has(centerWall);
  const zoneDesert = desert >= DESERT_THRESHOLD;

  // oceanDepths（WorldGen.cs:4390-4400：y <= (worldSurface+rockLayer)/2+40 且 x 距边 < beachDistance）
  const beachDistance = Math.max(24, Math.floor(w * 0.06));
  const oceanTop = (worldSurface + rockLevel) / 2 + 40;
  const zoneBeach = tileY <= oceanTop && (tileX < beachDistance || tileX > w - beachDistance);

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
    zoneGlowshroom: mushroom >= MUSHROOM_THRESHOLD,
    zoneMeteor: meteor >= METEOR_THRESHOLD,
    zoneGraveyard: graveyard >= GRAVEYARD_THRESHOLD,
    zoneDungeon,
    zoneTemple: centerWall === 87,
    zoneBeach,
    zoneUndergroundDesert: zoneDesert && belowSurface && SANDSTONE_WALLS.has(centerWall),
    townNPCCount,
  };
}
