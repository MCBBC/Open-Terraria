// VUI 根控制器：ui-canvas 管理、帧循环挂接、鼠标输入、光标绘制。
// 用法：VUI.init(parent) → await VUI.ready() → VUI.setState(new XxxState())
// 帧循环：菜单期由 main.ts 的 rAF 驱动 VUI.frame(dt)；进游戏后挂 Game 渲染末尾。
import { UserInterface } from './core/UserInterface';
import type { UIState } from './core/UIState';
import { UIScale } from './draw/UIScale';
import { UISpriteBatch, rgb } from './draw/UISpriteBatch';
import { UITextures } from './assets/UITextures';
import { isTouchDevice } from '../ui/MobileControls';
import { options } from '../core/Options';

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
      // ★视口原点直取(2026-08-19 光标独占模式:80×80 画布自身漂在鼠标下,
      // 用画布 rect 当原点 = 坐标系跟着画布跑,越移越漂;全屏模式画布恒在
      // (0,0),两种模式语义一致)
      UIScale.mouseX = e.clientX / UIScale.scale;
      UIScale.mouseY = e.clientY / UIScale.scale;
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

  /** 自愈退避态：风暴期（GPU 显存压力→上下文反复被逐）无脑每帧重建会
   *  反向喂压力——每次重建都是一次新的全屏画布分配，分配→驱逐→再丢失
   *  正反馈循环（bad.log 实测：176 次重建/console 622K 行全 rAF 栈刷屏，
   *  JS 堆稳定 340MB → 压力在 GPU 合成侧）。节流：≤1 次/2s；告警 ≤1 条/30s */
  private static lastHealAt = 0;
  private static lastHealWarnAt = 0;
  /** ui-canvas 自愈(2026-08-19 第五场双开:GPU 死后光标永不恢复——vui 画布
   *  与 batch 一次性创建,contextlost 后所有 vui 绘制静默 no-op,游戏内该层
   *  只画光标 = 症状恰好只剩光标;Renderer 看门狗只管主/辅助画布管不到这)。
   *  每帧检查(一次 isContextLost 调用,零成本),死即原位换新画布重建 batch。
   *  退避：距上次重建 <2s 直接跳过（光标暂隐 2s,游戏不受影响——GL 层看门狗
   *  同款 diedAt 退避纪律,此前唯独本层裸奔） */
  static healCanvas(): void {
    const ctx = VUI.batch?.ctx as (CanvasRenderingContext2D & { isContextLost?: () => boolean }) | undefined;
    if (!VUI.canvas || !ctx?.isContextLost?.()) return;
    const now = performance.now();
    if (now - VUI.lastHealAt < 2000) return;
    VUI.lastHealAt = now;
    const old = VUI.canvas;
    const c = document.createElement('canvas');
    c.id = 'ui-canvas';
    c.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:300;cursor:none;';
    old.parentElement?.insertBefore(c, old);
    old.remove();
    VUI.canvas = c;
    VUI.batch = new UISpriteBatch(c.getContext('2d')!);
    VUI.curMode = '';   // 模式样式作废,下帧 draw() 按当前模式重挂(含光标小型化)
    VUI.resize();
    if (now - VUI.lastHealWarnAt > 30_000) {
      VUI.lastHealWarnAt = now;
      console.warn('[VUI] ui-canvas 上下文死亡,已自愈重建(光标层)——频繁出现 = GPU 显存压力');
    }
  }

  static resize() {
    // 坐标系恒更新;画布尺寸只在全屏模式重设(光标独占模式 = 80×80 跟随
    // 鼠标,与窗口尺寸无关,resize 不得把它吹回全屏)
    const cssW = window.innerWidth, cssH = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    UIScale.resize(cssW, cssH, dpr);
    if (VUI.cursorOnly) return;
    const c = VUI.canvas;
    if (!c) return;
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
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
    // 渲染锁帧时间戳（2026-08-29）：遵循设置的帧率上限——与 Game.start 完全同款
    // 门公式（cap>0 且 1000/cap-1ms 未到即跳帧;cap=0 跟随 rAF）。背景判例：桌面
    // 壳解锁 vsync 后本循环曾 ~930fps 空转烧满一核（frameCap 门此前只罩世界主
    // 循环,菜单页裸奔）。跳帧期 last 不前移 ⇒ dt 按真实间隔累计,菜单时钟平滑。
    let lastCapTs = 0;
    const loop = () => {
      if (VUI.loopGen !== gen) return; // 已被新循环取代：自杀，不再自我续期
      const now = performance.now();
      const cap = options.data.frameCap;
      if (cap > 0 && now - lastCapTs < 1000 / cap - 1) {
        VUI.lastBeat = now;
        VUI.loopRaf = requestAnimationFrame(loop);
        return;
      }
      lastCapTs = now;
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
    VUI.cursorOnly = state === null;   // 游戏内=无状态 → 光标独占模式(画布小型化)
  }
  /** 光标独占模式(游戏内):ui-canvas 从全屏缩成 80×80 跟随鼠标的小画布,
   *  省一张全屏持久后备+合成层(2026-08-19 渲染侧审计 #2);菜单态恢复全屏 */
  private static cursorOnly = false;
  private static curMode: 'full' | 'cursor' | '' = '';
  private static readonly CUR_CSS = 80;   // 光标画布 CSS 边长(容最大 UI 缩放下光标帧+边距)
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
    VUI.healCanvas();
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
    if (VUI.cursorOnly) {
      // ---- 光标独占模式:80×80 画布钉在鼠标位(transform 移动,合成器友好)。
      // 光标本就是唯一内容,画布小不裁任何东西;命中/坐标逻辑不变(输入全部
      // 在 window 层,画布 pointer-events:none)
      if (VUI.curMode !== 'cursor') {
        VUI.curMode = 'cursor';
        const c = VUI.canvas!;
        c.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;z-index:300;cursor:none;`
          + `width:${VUI.CUR_CSS}px;height:${VUI.CUR_CSS}px;`;
        c.width = Math.round(VUI.CUR_CSS * dpr);
        c.height = Math.round(VUI.CUR_CSS * dpr);
      }
      const mx = UIScale.mouseX * scale, my = UIScale.mouseY * scale;   // CSS px
      const PAD = 8;   // 边距(CSS px):光标热点=帧左上,画布左上=鼠标位-PAD
      VUI.canvas!.style.transform = `translate(${Math.round(mx - PAD)}px, ${Math.round(my - PAD)}px)`;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ctx.clearRect(0, 0, VUI.CUR_CSS, VUI.CUR_CSS);
      // drawCursor 画在 (mouseX,mouseY) 逻辑位 → 局部系平移回来(常量)
      VUI.drawCursorLocal(PAD / scale, PAD / scale);
      return;
    }
    if (VUI.curMode !== 'full') {
      VUI.curMode = 'full';
      VUI.canvas!.style.transform = '';
      VUI.resize();   // 恢复全屏尺寸+定位样式
    }
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, UIScale.logicalW, UIScale.logicalH);
    VUI.ui.use();
    VUI.ui.isVisible = true;
    VUI.ui.draw(VUI.batch!);
    VUI.drawCursor();
  }

  /** 光标独占模式的局部系绘制(等价 drawCursor,坐标已平移到画布内) */
  private static drawCursorLocal(lx: number, ly: number) {
    if (!VUI.batch || !VUI.enabled) return;
    if (isTouchDevice()) return;
    const tex = UITextures.get(VUI.smartCursorOn ? 'UI_Cursor_1' : 'UI_Cursor_0');
    if (!tex) return;
    const cc = VUI.cursorColorState();
    // 双 pass 同 drawCursor（阴影垫底 + 本色）
    VUI.batch.draw(tex, Math.round(lx) + 1, Math.round(ly) + 1, {
      color: rgb(Math.round(cc.color.r * 0.2), Math.round(cc.color.g * 0.2),
        Math.round(cc.color.b * 0.2), Math.round(cc.color.a * 0.5)),
      scale: cc.scale * 1.1,
    });
    VUI.batch.draw(tex, Math.round(lx), Math.round(ly), { color: cc.color, scale: cc.scale });
  }

  /** 智能光标激活中（Game 每帧写入）：指针切换到 Cursors[12] 帧（Main.cs:47442-47513 num=11+smart） */
  static smartCursorOn = false;

  /** 光标染色态（Main.CursorColor :51886-51906 1:1）：
   *  mouseColor 默认 = RGB(255,50,95) 粉红（:66111——曾画纯白=丢染色链）；
   *  cursorAlpha 在 0.6..1 呼吸（±0.015/t）；RGB×alpha、A=255×(alpha×0.3+0.7)、
   *  scale=alpha×0.3+0.8 同步呼吸。hasRainbowCursor → HSL 环转（:47373-47375） */
  static cursorAlpha = 1;
  static cursorColorDirection = 1;
  static rainbowCursor = false;   // Player.hasRainbowCursor（Game 每帧写入）

  private static cursorColorState(): { color: ReturnType<typeof rgb>; scale: number } {
    VUI.cursorAlpha += VUI.cursorColorDirection * 0.015;
    if (VUI.cursorAlpha >= 1) { VUI.cursorAlpha = 1; VUI.cursorColorDirection = -1; }
    if (VUI.cursorAlpha <= 0.6) { VUI.cursorAlpha = 0.6; VUI.cursorColorDirection = 1; }
    if (VUI.rainbowCursor) {
      // HSL 环转（Main.cs:47374 hslToRgb(hourly*0.25%1,1,0.5)；标准 HSL→RGB）
      const h = (performance.now() / 1000 * 0.25) % 1;
      const f = (n: number) => {
        const k = (n + h * 12) % 12;
        const v = 0.5 - Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1)) * 0.5;
        return Math.round(v * 255);
      };
      return { color: rgb(f(0), f(8), f(4), 255), scale: 1 };
    }
    const a = VUI.cursorAlpha;
    return {
      color: rgb(Math.round(255 * a), Math.round(50 * a), Math.round(95 * a),
        Math.round(255 * (a * 0.3 + 0.7))),
      scale: a * 0.3 + 0.8,
    };
  }

  /** Canvas 原版光标：菜单与游戏内统一绘制（系统光标已被 #sw-cursor-style 全树隐藏）。
   *  触屏设备不画指针（原版移动端同语义——触摸定位无需指针精灵）。
   *  双 pass（Main.DrawCursor :47436-47439 鼠标分支）：①阴影垫底 = 同贴图
   *  offset(+1,+1)、RGB×0.2/A×0.5、scale×1.1（深色描边观感来源）；②主 pass 本色。 */
  private static drawCursor() {
    if (!VUI.batch || !VUI.enabled) return;
    if (isTouchDevice()) return;
    const tex = UITextures.get(VUI.smartCursorOn ? 'UI_Cursor_1' : 'UI_Cursor_0');
    if (!tex) return;
    const x = Math.round(UIScale.mouseX);
    const y = Math.round(UIScale.mouseY);
    const cc = VUI.cursorColorState();
    // ① 阴影 pass（:47437）：色×0.2/A×0.5、offset(+1,+1)、scale×1.1
    VUI.batch.draw(tex, x + 1, y + 1, {
      color: rgb(Math.round(cc.color.r * 0.2), Math.round(cc.color.g * 0.2),
        Math.round(cc.color.b * 0.2), Math.round(cc.color.a * 0.5)),
      scale: cc.scale * 1.1,
    });
    // ② 主 pass（:47438）
    VUI.batch.draw(tex, x, y, { color: cc.color, scale: cc.scale });
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
