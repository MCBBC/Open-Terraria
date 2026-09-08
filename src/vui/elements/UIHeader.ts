// 移植自 Terarria1405/GameContent/UI/Elements/UIHeader.cs
// 世界加载页大标题：四向 1.2px 黑描边 + 白字
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { PixelText } from '../draw/PixelText';
import { rgb, type Color } from '../draw/UISpriteBatch';

export class UIHeader extends UIElement {
  private _text = '';
  scale = 2; // DeathText 大字号
  /** 主体文字色（原版 UIHeader.DrawSelf :54-61：白；十周年(celebrationmk10)且非
   *  天顶(getfixedboi)时 Color.HotPink=(255,105,180)；★IIIII215b 彩蛋生成界面批接线） */
  textColor: Color = rgb(255, 255, 255);

  constructor(text = '') {
    super();
    this.setText(text);
  }

  get text(): string { return this._text; }

  setText(text: string) {
    if (this._text === text) return;
    this._text = text;
    this.width = StyleDimension.fromPixels(PixelText.measure(text) * this.scale);
    this.height = StyleDimension.fromPixels(16 * this.scale);
    this.recalculate();
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    const o = 1.2;
    const black = rgb(0, 0, 0);
    batch.drawString(this._text, d.x - o, d.y - o, black, this.scale);
    batch.drawString(this._text, d.x + o, d.y - o, black, this.scale);
    batch.drawString(this._text, d.x - o, d.y + o, black, this.scale);
    batch.drawString(this._text, d.x + o, d.y + o, black, this.scale);
    batch.drawString(this._text, d.x, d.y, this.textColor, this.scale);
  }
}
