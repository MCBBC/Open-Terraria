// 移植自 Terarria1405/GameContent/UI/Elements/UITextPanel`1.cs
// 带面板背景的可点文本按钮。原版 hover 放大动效由调用方（SetHovered）做，这里内置。
import { UIPanel } from './UIPanel';
import type { UISpriteBatch, Color } from '../draw/UISpriteBatch';
import { PixelText } from '../draw/PixelText';
import { rgb } from '../draw/UISpriteBatch';
import { StyleDimension } from '../core/StyleDimension';
import { UISfx } from '../UISfx';

export class UITextPanel extends UIPanel {
  protected text = '';
  protected textScale = 1;
  protected textSize = 0;
  protected _color: Color = rgb(255, 255, 255);
  protected drawPanelEnabled = true;
  textHAlign = 0.5;
  isLarge = false;

  constructor(text: string, textScale = 1, large = false) {
    super();
    this.setText(text, textScale, large);
    this.onClick(() => UISfx.click());
  }

  get textValue(): string { return this.text; }
  get textSizeValue(): number { return this.textSize; }
  set textColor(c: Color) { this._color = c; }
  /** 是否绘制面板背景（vanilla DrawPanel 属性；与 UIPanel.drawPanel 方法区分） */
  set showPanel(v: boolean) { this.drawPanelEnabled = v; }
  get textScaleValue(): number { return this.textScale; }

  recalculate(): void {
    this.setText(this.text, this.textScale, this.isLarge);
    super.recalculate();
  }

  setText(text: string, textScale = this.textScale, large = false) {
    this.text = text;
    this.textScale = textScale;
    this.isLarge = large;
    this.textSize = PixelText.measure(text) * textScale;
    this.minWidth = StyleDimension.fromPixels(this.textSize + this.paddingLeft + this.paddingRight);
    this.minHeight = StyleDimension.fromPixels((large ? 32 : 16) * textScale + this.paddingTop + this.paddingBottom);
  }

  protected drawSelf(batch: UISpriteBatch): void {
    if (this.drawPanelEnabled) super.drawSelf(batch);
    this.drawText(batch);
  }

  protected drawText(batch: UISpriteBatch) {
    const inner = this.getInnerDimensions();
    let y = inner.y - (this.isLarge ? 10 * this.textScale * this.textScale : 2 * this.textScale);
    const x = inner.x + (inner.width - this.textSize) * this.textHAlign;
    batch.drawString(this.text, x, y, this._color, this.textScale);
  }
}
