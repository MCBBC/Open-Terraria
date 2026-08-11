// 原版 pass "Shimmer"(WorldGen.cs:15256-15308)+ ShimmerMakeBiome(cs:34889-35083)
// 1:1 移植:以太生物群系——圆形石壳(型 1)+ 腔体挖空 + 底部微光液 +
// 两侧隧道开口 + (num==0 时)地表石笋柱 + aether 宝石树。
// 位置(cs:15274-15275):地牢异侧 dungeonSide<Right → Next(0.89w, w-200),
// 否则 Next(200, 0.11w);y∈[(ws+rl)/2+50, ((h-250)*2+rl)/3](失败重掷见下)。
// 失败重试(cs:15283-15300):前 1e4 次不变 x 带;>20000 次放宽到 0.8/0.2 带,
// y 下限改为 ws+120;成功后 GenVars.shimmerPosition → gs.shimmerX/Y。
// aether 树(cs:35057-35083):500 次 X±70 / Y±2 采样,两侧整砖即种
// TryGrowingTreeByType(583-589 宝石树)——实现见 TreePass.growGemTree
// (GrowTreeWithSettings 1:1;宝石树砍伐掉落/树苗生长未接,静态种植)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { growGemTree } from './TreePass';

const STONE = TILE_BY_KEY['stone']!;         // 原版 type 1
const STALACTITE = TILE_BY_KEY['v_165_cave_decos']!; // 原版 type 165(PlaceTight)
const CRIMSTONE = TILE_BY_KEY['v_203_crimstone_block']!;
const EBONSTONE = TILE_BY_KEY['v_25_ebonstone_block']!;
const LIQ_SHIMMER = 4; // 原版 liquidType 3(shimmer)→ 本仓库 +1 编码
/** aether 宝石树 tile 表（cs:35063-35079 num24=0..6 → treeTileType） */
const GEM_TREES = [
  TILE_BY_KEY['v_583_topaz_tree']!,
  TILE_BY_KEY['v_584_amethyst_tree']!,
  TILE_BY_KEY['v_585_sapphire_tree']!,
  TILE_BY_KEY['v_586_emerald_tree']!,
  TILE_BY_KEY['v_587_ruby_tree']!,
  TILE_BY_KEY['v_588_diamond_tree']!,
  TILE_BY_KEY['v_589_amber_tree']!,
];

export function runShimmerPass(st: TileStore, rng: RNG, gs: GenState): void {
  const w = st.w, h = st.h;
  const ws = Math.floor(gs.worldSurface), rl = Math.floor(gs.rockLevel);
  // cs:15259-15268:深度带
  const yLoBase = Math.trunc((ws + rl) / 2) + 50;
  let yHi = Math.trunc(((h - 250) * 2 + rl) / 3);
  if (yHi > h - 330 - 100 - 30) yHi = h - 330 - 100 - 30;
  if (yHi <= yLoBase) yHi = yLoBase + 50;
  const pickX = (wide: boolean): number =>
    gs.dungeonSide < 1
      ? rng.int(Math.trunc(w * (wide ? 0.8 : 0.89)), w - 201)
      : rng.int(200, Math.trunc(w * (wide ? 0.2 : 0.11)) - 1);
  let x = pickX(false);
  let y = rng.int(yLoBase, yHi - 1);
  let tries = 0;
  while (!shimmerMakeBiome(st, rng, gs, x, y)) {
    tries++;
    if (tries > 20000) {
      // cs:15292-15295:放宽 x 带(0.8w/w-200 或 200/0.2w),y 下限 ws+100+20
      y = rng.int(ws + 100 + 20, yHi - 1);
      x = pickX(true);
    } else {
      // cs:15297-15300:y 下限 (ws+rl)/2+20,x 带不变
      y = rng.int(Math.trunc((ws + rl) / 2) + 20, yHi - 1);
      x = pickX(false);
    }
  }
  gs.shimmerX = x;
  gs.shimmerY = y;
}

/** cs:34889-35056 ShimmerMakeBiome 主体 */
function shimmerMakeBiome(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number): boolean {
  void gs;
  const variant = rng.int(0, 1); // genRand.Next(2)
  let n2 = 0.6, n3 = 1.3, n4 = 0.3;
  if (variant === 0) { n2 = 0.55; n3 = 2.0; }
  n2 *= 1.05 - rng.next() * 0.1;
  n3 *= 1.05 - rng.next() * 0.1;
  n4 *= 1.0 - rng.next() * 0.1;
  const n5 = rng.int(105, 124); // Next(105,125)
  const n6 = Math.trunc(n5 * n4);
  const n7 = Math.trunc(n5 * n2);
  const n8 = rng.int(9, 12);    // Next(9,13)
  let x0 = X - n5, x1 = X + n5, y0 = Y - n5, y1 = Y + n5;
  // cs:34912-34924:越界(50 边距)或含猩红/腐化石 → false
  for (let k = y0; k <= y1; k++) {
    for (let l = x0; l <= x1; l++) {
      if (!st.inBounds(l, k) || l < 50 || k < 50 || l >= st.w - 50 || k >= st.h - 50) return false;
      const t = st.type[st.idx(l, k)];
      if (t === CRIMSTONE || t === EBONSTONE) return false;
    }
  }
  let n13 = Y, n14 = Y - n8;
  // cs:34930-35050:主体塑形
  for (let k = y0; k <= y1; k++) {
    for (let l = x0; l <= x1; l++) {
      const i = st.idx(l, k);
      st.liquid[i] = 0;
      if (rng.int(0, 3) === 0) n13 = Y - rng.int(0, 1);
      if (rng.int(0, 3) === 0) n14 = Y - n8 + rng.int(0, 1);
      // num15:上半纵压 1.4 / 下半 1.2(各 ±2% 抖动)
      let n15 = Math.trunc(Math.sqrt(
        (Math.abs(l - X) * (1 + rng.next() * 0.02)) ** 2 +
        (Math.abs(k - Y) * (k <= Y ? 1.4 : 1.2) * (1 + rng.next() * 0.02)) ** 2,
      ));
      if (n15 < n5) {
        st.slope[i] = 0; st.half[i] = 0;
        st.type[i] = STONE;
        if (l > x0 + 5 + rng.int(0, 1) && l < x1 - 5 - rng.int(0, 1)) st.flags[i] = 1;
        if (n15 < n5 * 0.9) st.wall[i] = 0;
      }
      n15 = Math.trunc(Math.sqrt(
        (Math.abs(l - X) * (1 + rng.next() * 0.02)) ** 2 +
        (Math.abs(k - Y) * n3 * (1 + rng.next() * 0.02)) ** 2,
      ));
      if (k > n14 && k < n13) st.flags[i] = 0;
      if (k < n13 && n15 < Math.trunc(n7 * (1 + rng.next() * 0.02))) st.flags[i] = 0;
      n15 = Math.trunc(Math.sqrt(
        (Math.abs(l - X) * (1 + rng.next() * 0.02)) ** 2 +
        (Math.abs(k - Y) * 2 * (1 + rng.next() * 0.02)) ** 2,
      ));
      if (k < Y - 1 || n15 >= Math.trunc(n6 * (1 + rng.next() * 0.025))) continue;
      if (k <= Y + 2 || n15 !== n6 - 1 || rng.int(0, 1) !== 0) st.flags[i] = 0;
      if (k >= Y) {
        st.liquid[i] = k === Y ? 127 : 255;
        st.liquidType[i] = LIQ_SHIMMER;
      }
    }
  }
  // cs:35020-35046:variant==0 的地表石柱列(两侧聚拢的土丘+石笋)
  if (variant === 0) {
    x0 = Math.trunc(X - n5 * n4) - rng.int(-15, 0) - 5;
    x1 = Math.trunc(X + n5 * n4) + rng.int(0, 15);
    let num16 = 0;
    for (let m = x0; m < x1; m += rng.int(9, 13)) {
      let n17 = Y - 3;
      while (st.inBounds(m, n17) && !st.flags[st.idx(m, n17)]) n17--;
      if (!st.inBounds(m, n17)) continue;
      n17 -= 4;
      let n18 = rng.int(5, 9);   // Next(5,10)
      let n19 = rng.int(15, 20); // Next(15,21)
      while (n18 > 0) {
        for (let n = m - n18; n < m + n18; n++) {
          if (!st.inBounds(n, n17)) continue;
          const ti = st.idx(n, n17);
          st.type[ti] = STONE; st.flags[ti] = 1;
        }
        num16++;
        if (rng.int(0, 2) < num16) { num16 = 0; n18--; m += rng.int(-1, 1); }
        if (n19 <= 0) n18--;
        n19--;
        n17++;
      }
      const n = m + n18 - rng.int(1, 2); // 循环退出后 n == m+num18,再退 Next(1,3)
      if (st.inBounds(n, n17 - 2)) { const ti = st.idx(n, n17 - 2); st.type[ti] = STONE; st.flags[ti] = 1; }
      if (st.inBounds(n, n17 - 1)) { const ti = st.idx(n, n17 - 1); st.type[ti] = STONE; st.flags[ti] = 1; }
      if (st.inBounds(n, n17)) { const ti = st.idx(n, n17); st.type[ti] = STONE; st.flags[ti] = 1; }
      if (rng.int(0, 1) === 0) {
        if (st.inBounds(n, n17 + 1)) { const ti = st.idx(n, n17 + 1); st.type[ti] = STONE; st.flags[ti] = 1; }
        placeTight(st, rng, n, n17 + 2);
      } else {
        placeTight(st, rng, n, n17 + 1);
      }
    }
  }
  // cs:35054-35055:两侧隧道开口
  shimmerOpening(st, rng, -1, X - n5, Y, n8);
  shimmerOpening(st, rng, 1, X + n5, Y, n8);
  // cs:35057-35083:aether 宝石树——500 次 X±70/Y±2 采样,两侧 SolidTile 才种
  const solidTile = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const d = TILE_DEFS[st.type[i]];
    return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
  };
  for (let n = 0; n < 500; n++) {
    const tx = rng.int(X - 70, X + 69);              // Next(X-70, X+70)
    const ty = rng.int(Y - 2, Y + 2);                // Next(Y-2, Y+3)
    const treeType = GEM_TREES[rng.int(0, 6)];       // num24=Next(7)（SolidTile 判定前消耗，保持流位）
    if (!solidTile(tx - 1, ty) || !solidTile(tx + 1, ty)) continue;
    growGemTree(st, rng, tx, ty, treeType);
  }
  return true;
}

/** cs:35095-35125 ShimmerMakeBiomeOpening */
function shimmerOpening(st: TileStore, rng: RNG, dir: number, X: number, Y: number, size: number): void {
  let num = X;
  let y = Y;
  size--;
  const solidAt = (x: number, yy: number) =>
    st.inBounds(x, yy) && st.flags[st.idx(x, yy)] !== 0;
  for (;;) {
    num += dir;
    let open = true;
    for (let i = y - size + 1; i < y - 1; i++) {
      if (solidAt(num, i)) open = false;
      if (solidAt(num + dir, i)) open = false;
      if (solidAt(num + dir * 2, i)) open = false;
      if (st.inBounds(num, i)) st.flags[st.idx(num, i)] = 0;
    }
    for (let j = y - size; j < y; j++) {
      if (st.inBounds(num - dir, j)) st.flags[st.idx(num - dir, j)] = 0;
    }
    if (solidAt(num - dir, y - size - 1) && st.inBounds(num - dir, y - size - 1)) st.wall[st.idx(num - dir, y - size - 1)] = 0;
    if (solidAt(num - dir, y) && st.inBounds(num - dir, y)) st.wall[st.idx(num - dir, y)] = 0;
    if (rng.int(0, 1) === 0) y += rng.int(-1, 1);
    if (open || num < 50 || num > st.w - 50 || Math.abs(num - X) > 100) break;
  }
}

/** cs:38329 PlaceTight 简化:石笋 165(PreferSmall 随机 1-2 格高,雪原小支不触发) */
function placeTight(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y) || st.flags[st.idx(x, y)]) return;
  if (!st.inBounds(x, y - 1) || !st.flags[st.idx(x, y - 1)]) return; // SolidTile(x, y-1)
  if (st.inBounds(x, y + 1) && st.flags[st.idx(x, y + 1)]) return;   // !(x,y+1).active
  const preferSmall = rng.int(0, 1) === 0;
  const variation = rng.int(0, 2);
  const fx = variation * 18;
  st.setTileSilent(x, y, STALACTITE, fx, 0);
  if (!preferSmall && st.inBounds(x, y + 1) && !st.flags[st.idx(x, y + 1)]) {
    st.setTileSilent(x, y + 1, STALACTITE, fx, 18);
  }
}
