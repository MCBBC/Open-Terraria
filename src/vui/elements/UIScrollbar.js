// 移植自 Terarria1405/GameContent/UI/Elements/UIScrollbar.cs
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import { UITextures } from '../assets/UITextures';
import { rgb } from '../draw/UISpriteBatch';
import { UserInterface } from '../core/UserInterface';
function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
export class UIScrollbar extends UIElement {
    constructor() {
        super();
        Object.defineProperty(this, "viewSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1
        });
        Object.defineProperty(this, "maxViewSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 20
        });
        Object.defineProperty(this, "_viewPosition", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "isDragging", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "isHoveringOverHandle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "dragYOffset", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.width = StyleDimension.fromPixels(20);
        this.maxWidth = StyleDimension.fromPixels(20);
        this.paddingTop = 5;
        this.paddingBottom = 5;
    }
    get viewPosition() { return this._viewPosition; }
    set viewPosition(v) { this._viewPosition = clamp(v, 0, Math.max(0, this.maxViewSize - this.viewSize)); }
    get canScroll() { return this.maxViewSize !== this.viewSize; }
    setView(viewSize, maxViewSize) {
        viewSize = clamp(viewSize, 0, maxViewSize);
        this._viewPosition = clamp(this._viewPosition, 0, Math.max(0, maxViewSize - viewSize));
        this.viewSize = viewSize;
        this.maxViewSize = maxViewSize;
    }
    getValue() { return this._viewPosition; }
    getHandleRectangle() {
        const inner = this.getInnerDimensions();
        if (this.maxViewSize === 0 && this.viewSize === 0) {
            this.viewSize = 1;
            this.maxViewSize = 1;
        }
        const ratio = this.viewSize / this.maxViewSize;
        return {
            x: Math.round(inner.x),
            y: Math.round(inner.y + inner.height * (this._viewPosition / this.maxViewSize)) - 3,
            w: 20,
            h: Math.round(inner.height * ratio) + 7,
        };
    }
    drawBar(batch, texKey, x, y, w, h, color) {
        const tex = UITextures.get(texKey);
        if (!tex)
            return;
        batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy, sw: tex.sw, sh: 6 }, x, y - 6, { color, scaleX: w / tex.sw, scaleY: 1 });
        batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy + 6, sw: tex.sw, sh: 4 }, x, y, { color, scaleX: w / tex.sw, scaleY: h / 4 });
        batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy + tex.sh - 6, sw: tex.sw, sh: 6 }, x, y + h, { color, scaleX: w / tex.sw, scaleY: 1 });
    }
    drawSelf(batch) {
        const d = this.getDimensions();
        const inner = this.getInnerDimensions();
        if (this.isDragging) {
            const m = UserInterface.activeInstance.mousePosition;
            this._viewPosition = clamp((m.y - inner.y - this.dragYOffset) / inner.height * this.maxViewSize, 0, Math.max(0, this.maxViewSize - this.viewSize));
        }
        const handle = this.getHandleRectangle();
        const m = UserInterface.activeInstance?.mousePosition ?? { x: 0, y: 0 };
        this.isHoveringOverHandle =
            m.x >= handle.x && m.x < handle.x + handle.w && m.y >= handle.y && m.y < handle.y + handle.h;
        this.drawBar(batch, 'UI_Scrollbar', Math.round(d.x), Math.round(d.y), Math.round(d.width), Math.round(d.height), rgb(255, 255, 255));
        this.drawBar(batch, 'UI_ScrollbarInner', handle.x, handle.y, handle.w, handle.h, { r: 255, g: 255, b: 255, a: Math.round(255 * (this.isDragging || this.isHoveringOverHandle ? 1 : 0.85)) });
    }
    mouseDown(evt) {
        super.mouseDown(evt);
        if (evt.target !== this)
            return;
        const handle = this.getHandleRectangle();
        const p = evt.mousePosition;
        if (p.x >= handle.x && p.x < handle.x + handle.w && p.y >= handle.y && p.y < handle.y + handle.h) {
            this.isDragging = true;
            this.dragYOffset = p.y - handle.y;
        }
        else {
            const inner = this.getInnerDimensions();
            this._viewPosition = clamp((UserInterface.activeInstance.mousePosition.y - inner.y - (handle.h >> 1)) / inner.height * this.maxViewSize, 0, Math.max(0, this.maxViewSize - this.viewSize));
        }
    }
    mouseUp(evt) {
        super.mouseUp(evt);
        this.isDragging = false;
    }
}
