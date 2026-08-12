// 原版 pass 94 "Oasis"（1456 WorldGen.cs:16327-16352 + PlaceOasis cs:10716-10952）1:1。
// 注册序：SettleLiquids(16215) < RemoveSurfaceWaterAboveSand(16295) < Oasis(16327)
//   < ShellPilesMarblePilesAndSpikePits(16353) < SmoothWorld(16507)——接线须在
//   "沙上清水"之后、"海滩装饰/半砖平滑"之前（WorldGen.ts passes 数组）。
// 语义：
//   数量 = w/2100（C# int 除法）+ Next(2)；每片最多 w*2 次尝试
//   （x∈[beachDistance+300, w-同]，y∈[100, worldSurface)），PlaceOasis 成功即止。
//   PlaceOasis：起点须空气无墙 → 下扫到首个活性格/有墙格（≤worldSurface）且该格
//   是沙 53（深度 > worldSurface-10 即拒）→ 350 内已有绿洲即拒 → 全盒异物拒
//   （活性实心非沙=拒；盒心液/墙=拒；沙化石 151/硬化沙 397 在盒心=拒）→
//   边缘下探 ≤20 格 → 双椭圆扫描挖水塘（n==i+1 液 127、n>i+1 液 255，水；
//   盒外缘硬化成沙）→ 第二遍岸线细节（凹岸补沙 + 随机凸起）→
//   登记 GenVars.oasisPosition/oasisWidth（numOasis 上限 20）。
// 下游联动（本轮不实现，备案）：pass 96 CactusPalmTreesAndCoral 头段
//   （cs:21129-21153）消费 oasisPosition/oasisWidth/oasisHeight——绿洲棕榈 323
//   （常态 1/8、邻域 17×17 内已有 323 时 0.13）、海滨燕麦 593、绿洲植物 530
//   （PlaceOasisPlant）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_DEFS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';

/** GenVars.maxOasis / oasisHeight（GenVars.cs:260/268） */
const MAX_OASIS = 20;
const OASIS_HEIGHT = 20;
/** 盒心异物拒的沙化石 151 + 硬化沙 397（cs:10754-10758） */
const OASIS_REJECT = idsByVanillaSheet(151, 397);

const activeAt = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] === 1;
const solidAt = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const k = st.idx(x, y);
  return st.flags[k] === 1 && !!TILE_DEFS[st.type[k]]?.solid;
};
const wallAt = (st: TileStore, x: number, y: number): number =>
  st.inBounds(x, y) ? st.wall[st.idx(x, y)] : 0;

/** PlaceOasis（cs:10716-10952）。成功即登记 gs.oasisX/oasisY/oasisW 并返回 true。 */
export function placeOasis(st: TileStore, rng: RNG, gs: GenState, X: number, Y: number): boolean {
  if (!st.inBounds(X, Y)) return false;
  let i = Y;
  if (!st.flags[st.idx(X, i)] && st.wall[st.idx(X, i)] === 0) {
    // cs:10724-10728：空气无墙下扫，直到活性格/有墙格/越过 worldSurface
    while (i < st.h - 1 && !st.flags[st.idx(X, i)] && st.wall[st.idx(X, i)] === 0
      && i <= gs.worldSurface) {
      i++;
    }
    if (i > gs.worldSurface - 10) return false;              // cs:10731
    if (st.type[st.idx(X, i)] !== T.SAND) return false;      // cs:10734：地表须沙 53
    // cs:10736-10743：350 内已有绿洲即拒（Vector2D.Distance = sqrt）
    for (let j = 0; j < gs.numOasis; j++) {
      const dx = gs.oasisX[j]! - X, dy = gs.oasisY[j]! - i;
      if (Math.sqrt(dx * dx + dy * dy) < 350) return false;
    }
    const num2 = rng.int(45, 60);                            // cs:10745 Next(45,61)
    const num3 = num2 + 50;                                  // cs:10746
    const num4 = 4;                                          // cs:10747
    // cs:10749-10779：全盒异物扫描（OOB 读 = 空格：inactive/wall 0/liquid 0）
    for (let k = X - num3; k <= X + num3; k++) {
      for (let l = i - OASIS_HEIGHT; l <= i + OASIS_HEIGHT + num4; l++) {
        const inB = st.inBounds(k, l);
        const kk = inB ? st.idx(k, l) : -1;
        if (inB && st.flags[kk]) {
          const t = st.type[kk]!;
          if (TILE_DEFS[t]?.solid) {
            if (OASIS_REJECT.has(t) && Math.abs(k - X) < num2
              && Math.abs(l - i) < Math.trunc(OASIS_HEIGHT / 2)) return false;
            if (t !== T.SAND) return false;                  // 活性实心非沙 → 拒
          }
        } else if (inB && (st.liquid[kk!] > 0 || st.wall[kk!] > 0)
          && Math.abs(k - X) < num2 && Math.abs(l - i) < Math.trunc(OASIS_HEIGHT / 2)) {
          return false;                                      // 盒心有液/墙 → 拒
        }
      }
      // cs:10781-10790：k > X-num2/2 && k < X-num2/2 恒假（原版笔误死代码）——无掷骰
    }
    // cs:10792-10800：边缘下探 ≤20 格（±num2 列在 i+5 行须活性无墙）
    const num6 = i;
    while (!activeAt(st, X - num2, i + 5) || wallAt(st, X - num2, i + 5) !== 0
      || !activeAt(st, X + num2, i + 5) || wallAt(st, X + num2, i + 5) !== 0) {
      i++;
      if (i - num6 > 20) break;
    }
    const num7 = Math.trunc(num2 / 2);                       // cs:10802
    // ---- 第一遍：双椭圆挖水塘 + 沙缘硬化（cs:10804-10878）----
    let num8 = Math.max(0, X - num2 * 3);
    let num9 = Math.min(st.w, X + num2 * 3);
    const num10 = Math.max(0, i - OASIS_HEIGHT * 4);
    let num11 = Math.min(st.h, i + OASIS_HEIGHT * 3);
    for (let m = num8; m < num9; m++) {
      for (let n = num10; n < num11; n++) {
        const num12 = Math.abs(m - X) * 0.7;
        const num13 = Math.abs(n - i) * 1.35;
        const num14 = Math.sqrt(num12 * num12 + num13 * num13);
        const num15 = num7 * (0.53 + rng.next() * 0.04);     // cs:10819：每格一掷 NextDouble
        let num16 = Math.abs(m - X) / (num9 - X);            // cs:10821
        num16 = 1 - num16;
        num16 *= 2.3;
        num16 *= num16;
        num16 *= num16;
        const ti = st.idx(m, n);
        if (num14 < num15) {
          // 水塘：n==i+1 半格水 127，更深处满水 255（cs:10826-10833）
          if (n === i + 1) st.liquid[ti] = 127;
          else if (n > i + 1) st.liquid[ti] = 255;
          if (st.liquid[ti] > 0) st.liquidType[ti] = 1;      // lava(false) → 水
          st.flags[ti] = 0;                                  // active(false)（保留 type 幽灵）
        } else if (n < i && num12 < num15 + Math.abs(n - i) * 3 * num16) {
          // 塘上凹缘：沙格挖空（cs:10836-10840）
          if (st.type[ti] === T.SAND) st.flags[ti] = 0;
        } else if (n >= i && num12 < num15 + Math.abs(n - i) * num16 && st.wall[ti] === 0) {
          // 塘下/侧缘硬化成沙（cs:10842-10854）
          if (st.flags[ti] && !!TILE_DEFS[st.type[ti]]?.solid
            && !TILE_DEFS[st.type[ti]]?.platform) {
            st.slope[ti] = 0;
            st.half[ti] = 0;
            continue;
          }
          st.flags[ti] = 1;
          st.type[ti] = T.SAND;
          st.slope[ti] = 0;
          st.half[ti] = 0;
        }
      }
    }
    // ---- 第二遍：岸线细节（cs:10857-10926）----
    const num17 = 50;
    num8 = X - num2 * 2;
    num9 = X + num2 * 2;
    num11 = i + OASIS_HEIGHT * 2;
    const num23 = num7 * 0.5700000000000001;                 // cs:10866
    for (let num18 = num8; num18 < num9; num18++) {
      for (let num19 = num11; num19 >= i; num19--) {
        const num20 = Math.abs(num18 - X) * 0.7;
        const num21 = Math.abs(num19 - i) * 1.35;
        const num22 = Math.sqrt(num20 * num20 + num21 * num21);
        if (num22 <= num23) continue;                        // 水塘内部不动
        if (activeAt(st, num18, num19) || wallAt(st, num18, num19) !== 0) continue;
        // 东向找岸线实体（cs:10876-10886）
        let num25 = -1;
        for (let num26 = num18; num26 <= num18 + num17
          && solidAt(st, num26, num19 + 1) && wallAt(st, num26, num19) <= 0; num26++) {
          if (activeAt(st, num26, num19) && solidAt(st, num26, num19)) {
            num25 = num26;
            break;
          }
          if (activeAt(st, num26, num19)) break;
        }
        // 西向镜像（cs:10888-10899）
        let num24 = -1;
        let num27 = num18;
        while (num27 >= num18 - num17 && solidAt(st, num27, num19 + 1)
          && wallAt(st, num27, num19) <= 0) {
          if (activeAt(st, num27, num19) && solidAt(st, num27, num19)) {
            num24 = num27;
            break;
          }
          if (activeAt(st, num27, num19)) break;
          num27--;
        }
        // cs:10901：flag 被无条件覆写为 true（原版怪癖，保留）
        if (num24 > -1 && num25 > -1) {
          let num28 = 0;
          for (let num29 = num24 + 1; num29 < num25; num29++) {
            // cs:10907-10909：岸距 >5 时 1/5 概率掷凸起高度 Next(5,10)
            if (num25 - num24 > 5 && rng.int(0, 4) === 0) num28 = rng.int(5, 9);
            st.flags[st.idx(num29, num19)] = 1;
            st.type[st.idx(num29, num19)] = T.SAND;
            if (num28 > 0) {
              num28--;
              st.flags[st.idx(num29, num19 - 1)] = 1;
              st.type[st.idx(num29, num19 - 1)] = T.SAND;
            }
          }
        }
      }
    }
    // cs:10929-10936：登记（上限 maxOasis=20）
    if (gs.numOasis < MAX_OASIS) {
      gs.oasisX[gs.numOasis] = X;
      gs.oasisY[gs.numOasis] = i;
      gs.oasisW[gs.numOasis] = num2;
      gs.numOasis++;
    }
    return true;
  }
  return false;
}

/** pass 94 本体（cs:16327-16352）。cs:16329 拒绝条件：Skyblock.denyAllGeneration /
 *  roundLandmasses / noSurface /（蜜蜂世界且非 dontStarve）——本仓库仅建模
 *  skyblock 与 notTheBees（roundLandmasses/noSurface 未建模）。 */
export function runOasisPass(st: TileStore, rng: RNG, gs: GenState): void {
  if (gs.seedFlags.skyblock) return;
  if (gs.seedFlags.notTheBees && !gs.seedFlags.theConstant) return;
  let num = Math.trunc(st.w / 2100);                         // C# int 除法
  num += rng.int(0, 1);                                      // cs:16336 Next(2)
  for (let i = 0; i < num; i++) {
    let budget = st.w * 2;                                   // cs:16341 num3
    const lo = gs.beachDistance + 300;                       // cs:16340 num2
    while (budget > 0) {
      budget--;
      const x = rng.int(lo, st.w - lo - 1);                  // cs:16344 Next(lo, w-lo)
      const y = rng.int(100, gs.worldSurface - 1);           // cs:16345 Next(100, (int)worldSurface)
      if (placeOasis(st, rng, gs, x, y)) budget = -1;
    }
  }
}
