// 移植自 Terarria1405/UI/UIElement.cs
// 三层盒模型：outerDimensions → +margin → dimensions(命中测试) → +padding → innerDimensions
import { StyleDimension } from './StyleDimension';
import { CalculatedStyle } from './CalculatedStyle';
import { RootDimension } from './RootDimension';
function clamp(v, min, max) {
    if (min > max)
        return v;
    return v < min ? min : v > max ? max : v;
}
let idCounter = 0;
export class UIElement {
    constructor() {
        Object.defineProperty(this, "maxWidth", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: StyleDimension.Fill
        });
        Object.defineProperty(this, "maxHeight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: StyleDimension.Fill
        });
        Object.defineProperty(this, "minWidth", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: StyleDimension.Empty
        });
        Object.defineProperty(this, "minHeight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: StyleDimension.Empty
        });
        Object.defineProperty(this, "top", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new StyleDimension()
        });
        Object.defineProperty(this, "left", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new StyleDimension()
        });
        Object.defineProperty(this, "width", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new StyleDimension()
        });
        Object.defineProperty(this, "height", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new StyleDimension()
        });
        Object.defineProperty(this, "ignoresMouseInteraction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "overflowHidden", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        /** 1.4.5.6 新增：命中后穿透，让下层元素接收指针（GetElementAt 继续向前找） */
        Object.defineProperty(this, "passThroughMouseInteraction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "paddingTop", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "paddingLeft", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "paddingRight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "paddingBottom", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "marginTop", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "marginLeft", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "marginRight", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "marginBottom", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "hAlign", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "vAlign", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "parent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "uniqueId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: idCounter++
        });
        /** 树上所属的 UIState（Append 时沿继承链回填） */
        Object.defineProperty(this, "uiState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "elements", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "_innerDimensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new CalculatedStyle()
        });
        Object.defineProperty(this, "_dimensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new CalculatedStyle()
        });
        Object.defineProperty(this, "_outerDimensions", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new CalculatedStyle()
        });
        Object.defineProperty(this, "_isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "isMouseHovering", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        // 事件（C# field-like event → 订阅集合）。onClick = 左键点击（1.4.5.6 OnLeftClick 的兼容别名）
        Object.defineProperty(this, "handlers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
    }
    onMouseDown(fn) { return this.on('mouseDown', fn); }
    onMouseUp(fn) { return this.on('mouseUp', fn); }
    onClick(fn) { return this.on('click', fn); }
    onLeftClick(fn) { return this.on('click', fn); }
    onRightClick(fn) { return this.on('rightClick', fn); }
    onRightMouseDown(fn) { return this.on('rightMouseDown', fn); }
    onRightMouseUp(fn) { return this.on('rightMouseUp', fn); }
    onRightDoubleClick(fn) { return this.on('rightDoubleClick', fn); }
    onMouseOver(fn) { return this.on('mouseOver', fn); }
    onMouseOut(fn) { return this.on('mouseOut', fn); }
    onDoubleClick(fn) { return this.on('doubleClick', fn); }
    onScrollWheel(fn) { return this.on('scrollWheel', fn); }
    onUpdate(fn) { return this.on('update', fn); }
    on(evt, fn) { var _a; ((_a = this.handlers)[evt] ?? (_a[evt] = new Set())).add(fn); return this; }
    emit(evt, ...args) { this.handlers[evt]?.forEach((fn) => fn(...args)); }
    get children() { return this.elements; }
    // ---- 绘制 ----
    drawSelf(_batch) { }
    drawChildren(batch) {
        for (const el of this.elements)
            el.draw(batch);
    }
    draw(batch) {
        this.drawSelf(batch);
        if (this.overflowHidden) {
            batch.pushClip(this.getInnerDimensions());
            this.drawChildren(batch);
            batch.popClip();
        }
        else {
            this.drawChildren(batch);
        }
    }
    // ---- 更新 ----
    update() {
        this.emit('update', this);
        for (const el of this.elements)
            el.update();
    }
    // ---- 布局（Recalculate 是布局核心，公式 1:1 移植） ----
    recalculate() {
        // 无父时取 UserInterface 全屏尺寸
        const parent = this.parent == null
            ? RootDimension.provider()
            : this.parent.getInnerDimensions();
        if (this.parent != null && isUIListLike(this.parent))
            parent.height = Number.MAX_VALUE;
        const outer = this.getDimensionsBasedOnParentDimensions(parent);
        this._outerDimensions = outer;
        let d = new CalculatedStyle(outer.x, outer.y, outer.width, outer.height);
        d.x += this.marginLeft;
        d.y += this.marginTop;
        d.width -= this.marginLeft + this.marginRight;
        d.height -= this.marginTop + this.marginBottom;
        this._dimensions = d;
        let i = new CalculatedStyle(d.x, d.y, d.width, d.height);
        i.x += this.paddingLeft;
        i.y += this.paddingTop;
        i.width -= this.paddingLeft + this.paddingRight;
        i.height -= this.paddingTop + this.paddingBottom;
        this._innerDimensions = i;
        this.recalculateChildren();
    }
    getDimensionsBasedOnParentDimensions(p) {
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
    recalculateChildren() {
        for (const el of this.elements)
            el.recalculate();
    }
    getInnerDimensions() { return this._innerDimensions; }
    getDimensions() { return this._dimensions; }
    getOuterDimensions() { return this._outerDimensions; }
    setPadding(pixels) {
        this.paddingTop = this.paddingLeft = this.paddingRight = this.paddingBottom = pixels;
    }
    copyStyle(el) {
        this.top = el.top;
        this.left = el.left;
        this.width = el.width;
        this.height = el.height;
        this.paddingTop = el.paddingTop;
        this.paddingLeft = el.paddingLeft;
        this.paddingRight = el.paddingRight;
        this.paddingBottom = el.paddingBottom;
        this.hAlign = el.hAlign;
        this.vAlign = el.vAlign;
        this.minWidth = el.minWidth;
        this.maxWidth = el.maxWidth;
        this.minHeight = el.minHeight;
        this.maxHeight = el.maxHeight;
        this.recalculate();
    }
    // ---- 树操作 ----
    append(element) {
        element.remove();
        element.parent = this;
        element.uiState = this.uiState;
        this.elements.push(element);
        element.recalculate();
        element.propagateState(element.uiState);
    }
    /** Append 时向子树回填 uiState */
    propagateState(state) {
        this.uiState = state;
        for (const el of this.elements)
            el.propagateState(state);
    }
    remove() {
        if (this.parent == null)
            return;
        this.parent.removeChild(this);
    }
    removeChild(child) {
        const i = this.elements.indexOf(child);
        if (i >= 0)
            this.elements.splice(i, 1);
        child.parent = null;
    }
    removeAllChildren() {
        for (const el of this.elements)
            el.parent = null;
        this.elements.length = 0;
    }
    // ---- 命中测试 ----
    /** 1.4.5.6 GetElementAt 语义：自后向前找，命中 passThroughMouseInteraction 的元素时记录但继续向前 */
    getElementAt(point) {
        let found = null;
        for (let i = this.elements.length - 1; i >= 0; i--) {
            const el = this.elements[i];
            if (el.ignoresMouseInteraction || !el.containsPoint(point))
                continue;
            if (el.passThroughMouseInteraction) {
                if (found == null)
                    found = el; // 记录但不中断，继续找更靠前的接收者
                continue;
            }
            found = el;
            break;
        }
        if (found != null)
            return found.getElementAt(point);
        if (this.ignoresMouseInteraction)
            return null;
        return this.containsPoint(point) ? this : null;
    }
    containsPoint(point) {
        const d = this._dimensions;
        return point.x > d.x && point.y > d.y && point.x < d.x + d.width && point.y < d.y + d.height;
    }
    // ---- 事件分发（自身 handler 后向 Parent 冒泡；左右键两套，1.4.5.6 Left*/Right* 拆分语义） ----
    mouseDown(evt) { this.emit('mouseDown', evt, this); this.parent?.mouseDown(evt); }
    mouseUp(evt) { this.emit('mouseUp', evt, this); this.parent?.mouseUp(evt); }
    click(evt) { this.emit('click', evt, this); this.parent?.click(evt); }
    doubleClick(evt) { this.emit('doubleClick', evt, this); this.parent?.doubleClick(evt); }
    rightMouseDown(evt) { this.emit('rightMouseDown', evt, this); this.parent?.rightMouseDown(evt); }
    rightMouseUp(evt) { this.emit('rightMouseUp', evt, this); this.parent?.rightMouseUp(evt); }
    rightClick(evt) { this.emit('rightClick', evt, this); this.parent?.rightClick(evt); }
    rightDoubleClick(evt) { this.emit('rightDoubleClick', evt, this); this.parent?.rightDoubleClick(evt); }
    mouseOver(evt) { this.isMouseHovering = true; this.emit('mouseOver', evt, this); this.parent?.mouseOver(evt); }
    mouseOut(evt) { this.isMouseHovering = false; this.emit('mouseOut', evt, this); this.parent?.mouseOut(evt); }
    scrollWheel(evt) { this.emit('scrollWheel', evt, this); this.parent?.scrollWheel(evt); }
    // ---- 生命周期 ----
    activate() {
        if (!this._isInitialized) {
            this.onInitialize();
            this._isInitialized = true;
        }
        this.onActivate();
        for (const el of this.elements)
            el.activate();
    }
    deactivate() {
        this.onDeactivate();
        for (const el of this.elements)
            el.deactivate();
    }
    onInitialize() { }
    onActivate() { }
    onDeactivate() { }
}
export function isUIListLike(el) {
    return !!el && el.isUIList === true;
}
