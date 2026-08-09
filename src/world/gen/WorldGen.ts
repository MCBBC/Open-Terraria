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
      { name: '清理', run: vanillaCleanup },
      { name: '生命水晶', run: vanillaLifeCrystals },
    ] as Pass[] : [
      { name: '地形', run: terrainPass },
      { name: '洞穴', run: cavePass },
    ]),
    { name: '矿石', run: orePass },
    { name: '液体', run: liquidPass },
    ...(useVanillaTerrain ? [
      // 原版 "Smooth World"(L7568)+"Waterfalls"(L7697)：地表凸起与水边唇缘砸半砖
      // （半砖 = 原版水浸润/瀑布触发的核心，见 HalfBrickPass.ts）
      { name: '半砖平滑', run: halfBrickSmoothPass },
      { name: '瀑布唇缘', run: waterfallLipPass },
    ] as Pass[] : []),
    { name: '地狱', run: hellPass },
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [{ name: '清浮空', run: floatCleanupPass }] : []),
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [] : [{ name: '地狱屋', run: vanillaHellHouses }]),
    { name: '瓦罐', run: potPass },
    { name: '表面', run: surfacePass },
    ...((cfg as GenConfig & { lgcTerrain?: boolean }).lgcTerrain === false ? [] : [{ name: '地表装饰', run: vanillaSurfaceDecor }]),
    ...(cfg.structures === false ? [] : [{ name: '结构', run: structurePass }]),
  ];

  for (let i = 0; i < passes.length; i++) {
    onProgress?.(passes[i].name, i / passes.length);
    await nextFrame();
    passes[i].run(ctx, () => {});
  }

  finalize(ctx);
  onProgress?.('完成', 1);
  return world;
}

// ---------- 原版管线 pass(阶段 1-2 移植) ----------
import { newGenState, type GenState } from './vanilla/GenState';
import { runTerrainPass } from './vanilla/TerrainPass';
import { runRocksAndClayPass, runCavesPass } from './vanilla/CavesPass';
import { runOceanSandPass, runBeachesPass } from './vanilla/BeachPass';
import { runIceBiomePass } from './vanilla/IceBiomePass';
import { runGrassPass } from './vanilla/GrassPass';
import { runJunglePass } from './vanilla/JunglePass';
import { spreadGrassAll } from './vanilla/Spread';
import { runDesertPass } from './vanilla/DesertPass';
import { runMushroomPass } from './vanilla/MushroomPass';
import { runMarbleGranitePass } from './vanilla/MarbleGranitePass';
import { runDirtToMudAndSiltPass } from './vanilla/DirtToMudPass';
import { runCleanupPass } from './vanilla/CleanupPass';
import { runSmoothWorldPass, runWaterfallLipPass } from './vanilla/HalfBrickPass';
import { runFloatingIslandsPass, runLifeCrystalsPass, runSurfaceDecorPass, runPyramidPass, runWetJunglePass } from './vanilla/StructuresPass';
import { runBeehivePass, runSpiderNestPass } from './vanilla/HiveSpiderPass';
import { tileRunner } from './vanilla/TileRunner';
import { runDungeonPass } from './vanilla/DungeonPass';
import { runTemplePass } from './vanilla/TemplePass';
import { runIslandHousePass } from './vanilla/IslandHousePass';
import { runHellFortPass } from './vanilla/HellFortPass';
import { runSwordShrinePass } from './vanilla/SwordShrinePass';
import { runCorruptionPass } from './vanilla/CorruptionPass';

function vanillaTerrain({ store, rng, world, surface }: GenCtx) {
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
}

function vanillaCaves({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runOceanSandPass(store, rng, gs); // 原版 pass 3(顺序上先于泥石/洞穴)
  runRocksAndClayPass(store, rng, gs);
  runCavesPass(store, rng, gs);
}

function vanillaBeaches({ store, rng, surface }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
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
  runCorruptionPass(store, rng, gs);     // 28 Corruption/Crimson
  runDungeonPass(store, rng, gs, world.chests); // 30 Dungeon(蓝/粉砖主题+走廊房间+宝箱)
  runPyramidPass(store, rng, gs, world.chests); // 38 Pyramids(沙岩砖金字塔+宝箱)
  runWetJunglePass(store, rng, gs);             // 43 Wet Jungle(丛林湿隧道灌水)
  runBeehivePass(store, rng, gs);               // 45 Hives(丛林蜂巢:蜂巢壳+蜂蜜+腔)
  runSpiderNestPass(store, rng, gs);            // 蜘蛛巢(蛛网+蜘蛛墙腔)
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

// 生物群系感知地表装饰(替代旧 surfacePass 的种树部分)
function vanillaSurfaceDecor({ store, rng }: GenCtx) {
  const gs = ctxGs[0];
  if (!gs) return;
  runSurfaceDecorPass(store, rng, gs);
}

// 原版 pass 与旧 pass 的桥接存储(单次生成生命周期)
const ctxGs: [GenState | null] = [null];

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
  const { w, h } = store;
  const POT = TILE_BY_KEY['pot']!;
  // 尝试次数随世界宽度；洞穴/浅层洞的地面（下方实心、上方 2x2 净空）放 1-3 个一组
  const tries = Math.floor(w / 6);
  for (let i = 0; i < tries; i++) {
    const x = rng.int(4, w - 5);
    const yMin = Math.floor(surface[x]) + 8;
    const yMax = Math.min(h - 6, Math.floor(surface[x]) + Math.floor(h * 0.45));
    if (yMax <= yMin) continue;
    const y = rng.int(yMin, yMax);
    // 2x2 净空 + 底部实心 = 洞内地面
    let ok = true;
    for (let dx = 0; dx < 2 && ok; dx++) {
      for (let dy = 1; dy <= 2; dy++) {
        if (store.isActive(x + dx, y - dy)) { ok = false; break; }
      }
    }
    if (!ok || !store.isSolid(x, y) || !store.isSolid(x + 1, y)) continue;
    // 该点 12 格内有其他瓦罐则跳过（避免扎堆）
    let nearby = false;
    for (let dx = -6; dx <= 6 && !nearby; dx++) {
      for (let dy = -4; dy <= 2; dy++) {
        if (store.get(x + dx, y + dy) === POT) { nearby = true; break; }
      }
    }
    if (nearby) continue;
    // 放 1-3 个（间距 2-3 格，各自需独立净空）
    const n = rng.int(1, 3);
    let px = x;
    for (let k = 0; k < n; k++) {
      if (store.get(px, y - 1) === 0 && store.get(px + 1, y - 1) === 0 &&
          store.get(px, y - 2) === 0 && store.get(px + 1, y - 2) === 0 && store.isSolid(px, y)) {
        store.setTileSilent(px, y - 1, POT, 0, 0);
        store.setTileSilent(px + 1, y - 1, POT, 18, 0);
        store.setTileSilent(px, y - 2, POT, 0, 18);
        store.setTileSilent(px + 1, y - 2, POT, 18, 18);
      }
      px += rng.int(2, 4);
      if (px > w - 4) break;
    }
  }
}

// ---------- 矿石 ----------
function orePass({ store, surface, rng, cfg }: GenCtx) {
  const { w, h } = store;
  // 替代矿对（按种子二选一，同原版每世界固定一种）
  const pair = (a: string, b: string) => TILE_BY_KEY[rng.next() < 0.5 ? a : b]!;
  const ores: Array<{ type: number; depthMin: number; depthMax: number; tries: number; size: [number, number] }> = [
    { type: pair('ore_copper', 'ore_tin'), depthMin: 0.02, depthMax: 0.45, tries: 340, size: [4, 10] },
    { type: pair('ore_iron', 'ore_lead'), depthMin: 0.10, depthMax: 0.62, tries: 300, size: [4, 9] },
    { type: pair('ore_silver', 'ore_tungsten'), depthMin: 0.30, depthMax: 0.85, tries: 220, size: [3, 7] },
    { type: pair('ore_gold', 'ore_platinum'), depthMin: 0.50, depthMax: 1.0, tries: 160, size: [3, 7] },
    // 宝石脉：小而散，全深度零星分布
    ...['gem_sapphire', 'gem_ruby', 'gem_emerald', 'gem_topaz', 'gem_amethyst', 'gem_diamond']
      .map((k) => ({ type: TILE_BY_KEY[k]!, depthMin: 0.15, depthMax: 0.95, tries: 30, size: [3, 6] as [number, number] })),
    // 粘土/淤泥团（浅层大块）
    { type: TILE_BY_KEY['clay']!, depthMin: 0.03, depthMax: 0.3, tries: 60, size: [8, 16] },
    { type: TILE_BY_KEY['silt']!, depthMin: 0.25, depthMax: 0.6, tries: 40, size: [6, 12] },
  ];
  for (const ore of ores) {
    for (let i = 0; i < ore.tries; i++) {
      const x = rng.int(2, w - 3);
      const yMin = Math.floor(surface[x] + 6 + (h - surface[x]) * ore.depthMin);
      const yMax = Math.min(h - 4, Math.floor(surface[x] + 6 + (h - surface[x]) * ore.depthMax));
      if (yMax <= yMin) continue;
      const y = rng.int(yMin, yMax);
      growOreBlob(store, x, y, ore.type, rng.int(ore.size[0], ore.size[1]), rng);
    }
  }
}

function growOreBlob(store: GenCtx['store'], x: number, y: number, type: number, size: number, rng: RNG) {
  let cx = x, cy = y;
  for (let i = 0; i < size; i++) {
    if (store.inBounds(cx, cy)) {
      const t = store.type[store.idx(cx, cy)];
      if (t === T.STONE || t === T.DIRT) store.setTileSilent(cx, cy, type);
    }
    cx += rng.int(-1, 1);
    cy += rng.int(-1, 1);
  }
}

// ---------- 液体 ----------
function liquidPass({ store, surface, rng }: GenCtx) {
  const { w, h } = store;
  // 地表洼地灌水（边缘海洋区已有水，跳过避免重复判定）
  const lakeOceanW = Math.max(24, Math.floor(w * 0.06)) + 6;
  let x = lakeOceanW;
  while (x < w - lakeOceanW) {
    const sy = surface[x];
    // 局部极小值
    if (sy > surface[x - 3] + 2 && sy > surface[x + 3] + 2) {
      const lakeW = rng.int(10, 26);
      // 找洼地范围内的最高岸
      let basinFloor = sy;
      for (let dx = 0; dx < lakeW; dx++) basinFloor = Math.max(basinFloor, surface[Math.min(w - 1, x + dx)]);
      const waterTop = Math.max(sy - 2, basinFloor - rng.int(2, 5));
      for (let dx = 0; dx < lakeW && x + dx < w; dx++) {
        // 逐列只填到该列自己的地表之上（waterTop < y < 该列 surface），
        // 绝不灌进实心地面内部
        const colFloor = surface[x + dx];
        for (let y = Math.floor(waterTop); y < Math.floor(colFloor); y++) {
          if (!store.inBounds(x + dx, y)) continue;
          // 只清非实心内容（杂草等），不动实心块
          const t = store.get(x + dx, y);
          if (t !== 0 && !TILE_DEFS[t]?.solid) store.setTileSilent(x + dx, y, 0);
          if (t === 0 || !TILE_DEFS[t]?.solid) store.setLiquid(x + dx, y, 255, 1);
        }
      }
      x += lakeW + 6;
    } else {
      x++;
    }
  }
  // 地下洞穴低处静水
  for (let i = 0; i < 60; i++) {
    const lx = rng.int(10, w - 10);
    const ly = rng.int(Math.floor(h * 0.5), h - 30);
    const poolW = rng.int(5, 14), poolH = rng.int(2, 4);
    for (let dx = 0; dx < poolW; dx++) {
      for (let dy = 0; dy < poolH; dy++) {
        const px = lx + dx, py = ly + dy;
        if (!store.inBounds(px, py)) continue;
        if (!store.isActive(px, py) && store.isSolid(px, py + 1)) {
          store.setLiquid(px, py, 255, 1);
        }
      }
    }
  }
}

// ---------- 表面 ----------
function surfacePass({ store, surface, rng, world }: GenCtx) {
  const { w } = store;
  for (let x = 0; x < w; x++) {
    const sy = Math.floor(surface[x]);
    if (store.get(x, sy) === T.DIRT) {
      store.setTileSilent(x, sy, T.GRASS);
    }
    // 装饰：草丛/花/蘑菇——放在草块上方空气格（sy 是首个实心行，装饰在 sy-1）
    // 帧为 Tiles_3 表的像素偏移（TEdit frames 数据）：草丛 6 变体 / 花 9 色 / 蘑菇 (144,0)
    if (sy - 1 >= 0 && !store.isActive(x, sy - 1) && store.isSolid(x, sy)) {
      const GRASS_FX = [0, 18, 36, 54, 72, 90];
      const FLOWER_FX = [108, 126, 162, 180, 216, 252, 342, 540, 594];
      const r = rng.next();
      if (r < 0.34) store.setTileSilent(x, sy - 1, T.TALLGRASS, GRASS_FX[Math.floor(rng.next() * GRASS_FX.length) % 6], 0);
      else if (r < 0.48) {
        store.setTileSilent(x, sy - 1, T.FLOWER, FLOWER_FX[Math.floor(rng.next() * FLOWER_FX.length) % 9], 0);
        // 花簇：50% 概率向两侧蔓延 1 格（同簇同帧）
        const fx = store.frameX[store.idx(x, sy - 1)];
        for (const dx of [-1, 1]) {
          if (rng.next() < 0.5 && store.get(x + dx, sy - 1) === 0 && store.isSolid(x + dx, sy)) {
            store.setTileSilent(x + dx, sy - 1, T.FLOWER, fx, 0);
          }
        }
      }
      else if (r < 0.51) store.setTileSilent(x, sy - 1, T.MUSHROOM, 144, 0);
    }
  }
  // 树：正常间距 6-14；连续 24 格无树则放宽条件强制补种，保证顶部林区连续
  let x = rng.int(6, 14);
  let sinceLast = 0;
  while (x < w - 6) {
    const sy = Math.floor(surface[x]);
    const relaxed = sinceLast >= 24;
    // 软装饰（草丛/花/蘑菇/树苗）不挡树：基座格判定忽略，种前清掉
    const isSoft = (t: number) => t === T.TALLGRASS || t === T.FLOWER || t === T.MUSHROOM || t === T.SAPLING;
    // 不种在水里：树干基座格（地面上一格）必须无液体
    if (store.get(x, sy) === T.GRASS && (!store.isActive(x, sy - 1) || isSoft(store.get(x, sy - 1))) && store.liquid[store.idx(x, sy - 1)] === 0) {
      const th = rng.int(7, 14);
      let ok = true;
      for (let dy = 1; dy <= th; dy++) {
        if (store.isActive(x, sy - dy) && !(dy === 1 && isSoft(store.get(x, sy - dy)))) { ok = false; break; }
      }
      // 树冠 80×80 外扩 2 格：要求 ±2 列上方净空、地面实心；放宽时只查本列±1
      const range = relaxed ? 1 : 2;
      for (let dx = -range; dx <= range; dx++) {
        if ((store.isActive(x + dx, sy - 1) && !isSoft(store.get(x + dx, sy - 1))) || !(store.get(x + dx, sy) === T.GRASS || store.isSolid(x + dx, sy))) {
          ok = false; break;
        }
      }
      if (ok) {
        if (isSoft(store.get(x, sy - 1))) store.setTile(x, sy - 1, 0); // 清基座装饰
        // 原版 Tiles_5 22px 网格帧：树顶标记 (22,198) + 树干身 (0,0)
        for (let dy = 1; dy <= th; dy++) {
          store.setTileSilent(x, sy - dy, T.TREE, dy === th ? 22 : 0, dy === th ? 198 : 0);
        }
        // 侧枝：原版标记帧（44=左枝 / 66=右枝，y=198），干高 2..h-3 段两侧各 40%，
        // 每棵上限 2-4 枝（Tree_Branches 贴图由渲染端按标记帧绘制）
        const maxBranches = rng.int(2, 4);
        let branchCount = 0;
        for (let dy = 2; dy <= th - 3 && branchCount < maxBranches; dy++) {
          for (const side of [-1, 1]) {
            if (branchCount >= maxBranches) break;
            if (rng.int(0, 99) >= 40) continue;
            const bx = x + side, by = sy - dy;
            const bt = store.get(bx, by);
            const soft = bt === T.TALLGRASS || bt === T.FLOWER || bt === T.MUSHROOM || bt === T.SAPLING;
            if ((!store.isActive(bx, by) || soft) && store.get(bx, by + 1) !== T.TREE) {
              store.setTileSilent(bx, by, T.TREE, side < 0 ? 44 : 66, 198);
              branchCount++;
            }
          }
        }
        world.registerTree(x, sy - th, th);
        x += rng.int(6, 14);
        sinceLast = 0;
        continue;
      }
    }
    x++;
    sinceLast++;
  }
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
  const hutCount = 4;
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
  store.setTileSilent(hx - 1, hy + rh - 3, T.DOOR_CLOSED, 0, 0);
  // 内部陈设
  store.setTileSilent(hx + 1, hy + rh - 1, T.WORKBENCH, 0, 0);
  store.setTileSilent(hx + 3, hy + rh - 1, T.TORCH, 0, 0);
  if (rng.chance(0.5)) store.setTileSilent(hx + 5, hy + rh - 1, T.FURNACE, 0, 0);
}

// ---------- 收尾：出生点（选最平坦区域并整平） ----------
function finalize({ store, surface, world, cfg }: GenCtx) {
  // 幽灵净化:生成期 TileRunner 会在空气格写残留 type(原版语义,渲染不可见),
  // 但我们的存档格式无 active 位——进入存档前归零(防重读激活成浮空块)
  for (let i = 0; i < store.type.length; i++) {
    if (!store.flags[i] && store.type[i] !== 0) store.type[i] = 0; // 幽灵 type
    if (store.type[i] === 0) store.flags[i] = 0; // 幻影活性(type 0 不可有 flags)
  }
  const cx = Math.floor(store.w / 2);
  // 在中心 ±60 列内找 9 列窗口高度方差最小的位置（平坦出生点，#14）
  let bestX = cx, bestVar = Infinity;
  for (let d = -60; d <= 60; d += 3) {
    const x0 = cx + d - 4;
    if (x0 < 4 || x0 + 8 > store.w - 5) continue;
    const hs: number[] = [];
    for (let k = 0; k < 9; k++) hs.push(surface[x0 + k]);
    const avg = hs.reduce((a, b) => a + b, 0) / 9;
    const v = hs.reduce((a, b) => a + (b - avg) ** 2, 0);
    if (v < bestVar) { bestVar = v; bestX = x0 + 4; }
  }
  const sx = bestX;
  const flatY = Math.round(surface.slice(sx - 4, sx + 5).reduce((a, b) => a + b, 0) / 9);
  // 整平：±5 列统一到 flatY（填/挖），草皮封顶，上方 5 格清空，清除区内树木（防浮空树）
  for (let dx = -5; dx <= 5; dx++) {
    const x = sx + dx;
    for (let y = 0; y < store.h; y++) {
      const syF = flatY;
      if (y < syF) {
        if (store.isActive(x, y)) store.setTileSilent(x, y, 0);
        store.setLiquid(x, y, 0, 0);
      } else if (y === syF) {
        store.setTileSilent(x, y, T.GRASS);
        store.setLiquid(x, y, 0, 0);
      } else if (y > syF && y < flatY + 20 && !store.isActive(x, y)) {
        store.setTileSilent(x, y, T.DIRT);
      }
    }
    surface[x] = flatY;
  }
  const sy = flatY;
  world.spawnX = sx;
  world.spawnY = Math.max(4, sy - 3);
  // 原版管线的地表/岩石线来自 TerrainPass 输出,旧 fbm 常数仅作回退
  const gs = ctxGs[0];
  if (gs) {
    world.groundLevel = gs.worldSurface;
    world.rockLevel = gs.rockLevel;
  } else {
    world.groundLevel = Math.floor(store.h * 0.28);
    world.rockLevel = Math.floor(store.h * 0.33);
  }
  // 原版树样式：4 等分横向区，全部森林样式 0
  world.treeX = [Math.floor(store.w / 4), Math.floor(store.w / 2), Math.floor(store.w * 3 / 4)];
  world.treeStyle = [0, 0, 0, 0];
  // 出生点上空净空
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = 1; dy <= 5; dy++) {
      if (store.isActive(sx + dx, sy - dy)) {
        const t = store.get(sx + dx, sy - dy);
        if (t !== T.GRASS) store.setTileSilent(sx + dx, sy - dy, 0);
      }
    }
  }
  // 清除整平区内登记的树（防幽灵树）
  world.trees = world.trees.filter((t) => Math.abs(t.x - sx) > 5);
}
