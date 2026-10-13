// mod UI 物品槽(★第五批,2026-10-13)。vui UIElement 子类:
// 渲染=atlasIconForKey 物品图标+PixelText 堆叠数;交互=onClick/onRightClick;
// 数据=mod 侧 getItem 回调(返回 {key,stack,prefix}|null)。
// tML 对应=ItemSlot.Draw wrapper(手写,非 vanilla UISlot)。
import { UIElement } from '../core/UIElement';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { StyleDimension } from '../core/StyleDimension';
import { atlasIconForKey, type SpriteAtlas, type DrawRect } from '../../assets/SpriteAtlas';

export interface UISlotItem { key: string; stack: number; prefix?: number }
export interface UISlotOpts {
  getItem(): UISlotItem | null;
  onLeftClick?: () => void;
  onRightClick?: () => void;
  bgColor?: string;
}

let atlasRef: SpriteAtlas | null = null;
export function setUISlotAtlas(a: SpriteAtlas | null): void { atlasRef = a; }

export class UISlot extends UIElement {
  private readonly opts: UISlotOpts;
  constructor(opts: UISlotOpts) {
    super();
    this.opts = opts;
    this.width = StyleDimension.fromPixels(40);
    this.height = StyleDimension.fromPixels(40);
    this.onLeftClick(() => this.opts.onLeftClick?.());
    this.onRightClick(() => this.opts.onRightClick?.());
  }
  protected override drawSelf(batch: UISpriteBatch): void {
    const d = this.getInnerDimensions();
    const ctx = batch.ctx;
    const item = this.opts.getItem();
    ctx.fillStyle = this.opts.bgColor ?? '#2A2A2A';
    ctx.fillRect(d.x, d.y, d.width, d.height);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(d.x + 0.5, d.y + 0.5, d.width - 1, d.height - 1);
    if (!item || !atlasRef) return;
    const rect: DrawRect | null = atlasIconForKey(atlasRef, item.key);
    if (rect) {
      batch.draw(rect, d.x + d.width / 2, d.y + d.height / 2, {
        scale: Math.min(d.width / rect.sw, d.height / rect.sh) * 0.8,
        originX: rect.sw / 2, originY: rect.sh / 2,
      });
    }
    if (item.stack > 1) {
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px monospace';
      ctx.fillText(String(item.stack), d.x + d.width - 14, d.y + d.height - 4);
    }
  }
}

