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
import { WALL_HOUSE } from './SurfaceDecorPasses';
import { flipGenSolid, genSolidType } from './GenSolid';

const STONE = TILE_BY_KEY['stone']!;
/** SolidTile 类型计数表（countTiles cs:9557-9576） */
const SHROOM = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const ICE = idsByVanillaSheet(147, 161);
const SANDY = idsByVanillaSheet(53, 396, 397);
/** CaveWallVariety 的 IsTouching 无效集（cs:16826-16835：冰/沙/蘑菇草/191）。
 *  ★R8-1 复核**驳回**（蓝队）：石支两级 IsTouching 是 Chain=AND 串联
 *  （GenAction.UnitApply 成功才接 NextAction,Modifiers.cs:283-321/Actions.cs:624），
 *  而第二级六元素集 ⊂ 第一级七元素集 → 复合谓词恒等价于六元素集,
 *  **第一级的 60 是原版死代码**——石/丛两支有效无效集相同,勿补 60
 *  （曾试补 → 石腔斑误否决 + PlaceWall 掷流移位全图漂） */
const INVALID_TOUCH = idsByVanillaSheet(147, 161, 396, 397, 70, 191);
/** ModShapes.OuterOutline POINT_OFFSETS 顺序（cs:ModShapes.cs:30-34） */
const OUTLINE_OFFSETS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
/** Main.wallLargeFrames 1/2 全表（Main.cs:9652-9820）——Framing.WallFrame 走查表分支不耗掷 */
const WALL_LARGE_FRAMES = new Set([146, 147, 167, 179, 185, 224, 274, 323, 324, 325, 326, 327, 328, 329, 330, 354, 355, 358, 359, 362, 363, 366]);
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
 *  ★递归 DFS 原序（next(x-1)→(x+1)→(y-1)→(y+1)，每次入口先查 1500 帽）+
 *    CountedTiles **只登记非实心格**（cs:9585 Add 在 !SolidTile 分支内）——实心
 *    邻格可被多路重复访问：类型计数器（70/1/147/161/53/396/397）随之重复累加，
 *    shroom>rock*0.75 等墙型门与 1500 截断序都依赖此语义。曾用「栈 BFS+全格
 *    seen」等价近似 → 计数与截断集合双偏（#67 自债 wal40.8k 根因） */
function countTiles(st: TileStore, sx: number, sy: number, jungle: boolean, lavaOk: boolean): CountResult {
  const mk0 = (globalThis as { __swMark?: (s: string) => void }).__swMark;
  mk0?.(`CWC ${sx},${sy} j=${jungle ? 1 : 0} l=${lavaOk ? 1 : 0}`);
  const MAX = 1500; // 调用方语义：本 pass 恒 maxTileCount=1500（cs:17827/:17920）
  const r: CountResult = { count: 0, shroom: 0, rock: 0, ice: 0, sand: 0, lava: 0 };
  const counted = new Set<number>();
  // 2026-08-18 显式栈化（原真递归深至 1500——Chrome worker 栈≈主线程一半，与
  // HiveSpiderPass 同日爆栈修复；逆序压栈出序 = 递归 pre-order 逐帧等价）
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!, x = stack.pop()!;
    if (r.count >= MAX) continue;                                     // cs:9506 头部早退
    if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) { r.count = MAX; continue; }
    const ii = st.idx(x, y);
    if (counted.has(ii)) continue;                                    // cs:9523（仅非实心格曾登记）
    if (st.wall[ii] === 244) { r.count = MAX; continue; }             // 活木墙封顶（cs:9515）
    if (st.liquid[ii] > 0 && st.liquidType[ii] === 4) { r.count = MAX; continue; } // 微光液
    if (!jungle) {
      if (st.wall[ii] !== 0) { r.count = MAX; continue; }             // 已有墙封顶（cs:9526）
      if (st.liquid[ii] > 0 && st.liquidType[ii] === 2) {             // 岩浆
        r.lava++;
        if (!lavaOk) { r.count = MAX; continue; }
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
      counted.add(ii);                                                // cs:9585
      r.count++;
      stack.push(x, y + 1, x, y - 1, x + 1, y, x - 1, y);             // 出序=递归子序
    }
  }
  return r;
}

/** Spread.Wall（cs:3327-3385）1:1：封闭腔 BFS 刷墙。实心/有墙格不扩散
 *  （实心且 active 且无墙 → 背面也刷）；空气格刷墙后四邻入队 */
function spreadWall(st: TileStore, sx: number, sy: number, wallType: number): void {
  (globalThis as { __swMark?: (s: string) => void }).__swMark?.(`CWW ${sx},${sy} t=${wallType}`);
  if (!st.inBounds(sx, sy)) return;
  const seen = new Set<number>();
  let frontier: Array<[number, number]> = [[sx, sy]];
  while (frontier.length) {
    const next: Array<[number, number]> = [];
    for (const [x, y] of frontier) {
      // InWorld(x,y,1)：x>=1 && y>=1 && x<max-1 && y<max-1（上界不含等号已正确,
      //   下界曾写 x<=1 多杀 x==1 一列）
      if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
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
export function runCaveWallsPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  const __cap = (globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void }).__swWallCap;
  if (__cap) __cap('cavewalls', gs, st);
  // ★pass 头 tileSolid 翻转（cs:17821-17823,原版写在 denyAll 门之外无条件执行）：
  //   162 薄冰非实心 / 226 蜥蜴砖实心 / 232 木刺非实心——countTiles 的 SolidTile
  //   洪泛与主段选点随之判定。原为本文件局部 SOLID_OVERRIDES 表,已迁移 GenSolid
  //   统一（下游消费端经 genSolidType 可见）。
  flipGenSolid([162], false);
  flipGenSolid([226], true);
  flipGenSolid([232], false);
  // ★IIIII44（cs:17839）：三翻转在 denyAll 门**之外**无条件执行（照录），主段
  //   `!Skyblock.denyAllGeneration` 整门——天空盒世界翻转后直接跳出。
  if (gs.seedFlags.skyblock) return;
  // ---- 主段（cs:17827-17871）：w*0.04 次，封闭腔(10≤air<1500)刷洞穴背景墙 ----
  const maxY = st.h - 220;
  const minY = Math.floor((gs.worldSurface + gs.rockLevel) / 2);
  const n1 = Math.floor(st.w * 0.04);
  for (let i = 0; i < n1; i++) {
    gp?.set3(i / Math.max(1, n1), 0, 0.8);   // 进度锚：主段（估；次段丛林墙占尾 20%）
    let tries = 0;
    let x = rng.int(200, st.w - 201);
    let y = rng.int(minY, maxY - 1);
    // ★IIIII186 remix y 覆写重掷（1457/1458 cs:17844-17847≡同号,重试支 cs:17852-17855）：
    //   y 先按通用域掷一次——remix 下**被弃 y 是活掷**（#64/#65 判例：先掷后覆写）,
    //   remix 再按浅带 Next((int)Main.worldSurface+25,(int)Main.rockLayer) 覆写。JS 整缺
    //   此臂 → 每 pick 少 1 骰且 remix 选点带错（应在 ws+25..rock 浅带,JS 恒走中深带）
    if (gs.seedFlags.remix) y = rng.int(gs.worldSurface + 25, gs.rockLevel - 1);
    let c = countTiles(st, x, y, false, true);
    while ((c.count >= 1500 || c.count < 10) && tries < 500) {
      tries++;
      x = rng.int(200, st.w - 201);
      y = rng.int(minY, maxY - 1);
      if (gs.seedFlags.remix) y = rng.int(gs.worldSurface + 25, gs.rockLevel - 1);
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
  // ---- ★IIIII186 remix 第二段（1457/1458 cs:17908-17931≡同号,整段补移植）----
  //  remixWorldGen 专属循环 w*0.04 次：y 域 Next((int)Main.rockLayer, Main.maxTilesY-350)
  //  （深带,无通用前置掷/无重试覆写）;受理门 `num6<500 && iceCount==0 && lavaCount==0 &&
  //  sandCount==0`（三计数=末次 countTiles 静态,cs:9503-9507 每次 countTiles 头清零,
  //  lavaOk=true 下岩浆只累加不封顶）→ wallType=Next(2)!=0?63:2 Spread.Wall。
  //  JS 曾整段缺失 → remix 深带墙 63/2 全缺（#67 W 差副源）。
  if (gs.seedFlags.remix) {
    const maxYR = st.h - 350;
    const n3 = Math.floor(st.w * 0.04);
    for (let j = 0; j < n3; j++) {
      gp?.set3(j / Math.max(1, n3), 0, 0.8);   // 进度锚：原版 num5*0.66（重用主段估锚）
      let tries = 0;
      let x = rng.int(200, st.w - 201);
      let y = rng.int(gs.rockLevel, maxYR - 1);
      let c = countTiles(st, x, y, false, true);
      while ((c.count >= 1500 || c.count < 10) && tries < 500) {
        tries++;
        x = rng.int(200, st.w - 201);
        y = rng.int(gs.rockLevel, maxYR - 1);
        c = countTiles(st, x, y, false, true);
      }
      if (tries < 500 && c.ice === 0 && c.lava === 0 && c.sand === 0) {
        spreadWall(st, x, y, rng.nextInt(2) !== 0 ? 63 : 2);
      }
    }
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
      // ★R8-2:补 !wallHouse 门（cs:17940）——房屋墙（UndergroundHouses :17081 先行
      // 已建）既不清零也不重计数,num13 保持上一轮值(上一轮合法即立即退出并在
      // 房屋墙处 Spread.Wall2);曾漏门 → 房屋墙被当普通墙清零续掷
      if (!WALL_HOUSE.has(wl) && wl !== 244) c = wl === 64 ? countTiles(st, x, y, true, false).count : 0;
    }
    if (tries < 1000) spreadWall2(st, x, y, 15);
  }
}

/** CaveWallVariety（cs:16786-16846）1:1：墙变体斑。
 *  选点 active 格（丛林草 60 → 墙 204-207；石头 1 且上格无墙 → 泥 196-199 /
 *  石 208-215 按深度），上格为空气则洪泛（≤1000，非实心），全腔不触碰无效集
 *  且 >50 格 → OuterOutline（含内腔+8 邻外环）铺墙（跳过墙 87/86/244） */
export function runCaveWallVarietyPass(st: TileStore, rng: RNG, gs: GenState,
  gp?: import('../GenProgress').GenProgress): void {
  // 一次性探针钩（同 WebsPass 模式）：WallVariety 入口快照（债时间线用）
  {
    const g0 = globalThis as { __swCwvCap?: (gs: GenState, st: TileStore) => void };
    try { g0.__swCwvCap?.(gs, st); } catch { /* probe */ }
  }
  const num2 = Math.floor(300 * (st.w * st.h) / 5040000);
  let remaining = num2;
  let budget = 100000;
  const __num2 = num2;
  // ★IIIII95 A/B 回归仪：SW_SPOT_NOFIX=1 时哨兵＝关掉本批新增 remix 臂拍摄基线（见文件头）
  const noFixArms = (globalThis as { __swSpNoFixArms?: boolean }).__swSpNoFixArms === true;
  // ★CW3 PlaceWall 掷骰债（rig 陷阱①框架耗掷）：Actions.PlaceWall 置墙后调
  //   WorldGen.SquareWallFrame(x,y)+四邻（neighbors=true）——每次 SquareWallFrame 的
  //   中心格 Framing.WallFrame(i,j,resetFrame=true) 耗 genRand.Next(0,3)（Framing.cs:390，
  //   wall==21 再耗 Next(2):391）；wall==0/越界/WallID 大帧墙（Main.cs wallLargeFrames
  //   1/2 表）不耗。变体墙 196-215 不在大帧表 → 自身格必耗。漏此耗掷 = 整条流后续
  //   候选/门掷全错位（#56 债根因：139k wal 残余主源）。
  const frameDraw = (fx: number, fy: number): void => {
    if (fx <= 0 || fy <= 0 || fx >= st.w - 1 || fy >= st.h - 1) return; // WallFrame 边界早退
    const wl = st.wall[st.idx(fx, fy)];
    if (wl === 0) return;                       // cs:337 wall==0 早退
    if (WALL_LARGE_FRAMES.has(wl)) return;      // cs:378/383 大帧分支（无掷）
    rng.nextInt(3);                             // cs:390 Next(0,3)
    if (wl === 21) rng.nextInt(2);              // cs:391
  };
  const applyAt = (wx: number, wy: number): void => {
    if (wx < 0 || wy < 0 || wx >= st.w || wy >= st.h) return;
    const wi = st.idx(wx, wy);
    const wl = st.wall[wi];
    if (wl === 87 || wl === 86 || wl === 244) return; // SkipWalls Fail → PlaceWall 不执行
    st.wall[wi] = wallTypeCache;
    frameDraw(wx, wy);                          // SquareWallFrame(x,y) 中心格
    frameDraw(wx + 1, wy);                      // neighbors=true 四邻（cs:534-537 顺序）
    frameDraw(wx - 1, wy);
    frameDraw(wx, wy - 1);
    frameDraw(wx, wy + 1);
  };
  let wallTypeCache = 0;
  while (remaining > 0 && budget > 0) {
    gp?.set(1 - remaining / __num2);   // 进度锚：预算消耗比例（num2 剩余倒数）
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
      // ★★★IIIII95（Terarria1458 WorldGen.cs cs:16824-16831）：remix 臂——比较方向
      //   全体翻转（remix 世界地表/地底倒置：Y>rockLayer→泥 196 族）且中带判据为
      //   `(Y <= lavaLine || Next(2) != 0)`（**短路掷**：Next(2) 仅在 Y>lavaLine 时
      //   才耗，一半概率落 208 族）。普通世界整支不可达、骰序不变。
      if (gs.seedFlags.remix && !noFixArms) {
        if (py > gs.genRockLayer) wallType = 196 + rng.nextInt(4);
        else if (py <= gs.lavaLine || rng.nextInt(2) !== 0) wallType = 212 + rng.nextInt(4);
        else wallType = 208 + rng.nextInt(4);
      } else if (py < gs.genRockLayer) wallType = 196 + rng.nextInt(4);   // 泥墙变体
      else if (py >= gs.lavaLine) wallType = 208 + rng.nextInt(4);        // 深层石墙
      else wallType = 212 + rng.nextInt(4);
    }
    if (wallType !== 0 && !st.flags[above]) {
      wallTypeCache = wallType;
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
        // ★SolidOrSlopedTile（cs:70046）= active && tileSolid && !tileSolidTop &&
        //   !inActive —— **不含 halfBrick/slope**（名字带 Sloped 但不查坡位）！曾加
        //   `half||slope!==0` 门 → 斜面密集腔被误判实心截断洪泛 → 斑误放（9293480
        //   债线 056 出口 wal=78678 的自因主源）。solid 走 GenSolid：本 pass 时点
        //   226/162 已被 FragileIce（cs:16782-83）翻非实心,原版读可变 tileSolid 同值。
        const qd = TILE_DEFS[st.type[qi]];
        if (st.flags[qi] && qd && genSolidType(st.type[qi]) && !qd.platform) continue;
        cells.add(qi);
        quota--;
        // IsTouching(8 向，cs:16828-16833)：触碰无效集 → foundInvalidTile
        // （★R8-1 复核驳回:石支两级 IsTouching=AND 且六元素集 ⊂ 七元素集,
        //   有效谓词=六元素集,两支同表——见文件头 INVALID_TOUCH 注释）
        if (!invalid) {
          const touch = INVALID_TOUCH;
          for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
            const ni = st.idx(qx + dx, qy + dy);
            if (st.flags[ni] && touch.has(st.type[ni])) { invalid = true; break; }
          }
        }
        if (qx + 1 < st.w - 1) queue.push([qx + 1, qy]);
        if (qx - 1 >= 1) queue.push([qx - 1, qy]);
        if (qy + 1 < st.h - 1) queue.push([qx, qy + 1]);
        if (qy - 1 >= 1) queue.push([qx, qy - 1]);
      }
      if (quota <= 0 && queue.length) complete = false; // Gen 返回 = 队列耗尽
      const __cwvLog = (globalThis as { __swCwvLog?: (s: string) => void }).__swCwvLog;
      if (__cwvLog) __cwvLog(`SPOT ${px},${py} cells=${cells.size} quota=${quota} qleft=${queue.length} complete=${complete} invalid=${invalid} wall=${wallType}`);
      if (cells.size > 50 && complete && !invalid) {
        // OuterOutline(useDiagonals+useInterior) 1:1：逐 datum 先 interior 后 8 邻环
        // （POINT_OFFSETS 顺序），环点在 shape 内则跳过（cs:ModShapes.OuterOutline:50-62）。
        // 形状记录相对洪泛 origin (px,py-1)，铺放 origin=(px,py) → 整体下移 1 行
        // （原版原文如此：cs:16827 洪泛 origin 与 :16836 铺放 origin 的差，勿"修正"）。
        // cells 迭代序 = 洪泛访问序 = C# HashSet<Point16> 无删除时的 entries 序 ✓。
        for (const ci of cells) {
          const qx = ci % st.w, qy = Math.floor(ci / st.w);
          applyAt(qx, qy + 1); // useInterior（+1 行偏移）
          for (const [ox, oy] of OUTLINE_OFFSETS) {
            if (!cells.has(st.idx(qx + ox, qy + oy))) applyAt(qx + ox, qy + 1 + oy);
          }
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
