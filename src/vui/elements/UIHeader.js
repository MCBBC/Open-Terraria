// 移植自 Terarria1405/GameContent/UI/Elements/UIHeader.cs
// 世界加载页大标题：四向 1.2px 黑描边 + 白字
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import { PixelText } from '../draw/PixelText';
import { rgb } from '../draw/UISpriteBatch';
export class UIHeader extends UIElement {
    constructor(text = '') {
        super();
        Object.defineProperty(this, "_text", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ''
        });
        Object.defineProperty(this, "scale", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 2
        }); // DeathText 大字号
        this.setText(text);
    }
    get text() { return this._text; }
    setText(text) {
        if (this._text === text)
            return;
        this._text = text;
        this.width = StyleDimension.fromPixels(PixelText.measure(text) * this.scale);
        this.height = StyleDimension.fromPixels(16 * this.scale);
        this.recalculate();
    }
    drawSelf(batch) {
        const d = this.getDimensions();
        const o = 1.2;
        const black = rgb(0, 0, 0);
        batch.drawString(this._text, d.x - o, d.y - o, black, this.scale);
        batch.drawString(this._text, d.x + o, d.y - o, black, this.scale);
        batch.drawString(this._text, d.x - o, d.y + o, black, this.scale);
        batch.drawString(this._text, d.x + o, d.y + o, black, this.scale);
        batch.drawString(this._text, d.x, d.y, rgb(255, 255, 255), this.scale);
    }
}
