// 程序化世界生成管线：地形 → 洞穴 → 矿石 → 液体 → 表面 → 结构
// 分帧执行以显示进度。纯函数式 pass，每个 pass 直接写 TileStore（生成期用 silent 写入）。
import { createNoise2D } from 'simplex-noise';
import { RNG, hashString } from '../../core/rng';
import { T, W, TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import { World } from '../World';

export interface GenConfig {
  width: number;
  height: number;
  seedText: string;
  name?: string;
  structures?: boolean;
  /** 邪恶群系：-1 随机（默认） 0 腐化 1 猩红（UIWorldCreation 对应原版 WorldGenParam_Evil） */
  evil?: -1 | 0 | 1;
  /** 每 pass 完成后回调部分世界（生成期实时地图预览用；无需等 finalize） */
  onWorldPartial?: (world: World, passIndex: number, passName: string) => void;
}

export interface Pass {
  name: string;
  run: (ctx: GenCtx, report: (p: number) => void) => void;
}

export interface GenCtx {
  world: World;
  store: World['store'];
  rng: RNG;
  noise2D: (x: number, y: number) => number;
  surface: Float32Array;   // 每列地表高度（tile y）
  cfg: GenConfig;
}

/** 生成一个世界。passes 按序执行，每帧尽量做完一个 pass 后让出主线程。 */
export async function generateWorld(cfg: GenConfig, onProgress?: (label: string, p: number) => void): Promise<World> {
  const seed = hashString(cfg.seedText || String(Date.now()));
  const world = new World(cfg.width, cfg.height, seed, cfg.name ?? '新世界');
  const rng = new RNG(seed);
  const noise2D = createNoise2D(() => rng.next());
  const ctx: GenCtx = {
    world, store: world.store, rng, noise2D,
    surface: new Float32Array(cfg.width),
    cfg,
  };

  // 原版管线:TerrainPass(五特征随机走) + TileRunner 泥石/洞穴;其余 pass 沿用
  // (lgcTerrain=false 走旧 fbm 地形作为回退开关)
  const useVanillaTerrain = (cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain !== false;
  const passes: Pass[] = [
    ...(useVanillaTerrain ? [
      { name: '原版地形', run: vanillaTerrain },
      { name: '洞穴', run: vanillaCaves },
      { name: '海滩', run: vanillaBeaches },
      { name: '生物群系', run: vanillaBiomes },
    ] as Pass[] : [
      { name: '地形', run: terrainPass },
      { name: '洞穴', run: cavePass },
    ]),
    // 原版注册序:Shinies(27) → Lakes(31) → Clean Up Dirt(37) → LifeCrystals(55)。
    // 生命水晶曾排在湖泊之前——湖泊 pass 挖湖盆会掏空已放水晶的脚下 → 凭空悬浮;
    // 清理(Clean Up Dirt)也须在矿石之后(原版 37>27,清理散块才知道哪些是散块)
    { name: '矿石', run: vanillaShinies },
    { name: '液体', run: vanillaLakes },
    ...(useVanillaTerrain ? [
      { name: '清理', run: vanillaCleanup },
      { name: '生命水晶', run: vanillaLifeCrystals },
    ] as Pass[] : []),
    ...(useVanillaTerrain ? [
      // 原版 "Smooth World"(L7568)+"Waterfalls"(L7697)：地表凸起与水边唇缘砸半砖
      // （半砖 = 原版水浸润/瀑布触发的核心，见 HalfBrickPass.ts）
      { name: '半砖平滑', run: halfBrickSmoothPass },
      { name: '瀑布唇缘', run: waterfallLipPass },
    ] as Pass[] : []),
    { name: '地狱', run: hellPass },
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [{ name: '清浮空', run: floatCleanupPass }] : []),
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [] : [{ name: '地狱屋', run: vanillaHellHouses }]),
    // 地狱箱:必须在地狱地形+地狱屋之后(原版 Underworld 29 < Buried Chests 59);
    // 曾在生物群系 pass 里随洞穴箱一起放 → 被后续 hellPass 重写 100% 抹除
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [] : [{ name: '地狱箱', run: underworldChestsPass }]),
    { name: '瓦罐', run: potPass },
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [] : [{ name: '矿骨堆', run: pilesPass }]),
    { name: '表面', run: surfacePass },
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [] : [{ name: '地表装饰', run: vanillaSurfaceDecor }]),
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [] : [{ name: '海滩装饰', run: vanillaBeachDecor }]),
    ...(cfg.structures === false ? [] : [{ name: '结构', run: structurePass }]),
  ];

  for (let i = 0; i < passes.length; i++) {
    onProgress?.(passes[i].name, i / passes.length);
    await nextFrame();
    passes[i].run(ctx, () => {});
    // 部分世界回调（生成期实时预览）：pass 完成即暴露，不等 finalize
    if (cfg.onWorldPartial) cfg.onWorldPartial(world, i, passes[i].name);
  }

  finalize(ctx);
  onProgress?.('完成', 1);
  return world;
}

// ---------- 原版管线 pass(阶段 1-2 移植) ----------
import { newGenState, type GenState } from './vanilla/GenState';
import { runTerrainPass } from './vanilla/TerrainPass';
import { runRocksAndClayPass, runCavesPass } from './vanilla/CavesPass';
import { runOceanSandPass, runBeachesPass, runBeachDecorPass } from './vanilla/BeachPass';
import { runIceBiomePass, runSlushPass } from './vanilla/IceBiomePass';
import { runGrassPass } from './vanilla/GrassPass';
import { runJunglePass } from './vanilla/JunglePass';
import { spreadGrassAll } from './vanilla/Spread';
import { runDesertPass } from './vanilla/DesertPass';
import { runMushroomPass } from './vanilla/MushroomPass';
import { runMarbleGranitePass } from './vanilla/MarbleGranitePass';
import { runDirtToMudAndSiltPass } from './vanilla/DirtToMudPass';
import { runCleanupPass } from './vanilla/CleanupPass';
import { runSmoothWorldPass, runWaterfallLipPass } from './vanilla/HalfBrickPass';
import { runShiniesPass, runGemsPass } from './vanilla/ShiniesPass';
import { runMountCavesPass, runMountainCavesPass } from './vanilla/MountCavesPass';
import { runTreePass, randomizeTreeStyle } from './vanilla/TreePass';
import { runLakesPass } from './vanilla/LakesPass';
import { runTrapsPass } from './vanilla/TrapsPass';
import { runFloatingIslandsPass, runLifeCrystalsPass, runSurfaceDecorPass, runPyramidPass, runWetJunglePass } from './vanilla/StructuresPass';
import { runBeehivePass, runSpiderNestPass, runWebsInSpiderCavesPass, runWebsPass } from './vanilla/HiveSpiderPass';
import { tileRunner } from './vanilla/TileRunner';
import { runDungeonPass } from './vanilla/DungeonPass';
import { runTemplePass } from './vanilla/TemplePass';
import { runIslandHousePass } from './vanilla/IslandHousePass';
import { runHellFortPass } from './vanilla/HellFortPass';
import { runSwordShrinePass } from './vanilla/SwordShrinePass';
import { runBuriedChestsPass, runUnderworldChestsPass, runSurfaceChestsPass, runWaterChestsPass } from './vanilla/BuriedChestsPass';
import { runCorruptionPass } from './vanilla/CorruptionPass';
import { placeDoorClosed } from '../Door';

function vanillaTerrain({ store, rng, world, surface, cfg }: GenCtx) {
  const gs = newGenState(store.w, store.h);
  // Reset pass 掷骰(WorldGen.cs L4780-4880,掷骰顺序 = RNG 契约不可调换)
  // 矿石替代对:Next(2)==0 → 替代矿(内部 id)
  gs.oreTiers = {
    copper: rng.next() < 0.5 ? TILE_BY_KEY['ore_tin']! : TILE_BY_KEY['ore_copper']!,
    iron: rng.next() < 0.5 ? TILE_BY_KEY['ore_lead']! : TILE_BY_KEY['ore_iron']!,
    silver: rng.next() < 0.5 ? TILE_BY_KEY['ore_tungsten']! : TILE_BY_KEY['ore_silver']!,
    gold: rng.next() < 0.5 ? TILE_BY_KEY['ore_platinum']! : TILE_BY_KEY['ore_gold']!,
  };
  gs.crimson = rng.next() < 0.5;
  // RandomizeTreeStyle（原版 Reset L4837：worldID 之后）——树冠样式与边界
  const ts = randomizeTreeStyle(rng, store.w);
  gs.treeX = ts.treeX;
  gs.treeStyle = ts.treeStyle;
  // 邪恶群系覆盖（RNG 契约：骰照掷，仅覆盖结果）
  if (cfg.evil === 0) gs.crimson = false;
  else if (cfg.evil === 1) gs.crimson = true;
  world.crimson = gs.crimson;
  gs.dungeonSide = rng.next() < 0.5 ? -1 : 1;
  // 丛林:与地牢异侧(Next(15,30) 即 15-29)
  const jf = rng.int(15, 29) * 0.01;
  gs.jungleX = Math.floor(store.w * (gs.dungeonSide === -1 ? 1 - jf : jf));
  world.jungleX = gs.jungleX;
  // 地牢 X:拒绝采样直到落在地牢侧 15% 区间
  let dX = rng.int(0, store.w - 1);
  const dLo = store.w * (gs.dungeonSide === 1 ? 0.60 : 0.25);
  const dHi = store.w * (gs.dungeonSide === 1 ? 0.75 : 0.40);
  while (dX < dLo || dX > dHi) dX = rng.int(0, store.w - 1);
  gs.dungeonX = dX;
  // 雪原:以地牢 X 为中心向两侧扩展(L4863-4879)——原版雪原与地牢同侧
  const snowScale = store.w / 4200;
  const snowExtend = () => rng.int(50, 89) + Math.floor(rng.int(20, 39) * snowScale) + Math.floor(rng.int(20, 39) * snowScale);
  gs.snowOriginLeft = Math.max(0, dX - snowExtend());
  gs.snowOriginRight = Math.min(store.w, dX + snowExtend());
  // 海滩宽度(原版固定 300-340+档位加成,按 4200 宽设计;小世界线性缩放保持比例)
  const beachRoll = () => Math.max(20, Math.floor(rng.int(300, 339) * snowScale));
  gs.beachLeftEnd = beachRoll() + (gs.dungeonSide === 1 ? 40 : 20) * (snowScale >= 1 ? 1 : Math.max(0.3, snowScale));
  gs.beachRightStart = store.w - beachRoll() - (gs.dungeonSide === -1 ? 40 : 20) * (snowScale >= 1 ? 1 : Math.max(0.3, snowScale));
  // 地牢入口(L4891-4894):地牢侧海滩内 15% 区间随机
  if (gs.dungeonSide === -1) {
    gs.dungeonLocation = rng.int(gs.beachLeftEnd + 50, Math.floor(store.w * 0.2));
  } else {
    gs.dungeonLocation = rng.int(Math.floor(store.w * 0.8), gs.beachRightStart - 50);
  }
  world.dungeonX = gs.dungeonLocation;
  // Terrain pass
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

function vanillaLakes({ store, rng }: GenCtx) {
  // 原版 pass 31 Lakes + pass 36 Gems（cs 注册序 31<36）
  const gs = ctxGs[0];
  if (!gs) return;
  runLakesPass(store, rng, gs);
  runGemsPass(store, rng, gs);
}

function vanillaShinies({ store, rng }: GenCtx) {
  // 原版 pass 27 Shinies（替换自研 orePass）
  const gs = ctxGs[0];
  if (!gs) return;
  runShiniesPass(store, rng, gs);
}

function vanillaCaves({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runOceanSandPass(store, rng, gs); // 原版 pass 3(顺序上先于泥石/洞穴)
  if (gs) runMountCavesPass(store, rng, gs); // 原版 pass 7 Mount Caves(山丘本体)
  runRocksAndClayPass(store, rng, gs);
  runCavesPass(store, rng, gs);
}

function vanillaBeaches({ store, rng, surface }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runMountainCavesPass(store, rng, gs); // 原版 pass 34 Mountain Caves(山侧开口+蜿蜒,先于海滩)
  runBeachesPass(store, rng, gs);
  // 海盆挖完后刷新 surface[](后续旧 pass 依赖)
  for (let x = 0; x < store.w; x++) {
    for (let y = 0; y < store.h; y++) {
      if (store.flags[store.idx(x, y)]) { surface[x] = y; break; }
    }
  }
}

// 原版 pass 15-22:冰原→草种→丛林→泥转丛林草→沙漠→蘑菇→大理石/花岗岩
function vanillaBiomes({ store, rng, world }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runIceBiomePass(store, rng, gs);       // 15 Generate Ice Biome
  runGrassPass(store, rng, gs);          // 16 Grass
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
  spreadGrassAll(store, TILE_BY_KEY['mud']!, TILE_BY_KEY['v_60_jungle_grass_block']!, world.jungleX, Math.floor(store.w * 0.21)); // 17 Mud Caves To Grass(丛林核心区)
  runDesertPass(store, rng, gs);         // 18 Full Desert
  runFloatingIslandsPass(store, rng, gs); // 19 Floating Islands
  runMushroomPass(store, rng, gs);       // 20 Mushroom Patches
  runMarbleGranitePass(store, rng, gs);  // 21/22 Marble/Granite
  runDirtToMudAndSiltPass(store, rng, gs); // 23 Dirt To Mud / 24 Silt
  runSlushPass(store, gs);                 // 原版 pass 33 Slush（在 DirtToMud/Silt(25/26) 之后——泥已生成）
  runCorruptionPass(store, rng, gs);     // 28 Corruption/Crimson
  runDungeonPass(store, rng, gs, world.chests); // 30 Dungeon(蓝/粉砖主题+走廊房间+宝箱)
  // 地牢 pass 预计算会重掷 dungeonLocation(锚点 ±300 拒绝采样后迁移)——必须在此后
  // 回写最终位置,否则 world.dungeonX 停留在 Reset 期的旧值(与实际地牢偏差可达数百格)。
  // 优先取入口门厅可站立点(原版 dungeonX/Y 语义 cs L72510-72527:入口结构上可站处,
  // 守卫老人出生/游走锚)——塔心锚点会把老人漏进塔内
  world.dungeonX = gs.dungeonEntX || gs.dungeonLocation;
  world.dungeonY = gs.dungeonEntY || gs.dungeonY || 0;
  runPyramidPass(store, rng, gs, world.chests); // 38 Pyramids(沙岩砖金字塔+宝箱)
  runBuriedChestsPass(store, rng, gs, world.chests); // 59 Buried Chests(洞穴金/冰箱/沙箱;地狱箱已拆到地狱箱 pass)
  runSurfaceChestsPass(store, rng, gs, world.chests); // 36 Surface Chests(地表木箱)
  runWaterChestsPass(store, rng, gs, world.chests); // 39 Water Chests(水中 style17)
  runWetJunglePass(store, rng, gs);             // 43 Wet Jungle(丛林湿隧道灌水)
  runBeehivePass(store, rng, gs);               // 45 Hives(丛林蜂巢:蜂巢壳+蜂蜜+腔)
  runWebsPass(store, rng, gs);                  // 58 Webs(全局天花板蛛网 runner 51;原版序:Hives后/SpiderCaves前)
  runSpiderNestPass(store, rng, gs, world.chests); // 63 Spider Caves(countTiles 门+波前BFS刷墙62+蛛网罐/箱/垂网/覆饰)
  runWebsInSpiderCavesPass(store, rng, gs);     // 64 Webs In Spider Caves(墙62 9/10蛛网51)+蜂巢钟乳石/蜂蜜
  runTemplePass(store, rng, gs, world.chests);  // 44 Jungle Temple(之字形房间链+走廊+门+宝箱)
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
    if (!store.inBounds(x, gy) || !TILE_DEFS[store.type[store.idx(x, gy)]]?.solid) { fail++; continue; }
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

// ---------- 地形 ----------
function terrainPass({ store, surface, rng, cfg, noise2D }: GenCtx) {
  const { w, h } = store;
  const base = Math.floor(h * 0.28);
  // 多 octave 地表高度。平坦为主、偶发高峰：
  // 大势噪声幂次塑形（|v|^1.8）——噪声近 0 的大片区域被压平成平原，
  // 只有噪声较强处才隆起成峰；小起伏幅度减半避免处处尖刺
  const o1 = createNoise1Dish(rng, 0.012);
  const o2 = createNoise1Dish(rng, 0.05);
  const o3 = createNoise1Dish(rng, 0.11);
  for (let x = 0; x < w; x++) {
    const hill = (x > w * 0.18 && x < w * 0.82) ? 1 : 1.6; // 边缘更陡（近似海崖）
    const shape = (v: number, amp: number) => Math.sign(v) * Math.pow(Math.abs(v), 1.8) * amp;
    surface[x] = base + (shape(o1(x), 30) + o2(x) * 5 + o3(x) * 2) * hill;
  }
  // 左右海洋：最外侧 6% 下挖成海盆（岸边浅、世界缘深），后续灌水铺沙
  const oceanW = Math.max(24, Math.floor(w * 0.06));
  const seaLevel = base + 4; // 海平面（水表高度）
  for (let x = 0; x < w; x++) {
    const edge = Math.min(x, w - 1 - x);
    if (edge >= oceanW) continue;
    const t = 1 - edge / oceanW; // 0 岸边 → 1 世界缘
    const floorY = base + 2 + t * 16 + Math.sin(x * 0.3) * 1.5;
    surface[x] = Math.max(surface[x], Math.max(seaLevel + 2, floorY));
  }
  const rockLevel = Math.floor(h * 0.33);
  const nBlend = createNoise1Dish(rng, 0.05);
  for (let x = 0; x < w; x++) {
    const sy = Math.floor(surface[x]);
    // 每列岩石线带噪声起伏（±8 格），形成犬牙交错的土石过渡带
    const rl = rockLevel + nBlend(x) * 8;
    for (let y = 0; y < h; y++) {
      if (y < sy) continue;
      let type: number = T.DIRT;
      if (y >= rl) type = T.STONE;
      else if (y > rl - 14) {
        // 过渡带：噪声混入石块夹层
        if (fbm(noise2D, x * 0.09, y * 0.09, 2) > 0.12) type = T.STONE;
      }
      store.setTileSilent(x, y, type);
      // 自然墙：地下土/石区背景
      if (y > sy + 3) store.setWallSilent(x, y, type === T.STONE ? W.STONE : W.DIRT);
    }
  }
  // 海洋灌水 + 沙滩铺沙：海盆内从海平面灌满水；盆底与近岸滩涂表层铺沙
  for (let x = 0; x < w; x++) {
    const edge = Math.min(x, w - 1 - x);
    const sy = Math.floor(surface[x]);
    if (edge < oceanW) {
      for (let y = seaLevel; y < sy; y++) store.setLiquid(x, y, 255, 1);
      for (let y = sy; y < sy + 5 && y < store.h; y++) {
        const t = store.get(x, y);
        if (t === T.DIRT || t === T.GRASS) store.setTileSilent(x, y, T.SAND);
      }
    } else if (edge < oceanW + 8 && surface[x] >= seaLevel - 1) {
      // 近岸滩涂：海平面附近的陆地表面沙化过渡
      for (let y = sy; y < sy + 4 && y < store.h; y++) {
        const t = store.get(x, y);
        if (t === T.DIRT || t === T.GRASS) store.setTileSilent(x, y, T.SAND);
      }
    }
    // 沙漠地下层：海洋区沙层之下换沙岩/硬化沙（5-14 格深处随机夹层）
    if (edge < oceanW) {
      const SANDSTONE = TILE_BY_KEY['sandstone']!, HARDSAND = TILE_BY_KEY['hardened_sand']!;
      for (let y = sy + 5; y < sy + 14 && y < store.h; y++) {
        const t = store.get(x, y);
        if ((t === T.DIRT || t === T.STONE) && rng.next() < 0.45) {
          store.setTileSilent(x, y, y < sy + 9 ? SANDSTONE : HARDSAND);
        }
      }
    }
  }
  // 雪原带：随机一侧的 10%-24% 区间 —— 地表雪化 + 浅层冰夹层（无树：surfacePass 只在草上种树）
  {
    const ICE = TILE_BY_KEY['ice']!;
    const snowLeft = rng.next() < 0.5;
    const xs0 = snowLeft ? Math.floor(w * 0.10) : Math.floor(w * 0.76);
    const xs1 = snowLeft ? Math.floor(w * 0.24) : Math.floor(w * 0.90);
    for (let x = xs0; x <= xs1; x++) {
      const sy = Math.floor(surface[x]);
      for (let y = sy; y < sy + 4 && y < store.h; y++) {
        const t = store.get(x, y);
        if (t === T.GRASS || t === T.DIRT) store.setTileSilent(x, y, T.SNOW);
      }
      for (let y = sy + 4; y < sy + 12 && y < store.h; y++) {
        if (store.get(x, y) === T.DIRT && rng.next() < 0.45) store.setTileSilent(x, y, ICE);
      }
    }
  }
  // 世界最底部 3 行基岩（不可破坏 → 用 STONE 代替，破坏规则由硬度统一处理，简化）
}

// 伪 1D 噪声：借用 2D 噪声 y=0
function createNoise1Dish(rng: RNG, freq: number) {
  const n = createNoise2D(() => rng.next());
  return (x: number) => n(x * freq, 0);
}

// ---------- 洞穴 ----------
function cavePass({ store, surface, noise2D, rng, cfg }: GenCtx) {
  const { w, h } = store;
  // 1) 噪声挖空（海洋列跳过：保护海床，防止海水灌进洞穴系统）
  const caveOceanW = Math.max(24, Math.floor(w * 0.06)) + 2;
  for (let x = 0; x < w; x++) {
    if (Math.min(x, w - 1 - x) < caveOceanW) continue;
    const sy = surface[x];
    for (let y = Math.floor(sy) + 6; y < h - 3; y++) {
      const depth = (y - sy) / (h - sy);
      const threshold = 0.30 - depth * 0.06; // 越深洞越多
      const v = fbm(noise2D, x * 0.028, y * 0.028, 3);
      if (v > threshold) store.setTileSilent(x, y, 0);
    }
  }
  // 2) 蠕虫隧道（连通大洞穴）
  const worms = 16 + Math.floor(rng.range(0, 8));
  for (let i = 0; i < worms; i++) {
    let wx = rng.range(w * 0.08, w * 0.92);
    let wy = rng.range(h * 0.35, h * 0.92);
    let angle = rng.range(0, Math.PI * 2);
    const len = rng.int(60, 200);
    for (let s = 0; s < len; s++) {
      angle += (noise2D(s * 0.05, i * 10) * 0.6 + rng.range(-0.3, 0.3));
      wx += Math.cos(angle) * 1.2;
      wy += Math.sin(angle) * 0.8;
      if (wx < 4 || wx > w - 5 || wy < h * 0.25 || wy > h - 6) break;
      const r = 2.2 + noise2D(s * 0.03, i * 5) * 1.8;
      carveCircle(store, wx, wy, Math.max(1.2, r));
    }
  }
}

function carveCircle(store: GenCtx['store'], cx: number, cy: number, r: number) {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (!store.inBounds(x, y)) continue;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) store.setTileSilent(x, y, 0);
    }
  }
}

function fbm(n2: (x: number, y: number) => number, x: number, y: number, oct: number): number {
  let v = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    v += n2(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5; freq *= 2;
  }
  return v / norm; // -1..1
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
        st.wall[i] = 1;
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
}

/** 地狱专用 runner:超界安全(地狱区常越界) */
function tileRunnerHell(st: World['store'], rng: RNG, gs: GenState, i: number, j: number,
  strength: number, steps: number, type: number, addTile: boolean,
  speedX: number, speedY: number, noYChange: boolean): void {
  tileRunner(st, rng, gs, i, Math.max(2, Math.min(st.h - 3, j)), {
    strength, steps, type, addTile, speedX, speedY, noYChange,
  });
}

// ---------- 浮空方块清理 ----------
// 迭代剥离无支撑的孤立土/石块（下方三格全空且左右也空 → 移除），重复数次处理小簇
function floatCleanupPass({ store, surface }: GenCtx) {
  const st = store;
  for (let iter = 0; iter < 4; iter++) {
    let removed = 0;
    for (let x = 2; x < st.w - 2; x++) {
      const surfY = Math.floor(surface[x]);
      for (let y = surfY + 2; y < st.h - 2; y++) {
        const t = st.get(x, y);
        if (t !== T.DIRT && t !== T.STONE && t !== T.GRASS) continue;
        const below = st.isSolid(x, y + 1) || st.isSolid(x - 1, y + 1) || st.isSolid(x + 1, y + 1);
        const beside = st.isSolid(x - 1, y) || st.isSolid(x + 1, y);
        const above = st.isSolid(x, y - 1);
        if (!below && !beside && !above) {
          st.setTileSilent(x, y, 0);
          removed++;
        }
      }
    }
    if (removed === 0) break;
  }
}

// ---------- 瓦罐散布 ----------
function potPass({ store, surface, rng }: GenCtx) {
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

  const SNOW = TILE_BY_KEY['snow']!, ICE = TILE_BY_KEY['ice']!, THIN_ICE = TILE_BY_KEY['thin_ice']!;
  const JUNGLE = TILE_BY_KEY['v_60_jungle_grass_block']!;
  const CORRUPT = new Set<number>([
    TILE_BY_KEY['v_23_corrupt_grass_block']!, TILE_BY_KEY['v_112_ebonsand_block']!,
    TILE_BY_KEY['v_116_pearlsand_block']!, TILE_BY_KEY['v_163_corrupt_ice_block']!,
  ].filter((v) => v !== undefined));
  const CRIMSON = new Set<number>([
    TILE_BY_KEY['v_199_crimson_grass_block']!, TILE_BY_KEY['v_203_crimstone_block']!,
    TILE_BY_KEY['v_204_crimsand_block']!, TILE_BY_KEY['v_200_crimson_ice_block']!,
  ].filter((v) => v !== undefined));
  const GRANITE = TILE_BY_KEY['v_368_granite_block'] ?? -1; // 368 = 花岗岩块
  const MARBLE = TILE_BY_KEY['v_367_marble_block'] ?? -1;    // 367 = 大理石块(样式由墙 187/216/223 判定,MARBLE 仅保留)
  const LIHZARD = TILE_BY_KEY['v_226_lihzahrd_brick'] ?? -1;
  const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  const MARBLE_WALLS = new Set([187, 216, 223]);

  /** cs:18220-18272 样式选择(按地面 tile / 墙 / 深度) */
  const potStyle = (x: number, y: number, ground: number, wall: number): number => {
    if (ground === SNOW || ground === ICE || ground === THIN_ICE) return rng.int(4, 6);
    if (ground === JUNGLE) return rng.int(7, 9);
    if (DUNGEON_WALLS.has(wall)) return rng.int(10, 12);
    if (CORRUPT.has(ground)) return rng.int(16, 18);
    if (CRIMSON.has(ground)) return rng.int(22, 24);
    if (ground === GRANITE) return rng.int(31, 33);
    if (ground === LIHZARD) return rng.int(28, 30);
    if (MARBLE_WALLS.has(wall)) return rng.int(34, 36);
    if (y > gs.rockLevel && y > h - 260) return rng.int(13, 15); // 地狱(cs: UnderworldLayer)
    return rng.int(0, 3);
  };

  for (let n = 0; n < count; ) {
    const progress = n / count;
    let y0 = rng.int(surfHigh, Math.max(surfHigh + 1, h - 10));
    if (progress > 0.93) y0 = h - 150;          // 尾段强制地狱行(cs:18194)
    else if (progress > 0.75) y0 = surfLow;     // 后 1/4 起地表浅层(cs:18196)
    const x = rng.int(20, w - 20);
    // 向下扫描(cs:18210-18286):遇首个实心后进入候选模式,
    // 在满足"地表以下或背面有墙"的空腔地面放(2×2 净空+双列实心,PlacePot cs:54082)
    let foundSolid = false;
    let fail = true;
    for (let y = y0; y < h - 20 && fail; y++) {
      const t = store.get(x, y);
      if (!foundSolid) {
        if (t !== 0 && TILE_DEFS[t]?.solid && !store.liquid[store.idx(x, y - 1)]) foundSolid = true;
        continue;
      }
      if (y < surfLow && store.wall[store.idx(x, y)] === 0) continue; // cs:18216 地表上方需有墙
      const ground = store.get(x, y + 1);
      if (ground === 0 || !TILE_DEFS[ground]?.solid) continue;
      if (store.liquid[store.idx(x, y)] > 0) continue;
      // PlacePot 2×2 净空 + (x,y+1)(x+1,y+1) 实心 + 半砖/坡面检查(本仓库半砖简化跳过)
      let ok = true;
      for (let dx = 0; dx < 2 && ok; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          if (store.isActive(x + dx, y + dy)) ok = false;
        }
        if (!store.isSolid(x + dx, y + 1)) ok = false;
      }
      if (!ok) continue;
      const style = potStyle(x, y, ground, store.wall[store.idx(x, y)]);
      const variant = rng.int(0, 2) * 36;
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          store.setTileSilent(x + dx, y + dy, POT, dx * 18 + variant, (dy + 1) * 18 + style * 36);
        }
      }
      fail = false;
    }
    n++; // 原版每轮无论成败都推进 num8(10000 次失败预算内重试,这里简化为固定轮数)
  }
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
function placeChest(store: GenCtx['store'], x: number, y: number) {
  // 2×2 宝箱 object（锚点在左上）
  store.setTileSilent(x, y, T.CHEST, 0, 0);
  store.setTileSilent(x + 1, y, T.CHEST, 1, 0);
  store.setTileSilent(x, y + 1, T.CHEST, 0, 1);
  store.setTileSilent(x + 1, y + 1, T.CHEST, 1, 1);
}

function structurePass({ store, surface, rng, world }: GenCtx) {
  const { w, h } = store;
  // 地下小屋数量:对齐原版 CaveHouseCount 35-40 × WorldArea/5040000(Configuration.json
  // ScaleWith:WorldArea)。旧值写死 4 → 小世界即差 10 倍(中/大差更多)
  const hutCount = Math.max(4, Math.round(rng.int(35, 40) * (w * h) / 5040000));
  for (let i = 0; i < hutCount; i++) {
    const hx = rng.int(20, w - 30);
    const hy = rng.int(Math.floor(h * 0.45), h - 40);
    buildHut(store, hx, hy, rng);
    // 小屋中心宝箱（坐在地板上：地板在 hy+6）
    placeChest(store, hx + 4, hy + 4);
    world.chests.push({ x: hx + 4, y: hy + 4, items: Array(10).fill(null) });
  }
  // 地表/浅层散落宝箱
  for (let i = 0; i < 8; i++) {
    const cx = rng.int(10, w - 12);
    // 放在洞穴空地的地上（需要 2×2 空间）
    for (let y = Math.floor(surface[cx]) + 8; y < h - 10; y++) {
      const clear =
        !store.isActive(cx, y) && !store.isActive(cx + 1, y) &&
        !store.isActive(cx, y - 1) && !store.isActive(cx + 1, y - 1) &&
        !store.isActive(cx, y + 1) && !store.isActive(cx + 1, y + 1);
      if (clear && store.isSolid(cx, y + 2) && store.isSolid(cx + 1, y + 2)) {
        placeChest(store, cx, y);
        world.chests.push({ x: cx, y, items: Array(10).fill(null) });
        break;
      }
    }
  }
}

function buildHut(store: GenCtx['store'], hx: number, hy: number, rng: RNG) {
  const rw = 9, rh = 6;
  // 清空内部
  for (let x = hx; x < hx + rw; x++) {
    for (let y = hy; y < hy + rh; y++) {
      store.setTileSilent(x, y, 0);
      store.setWallSilent(x, y, W.WOOD);
    }
  }
  // 地板与墙
  for (let x = hx - 1; x <= hx + rw; x++) {
    store.setTileSilent(x, hy + rh, T.WOOD);
    store.setTileSilent(x, hy - 1, T.WOOD);
  }
  for (let y = hy; y <= hy + rh; y++) {
    store.setTileSilent(hx - 1, y, T.WOOD);
    store.setTileSilent(hx + rw, y, T.WOOD);
  }
  // 门洞（左侧地板上方 3 格）
  for (let y = hy + rh - 3; y < hy + rh; y++) store.setTileSilent(hx - 1, y, 0);
  placeDoorClosed(store, hx - 1, hy + rh - 3, 0);
  // 内部陈设
  store.setTileSilent(hx + 1, hy + rh - 1, T.WORKBENCH, 0, 0);
  store.setTileSilent(hx + 3, hy + rh - 1, T.TORCH, 0, 0);
  if (rng.chance(0.5)) store.setTileSilent(hx + 5, hy + rh - 1, T.FURNACE, 0, 0);
}

// ---------- 收尾：出生点（选最平坦区域并整平） ----------
function finalize({ store, surface, world, cfg, rng }: GenCtx) {
  // 幽灵净化:生成期 TileRunner 会在空气格写残留 type(原版语义,渲染不可见),
  // 但我们的存档格式无 active 位——进入存档前归零(防重读激活成浮空块)
  for (let i = 0; i < store.type.length; i++) {
    if (!store.flags[i] && store.type[i] !== 0) store.type[i] = 0; // 幽灵 type
    if (store.type[i] === 0) store.flags[i] = 0; // 幻影活性(type 0 不可有 flags)
  }
  // ---- 原版 pass 78 Spawn Point（cs:9471-9508）：中心随机扩张采样，自然地表，不改地形 ----
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
    if (store.liquid[store.idx(sx, Math.max(0, sy - 1))] > 0) bad = true;
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
  world.spawnY = Math.max(4, sy - 3);
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
