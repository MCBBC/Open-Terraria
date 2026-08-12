// 原版 pass 20 "Glowing Mushroom Patches"（WorldGen.cs:12581-12709 + ShroomPatch cs:80540
// + SpreadGrass cs:75210 逐 tile 版）1:1。岩层深处放 min(w/700,50) 个蘑菇生态：
// ShroomPatch 泥 blob（墙 80）×6 → 全图 SpreadGrass(59→70, repeat:false) →
// 蘑菇草饰面循环（KillTile/PlaceTile(59)/Next(4) 散点）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { tileRunner } from './TileRunner';

const MUD = TILE_BY_KEY['mud']!;
const MUSH_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;
// 邪恶草族/向日葵（SpreadGrass cs:75223/75266 门禁用）——必须按内部 ID 比较（曾误比 sheet 号）
const CORRUPT_GRASS_ID = TILE_BY_KEY['v_23_corrupt_grass_block']!;
const CRIMSON_GRASS_ID = TILE_BY_KEY['v_199_crimson_grass_block']!;
const CORRUPT_JG_ID = TILE_BY_KEY['v_661_corrupt_jungle_grass_block']!;
const CRIMSON_JG_ID = TILE_BY_KEY['v_662_crimson_jungle_grass_block']!;
const HALLOW_GRASS_ID = TILE_BY_KEY['v_109_hallowed_grass_block']!;
const SUNFLOWER = TILE_BY_KEY['v_27_sunflower']!;

/** SpreadGrass（cs:75210，本 pass 以 repeat:false 调用）：零掷骰、单格转换。
 *  门禁序：InWorld(,10) → active&&type==dirt → 3×3 全实心(或触岩浆)拒绝 →
 *  CanBeClearedDuringGeneration 拒绝 → type=grass。 */
/** SpreadGrass 递归洪水计数（cs:75316 grassSpread < 1000，mushroom/corruption 共用） */
export const grassSpreadState = { n: 0 };
let _wsRef: () => number = () => 300;
export function setWorldSurfaceRef(fn: () => number): void { _wsRef = fn; }

/** SpreadGrass（cs:75210）：dirt==0 时 j≥worldSurface 拒绝（cs:75243 第二门禁——
 *  corruption 的 0→23/199 只在地表以上铺）。repeat=true 时 3×3 邻格递归（限 1000） */
export function spreadGrassOnce(
  st: TileStore, i: number, j: number, dirt: number, grass: number, repeat = false,
): void {
  if (i < 10 || i >= st.w - 10 || j < 10 || j >= st.h - 10) return;   // InWorld(i,j,10)
  const ti = st.idx(i, j);
  if (!st.flags[ti] || st.type[ti] !== dirt) return;
  // cs:75223-75234（生成期分支）：邪恶草族（199/23）另有专属门——中央 10%（(0.45w,0.55w]）
  // 与滩带（beachDistance=380）内禁长；其余草走 (j>=worldSurface && dirt==0) 门。
  if (grass === CRIMSON_GRASS_ID || grass === CORRUPT_GRASS_ID) {
    if ((i > st.w * 0.45 && i <= st.w * 0.55) || i < 380 || i >= st.w - 380) return;
  } else if (dirt === 0 && j >= _wsRef()) {
    return;                                                            // growGrassUnderground=false
  }
  let enclosed = true;
  for (let k = Math.max(0, i - 1); k < Math.min(st.w, i + 2); k++) {
    for (let l = Math.max(0, j - 1); l < Math.min(st.h, j + 2); l++) {
      const ni = st.idx(k, l);
      if (!st.flags[ni] || !TILE_DEFS[st.type[ni]]?.solid) enclosed = false;
      if (st.liquidType[ni] === 2 && st.liquid[ni] > 0) { enclosed = true; break; }  // lava
    }
  }
  if (enclosed) return;
  // cs:75266：向日葵 27 在头顶 → 邪恶草族（23/661/199/662/109）禁长（生成期无 27，零影响保门）
  if ((grass === CORRUPT_GRASS_ID || grass === CORRUPT_JG_ID || grass === CRIMSON_GRASS_ID
    || grass === CRIMSON_JG_ID || grass === HALLOW_GRASS_ID)
    && j - 1 >= 0 && st.type[st.idx(i, j - 1)] === SUNFLOWER) return;
  // CanBeClearedDuringGeneration：与 TileRunner NOT_CLEAR 同源（dirt 族可清）
  const d = TILE_DEFS[st.type[ti]];
  if (d?.vanilla?.sheet != null && NOT_CLEARABLE.has(d.vanilla.sheet)) return;
  st.type[ti] = grass;
  // 递归洪水（cs:75309-75320）：3×3 邻格同 dirt，grassSpread < 1000
  if (!repeat) return;
  for (let m = i - 1; m <= i + 1; m++) {
    for (let n = j - 1; n <= j + 1; n++) {
      if (m < 0 || m >= st.w || n < 0 || n >= st.h) continue;
      const ni = st.idx(m, n);
      if (st.flags[ni] && st.type[ni] === dirt && grassSpreadState.n < 1000) {
        grassSpreadState.n++;
        spreadGrassOnce(st, m, n, dirt, grass, true);
        grassSpreadState.n--;
      }
    }
  }
}

/** 生成期不可清表（WorldGen.CanBeClearedDuringGeneration 的项目侧近似；
 *  396-399/404 沙族+化石、367/368 大理石花岗岩、41/43/44 地牢砖、481-483 等） */
const NOT_CLEARABLE = new Set<number>([
  396, 400, 401, 397, 398, 399, 404, 368, 367, 41, 43, 44, 481, 482, 483, 226, 237,
]);
export function runMushroomPass(st: TileStore, rng: RNG, gs: GenState): void {

  const { w, h } = st;
  setWorldSurfaceRef(() => gs.worldSurface);   // SpreadGrass 的 dirt==0 地表门禁用   // SpreadGrass 的 dirt==0 地表门禁用
  let mCount = w / 700;
  if (mCount > 50) mCount = 50;                    // GenVars.maxMushroomBiomes = 50
  const placed: Array<[number, number]> = [];
  // UndergroundDesertLocation = CombinedArea.Inflate(10,10)（右/下界排他）
  const ud = gs.undergroundDesert;
  for (let n = 0; n < mCount; n++) {
    let tries = 0;
    let flag = true;
    while (flag) {
      let x = rng.int(Math.floor(w * 0.2), Math.floor(w * 0.8) - 1);   // Next(0.2w, 0.8w)
      if (tries > Math.floor(w / 4)) {
        x = rng.int(Math.floor(w * 0.025), Math.floor(w * 0.975) - 1); // 兜底带（cs:12620）
      }
      const y = rng.int(gs.rockLevel + 50, h - 301);                   // Main.rockLayer
      flag = false;
      for (let l = x - 100; l < x + 100; l += 3) {
        for (let m = y - 100; m < y + 100; m += 3) {
          if (l >= 0 && l < w && m >= 0 && m < h) {
            const ti = st.idx(l, m);
            if (st.flags[ti]) {
              const t = st.type[ti];
              if (t === SNOW || t === ICE || t === THIN_ICE || t === JUNGLE_GRASS
                || t === TILE_BY_KEY['v_368_granite_block'] || t === TILE_BY_KEY['v_367_marble_block']!) {
                flag = true; break;
              }
            }
            // 注：大理石/花岗岩(#21/22)在本 pass 之后，367/368 恒不存在——保留判定零影响
            if (ud && l >= ud.x0 && l < ud.x1 && m >= ud.y0 && m < ud.y1) { flag = true; break; }
          } else { flag = true; break; }
        }
      }
      if (!flag) {
        for (const [px, py] of placed) {
          if (Math.sqrt((px - x) * (px - x) + (py - y) * (py - y)) < 500) { flag = true; break; }
        }
      }
      if (!flag && placed.length < 50) {
        shroomPatch(st, rng, gs, x, y);
        for (let k = 0; k < 5; k++) { shroomPatch(st, rng, gs, x + rng.int(-40, 40), y + rng.int(-40, 40)); }
        placed.push([x, y]);
      }
      tries++;
      if (tries > Math.floor(w / 2)) break;
    }
  }
  // SpreadGrass 全图扫描（cs:12721-12730 普通世界分支：InWorld(i,j,50)）
  for (let x = 0; x < w; x++) {
    for (let y = gs.worldSurface; y < h; y++) {
      if (x >= 50 && x < w - 50 && y >= 50 && y < h - 50 && st.flags[st.idx(x, y)]) {
        spreadGrassOnce(st, x, y, MUD, MUSH_GRASS);
      }
    }
  }
  // 蘑菇草饰面第二循环（cs:12731-12769）
  for (let x = 0; x < w; x++) {
    for (let y = gs.worldSurface; y < h; y++) {
      const ti = st.idx(x, y);
      if (!st.flags[ti] || st.type[ti] !== MUSH_GRASS) continue;
      for (let ix = x - 1; ix <= x + 1; ix++) {
        for (let iy = y - 1; iy <= y + 1; iy++) {
          if (ix < 0 || ix >= w || iy < 0 || iy >= h) continue;
          const ii = st.idx(ix, iy);
          const iL = ix > 0 && st.flags[st.idx(ix - 1, iy)];
          const iR = ix < w - 1 && st.flags[st.idx(ix + 1, iy)];
          const iU = iy > 0 && st.flags[st.idx(ix, iy - 1)];
          const iD = iy < h - 1 && st.flags[st.idx(ix, iy + 1)];
          if (st.flags[ii]) {
            if (!iL && !iR) { st.flags[ii] = 0; }
            else if (!iU && !iD) { st.flags[ii] = 0; }
          } else if (iL && iR) {
            st.type[ii] = MUD; st.flags[ii] = 1;
            if (ix > 0 && st.type[st.idx(ix - 1, y)] === MUSH_GRASS) { st.type[st.idx(ix - 1, y)] = MUD; }
            if (ix < w - 1 && st.type[st.idx(ix + 1, y)] === MUSH_GRASS) { st.type[st.idx(ix + 1, y)] = MUD; }
          } else if (iU && iD) {
            st.type[ii] = MUD; st.flags[ii] = 1;
            if (y > 0 && st.type[st.idx(x, y - 1)] === MUSH_GRASS) { st.type[st.idx(x, y - 1)] = MUD; }
            if (y < h - 1 && st.type[st.idx(x, y + 1)] === MUSH_GRASS) { st.type[st.idx(x, y + 1)] = MUD; }
          }
        }
      }
      if (rng.int(0, 3) === 0) {                   // Next(4)==0：1/4 散点 59→70
        const sx = x + rng.int(-20, 20), sy = y + rng.int(-20, 20);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h && st.type[st.idx(sx, sy)] === MUD) {
          st.type[st.idx(sx, sy)] = MUSH_GRASS;
        }
      }
    }
  }
}

/** ShroomPatch（cs:80540）1:1：泥 blob 随机游走，上空挖空、墙→80、尾端 2 支泥 runner */
function shroomPatch(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): void {

  const van = st.w / 4200;                          // num3 缩放(cs:80567;FTW ×1.5 未接)
  let num = rng.int(80, 99) * van;                 // Next(80,100) × 缩放——num 曾漏乘(2026-08-12 审计)
  let num2 = rng.int(20, 25) * van;                // Next(20,26) × 缩放
  const num4 = num2 - 1;                           // 首圈标记
  let px = i + 0.0, py = j - num2 * 0.3;
  let vx = rng.int(-100, 100) * 0.005;
  let vy = rng.int(-200, -101) * 0.005;
  while (num > 0 && num2 > 0) {
    num -= rng.int(0, 2);                          // Next(3)
    num2 -= 1;
    const x0 = Math.max(0, Math.trunc(px - num * 0.5));
    const x1 = Math.min(st.w, Math.trunc(px + num * 0.5));
    const y0 = Math.max(0, Math.trunc(py - num * 0.5));
    const y1 = Math.min(st.h, Math.trunc(py + num * 0.5));
    const r = num * rng.int(80, 119) * 0.01;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const ddx = Math.abs(x - px);
        const ddy = Math.abs((y - py) * 2.3);
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        const ti = st.idx(x, y);
        if (d < r * 0.8 && st.liquidType[ti] === 2) st.liquid[ti] = 0;   // tile.lava()
        if (d < r * 0.2 && y < py) {
          st.flags[ti] = 0;                          // active(false)：type 保留（幽灵，同原版）
          if (st.wall[ti] > 0) st.wall[ti] = 80;
        } else if (d < r * 0.4 * (0.95 + rng.next() * 0.1)) {
          st.type[ti] = MUD;                        // type 恒写（active 另判）
          if (num2 === num4 && y > py) st.flags[ti] = 1;
          if (st.wall[ti] > 0) st.wall[ti] = 80;
        }
      }
    }
    px += vx; py += vy;
    px += vx;                                       // 原版 val+=val2 后再 val.X+=val2.X
    vx += rng.int(-100, 109) * 0.005;
    vy -= rng.int(0, 109) * 0.005;                  // Next(110)
    if (vx > -0.5 && vx < 0.5) vx = vx < 0 ? -0.5 : 0.5;
    if (vx > 0.5) vx = 0.5;
    if (vx < -0.5) vx = -0.5;
    if (vy > 0.5) vy = 0.5;
    if (vy < -0.5) vy = -0.5;
    for (let m = 0; m < 2; m++) {
      let x = Math.trunc(px) + rng.int(-20, 19);
      let y = Math.trunc(py) + rng.int(0, 19);
      // 原版拒绝环：落点非活性且非泥则重掷（无界重掷→落地即活性/泥）
      while (x >= 0 && x < st.w && y >= 0 && y < st.h
        && !st.flags[st.idx(x, y)] && st.type[st.idx(x, y)] !== MUD) {
        x = Math.trunc(px) + rng.int(-20, 19);
        y = Math.trunc(py) + rng.int(0, 19);
      }
      tileRunner(st, rng, gs, x, y, {
        strength: rng.int(10, 19), steps: rng.int(10, 19),   // Next(10,20)×2
        type: MUD, speedY: 2, noYChange: true,
      });
    }
  }
}
