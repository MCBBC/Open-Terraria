// 原版生成管线共享状态（对应 WorldGen.GenerateWorld 闭包变量 L4694-4741 + Reset pass 掷的骰子）。
// 105 个 pass 按序读写,顺序不可调换。
import type { SeedFlags } from '../SeedEasterEggs';

export interface GenState {
  // 世界常量（Reset / Terrain pass 输出）
  /** 世界种子 int（translateSeed 产物；DesertHive 的 FastRandom(seed).WithModifier(57005) 消费） */
  seed: number;
  /** 彩蛋种子旗标（SeedEasterEggs.parseSeed 灌入；vanillaTerrain 开头赋值）。
   *  原版经 Main.drunkWorld/anniversaryWorld 等 WorldGen.* 静态消费——pass 内
   *  特殊种子分支读它（如 GemPasses 宝石掷骰的 tenthAnniversary/drunkWorld 门）。 */
  seedFlags: SeedFlags;
  worldSurface: number;   // 平均地表 y（tile）
  worldSurfaceLow: number;
  worldSurfaceHigh: number;
  rockLevel: number;
  rockLevelLow: number;
  rockLevelHigh: number;
  waterLine: number;      // 雪原上方（原版 waterLine ≈ 0.35×h）
  lavaLine: number;       // 地狱顶（原版 ≈ h-200）
  beachDistance: number;
  /** GenVars.worldSurface/rockLayer：Terrain 游走**终值**（double，≠ Main.worldSurface
   *  的 worldSurfaceHigh+25；SandPatches/SmallHoles/Tunnels 等按 GenVars 值掷骰） */
  genWorldSurface: number;
  genRockLayer: number;
  /** GenVars.worldSurfaceHigh 原始 double（≠ floor 版 worldSurfaceHigh；
   *  SmallHoles/DirtLayerCaves/SurfaceCaves 的拒绝判定与首实心行上界用它比较） */
  genWorldSurfaceHigh: number;
  /** Tunnels pass 记录（cs:11743：numTunnels ≤ maxTunnels-1；tunnelX[5] 存档用） */
  tunnelX: number[];
  numTunnels: number;

  // Reset pass 掷的世界级选择
  crimson: boolean;           // 50% 猩红 / 50% 腐化
  oreTiers: { copper: number; iron: number; silver: number; gold: number }; // 含替代 id
  dungeonSide: 1 | -1;        // 地牢在地图哪侧
  dungeonX: number;           // 地牢位置（Reset num4：仅作雪原中心）
  dungeonLocation: number;    // 地牢入口实际位置（Reset 末掷）
  /** 地牢主题（Dunes pass 头 DungeonCrawler.SetupDungeonGenVarVariables 掷 Next(3)，
   *  cs:11542+DungeonCrawler.cs:56——掷骰时点在 Dunes，不在 Dungeon pass；-1=未掷） */
  dungeonTheme: number;
  dungeonY: number;           // 地牢入口地表 Y（DungeonPass 回填；刷怪门槛 dungeonY+40 用）
  dungeonEntX: number;        // 入口门厅可站立点 X（DungeonPass 回填；原版 dungeonX 语义=老头锚）
  /** GenVars.CurrentDungeonGenVars.generatingDungeonPositionX（DungeonCrawler.cs:346 初值
   *  =爬升锚 x，:394 回写=**最高房 InnerBounds.Center.X**）。Pyramids 地牢回避带（cs:15447）
   *  消费的是它，不是 Reset 期 dungeonLocation——两字段混用会把回避带平移数百格
   *  （2026-08-12 金字塔会话 handoff 疑点，已核实修复） */
  generatingDungeonPositionX: number;
  lAltarX: number;             // 神庙祭坛 3×2 左上角（GenVars.lAltarX/Y 语义；-1=未放置）
  lAltarY: number;
  /** GenVars.tLeft/tRight/tTop/tBottom/tRooms（makeTemple 尾 cs:34487-34491 写入：
   *  房间 bbox 四侧各外扩 10；tRooms=房间数）——LihzahrdTemple(15911) 产出、
   *  LihzahrdTemplePart2(17809) 消费（神庙陈设五段的采样域/预算基数）。
   *  0 = 未写（makeTemple 早退；Part2 仍照跑，预算 0×掷骰照掷=原版语义）。 */
  tLeft: number;
  tRight: number;
  tTop: number;
  tBottom: number;
  tRooms: number;
  dungeonEntY: number;        // 入口门厅可站立点 Y
  jungleX: number;            // 丛林（与地牢异侧）
  snowOriginLeft: number;
  snowOriginRight: number;
  beachLeftEnd: number;       // 左海滩右界（Reset L4880 掷，Ocean Sand/Beaches 消费）
  beachRightStart: number;    // 右海滩左界
  // ShellPiles 锚点（GenVars.shellStart{X,Y}{Left,Right}，cs:11183-11186 清零）：
  // Beaches pass 记录（cs:14996/15025/15060/15090），海滩装饰 pass 消费（cs:16402）
  shellStartXLeft: number;
  shellStartYLeft: number;
  shellStartXRight: number;
  shellStartYRight: number;

  // 各 pass 记录给后续 pass 用的区域
  // RandomizeTreeStyle（Reset 掷）：树冠样式边界与样式（finalize 写回 world）
  treeX: number[];
  treeStyle: number[];
  /** 生成的树登记（{x, y=树顶, h}；finalize 写 world.trees 供砍伐整棵判定） */
  genTrees: Array<{ x: number; y: number; h: number }>;
  /** Lakes pass 记录的湖位 x（后续 pass 避让用） */
  lakeX: number[];
  // Mount Caves（pass 7）记录的山丘坐标（pass 34/Webs 消费）
  mCaveX: Int32Array;
  mCaveY: Int32Array;
  numMCaves: number;
  snowMinX: Int32Array | null; // 每行雪原左边界（C# int[]；Ice Biome pass 写）
  snowMaxX: Int32Array | null;
  snowTop: number; snowBottom: number;
  jungleBounds: [number, number] | null; // [minX, maxX]
  evilZones: Array<{ x0: number; x1: number }>;
  undergroundDesert: { x0: number; y0: number; x1: number; y1: number } | null;

  // 结构候选（由早期 pass 排队、后期 pass 消费）
  pyramidSpots: Array<{ x: number; y: number }>;
  floatingIslands: Array<{ x: number; y: number; style: number; isLake: boolean }>;
  /** 微光以太中心（Shimmer pass cs:15301 GenVars.shimmerPosition；-1 = 未生成） */
  shimmerX: number;
  shimmerY: number;
  /** 沙漠蜂巢实际雕刻范围（GenVars.desertHiveHigh/Low/Left/Right，Reset 初始化
   *  cs:11162-11165：High=maxTilesY Low=0 Left=maxTilesX Right=0；PlaceClustersArea
   *  flag2 格逐点收缩 DesertHive.cs:395-397 → UpdateDesertHiveBounds cs:11004）。
   *  消费方：地下沙漠宝箱战利品分层（cs:36084 的 3:4 分位点） */
  desertHiveHigh: number;
  desertHiveLow: number;
  desertHiveLeft: number;
  desertHiveRight: number;
  /** 丛林小屋样式（Reset 掷 cs:11182 Next(5)，原值 0-4；cs:11333-11352 映射
   *  0→119/1→120/2→158/3→175/4→45——JungleShrinePass 复用，不再重掷） */
  jungleHut: number;

  // 宝箱战利品序（AddBuriedChest 全局态,cs:11262/36165/10130）
  hellChestItems: number[] | null; // 每世界乱序 [274,220,112,218,3019]（首只地狱箱时掷）
  hellChestIdx: number;            // 地狱箱主件序游标（成功一只 +1,循环）
  jungleItemIdx: number;           // 常春藤箱主件序游标（JungleItemCount）
  /** pass 59 头连掷四计数(cs:17081-17084,CaveHouse→Underworld→CaveChest→
   *  AdditionalDesert 序)——本仓 pass 拆分后由 rollHouseChestCounts 预掷暂存,
   *  三个消费 pass 读此取值;-1=未预掷(探针直调回退自掷) */
  caveHouseCount: number;
  underworldChestCount: number;
  caveChestCount: number;
  desertHouseCount: number;
  gennedMahoganyWands: boolean;    // 活桃花心木法杖对已给过标记（GenVars.gennedLivingMahoganyWands）
  generatedShadowKey: boolean;     // GenVars.generatedShadowKey（cs:36598：首只必给后 1/3）
  generatedRamRune: boolean;       // GenVars.generatedRamRune（cs:36604：首只必给后 1/8）

  // 表面装饰 pass 共享态（GenVars）
  /** GenVars.orePatchX/numOrePatch/maxOrePatch=50（GenVars.cs:238-242；ResetGenerator 清零 cs:8289）：
   *  SurfaceOreAndStone(18559) 登记，石块段与后续回避用 */
  orePatchX: Int32Array;
  numOrePatch: number;
  /** GenVars.logX/logY（GenVars.cs:250-252，进程级静态默认 0）：FallenLogs(18625) 50% 登记，
   *  Flowers(20592) 消费后置 -1 */
  logX: number;
  logY: number;
  /** GenVars.larvaX/larvaY（蜂巢 pass 登记，BeeLarvaInBeehives cs:21018 消费） */
  larvaX: number[];
  larvaY: number[];
  /** 绿洲登记（GenVars.oasisPosition/oasisWidth/numOasis，GenVars.cs:260-268；上限
   *  maxOasis=20）：Oasis pass（cs:16327）写，CactusPalmTreesAndCoral 头段（cs:21129-
   *  21153）消费——绿洲棕榈 323 / 海滨燕麦 / 绿洲植物 530（本仓库未实现，备案） */
  oasisX: number[];
  oasisY: number[];
  oasisW: number[];
  numOasis: number;

  // ---- GenVars.structures（StructureMap.cs）全局结构互斥 ----
  /** 世界宽高（StructureMap.CanPlace 的越界判定用，cs:28）。 */
  genW: number;
  genH: number;
  /** 已保护结构矩形（StructureMap._protectedStructures，cs:15）。**存扩张后的矩形**
   *  （AddProtectedStructure 先 Inflate(pad) 再入列，cs:85-87），pad 字段仅存档原参。
   *  坐标系：x0/y0 含、x1/y1 **不含**（对齐 C# Rectangle 的 X/Y/Width/Height 语义，
   *  Rectangle.Right = X+Width 为开区间,Intersects 亦按此比较）。 */
  protectedRects: Array<{ x0: number; y0: number; x1: number; y1: number; pad: number }>;
}

/** StructureMap.CanPlace（StructureMap.cs:19-56）的互斥判定移植：
 *  ① 越界拒绝（cs:28：area 超出 [0,w-1]×[0,h-1] 即 false）；
 *  ② 与全部既有保护矩形（各自已含 pad 扩张）按候选 pad 扩张后不相交（cs:32-39）。
 *  ★原版还有第 ③ 步 validTiles 内容扫描（cs:40-53：扩张域内所有 active tile 须在
 *  TileID.Sets.GeneralPlacementTiles 白名单内）——本仓各 pass 已有本地 tile 内容
 *  判定（蜂巢丛林草占比/小屋岩浆回避/神龛坏块扫描等），该扫描暂不移植（备案），
 *  以免双重收紧改变既有行为。 */
export function canPlaceStructure(
  gs: GenState, rect: { x0: number; y0: number; x1: number; y1: number }, pad: number,
): boolean {
  if (rect.x0 < 0 || rect.y0 < 0 || rect.x1 > gs.genW - 1 || rect.y1 > gs.genH - 1) return false;
  const px0 = rect.x0 - pad, py0 = rect.y0 - pad, px1 = rect.x1 + pad, py1 = rect.y1 + pad;
  for (const r of gs.protectedRects) {
    if (px0 < r.x1 && r.x0 < px1 && py0 < r.y1 && r.y0 < py1) return false;
  }
  return true;
}

/** StructureMap.AddProtectedStructure（StructureMap.cs:81-89）：Inflate(pad) 后入列。 */
export function addProtectedStructure(
  gs: GenState, rect: { x0: number; y0: number; x1: number; y1: number }, pad: number,
): void {
  gs.protectedRects.push({
    x0: rect.x0 - pad, y0: rect.y0 - pad,
    x1: rect.x1 + pad, y1: rect.y1 + pad,
    pad,
  });
}

export function newGenState(w: number, h: number): GenState {
  return {
    seed: 0,
    seedFlags: {},
    worldSurface: Math.floor(h * 0.3), worldSurfaceLow: 0, worldSurfaceHigh: 0,
    rockLevel: Math.floor(h * 0.42), rockLevelLow: 0, rockLevelHigh: 0,
    waterLine: Math.floor(h * 0.35), lavaLine: h - 200,
    beachDistance: 380,  // 原版 WorldGen.beachDistance = 380（cs:4102 readonly 常量，不随尺寸缩放；曾误用 w*0.06=252 → 大理石/花岗岩采样重掷范围分叉）
    genWorldSurface: 0, genRockLayer: 0, genWorldSurfaceHigh: 0,
    tunnelX: new Array(50).fill(0), numTunnels: 0,
    crimson: false,
    oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 },
    dungeonSide: 1, dungeonX: 0, dungeonLocation: 0, dungeonTheme: -1, dungeonY: 0, dungeonEntX: 0, dungeonEntY: 0, generatingDungeonPositionX: 0, lAltarX: -1, lAltarY: -1, jungleX: 0,
    tLeft: 0, tRight: 0, tTop: 0, tBottom: 0, tRooms: 0,    // C# GenVars 静态 int 默认 0
    snowOriginLeft: 0, snowOriginRight: 0,
    beachLeftEnd: 0, beachRightStart: 0,
    shellStartXLeft: 0, shellStartYLeft: 0, shellStartXRight: 0, shellStartYRight: 0,
    treeX: [0, 0, 0], treeStyle: [0, 0, 0, 0], genTrees: [], lakeX: [],
    mCaveX: new Int32Array(1024), mCaveY: new Int32Array(1024), numMCaves: 0,
    snowMinX: null, snowMaxX: null, snowTop: 0, snowBottom: 0,
    jungleBounds: null,
    evilZones: [],
    undergroundDesert: null,
    pyramidSpots: [],
    floatingIslands: [],
    shimmerX: -1, shimmerY: -1,
    desertHiveHigh: h, desertHiveLow: 0, desertHiveLeft: w, desertHiveRight: 0,
    jungleHut: 0,
    hellChestItems: null, hellChestIdx: 0, jungleItemIdx: 0, gennedMahoganyWands: false,
    caveHouseCount: -1, underworldChestCount: -1, caveChestCount: -1, desertHouseCount: -1,
    generatedShadowKey: false, generatedRamRune: false,
    orePatchX: new Int32Array(50), numOrePatch: 0,            // ResetGenerator 清零（cs:8289）
    logX: 0, logY: 0,                                          // 进程级静态默认 0（GenVars.cs:250）
    larvaX: [], larvaY: [],                                    // BeeLarva pass（cs:21018）消费
    oasisX: [], oasisY: [], oasisW: [], numOasis: 0,           // Oasis pass（cs:16327）登记
    genW: w, genH: h,                                           // StructureMap 越界判定（StructureMap.cs:28）
    protectedRects: [],                                         // GenVars.structures._protectedStructures
  };
}
