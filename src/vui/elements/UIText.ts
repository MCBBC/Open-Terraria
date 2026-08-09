// 移植自 Terarria1405/GameContent/UI/Elements/UIText.cs
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch, Color } from '../draw/UISpriteBatch';
import { PixelText } from '../draw/PixelText';
import { rgb } from '../draw/UISpriteBatch';

export class UIText extends UIElement {
  protected text = '';
  protected textSize = 0;
  protected _color: Color = rgb(255, 255, 255);
  isWrapped = false;
  textScale = 1;

  constructor(text: string, textScale = 1, large = false) {
    super();
    this.setText(text, textScale, large);
  }

  get textValue(): string { return this.text; }

  setTextColor(color: Color) { this._color = color; }

  setText(text: string, textScale = this.textScale, _large = false) {
    this.text = text;
    this.textScale = textScale;
    this.textSize = PixelText.measure(text) * textScale;
    this.minWidth = StyleDimension.fromPixels(this.textSize + this.paddingLeft + this.paddingRight);
    this.minHeight = StyleDimension.fromPixels(16 * textScale + this.paddingTop + this.paddingBottom);
    this.recalculate();
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const inner = this.getInnerDimensions();
    const pos = { x: inner.x, y: inner.y - 2 * this.textScale };
    if (this.isWrapped) {
      // 简易折行（按 innerWidth）
      const maxWidth = inner.width;
      let line = '';
      let y = pos.y;
      for (const ch of this.text) {
        if (PixelText.measure(line + ch) * this.textScale > maxWidth) {
          this.drawOneLine(batch, line, pos.x, y);
          line = ch;
          y += 16 * this.textScale;
        } else {
          line += ch;
        }
      }
      this.drawOneLine(batch, line, pos.x, y);
    } else {
      this.drawOneLine(batch, this.text, pos.x, pos.y);
    }
  }

  private drawOneLine(batch: UISpriteBatch, text: string, x: number, y: number) {
    batch.drawString(text, x, y, this._color, this.textScale);
  }
}
