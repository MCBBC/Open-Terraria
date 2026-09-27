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
import type { GLSpriteLayer, TexEntry } from './GLSpriteLayer';
import { TileStore } from '../world/TileStore';
import { TILE_DEFS } from '../data/tiles';
import { waterWaves } from './WaterWaves';
import { texId, texReady } from './texId';
import { swPerf } from './perfFlags';   // ★BJ77 零语义优化层总闸(★转正缺省开;?swperf=0=豁免口回退旧行为逐位)
import { visEffectFrames } from '../entities/Enemy';   // ★2026-09-27 微光 tVis 重钉钟面（function 声明=环安全;函数体内调用）
import { gameTickCount } from '../core/GameTime';      // ★2026-09-27 液体相位逐 tick 累计钟源

const WATERFALL_LENGTH = [10, 3, 2];        // 水岩蜜（微光 vt=3 走 ?? 3 兜底——原版微光无瀑布拖尾分支，DrawShimmer 单独绘制）
const DEFAULT_OPACITY = [0.5, 0.9, 0.8, 0.75];  // 水 / 岩浆 / 蜂蜜 / 微光——原版 oldDrawWater num17:
                                          // 前景水基 0.5(cs:57029),岩浆 ×1.8、蜂蜜 ×1.6 钳 1(cs:57138-57150);
                                          // 微光 = DrawShimmer val×0.75（LiquidRenderer.cs:700）

// ---- ★IIIII251 斜坡水缘波纹覆盖（用户明示偏差；★IIIII257 转正缺省 true）----
// 【偏差语义】原版坡面/半砖岸格的水线 = 方块贴图斜边 + 静态浸润带，波场不覆盖
// （表层逐格 bob 只走 hasTE 液体格；GL 全屏扭曲的 obj19 门控足迹 = 前景水 alpha,
//   坡面格无前景水 ⇒ gate=0 恒不位移）⇒ 斜坡水缘是全池塘唯一不动的水线。
// 用户要求波纹线沿斜坡水缘连续。双路径交付：
//   CPU 路径（?wwarp=0 / CPU 渲染 / GL 死）= 浸润带逐格 bob（waveBob 入参）；
//   GL 路径（现役默认）= 坡面水形状以 α≈0.02 预画进前景水离屏（footprintCtx
//   入参）→ obj19 门控 aD/aU×100 在 α≥0.01 即饱和 ⇒ 纳入全屏位移场。
// 【转正·IIIII257】缺省 true（251 头注预告的"用户验收后转正"落地；probe-guide
//   B10 同注）。256 批的坡面亮线（实心层 pass 常开段）落位后用户实报"亮线静止"，
//   定谳 = 本 flag 仍灰度（=== '1'）⇒ 缺省 GL 路坡面格足迹缺席 → obj19 gate=0 →
//   亮线不随位移场波动、不进水中扭曲（255 verify-report off 臂坡面全 0.0000 /
//   on 臂 0.10-0.18 实证 flag 是唯一开关面）。转正后位移门与亮线常开段同域；
//   ?slopewave=0 = 逃生门回退灰度期行为（亮线仍在——常开段不归本 flag 管）。
export const slopeWaveEnabled = (() => {
  try {
    if (typeof location === 'undefined') return true;
    return new URLSearchParams(location.search).get('slopewave') !== '0';
  } catch { return true; }
})();

// 我们的 liquidType（1 水 / 2 岩浆 / 3 蜂蜜 / 4 微光）→ 原版 LiquidType（0/1/2/3）
function toVanillaType(t: number): number {
  return t === 2 ? 1 : t === 3 ? 2 : t === 4 ? 3 : 0;
}

// ---- ★liqgl（2026-09-27 微光液体批化+染色 GL 化刀;B3 液体 quad 旧计划语义并入）----
// 【trace 定谳（/tmp/txr-shimmer.digest.json,实机 trace 20260927T101610）】微光湖
// 三笔成本:
//  ① applyShimmerBaseTint self 6.77%（1116.6ms）+fillRect 300.6ms——微光基色
//     每帧 2×2 子块 multiply（Canvas2D 无顶点色的最优近似）;实测定谳探针
//     （scripts/_liqgl-forensic2.mjs）:acc 窗内 bg pass 走 shim tier-3 MULT quad
//     （CPU 侧只剩 JS 数学+Proxy 面约一半）,**前景 pass 在 warpOn 时走 fgCanvas
//     原生 2D**（beginFgPass 返回裸 ctx）= 780 次/帧原生 multiply fillRect。
//  ② texImage2D 风暴 760ms（texRefresh 715.2ms）——fgCanvas 每帧全幅重传:
//     endFgPass 的 drawImage(fgCanvas) 经 shim→markDynamic→texRefresh（uploads
//     ≥1/帧,探针实证）;compose 侧 GLWorldCompose 再 texSubImage2D 全幅一次。
//  ③ drawVanillaLiquids self 9.12%/incl 27.2%——逐 tile 发射:acc 窗内逐 tile
//     quadSprite（bindTexture+drawArrays 各一次/格）,warpOn 前景逐 tile 原生
//     drawImage（SHM 慢路径）。
// 【本刀】?liqgl=1 激活:
//  刀1 列→顶点批:主循环 tile 全部折进单 Float32Array 环（stride 8=x,y,u,v,
//      r,g,b,a）,按纹理段单 drawArrays 发射（GLShimExecutor.pushQuadBatchRgba
//      复用=C5b 雪沙批通道;雨刀 buildRainBatch 判例同构;prep 数组面零改动）。
//  刀2 微光基色染色 GL 化:每微光 tile 一枚【顶点色调制 quad】——四角色 =
//      SetShimmerVertexColors（LiquidRenderer.cs:745-759）双线性张量在裁剪角
//      处的值（双线性场对子矩形封闭=逐位）,GPU 插值=原版逐顶点插值 1:1;
//      applyShimmerBaseTint 在批路径退役（CPU 路径保留=?liqgl=0 逃生门）。
//      【语义备案】批化支=原版 XNA SpriteBatch modulate 单式;现 CPU 式的
//      canvas multiply 在半透明 dst（贴图 AA 边缘/前景 0.75/拖尾）多一项
//      color×(1−αdst) 补正——原版无此项=批化支更贴原版;census 有界登记。
//  刀3 gate 出生在 GPU:warpOn 前景水不再进 fgCanvas——可见水批直入
//      FBO('world')（SO 结合律=(w over ∅) over scene ≡ w over scene,B1 判例）,
//      同一批数据 y 镜像重发射进 FBO('liqgate')=obj19 门控纹理（compose 直采
//      句柄,两次全幅上传全消）。坡面足迹（α≈0.02）同步改四边形收集进 gate。
export let liqgl = typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('liqgl') === '1' : false;
export function liqglSetForTest(v: boolean): void { liqgl = v; }

/** 批发射钩（Renderer 中介→GLShimExecutor.pushQuadBatchRgba;emitPrecipQuadBatch 同构） */
export interface LiqBatchEmit {
  emit(img: CanvasImageSource, key: string, data: Float32Array, quads: number,
    replay: (ctx: CanvasRenderingContext2D) => void): boolean;
}

// ---- 批环（单槽跨帧复用;雨刀 rainBatchData 判例）----
const LIQ_STRIDE = 8;                        // x,y,u,v,r,g,b,a
const LIQ_QUAD_FLOATS = 6 * LIQ_STRIDE;      // 48
const LIQ_RING_CAP = 16384;                  // quad/帧帽（超出=余帧回 CPU 路径,登记有界）
const LIQ_TIE_EPS = 1 / 4096;                // quadSprite 同款 texel tie 补正（QUAD_TIE_EPS 判例）
const _batRing = new Float32Array(LIQ_RING_CAP * LIQ_QUAD_FLOATS);
/** 每 quad 重放面:sx,sy,sw,shSrc（dst 几何在顶点环内;重放 drawImage 取源矩形） */
const _batMeta = new Float32Array(LIQ_RING_CAP * 4);
let _batN = 0;                               // 本帧已入环 quad 总数
let _batFrame = -1;                          // 环复位帧号（frameToken=animTick）
let _batOverflow = false;                    // 帽触发位（触发后本帧余量恒 CPU 路径）
/** gate y 镜像重发射数据槽（消费即弃,单槽同帧消费——雨刀同判例） */
const _gateData = new Float32Array(LIQ_RING_CAP * LIQ_QUAD_FLOATS);
/** 微光四角色单槽（shimmerCornerColors 写入,batQuad 读——消费即弃零驻留） */
const _batCols = new Float32Array(12);

/** 批段（一次发射=同纹理连续 quad 区间;可见批与 gate 重发射共用） */
interface LiqRun { img: CanvasImageSource; key: string; start: number; quads: number; }
/** 前景 pass 批段登记（emitVanillaLiquidGate 消费;帧界由 gateCapture 调用重置） */
let _fgRuns: LiqRun[] = [];
/** 坡面足迹四边形（世界坐标;gate 发射时经 wldT 折算设备——fgCanvas 足迹画布退役面） */
interface FootQuad {
  tex: ImageBitmap | HTMLImageElement | null; solid: boolean;
  sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; dw: number; dh: number;
}
let _footQuads: FootQuad[] = [];
let _footFrame = -1;
/** 足迹世界→设备折算矩阵（bg pass 恢复世界变换后捕获;轴对齐=世界变换构造面保证） */
const _footWld = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** 微光 tile 顶点色四角（SetShimmerVertexColors :745-759 双线性张量在裁剪角的值）。
 *  c00..c11=tile 四角整数坐标基色（4×shimmerWave）;裁剪角 (u,v) 处 = 张量双线性——
 *  双线性场对子矩形封闭 ⇒ GPU 对裁剪 quad 的顶点插值=原版整格插值场的受限重_param,
 *  逐位等价（正交投影下仿射=GPU 透视校正退化）。out 写调用方槽（零分配）。 */
function shimmerCornerColors(
  x: number, y: number, tVis: number,
  uL: number, uR: number, vT: number, vB: number,
  out: Float32Array, o: number,
): void {
  const c00 = shimmerBaseColorF(x, y, tVis), c10 = shimmerBaseColorF(x + 1, y, tVis);
  const c01 = shimmerBaseColorF(x, y + 1, tVis), c11 = shimmerBaseColorF(x + 1, y + 1, tVis);
  const bil = (u: number, v: number, k: number): number =>
    c00[k] * (1 - u) * (1 - v) + c10[k] * u * (1 - v) + c01[k] * (1 - u) * v + c11[k] * u * v;
  // 角序 = 顶点序 v0 TL / v1 TR / v2 BR / v3 BL（入环序一致）
  const corners: readonly (readonly [number, number])[] = [[uL, vT], [uR, vT], [uR, vB], [uL, vB]];
  for (let ci = 0; ci < 4; ci++) {
    const [u, v] = corners[ci];
    out[o + ci * 3] = bil(u, v, 0) / 255;
    out[o + ci * 3 + 1] = bil(u, v, 1) / 255;
    out[o + ci * 3 + 2] = bil(u, v, 2) / 255;
  }
}

/** 2D tile quad 入批环（设备空间;uv=全跨度−ε tie 补正,quadSprite 同式）。
 *  r=g=b=1 → 恒等调制;微光 tile 传四角逐通道色。 */
function batQuad(
  sx: number, sy: number, sw: number, shSrc: number, texW: number, texH: number,
  dx0: number, dy0: number, dw: number, dh: number, a: number,
  cols: Float32Array | null, colOff: number,
): boolean {
  if (_batN >= LIQ_RING_CAP) { _batOverflow = true; return false; }
  const o = _batN * LIQ_QUAD_FLOATS;
  const ua = (sx - LIQ_TIE_EPS) / texW, ub = (sx + sw - LIQ_TIE_EPS) / texW;
  const va = (sy - LIQ_TIE_EPS) / texH, vb = (sy + shSrc - LIQ_TIE_EPS) / texH;
  const D = _batRing;
  const r0 = cols ? cols[colOff] : 1, g0 = cols ? cols[colOff + 1] : 1, b0 = cols ? cols[colOff + 2] : 1;
  const r1 = cols ? cols[colOff + 3] : 1, g1 = cols ? cols[colOff + 4] : 1, b1 = cols ? cols[colOff + 5] : 1;
  const r2 = cols ? cols[colOff + 6] : 1, g2 = cols ? cols[colOff + 7] : 1, b2 = cols ? cols[colOff + 8] : 1;
  const r3 = cols ? cols[colOff + 9] : 1, g3 = cols ? cols[colOff + 10] : 1, b3 = cols ? cols[colOff + 11] : 1;
  const x1 = dx0 + dw, y1 = dy0 + dh;
  // TRIANGLES 两三角 (p0,p1,p2)+(p0,p2,p3)（buildRainBatch 同式）
  D[o] = dx0; D[o + 1] = dy0; D[o + 2] = ua; D[o + 3] = va; D[o + 4] = r0; D[o + 5] = g0; D[o + 6] = b0; D[o + 7] = a;
  D[o + 8] = x1; D[o + 9] = dy0; D[o + 10] = ub; D[o + 11] = va; D[o + 12] = r1; D[o + 13] = g1; D[o + 14] = b1; D[o + 15] = a;
  D[o + 16] = x1; D[o + 17] = y1; D[o + 18] = ub; D[o + 19] = vb; D[o + 20] = r2; D[o + 21] = g2; D[o + 22] = b2; D[o + 23] = a;
  D[o + 24] = dx0; D[o + 25] = dy0; D[o + 26] = ua; D[o + 27] = va; D[o + 28] = r0; D[o + 29] = g0; D[o + 30] = b0; D[o + 31] = a;
  D[o + 32] = x1; D[o + 33] = y1; D[o + 34] = ub; D[o + 35] = vb; D[o + 36] = r2; D[o + 37] = g2; D[o + 38] = b2; D[o + 39] = a;
  D[o + 40] = dx0; D[o + 41] = y1; D[o + 42] = ua; D[o + 43] = vb; D[o + 44] = r3; D[o + 45] = g3; D[o + 46] = b3; D[o + 47] = a;
  const m = _batN * 4;
  _batMeta[m] = sx; _batMeta[m + 1] = sy; _batMeta[m + 2] = sw; _batMeta[m + 3] = shSrc;
  _batN++;
  return true;
}

/** 批段 2D 降级重放（GLShimExecutor.replay2D 经 rec.batch.replay 调用;宁回退不丢精灵）。
 *  恒等 tile:drawImage 原参;微光 tile:drawImage+2×2 子块 multiply（顶点环内四角色
 *  重构双线性——降级帧已是灾难路径,census 有界登记:子块中心相对 quad 而非 tile）。 */
function replayLiqRun2D(ctx: CanvasRenderingContext2D, startQuad: number, quads: number,
  tex: CanvasImageSource): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  const D = _batRing;
  for (let q = 0; q < quads; q++) {
    const o = (startQuad + q) * LIQ_QUAD_FLOATS;
    const m = (startQuad + q) * 4;
    const dw = D[o + 8] - D[o], dh = D[o + 41] - D[o + 1];
    if (dw <= 0 || dh <= 0) continue;
    ctx.globalAlpha = D[o + 7];
    ctx.drawImage(tex, _batMeta[m], _batMeta[m + 1], _batMeta[m + 2], _batMeta[m + 3],
      D[o], D[o + 1], dw, dh);
    const r0 = D[o + 4], g0 = D[o + 5], b0 = D[o + 6];
    const r1 = D[o + 12], g1 = D[o + 13], b1 = D[o + 14];
    const r2 = D[o + 20], g2 = D[o + 21], b2 = D[o + 22];
    const r3 = D[o + 44], g3 = D[o + 45], b3 = D[o + 46];
    if (r0 !== 1 || g0 !== 1 || b0 !== 1 || r1 !== 1 || g1 !== 1 || b1 !== 1
      || r2 !== 1 || g2 !== 1 || b2 !== 1 || r3 !== 1 || g3 !== 1 || b3 !== 1) {
      // 微光调制 quad:2×2 子块 multiply（顶点色域即裁剪角域,u/v 取子块中心）
      const subW = Math.ceil(dw / 2), subH = Math.ceil(dh / 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'multiply';
      for (let by = 0; by < 2; by++) {
        for (let bx = 0; bx < 2; bx++) {
          const bw = Math.min(subW, dw - bx * subW), bh = Math.min(subH, dh - by * subH);
          if (bw <= 0 || bh <= 0) continue;
          const u = (bx * subW + bw / 2) / dw, v = (by * subH + bh / 2) / dh;
          const ch = (k: number): number => {
            const c0 = k === 0 ? r0 : k === 1 ? g0 : b0;
            const c1 = k === 0 ? r1 : k === 1 ? g1 : b1;
            const c2 = k === 0 ? r2 : k === 1 ? g2 : b2;
            const c3 = k === 0 ? r3 : k === 1 ? g3 : b3;
            return 255 * (c0 * (1 - u) * (1 - v) + c1 * u * (1 - v) + c2 * (1 - u) * v + c3 * u * v);
          };
          ctx.fillStyle = `rgb(${Math.round(ch(0))},${Math.round(ch(1))},${Math.round(ch(2))})`;
          ctx.fillRect(D[o] + bx * subW, D[o + 1] + by * subH, bw, bh);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.restore();
}

/** ★liqgl gate 发射（Renderer.drawLiquids 前景支收口调用）：同一批数据 y 镜像
 *  重发射进 FBO('liqgate')（= obj19 门控纹理;canvas 采样朝向 v=0=顶 ↔ FBO 行 0=
 *  GL 底 ⇒ 设备 y'=H−y 几何镜像、uv 不动=门控图与 canvas 上传同朝向）。
 *  前置:坡面足迹四边形先画（=fgCanvas 足迹 α≈0.02 同语义）。
 *  返回句柄（WorldTexSrc 形,flipY=0=预翻转几何）=null=发射失败（调用方本帧
 *  gate=null→obj19 gate=0 恒等直通,安全）。
 *  【绑定卫生】begin('liqgate') 换绑管线当前 FBO,离场 begin('world', false)
 *  续交回世界层（同名幂等重租,clear=false 不清量——flushAcc isAccumOpen('world')
 *  判据不受扰）。 */
export function emitVanillaLiquidGate(
  glw: GLSpriteLayer, W: number, H: number,
): { tex: WebGLTexture; w: number; h: number; flipY: number } | null {
  if (glw.unavailable || W <= 0 || H <= 0) return null;
  if (!glw.isAccumOpen('world')) return null;   // 防 stale FBO 续交（flushAcc begin(clear) 判据同门）
  glw.begin('liqgate', true);
  if (glw.unavailable) return null;
  let ok = true;
  // 足迹（世界→设备折算;先于水=fgCanvas 足迹先画同序）
  if (_footQuads.length) {
    const { a, b, c, d, e, f } = _footWld;
    for (const q of _footQuads) {
      const ex0 = a * q.dx + c * q.dy + e, ey0 = b * q.dx + d * q.dy + f;
      const ex1 = a * (q.dx + q.dw) + c * (q.dy + q.dh) + e, ey1 = b * (q.dx + q.dw) + d * (q.dy + q.dh) + f;
      const dx = Math.min(ex0, ex1), dy = Math.min(ey0, ey1);
      const dw = Math.abs(ex1 - ex0), dh = Math.abs(ey1 - ey0);
      if (dw <= 0 || dh <= 0) continue;
      // y 镜像:rect [dy,dy+dh] → [H−dy−dh, H−dy]
      const gy = H - dy - dh;
      if (q.solid) {
        glw.quadSprite(whiteEntry(glw), 0, 0, 1, 1, dx, gy, dw, dh,
          { alpha: 0.02, tint: [0.5, 0.5, 0.5] });
      } else if (q.tex) {
        const te = glw.texFromRegion(`er:${texId(q.tex)}:${q.sx},${q.sy},${q.sw},${q.sh}`,
          q.tex, q.sx, q.sy, q.sw, q.sh);
        if (te) glw.quadSprite(te, 0, 0, q.sw, q.sh, dx, gy, dw, dh, { alpha: 0.02 });
      }
    }
  }
  // 水批段:y 镜像重发射（同 uv/tint/α——gate 只读 α,obj19 ×100 饱和）
  for (const run of _fgRuns) {
    const nF = run.quads * LIQ_QUAD_FLOATS;
    const src = run.start * LIQ_QUAD_FLOATS;
    const G = _gateData;
    for (let i = 0; i < nF; i += LIQ_STRIDE) {
      G[src + i] = _batRing[src + i];
      G[src + i + 1] = H - _batRing[src + i + 1];   // y 镜像（逐顶点）
      for (let k = 2; k < LIQ_STRIDE; k++) G[src + i + k] = _batRing[src + i + k];
    }
    const e = glw.texFromImage(run.key, run.img as TexImageSource, false, true);
    if (!e || !glw.quadBatchRgba(e, G.subarray(src, src + nF), run.quads)) { ok = false; break; }
  }
  glw.liqGateParams();
  const tex = glw.pipeFboTex();       // 'liqgate' 绑定期捕获
  glw.begin('world', false);          // 续交回世界层（不清量）
  if (!ok || !tex) return null;
  return { tex, w: W, h: H, flipY: 0 };
}

/** white 1×1 entry（GLShimExecutor.WHITE_E 同式;模块缓存防重复建面） */
const _whiteCache = new WeakMap<GLSpriteLayer, TexEntry>();
function whiteEntry(glw: GLSpriteLayer): TexEntry {
  const hit = _whiteCache.get(glw);
  if (hit && glw.texAlive(hit)) return hit;
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 1, 1);
  const e = glw.texFromImage('__liqwhite', c, false, true)!;
  _whiteCache.set(glw, e);
  return e;
}

/** 帧界批状态复位（Renderer 世界段前调用;frameToken 变化亦自愈复位） */
export function resetLiquidBatchForFrame(frame: number): void {
  if (_batFrame !== frame) {
    _batFrame = frame; _batN = 0; _batOverflow = false; _fgRuns = [];
  }
  if (_footFrame !== frame) {
    _footFrame = frame; _footQuads = [];
  }
}

/** 微光 sparkle 顶点色诊断面（测试/探针直读四角双线性色;纯函数） */
export function shimmerCornerColorsForTest(
  x: number, y: number, tVis: number,
  uL: number, uR: number, vT: number, vB: number,
): [number, number, number][] {
  const out = new Float32Array(12);
  shimmerCornerColors(x, y, tVis, uL, uR, vT, vB, out, 0);
  const r: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) r.push([out[i * 3], out[i * 3 + 1], out[i * 3 + 2]]);
  return r;
}

/** LiquidCache.IsSolid（LiquidRenderer.cs:198 → WorldGen.SolidOrSlopedTile :70515-70537）
 *  纯谓词，P1 两处扫描（needsPrep 首扫/复用失效重扫）共用的单源：
 *  active(flags≠0) ∧ !inActive(致动位清零,WorldGen.cs:70534 IL_004c `return !tile.inActive()`)
 *  ∧ tileSolid（defs 层 d.solid 已折 tileSolid∧!tileSolidTop——平台/家具 defs solid:false；
 *  slope 不在原文谓词内,函数名系历史遗留）。
 *  ★W-A4（2026-09-03）：补致动门——致动格原版不算实心,液体贴其表面按空格成形,
 *  曾漏门 = 致动墙仍压住邻格液面/拖尾形态。 */
export function liquidCacheIsSolid(flags: number, wire: number, solid: boolean | undefined): boolean {
  return flags !== 0 && (wire & TileStore.WIRE_ACTUATED) === 0 && solid === true;
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
  return ((Math.trunc(num) % 16) + 16) % 16;   // ★FX61：(int)num = 向零截断（C# 强转），floor 在负相位差 1 帧
}

/** sparkle 源矩形（DrawShimmer :716-721）：先把 sourceRectangle 重置回【原始
 *  SourceRectangle】再加 X+48 / Y+80×fr。注意第二参数是原始 sy——表面格基底层
 * 虽强制切 Y=1280（:700），sparkle 仍按原始 Y 取带（表层漂移彩虹条的来源）。
 *  旧实现误传 1280：fr≥1 全部越界被跳过（彩虹条消失），fr=0 命中 Y=1280 黑底块画出黑斑。 */
export function shimmerSparkleSource(sx: number, sy: number, fr: number): [number, number] {
  return [sx + 48, sy + 80 * fr];
}

/** sparkle 绘制门（DrawShimmer :717 `flag`）纯函数：原始 SourceRectangle 非满格
 *  内部态 (X==16 ∧ Y%80==48)。★De Morgan 直译 = `X!==16 || Y%80!==48`——曾误写
 *  `!(X===16 || Y%80===48)`（逻辑等价于 ∧），把表层格 (sx=16, sy=0) 判成 body：
 *  sparkle 退化为棋盘格 × 噪声微闪（GetShimmerGlitterOpacity body 支常在 0.02
 *  阈下）= 用户实报"微光液面顶缘彩虹渐变线整缺"的根因（FX61，2026-09-17）。
 *  top=true（表层/边缘格）四角 glitter 恒 0.5（:775-778）→ 常驻彩虹条。 */
export function shimmerSparkleGate(sx: number, sy: number): boolean {
  return sx !== 16 || sy % 80 !== 48;
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

/** GetShimmerGlitterColor :768 彩虹相位（纯函数）：(((x + y/6) + tVis/30) / 6) % 1。
 *  空间项 x/6 → 相邻液面格相位差 1/6（≈60° 色相）= 液面顶缘逐格彩虹渐变；
 *  时间项 → dHue/d帧 = 1/180 → 180 帧（60fps 下 3s）一个整周期漂移。 */
export function shimmerGlitterHue(x: number, y: number, tVis: number): number {
  return (((x + y / 6) + tVis / 30) / 6) % 1;
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
/** 键含 texId（2026-08-25 同类扫描）：曾只按 hueIdx——模块级缓存跨世界持久,
 *  不同 waterStyle 的 shimmer 表换world后旧条带钉死（texId.ts 头注键碰撞同款） */
const _sparkleTintCache = new Map<string, HTMLCanvasElement>();

/** sparkle 变体逐像素重造：灰度亮度 → alpha（黑底归零），RGB → HSL 彩虹色。 */
export function tintSparkleBand(data: Uint8ClampedArray, r: number, g: number, b: number): void {
  for (let i = 0; i < data.length; i += 4) {
    // 灰度带（三通道相等）→ 亮度即灰度值；保留亚像素抗锯齿渐变（闪纹边缘软过渡）
    const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
    data[i + 3] = lum;
  }
}

function shimmerSparkleTint(tex: ImageBitmap | HTMLImageElement, hueIdx: number): HTMLCanvasElement | null {
  // ★texReady 半加载窗守卫（2026-08-25 同类扫描）：atlas 源本安全,守卫为纵深——
  //  该窗 getImageData 全 0 → 全透明条带按 hue 键钉死（微光彩虹整条消失）
  if (!texReady(tex)) return null;
  const ck = `${texId(tex)}|${hueIdx}`;
  let c = _sparkleTintCache.get(ck);
  if (c) return c;
  const bandX = 48;                     // :721 sparkle 带 X 偏移（water_14 第 4-6 列 16px 带）
  const bandW = tex.width - bandX;
  if (bandW <= 0 || typeof document === 'undefined') return null;
  c = document.createElement('canvas');
  c.width = bandW; c.height = tex.height;
  const cc = c.getContext('2d', { willReadFrequently: true });
  if (!cc) return null;
  cc.imageSmoothingEnabled = false;
  cc.drawImage(tex, bandX, 0, bandW, tex.height, 0, 0, bandW, tex.height);
  const [r, g, b] = hslToRgb(hueIdx / SPARKLE_HUE_STEPS, 1, 0.5);
  const img = cc.getImageData(0, 0, bandW, tex.height);
  tintSparkleBand(img.data, Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  cc.putImageData(img, 0, 0);
  _sparkleTintCache.set(ck, c);
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
  /** 果冻后处理管线态（WaterWarpCompositor 每帧写入） */
  warp: WaterWarpDebugState;
}
export interface WaterWarpDebugState {
  /** 管线本帧是否激活（quality>0 + 噪声就绪） */
  active: boolean;
  /** 最近一次合成路径：'gl' | '2d' | 'off' */
  path: string;
  /** 累计合成次数（双 pass 各 +1 → 激活时每帧 +2） */
  passes: number;
}
const _liqDebug: LiquidDebugState = {
  calls: 0, lastMs: 0, waterStyle: 0, waterSheet: '', isBackground: false,
  animFrame: 0, waterfallFrame: 0, windSpeed: 0, window: [0, 0, 0, 0],
  sheetsReady: [], atlasReady: false,
  warp: { active: false, path: 'off', passes: 0 },
};

// ---- ★BJ317 液体绘制窗（2026-09-23 用户实报"水贴屏幕边缘被渲染成瀑布下流样式,
// 内移即恢复"定谳落刀）----
// 【机制】LiquidRenderer 管线 P2 可见液位只跑内窗（vanilla LiquidRenderer.cs
//  `for (k = 2; k < rectangle.Width - 2; ...)` 内窗遍历），±2 pad 列的
//  HasVisibleLiquid 恒假（P1 每帧重置 VisibleLiquidLevel=0、P2/trail 不写 pad）→
//  内窗边缘水格的窗外邻格被当"无可见液体"→ P4 误置 HasLeft/Right/TopEdge=true →
//  误用边缘变体带（sx=0/32 侧柱纹理 + oy 16/32；表面格还丢 srcY=1280 静态带）。
//  ★该管线级误判【原版同样存在】（pad 列收敛为假是原版语义,本仓 P1-P7 逐行同构）——
//  原版靠绘制窗比可见屏大一圈把它掩蔽：GetScreenDrawArea（TileDrawing.cs:6661）
//  firstTileX = 屏左 -1 - offScreenRange/16（offScreenRange=200=12.5 格,Main.cs:840）、
//  lastTileX = 屏右 +2 +12.5、屏下 +5 +12.5 → 伪影格深居屏外 13 格,玩家永不可见。
// 【修】本仓窗口原=可见屏（底缘已有 +5）,伪影恰好落屏缘 → 左/右/上各外扩 MARGIN
//  格,使误判列/行出屏。MARGIN=4 ≥ 内窗 pad(2)+包围盒 M(3) 需求（液池恰起于屏缘时
//  bx0=liquid±3 仍盖住屏缘格 ±1 邻域）,且伪影格 ≥1 格出屏。管线本体零触碰。
export const LIQUID_WINDOW_MARGIN = 4;

/** 液体绘制窗（Renderer.drawLiquids 双 pass 共用；纯函数供单测）。
 *  返回 [tx0, ty0, tx1, ty1]——比可见屏左/右/上各外扩 LIQUID_WINDOW_MARGIN 格、
 *  下缘沿用原版 +5（Main.cs:42900-42908 屏下边距,P3 底带不建区出屏）。 */
export function liquidDrawWindow(
  camX: number, camY: number, viewW: number, viewH: number, z: number,
  worldW: number, worldH: number,
): [number, number, number, number] {
  const ts = 16;
  return [
    Math.max(2, Math.floor((camX - viewW / 2 / z) / ts) - LIQUID_WINDOW_MARGIN),
    Math.max(2, Math.floor((camY - viewH / 2 / z) / ts) - LIQUID_WINDOW_MARGIN),
    Math.min(worldW - 3, Math.ceil((camX + viewW / 2 / z) / ts) + LIQUID_WINDOW_MARGIN),
    Math.min(worldH - 3, Math.ceil((camY + viewH / 2 / z) / ts) + 5),
  ];
}

/** WaterWarpCompositor 写入管线态（DebugReport/探针消费） */
export function setWaterWarpDebug(path: 'gl' | '2d'): void {
  _liqDebug.warp.active = true;
  _liqDebug.warp.path = path;
  _liqDebug.warp.passes++;
}

/** 管线关闭帧由 Renderer 复位（?wwarp=0 / quality=0 / 噪声未就绪） */
export function clearWaterWarpDebug(): void {
  _liqDebug.warp.active = false;
  _liqDebug.warp.path = 'off';
}

/** 液体渲染调试快照（只读消费；DebugReport render.subsystems.liquids） */
export function liquidDebugState(): LiquidDebugState {
  return _liqDebug;
}

/** LiquidSlope 贴图独立懒加载（不走 atlas.ensureVImage——LiquidSlope 不在
 *  预载/重烘列表,首次调用返回 null 且不触发网络加载 = 永远 null。
 *  模块级缓存跨帧持久——函数内声明会每帧重建 Map = Image 永远 width=0） */
const _slopeTexCache = new Map<number, HTMLImageElement>();
const _slopeTexFailAt = new Map<number, number>();
const SLOPE_FAIL_TTL = 10_000;   // 失败负缓存 TTL(2026-08-25 同类扫描):过期重试自愈
const getSlopeTex = (waterStyle: number): HTMLImageElement | null => {
  const ws = Math.max(0, Math.min(14, waterStyle));
  const fail = _slopeTexFailAt.get(ws);
  if (fail !== undefined) {
    if (Date.now() - fail < SLOPE_FAIL_TTL) return null;
    _slopeTexFailAt.delete(ws);
  }
  let im = _slopeTexCache.get(ws);
  if (im === undefined) {
    im = new Image();
    im.onerror = () => { _slopeTexCache.delete(ws); _slopeTexFailAt.set(ws, Date.now()); };
    im.src = `sprites/vanilla/LiquidSlope_${ws}.png`;
    _slopeTexCache.set(ws, im);
  }
  return im.width > 0 ? im : null;
};

/** 同帧准备缓存(#perf-gpulog 水体批):P1-P7 管线每帧被 bg/fg 两次调用,
 *  输入(窗口/store/waterStyle)在单帧渲染段内不变 → 第二次调用直接复用数组。
 *  frameToken 由调用方传渲染帧号(animTick),跨帧自动失效重算 */
let _prepToken: number | undefined;
let _prepKey = '';
/** 液体包围盒(内区格坐标,P1 扫描产出):P2-P7 只需遍历液面±邻域——
 *  典型视野液体占小半格网,包围盒裁剪省 ~6/7 的 pass 扫描。边界外 cell 的
 *  P2 邻域填充(夹心格)按定义必在包围盒内,裁剪无损 */
let _boxL = 0, _boxT = 0, _boxR = -1, _boxB = -1;
let _boxHas = false;

// ---- 液体动画相位（★2026-09-27 重钉逻辑 tick,火苗速率案普查株连）----
// 原版钟 = LiquidRenderer.Update（LiquidRenderer.cs:840-858,Main.cs:17226 每
// Update tick 调用,dt = 定步 1/60）：_frameState += (windSpeed·25±6)·dt、
// _waterfallFrameState += 0.5·dt、<0 回正、%16。旧实现 Math.floor((nowMs/1000)·rate)
// = 墙钟（速率对,但风速变化时相位跳变、暂停期照走、宕帧后跳帧）。改逐 tick 累计：
// draw 路径按 tick 变更惰性推进（背景/前景双 pass 同 tick 调用幂等=每 tick 恰推
// 一次;暂停 tick 冻结=原版 DoUpdate 同门;freezeClock 探针期冻结=对拍确定性）。
// 跨拍补步钳 8（宕帧追步,同 fixedUpdate ≤5 步同族口径）。
let _liqWaveTick = -1;
let _liqFrameState = 0;        // LiquidRenderer._frameState（0..16 浮点相位）
let _liqWaterfallState = 0;    // LiquidRenderer._waterfallFrameState

/** 测试钉钟：重置液体相位累计（金标测试重放确定性;生产路径禁调） */
export function __resetLiquidAnimForTest(): void {
  _liqWaveTick = -1; _liqFrameState = 0; _liqWaterfallState = 0;
}

export function drawVanillaLiquids(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null,
  st: TileStore, groundLevel: number,
  tx0: number, ty0: number, tx1: number, ty1: number,
  nowMs: number, isBackground = false, windSpeed = 0, waterStyle = 0,
  hasWaterfallAt?: (x: number, y: number) => boolean,
  /** 全屏扭曲管线激活（WaterWarpCompositor.active）：表层格逐格 bob 关闭——
   *  bob 语义由 compositeLight 后的全屏位移场交付（原版 waterTarget 本体无 bob，
   *  波动全部来自 FilterWaterDistortion 的屏幕位移）。水体/浸润带均直画目标层。 */
  warpMode = false,
  /** 场景亮度采样（tile 光照 RGB 均值/255；Renderer 注入 lighting.lightAt）——
   *  波光 glint 的亮度因子（obj19 :106-111 用位移后场景像素亮度，暗处→0） */
  lumAt?: (tx: number, ty: number) => number,
  /** 渲染帧号(同帧 bg/fg 两调用传同值 → P1-P7 第二次调用走缓存复用) */
  frameToken?: number,
  /** ★IIIII251 斜坡水缘 GL 门控足迹画布（仅 bg 调用传入；Renderer 在 warpOn &&
   *  ?slopewave=1 时给 waterWarp.gateFootprintCtx()——浸润 pass 把坡面水形状
   *  以 α≈0.02 预画进去,obj19 门控由此覆盖斜坡水缘。null=不画） */
  gateFootprintCtx?: CanvasRenderingContext2D | null,
  /** ★liqgl 批发射钩（列→顶点批;null=CPU 原链。Renderer 在 liqgl+acc 窗传入——
   *  pass 级 all-or-nothing:可用性预检失败整 pass 走 CPU 原链,中途不换道） */
  bat?: LiqBatchEmit | null,
  /** ★liqgl gate 采集（warpOn 且批化时 bg/fg 都传 true:bg=足迹四边形收集替代
   *  fgCanvas 足迹画布;fg=水批段登记供 emitVanillaLiquidGate 重发射） */
  gateCapture?: boolean,
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
  const prepKey = `${tx0},${ty0},${tx1},${ty1},${waterStyle}`;
  // ★同帧复用(#perf-gpulog 水体批):bg(:2755)/fg(:3139)两次调用输入相同,
  // 第二次跳过 P1-P7(数组持本帧早先结果)【直接进绘制段】——绝不可 return 整函数:
  // fg 返回 = fgCanvas 空白 = 全屏 GL 扭曲/波光失去门控纹理(用户实报"GL效果没了")
  const needsPrep = frameToken === undefined || _prepToken !== frameToken || _prepKey !== prepKey;
  if (needsPrep) {
  _prepToken = frameToken; _prepKey = prepKey;
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
  }   // needsPrep(fills)结束
  // 别名(守卫外亦消费:绘制段每次调用都跑)——声明零成本
  const level = _level, visLevel = _visLevel, opacity = _opacity;
  const isSolidA = _isSolidA, hasLiquidA = _hasLiquidA, hasWallA = _hasWallA;
  const hasVisA = _hasVisA, typeA = _typeA, visTypeA = _visTypeA;
  const lW = _lW, rW = _rW, bW = _bW, tW = _tW;
  const vlW = _vlW, vrW = _vrW, vbW = _vbW, vtW = _vtW;
  const hasLE = _hasLE, hasRE = _hasRE, hasTE = _hasTE, hasBE = _hasBE;
  const isHalfA = _isHalfA;
  const fx = _fx, fy = _fy;
  const at = (lx: number, ly: number) => lx * ph + ly; // padding 内坐标
  let bx0 = _boxL, bx1 = _boxR, by0 = _boxT, by1 = _boxB;   // 复用帧沿用本帧早前盒值

  // ---- P1：原始缓存(同帧复用:仅 needsPrep 时执行) ----
  if (needsPrep) {
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
      // ★幽灵保域（2026-09-03）：实心判定首门 = 原版 LiquidCache.IsSolid =
      // WorldGen.SolidOrSlopedTile（LiquidRenderer.cs:198）的 tile.active() 门——
      // 幽灵格（flags=0,type≠0,x86 对齐残型）不算实心,否则其"化石层"会压住
      // 邻格液面形态。halfBrick 支无 active 门（vanilla :197 裸读）保持原样
      // ★W-A4（2026-09-03）：谓词单源化至 liquidCacheIsSolid（补 !inActive 致动门,
      //  WorldGen.cs:70534 IL_004c `return !tile.inActive()`）
      isSolidA[i] = liquidCacheIsSolid(st.flags[si], st.wire[si],
        TILE_DEFS[st.type[si]]?.solid) ? 1 : 0;
    }
  }
  }   // P1 结束
  // ★BJ77(#swperf 2026-09-14)：下方是同帧复用失效路径(fg pass / needsPrep=false)
  //  的【状态复位重扫】——它把 bg 调用 P2/P3 已改写的 typeA/visTypeA 重置回 store
  //  值、再由本调用 Unguarded P3 重铺,fg 绘制语义(夹心格/瀑布类型)依赖此复位,
  //  必须保留。而 bg 调用(needsPrep=true)时它与上方守卫块【相邻】且为纯 store
  //  重读(两次写入值恒等)= 幂等白扫 → swPerf 下仅 bg 跳过(输出逐位不变;
  //  关=原行为恒跑,双支结构见 perfFlags.ts 契约)。
  if (!swPerf || !needsPrep) {
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
      // ★幽灵保域（2026-09-03）：实心判定首门 = 原版 LiquidCache.IsSolid =
      // WorldGen.SolidOrSlopedTile（LiquidRenderer.cs:198）的 tile.active() 门——
      // 幽灵格（flags=0,type≠0,x86 对齐残型）不算实心,否则其"化石层"会压住
      // 邻格液面形态。halfBrick 支无 active 门（vanilla :197 裸读）保持原样
      // ★W-A4（2026-09-03）：同 P1 首扫,谓词单源 liquidCacheIsSolid（本段是
      //  同帧复用失效时的全量重扫副本）
      isSolidA[i] = liquidCacheIsSolid(st.flags[si], st.wire[si],
        TILE_DEFS[st.type[si]]?.solid) ? 1 : 0;
    }
  }
  }   // ★BJ77 P1 复位扫守卫结束
  // 液体包围盒(P1 扫描产出,内区坐标):P2-P7 裁剪用。+1 余量覆盖夹心格邻域
  if (needsPrep) {
  let bL = pw, bT = ph, bR = -1, bB = -1, hasAny = false;
  {
    const M = PAD + 1;
    for (let lx = PAD; lx < pw - PAD; lx++) {
      for (let ly = PAD; ly < ph - PAD; ly++) {
        if (!hasLiquidA[at(lx, ly)]) continue;
        hasAny = true;
        if (lx - M < bL) bL = lx - M;
        if (ly - M < bT) bT = ly - M;
        if (lx + M > bR) bR = lx + M;
        if (ly + M > bB) bB = ly + M;
      }
    }
    // P3 瀑布拖尾最多向下 WATERFALL_LENGTH[?] ≤ 10 行,底部再 +11 覆盖
    if (hasAny) bB = Math.min(ph - PAD - 1, bB + 11);
    _boxL = Math.max(PAD, bL); _boxT = Math.max(PAD, bT);
    _boxR = Math.min(pw - PAD - 1, bR); _boxB = Math.min(ph - PAD - 1, bB);
    _boxHas = hasAny;
    bx0 = _boxL; bx1 = _boxR; by0 = _boxT; by1 = _boxB;
  }
  }   // needsPrep(bbox)结束
  // 半砖缓存（LiquidRenderer.cs:103-110）：halfBrick && 上格有液体 && 非平台；
  // 无液体时类型继承上格（109-110）。注意 ptr[-1] = y-1 = 上格
  // 低清/包围盒裁剪(#perf-gpulog):需要 hasLiquidA[上] → 上格必在液面包围盒±1
  if (needsPrep) for (let lx = bx0; lx <= bx1; lx++) {
    for (let ly = Math.max(1, by0); ly <= by1; ly++) {
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

  // ---- P2：可见液位(液体包围盒裁剪 #perf-gpulog:夹心格按定义在盒内,无损) ----
  if (needsPrep) for (let lx = bx0; lx <= bx1; lx++) {
    for (let ly = by0; ly <= by1; ly++) {
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

  // ---- P3：瀑布拖尾（向下传播） + 实心格处理(包围盒裁剪;拖尾 ≤10 行已计入盒底 +11) ----
  for (let lx = bx0; lx <= bx1; lx++) {
    for (let ly = by0; ly <= Math.min(by1, ph - 11); ly++) {
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

  // ---- P4：四壁插值 + 边存在 + 变体 FrameOffset(包围盒裁剪:P4 只读 ±1 邻居,盒含) ----
  if (needsPrep) for (let lx = bx0; lx <= bx1; lx++) {
    for (let ly = by0; ly <= by1; ly++) {
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

  // ---- P5：壁值平滑(包围盒裁剪) ----
  if (needsPrep) for (let lx = bx0; lx <= bx1; lx++) {
    for (let ly = by0; ly <= by1; ly++) {
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

  // ---- P6：瀑布侧/邻接修正(包围盒裁剪) ----
  if (needsPrep) for (let lx = bx0; lx <= bx1; lx++) {
    for (let ly = by0; ly <= by1; ly++) {
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

  // ---- P7：内角填充(包围盒裁剪) ----
  if (needsPrep) for (let lx = bx0; lx <= bx1; lx++) {
    for (let ly = by0; ly <= by1; ly++) {
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
  const texCache = new Map<number, ImageBitmap | HTMLImageElement | null>();
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
  // ★2026-09-27 逐 tick 累计（LiquidRenderer.cs:846-848 dt=1/60 定步 1:1）——
  //  旧 Math.floor((nowMs/1000)·rate) 墙钟退役（见 _liqWaveTick 块注释）
  const tickNow = gameTickCount();
  if (tickNow !== _liqWaveTick) {
    const d = Math.min(Math.max(tickNow - _liqWaveTick, 1), 8);
    _liqWaveTick = tickNow;
    _liqFrameState = (((_liqFrameState + (rate / 60) * d) % 16) + 16) % 16;
    _liqWaterfallState = (((_liqWaterfallState + (0.5 / 60) * d) % 16) + 16) % 16;
  }
  const animFrame = Math.floor(_liqFrameState) % 16;
  const waterfallFrame = Math.floor(_liqWaterfallState) % 16;
  ctx.imageSmoothingEnabled = false;

  // 主循环（双 pass 共用：背景 pass 画在方块层前、透明度 1.0；前景 pass 画在方块后、乘 DEFAULT_OPACITY）
  // 水波位移（WaterWaves，q>0 生效）：表层格（hasTE=水线）水线随 dy 升降——底边锚定、
  // 上沿移动（dstY+dy / 高 sh−dy），源矩形同步裁剪保持 1:1 像素；同一帧双 pass 采样
  // 确定性一致 → 背景/前景水线恒对齐。波光 tint 仅前景 pass（避免双 pass 重复提亮）。
  // ★warpMode（全屏扭曲管线激活）时本块关闭：波动全部来自 compositeLight 后的
  //   FilterWaterDistortion 全屏位移（原版 waterTarget 本体无逐格 bob）。
  const waveOn = waterWaves.quality > 0 && !warpMode;
  const waveInvZ = waveOn ? 1 / Math.max(1e-6, waterWaves.viewZoom()) : 0;
  // ★IIIII251 斜坡水缘 CPU bob 门（与表层 bob 同门：GL 全屏扭曲路径不双重 bob，
  //  位移由足迹门控交付——见 Renderer footCtx 接线与 WaterWarpCompositor；
  //  ★IIIII257 转正后 slopeWaveEnabled 缺省 true，?slopewave=0 逃生门关）
  const slopeWaveBob = slopeWaveEnabled && waterWaves.quality > 0 && !warpMode;
  const _wdisp: [number, number] = [0, 0];
  const _slopeDisp251: [number, number] = [0, 0];   // ★IIIII251 斜坡水缘 bob 采样暂存
  // ★整数设备矩形分区（2026-08-22 用户终报"某些缩放下每格水之间浮点像素缝隙"）：
  //   水格矩形=世界整数坐标，但 zoom·dpr 非整数时相邻格共享边落在设备分数像素，
  //   光栅器对每个 drawImage 矩形【独立取边覆盖】→ 共享边 1px 无覆盖缝（背景
  //   透出，水面成网格）。修=主循环切【身份变换】按设备像素绘制，每格设备矩形
  //   按"共享边 ceil 分区"：左/上邻是水 → x0/y0=ceil(共享边)（与邻格 x1/y1=ceil
  //   同值 → 不重不漏）；否则 floor（保水体外缘覆盖）。右/下边恒 ceil。
  //   双 pass（不透明背景 + 0.5 前景）均无缝且无重叠加倍变深。源矩形不动，
  //   ≤1 设备 px 拉伸不可感知（同 2026-08-18 chunk 整数设备矩形定案取舍）。
  //   微光分支以 x*16 为参照（applyShimmerBaseTint）→ 逐 tile 恢复世界变换绘制。
  const wldT = ctx.getTransform();
  const devSX = wldT.a, devSY = wldT.d, devTE = wldT.e, devTF = wldT.f;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // ---- ★liqgl 批通道（列→顶点批;pass 级 all-or-nothing——预检在 Renderer 侧,
  //  此处仅防御:帧环复位/帽溢出/非轴对齐 CTM 回 CPU 原链）----
  resetLiquidBatchForFrame(frameToken ?? -1);
  let batOn = !!bat && frameToken !== undefined && !_batOverflow
    && wldT.b === 0 && wldT.c === 0;
  let runStart = _batN;
  let runImg: CanvasImageSource | null = null;
  let runKey = '';
  let tVisCache = -1;   // 微光 tVis 每 pass 取一次（visEffectFrames 渲染段内不变）
  const flushRun = (): void => {
    const quads = _batN - runStart;
    if (quads <= 0 || !runImg || !bat) return;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const img = runImg, s0 = runStart, nQ = quads, k = runKey;
    bat.emit(img, k, _batRing.subarray(s0 * LIQ_QUAD_FLOATS, _batN * LIQ_QUAD_FLOATS), nQ,
      (raw) => replayLiqRun2D(raw, s0, nQ, img));
    if (gateCapture && !isBackground) _fgRuns.push({ img, key: k, start: s0, quads: nQ });
    runStart = _batN;
    runImg = null;
  };
  if (gateCapture && isBackground) {
    _footWld.a = wldT.a; _footWld.b = wldT.b; _footWld.c = wldT.c;
    _footWld.d = wldT.d; _footWld.e = wldT.e; _footWld.f = wldT.f;
  }
  for (let lx = bx0; lx <= bx1; lx++) {
    const x = px0 + lx;
    for (let ly = by0; ly <= by1; ly++) {
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
      // 帧选择 1:1（DrawNormalLiquids :636-644）：中列（sx==16,下落柱/池体）走慢速瀑布帧。
      // ★微光除外（FX61 对拍补刀）：DrawShimmer :697-705 恒走 _animationFrame，
      // 无 X==16 瀑布中列分支——池体内部格曾误用慢速瀑布帧（16s/格 vs 风速驱动）
      const srcY = isSurface ? 1280 : sy + (vt !== 3 && sx === 16 ? waterfallFrame : animFrame) * 80;
      if (sw <= 0 || sh <= 0 || sx + sw > tex.width || srcY + sh > tex.height) continue;
      // ---- 水波位移（表层水线 bob；WaterWaves.ts 头部 Canvas2D 取舍登记）----
      let dstY = y * 16 + Math.floor(n4 * 16);
      let drawSh = sh;
      let waveSrcH = sh;   // 波动格的源窗高(钳带内容;目标高 drawSh 可拉伸)
      if (waveOn && hasTE[i]) {
        waterWaves.sampleDisplace(x * 16 + 8, y * 16 + 8, _wdisp);
        // ±16 世界 px 钳（原版 ±9.6 屏幕px 量级；防极端值撕裂水线）
        const dWy = Math.min(16, Math.max(-16, _wdisp[1] * waveInvZ));
        // ★位移矩形全整数化（2026-08-19 用户实报"波动时表层格与下层格之间一条
        //   明显的缝"）：光栅器在 imageSmoothing=off 下对浮点 dst 矩形的
        //   y 与 h 【分别取整】,round(y)+round(h) ≠ round(y+h)——表层格底边被
        //   snap 得与下层格顶边差 1px = 波动中闪烁的背景缝(强制 ±4px 分数位移
        //   复现实测 88 缝/125 列帧)。修:顶边取整(波 bob 量化到 1px)、底边
        //   恒等于波前整数底边 → 矩形全整,光栅器零 snap,与下层格逐像素重合
        const bottom = y * 16 + Math.floor(n4 * 16) + sh;   // 波前整数底边
        const topI = Math.round(dstY + dWy);
        dstY = topI;
        drawSh = bottom - topI;
        if (drawSh < 1) { continue; }
        // ★源高钳带内容(≤sh):波把四边形拉高(dWy<0)时源窗不得越过带尾
        //   透明 padding(表面静态带仅 16 行内容,1296 起全透明)——越界采样
        //   = 交界处 1-3px 透明行,背景透出即"波动时表层与下层之间明显的缝"
        //   (2026-08-19 强制 ±4px 分数位移复现 88 缝/125 列帧)。多出的目标
        //   高度以 ≤25% 纵向拉伸吸收:带内仅顶部 4px 有结构(亮线+过渡),
        //   4-15 为纯色体,拉伸不可感知
        waveSrcH = Math.min(drawSh, sh);
      }
      const dstX = x * 16 + Math.floor(n2 * 16);
      // ---- 微光（shimmer, vt=3）：DrawShimmer（LiquidRenderer.cs:682-730）----
      // 原版三步：①基底层 water_14 直画 + 逐顶点 GetShimmerBaseColor 波动蓝移（:745-759）
      // ②sparkle 层：源矩形 X+48（water_14 的第 4 列 16px 闪纹带）、Y+80×GetShimmerFrame
      // 16 帧动画，仅 flag（非内部/瀑布帧）或 (x+y)%2==0 的格子画（:720-729）
      // ③sparkle 顶点色 = GetShimmerGlitterColor 漂移彩虹 + 呼吸 alpha（:766-790）
      // ★liqgl 批路径：①=顶点色调制单 quad（GPU 插值=原版逐顶点插值 1:1）;
      //   CPU 原链保留 canvas multiply 2×2 子块近似（applyShimmerBaseTint）。
      if (vt === 3) {
        // ★2026-09-27 重钉（火苗速率案普查株连）：消费 visEffectFrames()（逐 tick
        //  计数器,stepVisEffectTick 每 fixedUpdate +1;C 批改型 2026-08-31 同判例
        //  同钟面）——渲染段内计数器不变,每 pass 取一次（原逐 tile 读同值）。
        const tVis = tVisCache < 0 ? (tVisCache = visEffectFrames()) : tVisCache;   // Main.timeForVisualEffects（帧计数,1458 Main.cs:17340）
        const flag = shimmerSparkleGate(sx, sy);               // :717（★FX61：曾误写 !(A||B)=∧，表层格彩虹条整缺）
        const wantSpark = flag || (x + y) % 2 === 0;
        // alpha = 像素亮度（tintSparkleBand 已把灰度写进 alpha）× 四角
        // GetShimmerGlitterOpacity 均值。四角均值与原版逐顶点双线性插值的面积均值
        // 数值等价（全网格采样验证平均差 0.0000），top（=有干燥邻边的表层/边缘格，
        // :719 flag=true）四角恒 0.5；body（全浸没 (sx,sy)=(16,48) 内部格）复算
        // 均值 0.09 / 峰值 0.34 → 星点恒为极淡彩虹（近白微闪）。注意 sparkle 不乘
        // 前景 0.75/背景 1 系数——SetShimmerVertexColors_Sparkle :732-743 直接
        // ×= ptr->Opacity
        const sparkGa = wantSpark ? (shimmerGlitterOpacity(flag, x, y, tVis)
          + shimmerGlitterOpacity(flag, x + 1, y, tVis)
          + shimmerGlitterOpacity(flag, x, y + 1, tVis)
          + shimmerGlitterOpacity(flag, x + 1, y + 1, tVis)) * 0.25 : 0;  // :773-790
        const doSpark = wantSpark && sparkGa > 0.02;
        let batched = false;
        if (batOn) {
          // ★liqgl 刀2：基底层+波色 = 【顶点色调制单 quad】——原版
          //  SetShimmerVertexColors（LiquidRenderer.cs:745-759）SpriteBatch modulate
          //  1:1（out = tex.premul × baseColor × opacity,GPU 顶点插值=原版逐顶点
          //  插值）;applyShimmerBaseTint 的 canvas multiply 2×2 子块近似在本路径
          //  退役（CPU 原链保留=?liqgl=0 逃生门;语义差=canvas multiply 半透明 dst
          //  补正项 color×(1−αdst)——原版无此项=批化支更贴原版,census 有界登记）。
          if (runImg !== tex) { flushRun(); runImg = tex; runKey = `liq:${texId(tex)}`; }
          const gaT = Math.min(1, opacity[i] * (isBackground ? 1 : 0.75));
          // 裁剪角 (u,v)（tile 内归一）——双线性场对子矩形封闭=顶点插值逐位等价
          // （正交投影下 GPU 仿射插值,见 shimmerCornerColors 注）
          const uL = (dstX - x * 16) / 16, uR = (dstX + sw - x * 16) / 16;
          const vT = (dstY - y * 16) / 16, vB = (dstY + drawSh - y * 16) / 16;
          shimmerCornerColors(x, y, tVis, uL, uR, vT, vB, _batCols, 0);
          const sex0 = dstX * devSX + devTE, sey0 = dstY * devSY + devTF;
          const sex1 = (dstX + sw) * devSX + devTE, sey1 = (dstY + drawSh) * devSY + devTF;
          if (batQuad(sx, srcY, sw, waveSrcH, tex.width, tex.height,
            sex0, sey0, sex1 - sex0, sey1 - sey0, gaT, _batCols, 0)) {
            batched = true;
            if (doSpark) flushRun();   // sparkle=ADD quad,须在基底层批段之后（层序）
          } else {
            batOn = false;             // 帽溢出:批段收尾,本 tile 落 CPU 原链
            flushRun();
          }
        }
        if (!batched) {
          // 微光分支以 x*16 为参照（applyShimmerBaseTint 的 u/v 归一化）→ 恢复世界
          // 变换按世界像素绘制（微光液稀疏，逐 tile 切换开销可忽略）
          ctx.setTransform(wldT);
          ctx.globalAlpha = Math.min(1, opacity[i] * (isBackground ? 1 : 0.75));
          ctx.drawImage(tex, sx, srcY, sw, waveSrcH, dstX, dstY, sw, drawSh);
          if (sw >= 8) applyShimmerBaseTint(ctx, x, y, dstX, dstY, sw, drawSh, tVis);
        }
        if (doSpark) {
          if (batched) ctx.setTransform(wldT);
          const fr = shimmerFrame(flag, x, y, tVis);         // :791-801
          // :716 sparkle 前把 sourceRectangle 重置回原始 SourceRectangle 再加偏移——
          // 表面格的基底层虽强制切 Y=1280（:700），但 sparkle 的 Y 用的是原始 sy+80*fr
          // （shimmerSparkleSource）。旧实现误用 1280+80*fr：表面格 sparkle 几乎全部
          // 越界被跳过（=表层"彩虹条"消失），仅 fr=0 时命中 Y=1280 的黑底块反而画出黑斑。
          const [sSrcX, sSrcY] = shimmerSparkleSource(sx, sy, fr);
          if (sSrcX + sw <= tex.width && sSrcY + sh <= tex.height) {
            const hue = shimmerGlitterHue(x, y, tVis);       // :768 彩虹相位（纯函数单源）
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
            ctx.globalAlpha = Math.min(1, opacity[i] * sparkGa);
            ctx.drawImage(spark ?? tex, sSrcX + (spark ? -48 : 0), sSrcY, sw, sh,
              dstX, dstY, sw, sh);
            ctx.restore();
          }
          if (batched) ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        if (!batched) ctx.setTransform(1, 0, 0, 1, 0, 0);   // 回身份变换（设备像素主循环）
        continue;
      }
      // 双 pass（Main.cs DrawWaters(true/false) + LiquidRenderer.InternalDraw）：
      // 背景 pass 不透明（露出方块透明像素 = 浸润）；前景 pass 水 0.6 半透明质感
      // ★设备矩形共享边 ceil 分区（见循环前块注）：不重不漏，分数 zoom 零缝
      const ex0 = dstX * devSX + devTE, ex1 = (dstX + sw) * devSX + devTE;
      const ey0 = dstY * devSY + devTF, ey1 = (dstY + drawSh) * devSY + devTF;
      const dx0 = hasVisA[at(lx - 1, ly)] ? Math.ceil(ex0) : Math.floor(ex0);
      const dy0 = hasVisA[at(lx, ly - 1)] ? Math.ceil(ey0) : Math.floor(ey0);
      const dw = Math.ceil(ex1) - dx0, dh = Math.ceil(ey1) - dy0;
      if (dw <= 0 || dh <= 0) continue;
      // 波光 tint（FilterWaterDistortion :106-111；仅表层 + 前景 pass，阈值 0.03 跳弱波）。
      // ★warpMode 下仍画（进离屏随位移场整体扭动——原版 glint 加在全屏 pass 输出上，
      //   位置与波前水线一致）；波光仅 q>0 门，不受 warpMode 关闭影响。
      //   采样前置（批化分支也要做 doGlint 判削;sampleGlint 纯采样无副作用）
      const glintOn = waterWaves.quality > 0 && !isBackground && hasTE[i];
      const glV = glintOn ? waterWaves.sampleGlint(x * 16 + 8, y * 16 + 8, lumAt?.(x, y) ?? 0.75) : 0;
      const doGlint = glintOn && glV > 0.03;
      let batched = false;
      if (batOn) {
        if (runImg !== tex) { flushRun(); runImg = tex; runKey = `liq:${texId(tex)}`; }
        if (batQuad(sx, srcY, sw, waveSrcH, tex.width, tex.height, dx0, dy0, dw, dh,
          Math.min(1, opacity[i] * (isBackground ? 1 : (DEFAULT_OPACITY[vt] ?? 0.6))), null, 0)) {
          batched = true;
          if (doGlint) flushRun();   // glint=ADD quad,须在本 tile 批段之后（层序）
        } else {
          batOn = false;             // 帽溢出:批段收尾,本 tile 落 CPU 原链
          flushRun();
        }
      }
      if (!batched) {
        ctx.globalAlpha = Math.min(1, opacity[i] * (isBackground ? 1 : (DEFAULT_OPACITY[vt] ?? 0.6)));
        ctx.drawImage(tex, sx, srcY, sw, waveSrcH, dx0, dy0, dw, dh);
      }
      if (doGlint) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, glV * opacity[i] * (DEFAULT_OPACITY[vt] ?? 0.6));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(dx0, dy0, dw, dh);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  flushRun();                 // ★liqgl:主循环批段收尾（后随坡面增强/浸润带仍 ctx 直绘）
  ctx.setTransform(wldT);   // 恢复世界变换（坡面增强/浸润带仍世界坐标）

  // ---- 斜面格水体覆盖增强（2026-08-21 用户定案"做得更好"）----
  // 原版：斜面格实心无液 → 不画前景水 → 角色站斜面上时身体与斜切三角区重叠的
  // 部分无水色罩。用户定案增强：邻水的斜面格画水色覆盖。形状 = LiquidSlope 斜面表。
  // ★仅背景 pass（isBackground=true）绘制——层级实证 TileDrawing.cs:526-529：
  //   原版坡面浸润走 tileBatch.SetLayer(Layer_LiquidBehindTiles)，恒在 Layer_Tiles
  //   方块层【之下】。曾双 pass 同画：前景份画在方块贴图之上，斜边 AA 像素被水色
  //   盖出"边界盖在斜方块上层"（用户实报）。且背景份不透明 1.0 已定终色——相邻
  //   水体=不透明背景层+前景 0.6 叠加，同色叠同色无色变，单份背景层即与水体
  //   终色一致，无需第二份。
  // ★斜面表按邻液类型选（2026-09-03 用户实报"岩浆的斜坡方块透明区域没做浸润渲染
  //   露馅,水不会,参考水的做法在岩浆也做"）：旧实现恒用群系水色表
  //   LiquidSlope_${waterStyle}——浸润带缺席的坡面格（如下方浅液 Dq≤240、slope4/3
  //   边角门等,增强无这些门）会被盖成【水色】浸润 = 岩浆岸露馅。改按【开放侧最高
  //   液位邻格】的液体类型选表,与浸润带 num10 选择同语义(:3940-3965 严格大于,
  //   L→R→U→D 序)：岩浆→LiquidSlope_1、蜂蜜→11、微光→14、水→群系水色
  //   （liquidSlopeSheet 同名映射,平/斜两表共用一套文件）。
  if (isBackground) {
    const slopeTexForType = (vt: number): HTMLImageElement | null =>
      getSlopeTex(vt === 2 ? 1 : vt === 3 ? 11 : vt === 4 ? 14 : waterStyle);
    for (let lx = PAD; lx < pw - PAD; lx++) {
      const x = px0 + lx;
      for (let ly = PAD; ly < ph - PAD; ly++) {
        const y = py0 + ly;
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;   // st.idx 直读守卫
        const i = at(lx, ly);
        if (!isSolidA[i] || hasLiquidA[i]) continue;
        // ★st.slope 是 store 下标——此处 i 是局部 padding 网格下标(at(lx,ly)),
        //   直喂会错位读数 → slope 恒落在 1-4 之外 → 整块静默跳过(2026-08-21
        //   用户三轮"仍然失效"的最终根因;前两轮修的是 groundLevel 门与贴图加载)
        const slope = st.slope[st.idx(x, y)];
        if (slope < 1 || slope > 4) continue;
        // ★液面裁剪(2026-08-21 用户标注"氙奇葩"(242,231) slope2 壳堆×61%水位):
        //   整格三角会把水画到液面之上(水爬坡)。原版浸润带按液位算液面下沉
        //   num6=⌊(256-液位)/32⌋×2(TileDrawing.cs:4096),斜面表与平面带共用同一
        //   源矩形(:4539 Y 复用 liquidSize)→ 只画液面以下的行,水线在切口内
        //   保持水平、与邻格水面齐平。液位取坡面【开放侧】邻格最高值——固体背侧
        //   的邻水不计(:3967-4028 slope 门同语义),否则水沿背侧斜边凭空出现
        const liqAt = (dx: number, dy: number): { amt: number; vt: number } | null => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) return null;
          const ni = st.idx(nx, ny);
          return { amt: st.liquid[ni], vt: st.liquidType[ni] || 1 };
        };
        let openLq = 0, openVt = 1;
        const take = (c: { amt: number; vt: number } | null): void => {
          if (c && c.amt > openLq) { openLq = c.amt; openVt = c.vt; }   // 严格大于=L,R,U,D 序平手取先(同浸润带)
        };
        // ★BJ307（2026-09-23 用户实报"临近水面的斜坡渲染异常,海面线处斜坡格多出
        //   水色块 #083DBF"定谳）：增强谓词曾缺原版浸润带两道门,把原版刻意不画的
        //   坡面格画了整格水（物证 Starter World (6155,314)=273 slope3、(6170,314)
        //   =272 slope4,下邻海面表层格液位恒 238≤240,debug-report tiles.areaCamera
        //   enc 行解码实证）：
        //   ①下方旗 >240 门（TileDrawing.cs:4023-4026 flag4）：下邻液位 ≤240 不置旗
        //     → :4044 五旗全空 return = 原版不画。海面表层 93% 液位正落此门。
        //   ②slope3/4 悬空门（:4141-4148 → num15=0 整带不画）：slope4 左邻无液且
        //     不实 / slope3 右邻同 → 坡面背侧无支撑,水不爬背侧斜边。浸润带移植段
        //     （本文件 drawLiquidBehindTilesOnly ★坡面边角门注）已 1:1,唯增强缺。
        //   两门补齐后增强触发集 ≡ 浸润带触发集（坡面格）,不再超原版"水爬坡"。
        take(slope === 1 || slope === 3 ? null : liqAt(-1, 0));
        take(slope === 2 || slope === 4 ? null : liqAt(1, 0));
        take(slope === 3 || slope === 4 ? null : liqAt(0, -1));
        const dCell = slope === 1 || slope === 2 ? null : liqAt(0, 1);
        take(dCell && dCell.amt > 240 ? dCell : null);   // ★BJ307 门①(:4023-4026 flag4)
        // ★BJ307 门②(:4141-4148 num15=0；与浸润带 slope 边角门同式)。★BJ308:原版
        //   谓词=WorldGen.SolidTile 全式（:70642 实例面 !halfBrick∧slope==0 三排除
        //  ——solidTop 支已折 SOLID_LUT）,曾以宽谓词 isSolid 充数 → 邻格半砖/坡面
        //   格误判实心,门②少触发=坡面多画。两处（本段+浸润带 :4141 移植段）同修。
        if (slope === 4 && (liqAt(-1, 0)?.amt ?? 0) === 0 && !st.isSolidStrict(x - 1, y)) continue;
        if (slope === 3 && (liqAt(1, 0)?.amt ?? 0) === 0 && !st.isSolidStrict(x + 1, y)) continue;
        if (openLq <= 0) continue;
        const slopeTex = slopeTexForType(openVt);
        if (!slopeTex || slopeTex.width <= 0) continue;   // 懒加载未就绪跳帧,下帧自愈
        const num6 = Math.floor((256 - openLq) / 32) * 2;
        const sh = 16 - num6;
        if (sh <= 0) continue;
        const sx = 18 * (slope - 1);
        // ★IIIII251（?slopewave=1 CPU 路）：斜面覆盖随波场垂直位移——与浸润带同
        //  采样点（格中心）/同一 ±16 世界 px 钳,刚性整移保持斜切水线形状
        let dy251 = 0;
        if (slopeWaveBob) {
          waterWaves.sampleDisplace(x * 16 + 8, y * 16 + 8, _slopeDisp251);
          dy251 = Math.round(Math.min(16, Math.max(-16, _slopeDisp251[1]
            / Math.max(1e-6, waterWaves.viewZoom()))));
        }
        ctx.globalAlpha = 1;   // 背景层不透明（前景 0.6 份已撤，见块头注释）
        ctx.drawImage(slopeTex, sx, num6, 16, sh, x * 16, y * 16 + num6 + dy251, 16, sh);
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---- 浸润 pass：DrawTile_LiquidBehindTile(TileDrawing.cs:3859-4193) ----
  // 对每个【实心方块格】，检查四邻是否有液体 → 在方块格内画一条液体带
  // （背景 pass，不透明）。方块贴图画在其上——透明圆角像素透出液体色而不是墙色/背景色。
  // 这是原版"水体包裹方块"的全部秘密；条带宽度由邻接方向决定：
  //   仅上方有水 → 格顶 16×4 横条(:4081-4087)
  //   仅下方有水 → 格底 16×4 横条(:4089-4093)
  //   仅左侧有水 → 格左 4px 竖条(:4113-4116);仅右侧 → 格右 4px(:4118-4121)
  //   左右都有   → 整格 16 宽(:4108-4111);深度按液体量 num6=(256-max)/32*2 从底收
  // solidLayer=false：DrawLiquidBehindTiles 背景 pass(:451-467,墙层之前)——坡面格
  //   画【平面 Liquid 全矩形】(斜切区全覆盖,见 drawLiquidBehindTilesOnly 斜面表注释)
  // ★浸润带恒内联直画（2026-08-22 全屏扭曲重构：水体不再进离屏分层——浸润带
  //   属于墙/方块层渲染，背景 pass 在墙/方块之前画 = 原版层序；全屏扭曲在
  //   compositeLight 后统一施加，浸润带随场景一起扭，无需离屏足迹机制）
  if (isBackground) drawLiquidBehindTilesOnly(ctx, atlas, st, groundLevel, tx0, ty0, tx1, ty1, waterStyle, hasWaterfallAt, false, 0, slopeWaveBob, gateFootprintCtx ?? null,
    // ★liqgl：足迹画布缺席时改四边形收集（gate 发射消费;canvas 路径不受扰）
    (gateCapture && !gateFootprintCtx) ? _footQuads : null);

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
// DrawPartialLiquid(behindBlocks=!solidLayer) 的 flag=!BlocksWaterDrawingBehindSelf、
// 非背景 pass 恒 false；flag||slope==0 → 平面 Liquid，否则斜面表。即：
//   背景 pass：普通块坡面格 = 平面 Liquid 全矩形（斜切区整格覆盖！）；仅玻璃族
//             (54/541/328/459/470)坡面走斜面表
//   实心层 pass：一切坡面格走斜面表
// 两层【并集】才是玩家可见结果——普通坡面格的斜切区由背景平面带整格填满，
// 实心层斜面带再叠出贴坡水线。2026-08-20 用户标注 136 格（坡面+水邻 100%，
// 世界"浮夸的羡慕顶峰"）实证旧实现缺背景平面带：斜面形状源矩形自纹理行 ry 起
// （默认 ry=4），斜切区顶部 4 行艺术像素两层均无覆盖 → 透出远景背景亮光
// （用户：两坡格各 4 透明像素+右侧 2 像素）。LiquidSlope 的 Y 直接复用平面带
// 算出的 ry/rh（原版同源 liquidSize）。
/** LiquidSlope 源矩形选择（纯函数）：slope 1..4 → 斜面表列 X = rx + 18*(slope-1)；
 *  slope 0 / 半砖 → null = 走平面 Liquid 表（:4531-4533 flag||num==0 直画分支）。 */
export function liquidSlopeSource(
  slope: number, rx: number, ry: number, rw: number, rh: number,
): { sx: number; sy: number; sw: number; sh: number } | null {
  if (slope < 1 || slope > 4) return null;
  return { sx: rx + 18 * (slope - 1), sy: ry, sw: rw, sh: rh };
}

/** 浸润带贴图选择（TileDrawing.cs:4526-4537 DrawPartialLiquid 纯函数化）：
 *  flag = !BlocksWaterDrawingBehindSelf && !solidLayer（behindBlocks=!solidLayer 时
 *  才保留 flag；实心层 pass 恒 false）；flag||slope==0 → 平面 Liquid，否则斜面表。
 *  ⇒ 背景 pass 普通坡面格 = 平面全矩形（斜切区整格覆盖）；仅玻璃族坡面/实心层
 *  pass 坡面格走 LiquidSlope 斜面形状。 */
export function liquidBandUsesSlopeTable(
  slope: number, solidLayer: boolean, blocksWaterBehindSelf: boolean,
): boolean {
  const flag = !blocksWaterBehindSelf && !solidLayer;
  return !(flag || slope === 0);
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
 * solidLayer：true=实心层 pass(:528-529,墙后贴图前,坡面走 LiquidSlope 斜面表)；
 *   false=背景 pass(:451-467,墙层前,普通坡面格走平面 Liquid 全矩形——斜切区
 *   整格覆盖,与实心层斜面带取并集=原版玩家可见结果,见 liquidSlopeSource 头注释)。
 */
/** ★IIIII251 坡面浸润带 bob 采样暂存（模块级零分配,同 _slopeDisp251 惯例） */
const _bandDisp251: [number, number] = [0, 0];

export function drawLiquidBehindTilesOnly(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, groundLevel: number,
  tx0: number, ty0: number, tx1: number, ty1: number, waterStyle = 0,
  hasWaterfallAt?: (x: number, y: number) => boolean, solidLayer = true,
  /** 果冻管线背景离屏水层填充模式（见 Renderer.drawLiquids ★浸润带画进离屏水层）：
   *  1 = 画进背景水层（source-over，原层序=水体之上）。绕过"半砖+墙+上液跳带"门
   *  （:4148-4151）——层内该带被方块贴图覆盖不可见，但补全位移采样足迹。
   *  ★前景层禁止带入（前景合成画在方块贴图之上 = 水蓝盖地形——用户实报撤回）；
   *    前景采样落空由 GL 合成的足迹回退兜住（GLWaterDistortion.FRAG uFoot） */
  warpFill = 0,
  /** ★IIIII251 CPU 路（★IIIII257 转正缺省开）：坡面/半砖浸润带随波场垂直 bob
   *  （刚性整移）。调用方门 = slopeWaveEnabled && quality>0 && !warpOn
   *  （GL 路径不双重 bob）；?slopewave=0 逃生门关 */
  waveBob = false,
  /** ★IIIII251 GL 路（★IIIII257 转正缺省开）：坡面水形状 α≈0.02 预画进前景水
   *  离屏（= 全屏位移 obj19 门控足迹；仅 bg 调用传入，见 Renderer.drawLiquids）。
   *  256 批坡面亮线的位移/扭曲接入面：足迹楔形含亮线 2px 条带全宽
   *  （LiquidSlope 表 slope1/2 行 0-3 全宽，见 /tmp/iii257-out alpha 台账） */
  footprintCtx: CanvasRenderingContext2D | null = null,
  /** ★liqgl 足迹四边形收集（fgCanvas 足迹画布退役面;footprintCtx 为 null 时启用）：
   *  坡面/半砖足迹改推 _footQuads（世界坐标）,emitVanillaLiquidGate 折算设备后
   *  画进 FBO('liqgate')——语义=canvas 足迹同款（α≈0.02 饱和 obj19 门控）。 */
  footSink: FootQuad[] | null = null,
): void {
  // ★与原版 DrawTile_LiquidBehindTile 的定性保留偏差(2026-08-19 二轮清零后仅存):
  //  ①:4163-4166 地下半砖+上液"顶部顶点色×0"(逐 quad 垂直渐变,Canvas 2D 近似
  //    代价太高,用户裁定保留);②:4171-4182 flag6 多水型混合 DrawPartialLiquid——
  //    依赖 Main.liquidAlpha[] 喷泉水型 crossfade 子系统(±0.2/帧过渡),本仓水型
  //    为瞬时切换无过渡态,该循环恒不触发=与"无喷泉过渡"的原版行为一致;
  //  ③lavaOpacity(lavaVision 熔岩潜水镜未移植,恒用默认 1f)。
  // Liquid_N 贴图(16×16 纯液体块;水 Liquid_0 多 style 但取首 16px)
  const texCache = new Map<number, ImageBitmap | HTMLImageElement | null>();
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
  // LiquidSlope 表缓存（同款"只缓存命中"策略；坡面格才触碰）
  const slopeTexCache = new Map<number, ImageBitmap | HTMLImageElement | null>();
  const slopeTexFor = (vt: number) => {
    let t = slopeTexCache.get(vt);
    if (t === undefined) {
      t = atlas.ensureVImage(liquidSlopeSheet(vt, waterStyle)) ?? null;
      if (t) slopeTexCache.set(vt, t);
    }
    return t;
  };

  // ★IIIII251：足迹离屏默认 identity,而带坐标是世界 px——先对齐主 ctx 当前
  //  变换(浸润带调用点=世界变换,见 drawVanillaLiquids :792 恢复),循环尾恢复。
  if (footprintCtx) footprintCtx.setTransform(ctx.getTransform());
  for (let x = Math.max(1, tx0); x <= Math.min(st.w - 2, tx1); x++) {
    for (let y = Math.max(1, ty0); y <= Math.min(st.h - 2, ty1); y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue; // 空格没有"方块后面"
      if ((st.wire[i] & 32) !== 0) continue; // 致动幽灵格不画浸润(:3906 !active() 同族)
      const def = TILE_DEFS[st.type[i]];
      if (!def || !def.solid || def.platform) continue; // 仅实心方块(:4075 tileSolid 排除)
      const slope = st.slope[i];
      // blockType(num4)语义:0=整块 / 1=半砖 / 2-5=坡面(:3907 blockType())
      const num4 = slope !== 0 ? slope : (st.half[i] ? 1 : 0);
      const sheet = def.vanilla?.sheet ?? -1;
      // :3910 BlocksWaterDrawingBehindSelf(TileID.cs:357):玻璃54/回声541/彩纸328/
      // 雪落459/假人470 —— 平面格(slope==0)整块挡水,不画背后的带
      const blocksWaterBehindSelf = sheet === 54 || sheet === 541 || sheet === 328 || sheet === 459 || sheet === 470;
      if (slope === 0 && blocksWaterBehindSelf) continue;
      // :3923-3925 传送带(379)自身格有液体 → 整格跳过
      if (sheet === 379 && st.liquid[i] > 0) continue;

      // 四邻液体(TileDrawing.cs:3861-3900;379=conveyor 按 vanilla 视为无液体)。
      // ★零分配版(2026-08-18):旧 lq() 每调用 new {lq,lt} ×4/格——水邻屏每帧
      // 8k-33k 对象 = GC 0.94s/次 = 行走 70-135ms 掉帧主源(trace ProfileChunk+GC 相关性)
      // ★IIIII248 内联展开(等价证明):本循环界 x∈[max(1,tx0),min(w-2,tx1)]/
      //   y∈[max(1,ty0),min(h-2,ty1)] ⇒ 四邻 nx=x±1∈[0,w-1]、ny=y±1∈[0,h-1]
      //   ⇒ st.inBounds(nx,ny) 在全循环域恒真(0.44% self 热点的源头即此
      //   恒真守卫+闭包上下文分配——nb 捕获 x/y/nLq/nLt 可变外层 let,V8 每
      //   格迭代建 Context)。展开为直读:idx 展开 = y*w+x 同式,liquidType||1
      //   同式,四邻恒成立 ⇒ 直读与原 inBounds 门逐位同值。
      let Lq = 0, Lqt = 0, Rq = 0, Rqt = 0, Uq = 0, Uqt = 0, Dq = 0, Dqt = 0;
      {
        const liqA = st.liquid, liqT = st.liquidType, wArr = st.w;
        let ni = y * wArr + (x - 1);            // 左邻(x≥1 ⇒ x-1≥0)
        Lq = liqA[ni]; Lqt = liqT[ni] || 1;
        ni = y * wArr + (x + 1);                // 右邻(x≤w-2 ⇒ x+1≤w-1)
        Rq = liqA[ni]; Rqt = liqT[ni] || 1;
        ni = (y - 1) * wArr + x;                // 上邻(y≥1 ⇒ y-1≥0)
        Uq = liqA[ni]; Uqt = liqT[ni] || 1;
        ni = (y + 1) * wArr + x;                // 下邻(y≤h-2 ⇒ y+1≤h-1)
        Dq = liqA[ni]; Dqt = liqT[ni] || 1;
      }
      // 坡面格的"实心侧"邻格不计入（:3967/:3989/:4011/:4028 的 slope 门）：
      // slope 1/3 忽略左、2/4 忽略右、3/4 忽略上、1/2 忽略下——液体只从坡面开放侧来
      const slopeBlocksLeft = slope === 1 || slope === 3;
      const slopeBlocksRight = slope === 2 || slope === 4;
      const slopeBlocksUp = slope === 3 || slope === 4;
      const slopeBlocksDown = slope === 1 || slope === 2;
      // flag 语义(:3967-4053):flag=左 / flag2=右 / flag3=上 / flag4=下(>240)
      let fL = Lq > 0 && !slopeBlocksLeft;
      let fR = Rq > 0 && !slopeBlocksRight;
      const fU = Uq > 0 && !slopeBlocksUp;
      let fD = Dq > 240 && !slopeBlocksDown;
      // ★半砖邻格的"视觉水"计入侧向旗(2026-08-20 用户终验三轮定谳):半砖格自身
      //   liquid 恒 0(原版 UpdateLiquid 下灌门 Liquid.cs:568 同样挡半砖格,两版一致;
      //   本世界 4004 个"上格有水半砖格"全 dry、0 个含液),但其上格有液时液体渲染
      //   器按 IsHalfBrick 强制满格画水(LiquidRenderer.cs:193-230/:121)——邻格上半
      //   8px 视觉上是水。本格与其相接的侧缘(D1 半砖接缝补丁 (144,0,4,8) 的设计
      //   透明角等)由此包水:侧旗放行 → 与上水并存时走默认整格带 (0,4,16,16),
      //   接缝透明角透出水色——用户实测原版观感"半透明水色"而非透视差背景。
      //   原版 band 门读 tile.liquid 原始值(此构型为 0);本扩展改读"视觉液位",
      //   【登记为定性偏差】(液位取 255——IsHalfBrick 视觉恒满格,与上格实际液位
      //   无关;带画在贴图之后仅透过透明像素可见,越界部分被贴图遮挡无副作用)。
      if (!fL || !fR) {
        // ★IIIII248 内联展开(等价证明):nx=x±1∈[0,w-1](循环界同上)、y≥1 ⇒
        //   y-1≥0 ⇒ 两个 inBounds 恒真;谓词体 flags/half/platform/上格 liquid>0
        //   逐项同式直读,命中支同值(fL/fR=true + Lq/Rq=255)。
        const halfF = st.half, typeA = st.type, flagA = st.flags, liqA2 = st.liquid, wA = st.w;
        if (!fL) {
          const ni = y * wA + (x - 1), nu = (y - 1) * wA + (x - 1);
          if (flagA[ni] !== 0 && halfF[ni] !== 0 && !(TILE_DEFS[typeA[ni]]?.platform)
            && liqA2[nu] > 0) { fL = true; Lq = 255; }
        }
        if (!fR) {
          const ni = y * wA + (x + 1), nu = (y - 1) * wA + (x + 1);
          if (flagA[ni] !== 0 && halfF[ni] !== 0 && !(TILE_DEFS[typeA[ni]]?.platform)
            && liqA2[nu] > 0) { fR = true; Rq = 255; }
        }
      }
      // ★flag5 自身格液体(:3943-3963,2026-08-19 用户实报"半格方块浸润未处理"):
      //   半砖/坡面格【自己格内】的液体也画浸润(半砖需 >160)——本格既是容器
      //   又是方块,水搁在半砖上时原版从本格取液位画带,旧实现只读四邻 = 整类缺失
      const selfLq = st.liquid[i];
      // :3921-3939 Grate(546 格栅)自液体特例:格栅透水,自身格液体 → 三向旗
      // 全开+液位直取本格(原版走独立 else 支,四邻旗/液位不参与;fU 恒 false)
      const grateSelf = sheet === 546 && selfLq > 0;
      let f5: boolean;
      if (grateSelf) {
        fL = true; fR = true; fD = true;
        f5 = true;
      } else {
        f5 = selfLq > 0 && num4 !== 0 && (num4 !== 1 || selfLq > 160);
      }
      if (!fL && !fR && !fU && !fD && !f5) continue; // :4054 五旗全空跳过
      // :3906 半砖+侧液>160+瀑布 → 让位瀑布(瀑布本体覆盖半砖,带不画)
      if (st.half[i] && (Lq > 160 || Rq > 160) && hasWaterfallAt?.(x, y)) continue;

      // 液体类型与最大液位(:3940-3965 取最高液位邻居;顺序 L→R→U→D 严格大于才覆盖)
      let maxLq = 0, lt = 0;
      if (grateSelf) { maxLq = selfLq; lt = toVanillaType(st.liquidType[i] || 1); }
      else {
        if (fL && Lq > maxLq) { maxLq = Lq; lt = toVanillaType(Lqt); }
        if (fR && Rq > maxLq) { maxLq = Rq; lt = toVanillaType(Rqt); }
        if (fU && Uq > maxLq) { maxLq = Uq; lt = toVanillaType(Uqt); }
        if (fD && Dq > maxLq) { maxLq = Dq; lt = toVanillaType(Dqt); }
        if (f5 && selfLq > maxLq) { maxLq = selfLq; lt = toVanillaType(st.liquidType[i] || 1); }
      }
      // ★坡面边角门(:4141-4148,旧注 :4155-4162 系行号漂移勘误):slope4 左侧无液
      //   无实心 / slope3 右侧同 → 整带不画。★BJ308:实心谓词=SolidTile 全式
      //  （!halfBrick∧slope==0,solidTop 已折 SOLID_LUT）→ isSolidStrict,同增强段。
      if (slope === 4 && Lq === 0 && !st.isSolidStrict(x - 1, y)) continue;
      if (slope === 3 && Rq === 0 && !st.isSolidStrict(x + 1, y)) continue;
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
          if (isHalf || slope !== 0) rh = 12;
        } else if (fD && !fL && !fR) {
          // 仅下方:格底 16×4(:4089-4093)
          py = y * 16 + 12; rh = 4;
        } else {
          // 侧向有水(:4095-4123)
          let y0 = 4;
          const upNi = st.idx(x, y - 1);
          // ★num4!=0 门(:4087):半砖/坡面格即便上格实心也从格顶画——
          //   (num5 == 0 && (num12 != 0 || !WorldGen.SolidTile(tileX, tileY - 1)),
          //   TileDrawing.cs:4087,num12=blockType(:3907))。★BJ325:实心臂=SolidTile
          //   全式(WorldGen.cs:70642 !halfBrick∧slope==0 三排除)→ isSolidStrict,
          //   同 BJ308 门②——曾以宽谓词 isSolid 充数,上格半砖/坡面误判实心 →
          //   带源 y0 滞 4 = 带矮 4px 且亮顶行不入带。
          if (st.liquid[upNi] === 0 && (num4 !== 0 || !st.isSolidStrict(x, y - 1))) y0 = 0;
          const num6 = Math.floor((256 - maxLq) / 32) * 2; // 深度=液位不足时从底收(:4096,4102)
          const isHalf = st.half[i];
          if (slope !== 0) {
            // 坡面格:整格宽、自 num6 起(:4102-4106)——窄条分支对坡面不适用
            py = y * 16 + num6; ry = num6; rh = 16 - num6;
          } else if (fL && fR || isHalf) {
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

      // ---- 斜面格换 LiquidSlope 表（TileDrawing.cs:4526-4552 DrawPartialLiquid）----
      // 贴图选择走 liquidBandUsesSlopeTable 纯函数(双 pass 语义,见其头注释);
      // 源矩形 X += 18*(slope-1),Y 复用平面带 ry/rh(原版同源 liquidSize)。
      const useSlopeTable = liquidBandUsesSlopeTable(slope, solidLayer, blocksWaterBehindSelf);
      const slopeSrc = useSlopeTable ? liquidSlopeSource(slope, rx, ry, rw, rh) : null;
      let drawTex: ImageBitmap | HTMLImageElement | null = tex;
      let srx = rx;
      if (slopeSrc) {
        drawTex = slopeTexFor(lt);
        srx = slopeSrc.sx;
        if (!drawTex) drawTex = tex; // 斜面表未就绪 → 退回平面带(下帧懒加载生效)
      }

      // ---- 源矩形钳制到贴图边界(原版 XNA PointClamp = 越界读【边缘行/列】) ----
      // Liquid_N 是 16×16 纯块;默认带 ry=4 起 + rh=16 读到 y=20——XNA PointClamp
      // 采样越界行时取贴图末行(边缘重复),带仍是完整 16px。
      // 【两轮教训:①钳短(2026-08-14 前):带只画 12px,水邻满带格(fU&&fR 走默认
      //   (0,4,16,16) 全格带)底部 4px 无浸润 → 水面线坡面/泥土交界亮缝(2026-08-20
      //   用户标注 #3 实证:y13 x10-15 透亮)。②拉伸 dstH=rh:均匀拉伸≠边缘重复,
      //   水纹相位漂移显脏(2026-08-14 回退)。正解=主段画到贴图底,剩余段用末
      //   【行/列】平铺补齐——与 PointClamp 逐像素等价。】
      const texEdgeY = drawTex.height - 1;
      const srcH = Math.min(rh, drawTex.height - ry);
      const srcW = Math.min(rw, drawTex.width - srx);
      if (srcW <= 0 || srcH <= 0) continue;
      const dstH = srcH;
      const dstW = srcW;
      /** 主段 + 越界余段(末行/列边缘重复,= XNA PointClamp)；oy = ★IIIII251 波 bob 垂直位移 */
      const drawBand = (oy = 0) => {
        ctx.drawImage(drawTex, srx, ry, srcW, srcH, px, py + oy, dstW, dstH);
        if (rh > srcH) {
          ctx.drawImage(drawTex, srx, texEdgeY, srcW, 1, px, py + oy + dstH, dstW, rh - srcH);
        }
        if (rw > srcW) {
          ctx.drawImage(drawTex, drawTex.width - 1, ry, 1, srcH, px + dstW, py + oy, rw - srcW, dstH);
        }
      };

      // ---- ★IIIII251 斜坡水缘波纹（?slopewave=1）----
      // CPU 路 bob：坡面/半砖浸润带随波场垂直位移（与表层水面格同一采样点=格中心、
      // 同一 ±16 世界 px 钳；刚性整移=斜切水线形状不变、顶端随波进退）。GL 全屏
      // 扭曲路径 waveBob=false（位移由足迹门控交付，防双重 bob）。
      let bobDy251 = 0;
      if (waveBob && num4 !== 0) {
        waterWaves.sampleDisplace(x * 16 + 8, y * 16 + 8, _bandDisp251);
        bobDy251 = Math.round(Math.min(16, Math.max(-16, _bandDisp251[1]
          / Math.max(1e-6, waterWaves.viewZoom()))));
      }
      // GL 路足迹：坡面格把 LiquidSlope 斜面水形状、半砖格把上半水区以 α≈0.02
      // 预画进前景水离屏——obj19 门控 aD/aU = min(α×100,1) 在 α≥0.01 即饱和 ⇒
      // 斜坡水缘纳入全屏位移场（可见合成仅 +2% 水色 tint，与浸润带同域不可辨）。
      // 半砖带整格宽但水区只在上半（下半是砖体）→ 足迹钳上半。
      // ★IIIII257：足迹=坡面亮线（本文件实心层 pass 末段）的位移/扭曲接入面——
      // 足迹楔形行 0-3 全宽 ⊇ 亮线 2px 条带，gate 饱和 ⇒ 亮线与平水面亮线同场
      // 起伏、同入水中扭曲。转正后随 warpOn 常开（?slopewave=0 逃生门）。
      if (footprintCtx && num4 !== 0) {
        if (slope !== 0) {
          const stex = slopeTexFor(lt);
          if (stex && stex.width > 0) {
            const fsw = Math.min(rw, stex.width - (18 * (slope - 1) + rx));
            const fsh = Math.min(rh, stex.height - ry);
            if (fsw > 0 && fsh > 0) {
              footprintCtx.globalAlpha = 0.02;
              footprintCtx.drawImage(stex, 18 * (slope - 1) + rx, ry, fsw, fsh,
                px, py + bobDy251, fsw, fsh);
            }
          }
        } else if (st.half[i]) {
          footprintCtx.globalAlpha = 0.02;
          footprintCtx.fillStyle = '#808080';   // 门控只读 alpha,色值无关
          footprintCtx.fillRect(px, y * 16, rw, 8);
        }
      } else if (footSink && num4 !== 0) {
        // ★liqgl：同语义足迹改四边形收集（世界坐标;gate 发射时折算设备+y 镜像,
        // α=0.02 恒定——obj19 门控 ×100 饱和,色值无关）
        if (slope !== 0) {
          const stex = slopeTexFor(lt);
          if (stex && stex.width > 0) {
            const fsw = Math.min(rw, stex.width - (18 * (slope - 1) + rx));
            const fsh = Math.min(rh, stex.height - ry);
            if (fsw > 0 && fsh > 0) {
              footSink.push({ tex: stex, solid: false, sx: 18 * (slope - 1) + rx, sy: ry,
                sw: fsw, sh: fsh, dx: px, dy: py + bobDy251, dw: fsw, dh: fsh });
            }
          }
        } else if (st.half[i]) {
          footSink.push({ tex: null, solid: true, sx: 0, sy: 0, sw: 1, sh: 1,
            dx: px, dy: y * 16, dw: rw, dh: 8 });
        }
      }

      // ---- 微光分支（TileDrawing.cs:4188-4191 num2==14）----
      // 原版 SetShimmerVertexColors 把四角顶点色【整体重置】为 White×opacity×
      // GetShimmerBaseColor(角)——上方整段 num7 透明度/光照计算对微光全部丢弃，
      // opacity = solidLayer ? 0.75 : 1。本函数只在背景 pass 调用（= 原版
      // DrawLiquidBehindTiles :462 的 solidLayer:false 调用点）→ opacity 1。
      // 彩色叠加【该有】：旧注释"省略彩色叠加"与末尾的 multiply 叠加自相矛盾，
      // 按源码对齐为"不透明直画 + 2×2 子块波色 multiply"（与前景 DrawShimmer 同式）。
      if (lt === 3) {
        ctx.globalAlpha = 1;
        drawBand(bobDy251);
        // ★2026-09-27 重钉：同前景 pass（drawVanillaLiquids 内 tVis）——visEffectFrames()
        if (srcW >= 8) applyShimmerBaseTint(ctx, x, y, px, py + bobDy251, dstW, dstH,
          visEffectFrames());
        continue;
      }

      // ---- 不透明度(:4126-4151) ----
      // 地上=1.0(有墙压 0.6,墙 21→0.9);地下基线 0.5;
      // 岩浆=lavaOpacity(默认 1f,lavaVision 未移植恒 1)/蜂蜜=max(0.5×1.7,1)=1
      let alpha = 0.5;
      if (lt === 1 || lt === 2) alpha = 1.0;
      if (y <= Math.floor(groundLevel)) {
        alpha = 1.0;
        const wi = st.wall[i];
        if (wi === 21) alpha = 0.9;
        else if (wi > 0) alpha = 0.6;
      }
      // ★半砖+上格有液+有墙 → 整带不画(:4148-4151;地下半砖上的水由水体本体呈现)。
      // 离屏填充模式绕过（带被方块贴图盖住不可见，但保住位移采样足迹）
      if (!warpFill && st.half[i] && Uq > 0 && st.wall[i] > 0) continue;
      ctx.globalAlpha = alpha;
      drawBand(bobDy251);
      // ---- ★IIIII256 白色水面亮线沿水位线延伸过斜坡格水面段（用户明示偏差，2026-09-14）----
      // 【断线根因】平水面亮边 = 水面带 srcY=1280 顶 2px / Liquid_N 顶 2px（147,177,253）；
      // 坡面格的水最终呈现 = 实心层 pass（本 pass）的 LiquidSlope 斜面表——该表全暗
      // 无亮顶行，且画在背景 pass 平面带（ry=num6=0 时自带亮顶行）之后 ⇒ 亮线在坡面
      // 水面段被暗斜面水盖掉（drawImage 钩子实证：每帧 Liquid_0 亮带 → LiquidSlope
      // ×2 后画覆盖）。半砖格 slope=0 走平面带不受影响（亮线本就连续）。
      // 【修法】坡面 1/2（落地坡）且水位线横过格顶（上格无液体无实心=带顶即水面；
      // 上格有液 fU=水下坡不画、上格实心=水下顶板不画）时，以平面 Liquid_N 顶 2px
      // 亮边同位过画——方块贴图随后覆盖实心侧，亮线恰落在可见水面段上，与平水面
      // 亮线同色同厚（终色同为末次不透明绘制）。仅实心层 pass（坡面液体最后一次
      // 绘制）；3/4 为顶坡（水面不横过格顶）不画。bobDy251 随带同移（CPU bob 路）。
      // ★IIIII257 位移接线定谳：GL 路亮线的位移施加点 = compositeLight 末尾全屏
      // 扭曲 pass（GLWaterDistortion obj19，门控纹理=前景水离屏）——亮线像素在
      // uScene 内，gate 由 251 足迹（α≈0.02 饱和）在坡面楔形内交付；256 曾宣称
      // "GL 路随位移场波动"仅在 ?slopewave=1 灰度支成立，缺省足迹缺席 gate=0
      // =用户实报"亮线静止"的根因（255 verify-report off/on 臂对照实证）。转正
      // 后常开，?slopewave=0 回退（亮线仍在、静止同灰度期）。
      // ★BJ325:「上格实心」谓词=SolidTile 全式 → isSolidStrict（与 num4 门
      //   :4087 的 !SolidTile(above) 臂同源——本偏差门镜像该暴露条件,亮线只在
      //   带顶=可见水面时画;上格半砖/坡面(SolidTile=false)时带顶对下方 8px
      //   空腔暴露,亮线应画——宽谓词曾误判实心=漏画）。
      if (solidLayer && (slope === 1 || slope === 2) && Uq === 0 && !st.isSolidStrict(x, y - 1)
        && (fL || fR)) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(tex, rx, 0, Math.min(rw, tex.width - rx), 2, px, py + bobDy251, rw, 2);
      }
    }
  }
  // ★IIIII251：足迹画完恢复 identity（beginFgPass 每帧重设变换，此处为防御复位）
  if (footprintCtx) footprintCtx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}
