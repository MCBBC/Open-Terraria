// 程序化世界生成管线：地形 → 洞穴 → 矿石 → 液体 → 表面 → 结构
// 分帧执行以显示进度。纯函数式 pass，每个 pass 直接写 TileStore（生成期用 silent 写入）。
import { RNG, translateSeed } from '../../core/rng';
import type { TileStore } from '../TileStore';
import { T, TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import { World, worldSizeFor, type WorldSize } from '../World';
import { randomEpitaph } from '../../i18n/RandomText';   // 墓园 pass 碑文（WorldGen.cs:25161）

/** 尺寸档 → 原版 maxTilesX/Y（UIWorldCreation 三档 ↔ WorldGen.cs:11163 的 W/H 表）。
 *  尺寸敏感分支索引：RandomizeTreeStyle(:8082)/RandomizeCaveBackgrounds(:8157)
 *  三段分支 + TerrainPass num10 仅小世界 +0.02（cs:131）。 */
export const SIZE_DIMS: Readonly<Record<WorldSize, { width: number; height: number }>> = {
  0: { width: 4200, height: 1200 },
  1: { width: 6400, height: 1800 },
  2: { width: 8400, height: 2400 },
};

export interface GenConfig {
  /** 世界尺寸档（原版 UI 三档，GetWorldSize 语义）：给出时 width/height 由 size 派生
   *  （对齐原版 UIWorldCreation——UI 只选尺寸档，W/H 是派生量）。缺省用显式 width/height。 */
  size?: WorldSize;
  width: number;
  height: number;
  seedText: string;
  name?: string;
  /** 邪恶群系：-1 随机（默认） 0 腐化 1 猩红（UIWorldCreation 对应原版 WorldGenParam_Evil） */
  evil?: -1 | 0 | 1;
  /** 彩蛋种子旗标直注位（S0-1 seed/flags 解耦，对齐原版 WorldFileData 与
   *  WorldGenerationOptions 解耦语义）：显式传入时**覆盖** parseSeed(seedText) 派生——
   *  使「数字种子+任意旗标组合」可表达（原版 serverconfig `seed_<name>=1` + 普通
   *  -seed 的等价通道，彩蛋种子金标对拍的唯一确定性入口）。缺省（不传）= 现行为
   *  （从 seedText 单源派生）。旗标语义见 SeedEasterEggs.ts。 */
  seedFlags?: SeedFlags;
  /** 每 pass 完成后回调部分世界（生成期实时地图预览用；无需等 finalize） */
  onWorldPartial?: (world: World, passIndex: number, passName: string) => void;
}

export interface Pass {
  name: string;
  /** 允许 async（如中途水体沉降带 yield），generateWorld 会 await */
  run: (ctx: GenCtx, report: (p: number) => void) => void | Promise<void>;
}

export interface GenCtx {
  world: World;
  store: World['store'];
  rng: RNG;
  surface: Float32Array;   // 每列地表高度（tile y）
  cfg: GenConfig;
}

/** WorldFileData.TryApplyingCopiedSeed（cs:232-289）dotted 配方路由 1:1：
 *  `<size>.<gameMode+1>.<evil+1>.<optionBits>.<secrets>|<base>`——前四段为
 *  尺寸/模式/邪恶/生成选项位掩码，明文秘种子段在前、数字底种在后；
 *  **世界 RNG = TranslateSeed(明文段+底种)**（不含 dotted 前缀!）。
 *  optionBits 位序 seedOptionsInOrder（:71-82）：bit0=Drunk、1=NTB、2=FTW、
 *  3=Anniv、4=DontStarve、5=Remix、6=NoTraps、7=Everything、8=Skyblock。
 *  非 dotted 输入原样返回 null（零扰动）。 */
export function tryApplyingCopiedSeed(input: string): {
  effectiveSeedText: string; size?: 0 | 1 | 2; evil?: -1 | 0 | 1; flags: SeedFlags;
} | null {
  const m = /^([1-3])\.([1-4])\.([12])\.(\d+)\.(.+)$/.exec(String(input ?? '').trim());
  if (!m) return null;
  const FLAG_BITS = ['drunkWorld', 'notTheBees', 'getGoodWorld', 'tenthAnniversary',
    'dontStarve', 'remix', 'noTraps', 'everything', 'skyblock'] as const;
  const flags: SeedFlags = {};
  const bits = Number(m[4]);
  for (let i = 0; i < FLAG_BITS.length; i++) {
    if ((bits >> i) & 1) (flags as Record<string, boolean>)[FLAG_BITS[i]!] = true;
  }
  Object.assign(flags, parseSeedChain(m[5]!).flags);
  return {
    effectiveSeedText: m[5]!,
    size: (Number(m[1]) - 1) as 0 | 1 | 2,
    evil: (Number(m[3]) - 1) as -1 | 0 | 1,
    flags,
  };
}

/** 生成一个世界。passes 按序执行，每帧尽量做完一个 pass 后让出主线程。 */
export async function generateWorld(cfg: GenConfig, onProgress?: (label: string, p: number) => void): Promise<World> {
  // ★IIIII88：dotted 秘种子配方路由先行（TryApplyingCopiedSeed cs:232-289）——
  //   命中时 size/evil 由配方段派生、旗标=配方位掩码+明文秘种子、世界种子按
  //   「明文|底种」翻译。缺省路径全部保持现行为。
  const copied = tryApplyingCopiedSeed(cfg.seedText);
  const effSeedText = copied ? copied.effectiveSeedText : (cfg.seedText || String(Date.now()));
  // 种子解析 1:1 原版 WorldFileData.TranslateSeed（数字→Abs；非数字→Crc32），
  // 生成入口构造 Main.rand = new UnifiedRandom(seed)（WorldGen.cs:11159）。
  // 位级金标见 tests/unified-random.test.ts。
  const seed = translateSeed(effSeedText);
  // size 档派生 W/H（UI 语义）；显式 width/height 仍可用（探针/测试直给）；
  // ★dotted 配方命中且调用方未显式给 size 时按配方段派生
  const effSize = cfg.size !== undefined ? cfg.size : copied?.size;
  const effEvil = cfg.evil !== undefined && cfg.evil !== -1 ? cfg.evil : (copied ? copied.evil : cfg.evil);
  const { width, height } = effSize !== undefined ? SIZE_DIMS[effSize] : cfg;
  const world = new World(width, height, seed, cfg.name ?? '新世界');
  // 旗标解析：cfg.seedFlags 直注优先（S0-1 解耦），次选 dotted 配方位，缺省回退 seedText 派生。
  // 运行时消费（血月 1/6 十周年 / drunk 黎明翻转等）
  world.seedFlags = cfg.seedFlags ?? copied?.flags ?? parseSeedChain(effSeedText).flags;
  const rng = new RNG(seed);
  // 注：曾在此 createNoise2D(() => rng.next())——simplex 构造即消耗 RNG 流
  //（建置换表 256+ 次），而全管线无消费者。种子等价必须零预耗，已删除。
  const ctx: GenCtx = {
    world, store: world.store, rng,
    surface: new Float32Array(width),
    // ★IIIII88：把 routed 结果回灌 ctx.cfg——下游（vanillaTerrain 的 GenState/Reset 等）
    //   一律消费 effectiveSeedText/有效 evil；seedFlags 单源化（copied 或调用方直注）。
    cfg: {
      ...cfg, width, height, evil: effEvil,
      seedText: effSeedText,
      ...(copied && !cfg.seedFlags ? { seedFlags: copied.flags } : {}),
    },
  };

  // 单一 vanilla 管线。原 lgcTerrain=false 的 fbm 回退（terrainPass/cavePass/
  // floatCleanupPass 分支）是无 UI 入口的死代码且 hellPass 处会空指针崩溃，已删除。
  // pass 顺序对齐原版 AddGenerationPass 注册序（WorldGen.cs:11525-22660，
  // 权威对照表见 docs/worldgen/vanilla-pass-alignment.md）：
  //   地形1 洞穴(3/7-14e) 海滩(33/34) 生物群系(15-64,含地狱屋=Underworld 尾 13893)
  //   矿石(27) 液体(31) 清理(37) 结构(15426-16059,止于丛林神龛) 半砖平滑(57) 瀑布(58)
  //   生命水晶(55) 雕像宝箱(16947-17455 块) 宝石洞 苔藓 神庙陈设(17809) 洞穴墙(63)
  //   浮空岛屋(17971) 瓦罐(75) 矿骨堆(81) 表面(77/86/90)
  //   地表装饰(76 traps/85) 出生点(19605) 海滩装饰(56)
  const passes: Pass[] = [
    { name: '原版地形', run: vanillaTerrain },
    // 原版注册序 Dunes(cs:11540) < Ocean Sand(cs:11603):沙丘先于海洋沙/海滩塑造,
    // 并同时掷金字塔候选(cs:11591-11599 → gs.pyramidSpots)
    { name: '沙丘', run: vanillaDunes },
    { name: '洞穴', run: vanillaCaves },
    // 海滩(33 MountainCaveOpenings+34 Beaches)与矿石(26 OresAndShinies)原在此处
    // 各占一槽——已按 1456 注册序并入 vanillaBiomes（分别在 Dungeon(32) 后与 Silt(25) 后）。
    { name: '生物群系', run: vanillaBiomes },
    // 原版 1456 注册序:OresAndShinies(13233) → Lakes(14613) → DirtWallCleanup(15310)
    // → SettleLiquids(16215) → SmoothWorld(16507) → Waterfalls(16697) → LifeCrystals(16847)。
    // 生命水晶曾排在湖泊之前——湖泊 pass 挖湖盆会掏空已放水晶的脚下 → 凭空悬浮
    // （唯一硬约束:水晶在 Lakes 之后;平滑/瀑布在其前的原版序可完整对齐）
    { name: '液体', run: vanillaLakes },
    // 引力沙（原版 GravitatingSandCleanup cs:15198，注册位 Lakes(14613) < 本 pass <
    // OceanCaves(15228) < Shimmer(15256)）：地表内悬空 Falling 系方块空腔落定。
    // 纯扫描零掷骰。2026-08-12 前整 pass 缺失——海岸/沙滩带生成残留的浮空沙无人回收。
    // 海洋洞窟（OceanCaves cs:15228）2026-08-16 前在 vanillaBiomes 尾执行（早于引力沙
    // =清点表偏差①）：引力沙自底向上扫描会作用于已被 oceanCave 削过的海岸剖面——
    // 本批归位到引力沙之后（每 pass 重播种子,RNG 流无移位,仅状态先后修正）
    { name: '引力沙', run: gravitatingSandSlot },
    // 原版注册序 Lakes(14613) < Shimmer(15256) < DirtWallCleanup(15310)：
    // 微光以太在此挖洞灌液，清理/沉降在其后（Slush 31 已随 Lakes 入"液体"槽）
    { name: '微光', run: vanillaShimmer },
    { name: '清理', run: vanillaCleanup },
    // 结构段（原版注册序 DirtWallCleanup(15310) < Pyramids(15426) < DirtRockWallRunner(15536)
    // < LivingTrees(15551) < ... < JungleShrines(16059)）——2026-08-13 前结构尾内嵌
    // vanillaBiomes（微光/清理之前执行）= 顺序偏差，拆出为独立槽插在「清理」之后；
    // DirtRockWallRunner 同批补缺。R 批(2026-08-16) 起止于 JungleShrines：雕像+箱族块
    // 后移「生命水晶」后、神庙陈设/浮空岛屋各归原版注册位。清单见 vanillaStructures
    { name: '结构', run: vanillaStructures },
    // 原版 SettleLiquids（cs:16215）：Lakes 之后、SmoothWorld/Waterfalls 之前的中途
    // 沉降——瀑布唇缘/半砖平滑直接读 st.liquid 判定，必须在静止水面数据上跑
    // （此前沉降只在管线末尾 → 唇缘基于未沉降水体漂移）。
    // 原版 SettleLiquidsPart2（cs:21051，管线尾二次沉降）由 generateWorld 之后
    // worker/Game 的 settleWorldLiquids('gen') 承担。
    { name: '水体沉降', run: (ctx) => liquidSettlePass(ctx, true) },
    // 沙上清水（原版 RemoveSurfaceWaterAboveSand cs:16295-16326，注册序
    // SettleLiquids(16215) < 本 pass < Oasis(16327) < ShellPiles(16385)）：
    // 地表沙柱上方的悬空水清除——零掷骰纯扫描（2026-08-12 前整 pass 缺失）
    { name: '沙上清水', run: surfaceWaterAboveSandPass },
    // 绿洲（原版 Oasis cs:16327，注册序 RemoveSurfaceWaterAboveSand(16295) < 本 pass
    // < ShellPiles(16385)）：PlaceOasis 挖塘+岸线，登记 gs.oasisX/Y/W（pass 98 头部
    // 的绿洲棕榈/燕麦/植物 530 消费段已落地——StructuresPass cs:21129-21163 段）
    { name: '绿洲', run: oasisPass },
    // 海滩装饰（原版 ShellPiles cs:16393-16501）：贝壳堆。原版注册序
    // SettleLiquids(16215) < ShellPiles(16385) < SmoothWorld(16507)——必须在半砖平滑
    // 之前，否则堆出的散沙/孤立单格无人回收（2026-08-12 前排管线末尾=海里单体沙来源之一）
    { name: '海滩装饰', run: vanillaBeachDecor },
    // 原版 "Smooth World"(cs:16507)+"Waterfalls"(cs:16697)：地表凸起与水边唇缘砸半砖
    // （半砖 = 原版水浸润/瀑布触发的核心，见 HalfBrickPass.ts）
    { name: '半砖平滑', run: halfBrickSmoothPass },
    { name: '瀑布唇缘', run: waterfallLipPass },
    // 薄冰（原版 FragileIceOverIceBiomeWater cs:16756-16785 + MakeWateryIceThing
    // cs:80206，注册序 Waterfalls(16697) < 本 pass < CaveWallVariety(16786)）：
    // 冰原水面上铺 BreakableIce 162——零掷骰（2026-08-12 前整 pass 缺失）
    { name: '薄冰', run: fragileIcePass },
    // 洞穴墙变体斑（原版 CaveWallVariety cs:16786，注册序 Waterfalls(16697) <
    // 本 pass < LifeCrystals(16847)）：泥土墙 196-199/丛林 204-207/石墙 208-215
    // —— CaveWalls 主 pass（苔藓槽后）的前置墙基之一
    { name: '洞穴墙变体', run: caveWallVarietyPass },
    { name: '生命水晶', run: vanillaLifeCrystals },
    // 雕像+箱族块（Statues 16947 → #58 四循环合一 → SurfaceChests 17226 →
    // JungleChests 17308 → UnderwaterChests+WaterChests 17343 → SpiderCaves 17455）
    // ——R 批(2026-08-16) 前内嵌「结构」槽尾（提前约 900 行）,整体后移至
    // LifeCrystals(16847) 之后归位;#58 头尾 226/162/225/190 四翻接线,原「地狱箱」
    // 槽并入循环②（地狱屋已前移「生物群系」槽 Underworld 尾 cs:13893）
    { name: '雕像宝箱', run: statuesChestsPass },
    // 苔藓（原版 MossAndMossCaves cs:17573，注册序 BuriedChests 17066 < 本 pass <
    // LihzahrdTemplePart2(17809)）：霓虹苔藓洞 + 苔藓斑/散点/地狱氦苔藓——洞穴系
    // 全部定型后只做石→苔藓点状替换；长苔藓 pass（20915）的上游，缺它则全图 0 长苔藓
    // 宝石洞（原版 GemCaves cs:17528，注册序 SpiderCaves(17455) < 本 pass <
    // Moss(17573) < CaveWalls(17819)）：必须先于 CaveWalls——Spread.Gem 遇墙不扩散，
    // 先刷墙会压制宝石洞；此前挤在"宝石系统"槽（Moss 后近 30 槽）= 顺序偏差，已归位
    { name: '宝石洞', run: gemCavesPass },
    { name: '苔藓', run: vanillaMoss },
    // 神庙陈设（原版 LihzahrdTemplePart2 cs:17809，注册序 Moss(17573) < 本 pass <
    // CaveWalls(17819)）：templePart2 五段（陷阱→箱→雕像→家具→挂饰）——曾内嵌
    // runTemplePass（执行位≈15911,提前约 1900 行）,R 批(2026-08-16) 拆出归位;
    // 采样域经 gs.tLeft/tRight/tTop/tBottom/tRooms 跨槽传递
    { name: '神庙陈设', run: templePart2Slot },
    // 洞穴自然墙（原版 CaveWallsInEnclosedSpaces cs:17819，注册序 Moss(17573) <
    // 本 pass < UndergroundJungleTrees(17952)）：封闭腔刷洞穴背景墙 + 丛林泥墙段。
    // 地下自然墙唯二来源之一（另一=DirtWallBackgrounds 近地表）——缺它全洞穴无墙,
    // 暴露晶簇(178,贴墙装饰)悬空(2026-08-12 用户标注)
    { name: '洞穴墙', run: caveWallsPass },
    // 地下丛林树（原版 UndergroundJungleTrees cs:17952-17970，注册序 CaveWalls(17819)
    // < 本 pass < FloatingIslandHouses(17971)）：全列×[worldSurface-1,h-350) 每格
    // Next(10)==0 门 → GrowUndergroundTree（cs:31007,丛林草基座的地下树）。2026-08-16
    // 前整 pass 缺失（清点表 #68 ❌）；pass 头 tileSolid[379]=true（cs:17956,
    // SpiderCaves cs:17459 翻 false 的还原位）
    { name: '地下丛林树', run: undergroundJungleTreesSlot },
    // 浮空岛屋（原版 FloatingIslandHouses cs:17971，注册序 UndergroundJungleTrees
    // (17952) < 本 pass < QuickCleanup(17987)）：日光板房屋
    // (Skyware 门+箱+桌椅)——曾内嵌「结构」槽尾（提前约 2000 行）,R 批归位
    { name: '浮空岛屋', run: islandHouseSlot },
    // 快清理（原版 QuickCleanup cs:17987-18107，注册序 FloatingIslandHouses(17971) <
    // 本 pass < Pots(18108)）：五子段常态全跑——海洋液体转水/海洋表面沙下填土
    // （Next(4,7) 在 for 条件内逐判定掷）/沙岩墙187·硬化沙墙216 杂块转硬化沙+
    // 液体二分/表面悬空沙墙补齐（内层 break bug-for-bug）/SaveSlopes 坡面归一。
    // 2026-08-16 前整 pass 缺失（清点表 #70 ❌）；头尾 tileSolid 137/130 翻转接线
    { name: '快清理', run: quickCleanupSlot },
    // 瓦罐（原版 PotsGraveyardsAndBoulderPiles cs:18108,注册序 QuickCleanup(17987) <
    // 本 pass < Hellforges(18298)）——曾排在熔炉后=与原版对调,2026-08-13 归位
    { name: '瓦罐', run: potPass },
    // 地狱熔炉(原版 Hellforges,cs:18298:w/200 个,墙 13/14 门禁)
    { name: '地狱熔炉', run: hellforgesPass },
    // 表面（legacy 外壳：铺草=原版 pass 77 SpreadingGrass；内嵌 vanilla TreePass
    // =原版 pass 82 Trees；AlchemyHerbs(20109)+GrassPlants(20209)）
    { name: '表面', run: surfacePass },
    // 地表矿石（原版 SurfaceOreAndStone cs:18559）：OrePatch/StonePatch 需先有草面
    //（SpreadingGrass 18349 < 本 pass）——放在"表面"之后、"地表装饰"(内含 Traps 18769)之前
    { name: '地表矿石', run: vanillaSurfaceOre },
    // 倒木（原版 FallenLogsAndWaterFeatures cs:18625，仅倒木段）：登记 gs.logX/logY
    // 给 Flowers(20592) 消费
    { name: '倒木水景', run: vanillaFallenLogs },
    { name: '地表装饰', run: vanillaSurfaceDecor },
    // 矿骨堆（原版 Piles cs:18900-19599 七子段，注册序 Traps(18769) < 本 pass <
    // SpawnPoint(19605)）——2026-08-16 前位于「地狱熔炉」后（提前 4 个注册位，
    // 清点表偏差②：Piles 的地面门禁会作用于 SpreadingGrass 段①群系转换**之前**，
    // 与原版相反），本批归位到 Traps 槽（「地表装饰」）之后
    { name: '矿骨堆', run: pilesPass },
    // 出生点（原版 SpawnPoint cs:19605，实现 cs:19605-19724）：中心随机扩张采样自然
    // 地表 + 上空清理盒——注册序 Piles(18900) 之后的本 pass < 草墙(19734)。曾内嵌
    // finalize 尾（全部 pass 之后执行）,2026-08-13 归位（清零批）
    { name: '出生点', run: spawnPointPass },
    // 草墙（原版 SurfaceDirtWallsToGrassWalls cs:19734，注册序 Piles 18900 之后的
    // SpawnPoint 19605 < 本 pass < DyePlants 20126）：地表泥土墙洞 → 草墙 63/花墙 65——
    // Vines pass 花藤 382 的上游（藤头墙 ∈ {63,65,66,68} 才出花藤）
    { name: '草墙', run: vanillaGrassWall },
    // ★IIIIIII6：起始镇民（原版 SpawnStarterNPCs cs:19848-20068，注册序 GrassWalls(19734) <
    //  本 pass < SunflowersPart2(20043)）：十周年世界播 5 名初始镇民（Andrew/Whitney/
    //  Yorai/Amanda/白兔掷名）+ GenuineParty 开局派对基态（Reset 域 cs:11156-11163 在 Game
    //  消费端落地）。非十周年零副作用早退；决定链与掷流宽度考证见 StarterNPCsPass.ts 头。
    //  此前整 pass 缺失、备案跳过（2026-08-13 口径）
    { name: '起始镇民', run: starterNpcsSlot },
    // 向日葵（原版 SunflowersPart2 cs:20043-20084）：w*0.002 次带状扫描，草 2 上方
    // 空气处放 2×4 向日葵——普通种子向日葵唯一生成来源（SpreadingGrass 名义上的
    // Sunflowers 段实为 remix 专属 18460-18559）。注册序：GrassWalls(19734) →
    // SpawnStarterNPCs(19830，★IIIIIII6 已实现=「起始镇民」槽，见上) → 本 pass →
    // Trees(20085)。2026-08-13 前整 pass 缺失
    { name: '向日葵', run: sunflowersSlot },
    // 栽树（原版 Planting Trees cs:20085，注册序 GrassWall(19734) < 本 pass <
    // AlchemyHerbs(20109)）——曾内嵌"表面"槽（地表矿石/倒木/陷阱/矿骨堆/草墙之前）,
    // 2026-08-13 归位（Batch D）
    { name: '栽树', run: treesPass },
    // 炼金草药（原版 AlchemyHerbs cs:20109，Trees 之后、DyePlants(20126) 之前）
    { name: '炼金草药', run: alchemyHerbsSlot },
    // 染料植物（原版 DyePlants cs:20126）：plantDye + MatureTheHerbPlants +
    // GrowGlowTulips(656) + PlaceChilletEggs(752)，位于 AlchemyHerbs(20109) 之后
    { name: '染料植物', run: vanillaDyePlants },
    // 蛛网蜂巢（原版 WebsInSpiderCavesAndHoney cs:20140，注册序 DyePlants(20126) <
    // 本 pass < GrassPlants(20232)）——曾内嵌 vanillaBiomes 尾（提前约 40 槽）,归位
    { name: '蛛网蜂巢', run: websInSpiderCavesSlot },
    // 地表植物（原版 GrassPlants cs:20232 + GlowingMushroomPlants cs:20278，注册序
    // Webs(20140) < 两者 < Vines(20338)）——曾内嵌"表面"槽,归位
    { name: '地表植物', run: grassPlantsSlot },
    // 丛林植物P2（原版 JunglePlantsPart2 cs:20310-20337）：w*100 次尝试在丛林侧
    // 地表丛林草上放大株植物 233（3×2 款式 Next(8)，失败回退 2×2 款式 Next(12)）。
    // 注册序：GlowingMushroomPlants…(20267) → 本 pass → Vines(20338)。
    // 2026-08-13 前整段缺失 = 丛林地表无大株植物
    { name: '丛林植物P2', run: junglePlantsSlot },
    // 藤蔓（原版 Vines cs:20338）：六类藤蔓逐列生长 + 丛林蜂巢凹龛
    { name: '藤蔓', run: vanillaVines },
    // 地表花（原版 Flowers cs:20592）：花圃重帧，消费 gs.logX/logY
    { name: '地表花', run: vanillaFlowers },
    // 地表蘑菇（原版 Mushrooms cs:20744）：蘑菇斑帧重刷
    { name: '地表蘑菇', run: vanillaMushrooms },
    // 宝石系统（原版 ExposedGems(20842/20874) < SpeleothemsAndGemTrees(22196)：
    // 装饰之后、海滩装饰之前；GemCaves 已前移"宝石洞"槽）
    { name: '宝石系统', run: vanillaGems },
    // 长苔藓（原版 LongMoss cs:20915）：苔藓块四向冒芽，位于 ExposedGems 之后
    { name: '长苔藓', run: vanillaLongMoss },
    // 丛林墙（原版 DirtWallsIntoMudWallsInJungleAndJungleMinMax cs:20963-21017）：
    // 丛林水平界扫描 + 界内表层带泥土墙 2/泥墙 59 → 丛林泥墙 15（边缘 Next(2)/
    // Next(3) 抖动）。注册序：LongMoss(20915) → 本 pass → BeeLarva(21018)。
    // 2026-08-13 前整 pass 缺失 = 丛林地表背景墙全是泥土墙
    { name: '丛林墙', run: jungleMudWallsSlot },
    // 蜂巢幼虫（原版 BeeLarvaInBeehives cs:21018-21050，注册序 LongMoss(20915) <
    // 本 pass < SettleLiquidsPart2(21051)）：蜂巢 pass 只登记坐标，托台清空+幼虫
    // 放置推迟到这里——过早放置会被中途宝箱/装饰 pass 破坏
    { name: '蜂巢幼虫', run: beeLarvaPass },
    // 二次沉降（原版 SettleLiquidsPart2AndNotTheBees cs:21051-21113，注册序
    // BeeLarva(21018) < 本 pass < CactusPalmTreesAndCoral(21115)）：管线尾二次
    // 沉降 + 尾部 tileSolid[484]=false。★2026-08-17 前由 worker/Game 的
    // settleWorldLiquids('gen') 在 generateWorld 之后承担 = 时点晚 8 个 pass：
    // vanilla #97 在 #98 之前已二次沉降（x86 实证：dump096→097 浮空岛云格水
    // 255→0），而 JS #98 珊瑚 81/贝壳 324/水盒棕榈/燕麦水检全部读到未沉液体
    // ——尾批 2-A rig #98 newLiq 16,534 的根因。与 #49 中途沉降复用同一实现
    //（liquidSettlePass：settle('gen') + 484 翻转;getGoodWorld tileSolid[56]
    // 与 notTheBees 分支为种子旗标,普通种子 no-op）。
    { name: '二次沉降', run: (ctx) => liquidSettlePass(ctx, false) },
    // 仙人掌/棕榈/珊瑚（原版 CactusPalmTreesAndCoral cs:21115-21325，注册序
    // SettleLiquidsPart2(21051) < 本 pass < TileCleanup(21327)）：GrowCactus 全量
    //（PlantCactus 150 次邻域成簇）+两端海滩珊瑚 81/贝壳 324+中段水盒棕榈
    //（此前为 12% 直柱简化,2026-08-13 全量重写）
    { name: '仙人掌珊瑚', run: cactusCoralPass },
    // 瓦片清理（原版 TileCleanup cs:21327-21751 必补子项：全图清坡/坡接半砖修复/
    // 液体中草本 KillTile/滴水石笋 373-375/墙 13·14·87 液体清零/祭坛下 232→226；
    // 帧规范化族由放置端保证,备案）——注册序本 pass(21327) < MicroBiomes(21785)
    { name: '瓦片清理', run: tileCleanupPass },
    // 蜥蜴祭坛终保（原版 LihzahrdAltar cs:21753-21791）：重放祭坛 6 格+底行 226
    // ——注册序 TileCleanup(21327) → 本 pass → MicroBiomes(21785)，对中途
    // Pots/Traps/TileCleanup 的祭坛扰动做最终回滚（2026-08-13 前内嵌 TemplePass
    // 末尾=执行位≈15911，Pots/Traps/TileCleanup 的扰动无人回滚，已外提归位）
    { name: '蜥蜴祭坛', run: lihzahrdAltarSlot },
    // 原版 Micro Biomes(cs:21785:Campsites 21915 + MiningExplosives 21951),
    // 位于 Traps/Piles/Trees 之后、Lilypads/海藻(22131,=海滩装饰)之前
    { name: '微群系', run: vanillaMicroBiomes },
    // 水生植物（原版 LilypadsCattailsBambooAndSeaweed cs:22131）：睡莲/香蒲/竹/海藻
    // （注册序 Lilypads(22131) 在 ShellPiles(16385) 之后——贝壳堆已前移"水体沉降"后）
    { name: '水生植物', run: vanillaLilypads },
    // 钟乳石宝石树（原版 SpeleothemsAndGemTrees cs:22196-22282）：先钟乳石扫描
    // （蓝绿宝石洞 147/161 天花板）后宝石树（TryGrowingTreeByType 583-589）。
    // 注册序 Lilypads(22131) → 本 pass → BrokenTrapCleanup(22283)——2026-08-13
    // 前捆绑在"宝石系统"槽（≈20842 位执行）= 顺序偏差：早于 LongMoss(20915)/
    // TileCleanup(21327)/MicroBiomes(21785)，错失长苔藓后的苔藓基座且受后置
    // 清理 pass 扰动，已外提归位
    { name: '钟乳石宝石树', run: speleothemSlot },
    // 断线陷阱清理（原版 BrokenTrapCleanup cs:22283：电线 BFS 连通网无陷阱/触发器
    // 对→整网拆除,含巨石回滚/孤儿陷阱击杀/矿轨压板复位）——注册序 Lilypads(22131)
    // < 本 pass < FinalCleanup(22304)。零掷骰
    { name: '断线陷阱清理', run: brokenTrapCleanupPass },
    // 终清理（原版 FinalCleanup cs:22304-22670 必补子项：悬空落体柱生长+封底/
    // 沙岩硬沙墙灌满岩浆/巨石重帧补支撑/液体中棕榈杀/地牢墙液体转水/矿轨清液/
    // 金币堆补底/地表散水清除/画作继承邻墙；FillWallHoles 与彩蛋备案）。零掷骰
    { name: '终清理', run: finalCleanupPass },
    // 多格残片清扫(本仓补,原版由 KillTile 整块语义天然保证):破损的可放置
    // 多格物体(陶罐/雕像/碗/起爆器/生命水晶)整体移除;祭坛/装饰组/海燕麦
    // 为原版保留形态,不在清扫列(集成 FRAGMENTS 白名单在案)。零掷骰
    { name: '多格残片清扫', run: multitileSweepPass },
  ];

  // ★OOOOOOO（2026-08-25）1457 执行序迁移：1.4.5.7 把 MicroBiomes 从
  //   LihzahrdAltar 之后（1456 cs:21785，JS 原位=「蜥蜴祭坛」与「水生植物」之间）
  //   前移到 SettleLiquidsPart2 **之前**（1457 rig WorldGen.cs:21078 <
  //   SettleLiquidsPart2 :21433 < Cactus :21497 < TileCleanup :21709 <
  //   LihzahrdAltar :22140）。SW_MB_1457=1 时把「微群系」槽搬到「二次沉降」前，
  //   mile8 尾段槽表 [49,97]..[53,101] 随之逐槽对齐（此前 JS 槽 49..53 跑的是
  //   {settle2,cactus,tclean,altar} 对 x86 {micro,settle2,cactus,tclean} ——
  //   整体错一位，#97 起大残差（删液 20k=JS 已沉降而 x86 未沉）的主因）。
  //   五段 pass 体 1456↔1457 diff 仅 micro 头尾 tileSolid[56](getGood 门) 与
  //   tclean 162 双邻门（后者 JS R12-19 已按 1457 形落地）；1456 缺省线零改动。
  if (hfIs1457()) {
    const mi = passes.findIndex((p) => p.name === '微群系');
    const si = passes.findIndex((p) => p.name === '二次沉降');
    if (mi >= 0 && si >= 0 && mi > si) {
      const [mb] = passes.splice(mi, 1);
      passes.splice(si, 0, mb!);
    }
  }

  // ★IIIII44：skyblock 加型 pass——原版仅在 skyblockWorldGen 时注册（WorldGen.cs
  //   :11539-11550：TerrainPass → GenPassNameID.Skyblock(GenerateSkyBlockWorld)）。
  //   非天空盒世界【零位移】（七满绿链槽序/工具表不受扰）；天空盒世界于「原版地形」
  //   后插一槽，后续对拍以槽名锚定。
  if (world.seedFlags?.skyblock) {
    passes.splice(1, 0, { name: '空岛', run: skyblockSlot });
  }

  for (let i = 0; i < passes.length; i++) {
    onProgress?.(passes[i].name, i / passes.length);
    await nextFrame();
    // ★IIIII87 反演重放窗口仪·通用槽头捕获（缺省零开销；i87Cap 七带版的全槽推广）：
    //   槽末态=(store 八通道+帧 / gs / chests) 在 reseed 前直递 —— probe 端按目标
    //   槽名捕快照后以 .swAbort 停管。真值基座=dump N-1（同 slot-end 口径）。
    {
      const cap91 = (globalThis as { __swI91Cap?: (st: unknown, g: unknown, ch: unknown, name: string) => void }).__swI91Cap;
      if (cap91) cap91(ctx.store, ctxGs[0], ctx.world.chests, passes[i].name);
    }
    // ★RunPass 种子重播（1456 WorldGenerator.cs:497：每个 GenPass 执行前
    //   Main.rand = new UnifiedRandom(_seed)，IL 实证）——槽头重播保证"每槽
    //   至少以新流开始"；槽内含多个原版 pass 的包装（vanillaCaves/vanillaBiomes/
    //   vanillaStructures/statuesChestsPass 等）另有内部各 pass 边界的 rng.reseed。
    ctx.rng.reseed(world.seed);
    try {
      await passes[i].run(ctx, () => {});
    } catch (err) {
      // pass 级错误包一层名字——worker 端最小化栈只有 "Maximum call stack size
      // exceeded" 时无从定位（2026-08-18 用户报 21% 栈溢出）；重抛保原栈
      const wrapped = new Error(`[pass ${i + 1}/${passes.length} ${passes[i].name}] ${(err as Error)?.message ?? err}`);
      (wrapped as Error & { cause?: unknown }).cause = err;
      throw wrapped;
    }
    // 部分世界回调（生成期实时预览）：pass 完成即暴露，不等 finalize
    if (cfg.onWorldPartial) cfg.onWorldPartial(world, i, passes[i].name);
  }

  finalize(ctx);
  // ★IIIII16：night of the living dead 初始态（ResetTempsToDayTime WorldFile.cs:1019-1024
  //   ——首存复位 dayTime=false/bloodMoon=true/time=1.0/moonPhase=0；tile 面（遍地墓园）
  //   在 potPass 槽 graveyardSeedGate 已有，此处只补时钟初始态）
  applyGraveyardInitialClockState(world);
  // 吸血鬼种子终段（WorldGen.cs:22625-22631：GenerateWorld 尾部全部 GenPass 之后
  // vampireSeed → RandomizeWorldSpawn + PlaceTorchesAroundSpawn + PutMonsterVanityInChests）
  vampireSeedFinishPass(ctx);
  // ★IIIII41-T3①：randomSpawn「how did I get here」终段（cs:655-658 FinalizeSecretSeeds
  //   randomSpawn 臂 → DoRandomSpawn :1896）。★挂位注：原版 SpawnPoint pass(cs:19605)
  //   先于 FinalizeSecretSeeds(:22666)，重掷不被覆盖；本仓 SpawnPoint 写回被上提到
  //   finalize()＝管线末，若臂按原文挂 finalCleanupPass 的 beforeShimmer 钩内，出生点
  //   重掷会被 finalize 覆盖——故与 vampire 臂同域挂尾。调用序在 vampire 之后 =
  //   vanilla 的 vampire(:22659) 先于 FinalizeSecretSeeds(:22666)；两者共享
  //   worldSpawnHasBeenRandomized 互斥门（randomSpawn+ 组合由先到者胜）。旗关零掷
  //   ⇒ 普通种子对金标链零扰动。
  doRandomSpawnFinishPass(ctx);
  // ★TTTTTTT（2026-08-26）：FinalSeedCleanup 移位——1457 WorldGen.cs:22666
  //   `SecretSeed.FinalizeSecretSeeds()` 实际在 FinalCleanup pass 体【内】
  //   （ShimmerCleanUp cs:22639 之前），曾挂此处（finalize 之后）时点晚于 dump
  //   #105 快照位 → mile8 槽 57 把静态化差全记在 #105。现经 finalCleanupPass
  //   的 opts.beforeShimmer 钩子在原版位执行（hfIs1457 门同前；1456 口径无此扫，
  //   双态文件不受扰）。
  // ★终扫(finalize 之后):finalize 的幽灵 type 净化会把"flags=0 但 type 残留"
  // 的多格物体清成 0 → 在清扫 pass 之后【再造残片】(2026-08-13 缺位断言实锤:
  // 生成后 pot 残片 1 处,补扫即清零)。清扫幂等且廉价,此处兜底。
  runMultitileFragmentSweepPass(ctx.store);
  onProgress?.('完成', 1);
  return world;
}

// ---------- 原版管线 pass(阶段 1-2 移植) ----------
import { newGenState, type GenState } from './vanilla/GenState';
import { flipGenSolid, resetGenSolid, vanSolidOrSloped } from './vanilla/GenSolid';
import { setBoulderSolidity } from './vanilla/TrapsPass';
import { parseSeedChain, type SeedFlags } from './SeedEasterEggs';
import { runTerrainPass } from './vanilla/TerrainPass';
import { runRocksAndClayPass, runCavesPass } from './vanilla/CavesPass';
import { runOceanSandPass, runBeachesPass, runBeachDecorPass } from './vanilla/BeachPass';
import { runIceBiomePass, runSlushPass } from './vanilla/IceBiomePass';
import { runWebsPass as runVanillaWebsPass } from './vanilla/WebsPass';
import { runUnderworldPass, underworldAshGrassTrees, generateUnderworldStartingMound } from './vanilla/UnderworldPass';
import { runGrassPass } from './vanilla/GrassPass';
import { runJunglePass } from './vanilla/JunglePass';
import { runMudCavesPass, spreadGrass } from './vanilla/Spread';
import { runDesertPass } from './vanilla/DesertPass';
import { runMushroomPass } from './vanilla/MushroomPass';
import { runMarbleGranitePass } from './vanilla/MarbleGranitePass';
import { runDunesPass } from './vanilla/DunesPass';
import { runShimmerPass } from './vanilla/ShimmerPass';
import { runMicroBiomesPass } from './vanilla/MicroBiomesPass';
import { runDirtToMudAndSiltPass } from './vanilla/DirtToMudPass';
import { runCleanupPass } from './vanilla/CleanupPass';
import { runDirtRockWallRunnerPass } from './vanilla/DirtRockWallRunnerPass';
import { runSmoothWorldPass, runWaterfallLipPass, setKillTileGetGood } from './vanilla/HalfBrickPass';
import { runShiniesPass, runGemsPass } from './vanilla/ShiniesPass';
import { runGemCavesPass, runExposedGemsIcePass, runExposedGemsUndergroundPass, runGemTreesPass } from './vanilla/GemPasses';
import { runCaveWallsPass, runCaveWallVarietyPass, runJungleMudWallsPass } from './vanilla/CaveWallsPass';
import { runOasisPass } from './vanilla/OasisPass';
import { runCactusPalmTreesAndCoralPass } from './vanilla/StructuresPass';
import { runTileCleanupPass } from './vanilla/TileCleanupPass';
import { runBrokenTrapCleanupPass } from './vanilla/BrokenTrapCleanupPass';
import { runFinalCleanupPass, genSquareTileFrame } from './vanilla/FinalCleanupPass';
import { runFinishDrunkGenPass } from './vanilla/FinishDrunkGenPass';   // ★IIIII21 FinishDrunkGen 1:1（cs:26493-26611）
// IIIII16 秘种子生成终结面（Do* 族九旗标；接线点见下方各 ★IIIII16 注）
import {
  doDigExtraHoles, doSurfaceIsMushroomsEarly, pumpkinSeasonArm,
  finalizeSecretSeedDoEnds, applyGraveyardInitialClockState,
  // ★IIIII41-T3①：vampire/randomSpawn 共宿核心（avoid 表四支补全在彼处）
  randomizeWorldSpawnCore, doAdditionalChangesAroundSpawnCore,
} from './vanilla/SecretSeedDoEndsPass';
import { runMultitileFragmentSweepPass } from './vanilla/MultitileFragmentSweep';
import { runMossAndMossCavesPass } from './vanilla/MossPass';
import { runGrassWallPass } from './vanilla/GrassWallPass';
import { starterNpcsPass } from './vanilla/StarterNPCsPass';
import { runMountCavesPass, runMountainCavesPass } from './vanilla/MountCavesPass';
import { runWavyCavesPass } from './vanilla/WavyCavesPass';
import { runTreePass, randomizeTreeStyle, randomizeCaveBackgrounds, growAshTree } from './vanilla/TreePass';
import { runLakesPass } from './vanilla/LakesPass';
import { runPotsPass } from './vanilla/PotsPass';
import { runBoulderPileSection } from './vanilla/PilesPass';
import { runTeleporterPass } from './vanilla/TeleporterPass';
import { runGravitatingSandPass } from './vanilla/GravitatingSandPass';
import { runTrapsPass } from './vanilla/TrapsPass';
import { runFloatingIslandsPass, runLifeCrystalsPass, runPyramidPass, runWetJunglePass, runAlchemyHerbsPass } from './vanilla/StructuresPass';
import {
  runSurfaceOreAndStonePass, runFallenLogsPass, runDyePlantsPass, runVinesPass,
  runFlowersPass, runMushroomsPass, runLongMossPass, runLilypadsPass,
  runGrassPlantsPass, runGlowingMushroomPlantsPass,
  runSunflowersPart2Pass, runJunglePlantsPart2Pass,
} from './vanilla/SurfaceDecorPasses';
import { runLivingTreesPass, runLivingTreeWallsPass } from './vanilla/LivingTreePass';
import { runBeehivePass, runSpiderNestPass, runWebsInSpiderCavesPass, runBeeLarvaPass } from './vanilla/HiveSpiderPass';
import { runPilesPass } from './vanilla/PilesPass';
import { runRemoveSurfaceWaterAboveSandPass, runFragileIcePass } from './vanilla/WaterIcePasses';
import { tileRunner } from './vanilla/TileRunner';
import { runDungeonPass } from './vanilla/DungeonPass';
import { runDualDungeonsDitherSnakePass } from './vanilla/DitherSnakePass'; // ★IIIII88 双地牢蛇槽
import { dualDungeonState } from './vanilla/DungeonStyles1457';   // ★IIIII88 双地牢共享态（Reset/Dunes 头装配）
import { runTemplePass, runTemplePart2Pass, runLihzahrdAltarPass } from './vanilla/TemplePass';
import { runIslandHousePass } from './vanilla/IslandHousePass';
import { runHellFortPass, hfIs1457 } from './vanilla/HellFortPass';
import { runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass, runWaterChestsPass } from './vanilla/BuriedChestsPass';
import { runStatuesPass } from './vanilla/StatuesPass';
import { runJungleShrinePass, runJungleChestsPass } from './vanilla/JungleShrinePass';
import { runCaveHousesPass, rollHouseChestCounts } from './vanilla/CaveHousePass';
import { runOceanCavesPass, runUnderwaterChestsPass } from './vanilla/OceanCavesPass';
import { runHellforgesPass } from './vanilla/HellforgesPass';
import { runCorruptionPass, runAltarsPass } from './vanilla/CorruptionPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from './vanilla/MissingCavesPass';
import { settleWorldLiquids, finalGenMergeScan } from '../liquid/settle';
import vanillaJson from '../../../public/sprites/vanilla.json';
import { runUndergroundJungleTreesPass } from './vanilla/UndergroundJungleTreesPass';
import { runQuickCleanupPass } from './vanilla/QuickCleanupPass';
// ★UUUUUU（2026-08-23）：not the bees 两大全域转化（六槽头 + FinalCleanup 尾）
import { runNotTheBees } from './vanilla/NotTheBeesPass';
// ★IIIII44：skyblock 加型生成器本体 + deny 族门谓词（Skyblock 类 cs:3029-3250）
import {
  runSkyblockPass, sbDenyAll, sbDenySome, sbDenyFloatingIslands,
} from './vanilla/SkyblockPass';
// ★IIIII44 组合臂：extraLivingTrees 附岛树（GSB 尾 cs:23000-23007 只掷坐标）
import { growLivingTree } from './vanilla/LivingTreePass';
import type { ChestSink } from './vanilla/BuriedChestsPass';
// ★1457 对齐档 2（2026-08-23）复线：finalSeedCleanup import 恢复（1457 FinalizeSecretSeeds
//   尾无条件终扫;KKKKKK 批曾撤,基准回 1457 后按 1457 WorldGen.cs:22666/:692 接回）。
import { finalSeedCleanup } from './vanilla/FinalSeedCleanupPass';
// ★IIIII17：DoPortalGunInChests（WorldGen.cs:3004，FinalizeSecretSeeds #18 位）
import { doPortalGunInChests } from './vanilla/FinalSeedCleanupPass';

// 原版 pass 49 SettleLiquids：中途沉降（见 passes 数组注释）
// ★UUUUUU：oceanStrip 形参化——原版 cs:16221-16231 海洋带归水全扫只在 #49
//   SettleLiquids 有（#97 SettleLiquidsPart2 cs:21051 无此前导），且**时序在
//   NotTheBees()（cs:16237）之前**——曾打包在 settleWorldLiquids(oceanStrip=true)
//   内=NTB 蜜转化后被归水（左缘洞穴 18,022 格蜜→水定罪），现拆到本函数体内
//   NTB 调用位之前（普通种子该域无非水液体，先后序零差）。
// ★IIIII70b：export + 可选 gs 直注（反演重放仪 _iii76st 用——生产调用不传参，
//   行为逐位不变；hydrate 基座单跑本 pass 时 ctxGs 为空须喂捕获的 gs）
export async function liquidSettlePass({ world, rng, store }: GenCtx, oceanStrip: boolean, gsOverride?: NonNullable<typeof ctxGs[0]>) {
  const gs = gsOverride ?? ctxGs[0];
  if (gs) {
    // ★IIIII44：#49 SettleLiquids（cs:16229）与 #97 SettleLiquidsPart2AndNotTheBees
    //   （cs:21426）同为 `!Skyblock.denyAllGeneration` 整门——天空盒世界两沉降槽全跳
    //   （NotTheBees() 自身 cs:25384 亦早退;x86 实证 slot49/98 掷数=基线零消耗）。
    if (sbDenyAll(gs.seedFlags)) return;
    if (oceanStrip) {
      // cs:16221-16231：oceanDepths（y ≤ (groundLevel+rockLevel)/2+40 且
      //   x<380 ∪ x>w-380）内液体>0 且类型≠水 → 归水（settle.ts 同源副本，
      //   禁区文件不改动；零掷骰）
      const st0 = world.store;
      const oceanLevel = (world.groundLevel + world.rockLevel) / 2 + 40;
      for (let x = 0; x < st0.w; x++) {
        if (x >= 380 && x <= st0.w - 380) continue;
        for (let y = 0; y < st0.h; y++) {
          if (y > oceanLevel) break;
          const i = y * st0.w + x;
          if (st0.liquid[i] > 0 && st0.liquidType[i] !== 1) st0.liquidType[i] = 1;
        }
      }
    }
    // ★UUUUUU：NotTheBees() 槽头（SettleLiquids cs:16237 / SettleLiquidsPart2
    //   cs:21064——两沉降 pass 头、QuickWater 之前的首掷消费者位；本函数被
    //   「水体沉降」与「二次沉降」两槽复用，与原版两次调用位一一对应）
    if (gs.seedFlags.notTheBees && !gs.seedFlags.skyblock) runNotTheBees(store, rng, gs);
    // ★落水越 waterLine 转岩浆接线（Liquid.cs:177-190；WorldGen.ts:383 旧禁改
    //   已解除）：水线=TerrainPass 的 GenVars.waterLine；地牢豁免盒=
    //   CreatePotentialDungeonBounds(percentInMiddle=0.1,percentOnEdges=0.05) 的
    //   outerPotentialDungeonBounds 半图矩形（DungeonCrawler.cs:109；y 界=
    //   worldSurface+10 .. UnderworldLayer-10）——落点在盒内且水源墙∈wallDungeon
    //   才豁免。world 字段化后续尾沉降（worker 'gen'）同享
    world.genWaterLine = gs.waterLine;
    if ((gs.dungeonSide as number) === 0) {
      world.genDungeonExempt = null;
    } else {
      const edge = Math.floor(world.w * 0.05);
      const mid = Math.floor(world.w * 0.55);
      world.genDungeonExempt = gs.dungeonSide < 0
        ? { x0: edge, x1: Math.floor(world.w * 0.45), y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 }
        : { x0: mid, x1: world.w - edge, y0: Math.floor(gs.worldSurface) + 10, y1: (world.h - 200) - 10 };
    }
    // ★IIIII58：REMIX 落水分型带（Liquid.cs:182-185）——仅供 gen 模式沉降与
    // Underworld pass 内 QuickWater 消费；非 remix 恒 null（走 waterLine 规则）
    world.genRemixWater = !!gs.seedFlags.remix
      ? {
          lavaLine: gs.lavaLine,
          rockLevel: gs.rockLevel,
          oceanLevel: (gs.worldSurface + gs.rockLevel) / 2 + 40, // WorldGen.oceanLevel cs:4364
        }
      : null;
  }
  await settleWorldLiquids(world, 'gen', undefined, rng, false);
  // ★SSSSSS：QuickWater 尾 tilesIgnoreWater(false) → SetBoulderSolidity(true)
  //   （Liquid.cs:74/141——巨石九族沉降毕回实心；noTraps 的 cs:111/141 条件支与
  //   tilesIgnoreWater 语义重合,冗余）。Piles 巨石段尾的 false 由此还原——普通种子
  //   484 亦被还原（GenSolid 旧时间线注记「484 恒非实心到结束」漏计本路径,四链
  //   回归实证无读者不受扰）。
  setBoulderSolidity(true);
  // ★pass 尾 tileSolid 翻转（cs:16292 `Main.tileSolid[484] = false`）——DesertBiome
  //   头（cs:12537）已翻过,原版冗余重放,接线仅为时间线存档（484 生成期恒非实心）。
  flipGenSolid([484], false);
}

/** 种子等价对账钩子（terrain oracle）：只跑 Reset 掷骰 + Terrain pass，
 *  返回 GenState 与逐列地表（trunc(num3)），供与 C# 参考实现逐列比对 */
export function runResetAndTerrain(cfg: { width: number; height: number; seedText: string; evil?: -1 | 0 | 1; seedFlags?: SeedFlags }): {
  gs: GenState; surface: Int32Array; seed: number; world: World; rng: RNG; ctx: GenCtx;
} {
  const seed = translateSeed(cfg.seedText);
  const world = new World(cfg.width, cfg.height, seed);
  world.seedFlags = cfg.seedFlags ?? parseSeedChain(cfg.seedText).flags;
  const rng = new RNG(seed);
  const ctx: GenCtx = {
    world, store: world.store, rng,
    surface: new Float32Array(cfg.width),
    cfg: { ...cfg, evil: cfg.evil ?? -1 },
  };
  vanillaTerrain(ctx);
  const out = new Int32Array(cfg.width);
  for (let x = 0; x < cfg.width; x++) out[x] = ctx.surface[x];
  // rng 必须回传重播后的活对象（terrain 前已重绑 ctx.rng，链式对账续用同一条流）
  return { gs: ctxGs[0]!, surface: out, seed, world, rng: ctx.rng, ctx };
}

function vanillaTerrain(ctx: GenCtx) {
  const { store, world, surface, cfg } = ctx;
  let rng = ctx.rng;
  const gs = newGenState(store.w, store.h);
  // 世界种子 int——DesertHive 的 FastRandom(seed).WithModifier(57005) 主种子
  // （DesertHive.cs:253，与 genRand 完全独立的第二条随机流）
  gs.seed = translateSeed(cfg.seedText);
  // 彩蛋种子旗标——特殊种子 pass 分支消费（GemPasses 等）；cfg.seedFlags 直注优先
  // （S0-1 解耦），缺省回退 seedText 派生。金标种子 flags 恒空集 → 掷骰流位置不受影响
  gs.seedFlags = cfg.seedFlags ?? parseSeedChain(cfg.seedText).flags;
  // ★IIII67b：KillTile 内 getGoodWorld 灰烬崩塌级联旗标（1457 cs:64251 / 1458 cs:64259）
  //   ——世界级 Main.getGoodWorld，作用于生成期一切 KillTile 调用方（Smooth/Waterfalls/
  //   TileCleanup/陷阱等），经本 setter 广播给共享 killTile 引擎，等价 vanilla 全局数组读。
  setKillTileGetGood(!!gs.seedFlags.getGoodWorld);
  // ===== Reset 掷骰（1456 WorldGen.generateWorld cs:11159-11472 逐行 1:1）=====
  // 原版在 AddPasses 循环之前按此固定顺序消耗 Main.rand（种子等价的流位置契约）。
  // 天气/背景/月亮等值我们未消费——照掷照弃，只保留 GenState 下游字段。
  const W = store.w;
  const H = store.h;
  // ① jungleHut（cs:11182 Next(5)，cs:11333-11352 映射 0-4→119/120/158/175/45）
  //    JungleShrinePass 复用本值（曾照掷照弃致 pass 内重掷、流位+样式双偏）
  gs.jungleHut = rng.nextInt(5);
  // ② crimsonLeft（cs:11235-11250）——Next(2)==0→false / 非0→true。
  //    ★IIIII14：普通世界无消费者（照掷即可），drunk 双邪恶的半侧分配键——落盘 gs
  //    （CorruptionAndCrimson cs:14031/14370 半侧锁 + 祭坛/珠/祭坛清理 style 半侧规则消费）
  gs.crimsonLeft = rng.nextInt(2) !== 0;
  // ③ RandomizeWeather（cs:7736-7746）：numClouds + 风速 do-while
  //   ★IIIII41-T3③：numClouds 从"照掷照弃"改落 gs（MoreLightning 世界面 DoRainsForAYear
  //   的 ChangeRain 分支键需要它；普通种子不读取，金标流零扰动）。
  const resetNumClouds = rng.nextIntRange(10, 200);
  let resetWind = 0;
  for (;;) {
    const wf = rng.next();              // NextFloat = (float)NextDouble（1 次采样）
    const windSign = rng.nextIntRange(0, 2) === 0 ? -1 : 1;   // Next(2)*2-1（符号掷）
    if (wf !== 0) {                     // ×0.35×(±1) 非零 ⇔ wf≠0（骰序/终止谓词不变）
      resetWind = wf * 0.35 * windSign;
      break;
    }
  }
  void resetNumClouds;
  // ★IIIII41-T3③ moreLightning/noLightning 世界生成期消费点＝DoRainsForAYear（WorldGen.cs:
  //   1878-1892 ← GenerateWorld Reset 段 :11261-11265， rainsForAYea 种子门内；位置=③
  //   RandomizeWeather 之后、④地狱箱洗牌之前）。初始天气面：
  //     rainTime=1892160000/raining=true；
  //     moreLightningSeed 支：numClouds=200 → ChangeRain(instant,1f)（override 不掷）→
  //       cloudAlpha=0.9 → windSpeedTarget=±0.8×**genRand.Next(2)**（★唯一生成期掷点）；
  //     非雷支：ChangeRain(instant)——按当时 numClouds 分支掷强度（Next(3)/Next(40..91)
  //       系），cloudAlpha=maxRaining，随后 numClouds=200。
  //   noLightning 无本段消费（其世界面仅存档位 WF57:1433-1434 布尔；WldParser.ts:399-400
  //   已读；运行时面 SpawnStormLightning（:72438 门，src/world/StormLightningSpawner.ts）
  //   已接）。ChangeRain 的 cloudBGActive>=1 支在 Reset 时点不成立（Main 初始 -1），
  //   分支按纯 numClouds 走。
  if (gs.seedFlags.rainsForAYear) {
    const wv = world.weather;
    wv.raining = true;
    wv.rainTime = 1892160000;
    if (world.seedFlags?.moreLightning) {                        // cs:1882 Main.moreLightningSeed
      wv.numClouds = 200; wv.numCloudsTemp = 200;
      wv.maxRaining = 1;                                         // strengthOverride=1f
      wv.cloudAlpha = 0.9;                                       // cs:1889 直接覆写
      const sign = rng.nextInt(2) !== 0 ? 1 : -1;                // cs:1890 风向符号掷
      wv.windSpeedTarget = 0.8 * sign;
    } else {                                                     // cs:1893-1895 ChangeRain(instant)
      let val: number;
      if (resetNumClouds > 150) {
        val = (rng.nextInt(3) !== 0 ? rng.nextIntRange(40, 91) : rng.nextIntRange(20, 91)) * 0.01;
      } else if (resetNumClouds > 100) {
        val = (rng.nextInt(3) !== 0 ? rng.nextIntRange(20, 61) : rng.nextIntRange(10, 71)) * 0.01;
      } else {
        val = (rng.nextInt(3) !== 0 ? rng.nextIntRange(5, 31) : rng.nextIntRange(5, 41)) * 0.01;
      }
      wv.maxRaining = val;
      wv.cloudAlpha = val;                                       // instant → cloudAlpha=maxRaining
      wv.numClouds = 200; wv.numCloudsTemp = 200;                // cs:1894 在 ChangeRain 之后
      // 非雷支不改风——但 WeatherState ctor 的开局随机风（Main.cs:10801 域外噪声，
      // 本仓 ctor 用 Math.random 种子）须归位到本世界 ③ RandomizeWeather 已掷的终值
      // （vanilla 生成末态；骰值已耗，仅落盘照抄）。
      wv.windSpeedCurrent = wv.windSpeedTarget = resetWind;
    }
  }
  // ④ 地狱箱主件洗牌（cs:11262-11274）：Next(5..1) 逐个抽出 → gs.hellChestItems
  {
    const pool = [274, 220, 112, 218, 3019];
    const out: number[] = [];
    while (pool.length > 0) out.push(...pool.splice(rng.nextInt(pool.length), 1));
    gs.hellChestItems = out;
  }
  // ⑤⑥ slimeRainTime / cloudBGActive（cs:11277-11283，天气初值，未消费）
  rng.nextIntRange(86400 * 2, 86400 * 3);
  rng.nextIntRange(8640, 86400);
  // ⑦-⑩ 矿石替代对（cs:11286-11310）——Next(2)==0 用替代矿。
  // ★PPPPP（2026-08-22）矿石锁：原版铁/金两掷包在 `(!dontStarveWorldGen||drunkWorldGen)&&`
  //   之内（cs:11294-11298 铁 / cs:11305-11310 金）——Next(2) 在 if **内**，纯 Constant
  //   两掷不发生（RNG 流恒 -2 样本，下游全体移位；.wld 头铁证=CONST worldId 抽取位
  //   t=16 而普通种子 t=18，RECON-CONST）。铜/银两掷无条件（cs:11289/11300）。
  const constOreLock = !!gs.seedFlags.theConstant && !gs.seedFlags.drunkWorld;
  gs.oreTiers = {
    copper: rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_tin']! : TILE_BY_KEY['ore_copper']!,
    iron: !constOreLock && rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_lead']! : TILE_BY_KEY['ore_iron']!,
    silver: rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_tungsten']! : TILE_BY_KEY['ore_silver']!,
    gold: !constOreLock && rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_platinum']! : TILE_BY_KEY['ore_gold']!,
  };
  // SavedOreTiers 肉前四档（cs:11294-11320）：tile id 记原版 sheet（7/6/9/8 与 166-169）
  const vanillaSheetOf = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
  world.oreTiersPH = {
    copper: vanillaSheetOf(gs.oreTiers.copper),
    iron: vanillaSheetOf(gs.oreTiers.iron),
    silver: vanillaSheetOf(gs.oreTiers.silver),
    gold: vanillaSheetOf(gs.oreTiers.gold),
  };
  // ★IIII71b：重置期终值快照（SavedOreTiers.* 与 GenVars.*Bar 同语义——此后
  // **不再被改写**）。DRUNK 的 ShiniesPass 带内翻转只改「动态面」gs.oreTiers
  // （≡GenVars.copper 等，cs:13262 起逐带覆写）；cs 面两套变量并存：
  // OrePatch(cs:10601) 读 SavedOreTiers.Copper、AddBuriedChest 锭族(cs:36789)/
  // 银弹支(cs:37634)/MiningExplosivesBiome bar 族(MiningExplosivesBiome.cs:36-40)
  // 全部走重置期值。此前 JS 单变量承载 ⇒ DRUNK 世界翻带后上述消费点集体错矿种
  // (#74 Surface_Ore_and_Stone T7>166×71 实锤)。普通世界翻转恒不发生，快照与
  // 动态值恒等（七链零行为差）。锭 item id 与 GenVars.*Bar 重置终值同源：
  // copper=7→20/166→703、iron=6→22/167→704、silver=9→21/168→705、gold=8→19/169→706。
  const isAlt = (t: number, altKey: string): boolean => TILE_DEFS[t]?.key === altKey;
  gs.savedOreTiers = { ...gs.oreTiers };
  gs.savedOreBars = {
    copper: isAlt(gs.oreTiers.copper, 'ore_tin') ? 703 : 20,
    iron: isAlt(gs.oreTiers.iron, 'ore_lead') ? 704 : 22,
    silver: isAlt(gs.oreTiers.silver, 'ore_tungsten') ? 705 : 21,
    gold: isAlt(gs.oreTiers.gold, 'ore_platinum') ? 706 : 19,
  };

  // ⑪ crimson（cs:11321）+ UI 覆盖（骰照掷仅覆盖结果，cs:11326-11332）
  gs.crimson = rng.nextIntRange(0, 2) === 0;
  if (cfg.evil === 0) gs.crimson = false;
  else if (cfg.evil === 1) gs.crimson = true;
  world.crimson = gs.crimson;
  // ⑫ WorldId（cs:11354）——Next(int.MaxValue) 单次采样，未消费
  rng.nextIntRange(0, 2147483647);
  // ⑬ RandomizeTreeStyle（cs:8082）——树冠样式与边界
  const ts = randomizeTreeStyle(rng, W);
  gs.treeX = ts.treeX;
  gs.treeStyle = ts.treeStyle;
  // ⑭ RandomizeCaveBackgrounds（cs:8157-8210，尺寸分支 2/3/4 段——多尺寸化 2026-08-16）
  //    掷 caveBackX 边界 + 互异 caveBackStyle，值入 gs（.wld 头锚点可验）；掷骰序
  //    与 4200 既有链位级兼容（同序同计数：1 边界 + 2 样式 + retry 环）
  const cb = randomizeCaveBackgrounds(rng, W);
  gs.caveBackX = cb.caveBackX;
  gs.caveBackStyle = cb.caveBackStyle;
  // 尾部无条件 3 掷（cs:8211-8213：iceBackStyle/hellBackStyle/jungleBackStyle）——
  // 2026-08-12 审计发现整条 RNG 流自 Reset 起少 3 样本,后续世界形态整体平移
  gs.iceBackStyle = rng.nextInt(4);
  gs.hellBackStyle = rng.nextInt(3);
  gs.jungleBackStyle = rng.nextInt(2);
  // ⑮ RandomizeBackgrounds（cs:7913-7960，全部未消费照掷）
  {
    const rollForest = () => {
      let n = rng.nextInt(14);
      if ((n === 1 || n === 2) && rng.nextIntRange(0, 2) === 0) n = rng.nextInt(14);
      if (n === 0) n = rng.nextInt(14);
      if (n === 3 && rng.nextIntRange(0, 3) === 0) n = 31;
      if (n === 5 && rng.nextIntRange(0, 2) === 0) n = 51;
      if (n === 7 && rng.nextIntRange(0, 4) === 0) n = rng.nextIntRange(71, 74);
      return n;
    };
    const bg1 = rollForest();
    let bg2 = rollForest();
    while (bg2 === bg1) bg2 = rollForest();
    let bg3 = rollForest();
    while (bg3 === bg1 || bg3 === bg2) bg3 = rollForest();
    let bg4 = rollForest();
    while (bg4 === bg1 || bg4 === bg2 || bg4 === bg3) bg4 = rollForest();
    { // Corruption 背景：Next(6)；==5 时 Next(2) 定 51/52
      const n = rng.nextInt(6);
      if (n === 5) rng.nextIntRange(0, 2);
    }
    rng.nextInt(7);                                        // setBG(2, jungle)
    const snowBG = rng.nextInt(9);
    // ★真 exe（ilspycmd 2026-08-13）：命中时共消费**两个** Next(2)——外层判定 1 +
    // 内层 21/22（31/32、41/42）选择 1。曾只补一掷 → 每次命中少吞 1 掷（最多 3、
    // 是否命中随种子）→ Reset 尾部流错位 → dungeonLocation/terrain 全漂移
    if (snowBG === 2 && rng.nextIntRange(0, 2) === 0) rng.nextIntRange(0, 2);
    if (snowBG === 3 && rng.nextIntRange(0, 2) === 0) rng.nextIntRange(0, 2);
    if (snowBG === 4 && rng.nextIntRange(0, 2) === 0) rng.nextIntRange(0, 2);
    rng.nextInt(6);                                        // setBG(4, hallow)
    rng.nextInt(7);                                        // setBG(5, crimson)
    { // Desert 背景：Next(6)；==5 时 Next(5)
      const n = rng.nextInt(6);
      if (n === 5) rng.nextInt(5);
    }
    rng.nextInt(8);                                        // setBG(7, ice)
    rng.nextInt(5);                                        // setBG(8, mushroom)
    rng.nextInt(3);                                        // setBG(9, underworld)
  }
  // ⑯ RandomizeMoonState（cs:7748 → 调用点 cs:11357，guaranteeNewStyle=false）
  //    ——单次 Next(9) 赋 Main.moonType（wld 头锚点；曾掷而未存致 moon 恒 0）
  world.moonType = rng.nextInt(9);
  // （TreeTops.CopyExistingWorldInfoForWorldGeneration / SetupDungeonGenVars：零掷骰）
  // ⑰ dungeonSide（cs:11360）：Next(2)==0 → Left(我们 -1)
  gs.dungeonSide = rng.nextIntRange(0, 2) === 0 ? -1 : 1;
  // ⑱ 丛林（1458 cs:11373-11403）：与地牢异侧。★IIIII48 REMIX 勘误——remix 世界
  //    先于十周年分支：Next(20,35)（cs:11376-11384），非 remix 才走 Next(15,30)/
  //    十周年 Next(25,35)。此前只移植了十周年支 → remix 丛林起点带错位（mile8
    //    #017 泥域 ±13 万格对调的根因）。掷耗两侧均 1 次，流位不受影响。
  {
    const sfT = !!gs.seedFlags?.tenthAnniversary, sfR = !!gs.seedFlags?.remix;
    const jMin = sfR ? 20 : sfT ? 25 : 15;
    const jMax = sfR ? 35 : sfT ? 35 : 30;
    if (gs.dungeonSide === -1) {
      gs.jungleX = Math.trunc(W * (1 - rng.nextIntRange(jMin, jMax) * 0.01));
    } else {
      gs.jungleX = Math.trunc(W * (rng.nextIntRange(jMin, jMax) * 0.01));
    }
  }
  world.jungleX = gs.jungleX;
  // ⑲ 地牢侧锚点 num7（cs:11394-11416）：Next(w) 拒绝采样到地牢侧 15% 区间
  //    ★IIIII14（cs:11407-11414 + cs:11425-11432）：drunk 在采样**前翻面**、采样后翻回
  //    ——净效应=side 恢复原值，但 num7（雪原带中心）落到与普通世界相反的一侧
  //    （丛林同侧：wiki「丛林+雪原可能挤在同侧」 drunk 表现之一）。两道门
  //    `(!dontStarve||remix)` / `(!dontStarve||tenth)`——theConstant 未实装世界恒 true。
  //    remix/tenth 组合域照序转录（JS 该二旗在世时也按字面门生效）。
  let dX = rng.nextInt(W);
  if (gs.seedFlags.drunkWorld && (!gs.seedFlags.theConstant || gs.seedFlags.remix)) {
    gs.dungeonSide = (gs.dungeonSide === -1 ? 1 : -1);
  }
  const dLo = W * (gs.dungeonSide === 1 ? 0.60 : 0.25);
  const dHi = W * (gs.dungeonSide === 1 ? 0.75 : 0.40);
  while (dX < dLo || dX > dHi) dX = rng.nextInt(W);
  if (gs.seedFlags.drunkWorld && (!gs.seedFlags.theConstant || gs.seedFlags.tenthAnniversary)) {
    gs.dungeonSide = (gs.dungeonSide === -1 ? 1 : -1);
  }
  gs.dungeonX = dX;
  // ⑳ 雪原（cs:11425-11440）：锚点两侧独立扩展（num9 = w/4200，小世界恰 1.0）
  const num9 = W / 4200;
  const snowHalf = () => rng.nextIntRange(50, 90)
    + Math.trunc(rng.nextIntRange(20, 40) * num9)
    + Math.trunc(rng.nextIntRange(20, 40) * num9);
  const snowL = snowHalf(), snowR = snowHalf();
  gs.snowOriginLeft = Math.max(0, dX - snowL);
  gs.snowOriginRight = Math.min(W, dX + snowR);
  // ㉑㉒ 海滩（cs:11445-11459）：Next(300,340)（center 320±range 20）+ 侧别加宽
  // ★SSS-CELEB（1458 cs:11450-11452/11463-11465）：tenth&&!remix 恒取最大滩宽
  //   leftBeachEnd=center+range(340)/rightBeachStart=w-(center+range)——重掷被覆写
  //   不额外消耗掷骰（先掷后改，掷骰次数不变）
  {
    const sfT = !!gs.seedFlags?.tenthAnniversary, sfR = !!gs.seedFlags?.remix;
    const celbMaxBeach = sfT && !sfR;
    gs.beachLeftEnd = rng.nextIntRange(300, 340) + (gs.dungeonSide === 1 ? 40 : 20);
    if (celbMaxBeach) gs.beachLeftEnd = 320 + 20 + (gs.dungeonSide === 1 ? 40 : 20);
    gs.beachRightStart = W - rng.nextIntRange(300, 340) - (gs.dungeonSide === -1 ? 40 : 20);
    if (celbMaxBeach) gs.beachRightStart = W - (320 + 20) - (gs.dungeonSide === -1 ? 40 : 20);
  }
  // ㉓ 地牢入口（cs:11461-11470）：地牢侧海滩内 15% 区间（dungeonBeachPadding=50）
  if (gs.dungeonSide === -1) {
    gs.dungeonLocation = rng.nextIntRange(gs.beachLeftEnd + 50, Math.trunc(W * 0.2));
  } else {
    gs.dungeonLocation = rng.nextIntRange(Math.trunc(W * 0.8), gs.beachRightStart - 50);
  }
  world.dungeonX = gs.dungeonLocation;
  // ★IIIII88 双地牢 Reset 分支（WorldGen.cs:11477-11494）：dualDungeons 启用时在
  //   dungeon#0 入口掷后追加第二套 genvars——① GenerateWorld_SetupDungeonGenVars(1)
  //  （零掷,列表追加）;② dungeonSide 翻面（`num2 != Left ? Left : Right`）;③ 同公式
  //  再掷一颗 dungeonLocation（对侧海滩内带）;④ outer/inner potential bounds 复位
  //  （真值在 Dunes pass 头 SetupDungeonGenVarVariables 里才 Create 出）;⑤
  //  GenVars.CurrentDungeon 回 0;⑥ DualDungeon_NormalizedDistanceSafeFromDither =
  //  1-0.075×maxTilesY/1200（DitherSnake 控制线边界带宽系数,dungeonDitherSnake/
  //  DungeonControlLine 共用）。dungeon#0 的 gs.* 面照旧（单地牢消费端不变）。
  dualDungeonState.enabled = !!gs.seedFlags?.dualDungeons;
  dualDungeonState.dungeons = [];
  dualDungeonState.normalizedDistanceSafeFromDither = 1;
  if (gs.seedFlags.dualDungeons) {
    const s1 = gs.dungeonSide === -1 ? 1 : -1;                       // cs:11484 翻面
    const loc1 = s1 === -1
      ? rng.nextIntRange(gs.beachLeftEnd + 50, Math.trunc(W * 0.2)) // cs:11485-11490
      : rng.nextIntRange(Math.trunc(W * 0.8), gs.beachRightStart - 50);
    dualDungeonState.dungeons.push(
      { side: gs.dungeonSide, location: gs.dungeonLocation, theme: -1, entA: -1, entB: -1, entSeed: -1 },
      { side: s1, location: loc1, theme: -1, entA: -1, entB: -1, entSeed: -1 },
    );
    // cs:11488-11490：num12=maxTilesY/1200（f64）
    dualDungeonState.normalizedDistanceSafeFromDither = 1.0 - 0.075 * (H / 1200.0);
  }
  // ===== Terrain pass（原版第一个注册 pass，cs:11526）=====
  // ★RunPass 重播（num4 悬案根因，2026-08-16 Tier B IL 探针裁决）：
  // 原版每个 GenPass 执行前 `Main.rand = new UnifiedRandom(_seed)`
  // （1456 WorldGenerator.cs:497；服务器 exe IL RunPass: newobj UnifiedRandom::
  // ctor(Int32) + stsfld Main::rand），而 GenBase._random => WorldGen.genRand =>
  // Main.rand（GenBase.cs:9 / WorldGen.cs:4391）→ TerrainPass 从 stream(seed)
  // 第 0 掷开始，与 Reset 期消费无关。此前把 Reset 流续进 terrain 是 rockLayer
  // Δrl≠0 全量分叉的根因（9293480 探针实测 num4init 464.808 vs 续流 385.648；
  // 重播后 7 种子逐列 4200/4200 与原版位级一致）。后续 pass 续用重播后的同一
  // 条流——与 caves-oracle 侧 r 重绑同构，JS↔oracle 检查点口径保持一致。
  rng = new RNG(gs.seed);
  ctx.rng = rng;
  runTerrainPass(store, rng, gs);
  // surface 数组给后续旧 pass(surfacePass 树木等)用:每列首个实心行
  for (let x = 0; x < store.w; x++) {
    for (let y = 0; y < store.h; y++) {
      if (store.flags[store.idx(x, y)]) { surface[x] = y; break; }
    }
  }
  ctxGs[0] = gs;
  // 世界级常量同步
  world.groundLevel = gs.worldSurface;
  world.rockLevel = gs.rockLevel;
  world.lavaLine = gs.lavaLine;
  // ===== 生成期 tileSolid 初值（generateWorld 尾 cs:11500 `Main.tileSolid[659]=false`）=====
  // 659 以太石块：Main.cs:9538 初值 true,生成期恒非实心（生成全程无还原点）——
  // 本仓 TILE_DEFS 仍 solid:true,须运行时翻转。清零保证多次 generateWorld 不残留。
  resetGenSolid();
  flipGenSolid([659], false);
}

// 原版 pass "Dunes"(cs:11540):沙丘塑造 + 金字塔候选(gs.pyramidSpots)
function vanillaDunes({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  rng.reseed(gs.seed); // ▶DunesAndPyramidLocations cs:11540（pass 头含地牢主题掷+入口三掷）
  runDunesPass(store, rng, gs);
}

// 原版 pass "Shimmer"(cs:15256):以太微光生物群系
function vanillaShimmer({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenyAll(gs.seedFlags)) return;                 // ★IIIII44 cs:15272
  if (gs.seedFlags.dualDungeons) {
    // ★IIIII78：Shimmer 在 :22692 十二禁表——dual 跳过但 shimmerX/Y 维持 Reset 值回填
    // （vanilla Disable 后 GenVars.shimmerPosition 无写入端）。
    world.shimmerX = gs.shimmerX;
    world.shimmerY = gs.shimmerY;
    return;
  }
  rng.reseed(gs.seed); // ▶Shimmer cs:15256（shell/pillars/open 是内部段，不中间重播）
  runShimmerPass(store, rng, gs);
  // GenVars.shimmerPosition 落到 World（中途沉降 pass 在 finalize 之前就需要它）
  world.shimmerX = gs.shimmerX;
  world.shimmerY = gs.shimmerY;
}

// 原版 pass "Surface Ore And Stone"(cs:18559) + "Fallen Logs And Water Features"(cs:18625)
function vanillaSurfaceOre({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:18579
  runSurfaceOreAndStonePass(store, rng, gs);
}
function vanillaFallenLogs({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:18645
  runFallenLogsPass(store, rng, gs);
}

// 原版表面装饰子 pass 群（cs:20126/20338/20592/20744/20915/22131，见 SurfaceDecorPasses.ts）
function vanillaDyePlants({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:20146
  runDyePlantsPass(store, rng, gs);
}
function vanillaVines({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:20358
  runVinesPass(store, rng, gs);
}
function vanillaFlowers({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:20612
  runFlowersPass(store, rng, gs);
}
function vanillaMushrooms({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:20764
  runMushroomsPass(store, rng, gs);
}
function vanillaLongMoss({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:20935
  runLongMossPass(store, rng, gs);
}
function vanillaLilypads({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:22165
  runLilypadsPass(store, rng, gs);
}

// 原版 pass "Micro Biomes"(cs:21785):露营地标 + 炸药陷阱屋
function vanillaMicroBiomes({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // chests sink:MahoganyTreeBiome 常春藤箱(cs:22070 AddBuriedChest)写入
  runMicroBiomesPass(store, rng, gs, world.chests);
}

function vanillaLakes({ store, rng }: GenCtx) {
  // Lakes(30)/Slush(31) 已按注册序并入 vanillaBiomes（Corruption(29) 后、Dungeon(32) 前）
  // ——本槽保留空壳防外部引用。
  void store; void rng;
  const gs = ctxGs[0];
  if (!gs) return;
}

function vanillaCaves({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // ★IIIII44：本束全部成员（OceanSand cs:11617 / SandPatches :11726 / Tunnels :11757
  //   / MountainCaves :11823 / DirtWallBackgrounds :11897 / RocksInDirt :11936 /
  //   DirtInRocks :11966 / Clay :11999 / SmallHoles :12048 / DirtLayer :12108 /
  //   RockLayer :12149 / SurfaceCaves :12205 / WavyCaves :12315）原版均
  //   `if (!Skyblock.denyAllGeneration …)` 整门——天空盒世界整束跳过
  //   （x86 实证 slot2..15 掷数全为基线零消耗、dump 冻结不变）。
  if (sbDenyAll(gs.seedFlags)) return;
  // 原版注册序（1456）：OceanSand(11603) → SandPatches(11712) → Tunnels(11743) →
  // MountainCaves(11809) → DirtWallBackgrounds(11883) → RocksInDirt/DirtInRocks/Clay
  // → SmallHoles(12034) → DirtLayer/RockLayer/Surface Caves（WavyCaves 12301 仅
  // 饥荒世界，普通世界零掷骰跳过）
  // ★每个都是独立 GenPass——RunPass 每 pass 前重播种子（WorldGenerator.cs:497）。
  rng.reseed(gs.seed); // ▶OceanSand cs:11603
  runOceanSandPass(store, rng, gs);
  rng.reseed(gs.seed); // ▶SandPatches cs:11712
  runSandPatchesPass(store, rng, gs);   // 地下沙团（沙漠雏形）
  rng.reseed(gs.seed); // ▶Tunnels cs:11743
  runTunnelsPass(store, rng, gs);       // 地表隧道（dirt runner 双向填充）
  rng.reseed(gs.seed); // ▶MountainCaves cs:11809
  runMountCavesPass(store, rng, gs);    // 山丘本体
  rng.reseed(gs.seed); // ▶DirtWallBackgrounds cs:11883
  runDirtWallBgPass(store, rng, gs);    // 地表自然墙（wall 2/40）
  rng.reseed(gs.seed); // ▶RocksInDirt cs:11922（函数内部另有 DirtInRocks/Clay 边界重播）
  runRocksAndClayPass(store, rng, gs);
  rng.reseed(gs.seed); // ▶SmallHoles cs:12034
  runSmallHolesPass(store, rng, gs);    // 小空洞（每轮 2 发挖除 runner）
  rng.reseed(gs.seed); // ▶DirtLayerCaves cs:12094（函数内部另有 RockLayer/SurfaceCaves 边界重播）
  runCavesPass(store, rng, gs);
  // ▶WavyCaves cs:12301（PPPPP CONST 批新增）：饥荒世界专属正弦波隧道——普通世界
  //   门内零掷骰跳过（原版同构）。注册序 SurfaceCaves(12240) < 本 pass < IceBiome(12343)。
  rng.reseed(gs.seed); // ▶WavyCaves cs:12301
  runWavyCavesPass(store, rng, gs);
}

// 原版 1456 真实注册序（执行序=注册序，WorldGenerator.cs:447 _passes[PassResults.Count]）：
//   14 SurfaceCaves → 15 WavyCaves(仅饥荒世界,普通零消耗) → 16 IceBiome → 17 Grass
//   → 18 MudCaves → 19 Desert → 20 Mushroom → 21 Marble → 22 Granite → 23 FloatingIslands
//   → 24 DirtToMud → 25 Silt → 26 OresAndShinies → 27 Webs(未移植) → 28 Underworld
//   → 29 Corruption → 30 Lakes → 31 Slush → 32 Dungeon → 33 MountainCaveOpenings
//   → 34 Beaches → 35 Gems → 36 GravitatingSand → 37 OceanCaves → 38 Shimmer → 39 DirtWallCleanup
// 本函数内对齐到 16-35 段（Underworld 28 在管线末"地狱"槽、Webs 27 后置——既有偏差另案）。
function vanillaBiomes({ store, rng, world, surface }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // ★IIIII44：本束全部成员（IceBiome cs:12357 / Grass :12468 / JunglePass 不注册
  //   [12507] / MudCavesToJungleGrass :12513 / FullDesert :12546 / GlowingMushroomPatches
  //   :12597 / Marble :12814 / Granite :12898 / FloatingIslands :12990(denyFloatingIslands)
  //   / DirtToMud :13186 / Silt :13206 / OresAndShinies :13247 / Webs :13673 /
  //   Underworld :13711(含 AddHellHouses 尾段) / CorruptionAndCrimson :13933 /
  //   Lakes :14627 / Slush :14770 / Dungeon :14830 / MountainCaveOpenings :14946 /
  //   BeachesAndOceanCleanup :14961 / Gems :15123）原版均 denyAll/denyFloatingIslands
  //   整门——天空盒世界整束跳过（x86 实证 slot16..35 零掷冻结；JunglePass 在 skyblock
  //   注册期即被排除）。tileSolid[481-483] 翻转窗口也随 Dungeon 跳过不触。
  if (sbDenyAll(gs.seedFlags)) return;
  // ★每个都是独立 GenPass——RunPass 每 pass 前重播种子（WorldGenerator.cs:497）。
  // ★IIIII78 dualDungeons（double daring dangers）：DisablePassesForSpecialSeeds
  //   （WorldGen.cs:22692-22706，调用点 :11113 CreateNewWorld 尾）把 IceBiome/
  //   DesertBiome/Jungle/JungleShrines/ChestsInJungleShrines/Beehives/
  //   BeeLarvaInBeehives/LihzahrdTemple/LihzahrdTemplePart2/LihzahrdAltar/
  //   CorruptionAndCrimson/Shimmer 十二 GenPass `genPass.Disable()` 整跳——
  //   RunPass 对 Skipped pass 不执行不掷骰（cs:491-497 Enabled 早退）。插桩 rig 的
  //   WorldGenerator.cs:456 对 Skipped pass 仍发 dump（=前态冻结快照、pc.txt 照常
  //   出行）⇒ 本仓同样零写、reseed 锚保持（reseed 无流消费,后续 pass 头重播使流位
  //   两引擎等价）；对应子束的双地牢专属内容（样式房间族）在 DungeonPass 内承接。
  if (!gs.seedFlags.dualDungeons) {
    rng.reseed(gs.seed); // ▶IceBiome cs:12343
    runIceBiomePass(store, rng, gs);       // 16 Generate Ice Biome
  } else { rng.reseed(gs.seed); } // ▶IceBiome（dual 跳过锚）
  rng.reseed(gs.seed); // ▶Grass cs:12454
  // ★IIIII16：jagged rocks 打孔臂（cs:12470，skyblock 门内、roundLandmasses/撒草之前）
  // ★IIIII93：Grass 段双区段记账钩（仅挂 __swGBand 时生效，缺省零开销）——dig 区段=
  //   DoDigExtraHoles 全体（cs:2853-2868）、face 区段=本 pass 撒草主循环（:12475-12497）。
  const i93gb = (globalThis as { __swGBand?: (t: string, d?: unknown) => void }).__swGBand;
  if (gs.seedFlags.digExtraHoles && !gs.seedFlags.skyblock) {
    if (i93gb) i93gb('dig-start');
    doDigExtraHoles(store, rng, gs);
    if (i93gb) i93gb('dig-end');
  }
  if (i93gb) i93gb('face-start');
  runGrassPass(store, rng, gs);          // 17 Grass
  if (i93gb) i93gb('face-end');
  rng.reseed(gs.seed); // ▶JunglePass cs:12497
  let jx = gs.jungleX;
  if (!gs.seedFlags.dualDungeons) {
    jx = runJunglePass(store, rng, gs); // JunglePass
    world.jungleX = jx;
  }
  // dual 跳过：world.jungleX 维持 Reset 期估值（gs.jungleX）——vanilla JunglePass 被
  // Disable 后 jungleX 无写入端（下游 WetJungle 等零 RNG 面与流位不受影响）。
  // （自造「丛林表面泥化补偿块」已删 2026-08-16：原为 ±0.12w 表层 10 格 dirt→mud
  //  的自创改写——补的是 noYChange 修复前巨型泥 runner 够不到地表的旧缺陷
  //  （JunglePass.ts:67 注释「曾致泥柱矮」）；runner noYChange 修复后 JunglePass/
  //  MudCaves 两检查点对 oracle 位级全绿（tests/caves-checkpoint），泥柱表面覆盖
  //  已与原版一致，该块只在原版终态之外额外加宽泥带=偏差，故移除。清点表偏差④）
  // 18 Mud Caves To Grass（cs:12499-12530 原版精确版：全图递归洪水+散块清除；
  // 曾用近似 spreadGrassAll 中心限距+2 轮快照——caves-oracle 位级对账后替换）
  rng.reseed(gs.seed); // ▶MudCavesToJungleGrass cs:12499（零掷骰）
  // ★UUUUUU：NotTheBees() 首槽（cs:12504——pass 头首掷消费者；纯 NTB 六槽之一）
  if (gs.seedFlags.notTheBees && !gs.seedFlags.skyblock) runNotTheBees(store, rng, gs);
  // ★IIIII16：toadstool 首掷臂（cs:12517-12520，仅 !noSurface；SpreadGrass 扫描之前）
  doSurfaceIsMushroomsEarly(store, rng, gs);
  runMudCavesPass(store, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  if (!gs.seedFlags.dualDungeons) {
    runDesertPass(store, rng, gs); // 19 Full Desert（pass 头重播在 runDesertMoundOnly 内）
  }
  rng.reseed(gs.seed); // ▶GlowingMushroomPatches cs:12581
  runMushroomPass(store, rng, gs); // 20 Mushroom Patches
  runMarbleGranitePass(store, rng, gs); // 21/22 Marble/Granite（函数内部含两 pass 边界重播）
  rng.reseed(gs.seed); // ▶FloatingIslands cs:12976
  runFloatingIslandsPass(store, rng, gs); // 23 Floating Islands（原在蘑菇前——注册序修正）
  runDirtToMudAndSiltPass(store, rng, gs); // 24 Dirt To Mud / 25 Silt（内部含两 pass 边界重播）
  rng.reseed(gs.seed); // ▶OresAndShinies cs:13233
  runShiniesPass(store, rng, gs); // 26 Ores And Shinies（原在很后"矿石"槽——移到 Silt 后=Webs 位）
  rng.reseed(gs.seed); // ▶Webs cs:13659
  runVanillaWebsPass(store, rng, gs); // 27 Webs（cs:13659——原后置防被清，注册序修正回 27 位）
  // ★IIIII87 反演重放窗口仪捕获钩（缺省零开销,仅 GFB-C 取证仪挂载;同 __i54Ctx 先例）：
  //   band 头 (store,gs,chests) 直递 —— probe 端在 rng.reseed 之前拿到完整生成态;
  //   probe 以专用 .swAbort 错误停止管线（不吞探针错误）。
  const i87Cap = () => {
    const h = (globalThis as { __swI87Cap?: (st: unknown, g: unknown, ch: unknown) => void }).__swI87Cap;
    if (h) h(store, gs, world.chests);
  };
  i87Cap(); // @UWHEAD
  rng.reseed(gs.seed); // ▶Underworld cs:13697（AddHellHouses 是其尾段，不另重播）
  runUnderworldPass(store, rng, gs); // 28 Underworld（cs:13697——原管线末"地狱"槽）
  // AddHellHouses（cs:13893，Underworld pass **尾**段调用，Corruption(13919) 之前）：
  // 地狱要塞 HellFort 原版属地狱 pass 尾——2026-08-16 前独立占「地狱屋」槽
  // （LifeCrystals 之后，晚原版位约 3000 行）= 顺序偏差，R 批归位到 Underworld 尾。
  // ★IIIII14 时序移位（cs:13876 else-if(!drunk) 跳过 + cs:13906 追加段）：普通世界
  // 灰烬草/树(外缘带)在 AddHellHouses 前；drunk 在其后、且全图无外缘门。
  // ★IIIII58（cs:13874）：REMIX 世界该位改调 GenerateUnderworldStartingMound，
  //   灰烬草/树两支全跳（else-if 链第三臂）。
  if (!!gs.seedFlags.remix) generateUnderworldStartingMound(store, rng, gs);
  else if (!gs.seedFlags.drunkWorld) underworldAshGrassTrees(store, rng, gs, false);
  runHellFortPass(store, rng, gs, undefined, world.chests); // TTTT:梳妆台 88 烧 chest 注册槽(cs:52169)
  if (gs.seedFlags.drunkWorld) underworldAshGrassTrees(store, rng, gs, true);
  i87Cap(); // @CORRHEAD
  rng.reseed(gs.seed); // ▶CorruptionAndCrimson cs:13919（dual 跳过,同 :22692 十二禁表）
  if (!gs.seedFlags.dualDungeons) runCorruptionPass(store, rng, gs); // 29 Corruption/Crimson
  i87Cap(); // @LAKESHEAD
  rng.reseed(gs.seed); // ▶Lakes cs:14613
  runLakesPass(store, rng, gs); // 30 Lakes（cs:14613——原"液体"槽在结构段后，注册序修正）
  i87Cap(); // @SLUSHHEAD
  rng.reseed(gs.seed); // ▶Slush cs:14756（零掷骰）
  runSlushPass(store, gs); // 31 StoneToIceAndSiltPlusMudIntoSlush（cs:14756，紧随 Lakes）
  // ★生成期 tileSolid 翻转（DungeonCrawler.cs:344 MakeDungeon 头
  //   `WorldGen.SetCrackedBrickSolidity(solid: false)` → 481/482/483 非实心）。
  //   本仓 TILE_DEFS 已把 481-483 预翻为 solid:false（数据不可动），此处接线仅为
  //   时间线存档——DungeonPass 内部消费端清单见 GenSolid.ts 头注（禁改该文件）。
  //   还原点 = SmoothWorld 头 cs:16510 翻 true（本仓数据无法表达该窗口,备案）→
  //   SmoothWorld 尾 cs:16695 翻回 false（HalfBrickPass 接线）。
  flipGenSolid([481, 482, 483], false);
  // ★IIIII88 双地牢抖动蛇槽（cs:14824-14826 注册于 Dungeon 前；dual 专属 pass——
  //   非双地牢世界不注册零调用）。输入=dungeonGenVars×2（Reset 侧锚 + Dunes 头装配）。
  i87Cap(); // @DGHEAD
  if (gs.seedFlags.dualDungeons) {
    rng.reseed(gs.seed); // ▶DitherSnake cs:14816 DitherSnakePass.ApplyPass(#32 槽)
    runDualDungeonsDitherSnakePass(store, rng, gs);
  }
  rng.reseed(gs.seed); // ▶Dungeon cs:14816（17 内部段不中间重播；dual 链此锚=蛇后态=#033 入口）
  runDungeonPass(store, rng, gs, world.chests); // 32 Dungeon(蓝/粉砖主题+走廊房间+宝箱)
  // 地牢 pass 预计算(legacy 入口)不迁移 dungeonLocation——但入口塔列仍可能与
  // Reset 期锚点偏差数百格,必须在此回写最终位置。优先取入口门厅可站立点:
  // 生成期 Main.dungeonX/Y 的唯一写入端 = SetOldManSpawnAndSpawnOldManIfDefault
  // Dungeon(DungeonUtils.cs:1665,守卫老人出生/游走锚 = 外前厅 0.5 框底部;
  // WorldGen.cs:72510 那处是运行时兜底 setter,非生成期语义)——塔心锚点会把老人漏进塔内
  world.dungeonX = gs.dungeonEntX || gs.dungeonLocation;
  world.dungeonY = gs.dungeonEntY || gs.dungeonY || 0;
  // 33 MountainCaveOpenings + 34 Beaches（原紧跟 SurfaceCaves——注册序修正移到 Dungeon 后）
  i87Cap(); // @MCOHEAD
  rng.reseed(gs.seed); // ▶MountainCaveOpenings cs:14932
  runMountainCavesPass(store, rng, gs);
  i87Cap(); // @BEACHHEAD
  rng.reseed(gs.seed); // ▶BeachesAndOceanCleanup cs:14947
  runBeachesPass(store, rng, gs);
  // 海盆挖完后刷新 surface[](后续旧 pass 依赖;本函数之后才到那些 pass)
  for (let x = 0; x < store.w; x++) {
    for (let y = 0; y < store.h; y++) {
      if (store.flags[store.idx(x, y)]) { surface[x] = y; break; }
    }
  }
  rng.reseed(gs.seed); // ▶Gems cs:15109
  runGemsPass(store, rng, gs); // 35 Gems（原捆绑在 Lakes 槽——注册序修正移到 Beaches 后）
  // 原版 1456 注册序（WorldGen.cs 行号 = 唯一权威，2026-08-11 review 依此重排）：
  //   GravitatingSand(15198) < OceanCaves(15228) < Pyramids(15426) <
  //   SurfaceWaterInJungle(15887) < Temple(15911) < Beehives(16005) <
  //   JungleShrines(16059) < Statues(16947) < UndergroundHouses+BuriedChests(17066) <
  //   SurfaceChests(17226) < ChestsInJungleShrines(17308) < UnderwaterChests(17343) <
  //   SpiderCaves(17455) < FloatingIslandHouses(17971) < MicroBiomes(21785)
  // 神庙/灌水提前到宝箱系之前（原版语义:大结构先占位,箱/雕像后放才不会塞进
  // 神庙体内或被灌水淹没;此前神庙在蜘蛛洞后 → 占地区内已塞雕像/箱,放置互相破坏）。
  // OceanCaves(15228) 2026-08-16 前在本函数尾执行（早于独立槽「引力沙」=清点表
  // 偏差①），本批后移至「引力沙」槽内尾（gravitatingSandSlot）——引力沙须先
  // 沉降悬空沙再挖海洋洞窟；宝藏点仍经 ctxOceanTreasures 跨槽传「雕像宝箱」槽。
  // 结构尾（Pyramids 15426 起 → SwordShrine）已拆出独立「结构」槽（「清理」之后执行，
  // 原版序 DirtWallCleanup 15310 < Pyramids 15426）——见 vanillaStructures；
  // 此前内嵌于此（微光/清理之前执行）= 结构先于清理，偏差（2026-08-13 清零批）
}

// 结构段 pass 群（原版注册序 DirtWallCleanup(15310) < Pyramids(15426) <
// DirtRockWallRunner(15536) < LivingTrees(15551) < LivingTreeWalls(15792) <
// DemonAndCrimsonAltars(15825) < SurfaceWaterInJungle(15887) < Temple(15911) <
// Beehives(16005) < JungleShrines(16059)）——2026-08-13 前结构尾内嵌 vanillaBiomes
// （微光/清理之前执行）= 顺序偏差，拆出为独立槽插在「清理」之后（清零批）；
// DirtRockWallRunner 同批补缺。2026-08-16（R 批）起止于 JungleShrines：Statues 起
// 的雕像+箱族块整体后移至「生命水晶」之后的「雕像宝箱」槽（Statues 16947 原版就
// 在 LifeCrystals 16847 之后）；FloatingIslandHouses(17971) 拆到「洞穴墙」槽后；
// templePart2 五段拆到「苔藓」槽后的「神庙陈设」槽（LihzahrdTemplePart2 17809）。
// 神庙/灌水提前到宝箱系之前（原版语义:大结构先占位,箱/雕像后放才不会塞进
// 神庙体内或被灌水淹没）。
function vanillaStructures({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // ★IIIII44：本束全部成员（Pyramids cs:15442 / DirtRockWallRunner :15550 /
  //   LivingTrees :15565 / LivingTreeWalls :15806 / DemonAndCrimsonAltars :15841 /
  //   SurfaceWaterInJungle :15901 / LihzahrdTemple :15925 / Beehives :16019 /
  //   JungleShrines :16073）原版均 denyAll 整门——天空盒世界整束跳过。
  if (sbDenyAll(gs.seedFlags)) return;
  // ★每个都是独立 GenPass——RunPass 每 pass 前重播种子（WorldGenerator.cs:497）。
  rng.reseed(gs.seed); // ▶Pyramids cs:15426
  runPyramidPass(store, rng, gs, world.chests); // Pyramids(沙岩砖金字塔+宝箱)
  // Dirt Rock Wall Runner(15536,近地表泥土自然墙 2 → 石墙 59 游走斑)——注册序夹在
  // 金字塔与世界树之间；2026-08-13 前整 pass 缺失
  rng.reseed(gs.seed); // ▶DirtRockWallRunner cs:15536
  runDirtRockWallRunnerPass(store, rng, gs);
  // 原版注册序 Pyramids(15426) < LivingTrees(15551) < LivingTreeWalls(15792) <
  // DemonAndCrimsonAltars(15825) < SurfaceWaterInJungle(15887)——世界树插在金字塔后、
  // 丛林灌水前（方案 A 原版位置）；全图祭坛独立 pass 卡在活木墙与灌水之间。
  // LivingTrees：GrowLivingTree 树干壳+枝叶+根系+贯通竖井+密室宝箱；LivingTreeWalls：
  // 全图 type==191 连通核补墙 244（零掷骰）。
  rng.reseed(gs.seed); // ▶LivingTrees cs:15551
  runLivingTreesPass(store, rng, gs, world.chests);  // Living Trees(世界树)
  rng.reseed(gs.seed); // ▶LivingTreeWalls cs:15792（零掷骰）
  runLivingTreeWallsPass(store, gs);                 // Living Tree Walls(活木墙)
  // Demon And Crimson Altars(15825,全图随机撒 16 坛)——注册序 LivingTreeWalls(15792) <
  // 本 pass < SurfaceWaterInJungle(15887)。★与 Corruption pass 内猩红逐组祭坛(cs:14241)
  // 是原版两处放置,勿合并(见 CorruptionPass.runAltarsPass 头注);2026-08-13 前整 pass 缺失。
  rng.reseed(gs.seed); // ▶DemonAndCrimsonAltars cs:15825
  runAltarsPass(store, rng, gs);                      // Demon And Crimson Altars(全图祭坛)
  rng.reseed(gs.seed); // ▶SurfaceWaterInJungle cs:15887（零掷骰）
  runWetJunglePass(store, rng, gs);             // SurfaceWaterInJungle(1456 cs:15887 逐列灌水,零 RNG)
  rng.reseed(gs.seed); // ▶LihzahrdTemple cs:15911
  if (!gs.seedFlags.dualDungeons) {
    runTemplePass(store, rng, gs);                // Jungle Temple(之字形房间链+走廊+门+祭坛+木刺;尾写 gs.tLeft… 供「神庙陈设」槽)
  }
  rng.reseed(gs.seed); // ▶Beehives cs:16005
  if (!gs.seedFlags.dualDungeons) {
    runBeehivePass(store, rng, gs);               // Hives(丛林蜂巢:蜂巢壳+蜂蜜+腔)
  }
  // 丛林神龛(壳+腔+火把+金字塔顶)——坐标经 ctxShrineSpots 跨槽传给「雕像宝箱」槽
  // 的 ChestsInJungleShrines(17308)
  rng.reseed(gs.seed); // ▶JungleShrines cs:16059
  ctxShrineSpots[0] = gs.seedFlags.dualDungeons ? [] : runJungleShrinePass(store, rng, gs);
  // ★IIIII98 探针钩（dormant，零开销）：神龛点跨槽上下文对单 pass 反演重放仪可见
  try { (globalThis as { __swJCSpots?: unknown }).__swJCSpots = ctxShrineSpots[0]; } catch { /* probe */ }
  // Webs(51) 已按注册序回到 #27 位（vanillaBiomes 前段）——此处旧迟置调用已删
  // 附魔剑圣地已归位到 MicroBiomes pass 内(ThinIce 与 Campsite 之间,原版 cs:21858-21908)
  // ——SwordShrinePass 曾在此槽近似执行(管线错位+洞穴中心方向颠倒),2026-08-13 移除;
  //   逻辑重写落在 MicroBiomesPass.placeEnchantedSwordShrine
}

// 雕像+箱族合并槽（原版注册序 Statues(16947) → UndergroundHousesAndBuriedChests
// (17066,#58 四循环) → SurfaceChests(17226) → ChestsInJungleShrines(17308) →
// UnderwaterChests+WaterChests(17343) → SpiderCaves(17455)）——2026-08-16 前内嵌
// 「结构」槽尾（执行位≈16059 之后即刻）= 比 Statues 原版位提前约 900 行的顺序
// 偏差，R 批整体后移至 LifeCrystals(16847) 之后归位。#58 四循环合一：洞穴箱→
// 地狱箱→地下小屋（含沙漠附加屋）按原版循环序排列（cs:17100/17122/17139/17194），
// 头尾 226/162/225/190 四翻接线（cs:17076-79/17220-23）——地狱箱曾独立占「地狱箱」
// 槽、且洞窟箱/地狱箱此前在四翻窗口之外（placeBuriedChest 的 genSolidType 落地
// 行锚定与原版相悖），R 批一并修正。
function statuesChestsPass({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // ★IIIII44：本束全部成员原版门——Statues cs:16964(denySome) / UndergroundHousesAndBuriedChests
  //   :17083(denySome； attempts 10000→100 窗口在门内不可达) / SurfaceChests :17243
  //   (denySome&&!noSurface) / ChestsInJungleShrines :17325 / UnderwaterChests :17360 /
  //   SpiderCaves :17472（denyAll）——天空盒世界整束跳过（含 #58 头尾四翻与四计数连掷
  //   的窗口本身，x86 实证 slot58..63 零掷冻结）。
  if (sbDenySome(gs.seedFlags)) return;
  // ★每个都是独立 GenPass——RunPass 每 pass 前重播种子。#58 四循环（洞穴箱/地狱箱/
  //   小屋）同属 UndergroundHousesAndBuriedChests(17066) 一个 pass，内部不重播。
  rng.reseed(gs.seed); // ▶Statues cs:16947
  runStatuesPass(store, rng, gs);                        // 雕像 73 序+陷阱雕像接线
  // ★#58 头四翻(cs:17076-17079)：226 蜥蜴砖/162 薄冰/225 蜂巢块/190 荧光菇块
  //   短暂回实心——原版窗口覆盖洞穴箱+地狱箱+小屋全部四循环
  rng.reseed(gs.seed); // ▶UndergroundHousesAndBuriedChests cs:17066（#58 一个 pass）
  flipGenSolid([226, 162, 225, 190], true);
  // ★pass 59(#58) 头四计数连掷(cs:17081-17084:CaveHouse→Underworld→CaveChest→
  //  AdditionalDesert)——pass 拆分后各消费 pass 流位分散,统一在此(第一个消费
  //  pass 之前)预掷暂存 gs;此前 CaveChest→CaveHouse→AdditionalDesert 逐段自掷,
  //  序与流位均偏
  rollHouseChestCounts(store, rng, gs);
  // IIII52 探针钩（dormant，零开销）：pass59 入口态导出——store/gs/chests 快照供
  //   离线重放 harness（tools/_i54exp / _i54rep）使用；正常生成无钩不受影响。
  try { (globalThis as { __i54Ctx?: (st: TileStore, g: unknown, ch: unknown) => void }).__i54Ctx?.(store, gs, world.chests); } catch { /* probe */ }
  runBuriedChestsPass(store, rng, gs, world.chests);     // 循环① 洞穴箱(cs:17100-17118;洞穴金/冰箱/沙箱)
  runUnderworldChestsPass(store, rng, gs, world.chests); // 循环② 地狱箱(cs:17122-17146;须在地狱地形+地狱屋之后——两者均在「生物群系」槽内 ✓)
  runCaveHousesPass(store, rng, gs, world.chests);       // 循环③④ 地下小屋七主题+沙漠附加屋(内部头尾四翻与此处重放同值)
  // #58 尾四翻(cs:17220-23)——runCaveHousesPass 内部尾翻已达成同值,此处重放仅存档时间线
  flipGenSolid([226, 162, 225, 190], false);
  rng.reseed(gs.seed); // ▶SurfaceChests cs:17226
  runSurfaceChestsPass(store, rng, gs, world.chests);    // Surface Chests(地表木箱/天空箱;只放一次——曾双调致密度翻倍)
  rng.reseed(gs.seed); // ▶ChestsInJungleShrines cs:17308
  if (!gs.seedFlags.dualDungeons) {
    runJungleChestsPass(store, rng, gs, world.chests, ctxShrineSpots[0]); // 常春藤箱(神龛中心)
  }
  rng.reseed(gs.seed); // ▶UnderwaterChests(+WaterChests) cs:17343
  runUnderwaterChestsPass(store, rng, gs, world.chests, ctxOceanTreasures[0]); // 海洋洞窟水箱
  runWaterChestsPass(store, rng, gs, world.chests);      // Water Chests(水中 style17;1.4.4 概念保留)
  rng.reseed(gs.seed); // ▶SpiderCaves cs:17455
  runSpiderNestPass(store, rng, gs, world.chests);       // Spider Caves(countTiles 门+波前BFS刷墙62+蛛网罐/箱/垂网/覆饰)
  // WebsInSpiderCavesAndHoney(cs:20140)按注册序(DyePlants 20126 < 本 pass <
  // GrassPlants 20232)在「蛛网蜂巢」独立槽(2026-08-13 Batch D)
}

// 神庙陈设（LihzahrdTemplePart2 cs:17809）——templePart2 五段独立槽
function templePart2Slot({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenyAll(gs.seedFlags)) return;                 // ★IIIII44 cs:17826
  if (!gs.seedFlags.dualDungeons) runTemplePart2Pass(store, rng, gs, world.chests); // ★IIIII78 禁表
}

// 浮空岛日光板房屋（FloatingIslandHouses cs:17971；前置「地下丛林树」槽已 2026-08-16
// 补缺（UndergroundJungleTrees cs:17952），注册序 CaveWalls < UndergroundJungleTrees
// < 本 pass < QuickCleanup）
function islandHouseSlot({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyFloatingIslands(gs.seedFlags)) return;   // ★IIIII44 cs:17988
  runIslandHousePass(store, rng, gs, world.chests);
}

// 原版 pass 37 Clean Up Dirt:表层墙清理 + 连通小块(<20)清除
export function vanillaCleanup({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenyAll(gs.seedFlags)) return;                 // ★IIIII44 cs:15324
  rng.reseed(gs.seed); // ▶DirtWallCleanup cs:15310
  runCleanupPass(store, rng, gs);
}

// 生命水晶(pass 55)——清完散块后放
function vanillaLifeCrystals({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenySome(gs.seedFlags)) return;                // ★IIIII44 cs:16864
  // ★UUUUUU：NotTheBees() 槽头（LifeCrystals cs:16861——errorWorld/getGood 门后首掷位）
  if (gs.seedFlags.notTheBees && !gs.seedFlags.skyblock) runNotTheBees(store, rng, gs);
  runLifeCrystalsPass(store, rng, gs);
}

// 原版 "Smooth World"(L7568)：地表凸起 → 半砖/削除（HalfBrickPass）
function halfBrickSmoothPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runSmoothWorldPass(store, rng, gs);
}

// 原版 "Waterfalls"(L7697)：水边唇缘砸半砖（瀑布触发来源）
function waterfallLipPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:16714
  runWaterfallLipPass(store, rng, gs);
}

// 沙上清水（RemoveSurfaceWaterAboveSand cs:16295）：零掷骰
function surfaceWaterAboveSandPass({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:16309
  runRemoveSurfaceWaterAboveSandPass(store, gs);
}

// 薄冰（FragileIceOverIceBiomeWater cs:16756）：零掷骰
function fragileIcePass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenySome(gs.seedFlags)) return;                // ★IIIII44 cs:16773
  // ★UUUUUU：NotTheBees() 槽头（cs:16762——pass 头首掷消费者位）
  if (gs.seedFlags.notTheBees && !gs.seedFlags.skyblock) runNotTheBees(store, rng, gs);
  runFragileIcePass(store, gs);
}

// 蜂巢幼虫（BeeLarvaInBeehives cs:21018）：蜂巢 pass 已登记坐标，此处放置
function beeLarvaPass({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:21038
  if (!gs.seedFlags.dualDungeons) runBeeLarvaPass(store, gs); // ★IIIII78 禁表（双地牢无蜂巢）
}

// 地狱熔炉(原版 Hellforges,cs:18298)
function hellforgesPass({ store, rng }: GenCtx) {
  runHellforgesPass(store, rng, ctxGs[0] ?? undefined);
}

// 矿/骨堆（原版 pass 81 Piles，cs:18900-19599 七子段 1:1——见 vanilla/PilesPass.ts；
// 旧实现 w*0.06 单段近似 + 30% 小堆/骨堆自造掷骰，与原版完全不符，已整体替换）
function pilesPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenySome(gs.seedFlags)) return;                // ★IIIII44 cs:18920
  runPilesPass(store, rng, gs);
}

// 原版 pass 76 Traps（cs:18769）。★EEEE 批 2026-08-18：槽 76 在原版只有 Traps——
// 旧"地表装饰近似段"（runSurfaceDecorPass：JS 自造流写 TALLGRASS/FLOWER/VINE，
// 无原版对应物）整段退役（WWW 批定罪 #76 自因 1048 格；与 #78 Spawn_Point 自造
// 清理盒同类自创写入）。杂草/花/藤/蘑菇由后续槽 86-91（GrassPlants/Vines/Flowers/
// Mushrooms，均 1:1）承担，雪原不长草测试不受影响。
function vanillaSurfaceDecor({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  rng.reseed(gs.seed); // ▶Traps cs:18769
  // SSSSS：CheckChest 语境需箱注册表（CanDestroyChest 有物箱不可毁）
  runTrapsPass(store, rng, gs, world.chests); // 原版 pass 76 Traps（返回 slot15 排查计数回归）
}

// 宝石系统（原版序 GemCaves → ExposedGems → SpeleothemsAndGemTrees；
// GemCaves 已按注册序前移到"宝石洞"独立槽——必须先于苔藓与洞穴墙）
function gemCavesPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // ★UUUUUU：GemCaves 整 pass 跳过（cs:17545 `!Skyblock.denyAllGeneration && !notTheBees`
  //   ——NTB 蜂蜜世界被蜂巢块取代；★IIIII44 补 skyblock 半边：旧条件 `ntb&&!skyblock`
  //   会让天空盒跑宝石洞=与原版相悖，x86 实证 slot64 零掷）
  if (gs.seedFlags.notTheBees || sbDenyAll(gs.seedFlags)) return;
  runGemCavesPass(store, rng, gs);
}

function vanillaGems({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // ★IIIII44：ExposedGemsInIceBiome(cs:20862)/ExposedGemsUnderground(cs:20894)
  //   均 `!Skyblock.denyAllGeneration` 整门（x86 实证 slot92/93 零掷）
  if (sbDenyAll(gs.seedFlags)) return;
  // ★原版 1456 是两个独立 GenPass：ExposedGemsInIceBiome(20842) / ExposedGemsUnderground
  //   (20874)——每 pass 前重播种子。曾一函数一气流 → #93 掷流错位（WWW 批拆分）。
  rng.reseed(gs.seed); // ▶ExposedGemsInIceBiome cs:20842
  runExposedGemsIcePass(store, rng, gs);
  rng.reseed(gs.seed); // ▶ExposedGemsUnderground cs:20874
  runExposedGemsUndergroundPass(store, rng, gs);
}

/** SpeleothemsAndGemTrees（cs:22196-22282）——独立槽（清零批 2026-08-13
 *  前捆绑在 vanillaGems 内 ≈20842 位执行，顺序偏差已归位，见"钟乳石宝石树"槽注释） */
function speleothemSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runGemTreesPass(store, rng, gs);
}

/** SunflowersPart2（cs:20043-20084）——普通种子向日葵唯一生成来源 */
function sunflowersSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenySome(gs.seedFlags)) return;                // ★IIIII44 cs:20063
  runSunflowersPart2Pass(store, rng, gs);
}

/** JunglePlantsPart2（cs:20310-20337）——地表丛林大株植物 233 */
function junglePlantsSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenySome(gs.seedFlags)) return;                // ★IIIII44 cs:20330
  runJunglePlantsPart2Pass(store, rng, gs);
}

/** DirtWallsIntoMudWallsInJungle（cs:20963-21017）——丛林表层泥墙→丛林泥墙 15 */
function jungleMudWallsSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenyAll(gs.seedFlags)) return;                 // ★IIIII44 cs:20985
  runJungleMudWallsPass(store, rng, gs);
}

/** LihzahrdAltar 终保 pass（cs:21753-21791）——TileCleanup 后重放祭坛 */
function lihzahrdAltarSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenyAll(gs.seedFlags)) return;                 // ★IIIII44 cs:22133
  if (!gs.seedFlags.dualDungeons) runLihzahrdAltarPass(store, gs, rng); // ★IIIII78 禁表
}

// 洞穴墙（CaveWallsInEnclosedSpaces cs:17819）+ 墙变体（CaveWallVariety cs:16786）
function caveWallsPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runCaveWallsPass(store, rng, gs);
}

// 遗留批接线包装（原版注册序：Oasis 16327 / CactusPalmTreesAndCoral 21115 /
// TileCleanup 21327 / BrokenTrapCleanup 22283 / FinalCleanup 22304）
function oasisPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runOasisPass(store, rng, gs);
}

function cactusCoralPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runCactusPalmTreesAndCoralPass(store, rng, gs);
}

function tileCleanupPass({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenySome(gs.seedFlags)) return;                // ★IIIII44 cs:21702
  runTileCleanupPass(store, rng, gs, world.chests);
}

function brokenTrapCleanupPass({ store, rng, world }: GenCtx) {
  // cs:22286 门：!noTraps || tenthAnniversary || notTheBees——普通世界恒跑
  const f = world.seedFlags;
  if (f?.noTraps && !f?.tenthAnniversary && !f?.notTheBees) return;
  // ★AAAAAA：透传 rng——KillTile 改派引擎（尘掷表+级联，#104 孤儿 411 案）
  runBrokenTrapCleanupPass(store, rng);
}

function finalCleanupPass({ store, rng, world }: GenCtx) {
  // ★SSSSSS：opts.chests 透传——FinishNoTraps (E) 段（每箱 1/15 塞 5346 Gas Trap）
  // ★TTTTTTT：opts.beforeShimmer 接线 FinalSeedCleanup（1457 WorldGen.cs:22666
  //   SecretSeed.FinalizeSecretSeeds() 在 pass 体【内】、ShimmerCleanUp 之前；
  //   :692 尾部无条件调 FinalSeedCleanup :695 悬空 Falling 块静态化）。曾挂在
  //   generateWorld 尾（finalize 之后）=时点晚于 dump #105 快照位，mile8 槽 57
  //   对拍把静态化差全记在 #105（const/s22222 T1>332×11 金币堆假债主）。
  //   ★IIIII17（2026-08-28）：FinalizeSecretSeeds 内端点按原版序挂载——
  //   #18 portalGunInChests → DoPortalGunInChests(:3004，rainbowStuff(IIIII16 已落)
  //   之后、worldIsFrozen Finish/errorWorld Finish/FinalSeedCleanup 尾扫之前)。
  //   掷流走本 pass 自有流(genRand 在 RunPass 头重播;旗关零掷);后续批次补
  //   worldIsFrozen Finish/errorWorld Finish/teamBasedSpawns 时按 vanilla 序插在
  //   本钩子内 portalGun 与 finalSeedCleanup 之间。
  runFinalCleanupPass(store, ctxGs[0]!, rng, {
    chests: world.chests as never,
    beforeShimmer: () => {
          // ★IIIII16（2026-08-28）：FinalizeSecretSeeds 终结面九旗标子集，按 cs:589-663
          //   原 if 链序——surfaceIsInSpace(:599) → surfaceIsMushrooms(:607-614 含 !noSurface
          //   时 **连调两次** 的怪癖照录) → noInfection(:619) → hallowOnTheSurface(:623)
          //   → startInHardmode(:1905，Main.hardMode+initializeHardMode V 带) →
          //   rainbowStuff(:2715)。全部位于 portalGun(:663) 之前；逐旗独立门内消费
          //   genRand ⇒ 普通种子零掷零写。实现体 = vanilla/SecretSeedDoEndsPass.ts。
          //   ★双态注：本子集函数体 1457≡1458≡1456 三树逐字相同且旗关零掷——
          //   故不套 hfIs1457 门，两种基线态都按原版位执行（默认运行时也可玩秘种子）。
          finalizeSecretSeedDoEnds(store, rng, ctxGs[0]!, world);
          // ★IIIII17：FinalizeSecretSeeds 已实装端点按原版序——#18 portalGunInChests
          //   （cs:3004;rainbowStuff 之后、worldIsFrozen Finish/errorWorld Finish/
          //   FinalSeedCleanup 尾扫之前）。掷流走本 pass 流（旗关零掷）;
          //   ★IIIII16 批已并入 space/mushrooms/noInfection/hallow/startInHardmode/
          //   rainbowStuff 六端点于上方（均在本钩 rainbow 位之后、portalGun 位之前），
          //   此处即 cs:22666 可达面全序，后续批次按 vanilla 序插在本钩子内。
          if (hfIs1457()) {
            if (ctxGs[0]!.seedFlags?.portalGunInChests) {
              doPortalGunInChests(world.chests as never, () => rng.nextInt(7) === 0);
            }
            finalSeedCleanup(store, ctxGs[0]!.seedFlags ?? {}, world.chests as never);
          }
        },
  });
  // ★IIIII21（2026-08-28）：FinishDrunkGen（WorldGen.cs:26493-26611，调用点 :22630
  //   FinalCleanup pass 体内 noTraps/tenth 之后、notTheBees/getGood/remix/LiquidCheck
  //   之前）——paint/wallColor 三链 + 宝箱红药水/月总腿尾修。旗关零掷骰=普通种子
  //   全流零扰动。
  if (ctxGs[0]!.seedFlags?.drunkWorld) {
    runFinishDrunkGenPass(store, rng, ctxGs[0]!, world.chests);
  }
  // ★DDDDDD 批（2026-08-21）归位：原版 FinalCleanup pass 体末的全图 LiquidCheck
  // (createMergeTilesDuringGen:true)（cs:22639-50，ShimmerCleanUp 之后）——曾挂在
  // #49/#97 沉降尾（settle.ts，时点早 8 pass）。终清理槽直调，掷骰走 pass 链流。
  finalGenMergeScan(store, rng);
  // KKKK 移交（2026-08-18，IIII 批落地）：槽 101 v_383 活红木等后至写入可覆写已
  // 登记树的冠格（vanilla SkipTiles={21,467,226,237} 不含树干=原版语义覆写，tile
  // 侧无债）——管线尾修剪幽灵登记（冠格失活/非树族即出表），防运行期砍伐判定/
  // 树冠摆动误读残条目。GGGG 的 Flowers 尾修剪只覆盖槽 90 时点，本修剪收全尾段。
  {
    // sheetOfInternal：内部 id → 原版 sheet（TILE_DEFS.vanilla.sheet）。
    // ★须修剪 gs.genTrees（finalize `world.trees = gs.genTrees` 会整表覆写）
    const sh2 = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? -1;
    const alive = (tr: { x: number; y: number; h: number }) => {
      const i = store.idx(tr.x, tr.y);
      if (!store.flags[i]) return false;
      const s = sh2(store.type[i]!);
      return s === 5 || s === 23 || s === 323;
    };
    ctxGs[0]!.genTrees = ctxGs[0]!.genTrees.filter(alive);
    world.trees = ctxGs[0]!.genTrees;
  }
}

function multitileSweepPass({ store }: GenCtx) {
  runMultitileFragmentSweepPass(store);
}

// ---- Batch D 顺序归位包装(2026-08-13)----
// 原版注册序:GrassWall(19734) < SpawnStarterNPCs(19830,读档侧) < Trees(20085)
// < AlchemyHerbs(20109) < DyePlants(20126) < WebsInSpiderCavesAndHoney(20140)
// < GrassPlants(20232) < GlowingMushroomPlants+JunglePlants(20278) < Vines(20338)
function treesPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:20105
  runTreePass(store, rng, gs);
}

function alchemyHerbsSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:20129
  runAlchemyHerbsPass(store, rng, gs);
}

function websInSpiderCavesSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenySome(gs.seedFlags)) return;         // ★IIIII44 cs:20160
  runWebsInSpiderCavesPass(store, rng, gs);
}

function grassPlantsSlot({ store, rng }: GenCtx) {
  // ★IIIII44：GrassPlants(cs:20229)/GlowingMushroomPlants+JunglePlants(cs:20287)
  //   均 `!Skyblock.denySomeGeneration` 整门——天空盒两支全跳（含南瓜季臂=pass 内部，
  //   原版整 pass 不进）
  if (sbDenySome(ctxGs[0]?.seedFlags)) return;
  // GrassPlants(20232)/GlowingMushroomPlants(20278) 是两个独立 GenPass
  rng.reseed(ctxGs[0]!.seed); // ▶GrassPlants cs:20232
  // ★IIIII16：南瓜季臂（cs:20232-20248，halloweenGen||endlessHalloween 门在函数体内；
  //   位于地表植物散布循环之前=原版 pass 头位）
  pumpkinSeasonArm(store, rng, ctxGs[0]!);
  runGrassPlantsPass(store, rng);
  rng.reseed(ctxGs[0]!.seed); // ▶GlowingMushroomPlants cs:20278
  const gs = ctxGs[0];
  if (gs) runGlowingMushroomPlantsPass(store, rng, gs);
}

function caveWallVarietyPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:16805
  runCaveWallVarietyPass(store, rng, gs);
}

// 苔藓（原版 MossAndMossCaves cs:17573-17833）
function vanillaMoss({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  // 原版门 cs:17596 `!Skyblock.denyAllGeneration && !worldIsFrozen &&
  //   (!notTheBees || remixWorldGen || dontStarveWorldGen)`——★IIIII44 补前两项：
  //   skyblock/永冬世界苔藔全跳（旧条件只有 NTB 半边且放天空盒跑苔藔=与原版相悖）
  const f = gs.seedFlags;
  if (sbDenyAll(f) || f.worldIsFrozen ||
      (f.notTheBees && !f.remix && !f.theConstant)) return;
  runMossAndMossCavesPass(store, rng, gs);
}

// 草墙（原版 SurfaceDirtWallsToGrassWalls cs:19734-19824）
function vanillaGrassWall({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runGrassWallPass(store, rng, gs);
}

// ★IIIIIII6：起始镇民（原版 SpawnStarterNPCs cs:19848-20068）。掷流 = 每命名镇民
// 2×Next(名字类目宽)（GiveTownUniqueDataToNPCsThatNeedIt），白兔另有 variant/B 两掷；
// RunPass 每 pass 头重播种子（WorldGenerator.cs:497）故不外溢下游 pass——starterNpcsPass
// 内部注有逐行锚点
function starterNpcsSlot(ctx: GenCtx) {
  starterNpcsPass({ store: ctx.store, rng: ctx.rng, world: ctx.world });
}

// 海滩装饰：贝壳堆 + 海藻（原版 ShellPiles pass + GrowCheckSeaweed）
function vanillaBeachDecor({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:16367
  runBeachDecorPass(store, rng, gs);
}

// 引力沙（原版 GravitatingSandCleanup cs:15198-15226）：地表内悬空 Falling 系落定
// （导出签名保持只读 store——caves-checkpoint 直调本函数对账,勿内嵌其他 pass）
export function gravitatingSandPass({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runGravitatingSandPass(store, gs);
}

// 引力沙槽 = GravitatingSand(#36) + OceanCaves(#37)（cs:15198 → cs:15228 注册序，
// 2026-08-16 归位——此前 OceanCaves 在 vanillaBiomes 尾早于引力沙，清点表偏差①）
function gravitatingSandSlot(ctx: GenCtx) {
  gravitatingSandPass(ctx);
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenyAll(gs.seedFlags)) return;                 // ★IIIII44 cs:15242
  const { store, rng } = ctx;
  rng.reseed(gs.seed); // ▶OceanCaves cs:15228
  // 海洋洞窟蠕虫+宝藏点记录(→「雕像宝箱」槽 UnderwaterChests 消费)
  ctxOceanTreasures[0] = runOceanCavesPass(store, rng, gs);
  // ★IIIII98 探针钩（dormant，零开销）：海洋宝藏点对单 pass 反演重放仪可见
  try { (globalThis as { __swOceanTreasures?: unknown }).__swOceanTreasures = ctxOceanTreasures[0]; } catch { /* probe */ }
}

// 地下丛林树（原版 UndergroundJungleTrees cs:17952-17970 + GrowUndergroundTree
// cs:31007）：全列 × [worldSurface-1,h-350) Next(10)==0 门 → 丛林草基座地下树
function undergroundJungleTreesSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs || sbDenyAll(gs.seedFlags)) return;          // ★IIIII44 cs:17969
  rng.reseed(gs.seed); // ▶UndergroundJungleTrees cs:17952
  runUndergroundJungleTreesPass(store, rng, gs);
}

// 快清理（原版 QuickCleanup cs:17987-18107 五子段，见 QuickCleanupPass.ts 头注）
function quickCleanupSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  if (sbDenyAll(gs.seedFlags)) return;                 // ★IIIII44 cs:18004
  rng.reseed(gs.seed); // ▶QuickCleanup cs:17987
  // ★UUUUUU：NotTheBees() 槽头（cs:17993——progress 门后首掷消费者位）
  if (gs.seedFlags.notTheBees && !gs.seedFlags.skyblock) runNotTheBees(store, rng, gs);
  runQuickCleanupPass(store, rng, gs);
}

// 原版 pass 与旧 pass 的桥接存储(单次生成生命周期)
const ctxGs: [GenState | null] = [null];
/** OceanCaves(生物群系槽 15228) → UnderwaterChests(雕像宝箱槽 17343) 的宝藏点跨槽传递 */
const ctxOceanTreasures: [Array<{ x: number; y: number }>] = [[]];
/** JungleShrines(结构槽 16059) → ChestsInJungleShrines(雕像宝箱槽 17308) 的神龛坐标跨槽传递 */
const ctxShrineSpots: [Array<{ x: number; y: number }>] = [[]];
/** 探针/测试用：最近一次生成的 GenState（山丘坐标等） */
export function lastGenState(): GenState | null { return ctxGs[0]; }
/** 探针用（WWW 批 golden 基座重放 rig）：注入 GenState 到生成期槽位——生产路径勿用。 */
export function __setGenStateForProbe(gs: GenState | null): void { ctxGs[0] = gs; }

function nextFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}


// ---------- 地狱层(原版 Underworld pass,L5952,完整) ----------
// 1) 边界随机走(h-190..h-160),界上~20格灰烬,界下清空;
// 2) 岩浆线随机走(h-120..h-60),线以下空气灌岩浆;
// 3) 大灰烬丘陵(addTile 填充虚空)+ 横向灰烬团 + 挖掘隧道(填岩浆);
// 4) 底部 h-145/144 岩浆层 + 地狱石 58 矿脉
function hellPass({ store, rng }: GenCtx) {
  const gsUW = ctxGs[0];
  if (!gsUW) return;
  if (sbDenyAll(gsUW.seedFlags)) return;               // ★IIIII44 cs:13711
  runUnderworldPass(store, rng, gsUW);
}

/** 地狱专用 runner:超界安全(地狱区常越界) */
function tileRunnerHell(st: World['store'], rng: RNG, gs: GenState, i: number, j: number,
  strength: number, steps: number, type: number, addTile: boolean,
  speedX: number, speedY: number, noYChange: boolean): void {
  tileRunner(st, rng, gs, i, Math.max(2, Math.min(st.h - 3, j)), {
    strength, steps, type, addTile, speedX, speedY, noYChange,
  });
}


// ---------- 墓园群系（原版 SpawnGraveyardBiomesEverywhere cs:25074-25096） ----------
// 调用位 = PotsGraveyardsAndBoulderPiles pass 首段（cs:18108-18120）——**秘密种子专属**：
//   (dontStarve && (drunk || getGood) && !tenthAnniversary) || graveyardBloodmoonStart
// 普通世界不调用（墓园的常态来源 = 玩家自放墓碑 tile 85 计数，SceneMetrics 侧已就位）。
// 每处 SpawnGraveyardBiome（cs:25098-25165）：锚点上下归位 → 81×81 排斥扫描 →
// 5000 次尝试放 2×2 墓碑 + 写 Epitaph 碑文（cs:25161——RandomText.ts 数据的唯一消费端）。
const GY_EXCLUDE_SHEETS = new Set([
  25, 203, 53, 191, 383, 226, 225, 367, 368, 57, 70, 189,   // cs:25124 字面 id
  41, 43, 44, 481, 482, 483,                                 // tileDungeon[] 全表
]);

/** IsTileNearby（cs:8828-8850）：type!=235 时步长 1 的方形邻域扫描 */
function isTileNearby(store: TileStore, x: number, y: number, sheet: number, distance: number): boolean {
  for (let i = x - distance; i <= x + distance; i++) {
    for (let j = y - distance; j <= y + distance; j++) {
      if (!store.inBounds(i, j)) continue;
      if (store.flags[store.idx(i, j)] && TILE_DEFS[store.type[store.idx(i, j)]]?.vanilla?.sheet === sheet) {
        return true;
      }
    }
  }
  return false;
}

/** 墓园 pass 触发门（cs:18110-18120 原文条件）：
 *  `!Skyblock.denySomeGeneration && ((dontStarve && (drunk || getGood) && !tenthAnniversary)
 *   || SecretSeed.graveyardBloodmoonStart.Enabled)`
 *  注：1.4.5.6 "getfixedboi"（Everything）七依赖全开（WorldSeedOption_Everything.cs:24-31，
 *  含 DontStarve 与 Anniversary）→ 被最后的 !tenthAnniversary 否决（S0-2 后 parseSeed
 *  同表全置，与原版 zenith 逐门同值）。 */
export function graveyardSeedGate(sf: import('./SeedEasterEggs').SeedFlags): boolean {
  if (sf.skyblock) return false;                                    // :18110 Skyblock.denySomeGeneration
  return (sf.theConstant && (sf.drunkWorld || sf.getGoodWorld) && !sf.tenthAnniversary)
    || !!sf.graveyardBloodmoonStart;                                 // :18117-18120
}

export function spawnGraveyardBiome(
  store: TileStore, rng: RNG, world: World, X: number, Y: number,
): void {
  const TOMB = TILE_BY_KEY['tombstone_v'];
  if (TOMB === undefined) return;
  const num = 40;                 // cs:25100 半径
  const distance = 3;             // cs:25101 墓碑排斥距离
  const num2 = 5000;              // cs:25102 尝试次数
  const underworldLayer = store.h - 200;   // Main.UnderworldLayer = maxTilesY-200（Main.cs:2863）
  // 锚点归位（cs:25103-25119）：先向上跳出实心，再下落到首个实心
  while (store.inBounds(X, Y) && store.flags[store.idx(X, Y)]) {
    Y--;
    if (Y < 100) return;          // cs:25106-25109
  }
  Y++;
  while (store.inBounds(X, Y) && !store.flags[store.idx(X, Y)]) {
    Y++;
    if (Y > underworldLayer - 100) return;   // cs:25115-25118
  }
  if (!store.inBounds(X, Y)) return;
  // 81×81 排斥扫描（cs:25120-25129）：命中任一排斥族 tile 整处放弃
  // （anyShimmer 涂层门：生成期无任何 tile 带微光涂层，恒 false，省略即等价）
  for (let i = X - num; i <= X + num; i++) {
    for (let j = Y - num; j <= Y + num; j++) {
      if (!store.inBounds(i, j) || !store.flags[store.idx(i, j)]) continue;
      if (GY_EXCLUDE_SHEETS.has(TILE_DEFS[store.type[store.idx(i, j)]]?.vanilla?.sheet ?? -1)) return;
    }
  }
  for (let k = 0; k < num2; k++) {
    // cs:25132-25133：Next(-40, 41)（含 +40）
    let num3 = X + rng.int(-num, num);
    let num4 = Y + rng.int(-num, num);
    // cs:25134-25136：InWorld(num3,num4,50) 且目标格须空气
    if (num3 < 50 || num4 < 50 || num3 >= store.w - 50 || num4 >= store.h - 50) continue;
    if (store.flags[store.idx(num3, num4)]) continue;
    // cs:25138-25146：向下落到首个实心（越界 55 边距 → 钉在 maxTilesY-50）
    while (store.inBounds(num3, num4) && !store.flags[store.idx(num3, num4)]) {
      num4++;
      if (num3 < 55 || num4 < 55 || num3 >= store.w - 55 || num4 >= store.h - 55) {
        num4 = store.h - 50;
        break;
      }
    }
    num4--;                        // cs:25147：锚格定在首实心上一格
    // cs:25148-25151 放置门禁：右邻非空 / 3 格内有墓碑 / 落点有液体 /
    // 下方双列非实心支撑 → 全部 continue
    if (!store.inBounds(num3, num4) || !store.inBounds(num3 + 1, num4 + 1)) continue;
    if (store.flags[store.idx(num3 + 1, num4)]) continue;
    if (isTileNearby(store, num3, num4, 85, distance)) continue;
    if (store.liquid[store.idx(num3, num4)] !== 0) continue;
    let supported = true;
    for (const dx of [0, 1]) {
      const gi = store.idx(num3 + dx, num4 + 1);
      if (!store.flags[gi] || !TILE_DEFS[store.type[gi]]?.solid) { supported = false; break; }
    }
    if (!supported) continue;
    // cs:25152-25155：支撑格清坡面/半砖
    for (const dx of [0, 1]) {
      const gi = store.idx(num3 + dx, num4 + 1);
      store.slope[gi] = 0;
      store.half[gi] = 0;
    }
    // PlaceTile(num3, num4, 85, style=Next(6))（cs:25156）。tile 85 的 TileObject 锚 =
    // 【底行左格】（同 Projectile aiStyle17 的落点语义——Tombstone.ts 注释 :23689）：
    // 对象占 num4-1..num4 两行，支撑在 num4+1。净空不足（CanPlace false）则跳过且不立碑
    let clear = true;
    for (let dy = -1; dy <= 0 && clear; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        if (store.flags[store.idx(num3 + dx, num4 + dy)]) { clear = false; break; }
      }
    }
    if (!clear) continue;
    const style = rng.int(0, 5);
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        store.setTileSilent(num3 + dx, num4 - 1 + dy, TOMB, style * 36 + dx * 18, dy * 18);
      }
    }
    // Sign.ReadSign/TextSign（cs:25158-25162）：ReadSign 按 frameX/Y 归一到对象【左上】格
    // （Sign.cs:26-30 num%=2 / num2%=2 回退），Tombstone.ts 的 {x, y=top} 同口径
    if (!world.signs.some((s) => s.x === num3 && s.y === num4 - 1)) {
      world.signs.push({ x: num3, y: num4 - 1, text: randomEpitaph() });
    }
  }
}

export function spawnGraveyardBiomesEverywhere(
  store: TileStore, rng: RNG, world: World, gs: GenState,
): void {
  const num = Math.floor(store.w / 4200);    // cs:25076 C# int/int 截断（小/中 1，大 2）
  const bd = gs.beachDistance;               // 380（WorldGen.cs:4102 常量）
  const underworldLayer = store.h - 200;
  // 地表批（cs:25077-25089）：worldSurface>150 时 10×num 处，锚 y ∈ [150, worldSurface)
  if (gs.worldSurface > 150) {
    const hi = store.w - bd - 100;
    if (bd + 100 < hi) {
      for (let i = 0; i < 10 * num; i++) {
        let num2 = rng.int(bd + 100, hi - 1);            // cs:25081 Next(bd+100, w-bd-100)
        while (num2 > store.w * 0.48 && num2 < store.w * 0.52) {  // cs:25082-25085 避开出生带
          num2 = rng.int(bd + 100, hi - 1);
        }
        const y = rng.int(150, Math.max(150, gs.worldSurface - 1)); // cs:25086 Next(150, worldSurface)
        spawnGraveyardBiome(store, rng, world, num2, y);
      }
    }
  }
  // 地下批（cs:25090-25095）：30×num 处，锚 y ∈ [worldSurface+50, underworldLayer-100)
  const lo = gs.worldSurface + 50;
  const hi2 = underworldLayer - 100;
  if (bd + 100 < store.w - bd - 100 && lo < hi2) {
    for (let j = 0; j < 30 * num; j++) {
      const x = rng.int(bd + 100, store.w - bd - 100 - 1); // cs:25092
      const y2 = rng.int(lo, hi2 - 1);                     // cs:25093
      spawnGraveyardBiome(store, rng, world, x, y2);
    }
  }
}

// ---------- 瓦罐散布 ----------
function potPass({ store, rng, world }: GenCtx) {
  // 原版 Pots pass(1.4.5.6 WorldGen.cs:18108-18286)——实现体外提 vanilla/PotsPass.ts
  // （尾部清剿批 2026-08-17：行为/掷序零变化；样式链/PlacePot 细注见彼处）。
  const gs = ctxGs[0];
  if (!gs) return;
  // ★IIIII44：PotsGraveyardsAndBoulderPiles 整门 cs:18125 `!Skyblock.denySomeGeneration`
  //   （teleporter/墓园/巨石三角/瓦罐四段全在门内）——天空盒世界整 pass 跳过
  //   （graveyardSeedGate 的 skyblock 早退是其子集;x86 实证 slot71 零掷）。
  if (sbDenySome(gs.seedFlags)) return;
  // ---- ★1457 传送门放置（TeleporterGenerator，cs:18128-18134 本 pass 首段，
  //      先于墓园/瓦罐消耗 RNG 流；"beam me up" 秘密种子专属，普通世界零掷）----
  //  skyblock 变体臂 cs:16700-16705 登记不接（本仓无 skyblock 生成管线）。
  //  spawn 距门传 (0,0)：生成期 Main.spawnTile 尚为静态缺省 0（clearWorld/Reset
  //  均不复位，SpawnPoint pass cs:19605 在本 pass 之后）→ <20 门恒不触发
  runTeleporterPass(store, rng, gs, {
    addTeleporters: !!gs.seedFlags?.addTeleporters,
    dualDungeons: !!gs.seedFlags?.dualDungeons,
    skyblock: false,                                // cs:16700 臂未接（见上注）
    spawnX: 0,
    spawnY: 0,
  });
  // ---- 墓园群系（cs:18110-18120：本 pass 首段，先于瓦罐消耗 RNG 流）----
  // 门见 graveyardSeedGate（秘密种子专属；普通世界零墓碑=原版常态）
  if (graveyardSeedGate(gs.seedFlags)) {
    spawnGraveyardBiomesEverywhere(store, rng, world, gs);
  }
  // ---- ★QQQQQQQQ 位次勘误（1457 cs:18135-18204）：noTraps/errorWorld 巨石三角段
  //      归属 **本 pass**（teleporters/墓园段之后、瓦罐主循环之前）——SSSSSS 批曾错挂
  //      PilesPass 头 → notraps 链 #71 起全流位漂移。执行序=原版注册序。
  runBoulderPileSection(store, rng, gs);
  runPotsPass(store, rng, gs);
}

/** tile 379（SpawnPoint 回避族，cs:19683/19704-19707：列扫描跳过 + IsTileNearby(10) 重试） */
const TILE_379 = TILE_BY_KEY['v_379_bubble'] ?? -1;

// ---------- 矿石 ----------
// 已由 vanilla/ShiniesPass.ts（原版 pass 27/36）整体替换，旧 orePass/growOreBlob 删除

// ---------- 液体 ----------
// 已由 vanilla/LakesPass.ts（原版 pass 31）替换，旧 liquidPass 删除

// ---------- 表面 ----------
function surfacePass({ store, surface, world }: GenCtx) {
  const gs0 = ctxGs[0];
  // 铺草（原版 SpreadingGrassOnSurfaceSunflowersEvilsOnSurfaceAndLavaCleanup cs:18349-18460）：
  //  段① 丛林草 3×3 邻接泥土填充 + 地表暴露石/黏土/矿 7×7 扫描转周边群系；
  //  段② 逐列 SpreadGrass 递归扩散（flag2 空气重置——洞穴口露土处也补草）。
  //  Trees/AlchemyHerbs/GrassPlants/GlowingMushroomPlants 曾内嵌于此（地表矿石/倒木/
  //  陷阱/矿骨堆/草墙之前）——2026-08-13 按 1456 注册序拆出独立槽归位（Batch D）
  //  ★UUUUUU：NTB 整 pass 跳过（cs:18351 `(!notTheBees || remix || tenth)`——蜂蜜
  //  世界地表已是泥/丛林草，SpreadingGrass 不再跑；掷骰随整段消失=原版语义）
  const f0 = gs0?.seedFlags;
  // ★IIIII44：补 denyAll 半边（cs:18369 `!Skyblock.denyAllGeneration && (!notTheBees ||
  //   remixWorldGen || tenthAnniversaryWorldGen)`——旧式曾以 `!skyblock` 放行天空盒撒草,
  //   与原版相悖:x86 实证 slot73 Spreading Grass 零掷冻结）
  if (gs0 && !(f0!.notTheBees && !f0!.remix && !f0!.tenthAnniversary)
    && !sbDenyAll(f0)) {
    spreadingGrassPass(store, gs0);
  }
  void surface; void world;
}

/** SpreadingGrass 段①②（cs:18354-18460）1:1（导出供 WWW 基座重放 rig 复用） */
export function spreadingGrassPass(store: World['store'], gs: GenState) {
  const w = store.w;
  const sheetAt = (x: number, y: number): number => {
    if (!store.inBounds(x, y)) return -1;
    const i = store.idx(x, y);
    return store.flags[i] ? (TILE_DEFS[store.type[i]]?.vanilla?.sheet ?? -1) : -1;
  };
  // ---- 段①（cs:18354-18432）：丛林草邻接填充 + 暴露石/矿群系转换 ----
  for (let i = 50; i < w - 50; i++) {
    for (let j = 50; j <= gs.worldSurface; j++) {
      const ii = store.idx(i, j);
      if (!store.flags[ii]) continue;
      const s = sheetAt(i, j);
      if (s === 60) {
        // 丛林草 3×3 邻接的泥土(0)：上格空 → 60（草）否则 59（泥）
        for (let k = i - 1; k <= i + 1; k++) {
          for (let l = j - 1; l <= j + 1; l++) {
            if (!store.inBounds(k, l)) continue;
            const ki = store.idx(k, l);
            if (store.flags[ki] && sheetAt(k, l) === 0) {
              store.type[ki] = !store.flags[store.idx(k, l - 1)]
                ? TILE_BY_KEY['v_60_jungle_grass_block']! : TILE_BY_KEY['mud']!;
            }
          }
        }
      } else if (s === 1 || s === 40 || ORE_SHEETS.has(s)) {
        // 石/黏土/矿：7×7 扫描定目标群系 + 上方是否有露天（n<j 且无墙）
        let flag = false;
        let num2 = 0;
        for (let m = i - 3; m <= i + 3; m++) {
          for (let n = j - 3; n <= j + 3; n++) {
            if (!store.inBounds(m, n)) continue;
            const ni = store.idx(m, n);
            if (store.flags[ni]) {
              const ns = sheetAt(m, n);
              if (ns === 53 || num2 === 53) num2 = 53;
              else if (ns === 59 || ns === 60 || ns === 147 || ns === 161 || ns === 199 || ns === 23) num2 = ns;
            } else if (n < j && store.wall[ni] === 0) {
              flag = true;
            }
          }
        }
        if (flag) {
          switch (num2) {
            case 23:
            case 199:
              // 腐化/猩红：上格有块 → 不转（num2 归 0 = 转泥土）
              if (store.flags[store.idx(i, j - 1)]) num2 = 0;
              break;
            case 59:
            case 60:
              // cs:18421 jungleMinX/MaxX 此 pass 时仍为 Reset 初值 -1/-1（cs:21004
              // 才赋值）→ 恒不触发，bug-for-bug 保留
              break;
            default:
              break;
          }
          // cs:18431：无条件 type = num2（num2=0 即转泥土——露天石/黏土/矿泥化）
          store.type[ii] = num2 === 0 ? T.DIRT : sheetToTile(num2);
        }
      }
    }
  }
  // ---- 段②（cs:18432-18460）：逐列 SpreadGrass 递归（flag2=空气无墙时重置）----
  for (let x = 10; x < w - 10; x++) {
    let flag2 = true;
    for (let y = 0; y < gs.worldSurface - 1; y++) {
      const yi = store.idx(x, y);
      if (store.flags[yi]) {
        if (flag2 && sheetAt(x, y) === 0) {
          // SpreadGrass(x, y, 0, 2, repeat)（cs:75210）——泥→草递归扩散，
          // 深度上限近似原版 grassSpread≤1000（try/catch 栈溢出回退）
          spreadGrass(store, x, y, T.DIRT, T.GRASS, true, gs.worldSurface);
        }
        if (y > gs.worldSurfaceHigh) break;
        flag2 = false;
      } else if (store.wall[yi] === 0) {
        flag2 = true;
      }
    }
  }
}

/** TileID.Sets.Ore（SurfaceDecorPasses 同表）——段① 的"矿"判定 */
const ORE_SHEETS = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
/** sheet id → 本仓内部 tile id（段① 转换目标用；仅 53/59/60/147/161/199/23 可能命中） */
const SHEET_TO_TILE = new Map<number, number>();
{
  TILE_DEFS.forEach((d, id) => {
    const sh = d?.vanilla?.sheet;
    if (typeof sh === 'number' && [53, 59, 60, 147, 161, 199, 23].includes(sh) && !SHEET_TO_TILE.has(sh)) {
      SHEET_TO_TILE.set(sh, id);
    }
  });
}
function sheetToTile(sheet: number): number {
  return SHEET_TO_TILE.get(sheet) ?? T.DIRT;
}

// ---------- 结构（地下小屋 + 宝箱） ----------
// 已删除:legacy structurePass/buildHut/placeChest。原版管线下 CaveHousePass(七主题
// 地下小屋)/BuriedChestsPass/SurfaceChestsPass/UnderwaterChestsPass 在生物群系 pass 内
// 完整覆盖(见 vanillaBiomes),legacy 版会造成双倍密度+索引帧宝箱(已修的 bug 源)。

// ---------- 收尾：出生点（选最平坦区域并整平） ----------
// sheet id → 贴图表 [宽,高]（帧越界净化用；数据源 public/sprites/vanilla.json）
const V_SHEET_DIM: Record<number, [number, number]> = (() => {
  const out: Record<number, [number, number]> = {};
  const t = (vanillaJson as unknown as { tiles: Record<string, { grid: [number, number]; cols: number; rows: number }> }).tiles;
  for (const [k, m] of Object.entries(t)) {
    if (!m || !m.cols || !m.rows) continue;
    out[Number(k)] = [m.cols * m.grid[0] + (m.cols - 1) * 2, m.rows * m.grid[1] + (m.rows - 1) * 2];
  }
  return out;
})();
// ★IIIII99d：Place1xX 竖排样式带家族（cs(1458):60561-65 PlaceTile case
//   92/93/453 → Place1xX；frameY=hgt*style*18+row*18 原样落盘可越表底）——
//   finalize 帧净化纵向豁免的消费面（见 finalize 内注）。
const VERTICAL_STYLE_SHEETS = new Set([92, 93, 453]);
function finalize({ store, world }: GenCtx) {
  // 幽灵净化:生成期 TileRunner 会在空气格写残留 type(原版语义,渲染不可见),
  // 但我们的存档格式无 active 位——进入存档前归零(防重读激活成浮空块)
  for (let i = 0; i < store.type.length; i++) {
    if (!store.flags[i] && store.type[i] !== 0) store.type[i] = 0; // 幽灵 type
    if (store.type[i] === 0) store.flags[i] = 0; // 幻影活性(type 0 不可有 flags)
  }
  // ---- 帧越界净化：生成期大量 type 直写/覆盖不清帧（LivingTree setLeaf、Terrain
  //      type=1 等），旧 framed tile 帧残留进新类型 = 渲染越界/错位（实测 sheet1
  //      fx=1080 / sheet4 fx=252 / sheet51 fy=216 等）。像素级粗判（超出表宽/高即清 0），
  //      非均匀行高表（187 的 16/18 行）不受影响（越表判比步长判宽松）
  {
    const wmax = new Map<number, number>();
    const hmax = new Map<number, number>();
    for (let i = 0; i < store.type.length; i++) {
      if (!store.flags[i]) continue;
      const d = TILE_DEFS[store.type[i]];
      const sh = d?.vanilla?.sheet;
      if (sh == null) continue;
      let w = wmax.get(sh), h2 = hmax.get(sh);
      if (w === undefined || h2 === undefined) {
        const m = V_SHEET_DIM[sh];
        w = m ? m[0] : 0; h2 = m ? m[1] : 0;
        wmax.set(sh, w); hmax.set(sh, h2);
      }
      if (w === 0) continue;
      // ★ 回绕区间（≥32768）是【刻意的有符号偏移】——棕榈 323 干身/树冠的
      // frameY=倾斜像素（65534=-2 等，VanillaTiler.ts palm 分支同约定解码），
      // 不是格位索引，绝不可清（左倾棕榈被清 → 树冠+倾斜全部消失）。
      // ★ 横越表 fx 另有【合法多带样式】——原版 wld 即存原始 fx（Tiles_187 样式
      // 52-54 = fx 2808，绘制端 VanillaTiler 分带换算回 (918, fy+36)）。曾按越表
      // 一律清零：沙漠头骨石堆 187 整族塌零帧 → 相邻零帧重建错位（2026-08-17）。
      // 换算后仍在表内 = 合法帧，勿清。
      const fxv = store.frameX[i], fyv = store.frameY[i];
      if (fxv < 32768 && fyv < 32768 && (fxv >= w || fyv >= h2)) {
        let legal = false;
        if (fxv >= 0 && fxv >= w) {
          const dvan = d.vanilla!;
          const objW = (dvan.fw ?? 1) * 18;
          const bandH = (dvan.fh ?? 1) * 18;
          const colsPerBand = objW > 0 ? Math.floor(w / objW) : 0;
          if (colsPerBand > 0) {
            const styleIdx = Math.floor(fxv / objW);
            if (styleIdx >= colsPerBand) {
              const wx = (styleIdx % colsPerBand) * objW + (fxv % objW);
              const wy = fyv + Math.floor(styleIdx / colsPerBand) * bandH;
              if (wx + 16 <= w && wy + 16 <= h2) legal = true;
            }
          }
        }
        // ★IIIII99d 纵向多带样式豁免（fx 分带的对称补支，【限 Place1xX 家族】）——
        //   Place1xX(cs(1458):39578,case 92/93/453) 的样式带为竖排且**不换表底**，
        //   wld 原样存 raw 帧：沙岩房 style47 灯 fy=2538..2590 越 H2032（渲染端
        //   VanillaTiler case93 折列 num70=floor(fy/1998)、ofx+=36n 同构解码）。
        //   曾被本净化清零 ⇒ m 链实测 (1302,952)/(1512,1292) 两塔 x86 fy=2538..2574
        //   而 JS 终态 fy=0 差 9 格。合法性判据：带高=objH=fh*18、页数=
        //   floor(h2/objH)；wy=(页%页数)*objH+(fy%objH)、wx+页位移在表内即放行。
        //   非该家族维持旧行为（垃圾帧照清），零外溢。
        if (!legal && fyv >= 0 && fyv >= h2 && VERTICAL_STYLE_SHEETS.has(sh)) {
          const dvan = d.vanilla!;
          const objW = (dvan.fw ?? 1) * 18;
          const objH = (dvan.fh ?? 1) * 18;
          const rowsPerBand = objH > 0 ? Math.floor(h2 / objH) : 0;
          if (rowsPerBand > 0) {
            const styleIdx = Math.floor(fyv / objH);
            if (styleIdx >= rowsPerBand) {
              const wy = (styleIdx % rowsPerBand) * objH + (fyv % objH);
              const wx = fxv + Math.floor(styleIdx / rowsPerBand) * objW;
              if (wx + 16 <= w && wy + 16 <= h2) legal = true;
            }
          }
        }
        if (!legal) {
          store.frameX[i] = 0; store.frameY[i] = 0;
        }
      }
    }
  }
  // ---- 出生点（原版 SpawnPoint cs:19605-19724）已归位为独立管线槽「出生点」
  //      （地表装饰之后、草墙之前——注册序 Piles(18900) < SpawnPoint(19605) <
  //      GrassWall(19734)）——见 spawnPointPass；曾内嵌本函数尾（全部 pass 之后
  //      执行）,2026-08-13 清零批归位。finalize 仅保留幽灵/帧净化与常量同步

  // 原版管线的地表/岩石线来自 TerrainPass 输出,旧 fbm 常数仅作回退
  const gs = ctxGs[0];
  if (gs) {
    world.groundLevel = gs.worldSurface;
    world.rockLevel = gs.rockLevel;
  } else {
    world.groundLevel = Math.floor(store.h * 0.28);
    world.rockLevel = Math.floor(store.h * 0.33);
  }
  // 原版树样式（RandomizeTreeStyle 掷出：边界 + 互异样式）
  if (gs) {
    world.treeX = gs.treeX;
    world.treeStyle = gs.treeStyle;
    world.trees = gs.genTrees; // 砍伐整棵判定（Player/Game 消费）
  }
  // 树登记保留:树干不再被清理盒删除,world.trees 与实际树一一对应
  // (原 |t.x-sx|<=5 过滤是配合"清掉树干防幽灵树"的,已不适用;
  //  上空清理盒(3×3+5×5)已随出生点段迁往 spawnPointPass)
}

// ---------- 出生点（原版 SpawnPoint pass，注册 cs:19605 / 实现 cs:19605-19724） ----------
// 中心随机扩张采样自然地表（不改地形），叠加我们的上空净空清理盒。
// 旧实现为"找最平坦窗口+人工整平平台"——出生点是一块突兀平台，与原版自然地表不符。
// 2026-08-13 前内嵌 finalize 尾（全部 pass 之后执行）——现按注册序归位为独立槽
// （「地表装饰」之后、「草墙」之前）。
// ★IIIII44：skyblock 加型槽（vanilla AddPasses cs:11546 注册位 = Terrain 之后）
function skyblockSlot({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0]; if (!gs) return;
  rng.reseed(gs.seed);                                 // ▶Skyblock（RunPass 每 pass 重播）
  runSkyblockPass(store, rng, gs, world);
  // extraLivingTrees 组合臂（cs:23000-23007）：GSB 尾只掷锚点坐标；树同槽续流生成。
  // 注：growLivingTree 内部 28288-28299 的 skyblock 根系特化支未移植（组合域 GAP）。
  if (gs.seedFlags.skyblock && gs.skyblockExtraTreeAt) {
    const scratch: ChestSink = [];
    growLivingTree(store, rng, gs, scratch, gs.skyblockExtraTreeAt.x, gs.skyblockExtraTreeAt.y);
  }
}

export function spawnPointPass({ store, rng, world }: GenCtx) {
  // ★IIIII44：原版 SpawnPoint 的天空盒专用支（cs:19626-19641）——保留 GenerateSkyBlockWorld
  //   写入的出生 X/Y，仅沿出生列向下做 SolidTile3 吸附回推；零掷骰零 tileSolid 翻转
  //   （tileSolid[379] 翻转在 else 支内，本支不触）。世界出生已被 GSB 定案
  //  （worldSpawnHasBeenRandomized=true），vampireSeed 终段让位与原版一致。
  if (world.seedFlags?.skyblock) {
    const spawnTileX = world.spawnX;
    let i0 = world.spawnY;
    const num = 20;
    while (!vanSolidOrSloped(store, spawnTileX, i0) && i0 < store.h - 1 - num) i0++;
    while (vanSolidOrSloped(store, spawnTileX, i0) && i0 > num) i0--;
    i0++;
    if (Math.abs(i0 - world.spawnY) <= num) {
      world.spawnY = Math.max(4, i0); world.spawnY0 = Math.max(4, i0);
      // spawnX 不变（cs:19639 只写 Y;X 原样保留语义）
    }
    return;
  }
  // ★pass 头 tileSolid 翻转（cs:19628 `Main.tileSolid[379] = false`）：出生点采样
  //   期间泡泡块(379)视为非实心——非 skyblock 分支。尾 cs:19731 还原 true（见函数尾）。
  //   本仓生成期从不放置 379，翻转仅存档时间线。
  flipGenSolid([379], false);
  // ★IIIIIII6：十周年沙滩出生（cs:19689-19695 + SpecialSeedFeatures.cs:95-105）——
  //   SpawnOnBeach = tenthAnniversary && !remix && !dontStarve；取样中心 num3 =
  //   genRand.Next(2)!=0 ? maxTilesX−(beachBordersWidth+15) : +(同值)
  //   （GenVars.beachBordersWidth=275 恒常量，cs:11218）。普通世界中心恒 maxTilesX/2，
  //   不掷该 Next(2)（★分支首掷，后续循环掷序原序不变）。
  let baseCenter = Math.floor(store.w / 2);
  if (!!world.seedFlags?.tenthAnniversary && !world.seedFlags?.remix && !world.seedFlags?.theConstant) {
    const num10 = 275 + 15;
    baseCenter = rng.nextInt(2) !== 0 ? store.w - num10 : num10;   // cs:19694
  }
  let range = 5;
  let sx = baseCenter, sy = 0;
  for (;;) {
    const x = baseCenter + rng.int(-range, range); // Next(-num2, num2+1)，中心 cs:19674=num3+
    for (let y = 0; y < store.h; y++) {
      const i = store.idx(x, y);
      // 首个活性格(原版 cs:19683 仅 `active() && type != 379`——无 solid 判据。
      // 曾自制 TILE_DEFS?.solid 门"防树干浮空出生",与原版语义相悖:树干/平台上出生
      // 是原版行为,出生点本身不做地形修正,删门归位)
      if (store.flags[i] && store.type[i] !== TILE_379) { sx = x; sy = y; break; }
    }
    let bad = false;
    range++;
    const gs2 = ctxGs[0];
    if (gs2 && sy > gs2.worldSurface) bad = true;
    // 出生点上方 3 格任一有水即弃（原版 cs:19700-19703 查 sy-1/-2/-3 三格——
    // 只查 sy-1 会漏检水面下 1-2 格,出生进浅水）
    for (const dy of [1, 2, 3]) {
      if (store.liquid[store.idx(sx, Math.max(0, sy - dy))] > 0) { bad = true; break; }
    }
    // IsTileNearby(379, 10)（cs:19704-19707）：±10 盒内有 379 → 重试
    if (!bad) {
      outer:
      for (let nx = sx - 10; nx <= sx + 10; nx++) {
        for (let ny = sy - 10; ny <= sy + 10; ny++) {
          if (store.inBounds(nx, ny) && store.flags[store.idx(nx, ny)] && store.type[store.idx(nx, ny)] === TILE_379) {
            bad = true;
            break outer;
          }
        }
      }
    }
    if (!bad) break;
  }
  let widen = 10;
  const gs0 = ctxGs[0];
  while (gs0 && sy > gs0.worldSurface) {
    // cs:19712 `Next(num3 - num12, num3 + num12)` —— 上界独占（曾 rng.int 闭区间
    // 多 1 个采样位）；谓词与首循环同为 active()+type!=379（cs:19717，曾误用
    // isGenSolid —— active 含草面/装饰等非实性格，实心语义会跳到更深的首实心行）。
    // ★IIIIIII6：中心同取沙滩/世界中心 baseCenter
    const x = rng.nextIntRange(baseCenter - widen, baseCenter + widen);
    for (let y = 0; y < store.h; y++) {
      const i = store.idx(x, y);
      if (store.flags[i] && store.type[i] !== TILE_379) { sx = x; sy = y; break; }
    }
    widen++;
  }
  world.spawnX = sx;
  world.spawnX0 = sx;   // 原始出生点快照（床 RemoveSpawn 回退锚）
  // spawnY = 地面行本身（原版 spawnTileY = j 直存,cs:19724）。消费端自行抬高：
  // Game.ts Player 用 (spawnY-3)*TILE（玩家 3 格高）。此前这里也 -3 → 双重偏移,
  // 玩家浮空 6 格后坠落
  world.spawnY = Math.max(4, sy);
  world.spawnY0 = Math.max(4, sy);
  // ★原版 SpawnPoint（cs:19605-19731）不做任何地形清理——只写 spawnTileX/Y +
  //   tileSolid[379] 还原。此前自造"上空净空清理盒"（豁免树干/草面的 3×3+5×5 清空）
  //   = 8 通道外的自创写入：#78 干净基座下 4 格硬化沙被误清（T187>0×4）。
  //   为逐位一致已整段移除（WWW 批 2026-08-18）——玩家卡块由消费端抬高处理。
  // ★pass 尾还原（cs:19731 `Main.tileSolid[379] = true`）
  flipGenSolid([379], true);
}

// ===================== 吸血鬼种子终段（WorldGen.cs:22625-22631） =====================

// ★IIIII41-T3①（2026-08-29）：RandomizeWorldSpawn / DoAdditionalChangesAroundSpawnIfNeeded
//   核心自本函数原位外提到 vanilla/SecretSeedDoEndsPass.ts（randomSpawn 臂同核共宿，
//   avoid 表四支组合过滤补全见彼处头注）。vampire 路径保持逐行同序等价：
//   cs:22659-22662 `if (Main.vampireSeed) { if (!GenVars.worldSpawnHasBeenRandomized)
//   { RandomizeWorldSpawn(); DoAdditionalChangesAroundSpawnIfNeeded(); } PutMonsterVanityInChests(); }`
/** 吸血鬼种子终段：出生点重掷到地牢对侧地下带 + 出生周边火把/清障。
 *  ★PutMonsterVanityInChests（cs:25010-25064，1/7 箱注入怪物时装）登记 GAP：物品族未
 *  全量入库。落点检查为 Utils.CheckForGoodTeleportationSpot（cs:55234-55370）精简核。 */
function vampireSeedFinishPass(ctx: GenCtx): void {
  const { store: st, world, rng } = ctx;
  if (!world.seedFlags?.vampireSeed) return;
  const gs = ctxGs[0];
  if (!gs) return;
  // cs:22659-22662 的 !worldSpawnHasBeenRandomized 门：randomSpawn 臂先行置位时
  // （'howdidigethere|what...' 组合），此处让位（vanilla 同构）。
  if (!gs.worldSpawnHasBeenRandomized) {
    randomizeWorldSpawnCore(st, rng, gs, world);
    doAdditionalChangesAroundSpawnCore(st, rng, gs, world);
  }
}

/** ★IIIII41-T3①：randomSpawn 终段（DoRandomSpawn :1896-1903）——见调用位挂位注。
 *  cs:1898 `if (!GenVars.worldSpawnHasBeenRandomized)`：noSurface(:1048)/vampire
 *  (:22659)/remix 岛链尾(:23015) 先到者已置位时让位（本仓 noSurface/remix 臂未实装，
 *  现可达先到者=vampire 终段）。 */
function doRandomSpawnFinishPass(ctx: GenCtx): void {
  const { store: st, world, rng } = ctx;
  if (!world.seedFlags?.randomSpawn) return;
  const gs = ctxGs[0];
  if (!gs) return;
  if (!gs.worldSpawnHasBeenRandomized) {
    randomizeWorldSpawnCore(st, rng, gs, world);                       // RandomizeWorldSpawn :24112
    doAdditionalChangesAroundSpawnCore(st, rng, gs, world);            // :25211 torches + noTraps 清障
  }
}
