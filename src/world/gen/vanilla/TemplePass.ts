// 原版 "Jungle Temple"(WorldGen.cs:7190 + makeTemple L17158)1:1 移植。
// 之字形下沉房间链(重投至与旧房不相交;锚点=中心;行程 1-2 递增)→ 全房对实心砖连线
// → 房内双遍游走挖腔(墙 87)→ templePather 通道 → outerTempled 封壳 → 入口隧道+门框
// → templeCleaner → 祭坛 237(末间中心 ±15)。
// templePart2 五段(陷阱→箱→雕像→家具→挂饰)是独立注册的 LihzahrdTemplePart2 pass
// (cs:17809,Moss 之后 CaveWalls 之前)——见 runTemplePart2Pass(2026-08-16 拆分)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { placeBuriedChest, type ChestSink } from './BuriedChestsPass';

import { flipGenSolid, vanGenSolidType } from './GenSolid';
import { killTileWhole } from './TrapsPass';
import { genSquareTileFrame } from './FinalCleanupPass';

const BRICK = TILE_BY_KEY['v_226_lihzahrd_brick']!;
const ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;

// ---- mayanTrap（cs:8314-8644）实心谓词族（生成期 tileSolid = vanGenSolidType） ----
const SHEET_OF_TP = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF_TP[q] = s;
}
const sheetOfTP = (t: number): number => (t >= 0 && t < SHEET_OF_TP.length ? SHEET_OF_TP[t] : -1);
/** Main.tileSolidTop（Main.cs:6764+ 全 86 项，TrapsPass 同表副本——不 import 防耦合） */
const SOLID_TOP_TP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** TileID.Sets.Platforms（TileID.cs:243） */
const PLATFORMS_TP = new Set([19, 427, 435, 436, 437, 438, 439]);
/** TileID.Sets.Boulders（TileID.cs:195） */
const BOULDERS_TP = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** ForbidsSloping（cs:81437）：21/26/77/88/235/237/441/467/468/470/475/488/597 */
const FORBIDS_SLOPING = new Set([21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597]);
/** CanPoundTile 直拒族（cs:81434 switch） */
const CANT_POUND = new Set([10, 48, 137, 232, 380, 387, 388, 476, 484]);
/** IsATreeTrunk（TileID.cs:161）——CanKillTile 树干保护门（本语境可达子集） */
const TREE_TRUNKS_TP = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);

/** SolidOrSlopedTile（cs:70046）：active && tileSolid && !tileSolidTop && !inActive
 *  ——名字带 Sloped 但**不含坡条件**（实心且无论坡向） */
function solidOrSlopedTP(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i]!;
  return vanGenSolidType(t) && !SOLID_TOP_TP.has(sheetOfTP(t))
    && ((st.wire[i] >>> 5) & 1) === 0;
}
/** SolidTile（cs:70155）：active && tileSolid && !tileSolidTop && !half && slope==0 && !inActive */
function solidTileTP(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i]!;
  return vanGenSolidType(t) && !SOLID_TOP_TP.has(sheetOfTP(t)) && !st.half[i]
    && st.slope[i] === 0 && ((st.wire[i] >>> 5) & 1) === 0;
}
/** SolidTile2（cs:70178）：active && tileSolid && slope==0 && !half && !inActive（无 solidTop 位） */
function solidTile2TP(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i]!;
  return vanGenSolidType(t) && !st.half[i] && st.slope[i] === 0
    && ((st.wire[i] >>> 5) & 1) === 0;
}
/** PlatformProperTopFrame（cs:70197）：帧列号 ∈[0,7]∪[12,16]∪[25,26] */
function platformProperTP(fx: number): boolean {
  const num = Math.floor(fx / 18);
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) {
    if (num >= 25) return num <= 26;
    return false;
  }
  return true;
}
/** SolidTileAllowBottomSlope（cs:70211） */
function solidAllowBottomTP(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const t = st.type[i]!;
  const sheet = sheetOfTP(t);
  const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
  return (vanGenSolidType(t) || SOLID_TOP_TP.has(sheet))
    && (!topSlope || (PLATFORMS_TP.has(sheet) && platformProperTP(st.frameX[i]!)))
    && !st.half[i] && ((st.wire[i] >>> 5) & 1) === 0;
}
/** CanKillTile（cs:62249，本语境可达子集：wall350 + 上邻树干保护） */
function canKillTileTP(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i] || st.wall[i] === 350) return false;
  if (y >= 1) {
    const u = st.idx(x, y - 1);
    if (st.flags[u]) {
      const sh = sheetOfTP(st.type[u]!);
      if (TREE_TRUNKS_TP.has(sh) || sh === 323) return false;
    }
  }
  return true;
}
/** CanPoundTile（cs:81434）+ SlopeTile(i,j,0)（cs:81507，生成期只做 half/slope 双清） */
function slopeTileTP(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  const sh = sheetOfTP(st.type[i]!);
  if (CANT_POUND.has(sh) || BOULDERS_TP.has(sh)) return;
  if (sh === 190 || sh === 30) return;                       // isGeneratingOrLoadingWorld 分支
  if (y >= 1) {
    const u = st.idx(x, y - 1);
    if (st.flags[u] && FORBIDS_SLOPING.has(sheetOfTP(st.type[u]!))) return;
  }
  if (!canKillTileTP(st, x, y)) return;
  st.half[i] = 0;
  st.slope[i] = 0;
}
/** CanGeneratePressurePlateAt（cs:11044） */
function canGenPlateTP(st: TileStore, x: number, y: number): boolean {
  if (x < 3 || y < 3 || x > st.w - 4 || y > st.h - 4) return false;   // InWorld(i,j,3)
  if (!solidAllowBottomTP(st, x, y + 1)) return false;
  const g = st.idx(x, y + 1);
  if (BOULDERS_TP.has(sheetOfTP(st.type[g]!))) return false;
  if (st.wall[g] === 350) return false;
  return true;
}
const inWorld5TP = (st: TileStore, x: number, y: number): boolean =>
  x >= 5 && x < st.w - 5 && y >= 5 && y < st.h - 5;

interface Room { x: number; y: number; w: number; h: number }

function inter(a: Room, b: Room): boolean {
  // C# Rectangle.Intersects:仅边接触不算相交
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function setBrick(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = BRICK; st.flags[i] = 1; st.liquid[i] = 0; st.liquidType[i] = 0;
  // ★写砖必清坡位（cs:33760-33763 房连线列 / 33786-33788 房实心 / 33563-33566
  //   outerTempled / 33499-33503 templeCleaner else / 34161-34165+34181-34185 门框柱,
  //   全部六处 226 写入点都是 active(true)+type=226+liquid=0+slope(0)+halfBrick(false)
  //   五连写）。神庙壳压在丛林泥/洞穴坡面格上,不清坡 → 幻影坡幸存到 @52
  //   （W 批全图残余 351 格根源;与 TileRunner ClearSlope 同族写入语义）。
  st.slope[i] = 0; st.half[i] = 0;
}

/** Tile.ClearEverything + active + type 226（1457 cs:34620-34624 / 34726-34729）：
 *  与 setBrick 差在**清墙/清帧/清漆/清线**（ClearEverything 全清后重置活性与类型）——
 *  GenerateBricks 家族专用（房间实心填与挖腔仍走 setBrick,不清墙）。 */
function setBrickClearAll(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = BRICK; st.flags[i] = 1;
  st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0;
  st.half[i] = 0; st.slope[i] = 0;
  st.frameX[i] = 0; st.frameY[i] = 0;
  st.wire[i] = 0; st.paint[i] = 0; st.paintWall[i] = 0;
}

/** 砖线活动格判定（`!tile.active() || tile.type != 226` 的反谓词,FillX/FillY 用） */
function isActiveBrick226(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return !!st.flags[i] && sheetOfTP(st.type[i]!) === 226;
}

/** C# Math.Round（银行家舍入,ToEven）——JS Math.round 是 half-away,轴对齐整数
 *  分量下两者同值,斜线分量为无理数不触 .5;保留显式实现对齐语义。 */
function roundBanker(v: number): number {
  const f = Math.floor(v), d = v - f;
  if (d === 0.5) return f % 2 === 0 ? f : f + 1;
  if (d === -0.5) return f % 2 === 0 ? f : f - 1;
  return Math.round(v);
}

/** makeTemple_GenerateBricks（1457 cs:34592-34665,零掷骰）：①房间按深度组并界
 *  （DungeonBounds.UpdateBounds）②组界 Inflate(10)（setter 钳 [10, 尺寸-10]）+
 *  CalculateHitbox（Right≤Left→Left+1）→ 组界全填 ClearEverything+226 ③两两深度组
 *  四角 StrictAngles 连线（Left/Right × Top/Bottom）。 */
function makeTempleGenerateBricks(st: TileStore, rooms: Room[], depths: number[]): void {
  const AMOUNT = 10;
  const clamp = (v: number, hi: number) => Math.max(10, Math.min(hi - 10, v));
  type Bnd = { l: number; t: number; r: number; b: number };
  const groups: Array<Bnd | null> = depths.map(() => null);
  for (let i = 0; i < rooms.length; i++) {
    const d = depths[i];
    const r = rooms[i];
    const L = r.x, T = r.y, R = r.x + r.w, B = r.y + r.h;   // Rectangle.Left/Top/Right/Bottom
    const g = groups[d];
    if (!g) groups[d] = { l: L, t: T, r: R, b: B };
    else {
      if (L < g.l) g.l = L;
      if (R > g.r) g.r = R;
      if (T < g.t) g.t = T;
      if (B > g.b) g.b = B;
    }
  }
  for (const g of groups) {
    if (!g) continue;
    g.l = clamp(g.l, st.w); g.r = clamp(g.r, st.w);
    g.t = clamp(g.t, st.h); g.b = clamp(g.b, st.h);
    g.l = clamp(g.l - AMOUNT, st.w); g.r = clamp(g.r + AMOUNT, st.w);
    g.t = clamp(g.t - AMOUNT, st.h); g.b = clamp(g.b + AMOUNT, st.h);
    // ★批4 review P2-7（DungeonBounds.CalculateHitbox cs:47-100）：退化修正是
    //   `Right = Left + 1` **经属性 setter**（再钳 ≤max-10）——Left 已被钳到
    //   maxTilesX-10 时 Right 钳回同值（宽度 0）;曾直写 g.l+1 无钳 → 多填一列/行。
    if (g.r <= g.l) g.r = clamp(g.l + 1, st.w);
    if (g.b <= g.t) g.b = clamp(g.t + 1, st.h);
    for (let k = g.l; k <= g.r; k++) {
      for (let l = g.t; l <= g.b; l++) setBrickClearAll(st, k, l);
    }
  }
  for (let m = 0; m < groups.length; m++) {
    const a = groups[m];
    if (!a) continue;
    for (let n = m + 1; n < groups.length; n++) {
      const b = groups[n];
      if (!b) continue;
      tmBricksLineStrictAngles(st, a.l, a.t, b.l, b.t, false, false);
      tmBricksLineStrictAngles(st, a.r, a.t, b.r, b.t, true, false);
      tmBricksLineStrictAngles(st, a.l, a.b, b.l, b.b, false, true);
      tmBricksLineStrictAngles(st, a.r, a.b, b.r, b.b, true, true);
    }
  }
}

/** C# Vector2（FNA）float32 仿真：float 逐运算舍入（fround）+ (float)Math.Sqrt。
 *  ★批4 review P2-6：StrictAngles 距离/Line 步进曾全 double——C# `Vector2` 全
 *  float32（Length≈1f 但可差 1 ULP → `num-=num2` 步数在整数边界差 1;坐标累积
 *  误差可致尾格 round 差 1;Distance 的 d1/d2 相等性可翻转换端选择）。 */
const fr32 = Math.fround;
/** Vector2.Length()（FNA）：(float)Math.Sqrt((X*X)+(Y*Y)),内层 float 逐运算 */
function vec2LengthF32(x: number, y: number): number {
  return fr32(Math.sqrt(fr32(fr32(x * x) + fr32(y * y))));
}
/** Vector2.Distance(a,b)（FNA）：分量差 float 减 → 平方和 float 加 → Sqrt→float */
function vec2DistanceF32(ax: number, ay: number, bx: number, by: number): number {
  const dx = fr32(ax - bx), dy = fr32(ay - by);
  return fr32(Math.sqrt(fr32(fr32(dx * dx) + fr32(dy * dy))));
}

/** makeTemple_GenerateBricks_Line_StrictAngles（1457 cs:34667）：共线直连;否则从
 *  「fillUpwards? (endX,startY) : (startX,endY)」原点取较远端做对角步进至共线,
 *  拆两段直线;500 步守卫超限回退整段直线。 */
function tmBricksLineStrictAngles(st: TileStore, startX: number, startY: number,
  endX: number, endY: number, fillLeft: boolean, fillUpwards: boolean): void {
  if (startX === endX || startY === endY) {
    tmBricksLine(st, startX, startY, endX, endY, fillLeft, fillUpwards);
    return;
  }
  const oX = fillUpwards ? endX : startX;
  const oY = fillUpwards ? startY : endY;
  const d1 = vec2DistanceF32(oX, oY, startX, startY);   // origin.Distance(start)
  const d2 = vec2DistanceF32(oX, oY, endX, endY);       // origin.Distance(end)
  let vX = startX, vY = startY, wX = endX, wY = endY;
  if (d2 > d1) { vX = endX; vY = endY; wX = startX; wY = startY; }
  let cX = vX, cY = vY;
  const sx = wX > vX ? 1 : -1;
  const sy = wY > vY ? 1 : -1;
  let guard = 500;
  while (cX !== wX && cY !== wY) {
    guard--;
    if (guard < 0) break;
    cX += sx; cY += sy;
  }
  if (guard < 0) {
    tmBricksLine(st, startX, startY, endX, endY, fillLeft, fillUpwards);
    return;
  }
  tmBricksLine(st, startX, startY, cX, cY, fillLeft, fillUpwards);
  tmBricksLine(st, cX, cY, endX, endY, fillLeft, fillUpwards);
}

/** makeTemple_GenerateBricks_Line（1457 cs:34709）：归一化步进逐格 ClearEverything+226,
 *  每格接 FillY/FillX 补柱;2000 步守卫;InWorld(5) 出界即停。
 *  ★批4 review P2-6：SafeNormalize/Length/步进全按 C# float32 语义（Utils.cs:1936
 *  SafeNormalize=零向量→默认 UnitX,否则 Vector2.Normalize=1f/(float)Math.Sqrt(X²+Y²)
 *  逐 float 舍入后分量相乘;num-=num2 每步 fround）。 */
function tmBricksLine(st: TileStore, startX: number, startY: number,
  endX: number, endY: number, fillLeft: boolean, fillUpwards: boolean): void {
  const dX = fr32(endX - startX), dY = fr32(endY - startY);   // Vector2 减法（整数域精确）
  if (dX === 0 && dY === 0) return;                            // vector2 == Vector2.Zero
  const len = vec2LengthF32(dX, dY);
  // SafeNormalize(UnitX)：零向量 → 默认（此处 len>0 恒不走默认支,守卫照写）
  const nX = len === 0 ? 1 : fr32(dX * fr32(1 / len));
  const nY = len === 0 ? 0 : fr32(dY * fr32(1 / len));
  const stepLen = vec2LengthF32(nX, nY);      // num2 = vector3.Length()（循环外一次）
  let vX = fr32(startX), vY = fr32(startY);
  let remain = len;                           // num（float32 剩余长度）
  let budget = 2000;
  let lastXAdj = -1, lastYAdj = -1;
  while (remain > 0) {
    budget--;
    if (budget > 0) {
      const px = roundBanker(vX), py = roundBanker(vY);
      if (px >= 5 && px < st.w - 5 && py >= 5 && py < st.h - 5) {   // InWorld(px,py,5)
        setBrickClearAll(st, px, py);
        tmBricksLineFillY(st, fillUpwards, lastXAdj, px, py);
        tmBricksLineFillX(st, fillLeft, lastYAdj, px, py);
        lastXAdj = px; lastYAdj = py;
        vX = fr32(vX + nX); vY = fr32(vY + nY);
        remain = fr32(remain - stepLen);   // num -= num2（float32 每步舍入）
        continue;
      }
      break;
    }
    break;
  }
}

/** makeTemple_GenerateBricks_Line_FillY（1457 cs:34750）：从当前格向 fill 方向探到
 *  首个 226 实格（≤300 步、InWorld(5) 界内、y∈(10, h-10) 开区间）,回退重走逐格填 226。 */
function tmBricksLineFillY(st: TileStore, fillUpwards: boolean, lastXAdjusted: number,
  currentX: number, currentY: number): void {
  if (currentX === lastXAdjusted) return;
  const step = fillUpwards ? -1 : 1;
  let num2 = currentY + step;
  let count = 0;
  while (!isActiveBrick226(st, currentX, num2)) {
    count++;
    num2 += step;
    if (!st.inBounds(currentX, num2) || num2 < 5 || num2 >= st.h - 5) break;   // tile==null || !InWorld(5)
  }
  if (count >= 300 || num2 <= 10 || num2 >= st.h - 10) return;
  num2 = currentY + step;
  while (!isActiveBrick226(st, currentX, num2)) {
    setBrickClearAll(st, currentX, num2);
    num2 += step;
    if (!st.inBounds(currentX, num2) || num2 < 5 || num2 >= st.h - 5) break;
  }
}

/** makeTemple_GenerateBricks_Line_FillX（1457 cs:34791）：FillY 的 X 轴镜像
 *  （fillLeft=false 向 +x;界 y∈(10, w-10)）。 */
function tmBricksLineFillX(st: TileStore, fillLeft: boolean, lastYAdjusted: number,
  currentX: number, currentY: number): void {
  if (currentY === lastYAdjusted) return;
  const step = fillLeft ? -1 : 1;
  let num2 = currentX + step;
  let count = 0;
  while (!isActiveBrick226(st, num2, currentY)) {
    count++;
    num2 += step;
    if (!st.inBounds(num2, currentY) || num2 < 5 || num2 >= st.w - 5) break;
  }
  if (count >= 300 || num2 <= 10 || num2 >= st.w - 10) return;
  num2 = currentX + step;
  while (!isActiveBrick226(st, num2, currentY)) {
    setBrickClearAll(st, num2, currentY);
    num2 += step;
    if (!st.inBounds(num2, currentY) || num2 < 5 || num2 >= st.w - 5) break;
  }
}

/** SolidTile(i, j)（cs:70155）：active + tileSolid + !tileSolidTop + 非半砖 + slope 0。
 *  与 SolidTile2（cs:70178，祭坛锚点门用）差一个 tileSolidTop（平台）条件,勿合并。 */
function solidTileST(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const j = st.idx(x, y);
  if (!st.flags[j]) return false;
  const d = TILE_DEFS[st.type[j]];
  return !!d && d.solid && !d.platform && !st.half[j] && st.slope[j] === 0;
}

export function runTemplePass(st: TileStore, rng: RNG, gs: GenState): void {
  const __cap = (globalThis as { __swWallCap?: (tag: string, gs: GenState, st: TileStore) => void }).__swWallCap;
  if (__cap) __cap('temple', gs, st);
  const tmMark = (s: string) => { const f = (globalThis as { __swTmMark?: (s: string) => void }).__swTmMark; if (f) f(s); };
  const { w, h } = st;
  const s = w / 4200;
  // 种子点(cs:15917-15992):y = Next(rockLayer, maxTilesY-600)(rockLayer 先钳 ≤ h-601);
  // x = ((NextDouble()*num3+0.1)*-dungeonSide+0.5)*w,num3 起 0.25,每 1e6 次失败
  // num3 = min(0.35, num3+0.05) 递增(cs:15978-15989);落点须为丛林草 60(cs:15972)。
  // num3==0.35 后再失败 10 轮放弃——★T7(cs:15992-16001):失败后原版**无条件**
  // 强制补建 makeTemple(maxTilesX - generatingDungeonPositionX, rockLayer + 100)
  // (remix 分支除外,本仓不支持),不缺席(见下方 sx<0 分支)。
  let sx = -1, sy = -1;
  {
    let band = 0.25, fails = 0, giveups = 0;
    for (;;) {
      let yTop = Math.floor(gs.rockLevel);
      const yBot = h - 600;
      if (yTop > yBot - 1) yTop = yBot - 1;
      const y = rng.int(yTop, yBot - 1);
      const x = Math.floor(((rng.next() * band + 0.1) * -gs.dungeonSide + 0.5) * w);
      if (st.inBounds(x, y)) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === JUNGLE_GRASS) { sx = x; sy = y; break; }
      }
      if (fails++ > 1000000) {
        if (band === 0.35 && ++giveups > 10) break;
        band = Math.min(0.35, band + 0.05);
        fails = 0;
      }
    }
  }
  // ★T7(cs:15992-16001):种子点失败时原版无条件强制补建——锚点
  //   (maxTilesX - generatingDungeonPositionX, rockLayer + 100)。此前直接
  //   return,异常种子/丛林草缺失时神庙整体缺席(祭坛+神庙箱+木刺全失)。
  if (sx < 0) {
    sx = st.w - gs.generatingDungeonPositionX;
    sy = Math.floor(gs.rockLevel) + 100;
  }
  tmMark('seed');
  // ---- 房间链(L17185-17231):重投至与全部旧房不相交;overlap 每次相交测试 1% 递增 ----
  let roomCount = rng.int(Math.max(2, Math.floor(10 * s)), Math.floor(16 * s) - 1);
  const rooms: Room[] = [];
  // ★cs:33596-33599 `int num3 = 1; if (genRand.Next(2) == 0) num3 = -1;`——
  //   Next(2)==0（sample<0.5）取 **-1**。曾写反（<0.5→+1）→ 房间链行进方向整体
  //   镜像（本种子神庙左移 58 格、房间集合全错 → #46 自债 typ28k/act15k/wal19k）
  let dir: 1 | -1 = rng.nextInt(2) === 0 ? -1 : 1;   // num2
  const startDir = dir;                   // num3
  let runLen = rng.int(1, 2);             // num8:行程阈值,每次换向后 +1
  let runStep = 0;                        // num9
  let depth = 0;                          // num13:深度组号（1457 roomDepths,每次换向 +1）
  let cx = sx, cy = sy;                   // num6/num7:上一间中心
  const depths: number[] = [];            // array2（1457 cs:33789 `array2[i] = num13`）
  for (let n = 0; n < roomCount; n++) {
    // ★cs:33636 `int num19 = -10;` 声明在 for-i **体内**——每房重置;曾跨房累积,
    //  房距越滚越宽+掷骰漂移(F2 代理附带发现)
    let overlap = -10;                    // num13
    runStep++;
    const last = n === roomCount - 1;
    let rect: Room = { x: cx, y: cy, w: 0, h: 0 };
    let newDir = dir;
    let rx = cx, ry = cy;
    let ok = false;
    for (let t = 0; t < 5000 && !ok; t++) {
      let rw = rng.int(25, 49);
      let rh = Math.min(rng.int(20, 34), rw);
      let baseY = cy;
      // ★T4(cs:33648-33659):UnderworldLayer 截断——num16+70 >= UnderworldLayer-10
      //   (本仓 UnderworldLayer = h-200,Main.cs:2863)命中时 num2=i+1(cs:33651)
      //   提前终结房间链并换大房间尺寸;cs:33677-33680 if(flag2) break 跳过相交
      //   重投。此前缺失,房间链可一路沉入地狱层。
      const uwCut = baseY + 70 >= (st.h - 200) - 10;
      if (last || uwCut) {
        const w0 = rng.int(55, 64), h0 = rng.int(45, 49);
        rw = Math.floor(w0 * 1.6);
        rh = Math.floor(Math.min(h0, w0) * 1.35);
        baseY += rng.int(5, 9);
        if (uwCut) roomCount = n + 1;   // num2 = i + 1(cs:33651)
      }
      if (runStep > runLen) {
        // 换向下沉
        ry = baseY + rng.int(rh + 1, rh + 2) + overlap;
        rx = cx + rng.int(-5, 5);
        newDir = (-dir) as 1 | -1;
      } else {
        rx = cx + (rng.int(rw + 1, rw + 2) + overlap) * dir;
        ry = baseY + rng.int(-5, 5);
      }
      rect = { x: rx - Math.floor(rw / 2), y: ry - Math.floor(rh / 2), w: rw, h: rh };
      ok = true;
      // cs:33677-33680:if (flag2) break——地狱截断房直接采纳,跳过与旧房的相交重投
      if (uwCut) break;
      for (const o of rooms) {
        if (inter(rect, o)) ok = false;
        if (rng.int(0, 99) === 0) overlap++;
      }
    }
    rooms.push(rect);
    depths.push(depth);   // ★1457：深度组号在换向判定【前】记录（cs:33789-33791）
    if (runStep > runLen) { runLen++; runStep = 1; depth++; }
    dir = newDir as 1 | -1;
    cx = rx; cy = ry;
  }
  // (原版无 rooms.length<3 闸——曾自制;T4 地狱截断后深种子世界可能截到 1-2 房,
  //  该闸会把整座神庙连同祭坛一起吞掉=花后进度断链,已删。下游仅相对下标,安全)
  tmMark('rooms');
  {
    const f = (globalThis as { __swTmRooms?: (r: Room[], sx: number, sy: number) => void }).__swTmRooms;
    if (f) f(rooms.map((r) => ({ ...r })), sx, sy);
  }
  // ---- ★1457 砖线重做（cs:33864 调用 → makeTemple_GenerateBricks cs:34592）----
  // 1456 的「全房对四角连线」退役：房间按深度组（roomDepths,换向次数）并界 →
  // DungeonBounds.Inflate(10) → 组界内 ClearEverything+226 全填 → 两两深度组四角
  // StrictAngles L 形线（500 步守卫,超限回退直线）。★零 genRand——纯几何。
  makeTempleGenerateBricks(st, rooms, depths);
  // ---- 房间实心 + 双遍游走挖腔(L17280-17381)----
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) setBrick(st, x, y);
    }
    const l0 = r.x + rng.int(3, 7), r0 = r.x + r.w - rng.int(3, 7);
    const t0 = r.y + rng.int(3, 7), b0 = r.y + r.h - rng.int(3, 7);
    let l = l0, rr = r0, t = t0, b = b0;
    const midX = Math.floor((l0 + r0) / 2), midY = Math.floor((t0 + b0) / 2);
    const carveCell = (x: number, y: number) => {
      if (!st.inBounds(x, y)) return;
      const i = st.idx(x, y);
      // ★cs:33852-33853 挖腔=active(false)+wall=87——type 保留为幽灵（原版直写
      //   失活从不清 type；清 0 会造 ~12k RAW typ 差）。挖腔前刚被 226 实心填充
      //   覆写，故此处幽灵恒 226；pather 走廊穿神庙外原石时幽灵=原石型
      st.flags[i] = 0; st.wall[i] = 87;
    };
    // 正向(列优先)
    for (let x = l0; x < r0; x++) {
      for (let y = t0; y < b0; y++) {
        if (rng.int(0, 19) === 0) t += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) b += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) l += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) rr += rng.int(-1, 1);
        if (l < l0) l = l0;
        if (rr > r0) rr = r0;
        if (t < t0) t = t0;
        if (b > b0) b = b0;
        if (l > midX) l = midX;
        if (rr < midX) rr = midX;
        if (t > midY) t = midY;
        if (b < midY) b = midY;
        if (x >= l && x < rr && y >= t && y <= b) carveCell(x, y);
      }
    }
    // 反向(行优先)
    // ★cs:33800-33805 num34..num37(l/rr/t/b)在正向遍历前**只声明一次**——反向遍
    //   (cs:33865 起)从正向的终态游走值续走,无任何重置。曾 `l=l0;rr=r0;t=t0;b=b0`
    //   重置回初始边界 → 反向挖腔区域系统性偏移(挖宽/挖深几格)——神庙壳 226>0×803
    //   结构债的根因(房间/连线/掷流全对但挖腔几何偏)。GGG 批 2026-08-18。
    for (let y = b0; y > t0; y--) {
      for (let x = r0; x > l0; x--) {
        if (rng.int(0, 19) === 0) t += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) b += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) l += rng.int(-1, 1);
        if (rng.int(0, 19) === 0) rr += rng.int(-1, 1);
        if (l < l0) l = l0;
        if (rr > r0) rr = r0;
        if (t < t0) t = t0;
        if (b > b0) b = b0;
        if (l > midX) l = midX;
        if (rr < midX) rr = midX;
        if (t > midY) t = midY;
        if (b < midY) b = midY;
        if (x >= l && x < rr && y >= t && y <= b) carveCell(x, y);
      }
    }
  }
  tmMark('carve');
  // ---- templePather 通道(L17392-17458):从种子游走穿各房,方块清空+墙 87 ----
  const pather = (px: number, py: number, destX: number, destY: number): [number, number] => {
    { const f = (globalThis as { __swTmPath?: (s: string) => void }).__swTmPath; if (f) f(`${px},${py}->${destX},${destY}`); }
    let x = px, y = py;
    let steps = rng.int(5, 19);
    const rad = rng.int(2, 4);
    while (steps > 0 && (x !== destX || y !== destY)) {
      steps--;
      if (x > destX) x--;
      if (x < destX) x++;
      if (y > destY) y--;
      if (y < destY) y++;
      for (let ix = x - rad; ix < x + rad; ix++) {
        for (let iy = y - rad; iy < y + rad; iy++) {
          if (!st.inBounds(ix, iy)) continue;
          const i = st.idx(ix, iy);
          st.flags[i] = 0; st.wall[i] = 87;   // cs:33541-33542 active(false)+wall=87，幽灵 type 保留
        }
      }
    }
    return [x, y];
  };
  let tpx = sx, tpy = sy;
  for (let n = 0; n < rooms.length; n++) {
    const r = rooms[n];
    const inner: Room = { x: r.x + 8, y: r.y + 8, w: Math.max(1, r.w - 16), h: Math.max(1, r.h - 16) };
    for (;;) {
      // ★cs:33944-33951：基础随机点两掷**无条件先掷**，末房再用中心±10 两掷覆写
      //   （4 掷/迭代）。曾只掷覆写 2 掷 → 每末房迭代 -2 掷（本种子 -10）→ 木刺段
      //   流位漂移（act 差 ~1k）
      let destX = rng.int(inner.x, inner.x + inner.w - 1);
      let destY = rng.int(inner.y, inner.y + inner.h - 1);
      if (n === rooms.length - 1) {
        destX = inner.x + Math.floor(inner.w / 2) + rng.int(-10, 9);
        destY = inner.y + Math.floor(inner.h / 2) + rng.int(-10, 9);
      }
      [tpx, tpy] = pather(tpx, tpy, destX, destY);
      if (tpx === destX && tpy === destY) break;
    }
    // 通向下一间的附加通道(2/3 概率近旁绕行,1/3 中点)
    if (n < rooms.length - 1) {
      const a = rooms[n], b2 = rooms[n + 1];
      let tx: number, ty: number;
      if (rng.int(0, 2) !== 0) {
        if (b2.y >= a.y + a.h) {
          // ★cs:33966 `if (num3 > 0)`——num3 是房间链**终态**方向（每房尾 num3=num14
          //   滚动更新），非 startDir。曾用 startDir → 额外通道目标偏 → pather 重试
          //   次数差 → 掷流后移（-26 掷、木刺 232 摆位漂移）
          tx = b2.x + (n === 0
            ? (dir > 0 ? Math.floor(b2.w * 0.8) : Math.floor(b2.w * 0.2))
            : (b2.x < a.x ? Math.floor(b2.w * 0.2) : Math.floor(b2.w * 0.8)));
          ty = b2.y;
        } else {
          tx = Math.floor((a.x + Math.floor(a.w / 2) + b2.x + Math.floor(b2.w / 2)) / 2);
          ty = Math.floor(b2.y + b2.h * 0.8);
        }
      } else {
        tx = Math.floor((a.x + Math.floor(a.w / 2) + b2.x + Math.floor(b2.w / 2)) / 2);
        ty = Math.floor((a.y + Math.floor(a.h / 2) + b2.y + Math.floor(b2.h / 2)) / 2);
      }
      for (;;) {
        const destX = rng.int(tx - 6, tx + 6);
        const destY = rng.int(ty - 6, ty + 6);
        [tpx, tpy] = pather(tpx, tpy, destX, destY);
        if (tpx === destX && tpy === destY) break;
      }
    }
  }
  tmMark('pather');
  // ---- 外壳范围 + outerTempled 四遍扫描(L17461-17499)----
  let bx0 = w - 20, bx1 = 20, by0 = h - 20, by1 = 20;
  for (const r of rooms) {
    if (r.x < bx0) bx0 = r.x;
    if (r.x + r.w > bx1) bx1 = r.x + r.w;
    if (r.y < by0) by0 = r.y;
    if (r.y + r.h > by1) by1 = r.y + r.h;
  }
  const ox0 = bx0 - 10, ox1 = bx1 + 10, oy0 = by0 - 10, oy1 = by1 + 10;
  const outerTempled = (x: number, y: number) => {
    if (!st.inBounds(x, y)) return;
    const i0 = st.idx(x, y);
    if ((st.flags[i0] && st.type[i0] === BRICK) || st.wall[i0] === 87) return;
    for (let ix = x - 6; ix <= x + 6; ix++) {
      for (let iy = y - 6; iy <= y + 6; iy++) {
        if (!st.inBounds(ix, iy)) continue;
        const j = st.idx(ix, iy);
        if (!st.flags[j] && st.wall[j] === 87) { setBrick(st, x, y); return; }
      }
    }
  };
  for (let x = ox0; x < ox1; x++) for (let y = oy0; y < oy1; y++) outerTempled(x, y);
  // ★T1(cs:34064-34073):第二遍 y 为完整区间 num58..num59——曾误写 floor(oy1/2)
  //   作上界,该遍下半区几乎空转,封壳出现单侧缺口
  for (let x = ox1; x >= ox0; x--) for (let y = oy0; y < oy1; y++) outerTempled(x, y);
  for (let y = oy0; y < oy1; y++) for (let x = ox0; x < ox1; x++) outerTempled(x, y);
  for (let y = oy1; y >= oy0; y--) for (let x = ox0; x < ox1; x++) outerTempled(x, y);
  tmMark('outer');
  // ---- 入口隧道(L17500-17527):固定高度、固定间隔下沉,穿出神庙即停 ----
  const edir = -startDir;
  let ex = sx + 0.0, ey = sy + 0.0;
  const tunH = rng.int(2, 4);
  const dropEvery = rng.int(9, 13);
  let tick = 0;
  let tunDeep = sy;   // num74(cs:34100):入口隧道挖砖最深行——门位扫描上界
  for (;;) {
    tick++;
    if (tick >= dropEvery) { tick = 0; ey--; }
    ex += edir;
    const xi = Math.floor(ex);
    if (xi < 1 || xi >= st.w - 1) break;
    let inside = false;
    for (let y = Math.floor(ey) - tunH; y < ey + tunH; y++) {
      if (!st.inBounds(xi, y)) continue;
      const i = st.idx(xi, y);
      if (st.wall[i] === 87 || (st.flags[i] && st.type[i] === BRICK)) inside = true;
      if (st.flags[i] && st.type[i] === BRICK) {
        if (y > tunDeep) tunDeep = y;   // ★T3(cs:34131-34133):记录最深挖砖行
        st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 87;
      }
    }
    if (!inside) break;
  }
  tunDeep += 2;   // num74 += 2(cs:34136)
  // ---- 门框(L17528-17578):柱/洞/门 tile 10 style 11 ----
  const i1 = sx;
  let jy = sy;
  if (!st.inBounds(i1, jy)) return;
  // ★T3(cs:34139-34149):门位向下扫实心,上界=隧道挖砖最深行 num74;到顶仍空则
  //   ClearEverything + 强制铺 226 兜底(cs:34145-34148)。此前用"jy < h-2"作
  //   无关上界且无兜底——门框可能悬空或扫描跑穿神庙底。
  while (!st.flags[st.idx(i1, jy)]) {
    jy++;
    if (jy >= tunDeep) {
      jy = tunDeep;
      const i = st.idx(i1, jy);
      st.type[i] = BRICK; st.flags[i] = 1; st.wall[i] = 0;
      st.slope[i] = 0; st.half[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0;
      break;
    }
  }
  jy -= 4;   // num81 -= 4（原 j1）
  if (jy < 2) return;
  let yUp = jy;
  while (yUp > 1 && ((st.flags[st.idx(i1, yUp)] && st.type[st.idx(i1, yUp)] === BRICK) || st.wall[st.idx(i1, yUp)] === 87)) yUp--;
  const yFrom = yUp + 2;
  for (let x = i1 - 1; x <= i1 + 1; x++) {
    for (let y = yFrom; y <= jy; y++) setBrick(st, x, y);
  }
  for (let x = i1 - 4; x <= i1 + 4; x++) {
    for (let y = jy - 1; y < jy + 3; y++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      st.flags[i] = 0; st.wall[i] = 87;   // cs:34171-34173 active(false)+wall=87，type 保留
    }
  }
  for (let x = i1 - 1; x <= i1 + 1; x++) {
    for (let y = jy - 5; y <= jy + 8; y++) setBrick(st, x, y);
  }
  for (let x = i1 - 3; x <= i1 + 3; x++) {
    for (let y = jy - 2; y < jy + 3; y++) {
      if (!st.inBounds(x, y)) continue;
      if (y >= jy || x < sx - 1 || x > sx + 1) {
        const i = st.idx(x, y);
        st.flags[i] = 0; st.wall[i] = 87;   // cs:34197-34199 active(false)+wall=87，type 保留
      }
    }
  }
  // 原版 makeTemple 尾部（1456 WorldGen.cs:34176）：PlaceTile(i1, num81=jy, 10, style 11)。
  // PlaceTile case 10（cs:59867-59906）双支：上支 j-1/j-2 净空+j-3 实心 → PlaceDoor
  // (i, j-1)；否则下支 j+1/j+2 净空+j+3 实心 → PlaceDoor(i, j+1)（门占 j'..j'+2 相对
  // j±1）。此处 jy=地板-4：下支门顶=jy、门底=jy+2，站地板 jy+3。
  // PlaceDoor（cs:31938-31960）：门框（i,j'-2）实心门 + SolidTile(i,j'+2)，过门后
  // 三格逐格 frameX=54*(style/36)+Next(3)*18——**每格 1 掷共 3 掷**（门贴图三变体）。
  // ★曾 placeDoorClosed 固定 variant=0 零掷 → 祭坛兜底流位 +3 偏（兜底锚 3505→3504
  // 整列左移）+ 木刺段流错位——GGG 批 2026-08-18（226>0 结构债之外的掷流残差根因）。
  {
    const actI = (x: number, y: number): boolean => st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
    const solI = (x: number, y: number): boolean => {
      if (!st.inBounds(x, y) || !st.flags[st.idx(x, y)]) return false;
      return !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;
    };
    let dj = -1;   // PlaceDoor 中行 j'
    if (!actI(i1, jy - 1) && !actI(i1, jy - 2) && actI(i1, jy - 3) && solI(i1, jy - 3)) dj = jy - 1;
    else if (!actI(i1, jy + 1) && !actI(i1, jy + 2) && actI(i1, jy + 3) && solI(i1, jy + 3)) dj = jy + 1;
    if (dj >= 0 && actI(i1, dj - 2) && solI(i1, dj - 2) && solidTileST(st, i1, dj + 2)) {
      const DOOR_TILE = TILE_BY_KEY['door_closed']!;
      const fx0 = 54 * Math.floor(11 / 36);
      const fy0 = 54 * (11 % 36);
      for (let k = -1; k <= 1; k++) {
        st.setTileSilent(i1, dj + k, DOOR_TILE, fx0 + rng.nextInt(3) * 18, fy0 + (k + 1) * 18);
      }
    }
  }
  tmMark('door');
  // ---- templeCleaner 两遍(L17579-17588)----
  const cleaner = (x: number, y: number) => {
    if (!st.inBounds(x, y)) return;
    const nbr = (dx: number, dy: number) => {
      if (!st.inBounds(x + dx, y + dy)) return 0;
      const j = st.idx(x + dx, y + dy);
      return st.flags[j] && st.type[j] === BRICK ? 1 : 0;
    };
    const num = nbr(1, 0) + nbr(-1, 0) + nbr(0, 1) + nbr(0, -1);
    const i = st.idx(x, y);
    if (st.flags[i] && st.type[i] === BRICK) {
      if (num > 1) return;
      st.flags[i] = 0; st.wall[i] = 87;   // cs:33493-33495 active(false)+wall=87，type 保留
    } else {
      if (st.flags[i] || num !== 3) return;
      setBrick(st, x, y);
    }
  };
  for (let x = ox0; x < ox1; x++) for (let y = oy0; y < oy1; y++) cleaner(x, y);
  for (let y = oy1; y >= oy0; y--) for (let x = ox1; x >= ox0; x--) cleaner(x, y);
  // ---- 封闭格刷墙 87(L17589-17608):3×3 全是砖或墙 87 ----
  for (let x = ox0; x < ox1; x++) {
    for (let y = oy0; y < oy1; y++) {
      if (!st.inBounds(x, y)) continue;
      let all = true;
      for (let dx = -1; dx <= 1 && all; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!st.inBounds(x + dx, y + dy)) { all = false; break; }
          const j = st.idx(x + dx, y + dy);
          if (!(st.flags[j] && st.type[j] === BRICK) && st.wall[j] !== 87) { all = false; break; }
        }
      }
      if (all) st.wall[st.idx(x, y)] = 87;
    }
  }
  tmMark('cleaner');
  // ---- 祭坛 237（makeTemple 尾 cs:34241-34315 1:1）：末间中心 ±15 拒绝采样，
  //      Place3x2 锚点门（底行下三列 SolidTile2）；1000 次失败走强制兜底 ----
  // SolidTile2（cs:70178）：active+tileSolid+slope0+非半砖
  const solidTile2 = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const j = st.idx(x, y);
    if (!st.flags[j]) return false;
    const d = TILE_DEFS[st.type[j]];
    return !!d && d.solid && st.slope[j] === 0 && !st.half[j];
  };
  const lastR = rooms[rooms.length - 1];
  const acx = lastR.x + Math.floor(lastR.w / 2);
  const acy = lastR.y + Math.floor(lastR.h / 2);
  let altarX = -1, altarY = -1;
  let mainPath = false;
  for (let tries = 0; tries < 1000 && altarX < 0; tries++) {
    // ★cs:34244-34245 采样点=Place3x2 中心锚（占位 [i-1..i+1]×[j-1..j]、锚定行
    //   j+1 三列 SolidTile2）。曾把采样点当 3×2 左上角用（占位/锚均下移 1 行）+
    //   自加 wall==87 前置门——PlaceTile(237) 前导门因 tileSolid[237]=false 恒过，
    //   唯一真门=Place3x2 清空+SolidTile2 锚。错位+错门 → 1000 次全拒 → 走兜底
    //   （掷数 +1978、神庙装饰/祭坛全偏）
    const ax = acx + 15 - rng.int(0, 29);
    const ay = acy + 15 - rng.int(0, 29);
    let ok = true;
    for (let dx = -1; dx <= 1 && ok; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        if (!st.inBounds(ax + dx, ay + dy) || st.flags[st.idx(ax + dx, ay + dy)]) { ok = false; break; }
      }
      if (ok && !solidTile2(ax + dx, ay + 1)) ok = false;
    }
    if (!ok) continue;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 0; dy++) {
        st.setTileSilent(ax + dx, ay + dy, ALTAR, (dx + 1) * 18, (dy + 1) * 18);
      }
    }
    altarX = ax; altarY = ay; mainPath = true;
  }
  // ---- 兜底（cs:34261-34315 1:1）：中心 ±10 抖动 → 向下扫到首个实心 →
  //      强制铺 3 格蜥蜴砖地板 → 锚点改地板上一格、x 左移 1 → 清周围 → 强制放置
  if (altarX < 0) {
    let fx = acx + rng.int(-10, 10);
    let fy = acy + rng.int(-10, 10);
    while (st.inBounds(fx, fy) && !st.flags[st.idx(fx, fy)]) fy++;
    if (st.inBounds(fx, fy)) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!st.inBounds(fx + dx, fy)) continue;
        const j = st.idx(fx + dx, fy);
        st.type[j] = BRICK; st.flags[j] = 1;
        st.slope[j] = 0; st.half[j] = 0; st.liquid[j] = 0;
      }
      fy -= 2; fx -= 1;   // 底中锚 → 3×2 左上角
      if (st.inBounds(fx, fy)) {
        for (let dx = -1; dx <= 3; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (st.inBounds(fx + dx, fy + dy)) {
              const j = st.idx(fx + dx, fy + dy);
              st.flags[j] = 0;   // cs:34291-34293 active(false)——type 保留
            }
          }
        }
        for (let dx = 0; dx <= 2; dx++) {
          for (let dy = 0; dy <= 1; dy++) {
            st.setTileSilent(fx + dx, fy + dy, ALTAR, dx * 18, dy * 18);
          }
        }
        altarX = fx; altarY = fy;
      }
    }
  }
  // cs:34250-34251：主路径 lAltar = 采样锚 - frame/18（中心底格 fx=18/fy=18 → 3×2
  // 左上角）；兜底路径锚点本就是左上角（cs:34288-34289）。mainPath 区分两者。
  gs.lAltarX = altarX - (mainPath ? 1 : 0); gs.lAltarY = altarY - (mainPath ? 1 : 0);
  tmMark('altar');
  // ---- 尾部木刺 232 预算段（cs:34315-34483 1:1）：num111 = 房数×1.1×(1±25%)。
  //      每轮随机选一间 → 房内随机点（须墙 87 且空），Next(2) 定竖/横走线方向,
  //      沿该向找首个实心后回退一格,以落点为心 ±(3..9) 方框把【贴走线面】的实心格
  //      转 232（SolidTile 且反向邻格非实心才转;排除框内见门/祭坛）;单轮有放置
  //      才扣预算,连续 1000 轮无放置也扣预算。★T2:此前整段缺失——全仓 232 只有
  //      引用没有放置,神庙木刺为零,本段即其唯一放置源。drunkWorldGen 的三处
  //      ±2 加刺分支本仓世界类型不支持,跳过。
  {
    const SPIKE = TILE_BY_KEY['v_232_wooden_spike']!;
    const DOOR_T = TILE_BY_KEY['door_closed']!;
    let budget = rooms.length * 1.1;
    budget *= 1 + rng.int(-25, 25) * 0.01;                 // cs:34315-34316
    let fails = 0;                                         // num113
    while (budget > 0) {
      fails++;
      const room = rooms[rng.int(0, rooms.length - 1)];    // num115 = Next(num2)
      let px = rng.int(room.x, room.x + room.w - 1);       // num116
      let py = rng.int(room.y, room.y + room.h - 1);       // num117
      if (st.inBounds(px, py) && st.wall[st.idx(px, py)] === 87 && !st.flags[st.idx(px, py)]) {
        let placed = false;                                // flag6
        if (rng.int(0, 1) === 0) {
          // 竖直走线（cs:34335-34390）：排除框查门 10 **与** 祭坛 237（cs:34349-34358）
          // ★cs:34335 `int num118 = 1; if (genRand.Next(2) == 0) num118 = -1;`——
          //   Next(2)==0 取 **-1**（与房间链方向三元同款，L 批已修那处）。曾
          //   `===0 ? 1 : -1` 写反 → 走线向上找墙而非向下——木刺线整体贴错墙
          //   （226>232/232>226 全量翻转对的根因）。GGG 批 2026-08-18。
          const d = rng.int(0, 1) === 0 ? -1 : 1;          // num118
          while (st.inBounds(px, py) && !st.flags[st.idx(px, py)]) py += d;
          py -= d;
          let flip = rng.int(0, 1);                        // num119
          const rad = rng.int(3, 9);                       // num120 = Next(3,10)
          let clear = true;
          scan: for (let xx = px - rad; xx < px + rad; xx++) {
            for (let yy = py - rad; yy < py + rad; yy++) {
              if (!st.inBounds(xx, yy)) continue;
              const k = st.idx(xx, yy);
              if (st.flags[k] && (st.type[k] === DOOR_T || st.type[k] === ALTAR)) { clear = false; break scan; }
            }
          }
          if (clear) {
            for (let xx = px - rad; xx < px + rad; xx++) {
              for (let yy = py - rad; yy < py + rad; yy++) {
                if (!st.inBounds(xx, yy)) continue;
                const k = st.idx(xx, yy);
                // 反向邻格实心 = 本格被埋,不转（cs:34366）
                if (!solidTileST(st, xx, yy) || st.type[k] === SPIKE || solidTileST(st, xx, yy - d)) continue;
                st.type[k] = SPIKE;                        // 原格已实心,仅改 type
                placed = true;
                const eyy = flip === 0 ? yy - 1 : yy + 1;  // 朝走线面外伸一格(cs:34369-34379)
                if (st.inBounds(xx, eyy)) {
                  const ke = st.idx(xx, eyy);
                  st.type[ke] = SPIKE; st.flags[ke] = 1;
                }
                flip++; if (flip > 1) flip = 0;
              }
            }
          }
          if (placed) { fails = 0; budget -= 1; }
        } else {
          // 水平走线（cs:34393-34476）：排除框只查门 10,不查祭坛——原版不对称,
          // 勿"补全"（cs:34417-34423）
          const d = rng.int(0, 1) === 0 ? -1 : 1;          // num125（cs:34397 同上取反语义）
          while (st.inBounds(px, py) && !st.flags[st.idx(px, py)]) px += d;
          px -= d;
          let flip = rng.int(0, 1);                        // num126
          const rad = rng.int(3, 9);                       // num127
          let clear = true;
          scan: for (let xx = px - rad; xx < px + rad; xx++) {
            for (let yy = py - rad; yy < py + rad; yy++) {
              if (!st.inBounds(xx, yy)) continue;
              const k = st.idx(xx, yy);
              if (st.flags[k] && st.type[k] === DOOR_T) { clear = false; break scan; }
            }
          }
          if (clear) {
            for (let xx = px - rad; xx < px + rad; xx++) {
              for (let yy = py - rad; yy < py + rad; yy++) {
                if (!st.inBounds(xx, yy)) continue;
                const k = st.idx(xx, yy);
                if (!solidTileST(st, xx, yy) || st.type[k] === SPIKE || solidTileST(st, xx - d, yy)) continue;
                st.type[k] = SPIKE;
                placed = true;
                const exx = flip === 0 ? xx - 1 : xx + 1;
                if (st.inBounds(exx, yy)) {
                  const ke = st.idx(exx, yy);
                  st.type[ke] = SPIKE; st.flags[ke] = 1;
                }
                flip++; if (flip > 1) flip = 0;
              }
            }
          }
          if (placed) { fails = 0; budget -= 1; }
        }
      }
      if (fails > 1000) { fails = 0; budget -= 1; }        // cs:34480-34484
    }
  }
  tmMark('spikes');
  // ---- makeTemple 尾（cs:34487-34491）：房间 bbox 四侧各外扩 10 → GenVars ----
  // 原版在函数尾写 GenVars.tLeft/tRight/tTop/tBottom/tRooms 供**独立注册**的
  // LihzahrdTemplePart2 pass（cs:17809）消费；早退路径不写（字段保持初值 0，
  // Part2 预算 0×掷骰照掷=原版语义）。2026-08-16 拆分前 templePart2 内联于此。
  {
    let tL = Infinity, tR = -Infinity, tT = Infinity, tB = -Infinity;
    for (const r of rooms) {
      tL = Math.min(tL, r.x); tR = Math.max(tR, r.x + r.w);
      tT = Math.min(tT, r.y); tB = Math.max(tB, r.y + r.h);
    }
    gs.tLeft = Math.floor(tL) - 10;
    gs.tRight = Math.ceil(tR) + 10;
    gs.tTop = Math.floor(tT) - 10;
    gs.tBottom = Math.ceil(tB) + 10;
    gs.tRooms = rooms.length;
  }
  // 注：LihzahrdAltar 终保 pass（cs:21753-21791）原版是 TileCleanup(21327) 之后、
  // MicroBiomes(21785) 之前的独立 pass（Pots/Traps/TileCleanup 可能扰动祭坛后再
  // 重放）。2026-08-13 前并入本函数末尾（执行位≈15911），已外提为
  // runLihzahrdAltarPass 独立槽位（WorldGen.ts「蜥蜴祭坛」槽）。
}

/** LihzahrdTemplePart2 pass（cs:17809-17817 注册体 1:1）：神庙陈设五段独立槽
 *  （Moss(17573) 之后、CaveWalls(17819) 之前——WorldGen.ts「神庙陈设」槽）。
 *  ★pass 头翻转（cs:17813-17814 `tileSolid[162]=false; tileSolid[226]=true`：
 *  162 薄冰非实/226 蜥蜴砖实）；尾 cs:17816 `tileSolid[232]=false`（木刺非实心，
 *  CaveWalls 头 cs:17823 重放、BeeLarva 尾 cs:21048 还原 true）。2026-08-16 拆分前
 *  内联于 runTemplePass（执行位≈15911，比原版 Part2 注册位早约 1900 行）。 */
export function runTemplePart2Pass(st: TileStore, rng: RNG, gs: GenState, chests: ChestSink): void {
  flipGenSolid([162], false);
  flipGenSolid([226], true);
  templePart2(st, rng, gs, chests);
  flipGenSolid([232], false);
}

/** LihzahrdAltar 终保 pass（cs:21753-21791 1:1）：重放祭坛 6 格 + 正下方三格
 *  强制 226 地板（slope/halfBrick/liquid 复位）——原版注册序在 TileCleanup(21327)
 *  之后，对中途 Pots/Traps/TileCleanup 的祭坛扰动做最终回滚（顺带达成
 *  cs:21744-21746 的 232→226；TileCleanupPass ⑪ 段同效双保险）。 */
export function runLihzahrdAltarPass(st: TileStore, gs: GenState): void {
  const altarX = gs.lAltarX, altarY = gs.lAltarY;
  if (altarX < 0) return;   // 无神庙世界（Skyblock 等）跳过
  for (let dx = 0; dx <= 2; dx++) {
    for (let dy = 0; dy <= 1; dy++) {
      if (st.inBounds(altarX + dx, altarY + dy)) {
        st.setTileSilent(altarX + dx, altarY + dy, ALTAR, dx * 18, dy * 18);
      }
    }
    const bj = st.inBounds(altarX + dx, altarY + 2) ? st.idx(altarX + dx, altarY + 2) : -1;
    if (bj >= 0) {
      st.type[bj] = BRICK; st.flags[bj] = 1;
      st.slope[bj] = 0; st.half[bj] = 0; st.liquid[bj] = 0;
    }
  }
}

/** templePart2（1456 cs:34497-34685）1:1。tRooms=房间数；各段预算公式与
 *  失败推进语义逐掷对齐（陷阱段 fails>100 直接扣预算；其余段 fails>10000 break）。
 *  采样域读 GenVars（runTemplePass 尾写入的**外扩后** bbox——cs:34487-34491，
 *  T5：外扩 10 是写入侧语义；rx/by 的 -1 是 Next 上界排他换算）。 */
function templePart2(
  st: TileStore, rng: RNG, gs: GenState,
  chests: ChestSink,
): void {
  const lx = gs.tLeft, rx = gs.tRight - 1;
  const ty = gs.tTop, by = gs.tBottom - 1;
  const tRooms = gs.tRooms;

  // ---- 1. 尖刺陷阱（cs:34497-34519）：预算 = 房数×1.9×(1±15%) ----
  {
    let budget = tRooms * 1.9 * (1 + rng.int(-15, 15) * 0.01);
    let fails = 0;
    while (budget > 0) {
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        if (mayanTrap(st, rng, gs, x2, y2)) { budget -= 1; fails = 0; }
        else fails++;
      } else fails++;
      if (fails > 100) { fails = 0; budget -= 1; }   // cs:34517-34518
    }
  }
  // ★cs:34530 `Main.tileSolid[232] = false`（尖刺陷阱段后、宝箱段前）：木刺非实心,
  //   后续箱/雕像/家具/挂饰段的 SolidTile 锚定不再踩在 232 上。函数尾 cs:34701
  //   还原 true（见函数尾）——净效果为零,纯段内作用域。
  flipGenSolid([232], false);

  // ---- 2. 神庙宝箱（cs:34521-34545）：预算 = 房数×0.35×(1±15%) ----
  //  AddBuriedChest(mainItem=1293 蜥蜴能量电池, notNearOtherChests:true, style 16)
  {
    let budget = tRooms * 0.35 * (1 + rng.int(-15, 15) * 0.01);
    let fails = 0;
    while (budget > 0) {
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      // ★T6:已删除自制"祭坛±3 回避"前置门——原版 cs:34531-34538 无此门,真正排除
      //   在 AddBuriedChest 内部（cs:35992-35999,以落地行 k 为锚 5×5 查
      //   Boulders/26/237 拒）;本仓 placeBuriedChest 已带等价检查。
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        // notNearOtherChests:true(cs:34532 原版实参)
        if (placeBuriedChest(st, rng, gs, chests, x2, y2, { style: 16, loot: 'vi_1293_lihzahrd_power_cell', notNearOtherChests: true })) {
          budget -= 1;
          fails = 0;
        }
      }
      fails++;
      if (fails > 10000) break;
    }
  }

  // ---- 3. 雕像 105 style43-45（cs:34547-34583）：预算 = 房数×1.25×(1+Next(-25,36)%) ----
  {
    let budget = tRooms * 1.25 * (1 + rng.int(-25, 35) * 0.01);
    let fails = 0;
    while (budget > 0) {
      fails++;
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        let fy = y2;
        while (st.inBounds(x2, fy) && !st.flags[st.idx(x2, fy)]) {
          fy++;
          if (fy > by) break;
        }
        fy--;
        if (fy <= by) {
          const style = rng.int(43, 45);              // Next(43,46)
          placeStatueTemple(st, rng, x2, fy, style);
          if (sheetOfTP(st.type[st.idx(x2, fy)]!) === 105) budget -= 1;   // cs:34574 锚格 type 门
        }
      }
      if (fails > 10000) break;
    }
  }

  // ---- 4. 蜥蜴家具（cs:34585-34632）：预算 = 房数×1.35×(1+Next(-15,26)%) ----
  //  Next(3)（cs:34608-34630 原文配对，勿旋转）：0→工作台 18 style10（Place2x1
  //  **左锚**——曾 placeFurn 居中 fw=2 整体偏 1 格）/ 1→桌 14 style9（Place3x2 中锚）/
  //  2→椅 15 style12（Place1x2）。预算扣减门 = 放置后锚格 type==18/14/15（cs:34619+）
  {
    let budget = tRooms * 1.35 * (1 + rng.int(-15, 25) * 0.01);
    let fails = 0;
    while (budget > 0) {
      fails++;
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        let fy = y2;
        while (st.inBounds(x2, fy) && !st.flags[st.idx(x2, fy)]) {
          fy++;
          if (fy > by) break;
        }
        fy--;
        if (fy <= by) {
          const kind = rng.int(0, 2);                 // Next(3)
          const spec = kind === 0
            ? { sheet: 18, style: 10 }
            : kind === 1
              ? { sheet: 14, style: 9 }
              : { sheet: 15, style: 12 };
          placeFurnTemple(st, rng, x2, fy, spec.sheet, spec.style);
          if (sheetOfTP(st.type[st.idx(x2, fy)]!) === spec.sheet) budget -= 1;
        }
      }
      if (fails > 10000) break;
    }
  }

  // ---- 5. 墙挂饰 240 style88（cs:34634-34682）：数量 = 1 + (w>4200) + (w>6400?Next(2):0) ----
  //  InWorld(±70,5) 门 + PlaceTile(240,88)→Place3x3Wall（**3×3 以采样点为中心**
  //  (x-1..x+1)×(y-1..y+1)，全空+wall≠0 才放——曾写成 (x..x+2,y..y+2) 左上角整体
  //  偏 (1,1) 且漏 wall≠0 门）；扣减门 = PlaceTile 返回值（锚格 active）
  {
    let count = 1;
    if (st.w > 4200) count++;
    if (st.w > 6400) count += rng.int(0, 1);
    let fails = 0;
    while (count > 0) {
      fails++;
      const x2 = rng.int(lx, rx);
      const y2 = rng.int(ty, by);
      if (st.inBounds(x2, y2) && st.wall[st.idx(x2, y2)] === 87 && !st.flags[st.idx(x2, y2)]) {
        // ±70 内已有 240，或 ±4 内有蜥蜴砖 226 → 拒绝（cs:34654-34675）
        let flag = false;
        for (let dx = -70; dx <= 70 && !flag; dx++) {
          for (let dy = -70; dy <= 70; dy++) {
            const xx = x2 + dx, yy = y2 + dy;
            if (!inWorld5TP(st, xx, yy)) continue;    // InWorld(num21,num22,5)
            const k = st.idx(xx, yy);
            if (!st.flags[k]) continue;
            if (sheetOfTP(st.type[k]!) === 240) { flag = true; break; }
            if (dx >= -4 && dx <= 4 && dy >= -4 && dy <= 4 && sheetOfTP(st.type[k]!) === 226) { flag = true; break; }
          }
        }
        if (!flag && placeWallHangingTemple(st, rng, x2, y2, 88)) count--;
      }
      if (fails > 10000) break;
    }
  }
  // ★cs:34701 `Main.tileSolid[232] = true`：函数尾还原（对应段内 cs:34530 翻转）
  flipGenSolid([232], true);
}

/** PlaceTile(105, style)（神庙雕像，cs:60090）→ Place2xX（cs:39705）+ SquareTileFrame×2。
 *  锚 = 底行左列 (x, y)；2×3 占位 (x..x+1)×(y-2..y)；门 = 六格全 inactive +
 *  SolidTile2(x,y+1) && SolidTile2(x+1,y+1)（★曾缺地面门——斜坡/半砖砖上 JS 放
 *  vanilla 拒）；帧 55 列换行（cs:39716-39720）。前奏 Clear 只清锚格（其余五格
 *  ghost slope 按 vanilla **不清**——Place2xX 只写 active/frameY/frameX/type）。 */
function placeStatueTemple(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  const STATUE = TILE_BY_KEY['v_105_statue'];
  if (STATUE === undefined) return false;
  let type = STATUE;
  let sty = style;
  let num = sty * 36;
  let num2 = 0;
  if (sty === 34) { type = TILE_BY_KEY['v_349_statue2'] ?? type; sty = 0; num = 0; }   // cs:39710
  const row = Math.floor(sty / 55);
  num -= 1980 * row;         // 55*36 列换行
  num2 += 54 * row;
  for (let i = y - 2; i <= y; i++) {
    for (const xx of [x, x + 1]) {
      if (st.inBounds(xx, i) && st.flags[st.idx(xx, i)]) return false;   // 六格须全空
    }
  }
  if (!solidTile2TP(st, x, y + 1) || !solidTile2TP(st, x + 1, y + 1)) return false;
  // PlaceTile 前奏 Clear（锚格 inactive）：type/帧/坡/半砖全清（cs:59499-59501）
  const ai = st.idx(x, y);
  if (st.inBounds(x, y) && !st.flags[ai]) {
    st.type[ai] = 0; st.frameX[ai] = 0; st.frameY[ai] = 0; st.slope[ai] = 0; st.half[ai] = 0;
  }
  for (let j = 0; j < 3; j++) {
    const fy = num2 + j * 18;
    st.setTileSilent(x, y - 2 + j, type, num, fy);
    st.setTileSilent(x + 1, y - 2 + j, type, num + 18, fy);
  }
  genSquareTileFrame(st, rng, x, y);   // case 105 体尾
  if (st.flags[st.idx(x, y)]) genSquareTileFrame(st, rng, x, y);   // PlaceTile 尾二连
  return true;
}

/** 家具三族（cs:34608-34630）：18→Place2x1（cs:47371，**左锚**）/ 14→Place3x2
 *  （cs:52097，中锚 (x-1..x+1)×(y-1..y)）/ 15→Place1x2（cs:46665，(x,y-1..y)，
 *  帧行 stride=40）。门/帧全按原版；PlaceTile 前奏 Clear 锚格 + 尾 SquareTileFrame×2 */
function placeFurnTemple(st: TileStore, rng: RNG, x: number, y: number, sheet: number, style: number): boolean {
  const tileId = sheetToIdTP(sheet);
  if (tileId < 0) return false;
  const clearAnchor = (cx: number, cy: number) => {
    if (!st.inBounds(cx, cy)) return;
    const i = st.idx(cx, cy);
    if (!st.flags[i]) { st.type[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0; st.slope[i] = 0; st.half[i] = 0; }
  };
  if (sheet === 18) {
    // Place2x1：门 = 两下格 SolidTile2 + 两本格空（cs:47388）
    if (!st.inBounds(x + 1, y)) return false;
    if (!solidTile2TP(st, x, y + 1) || !solidTile2TP(st, x + 1, y + 1)) return false;
    if (st.flags[st.idx(x, y)] || st.flags[st.idx(x + 1, y)]) return false;
    clearAnchor(x, y);
    const fx = 36 * style;
    st.setTileSilent(x, y, tileId, fx, 0);
    st.setTileSilent(x + 1, y, tileId, fx + 18, 0);
  } else if (sheet === 14) {
    // Place3x2：3×2 全空 + 三列 SolidTile2（cs:52115-52151）
    if (x < 5 || x > st.w - 5 || y < 5 || y > st.h - 5) return false;
    for (let i = x - 1; i <= x + 1; i++) {
      for (let j = y - 1; j <= y; j++) {
        if (st.flags[st.idx(i, j)]) return false;
      }
      if (!solidTile2TP(st, i, y + 1)) return false;
    }
    clearAnchor(x, y);
    const bx = 54 * style;
    for (let i = 0; i < 3; i++) {
      st.setTileSilent(x - 1 + i, y - 1, tileId, bx + i * 18, 0);
      st.setTileSilent(x - 1 + i, y, tileId, bx + i * 18, 18);
    }
  } else {
    // Place1x2（15）：门 = SolidTile2(x,y+1) && (x,y-1) 空（cs:46685）
    if (!st.inBounds(x, y - 1)) return false;
    if (!solidTile2TP(st, x, y + 1) || st.flags[st.idx(x, y - 1)]) return false;
    clearAnchor(x, y);
    const by = style * 40;
    st.setTileSilent(x, y - 1, tileId, 0, by);
    st.setTileSilent(x, y, tileId, 0, by + 18);
  }
  genSquareTileFrame(st, rng, x, y);
  if (st.flags[st.idx(x, y)]) genSquareTileFrame(st, rng, x, y);
  return true;
}

function sheetToIdTP(sheet: number): number {
  for (let i = 0; i < TILE_DEFS.length; i++) {
    if (SHEET_OF_TP[i] === sheet) return i;
  }
  return -1;
}

/** PlaceTile(240, style)（神庙墙挂饰，cs:59962）→ Place3x3Wall（cs:44281）：
 *  3×3 以采样点为中心 (x-1..x+1)×(y-1..y+1)；门 = 九格全 inactive 且 wall≠0；
 *  帧 = (style%36)*54 + 18*col / floor(style/36)*54 + 18*row；体尾无 SquareTileFrame
 *  （PlaceTile 尾一次）。返回 = PlaceTile 结果（锚格 active）。 */
function placeWallHangingTemple(st: TileStore, rng: RNG, x: number, y: number, style: number): boolean {
  const HANGING = TILE_BY_KEY['v_240_wall_hangings_3x3'];
  if (HANGING === undefined) return false;
  const bx0 = x - 1, by0 = y - 1;
  for (let i = bx0; i < bx0 + 3; i++) {
    for (let j = by0; j < by0 + 3; j++) {
      if (!st.inBounds(i, j)) return false;
      const k = st.idx(i, j);
      if (st.flags[k] || st.wall[k] === 0) return false;
    }
  }
  // PlaceTile 前奏 Clear 锚格（cs:59499-59501）
  clearAnchorTP(st, x, y);
  let sty = style;
  let num3 = 0;
  while (sty > 35) { num3++; sty -= 36; }
  const bx = sty * 54;
  const by = num3 * 54;
  for (let i = bx0; i < bx0 + 3; i++) {
    for (let j = by0; j < by0 + 3; j++) {
      const k = st.idx(i, j);
      st.type[k] = HANGING; st.flags[k] = 1;
      st.frameX[k] = bx + 18 * (i - bx0);
      st.frameY[k] = by + 18 * (j - by0);
    }
  }
  if (st.flags[st.idx(x, y)]) genSquareTileFrame(st, rng, x, y);
  return st.flags[st.idx(x, y)] === 1;
}

function clearAnchorTP(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) { st.type[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0; st.slope[i] = 0; st.half[i] = 0; }
}

/** PlaceTile(135, style)（mayanTrap 压板，cs:60154）→ Place1x1（cs:45194）+
 *  SquareTileFrame×2。门 = InWorld(x,y,2) && !active && SolidTile2(x,y+1) &&
 *  !Boulders[type(y+1)]；写 active/type/frameY=style*18（frameX 前奏 Clear 归 0）。 */
function placePlateTP(st: TileStore, rng: RNG, x: number, y: number, style: number): void {
  const PLATE = TILE_BY_KEY['v_135_pressure_plates']!;
  if (x < 2 || y < 2 || x > st.w - 3 || y > st.h - 3) return;
  if (st.flags[st.idx(x, y)]) return;
  if (!solidTile2TP(st, x, y + 1)) return;
  if (BOULDERS_TP.has(sheetOfTP(st.type[st.idx(x, y + 1)]!))) return;
  clearAnchorTP(st, x, y);
  st.setTileSilent(x, y, PLATE, 0, style * 18);
  genSquareTileFrame(st, rng, x, y);
  if (st.flags[st.idx(x, y)]) genSquareTileFrame(st, rng, x, y);
}

/** PlaceTile(137, style)（cs:59774 else-if）：active+type+frameY=18*style。
 *  ★forced 前奏：目标格 active 则**无 Clear**——frameX/slope/half 保留旧值
 *  （纵向天花板/横向上延陷阱正是踩在活砖上）；inactive 则 Clear 后 frameX=0。 */
function placeTrap137TP(st: TileStore, x: number, y: number, style: number): void {
  if (!st.inBounds(x, y)) return;
  const TRAP = TILE_BY_KEY['v_137_traps']!;
  const i = st.idx(x, y);
  if (!st.flags[i]) {
    st.type[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0; st.slope[i] = 0; st.half[i] = 0; st.paint[i] = 0;
  }
  st.type[i] = TRAP; st.flags[i] = 1;
  st.frameY[i] = style * 18;
}

/** 玛雅陷阱（cs:8314-8644）1:1：落点下扫实心（SolidOrSlopedTile）→ 九格净空门 →
 *  横向（压板居中+两端墙飞镖+上延叠陷+KillTile 锚）或纵向（天花板火焰陷+两侧
 *  追加+无 KillTile）→ AddWireFromPointToPoint 三色导线。 */
function mayanTrap(st: TileStore, rng: RNG, gs: GenState, x2: number, y2: number): boolean {
  const wireBit = (n: number) => n === 0 ? TileStore.WIRE_RED : n === 1 ? TileStore.WIRE_BLUE : TileStore.WIRE_GREEN;
  const nactive = (x: number, y: number) => {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    return st.flags[i] !== 0 && ((st.wire[i] >>> 5) & 1) === 0;
  };
  const sheetAt = (x: number, y: number) => (st.inBounds(x, y) ? sheetOfTP(st.type[st.idx(x, y)]!) : -1);

  // cs:8318：num2 = 1；Next(3)==0 → 0（横向）
  let num2 = 1;
  if (rng.nextInt(3) === 0) num2 = 0;
  // cs:8325-8333：下扫 SolidOrSlopedTile，地狱界 num3 >= maxTilesY-300 拒
  let num3 = y2;
  while (!solidOrSlopedTP(st, x2, num3)) {
    num3++;
    if (num3 >= st.h - 300) return false;
  }
  // cs:8335：落点是 232 木刺 / 10 门 → 拒（★曾误查 226 蜥蜴砖——落点砖是合法地面）
  const landSheet = sheetAt(x2, num3);
  if (landSheet === 232 || landSheet === 10) return false;
  num3--;
  // cs:8342：落点上一格岩浆拒
  {
    const i = st.idx(x2, num3);
    if (st.liquid[i] > 0 && st.liquidType[i] === 2) return false;
  }
  // cs:8346-8347：num2==-1 分支死代码（num2∈{0,1}），两掷不可达——不镜像
  // cs:8348-8350：九格 nactive 净空门
  if (nactive(x2, num3) || nactive(x2 - 1, num3) || nactive(x2 + 1, num3) || nactive(x2, num3 - 1)
    || nactive(x2 - 1, num3 - 1) || nactive(x2 + 1, num3 - 1) || nactive(x2, num3 - 2)
    || nactive(x2 - 1, num3 - 2) || nactive(x2 + 1, num3 - 2)) return false;
  // cs:8352-8360：落点下一格 10/48/232 拒（原版三条独立 if）
  const belowSheet = sheetAt(x2, num3 + 1);
  if (belowSheet === 10) return false;
  if (belowSheet === 48) return false;
  if (belowSheet === 232) return false;

  if (num2 === 0) {
    // ---- 横向（cs:8363-8558）----
    let num11 = x2;
    let num12 = num3 - rng.nextInt(3);                     // cs:8367
    while (inWorld5TP(st, num11, num12) && !solidOrSlopedTP(st, num11, num12)) num11--;
    const num13 = num11;
    for (num11 = x2; inWorld5TP(st, num11, num12) && !solidOrSlopedTP(st, num11, num12); num11++) { /* walk */ }
    const num14 = num11;
    const num15 = x2 - num13;
    const num16 = num14 - x2;
    let flag = num15 > 5 && num15 < 50;                    // cs:8383
    let flag2 = num16 > 5 && num16 < 50;
    if (flag && !solidOrSlopedTP(st, num13, num12 + 1)) flag = false;
    if (flag2 && !solidOrSlopedTP(st, num14, num12 + 1)) flag2 = false;
    // cs:8397-8412：锚侧 10/48 拒（本体格与下一格）
    if (flag && (sheetAt(num13, num12) === 10 || sheetAt(num13, num12) === 48
      || sheetAt(num13, num12 + 1) === 10 || sheetAt(num13, num12 + 1) === 48)) flag = false;
    if (flag2 && (sheetAt(num14, num12) === 10 || sheetAt(num14, num12) === 48
      || sheetAt(num14, num12 + 1) === 10 || sheetAt(num14, num12 + 1) === 48)) flag2 = false;
    let num18 = 0;
    if (flag && flag2) {
      num18 = 1; num11 = num13;
      if (rng.nextInt(2) === 0) { num11 = num14; num18 = -1; }
    } else if (flag2) {
      num11 = num14; num18 = -1;
    } else {
      if (!flag) return false;
      num11 = num13; num18 = 1;
    }
    // cs:8433-8454：锚格墙/类型门（190/135/137/232/237/10）
    if (st.wall[st.idx(num11, num12)] !== 87) return false;
    const aSheet = sheetAt(num11, num12);
    if (aSheet === 190 || aSheet === 135 || aSheet === 137 || aSheet === 232 || aSheet === 237 || aSheet === 10) return false;
    // cs:8456-8459：地面非 AllowBottomSlope → SlopeTile 压平（cs:81507）
    if (!solidAllowBottomTP(st, x2, num3 + 1)) slopeTileTP(st, x2, num3 + 1);
    if (!canGenPlateTP(st, x2, num3)) return false;        // cs:8460
    placePlateTP(st, rng, x2, num3, 6);                    // cs:8462 PlaceTile(135,style6)
    killTileWhole(st, num11, num12, rng);                  // cs:8463 KillTile(锚)
    // cs:8464-8474：num19 = Next(3) 恒掷，再被既有线色覆写（★曾"无线才掷"漏掷）
    let num19 = rng.nextInt(3);
    {
      const i = st.idx(x2, num3);
      if (st.wire[i] & TileStore.WIRE_RED) num19 = 0;
      if (st.wire[i] & TileStore.WIRE_BLUE) num19 = 1;
      if (st.wire[i] & TileStore.WIRE_GREEN) num19 = 2;
    }
    const num20 = Math.abs(num11 - x2);
    let style2 = 1;                                        // cs:8475
    if (num20 < 10 && rng.nextInt(3) !== 0) style2 = 2;
    placeTrap137TP(st, num11, num12, style2);              // cs:8481
    if (num18 === 1) st.frameX[st.idx(num11, num12)] += 18;
    // cs:8487-8510：向上叠陷（Next(5) 步数；三重门 SolidTile×2+SolidOrSloped）
    let num21 = rng.nextInt(5);
    let num22 = num12;
    while (num21 > 0) {
      num21--; num22--;
      if (!solidTileTP(st, num11, num22) || !solidTileTP(st, num11 - num18, num22)
        || solidOrSlopedTP(st, num11 + num18, num22)) break;
      placeTrap137TP(st, num11, num22, style2);
      if (num18 === 1) st.frameX[st.idx(num11, num22)] += 18;
      st.wire[st.idx(num11, num22)] |= wireBit(num19);
    }
    addWireTP(st, x2, num3, num11, num12, num19);          // cs:8536
    return true;
  }
  // ---- 纵向（cs:8559-8641）----
  let num4 = x2;
  let num5 = num3;
  while (!solidOrSlopedTP(st, num4, num5)) {
    num5--;
    if (num5 < gs.worldSurface) return false;              // cs:8564（★曾误用 rockLevel）
  }
  const num6 = Math.abs(num5 - num3);
  if (num6 < 3) return false;                              // cs:8570
  let num7 = rng.nextInt(3);                               // cs:8572 恒掷
  {
    const i = st.idx(x2, num3);
    if (st.wire[i] & TileStore.WIRE_RED) num7 = 0;
    if (st.wire[i] & TileStore.WIRE_BLUE) num7 = 1;
    if (st.wire[i] & TileStore.WIRE_GREEN) num7 = 2;
  }
  let style = 3;                                           // cs:8581
  if (num6 < 16 && rng.nextInt(3) !== 0) style = 4;
  // cs:8585-8603：天花板格类型门（135/137/232/237/10）+ 墙 87
  const cSheet = sheetAt(num4, num5);
  if (cSheet === 135 || cSheet === 137 || cSheet === 232 || cSheet === 237 || cSheet === 10) return false;
  if (st.wall[st.idx(num4, num5)] !== 87) return false;
  if (!solidAllowBottomTP(st, x2, num3 + 1)) slopeTileTP(st, x2, num3 + 1);
  if (!canGenPlateTP(st, x2, num3)) return false;
  placePlateTP(st, rng, x2, num3, 6);
  placeTrap137TP(st, num4, num5, style);                   // cs:8619（无 KillTile——活砖直替）
  for (let i = 0; i < 2; i++) {                            // cs:8621-8633 两侧追加
    let num9 = num4;
    const num10 = i === 1 ? 1 : -1;
    let steps = rng.int(1, 4);                             // Next(1,5)
    while (steps > 0) {
      steps--; num9 += num10;
      if (!solidTileTP(st, num9, num5 - 1) || solidOrSlopedTP(st, num9, num5 + 1)) break;
      placeTrap137TP(st, num9, num5, style);
      st.wire[st.idx(num9, num5)] |= wireBit(num7);
    }
  }
  addWireTP(st, x2, num3, num4, num5, num7);               // cs:8640
  return true;
}

/** AddWireFromPointToPoint（cs:58081）：从 (x2,y2)=陷阱端走向 (x,y)=压板端，
 *  每迭代三布（起点/移 x 后/移 y 后），含两端点全覆盖 */
function addWireTP(st: TileStore, x: number, y: number, x2: number, y2: number, color: number): void {
  const bit = color === 0 ? TileStore.WIRE_RED : color === 1 ? TileStore.WIRE_BLUE : TileStore.WIRE_GREEN;
  while (x2 !== x || y2 !== y) {
    st.wire[st.idx(x2, y2)] |= bit;
    if (x2 > x) x2--;
    else if (x2 < x) x2++;
    st.wire[st.idx(x2, y2)] |= bit;
    if (y2 > y) y2--;
    else if (y2 < y) y2++;
    st.wire[st.idx(x2, y2)] |= bit;
  }
}
