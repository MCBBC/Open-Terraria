// DualDungeonLayoutProvider 全家族移植（批 IIII92 · 2026-08-31）。
//
// 唯一裁决源 ../Terarria1458/（行号锚见各节头注）。范围：
//   · LayoutProviders/DualDungeonLayoutProvider.cs（1104 行全量）
//   · Rooms/：DungeonRoom/Regular/Wormlike/GenShape/LivingTree/Biome×3/Legacy(entrance 支)
//   · Halls/：DungeonHall/Regular/Sine/Stairwell + LegacyDungeonHall 的
//     OverrideStart/End 直连支（dual 布局域唯一可达路径；爬升入口侧走廊仍走
//     DungeonPass.js 既有 dgEntHall*/dgHall）
//   · DungeonCrawler.cs 工厂（GetRoomSettings/GetHallSettings/GetRoom/GetHall/TryRoom）
//   · DungeonShapes.cs 全量；WorldBuilding 语义面（Expand/Conditions/SetTile/SetWall/
//     Clear/ClearTile/UpdateBounds/Paints/ModShapes.All/ShapeData）
//   · DungeonUtils.cs 消费子集（tier/protection/room-search/speleothems/floating-rocks/
//     hanging-leaf/flood-count/support-cutoff 等,锚行见各函数）
//
// 【内侧随机数】房间/大厅全部用 inner UnifiedRandom(settings.RandomSeed)；每次
//   Calculate*/Generate* 各自 new 同一 seed 重放流前缀（与 x86 完全同构）。主流 rng
//   只在 settings.RandomSeed、General 类型掷、连接点方向掷、specialized conversions 的
//   Next(list.Count) 等处消耗。
// 【普通世界零扰动】runDualDungeonLayout 仅在 seedFlags.dualDungeons 下由 DungeonPass 调。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { UnifiedRandom } from '../../../core/rng';
import { TILE_INTERNAL_BY_SHEET } from '../../../data/tiles';
import {
  buildDungeonGenVars,
  DungeonGenerationStyles,
  dualDungeonState,
  dualDungeonStyles,
  getCurrentDungeonStyle,
  isHigherOrEqualTieredDungeonWall,
  isHigherOrEqualTieredDungeonTile,
  type DungeonGenVars1457,
  type DungeonStyleData,
} from './DungeonStyles1457';
import { genSolidType } from './GenSolid';
import {
  SnakeOrientation as SO,
  dualSnakes,
} from './DitherSnakePass';

const fr = Math.fround;

/** SW_I138_EARLY 门（EarlyDual 家族批门,DungeonPass 同名门镜像）。
 *  ★IIIII164（2026-09-02）缺省翻转 OFF→ON：S4/S1-S7 写面认证（speleothems 3,492 掷全等
 *  +PRH/早特征窗全等,s1 PD_OUT 14,590→9,614 且零新差/s1 G_in 81,035→49,513）后落缺省 ON；
 *  SW_I138_EARLY=0 显式回退 IIII106b 前批账面（对照态保留,勿删）。 */
const __swProcessEnv: Record<string, string | undefined> = (typeof process !== 'undefined') ? (process as unknown as { env?: Record<string, string | undefined> }).env ?? {} : {};
export const i138EarlyGate = (): boolean => (__swProcessEnv.SW_I138_EARLY ?? '1') !== '0';

type V2 = { x: number; y: number };

/** RNG/UnifiedRandom 双形态掷骰适配（inner=UnifiedRandom 精确流；main=RNG 包装）。 */
interface RngLike {
  nextInt(n: number): number;
  next(): number;
}
class UnifiedRandomAdapter implements RngLike {
  constructor(private r: RNG) {}
  nextInt(n: number): number { return this.r.nextInt(n); }
  next(): number { return this.r.next(); }
}
const v2 = (x: number, y: number): V2 => ({ x, y });
function safeNormalize(vx: number, vy: number, fx: number, fy: number): V2 {
  if (vx === 0 && vy === 0) return v2(fx, fy);   // Utils.cs:1948 v==Vector2D.Zero 精确判
  // ★IIIII108c 刀①定谳：Utils.cs:1953 SafeNormalize(Vector2D)→System.Numerics.Vector2D
  //   .Normalize=**乘倒数**（f=1/sqrt 后 x*f,y*f），非除式——旧 v/l 在本文件 CP 走线
  //   上产生 ~1ulp 分裂（g2v3/dr-mark.log vs js-dr-ledger-107c.txt 首差 CP 行
  //   cx=1009,cy=442,ox=778,oy=404 v=bfc2cb00775e965e X ‖ …5d J），经走线整数化
  //   放大成 2-3 格连接点漂移（halls 147↔151）。同 DitherSnakePass.ts recNorm
  //   （IIII101c 认证体）——凡 Vector2D.SafeNormalize 移植一律乘倒数。
  const f = 1.0 / Math.sqrt(vx * vx + vy * vy);
  return v2(vx * f, vy * f);
}
const crossV = (a: V2, b: V2): number => a.x * b.y - a.y * b.x;
const lenD = (x: number, y: number): number => Math.sqrt(x * x + y * y);
const distV = (a: V2, b: V2): number => lenD(a.x - b.x, a.y - b.y);
const lerpN = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Utils.Remap(double)。 */
function remapN(v: number, lo: number, hi: number, olo: number, ohi: number): number {
  // ★IIIII98 第四轮勘误：C# Remap=GetLerpValue(…,clamped:true)→Lerp（Utils.cs:345/:350），
  //   lerp 因子钳 [0,1]；旧直译无钳会外推越界（|val.Y|>1、链接数>3 等常态发生）。
  let t = (v - lo) / (hi - lo);
  if (!(t > 0)) t = 0; else if (t > 1) t = 1;
  return olo + t * (ohi - olo);
}
/** Remap 的 **float 重载**全 f32 路径（ScoreHallway :181-183 三处为 Count/float 字面量 → float 版）。 */
function remapF(v: number, lo: number, hi: number, olo: number, ohi: number): number {
  const fv = fr(v), flo = fr(lo), fhi = fr(hi);
  let t = fr(fr(fv - flo) / fr(fhi - flo));
  if (!(t > 0)) t = 0; else if (t > 1) t = 1;              // MathHelper.Clamp(f32)
  return fr(fr(olo) + fr(fr(fr(ohi) - fr(olo)) * t));      // MathHelper.Lerp float
}

/** Utils.LineSegmentsIntersect(Vector2D)。 */
function lineSegmentsIntersect(s1: V2, e1: V2, s2: V2, e2: V2): boolean {
  const num = crossV(v2(e1.x - s1.x, e1.y - s1.y), v2(e2.x - s2.x, e2.y - s2.y));
  if (num === 0) return false;
  const t = crossV(v2(s2.x - s1.x, s2.y - s1.y), v2(e1.x - s1.x, e1.y - s1.y)) / num;
  return !(t < 0 || t > 1);
}
/** Vector2D.ClosestPointOnLine(P,A,B)。 */
function closestPointOnLine(px: number, py: number, ax: number, ay: number, bx: number, by: number): V2 {
  const wx = bx - ax, wy = by - ay;
  const t = ((px - ax) * wx + (py - ay) * wy) / (wx * wx + wy * wy);
  if (t < 0) return v2(ax, ay);
  if (t > 1) return v2(bx, by);
  return v2(ax + wx * t, ay + wy * t);
}

// float 域（XNA Vector2）：逐运算 fround。
type F2 = { x: number; y: number };
const fF = (x: number, y: number): F2 => ({ x: fr(x), y: fr(y) });
const fadd = (a: F2, b: F2): F2 => fF(a.x + b.x, a.y + b.y);
/** Vector2.RotatedBy(double angle)（Utils.cs:1752）：**角度保持 double**，
 *  (float) 化只发生在 cos/sin 结果；随后**逐乘积项在 f32 域内完成**再相加减——
 *  ★IIIII99b2 勘误：旧版先 fr(angle) 再 cos 会把 double 角度域偷换成 f32 角度域
 *  （cos(f32(x)) ≠ (float)cos(x)），Wormlike 螺旋方向链/Sine 幅度投影都被污染。 */
function frot(v: F2, angle: number): F2 {
  const c = fr(Math.cos(angle)), s = fr(Math.sin(angle));
  return fF(fr(c * v.x) - fr(s * v.y), fr(s * v.x) + fr(c * v.y));
}
/** Utils.Lerp 的 float 重载（v1+(v2-v1)*a 全 f32；clamped 缺省 false）。 */
function fLerp(a: number, b: number, t: number): number {
  return fr(fr(a) + fr(fr(b - a) * t));
}
/** Wormlike 转角：double 角度域 + float 输入。 */
function frotD(v: F2, angle: number): F2 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return fF(c * v.x - s * v.y, s * v.x + c * v.y);
}

// ── 枚举 ─────────────────────────────────────────────────────────

export const DPRoomType = {
  Legacy: 0, Regular: 1, Wormlike: 2, LivingTree: 3,
  BiomeSquare: 4, BiomeRugged: 5, BiomeStructured: 6,
  GenShapeCircle: 7, GenShapeMound: 8, GenShapeHourglass: 9,
  GenShapeDoughnut: 10, GenShapeQuadCircle: 11,
} as const;
export type DPRoomTypeV = number;
export const DPHallType = { Legacy: 0, LegacyEntrance: 1, Regular: 2, Stairwell: 3, Sine: 4 } as const;
export const Protection = { None: 0, Tiles: 1, Walls: 2, TilesAndWalls: 3 } as const;
export const CPQuality = { Good: 0, Okay: 1, Bad: 2, VeryBad: 3 } as const;
const GenShapeT = { Circle: 0, Mound: 1, Hourglass: 2, Doughnut: 3, QuadCircle: 4 } as const;
/** SceneMetrics.ShimmerTileThreshold（SceneMetrics.cs:24）。 */
const SHIMMER_TILE_THRESHOLD = 300;

// ── ★IIIII99b2 DR|S|/DR|HC| 段界记账镜像（x86 rig DualDungeonLayoutProvider DRL 钩同构）──
// 挂载 globalThis.__swI113=(line)=>… 后逐行输出；rc=__swRollN（与 JJHook.RollCount 同口径
// =本 pass 窗口内全部 internalSample 计数）。零 RNG 消耗,缺省零开销。
let _drlInstNext = 0;
function drlMark(s: string): void {
  const h = (globalThis as { __swI113?: (line: string) => void }).__swI113;
  if (h) h(s);
}
/** 主实例计数（=x86 JJHook.MainRolls,SW_MAINROLL=1 口径）。 */
function drlMr(): number { return (globalThis as { __swRollN?: number }).__swRollN ?? -1; }
/** 全样本计数（=x86 JJHook.RollCount）。 */
function drlRc(): number { return (globalThis as { __swRollTotal?: number }).__swRollTotal ?? -1; }
/** C# BitConverter.DoubleToInt64Bits(d).ToString("x16")（无符号 16 位十六进制）。 */
function bits64x(d: number): string {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d);
  return (dv.getBigInt64(0, false) & 0xFFFFFFFFFFFFFFFFn).toString(16).padStart(16, '0');
}

// ── ShapeData / DungeonBounds / tile 写入工具 ──────────────────────

class ShapeData {
  private pts = new Set<number>();
  private static key(x: number, y: number): number {
    return ((x + 32768) << 16) | ((y + 32768) & 0xffff);
  }
  add(x: number, y: number): void { this.pts.add(ShapeData.key(x, y)); }
  addBounds(minX: number, minY: number, maxX: number, maxY: number): void {
    for (let i = minX; i <= maxX; i++) for (let j = minY; j <= maxY; j++) this.add(i, j);
  }
  clear(): void { this.pts.clear(); }
  contains(x: number, y: number): boolean { return this.pts.has(ShapeData.key(x, y)); }
  /** ★IIIII172：形状账（DR|RB sc= 字段）。 */
  size(): number { return this.pts.size; }
  forEachPoint(cb: (dx: number, dy: number) => void): void {
    for (const k of this.pts) cb((k >> 16) - 32768, ((k << 16) >> 16) - 32768);
  }
}

/** DungeonBounds：setter Clamp[10,max-10]+hitbox 半开矩形。 */
class DBoundsFull {
  L = 10; R = 10; T = 10; B = 10;
  hitbox = false;
  constructor(public w: number, public hgt: number) {}
  private cx(v: number): number { return Math.max(10, Math.min(this.w - 10, Math.trunc(v))); }
  private cy(v: number): number { return Math.max(10, Math.min(this.hgt - 10, Math.trunc(v))); }
  set(left: number, top: number, right: number, bottom: number): void {
    this.L = this.cx(left); this.R = this.cx(right); this.T = this.cy(top); this.B = this.cy(bottom);
    this.calc();
  }
  upd(x: number, y: number): void {
    if (x < this.L) this.L = this.cx(x);
    if (x > this.R) this.R = this.cx(x);
    if (y < this.T) this.T = this.cy(y);
    if (y > this.B) this.B = this.cy(y);
  }
  updBox(minX: number, minY: number, maxX: number, maxY: number): void {
    if (minX < this.L) this.L = this.cx(minX);
    if (maxX > this.R) this.R = this.cx(maxX);
    if (minY < this.T) this.T = this.cy(minY);
    if (maxY > this.B) this.B = this.cy(maxY);
  }
  calc(): void {
    if (this.R <= this.L) this.R = this.L + 1;
    if (this.B <= this.T) this.B = this.T + 1;
    this.hitbox = true;
  }
  get width(): number { return this.R - this.L; }
  get height(): number { return this.B - this.T; }
  centerX(): number { return (this.L + this.R) >> 1; }
  centerY(): number { return (this.T + this.B) >> 1; }
  contains(x: number, y: number): boolean { return this.hitbox && x >= this.L && x < this.R && y >= this.T && y < this.B; }
  containsF(x: number, y: number, fluff: number): boolean {
    if (!this.hitbox) return false;
    if (fluff === 0) return this.contains(x, y);
    return x >= this.L - fluff && x < this.R + fluff && y >= this.T - fluff && y < this.B + fluff;
  }
  intersectsO(o: DBoundsFull): boolean {
    if (!o.hitbox || !this.hitbox) return false;
    return this.L < o.R && o.L < this.R && this.T < o.B && o.T < this.B;
  }
}

/** DungeonUtils.ChangeTileType（DU:1606-1618）。 */
function chTileSheet(st: TileStore, x: number, y: number, sheetType: number, resetTile: boolean, paint: number): void {
  const t = TILE_INTERNAL_BY_SHEET.get(sheetType);
  if (t === undefined || !st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (resetTile) {
    st.type[i] = 0; st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0; st.flags[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    st.wire[i] = 0; st.paint[i] = 0; st.paintWall[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  st.flags[i] |= 1; st.type[i] = t;
  st.slope[i] = 0; st.half[i] = 0;
  if (paint > 0) st.paint[i] = paint & 0xff;
}
/** DungeonUtils.ChangeWallType（DU:1620-1631）——本体不清 slope。 */
function chWallSheet(st: TileStore, x: number, y: number, wallType: number, resetTile: boolean, paint: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (resetTile) {
    st.type[i] = 0; st.wall[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0; st.flags[i] = 0;
    st.slope[i] = 0; st.half[i] = 0;
    st.wire[i] = 0; st.paint[i] = 0; st.paintWall[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0;
  }
  st.wall[i] = wallType;
  if (paint > 0) st.paintWall[i] = paint & 0xff;
}
/** Tile.ClearTile()：active/inActive/slope/half 清除，保 type/wall/liquid/paint。 */
function clearTileOnly(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.slope[i] = 0; st.half[i] = 0;
  st.flags[i] &= ~1;
  st.wire[i] &= ~32;
}
/** Actions.ClearTile()（WorldUtils.ClearTile(false)：ClearTile 域）。 */
function actClearTileCell(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = 0; st.slope[i] = 0; st.half[i] = 0; st.paint[i] = 0;
  st.flags[i] &= ~1; st.wire[i] &= ~32;
}
function actSetTileCell(st: TileStore, x: number, y: number, sheetType: number): void {
  const t = TILE_INTERNAL_BY_SHEET.get(sheetType);
  if (t === undefined || !st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = t; st.flags[i] |= 1;
}
function actSetWallCell(st: TileStore, x: number, y: number, wallType: number): void {
  if (!st.inBounds(x, y)) return;
  st.wall[st.idx(x, y)] = wallType;
}
/** Actions.Clear()=ClearEverything。 */
function actClearAll(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.type[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  st.wire[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0;
  st.paint[i] = 0; st.paintWall[i] = 0; st.frameX[i] = 0; st.frameY[i] = 0;
  st.flags[i] = 0;
}

// ── UnifiedRandom 向量扩展（Utils.cs:1296-1347）────────────────────

/** NextVector2DUnit：angle=NextDouble()*2π。 */
function nextV2Unit(r: UnifiedRandom): V2 {
  const ang = r.nextDouble() * 6.2831854820251465;
  return v2(Math.cos(ang), Math.sin(ang));
}
function nextV2CircularEdge(r: UnifiedRandom, hw: number, hh: number): V2 {
  const u = nextV2Unit(r);
  return v2(u.x * hw, u.y * hh);
}
function nextV2Circular(r: UnifiedRandom, hw: number, hh: number): V2 {
  const u = nextV2Unit(r);
  const m = r.nextDouble();
  return v2(u.x * hw * m, u.y * hh * m);
}
/** Vector2(float) 版 CircularEdge（Utils.cs:1306）：startRotation(0f)+range(2π_f32)*
 *  NextFloat((float)NextDouble) 全 **f32 域角度**，随后 ToRotationVector2(float)=
 *  (float)Math.Cos/Sin（Utils.cs:1743）→ ×Vector2(hw,hh) f32。
 *  ★IIIII99b2 勘误：旧版复用 nextV2Unit 的 double 角度域（NextDouble 不经 f32 量化 +
 *  cos/sin 结果不 (float) 化），单位向量末位差被螺线 (int) 截断放大成 box 宽差。 */
function nextF2CircularEdge(r: UnifiedRandom, hw: number, hh: number): F2 {
  const ang = fr(fr(6.2831854820251465) * fr(r.nextDouble()));
  const c = fr(Math.cos(ang)), s = fr(Math.sin(ang));
  return fF(fr(c * hw), fr(s * hh));
}
/** Vector2.RotatedByRandom(maxRadians)（Utils.cs:1785）＝RotatedBy(r1*max−r2*max)，
 *  两掷独立；合成走 RotatedBy(Vector2,double) 同款 f32 逐乘积项路径。 */
function rotByRandom(r: UnifiedRandom, sp: F2, maxRadians: number): F2 {
  const ang = r.nextDouble() * maxRadians - r.nextDouble() * maxRadians;
  return frot(sp, ang);
}

// ── 提供器上下文 ────────────────────────────────────────────────────

export interface DualLayoutCtx {
  st: TileStore;
  gs: GenState;
  rng: RNG;
  w: number;
  h: number;
  ws: number;
  rock: number;
  undergroundLayer: number;
  /** 主流 wrapper（runDungeonPass 注入：ri=[a,b]、rn=Next(n)、rd=NextDouble、raw=Next()） */
  ri(a: number, b: number): number;
  rn(n: number): number;
  rd(): number;
  raw(): number;
  /** dungeonBounds 的 JS DBnd 投影（下游 dgFeatures 扫描窗桥） */
  jsBoundUpd(x0: number, y0: number, x1: number, y1: number): void;
  /** 房间视图接收器（下游 roomPlatformsDoors/dgBasicChests 桥接）。legacy=true 才带终值。 */
  roomSink(rm: { x: number; y: number; ex: number; ey: number; strength: number; generated: boolean;
    innerL: number; innerR: number; innerT: number; innerB: number;
    /** ★IIIII105c：settings.style.Style（BasicChests/BiomeChests_DualDungeons 座分派） */
    st?: number;
    /** ★IIIII111c：PD 面载荷——bio=BiomeDungeonRoom 实例（fluff 3→0+SkipOther/Space=true，
     *  BiomeDungeonRoom.cs:46）；forceDP=settings.ForceStyleForDoorsAndPlatforms
     *  （LivingTree=true，DC.cs:646；其余房 false→PD 走房心格三级解析）。 */
    bio?: boolean; forceDP?: boolean; leg?: boolean; }): void;
  snap(name: string): void;
  /** tier 判定上下文（runDualDungeonLayout 装配） */
  tierCtx?: TierCtx | null;
  /** 平台候选接收（floating rocks 等 DungeonPlatformData 投影） */
  /** ★IIIII222：载荷补 os（OverrideStyle）/cb（canPlaceHereCallback 盒投影）——
   *  vanilla GenerateFloatingRocksInArea includePlatform 支（DU.cs:1415-1428）。 */
  platSink?(p: { x: number; y: number; hall: boolean; hf: number; force?: boolean; maxLen?: number;
    os?: number; cb?: [number, number, number, number] }): void;
  /** 每地牢数据体引用（halls 写 genVars 用） */
  data?: DualDungeonData | null;
}

interface RoomSearchSettings {
  fluff?: number;
  excludedRoom?: DRoomBase | null;
  maximumDistance?: number;
  useOuterBounds?: boolean;
}

// ── 房间设置族（Rooms/*Settings.cs 默认值面）──────────────────────

abstract class RoomSettingsBase {
  controlLine: DungeonControlLineRef | null = null;
  x = 0; y = 0;
  roomType: number = DPRoomType.Legacy;
  randomSeed = 0;
  style!: DungeonStyleData;
  progressionStage = 0;
  startingRoom = false;
  overridePaintTile = -1;
  overridePaintWall = -1;
  forceStyleDP = false;
  onCurvedLine = false;
  orientation: number = SO.Unknown as number;
  connectionOverride: ((room: DRoomBase, otherRoomPos: V2) => { quality: number; point: V2 }) | null = null;
  hallwayPointAdjuster: number | null = null;
  abstract boundingRadius(): number;
}
class StepBasedRoomSettings extends RoomSettingsBase {
  overrideStrength = 0;
  overrideSteps = 0;
  overrideStartPos: V2 | null = null;   // null ≡ default(Vector2D)
  overrideEndPos: V2 | null = null;
  overrideVelocity: V2 | null = null;
  overrideITExRatio = 0;
  boundingRadius(): number {
    return Math.trunc(this.overrideStrength * 0.8 + 5.0 + this.overrideSteps * 0.5 * 1.4);
  }
}
class LegacyRoomSettingsCls extends StepBasedRoomSettings { isEntranceRoom = false; }
class RegularRoomSettingsCls extends RoomSettingsBase {
  overrideInnerBoundsSize = 0;
  overrideOuterBoundsSize = 0;
  boundingRadius(): number { return Math.trunc((this.overrideInnerBoundsSize + this.overrideOuterBoundsSize) * 142 / 100); }
}
class WormlikeRoomSettingsCls extends RoomSettingsBase {
  firstSideIterations = 0;
  secondSideIterations = 0;
  boundingRadius(): number {
    return Math.trunc((16.200000000000003 + (this.firstSideIterations + this.secondSideIterations) * 0.5 * 1.4) * 0.5);
  }
}
class LivingTreeRoomSettingsCls extends RoomSettingsBase {
  innerWidth = 0; innerHeight = 0; depth = 0; boundR = 0;
  forceStyleDP = true;
  boundingRadius(): number { return this.boundR; }
}
class BiomeRoomSettingsCls extends RoomSettingsBase {
  boundingRadius(): number { return biomeRoomOuterSize(this.style); }
}
class GenShapeRoomSettingsCls extends RoomSettingsBase {
  shapeType = 0;
  innerShape: RoomShape | null = null;
  outerShape: RoomShape | null = null;
  boundR = 0;
  boundingRadius(): number { return this.boundR; }
}

/** 控制线结构投影（真身=DitherSnakePass 内部类）。 */
export interface DungeonControlLineRef {
  Start: V2; End: V2;
  NormalizedLineDirection: V2;
  LineLength: number;
  Style: DungeonStyleData;
  ProgressionStage: number;
  CurveLine: boolean;
}

// ── Biome 尺寸表（BiomeDungeonRoom.cs:106-119）──

function biomeRoomInnerSize(style: DungeonStyleData, maxTilesX: number): number {
  const num = fr(fr(maxTilesX) / fr(4200));
  return Math.trunc(style.Style === 10 ? fr(50 * num) : fr(32 * num));
}
function biomeRoomOuterSize(style: DungeonStyleData, maxTilesX = 4200): number {
  return biomeRoomInnerSize(style, maxTilesX) + 8;
}

// ── DungeonShapes.cs 形状族（全量）───────────────────────────────

type CellVisitor = (x: number, y: number) => void;

abstract class RoomShape {
  abstract perform(ox: number, oy: number, visit: CellVisitor): void;
}

class CircleRoomShape extends RoomShape {
  constructor(public hRad: number, public vRad: number) { super(); }
  perform(ox: number, oy: number, visit: CellVisitor): void {
    const hr = this.hRad, vr = this.vRad;
    const sq = (hr + 1) * (hr + 1);
    for (let i = oy - vr; i <= oy + vr; i++) {
      const num2 = hr / vr * (i - oy);
      const num3 = Math.min(hr, Math.trunc(Math.sqrt(sq - num2 * num2)));
      for (let j = ox - num3; j <= ox + num3; j++) visit(j, i);
    }
  }
}

class MoundRoomShape extends RoomShape {
  constructor(public halfWidth: number, public height: number) { super(); }
  perform(ox: number, oy: number, visit: CellVisitor): void {
    const hwF = fr(this.halfWidth);
    const num2 = Math.trunc(this.height / 2);
    const inv = fr(fr(0) - fr(fr(this.height + 1) / fr(hwF * hwF)));
    for (let i = -this.halfWidth; i <= this.halfWidth; i++) {
      const fi = fr(i);
      let acc = fr(inv * fr(fi + hwF));
      acc = fr(acc * fr(fi - hwF));
      const num3 = Math.min(this.height, Math.trunc(acc));
      for (let j = 0; j < num3; j++) visit(ox + i, oy - j + num2);
    }
  }
}

/** Utils.MultiLerp/WrappedLerp float 域。 */
function multiLerpF(percent: number, floats: number[]): number {
  const n = fr(1 / fr(floats.length - 1));
  let step = n;
  let idx = 0;
  while (fr(percent / step) > 1 && idx < floats.length - 2) {
    step = fr(step + n);
    idx++;
  }
  const a = floats[idx]!, b = floats[idx + 1]!;
  const amt = fr((percent - fr(n * idx)) / n);
  return fr(a + fr((b - a) * amt));
}
function wrappedLerpF(a1: number, b1: number, percent: number): number {
  let t = fr(percent * 2);
  if (t > 1) t = fr(2 - t);
  return fr(a1 + fr((b1 - a1) * t));
}

class HourglassRoomShape extends RoomShape {
  constructor(public width: number, public height: number, public percentileAddon: number) { super(); }
  perform(ox: number, oy: number, visit: CellVisitor): void {
    const num = Math.trunc(this.height / 2);
    for (let i = -num; i <= num; i++) {
      const yy = oy + i;
      const percent = fr(fr(fr(i) + fr(num)) / fr(this.height));
      let add = multiLerpF(wrappedLerpF(0, 1, percent), [1, 1, 0.75, 0.65, 0.45, 0.4, 0.35, 0.35]);
      add = fr(add + fr(this.percentileAddon));
      add = Math.max(0, Math.min(1, add));
      const num3 = Math.trunc(fr(fr(this.width) * add) / 2);
      for (let j = -num3; j <= num3; j++) visit(ox + j, yy);
    }
  }
}

class QuadCircleRoomShape extends RoomShape {
  constructor(public radius: number, public distBetween: number) { super(); }
  perform(ox: number, oy: number, visit: CellVisitor): void {
    const sq = (this.radius + 1) * (this.radius + 1);
    let px = ox, py = oy;
    const num2 = 3;
    for (let i = 0; i < 5; i++) {
      switch (i) {
        case 1: px = ox; py = oy + this.distBetween - num2; break;
        case 2: px = ox - this.distBetween + num2; py = oy; break;
        case 3: px = ox + this.distBetween - num2; py = oy; break;
        case 4: px = ox; py = oy; break;
        default: px = ox; py = oy - this.distBetween + num2; break;
      }
      for (let j = py - this.radius; j <= py + this.radius; j++) {
        const num3 = (this.radius / this.radius) * (j - py);
        const num4 = Math.min(this.radius, Math.trunc(Math.sqrt(sq - num3 * num3)));
        for (let k = px - num4; k <= px + num4; k++) visit(k, j);
      }
    }
  }
}

// ── 每地牢数据体（DungeonData 最小消费面）────────────────────────

interface DScalars {
  hallS: number; hallStep: number; hallITEx: number; hallSlant: number;
  roomS: number; roomStep: number; roomITEx: number; roomSlant: number;
}

export class DualDungeonData {
  typeDual = true;
  rooms: DRoomBase[] = [];
  halls: DHallBase[] = [];
  dungeonBounds: DBoundsFull;
  lastDungeonHall: V2 = v2(0, 0);
  outerPotential: DBoundsFull;
  gv: DungeonGenVars1457;
  /** ★IIIII206：SpecialSeedFeatures.DungeonEntranceIsUnderground（drunk∨noSurface）——
   *  dualBrickSupportCutoffY 的 Top−5/Top−10 分臂消费（runDualDungeonLayout 装配）。 */
  ug = false;
  genPosX = 0;
  genPosY = 0;
  maxTilesX: number;
  defaultStyle: DungeonStyleData | null = null;
  outerProgressionBounds: DBoundsFull[] = [];
  entranceX = 0;
  entranceY = 0;
  precalcFlag = false;
  scalars: DScalars = {
    hallS: 1.0, hallStep: 1.0, hallITEx: 0.5, hallSlant: 1.0,
    roomS: 1.0, roomStep: 1.0, roomITEx: 0.5, roomSlant: 1.0,
  };
  constructor(w: number, h: number, outerPot: DBoundsFull, gv: DungeonGenVars1457) {
    this.dungeonBounds = new DBoundsFull(w, h);
    this.outerPotential = outerPot;
    this.gv = gv;
    this.maxTilesX = w;
  }
}

/** tier 判定上下文（dual 门内多风格循环=DungeonStyles1457 既有函数）。 */
interface TierCtx {
  higherOrEqualWall(currentWallSheet: number, newWall: number, curStyle: number, newStyle: number): boolean;
  isDungeonWall(sheetWall: number): boolean;
}

function buildTierCtx(gv: DungeonGenVars1457, w: number, hgt: number): TierCtx {
  // Main.wallDungeon 基线集（DG_DUNGEON_WALLS 家族：7/8/9 主墙+94-99 变体族）
  const vanillaWallDungeon = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
  return {
    higherOrEqualWall(curW, newW, curStyleID, newStyleID): boolean {
      return isHigherOrEqualTieredDungeonWall(gv, curW, newW, curStyleID, newStyleID, true,
        (wl) => vanillaWallDungeon.has(wl));
    },
    isDungeonWall(wl: number): boolean { return wl > 0 && !!gv.isDungeonWall[wl]; },
  };
  void w; void hgt;
}

// ── 房间基类 ──────────────────────────────────────────────────────

abstract class DRoomBase {
  settings: RoomSettingsBase;
  calculated = false;
  generated = false;
  inner: DBoundsFull;
  outer: DBoundsFull;
  constructor(settings: RoomSettingsBase, w: number, hgt: number) {
    this.settings = settings;
    this.inner = new DBoundsFull(w, hgt);
    this.outer = new DBoundsFull(w, hgt);
  }
  get processed(): boolean { return this.calculated ? true : this.generated; }
  centerX(): number { return this.inner.centerX(); }
  centerY(): number { return this.inner.centerY(); }
  protectionAt(_st: TileStore, x: number, y: number): number {
    // ★IIIII118：C# 基类 DungeonRoom.GetProtectionTypeFromPoint
    //   （Rooms/DungeonRoom.cs:269-276）= OuterBounds.Contains ? Walls : None。
    //   JS 曾恒 None ⇒ DRegularRoom（RegularDungeonRoom 无覆写吃基类）等未覆写房
    //   在厅/入口 carve 的 GetHighestProtectionTypeFromPoint 完全不设防（1:1 偏差）。
    if (!this.outer.contains(x, y)) return Protection.None as number;
    return Protection.Walls as number;
  }
  isInsideRoom(_st: TileStore, x: number, y: number): boolean { return this.inner.contains(x, y); }
  floodedTileCount(): number { return this.inner.width * this.inner.height; }
  /** DungeonRoom.CanPlaceTileAt（:365-372）。 */
  canPlaceTileAt(st: TileStore, x: number, y: number, wallType: number, newStyleID: number, tier: TierCtx): boolean {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (st.wall[i] === 350) return false;
    return !tier.higherOrEqualWall(st.wall[i], wallType, newStyleID, newStyleID);
  }
  canRemoveTileAt(st: TileStore, x: number, y: number): boolean {
    if (!st.inBounds(x, y)) return true;
    return st.wall[st.idx(x, y)] !== 350;
  }
  /** DungeonRoom.GenerateDungeonSquareRoom（:321-363）全量。 */
  generateSquareRoom(
    ctx: DualLayoutCtx, inner: DBoundsFull, outer: DBoundsFull,
    curX: number, curY: number, style: DungeonStyleData, innerSize: number, totalSize: number,
    genTiles: boolean, genWalls: boolean,
  ): void {
    const st = ctx.st;
    const tilePaint = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (style.TilePaintColor ?? 0);
    const wallPaint = this.settings.overridePaintWall > -1 ? this.settings.overridePaintWall : (style.WallPaintColor ?? 0);
    for (let i = -totalSize; i <= totalSize; i++) {
      const x = Math.trunc(curX) + i;
      for (let j = -totalSize; j <= totalSize; j++) {
        const y = Math.trunc(curY) + j;
        if (x < 0 || x >= ctx.w || y < 0 || y >= ctx.h) continue;
        const ii = st.idx(x, y);
        if (Math.abs(i) <= innerSize && Math.abs(j) <= innerSize) {
          inner.upd(x, y);
          if (!this.canRemoveTileAt(st, x, y)) continue;
          if (genWalls) chWallSheet(st, x, y, style.BrickWallType, true, wallPaint);
        } else {
          outer.upd(x, y);
          if (this.canPlaceTileAt(st, x, y, style.BrickWallType, style.Style, ctx.tierCtx!)) {
            const flag = genWalls && i > -totalSize && i < totalSize && j > -totalSize && j < totalSize;
            if (genTiles) chTileSheet(st, x, y, style.BrickTileType, flag, tilePaint);
            if (flag) chWallSheet(st, x, y, style.BrickWallType, false, wallPaint);
          }
        }
        st.liquid[ii] = 0;
      }
    }
  }
  /** ★IIIII109b（PRH 窗 −3,160 定罪主项）：基类 GeneratePreHallwaysDungeonFeaturesInRoom
   *  （DungeonRoom.cs:53-59）——Style4/5（Crimson/Corruption）非 Biome 房在【PreHallways
   *  窗】下扫钟乳石（主流掷!，Max(3,Width/3) 根）。旧 JS 本体空 ⇒ x86 PRH 净 +3,500 vs
   *  JS +344（rugged 错置面）的基类缺臂。paint=(OverridePaintTile>=0∨!Style.TilePaintColor)
   *  ?Override:Style.Value（cs:57-58 三元；−1=cs null 不写漆,chTileSheet paint>0 门同构）。 */
  generatePreHallwaysFeatures(_data: DualDungeonData, ctx: DualLayoutCtx): void {
    if (!i138EarlyGate()) return;                          // OFF=前批账面（本体空）
    const sty = this.settings.style;
    if (sty.Style !== 4 && sty.Style !== 5) return;
    if (!(this.inner.width > 10 && this.inner.height > 10)) return;
    const opt = this.settings.overridePaintTile;
    const paint = opt >= 0 ? opt : (sty.TilePaintColor !== undefined ? sty.TilePaintColor : -1);
    generateSpeleothemsInArea(ctx, this.inner.L, this.inner.T, this.inner.width, this.inner.height,
      Math.max(3, Math.trunc(this.inner.width / 3)), sty.BrickTileType, paint);
  }
  abstract calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void;
  abstract generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void;
}

/** CalculateFloodedTileCountFromShapeData（DU:2228-2239）。 */
function floodedCountOf(inner: DBoundsFull, shape: ShapeData, ox: number, oy: number): number {
  void ox;
  let n = 0;
  shape.forEachPoint((_dx, dy) => { if (oy + dy > inner.centerY()) n++; });
  return n;
}

/** GetDualDungeonBrickSupportCutoffY（DU:1634-1642）；★IIIII206：underground 臂接线
 *  （DungeonEntranceIsUnderground=drunk∨noSurface → Top−5，SPF.cs:65-75）。 */
function dualBrickSupportCutoffY(data: DualDungeonData): number {
  return data.outerPotential.T - (data.ug ? 5 : 10);
}

// —— Regular room（RegularDungeonRoom.cs 全量）——
class DRegularRoom extends DRoomBase {
  declare settings: RegularRoomSettingsCls;
  private innerBoundsSize = 0;
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    let x = this.settings.x, y = this.settings.y;
    if (this.processed) { x = this.inner.centerX(); y = this.inner.centerY(); }
    let num = 6 + ur.nextInt(7);
    let num2 = 8;
    if (this.settings.overrideInnerBoundsSize > 0) num = this.settings.overrideInnerBoundsSize;
    if (this.settings.overrideOuterBoundsSize > 0) num2 = this.settings.overrideOuterBoundsSize;
    if (this.processed) num = this.innerBoundsSize;
    const total = num + num2;
    this.inner.set(x, y, x, y);
    this.outer.set(x, y, x, y);
    this.generateSquareRoom(ctx, this.inner, this.outer, x, y, this.settings.style, num, total, generating, generating);
    this.innerBoundsSize = num;
    this.inner.calc(); this.outer.calc();
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}

// —— Legacy room（LegacyDungeonRoom.cs：dual 只涉缺省支+IsEntranceRoom 支撑带）——
class DLegacyRoom extends DRoomBase {
  declare settings: LegacyRoomSettingsCls;
  private innerShape = new ShapeData();
  private outerShape = new ShapeData();
  private floodedN = 0;
  startPos: V2 = v2(0, 0);
  endPosV: V2 = v2(0, 0);
  strengthVal = 0;
  protectionAt(_st: TileStore, x: number, y: number): number {
    // LegacyDungeonRoom.cs:56-67
    if (!this.outer.contains(x, y)) return Protection.None;
    if (!this.calculated) return Protection.Walls;          // base（外框内=Walls）
    if (!this.outerShape.contains(x - Math.trunc(this.startPos.x), y - Math.trunc(this.startPos.y))) return Protection.None;
    return Protection.Walls;
  }
  isInsideRoom(st: TileStore, x: number, y: number): boolean {
    if (!this.inner.contains(x, y)) return false;
    // ★IIIII156 定罪（seat0 写面位差根因）：C# `_innerShapeData.Contains(x - (int)StartPosition.X,
    //   y - (int)StartPosition.Y)`（LegacyDungeonRoom.cs:69-76）——**先截 origin 再整数差**；
    //   JS 曾 `trunc(x - startPos.x)`（先差后截）——startPos.y=j-num2v/2 在 num2v 奇数时
    //   带 .5（如 401.5），trunc(415-401.5)=13 vs C# 415-401=14 ⇒ 形状查询整行 +1 漂移
    //   ⇒ 连接点走出房多 1 步（HCW#410 p1 (770,415)→(769,416)）⇒ 厅 carve 位差级联
    //   S4 坑/S5-S7 落箱/尖刺/门/板全线位移（rm8/61 耗尽群根因）。
    return this.innerShape.contains(x - Math.trunc(this.startPos.x), y - Math.trunc(this.startPos.y));
  }
  floodedTileCount(): number { return this.floodedN; }
  /** FloodRoom（:47-54）：ModShapes.All + IsBelowHeight(centerY,inclusive) + IsNotSolid + SetLiquid。 */
  floodRoom(ctx: DualLayoutCtx, liquidSheetType: number): void {
    if (!this.generated) return;
    const st = ctx.st;
    const jsLiq = liquidSheetType + 1;                      // vanilla 0 基 ↔ JS +1 基
    this.innerShape.forEachPoint((dx, dy) => {
      const x = Math.trunc(this.startPos.x) + dx;
      const y = Math.trunc(this.startPos.y) + dy;
      if (!st.inBounds(x, y)) return;
      const i = st.idx(x, y);
      if (!(y >= this.inner.centerY())) return;             // IsBelowHeight inclusive=y>=Y 通过
      if (st.flags[i] & 1 && genSolidType(st.type[i])) return;   // IsNotSolid 拒
      st.liquid[i] = 255;
      st.liquidType[i] = jsLiq;
    });
  }
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const st = ctx.st;
    const ur = new UnifiedRandom(this.settings.randomSeed);
    // ★IIIII156 走线取证（dormant）：目标房逐步 float 位型
    const wv156On = (globalThis as { __swI156Walk?: unknown }).__swI156Walk != null;
    const f64x = (d: number): string => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, d); return (dv.getBigInt64(0, false) & 0xFFFFFFFFFFFFFFFFn).toString(16); };
    if (wv156On && (this as { __i156Steps?: string[] }).__i156Steps === undefined) (this as { __i156Steps?: string[] }).__i156Steps = [];
    const brick = this.settings.style.BrickTileType;
    const brickWall = this.settings.style.BrickWallType;
    const b = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (this.settings.style.TilePaintColor ?? 0);
    const b2 = this.settings.overridePaintWall > -1 ? this.settings.overridePaintWall : (this.settings.style.WallPaintColor ?? 0);
    let roomS = data.scalars.roomS;
    if (this.settings.startingRoom) roomS = 1.0;
    const num2v = Math.trunc(15.0 * roomS) + ur.nextInt(15);         // num2（房厚）
    let vx = Math.fround(ur.nextIntRange(-10, 11) * Math.fround(0.1)) * data.scalars.roomSlant;
    let vy = Math.fround(ur.nextIntRange(-10, 11) * Math.fround(0.1)) * data.scalars.roomSlant;
    if (vx === 0 && vy === 0) {
      if (ur.nextInt(2) === 0) vx = ur.nextInt(2) !== 0 ? 1 : -1;
      else vy = ur.nextInt(2) !== 0 ? 1 : -1;
    }
    let px: number, py: number, sx0: number, sy0: number;
    if (this.calculated) {                                          // dual 布局不入此支
      px = this.startPos.x; py = this.startPos.y;
      sx0 = Math.trunc(px); sy0 = Math.trunc(py);
    } else {
      px = this.settings.x + 0.0;
      py = this.settings.y - num2v / 2.0;
      sx0 = Math.trunc(px); sy0 = Math.trunc(py);
    }
    let roomStep = data.scalars.roomStep;
    if (this.settings.startingRoom) roomStep = 1.0;
    let num4 = Math.trunc(10.0 * roomStep) + ur.nextInt(10);
    // ★IIIII114b2 定罪（G 窗半宽 10 房漂移）：C# `num2 = (num5 = OverrideStrength)`
    //   （LegacyDungeonRoom.cs:219-221）**同时重赋 num5**，:304 `Strength=(int)num5`
    //   ⇒ 覆写房 Strength=OverrideStrength（provider 主流 Next(13) 域）；JS 曾只重赋
    //   num2、`const num5` 钉死本地 num2v（房私种子 Next(15) 域）⇒ roomSink 透传的
    //   strength（→ dgBasicChests/dgBiomeChests 箱窗半宽 (int)(Strength*0.4f)）错源。
    //   房体写面（num2 支）本就吃覆写值零变；唯 strengthVal 消费面（箱窗）改径。
    let num5 = num2v;
    let num6 = data.scalars.roomITEx;
    if (this.settings.overrideStartPos != null && this.settings.overrideEndPos != null) {
      px = this.settings.overrideStartPos.x; py = this.settings.overrideStartPos.y;
      sx0 = Math.trunc(px); sy0 = Math.trunc(py);
      const dvx = this.settings.overrideEndPos.x - px;
      const dvy = this.settings.overrideEndPos.y - py;
      const nv = safeNormalize(dvx, dvy, 1, 0);
      vx = nv.x; vy = nv.y;
      num4 = Math.trunc(Math.ceil(lenD(dvx, dvy) / lenD(vx, vy)));
    } else if (this.settings.overrideVelocity != null) {
      vx = this.settings.overrideVelocity.x; vy = this.settings.overrideVelocity.y;
    }
    let num2 = num2v;
    if (this.settings.overrideStrength > 0) { num5 = this.settings.overrideStrength; num2 = num5; }
    if (this.settings.overrideSteps > 0) num4 = this.settings.overrideSteps;
    if (this.settings.overrideITExRatio > 0) num6 = this.settings.overrideITExRatio;
    const lgHook = (globalThis as { __swI103Phase?: ((tag: string, gen: boolean, seed: number) => void) | undefined }).__swI103Phase;
    const isEnt = !!this.settings.isEntranceRoom && !generating;
    if (lgHook && isEnt) lgHook(`LG0|seed=${this.settings.randomSeed | 0}|n2=${num2}|steps=${num4}|ratio=${num6}|py=${py}`, false, 0);
    const startX = px, startY = py;                                 // =C# val3（覆写分支后、循环前）
    this.inner.set(sx0, sy0, sx0, sy0);
    this.outer.set(sx0, sy0, sx0, sy0);
    while (num4 > 0) {
      num4--;
      const x0 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(px - num2 * 0.800000011920929 - 5.0)));
      const x1 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(px + num2 * 0.800000011920929 + 5.0)));
      const y0 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(py - num2 * 0.800000011920929 - 5.0)));
      let y1 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(py + num2 * 0.800000011920929 + 5.0)));
      if (this.settings.isEntranceRoom && data.typeDual) {
        y1 = Math.max(y1, dualBrickSupportCutoffY(data));
      }
      data.dungeonBounds.updBox(x0, y0, x1 - 1, y1 - 1);
      ctx.jsBoundUpd(x0, y0, x1 - 1, y1 - 1);
      this.outer.updBox(x0, y0, x1 - 1, y1 - 1);
      if (!generating) {
        this.outerShape.addBounds(x0 - sx0, y0 - sy0, x1 - 1 - sx0, y1 - 1 - sy0);
      }
      const jx0 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(px - num2 * num6)));
      const jx1 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(px + num2 * num6)));
      const jy0 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(py - num2 * num6)));
      const jy1 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(py + num2 * num6)));
        this.inner.updBox(jx0, jy0, jx1 - 1, jy1 - 1);
      if (lgHook && isEnt) lgHook(`LGs|jy0=${jy0}|jy1=${jy1}|py=${py}|vy=${vy}`, false, 0);
      if (!generating) {
        this.innerShape.addBounds(jx0 - sx0, jy0 - sy0, jx1 - sx0, jy1 - sy0);
      }
      if (generating) {
        for (let x = x0; x < x1; x++) {
          for (let y = y0; y < y1; y++) {
            if (!st.inBounds(x, y)) continue;
            const ii = st.idx(x, y);
            st.liquid[ii] = 0;
            const resetTile = x >= x0 + 1 && x < x1 - 1 && y >= y0 + 1 && y < y1 - 1;
            if (this.canPlaceTileAt(st, x, y, brickWall, this.settings.style.Style, ctx.tierCtx!)) {
              chTileSheet(st, x, y, brick, resetTile, b);
            }
          }
        }
        for (let x = x0 + 1; x < x1 - 1; x++) {
          for (let y = y0 + 1; y < y1 - 1; y++) {
            if (!st.inBounds(x, y)) continue;
            if (st.wall[st.idx(x, y)] !== 350) chWallSheet(st, x, y, brickWall, false, b2);
          }
        }
        for (let x = jx0; x < jx1; x++) {
          for (let y = jy0; y < jy1; y++) chWallSheet(st, x, y, brickWall, true, b2);
        }
      }
      px += vx; py += vy;
      vx = Math.max(-1.0, Math.min(1.0, vx + Math.fround(ur.nextIntRange(-10, 11) * Math.fround(0.05)) * data.scalars.roomSlant));
      vy = Math.max(-1.0, Math.min(1.0, vy + Math.fround(ur.nextIntRange(-10, 11) * Math.fround(0.05)) * data.scalars.roomSlant));
      // ★IIIII156：walk 步序账（仅 __swI156Walk 挂载且目标房时收集；零掷）
      if (wv156On) (this as { __i156Steps?: string[] }).__i156Steps!.push(`s|${f64x(px)},${f64x(py)}|${f64x(vx)},${f64x(vy)}|r=${x0},${y0},${x1},${y1}|i=${jx0},${jy0},${jx1},${jy1}`);
    }
    // ★IIIII98 第四轮定罪：C# StartPosition=val3（Vector2D **double**，含 .5 分量，
    //   LegacyDungeonRoom.cs:198/302；:194 calculated 分支恢复的正是这个双精度起点）。
    //   旧直译存 Math.trunc 整数 ⇒ generate 第二遍丢小数、内界 T/B 各漂 −1（入馆房盒案）。
    //   恢复调用链/形状偏移仍以 (int)val3 截断值（sx0/sy0）为准，与 C# (int) 强转同构。
    this.startPos = v2(startX, startY);
    this.endPosV = v2(px, py);
    this.strengthVal = Math.trunc(num5);
    // ★IIIII156 走线取证钩（dormant——__swI156Walk 未挂载时零开销零掷）：Legacy 房
    //   walk 末态盒/起终点/步序 float 位型（HCW #410 连接点 1 格漂移定罪用）。
    const w156 = (globalThis as { __swI156Walk?: (p: Record<string, unknown>) => void }).__swI156Walk;
    if (w156) {
      const f64 = (d: number): string => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, d); return (dv.getBigInt64(0, false) & 0xFFFFFFFFFFFFFFFFn).toString(16); };
      w156({ x: this.settings.x, y: this.settings.y, gen: generating, seed: this.settings.randomSeed | 0,
        n2: num2, n4: num4, ovS: this.settings.overrideStrength, ovSt: this.settings.overrideSteps,
        ovV: this.settings.overrideVelocity ? `${f64(this.settings.overrideVelocity.x)},${f64(this.settings.overrideVelocity.y)}` : '-',
        ib: `${this.inner.L},${this.inner.T},${this.inner.R},${this.inner.B}`,
        ob: `${this.outer.L},${this.outer.T},${this.outer.R},${this.outer.B}`,
        start: `${f64(startX)},${f64(startY)}`, end: `${f64(px)},${f64(py)}`, velEnd: `${f64(vx)},${f64(vy)}`,
        shQ: [-3, 14, -2, 14, -3, 15, -2, 15, -1, 14, -2, 13].map((d, idx, arr) => idx % 2 === 0 ? (this.innerShape.contains(d, arr[idx + 1]!) ? 1 : 0) : -1).filter((v) => v >= 0).join(''),
        steps: ((this as unknown as { __i156Steps?: string[] }).__i156Steps ?? []) as string[] });
      (this as unknown as { __i156Steps?: string[] }).__i156Steps = undefined;
    }
    if (lgHook && isEnt) lgHook(`LGend|ib=${this.inner.L},${this.inner.T},${this.inner.R},${this.inner.B}|start=${sx0},${sy0}`, false, 0);
    this.inner.calc(); this.outer.calc();
    this.floodedN = floodedCountOf(this.inner, this.innerShape, sx0, sy0);
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}

// —— Wormlike room（WormlikeDungeonRoom.cs 全量；float 向量域）——
class DWormlikeRoom extends DRoomBase {
  declare settings: WormlikeRoomSettingsCls;
  private innerShape = new ShapeData();
  private outerShape = new ShapeData();
  private floodedN = 0;
  private positionsArr: F2[] = [];
  private sizeMin = 0; private sizeMax = 0;
  floodedTileCount(): number { return this.floodedN; }
  protectionAt(_st: TileStore, x: number, y: number): number {
    // WormlikeDungeonRoom.cs:59-71 ★IIIII168 修正：守卫支回落基类= !Contains → None（曾误 Walls）
    if (this.calculated && !this.outer.contains(x, y)) return Protection.None;
    const p0 = this.positionsArr[0];
    if (!this.positionsArr.length || !this.outer.contains(x, y)) return Protection.None;
    // ★IIIII156：C# `Positions[0].ToPoint()` 先截 origin（WormlikeDungeonRoom.cs:65）——
    //   与 isInsideRoom 同病同修：trunc-after-subtract 在 p0 带小数时整格漂移。
    if (!p0 || !this.outerShape.contains(x - Math.trunc(p0.x), y - Math.trunc(p0.y))) return Protection.None;
    return Protection.Walls;
  }
  isInsideRoom(st: TileStore, x: number, y: number): boolean {
    if (this.positionsArr.length === 0) return this.inner.contains(x, y);
    if (!this.inner.contains(x, y)) return false;
    const p0 = this.positionsArr[0]!;
    // ★IIIII156：C# `Positions[0].ToPoint()` 先截 origin（WormlikeDungeonRoom.cs:79-82），
    //   形状录制 origin=trunc(position)（:127/:158 (int)vector2）——查询必须同 origin。
    return this.innerShape.contains(x - Math.trunc(p0.x), y - Math.trunc(p0.y));
  }
  /** FloodRoom（:48-57）。 */
  floodRoom(ctx: DualLayoutCtx, liquidSheetType: number): void {
    if (!this.innerShape || this.positionsArr.length === 0) return;
    const st = ctx.st;
    const jsLiq = liquidSheetType + 1;
    const origin = this.positionsArr[0]!;
    this.innerShape.forEachPoint((dx, dy) => {
      const x = Math.trunc(origin.x) + dx;
      const y = Math.trunc(origin.y) + dy;
      if (!st.inBounds(x, y)) return;
      const i = st.idx(x, y);
      if (!(y >= this.inner.centerY())) return;
      if (st.flags[i] & 1 && genSolidType(st.type[i])) return;
      st.liquid[i] = 255; st.liquidType[i] = jsLiq;
    });
  }
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    let pt = fF(this.settings.x, this.settings.y);
    if (this.processed && this.positionsArr.length > 0) pt = this.positionsArr[0]!;
    let num = 9 + ur.nextInt(3);                                // 房厚基
    let num2 = Math.max(4, Math.trunc(num / 5));
    if (this.processed) { num = this.sizeMax; num2 = this.sizeMin; }
    let num3 = num;
    const num4 = 8;
    let num5 = num + num4;
    this.inner.set(Math.trunc(pt.x), Math.trunc(pt.y), Math.trunc(pt.x), Math.trunc(pt.y));
    this.outer.set(Math.trunc(pt.x), Math.trunc(pt.y), Math.trunc(pt.x), Math.trunc(pt.y));
    this.outerShape.clear(); this.innerShape.clear();
    const originI = Math.trunc(pt.x), originJ = Math.trunc(pt.y);
    let vec = fF(pt.x, pt.y);
    const vecStart = vec;
    const collected: F2[] = [];
    // ★IIIII129 取证（常态关）：wormlike 节点链逐迭代导出——nodes/radii/dir/side
    const wormLog = (globalThis as unknown as { __swI129Worm?: Array<Record<string, unknown>> }).__swI129Worm;
    const wRec = wormLog !== undefined ? { seed: this.settings.randomSeed | 0, x: Math.trunc(pt.x), y: Math.trunc(pt.y), n1: this.settings.firstSideIterations, n2: this.settings.secondSideIterations, dir0: null as unknown, rot2: null as unknown, num0: 0, num20: 0, gen: generating ? 1 : 0, nodes: [] as number[][], radii: [] as number[], inner: [0, 0, 0, 0] as number[], outer: [0, 0, 0, 0] as number[] } : null;
    if (wRec) { wRec.num0 = num; wRec.num20 = num2; }
    vec = vecStart;
    let dirVec = nextF2CircularEdge(ur, 1, 1);
    let spin = dirVec;
    let idxPos = 0;
    if (wRec) { wRec.dir0 = [dirVec.x, dirVec.y]; }
    const phHook = (globalThis as { __swI103Phase?: ((tag: string, gen: boolean, seed: number) => void) | undefined }).__swI103Phase;
    if (phHook && !generating) phHook('PH1', false, this.settings.randomSeed | 0);
    for (let side = 0; side < 2; side++) {
      const iterations = side === 0 ? this.settings.firstSideIterations : this.settings.secondSideIterations;
      if (side === 1) {
        vec = vecStart;
        let rot = frot(spin, 3.1415927410125732);
        // ★IIIII97 定罪#1：C# Utils.RotatedByRandom（Utils.cs:1785）内联消费的是
        //   **Main.rand.NextDouble()×2**（主流！），不是任何传入实例——JS 曾误用
        //   房间自种 ur，造成 Wormlike 房受理后主流偏移 +2、后续全流错位。
        rot = rotByRandom(ctx.rng.vanilla, rot, 0.7853981852531433);
        if (phHook && !generating) phHook('PH3', false, this.settings.randomSeed | 0);
        dirVec = rot;
        spin = dirVec;
        // ★IIIII129 定罪（WormlikeDungeonRoom.cs:120-149 + :139-152）：C# 第二侧
        //   只做 `vector = vector2` 起点复位，**num6 计数器跨两侧共享不清零**——
        //   Processed 重放路径沿 Positions 数组连续下标继续走第二侧后半段（左侧
        //   回扫带）。JS 曾在此 `idxPos = 0` ⇒ generate 相位把 side0 节点重放一遍、
        //   整条左带丢失，InnerBounds 右收 ~19px → 大批蛇槽期砖该被房内清场而
        //   未被清（SandstoneBrick396/Snow161/Temple226/Hall117 ×~2.5 万格族）。
        if (wRec) { wRec.rot2 = [dirVec.x, dirVec.y]; }
      }
      for (let k = 0; k < iterations; k++) {
        if (wRec) { wRec.nodes.push([Math.trunc(vec.x), Math.trunc(vec.y), side]); wRec.radii.push(0); }
        const tF = fr(fr(k) / fr(iterations));
        // ★IIIII99b2 勘误：Utils 只有 **double Lerp**（Utils.cs:107，float 版不存在）——
        //   (int)Utils.Lerp(num,num2,tF) 是 double 域插值后截断，旧 fLerp(f32) 在
        //   跨整数边界步进时产 −1 宽差（#21/#26 box×24 族根因之二）
        num3 = Math.trunc(lerpN(num, num2, tF));
        num5 = num3 + num4;
        if (wRec) { wRec.radii[wRec.radii.length - 1] = num3; }
        const gx = Math.trunc(vec.x), gy = Math.trunc(vec.y);
        this.outerShape.addBounds(gx - num5 - originI, gy - num5 - originJ, gx + num5 - originI, gy + num5 - originJ);
        this.innerShape.addBounds(gx - num3 - originI, gy - num3 - originJ, gx + num3 - originI, gy + num3 - originJ);
        if (!this.processed) collected.push(vec);
        this.generateSquareRoom(ctx, this.inner, this.outer, gx, gy, this.settings.style, num3, num5, generating, generating);
        if (this.processed) {
          idxPos++;
          if (idxPos < this.positionsArr.length) vec = this.positionsArr[idxPos]!;
        } else {
          vec = fadd(vec, dirVec);
          dirVec = frot(spin, lerpN(0.0, 1.5707963705062866, tF));
        }
      }
    }
    if (phHook && !generating) phHook('PH4', false, this.settings.randomSeed | 0);
    if (wRec) {
      wRec.inner = [this.inner.L, this.inner.T, this.inner.R, this.inner.B];
      wRec.outer = [this.outer.L, this.outer.T, this.outer.R, this.outer.B];
      wormLog!.push(wRec);
      const flush = (globalThis as { __swI129WormFlush?: (r: Record<string, unknown>) => void }).__swI129WormFlush;
      if (flush) flush(wRec);
    }
    if (!this.processed) this.positionsArr = collected.slice();
    this.sizeMin = num2; this.sizeMax = num;
    this.inner.calc(); this.outer.calc();
    this.floodedN = floodedCountOf(this.inner, this.innerShape, originI, originJ);
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}

// —— GenShape room（GenShapeDungeonRoom.cs 全量：双 Gen 链语义面）——
class DGenShapeRoom extends DRoomBase {
  declare settings: GenShapeRoomSettingsCls;
  private innerShape = new ShapeData();
  private outerShape = new ShapeData();
  private floodedN = 0;
  floodedTileCount(): number { return this.floodedN; }
  protectionAt(_st: TileStore, x: number, y: number): number {
    // GenShapeDungeonRoom.cs:126-137 ★IIIII168 修正：守卫支 (calculated && !OuterBounds.Contains)
    // 回落基类=基类 !Contains → **None**（曾误写 Walls=外点保护反转——spider 厅 s0 墙写
    // 62/0 vs JS 349 的对拍定谳：JS 把 GenShape 房外点当 Walls 保护,压住厅 wall 清写）。
    if (this.calculated && !this.outer.contains(x, y)) return Protection.None;
    if (!this.outer.contains(x, y)) return Protection.None;
    if (!this.outerShape.contains(x - this.centerX(), y - this.centerY())) return Protection.None;
    return Protection.Walls;
  }
  isInsideRoom(st: TileStore, x: number, y: number): boolean {
    if (!this.inner.contains(x, y)) return false;
    return this.innerShape.contains(x - this.centerX(), y - this.centerY());
  }
  floodRoom(ctx: DualLayoutCtx, liquidSheetType: number): void {
    const st = ctx.st;
    const jsLiq = liquidSheetType + 1;
    const ox = this.centerX(), oy = this.centerY();
    const shape = this.settings.innerShape!;
    shape.perform(ox, oy, (x, y) => {
      if (!st.inBounds(x, y)) return;
      const i = st.idx(x, y);
      if (!(y >= oy)) return;
      if (st.flags[i] & 1 && genSolidType(st.type[i])) return;
      st.liquid[i] = 255; st.liquidType[i] = jsLiq;
    });
  }
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const st = ctx.st;
    const gsSettings = this.settings;
    const brickTileType = this.settings.style.BrickTileType;
    const brickWallType = this.settings.style.BrickWallType;
    const paintT = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (this.settings.style.TilePaintColor ?? 0);
    const paintW = this.settings.overridePaintWall > -1 ? this.settings.overridePaintWall : (this.settings.style.WallPaintColor ?? 0);
    let vx = this.settings.x, vy = this.settings.y;
    if (this.processed) { vx = this.centerX(); vy = this.centerY(); }
    this.inner.set(Math.trunc(vx), Math.trunc(vy), Math.trunc(vx), Math.trunc(vy));
    this.outer.set(Math.trunc(vx), Math.trunc(vy), Math.trunc(vx), Math.trunc(vy));
    const ox = Math.trunc(vx), oy = Math.trunc(vy);
    // —— Gen#1 Outer：Expand(1)→UpdateBounds(dungeonBounds).Output(outerShape)→
    //     UpdateBounds(OuterBounds)→[gen]ClearTile/SetTile/SetTilePaint ——
    const outerShape = gsSettings.outerShape!;
    const expandChain = (x: number, y: number): void => {
      for (let ddx = -1; ddx <= 1; ddx++) {
        for (let ddy = -1; ddy <= 1; ddy++) {
          const nx = x + ddx, ny = y + ddy;
          data.dungeonBounds.upd(nx, ny);
          ctx.jsBoundUpd(nx, ny, nx, ny);
          this.outerShape.add(nx - ox, ny - oy);
          this.outer.upd(nx, ny);
          if (generating) {
            actClearTileCell(st, nx, ny);
            actSetTileCell(st, nx, ny, brickTileType);
            if (paintT !== 0 && st.inBounds(nx, ny)) st.paint[st.idx(nx, ny)] = paintT & 0xff;
          }
        }
      }
    };
    outerShape.perform(ox, oy, expandChain);
    // —— Gen#2（仅 generating）Outer 无 Expand：SetWall+SetWallPaint ——
    if (generating) {
      outerShape.perform(ox, oy, (x, y) => {
        actSetWallCell(st, x, y, brickWallType);
        if (paintW !== 0 && st.inBounds(x, y)) st.paintWall[st.idx(x, y)] = paintW & 0xff;
      });
    }
    // —— Gen#3 Inner：UpdateBounds(dungeonBounds).Output(innerShape)→
    //     UpdateBounds(InnerBounds)→[gen]Actions.Clear/SetWall/SetWallPaint ——
    gsSettings.innerShape!.perform(ox, oy, (x, y) => {
      data.dungeonBounds.upd(x, y);
      ctx.jsBoundUpd(x, y, x, y);
      this.innerShape.add(x - ox, y - oy);
      this.inner.upd(x, y);
      if (generating) {
        actClearAll(st, x, y);
        actSetWallCell(st, x, y, brickWallType);
        if (paintW !== 0 && st.inBounds(x, y)) st.paintWall[st.idx(x, y)] = paintW & 0xff;
      }
    });
    this.inner.calc(); this.outer.calc();
    this.floodedN = floodedCountOf(this.inner, this.innerShape, ox, oy);
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}

// ── Biome 房间族（BiomeDungeonRoom.cs + Square/Rugged/Structured）────

abstract class DBiomeRoomBase extends DRoomBase {
  protected shapeDataInner: ShapeData | null = null;
  protected shapeDataOuter: ShapeData | null = null;
  position: { x: number; y: number } = { x: 0, y: 0 };
  roomInnerSize = 0;
  roomOuterSize = 0;
  wallDepth = 8;
  /** ★IIIII109b：BiomeDungeonRoom.cs:36-38 GeneratePreHallwaysDungeonFeaturesInRoom
   *  **空体覆写**——biome 房不吃基类 style4/5 钟乳石面（该面只属非 Biome 房）。 */
  generatePreHallwaysFeatures(_data: DualDungeonData, _ctx: DualLayoutCtx): void {}
  /** BiomeDungeonRoom.cs:27-34：traps/spikes/chests/drop/pit 拒——下游 feature 批接。 */
  protectionAt(st: TileStore, x: number, y: number): number {
    if (this.settings.style.Style === 0 || this.settings.style.Style === 10) return Protection.None;
    if (this.shapeDataInner && this.shapeDataOuter) {
      const cx = this.centerX(), cy = this.centerY();
      if (!this.shapeDataOuter.contains(x - cx, y - cy)) return Protection.None;
      if (!this.shapeDataInner.contains(x - cx, y - cy)) return Protection.Walls;
      return Protection.TilesAndWalls;
    }
    if (!this.outer.contains(x, y)) return Protection.None;
    return Protection.Walls;
  }
  isInsideRoom(st: TileStore, x: number, y: number): boolean {
    if (!this.inner.contains(x, y)) return false;
    if (this.shapeDataInner) {
      return this.shapeDataInner.contains(x - this.centerX(), y - this.centerY());
    }
    return true;
  }
  /** GetHallwayConnectionPoint（BiomeDungeonRoom.cs:49-66）。 */
  biomeConnectionPoint(ctx: DualLayoutCtx, otherRoomPos: V2): V2 {
    let px = this.centerX() + 0.0, py = this.centerY() + 0.0;
    const dxn = safeNormalize(otherRoomPos.x - px, otherRoomPos.y - py, 1, 0);
    const step = !(dxn.x < 0.0) ? 1 : -1;
    while (this.isInsideRoom(ctx.st, Math.trunc(px), Math.trunc(py))) px += step;
    return v2(px, py);
  }
  /** BiomeRoom_AddHallwaySpace（BiomeDungeonRoom.cs:121-145）。 */
  protected addHallwaySpace(
    ctx: DualLayoutCtx, positionX: number, positionY: number,
    edgeLeft: number, edgeRight: number, edgeTop: number, edgeBottom: number,
    shapeOffset: number, wallType: number, wallPaint: number, generating: boolean,
  ): void {
    const st = ctx.st;
    const num = Math.trunc((edgeTop + edgeBottom) / 2 - 3);
    const num2 = Math.trunc((edgeTop + edgeBottom) / 2 + 3);
    for (let i = edgeLeft; i < edgeRight; i++) {
      for (let j = num; j < num2; j++) {
        if (!st.inBounds(i, j)) continue;
        const ii = st.idx(i, j);
        if (!generating && this.shapeDataInner && this.shapeDataOuter) {
          this.shapeDataInner.add(i - Math.trunc(positionX) + shapeOffset, j - Math.trunc(positionY) + shapeOffset);
          this.shapeDataOuter.add(i - Math.trunc(positionX) + shapeOffset, j - Math.trunc(positionY) + shapeOffset);
          continue;
        }
        st.flags[ii] &= ~1;
        if (st.wall[ii] !== wallType) chWallSheet(ctx.st, i, j, wallType, false, wallPaint);
      }
    }
  }
  protected addHallwaySpaceFix(ctx: DualLayoutCtx, px: number, py: number, n5: number, n6: number, n7: number, n8: number,
    off: number, wallT: number, wP: number, gen: boolean): void {
    this.addHallwaySpace(ctx, px, py, n5, n6, n7, n8, off, wallT, wP, gen);
  }
  /** BiomeRoom_FinishRoom（:147-230）。 */
  protected finishRoom(ur: UnifiedRandom, ctx: DualLayoutCtx, ol: number, orr: number, ot: number, ob: number, treatAsSurface = false): void {
    const skip: number[] = [];
    const style = this.settings.style.Style;
    for (let i = ol; i < orr; i++) {
      skip.length = 0;
      for (let j = ot; j < ob; j++) {
        const st = ctx.st;
        const idxS = skip.indexOf(j);
        if (idxS >= 0) { skip.splice(idxS, 1); continue; }
        if (!this.inner.contains(i, j)) continue;
        if (!st.inBounds(i, j)) continue;
        const ii = st.idx(i, j);
        switch (style) {
          case 4:
            if (treatAsSurface) this.grassySurface(ur, st, skip, i, j, 25, 23);
            if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
            break;
          case 5:
            if (treatAsSurface) this.grassySurface(ur, st, skip, i, j, 203, 199);
            if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
            break;
          case 6:
            if (treatAsSurface) this.grassySurface(ur, st, skip, i, j, 117, 109);
            if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
            break;
          case 2:
            if (treatAsSurface) this.snowySurface(ur, st, skip, i, j);
            if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
            break;
          case 3:
            if (treatAsSurface) this.sandySurface(ur, st, skip, i, j);
            if (st.liquid[ii] > 0) st.liquidType[ii] = 2;      // liquidType(1)=JS+1
            break;
          default:
            if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
            break;
        }
      }
    }
  }
  private grassySurface(ur: UnifiedRandom, st: TileStore, skip: number[], tileX: number, tileY: number, repTile: number, grassTile: number): void {
    // BiomeRoom_GrassySurface（:232-264）；Main.tile[tileX,tileY-1].active() 门
    if (tileY <= 0 || !st.inBounds(tileX, tileY)) return;
    const ii = st.idx(tileX, tileY);
    const aboveActive = st.inBounds(tileX, tileY - 1) ? (st.flags[st.idx(tileX, tileY - 1)] & 1) !== 0 : true;
    if (aboveActive || !(st.flags[ii] & 1) || sheetOfInternal(st.type[ii]) !== repTile) return;
    if (worldGenTileExposedToAir(st, tileX, tileY)) chTileSheet(st, tileX, tileY, grassTile, false, -1);
    else chTileSheet(st, tileX, tileY, 0, false, -1);
    const n = 5 + ur.nextInt(4);
    for (let k = 0; k < n; k++) {
      const ny = tileY + k;
      if (!st.inBounds(tileX, ny)) continue;
      const i2 = st.idx(tileX, ny);
      if ((st.flags[i2] & 1) && sheetOfInternal(st.type[i2]) === repTile) {
        skip.push(ny);
        st.liquid[i2] = 0;
        if (worldGenTileExposedToAir(st, tileX, ny)) chTileSheet(st, tileX, ny, grassTile, false, -1);
        else chTileSheet(st, tileX, ny, 0, false, -1);
      }
    }
  }
  private sandySurface(ur: UnifiedRandom, st: TileStore, skip: number[], tileX: number, tileY: number): void {
    if (tileY <= 0 || !st.inBounds(tileX, tileY)) return;
    const ii = st.idx(tileX, tileY);
    const aboveActive = st.inBounds(tileX, tileY - 1) ? (st.flags[st.idx(tileX, tileY - 1)] & 1) !== 0 : true;
    if (aboveActive || !(st.flags[ii] & 1) || sheetOfInternal(st.type[ii]) !== 396) return;
    if (blockBelowMakesSandConvertIntoHardenedSand(st, tileX, tileY)) chTileSheet(st, tileX, tileY, 397, false, -1);
    else chTileSheet(st, tileX, tileY, 53, false, -1);
    const n = 5 + ur.nextInt(4);
    for (let k = 0; k < n; k++) {
      const ny = tileY + k;
      if (!st.inBounds(tileX, ny)) continue;
      const i2 = st.idx(tileX, ny);
      if ((st.flags[i2] & 1) && sheetOfInternal(st.type[i2]) === 396) {
        skip.push(ny);
        st.liquid[i2] = 0;
        if (blockBelowMakesSandConvertIntoHardenedSand(st, tileX, ny)) chTileSheet(st, tileX, ny, 397, false, -1);
        else chTileSheet(st, tileX, ny, 53, false, -1);
      }
    }
  }
  private snowySurface(ur: UnifiedRandom, st: TileStore, skip: number[], tileX: number, tileY: number): void {
    if (tileY <= 0 || !st.inBounds(tileX, tileY)) return;
    const ii = st.idx(tileX, tileY);
    const aboveActive = st.inBounds(tileX, tileY - 1) ? (st.flags[st.idx(tileX, tileY - 1)] & 1) !== 0 : true;
    if (aboveActive || !(st.flags[ii] & 1) || sheetOfInternal(st.type[ii]) !== 161) return;
    chTileSheet(st, tileX, tileY, 147, false, -1);
    const n = 5 + ur.nextInt(4);
    for (let k = 0; k < n; k++) {
      const ny = tileY + k;
      if (!st.inBounds(tileX, ny)) continue;
      const i2 = st.idx(tileX, ny);
      if ((st.flags[i2] & 1) && sheetOfInternal(st.type[i2]) === 161) {
        skip.push(ny);
        st.liquid[i2] = 0;
        chTileSheet(st, tileX, ny, 147, false, -1);
      }
    }
  }
}

/** 内部 id → vanilla sheet。 */
function sheetOfInternal(internal: number): number {
  return TILE_INTERNAL_SHEET_REV.get(internal) ?? -1;
}
const TILE_INTERNAL_SHEET_REV = new Map<number, number>();

// —— BiomeSquare（BiomeSquareDungeonRoom.cs 全量；无 ShapeData 族）——
class DBiomeSquareRoom extends DBiomeRoomBase {
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    const style = this.settings.style;
    let px = this.settings.x + 0.0, py = this.settings.y + 0.0;
    let num = biomeRoomInnerSize(style, ctx.w);
    let num2 = 8;
    let num3 = biomeRoomOuterSize(style, ctx.w);
    if (this.calculated) {
      // C# Processed 支：复用 Calculate 相位定格值（specialized 换皮改 style 后仍保原尺寸）
      px = this.position.x; py = this.position.y;
      num = this.roomInnerSize; num3 = this.roomOuterSize; num2 = this.wallDepth;
    }
    const minPad = 20;
    const minX = Math.max(minPad + num2, Math.min(ctx.w - minPad - num2, Math.trunc(px) - num));
    const maxX = Math.max(minPad + num2, Math.min(ctx.w - minPad - num2, Math.trunc(px) + num));
    const minY = Math.max(minPad + num2, Math.min(ctx.h - minPad - num2, Math.trunc(py) - num));
    const maxY = Math.max(minPad + num2, Math.min(ctx.h - minPad - num2, Math.trunc(py) + num));
    const ox0 = Math.max(minPad, Math.min(ctx.w - minPad, Math.trunc(px) - num3));
    const ox1 = Math.max(minPad, Math.min(ctx.w - minPad, Math.trunc(px) + num3));
    const oy0 = Math.max(minPad, Math.min(ctx.h - minPad, Math.trunc(py) - num3));
    const oy1 = Math.max(minPad, Math.min(ctx.h - minPad, Math.trunc(py) + num3));
    this.inner.set(minX, minY, maxX, maxY);
    this.outer.set(ox0, oy0, ox1, oy1);
    data.dungeonBounds.updBox(ox0, oy0, ox1, oy1);
    ctx.jsBoundUpd(ox0, oy0, ox1, oy1);
    if (generating) {
      const st = ctx.st;
      const tilePaint = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (style.TilePaintColor ?? 0);
      const wallPaint = this.settings.overridePaintWall > -1 ? this.settings.overridePaintWall : (style.WallPaintColor ?? 0);
      for (let k = ox0; k < ox1; k++) {
        for (let l = oy0; l < oy1; l++) {
          if (!st.inBounds(k, l)) continue;
          const ii = st.idx(k, l);
          if (st.flags[ii] & 1 && (sheetOfInternal(st.type[ii]) === 484 || sheetOfInternal(st.type[ii]) === 485)) {
            st.flags[ii] &= ~1;
          }
          if (this.inner.contains(k, l)) {
            if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
            chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
            st.flags[ii] &= ~1;
          } else {
            if (st.liquid[ii] > 0) st.liquid[ii] = 0;
            chTileSheet(st, k, l, style.BrickTileType, true, tilePaint);
            chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
          }
        }
      }
      this.finishRoom(ur, ctx, ox0, ox1, oy0, oy1);
    }
    this.roomInnerSize = num; this.roomOuterSize = num3; this.wallDepth = num2;
    this.position = { x: px, y: py };
    this.inner.calc(); this.outer.calc();
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}


// —— BiomeRugged（BiomeRuggedDungeonRoom.cs 全量）——
class DBiomeRuggedRoom extends DBiomeRoomBase {
  constructor(settings: RoomSettingsBase, w: number, h: number) {
    super(settings, w, h);
    this.shapeDataInner = new ShapeData();
    this.shapeDataOuter = new ShapeData();
  }
  /** ★IIIII109b 移窗（BiomeRuggedDungeonRoom.cs:54-71 GenerateEarlyDungeonFeaturesInRoom）：
   *  rugged 钟乳石/浮石族属【早特征窗】（cs:588-591 每房循环内、主流掷!）而非
   *  PreHallways 窗——cs BiomeDungeonRoom.GeneratePreHallwaysDungeonFeaturesInRoom
   *  是**空体**（:36-38），旧 JS 把本面挂在 PRH 循环=窗位错置（x86 PRH 净 +3,500
   *  vs JS +344 的定罪主体之一，IIIII108c §②移交项）。
   *  门 ON=早特征窗经 dualRuggedEarlyFeatures（载荷驱动,DungeonPass 调用），本面整跳；
   *  门 OFF=维持 108c 前账面（错置窗原样保留）。 */
  generatePreHallwaysFeatures(data: DualDungeonData, ctx: DualLayoutCtx): void {
    if (i138EarlyGate()) return;
    void data;
    const style = this.settings.style;
    const tilePaint = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (style.TilePaintColor ?? 0);
    generateSpeleothemsInArea(ctx, this.inner.L, this.inner.T, this.inner.width, this.inner.height,
      Math.max(1, Math.trunc(this.inner.width / 6)), style.BrickTileType, tilePaint);
    const platStyle = getPlatformStyleMain(ctx, style);
    generateFloatingRocksInArea(ctx, this.inner.L, this.inner.T, this.inner.width, this.inner.height,
      style.BrickTileType, true, platStyle, tilePaint, 7);
  }
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    const style = this.settings.style;
    let px = this.settings.x + 0.0, py = this.settings.y + 0.0;
    if (this.calculated) { px = this.position.x; py = this.position.y; }
    let num = biomeRoomInnerSize(style, ctx.w);
    let num2 = 8;
    let num3 = biomeRoomOuterSize(style, ctx.w);
    if (this.calculated) { num = this.roomInnerSize; num2 = this.wallDepth; num3 = this.roomOuterSize; px = this.position.x; py = this.position.y; }
    const minPad = 20;
    const n5 = Math.max(minPad + num2, Math.min(ctx.w - minPad - num2, Math.trunc(px) - num));
    const n6 = Math.max(minPad + num2, Math.min(ctx.w - minPad - num2, Math.trunc(px) + num));
    const n7 = Math.max(minPad + num2, Math.min(ctx.h - minPad - num2, Math.trunc(py) - num));
    const n8 = Math.max(minPad + num2, Math.min(ctx.h - minPad - num2, Math.trunc(py) + num));
    const n9 = Math.max(minPad, Math.min(ctx.w - minPad, Math.trunc(px) - num3));
    const n10 = Math.max(minPad, Math.min(ctx.w - minPad, Math.trunc(px) + num3));
    const n11 = Math.max(minPad, Math.min(ctx.h - minPad, Math.trunc(py) - num3));
    const n12 = Math.max(minPad, Math.min(ctx.h - minPad, Math.trunc(py) + num3));
    this.inner.set(n5, n7, n6, n8);
    this.outer.set(n9, n11, n10, n12);
    data.dungeonBounds.updBox(n9, n11, n10, n12);
    ctx.jsBoundUpd(n9, n11, n10, n12);
    const st = ctx.st;
    const tilePaint = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (style.TilePaintColor ?? 0);
    const wallPaint = this.settings.overridePaintWall > -1 ? this.settings.overridePaintWall : (style.WallPaintColor ?? 0);
    const num13 = n8 - n7;
    const num14 = Math.max(8, num2);
    for (let k = n9; k < n10; k++) {
      const prX = fr(fr(Math.max(0, Math.min(1, fr(fr(k - n9) / fr(Math.max(1, fr(n10 - n9))))))));
      // num16=MultiLerp(...,1,.95,.85,.25,.1,.05,0,.05,.1,.25,.85,.95,1)
      const p16 = multiLerpF(prX, [1, 0.95, 0.85, 0.25, 0.1, 0.05, 0, 0.05, 0.1, 0.25, 0.85, 0.95, 1]);
      const n17f = fr(Math.max(1, Math.trunc(num13 / 16)) + fr(Math.max(1, Math.trunc(num13 / 4))) * p16);
      const n18 = fr(n7 + n17f + ur.nextInt(3));
      const n19 = fr(n18 - num14);
      const n20 = fr(fr(n8) - n17f - 1 - ur.nextInt(3));
      const n21 = fr(n20 + num14);
      for (let l = n11; l < n12; l++) {
        if (!st.inBounds(k, l)) continue;
        const ii = st.idx(k, l);
        if (generating && (sheetOfInternal(st.type[ii]) === 484 || sheetOfInternal(st.type[ii]) === 485) && (st.flags[ii] & 1)) {
          st.flags[ii] &= ~1;
        }
        if (l < n19 || l > n21) continue;
        if (k < n9 + num2 - 1 || k >= n10 - num2 + 1 || (l >= n19 && l <= n18) || (l >= n20 && l <= n21)) {
          if (!generating) { this.shapeDataOuter!.add(k - Math.trunc(px), l - Math.trunc(py)); continue; }
          chTileSheet(st, k, l, style.BrickTileType, false, tilePaint);
          if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
          chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
        } else if (this.inner.contains(k, l)) {
          if (!generating) {
            this.shapeDataOuter!.add(k - Math.trunc(px), l - Math.trunc(py));
            this.shapeDataInner!.add(k - Math.trunc(px), l - Math.trunc(py));
            continue;
          }
          if (st.liquid[ii] > 0) st.liquidType[ii] = 1;
          chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
          st.flags[ii] &= ~1;
          if (st.inBounds(k, l)) st.paint[st.idx(k, l)] = 0;   // ClearBlockPaintAndCoating 块漆域
        } else if (!generating) {
          this.shapeDataOuter!.add(k - Math.trunc(px), l - Math.trunc(py));
        } else {
          if (st.liquid[ii] > 0) st.liquid[ii] = 0;
          chTileSheet(st, k, l, style.BrickTileType, true, tilePaint);
          chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
        }
      }
    }
    this.addHallwaySpaceFix(ctx, px, py, n5, n6, n7, n8, 0, style.BrickWallType, wallPaint, generating);
    this.finishRoom(ur, ctx, n9, n10, n11, n12);
    this.roomInnerSize = num; this.roomOuterSize = num3; this.wallDepth = num2;
    this.position = { x: px, y: py };
    this.inner.calc(); this.outer.calc();
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}

// —— BiomeStructured（BiomeStructuredDungeonRoom.cs 全量；windows/pillars 早期特征属
//     DungeonGlobalEarlyDualDungeonFeatures 批,本批不接）——
class DBiomeStructuredRoom extends DBiomeRoomBase {
  constructor(settings: RoomSettingsBase, w: number, h: number) {
    super(settings, w, h);
    this.shapeDataInner = new ShapeData();
    this.shapeDataOuter = new ShapeData();
  }
  /** GetXPercent/GetYPercent（:236-256）float 域。 */
  private getXPercent(variant: number, percentile: number): number {
    switch (variant) {
      case 1: return multiLerpF(wrappedLerpF(0, 1, percentile), [0, 0.9, 0.25, 0]);
      case 2: case 3: return 0;
      default: return multiLerpF(wrappedLerpF(0, 1, percentile), [0.1, 0.5, 0.1]);
    }
  }
  private getYPercent(variant: number, percentile: number): number {
    switch (variant) {
      case 1: return 0;
      case 2: return multiLerpF(wrappedLerpF(0, 1, percentile), [1, 1, 0.5, 0, 0.5, 0.25, 0.1]);
      case 3: return multiLerpF(wrappedLerpF(0, 1, percentile), [0, 0.25, 0.6, 0.25, 0, 0, 0.3, 0.4, 0.3, 0, 0]);
      default: return multiLerpF(wrappedLerpF(0, 1, percentile), [1, 0, 0.5, 0.5, 0, 0, 0.5]);
    }
  }
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    const style = this.settings.style;
    let px = this.settings.x + 0.0, py = this.settings.y + 0.0;
    if (this.calculated) { px = this.position.x; py = this.position.y; }
    let num = biomeRoomInnerSize(style, ctx.w);
    let num2 = 8;
    let num3 = biomeRoomOuterSize(style, ctx.w);
    if (this.calculated) { num = this.roomInnerSize; num2 = this.wallDepth; num3 = this.roomOuterSize; px = this.position.x; py = this.position.y; }
    const minPad = 20;
    const n5 = Math.max(minPad + num2, Math.min(ctx.w - minPad - num2, Math.trunc(px) - num));
    const n6 = Math.max(minPad + num2, Math.min(ctx.w - minPad - num2, Math.trunc(px) + num));
    const n7 = Math.max(minPad + num2, Math.min(ctx.h - minPad - num2, Math.trunc(py) - num));
    const n8 = Math.max(minPad + num2, Math.min(ctx.h - minPad - num2, Math.trunc(py) + num));
    const n9 = Math.max(minPad, Math.min(ctx.w - minPad, Math.trunc(px) - num3));
    const n10 = Math.max(minPad, Math.min(ctx.w - minPad, Math.trunc(px) + num3));
    const n11 = Math.max(minPad, Math.min(ctx.h - minPad, Math.trunc(py) - num3));
    const n12 = Math.max(minPad, Math.min(ctx.h - minPad, Math.trunc(py) + num3));
    this.inner.set(n5, n7, n6 - 1, n8 - 1);
    this.outer.set(n9, n11, n10 - 1, n12 - 1);
    data.dungeonBounds.updBox(n9, n11, n10 - 1, n12 - 1);
    ctx.jsBoundUpd(n9, n11, n10 - 1, n12 - 1);
    const st = ctx.st;
    const tilePaint = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (style.TilePaintColor ?? 0);
    const wallPaint = this.settings.overridePaintWall > -1 ? this.settings.overridePaintWall : (style.WallPaintColor ?? 0);
    const num13 = n10 - n9;
    const num14 = n12 - n11;
    const variant = ur.nextInt(4);
    const shapeAdd = 1;                                     // num15
    for (let k = n9; k < n10; k++) {
      const pctX = fr(Math.max(0, Math.min(1, fr(fr(k - n9) / fr(Math.max(1, fr(fr(n10) - 1 - n9)))))));
      const pctYRow = this.getYPercent(variant, pctX);
      const n18 = fr(Math.max(1, Math.trunc(num14 / 16)) + fr(Math.max(1, Math.trunc(num14 / 4))) * pctYRow);
      const n19f = fr(n7 + n18);
      const n20 = fr(n19f - num2);
      const n21f = fr(fr(n8) - n18 - 1);
      const n22 = fr(n21f + num2);
      for (let l = n11; l < n12; l++) {
        const pctY = fr(Math.max(0, Math.min(1, fr(fr(l - n11) / fr(Math.max(1, fr(fr(n12) - 1 - n11)))))));
        const pctXCol = this.getXPercent(variant, pctY);
        const n25 = fr(Math.max(1, Math.trunc(num13 / 4)) * pctXCol);
        const n26 = fr(n5 + n25);
        const n27 = fr(n26 - num2);
        const n28 = fr(fr(n6) - n25 - 1);
        const n29 = fr(n28 + num2);
        if (!st.inBounds(k, l)) continue;
        const ii = st.idx(k, l);
        if (generating && (sheetOfInternal(st.type[ii]) === 484 || sheetOfInternal(st.type[ii]) === 485) && (st.flags[ii] & 1)) {
          st.flags[ii] &= ~1;
        }
        if (l < n20 || l > n22 || k < n27 || k > n29) continue;
        if (k <= n9 + num2 - 1 || k >= n10 - num2 + 1 || (l >= n20 && l <= n19f) || (l >= n21f && l <= n22)
          || (k >= n27 && k <= n26) || (k >= n28 && k <= n29)) {
          if (!generating) { this.shapeDataOuter!.add(k - Math.trunc(px) + shapeAdd, l - Math.trunc(py) + shapeAdd); continue; }
          chTileSheet(st, k, l, style.BrickTileType, false, tilePaint);
          if (st.liquid[ii] > 0) { st.liquid[ii] = 0; st.liquidType[ii] = 1; }
          chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
        } else if (this.inner.contains(k, l)) {
          if (!generating) {
            this.shapeDataInner!.add(k - Math.trunc(px) + shapeAdd, l - Math.trunc(py) + shapeAdd);
            this.shapeDataOuter!.add(k - Math.trunc(px) + shapeAdd, l - Math.trunc(py) + shapeAdd);
            continue;
          }
          if (st.liquid[ii] > 0) { st.liquid[ii] = 0; st.liquidType[ii] = 1; }
          chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
          st.flags[ii] &= ~1;
          if (st.inBounds(k, l)) st.paint[st.idx(k, l)] = 0;
        } else if (!generating) {
          this.shapeDataOuter!.add(k - Math.trunc(px) + shapeAdd, l - Math.trunc(py) + shapeAdd);
        } else {
          if (st.liquid[ii] > 0) { st.liquid[ii] = 0; st.liquidType[ii] = 1; }
          chTileSheet(st, k, l, style.BrickTileType, true, tilePaint);
          chWallSheet(st, k, l, style.BrickWallType, false, wallPaint);
        }
      }
    }
    this.addHallwaySpaceFix(ctx, px, py, n5, n6, n7, n8, shapeAdd, style.BrickWallType, wallPaint, generating);
    this.finishRoom(ur, ctx, n9, n10, n11, n12);
    this.roomInnerSize = num; this.roomOuterSize = num3; this.wallDepth = num2;
    this.position = { x: px, y: py };
    this.inner.calc(); this.outer.calc();
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}

// —— LivingTree room（LivingTreeDungeonRoom.cs 全量）——
class DLivingTreeRoom extends DRoomBase {
  declare settings: LivingTreeRoomSettingsCls;
  private innerShape = new ShapeData();
  private outerShape = new ShapeData();
  private floodedN = 0;
  private positionsArr: { x: number; y: number }[] = [];
  floodedTileCount(): number { return this.floodedN; }
  protectionAt(_st: TileStore, x: number, y: number): number {
    // ★IIIII168 修正：守卫支 (calculated && !OuterBounds.Contains) 回落基类= None（曾误 Walls,
    //   LivingTreeDungeonRoom.cs:54-64 同族三杀之一）。
    if (this.calculated && !this.outer.contains(x, y)) return Protection.None;
    const p0 = this.positionsArr[0];
    if (!this.positionsArr.length || !this.outer.contains(x, y)) return Protection.None;
    if (!p0 || !this.outerShape.contains(x - p0.x, y - p0.y)) return Protection.None;
    return Protection.Walls;
  }
  isInsideRoom(st: TileStore, x: number, y: number): boolean {
    if (this.positionsArr.length === 0) return this.inner.contains(x, y);
    if (!this.inner.contains(x, y)) return false;
    const p0 = this.positionsArr[0]!;
    return this.innerShape.contains(x - p0.x, y - p0.y);
  }
  /** GeneratePreHallwaysDungeonFeaturesInRoom（:82-109）：三连垂叶簇。 */
  generatePreHallwaysFeatures(data: DualDungeonData, ctx: DualLayoutCtx): void {
    void data;
    const ur = new UnifiedRandom(this.settings.randomSeed);
    const style = this.settings.style;
    const paint = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (style.TilePaintColor ?? 0);
    let growthLength = Math.trunc(fr(fr(this.inner.height) * 0.1)) + ur.nextInt(4);
    let branchDensity = 2 + ur.nextInt(2);
    let leafDensity = 3 + ur.nextInt(4);
    generateHangingLeafCluster(ctx, ur, this.outer,
      { x: this.inner.centerX(), y: this.inner.T }, growthLength, branchDensity, leafDensity,
      style.BrickCrackedTileType, style.BrickTileType, paint, paint, true, true);
    growthLength = Math.trunc(fr(fr(this.inner.height) * 0.15)) + ur.nextInt(5);
    branchDensity = 3 + ur.nextInt(2);
    leafDensity = 4 + ur.nextInt(4);
    generateHangingLeafCluster(ctx, ur, this.outer,
      { x: this.inner.L + 2 + ur.nextInt(3), y: this.inner.T }, growthLength, branchDensity, leafDensity,
      style.BrickCrackedTileType, style.BrickTileType, paint, paint, true, true);
    growthLength = Math.trunc(fr(fr(this.inner.height) * 0.15)) + ur.nextInt(5);
    branchDensity = 3 + ur.nextInt(2);
    leafDensity = 4 + ur.nextInt(4);
    generateHangingLeafCluster(ctx, ur, this.outer,
      { x: this.inner.R - 2 - ur.nextInt(3), y: this.inner.T }, growthLength, branchDensity, leafDensity,
      style.BrickCrackedTileType, style.BrickTileType, paint, paint, true, true);
  }
  private phase(generating: boolean, data: DualDungeonData, ctx: DualLayoutCtx): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    const s = this.settings;
    const collected: { x: number; y: number }[] = [];
    let item = { x: s.x, y: s.y };
    if (this.calculated) item = this.positionsArr[0]!;
    else collected.push(item);
    let point = { x: item.x, y: item.y + Math.trunc(s.innerHeight / 2) };
    const numY = point.y - s.innerHeight;
    const innerWidth = s.innerWidth;
    const depth = s.depth;
    let num2 = innerWidth;              // 树干宽（逐行演化）
    const num3 = num2 + depth;
    this.outer.set(item.x, item.y, item.x, item.y);
    this.inner.set(item.x, item.y, item.x, item.y);
    this.outerShape.clear(); this.innerShape.clear();
    let idxPos = 1;
    while ((!this.processed && point.y > numY) || (this.processed && idxPos < this.positionsArr.length)) {
      this.outerShape.addBounds(point.x - num3 - item.x, point.y - num3 - item.y, point.x + num3 - item.x, point.y + num3 - item.y);
      this.innerShape.addBounds(point.x - num2 - item.x, point.y - num2 - item.y, point.x + num2 - item.x, point.y + num2 - item.y);
      if (!this.processed) collected.push({ x: point.x, y: point.y });
      this.generateSquareRoom(ctx, this.inner, this.outer, point.x, point.y, s.style, num2, num3, generating, generating);
      if (this.processed) {
        idxPos++;
        if (idxPos < this.positionsArr.length) point = this.positionsArr[idxPos]!;
      } else {
        if (point.y % 4 === 0) point.x += ur.nextInt(2) !== 0 ? 1 : -1;
        point.y--;
        // C# num2 不随行走变化——树干等宽列（InnerWidth 恒定）
        void num2;
      }
    }
    if (!this.processed) this.positionsArr = collected.slice();
    this.inner.calc(); this.outer.calc();
    this.floodedN = floodedCountOf(this.inner, this.innerShape, item.x, item.y);
  }
  calculateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.calculated = false; this.phase(false, data, ctx); this.calculated = true; }
  generateRoom(data: DualDungeonData, ctx: DualLayoutCtx): void { this.generated = false; this.phase(true, data, ctx); this.generated = true; }
}

// ── DungeonUtils 消费子集 ─────────────────────────────────────────

/** WorldGen.TileIsExposedToAir 等价（四邻空格任一 → true；本域粒度够）。 */
function worldGenTileExposedToAir(st: TileStore, x: number, y: number): boolean {
  const probe = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;
  for (const [dx, dy] of probe) {
    const nx = x + dx, ny = y + dy;
    if (!st.inBounds(nx, ny)) return true;
    if ((st.flags[st.idx(nx, ny)] & 1) === 0) return true;
  }
  return false;
}
/** WorldGen.BlockBelowMakesSandConvertIntoHardenedSand（同构近似：下方三格沙族判定）。 */
function blockBelowMakesSandConvertIntoHardenedSand(st: TileStore, x: number, y: number): boolean {
  for (let k = 1; k <= 3; k++) {
    const ny = y + k;
    if (!st.inBounds(x, ny)) return false;
    const i = st.idx(x, ny);
    if (!(st.flags[i] & 1)) continue;
    const sh = sheetOfInternal(st.type[i]);
    if (sh === 53 || sh === 397 || sh === 396) return true;
    return false;
  }
  return false;
}

/** GetPlatformStyle 主流掷侧（DungeonGenerationStyleData.cs:150-158）：空表→-1 不掷。 */
function getPlatformStyleMain(ctx: DualLayoutCtx, style: DungeonStyleData): number {
  if (style.PlatformItemTypes.length === 0) return -1;
  const item = style.PlatformItemTypes[ctx.rng.nextInt(style.PlatformItemTypes.length)]!;
  return item >= 0 ? item : -1;
}
/** RNG 主流 Next()。 */
function mainNext(ctx: DualLayoutCtx): number { return ctx.rng.vanilla.next(); }

/** FirstSolid（DU:532-562）：SolidTileAllowTop/BottomSlope 步进。 */
function firstSolid(st: TileStore, ceiling: boolean, px: number, py: number, bounds: DBoundsFull | null): { x: number; y: number } {
  let guard = ctxGuardMax(st);
  let cx = px, cy = py;
  do {
    guard--;
    if (guard <= 0) break;
    if (ceiling && solidAllowTopSlope(st, cx, cy)) return { x: cx, y: cy };
    if (!ceiling && solidAllowBottomSlope(st, cx, cy)) return { x: cx, y: cy };
    cy = ceiling ? cy - 1 : cy + 1;
  } while (cy > 10 && cy < st.h - 10 && (bounds === null || bounds.contains(cx, cy)));
  return { x: cx, y: cy };
}
function ctxGuardMax(_st: TileStore): number { return 1000000; }

function solidAllowTopSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!(st.flags[i] & 1)) return false;
  if ((st.wire[i] >>> 5) & 1) return false;
  const def = TILE_DEFS_BY_INTERNAL[st.type[i]];
  if (!def || !genSolidType(st.type[i])) return false;
  const slope = st.slope[i];
  const bottomSlope = slope === 3 || slope === 4;
  const isPlatform = PLATFORM_SHEET_SET.has(def.vanilla?.sheet ?? -1);
  if (isPlatform) return st.half[i] !== 0;
  return !bottomSlope;
}
function solidAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!(st.flags[i] & 1)) return false;
  if ((st.wire[i] >>> 5) & 1) return false;
  const def = TILE_DEFS_BY_INTERNAL[st.type[i]];
  if (!def) return false;
  if (!(genSolidType(st.type[i]) || !!def.vanilla && def.vanilla.solidTop === true)) return false;
  const slope = st.slope[i];
  const topSlope = slope === 1 || slope === 2;
  const isPlatform = PLATFORM_SHEET_SET.has(def.vanilla?.sheet ?? -1);
  if (isPlatform) return st.half[i] !== 0;
  if (topSlope) return false;
  return st.half[i] === 0;
}

import { TILE_DEFS } from '../../../data/tiles';
const TILE_DEFS_BY_INTERNAL: Array<{ vanilla?: { sheet?: number; solidTop?: boolean } }> = [];
(function initTileDefs(): void {
  for (let i = 0; i < TILE_DEFS.length; i++) {
    TILE_DEFS_BY_INTERNAL[i] = TILE_DEFS[i] as unknown as { vanilla?: { sheet?: number; solidTop?: boolean } };
    const sh = TILE_DEFS[i]?.vanilla?.sheet;
    if (typeof sh === 'number' && sh >= 0) TILE_INTERNAL_SHEET_REV.set(i, sh);
  }
})();
const PLATFORM_SHEET_SET = new Set([19, 427, 435, 436, 437, 438, 439]);

/** GenerateRockPlatform（DU:1408-1431）。 */
function generateRockPlatform(ctx: DualLayoutCtx, ur: RngLike, x: number, y: number, width: number, tileType: number, paint: number): void {
  const num = Math.trunc(width / 2);
  const num2 = Math.max(2, num + ur.nextInt(2));
  for (let i = 0; i < width; i++) {
    const nx = x + i - num;
    let hgt = num2;
    if (i === 0 || i === width - 1) hgt = Math.max(1, Math.trunc(hgt / 2));
    else if (i === 1 || i === width - 2) hgt = Math.max(2, Math.trunc(fr(fr(hgt) * fr(0.66))));
    for (let j = 0; j < hgt; j++) chTileSheet(ctx.st, nx, y + j, tileType, false, paint);
  }
}

/** GenerateFloatingRocksInArea（DU:1355-1407 全参版）。 */
function generateFloatingRocksInArea(
  ctx: DualLayoutCtx, x: number, y: number, width: number, height: number,
  tileType: number, includePlatform: boolean, platformStyle: number, paint: number, platformDistance = 7,
): void {
  const rng = new UnifiedRandomAdapter(ctx.rng);
  const data = ctx.data!;
  const num = Math.max(2, Math.trunc(Math.trunc((width + height) / 2) / platformDistance));
  let i = 0;
  let guard = 100;
  const num3 = x + Math.trunc(width / 2);
  const num4 = 8;
  let flag = true;
  for (; i < num; i++) {
    guard--;
    if (guard <= 0) break;
    const width2 = 4 + rng.nextInt(3);
    let n5 = x;
    let n6 = y;
    if (i % 2 === 0) {
      const halfW = Math.trunc(width / 2);
      n5 = !flag ? x + num4 + halfW + rng.nextInt(Math.max(1, halfW - num4 * 2))
        : x + num4 + rng.nextInt(Math.max(1, halfW - num4));
      flag = !flag;
    } else {
      n5 = x + num4 + rng.nextInt(width - num4 * 2);
    }
    n6 = y + num4 + Math.trunc(fr(fr(height - num4 * 2) * fr(i / num)));
    generateRockPlatform(ctx, rng, n5, n6, width2, tileType, paint);
    if (includePlatform && ctx.platSink) {
      const x2 = n5 < num3 ? n5 - 5 : n5 + 5;
      const num8 = n5 < x ? 0 : (n5 < num3 ? n5 - x : x + width - n5);
      // ★IIIII222：补 OverrideStyle（platformStyle>-1 时,DU.cs:1426-1428）与
      //   canPlaceHereCallback 盒投影（DU.cs:1422闭包=本函数参数区含端 [x,x+width]×[y,y+height]）
      ctx.platSink({ x: x2, y: n6, hall: false, hf: 0, force: true, maxLen: 5 + num8,
        os: platformStyle > -1 ? platformStyle : undefined,
        cb: [x, y, x + width, y + height] });
    }
    void platformStyle;
  }
}

/** GenerateSpeleothem（DU:1565-1605）。 */
function generateSpeleothem(ctx: DualLayoutCtx, ur: RngLike, x: number, yIn: number, widthIn: number, heightIn: number, tileType: number, paint: number): void {
  const st = ctx.st;
  let width = widthIn;
  if (width % 2 === 1) width++;
  const num = Math.trunc(width / 2);
  let height = heightIn;
  if (height <= -1) height = width * 2 + ur.nextInt(2);
  const num2 = Math.trunc(height / 2);
  let y = yIn - num2;
  if (!st.inBounds(x, y) || !(st.flags[st.idx(x, y)] & 1)) y++;
  // doorData 距离门（≤5 拒）：由 caller 域保证（本批 provider 布局阶段 doors 空）
  for (let j = 0; j <= width; j++) {
    const nx = x + j - num;
    let num4 = Math.trunc(wrappedLerpF(1, height, fr(j / width)));
    if (ur.nextInt(2) === 0) num4 += 2;
    const num5 = Math.trunc((height - num4) / 2);
    for (let k = 0; k < num4; k++) {
      chTileSheet(st, nx, y + k + num5, tileType, false, paint);
    }
  }
}

/** ★IIIII109b：rugged 早特征面（载荷驱动版,DungeonPass 早特征窗调用=cs:588-591 循环内）。
 *  自 PRH 错置窗迁回；PRH 的 rugged 支仅在 SW_I138_EARLY=0（前批账面）时保留。
 *  paint=cs byte? b 三元（Override>−1 ? Override : Style.TilePaintColor|null）——
 *  chTileSheet 的 paint>0 写门使 0/−1 与 cs null 同效。 */
export function dualRuggedEarlyFeatures(ctx: DualLayoutCtx, er: DualEarlyRoom): void {
  const width = er.R - er.L, height = er.B - er.T;
  const tilePaint = er.opt > -1 ? er.opt : (er.bPaint > -1 ? er.bPaint : 0);
  generateSpeleothemsInArea(ctx, er.L, er.T, width, height,
    Math.max(1, Math.trunc(width / 6)), er.brick, tilePaint);
  // GetPlatformStyle（DungeonGenerationStyleData.cs）同构：空表不掷、Next(len)→item。
  const platStyle = er.plat.length === 0 ? -1 : er.plat[ctx.rng.nextInt(er.plat.length)]!;
  generateFloatingRocksInArea(ctx, er.L, er.T, width, height,
    er.brick, true, platStyle, tilePaint, 7);
}

/** GenerateSpeleothemsInArea（DU:1442-1564）。 */
function generateSpeleothemsInArea(ctx: DualLayoutCtx, x: number, y: number, width: number, height: number, maxSpeleothems: number, tileType: number, paint: number): void {
  const rng = new UnifiedRandomAdapter(ctx.rng);
  const st = ctx.st;
  let i = 1;
  const num = maxSpeleothems - 1;
  let guard = 100;
  const yTop = y;
  const num3 = y + height;
  const num4 = y + Math.trunc(height / 2);
  const num5 = rng.nextInt(2);
  let sw = Math.trunc(fr(Math.max(fr(5), fr(width / Math.max(1, num)))));
  const sh = Math.trunc(height / 4);
  for (; i < num; i++) {
    guard--;
    if (guard <= 0) break;
    let width2 = sw + rng.nextInt(3);
    let n6 = x + Math.trunc(fr(fr(width) * fr(i / Math.max(1, num - 1))));
    let n7 = num4;
    const n8 = n6;
    const n9 = n7;
    let flag = (i + num5) % 2 === 0;
    if (rng.nextInt(3) === 0) flag = !flag;
    if (flag) {
      let guardN = Math.max(Math.trunc(fr(fr(width) * 1.5)), Math.trunc(fr(fr(height) * 1.5)));
      while (!st.inBounds(n6, n7) || (!(st.flags[st.idx(n6, n7)] & 1)) && n7 < num3) {
        guardN--;
        if (guardN <= 0) break;
        n7++;
        if (n7 >= ctx.h) break;
        if (st.inBounds(n6, n7) && (st.flags[st.idx(n6, n7)] & 1)) break;
      }
    } else {
      let guardN = Math.max(Math.trunc(fr(fr(width) * 1.5)), Math.trunc(fr(fr(height) * 1.5)));
      while ((!st.inBounds(n6, n7) || !(st.flags[st.idx(n6, n7)] & 1)) && n7 > yTop) {
        guardN--;
        if (guardN <= 0) break;
        n7--;
        if (n7 < 0) break;
        if (st.inBounds(n6, n7) && (st.flags[st.idx(n6, n7)] & 1)) break;
      }
    }
    let flag2 = true;
    if (Math.abs(num4 - n7) < 10) flag2 = false;
    if (flag2) generateSpeleothem(ctx, rng, n6, n7, width2, sh + rng.nextInt(3), tileType, paint);
    if (rng.nextInt(3) !== 0) continue;
    width2 = sw + rng.nextInt(3);
    n6 = n8;
    n7 = n9;
    if (!flag) {
      let guardN = Math.max(Math.trunc(fr(fr(width) * 1.5)), Math.trunc(fr(fr(height) * 1.5)));
      while (!st.inBounds(n6, n7) || (!(st.flags[st.idx(n6, n7)] & 1)) && n7 < num3) {
        guardN--;
        if (guardN <= 0) break;
        n7++;
        if (n7 >= ctx.h) break;
        if (st.inBounds(n6, n7) && (st.flags[st.idx(n6, n7)] & 1)) break;
      }
    } else {
      let guardN = Math.max(Math.trunc(fr(fr(width) * 1.5)), Math.trunc(fr(fr(height) * 1.5)));
      while ((!st.inBounds(n6, n7) || !(st.flags[st.idx(n6, n7)] & 1)) && n7 > yTop) {
        guardN--;
        if (guardN <= 0) break;
        n7--;
        if (n7 < 0) break;
        if (st.inBounds(n6, n7) && (st.flags[st.idx(n6, n7)] & 1)) break;
      }
    }
    flag2 = true;
    if (Math.abs(num4 - n7) < 10) flag2 = false;
    if (flag2) generateSpeleothem(ctx, rng, n6, n7, width2, sh + rng.nextInt(3), tileType, paint);
  }
}

/** GenerateHangingLeafCluster（DU:563-614）。 */
function generateHangingLeafCluster(
  ctx: DualLayoutCtx, ur: UnifiedRandom, bounds: DBoundsFull, startPoint: { x: number; y: number },
  growthLengthIn: number, branchDensity: number, leafDensity: number,
  leafType: number, woodType: number, leafPaint: number, woodPaint: number,
  goDown: boolean, includeVines: boolean,
): void {
  void includeVines;
  const st = ctx.st;
  let cur = { x: startPoint.x, y: startPoint.y };
  cur = firstSolid(st, goDown, cur.x, cur.y, bounds);
  const anchor = { ...cur };
  let savedPt: { x: number; y: number } | null = null;
  let growthLength = growthLengthIn;
  const totalLen = growthLengthIn;
  const stepDir = goDown ? 1 : -1;
  while (growthLength > 0) {
    const yy = cur.y;
    const ratio = fr(fr(growthLength) / fr(totalLen));
    if (!savedPt && ratio > fr(0.65)) savedPt = { ...cur };
    const branches = Math.trunc(lerpN(0.0, branchDensity, ratio));
    for (let i = -branches; i <= branches; i++) {
      chTileSheet(st, cur.x + i, yy, woodType, false, woodPaint);
    }
    cur.y += stepDir;
    growthLength--;
  }
  let offset = ur.nextInt(3);
  if (!goDown) offset *= -1;
  cur = savedPt
    ? { x: savedPt.x, y: savedPt.y + offset }
    : { x: anchor.x, y: anchor.y + Math.trunc(fr(fr(totalLen) * fr(0.65))) + offset };
  const leavesTotal = leafDensity * 2 + 3;
  let remain = leavesTotal;
  while (remain > 0) {
    const yy = cur.y;
    const percent = fr(fr(remain) / fr(leavesTotal));
    const span = Math.trunc(wrappedLerpF(1, leafDensity, percent));
    for (let j = -span; j <= span; j++) {
      const nx = cur.x + j;
      if (!st.inBounds(nx, yy)) continue;
      const ii = st.idx(nx, yy);
      if (!(st.flags[ii] & 1)) chTileSheet(st, nx, yy, leafType, false, leafPaint);
    }
    cur.y += stepDir;
    remain--;
  }
}

// ── 大厅设置/基类 ──────────────────────────────────────────────────

class HallSettingsBase {
  hallType: number = DPHallType.Legacy;
  randomSeed = 0;
  style!: DungeonStyleData;
  overridePaintTile = -1;
  overridePaintWall = -1;
  crackedBrickChance = 0.166;
  placeOverProtectedBricks = false;
  zigzagChance = 0.66;
  forceStyleDP = false;
  carveOnly = false;
}
class StairwellHallSettings extends HallSettingsBase {
  constructor() { super(); this.crackedBrickChance = 0.0; }
  maxDistFromLine = 20;
  pointVariance = 4;
  innerBoundsSize = 3;
  outerBoundsSize = 8;
  gradient = 0.35;
  isEntranceHall = false;
}
class RegularHallSettingsCls extends HallSettingsBase {
  overrideInnerBoundsSize = 0;
  overrideOuterBoundsSize = 0;
}
class SineHallSettingsCls extends HallSettingsBase {
  magnitude = 1;
  iterations = 1;
  flipSine = false;
}
class LegacyHallSettingsCls extends HallSettingsBase {
  overrideStrength = 0;
  overrideSteps = 0;
  forceHorizontal = false;
  overrideITExRatio = 0;
  overrideStartPos: V2 | null = null;
  overrideEndPos: V2 | null = null;
}

abstract class DHallBase {
  settings!: HallSettingsBase;
  calculated = false;
  generated = false;
  bounds: DBoundsFull;
  startPosition: V2 = v2(0, 0);
  endPosition: V2 = v2(0, 0);
  startDirection: V2 = v2(0, 0);
  endDirection: V2 = v2(0, 0);
  crackedBrick = false;
  constructor(settings: HallSettingsBase, w: number, hgt: number) {
    this.settings = settings;
    this.bounds = new DBoundsFull(w, hgt);
  }
  get processed(): boolean { return this.calculated ? true : this.generated; }
  calculateHall(_data: DualDungeonData, _ctx: DualLayoutCtx, _sx: number, _sy: number, _ex: number, _ey: number): void {}
  generateHallData(_data: DualDungeonData, _ctx: DualLayoutCtx): void {}
  canPlaceHallTile(st: TileStore, x: number, y: number, sheetTileType: number, sheetCrackedType: number): boolean {
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    const ctxTier = __tierRef();
    if (this.settings.carveOnly) return false;
    if (ctxTier.isDungeonWall(st.wall[i])) {
      if (st.flags[i] & 1) {
        // IsHigherOrEqualTieredDungeonTile(data,tile.type,tileType,-1,style)（Halls/DungeonHall.cs:227）
        const higherEq = isHigherOrEqualTieredDungeonTile(
          _gvHolder!, sheetOfInternal(st.type[i]), sheetTileType,
          -1, this.settings.style.Style, true,
          (t) => t > 0 && VANILLA_TILE_DUNGEON.has(t));
        if (!higherEq) return sheetOfInternal(st.type[i]) !== sheetCrackedType;
        return false;
      }
      return false;
    }
    return true;
  }
  canRemoveHallTile(st: TileStore, x: number, y: number, sheetCrackedType: number): boolean {
    if (!st.inBounds(x, y)) return true;
    const i = st.idx(x, y);
    if (!(st.flags[i] & 1)) return true;
    if (__isDual() && sheetOfInternal(st.type[i]) === sheetCrackedType) return false;
    return true;
  }
}

let _dualFlag = false;
function setIsDual(v: boolean): void { _dualFlag = v; }
function __isDual(): boolean { return _dualFlag; }
let _tierGlobal: TierCtx | null = null;
function setTierGlobal(t: TierCtx | null): void { _tierGlobal = t; }
function __tierRef(): TierCtx {
  return _tierGlobal ?? {
    higherOrEqualWall: () => false,
    isDungeonWall: () => false,
  };
}
/** DungeonHall.CanPlaceTileAt（Halls/DungeonHall.cs:217-236）的 tile-tier 半边：
 *  IsHigherOrEqualTieredDungeonTile 在 dual 域多风格循环——经 getTierFor 全式实现。 */

/** DungeonHall.GenerateDungeonSquareHall（:97-215）全量。 */
function generateSquareHall(
  data: DualDungeonData, ctx: DualLayoutCtx, roomsInArea: DRoomBase[],
  curX: number, curY: number, style: DungeonStyleData, innerSize: number, outerSize: number,
  placeOverProtectedBricks: boolean, crackedBricks: boolean, clearPaintFirst: boolean, hall: DHallBase,
): void {
  const st = ctx.st;
  const brick = style.BrickTileType;
  const cracked = style.BrickCrackedTileType;
  const wallT = style.BrickWallType;
  const b = hall.settings.overridePaintTile > -1 ? hall.settings.overridePaintTile : (style.TilePaintColor ?? 0);
  const b2 = hall.settings.overridePaintWall > -1 ? hall.settings.overridePaintWall : (style.WallPaintColor ?? 0);
  const num = innerSize + outerSize;
  // ★IIIII172：spider 厅 stamp 迹（零掷;仅 Style==12 且开闸窗内;与 x86 DR|HST 同位）
  if (style.Style === 12 && _i172SpiderSeq >= 0) {
    _i172SpiderSeq++;
    drlMark(`DR|HST|q=${_i172SpiderSeq}|x=${curX}|y=${curY}|in=${innerSize}|out=${outerSize}`);
  }
  const cx = Math.trunc(curX), cy = Math.trunc(curY);
  for (let i = -num; i <= num; i++) {
    for (let j = -num; j <= num; j++) {
      const x2 = cx + i, y3 = cy + j;
      if (!st.inBounds(x2, y3)) continue;
      const ii = st.idx(x2, y3);
      let flag = true;
      let flag2 = true;
      const prot = highestProtectionFromPoint(st, x2, y3, roomsInArea);
      // ★IIIII172：spider 厅逐格写面迹（零掷;SW_I172_WTRACE=1 时启用;与 x86 DR|HW 同构）
      if (style.Style === 12 && _i172SpiderSeq >= 0 && (typeof process !== 'undefined' ? (__swProcessEnv ?? {}).SW_I172_WTRACE === '1' : undefined)) {
        drlMark(`DR|HW|q=${_i172SpiderSeq}|i=${i}|j=${j}|x=${x2}|y=${y3}|p=${prot}|t=${sheetOfInternal(st.type[ii])}|a=${st.flags[ii] & 1}|w=${st.wall[ii]}`);
      }
      if (prot === (Protection.TilesAndWalls as number)) continue;
      if (prot === Protection.Tiles) flag = false;
      if (prot === Protection.Walls && __tierRef().isDungeonWall(st.wall[ii])) flag2 = false;
      if (Math.abs(i) <= innerSize && Math.abs(j) <= innerSize) {
        if (!hall.canRemoveHallTile(st, x2, y3, cracked)) continue;
        if (crackedBricks) {
          if ((st.flags[ii] & 1 || !__tierRef().isDungeonWall(st.wall[ii])) && y3 < ctx.undergroundLayer) {
            if (hall.settings.carveOnly) clearTileOnly(st, x2, y3);
            else {
              if (flag) clearTileOnly(st, x2, y3);
              if (flag2) st.wall[ii] = 0;
              if (flag2) {
                if (clearPaintFirst && st.inBounds(x2, y3)) st.paintWall[st.idx(x2, y3)] = 0;
                chWallSheet(st, x2, y3, wallT, false, b2);
              }
              if (flag) {
                if (clearPaintFirst && st.inBounds(x2, y3)) st.paint[st.idx(x2, y3)] = 0;
                chTileSheet(st, x2, y3, cracked, false, b);
              }
            }
          }
        } else {
          clearTileOnly(st, x2, y3);
          if (!(hall.settings.carveOnly) && flag2) {
            if (clearPaintFirst && st.inBounds(x2, y3)) st.paintWall[st.idx(x2, y3)] = 0;
            chWallSheet(st, x2, y3, wallT, false, b2);
          }
        }
      } else if (hallCanPlaceAt(hall, st, x2, y3, brick, cracked, style)) {
        if (flag) clearTileOnly(st, x2, y3);
        if (flag2) st.wall[ii] = 0;
        if (flag) {
          if (clearPaintFirst && st.inBounds(x2, y3)) st.paint[st.idx(x2, y3)] = 0;
          chTileSheet(st, x2, y3, brick, false, b);
        }
        if (flag2 && i > -num && i < num && j > -num && j < num) {
          if (clearPaintFirst && st.inBounds(x2, y3)) st.paintWall[st.idx(x2, y3)] = 0;
          chWallSheet(st, x2, y3, wallT, false, b2);
        }
      }
      st.liquid[ii] = 0;
    }
  }
  void placeOverProtectedBricks;   // 未定罪消费面（protection 门已含）; 备案
}

function hallCanPlaceAt(hall: DHallBase, st: TileStore, x: number, y: number, brick: number, cracked: number, _style: DungeonStyleData): boolean {
  void _style;
  return hall.canPlaceHallTile(st, x, y, brick, cracked);
}

const VANILLA_TILE_DUNGEON = new Set([41, 43, 44, 677, 678, 679]);
/** Main.wallDungeon 基线集（Main.cs:10507-10513：7/8/9+94-99,不含神庙墙 87）。 */
const VANILLA_WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
let _gvHolder: DungeonGenVars1457 | null = null;
function setGvHolder(gv: DungeonGenVars1457, dual: boolean): void { _gvHolder = gv; void dual; }
/** ★IIIII172：spider 厅 stamp 迹序号（s 环开闸清零;<0=关闸,零开销） */
let _i172SpiderSeq = -1;

/** GetHighestProtectionTypeFromPoint（DU:1705-1724）。 */
function highestProtectionFromPoint(st: TileStore, x: number, y: number, rooms: DRoomBase[]): number {
  let p: number = Protection.None;
  for (const rm of rooms) {
    switch (rm.protectionAt(st, x, y)) {
      case Protection.Tiles:
        p = p !== Protection.Walls ? Protection.Tiles : Protection.TilesAndWalls;
        break;
      case Protection.Walls:
        p = p !== Protection.Tiles ? Protection.Walls : Protection.TilesAndWalls;
        break;
      case Protection.TilesAndWalls as number:
        p = Protection.TilesAndWalls;
        break;
    }
    if (p === Protection.TilesAndWalls) break;
  }
  return p;
}

/** GetAllRoomsInSpots（DU:1774-1796）三点取样。 */
function getAllRoomsInSpots(rooms: DRoomBase[], sx: number, sy: number, ex2: number, ey2: number, fluff: number): DRoomBase[] {
  const p1x = Math.trunc(sx), p1y = Math.trunc(sy);
  const p2x = Math.trunc((ex2 - sx) / 2), p2y = Math.trunc((ey2 - sy) / 2);
  const p3x = Math.trunc(ex2), p3y = Math.trunc(ey2);
  const out: DRoomBase[] = [];
  for (const rm of rooms) {
    if (rm.outer.containsF(p1x, p1y, fluff) || rm.outer.containsF(p2x, p2y, fluff)
      || rm.outer.containsF(p3x, p3y, fluff)) out.push(rm);
  }
  return out;
}

// —— Regular hall（RegularDungeonHall.cs 全量）——
class DRegularHall extends DHallBase {
  declare settings: RegularHallSettingsCls;
  private run(data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number, generating: boolean): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    let val = v2(sx, sy);
    let cracked = false;
    if (this.settings.crackedBrickChance > 0.0) cracked = ur.nextDouble() <= this.settings.crackedBrickChance;
    let num = 3;
    let num2 = 8;
    if (this.settings.overrideInnerBoundsSize > 0) num = this.settings.overrideInnerBoundsSize;
    if (this.settings.overrideOuterBoundsSize > 0) num2 = this.settings.overrideOuterBoundsSize;
    const num3 = num + num2;
    const dx = ex2 - sx, dy = ey2 - sy;
    const dirv = safeNormalize(dx, dy, 1, 0);
    let steps = Math.trunc(Math.ceil(lenD(dx, dy) / lenD(dirv.x, dirv.y)));
    this.bounds.set(Math.trunc(sx), Math.trunc(sy), Math.trunc(sx), Math.trunc(sy));
    const roomsArea = getAllRoomsInSpots(data.rooms, sx, sy, ex2, ey2, num3);
    while (steps > 0 && inWorld10(ctx, Math.trunc(val.x + dirv.x), Math.trunc(val.y + dirv.y))) {
      if (!this.processed) {
        // C# 原文三参 (int)val.Y+num3 双写——**val.Y 版源码真态**，保形转录
        data.dungeonBounds.updBox(Math.trunc(val.x) - num3, Math.trunc(val.y) - num3,
          Math.trunc(val.y) + num3, Math.trunc(val.y) + num3);
        ctx.jsBoundUpd(Math.trunc(val.x) - num3, Math.trunc(val.y) - num3,
          Math.trunc(val.y) + num3, Math.trunc(val.y) + num3);
        this.bounds.updBox(Math.trunc(val.x) - num3, Math.trunc(val.y) - num3,
          Math.trunc(val.y) + num3, Math.trunc(val.y) + num3);
      }
      if (generating) {
        generateSquareHall(data, ctx, roomsArea, val.x, val.y, this.settings.style, num, num2,
          this.settings.placeOverProtectedBricks, cracked, false, this);
      }
      val = v2(val.x + dirv.x, val.y + dirv.y);
      steps--;
    }
    data.genPosX = Math.trunc(ex2);
    data.genPosY = Math.trunc(ey2);
    this.startPosition = v2(sx, sy);
    this.endPosition = v2(ex2, ey2);
    this.startDirection = v2(dirv.x, dirv.y);
    this.endDirection = v2(dirv.x, dirv.y);
    this.crackedBrick = cracked;
    this.bounds.calc();
  }
  calculateHall(data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number): void {
    this.calculated = false; this.run(data, ctx, sx, sy, ex2, ey2, false); this.calculated = true;
  }
  generateHallData(data: DualDungeonData, ctx: DualLayoutCtx): void { this.run(data, ctx, this.startPosition.x, this.startPosition.y, this.endPosition.x, this.endPosition.y, true); this.generated = true; }
}

function inWorld10(ctx: DualLayoutCtx, x: number, y: number): boolean {
  return x >= 10 && y >= 10 && x < ctx.w - 10 && y < ctx.h - 10;
}

// —— Sine hall（SineDungeonHall.cs 全量；float/ double 混合域照 C#）——
class DSineHall extends DHallBase {
  declare settings: SineHallSettingsCls;
  potentialPlatformPoints: Array<{ p: V2; d: V2 }> = [];
  private run(data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number, generating: boolean): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    let val = v2(sx, sy);
    let cracked = false;
    if (this.settings.crackedBrickChance > 0.0) cracked = ur.nextDouble() <= this.settings.crackedBrickChance;
    const num = 3;
    const num2 = 8;
    const num3 = num + num2;
    const dx = ex2 - sx, dy = ey2 - sy;
    const dirv = safeNormalize(dx, dy, 1, 0);
    let steps = Math.trunc(Math.ceil(lenD(dx, dy) / lenD(dirv.x, dirv.y)));
    const num5 = steps;
    this.bounds.set(Math.trunc(sx), Math.trunc(sy), Math.trunc(sx), Math.trunc(sy));
    const fluffN = Math.trunc(fr(num * fr(this.settings.magnitude))) + num2;
    const roomsArea = getAllRoomsInSpots(data.rooms, sx, sy, ex2, ey2, fluffN);
    // v2=(Vector2.UnitY*magnitude).ToVector2D() → RotatedBy(val3.ToRotation())
    let vx0 = fr(0 * fr(this.settings.magnitude));   // UnitY.y=1 → (0,mag)
    void vx0;
    const v2f = fF(0, fr(this.settings.magnitude));
    const rotAngle = Math.atan2(dirv.y, dirv.x);      // Vector2D.ToRotation
    const rotF = frot(v2f, rotAngle);
    let ampX = rotF.x; let ampY = rotF.y;             // double 域投影
    const stepAng = fr(fr(fr(this.settings.iterations) / fr(num5)) * fr(Math.PI * 2));
    let num6 = 0;
    let num7 = 0;
    while (steps > 0) {
      const sinV = Math.sin(num7);
      const offX = ampX * sinV, offY = ampY * sinV;
      const px = this.settings.flipSine ? val.x - offX : val.x + offX;
      const py = this.settings.flipSine ? val.y - offY : val.y + offY;
      if (!inWorld10(ctx, Math.trunc(px + dirv.x), Math.trunc(py + dirv.y))) break;
      if (!this.processed) {
        data.dungeonBounds.updBox(Math.trunc(px) - num3, Math.trunc(py) - num3,
          Math.trunc(py) + num3, Math.trunc(py) + num3);
        ctx.jsBoundUpd(Math.trunc(px) - num3, Math.trunc(py) - num3,
          Math.trunc(py) + num3, Math.trunc(py) + num3);
        this.bounds.updBox(Math.trunc(px) - num3, Math.trunc(py) - num3,
          Math.trunc(py) + num3, Math.trunc(py) + num3);
      }
      if (generating) {
        generateSquareHall(data, ctx, roomsArea, px, py, this.settings.style, num, num2,
          this.settings.placeOverProtectedBricks, cracked, false, this);
      }
      val = v2(val.x + dirv.x, val.y + dirv.y);
      num6 = fr(num6 + stepAng);
      num7 = fr(num7 + stepAng);
      if (num6 >= fr(0.5)) {
        num6 = 0;
        if (!this.processed && generating !== undefined) {
          this.potentialPlatformPoints.push({ p: v2(val.x, val.y), d: v2(offX, offY) });
        }
      }
      steps--;
    }
    data.genPosX = Math.trunc(ex2); data.genPosY = Math.trunc(ey2);
    this.startPosition = v2(sx, sy);
    this.endPosition = v2(ex2, ey2);
    this.startDirection = v2(dirv.x, dirv.y);
    this.endDirection = v2(dirv.x, dirv.y);
    this.crackedBrick = cracked;
    this.bounds.calc();
  }
  calculateHall(data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number): void {
    this.calculated = false; this.run(data, ctx, sx, sy, ex2, ey2, false); this.calculated = true;
  }
  generateHallData(data: DualDungeonData, ctx: DualLayoutCtx): void { this.run(data, ctx, this.startPosition.x, this.startPosition.y, this.endPosition.x, this.endPosition.y, true); this.generated = true; }
}

// —— Stairwell hall（StairwellDungeonHall.cs 全量）——
class DStairwellHall extends DHallBase {
  declare settings: StairwellHallSettings;
  private segRoomsArea: DRoomBase[] = [];
  /** ★IIIII168：StairwellDungeonHall.CanPlaceTileAt 覆写（StairwellDungeonHall.cs:227-234）
   *  ——入口 stairwell 对已存在的 active dungeon 砖（Main.tileDungeon 静态集 41/43/44/677-679）
   *  或 dungeon 墙（Main.wallDungeon 静态集 7/8/9/94-99）拒写。曾整缺 ⇒ 入口竖井把
   *  先到的蓝砖(t41)覆写成本座砖(38)——x86 h0 post 对拍 9 格坐实（pre 双端全等、
   *  x86 零写=覆写门拒,JS 覆写=门缺）。 */
  canPlaceHallTile(st: TileStore, x: number, y: number, sheetTileType: number, sheetCrackedType: number): boolean {
    if (!st.inBounds(x, y)) return false;
    if ((this.settings as StairwellHallSettings).isEntranceHall) {
      const i = st.idx(x, y);
      if ((st.flags[i]! & 1 && VANILLA_TILE_DUNGEON.has(sheetOfInternal(st.type[i]!)))
        || VANILLA_WALL_DUNGEON.has(st.wall[i]!)) {
        return false;
      }
    }
    return super.canPlaceHallTile(st, x, y, sheetTileType, sheetCrackedType);
  }
  private run(data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number, generating: boolean): void {
    const ur = new UnifiedRandom(this.settings.randomSeed);
    this.bounds.set(Math.trunc(sx), Math.trunc(sy), Math.trunc(sx), Math.trunc(sy));
    let cracked = false;
    if (this.settings.crackedBrickChance > 0.0) cracked = ur.nextDouble() <= this.settings.crackedBrickChance;
    const innerSize = this.settings.innerBoundsSize;
    const outerSize = this.settings.outerBoundsSize;
    const fluffSum = innerSize + outerSize;
    const roomsArea = getAllRoomsInSpots(data.rooms, sx, sy, ex2, ey2, fluffSum + this.settings.maxDistFromLine);
    this.segRoomsArea = roomsArea;
    const vecX = ex2 - sx, vecY = ey2 - sy;
    const zig = calcZigZagSlope(v2(sx, sy), v2(ex2, ey2), this.settings.gradient);
    let div = Math.ceil(Math.abs(crossV(zig, safeNormalize(vecX, vecY, 0, 0))) / this.settings.maxDistFromLine);
    if (!(div > 0)) div = 1;
    const stepX = zig.x / div, stepY = zig.y / div;
    let curPX = sx, curPY = sy;
    for (let i = 0; i < div; i++) {
      const ax = sx + vecX * (i / div), ay = sy + vecY * (i / div);
      const bx = sx + vecX * ((i + 1) / div), by = sy + vecY * ((i + 1) / div);
      const c1 = nextV2Circular(ur, this.settings.pointVariance, this.settings.pointVariance);
      const v5 = v2(ax + stepX + c1.x, ay + stepY + c1.y);
      const c2 = nextV2Circular(ur, this.settings.pointVariance, this.settings.pointVariance);
      const v6 = v2(bx - stepX + c2.x, by - stepY + c2.y);
      this.genSeg(ctx, curPX, curPY, v5.x, v5.y, roomsArea, cracked, generating);
      this.genSeg(ctx, v5.x, v5.y, v6.x, v6.y, roomsArea, cracked, generating);
      curPX = v6.x; curPY = v6.y;
    }
    this.genSeg(ctx, curPX, curPY, ex2, ey2, roomsArea, cracked, generating);
    data.genPosX = Math.trunc(ex2); data.genPosY = Math.trunc(ey2);
    this.startPosition = v2(sx, sy);
    this.endPosition = v2(ex2, ey2);
    const nEnd = safeNormalize(stepX, stepY, 0, 0);
    this.startDirection = v2(nEnd.x, nEnd.y);
    this.endDirection = v2(nEnd.x, nEnd.y);
    this.crackedBrick = cracked;
    this.bounds.calc();
  }
  /** Stairwell.GenerateHallway（:184-225）。 */
  private genSeg(ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number, roomsArea: DRoomBase[], cracked: boolean, generating: boolean): void {
    const settings = this.settings as StairwellHallSettings & { _data?: unknown };
    void settings;
    const innerSize = (this.settings as StairwellHallSettings).innerBoundsSize;
    const outerSize = (this.settings as StairwellHallSettings).outerBoundsSize;
    const sum = innerSize + outerSize;
    const dx = ex2 - sx, dy = ey2 - sy;
    const total = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    for (let i = 0; i < total; i++) {
      const px = sx + dx * (i / total);
      const py = sy + dy * (i / total);
      if (!this.processed) {
        // C# 源码真态：maxX 参数写的是 (int)val2.Y+num
        ctx.data!.dungeonBounds.updBox(Math.trunc(px) - sum, Math.trunc(py) - sum,
          Math.trunc(py) + sum, Math.trunc(py) + sum);
        ctx.jsBoundUpd(Math.trunc(px) - sum, Math.trunc(py) - sum,
          Math.trunc(py) + sum, Math.trunc(py) + sum);
        this.bounds.updBox(Math.trunc(px) - sum, Math.trunc(py) - sum,
          Math.trunc(py) + sum, Math.trunc(py) + sum);
      }
      if (generating) {
        const entStyle = (this.settings as StairwellHallSettings).forceStyleDP;
        generateSquareHall(_dataRef(), ctx, roomsArea, px, py, this.settings.style, innerSize, outerSize,
          this.settings.placeOverProtectedBricks, cracked, entStyle, this);
      }
    }
  }
  calculateHall(data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number): void {
    this.calculated = false; this.run(data, ctx, sx, sy, ex2, ey2, false); this.calculated = true;
  }
  generateHallData(data: DualDungeonData, ctx: DualLayoutCtx): void { this.run(data, ctx, this.startPosition.x, this.startPosition.y, this.endPosition.x, this.endPosition.y, true); this.generated = true; }
}

/** CalculateZigZagSlope（StairwellDungeonHall.cs:156-182）。 */
function calcZigZagSlope(startP: V2, endP: V2, gradient: number): V2 {
  const dir = safeNormalize(endP.x - startP.x, endP.y - startP.y, 0, 1);   // SafeNormalize(UnitY)
  const nx = dir.x > 0.0 ? 1 : -1;
  const nv = safeNormalize(nx, gradient, 0, 0);
  const dist = distV(startP, endP);
  const scale = dist * (dir.x / nv.x + dir.y / nv.y) / 4.0;
  return v2(nv.x * scale, nv.y * scale);
}

// —— Legacy hall（dual 域：OverrideStart/End 直连支;其余支不达）——
class DLegacyHall extends DHallBase {
  declare settings: LegacyHallSettingsCls;
  strengthVal = 0; stepsVal = 0;
  runOverride(data: DualDungeonData, ctx: DualLayoutCtx, generating: boolean): void {
    const st = ctx.st;
    const ur = new UnifiedRandom(this.settings.randomSeed);
    const brick = this.settings.style.BrickTileType;
    const crackedTile = this.settings.style.BrickCrackedTileType;
    const wallT = this.settings.style.BrickWallType;
    const b = this.settings.overridePaintTile > -1 ? this.settings.overridePaintTile : (this.settings.style.TilePaintColor ?? 0);
    const b2 = this.settings.overridePaintWall > -1 ? this.settings.overridePaintWall : (this.settings.style.WallPaintColor ?? 0);
    let num4 = Math.trunc(4.0 * data.scalars.hallS) + ur.nextInt(2);
    let stepsVal = Math.trunc(35.0 * data.scalars.hallStep) + ur.nextInt(45);
    let cracked = false;
    if (this.settings.crackedBrickChance > 0.0) cracked = ur.nextDouble() <= this.settings.crackedBrickChance;
    // ForceHorizontal=false 支：Next(5)==0→加倍减半（x86 保持消耗）
    if (ur.nextInt(5) === 0) { num4 *= 2; stepsVal = Math.trunc(stepsVal / 2); }
    const startOv = (this.settings as LegacyHallSettingsCls).overrideStartPos!;
    const endOv = (this.settings as LegacyHallSettingsCls).overrideEndPos!;
    let numITEx = data.scalars.hallITEx;
    if ((this.settings as LegacyHallSettingsCls).overrideStrength > 0) { num4 = (this.settings as LegacyHallSettingsCls).overrideStrength; }
    if ((this.settings as LegacyHallSettingsCls).overrideSteps > 0) { stepsVal = (this.settings as LegacyHallSettingsCls).overrideSteps; }
    if ((this.settings as LegacyHallSettingsCls).overrideITExRatio > 0) numITEx = (this.settings as LegacyHallSettingsCls).overrideITExRatio;
    const dvx = endOv.x - startOv.x, dvy = endOv.y - startOv.y;
    const nv = safeNormalize(dvx, dvy, 1, 0);
    let steps = Math.trunc(Math.ceil(lenD(dvx, dvy) / lenD(nv.x, nv.y)));
    stepsVal = steps;
    let val = v2(startOv.x, startOv.y);
    const zeroDir = v2(nv.x, nv.y);
    const lastHallCapture = data.lastDungeonHall;
    data.lastDungeonHall = v2(nv.x, nv.y);
    const num6 = ctx.undergroundLayer - Math.trunc(100.0 * Math.max(data.scalars.hallS, data.scalars.roomS));
    if (!this.processed) this.bounds.set(Math.trunc(val.x), Math.trunc(val.y), Math.trunc(val.x), Math.trunc(val.y));
    const startPos = v2(val.x, val.y);
    const allRooms = getAllRoomsInSpots(data.rooms, startPos.x, startPos.y,
      startPos.x + nv.x * steps, startPos.y + nv.y * steps, Math.trunc(steps / 2) + num4);
    while (steps > 0) {
      if (!inWorld10(ctx, Math.trunc(val.x + zeroDir.x), Math.trunc(val.y + zeroDir.y))) steps = 0;
      steps--;
      const r1 = ur.nextInt(6);
      const x0 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(val.x - num4 - 4.0 - r1)));
      const r2 = ur.nextInt(6);
      const x1 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(val.x + num4 + 4.0 + r2)));
      const r3 = ur.nextInt(6);
      const y0 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(val.y - num4 - 4.0 - r3)));
      const r4 = ur.nextInt(6);
      const y1 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(val.y + num4 + 4.0 + r4)));
      if (!this.processed) {
        data.dungeonBounds.updBox(x0, y0, x1, y1);
        ctx.jsBoundUpd(x0, y0, x1, y1);
        this.bounds.updBox(x0, y0, x1, y1);
      }
      if (generating && !this.settings.carveOnly) {
        for (let m = x0; m < x1; m++) {
          for (let n = y0; n < y1; n++) {
            if (!st.inBounds(m, n)) continue;
            const ii = st.idx(m, n);
            let flagT = true;
            const prot = highestProtectionFromPoint(st, m, n, allRooms);
            if (prot !== (Protection.TilesAndWalls as number)) {
              if (prot === Protection.Tiles) flagT = false;
              st.liquid[ii] = 0;
              const resetT = m >= x0 + 1 && m < x1 - 1 && n >= y0 + 1 && n < y1 - 1;
              if (flagT && n <= ctx.undergroundLayer + 7 && hallPlaceGate(this, st, m, n, brick, crackedTile)) {
                chTileSheet(st, m, n, brick, resetT, b);
              }
            }
          }
        }
        for (let m = x0 + 1; m < x1 - 1; m++) {
          for (let n = y0 + 1; n < y1 - 1; n++) {
            if (n >= ctx.undergroundLayer + 7 || !st.inBounds(m, n)) continue;
            const ii = st.idx(m, n);
            const prot = highestProtectionFromPoint(st, m, n, allRooms);
            if (prot !== (Protection.TilesAndWalls as number)) {
              const flagW = !(prot === Protection.Walls && __tierRef().isDungeonWall(st.wall[ii]));
              if (flagW) chWallSheet(st, m, n, wallT, false, b2);
            }
          }
        }
      }
      if (generating) {
        let num21 = 0;
        if (nv.y === 0.0 && ur.nextInt(num4 + 1) === 0) num21 = ur.nextIntRange(1, 3);
        else if (nv.x === 0.0 && ur.nextInt(Math.max(1, num4 - 1)) === 0) num21 = ur.nextIntRange(1, 3);
        else if (ur.nextInt(num4 * 3) === 0) num21 = ur.nextIntRange(1, 3);
        const cx0 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(val.x - num4 * numITEx - num21)));
        const cx1 = Math.max(0, Math.min(ctx.w - 1, Math.trunc(val.x + num4 * numITEx + num21)));
        const cy0 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(val.y - num4 * numITEx - num21)));
        const cy1 = Math.max(0, Math.min(ctx.h - 1, Math.trunc(val.y + num4 * numITEx + num21)));
        for (let m = cx0; m < cx1; m++) {
          for (let n = cy0; n < cy1; n++) {
            if (!st.inBounds(m, n)) continue;
            const ii = st.idx(m, n);
            let flag18 = true;
            let flag19 = true;
            const prot = highestProtectionFromPoint(st, m, n, allRooms);
            if (prot === (Protection.TilesAndWalls as number)) continue;
            if (prot === Protection.Tiles) flag18 = false;
            if (prot === Protection.Walls && __tierRef().isDungeonWall(st.wall[ii])) flag19 = false;
            if (!hallRemoveGate(this, st, m, n, crackedTile)) continue;
            if (cracked) {
              if ((st.flags[ii] & 1 || !__tierRef().isDungeonWall(st.wall[ii])) && n < ctx.undergroundLayer) {
                clearTileOnly(st, m, n);
                if (flag18 && !this.settings.carveOnly) chTileSheet(st, m, n, crackedTile, false, b);
              }
            } else {
              clearTileOnly(st, m, n);
            }
            if (flag19 && n < ctx.undergroundLayer && !this.settings.carveOnly) {
              chWallSheet(st, m, n, wallT, false, b2);
            }
          }
        }
      }
      val = v2(val.x + nv.x, val.y + nv.y);
    }
    data.genPosX = Math.trunc(val.x);
    data.genPosY = Math.trunc(val.y);
    this.startPosition = v2(startOv.x, startOv.y);
    this.endPosition = v2(val.x, val.y);
    // ★IIIII215 翻案（LegacyDungeonHall.cs:679/:870-871）：111c 曾读「startDirection 局部
    //  恒 zero 且从未重赋」——实为反编译命名陷阱：:203 `zero` 是【行走方向局部】（:270/
    //  :449/:472/:530 行进中持续改写），:679 `startDirection = zero` 是【循环内末次迭代的
    //  方向快照】、:871 `EndDirection = zero` 是同一 walk 方向的终态 ⇒ **StartDirection=
    //  EndDirection=终态行走方向**（非零！）。实证=x86 PDC-H 在 Legacy 厅两端 dy=
    //  0.0770163494545329（=斜切段 (±1,±0.2·hallSlantVariantScalar) 归一化）逐值吻合、
    //  全 821 走廊点 x86 零 dy=0。曾置 (0,0) ⇒ |0|≤0.1 全落门支 ⇒ 走廊门 +90（140 vs 50）
    //  → DOORS 段 +180 → 值流三段分叉（LIGHTS/BOOKSHELVES/FURNITURE 等下游放大）。
    this.startDirection = v2(nv.x, nv.y);
    this.endDirection = v2(nv.x, nv.y);
    this.strengthVal = num4;
    this.stepsVal = stepsVal;
    data.lastDungeonHall = lastHallCapture;       // C# LastHall=lastHall（原值回存）
    this.crackedBrick = cracked;
    if (!this.processed) this.bounds.calc();
  }
  calculateHall(data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number): void {
    this.calculated = false;
    setLegacyOverrides(this, v2(sx, sy), v2(ex2, ey2));
    this.runOverride(data, ctx, false);
    this.calculated = true;
  }
  generateHallData(data: DualDungeonData, ctx: DualLayoutCtx): void {
    this.runOverride(data, ctx, true);
    this.generated = true;
  }
}
function setLegacyOverrides(hall: DLegacyHall, s: V2, e: V2): void {
  const sCls = hall.settings as unknown as { overrideStartPos?: V2 | null; overrideEndPos?: V2 | null };
  sCls.overrideStartPos = s;
  sCls.overrideEndPos = e;
}
function hallPlaceGate(hall: DHallBase, st: TileStore, x: number, y: number, brick: number, crackedTile: number): boolean {
  return hall.canPlaceHallTile(st, x, y, brick, crackedTile);
}
function hallRemoveGate(hall: DHallBase, st: TileStore, x: number, y: number, crackedTile: number): boolean {
  return hall.canRemoveHallTile(st, x, y, crackedTile);
}

let _dataRefValue: DualDungeonData | null = null;
function _dataRef(): DualDungeonData { return _dataRefValue!; }

// ── 工厂（DungeonCrawler.cs）──────────────────────────────────────

/** DualDungeonLayout_GetGeneralRoomType（Provider.cs:635-648）。 */
function getGeneralRoomType(r: RNG): number {
  switch (r.nextInt(8)) {
    case 1: return DPRoomType.Regular;
    case 2: return DPRoomType.Wormlike;
    case 3: return DPRoomType.GenShapeCircle;
    case 4: return DPRoomType.GenShapeMound;
    case 5: return DPRoomType.GenShapeHourglass;
    case 6: return DPRoomType.GenShapeDoughnut;
    case 7: return DPRoomType.GenShapeQuadCircle;
    default: return DPRoomType.Legacy;
  }
}
/** DualDungeonLayout_GetGeneralHallType（:650-658）。 */
function getGeneralHallType(r: RNG): number {
  switch (r.nextInt(3)) {
    case 1: return DPHallType.Regular;
    case 2: return DPHallType.Sine;
    default: return DPHallType.Legacy;
  }
}
/** DualDungeonLayout_GetHallRadius（:660-667）。 */
function getHallRadius(hallType: number): number {
  if ((hallType <= 2 ? 1 : 0) !== 0 || hallType !== DPHallType.Sine) return 8;
  return 14;
}

interface GetRoomSettingsCtx { data: DualDungeonData; ctx: DualLayoutCtx }

/** MakeDungeon_GetRoomSettings（DC.cs:573-772）全量。 */
function makeGetRoomSettings(roomTypeIn: number, gc: GetRoomSettingsCtx, line: DungeonControlLineRef | null): RoomSettingsBase {
  const r = gc.ctx.rng;
  const data = gc.data;
  let roomType = roomTypeIn;
  const num0 = Math.trunc(15.0 * data.scalars.roomS);
  const num2v = r.nextInt(13);
  const num3v = r.nextInt(13);
  const num4v = 6;
  const num5v = r.nextInt(12);
  const num6v = r.nextInt(12);
  let scaleN = 1;                                   // float 域
  if (data.typeDual) scaleN = fr(1.25);
  if ((roomType === DPRoomType.GenShapeDoughnut || roomType === DPRoomType.GenShapeQuadCircle)
    && line?.CurveLine) roomType = DPRoomType.GenShapeCircle;
  let s: RoomSettingsBase;
  switch (roomType) {
    case DPRoomType.Regular: {
      const st2 = new RegularRoomSettingsCls();
      const nA = Math.trunc(num0 * 0.8);
      const nB = Math.trunc(num2v * 0.8);
      st2.overrideOuterBoundsSize = 8;
      st2.overrideInnerBoundsSize = nA + nB;
      s = st2;
      break;
    }
    case DPRoomType.Wormlike: {
      const st3 = new WormlikeRoomSettingsCls();
      st3.firstSideIterations = num4v * 3 + num5v;
      st3.secondSideIterations = num4v * 3 + num6v;
      s = st3;
      break;
    }
    case DPRoomType.LivingTree: {
      const st4 = new LivingTreeRoomSettingsCls();
      const nA = Math.trunc(num0 * 0.3);
      const nB = Math.trunc(num2v * 0.5);
      st4.innerWidth = nA + nB;
      const innerH = num4v * 6 + num5v;
      st4.innerHeight = innerH;
      const depth = 4 + r.nextInt(3);
      st4.depth = depth;
      st4.boundR = Math.trunc((innerH + depth + depth) / 2);
      st4.forceStyleDP = true;
      s = st4;
      break;
    }
    case DPRoomType.BiomeSquare: case DPRoomType.BiomeRugged: case DPRoomType.BiomeStructured: {
      s = new BiomeRoomSettingsCls();
      break;
    }
    case DPRoomType.GenShapeCircle: {
      const st5 = new GenShapeRoomSettingsCls();
      let nA = Math.trunc(num0 * 0.8);
      let nB = Math.trunc(num2v * 0.8);
      if (scaleN !== 1 && r.nextInt(3) === 0) {
        nA = Math.trunc(fr(nA * scaleN));
        nB = Math.trunc(fr(nB * scaleN));
      }
      const outerR = nA + 8;
      st5.shapeType = GenShapeT.Circle;
      st5.innerShape = new CircleRoomShape(nA + nB, nA + nB);
      st5.outerShape = new CircleRoomShape(outerR + nB, outerR + nB);
      st5.boundR = outerR + nB;
      st5.hallwayPointAdjuster = 10;
      s = st5;
      break;
    }
    case DPRoomType.GenShapeMound: {
      const st6 = new GenShapeRoomSettingsCls();
      let nA = num0;
      let nB = num2v;
      if (scaleN !== 1 && r.nextInt(3) === 0) {
        nA = Math.trunc(fr(nA * scaleN));
        nB = Math.trunc(fr(nB * scaleN));
      }
      const baseW = nA + nB;
      const outerW = baseW + 8;
      st6.shapeType = GenShapeT.Mound;
      st6.innerShape = new MoundRoomShape(baseW, Math.trunc(baseW * 1.5));
      st6.outerShape = new MoundRoomShape(outerW, Math.trunc(outerW * 1.5));
      st6.boundR = Math.trunc(outerW * 1.2);
      s = st6;
      break;
    }
    case DPRoomType.GenShapeHourglass: {
      const st7 = new GenShapeRoomSettingsCls();
      let nA = num0;
      let nB = num2v;
      if (scaleN !== 1 && r.nextInt(3) === 0) {
        nA = Math.trunc(fr(nA * scaleN));
        nB = Math.trunc(fr(nB * scaleN));
      }
      const w1 = nA + nB + 10;
      const w2 = nA + num3v + 10;
      const w3 = w1 + 16;
      const w4 = w2 + 16;
      st7.shapeType = GenShapeT.Hourglass;
      st7.innerShape = new HourglassRoomShape(w1, w2, 0);
      st7.outerShape = new HourglassRoomShape(w3, w4, fr(0.4));
      st7.boundR = (w3 > w4 ? Math.trunc(w3 / 2) : Math.trunc(w4 / 2)) + 5;
      st7.hallwayPointAdjuster = 5;
      s = st7;
      break;
    }
    case DPRoomType.GenShapeDoughnut: {
      const st8 = new GenShapeRoomSettingsCls();
      const nA = Math.trunc(num0 * 0.8);
      const nB = Math.trunc(num2v * 0.8);
      const h11 = nA + nB;
      const v12 = nA + num3v;
      const o13 = h11 + 8;
      const o14 = v12 + 8;
      st8.shapeType = GenShapeT.Doughnut;
      st8.innerShape = new CircleRoomShape(h11, v12);
      st8.outerShape = new CircleRoomShape(o13, o14);
      st8.boundR = (o13 > o14 ? o13 : o14) + 5;
      st8.hallwayPointAdjuster = 5;
      s = st8;
      break;
    }
    case DPRoomType.GenShapeQuadCircle: {
      const st9 = new GenShapeRoomSettingsCls();
      let nA = num0;
      let nB = num2v;
      if (scaleN !== 1 && r.nextInt(3) === 0) {
        nA = Math.trunc(fr(nA * 1.5));
        nB = Math.trunc(fr(nB * 1.5));
      }
      const rad8 = Math.max(5, Math.trunc(fr(fr(nA + nB) * fr(0.5) * fr(0.75))));
      const rad9 = rad8 + 8;
      const dist10 = Math.trunc(rad8 * 1.5);
      st9.shapeType = GenShapeT.QuadCircle;
      st9.innerShape = new QuadCircleRoomShape(rad8, dist10);
      st9.outerShape = new QuadCircleRoomShape(rad9, dist10);
      st9.boundR = Math.trunc(rad9 / 2) + dist10 + 4;
      st9.hallwayPointAdjuster = 5;
      s = st9;
      break;
    }
    default: {
      const stL = new LegacyRoomSettingsCls();
      stL.overrideStrength = num0 + num2v;
      stL.overrideSteps = num4v + num5v;
      stL.overrideVelocity = line
        ? safeNormalize(line.NormalizedLineDirection.x, line.NormalizedLineDirection.y, 0, 1)
        : v2(0, 1);
      s = stL;
      break;
    }
  }
  s.randomSeed = r.vanilla.next();
  s.roomType = roomType;
  s.progressionStage = line ? line.ProgressionStage : 0;
  s.style = line ? line.Style : (gc.data.gv.dungeonGenerationStyles[gc.data.gv.dungeonGenerationStyles.length - 1] as DungeonStyleData);
  s.onCurvedLine = !!line?.CurveLine;
  s.orientation = SO.Unknown;
  s.controlLine = line;
  return s;
}

/** MakeDungeon_GetRoom（DC.cs:896-935）。 */
function makeGetRoom(settings: RoomSettingsBase, w: number, h: number, addToData: boolean, data: DualDungeonData): DRoomBase {
  let room: DRoomBase;
  switch (settings.roomType) {
    case DPRoomType.Regular: room = new DRegularRoom(settings, w, h); break;
    case DPRoomType.Wormlike: room = new DWormlikeRoom(settings, w, h); break;
    case DPRoomType.LivingTree: room = new DLivingTreeRoom(settings, w, h); break;
    case DPRoomType.BiomeSquare: room = new DBiomeSquareRoom(settings, w, h); break;
    case DPRoomType.BiomeRugged: room = new DBiomeRuggedRoom(settings, w, h); break;
    case DPRoomType.BiomeStructured: room = new DBiomeStructuredRoom(settings, w, h); break;
    case DPRoomType.GenShapeCircle: case DPRoomType.GenShapeMound: case DPRoomType.GenShapeHourglass:
    case DPRoomType.GenShapeDoughnut: case DPRoomType.GenShapeQuadCircle:
      room = new DGenShapeRoom(settings, w, h); break;
    default: room = new DLegacyRoom(settings, w, h); break;
  }
  if (addToData) data.rooms.push(room);
  return room;
}
/**
 * MakeDungeon_TryRoom（DC.cs:883-894）。
 * ★IIIII97 定罪①：C# IsAnyRoomInSpot（DungeonData.cs:168-193）在本调用点
 *   `new DungeonRoomSearchSettings { Fluff = fluff }` —— UseOuterBounds 缺省 false
 *   ⇒ 受理域比对的是 room.**InnerBounds**.ContainsWithFluff(x,y,fluff)；JS 曾误查
 *   rm.outer（外圈=inner±outerBoundsSize(=8) 壳），多拒 8px 环带上的 attempt。
 * SW_I103_ATT=1 取证：__swI103Att 双判据事件（零行为差，A/B 用毕保留观测面）。
 */
function tryMakeRoom(data: DualDungeonData, ctx: DualLayoutCtx, x: number, y: number, settings: RoomSettingsBase, addToData: boolean, fluff: number): DRoomBase | null {
  const att = (globalThis as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att;
  let hitO: DRoomBase | null = null;
  let hitI: DRoomBase | null = null;
  for (const rm of data.rooms) {
    if (hitO === null && rm.outer.containsF(x, y, fluff)) hitO = rm;
    if (hitI === null && rm.inner.containsF(x, y, fluff)) hitI = rm;
    if (hitO !== null && hitI !== null) break;
  }
  if (att) att({
    k: (globalThis as { __swI103K?: number }).__swI103K ?? -1,
    mc: (globalThis as { __swI103Mc?: number }).__swI103Mc ?? -1,
    x, y, fluff,
    blockOuter: hitO ? [hitO.settings.x, hitO.settings.y] : null,
    blockInner: hitI ? [hitI.settings.x, hitI.settings.y] : null,
    roomType: settings.roomType,
    boundR: settings.boundingRadius(),
  });
  void hitO;
  if (hitI !== null) return null;
  return makeGetRoom(settings, ctx.w, ctx.h, addToData, data);
}
/** MakeDungeon_GetHallSettings（DC.cs:774-811）。 */
function makeGetHallSettings(hallType: number, data: DualDungeonData, ctx: DualLayoutCtx, sx: number, sy: number, ex2: number, ey2: number, style: DungeonStyleData): HallSettingsBase {
  const r = ctx.rng;
  void data;
  let s: HallSettingsBase;
  switch (hallType) {
    case DPHallType.Regular:
      s = new RegularHallSettingsCls();
      break;
    case DPHallType.Stairwell: {
      const st2 = new StairwellHallSettings();
      st2.crackedBrickChance = 0.0;
      s = st2;
      break;
    }
    case DPHallType.Sine: {
      const nSteps = Math.max(1, Math.trunc(lenD(ex2 - sx, ey2 - sy) / fr(30)));
      const iterations = nSteps <= 1 ? 1 : 1 + r.nextInt(nSteps - 1);
      const magnitude = fr(8 + r.next() * 4);
      const st3 = new SineHallSettingsCls();
      st3.crackedBrickChance = 0.0;
      st3.magnitude = magnitude;
      st3.iterations = iterations;
      st3.flipSine = r.nextInt(2) === 0;
      s = st3;
      break;
    }
    default:
      s = new LegacyHallSettingsCls();
      break;
  }
  s.randomSeed = r.vanilla.next();
  s.hallType = hallType;
  s.style = style;
  return s;
}

// ── DualDungeonLayoutProvider 本体 ─────────────────────────────────

interface HallwayRoomEntry {
  room: DRoomBase;
  progressAlongSnake: number;
  backLinks: HallwayRoomEntry[];
  forwardLinks: HallwayRoomEntry[];
  centerX: number; centerY: number;
}
interface HallLineRef { source: HallwayRoomEntry; target: HallwayRoomEntry; sourcePoint: V2; targetPoint: V2 }

const enum ScoreKind { Hallway, Stairwell }

class HallwayCalculator {
  private entries: HallwayRoomEntry[] = [];
  private hallsOut: DHallBase[] = [];
  private stairwells: HallLineRef[] = [];
  // ★IIIII97 取证：selectGoodRoom 失败面计数（零行为差，sink 挂载才有增量）
  hallStats = { selCalls: 0, noCands: 0, connFails: 0, liquidFails: 0, borderChecks: 0, borderFails: 0, picks: 0 };
  private snakeRef: import('./DitherSnakePass').DitherSnake;
  private maxProgressDelta: number;
  private avgLineLength = 0;
  constructor(private data: DualDungeonData, private ctx: DualLayoutCtx, rooms: DRoomBase[], snakeLines: DungeonControlLineRef[]) {
    void snakeLines;
    this.snakeRef = (data as unknown as { hallSnake?: import('./DitherSnakePass').DitherSnake }).hallSnake!;
    for (const r of rooms) {
      this.entries.push({
        room: r,
        progressAlongSnake: this.snakeRef.getPositionAlongSnake(v2(r.centerX(), r.centerY())) as number,
        backLinks: [],
        forwardLinks: [],
        centerX: r.centerX(),
        centerY: r.centerY(),
      });
    }
    this.entries.sort((a, b) => a.progressAlongSnake - b.progressAlongSnake);
    const ls = this.snakeRef.lines;
    let sum = 0;
    for (const l of ls) sum += l.LineLength;
    this.avgLineLength = ls.length ? sum / ls.length : 1;
    this.maxProgressDelta = 300.0 / this.avgLineLength;
    drlMark(`DR|HC|i${_drlInstNext}|CTOR e=${this.entries.length}|av=${bits64x(this.avgLineLength)}|mp=${bits64x(this.maxProgressDelta)}|mr=${drlMr()}|rc=${drlRc()}`);
  }
  generate(): DHallBase[] {
    // 楼梯井通道（rooms.Skip(2)，Next(2)==0）
    for (let i = 2; i < this.entries.length; i++) {
      const entry = this.entries[i]!;
      if (this.ctx.rng.nextInt(2) === 0) {
        const pick = this.selectGoodRoom(entry, ScoreKind.Stairwell, 25);
        if (pick && pick.score > 0.0) this.makeHall(pick.line, DPHallType.Stairwell);
      }
    }
    drlMark(`DR|HC|i${_drlInstNext}|GA sw=${this.stairwells.length}|mr=${drlMr()}|rc=${drlRc()}`);
    // 常规走廊（rooms.Skip(1)，无反链者必连+Next(2) 可选厅）
    for (let i = 1; i < this.entries.length; i++) {
      const entry = this.entries[i]!;
      if (entry.backLinks.length === 0) {
        let tries = 0;
        for (;;) {
          const hallType = getGeneralHallType(this.ctx.rng);
          const radius = Math.max(8, getHallRadius(hallType));
          const pick = this.selectGoodRoom(entry, ScoreKind.Hallway, radius);
          if (pick) { this.makeHall(pick.line, hallType); break; }
          if (tries === 1000) break;
          tries++;
        }
      }
      if (this.ctx.rng.nextInt(2) === 0) {
        const hallType = getGeneralHallType(this.ctx.rng);
        const radius = Math.max(8, getHallRadius(hallType));
        const pick = this.selectGoodRoom(entry, ScoreKind.Hallway, radius);
        if (pick && pick.score > -2.0) this.makeHall(pick.line, hallType);
      }
    }
    drlMark(`DR|HC|i${_drlInstNext}|GB h=${this.hallsOut.length}|mr=${drlMr()}|rc=${drlRc()}`);
    return this.hallsOut;
  }

  private makeHall(line: HallLineRef, hallTypeIn: number): void {
    let hallType = hallTypeIn;
    let liquidFlag = false;
    if ((line.target.room.settings.style.LiquidType ?? -1) >= 0 || (line.source.room.settings.style.LiquidType ?? -1) >= 0) {
      // ★IIIII97 勘误：LiquidType 缺省 = -1（DungeonGenerationStyleData.cs:41），
      //   仅 Shimmer(3)/Beehive(2) 非负——此前 JS 表误填 0 造成 liquid 门恒真。
      liquidFlag = true;
    }
    if (liquidFlag && hallType !== DPHallType.LegacyEntrance && hallType !== DPHallType.Legacy && hallType !== DPHallType.Regular) {
      hallType = DPHallType.Regular;
    }
    const srcLine = this.snakeRef.getLineContaining(line.sourcePoint);
    const style = srcLine ? srcLine.Style : ((this.data.gv.dungeonGenerationStyles[0] ?? this.data.defaultStyle) as DungeonStyleData);
    const settings = makeGetHallSettings(hallType, this.data, this.ctx,
      line.sourcePoint.x, line.sourcePoint.y, line.targetPoint.x, line.targetPoint.y, style);
    settings.carveOnly = true;
    if (liquidFlag) settings.crackedBrickChance = 1.0;
    const hall = this.constructHall(settings);
    hall.calculateHall(this.data, this.ctx, line.sourcePoint.x, line.sourcePoint.y, line.targetPoint.x, line.targetPoint.y);
    this.hallsOut.push(hall);
    this.data.halls.push(hall);
    line.source.backLinks.push(line.target);
    line.target.forwardLinks.push(line.source);
    if (hallType === DPHallType.Stairwell) this.stairwells.push(line);
  }

  private constructHall(settings: HallSettingsBase): DHallBase {
    switch (settings.hallType) {
      case DPHallType.Regular: return new DRegularHall(settings, this.ctx.w, this.ctx.h);
      case DPHallType.Stairwell: return new DStairwellHall(settings, this.ctx.w, this.ctx.h);
      case DPHallType.Sine: return new DSineHall(settings, this.ctx.w, this.ctx.h);
      default: return new DLegacyHall(settings, this.ctx.w, this.ctx.h);
    }
  }

  private scoreHallway(line: HallLineRef): number {
    let num = 0.0;
    const fromMin = Math.sin(Math.PI * 7.0 / 36.0);
    const vx = line.targetPoint.x - line.sourcePoint.x;
    const vy = line.targetPoint.y - line.sourcePoint.y;
    const n = safeNormalize(vx, vy, 1, 0);
    num -= remapN(Math.abs(n.y), fromMin, 0.0, 0.0, 1.0);
    num -= remapN(Math.abs(n.y), fromMin, 1.0, 0.0, 5.0);
    num -= remapN(lenD(vx, vy), this.avgLineLength * 1.5, this.avgLineLength * 3.0, 0.0, 3.0);
    // :181/:182/:183 = Remap 的 float 重载（int Count + 1f/3f/0f/2f 全 float 字面量），f32 全程
    num -= remapF(line.target.forwardLinks.length, 1, 3, 0, 2);
    num -= remapF(line.source.backLinks.length, 1, 3, 0, 2);
    num += remapF(this.distanceFromCommonAncestor(line.source, line.target), 3, 6, 0, 1);
    if ((isBiomeEntry(line.target) && line.target.forwardLinks.length > 0)
      || (isBiomeEntry(line.source) && line.source.backLinks.length > 0)) num -= 5.0;
    if (isBiomeEntry(line.target) || isBiomeEntry(line.source)) {
      num -= remapN(Math.abs(n.y), 0.6, 0.8, 0.0, 5.0);
    }
    return num;
  }
  private scoreStairwell(line: HallLineRef): number {
    const vx = line.targetPoint.x - line.sourcePoint.x;
    const vy = line.targetPoint.y - line.sourcePoint.y;
    const n = safeNormalize(vx, vy, 1, 0);
    let num = 0.0;
    num -= remapN(Math.abs(n.y), 0.6, 1.0, 1.0, 0.0);
    num -= remapN(lenD(vx, vy), this.avgLineLength * 0.5, this.avgLineLength * 1.5, 1.0, 0.0);
    if (line.target.backLinks.length > 0 || line.target.forwardLinks.length > 0) num -= 5.0;
    if (isBiomeEntry(line.source) || isBiomeEntry(line.target)) num -= 5.0;
    return num;
  }
  private distanceFromCommonAncestor(a: HallwayRoomEntry, b: HallwayRoomEntry): number {
    const setA = new Set<HallwayRoomEntry>([a]);
    const setB = new Set<HallwayRoomEntry>([b]);
    let frontierA = new Set<HallwayRoomEntry>([a]);
    let frontierB = new Set<HallwayRoomEntry>([b]);
    for (let i = 0; i < 8; i++) {
      for (const e of setA) { if (setB.has(e)) return i; }
      const nextA = new Set<HallwayRoomEntry>();
      for (const e of frontierA) for (const bk of e.backLinks) nextA.add(bk);
      frontierA = nextA;
      for (const e of frontierA) setA.add(e);
      const nextB = new Set<HallwayRoomEntry>();
      for (const e of frontierB) for (const bk of e.backLinks) nextB.add(bk);
      frontierB = nextB;
      for (const e of frontierB) setB.add(e);
    }
    return 8;
  }

  private selectGoodRoom(source: HallwayRoomEntry, kind: ScoreKind, hallRadius: number): { line: HallLineRef; score: number } | null {
    const r = this.ctx.rng;
    const ST = this.hallStats;
    ST.selCalls++;
    drlMark(`DR|HCa|i${_drlInstNext}|src=${this.entries.indexOf(source)}`);
    const idxFrom = this.entries.findIndex((e) => e.progressAlongSnake >= source.progressAlongSnake - this.maxProgressDelta);
    const val = Math.min(idxFrom === -1 ? 0 : idxFrom, Math.max(0, this.entries.indexOf(source) - 2));
    const candidates: HallwayRoomEntry[] = [];
    for (let i = val; i < this.entries.length; i++) {
      if (this.entries[i] === source) break;
      candidates.push(this.entries[i]!);
    }
    if (candidates.length === 0) ST.noCands++;
    let maxDist = 0;
    for (const c of candidates) maxDist = Math.max(maxDist, distV(v2(c.centerX, c.centerY), v2(source.centerX, source.centerY)));
    const nearbyRadius = candidates.length ? maxDist + 50.0 : 50.0;
    const nearby: HallwayRoomEntry[] = [];
    for (const e of this.entries) {
      if (e !== source && distV(v2(e.centerX, e.centerY), v2(source.centerX, source.centerY)) <= nearbyRadius) nearby.push(e);
    }
    const liquidFlag = source.room.settings.style.LiquidType >= 0;
    let best: HallLineRef | null = null;
    // ★IIIII99b2：C# bestScore 初始=double.MinValue（非 -Infinity）——镜像取值以便
    //   DR|HC| bs 位型逐位对拍；比较语义对有限 num 等价。
    let bestScore = -Number.MAX_VALUE;
    let drlCands = 0;
    let drlBestLY = -1.0;
    let drlBestDCA = -1;
    for (const cand of candidates) {
      if (!this.canConnect(source, cand)) { ST.connFails++; continue; }
      const liquidFlag2 = cand.room.settings.style.LiquidType >= 0;
      // 连接点第一回合=裸查对（base 实现；Override 分支经 room 覆写面走），仅供液门 Y 判定——
      // C# SelectGoodRoomForHallway :298-299。
      let connS: V2, connT: V2;
      {
        const r1 = roomGetHallwayConnectionPoint(source.room, this.ctx, v2(cand.centerX, cand.centerY));
        const r2 = roomGetHallwayConnectionPoint(cand.room, this.ctx, v2(source.centerX, source.centerY));
        connS = r1.point; connT = r2.point;
      }
      if ((liquidFlag && (connS.y >= source.centerY || connS.y <= connT.y))
        || (liquidFlag2 && (connT.y >= cand.centerY || connS.y > connT.y))) { ST.liquidFails++; continue; }
      drlCands++;
      let num = r.next();
      // ★IIIII100c γ 定谳修复：C#:311 对每 candidate 再走静态 wrapper
      // GetHallwayConnectionPoints（Provider.cs:1096/1147）重算两端点+质量
      // （base 房 ⇒ 每 candidate 四次 GtHCP、两次同向；旧镜像把裸点复用为 hallLine 点=
      //   整段缺二调 ⇒ 随机点不同+每 candidate 少耗 2 掷。CP-WALK 内层即此）。
      // 注意次序：wrapper 在液门+drlCands++/NextDouble 之后（与 C# 一致，掷流中性）。
      const wPts = getHallwayConnectionPoints(source.room, cand.room, this.ctx);
      const qGood: number = wPts.qm;
      const hallLine: HallLineRef = { source, target: cand, sourcePoint: wPts.p1, targetPoint: wPts.p2 };
      num -= (qGood === CPQuality.Okay ? 2 : qGood === CPQuality.Bad ? 10 : (qGood as number) === CPQuality.VeryBad ? 1000 : 0);
      num += kind === ScoreKind.Hallway ? this.scoreHallway(hallLine) : this.scoreStairwell(hallLine);
      if (num <= bestScore) continue;
      for (const nb of nearby) {
        if (nb === cand) continue;
        const cp = closestPointOnLine(nb.centerX, nb.centerY, hallLine.sourcePoint.x, hallLine.sourcePoint.y,
          hallLine.targetPoint.x, hallLine.targetPoint.y);
        const distToCenter = distV(cp, v2(nb.centerX, nb.centerY));
        const margin = distToCenter - nb.room.settings.boundingRadius() - hallRadius;
        if (margin < 0.0) num += margin / 4.0 - 3.0;
        if (margin < -10.0) num -= 1000.0;
      }
      for (const sw of this.stairwells) {
        if (lineSegmentsIntersect(hallLine.sourcePoint, hallLine.targetPoint, sw.sourcePoint, sw.targetPoint)) num -= 3.0;
      }
      ST.borderChecks++;
      if (this.snakeRef.isLineInsideBorder(hallLine.sourcePoint, hallLine.targetPoint, hallRadius)) {
        if (!(num <= bestScore)) {
          best = hallLine;
          bestScore = num;
          const dvx = hallLine.targetPoint.x - hallLine.sourcePoint.x;
          const dvy = hallLine.targetPoint.y - hallLine.sourcePoint.y;
          drlBestLY = Math.abs(safeNormalize(dvx, dvy, 1, 0).y);
          drlBestDCA = this.distanceFromCommonAncestor(source, cand);
        }
      }
    }
    if (!best) ST.borderFails++;
    else ST.picks++;
    let pickTxt: string;
    if (!best) {
      pickTxt = `-|bs=${bits64x(bestScore)}`;
    } else {
      const dx = best.targetPoint.x - best.sourcePoint.x;
      const dy = best.targetPoint.y - best.sourcePoint.y;
      const lnV = Math.sqrt(dx * dx + dy * dy);
      pickTxt = `${this.entries.indexOf(best.target)}`
        + `|sp=${Math.trunc(best.sourcePoint.x)},${Math.trunc(best.sourcePoint.y)}`
        + `|tp=${Math.trunc(best.targetPoint.x)},${Math.trunc(best.targetPoint.y)}`
        + `|ln=${bits64x(lnV)}`
        + `|ny=${bits64x(drlBestLY)}`
        + `|dca=${drlBestDCA}`
        + `|bs=${bits64x(bestScore)}`;
    }
    drlMark(`DR|HC|i${_drlInstNext}|src=${this.entries.indexOf(source)}|cands=${drlCands}|pick=${pickTxt}|mr=${drlMr()}|rc=${drlRc()}`);
    return best ? { line: best, score: bestScore } : null;
  }

  private canConnect(a: HallwayRoomEntry, b: HallwayRoomEntry): boolean {
    if (!a.backLinks.includes(b) && !b.backLinks.includes(a)) {
      if (a.room.settings.progressionStage !== b.room.settings.progressionStage && !isBiomeEntry(a)) {
        return isBiomeEntry(b);
      }
      return true;
    }
    return false;
  }

}

function isBiomeEntry(e: HallwayRoomEntry): boolean {
  const t = e.room.settings.roomType;
  return t >= DPRoomType.BiomeSquare && t <= DPRoomType.BiomeStructured;
}

// ── 连接点函数族（DungeonRoom.cs + Provider.cs 静态面）──────────────

/** DungeonRoom.GetHallwayConnectionPoint（Rooms/DungeonRoom.cs:164-255）。 */
function roomGetHallwayConnectionPoint(room: DRoomBase, ctx: DualLayoutCtx, otherRoomPos: V2): { quality: number; point: V2 } {
  const settings = room.settings;
  if (settings.connectionOverride) {
    const r0 = settings.connectionOverride(room, otherRoomPos);
    let point = r0.point;
    if (settings.hallwayPointAdjuster !== null) {
      const n = safeNormalize(otherRoomPos.x - point.x, otherRoomPos.y - point.y, 1, 0);
      point = v2(point.x - n.x * settings.hallwayPointAdjuster, point.y - n.y * settings.hallwayPointAdjuster);
    }
    return { quality: r0.quality, point };
  }
  // Biome 族覆写（横排直线挤出）
  if (room instanceof DBiomeRoomBase) {
    return { quality: CPQuality.Good, point: room.biomeConnectionPoint(ctx, otherRoomPos) };
  }
  let connectionPoint = roomGetHallwayCenterFor(room, otherRoomPos);   // ★IIIII108c：GenShape 覆写起始点
  let val2 = safeNormalize(otherRoomPos.x - connectionPoint.x, otherRoomPos.y - connectionPoint.y, 1, 0);
  let drlVyBits = bits64x(val2.y);
  let drlBr = -1;
  const genRand = ctx.rng;
  if (-0.5 < val2.y && val2.y < 0.7 && genRand.nextInt(2) === 0) {
    drlBr = 0;
    while (room.isInsideRoom(ctx.st, Math.trunc(connectionPoint.x), Math.trunc(connectionPoint.y))) connectionPoint.y++;
    connectionPoint.y -= 3.0;
  } else if (-0.7 < val2.y && val2.y < 0.5 && genRand.nextInt(3) === 0) {
    drlBr = 1;
    while (room.isInsideRoom(ctx.st, Math.trunc(connectionPoint.x), Math.trunc(connectionPoint.y))) connectionPoint.y--;
    connectionPoint.y += 3.0;
  } else {
    drlBr = 2;
    const edge = nextV2CircularEdge(genRand.vanilla, 4.0, 4.0);
    connectionPoint = v2(connectionPoint.x + edge.x, connectionPoint.y + edge.y);
  }
  val2 = safeNormalize(otherRoomPos.x - connectionPoint.x, otherRoomPos.y - connectionPoint.y, 1, 0);
  drlVyBits = bits64x(val2.y);
  // ★IIIII156：walk 逐步取证（__swI156Walk 挂载时,零掷）
  const wk156 = (globalThis as { __swI156Walk?: unknown }).__swI156Walk != null;
  const wv156L: string[] | null = wk156 ? [] : null;
  if (wk156 && room.centerX() === 778 && room.centerY() === 404) {
    wv156L!.push(`W0|cp=${bits64x(connectionPoint.x)},${bits64x(connectionPoint.y)}|v=${bits64x(val2.x)},${bits64x(val2.y)}`);
  }
  while (room.isInsideRoom(ctx.st, Math.trunc(connectionPoint.x), Math.trunc(connectionPoint.y))) {
    connectionPoint = v2(connectionPoint.x + val2.x, connectionPoint.y + val2.y);
    if (wv156L && room.centerX() === 778 && room.centerY() === 404) {
      const tx = Math.trunc(connectionPoint.x), ty = Math.trunc(connectionPoint.y);
      const leg = room as unknown as { inner: { contains(x: number, y: number): boolean; L: number; T: number; R: number; B: number }; innerShape: { contains(x: number, y: number): boolean }; startPos: V2 };
      wv156L!.push(`W+|cp=${bits64x(connectionPoint.x)},${bits64x(connectionPoint.y)}|t=${tx},${ty}|in=${room.isInsideRoom(ctx.st, tx, ty) ? 1 : 0}`
        + `|ib=${leg.inner.L},${leg.inner.T},${leg.inner.R},${leg.inner.B}`
        + `|sp=${bits64x(leg.startPos.x)},${bits64x(leg.startPos.y)}`
        + `|q=${leg.inner.contains(tx, ty) ? 1 : 0}${leg.innerShape.contains(Math.trunc(tx - leg.startPos.x), Math.trunc(ty - leg.startPos.y)) ? 1 : 0}`);
    }
  }
  if (wv156L && wv156L.length > 0) {
    const gh = globalThis as { __swI156WalkLog?: string[] };
    (gh.__swI156WalkLog ??= []).push(...wv156L);
  }
  if (settings.hallwayPointAdjuster !== null) {
    connectionPoint = v2(connectionPoint.x - val2.x * settings.hallwayPointAdjuster,
      connectionPoint.y - val2.y * settings.hallwayPointAdjuster);
  }
  drlMark(`DR|CP|i${_drlInstNext}|cx=${room.centerX()}|cy=${room.centerY()}|ox=${Math.trunc(otherRoomPos.x)}|oy=${Math.trunc(otherRoomPos.y)}|b=${drlBr}|v=${drlVyBits}|px=${Math.trunc(connectionPoint.x)}|py=${Math.trunc(connectionPoint.y)}|q=0`);
  return { quality: CPQuality.Good, point: connectionPoint };
}

/** GetRoomCenterForHallway（DungeonRoom.cs:152-155；GenShapeDungeonRoom.cs:78-96 覆写）。
 * ★IIIII108c 刀①第二落点：Doughnut 族房 CP 起始点=中心+单位向·(W/2,H/2) 径向外推
 * （int 整除后转 double，X/Y 逐轴重算），非 Doughnut GenShape 与普通房=原 Center。
 * 旧镜像（所有调用面恒用几何中心）=房间级走线差首恶：rect 反演 J 全行自洽
 * B/T=(462,434) 而 X 逐行散乱（U∈452..463.6）⇒ X 走的正是本覆写分支。 */
function roomGetHallwayCenterFor(room: DRoomBase, otherRoomPos: V2): V2 {
  if (!(room instanceof DGenShapeRoom)) return v2(room.centerX(), room.centerY());
  const vx0 = room.centerX() + 0.0, vy0 = room.centerY() + 0.0;
  if (room.settings.roomType !== DPRoomType.GenShapeDoughnut) return v2(vx0, vy0);
  const ux = safeNormalize(otherRoomPos.x - vx0, otherRoomPos.y - vy0, 1, 0);
  const hw = Math.trunc(room.inner.width / 2);
  const hh = Math.trunc(room.inner.height / 2);
  return v2(Math.trunc(vx0 + ux.x * hw), Math.trunc(vy0 + ux.y * hh));
}

/** ConnectToTopOfRoomOnly（Provider.cs:1020-1056）。 */
function connectToTopOfRoomOnly(room: DRoomBase, otherRoomPos: V2): { quality: number; point: V2 } {
  const c0 = roomGetHallwayCenterFor(room, otherRoomPos);
  let py = c0.y;
  let px = c0.x;
  while (room.isInsideRoom(_probeSt!, Math.trunc(px), Math.trunc(py))) py--;
  py += 3.0;
  const n = safeNormalize(otherRoomPos.x - px, otherRoomPos.y - py, 0, 0);
  let quality: number;
  if (!(n.y < -0.5)) quality = !(n.y < -0.2) ? (!(n.y < 0.0) ? CPQuality.VeryBad : CPQuality.Bad) : CPQuality.Okay;
  else quality = CPQuality.Good;
  return { quality, point: v2(px, py) };
}
/** ConnectToBottomOfRoomOnly（Provider.cs:1058-1094）。 */
function connectToBottomOfRoomOnly(room: DRoomBase, otherRoomPos: V2): { quality: number; point: V2 } {
  const c0 = roomGetHallwayCenterFor(room, otherRoomPos);
  let py = c0.y;
  let px = c0.x;
  while (room.isInsideRoom(_probeSt!, Math.trunc(px), Math.trunc(py))) py++;
  py -= 3.0;
  const n = safeNormalize(otherRoomPos.x - px, otherRoomPos.y - py, 0, 0);
  let quality: number;
  if (!(n.y > 0.5)) quality = !(n.y > 0.2) ? (!(n.y > 0.0) ? CPQuality.VeryBad : CPQuality.Bad) : CPQuality.Okay;
  else quality = CPQuality.Good;
  return { quality, point: v2(px, py) };
}
let _probeSt: TileStore | null = null;
function setProbeStore(st: TileStore | null): void { _probeSt = st; }



// ── ProvideLayout（Provider.cs:399-459 + 周边私有段）────────────────

class DualProvider {
  snakeInst: import('./DitherSnakePass').DitherSnake | null = null;
  snakeLines: DungeonControlLineRef[] | null = null;
  constructor(private data: DualDungeonData, private ctx: DualLayoutCtx) {
    (data as unknown as { hallSnake?: import('./DitherSnakePass').DitherSnake }).hallSnake = undefined;
  }

  /** CalculateEntranceRoom（:605-633）。 */
  private calculateEntranceRoom(): DLegacyRoom {
    const data = this.data;
    if (data.genPosY > data.outerPotential.T - 10) data.genPosY = data.outerPotential.T - 10;
    if (data.precalcFlag) {
      // preGenDungeonEntranceSettings.PrecalculateEntrancePosition（dual 域 precalc=true）
      data.genPosX = -10 + Math.trunc(data.entranceX) + this.ctx.rng.nextInt(20);
      data.genPosY = Math.trunc(data.entranceY) + 30;
    }
    return this.spawnEntranceRoom();
  }

  private spawnEntranceRoom(): DLegacyRoom {
    const data = this.data;
    const s = new LegacyRoomSettingsCls();
    s.style = data.defaultStyle!;
    s.x = data.genPosX;
    s.y = data.genPosY;
    s.isEntranceRoom = true;
    const room = new DLegacyRoom(s, this.ctx.w, this.ctx.h);
    data.rooms.push(room);
    room.calculateRoom(data, this.ctx);
    return room;
  }

  /** CalculateStartingRoom（:471-492）。 */
  private calculateStartingRoom(snake0: DungeonControlLineRef): DRegularRoom {
    const s = new RegularRoomSettingsCls();
    s.roomType = DPRoomType.Regular;
    s.randomSeed = mainNext(this.ctx);
    s.progressionStage = snake0.ProgressionStage;
    s.style = snake0.Style;
    s.overrideOuterBoundsSize = 8;
    s.overrideInnerBoundsSize = Math.trunc(20.0 * this.data.scalars.roomS);
    s.x = Math.trunc(snake0.Start.x);
    s.y = Math.trunc(snake0.Start.y);
    const room = new DRegularRoom(s, this.ctx.w, this.ctx.h);
    this.data.rooms.push(room);
    room.calculateRoom(this.data, this.ctx);
    return room;
  }

  /** CalculateEntranceHall（:494-504）。 */
  private calculateEntranceHall(entrance: DLegacyRoom, starting: DRegularRoom): void {
    const settings = makeGetHallSettings(DPHallType.Stairwell, this.data, this.ctx, 0, 0, 0, 0, starting.settings.style);
    const swSettings = settings as StairwellHallSettings;
    swSettings.isEntranceHall = true;
    const hall = new DStairwellHall(settings, this.ctx.w, this.ctx.h);
    this.data.halls.push(hall);           // addToData:true
    const p1 = getHallwayConnectionPoints(entrance, starting, this.ctx);
    hall.calculateHall(this.data, this.ctx, p1.p1.x, p1.p1.y, p1.p2.x, p1.p2.y);
  }

  /** CalculateBiomeRooms（:506-527）。
   *  ★IIIII97 定罪：C# 的 MakeDungeon_GetRoom(settings) 缺省 addToData=true ⇒
   *  Biome 房**创建即入 dungeonRooms**（先于一切 Regular 房）；JS 曾用
   *  addToData=false + provideLayout 尾部统一回填，顺序错构。 */
  private calculateBiomeRooms(snakeLines: DungeonControlLineRef[], snakeInst: import('./DitherSnakePass').DitherSnake): DRoomBase[] {
    const out: DRoomBase[] = [];
    for (let i = 0; i < snakeLines.length; i++) {
      const line = snakeLines[i]!;
      const nxt = i + 1 < snakeLines.length ? snakeLines[i + 1] : null;
      if (nxt === null || nxt.ProgressionStage !== line.ProgressionStage) {
        const anchorPos = nxt !== null ? line.Start : line.End;
        void snakeInst;
        const gsS = makeGetRoomSettings(getBiomeRoomTypeFor(line.Style), { data: this.data, ctx: this.ctx }, line);
        gsS.x = Math.trunc(anchorPos.x);
        gsS.y = Math.trunc(anchorPos.y);
        const room = makeGetRoom(gsS, this.ctx.w, this.ctx.h, true, this.data);
        room.calculateRoom(this.data, this.ctx);
        out.push(room);
      }
    }
    return out;
  }

  /** CalculateRooms（:529-556）。 */
  private calculateRooms(snakeLines: DungeonControlLineRef[]): DRoomBase[] {
    const out: DRoomBase[] = [];
    for (let i = 1; i < snakeLines.length; i++) {
      const item = snakeLines[i]!;
      const prev = snakeLines[i - 1]!;
      if (item.ProgressionStage !== prev.ProgressionStage) {
        const room = this.tryMakeRegularRoomOnLine(item, 0.8, this.ctx.rd() - 0.5, { li: i, phase: 'stage' });
        if (room) out.push(room);
        continue;
      }
      for (let k = 0; k < 20; k++) {
        let value = this.ctx.rng.next() * 2.0 - 1.0;
        {
          const h = (globalThis as { __swI113?: unknown }).__swI113;
          if (h !== undefined) {
            drlMark(`DR|RV|i${_drlInstNext}|li=${i}|k=${k}|in=${bits64x(value)}|out=${bits64x(Math.sign(value) * Math.pow(Math.abs(value), 0.5))}`);
          }
        }
        value = Math.sign(value) * Math.pow(Math.abs(value), 0.5);
        const room = this.tryMakeRegularRoomOnLine(item, this.ctx.rng.next(), value, { li: i, phase: 'r20', ri: k });
        if (room) out.push(room);
      }
    }
    return out;
  }

  /** TryMakeRegularRoomOnLine（:558-575）。 */
  private tryMakeRegularRoomOnLine(line: DungeonControlLineRef, normAlong: number, normFrom: number, evt?: Record<string, unknown>): DRoomBase | null {
    const fluffN = 10;
    const rt = getGeneralRoomType(this.ctx.rng);
    const settings = makeGetRoomSettings(rt, { data: this.data, ctx: this.ctx }, line);
    const boundingRadius = settings.boundingRadius();
    const instIdx = this.snakeLines!.indexOf(line);
    const placed = this.snakeInst!.getRoomPositionInsideBorder(
      this.snakeInst!.lines[instIdx] as never, normAlong, normFrom, boundingRadius,
    );
    settings.orientation = placed.orientation as number;
    settings.x = Math.trunc(placed.pos.x);
    settings.y = Math.trunc(placed.pos.y);
    // ★IIIII99b2 DR|R/DR|Ro 尝试行（x86 TryMakeRegularRoomOnLine 钩同构；na/nf=f64 位型）
    const stageGate = (() => {
      const iL = instIdx;
      return iL > 0 && this.snakeLines![iL - 1]!.ProgressionStage !== line.ProgressionStage;
    })();
    drlMark(`DR|R|i${_drlInstNext}|li=${instIdx}|st=${stageGate ? 1 : 0}|na=${bits64x(normAlong)}|nf=${bits64x(normFrom)}|x=${settings.x}|y=${settings.y}|rt=${settings.roomType}|br=${boundingRadius}`);
    // ★IIIII97 attempt 级取证事件（li=线序 phase=r20|stage ri=循环内序 na/nf=归一距）
    if ((globalThis as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att) {
      (globalThis as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att!({
        ...evt, mc: (globalThis as { __swI103Mc?: number }).__swI103Mc ?? -1,
        liX: instIdx, na: normAlong, nf: normFrom, styleNum: line.Style.Style,
      });
    }
    const room = tryMakeRoom(this.data, this.ctx, settings.x, settings.y, settings, true, boundingRadius + fluffN);
    if (!room) {
      drlMark(`DR|Ro|i${_drlInstNext}|li=${instIdx}|ok=0`);
      return null;
    }
    room.calculateRoom(this.data, this.ctx);
    drlMark(`DR|Ro|i${_drlInstNext}|li=${instIdx}|ok=1`);
    return room;
  }

  /** CalculateDungeonBounds（:577-603）。
   *  ★IIIII192 定谳两刀：①C# 调用面=「CalculateDungeonBounds(data, list.Concat({starting}),
   *  halls)」（DualDungeonLayoutProvider.cs:469）——并集域=**常规房(list)+起始房+厅**，
   *  **不含**入口房与 Biome 房；②C# DungeonBounds 首元素语义——UpdateBounds(bounds) 在
   *  Width==0||Height==0（初值 0,0,0,0）时走 **SetBounds(首元素原值)**，后续才 min/max
   *  （DungeonBounds.cs:294-304）——本仓旧版 DBoundsFull(10,10,10,10) 基准并集 ⇒ L 基线
   *  10 vs C# 首房 Left ⇒ progBounds W/H 全错 → S1 标枪/CLUMP/LATE/TRAPS 等所有
   *  progBounds 消费窗同 roll 值落不同坐标（x86 S1 hit=59/ok=18 vs JS 43/11、rc 恒等的
   *  实锤签名）。 */
  private calculateDungeonBounds(hallList: DHallBase[], roomList?: DRoomBase[]): void {
    const data = this.data;
    const rooms = roomList ?? [...data.rooms];
    const count = data.gv.dungeonGenerationStyles.length;
    data.outerProgressionBounds = [];
    for (let i = 0; i < count; i++) {
      let first = true;
      let L = 0, T = 0, R = 0, B = 0;
      const upd = (l: number, t: number, r: number, b: number): void => {
        if (first) { L = l; T = t; R = r; B = b; first = false; return; }
        if (l < L) L = l;
        if (r > R) R = r;
        if (t < T) T = t;
        if (b > B) B = b;
      };
      for (const rm of rooms) upd(rm.outer.L, rm.outer.T, rm.outer.R, rm.outer.B);
      for (const hl of hallList) upd(hl.bounds.L, hl.bounds.T, hl.bounds.R, hl.bounds.B);
      if (T < data.outerPotential.T) T = data.outerPotential.T;
      if (B > data.outerPotential.B) B = data.outerPotential.B;
      if (R <= L) R = L + 1;
      if (B <= T) B = T + 1;
      const bb = new DBoundsFull(this.ctx.w, this.ctx.h);
      bb.L = L; bb.T = T; bb.R = R; bb.B = B;
      bb.calc();
      data.outerProgressionBounds.push(bb);
    }
  }

  /** ConvertSpecializedRooms（:669-968）全量。 */
  convertSpecializedRooms(rooms: DRoomBase[]): void {
    const r = this.ctx.rng;
    const data = this.data;
    let nShimmer = 2, nLivingWood = 2, nLivingMahogany = 2, nSpider = 2, nBeehive = 5, nCrystal = 6;
    switch (worldSizeOf(this.ctx.w)) {
      case 0: nShimmer = 2; nLivingWood = 2; nLivingMahogany = 2; nSpider = 2; nBeehive = 5; nCrystal = 6; break;
      case 1: nShimmer = 4; nLivingWood = 6; nLivingMahogany = 6; nSpider = 6; nBeehive = 8; nCrystal = 10; break;
      case 2: nShimmer = 6; nLivingWood = 10; nLivingMahogany = 10; nSpider = 8; nBeehive = 11; nCrystal = 14; break;
    }
    const listStyle1: DRoomBase[] = [];   // Cavern
    const listStyle8: DRoomBase[] = [];   // Jungle
    const listStyle6: DRoomBase[] = [];   // Hallow
    for (const room of rooms) {
      switch (room.settings.style.Style) {
        case 1: listStyle1.push(room); break;
        case 8: listStyle8.push(room); break;
        case 6: listStyle6.push(room); break;
      }
    }
    // —— Shimmer 池 ×2 轮 ——
    let pool = listStyle1.slice();
    let guard = 2000;
    const pickFrom = (arr: DRoomBase[]): DRoomBase | null =>
      arr.length ? arr[r.nextInt(arr.length)]! : null;
    while (guard > 0 && pool.length > 0 && nShimmer > 0) {
      guard--;
      if (guard <= 0) break;
      const cand = pickFrom(pool)!;
      if (cand.settings.onCurvedLine || cand.settings.orientation !== SO.Bottom) { removeFrom(pool, cand); continue; }
      if (cand.settings.roomType === DPRoomType.GenShapeDoughnut) { removeFrom(pool, cand); continue; }
      if (cand.floodedTileCount() < SHIMMER_TILE_THRESHOLD) { removeFrom(pool, cand); continue; }
      cand.settings.style = DungeonGenerationStyles.Shimmer;
      cand.settings.connectionOverride = connectToTopOfRoomOnly;
      nShimmer--;
      removeFrom(listStyle1, cand);
      removeFrom(pool, cand);
    }
    if (nShimmer > 0) {
      pool = listStyle1.slice();
      guard = 2000;
      while (guard > 0 && pool.length > 0 && nShimmer > 0) {
        guard--;
        if (guard <= 0) break;
        const cand = pickFrom(pool)!;
        if (cand.settings.onCurvedLine || cand.settings.orientation !== SO.Bottom) { removeFrom(pool, cand); continue; }
        if (cand.settings.roomType === DPRoomType.GenShapeDoughnut) { removeFrom(pool, cand); continue; }
        cand.settings.style = DungeonGenerationStyles.Shimmer;
        cand.settings.connectionOverride = connectToTopOfRoomOnly;
        nShimmer--;
        removeFrom(listStyle1, cand);
        removeFrom(pool, cand);
      }
    }
    // —— LivingWood 替换池 ——
    pool = listStyle1.slice();
    guard = 2000;
    while (guard > 0 && pool.length > 0 && nLivingWood > 0) {
      guard--;
      if (guard <= 0) break;
      const cand = pickFrom(pool)!;
      if (cand.settings.onCurvedLine || cand.settings.orientation === SO.Bottom) { removeFrom(pool, cand); continue; }
      const controlLine = cand.settings.controlLine!;
      const lwS = makeGetRoomSettings(DPRoomType.LivingTree, { data, ctx: this.ctx }, controlLine);
      lwS.style = DungeonGenerationStyles.LivingWood;
      lwS.connectionOverride = connectToBottomOfRoomOnly;
      lwS.x = cand.settings.x; lwS.y = cand.settings.y;
      if (!this.snakeInst!.isCircleInsideBorderWithMatchingStyle(
        this.resolveInstance(controlLine), v2(lwS.x, lwS.y), lwS.boundingRadius())) continue;
      const replaced = makeGetRoom(lwS, this.ctx.w, this.ctx.h, false, data);
      replaced.calculateRoom(data, this.ctx);
      if (!isAnyRoomInBounds(data, replaced.outer, { useOuterBounds: true, excludedRoom: cand })) {
        const idxData = data.rooms.indexOf(cand);
        const idxList = rooms.indexOf(cand);
        removeFrom(listStyle1, cand);
        removeFrom(pool, cand);
        if (idxData > -1) data.rooms[idxData] = replaced; else data.rooms.push(replaced);
        if (idxList > -1) rooms[idxList] = replaced; else rooms.push(replaced);
        nLivingWood--;
      }
    }
    // —— Spider 换皮池 ——
    pool = listStyle1.slice();
    guard = 2000;
    while (guard > 0 && pool.length > 0 && nSpider > 0) {
      guard--;
      if (guard <= 0) break;
      const cand = pickFrom(pool)!;
      if (cand.settings.onCurvedLine) { removeFrom(pool, cand); continue; }
      cand.settings.style = DungeonGenerationStyles.Spider;
      nSpider--;
      removeFrom(listStyle1, cand);
      removeFrom(pool, cand);
    }
    // —— Beehive 池 ——
    pool = listStyle8.slice();
    guard = 2000;
    while (guard > 0 && pool.length > 0 && nBeehive > 0) {
      guard--;
      if (guard <= 0) break;
      const cand = pickFrom(pool)!;
      if (cand.settings.onCurvedLine || cand.settings.orientation !== SO.Bottom) { removeFrom(pool, cand); continue; }
      if (cand.settings.roomType === DPRoomType.GenShapeDoughnut) { removeFrom(pool, cand); continue; }
      cand.settings.style = DungeonGenerationStyles.Beehive;
      cand.settings.connectionOverride = connectToTopOfRoomOnly;
      nBeehive--;
      removeFrom(listStyle8, cand);
      removeFrom(pool, cand);
    }
    // —— LivingMahogany 替换池 ——
    pool = listStyle8.slice();
    guard = 2000;
    while (guard > 0 && pool.length > 0 && nLivingMahogany > 0) {
      guard--;
      if (guard <= 0) break;
      const cand = pickFrom(pool)!;
      if (cand.settings.onCurvedLine || cand.settings.orientation === SO.Bottom) { removeFrom(pool, cand); continue; }
      const controlLine = cand.settings.controlLine!;
      const lmS = makeGetRoomSettings(DPRoomType.LivingTree, { data, ctx: this.ctx }, controlLine);
      lmS.style = DungeonGenerationStyles.LivingMahogany;
      lmS.connectionOverride = connectToBottomOfRoomOnly;
      lmS.x = cand.settings.x; lmS.y = cand.settings.y;
      if (!this.snakeInst!.isCircleInsideBorderWithMatchingStyle(
        this.resolveInstance(controlLine), v2(lmS.x, lmS.y), lmS.boundingRadius())) continue;
      const replaced = makeGetRoom(lmS, this.ctx.w, this.ctx.h, false, data);
      replaced.calculateRoom(data, this.ctx);
      if (!isAnyRoomInBounds(data, replaced.outer, { useOuterBounds: true, excludedRoom: cand })) {
        const idxData = data.rooms.indexOf(cand);
        const idxList = rooms.indexOf(cand);
        removeFrom(listStyle8, cand);
        removeFrom(pool, cand);
        if (idxData > -1) data.rooms[idxData] = replaced; else data.rooms.push(replaced);
        if (idxList > -1) rooms[idxList] = replaced; else rooms.push(replaced);
        nLivingMahogany--;
      }
    }
    // —— Crystal 池（C# while(num7--)/if>0 内体的双重 quirky 结构逐字转录）——
    pool = listStyle6.slice();
    guard = 2000;
    while (guard > 0 && pool.length > 0 && nCrystal > 0) {
      guard--;
      if (guard > 0) {
        const cand = pickFrom(pool)!;
        if (cand.settings.onCurvedLine) { removeFrom(pool, cand); continue; }
        cand.settings.style = DungeonGenerationStyles.Crystal;
        nCrystal--;
        removeFrom(listStyle6, cand);
        removeFrom(pool, cand);
        continue;
      }
      break;
    }
  }

  /** ConvertSpecializedHalls（:969-1018）。 */
  convertSpecializedHalls(halls: DHallBase[]): void {
    const r = this.ctx.rng;
    let num = worldSizeOf(this.ctx.w) === 0 ? 3 : worldSizeOf(this.ctx.w) === 1 ? 4 : 5;
    const list: DHallBase[] = [];
    for (const hall of halls) {
      if (hall.settings.style.Style === 1) list.push(hall);
    }
    let pool = list.slice();
    let guard = 2000;
    while (guard > 0 && pool.length > 0 && num > 0) {
      guard--;
      if (guard > 0) {
        const cand = pool[r.nextInt(pool.length)]!;
        if (cand.crackedBrick) { removeFrom(pool, cand); continue; }
        cand.settings.style = DungeonGenerationStyles.Spider;
        cand.settings.carveOnly = false;
        num--;
        removeFrom(list, cand);
        removeFrom(pool, cand);
        continue;
      }
      break;
    }
  }

  /** ref 行→蛇实例行（lines 数组按序投影 identity）。 */
  resolveInstance(refLine: DungeonControlLineRef): import('./DitherSnakePass').Vec2d extends never ? never : any {
    const idx = this.snakeLines!.indexOf(refLine);
    return this.snakeInst!.lines[idx < 0 ? 0 : idx] as never;
  }

  /** ProvideLayout（Provider.cs:399-459）主流程。 */
  provideLayout(snakeLines: DungeonControlLineRef[], snakeInst: import('./DitherSnakePass').DitherSnake, defaultStyle: DungeonStyleData): void {
    const data = this.data;
    const ctx = this.ctx;
    const iN = ++_drlInstNext;
    drlMark(`DR|S|i${iN}|INL rc=${drlRc()}`);
    data.defaultStyle = defaultStyle;
    this.snakeLines = snakeLines;
    this.snakeInst = snakeInst;
    const dataLocal0 = this.data;
    void dataLocal0;
    ctx.snap('dualEntranceRoom');
    const entranceRoom = this.calculateEntranceRoom();
    drlMark(`DR|S|i${iN}|EN rc=${drlRc()}`);
    const startingRoom = this.calculateStartingRoom(snakeLines[0]!);
    drlMark(`DR|S|i${iN}|ST rc=${drlRc()}`);
    this.calculateEntranceHall(entranceRoom, startingRoom);
    drlMark(`DR|S|i${iN}|EH rc=${drlRc()}`);
    ctx.snap('dualStartRooms');
    const biomeRooms = this.calculateBiomeRooms(snakeLines, snakeInst);
    drlMark(`DR|S|i${iN}|BIO n=${biomeRooms.length}|bt=${biomeRooms.map((r) => r.settings.roomType).join(',')}|mr=${drlMr()}|rc=${drlRc()}`);
    const regularRooms = this.calculateRooms(snakeLines);
    drlMark(`DR|S|i${iN}|RM n=${regularRooms.length}|mr=${drlMr()}|rc=${drlRc()}`);
    void biomeRooms;
    void regularRooms;
    ctx.snap('dualLayout');
    this.convertSpecializedRooms(regularRooms);
    drlMark(`DR|S|i${iN}|CSR dr=${data.rooms.length}|mr=${drlMr()}|rc=${drlRc()}`);
    // specialized 替换已就地写回 regularRooms 元素——hallway 域=biome+regular+starting
    const hallInput: DRoomBase[] = [...biomeRooms, ...regularRooms, startingRoom];
    (data as unknown as { hallSnake?: import('./DitherSnakePass').DitherSnake }).hallSnake = snakeInst;
    const calculator = new HallwayCalculator(data, ctx, hallInput, snakeLines);
    (data as unknown as { __i103Calc?: HallwayCalculator }).__i103Calc = calculator;
    const halls = calculator.generate();
    this.convertSpecializedHalls(halls);
    // ★IIIII172 厅类钉死钩（零掷,logging-only;与 x86 rig DR|HALL 同构对拍）：
    //   逐厅 hallType/Style/起讫/sine 三参/CrackedBrick/CarveOnly/RandomSeed。
    for (let hki = 0; hki < halls.length; hki++) {
      const hk = halls[hki]!;
      const s = hk.settings as HallSettingsBase & { magnitude?: number; iterations?: number; flipSine?: boolean };
      let extra = '';
      if (s.hallType === DPHallType.Sine) {
        extra = `|mg=${s.magnitude}|it=${s.iterations}|fs=${s.flipSine ? 1 : 0}`;
      }
      drlMark(`DR|HALL|i${iN}|k=${hki}|ht=${s.hallType}|st=${s.style.Style}`
        + `|sb=${hk.startPosition.x},${hk.startPosition.y}`
        + `|eb=${hk.endPosition.x},${hk.endPosition.y}`
        + `|cb=${hk.crackedBrick ? 1 : 0}|co=${s.carveOnly ? 1 : 0}|sd=${s.randomSeed}${extra}`);
    }
    drlMark(`DR|S|i${iN}|CSH h=${data.halls.length}|mr=${drlMr()}|rc=${drlRc()}`);
    ctx.snap('dualHalls');
    // ★IIIII192：并集域=C# list(常规房,CSR 就地替换后)+starting+ **calculator 局部 halls**
    //   （DualDungeonLayoutProvider.cs:469 实参面——**不含**入口房/biome 房，且**不含**
   //   data.halls 里的入口 stairwell 厅：其 Bounds 按竖井全域展开(:118 SetBounds 起点退化盒
   //   +GenerateHallway :211-214 !Processed 展开)会把并集 Top 拉到竖井顶——x86 实锤
   //   progBounds T=371(=常规房 r9 顶) vs 旧 JS T=347(竖井顶被 outerPotential 钳制值)）。
    this.calculateDungeonBounds(halls, [...regularRooms, startingRoom]);
    drlMark(`DR|S|i${iN}|BND rc=${drlRc()}`);
    // —— 房间 GenerateRoom 循环 + PreHallways 特征 ——
    // ★IIIII168：bbox 快照钩（dormant,零掷;__swI168BB 未挂载=零开销）——与 x86 rig
    //   DumpBox i{iN}r{i}a/b、i{iN}p{j}a/b 同位同构（域固定取 generate 前值）。
    const i168bb = (globalThis as { __swI168BB?: (tag: string, l: number, t: number, r: number, b: number) => void }).__swI168BB;
    for (let i = 0; i < data.rooms.length; i++) {
      const rm = data.rooms[i]!;
      const bl = i168bb ? rm.outer.L : 0, bt = i168bb ? rm.outer.T : 0, br = i168bb ? rm.outer.R : 0, bb2 = i168bb ? rm.outer.B : 0;
      i168bb?.(`i${iN}r${i}a`, bl, bt, br, bb2);
      // ★IIIII172：房心/内外径钉死钩（零掷;rugged 房专属;与 x86 DR|RC 同构）
      if (rm.settings.roomType === DPRoomType.BiomeRugged) {
        const rc = rm as unknown as { position: { x: number; y: number }; roomInnerSize: number; roomOuterSize: number; wallDepth: number };
        drlMark(`DR|RC|i${iN}|r=${i}|px=${rc.position.x}|py=${rc.position.y}|is=${rc.roomInnerSize}|os=${rc.roomOuterSize}|wd=${rc.wallDepth}`);
      }
      rm.generateRoom(data, ctx);
      i168bb?.(`i${iN}r${i}b`, bl, bt, br, bb2);
    }
    drlMark(`DR|S|i${iN}|RGN rc=${drlRc()}`);
    // ★IIIII172：房终态界域/形状账（零掷;与 x86 DR|RB 同构,protection 逐格差对拍用）
    for (let rbi = 0; rbi < data.rooms.length; rbi++) {
      const rb = data.rooms[rbi] as DRoomBase & { shapeDataOuter?: ShapeData };
      drlMark(`DR|RB|i${iN}|r=${rbi}|ty=${rb.settings.roomType}`
        + `|L=${rb.outer.L}|T=${rb.outer.T}|R=${rb.outer.R}|B=${rb.outer.B}`
        + `|iL=${rb.inner.L}|iT=${rb.inner.T}|iR=${rb.inner.R}|iB=${rb.inner.B}`
        + (rb.shapeDataOuter ? `|sc=${rb.shapeDataOuter.size()}` : ''));
    }
    ctx.snap('dualRoomsGen');
    for (let j = 0; j < data.rooms.length; j++) {
      const rm = data.rooms[j]!;
      const bl = i168bb ? rm.outer.L : 0, bt = i168bb ? rm.outer.T : 0, br = i168bb ? rm.outer.R : 0, bb2 = i168bb ? rm.outer.B : 0;
      i168bb?.(`i${iN}p${j}a`, bl, bt, br, bb2);
      rm.generatePreHallwaysFeatures?.(data, ctx);
      i168bb?.(`i${iN}p${j}b`, bl, bt, br, bb2);
    }
    drlMark(`DR|S|i${iN}|PRH rc=${drlRc()}`);
    ctx.snap('dualPreHall');
    // —— 大厅次序生成：cracked-brick → spider(style12) → 其余 ——
    const crackedList = data.halls.filter((hh) => hh.crackedBrick);
    const spiderList = data.halls.filter((hh) => hh.settings.style.Style === 12);
    let countGen = 0;           // C# num2 同口径：仅 calculated 时++
    let anyTouched = 0;
    for (let k = 0; k < crackedList.length; k++) {
      const hh = crackedList[k]!;
      void ++anyTouched;
      if (hh.calculated && !hh.generated) {
        const bl = i168bb ? hh.bounds.L : 0, bt = i168bb ? hh.bounds.T : 0, br = i168bb ? hh.bounds.R : 0, bb2 = i168bb ? hh.bounds.B : 0;
        i168bb?.(`i${iN}c${k}a`, bl, bt, br, bb2);
        countGen++; hh.generateHallData(data, ctx);
        i168bb?.(`i${iN}c${k}b`, bl, bt, br, bb2);
      }
    }
    for (let l = 0; l < spiderList.length; l++) {
      const hh = spiderList[l]!;
      void ++anyTouched;
      if (hh.calculated && !hh.generated) {
        const bl = i168bb ? hh.bounds.L : 0, bt = i168bb ? hh.bounds.T : 0, br = i168bb ? hh.bounds.R : 0, bb2 = i168bb ? hh.bounds.B : 0;
        i168bb?.(`i${iN}s${l}a`, bl, bt, br, bb2);
        // ★IIIII172：spider 厅 stamp 迹开闸（零掷;与 x86 DR|HGEN/DR|HST 同构）
        _i172SpiderSeq = 0;
        drlMark(`DR|HGEN|i${iN}|s${l}|k=${data.halls.indexOf(hh)}`);
        countGen++; hh.generateHallData(data, ctx);
        i168bb?.(`i${iN}s${l}b`, bl, bt, br, bb2);
      }
    }
    for (let m = 0; m < data.halls.length; m++) {
      const hh = data.halls[m]!;
      if (!hh.crackedBrick && hh.settings.style.Style !== 12) {
        void ++anyTouched;
        if (hh.calculated && !hh.generated) {
          const bl = i168bb ? hh.bounds.L : 0, bt = i168bb ? hh.bounds.T : 0, br = i168bb ? hh.bounds.R : 0, bb2 = i168bb ? hh.bounds.B : 0;
          i168bb?.(`i${iN}h${m}a`, bl, bt, br, bb2);
          countGen++; hh.generateHallData(data, ctx);
          i168bb?.(`i${iN}h${m}b`, bl, bt, br, bb2);
        }
      }
    }
    drlMark(`DR|S|i${iN}|HG g=${countGen}|mr=${drlMr()}|rc=${drlRc()}`);
    ctx.snap('dualHallsGen');
    // MakeDungeon :391-413（Dual 支跳过最高房扫描）
    const first = data.rooms[0]!;
    data.genPosX = first.inner.centerX();
    data.genPosY = first.inner.T;
  }

  /** getBiomeRoomTypeFor 挂载占位（真实表在文件尾 STYLE_BIOME_ROOM_TYPE）。 */
}

/** 各风格 BiomeRoomType 表（DungeonGenerationStyles.cs :103/:143/:183/:223/:266/:308/:349/
 *  :390/:430/:471/:513/:554/:595/:637/:677；Default 档缺省=Legacy）。 */
const STYLE_BIOME_ROOM_TYPE: Record<number, number> = {
  // ★IIIII98 第四轮勘误（BiomeRoomType 实表=DungeonGenerationStyles.cs，
  //   每块 BiomeRoomType 归属其**前一个** Style 块）：
  //   Style11/12/13→Rugged(:103/:143/:183)、Style1→**Structured**(:223)、
  //   Style2..5→Rugged(:266/:308/:349/:390)、Style15→**Structured**(:430)、
  //   Style6/7/9/14/8/10→Rugged(:471/:513/:554/:595/:637/:677 前注＝Style10 的
  //   Rugged?——逐块核对：Style8 Rugged(:637 前)，Style0(Default)→**Structured**(:718))。
  //   旧表误置 {4,9,15}=Structured 且缺 Style0 条目（Default 落 Legacy 回退）。
  0: DPRoomType.BiomeStructured,
  1: DPRoomType.BiomeStructured,
  2: DPRoomType.BiomeRugged,
  3: DPRoomType.BiomeRugged,
  4: DPRoomType.BiomeRugged,
  5: DPRoomType.BiomeRugged,
  6: DPRoomType.BiomeRugged,
  7: DPRoomType.BiomeRugged,
  8: DPRoomType.BiomeRugged,
  9: DPRoomType.BiomeRugged,
  10: DPRoomType.BiomeStructured,   // Temple(:677 BiomeStructured；Jungle=8 为 Rugged :637)
  11: DPRoomType.BiomeRugged,
  12: DPRoomType.BiomeRugged,
  13: DPRoomType.BiomeRugged,
  14: DPRoomType.BiomeRugged,
  15: DPRoomType.BiomeStructured,
};
function getBiomeRoomTypeFor(style: DungeonStyleData): number {
  return STYLE_BIOME_ROOM_TYPE[style.Style] ?? DPRoomType.Legacy;
}

/** GetHallwayConnectionPoints（Provider.cs:1096-1104；i113rsrc 构建号 1147）。
 *  ★IIIII100c：补 x86 rig 同位出口 Mark DR|HCW（两 q 值+两端点），并返回两侧质量——
 *  wrapper 内部对两端各重调一次 GtHCP，质量/点都可能异于裸查对。 */
function getHallwayConnectionPoints(roomA: DRoomBase, roomB: DRoomBase, ctx: DualLayoutCtx): { p1: V2; p2: V2; qm: number } {
  const r1 = roomGetHallwayConnectionPoint(roomA, ctx, v2(roomB.centerX(), roomB.centerY()));
  const r2 = roomGetHallwayConnectionPoint(roomB, ctx, v2(roomA.centerX(), roomA.centerY()));
  const q1 = r1.quality as number;
  const q2 = r2.quality as number;
  drlMark(`DR|HCW|i${_drlInstNext}|c1=${roomA.centerX()},${roomA.centerY()}|c2=${roomB.centerX()},${roomB.centerY()}`
    + `|q1=${q1}|q2=${q2}`
    + `|p1=${Math.trunc(r1.point.x)},${Math.trunc(r1.point.y)}|p2=${Math.trunc(r2.point.x)},${Math.trunc(r2.point.y)}`
    + `|mr=${drlMr()}|rc=${drlRc()}`);
  return { p1: r1.point, p2: r2.point, qm: Math.max(q1, q2) };
}

/** IsAnyRoomInBounds（DungeonData.cs:195-217）。 */
function isAnyRoomInBounds(data: DualDungeonData, bounds: DBoundsFull, settings: RoomSearchSettings): boolean {
  for (const rm of data.rooms) {
    if (settings.excludedRoom && rm === settings.excludedRoom) continue;
    if (settings.useOuterBounds ? rm.outer.intersectsO(bounds) : rm.inner.intersectsO(bounds)) return true;
  }
  return false;
}

// ── 入口装配（DungeonPass dual 分支调用面）─────────────────────────

export interface DualLayoutResult {
  posX: number;
  posY: number;
  /** ★IIIII105b：特征域载荷（GroundFurniture_DualDungeons 等内容特征的 per-seat 数据桥）。
   *  rooms=provider 全体房间（gen=generated、st=settings.style.Style、InnerBounds）；
   *  halls=provider 大厅（Bounds 为 hall 外框，C# DungeonHall.Bounds :126/:134 同名面）；
   *  scalar=data.globalFeatureScalar（DC.cs:375-382 max(1,rooms.Count/20) 双精度原值——
   *  截断发生在消费端 (int)((1f+(int)(w/4200))*scalar)）；styles=本座 dungeonGenerationStyles
   *  表（GetStyleForWall / IsConsideredDungeonWall 的 per-seat 扩张消费源）。 */
  featRooms?: Array<{ gen: boolean; st: number; L: number; T: number; R: number; B: number;
    /** ★IIIII107c：EarlyDual S1..S7 臂扩展面（可选字段,旧消费者零感知）——
     *  o*=OuterBounds 四界（DungeonBounds 域,含即 [L,R)×[T,B) 半开语义由消费端自解释）；
     *  bio=BiomeDungeonRoom 实例旗（S4 候选剔除门 cs:205-209）；
     *  ★IIIII111 R7：bt=roomType（BiomeRugged=5 追加拒 Banners/Paintings 的
     *  BiomeRuggedDungeonRoom.cs:45 房类覆写判别域）。 */
    oL?: number; oT?: number; oR?: number; oB?: number; bio?: boolean; bt?: number }>;
  featHalls?: Array<{ gen: boolean; st: number; L: number; T: number; R: number; B: number }>;
  /** ★IIIII111c：PD 面厅载荷（DungeonCrawler.cs:484-487 厅循环消费域）——
   *  ht=HallType（0 Legacy/2 Regular/3 Stairwell/4 Sine）、ent=IsEntranceHall
   *  （Stairwell 入口厅不带空体覆写，照走 start/end）；sdx/sdy/edx/edy=Start/End
   *  Direction.Y 消费域；pp=Sine PotentialPlatformPoints（cs :33-42 只在 |d.Y|≥0.65
   *  时受理）；extra=AddExtraPlatformsIfNeeded（Legacy/Regular 双座特典，cs :71-95：
   *  |dirY|≥0.65 时每 20 格 Lerp 采样点）。 */
  pdHalls?: Array<{ ht: number; st: number; ent: boolean;
    sx: number; sy: number; ex: number; ey: number; sdy: number; edy: number;
    pp?: Array<{ x: number; y: number; dy: number }>;
    /** ★IIIII114b2：maya 尾载荷（DungeonGlobalTraps.Temple 厅段 DungeonHall.Bounds +
     *  generated 门，C# Width=Right−Left 半开界）——generated 才参与掷位。 */
    gL?: number; gT?: number; gR?: number; gB?: number; gen?: boolean }>;
  scalar?: number;
  styles?: import('./DungeonStyles1457').DungeonStyleData[];
  /** ★IIIII111c：本座 genVars.dungeonStyle（Default style0 对象）——PD 面
   *  GetStyleForWall/GetStyleForTile 双 null 时的回退样式（DU.cs:82-84）。
   *  seat1 样式表无 style0 席位 ⇒ 不能从 styles[] 兜底。 */
  defaultStyle?: import('./DungeonStyles1457').DungeonStyleData;
  /** ★IIIII105c：BiomeChests_DualDungeons 桶（cs DungeonGlobalBiomeChests.cs:34-76）——
   *  键=settings.StyleData.Style；biome=BiomeDungeonRoom 实例（每样式至多一席,后写覆盖）；
   *  rooms=其余房 InnerBounds 列表（Next(list.Count) 采样+Remove）。 */
  chestPlan?: Record<number, { biome?: { L: number; T: number; R: number; B: number } | null; rooms: Array<{ L: number; T: number; R: number; B: number }> }>;
  /** ★IIIII106b：outerProgressionBounds（DU.cs CalculateDungeonBounds 同名面——每样式
   *  一席=全座房/厅外框并集经 outerPotential Top/Bottom 钳制；EarlyDual TileClump/DropTrap
   *  抽样窗消费源）。styles 数组同序。普通世界（provider 未跑）恒 undefined=零扰动。 */
  progBounds?: Array<{ L: number; T: number; R: number; B: number }>;
  /** ★IIIII109b：GenerateEarlyDungeonFeaturesInRoom 每房分派面载荷（cs:588-591 循环，
   *  BiomeRugged 主流掷钟乳石/浮石 + Structured 窗柱 + 基类窗/FloodRoom——全 self-seed
   *  除 rugged 外）。kind=DungeonRoomType（5=Rugged/6=Structured/3=LivingTree/其他=基类支）；
   *  winOK=房间级 CanGenerateFeatureAt(data,this,window,x,y) 的**静态档**（StyleData 子类
   *  覆写 Shimmer11/Beehive9 拒 Window + GenShape Hourglass2/Doughnut3 拒 Window；
   *  基类/其余档恒 true）。winPlat=WindowPlatformItemTypes（item id 域,窗台平台样式掷）；
   *  liquid=StyleData.LiquidType（>=0 时基类尾 FloodRoom）。 */
  earlyRooms?: DualEarlyRoom[];
}

export interface DualEarlyRoom {
  kind: number;
  st: number;
  seed: number;
  L: number; T: number; R: number; B: number;
  cx: number; cy: number;
  opt: number; opw: number;
  shape: number;
  hr: number; vr: number;
  liquid: number;
  brick: number; bwall: number;
  bPaint: number; bwPaint: number;
  winG: number; winGC: number; winE: number;
  /** WindowPlatformItemTypes 经 DerivedPlacementDetails 映射后的 **tileStyle 表**
   *  （GetWindowPlatformStyle 主流掷=Next(len)→表项;空表不掷恒 -1）。 */
  winPlatS: number[];
  /** PlatformItemTypes（GetPlatformStyle 掷=rugged 浮石 platformStyle；消费端按 cs
   *  DungeonGenerationStyleData.GetPlatformStyle 复刻：空表不掷、Next(len)→Derived.style）。 */
  plat: number[];
  winOK: boolean;
}

export interface DualLayoutOpts {
  /** MakeDungeon 头 dungeonLocation/j（precalc 改写后的本座锚） */
  x0: number;
  y0: number;
  /** 入口 precalc 结果（dungeonEntrancePosition!=Zero ⇒ precalc=true） */
  precalcOK: boolean;
  entX: number;
  entY: number;
  worldSize: number;
  /** ★IIIII93b：地牢实例序号（0=主座 even 样式表 / 1=第二座 odd 表 Snow·Desert·
   *  Hallow·Temple）——蛇槽 dualSnakes[k]、样式表 dualDungeonStyles(k)、界域
   *  potentialBounds[k]、genvars 双表全按 k 分流。缺省 0=IIIII92 单侧行为不变。 */
  k?: number;
}

/** worldSizeOf（WorldGen.cs:6518 同构：<=4200|<=6400）。 */
function worldSizeOf(w: number): number { return w <= 4200 ? 0 : w <= 6400 ? 1 : 2; }

function removeFrom<T>(arr: T[], item: T): void {
  const i = arr.indexOf(item);
  if (i > -1) arr.splice(i, 1);
}
function roomGetBounding(rm: DRoomBase): number { return rm.settings.boundingRadius(); }
void roomGetBounding;

/**
 * runDualDungeonLayout —— #33 Dungeon pass 的 dual 布局域全量。
 * 由 DungeonPass.runDungeonPass 在 seedFlags.dualDungeons 下调用，替代 legacy 布局段；
 * 爬升入口走廊与全后置特征仍在 DungeonPass 共享壳内继续。
 */
/** ★IIIII109b：窗台平台 item→DerivedPlacementDetails.tileStyle（Item.cs SetDefaults 逐项
 *  提取：94=(19,0)/631=(19,1)/632=(19,2)/633=(19,3)/913=(19,5)/1384..1386=(19,6..8)/
 *  2549=(19,18)/2629..2630=21+type−2627=(19,23..24)/3906=30+type−3903=(19,33)/
 *  3908=(19,35)/4311=(19,42)/4416=(19,43)）。 */
export const WINDOW_PLAT_ITEM_STYLE: Record<number, number> = {
  94: 0, 631: 1, 632: 2, 633: 3, 913: 5, 1384: 6, 1385: 7, 1386: 8,
  2549: 18, 2629: 23, 2630: 24, 3906: 33, 3908: 35, 4311: 42, 4416: 43,
  // ★IIIII111c：PD 面扩表（Item.cs SetDefaults 各平台 item 终态）——
  //  3903..3908 段=30+type−3903；5562/5770/5791/5812=DefaultToPlaceableTile(19,N)。
  3903: 30, 3907: 34, 3957: 37, 5562: 50, 5770: 55, 5791: 56, 5812: 57,
};

export function runDualDungeonLayout(ctx: DualLayoutCtx, opts: DualLayoutOpts): DualLayoutResult {
  const ddualK = opts.k ?? 0;                         // ★IIIII93b 参数化（前值恒 0=仅 dungeon#0）
  const st = ctx.st;
  setIsDual(true);
  setProbeStore(st);
  // 蛇实例：Dither_Snake pass 缓存（禁止重算——会重复消耗主流掷骰）
  const snakeInst = dualSnakes[ddualK]!;
  if (!snakeInst) {
    // 无蛇缓存（例如绕过蛇槽直调的诊断路径）：回退 legacy 布局信号
    throw new Error(`runDualDungeonLayout: dualSnakes[${ddualK}] 缺失——DitherSnake pass 未先行`);
  }
  const lines: DungeonControlLineRef[] = snakeInst.lines.map((ln) => ({
    Start: v2(ln.Start.x, ln.Start.y),
    End: v2(ln.End.x, ln.End.y),
    NormalizedLineDirection: v2(ln.NormalizedLineDirection.x, ln.NormalizedLineDirection.y),
    LineLength: ln.LineLength,
    Style: ln.Style,
    ProgressionStage: ln.ProgressionStage,
    CurveLine: ln.CurveLine,
  }));
  // 样式表/genvars/tier ctx（SetupDungeonGenVarVariables dual 支——DC.cs:111-128）
  const dEntry = dualDungeonState.dungeons[ddualK];
  const defaultTheme = dEntry?.theme >= 0 ? dEntry.theme : 0;
  const defaultStyle = buildDefaultStyleProject(defaultTheme);
  const styles = dualDungeonStyles(ddualK, !!ctx.gs.crimson, defaultStyle);
  const gv = buildDungeonGenVars(styles, true, {
    tileDungeon: boolArrayOf([41, 43, 44, 677, 678, 679]),
    wallDungeon: boolArrayOf([7, 8, 9, 94, 95, 96, 97, 98, 99]),
    crackedBricks: boolArrayOf([481, 482, 483]),
    glassWalls: boolArrayOf([21, 88, 89, 90, 91, 92, 93, 241, 242, 243]),
  });
  setGvHolder(gv, true);
  setTierGlobal(buildTierCtx(gv, ctx.w, ctx.h));
  // outerPotential（snake pass 已装配 dualDungeonState.potentialBounds[ddualK]）
  const pbSrc = dualDungeonState.potentialBounds[ddualK];
  const outerPot = new DBoundsFull(ctx.w, ctx.h);
  if (pbSrc) outerPot.set(Math.max(10, Math.min(ctx.w - 10, Math.trunc(pbSrc.l))), Math.max(10, Math.min(ctx.h - 10, Math.trunc(pbSrc.t))),
    Math.max(10, Math.min(ctx.w - 10, Math.trunc(pbSrc.r))), Math.max(10, Math.min(ctx.h - 10, Math.trunc(pbSrc.b))));
  else outerPot.set(Math.trunc(ctx.w * 0.05), Math.trunc((ctx.ws + 10) / ctx.h * ctx.h), Math.trunc(ctx.w * 0.45), ctx.h - 200);
  const data = new DualDungeonData(ctx.w, ctx.h, outerPot, gv);
  data.ug = !!ctx.gs.seedFlags.drunkWorld || !!ctx.gs.seedFlags.noSurface;   // ★IIIII206
  _dataRefValue = data;
  ctx.tierCtx = _tierGlobal;
  ctx.data = data;
  data.genPosX = opts.x0;
  data.genPosY = opts.y0;
  data.entranceX = opts.entX;
  data.entranceY = opts.entY;
  data.precalcFlag = opts.precalcOK;
  (globalThis as { __swI103K?: number }).__swI103K = ddualK;
  if (ddualK === 0) _drlInstNext = 0;
  const provider = new DualProvider(data, ctx);
  provider.provideLayout(lines, snakeInst, defaultStyle);
  // ★IIIII97 终表取证：本座房间/大厅指纹（与 rig SW_DRLOG DR|R|/DR|H| 行同构对拍）
  {
    const attE = (globalThis as { __swI103Att?: (e: Record<string, unknown>) => void }).__swI103Att;
    if (attE) attE({
      kind: 'rooms', k: ddualK,
      hallStats: { ...(data as unknown as { __i103Calc?: HallwayCalculator }).__i103Calc?.hallStats },
      list: data.rooms.map((rm) => ({
        x: rm.settings.x, y: rm.settings.y, rt: rm.settings.roomType,
        st: rm.settings.style.Style,
        ib: [rm.inner.L, rm.inner.T, rm.inner.R, rm.inner.B],
        ob: [rm.outer.L, rm.outer.T, rm.outer.R, rm.outer.B],
        br: rm.settings.boundingRadius(),
      })),
      halls: data.halls.map((hh) => ({
        ht: hh.settings.hallType, st: hh.settings.style.Style, cb: hh.crackedBrick ? 1 : 0,
        bd: [hh.bounds.L, hh.bounds.T, hh.bounds.R, hh.bounds.B],
      })),
    });
  }
  // —— 桥接：房间视图 + 界域投影（供下游 dgFeatures/dgBasicChests 消费）——
  for (const rm of data.rooms) {
    if (!rm.generated) continue;
    const legacy = rm instanceof DLegacyRoom;
    ctx.roomSink({
      x: rm.settings.x,
      y: rm.settings.y,
      ex: legacy ? rm.endPosV.x : rm.centerX(),
      ey: legacy ? rm.endPosV.y : rm.centerY(),
      strength: legacy ? Math.max(1, Math.trunc(rm.strengthVal)) : Math.max(1, Math.min(rm.inner.width, rm.inner.height)),
      generated: true,
      st: rm.settings.style.Style,
      // ★IIIII111c：PD 面载荷（BiomeDungeonRoom.cs:46 fluff0 支 + DC.cs:646 LivingTree 强制样式支）
      bio: rm instanceof DBiomeRoomBase,
      forceDP: !!(rm.settings as unknown as { forceStyleDP?: boolean }).forceStyleDP,
      leg: rm instanceof DLegacyRoom,
      innerL: rm.inner.L, innerR: rm.inner.R, innerT: rm.inner.T, innerB: rm.inner.B,
    });
  }
  // ★IIIII105b：特征域载荷桥（GroundFurniture_DualDungeons 消费；普通世界恒 undefined）
  const featRooms = data.rooms.map((rm) => ({
    gen: rm.generated, st: rm.settings.style.Style,
    L: rm.inner.L, T: rm.inner.T, R: rm.inner.R, B: rm.inner.B,
    // ★IIIII107c：S4 ConnectedRoom.OuterBounds 门 + BiomeDungeonRoom 剔除门投影
    oL: rm.outer.L, oT: rm.outer.T, oR: rm.outer.R, oB: rm.outer.B,
    bio: rm instanceof DBiomeRoomBase,
    // ★IIIII111 R7：房类型（BiomeDungeonRoom.cs:27 基类拒表 + BiomeRuggedDungeonRoom.cs:45
    //   追加拒 Banners/Paintings 的房类判别——bt=5 即 Rugged）
    bt: rm.settings.roomType,
  }));
  const featHalls = data.halls.map((hh) => ({
    gen: hh.generated, st: hh.settings.style.Style,
    L: hh.bounds.L, T: hh.bounds.T, R: hh.bounds.R, B: hh.bounds.B,
  }));
  // ★IIIII111c：PD 面厅载荷（DungeonCrawler.cs:484-487 厅循环=rooms 循环后同序遍历
  //  dungeonHalls 全集）——Stairwell 无 extra/Sine 走 pp/Legacy+Regular 走
  //  AddExtraPlatformsIfNeeded（DungeonHall.cs:71-95：|dirY|≥0.65 时每 20 格采样）。
  const pdHalls = data.halls.map((hh) => {
    const ht = hh.settings.hallType;
    // AddExtraPlatformsIfNeeded（DungeonHall.cs:71-95）——C# 用 Vector2(float) 做差向量
    //  与 SafeNormalize（float 域），距离用 double Distance；Lerp t=(float)(num4/num3)。
    const fx = fr(hh.endPosition.x), fy = fr(hh.endPosition.y);
    const sx0 = fr(hh.startPosition.x), sy0 = fr(hh.startPosition.y);
    const fdx = fr(fx - sx0), fdy = fr(fy - sy0);
    const dLen = Math.hypot(hh.endPosition.x - hh.startPosition.x, hh.endPosition.y - hh.startPosition.y);
    const fl = Math.hypot(fdx, fdy);
    const ndx = fdx !== 0 || fdy !== 0 ? fr(fdx / (fl === 0 ? 1 : fl)) : 0;
    const ndy = fdx !== 0 || fdy !== 0 ? fr(fdy / (fl === 0 ? 1 : fl)) : 0;
    const extra: Array<{ x: number; y: number; dy: number }> = [];
    if ((ht === DPHallType.Legacy || ht === DPHallType.Regular) && (ndy >= fr(0.65) || ndy <= fr(-0.65))) {
      let n4 = 20;
      while (n4 < dLen) {
        const t = fr(n4 / dLen);
        extra.push({ x: fr(sx0 + fr(fdx * t)), y: fr(sy0 + fr(fdy * t)), dy: ndy });
        n4 += 20;
      }
    }
    return {
      ht, st: hh.settings.style.Style, ent: (hh.settings as unknown as { isEntranceHall?: boolean }).isEntranceHall === true,
      sx: hh.startPosition.x, sy: hh.startPosition.y, ex: hh.endPosition.x, ey: hh.endPosition.y,
      sdy: hh.startDirection.y, edy: hh.endDirection.y,
      gL: hh.bounds.L, gT: hh.bounds.T, gR: hh.bounds.R, gB: hh.bounds.B, gen: hh.generated,
      pp: hh instanceof DSineHall
        ? hh.potentialPlatformPoints.filter((e) => e.d.y >= fr(0.65) || e.d.y <= fr(-0.65))
            .map((e) => ({ x: e.p.x, y: e.p.y, dy: e.d.y }))
        : extra,
    };
  });
  // ★IIIII105c：BiomeChests_DualDungeons 桶（array2/array 同构）
  const chestPlan: Record<number, { biome?: { L: number; T: number; R: number; B: number } | null; rooms: Array<{ L: number; T: number; R: number; B: number }> }> =
    Object.create(null);
  for (const rm of data.rooms) {
    const key = rm.settings.style.Style;
    const cell = chestPlan[key] ??= { biome: null as null | { L: number; T: number; R: number; B: number }, rooms: [] };
    // ★IIIII215：盒=(minX,minY,maxX,maxY) 原始 Lerp 域（DU.cs:296/300-302 两重载归一）：
    //  · 基类/Biome 房（DungeonRoom.Try:264-267 InnerBounds 形）：T=Center.Y=(Top+Bottom)/2。
    //  · Legacy 房（LegacyDungeonRoom.Try:91-96 覆写）：EndPosition±(int)((float)Strength×0.4f)
    //    对称盒——曾全桶统一 InnerBounds ⇒ Lerp 采样域错 → BIOMECHESTS 段 +1 掷 → 值流四段分叉。
    const cY = Math.trunc((rm.inner.T + rm.inner.B) / 2);
    if (rm instanceof DBiomeRoomBase) {
      cell.biome = { L: rm.inner.L, T: cY, R: rm.inner.R, B: rm.inner.B };
      continue;
    }
    if (rm instanceof DLegacyRoom) {
      const strV = Math.max(1, Math.trunc(rm.strengthVal));
      const n40 = Math.trunc(Math.fround(Math.fround(strV) * Math.fround(0.4)));
      const exI = Math.trunc(rm.endPosV.x), eyI = Math.trunc(rm.endPosV.y);
      cell.rooms.push({ L: exI - n40, T: eyI - n40, R: exI + n40, B: eyI + n40 });
      continue;
    }
    cell.rooms.push({ L: rm.inner.L, T: cY, R: rm.inner.R, B: rm.inner.B });
  }
  const scalar = Math.max(1.0, data.rooms.length / 20.0);   // DC.cs:381 双精度
  // ★IIIII109b：窗台平台 item→DerivedPlacementDetails.tileStyle（Item.cs SetDefaults 逐项
  //  提取：94=(19,0)/631=(19,1)/632=(19,2)/633=(19,3)/913=(19,5)/1384..1386=(19,6..8)/
  //  2549=(19,18)/2629..2630=21+type−2627=(19,23..24)/3906=30+type−3903=(19,33)/
  //  3908=(19,35)/4311=(19,42)/4416=(19,43)）。
  // ★IIIII109b：WindowPlatformItemTypes 逐档静态表（DungeonGenerationStyles.cs :75/:116/:156/
  //  :196/:239/:281/:322/:363/:403/:444/:486/:526/:568/:610/:650；Style0=GenVars.windowPlatformItemTypes
  //  [1386/1385/1384 by theme]——GenVars.cs 装配,defaultStyleProject 已携带）。
  const windowPlatformItemsFor = (styId: number, defPrj: DungeonStyleData): number[] => {
    if (styId === 0) return defPrj.PlatformItemTypes;
    switch (styId) {
      case 1: return [94, 4416];
      case 2: return [3908];
      case 3: return [4311];
      case 4: return [631];
      case 5: return [913];
      case 6: return [633];
      case 7: return [2549];
      case 8: return [632];
      case 9: return [2630];
      case 10: return [3906];
      case 11: return [94];
      case 12: return [94];
      case 13: return [2629];
      case 14: return [2629];
      case 15: return [633];
      default: return [94];
    }
  };
  // ★IIIII109b：GenerateEarlyDungeonFeaturesInRoom 每房分派面载荷（cs:588-591 次序=data.rooms 序）。
  //  window 玻璃/闭合/边墙与 WindowPlatformItemTypes 逐 cs DungeonGenerationStyles.cs 静态档转录；
  //  winOK=StyleData 子类 CanGenerateFeatureAt(data,room,window,·) 静态判（Shimmer11/Beehive9 拒
  //  Window;GenShape Hourglass2/Doughnut3 房级再拒）。doughnut 半径=InnerShape(CircleRoom) 原值
  //  （消费端取 Max(1,r/2) 自除）。
  const earlyRooms: DualEarlyRoom[] = data.rooms.map((rm) => {
    const sty = rm.settings.style;
    const gsCls = rm.settings as unknown as { shapeType?: number; innerShape?: RoomShape | null };
    const shape = rm instanceof DGenShapeRoom ? (gsCls.shapeType ?? -1) : -1;
    const innerCircle = (shape === GenShapeT.Doughnut && gsCls.innerShape instanceof CircleRoomShape)
      ? gsCls.innerShape as CircleRoomShape : null;
    let winOK = true;
    if (rm instanceof DGenShapeRoom) {
      if (shape === GenShapeT.Hourglass || shape === GenShapeT.Doughnut) winOK = false;   // GenShapeDungeonRoom.cs:43-51
    } else if (rm instanceof DBiomeRoomBase) {
      winOK = false;                                     // BiomeDungeonRoom 基类早特征空体（:40-42）
    }
    if (sty.Style === 9 || sty.Style === 11) winOK = false;   // Beehive/Shimmer StyleData 拒 DungeonWindow
    return {
      kind: rm.settings.roomType,
      st: sty.Style,
      seed: rm.settings.randomSeed,
      L: rm.inner.L, T: rm.inner.T, R: rm.inner.R, B: rm.inner.B,
      cx: rm.inner.centerX(), cy: rm.inner.centerY(),
      opt: rm.settings.overridePaintTile, opw: rm.settings.overridePaintWall,
      shape,
      hr: innerCircle ? innerCircle.hRad : 0, vr: innerCircle ? innerCircle.vRad : 0,
      liquid: sty.LiquidType,
      brick: sty.BrickTileType, bwall: sty.BrickWallType,
      bPaint: sty.TilePaintColor ?? -1, bwPaint: sty.WallPaintColor ?? -1,
      winG: sty.WindowGlassWallType, winGC: sty.WindowClosedGlassWallType, winE: sty.WindowEdgeWallType,
      winPlatS: windowPlatformItemsFor(sty.Style, defaultStyle).map((it) => WINDOW_PLAT_ITEM_STYLE[it] ?? -1),
      plat: sty.PlatformItemTypes,
      winOK,
    } satisfies DualEarlyRoom;
  });
  // ★IIIII106b：outerProgressionBounds 投影（provider 收口时 outerProgBounds 已由
  // calculateDungeonBounds 装配=styles 同序；空数组防御=legacy 回退面）
  const progBounds = (data.outerProgressionBounds ?? []).map((b2) => ({ L: b2.L, T: b2.T, R: b2.R, B: b2.B }));
  return { posX: data.genPosX, posY: data.genPosY, featRooms, featHalls, pdHalls, chestPlan, scalar, styles, defaultStyle, progBounds, earlyRooms };
}

function boolArrayOf(sheets: number[]): boolean[] {
  const arr: boolean[] = [];
  for (const s of sheets) arr[s] = true;
  return arr;
}

/** GetCurrentDungeonStyle（DC.cs:54-108 同构，主题由 Dunes 头掷定）。 */
function buildDefaultStyleProject(theme: number): DungeonStyleData {
  const g = {
    brickTileType: theme === 0 ? 41 : theme === 1 ? 43 : 44,
    brickCrackedTileType: theme === 0 ? 481 : theme === 1 ? 482 : 483,
    brickWallType: theme === 0 ? 7 : theme === 1 ? 8 : 9,
    windowGlassWallType: theme === 0 ? 91 : theme === 1 ? 92 : 90,
    windowClosedGlassWallType: theme === 0 ? 96 : theme === 1 ? 94 : 98,
    windowEdgeWallType: theme === 0 ? 8 : theme === 1 ? 9 : 7,
    windowPlatformItemTypes: [theme === 0 ? 1386 : theme === 1 ? 1385 : 1384],
  };
  return getCurrentDungeonStyle(g);
}
