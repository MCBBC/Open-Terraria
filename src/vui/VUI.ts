// VUI 根控制器：ui-canvas 管理、帧循环挂接、鼠标输入、光标绘制。
// 用法：VUI.init(parent) → await VUI.ready() → VUI.setState(new XxxState())
// 帧循环：菜单期由 main.ts 的 rAF 驱动 VUI.frame(dt)；进游戏后挂 Game 渲染末尾。
import { UserInterface } from './core/UserInterface';
import type { UIState } from './core/UIState';
import { UIScale } from './draw/UIScale';
import { UISpriteBatch, rgb } from './draw/UISpriteBatch';
import { UITextures } from './assets/UITextures';
import { resolveTouchMode } from '../core/input/touchMode';
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
    window.addEventListener('blur', () => VUI.clearForBlur());
    window.addEventListener('focus', () => { VUI.hasFocus = true; });
    // wheel 记 UI 侧增量；游戏侧 Input 另有自己的监听（分流在 main.ts 编排）
    // ★SW-RB14d（FX38-F6）：取负对齐原版 ScrollWheelDeltaForUI 语义（上滚为正,
    // PlayerInput.cs:902;浏览器 deltaY 上滚为负）。旧直传 sign(deltaY) 经
    // UIList.scrollWheel `viewPosition -= value`（UserInterface.cs:219-222 →
    // UIList.cs:109-116 同式）= 上滚向列表底,与原版上滚向顶反向无补偿。
    window.addEventListener('wheel', (e) => { VUI.wheel += -Math.sign(e.deltaY); }, { passive: true });
  }

  /** 窗口失焦清理（SW-BA1 2026-09-06；镜像 Input.clearForBlur 的「失焦=无按住态」
   *  约定，blur 与测试共用入口）。旧版只清 leftDown——rightDown/rightPresses/
   *  rightReleases 残留=幽灵右键（RB2 A-5 同族）：失焦期松键收不到 mouseup，
   *  rightDown=true 一路残到下一次右键 down-up 对才自愈，期间 ui.update 收到幽灵
   *  按住态；未消费的按下计数跨失焦也会在回焦首帧被当新沿消费。故电平与计数
   *  全套归零（blur 与 mousedown 无竞争：失焦窗内点击先 focus 再派发 mousedown，
   *  不丢真沿）。 */
  static clearForBlur(): void {
    VUI.hasFocus = false;
    VUI.leftDown = false;
    VUI.rightDown = false;
    VUI.presses = 0;
    VUI.releases = 0;
    VUI.rightPresses = 0;
    VUI.rightReleases = 0;
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
    if (resolveTouchMode() === 'touch') return;
    VUI.paintCursor(Math.round(lx), Math.round(ly));
  }

  /** 智能光标激活中（Game 每帧写入）：指针切换到 Cursors[12] 帧（Main.cs:48888 num=11+smart，1456 :47465 同式） */
  static smartCursorOn = false;

  /** Main.cursorOverride（:2131）：非 -1 = 光标本体整帧替换为 Cursors[override] 白帧
   *  （DrawInterface_36_Cursor :46026-46067）。1457 原版唯一置位面 = npcChatCornerItem>0
   *  悬停（渔夫任务鱼角标,DrawNPCChatBottomRightItem :40502 置 2、:45696 每帧复位;
   *  RequestHome -1 态角标【不】置,只叠 EquipPage[7] 金染 :40530-40539）。
   *  本仓 = 事件驱动:NpcDialog 任务鱼角标 mouseenter/leave 置/复位（等价每帧
   *  重算,面板关闭由 close() 兜底复位防悬死）。原版其余 override 值 3..10 仅在
   *  白帧白名单（:46042-46047）中备用、无置位方——本仓只接 2。 */
  static cursorOverride = -1;

  /** MouseBorderColor 默认档（Main.cs:276 = (64,64,64,64);LoadSettings :4554-4570 可被
   *  config.json 覆盖,本机实机 config.json 实测同值;本仓无该设置建模,钉默认档）。
   *  ★XNA 预乘语义（α=0 纯加法同族判例）:R=G=B=A=64 =「白色 ×α 64/255」半透明白,
   *  非深灰——这就是用户所见的白色描边。画布直 α 转写 = 白帧 + globalAlpha=64/255
   *  （tinted() 吃 color.a,透明度必须走 opts.alpha,尘预乘 add 面 α 判例同源） */
  private static readonly BORDER_ALPHA = 64 / 255;

  /** 光标染色态（Main.CursorColor :53275-53294 1:1，1456 :51886-51906 同式）：
   *  mouseColor 默认 = RGB(255,50,95) 粉红（:67610——曾画纯白=丢染色链）；
   *  cursorAlpha 在 0.6..1 呼吸（±0.015/t）；RGB×alpha、A=255×(alpha×0.3+0.7)、
   *  scale=alpha×0.3+0.8 同步呼吸。hasRainbowCursor → HSL 环转（:48806-48807,
   *  ★!gameMenu 门:菜单恒本色——本仓 Game 侧未接 rainbow 写入,恒 false 备案） */
  static cursorAlpha = 1;
  static cursorColorDirection = 1;
  static rainbowCursor = false;   // Player.hasRainbowCursor（Game 每帧写入）

  private static cursorColorState(): { color: ReturnType<typeof rgb>; scale: number } {
    VUI.cursorAlpha += VUI.cursorColorDirection * 0.015;
    if (VUI.cursorAlpha >= 1) { VUI.cursorAlpha = 1; VUI.cursorColorDirection = -1; }
    if (VUI.cursorAlpha <= 0.6) { VUI.cursorAlpha = 0.6; VUI.cursorColorDirection = 1; }
    if (VUI.rainbowCursor) {
      // HSL 环转（Main.cs:48807 hslToRgb(hourly*0.25%1,1,0.5)；标准 HSL→RGB）
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

  /** ThickMouse 白描边（Main.DrawThickCursor :48865-48913，1456 :47442 同式）：
   *  Cursors[11+smart] 沿四向 (0,1)(1,0)(0,-1)(-1,0)+Vector2.One*2、origin(2,2)、
   *  scale=cursorScale×1.1、色=MouseBorderColor（默认档=预乘白×64/255）——白描边
   *  本体,默认设置恒画（ThickMouse=(MouseBorderColor≠Transparent) :2684,默认非
   *  Transparent）。返回 bonus=(2,2)：阴影/主 pass 整体右下移（无 ThickMouse 才
   *  为零向量;贴图未就绪只缺描边不挪位,防懒载首帧光标跳 2px）。
   *  游戏柄覆盖帧 num=13/15（:48892-48903）本仓无游戏柄光标,备案不移植。 */
  private static drawThickCursor(x: number, y: number, smart: boolean,
    cc: { scale: number }): { x: number; y: number } {
    const tex = UITextures.get(smart ? 'UI_Cursor_12' : 'UI_Cursor_11');
    if (tex && VUI.batch) {
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
        VUI.batch.draw(tex, x + 2 + dx, y + 2 + dy, {
          color: rgb(255, 255, 255), alpha: VUI.BORDER_ALPHA,
          scale: cc.scale * 1.1, originX: 2, originY: 2,
        });
      }
    }
    return { x: 2, y: 2 };
  }

  /** cursorOverride 白帧支（:46035-46047）：Cursors[2] 单 pass——纯白、
   *  scale=cursorScale×0.7（num3）、origin=帧×0.1（vector=(0.1,0.1)×Size）、
   *  flag=false 无阴影、且不画 ThickMouse 描边（override 分支不调 DrawThickCursor）。
   *  贴图未就绪回 false 落回普通链（清单键已入 vanilla-ui.json,懒载首帧短暂回落）。 */
  private static drawOverrideCursor(x: number, y: number, cc: { scale: number }): boolean {
    if (VUI.cursorOverride !== 2 || !VUI.batch) return false;
    const tex = UITextures.get('UI_Cursor_2');
    if (!tex) return false;
    VUI.batch.draw(tex, x, y, {
      color: rgb(255, 255, 255), scale: cc.scale * 0.7,
      originX: tex.sw * 0.1, originY: tex.sh * 0.1,
    });
    return true;
  }

  /** Canvas 原版光标：菜单与游戏内统一绘制（系统光标已被 #sw-cursor-style 全树隐藏）。
   *  触屏设备不画指针（原版移动端同语义——触摸定位无需指针精灵）。
   *  DrawInterface_36_Cursor（:46007-46073）三支 1:1：⓪cursorOverride 白帧支 →
   *  ①ThickMouse 白描边（DrawThickCursor,先画=垫底）→ ②DrawCursor 鼠标分支
   *  （:48848-48849）阴影垫底 + 本色,均吃 bonus=(2,2)。
   *  ★预乘→直 α 转写（XNA SpriteBatch src=tex×color 预乘,画布=直 α）:
   *  fill 强度 = 预乘RGB÷α、globalAlpha = α——旧实现把 A 项喂进 tinted() 的
   *  multiply 强度（该通道只衰减染色不产透明）=阴影恒不透明 3 倍浓、主 pass
   *  呼吸谷不透底,本次对齐。悬停对象类别不换帧:原版鼠标光标无 NPC/敌怪悬停
   *  变体（换帧仅 smart :48868 与 override :40502 两面;锁敌括弧=LockOnHelper.Draw
   *  世界层覆盖物,本仓未建该子系统,备案）。 */
  private static paintCursor(x: number, y: number) {
    const batch = VUI.batch;
    if (!batch) return;
    const cc = VUI.cursorColorState();   // 每帧恰一次推进（0.6..1 呼吸）
    // ⓪ cursorOverride 支（:46026-46067）
    if (VUI.drawOverrideCursor(x, y, cc)) return;
    const smart = VUI.smartCursorOn;
    // ① ThickMouse 描边（:48860,先于阴影/本体=垫底）
    const bonus = VUI.drawThickCursor(x, y, smart, cc);
    // ② 箭头本体（DrawCursor 鼠标分支 :48848-48849）
    const tex = UITextures.get(smart ? 'UI_Cursor_1' : 'UI_Cursor_0');
    if (!tex) return;
    const aMain = cc.color.a / 255;
    const aShad = aMain * 0.5;
    // 阴影 pass（:48848）：预乘 RGB×0.2 / A×0.5、offset bonus+(1,1)、scale×1.1
    batch.draw(tex, x + bonus.x + 1, y + bonus.y + 1, {
      color: rgb(Math.round((cc.color.r * 0.2) / aShad), Math.round((cc.color.g * 0.2) / aShad),
        Math.round((cc.color.b * 0.2) / aShad)),
      alpha: aShad, scale: cc.scale * 1.1,
    });
    // 主 pass（:48849）：预乘 cursorColor / A
    batch.draw(tex, x + bonus.x, y + bonus.y, {
      color: rgb(Math.round(cc.color.r / aMain), Math.round(cc.color.g / aMain),
        Math.round(cc.color.b / aMain)),
      alpha: aMain, scale: cc.scale,
    });
  }

  /** Canvas 原版光标入口（菜单全屏模式）：坐标取 UI 逻辑鼠标位 */
  private static drawCursor() {
    if (!VUI.batch || !VUI.enabled) return;
    if (resolveTouchMode() === 'touch') return;
    VUI.paintCursor(Math.round(UIScale.mouseX), Math.round(UIScale.mouseY));
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
