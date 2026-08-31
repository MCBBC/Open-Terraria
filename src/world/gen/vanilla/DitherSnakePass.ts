// 双地牢控制线「抖动蛇」槽（原版 pass "Dual Dungeons Dither Snake"，注册点
// WorldGen.cs:14824-14826，位于 Slush(#31) 之后 / Dungeon(#33) 之前——dump 槽 #032）。
//
// 移植自 ../Terarria1458/：
//   - Terraria.GameContent.Biomes/DitherSnakePass.cs（190 行，全文件）：ApplyPass(:28-37)、
//     GenerateDungeonDitherSnake(:39-48)、CalculateDungeonDitherSnake(:50-189)
//   - Terraria.GameContent.Biomes/DitherSnake.cs：Add(:23-33)/SetTangents(:206-234)/
//     AdjustTangentsToPreventSelfIntersection(:236-256)
//   - Terraria.GameContent.Biomes/DungeonControlLine.cs：ctor(:68-92)/CacheNormals(:94-105)/
//     CanPaint(:107-163)/Paint(int,int)(:165-203)/GetStyleWithDitheredTransition(:205-219)/
//     SkipPaintForEdge(:221-263)/Paint(Rectangle)(:265-283)/IsSelfIntersecting(:285-305)/
//     AdjustTangentsToPreventSelfIntersection(:307-352)
//   - GenVars.DualDungeon_NormalizedDistanceSafeFromDither（GenVars.cs:304-312 属性直连
//     DungeonControlLine 静态字段；Reset 双地牢支 WorldGen.cs:11488-11490 赋值）。
//   - 风格表 DungeonGenerationStyles.cs（Cavern/Snow/Desert/Corruption/Crimson/Hallow/
//     Temple）+ GetCurrentDungeonStyle —— 本仓转录于 DungeonStyles1457.ts，此处只消费。
//
// 【可达性】pass 仅在 SecretSeed.dualDungeons.Enabled 注册（cs:14824 门）；普通世界不注册、
//   管线零调用零掷零写。dual 世界主流掷骰 = 两侧 Calculate 的每控制点成对 NextDouble +
//   涂绘阶段 SkipPaintForEdge 的边缘抖动掷（NextFloat/Next(3)/Next(2)/Next(4)，仅在带外沿
//   且「格子活性」门之后消耗）。x86 pc.txt 实测该槽 R≈31,281。
//
// 【写面】逐线段胶囊域内 tile.ClearEverything→active(type=BrickTileType,wall=BrickWallType)
//   + 不可破墙带（distance∈[r·NDSFD−4,r·NDSFD] → wall=350+tier 色位；色字节记本仓
//   paintWall，mile8 八通道不裁决但语义保真）。风格过渡用 Bayer[4×4] 抖动二值化。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_INTERNAL_BY_SHEET } from '../../../data/tiles';
import {
  getCurrentDungeonStyle,
  dualDungeonStyles,
  dualDungeonState,
  createPotentialDungeonBounds,
  refreshDualPotentialBounds,
  type DungeonStyleData,
} from './DungeonStyles1457';

const __swProcessEnv: Record<string, string | undefined> = (typeof process !== 'undefined') ? (process as unknown as { env?: Record<string, string | undefined> }).env ?? {} : {};


const fr = Math.fround;

/** Bayer 抖动矩阵（DitherSnakePass.cs:15-21 字面量）。取序 _bayerDither[x%4, y%4]
 *  （第一维=x 行号）。 */
export const BAYER_FLAT: Readonly<Float64Array> = (() => {
  const rows = [
    [0.0, 0.5, 0.125, 0.625],
    [0.75, 0.25, 0.875, 0.375],
    [0.1875, 0.6875, 0.0625, 0.5625],
    [0.9375, 0.4375, 0.8125, 0.3125],
  ];
  const t = new Float64Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) t[r * 4 + c] = rows[r]![c]!;
  }
  return t;
})();

// ★IIIII88 取证开关：SW_SNAKE_BAYER_T=1 时取转置序（证伪用；缺省照 cs 字面量 [x,y]）
const bayerAt = (x: number, y: number): number =>
  (__swProcessEnv ?? {}).SW_SNAKE_BAYER_T === '1'
    ? BAYER_FLAT[(y % 4) * 4 + (x % 4)]!
    : BAYER_FLAT[(x % 4) * 4 + (y % 4)]!;

// ── Vector2D 最小投影（纯 double 域，运算次序照 C#）──────────────────────────

interface V2 { x: number; y: number }
/** 兼容外部模块（DungeonDualLayout）的向量类型别名。 */
export type Vec2d = V2;

const v2 = (x: number, y: number): V2 => ({ x, y });
const dotV = (a: V2, b: V2): number => a.x * b.x + a.y * b.y;
const crossV = (a: V2, b: V2): number => a.x * b.y - a.y * b.x;
const lenOf = (a: V2): number => Math.sqrt(dotV(a, a));
function safeNormalize(v: V2, fallback: V2): V2 {
  // Vector2D.SafeNormalize：零向量→fallback，否则单位化（ReLogic 常规形）
  if (v.x === 0 && v.y === 0) return fallback;
  const l = lenOf(v);
  if (l === 0) return fallback;
  return v2(v.x / l, v.y / l);
}
/** RotatedBy(angle)：标准旋转阵。 */
function rotatedBy(v: V2, angle: number): V2 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return v2(c * v.x - s * v.y, s * v.x + c * v.y);
}
/** RotatedBy(angle, center)：绕 center 旋转（Vector2D 二参重载，曲线段使用 cs:170）。 */
function rotatedAround(p: V2, angle: number, center: V2): V2 {
  const dx = p.x - center.x, dy = p.y - center.y;
  const c = Math.cos(angle), s = Math.sin(angle);
  return v2(center.x + (c * dx - s * dy), center.y + (s * dx + c * dy));
}
const lerpN = (a: number, b: number, t: number): number => a + (b - a) * t;
const remapN = (v: number, lo: number, hi: number, olo: number, ohi: number): number =>
  olo + ((v - lo) / (hi - lo)) * (ohi - olo);

interface HitRect { l: number; t: number; r: number; b: number }

function toPoint(p: V2): { x: number; y: number } {
  return { x: Math.trunc(p.x), y: Math.trunc(p.y) };
}

// ── 控制线 ──────────────────────────────────────────────────────

class DungeonControlLine {
  Index = 0;
  prev: DungeonControlLine | null = null;
  next: DungeonControlLine | null = null;
  Start: V2;
  End: V2;
  StartTangent: V2;
  EndTangent: V2;
  StartNormal: V2 = v2(0, 0);
  EndNormal: V2 = v2(0, 0);
  CrossTangent = 0;
  StartRadius: number;
  EndRadius: number;
  NormalizedLineDirection: V2;
  LineLength: number;
  Style: DungeonStyleData;
  ProgressionStage: number;
  CurveLine: boolean;

  constructor(start: V2, end: V2, startRadius: number, endRadius: number, progressionStage: number, style: DungeonStyleData) {
    this.Start = start; this.End = end;
    this.StartRadius = startRadius; this.EndRadius = endRadius;
    this.ProgressionStage = progressionStage;
    this.Style = style;
    const vx = end.x - start.x, vy = end.y - start.y;
    this.LineLength = Math.sqrt(vx * vx + vy * vy);
    this.NormalizedLineDirection = safeNormalize(v2(vx, vy), v2(1, 0));   // SafeNormalize(UnitX)
    this.StartTangent = v2(0, 0);
    this.EndTangent = v2(0, 0);
    this.CurveLine = false;
  }

  private cacheNormals(): void {
    this.StartNormal = v2(this.StartTangent.y, -this.StartTangent.x);
    this.EndNormal = v2(-this.EndTangent.y, this.EndTangent.x);
    this.CrossTangent = crossV(this.StartTangent, this.EndTangent);
  }

  /** CanPaint（cs:107-163）。 */
  canPaint(x: number, y: number): { ok: boolean; distance: number; nlp: number } {
    const d1x = x - this.Start.x, d1y = y - this.Start.y;
    const num = dotV(v2(d1x, d1y), this.StartTangent);
    if (num < 0.0) {
      if (this.prev != null) return { ok: false, distance: 0, nlp: 0 };
      return { ok: true, distance: lenOf(v2(d1x, d1y)), nlp: 0.0 };
    }
    const d2x = x - this.End.x, d2y = y - this.End.y;
    const num2 = dotV(v2(d2x, d2y), this.EndTangent);
    if (num2 < 0.0) {
      if (this.next != null) return { ok: false, distance: 0, nlp: 0 };
      return { ok: true, distance: lenOf(v2(d2x, d2y)), nlp: 1.0 };
    }
    const num3 = dotV(v2(d1x, d1y), this.StartNormal);
    const num4 = dotV(v2(d2x, d2y), this.EndNormal);
    const num5 = (num + num2) / 2.0;
    const sqA = num * num, sqB = num2 * num2;
    const num6 = sqA / (sqA + sqB);
    const value = num3 * (1.0 - num6) + num4 * num6 - num5 * this.CrossTangent * num6 * (1.0 - num6);
    return { ok: true, distance: Math.abs(value), nlp: num6 };
  }

  /** GetStyleWithDitheredTransition（cs:205-219）。 */
  private styleWithDitheredTransition(x: number, y: number, nlp: number): DungeonStyleData {
    if (nlp < 0.25) {
      if (this.prev != null && this.prev.Style !== this.Style &&
        remapN(nlp, 0.0, 0.25, 0.5, 1.0) <= bayerAt(x, y)) {
        return this.prev.Style;
      }
    } else if (nlp > 0.75 && this.next != null && this.next.Style !== this.Style &&
      remapN(nlp, 0.75, 1.0, 0.0, 0.5) >= bayerAt(x, y)) {
      return this.next.Style;
    }
    return this.Style;
  }

  /** Paint(i,j)（cs:165-203）单格涂绘；genRand 只被 SkipPaintForEdge 消耗。 */
  private paintCell(st: TileStore, w: number, h: number, rng: RNG, x: number, y: number): void {
    const cp = this.canPaint(x, y);
    if (!cp.ok) return;
    const rad = lerpN(this.StartRadius, this.EndRadius, cp.nlp);
    const relDist = cp.distance / rad;
        if (relDist > 1.0) return;
    const style = this.styleWithDitheredTransition(x, y, cp.nlp);
    if (skipPaintForEdge(rng, st, w, h, x, y, style, relDist)) return;
    const brickInner = TILE_INTERNAL_BY_SHEET.get(style.BrickTileType) ?? -1;
    const ii = st.idx(x, y);
    // Tile.ClearEverything()（全通道归零）→ active(true)+type/wall 写入
    clearEverything(st, ii);
    st.flags[ii] |= 1;
    st.type[ii] = brickInner;
    st.wall[ii] = style.BrickWallType;
    if (style.UnbreakableWallProgressionTier <= 0 /* DualDungeonUnbreakableWallTiers.EarlyGame */) return;
    const num3 = Math.trunc(rad * ndsfdStatic);
    const num4 = cp.distance - num3;
    if (num4 >= -4.0 && num4 <= 0.0) {
      let tier = style.UnbreakableWallProgressionTier;
      if (num4 <= -2.0) tier += 16;
      st.wall[ii] = 350;
      st.paintWall[ii] = tier & 0xff;            // tile.wallColor(byte)
    }
  }

  /** Paint(Rectangle dungeonBounds)（cs:265-283）：胶囊包围盒 ∩ 地牢界域逐格涂。 */
  paintRect(st: TileStore, w: number, h: number, rng: RNG, box: HitRect): void {
    this.cacheNormals();
    const maxR = Math.max(this.StartRadius, this.EndRadius);
    const p1 = toPoint(this.Start), p2 = toPoint(this.End);
    let ux0 = Math.min(p1.x, p2.x), uy0 = Math.min(p1.y, p2.y);
    let ux1 = Math.max(p1.x, p2.x) + 1, uy1 = Math.max(p1.y, p2.y) + 1;
    const inf = Math.trunc(maxR);
    ux0 -= inf; uy0 -= inf; ux1 += inf; uy1 += inf;
    const ix0 = Math.max(ux0, box.l), iy0 = Math.max(uy0, box.t);
    const ix1 = Math.min(ux1, box.r + 1), iy1 = Math.min(uy1, box.b + 1);
    for (let x = ix0; x < ix1; x++) {
      for (let y = iy0; y < iy1; y++) {
        this.paintCell(st, w, h, rng, x, y);
      }
    }
  }

  /** ★IIIII92：IsInsideBorder（DungeonControlLine.cs:354-362）。 */
  isInsideBorder(x: number, y: number): boolean {
    const cp = this.canPaint(x, y);
    if (!cp.ok) return false;
    const rad = lerpN(this.StartRadius, this.EndRadius, cp.nlp);
    return cp.distance < rad * ndsfdStatic - 4.0;
  }

  /** GetPotentialRoomPosition（DungeonControlLine.cs:363-382）。 */
  getPotentialRoomPosition(normalizedDistanceAlong: number, normalizedOffset: number, roomRadius: number): V2 {
    let nx = lerpN(this.StartNormal.x, this.EndNormal.x, normalizedDistanceAlong);
    let ny = lerpN(this.StartNormal.y, this.EndNormal.y, normalizedDistanceAlong);
    const nl = Math.hypot(nx, ny);       // SafeNormalize(default) 零向量保零
    if (nl !== 0) { nx /= nl; ny /= nl; }
    const num = lerpN(this.StartRadius, this.EndRadius, normalizedDistanceAlong) * ndsfdStatic - 4.0 - roomRadius;
    const bx = lerpN(this.Start.x, this.End.x, normalizedDistanceAlong);
    const by = lerpN(this.Start.y, this.End.y, normalizedDistanceAlong);
    return { x: bx + nx * num * normalizedOffset, y: by + ny * num * normalizedOffset };
  }

  /** Center（DungeonControlLine.cs:51-62）：(End+Start)/2。 */
  center(): V2 {
    return { x: (this.Start.x + this.End.x) / 2.0, y: (this.Start.y + this.End.y) / 2.0 };
  }

  /** IsSelfIntersecting（cs:285-305） */
  private isSelfIntersecting(): boolean {
    this.cacheNormals();
    const num = crossV(this.StartNormal, this.EndNormal);
    const vx = this.End.x - this.Start.x, vy = this.End.y - this.Start.y;
    const value = crossV(v2(vx, vy), this.EndNormal) / num;
    const value2 = crossV(v2(vx, vy), this.StartNormal) / num;
    if (!(Math.abs(value) < this.StartRadius)) return Math.abs(value2) < this.EndRadius;
    return true;
  }

  /** AdjustTangentsToPreventSelfIntersection（cs:307-352） */
  adjustTangentsToPreventSelfIntersection(): boolean {
    if (!this.isSelfIntersecting()) return false;
    const newST = safeNormalize({
      x: this.StartTangent.x - this.EndTangent.x / 2.0,
      y: this.StartTangent.y - this.EndTangent.y / 2.0,
    }, v2(0, 0));
    const newET = safeNormalize({
      x: this.EndTangent.x - this.StartTangent.x / 2.0,
      y: this.EndTangent.y - this.StartTangent.y / 2.0,
    }, v2(0, 0));
    if (this.prev != null) {
      this.StartTangent = newST;
      this.prev.EndTangent = v2(-newST.x, -newST.y);
    }
    if (this.next != null) {
      this.EndTangent = newET;
      this.next.StartTangent = v2(-newET.x, -newET.y);
    }
    return true;
  }
}

/** DungeonControlLine.NormalizedDistanceSafeFromDither 静态镜像
 *  （GenVars.DualDungeon_NormalizedDistanceSafeFromDither 同源,Reset 期赋值）。 */
let ndsfdStatic = 1;

// ── ★IIIII92 查询面辅助（provider 域）─────────────────────────────

/** DitherSnake.ExtraBuffer（cs:19-20）：1/cos(π/6)。 */
const EXTRA_BUFFER = 1.0 / Math.cos(Math.PI / 6.0);

function lerpV(a: V2, b: V2, t: number): V2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function distance(a: V2, b: V2): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Utils.PlotLine（Terraria/Utils.cs:934-983, jump=true 标准 Bresenham）。 */
export function plotLine(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => boolean): boolean {
  if (x0 === x1 && y0 === y1) return plot(x0, y0);
  let sx = x0, sy = y0, ex = x1, ey = y1;
  const steep = Math.abs(ey - sy) > Math.abs(ex - sx);
  if (steep) { [sx, sy] = [sy, sx]; [ex, ey] = [ey, ex]; }
  const num = Math.abs(ex - sx);
  const num2 = Math.abs(ey - sy);
  let num3 = Math.trunc(num / 2);
  let num4 = sy;
  const num5 = sx < ex ? 1 : -1;
  const num6 = sy < ey ? 1 : -1;
  for (let i = sx; i !== ex; i += num5) {
    if (steep) {
      if (!plot(num4, i)) return false;
    } else if (!plot(i, num4)) return false;
    num3 -= num2;
    if (num3 >= 0) continue;
    if (num4 === ey) break;      // C# while(num4!=num6…) 同构护栏
    num4 += num6;
    num3 += num;
  }
  return true;
}

/** ★IIIII92：蛇槽计算产物缓存（dualDungeons 链 Dunes 后的 Dither_Snake pass 落盘,
 *  #33 Dungeon pass 直接取用——重算会重复消耗主流掷骰破坏流位对齐）。 */
export const dualSnakes: Array<DitherSnake | null> = [null, null];

/** Tile.ClearEverything 全通道归零投影。 */
function clearEverything(st: TileStore, idx: number): void {
  st.type[idx] = 0;
  st.slope[idx] = 0;
  st.half[idx] = 0;
  st.wire[idx] = 0;
  st.liquid[idx] = 0;
  st.liquidType[idx] = 0;
  st.paint[idx] = 0;
  st.paintWall[idx] = 0;
  st.frameX[idx] = 0;
  st.frameY[idx] = 0;
  st.flags[idx] = 0;
}

/** SkipPaintForEdge（DungeonControlLine.cs:221-263）。掷骰全部在早退门之后；
 *  「格子非活性」直接真返回（零掷）；短路对保持 && 求值序。 */
function skipPaintForEdge(
  rng: RNG, st: TileStore, w: number, h: number, x: number, y: number,
  style: DungeonStyleData, ndfp: number,
): boolean {
  if (ndfp <= ndsfdStatic) return false;
  const fade = 1.0 - (ndfp - ndsfdStatic) / (1.0 - ndsfdStatic);
  if (!style.EdgeDither) return fade < 0.25;
  if (!(x >= 5 && y >= 5 && x < w - 5 && y < h - 5)) return false;   // InWorld(x,y,5)
  const ii = st.idx(x, y);
  if ((st.flags[ii] & 1) === 0) return true;
  if (fade <= bayerAt(x, y)) return true;
  const num2v = lerpN(0.0, 0.949999988079071, 1.0 - fade);
  if (fr(rng.next()) <= num2v) return true;                          // (float)NextFloat()
  if (fade <= 3.0 / 32.0 && rng.nextIntRange(0, 3) !== 0) return true;   // Next(3)
  if (fade <= 0.125 && rng.nextIntRange(0, 2) === 0) return true;        // Next(2)
  if (fade <= 5.0 / 32.0 && rng.nextIntRange(0, 4) === 0) return true;   // Next(4)
  return false;
}

// ── DitherSnake 曲线族 ───────────────────────────────────────────

/** SnakeOrientation（Dungeon.cs/SnakeOrientation.cs）：Unknown/Top/Center/Bottom。 */
export const SnakeOrientation = { Unknown: 0, Top: 1, Center: 2, Bottom: 3 } as const;
export type SnakeOrientationValue = (typeof SnakeOrientation)[keyof typeof SnakeOrientation];

export class DitherSnake {
  lines: DungeonControlLine[] = [];

  /** DitherSnake.Add（cs:23-33）：链尾链接 + Index 自增。 */
  add(line: DungeonControlLine): void {
    if (this.lines.length > 0) {
      const last = this.lines[this.lines.length - 1]!;
      last.next = line;
      line.prev = last;
    }
    line.Index = this.lines.length;
    this.lines.push(line);
  }

  first(): DungeonControlLine { return this.lines[0]!; }
  last(): DungeonControlLine { return this.lines[this.lines.length - 1]!; }

  // ★IIIII92 新增查询面（DualDungeonLayoutProvider 消费域）───────────────
  // GetClosestLineTo（DitherSnake.cs:55-68）
  getClosestLineTo(pos: V2): DungeonControlLine | null {
    let best: DungeonControlLine | null = null;
    let dist = Infinity;
    for (const ln of this.lines) {
      const cx = (ln.Start.x + ln.End.x) / 2 - pos.x, cy = (ln.Start.y + ln.End.y) / 2 - pos.y;
      const d = Math.sqrt(cx * cx + cy * cy);        // Vector2D.Center.Distance
      if (d < dist) { best = ln; dist = d; }
    }
    return best;
  }

  /** GetLineContaining（DitherSnake.cs:70-95）：initialGuess 缺省=最近线，depth==3 返 null。 */
  getLineContaining(pos: V2, initialGuess?: DungeonControlLine | null, depth = 0): DungeonControlLine | null {
    let guess = initialGuess ?? this.getClosestLineTo(pos);
    if (!guess) return null;                          // C# 空表 NRE 域,JS 安全化
    if (depth === 3) return null;
    if ((pos.x - guess.Start.x) * guess.StartTangent.x + (pos.y - guess.Start.y) * guess.StartTangent.y < 0.0
      && guess.prev != null) {
      return this.getLineContaining(pos, guess.prev, depth + 1);
    }
    if ((pos.x - guess.End.x) * guess.EndTangent.x + (pos.y - guess.End.y) * guess.EndTangent.y < 0.0
      && guess.next != null) {
      return this.getLineContaining(pos, guess.next, depth + 1);
    }
    return guess;
  }

  /** GetPositionAlongSnake（DitherSnake.cs:97-112）：CanPaint(int,int) 双参出参重载,
   *  失败时 normalizedLineProgress=0.5；返回 Index + nlp。 */
  getPositionAlongSnake(pos: V2): number {
    const ln = this.getLineContaining(pos);
    if (!ln) return 0.5;                              // 与上同——空链安全垫
    let nlp = 0.5;
    const cp = ln.canPaint(Math.trunc(pos.x), Math.trunc(pos.y));
    if (!cp.ok) nlp = 0.5;
    else nlp = cp.nlp;
    return ln.Index + nlp;
  }

  /** IsCircleInsideBorderWithStyle（DitherSnake.cs:114-124）。 */
  isCircleInsideBorderWithStyle(style: DungeonStyleData, center: V2, radius: number): boolean {
    const near = this.getClosestLineTo(center);
    if (!near || near.Style !== style) return false;
    return this.isCircleInsideBorderWithMatchingStyle(near, center, radius);
  }

  /** IsCircleInsideBorderWithMatchingStyle（DitherSnake.cs:126-152）：12 圆周测试点 +
   *  ExtraBuffer=1/cos(π/6)。 */
  isCircleInsideBorderWithMatchingStyle(nearLine: DungeonControlLine, center: V2, radius: number): boolean {
    for (let i = 0; i < 12; i++) {
      const ang = Math.PI * 2.0 * i / 12.0;
      const num = radius * EXTRA_BUFFER;
      const px = center.x + Math.cos(ang) * num;
      const py = center.y + Math.sin(ang) * num;
      const lc = this.getLineContaining({ x: px, y: py }, nearLine);
      if (!lc || lc.Style !== nearLine.Style) return false;
      if (!lc.isInsideBorder(Math.trunc(px), Math.trunc(py))) return false;
    }
    return true;
  }

  /** GetRoomPositionInsideBorder（DitherSnake.cs:154-203）：GetPotentialRoomPosition 两极取
   *  orientation 分带 + 4 轮 0.8 收缩，全败落回 line.Center/Center 档。 */
  getRoomPositionInsideBorder(
    line: DungeonControlLine, normalizedDistanceAlong: number, normalizedDistanceFromIn: number,
    roomRadius: number,
  ): { pos: V2; orientation: SnakeOrientationValue } {
    let normalizedDistanceFrom = normalizedDistanceFromIn;
    const target = lerpV(line.Start, line.End, normalizedDistanceAlong);
    const potTop = line.getPotentialRoomPosition(normalizedDistanceAlong, -1.0, roomRadius);
    const potBottom = line.getPotentialRoomPosition(normalizedDistanceAlong, 1.0, roomRadius);
    const targetTop = potTop.y < potBottom.y ? potTop : potBottom;
    const targetBottom = potTop.y > potBottom.y ? potTop : potBottom;
    for (let i = 0; i < 4; i++) {
      const p = line.getPotentialRoomPosition(normalizedDistanceAlong, normalizedDistanceFrom, roomRadius);
      if (this.isCircleInsideBorderWithMatchingStyle(line, p, roomRadius)) {
        const dC = distance(p, target), dT = distance(p, targetTop), dB = distance(p, targetBottom);
        if (dC < dT && dC < dB) return { pos: p, orientation: SnakeOrientation.Center };
        else if (dT < dB) return { pos: p, orientation: SnakeOrientation.Top };
        return { pos: p, orientation: SnakeOrientation.Bottom };
      }
      normalizedDistanceFrom *= 0.8;
    }
    return { pos: line.center(), orientation: SnakeOrientation.Center };
  }

  /** IsLineInsideBorder(from,to,halfWidth)（DitherSnake.cs:229-247）：法向 ±halfWidth 双线。 */
  isLineInsideBorder(from: V2, to: V2, halfWidth: number): boolean;
  isLineInsideBorder(from: V2, to: V2): boolean;
  isLineInsideBorder(a1: V2, b1: V2, a2?: number | V2, b2?: V2): boolean {
    if (typeof a2 === 'number') {
      const dirx = b1.x - a1.x, diry = b1.y - a1.y;
      const dl = Math.hypot(dirx, diry);
      const nx = dl === 0 ? 1 : dirx / dl, ny = dl === 0 ? 0 : diry / dl;
      // SafeNormalize(UnitX).RotatedBy(π/2)=(−y,x)
      const ox = -ny * a2, oy = nx * a2;
      if (this.isLineInsideBorder({ x: a1.x + ox, y: a1.y + oy }, { x: b1.x + ox, y: b1.y + oy })) {
        return this.isLineInsideBorder({ x: a1.x - ox, y: a1.y - oy }, { x: b1.x - ox, y: b1.y - oy });
      }
      return false;
    }
    // 两点版（cs:249-267）：最近线作 initialGuess，PlotLine 逐格 check。
    let line = this.getClosestLineTo(a1);
    return plotLine(Math.trunc(a1.x), Math.trunc(a1.y), Math.trunc(b1.x), Math.trunc(b1.y),
      (x, y): boolean => {
        line = this.getLineContaining({ x, y }, line);
        return line != null && line.isInsideBorder(x, y);
      });
  }

  /** SetTangents（cs:206-234） */
  setTangents(): void {
    let cur = this.lines[0]!;
    cur.StartTangent = cur.NormalizedLineDirection;
    while (cur.next != null) {
      const nxt = cur.next;
      const avg = safeNormalize({
        x: cur.NormalizedLineDirection.x + nxt.NormalizedLineDirection.x,
        y: cur.NormalizedLineDirection.y + nxt.NormalizedLineDirection.y,
      }, v2(0, 0));
      nxt.StartTangent = avg;
      cur.EndTangent = v2(-avg.x, -avg.y);
      cur = nxt;
    }
    cur.EndTangent = v2(-cur.NormalizedLineDirection.x, -cur.NormalizedLineDirection.y);
  }

  /** AdjustTangentsToPreventSelfIntersection（cs:236-256）：全表反复过 ≤100 轮。 */
  adjustTangentsToPreventSelfIntersection(): void {
    for (let iter = 0; iter < 100; iter++) {
      let changed = false;
      for (const ln of this.lines) {
        if (ln.adjustTangentsToPreventSelfIntersection()) changed = true;
      }
      if (!changed) break;
    }
  }
}

// ── Pass 本体 ────────────────────────────────────────────────────

interface PerDungeonCtx {
  styles: DungeonStyleData[];
  box: HitRect;
  side: number;          // -1 Left / 1 Right
  location: number;
}

/** 计算一侧的控制线族（CalculateDungeonDitherSnake，cs:50-189 逐行）。
 *  主流掷骰=每个非折返控制点两颗 NextDouble（num16/num17 成对），其余零掷。 */
export function calculateSnake(
  ctx: PerDungeonCtx, rng: RNG, maxTilesX: number, maxTilesY: number,
): DitherSnake {
  void maxTilesY;
  const snake = new DitherSnake();
  const styles = ctx.styles;
  const box = ctx.box;
  const scale = maxTilesX / 4200.0;                     // num
  const num2 = Math.trunc(20.0 * scale);                // 列数（小世界 20）
  const styleCount = styles.length;
  const num3 = 1.0 / (num2 - 1);
  const num4 = 1.0 / (styleCount - 1);
  const boundsH = box.b - box.t;                        // DungeonBounds.Height=Bottom-Top
  const boundsW = box.r - box.l;
  const num5 = boundsH / styleCount;
  const num6c = 1.0 - ndsfdStatic;
  const num7 = num5 / 2.0 * (1.0 + num6c / 2.0) - 1.0;
  const num8 = num7 - 0.1 * scale * num5;
  const num9 = 0.05;
  const num10 = remapN(scale, 1.0, 2.0, 1.0, 1.5);      // Utils.Remap(num,1,2,1,1.5)
  const num11 = num7 + num5 / 2.0 * num10;
  const num12 = num7;
  const val = v2(box.l + num11, box.t + num12);         // cs:114-115
  const span = v2(boundsW - num11 * 2.0, boundsH - num12 * 2.0);   // cs:116-117
  const num13 = Math.min(num7 - num8, span.x * num3 / 2.0);        // cs:118
  let startRadius = num7;
  let start = v2(0, 0);
  const totalPts = num2 * styleCount;
  const perStyle = Math.trunc(totalPts / styleCount);   // cs:123 int 除
  let num16 = num7;
  let num17 = num7;
  let i = -1;
  while (++i < totalPts) {
    const col = i % num2;
    const row = Math.trunc(i / num2);
    const num20base = num3 * col;
    const num21 = num4 * row;
    let sign = ctx.side === -1 ? 1 : -1;                // cs:133（Left=+1）
    if (row % 2 === 1) sign *= -1;
    let px = num20base;
    if (sign < 0) px = 1.0 - px;
    let val3 = v2(val.x + span.x * px, val.y + span.y * num21);   // cs:142
    if (i === 0) { start = val3; continue; }
    if (row === 0 && (val3.x - ctx.location) * sign < 0.0) {       // cs:148-152
      start = v2(ctx.location, val3.y);
      continue;
    }
    num16 = lerpN(Math.max(num8, num16 - num13), Math.min(num7, num16 + num13), rng.next());
    num17 = lerpN(Math.max(num8, num17 - num13), Math.min(num7, num17 + num13), rng.next());
    const num23 = (num16 + num17) / 2.0;
    val3 = v2(val3.x, val3.y + (num16 - num17) / 2.0);            // cs:156 Y 抖动
    const stage = Math.trunc(i / perStyle);                       // cs:157
    const style = styles[Math.min(stage, styleCount - 1)]!;
    const line = new DungeonControlLine(start, val3, startRadius, num23, stage, style);
    snake.add(line);
    start = val3;
    startRadius = num23;
    if (col === num2 - 1 && row !== styleCount - 1) {             // cs:163-181 曲线段
      const val4 = val3;
      const val5 = v2(val3.x + span.x * 0.0, val3.y + span.y * num4);
      const val6 = v2(lerpN(val4.x, val5.x, 0.5), lerpN(val4.y, val5.y, 0.5));
      for (let t = num9; t < 0.5; t += num9) {
        val3 = rotatedAround(val4, Math.PI * 2.0 * t * sign, val6);
        val3 = v2(lerpN(val3.x, val6.x, 1.0 - num10), val3.y);    // cs:171 X 收拢
        const curline = new DungeonControlLine(start, val3, startRadius, num23, stage, style);
        curline.CurveLine = true;
        snake.add(curline);
        start = val3;
        startRadius = num23;
      }
      i++;                                                        // cs:180 折返耗一列
    }
  }
  snake.setTangents();                                            // cs:183
  const signTail = ctx.side === -1 ? 1 : -1;                      // cs:184
  snake.first().StartTangent = v2(signTail, 0);                   // UnitX*side
  snake.last().EndTangent = v2(signTail, 0);
  snake.adjustTangentsToPreventSelfIntersection();                // cs:187
  return snake;
}

/** 单地牢四大件：主题派生样式表 + outer 界域。
 *  ApplyPass（cs:28-37）序=dungeon#0 计算+涂、再 #1 计算+涂（genRand 不重置）。 */
export function runDualDungeonsDitherSnakePass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  if (dualDungeonState.dungeons.length < 2) return;
  ndsfdStatic = dualDungeonState.normalizedDistanceSafeFromDither;
  const undergroundEnt = !!gs.seedFlags.drunkWorld || !!gs.seedFlags.noSurface;
  refreshDualPotentialBounds(w, h, gs.worldSurface, gs.genWorldSurfaceHigh, undergroundEnt);
  for (let k = 0; k < 2; k++) {
    const d = dualDungeonState.dungeons[k]!;
    const defaultStyle = buildDefaultStyle(d.theme >= 0 ? d.theme : 0);
    const styles = dualDungeonStyles(k, !!gs.crimson, defaultStyle);
    const pb = createPotentialDungeonBounds(w, h, gs.worldSurface, gs.genWorldSurfaceHigh, d.side < 0, undergroundEnt);
    dualDungeonState.potentialBounds[k] = pb;
    const ctx: PerDungeonCtx = { styles, box: pb, side: d.side, location: d.location };
    const snake = calculateSnake(ctx, rng, w, h);
    dualSnakes[k] = snake;              // ★IIIII92：#33 provider 消费缓存
    for (const line of snake.lines) {
      line.paintRect(st, w, h, rng, ctx.box);
    }
  }
}

/** GetCurrentDungeonStyle（DC.cs:54-108 已在 Dunes 头掷主题）→ Default 档样式投影。 */
function buildDefaultStyle(theme: number): DungeonStyleData {
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
