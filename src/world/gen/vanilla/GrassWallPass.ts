// 草墙世界生成（1.4.5.6 1:1）：
// - SurfaceDirtWallsToGrassWalls（WorldGen.cs:19734-19824）：把地表浅层泥土墙洞
//   换成草墙 63（1/10 → 花墙 65），并对邻接草墙的泥土块补铺草皮。
//   注册序 SpawnPoint(19605) < 本 pass(19734) < SpawnStarterNPCs/DyePlants(20126)。
// - 产出是 Vines pass 花藤 382 的上游（cs:20371-20377：藤头所在/下一格墙 ∈
//   {63,65,66,68} → 花藤）。66/68 是可放置安全版墙（非世界生成产物），本 pass
//   铺 63/65 即已解锁花藤。
// - Spread.Wall2（cs:3387-3470）：墙蔓延 BFS——草墙(63)停空气位（只换既有墙），
//   上限 5000 格（maxWallOut2 cs:4196）
import type { RNG } from '../../../core/rng';
import type { TileStore } from '../../TileStore';
import { TILE_DEFS, T } from '../../../data/tiles';
import type { GenState } from './GenState';
import { spreadGrass } from './Spread';

const WALL_DIRT = 2;        // WallID.Dirt
const WALL_DIRT_UNSAFE = 15; // WallID.DirtUnsafe
const WALL_GRASS_UNSAFE = 63;
const WALL_FLOWER_UNSAFE = 65;
/** WallID.Sets.CannotBeReplacedByWallSpread（WallID.cs:60）：木/泥块/土/丛林土/… */
const WALL_CANNOT_REPLACE = new Set([4, 40, 3, 83, 87, 244, 34]);
/** WallID.Sets.WallSpreadStopsAtAir（WallID.cs:62）：草墙 63 / 蜘蛛墙 62 */
const WALL_STOPS_AT_AIR = new Set([63, 62]);
const MAX_WALL_OUT = 5000;  // maxWallOut2（cs:4196）
const MAX_TILE_COUNT = 3500;

const isSolidTile = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && !!st.flags[st.idx(x, y)] && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;

/** countDirtTiles/nextDirtCount（cs:9618-9653）1:1：无实心且墙为泥土墙(2)/洞穴墙
 *  (59) 的连通腔计数；遇冰块(147/161)或 {244,83,3,187,216} 墙直接封顶 */
function countDirtTiles(st: TileStore, sx: number, sy: number): number {
  let count = 0;
  const seen = new Set<number>();
  const stack: Array<[number, number]> = [[sx, sy]];
  while (stack.length) {
    if (count >= MAX_TILE_COUNT) return MAX_TILE_COUNT;
    const [x, y] = stack.pop()!;
    if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) return MAX_TILE_COUNT;
    const ii = st.idx(x, y);
    if (seen.has(ii)) continue;
    seen.add(ii);
    if (st.flags[ii]) {
      const sh = TILE_DEFS[st.type[ii]]?.vanilla?.sheet;
      if (sh === 147 || sh === 161) return MAX_TILE_COUNT;
    }
    if (st.wall[ii] === 244 || st.wall[ii] === 83 || st.wall[ii] === 3
      || st.wall[ii] === 187 || st.wall[ii] === 216) return MAX_TILE_COUNT;
    if (!isSolidTile(st, x, y) && (st.wall[ii] === WALL_DIRT || st.wall[ii] === 59)) {
      count++;
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]);
    }
  }
  return count;
}

/** Spread.Wall2（cs:3387-3470）1:1：墙蔓延 BFS。
 *  实心格不涂不扩散；不可替换墙阻断；停空气位墙（63）遇 wall==0 跳过；
 *  计数上限 5000；停空气位墙额外扩散对角与 ±2 横向 */
function spreadWall2(st: TileStore, sx: number, sy: number, wallType: number): void {
  if (!st.inBounds(sx, sy)) return;
  let out = 0;
  const seen = new Set<number>();
  let frontier: Array<[number, number]> = [[sx, sy]];
  const stopsAtAir = WALL_STOPS_AT_AIR.has(wallType);
  while (frontier.length) {
    const next: Array<[number, number]> = [];
    for (const [x, y] of frontier) {
      if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) continue;
      const ii = st.idx(x, y);
      if (seen.has(ii)) continue;
      seen.add(ii);
      if (st.wall[ii] === wallType || WALL_CANNOT_REPLACE.has(st.wall[ii])) continue;
      if (isSolidTile(st, x, y)) continue;
      if (stopsAtAir && st.wall[ii] === 0) continue;
      out++;
      if (out >= MAX_WALL_OUT) continue;
      st.wall[ii] = wallType;
      next.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      if (stopsAtAir) {
        next.push([x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1],
          [x - 2, y], [x + 2, y]);
      }
    }
    frontier = next;
  }
}

/** SurfaceDirtWallsToGrassWalls pass（cs:19734-19824）1:1 */
export function runGrassWallPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ---- 泥土墙洞 → 草墙（cs:19741-19787）----
  for (let i = 50; i < st.w - 50; i++) {
    for (let j = 0; j < gs.worldSurface - 10; j++) {
      if (!(rng.nextInt(4) === 0)) continue;
      const ii = st.idx(i, j);
      let found = false;
      let sx = -1, sy = -1;
      if (st.flags[ii] && st.type[ii] === T.GRASS
        && (st.wall[ii] === WALL_DIRT || st.wall[ii] === WALL_GRASS_UNSAFE)) {
        // 3×3 内有"无墙空气"才值得把墙洞连出来（cs:19749-19756）
        for (let a = i - 1; a <= i + 1; a++) {
          for (let b = j - 1; b <= j + 1; b++) {
            if (st.inBounds(a, b) && st.wall[st.idx(a, b)] === 0 && !isSolidTile(st, a, b)) {
              found = true;
            }
          }
        }
        if (found) {
          // 取 3×3 内最后一个"泥土墙/不安全泥土墙"非实心格作蔓延起点（cs:19759-19770）
          for (let a = i - 1; a <= i + 1; a++) {
            for (let b = j - 1; b <= j + 1; b++) {
              if (!st.inBounds(a, b)) continue;
              const ji = st.idx(a, b);
              if ((st.wall[ji] === WALL_DIRT || st.wall[ji] === WALL_DIRT_UNSAFE) && !isSolidTile(st, a, b)) {
                sx = a; sy = b;
              }
            }
          }
        }
      }
      if (found && sx > -1 && sy > -1 && countDirtTiles(st, sx, sy) < MAX_TILE_COUNT) {
        spreadWall2(st, sx, sy, WALL_GRASS_UNSAFE);
      }
    }
  }
  // ---- 草墙 → 花墙 1/10 + 草墙邻接泥土铺草（cs:19790-19824）----
  for (let i = 5; i < st.w - 5; i++) {
    for (let j = 10; j < gs.worldSurface - 1; j++) {
      const ii = st.idx(i, j);
      if (st.wall[ii] === WALL_GRASS_UNSAFE && rng.nextInt(10) === 0) {
        st.wall[ii] = WALL_FLOWER_UNSAFE;
      }
      if (st.flags[ii] && st.type[ii] === T.DIRT) {
        let near = false;
        for (let a = i - 1; a <= i + 1 && !near; a++) {
          for (let b = j - 1; b <= j + 1; b++) {
            if (!st.inBounds(a, b)) continue;
            const w = st.wall[st.idx(a, b)];
            if (w === WALL_GRASS_UNSAFE || w === WALL_FLOWER_UNSAFE) { near = true; break; }
          }
        }
        if (near) spreadGrass(st, i, j, T.DIRT, T.GRASS, true);
      }
    }
  }
}
