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
  // 基座方向 num7（L14439-14543）：两侧地面适配 → 决定根部与基座帧
  const fitSide = (dx: number) => st.inBounds(i + dx, index1)
    && st.flags[st.idx(i + dx, index1)] && FIT.has(st.type[st.idx(i + dx, index1)]);
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
  // 头部适配检查：基座上一格三列无液体 / 基座活跃且适树 / 上格墙白名单 / 至少一侧邻格适树
  if (st.liquid[st.idx(i - 1, index1 - 1)] > 0 || st.liquid[st.idx(i, index1 - 1)] > 0 || st.liquid[st.idx(i + 1, index1 - 1)] > 0) return false;
  if (!st.flags[gi] || !FIT.has(st.type[gi])) return false;
  if (!TREE_WALLS.has(st.wall[st.idx(i, index1 - 1)])) return false;
  const fitSide = (dx: number) => st.inBounds(i + dx, index1)
    && st.flags[st.idx(i + dx, index1)] && FIT.has(st.type[st.idx(i + dx, index1)]);
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
  if (!st.flags[gi] || !GRASS.has(st.type[gi])) return false;
  if (st.wall[st.idx(i, index1 - 1)] !== 0 || st.liquid[st.idx(i, index1 - 1)] > 0) return false;
  const family = idsByVanillaSheet(2, 23, 60, 109);
  const fitSide = (dx: number) => st.inBounds(i + dx, index1)
    && st.flags[st.idx(i + dx, index1)] && family.has(st.type[st.idx(i + dx, index1)]);
  if (!fitSide(-1) && !fitSide(1)) return false;
  if (!emptyTileCheck(st, i - 2, i + 2, index1 - 55, index1 - 1)) return false;
  return growTrunk(st, rng, gs, i, index1, rng.int(20, 29)); // Next(20,30)
}

/** GrowPalmTree（L11785）：沙滩棕榈，干身倾斜帧 fy=num4（±2 步进趋向 num3） */
function growPalmTree(st: TileStore, rng: RNG, i: number, y: number): boolean {
  if (!st.inBounds(i, y)) return false;
  let index1 = y;
  while (st.inBounds(i, index1) && st.flags[st.idx(i, index1)] && PLANTS.has(st.type[st.idx(i, index1)])) index1++;
  if (!st.inBounds(i, index1) || index1 < 1) return false;
  const gi = st.idx(i, index1);
  if (!st.flags[gi] || !PALM_GROUND.has(st.type[gi])) return false;
  if (st.wall[st.idx(i, index1 - 1)] !== 0 || st.liquid[st.idx(i, index1 - 1)] > 0) return false;
  if (!emptyTileCheck(st, i, i, index1 - 2, index1 - 1)) return false;
  if (!emptyTileCheck(st, i - 1, i + 1, index1 - 30, index1 - 3)) return false;
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

/** AddTrees（L15642）：逐列尝试（~1.6 列间距）；沙滩棕榈按每侧固定概率；
 *  草上 1/20 观赏树（柳/樱 GrowTreeWithSettings 未移植——缺对应生成管线，留待 C 批） */
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
  for (let x = 1; x < st.w - 1; x++) {
    for (let y = 20; y < gs.worldSurface; y++) {
      if (x < 380) {
        if (rng.next() < palmL && st.liquid[st.idx(x, y)] === 0) growPalmTree(st, rng, x, y);
      } else if (x > st.w - 380) {
        if (rng.next() < palmR && st.liquid[st.idx(x, y)] === 0) growPalmTree(st, rng, x, y);
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
  const fix0 = (arr: number[]) => {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === 0 && rng.int(0, 2) !== 0) arr[i] = 4; // style0 → 4（2/3）
    }
  };
  if (w === 4200) {
    treeX[0] = rng.int(Math.floor(w * 0.5 - w * 0.25), Math.floor(w * 0.5 + w * 0.25) - 1);
    treeStyle[0] = roll6(); treeStyle[1] = roll6();
    while (treeStyle[1] === treeStyle[0]) treeStyle[1] = roll6();
    treeX[1] = w; treeX[2] = w;
    fix0([treeStyle[0], treeStyle[1]]);
  } else if (w === 6400) {
    treeX[0] = rng.int(Math.floor(w * 0.334 - w * 0.2), Math.floor(w * 0.334 + w * 0.2) - 1);
    treeX[1] = rng.int(Math.floor(w * 0.667 - w * 0.2), Math.floor(w * 0.667 + w * 0.2) - 1);
    treeStyle[0] = roll6(); treeStyle[1] = roll6(); treeStyle[2] = roll6();
    while (treeStyle[1] === treeStyle[0]) treeStyle[1] = roll6();
    while (treeStyle[2] === treeStyle[0] || treeStyle[2] === treeStyle[1]) treeStyle[2] = roll6();
    treeX[2] = w;
    fix0([treeStyle[0], treeStyle[1], treeStyle[2]]);
  } else {
    treeX[0] = rng.int(Math.floor(w * 0.25 - w * 0.15), Math.floor(w * 0.25 + w * 0.15) - 1);
    treeX[1] = rng.int(Math.floor(w * 0.5 - w * 0.15), Math.floor(w * 0.5 + w * 0.15) - 1);
    treeX[2] = rng.int(Math.floor(w * 0.75 - w * 0.15), Math.floor(w * 0.75 + w * 0.15) - 1);
    treeStyle[0] = roll6(); treeStyle[1] = roll6(); treeStyle[2] = roll6(); treeStyle[3] = roll6();
    while (treeStyle[1] === treeStyle[0]) treeStyle[1] = roll6();
    while (treeStyle[2] === treeStyle[0] || treeStyle[2] === treeStyle[1]) treeStyle[2] = roll6();
    while (treeStyle[3] === treeStyle[0] || treeStyle[3] === treeStyle[1] || treeStyle[3] === treeStyle[2]) treeStyle[3] = roll6();
    fix0(treeStyle);
  }
  return { treeX, treeStyle };
}
