import { CalculatedStyle } from './CalculatedStyle';
import { UIMouseEvent, UIScrollWheelEvent } from './UIMouseEvent';
import { UIScale } from '../draw/UIScale';
import { RootDimension } from './RootDimension';
const DOUBLE_CLICK_TIME = 500; // ms
const STATE_CHANGE_CLICK_DISABLE_TIME = 200; // ms
const MAX_HISTORY_SIZE = 32;
const HISTORY_PRUNE_SIZE = 4;
/** 1.4.5.6 InputPointerCache：左右键各一套独立的按下/双击状态 */
class InputPointerCache {
    constructor() {
        Object.defineProperty(this, "wasDown", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "lastDown", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "lastClicked", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "lastTimeDown", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
    }
}
export class UserInterface {
    constructor() {
        Object.defineProperty(this, "mousePosition", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: { x: 0, y: 0 }
        });
        Object.defineProperty(this, "isVisible", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "history", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "lastElementHover", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "left", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new InputPointerCache()
        });
        Object.defineProperty(this, "right", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new InputPointerCache()
        });
        Object.defineProperty(this, "clickDisabledTimeRemaining", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "isStateDirty", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "currentState", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        /** 累积时钟（ms），由外部每帧喂入 dt */
        Object.defineProperty(this, "clock", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        UserInterface.activeInstance = this;
        RootDimension.provider = () => this.getDimensions();
        UIScale.onResize = () => this.recalculate();
    }
    get current() { return this.currentState; }
    resetLasts() {
        this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
        this.lastElementHover = null;
        this.left = new InputPointerCache();
        this.right = new InputPointerCache();
    }
    use() {
        if (UserInterface.activeInstance !== this) {
            UserInterface.activeInstance = this;
            this.recalculate();
        }
    }
    resetState() {
        this.updateMousePosition();
        this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
        this.lastElementHover = null;
        this.left = new InputPointerCache();
        this.right = new InputPointerCache();
        this.clickDisabledTimeRemaining = Math.max(this.clickDisabledTimeRemaining, STATE_CHANGE_CLICK_DISABLE_TIME);
    }
    updateMousePosition() {
        this.mousePosition.x = UIScale.mouseX;
        this.mousePosition.y = UIScale.mouseY;
    }
    /** 单个指针的点击处理（1.4.5.6 HandleClick 语义：抑制期整体跳过且不更新 WasDown） */
    handlePointer(cache, isDown, disabled, evtName) {
        const target = this.lastElementHover;
        if (disabled)
            return; // 抑制期：连 WasDown 都不更新（1456:209-213）
        if (isDown && !cache.wasDown && target != null) {
            cache.lastDown = target;
            const evt = new UIMouseEvent(target, this.mousePosition);
            target[evtName.down](evt);
            if (cache.lastClicked === target) {
                if (this.clock - cache.lastTimeDown < DOUBLE_CLICK_TIME) {
                    target[evtName.dbl](evt);
                    cache.lastClicked = null;
                }
            }
            cache.lastTimeDown = this.clock;
        }
        else if (!isDown && cache.wasDown && cache.lastDown != null) {
            const down = cache.lastDown;
            if (down.containsPoint(this.mousePosition)) {
                down[evtName.click](new UIMouseEvent(down, this.mousePosition));
                cache.lastClicked = cache.lastDown;
            }
            down[evtName.up](new UIMouseEvent(down, this.mousePosition));
            cache.lastDown = null;
        }
        cache.wasDown = isDown;
    }
    /** @param mouseLeft/mouseRight 当前帧左右键是否按下 @param hasFocus 窗口聚焦 */
    update(dtMs, mouseLeft, mouseRight, hasFocus, wheelDelta) {
        if (this.currentState == null)
            return;
        this.clock += dtMs;
        this.updateMousePosition();
        const target = hasFocus ? this.currentState.getElementAt(this.mousePosition) : null;
        this.clickDisabledTimeRemaining = Math.max(0, this.clickDisabledTimeRemaining - dtMs);
        const disabled = this.clickDisabledTimeRemaining > 0;
        if (target !== this.lastElementHover) {
            this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
            target?.mouseOver(new UIMouseEvent(target, this.mousePosition));
            this.lastElementHover = target;
        }
        this.handlePointer(this.left, mouseLeft && hasFocus, disabled, { down: 'mouseDown', up: 'mouseUp', click: 'click', dbl: 'doubleClick' });
        this.handlePointer(this.right, mouseRight && hasFocus, disabled, { down: 'rightMouseDown', up: 'rightMouseUp', click: 'rightClick', dbl: 'rightDoubleClick' });
        if (wheelDelta !== 0) {
            target?.scrollWheel(new UIScrollWheelEvent(target, this.mousePosition, wheelDelta));
        }
        if (this.currentState == null)
            return;
        this.currentState.update();
    }
    draw(batch) {
        this.use();
        if (this.currentState == null)
            return;
        if (this.isStateDirty) {
            this.currentState.recalculate();
            this.isStateDirty = false;
        }
        this.currentState.draw(batch);
    }
    setState(state) {
        if (state === this.currentState)
            return;
        if (state != null)
            this.addToHistory(state);
        if (this.currentState != null) {
            this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
            this.currentState.deactivate();
        }
        this.currentState = state;
        this.resetState();
        if (state == null)
            return;
        this.isStateDirty = true;
        state.activate();
        state.recalculate();
    }
    goBack() {
        if (this.history.length < 2)
            return;
        const state = this.history[this.history.length - 2];
        this.history.splice(this.history.length - 2, 2);
        this.setState(state);
    }
    addToHistory(state) {
        this.history.push(state);
        if (this.history.length > MAX_HISTORY_SIZE)
            this.history.splice(0, HISTORY_PRUNE_SIZE);
    }
    recalculate() {
        this.currentState?.recalculate();
    }
    getDimensions() {
        const { logicalW, logicalH } = UIScale;
        return new CalculatedStyle(0, 0, logicalW, logicalH);
    }
    /** 供 UIElement.recalculate() 回溯的当前实例尺寸 */
    static dimensionsOf() {
        return UserInterface.activeInstance?.getDimensions() ?? new CalculatedStyle(0, 0, UIScale.logicalW, UIScale.logicalH);
    }
}
Object.defineProperty(UserInterface, "activeInstance", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: null
});
