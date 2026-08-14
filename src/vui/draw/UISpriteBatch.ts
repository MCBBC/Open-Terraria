// UI 绘制批处理 —— 等价 XNA SpriteBatch（本框架实际是即时模式 Canvas 2D 封装）。
// VUI 负责把 ctx transform 设为 uiScale*dpr，此后全部坐标均为 UI 逻辑像素。
import type { DrawRect } from '../../assets/SpriteAtlas';
import type { CalculatedStyle } from '../core/CalculatedStyle';
import { PixelText } from './PixelText';

export interface Color { r: number; g: number; b: number; a: number; }

export function rgb(r: number, g: number, b: number, a = 255): Color { return { r, g, b, a }; }
export function css(c: Color): string { return `rgba(${c.r},${c.g},${c.b},${(c.a / 255).toFixed(3)})`; }

export interface DrawOpts {
  color?: Color;        // 非白 tint（离屏 multiply 缓存）
  scale?: number;       // 均匀缩放
  scaleX?: number;      // 拉伸绘制（进度条/切片填充）
  scaleY?: number;
  rotation?: number;    // 弧度
  originX?: number; originY?: number;
  alpha?: number;       // 0..1 叠加透明度
}

export class UISpriteBatch {
  private clipStack: CalculatedStyle[] = [];
  private tintCache = new Map<string, HTMLCanvasElement>();

  constructor(public ctx: CanvasRenderingContext2D) {
    this.ctx.imageSmoothingEnabled = false;
  }

  /** 贴图绘制。scale 默认 1；origin 默认左上 */
  draw(rect: DrawRect, x: number, y: number, opts: DrawOpts = {}) {
    if (!rect.sw || !rect.sh) return;
    const scale = opts.scale ?? 1;
    const sx = opts.scaleX ?? scale;
    const sy = opts.scaleY ?? scale;
    const ctx = this.ctx;
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    const rot = opts.rotation ?? 0;
    const ox = opts.originX ?? 0;
    const oy = opts.originY ?? 0;
    if (rot !== 0 || ox !== 0 || oy !== 0) {
      ctx.translate(x, y);
      if (rot !== 0) ctx.rotate(rot);
      ctx.translate(-ox, -oy);
      x = 0; y = 0;
    }
    const src = (opts.color && !isWhite(opts.color)) ? this.tinted(rect, opts.color) : rect.img;
    const r = src === rect.img ? rect : { img: src, sx: 0, sy: 0, sw: rect.sw, sh: rect.sh };
    ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, Math.round(x), Math.round(y), rect.sw * sx, rect.sh * sy);
    ctx.restore();
  }

  /** 纯色矩形（MagicPixel 等价物：进度条填充/分隔线） */
  fillRect(x: number, y: number, w: number, h: number, color: Color) {
    if (w <= 0 || h <= 0) return;
    this.ctx.fillStyle = css(color);
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** 描边像素文字（原版文字几乎都带黑描边） */
  drawString(text: string, x: number, y: number, color: Color, scale = 1) {
    PixelText.draw(this.ctx, text, x, y, color, scale);
  }

  measureString(text: string, scale = 1): number {
    return PixelText.measure(text) * scale;
  }

  pushClip(style: CalculatedStyle) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(style.x, style.y, style.width, style.height);
    ctx.clip();
    this.clipStack.push(style);
  }

  popClip() {
    this.ctx.restore();
    this.clipStack.pop();
  }

  /** tint 缓存：multiply 铺色 + destination-in 用原 alpha 裁回。
   *  ★容量闸(2026-08-13 泄露 review):键含色值(含 alpha 档),连续色/alpha
   *  动画下无闸只增不减——对齐渲染层 tintCache 的 1024 满清空惯例。
   *  ★ImageBitmap 化(2026-08-14):无 .src 拼键——WeakMap 实例 id 防跨表碰撞 */
  private static readonly TINT_MAX = 1024;
  private tintImgId = new WeakMap<object, number>();
  private tintImgSeq = 0;
  private tinted(rect: DrawRect, color: Color): HTMLCanvasElement {
    let id = this.tintImgId.get(rect.img as object);
    if (id === undefined) { id = ++this.tintImgSeq; this.tintImgId.set(rect.img as object, id); }
    const key = `t${id}|${rect.sx},${rect.sy},${rect.sw},${rect.sh}|${color.r},${color.g},${color.b},${color.a}`;
    let c = this.tintCache.get(key);
    if (c) return c;
    if (this.tintCache.size >= UISpriteBatch.TINT_MAX) {
      for (const old of this.tintCache.values()) { old.width = 0; old.height = 0; }
      this.tintCache.clear();
    }
    c = document.createElement('canvas');
    c.width = rect.sw; c.height = rect.sh;
    const cx = c.getContext('2d')!;
    cx.imageSmoothingEnabled = false;
    cx.drawImage(rect.img as CanvasImageSource, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = css(color);
    cx.fillRect(0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(rect.img as CanvasImageSource, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
    this.tintCache.set(key, c);
    return c;
  }
}

function isWhite(c: Color) { return c.r === 255 && c.g === 255 && c.b === 255 && c.a === 255; }
