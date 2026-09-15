// 像素文字绘制：原版 UI 文字几乎都带黑色描边（先 stroke 后 fill）。
// 字体由 fonts.ts 注入的 @font-face 提供（Fusion Pixel 12px，回退系统字体）。
import type { Color } from './UISpriteBatch';

export const UI_FONT = '"Fusion Pixel 12px", "Microsoft YaHei", "PingFang SC", sans-serif';
const BASE_PX = 12;

/** canvas 侧 MouseText 家族字体串（★FX35 2026-09-15：原「14px monospace 替身」退役）。
 *  根因（用户 Windows 实报「信息配件栏像叠了几层文字」，Mac 同症但 Menlo 字形密
 *  而不显）：monospace 是系统字体族——Windows(DirectWrite) 解析到 Courier/Consolas，
 *  与 macOS(Menlo) 字形度量/抗锯齿相异，四向 ±2 描边在非像素字体上露出偏移拷贝
 *  =重影/错位描边。统一改项目像素字体后跨平台字节同源（UIFont.ts 注册的唯一
 *  @font-face 族），±2 整数轴向偏移落回同栅格 ⇒ 原版式干净描边。
 *  ★字号 19px = FX27 Mouse_Text.xnb 实测链（NpcDialog.ts 台词档同源定谳）：原版
 *  MouseText 1.0 CJK 全块墨高 17-19/推进 18.5；Fusion Pixel 12px 在 19px 档墨高
 *  17.4/推进 19 ⇒ 215px 行宽钳制、换行密度与原版同相（14px 旧档墨高仅 ~13）。
 *  就绪态：UIFont.load() 启动已 await document.fonts.load；webfont 未就绪窗口由
 *  浏览器按降级序列原生回退 monospace，每帧重绘自愈——无需逐帧 fonts.check（省
 *  每帧查询开销）。 */
// ★2026-09-16 用户两轮拍板终值 14px(与旧 monospace 观感尺寸一致,族改像素字体修
//   Windows 叠层);墨高等值档=19px、折中档=16px(FX27 实测链注释保留,可随时切回)
export const CANVAS_MOUSETEXT_FONT = '14px "Fusion Pixel 12px", monospace';
/** 仅族名（DeathText 大字号/相机模式等自定字号处拼用）。★曾有多处误写
 *  "Fusion Pixel 12px zh_hans"——该名未注册（UIFont.ts 只注册本名），canvas 静默
 *  回退 monospace，与信息栏同病（FX35 2026-09-15 一并勘误） */
export const PIXEL_FONT_FAMILY = '"Fusion Pixel 12px"';

let sharedCtxCache: CanvasRenderingContext2D | null = null;

export const PixelText = {
  /** 字体是否已就绪（await UIFont.load() 后为 true） */
  ready: false,

  measure(text: string): number {
    if (typeof document === 'undefined') return text.length * BASE_PX;
    const ctx = PixelText.sharedCtx();
    return ctx.measureText(text).width;
  },

  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: Color, scale = 1, outline = true) {
    const px = BASE_PX * scale;
    ctx.save();
    ctx.font = `${px}px ${UI_FONT}`;
    ctx.textBaseline = 'top';
    const rx = Math.round(x), ry = Math.round(y);
    if (outline) {
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineJoin = 'round';
      ctx.strokeText(text, rx, ry);
    }
    ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${(color.a / 255).toFixed(3)})`;
    ctx.fillText(text, rx, ry);
    ctx.restore();
  },

  /** 测量用共享 context */
  sharedCtx(): CanvasRenderingContext2D {
    if (!sharedCtxCache) {
      const c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      sharedCtxCache = c.getContext('2d')!;
      sharedCtxCache.font = `${BASE_PX}px ${UI_FONT}`;
    }
    return sharedCtxCache;
  },

  /** 载入字体（await document.fonts.load），失败回退系统字体 */
  async load(): Promise<boolean> {
    if (typeof document === 'undefined' || !('fonts' in document)) return false;
    try {
      await document.fonts.load(`${BASE_PX}px "Fusion Pixel 12px"`);
      // 校验真的拿到了（离线/文件缺失时 load 也会 resolve）
      PixelText.ready = document.fonts.check(`${BASE_PX}px "Fusion Pixel 12px"`);
    } catch {
      PixelText.ready = false;
    }
    return PixelText.ready;
  },
};
