// 原版 pass 18 "Full Desert" 移植(WorldGen.cs:5525 + GameContent/Biomes/Desert/*)。
// 沙丘:SandMound.Place 1:1——sqrt(1-t⁴) 四次超椭圆剖面 + ±10 双随机游走噪声,
// 中心削平,整柱纯沙(53)填充到 desert2.Bottom(无硬化沙分层——硬化沙只来自蜂巢壳)。
// 蜂巢(Sub-B):DesertHive 1:1——椭圆散点→深度2 DFS 簇→AttemptClaim 合并→
// 场强 Σ1/d² 前二大分层(3.5/1.8/0.7/0.25)；shell 骰与 0.25 门走 FastRandom 独立流。
// 入口(Sub-C):33%(Configuration.json 覆盖为 0.5)+Next(4) 四形状
// Chambers/Anthill/LarvaHole/Pit。记录 gs.undergroundDesert。
import type { TileStore } from '../../TileStore';
import { FastRandom } from '../../../core/rng';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';

const CLOUDS = idsByVanillaSheet(189, 196, 460, 717, 718, 719);

/** SurfaceMap.FromArea（Desert/SurfaceMap.cs 1:1）：全列首实心扫描（云族重置），
 *  Bottom 统计钳到 (int)worldSurface-10，Average=原始均值 */
function surfaceMapFromArea(st: TileStore, startX: number, width: number) {
  const half = Math.floor(st.h / 2);
  const hs = new Int16Array(width);
  let sum = 0, mn = 0x7fffffff, mx = 0;
  for (let i = 0; i < width; i++) {
    const x = startX + i;
    let flag = false, y = half + 50;
    if (x >= 0 && x < st.w) {
      for (let j = 50; j < 50 + half; j++) {
        const ti = st.idx(x, j);
        if (st.flags[ti]) {
          if (CLOUDS.has(st.type[ti])) flag = false;
          else if (!flag) { y = j; flag = true; }
        }
        if (!flag) y = half + 50;
      }
    }
    hs[i] = y; sum += y;
    if (y < mn) mn = y;
    if (y > mx) mx = y;
  }
  const cap = Math.floor(stWorldSurface(st)) - 10;
  if (mx > cap) mx = cap;
  return { heights: hs, average: sum / width, bottom: mx };
}
// GenState 没存 Main.worldSurface 引用——由调用方传 gs；为省参数用模块级钩子
let _wsRef: () => number = () => 300;
function stWorldSurface(_st: TileStore): number { return _wsRef(); }

export interface DesertDesc {
  combX: number; combY: number; combW: number; combH: number;
  hiveTop: number; hiveH: number;
  desertH: number;
  blockCols: number; blockRows: number;
  surface: Int16Array; surfaceX: number;
  surface2: Int16Array; surface2X: number;
}

/** RowHasInvalidTiles（DesertDescription.cs:96-110）：Bottom 行整列查 59/60/161/147 */
function rowHasInvalidTiles(st: TileStore, startX: number, bottomY: number, width: number): boolean {
  for (let i = startX; i < startX + width; i++) {
    if (i < 0 || i >= st.w) continue;
    const t = st.type[st.idx(i, bottomY)];
    if (t === MUD || t === JUNGLE_GRASS || t === ICE || t === SNOW) return true;
  }
  return false;
}

/** DesertDescription.CreateFromPlacement + SandMound.Place（1:1，Sub-A）。
 *  返回 null = 无效（RowHasInvalidTiles 命中）——blockRows 掷骰已消耗（原版语义） */
export function desertPlaceMound(st: TileStore, rng: RNG, x: number, worldSurface: number, skipCheck = false): DesertDesc | null {
  _wsRef = () => worldSurface;
  const { w, h } = st;
  const factor = w / 4200;
  const blockCols = Math.trunc(80 * factor);
  const blockRows = Math.trunc((rng.next() * 0.5 + 1.5) * 170 * factor);
  const width = Math.trunc(4 * blockCols);   // BlockScale.X=4
  const height = Math.trunc(2 * blockRows);  // BlockScale.Y=2
  const ox = x - Math.trunc(width / 2);      // origin.X -= num4/2（int 除）
  const sm = surfaceMapFromArea(st, ox - 5, width + 10);
  if (!skipCheck && rowHasInvalidTiles(st, ox, sm.bottom, width)) return null;
  // num6 = (int)(Average + Bottom) / 2 —— 先截断再 int 除（DesertDescription.cs:81）
  const topY = Math.trunc(sm.average + sm.bottom) / 2 | 0;
  const hiveTop = topY + rng.int(40, 59);    // Next(40,60)
  const desertH = hiveTop + Math.trunc(height / 2) - topY; // Desert.Height（未封顶）
  // ---- SandMound.Place（SandMound.cs 1:1）----
  let moundH = Math.min(desertH, Math.trunc(height / 2));  // min(Desert.Height, Hive.Height/2)
  const moundBottom = topY + moundH;                        // capped desert.Bottom
  const sandBottom = topY + desertH;                        // Desert.Bottom（沙柱底）
  let coarse = 0, fine = 0;
  for (let i = -5; i < width + 5; i++) {
    const cx = ox + i;
    let t = Math.abs((i + 5) / (width + 10)) * 2 - 1;
    t = Math.max(-1, Math.min(1, t));
    if (i % 3 === 0) coarse = Math.max(-10, Math.min(10, coarse + rng.int(-1, 1)));
    fine = Math.max(-10, Math.min(10, fine + rng.int(-1, 1)));
    const profile = Math.sqrt(1 - t * t * t * t);
    const surfY = moundBottom - Math.trunc(profile * moundH) + coarse;
    if (Math.abs(t) < 1 && cx >= 0 && cx < w) {
      // UnclampedSmoothStep=纯线性斜坡（Utils.cs:141-144），再立方——非平滑曲线
      const ramp = (Math.abs(t) - 0.5) / 0.3;
      const val = Math.min(10 + Math.trunc(topY - ramp * ramp * ramp * 20) + fine, surfY);
      const si = Math.max(0, Math.min(sm.heights.length - 1, i + 5)); // Surface[cx]=heights[cx-(ox-5)]
      const jStart = sm.heights[si] - 1;
      for (let j = jStart; j < val; j++) {
        if (j < 0 || j >= h) continue;
        const ti = st.idx(cx, j);
        st.flags[ti] = 0;          // active(false)（type 保留=幽灵，原版语义）
        st.wall[ti] = 0;
      }
    }
    // PlaceSandColumn：从 surfY 填到 sandBottom（沙/清液体/激活；height 可为负→零次）
    for (let y = surfY + (sandBottom - surfY) - 1; y >= surfY; y--) {
      if (y < 0 || y >= h) continue;
      const ti = st.idx(cx, y);
      st.type[ti] = SAND; st.flags[ti] = 1;
      st.liquid[ti] = 0; st.liquidType[ti] = 0;
    }
  }
  // UpdateSurfaceMap（mound 后重扫，入口/Hive 消费）
  const sm2 = surfaceMapFromArea(st, ox - 5, width + 10);
  return {
    combX: ox, combY: topY, combW: width, combH: hiveTop + height - topY,
    hiveTop, hiveH: height, desertH,
    blockCols, blockRows,
    surface: sm.heights, surfaceX: ox - 5,
    surface2: sm2.heights, surface2X: ox - 5,
  };
}

const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const SAND = T.SAND;
const SANDSTONE = TILE_BY_KEY['sandstone']!;
const HARDSAND = TILE_BY_KEY['hardened_sand']!;
const FOSSIL = TILE_BY_KEY['desert_fossil']!;

/** 放置循环 + Description + SandMound（Sub-A；Hive/入口在 runDesertPass 续） */
export function runDesertMoundOnly(st: TileStore, rng: RNG, gs: GenState): DesertDesc {
  const { w } = st;
  const half = Math.floor(w / 2);
  // DesertBiome pass 放置循环（cs:12538-12562 1:1）：失败重掷**永不早退**，
  // 2 次换向后 skipDesertTileCheck 恒过（此前 tries>w/2 早退=可能整图无沙漠）
  let side = gs.dungeonSide, tries = 0, flips = 0, skipCheck = false;
  let num4 = Math.trunc(rng.nextIntRange(0, half) / 8) + Math.trunc(half / 8);
  let x = half + num4 * -side;
  let desc: DesertDesc | null = null;
  for (;;) {
    desc = desertPlaceMound(st, rng, x, gs.worldSurface);
    if (desc) break;
    num4 = Math.trunc(rng.nextIntRange(0, half) / 2) + Math.trunc(half / 8)
      + rng.nextIntRange(0, Math.trunc(tries / 12));
    x = half + num4 * -side;
    if (++tries > Math.floor(w / 4)) {
      side = (-side) as 1 | -1;
      tries = 0;
      if (++flips >= 2) skipCheck = true;
    }
    if (skipCheck) {
      // 恒过：RowHasInvalidTiles 直接 false（GenVars.skipDesertTileCheck 语义）
      desc = desertPlaceMound(st, rng, x, gs.worldSurface, true);
      break;
    }
  }
  return desc!; // skipCheck 后 RowHasInvalidTiles 恒 false → 必非 null
}

// ---- 入口 + 蜂巢（Sub-C + Sub-B）。DesertBiome.Place 顺序（cs:21-42）：
//  mound → UpdateSurfaceMap → 入口（33% 门+Next(4)） → DesertHive.Place → CleanupArea。
//  入口必须在 Hive 之前（两侧共享同一条 genRand 流，次序即流位置）。
//  afterEntrance：入口完成、Hive 之前的对账钩子（oracle 的 desertentrance 检查点） ----
export function runDesertEntrancesAndHive(st: TileStore, rng: RNG, gs: GenState, desc: DesertDesc, afterEntrance?: () => void): void {
  const W = st.w, H = st.h;
  // UpdateSurfaceMap 后的表面图（DesertBiome.cs:22）；Surface[absoluteX]
  const surf2 = (ax: number) => desc.surface2[ax - desc.surface2X];

  // ================= WorldBuilding 微框架（入口 4 形状共用）=================
  // 与 caves-oracle.cs 的 WC/GW 逐行对应；哈希无关副作用（SquareWallFrame/SmoothSlope）
  // 两侧一致省略。quitOnFail 恒 false → apply 返回 false 不中断遍历。
  const shapeKey = (dx: number, dy: number) => dx * 4194304 + dy + 2097152;
  abstract class Ga {
    next: Ga | null = null;
    out: Set<number> | null = null;            // GenAction.OutputData（origin 相对坐标）
    abstract apply(ox: number, oy: number, x: number, y: number): boolean;
    protected ua(ox: number, oy: number, x: number, y: number): boolean {
      if (this.out) this.out.add(shapeKey(x - ox, y - oy));
      return this.next ? this.next.apply(ox, oy, x, y) : true;
    }
  }
  function chain(...xs: Ga[]): Ga {           // Actions.Chain：串 NextAction 返回链首
    for (let i = 0; i < xs.length - 1; i++) xs[i]!.next = xs[i + 1]!;
    return xs[0]!;
  }
  function outA(a: Ga, o: Set<number>): Ga { a.out = o; return a; }   // GenAction.Output

  const inW = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;
  const solidAt = (x: number, y: number) => inW(x, y) && st.flags[st.idx(x, y)] !== 0
    && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;
  const clearEverything = (x: number, y: number) => {
    const i = st.idx(x, y);
    st.type[i] = 0; st.flags[i] = 0; st.wall[i] = 0;
    st.liquid[i] = 0; st.liquidType[i] = 0; st.half[i] = 0; st.slope[i] = 0;
  };
  const resetToType = (x: number, y: number, t: number) => {   // Tile.ResetToType：墙保留，液体清零
    const i = st.idx(x, y);
    st.type[i] = t; st.flags[i] = 1; st.liquid[i] = 0; st.liquidType[i] = 0;
    st.half[i] = 0; st.slope[i] = 0;
  };

  // ---- Modifiers（Modifiers.cs 1:1，沙漠只用到默认 Blotches(2, 0.3)）----
  class Blotches extends Ga {
    apply(ox: number, oy: number, x: number, y: number): boolean {
      rng.next();                               // 先掷 1 次丢弃（L133）
      if (rng.next() < 0.3) {
        const a = rng.int(-1, 0), b = rng.int(0, 1), c = rng.int(-1, 0), d = rng.int(0, 1);
        for (let i = a; i <= b; i++) {
          for (let j = c; j <= d; j++) this.ua(ox, oy, x + i, y + j);
        }
        return true;
      }
      return this.ua(ox, oy, x, y);
    }
  }
  class Offset extends Ga {
    constructor(public dx: number, public dy: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return this.ua(ox, oy, x + this.dx, y + this.dy);
    }
  }
  class Expand extends Ga {
    constructor(public e: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      for (let i = -this.e; i <= this.e; i++) {
        for (let j = -this.e; j <= this.e; j++) this.ua(ox, oy, x + i, y + j);
      }
      return true;
    }
  }
  class IsSolid extends Ga {
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return solidAt(x, y) ? this.ua(ox, oy, x, y) : false;
    }
  }
  class NotInShape extends Ga {
    constructor(public d: Set<number>) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return this.d.has(shapeKey(x - ox, y - oy)) ? false : this.ua(ox, oy, x, y);
    }
  }
  class OnlyTiles extends Ga {
    constructor(public t: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (!inW(x, y)) return false;
      const i = st.idx(x, y);
      return st.flags[i] !== 0 && st.type[i] === this.t ? this.ua(ox, oy, x, y) : false;
    }
  }
  class SkipWalls extends Ga {
    constructor(public wt: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      return inW(x, y) && st.wall[st.idx(x, y)] !== this.wt ? this.ua(ox, oy, x, y) : false;
    }
  }
  // ---- Actions（Actions.cs 1:1）----
  class Clear extends Ga {
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) clearEverything(x, y);
      return this.ua(ox, oy, x, y);
    }
  }
  class ClearTile extends Ga {                 // ClearTile()：active=false（type/wall/液体保留）
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) { st.flags[st.idx(x, y)] = 0; st.half[st.idx(x, y)] = 0; st.slope[st.idx(x, y)] = 0; }
      return this.ua(ox, oy, x, y);
    }
  }
  class SetTile extends Ga {                   // Clear(~(Wiring|Actuator)) + type + active
    constructor(public t: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) {
        const i = st.idx(x, y);
        st.type[i] = this.t; st.flags[i] = 1; st.wall[i] = 0;
        st.liquid[i] = 0; st.liquidType[i] = 0; st.half[i] = 0; st.slope[i] = 0;
      }
      return this.ua(ox, oy, x, y);
    }
  }
  class PlaceWall extends Ga {
    constructor(public wt: number) { super(); }
    apply(ox: number, oy: number, x: number, y: number): boolean {
      if (inW(x, y)) st.wall[st.idx(x, y)] = this.wt;
      return this.ua(ox, oy, x, y);
    }
  }
  // ---- Shapes（Shapes.cs 1:1）----
  function genCircle(ox: number, oy: number, hR: number, vR: number, act: Ga): void {
    const num = (hR + 1) * (hR + 1);
    for (let i = oy - vR; i <= oy + vR; i++) {
      const n2 = hR / vR * (i - oy);
      const n3 = Math.min(hR, Math.trunc(Math.sqrt(num - n2 * n2)));
      for (let j = ox - n3; j <= ox + n3; j++) act.apply(ox, oy, j, i);
    }
  }
  function genRect(ox: number, oy: number, l: number, t: number, r: number, b: number, act: Ga): void {
    for (let i = ox + l; i < ox + r; i++) {
      for (let j = oy + t; j < oy + b; j++) act.apply(ox, oy, i, j);
    }
  }
  const genRectWH = (ox: number, oy: number, w: number, h: number, act: Ga) => genRect(ox, oy, 0, 0, w, h, act);
  // 解码必须 floor（oracle 的算术右移 >>22 同义）：trunc 对负 dx 会偏 1，
  // 令 genAll(All 形状) 的墙清零整体落空（负 dx 半区全写成界外 → 静默 no-op）
  const decode = (k: number): [number, number] => {
    const dx = Math.floor(k / 4194304);
    return [dx, k - dx * 4194304 - 2097152];
  };
  function genAll(ox: number, oy: number, d: Set<number>, act: Ga): void {   // ModShapes.All
    for (const k of d) {
      const [dx, dy] = decode(k);
      act.apply(ox, oy, ox + dx, oy + dy);
    }
  }
  const OUTLINE_OFFS = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, 1, -1, -1, 1, -1, -1];
  function genOutline(ox: number, oy: number, d: Set<number>, act: Ga): void {  // OuterOutline
    for (const k of d) {
      const [dx, dy] = decode(k);
      for (let i = 0; i < 16; i += 2) {
        if (!d.has(shapeKey(dx + OUTLINE_OFFS[i]!, dy + OUTLINE_OFFS[i + 1]!))) {
          act.apply(ox, oy, ox + dx + OUTLINE_OFFS[i]!, oy + dy + OUTLINE_OFFS[i + 1]!);
        }
      }
    }
  }
  function plotLine(x0: number, y0: number, x1: number, y1: number,
    plot: (x: number, y: number) => boolean, jump: boolean): boolean {   // Utils.PlotLine
    if (x0 === x1 && y0 === y1) return plot(x0, y0);
    const flag = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    if (flag) { const tx = x0; x0 = y0; y0 = tx; const tx1 = x1; x1 = y1; y1 = tx1; }
    const num = Math.abs(x1 - x0), num2 = Math.abs(y1 - y0);
    let num3 = Math.trunc(num / 2), num4 = y0;
    const num5 = x0 < x1 ? 1 : -1, num6 = y0 < y1 ? 1 : -1;
    for (let i = x0; i !== x1; i += num5) {
      if (!plot(flag ? num4 : i, flag ? i : num4)) return false;
      num3 -= num2;
      if (num3 >= 0) continue;
      num4 += num6;
      if (!jump && !plot(flag ? num4 : i, flag ? i : num4)) return false;
      num3 += num;
    }
    return true;
  }
  function genTail(ox: number, oy: number, width: number, ex: number, ey: number, act: Ga): void {
    // Shapes.Tail：像素域（×16）画楔形尾迹（Utils.PlotTileTale）
    const halfWidth = width * 8;                 // (width*16)/2
    const sx = ox << 4, sy = oy << 4;
    const endX = sx + ex * 16, endY = sy + ey * 16;
    const vx = endX - sx, vy = endY - sy;
    const len = Math.sqrt(vx * vx + vy * vy);
    const px = -(vy / len), py = vx / len;       // 单位法向
    const psx = Math.trunc(sx / 16), psy = Math.trunc(sy / 16);
    const pex = Math.trunc(endX / 16), pey = Math.trunc(endY / 16);
    let length = 0;
    plotLine(psx, psy, pex, pey, () => { length++; return true; }, true);
    length--;
    let curLength = 0;
    plotLine(psx, psy, pex, pey, (x, y) => {
      const num = 1 - curLength / length;
      curLength++;
      const p2x = Math.trunc((sx - px * halfWidth * num) / 16), p2y = Math.trunc((sy - py * halfWidth * num) / 16);
      const p3x = Math.trunc((sx + px * halfWidth * num) / 16), p3y = Math.trunc((sy + py * halfWidth * num) / 16);
      return plotLine(x + p2x - psx, y + p2y - psy, x + p3x - psx, y + p3y - psy,
        (tx, ty) => { act.apply(ox, oy, tx, ty); return true; }, false);
    }, true);
  }

  // ================= Sub-C：入口（DesertBiome.cs:23-40）=================
  // ChanceOfEntrance 被 Configuration.json 覆盖为 0.5（DesertBiome.cs:11 代码默认
  // 0.3333 不生效——曾按 0.3333 写导致门判定与原版分叉）
  if (rng.next() <= 0.5) {
    const kind = rng.nextIntRange(0, 4);        // Next(4)：Chambers/Anthill/LarvaHole/Pit
    if (kind === 0) chambersEntrance();
    else if (kind === 1) anthillEntrance();
    else if (kind === 2) larvaHoleEntrance();
    else pitEntrance();
  }
  afterEntrance?.();

  // ---- ChambersEntrance.cs 1:1：地表沙盘 + 之字形下行隧道 ----
  function chambersEntrance(): void {
    const centerX = desc.combX + Math.trunc(desc.combW / 2);   // Desert.Center.X
    const px = centerX + rng.int(-40, 40);                     // Next(-40,41)
    const py = surf2(px);
    const shapeData = new Set<number>();
    const data = new Set<number>();
    const ox = px, oy = py + 2;
    genCircle(ox, oy, 24, 12, chain(new Blotches(), outA(new SetTile(SAND), shapeData)));
    const hnum = desc.hiveTop - py;                            // Hive.Top - position.Y
    let num2 = rng.int(0, 1) !== 0 ? 1 : -1;                   // Next(2) != 0
    const list: Array<[number, number, number]> = [[px + -num2 * 26, py - 8, num2]];
    const num3 = rng.int(2, 3);                                // Next(2,4)
    for (let i = 0; i < num3; i++) {
      const num4 = Math.trunc((i + 1) / num3 * hnum) + rng.int(-8, 8);
      const num5 = num2 * rng.int(20, 40);
      const num6 = rng.int(18, 28);
      genCircle(px, py, Math.trunc(num6 / 2), 3, chain(
        new Offset(num5, num4), new Blotches(), outA(new Clear(), data), new PlaceWall(187)));
      list.push([num5 + Math.trunc(num6 / 2) * -num2 + px, num4 + py, -num2]);
      num2 *= -1;
    }
    genOutline(px, py, data, chain(new Expand(1), new OnlyTiles(SAND), new SetTile(HARDSAND), new PlaceWall(187)));
    const pairAct = chain(new IsSolid(), new Blotches(), new Clear(), new Expand(1),
      new PlaceWall(187), new OnlyTiles(SAND), new SetTile(HARDSAND));
    for (let j = 1; j < list.length; j++) {
      const pa = list[j - 1]!, pb = list[j]!;
      const connLen = Math.abs(pb[0] - pa[0]) * 1.5;
      for (let t = 0; t <= 1; t += 0.02) {
        const ax = pa[0] + pa[2] * connLen * t, ay = pa[1];
        const bx = pb[0] + pb[2] * connLen * (1 - t), by = pb[1];
        const cx = pa[0] + (pb[0] - pa[0]) * t, cy = pa[1] + (pb[1] - pa[1]) * t;   // Lerp(p0,p1,t)
        const dx = ax + (cx - ax) * t, dy = ay + (cy - ay) * t;                      // Lerp(v,v3,t)
        const ex = cx + (bx - cx) * t, ey = cy + (by - cy) * t;                      // Lerp(v3,v2,t)
        const fx = dx + (ex - dx) * t, fy = dy + (ey - dy) * t;                      // Lerp(v4,v5,t)
        genRectWH(Math.trunc(fx), Math.trunc(fy), 2, 4, pairAct);                    // .ToPoint()
      }
    }
    genRect(ox, oy, -29, -12, 29, 0, chain(new NotInShape(shapeData), new Expand(1), new PlaceWall(0)));
  }

  // ---- AnthillEntrance.cs 1:1：蚁丘沙锥 + 螺旋下行竖井 ----
  function anthillEntrance(): void {
    const num = rng.int(2, 3);                                  // Next(2,4)
    for (let i = 0; i < num; i++) {
      const holeRadius = rng.int(15, 17);                       // Next(15,18)
      const num2 = Math.trunc((i + 1) / (num + 1) * (desc.combW + 10)) + desc.combX;  // Surface.Width
      anthillAt(num2, surf2(num2), holeRadius);
    }
  }
  function anthillAt(px: number, py: number, holeRadius: number): void {
    const data = new Set<number>();
    const ox = px, oy = py + 6;
    genTail(ox, oy, holeRadius * 2, 0, -holeRadius * 1.5, outA(new SetTile(SAND), data));
    const pairA = chain(new Blotches(), new IsSolid(), new Clear(), new PlaceWall(187));
    const pairB = chain(new IsSolid(), new Clear(), new PlaceWall(187));
    const pairC = chain(new IsSolid(), new SetTile(HARDSAND), new PlaceWall(187));
    const pairD = chain(new SkipWalls(187), new SetTile(SAND));
    const pairE = new PlaceWall(187);
    let num = px;
    for (let i = py - holeRadius - 3; i < desc.hiveTop + (py - desc.combY) * 2 + 12; i++) {
      genRectWH(num, i, 1, 1, i < py ? pairB : pairA);
      genCircle(num, i, 2, 3, pairC);
      if (i % 3 === 0 && i >= py) {
        num += rng.int(-1, 1);                                  // Next(-1,2)
        genRectWH(num, i, 1, 1, pairA);
        if (i >= py + 5) {
          genCircle(num, i, holeRadius, 3, pairD);
          genCircle(num, i, holeRadius - 2, 3, pairE);
        }
        genCircle(num, i, 2, 3, pairC);
      }
    }
    genCircle(ox, oy - Math.trunc(holeRadius * 1.5) + 3, Math.trunc(holeRadius / 2), Math.trunc(holeRadius / 3),
      chain(new ClearTile(), new Expand(1), new PlaceWall(0)));
    // All(data)+Smooth：仅坡面/半砖——哈希无关，两侧一致省略
  }

  // ---- LarvaHoleEntrance.cs 1:1：地表空腔 + 尾迹洞 + 蜿蜒竖井 ----
  function larvaHoleEntrance(): void {
    const num = rng.int(2, 3);
    for (let i = 0; i < num; i++) {
      const holeRadius = rng.int(13, 15);                       // Next(13,16)
      const num2 = Math.trunc((i + 1) / (num + 1) * (desc.combW + 10)) + desc.combX;
      larvaAt(num2, surf2(num2), holeRadius);
    }
  }
  function larvaAt(px: number, py: number, holeRadius: number): void {
    const data = new Set<number>();
    genRect(px, py, -holeRadius, -holeRadius * 2, holeRadius, 0, outA(new Clear(), data));
    genTail(px, py, holeRadius * 2, 0, holeRadius * 1.5, outA(new Clear(), data));
    // All(data)+Offset(0,1)+Expand(1)+IsSolid+Smooth —— 仅坡面，哈希无关省略
    const pairA = chain(new Blotches(), new IsSolid(), new Clear(), new PlaceWall(187));
    const pairB = chain(new IsSolid(), new SetTile(HARDSAND), new PlaceWall(187));
    let num = px;
    for (let i = py + Math.trunc(holeRadius * 1.5); i < desc.hiveTop + (py - desc.combY) * 2 + 12; i++) {
      genRectWH(num, i, 1, 1, pairA);
      genCircle(num, i, 2, 3, pairB);
      if (i % 3 === 0) {
        num += rng.int(-1, 1);
        genRectWH(num, i, 1, 1, pairA);
        genCircle(num, i, 2, 3, pairB);
      }
    }
    genAll(px, py + 2, data, new PlaceWall(0));
    console.log(`[dbg] larvaAt px=${px} py=${py} hr=${holeRadius} data=${data.size} keys=[${[...data].slice(0, 5).join(',')}]`);
  }

  // ---- PitEntrance.cs 1:1（零掷骰）：漏斗形直落竖井 ----
  function pitEntrance(): void {
    const holeRadius = rng.int(6, 8);                           // Next(6,9)
    const px = desc.combX + Math.trunc(desc.combW / 2), py = surf2(desc.combX + Math.trunc(desc.combW / 2));
    const smootherStep = (delta: number) => {
      const d = Math.min(1, Math.max(0, delta));
      return 1 - Math.cos(d * 3.1415927410125732) * 0.5 - 0.5;   // C# (float)π 常量
    };
    const scaleAt = (yProgress: number) => yProgress < 0.6 ? 1
      : (1 - smootherStep((yProgress - 0.6) / 0.4)) * 0.5 + 0.5;
    for (let i = -holeRadius - 3; i < holeRadius + 3; i++) {
      const cx = i + px;
      if (cx < 0 || cx >= W) continue;
      const sj = surf2(cx);
      for (let j = sj; j <= desc.hiveTop + 10; j++) {
        if (j < 0 || j >= H) continue;
        let value = (j - sj) / (desc.hiveTop - desc.combY);
        value = Math.min(1, Math.max(0, value));
        const n3 = Math.trunc(scaleAt(value) * holeRadius);
        if (Math.abs(i) < n3) clearEverything(cx, j);
        else if (Math.abs(i) < n3 + 3 && value > 0.35) resetToType(cx, j, HARDSAND);
        let n4 = Math.abs(i / holeRadius);
        n4 *= n4;
        if (Math.abs(i) < n3 + 3 && (j - py) > 15 - 3 * n4) st.wall[st.idx(cx, j)] = 187;
      }
    }
    const hr2 = holeRadius + 4;
    for (let k = -hr2; k < hr2; k++) {
      const cx = k + px;
      if (cx < 0 || cx >= W) continue;
      let n5 = hr2 - Math.abs(k);
      n5 = Math.min(10, n5 * n5);
      for (let l = 0; l < n5; l++) {
        const y = l + surf2(cx);
        if (y < 0 || y >= H) continue;
        clearEverything(cx, y);
      }
    }
  }

  // ================= Sub-B：DesertHive（DesertHive.cs 1:1）=================
  // ---- ClusterGroup.Generate（椭圆散点→深度2 DFS→AttemptClaim→≥4 重组）----
  const gw = desc.blockCols, gh = desc.blockRows;
  const blockMap: boolean[][] = [];
  for (let c = 0; c < gw; c++) blockMap.push(new Array(gh).fill(false));
  {
    const num1 = Math.trunc(gw / 2) - 1, num2 = Math.trunc(gh / 2) - 1;
    const num3 = (num1 + 1) * (num1 + 1);
    for (let r = 0; r <= num2 * 2; r++) {       // 原版 i ∈ [0, 2*(H/2-1)]——末行不散点！
      const num4 = num1 / num2 * (r - num2);
      const num5 = Math.min(num1, Math.trunc(Math.sqrt(Math.max(0, num3 - num4 * num4))));
      for (let c = num1 - num5; c <= num1 + num5; c++) blockMap[c]![r] = rng.int(0, 1) === 0;
    }
  }
  const pointClusters: Array<Array<[number, number]>> = [];
  {
    const dfs = (x: number, y: number, level: number, acc: Array<[number, number]>) => {
      acc.push([x, y]);
      blockMap[x]![y] = false;
      const lv = level - 1;
      if (lv === -1) return;
      if (x > 0 && blockMap[x - 1]![y]) dfs(x - 1, y, lv, acc);
      if (x < gw - 1 && blockMap[x + 1]![y]) dfs(x + 1, y, lv, acc);
      if (y > 0 && blockMap[x]![y - 1]) dfs(x, y - 1, lv, acc);
      if (y < gh - 1 && blockMap[x]![y + 1]) dfs(x, y + 1, lv, acc);
    };
    for (let x = 0; x < gw; x++) {
      for (let y = 0; y < gh; y++) {
        if (blockMap[x]![y] && rng.int(0, 1) === 0) {
          const pc: Array<[number, number]> = [];
          dfs(x, y, 2, pc);
          if (pc.length > 2) pointClusters.push(pc);
        }
      }
    }
  }
  const idxMap: number[][] = [];
  for (let c = 0; c < gw; c++) idxMap.push(new Array(gh).fill(-1));
  pointClusters.forEach((pc, i) => { for (const [qx, qy] of pc) idxMap[qx]![qy] = i; });
  for (let ci = 0; ci < pointClusters.length; ci++) {
    for (const [px, py] of pointClusters[ci]!) {
      if (idxMap[px]![py] === -1) break;        // 原版 foreach 内 break
      const idx = idxMap[px]![py];
      const claim = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) return;   // 原版由调用点边界门保证
        const other = idxMap[nx]![ny];
        if (other === -1 || other === idx) return;
        const val = rng.int(0, 1) === 0 ? -1 : idx;
        for (const [qx, qy] of pointClusters[other]!) idxMap[qx]![qy] = val;
      };
      claim(px - 1, py); claim(px + 1, py); claim(px, py - 1); claim(px, py + 1);
    }
  }
  for (const pc of pointClusters) pc.length = 0;
  for (let x = 0; x < gw; x++) {
    for (let y = 0; y < gh; y++) {
      if (idxMap[x]![y] !== -1) pointClusters[idxMap[x]![y]]!.push([x, y]);
    }
  }
  for (const pc of pointClusters) if (pc.length < 4) pc.length = 0;
  const finalClusters: Array<Array<[number, number]>> = [];
  for (const pc of pointClusters) {
    if (pc.length <= 0) continue;
    finalClusters.push(pc.map(([bx, by]) => [
      bx + (rng.next() - 0.5) * 0.5, by + (rng.next() - 0.5) * 0.5,
    ] as [number, number]));
  }

  // ---- PlaceClustersArea（场强分层）----
  // ★shell 类型骰与 0.25 门走 FastRandom（DesertHive.cs:253/366）——与 genRand
  //  完全独立的第二条流，曾误用 rng.int/rng.next 造成每格 1-2 次幽灵掷骰
  const hiveW = desc.combW, hiveH = desc.hiveH;
  const fr = new FastRandom(gs.seed).withModifier(57005);
  for (let hi = -20; hi < hiveW + 20; hi++) {
    for (let hj = -20; hj < hiveH + 20; hj++) {
      const px = desc.combX + hi, py = desc.hiveTop + hj;
      if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;   // InWorld(i,j,1)
      let shellType: number = SAND;
      if (fr.nextMax(3) === 0) shellType = HARDSAND;                  // fastRandom.Next(3)
      const vx = (hi - 2) / hiveW * gw;       // (p-BlockScale/2)/Hive*Cluster
      const vy = (hj - 1) / hiveH * gh;
      let f1 = 0, f3 = 0, f2 = -1;
      for (let k = 0; k < finalClusters.length; k++) {
        const cl = finalClusters[k]!;
        const c0 = cl[0]!;
        if (Math.abs(c0[0] - vx) > 10 || Math.abs(c0[1] - vy) > 10) continue;
        let f6 = 0;
        for (const [bx, by] of cl) {
          const ddx = bx - vx, ddy = by - vy;
          f6 += 1 / (ddx * ddx + ddy * ddy);
        }
        if (f6 > f1) { if (f1 > f3) f3 = f1; f1 = f6; f2 = k; }
        else if (f6 > f3) f3 = f6;
      }
      const field = f1 + f3;
      const ex = (hi - 2) / hiveW * 2 - 1;    // (p-BlockScale/2)/Hive*2-One
      const ey = (hj - 1) / hiveH * 2 - 1;
      const isEdge = Math.sqrt(ex * ex + ey * ey) >= 0.8;   // Vector2D.Length()
      const i = st.idx(px, py);
      if (field > 3.5) {
        clearEverything(px, py);
        st.wall[i] = 187;
        if (f2 % 15 === 2) resetToType(px, py, FOSSIL);     // 获胜簇索引 %15==2
      } else if (field > 1.8) {
        st.wall[i] = 187;
        if (py < gs.worldSurface) st.liquid[i] = 0;         // else lava()：液量不变
        else st.liquidType[i] = 2;                          // 仅置岩浆类型位（原版事实）
        if (!isEdge || st.flags[i]) resetToType(px, py, SANDSTONE);
      } else if (field > 0.7 || !isEdge) {
        st.wall[i] = 216;
        st.liquid[i] = 0;
        if (!isEdge || st.flags[i]) resetToType(px, py, shellType);
      } else if (field > 0.25) {
        const fr2 = fr.withModifierXY(hi, hj);              // fastRandom.WithModifier(x,y)
        if (fr2.nextDouble() < (field - 0.25) / 0.45) {
          st.wall[i] = 187;
          if (py < gs.worldSurface) st.liquid[i] = 0;
          else st.liquidType[i] = 2;
          if (st.flags[i]) resetToType(px, py, shellType);
        }
      }
    }
  }

  // ---- AddTileVariance（DesertHive.cs:413-499）----
  // 第一遍：沙 53（含幽灵 53，不判 active）下方 2 格有非实心 → 酥化 397
  for (let vi = -20; vi < hiveW + 20; vi++) {
    for (let vj = -20; vj < hiveH + 20; vj++) {
      const px = desc.combX + vi, py = desc.hiveTop + vj;
      if (px < 1 || px >= W - 1 || py < 1 || py >= H - 1) continue;
      const s1 = py + 1 < H && solidAt(px, py + 1);
      const s2 = py + 2 < H && solidAt(px, py + 2);
      const i = st.idx(px, py);
      if (st.type[i] === SAND && (!s1 || !s2)) st.type[i] = HARDSAND;
    }
  }
  // 第二遍：396 顶部装饰（485/751/484/165/187）——放置两侧一致省略（PlaceTile
  // 是巨型框架，装饰为 1x1 非实心物），掷骰照原序消耗保持流对齐
  for (let wk = -20; wk < hiveW + 20; wk++) {
    for (let wl = -20; wl < hiveH + 20; wl++) {
      const px = desc.combX + wk, py = desc.hiveTop + wl;
      if (px < 5 || px >= W - 5 || py < 5 || py >= H - 5) continue;   // InWorld(,5)
      const i = st.idx(px, py);
      if (!st.flags[i] || st.type[i] !== SANDSTONE) continue;
      let flag = true;
      for (let n = -1; n >= -3; n--) {
        const y = py + n;
        if (y >= 0 && ((inW(px, y) && st.flags[st.idx(px, y)]) || (inW(px + 1, y) && st.flags[st.idx(px + 1, y)]))) { flag = false; break; }
      }
      let flag2 = true;
      for (let m = 1; m <= 3; m++) {
        const y = py + m;
        if (y < H && ((inW(px, y) && st.flags[st.idx(px, y)]) || (inW(px + 1, y) && st.flags[st.idx(px + 1, y)]))) { flag2 = false; break; }
      }
      if (flag && rng.int(0, 19) === 0) {      // Next(20)==0 → 485/751
        rng.int(0, 3);                         // style = Next(4)
        rng.int(0, 29);                        // Next(30)==0 → 751
      } else if (flag && rng.int(0, 4) === 0) {          // 484
      } else if ((flag !== flag2) && rng.int(0, 4) === 0) {  // 165
      } else if (flag && rng.int(0, 4) === 0) {          // 187
      }
    }
  }
}

export function runDesertPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const desc = runDesertMoundOnly(st, rng, gs);
  runDesertEntrancesAndHive(st, rng, gs, desc);

  // ExportDescriptionToEngine（DesertBiome.cs:54-58）：CombinedArea.Inflate(10,10)
  gs.undergroundDesert = {
    x0: Math.max(0, desc.combX - 10), y0: Math.max(0, desc.combY - 10),
    x1: Math.min(w, desc.combX + desc.combW + 10),
    y1: Math.min(h, desc.combY + desc.combH + 10),
  };
}

