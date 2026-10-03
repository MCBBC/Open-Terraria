// 四柱护盾泡视觉（shader 审计遗留修齐批 ①）。
// 原版（Main.cs:24551-24583 四柱 DrawNPC 分支）：
//   盾在（shieldStrength>0）: Images/Misc/Perlin 600² 绕柱画,色=White×(frac×0.8+0.2),
//     scale×(1+num319×0.05),num319=破盾淡入 ai3∈(0,30];ForceField uColor=(1+num319×0.5)
//   破盾波（ai3>0 且盾 0）: num320=ai3/120,num321=min(ai3/30,1),色=Vector4(1−√num321),
//     scale×(1+num321),uColor=2 —— 膨胀淡出冲击波
// pass（PixelShader.cso ForceField）：极坐标 swirl 采 Perlin(s0),c2=rect 半宽,c3=uTime×5,
//   c4=uColor。SM2 直连（getPass('ForceField')+runPassOnImageData,Perlin 为输入 ImageData）,
//   异常回退双层的旋转 Perlin 近似。
// ★四柱掉帧定谳批（2026-09-25）：SM2 产物按 uTime 200ms 时间桶+LRU≤8 缓存
//   （bubbleCache;rainbowSlimeCache 判例同款 5fps 语义）——旧每塔每帧 128² 解释器
//   冷跑+createImageData GC 面（探针 SM2 族 44% 帧自耗）。产物键=(uTime 桶,uColor),
//   半径/alpha/grow 全在 blit 侧不入键;桶左沿渲染=同桶像素逐位。计数面
//   __forceFieldBubbleStats（sm2Runs/cacheHits）供红→绿探针/单测断言。
// ★K2 力场泡栅格化成本削减（2026-10-01 二期刀,先定谳后动刀）：
//  【定谳】桶缓存后残余 ~100ms/s = ①5 桶/秒 × ~25ms SM2 解释器冷跑（主犯）;②ring
//  柱色沿逐帧 recordPathOp→rasterizePathOp 栅格化 ~600² bbox 进 accScratch——滞回
//  顶满后 P1-B 子区门恒拒（sw·sh·2<cw·ch 不成立）→ 逐塔逐帧【整幅】texRefresh
//  （GLShimExecutor.resolveTex 动态支,trace texImage2D 632ms/13 次的真身;早期
//  「产物 texRefresh 整幅重传」系误归因——产物走静态 er: 键 texFromRegion 幂等,
//  每桶一次性 64KB 上传）。
//  【GL 主菜】场公式整体移入 GLSL（GLSpriteLayer.FFIELD_*——px_ForceField 生成体
//  逐指令直译,离线场值 readback 闸 scripts/_k2-fieldgate.mjs 验收 maxd≤2/255 c13c
//  判例）：每塔每帧 1 quad（stride 9=uColor/α/uTime 逐 quad 携带）经
//  emitPrecipQuadBatch→pushQuadBatchRgba 入队,quadBatchRgba 数据形状分派
//  （54/quad 唯一判别）→ quadBatchForceField。冷跑/产物画布/putImageData/
//  产物 texImage2D 全归零;uTime 连续（GL 路径无桶,更贴原版逐像素着色器——
//  2D 128² 产物双线性放大=本仓近似,登记差）。
//  【ring 保守刀】GL 帧改环面 annulus 批（emitLiquidAddQuadBatch,tier-1 ADD=
//  canvas 'lighter' 精确式）——96 段四边形纯几何,零栅格化零上传;Skia AA 软边
//  vs 硬边=登记 census 差（3px 加性环 @35% α,目检不可辨级）。2D 帧原生 arc 不动。
//  【回退】?ffgl=0 逃生门 / shim 不活跃 / 门拒（clip/filter/ga/gco 环境态）/
//  GL 失败 → 2D 全量原链逐字节保留（桶缓存+原生 ring）;降级帧 replay 闭包按
//  replayRainBatch2D 判例设备空间直画（产物走同桶缓存,冷跑仅在灾难帧）。
import { getPass, runPassOnImageData, defaultUniforms } from './SM2Effect';
import { ensureSm2Wasm, sm2WasmEnabled, sm2WasmReady, wasmRunPassOnImageData } from '../wasm/sm2Wasm';
import type { Renderer } from '../render/Renderer';

interface ImgData { data: Uint8ClampedArray; width: number; height: number }
const SIZE = 128;
let perlinCache: ImgData | null = null;
/** ★K2 GL 发射的 Perlin 纹理源（128² 下采样画布,与 perlinCache 同字节同源——
 *  批 flush 走 texFromImage 幂等键 'ff:perlin' 一次性上传;willReadFrequently
 *  CPU 面=上传纯 memcpy,R3-F8 判例） */
let perlinCanvas: HTMLCanvasElement | null = null;
/** ★K2 ring annulus 的 1×1 白纹理源（ADD 批 vCol 即贡献色;惰性装配——
 *  测试/worker 环境 import 期 document 未定义,模块加载期建面会恒 null） */
let whiteCanvas: HTMLCanvasElement | null = null;
function ensureWhiteCanvas(): HTMLCanvasElement | null {
  if (!whiteCanvas && typeof document !== 'undefined') {
    whiteCanvas = document.createElement('canvas');
    whiteCanvas.width = 1; whiteCanvas.height = 1;
    const wc = whiteCanvas.getContext('2d');
    if (wc) { wc.fillStyle = '#fff'; wc.fillRect(0, 0, 1, 1); }
  }
  return whiteCanvas;
}

// ★四柱掉帧定谳批（2026-09-25）主犯①：SM2 产物时间桶缓存。
//  旧实现每塔每帧 CPU 跑 128² ForceField 字节码解释器 + createImageData 分配 +
//  600² blit（探针 cpuprofile SM2 族 44% 帧自耗;4 塔同屏 ×60fps = 240 次/秒冷跑）。
//  修=按 uTime 200ms 时间桶 + LRU≤8 缓存产物（rainbowSlimeCache 判例
//  Renderer.ts bakeRainbowSlimeFrame 同款:相位动画 ≈5fps 语义,census 备案口径）。
//  ★产物纯函数性：SM2 入参只有 (uTime,uColor,uSourceRect,uImageSize0)——半径/包络
//  （alpha/grow）全在 blit 侧（globalAlpha+drawImage 目标矩形）,不入键;uColor 稳态
//  恒 (1,1,1)（4 塔共享同一条目）,破盾 (2,2,2),重塑窗逐 tick 变化（30t 窗外事件,
//  冷跑上界=事件粒度非逐帧）。同桶像素逐位（缓存画布直 blit）;首帧建面后零解释器。
//  ★K2 补注：preshader c3.x=5·uTime（setupConstants 变参扫描经验定谳,桶左沿
//  相位步进 =1.0/桶——旧 BUCKET_PHASE 注本正确）;桶宽 200ms 保持
//  （2D 回退链视觉零变化,GL 路径 uTime 连续不入桶）。
const bubbleCache = new Map<string, HTMLCanvasElement>();
let bubbleCachePruneAt = 0;
const BUBBLE_CACHE_CAP = 8;
const BUCKET_DT = 0.2;             // 200ms 桶（uTime 单位=秒,GTW 每 tick +1/60）
const BUCKET_PHASE = 1 / BUCKET_DT;

/** 测试/探针计数面：sm2Runs=解释器冷跑次数,cacheHits=桶内命中次数;
 *  ★K2 增 glEmits=GL 批发射成功数,glFails=发射口拒绝数（门拒/不可用/逃生门）。
 *  ★SM2 WASM 试点（2026-10-03）增 wasmRuns=产物走 WASM VM 的冷跑数（sm2Runs 的
 *  子集;旗 ?sm2wasm=1 缺省关,关闭时恒 0 与旧语义逐位一致）。 */
export const __forceFieldBubbleStats = {
  sm2Runs: 0, cacheHits: 0, glEmits: 0, glFails: 0, wasmRuns: 0,
};

/** ★K2 GL 路径逃生门（?ffgl=0;探针 A/B 面+用户回退口,useGLClouds 判例同款静态） */
const FFGLOFF = typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('ffgl') === '0' : false;

/** ring annulus 段数（96 段弦矢差 ≈0.7px@600 半径,3px 加性环目检不可辨） */
const RING_SEGS = 96;

/** 测试钩：清模块态（冷启动重放） */
export function __resetForceFieldBubbleForTest(): void {
  perlinCache = null;
  perlinCanvas = null;
  bubbleCache.clear();
  __forceFieldBubbleStats.sm2Runs = 0;
  __forceFieldBubbleStats.cacheHits = 0;
  __forceFieldBubbleStats.glEmits = 0;
  __forceFieldBubbleStats.glFails = 0;
  __forceFieldBubbleStats.wasmRuns = 0;
}

function perlinData(renderer: Renderer): ImgData | null {
  if (perlinCache) return perlinCache;
  // ★BJ112-① 死窗修复（2026-09-16）：良性 miss 不吃负缓存——图集懒载语义下
  // null≠404。ensureVImage 首帧必 null（加载在途/_iconPending，SpriteAtlas.ts:635），
  // 旧 15s 时间负缓存把"未就绪"钉成"失败"→盾=100 下 0..15s 零绘制（原版塔一进屏
  // 泡即随,Main.cs:24551-24583）；且 perlinTried=0 初值使页面生命前 15s 连首拍尝试
  // 都不发（预武装死窗）。真失败（404/坏字节）由图集自身 _vImageFailed 10s TTL 负
  // 缓存+瞬态自动重试背书（SpriteAtlas.ts:651-686 onerror 链），消费面逐帧重查 =
  // SpriteAtlas.ts:360 "未就绪返回 null,消费方下帧自愈"的既定契约（同案 Dart.ts:314、
  // VANILLA_MISC 瘦身批对 Misc_Perlin 的既定决策——注释明载"未就绪跳帧、下帧自愈"）。
  try {
    // ★BJ109-G：塔盾源贴图 = Images/Misc/Perlin（Main.cs:24554）→ Misc_Perlin.png
    //（旧键 vanilla/Perlin.png 同字节,但键面按原版请求路径归一）
    const img = renderer.atlas?.ensureVImage('vanilla/Misc_Perlin.png');
    if (!img || !(img.width > 0)) return null;
    const cv = document.createElement('canvas');
    cv.width = SIZE; cv.height = SIZE;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) return null;
    cx.drawImage(img as CanvasImageSource, 0, 0, SIZE, SIZE);
    const im = cx.getImageData(0, 0, SIZE, SIZE);
    perlinCache = { data: im.data, width: SIZE, height: SIZE };
    perlinCanvas = cv;   // ★K2:同源画布留作 GL 纹理（字节与 perlinCache 全等）
    return perlinCache;
  } catch {
    return null;
  }
}

let scratch: HTMLCanvasElement | null = null;
/** SM2 运行缓冲（桶 miss 复用,消逐帧 createImageData GC 面;data.set 全量覆写安全） */
let frameData: ImageData | null = null;

export interface ForceFieldOpts {
  cx: number; cy: number;
  radius: number;                    // 泡半径 px（原版 300×scale）
  tint: [number, number, number];    // 柱色（屏幕滤镜近似沿）
  /** 盾量分数 0-1（shieldStrength/max） */
  frac: number;
  /** 破盾波进度 0-1；-1=盾在 */
  breakT: number;
  /** 破盾淡入 num319 0-1（盾刚刷新 30t 内）——-1=不在窗 */
  reformT: number;
  time: number;
}

/** SM2 产物取用（桶缓存;2D 回退链与降级帧 replay 共用单源）。
 *  键=(uTime 桶,uColor)——半径/alpha/grow 全在 blit 侧不入键。 */
function productFor(uColor: [number, number, number], time: number): HTMLCanvasElement | null {
  const per = perlinCache;
  if (!per) return null;
  const pass = getPass('ForceField');
  if (!pass) return null;
  const bucket = Math.floor(time * BUCKET_PHASE);
  const key = bucket + '|' + uColor[0] + ',' + uColor[1] + ',' + uColor[2];
  let product = bubbleCache.get(key);
  if (product) {
    __forceFieldBubbleStats.cacheHits++;
    return product;
  }
  try {
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width !== SIZE || scratch.height !== SIZE) { scratch.width = SIZE; scratch.height = SIZE; }
    const scx = scratch.getContext('2d', { willReadFrequently: true });
    if (!scx) return null;
    if (bubbleCache.size >= BUBBLE_CACHE_CAP && performance.now() - bubbleCachePruneAt > 2000) {
      bubbleCachePruneAt = performance.now();
      while (bubbleCache.size >= BUBBLE_CACHE_CAP) bubbleCache.delete(bubbleCache.keys().next().value as string);
    }
    // 桶左沿渲染（uTime=bucket×0.2）——产物=键的纯函数,同桶逐位可复现
    product = document.createElement('canvas');
    product.width = SIZE; product.height = SIZE;
    const pcx = product.getContext('2d', { willReadFrequently: true });
    if (!pcx) return null;
    const frame = frameData ?? (frameData = scx.createImageData(SIZE, SIZE));
    frame.data.set(per.data);
    const u = defaultUniforms();
    u.uColor = uColor;
    u.uTime = bucket * BUCKET_DT;
    u.uSourceRect = [0, 0, SIZE, SIZE];
    u.uImageSize0 = [SIZE, SIZE];
    // ★SM2 WASM 试点（2026-10-03）：旗 ?sm2wasm=1（缺省关）∧ wasm 就绪 → 产物走
    // WASM VM（桶缓存键/桶宽/包络全不变）；拒/未就绪/失败一律静默落回 JS 引擎
    // 原路径（逐位既有语义）。未就绪时点火加载（幂等;就绪后本帧起生效）。
    if (sm2WasmEnabled()) void ensureSm2Wasm();
    let wasmDone = false;
    if (sm2WasmEnabled() && sm2WasmReady()) {
      wasmDone = wasmRunPassOnImageData(pass, frame.data, SIZE, SIZE, u);
      if (wasmDone) __forceFieldBubbleStats.wasmRuns++;
    }
    if (!wasmDone) runPassOnImageData(pass, frame.data, SIZE, SIZE, u);
    pcx.putImageData(frame, 0, 0);
    bubbleCache.set(key, product);
    __forceFieldBubbleStats.sm2Runs++;
    return product;
  } catch {
    return null;
  }
}

/** @returns 是否实际绘制（GL 批/SM2/回退任一） */
export function drawForceFieldBubble(
  ctx: CanvasRenderingContext2D,
  renderer: Renderer,
  o: ForceFieldOpts,
): boolean {
  const per = perlinData(renderer);
  if (!per) return false;
  const breaking = o.breakT >= 0;
  // 原版包络
  const alpha = breaking
    ? Math.max(0, 1 - Math.sqrt(o.breakT))
    : o.frac * 0.8 + 0.2;
  const grow = breaking ? 1 + o.breakT : 1 + (o.reformT >= 0 ? o.reformT : 0) * 0.05;
  if (alpha <= 0.01) return false;
  const uColor: [number, number, number] = breaking
    ? [2, 2, 2]
    : [1 + (o.reformT >= 0 ? o.reformT : 0) * 0.5, 1 + (o.reformT >= 0 ? o.reformT : 0) * 0.5, 1 + (o.reformT >= 0 ? o.reformT : 0) * 0.5];

  // ★K2 GL 主菜：场 quad（stride 9）+ ring annulus（ADD 批）——门拒/失败整笔回 2D
  // （all-or-nothing,与雨/雪沙/微光批同语义）
  if (!FFGLOFF && emitForceFieldGL(ctx, renderer, o, alpha, grow, uColor)) return true;
  return drawForceFieldBubble2D(ctx, renderer, o, alpha, grow, uColor);
}

/** ★K2 GL 发射（一次塔一笔）：场 quad 走 emitPrecipQuadBatch（pushQuadBatchRgba
 *  通道,flush 期 quadBatchRgba 数据形状分派→quadBatchForceField）;ring 走
 *  emitLiquidAddQuadBatch（pushLiquidAddBatch tier-1=canvas 'lighter' 精确式）。
 *  环境态预检镜像 pushQuadBatchRgba 门（ga/gco/clip/filter 由执行器复判——此处
 *  预检省顶点构建,判定面以执行器为准）;失败 false=调用方整笔走 2D 原链。 */
function emitForceFieldGL(
  ctx: CanvasRenderingContext2D,
  renderer: Renderer,
  o: ForceFieldOpts,
  alpha: number,
  grow: number,
  uColor: [number, number, number],
): boolean {
  // 发射中介存在性（BJ112 单测 fake renderer 无此方法→直接 2D,不触 ctx）
  const emitRgba = (renderer as unknown as {
    emitPrecipQuadBatch?: (img: CanvasImageSource, key: string, data: Float32Array,
      quads: number, replay: (c: CanvasRenderingContext2D) => void) => boolean;
  }).emitPrecipQuadBatch;
  const emitAdd = (renderer as unknown as {
    emitLiquidAddQuadBatch?: (img: CanvasImageSource, key: string, data: Float32Array,
      quads: number, replay: (c: CanvasRenderingContext2D) => void) => boolean;
  }).emitLiquidAddQuadBatch;
  if (typeof emitRgba !== 'function' || typeof emitAdd !== 'function') return false;
  const white = ensureWhiteCanvas();
  if (!perlinCanvas || !white) return false;
  // 环境态预检（pushQuadBatchRgba 门镜像:ga/gco 非 1/SO 必拒——批顶点已自带
  //  α/uColor,环境态不进输出;2D 链 save+覆写语义不同相,此时整笔走 2D）
  if (ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over') return false;
  const gt = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  if (!gt) return false;
  const { a, b, c, d, e, f } = gt;
  const kx = Math.hypot(a, c), ky = Math.hypot(b, d);
  if (!(kx > 1e-12) || !(ky > 1e-12)) return false;   // 退化 CTM→2D（rasterizePathOp 判例同门）
  const m = (px: number, py: number): [number, number] => [a * px + c * py + e, b * px + d * py + f];

  const ga = Math.min(1, alpha);
  const r = o.radius * grow * 2;
  const x0 = o.cx - r / 2, y0 = o.cy - r / 2;
  const tl = m(x0, y0), tr = m(x0 + r, y0), br = m(x0 + r, y0 + r), bl = m(x0, y0 + r);

  // ---- 场 quad（stride 9×6 顶点:pos2+uv2+col4(uColor+ga)+time1;TRIANGLES
  //      (TL,TR,BR)+(TL,BR,BL) 与 shimQuad 顶点序同构;uv v 向下=2D 产物行序）----
  const data = new Float32Array(54);
  const put = (i: number, x: number, y: number, uu: number, vv: number): void => {
    const o9 = i * 9;
    data[o9] = x; data[o9 + 1] = y; data[o9 + 2] = uu; data[o9 + 3] = vv;
    data[o9 + 4] = uColor[0]; data[o9 + 5] = uColor[1]; data[o9 + 6] = uColor[2];
    data[o9 + 7] = ga; data[o9 + 8] = o.time;
  };
  put(0, tl[0], tl[1], 0, 0);
  put(1, tr[0], tr[1], 1, 0);
  put(2, br[0], br[1], 1, 1);
  put(3, tl[0], tl[1], 0, 0);
  put(4, br[0], br[1], 1, 1);
  put(5, bl[0], bl[1], 0, 1);

  // 降级帧 replay（replayRainBatch2D 判例:设备空间直画;产物走同桶缓存——冷跑
  // 仅发生在降级灾难帧,稳态零触及）
  const time = o.time;
  const replayField = (rc: CanvasRenderingContext2D): void => {
    const product = productFor(uColor, time);
    if (!product) return;
    rc.save();
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.imageSmoothingEnabled = true;
    rc.globalAlpha = ga;
    const bx = Math.min(tl[0], bl[0], tr[0], br[0]);
    const by = Math.min(tl[1], bl[1], tr[1], br[1]);
    const bw = Math.max(tl[0], bl[0], tr[0], br[0]) - bx;
    const bh = Math.max(tl[1], bl[1], tr[1], br[1]) - by;
    if (bw > 0 && bh > 0) rc.drawImage(product, bx, by, bw, bh);
    rc.restore();
  };
  if (!emitRgba.call(renderer, perlinCanvas, 'ff:perlin', data, 1, replayField)) {
    __forceFieldBubbleStats.glFails++;
    return false;
  }

  // ---- ring annulus（柱色沿,Filters.Scene[key] 屏幕滤镜泡沿近似——非原版件,
  //      GL 帧纯几何化登记 AA census 差）：2D 原生 arc(cx,cy,R) stroke 在 CTM 下
  //      =设备椭圆（rx=R·hypot(a,c),ry=R·hypot(b,d)）,lineWidth 3 同比缩放;
  //      ADD 批 vCol=(tint·ga35, ga35)=canvas 'lighter' 预乘贡献精确式 ----
  const R = o.radius * grow * 0.96;
  const rx = R * kx, ry = R * ky;
  const pw = 1.5;   // lineWidth 3 / 2
  const ox = rx + pw * kx, oy = ry + pw * ky;             // 外椭圆半轴
  const ix = Math.max(0, rx - pw * kx), iy = Math.max(0, ry - pw * ky);   // 内椭圆半轴
  const cd = m(o.cx, o.cy);
  const ga35 = Math.min(1, alpha * 0.35);
  const tr8 = o.tint[0] / 255 * ga35, tg8 = o.tint[1] / 255 * ga35, tb8 = o.tint[2] / 255 * ga35;
  const ringData = new Float32Array(RING_SEGS * 48);
  const putRing = (i: number, x: number, y: number): void => {
    const o8 = i * 8;
    ringData[o8] = x; ringData[o8 + 1] = y; ringData[o8 + 2] = 0; ringData[o8 + 3] = 0;
    ringData[o8 + 4] = tr8; ringData[o8 + 5] = tg8; ringData[o8 + 6] = tb8; ringData[o8 + 7] = ga35;
  };
  let vi = 0;
  for (let s = 0; s < RING_SEGS; s++) {
    const a0 = (s / RING_SEGS) * Math.PI * 2, a1 = ((s + 1) / RING_SEGS) * Math.PI * 2;
    const c0 = Math.cos(a0), s0v = Math.sin(a0), c1 = Math.cos(a1), s1v = Math.sin(a1);
    const out0x = cd[0] + c0 * ox, out0y = cd[1] + s0v * oy;
    const out1x = cd[0] + c1 * ox, out1y = cd[1] + s1v * oy;
    const in1x = cd[0] + c1 * ix, in1y = cd[1] + s1v * iy;
    const in0x = cd[0] + c0 * ix, in0y = cd[1] + s0v * iy;
    putRing(vi++, out0x, out0y); putRing(vi++, out1x, out1y); putRing(vi++, in1x, in1y);
    putRing(vi++, out0x, out0y); putRing(vi++, in1x, in1y); putRing(vi++, in0x, in0y);
  }
  const replayRing = (rc: CanvasRenderingContext2D): void => {
    rc.save();
    rc.setTransform(1, 0, 0, 1, 0, 0);
    rc.globalCompositeOperation = 'lighter';
    rc.globalAlpha = ga35;
    rc.strokeStyle = `rgb(${Math.round(o.tint[0] * 255)},${Math.round(o.tint[1] * 255)},${Math.round(o.tint[2] * 255)})`;
    rc.lineWidth = 3 * kx;
    rc.beginPath();
    rc.ellipse(cd[0], cd[1], rx, ry, 0, 0, Math.PI * 2);
    rc.stroke();
    rc.restore();
  };
  if (!emitAdd.call(renderer, white, 'ff:white', ringData, RING_SEGS, replayRing)) {
    // ring 拒绝（罕见:与场同门仅少 ga/gco 检查）——场 quad 已入队,ring 走 ctx 原生
    // op（acc=recordPathOp→隔离栅格化原链）保层序,不整笔回退
    drawRingStroke(ctx, o, alpha, grow);
  }
  __forceFieldBubbleStats.glEmits++;
  return true;
}

/** ring 原生 ctx 描边（2D 帧与 GL ring 拒绝支共用;acc 帧经 recordPathOp→
 *  rasterizePathOp 隔离栅格化——★登记债:GL 帧此支=逐帧 ~600² 整幅 texRefresh,
 *  仅 ring 批拒绝时可达,稳态不可达） */
function drawRingStroke(
  ctx: CanvasRenderingContext2D,
  o: ForceFieldOpts,
  alpha: number,
  grow: number,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha * 0.35);
  ctx.strokeStyle = `rgb(${Math.round(o.tint[0] * 255)},${Math.round(o.tint[1] * 255)},${Math.round(o.tint[2] * 255)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(o.cx, o.cy, o.radius * grow * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** 2D 全量原链（桶缓存产物 blit + 回退双层旋转 Perlin + 原生 ring）——
 *  GL 不可用/逃生门/门拒帧的逐字节既有语义。 */
function drawForceFieldBubble2D(
  ctx: CanvasRenderingContext2D,
  renderer: Renderer,
  o: ForceFieldOpts,
  alpha: number,
  grow: number,
  uColor: [number, number, number],
): boolean {
  const product = productFor(uColor, o.time);
  let drawn = false;
  if (product) {
    try {
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha);
      const r = o.radius * grow * 2;
      ctx.drawImage(product, o.cx - r / 2, o.cy - r / 2, r, r);
      ctx.restore();
      drawn = true;
    } catch {
      drawn = false;                                       // SM2 解释失败 → 回退
    }
  }
  if (!drawn) {
    // 回退：双层反向旋转 Perlin（swirl 观感近似）——源贴图同 Misc_Perlin
    const perlinImg = perlinCanvas ?? renderer.atlas?.ensureVImage('vanilla/Misc_Perlin.png');
    if (!perlinImg) return false;
    const r = o.radius * grow * 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.globalCompositeOperation = 'lighter';
    for (const dir of [1, -1]) {
      ctx.save();
      ctx.translate(o.cx, o.cy);
      ctx.rotate(o.time * 0.4 * dir);
      ctx.drawImage(perlinImg as CanvasImageSource, -r / 2, -r / 2, r, r);
      ctx.restore();
    }
    ctx.restore();
    drawn = true;
  }
  // 柱色沿（Filters.Scene[key] 屏幕滤镜的泡沿近似）
  drawRingStroke(ctx, o, alpha, grow);
  return true;
}
