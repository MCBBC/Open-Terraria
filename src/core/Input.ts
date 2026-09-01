// 键盘/鼠标输入。UI 打开时屏蔽游戏输入。
import { bindsOf, type KeybindAction } from './Keybinds';
import { isDomUiTarget } from './input/domTargets';
import { resolveTouchMode } from './input/touchMode';

/** 泛化键沿载荷(mobile-adaptation-plan 模块①):keydownHandlers 的统一第二参。
 *  物理键盘派发时由 KeyboardEvent 逐字段映射(origin='physical');虚拟通道
 *  (pressVirtual)直接构造(origin='virtual')。字段是 KeyboardEvent 的语义
 *  超集——既有 handler 的 e.shiftKey 等读法零改动,消费点可据 origin 区分
 *  真实/合成(如 Esc 主链只吃 virtual,物理路径仍在 main.ts 自有监听) */
export interface KeyEventLite {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  origin: 'physical' | 'virtual';
  /** 虚拟沿专属:触发本边沿的 action 原名(code 是其首个绑定码;物理沿恒缺省) */
  virtualAction?: KeybindAction;
  /** 虚拟沿专属:消费方自定义意图透传(如 Inventory 链的 'escape'|'inventory'
   *  终点形态;物理沿恒缺省——物理终端形态由具体按下码推导) */
  virtualIntent?: string;
}

const ACTION_CODE_SET: ReadonlySet<string> = new Set([
  'Up', 'Down', 'Left', 'Right', 'Jump',
  'Inventory', 'Grapple', 'SmartSelect', 'SmartCursor', 'QuickMount',
  'QuickHeal', 'QuickMana', 'QuickBuff',
  'Hotbar1', 'Hotbar2', 'Hotbar3', 'Hotbar4', 'Hotbar5', 'Hotbar6',
  'Hotbar7', 'Hotbar8', 'Hotbar9', 'Hotbar10', 'HotbarMinus', 'HotbarPlus',
  'MapFull', 'MapStyle', 'MapZoomIn', 'MapZoomOut', 'MapAlphaUp', 'MapAlphaDown',
  'ViewZoomIn', 'ViewZoomOut',
  'Loadout1', 'Loadout2', 'Loadout3', 'PreviousLoadout', 'NextLoadout',
  'ToggleCreativeMenu', 'ToggleCameraMode',
]);

export class Input {
  keys = new Set<string>();
  /** 虚拟按键电平桶（移动端控件注入——MobileControls 持有）。down() 与物理键盘同权：
   *  历史注入=摇杆 KeyA/D/W/S、跳跃 Space、智能光标 ControlLeft;P0 起 MobileControls
   *  改走 setVirtualAction(action 电平),本桶退为 code 兼容口(pressVirtual('Escape')
   *  这类物理码字面量仍落这里)。uiBlocking 门对两者一致生效（背包打开时虚拟摇杆
   *  同样不驱动角色） */
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
  /** keydown 边沿回调（含原生事件与虚拟按键沿）。第二参已泛化为 KeyEventLite:
   *  物理键=KeyboardEvent 字段映射,e.shiftKey/e.altKey 读法原样可用;
   *  虚拟边沿 origin='virtual' 且 repeat 恒 false(repeat 由 pressVirtual 重发承担) */
  keydownHandlers: Array<(code: string, e: KeyEventLite) => void> = [];
  /** 键沿观察口（行为录制用：Game 构造接 recLog('key')——down=false 为 keyup）。
   *  只在 keydown/keyup 边沿各调一次（keydown 有 e.repeat 门；虚拟沿经 press/
   *  releaseVirtual 同步收录），轮询零影响。kind 缺省=普通沿；'repeatHeal'=
   *  按住自愈补回电平（见 keydown 监听内注释,仅真实补回时一条,不随重复沿刷屏） */
  onKeyEvent?: (code: string, down: boolean, kind?: 'press' | 'repeatHeal') => void;
  /** 窗口失焦观察口（clearForBlur 必经）。行为录制用：held 键"断一下"的取证
   *  关键分野——blur 清空(须重按) vs 伪 keyup(重复沿可自愈) vs 帧冻结(无键沿) */
  onWindowBlur?: () => void;

  /** 虚拟 action 电平(MobileControls setVirtualAction):用户重绑后即时跟随——
   *  downAction(a)=绑定码命中(keys/touchKeys) || virtualActions.has(a)。
   *  ★来源辨析零成本:keys=物理桶,touchKeys/virtualActions=虚拟桶,分桶即防环
   *  (物理 keyup 只删 keys,"松开物理键拔不掉摇杆"由集合分离天然保证) */
  private virtualActions = new Set<KeybindAction>();
  /** tap 吞边沿兜底(R? 2026-08-29):世界触摸 tap 的起止可落在两个 fixedTick 之间,
   *  mouseDown 在被 updateUse 消费前就被 touchend 清零=一次轻点整个丢失(触摸无
   *  OS 保序,桌面 mousedown→mouseup 间恒有 tick 窗)。touchend 时若 mouseDown 尚
   *  未被消费即挂本旗,endFrame(fixedUpdate 尾,Game.ts"inp.endFrame()")强制释放
   *  ——保证每个 tap 至少活过一个消费窗口。桌面 mousedown/mouseup 不经此路 */
  private pendingTapRelease = false;

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
      // 输入框内打字不算操作键位（合成搜索框等）：游戏键全不放行、也不吞事件
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (e.repeat) {
        // ★按住自愈（2026-09-01 用户报"按住 Shift/方向键偶尔断一下信号"）：OS 自动
        // 重复沿到达 = 物理上仍按着。电平桶若因一次伪 keyup（系统焦点抖动/输入法
        // 态切换）丢了该键，OS 不会补发首按 keydown（浏览器对已按住的键只在松开前
        // 持续发 repeat）——靠重复沿把电平补回，断档缩到一个重复周期（≤65ms）。
        // ★只补电平不派发按下沿（keydownHandlers 是按下边沿语义）；修饰键
        // （Shift 等）无自动重复，断档仍需重按 = 已知边界，取证走 onWindowBlur
        if (!this.keys.has(e.code)) {
          this.keys.add(e.code);
          this.onKeyEvent?.(e.code, true, 'repeatHeal');
        }
        return;
      }
      this.keys.add(e.code);
      const lite: KeyEventLite = {
        code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey,
        altKey: e.altKey, metaKey: e.metaKey, repeat: false /* e.repeat 已门 */, origin: 'physical',
      };
      this.keydownHandlers.forEach((fn) => fn(e.code, lite));
      this.onKeyEvent?.(e.code, true);   // 行为录制：键沿（e.repeat 已滤）
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
      // F1/F2/F3 = 配装热键（原版 Loadout1/2/3）；调试键已迁 Shift+F1/F2/F3——
      // 防浏览器快捷（帮助/搜索等）
      if (e.code === 'F1' || e.code === 'F2' || e.code === 'F3') e.preventDefault();
    }) as EventListener);
    onWin('keyup', ((e: KeyboardEvent) => {
      // ★无条件删自己的物理集合:keys 与 touchKeys/virtualActions 分桶,虚拟电平
      // 不经 keys——物理松键永远不会"拔掉摇杆"(分桶天然保证);此前加过
      // virtualOrigin 守卫反而制造 keys 残留(物理已松 down 却恒真)
      this.keys.delete(e.code);
      this.onKeyEvent?.(e.code, false);  // 行为录制：键沿（松开）
    }) as EventListener);
    onWin('blur', (() => this.clearForBlur()) as EventListener);
    onEl('mousemove', ((e: MouseEvent) => {
      const r = this.el.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    }) as EventListener);
    // mousedown 挂 window：不依赖事件目标是否恰好是 canvas
    onWin('mousedown', ((e: MouseEvent) => {
      // UI 面板上的点击不穿透为游戏输入。★门 = isDomUiTarget(core/input/domTargets
      // 单一名单,与触摸合成门共用):.sw-root 自身 pointer-events:none,能成为 target
      // 的必是真控件——类名白名单曾漏 .sw-npc-shop 族 = 商店点行购买的同时开火/
      // 挖掘（2026-08-28 用户报）;2026-08-29 起名单合一并纳入 .sw-mobile 触屏层族
      if (isDomUiTarget(e.target)) return;
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
      // 操作模式门(keyboard 强制=触摸屏点击不合成世界输入;键鼠语义接管)
      if (resolveTouchMode() !== 'touch') return;
      if (isDomUiTarget(e.target)) return;          // UI/控件原生处理
      if (worldTouchId !== null) return;            // 首指驱动光标，次指忽略(P1 FingerRoles 升级)
      const t = e.changedTouches[0];
      worldTouchId = t.identifier;
      e.preventDefault();                           // 阻浏览器合成鼠标/滚动
      setCursor(t);
      this.mouseDown = true; this.mouseHeld = true;
      this.pendingTapRelease = false;               // 新触摸重新武装兜底窗
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
        // ★tap 兜底:mouseDown 若仍未被消费(updateUse 消费后会主动清 false),保到
        // 本 tick 的 endFrame 强制释放——快速轻点必有一个消费窗口(mouseHeld/rightDown
        // 电平照常立即清,channel 类武器不受影响)
        if (this.mouseDown) this.pendingTapRelease = true;
        this.mouseHeld = false;
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
    this.releaseAllVirtual();   // 防换世界/重建实例时虚拟电平残留(H5 护栏)
  }

  /** 窗口失焦清理(R4-22 原语义;blur 与测试复用入口) */
  clearForBlur(): void {
    this.onWindowBlur?.();
    this.keys.clear();
    this.releaseAllVirtual();
    this.mouseHeld = false;
    // R4-22（FocusHelper.cs:134-139）：窗口失焦即置 delayUseItem——回焦的那一下
    // mousedown 不开火（TriggersSet.cs:851-859：置位期间压掉使用键,松键才解除）
    this.delayUseItem = true;
  }

  /** 清空全部虚拟输入(电平桶/action 集/来源登记)。MobileControls.destroy、
   *  Input.destroy、blur 必经——退出世界残留虚拟键会幽灵驱动角色(H5) */
  releaseAllVirtual(): void {
    this.touchKeys.clear();
    this.virtualActions.clear();
    this.pendingTapRelease = false;
  }

  down(code: string): boolean {
    return !this.uiBlocking && (this.keys.has(code) || this.touchKeys.has(code));
  }

  /** 按键位表查 action 电平（M5：全消费点经 bindsOf 读用户自定义；uiBlocking 门同 down）。
   *  P0 起含虚拟 action 通道:setVirtualAction 注入的电平与用户重绑即时一致
   *  （VirtualActions 只存 action 本身,绑定表改动无需反向推导 code——Input.ts
   *  169-171 版注释承认的"移动端不跟随重绑"技术债就此了结） */
  downAction(action: KeybindAction): boolean {
    if (this.uiBlocking) return false;
    if (this.virtualActions.has(action)) return true;
    return bindsOf(action).some((c) => this.keys.has(c) || this.touchKeys.has(c));
  }

  // ================= 虚拟输入通道(mobile-adaptation-plan 模块①,P0) =================
  // 二分纪律:press/release 产生【边沿】(keydownHandlers/onKeyEvent 各一发);
  // setVirtual* 只产生【电平】(幂等,永不派发边沿)。消费侧需区分真实/合成时读
  // KeyEventLite.origin;禁止 window.dispatchEvent(new KeyboardEvent()) 合成方案
  // (isTrusted=false 被 AudioGate 类守卫拒收+capture 双冒烟+preventDefault 丢失)。

  /** 虚拟电平(code 口,兼容历史物理码注入,如 touchKeys 时代的'ControlLeft') */
  setVirtualCode(code: string, level: boolean): void {
    if (level) { this.touchKeys.add(code); }
    else { this.touchKeys.delete(code); }
  }

  /** 虚拟电平(action 口,★推荐):移动端摇杆/跳跃等持续态注入,用户重绑即时跟随 */
  setVirtualAction(action: KeybindAction, level: boolean): void {
    if (level) this.virtualActions.add(action);
    else this.virtualActions.delete(action);
  }

  /** 虚拟按下边沿(v 为物理 code 或 KeybindAction)。副作用序固定:
   *  ① 写电平(action 化入 virtualActions+其绑定码入 touchKeys/origin 登记)
   *  ② keydownHandlers.forEach(KeyEventLite{origin:'virtual'}) —— 全部十七族
   *     边沿动作(数字切栏/Esc 主链/M 地图/H·J·B/F1-F3/Enter…)由此可达
   *  ③ onKeyEvent(code,true)(行为录制自动收录)
   *  返回是否有边沿派发(action 无绑定码时仅剩电平,返回 false) */
  pressVirtual(
    v: string,
    mods?: Partial<Pick<KeyEventLite, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'virtualIntent'>>,
  ): boolean {
    const isAction = ACTION_CODE_SET.has(v);
    const edgeCode = this.armVirtualLevel(v);
    if (!edgeCode) return false;
    const lite: KeyEventLite = {
      code: edgeCode,
      shiftKey: !!mods?.shiftKey, ctrlKey: !!mods?.ctrlKey,
      altKey: !!mods?.altKey, metaKey: !!mods?.metaKey,
      repeat: false, origin: 'virtual',
    };
    if (isAction) lite.virtualAction = v as KeybindAction;
    if (mods?.virtualIntent) lite.virtualIntent = mods.virtualIntent;
    for (const fn of this.keydownHandlers) fn(edgeCode, lite);
    this.onKeyEvent?.(edgeCode, true);
    return true;
  }

  /** 虚拟松开(清电平 + 键沿观察口 up 发出)。与 pressVirtual 配对;
   *  未按下时调用安全(幂等) */
  releaseVirtual(v: string): void {
    this.disarmVirtualLevel(v);
    const first = this.edgeCodesOf(v)[0];
    if (first) this.onKeyEvent?.(first, false);
  }

  /** 一次性敲击语义(按+松,等同真实敲一下;Inventory/Esc 主链优先走这里) */
  tapVirtual(
    v: string,
    mods?: Partial<Pick<KeyEventLite, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'virtualIntent'>>,
  ): boolean {
    const ok = this.pressVirtual(v, mods);
    this.releaseVirtual(v);
    return ok;
  }

  /** 内部:写电平,返回应作边沿派发的 code(action 取首个绑定码;空表=纯电平无码) */
  private armVirtualLevel(v: string): string {
    if (ACTION_CODE_SET.has(v)) {
      const a = v as KeybindAction;
      this.virtualActions.add(a);
      for (const c of bindsOf(a)) this.touchKeys.add(c);
    } else {
      this.touchKeys.add(v);
    }
    return this.edgeCodesOf(v)[0] ?? '';
  }

  /** 内部:清电平(真实物理码仍按住时 touchKeys 可删——keys 维持电平) */
  private disarmVirtualLevel(v: string): void {
    if (ACTION_CODE_SET.has(v)) {
      const a = v as KeybindAction;
      this.virtualActions.delete(a);
      for (const c of bindsOf(a)) {
        this.touchKeys.delete(c);
      }
    } else {
      this.touchKeys.delete(v);
    }
  }

  /** 内部:v 的边沿候选码(action→绑定码序列/code→自身) */
  private edgeCodesOf(v: string): readonly string[] {
    return ACTION_CODE_SET.has(v) ? bindsOf(v as KeybindAction) : [v];
  }

  /** 每帧末调用（fixedUpdate 尾），处理一次性输入：滚轮计数清零 + tap 兜底释放 */
  endFrame() {
    this.wheelDelta = 0;
    if (this.pendingTapRelease) {
      // 触摸 tap 保住的未消费 mouseDown 到此强制清(已过 updateUse 消费窗,
      // 再留着只会在下一个 tick 假触发第二次使用)
      this.mouseDown = false;
      this.pendingTapRelease = false;
    }
  }
}
