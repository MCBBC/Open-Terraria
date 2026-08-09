// 移植自 Terarria1405/UI/UIElement.cs
// 三层盒模型：outerDimensions → +margin → dimensions(命中测试) → +padding → innerDimensions
import { StyleDimension } from './StyleDimension';
import { CalculatedStyle } from './CalculatedStyle';
import { UIMouseEvent, UIScrollWheelEvent } from './UIMouseEvent';
import type { UIState } from './UIState';
import { RootDimension } from './RootDimension';
import type { UISpriteBatch } from '../draw/UISpriteBatch';

function clamp(v: number, min: number, max: number): number {
  if (min > max) return v;
  return v < min ? min : v > max ? max : v;
}

type MouseHandler = (evt: UIMouseEvent, listeningElement: UIElement) => void;
type WheelHandler = (evt: UIScrollWheelEvent, listeningElement: UIElement) => void;
type UpdateHandler = (el: UIElement) => void;
// 1.4.5.6 语义：mouse*（= 左键）/right* 成对拆分；mouseOver/mouseOut/scrollWheel/update 与按键无关
type EvtName = 'mouseDown' | 'mouseUp' | 'click' | 'mouseOver' | 'mouseOut' | 'doubleClick' | 'scrollWheel' | 'update'
  | 'rightMouseDown' | 'rightMouseUp' | 'rightClick' | 'rightDoubleClick';
type AnyHandler = MouseHandler | WheelHandler | UpdateHandler;

let idCounter = 0;

export class UIElement {
  maxWidth = StyleDimension.Fill;
  maxHeight = StyleDimension.Fill;
  minWidth = StyleDimension.Empty;
  minHeight = StyleDimension.Empty;
  top = new StyleDimension();
  left = new StyleDimension();
  width = new StyleDimension();
  height = new StyleDimension();

  ignoresMouseInteraction = false;
  overflowHidden = false;
  /** 1.4.5.6 新增：命中后穿透，让下层元素接收指针（GetElementAt 继续向前找） */
  passThroughMouseInteraction = false;

  paddingTop = 0; paddingLeft = 0; paddingRight = 0; paddingBottom = 0;
  marginTop = 0; marginLeft = 0; marginRight = 0; marginBottom = 0;
  hAlign = 0; vAlign = 0;

  parent: UIElement | null = null;
  readonly uniqueId = idCounter++;
  /** 树上所属的 UIState（Append 时沿继承链回填） */
  uiState: UIState | null = null;

  protected elements: UIElement[] = [];
  private _innerDimensions = new CalculatedStyle();
  private _dimensions = new CalculatedStyle();
  private _outerDimensions = new CalculatedStyle();
  private _isInitialized = false;

  isMouseHovering = false;

  // 事件（C# field-like event → 订阅集合）。onClick = 左键点击（1.4.5.6 OnLeftClick 的兼容别名）
  private handlers: Partial<Record<EvtName, Set<AnyHandler>>> = {};
  onMouseDown(fn: MouseHandler) { return this.on('mouseDown', fn); }
  onMouseUp(fn: MouseHandler) { return this.on('mouseUp', fn); }
  onClick(fn: MouseHandler) { return this.on('click', fn); }
  onLeftClick(fn: MouseHandler) { return this.on('click', fn); }
  onRightClick(fn: MouseHandler) { return this.on('rightClick', fn); }
  onRightMouseDown(fn: MouseHandler) { return this.on('rightMouseDown', fn); }
  onRightMouseUp(fn: MouseHandler) { return this.on('rightMouseUp', fn); }
  onRightDoubleClick(fn: MouseHandler) { return this.on('rightDoubleClick', fn); }
  onMouseOver(fn: MouseHandler) { return this.on('mouseOver', fn); }
  onMouseOut(fn: MouseHandler) { return this.on('mouseOut', fn); }
  onDoubleClick(fn: MouseHandler) { return this.on('doubleClick', fn); }
  onScrollWheel(fn: WheelHandler) { return this.on('scrollWheel', fn); }
  onUpdate(fn: UpdateHandler) { return this.on('update', fn); }
  private on(evt: EvtName, fn: AnyHandler) { (this.handlers[evt] ??= new Set()).add(fn); return this; }
  private emit(evt: EvtName, ...args: unknown[]) { this.handlers[evt]?.forEach((fn) => (fn as (...a: unknown[]) => void)(...args)); }

  get children(): readonly UIElement[] { return this.elements; }

  // ---- 绘制 ----

  protected drawSelf(_batch: UISpriteBatch): void {}

  protected drawChildren(batch: UISpriteBatch): void {
    for (const el of this.elements) el.draw(batch);
  }

  draw(batch: UISpriteBatch): void {
    this.drawSelf(batch);
    if (this.overflowHidden) {
      batch.pushClip(this.getInnerDimensions());
      this.drawChildren(batch);
      batch.popClip();
    } else {
      this.drawChildren(batch);
    }
  }

  // ---- 更新 ----

  update(): void {
    this.emit('update', this);
    for (const el of this.elements) el.update();
  }

  // ---- 布局（Recalculate 是布局核心，公式 1:1 移植） ----

  recalculate(): void {
    // 无父时取 UserInterface 全屏尺寸
    const parent = this.parent == null
      ? RootDimension.provider()
      : this.parent.getInnerDimensions();
    if (this.parent != null && isUIListLike(this.parent)) parent.height = Number.MAX_VALUE;
    const outer = this.getDimensionsBasedOnParentDimensions(parent);
    this._outerDimensions = outer;
    let d = new CalculatedStyle(outer.x, outer.y, outer.width, outer.height);
    d.x += this.marginLeft; d.y += this.marginTop;
    d.width -= this.marginLeft + this.marginRight;
    d.height -= this.marginTop + this.marginBottom;
    this._dimensions = d;
    let i = new CalculatedStyle(d.x, d.y, d.width, d.height);
    i.x += this.paddingLeft; i.y += this.paddingTop;
    i.width -= this.paddingLeft + this.paddingRight;
    i.height -= this.paddingTop + this.paddingBottom;
    this._innerDimensions = i;
    this.recalculateChildren();
  }

  private getDimensionsBasedOnParentDimensions(p: CalculatedStyle): CalculatedStyle {
    const c = new CalculatedStyle();
    c.x = this.left.getValue(p.width) + p.x;
    c.y = this.top.getValue(p.height) + p.y;
    const minW = this.minWidth.getValue(p.width);
    const maxW = this.maxWidth.getValue(p.width);
    const minH = this.minHeight.getValue(p.height);
    const maxH = this.maxHeight.getValue(p.height);
    c.width = clamp(this.width.getValue(p.width), minW, maxW);
    c.height = clamp(this.height.getValue(p.height), minH, maxH);
    c.width += this.marginLeft + this.marginRight;
    c.height += this.marginTop + this.marginBottom;
    c.x += p.width * this.hAlign - c.width * this.hAlign;
    c.y += p.height * this.vAlign - c.height * this.vAlign;
    return c;
  }

  recalculateChildren(): void {
    for (const el of this.elements) el.recalculate();
  }

  getInnerDimensions(): CalculatedStyle { return this._innerDimensions; }
  getDimensions(): CalculatedStyle { return this._dimensions; }
  getOuterDimensions(): CalculatedStyle { return this._outerDimensions; }

  setPadding(pixels: number) {
    this.paddingTop = this.paddingLeft = this.paddingRight = this.paddingBottom = pixels;
  }

  copyStyle(el: UIElement) {
    this.top = el.top; this.left = el.left; this.width = el.width; this.height = el.height;
    this.paddingTop = el.paddingTop; this.paddingLeft = el.paddingLeft;
    this.paddingRight = el.paddingRight; this.paddingBottom = el.paddingBottom;
    this.hAlign = el.hAlign; this.vAlign = el.vAlign;
    this.minWidth = el.minWidth; this.maxWidth = el.maxWidth;
    this.minHeight = el.minHeight; this.maxHeight = el.maxHeight;
    this.recalculate();
  }

  // ---- 树操作 ----

  append(element: UIElement) {
    element.remove();
    element.parent = this;
    element.uiState = this.uiState;
    this.elements.push(element);
    element.recalculate();
    element.propagateState(element.uiState);
  }

  /** Append 时向子树回填 uiState */
  private propagateState(state: UIState | null) {
    this.uiState = state;
    for (const el of this.elements) el.propagateState(state);
  }

  remove() {
    if (this.parent == null) return;
    this.parent.removeChild(this);
  }

  removeChild(child: UIElement) {
    const i = this.elements.indexOf(child);
    if (i >= 0) this.elements.splice(i, 1);
    child.parent = null;
  }

  removeAllChildren() {
    for (const el of this.elements) el.parent = null;
    this.elements.length = 0;
  }

  // ---- 命中测试 ----

  /** 1.4.5.6 GetElementAt 语义：自后向前找，命中 passThroughMouseInteraction 的元素时记录但继续向前 */
  getElementAt(point: { x: number; y: number }): UIElement | null {
    let found: UIElement | null = null;
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (el.ignoresMouseInteraction || !el.containsPoint(point)) continue;
      if (el.passThroughMouseInteraction) {
        if (found == null) found = el; // 记录但不中断，继续找更靠前的接收者
        continue;
      }
      found = el;
      break;
    }
    if (found != null) return found.getElementAt(point);
    if (this.ignoresMouseInteraction) return null;
    return this.containsPoint(point) ? this : null;
  }

  containsPoint(point: { x: number; y: number }): boolean {
    const d = this._dimensions;
    return point.x > d.x && point.y > d.y && point.x < d.x + d.width && point.y < d.y + d.height;
  }

  // ---- 事件分发（自身 handler 后向 Parent 冒泡；左右键两套，1.4.5.6 Left*/Right* 拆分语义） ----

  mouseDown(evt: UIMouseEvent) { this.emit('mouseDown', evt, this); this.parent?.mouseDown(evt); }
  mouseUp(evt: UIMouseEvent) { this.emit('mouseUp', evt, this); this.parent?.mouseUp(evt); }
  click(evt: UIMouseEvent) { this.emit('click', evt, this); this.parent?.click(evt); }
  doubleClick(evt: UIMouseEvent) { this.emit('doubleClick', evt, this); this.parent?.doubleClick(evt); }
  rightMouseDown(evt: UIMouseEvent) { this.emit('rightMouseDown', evt, this); this.parent?.rightMouseDown(evt); }
  rightMouseUp(evt: UIMouseEvent) { this.emit('rightMouseUp', evt, this); this.parent?.rightMouseUp(evt); }
  rightClick(evt: UIMouseEvent) { this.emit('rightClick', evt, this); this.parent?.rightClick(evt); }
  rightDoubleClick(evt: UIMouseEvent) { this.emit('rightDoubleClick', evt, this); this.parent?.rightDoubleClick(evt); }
  mouseOver(evt: UIMouseEvent) { this.isMouseHovering = true; this.emit('mouseOver', evt, this); this.parent?.mouseOver(evt); }
  mouseOut(evt: UIMouseEvent) { this.isMouseHovering = false; this.emit('mouseOut', evt, this); this.parent?.mouseOut(evt); }
  scrollWheel(evt: UIScrollWheelEvent) { this.emit('scrollWheel', evt, this); this.parent?.scrollWheel(evt); }

  // ---- 生命周期 ----

  activate() {
    if (!this._isInitialized) { this.onInitialize(); this._isInitialized = true; }
    this.onActivate();
    for (const el of this.elements) el.activate();
  }

  deactivate() {
    this.onDeactivate();
    for (const el of this.elements) el.deactivate();
  }

  onInitialize(): void {}
  onActivate(): void {}
  onDeactivate(): void {}
}

/** UIList 标记（子元素布局时父高度视为 Infinity，UIElement.cs:221-222 的 is UIList 判定） */
export interface UIListLike { readonly isUIList?: boolean }
export function isUIListLike(el: UIElement | null): el is UIElement & UIListLike {
  return !!el && (el as UIElement & UIListLike).isUIList === true;
}
