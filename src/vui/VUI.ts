// VUI 根控制器：ui-canvas 管理、帧循环挂接、鼠标输入、光标绘制。
// 用法：VUI.init(parent) → await VUI.ready() → VUI.setState(new XxxState())
// 帧循环：菜单期由 main.ts 的 rAF 驱动 VUI.frame(dt)；进游戏后挂 Game 渲染末尾。
import { UserInterface } from './core/UserInterface';
import type { UIState } from './core/UIState';
import { UIScale } from './draw/UIScale';
import { UISpriteBatch, rgb } from './draw/UISpriteBatch';
import { UITextures } from './assets/UITextures';

export class VUI {
  static ui = new UserInterface();
  static canvas: HTMLCanvasElement | null = null;
  static batch: UISpriteBatch | null = null;

  private static leftDown = false;
  private static hasFocus = true;
  private static wheel = 0;
  private static enabled = true;

  /** 创建 ui-canvas 并接输入。z-index 10（低于 DevUI DOM） */
  static init(parent: HTMLElement) {
    const c = document.createElement('canvas');
    c.id = 'ui-canvas';
    c.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:10;cursor:none;';
    parent.appendChild(c);
    VUI.canvas = c;
    VUI.batch = new UISpriteBatch(c.getContext('2d')!);
    VUI.resize();

    window.addEventListener('resize', VUI.resize);
    window.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      UIScale.mouseX = (e.clientX - r.left) / UIScale.scale;
      UIScale.mouseY = (e.clientY - r.top) / UIScale.scale;
    });
    window.addEventListener('mousedown', (e) => { if (e.button === 0) VUI.leftDown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) VUI.leftDown = false; });
    window.addEventListener('blur', () => { VUI.hasFocus = false; VUI.leftDown = false; });
    window.addEventListener('focus', () => { VUI.hasFocus = true; });
    // wheel 记 UI 侧增量；游戏侧 Input 另有自己的监听（分流在 main.ts 编排）
    window.addEventListener('wheel', (e) => { VUI.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  static resize() {
    const c = VUI.canvas;
    if (!c) return;
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    UIScale.resize(cssW, cssH, dpr);
  }

  static setState(state: UIState | null) { VUI.ui.setState(state); }
  static goBack() { VUI.ui.goBack(); }

  /** 显示开关（游戏内全屏地图打开等场景可临时隐藏 UI 层输入） */
  static setEnabled(v: boolean) { VUI.enabled = v; }

  /** 每帧驱动（菜单期 rAF / 游戏内 Game 渲染末尾各调一次） */
  static frame(dtMs: number) {
    if (!VUI.canvas || !VUI.batch) return;
    if (VUI.enabled) VUI.ui.update(dtMs, VUI.leftDown, VUI.hasFocus, VUI.wheel);
    VUI.wheel = 0;
    VUI.draw();
  }

  private static draw() {
    const ctx = VUI.batch!.ctx;
    const { cssW, cssH, dpr, scale } = UIScale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, UIScale.logicalW, UIScale.logicalH);
    VUI.ui.use();
    VUI.ui.isVisible = true;
    VUI.ui.draw(VUI.batch!);
    VUI.drawCursor();
  }

  /** Canvas 光标（cursor:none + 绘制 Cursor_0） */
  private static drawCursor() {
    if (!VUI.batch || !VUI.enabled) return;
    const tex = UITextures.get('UI_Cursor_0');
    if (!tex) return;
    const x = Math.round(UIScale.mouseX);
    const y = Math.round(UIScale.mouseY);
    VUI.batch.draw(tex, x, y, { color: rgb(255, 255, 255) });
  }

  /** 当前鼠标下的 UI 元素（供游戏输入分流：非空则 UI 消费了指针） */
  static elementUnderMouse() {
    return VUI.ui.current?.getElementAt({ x: UIScale.mouseX, y: UIScale.mouseY }) ?? null;
  }
}

// 调试桥
declare global {
  interface Window { __swVUI?: typeof VUI; }
}
if (typeof window !== 'undefined') window.__swVUI = VUI;
