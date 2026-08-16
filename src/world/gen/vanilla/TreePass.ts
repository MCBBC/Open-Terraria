// 原版 pass 82 "Planting Trees" 1:1（1405 WorldGen.cs:9651-9670 + AddTrees:15642 +
// GrowTree:14171 + GrowPalmTree:11785 + GrowEpicTree:11850 + RandomizeTreeStyle:2817）。
// 帧表逐格核对自源码（Tiles_5 网格 22px）：干身 8 case×3 变体 + 侧枝/根部/基座/树冠标记帧。
// 渲染端 VanillaTiler.drawTreeCell 消费同一语义（fy≥198 为树冠标记帧；棕榈 sheet 323）。
// RNG 映射：Next(a,b) → rng.int(a, b-1)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { T, TILE_BY_KEY } from '../../../data/tiles';

const TREE = TILE_BY_KEY['tree']!;              // tile 5
const PALM = TILE_BY_KEY['v_323_palm_trees']!;  // tile 323
const GEM_SAPLING = TILE_BY_KEY['v_590_gem_saplings']!; // tile 590（宝石树苗）
/** IsTileTypeFitForTree（L14147）：草族 9 种 */
const FIT = idsByVanillaSheet(2, 23, 60, 70, 109, 147, 199, 477, 492);
/** GrowTree 头部墙白名单（L14176：0/80/106/107/138-141/145/150/152） */
const TREE_WALLS = new Set([0, 80, 106, 107, 138, 139, 140, 141, 145, 150, 152]);
/** 棕榈基座沙族（L11793：53/234/116/112） */
const PALM_GROUND = idsByVanillaSheet(53, 234, 116, 112);
const JUNGLE_GRASS = idsByVanillaSheet(60);
/** 植物（vanilla tile 20）：GrowTree 头部越过找基座（原版 while type==20） */
const PLANTS = idsByVanillaSheet(20);

/** 干身帧表：num5 case → num4(变体 0-2) → [fx,fy]（L14213-14425 逐 case 提取） */
const TRUNK: Record<number, Array<[number, number]>> = {
  0: [[0, 0], [0, 22], [0, 44]],
  1: [[0, 66], [0, 88], [0, 110]],
  2: [[22, 0], [22, 22], [22, 44]],
  3: [[44, 66], [44, 88], [44, 110]],
  4: [[22, 66], [22, 88], [22, 110]],
  5: [[88, 0], [88, 22], [88, 44]],
  6: [[66, 66], [66, 88], [66, 110]],
  7: [[110, 66], [110, 88], [110, 110]],
  8: [[0, 0], [0, 22], [0, 44]],
  9: [[0, 0], [0, 22], [0, 44]],
};

/** EmptyTileCheck（L15685，ignoreID=-1 简化：出界 false，任何实心 false） */
function emptyTileCheck(st: TileStore, x0: number, x1: number, y0: number, y1: number): boolean {
  if (x0 < 0 || x1 >= st.w || y0 < 0 || y1 >= st.h) return false;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (st.flags[st.idx(x, y)]) return false;
    }
  }
  return true;
}

/** 树干+枝+根+冠 共体（GrowTree L14203-14606 / GrowEpicTree 同表）。
 *  groundType：基座 tile（判丛林加高）；返回是否成树 */
function growTrunk(st: TileStore, rng: RNG, gs: GenState, i: number, index1: number, height: number): boolean {
  let flagL = false, flagR = false; // 侧枝去重（num5 5/7 左、6/7 右不同帧连续限制）
  for (let y = index1 - height; y < index1; y++) {
    // num4 = 枝型 0-9；顶/底强制 0；5/7 与 6/7 连续出现需重投
    let num5 = rng.int(0, 9);
    if (y === index1 - 1 || y === index1 - height) num5 = 0;
    while (((num5 === 5 || num5 === 7) && flagL) || ((num5 === 6 || num5 === 7) && flagR)) {
      num5 = rng.int(0, 9);
    }
    flagL = false; flagR = false;
    if (num5 === 5 || num5 === 7) flagL = true;
    if (num5 === 6 || num5 === 7) flagR = true;
    const num4 = rng.int(0, 2);
    const [fx, fy] = TRUNK[num5][num4];
    st.setTileSilent(i, y, TREE, fx, fy);
    // 侧枝帧（L14362-14426）：Next(3)<2 走 198+ 行（贴干枝），否则行内变体
    if (num5 === 5 || num5 === 7) {
      const k = rng.int(0, 2);
      const [bfx, bfy] = rng.int(0, 2) < 2 ? [44, 198 + k * 22] : [66, k * 22];
      st.setTileSilent(i - 1, y, TREE, bfx, bfy);
    }
    if (num5 === 6 || num5 === 7) {
      const k = rng.int(0, 2);
      const [bfx, bfy] = rng.int(0, 2) < 2 ? [66, 198 + k * 22] : [88, 66 + k * 22];
      st.setTileSilent(i + 1, y, TREE, bfx, bfy);
    }
  }
  // 基座方向 num7（L14439-14543）：两侧地面适配 → 决定根部与基座帧。
  //  侧根放置前提 = 邻格整砖(L30230/30234:!halfBrick && slope==0)——半砖/坡面侧不出根
  const fitSide = (dx: number) => {
    if (!st.inBounds(i + dx, index1)) return false;
    const si = st.idx(i + dx, index1);
    return !!st.flags[si] && !st.half[si] && st.slope[si] === 0 && FIT.has(st.type[si]);
  };
  let num7 = rng.int(0, 2);
  const sideL = fitSide(-1), sideR = fitSide(1);
  if (!sideL) { if (num7 === 0) num7 = 2; else if (num7 === 1) num7 = 3; }
  if (!sideR) { if (num7 === 0) num7 = 1; else if (num7 === 2) num7 = 3; }
  if (sideL && !sideR) num7 = 2;
  if (sideR && !sideL) num7 = 1;
  const k8 = rng.int(0, 2);
  if (num7 === 0 || num7 === 1) st.setTileSilent(i + 1, index1 - 1, TREE, 22, 132 + k8 * 22); // 右根
  if (num7 === 0 || num7 === 2) st.setTileSilent(i - 1, index1 - 1, TREE, 44, 132 + k8 * 22); // 左根
  // 基座干身（switch num7，L14519-14566）
  const baseFx = num7 === 0 ? 88 : num7 === 1 ? 0 : num7 === 2 ? 66 : -1;
  if (baseFx >= 0) st.setTileSilent(i, index1 - 1, TREE, baseFx, 132 + k8 * 22);
  // 树冠标记帧（L14568-14600）：12/13 fx=22，否则 fx=0；fy=198+22*k
  const crownFx = rng.int(0, 12) !== 0 ? 22 : 0;
  st.setTileSilent(i, index1 - height, TREE, crownFx, 198 + rng.int(0, 2) * 22);
  gs.genTrees.push({ x: i, y: index1 - height, h: height }); // 砍伐整棵判定用
  return true;
}

/** GrowTree（L14171）：常规树。height=Next(5,17)；丛林草基座净空 +5 */
function growTree(st: TileStore, rng: RNG, gs: GenState, i: number, y: number): boolean {
  let index1 = y;
  while (st.inBounds(i, index1) && st.flags[st.idx(i, index1)] && PLANTS.has(st.type[st.idx(i, index1)])) index1++;
  if (!st.inBounds(i, index1) || index1 < 1) return false;
  const gi = st.idx(i, index1);
  // 头部适配检查：基座上一格三列无液体 / 基座活跃且适树且整砖(L29934:!halfBrick&&slope==0) /
  // 上格墙白名单 / 至少一侧邻格适树（侧根前提同款整砖检查）
  if (st.liquid[st.idx(i - 1, index1 - 1)] > 0 || st.liquid[st.idx(i, index1 - 1)] > 0 || st.liquid[st.idx(i + 1, index1 - 1)] > 0) return false;
  if (!st.flags[gi] || st.half[gi] || st.slope[gi] !== 0 || !FIT.has(st.type[gi])) return false;
  if (!TREE_WALLS.has(st.wall[st.idx(i, index1 - 1)])) return false;
  const fitSide = (dx: number) => {
    if (!st.inBounds(i + dx, index1)) return false;
    const si = st.idx(i + dx, index1);
    return !!st.flags[si] && !st.half[si] && st.slope[si] === 0 && FIT.has(st.type[si]);
  };
  if (!fitSide(-1) && !fitSide(1)) return false;
  const height = rng.int(5, 16);                       // Next(5,17)
  let clear = height + 4;                              // num3
  if (JUNGLE_GRASS.has(st.type[gi])) clear += 5;
  if (!emptyTileCheck(st, i - 2, i + 2, index1 - clear, index1 - 1)) return false;
  return growTrunk(st, rng, gs, i, index1, height);
}

/** GrowEpicTree（L11850）：巨型树。基座严格草(2)、邻格草族、净空 55、height=Next(20,30) */
function growEpicTree(st: TileStore, rng: RNG, gs: GenState, i: number, y: number): boolean {
  let index1 = y;
  while (st.inBounds(i, index1) && st.flags[st.idx(i, index1)] && PLANTS.has(st.type[st.idx(i, index1)])) index1++;
  if (!st.inBounds(i, index1) || index1 < 1) return false;
  const gi = st.idx(i, index1);
  const GRASS = idsByVanillaSheet(2);
  // 基座整砖检查(GrowEpicTree 同 GrowTree 头部语义:半砖/坡面拒绝)
  if (!st.flags[gi] || st.half[gi] || st.slope[gi] !== 0 || !GRASS.has(st.type[gi])) return false;
  if (st.wall[st.idx(i, index1 - 1)] !== 0 || st.liquid[st.idx(i, index1 - 1)] > 0) return false;
  const family = idsByVanillaSheet(2, 23, 60, 109);
  const fitSide = (dx: number) => st.inBounds(i + dx, index1)
    && st.flags[st.idx(i + dx, index1)] && family.has(st.type[st.idx(i + dx, index1)]);
  if (!fitSide(-1) && !fitSide(1)) return false;
  if (!emptyTileCheck(st, i - 2, i + 2, index1 - 55, index1 - 1)) return false;
  return growTrunk(st, rng, gs, i, index1, rng.int(20, 29)); // Next(20,30)
}

/** GrowPalmTree（L11785）：沙滩棕榈，干身倾斜帧 fy=num4（±2 步进趋向 num3） */
/** 1456 GrowPalmTree(cs:27270-27340)1:1;导出供 StructuresPass 绿洲消费段复用(2026-08-13 去重) */
export function growPalmTree(st: TileStore, rng: RNG, i: number, y: number): boolean {
  if (!st.inBounds(i, y)) return false;
  let index1 = y;
  while (st.inBounds(i, index1) && st.flags[st.idx(i, index1)] && PLANTS.has(st.type[st.idx(i, index1)])) index1++;
  if (!st.inBounds(i, index1) || index1 < 1) return false;
  const gi = st.idx(i, index1);
  // 基座整砖检查(GrowPalmTree:27280-27285 active && !halfBrick && slope==0)
  if (!st.flags[gi] || st.half[gi] || st.slope[gi] !== 0 || !PALM_GROUND.has(st.type[gi])) return false;
  if (st.wall[st.idx(i, index1 - 1)] !== 0 || st.liquid[st.idx(i, index1 - 1)] > 0) return false;
  if (!emptyTileCheck(st, i, i, index1 - 2, index1 - 1)) return false;
  // 1456 终态(cs:27302):侧净空 num-num2 = index1-20(1405 :11800 是 index1-30,已换)
  if (!emptyTileCheck(st, i - 1, i + 1, index1 - 20, index1 - 3)) return false;
  const height = rng.int(10, 20);                 // Next(10,21)
  const target = rng.int(-8, 8) * 2;              // Next(-8,9)*2
  let tilt = 0;
  for (let k = 0; k < height; k++) {
    if (k === 0) {
      st.setTileSilent(i, index1 - 1, PALM, 66, 0);
      continue;
    }
    if (k === height - 1) {
      st.setTileSilent(i, index1 - 1 - k, PALM, 22 * rng.int(4, 6), tilt); // 顶段 fx=22*Next(4,7)
      continue;
    }
    if (tilt !== target) {
      const prog = k / height;                    // 倾斜步进阈值（L11814-11820）
      if (prog >= 0.25 && ((prog < 0.5 && rng.int(0, 12) === 0)
        || (prog < 0.7 && rng.int(0, 8) === 0)
        || (prog < 0.95 && rng.int(0, 4) === 0) || true)) {
        tilt += Math.sign(target) * 2;
      }
    }
    st.setTileSilent(i, index1 - 1 - k, PALM, 22 * rng.int(0, 2), tilt); // fx=22*Next(0,3)
  }
  return true;
}

/** 湖畔棕榈水盒段（CactusPalmTreesAndCoral 中段 flag 分支，cs:21257-21273）：
 *  沙面锚点 (x,y) 的 50×25 水盒（[x-50,x+50)×[y-25,y+25)，InWorld 内液量求和，
 *  常量 cactusWaterWidth/Height/Limit = 50/25/25，cs:4258-4262）内液量和 /255 > 25
 *  时掷 Next(4)==0 → GrowPalmTree（TryGrowingTreeByType(323) → cs:30508-30509）。
 *  返回 true = 水盒超限（Next(4) 已掷，可能已种棕榈）→ 仙人掌段不再 PlantCactus；
 *  返回 false = 水盒未超限 → 由调用方走 PlantCactus（cs:21274）。 */
export function waterBoxPalmCheck(st: TileStore, rng: RNG, x: number, y: number): boolean {
  let sum = 0;
  for (let k = x - 50; k < x + 50; k++) {
    for (let l = y - 25; l < y + 25; l++) {
      if (st.inBounds(k, l)) sum += st.liquid[st.idx(k, l)];
    }
  }
  if (Math.trunc(sum / 255) > 25) {
    if (rng.int(0, 3) === 0) growPalmTree(st, rng, x, y);
    return true;
  }
  return false;
}

// ===================== GrowTreeWithSettings 族（宝石树 + 观赏树柳/樱） =====================
// ShimmerMakeBiome 的 aether 树走 TryGrowingTreeByType(583-589)（WorldGen.cs:30500-30542 →
// GrowTreeWithSettings 30546-30967）；AddTrees 的 1/20 观赏树走 616 柳 / 596 樱（cs:31558-31566）。
// 干身帧表与 GrowTree 完全同构（同一 switch，cs:30604-30700），复用 TRUNK。

/** GrowTreeSettings profile（cs:3795-3886）：宝石树七种 + 观赏树柳/樱共用同一骨架，
 *  差异只在 GroundTest/WallTest/SaplingTileType/TreeTileType（高度均 7-12、Padding 4） */
export interface TreeProfile {
  treeTile: number;
  sapling: number;
  ground: Set<number>;   // GroundTest 谓词集
  walls: Set<number>;    // WallTest 谓词集
  heightMin: number;
  heightMax: number;     // 含端（Next(min, max+1)）
  topPadding: number;    // TreeTopPaddingNeeded
}

/** GemTreeGroundTest（cs:30461）：Conversion.Stone{1,25,117,203} ∪ Moss */
const GEM_GROUND = idsByVanillaSheet(1, 25, 117, 203, 182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627);
/** IsTileTypeFitForTree 全集（cs:29852，含 633/661/662——基座根部 tuft 的适树判定） */
const GEM_TREE_FIT = idsByVanillaSheet(2, 23, 60, 70, 109, 147, 199, 477, 492, 633, 661, 662);
/** GemTreeWallTest（cs:30426-30458）= DefaultTreeWallTest(AllowsPlantsToGrow) ∪ 宝石墙补充表 */
const GEM_WALLS = new Set([
  0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80,
  2, 54, 55, 56, 57, 58, 59, 61, 185, 196, 197, 198, 199, 208, 209, 210, 211, 212, 213, 214, 215,
]);
/** DefaultTreeWallTest（cs:30417）= WallID.Sets.AllowsPlantsToGrow（WallID.cs:58） */
const DEFAULT_TREE_WALLS = new Set<number>([
  0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317, 63, 64, 65, 66, 67, 68, 69, 81, 70, 264, 268, 265, 74, 80,
]);
/** VanityTreeGroundTest（cs:30474）：Conversion.Grass{2,23,199,109,477,492} 去掉 23/199 */
const VANITY_GROUND = idsByVanillaSheet(2, 109, 477, 492);
/** EmptyTileCheck ignoreID=20（树苗族门）：活跃格仅容忍树族 tile 残留（cs:31611-31683） */
const GEM_EMPTY_ALLOW = idsByVanillaSheet(3, 24, 32, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 184, 201, 233, 352, 485, 529, 530, 637, 655);

const GEM_PROFILE: TreeProfile = {
  treeTile: -1, sapling: GEM_SAPLING, ground: GEM_GROUND, walls: GEM_WALLS,
  heightMin: 7, heightMax: 12, topPadding: 4,
};
const SAKURA_PROFILE: TreeProfile = {
  treeTile: TILE_BY_KEY['v_596_vanity_tree_sakura']!,
  sapling: TILE_BY_KEY['v_595_sakura_sapling']!,
  ground: VANITY_GROUND, walls: DEFAULT_TREE_WALLS,
  heightMin: 7, heightMax: 12, topPadding: 4,
};
const WILLOW_PROFILE: TreeProfile = {
  treeTile: TILE_BY_KEY['v_616_vanity_tree_yellow_willow']!,
  sapling: TILE_BY_KEY['v_615_yellow_willow_sapling']!,
  ground: VANITY_GROUND, walls: DEFAULT_TREE_WALLS,
  heightMin: 7, heightMax: 12, topPadding: 4,
};
/** AshTreeGroundTest（cs:30487-30501）：仅灰烬草 633 */
const ASH_GROUND = idsByVanillaSheet(633);
const ASH_PROFILE: TreeProfile = {
  treeTile: TILE_BY_KEY['v_634_ash_tree']!,
  sapling: GEM_SAPLING,   // Tree_Ash.SaplingTileType=20（cs:3901；growTreeWithSettings 不消费）
  ground: ASH_GROUND, walls: DEFAULT_TREE_WALLS,
  heightMin: 7, heightMax: 12, topPadding: 4,   // Tree_Ash 高度 7-12 / Padding 4（cs:3898-3901）
};

/** GrowTreeWithSettings（cs:30546-30967）1:1：宝石树/观赏树共用骨架。
 *  干身帧表与 GrowTree 同构（同一 switch，cs:30604-30700），复用 TRUNK。 */
export function growTreeWithSettings(st: TileStore, rng: RNG, x: number, y: number, p: TreeProfile): boolean {

  // 越过树苗找地面行（cs:30547-30550）
  let num = y;
  while (st.inBounds(x, num) && st.flags[st.idx(x, num)] && st.type[st.idx(x, num)] === p.sapling) num++;
  if (!st.inBounds(x, num) || num < 1) return false;
  // 基座上一格三列无液体（cs:30551-30554）
  if (st.liquid[st.idx(x - 1, num - 1)] !== 0 || st.liquid[st.idx(x, num - 1)] !== 0 || st.liquid[st.idx(x + 1, num - 1)] !== 0) return false;
  // 基座整砖 + 墙白名单 + GroundTest（cs:30555-30566）
  const gi = st.idx(x, num);
  if (!st.flags[gi] || st.half[gi] || st.slope[gi] !== 0) return false;
  if (!p.walls.has(st.wall[st.idx(x, num - 1)])) return false;
  if (!p.ground.has(st.type[gi])) return false;
  // 两侧至少一侧同基座（cs:30568-30571）
  const fitSide = (dx: number) => st.inBounds(x + dx, num)
    && st.flags[st.idx(x + dx, num)] && p.ground.has(st.type[st.idx(x + dx, num)]);
  if (!fitSide(-1) && !fitSide(1)) return false;
  const height = rng.int(p.heightMin, p.heightMax);    // Next(TreeHeightMin, TreeHeightMax+1)
  const num4 = height + p.topPadding;                  // + TreeTopPaddingNeeded
  // EmptyTileCheck(x-2, x+2, num-num4, num-1, 20)（cs:30580-30582）
  if (x - 2 < 0 || x + 2 >= st.w || num - num4 < 0) return false;
  for (let ex = x - 2; ex <= x + 2; ex++) {
    for (let ey = num - num4; ey <= num - 1; ey++) {
      const ei = st.idx(ex, ey);
      if (!st.flags[ei]) continue;
      if (!GEM_EMPTY_ALLOW.has(st.type[ei])) return false;
    }
  }
  // 干身帧循环（cs:30590-30816）：与 GrowTree 同表，tile 换成宝石树干
  let flagL = false, flagR = false;
  for (let i = num - height; i < num; i++) {
    // ★cs:30595-30596 掷序：先 num5=Next(3)（干身帧变体）**再** num6=Next(10)（枝型）。
    //   旧实现 num6 先 num5 后——两骰虽都无条件（总掷数同），但 num6 取自不同流位，
    //   枝型/重投序列整体漂移（shimmer 金标 2026-08-13 暴露：成树 x=3865 reroll 2 vs 1）。
    //   GrowTree（growTrunk）的顺序相反（枝型先），勿互搬。
    const num5 = rng.int(0, 2);
    let num6 = rng.int(0, 9);
    if (i === num - 1 || i === num - height) num6 = 0; // 顶/底强制直干
    while (((num6 === 5 || num6 === 7) && flagL) || ((num6 === 6 || num6 === 7) && flagR)) { num6 = rng.int(0, 9); }
    flagL = false; flagR = false;
    if (num6 === 5 || num6 === 7) flagL = true;
    if (num6 === 6 || num6 === 7) flagR = true;
    const [fx, fy] = TRUNK[num6][num5];
    st.setTileSilent(x, i, p.treeTile, fx, fy);
    if (num6 === 5 || num6 === 7) {                    // 左枝（cs:30741-30764）
      const k = rng.int(0, 2);
      const [bfx, bfy] = rng.int(0, 2) < 2 ? [44, 198 + k * 22] : [66, k * 22];
      st.setTileSilent(x - 1, i, p.treeTile, bfx, bfy);
    }
    if (num6 === 6 || num6 === 7) {                    // 右枝（cs:30766-30789）
      const k = rng.int(0, 2);
      const [bfx, bfy] = rng.int(0, 2) < 2 ? [66, 198 + k * 22] : [88, 66 + k * 22];
      st.setTileSilent(x + 1, i, p.treeTile, bfx, bfy);
    }
  }
  // 基座 tuft（cs:30819-30858）：两侧地面适树（草族）才出，各 1/3 概率抹除；
  // 以太腔地面是石头 → IsTileTypeFitForTree=false，天然全跳过（1:1 保留判定）
  const tuftFit = (dx: number) => {
    if (!st.inBounds(x + dx, num)) return false;
    const si = st.idx(x + dx, num);
    return !!st.flags[si] && !st.half[si] && st.slope[si] === 0 && GEM_TREE_FIT.has(st.type[si]);
  };
  let tL = tuftFit(-1), tR = tuftFit(1);
  if (rng.int(0, 2) === 0) tL = false;
  if (rng.int(0, 2) === 0) tR = false;
  if (tR) st.setTileSilent(x + 1, num - 1, p.treeTile, 22, 132 + rng.int(0, 2) * 22);
  if (tL) st.setTileSilent(x - 1, num - 1, p.treeTile, 44, 132 + rng.int(0, 2) * 22);
  // ★cs:30906 `num5 = genRand.Next(3)` 是**无条件掷**（基座干身帧骰，帧写才受
  //   flag4/flag5 门控 cs:30907-30959）。旧实现内嵌 `if (tL || tR)`——两侧 tuft 全
  //   false 时（以太腔石地恒如此）每棵成树少掷 1 骰，500 采样流整体漂移
  //   （shimmer 金标 2026-08-13 暴露：CS oracle 状态恢复对账 tree[41] 后分叉）
  const baseK = rng.int(0, 2);
  if (tL && tR) st.setTileSilent(x, num - 1, p.treeTile, 88, 132 + baseK * 22);  // cs:30907-30923
  else if (tL) st.setTileSilent(x, num - 1, p.treeTile, 0, 132 + baseK * 22);    // cs:30925-30941
  else if (tR) st.setTileSilent(x, num - 1, p.treeTile, 66, 132 + baseK * 22);   // cs:30943-30959
  // 树冠标记帧（cs:30932-30967）：12/13 fx=22 否则 fx=0；fy=198+22*k
  const crownFx = rng.int(0, 12) !== 0 ? 22 : 0;
  st.setTileSilent(x, num - height, p.treeTile, crownFx, 198 + rng.int(0, 2) * 22);
  return true;
}

/** 宝石树（TryGrowingTreeByType 583-589 → GemTree_* profile）。
 *  treeTileType = 583-589（黄玉/紫晶/蓝玉/翡翠/红宝石/钻石/琥珀，cs:35063-35079 num24 映射） */
export function growGemTree(st: TileStore, rng: RNG, x: number, y: number, treeTileType: number): boolean {
  return growTreeWithSettings(st, rng, x, y, { ...GEM_PROFILE, treeTile: treeTileType });
}

/** 观赏树（TryGrowingTreeByType 616 柳 / 596 樱 → VanityTree_Willow/Sakura profile，cs:3872-3894） */
export function growVanityTree(st: TileStore, rng: RNG, x: number, y: number, willow: boolean): boolean {
  return growTreeWithSettings(st, rng, x, y, willow ? WILLOW_PROFILE : SAKURA_PROFILE);
}

/** 灰烬树（TryGrowingTreeByType 634 → GrowTreeSettings.Profiles.Tree_Ash，cs:3894-3903/
 *  30538）：灰烬草 633 基座、高 7-12。地狱 pass 铺 633 后 1/3 概率逐点尝试（cs:13885） */
export function growAshTree(st: TileStore, rng: RNG, x: number, y: number): boolean {
  return growTreeWithSettings(st, rng, x, y, ASH_PROFILE);
}

/** AddTrees（1456 cs:31523-31578）1:1：逐列尝试（~1.6 列间距）；沙滩棕榈按每侧固定概率；
 *  草上 1/20 观赏树（type==2 且 Next(20)==0 → Next(2)==0 ? 柳 616 : 樱 596），否则普通树 5 */
export function runTreePass(st: TileStore, rng: RNG, gs: GenState): void {
  // EpicTree 林区（pass 82 头段，L9656-9666）：w*0.003 个 25-50 半宽林区逐格尝试
  for (let n = 0; n < st.w * 0.003; n++) {
    const cx = rng.int(50, st.w - 51);            // Next(50, maxTilesX-50)
    const hw = rng.int(25, 49);                  // Next(25, 50)
    for (let x = cx - hw; x < cx + hw; x++) {
      for (let y = 20; y < gs.worldSurface; y++) growEpicTree(st, rng, gs, x, y);
    }
  }
  const palmL = 0.1 + rng.next() * 0.35;          // 每侧棕榈概率（L15644-45）
  const palmR = 0.1 + rng.next() * 0.35;
  const GRASS_TILE = T.GRASS;                     // tile 2（vanilla 草）
  for (let x = 1; x < st.w - 1; x++) {
    for (let y = 20; y < gs.worldSurface; y++) {
      if (x < 380) {
        if (rng.next() < palmL && st.liquid[st.idx(x, y)] === 0) growPalmTree(st, rng, x, y);
      } else if (x > st.w - 380) {
        if (rng.next() < palmR && st.liquid[st.idx(x, y)] === 0) growPalmTree(st, rng, x, y);
      }
      // 1/20 观赏树（cs:31558-31566）：active 且 type==2 且 Next(20)==0 → 柳/樱对半
      const yi = st.idx(x, y);
      if (st.flags[yi] && st.type[yi] === GRASS_TILE && rng.int(0, 19) === 0) {
        growVanityTree(st, rng, x, y, rng.int(0, 1) === 0);
        continue;
      }
      growTree(st, rng, gs, x, y);
    }
    if (rng.int(0, 2) === 0) x++;                 // Next(3)==0 跳列
    if (rng.int(0, 3) === 0) x++;                 // Next(4)==0 跳列
  }
}

/** RandomizeTreeStyle（L2817）：按世界宽掷 treeX 边界与 treeStyle（互异，style0→4 概率 2/3）。
 *  Reset pass 调用（L4837，worldID 之后 dungeonSide 之前） */
export function randomizeTreeStyle(rng: RNG, w: number): { treeX: number[]; treeStyle: number[] } {
  const treeX = [0, 0, 0], treeStyle = [0, 0, 0, 0];
  const roll6 = () => rng.int(0, 5);
  // fix0 原位改写 treeStyle 前 count 位（cs:8095-8101 style0 → 4，2/3 概率）。
  // ★曾 fix0([treeStyle[0], treeStyle[1]]) 传入临时拷贝——掷骰照旧（Next(3) 无条件
  //   消耗）但翻转落在被丢弃的副本上，4200/6400 档 style0 从未被替换成 4
  //   （.wld 头 treeStyle 对账实锤，2026-08-16 多尺寸批修复）
  const fix0 = (arr: number[], count: number) => {
    for (let i = 0; i < count; i++) {
      if (arr[i] === 0 && rng.int(0, 2) !== 0) arr[i] = 4; // style0 → 4（2/3）
    }
  };
  if (w === 4200) {
    treeX[0] = rng.int(Math.floor(w * 0.5 - w * 0.25), Math.floor(w * 0.5 + w * 0.25) - 1);
    treeStyle[0] = roll6(); treeStyle[1] = roll6();
    while (treeStyle[1] === treeStyle[0]) treeStyle[1] = roll6();
    treeX[1] = w; treeX[2] = w;
    fix0(treeStyle, 2);
  } else if (w === 6400) {
    treeX[0] = rng.int(Math.floor(w * 0.334 - w * 0.2), Math.floor(w * 0.334 + w * 0.2) - 1);
    treeX[1] = rng.int(Math.floor(w * 0.667 - w * 0.2), Math.floor(w * 0.667 + w * 0.2) - 1);
    treeStyle[0] = roll6(); treeStyle[1] = roll6(); treeStyle[2] = roll6();
    while (treeStyle[1] === treeStyle[0]) treeStyle[1] = roll6();
    while (treeStyle[2] === treeStyle[0] || treeStyle[2] === treeStyle[1]) treeStyle[2] = roll6();
    treeX[2] = w;
    fix0(treeStyle, 3);
  } else {
    treeX[0] = rng.int(Math.floor(w * 0.25 - w * 0.15), Math.floor(w * 0.25 + w * 0.15) - 1);
    treeX[1] = rng.int(Math.floor(w * 0.5 - w * 0.15), Math.floor(w * 0.5 + w * 0.15) - 1);
    treeX[2] = rng.int(Math.floor(w * 0.75 - w * 0.15), Math.floor(w * 0.75 + w * 0.15) - 1);
    treeStyle[0] = roll6(); treeStyle[1] = roll6(); treeStyle[2] = roll6(); treeStyle[3] = roll6();
    while (treeStyle[1] === treeStyle[0]) treeStyle[1] = roll6();
    while (treeStyle[2] === treeStyle[0] || treeStyle[2] === treeStyle[1]) treeStyle[2] = roll6();
    while (treeStyle[3] === treeStyle[0] || treeStyle[3] === treeStyle[1] || treeStyle[3] === treeStyle[2]) treeStyle[3] = roll6();
    fix0(treeStyle, 4);
  }
  return { treeX, treeStyle };
}

/** RandomizeCaveBackgrounds（1456 WorldGen.cs:8157-8210）：按世界宽掷 caveBackX 边界与
 *  caveBackStyle（互异）。尺寸分支计数 2/3/4；掷骰序与 treeX 同族——先全量边界、
 *  后样式（retry 环左→右）。尾部无条件 iceBackStyle/hellBackStyle/jungleBackStyle
 *  3 掷（cs:8211-8213）在调用方（Reset 段）照掷。
 *  区间真值（真 exe 取整，.wld 头实测锚定）：4200:[1050,3150)；
 *  6400:[857,3417)/[2988,5548)；8400:[840,3360)/[2940,5460)/[5040,7560)。 */
export function randomizeCaveBackgrounds(rng: RNG, w: number): { caveBackX: number[]; caveBackStyle: number[] } {
  const caveBackX = [0, 0, 0], caveBackStyle = [0, 0, 0, 0];
  const roll8 = () => rng.int(0, 7);
  if (w === 4200) {
    caveBackX[0] = rng.int(Math.floor(w * 0.5 - w * 0.25), Math.floor(w * 0.5 + w * 0.25) - 1);
    caveBackX[1] = w; caveBackX[2] = w;
    caveBackStyle[0] = roll8(); caveBackStyle[1] = roll8();
    while (caveBackStyle[1] === caveBackStyle[0]) caveBackStyle[1] = roll8();
  } else if (w === 6400) {
    caveBackX[0] = rng.int(Math.floor(w * 0.334 - w * 0.2), Math.floor(w * 0.334 + w * 0.2) - 1);
    caveBackX[1] = rng.int(Math.floor(w * 0.667 - w * 0.2), Math.floor(w * 0.667 + w * 0.2) - 1);
    caveBackX[2] = w;
    caveBackStyle[0] = roll8(); caveBackStyle[1] = roll8(); caveBackStyle[2] = roll8();
    while (caveBackStyle[1] === caveBackStyle[0]) caveBackStyle[1] = roll8();
    while (caveBackStyle[2] === caveBackStyle[0] || caveBackStyle[2] === caveBackStyle[1]) caveBackStyle[2] = roll8();
  } else {
    caveBackX[0] = rng.int(Math.floor(w * 0.25 - w * 0.15), Math.floor(w * 0.25 + w * 0.15) - 1);
    caveBackX[1] = rng.int(Math.floor(w * 0.5 - w * 0.15), Math.floor(w * 0.5 + w * 0.15) - 1);
    caveBackX[2] = rng.int(Math.floor(w * 0.75 - w * 0.15), Math.floor(w * 0.75 + w * 0.15) - 1);
    caveBackStyle[0] = roll8(); caveBackStyle[1] = roll8(); caveBackStyle[2] = roll8(); caveBackStyle[3] = roll8();
    while (caveBackStyle[1] === caveBackStyle[0]) caveBackStyle[1] = roll8();
    while (caveBackStyle[2] === caveBackStyle[0] || caveBackStyle[2] === caveBackStyle[1]) caveBackStyle[2] = roll8();
    while (caveBackStyle[3] === caveBackStyle[0] || caveBackStyle[3] === caveBackStyle[1] || caveBackStyle[3] === caveBackStyle[2]) caveBackStyle[3] = roll8();
  }
  return { caveBackX, caveBackStyle };
}
