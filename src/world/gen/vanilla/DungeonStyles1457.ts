/**
 * DungeonStyles1457 —— 地牢生成域 1457 对齐（批 dungeon-1457-alignment）。
 *
 * 转录自 ../Terarria1457/ 反编译源（1456 与 1457 地牢域 differ 42 文件定谳清单见
 * docs/worldgen/dungeon-1457-alignment.md）：
 *  - Terraria.GameContent.Generation.Dungeon/DungeonGenerationStyleID.cs（风格 ID 表）
 *  - …/DualDungeonUnbreakableWallTiers.cs（不可破墙档位；1456 已存在,非 1457 新文件）
 *  - …/DungeonType.cs（Default/DualDungeon）
 *  - …/DungeonGenerationStyles.cs（16 档风格注册表;1457 增 ExtraTileTypes/ExtraWallTypes/
 *    TilePaintColor/WallPaintColor 与 GetStyleForTile/Wall 的 includeCracked/includeExtras 语义）
 *  - …/DungeonGenerationStyleData.cs（TileIsInStyle/WallIsInStyle :108-146）
 *  - …/DungeonUtils.cs（GetTierForDungeonTile/Wall :2008-2100、IsHigherOrEqualTiered* :1946-1962、
 *    IsConsideredAnyDungeonWall :1905-1928、IsConsideredDungeonWallEdge :1952-1974、
 *    InAnyPotentialDungeonBounds :2140 附近）
 *  - …/DungeonCrawler.cs SetupDungeonGenVarVariables :54-183（genvars 判定数组构建;
 *    dualDungeons 时克隆并按风格档扩表）+ WorldGen.cs:11552-11560（Dunes pass 头双地牢
 *    第二套 genvars 装配）
 *  - Features/DungeonGlobalTraps.cs :33/:154（DualDungeon_AllowTrapGenerationInDungeon 窗口）
 *  - WorldGen.cs:8865 placeTrap 门（dualDungeons && !窗口开 && InAnyPotentialDungeonBounds → 拒）
 *
 * ★普通世界（无双地牢旗）行为约束：本模块全部消费点都必须 dualDungeons 门控——
 *   GetTierForDungeonTile/Wall 的多风格循环 1456 起就包在 dualDungeons 门里,非 dual
 *   两版同走 `Main.tileDungeon/wallDungeon ? 1 : -1` 单行（DungeonUtils.cs:2039-2041/2099-2101）,
 *   故接线后普通世界掷序/输出零扰动（tests/dungeon-1457-alignment.test.ts 有对拍断言）。
 *
 * 未转录（备案,待双地牢完整实装批）：
 *  - 各风格档的家具 item 表（ChandelierItemTypes/LanternItemTypes/TableItemTypes/…
 *    与 Shimmer/LivingWood/Beehive/Temple 四个子类的 CanGenerateFeatureAt/
 *    GetBookshelfMinMaxSizes 覆写）——消费端是双地牢陈设管线（DualDungeonLayoutProvider
 *    + biome 房间族）,本仓尚未建模双地牢第二地牢生成。
 *  - SubStyles 展开逻辑（DungeonCrawler.cs:150-154）。
 */

/** DungeonGenerationStyleID.cs（1456/1457 同表） */
export const DungeonGenerationStyleID = {
  Dungeon: 0,
  Cavern: 1,
  Snow: 2,
  Desert: 3,
  Corruption: 4,
  Crimson: 5,
  Hallow: 6,
  GlowingMushroom: 7,
  Jungle: 8,
  Beehive: 9,
  Temple: 10,
  Shimmer: 11,
  Spider: 12,
  LivingWood: 13,
  LivingMahogany: 14,
  Crystal: 15,
  Count: 16,
} as const;

/** DualDungeonUnbreakableWallTiers.cs（1456/1457 同表） */
export const DualDungeonUnbreakableWallTiers = {
  EarlyGame: 0,
  EvilBoss: 1,
  JungleBoss: 2,
  Dungeon: 3,
  Hallow: 4,
  Temple: 5,
} as const;

/** DungeonType.cs */
export type DungeonType1457 = 'Default' | 'DualDungeon';

/** DungeonGenerationStyleData 的地牢生成域核心投影（家具 item 表未转录,见头注）。
 *  字段语义与 C# 同名属性一一对应;可选 = C# nullable（ushort?/byte?）。 */
export interface DungeonStyleData {
  Style: number;
  BrickTileType: number;
  BrickCrackedTileType: number;
  BrickWallType: number;
  BrickGrassTileType?: number;
  PitTrapTileType: number;
  WindowGlassWallType: number;
  WindowClosedGlassWallType: number;
  WindowEdgeWallType: number;
  /** 1457 新增：风格扩表（Snow/Desert 瓦、Corruption/Crimson/Hallow/Jungle 墙等） */
  ExtraTileTypes?: number[];
  ExtraWallTypes?: number[];
  /** 1457 新增：LivingMahogany WallPaintColor=12（其余档 null） */
  TilePaintColor?: number;
  WallPaintColor?: number;
  LiquidType: number;
  /** 平台 item 表（GetPlatformStyle 消费;空表 → 恒 -1 不掷） */
  PlatformItemTypes: number[];
  UnbreakableWallProgressionTier: number;
  /** ★IIIII88：DitherSnake 边缘抖动门（DungeonGenerationStyles.cs 各档 EdgeDither 字段,
   *  1457 转录曾缺省——蛇槽涂绘 SkipPaintForEdge 的分叉键）。Default 档恒 false。 */
  EdgeDither: boolean;
  /** ★IIIII121：子风格表（Cavern=[Shimmer,Spider,LivingWood] / Hallow=[Crystal] /
   *  Jungle=[Beehive,LivingMahogany],DungeonGenerationStyles.cs :224/:472/:638）——
   *  canBeClearedDuringGenerationDual 合并 isDungeonTile 时须随主风格一并入表
   *  （DungeonCrawler.cs:146-154 合并语义）。 */
  SubStyles?: DungeonStyleData[];
  /** ★IIIII105b：风格家具 item 表（DungeonGenerationStyles.cs 各档终态）——由
   *  DungeonStyleItems.ts 装配（数据不在本文件重复转录）。消费端=dual 家具分派。 */
  Furn?: import('./DungeonStyleItems').FurnTables;
  /** ★IIIII105b：LivingWoodStyleData.GetBookshelfMinMaxSizes 覆写 (3,7)
   *  （DungeonGenerationStyles.cs:38-44）；其余档缺省 (1,4)。 */
  BookshelfMinMaxOverride?: [number, number];
}

const T = DualDungeonUnbreakableWallTiers;

/** DungeonGenerationStyles.cs 静态注册表（1457 终态;字段逐项对表 :65-676）。
 *  家具 item 表仅录 PlatformItemTypes（tier/扩表机器的消费面）;其余备案。 */
export const DungeonGenerationStyles: Record<string, DungeonStyleData> = {
  Cavern: {
    Style: 1, BrickTileType: 38, BrickCrackedTileType: 123, BrickWallType: 349,
    PitTrapTileType: 123, WindowGlassWallType: 21, WindowClosedGlassWallType: 4,
    WindowEdgeWallType: 5, LiquidType: -1, PlatformItemTypes: [94, 4416],
    UnbreakableWallProgressionTier: T.EarlyGame,
    EdgeDither: true,
  },
  Snow: {
    Style: 2, BrickTileType: 161, BrickCrackedTileType: 224, BrickWallType: 71,
    ExtraTileTypes: [147], ExtraWallTypes: [40],
    PitTrapTileType: 224, WindowGlassWallType: 90, WindowClosedGlassWallType: 149,
    WindowEdgeWallType: 31, LiquidType: -1, PlatformItemTypes: [3908],
    UnbreakableWallProgressionTier: T.EarlyGame,
    EdgeDither: true,
  },
  Desert: {
    Style: 3, BrickTileType: 396, BrickCrackedTileType: 53, BrickWallType: 187,
    ExtraTileTypes: [397, 404], ExtraWallTypes: [216, 223],
    PitTrapTileType: 53, WindowGlassWallType: 89, WindowClosedGlassWallType: 151,
    WindowEdgeWallType: 34, LiquidType: -1, PlatformItemTypes: [4311],
    UnbreakableWallProgressionTier: T.EarlyGame,
    EdgeDither: false,
  },
  Corruption: {
    Style: 4, BrickTileType: 25, BrickCrackedTileType: 112, BrickWallType: 3,
    ExtraWallTypes: [188, 189, 190, 191],
    PitTrapTileType: 112, WindowGlassWallType: 88, WindowClosedGlassWallType: 41,
    WindowEdgeWallType: 33, LiquidType: -1, PlatformItemTypes: [631],
    UnbreakableWallProgressionTier: T.EvilBoss,
    EdgeDither: true,
  },
  Crimson: {
    Style: 5, BrickTileType: 203, BrickCrackedTileType: 234, BrickWallType: 83,
    ExtraWallTypes: [192, 193, 194, 195],
    PitTrapTileType: 234, WindowGlassWallType: 92, WindowClosedGlassWallType: 85,
    WindowEdgeWallType: 174, LiquidType: -1, PlatformItemTypes: [913],
    UnbreakableWallProgressionTier: T.EvilBoss,
    EdgeDither: true,
  },
  Hallow: {
    Style: 6, BrickTileType: 117, BrickCrackedTileType: 116, BrickWallType: 28,
    ExtraWallTypes: [200, 201, 202, 203],
    PitTrapTileType: 116, WindowGlassWallType: 91, WindowClosedGlassWallType: 43,
    WindowEdgeWallType: 22, LiquidType: -1, PlatformItemTypes: [633],
    UnbreakableWallProgressionTier: T.Hallow,
    EdgeDither: true,
  },
  GlowingMushroom: {
    Style: 7, BrickTileType: 59, BrickCrackedTileType: 123, BrickWallType: 80,
    BrickGrassTileType: 70,
    PitTrapTileType: 123, WindowGlassWallType: 90, WindowClosedGlassWallType: 60,
    WindowEdgeWallType: 78, LiquidType: -1, PlatformItemTypes: [2549],
    UnbreakableWallProgressionTier: T.JungleBoss,
    EdgeDither: true,
  },
  Jungle: {
    Style: 8, BrickTileType: 59, BrickCrackedTileType: 123, BrickWallType: 64,
    BrickGrassTileType: 60, ExtraWallTypes: [204, 205, 206, 207, 15],
    PitTrapTileType: 123, WindowGlassWallType: 91, WindowClosedGlassWallType: 42,
    WindowEdgeWallType: 24, LiquidType: -1, PlatformItemTypes: [632],
    UnbreakableWallProgressionTier: T.JungleBoss,
    EdgeDither: true,
  },
  Beehive: {
    Style: 9, BrickTileType: 225, BrickCrackedTileType: 123, BrickWallType: 86,
    PitTrapTileType: 123, WindowGlassWallType: 89, WindowClosedGlassWallType: 172,
    WindowEdgeWallType: 151, LiquidType: 2, PlatformItemTypes: [2630],
    UnbreakableWallProgressionTier: T.JungleBoss,
    EdgeDither: true,
  },
  Temple: {
    Style: 10, BrickTileType: 226, BrickCrackedTileType: 123, BrickWallType: 87,
    PitTrapTileType: 123, WindowGlassWallType: 92, WindowClosedGlassWallType: 42,
    WindowEdgeWallType: 24, LiquidType: -1, PlatformItemTypes: [3906],
    UnbreakableWallProgressionTier: -1,
    EdgeDither: false,
  },
  Shimmer: {
    Style: 11, BrickTileType: 667, BrickCrackedTileType: 123, BrickWallType: 322,
    PitTrapTileType: 123, WindowGlassWallType: 93, WindowClosedGlassWallType: 149,
    WindowEdgeWallType: 37, LiquidType: 3, PlatformItemTypes: [94],
    UnbreakableWallProgressionTier: T.EarlyGame,
    EdgeDither: true,
  },
  Spider: {
    Style: 12, BrickTileType: 156, BrickCrackedTileType: 123, BrickWallType: 62,
    PitTrapTileType: 123, WindowGlassWallType: 21, WindowClosedGlassWallType: 4,
    WindowEdgeWallType: 36, LiquidType: -1, PlatformItemTypes: [94],
    UnbreakableWallProgressionTier: T.EarlyGame,
    EdgeDither: true,
  },
  LivingWood: {
    Style: 13, BrickTileType: 191, BrickCrackedTileType: 192, BrickWallType: 244,
    PitTrapTileType: 123, WindowGlassWallType: 21, WindowClosedGlassWallType: 4,
    WindowEdgeWallType: 196, LiquidType: -1, PlatformItemTypes: [2629],
    UnbreakableWallProgressionTier: T.EarlyGame,
    EdgeDither: true,
  },
  LivingMahogany: {
    Style: 14, BrickTileType: 383, BrickCrackedTileType: 384, BrickWallType: 244,
    WallPaintColor: 12,
    PitTrapTileType: 123, WindowGlassWallType: 21, WindowClosedGlassWallType: 42,
    WindowEdgeWallType: 196, LiquidType: -1, PlatformItemTypes: [2629],
    UnbreakableWallProgressionTier: T.JungleBoss,
    EdgeDither: true,
  },
  Crystal: {
    Style: 15, BrickTileType: 385, BrickCrackedTileType: 116, BrickWallType: 186,
    PitTrapTileType: 116, WindowGlassWallType: 88, WindowClosedGlassWallType: 43,
    WindowEdgeWallType: 22, LiquidType: -1, PlatformItemTypes: [633],
    UnbreakableWallProgressionTier: T.Hallow,
    EdgeDither: false,
  },
};

// ★IIIII121：子风格表回填（自引用须在 record 定义后完成;DungeonGenerationStyles.cs
//   :224 Cavern=[Shimmer,Spider,LivingWood] / :472 Hallow=[Crystal] / :638 Jungle=[Beehive,LivingMahogany]）
DungeonGenerationStyles.Cavern.SubStyles = [DungeonGenerationStyles.Shimmer, DungeonGenerationStyles.Spider, DungeonGenerationStyles.LivingWood];
DungeonGenerationStyles.Hallow.SubStyles = [DungeonGenerationStyles.Crystal];
DungeonGenerationStyles.Jungle.SubStyles = [DungeonGenerationStyles.Beehive, DungeonGenerationStyles.LivingMahogany];

/** DungeonGenerationStyles.GetCurrentDungeonStyle（:680-719）：Default 档工厂——
 *  砖族取自 CurrentDungeonGenVars（SetupDungeonGenVarVariables :56-108 掷的主题）。
 *  全家具 item 数组 = int[0]（★这是"变体墙在 1457 返回 Default 后各消费点零掷差"
 *  的根据：GetPlatformStyle/GetFurnitureItem 对空表短路不掷）。 */
export function getCurrentDungeonStyle(g: {
  brickTileType: number; brickCrackedTileType: number; brickWallType: number;
  windowGlassWallType: number; windowClosedGlassWallType: number; windowEdgeWallType: number;
  windowPlatformItemTypes: number[];
}): DungeonStyleData {
  return {
    Style: DungeonGenerationStyleID.Dungeon,
    BrickTileType: g.brickTileType,
    BrickCrackedTileType: g.brickCrackedTileType,
    BrickWallType: g.brickWallType,
    PitTrapTileType: g.brickCrackedTileType,
    WindowGlassWallType: g.windowGlassWallType,
    WindowClosedGlassWallType: g.windowClosedGlassWallType,
    WindowEdgeWallType: g.windowEdgeWallType,
    LiquidType: -1,   // ★IIIII97：C# DungeonGenerationStyleData.cs:41 缺省 -1（仅 Shimmer=3/Beehive=2 非负）
    PlatformItemTypes: g.windowPlatformItemTypes,
    UnbreakableWallProgressionTier: T.Dungeon,
    EdgeDither: false,
  };
}

/** 双地牢风格表（DungeonCrawler.SetupDungeonGenVarVariables :111-128）：
 *  地牢 0（偶）=[Cavern, Crimson|Corruption, Jungle, Default]；
 *  地牢 1（奇）=[Snow, Desert, Hallow, Temple]。非 dual = [Default]。 */
export function dualDungeonStyles(currentDungeon: number, crimson: boolean, defaultStyle: DungeonStyleData): DungeonStyleData[] {
  if (currentDungeon % 2 === 0) {
    return [DungeonGenerationStyles.Cavern, crimson ? DungeonGenerationStyles.Crimson : DungeonGenerationStyles.Corruption, DungeonGenerationStyles.Jungle, defaultStyle];
  }
  return [DungeonGenerationStyles.Snow, DungeonGenerationStyles.Desert, DungeonGenerationStyles.Hallow, DungeonGenerationStyles.Temple];
}

// ── TileIsInStyle / WallIsInStyle（DungeonGenerationStyleData.cs:108-146,1457 终态）──

export function tileIsInStyle(s: DungeonStyleData, tileType: number, includeCracked = true, includeExtras = false): boolean {
  if (s.BrickGrassTileType !== undefined && tileType === s.BrickGrassTileType) return true;
  if (includeCracked && tileType === s.BrickCrackedTileType) return true;
  if (includeExtras && s.ExtraTileTypes !== undefined) {
    for (let i = 0; i < s.ExtraTileTypes.length; i++) {
      if (tileType === s.ExtraTileTypes[i]) return true;
    }
  }
  return tileType === s.BrickTileType;
}

export function wallIsInStyle(s: DungeonStyleData, wallType: number, includeWindows = false, includeExtras = false): boolean {
  if (includeWindows && (wallType === s.WindowGlassWallType || wallType === s.WindowEdgeWallType || wallType === s.WindowClosedGlassWallType)) return true;
  if (includeExtras && s.ExtraWallTypes !== undefined) {
    for (let i = 0; i < s.ExtraWallTypes.length; i++) {
      if (wallType === s.ExtraWallTypes[i]) return true;
    }
  }
  return wallType === s.BrickWallType;
}

/** GetPlatformStyle（DungeonGenerationStyleData.cs:150-158）掷侧投影：空表 → -1
 *  **不掷**（Default 档恒此路——"变体墙返回 Default 后各消费点零掷差"的根据之一）。
 *  非空表掷 Next(len) 取 platform item id 原样返回——item→placeStyle 映射
 *  （ItemID.Sets.DerivedPlacementDetails[num].tileStyle）待双地牢陈设管线批承接,
 *  本函数只保证掷序语义（空表短路/非空表恰一掷）。 */
export function getPlatformStyle(s: DungeonStyleData, genRand: { nextInt(n: number): number }): number {
  const num = (s.PlatformItemTypes.length === 0) ? -1 : s.PlatformItemTypes[genRand.nextInt(s.PlatformItemTypes.length)]!;
  return num >= 0 ? num : -1;
}

/** GetStyleForTile（DungeonGenerationStyles.cs:722-743,1457 终态）。
 *  `tileDungeon` = Main.tileDungeon 判定（注入避免引 Main）。 */
export function getStyleForTile(styles: DungeonStyleData[], tileType: number, tileDungeon: (t: number) => boolean): DungeonStyleData | null {
  for (const style of styles) {
    if (tileIsInStyle(style, tileType, false, true)) return style;
  }
  if (tileDungeon(tileType)) {
    for (const style of styles) {
      if (style.Style === DungeonGenerationStyleID.Dungeon) return style;
    }
  }
  return null;
}

/** GetStyleForWall（DungeonGenerationStyles.cs:745-768,1457 终态）。
 *  ★1457 新增快路径：Style==0 且 Main.wallDungeon[wall] → 直接返 Default（1456 仅
 *  WallIsInStyle=brickWallType 命中）——变体墙 94-99（wallDungeon=true）自此返回 Default。
 *  逐消费点核实（Banners/Paintings/GroundFurniture/Bookshelves）Default 路径与 null
 *  路径值等价零掷差（GetCurrentDungeonStyle 全 item 表空 → 短路），唯 Lights 吊灯
 *  资格门（!=null）真实扩宽——该差异属 B-normal 待实装清单（见 alignment 文档）。 */
export function getStyleForWall(styles: DungeonStyleData[], wallType: number, wallDungeon: (w: number) => boolean): DungeonStyleData | null {
  for (const style of styles) {
    if (style.Style === DungeonGenerationStyleID.Dungeon && wallType >= 0 && wallDungeon(wallType)) return style;
    if (wallIsInStyle(style, wallType, false, true)) return style;
  }
  return null;
}

// ── tier 机器（DungeonUtils.cs:1946-2100,1457 终态）──

/** GetTierForDungeonTile（:2008-2042）。★整个多风格循环包在 dualDungeons 门内
 *  （1456 即如此）——非 dual 两版同走末行 `tileDungeon ? 1 : -1`。 */
export function getTierForDungeonTile(
  genVars: { dungeonGenerationStyles: DungeonStyleData[] },
  tileType: number, genStyleID: number, dualDungeons: boolean,
  tileDungeon: (t: number) => boolean,
  includeCracked = false, includeExtras = false,
): number {
  if (dualDungeons) {
    const styles = genVars.dungeonGenerationStyles;
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i]!;
      if (s.Style === DungeonGenerationStyleID.Cavern && tileIsInStyle(DungeonGenerationStyles.Spider, tileType, includeCracked, includeExtras)) return i + 0.25;
      if (s.Style === DungeonGenerationStyleID.Cavern && (genStyleID === -1 || genStyleID === DungeonGenerationStyleID.LivingWood) && tileIsInStyle(DungeonGenerationStyles.LivingWood, tileType, includeCracked, includeExtras)) return i + 0.5;
      if (s.Style === DungeonGenerationStyleID.Cavern && tileIsInStyle(DungeonGenerationStyles.Shimmer, tileType, includeCracked, includeExtras)) return i + 0.75;
      if (s.Style === DungeonGenerationStyleID.Jungle && (genStyleID === -1 || genStyleID === DungeonGenerationStyleID.LivingMahogany) && tileIsInStyle(DungeonGenerationStyles.LivingMahogany, tileType, includeCracked, includeExtras)) return i + 0.33;
      if (s.Style === DungeonGenerationStyleID.Jungle && tileIsInStyle(DungeonGenerationStyles.Beehive, tileType, includeCracked, includeExtras)) return i + 0.66;
      if (s.Style === DungeonGenerationStyleID.Hallow && tileIsInStyle(DungeonGenerationStyles.Crystal, tileType, includeCracked, includeExtras)) return i + 0.5;
      if (s.Style === DungeonGenerationStyleID.Dungeon && tileDungeon(tileType)) return i;
      if (tileIsInStyle(s, tileType)) return i;
    }
    if (tileDungeon(tileType)) return -0.5;
    return -1.0;
  }
  return tileType > 0 && tileDungeon(tileType) ? 1 : -1;
}

/** GetTierForDungeonWall（:2044-2100）。门控同上。 */
export function getTierForDungeonWall(
  genVars: { dungeonGenerationStyles: DungeonStyleData[] },
  wallType: number, genStyleID: number, dualDungeons: boolean,
  wallDungeon: (w: number) => boolean,
  includeWindows = false, includeExtras = false,
): number {
  if (dualDungeons) {
    const styles = genVars.dungeonGenerationStyles;
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i]!;
      if (s.Style === DungeonGenerationStyleID.Cavern && wallIsInStyle(DungeonGenerationStyles.Spider, wallType, includeWindows, includeExtras)) return i + 0.25;
      if (s.Style === DungeonGenerationStyleID.Cavern && (genStyleID === -1 || genStyleID === DungeonGenerationStyleID.LivingWood) && wallIsInStyle(DungeonGenerationStyles.LivingWood, wallType, includeWindows, includeExtras)) return i + 0.5;
      if (s.Style === DungeonGenerationStyleID.Cavern && wallIsInStyle(DungeonGenerationStyles.Shimmer, wallType, includeWindows, includeExtras)) return i + 0.75;
      if (s.Style === DungeonGenerationStyleID.Jungle && (genStyleID === -1 || genStyleID === DungeonGenerationStyleID.LivingMahogany) && wallIsInStyle(DungeonGenerationStyles.LivingMahogany, wallType, includeWindows, includeExtras)) return i + 0.33;
      if (s.Style === DungeonGenerationStyleID.Jungle && wallIsInStyle(DungeonGenerationStyles.Beehive, wallType, includeWindows, includeExtras)) return i + 0.66;
      if (s.Style === DungeonGenerationStyleID.Hallow && wallIsInStyle(DungeonGenerationStyles.Crystal, wallType, includeWindows, includeExtras)) return i + 0.5;
      if (s.Style === DungeonGenerationStyleID.Dungeon && wallDungeon(wallType)) return i;
      if (wallIsInStyle(s, wallType)) return i;
    }
    if (wallDungeon(wallType)) return -0.5;
    return -1.0;
  }
  return wallType > 0 && wallDungeon(wallType) ? 1 : -1;
}

/** IsHigherOrEqualTieredDungeonTile（:1946-1951） */
export function isHigherOrEqualTieredDungeonTile(
  genVars: { dungeonGenerationStyles: DungeonStyleData[] },
  currentTileType: number, newTileType: number, currentStyleID: number, newStyleID: number,
  dualDungeons: boolean, tileDungeon: (t: number) => boolean,
  includeCracked = false, includeExtras = false,
): boolean {
  const a = getTierForDungeonTile(genVars, currentTileType, currentStyleID, dualDungeons, tileDungeon, includeCracked, includeExtras);
  const b = getTierForDungeonTile(genVars, newTileType, newStyleID, dualDungeons, tileDungeon, includeCracked, includeExtras);
  return a >= b;
}

/** IsHigherOrEqualTieredDungeonWall（:1953-1962） */
export function isHigherOrEqualTieredDungeonWall(
  genVars: { dungeonGenerationStyles: DungeonStyleData[] },
  currentWallType: number, newWallType: number, currentStyleID: number, newStyleID: number,
  dualDungeons: boolean, wallDungeon: (w: number) => boolean,
  includeWindows = false, includeExtras = false,
): boolean {
  const a = getTierForDungeonWall(genVars, currentWallType, currentStyleID, dualDungeons, wallDungeon, includeWindows, includeExtras);
  const b = getTierForDungeonWall(genVars, newWallType, newStyleID, dualDungeons, wallDungeon, includeWindows, includeExtras);
  return a >= b;
}

// ── genvars 判定数组（DungeonCrawler.SetupDungeonGenVarVariables :133-183）──

export interface DungeonGenVars1457 {
  dungeonGenerationStyles: DungeonStyleData[];
  isDungeonTile: boolean[];
  isCrackedBrick: boolean[];
  isPitTrapTile: boolean[];
  isDungeonWall: boolean[];
  /** 1457 新增字段（DungeonGenVars.cs:56） */
  isDungeonWallEdge: boolean[];
  isDungeonWallGlass: boolean[];
}

/** 构建一套 genvars 判定数组。非 dual：直接引用注入的基础表（原版=引用静态
 *  Main.tileDungeon/wallDungeon 等,不克隆不扩表）;dual：克隆后按风格档扩表
 *  （含 SubStyles 展开位——本仓暂无 SubStyles 数据,备案）。 */
export function buildDungeonGenVars(
  styles: DungeonStyleData[],
  dualDungeons: boolean,
  base: {
    tileDungeon: boolean[]; wallDungeon: boolean[]; crackedBricks: boolean[]; glassWalls: boolean[];
  },
): DungeonGenVars1457 {
  const gv: DungeonGenVars1457 = {
    dungeonGenerationStyles: styles.slice(),
    isDungeonTile: base.tileDungeon,
    isCrackedBrick: base.crackedBricks,
    isPitTrapTile: base.crackedBricks,
    isDungeonWall: base.wallDungeon,
    isDungeonWallEdge: base.wallDungeon,
    isDungeonWallGlass: base.glassWalls,
  };
  if (!dualDungeons) return gv;
  gv.isDungeonTile = base.tileDungeon.slice();
  gv.isCrackedBrick = base.crackedBricks.slice();
  gv.isPitTrapTile = base.crackedBricks.slice();
  gv.isDungeonWall = base.wallDungeon.slice();
  gv.isDungeonWallEdge = base.wallDungeon.slice();
  gv.isDungeonWallGlass = base.glassWalls.slice();
  for (const item of styles) {
    gv.isDungeonTile[item.BrickTileType] = true;
    if (item.BrickGrassTileType !== undefined) gv.isDungeonTile[item.BrickGrassTileType] = true;
    gv.isCrackedBrick[item.BrickCrackedTileType] = true;
    gv.isPitTrapTile[item.PitTrapTileType] = true;
    gv.isDungeonWall[item.BrickWallType] = true;
    gv.isDungeonWallEdge[item.WindowEdgeWallType] = true;
    gv.isDungeonWallGlass[item.WindowGlassWallType] = true;
    gv.isDungeonWallGlass[item.WindowClosedGlassWallType] = true;
    if (item.ExtraTileTypes !== undefined) {
      for (const t of item.ExtraTileTypes) gv.isDungeonTile[t] = true;
    }
    if (item.ExtraWallTypes !== undefined) {
      for (const w2 of item.ExtraWallTypes) gv.isDungeonWall[w2] = true;
    }
  }
  return gv;
}

// ── IsConsideredAnyDungeonWall / IsConsideredDungeonWallEdge（DungeonUtils.cs:1905-1974,1457 新增）──

export function isConsideredAnyDungeonWall(gv: DungeonGenVars1457, wallType: number, allDungeons = false, dungeonGenVarsList?: DungeonGenVars1457[]): boolean {
  if (wallType > 0 && gv.isDungeonWall[wallType]) return true;   // Main.wallDungeon 基线并入 isDungeonWall
  if (allDungeons) {
    for (const g of dungeonGenVarsList ?? []) {
      if (g.isDungeonWall[wallType] || g.isDungeonWallEdge[wallType] || g.isDungeonWallGlass[wallType]) return true;
    }
  } else if (gv.isDungeonWall[wallType] || gv.isDungeonWallEdge[wallType] || gv.isDungeonWallGlass[wallType]) {
    return true;
  }
  return false;
}

export function isConsideredDungeonWallEdge(gv: DungeonGenVars1457, wallType: number, allDungeons = false, dungeonGenVarsList?: DungeonGenVars1457[]): boolean {
  if (wallType > 0 && gv.isDungeonWall[wallType]) return true;
  if (allDungeons) {
    for (const g of dungeonGenVarsList ?? []) {
      if (g.isDungeonWallEdge[wallType]) return true;
    }
  } else if (gv.isDungeonWallEdge[wallType]) {
    return true;
  }
  return false;
}

// ── 双地牢陷阱窗口（Features/DungeonGlobalTraps.cs:33/:154 + WorldGen.cs:8865）──

/** GenVars.DualDungeon_AllowTrapGenerationInDungeon：DungeonGlobalTraps.Traps 窗口
 *  首尾置 true/false;消费点=placeTrap 入口门。JS 侧 DungeonPass.dgTraps 同窗接线。 */
export const dualDungeonTrapWindow = { allowTrapGenerationInDungeon: false };

/** 潜在地牢界域（GenVars.dungeonGenVars[i].outerPotentialDungeonBounds 的 JS 投影）。
 *  DungeonPass/DunesPass 头生成时回填（每地牢一套）;TrapsPass 门消费。 */
export interface PotentialDungeonBounds { l: number; t: number; r: number; b: number; }

/** 双地牢各套 genvars 的生成域投影（GenVars.dungeonGenVars[i] 最小面）。
 *  side：DungeonSide.Left=-1/Right=1；location：genVars.dungeonLocation（Reset 掷,
 *  入口 precalc 成功时被改写）;theme：SetupDungeonGenVarVariables 的 Next(3) 砖色掷值
 *  （dungeonColor/brickTileType/WallType/Cracked 全由它派生）;entA/B/seed：
 *  入口三掷（preGenDungeonEntranceSettings.RandomSeed=Next()）。 */
export interface DualDungeonGenEntry {
  side: number;
  location: number;
  theme: number;
  entA: number;
  entB: number;
  entSeed: number;
  /** ★IIIII93b：drunk 世界 SetupDungeonGenVarVariables 的墙风格重掷值（DC.cs:94-110）。
   *  非 drunk 世界恒 undefined（分支零掷）——IIIII88 曾照掷照弃，d1 无 wallVariants 可派生。 */
  wallStyle?: number;
}

export const dualDungeonState: {
  enabled: boolean;
  /** InAnyPotentialDungeonBounds 的界域集（普通世界=1 套,双地牢=2 套） */
  potentialBounds: PotentialDungeonBounds[];
  /** ★IIIII88：双地牢 genvars 列表（index=dungeon 序号;dungeon0 与普通单地牢共用
   *  gs.dungeonSide/dungeonLocation/dungeonTheme 面,本表只作双态消费端来源）。
   *  Reset 期填充 side/location（WorldGen.cs:11371/:11486）,Dunes 头补 theme/
   *  ent* 四掷与界域（cs:11552-11559 SetupDungeonGenVarVariables×2）。 */
  dungeons: DualDungeonGenEntry[];
  /** GenVars.DualDungeon_NormalizedDistanceSafeFromDither
   *  （WorldGen.cs:11488-11490 Reset 双地牢支：1-0.075×maxTilesY/1200）——
   *  DitherSnake 控制线边界带宽系数（DungeonControlLine 静态字段同源）。 */
  normalizedDistanceSafeFromDither: number;
  /** ★IIIII121：CanBeClearedDuringGeneration 动态支的 isDungeonTile 合并表
   *  （每地牢一张,vanilla sheet id 索引;Dunes 头 setup 后绪,Silt/Ores 等清块面消费）。 */
  tileProtection?: boolean[][];
} = { enabled: false, potentialBounds: [], dungeons: [], normalizedDistanceSafeFromDither: 1 };

/** ★IIIII121：SetupDungeonGenVarVariables×2 的 isDungeonTile 合并面
 *  （DungeonCrawler.cs:131-176 完整语义——克隆 Main.tileDungeon 基表
 *  {41,43,44,677,678,679},再并入两套样式表（含 SubStyles）的
 *  BrickTileType/BrickGrassTileType/ExtraTileTypes）。★奇偶分支条件
 *  `num2 == 0 || num2 != 1` 恒真 ⇒ **两座地牢都用 [Cavern,Crimson|Corruption,
 *  Jungle,Default]** ——原反编译 else 支死码,勿按直觉改回奇偶二分。
 *  在 Dunes 头（主题两掷齐后）调用;早于 Silt/OresAndShinies 消费窗。 */
function boolArrayOf(vals: number[]): boolean[] {
  const t = new Array<boolean>(1024).fill(false);
  for (const v of vals) t[v] = true;
  return t;
}

export function setupDualDungeonTileProtection(d0Theme: number, d1Theme: number, crimson: boolean): void {
  if (!dualDungeonState.enabled) return;
  const styleListFor = (theme: number): DungeonStyleData[] => [
    DungeonGenerationStyles.Cavern,
    crimson ? DungeonGenerationStyles.Crimson : DungeonGenerationStyles.Corruption,
    DungeonGenerationStyles.Jungle,
    getCurrentDungeonStyle({
      brickTileType: theme === 0 ? 41 : theme === 1 ? 43 : 44,
      brickCrackedTileType: theme === 0 ? 481 : theme === 1 ? 482 : 483,
      brickWallType: theme === 0 ? 7 : theme === 1 ? 8 : 9,
      windowGlassWallType: theme === 0 ? 91 : theme === 1 ? 92 : 90,
      windowClosedGlassWallType: theme === 0 ? 96 : theme === 1 ? 94 : 98,
      windowEdgeWallType: theme === 0 ? 8 : theme === 1 ? 9 : 7,
      windowPlatformItemTypes: [theme === 0 ? 1386 : theme === 1 ? 1385 : 1384],
    }),
  ];
  const base = boolArrayOf([41, 43, 44, 677, 678, 679]);
  const merge = (list: DungeonStyleData[]): boolean[] => {
    const t = base.slice();
    for (const s of list) {
      const fam: DungeonStyleData[] = [s, ...(s.SubStyles ?? [])];
      for (const st of fam) {
        t[st.BrickTileType] = true;
        if (st.BrickGrassTileType !== undefined) t[st.BrickGrassTileType] = true;
        if (st.ExtraTileTypes !== undefined) for (const v of st.ExtraTileTypes) t[v] = true;
      }
    }
    return t;
  };
  dualDungeonState.tileProtection = [merge(styleListFor(d0Theme)), merge(styleListFor(d1Theme))];
}

/** WorldGen.CanBeClearedDuringGeneration 双地牢动态支（WorldGen.cs:81453-81460）：
 *  generating && dualDungeons.Enabled && InAnyPotentialDungeonBounds(x,y)
 *  && IsConsideredDungeonTile(type, allDungeons:true) ⇒ **不可清**。@returns true=可清 */
export function canBeClearedDuringGenerationDual(typeSheet: number, x: number, y: number): boolean {
  const tp = dualDungeonState.tileProtection;
  if (!dualDungeonState.enabled || !tp || tp.length === 0) return true;
  if (!inAnyPotentialDungeonBounds(x, y)) return true;
  if (typeSheet < 0) return true;
  for (const tbl of tp) {
    if (typeSheet < tbl.length && tbl[typeSheet]) return false;
  }
  return true;
}

/** DungeonUtils.InAnyPotentialDungeonBounds（:2136-2165,ContainsWithFluff fluff=0 语义
 *  =半开矩形含端判定;JS 侧 DungeonPass.potContains 同构）。 */
export function inAnyPotentialDungeonBounds(x: number, y: number): boolean {
  for (const b of dualDungeonState.potentialBounds) {
    if (x >= b.l && x < b.r && y >= b.t && y < b.b) return true;
  }
  return false;
}

/** DungeonUtils.IntersectsAnyPotentialDungeonBounds（:2148-2165）：逐地牢 outer
 *  Hitbox 与入参矩形的 XNA 半开相交测试（A.Left<B.Right && B.Left<A.Right &&
 *  A.Top<B.Bottom && B.Top<A.Bottom）。★调用方必须先 refreshDualPotentialBounds
 *  （Dunes 头装配）——普通世界 potentialBounds 恒空 → 恒 false（vanilla 同）。 */
export function intersectsAnyPotentialDungeonBounds(rl: number, rt: number, rr: number, rb: number): boolean {
  for (const b of dualDungeonState.potentialBounds) {
    if (rl < b.r && b.l < rr && rt < b.b && b.t < rb) return true;
  }
  return false;
}

/** placeTrap 入口门 1457 形（WorldGen.cs:8865）：
 *  `dualDungeons.Enabled && !AllowTrapGenerationInDungeon && InAnyPotentialDungeonBounds → 拒`。
 *  普通世界 dualDungeons=false → 恒不拒（与 1456 行为一致）。 */
export function placeTrapDualDungeonReject(x: number, y: number): boolean {
  return dualDungeonState.enabled && !dualDungeonTrapWindow.allowTrapGenerationInDungeon && inAnyPotentialDungeonBounds(x, y);
}

// ── 双地牢 genvars 界域/装配套（IIIII88 · 接线壳展开前置件）──

/** CreatePotentialDungeonBounds（DungeonUtils.cs:2106-2133）调用形：
 *  SetupDungeonGenVarVariables :109 传 (leftDungeon, 0.10000000149011612,
 *  0.05000000074505806) —— percentOnTop 缺省 = (worldSurface+10)/maxTilesY
 *  （drunk/underground 特典支→worldSurfaceHigh,本仓入口地下支=drunk 世界沿用原语义);
 *  percentOnBottom = (UnderworldLayer-10)/maxTilesY,UW=maxTilesY-200。
 *  num=percentInMiddle/2；左:num2=(int)(w×edges),num3=(int)(w×(0.5-num))；
 *  右:num2=(int)(w×(0.5+num)),num3=w-(int)(w×edges)。innerBuffer=10（inner 不外泄,
 *  现消费面全 outer）。返回 **Hitbox 终态**四界：SetBounds 经 Left/Top 属性写入带
 *  Clamp[10,max-10]（DungeonBounds.cs:61-85）,CalculateHitbox 再强制 Right>Left/
 *  Bottom>Top——半开矩形 [l,r)×[t,b)，Contains 全走该值。
 *  @param undergroundEntrance drunk/surfaceIsNoSurface 入口地下特典支（percentOnTop 换算）
 */
export function createPotentialDungeonBounds(
  w: number, h: number, worldSurface: number, worldSurfaceHigh: number,
  leftDungeon: boolean, undergroundEntrance: boolean,
): PotentialDungeonBounds {
  const percentInMiddle = 0.10000000149011612;
  const percentOnEdges = 0.05000000074505806;
  const percentOnTop = (undergroundEntrance ? (worldSurfaceHigh + 10.0) : (worldSurface + 10.0)) / h;
  const percentOnBottom = ((h - 200) - 10.0) / h;
  const num = percentInMiddle / 2.0;
  const clamp10 = (v: number, cap: number): number => Math.max(10, Math.min(cap - 10, Math.trunc(v)));
  let l = clamp10(leftDungeon ? w * percentOnEdges : w * (0.5 + num), w);
  let r = clamp10(leftDungeon ? w * (0.5 - num) : w - Math.trunc(w * percentOnEdges), w);
  let t = clamp10(h * percentOnTop, h);
  let b = clamp10(h * percentOnBottom, h);
  // int 化次序：C# 全程 int 运算——num2/num3/t/b 均先 (int) 后入属性（Clamp 保 int）
  if (r <= l) r = l + 1;
  if (b <= t) b = t + 1;
  return { l, t, r, b };
}

/** 把双地牢界域集写回 dualDungeonState.potentialBounds（每地牢一套,序号=列表序）。
 *  Dunes 头（setup 后）与 DungeonPass 头都要刷新——Marble/Granite/Mushroom/
 *  EnchantedSword/LivingTree/Pyramids/FinalCleanup 等消费面在 #20..#105 全程读它。 */
export function refreshDualPotentialBounds(w: number, h: number, worldSurface: number, worldSurfaceHigh: number, undergroundEntrance: boolean): void {
  if (!dualDungeonState.enabled || dualDungeonState.dungeons.length === 0) return;
  dualDungeonState.potentialBounds = dualDungeonState.dungeons.map((d) =>
    createPotentialDungeonBounds(w, h, worldSurface, worldSurfaceHigh, d.side < 0, undergroundEntrance));
}
