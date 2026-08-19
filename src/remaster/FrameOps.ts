// 帧像素操作(重制管线像素层):纯 Uint8ClampedArray 数学(node 单测直测)
// + 浏览器 canvas 胶水(薄封装,调用时才触碰 document)。
//  - 盒式缩回:每目标像素=源块平均(像素艺术 downscale 标准做法,保留色调结构)
//  - 最近邻放大:保像素块边界,供 gpt-image-2 读出像素网格
//  - alpha 蒙版:强制原帧轮廓(碰撞/对齐/纸娃娃叠层全依赖轮廓稳定)
//  - 生成画布几何:gpt-image-2 约束(边长 16 倍数、总像素 ≥655,360、≤8.3M、≤3:1)
import type { FrameRect } from './types';

// ---- 纯像素数学(node 可测) ----

/** 盒式降采样:RGBA(sw×sh)→ RGBA(dw×dh)。源块 [⌊x·sw/dw⌋,⌊(x+1)·sw/dw⌋) 平均,
 *  alpha 参与平均(半透明边缘像素得到正确的预乘语义)。 */
export function boxDownscale(rgba: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor((dy * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * sh) / dh));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor((dx * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1 && y < sh; y++) {
        for (let x = x0; x < x1 && x < sw; x++) {
          const i = (y * sw + x) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3]; n++;
        }
      }
      const o = (dy * dw + dx) * 4;
      out[o] = n ? r / n : 0; out[o + 1] = n ? g / n : 0;
      out[o + 2] = n ? b / n : 0; out[o + 3] = n ? a / n : 0;
    }
  }
  return out;
}

/** 最近邻整数倍放大:k×k 块复制(供模型读像素网格)。 */
export function nearestUpscale(rgba: Uint8ClampedArray, sw: number, sh: number, k: number): Uint8ClampedArray {
  const dw = sw * k, dh = sh * k;
  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.floor(y / k));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.floor(x / k));
      const s = (sy * sw + sx) * 4, d = (y * dw + x) * 4;
      out[d] = rgba[s]; out[d + 1] = rgba[s + 1]; out[d + 2] = rgba[s + 2]; out[d + 3] = rgba[s + 3];
    }
  }
  return out;
}

/** alpha 蒙版强制:dst 的 alpha 逐像素取 src(原帧)——轮廓逐像素不变是特性,
 *  gpt-image-2 不支持透明背景的生成溢出被裁掉。alpha=0 时 RGB 清零防黑边。 */
export function applyAlphaMask(dst: Uint8ClampedArray, src: Uint8ClampedArray): Uint8ClampedArray {
  const n = Math.min(dst.length, src.length);
  for (let i = 0; i < n; i += 4) {
    const a = src[i + 3];
    dst[i + 3] = a;
    if (a === 0) { dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = 0; }
  }
  return dst;
}

/** RGBA 指纹(fnv1a32,十六进制):验收时锁原帧,防原版素材变更后素材包错位应用。 */
export function frameHash(rgba: Uint8ClampedArray): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < rgba.length; i++) {
    h ^= rgba[i];
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ---- 生成画布几何(gpt-image-2 size 约束) ----

export interface GenLayout {
  /** 生成请求的 size(边长 16 倍数、总像素 655,360..8,294,400、比例 ≤3:1) */
  W: number; H: number;
  /** 帧放大倍数(≥1;目标长边 ~1024) */
  k: number;
  /** 放大帧在画布上的居中偏移 */
  ox: number; oy: number;
  /** 放大后帧尺寸 */
  fw: number; fh: number;
}

const align16 = (v: number) => Math.ceil(v / 16) * 16;
/** gpt-image-2 最小总像素(≈1024×640) */
const MIN_PIXELS = 655_360;
const MAX_EDGE = 3840;

/** 计算单帧生成几何:帧理想放大到长边 ~1024,画布 16 对齐、面积达标即止
 *  (方形最快;比例超 3:1 或超 3840 边长时缩 k——一期素材最大帧 240 级,不触发)。 */
export function computeGenLayout(w: number, h: number): GenLayout {
  if (w <= 0 || h <= 0) throw new Error(`bad frame ${w}x${h}`);
  let k = Math.max(1, Math.floor(1024 / Math.max(w, h)));
  let W = 0, H = 0;
  for (;; k--) {
    const fw = w * k, fh = h * k;
    W = align16(fw); H = align16(fh);
    // 面积不足 → 逐 16 扩较小边到达标(循环:16×200 竖条一次 grow 不够)
    while (W * H < MIN_PIXELS) {
      if (W <= H) W += 16; else H += 16;
    }
    if (W <= MAX_EDGE && H <= MAX_EDGE && W * H <= 8_294_400 && Math.max(W, H) / Math.min(W, H) <= 3) break;
    if (k <= 1) throw new Error(`frame ${w}x${h} exceeds gpt-image-2 size constraints`);
  }
  return { W, H, k, ox: (W - w * k) >> 1, oy: (H - h * k) >> 1, fw: w * k, fh: h * k };
}

/** 生成图 → 帧区域源矩形(逆映射;输出尺寸不符请求时按比例容错)。 */
export function mapBackRect(layout: GenLayout, actualW: number, actualH: number): { sx: number; sy: number; sw: number; sh: number } {
  if (actualW === layout.W && actualH === layout.H) {
    return { sx: layout.ox, sy: layout.oy, sw: layout.fw, sh: layout.fh };
  }
  // 比例容错:按实际/请求比例换算
  const rx = actualW / layout.W, ry = actualH / layout.H;
  const sx = Math.round(layout.ox * rx), sy = Math.round(layout.oy * ry);
  const sw = Math.round(layout.fw * rx), sh = Math.round(layout.fh * ry);
  return {
    sx: Math.max(0, Math.min(actualW - 1, sx)), sy: Math.max(0, Math.min(actualH - 1, sy)),
    sw: Math.max(1, Math.min(sw, actualW - sx)), sh: Math.max(1, Math.min(sh, actualH - sy)),
  };
}

/** 整图重制布局:整张 sheet 作为一个重制单元(无法按帧切分的素材——纸娃娃/
 *  背景/液体/树冠/NPC 横条等)。
 *  与逐帧布局的区别:①k 只能放大不能缩(缩回丢像素)——大图 k=1 原尺寸居中;
 *  ②画布 pad 策略:比例 >3:1 的长条(全库 4577 张,Acc_Back 40×1120=28:1 类)
 *  pad 短边到约束内;面积不足扩较小边(交替扩趋于方形,天然保比例)。
 *  每步 +16 收敛(655k 面积方形 ~810 边,远够;帧本身 >3840 边才触发上限防御)。 */
export function computeWholeLayout(w: number, h: number): GenLayout {
  if (w <= 0 || h <= 0) throw new Error(`bad sheet ${w}x${h}`);
  const k = Math.max(1, Math.floor(1024 / Math.max(w, h)));   // 小图放大到长边~1024;大图 k=1
  const fw = w * k, fh = h * k;
  let W = align16(fw), H = align16(fh);
  for (let i = 0; i < 100_000; i++) {
    if (W > MAX_EDGE || H > MAX_EDGE) throw new Error(`sheet ${w}x${h}(×${k})超 gpt-image-2 边长上限`);
    if (W * H > 8_294_400) throw new Error(`sheet ${w}x${h}(×${k})超 gpt-image-2 面积上限`);
    const ratioOk = Math.max(W, H) / Math.min(W, H) <= 3;
    const areaOk = W * H >= MIN_PIXELS;
    if (ratioOk && areaOk) break;
    if (!ratioOk) {
      // pad 短边(修比例;只会让比例变好)
      if (W >= H) H += 16; else W += 16;
    } else {
      // 扩较小边(补面积;扩短边比例只会变好——两分支殊途同归,交替收敛近方形)
      if (W <= H) W += 16; else H += 16;
    }
  }
  return { W, H, k, ox: (W - fw) >> 1, oy: (H - fh) >> 1, fw, fh };
}

// ---- 浏览器 canvas 胶水(调用时才触碰 DOM;node 单测跳过) ----

export function hasCanvas(): boolean { return typeof document !== 'undefined'; }

/** 从 sheet 源(canvas/ImageBitmap/Image)提取帧像素。 */
export function extractFramePixels(img: CanvasImageSource, rect: FrameRect): ImageData {
  const c = document.createElement('canvas');
  c.width = rect.w; c.height = rect.h;
  const cx = c.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = false;
  cx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return cx.getImageData(0, 0, rect.w, rect.h);
}

/** 把重制帧像素写进 sheet 尺寸画布的指定矩形(混合 sheet:原图打底逐帧替换)。 */
export function drawFrameInto(sheet: HTMLCanvasElement, rect: FrameRect, pixels: Uint8ClampedArray): void {
  const cx = sheet.getContext('2d', { willReadFrequently: true })!;
  cx.putImageData(new ImageData(new Uint8ClampedArray(pixels), rect.w, rect.h), rect.x, rect.y);
}

/** ImageData RGBA → 装箱 Uint8ClampedArray 便捷取用。 */
export function rgbaOf(d: ImageData): Uint8ClampedArray { return d.data; }

/** 生成请求画布:帧最近邻放大居中绘制(pixels=帧 RGBA)。返回画布供 toBlob。 */
export function buildGenCanvas(frame: Uint8ClampedArray, w: number, h: number, layout: GenLayout): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = layout.W; c.height = layout.H;
  const cx = c.getContext('2d')!;
  cx.imageSmoothingEnabled = false;
  const up = nearestUpscale(frame, w, h, layout.k);
  const fc = document.createElement('canvas');
  fc.width = layout.fw; fc.height = layout.fh;
  fc.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(up), layout.fw, layout.fh), 0, 0);
  cx.drawImage(fc, layout.ox, layout.oy);
  return c;
}
