// 移植 UIGenProgressBar.cs：612×70 双进度条 + Outer_* 外框。
// 常量 1:1：长条 offset(20,40) 高16 宽570；短条 offset(50,60) 高8 宽508；
// 填充色 packed：corrupt 4283888223 / crimson 4286836223 / 短条 4290947159。
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch, Color } from '../draw/UISpriteBatch';
import { UITextures } from '../assets/UITextures';
import { rgb } from '../draw/UISpriteBatch';

const LONG_BAR_WIDTH = 570;
const SMALL_BAR_WIDTH = 508;

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
    const x = Math.round(d.x);
    const y = Math.round(d.y);

    // 外框（随邪恶类型；Outer 画在 (x-8,y)，Outer_Lower 画在 (x+44,y+60)）
    const outerKey = this.randomEvil ? 'UI_WorldGen_Outer_Random'
      : this.crimson ? 'UI_WorldGen_Outer_Crimson' : 'UI_WorldGen_Outer_Corrupt';
    const outer = UITextures.get(outerKey);
    if (outer) batch.draw(outer, x - 8, y);
    const lower = UITextures.get('UI_WorldGen_Outer_Lower');
    if (lower) batch.draw(lower, x + 44, y + 60);

    // 长条空槽 + 填充
    batch.fillRect(x + 20, y + 40, LONG_BAR_WIDTH, 16, EMPTY_LONG);
    const longFill = Math.round(LONG_BAR_WIDTH * Math.max(0, Math.min(1, this.totalProgress)));
    const fillColor = this.randomEvil ? RANDOM_COLOR : this.crimson ? CRIMSON_COLOR : CORRUPT_COLOR;
    if (longFill > 0) batch.fillRect(x + 20, y + 40, longFill, 16, fillColor);
    // 短条空槽 + 填充
    batch.fillRect(x + 50, y + 60, SMALL_BAR_WIDTH, 8, EMPTY_SMALL);
    const smallFill = Math.round(SMALL_BAR_WIDTH * Math.max(0, Math.min(1, this.currentProgress)));
    if (smallFill > 0) batch.fillRect(x + 50, y + 60, smallFill, 8, SMALL_COLOR);
  }
}
