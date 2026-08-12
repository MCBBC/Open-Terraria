// 原版 "OceanCaves"(cs:15228)+ "UnderwaterChests"(cs:17345)1:1。
// 地牢侧海洋(左/右)各 1/3 概率生成一条向陆蠕行的隧洞(oceanCave cs:76703):
// 半径 17-25 → 4 衰减、寿命 600-800;海砂岩壳(内 397 硬化沙/外 53 沙)+ 空腔灌水;
// 大半径段记录 ≤2 宝藏点 → 后续 style17 水箱,战利品 NextFromList [863,186,277,187,4404]。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';

const SAND = TILE_BY_KEY['sand']!;            // 53
const HARDSAND = TILE_BY_KEY['hardened_sand']!; // 397
/** 原版腔体幽灵标记 tile 264(cs:76819:腔体写 type=264+active=false,
 *  壳层门 cs:76822 用 type!=264 区分腔体/壳层)。内部 id 经 sheet 264 反查 */
const CAVITY = TILE_BY_KEY['v_264_sapphiregemspark']!;
const DUNGEON_WALLS = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** tileDungeon 族(Main.cs:7941-7946),sheet id 比较(内部 id ≠ sheet id) */
const TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);

const activeAt = (st: TileStore, x: number, y: number) =>
  st.inBounds(x, y) && !!st.flags[st.idx(x, y)];

/** badOceanCaveTiles(cs:76679):墙 83/3/地牢墙 或 tile 203/25/tileDungeon 族/26/31 → 跳过
 *  (原版无 chest;sheet id 比较) */
function badOceanCaveTiles(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const ii = st.idx(x, y);
  const wl = st.wall[ii];
  if (wl === 83 || wl === 3 || DUNGEON_WALLS.has(wl)) return true;
  const sheet = TILE_DEFS[st.type[ii]]?.vanilla?.sheet ?? -1;
  if (sheet === 203 || sheet === 25 || TILE_DUNGEON.has(sheet) || sheet === 26 || sheet === 31) return true;
  return false;
}

/** oceanCave 主体(cs:76703-76990):返回记录的宝藏点(原版单槽覆盖→末次大半径位) */
function oceanCave(st: TileStore, rng: RNG, gs: GenState, i: number, j: number): Array<{ x: number; y: number }> {
  const { w } = st;
  let treasure: { x: number; y: number } | null = null;
  let vx = i, vy = j;
  const dx0 = i < w / 2 ? 0.25 + rng.next() * 0.25 : -0.35 - rng.next() * 0.5;
  let dirX = dx0, dirY = 0.4 + rng.next() * 0.25;
  let radius = rng.int(17, 24);
  let life = rng.int(600, 799);
  const MIN_R = 4;
  let steep = true;   // flag:初期陡降

  while (radius > MIN_R && life > 0) {
    const big = radius >= MIN_R + 2 && life >= 20;
    // ★flag3/flag4 每轮重置(cs:76756-76757):竖井/水柱是"每轮一次"而非"每洞一次"
    let firstShaft = true;   // flag3:本轮中心列竖井一次
    let firstWater = true;   // flag4:本轮中心列水柱一次
    // 离开海滩带(越过 beachDistance-50)后每步 ×0.96(cs:76746;flag2 地牢穿越本仓库恒 false)
    if (vx > gs.beachDistance - 50 && vx < w - gs.beachDistance + 50) {
      radius *= 0.96; life *= 0.96;
    }
    if (steep) { radius -= 0.01 + rng.next() * 0.01; life -= 0.5; }
    else { radius -= 0.02 + rng.next() * 0.02; life -= 1; }
    if (big) treasure = { x: Math.floor(vx), y: Math.floor(vy) };
    // 半径 ×3 盒内雕刻(盒体与扫描在 flag5 门外,cs:76803-76805)
    const x0 = Math.max(1, Math.floor(vx - radius * 3)), x1 = Math.min(w - 1, Math.floor(vx + radius * 3));
    const y0 = Math.max(1, Math.floor(vy - radius * 3)), y1 = Math.min(st.h - 1, Math.floor(vy + radius * 3));
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        if (badOceanCaveTiles(st, x, y)) continue;
        const dist = Math.hypot(Math.abs(x - vx), Math.abs(y - vy));
        const ti = st.idx(x, y);
        // 腔体(cs:76817-76821):flag5 门内,写 type=264+active=false(幽灵标记)
        if (big && dist < radius * 0.5 + 1) {
          st.type[ti] = CAVITY;
          st.flags[ti] = 0;
        } else if (dist < radius * 1.5 + 1 && st.type[ti] !== CAVITY) {   // 壳层门(cs:76822)独立于 flag5
          if (y < vy) {
            if ((dirX < 0 && x < vx) || (dirX > 0 && x > vx)) {
              if (dist < radius * 1.1 + 1) {
                st.setTileSilent(x, y, HARDSAND);
                if (st.liquid[ti] === 255) st.setWallSilent(x, y, 0);
              } else if (st.type[ti] !== HARDSAND) {
                st.setTileSilent(x, y, SAND);
              }
            }
          } else if ((dirX < 0 && x < i) || (dirX > 0 && x > i)) {
            if (st.liquid[ti] === 255) st.setWallSilent(x, y, 0);
            st.setTileSilent(x, y, SAND);
            // 中心列竖井(本轮 flag3 一次,cs:76850-76904)
            if (x === Math.floor(vx) && firstShaft) {
              firstShaft = false;
              let depth = 50 + rng.int(0, 2);
              let wide = 43 + rng.int(0, 2);
              let len = 20 + rng.int(0, 2);
              // ★cs:76856-76862:xa/xb 在缩放前就从 len 取值(原版 num15/num16 先算,缩放只影响循环上界)
              let xa = x, xb = x + len;
              if (dirX < 0) { xa = x - len; xb = x; }
              // cs:76863-76875:life<100 与 radius<MIN_R+5 两门各自同时缩 depth/wide/len 三值
              if (life < 100) {
                depth = Math.floor(depth * (life / 100));
                wide = Math.floor(wide * (life / 100));
                len = Math.floor(len * (life / 100));
              }
              if (radius < MIN_R + 5) {
                const k = (radius - MIN_R) / 5;
                depth = Math.floor(depth * k);
                wide = Math.floor(wide * k);
                len = Math.floor(len * k);
              }
              for (let sx = xa; sx <= xb; sx++) {
                for (let sy = y; sy < y + depth && !badOceanCaveTiles(st, sx, sy); sy++) {
                  if (sy > y + wide) {
                    if (st.flags[st.idx(sx, sy)] && st.type[st.idx(sx, sy)] !== SAND) break;
                    st.setTileSilent(sx, sy, HARDSAND);
                  } else {
                    st.setTileSilent(sx, sy, SAND);
                  }
                  if (rng.int(0, 2) === 0 && st.inBounds(sx - 1, sy)) st.setTileSilent(sx - 1, sy, SAND);
                  if (rng.int(0, 2) === 0 && st.inBounds(sx + 1, sy)) st.setTileSilent(sx + 1, sy, SAND);
                }
              }
            }
          }
        }
        // 腔体灌水(cs:76908-76912:dist < r*1.3 且低于入口 j-10)——flag5 门外
        if (dist < radius * 1.3 + 1 && y > j - 10) st.setLiquid(x, y, 255, 1);
        // 中心列水柱(本轮 flag4 一次,cs:76913-76930)——flag5 门外
        if (firstWater && x === Math.floor(vx) && y > vy) {
          firstWater = false;
          for (let sx = x - 2; sx <= x + 2; sx++) {
            for (let sy = y; sy < y + 100; sy++) {
              if (!badOceanCaveTiles(st, sx, sy)) st.setLiquid(sx, sy, 255, 1);
            }
          }
        }
      }
    }
    // 前进(cs:76962-76989)
    vx += dirX; vy += dirY;
    dirX += rng.next() * 0.1 - 0.05;
    dirY += rng.next() * 0.1 - 0.05;
    if (steep) {
      if (vy > (gs.worldSurface * 2 + gs.rockLevel) / 3 && vy > j + 30) steep = false;
      dirY = Math.max(0.35, Math.min(1, dirY));
    } else {
      if (vx < w / 2) { if (dirX < 0.5) dirX += 0.02; }
      else if (dirX > -0.5) dirX -= 0.02;
      if (!big) {
        if (dirY < 0) dirY *= 0.95;
        dirY += 0.04;
      } else if (vy < j + 30) {
        if (dirY < 0) dirY *= 0.97;
        dirY += 0.02;
      } else if (dirY > -0.1) {
        dirY *= 0.99;
        dirY -= 0.01;
      }
      dirY = Math.max(-1, Math.min(1, dirY));
    }
    if (vx < w / 2) dirX = Math.max(0.1, Math.min(1, dirX));
    else dirX = Math.max(-1, Math.min(-0.1, dirX));
  }
  return treasure ? [treasure] : [];
}

/** OceanCaves pass(cs:15228):地牢侧海洋 1/3 概率一条;返回宝藏点集(UnderwaterChests 消费) */
export function runOceanCavesPass(st: TileStore, rng: RNG, gs: GenState): Array<{ x: number; y: number }> {
  const treasures: Array<{ x: number; y: number }> = [];
  const { w } = st;
  for (const side of [0, 1] as const) {
    // 左海洋仅当地牢在左(dungeonSide < Right)、右海洋仅当在右(cs:15243)
    if (side === 0 && gs.dungeonSide !== -1) continue;
    if (side === 1 && gs.dungeonSide !== 1) continue;
    if (rng.int(0, 2) !== 0) continue; // 1/3
    const x = side === 0 ? rng.int(55, 94) : rng.int(w - 95, w - 56);
    let j = 0;
    while (j < st.h && !activeAt(st, x, j)) j++;
    if (j >= st.h) continue;
    treasures.push(...oceanCave(st, rng, gs, x, j));
  }
  return treasures;
}

/** UnderwaterChests pass(cs:17345):宝藏点 → style17 水箱,战利品五选一 */
export function runUnderwaterChestsPass(
  st: TileStore, rng: RNG, gs: GenState, chests: ChestSink, treasures: Array<{ x: number; y: number }>,
): void {
  for (const t of treasures) {
    const main = [863, 186, 277, 187, 4404][rng.int(0, 4)];
    placeBuriedChest(st, rng, gs, chests, t.x, t.y, { style: 17, loot: main, flags: { water: true } });
  }
}
