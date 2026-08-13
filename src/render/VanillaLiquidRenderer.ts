// 原版 1.4.0.5 液体渲染器：Terraria1405/GameContent/Liquid/LiquidRenderer.cs 逐行移植。
// 多 pass 网格算法（无任何矩形"浸润"hack）：
//  P1 缓存原始液位/实心/墙/类型（±2 padding）
//  P2 可见液位：干燥格被左右（或上下）同类型液体夹住 → 两侧液位之和×0.5（原版"透出"效果的本源）
//  P3 瀑布拖尾：向下传播 WATERFALL_LENGTH 格，透明度递减（水 10 / 岩浆 3 / 蜂蜜 2）
//  P4 四壁插值（Left/Right/Top/BottomWall 0-1）+ 边存在性 + 变体图集 FrameOffset
//  P5 壁值平滑（与上下/左右邻取加权均值）
//  P6/P7 角落修正（瀑布侧/内角填充）
//  绘制：water_N 表（48×1360：3 列变体 × 80px 动画带）按四壁裁源矩形 + 偏移贴图
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE_DEFS } from '../data/tiles';

const WATERFALL_LENGTH = [10, 3, 2];        // 水岩蜜（微光 vt=3 走 ?? 3 兜底——原版微光无瀑布拖尾分支，DrawShimmer 单独绘制）
const DEFAULT_OPACITY = [0.5, 0.9, 0.8, 0.75];  // 水 / 岩浆 / 蜂蜜 / 微光——原版 oldDrawWater num17:
                                          // 前景水基 0.5(cs:57029),岩浆 ×1.8、蜂蜜 ×1.6 钳 1(cs:57138-57150);
                                          // 微光 = DrawShimmer val×0.75（LiquidRenderer.cs:700）

// 我们的 liquidType（1 水 / 2 岩浆 / 3 蜂蜜 / 4 微光）→ 原版 LiquidType（0/1/2/3）
function toVanillaType(t: number): number {
  return t === 2 ? 1 : t === 3 ? 2 : t === 4 ? 3 : 0;
}
function waterSheet(vt: number, waterStyle = 0): string {
  if (vt === 1) return 'vanilla/Misc_water_1.png';   // 岩浆
  if (vt === 2) return 'vanilla/Misc_water_11.png';  // 蜂蜜
  if (vt === 3) return 'vanilla/Misc_water_14.png';  // 微光（Images/Misc/water_14，LiquidRenderer._liquidTextures[14]）
  // 水:群系水色（CalculateWaterStyle,Main.cs:56845）——0-10/12/13 十三种
  return `vanilla/Misc_water_${Math.max(0, Math.min(13, waterStyle))}.png`;
}

// ---- 微光 sparkle 数学（LiquidRenderer.cs:761-807 1:1） ----
/** GetShimmerWave :761-763：sin(((x+y/6)/10 - tVis/360) × 2π) */
function shimmerWave(x: number, y: number, tVis: number): number {
  return Math.sin(((x + y / 6) / 10 - tVis / 360) * Math.PI * 2);
}
/** GetShimmerBaseColor :803-807（float 版）：Lerp((0.647,0.510,0.933),(0.804,0.804,1), 0.1+wave×0.4) → 0-255 浮点。
 *  原版 SetShimmerVertexColors :745-759 对四角 (x,y)(x+1,y)(x,y+1)(x+1,y+1) 分别取值、顶点间插值；
 *  float 版供 2×2 子块双线性插值用，取整只发生在最终拼 rgb() 时（插值中途取整会丢精度）。 */
function shimmerBaseColorF(x: number, y: number, tVis: number): [number, number, number] {
  const w = shimmerWave(x, y, tVis);
  const k = 0.1 + w * 0.4;
  const lerp = (a: number, b: number) => 255 * (a + (b - a) * k);
  return [lerp(0.64705884, 41 / 51), lerp(26 / 51, 41 / 51), lerp(14 / 15, 1)];
}
/** SimpleWhiteNoise :793-797（uint 乘加混淆） */
function shimmerWhiteNoise(x: number, y: number): number {
  let ux = Math.abs(Math.floor(x)) >>> 0, uy = Math.abs(Math.floor(y)) >>> 0;
  ux = (36469 * (ux & 0xffff) + (ux >>> 16)) >>> 0;
  uy = (18012 * (uy & 0xffff) + (uy >>> 16)) >>> 0;
  return (((ux << 16) >>> 0) + uy) >>> 0;
}
/** Utils.Remap（单调区间重映射） */
function remap(v: number, a: number, b: number, c: number, d: number): number {
  if (b === a) return c;
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return c + (d - c) * t;
}
/** GetShimmerGlitterOpacity :773-790：top（液面格）恒 0.5；体部 = Remap(wave项×噪声项, 0, 0.5, 0, 1) */
function shimmerGlitterOpacity(top: boolean, x: number, y: number, tVis: number): number {
  if (top) return 0.5;
  const num = remap(shimmerWave(x, y, tVis), -0.5, 1, 0, 0.35);
  const num2 = Math.sin(shimmerWhiteNoise(x, y) / 10 + tVis / 180);
  return remap(num * num2, 0, 0.5, 0, 1);
}
/** GetShimmerFrame :791-801：((int)num % 16 + 16) % 16；非 top 帧加 (x+y) 相位 */
function shimmerFrame(top: boolean, x: number, y: number, tVis: number): number {
  let num = ((x + 0.5 + (y + 0.5) / 6) / 10) - tVis / 360;
  if (!top) num += (x + 0.5) + (y + 0.5);
  return ((Math.floor(num) % 16) + 16) % 16;
}

/** sparkle 源矩形（DrawShimmer :716-721）：先把 sourceRectangle 重置回【原始
 *  SourceRectangle】再加 X+48 / Y+80×fr。注意第二参数是原始 sy——表面格基底层
 * 虽强制切 Y=1280（:700），sparkle 仍按原始 Y 取带（表层漂移彩虹条的来源）。
 *  旧实现误传 1280：fr≥1 全部越界被跳过（彩虹条消失），fr=0 命中 Y=1280 黑底块画出黑斑。 */
export function shimmerSparkleSource(sx: number, sy: number, fr: number): [number, number] {
  return [sx + 48, sy + 80 * fr];
}

/**
 * 基底层波色叠加（SetShimmerVertexColors :745-759 的 Canvas2D 最优可达）。
 * 原版四角顶点色 = white × opacity × GetShimmerBaseColor(角)，顶点间插值；
 * Canvas2D 无顶点色，故把 16×16 tile 分 2×2 子块（8×8），每子块取四角双线性
 * 插值在其中心位置的色，以 multiply 叠在已画的 water_14 上（=纹理×色，同原版 modulate）。
 */
function applyShimmerBaseTint(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  dstX: number, dstY: number, w: number, h: number, tVis: number,
): void {
  const c00 = shimmerBaseColorF(x, y, tVis), c10 = shimmerBaseColorF(x + 1, y, tVis);
  const c01 = shimmerBaseColorF(x, y + 1, tVis), c11 = shimmerBaseColorF(x + 1, y + 1, tVis);
  ctx.save();
  // 原版 SetShimmerVertexColors 的乘法是【无条件 modulate】（纹理×顶点色），不带
  // 透明 pass 的 0.75 衰减——若沿用调用方残留的 globalAlpha，白色基底（表面格
  // Y=1280 整块纯白）只会被"部分染色"，表层色带被冲淡成灰白。故强制 1.0 全乘。
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'multiply';
  const subW = Math.ceil(w / 2), subH = Math.ceil(h / 2);
  for (let by = 0; by < 2; by++) {
    for (let bx = 0; bx < 2; bx++) {
      const bw = Math.min(subW, w - bx * subW), bh = Math.min(subH, h - by * subH);
      if (bw <= 0 || bh <= 0) continue;
      // 子块中心在 tile 内的归一化位置（dstX 相对 x*16 有壁值裁剪偏移）→ 四角双线性插值
      const u = (dstX + bx * subW + bw / 2 - x * 16) / 16;
      const v = (dstY + by * subH + bh / 2 - y * 16) / 16;
      const ch = (i: number) => c00[i] * (1 - u) * (1 - v) + c10[i] * u * (1 - v)
        + c01[i] * (1 - u) * v + c11[i] * u * v;
      ctx.fillStyle = `rgb(${Math.round(ch(0))},${Math.round(ch(1))},${Math.round(ch(2))})`;
      ctx.fillRect(dstX + bx * subW, dstY + by * subH, bw, bh);
    }
  }
  ctx.restore();
}

// ---- sparkle 彩虹（Main.hslToRgb，Main.cs:47266-47290 1:1）----
function hue2rgb(v1: number, v2: number, vH: number): number {
  if (vH < 0) vH += 1;
  if (vH > 1) vH -= 1;
  if (6 * vH < 1) return v1 + (v2 - v1) * 6 * vH;
  if (2 * vH < 1) return v2;
  if (3 * vH < 1) return v1 + (v2 - v1) * ((2 / 3) - vH) * 6;
  return v1;
}
/** Main.hslToRgb 1:1（GetShimmerGlitterColor :766-771 以 s=1/l=0.5 调用）→ RGB 0-1 */
function hslToRgb(hue: number, sat: number, lum: number): [number, number, number] {
  if (sat === 0) return [lum, lum, lum];
  const v2 = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const v1 = 2 * lum - v2;
  return [hue2rgb(v1, v2, hue + 1 / 3), hue2rgb(v1, v2, hue), hue2rgb(v1, v2, hue - 1 / 3)];
}

// ---- sparkle 染色变体缓存（离线预渲染）----
// 关键①：sparkle 闪纹是灰度像素（饱和度 0），CSS hue-rotate 对纯白/纯灰是 no-op——
// 旧实现 ctx.filter=hue-rotate 等于没上色，闪纹显示为白色而非原版彩虹。
// 故离线预渲染染色副本：hue 量化 16 档（((px+py/6)+t/30)/6 % 1），每档一条
// water_14 的 sparkle 带（X∈[48,宽)，:721 sourceRectangle.X += 48）整条染色，惰性构建。
// 关键②（黑底根因，2026-08-12 像素审计）：原版 water_14 的 sparkle 带是
// 【黑底不透明】的灰度加色闪纹——整带 X∈[48,96)/Y∈[0,1280) 三通道差恒 0（纯灰度），
// 约 2/3 像素是 alpha=255 的纯黑。原版 XNA 侧该带由 SetShimmerVertexColors_Sparkle
// 的顶点色（RGB=彩虹、A=glitter 强度）整体门控呈现；Canvas2D 的 multiply/直画
// 序列没有这个门控，黑底被当成实心像素 → 用户所见的"黑色背景"。
// 修法 = 加色闪纹语义还原：灰度亮度即强度 → 以亮度重造 alpha（黑 → 透明），
// RGB 写成 HSL 彩虹色（tintSparkleBand，纯函数供测试探针）。
// 绘制沿用原版源矩形 (sx+48, sy+80*fr)（在副本内即 −48），一条带覆盖全部
// 帧行/变体子矩形——避免逐帧×hue 的 16×16 变体随 sx/sy 爆炸，单 hue 一份即可。
const SPARKLE_HUE_STEPS = 16;
const _sparkleTintCache = new Map<number, HTMLCanvasElement>();

/** sparkle 变体逐像素重造：灰度亮度 → alpha（黑底归零），RGB → HSL 彩虹色。 */
export function tintSparkleBand(data: Uint8ClampedArray, r: number, g: number, b: number): void {
  for (let i = 0; i < data.length; i += 4) {
    // 灰度带（三通道相等）→ 亮度即灰度值；保留亚像素抗锯齿渐变（闪纹边缘软过渡）
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
    data[i + 3] = lum;
  }
}

function shimmerSparkleTint(tex: HTMLImageElement, hueIdx: number): HTMLCanvasElement | null {
  let c = _sparkleTintCache.get(hueIdx);
  if (c) return c;
  const bandX = 48;                     // :721 sparkle 带 X 偏移（water_14 第 4-6 列 16px 带）
  const bandW = tex.width - bandX;
  if (bandW <= 0 || typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = bandW; c.height = tex.height;
  const cc = c.getContext('2d');
  if (!cc) return null;
  cc.imageSmoothingEnabled = false;
  cc.drawImage(tex, bandX, 0, bandW, tex.height, 0, 0, bandW, tex.height);
  const [r, g, b] = hslToRgb(hueIdx / SPARKLE_HUE_STEPS, 1, 0.5);
  const img = cc.getImageData(0, 0, bandW, tex.height);
  tintSparkleBand(img.data, Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  cc.putImageData(img, 0, 0);
  _sparkleTintCache.set(hueIdx, c);
  return c;
}

// ---- 类型数组池(2026-08 审计 G1):此前每 pass 分配 24 个数组 ×2 pass/帧
// ≈ 744KB/帧 ≈ 45MB/s 的 GC 压力。容量只增不减;每调用前 fill(0) 保持与
// "新分配数组"完全相同的语义(未写格一律 0) ----
let _liqCap = 0;
let _level: Float32Array, _visLevel: Float32Array, _opacity: Float32Array;
let _isSolidA: Uint8Array, _hasLiquidA: Uint8Array, _hasWallA: Uint8Array;
let _hasVisA: Uint8Array, _typeA: Uint8Array, _visTypeA: Uint8Array;
let _lW: Float32Array, _rW: Float32Array, _bW: Float32Array, _tW: Float32Array;
let _vlW: Float32Array, _vrW: Float32Array, _vbW: Float32Array, _vtW: Float32Array;
let _hasLE: Uint8Array, _hasRE: Uint8Array, _hasTE: Uint8Array, _hasBE: Uint8Array;
let _isHalfA: Uint8Array;
let _fx: Int16Array, _fy: Int16Array;

// ---- 调试快照（F5 DebugReport render.subsystems.liquids 消费；模块级因本渲染器是自由函数）----
export interface LiquidDebugState {
  /** 最近一次 draw 的调用序号（双 pass 各 +1 → 每帧 +2） */
  calls: number;
  /** 最近一次 draw 时刻 ms */
  lastMs: number;
  /** 群系水色 id（CalculateWaterStyle 结果；水贴图 Misc_water_<n>.png 的 n） */
  waterStyle: number;
  /** 当前群系水色解析出的水体贴图名 */
  waterSheet: string;
  /** 最近一次 draw 是否背景 pass */
  isBackground: boolean;
  /** 动画参数（1456 双帧机制） */
  animFrame: number;
  waterfallFrame: number;
  windSpeed: number;
  /** 最近一次 draw 的可见 tile 窗口（padding 前） */
  window: [number, number, number, number];
  /** 最近一次 draw 命中的液体类型表（原版 LiquidType 键 → 贴图是否就绪） */
  sheetsReady: Array<[number, boolean]>;
  atlasReady: boolean;
}
const _liqDebug: LiquidDebugState = {
  calls: 0, lastMs: 0, waterStyle: 0, waterSheet: '', isBackground: false,
  animFrame: 0, waterfallFrame: 0, windSpeed: 0, window: [0, 0, 0, 0],
  sheetsReady: [], atlasReady: false,
};

/** 液体渲染调试快照（只读消费；DebugReport render.subsystems.liquids） */
export function liquidDebugState(): LiquidDebugState {
  return _liqDebug;
}

export function drawVanillaLiquids(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null,
  st: TileStore, groundLevel: number,
  tx0: number, ty0: number, tx1: number, ty1: number,
  nowMs: number, isBackground = false, windSpeed = 0, waterStyle = 0,
): void {
  if (!atlas) { _liqDebug.atlasReady = false; return; }
  const PAD = 2;
  const px0 = tx0 - PAD, py0 = ty0 - PAD;
  const pw = tx1 - tx0 + 1 + PAD * 2, ph = ty1 - ty0 + 1 + PAD * 2;
  const n = pw * ph;
  if (n > _liqCap) {
    // 只增不减(缩放变化按最大视图分配一次)
    _liqCap = n;
    _level = new Float32Array(n); _visLevel = new Float32Array(n); _opacity = new Float32Array(n);
    _isSolidA = new Uint8Array(n); _hasLiquidA = new Uint8Array(n); _hasWallA = new Uint8Array(n);
    _hasVisA = new Uint8Array(n); _typeA = new Uint8Array(n); _visTypeA = new Uint8Array(n);
    _lW = new Float32Array(n); _rW = new Float32Array(n); _bW = new Float32Array(n); _tW = new Float32Array(n);
    _vlW = new Float32Array(n); _vrW = new Float32Array(n); _vbW = new Float32Array(n); _vtW = new Float32Array(n);
    _hasLE = new Uint8Array(n); _hasRE = new Uint8Array(n); _hasTE = new Uint8Array(n); _hasBE = new Uint8Array(n);
    _isHalfA = new Uint8Array(n);
    _fx = new Int16Array(n); _fy = new Int16Array(n);
  }
  // 归零(等价新分配数组;未写格语义为 0)。
  // 例外:opacity 原为 .fill(1)——P3 只写到 ph-10 行,底缘 8 行依赖初始 1,
  // 必须保持 fill(1) 否则视口底缘水体透明度归零(渲染结果变化)
  _level.fill(0); _visLevel.fill(0); _opacity.fill(1);
  _isSolidA.fill(0); _hasLiquidA.fill(0); _hasWallA.fill(0);
  _hasVisA.fill(0); _typeA.fill(0); _visTypeA.fill(0);
  _lW.fill(0); _rW.fill(0); _bW.fill(0); _tW.fill(0);
  _vlW.fill(0); _vrW.fill(0); _vbW.fill(0); _vtW.fill(0);
  _hasLE.fill(0); _hasRE.fill(0); _hasTE.fill(0); _hasBE.fill(0);
  _isHalfA.fill(0);
  _fx.fill(0); _fy.fill(0);
  const level = _level, visLevel = _visLevel, opacity = _opacity;
  const isSolidA = _isSolidA, hasLiquidA = _hasLiquidA, hasWallA = _hasWallA;
  const hasVisA = _hasVisA, typeA = _typeA, visTypeA = _visTypeA;
  const lW = _lW, rW = _rW, bW = _bW, tW = _tW;
  const vlW = _vlW, vrW = _vrW, vbW = _vbW, vtW = _vtW;
  const hasLE = _hasLE, hasRE = _hasRE, hasTE = _hasTE, hasBE = _hasBE;
  const isHalfA = _isHalfA;
  const fx = _fx, fy = _fy;

  // ---- P1：原始缓存 ----
  for (let lx = 0; lx < pw; lx++) {
    const x = px0 + lx;
    for (let ly = 0; ly < ph; ly++) {
      const y = py0 + ly;
      const i = lx * ph + ly;
      if (!st.inBounds(x, y)) { isSolidA[i] = 1; continue; }
      const si = st.idx(x, y);
      const lq = st.liquid[si];
      level[i] = lq / 255;
      hasLiquidA[i] = lq > 0 ? 1 : 0;
      hasWallA[i] = st.wall[si] > 0 ? 1 : 0;
      typeA[i] = toVanillaType(st.liquidType[si]);
      visTypeA[i] = typeA[i]; // P3 只跑到底部 10 行外（同原版 L152）——预填本格类型兜底，
                              // 否则底带格子 visTypeA=0 被当水画（原版靠跨帧残留缓存掩蔽）
      const d = TILE_DEFS[st.type[si]];
      isSolidA[i] = d && d.solid ? 1 : 0;
    }
  }
  const at = (lx: number, ly: number) => lx * ph + ly; // padding 内坐标
  // 半砖缓存（LiquidRenderer.cs:103-110）：halfBrick && 上格有液体 && 非平台；
  // 无液体时类型继承上格（109-110）。注意 ptr[-1] = y-1 = 上格
  for (let lx = 0; lx < pw; lx++) {
    for (let ly = 1; ly < ph; ly++) {
      const i = at(lx, ly);
      if (!st.inBounds(px0 + lx, py0 + ly)) continue;
      const si = st.idx(px0 + lx, py0 + ly);
      const d = TILE_DEFS[st.type[si]];
      if (st.half[si] && hasLiquidA[at(lx, ly - 1)] && !(d && d.platform)) {
        isHalfA[i] = 1;
        if (!hasLiquidA[i]) typeA[i] = typeA[at(lx, ly - 1)];
      }
    }
  }

  // ---- P2：可见液位（内区 = 真实视图区） ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      let v: number;
      if (isHalfA[i] && hasLiquidA[at(lx, ly - 1)]) {
        v = 1; // 半砖 + 上格有液体：可视液面拉满（LiquidRenderer.cs:121-122）
      } else if (!hasLiquidA[i]) {
        const li = at(lx - 1, ly), ri = at(lx + 1, ly), ui = at(lx, ly - 1), di = at(lx, ly + 1);
        let val = 0;
        // 原版先判 ptr[-1]/[+1]（上下），后判 ptr[-H]/[+H]（左右）→ 左右命中时 Type 覆盖（L129-138）
        if (hasLiquidA[ui] && hasLiquidA[di] && typeA[ui] === typeA[di] && !isSolidA[ui] && !isSolidA[di]) {
          val = level[ui] + level[di];
          typeA[i] = typeA[ui];
        }
        if (hasLiquidA[li] && hasLiquidA[ri] && typeA[li] === typeA[ri] && !isSolidA[li] && !isSolidA[ri]) {
          val = Math.max(val, level[li] + level[ri]);
          typeA[i] = typeA[li];
        }
        v = val * 0.5;
      } else {
        v = level[i];
      }
      visLevel[i] = v;
      hasVisA[i] = v !== 0 ? 1 : 0;
    }
  }

  // ---- P3：瀑布拖尾（向下传播） + 实心格处理 ----
  for (let lx = 0; lx < pw; lx++) {
    for (let ly = 0; ly < ph - 10; ly++) {
      const i = at(lx, ly);
      if (hasVisA[i] && (!isSolidA[i] || isHalfA[i])) {
        opacity[i] = 1;
        visTypeA[i] = typeA[i];
        const len = WATERFALL_LENGTH[typeA[i]] ?? 3;
        const step = 1 / (len + 1);
        let k = 1;
        for (let s = 1; s <= len; s++) {
          k -= step;
          const bi = at(lx, ly + s);
          if (ly + s >= ph) break;
          if (!isSolidA[bi]) {
            visLevel[bi] = Math.max(visLevel[bi], visLevel[i] * k);
            opacity[bi] = k;
            visTypeA[bi] = typeA[i];
          } else break;
        }
      }
      if (isSolidA[i] && !isHalfA[i]) {
        visLevel[i] = 1;
        hasVisA[i] = 0;
      } else {
        // 原版 L178-179：非实心格在此重算可见性——P3 拖尾写入的干格因此变为可见
        hasVisA[i] = visLevel[i] !== 0 ? 1 : 0;
      }
    }
  }

  // ---- P4：四壁插值 + 边存在 + 变体 FrameOffset ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasVisA[i]) { hasLE[i] = hasRE[i] = hasTE[i] = hasBE[i] = 0; continue; }
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      let nT = 0, nB = 1, nL = 0, nR = 1;
      const my = visLevel[i];
      if (!hasVisA[ui]) nT += visLevel[di] * (1 - my);
      if (!hasVisA[di] && !isSolidA[di] && !isHalfA[di]) nB -= visLevel[ui] * (1 - my);
      if (!hasVisA[li] && !isSolidA[li] && !isHalfA[li]) nL += visLevel[ri] * (1 - my);
      if (!hasVisA[ri] && !isSolidA[ri] && !isHalfA[ri]) nR -= visLevel[li] * (1 - my);
      tW[i] = nT; bW[i] = nB; lW[i] = nL; rW[i] = nR;
      hasTE[i] = (!hasVisA[ui] && !isSolidA[ui]) || nT !== 0 ? 1 : 0;
      hasBE[i] = (!hasVisA[di] && !isSolidA[di]) || nB !== 1 ? 1 : 0;
      hasLE[i] = (!hasVisA[li] && !isSolidA[li]) || nL !== 0 ? 1 : 0;
      hasRE[i] = (!hasVisA[ri] && !isSolidA[ri]) || nR !== 1 ? 1 : 0;
      // 注:原版 1.4.5.6 的 _waveMask 几何波动是【死代码】——WAVE_MASK_STRENGTH 是
      // new byte[5] 全零从不赋值、WaveFilters 事件全工程无订阅者(LiquidRenderer.cs:110/616)。
      // 用户感知的"水面波动"全部来自 16 帧纹理动画(下方 :289-291 已 1:1)+ 表面静态带 1280,
      // 此处曾加过的正弦 TopWall 扰动是多余的非原版效果,已按源码标杆移除。
      let ox = 0, oy = 0;
      if (!hasLE[i]) { ox += hasRE[i] ? 32 : 16; }
      if (hasLE[i] && hasRE[i]) {
        ox = 16; oy += 32;
        if (hasTE[i]) oy = 16;
      } else if (!hasTE[i]) {
        if (!hasLE[i] && !hasRE[i]) oy += 48;
        else oy += 16;
      }
      if (oy === 16 && !!(hasLE[i] ^ hasRE[i]) && (py0 + ly) % 2 === 0) oy += 16;
      fx[i] = ox; fy[i] = oy;
    }
  }

  // ---- P5：壁值平滑 ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasVisA[i]) continue;
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      vlW[i] = lW[i]; vrW[i] = rW[i]; vtW[i] = tW[i]; vbW[i] = bW[i];
      if (hasVisA[ui] && hasVisA[di]) {
        if (hasLE[i]) vlW[i] = (lW[i] * 2 + lW[ui] + lW[di]) * 0.25;
        if (hasRE[i]) vrW[i] = (rW[i] * 2 + rW[ui] + rW[di]) * 0.25;
      }
      if (hasVisA[li] && hasVisA[ri]) {
        if (hasTE[i]) vtW[i] = (tW[i] * 2 + tW[li] + tW[ri]) * 0.25;
        if (hasBE[i]) vbW[i] = (bW[i] * 2 + bW[li] + bW[ri]) * 0.25;
      }
    }
  }

  // ---- P6：瀑布侧/邻接修正 ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasLiquidA[i]) continue;
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      if (hasTE[i] && !hasBE[i] && !!(hasLE[i] ^ hasRE[i])) {
        if (hasRE[i]) { vrW[i] = vrW[di]; vtW[i] = vtW[li]; }
        else { vlW[i] = vlW[di]; vtW[i] = vtW[ri]; }
      } else if (fx[di] === 16 && fy[di] === 32) {
        if (vlW[i] > 0.5) { vlW[i] = 0; fx[i] = 0; fy[i] = 0; }
        else if (vrW[i] < 0.5) { vrW[i] = 1; fx[i] = 32; fy[i] = 0; }
      }
    }
  }

  // ---- P7：内角填充 ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasLiquidA[i]) continue;
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      if (!hasBE[i] && !hasLE[i] && !hasTE[i] && !hasRE[i]) {
        // 原版 LiquidRenderer.cs:342-346：left.HasTopEdge && up.HasLeftEdge，墙面取 up.vlW / left.vtW
        if (hasTE[li] && hasLE[ui]) {
          fx[i] = Math.max(4, Math.floor(16 - vlW[ui] * 16)) - 4;
          fy[i] = 48 + Math.max(4, Math.floor(16 - vtW[li] * 16)) - 4;
          vlW[i] = 0; vtW[i] = 0; vrW[i] = 1; vbW[i] = 1;
        } else if (hasTE[ri] && hasRE[ui]) {
          fx[i] = 32 - Math.min(16, Math.floor(vrW[ui] * 16) - 4);
          fy[i] = 48 + Math.max(4, Math.floor(16 - vtW[ri] * 16)) - 4;
          vlW[i] = 0; vtW[i] = 0; vrW[i] = 1; vbW[i] = 1;
        }
      }
    }
  }

  // ---- 绘制 ----
  const texCache = new Map<number, HTMLImageElement | null>();
  const texFor = (vt: number) => {
    let t = texCache.get(vt);
    if (t === undefined) {
      t = atlas.ensureVImage(waterSheet(vt, waterStyle)) ?? null;
      if (t) texCache.set(vt, t);  // 只缓存命中(缓存 null 会把未就绪永久化)
    }
    return t;
  };
  // 双动画帧（1456 LiquidRenderer.Update :844-856）：
  //  _animationFrame = windSpeed*25 ± 6 每 秒（边缘格波浪,负风倒放,模 16）
  //  _waterfallAnimationFrame = 0.5 每 秒（X==16 中列 = 下落水柱/池体,慢速流纹——
  //  1.4.4 新增;1405 无此项,旧移植全部格共用快帧导致下落水柱 6fps 快闪"贴图不对"）
  const rate = windSpeed >= 0 ? windSpeed * 25 + 6 : windSpeed * 25 - 6;
  const animFrame = ((Math.floor((nowMs / 1000) * rate) % 16) + 16) % 16;
  const waterfallFrame = Math.floor((nowMs / 1000) * 0.5) % 16;
  ctx.imageSmoothingEnabled = false;

  // 主循环（双 pass 共用：背景 pass 画在方块层前、透明度 1.0；前景 pass 画在方块后、乘 DEFAULT_OPACITY）
  for (let lx = PAD; lx < pw - PAD; lx++) {
    const x = px0 + lx;
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const y = py0 + ly;
      const i = at(lx, ly);
      if (!hasVisA[i]) continue;
      const vt = visTypeA[i];
      const tex = texFor(vt);
      if (!tex) continue;
      const n2 = Math.min(0.75, vlW[i]), n3 = Math.max(0.25, vrW[i]);
      const n4 = Math.min(0.75, vtW[i]);
      let n5 = Math.max(0.25, vbW[i]);
      // 半砖可视底边截到半格（LiquidRenderer.cs:382-383）
      if (isHalfA[i] && isSolidA[i] && n5 > 0.5) n5 = 0.5;
      // IsVisible（LiquidRenderer.cs:384）：半砖格自身有半液且无墙 → 不画（交给上格溢流）
      if (isHalfA[i] && hasLiquidA[i] && level[i] < 1 && !hasWallA[i]) continue;
      const sx = Math.floor(16 - n3 * 16) + fx[i];
      const sy = Math.floor(16 - n5 * 16) + fy[i];
      const sw = Math.ceil((n3 - n2) * 16), sh = Math.ceil((n5 - n4) * 16);
      const isSurface = fx[i] === 16 && fy[i] === 0 && y > groundLevel - 40;
      // 帧选择 1:1（DrawNormalLiquids :636-644）：中列（sx==16,下落柱/池体）走慢速瀑布帧
      const srcY = isSurface ? 1280 : sy + (sx === 16 ? waterfallFrame : animFrame) * 80;
      if (sw <= 0 || sh <= 0 || sx + sw > tex.width || srcY + sh > tex.height) continue;
      // ---- 微光（shimmer, vt=3）：DrawShimmer（LiquidRenderer.cs:682-730）----
      // 原版三步：①基底层 water_14 直画 + 逐顶点 GetShimmerBaseColor 波动蓝移（:745-759）
      // ②sparkle 层：源矩形 X+48（water_14 的第 4 列 16px 闪纹带）、Y+80×GetShimmerFrame
      // 16 帧动画，仅 flag（非内部/瀑布帧）或 (x+y)%2==0 的格子画（:720-729）
      // ③sparkle 顶点色 = GetShimmerGlitterColor 漂移彩虹 + 呼吸 alpha（:766-790）
      // Canvas 无逐顶点色：基底层 2×2 子块双线性 multiply（applyShimmerBaseTint，
      // 薄边缘条 sw<8 跳过防透明像素被压暗）；sparkle 用离线染色变体（hue 16 档量化）、
      // alpha 取四角均值
      if (vt === 3) {
        const tVis = (nowMs / 1000) * 60;                      // ≈ Main.timeForVisualEffects（帧计数）
        const dstX = x * 16 + Math.floor(n2 * 16), dstY = y * 16 + Math.floor(n4 * 16);
        ctx.globalAlpha = Math.min(1, opacity[i] * (isBackground ? 1 : 0.75));
        ctx.drawImage(tex, sx, srcY, sw, sh, dstX, dstY, sw, sh);
        if (sw >= 8) applyShimmerBaseTint(ctx, x, y, dstX, dstY, sw, sh, tVis);
        const flag = !(sx === 16 || sy % 80 === 48);           // :719
        if (flag || (x + y) % 2 === 0) {
          // alpha = 像素亮度（tintSparkleBand 已把灰度写进 alpha）× 四角
          // GetShimmerGlitterOpacity 均值。四角均值与原版逐顶点双线性插值的面积均值
          // 数值等价（全网格采样验证平均差 0.0000），top（=有干燥邻边的表层/边缘格，
          // :719 flag=true）四角恒 0.5；body（全浸没 (sx,sy)=(16,48) 内部格）复算
          // 均值 0.09 / 峰值 0.34 → 星点恒为极淡彩虹（近白微闪）。注意 sparkle 不乘
          // 前景 0.75/背景 1 系数——SetShimmerVertexColors_Sparkle :732-743 直接
          // ×= ptr->Opacity
          const ga = (shimmerGlitterOpacity(flag, x, y, tVis)
            + shimmerGlitterOpacity(flag, x + 1, y, tVis)
            + shimmerGlitterOpacity(flag, x, y + 1, tVis)
            + shimmerGlitterOpacity(flag, x + 1, y + 1, tVis)) * 0.25;  // :773-790
          if (ga > 0.02) {
            const fr = shimmerFrame(flag, x, y, tVis);         // :791-801
            // :716 sparkle 前把 sourceRectangle 重置回原始 SourceRectangle 再加偏移——
            // 表面格的基底层虽强制切 Y=1280（:700），但 sparkle 的 Y 用的是原始 sy+80*fr
            // （shimmerSparkleSource）。旧实现误用 1280+80*fr：表面格 sparkle 几乎全部
            // 越界被跳过（=表层"彩虹条"消失），仅 fr=0 时命中 Y=1280 的黑底块反而画出黑斑。
            const [sSrcX, sSrcY] = shimmerSparkleSource(sx, sy, fr);
            if (sSrcX + sw <= tex.width && sSrcY + sh <= tex.height) {
              const hue = (((x + y / 6) + tVis / 30) / 6) % 1; // :767 彩虹相位
              const hueIdx = ((Math.floor(hue * SPARKLE_HUE_STEPS) % SPARKLE_HUE_STEPS)
                + SPARKLE_HUE_STEPS) % SPARKLE_HUE_STEPS;
              const spark = shimmerSparkleTint(tex, hueIdx);   // 染色带；null 则退回原图（无彩虹）
              ctx.save();
              // 原版 sparkle pass 是【加色叠加】非 source-over：GetShimmerGlitterColor
              // :766-771 先 color.A=0 再 vector4×glitter → 顶点 alpha 恒 0、RGB 已预乘
              // glitter 强度；tileBatch = SpriteBatch 默认 AlphaBlend（预乘 (One,
              // InvSrcAlpha)，TileBatch.Begin :216）→ 最终像素 = 基底 + 灰度纹素×彩虹×
              // glitter×tileOpacity，黑底纹素贡献恰为 0、基色不被替换。旧实现 source-over
              // 以饱和彩虹【替换】基色（dst×(1-a)+彩虹×a）→ body 星点呈高可见度彩色块
              // （用户实测"闪光点变成彩色的"），改 'lighter' 后 body 星点 = 基底上微弱
              // 增亮的近白微闪、表面白基底上呈漂移彩虹条（与原版一致）。
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = Math.min(1, opacity[i] * ga);
              ctx.drawImage(spark ?? tex, sSrcX + (spark ? -48 : 0), sSrcY, sw, sh,
                dstX, dstY, sw, sh);
              ctx.restore();
            }
          }
        }
        continue;
      }
      // 双 pass（Main.cs DrawWaters(true/false) + LiquidRenderer.InternalDraw）：
      // 背景 pass 不透明（露出方块透明像素 = 浸润）；前景 pass 水 0.6 半透明质感
      ctx.globalAlpha = Math.min(1, opacity[i] * (isBackground ? 1 : (DEFAULT_OPACITY[vt] ?? 0.6)));
      ctx.drawImage(tex, sx, srcY, sw, sh,
        x * 16 + Math.floor(n2 * 16), y * 16 + Math.floor(n4 * 16), sw, sh);
    }
  }

  // ---- 浸润 pass：DrawTile_LiquidBehindTile(TileDrawing.cs:3859-4193) ----
  // 对每个【实心方块格】，检查四邻是否有液体 → 在方块格内画一条液体带
  // （背景 pass，不透明）。方块贴图画在其上——透明圆角像素透出液体色而不是墙色/背景色。
  // 这是原版"水体包裹方块"的全部秘密；条带宽度由邻接方向决定：
  //   仅上方有水 → 格顶 16×4 横条(:4081-4087)
  //   仅下方有水 → 格底 16×4 横条(:4089-4093)
  //   仅左侧有水 → 格左 4px 竖条(:4113-4116);仅右侧 → 格右 4px(:4118-4121)
  //   左右都有   → 整格 16 宽(:4108-4111);深度按液体量 num6=(256-max)/32*2 从底收
  if (isBackground) drawLiquidBehindTiles(ctx, atlas, st, groundLevel, tx0, ty0, tx1, ty1, waterStyle);

  // ---- 调试快照落盘（DebugReport render.subsystems.liquids）----
  _liqDebug.calls++;
  _liqDebug.lastMs = nowMs;
  _liqDebug.waterStyle = waterStyle;
  _liqDebug.waterSheet = waterSheet(0, waterStyle);
  _liqDebug.isBackground = isBackground;
  _liqDebug.animFrame = animFrame;
  _liqDebug.waterfallFrame = waterfallFrame;
  _liqDebug.windSpeed = windSpeed;
  _liqDebug.window = [tx0, ty0, tx1, ty1];
  _liqDebug.sheetsReady = [...texCache.entries()].map(([vt, t]) => [vt, !!t] as [number, boolean]);
  _liqDebug.atlasReady = true;

  ctx.globalAlpha = 1;
}

// ---- LiquidSlope 斜面贴合（TileDrawing.cs:4526-4553 DrawPartialLiquid）----
// 语义勘定（2026-08-13 源码核）：LiquidSlope_N 不是"水面斜线"贴图——是
// 【被锤成坡面的实心格内液体】的斜面形状表。原版 DrawPartialLiquid 在 tile.slope()
// 1..4 时改用 TextureAssets.LiquidSlope[liquidType]（:4540-4552），源矩形 X 额外
// += 18*(slope-1)（:4539，表 72×16 = 4 列×18px 间距、16px 单元，像素实测四列
// 分别为 slope 1 右下斜/2 左下斜/3 右上斜/4 左上斜）。
// 原版该绘制有两个调用层（TileDrawing.cs:462 背景 pass / :529 实心层 pass）：
// 背景 pass 对普通块仍走平面 Liquid（flag = !BlocksWaterDrawingBehindSelf，
// :4528-4531），仅玻璃族(54/541/328/459/470)与实心层 pass 走斜面表。本仓只有
// 一个浸润 pass（无实心层液体带），采用实心层语义对所有坡面格生效——即还原
// 玩家可见结果（液体贴合坡面斜边）。【简化登记】坡面格与玻璃族的双 pass 差异
// 未拆分；LiquidSlope 的 Y 直接复用平面带算出的 ry/rh（原版同源 liquidSize）。
/** LiquidSlope 源矩形选择（纯函数）：slope 1..4 → 斜面表列 X = rx + 18*(slope-1)；
 *  slope 0 / 半砖 → null = 走平面 Liquid 表（:4531-4533 flag||num==0 直画分支）。 */
export function liquidSlopeSource(
  slope: number, rx: number, ry: number, rw: number, rh: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  if (slope < 1 || slope > 4) return null;
  return { sx: rx + 18 * (slope - 1), sy: ry, sw: rw, sh: rh };
}

/** LiquidSlope 表文件（与上方浸润 pass 的 Liquid_N 同一套 liquidType→style 映射：
 *  水=群系水色 0-13 / 岩浆=1 / 蜂蜜=11 / 微光=14，TextureAssets.LiquidSlope[15]） */
export function liquidSlopeSheet(vt: number, waterStyle = 0): string {
  if (vt === 1) return 'vanilla/LiquidSlope_1.png';   // 岩浆
  if (vt === 2) return 'vanilla/LiquidSlope_11.png';  // 蜂蜜
  if (vt === 3) return 'vanilla/LiquidSlope_14.png';  // 微光
  return `vanilla/LiquidSlope_${Math.max(0, Math.min(14, waterStyle))}.png`;
}

/**
 * 浸润 pass:原版 TilesRenderer.DrawLiquidBehindTiles → DrawTile_LiquidBehindTile
 * (TileDrawing.cs:3859-4193)。对视区内每个实心方块格检查四邻液体,在方块格内画液体带。
 * 背景 pass 调用(画在方块贴图之下)——透明圆角像素透出液体色。
 */
function drawLiquidBehindTiles(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, groundLevel: number,
  tx0: number, ty0: number, tx1: number, ty1: number, waterStyle = 0,
): void {
  // Liquid_N 贴图(16×16 纯液体块;水 Liquid_0 多 style 但取首 16px)
  const texCache = new Map<number, HTMLImageElement | null>();
  const texFor = (vt: number) => {
    let t = texCache.get(vt);
    if (t === undefined) {
      const file = vt === 1 ? 'vanilla/Liquid_1.png' : vt === 2 ? 'vanilla/Liquid_11.png'
      : vt === 3 ? 'vanilla/Liquid_14.png' // 微光
      : `vanilla/Liquid_${Math.max(0, Math.min(13, waterStyle))}.png`; // 群系水色(原版 DrawTile_LiquidBehindTile 同走 waterStyle)
      t = atlas.ensureVImage(file) ?? null;
      if (t) texCache.set(vt, t); // 只缓存命中(缓存 null 会把未就绪永久化——首帧丢条带)
    }
    return t;
  };

  for (let x = Math.max(1, tx0); x <= Math.min(st.w - 2, tx1); x++) {
    for (let y = Math.max(1, ty0); y <= Math.min(st.h - 2, ty1); y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue; // 空格没有"方块后面"
      const def = TILE_DEFS[st.type[i]];
      if (!def || !def.solid || def.platform) continue; // 仅实心方块(:4075 tileSolid 排除)

      // 四邻液体(TileDrawing.cs:3861-3900;379=conveyor 按 vanilla 视为无液体)
      const lq = (dx: number, dy: number) => {
        const nx = x + dx, ny = y + dy;
        if (!st.inBounds(nx, ny)) return { lq: 0, lt: 0 };
        const ni = st.idx(nx, ny);
        return { lq: st.liquid[ni], lt: st.liquidType[ni] || 1 };
      };
      const L = lq(-1, 0), R = lq(1, 0), U = lq(0, -1), D = lq(0, 1);
      // flag 语义(:3967-4053):flag=左 / flag2=右 / flag3=上 / flag4=下(>240)
      let fL = L.lq > 0; let fR = R.lq > 0; const fU = U.lq > 0, fD = D.lq > 240;
      if (!fL && !fR && !fU && !fD) continue; // :4055-4057 四邻无液体跳过

      // 液体类型与最大液位(:3940-3965 取最高液位邻居)
      let maxLq = 0, lt = 0;
      const consider = (n: { lq: number; lt: number }) => {
        if (n.lq > maxLq) { maxLq = n.lq; lt = toVanillaType(n.lt); }
      };
      if (fL) consider(L); if (fR) consider(R); if (fU) consider(U); if (fD) consider(D);
      const tex = texFor(lt); // lt=3 微光走 Liquid_14
      if (!tex) continue;

      // ---- 液体矩形计算(:4069-4123) ----
      // 原版默认 rect = (0, 4, 16, 16);pos = (tileX*16, tileY*16)
      let rx = 0, ry = 4, rw = 16, rh = 16;   // liquidSize(源矩形)
      let px = x * 16, py = y * 16;            // 目标位置

      if (fD && (fL || fR)) { fL = true; fR = true; /* :4070-4074 下+任一侧 → 双侧全宽 */ }
      if (!(fU && (fL || fR)) && !(fD && fU)) {
        if (fU) {
          // 仅上方有水:格顶 16×4 条(:4081-4087;坡面/半砖加深到 12)
          rh = 4;
          const isHalf = st.half[i];
          if (isHalf) rh = 12;
        } else if (fD && !fL && !fR) {
          // 仅下方:格底 16×4(:4089-4093)
          py = y * 16 + 12; rh = 4;
        } else {
          // 侧向有水(:4095-4123)
          let y0 = 4;
          const upNi = st.idx(x, y - 1);
          if (st.liquid[upNi] === 0 && !st.isSolid(x, y - 1)) y0 = 0; // 上方无液无实心→从格顶画(:4098-4101)
          const num6 = Math.floor((256 - maxLq) / 32) * 2; // 深度=液位不足时从底收(:4096,4102)
          const isHalf = st.half[i];
          if (fL && fR || isHalf) {
            // 左右都有 或 半砖:整格宽(:4108-4111)
            py = y * 16 + num6; ry = y0; rh = 16 - num6;
          } else if (fL) {
            // 仅左:格左 4px 竖条(:4113-4116)
            py = y * 16 + num6; ry = y0; rw = 4; rh = 16 - num6;
          } else {
            // 仅右:格右 4px 竖条(:4118-4121)
            px = x * 16 + 12; py = y * 16 + num6; ry = y0; rw = 4; rh = 16 - num6;
          }
        }
      }
      if (rw <= 0 || rh <= 0) continue;

      // ---- 源矩形钳制到贴图边界(原版 XNA PointClamp 自动钳;Canvas 2D 需显式) ----
      // Liquid_N 是 16×16 纯块;ry=4 起 + rh=16 会到 y=20 越界——XNA 读边缘像素,
      // 我们钳 rh = tex.height - ry 保持等比(不画满时目标也同步缩)
      const srcH = Math.min(rh, tex.height - ry);
      const srcW = Math.min(rw, tex.width - rx);
      if (srcW <= 0 || srcH <= 0) continue;
      const dstH = srcH; // 源=目标尺寸(原版 DrawPartialLiquid 同源同目标)
      const dstW = srcW;

      // ---- 微光分支（TileDrawing.cs:4188-4191 num2==14）----
      // 原版 SetShimmerVertexColors 把四角顶点色【整体重置】为 White×opacity×
      // GetShimmerBaseColor(角)——上方整段 num7 透明度/光照计算对微光全部丢弃，
      // opacity = solidLayer ? 0.75 : 1。本函数只在背景 pass 调用（= 原版
      // DrawLiquidBehindTiles :462 的 solidLayer:false 调用点）→ opacity 1。
      // 彩色叠加【该有】：旧注释"省略彩色叠加"与末尾的 multiply 叠加自相矛盾，
      // 按源码对齐为"不透明直画 + 2×2 子块波色 multiply"（与前景 DrawShimmer 同式）。
      if (lt === 3) {
        ctx.globalAlpha = 1;
        ctx.drawImage(tex, rx, ry, srcW, srcH, px, py, dstW, dstH);
        if (srcW >= 8) applyShimmerBaseTint(ctx, x, y, px, py, dstW, dstH,
          (performance.now() / 1000) * 60);
        continue;
      }

      // ---- 不透明度(:4126-4146) ----
      // 地上=1.0(有墙压 0.6,墙 21→0.9);地下=0.5 基线
      let alpha = 0.5;
      if (y <= Math.floor(groundLevel)) {
        alpha = 1.0;
        const wi = st.wall[i];
        if (wi === 21) alpha = 0.9;
        else if (wi > 0) alpha = 0.6;
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(tex, rx, ry, srcW, srcH, px, py, dstW, dstH);
    }
  }
  ctx.globalAlpha = 1;
}
