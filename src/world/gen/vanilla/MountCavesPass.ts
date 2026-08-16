// 原版山丘双 pass 1:1（1405 WorldGen.cs）：
//  - pass 7 "Mount Caves"（L5091-5150，1456 MountainCaves:11811 常数一致）：地表随机位置
//    用 Mountinater（L48367）造上漂泥土山丘，记录 mCave 坐标
//  - pass 34 "Mountain Caves"（L6628-6639）：每座山丘侧面开洞（CaveOpenater L48789）
//    + 向下蜿蜒洞穴（Cavinator L48733，递归至岩层）
// RNG 映射：Next(a,b) 左闭右开 → rng.int(a, b-1)；(int) → ctrunc。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { ctrunc } from '../../../core/csCompat';
import { idsByVanillaSheet, NOT_CLEARABLE } from './TileRunner';
import { T, TILE_BY_KEY } from '../../../data/tiles';

/** 山丘区域避让的沙族（原版 box 检查 type 53/151/274：沙/沙岩砖/沙岩板） */
const SAND_AVOID = idsByVanillaSheet(53, 151, 274);

/** Mountinater（L48367）：上漂泥土 blob = 山丘本体。只在空气格激活填土(type 0=Dirt) */
function mountinater(st: TileStore, rng: RNG, i: number, j: number): void {
  let num1 = rng.int(80, 119) + 0.0;      // Next(80,120)（double，cs:80122）
  let num2 = rng.int(40, 54) + 0.0;       // Next(40,55)（double！）
  let px = i, py = j + num2 / 2;
  let vx = rng.int(-10, 10) * 0.1;        // Next(-10,11)
  let vy = rng.int(-20, -11) * 0.1;       // Next(-20,-10)
  while (num1 > 0 && num2 > 0) {
    num1 -= rng.int(0, 3);                // Next(4)
    num2--;
    let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
    let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    const r = num1 * rng.int(80, 119) * 0.01; // Next(80,120)
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const dx = Math.abs(x - px), dy = Math.abs(y - py);
        if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
          const k = st.idx(x, y);
          if (!st.flags[k]) st.setTileSilent(x, y, T.DIRT); // 原版 active(true)+type 0(=Dirt)
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    vy += rng.int(-10, 10) * 0.05;
    if (vx > 0.5) vx = 0.5;
    if (vx < -0.5) vx = -0.5;
    if (vy > -0.5) vy = -0.5;
    if (vy < -1.5) vy = -1.5;
  }
}

/** pass 7 Mount Caves：w*0.001 次尝试，避开中心 ±90/沙族 ±50×25/前丘 ±100（L5095-5148） */
export function runMountCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const count = Math.floor(st.w * 0.001);
  for (let n = 0; n < count; n++) {
    let x = rng.int(Math.floor(st.w * 0.25), Math.floor(st.w * 0.75) - 1); // Next(w*.25, w*.75)
    let tries = 0;
    let giveUp = false;
    let placed = false;
    while (!placed && !giveUp) {
      placed = true;
      while (x > st.w / 2 - 90 && x < st.w / 2 + 90) {
        x = rng.int(Math.floor(st.w * 0.25), Math.floor(st.w * 0.75) - 1);
      }
      for (let k = 0; k < gs.numMCaves; k++) {
        if (Math.abs(x - gs.mCaveX[k]) < 100) { tries++; placed = false; break; }
      }
      if (tries >= st.w / 5) { giveUp = true; break; }
    }
    if (giveUp) continue;
    // 找该列地表首个实心格。沙族 box 检查复用外层 flag（cs:11861-11879）：
    // 一旦检出沙 flag 闩锁为 true——本列后续任何活性格都走不进 !flag 分支，
    // 即「首格近沙 → 整列放弃」（扫完 worldSurface 也不放置、不消费掷骰）。
    // 曾误读 cs:11877 为「近沙不 break 继续向下找深格放置」——漏了 flag 闩锁，
    // 在近沙列多放山丘+多吞 Mountinater 掷（2026-08-16 num4 重播后被对账暴露）。
    let sandLatched = false;
    for (let y = 0; y < gs.worldSurface; y++) {
      if (!st.flags[st.idx(x, y)]) continue;
      let nearSand = false;
      for (let dx = -50; dx < 50 && !nearSand; dx++) {
        for (let dy = -25; dy < 25; dy++) {
          const xx = x + dx, yy = y + dy;
          if (!st.inBounds(xx, yy) || !st.flags[st.idx(xx, yy)]) continue;
          if (SAND_AVOID.has(st.type[st.idx(xx, yy)])) { nearSand = true; break; }
        }
      }
      if (nearSand) sandLatched = true;
      if (!sandLatched) {
        mountinater(st, rng, x, y);
        gs.mCaveX[gs.numMCaves] = x;
        gs.mCaveY[gs.numMCaves] = y;
        gs.numMCaves++;
        break;
      }
    }
  }
}

/** CaveOpenater（L48789）：山侧横向开口，100 步或直到离开墙/碰不可清 tile */
function caveOpenater(st: TileStore, rng: RNG, i: number, j: number): void {
  let num1 = rng.int(7, 11);              // Next(7,12)
  let dir = rng.int(0, 1) === 0 ? -1 : 1; // Next(2)
  if (rng.int(0, 9) !== 0) dir = i >= st.w / 2 ? -1 : 1; // 90% 朝世界外侧（Next(10)!=0）
  let px = i, py = j;
  let steps = 100;
  let vx = dir, vy = 0;
  while (steps > 0) {
    const k = st.idx(Math.max(0, Math.min(st.w - 1, ctrunc(px))), Math.max(0, Math.min(st.h - 1, ctrunc(py))));
    const t = st.type[k];
    if (st.wall[k] === 0 || (st.flags[k] && NOT_CLEARABLE.has(t))) steps = 0;
    steps--;
    let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
    let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    const r = num1 * rng.int(80, 119) * 0.01;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const dx = Math.abs(x - px), dy = Math.abs(y - py);
        if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
          const kk = st.idx(x, y);
          if (st.flags[kk] && !NOT_CLEARABLE.has(st.type[kk])) st.flags[kk] = 0; // 原版 active(false) 保留幽灵 type
        }
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    vy += rng.int(-10, 10) * 0.05;
    if (vx > dir + 0.5) vx = dir + 0.5;
    if (vx < dir - 0.5) vx = dir - 0.5;
    if (vy > 0) vy = 0;
    if (vy < -0.5) vy = -0.5;
  }
}

/** Cavinator（L48733）：向下蜿蜒洞穴，递归 steps 次直至岩层（不挖沙 53） */
/** 原版 tileDungeon（Main.cs:7941-7946）与 wallDungeon（Main.cs:10507-10515） */
const TILE_DUNGEON = idsByVanillaSheet(41, 43, 44, 677, 678, 679);
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);

function cavinator(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, steps: number): void {
  let num1 = rng.int(7, 14);              // Next(7,15)
  const dir = rng.int(0, 1) === 0 ? -1 : 1;
  let px = i, py = j;
  let num4 = rng.int(20, 39);            // Next(20,40)（num4：剩余步数，地牢命中清零）
  let vx = dir, vy = rng.int(10, 19) * 0.01; // Next(10,20)
  const SAND = TILE_BY_KEY['sand']!;
  while (num4 > 0) {
    num4--;
    let x0 = ctrunc(px - num1 * 0.5), x1 = ctrunc(px + num1 * 0.5);
    let y0 = ctrunc(py - num1 * 0.5), y1 = ctrunc(py + num1 * 0.5);
    if (x0 < 0) x0 = 0;
    if (x1 > st.w) x1 = st.w;
    if (y0 < 0) y0 = 0;
    if (y1 > st.h) y1 = st.h;
    const r = num1 * rng.int(80, 119) * 0.01;
    // ★地牢命中即整轮终止（cs:80753-80762）：tileDungeon/墙 dungeon → num4=0
    //  （此前缺失：跑满全程多耗每步 3 骰 → 条件性流漂移）
    outer:
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const dx = Math.abs(x - px), dy = Math.abs(y - py);
        if (Math.sqrt(dx * dx + dy * dy) < r * 0.4) {
          const kk = st.idx(x, y);
          const active = st.flags[kk] !== 0;
          if ((active && TILE_DUNGEON.has(st.type[kk])) || WALL_DUNGEON.has(st.wall[kk])) {
            num4 = 0;
            break outer;
          }
          // 不可清块/沙：跳过该格（原版 continue，不终止）
          if (active && (NOT_CLEARABLE.has(st.type[kk]) || st.type[kk] === SAND)) continue;
          if (active) st.flags[kk] = 0; // 原版 active(false) 保留幽灵 type（cavinator）
        }
        if (num4 <= 0) break;
      }
      if (num4 <= 0) break;
    }
    if (num4 <= 0) break; // 终止后不再消耗速度/半径骰（原版 while 条件）
    px += vx; py += vy;
    vx += rng.int(-10, 10) * 0.05;
    vy += rng.int(-10, 10) * 0.05;
    if (vx > dir + 0.5) vx = dir + 0.5;
    if (vx < dir - 0.5) vx = dir - 0.5;
    if (vy > 2) vy = 2;
    if (vy < 0) vy = 0;
  }
  if (steps <= 0 || ctrunc(py) >= gs.rockLevel + 50) return;
  cavinator(st, rng, gs, ctrunc(px), ctrunc(py), steps - 1);
}

/** pass 34 Mountain Caves（L6628-6639）：每座山丘 开口+蜿蜒 */
export function runMountainCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  for (let n = 0; n < gs.numMCaves; n++) {
    const x = gs.mCaveX[n], y = gs.mCaveY[n];
    caveOpenater(st, rng, x, y);
    cavinator(st, rng, gs, x, y, rng.int(40, 49)); // Next(40,50)
  }
}
