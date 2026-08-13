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
//   5. TrackGenerator(cs:22014-22091,实现见 TrackPass.ts):长/标准矿轨 314。
//   6. placeLavaTrap(cs:22093-22127 调用 + :8648 实现):地狱熔岩陷阱——
//      岩浆湖底致动石栅 + 压板 135 style7 + 红线。w*0.02 次 × 10150 尝试。
// 已知偏差(注明):
//  - 无全局 StructureMap:仅本 pass 内部互斥保护(原版结构与全图其它结构共享保护图);
//    DeadMans 候选的 structures.CanPlace(GeneralPlacementTiles, pad 10)跳过
//  - Main.tileDungeon 用 dungeon 砖 tile 近似(41/43/44),容器用 chest 族 key 近似
//  - DeadMans 候选枚举用栅格扫描替代 Main.chest 下标序(候选集相同,掷骰总数一致)
//  - TurnGoldChestIntoDeadMansChest 的 1/3 战利品前插(Item 5007)无 chest sink,掷骰保留、
//    写入跳过
import { TileStore, LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { NOT_CLEARABLE, idsByVanillaSheet } from './TileRunner';
import { TrackGenerator } from './TrackPass';

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
/** Modifiers.SkipTiles(191,192):竖井挖穿活木/活木叶(EnchantedSwordBiome.cs:90) */
const SHAFT_SKIP = idsByVanillaSheet(191, 192);
/** TileID.Sets.GeneralPlacementTiles(TileID.cs:311)黑名单——CreateBoolSet(true, …)
 *  = 默认全 true、列出的 id 置 false;剑冢克隆后再剔 21/467(cs:63-64,本就在黑名单) */
const PLACEMENT_FORBID = idsByVanillaSheet(
  225, 41, 481, 43, 482, 44, 483, 226, 203, 112, 25, 70, 151, 21, 31, 696, 467,
  12, 665, 639, 138, 664, 711, 712, 713, 714, 715, 716,
);
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
/** TileID.Sets.IsAContainer(21,467,88)——chest/dresser 族 key 近似(沿用本文件既有约定) */
const isContainer = (t: number): boolean => {
  const key = TILE_DEFS[t]?.key ?? '';
  return key.includes('chest') || key.includes('dresser');
};
/** 原版 SolidTile(i,j)(WorldGen.cs:70155):active && tileSolid && !solidTop && !half && slope==0 */
function solidTileStrict(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  const d = TILE_DEFS[st.type[i]];
  return st.flags[i] !== 0 && !!d?.solid && !d.platform && st.half[i] === 0 && st.slope[i] === 0;
}

interface Rect { x0: number; y0: number; x1: number; y1: number }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export function runMicroBiomesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // Skyblock.denyAllGeneration 包裹整个 pass(cs:21787)——1.4.5.6 skyblock 种子全段跳过
  if (gs.seedFlags.skyblock) return;
  const { w, h } = st;
  const protectedRects: Rect[] = [];
  // WorldGenRange ScalingMode(WorldGenRange.cs:43-58):
  //   WorldArea = w*h/5040000;WorldWidth = w/4200;ScaleValue=(int)截断
  const areaScale = (w * h) / 5040000;
  const widthScale = w / 4200;
  const scW = (v: number): number => Math.trunc(widthScale * v);

  // ---- 1. Dead Man's Chests(cs:21801-21919 段 21801-21819)----
  {
    const deadMans = new DeadMansChestBiome(st, rng, gs);
    // GetPossibleChestsToTrapify 先于计数掷骰(cs:21806-21807)——每候选 4 掷
    const possible = deadMans.getPossibleChests();
    const deadCount = rng.int(scW(10), scW(20));   // DeadManChests 10-20 ×WorldWidth
    let done = 0;
    let guard = 3000;                              // num4
    while (done < deadCount && possible.length > 0) {
      if (--guard <= 0) break;
      const pick = rng.int(0, possible.length - 1);
      const c = possible[pick];
      deadMans.place(c.x, c.y);                    // 返回值原版丢弃(cs:21814)
      done++;
      possible.splice(pick, 1);
    }
  }

  // ---- 2. Thin Ice(cs:21825-21854)----
  if (!gs.seedFlags.notTheBees || gs.seedFlags.remix) {
    const iceCount = rng.int(scW(3), scW(5));      // ThinIcePatchCount 3-5 ×WorldWidth
    let iceDone = 0, iceFail = 0;
    const iceFailLimit = 1000;                     // num9
    while (iceDone < iceCount) {
      // RandomWorldPoint(worldSurface+20, 50, 200, 50)(cs:21836)
      const ox = rng.int(50, w - 51);
      const oy = rng.int(Math.floor(gs.worldSurface) + 20, h - 201);
      if (placeThinIcePatch(st, rng, protectedRects, ox, oy)) {
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
    for (let i = 0; i < swordAttempts; i++) {
      // !(NextDouble < SwordShrinePlacementChance 0.5) 才放置(cs:21886)——注意极性
      if (!(rng.next() < 0.5)) {
        // 重试 while (num15++ <= maxTilesX)(cs:21888):最多 w+1 次,掷序 Y→Next(2)→X
        for (let t = 0; t <= w; t++) {
          const oy = Math.floor(gs.worldSurface) + rng.int(50, 99);   // Next(50, 100)
          const ox = rng.int(0, 1) === 0                               // Next(2) == 0 → 左 30%
            ? rng.int(50, Math.floor(w * 0.3) - 1)                     // Next(50, w*0.3)
            : rng.int(Math.floor(w * 0.7), w - 51);                    // Next(w*0.7, w-50)
          if (placeEnchantedSwordShrine(st, rng, protectedRects, ox, oy)) break;
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
  while (placed < campCount) {
    if (++tries > 1000) break;
    const ox = rng.int(gs.beachDistance, w - gs.beachDistance - 1); // RandomWorldPoint(top,right,bottom,left)
    const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
    if (placeCampsite(st, rng, protectedRects, ox, oy)) placed++;
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
  while (placed < trapCount) {
    if (++tries > 3000) break;
    const ox = rng.int(gs.beachDistance, w - gs.beachDistance - 1);
    const oy = rng.int(Math.floor(gs.rockLevel), h - 201);
    if (placeMiningExplosives(st, rng, gs, protectedRects, ox, oy)) placed++;
  }

  // ---- 5. TrackGenerator(cs:22014-22091)----
  const trackGen = new TrackGenerator(st, gs);
  const trackFailLimit = Math.floor(w / 2);        // num25
  // 长轨:LongTrackCount 1-2 ×WorldWidth,长 400-1000 ×WorldWidth
  let trackCount = rng.int(scW(1), scW(2));
  let tDone = 0, tFail = 0;
  while (tDone < trackCount) {
    const ox = rng.int(10, w - 11);                // RandomWorldPoint(worldSurface, 10, 200, 10)
    const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
    if (trackGen.place(ox, oy, scW(400), scW(1000), rng)) {
      tDone++; tFail = 0;
    } else {
      tFail++;
      if (tFail > trackFailLimit) { tDone++; tFail = 0; }
    }
  }
  // 标准轨:StandardTrackCount 4-7 ×WorldArea,长 150-300 ×WorldWidth
  trackCount = rng.int(Math.max(1, Math.trunc(areaScale * 4)), Math.max(1, Math.trunc(areaScale * 7)));
  tDone = 0; tFail = 0;
  while (tDone < trackCount) {
    const ox = rng.int(10, w - 11);
    const oy = rng.int(Math.floor(gs.worldSurface), h - 201);
    if (trackGen.place(ox, oy, scW(150), scW(300), rng)) {
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
        if (placeLavaTrap(st, gs, x, y)) break;
      }
    }
  }
}

/** CampsiteBiome.Place(CampsiteBiome.cs:9-116) */
function placeCampsite(st: TileStore, rng: RNG, protectedRects: Rect[], ox: number, oy: number): boolean {
  // Circle(10):实心占比门禁(solid ≥ total-5,cs:12-17)
  {
    let total = 0, solid = 0;
    const r = 10, rr = (r + 1) * (r + 1);
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.min(r, Math.trunc(Math.sqrt(rr - dy * dy)));
      for (let dx = -half; dx <= half; dx++) {
        total++;
        if (solidAt(st, ox + dx, oy + dy)) solid++;
      }
    }
    if (solid < total - 5) return false;
  }
  const num = rng.int(6, 9);  // Next(6,10)
  const num2 = rng.int(1, 4); // Next(1,5)
  const rect: Rect = { x0: ox - num, y0: oy - num, x1: ox + num + 1, y1: oy + num + 1 };
  if (protectedRects.some((p) => overlaps(rect, p))) return false;
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
          data.add(py * st.w + px);
          if (!st.inBounds(px, py)) continue;
          const up = py - 2; // Modifiers.Offset(0,-2)
          if (st.inBounds(px, up)) {
            const ui = st.idx(px, up);
            if (st.flags[ui] && st.type[ui] === SAND) st.type[ui] = HARDSAND_TILE;
          }
          const pi = st.idx(px, py);
          if (st.wall[pi] === 0) st.wall[pi] = wallType;
        }
      }
    }
  }
  // All(data):ClearTile + SetLiquid(0,0) + 空墙刷墙(cs:69)
  for (const key of data) {
    const px = key % st.w, py = Math.trunc(key / st.w);
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    st.flags[i] = 0;
    st.liquid[i] = 0; st.liquidType[i] = 0;
    if (st.wall[i] === 0) st.wall[i] = wallType;
  }
  // 向下 10 格找地面(cs:70-74)
  let groundY = oy;
  {
    let found = false;
    for (let k = 0; k < 10 && !found; k++) {
      if (solidAt(st, ox, oy + k)) { groundY = oy + k; found = true; }
    }
    if (!found) return false;
  }
  const num4 = groundY - 1;
  // ★裸 Next() 的 int 取模位谓词(CampsiteBiome.cs:75 `Next() % 2 == 0`)——RNG.vanilla
  //   直通 UnifiedRandom.next()(= C# Next() 裸 int32)。曾译 `next()<0.5`(NextDouble
  //   高位)判定面同概率但逐种子结果不同,帐篷朝向/倒木/篝火三处连锁错位
  const flag = rng.vanilla.next() % 2 === 0;
  // 金币堆帐篷(cs:76-88,1/10 跳过)——`Next() % 10 != 0` 位谓词(cs:76)
  if (rng.vanilla.next() % 10 !== 0) {
    const num5 = rng.int(1, 3); // Next(1,4)
    const num6 = flag ? 4 : -Math.trunc(num / 2);
    for (let m = 0; m < num5; m++) {
      const num7 = rng.int(1, 2); // Next(1,3)
      for (let n = 0; n < num7; n++) {
        const px = ox + num6 - m, py = num4 - n;
        if (!st.inBounds(px, py)) continue;
        const i = st.idx(px, py);
        if (!st.flags[i] && solidAt(st, px, py + 1)) st.setTileSilent(px, py, COIN_PILE, 0, 0);
      }
    }
  }
  // 倒木 186(cs:89-93,1/10 跳过)——`Next() % 10 != 0` 位谓词(cs:90)
  const num8 = (num - 3) * (flag ? -1 : 1);
  if (rng.vanilla.next() % 10 !== 0) {
    const px = ox + num8;
    placeLargePile(st, px, num4);
  }
  // 篝火 215(cs:94-113,1/10 跳过;frameY+36 = 未点燃行)——`Next() % 10 != 0`(cs:94)
  if (rng.vanilla.next() % 10 !== 0) {
    let ok = true;
    for (let dx = 0; dx < 3 && ok; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        if (!st.inBounds(ox + dx, num4 + dy) || st.flags[st.idx(ox + dx, num4 + dy)]) ok = false;
      }
    }
    if (ok) {
      for (let dx = 0; dx < 3; dx++) {
        for (let dy = -1; dy <= 0; dy++) {
          st.setTileSilent(ox + dx, num4 + dy, CAMPFIRE, dx * 18, dy * 18 + 36);
        }
      }
    }
  }
  protectedRects.push(rect);
  return true;
}

/** tile 186 LargePiles 3×2(style 0 帧,PlaceTile 默认 style)。
 *  原版经 PlaceTile → case 186 的 SolidTileAllowBottomSlope 门（WorldGen.cs:49284）：
 *  地面须实心且非半砖非顶坡——斜坡格上不生成（与 pilesPass 同门） */
function placeLargePile(st: TileStore, x: number, y: number): void {
  for (let dx = 0; dx < 3; dx++) {
    if (!st.inBounds(x + dx, y)) return;
    const gi = st.idx(x + dx, y);
    if (!solidAt(st, x + dx, y)
      || st.half[gi] === 1 || (st.slope[gi] >= 1 && st.slope[gi] <= 2)) return;
  }
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      if (!st.inBounds(x + dx, y - 1 + dy)) continue;
      const i = st.idx(x + dx, y - 1 + dy);
      if (st.flags[i]) continue;
      st.setTileSilent(x + dx, y - 1 + dy, LARGE_PILES, dx * 18, dy * 18);
    }
  }
}

/** MiningExplosivesBiome.Place(MiningExplosivesBiome.cs:10-76) */
function placeMiningExplosives(st: TileStore, rng: RNG, gs: GenState, protectedRects: Rect[], ox: number, oy: number): boolean {
  if (solidAt(st, ox, oy)) return false;
  {
    const wl = st.inBounds(ox, oy) ? st.wall[st.idx(ox, oy)] : -1;
    if (wl === 216 || wl === 187) return false; // 地下沙漠墙门禁(cs:17-20)
  }
  const barType = [gs.oreTiers.gold, gs.oreTiers.silver, gs.oreTiers.iron, gs.oreTiers.copper][rng.int(0, 3)];
  const dir = rng.next() * 2 - 1; // cs:22
  // Find(origin, Right(40)|Left(40) 直到实心) → origin(MiningExplosivesBiome.cs:23-26)
  let x = ox, y = oy;
  {
    const step = dir > 0 ? 1 : -1;
    let found = false;
    for (let k = 0; k < 40 && !found; k++) {
      x += step;
      if (solidAt(st, x, y)) found = true;
    }
    if (!found) return false;
  }
  // Find(origin, Down(80) 直到实心)(cs:27-30)
  {
    let found = false;
    for (let k = 0; k < 80 && !found; k++) {
      y++;
      if (solidAt(st, x, y)) found = true;
    }
    if (!found) return false;
  }
  // ShapeRunner(10, 20, (dir,1)) + Blotches(2, 0.3):矿石地板形状(cs:31-38)
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
          // Blotches(2, 0.3)(Modifiers.cs:92-157)
          rng.next();
          const pts: Array<[number, number]> = [];
          if (rng.next() < 0.3) {
            const ox0 = rng.int(-1, 0), ox1 = rng.int(0, 1), oy0 = rng.int(-1, 0), oy1 = rng.int(0, 1);
            for (let bi = ox0; bi <= ox1; bi++) for (let bj = oy0; bj <= oy1; bj++) pts.push([i + bi, j + bj]);
          } else {
            pts.push([i, j]);
          }
          for (const [qx, qy] of pts) {
            data.add(qy * st.w + qx);
            total++;
            if (solidAt(st, qx, qy)) solid++;
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
  if (protectedRects.some((p) => overlaps(area, p))) return false;
  // 矿石地板(cs:44)
  for (const key of data) {
    const qx = key % st.w, qy = Math.trunc(key / st.w);
    if (!st.inBounds(qx, qy)) continue;
    const i = st.idx(qx, qy);
    st.type[i] = barType; st.flags[i] = 1;
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
          st.flags[i] = 0; // ClearTile(frameNeighbors)
        }
      }
    }
  }
  // 两侧落点向下 10 格找地面(cs:47-52)
  const findDown = (fx: number, fy: number): number => {
    for (let k = 0; k < 10; k++) {
      if (solidAt(st, fx, fy + k)) return fy + k;
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
  // 起爆器下方 3 列整平(cs:55-70)
  for (let i = -1; i <= 1; i++) {
    const px = detX + i, py = detTop;
    if (st.inBounds(px, py)) st.flags[st.idx(px, py)] = 0;
    const below = detTop + 1;
    if (st.inBounds(px, below) && !solidAt(st, px, below)) {
      st.type[st.idx(px, below)] = STONE; st.flags[st.idx(px, below)] = 1;
    }
  }
  // 炸药桶 141 + 起爆器 411(2×2)+ 红线直连(cs:71-73)
  if (st.inBounds(barX, barGround) && !st.flags[st.idx(barX, barGround)]) {
    st.setTileSilent(barX, barGround, EXPLOSIVES, 0, 0);
  }
  // 起爆器 411:PlaceTile(..., forced: true)(cs:72)——无视支撑/占位检查强制 2×2 落块
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      if (!st.inBounds(detX + dx, detTop + dy)) continue;
      st.setTileSilent(detX + dx, detTop + dy, DETONATOR, dx * 18, dy * 18);
    }
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
  protectedRects.push(area);
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
  private readonly darts: DartSpot[] = [];
  private readonly wires: WireSpot[] = [];
  private readonly boulders: BoulderSpot[] = [];
  private readonly explosives: Array<{ x: number; y: number }> = [];

  constructor(st: TileStore, rng: RNG, gs: GenState) {
    this.st = st; this.rng = rng; this.gs = gs;
  }

  /** GetPossibleChestsToTrapify(cs:405-442):全图金箱(style 1)扫描。
   *  原版按 Main.chest 下标序;此处栅格行扫描——候选集相同,每候选掷骰数一致(4),
   *  对后续全局 RNG 状态无影响。structures.CanPlace 检查无全局 StructureMap,跳过 */
  getPossibleChests(): Array<{ x: number; y: number }> {
    const st = this.st;
    const out: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        // 金箱锚点:type 21 + style 1 + 2×2 左上角(frameX%36==0 且 /36==1 且 frameY==0)。
        // 原版经 Main.chest 下标天然只有锚点;栅格扫描须自剔除非锚点格(右格 frameX=54)
        if (st.type[i] !== CHEST || st.frameY[i] !== 0 || st.frameX[i] % 36 !== 0
          || Math.trunc(st.frameX[i] / 36) !== 1) continue;
        if (!this.isAGoodSpot(x, y)) continue;
        this.clearCaches();
        const px = x, py = y + 1;
        this.findBoulderTrapSpots(px, py);
        this.findDartTrapSpots(px, py);
        if (this.areThereEnoughTraps()) out.push({ x, y });
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
          if (!st.flags[idx]) {
            st.type[idx] = b.bestType;
            st.flags[idx] = 1;
          }
          st.slope[idx] = 0;
          st.half[idx] = 0;
          st.wire[idx] |= WIRE_RED;
          if (TILE_DEFS[st.type[idx]]?.solid) st.wire[idx] |= WIRE_ACTUATOR;
        } else {
          st.setTileSilent(i, j, 0);                       // ClearTile
        }
      }
    }
    // 6×6 石壳(cs:585-606):非巨石格 → 石头;带线格补致动器
    const cx = b.x + 1, cy = b.y - requiredHeight + 1;
    for (let k = cx - 3; k <= cx + 2; k++) {
      for (let l = cy - 3; l <= cy + 2; l++) {
        if (!st.inBounds(k, l)) continue;
        const idx = st.idx(k, l);
        if (!st.flags[idx]) continue;   // 近似:仅活性格参与(原版对惰性格也写 type)
        if (!BOULDER_TILES.has(st.type[idx])) {
          st.type[idx] = STONE;
          if (st.wire[idx] & 15) st.wire[idx] |= WIRE_ACTUATOR;
        }
      }
    }
    // PlaceTile(cx, cy, 138):巨石(cs:607)——TileObjectData Style2x2 四格分片帧
    // (Tiles_138 36×38 单变体;此前只写锚定格 = 渲染只剩 18×18 小片,同 TrapsPass
    // "贴图不全"根因,2026-08-13)
    if (st.inBounds(cx, cy) && !st.flags[st.idx(cx, cy)]) {
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          if (st.inBounds(cx + dx, cy + dy)) st.setTileSilent(cx + dx, cy + dy, BOULDER, dx * 18, dy * 18);
        }
      }
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
  }
}

// ============================================================
// 2. ThinIceBiome(Terraria.GameContent.Biomes/ThinIceBiome.cs 全文)
// ============================================================

/** ThinIceBiome.Place(cs:9-34):雪原水面上 BreakableIce 162 斑 */
export function placeThinIcePatch(
  st: TileStore, rng: RNG, protectedRects: Rect[], ox: number, oy: number,
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
      setThinIce(st, idx);
    });
    // Gen 2:Circle(num5) + Blotches(4) + HasLiquid + SkipTiles(21,467,226,237)
    //        → SetTile(162) + SetLiquid(0,0)
    forEachCircleCell(st, cx, cy, num5, rng, 4, (x, y) => {
      const idx = st.idx(x, y);
      if (st.liquid[idx] === 0) return;          // HasLiquid
      if (st.flags[idx] && ICE_SKIP.has(st.type[idx])) return;   // SkipTiles
      setThinIce(st, idx);
      st.liquid[idx] = 0;                        // SetLiquid(0, 0)
      st.liquidType[idx] = 0;
    });
    num4 += num5 - 2;
  }
  // structures.AddStructure((ox-25, oy-25, 50, 50), 8)(cs:32)
  protectedRects.push({ x0: ox - 25, y0: oy - 25, x1: ox + 25, y1: oy + 25 });
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
function setThinIce(st: TileStore, idx: number): void {
  st.type[idx] = THIN_ICE;
  st.flags[idx] = 1;
  st.frameX[idx] = 0;
  st.frameY[idx] = 0;
  st.wall[idx] = 0;
  st.liquid[idx] = 0;
  st.liquidType[idx] = 0;
  st.half[idx] = 0;
  st.slope[idx] = 0;
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

/** 相对坐标点集(≈Terraria.WorldBuilding/ShapeData)。原版 HashSet<Point16> 枚举序
 *  不可移植,此处 JS Set 保插入序 = 形状行主序——藤蔓/铺草两步(ACTION 消耗掷骰)
 *  逐格结果可能分叉,掷骰总数一致,已在文件头备案 */
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
 *  无全局 StructureMap——已保护结构以本 pass 的 protectedRects 近似(文件头已备案) */
function shrineCanPlace(st: TileStore, protectedRects: Rect[], area: Rect, padding: number): boolean {
  if (area.x0 < 0 || area.y0 < 0 || area.x1 > st.w - 1 || area.y1 > st.h - 1) return false;
  const r: Rect = { x0: area.x0 - padding, y0: area.y0 - padding, x1: area.x1 + padding, y1: area.y1 + padding };
  for (const p of protectedRects) {
    if (overlaps(r, p)) return false;
  }
  for (let x = r.x0; x < r.x1; x++) {
    for (let y = r.y0; y < r.y1; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      if (st.flags[i] && PLACEMENT_FORBID.has(st.type[i])) return false;
    }
  }
  return true;
}

/** EnchantedSwordBiome.Place(cs:19-111)1:1:水潭洞穴 + 中央土丘 + 内缘草 + 花墙藤蔓 +
 *  1/3 竖井 + 土丘剑。洞穴中心 = 种子点**下方** 20 格(cs:58)——旧实现放上方 10-20,
 *  整体形状上下颠倒(根因) */
function placeEnchantedSwordShrine(
  st: TileStore, rng: RNG, protectedRects: Rect[], ox: number, oy: number,
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
  const num3 = oy - num2;
  const num4 = Math.min(50, num3);
  let resultY = -1;
  for (let i = 0; i < num3; i++) {
    let solid = false;
    for (let j = 0; j < num4; j++) {
      if (solidAt(st, ox, oy - i + j)) { solid = true; break; }
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
  if (!shrineCanPlace(st, protectedRects, rect1, 0)) return false;
  const rect2: Rect = { x0: ox, y0: resultY + 10, x1: ox + 1, y1: resultY + 10 + (oy - resultY - 9) };
  if (!shrineCanPlace(st, protectedRects, rect2, 2)) return false;

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
        mound.add(px - point2X, py - point2Y);
      }
    }
  }
  // ⑩ shapeData.Subtract(shapeData2, point, point2)(cs:77)——土丘格从洞穴形状剔除
  mound.each((dx, dy) => cave.remove(dx + (point2X - pointX), dy + (point2Y - pointY)));
  // ⑪ InnerOutline 铺草(cs:78):8 邻域任一不在形状内 → 草(ModShapes.cs:88-117)
  const outline: Array<[number, number]> = [];
  cave.each((dx, dy) => {
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [ax, ay] of around) {
      if (!cave.has(dx + ax, dy + ay)) { outline.push([dx, dy]); return; }
    }
  });
  for (const [dx, dy] of outline) {
    const px = pointX + dx, py = pointY + dy;
    if (!st.inBounds(px, py)) continue;
    const i = st.idx(px, py);
    st.type[i] = GRASS; st.flags[i] = 1;                    // SetTile(2)
    st.frameX[i] = 0; st.frameY[i] = 0; st.slope[i] = 0; st.half[i] = 0;
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
  // ⑬ 花墙 68 + 藤蔓(cs:80):全形状格铺墙,其后 OnlyTiles(2)→Offset(0,1)→藤蔓
  cave.each((dx, dy) => {
    const px = pointX + dx, py = pointY + dy;
    if (!st.inBounds(px, py)) return;
    st.wall[st.idx(px, py)] = 68;                           // PlaceWall(68, Flower Wall)
  });
  cave.each((dx, dy) => {
    const px = pointX + dx, py = pointY + dy;
    if (!st.inBounds(px, py)) return;
    const i = st.idx(px, py);
    if (!st.flags[i] || st.type[i] !== GRASS) return;       // OnlyTiles(2)
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
        }
      }
    });
  }
  // ⑮ 土丘剑(cs:89-94):ChanceOfRealSword 门(默认 1.0 恒真→187 style17;
  //    否则 186 style15)。PlaceTile 锚 = (point2.X, point2.Y-15) 3×2 底行左锚
  const realSword = rng.next() <= SWORD_CHANCE_REAL;
  {
    const swordTile = realSword ? DECOS_GROUP2 : LARGE_PILES;
    const swordStyle = realSword ? 17 : 15;
    const sx = point2X, sy = point2Y - 15;
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        if (!st.inBounds(sx + dx, sy - 1 + dy)) continue;
        st.setTileSilent(sx + dx, sy - 1 + dy, swordTile, swordStyle * 54 + dx * 18, dy * 18);
      }
    }
  }
  // ⑯ 土丘表面草(cs:96):Offset(0,-1)→OnlyTiles(2)→Offset(0,-1)→ActionGrass
  //    (ActionGrass.cs:14-22):目标格与上格皆空 → PlaceTile(SelectRandom{3,73})
  mound.each((dx, dy) => {
    const gx = point2X + dx, gy = point2Y + dy - 1;          // 第一层 Offset(0,-1)
    if (!st.inBounds(gx, gy)) return;
    const gi = st.idx(gx, gy);
    if (!st.flags[gi] || st.type[gi] !== GRASS) return;      // OnlyTiles(2)
    const px = gx, py = gy - 1;                              // 第二层 Offset(0,-1)
    if (!st.inBounds(px, py) || !st.inBounds(px, py - 1)) return;
    if (st.flags[st.idx(px, py)] || st.flags[st.idx(px, py - 1)]) return;
    st.setTileSilent(px, py, rng.int(0, 1) === 0 ? SHORT_PLANTS : TALL_PLANTS, 0, 0);
  });
  // ⑰ structures.AddProtectedStructure(rectangle, 10)(cs:98)——pad 10 入保护图
  protectedRects.push({
    x0: rect1.x0 - 10, y0: rect1.y0 - 10, x1: rect1.x1 + 10, y1: rect1.y1 + 10,
  });
  return true;
}

// ============================================================
// 3. placeLavaTrap(WorldGen.cs:8648-8732;调用点 cs:22093-22127)
// ============================================================

/** 地狱熔岩陷阱:岩浆湖底掏腔,湖底层致动石栅 + 压板 135 style7 + 红线。
 *  门禁:锚点须满格岩浆;11×11 内 ≥50 满岩浆格;±20 无线;腔高 ≤40 且 ≥4 */
export function placeLavaTrap(st: TileStore, gs: GenState, x: number, y: number): boolean {
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
  if (!solidAt(st, x, num7) || solidTopAt(st, x, num7)) return false;
  const num8 = num7;
  // ±20 × ±20 无任何线(cs:8681-8689)
  for (let k = x - scanR; k <= x + scanR; k++) {
    for (let l = num7 - scanR; l <= num7 + scanR; l++) {
      if (st.inBounds(k, l) && (st.wire[st.idx(k, l)] & 15) !== 0) return false;
    }
  }
  // 穿透湖底实心层(cs:8690-8696)
  while (activeAt(st, x, num7) && solidAt(st, x, num7) && !solidTopAt(st, x, num7)) {
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
  if (!solidAt(st, x, num7) || solidTopAt(st, x, num7) || st.type[floorIdx] === THIN_ICE) return false;
  const num10 = num7 - 1;
  if (num10 - num8 > maxDrop) return false;
  if (num10 - num9 < minGap) return false;
  st.slope[floorIdx] = 0;
  st.half[floorIdx] = 0;
  // PlaceTile(x, num10, 135, style 7)(cs:8720)——style 在 frameY(126)
  st.setTileSilent(x, num10, PLATE, 0, 126);
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
