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
import { drawVanillaCell, drawTreeCell, scanTreeType, type TreeStyleData } from './VanillaTiler';
import { frameMergesWith } from './TileMergeFamily';
import { natureParticles, getTreeLeaf, leafEmits, dripGoreFor } from './NatureParticles';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import type { World, Clock } from '../world/World';
import { Clock as ClockVal } from '../world/World';
import { options } from '../core/Options';

/** 帧级环境（drawWindSwayTiles 每帧构建，贯穿全部绘制分支） */
export interface SwayEnv {
  worldSurface: number;        // Main.worldSurface（tile 行）
  remix: boolean;              // Main.remixWorld（"don't dig up" 种子；风门/药草判定翻转）
  worldH: number;              // Main.maxTilesY（remix 药草判定用）
  dayTime: boolean;            // Main.dayTime
  moonPhase: number;           // Main.moonPhase
  bloodMoon: boolean;          // Main.bloodMoon
  raining: boolean;            // Main.raining
  cloudAlpha: number;          // Main.cloudAlpha
  mainTime: number;            // Main.time（昼 0-54000；夜为 0——药草 style5 只查昼）
  waterStyle: number;          // Main.waterStyle（滴水 gore 映射）
  zones: { corrupt: boolean; crimson: boolean; hallow: boolean }; // SceneMetrics（滴水 461）
}

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

/** 滴水锚点 tile（路由 :694-698 `continue`——原版【永不绘制】，只作 EmitLiquidDrops 源） */
export const NO_DRAW_SHEETS = new Set([373, 374, 375, 461, 709]);

/** ChunkCache 烘焙摘除判定：摆动图块不走静态烘焙。
 *  例外（原版路由语义）：530 的 fx≥270 段、705 的 fx%486≥270 段、227 排除帧 → 普通路径烘焙。 */
export function swayBakeSkip(type: number, frameX: number): boolean {
  const r = SWAY_REC.get(type);
  if (!r) {
    // 滴水锚点（373/374/375/461/709）：原版主循环 continue 永不绘制——烘焙同样跳过
    const v = TILE_DEFS[type]?.vanilla;
    return !!v && NO_DRAW_SHEETS.has(v.sheet);
  }
  if (r.sheet === 530 && frameX >= 270) return false;
  if (r.sheet === 705 && frameX % 486 >= 270) return false;
  if (r.sheet === 227 && SWAY_227_EXCLUDE_FX.has(frameX)) return false;
  return true;
}

// ================= WindGrid（WindGrid.cs 1:1） =================
// 尺寸 = 屏幕绘制区（EnsureWindGridSize :7899 传 GetScreenDrawArea 视区宽高，
// 非全图！）+ 取模环形寻址（tileX % width——WindGrid.GetWindTime 原文如此）。
// 只增不减（SetSize Math.Max 语义）。全图建格是 6400×1800≈70MB 的浪费。

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

  private slot(x: number, y: number): number {
    // C# % 对非负 tile 坐标等价；负坐标防御性回正（调用方已钳 ≥0）
    return (((y % this.h) + this.h) % this.h) * this.w + (((x % this.w) + this.w) % this.w);
  }

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
        if (tx < 0 || ty < 0) continue;
        const i = this.slot(tx, ty);
        this.time![i] = this.gameTime;
        this.dirX![i] = dx; this.dirY![i] = dy;
      }
    }
  }

  /** GetWindTime :57-69：threshold 内才有效，返回 [elapsed, dirX, dirY]（刚标记=0） */
  windTime(x: number, y: number, threshold: number): [number, number, number] {
    if (!this.time || x < 0 || y < 0) return [0, 0, 0];
    const i = this.slot(x, y);
    const t = this.time[i];
    if (t + threshold < this.gameTime) return [0, 0, 0];
    return [this.gameTime - t, this.dirX![i], this.dirY![i]];
  }
}

// ================= 相位钟 + 入口 =================

const lerpValue = (a: number, b: number, x: number) =>
  Math.max(0, Math.min(1, (x - a) / (b - a)));

const counters = { tree: 0, grass: 0, sunflower: 0, vine: 0 };
/** 只读出口（探针/调试：读当前风摆相位计数） */
export const windCounters = () => counters;
const windGrid = new WindGrid();
/** UpdateLeafFrequency（:7839-7903）档位表 + 尾乘 ×7 */
let leafFrequency = 2000 * 7;
const LEAF_FREQ_TABLE: Array<[number, number]> = [
  [0.1, 2000], [0.2, 1000], [0.3, 450], [0.4, 300], [0.5, 200], [0.6, 130],
  [0.7, 75], [0.8, 50], [0.9, 40], [1.0, 30], [1.1, 20],
];
function updateLeafFrequency(absWind: number): void {
  let f = 10;
  for (const [max, v] of LEAF_FREQ_TABLE) {
    if (absWind <= max) { f = v; break; }
  }
  leafFrequency = f * 7;
}

export const windSway = {
  /** Main.WindForVisuals = windSpeedCurrent（Main.cs:2896） */
  wind: 0,
  /** _leafFrequency（EmitTreeLeaves 频率门；测试窥探） */
  get leafFreq(): number { return leafFrequency; },
  /** _isActiveAndNotPaused（FocusHelper.AllowTileDrawingToEmitEffects）——
   *  Game 每帧写：暂停时落叶不再喷出（已落粒子物理由 fixedUpdate 的 !paused 门冻结） */
  active: true,

  /** 每固定 tick 推进（Game.fixedUpdate；对齐 TileDrawing.Update :372-381）。
   *  gridW/gridH = 视区 tile 尺寸（原版 EnsureWindGridSize 传屏幕绘制区，非全图） */
  update(wind: number, player: { x: number; y: number; w: number; h: number; vx: number; vy: number; dead?: boolean } | null, gridW: number, gridH: number): void {
    this.wind = options.data.swayInWind ? wind : 0;
    const n = lerpValue(0.08, 1.2, Math.abs(this.wind)); // GetLerpValue(0.08,1.2,|wind|)
    counters.tree += 1 / 240 + (1 / 240) * n * 2;
    counters.grass += 1 / 180 + (1 / 180) * n * 4;
    counters.sunflower += 1 / 420 + (1 / 420) * n * 5;
    counters.vine += 1 / 120 + (1 / 120) * n * 0.4000000059604645;
    updateLeafFrequency(Math.abs(this.wind));
    windGrid.ensure(gridW, gridH);
    windGrid.scan(player);
  },
};

/** GetWindCycle（:7800-7822）：相位波 + 全局风偏置 + 无风门；
 *  remix 世界翻转地表门（"don't dig up"：地下才有风） */
export function getWindCycle(x: number, y: number, counter: number, worldSurface: number, remix = false): number {
  if (!options.data.swayInWind) return 0;
  const phase = x * 0.5 + Math.floor(y / 100) * 0.5; // 每格位置偏移相位 → 波浪感
  let v = Math.cos(counter * 6.2831854820251465 + phase) * 0.5;
  const aboveSurface = y < worldSurface;
  if (aboveSurface === remix) return 0; // DoesWindBlowAtThisHeight 翻转语义
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

/** WorldGen.InAPlaceWithWind（:87603）：地表（remix 翻转）+ 区域内无液体、无挡风墙 */
function inAPlaceWithWind(st: TileStore, x: number, y: number, w: number, h: number, worldSurface: number, remix = false): boolean {
  const aboveSurface = y < worldSurface;
  if (aboveSurface === remix) return false; // DoesWindBlowAtThisHeight
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

/** 帧级环境（drawWindSwayTiles 每帧注入；单线程渲染下模块态直读） */
let ENV: SwayEnv = {
  worldSurface: 99999, remix: false, worldH: 0, dayTime: true, moonPhase: 0,
  bloodMoon: false, raining: false, cloudAlpha: 0, mainTime: 0, waterStyle: 0,
  zones: { corrupt: false, crimson: false, hallow: false },
};

/** IsAlchemyPlantHarvestable（WorldGen.cs:66198 1:1）：药草成熟（贴图换 84 开花帧）。
 *  style = frameX/18（原版整除直传）；style 2/6 原版即不判（恒不成熟） */
export function isAlchemyPlantHarvestable(style: number, y: number): boolean {
  if (style === 0 && ENV.dayTime) return true;                    // 盛开草（昼）
  if (style === 1 && !ENV.dayTime) return true;                   // 月光草（夜）
  if (style === 3 && !ENV.dayTime && (ENV.bloodMoon || ENV.moonPhase === 0)) return true; // 死亡草
  if (style === 4 && (ENV.raining || ENV.cloudAlpha > 0)) return true;                  // 寒颤棘
  if (style === 5) {                                              // 珍珠花
    let below = y > ENV.worldSurface;
    if (ENV.remix) below = y < ENV.worldH - 350;
    if ((!ENV.raining || below) && ENV.mainTime > 40500) return true;
  }
  return false;
}

/** 单格绘制 + 变换（pivot=旋转轴心世界坐标；dest 相对偏移）。
 *  sway 全 0 时直绘；glow 回调在主贴图后同变换内执行（glowmask 叠画） */
function drawCell(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, y: number, type: number,
  px: number, py: number, pivotX: number, pivotY: number, rot: number, offX: number, offY: number,
  trees?: TreeStyleData,
  glow?: (dpx: number, dpy: number) => void,
): void {
  const fx = st.frameX[st.idx(x, y)], fy = st.frameY[st.idx(x, y)];
  const draw = (dpx: number, dpy: number) => {
    drawVanillaCell(ctx, atlas, rec.sheet, rec.frame, rec.fw, rec.fh, st, x, y, type,
      (t) => t === type || frameMergesWith(type, t), dpx, dpy, fx, fy, trees);
  };
  if (rot === 0 && offX === 0 && offY === 0) {
    draw(px, py);
    if (glow) glow(px, py);
    return;
  }
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(rot);
  ctx.translate(-pivotX, -pivotY);
  draw(px + offX, py + offY);
  if (glow) glow(px + offX, py + offY);
  ctx.restore();
}

/** 基础草 glowmask（GetTileDrawData :6152-6171）：656/701 → Glow_329 白×脉冲；
 *  637 → 自身贴图 Lerp(White,油漆色,0.75)（无油漆=纯白重绘提亮） */
function basicGrassGlow(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, rec: SwayRec, x: number, y: number): ((dpx: number, dpy: number) => void) | undefined {
  if (rec.sheet !== 656 && rec.sheet !== 701 && rec.sheet !== 637) return undefined;
  return (dpx, dpy) => {
    const i = ST.idx(x, y);
    const fx = ST.frameX[i], fy = ST.frameY[i];
    if (rec.sheet === 637) {
      // 自身贴图重绘（Lerp(White,color,0.75)，color=油漆色——无油漆恒白）
      const img = atlas.ensureVImage(`vanilla/Tiles_${rec.sheet}.png`);
      if (!img || !(img.width > 0)) return;
      ctx.drawImage(img, fx, fy, TILE, TILE, dpx, dpy, TILE, TILE);
      return;
    }
    const img = atlas.ensureVImage('vanilla/Glow_329.png');
    if (!img || !(img.width > 0)) return;
    // glowColor = White × (mouseTextColor/255)——鼠标文本脉冲近似
    ctx.globalAlpha = 0.88 + 0.12 * Math.sin(performance.now() / 180);
    ctx.drawImage(img, fx, fy, TILE, TILE, dpx, dpy, TILE, TILE);
    ctx.globalAlpha = 1;
  };
}

/** 药草成熟交换：83 → 84 开花贴图（DrawBasicGrass :8511-8516 / Directional 同款） */
function herbSwapRec(rec: SwayRec, x: number, y: number): SwayRec {
  if (rec.sheet !== 83) return rec;
  const i = ST.idx(x, y);
  const style = Math.floor(ST.frameX[i] / 18);
  if (!isAlchemyPlantHarvestable(style, y)) return rec;
  return { ...rec, sheet: 84 };
}

/** DrawBasicGrass（:8497-8536）：逐格摆动 */
function drawBasicGrass(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, y: number, type: number,
  trees?: TreeStyleData,
): void {
  const i = st.idx(x, y);
  let sway = getWindCycle(x, y, counters.grass, ENV.worldSurface, ENV.remix);
  if (!ALLOWS_WIND.has(st.wall[i])) sway = 0;
  if (!inAPlaceWithWind(st, x, y, 1, 1, ENV.worldSurface, ENV.remix)) sway = 0;
  sway += windGridPush(x, y, 20, 0.35);
  const px = x * TILE, py = y * TILE;
  const drawRec = herbSwapRec(rec, x, y);
  // 原版 position=(格心+8,+16)+摆动偏移；origin=(8,16) → dest=(px+sway, py+|sway|)
  drawCell(ctx, atlas, st, drawRec, x, y, type, px, py,
    px + 8 + sway, py + 16 + Math.abs(sway), sway * 0.1, sway, Math.abs(sway), trees,
    basicGrassGlow(ctx, atlas, drawRec, x, y));
}

/** DrawAnyDirectionalGrass（:8538-8634）：tile 184 四向生长植物 */
function drawDirectionalGrass(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, y: number, type: number,
  trees?: TreeStyleData,
): void {
  const i = st.idx(x, y);
  let sway = getWindCycle(x, y, counters.grass, ENV.worldSurface, ENV.remix);
  if (!ALLOWS_WIND.has(st.wall[i])) sway = 0;
  if (!inAPlaceWithWind(st, x, y, 1, 1, ENV.worldSurface, ENV.remix)) sway = 0;
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
  const drawRec = herbSwapRec(rec, x, y);
  drawCell(ctx, atlas, st, drawRec, x, y, type, px, py, pivotX, pivotY, sway * 0.1, offX, offY, trees);
}

/** 当前帧 store 引用（glow/药草查帧用；drawWindSwayTiles 注入） */
let ST: TileStore = null as unknown as TileStore;

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
/** 旋转量系数 num（DrawMultiTileGrassInWind switch :9099-9116：初始 0.07，27 与 519
 *  都不落 default（27 只设 color/flag2；519 只重算 flag）→ 两者皆 0.07；521-527→0
 *  且 flag=false——num3 归 0 后 offY 同为 0，完全静态，走特殊路径只为不入普通层） */
function multiGrassRotFactor(sheet: number): number {
  if (sheet === 27 || sheet === 519) return 0.07;
  if (sheet >= 521 && sheet <= 527) return 0;
  return 0.15;
}

/** DrawMultiTileGrassInWind（:9080-9190）：整株绕底部中心摆，上部摆幅大 */
function drawMultiGrass(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, ax: number, ay: number, type: number,
  trees?: TreeStyleData,
): void {
  const i0 = st.idx(ax, ay);
  let sx: number, sy: number;
  if (rec.sheet === 519) {
    // 香蒲 519：整株只在【基座格】触发（路由 :687-693 `frameX/18 <= 4` 才加特殊点
    // ——茎 90/108/过渡 126-162/顶花 180+ 帧格不加）。曾缺此门：一株 N 格各触发
    // 一段"从本格到顶"的顶段绘制，hFrac 按各自段高算 → 同一行多份错位旋转
    // = 摆动残影（2026-08-20 用户实拍扇面拖尾定位）
    if (Math.floor(st.frameX[i0] / 18) > 4) return;
    // ClimbCatTail（:8967-8984）：向上数同型格，遇顶花帧（frameX>=180）计入即止
    sy = 1;
    while (ay - sy >= 0) {
      const ti = st.idx(ax, ay - sy);
      if (st.type[ti] !== type || !st.flags[ti]) break;
      sy++;
      if (st.frameX[ti] >= 180) break;
    }
    sx = 1;
    // 单格幼苗（sy=1）原版同样绘制（DrawMultiTileGrassInWind sizeY=1）——不 return
    ay -= sy - 1; // topLeftY
  } else {
    if (!multiGrassAnchor(rec.sheet, st.frameX[i0], st.frameY[i0])) return;
    ({ sx, sy } = multiGrassSize(rec.sheet, st.frameY[i0]));
  }
  const rotFactor = multiGrassRotFactor(rec.sheet);
  if (rotFactor === 0) {
    // 521-527 族原版恒不摆（num=0 且 flag=false）——纯静态直绘
    for (let j = 0; j < sy; j++) {
      for (let k = 0; k < sx; k++) {
        const cx = ax + k, cy = ay + j;
        if (!st.inBounds(cx, cy)) continue;
        const idx = st.idx(cx, cy);
        if (st.type[idx] !== type || !st.flags[idx]) continue;
        drawCell(ctx, atlas, st, rec, cx, cy, type, cx * TILE, cy * TILE, 0, 0, 0, 0, 0, trees);
      }
    }
    return;
  }
  const windy = rec.sheet === 519
    ? inAPlaceWithWind(st, ax, ay, sx, 1, ENV.worldSurface, ENV.remix)
    : inAPlaceWithWind(st, ax, ay, sx, sy, ENV.worldSurface, ENV.remix);
  const wc = getWindCycle(ax, ay, counters.sunflower, ENV.worldSurface, ENV.remix);
  const pivotX = ax * TILE + sx * TILE * 0.5;
  const pivotBaseY = ay * TILE + TILE * sy;
  // 27 香蒲 glowmask（:9096/9174 flag2 族：同贴图 fy+74 白色重绘）
  const cattailGlow = rec.sheet === 27 ? (dpx: number, dpy: number, idx2: number) => {
    const img = atlas.ensureVImage('vanilla/Tiles_27.png');
    if (!img || !(img.width > 0)) return;
    ctx.drawImage(img, st.frameX[idx2], st.frameY[idx2] + 74, TILE, TILE, dpx, dpy, TILE, TILE);
  } : undefined;
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
        pivotX, pivotBaseY + offY, wc * rotFactor * hFrac, 0, offY, trees,
        cattailGlow ? ((dpx, dpy) => cattailGlow(dpx, dpy, idx)) : undefined);
    }
  }
}

/** DrawVineStrip（:9170-9256）：下垂藤蔓链式摆（每段绕上段末端旋转） */
function drawVineStrip(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, x: number, startY: number, type: number,
  trees?: TreeStyleData,
): void {
  const amount = Math.max(0, Math.min(1, Math.abs(windSway.wind) / 1.2));
  const amt = 0.2 + (1 - 0.2) * amount; // Lerp(0.2,1,amount)
  // 爬到藤真顶（CrawlToTopOfVineAndAddSpecialPoint :750——顶可能在视区扫描范围外；
  // 从可视首格起链会丢上段相位，长藤在屏缘摆动错拍）
  let topY = startY;
  for (let k = 0; k < 80; k++) {
    const ny = topY - 1;
    if (ny < 0 || !st.flags[st.idx(x, ny)]) break;
    if (!VINE_THREADS.has(TILE_DEFS[st.type[st.idx(x, ny)]]?.vanilla?.sheet ?? -1)) break;
    topY = ny;
  }
  startY = topY;
  let segRot = -0.08 * amt;
  const wc = getWindCycle(x, startY, counters.vine, ENV.worldSurface, ENV.remix);
  let vx = x * TILE + 8, vy = startY * TILE - 2;
  let pushChain = 0, lastPush = 0, windySegs = 0;
  for (let y = startY; y < Math.min(st.h, startY + 80); y++) {
    const idx = st.idx(x, y);
    if (!st.flags[idx]) break;
    const sheet = TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? -1;
    if (!VINE_THREADS.has(sheet)) break;
    if (windySegs >= 5) segRot += 0.0075 * amt;
    if (windySegs >= 2) segRot += 0.0025;
    if (ALLOWS_WIND.has(st.wall[idx]) && (y < ENV.worldSurface) !== ENV.remix) windySegs++;
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
  rec: SwayRec, x: number, startY: number, type: number,
  trees?: TreeStyleData,
): void {
  const amount = Math.max(0, Math.min(1, Math.abs(windSway.wind) / 1.2));
  const amt = 0.2 + 0.8 * amount;
  // 爬到藤真底（CrawlToBottomOfReverseVine :770——向上生长链以底为锚）
  let botY = startY;
  for (let k = 0; k < 80; k++) {
    const ny = botY + 1;
    if (ny >= st.h || !st.flags[st.idx(x, ny)]) break;
    if (!REVERSE_VINE.has(TILE_DEFS[st.type[st.idx(x, ny)]]?.vanilla?.sheet ?? -1)) break;
    botY = ny;
  }
  startY = botY;
  let segRot = -0.08 * amt;
  const wc = getWindCycle(x, startY, counters.vine, ENV.worldSurface, ENV.remix);
  let vx = x * TILE + 8, vy = startY * TILE + TILE + 2;
  let pushChain = 0, lastPush = 0, windySegs = 0;
  for (let y = startY; y > Math.max(0, startY - 80); y--) {
    const idx = st.idx(x, y);
    if (!st.flags[idx]) break;
    const sheet = TILE_DEFS[st.type[idx]]?.vanilla?.sheet ?? -1;
    if (!REVERSE_VINE.has(sheet)) break;
    if (windySegs >= 5) segRot += 0.0075 * amt;
    if (windySegs >= 2) segRot += 0.0025;
    if (ALLOWS_WIND.has(st.wall[idx]) && (y < ENV.worldSurface) !== ENV.remix) windySegs++;
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
/** MultiTileVine 变体参数（:9428-9532 全量 1:1）。
 *  num3: null=按高度分式 / 常数=覆盖；num5: Y 偏移系数；num2Mul: 旋转量缩放；
 *  flag2: pivot 下移 16px 且顶行静止（部分形态）。91/465 用默认（num3=null, num5=-4）。 */
interface MultiVineVariant { num3: number | null; num5: number; num2Mul: number; flag2: boolean; nx: number; offX: number }
function multiVineVariant(sheet: number, fx: number, fy: number): MultiVineVariant {
  const v: MultiVineVariant = { num3: null, num5: -4, num2Mul: 1, flag2: false, nx: 1, offX: 0 };
  if (sheet === 34 || sheet === 126) {
    v.num3 = 1; v.num5 = 0;
    const key = Math.floor(fy / 54) + Math.floor(fx / 108) * 37;
    switch (key) {
      case 9: v.num3 = null; v.num5 = -1; v.flag2 = true; v.num2Mul = 0.3; break;
      case 11: v.num2Mul = 0.5; break;
      case 12: case 18: case 21: v.num3 = null; v.num5 = -1; break;
      case 23: case 35: v.num3 = 0; break;
      case 25: case 36: case 39: v.num3 = null; v.num5 = -1; v.flag2 = true; break;
      case 32: case 33: v.num2Mul = 0.5; break;
      case 37: v.num3 = null; v.num5 = -1; v.flag2 = true; v.num2Mul = 0.5; break;
      case 40: case 41: case 42: case 43: v.num3 = null; v.num5 = -2; v.flag2 = true; v.num2Mul = 0.5; break;
      case 44: v.num3 = null; v.num5 = -3; break;
      case 54: case 55: case 60: case 65: case 67: case 68: case 70: v.num3 = 0; break;
    }
  } else if (sheet === 42) {
    v.num3 = 1; v.num5 = 0;
    switch (Math.floor(fy / 36)) {
      case 0: case 12: case 14: case 28: case 34: case 38: v.num3 = null; v.num5 = -1; break;
      case 9: case 30: case 32: case 33: case 35: v.num3 = 0; break;
      case 39: case 40: case 41: case 42: case 43: v.num3 = null; v.num5 = -1; v.flag2 = true; break;
      case 54: case 55: case 60: case 65: case 67: case 70: v.num3 = 0; break;
    }
  } else if (sheet === 95 || sheet === 270 || sheet === 271 || sheet === 444
    || sheet === 454 || sheet === 572 || sheet === 581 || sheet === 660) {
    v.num3 = 1; v.num5 = 0;
  } else if (sheet === 591 || sheet === 592) {
    v.nx = 0.5; v.num5 = -2;
    // 592 的 GlowMask[294] 叠画 glowColor alpha=0（:9519-9522）——恒不可见，从略
  } else if (sheet === 698) {
    v.nx = 0.5; v.num5 = -1; v.offX = -10;
  }
  return v;
}

/** DrawMultiTileVinesInWind（:9407-9700）：吊挂植物绕顶部中心摆，下部摆幅大 */
function drawMultiVine(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  rec: SwayRec, ax: number, ay: number, type: number,
  trees?: TreeStyleData,
): void {
  const i0 = st.idx(ax, ay);
  if (!multiVineAnchor(rec.sheet, st.frameX[i0], st.frameY[i0])) return;
  const { sx, sy } = multiVineSize(rec.sheet);
  const { num3, num5, num2Mul, flag2, nx, offX } = multiVineVariant(rec.sheet, st.frameX[i0], st.frameY[i0]);
  // 风值 = sunflower 相位波 + 多圈扰动；不在风口则只余扰动（:9418-9424）
  let wc = getWindCycle(ax, ay, counters.sunflower, ENV.worldSurface, ENV.remix);
  const base = wc;
  wc += highestWindGridPushComplex(ax, ay, sy, 60, 1.26, 3, true);
  const windy = inAPlaceWithWind(st, ax, ay, sx, sy, ENV.worldSurface, ENV.remix);
  if (!windy) wc -= base;
  // 锚点=顶部中心（+(-2)）；平台下方吊挂再上移 8（IsBelowANonHammeredPlatform :38315：
  // 上方 Platform 族 + 非半砖 + 坡 0）。offX(698 的 -10) 同时作用于 dest——
  // 原版 offSet 进 vector 与 vector3 相消只留 origin 侧、dest=vector3+offSet+(0,offY)
  let pivotX = ax * TILE + sx * TILE * 0.5 + offX;
  let pivotY = ay * TILE - 2;
  if (flag2) pivotY += 16; // :9533-9536
  if (ax > 0) {
    const ai = st.idx(ax, ay - 1);
    const above = TILE_DEFS[st.type[ai]];
    if (above?.platform && !st.half[ai] && st.slope[ai] === 0) pivotY -= 8;
  }
  const ROT = -0.15 * num2Mul; // num2（0.15 后 *= -1，变体可再缩放）
  for (let j = 0; j < sy; j++) {
    let hFrac = (j + 1) / sy; // 与 MultiGrass 相反：越靠下摆幅越大
    if (hFrac === 0) hFrac = 0.1;
    if (num3 !== null) hFrac = num3; // 变体覆盖高度分式
    if (flag2 && j === 0) hFrac = 0; // flag2 顶行静止（:9649-9652）
    const offY = Math.abs(wc) * num5 * hFrac;
    for (let k = 0; k < sx; k++) {
      const cx = ax + k, cy = ay + j;
      if (!st.inBounds(cx, cy)) continue;
      const idx = st.idx(cx, cy);
      if (st.type[idx] !== type || !st.flags[idx]) continue;
      drawCell(ctx, atlas, st, rec, cx, cy, type, cx * TILE + offX, cy * TILE,
        pivotX, pivotY + offY, wc * ROT * hFrac, 0, offY, trees);
    }
  }
}

/** EmitTreeLeaves（:7905-8013 1:1）：频率门 + 位置偏移 + 落叶生成 */
function emitTreeLeaves(x: number, y: number, fx: number, fy: number, grassX: number, gore: number): void {
  if (!windSway.active) return; // _isActiveAndNotPaused 门（:7907-7910）
  if (!leafEmits(gore)) return;
  const flag = (gore >= 917 && gore <= 925) || (gore >= 1113 && gore <= 1121);
  let n = windSway.leafFreq;
  if (flag) n /= 2;                                   // 特殊叶频率减半
  if ((y < ENV.worldSurface) === ENV.remix) n = 10000; // DoesWindBlowAtThisHeight
  const isBranch = grassX !== x;
  if (isBranch) n *= 3;                               // 枝上叶频率 ×3 稀释
  if (n < 1 || Math.floor(Math.random() * n) !== 0) return;
  let vx = x * TILE + 8, vy = y * TILE + 8;
  if (isBranch) {
    vx += (x - grassX) * 12; // num4 = tilePosX - grassPosX（符号：grassX 在枝侧）
    const num5 = fy === 220 ? 1 : fy === 242 ? 2 : 0;
    if (fx === 66) {
      if (num5 <= 1) vy += -6;
      else vy += 8;
    } else {
      if (num5 === 0) vy += 4;
      else if (num5 === 1) { vx += 2; vy += -6; }
      else { vx += 6; vy += -6; }
    }
  } else {
    vx += -16; vy += -16;
    if (flag) vy -= Math.floor(Math.random() * 28) * 4;
  }
  // 起点须非实心（:8008：SolidTile(vector.ToTileCoordinates()) = floor(像素/16)
  // 直取格，无中心偏移——曾 +6 近似，2026-08-19 收齐）
  const tx = Math.floor(vx / TILE), ty = Math.floor(vy / TILE);
  if (ST.inBounds(tx, ty) && ST.isSolid(tx, ty)) return;
  natureParticles.spawnLeaf(vx, vy, gore);
}

/** DrawTrees（:8184-8460）：树冠/树枝摆动（墙后不摆 flag=tile.wall>0）+ 落叶喷出。
 *  冠/枝标记帧判定沿用本仓 drawTreeCell 约定 = fy>=198（含 fx=0 顶冠变体；
 *  原版 fx>=22 门是因为 fx=0 走 DrawSingleTile 普通路径，我们不区分） */
function drawTreeSway(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, st: TileStore,
  sheet: number, x: number, y: number, fx: number, fy: number,
  trees?: TreeStyleData,
): void {
  const isPalm = sheet === 323;
  const isCrownCell = isPalm ? (fx >= 88 && fx <= 132) : (fy >= 198);
  if (!isCrownCell) return;
  const idx = st.idx(x, y);
  if (st.liquid[idx] > 0) return; // EmitTreeLeaves 液体门（:7912-7915）——冠整格水下不出叶不摆
  // fx=0 顶冠变体：原版 DrawTrees 门是 frameX>=22（fx=0 走普通路径=静态、不摆、不出叶）
  const isVariantTop = !isPalm && fx < 22;
  let sway = 0;
  if (!isVariantTop && st.wall[idx] === 0) sway = getWindCycle(x, y, counters.tree, ENV.worldSurface, ENV.remix);
  drawTreeCell(ctx, atlas, st, x, y, fx, fy, x * TILE, y * TILE, sheet, true, trees, sway);
  if (isVariantTop || isPalm) return; // 棕榈冠原版无 EmitTreeLeaves（DrawTrees 323 块只画不喷）
  // 落叶：grassPosX = 枝方向侧树干列（GetCommonTreeFoliageData num13：44→+1 / 66→-1 / 顶→0）；
  // t 参数 = 树底【地面 tile】（Main.tile[grassPosX, floorY]）——不是 scanTreeType 的 style 序号！
  const grassX = x + (fx === 44 ? 1 : fx === 66 ? -1 : 0);
  const scan = scanTreeType(st, grassX, y);
  const baseIdx = st.idx(grassX, scan.floorY);
  const grassSheet = TILE_DEFS[st.type[baseIdx]]?.vanilla?.sheet ?? -1;
  emitTreeLeaves(x, y, fx, fy, grassX, getTreeLeaf(x, fx, fy, sheet, grassSheet));
}

// ---- EmitLiquidDrops 滴水源（路由 :695-700）----
/** 373 丛林叶/374 蜂巢叶/375 叶/461 垂叶/709 微光叶 */
const DRIP_TILES = new Set([373, 374, 375, 461, 709]);

/** EmitLiquidDrops（TileDrawing :7714-7790 1:1）：冷却 rand(num*2) + 区域查重 + 水型映射 */
function emitLiquidDrops(st: TileStore, x: number, y: number, i: number, sheet: number): void {
  let num = 60;
  if (sheet === 374) num = 120;
  else if (sheet === 375 || sheet === 461) num = 180;
  if (st.liquid[i] !== 0) return;
  if (Math.floor(Math.random() * (num * 2)) !== 0) return;
  // 区域查重：矩形 (x*16-34, y*16-100, 84, 400) 内已有活跃滴 → 本帧不喷
  const rx = x * TILE - 34, ry = y * TILE - 100;
  for (const d of natureParticles.drips) {
    if (d.x + 16 > rx && d.x < rx + 84 && d.y + 16 > ry && d.y < ry + 400) return;
  }
  natureParticles.spawnDrip(x * TILE, y * TILE, dripGoreFor(sheet, ENV.waterStyle, ENV.zones));
}

// ================= LitNature 晨昏光效（NextNatureRenderer :105-170） =================
// 原版为 LitNature 像素着色器（晨昏日光穿过植被的光束，SideFlags 即其接缝输入；
// 非着色器回退 = 普通直绘）。Canvas 2D 无着色器——可见性公式 1:1 + 太阳位暖色
// 加性光晕近似（光晕全屏而非仅植被=近似，强度按 vis 上限 0.16 很弱）。
const remap = (v: number, a: number, b: number, c: number, d: number) =>
  Math.max(0, Math.min(1, (v - a) / (b - a))) * (d - c) + c;

/** DrawAfterAllObjects 可见性（:117-147 1:1）：仅昼；晨/昏双窗，日食清零，×0.4 ×太阳地平线因子 */
export function litNatureVisibility(clock: Clock): number {
  const t = clock.timeOfDay;
  if (!(t > 0.25 && t < 0.75)) return 0;
  const time = ((t - 0.25) / 0.5) * 54000;
  const dawn = remap(time, 1200, 5400, 0, 1) * remap(time, 1200, 7200, 1, 0) * 0.3;
  let dusk = remap(time, 54000 - 10800, 54000 - 4200, 0, 1) * remap(time, 54000 - 1800, 54000 - 600, 1, 0) * 0.4;
  dusk *= dusk;
  let vis = Math.max(dawn, dusk);
  if (clock.eclipse) vis = 0;
  vis *= 0.4;
  // 太阳地平线因子：num4 = Remap(min(sunX, 1-sunX), 0, 1/96, 0, 1)（sunX≈屏幕占比）
  const ft = time / 54000;
  const edge = Math.min(ft, 1 - ft);
  vis *= remap(edge, 0, 1 / 96, 0, 1);
  return vis;
}

// ================= 主入口 =================

interface SwayCam { x: number; y: number; zoom: number; viewW: number; viewH: number }

/** 视区内全部摆动图块逐帧绘制（Renderer tile 层之后调用；世界变换内，世界坐标）。
 *  分发顺序对齐原版 PostDrawTiles :428-436：MultiTileVines → MultiTileGrass →
 *  Grass → AnyDirectionalGrass → Trees → Vines → ReverseVines（家族间有层级：
 *  树冠盖在草之上）。家族内序 = 行扫描（原版特殊点即主循环行扫描收集，等价）。 */
export function drawWindSwayTiles(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas, world: World,
  cam: SwayCam, z: number,
  clock?: Clock, waterStyle = 0,
  zones: { corrupt: boolean; crimson: boolean; hallow: boolean } = { corrupt: false, crimson: false, hallow: false },
): void {
  const st = world.store;
  ST = st;
  const t = clock?.timeOfDay ?? 0.5;
  const isDay = t > ClockVal.DAWN && t < ClockVal.DUSK;
  ENV = {
    worldSurface: world.groundLevel,
    remix: !!(world as { remixWorld?: boolean }).remixWorld,
    worldH: world.h,
    dayTime: isDay,
    moonPhase: clock?.moonPhase ?? 0,
    bloodMoon: clock?.bloodMoon ?? false,
    raining: !!world.weather?.raining,
    cloudAlpha: world.weather?.cloudAlpha ?? 0,
    mainTime: isDay ? ((t - 0.25) / 0.5) * 54000 : 0,
    waterStyle,
    zones,
  };
  const trees: TreeStyleData = {
    treeX: world.treeX, treeStyle: world.treeStyle, treeTops: world.treeTops,
    worldSurface: world.groundLevel, worldW: world.w,
  };
  const M = 8; // 边距：树冠 80px/藤链下行/多格物体越界绘制
  const tx0 = Math.max(0, Math.floor((cam.x - cam.viewW / 2 / z) / TILE) - M);
  const tx1 = Math.min(st.w - 1, Math.floor((cam.x + cam.viewW / 2 / z) / TILE) + M);
  const ty0 = Math.max(0, Math.floor((cam.y - cam.viewH / 2 / z) / TILE) - M);
  const ty1 = Math.min(st.h - 1, Math.floor((cam.y + cam.viewH / 2 / z) / TILE) + M);

  /** 单遍扫描，group 选择本遍要处理的家族（1:MultiVine+MultiGrass 2:Basic+Directional
   *  3:Tree+VineThread+ReverseVine） */
  const sweep = (group: 1 | 2 | 3): void => {
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
          const isAnchorVine = (set: Set<number>, dy: number) => {
            const ny = y + dy;
            return !(st.inBounds(x, ny) && st.flags[st.idx(x, ny)]
              && set.has(TILE_DEFS[st.type[st.idx(x, ny)]]?.vanilla?.sheet ?? -1));
          };
          switch (rec.kind) {
            case SwayKind.MultiVine:
              if (group === 1) drawMultiVine(ctx, atlas, st, rec, x, y, type, trees);
              break;
            case SwayKind.MultiGrass:
              if (group === 1) drawMultiGrass(ctx, atlas, st, rec, x, y, type, trees);
              break;
            case SwayKind.Basic:
              if (group === 2) drawBasicGrass(ctx, atlas, st, rec, x, y, type, trees);
              break;
            case SwayKind.Directional:
              if (group === 2) drawDirectionalGrass(ctx, atlas, st, rec, x, y, type, trees);
              break;
            case SwayKind.VineThread:
              // 锚点=藤顶（CrawlToTopOfVineAndAddSpecialPoint——真顶可能在扫描范围外，
              // 视区上缘格兜底起链，drawVineStrip 内部爬到真顶，仍整藤只画一次）
              if (group === 3 && (isAnchorVine(VINE_THREADS, -1) || y === ty0)) {
                drawVineStrip(ctx, atlas, st, rec, x, y, type, trees);
              }
              break;
            case SwayKind.ReverseVine:
              // 同理：真底可能在扫描范围外，下缘格兜底（drawRisingVineStrip 内爬真底）
              if (group === 3 && (isAnchorVine(REVERSE_VINE, +1) || y === ty1)) {
                drawRisingVineStrip(ctx, atlas, st, rec, x, y, type, trees);
              }
              break;
          }
          continue;
        }
        // 滴水源图块（EmitLiquidDrops :698-700：373 丛林叶/374/375/461/709——非摆动族，
        // 烘焙层照常绘制，此处仅概率喷滴）
        if (group === 2) {
          const v0 = TILE_DEFS[type]?.vanilla;
          if (v0 && DRIP_TILES.has(v0.sheet)) emitLiquidDrops(st, x, y, i, v0.sheet);
        }
        // 树族冠/枝标记格（非摆动集合但需动态摆动；干身仍在烘焙层）
        if (group === 3) {
          const v = TILE_DEFS[type]?.vanilla;
          if (v && TREE_SWAY_SHEETS.has(v.sheet) && v.sheet !== 72) {
            drawTreeSway(ctx, atlas, st, v.sheet, x, y, st.frameX[i], st.frameY[i], trees);
          }
        }
      }
    }
  };
  sweep(1); sweep(2); sweep(3);
}

/** 测试辅助：暴露内部状态 */
export const _windSwayInternals = { counters, windGrid, getWindCycle, windGridPush, inAPlaceWithWind, SWAY_REC, multiVineVariant };
