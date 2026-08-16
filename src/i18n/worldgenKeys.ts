// 世界生成 pass 名（WorldGen.ts 的 pass.name）→ 原版进度文案键。
// 权威来源 = Terarria1456 WorldGen.cs 各 AddGenerationPass delegate 内
// `progress.Message = Lang.gen[N]`(2026-08-13 全量 awk 配对提取,勿凭记忆改)。
// 中文文案 = l10n 的 LegacyWorldGen.<id> / WorldGeneration.<Key>。
export const worldgenProgressKey: Record<string, number> = {
  // ---- Terrain 族 ----
  '原版地形': 0,    // TerrainPass.cs:59 "正在生成世界地形"
  '沙丘': 1,        // DunesAndPyramidLocations :11551 "正在添加沙子"
  '洞穴': 9,        // 槽合并 3/4/5/7/8/9/10,主体 RockLayerCaves "正在生成大洞穴"
  // ---- 生物群系槽(合并 16-34 多 pass,显示代表;子 pass 文本见 vanillaBiomes 注释)----
  '生物群系': 11,   // JunglePass 代表"正在生成丛林"(内含 56 雪/78 沙漠化/13 蘑菇/80 大理石/81 花岗岩/12 浮空岛/16 矿石/18 地狱/20 邪恶/19 水体/22 沙滩/23 宝石/70 神庙/71 蜂巢/90 海洋洞窟)
  '液体': 19,       // Lakes :14617 "正在添加水体"(★曾误配 27)
  '引力沙': 24,     // GravitatingSandCleanup :15202 "沙子正在沉淀"
  '清理': 25,       // DirtWallCleanup :15320 "正在清理土背景"
  '结构': 76,       // MicroBiomes 等 :21789 "正在生成建筑物"
  '水体沉降': 27,   // SettleLiquids :16219 "正在安置液体"
  '海滩装饰': 22,   // BeachesAndOceanCleanup :14958 "正在创建沙滩"
  '半砖平滑': 60,   // SmoothWorld :16509 "正在让世界变得更平顺"
  '瀑布唇缘': 69,   // Waterfalls :16701 "正在创建瀑布"
  '薄冰': 56,       // 无原版文本 → 借"正在添加雪"
  '洞穴墙变体': 79, // CaveWallVariety :16792 "正在风化洞穴"
  '生命水晶': 28,   // LifeCrystals :16863 "正在放置生命水晶"
  '雕像宝箱': 30,   // 合并槽代表=UndergroundHousesAndBuriedChests :17075 "正在隐藏宝藏"(内含 16947 雕像/17226 地表箱/17308 常春藤箱/17343 水下箱/17455 蜘蛛洞)
  '宝石洞': 64,     // GemCaves :17532(原版复用 SpiderCaves 文案)"正在扩大蜘蛛洞"
  '苔藓': 61,       // MossAndMossCaves :17583 "青苔化"
  '神庙陈设': 70,   // LihzahrdTemplePart2 :17809 无 progress.Message → 借神庙文案(Lang.gen[70])
  '洞穴墙': 63,     // CaveWallsInEnclosedSpaces :17826 "正在建造洞壁"
  '地下丛林树': 83, // UndergroundJungleTrees :17957 "正在种红木"(2026-08-16 补缺 pass)
  '瓦罐': 35,       // PotsGraveyardsAndBoulderPiles :18112 "正在放置可破坏物"
  '地狱熔炉': 36,   // Hellforges :18302 "正在放置地狱熔炉"
  '矿骨堆': 89,     // Piles :18904 "正在放置物体"
  '表面': 37,       // SpreadingGrass… :18353 "正在铺草"(★曾误配 89)
  '地表矿石': 16,   // OresAndShinies :13237 "正在添加闪亮之物"
  '倒木水景': 85,   // FallenLogsAndWaterFeatures :18636 "正在伐木"
  '地表装饰': 34,   // Traps :18775 "正在放置机关"(★曾误配 37)
  '出生点': 0,      // 无原版文本 → 借地形
  '草墙': 3,        // 借 DirtWallBackgrounds "正在向土块后面放置土背景"
  '向日葵': 39,     // SunflowersPart2 :20047 "正在种向日葵"
  '栽树': 40,       // Trees :20089 "正在种树"
  '炼金草药': 41,   // AlchemyHerbs :20118 "正在种植草药"
  '染料植物': 42,   // 借 GrassPlants… "正在种植地表植物"
  '蛛网蜂巢': 17,   // Webs :13663 "正在添加蛛丝"
  '地表植物': 42,   // GrassPlantsEvilPlantsAndPumpkins :20213 "正在种植地表植物"
  '丛林植物P2': 83, // UndergroundJungleTrees :17957 "正在种红木"
  '藤蔓': 43,       // Vines 族(配对序推)"正在放置藤蔓"
  '地表花': 44,     // Flowers :20342 "正在种花"
  '地表蘑菇': 45,   // Mushrooms :20596 "正在种蘑菇"
  '宝石系统': 23,   // Gems :15241 "正在放置宝石"
  '丛林墙': 77,     // MudCavesToJungleGrass :12503 "正在添加更多草"
  '蜂巢幼虫': 71,   // Beehives :16009 "正在创建黄蜂巢"
  '仙人掌珊瑚': 38, // CactusPalmTreesAndCoral :21119 "正在种仙人掌"
  '瓦片清理': 84,   // TileCleanup :21332 "清理"(★旧键'清浮空'随槽改名)
  '蜥蜴祭坛': 26,   // DemonAndCrimsonAltars :15832 "正在放置祭坛"
  '微群系': 76,     // MicroBiomes(原版共用 76)"正在生成建筑物"
  '水生植物': 88,   // LilypadsCattailsBambooAndSeaweed :22135 "正在种水生植物"
  '断线陷阱清理': 82, // BrokenTrapCleanup :22287 "正在解除坏掉的机关"
  '终清理': 87,     // FinalCleanup :22656(86 快速清理/87 最终润饰,取 87)
  '完成': 87,       // "正在对世界做最后的润饰"
  // ---- 旧别名(槽改名历史)----
  '地形': 0, '海滩': 22, '矿石': 16, '清浮空': 84, '地狱': 18,
  '地狱屋': 30, '地狱箱': 33,   // R 批(2026-08-16) 撤槽:地狱屋并入「生物群系」(Underworld 尾)、地狱箱并入「雕像宝箱」
};

/** 无 LegacyWorldGen 数字键的 pass → 完整 l10n 键(1.4 新增 pass 文案,
 *  原 WorldGeneration.* 键;微光/沙上清水原版无文本,借位显示) */
export const worldgenProgressStringKey: Record<string, string> = {
  '绿洲': 'WorldGeneration.Oasis',
  '长苔藓': 'WorldGeneration.LongMoss',
  '钟乳石宝石树': 'WorldGeneration.Speleothems',
  '浮空岛屋': 'WorldGeneration.FloatingIslandHouses',  // FloatingIslandHouses :17975 原文
  '快清理': 'WorldGeneration.QuickCleanup',  // QuickCleanup :17991 原文(2026-08-16 补缺 pass)
  '微光': 'LegacyWorldGen.26',    // 1.4.4 新 pass 无文本 → 借祭坛位
  '沙上清水': 'LegacyWorldGen.24', // RemoveSurfaceWaterAboveSand 无 Message → 借沙沉淀
};
