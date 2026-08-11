// 原版生成管线共享状态（对应 WorldGen.GenerateWorld 闭包变量 L4694-4741 + Reset pass 掷的骰子）。
// 105 个 pass 按序读写,顺序不可调换。
export interface GenState {
  // 世界常量（Reset / Terrain pass 输出）
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
  /** Tunnels pass 记录（cs:11743：numTunnels ≤ maxTunnels-1；tunnelX[5] 存档用） */
  tunnelX: number[];
  numTunnels: number;

  // Reset pass 掷的世界级选择
  crimson: boolean;           // 50% 猩红 / 50% 腐化
  oreTiers: { copper: number; iron: number; silver: number; gold: number }; // 含替代 id
  dungeonSide: 1 | -1;        // 地牢在地图哪侧
  dungeonX: number;           // 地牢位置（Reset num4：仅作雪原中心）
  dungeonLocation: number;    // 地牢入口实际位置（Reset 末掷）
  dungeonY: number;           // 地牢入口地表 Y（DungeonPass 回填；刷怪门槛 dungeonY+40 用）
  dungeonEntX: number;        // 入口门厅可站立点 X（DungeonPass 回填；原版 dungeonX 语义=老头锚）
  dungeonEntY: number;        // 入口门厅可站立点 Y
  jungleX: number;            // 丛林（与地牢异侧）
  snowOriginLeft: number;
  snowOriginRight: number;
  beachLeftEnd: number;       // 左海滩右界（Reset L4880 掷，Ocean Sand/Beaches 消费）
  beachRightStart: number;    // 右海滩左界

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

  // 宝箱战利品序（AddBuriedChest 全局态,cs:11262/36165/10130）
  hellChestItems: number[] | null; // 每世界乱序 [274,220,112,218,3019]（首只地狱箱时掷）
  hellChestIdx: number;            // 地狱箱主件序游标（成功一只 +1,循环）
  jungleItemIdx: number;           // 常春藤箱主件序游标（JungleItemCount）
  gennedMahoganyWands: boolean;    // 活桃花心木法杖对已给过标记（GenVars.gennedLivingMahoganyWands）
}

export function newGenState(w: number, h: number): GenState {
  return {
    worldSurface: Math.floor(h * 0.3), worldSurfaceLow: 0, worldSurfaceHigh: 0,
    rockLevel: Math.floor(h * 0.42), rockLevelLow: 0, rockLevelHigh: 0,
    waterLine: Math.floor(h * 0.35), lavaLine: h - 200,
    beachDistance: Math.max(24, Math.floor(w * 0.06)),
    genWorldSurface: 0, genRockLayer: 0,
    tunnelX: new Array(50).fill(0), numTunnels: 0,
    crimson: false,
    oreTiers: { copper: 0, iron: 0, silver: 0, gold: 0 },
    dungeonSide: 1, dungeonX: 0, dungeonLocation: 0, dungeonY: 0, dungeonEntX: 0, dungeonEntY: 0, jungleX: 0,
    snowOriginLeft: 0, snowOriginRight: 0,
    beachLeftEnd: 0, beachRightStart: 0,
    treeX: [0, 0, 0], treeStyle: [0, 0, 0, 0], genTrees: [], lakeX: [],
    mCaveX: new Int32Array(1024), mCaveY: new Int32Array(1024), numMCaves: 0,
    snowMinX: null, snowMaxX: null, snowTop: 0, snowBottom: 0,
    jungleBounds: null,
    evilZones: [],
    undergroundDesert: null,
    pyramidSpots: [],
    floatingIslands: [],
    shimmerX: -1, shimmerY: -1,
    hellChestItems: null, hellChestIdx: 0, jungleItemIdx: 0, gennedMahoganyWands: false,
  };
}
