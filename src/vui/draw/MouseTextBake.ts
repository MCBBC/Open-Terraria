// ★FX57 2026-09-16 MouseText 家族文本「离屏 12px 烘焙 + 最近邻放大」管线
// (InfoAccsLayer 信息行 + Renderer.drawMouseTextLayer 悬停标签共用)。
//
// 【根因】(用户 Windows 实报:信息栏灰字在背景越亮处越模糊,Mac 同症较轻):
//   CANVAS_MOUSETEXT_FONT 是 12px 网格像素字体,凡按非整数倍字号(14px 拍板档/
//   16px 折中档/19px 等值档)canvas fillText,文本光栅化**必然抗锯齿**
//   (imageSmoothingEnabled 只管 drawImage,管不了 fillText)→ 字形边缘出软灰
//   过渡像素;Windows(DirectWrite 灰度 AA)与 macOS(CoreText)的亚像素策略相异
//   把软边差异放大;灰字 rgb(100,100,100)(grayed 行)/α0.34 压暗行低对比 +
//   四向黑描边贴着软边 → 亮背景上整行发糊。原版 = MouseText 像素字体原生分辨率
//   直出,描边被实心字形吃净 = 锐利。
// 【修法】(像素艺术正道,渲染管线内动刀;行距 22/锚点/215 钳制/claim 序零漂移):
//   ① 以字体原生 12px(整 1×,原生网格上光栅化无缩放 ⇒ 覆盖率 0/1,零抗锯齿)
//     把整行文本(四向描边+字形)烘到离屏小画布;
//   ② 主画布 drawImage 放大至目标字号(imageSmoothingEnabled=false 最近邻)
//     ——像素字体的干净缩放,硬边跨平台字节同源(两端都 NN,无 AA 策略差);
//   ③ 颜色运行时染色:烘焙只出「黑剪影(描边+字形)+白字形 mask」两张位图,
//     彩色版 = mask 经 scratch 'source-in' 染色后叠画——mouseTextColor 脉动灰
//     (190↔255 三角波,Renderer.ts:13283)不进缓存键,缓存不炸;
//   ④ 压暗行(悬停行下一行 ×0.34)与灰字走同管线:α 在主画布 globalAlpha 施
//     (与旧直绘逐像素同式,描边+本体一起暗);
//   ⑤ 行缓存:键 = 行文本(字体族/字号档/描边档都是模块常量),LRU 上限 512
//     溢出即清(信息行/标签全是短串,常驻个位数)。★任务处方原为「文本+色+α
//     键控」——色/α 不进键是本实现的有意改进:色每帧脉动(③)、α 只有 1/0.34
//     两档且作用在主画布合成面,进键只会让缓存逐帧重建(等于没缓存)。
// 【布局零漂移】测宽/墨盒仍由调用侧用目标字号 measureText 出数(215 钳制、
//   图标 iy、19px 行盒近似全照旧);本模块按同源墨盒(actualBoundingBox)把
//   墨顶反推回旧 fillText 的落点——'middle' 锚 = 墨顶 ty−asc×scaleY,
//   'top' 锚 = 墨顶 anchorY−ascTop(ascTop 为 'top' 对齐点下的带符号墨盒)。
// 【降级】无 DOM(vitest node 环境跑渲染层桩测试)/字体未就绪(webfont 加载窗
//   口,同 FX35「每帧重绘自愈」语义)→ 返回 false,调用侧回退旧直绘
//   (fillText 家族逐字节同旧)。模块顶层零 DOM 访问(node import 安全)。
import { CANVAS_MOUSETEXT_FONT, PIXEL_FONT_FAMILY, PixelText } from './PixelText';

/** 字体原生网格(px)——Fusion Pixel 12px 的设计栅格 */
const BASE_PX = 12;
/** 目标字号档(自 CANVAS_MOUSETEXT_FONT 串首解析;14 拍板/16 折中/19 等值档均自适应) */
const TARGET_PX = (() => {
  const v = parseFloat(CANVAS_MOUSETEXT_FONT);
  return Number.isFinite(v) && v > 0 ? v : 14;
})();
/** 主画布最近邻放大倍率 = 目标字号 / 原生网格 */
const UPSCALE = TARGET_PX / BASE_PX;
/** 描边偏移(bake 像素,整数——原生网格上烘必须整格,否则烘焙本体就糊):
 *  ★恒 1 艺术像素(=缩放后自动随档:14px 档 1.17px/19px 档 1.58px)。
 *  原版锚:Utils.DrawBorderStringFourWay(Utils.cs:2633)=四向 ±2 **字体像素**,
 *  而 FontAssets.MouseText scale 1 的笔画粗细 ≈2 字体像素(FX27:CJK 墨高 17-19)
 *  ⇒ 原版环:笔 = 1:1。本仓 12px 艺术格笔画=1 格 ⇒ 环=1 格同比。
 *  ★曾按旧直绘视觉粗细配 ±2 bake px(2×12/TARGET 四舍五入)——14px 档=2.33px 环
 *  压死 1.17px 笔画+1.17px 字距,邻字描边互吃(CJK 粘成墨团,_fx57 newblock 截图
 *  物证);像素管线须按艺术格配环,旧 ±2 是 AA 光栅时代的配参(FX35),偏离登记。 */
const OUTLINE = 1;
/** 烘焙字体串 = CANVAS_MOUSETEXT_FONT 的字号位换成原生 12px(家族表——含
 *  monospace 兜底尾——单源照抄,缺字回退行为与旧直绘一致) */
const BAKE_FONT = CANVAS_MOUSETEXT_FONT.replace(/^\s*\d+(?:\.\d+)?px/, `${BASE_PX}px`);

interface BakedLine {
  /** 黑剪影(四向描边+字形,全 #000)——描边无色相,免染色直出 */
  sil: HTMLCanvasElement;
  /** 白字形(无描边)——运行时染色源(source-in scratch) */
  mask: HTMLCanvasElement;
  /** 画布尺寸(bake px) */
  w: number; h: number;
  /** 字形 pen 原点 x(bake px;四周留描边位) */
  padL: number;
  /** alphabetic 基线 y(bake px,整数——★非整数基线=烘焙本体半格 AA,前功尽弃) */
  baseY: number;
  /** 12px 墨盒(alphabetic 相对,measureText 同源):墨顶 = baseY−ascA */
  ascA: number;
  /** 12px 推进宽(kx 反推用) */
  w12: number;
}

const cache = new Map<string, BakedLine>();
const CACHE_CAP = 512;

let sharedCtxCache: CanvasRenderingContext2D | null = null;
function sharedCtx(): CanvasRenderingContext2D {
  if (!sharedCtxCache) {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    sharedCtxCache = c.getContext('2d')!;
  }
  return sharedCtxCache;
}

/** 像素字体就绪态(UIFont.load 启动已 await;ready 旗未挂上时兜底同步查一次) */
function fontReady(): boolean {
  if (typeof document === 'undefined') return false;
  if (PixelText.ready) return true;
  try {
    return !!document.fonts && document.fonts.check(`${BASE_PX}px ${PIXEL_FONT_FAMILY}`);
  } catch {
    return false;
  }
}

function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

/** 覆盖二值化(★FX57 实测锚定):12px 原生档 fillText 的真字形像素恒 α=255,亚像素
 *  误格微晕恒 α≤63(2026-09-16 headless Chrome 直方图实证:midMax=63,直方图
 *  bucket 0-3;14px 非整数档则 AA 铺满 2..242 全域=本修根因)。按 ≥128 多数覆盖
 *  阈值切齐 0/1——把光栅器的灰度 AA 策略差(Windows DirectWrite/macOS CoreText)
 *  关在门外 ⇒ 烘焙位图跨平台字节同源,NN 放大后仍二值(软边=0) */
function binarize(cv: HTMLCanvasElement): void {
  const c = cv.getContext('2d')!;
  const img = c.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;
  for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 128 ? 255 : 0;
  c.putImageData(img, 0, 0);
}

/** 烘一行(text 键控);不可用(无 DOM/字体未就绪/零宽)→ null=调用侧回退直绘 */
function bake(text: string): BakedLine | null {
  if (!fontReady()) return null;
  const hit = cache.get(text);
  if (hit) return hit;
  const c = sharedCtx();
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';   // 整数基线直烘(★middle/top 对齐点可能落半格)
  c.font = BAKE_FONT;
  const m = c.measureText(text);
  const w12 = m.width;
  if (!(w12 > 0) || !Number.isFinite(w12)) return null;
  const ascA = m.actualBoundingBoxAscent, descA = m.actualBoundingBoxDescent;
  const ascI = Number.isFinite(ascA) && ascA > 0 ? Math.ceil(ascA) : Math.ceil(BASE_PX * 0.85);
  const descI = Number.isFinite(descA) && descA > 0 ? Math.ceil(descA) : Math.ceil(BASE_PX * 0.25);
  const padL = OUTLINE + 1;
  const w = padL + Math.ceil(w12) + OUTLINE + 1;
  const baseY = OUTLINE + 1 + ascI;
  const h = baseY + descI + OUTLINE + 1;
  const sil = mkCanvas(w, h);
  const sc = sil.getContext('2d');
  if (!sc) return null;
  sc.textAlign = 'left';
  sc.textBaseline = 'alphabetic';
  sc.font = BAKE_FONT;
  sc.fillStyle = '#000';
  for (const [ox, oy] of [[OUTLINE, 0], [-OUTLINE, 0], [0, OUTLINE], [0, -OUTLINE]]) {
    sc.fillText(text, padL + ox, baseY + oy);
  }
  sc.fillText(text, padL, baseY);   // 本体同入剪影(描边被实心字形吃净的原版观感)
  const mask = mkCanvas(w, h);
  const mc = mask.getContext('2d');
  if (!mc) return null;
  mc.textAlign = 'left';
  mc.textBaseline = 'alphabetic';
  mc.font = BAKE_FONT;
  mc.fillStyle = '#fff';
  mc.fillText(text, padL, baseY);
  binarize(sil);
  binarize(mask);
  if (cache.size >= CACHE_CAP) cache.clear();
  const line: BakedLine = { sil, mask, w, h, padL, baseY, ascA, w12 };
  cache.set(text, line);
  return line;
}

/** 运行时染色 scratch(白 mask → source-in 单色;脉动灰逐帧染,缓存零压力) */
let tintScratch: HTMLCanvasElement | null = null;
function tinted(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  if (!tintScratch) tintScratch = mkCanvas(mask.width, mask.height);
  if (tintScratch.width !== mask.width || tintScratch.height !== mask.height) {
    tintScratch.width = mask.width;   // 尺寸位赋值即清屏
    tintScratch.height = mask.height;
  }
  const c = tintScratch.getContext('2d')!;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, tintScratch.width, tintScratch.height);
  c.drawImage(mask, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = color;
  c.fillRect(0, 0, tintScratch.width, tintScratch.height);
  c.globalCompositeOperation = 'source-over';
  return tintScratch;
}

export interface BakedTextDrawOpts {
  /** 锚语义:'middle'=行盒中点(InfoAccs 行 ty,textBaseline='middle' 直绘同位)
   *  /'top'=em 顶(drawMouseTextLayer anchor,textBaseline='top' 直绘同位) */
  anchor: 'middle' | 'top';
  /** 正文色(fillStyle 串;描边恒黑) */
  color: string;
  /** 压暗行 α(主画布 globalAlpha,描边+正文一起暗;缺省 1) */
  alpha?: number;
  /** 行宽钳制缩放(InfoAccs 215px 钳制;缺省 1) */
  scaleX?: number;
  scaleY?: number;
}

/**
 * 画一行烘焙文本。返回 false = 烘焙不可用(无 DOM/字体未就绪),调用侧回退旧直绘。
 * 不触碰主画布文本状态(font/textAlign/textBaseline);变换只动
 * imageSmoothingEnabled(=false,最近邻)与 globalAlpha(alpha<1 时),save/restore 包裹。
 */
export function drawBakedMouseText(
  ctx: CanvasRenderingContext2D,
  text: string, anchorX: number, anchorY: number,
  opts: BakedTextDrawOpts,
): boolean {
  const baked = bake(text);
  if (!baked) return false;
  // 目标字号盒测(自有量测 ctx,不碰主画布状态;actualBoundingBox 相对
  // textBaseline 对齐点、正=向上,与调用侧直绘同源同式)
  const c = sharedCtx();
  c.font = CANVAS_MOUSETEXT_FONT;
  c.textAlign = 'left';
  c.textBaseline = opts.anchor;
  const mt = c.measureText(text);
  const wT = mt.width;
  if (!(wT > 0) || !Number.isFinite(wT)) return false;
  const inkUp = Number.isFinite(mt.actualBoundingBoxAscent) && mt.actualBoundingBoxAscent !== 0
    ? mt.actualBoundingBoxAscent
    : (opts.anchor === 'top' ? -2 : TARGET_PX * 0.55);
  const scaleX = opts.scaleX ?? 1, scaleY = opts.scaleY ?? 1;
  const alpha = opts.alpha ?? 1;
  // 横向:目标推进宽(钳制后)↔ bake 推进宽(测宽域微差吸收,总宽与旧直绘逐像素同)
  const kx = (wT * scaleX) / baked.w12;
  const ky = UPSCALE * scaleY;                       // 纵向:整档字号 × 压扁系数
  const inkTopMain = anchorY - inkUp * scaleY;       // 墨顶 = 旧 fillText 落点(头注【布局零漂移】)
  const dx = anchorX - baked.padL * kx;
  const dy = inkTopMain - (baked.baseY - baked.ascA) * ky;
  const dw = baked.w * kx, dh = baked.h * ky;
  ctx.save();
  ctx.imageSmoothingEnabled = false;                 // ★最近邻——像素字体的干净缩放
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(baked.sil, dx, dy, dw, dh);
  ctx.drawImage(tinted(baked.mask, opts.color), dx, dy, dw, dh);
  ctx.restore();
  return true;
}

/** 诊断面(探针 scripts/_fx57-text-bake.mjs 用):缓存行数+管线常量 */
export function bakeStats(): { count: number; outline: number; targetPx: number; upscale: number } {
  return { count: cache.size, outline: OUTLINE, targetPx: TARGET_PX, upscale: UPSCALE };
}
