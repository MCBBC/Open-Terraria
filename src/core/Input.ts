// 键盘/鼠标输入。UI 打开时屏蔽游戏输入。
import { bindsOf, type KeybindAction } from './Keybinds';

export class Input {
  keys = new Set<string>();
  /** 虚拟按键（移动端控件注入——MobileControls 持有）。down() 与物理键盘同权：
   *  摇杆=KeyA/KeyD/KeyW/KeyS、跳跃=Space、智能光标=ControlLeft。uiBlocking 门
   *  对两者一致生效（背包打开时虚拟摇杆同样不驱动角色） */
  touchKeys = new Set<string>();
  mouseX = 0; mouseY = 0;
  mouseDown = false;
  /** 左键物理按住态(mousedown→true/mouseup→false,不随点击消费清零)。
   *  mouseDown 是"边沿消费"语义(use 代码用完置 false,等下一次真实点击),
   *  悠悠球/连枷 channel 等需要"电平"语义的判定必须用本字段——否则掷出当帧
   *  被 use 清掉后无 mousedown 事件回填,链球出生 1 帧即判松手回收(2026-08-13) */
  mouseHeld = false;
  rightDown = false;
  /** R4-22（FocusHelper.cs:134-139 → TriggersSet.cs:851-859）：失焦置位,回焦首击
   *  被吞、松键解除——原版 delayUseItem 同名语义 */
  delayUseItem = false;
  uiBlocking = false;     // 背包/合成等打开时为 true
  wheelDelta = 0;
  /** keydown 边沿回调（含原生事件——Shift+F1/F2/F3 调试键迁移需要 e.shiftKey） */
  keydownHandlers: Array<(code: string, e: KeyboardEvent) => void> = [];
  /** 键沿观察口（行为录制用：Game 构造接 recLog('key')——down=false 为 keyup）。
   *  只在 keydown/keyup 边沿各调一次（keydown 有 e.repeat 门），轮询零影响 */
  onKeyEvent?: (code: string, down: boolean) => void;

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
      // 输入框内打字不算操作键位（合成搜索框等）：游戏键全不放行、也不吞事件
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      this.keys.add(e.code);
      this.keydownHandlers.forEach((fn) => fn(e.code, e));
      this.onKeyEvent?.(e.code, true);   // 行为录制：键沿（e.repeat 已滤）
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      // F1/F2/F3 = 配装热键（原版 Loadout1/2/3）；调试键已迁 Shift+F1/F2/F3——
      // 防浏览器快捷（帮助/搜索等）
      if (e.code === 'F1' || e.code === 'F2' || e.code === 'F3') e.preventDefault();
    }) as EventListener);
    onWin('keyup', ((e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.onKeyEvent?.(e.code, false);  // 行为录制：键沿（松开）
    }) as EventListener);
    onWin('blur', (() => {
      this.keys.clear(); this.touchKeys.clear(); this.mouseHeld = false;
      // R4-22（FocusHelper.cs:134-139）：窗口失焦即置 delayUseItem——回焦的那一下
      // mousedown 不开火（TriggersSet.cs:851-859：置位期间压掉使用键,松键才解除）
      this.delayUseItem = true;
    }) as EventListener);
    onEl('mousemove', ((e: MouseEvent) => {
      const r = this.el.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    }) as EventListener);
    // mousedown 挂 window：不依赖事件目标是否恰好是 canvas
    onWin('mousedown', ((e: MouseEvent) => {
      // UI 面板上的点击不穿透为游戏输入。★门 = 事件目标落在 UI 根 .sw-root 内即可：
      // .sw-root 自身 pointer-events:none，能成为 target 的必是真控件（面板/槽/按钮
      // 全在里面）——类名白名单曾漏 .sw-npc-shop 族 = 商店点行购买的同时开火/挖掘
      // （2026-08-28 用户报）。显式类名单保留兜 body 直挂件（聊天输入框 sw-chatbox 等）
      if ((e.target as HTMLElement)?.closest?.('.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-chatbox')) return;
      if (e.button === 0) {
        // R4-22：delayUseItem 置位期间吞掉本次使用边沿（mouseHeld 保持——按住不松
        // 仍不开火,松键才解除,同 TriggersSet 语义）
        if (this.delayUseItem) return;
        this.mouseDown = true; this.mouseHeld = true;
      }
      if (e.button === 2) this.rightDown = true;
    }) as EventListener);
    onWin('mouseup', ((e: MouseEvent) => {
      if (e.button === 0) { this.mouseDown = false; this.mouseHeld = false; this.delayUseItem = false; }
      if (e.button === 2) this.rightDown = false;
    }) as EventListener);
    onEl('contextmenu', (e) => e.preventDefault());
    onEl('wheel', ((e: WheelEvent) => {
      this.wheelDelta += Math.sign(e.deltaY);
      e.preventDefault();
    }) as EventListener, { passive: false });

    // ---- 触摸合成（移动端世界交互）：虚拟控件与 UI 面板各自消费事件（控件层
    // stopPropagation+preventDefault；DOM 面板走原生 click），到达这里的只有
    // "世界区域"触摸 → 合成鼠标语义（点击=左键使用/挖掘/攻击，拖动=瞄准，
    // 长按 ≥400ms 且位移 <12px = 右键交互脉冲：开箱/对话/开门）。
    // ★ 不改桌面路径：桌面无 touch 事件，本段零影响
    const isUiTarget = (t: EventTarget | null): boolean =>
      !!t && (t as HTMLElement)?.closest?.('.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-mobile, .sw-hotbar, .sw-tooltip, .sw-ach-panel, .sw-res-panel, .sw-drag-ghost, .sw-chatbox') != null;
    let worldTouchId: number | null = null;
    let touchStartX = 0, touchStartY = 0, touchStartT = 0;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const clearLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
    const setCursor = (t: Touch) => {
      const r = this.el.getBoundingClientRect();
      this.mouseX = t.clientX - r.left;
      this.mouseY = t.clientY - r.top;
    };
    onEl('touchstart', ((e: TouchEvent) => {
      if (isUiTarget(e.target)) return;             // UI/控件原生处理
      if (worldTouchId !== null) return;            // 首指驱动光标，次指忽略
      const t = e.changedTouches[0];
      worldTouchId = t.identifier;
      e.preventDefault();                           // 阻浏览器合成鼠标/滚动
      setCursor(t);
      this.mouseDown = true; this.mouseHeld = true;
      touchStartX = t.clientX; touchStartY = t.clientY; touchStartT = performance.now();
      clearLongPress();
      longPressTimer = setTimeout(() => {           // 长按 → 右键交互脉冲
        this.rightDown = true;
      }, 400);
    }) as EventListener, { passive: false });
    onEl('touchmove', ((e: TouchEvent) => {
      if (worldTouchId === null) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== worldTouchId) continue;
        e.preventDefault();
        setCursor(t);
        // 显著移动取消长按（拖动=瞄准/持续挖掘）
        if (Math.hypot(t.clientX - touchStartX, t.clientY - touchStartY) > 12) {
          clearLongPress();
          this.rightDown = false;
        }
      }
    }) as EventListener, { passive: false });
    const endWorldTouch = (e: TouchEvent) => {
      if (worldTouchId === null) return;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== worldTouchId) continue;
        e.preventDefault();
        worldTouchId = null;
        clearLongPress();
        this.mouseDown = false; this.mouseHeld = false;
        this.rightDown = false;
      }
    };
    onEl('touchend', endWorldTouch as EventListener, { passive: false });
    onEl('touchcancel', endWorldTouch as EventListener, { passive: false });
  }

  /** 移除全部监听(退出世界时 Game.destroy 调用) */
  destroy(): void {
    for (const [t, fn, opts] of this.winListeners) window.removeEventListener(t, fn, opts);
    for (const [t, fn, opts] of this.elListeners) this.el.removeEventListener(t, fn, opts);
    this.winListeners = [];
    this.elListeners = [];
  }

  down(code: string): boolean {
    return !this.uiBlocking && (this.keys.has(code) || this.touchKeys.has(code));
  }

  /** 按键位表查 action 电平（M5：全消费点经 bindsOf 读用户自定义；uiBlocking 门同 down）。
   *  ★移动端虚拟键仍注入物理 code——用户重绑移动键后虚拟摇杆不跟随（Web 桌面为主，
   *  移动端控件键位适配另行处理） */
  downAction(action: KeybindAction): boolean {
    return bindsOf(action).some((c) => this.keys.has(c) || this.touchKeys.has(c))
      && !this.uiBlocking;
  }

  /** 每帧末调用，处理一次性输入（滚轮切换快捷栏） */
  endFrame() {
    this.wheelDelta = 0;
  }
}
