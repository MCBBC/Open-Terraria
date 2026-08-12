// 苔藓系统世界生成（1.4.5.6 1:1）：
// - MossAndMossCaves（WorldGen.cs:17573-17833）：霓虹苔藓洞（neonMossBiome :9721）+
//   苔藓斑（countTiles 选点 + setMoss :9838 + Spread.Moss :3497 BFS 涂墙换块）+
//   全图散点苔藓 + 地狱氦苔藓 381（岩浆邻域）
// - 产出是 LongMoss pass（cs:20915，SurfaceDecorPasses.runLongMossPass）的上游：
//   没有本 pass 铺下的苔藓块 179-183/381/534/536/539/625，长苔藓 pass 全图 0 产出
// - 注册序 17573：GemCaves(17528) 之后、Pots(18186) 之前——洞穴系/沙漠/蜂巢全部
//   已定型，只做"石→苔藓"点状替换，不与 caves-checkpoint 覆盖链冲突
import type { RNG } from '../../../core/rng';
import type { TileStore } from '../../TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { spreadGrass } from './Spread';

const STONE = TILE_BY_KEY['stone']!;   // tile 1
/** 苔藓块 179-183（mossTile = 179+mossType，setMoss cs:9842） */
const MOSS_TILES = [179, 180, 181, 182, 183].map((s) => [...idsByVanillaSheet(s)][0]);
/** 霓虹苔藓（randMoss cs:9703 NextFromList [539,536,534,625] 均匀） */
const NEON_TILES = [539, 536, 534, 625].map((s) => [...idsByVanillaSheet(s)][0]);
/** 地狱氦苔藓 381（cs:17746-17770：25 半径框内岩浆格 >20 才换） */
const LAVA_MOSS = [...idsByVanillaSheet(381)][0];
/** 苔藓墙 = 54+mossType（WallID.CaveUnsafe 族，setMoss cs:9841） */
const MOSS_WALL_BASE = 54;
/** 霓虹苔藓洞禁区（cs:17598-17616 非 remix 分支）：砂岩/丛林草/蘑菇草/冰雪/
 *  硬化沙/地牢族——苔藓洞不与既有群系叠加 */
const NEON_FORBIDDEN = idsByVanillaSheet(70, 60, 367, 368, 161, 147, 396, 397);
/** Main.tileDungeon（Main.cs:7941-7946：41 青砖/43 蓝砖/44 绿砖/677-679 变体） */
const DUNGEON_TILES = idsByVanillaSheet(41, 43, 44, 677, 678, 679);
/** Main.tileMoss（Main.cs:6956-6996，按 sheet id）——尾段 SpreadGrass 的苔藓块判定 */
const MOSS_SHEETS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
const SHIMMER_SAFETY = 150;            // shimmerSafetyDistance（WorldGen.cs:4104）

const isSolidTile = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && !!st.flags[st.idx(x, y)] && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;

/** setMoss（cs:9838-9844）：按 x 三分世界选 mossType 槽 → 全局 mossWall/mossTile。
 *  本仓用返回值传递（GenVars 全局位） */
function setMoss(st: TileStore, x: number, mossType: number[]): { wall: number; tile: number } {
  const slot = x < st.w * 0.334 ? 0 : x < st.w * 0.667 ? 1 : 2;
  return { wall: MOSS_WALL_BASE + mossType[slot], tile: MOSS_TILES[mossType[slot]] };
}

/** Spread.Moss（cs:3497-3549）1:1 BFS：起点洞腔涂苔藓墙。
 *  实心格或已有墙 → 不扩散；active 且无墙 → 补墙；石头(1) → 换苔藓块；
 *  无墙空气 → 涂墙并向四邻扩散（有墙/实心天然阻断） */
function spreadMoss(st: TileStore, x: number, y: number, wall: number, tile: number): void {
  if (!st.inBounds(x, y)) return;
  const seen = new Set<number>();
  let frontier: Array<[number, number]> = [[x, y]];
  while (frontier.length) {
    const next: Array<[number, number]> = [];
    for (const [cx, cy] of frontier) {
      if (cx <= 1 || cx >= st.w - 1 || cy <= 1 || cy >= st.h - 1) continue;
      const ii = st.idx(cx, cy);
      if (seen.has(ii)) continue;
      seen.add(ii);
      if (isSolidTile(st, cx, cy) || st.wall[ii] !== 0) {
        if (st.flags[ii]) {
          if (st.wall[ii] === 0) st.wall[ii] = wall;
          if (st.type[ii] === STONE) st.type[ii] = tile;
        }
        continue;
      }
      st.wall[ii] = wall;
      next.push([cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]);
    }
    frontier = next;
  }
}

/** neonMossBiome（cs:9721-9836）1:1：随机走向游走椭圆挖苔藓洞。
 *  半径 num=Next(60,80)×(w/4200)、步数 num2=Next(30,40)×同系数；每步椭圆内
 *  （半径×(1±0.2)）暴露石头 → SpreadGrass 换霓虹苔藓；上下界钳制 + 漂移 */
function neonMossBiome(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, maxY: number, neon: number): void {
  let vx = rng.next() * 4 - 2;
  let vy = rng.next() * 4 - 2;
  if (vx === 0) vx = 1;
  while (Math.hypot(vx, vy) < 4) { vx *= 1.5; vy *= 1.5; }
  let radius = rng.nextIntRange(60, 80);
  let steps = rng.nextIntRange(30, 40);
  const k = st.w / 4200;
  radius *= k;
  steps *= k;
  let px = i, py = j;
  while (steps > 0) {
    radius *= 0.98;
    steps -= 1;
    let x0 = Math.trunc(px - radius), x1 = Math.trunc(px + radius);
    let y0 = Math.trunc(py - radius), y1 = Math.trunc(py + radius);
    if (x0 < 1) x0 = 1;
    if (x1 > st.w - 1) x1 = st.w - 1;
    if (y0 < 1) y0 = 1;
    if (y1 > st.h - 1) y1 = st.h - 1;
    if (y0 < gs.rockLevel) { y0 = Math.trunc(gs.rockLevel); if (vy < 5) vy = 5; }
    if (y1 > maxY) { y1 = maxY; if (vy > -5) vy = -5; }
    const rr = radius * (1 + rng.next() * 0.4 - 0.2);
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const d = Math.hypot(Math.abs(x - px), Math.abs(y - py));
        const ii = st.idx(x, y);
        if (d < rr * 0.8 && st.type[ii] === STONE && st.flags[ii]
          && (!st.flags[st.idx(x - 1, y)] || !st.flags[st.idx(x + 1, y)]
            || !st.flags[st.idx(x, y - 1)] || !st.flags[st.idx(x, y + 1)])) {
          spreadGrass(st, x - 1, y, STONE, neon, false);
        }
      }
    }
    px += vx; py += vy;
    vx += rng.next() * 4 - 2;
    vy += rng.next() * 4 - 2;
    vy = Math.min(10, Math.max(-10, vy));
    vx = Math.min(10, Math.max(-10, vx));
  }
}

/** MossAndMossCaves pass（cs:17573-17833）1:1 */
export function runMossAndMossCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  // randMoss（cs:9702-9719）：霓虹四选一；三槽 mossType 互异（0-4）
  const neon = NEON_TILES[rng.nextInt(NEON_TILES.length)];
  const mossType: number[] = [];
  mossType[0] = rng.nextInt(5);
  do { mossType[1] = rng.nextInt(5); } while (mossType[1] === mossType[0]);
  do { mossType[2] = rng.nextInt(5); } while (mossType[2] === mossType[0] || mossType[2] === mossType[1]);

  // ---- 霓虹苔藓洞（cs:17583-17649）：count=w/2100 个；禁区检查 101×101 ----
  const caveCount = Math.floor(st.w / 2100);
  let placed = 0, fails = 0;
  while (placed < caveCount) {
    let x = rng.nextIntRange(100, st.w - 100);
    while (x > st.w * 0.38 && x < st.w * 0.62) x = rng.nextIntRange(100, st.w - 100);
    const y = rng.nextIntRange(gs.rockLevel + 40, gs.lavaLine - 40);
    let forbidden = false;
    outer:
    for (let a = x - 50; a <= x + 50; a++) {
      for (let b = y - 50; b <= y + 50; b++) {
        if (!st.inBounds(a, b)) continue;
        const ii = st.idx(a, b);
        // cs:17602-17616：仅查 active 格的 tile 族（70 砂岩/60 丛林草/367/368 蘑菇草/
        // 161 冰/147 雪砖/396/397 硬化沙族 + Main.tileDungeon）；墙不参与
        if (st.flags[ii] && (NEON_FORBIDDEN.has(st.type[ii]) || DUNGEON_TILES.has(st.type[ii]))) {
          forbidden = true; break outer;
        }
      }
    }
    if (forbidden) {
      fails++;
      if (fails > st.w) placed++;
    } else {
      fails = 0;
      placed++;
      neonMossBiome(st, rng, gs, x, y, gs.lavaLine, neon);
    }
  }

  // ---- 苔藓斑（cs:17650-17713）：maxTileCount=2500 选点 → setMoss + Spread.Moss ----
  const countTiles = (sx: number, sy: number) => {
    // countTiles/nextCount（cs:9493-9560，jungle=false）：洪泛空气腔；
    // wall!=0 即封顶（cs:9525-9529）、墙 244/微光/岩浆封顶
    let air = 0, lava = 0, ice = 0, rock = 0, shroom = 0;
    const seen = new Set<number>();
    const stack: Array<[number, number]> = [[sx, sy]];
    const MAX = 2500;
    let capped = false;
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (air >= MAX || capped) break;
      if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) { capped = true; break; }
      const ii = st.idx(x, y);
      if (seen.has(ii)) continue;
      seen.add(ii);
      if (st.wall[ii] === 244) { capped = true; break; }
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 4) { capped = true; break; } // 微光
      if (st.wall[ii] !== 0) { capped = true; break; }                            // jungle=false：有墙即封顶
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) { lava++; capped = true; break; }
      if (st.flags[ii]) {
        const sh = TILE_DEFS[st.type[ii]]?.vanilla?.sheet;
        if (sh === 70) shroom++;
        if (st.type[ii] === STONE) rock++;
        if (sh === 147 || sh === 161) ice++;
      }
      if (!isSolidTile(st, x, y)) {
        air++;
        stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
      }
    }
    return { air: capped ? MAX : air, lava, ice, rock, shroom };
  };
  const patches = Math.floor(st.w * 0.01);
  for (let n = 0; n < patches; n++) {
    let x = rng.nextIntRange(200, st.w - 200);
    let y = rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), gs.waterLine);
    const nearShimmer = gs.shimmerX >= 0
      && Math.hypot(x - gs.shimmerX, y - gs.shimmerY) < SHIMMER_SAFETY;
    if (nearShimmer) continue;
    let ok = false;
    for (let tries = 0; tries < 1000; tries++) {
      const c = countTiles(x, y);
      if (c.air < 2500 && c.air >= 10 && c.lava === 0 && c.ice === 0 && c.rock > 0 && c.shroom === 0) {
        ok = true; break;
      }
      // cs:17698-17703 重掷 x 与 y 一起换（重掷域与初掷不同，bug-for-bug 保留）
      x = rng.nextIntRange(200, st.w - 200);
      y = rng.nextIntRange(gs.rockLevel + 30, st.h - 230);
    }
    if (!ok) continue;
    const m = setMoss(st, x, mossType);
    spreadMoss(st, x, y, m.wall, m.tile);
  }

  // ---- 全图散点（cs:17714-17723）：每列一次随机石头 → 苔藓 ----
  for (let n = 0; n < st.w; n++) {
    const x = rng.nextIntRange(50, st.w - 50);
    const y = rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), gs.lavaLine);
    if (gs.shimmerX >= 0 && Math.hypot(x - gs.shimmerX, y - gs.shimmerY) < SHIMMER_SAFETY) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii] && st.type[ii] === STONE) {
      const m = setMoss(st, x, mossType);
      st.type[ii] = m.tile;
    }
  }

  // ---- 暴露石头苔藓（cs:17725-17739）：0.05×w 个，四邻任一暴露的石头 ----
  //  ★ 迭代上限（原版 while 无上限）：人工构造的"无洞穴"世界（单测/迷你图）会
  //   永不命中暴露石头 → 死循环。真世界命中率 ≈1-5%，上限 500×budget 远超所需
  let budget = st.w * 0.05;
  for (let iter = 0; budget > 0 && iter < budget * 500; iter++) {
    const x = rng.nextIntRange(50, st.w - 50);
    const y = rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), gs.lavaLine);
    if (gs.shimmerX >= 0 && Math.hypot(x - gs.shimmerX, y - gs.shimmerY) < SHIMMER_SAFETY) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii] && st.type[ii] === STONE
      && (!st.flags[st.idx(x - 1, y)] || !st.flags[st.idx(x + 1, y)]
        || !st.flags[st.idx(x, y - 1)] || !st.flags[st.idx(x, y + 1)])) {
      const m = setMoss(st, x, mossType);
      st.type[ii] = m.tile;
      budget -= 1;
    }
  }

  // ---- 地狱氦苔藓 381（cs:17737-17766）：num13=w*0.065 预算 while；
  //  命中（25 半径框岩浆>20）-1，命中但岩浆不足 -0.002，每迭代无条件 -0.001。
  //  无迭代上限（原版 while(num13>0)；预算下限 0.001/迭代 → 迭代数有界）
  budget = st.w * 0.065;
  while (budget > 0) {
    const x = rng.nextIntRange(50, st.w - 50);
    const y = rng.nextIntRange(gs.waterLine, st.h - 200);
    const ii = st.idx(x, y);
    if (st.flags[ii] && st.type[ii] === STONE
      && (!st.flags[st.idx(x - 1, y)] || !st.flags[st.idx(x + 1, y)]
        || !st.flags[st.idx(x, y - 1)] || !st.flags[st.idx(x, y + 1)])) {
      let lava = 0;
      for (let a = x - 25; a < x + 25; a++) {
        for (let b = y - 25; b < y + 25; b++) {
          if (st.inBounds(a, b)) {
            const ji = st.idx(a, b);
            if (st.liquid[ji] > 0 && st.liquidType[ji] === 2) lava++;
          }
        }
      }
      if (lava > 20) {
        st.type[ii] = LAVA_MOSS;
        budget -= 1;
      } else {
        budget -= 0.002;
      }
    }
    budget -= 0.001;
  }

  // ---- 尾段（cs:17767-17806）：全图每苔藓块四邻 grassSpread=0 的 SpreadGrass ----
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const ii = st.idx(x, y);
      if (!st.flags[ii]) continue;
      const sheet = TILE_DEFS[st.type[ii]]?.vanilla?.sheet ?? -1;
      if (!MOSS_SHEETS.has(sheet)) continue;
      for (let k = 0; k < 4; k++) {
        const nx = k === 0 ? x - 1 : k === 1 ? x + 1 : x;
        const ny = k === 2 ? y - 1 : k === 3 ? y + 1 : y;
        // try/catch 的 repeat:false 回退对应本仓递归深度上限（无栈溢出语义，等效)
        spreadGrass(st, nx, ny, STONE, st.type[ii], true);
      }
    }
  }
}
