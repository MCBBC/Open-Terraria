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

    // 外框（随邪恶类型；vanilla :100-106：r.X-=8 后 Outer 画在 r.TopLeft()=(x-8,y)，
    //  Outer_Lower 画在 r.TopLeft()+(44,60)=(x+36,y+60)——此前误写 x+44 右移 8px
    //  （2026-08-24 用户截图实报下条框未对齐））
    const outerKey = this.randomEvil ? 'UI_WorldGen_Outer_Random'
      : this.crimson ? 'UI_WorldGen_Outer_Crimson' : 'UI_WorldGen_Outer_Corrupt';
    const outer = UITextures.get(outerKey);
    if (outer) batch.draw(outer, x - 8 * k, y, { scale: k });
    const lower = UITextures.get('UI_WorldGen_Outer_Lower');
    if (lower) batch.draw(lower, x + 36 * k, y + 60 * k, { scale: k });

    // 长条空槽 + 填充
    batch.fillRect(x + 20 * k, y + 40 * k, LONG_BAR_WIDTH * k, 16 * k, EMPTY_LONG);
    const longFill = Math.round(LONG_BAR_WIDTH * k * Math.max(0, Math.min(1, this.totalProgress)));
    const fillColor = this.randomEvil ? RANDOM_COLOR : this.crimson ? CRIMSON_COLOR : CORRUPT_COLOR;
    if (longFill > 0) batch.fillRect(x + 20 * k, y + 40 * k, longFill, 16 * k, fillColor);
    // 短条空槽 + 填充
    batch.fillRect(x + 50 * k, y + 60 * k, SMALL_BAR_WIDTH * k, 8 * k, EMPTY_SMALL);
    const smallFill = Math.round(SMALL_BAR_WIDTH * k * Math.max(0, Math.min(1, this.currentProgress)));
    if (smallFill > 0) batch.fillRect(x + 50 * k, y + 60 * k, smallFill, 8 * k, SMALL_COLOR);
  }
}
