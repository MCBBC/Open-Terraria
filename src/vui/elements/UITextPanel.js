// 移植自 Terarria1405/GameContent/UI/Elements/UITextPanel`1.cs
// 带面板背景的可点文本按钮。原版 hover 放大动效由调用方（SetHovered）做，这里内置。
import { UIPanel } from './UIPanel';
import { PixelText } from '../draw/PixelText';
import { rgb } from '../draw/UISpriteBatch';
import { StyleDimension } from '../core/StyleDimension';
import { UISfx } from '../UISfx';
export class UITextPanel extends UIPanel {
    constructor(text, textScale = 1, large = false) {
        super();
        Object.defineProperty(this, "text", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ''
        });
        Object.defineProperty(this, "textScale", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
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
        Object.defineProperty(this, "drawPanelEnabled", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "textHAlign", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0.5
        });
        Object.defineProperty(this, "isLarge", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        this.setText(text, textScale, large);
        this.onClick(() => UISfx.click());
    }
    get textValue() { return this.text; }
    get textSizeValue() { return this.textSize; }
    set textColor(c) { this._color = c; }
    /** 是否绘制面板背景（vanilla DrawPanel 属性；与 UIPanel.drawPanel 方法区分） */
    set showPanel(v) { this.drawPanelEnabled = v; }
    get textScaleValue() { return this.textScale; }
    recalculate() {
        this.setText(this.text, this.textScale, this.isLarge);
        super.recalculate();
    }
    setText(text, textScale = this.textScale, large = false) {
        this.text = text;
        this.textScale = textScale;
        this.isLarge = large;
        this.textSize = PixelText.measure(text) * textScale;
        this.minWidth = StyleDimension.fromPixels(this.textSize + this.paddingLeft + this.paddingRight);
        this.minHeight = StyleDimension.fromPixels((large ? 32 : 16) * textScale + this.paddingTop + this.paddingBottom);
    }
    drawSelf(batch) {
        if (this.drawPanelEnabled)
            super.drawSelf(batch);
        this.drawText(batch);
    }
    drawText(batch) {
        const inner = this.getInnerDimensions();
        let y = inner.y - (this.isLarge ? 10 * this.textScale * this.textScale : 2 * this.textScale);
        const x = inner.x + (inner.width - this.textSize) * this.textHAlign;
        batch.drawString(this.text, x, y, this._color, this.textScale);
    }
}
