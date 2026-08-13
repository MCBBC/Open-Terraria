// 原版 pass 21 "Marble"（cs:12800 + MarbleBiome.cs）/ 22 "Granite"（cs:12884 + GraniteBiome.cs）1:1。
// 大理石：3×3 板格穹顶洞窟——板状态机（空/实心/半砖/四三角）+ SmoothSlope 重分类，
// 上半中空（墙 178）下半实心大理石（367），矿石保留，PlaceTight 钟乳石 165。
// 花岗岩：200×200 magma 压力模拟（300 轮细胞自动机）→ 实心花岗岩体（368，墙 180）
// + ShouldUseLava + 孤块清理 + FastRandom(65440) 钟乳石装饰。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { FastRandom } from '../../../core/rng';

const MARBLE = TILE_BY_KEY['v_367_marble_block']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;
import { placeTight, placeUncheckedStalactite as placeStalactiteWithRolls } from './ShimmerPass';
import { genSolidType } from './GenSolid';
const STALACTITE = TILE_BY_KEY['v_165_cave_decos']!; // 仅哈希/置型用；帧走 ShimmerPass
const SNOW = TILE_BY_KEY['snow']!, ICE = TILE_BY_KEY['ice']!, THIN_ICE = TILE_BY_KEY['thin_ice']!;
const MUSH_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const MUSH_TREE = TILE_BY_KEY['v_72_mushroom_tree']!;
const SANDSTONE = TILE_BY_KEY['sandstone']!, HARDSAND = TILE_BY_KEY['hardened_sand']!;

/** WorldGenRange Count（Configuration.json：Marble=WorldArea、Granite=WorldWidth，均 Min4/Max8）。
 *  4200×1200 两模式 scale 均 = 1 → Next(4,9)。 */
function worldGenRangeCount(st: TileStore, rng: RNG, min: number, max: number, mode: 'area' | 'width'): number {
  const scale = mode === 'area' ? (st.w * st.h) / 5040000 : st.w / 4200;
  const lo = Math.max(1, Math.trunc(scale * min));
  const hi = Math.max(lo, Math.trunc(scale * max));
  return rng.int(lo, hi); // Next(scaledMin, scaledMax+1)
}

/** BiomeTileCheck（cs:10949）1:1：半径 50 逐格；368/367/147/161/162/70/72/396/397
 *  （active 才判）+ 墙 187/216（无视 active）。 */
export function biomeTileCheck(st: TileStore, x: number, y: number): boolean {
  for (let i = x - 50; i <= x + 50; i++) {
    for (let j = y - 50; j <= y + 50; j++) {
      if (!st.inBounds(i, j)) continue;
      const k = st.idx(i, j);
      if (st.flags[k]) {
        const t = st.type[k];
        if (t === GRANITE || t === MARBLE || t === SNOW || t === ICE || t === THIN_ICE
          || t === MUSH_GRASS || t === MUSH_TREE || t === SANDSTONE || t === HARDSAND) return true;
      }
      const wl = st.wall[k];
      if (wl === 187 || wl === 216) return true;
    }
  }
  return false;
}

function solidTileAt(st: TileStore, x: number, y: number): boolean {
  // ★生成期实心走 genSolidType（cs:12537 起生成期 tileSolid[484]=false）：本 pass
  // 在 Desert 之后，CA 初值/放置门/清理门的 SolidTile 查询若用裸 TILE_DEFS.solid
  // （484=true），与 oracle 的 SOLID.Remove(484) 分叉——地下沙漠边缘的 484 会被
  // JS 当实心花岗岩腔壁（granite checkpoint 三哈希全差）。
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0
    && genSolidType(st.type[st.idx(x, y)]);
}

/** TileID.Sets.Ore（TileID.cs:399，19 个）——大理石/花岗岩 ResetToType 的矿石保留判定。
 *  曾抄成 20/203/70/21/116/234 的杂表 → 花岗岩体内矿石被吞（granite checkpoint 纯 type 差） */
const VANILLA_ORE = new Set([7, 166, 6, 167, 9, 168, 8, 169, 22, 204, 37, 58, 107, 221, 108, 222, 111, 223, 211]);
function isOreType(t: number): boolean {
  const v = TILE_DEFS[t]?.vanilla?.sheet;
  return v != null && VANILLA_ORE.has(v);
}

export function runMarbleGranitePass(st: TileStore, rng: RNG, gs: GenState): void {
  runMarblePass(st, rng, gs);
  runGranitePass(st, rng, gs);
}

/** cs:12800-12883：采样带 = n/num*(w-200)+100 起宽 (w-160)/num；
 *  y∈[GenVars.rockLayer+20, +(h-rockLayer-40-200))；中部 45-55% 重掷 beachDistance..w-；
 *  100 次预算；失败计数 > w*10 收缩 count。Place 内联在采样环（BiomeTileCheck 双查）。 */
export function runMarblePass(st: TileStore, rng: RNG, gs: GenState): void {
  let count = worldGenRangeCount(st, rng, 4, 8, 'area');
  let placed = 0, fails = 0;
  while (placed < count) {
    const frac = placed / count;
    let x = 0, y = 0, ok = false;
    let budget = 100;
    while (!ok) {
      budget--;
      if (budget <= 0) break;
      const x0 = Math.trunc(frac * (st.w - 200)) + 100;
      x = rng.int(x0, x0 + Math.trunc((st.w - 160) / count) - 1);   // RandomRectanglePoint 先 X
      const y0 = Math.trunc(gs.genRockLayer) + 20;                   // GenVars.rockLayer（raw 截断）
      y = rng.int(y0, y0 + (st.h - (Math.trunc(gs.genRockLayer) + 40) - 200) - 1);  // 后 Y
      while (x > st.w * 0.45 && x < st.w * 0.55) x = rng.int(gs.beachDistance, st.w - gs.beachDistance - 1);
      ok = true;
    }
    fails++;
    if (ok && marblePlace(st, rng, x, y)) { placed++; fails = 0; }
    else if (fails > st.w * 10) { count = placed; placed++; fails = 0; }
  }
}

/** MarbleBiome.Place（MarbleBiome.cs:180-253）1:1 */
function marblePlace(st: TileStore, rng: RNG, ox0: number, oy0: number): boolean {
  if (biomeTileCheck(st, ox0, oy0)) return false;
  const bn = Math.trunc(rng.int(80, 149) / 3);          // Next(80,150)/3
  const bn2 = Math.trunc(rng.int(40, 59) / 3);          // Next(40,60)/3
  const bn3 = Math.trunc((bn2 * 3 - rng.int(20, 29)) / 3);
  const ox = ox0 - Math.trunc(bn * 3 / 2), oy = oy0 - Math.trunc(bn2 * 3 / 2);
  // Slab 状态机：0空 1实心 2半砖 3右下 4左下 5右上 6左上
  const state: number[][] = [];
  const hasWall: boolean[][] = [];
  for (let i = 0; i < bn + 2; i++) { state.push(new Array(bn2 + 2).fill(0)); hasWall.push(new Array(bn2 + 2).fill(false)); }
  const groupSolid = (x: number, y: number): boolean => {
    let cnt = 0;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (solidTileAt(st, x + a, y + b)) cnt++;
    return cnt > 0;                                     // scale/4*3 = 0（int 除）
  };
  for (let i = -1; i < bn + 1; i++) {
    const n4 = (i - Math.trunc(bn / 2)) / bn + 0.5;
    const n5 = Math.trunc((0.5 - Math.abs(n4 - 0.5)) * 5) - 2;
    for (let j = -1; j < bn2 + 1; j++) {
      let wall = true, solid = false;
      const g2 = groupSolid(i * 3 + ox, j * 3 + oy);
      const n6 = Math.abs(j - Math.trunc(bn2 / 2)) - Math.trunc(bn3 / 4) + n5;
      if (n6 > 3) { solid = g2; wall = false; }
      else if (n6 > 0) { solid = j - Math.trunc(bn2 / 2) > 0 || g2; wall = j - Math.trunc(bn2 / 2) < 0 || n6 <= 2; }
      else if (n6 === 0) solid = rng.int(0, 1) === 0 && (j - Math.trunc(bn2 / 2) > 0 || g2);
      if (Math.abs(n4 - 0.5) > 0.35 + rng.next() * 0.1 && !g2) { wall = false; solid = false; }
      state[i + 1]![j + 1] = solid ? 1 : 0;
      hasWall[i + 1]![j + 1] = wall;
    }
  }
  const slabSolid = (s: number, lx: number, ly: number, scale: number): boolean => {
    switch (s) {
      case 0: return false;
      case 1: return true;
      case 2: return ly >= Math.trunc(scale / 2);
      case 3: return lx >= scale - ly;
      case 4: return lx < ly;
      case 5: return lx > ly;
      case 6: return lx < scale - ly;
      default: return true;
    }
  };
  // SmoothSlope（MarbleBiome.cs:79-110）：4 邻实心码 → 状态重分类
  for (let i = 0; i < bn; i++) {
    for (let j = 0; j < bn2; j++) {
      const sx = i + 1, sy = j + 1;
      if (state[sx]![sy] === 0) continue;
      const code = ((state[sx]![sy - 1] !== 0 ? 1 : 0) << 3)
        | ((state[sx]![sy + 1] !== 0 ? 1 : 0) << 2)
        | ((state[sx - 1]![sy] !== 0 ? 1 : 0) << 1)
        | (state[sx + 1]![sy] !== 0 ? 1 : 0);
      state[sx]![sy] = code === 10 ? 6 : code === 9 ? 5 : code === 6 ? 4 : code === 5 ? 3 : code === 4 ? 2 : 1;
    }
  }
  const bn7 = Math.trunc(bn / 2), bn8 = Math.trunc(bn2 / 2);
  const bn9 = (bn8 + 1) * (bn8 + 1);
  const vv = rng.next() * 2 - 1, vv2 = rng.next() * 2 - 1, vv3 = rng.next() * 2 - 1;
  let n11 = 0;
  for (let m = 0; m <= bn; m++) {
    const n12 = bn8 / bn7 * (m - bn7);
    const n13 = Math.min(bn8, Math.trunc(Math.sqrt(Math.max(0, bn9 - n12 * n12))));
    n11 = m >= Math.trunc(bn / 2)
      ? n11 + (vv2 + (vv3 - vv2) * (m / Math.trunc(bn / 2) - 1))
      : n11 + (vv + (vv2 - vv) * (m / Math.trunc(bn / 2)));
    for (let n = bn8 - n13; n <= bn8 + n13; n++) {
      // PlaceSlab（scale=3）
      const pOX = m * 3 + ox, pOY = n * 3 + oy + Math.trunc(n11);
      const pst = state[m + 1]![n + 1]!, pWall = hasWall[m + 1]![n + 1]!;
      let pn4 = 0, pn5 = 3;
      for (let i = -1; i < 4; i++) {
        if ((i === -1 || i === 3) && rng.int(0, 1) === 0) continue;   // 边缘列 50% 跳过
        if (rng.int(0, 1) === 0) pn4--;
        if (rng.int(0, 1) === 0) pn5++;
        for (let j = pn4; j < pn5; j++) {
          const px = pOX + i, py = pOY + j;
          if (!st.inBounds(px, py)) continue;
          const ti = st.idx(px, py);
          st.type[ti] = isOreType(st.type[ti]) ? st.type[ti] : MARBLE;  // ResetToType：矿石保留
          st.flags[ti] = slabSolid(pst, i, j, 3) ? 1 : 0;
          st.liquid[ti] = 0; st.liquidType[ti] = 0;
          if (pWall) st.wall[ti] = 178;
          if (solidTileAt(st, px, py - 1) && rng.int(0, 3) === 0) placeTight(st, rng, px, py);
          if (solidTileAt(st, px, py) && rng.int(0, 3) === 0) placeTight(st, rng, px, py - 1);
        }
      }
    }
  }
  return true;
}

/** cs:12884-12975：采样与放置两段分离——先收点（CanPlace = !BiomeTileCheck && !active），
 *  再统一 Place。带宽 (w-200)/num。 */
export function runGranitePass(st: TileStore, rng: RNG, gs: GenState): void {
  let count = worldGenRangeCount(st, rng, 4, 8, 'width');
  const pts: Array<[number, number]> = [];
  let placed = 0, fails = 0;
  while (placed < count) {
    const frac = placed / count;
    let x = 0, y = 0, ok = false;
    let budget = 100;
    while (!ok) {
      budget--;
      if (budget <= 0) break;
      const x0 = Math.trunc(frac * (st.w - 200)) + 100;
      x = rng.int(x0, x0 + Math.trunc((st.w - 200) / count) - 1);
      const y0 = Math.trunc(gs.genRockLayer) + 20;
      y = rng.int(y0, y0 + (st.h - (Math.trunc(gs.genRockLayer) + 40) - 200) - 1);
      while (x > st.w * 0.45 && x < st.w * 0.55) x = rng.int(gs.beachDistance, st.w - gs.beachDistance - 1);
      ok = true;
    }
    fails++;
    if (ok && !biomeTileCheck(st, x, y) && !(st.inBounds(x, y) && st.flags[st.idx(x, y)])) {
      pts.push([x, y]); placed++;
    } else if (fails > st.w * 10) { count = placed; placed++; fails = 0; }
  }
  for (let i = 0; i < count && i < pts.length; i++) granitePlace(st, gs, pts[i]![0]!, pts[i]![1]!);
}

/** GraniteBiome.Place（GraniteBiome.cs:73-353）1:1：magma 压力 CA → 放置 → 清理 → 装饰 */
function granitePlace(st: TileStore, gs: GenState, x0: number, y0: number): void {
  if (!st.inBounds(x0, y0) || st.flags[st.idx(x0, y0)]) return;
  const gox = x0 - 100, goy = y0 - 100;             // 200×200 magma 图
  // let:轮末 Utils.Swap 引用交换(GraniteBiome.cs:186)
  let pres = new Float64Array(200 * 200);
  let res = new Float64Array(200 * 200);
  let mact = new Uint8Array(200 * 200);
  for (let a = 0; a < 200; a++) {
    for (let b = 0; b < 200; b++) {
      res[a * 200 + b] = solidTileAt(st, a + gox, b + goy) ? 4 : 1;
    }
  }
  // 8 邻域单位向量（Vector2D.Normalize）
  const NVX = [-Math.SQRT1_2, -1, -Math.SQRT1_2, 0, 0, 0, Math.SQRT1_2, 1, Math.SQRT1_2];
  const NVY = [-Math.SQRT1_2, 0, Math.SQRT1_2, -1, 0, 1, -Math.SQRT1_2, 0, Math.SQRT1_2];
  let x3 = 100, x4 = 100, y3 = 100, y4 = 100;
  // ★原版双缓冲稀疏写+轮末 Swap(GraniteBiome.cs:47-49/:186-187):target 在
  //  BuildMagmaMap 时全新(全 0),循环只写被激活/过压力门的格,轮末交换数组引用——
  //  本轮未写格保留 **i-2 轮**值。曾每轮 tPres.set(pres) 全量刷新 → 未写格保留
  //  i-1 轮值,CA 边界低压力格行为分叉
  // ★BuildMagmaMap(GraniteBiome.cs:96-107):target 缓冲初始为 source 的**别名拷贝**
  //  (未写格 Resistance 恒保持地形初值 1/4,非全 0)——曾 new 全 0 数组,CA 边界
  //  电阻场差一个量级(oracle 对账揪出;此前为对齐 JS 曾在 oracle 镜像 0 初值,现
  //  双侧回正原版语义)
  const tPres0 = Float64Array.from(pres);
  const tRes0 = Float64Array.from(res);
  const tAct0 = Uint8Array.from(mact);
  let tPres = tPres0, tRes = tRes0, tAct = tAct0;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  for (let it = 0; it < 300; it++) {
    for (let j = x3; j <= x4; j++) {
      for (let k = y3; k <= y4; k++) {
        const ji = j * 200 + k;
        if (!mact[ji]) continue;
        let sum = 0, vx = 0, vy = 0;
        for (let l = -1; l <= 1; l++) {
          for (let m = -1; m <= 1; m++) {
            if (l === 0 && m === 0) continue;
            const vi = (l + 1) * 3 + (m + 1);
            const ni = (j + l) * 200 + (k + m);
            const np = pres[ni]!;
            if (pres[ji]! > 0.01 && !mact[ni]) {
              if (l === -1) x3 = clamp(j + l, 1, x3); else x4 = clamp(j + l, x4, 198);
              if (m === -1) y3 = clamp(k + m, 1, y3); else y4 = clamp(k + m, y4, 198);
              // ToFlow(:31):保压/保阻,置 active——稀疏写下须整格写入 target
              tPres[ni] = pres[ni]!; tRes[ni] = res[ni]!; tAct[ni] = 1;
            }
            sum += np;
            vx += np * NVX[vi]!; vy += np * NVY[vi]!;
          }
        }
        sum /= 8;
        if (sum > res[ji]!) {
          const len = Math.sqrt(vx * vx + vy * vy) / 8;
          let nv = Math.max(sum - len - pres[ji]!, 0) + len + pres[ji]! * 0.875 - res[ji]!;
          nv = Math.max(0, nv);
          tPres[ji] = nv;
          tRes[ji] = Math.max(0, res[ji]! - nv * 0.02);
        }
      }
    }
    // CreateFlow(25.0) 默认 resistance=0(:34)——中心注入须清 tRes(曾残留初值
    // 1/4,中心压差差一个量级并外传全图)
    if (it < 2) { tPres[100 * 200 + 100] = 25; tRes[100 * 200 + 100] = 0; tAct[100 * 200 + 100] = 1; }
    // Utils.Swap(引用交换,零拷贝)
    let tp = pres; pres = tPres; tPres = tp;
    tp = res; res = tRes; tRes = tp;
    let tq = mact; mact = tAct; tAct = tq;
  }
  // ShouldUseLava：中心线 ≤ lavaLine-30 免岩浆；±50 内有冰雪/薄冰(161-163)/200 拒绝
  const useLava = (() => {
    if (goy + 100 <= gs.lavaLine - 30) return false;
    for (let a = -50; a < 50; a++) {
      for (let b = -50; b < 50; b++) {
        const ax = gox + 100 + a, ay = goy + 100 + b;
        if (ax >= 10 && ax < st.w - 10 && ay >= 10 && ay < st.h - 10 && st.flags[st.idx(ax, ay)]) {
          const t = TILE_DEFS[st.type[st.idx(ax, ay)]]?.vanilla?.sheet ?? 0;
          if (t === 147 || t === 200 || (t >= 161 && t <= 163)) return false;
        }
      }
    }
    return true;
  })();
  // PlaceGranite
  for (let i = x3; i <= x4; i++) {
    for (let j = y3; j <= y4; j++) {
      const mi = i * 200 + j;
      const tx = gox + i, ty = goy + j;
      if (tx < 10 || tx >= st.w - 10 || ty < 10 || ty >= st.h - 10 || !mact[mi]) continue;
      const ti = st.idx(tx, ty);
      const gnum = Math.sin((goy + j) * 0.4) * 0.7 + 1.2;
      const gnum2 = 0.2 + 0.5 / Math.sqrt(Math.max(0, pres[mi]! - res[mi]!));
      if (Math.max(1 - Math.max(0, gnum * gnum2), pres[mi]! / 15) > 0.35 + (solidTileAt(st, tx, ty) ? 0 : 0.5)) {
        st.type[ti] = isOreType(st.type[ti]) ? st.type[ti] : GRANITE;
        st.flags[ti] = 1; st.liquid[ti] = 0; st.liquidType[ti] = 0;
        st.wall[ti] = 180;
      } else if (res[mi]! < 0.01) {
        st.flags[ti] = 0;                            // ClearTile：type/wall/液体保留
        st.wall[ti] = 180;
      }
      if (st.liquid[ti] > 0 && useLava) st.liquidType[ti] = 2;
    }
  }
  // CleanupTiles：3×3 实心邻 <3 的活性花岗岩清除
  const clean: Array<[number, number]> = [];
  for (let i = x3; i <= x4; i++) {
    for (let j = y3; j <= y4; j++) {
      if (!mact[i * 200 + j]) continue;
      const tx = gox + i, ty = goy + j;
      if (tx < 10 || tx >= st.w - 10 || ty < 10 || ty >= st.h - 10 || !solidTileAt(st, tx, ty)) continue;
      let cnt = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (solidTileAt(st, tx + a, ty + b)) cnt++;
      if (cnt < 3) clean.push([tx, ty]);
    }
  }
  for (const [cx, cy] of clean) {
    const ti = st.idx(cx, cy);
    st.flags[ti] = 0; st.wall[ti] = 180;
  }
  // PlaceDecorations：FastRandom(seed).WithModifier(65440) 独立流（与 genRand 无关）
  const fr = new FastRandom(gs.seed).withModifier(65440);
  for (let i = x3; i <= x4; i++) {
    for (let j = y3; j <= y4; j++) {
      const mi = i * 200 + j;
      const tx = gox + i, ty = goy + j;
      if (tx < 10 || tx >= st.w - 10 || ty < 10 || ty >= st.h - 10 || !mact[mi]) continue;
      const fr2 = fr.withModifierXY(tx, ty);
      if (fr2.nextMax(8) === 0 && st.flags[st.idx(tx, ty)]) {
        if (ty + 1 < st.h && !st.flags[st.idx(tx, ty + 1)]) {
          placeStalactiteWithRolls(st, tx, ty + 1, fr2.nextMax(2) === 0, fr2.nextMax(3));
        }
        if (ty - 1 >= 0 && !st.flags[st.idx(tx, ty - 1)]) {
          placeStalactiteWithRolls(st, tx, ty - 1, fr2.nextMax(2) === 0, fr2.nextMax(3));
        }
      }
      if (fr2.nextMax(2) === 0) { /* Tile.SmoothSlope —— 坡面哈希无关 */ }
    }
  }
}
