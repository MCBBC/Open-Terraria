// 移植自 Terarria1405/UI/UserInterface.cs
// Update 语义（UserInterface.cs:91-146）：
//   每帧命中 GetElementAt → hover 切换 MouseOut/MouseOver →
//   按下/抬起配对产生 MouseDown/Click（Click 要求抬起仍在同元素内）→
//   双击 500ms → 状态切换后 200ms 点击抑制 → 滚轮分发
import { UIElement } from './UIElement';
import type { UIState } from './UIState';
import { CalculatedStyle } from './CalculatedStyle';
import { UIMouseEvent, UIScrollWheelEvent } from './UIMouseEvent';
import { UIScale } from '../draw/UIScale';
import { RootDimension } from './RootDimension';

const DOUBLE_CLICK_TIME = 500;           // ms
const STATE_CHANGE_CLICK_DISABLE_TIME = 200; // ms
const MAX_HISTORY_SIZE = 32;
const HISTORY_PRUNE_SIZE = 4;

export class UserInterface {
  static activeInstance: UserInterface | null = null;

  mousePosition = { x: 0, y: 0 };
  isVisible = false;

  private history: UIState[] = [];
  private wasMouseDown = false;
  private lastElementHover: UIElement | null = null;
  private lastElementDown: UIElement | null = null;
  private lastElementClicked: UIElement | null = null;
  private lastMouseDownTime = 0;         // 累积时钟 ms（不用 Date.now，帧暂停安全）
  private clickDisabledTimeRemaining = 0;
  private isStateDirty = false;
  private currentState: UIState | null = null;
  /** 累积时钟（ms），由外部每帧喂入 dt */
  clock = 0;

  constructor() {
    UserInterface.activeInstance = this;
    RootDimension.provider = () => this.getDimensions();
    UIScale.onResize = () => this.recalculate();
  }

  get current(): UIState | null { return this.currentState; }

  resetLasts() {
    this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
    this.lastElementHover = null;
    this.lastElementDown = null;
    this.lastElementClicked = null;
  }

  use() {
    if (UserInterface.activeInstance !== this) {
      UserInterface.activeInstance = this;
      this.recalculate();
    }
  }

  private resetState() {
    this.updateMousePosition();
    this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
    this.lastElementHover = null;
    this.lastElementDown = null;
    this.lastElementClicked = null;
    this.lastMouseDownTime = 0;
    this.clickDisabledTimeRemaining = Math.max(this.clickDisabledTimeRemaining, STATE_CHANGE_CLICK_DISABLE_TIME);
  }

  private updateMousePosition() {
    this.mousePosition.x = UIScale.mouseX;
    this.mousePosition.y = UIScale.mouseY;
  }

  /** @param mouseLeft 当前帧鼠标左键是否按下 @param hasFocus 窗口聚焦 */
  update(dtMs: number, mouseLeft: boolean, hasFocus: boolean, wheelDelta: number) {
    if (this.currentState == null) return;
    this.clock += dtMs;
    this.updateMousePosition();
    const flag1 = mouseLeft && hasFocus;
    const target = hasFocus ? this.currentState.getElementAt(this.mousePosition) : null;
    this.clickDisabledTimeRemaining = Math.max(0, this.clickDisabledTimeRemaining - dtMs);
    const disabled = this.clickDisabledTimeRemaining > 0;
    if (target !== this.lastElementHover) {
      this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
      target?.mouseOver(new UIMouseEvent(target, this.mousePosition));
      this.lastElementHover = target;
    }
    if (flag1 && !this.wasMouseDown && target != null && !disabled) {
      this.lastElementDown = target;
      target.mouseDown(new UIMouseEvent(target, this.mousePosition));
      if (this.lastElementClicked === target) {
        if (this.clock - this.lastMouseDownTime < DOUBLE_CLICK_TIME) {
          target.doubleClick(new UIMouseEvent(target, this.mousePosition));
          this.lastElementClicked = null;
        }
      }
      this.lastMouseDownTime = this.clock;
    } else if (!flag1 && this.wasMouseDown && this.lastElementDown != null && !disabled) {
      const down = this.lastElementDown;
      if (down.containsPoint(this.mousePosition)) {
        down.click(new UIMouseEvent(down, this.mousePosition));
        this.lastElementClicked = this.lastElementDown;
      }
      down.mouseUp(new UIMouseEvent(down, this.mousePosition));
      this.lastElementDown = null;
    }
    if (wheelDelta !== 0) {
      target?.scrollWheel(new UIScrollWheelEvent(target, this.mousePosition, wheelDelta));
    }
    this.wasMouseDown = flag1;
    if (this.currentState == null) return;
    this.currentState.update();
  }

  draw(batch: import('../draw/UISpriteBatch').UISpriteBatch) {
    this.use();
    if (this.currentState == null) return;
    if (this.isStateDirty) {
      this.currentState.recalculate();
      this.isStateDirty = false;
    }
    this.currentState.draw(batch);
  }

  setState(state: UIState | null) {
    if (state === this.currentState) return;
    if (state != null) this.addToHistory(state);
    if (this.currentState != null) {
      this.lastElementHover?.mouseOut(new UIMouseEvent(this.lastElementHover, this.mousePosition));
      this.currentState.deactivate();
    }
    this.currentState = state;
    this.resetState();
    if (state == null) return;
    this.isStateDirty = true;
    state.activate();
    state.recalculate();
  }

  goBack() {
    if (this.history.length < 2) return;
    const state = this.history[this.history.length - 2];
    this.history.splice(this.history.length - 2, 2);
    this.setState(state);
  }

  private addToHistory(state: UIState) {
    this.history.push(state);
    if (this.history.length > MAX_HISTORY_SIZE) this.history.splice(0, HISTORY_PRUNE_SIZE);
  }

  recalculate() {
    this.currentState?.recalculate();
  }

  getDimensions(): CalculatedStyle {
    const { logicalW, logicalH } = UIScale;
    return new CalculatedStyle(0, 0, logicalW, logicalH);
  }

  /** 供 UIElement.recalculate() 回溯的当前实例尺寸 */
  static dimensionsOf(): CalculatedStyle {
    return UserInterface.activeInstance?.getDimensions() ?? new CalculatedStyle(0, 0, UIScale.logicalW, UIScale.logicalH);
  }
}
