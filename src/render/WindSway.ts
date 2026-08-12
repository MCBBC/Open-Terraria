// 原版风摆动系统 1:1 移植（TileDrawing.cs）：
//   相位钟        Update :377-380（树/草/向日葵/藤蔓四钟，风速加速）
//   GetWindCycle  :7800（cos 相位波 + WindForVisuals + 0.08→0.18 无风门）
//   WindGrid      WindGrid.cs（玩家移动扰动网格 + 三角波脉冲）
//   路由          主绘制循环 :536-728（特殊点分类 = 本模块的 swayKind）
//   绘制          DrawBasicGrass :8500 / DrawAnyDirectionalGrass :8538 /
//                 DrawTrees :8184 / DrawMultiTileGrassInWind :9080 /
//                 DrawVineStrip :9170 / DrawRisingVineStrip :9258 /
//                 DrawMultiTileVinesInWind :9407
//   风门          WorldGen.InAPlaceWithWind :87603（地表+无液体+墙 AllowsWind）
//
// 架构：摆动图块从 ChunkCache 烘焙中摘除（swayBakeSkip），由 Renderer 在 tile 层之后
// 逐帧动态绘制（等价原版 AddSpecialPoint 特殊绘制路径）。光照合成在其后，自动受光。
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { drawVanillaCell, drawTreeCell, type TreeStyleData } from './VanillaTiler';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import type { World } from '../world/World';
import { options } from '../core/Options';

// ---- TileID.Sets（TileID.cs :263-275 / WallID.cs :54） ----
/** SwaysInWindBasic：走 DrawBasicGrass 逐格摆动（:273） */
const SWAYS_IN_WIND_BASIC = new Set([3, 20, 24, 61, 703, 71, 73, 74, 83, 84, 110, 113, 201, 227, 529, 590, 595, 615, 624, 700, 656, 701, 637]);
/** tile 227 特定 frameX 不摆（ShouldSwayInWind :7834，掉落原版走普通绘制路径） */
const SWAY_227_EXCLUDE_FX = new Set([204, 238, 408, 442, 476]);
/** 184（蘑菇植物族）：DrawAnyDirectionalGrass 四向摆动 */
const DIRECTIONAL_GRASS = new Set([184]);
/** MultiTileGrass（DrawMultiTileGrass 尺寸表 :8922-8970） */
const MULTI_GRASS = new Set([27, 233, 236, 238, 485, 489, 490, 493, 519, 521, 522, 523, 524, 525, 526, 527, 530, 651, 652, 705, 702]);
/** VineThreads（TileID.cs :263）：DrawVineStrip 链式下垂 */
const VINE_THREADS = new Set([52, 62, 115, 205, 382, 528, 636, 638]);
/** ReverseVineThreads（:265）：549 向上生长链 */
const REVERSE_VINE = new Set([549]);
/** MultiTileVine（路由 :543-602 + 尺寸表 :9012-9044） */
const MULTI_VINE = new Set([34, 42, 91, 95, 126, 270, 271, 444, 454, 465, 572, 581, 591, 592, 660, 698]);
/** 摆动树族（DrawTrees switch :8213-8226；蘑菇树 72 与棕榈干不摆） */
const TREE_SWAY_SHEETS = new Set([5, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634, 323]);
/** WallID.Sets.AllowsWind（WallID.cs :54）——有挡风墙处不摆 */
const ALLOWS_WIND = new Set([0, 150, 138, 145, 107, 152, 140, 139, 141, 106, 245, 315, 317]);

export const enum SwayKind { None = 0, Basic = 1, Directional = 2, MultiGrass = 3, VineThread = 4, ReverseVine = 5, MultiVine = 6 }

interface SwayRec {
  kind: SwayKind;
  sheet: number;
  frame: 'auto' | 'style' | 'blend';
  fw: number; fh: number;
}

/** 内部 tile id → 摆动记录（TILE_DEFS 模块加载期构建，零运行时查找开销） */
const SWAY_REC = new Map<number, SwayRec>();
{
  for (let id = 0; id < TILE_DEFS.length; id++) {
    const v = TILE_DEFS[id]?.vanilla;
    if (!v) continue;
    const s = v.sheet;
    let kind = SwayKind.None;
    if (SWAYS_IN_WIND_BASIC.has(s)) kind = SwayKind.Basic;
    else if (DIRECTIONAL_GRASS.has(s)) kind = SwayKind.Directional;
    else if (MULTI_GRASS.has(s)) kind = SwayKind.MultiGrass;
    else if (VINE_THREADS.has(s)) kind = SwayKind.VineThread;
    else if (REVERSE_VINE.has(s)) kind = SwayKind.ReverseVine;
    else if (MULTI_VINE.has(s)) kind = SwayKind.MultiVine;
    if (kind !== SwayKind.None) SWAY_REC.set(id, { kind, sheet: s, frame: v.frame, fw: v.fw ?? 1, fh: v.fh ?? 1 });
  }
}

/** ChunkCache 烘焙摘除判定：摆动图块不走静态烘焙。
 *  例外（原版路由语义）：530 的 fx≥270 段、705 的 fx%486≥270 段、227 排除帧 → 普通路径烘焙。 */
export function swayBakeSkip(type: number, frameX: number): boolean {
  const r = SWAY_REC.get(type);
  if (!r) return false;
  if (r.sheet === 530 && frameX >= 270) return false;
  if (r.sheet === 705 && frameX % 486 >= 270) return false;
  if (r.sheet === 227 && SWAY_227_EXCLUDE_FX.has(frameX)) return false;
  return true;
}

// ================= WindGrid（WindGrid.cs 1:1） =================

class WindGrid {
  private time: Int32Array | null = null;
  private dirX: Int8Array | null = null;
  private dirY: Int8Array | null = null;
  private w = 1; private h = 1;
  private gameTime = 0;

  ensure(w: number, h: number): void {
    if (w <= this.w && h <= this.h && this.time) return; // 只增不减（原版 SetSize 语义）
    this.w = Math.max(this.w, w); this.h = Math.max(this.h, h);
    this.time = new Int32Array(this.w * this.h);
    this.dirX = new Int8Array(this.w * this.h);
    this.dirY = new Int8Array(this.w * this.h);
  }

  reset(): void { this.time = null; this.w = 1; this.h = 1; }

  /** Update() :48-55：gameTime++ + 玩家扫描（设置门控同原版 Update） */
  scan(player: { x: number; y: number; w: number; h: number; vx: number; vy: number; dead?: boolean } | null): void {
    this.gameTime++;
    if (!options.data.swayInWind) return;
    if (!player || player.dead) return;
    // ScanPlayer :113-126：静止玩家不打风
    if (player.vx === 0 && player.vy === 0) return;
    const dx = Math.sign(player.vx), dy = Math.sign(player.vy);
    const x0 = Math.floor(player.x / TILE), x1 = Math.floor((player.x + player.w) / TILE);
    const y0 = Math.floor(player.y / TILE), y1 = Math.floor((player.y + player.h) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) continue;
        const i = ty * this.w + tx;
        this.time![i] = this.gameTime;
        this.dirX![i] = dx; this.dirY![i] = dy;
      }
    }
  }

  /** GetWindTime :57-69：threshold 内才有效，返回 [剩余时间, dirX, dirY] */
  windTime(x: number, y: number, threshold: number): [number, number, number] {
    if (!this.time || x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0];
    const i = y * this.w + x;
    const t = this.time[i];
    if (t + threshold < this.gameTime) return [0, 0, 0];
    return [this.gameTime - t, this.dirX![i], this.dirY![i]];
  }
}

// ================= 相位钟 + 入口 =================

const lerpValue = (a: number, b: number, x: number) =>
  Math.max(0, Math.min(1, (x - a) / (b - a)));

const counters = { tree: 0, grass: 0, sunflower: 0, vine: 0 };
const windGrid = new WindGrid();

export const windSway = {
  /** Main.WindForVisuals = windSpeedCurrent（Main.cs:2896） */
  wind: 0,

  /** 每固定 tick 推进（Game.fixedUpdate；对齐 TileDrawing.Update :372-381） */
  update(wind: number, player: { x: number; y: number; w: number; h: number; vx: number; vy: number; dead?: boolean } | null, worldW: number, worldH: number): void {
    this.wind = options.data.swayInWind ? wind : 0;
    const n = lerpValue(0.08, 1.2, Math.abs(this.wind)); // GetLerpValue(0.08,1.2,|wind|)
    counters.tree += 1 / 240 + (1 / 240) * n * 2;
    counters.grass += 1 / 180 + (1 / 180) * n * 4;
    counters.sunflower += 1 / 420 + (1 / 420) * n * 5;
    counters.vine += 1 / 120 + (1 / 120) * n * 0.4000000059604645;
    windGrid.ensure(worldW, worldH);
    windGrid.scan(player);
  },

  /** 换世界重置扰动网格 */
  reset(): void { windGrid.reset(); },
};

/** GetWindCycle（:7800-7822）：相位波 + 全局风偏置 + 无风门；地下恒 0 */
export function getWindCycle(x: number, y: number, counter: number, worldSurface: number): number {
  if (!options.data.swayInWind) return 0;
  const phase = x * 0.5 + Math.floor(y / 100) * 0.5; // 每格位置偏移相位 → 波浪感
  let v = Math.cos(counter * 6.2831854820251465 + phase) * 0.5;
  if (y >= worldSurface) return 0; // 非 remix 世界：仅地表以上有风
  v += windSway.wind;
  return v * lerpValue(0.08, 0.18, Math.abs(windSway.wind));
}

/** GetWindGridPush（:8711）：三角波脉冲（前半程升、后半程落） */
function windGridPush(x: number, y: number, totalTime: number, force: number): number {
  const [t, dx] = windGrid.windTime(x, y, totalTime);
  if (t === 0) return 0;
  if (t >= totalTime / 2) return (totalTime - t) * force * dx;
  return t * force * dx;
}

function windGridPush2Axis(x: number, y: number, totalTime: number, force: number, out: { x: number; y: number }): void {
  const [t, dx, dy] = windGrid.windTime(x, y, totalTime);
  if (t === 0) { out.x = 0; out.y = 0; return; }
  if (t >= totalTime / 2) { out.x = (totalTime - t) * force * dx; out.y = (totalTime - t) * force * dy; }
  else { out.x = t * force * dx; out.y = t * force * dy; }
}

/** GetWindGridPushComplex（:8736）：多圈摆（多格吊挂植物用） */
function windGridPushComplex(x: number, y: number, totalTime: number, totalForce: number, loops: number, flipDir: boolean): number {
  const [t, dx0] = windGrid.windTime(x, y, totalTime);
  if (t === 0) return 0;
  let dx = dx0;
  const n = t / totalTime;
  const loop = Math.floor(n * loops);
  const frac = (n * loops) % 1;
  if (flipDir && loop % 2 === 1) dx = -dx;
  if (frac > 0.5) return (1 - frac) * totalForce * dx * (loops - loop);
  return frac * totalForce * dx * (loops - loop);
}

/** GetHighestWindGridPushComplex（:9346）：取最早触发行（顶部锚定感；i=0 列） */
function highestWindGridPushComplex(x: number, y: number, sizeY: number, totalTime: number, force: number, loops: number, swap: boolean): number {
  let result = 0, minT = Number.MAX_VALUE;
  for (let j = 0; j < sizeY; j++) {
    const t = windGrid.windTime(x, y + j, totalTime)[0];
    const c = windGridPushComplex(x, y + j, totalTime, force, loops, swap);
    if (t < minT && t !== 0) { result = c; minT = t; }
  }
  return result;
}

/** WorldGen.InAPlaceWithWind（:87603）：地表 + 区域内无液体、无挡风墙 */
function inAPlaceWithWind(st: TileStore, x: number, y: number, w: number, h: number, worldSurface: number): boolean {
  if (y >= worldSurface) return false; // DoesWindBlowAtThisHeight（非 remix）
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const tx = x + i, ty = y + j;
      if (!st.inBounds(tx, ty)) continue;
      const idx = st.idx(tx, ty);
      if (st.liquid[idx] > 0) return false;
      const wall = st.wall[idx];
      if (wall > 0 && !ALLOWS_WIND.has(wall)) return false;
    }
  }
  return true;
}

// ================= 绘制 =================

/** 单格绘制 + 变换（pivot=旋转轴心世界坐标；dest 相对偏移）。sway 全 0 时直绘 */
function drawCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, y: number, type: number,
  px: number, py: number, pivotX: number, pivotY: number, rot: number, offX: number, offY: number,
  trees?: TreeStyleData,
): void {
  const fx = st.frameX[st.idx(x, y)], fy = st.frameY[st.idx(x, y)];
  if (rot === 0 && offX === 0 && offY === 0) {
    drawVanillaCell(ctx, atlas, rec.sheet, rec.frame, rec.fw, rec.fh, st, x, y, type,
      (t) => t === type, px, py, fx, fy, trees);
    return;
  }
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(rot);
  ctx.translate(-pivotX, -pivotY);
  drawVanillaCell(ctx, atlas, rec.sheet, rec.frame, rec.fw, rec.fh, st, x, y, type,
    (t) => t === type, px + offX, py + offY, fx, fy, trees);
  ctx.restore();
}

/** DrawBasicGrass（:8497-8536）：逐格摆动 */
function drawBasicGrass(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, y: number, type: number, worldSurface: number,
  trees?: TreeStyleData,
): void {
  const i = st.idx(x, y);
  let sway = getWindCycle(x, y, counters.grass, worldSurface);
  if (!ALLOWS_WIND.has(st.wall[i])) sway = 0;
  if (!inAPlaceWithWind(st, x, y, 1, 1, worldSurface)) sway = 0;
  sway += windGridPush(x, y, 20, 0.35);
  const px = x * TILE, py = y * TILE;
  // 原版 position=(格心+8,+16)+摆动偏移；origin=(8,16) → dest=(px+sway, py+|sway|)
  drawCell(ctx, atlas, st, rec, x, y, type, px, py,
    px + 8 + sway, py + 16 + Math.abs(sway), sway * 0.1, sway, Math.abs(sway), trees);
}

/** DrawAnyDirectionalGrass（:8538-8634）：tile 184 四向生长植物 */
function drawDirectionalGrass(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, y: number, type: number, worldSurface: number,
  trees?: TreeStyleData,
): void {
  const i = st.idx(x, y);
  let sway = getWindCycle(x, y, counters.grass, worldSurface);
  if (!ALLOWS_WIND.has(st.wall[i])) sway = 0;
  if (!inAPlaceWithWind(st, x, y, 1, 1, worldSurface)) sway = 0;
  const push = { x: 0, y: 0 };
  windGridPush2Axis(x, y, 20, 0.35, push);
  const px = x * TILE, py = y * TILE;
  const dir = Math.floor(st.frameY[i] / 54);
  let pivotX: number, pivotY: number, offX: number, offY: number, dirX = 0, dirY = 0;
  switch (dir) {
    case 0: // 上生（origin (8,16)）
      dirX = 1;
      pivotX = px + 8 + sway; pivotY = py + 16 + Math.abs(sway);
      offX = sway; offY = Math.abs(sway);
      break;
    case 1: // 下生（sway 反向；origin (8,0)）
      sway = -sway; dirX = -1;
      pivotX = px + 8 - sway; pivotY = py - Math.abs(sway);
      offX = -sway; offY = -Math.abs(sway);
      break;
    case 2: // 左生（origin (2,8)）
      dirY = 1;
      pivotX = px - Math.abs(sway); pivotY = py + 8 + sway;
      offX = -Math.abs(sway); offY = sway;
      break;
    default: // 右生（sway 反向；origin (14,8)）
      sway = -sway; dirY = -1;
      pivotX = px + 16 + Math.abs(sway); pivotY = py + 8 - sway;
      offX = 16 + Math.abs(sway) - 14; offY = 8 - sway - 8;
      break;
  }
  sway += push.x * dirX + push.y * dirY; // 旋转量含扰动（位置用扰动前值——原版顺序）
  drawCell(ctx, atlas, st, rec, x, y, type, px, py, pivotX, pivotY, sway * 0.1, offX, offY, trees);
}

// MultiTileGrass 尺寸/锚点表（DrawMultiTileGrass :8922-8970 + 路由 :608-690）
function multiGrassSize(sheet: number, fy: number): { sx: number; sy: number } {
  switch (sheet) {
    case 27: return { sx: 2, sy: 5 };
    case 236: case 238: case 702: return { sx: 2, sy: 2 };
    case 233: return { sx: fy !== 0 ? 2 : 3, sy: 2 };
    case 530: case 651: case 705: return { sx: 3, sy: 2 };
    case 489: return { sx: 2, sy: 3 };
    case 493: return { sx: 1, sy: 2 };
    default: return { sx: 2, sy: 2 }; // 485/490/521-527/652
  }
}
function multiGrassAnchor(sheet: number, fx: number, fy: number): boolean {
  switch (sheet) {
    case 27: case 236: case 238: case 702:
      return fx % 36 === 0 && fy === 0;
    case 233:
      return (fy === 0 && fx % 54 === 0) || (fy === 36 && fx % 36 === 0);
    case 651: return fx % 54 === 0 && fy % 36 === 0;
    case 652: return fx % 36 === 0 && fy % 36 === 0;
    case 530: return fx < 270 && fx % 54 === 0 && fy === 0;
    case 705: return fx % 486 < 270 && fx % 54 === 0 && fy % 36 === 0;
    case 493: return fy === 0 && fx % 18 === 0;
    default: return fy === 0 && fx % 36 === 0; // 485/489/490/521-527
  }
}
/** 旋转量系数 num（DrawMultiTileGrassInWind switch :9099-9116：27→0.07；521-527→0 且恒不摆） */
function multiGrassRotFactor(sheet: number): number {
  if (sheet === 27) return 0.07;
  if (sheet >= 521 && sheet <= 527) return 0;
  return 0.15;
}

/** DrawMultiTileGrassInWind（:9080-9190）：整株绕底部中心摆，上部摆幅大 */
function drawMultiGrass(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, ax: number, ay: number, type: number, worldSurface: number,
  trees?: TreeStyleData,
): void {
  const i0 = st.idx(ax, ay);
  let sx: number, sy: number;
  if (rec.sheet === 519) {
    // 香蒲：锚点在底部，向上数同型格（ClimbCatTail + num3 -= sizeY-1）
    sy = 1;
    while (ay - sy >= 0 && st.type[st.idx(ax, ay - sy)] === type && st.flags[st.idx(ax, ay - sy)]) sy++;
    sx = 1;
    if (sy <= 1) return;
    ay -= sy - 1; // topLeftY
  } else {
    if (!multiGrassAnchor(rec.sheet, st.frameX[i0], st.frameY[i0])) return;
    ({ sx, sy } = multiGrassSize(rec.sheet, st.frameY[i0]));
  }
  const windy = rec.sheet === 519
    ? inAPlaceWithWind(st, ax, ay, sx, 1, worldSurface)
    : inAPlaceWithWind(st, ax, ay, sx, sy, worldSurface);
  const wc = getWindCycle(ax, ay, counters.sunflower, worldSurface);
  const rotFactor = multiGrassRotFactor(rec.sheet);
  const pivotX = ax * TILE + sx * TILE * 0.5;
  const pivotBaseY = ay * TILE + TILE * sy;
  for (let j = 0; j < sy; j++) {
    const cy = ay + j;
    if (cy >= st.h) break;
    let hFrac = 1 - (j + 1) / sy; // num3：顶行最大
    if (hFrac === 0) hFrac = 0.1;
    if (!windy) hFrac = 0;
    const offY = Math.abs(wc) * 2 * hFrac;
    for (let k = 0; k < sx; k++) {
      const cx = ax + k;
      if (!st.inBounds(cx, cy)) continue;
      const idx = st.idx(cx, cy);
      if (st.type[idx] !== type || !st.flags[idx]) continue;
      drawCell(ctx, atlas, st, rec, cx, cy, type, cx * TILE, cy * TILE,
        pivotX, pivotBaseY + offY, wc * rotFactor * hFrac, 0, offY, trees);
    }
  }
}

/** DrawVineStrip（:9170-9256）：下垂藤蔓链式摆（每段绕上段末端旋转） */
function drawVineStrip(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, startY: number, type: number, worldSurface: number,
  trees?: TreeStyleData,
): void {
  const amount = Math.max(0, Math.min(1, Math.abs(windSway.wind) / 1.2));
  const amt = 0.2 + (1 - 0.2) * amount; // Lerp(0.2,1,amount)
  let segRot = -0.08 * amt;
  const wc = getWindCycle(x, startY, counters.vine, worldSurface);
  let vx = x * TILE + 8, vy = startY * TILE - 2;
  let pushChain = 0, lastPush = 0, windySegs = 0;
  for (let y = startY; y < Math.min(st.h, startY + 80); y++) {
    const idx = st.idx(x, y);
    if (!st.flags[idx]) break;
    const sheet = TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? -1;
    if (!VINE_THREADS.has(sheet)) break;
    if (windySegs >= 5) segRot += 0.0075 * amt;
    if (windySegs >= 2) segRot += 0.0025;
    if (ALLOWS_WIND.has(st.wall[idx]) && y < worldSurface) windySegs++;
    const push = windGridPush(x, y, 20, 0.01);
    pushChain = (push !== 0 || lastPush === 0) ? pushChain - push : pushChain * -0.78;
    lastPush = push;
    const rot = windySegs * segRot * wc + pushChain;
    // origin=(tileWidth/2, half-tileTop)≈(8,0)：绕段顶中心旋转
    drawCell(ctx, atlas, st, rec, x, y, type, vx - 8, vy, vx, vy, rot, 0, 0, trees);
    // 链推进：下一段位置 = 本段末端沿旋转方向
    vx += Math.cos(rot + Math.PI / 2) * TILE;
    vy += Math.sin(rot + Math.PI / 2) * TILE;
  }
}

/** DrawRisingVineStrip（:9258-9340）：549 向上生长链 */
function drawRisingVineStrip(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, startY: number, type: number, worldSurface: number,
  trees?: TreeStyleData,
): void {
  const amount = Math.max(0, Math.min(1, Math.abs(windSway.wind) / 1.2));
  const amt = 0.2 + 0.8 * amount;
  let segRot = -0.08 * amt;
  const wc = getWindCycle(x, startY, counters.vine, worldSurface);
  let vx = x * TILE + 8, vy = startY * TILE + TILE + 2;
  let pushChain = 0, lastPush = 0, windySegs = 0;
  for (let y = startY; y > Math.max(0, startY - 80); y--) {
    const idx = st.idx(x, y);
    if (!st.flags[idx]) break;
    const sheet = TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? -1;
    if (!REVERSE_VINE.has(sheet)) break;
    if (windySegs >= 5) segRot += 0.0075 * amt;
    if (windySegs >= 2) segRot += 0.0025;
    if (ALLOWS_WIND.has(st.wall[idx]) && y < worldSurface) windySegs++;
    const push = windGridPush(x, y, 40, -0.004);
    pushChain = (push !== 0 || lastPush === 0) ? pushChain - push : pushChain * -0.78;
    lastPush = push;
    const rot = windySegs * (-segRot) * wc + pushChain;
    // origin=(w/2, half-tileTop+tileHeight)≈(8,16)：绕段底中心旋转
    drawCell(ctx, atlas, st, rec, x, y, type, vx - 8, vy - TILE, vx, vy, rot, 0, 0, trees);
    vx += Math.cos(rot - Math.PI / 2) * TILE;
    vy += Math.sin(rot - Math.PI / 2) * TILE;
  }
}

// MultiTileVine 尺寸/锚点/参数表（路由 :543-602 + 尺寸 :9012-9044 + :9430-9532）
function multiVineSize(sheet: number): { sx: number; sy: number } {
  switch (sheet) {
    case 34: return { sx: 3, sy: 3 };
    case 454: return { sx: 4, sy: 3 };
    case 91: return { sx: 1, sy: 3 };
    case 465: case 591: case 592: return { sx: 2, sy: 3 };
    case 42: case 270: case 271: case 572: case 581: case 660: return { sx: 1, sy: 2 };
    default: return { sx: 2, sy: 2 }; // 95/126/444
  }
}
function multiVineAnchor(sheet: number, fx: number, fy: number): boolean {
  switch (sheet) {
    case 34: return fx % 54 === 0 && fy % 54 === 0;
    case 698: return fx % 18 === 0 && fy === 0;
    case 454: return fx % 72 === 0 && fy % 54 === 0;
    case 42: case 270: case 271: case 572: case 581: case 660: return fx % 18 === 0 && fy % 36 === 0;
    case 91: return fx % 18 === 0 && fy % 54 === 0;
    case 465: case 591: case 592: return fx % 36 === 0 && fy % 54 === 0;
    default: return fx % 36 === 0 && fy % 36 === 0; // 95/126/444
  }
}
/** (num4 X 系数, num5 Y 系数, offX)——:9430-9532 各 case 基础值（34/42/126 等
 *  变体级 num3/num5 微调表从简，取 case 基础值；91/465 用默认 -4） */
function multiVineParams(sheet: number): { nx: number; ny: number; offX: number } {
  switch (sheet) {
    case 591: case 592: return { nx: 0.5, ny: -2, offX: 0 };
    case 698: return { nx: 0.5, ny: -1, offX: -10 };
    case 91: case 465: return { nx: 1, ny: -4, offX: 0 };
    default: return { nx: 1, ny: 0, offX: 0 }; // 34/42/95/126/270/271/444/454/572/581/660
  }
}

/** DrawMultiTileVinesInWind（:9407-9700）：吊挂植物绕顶部中心摆，下部摆幅大 */
function drawMultiVine(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, ax: number, ay: number, type: number, worldSurface: number,
  trees?: TreeStyleData,
): void {
  const i0 = st.idx(ax, ay);
  if (!multiVineAnchor(rec.sheet, st.frameX[i0], st.frameY[i0])) return;
  const { sx, sy } = multiVineSize(rec.sheet);
  const { nx, ny, offX } = multiVineParams(rec.sheet);
  // 风值 = sunflower 相位波 + 多圈扰动；不在风口则只余扰动（:9418-9424）
  let wc = getWindCycle(ax, ay, counters.sunflower, worldSurface);
  const base = wc;
  wc += highestWindGridPushComplex(ax, ay, sy, 60, 1.26, 3, true);
  const windy = inAPlaceWithWind(st, ax, ay, sx, sy, worldSurface);
  if (!windy) wc -= base;
  // 锚点=顶部中心（+(-2)）；平台下方吊挂再上移 8（IsBelowANonHammeredPlatform 近似）
  let pivotX = ax * TILE + sx * TILE * 0.5 + offX;
  let pivotY = ay * TILE - 2;
  const above = st.inBounds(ax, ay - 1) ? st.type[st.idx(ax, ay - 1)] : 0;
  const aboveIsPlatform = !!TILE_DEFS[above]?.vanilla && TILE_DEFS[above]?.vanilla?.sheet === 19;
  if (aboveIsPlatform) pivotY -= 8;
  const ROT = -0.15; // num2（0.15 后 *= -1）
  for (let j = 0; j < sy; j++) {
    let hFrac = (j + 1) / sy; // 与 MultiGrass 相反：越靠下摆幅越大
    if (hFrac === 0) hFrac = 0.1;
    const offY = Math.abs(wc) * ny * hFrac;
    for (let k = 0; k < sx; k++) {
      const cx = ax + k, cy = ay + j;
      if (!st.inBounds(cx, cy)) continue;
      const idx = st.idx(cx, cy);
      if (st.type[idx] !== type || !st.flags[idx]) continue;
      drawCell(ctx, atlas, st, rec, cx, cy, type, cx * TILE, cy * TILE,
        pivotX, pivotY + offY, wc * ROT * hFrac, 0, offY, trees);
    }
  }
}

/** DrawTrees（:8184-8460）：树冠/树枝摆动（墙后不摆 flag=tile.wall>0） */
function drawTreeSway(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  sheet: number, x: number, y: number, fx: number, fy: number, worldSurface: number,
  trees?: TreeStyleData,
): void {
  const isPalm = sheet === 323;
  const isCrownCell = isPalm ? (fx >= 88 && fx <= 132) : (fy >= 198 && fx >= 22);
  if (!isCrownCell) return;
  const idx = st.idx(x, y);
  let sway = 0;
  if (st.wall[idx] === 0) sway = getWindCycle(x, y, counters.tree, worldSurface);
  drawTreeCell(ctx, atlas, st, x, y, fx, fy, x * TILE, y * TILE, sheet, true, trees, sway);
}

// ================= 主入口 =================

interface SwayCam { x: number; y: number; zoom: number; viewW: number; viewH: number }

/** 视区内全部摆动图块逐帧绘制（Renderer tile 层之后调用；世界变换内，世界坐标） */
export function drawWindSwayTiles(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, world: World,
  cam: SwayCam, z: number,
): void {
  const st = world.store;
  const worldSurface = world.groundLevel;
  const trees: TreeStyleData = {
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    worldSurface: world.groundLevel, worldW: world.w,
  };
  const M = 8; // 边距：树冠 80px/藤链下行/多格物体越界绘制
  const tx0 = Math.max(0, Math.floor((cam.x - cam.viewW / 2 / z) / TILE) - M);
  const tx1 = Math.min(st.w - 1, Math.floor((cam.x + cam.viewW / 2 / z) / TILE) + M);
  const ty0 = Math.max(0, Math.floor((cam.y - cam.viewH / 2 / z) / TILE) - M);
  const ty1 = Math.min(st.h - 1, Math.floor((cam.y + cam.viewH / 2 / z) / TILE) + M);
  for (let y = ty0; y <= ty1; y++) {
    for (let x = tx0; x <= tx1; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const type = st.type[i];
      const rec = SWAY_REC.get(type);
      if (rec) {
        // 原版路由同款例外：530/705 高段与 227 排除帧不走摆动路径（烘焙已画）
        if (rec.sheet === 530 && st.frameX[i] >= 270) continue;
        if (rec.sheet === 705 && st.frameX[i] % 486 >= 270) continue;
        if (rec.sheet === 227 && SWAY_227_EXCLUDE_FX.has(st.frameX[i])) continue;
        switch (rec.kind) {
          case SwayKind.Basic: drawBasicGrass(ctx, atlas, st, rec, x, y, type, worldSurface, trees); break;
          case SwayKind.Directional: drawDirectionalGrass(ctx, atlas, st, rec, x, y, type, worldSurface, trees); break;
          case SwayKind.MultiGrass: drawMultiGrass(ctx, atlas, st, rec, x, y, type, worldSurface, trees); break;
          case SwayKind.MultiVine: drawMultiVine(ctx, atlas, st, rec, x, y, type, worldSurface, trees); break;
          case SwayKind.VineThread: {
            // 锚点=藤顶（上方非藤才起链——CrawlToTopOfVineAndAddSpecialPoint）
            const up = st.inBounds(x, y - 1) && st.flags[st.idx(x, y - 1)]
              && VINE_THREADS.has(TILE_DEFS[st.type[st.idx(x, y - 1)]]?.vanilla?.sheet ?? -1);
            if (!up) drawVineStrip(ctx, atlas, st, rec, x, y, type, worldSurface, trees);
            break;
          }
          case SwayKind.ReverseVine: {
            const dn = st.inBounds(x, y + 1) && st.flags[st.idx(x, y + 1)]
              && REVERSE_VINE.has(TILE_DEFS[st.type[st.idx(x, y + 1)]]?.vanilla?.sheet ?? -1);
            if (!dn) drawRisingVineStrip(ctx, atlas, st, rec, x, y, type, worldSurface, trees);
            break;
          }
        }
        continue;
      }
      // 树族冠/枝标记格（非摆动集合但需动态摆动；干身仍在烘焙层）
      const v = TILE_DEFS[type]?.vanilla;
      if (v && TREE_SWAY_SHEETS.has(v.sheet) && v.sheet !== 72) {
        drawTreeSway(ctx, atlas, st, v.sheet, x, y, st.frameX[i], st.frameY[i], worldSurface, trees);
      }
    }
  }
}

/** 测试辅助：暴露内部状态 */
export const _windSwayInternals = { counters, windGrid, getWindCycle, windGridPush, inAPlaceWithWind, SWAY_REC };
