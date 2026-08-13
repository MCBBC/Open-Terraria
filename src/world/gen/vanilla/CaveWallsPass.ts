// 洞穴自然墙世界生成（1.4.5.6 1:1）：
// - CaveWallsInEnclosedSpaces（WorldGen.cs:17819-17948）：主段对封闭洞穴腔刷背景墙
//   （Spread.Wall cs:3327-3385：石腔→洞穴墙 59/61/170/171、冰腔→40/71、蘑菇腔→80、
//   岩浆腔→79；选点 countTiles cs:9493 洪泛）；次段把丛林墙 64 腔刷成泥墙 15
//   （Spread.Wall2）。**地下自然墙唯二来源 = DirtWallBackgrounds（近地表）+ 本 pass**
//   （TerrainPass 只填 tile 不刷墙）——缺它则全洞穴无背景墙，暴露晶簇（178，贴墙
//   装饰）全部悬空（2026-08-12 用户标注 debug-report 实证 1227 洞穴空气格带墙数=0）。
// - CaveWallVariety（cs:16786-16846）：洞穴墙变体斑——泥土墙 196-199 / 丛林 204-207 /
//   石墙 208-215，WorldUtils.Gen 洪泛（ShapeFloodFill 1000 上限）+ OuterOutline
//   （useDiagonals+useInterior，**origin 与洪泛 origin 差 1 行的偏移原样保留**）。
// 注册序：CaveWallVariety(56) 在 Waterfalls(58→我方"瀑布唇缘"槽)与 LifeCrystals
// 之间；CaveWalls(67) 在 Moss(65) 之后（我方"苔藓"槽后）。
import type { RNG } from '../../../core/rng';
import type { TileStore } from '../../TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { spreadWall2 } from './GrassWallPass';
import { flipGenSolid, genSolidType } from './GenSolid';

const STONE = TILE_BY_KEY['stone']!;
/** SolidTile 类型计数表（countTiles cs:9557-9576） */
const SHROOM = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const ICE = idsByVanillaSheet(147, 161);
const SANDY = idsByVanillaSheet(53, 396, 397);
/** CaveWallVariety 的 IsTouching 无效集（cs:16826-16835：冰/沙/蘑菇草/191） */
const INVALID_TOUCH = idsByVanillaSheet(147, 161, 396, 397, 70, 191);
/** 微光安全距离（WorldGen.cs:4104 shimmerSafetyDistance） */
const SHIMMER_SAFETY = 150;

/** WorldGen.SolidTile（cs:70155）：active && tileSolid && !tileSolidTop && !halfBrick
 *  && slope==0 && !inActive。tileSolid 走 GenSolid（pass 头 cs:17821-17823 翻转表,
 *  原 SOLID_OVERRIDES 局部表已迁移 GenSolid 统一） */
function solidAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const ii = st.idx(x, y);
  if (!st.flags[ii]) return false;
  const def = TILE_DEFS[st.type[ii]];
  if (!def) return false;
  return genSolidType(st.type[ii]) && !def.platform && !st.half[ii] && st.slope[ii] === 0 && (st.wire[ii] & 32) === 0;
}

interface CountResult { count: number; shroom: number; rock: number; ice: number; sand: number; lava: number }

/** countTiles/nextCount（cs:9493-9600）1:1：空气连通腔计数 + 类型计数。
 *  jungle=false：遇任何墙/微光液封顶；lavaOk=false 遇岩浆也封顶。
 *  递归四邻（迭代栈等价——计数与封顶均单调，与遍历序无关） */
function countTiles(st: TileStore, sx: number, sy: number, jungle: boolean, lavaOk: boolean): CountResult {
  const MAX = 1500; // 调用方语义：本 pass 恒 maxTileCount=1500（cs:17827/:17920）
  const r: CountResult = { count: 0, shroom: 0, rock: 0, ice: 0, sand: 0, lava: 0 };
  const seen = new Set<number>();
  const stack: Array<[number, number]> = [[sx, sy]];
  while (stack.length) {
    if (r.count >= MAX) { r.count = MAX; return r; }
    const [x, y] = stack.pop()!;
    if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) { r.count = MAX; return r; }
    const ii = st.idx(x, y);
    if (seen.has(ii)) continue;
    seen.add(ii);
    if (st.wall[ii] === 244) { r.count = MAX; return r; }           // 活木墙封顶（cs:9515）
    if (st.liquid[ii] > 0 && st.liquidType[ii] === 4) { r.count = MAX; return r; } // 微光液
    if (!jungle) {
      if (st.wall[ii] !== 0) { r.count = MAX; return r; }           // 已有墙封顶（cs:9526）
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) {           // 岩浆
        r.lava++;
        if (!lavaOk) { r.count = MAX; return r; }
      }
    }
    if (st.flags[ii]) {
      const t = st.type[ii];
      if (t === SHROOM) r.shroom++;
      if (t === STONE) r.rock++;
      if (ICE.has(t)) r.ice++;
      if (SANDY.has(t)) r.sand++;
    }
    if (!solidAt(st, x, y)) {
      r.count++;
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
  }
  return r;
}

/** Spread.Wall（cs:3327-3385）1:1：封闭腔 BFS 刷墙。实心/有墙格不扩散
 *  （实心且 active 且无墙 → 背面也刷）；空气格刷墙后四邻入队 */
function spreadWall(st: TileStore, sx: number, sy: number, wallType: number): void {
  if (!st.inBounds(sx, sy)) return;
  const seen = new Set<number>();
  let frontier: Array<[number, number]> = [[sx, sy]];
  while (frontier.length) {
    const next: Array<[number, number]> = [];
    for (const [x, y] of frontier) {
      if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) continue; // InWorld(,1)
      const ii = st.idx(x, y);
      if (seen.has(ii)) continue;
      seen.add(ii);
      if (solidAt(st, x, y) || st.wall[ii] !== 0) {
        if (st.flags[ii] && st.wall[ii] === 0) st.wall[ii] = wallType;
        continue;
      }
      st.wall[ii] = wallType;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const ni = st.idx(x + dx, y + dy);
        if (!seen.has(ni)) next.push([x + dx, y + dy]);
      }
    }
    frontier = next;
  }
}

/** CaveWallsInEnclosedSpaces（cs:17819-17948）主段 + 丛林泥墙次段。
 *  RNG 消费顺序严格 1:1（主段：每迭代 2 掷 + 重掷 2 掷/次 + 恒 Next(2) +
 *  else 分支补 Next(4)；次段：每迭代 2 掷 + 重掷按墙值条件掷） */
export function runCaveWallsPass(st: TileStore, rng: RNG, gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:17821-17823,原版写在 denyAll 门之外无条件执行）：
  //   162 薄冰非实心 / 226 蜥蜴砖实心 / 232 木刺非实心——countTiles 的 SolidTile
  //   洪泛与主段选点随之判定。原为本文件局部 SOLID_OVERRIDES 表,已迁移 GenSolid
  //   统一（下游消费端经 genSolidType 可见）。
  flipGenSolid([162], false);
  flipGenSolid([226], true);
  flipGenSolid([232], false);
  // ---- 主段（cs:17827-17871）：w*0.04 次，封闭腔(10≤air<1500)刷洞穴背景墙 ----
  const maxY = st.h - 220;
  const minY = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  const n1 = Math.floor(st.w * 0.04);
  for (let i = 0; i < n1; i++) {
    let tries = 0;
    let x = rng.int(200, st.w - 201);
    let y = rng.int(minY, maxY - 1);
    let c = countTiles(st, x, y, false, true);
    while ((c.count >= 1500 || c.count < 10) && tries < 500) {
      tries++;
      x = rng.int(200, st.w - 201);
      y = rng.int(minY, maxY - 1);
      c = countTiles(st, x, y, false, true);
    }
    if (tries >= 500) continue;
    let wallType = rng.nextInt(2); // 恒消费一次 Next(2)（cs:17856，分支可整体覆写）
    if (c.shroom > c.rock * 0.75) wallType = 80;          // 蘑菇腔（cs:17858）
    else if (c.ice > 0) wallType = wallType === 0 ? 40 : 71; // 冰腔：雪墙/冰墙
    else if (c.lava > 0) wallType = 79;                   // 岩浆腔：黑曜石背墙
    else wallType = [59, 61, 170, 171][rng.nextInt(4)];   // 石腔：洞穴墙四选
    spreadWall(st, x, y, wallType);
  }
  // ---- 次段（cs:17920-17946）：w*0.02 次，丛林墙(64)腔刷泥墙 15（Spread.Wall2） ----
  //  生成期墙面无 crafted 屋墙（wallHouse 恒 false），cs:17940 条件等价于
  //  「墙==64 才计数，否则清零」；244 活木墙单列
  const maxY2 = gs.lavaLine;
  const n2 = Math.floor(st.w * 0.02);
  for (let k = 0; k < n2; k++) {
    let tries = 0;
    let x = rng.int(200, st.w - 201);
    let y = rng.int(gs.worldSurface, maxY2 - 1);
    let c = st.wall[st.idx(x, y)] === 64 ? countTiles(st, x, y, true, false).count : 0;
    while ((c >= 1500 || c < 10) && tries < 1000) {
      tries++;
      x = rng.int(200, st.w - 201);
      y = rng.int(gs.worldSurface, maxY2 - 1);
      const wl = st.wall[st.idx(x, y)];
      if (wl !== 244) c = wl === 64 ? countTiles(st, x, y, true, false).count : 0;
    }
    if (tries < 1000) spreadWall2(st, x, y, 15);
  }
}

/** CaveWallVariety（cs:16786-16846）1:1：墙变体斑。
 *  选点 active 格（丛林草 60 → 墙 204-207；石头 1 且上格无墙 → 泥 196-199 /
 *  石 208-215 按深度），上格为空气则洪泛（≤1000，非实心），全腔不触碰无效集
 *  且 >50 格 → OuterOutline（含内腔+8 邻外环）铺墙（跳过墙 87/86/244） */
export function runCaveWallVarietyPass(st: TileStore, rng: RNG, gs: GenState): void {
  const num2 = Math.floor(300 * (st.w * st.h) / 5040000);
  let remaining = num2;
  let budget = 100000;
  while (remaining > 0 && budget > 0) {
    // RandomWorldPoint((int)GenVars.worldSurface, 2, 190, 2)（cs:16799）：x∈[2,w-3]、
    // y∈[ws,h-191]。★CW1：下界是 **GenVars.worldSurface**（Terrain 游走终值 double，
    // = gs.genWorldSurface），非 Main.worldSurface（= worldSurfaceHigh+25≈gs.worldSurface），
    // 曾误用 gs.worldSurface → 选点深度带整体偏移
    const wsGen = Math.trunc(gs.genWorldSurface);          // (int) 截断
    let px = rng.int(2, st.w - 3);
    let py = rng.int(wsGen, st.h - 191);
    while (gs.shimmerX >= 0 && Math.hypot(px - gs.shimmerX, py - gs.shimmerY) < SHIMMER_SAFETY) {
      px = rng.int(2, st.w - 3);
      py = rng.int(wsGen, st.h - 191);
    }
    const ii = st.idx(px, py);
    if (!st.flags[ii]) continue;
    const t = st.type[ii];
    const above = st.idx(px, py - 1);
    const isJungle = t === JUNGLE_GRASS;
    let wallType = 0;
    if (isJungle) {
      wallType = 204 + rng.nextInt(4);
    } else if (t === STONE && st.wall[above] === 0) {
      // ★CW2（cs:16805 非 remix 分支）：深度分档用 **GenVars.rockLayer**
      // （Terrain 游走终值 double = gs.genRockLayer），非 Main.rockLayer（gs.rockLevel），
      // 曾误用 gs.rockLevel → 泥/石墙变体分界偏移；lavaLine 两版同值（gs.lavaLine）
      if (py < gs.genRockLayer) wallType = 196 + rng.nextInt(4);    // 泥墙变体
      else if (py >= gs.lavaLine) wallType = 208 + rng.nextInt(4);  // 深层石墙
      else wallType = 212 + rng.nextInt(4);
    }
    if (wallType !== 0 && !st.flags[above]) {
      // ShapeFloodFill(1000)（cs:16827）+ IsNotSolid + ContinueWrapper(IsTouching×2)
      // → foundInvalidTile；Gen 返回 = 队列耗尽（腔 ≤1000 格）
      const cells = new Set<number>();
      let invalid = false;
      let complete = true;
      const queue: Array<[number, number]> = [[px, py - 1]];
      let quota = 1000;
      while (queue.length && quota > 0) {
        const [qx, qy] = queue.shift()!;
        const qi = st.idx(qx, qy);
        if (cells.has(qi)) continue;
        // IsNotSolid：active 且 SolidOrSlopedTile → Fail（不入形、不计数）
        // ★solid 走 GenSolid：本 pass 时点 226/162 已被 FragileIce（cs:16782-83）翻
        //   非实心,原版 SolidOrSlopedTile 读可变 tileSolid 同样视其为非实心
        const qd = TILE_DEFS[st.type[qi]];
        const solidOrSloped = !!st.flags[qi] && qd
          && (genSolidType(st.type[qi]) || !!st.half[qi] || st.slope[qi] !== 0);
        if (st.flags[qi] && solidOrSloped) continue;
        cells.add(qi);
        quota--;
        // IsTouching(8 向，cs:16828-16833)：触碰无效集 → foundInvalidTile
        if (!invalid) {
          for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
            const ni = st.idx(qx + dx, qy + dy);
            if (st.flags[ni] && INVALID_TOUCH.has(st.type[ni])) { invalid = true; break; }
          }
        }
        if (qx + 1 < st.w - 1) queue.push([qx + 1, qy]);
        if (qx - 1 >= 1) queue.push([qx - 1, qy]);
        if (qy + 1 < st.h - 1) queue.push([qx, qy + 1]);
        if (qy - 1 >= 1) queue.push([qx, qy - 1]);
      }
      if (quota <= 0 && queue.length) complete = false; // Gen 返回 = 队列耗尽
      if (cells.size > 50 && complete && !invalid) {
        // OuterOutline(useDiagonals+useInterior)：铺腔体 + 腔外 8 邻环。
        // 形状记录相对洪泛 origin (px,py-1)，铺放 origin=(px,py) → 整体下移 1 行
        // （原版原文如此：cs:16827 洪泛 origin 与 :16836 铺放 origin 的差，勿"修正"）
        for (const ci of cells) {
          const cx = ci % st.w, cy = Math.floor(ci / st.w) + 1;
          const paint = (wx: number, wy: number): void => {
            if (!st.inBounds(wx, wy)) return;
            const wi = st.idx(wx, wy);
            const wl = st.wall[wi];
            if (wl === 87 || wl === 86 || wl === 244) return; // SkipWalls
            st.wall[wi] = wallType;
          };
          paint(cx + 1, cy);
          paint(cx - 1, cy);
          paint(cx, cy + 1);
          paint(cx, cy - 1);
          paint(cx + 1, cy + 1);
          paint(cx + 1, cy - 1);
          paint(cx - 1, cy + 1);
          paint(cx - 1, cy - 1);
          paint(cx, cy); // useInterior
        }
        remaining--;
      } else {
        budget--;
      }
    }
  }
}

/** DirtWallsIntoMudWallsInJungleAndJungleMinMax（cs:20963-21017）1:1：
 *  ① 表层带（y < worldSurface+20）扫首/末个丛林草 60 列 → 丛林水平界
 *    （原版存 GenVars.jungleMinX/MaxX——下游唯一读点 cs:18421 在更早的
 *    SpreadingGrass 内、届时恒 -1，bug-for-bug 已在 WorldGen.ts 保留，故不入 GenState）；
 *  ② 界内表层带的泥土墙 2 / 泥墙 59 → 丛林泥墙 15，边缘 2/3 列按 Next(2)/Next(3)
 *    抖动放行（&& 短路求值序照原文）。注册序：LongMoss(20915) → 本 pass →
 *    BeeLarva(21018)。2026-08-13 前整 pass 缺失 = 丛林地表背景墙全是泥土墙。
 *  零结构写，只改 wall 数组（直接原版墙 id）。 */
export function runJungleMudWallsPass(st: TileStore, rng: RNG, gs: GenState): void {
  const bandY = Math.floor(gs.worldSurface) + 20;   // j < worldSurface+20.0
  let minX = 0, maxX = 0;
  let flag = false;
  for (let i = 5; i < st.w - 5; i++) {
    for (let j = 0; j < bandY; j++) {
      if (st.flags[st.idx(i, j)] && st.type[st.idx(i, j)] === JUNGLE_GRASS) {
        minX = i; flag = true; break;
      }
    }
    if (flag) break;
  }
  flag = false;
  for (let i = st.w - 5; i > 5; i--) {
    for (let j = 0; j < bandY; j++) {
      if (st.flags[st.idx(i, j)] && st.type[st.idx(i, j)] === JUNGLE_GRASS) {
        maxX = i; flag = true; break;
      }
    }
    if (flag) break;
  }
  for (let l = minX; l <= maxX; l++) {
    for (let m = 0; m < bandY; m++) {
      const wi = st.idx(l, m);
      // 边缘带逐格掷骰（&& 左求值：内带 0 掷）
      if (((l >= minX + 2 && l <= maxX - 2) || rng.nextInt(2) !== 0)
        && ((l >= minX + 3 && l <= maxX - 3) || rng.nextInt(3) !== 0)
        && (st.wall[wi] === 2 || st.wall[wi] === 59)) {
        st.wall[wi] = 15;
      }
    }
  }
}
