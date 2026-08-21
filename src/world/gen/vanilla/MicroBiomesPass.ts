// 原版 pass "Micro Biomes"(WorldGen.cs:21785)1:1 移植。注册序掷骰顺序严格:
//   1. DeadMansChest(cs:21801-21819 + Terraria.GameContent.Biomes/DeadMansChestBiome.cs):
//      死亡之箱陷阱屋——金箱(21 style1)改死亡之箱(467)+ 飞镖陷阱 137/巨石陷阱 138/
//      炸药桶 141 + 红线网。候选=GetPossibleChestsToTrapify(每候选 4 掷)→
//      DeadManChests 10-20 ×WorldWidth。
//   2. ThinIce(cs:21825-21854 + ThinIceBiome.cs):雪原水面上薄冰斑 162——
//      50×50 扫描门禁(雪>泥 且 雪>泥+石,无蜂巢)→ Circle 半径 14→6 递减 + Blotches(4)。
//      数量 ThinIcePatchCount 3-5 ×WorldWidth。
//   2.5 EnchantedSword(cs:21858-21908 + EnchantedSwordBiome.cs):附魔剑圣地——
//      Slime(20,0.8-1.3) 水潭洞穴 + Mound(14,14) 中央土丘 + InnerOutline 铺草 +
//      花墙 68 + 藤蔓 382 + 1/3 竖井(Blotches(2,0.2)+沙硬化 397)+ 土丘剑。
//      重试 while(num15++ <= maxTilesX),掷序 Y→Next(2)→X;洞穴中心在 origin.Y+20。
//      数量 SwordShrineAttempts 1-2 ×WorldWidth,放置概率 0.5(cs:21886 取反门)。
//   3. CampsiteBiome(cs:21915-21936 + CampsiteBiome.cs):
//      露营地标——Slime 形状(num=Next(6,10))拍平的硬化沙/土墙平台 + 金币堆帐篷 +
//      倒木 186 + 未点燃篝火 215。墙类型按地表材质(沙漠→171/冰雪→40/丛林→204-207/
//      大理石→178/花岗岩→180,默认泥土 196-199)。位置 RandomWorldPoint(worldSurface,
//      beachDistance, 200, beachDistance)。数量 CampsiteCount 6-11 × WorldArea。
//   4. MiningExplosivesBiome(cs:21951-21975 + MiningExplosivesBiome.cs):
//      炸药陷阱屋——ShapeRunner(10,20,dir) 矿石地板 + Circle(5) 房间 + 炸药桶 141 +
//      起爆器 411 + 红线直连。位置 RandomWorldPoint(rockLayer, beachDistance, 200,
//      beachDistance)。数量 ExplosiveTrapCount 14-29 × WorldArea。
//   5. Mahogany 丛林活桃花心木树(cs:22052-22077 + MahoganyTreeBiome.cs):
//      LivingTreeCount 6-11 ×WorldWidth 棵——五段干身 383 + 中心井墙 78 + 冠枝
//      (ShapeBranch)+叶球 384(Circle(4)+Blotches(4,2))+四根(ShapeRoot)+
//      常春藤箱(style10)。★2026-08-17 前整段缺失 = 尾部全部子群系掷流漂移。
//   6. TrackGenerator(cs:22014-22091,实现见 TrackPass.ts):长/标准矿轨 314。
//   7. placeLavaTrap(cs:22093-22127 调用 + :8648 实现):地狱熔岩陷阱——
//      岩浆湖底致动石栅 + 压板 135 style7 + 红线。w*0.02 次 × 10150 尝试。
// 已知偏差(注明):
//  - DeadMans 候选序 = chest sink(world.chests)创建序——与 Main.chest 槽位序一致
//    的前提是全管线宝箱按原版注册序入 sink(2026-08-17 由栅格扫描归正;上游 pass
//    债务期个别箱位/缺箱仍会错位,见 docs 尾批 2-A 备案)
//  - Main.tileDungeon 用 dungeon 砖 tile 近似(41/43/44),容器用 chest 族 key 近似
//  - ★XXXX 剑冢 ShapeData 枚举序裁决（撤销旧"不可移植"豁免）：.NET HashSet<T>
//    枚举序=槽分配序（Enumerator 线性扫 _slots[0..count] 跳死槽），Add-only 序列
//    ≡插入序；ShapeData.Subtract 只 Remove 不重插（EnchantedSwordBiome.cs:91 后
//    无 Add）⇒ 枚举序=幸存者插入序 ≡ JS Set 语义。ShrineShape（Set+delete 保序）
//    逐位等价，无需表驱动。实证：全样本流（int+d+n）对拍金标种子剑段两侧零分叉
//    （9293480 剑冢被 0.5 放置门跳过——旧"34.5k 剑冢 HashSet 掷"归因证伪，真源=
//    营地/矿爆 PlaceWall/SetFrames 帧掷族+inActive 旗标混用+薄冰误保护（本批修）
//    +矿轨 WorldUtils.TileFrame 帧链（TrackPass 域，备案移交））。
//  - TurnGoldChestIntoDeadMansChest 的 1/3 战利品前插(Item 5007)无 chest sink,掷骰保留、
//    写入跳过
import { TileStore, LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { addProtectedStructure, canPlaceStructure } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { NOT_CLEARABLE, idsByVanillaSheet } from './TileRunner';
import { TrackGenerator } from './TrackPass';
import { vanGenSolidType } from './GenSolid';
import { genTileFrame, genFrameNeighbors, genSquareTileFrame } from './FinalCleanupPass';   // UUUU：ActuallyPlace*/SetTile(setSelfFrames) 的 TileFrame(resetFrame:true) 镜像

/** Main.wallLargeFrames 非零墙（Main.cs:9653-9787；余皆 0）——Framing.WallFrame
 *  resetFrame=true 掷门用（UUUU：Mahogany PlaceWall(78) 的 SquareWallFrame×5 每格
 *  1×Next(0,3)，wall==21 再 1×Next(2)——掷侧镜像，帧写（wallFrameNumber）备案） */
const WALL_LARGE_FRAMES_MB = new Set([224, 323, 324, 325, 326, 327, 328, 329, 330, 185,
  274, 355, 358, 359, 362, 363, 366, 179, 146, 147, 167, 354]);
function wallFrameRollMB(st: TileStore, rng: RNG, x: number, y: number): void {
  if (x <= 0 || y <= 0 || x >= st.w - 1 || y >= st.h - 1) return;
  const wl = st.wall[st.idx(x, y)]!;
  if (wl === 0 || WALL_LARGE_FRAMES_MB.has(wl)) return;
  rng.nextInt(3);
  if (wl === 21) rng.nextInt(2);
}
/** WorldGen.SquareWallFrame 掷侧（九宫仅中心 resetFrame=true → 至多 1 掷）；
 *  PlaceWall.Apply = 中心 + 四邻五连 SquareWallFrame（cs:516-531） */
function placeWallFrameRollsMB(st: TileStore, rng: RNG, x: number, y: number): void {
  wallFrameRollMB(st, rng, x, y);
  wallFrameRollMB(st, rng, x + 1, y);
  wallFrameRollMB(st, rng, x - 1, y);
  wallFrameRollMB(st, rng, x, y - 1);
  wallFrameRollMB(st, rng, x, y + 1);
}
import { placeBuriedChest, nextJungleItem, type ChestSink } from './BuriedChestsPass';
import { GENERAL_PLACEMENT_FORBID } from './GenState';

const SAND = TILE_BY_KEY['sand']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const FOSSIL = TILE_BY_KEY['desert_fossil']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;
const HARDSAND_TILE = TILE_BY_KEY['hardened_sand']!; // 原版 SetTile(397)
const COIN_PILE = TILE_BY_KEY['v_332_gold_coin_pile']!;
const LARGE_PILES = TILE_BY_KEY['v_186_decos_3x2']!;
/** tile 488 倒木——PlaceTile 头生成期早退门（cs:59369，KKKKK 帐篷镜像） */
const FALLEN_LOG_TILE = TILE_BY_KEY['v_488_fallen_log']!;
/** tile 187(Decos 3x2 Group 2)——剑冢真剑 style17(EnchantedSwordBiome.cs:92) */
const DECOS_GROUP2 = TILE_BY_KEY['v_187_decos_3x2_group_2']!;
const CAMPFIRE = TILE_BY_KEY['v_215_campfires']!;
const EXPLOSIVES = TILE_BY_KEY['v_141_explosives']!;
const DETONATOR = TILE_BY_KEY['v_411_detonator']!;
const STONE = TILE_BY_KEY['stone']!;
const DUNGEON_BLUE = TILE_BY_KEY['v_41_blue_brick']!;
const DUNGEON_GREEN = TILE_BY_KEY['v_43_green_brick']!;
const DUNGEON_PINK = TILE_BY_KEY['v_44_pink_brick']!;
const LIHARD = TILE_BY_KEY['v_226_lihzahrd_brick']!;
const LIHARD_ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;
const WIRE_RED = TileStore.WIRE_RED;
const WIRE_ACTUATOR = TileStore.WIRE_ACTUATOR;
// ---- 新增四子项 tile ----
const CHEST = TILE_BY_KEY['chest']!;                       // 21(金箱 style 1 帧 36)
const CHEST2 = TILE_BY_KEY['v_467_chests_group_2']!;       // 467(死亡之箱帧 144)
const DART_TRAP = TILE_BY_KEY['v_137_traps']!;
const BOULDER = TILE_BY_KEY['v_138_boulder']!;
const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;                 // 162 BreakableIce
const DIRT = TILE_BY_KEY['dirt']!;
const MUD = TILE_BY_KEY['mud']!;
const SNOW_BLOCK = TILE_BY_KEY['snow']!;                   // 147
const HIVE = TILE_BY_KEY['v_225_hive_block']!;
// ---- 剑冢(EnchantedSwordBiome)专用 tile ----
const GRASS = TILE_BY_KEY['grass']!;                       // 2(InnerOutline 铺草)
const SHORT_PLANTS = TILE_BY_KEY['v_3_forest_short_plants']!;   // ActionGrass SelectRandom{3,73}
const TALL_PLANTS = TILE_BY_KEY['v_73_forest_tall_plants']!;
const FLOWER_VINES = TILE_BY_KEY['v_382_flower_vines']!;   // ActionVines(3,5,382)
/** ★BBBBBB：PlaceTile(3) 的 IsFitToPlaceFlowerIn 地面族（cs:58254，typeAttempted=3） */
const PLANT_GROUND_3 = idsByVanillaSheet(2, 78, 380, 477, 579);
/** ★BBBBBB：WallID.Sets.AllowsPlantsToGrow（WallID.cs:58，27 项——TreePass 同表） */
const PLANT_WALLS = new Set<number>([
  0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80,
]);
/** ★BBBBBB：PlaceTile(3) 墙支 NextFromList(6,7,9..20)（cs:59582-95——14 项） */
const GRASS_STYLE_LIST = [6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
/** Modifiers.SkipTiles(191,192):竖井挖穿活木/活木叶(EnchantedSwordBiome.cs:90) */
const SHAFT_SKIP = idsByVanillaSheet(191, 192);
/** ThinIceBiome.OnlyTiles(147,161,224,0,1):雪/冰/细雪/泥/石 → 162 */
const ICE_SRC = idsByVanillaSheet(147, 161, 224, 0, 1);
/** ThinIceBiome.SkipTiles(21,467,226,237) */
const ICE_SKIP = idsByVanillaSheet(21, 467, 226, 237);
/** TileID.Sets.Boulders(TileID.cs:195) */
const BOULDER_TILES = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
/** Main.tileDungeon(Main.cs:7941-7944) */
const DUNGEON_TILES = idsByVanillaSheet(41, 43, 44, 677);
/** DeadMansChestBiome 第三区禁置(12/665/639,DeadMansChestBiome.cs:275) */
const BOULDER_FORBID = idsByVanillaSheet(12, 665, 639);

const solidAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0 && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;
/** Main.tileSolidTop 近似:platform 族(生成期主要消费点是平台/桌类单向面) */
const solidTopAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && !!TILE_DEFS[st.type[st.idx(x, y)]]?.platform;
const activeAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
/** TileID.Sets.IsAContainer(TileID.cs:405)={21,467,88}——精确 sheet 集
 *  (曾用 key 含 'chest'/'dresser' 子串近似,异 key 边界不可证) */
const CONTAINER_TILES = idsByVanillaSheet(21, 467, 88);
const isContainer = (t: number): boolean => CONTAINER_TILES.has(t);
/** Conditions.IsSolid(Conditions.cs:85-97):InWorld(x,y,10) && active && 生成期 tileSolid
 *  ——无 solidTop/half/slope/inActive 排除(与 SolidTile/SolidOrSlopedTile 三者互异) */
const condIsSolid = (st: TileStore, x: number, y: number): boolean => {
  if (x < 10 || y < 10 || x >= st.w - 10 || y >= st.h - 10) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && vanGenSolidType(st.type[i]!);
};
/** WorldGen.SolidOrSlopedTile(cs:70046):active && 生成期 tileSolid && !tileSolidTop
 *  && !inActive()（half/slope 不排除）。Modifiers.IsSolid(Modifiers.cs:551)消费。
 *  ★XXXX：!inActive() 读 bit 0x40（生成期恒假）——致动旗标(0x800)不是排除项，
 *  曾 `!(wire & WIRE_ACTUATOR)` 误排致动格（ShapeRunner 固体占比门错翻案） */
const solidOrSlopedAt = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && vanGenSolidType(st.type[i]!) && !TILE_DEFS[st.type[i]!]?.platform;
};
/** 原版 SolidTile(i,j)(WorldGen.cs:70155-70172):active && 生成期 tileSolid && !tileSolidTop
 *  && !halfBrick && slope==0 && !inActive()。countTiles(nextCount cs:9559)/MiningExplosives
 *  首门(cs:13)消费。
 *  ★XXXX 定谳：Tile.inActive()（bit 0x40）与 Tile.actuator()（bit 0x800）是**两个
 *  独立旗标**（Tile.cs:636/721）——巨石/岩浆陷阱写的是 actuator()，inActive() 在
 *  生成期无任何置位点（WorldGen.cs 全量 grep 零 inActive(true)）⇒ SolidTile 的
 *  !inActive() 生成期恒真。曾把致动位当 inActive 排除 → 致动石格被误判非实心
 *  （MiningExplosives 首门错收 (2430,920) 案，ST 探针 inact=False 实证）。 */
function solidTileStrict(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !TILE_DEFS[t]?.platform
    && st.half[i] === 0 && st.slope[i] === 0;
}

interface Rect { x0: number; y0: number; x1: number; y1: number }

/** Main.tileTable（Main.cs:6828-6903 全量 76 id）——Place2x2 地面门右腿（cs:51396） */
const PLACE2X2_TABLE = idsByVanillaSheet(
  280, 275, 276, 277, 278, 279, 281, 605, 604, 603, 602, 601, 599, 600, 612, 611, 610, 609,
  608, 606, 607, 558, 554, 553, 551, 550, 542, 413, 309, 297, 296, 645, 643, 644, 632, 640,
  559, 414, 359, 358, 285, 286, 582, 555, 538, 533, 532, 394, 393, 392, 391, 339, 310, 299,
  298, 629, 619, 556, 544, 364, 363, 362, 361, 710, 376, 380, 14, 469, 18, 19, 114, 101, 87,
  88, 405, 427,
);
/** WorldGen.Place2x2（cs:51352-51445；PlaceTile num∈2×2 族消费——DeadMansChest 巨石
 *  138(cs:607)/矿爆起爆器 411(cs:59766-59769)）。**右下锚**：cs:51431 x--/y-- 后写
 *  (x-1..x)×(y-1..y)，帧 (k*18, m*18)；前置双门（cs:51371-51405）逐列 i∈{x-1,x}：
 *  ①2×2 区两格任一 active → 整写放弃；②地面 (i,y+1)：!nactive ||（!SolidTile2
 *  （cs:70178）&& !Main.tileTable）→ 放弃。全程零掷（门的读与写都不耗 RNG）。 */
function place2x2Direct(st: TileStore, x: number, y: number, type: number): boolean {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;            // cs:51358
  for (let i = x - 1; i <= x; i++) {
    for (let j = y - 1; j <= y; j++) {
      if (st.flags[st.idx(i, j)]) return false;                                // cs:51376 空置门
    }
    const gi = st.idx(i, y + 1);
    const gt = st.type[gi]!;
    const solid2 = st.flags[gi] !== 0 && vanGenSolidType(gt)
      && st.slope[gi] === 0 && st.half[gi] === 0;                              // SolidTile2（inActive 生成期恒真）
    if (!st.flags[gi] || (!solid2 && !PLACE2X2_TABLE.has(gt))) return false;   // cs:51395-99 地面门
  }
  for (let k = x - 1; k <= x; k++) {
    for (let l = y - 1; l <= y; l++) {
      st.setTileSilent(k, l, type, (k - x + 1) * 18, (l - y + 1) * 18);        // cs:51434-43
    }
  }
  return true;
}

/** 诊断段钩子(CCCC 批):SW_CCCC 探针消费,零开销可选调用 */
const segProbe = (name: string, detail?: unknown): void => {
  const g = globalThis as { __swSeg?: (name: string, detail?: unknown) => void };
  try { g.__swSeg?.(name, detail); } catch { /* probe */ }
};

export function runMicroBiomesPass(st: TileStore, rng: RNG, gs: GenState, chests?: ChestSink): void {
  const g0 = globalThis as { __swMbCap?: (gs: GenState, st: TileStore, chests?: ChestSink) => void };
  try { g0.__swMbCap?.(gs, st, chests); } catch { /* probe */ }
  segProbe('passStart');
  // Skyblock.denyAllGeneration 包裹整个 pass(cs:21787)——1.4.5.6 skyblock 种子全段跳过
  if (gs.seedFlags.skyblock) return;
  const { w, h } = st;
  // ★结构互斥走全局 StructureMap（GenState.protectedRects）：原本 pass 局部
  //   protectedRects 近似（文件头备案的"无全局 StructureMap"已由 GenState 落地）,
  //   提升后与蜂巢主巢/蜂蜜斑/神龛/微光/地下小屋等全部已保护结构跨结构互斥。
  //   各微群系的 pad 对齐原版：剑冢 10（EnchantedSwordBiome.cs:110）/ 野营地 4
  //   （CampsiteBiome.cs:114）/ 矿爆点 5（MiningExplosivesBiome.cs:74）/ 薄冰 0
  //   （ThinIceBiome.cs:32,原版为 AddStructure 非保护,见 placeThinIcePatch 注）。
  // WorldGenRange ScalingMode(WorldGenRange.cs:43-58):
  //   WorldArea = w*h/5040000;WorldWidth = w/4200;ScaleValue=(int)截断
  const areaScale = (w * h) / 5040000;
  const widthScale = w / 4200;
  const scW = (v: number): number => Math.trunc(widthScale * v);

  // ---- 1. Dead Man's Chests(cs:21801-21919 段 21801-21819)----
  {
    const deadMans = new DeadMansChestBiome(st, rng, gs, chests ?? []);
    // GetPossibleChestsToTrapify 先于计数掷骰(cs:21806-21807)——每候选 4 掷
    const possible = deadMans.getPossibleChests();
    segProbe('deadCands', possible.map(p => [p.x, p.y]));
    const deadCount = rng.int(scW(10), scW(20));   // DeadManChests 10-20 ×WorldWidth
    segProbe('deadCount', deadCount);
    let done = 0;
    let guard = 3000;                              // num4
    while (done < deadCount && possible.length > 0) {
      if (--guard <= 0) break;
      const pick = rng.int(0, possible.length - 1);
      const c = possible[pick];
      const ok = deadMans.place(c.x, c.y);          // 返回值原版丢弃(cs:21814)
      segProbe('deadPlace', [c.x, c.y, ok]);
      done++;
      possible.splice(pick, 1);
    }
  }

  // ---- 2. Thin Ice(cs:21825-21854)----
  if (!gs.seedFlags.notTheBees || gs.seedFlags.remix) {
    const iceCount = rng.int(scW(3), scW(5));      // ThinIcePatchCount 3-5 ×WorldWidth
    segProbe('iceCount', iceCount);
    let iceDone = 0, iceFail = 0;
    const iceFailLimit = 1000;                     // num9
    while (iceDone < iceCount) {
      // RandomWorldPoint(worldSurface+20, 50, 200, 50)(cs:21836)
      const ox = rng.int(50, w - 51);
      const oy = rng.int(Math.floor(gs.worldSurface) + 20, h - 201);
      segProbe('iceTry', [ox, oy]);
      if (placeThinIcePatch(st, rng, gs, ox, oy)) {
        iceDone++;
        iceFail = 0;
      } else {
        iceFail++;
        if (iceFail > iceFailLimit) { iceDone++; iceFail = 0; }   // cs:21848-21852 强制推进
      }
    }
  }

  // ---- 2.5 Enchanted Sword Shrines(cs:21858-21908 + EnchantedSwordBiome.cs)----
  // ★原版在 MicroBiomes pass 内、ThinIce 与 Campsite 之间注册(cs:21858-21908)——
  //   曾拆在独立 SwordShrinePass(结构槽,微群系之前执行)= 管线错位 + 逻辑近似
  //   (洞穴中心放种子点上方 10-20 格,原版是 origin.Y+20 **下方**)。2026-08-13 归位重写。
  //   SecretSeed.Variations.noSurfaceNoSwordShrines 门(cs:21858)无对应变体,恒启用
  //   (普通世界行为一致);errorWorld 分支(cs:21879-21882/21890)未建模。
  {
    const swordAttempts = rng.int(scW(1), scW(2));   // SwordShrineAttempts 1-2 ×WorldWidth
    segProbe('swordAttempts', swordAttempts);
    for (let i = 0; i < swordAttempts; i++) {
      // !(NextDouble < SwordShrinePlacementChance 0.5) 才放置(cs:21886)——注意极性
      if (!(rng.next() < 0.5)) {
        // 重试 while (num15++ <= maxTilesX)(cs:21888):最多 w+1 次,掷序 Y→Next(2)→X
        // ★BBBBBB：cs:21888 `origin3.Y = (int)GenVars.worldSurface + Next(50,100)`——
        //   是 GenVars.worldSurface(Terrain 游走终值)非 Main.worldSurface！曾混用
        //   gs.worldSurface(=Main.worldSurface)→ Y 域整体偏移(22222 实测差 71 格)，
        //   剑冢 12/12 全拒 vs JS 过门多掷 → 掷流自 sword 段分叉 → 尾段全错位。
        //   同款 GenVars 混淆 XXXXX 批已修矿爆点 rockLayer，此处为漏网点。
        for (let t = 0; t <= w; t++) {
          const oy = Math.floor(gs.genWorldSurface) + rng.int(50, 99);   // Next(50, 100)
          const ox = rng.int(0, 1) === 0                               // Next(2) == 0 → 左 30%
            ? rng.int(50, Math.floor(w * 0.3) - 1)                     // Next(50, w*0.3)
            : rng.int(Math.floor(w * 0.7), w - 51);                    // Next(w*0.7, w-50)
          segProbe('swordTry', [ox, oy]);
          if (placeEnchantedSwordShrine(st, rng, gs, ox, oy)) { segProbe('swordOk', [ox, oy]); break; }
        }
      }
    }
  }

  // ---- 3. Campsites(cs:21915-21936,最多 1000 次尝试;cs:21914 notTheBees 门)----
  const campOk = !gs.seedFlags.notTheBees || gs.seedFlags.remix;
  const campCount = campOk
    ? rng.int(Math.max(1, Math.trunc(areaScale * 6)), Math.max(1, Math.trunc(areaScale * 11)))
    : 0;
  let placed = 0, tries = 0;
  segProbe('campCount', campCount);
  while (placed < campCount) {
    if (++tries > 1000) break;
    const ox = rng.int(gs.beachDistance, w - gs.beachDistance - 1); // RandomWorldPoint(top,right,bottom,left)
    const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
    segProbe('campTry', [ox, oy]);
    if (placeCampsite(st, rng, gs, ox, oy)) placed++;
  }

  // ---- 4. Mining Explosives(cs:21951-21975,最多 3000 次尝试;cs:21956 notTheBees 门)----
  const trapOk = campOk;
  let trapCount = trapOk
    ? rng.int(Math.max(1, Math.trunc(areaScale * 14)), Math.max(1, Math.trunc(areaScale * 29)))
    : 0;
  if (trapOk && (gs.seedFlags.getGoodWorld || gs.seedFlags.noTraps) && !gs.seedFlags.notTheBees) {
    trapCount = Math.trunc(trapCount * 1.5);       // cs:21958-21961
  }
  placed = 0; tries = 0;
  segProbe('trapCount', trapCount);
  while (placed < trapCount) {
    if (++tries > 3000) break;
    const ox = rng.int(gs.beachDistance, w - gs.beachDistance - 1);
    // XXXX：cs:21964 top2=(int)GenVars.rockLayer —— GenVars.rockLayer 是独立字段
    //   （TerrainPass.cs:232 = 游走值 num4，≠ Main.rockLayer :211-213 的 571）。
    //   曾误用 gs.rockLevel（=Main.rockLayer）→ 矿爆点 Y 域整体偏移 48 格（span
    //   对拍 van Next(523,1000) vs js Next(571,1000) 定罪）
    const oy = rng.int(Math.floor(gs.genRockLayer), h - 201);
    segProbe('trapTry', [ox, oy]);
    if (placeMiningExplosives(st, rng, gs, ox, oy)) placed++;
  }

  // ---- 4.5 Mahogany 丛林活桃花心木树(cs:22052-22077 + MahoganyTreeBiome.cs)----
  // ★2026-08-17 前整段缺失:原版在 MiningExplosives 与 TrackGenerator 之间,
  //   LivingTreeCount 6-11 ×WorldWidth 棵(尝试上限 20000)——缺失 = 尾部全部
  //   子群系(矿轨/岩浆陷阱)及 @101 摆放整体掷流漂移(尾批 2-A 实锤 -43,845 掷)。
  {
    const treeCount = rng.int(scW(6), scW(11));   // LivingTreeCount 6-11 ×WorldWidth
    segProbe('treeCount', treeCount);
    let mDone = 0, mTries = 0;
    while (mDone < treeCount && mTries < 20000) {
      // RandomWorldPoint(worldSurface+50, 50, 500, 50):X=Next(50,W-50), Y=Next(ws+50,H-500)
      const ox = rng.int(50, w - 51);
      const oy = rng.int(Math.floor(gs.worldSurface) + 50, h - 501);
      segProbe('treeTry', [ox, oy]);
      if (placeMahoganyTree(st, rng, gs, chests, ox, oy)) mDone++;
      mTries++;
    }
  }

  // ---- 5. TrackGenerator(cs:22014-22091)----
  const trackGen = new TrackGenerator(st, gs, chests);
  const trackFailLimit = Math.floor(w / 2);        // num25
  // 长轨:LongTrackCount 1-2 ×WorldWidth,长 400-1000 ×WorldWidth
  let trackCount = rng.int(scW(1), scW(2));
  segProbe('longTrackCount', trackCount);
  let tDone = 0, tFail = 0;
  while (tDone < trackCount) {
    const ox = rng.int(10, w - 11);                // RandomWorldPoint(worldSurface, 10, 200, 10)
    const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
    if (trackGen.place(ox, oy, scW(400), scW(1000), rng)) {
      segProbe('longTrackOk', [ox, oy]);
      tDone++; tFail = 0;
    } else {
      tFail++;
      if (tFail > trackFailLimit) { tDone++; tFail = 0; }
    }
  }
  // 标准轨:StandardTrackCount 4-7 ×WorldArea,长 150-300 ×WorldWidth
  trackCount = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
  segProbe('stdTrackCount', trackCount);
  tDone = 0; tFail = 0;
  while (tDone < trackCount) {
    const ox = rng.int(10, w - 11);
    const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
    if (trackGen.place(ox, oy, scW(150), scW(300), rng)) {
      segProbe('stdTrackOk', [ox, oy]);
      tDone++; tFail = 0;
    } else {
      tFail++;
      if (tFail > trackFailLimit) { tDone++; tFail = 0; }
    }
  }

  // ---- 6. placeLavaTrap(cs:22093-22127):w*0.02 次 × 10150 尝试 ----
  if (!gs.seedFlags.notTheBees) {
    const lavaTries = w * 0.02;                    // num31(裸 double 比较,不取整)
    for (let j = 0; j < lavaTries; j++) {
      for (let k = 0; k < 10150; k++) {
        const x = rng.int(200, w - 201);
        const y = rng.int(gs.lavaLine - 100, h - 211);   // Next(lavaLine-100, h-210)
        if (placeLavaTrap(st, gs, x, y, rng)) { segProbe('lavaOk', [x, y]); break; }
      }
    }
  }
  segProbe('passEnd');
}

/** CampsiteBiome.Place(CampsiteBiome.cs:9-116) */
function placeCampsite(st: TileStore, rng: RNG, gs: GenState, ox: number, oy: number): boolean {
  // Circle(10):实心占比门禁(solid ≥ total-5,cs:12-17)
  //   Scanner→Modifiers.IsSolid = active && SolidOrSlopedTile(半砖/坡面算实心)
  {
    let total = 0, solid = 0;
    const r = 10, rr = (r + 1) * (r + 1);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.min(r, Math.trunc(Math.sqrt(rr - dy * dy)));
      for (let dx = -half; dx <= half; dx++) {
        total++;
        if (solidOrSlopedAt(st, ox + dx, oy + dy)) solid++;
      }
    }
    if (solid < total - 5) return false;
  }
  const num = rng.int(6, 9);  // Next(6,10)
  const num2 = rng.int(1, 4); // Next(1,5)
  const rect: Rect = { x0: ox - num, y0: oy - num, x1: ox + num + 1, y1: oy + num + 1 };
  // structures.CanPlace(rect, pad 0)（CampsiteBiome.cs:20）——全局保护图互斥
  //   + GeneralPlacementTiles 默认内容扫描（单参重载）
  if (!canPlaceStructure(gs, rect, 0, st)) return false;
  // (num+3)² 内禁地牢砖/容器/神庙砖/祭坛(cs:24-35)
  {
    const n3 = num + 3;
    for (let dx = -n3; dx <= n3; dx++) {
      for (let dy = -n3; dy <= n3; dy++) {
        if (!st.inBounds(ox + dx, oy + dy)) continue;
        const i = st.idx(ox + dx, oy + dy);
        if (!st.flags[i]) continue;
        const t = st.type[i];
        if (t === LIHARD || t === LIHARD_ALTAR) return false;
        // Main.tileDungeon 近似:三种地牢砖(41/43/44)
        if (t === DUNGEON_BLUE || t === DUNGEON_GREEN || t === DUNGEON_PINK) return false;
        const key = TILE_DEFS[t]?.key ?? '';
        if (key.includes('chest') || key.includes('dresser')) return false; // IsAContainer 近似
      }
    }
  }
  // 墙类型按地表材质(cs:36-66)
  let wallType = 196 + rng.int(0, 3);
  for (let dx = -num; dx <= num; dx++) {
    for (let dy = -num; dy <= num; dy++) {
      if (!st.inBounds(ox + dx, oy + dy)) continue;
      const i = st.idx(ox + dx, oy + dy);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      if (t === SAND || t === SANDSTONE || t === HARDSAND || t === FOSSIL) wallType = 171;
      else if (t === SNOW || t === ICE) wallType = 40;
      else if (t === JUNGLE_GRASS) wallType = 204 + rng.int(0, 3);
      else if (t === MARBLE) wallType = 178;
      else if (t === GRANITE) wallType = 180;
    }
  }
  // Slime(num) + Blotches(num2,num2,num2,1,chance 1.0) 形状(cs:67-68):
  //  blotch 点入 ShapeData;Offset(0,-2) 后沙 53→397;空墙 → wallType
  const data = new Set<number>();
  const r2 = (num + 1) * (num + 1);
  const slimeRows: Array<[number, number]> = [];
  for (let dy = -num; dy <= 0; dy++) {
    slimeRows.push([dy, Math.min(num, Math.trunc(Math.sqrt(r2 - dy * dy)))]);
  }
  for (let k = 1; k <= Math.trunc(num * 0.5) - 1; k++) {
    slimeRows.push([k, Math.min(num, Math.trunc(Math.sqrt(r2 - (k * 2) ** 2)))]);
  }
  for (const [dy, half] of slimeRows) {
    for (let dx = -half; dx <= half; dx++) {
      // Blotches(Apply:先掷 1 次 NextDouble 丢弃,再判 chance=1.0;矩形 x[1-n2,n2-1] y[1-n2,0])
      rng.next();
      rng.next();
      // ★四连掷(Modifiers.cs:129-132):num/num2/num3/num4 依序 Next(1-_minX,1)/
      //   Next(0,_maxX)/Next(1-_minY,1)/Next(0,_maxY)。campsite 传 Blotches(num2,num2,
      //   num2,1,1.0)(cs:68)→ _maxY=1,第 4 掷 Next(0,1) 恒 0 但**必耗 1 样本**
      //   ——曾硬编码 by1=0 漏掷,每形状格少耗 1 骰,后续 RNG 流整体前移
      const bx0 = rng.int(1 - num2, 0), bx1 = rng.int(0, num2 - 1);
      const by0 = rng.int(1 - num2, 0), by1 = rng.int(0, 0);
      for (let bi = bx0; bi <= bx1; bi++) {
        for (let bj = by0; bj <= by1; bj++) {
          const px = ox + dx + bi, py = oy + dy + bj;
          data.add(py * st.w + px);                   // Output(data)挂在 Blotches 上(位移前坐标)
          if (!st.inBounds(px, py)) continue;
          // ★链序(CampsiteBiome.cs:68):Blotches→Offset(0,-2)→OnlyTiles(53)→SetTile(397)
          //   →OnlyWalls(0)→PlaceWall(type)——Offset 对**其后所有动作**生效,OnlyTiles(53)
          //   是整链门(非沙→SetTile/PlaceWall 全跳)。曾把墙写在未位移 (px,py) 且无沙门
          const ux = px, uy = py - 2;                 // Modifiers.Offset(0, -2)
          if (!st.inBounds(ux, uy)) continue;
          const ui = st.idx(ux, uy);
          if (!st.flags[ui] || st.type[ui] !== SAND) continue;   // OnlyTiles(53) 链门
          // SetTile(397, setSelfFrames):Clear(~(Wiring|Actuator)) 连墙带液全清
          st.type[ui] = HARDSAND_TILE; st.flags[ui] = 1;
          st.frameX[ui] = 0; st.frameY[ui] = 0;
          st.slope[ui] = 0; st.half[ui] = 0;
          st.wall[ui] = 0; st.liquid[ui] = 0; st.liquidType[ui] = 0;
          // XXXX：SetTile setSelfFrames+setNeighborFrames（默认真）→ 中心+四邻五连
          //   TileFrame(resetFrame:true)（Actions.cs:226/WorldUtils.cs:79-92——邻格
          //   184 苔藓等 roll 族掷 Next(3)，UUUU 定谳机制循线补）
          genFrameNeighbors(st, rng, ux, uy, 'setTile');
          // OnlyWalls(0)→PlaceWall(type):SetTile 已清墙 → 恒过门,写 wallType
          // ★BBBBBB：PlaceWall.Apply 先**写墙**再五连 SquareWallFrame（帧掷读新墙
          //   ≠0 → 每中心 1×Next(0,3)）。曾先掷后写墙——掷时 wall 仍 0 被
          //   wallFrameRollMB 的 wl===0 门跳过=**漏掷**，camp 段掷流前移（22222
          //   全序列对拍 #82323 van=a3 vs js=d 定谳）。All(data) 段（:537）序正确。
          st.wall[ui] = wallType;
          placeWallFrameRollsMB(st, rng, ux, uy);
        }
      }
    }
  }
  // All(data):ClearTile + SetLiquid(0,0) + SetFrames(frameNeighbors:true) + 空墙刷墙(cs:69)
  //   ClearTile(Tile.cs:153)=ClearSlope(slope=0+half=0)+active(false)+inActive(false)
  //   ——曾漏 slope/half/致动位复位(斜坡/半砖格残留 → Sl/Hf/Ia 通道差)
  //   ★data 枚举序：ShapeData 只经 Blotches Output 的 Add（无 Remove/重插）→
  //     .NET HashSet 枚举序=槽分配序=插入序（XXXX 批裁决，见文件头），JS Set 同序。
  //     SetFrames 在 OnlyWalls(0) 门之前（链位）——逐点恒执行；PlaceWall 掷仅
  //     空墙点（XXXX 补）
  for (const key of data) {
    const px = key % st.w, py = Math.trunc(key / st.w);
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    st.flags[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    st.wire[i] &= ~WIRE_ACTUATOR;                     // ClearTile 的 inActive(false)
    st.liquid[i] = 0; st.liquidType[i] = 0;
    genFrameNeighbors(st, rng, px, py, 'setTile');    // SetFrames(frameNeighbors:true)（cs:69）
    if (st.wall[i] === 0) {
      st.wall[i] = wallType;
      placeWallFrameRollsMB(st, rng, px, py);         // PlaceWall(type) 五连 SquareWallFrame
    }
  }
  // 向下 10 格找地面(cs:70-74):Find(origin, Down(10), IsSolid) 含起点 + Conditions.IsSolid
  let groundY = oy;
  {
    let found = false;
    for (let k = 0; k < 10 && !found; k++) {
      if (condIsSolid(st, ox, oy + k)) { groundY = oy + k; found = true; }
    }
    if (!found) return false;
  }
  const num4 = groundY - 1;
  // ★裸 Next() 的 int 取模位谓词(CampsiteBiome.cs:75 `Next() % 2 == 0`)——RNG.vanilla
  //   直通 UnifiedRandom.next()(= C# Next() 裸 int32)。曾译 `next()<0.5`(NextDouble
  //   高位)判定面同概率但逐种子结果不同,帐篷朝向/倒木/篝火三处连锁错位
  const flag = rng.vanilla.next() % 2 === 0;
  // 金币堆帐篷(cs:76-88,1/10 跳过)——`Next() % 10 != 0` 位谓词(cs:76)
  // ★KKKKK：PlaceTile(332) 走 default 支（cs:60258-60272）——头门 !tileSolid[332]
  //   恒过（非实心）＝**无任何空格/地基门**（覆盖写,帧/墙/液保留——cs:60259 只写
  //   active+type）；尾 SquareTileFrame(i,j)（cs:60285）。曾自造 !active+下方实心
  //   门 = #101 T332 残 7 格根因。生成期 488 活性格早退（cs:59369）一并镜像。
  if (rng.vanilla.next() % 10 !== 0) {
    const num5 = rng.int(1, 3); // Next(1,4)
    const num6 = flag ? 4 : -Math.trunc(num / 2);
    for (let m = 0; m < num5; m++) {
      const num7 = rng.int(1, 2); // Next(1,3)
      for (let n = 0; n < num7; n++) {
        const px = ox + num6 - m, py = num4 - n;
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        if (st.flags[i] && st.type[i] === FALLEN_LOG_TILE) continue;  // 488 早退（cs:59369）
        st.type[i] = COIN_PILE; st.flags[i] = 1;                      // 只写 active+type（帧/墙/液保留）
        genSquareTileFrame(st, rng, px, py);                          // PlaceTile 尾（cs:60285）
      }
    }
  }
  // 倒木 186(cs:89-93,1/10 跳过)——`Next() % 10 != 0` 位谓词(cs:90)
  // ★KKKKK：PlaceTile(186)→Place3x2(i,j)+SquareTileFrame(i,j)（cs:60018-60026）——
  //   中心锚 [i-1..i+1]×[j-1..j]（曾 [i..i+2] 整体 +1）；门=区全失活+逐列地面
  //   SolidTile2(x±,j+1)+Boulders 排除（186/187）
  const num8 = (num - 3) * (flag ? -1 : 1);
  if (rng.vanilla.next() % 10 !== 0) {
    place3x2MB(st, rng, ox + num8, num4, LARGE_PILES);               // style 0
  }
  // 篝火 215(cs:94-113,1/10 跳过)——`Next() % 10 != 0`(cs:94)
  // ★KKKKK：PlaceTile(215)→Place3x2+SquareTileFrame，成功后六格 frameY+=36
  //   （cs:97-105 未点燃行：Place3x2 写 0/18，+36 → 顶 36/底 54——金标帧实证
  //   (2065,352)=36/(2065,353)=54）；锚判定=锚格(ox,num4) active&&type==215。
  //   曾左锚 [ox..ox+2] 且漏 +36（#101 T215 残 12 格根因）。
  if (rng.vanilla.next() % 10 !== 0) {
    place3x2MB(st, rng, ox, num4, CAMPFIRE, 0, true);
    const ai = st.idx(ox, num4);
    if (st.flags[ai] && st.type[ai] === CAMPFIRE) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          if (!st.inBounds(ox + dx, num4 + dy)) continue;
          const i = st.idx(ox + dx, num4 + dy);
          if (st.type[i] === CAMPFIRE && st.flags[i]) st.frameY[i] = (st.frameY[i] ?? 0) + 36;
        }
      }
    }
  }
  // structures.AddProtectedStructure(rect, 4)（CampsiteBiome.cs:114）——pad 4
  addProtectedStructure(gs, rect, 4);
  return true;
}

/** WorldGen.Place3x2（cs:52097-52227）1:1——PlaceTile case 186/187/215 通道
 *  （cs:60011-60026：Place3x2(i,j,type,style)+SquareTileFrame(i,j)，style=0）。
 *  ★KKKKK 批重写：中心锚 (x-1..x+1)×(y-1..y)（Place3x2 字面）；门=3×2 区全
 *  失活（campfire 加液体排除,cs:52127-30）+ 逐列 i∈{x-1,x,x+1} 地面
 *  SolidTile2(i,y+1)（cs:52149）+ 186/187 的 InvalidTileForPilesOrSpeleothems
 *  排除（cs:52141）；帧 fx=col*18+54*style、fy=0(顶)/18(底)。
 *  SolidTile2（cs:70178）＝active∧tileSolid∧slope0∧!half——平台族 vanilla
 *  tileSolid 真，走 vanGenSolidType（HHHH 口径 SOLID∪{19,239,380,427,435-439}）。
 *  ★CCCCC：双 SquareTileFrame——case 支恒调（cs:60026，门败也走）+ 尾
 *  （cs:60284，tile.active() 时）——SQ 织入 12345 实证 186/215 每逢 PT 后
 *  SQ×2（7+7 例全双帧）；曾单帧（且门败零帧）。 */
function place3x2MB(st: TileStore, rng: RNG, x: number, y: number, typeJs: number, style = 0, campfire = false): void {
  if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return;        // cs:52099
  let ok = true;
  for (let i = x - 1; i <= x + 1; i++) {
    for (let j = y - 1; j <= y; j++) {
      if (!st.inBounds(i, j)) { ok = false; continue; }              // OoB＝GetTileSafely 新空格
      const k = st.idx(i, j);
      if (st.flags[k]) ok = false;                                   // 区内任何活性格 → 拒（cs:52123）
      if (campfire && st.liquid[k]! > 0) ok = false;                 // Campfires 族液体排除（cs:52127）
    }
    if (st.inBounds(i, y + 1)) {
      const g = st.idx(i, y + 1);
      if (st.flags[g] && BOULDER_TILES.has(st.type[g]!)) ok = false; // InvalidTileForPiles（186/187，cs:52141）
      if (!(st.flags[g] !== 0 && vanGenSolidType(st.type[g]!)
        && st.slope[g] === 0 && st.half[g] === 0)) ok = false;       // SolidTile2(i,y+1)（cs:52149）
    } else ok = false;                                               // OoB 地面列 → 拒
  }
  if (ok) {
    for (let i = x - 1; i <= x + 1; i++) {
      for (let j = y - 1; j <= y; j++) {
        if (!st.inBounds(i, j)) continue;
        st.setTileSilent(i, j, typeJs, style * 54 + (i - x + 1) * 18, (j - y + 1) * 18);   // cs:52202-225
      }
    }
  }
  genSquareTileFrame(st, rng, x, y);                                 // case 支恒调（cs:60026）
  if (st.inBounds(x, y) && st.flags[st.idx(x, y)]) {
    genSquareTileFrame(st, rng, x, y);                               // 尾（cs:60284——tile.active() 时）
  }
}

/** MiningExplosivesBiome.Place(MiningExplosivesBiome.cs:10-76) */
function placeMiningExplosives(st: TileStore, rng: RNG, gs: GenState, ox: number, oy: number): boolean {
  if (solidTileStrict(st, ox, oy)) return false;   // WorldGen.SolidTile(cs:13)
  {
    const wl = st.inBounds(ox, oy) ? st.wall[st.idx(ox, oy)] : -1;
    if (wl === 216 || wl === 187) return false; // 地下沙漠墙门禁(cs:17-20)
  }
  const barType = [gs.oreTiers.gold, gs.oreTiers.silver, gs.oreTiers.iron, gs.oreTiers.copper][rng.int(0, 3)];
  const dir = rng.next() * 2 - 1; // cs:22
  // Find(origin, Right(40)|Left(40) + Conditions.IsSolid) → origin(cs:23-26)
  //   ★Searches.Left/Right/Down 的 i 从 0 起(Searches.cs:15/35/55)——**包含起点格**;
  //   IsSolid 条件=InWorld(10)+active+生成期 tileSolid(Conditions.cs:85)。
  //   曾从 ±1 起步且用静态 solidAt——锚点整体偏一格/漏半砖实心
  let x = ox, y = oy;
  {
    const step = dir > 0 ? 1 : -1;
    let found = false;
    for (let k = 0; k < 40 && !found; k++) {
      if (condIsSolid(st, ox + k * step, oy)) { x = ox + k * step; found = true; }
    }
    if (!found) return false;
  }
  // Find(origin, Down(80) + IsSolid)(cs:27-30)——起点即 Right 结果(实心),原版恒原格
  {
    let found = false;
    for (let k = 0; k < 80 && !found; k++) {
      if (condIsSolid(st, x, y + k)) { y = y + k; found = true; }
    }
    if (!found) return false;
  }
  // ShapeRunner(10, 20, (dir,1)).Output(shapeData) + Blotches() + Scanner + IsSolid +
  //   Scanner(cs:31-38)。★Output 挂在形状上=raw 格(Blotches 扩张前)——曾把 blotch
  //   扩张格塞进 shapeData,矿石地板(All(shapeData))覆盖范围整体走样
  const data = new Set<number>();
  let total = 0, solid = 0;
  {
    let steps = 20.0, strength = 10.0;
    let px = x + 0.0, py = y + 0.0;
    let vx = dir + 0.0, vy = 1.0;
    while (steps > 0 && strength > 0) {
      strength = 10 * (steps / 20);
      steps -= 1;
      const bx0 = Math.max(1, Math.trunc(px - strength * 0.5)), by0 = Math.max(1, Math.trunc(py - strength * 0.5));
      const bx1 = Math.min(st.w, Math.trunc(px + strength * 0.5)), by1 = Math.min(st.h, Math.trunc(py + strength * 0.5));
      for (let i = bx0; i < bx1; i++) {
        for (let j = by0; j < by1; j++) {
          if (Math.abs(i - px) + Math.abs(j - py) >= strength * 0.5 * (1 + rng.int(-10, 10) * 0.015)) continue;
          data.add(j * st.w + i);                     // UnitApply:OutputData.Add(raw 格)
          // Blotches()(默认 scale 2, 0.3):丢弃掷+chance 掷;命中四连掷 blotch 矩形
          rng.next();
          const pts: Array<[number, number]> = [];
          if (rng.next() < 0.3) {
            const ox0 = rng.int(-1, 0), ox1 = rng.int(0, 1), oy0 = rng.int(-1, 0), oy1 = rng.int(0, 1);
            for (let bi = ox0; bi <= ox1; bi++) for (let bj = oy0; bj <= oy1; bj++) pts.push([i + bi, j + bj]);
          } else {
            pts.push([i, j]);
          }
          // Scanner(obj)→Modifiers.IsSolid(SolidOrSlopedTile)→Scanner(obj2)
          for (const [qx, qy] of pts) {
            total++;
            if (solidOrSlopedAt(st, qx, qy)) solid++;
          }
        }
      }
      const n8 = Math.trunc(strength / 50) + 1;
      steps -= n8;
      px += vx; py += vy;
      for (let k = 0; k < n8; k++) {
        px += vx; py += vy;
        vx += rng.range(-0.5, 0.5); vy += rng.range(-0.5, 0.5);
      }
      vx += rng.range(-0.5, 0.5); vy += rng.range(-0.5, 0.5);
      vx = Math.max(-1, Math.min(1, vx));
      vy = Math.max(-1, Math.min(1, vy));
    }
  }
  if (solid < Math.trunc(total / 2)) return false; // cs:35-38
  const area: Rect = { x0: x - 15, y0: y - 10, x1: x + 15, y1: y + 10 };
  // structures.CanPlace(area, pad 0)（MiningExplosivesBiome.cs:40）——全局保护图互斥
  //   + GeneralPlacementTiles 默认内容扫描（单参重载）
  if (!canPlaceStructure(gs, area, 0, st)) return false;
  // 矿石地板(cs:44):All(shapeData)+SetTile(type, setSelfFrames)
  //   SetTile=Clear(~(Wiring|Actuator)) 连墙带液带帧带坡全清后写 type
  //   ★setSelfFrames+setNeighborFrames(默认真)→ 中心+四邻五连 TileFrame(resetFrame:
  //   true)（XXXX 补——shapeData 只经 ShapeRunner Output 的 Add,枚举序=插入序）
  for (const key of data) {
    const qx = key % st.w, qy = Math.trunc(key / st.w);
    if (!st.inBounds(qx, qy)) continue;
    const i = st.idx(qx, qy);
    st.type[i] = barType; st.flags[i] = 1;
    st.frameX[i] = 0; st.frameY[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0;
    genFrameNeighbors(st, rng, qx, qy, 'setTile');
  }
  // Circle(5) + Blotches 挖房(cs:45):中心 = (origin.X - dir*-5, origin.Y - 5)
  {
    const cx = x - Math.trunc(-dir * 5), cy = y - 5;
    const r = 5, rr = (r + 1) * (r + 1);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.min(r, Math.trunc(Math.sqrt(rr - dy * dy)));
      for (let dx = -half; dx <= half; dx++) {
        rng.next();
        const pts: Array<[number, number]> = [];
        if (rng.next() < 0.3) {
          const ox0 = rng.int(-1, 0), ox1 = rng.int(0, 1), oy0 = rng.int(-1, 0), oy1 = rng.int(0, 1);
          for (let bi = ox0; bi <= ox1; bi++) for (let bj = oy0; bj <= oy1; bj++) pts.push([cx + dx + bi, cy + dy + bj]);
        } else {
          pts.push([cx + dx, cy + dy]);
        }
        for (const [qx, qy] of pts) {
          if (!st.inBounds(qx, qy)) continue;
          const i = st.idx(qx, qy);
          st.flags[i] = 0;                              // ClearTile(frameNeighbors):
          st.slope[i] = 0; st.half[i] = 0;              // ClearSlope+active(false)
          st.wire[i] &= ~WIRE_ACTUATOR;                 // +inActive(false)(Tile.cs:153)
          // XXXX：WorldUtils.ClearTile(frameNeighbors:true)=四邻 TileFrame(reset=false)
          genFrameNeighbors(st, rng, qx, qy, 'clearTile');
        }
      }
    }
  }
  // 两侧落点向下 10 格找地面(cs:47-52):Down(10) 含起点 + Conditions.IsSolid
  const findDown = (fx: number, fy: number): number => {
    for (let k = 0; k < 10; k++) {
      if (condIsSolid(st, fx, fy + k)) return fy + k;
    }
    return -1;
  };
  const barX = x - (dir > 0 ? 3 : -3);
  const num3 = rng.int(0, 3) === 0 ? 3 : 7; // cs:48
  const detX = x - (dir > 0 ? -num3 : num3);
  let barGround = findDown(barX, y - 3);
  const detGround = findDown(detX, y - 3);
  if (barGround < 0 || detGround < 0) return false;
  barGround--; // result.Y--
  const detTop = detGround - 1; // result2.Y--
  // 炸药桶地面 slope/half 复位(cs:55-57)
  {
    const gi = st.idx(barX, barGround + 1);
    st.slope[gi] = 0; st.half[gi] = 0;
  }
  // 起爆器下方 3 列整平(cs:58-70):ClearTile + 非实心补石 + slope/half 复位
  for (let i = -1; i <= 1; i++) {
    const px = detX + i, py = detTop;
    if (st.inBounds(px, py)) {
      const ci = st.idx(px, py);
      st.flags[ci] = 0; st.slope[ci] = 0; st.half[ci] = 0;
      st.wire[ci] &= ~WIRE_ACTUATOR;
    }
    const below = detTop + 1;
    if (st.inBounds(px, below)) {
      const bi = st.idx(px, below);
      if (!solidOrSlopedAt(st, px, below)) {
        st.type[bi] = STONE; st.flags[bi] = 1;   // ResetToType(1)+active
      }
      st.slope[bi] = 0; st.half[bi] = 0;         // cs:67-68(两分支都复位)
      // XXXX：WorldUtils.TileFrame(result2.X+i, result2.Y+1, frameNeighbors:true)
      //   （cs:70）= 中心+四邻五连 TileFrame(resetFrame:true)
      genFrameNeighbors(st, rng, px, below, 'setTile');
    }
  }
  // PlaceTile(result, 141)(cs:71)——前奏 Clear(锚格 Tile|TilePaint|Slope,cs:59501)+
  //   Place1x1 门(Wiring.IsAMechanism[141]→下方非巨石族 && SolidTile2(地) && 锚格非活性)
  {
    if (st.inBounds(barX, barGround)) {
      const ai = st.idx(barX, barGround);
      const wasActive = st.flags[ai] !== 0;
      // ★CCCCC：前奏 Clear 仅 !active 时（cs:59500）——活性格保留原格（曾无条件清）
      if (!wasActive) {
        st.type[ai] = 0; st.flags[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0;
        st.slope[ai] = 0; st.half[ai] = 0;
      }
      const gOK = (() => {
        if (!st.inBounds(barX, barGround + 1)) return false;
        const gi = st.idx(barX, barGround + 1);
        if (st.flags[gi] === 0) return false;
        const gt = st.type[gi]!;
        // SolidTile2（cs:70178）—— !inActive() 生成期恒真（XXXX，见 solidTileStrict 注）
        return vanGenSolidType(gt) && !TILE_DEFS[gt]?.platform
          && st.slope[gi] === 0 && st.half[gi] === 0
          && !BOULDER_TILES.has(gt);                                                   // 非巨石族地板
      })();
      if (gOK && !wasActive) {
        st.type[ai] = EXPLOSIVES; st.flags[ai] = 1;
        st.frameX[ai] = 0; st.frameY[ai] = 0;
      }
      // ★CCCCC：case141 支=Place1x1+SquareTileFrame(i,j)（cs:60225-60227——Place1x1
      //   后**恒调**，门败也走）。SQ 织入定罪：12345 首差 @roll105548 = PT141 后双
      //   SQ（in-case+尾）而 JS 单帧 → 九宫 184 苔藓少掷一次，掷流自此分叉
      //   （van SQ(1075,654)×2 + TF184(1075,653)×2 铁证；BBBBBB"41 vs 32 候选"
      //   定罪系异常 span 误读，真链两侧候选 11=11 全同）。
      genSquareTileFrame(st, rng, barX, barGround);
      // ★BBBBBB 修正+CCCCC 补：尾 SquareTileFrame(i,j)（cs:60284）——tile.active()
      //   时（含门败但锚格仍活性）——184 苔藓邻格每访恒掷
      if (st.flags[ai]) genSquareTileFrame(st, rng, barX, barGround);
    }
  }
  // 起爆器 411:PlaceTile(..., forced: true)(cs:72)→case 411→Place2x2（cs:59766-59769）
  //   ★CCCCC 修正：**右下锚** (detX-1..detX)×(detTop-1..detTop) + 空置/地面双门——
  //   门败整写放弃且 WireLine/保护图照跑（cs:73-75 对 PlaceTile 返回值不接，函数仍
  //   return true）。曾按左上锚无条件写 (detX..detX+1)×(detTop..detTop+1)：#101 段
  //   (861-862,735-736) JS 多出一块 411 而 van Place2x2 空置门败未落（金标全图 411
  //   位扫描 + 轨道行 735 直穿实证；AAAAA"findDown 首实心低一行"诊断更正——
  //   findDown 两侧同果 detGround=736，差在落块锚 detTop-1 起）。
  place2x2Direct(st, detX, detTop, DETONATOR);
  // ★CCCCC：PlaceTile(411) 尾 SquareTileFrame(detX, detTop)（cs:60284）——锚格
  //   active 时（Place2x2 写入含锚格；门败锚格被整平段清过 → 不掷）。SQ 织入：
  //   van 每次 PT411 后恒一 SQ（19 次 SQ×1 + 9 次门败 SQ×0 实证）
  if (st.inBounds(detX, detTop) && st.flags[st.idx(detX, detTop)]) {
    genSquareTileFrame(st, rng, detX, detTop);
  }
  // WorldUtils.WireLine(WorldUtils.cs:111-131):L 形红线
  {
    const sx = Math.min(barX, detX), ex = Math.max(barX, detX);
    const sy = Math.min(barGround, detTop), ey = Math.max(barGround, detTop);
    for (let i = sx; i <= ex; i++) {
      if (st.inBounds(i, barGround)) st.wire[st.idx(i, barGround)] |= WIRE_RED;
    }
    for (let j = sy; j <= ey; j++) {
      if (st.inBounds(detX, j)) st.wire[st.idx(detX, j)] |= WIRE_RED;
    }
  }
  // structures.AddProtectedStructure(area, 5)（MiningExplosivesBiome.cs:74）——pad 5
  addProtectedStructure(gs, area, 5);
  return true;
}

// ============================================================
// 4.5 MahoganyTreeBiome(Terraria.GameContent.Biomes/MahoganyTreeBiome.cs:9-84 全文)
// 丛林活桃花心木树:树干 383(五段矩形上下堆叠,正弦横向摆动)+墙 78 中心井+
// 顶部分枝(ShapeBranch×4)+叶球(Circle(4)+Blotches(4,2)→384)+四条根
// (ShapeRoot)+常春藤箱(style10,flag4 ivy)。掷骰:成功路径 3(摆幅)+每枝
// 1(长度)+每段 2(旋转)+每叶球格 2+(Blotches)+每根步 2(NextFloat×2)+
// 常春藤主件序+AddBuriedChest 战利品。
// ============================================================

const LIVING_MAHOGANY = TILE_BY_KEY['v_383_living_mahogany_block']!;
const LIVING_M_LEAVES = TILE_BY_KEY['v_384_living_mahogany_leaves_block']!;
/** MahoganyTreeBiome.SkipTiles(21,467,226,237) */
const MAHOGANY_SKIP = idsByVanillaSheet(21, 467, 226, 237);
/** C# float 精度 π(MahoganyTreeBiome 正弦族字面量 3.1415927410125732,非 Math.PI) */
const PI_F = 3.1415927410125732;

/** Utils.PlotLine(Tools 端 1:1,DesertPass 同款):jump=false 时斜步双落点;
 *  start==end 恰落一次;否则终点本身不落。 */
function mahogPlotLine(
  x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => boolean, jump: boolean,
): boolean {
  if (x0 === x1 && y0 === y1) return plot(x0, y0);
  let sx0 = x0, sy0 = y0, sx1 = x1, sy1 = y1;
  const flag = Math.abs(sy1 - sy0) > Math.abs(sx1 - sx0);
  if (flag) {
    const tx = sx0; sx0 = sy0; sy0 = tx;
    const tx1 = sx1; sx1 = sy1; sy1 = tx1;
  }
  const num = Math.abs(sx1 - sx0), num2 = Math.abs(sy1 - sy0);
  let num3 = Math.trunc(num / 2), num4 = sy0;
  const num5 = sx0 < sx1 ? 1 : -1, num6 = sy0 < sy1 ? 1 : -1;
  for (let i = sx0; i !== sx1; i += num5) {
    if (!plot(flag ? num4 : i, flag ? i : num4)) return false;
    num3 -= num2;
    if (num3 >= 0) continue;
    num4 += num6;
    if (!jump && !plot(flag ? num4 : i, flag ? i : num4)) return false;
    num3 += num;
  }
  return true;
}

/** MahoganyTreeBiome.Place(cs:9-84)1:1 */
function placeMahoganyTree(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink | undefined, ox: number, oy: number,
): boolean {
  const sink: ChestSink = chests ?? [];
  // ① Find((origin.X-3, origin.Y), Chain(Down(200), IsSolid().AreaAnd(6,1)))(cs:11-13)
  const condSolid = (x: number, y: number): boolean => {
    if (x < 10 || y < 10 || x >= st.w - 10 || y >= st.h - 10) return false;   // InWorld(x,y,10)
    const i = st.idx(x, y);
    return st.flags[i] !== 0 && vanGenSolidType(st.type[i]);                  // Main.tileSolid
  };
  let rx = -1, ry = -1;
  {
    const px = ox - 3;
    let found = false;
    for (let i = 0; i < 200 && oy + i < st.h; i++) {
      const y = oy + i;
      let allSolid = true;
      for (let k = px; k < px + 6 && allSolid; k++) {
        if (!condSolid(k, y)) allSolid = false;     // AreaAnd(6,1):[px,px+5]×[y,y]
      }
      if (allSolid) { rx = px; ry = y; found = true; break; }
    }
    if (!found) return false;
  }
  // ② Find((result.X, result.Y-5), Chain(Up(120), IsSolid().AreaOr(6,1)))(cs:15-21)
  let r2y = -1;
  {
    const y0 = ry - 5;
    let found = false;
    for (let i = 0; i < 120; i++) {
      const y = y0 - i;
      let anySolid = false;
      for (let k = rx; k < rx + 6 && !anySolid; k++) {
        if (condSolid(k, y)) anySolid = true;       // AreaOr(6,1)
      }
      if (anySolid) { r2y = y; found = true; break; }
    }
    if (!found || ry - 5 - r2y > 60 || ry - r2y < 30) return false;
  }
  // ③ structures.CanPlace(Rectangle(result.X-30, result.Y-60, 60, 90))(cs:23-25)
  if (!canPlaceStructure(gs, { x0: rx - 30, y0: ry - 60, x1: rx + 30, y1: ry + 30 }, 0, st)) return false;
  // ④ 50×50 TileScanner 材质门(cs:27-44):非 drunk 必扫(零掷骰)
  {
    const idOf = (vanilla: number): number => {
      for (const t of idsByVanillaSheet(vanilla)) return t;
      return -1;
    };
    const DIRT_T = idOf(0), MUD_T = idOf(59), JG_T = idOf(60), SNOW_T = idOf(147);
    const STONE_T = idOf(1), EBON_T = idOf(25), PEARL_T = idOf(203), CRIM_T = idOf(117);
    const ICE_T = idOf(161), FROZEN_T = idOf(163), FLOWER_T = idOf(200), FLOWER2_T = idOf(164);
    const countIds = new Set([DIRT_T, MUD_T, JG_T, SNOW_T, ICE_T, FROZEN_T, FLOWER_T, FLOWER2_T, STONE_T, EBON_T, PEARL_T, CRIM_T]);
    const counts = new Map<number, number>();
    for (let dx = 0; dx < 50; dx++) {
      for (let dy = 0; dy < 50; dy++) {
        const x = rx - 25 + dx, y = ry - 25 + dy;
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        if (!st.flags[i] || !countIds.has(st.type[i])) continue;
        counts.set(st.type[i], (counts.get(st.type[i]) ?? 0) + 1);
      }
    }
    const c = (t: number): number => counts.get(t) ?? 0;
    const num = c(STONE_T) + c(EBON_T) + c(PEARL_T) + c(CRIM_T);
    const num2 = c(DIRT_T) + num;
    const num3 = c(MUD_T) + c(JG_T);
    const num4 = c(ICE_T) + c(FROZEN_T) + c(FLOWER_T) + c(FLOWER2_T);
    if (c(SNOW_T) + num4 > num3 || num2 > num3 || num3 < 50) return false;
  }
  // ⑤ 摆幅三掷(cs:46-52)
  const num5 = Math.trunc((ry - r2y - 9) / 5);
  const num6 = num5 * 5;
  let num7 = 0;
  const num8 = rng.next() + 1.0;
  let num9 = rng.next() + 2.0;
  if (rng.nextInt(2) === 0) num9 = -num9;
  // 干身段动作链(纯写入,零掷骰):
  //   A: SkipTiles→SkipWalls(87)→RemoveWall→SetTile(383)→SetFrames
  //   B/C: SkipTiles→SkipWalls(87)→ClearTile(frameNeighbors)→PlaceWall(78)
  const setMahog = (x: number, y: number): void => {
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    // SkipTiles(21,467,226,237):活性且命中 → 整链 Fail(跳过本格)
    if (st.flags[i] && MAHOGANY_SKIP.has(st.type[i])) return;
    if (st.wall[i] === 87) return;                       // SkipWalls(87)
    // RemoveWall → SetTile(383):Clear(~(Wiring|Actuator)) 连墙带液全清 + type
    st.wall[i] = 0;
    st.liquid[i] = 0; st.liquidType[i] = 0;
    st.frameX[i] = 0; st.frameY[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    st.type[i] = LIVING_MAHOGANY; st.flags[i] = 1;
    genTileFrame(st, rng, x, y);   // 尾随 SetFrames()（cs:55）——中心 resetFrame=true（UUUU 补掷）
  };
  const shaftCell = (x: number, y: number): void => {
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    if (st.flags[i] && MAHOGANY_SKIP.has(st.type[i])) return;
    if (st.wall[i] === 87) return;
    st.flags[i] = 0; st.slope[i] = 0; st.half[i] = 0;    // ClearTile(frameNeighbors)
    st.wire[i] &= ~WIRE_ACTUATOR;                        // +inActive(false)(Tile.cs:153)
    genFrameNeighbors(st, rng, x, y, 'clearTile');       // 四邻 TileFrame(reset=false)（UUUU 补掷）
    st.wall[i] = 78;                                     // PlaceWall(78)
    placeWallFrameRollsMB(st, rng, x, y);                // 五连 SquareWallFrame 掷侧（UUUU 补掷）
  };
  const genRect = (x: number, y: number, width: number, height: number,
    act: (x: number, y: number) => void): void => {
    for (let i = x; i < x + width; i++) {
      for (let j = y; j < y + height; j++) act(i, j);    // Shapes.Rectangle:x 外层
    }
  };
  // ⑥ 五段干身(cs:53-69)
  for (let i = 0; i < num5; i++) {
    const num10 = Math.trunc(Math.sin((i + 1) / 12 * num8 * PI_F) * num9);
    const num11 = num10 < num7 ? num10 - num7 : 0;
    const span = Math.abs(num10 - num7);
    genRect(rx + num7 + num11, ry - (i + 1) * 5, 6 + span, 7, setMahog);
    genRect(rx + num7 + num11 + 2, ry - (i + 1) * 5, 2 + span, 5, shaftCell);
    genRect(rx + num7 + 2, ry - i * 5, 2, 2, shaftCell);
    num7 = num10;
  }
  // ⑦⑧ 树冠分枝(ShapeBranch ×4,cs:70-81)+叶球(cs:82-87)
  const endpoints: Array<[number, number]> = [];
  const branchCell = (x: number, y: number): void => {
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    if (st.flags[i] && MAHOGANY_SKIP.has(st.type[i])) return;
    if (st.wall[i] === 87) return;
    // ★KKKKK：Actions.SetTile 默认 clearTile=true → tile.Clear(~(Wiring|Actuator))
    //   连墙带液带帧全清（Actions.cs:203-231）——曾漏 wall 清（#101 W2178 主根因：
    //   分枝穿花岗岩洞/预置结构带时 vanilla 清 180/64 墙、JS 残留）
    st.wall[i] = 0;
    st.liquid[i] = 0; st.liquidType[i] = 0;
    st.frameX[i] = 0; st.frameY[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    st.type[i] = LIVING_MAHOGANY; st.flags[i] = 1;
    genFrameNeighbors(st, rng, x, y, 'setTile');   // SetFrames(frameNeighbors:true)（cs:75/79/80，UUUU 补掷）
  };
  /** ShapeBranch.Perform(ShapeBranch.cs:44-77)1:1(含掷序) */
  const shapeBranch = (angle: number, distance: number, bx: number, by: number): void => {
    const offX = Math.trunc(Math.cos(angle) * distance);
    const offY = Math.trunc(Math.sin(angle) * distance);
    const len = Math.sqrt(offX * offX + offY * offY);
    const size = Math.trunc(len / 6);
    const performSegment = (sx: number, sy: number, ex: number, ey: number, seg: number): void => {
      const sz = Math.max(1, seg);
      for (let i = -(sz >> 1); i < sz - (sz >> 1); i++) {
        for (let j = -(sz >> 1); j < sz - (sz >> 1); j++) {
          // quitOnFail=false → plot 恒 true,PlotLine 只负责遍历落点
          mahogPlotLine(sx + i, sy + j, ex, ey, (tx, ty) => { branchCell(tx, ty); return true; }, false);
        }
      }
    };
    endpoints.push([bx + offX, by + offY]);
    performSegment(bx, by, bx + offX, by + offY, size);
    const segs = Math.trunc(len / 8);
    for (let i = 0; i < segs; i++) {
      const num4 = (i + 1) / (segs + 1);
      const pX = Math.trunc(num4 * offX), pY = Math.trunc(num4 * offY);
      // val2 = new Vector2D(offset - point) 每轮新造(非累积),旋转后 ×0.75
      const dx = offX - pX, dy = offY - pY;
      const rot = (rng.next() * 0.5 + 1.0) * (rng.nextInt(2) !== 0 ? 1 : -1);
      const vx = (dx * Math.cos(rot) - dy * Math.sin(rot)) * 0.75;
      const vy = (dx * Math.sin(rot) + dy * Math.cos(rot)) * 0.75;
      const p2x = Math.trunc(vx) + pX, p2y = Math.trunc(vy) + pY;
      endpoints.push([p2x + bx, p2y + by]);
      performSegment(pX + bx, pY + by, p2x + bx, p2y + by, size - 1);
    }
  };
  let num12 = 6;
  if (num9 < 0) num12 = 0;
  for (let j = 0; j < 2; j++) {
    const num13 = (j + 1) / 3;
    const num14 = num12 + Math.trunc(Math.sin(num5 * num13 / 12 * num8 * PI_F) * num9);
    let num15 = rng.next() * 0.7853981852531433 - 0.7853981852531433 - 0.2;
    if (num12 === 0) num15 -= 1.5707963705062866;
    shapeBranch(num15, rng.int(12, 15), rx + num14, ry - Math.trunc(num5 * 5 * num13));
    num12 = 6 - num12;
  }
  const num16 = Math.trunc(Math.sin(num5 / 12 * num8 * PI_F) * num9);
  shapeBranch(-0.6853981852531433, rng.int(16, 21), rx + 6 + num16, ry - num6);
  shapeBranch(-2.45619455575943, rng.int(16, 21), rx + num16, ry - num6);
  // 叶球:每个 endpoint 的 Circle(4)+Blotches(4,2)+SkipTiles(383,21,467,226,237)+
  //        SkipWalls(78,87)+SetTile(384)(cs:82-87)。endpoints 在迭代中追加——
  //        C# List foreach 对增长集合抛异常?否:此处 list 只被叶球循环前填满,
  //        叶球循环本身不追加(Blotches/Circle 不 OutputEndpoints)——快照安全。
  const LEAF_SKIP = idsByVanillaSheet(383, 21, 467, 226, 237);
  for (const [cx, cy] of endpoints) {
    const r = 4, rr = (r + 1) * (r + 1);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.min(r, Math.trunc(Math.sqrt(rr - dy * dy)));
      for (let dx = -half; dx <= half; dx++) {
        // Modifiers.Blotches(4,2).Apply:先掷 1 次 NextDouble 丢弃,再判 0.3
        rng.next();
        const pts: Array<[number, number]> = [];
        if (rng.next() < 0.3) {
          const bx0 = rng.int(-3, 0), bx1 = rng.int(0, 3);
          const by0 = rng.int(-1, 0), by1 = rng.int(0, 1);
          for (let bi = bx0; bi <= bx1; bi++) {
            for (let bj = by0; bj <= by1; bj++) pts.push([cx + dx + bi, cy + dy + bj]);
          }
        } else {
          pts.push([cx + dx, cy + dy]);
        }
        for (const [lx, ly] of pts) {
          if (!st.inBounds(lx, ly)) continue;
          const i = st.idx(lx, ly);
          if (st.flags[i] && LEAF_SKIP.has(st.type[i])) continue;   // SkipTiles(383,21,...)
          if (st.wall[i] === 78 || st.wall[i] === 87) continue;     // SkipWalls(78,87)
          st.wall[i] = 0;                                           // SetTile(384) Clear 连墙清（KKKKK，同 branchCell 注）
          st.liquid[i] = 0; st.liquidType[i] = 0;
          st.frameX[i] = 0; st.frameY[i] = 0;
          st.slope[i] = 0; st.half[i] = 0;
          st.type[i] = LIVING_M_LEAVES; st.flags[i] = 1;
          genFrameNeighbors(st, rng, lx, ly, 'setTile');   // SetFrames(frameNeighbors:true)（cs:83，UUUU 补掷）
        }
      }
    }
  }
  // ⑨ 四条根(ShapeRoot,cs:88-92):每步 2 掷(NextFloat×2=float 精度)
  const rootCell = (x: number, y: number): void => {
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    if (st.flags[i] && MAHOGANY_SKIP.has(st.type[i])) return;
    if (st.wall[i] === 87) return;
    st.wall[i] = 0;   // SetTile(383,setSelfFrames) Clear 连墙清（KKKKK，同 branchCell 注）
    st.liquid[i] = 0; st.liquidType[i] = 0;
    st.frameX[i] = 0; st.frameY[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    st.type[i] = LIVING_MAHOGANY; st.flags[i] = 1;
    genFrameNeighbors(st, rng, x, y, 'setTile');   // SetTile(383,setSelfFrames)+setNeighborFrames 默认真（cs:88，UUUU 补掷）
  };
  for (let k = 0; k < 4; k++) {
    const angle0 = k / 3 * 2 + 0.57075;
    const distance = rng.int(40, 59);   // Next(40, 60)
    let num = rx, num2 = ry;
    let angle = angle0;
    for (let step = 0; step < distance * 0.85; step++) {
      const num4 = step / distance;
      const num5r = 4 + (1 - 4) * num4;                 // Utils.Lerp(4,1,num4)
      num += Math.cos(angle);
      num2 += Math.sin(angle);
      const f1 = Math.fround(rng.next());
      const f2 = Math.fround(rng.next());
      angle += f1 - 0.5 + f2 * (angle0 - 1.5707963705062866) * 0.1 * (1 - num4);
      const lim = 2 * (1 - 0.5 * num4);
      const clamped = Math.min(Math.max(angle, angle0 - lim), angle0 + lim);   // Utils.Clamp
      angle = angle * 0.4 + 0.45 * clamped + (angle0 + (1.5707963705062866 - angle0) * num4) * 0.15;
      const n = Math.trunc(num5r);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) rootCell(Math.trunc(num) + i, Math.trunc(num2) + j);
      }
    }
  }
  // ⑩ 常春藤箱(cs:93):AddBuriedChest(x+3, y-1, GetNextJungleChestItem(), false, 10, false, 0)
  placeBuriedChest(st, rng, gs, sink, rx + 3, ry - 1,
    { style: 10, loot: nextJungleItem(gs, rng), trySlope: false, notNearOtherChests: false, flags: { ivy: true } });
  // ⑪ structures.AddProtectedStructure(Rectangle(result.X-30, result.Y-30, 60, 60))(cs:94)
  addProtectedStructure(gs, { x0: rx - 30, y0: ry - 30, x1: rx + 30, y1: ry + 30 }, 0);
  return true;
}

// ============================================================
// 1. DeadMansChestBiome(Terraria.GameContent.Biomes/DeadMansChestBiome.cs 全文)
// ============================================================

interface DartSpot { x: number; y: number; directionX: number; xPush: number; trapX: number; trapY: number }
interface WireSpot { x: number; y: number; dirX: number; dirY: number; steps: number }
interface BoulderSpot { x: number; y: number; yPush: number; bestType: number }

/** WorldGen.countWires(WorldGen.cs:9462):四色线逐位计数 */
function countWires(st: TileStore, x: number, y: number, size: number): number {
  let n = 0;
  for (let i = x - size; i <= x + size; i++) {
    for (let j = y - size; j <= y + size; j++) {
      if (!st.inBounds(i, j)) continue;
      const b = st.wire[st.idx(i, j)] & 15;
      n += (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
    }
  }
  return n;
}

/** WorldGen.countTiles(WorldGen.cs:9493 + nextCount:9506-9577,jungle=false/lavaOk=true):
 *  非实心格洪水填充计数。墙≠0/墙 244/微光液体/贴边 → 直接判满(3500);
 *  结果只与连通域相关,与遍历序无关(< 40 门槛与 3500 封顶均序不变) */
const MAX_TILE_COUNT = 3500;   // WorldGen.maxTileCount(cs:4194)
function countTiles(st: TileStore, x0: number, y0: number): number {
  let count = 0;
  const seen = new Set<number>();
  const stack: Array<[number, number]> = [[x0, y0]];
  while (stack.length > 0) {
    if (count >= MAX_TILE_COUNT) return count;
    const [x, y] = stack.pop()!;
    if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) return MAX_TILE_COUNT;
    const k = y * st.w + x;
    if (seen.has(k)) continue;
    seen.add(k);
    const i = st.idx(x, y);
    if (st.wall[i] === 244) return MAX_TILE_COUNT;
    if (st.liquid[i] > 0 && st.liquidType[i] === LIQUID_TYPE.SHIMMER) return MAX_TILE_COUNT;
    if (st.wall[i] !== 0) return MAX_TILE_COUNT;   // jungle=false 分支(cs:9531-9534)
    // lavaOk=true:岩浆只进 lavaCount,不截断
    if (!solidTileStrict(st, x, y)) {
      count++;
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
  }
  return count;
}

export class DeadMansChestBiome {
  private readonly st: TileStore;
  private readonly rng: RNG;
  private readonly gs: GenState;
  private readonly chestList: Array<{ x: number; y: number }>;
  private readonly darts: DartSpot[] = [];
  private readonly wires: WireSpot[] = [];
  private readonly boulders: BoulderSpot[] = [];
  private readonly explosives: Array<{ x: number; y: number }> = [];

  constructor(st: TileStore, rng: RNG, gs: GenState, chestList: Array<{ x: number; y: number }>) {
    this.st = st; this.rng = rng; this.gs = gs; this.chestList = chestList;
  }

  /** GetPossibleChestsToTrapify(cs:405-442):按 Main.chest 槽位序(=创建序)扫金箱
   *  (style 1)。本仓 chest sink(world.chests)即创建序——2026-08-17 前用栅格行扫描
   *  近似,候选集相同但**顺序不同**→Next(count) 选中的箱不同→陷阱屋整体错位。
   *  structures.CanPlace(1×1, 扩展白名单+21/467/138/664/712-715, pad 10)(cs:433):
   *  GeneralPlacementTiles 黑名单集剔除七类(本方法专有白名单扩展)。 */
  getPossibleChests(): Array<{ x: number; y: number }> {
    const st = this.st;
    const forbid = new Set(GENERAL_PLACEMENT_FORBID);
    for (const t of idsByVanillaSheet(21, 467, 138, 664, 712, 713, 714, 715)) forbid.delete(t);
    const out: Array<{ x: number; y: number }> = [];
    for (const ch of this.chestList) {
      const { x, y } = ch;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      // 金箱锚点:type 21 + style 1 + 2×2 左上角(frameX%36==0 且 /36==1 且 frameY==0)
      if (st.type[i] !== CHEST || st.frameY[i] !== 0 || st.frameX[i] % 36 !== 0
        || Math.trunc(st.frameX[i] / 36) !== 1) continue;
      if (!this.isAGoodSpot(x, y)) continue;
      this.clearCaches();
      const px = x, py = y + 1;
      this.findBoulderTrapSpots(px, py);
      this.findDartTrapSpots(px, py);
      if (this.areThereEnoughTraps()
        && canPlaceStructure(this.gs, { x0: x, y0: y, x1: x + 1, y1: y + 1 }, 10, st, forbid)) {
        out.push({ x, y });
      }
    }
    return out;
  }

  /** Place(cs:102-136) */
  place(ox: number, oy: number): boolean {
    if (!this.isAGoodSpot(ox, oy)) return false;
    this.clearCaches();
    const px = ox, py = oy + 1;   // position = origin + (0,1)
    this.findBoulderTrapSpots(px, py);
    this.findDartTrapSpots(px, py);
    this.findExplosiveTrapSpots(px, py);
    if (!this.areThereEnoughTraps()) return false;
    this.turnGoldChestIntoDeadMansChest(ox, oy);
    for (const d of this.darts) this.actuallyPlaceDartTrap(d);
    for (const w of this.wires) this.placeWireLine(w);
    for (const b of this.boulders) this.actuallyPlaceBoulderTrap(b);
    for (const e of this.explosives) this.actuallyPlaceExplosive(e);
    this.placeWiresForExplosives(ox, oy);
    return true;
  }

  /** PlaceWiresForExplosives(cs:138-161) */
  private placeWiresForExplosives(ox: number, oy: number): void {
    if (this.explosives.length <= 0) return;
    const first = this.explosives[0];
    this.wires.push({ x: ox, y: oy, dirX: 0, dirY: 1, steps: first.y - oy });
    let minX = first.x, maxX = first.x;
    for (let i = 1; i < this.explosives.length; i++) {
      const x = this.explosives[i].x;
      if (minX > x) minX = x;
      if (maxX < x) maxX = x;
    }
    this.wires.push({ x: minX, y: first.y, dirX: 1, dirY: 0, steps: maxX - minX });
    for (const w of this.wires) this.placeWireLine(w);
  }

  /** AreThereEnoughTraps(cs:163-170) */
  private areThereEnoughTraps(): boolean {
    if (this.boulders.length >= 1 || this.explosives.length >= 1) return this.darts.length >= 1;
    return false;
  }

  private clearCaches(): void {
    this.darts.length = 0;
    this.wires.length = 0;
    this.boulders.length = 0;
    this.explosives.length = 0;
  }

  /** FindBoulderTrapSpots(cs:180-220) */
  private findBoulderTrapSpots(px: number, py: number): void {
    const rng = this.rng;
    let x = px;
    const num = rng.int(2, 4);    // Next(_numberOfBoulderTraps = IntRange(2,4))
    const num2 = rng.int(2, 4);   // Next(_numberOfStepsBetweenBoulderTraps)
    x -= Math.trunc(num / 2) * num2;
    const num3 = py - 6;
    for (let i = 0; i <= num; i++) {
      this.findBoulderTrapSpot(x, num3);
      x += num2;
    }
    if (this.boulders.length <= 0) return;
    let minX = this.boulders[0].x, maxX = this.boulders[0].x;
    for (let j = 1; j < this.boulders.length; j++) {
      const bx = this.boulders[j].x;
      if (minX > bx) minX = bx;
      if (maxX < bx) maxX = bx;
    }
    if (minX > px) minX = px;
    if (maxX < px) maxX = px;
    this.wires.push({ x: minX, y: num3 - 1, dirX: 1, dirY: 0, steps: maxX - minX });
    this.wires.push({ x: px, y: py, dirX: 0, dirY: -1, steps: 7 });
  }

  /** FindBoulderTrapSpot(cs:222-234):向上找首个实心 */
  private findBoulderTrapSpot(x: number, y: number): void {
    for (let i = 0; i < 50; i++) {
      if (activeAt(this.st, x, y - i)) {
        this.placeBoulderTrapSpot(x, y - i, i);
        break;
      }
    }
  }

  /** PlaceBoulderTrapSpot(cs:236-290) */
  private placeBoulderTrapSpot(x: number, y: number, yPush: number): void {
    const st = this.st;
    const counts = new Map<number, number>();
    for (let i = x; i < x + 2; i++) {
      for (let j = y - 4; j <= y; j++) {
        if (!st.inBounds(i, j)) return;
        const idx = st.idx(i, j);
        const t = st.type[idx];
        if (st.flags[idx] && !TILE_DEFS[t]?.framed && !!TILE_DEFS[t]?.solid) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
        if ((st.flags[idx] && NOT_CLEARABLE.has(t)) || (st.flags[idx] && isContainer(t))) return;
      }
    }
    for (let k = x - 1; k < x + 3; k++) {
      for (let l = y - 5; l <= y - 2; l++) {
        if (!st.inBounds(k, l)) return;
        const idx = st.idx(k, l);
        if (!st.flags[idx] || isContainer(st.type[idx])) return;
      }
    }
    for (let m = x - 2; m <= x + 3; m++) {
      for (let n = y - 6; n <= y - 1; n++) {
        if (!st.inBounds(m, n)) continue;
        const idx = st.idx(m, n);
        if (st.flags[idx] && (isContainer(st.type[idx]) || BOULDER_FORBID.has(st.type[idx])
          || st.type[idx] === LIHARD || st.type[idx] === LIHARD_ALTAR)) return;
      }
    }
    let best = -1;
    // 原版按 type 升序扫全表取严格最大(cs:281-288)——平票取低 id,按 id 升序遍历对齐
    for (const t of [...counts.keys()].sort((a, b) => a - b)) {
      if (best === -1 || (counts.get(best) ?? 0) < (counts.get(t) ?? 0)) best = t;
    }
    // 原版全零计数时 num6 收敛到 0(泥土)——本仓 tile id 空间不同,取 DIRT 兜底
    this.boulders.push({ x, y, yPush: yPush - 1, bestType: best < 0 ? DIRT : best });
  }

  /** FindDartTrapSpots(cs:292-308) */
  private findDartTrapSpots(px: number, py: number): void {
    const rng = this.rng;
    const num = rng.int(3, 6);    // Next(_numberOfDartTraps = IntRange(3,6))
    let dirX = rng.int(0, 1) !== 0 ? 1 : -1;   // Next(2) != 0 ? 1 : -1
    let steps = -1;
    let y = py;
    for (let i = 0; i < num; i++) {
      const found = this.findDartTrapSpotSingle(px, y, dirX);
      dirX *= -1;
      y--;
      if (found) steps = i;
    }
    this.wires.push({ x: px, y: y + num, dirX: 0, dirY: -1, steps });
  }

  /** FindDartTrapSpotSingle(cs:310-328) */
  private findDartTrapSpotSingle(px: number, py: number, directionX: number): boolean {
    const st = this.st;
    for (let i = 0; i < 20; i++) {
      const x = px + i * directionX;
      if (!st.inBounds(x, py)) return false;
      const idx = st.idx(x, py);
      const t = st.type[idx];
      const active = st.flags[idx] !== 0;
      // 非容器 && 实心 → 5 格外且可清 → 飞镖锚点;否则失败
      if (!(active && isContainer(t)) && active && !!TILE_DEFS[t]?.solid) {
        if (i >= 5 && (st.wire[idx] & WIRE_ACTUATOR) === 0 && !TILE_DEFS[t]?.framed
          && !NOT_CLEARABLE.has(t)) {
          this.darts.push({ x: px, y: py, directionX, xPush: i, trapX: x, trapY: py });
          return true;
        }
        return false;
      }
    }
    return false;
  }

  /** FindExplosiveTrapSpots(cs:330-389)。注意第三批候选不清空 list(原版如此,cs:364-376) */
  private findExplosiveTrapSpots(px: number, py: number): void {
    const rng = this.rng;
    let x = px;
    const y = py + 3;
    let list: number[] = [];
    if (this.isGoodSpotForExplosive(x, y)) list.push(x);
    x++;
    if (this.isGoodSpotForExplosive(x, y)) list.push(x);
    let num = -1;
    if (list.length > 0) num = list[rng.int(0, list.length - 1)];
    list = [];
    x += rng.int(2, 5);            // Next(2, 6)
    const span = 4;                // num2
    for (let i = x; i < x + span; i++) {
      if (this.isGoodSpotForExplosive(i, y)) list.push(i);
    }
    let num3 = -1;
    if (list.length > 0) num3 = list[rng.int(0, list.length - 1)];
    x = px - span - rng.int(2, 5);
    for (let j = x; j < x + span; j++) {
      if (this.isGoodSpotForExplosive(j, y)) list.push(j);   // ← 不清空(原版 cs:364-369)
    }
    let num4 = -1;
    if (list.length > 0) num4 = list[rng.int(0, list.length - 1)];
    if (num4 !== -1) this.explosives.push({ x: num4, y });
    if (num !== -1) this.explosives.push({ x: num, y });
    if (num3 !== -1) this.explosives.push({ x: num3, y });
  }

  /** IsGoodSpotsForExplosive(cs:391-403):实心非框架非单向面地板 */
  private isGoodSpotForExplosive(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const idx = st.idx(x, y);
    const t = st.type[idx];
    if (st.flags[idx] && isContainer(t)) return false;
    if (st.flags[idx] && !!TILE_DEFS[t]?.solid && !TILE_DEFS[t]?.framed
      && !TILE_DEFS[t]?.platform) return true;
    return false;
  }

  /** IsAGoodSpot(cs:444-477) */
  private isAGoodSpot(x: number, y: number): boolean {
    const st = this.st;
    if (!(x >= 50 && y >= 50 && x < st.w - 50 && y < st.h - 50)) return false;  // InWorld(50)
    // oceanDepths(cs:10978):y ≤ oceanLevel 且海滩带
    const oceanLevel = (this.gs.worldSurface + this.gs.rockLevel) / 2 + 40;
    if (y <= oceanLevel && (x < this.gs.beachDistance || x > st.w - this.gs.beachDistance)) return false;
    const idx = st.idx(x, y);
    if (st.type[idx] !== CHEST) return false;
    if (Math.trunc(st.frameX[idx] / 36) !== 1) return false;
    const below = st.idx(x, y + 2);
    if (NOT_CLEARABLE.has(st.type[below])) return false;   // CanBeClearedDuringGeneration
    if (countWires(st, x, y, 20) > 0) return false;
    if (countTiles(st, x, y) < 40) return false;
    return true;
  }

  /** TurnGoldChestIntoDeadMansChest(cs:479-514) */
  private turnGoldChestIntoDeadMansChest(x: number, y: number): void {
    const st = this.st;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        const idx = st.idx(x + i, y + j);
        st.type[idx] = CHEST2;
        st.frameX[idx] = 144 + i * 18;
        st.frameY[idx] = j * 18;
      }
    }
    // 1/3 战利品前插(Item 5007):掷骰保留(1 次 Next(3));本 pass 无 chest sink,写入跳过
    this.rng.int(0, 2);
  }

  /** ActuallyPlaceDartTrap(cs:516-532) */
  private actuallyPlaceDartTrap(d: DartSpot): void {
    const st = this.st;
    const idx = st.idx(d.trapX, d.trapY);
    st.type[idx] = DART_TRAP;
    st.flags[idx] = 1;
    st.frameX[idx] = d.directionX === -1 ? 18 : 0;
    st.frameY[idx] = 0;
    st.slope[idx] = 0;
    st.half[idx] = 0;
    // cs:532 WorldGen.TileFrame(x, y, resetFrame:true)——137 无 frame 分派（零掷），
    // 但经 tileFrameGen 全分派以对齐未来 Check* 级联语义（UUUU）
    genTileFrame(st, this.rng, d.trapX, d.trapY);
    this.placeWireLine({ x: d.x, y: d.y, dirX: d.directionX, dirY: 0, steps: d.xPush });
  }

  /** PlaceWireLine(cs:534-540):0..steps 含端点 */
  private placeWireLine(w: WireSpot): void {
    const st = this.st;
    for (let i = 0; i <= w.steps; i++) {
      const x = w.x + w.dirX * i, y = w.y + w.dirY * i;
      if (st.inBounds(x, y)) st.wire[st.idx(x, y)] |= WIRE_RED;
    }
  }

  /** ActuallyPlaceBoulderTrap(cs:542-609) */
  private actuallyPlaceBoulderTrap(b: BoulderSpot): void {
    const st = this.st;
    const requiredHeight = 4;   // requiredHeight 恒 4(cs:289)
    for (let i = b.x; i < b.x + 2; i++) {
      for (let j = b.y - requiredHeight; j <= b.y + 2; j++) {
        if (!st.inBounds(i, j)) continue;
        const idx = st.idx(i, j);
        if (j < b.y - requiredHeight + 2) {
          st.setTileSilent(i, j, 0);                       // ClearTile
        } else if (j <= b.y) {
          // ★cs:549-566 do-while：TileFrame(resetFrame:true) 至少一跑，格被帧杀
          //   （如 184 苔藓无邻 → 杀）则补 bestType 复位再跑一次后 break。UUUU：
          //   曾单趟无 TileFrame——每苔藓格漏 1×Next(3)（cs:85916 无条件掷）→
          //   DeadMans 第 5 轮 Place 后 4 掷差（TTTT 记账的"resetFrame 债"真源）
          let flag = false;
          do {
            if (!st.flags[idx]) {
              st.type[idx] = b.bestType;
              st.flags[idx] = 1;
            }
            st.slope[idx] = 0;
            st.half[idx] = 0;
            genTileFrame(st, this.rng, i, j);
            if (flag) break;
            flag = true;
          } while (!st.flags[idx]);
          st.wire[idx] |= WIRE_RED;
          if (vanGenSolidType(st.type[idx]!)) st.wire[idx] |= WIRE_ACTUATOR;
        } else {
          st.setTileSilent(i, j, 0);                       // ClearTile
        }
      }
    }
    // 6×6 石壳(cs:585-606):非巨石格 → 石头;带**红线**格补致动器
    //   ★XXXX：原版 tile2.wire() 只读 wire1(红)——曾 `& 15` 任何线都致动(蓝/绿/黄
    //   线格被误致动 → 下游 SolidTile 门翻转,span 对拍 @33751 (2430,920) 定罪);
    //   惰性格也参与转化(原版无 active 门,曾 `continue` 跳过)
    const cx = b.x + 1, cy = b.y - requiredHeight + 1;
    for (let k = cx - 3; k <= cx + 2; k++) {
      for (let l = cy - 3; l <= cy + 2; l++) {
        if (!st.inBounds(k, l)) continue;
        const idx = st.idx(k, l);
        if (!BOULDER_TILES.has(st.type[idx]!)) {
          st.type[idx] = STONE;
          if (st.wire[idx]! & WIRE_RED) st.wire[idx] |= WIRE_ACTUATOR;
        }
      }
    }
    // PlaceTile(cx, cy, 138)(cs:607)→Place2x2 右下锚+双门（cs:51352-51445）
    //   ★CCCCC 修正：曾按左上锚写 (cx..cx+1)×(cy..cy+1)——整块 (+1,+1) 偏移：
    //   #101 .fr (826,742)(832,743)(828,745) 三格 g=18,18 vs j=0,0 = 三块 DeadMans
    //   巨石底右格错位实证（AAAAA 归因引擎 case 138 未派发 Check2x2——实为落块锚
    //   差；138/411 的引擎派发已在本批 FinalCleanupPass 侧同补）。Tiles_138 36×38
    //   单变体四格分片帧（2026-08-13 只写锚定格修复保持）。
    place2x2Direct(st, cx, cy, BOULDER);
    // ★CCCCC：PlaceTile(138) 尾 SquareTileFrame(cx, cy)（cs:60284）——锚格 active
    //   时（Place2x2 写入含锚格）。SQ 织入：van PT138 后恒一 SQ（22 例 SQ×1），
    //   九宫 184 苔藓随访随掷（如 (3650,387) 后 TF184(3661,379)×2 级联实证）
    if (st.inBounds(cx, cy) && st.flags[st.idx(cx, cy)]) {
      genSquareTileFrame(st, this.rng, cx, cy);
    }
    this.placeWireLine({ x: b.x, y: b.y, dirX: 0, dirY: 1, steps: b.yPush });
  }

  /** ActuallyPlaceExplosive(cs:611-619) */
  private actuallyPlaceExplosive(e: { x: number; y: number }): void {
    const st = this.st;
    if (!st.inBounds(e.x, e.y)) return;
    const idx = st.idx(e.x, e.y);
    st.type[idx] = EXPLOSIVES;
    st.flags[idx] = 1;
    st.frameX[idx] = 0;
    st.frameY[idx] = 0;
    st.slope[idx] = 0;
    st.half[idx] = 0;
    genTileFrame(st, this.rng, e.x, e.y);   // cs:617 TileFrame(resetFrame:true)
  }
}

// ============================================================
// 2. ThinIceBiome(Terraria.GameContent.Biomes/ThinIceBiome.cs 全文)
// ============================================================

/** ThinIceBiome.Place(cs:9-34):雪原水面上 BreakableIce 162 斑 */
export function placeThinIcePatch(
  st: TileStore, rng: RNG, gs: GenState, ox: number, oy: number,
): boolean {
  // TileScanner 50×50(cs:11-12,origin-25 起):0/1/59/147/225 计数
  let dirtStone = 0, mud = 0, snow = 0, hive = 0;
  for (let dx = 0; dx < 50; dx++) {
    for (let dy = 0; dy < 50; dy++) {
      const x = ox - 25 + dx, y = oy - 25 + dy;
      if (!st.inBounds(x, y)) continue;
      const idx = st.idx(x, y);
      if (!st.flags[idx]) continue;
      const t = st.type[idx];
      if (t === DIRT || t === STONE) dirtStone++;
      else if (t === MUD) mud++;
      else if (t === SNOW_BLOCK) snow++;
      else if (t === HIVE) hive++;
    }
  }
  if (hive > 0) return false;                    // cs:16-18
  if (snow <= mud || snow <= dirtStone) return false;   // cs:19-22
  let num4 = 0;
  // for (num5 = Next(10,15); num5 > 5; num5--)(cs:24-31)
  for (let num5 = rng.int(10, 14); num5 > 5; num5--) {
    const num6 = rng.int(-5, 4);                 // Next(-5, 5)
    const cx = ox + num6, cy = oy + num4;
    // Gen 1:Circle(num5) + Blotches(4) + OnlyTiles(147,161,224,0,1) → SetTile(162)
    forEachCircleCell(st, cx, cy, num5, rng, 4, (x, y) => {
      const idx = st.idx(x, y);
      if (!st.flags[idx] || !ICE_SRC.has(st.type[idx])) return;
      setThinIce(st, rng, x, y);
    });
    // Gen 2:Circle(num5) + Blotches(4) + HasLiquid + SkipTiles(21,467,226,237)
    //        → SetTile(162) + SetLiquid(0,0)
    forEachCircleCell(st, cx, cy, num5, rng, 4, (x, y) => {
      const idx = st.idx(x, y);
      if (st.liquid[idx] === 0) return;          // HasLiquid
      if (st.flags[idx] && ICE_SKIP.has(st.type[idx])) return;   // SkipTiles
      setThinIce(st, rng, x, y);                 // SetTile 内含 SetLiquid 前的 Clear
    });
    num4 += num5 - 2;
  }
  // structures.AddStructure((ox-25, oy-25, 50, 50), 8)(cs:32)——★原版是
  // AddStructure（StructureMap.cs:72-79,只入 _structures 不入 _protectedStructures,
  // **不参与 CanPlace 互斥**,仅 GetBoundingBox 消费）。XXXX：曾"为保持局部互斥
  // 行为"登记进全局保护图（pad 0 备案偏差）——span 对拍 @92722 实证该偏差真伤：
  // 薄冰斑 (1125,691) 的保护矩形挡掉了原版放行的 MiningExplosives try
  // (1082→1102,711)（van 一路 'a 3' 矿板帧掷 vs js 直接下一 try）。撤登记。
  return true;
}

/** Shapes.Circle(Shapes.cs:33-49) 行主序 + Modifiers.Blotches(Modifiers.cs:89-137)。
 *  Blotches(scale):先掷 1 次 NextDouble 丢弃,再判 chance=0.3;< 0.3 时掷 4 次
 *  Next 得 blotch 矩形(x∈[-3,0]..[0,3] × y 同),否则单格 */
function forEachCircleCell(
  st: TileStore, cx: number, cy: number, radius: number, rng: RNG, _scale: number,
  apply: (x: number, y: number) => void,
): void {
  void _scale;   // Blotches 尺度恒 4(ThinIceBiome 固定传参)
  const rr = (radius + 1) * (radius + 1);
  for (let dy = -radius; dy <= radius; dy++) {
    const num2 = (radius / radius) * dy;   // horizontalRadius == verticalRadius
    const half = Math.min(radius, Math.trunc(Math.sqrt(rr - num2 * num2)));
    for (let dx = -half; dx <= half; dx++) {
      rng.next();                          // Blotches.Apply 丢弃掷
      if (rng.next() < 0.3) {
        const bx0 = rng.int(-3, 0), bx1 = rng.int(0, 3);
        const by0 = rng.int(-3, 0), by1 = rng.int(0, 3);
        for (let bi = bx0; bi <= bx1; bi++) {
          for (let bj = by0; bj <= by1; bj++) {
            const x = cx + dx + bi, y = cy + dy + bj;
            if (st.inBounds(x, y)) apply(x, y);
          }
        }
      } else {
        const x = cx + dx, y = cy + dy;
        if (st.inBounds(x, y)) apply(x, y);
      }
    }
  }
}

/** Actions.SetTile(162, setSelfFrames)(Actions.cs:203-227):
 *  Clear(~(Wiring|Actuator)) = 清 tile/wall/liquid/帧/坡/半砖,保留线与致动位;
 *  生成期 TileFrame 对非 frameImportant 格无操作 → 帧落 0 */
/** Actions.SetTile(162, setSelfFrames:true)（Actions.cs:203）：Clear(~(Wiring|Actuator))
 *  + type/active + WorldUtils.TileFrame(x,y,true)（cs:79-92 = 中心+四邻五连
 *  TileFrame(resetFrame:true)——邻格 184 苔藓等 roll 族在此掷 Next(3)，UUUU 补） */
function setThinIce(st: TileStore, rng: RNG, x: number, y: number): void {
  const idx = st.idx(x, y);
  st.type[idx] = THIN_ICE;
  st.flags[idx] = 1;
  st.frameX[idx] = 0;
  st.frameY[idx] = 0;
  st.wall[idx] = 0;
  st.liquid[idx] = 0;
  st.liquidType[idx] = 0;
  st.half[idx] = 0;
  st.slope[idx] = 0;
  genFrameNeighbors(st, rng, x, y, 'setTile');
}

// ============================================================
// 2.5 EnchantedSwordBiome(Terraria.GameContent.Biomes/EnchantedSwordBiome.cs:19-111)
// ============================================================

/** Configuration.json「Biomes.EnchantedSwordBiome」(:33-38):
 *  ChanceOfEntrance 0.3333333(竖井 1/3)、ChanceOfRealSword 1.0。
 *  ★ChanceOfRealSword=1.0 为 1456 默认值(1405 交叉参照一致)——`NextDouble()<=1.0`
 *    恒真,假剑分支(tile 186 style15)默认配置下为死代码;按原版配置照抄,勿"修正" */
const SWORD_CHANCE_ENTRANCE = 0.3333333;
const SWORD_CHANCE_REAL = 1.0;

/** 相对坐标点集(≈Terraria.WorldBuilding/ShapeData)。XXXX 裁决：.NET
 *  HashSet<Point16> 枚举序=槽分配序——Add-only ≡ 插入序；Subtract(仅 Remove，
 *  之后无 Add)后 ≡ 幸存者插入序。JS Set 插入序+delete 保序逐位等价（见文件头
 *  裁决注），旧"不可移植"豁免撤销 */
class ShrineShape {
  private readonly s = new Set<number>();
  private static key(dx: number, dy: number): number { return (dy + 256) * 1024 + (dx + 256); }
  add(dx: number, dy: number): void { this.s.add(ShrineShape.key(dx, dy)); }
  has(dx: number, dy: number): boolean { return this.s.has(ShrineShape.key(dx, dy)); }
  remove(dx: number, dy: number): void { this.s.delete(ShrineShape.key(dx, dy)); }
  each(fn: (dx: number, dy: number) => void): void {
    for (const k of this.s) fn((k % 1024) - 256, Math.trunc(k / 1024) - 256);
  }
}

/** Modifiers.Blotches.Apply(Modifiers.cs:123-142):先掷 1 次 NextDouble 丢弃,再判
 *  chance;命中四连掷 blotch 矩形 x[1-minX,0]..[0,maxX-1] × y[1-minY,0]..[0,maxY-1],
 *  未命中退化为单格。输出绝对坐标点列 */
function shrineBlotches(
  rng: RNG, x: number, y: number,
  minX: number, maxX: number, minY: number, maxY: number, chance: number,
  out: Array<[number, number]>,
): void {
  rng.next();                                    // Blotches.Apply 首掷丢弃
  out.length = 0;
  if (rng.next() < chance) {
    const x0 = rng.int(1 - minX, 0);             // Next(1-_minX, 1)
    const x1 = rng.int(0, maxX - 1);             // Next(0, _maxX)
    const y0 = rng.int(1 - minY, 0);             // Next(1-_minY, 1)
    const y1 = rng.int(0, maxY - 1);             // Next(0, _maxY)
    for (let i = x0; i <= x1; i++) {
      for (let j = y0; j <= y1; j++) out.push([x + i, y + j]);
    }
  } else {
    out.push([x, y]);
  }
}

/** StructureMap.CanPlace(StructureMap.cs:22-53):区域在界内(留 1 格边距) +
 *  padding 扩张后不撞已保护结构 + 扩张区内活性 tile 全在白名单。
 *  EnchantedSwordBiome.cs:63-74 的表 = GeneralPlacementTiles 克隆再剔 21/467
 *  （两者本就在 28 id 黑名单内,冗余重申）→ 与 StructureMap 单参默认重载等价,
 *  直接走 canPlaceStructure(st) 的 GeneralPlacementTiles 扫描。 */
function shrineCanPlace(st: TileStore, gs: GenState, area: Rect, padding: number): boolean {
  return canPlaceStructure(gs, area, padding, st);
}

/** EnchantedSwordBiome.Place(cs:19-111)1:1:水潭洞穴 + 中央土丘 + 内缘草 + 花墙藤蔓 +
 *  1/3 竖井 + 土丘剑。洞穴中心 = 种子点**下方** 20 格(cs:58)——旧实现放上方 10-20,
 *  整体形状上下颠倒(根因) */
function placeEnchantedSwordShrine(
  st: TileStore, rng: RNG, gs: GenState, ox: number, oy: number,
): boolean {
  // ① 50×50 泥+石计数门(cs:24-30):TileScanner(0,1) 之和 < 1250 → 拒(errorWorld 625 不建模)
  let dirtStone = 0;
  for (let dx = 0; dx < 50; dx++) {
    for (let dy = 0; dy < 50; dy++) {
      const x = ox - 25 + dx, y = oy - 25 + dy;
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      if (st.type[i] === DIRT || st.type[i] === STONE) dirtStone++;
    }
  }
  if (dirtStone < 1250) return false;
  // ② origin.Y > 55(cs:34-36)
  const num2 = 55;
  if (oy <= num2) return false;
  // ③ Up(num3) 搜索(cs:38-49):IsSolid().AreaOr(1,num4).Not() = 首个
  //   "1×num4 竖条内无实心"的行(向上数);未命中或 result.Y <= 55 → 拒
  //   IsSolid 条件=Conditions.IsSolid(InWorld(10)+active+生成期 tileSolid)
  const num3 = oy - num2;
  const num4 = Math.min(50, num3);
  let resultY = -1;
  for (let i = 0; i < num3; i++) {
    let solid = false;
    for (let j = 0; j < num4; j++) {
      if (condIsSolid(st, ox, oy - i + j)) { solid = true; break; }
    }
    if (!solid) { resultY = oy - i; break; }
  }
  if (resultY < 0 || resultY <= num2) return false;
  // ④ 沙列检查(cs:51-53):origin 向上 origin.Y-result.Y 行内列上有沙 53 → 拒(避开沙漠)
  for (let i = 0; i < oy - resultY; i++) {
    const y = oy - i;
    if (!st.inBounds(ox, y)) continue;
    const ii = st.idx(ox, y);
    if (st.flags[ii] && st.type[ii] === SAND) return false;
  }
  resultY += 50;   // cs:55(竖井底锚下移 50)
  // ⑤ 洞穴/土丘中心(cs:58-59):均在种子点下方
  const pointX = ox, pointY = oy + 20;
  const point2X = ox, point2Y = oy + 30;
  // ⑥ num5 = 0.8 + NextDouble()*0.5(cs:65)——在 canPlace 之前掷
  const num5 = 0.8 + rng.next() * 0.5;
  // ⑦ structures.CanPlace ×2(cs:66-73):洞穴盒(pad 0)+ 竖井盒(pad 2)
  const rect1: Rect = {
    x0: pointX - Math.trunc(20 * num5), y0: pointY - 20,
    x1: pointX - Math.trunc(20 * num5) + Math.trunc(40 * num5), y1: pointY + 20,
  };
  if (!shrineCanPlace(st, gs, rect1, 0)) return false;
  const rect2: Rect = { x0: ox, y0: resultY + 10, x1: ox + 1, y1: resultY + 10 + (oy - resultY - 9) };
  if (!shrineCanPlace(st, gs, rect2, 2)) return false;

  const blot: Array<[number, number]> = [];
  // ⑧ 洞穴(cs:75):Slime(20, num5, 1.0) + Blotches(2, 0.4) + ClearTile → shapeData
  //   ClearTile(Tile.cs:153-158)= 清坡/半砖 + active(false),**不清液体与墙**
  const cave = new ShrineShape();
  const slimeRows: Array<[number, number]> = [];
  for (let dy = -20; dy <= 0; dy++) {          // Shapes.Slime 上半(Shapes.cs:137-152)
    slimeRows.push([dy, Math.trunc(Math.min(20 * num5, num5 * Math.sqrt(441 - dy * dy)))]);
  }
  for (let k = 1; k <= Math.trunc(20 * 0.5) - 1; k++) {   // 下半(:153-165,yScale=1)
    const d2 = k * 2;
    slimeRows.push([k, Math.trunc(Math.min(20 * num5, num5 * Math.sqrt(441 - d2 * d2)))]);
  }
  for (const [dy, half] of slimeRows) {
    for (let dx = -half; dx <= half; dx++) {
      shrineBlotches(rng, pointX + dx, pointY + dy, 2, 2, 2, 2, 0.4, blot);
      for (const [px, py] of blot) {
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        st.flags[i] = 0; st.slope[i] = 0; st.half[i] = 0;   // ClearTile
        st.wire[i] &= ~WIRE_ACTUATOR;                       // +inActive(false)(Tile.cs:153)
        // ★BBBBBB：ClearTile(frameNeighbors:true) 尾帧（WorldUtils.cs ClearTile →
        //   四邻 TileFrame(resetFrame 默认 false)——184 苔藓邻格**每访恒掷**
        //   Next(3)；22222 全序列对拍剑冢段 van 侧 2241 个 b0,3 缺失的主源之一）
        genFrameNeighbors(st, rng, px, py, 'clearTile');
        cave.add(px - pointX, py - pointY);                 // Output(shapeData)
      }
    }
  }
  // ⑨ 土丘(cs:76):Mound(14,14) + Blotches(2,1,0.8) + SetTile(0) → shapeData2
  //   SetTile(Actions.cs:221-231)= Clear(~(Wiring|Actuator))(连墙带液全清)+ type + active
  const mound = new ShrineShape();
  for (let i = -14; i <= 14; i++) {
    // Shapes.Mound(Shapes.cs:331-350):num2 = min(14, (int)(-(15/196)*(i+14)*(i-14)))
    const col = Math.min(14, Math.trunc((0 - 15 / 196) * (i + 14) * (i - 14)));
    for (let j = 0; j < col; j++) {
      shrineBlotches(rng, point2X + i, point2Y - j, 2, 2, 1, 1, 0.8, blot);
      for (const [px, py] of blot) {
        if (!st.inBounds(px, py)) continue;
        const i2 = st.idx(px, py);
        st.type[i2] = DIRT; st.flags[i2] = 1;               // SetTile(0)
        st.wall[i2] = 0; st.liquid[i2] = 0; st.liquidType[i2] = 0;
        st.frameX[i2] = 0; st.frameY[i2] = 0; st.slope[i2] = 0; st.half[i2] = 0;
        // ★BBBBBB：链尾 SetFrames(frameNeighbors:true)（cs:76→WorldUtils.TileFrame
        //   五连 resetFrame=true）——184 邻格每访恒掷 + 中心苔藓格掷
        genFrameNeighbors(st, rng, px, py, 'setTile');
        mound.add(px - point2X, py - point2Y);
      }
    }
  }
  // ⑩ shapeData.Subtract(shapeData2, point, point2)(cs:77)——土丘格从洞穴形状剔除
  mound.each((dx, dy) => cave.remove(dx + (point2X - pointX), dy + (point2Y - pointY)));
  // ⑪ InnerOutline 铺草(cs:78):8 邻域任一不在形状内 → 草(ModShapes.cs:88-117)
  const OUTLINE_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  const outline: Array<[number, number]> = [];
  cave.each((dx, dy) => {
    for (const [ax, ay] of OUTLINE_OFFSETS) {
      if (!cave.has(dx + ax, dy + ay)) { outline.push([dx, dy]); return; }
    }
  });
  for (const [dx, dy] of outline) {
    const px = pointX + dx, py = pointY + dy;
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    st.type[i] = GRASS; st.flags[i] = 1;                    // SetTile(2)
    st.frameX[i] = 0; st.frameY[i] = 0; st.slope[i] = 0; st.half[i] = 0;
    // ★BBBBBB：SetFrames(frameNeighbors:true) 五连（cs:78）——同 ⑨ 补掷
    genFrameNeighbors(st, rng, px, py, 'setTile');
  }
  // ⑫ 灌水(cs:79):RectangleMask(-40,40,0,40) + IsEmpty + SetLiquid()(默认 水/满)
  //   ——SetLiquid(Actions.cs:int type=0, byte value=255)= 全水。旧实现以为"排水",
  //     实为灌满水潭(Parameters 默认值坑)
  cave.each((dx, dy) => {
    if (dx < -40 || dx > 40 || dy < 0 || dy > 40) return;   // RectangleMask(含端点)
    const px = pointX + dx, py = pointY + dy;
    if (!st.inBounds(px, py)) return;
    const i = st.idx(px, py);
    if (st.flags[i]) return;                                // IsEmpty
    st.liquid[i] = 255; st.liquidType[i] = LIQUID_TYPE.WATER;   // +1 编码:水=1
  });
  // ⑬ 花墙 68 + 藤蔓(cs:80):Chain(PlaceWall(68), OnlyTiles(2), Offset(0,1),
  //    ActionVines)——★BBBBBB：**同一格流内顺序执行**(每格 PlaceWall→门→vines)，
  //    曾拆两个 each=先全墙后全藤，vines 长度掷(int(3,5))与墙帧掷(Next(0,3))交错
  //    序错位(22222 全序列 #84078 van=b3,6 vs js=b0,3 定谳)
  cave.each((dx, dy) => {
    const px = pointX + dx, py = pointY + dy;
    if (!st.inBounds(px, py)) return;
    const i = st.idx(px, py);
    st.wall[i] = 68;                                        // PlaceWall(68, Flower Wall)
    // ★BBBBBB：PlaceWall.Apply 尾五连 SquareWallFrame（Actions.cs:516-531）——
    //   墙≠0 且非 wallLargeFrames 的中心格掷 Next(0,3)（wallFrameRollMB 掷侧）
    placeWallFrameRollsMB(st, rng, px, py);
    if (!st.flags[i] || st.type[i] !== GRASS) return;       // OnlyTiles(2) 门
    const vx = px, vy = py + 1;                             // Offset(0, 1)
    if (!st.inBounds(vx, vy)) return;
    // ActionVines(3,5,382):Next(3,6) 长度,向下逐格铺到活性格为止
    const len = rng.int(3, 5);
    for (let k = 0; k < len; k++) {
      if (!st.inBounds(vx, vy + k) || st.flags[st.idx(vx, vy + k)]) break;
      const vi = st.idx(vx, vy + k);
      st.type[vi] = FLOWER_VINES; st.flags[vi] = 1;
    }
  });
  // ⑭ 入口竖井(cs:82-87):ChanceOfEntrance 1/3;Rectangle(1,h)+Blotches(2,0.2)+
  //    SkipTiles(191,192)+ClearTile → Expand(1)+OnlyTiles(53)+SetTile(397)(沙硬化壳)
  if (rng.next() <= SWORD_CHANCE_ENTRANCE) {
    const shaft = new ShrineShape();
    const sy0 = resultY + 10;
    const syH = oy - resultY - 9;
    for (let j = 0; j < syH; j++) {                          // Shapes.Rectangle(1, h)
      shrineBlotches(rng, ox, sy0 + j, 2, 2, 2, 2, 0.2, blot);
      for (const [px, py] of blot) {
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        if (st.flags[i] && SHAFT_SKIP.has(st.type[i])) continue;   // SkipTiles(191,192)
        st.flags[i] = 0; st.slope[i] = 0; st.half[i] = 0;          // ClearTile
        st.wire[i] &= ~WIRE_ACTUATOR;                              // +inActive(false)(Tile.cs:153)
        shaft.add(px - ox, py - sy0);
      }
    }
    // Expand(1)+OnlyTiles(53)+SetTile(397):±1 邻域的沙 → 硬化沙(Modifiers.cs 各 Apply)
    shaft.each((dx, dy) => {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const px = ox + dx + i, py = sy0 + dy + j;
          if (!st.inBounds(px, py)) continue;
          const i2 = st.idx(px, py);
          if (!st.flags[i2] || st.type[i2] !== SAND) continue;     // OnlyTiles(53)
          st.type[i2] = HARDSAND_TILE;                             // SetTile(397)
          st.frameX[i2] = 0; st.frameY[i2] = 0;
          // ★BBBBBB：SetTile(397).Output(data)（cs:84）——硬化格并入 data（HashSet
          //   重复 add 无害，枚举序=槽序）
          shaft.add(dx + i, dy + j);
        }
      }
    });
    // ★BBBBBB：第二行 Gen（cs:86）= ModShapes.All(data) + SetFrames(frameNeighbors:
    //   true)——对 data 全集（清除格∪硬化格）五连 TileFrame（reset=true，184 每访
    //   恒掷 + 中心苔藓掷）
    shaft.each((dx, dy) => {
      const px = ox + dx, py = sy0 + dy;
      if (!st.inBounds(px, py)) return;
      genFrameNeighbors(st, rng, px, py, 'setTile');
    });
  }
  // ⑮ 土丘剑(cs:89-94):ChanceOfRealSword 门(默认 1.0 恒真→187 style17;
  //    否则 186 style15)。PlaceTile 锚 = (point2.X, point2.Y-15) 3×2 底行左锚
  const realSword = rng.next() <= SWORD_CHANCE_REAL;
  {
    // ★CCCCC：剑冢剑改走 PlaceTile case 186/187 全链（Place3x2 门+双 SquareTileFrame）
    //   ——曾裸写 3×2（门与帧全跳过）：Place3x2 区失活/地面门败时原版不落剑，
    //   JS 恒落；且 case 支恒调+尾两帧的九宫 184 掷全漏（EnchantedSwordBiome.cs:99-106）
    const swordTile = realSword ? DECOS_GROUP2 : LARGE_PILES;
    const swordStyle = realSword ? 17 : 15;
    const sx = point2X, sy = point2Y - 15;
    place3x2MB(st, rng, sx, sy, swordTile, swordStyle);
  }
  // ⑯ 土丘表面草(cs:96):Offset(0,-1)→OnlyTiles(2)→Offset(0,-1)→ActionGrass
  //    (ActionGrass.cs:14-22):目标格与上格皆空 → PlaceTile(SelectRandom{3,73})
  //    ★BBBBBB：PlaceTile 掷镜像（van PT 织入实测：SelectRandom=Next(2)；**仅
  //      type 3** 有 IsFitToPlaceFlowerIn→墙支掷 (Next(50)/Next(35)/NextFromList(14)
  //      /Next(6))——观测 (a50,a35,a14) 组=wall∈[63,70](⑬ 花墙 68)走 NextFromList；
  //      type 73/187 的 PlaceTile 内部零掷（IsFit 组不含 73；187 TileObjectData 支）
  mound.each((dx, dy) => {
    const gx = point2X + dx, gy = point2Y + dy - 1;          // 第一层 Offset(0,-1)
    if (!st.inBounds(gx, gy)) return;
    const gi = st.idx(gx, gy);
    if (!st.flags[gi] || st.type[gi] !== GRASS) return;      // OnlyTiles(2)
    const px = gx, py = gy - 1;                              // 第二层 Offset(0,-1)
    if (!st.inBounds(px, py) || !st.inBounds(px, py - 1)) return;
    const pi = st.idx(px, py);
    if (st.flags[pi] || st.flags[st.idx(px, py - 1)]) return;
    const pickShort = rng.nextInt(2) === 0;                  // Utils.SelectRandom{3,73}
    let frameX = 0;
    if (pickShort) {
      // PlaceTile(3) 分支掷（cs:59517-59600）——IsFitToPlaceFlowerIn(3) 地面
      //      {2,78,380,477,579}（cs:58247）+ 墙支 AllowsPlantsToGrow 双侧门
      const bi = st.idx(px, py + 1);
      const belowOk = st.flags[bi] !== 0 && st.slope[bi] === 0 && st.half[bi] === 0
        && PLANT_GROUND_3.has(st.type[bi]!);
      const liq = st.liquid[pi]! > 0;                        // cs:59489 液体格拒 3
      if (belowOk && !liq) {
        const wl = st.wall[pi]!, wl2 = st.wall[bi]!;
        if (PLANT_WALLS.has(wl) && PLANT_WALLS.has(wl2)) {
          if (rng.nextInt(50) === 0) {
            frameX = 144;                                    // 磨菇变体（cs:59569-77）
          } else if (rng.nextInt(35) === 0 || (wl >= 63 && wl <= 70)) {
            frameX = GRASS_STYLE_LIST[rng.nextInt(GRASS_STYLE_LIST.length)]! * 18;
          } else {
            frameX = rng.nextInt(6) * 18;
          }
        }
      }
    }
    st.setTileSilent(px, py, pickShort ? SHORT_PLANTS : TALL_PLANTS, frameX, 0);
  });
  // ⑰ structures.AddProtectedStructure(rectangle, 10)(cs:98/EnchantedSwordBiome.cs:110)
  //   ——pad 10 入全局保护图（GenState.protectedRects,addProtectedStructure 内部 Inflate）
  addProtectedStructure(gs, rect1, 10);
  return true;
}

// ============================================================
// 3. placeLavaTrap(WorldGen.cs:8648-8732;调用点 cs:22093-22127)
// ============================================================

/** placeLavaTrap 湖底/腔底实心门(cs:8677/8690/8715):active 且 type 过
 *  生成期 tileSolid 且非 tileSolidTop——无 half/slope/inActive 排除 */
function vanGenSolidSolidTopGate(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const t = st.type[st.idx(x, y)]!;
  return vanGenSolidType(t) && !TILE_DEFS[t]?.platform;
}

/** 地狱熔岩陷阱:岩浆湖底掏腔,湖底层致动石栅 + 压板 135 style7 + 红线。
 *  门禁:锚点须满格岩浆;11×11 内 ≥50 满岩浆格;±20 无红线;腔高 ≤40 且 ≥4 */
export function placeLavaTrap(st: TileStore, gs: GenState, x: number, y: number, rng0?: RNG): boolean {
  void gs;
  if (!st.inBounds(x, y)) return false;
  const num = 5, minLava = 50, maxDrop = 40, scanR = 20, minGap = 4;
  const i0 = st.idx(x, y);
  if (st.flags[i0] || st.liquid[i0] !== 255 || st.liquidType[i0] !== LIQUID_TYPE.LAVA) return false;
  let lavaCells = 0;
  for (let dx = -num; dx <= num; dx++) {
    for (let dy = -num; dy <= num; dy++) {
      if (!st.inBounds(x + dx, y + dy)) continue;
      const idx = st.idx(x + dx, y + dy);
      if (!st.flags[idx] && st.liquid[idx] === 255 && st.liquidType[idx] === LIQUID_TYPE.LAVA) lavaCells++;
    }
  }
  if (lavaCells < minLava) return false;
  // 下沉到岩浆湖底首个实心(cs:8666-8674)
  let num7 = y;
  for (;;) {
    if (activeAt(st, x, num7)) break;
    num7++;
    if (num7 > st.h - 200 || num7 >= st.h) return false;
  }
  // cs:8677:!tileSolid || tileSolidTop → 拒(生成期表;无 half/slope/inActive 排除)
  if (!vanGenSolidSolidTopGate(st, x, num7)) return false;
  const num8 = num7;
  // ±20 × ±20 无红线(cs:8681-8689)——原版只查 wire() 红线位,非四色
  for (let k = x - scanR; k <= x + scanR; k++) {
    for (let l = num7 - scanR; l <= num7 + scanR; l++) {
      if (st.inBounds(k, l) && (st.wire[st.idx(k, l)] & WIRE_RED) !== 0) return false;
    }
  }
  // 穿透湖底实心层(cs:8690-8696)
  while (activeAt(st, x, num7) && vanGenSolidSolidTopGate(st, x, num7)) {
    num7++;
    if (num7 > st.h - 200 || num7 >= st.h) return false;
  }
  const belowIdx = st.idx(x, num7 - 1);
  if (DUNGEON_TILES.has(st.type[belowIdx]) || st.type[belowIdx] === HIVE || st.type[belowIdx] === LIHARD) {
    return false;
  }
  // 腔顶下行到腔底实心(cs:8705-8714)
  const num9 = num7;
  for (;;) {
    if (activeAt(st, x, num7)) break;
    num7++;
    if (num7 > st.h - 200 || num7 >= st.h) return false;
    if (st.liquid[st.idx(x, num7)] > 0) return false;
  }
  const floorIdx = st.idx(x, num7);
  if (!vanGenSolidSolidTopGate(st, x, num7) || st.type[floorIdx] === THIN_ICE) return false;
  const num10 = num7 - 1;
  if (num10 - num8 > maxDrop) return false;
  if (num10 - num9 < minGap) return false;
  st.slope[floorIdx] = 0;
  st.half[floorIdx] = 0;
  // PlaceTile(x, num10, 135, style 7)(cs:8720)——style 在 frameY(126)。
  // FFFFF 补 PlaceTile 尾 SquareTileFrame(i,j)(cs:60282):九宫邻格 184 苔藓
  // 'a 3' 掷(#101 尾段掷流 4 掷差定罪;174 竖井石门板邻域实际掷点)
  // ★CCCCC：双帧——case135 支恒调（cs:60225-27）+ 尾（cs:60284）。SQ 织入：
  //   van PT135 后 SQ×2 ×31 + SQ×1 ×4（门败/非活性），曾单帧
  st.setTileSilent(x, num10, PLATE, 0, 126);
  genSquareTileFrame(st, rng0!, x, num10);
  genSquareTileFrame(st, rng0!, x, num10);
  // 线 + 致动石栅(cs:8721-8730):num8..num9-1 致动,num8..num10 红线
  for (let m = num8; m <= num10; m++) {
    if (!st.inBounds(x, m)) continue;
    const idx = st.idx(x, m);
    st.wire[idx] |= WIRE_RED;
    if (m < num9) {
      st.slope[idx] = 0;
      st.half[idx] = 0;
      st.wire[idx] |= WIRE_ACTUATOR;
    }
  }
  return true;
}
