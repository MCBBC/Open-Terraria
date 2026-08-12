// 程序化世界生成管线：地形 → 洞穴 → 矿石 → 液体 → 表面 → 结构
// 分帧执行以显示进度。纯函数式 pass，每个 pass 直接写 TileStore（生成期用 silent 写入）。
import { RNG, translateSeed } from '../../core/rng';
import type { TileStore } from '../TileStore';
import { T, TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import { World } from '../World';

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
  //   清理(37) 生命水晶(55) 半砖平滑(57) 瀑布(58) 地狱(31) 地狱屋(76 前段)
  //   地狱箱(63 地狱段) 小屋+散箱(63) 瓦罐(75) 矿骨堆(81) 表面(77/86/90)
  //   地表装饰(76 traps/85) 海滩装饰(56) 结构
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
    // 原版注册序 Lakes(14613) < Shimmer(15256) < DirtWallCleanup(15310)：
    // 微光以太在此挖洞灌液，清理/沉降在其后（Slush 31 已随 Lakes 入"液体"槽）
    { name: '微光', run: vanillaShimmer },
    { name: '清理', run: vanillaCleanup },
    // 原版 SettleLiquids（cs:16215）：Lakes 之后、SmoothWorld/Waterfalls 之前的中途
    // 沉降——瀑布唇缘/半砖平滑直接读 st.liquid 判定，必须在静止水面数据上跑
    // （此前沉降只在管线末尾 → 唇缘基于未沉降水体漂移）。
    // 原版 SettleLiquidsPart2（cs:21051，管线尾二次沉降）由 generateWorld 之后
    // worker/Game 的 settleWorldLiquids('gen') 承担。
    { name: '水体沉降', run: liquidSettlePass },
    // 原版 "Smooth World"(cs:16507)+"Waterfalls"(cs:16697)：地表凸起与水边唇缘砸半砖
    // （半砖 = 原版水浸润/瀑布触发的核心，见 HalfBrickPass.ts）
    { name: '半砖平滑', run: halfBrickSmoothPass },
    { name: '瀑布唇缘', run: waterfallLipPass },
    { name: '生命水晶', run: vanillaLifeCrystals },
    { name: '地狱', run: hellPass },
    { name: '地狱屋', run: vanillaHellHouses },
    // 地狱箱:必须在地狱地形+地狱屋之后(原版 Underworld 29 < Buried Chests 59);
    // 曾在生物群系 pass 里随洞穴箱一起放 → 被后续 hellPass 重写 100% 抹除
    { name: '地狱箱', run: underworldChestsPass },
    // 苔藓（原版 MossAndMossCaves cs:17573，注册序 BuriedChests 17066 < 本 pass <
    // Pots 18186）：霓虹苔藓洞 + 苔藓斑/散点/地狱氦苔藓——洞穴系全部定型后只做
    // 石→苔藓点状替换；长苔藓 pass（20915）的上游，缺它则全图 0 长苔藓
    { name: '苔藓', run: vanillaMoss },
    // 地狱熔炉(原版 Hellforges,cs:18298:w/200 个,墙 13/14 门禁)
    { name: '地狱熔炉', run: hellforgesPass },
    // （原版管线地下小屋/散箱已由生物群系 pass 内的 CaveHousePass/BuriedChestsPass/
    // SurfaceChestsPass 完整覆盖,legacy structurePass 已删除——再跑会双倍密度+空箱）
    // 瓦罐（原版 pass 75 PotsGraveyardsAndBoulderPiles 位置：Hellforges 76 之前）
    { name: '瓦罐', run: potPass },
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
    // 草墙（原版 SurfaceDirtWallsToGrassWalls cs:19734，注册序 Piles 18900 之后的
    // SpawnPoint 19605 < 本 pass < DyePlants 20126）：地表泥土墙洞 → 草墙 63/花墙 65——
    // Vines pass 花藤 382 的上游（藤头墙 ∈ {63,65,66,68} 才出花藤）
    { name: '草墙', run: vanillaGrassWall },
    // 染料植物（原版 DyePlants cs:20126）：plantDye + MatureTheHerbPlants +
    // GrowGlowTulips(656) + PlaceChilletEggs(752)，位于 AlchemyHerbs(20109) 之后
    { name: '染料植物', run: vanillaDyePlants },
    // 藤蔓（原版 Vines cs:20338）：六类藤蔓逐列生长 + 丛林蜂巢凹龛
    { name: '藤蔓', run: vanillaVines },
    // 地表花（原版 Flowers cs:20592）：花圃重帧，消费 gs.logX/logY
    { name: '地表花', run: vanillaFlowers },
    // 地表蘑菇（原版 Mushrooms cs:20744）：蘑菇斑帧重刷
    { name: '地表蘑菇', run: vanillaMushrooms },
    // 宝石系统（原版 GemCaves(17528) < ExposedGems(20842/20874) <
    // SpeleothemsAndGemTrees(22196)：装饰之后、海滩装饰之前）
    { name: '宝石系统', run: vanillaGems },
    // 长苔藓（原版 LongMoss cs:20915）：苔藓块四向冒芽，位于 ExposedGems 之后
    { name: '长苔藓', run: vanillaLongMoss },
    // 原版 Micro Biomes(cs:21785:Campsites 21915 + MiningExplosives 21951),
    // 位于 Traps/Piles/Trees 之后、Lilypads/海藻(22131,=海滩装饰)之前
    { name: '微群系', run: vanillaMicroBiomes },
    // 水生植物（原版 LilypadsCattailsBambooAndSeaweed cs:22131）：睡莲/香蒲/竹/海藻
    { name: '水生植物', run: vanillaLilypads },
    { name: '海滩装饰', run: vanillaBeachDecor },
  ];

  for (let i = 0; i < passes.length; i++) {
    onProgress?.(passes[i].name, i / passes.length);
    await nextFrame();
    await passes[i].run(ctx, () => {});
    // 部分世界回调（生成期实时预览）：pass 完成即暴露，不等 finalize
    if (cfg.onWorldPartial) cfg.onWorldPartial(world, i, passes[i].name);
  }

  finalize(ctx);
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
import { runGrassPass } from './vanilla/GrassPass';
import { runJunglePass } from './vanilla/JunglePass';
import { runMudCavesPass } from './vanilla/Spread';
import { runDesertPass } from './vanilla/DesertPass';
import { runMushroomPass } from './vanilla/MushroomPass';
import { runMarbleGranitePass } from './vanilla/MarbleGranitePass';
import { runDunesPass } from './vanilla/DunesPass';
import { runShimmerPass } from './vanilla/ShimmerPass';
import { runMicroBiomesPass } from './vanilla/MicroBiomesPass';
import { runDirtToMudAndSiltPass } from './vanilla/DirtToMudPass';
import { runCleanupPass } from './vanilla/CleanupPass';
import { runSmoothWorldPass, runWaterfallLipPass } from './vanilla/HalfBrickPass';
import { runShiniesPass, runGemsPass } from './vanilla/ShiniesPass';
import { runGemCavesPass, runExposedGemsPass, runGemTreesPass } from './vanilla/GemPasses';
import { runMossAndMossCavesPass } from './vanilla/MossPass';
import { runGrassWallPass } from './vanilla/GrassWallPass';
import { runMountCavesPass, runMountainCavesPass } from './vanilla/MountCavesPass';
import { runTreePass, randomizeTreeStyle, growAshTree } from './vanilla/TreePass';
import { runLakesPass } from './vanilla/LakesPass';
import { runTrapsPass } from './vanilla/TrapsPass';
import { runFloatingIslandsPass, runLifeCrystalsPass, runSurfaceDecorPass, runPyramidPass, runWetJunglePass, runAlchemyHerbsPass } from './vanilla/StructuresPass';
import {
  runSurfaceOreAndStonePass, runFallenLogsPass, runDyePlantsPass, runVinesPass,
  runFlowersPass, runMushroomsPass, runLongMossPass, runLilypadsPass,
} from './vanilla/SurfaceDecorPasses';
import { runLivingTreesPass, runLivingTreeWallsPass } from './vanilla/LivingTreePass';
import { runBeehivePass, runSpiderNestPass, runWebsInSpiderCavesPass, runWebsPass } from './vanilla/HiveSpiderPass';
import { tileRunner } from './vanilla/TileRunner';
import { runDungeonPass } from './vanilla/DungeonPass';
import { runTemplePass } from './vanilla/TemplePass';
import { runIslandHousePass } from './vanilla/IslandHousePass';
import { runHellFortPass } from './vanilla/HellFortPass';
import { runSwordShrinePass } from './vanilla/SwordShrinePass';
import { runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass, runWaterChestsPass } from './vanilla/BuriedChestsPass';
import { runStatuesPass } from './vanilla/StatuesPass';
import { runJungleShrinePass, runJungleChestsPass } from './vanilla/JungleShrinePass';
import { runCaveHousesPass } from './vanilla/CaveHousePass';
import { runOceanCavesPass, runUnderwaterChestsPass } from './vanilla/OceanCavesPass';
import { runHellforgesPass } from './vanilla/HellforgesPass';
import { runCorruptionPass } from './vanilla/CorruptionPass';
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
  // ① jungleHut（cs:11179）——丛林小屋样式映射，未消费
  rng.nextInt(5);
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
  // 原版 1456 注册序 Lakes(30, cs:14613) → Slush(31) →（32 Dungeon 及其后段在
  // vanillaBiomes 内，Dungeon/Lakes 倒挂是既有偏差另案）→ Shimmer(38)。
  // Gems(35) 已按注册序拆到 Beaches(34) 之后（vanillaBiomes 内）。
  const gs = ctxGs[0];
  if (!gs) return;
  runLakesPass(store, rng, gs);
  runSlushPass(store, gs);               // 31 Slush（原在 DirtToMud 后、Corruption 前——注册序修正）
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
  runDesertPass(store, rng, gs);         // 19 Full Desert
  runMushroomPass(store, rng, gs);       // 20 Mushroom Patches
  runMarbleGranitePass(store, rng, gs);  // 21/22 Marble/Granite
  runFloatingIslandsPass(store, rng, gs); // 23 Floating Islands（原在蘑菇前——注册序修正）
  runDirtToMudAndSiltPass(store, rng, gs); // 24 Dirt To Mud / 25 Silt
  runShiniesPass(store, rng, gs);        // 26 Ores And Shinies（原在很后"矿石"槽——移到 Silt 后=Webs 位）
  runCorruptionPass(store, rng, gs);     // 29 Corruption/Crimson
  runDungeonPass(store, rng, gs, world.chests); // 32 Dungeon(蓝/粉砖主题+走廊房间+宝箱)
  // 地牢 pass 预计算会重掷 dungeonLocation(锚点 ±300 拒绝采样后迁移)——必须在此后
  // 回写最终位置,否则 world.dungeonX 停留在 Reset 期的旧值(与实际地牢偏差可达数百格)。
  // 优先取入口门厅可站立点(原版 dungeonX/Y 语义 cs L72510-72527:入口结构上可站处,
  // 守卫老人出生/游走锚)——塔心锚点会把老人漏进塔内
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
  runGemsPass(store, rng, gs);           // 35 Gems（原捆绑在 Lakes 槽——注册序修正移到 Beaches 后）
  // 原版 1456 注册序（WorldGen.cs 行号 = 唯一权威，2026-08-11 review 依此重排）：
  //   OceanCaves(15228) < Pyramids(15426) < SurfaceWaterInJungle(15887) <
  //   Temple(15911) < Beehives(16005) < JungleShrines(16059) < Statues(16947) <
  //   UndergroundHouses+BuriedChests(17066) < SurfaceChests(17226) <
  //   ChestsInJungleShrines(17308) < UnderwaterChests(17343) < SpiderCaves(17455) <
  //   FloatingIslandHouses(17971) < MicroBiomes(21785)
  // 神庙/灌水提前到宝箱系之前（原版语义:大结构先占位,箱/雕像后放才不会塞进
  // 神庙体内或被灌水淹没;此前神庙在蜘蛛洞后 → 占地区内已塞雕像/箱,放置互相破坏）。
  const oceanTreasures = runOceanCavesPass(store, rng, gs); // 海洋洞窟蠕虫+宝藏点记录
  runPyramidPass(store, rng, gs, world.chests); // Pyramids(沙岩砖金字塔+宝箱)
  // 原版注册序 Pyramids(15426) < LivingTrees(15551) < LivingTreeWalls(15792) <
  // SurfaceWaterInJungle(15887)——世界树插在金字塔后、丛林灌水前（方案 A 原版位置）。
  // LivingTrees：GrowLivingTree 树干壳+枝叶+根系+贯通竖井+密室宝箱；LivingTreeWalls：
  // 全图 type==191 连通核补墙 244（零掷骰）。
  runLivingTreesPass(store, rng, gs, world.chests);  // Living Trees(世界树)
  runLivingTreeWallsPass(store, gs);                 // Living Tree Walls(活木墙)
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
  runWebsPass(store, rng, gs);                  // Webs(全局天花板蛛网 runner 51;1456 注册 13659 早段,后放防被清,语义近 WebsInSpiderCaves)
  runSpiderNestPass(store, rng, gs, world.chests); // Spider Caves(countTiles 门+波前BFS刷墙62+蛛网罐/箱/垂网/覆饰)
  runWebsInSpiderCavesPass(store, rng, gs);     // Webs In Spider Caves(墙62 9/10蛛网51)+蜂巢钟乳石/蜂蜜
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

// 矿/骨堆(原版 pass 77 Piles,cs:18928:w*0.06 次尝试,洞穴地面放小堆 185/骨堆 186)
function pilesPass({ store, rng }: GenCtx) {
  const { w, h } = store;
  const SMALL = TILE_BY_KEY['v_185_small_decos']!;
  const BONE = TILE_BY_KEY['v_186_decos_3x2']!;
  const tries = Math.floor(w * 0.06);
  let fail = 0;
  for (let n = 0; n < tries && fail < 10000; ) {
    const x = rng.int(20, w - 21);
    const y = rng.int(20, h - 20);
    // 落到第一个实心地面(与洞穴箱同式)
    let gy = y, guard = 0;
    while (guard++ < 400 && store.inBounds(x, gy) && !store.flags[store.idx(x, gy)]) gy++;
    // 原版地面门（PlaceTile case 186 → SolidTileAllowBottomSlope :49284/:70211）：
    // 下方须实心且【非半砖非顶坡】（topSlope=slope 1/2）——斜坡沙上不生成装饰；
    // 骨堆跨 3 列（185 单列），整片地面都要平
    let groundOk = true;
    for (let dx = 0; dx < 3 && groundOk; dx++) {
      if (!store.inBounds(x + dx, gy)) { groundOk = false; break; }
      const gi = store.idx(x + dx, gy);
      if (!TILE_DEFS[store.type[gi]]?.solid
        || store.half[gi] === 1 || (store.slope[gi] >= 1 && store.slope[gi] <= 2)) groundOk = false;
    }
    if (!groundOk) { fail++; continue; }
    const i = store.idx(x, gy - 1);
    if (!store.inBounds(x, gy - 1) || store.flags[i]) { fail++; continue; }
    if (store.liquid[i] > 100) { fail++; continue; }
    if (rng.next() < 0.7) {
      // 小堆 185:1×1,风格 ×18(fx 带 +18 偏移的下半帧;placeSmallPile size-0 语义)
      const style = rng.int(0, 9);
      store.setTileSilent(x, gy - 1, SMALL, style * 18, 0);
    } else {
      // 骨堆 186:3×2,风格 ×54(3 列 stride)
      let ok = true;
      for (let dx = 0; dx < 3 && ok; dx++) {
        for (let dy = 1; dy <= 2 && ok; dy++) {
          if (!store.inBounds(x + dx, gy - dy) || store.flags[store.idx(x + dx, gy - dy)]) ok = false;
        }
      }
      if (!ok) { fail++; continue; }
      const style = rng.int(0, 1);
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          store.setTileSilent(x + dx, gy - 2 + dy, BONE, style * 54 + dx * 18, dy * 18);
        }
      }
    }
    n++;
  }
}

// 生物群系感知地表装饰(替代旧 surfacePass 的种树部分)
function vanillaSurfaceDecor({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runSurfaceDecorPass(store, rng, gs);
  runTrapsPass(store, rng, gs); // 原版 pass 76 Traps（返回 slot15 排查计数回归）
}

// 宝石系统（原版序 GemCaves → ExposedGems → SpeleothemsAndGemTrees）
function vanillaGems({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runGemCavesPass(store, rng, gs);
  runExposedGemsPass(store, rng, gs);
  runGemTreesPass(store, rng, gs);
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

// 原版 pass 与旧 pass 的桥接存储(单次生成生命周期)
const ctxGs: [GenState | null] = [null];
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
  const st = store;
  const ASH = T.ASH;
  const HELLSTONE = TILE_BY_KEY['ore_hellstone']!;
  // 1) 边界 + 灰烬带 + 界下清空
  let boundary = st.h - rng.int(150, 189);
  for (let x = 0; x < st.w; x++) {
    boundary += rng.int(-3, 3);
    if (boundary < st.h - 190) boundary = st.h - 190;
    if (boundary > st.h - 160) boundary = st.h - 160;
    const ashTop = boundary - 20 - rng.int(0, 2);
    for (let y = ashTop; y < st.h; y++) {
      const i = st.idx(x, y);
      if (y >= boundary) {
        st.type[i] = 0; st.flags[i] = 0;
        st.liquid[i] = 0; st.liquidType[i] = 0;
      } else {
        st.type[i] = ASH; st.flags[i] = 1;
        // 原版地狱本体无自然墙（空腔无墙，NPC 可刷）——此前涂 wall 1（可放置墙，
        // 在 spawner WALL_HOUSE 表内）→ 地狱刷怪点被"房屋墙门"(NPC.cs L886)全拒，
        // 地狱恒不刷怪
      }
    }
  }
  // 2) 岩浆线
  let lavaY = st.h - rng.int(40, 69);
  for (let x = 10; x < st.w - 10; x++) {
    lavaY += rng.int(-10, 10);
    if (lavaY > st.h - 60) lavaY = st.h - 60;
    if (lavaY < st.h - 100) lavaY = st.h - 120;
    for (let y = lavaY; y < st.h - 10; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  const gs = ctxGs[0]!;
  // 3a) 大灰烬丘陵(1/50 列):巨型竖直灰烬 runner 填充虚空
  for (let x = 0; x < st.w; x++) {
    if (rng.next() * 50 >= 1) continue;
    let y = st.h - 65;
    while (!st.flags[st.idx(x, y)] && y > st.h - 135) y--;
    tileRunnerHell(st, rng, gs, rng.int(0, st.w - 1), y + rng.int(20, 49),
      rng.int(15, 19), 1000, ASH, true, 0, rng.int(1, 2), true);
  }
  // 3b) 每列 1/13:竖直灰烬柱 + 横向灰烬团 + 挖掘隧道(填岩浆)
  for (let x = 0; x < st.w; x++) {
    if (rng.next() * 13 >= 1) continue;
    let y = st.h - 65;
    while ((st.liquid[st.idx(x, y)] > 0 || st.flags[st.idx(x, y)]) && y > st.h - 140) y--;
    let scaleF = rng.int(1, 2);
    if (rng.next() * 3 < 1) scaleF *= 0.5;
    tileRunnerHell(st, rng, gs, x, y - rng.int(2, 4), rng.int(5, 29), 1000, ASH, true, 0, rng.int(1, 2), true);
    if (rng.next() < 0.5) {
      tileRunnerHell(st, rng, gs, x, y - rng.int(2, 4), Math.floor(rng.int(5, 14) * scaleF), Math.floor(rng.int(10, 14) * scaleF), ASH, true, 1, 0.3, false);
    }
    if (rng.next() < 0.5) {
      const s2 = rng.int(1, 2);
      tileRunnerHell(st, rng, gs, x, y - rng.int(2, 4), Math.floor(rng.int(5, 14) * s2), Math.floor(rng.int(10, 14) * s2), ASH, true, -1, 0.3, false);
    }
    tileRunnerHell(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 10), rng.int(5, 14), rng.int(5, 9), -2, false, rng.int(-1, 2), rng.int(-1, 2), false);
    if (rng.next() * 3 < 1) {
      tileRunnerHell(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 10), rng.int(10, 29), rng.int(10, 19), -2, false, rng.int(-1, 2), rng.int(-1, 2), false);
    }
    if (rng.next() * 5 < 1) {
      tileRunnerHell(st, rng, gs, x + rng.int(-15, 14), y + rng.int(-15, 9), rng.int(15, 29), rng.int(5, 19), -2, false, rng.int(-1, 2), rng.int(-1, 2), false);
    }
  }
  // 3c) 随机小挖掘(w 个)
  for (let n = 0; n < st.w; n++) {
    tileRunnerHell(st, rng, gs, rng.int(20, st.w - 21), rng.int(st.h - 180, st.h - 11),
      rng.int(2, 6), rng.int(2, 6), -2, false, 0, 0, false);
  }
  // 4) 底部岩浆层(h-145/144)+ 地狱石脉
  for (let x = 0; x < st.w; x++) {
    for (const dy of [145, 144]) {
      const i = st.idx(x, st.h - dy);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  for (let n = 0; n < st.w * st.h * 0.0008; n++) {
    tileRunnerHell(st, rng, gs, rng.int(0, st.w - 1), rng.int(st.h - 140, st.h - 1),
      rng.int(2, 6), rng.int(3, 6), HELLSTONE, false, 0, 0, false);
  }
  // 5) 灰烬草 633 + 灰烬树 634（cs:13869-13915）：仅地图外缘 17% 带——
  //    y∈[h-300, h-100±1) 的灰烬 57 任一 8 邻暴露 → 633（藤 638 的上游）；
  //    再对 y∈[h-200, h-50) 的 633（上方空气）1/3 → TryGrowingTreeByType(634)
  const ASH_GRASS = TILE_BY_KEY['v_633_ash_grass_block']!;
  const outerBand = (x: number) => x < st.w * 0.17 || x > st.w * 0.83;
  for (let x = 25; x < st.w - 25; x++) {
    if (!outerBand(x)) continue;
    for (let y = st.h - 300; y < st.h - 100 + rng.int(-1, 1); y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH || !st.flags[i]) continue;
      const exposed = !st.flags[st.idx(x - 1, y - 1)] || !st.flags[st.idx(x, y - 1)]
        || !st.flags[st.idx(x + 1, y - 1)] || !st.flags[st.idx(x - 1, y)]
        || !st.flags[st.idx(x + 1, y)] || !st.flags[st.idx(x - 1, y + 1)]
        || !st.flags[st.idx(x, y + 1)] || !st.flags[st.idx(x + 1, y + 1)];
      if (exposed) st.type[i] = ASH_GRASS;
    }
  }
  for (let x = 25; x < st.w - 25; x++) {
    if (!outerBand(x)) continue;
    for (let y = st.h - 200; y < st.h - 50; y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH_GRASS || !st.flags[i] || st.flags[st.idx(x, y - 1)]) continue;
      if (rng.int(0, 2) === 0) growAshTree(st, rng, x, y);
    }
  }
}

/** 地狱专用 runner:超界安全(地狱区常越界) */
function tileRunnerHell(st: World['store'], rng: RNG, gs: GenState, i: number, j: number,
  strength: number, steps: number, type: number, addTile: boolean,
  speedX: number, speedY: number, noYChange: boolean): void {
  tileRunner(st, rng, gs, i, Math.max(2, Math.min(st.h - 3, j)), {
    strength, steps, type, addTile, speedX, speedY, noYChange,
  });
}


// ---------- 瓦罐散布 ----------
function potPass({ store, rng }: GenCtx) {
  // 原版 Pots pass(1.4.5.6 WorldGen.cs:18186-18286)1:1:
  // count = 面积×0.0008(小 4200×1200 = 4032 个),每个成功点放 1 罐;
  // 进度 >75% 强制从地表浅层起扫、>93% 强制地狱行;2 宽×2 高 PlacePot
  // (cs:54082:frameX = k*18 + 变体*36、frameY = (l+1)*18 + style*36);
  // 样式按地面 tile/墙(冰雪 4-6/丛林草 7-9/地牢 10-12/腐化 16-18/猩红 22-24/
  // 花岗岩 31-33/蜥蜴砖 28-30/大理石墙 34-36/地狱 13-15/默认 0-3)。
  // 旧实现 w/6 次尝试+12 格排斥 → 只有原版 ~5%
  const gs = ctxGs[0];
  if (!gs) return;
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
        if (sheetOf(ground) === 368) style = rng.int(31, 33);
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
function surfacePass({ store, surface, rng, world }: GenCtx) {
  const { w } = store;
  // 铺草（原版 pass 73 Spreading Grass 尾段 L8731-8755：每列首个实心格为泥土 → SpreadGrass）
  // 旧实现用生成早期 surface[] 数组定位列顶——山坡/洞穴口露石露土全漏，树密度被卡死
  for (let x = 10; x < w - 10; x++) {
    for (let y = 0; y < world.groundLevel - 1; y++) {
      const i = store.idx(x, y);
      if (!store.flags[i]) continue;
      if (store.type[i] === T.DIRT) store.setTileSilent(x, y, T.GRASS);
      break; // 只处理首个实心格
    }
  }
  // 原版 pass 82 Planting Trees（铺草之后、杂草之前——原版 73<82<86 顺序）
  {
    const gs = ctxGs[0];
    if (gs) runTreePass(store, rng, gs);
  }
  // 原版 pass AlchemyHerbs(20109)：Trees 之后、DyePlants(20126) 之前——w×1.7 次 PlantAlch。
  // MatureTheHerbPlants(45757) 原版在 DyePlants pass 内调用（cs:20135），已随染料植物
  // pass 下沉——此处不再调（熟成时机 1:1）
  {
    const gs = ctxGs[0];
    if (gs) runAlchemyHerbsPass(store, rng, gs);
  }
  // 地表植物装饰——原版 pass GrassPlantsEvilPlantsAndPumpkinsOnSurface（WorldGen.cs:20201-20266）+
  // PlaceTile 液体拒绝（WorldGen.cs:59477：tile 3/24/201/637 在液体中不放）。
  // 门禁 1:1：只铺在草族 tile 上方（普通草 2→tile 3 / 腐化草 23→24 / 猩红草 199→201 /
  // 丛林草 60→73 / 蘑菇草 70→71 发光蘑菇株）；沙滩/海水自然无杂草。
  {
    const CORRUPT_GRASS = TILE_BY_KEY['v_23_corrupt_grass_block'] ?? 0;
    const CRIMSON_GRASS = TILE_BY_KEY['v_199_crimson_grass_block'] ?? 0;
    const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block'] ?? 0;
    const MUSH_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block'] ?? 0;
    const CORRUPT_PLANTS = TILE_BY_KEY['v_24_corruption_short_plants'] ?? 0;
    const CRIMSON_PLANTS = TILE_BY_KEY['v_201_crimson_short_plants'] ?? 0;
    const JUNGLE_PLANTS = TILE_BY_KEY['v_73_forest_tall_plants'] ?? 0;
    const GLOW_SHROOM = TILE_BY_KEY['v_71_mushroom_plant'] ?? 0;
    const CORRUPT_THORNS = TILE_BY_KEY['v_32_corruption_thorns'] ?? 0;
    const CRIMSON_THORNS = TILE_BY_KEY['v_352_crimtane_thorns'] ?? 0;
    const GRASS_FX = [0, 18, 36, 54, 72, 90];
    const FLOWER_FX = [108, 126, 162, 180, 216, 252, 342, 540, 594];
    const plantAbove = (x: number, y: number, type: number, fx: number) => {
      if (y < 1 || !store.inBounds(x, y)) return;
      const i = store.idx(x, y);
      if (store.flags[i] || store.liquid[i] > 0) return; // 上方格须空气且无液体
      store.setTileSilent(x, y, type, fx, 0);
    };
    for (let x = 0; x < w; x++) {
      for (let y = 1; y < store.h; y++) {
        const bi = store.idx(x, y);
        if (!store.flags[bi]) continue;
        const below = store.type[bi];
        if (below === T.GRASS) {
          // 普通草：每格必铺（原版语义），变体 = 草丛 6 / 花 9 / 蘑菇(144)
          const r = rng.next();
          if (r < 0.82) plantAbove(x, y - 1, T.TALLGRASS, GRASS_FX[Math.floor(rng.next() * 6)]);
          else if (r < 0.97) plantAbove(x, y - 1, T.FLOWER, FLOWER_FX[Math.floor(rng.next() * 9)]);
          else plantAbove(x, y - 1, T.MUSHROOM, 144);
        } else if (below === CORRUPT_GRASS) {
          // 腐化草 13% → 荆棘 32（原版 IsFitToPlaceFlowerIn 分支）；帧 144 = 邪恶蘑菇
          if (rng.next() < 0.13 && CORRUPT_THORNS) plantAbove(x, y - 1, CORRUPT_THORNS, 0);
          else plantAbove(x, y - 1, CORRUPT_PLANTS, rng.next() < 0.08 ? 144 : Math.floor(rng.next() * 6) * 18);
        } else if (below === CRIMSON_GRASS) {
          if (rng.next() < 0.13 && CRIMSON_THORNS) plantAbove(x, y - 1, CRIMSON_THORNS, 0);
          else plantAbove(x, y - 1, CRIMSON_PLANTS, Math.floor(rng.next() * 11) * 18);
        } else if (below === JUNGLE_GRASS) {
          plantAbove(x, y - 1, JUNGLE_PLANTS, Math.floor(rng.next() * 6) * 18);
        } else if (below === MUSH_GRASS && GLOW_SHROOM) {
          // 蘑菇草 → 发光蘑菇株（v_71 5 变体；GlowingMushroomPlants pass 语义）
          plantAbove(x, y - 1, GLOW_SHROOM, Math.floor(rng.next() * 5) * 18);
        }
      }
    }
  }
  // 树已由 vanilla/TreePass.ts（原版 pass 82 AddTrees/GrowTree/GrowPalmTree/GrowEpicTree）替换
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
function finalize({ store, surface, world, cfg, rng }: GenCtx) {
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
      if (store.frameX[i] >= w || store.frameY[i] >= h2) { store.frameX[i] = 0; store.frameY[i] = 0; }
    }
  }
  // ---- 原版 Spawn Point（1456 注册 cs:19605，实现 19605-19724）：中心随机扩张采样，自然地表，不改地形 ----
  // 旧实现为"找最平坦窗口+人工整平平台"——出生点是一块突兀平台，与原版自然地表不符
  let range = 5;
  let sx = Math.floor(store.w / 2), sy = 0;
  for (;;) {
    const x = Math.floor(store.w / 2) + rng.int(-range, range); // Next(-num2, num2+1)
    for (let y = 0; y < store.h; y++) {
      const i = store.idx(x, y);
      // 首个【实心】格——首个 active 格可能是树干(solid:false)致浮空出生
      if (store.flags[i] && !!TILE_DEFS[store.type[i]]?.solid) { sx = x; sy = y; break; }
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
    if (!bad) break;
  }
  let widen = 10;
  const gs0 = ctxGs[0];
  while (gs0 && sy > gs0.worldSurface) {
    const x = rng.int(Math.floor(store.w / 2) - widen, Math.floor(store.w / 2) + widen);
    for (let y = 0; y < store.h; y++) {
      const i = store.idx(x, y);
      if (store.flags[i] && !!TILE_DEFS[store.type[i]]?.solid) { sx = x; sy = y; break; }
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
  // 出生点上空净空（宽区:5×5,豁免草面/树干——草面保持地表,树干保持完整见上注）
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 5; dy++) {
      clearSpawnCell(sx + dx, sy - dy, true);
    }
  }
  // 树登记保留:树干不再被清理盒删除,world.trees 与实际树一一对应
  // (原 |t.x-sx|<=5 过滤是配合"清掉树干防幽灵树"的,已不适用)
}
