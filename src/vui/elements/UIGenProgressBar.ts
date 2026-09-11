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
import type { UnifiedRandom } from '../../core/rng';

const LONG_BAR_WIDTH = 570;
const SMALL_BAR_WIDTH = 508;

/** 进度条宽度自适应因子（手机窄屏；纯函数供单测锁定）：
 *  612 定宽 + 两侧 8 外框余量 → 逻辑宽 628 起为 1；下限 0.55 防极窄屏过小 */
export function fitProgressScale(logicalW: number): number {
  return Math.max(0.55, Math.min(1, (logicalW - 16) / 612));
}

/** FNA Color.PackedValue 解包（FNA src/Color.cs：B=byte2/G=byte1/R=byte0/A=byte3，
 *  即 PackedValue = R | G<<8 | B<<16 | A<<24；本仓同构锚 Renderer.ts:2056 mapPaintPacked
 *  反编译锚 Lighting.cs:248-249 color.X(R) 无移位低位）。★此前误写 B 在低位
 *  （r=(v>>>16)），猩红条渲染成 (131,237,255) 淡蓝、随机邪恶成橙红——IIIII215b
 *  修正为 FNA 语义：猩红=(255,237,131) 淡金、随机邪恶=(61,91,221) 紫。 */
function packed(v: number): Color {
  return { r: v & 255, g: (v >>> 8) & 255, b: (v >>> 16) & 255, a: (v >>> 24) & 255 };
}
const CORRUPT_COLOR = packed(4283888223);
const CRIMSON_COLOR = packed(4286836223);
const SMALL_COLOR = packed(4290947159);
/** 1.4.5.6 新增：随机邪恶（generatingRandomEvil）填充色 */
const RANDOM_COLOR = packed(4292696893);
/** 金标导出（IIIII215b packed 解包修正钉值；packed() 语义见函数注）：
 *  corrupt=(95,242,86) 绿 / crimson=(255,237,131) 淡金 / small=(87,168,194) 钢蓝 /
 *  random=(61,91,221) 紫（FNA Color.cs R 低字节语义）。 */
export const PROGRESS_FILL_COLORS = {
  corrupt: CORRUPT_COLOR, crimson: CRIMSON_COLOR, small: SMALL_COLOR, random: RANDOM_COLOR,
} as const;
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
  /** ★IIIII215b 醉酒帧闪（UIGenProgressBar.DrawSelf :63-67）：WorldGen.drunkWorldGen
   *  （getfixedboi 亦置位——Reset 七依赖套件）为 true 时启用。 */
  drunkWorldGen = false;
  /** UI 层共享掷子——原版同帧 Main.rand 单流（文本乱码/帧闪/云量共用，Main.rand
   *  在生成期 = new UnifiedRandom(seed)，WorldGen.cs:11159）。由 UIWorldLoadState
   *  注入自身私有 UnifiedRandom 实例（与世界生成 genRand/Main.rand 零共享）；
   *  null = 无 drunk 帧闪（读档页）。 */
  uiRand: UnifiedRandom | null = null;
  /** 帧闪观测面（探针）：本帧实绘的 crimson/randomEvil 判定（drawSelf 回写） */
  lastDrawnCrimson = false;
  lastDrawnRandomEvil = false;

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

  /** ★IIIII243 绘制 sprite 联合框（元素框 612×70 之外的真实视觉外沿,布局净带/
   *  探针零叠压断言消费;DrawSelf :84-85 同构,k=1 桌面语义）：
   *  Outer 620×70 画在 (x-8,y)（vanilla r.X-=8）∪ Outer_Lower 532×46 画在 (x+36,y+60)
   *  → 视觉外沿 = x-8 .. x+612 / y .. y+106（短条框下沿的中垂装饰垂尾伸到 +106,
   *  资产实/UI_WorldGen_Outer_Lower.png 532×46 全出血,虚高 70 元素框会漏这 36px）。 */
  static readonly SPRITE = { x: -8, y: 0, w: 620, h: 106 } as const;

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
    // ---- ★IIIII215b 醉酒帧闪（DrawSelf :61-67 1:1）：基色 = crimson/generatingRandomEvil；
    //      drunkWorldGen 时每帧 50% 概率重掷——crimson=Next(2)==0（猩红/腐化对半）、
    //      randomEvil=Next(4)==0（25% 概率 Outer_Random 帧与其专属紫填充）。
    //      掷序与判定条件逐字同构（仅当门掷命中才消费后续两掷）。----
    let crimson = this.crimson;
    let randomEvil = this.randomEvil;
    if (this.drunkWorldGen && this.uiRand) {
      if (this.uiRand.nextInt(2) === 0) {
        crimson = this.uiRand.nextInt(2) === 0;
        randomEvil = this.uiRand.nextInt(4) === 0;
      }
    }
    const fillColor = randomEvil ? RANDOM_COLOR : crimson ? CRIMSON_COLOR : CORRUPT_COLOR;
    // 探针观测面（本帧实绘值;字段不动——帧闪是局部量,原版同构）
    this.lastDrawnCrimson = crimson;
    this.lastDrawnRandomEvil = randomEvil;
    drawFilling(20, 40, 16, LONG_BAR_WIDTH, this.totalProgress, fillColor, EMPTY_LONG);
    drawFilling(50, 60, 8, SMALL_BAR_WIDTH, this.currentProgress, SMALL_COLOR, EMPTY_SMALL);

    // ---- 外框后画（:104-107）：r.X-=8 后 Outer 画在 r.TopLeft()=(x-8,y)，
    //  Outer_Lower 画在 r.TopLeft()+(44,60)=(x+36,y+60)——此前误写 x+44 右移 8px
    //  （2026-08-24 用户截图实报下条框未对齐）----
    const outerKey = randomEvil ? 'UI_WorldGen_Outer_Random'
      : crimson ? 'UI_WorldGen_Outer_Crimson' : 'UI_WorldGen_Outer_Corrupt';
    const outer = UITextures.get(outerKey);
    if (outer) batch.draw(outer, x - 8 * k, y, { scale: k });
    const lower = UITextures.get('UI_WorldGen_Outer_Lower');
    if (lower) batch.draw(lower, x + 36 * k, y + 60 * k, { scale: k });
  }
}
