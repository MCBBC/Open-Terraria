// 移植自 Terarria1405/GameContent/UI/Elements/UIScrollbar.cs
import { UIElement } from '../core/UIElement';
import { StyleDimension } from '../core/StyleDimension';
import { UITextures } from '../assets/UITextures';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { rgb, type Color } from '../draw/UISpriteBatch';
import { UIMouseEvent } from '../core/UIMouseEvent';
import { UserInterface } from '../core/UserInterface';

function clamp(v: number, min: number, max: number) { return v < min ? min : v > max ? max : v; }

export class UIScrollbar extends UIElement {
  protected viewSize = 1;
  protected maxViewSize = 20;
  protected _viewPosition = 0;
  protected isDragging = false;
  protected isHoveringOverHandle = false;
  protected dragYOffset = 0;

  constructor() {
    super();
    this.width = StyleDimension.fromPixels(20);
    this.maxWidth = StyleDimension.fromPixels(20);
    this.paddingTop = 5;
    this.paddingBottom = 5;
  }

  get viewPosition(): number { return this._viewPosition; }
  set viewPosition(v: number) { this._viewPosition = clamp(v, 0, Math.max(0, this.maxViewSize - this.viewSize)); }
  get canScroll(): boolean { return this.maxViewSize !== this.viewSize; }

  setView(viewSize: number, maxViewSize: number) {
    viewSize = clamp(viewSize, 0, maxViewSize);
    this._viewPosition = clamp(this._viewPosition, 0, Math.max(0, maxViewSize - viewSize));
    this.viewSize = viewSize;
    this.maxViewSize = maxViewSize;
  }

  getValue(): number { return this._viewPosition; }

  protected getHandleRectangle(): { x: number; y: number; w: number; h: number } {
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

  protected drawBar(batch: UISpriteBatch, texKey: string, x: number, y: number, w: number, h: number, color: Color) {
    const tex = UITextures.get(texKey);
    if (!tex) return;
    batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy, sw: tex.sw, sh: 6 }, x, y - 6, { color, scaleX: w / tex.sw, scaleY: 1 });
    batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy + 6, sw: tex.sw, sh: 4 }, x, y, { color, scaleX: w / tex.sw, scaleY: h / 4 });
    batch.draw({ img: tex.img, sx: tex.sx, sy: tex.sy + tex.sh - 6, sw: tex.sw, sh: 6 }, x, y + h, { color, scaleX: w / tex.sw, scaleY: 1 });
  }

  protected drawSelf(batch: UISpriteBatch): void {
    const d = this.getDimensions();
    const inner = this.getInnerDimensions();
    if (this.isDragging) {
      const m = UserInterface.activeInstance!.mousePosition;
      this._viewPosition = clamp(
        (m.y - inner.y - this.dragYOffset) / inner.height * this.maxViewSize,
        0, Math.max(0, this.maxViewSize - this.viewSize),
      );
    }
    const handle = this.getHandleRectangle();
    const m = UserInterface.activeInstance?.mousePosition ?? { x: 0, y: 0 };
    this.isHoveringOverHandle =
      m.x >= handle.x && m.x < handle.x + handle.w && m.y >= handle.y && m.y < handle.y + handle.h;
    this.drawBar(batch, 'UI_Scrollbar', Math.round(d.x), Math.round(d.y), Math.round(d.width), Math.round(d.height), rgb(255, 255, 255));
    this.drawBar(batch, 'UI_ScrollbarInner', handle.x, handle.y, handle.w, handle.h,
      { r: 255, g: 255, b: 255, a: Math.round(255 * (this.isDragging || this.isHoveringOverHandle ? 1 : 0.85)) });
  }

  mouseDown(evt: UIMouseEvent): void {
    super.mouseDown(evt);
    if (evt.target !== this) return;
    const handle = this.getHandleRectangle();
    const p = evt.mousePosition;
    if (p.x >= handle.x && p.x < handle.x + handle.w && p.y >= handle.y && p.y < handle.y + handle.h) {
      this.isDragging = true;
      this.dragYOffset = p.y - handle.y;
    } else {
      const inner = this.getInnerDimensions();
      this._viewPosition = clamp(
        (UserInterface.activeInstance!.mousePosition.y - inner.y - (handle.h >> 1)) / inner.height * this.maxViewSize,
        0, Math.max(0, this.maxViewSize - this.viewSize),
      );
    }
  }

  mouseUp(evt: UIMouseEvent): void {
    super.mouseUp(evt);
    this.isDragging = false;
  }
}
