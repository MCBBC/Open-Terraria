// 移植 UIGenProgressBar.cs：612×70 双进度条 + Outer_* 外框。
// 常量 1:1：长条 offset(20,40) 高16 宽570；短条 offset(50,60) 高8 宽508；
// 填充色 packed：corrupt 4283888223 / crimson 4286836223 / 短条 4290947159。
// 手机窄屏适配（2026-08-25）：竖屏逻辑宽 ~390 时定宽 612 左右截断约 15% →
// drawSelf 按逻辑宽算 k=fitProgressScale 整体缩放重居中；k 恒 1（逻辑宽 ≥628，
// 桌面 UIScale 公式下限即 800）时全部表达式逐项退化原值，桌面逐像素不变。
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch, Color } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import { rgb } from '../draw/UISpriteBatch';
import { UIScale } from '../draw/UIScale';

const LONG_BAR_WIDTH = 570;
const SMALL_BAR_WIDTH = 508;

/** 进度条宽度自适应因子（手机窄屏；纯函数供单测锁定）：
 *  612 定宽 + 两侧 8 外框余量 → 逻辑宽 628 起为 1；下限 0.55 防极窄屏过小 */
export function fitProgressScale(logicalW: number): number {
  return Math.max(0.55, Math.min(1, (logicalW - 16) / 612));
}

function packed(v: number): Color {
  return { r: (v >>> 16) & 255, g: (v >>> 8) & 255, b: v & 255, a: (v >>> 24) & 255 };
}
const CORRUPT_COLOR = packed(4283888223);
const CRIMSON_COLOR = packed(4286836223);
const SMALL_COLOR = packed(4290947159);
/** 1.4.5.6 新增：随机邪恶（generatingRandomEvil）填充色 */
const RANDOM_COLOR = packed(4292696893);
const EMPTY_LONG = rgb(0x30, 0x30, 0x30);
const EMPTY_SMALL = rgb(0x21, 0x21, 0x21);

export class UIGenProgressBar extends UIElement {
  /** 0..1 总进度 */
  totalProgress = 0;
  /** 0..1 当前段进度 */
  currentProgress = 0;
  /** 猩红世界用猩红配色（WorldGen.crimson） */
  crimson = false;
  /** 1.4.5.6：随机邪恶（Outer_Random + 专属填充色） */
  randomEvil = false;

  constructor() {
    super();
    this.width = StyleDimension.fromPixels(612);
    this.height = StyleDimension.fromPixels(70);
  }

  /** 复刻 Recalculate 的 Top 布局：Top=270（屏高 600→700 线性插到 370） */
  static topForScreenH(logicalH: number): number {
    const t = Math.max(0, Math.min(1, (logicalH - 600) / 100));
    return 270 + t * 100;
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    const k = fitProgressScale(UIScale.logicalW);
    // k<1（窄屏）按逻辑宽重居中；k=1 保持布局引擎原值（逐像素不变）
    const x = Math.round(k === 1 ? d.x : (UIScale.logicalW - 612 * k) / 2);
    const y = Math.round(d.y);

    // ---- 填充先画（DrawSelf :100-103 顺序：DrawFilling2 ×2 在 Outer 之前——
    //      外框最后画压在填充上 = 填充两端"长在"框内装饰下的合成观感；此前
    //      先框后填充 = 填充盖住两端装饰，用户实报"进度条画在 UI 上面"）----
    // DrawFilling2（:117-126）1:1：填充宽 (int)(progress×总宽) 且偶数对齐
    // （%2≠0 减一）；边界处 2px 分隔条 = Lerp(填充色, Black, 0.5)；空槽 = 填充
    // 之后的余段（非全宽垫底）
    const drawFilling = (ox: number, oy: number, h: number, totalW: number,
      progress: number, filled: Color, empty: Color): void => {
      let cw = Math.floor(Math.max(0, Math.min(1, progress)) * totalW);
      if (cw % 2 !== 0) cw--;                        // :118-120 偶数对齐
      const px = x + ox * k, py = y + oy * k, hk = h * k, cwK = cw * k;
      batch.fillRect(px, py, cwK, hk, filled);
      batch.fillRect(px + cwK, py, totalW * k - cwK, hk, empty);
      // 分隔条（:124-125）：填充末端内缩 2px、Lerp(filled,Black,0.5)——cw=0 时
      // 画在条左界外 2px（原版同款，被后画的外框端饰盖住）
      const sep = rgb(Math.round(filled.r * 0.5), Math.round(filled.g * 0.5), Math.round(filled.b * 0.5));
      batch.fillRect(px + cwK - 2 * k, py, 2 * k, hk, sep);
    };
    const fillColor = this.randomEvil ? RANDOM_COLOR : this.crimson ? CRIMSON_COLOR : CORRUPT_COLOR;
    drawFilling(20, 40, 16, LONG_BAR_WIDTH, this.totalProgress, fillColor, EMPTY_LONG);
    drawFilling(50, 60, 8, SMALL_BAR_WIDTH, this.currentProgress, SMALL_COLOR, EMPTY_SMALL);

    // ---- 外框后画（:104-107）：r.X-=8 后 Outer 画在 r.TopLeft()=(x-8,y)，
    //  Outer_Lower 画在 r.TopLeft()+(44,60)=(x+36,y+60)——此前误写 x+44 右移 8px
    //  （2026-08-24 用户截图实报下条框未对齐）----
    const outerKey = this.randomEvil ? 'UI_WorldGen_Outer_Random'
      : this.crimson ? 'UI_WorldGen_Outer_Crimson' : 'UI_WorldGen_Outer_Corrupt';
    const outer = UITextures.get(outerKey);
    if (outer) batch.draw(outer, x - 8 * k, y, { scale: k });
    const lower = UITextures.get('UI_WorldGen_Outer_Lower');
    if (lower) batch.draw(lower, x + 36 * k, y + 60 * k, { scale: k });
  }
}
