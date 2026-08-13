// VUI 根控制器：ui-canvas 管理、帧循环挂接、鼠标输入、光标绘制。
// 用法：VUI.init(parent) → await VUI.ready() → VUI.setState(new XxxState())
// 帧循环：菜单期由 main.ts 的 rAF 驱动 VUI.frame(dt)；进游戏后挂 Game 渲染末尾。
import { UserInterface } from './core/UserInterface';
import type { UIState } from './core/UIState';
import { UIScale } from './draw/UIScale';
import { UISpriteBatch, rgb } from './draw/UISpriteBatch';
import { UITextures } from './assets/UITextures';
import { isTouchDevice } from '../ui/MobileControls';

export class VUI {
  static ui = new UserInterface();
  static canvas: HTMLCanvasElement | null = null;
  static batch: UISpriteBatch | null = null;

  private static leftDown = false;
  private static rightDown = false;
  /** 按下/抬起事件计数（事件驱动）：同一帧间隙内的快速点击不丢。
   *  语义：press 计数在 update 前消费（当帧视为按下）；release 计数在 update 后消费
   *  （下一帧才视为抬起）→ 任何点击至少被观察到「按下一帧 + 抬起一帧」 */
  private static presses = 0;
  private static releases = 0;
  private static rightPresses = 0;
  private static rightReleases = 0;
  private static hasFocus = true;
  private static wheel = 0;
  private static enabled = true;

  /** 创建 ui-canvas 并接输入。z-index 300（高于全部 DOM 面板：设置 25/tooltip 100/拖拽幽灵 200），
   *  保证 Canvas 绘制的原版光标永远浮在最上层（本层 pointer-events:none，不影响 DOM 点击） */
  static init(parent: HTMLElement) {
    const c = document.createElement('canvas');
    c.id = 'ui-canvas';
    c.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:300;cursor:none;';
    parent.appendChild(c);
    // 全屏隐藏系统光标（原版整窗由游戏画 Cursor_*）：各 DOM 面板自带 cursor:auto/pointer 会盖掉
    // body 继承的 none，必须 !important 全树压制 —— 全程只留 Canvas 原版光标
    if (!document.getElementById('sw-cursor-style')) {
      const style = document.createElement('style');
      style.id = 'sw-cursor-style';
      style.textContent = '#game-root, #game-root * { cursor: none !important; }';
      document.head.appendChild(style);
    }
    VUI.canvas = c;
    VUI.batch = new UISpriteBatch(c.getContext('2d')!);
    VUI.resize();

    window.addEventListener('resize', VUI.resize);
    window.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      UIScale.mouseX = (e.clientX - r.left) / UIScale.scale;
      UIScale.mouseY = (e.clientY - r.top) / UIScale.scale;
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) VUI.presses++;
      else if (e.button === 2) VUI.rightPresses++;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) VUI.releases++;
      else if (e.button === 2) VUI.rightReleases++;
    });
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

  // ================= 自愈帧循环 =================
  // 循环本体放在 VUI 模块内（而非 mainFlow）：HMR 热替换业务模块时循环不死；
  // 另设心跳看门狗——任何原因导致 rAF 停摆（如被外部 cancel）1 秒内自动重启。
  private static loopRaf = 0;
  private static lastBeat = 0;
  /** 循环代际：startLoop 重启时 +1，旧循环闭包发现不一致即自杀（防僵尸 rAF 并行累积） */
  private static loopGen = 0;
  /** 看门狗句柄：只注册一次——曾在 startLoop 内注册，rAF 停摆时每次重启各 +1 个定时器，
   *  指数累积（实测挂机后 TimerFire 6300 次/秒、内存冲到 10.6GB） */
  private static watchdogId = 0;
  /** 每帧回调（menuBg 背景驱动 / uiBlocking 同步等，由 mainFlow 注入） */
  static frameHook: ((dtMs: number) => void) | null = null;

  static startLoop() {
    if (VUI.loopRaf) return;
    const gen = ++VUI.loopGen;
    let last = performance.now();
    const loop = () => {
      if (VUI.loopGen !== gen) return; // 已被新循环取代：自杀，不再自我续期
      const now = performance.now();
      const dt = Math.min(100, now - last);
      last = now;
      VUI.lastBeat = now;
      VUI.frameHook?.(dt);
      VUI.frame(dt);
      VUI.loopRaf = requestAnimationFrame(loop);
    };
    VUI.loopRaf = requestAnimationFrame(loop);
    // 看门狗仅注册一次（幂等）
    if (!VUI.watchdogId) {
      VUI.watchdogId = window.setInterval(() => {
        if (!VUI.loopRaf) { VUI.startLoop(); return; }
        if (performance.now() - VUI.lastBeat > 1000) {
          cancelAnimationFrame(VUI.loopRaf);
          VUI.loopRaf = 0;
          VUI.startLoop();
        }
      }, 1000);
    }
  }

  static setState(state: UIState | null) {
    VUI.ui.setState(state);
  }
  static goBack() { VUI.ui.goBack(); }

  /** 清空 UI 层画布（进游戏/退出菜单时调用，避免残留冻结帧叠加在游戏画面上） */
  static clear() {
    if (!VUI.canvas || !VUI.batch) return;
    const ctx = VUI.batch.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VUI.canvas.width, VUI.canvas.height);
  }

  /** 显示开关（游戏内全屏地图打开等场景可临时隐藏 UI 层输入） */
  static setEnabled(v: boolean) { VUI.enabled = v; }

  /** 每帧驱动（菜单期 rAF / 游戏内 Game 渲染末尾各调一次） */
  static frame(dtMs: number) {
    if (!VUI.canvas || !VUI.batch) return;
    // 边沿处理：按下计数在 update 前消费（当帧视为按下）；抬起计数在 update 后消费
    // （下一帧才视为抬起）→ 快速点击（down/up 同帧间隙）至少被观察到
    // 「按下一帧 + 抬起一帧」，Click 不丢
    if (VUI.presses > 0) {
      VUI.presses--;
      VUI.leftDown = true;
    }
    if (VUI.rightPresses > 0) {
      VUI.rightPresses--;
      VUI.rightDown = true;
    }
    if (VUI.enabled) VUI.ui.update(dtMs, VUI.leftDown, VUI.rightDown, VUI.hasFocus, VUI.wheel);
    VUI.wheel = 0;
    if (VUI.releases > 0 && VUI.leftDown) {
      VUI.releases--;
      VUI.leftDown = false;
    }
    if (VUI.rightReleases > 0 && VUI.rightDown) {
      VUI.rightReleases--;
      VUI.rightDown = false;
    }
    if (!VUI.leftDown && VUI.presses === 0) VUI.releases = 0; // 清理无主 release
    if (!VUI.rightDown && VUI.rightPresses === 0) VUI.rightReleases = 0;
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

  /** 智能光标激活中（Game 每帧写入）：指针切换到 Cursors[12] 帧（Main.cs:47442-47513 num=11+smart） */
  static smartCursorOn = false;

  /** Canvas 原版光标：菜单与游戏内统一绘制（系统光标已被 #sw-cursor-style 全树隐藏）。
   *  触屏设备不画指针（原版移动端同语义——触摸定位无需指针精灵） */
  private static drawCursor() {
    if (!VUI.batch || !VUI.enabled) return;
    if (isTouchDevice()) return;
    const tex = UITextures.get(VUI.smartCursorOn ? 'UI_Cursor_1' : 'UI_Cursor_0');
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
