// 原版 pass "Dirt Rock Wall Runner"（1456 cs:15536-15550，runner 本体
// DirtyRockRunner cs:77503-77579）。注册序 DirtWallCleanup(15310) < Pyramids(15426)
// < 本 pass < LivingTrees(15551)——结构槽内夹在金字塔与世界树之间。
//
// 行为：近地表泥土自然墙（wall 2）上随机撒"石墙"斑——命中 wall==2 的采样点沿
// 随机方向游走 num2 步，把曼哈顿距离内的 wall 2 改写成洞穴石墙 59（石腔基色，
// CaveWalls cs:3327 同款）。2026-08-13 前整 pass 缺失。
//
// 掷骰流（cs:15541-77578，1:1）：
//   外层 w 次（i 仅计数）：x=Next(10, w-10)、y=Next(10, worldSurface)——两掷无条件消耗，
//   wall==2 才进 runner；
//   runner 内：num=Next(2,6)（斑厚）、num2=Next(5,50)（步数）、初速 X/Y 各 Next(-10,11)*0.1；
//   每步 bounding box 每格一掷 Next(-10,11)（在 wall 判定之前无条件消耗，cs:77544）；
//   每步尾部初速 X/Y 各 Next(-10,11)*0.05 后 ±1 钳制。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';

/** 洞穴石墙（自然）——原版字面量 59，与 CaveWalls/Spread.Wall 石腔同款 */
const WALL_ROCK_NATURAL = 59;

/** DirtyRockRunner（cs:77503）：wall 2 → 59 的游走斑 */
function dirtyRockRunner(st: TileStore, rng: RNG, i: number, j: number): void {
  const num = rng.int(2, 5);            // Next(2,6)：斑厚（恒 >0）
  const num2 = rng.int(5, 49);          // Next(5,50)：步数
  let num3 = num2;
  let vx = i, vy = j;                   // Vector2D val
  let spx = rng.int(-10, 10) * 0.1;     // val2.X = Next(-10,11)*0.1
  let spy = rng.int(-10, 10) * 0.1;     // val2.Y
  while (num > 0 && num3 > 0) {
    const num4 = num * (num3 / num2);
    num3 -= 1;
    // (int) 截断 = Math.trunc；下界只钳 0，上界只钳 maxTiles（cs:77531-77546）
    let x0 = Math.trunc(vx - num4 * 0.5);
    let x1 = Math.trunc(vx + num4 * 0.5);
    let y0 = Math.trunc(vy - num4 * 0.5);
    let y1 = Math.trunc(vy + num4 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    for (let k = x0; k < x1; k++) {
      for (let l = y0; l < y1; l++) {
        // cs:77544：Next 在 `<` 右值内——盒子内每格无条件一掷；越界格（原版读
        // Tilemap padding wall=0 不命中）只挡写入不挡掷骰
        const hit = Math.abs(k - vx) + Math.abs(l - vy) < num * 0.5 * (1 + rng.int(-10, 10) * 0.015);
        if (hit && k >= 0 && k < st.w && l >= 0 && l < st.h && st.wall[st.idx(k, l)] === 2) {
          st.wall[st.idx(k, l)] = WALL_ROCK_NATURAL;
        }
      }
    }
    vx += spx;
    vy += spy;
    spx += rng.int(-10, 10) * 0.05;
    if (spx > 1) spx = 1;
    else if (spx < -1) spx = -1;
    spy += rng.int(-10, 10) * 0.05;
    if (spy > 1) spy = 1;
    else if (spy < -1) spy = -1;
  }
}

/** 原版 pass "Dirt Rock Wall Runner"（cs:15536） */
export function runDirtRockWallRunnerPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w } = st;
  const DRWR_TRACE = typeof process !== 'undefined' && !!process.env.DRWR_TRACE;
  let hits = 0;
  const streamHash = (): string => {
    if (!DRWR_TRACE) return '';
    const ur = (rng as unknown as { ur: { seedArray: Int32Array; inext: number } }).ur;
    let h = 0x811c9dc5;
    const step = (b: number) => { h = Math.imul(h ^ (b & 0xff), 16777619) >>> 0; };
    for (let i = 0; i < ur.seedArray.length; i++) {
      const v = ur.seedArray[i] | 0;
      for (let b = 0; b < 4; b++) step(v >>> (8 * b));
    }
    const ix = ur.inext >>> 0;
    for (let b = 0; b < 4; b++) step(ix >>> (8 * b));
    return h.toString(16).padStart(8, '0');
  };
  // cs:15540：i 仅计数——每列两次无条件采样
  for (let i = 0; i < w; i++) {
    const x = rng.int(10, w - 11);                      // Next(10, w-10)
    const y = rng.int(10, Math.trunc(gs.worldSurface) - 1); // Next(10, (int)worldSurface)
    if (st.wall[st.idx(x, y)] === 2) {
      hits++;
      if (DRWR_TRACE && hits <= 500) console.log(`DRWR hit#${hits} i=${i} x=${x} y=${y}`);
      dirtyRockRunner(st, rng, x, y);
      if (DRWR_TRACE && hits <= 500) console.log(`DRWR done#${hits} st=${streamHash()}`);
    }
  }
  if (DRWR_TRACE) console.log(`DRWR total hits=${hits}`);
}
