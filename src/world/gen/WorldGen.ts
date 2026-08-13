// 程序化世界生成管线：地形 → 洞穴 → 矿石 → 液体 → 表面 → 结构
// 分帧执行以显示进度。纯函数式 pass，每个 pass 直接写 TileStore（生成期用 silent 写入）。
import { RNG, translateSeed } from '../../core/rng';
import type { TileStore } from '../TileStore';
import { T, TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import { World } from '../World';
import { randomEpitaph } from '../../i18n/RandomText';   // 墓园 pass 碑文（WorldGen.cs:25161）

export interface GenConfig {
  width: number;
  height: number;
  seedText: string;
  name?: string;
  /** 邪恶群系：-1 随机（默认） 0 腐化 1 猩红（UIWorldCreation 对应原版 WorldGenParam_Evil） */
  evil?: -1 | 0 | 1;
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

/** 生成一个世界。passes 按序执行，每帧尽量做完一个 pass 后让出主线程。 */
export async function generateWorld(cfg: GenConfig, onProgress?: (label: string, p: number) => void): Promise<World> {
  // 种子解析 1:1 原版 WorldFileData.TranslateSeed（数字→Abs；非数字→Crc32），
  // 生成入口构造 Main.rand = new UnifiedRandom(seed)（WorldGen.cs:11159）。
  // 位级金标见 tests/unified-random.test.ts。
  const seed = translateSeed(cfg.seedText || String(Date.now()));
  const world = new World(cfg.width, cfg.height, seed, cfg.name ?? '新世界');
  world.seedFlags = parseSeed(cfg.seedText || '').flags; // 运行时消费（血月 1/6 十周年 / drunk 黎明翻转）
  const rng = new RNG(seed);
  // 注：曾在此 createNoise2D(() => rng.next())——simplex 构造即消耗 RNG 流
  //（建置换表 256+ 次），而全管线无消费者。种子等价必须零预耗，已删除。
  const ctx: GenCtx = {
    world, store: world.store, rng,
    surface: new Float32Array(cfg.width),
    cfg,
  };

  // 单一 vanilla 管线。原 lgcTerrain=false 的 fbm 回退（terrainPass/cavePass/
  // floatCleanupPass 分支）是无 UI 入口的死代码且 hellPass 处会空指针崩溃，已删除。
  // pass 顺序对齐原版 AddGenerationPass 注册序（WorldGen.cs:11525-22660，
  // 权威对照表见 docs/worldgen/vanilla-pass-alignment.md）：
  //   地形1 洞穴(3/7-14e) 海滩(33/34) 生物群系(15-64) 矿石(27) 液体(31)
  //   清理(37) 结构(15426+ 结构尾) 生命水晶(55) 半砖平滑(57) 瀑布(58) 地狱(31) 地狱屋(76 前段)
  //   地狱箱(63 地狱段) 小屋+散箱(63) 瓦罐(75) 矿骨堆(81) 表面(77/86/90)
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
    // Shimmer(15256)）：地表内悬空 Falling 系方块空腔落定。纯扫描零掷骰。
    // 2026-08-12 前整 pass 缺失——海岸/沙滩带生成残留的浮空沙无人回收。
    { name: '引力沙', run: gravitatingSandPass },
    // 原版注册序 Lakes(14613) < Shimmer(15256) < DirtWallCleanup(15310)：
    // 微光以太在此挖洞灌液，清理/沉降在其后（Slush 31 已随 Lakes 入"液体"槽）
    { name: '微光', run: vanillaShimmer },
    { name: '清理', run: vanillaCleanup },
    // 结构段（原版注册序 DirtWallCleanup(15310) < Pyramids(15426) < DirtRockWallRunner(15536)
    // < LivingTrees(15551) < ... < SwordShrine，含 DirtWallCleanup 与 Shimmer 之间的全部
    // 结构尾）——2026-08-13 前结构尾内嵌 vanillaBiomes（微光/清理之前执行）= 顺序偏差，
    // 拆出为独立槽插在「清理」之后；DirtRockWallRunner 同批补缺。清单见 vanillaStructures
    { name: '结构', run: vanillaStructures },
    // 原版 SettleLiquids（cs:16215）：Lakes 之后、SmoothWorld/Waterfalls 之前的中途
    // 沉降——瀑布唇缘/半砖平滑直接读 st.liquid 判定，必须在静止水面数据上跑
    // （此前沉降只在管线末尾 → 唇缘基于未沉降水体漂移）。
    // 原版 SettleLiquidsPart2（cs:21051，管线尾二次沉降）由 generateWorld 之后
    // worker/Game 的 settleWorldLiquids('gen') 承担。
    { name: '水体沉降', run: liquidSettlePass },
    // 沙上清水（原版 RemoveSurfaceWaterAboveSand cs:16295-16326，注册序
    // SettleLiquids(16215) < 本 pass < Oasis(16327) < ShellPiles(16385)）：
    // 地表沙柱上方的悬空水清除——零掷骰纯扫描（2026-08-12 前整 pass 缺失）
    { name: '沙上清水', run: surfaceWaterAboveSandPass },
    // 绿洲（原版 Oasis cs:16327，注册序 RemoveSurfaceWaterAboveSand(16295) < 本 pass
    // < ShellPiles(16385)）：PlaceOasis 挖塘+岸线，登记 gs.oasisX/Y/W（pass 98 的
    // 绿洲棕榈/燕麦/植物 530 消费段未实现，备案）
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
    // 地狱(Underworld 28) 已按注册序并入 vanillaBiomes（Webs 27 后、Corruption 29 前）
    { name: '地狱屋', run: vanillaHellHouses },
    // 地狱箱:必须在地狱地形+地狱屋之后(原版 Underworld 29 < Buried Chests 59);
    // 曾在生物群系 pass 里随洞穴箱一起放 → 被后续 hellPass 重写 100% 抹除
    { name: '地狱箱', run: underworldChestsPass },
    // 苔藓（原版 MossAndMossCaves cs:17573，注册序 BuriedChests 17066 < 本 pass <
    // Pots 18186）：霓虹苔藓洞 + 苔藓斑/散点/地狱氦苔藓——洞穴系全部定型后只做
    // 石→苔藓点状替换；长苔藓 pass（20915）的上游，缺它则全图 0 长苔藓
    // 宝石洞（原版 GemCaves cs:17528，注册序 < Moss(17573) < CaveWalls(17819)）：
    // 必须先于 CaveWalls——Spread.Gem 遇墙不扩散，先刷墙会压制宝石洞；
    // 此前挤在"宝石系统"槽（Moss 后近 30 槽）= 顺序偏差，已归位
    { name: '宝石洞', run: gemCavesPass },
    { name: '苔藓', run: vanillaMoss },
    // 洞穴自然墙（原版 CaveWallsInEnclosedSpaces cs:17819，注册序 Moss(17573) <
    // 本 pass < UndergroundJungleTrees(17952)）：封闭腔刷洞穴背景墙 + 丛林泥墙段。
    // 地下自然墙唯二来源之一（另一=DirtWallBackgrounds 近地表）——缺它全洞穴无墙,
    // 暴露晶簇(178,贴墙装饰)悬空(2026-08-12 用户标注)
    { name: '洞穴墙', run: caveWallsPass },
    // 瓦罐（原版 PotsGraveyardsAndBoulderPiles cs:18108,注册序 CaveWalls(17819) <
    // 本 pass < Hellforges(18298)）——曾排在熔炉后=与原版对调,2026-08-13 归位
    { name: '瓦罐', run: potPass },
    // 地狱熔炉(原版 Hellforges,cs:18298:w/200 个,墙 13/14 门禁)
    { name: '地狱熔炉', run: hellforgesPass },
    // 矿骨堆（原版 pass 81 Piles 位置）
    { name: '矿骨堆', run: pilesPass },
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
    // 出生点（原版 SpawnPoint cs:19605，实现 cs:19605-19724）：中心随机扩张采样自然
    // 地表 + 上空清理盒——注册序 Piles(18900) 之后的本 pass < 草墙(19734)。曾内嵌
    // finalize 尾（全部 pass 之后执行）,2026-08-13 归位（清零批）
    { name: '出生点', run: spawnPointPass },
    // 草墙（原版 SurfaceDirtWallsToGrassWalls cs:19734，注册序 Piles 18900 之后的
    // SpawnPoint 19605 < 本 pass < DyePlants 20126）：地表泥土墙洞 → 草墙 63/花墙 65——
    // Vines pass 花藤 382 的上游（藤头墙 ∈ {63,65,66,68} 才出花藤）
    { name: '草墙', run: vanillaGrassWall },
    // 向日葵（原版 SunflowersPart2 cs:20043-20084）：w*0.002 次带状扫描，草 2 上方
    // 空气处放 2×4 向日葵——普通种子向日葵唯一生成来源（SpreadingGrass 名义上的
    // Sunflowers 段实为 remix 专属 18460-18559）。注册序：GrassWalls(19734) →
    // SpawnStarterNPCs(19830，十周年专属→普通种子 no-op，备案跳过) → 本 pass →
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

  for (let i = 0; i < passes.length; i++) {
    onProgress?.(passes[i].name, i / passes.length);
    await nextFrame();
    await passes[i].run(ctx, () => {});
    // 部分世界回调（生成期实时预览）：pass 完成即暴露，不等 finalize
    if (cfg.onWorldPartial) cfg.onWorldPartial(world, i, passes[i].name);
  }

  finalize(ctx);
  // ★终扫(finalize 之后):finalize 的幽灵 type 净化会把"flags=0 但 type 残留"
  // 的多格物体清成 0 → 在清扫 pass 之后【再造残片】(2026-08-13 缺位断言实锤:
  // 生成后 pot 残片 1 处,补扫即清零)。清扫幂等且廉价,此处兜底。
  runMultitileFragmentSweepPass(ctx.store);
  onProgress?.('完成', 1);
  return world;
}

// ---------- 原版管线 pass(阶段 1-2 移植) ----------
import { newGenState, type GenState } from './vanilla/GenState';
import { parseSeed } from './SeedEasterEggs';
import { runTerrainPass } from './vanilla/TerrainPass';
import { runRocksAndClayPass, runCavesPass } from './vanilla/CavesPass';
import { runOceanSandPass, runBeachesPass, runBeachDecorPass } from './vanilla/BeachPass';
import { runIceBiomePass, runSlushPass } from './vanilla/IceBiomePass';
import { runWebsPass as runVanillaWebsPass } from './vanilla/WebsPass';
import { runUnderworldPass } from './vanilla/UnderworldPass';
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
import { runSmoothWorldPass, runWaterfallLipPass } from './vanilla/HalfBrickPass';
import { runShiniesPass, runGemsPass } from './vanilla/ShiniesPass';
import { runGemCavesPass, runExposedGemsPass, runGemTreesPass } from './vanilla/GemPasses';
import { runCaveWallsPass, runCaveWallVarietyPass, runJungleMudWallsPass } from './vanilla/CaveWallsPass';
import { runOasisPass } from './vanilla/OasisPass';
import { runCactusPalmTreesAndCoralPass } from './vanilla/StructuresPass';
import { runTileCleanupPass } from './vanilla/TileCleanupPass';
import { runBrokenTrapCleanupPass } from './vanilla/BrokenTrapCleanupPass';
import { runFinalCleanupPass } from './vanilla/FinalCleanupPass';
import { runMultitileFragmentSweepPass } from './vanilla/MultitileFragmentSweep';
import { runMossAndMossCavesPass } from './vanilla/MossPass';
import { runGrassWallPass } from './vanilla/GrassWallPass';
import { runMountCavesPass, runMountainCavesPass } from './vanilla/MountCavesPass';
import { runTreePass, randomizeTreeStyle, growAshTree } from './vanilla/TreePass';
import { runLakesPass } from './vanilla/LakesPass';
import { runGravitatingSandPass } from './vanilla/GravitatingSandPass';
import { runTrapsPass } from './vanilla/TrapsPass';
import { runFloatingIslandsPass, runLifeCrystalsPass, runSurfaceDecorPass, runPyramidPass, runWetJunglePass, runAlchemyHerbsPass } from './vanilla/StructuresPass';
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
import { runTemplePass, runLihzahrdAltarPass } from './vanilla/TemplePass';
import { runIslandHousePass } from './vanilla/IslandHousePass';
import { runHellFortPass } from './vanilla/HellFortPass';
import { runSwordShrinePass } from './vanilla/SwordShrinePass';
import { runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass, runWaterChestsPass } from './vanilla/BuriedChestsPass';
import { runStatuesPass } from './vanilla/StatuesPass';
import { runJungleShrinePass, runJungleChestsPass } from './vanilla/JungleShrinePass';
import { runCaveHousesPass } from './vanilla/CaveHousePass';
import { runOceanCavesPass, runUnderwaterChestsPass } from './vanilla/OceanCavesPass';
import { runHellforgesPass } from './vanilla/HellforgesPass';
import { runCorruptionPass, runAltarsPass } from './vanilla/CorruptionPass';
import { runSandPatchesPass, runTunnelsPass, runDirtWallBgPass, runSmallHolesPass } from './vanilla/MissingCavesPass';
import { settleWorldLiquids } from '../liquid/settle';
import vanillaJson from '../../../public/sprites/vanilla.json';

// 原版 pass 49 SettleLiquids：中途沉降（见 passes 数组注释）
async function liquidSettlePass({ world }: GenCtx) {
  await settleWorldLiquids(world, 'gen');
}

/** 种子等价对账钩子（terrain oracle）：只跑 Reset 掷骰 + Terrain pass，
 *  返回 GenState 与逐列地表（trunc(num3)），供与 C# 参考实现逐列比对 */
export function runResetAndTerrain(cfg: { width: number; height: number; seedText: string; evil?: -1 | 0 | 1 }): {
  gs: GenState; surface: Int32Array; seed: number; world: World; rng: RNG; ctx: GenCtx;
} {
  const seed = translateSeed(cfg.seedText);
  const world = new World(cfg.width, cfg.height, seed);
  world.seedFlags = parseSeed(cfg.seedText).flags;
  const rng = new RNG(seed);
  const ctx: GenCtx = {
    world, store: world.store, rng,
    surface: new Float32Array(cfg.width),
    cfg: { ...cfg, evil: cfg.evil ?? -1 },
  };
  vanillaTerrain(ctx);
  const out = new Int32Array(cfg.width);
  for (let x = 0; x < cfg.width; x++) out[x] = ctx.surface[x];
  return { gs: ctxGs[0]!, surface: out, seed, world, rng, ctx };
}

function vanillaTerrain({ store, rng, world, surface, cfg }: GenCtx) {
  const gs = newGenState(store.w, store.h);
  // 世界种子 int——DesertHive 的 FastRandom(seed).WithModifier(57005) 主种子
  // （DesertHive.cs:253，与 genRand 完全独立的第二条随机流）
  gs.seed = translateSeed(cfg.seedText);
  // 彩蛋种子旗标（SeedEasterEggs.parseSeed）——特殊种子 pass 分支消费（GemPasses 等）；
  // 金标种子 flags 恒空集 → 掷骰流位置不受影响
  gs.seedFlags = parseSeed(cfg.seedText).flags;
  // ===== Reset 掷骰（1456 WorldGen.generateWorld cs:11159-11472 逐行 1:1）=====
  // 原版在 AddPasses 循环之前按此固定顺序消耗 Main.rand（种子等价的流位置契约）。
  // 天气/背景/月亮等值我们未消费——照掷照弃，只保留 GenState 下游字段。
  const W = store.w;
  // ① jungleHut（cs:11182 Next(5)，cs:11333-11352 映射 0-4→119/120/158/175/45）
  //    JungleShrinePass 复用本值（曾照掷照弃致 pass 内重掷、流位+样式双偏）
  gs.jungleHut = rng.nextInt(5);
  // ② crimsonLeft（cs:11235）——邪恶群系左右分布，未消费
  rng.nextInt(2);
  // ③ RandomizeWeather（cs:7736-7746）：numClouds + 风速 do-while
  rng.nextIntRange(10, 200);
  for (;;) {
    const wf = rng.next();              // NextFloat = (float)NextDouble（1 次采样）
    rng.nextIntRange(0, 2);             // Next(2)（符号）
    if (wf !== 0) break;                // ×0.35×(±1) 非零 ⇔ wf≠0
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
  // ⑦-⑩ 矿石替代对（cs:11286-11298）——Next(2)==0 用替代矿
  gs.oreTiers = {
    copper: rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_tin']! : TILE_BY_KEY['ore_copper']!,
    iron: rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_lead']! : TILE_BY_KEY['ore_iron']!,
    silver: rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_tungsten']! : TILE_BY_KEY['ore_silver']!,
    gold: rng.nextIntRange(0, 2) === 0 ? TILE_BY_KEY['ore_platinum']! : TILE_BY_KEY['ore_gold']!,
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
  // ⑭ RandomizeCaveBackgrounds（cs:8157，4200 分支；值未消费照掷）
  rng.nextIntRange(1050, 3150);                            // caveBackX[0]
  {
    const a = rng.nextInt(8);
    let b = rng.nextInt(8);
    while (b === a) b = rng.nextInt(8);
  }
  // 尾部无条件 3 掷（cs:8211-8213：iceBackStyle/hellBackStyle/jungleBackStyle）——
  // 2026-08-12 审计发现整条 RNG 流自 Reset 起少 3 样本,后续世界形态整体平移
  rng.nextInt(4);
  rng.nextInt(3);
  rng.nextInt(2);
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
  // ⑯ RandomizeMoonState（cs:7748）——Next(9)，未消费
  rng.nextInt(9);
  // （TreeTops.CopyExistingWorldInfoForWorldGeneration / SetupDungeonGenVars：零掷骰）
  // ⑰ dungeonSide（cs:11360）：Next(2)==0 → Left(我们 -1)
  gs.dungeonSide = rng.nextIntRange(0, 2) === 0 ? -1 : 1;
  // ⑱ 丛林（cs:11377-11392）：与地牢异侧，Next(15,30)
  if (gs.dungeonSide === -1) {
    gs.jungleX = Math.trunc(W * (1 - rng.nextIntRange(15, 30) * 0.01));
  } else {
    gs.jungleX = Math.trunc(W * (rng.nextIntRange(15, 30) * 0.01));
  }
  world.jungleX = gs.jungleX;
  // ⑲ 地牢侧锚点 num7（cs:11394-11416）：Next(w) 拒绝采样到地牢侧 15% 区间
  let dX = rng.nextInt(W);
  const dLo = W * (gs.dungeonSide === 1 ? 0.60 : 0.25);
  const dHi = W * (gs.dungeonSide === 1 ? 0.75 : 0.40);
  while (dX < dLo || dX > dHi) dX = rng.nextInt(W);
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
  gs.beachLeftEnd = rng.nextIntRange(300, 340) + (gs.dungeonSide === 1 ? 40 : 20);
  gs.beachRightStart = W - rng.nextIntRange(300, 340) - (gs.dungeonSide === -1 ? 40 : 20);
  // ㉓ 地牢入口（cs:11461-11470）：地牢侧海滩内 15% 区间（dungeonBeachPadding=50）
  if (gs.dungeonSide === -1) {
    gs.dungeonLocation = rng.nextIntRange(gs.beachLeftEnd + 50, Math.trunc(W * 0.2));
  } else {
    gs.dungeonLocation = rng.nextIntRange(Math.trunc(W * 0.8), gs.beachRightStart - 50);
  }
  world.dungeonX = gs.dungeonLocation;
  // ===== Terrain pass（原版第一个注册 pass，cs:11526）=====
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
}

// 原版 pass "Dunes"(cs:11540):沙丘塑造 + 金字塔候选(gs.pyramidSpots)
function vanillaDunes({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runDunesPass(store, rng, gs);
}

// 原版 pass "Shimmer"(cs:15256):以太微光生物群系
function vanillaShimmer({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runShimmerPass(store, rng, gs);
  // GenVars.shimmerPosition 落到 World（中途沉降 pass 在 finalize 之前就需要它）
  world.shimmerX = gs.shimmerX;
  world.shimmerY = gs.shimmerY;
}

// 原版 pass "Surface Ore And Stone"(cs:18559) + "Fallen Logs And Water Features"(cs:18625)
function vanillaSurfaceOre({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runSurfaceOreAndStonePass(store, rng, gs);
}
function vanillaFallenLogs({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runFallenLogsPass(store, rng, gs);
}

// 原版表面装饰子 pass 群（cs:20126/20338/20592/20744/20915/22131，见 SurfaceDecorPasses.ts）
function vanillaDyePlants({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runDyePlantsPass(store, rng, gs);
}
function vanillaVines({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runVinesPass(store, rng, gs);
}
function vanillaFlowers({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runFlowersPass(store, rng, gs);
}
function vanillaMushrooms({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runMushroomsPass(store, rng, gs);
}
function vanillaLongMoss({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runLongMossPass(store, rng, gs);
}
function vanillaLilypads({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runLilypadsPass(store, rng, gs);
}

// 原版 pass "Micro Biomes"(cs:21785):露营地标 + 炸药陷阱屋
function vanillaMicroBiomes({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runMicroBiomesPass(store, rng, gs);
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
  // 原版注册序（1456）：OceanSand(11603) → SandPatches(11712) → Tunnels(11743) →
  // MountainCaves(11809) → DirtWallBackgrounds(11883) → RocksInDirt/DirtInRocks/Clay
  // → SmallHoles(12034) → DirtLayer/RockLayer/Surface Caves（WavyCaves 12301 仅
  // 饥荒世界，普通世界零掷骰跳过）
  runOceanSandPass(store, rng, gs);
  runSandPatchesPass(store, rng, gs);   // 地下沙团（沙漠雏形）
  runTunnelsPass(store, rng, gs);       // 地表隧道（dirt runner 双向填充）
  runMountCavesPass(store, rng, gs);    // 山丘本体
  runDirtWallBgPass(store, rng, gs);    // 地表自然墙（wall 2/40）
  runRocksAndClayPass(store, rng, gs);
  runSmallHolesPass(store, rng, gs);    // 小空洞（每轮 2 发挖除 runner）
  runCavesPass(store, rng, gs);
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
  runIceBiomePass(store, rng, gs);       // 16 Generate Ice Biome
  runGrassPass(store, rng, gs);          // 17 Grass
  const jx = runJunglePass(store, rng, gs); // JunglePass
  world.jungleX = jx;
  // 丛林表面泥化:泥柱核心区 ±0.12w 内,表层 10 格 dirt→mud(原版巨型 runner
  // 覆盖表面所致;我们补这一步让丛林表面成草皮而非裸土)
  {
    const core = (gs as any).jungleCoreX ?? jx;
    const reach = Math.floor(store.w * 0.12);
    for (let x = Math.max(0, core - reach); x < Math.min(store.w, core + reach); x++) {
      let sy = 0;
      while (sy < store.h - 12 && !store.flags[store.idx(x, sy)]) sy++;
      for (let y = sy; y < sy + 10; y++) {
        if (store.get(x, y) === T.DIRT) store.setTileSilent(x, y, TILE_BY_KEY['mud']!);
      }
    }
  }
  // 18 Mud Caves To Grass（cs:12499-12530 原版精确版：全图递归洪水+散块清除；
  // 曾用近似 spreadGrassAll 中心限距+2 轮快照——caves-oracle 位级对账后替换）
  runMudCavesPass(store, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!);
  runDesertPass(store, rng, gs); // 19 Full Desert
  runMushroomPass(store, rng, gs); // 20 Mushroom Patches
  runMarbleGranitePass(store, rng, gs); // 21/22 Marble/Granite
  runFloatingIslandsPass(store, rng, gs); // 23 Floating Islands（原在蘑菇前——注册序修正）
  runDirtToMudAndSiltPass(store, rng, gs); // 24 Dirt To Mud / 25 Silt
  runShiniesPass(store, rng, gs); // 26 Ores And Shinies（原在很后"矿石"槽——移到 Silt 后=Webs 位）
  runVanillaWebsPass(store, rng, gs); // 27 Webs（cs:13659——原后置防被清，注册序修正回 27 位）
  runUnderworldPass(store, rng, gs); // 28 Underworld（cs:13697——原管线末"地狱"槽；
                                        //  地狱屋/地狱箱/熔炉等依赖槽在数组其后 = 地狱 pass 之后 ✓）
  runCorruptionPass(store, rng, gs); // 29 Corruption/Crimson
  runLakesPass(store, rng, gs); // 30 Lakes（cs:14613——原"液体"槽在结构段后，注册序修正）
  runSlushPass(store, gs); // 31 StoneToIceAndSiltPlusMudIntoSlush（cs:14756，紧随 Lakes）
  runDungeonPass(store, rng, gs, world.chests); // 32 Dungeon(蓝/粉砖主题+走廊房间+宝箱)
  // 地牢 pass 预计算(legacy 入口)不迁移 dungeonLocation——但入口塔列仍可能与
  // Reset 期锚点偏差数百格,必须在此回写最终位置。优先取入口门厅可站立点:
  // 生成期 Main.dungeonX/Y 的唯一写入端 = SetOldManSpawnAndSpawnOldManIfDefault
  // Dungeon(DungeonUtils.cs:1665,守卫老人出生/游走锚 = 外前厅 0.5 框底部;
  // WorldGen.cs:72510 那处是运行时兜底 setter,非生成期语义)——塔心锚点会把老人漏进塔内
  world.dungeonX = gs.dungeonEntX || gs.dungeonLocation;
  world.dungeonY = gs.dungeonEntY || gs.dungeonY || 0;
  // 33 MountainCaveOpenings + 34 Beaches（原紧跟 SurfaceCaves——注册序修正移到 Dungeon 后）
  runMountainCavesPass(store, rng, gs);
  runBeachesPass(store, rng, gs);
  // 海盆挖完后刷新 surface[](后续旧 pass 依赖;本函数之后才到那些 pass)
  for (let x = 0; x < store.w; x++) {
    for (let y = 0; y < store.h; y++) {
      if (store.flags[store.idx(x, y)]) { surface[x] = y; break; }
    }
  }
  runGemsPass(store, rng, gs); // 35 Gems（原捆绑在 Lakes 槽——注册序修正移到 Beaches 后）
  // 原版 1456 注册序（WorldGen.cs 行号 = 唯一权威，2026-08-11 review 依此重排）：
  //   OceanCaves(15228) < Pyramids(15426) < SurfaceWaterInJungle(15887) <
  //   Temple(15911) < Beehives(16005) < JungleShrines(16059) < Statues(16947) <
  //   UndergroundHouses+BuriedChests(17066) < SurfaceChests(17226) <
  //   ChestsInJungleShrines(17308) < UnderwaterChests(17343) < SpiderCaves(17455) <
  //   FloatingIslandHouses(17971) < MicroBiomes(21785)
  // 神庙/灌水提前到宝箱系之前（原版语义:大结构先占位,箱/雕像后放才不会塞进
  // 神庙体内或被灌水淹没;此前神庙在蜘蛛洞后 → 占地区内已塞雕像/箱,放置互相破坏）。
  ctxOceanTreasures[0] = runOceanCavesPass(store, rng, gs); // 海洋洞窟蠕虫+宝藏点记录(→结构槽 UnderwaterChests 消费)
  // 结构尾（Pyramids 15426 起 → SwordShrine）已拆出独立「结构」槽（「清理」之后执行，
  // 原版序 DirtWallCleanup 15310 < Pyramids 15426）——见 vanillaStructures；
  // 此前内嵌于此（微光/清理之前执行）= 结构先于清理，偏差（2026-08-13 清零批）
}

// 结构段 pass 群（原版注册序 DirtWallCleanup(15310) < Pyramids(15426) <
// DirtRockWallRunner(15536) < LivingTrees(15551) < LivingTreeWalls(15792) <
// DemonAndCrimsonAltars(15825) < SurfaceWaterInJungle(15887) < Temple(15911) <
// Beehives(16005) < JungleShrines(16059) < Statues(16947) < BuriedChests+
// UndergroundHouses(17066) < SurfaceChests(17226) < ChestsInJungleShrines(17308) <
// UnderwaterChests(17343) < WaterChests < SpiderCaves(17455) < FloatingIslandHouses(17971)
// < SwordShrine）——2026-08-13 前结构尾内嵌 vanillaBiomes（微光/清理之前执行）= 顺序偏差，
// 拆出为独立槽插在「清理」之后（清零批）；DirtRockWallRunner 同批补缺。
// 神庙/灌水提前到宝箱系之前（原版语义:大结构先占位,箱/雕像后放才不会塞进
// 神庙体内或被灌水淹没;此前神庙在蜘蛛洞后 → 占地区内已塞雕像/箱,放置互相破坏）。
function vanillaStructures({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  const oceanTreasures = ctxOceanTreasures[0]; // OceanCaves(生物群系槽)登记的宝藏点
  runPyramidPass(store, rng, gs, world.chests); // Pyramids(沙岩砖金字塔+宝箱)
  // Dirt Rock Wall Runner(15536,近地表泥土自然墙 2 → 石墙 59 游走斑)——注册序夹在
  // 金字塔与世界树之间；2026-08-13 前整 pass 缺失
  runDirtRockWallRunnerPass(store, rng, gs);
  // 原版注册序 Pyramids(15426) < LivingTrees(15551) < LivingTreeWalls(15792) <
  // DemonAndCrimsonAltars(15825) < SurfaceWaterInJungle(15887)——世界树插在金字塔后、
  // 丛林灌水前（方案 A 原版位置）；全图祭坛独立 pass 卡在活木墙与灌水之间。
  // LivingTrees：GrowLivingTree 树干壳+枝叶+根系+贯通竖井+密室宝箱；LivingTreeWalls：
  // 全图 type==191 连通核补墙 244（零掷骰）。
  runLivingTreesPass(store, rng, gs, world.chests);  // Living Trees(世界树)
  runLivingTreeWallsPass(store, gs);                 // Living Tree Walls(活木墙)
  // Demon And Crimson Altars(15825,全图随机撒 16 坛)——注册序 LivingTreeWalls(15792) <
  // 本 pass < SurfaceWaterInJungle(15887)。★与 Corruption pass 内猩红逐组祭坛(cs:14241)
  // 是原版两处放置,勿合并(见 CorruptionPass.runAltarsPass 头注);2026-08-13 前整 pass 缺失。
  runAltarsPass(store, rng, gs);                      // Demon And Crimson Altars(全图祭坛)
  runWetJunglePass(store, rng, gs);             // SurfaceWaterInJungle(1456 cs:15887 逐列灌水,零 RNG)
  runTemplePass(store, rng, gs, world.chests);  // Jungle Temple(之字形房间链+走廊+门+宝箱)
  runBeehivePass(store, rng, gs);               // Hives(丛林蜂巢:蜂巢壳+蜂蜜+腔)
  const shrineSpots = runJungleShrinePass(store, rng, gs);  // 丛林神龛(壳+腔+火把+金字塔顶)
  runStatuesPass(store, rng, gs);                           // 雕像 73 序+陷阱雕像接线
  runBuriedChestsPass(store, rng, gs, world.chests); // Buried Chests(洞穴金/冰箱/沙箱;地狱箱已拆到地狱箱 pass)
  runCaveHousesPass(store, rng, gs, world.chests);   // 地下小屋七主题(木/冰/丛林/沙/花岗岩/大理石/蘑菇)
  runSurfaceChestsPass(store, rng, gs, world.chests); // Surface Chests(地表木箱;只放一次——曾双调致密度翻倍)
  runJungleChestsPass(store, rng, gs, world.chests, shrineSpots); // 常春藤箱(神龛中心)
  runUnderwaterChestsPass(store, rng, gs, world.chests, oceanTreasures); // 海洋洞窟水箱
  runWaterChestsPass(store, rng, gs, world.chests); // Water Chests(水中 style17;1.4.4 概念保留)
  // Webs(51) 已按注册序回到 #27 位（vanillaBiomes 前段）——此处旧迟置调用删除
  runSpiderNestPass(store, rng, gs, world.chests); // Spider Caves(countTiles 门+波前BFS刷墙62+蛛网罐/箱/垂网/覆饰)
  // WebsInSpiderCavesAndHoney(cs:20140)曾内嵌于此（提前约 40 槽）——2026-08-13
  // 按注册序(DyePlants 20126 < 本 pass < GrassPlants 20232)拆出独立槽归位（Batch D）
  runIslandHousePass(store, rng, gs, world.chests); // 浮空岛日光板房屋(Skyware 门+箱+桌椅)
  runSwordShrinePass(store, rng, gs);          // 附魔剑圣地(竖井+水潭洞+土丘剑)
}

// 原版 pass 37 Clean Up Dirt:表层墙清理 + 连通小块(<20)清除
function vanillaCleanup({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runCleanupPass(store, rng, gs);
}

// 生命水晶(pass 55)——清完散块后放
function vanillaLifeCrystals({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
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
  if (!gs) return;
  runWaterfallLipPass(store, rng, gs);
}

// 沙上清水（RemoveSurfaceWaterAboveSand cs:16295）：零掷骰
function surfaceWaterAboveSandPass({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runRemoveSurfaceWaterAboveSandPass(store, gs);
}

// 薄冰（FragileIceOverIceBiomeWater cs:16756）：零掷骰
function fragileIcePass({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runFragileIcePass(store, gs);
}

// 蜂巢幼虫（BeeLarvaInBeehives cs:21018）：蜂巢 pass 已登记坐标，此处放置
function beeLarvaPass({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runBeeLarvaPass(store, gs);
}

// 地狱要塞 HellFort(5列×10行网格塔)——地狱层就绪后
function vanillaHellHouses({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runHellFortPass(store, rng, gs);
}

// 地狱箱(独立 pass,顺序见 passes 数组注释)
function underworldChestsPass({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runUnderworldChestsPass(store, rng, gs, world.chests);
}

// 地狱熔炉(原版 Hellforges,cs:18298)
function hellforgesPass({ store, rng }: GenCtx) {
  runHellforgesPass(store, rng);
}

// 矿/骨堆（原版 pass 81 Piles，cs:18900-19599 七子段 1:1——见 vanilla/PilesPass.ts；
// 旧实现 w*0.06 单段近似 + 30% 小堆/骨堆自造掷骰，与原版完全不符，已整体替换）
function pilesPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runPilesPass(store, rng, gs);
}

// 生物群系感知地表装饰(替代旧 surfacePass 的种树部分)
function vanillaSurfaceDecor({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runSurfaceDecorPass(store, rng, gs);
  runTrapsPass(store, rng, gs); // 原版 pass 76 Traps（返回 slot15 排查计数回归）
}

// 宝石系统（原版序 GemCaves → ExposedGems → SpeleothemsAndGemTrees；
// GemCaves 已按注册序前移到"宝石洞"独立槽——必须先于苔藓与洞穴墙）
function gemCavesPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runGemCavesPass(store, rng, gs);
}

function vanillaGems({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runExposedGemsPass(store, rng, gs);
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
  runSunflowersPart2Pass(store, rng, gs);
}

/** JunglePlantsPart2（cs:20310-20337）——地表丛林大株植物 233 */
function junglePlantsSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runJunglePlantsPart2Pass(store, rng, gs);
}

/** DirtWallsIntoMudWallsInJungle（cs:20963-21017）——丛林表层泥墙→丛林泥墙 15 */
function jungleMudWallsSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runJungleMudWallsPass(store, rng, gs);
}

/** LihzahrdAltar 终保 pass（cs:21753-21791）——TileCleanup 后重放祭坛 */
function lihzahrdAltarSlot({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runLihzahrdAltarPass(store, gs);
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

function tileCleanupPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runTileCleanupPass(store, rng, gs);
}

function brokenTrapCleanupPass({ store, world }: GenCtx) {
  // cs:22286 门：!noTraps || tenthAnniversary || notTheBees——普通世界恒跑
  const f = world.seedFlags;
  if (f?.noTraps && !f?.tenthAnniversary && !f?.notTheBees) return;
  runBrokenTrapCleanupPass(store);
}

function finalCleanupPass({ store }: GenCtx) {
  runFinalCleanupPass(store, ctxGs[0]!);
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
  if (gs) runTreePass(store, rng, gs);
}

function alchemyHerbsSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (gs) runAlchemyHerbsPass(store, rng, gs);
}

function websInSpiderCavesSlot({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (gs) runWebsInSpiderCavesPass(store, rng, gs);
}

function grassPlantsSlot({ store, rng }: GenCtx) {
  runGrassPlantsPass(store, rng);
  const gs = ctxGs[0];
  if (gs) runGlowingMushroomPlantsPass(store, rng, gs);
}

function caveWallVarietyPass({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runCaveWallVarietyPass(store, rng, gs);
}

// 苔藓（原版 MossAndMossCaves cs:17573-17833）
function vanillaMoss({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runMossAndMossCavesPass(store, rng, gs);
}

// 草墙（原版 SurfaceDirtWallsToGrassWalls cs:19734-19824）
function vanillaGrassWall({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runGrassWallPass(store, rng, gs);
}

// 海滩装饰：贝壳堆 + 海藻（原版 ShellPiles pass + GrowCheckSeaweed）
function vanillaBeachDecor({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runBeachDecorPass(store, rng, gs);
}

// 引力沙（原版 GravitatingSandCleanup cs:15198-15226）：地表内悬空 Falling 系落定
function gravitatingSandPass({ store }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runGravitatingSandPass(store, gs);
}

// 原版 pass 与旧 pass 的桥接存储(单次生成生命周期)
const ctxGs: [GenState | null] = [null];
/** OceanCaves(生物群系槽 15228) → UnderwaterChests(结构槽 17343) 的宝藏点跨槽传递 */
const ctxOceanTreasures: [Array<{ x: number; y: number }>] = [[]];
/** 探针/测试用：最近一次生成的 GenState（山丘坐标等） */
export function lastGenState(): GenState | null { return ctxGs[0]; }

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
 *  注：1.4.5.6 "getfixedboi"（Everything）同时开 DontStarve/Drunk/FTW **与** Anniversary
 *  （WorldSeedOption_Everything.cs:24-31 全依赖表）→ 被最后的 !tenthAnniversary 否决，
 *  与本表（getfixedboi 不置 theConstant/tenthAnniversary）殊途同归：均不触发。 */
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
  // 原版 Pots pass(1.4.5.6 WorldGen.cs:18186-18286)1:1:
  // count = 面积×0.0008(小 4200×1200 = 4032 个),每个成功点放 1 罐;
  // 进度 >75% 强制从地表浅层起扫、>93% 强制地狱行;2 宽×2 高 PlacePot
  // (cs:54082:frameX = k*18 + 变体*36、frameY = (l+1)*18 + style*36);
  // 样式按地面 tile/墙(冰雪 4-6/丛林草 7-9/地牢 10-12/腐化 16-18/猩红 22-24/
  // 花岗岩 31-33/蜥蜴砖 28-30/大理石墙 34-36/地狱 13-15/默认 0-3)。
  // 旧实现 w/6 次尝试+12 格排斥 → 只有原版 ~5%
  const gs = ctxGs[0];
  if (!gs) return;
  // ---- 墓园群系（cs:18110-18120：本 pass 首段，先于瓦罐消耗 RNG 流）----
  // 门见 graveyardSeedGate（秘密种子专属；普通世界零墓碑=原版常态）
  if (graveyardSeedGate(gs.seedFlags)) {
    spawnGraveyardBiomesEverywhere(store, rng, world, gs);
  }
  const { w, h } = store;
  const POT = TILE_BY_KEY['pot']!;
  const count = Math.floor(w * h * 0.0008);
  const surfHigh = Math.max(1, Math.floor(gs.worldSurfaceHigh));
  const surfLow = Math.floor(gs.worldSurfaceLow);

  const SNOW = TILE_BY_KEY['snow']!, ICE = TILE_BY_KEY['ice']!;
  const JUNGLE = TILE_BY_KEY['v_60_jungle_grass_block']!;
  const LIHZARD = TILE_BY_KEY['v_226_lihzahrd_brick'] ?? -1;
  const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  const MARBLE_WALLS = new Set([187, 216, 223]);

  for (let n = 0; n < count; n++) {
    const progress = n / count;
    // 原版外层 while(!flag) 重试：每罐最多 10000 次全列尝试（cs:18198/18290 num7）
    let placed = false;
    for (let attempt = 0; attempt < 10000 && !placed; attempt++) {
      let y0 = rng.int(surfHigh, Math.max(surfHigh + 1, h - 10));
      if (progress > 0.93) y0 = h - 150;          // 尾段强制地狱行(cs:18194)
      else if (progress > 0.75) y0 = surfLow;     // 后 1/4 起地表浅层(cs:18196)
      const x = rng.int(20, w - 20);
      // 向下扫描(cs:18210-18286):遇首个实心(且上格非岩浆/微光)后进入候选模式
      let foundSolid = false;
      for (let y = y0; y < h - 20 && !placed; y++) {
        const t = store.get(x, y);
        if (!foundSolid) {
          const liq = store.liquid[store.idx(x, y - 1)];
          const ltype = store.liquidType[store.idx(x, y - 1)];
          if (t !== 0 && TILE_DEFS[t]?.solid && !(liq > 0 && ltype === 2) && !(liq > 0 && ltype === 4)) foundSolid = true;
          continue;
        }
        // cs:18216 门禁:y < Main.worldSurface(平均地表线)时必须有墙——
        // 曾误用 worldSurfaceLow(谷底线,几乎恒小于 y)→ 地表露天处全放,陶罐泛滥
        if (y < gs.worldSurface && store.wall[store.idx(x, y)] === 0) continue;
        // cs:18220：style=Next(0,4) 在该行通过墙门禁后立即掷（ground 门禁之前——
        // 消费顺序 1:1，漏掷会平移后续 RNG 流）
        let style = rng.int(0, 3);
        const ground = store.get(x, y + 1);
        if (ground === 0 || !store.flags[store.idx(x, y + 1)]) continue;
        const liq2 = store.liquid[store.idx(x, y)];
        const ltype2 = store.liquidType[store.idx(x, y)];
        if ((liq2 > 0 && ltype2 === 2) || (liq2 > 0 && ltype2 === 4)) continue; // anyLava/anyShimmer 才拒（水/蜜可放）
        if (oceanDepthsAt(store, gs, x, y)) continue;
        // 样式覆写链（cs:18235-18266，非互斥、后命中覆盖先命中；RNG 仅在命中时消耗）
        const sheetOf = (id: number) => TILE_DEFS[id]?.vanilla?.sheet ?? -1;
        const gs2 = sheetOf(ground);
        if (ground === SNOW || ground === ICE || gs2 === 162) style = rng.int(4, 6);
        if (ground === JUNGLE) style = rng.int(7, 9);
        {
          const wl = store.wall[store.idx(x, y)];
          // IsDungeonPlatformOrShelf（cs:11507）：type19 且 frameY/18 ∈ {6,7,8,9..12}
          const shelfRow = Math.floor(store.frameY[store.idx(x, y + 1)] / 18);
          const inDun = DUNGEON_WALLS.has(wl)
            || gs2 === 41 || gs2 === 43 || gs2 === 44 || gs2 === 481 || gs2 === 482 || gs2 === 483
            || (gs2 === 19 && shelfRow >= 6 && shelfRow <= 12);
          if (inDun) style = rng.int(10, 12);
        }
        if (gs2 === 23 || gs2 === 25 || gs2 === 22 || gs2 === 163) style = rng.int(16, 18); // 腐化草/黑檀石/魔矿/紫冰
        if (gs2 === 199 || gs2 === 203 || gs2 === 204 || gs2 === 200) style = rng.int(22, 24);
        if (sheetOf(ground) === 367) style = rng.int(31, 33);  // cs:18264：大理石 367 → 31-33（曾错查 368 花岗岩）
        if (ground === LIHZARD) style = rng.int(28, 30);
        if (MARBLE_WALLS.has(store.wall[store.idx(x, y)])) style = rng.int(34, 36);
        if (y > h - 200) style = rng.int(13, 15);  // Main.UnderworldLayer = maxTilesY-200
        // PlacePot（cs:54082）：2×2 净空 + 双列下方 nactive/整砖/无坡/实心
        if (!placePot(store, rng, x, y, POT, style)) continue;
        placed = true;
      }
    }
  }
}

/** PlacePot（1456 WorldGen.cs:54082）1:1：2×2（x..x+1, y-1..y）须净空；
 *  下方双列须 nactive && !halfBrick && slope==0 && tileSolid；成功才掷 Next(3) 变体 */
function placePot(store: TileStore, rng: RNG, x: number, y: number, type: number, style: number): boolean {
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      if (!store.inBounds(x + dx, y + dy) || store.flags[store.idx(x + dx, y + dy)]) return false;
    }
    if (!store.inBounds(x + dx, y + 1)) return false;
    const gi = store.idx(x + dx, y + 1);
    if (!store.flags[gi] || store.half[gi] || store.slope[gi] !== 0) return false;
    const d = TILE_DEFS[store.type[gi]];
    if (!d?.solid) return false;
  }
  const variant = rng.int(0, 2) * 36;   // genRand.Next(3)*36（仅成功时消费）
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = -1; dy <= 0; dy++) {
      store.setTileSilent(x + dx, y + dy, type, dx * 18 + variant, (dy + 1) * 18 + style * 36);
      store.half[store.idx(x + dx, y + dy)] = 0;
    }
  }
  return true;
}

/** tile 379（SpawnPoint 回避族，cs:19683/19704-19707：列扫描跳过 + IsTileNearby(10) 重试） */
const TILE_379 = TILE_BY_KEY['v_379_bubble'] ?? -1;

/** oceanDepths（WorldGen.cs:10968）：y > oceanLevel 直接 false；海滩列才 true */
function oceanDepthsAt(store: TileStore, gs: GenState, x: number, y: number): boolean {
  const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
  if (y > oceanLevel) return false;
  return x < gs.beachDistance || x > store.w - gs.beachDistance;
}

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
  if (gs0) spreadingGrassPass(store, gs0);
  void surface; void world;
}

/** SpreadingGrass 段①②（cs:18354-18460）1:1 */
function spreadingGrassPass(store: World['store'], gs: GenState) {
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
          spreadGrass(store, x, y, T.DIRT, T.GRASS, true);
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
      // 残留脏帧只会是小正值，只对正值做越表判定
      const fxv = store.frameX[i], fyv = store.frameY[i];
      if (fxv < 32768 && fyv < 32768 && (fxv >= w || fyv >= h2)) {
        store.frameX[i] = 0; store.frameY[i] = 0;
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
function spawnPointPass({ store, rng, world }: GenCtx) {
  let range = 5;
  let sx = Math.floor(store.w / 2), sy = 0;
  for (;;) {
    const x = Math.floor(store.w / 2) + rng.int(-range, range); // Next(-num2, num2+1)
    for (let y = 0; y < store.h; y++) {
      const i = store.idx(x, y);
      // 首个实心格（原版 cs:19683 仅 active && type!=379——379 是非实心装饰格，
      // 实心判据天然跳过；solid 判据防树干致浮空出生，保留）
      if (store.flags[i] && !!TILE_DEFS[store.type[i]]?.solid && store.type[i] !== TILE_379) { sx = x; sy = y; break; }
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
    const x = rng.int(Math.floor(store.w / 2) - widen, Math.floor(store.w / 2) + widen);
    for (let y = 0; y < store.h; y++) {
      const i = store.idx(x, y);
      if (store.flags[i] && !!TILE_DEFS[store.type[i]]?.solid && store.type[i] !== TILE_379) { sx = x; sy = y; break; }
    }
    widen++;
  }
  world.spawnX = sx;
  // spawnY = 地面行本身（原版 spawnTileY = j 直存,cs:19724）。消费端自行抬高：
  // Game.ts Player 用 (spawnY-3)*TILE（玩家 3 格高）。此前这里也 -3 → 双重偏移,
  // 玩家浮空 6 格后坠落
  world.spawnY = Math.max(4, sy);
  // 出生点上空净空保留（防卡块；不整平地形）。
  // ★必须豁免树干:树干非实心不会卡人,整格清空会把清理盒内的树干中段删掉
  // (基座行 dy=0 与上部 dy>5 保留)→ 浮空断干"贴图透明"。
  const clearSpawnCell = (x: number, y: number, keepGrass: boolean) => {
    if (!store.inBounds(x, y)) return;
    const i = store.idx(x, y);
    const t = store.type[i];
    if (!store.flags[i] || t === T.TREE) return;
    if (keepGrass && t === T.GRASS) return;
    store.setTileSilent(x, y, 0);
  };
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = 1; dy <= 3; dy++) {
      clearSpawnCell(sx + dx, sy - dy, false);
    }
  }
  // 出生点上空净空（宽区:5×5,豁免草面/树干——草面保持地表,树干保持完整见上注）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 5; dy++) {
      clearSpawnCell(sx + dx, sy - dy, true);
    }
  }
}
