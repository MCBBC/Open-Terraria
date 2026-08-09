// 移植自 Terarria1405/GameContent/UI/Elements/UIList.cs
// 结构：UIList(overflowHidden) → innerList（视口裁剪 + 滚动偏移）→ items。
// 子元素 Recalculate 时父高度视为 Infinity（UIElement.cs:221-222 特例，isUIList 标记）。
import { UIElement } from '../core/UIElement';
import type { UISpriteBatch } from '../draw/UISpriteBatch';
import { StyleDimension } from '../core/StyleDimension';
import { UIMouseEvent, UIScrollWheelEvent } from '../core/UIMouseEvent';
import type { UIScrollbar } from './UIScrollbar';

class UIInnerList extends UIElement {
  containsPoint(): boolean { return true; } // 命中测试由外层 UIList 决定

  protected drawChildren(batch: UISpriteBatch): void {
    // 视口剔除：只画与 UIList dimensions 相交的项
    const parent = this.parent!;
    const pd = parent.getDimensions();
    for (const el of this.elements) {
      const d = el.getDimensions();
      const intersects = d.x < pd.x + pd.width && d.x + d.width > pd.x &&
        d.y < pd.y + pd.height && d.y + d.height > pd.y;
      if (intersects) el.draw(batch);
    }
  }
}

export class UIList extends UIElement {
  readonly isUIList = true;
  protected items: UIElement[] = [];
  protected innerList = new UIInnerList();
  listPadding = 5;
  protected scrollbar: UIScrollbar | null = null;
  protected innerListHeight = 0;
  manualSortMethod: ((items: UIElement[]) => void) | null = null;

  get count(): number { return this.items.length; }

  constructor() {
    super();
    this.innerList.width = StyleDimension.Fill;
    this.innerList.height = StyleDimension.Fill;
    this.overflowHidden = true;
    this.append(this.innerList);
  }

  getTotalHeight(): number { return this.innerListHeight; }

  add(item: UIElement) {
    this.items.push(item);
    this.innerList.append(item);
    this.updateOrder();
    this.innerList.recalculate();
  }

  /** 移除列表项（vanilla 的 Remove(item)；与 UIElement.remove() 无参签名区分） */
  removeItem(item: UIElement): boolean {
    this.innerList.removeChild(item);
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    this.updateOrder();
    return i >= 0;
  }

  clear() {
    this.innerList.removeAllChildren();
    this.items.length = 0;
    this.innerListHeight = 0;
    this.updateScrollbar();
  }

  recalculate(): void {
    super.recalculate();
    this.updateScrollbar();
  }

  scrollWheel(evt: UIScrollWheelEvent): void {
    super.scrollWheel(evt);
    if (this.scrollbar) this.scrollbar.viewPosition -= evt.scrollWheelValue;
  }

  recalculateChildren(): void {
    super.recalculateChildren();
    let y = 0;
    for (let i = 0; i < this.items.length; i++) {
      const pad = this.items.length === 1 ? 0 : this.listPadding;
      this.items[i].top = StyleDimension.fromPixels(y);
      this.items[i].recalculate();
      y += this.items[i].getOuterDimensions().height + pad;
    }
    this.innerListHeight = y;
  }

  protected updateScrollbar() {
    this.scrollbar?.setView(this.getInnerDimensions().height, this.innerListHeight);
  }

  setScrollbar(sb: UIScrollbar) {
    this.scrollbar = sb;
    this.updateScrollbar();
  }

  updateOrder() {
    this.manualSortMethod?.(this.items);
    this.updateScrollbar();
  }

  protected drawSelf(_batch: UISpriteBatch): void {
    if (this.scrollbar) this.innerList.top = StyleDimension.fromPixels(-this.scrollbar.getValue());
    this.recalculate();
  }
}
