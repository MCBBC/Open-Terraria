// 移植自 Terarria1405/GameContent/UI/Elements/UIText.cs
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import { PixelText } from '../draw/PixelText';
import { rgb } from '../draw/UISpriteBatch';
export class UIText extends UIElement {
    constructor(text, textScale = 1, large = false) {
        super();
        Object.defineProperty(this, "text", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ''
        });
        Object.defineProperty(this, "textSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "_color", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rgb(255, 255, 255)
        });
        Object.defineProperty(this, "isWrapped", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "textScale", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        this.setText(text, textScale, large);
    }
    get textValue() { return this.text; }
    setTextColor(color) { this._color = color; }
    setText(text, textScale = this.textScale, _large = false) {
        this.text = text;
        this.textScale = textScale;
        this.textSize = PixelText.measure(text) * textScale;
        this.minWidth = StyleDimension.fromPixels(this.textSize + this.paddingLeft + this.paddingRight);
        this.minHeight = StyleDimension.fromPixels(16 * textScale + this.paddingTop + this.paddingBottom);
        this.recalculate();
    }
    drawSelf(batch) {
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
                }
                else {
                    line += ch;
                }
            }
            this.drawOneLine(batch, line, pos.x, y);
        }
        else {
            this.drawOneLine(batch, this.text, pos.x, pos.y);
        }
    }
    drawOneLine(batch, text, x, y) {
        batch.drawString(text, x, y, this._color, this.textScale);
    }
}
