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

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.keydownHandlers.forEach((fn) => fn(e.code));
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('mousemove', (e) => {
      const r = this.el.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    // mousedown 挂 window：不依赖事件目标是否恰好是 canvas
    window.addEventListener('mousedown', (e) => {
      // UI 面板上的点击不穿透为游戏输入
      if ((e.target as HTMLElement)?.closest?.('.sw-panel, .sw-slot, .sw-recipe, .sw-btn')) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  down(code: string): boolean {
    return !this.uiBlocking && this.keys.has(code);
  }

  /** 每帧末调用，处理一次性输入（滚轮切换快捷栏） */
  endFrame() {
    this.wheelDelta = 0;
  }
}
