// 键盘/鼠标输入。UI 打开时屏蔽游戏输入。
export class Input {
  keys = new Set<string>();
  mouseX = 0; mouseY = 0;
  mouseDown = false;
  rightDown = false;
  uiBlocking = false;     // 背包/合成等打开时为 true
  wheelDelta = 0;
  keydownHandlers: Array<(code: string) => void> = [];

  private el: HTMLElement;
  /** 已注册监听(destroy 时全部移除——window 强引用曾把整个旧 Game 钉死,
   *  连续多次读档 GPU 内存累积 → contextlost 风暴卡死,2026-08-10 trace 实证) */
  private winListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];
  private elListeners: Array<[string, EventListener, AddEventListenerOptions?]> = [];

  constructor(el: HTMLElement) {
    this.el = el;
    const onWin = (type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      window.addEventListener(type, fn, opts);
      this.winListeners.push([type, fn, opts]);
    };
    const onEl = (type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn, opts);
      this.elListeners.push([type, fn, opts]);
    };

    onWin('keydown', ((e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.keydownHandlers.forEach((fn) => fn(e.code));
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.code === 'F11') e.preventDefault(); // 像素画导入(Game),防浏览器全屏
    }) as EventListener);
    onWin('keyup', ((e: KeyboardEvent) => { this.keys.delete(e.code); }) as EventListener);
    onWin('blur', (() => this.keys.clear()) as EventListener);
    onEl('mousemove', ((e: MouseEvent) => {
      const r = this.el.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    }) as EventListener);
    // mousedown 挂 window：不依赖事件目标是否恰好是 canvas
    onWin('mousedown', ((e: MouseEvent) => {
      // UI 面板上的点击不穿透为游戏输入
      if ((e.target as HTMLElement)?.closest?.('.sw-panel, .sw-slot, .sw-recipe, .sw-btn')) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    }) as EventListener);
    onWin('mouseup', ((e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    }) as EventListener);
    onEl('contextmenu', (e) => e.preventDefault());
    onEl('wheel', ((e: WheelEvent) => {
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }) as EventListener, { passive: false });
  }

  /** 移除全部监听(退出世界时 Game.destroy 调用) */
  destroy(): void {
    for (const [t, fn, opts] of this.winListeners) window.removeEventListener(t, fn, opts);
    for (const [t, fn, opts] of this.elListeners) this.el.removeEventListener(t, fn, opts);
    this.winListeners = [];
    this.elListeners = [];
  }

  down(code: string): boolean {
    return !this.uiBlocking && this.keys.has(code);
  }

  /** 每帧末调用，处理一次性输入（滚轮切换快捷栏） */
  endFrame() {
    this.wheelDelta = 0;
  }
}
