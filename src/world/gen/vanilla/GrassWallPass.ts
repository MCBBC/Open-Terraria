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
import { genSolidType } from './GenSolid';

const WALL_DIRT = 2;        // WallID.Dirt
const WALL_DIRT_UNSAFE = 15; // WallID.DirtUnsafe
const WALL_GRASS_UNSAFE = 63;
const WALL_SPIDER_UNSAFE = 62; // WallID.SpiderUnsafe（PPPPP：饥荒世界地表化目标）
const WALL_FLOWER_UNSAFE = 65;
/** WallID.Sets.CannotBeReplacedByWallSpread（WallID.cs:60）：木/泥块/土/丛林土/… */
const WALL_CANNOT_REPLACE = new Set([4, 40, 3, 83, 87, 244, 34]);
/** WallID.Sets.WallSpreadStopsAtAir（WallID.cs:62）：草墙 63 / 蜘蛛墙 62 */
const WALL_STOPS_AT_AIR = new Set([63, 62]);
const MAX_WALL_OUT = 5000;  // maxWallOut2（cs:4196）
const MAX_TILE_COUNT = 3500;

const isSolidTile = (st: TileStore, x: number, y: number): boolean =>
  // WorldGen.SolidTile(x,y)（cs:70155）全谓词：active && tileSolid && !tileSolidTop
  //  && !halfBrick && slope==0 && !inActive。曾只写 active&&tileSolid（W 批 #67 二段
  //  根因：Spread.Wall2（cs:3387）实心门与 countDirtTiles（cs:9659）洪泛门同用本
  //  谓词,半砖/坡面/致动格在原版算实心（只刷背面墙/洪泛截断）,本仓漏 half/slope
  //  查询 → 墙蔓延穿透坡面格 + 丛林泥墙腔计数偏大）。tileSolid 走 GenSolid：
  //  本 pass 时点 484(cs:12537)/659(cs:11500) 非实心, 190/225/192 等已由各自
  //  翻转点归位——与原版 cs:19734 时点态一致
  st.inBounds(x, y) && (() => {
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const d = TILE_DEFS[st.type[i]];
    return !!d && genSolidType(st.type[i]) && !d.platform
      && !st.half[i] && st.slope[i] === 0 && (st.wire[i] & 32) === 0;
  })();

/** countDirtTiles/nextDirtCount（cs:9618-9653）1:1：无实心且墙为泥土墙(2)/洞穴墙
 *  (59) 的连通腔计数；遇冰块(147/161)或 {244,83,3,187,216} 墙直接封顶。
 *  ★VVVVV 织入定谳（#79 根因）：nextDirtCount 递归 **10 邻**——四正+四对角+
 *  **(x±2,y) 跨列跳**。曾只推 8 邻——大腔经 ±2 跳连通到 ≥3500 域时 vanilla 封顶
 *  拒蔓延（织入实证 (1486,266)→3500），JS 只数到 292 误放行 → 405 格多转。
 *  栈序=递归逆序（结果序无关——计数封顶/陷阱命中均全域性质）。 */
export function countDirtTiles(st: TileStore, sx: number, sy: number): number {
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
      stack.push([x + 2, y], [x - 2, y],
        [x + 1, y + 1], [x + 1, y - 1], [x - 1, y + 1], [x - 1, y - 1],
        [x, y + 1], [x, y - 1], [x + 1, y], [x - 1, y]);
    }
  }
  return count;
}

/** Spread.Wall2（cs:3387-3470）1:1：墙蔓延 BFS。
 *  非实心格：涂墙+扩散（不可替换墙阻断；停空气位墙(63)遇 wall==0 跳过；
 *  计数上限 5000；停空气位墙额外扩散对角与 ±2 横向）；
 *  实心活性格只刷背面墙不扩散（cs:3489-3492）。
 *  导出供 CaveWallsPass（丛林泥墙段 cs:17946）复用 */
export function spreadWall2(st: TileStore, sx: number, sy: number, wallType: number): void {
  (globalThis as { __swMark?: (s: string) => void }).__swMark?.(`CWW2 ${sx},${sy} t=${wallType}`);
  if (!st.inBounds(sx, sy)) return;
  let out = 0;
  const seen = new Set<number>();
  let frontier: Array<[number, number]> = [[sx, sy]];
  const stopsAtAir = WALL_STOPS_AT_AIR.has(wallType);
  while (frontier.length) {
    const next: Array<[number, number]> = [];
    for (const [x, y] of frontier) {
      // InWorld(x,y,1)（cs:3411）：x>=1 && y>=1 && x<max-1 && y<max-1——下界放行
      // x==1/y==1（countTiles 的字面 x<=1 是它自己的边界写法,勿混;曾误抄到这）
      if (x < 1 || x >= st.w - 1 || y < 1 || y >= st.h - 1) continue;
      const ii = st.idx(x, y);
      if (seen.has(ii)) continue;
      seen.add(ii);
      if (st.wall[ii] === wallType || WALL_CANNOT_REPLACE.has(st.wall[ii])) continue;
      if (!isSolidTile(st, x, y)) {
        if (stopsAtAir && st.wall[ii] === 0) continue;
        out++;
        if (out >= MAX_WALL_OUT) continue;
        st.wall[ii] = wallType;
        next.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
        if (stopsAtAir) {
          next.push([x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1],
            [x - 2, y], [x + 2, y]);
        }
      } else if (st.flags[ii]) {
        // cs:3489-3492:SolidTile=true(必 active)→ 只刷背面墙、不入队扩散(曾整体 continue)
        st.wall[ii] = wallType;
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
        // ★PPPPP（cs:19776-19786）：maxValue=3（FTW 组合 10）；饥荒世界 Next(maxValue)!=0
        //   → 蜘蛛墙 62 地表化（纯 Constant 2/3、FTW+Constant 9/10）。掷骰在 constant
        //   门内（普通世界零消耗）。Variations.noSpiderCavesActuallyNoSpiderCaves 门
        //   （noSpiderCaves∧activeSecretSeedCount<4）纯 Constant 恒 false,不接（备案）。
        const maxValue = gs.seedFlags?.getGoodWorld ? 10 : 3;
        let wallType = WALL_GRASS_UNSAFE;
        if (gs.seedFlags?.theConstant && rng.nextInt(maxValue) !== 0) wallType = WALL_SPIDER_UNSAFE;
        spreadWall2(st, sx, sy, wallType);
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
        if (near) spreadGrass(st, i, j, T.DIRT, T.GRASS, true, gs.worldSurface);
      }
    }
  }
}
