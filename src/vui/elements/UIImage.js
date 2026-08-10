// 移植自 UIImage.cs / UIImageButton.cs / UISlicedImage.cs
import { UIElement } from '../core/UIElement';
import { UITextures } from '../assets/UITextures';
import { rgb } from '../draw/UISpriteBatch';
import { StyleDimension } from '../core/StyleDimension';
import { UISfx } from '../UISfx';
/** 图片元素（保持原尺寸） */
export class UIImage extends UIElement {
    constructor(textureKey, scale = 1) {
        super();
        Object.defineProperty(this, "textureKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: textureKey
        });
        Object.defineProperty(this, "scale", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: scale
        });
        const t = UITextures.get(textureKey);
        if (t) {
            this.width = StyleDimension.fromPixels(t.sw * scale);
            this.height = StyleDimension.fromPixels(t.sh * scale);
        }
    }
    get rect() { return UITextures.get(this.textureKey); }
    drawSelf(batch) {
        const t = this.rect;
        if (!t)
            return;
        batch.draw(t, this.getDimensions().x, this.getDimensions().y, { scale: this.scale });
    }
}
/** 可点击图片按钮（hover 泛白 + Menu_Tick 音效） */
export class UIImageButton extends UIElement {
    constructor(textureKey, scale = 1) {
        super();
        Object.defineProperty(this, "textureKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: textureKey
        });
        Object.defineProperty(this, "scale", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: scale
        });
        Object.defineProperty(this, "hoverColor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rgb(255, 255, 255)
        });
        Object.defineProperty(this, "normalColor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: rgb(153, 153, 153)
        });
        Object.defineProperty(this, "soundedHover", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        const t = UITextures.get(textureKey);
        if (t) {
            this.width = StyleDimension.fromPixels(t.sw * scale);
            this.height = StyleDimension.fromPixels(t.sh * scale);
        }
        this.onMouseOver(() => { if (!this.soundedHover)
            UISfx.hover(); this.soundedHover = true; });
        this.onMouseOut(() => { this.soundedHover = false; });
    }
    setHoverColor(c) { this.hoverColor = c; }
    setNormalColor(c) { this.normalColor = c; }
    drawSelf(batch) {
        const t = UITextures.get(this.textureKey);
        if (!t)
            return;
        const color = this.isMouseHovering ? this.hoverColor : this.normalColor;
        batch.draw(t, this.getDimensions().x, this.getDimensions().y, { color, scale: this.scale });
    }
}
/** 九宫格切片图片元素（填满自身 dimensions） */
export class UISlicedImage extends UIElement {
    constructor(textureKey, slice, color = rgb(255, 255, 255)) {
        super();
        Object.defineProperty(this, "textureKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: textureKey
        });
        Object.defineProperty(this, "slice", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: slice
        });
        Object.defineProperty(this, "color", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: color
        });
    }
    drawSelf(batch) {
        const t = UITextures.get(this.textureKey);
        if (!t)
            return;
        const d = this.getDimensions();
        const { left, right, top, bottom } = this.slice;
        const L = left, R = right, T = top, B = bottom;
        const midSW = t.sw - L - R, midSH = t.sh - T - B;
        const w = Math.round(d.width), h = Math.round(d.height);
        const x = Math.round(d.x), y = Math.round(d.y);
        const midW = w - L - R, midH = h - T - B;
        const src = (sx, sy, sw, sh) => ({ img: t.img, sx: t.sx + sx, sy: t.sy + sy, sw, sh });
        const o = { color: this.color };
        if (L > 0 && T > 0)
            batch.draw(src(0, 0, L, T), x, y, o);
        if (R > 0 && T > 0)
            batch.draw(src(t.sw - R, 0, R, T), x + w - R, y, o);
        if (L > 0 && B > 0)
            batch.draw(src(0, t.sh - B, L, B), x, y + h - B, o);
        if (R > 0 && B > 0)
            batch.draw(src(t.sw - R, t.sh - B, R, B), x + w - R, y + h - B, o);
        if (midSW > 0 && midW > 0) {
            if (T > 0)
                batch.draw(src(L, 0, midSW, T), x + L, y, { ...o, scaleX: midW / midSW });
            if (B > 0)
                batch.draw(src(L, t.sh - B, midSW, B), x + L, y + h - B, { ...o, scaleX: midW / midSW });
        }
        if (midSH > 0 && midH > 0) {
            if (L > 0)
                batch.draw(src(0, T, L, midSH), x, y + T, { ...o, scaleY: midH / midSH });
            if (R > 0)
                batch.draw(src(t.sw - R, T, R, midSH), x + w - R, y + T, { ...o, scaleY: midH / midSH });
        }
        if (midSW > 0 && midSH > 0 && midW > 0 && midH > 0) {
            batch.draw(src(L, T, midSW, midSH), x + L, y + T, { ...o, scaleX: midW / midSW, scaleY: midH / midSH });
        }
    }
}
