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
import { getPass, runPassOnImageData, defaultUniforms } from './SM2Effect';
import type { Renderer } from '../render/Renderer';

interface ImgData { data: Uint8ClampedArray; width: number; height: number }
const SIZE = 128;
let perlinCache: ImgData | null = null;

// ★四柱掉帧定谳批（2026-09-25）主犯①：SM2 产物时间桶缓存。
//  旧实现每塔每帧 CPU 跑 128² ForceField 字节码解释器 + createImageData 分配 +
//  600² blit（探针 cpuprofile SM2 族 44% 帧自耗;4 塔同屏 ×60fps = 240 次/秒冷跑）。
//  修=按 uTime 200ms 时间桶 + LRU≤8 缓存产物（rainbowSlimeCache 判例
//  Renderer.ts bakeRainbowSlimeFrame 同款:相位动画 ≈5fps 语义,census 备案口径）。
//  ★产物纯函数性：SM2 入参只有 (uTime,uColor,uSourceRect,uImageSize0)——半径/包络
//  （alpha/grow）全在 blit 侧（globalAlpha+drawImage 目标矩形）,不入键;uColor 稳态
//  恒 (1,1,1)（4 塔共享同一条目）,破盾 (2,2,2),重塑窗逐 tick 变化（30t 窗外事件,
//  冷跑上界=事件粒度非逐帧）。同桶像素逐位（缓存画布直 blit）;首帧建面后零解释器。
const bubbleCache = new Map<string, HTMLCanvasElement>();
let bubbleCachePruneAt = 0;
const BUBBLE_CACHE_CAP = 8;
const BUCKET_DT = 0.2;             // 200ms 桶（uTime 单位=秒,GTW 每 tick +1/60）
const BUCKET_PHASE = 1 / BUCKET_DT; // ×5 相位步进=原 shader c3=uTime×5 每桶 1 单位

/** 测试/探针计数面：sm2Runs=解释器冷跑次数,cacheHits=桶内命中次数 */
export const __forceFieldBubbleStats = { sm2Runs: 0, cacheHits: 0 };

/** 测试钩：清模块态（冷启动重放） */
export function __resetForceFieldBubbleForTest(): void {
  perlinCache = null;
  bubbleCache.clear();
  __forceFieldBubbleStats.sm2Runs = 0;
  __forceFieldBubbleStats.cacheHits = 0;
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

/** @returns 是否实际绘制（SM2/回退任一） */
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

  const pass = getPass('ForceField');
  let drawn = false;
  if (pass) {
    try {
      // ★时间桶缓存查找（主犯①）：键=(uTime 桶,uColor)——半径/alpha/grow 全在
      //  blit 侧不入键;命中零解释器、零 createImageData（GC 面同消）。
      const bucket = Math.floor(o.time * BUCKET_PHASE);
      const key = bucket + '|' + uColor[0] + ',' + uColor[1] + ',' + uColor[2];
      let product = bubbleCache.get(key);
      if (!product) {
        if (!scratch) scratch = document.createElement('canvas');
        if (scratch.width !== SIZE || scratch.height !== SIZE) { scratch.width = SIZE; scratch.height = SIZE; }
        const scx = scratch.getContext('2d', { willReadFrequently: true });
        if (!scx) return false;
        if (bubbleCache.size >= BUBBLE_CACHE_CAP && performance.now() - bubbleCachePruneAt > 2000) {
          bubbleCachePruneAt = performance.now();
          while (bubbleCache.size >= BUBBLE_CACHE_CAP) bubbleCache.delete(bubbleCache.keys().next().value as string);
        }
        // 桶左沿渲染（uTime=bucket×0.2）——产物=键的纯函数,同桶逐位可复现
        product = document.createElement('canvas');
        product.width = SIZE; product.height = SIZE;
        const pcx = product.getContext('2d', { willReadFrequently: true });
        if (!pcx) return false;
        const frame = frameData ?? (frameData = scx.createImageData(SIZE, SIZE));
        frame.data.set(per.data);
        const u = defaultUniforms();
        u.uColor = uColor;
        u.uTime = bucket * BUCKET_DT;
        u.uSourceRect = [0, 0, SIZE, SIZE];
        u.uImageSize0 = [SIZE, SIZE];
        runPassOnImageData(pass, frame.data, SIZE, SIZE, u);
        pcx.putImageData(frame, 0, 0);
        bubbleCache.set(key, product);
        __forceFieldBubbleStats.sm2Runs++;
      } else {
        __forceFieldBubbleStats.cacheHits++;
      }
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
    const perlinImg = renderer.atlas?.ensureVImage('vanilla/Misc_Perlin.png') ?? scratch;
    if (!perlinImg) return false;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.globalCompositeOperation = 'lighter';
    const r = o.radius * grow * 2;
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
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(1, alpha * 0.35);
  ctx.strokeStyle = `rgb(${Math.round(o.tint[0] * 255)},${Math.round(o.tint[1] * 255)},${Math.round(o.tint[2] * 255)})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(o.cx, o.cy, o.radius * grow * 0.96, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  return true;
}
