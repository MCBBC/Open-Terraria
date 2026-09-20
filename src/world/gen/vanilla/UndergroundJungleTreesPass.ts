// 原版 pass #68 "UndergroundJungleTrees"（1456 WorldGen.cs:17952-17970）+
// GrowUndergroundTree（cs:31007-31457）1:1——2026-08-16 前整 pass 缺失（GenSolid.ts
// 备案「cs:17956 头 379=true 本仓缺该 pass」），世界状态缺丛林地下树。
//
// pass 体：全列 × [worldSurface-1, h-350) 每格 Next(10)==0 门（drunkWorldGen 恒真
// 分支不适用普通种子）→ GrowUndergroundTree(i, j)。数百万掷全在本 pass 内
// （每 pass 头重播种子，RNG 流对其他 pass 零影响，只补世界状态）。
//
// GrowUndergroundTree 与 GrowTree 共用 Trees_5 干身/枝/根/基座帧表（同 22px 网格，
// 帧值与 TreePass.TRUNK 逐 case 核对一致），但三处关键差异（勿互搬）：
//   ① 掷序：num4=Next(3) 在 num5=Next(10) **之前**（GrowTree 相反）——cs:31031-31032；
//   ② 基座/根部三个 num4 各自独立掷（cs:31321/31342/31359），GrowTree 复用一掷；
//   ③ 树冠门是 Next(8)（cs:31414），GrowTree 是 Next(13)。
// 入场门（cs:31009/1457 cs:31133）：基座=丛林草 60 且 nactive（active&&!inActive&&!half）
// 且无坡，且左右邻至少一侧 active 丛林草（★IIIII206：!inActive 判项曾缺,见 growUndergroundTree）。
// 净空门 EmptyTileCheck(ignoreID=20)（cs:31020→31611）：CommonSapling={20,590,595,615}
// 与植物白名单 {3,24,32,61,62,69,71,73,74,82,83,84,110,113,184,201,233,352,485,
// 529,530,637,655}（cs:31669-31691）以外任何 active 格 → 拒绝。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_BY_KEY, COMMON_SAPLING_IDS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { flipGenSolid } from './GenSolid';
import { genRangeFrame } from './FinalCleanupPass';

/** sheet(=原版 tile id)→ 内部 id;未实装时 0（空格）安全退化 */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
const sid = (sheet: number): number => SHEET_TO_INTERNAL.get(sheet) ?? 0;

const TREE = sid(5);                                  // Tiles_5（树干）
const JUNGLE_GRASS = idsByVanillaSheet(60);           // 基座唯一适配类型（cs:31009）
/** EmptyTileCheck 植物白名单（cs:31665-31695：CommonSapling 例外 + switch 白名单） */
const SAPLING_OK = COMMON_SAPLING_IDS; // TileID.Sets.CommonSapling——★BJ210 收编单源（内部 id 域,§6i）
const PLANT_OK = idsByVanillaSheet(
  3, 24, 32, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 184, 201, 233, 352, 485, 529, 530, 637, 655);
/** 根部方向适配类型（cs:31279/31283：草 2/腐化草 23/丛林草 60/蘑菇草 109/发光蘑菇草 147） */
const ROOT_FIT = idsByVanillaSheet(2, 23, 60, 109, 147);

/** 干身帧表：num5 case → num4(变体 0-2) → [fx,fy]（cs:31051-31189 逐 case，与
 *  TreePass.TRUNK 同值——同一张 Trees_5 贴图表；switch 无 case 的 8/9 走 default 档） */
const TRUNK: Array<Array<[number, number]>> = [
  [[0, 0], [0, 22], [0, 44]],       // case 0 = default（顶/底行强制档）
  [[0, 66], [0, 88], [0, 110]],     // case 1
  [[22, 0], [22, 22], [22, 44]],    // case 2
  [[44, 66], [44, 88], [44, 110]],  // case 3
  [[22, 66], [22, 88], [22, 110]],  // case 4
  [[88, 0], [88, 22], [88, 44]],    // case 5（左枝）
  [[66, 66], [66, 88], [66, 110]],  // case 6（右枝）
  [[110, 66], [110, 88], [110, 110]], // case 7（双枝）
  [[0, 0], [0, 22], [0, 44]],       // case 8 = default
  [[0, 0], [0, 22], [0, 44]],       // case 9 = default
];

/** EmptyTileCheck(startX,endX,startY,endY,20)（cs:31611-31699）：
 *  越界 false；CommonSapling 与植物白名单外的 active 格 → false */
function emptyTileCheckSapling(st: TileStore, x0: number, x1: number, y0: number, y1: number): boolean {
  if (x0 < 0 || x1 >= st.w || y0 < 0 || y1 >= st.h) return false;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const t = st.type[i];
      if (SAPLING_OK.has(t) || PLANT_OK.has(t)) continue;
      return false;
    }
  }
  return true;
}

/** GrowUndergroundTree(i, y, 0)（cs:31007-31457）。掷序=cs 实参左→右。
 *  内部 id 空格 0（无 active 位）≠ 原版幽灵 type——白名单按 type 读即全仓既定口径。
 *  导出供单测直调（pass 体的 Next(10) 门是概率性,单测绕门锁结构） */
export function growUndergroundTree(st: TileStore, rng: RNG, gs: GenState, i: number, y: number): void {
  const gi = st.idx(i, y);
  // 入场门（1457/1458 cs:31133；1456 cs:31009 同域）：丛林草 + nactive(=active&&
  //   !inActive&&!half，Tile.cs nactive 三判项) + 无坡 + 左右邻至少一侧丛林草。
  //   ★IIIII206（#69 定罪落刀）：曾缺 !inActive 判项——(417,808) 锚格 act=1/t60/
  //   inact=1，vanilla nactive()=false 入场即拒（0 掷），JS 误入掷 num2 后被
  //   EmptyTileCheck 拒（1 掷）⇒ 1 掷流位相移 ⇒ 全 pass 候选错位（JS 14 树 vs
  //   vanilla 10 树，#69 A=255/T=255 双向）。
  if (!st.flags[gi] || ((st.wire[gi] >>> 5) & 1) === 1 || !JUNGLE_GRASS.has(st.type[gi])
    || st.half[gi] === 1 || st.slope[gi] !== 0) return;
  const sideJungle = (dx: number) =>
    st.inBounds(i + dx, y) && !!st.flags[st.idx(i + dx, y)] && JUNGLE_GRASS.has(st.type[st.idx(i + dx, y)]);
  if (!sideJungle(-1) && !sideJungle(1)) return;

  const num2 = rng.int(5, 14);        // Next(5,15)：高度（在 EmptyTileCheck 之前消耗）
  const num3 = num2 + 2 + 5;          // +2（cs:31015）+5（type==60 恒真，cs:31016-31019）
  if (!emptyTileCheckSapling(st, i - 1, i + 1, y - num3, y - 1)) return;

  // 干身循环（cs:31027-31275）：num4 先掷、num5 后掷（与 GrowTree 相反！）
  let flagL = false, flagR = false;
  for (let j = y - num2; j < y; j++) {
    const num4 = rng.int(0, 2);
    let num5 = rng.int(0, 9);
    if (j === y - 1 || j === y - num2) num5 = 0;
    while (((num5 === 5 || num5 === 7) && flagL) || ((num5 === 6 || num5 === 7) && flagR)) {
      num5 = rng.int(0, 9);
    }
    flagL = false; flagR = false;
    if (num5 === 5 || num5 === 7) flagL = true;
    if (num5 === 6 || num5 === 7) flagR = true;
    const [fx, fy] = TRUNK[num5][num4];
    st.setTileSilent(i, j, TREE, fx, fy);
    // 左枝（cs:31190-31231）：变体掷在 <2 门之前（cs:31194-31195）
    if (num5 === 5 || num5 === 7) {
      const k = rng.int(0, 2);
      const [bfx, bfy] = rng.int(0, 2) < 2 ? [44, 198 + k * 22] : [66, k * 22];
      st.setTileSilent(i - 1, j, TREE, bfx, bfy);
    }
    // 右枝（cs:31232-31274）
    if (num5 === 6 || num5 === 7) {
      const k = rng.int(0, 2);
      const [bfx, bfy] = rng.int(0, 2) < 2 ? [66, 198 + k * 22] : [88, 66 + k * 22];
      st.setTileSilent(i + 1, j, TREE, bfx, bfy);
    }
  }

  // 根部方向（cs:31276-31316）：num6=Next(3)，两侧整砖草族适配重映射
  let num6 = rng.int(0, 2);
  const rootFit = (dx: number) => {
    if (!st.inBounds(i + dx, y)) return false;
    const si = st.idx(i + dx, y);
    // cs:31379/31387 flag3/flag4 判项=nactive()&&!halfBrick()&&slope()==0&&草族——
    //   nactive 含 !inActive（★IIIII206 补,与入场门同款缺项）
    return !!st.flags[si] && ((st.wire[si] >>> 5) & 1) === 0 && st.half[si] === 0
      && st.slope[si] === 0 && ROOT_FIT.has(st.type[si]);
  };
  const fitL = rootFit(-1), fitR = rootFit(1);
  if (!fitL) { if (num6 === 0) num6 = 2; else if (num6 === 1) num6 = 3; }
  if (!fitR) { if (num6 === 0) num6 = 1; else if (num6 === 2) num6 = 3; }
  if (fitL && !fitR) num6 = 2;
  if (fitR && !fitL) num6 = 1;
  // 右根/左根/基座三个变体各自独立掷（cs:31321/31342/31359——GrowTree 复用一掷，勿搬）
  if (num6 === 0 || num6 === 1) {
    st.setTileSilent(i + 1, y - 1, TREE, 22, 132 + rng.int(0, 2) * 22);
  }
  if (num6 === 0 || num6 === 2) {
    st.setTileSilent(i - 1, y - 1, TREE, 44, 132 + rng.int(0, 2) * 22);
  }
  const baseK = rng.int(0, 2); // 无条件掷（cs:31359）；num6==3 时掷而不用（switch 无 case）
  const baseFx = num6 === 0 ? 88 : num6 === 1 ? 0 : num6 === 2 ? 66 : -1;
  if (baseFx >= 0) st.setTileSilent(i, y - 1, TREE, baseFx, 132 + baseK * 22);

  // 树冠标记帧（cs:31414-31451）：Next(8)!=0 → fx=22（GrowTree 是 Next(13)，勿搬）
  const crownFx = rng.int(0, 7) !== 0 ? 22 : 0;
  st.setTileSilent(i, y - num2, TREE, crownFx, 198 + rng.int(0, 2) * 22);
  // ★R13-1（2026-08-24）：尾段 RangeFrame(i-2, y-num2-1, i+2, y+1)（GrowUndergroundTree
  //  唯一出口 cs:31576；GrowTree cs:30529/GrowEpicTree cs:27929/GrowPalmTree cs:27471/
  //  GrowTreeWithSettings cs:30999 同款尾扫——六个树种植原语最后一个补齐件）。
  //  RangeFrame→TileFrame 对盒内每格：①死格(!active)清 half/slope/块漆（cs:82078-82082）；
  //  ②盒内 184 苔芽每访恒掷 Next(3)（MossAndMossCaves cs:17588 在本 pass cs:17967 之前
  //  运行，苔芽真实存在）→ 掷流位级对拍依赖此扫；③盒内 596/616/583-589 苗重帧。
  genRangeFrame(st, rng, i - 2, y - num2 - 1, i + 2, y + 1);
  // 砍伐整棵判定登记（TreePass 同形：y=树顶,h=干高,t.y+t.h=基座行）
  gs.genTrees.push({ x: i, y: y - num2, h: num2 });
}

/** pass 体（cs:17952-17970）。★pass 头 tileSolid[379]=true（cs:17956，SpiderCaves
 *  cs:17459 翻 false 后的还原位；此后保持 true 到 SpawnPoint 头 cs:19628 再翻） */
export function runUndergroundJungleTreesPass(st: TileStore, rng: RNG, gs: GenState): void {
  flipGenSolid([379], true);
  const { w, h } = st;
  const yStart = gs.worldSurface - 1;
  const yEnd = h - 350;
  for (let i = 0; i < w; i++) {
    for (let j = yStart; j < yEnd; j++) {
      // Next(10)==0 门（cs:17963 `Next(10)==0 || drunkWorldGen`）——★IIIII14：drunk
      // 恒真（每格都尝试长地下树；判定骰照常消耗,与原版 || 短路一致）
      if (rng.int(0, 9) === 0 || gs.seedFlags.drunkWorld) {
        growUndergroundTree(st, rng, gs, i, j);
      }
    }
  }
}
