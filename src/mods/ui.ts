// mod 游戏内 UI 宿主(★刀1,2026-10-13;工坊普查五刀战役,锚点见
// docs/mod-five-knives-recon-2026-10-13.md 刀1 节)。
// 形态:vui 保留树晋升游戏内——ModUIHostState(UIState 子类)承载全部 mod 面板,
// 有可见面板时 setState(host)(ui-canvas 退出光标独占=full 模式,零新画布层),
// 全收后回 setState(null)。输入桥:①VUI 输入全在 window 层(mousedown/up/move
// 监听与 pointer-events 无关)=PE 切换免了;②Game.inpOverDomUi 头部 modUiBlocking
// Pointer() 短路(宿主现役+命中非空=UI 吃指针,世界交互门让位);③ESC 链
// closeModPanels 支(escapeChain.ts,关最上层)。
// 铁律:复用 ui-canvas 禁新画布层(contextlost 风暴史);文本走 PixelText/bake 族
// (UIText 内建);面板=UIPanel 九宫格+标题栏拖拽+关闭钮;级联定位防叠生。
import { VUI } from '../vui/VUI';
import { UIState } from '../vui/core/UIState';
import { UIElement } from '../vui/core/UIElement';
import { UIPanel } from '../vui/elements/UIPanel';
import { UIText } from '../vui/elements/UIText';
import { UITextPanel } from '../vui/elements/UITextPanel';
import { StyleDimension } from '../vui/core/StyleDimension';
import { UIScale } from '../vui/draw/UIScale';

/** mod 面板句柄(sw.ui.panel 产) */
export interface ModPanelHandle {
  readonly key: string;
  readonly visible: boolean;
  /** 文本行(UIText;PixelText/bake 管线) */
  addText(text: string, o: { x: number; y: number; scale?: number; large?: boolean }): void;
  /** 按钮(UITextPanel;onClick 左键) */
  addButton(text: string, o: { x: number; y: number; w?: number; h?: number; onClick: () => void }): void;
  /** 面板定位(逻辑 px,屏幕系) */
  setPosition(x: number, y: number): void;
  moveBy(dx: number, dy: number): void;
  show(): void;
  hide(): void;
  toggle(): void;
  close(): void;
}

interface PanelEntry {
  modId: string;
  key: string;
  fullKey: string;
  root: UIPanel;
  titleBar: UITextPanel;
  visible: boolean;
  dragOffX: number;
  dragOffY: number;
  dragging: boolean;
  /** 句柄缓存(同键重开返回同一对象=引用稳定) */
  handle?: ModPanelHandle;
}

/** 宿主 state(全面板的 retained 根;visible 面板按打开序 append=后开者在上) */
class ModUIHostState extends UIState {}

const hostState = new ModUIHostState();
/** 全键 → 面板 entry(注册面;visible 与否都在) */
const panels = new Map<string, PanelEntry>();
/** 打开序(顶层=末位) */
const openOrder: PanelEntry[] = [];
let inGame = false;
let cascade = 0;

/** 现役可见面板数 */
function visibleCount(): number {
  let n = 0;
  for (const p of openOrder) if (p.visible) n++;
  return n;
}

function rebuildHostTree(): void {
  hostState.removeAllChildren();
  for (const p of openOrder) {
    if (p.visible) hostState.append(p.root);
  }
  sync();
}

function sync(): void {
  const want = inGame && visibleCount() > 0;
  const cur = VUI.ui.current;
  if (want && cur !== hostState) VUI.setState(hostState);
  else if (!want && cur === hostState) VUI.setState(null);
}

/** 游戏内旗(装载/卸载沿调;菜单态面板不接管 vui) */
export function modUiSetInGame(v: boolean): void {
  inGame = v;
  if (!v) sync();
}

/** 世界装载沿重同步(读档/换世界后面板恢复接管)。
 *  ★红队 R-C-F1:stopMenu 的 setState(null) 在 Game.start【之后】跑(mainFlow 时序)——
 *  裸 null 会摘掉宿主;世界进入链末尾须调本函数替代。
 *  @param forceClear true=保留原 stopMenu 无条件清场语义(无面板也摘——清生成页残帧);
 *  false=仅在宿主现役/需摘时动 setState(游戏内常规沿)。 */
export function modUiResync(forceClear = false): void {
  const want = inGame && visibleCount() > 0;
  if (want) {
    if (VUI.ui.current !== hostState) VUI.setState(hostState);
  } else if (forceClear || VUI.ui.current === hostState) {
    VUI.setState(null);
  }
}

/** 世界输入让位判定(Game.inpOverDomUi 头部短路;纯算术盒命中,零 DOM 布局成本)。
 *  ★命中须落在面板子树——宿主 state 根=全屏盒 containsPoint 恒真,根自身不算命中 */
export function modUiBlockingPointer(): boolean {
  if (!inGame || visibleCount() === 0) return false;
  if (VUI.ui.current !== hostState) return false;
  const el = VUI.elementUnderMouse();
  if (!el || el === hostState) return false;
  let cur: UIElement | null = el;
  while (cur && cur !== hostState) cur = cur.parent;
  return cur === hostState;
}

/** ESC 链消费:关最上层可见面板(escapeChain closeModPanels 支);false=无可关 */
export function modUiCloseTop(): boolean {
  for (let i = openOrder.length - 1; i >= 0; i--) {
    if (openOrder[i].visible) {
      openOrder[i].visible = false;
      rebuildHostTree();
      return true;
    }
  }
  return false;
}

/** 关指定 mod 的全部面板(sw.ui.closeAll;面板保留可重开) */
export function modUiCloseAllOf(modId: string): void {
  let touched = false;
  for (const p of openOrder) {
    if (p.modId === modId && p.visible) { p.visible = false; touched = true; }
  }
  if (touched) rebuildHostTree();
}

export function modUiPanelsOpen(): boolean {
  return visibleCount() > 0;
}

/** 面板包装器工厂(sw.ui.panel)。
 *  @param modId 命名空间(api 层注入) @param key mod 内键(同键重开=聚焦既有面板) */
export function modUiPanel(
  modId: string, key: string,
  opts: { title?: string; x?: number; y?: number; width: number; height: number;
    draggable?: boolean; closable?: boolean },
): ModPanelHandle {
  const fullKey = `mod_${modId}_${key}`;
  const existing = panels.get(fullKey);
  if (existing) {
    // 同键重开=聚焦置顶+显示
    if (!existing.visible) {
      existing.visible = true;
      openOrder.splice(openOrder.indexOf(existing), 1);
      openOrder.push(existing);
      rebuildHostTree();
    } else {
      openOrder.splice(openOrder.indexOf(existing), 1);
      openOrder.push(existing);
      rebuildHostTree();
    }
    return (existing.handle ??= makeHandle(existing));
  }
  if (!(opts.width >= 40 && opts.height >= 24)) {
    throw new Error(`[mod-ui] 面板尺寸过小(≥40×24): ${fullKey}`);
  }
  const root = new UIPanel();
  root.width = StyleDimension.fromPixels(opts.width);
  root.height = StyleDimension.fromPixels(opts.height);
  const x = opts.x ?? ((cascade * 28) % Math.max(80, UIScale.logicalW - opts.width - 40)) + 40;
  const y = opts.y ?? ((cascade * 24) % Math.max(60, UIScale.logicalH - opts.height - 60)) + 60;
  cascade++;
  root.left = StyleDimension.fromPixels(Math.round(x));
  root.top = StyleDimension.fromPixels(Math.round(y));

  const entry: PanelEntry = {
    modId, key, fullKey, root,
    titleBar: new UITextPanel(opts.title ?? key, 0.8, false),
    visible: true, dragOffX: 0, dragOffY: 0, dragging: false,
  };
  // 标题栏(拖拽柄;高度 24)
  entry.titleBar.width = StyleDimension.fromPixels(opts.width);
  entry.titleBar.height = StyleDimension.fromPixels(24);
  root.append(entry.titleBar);
  const draggable = opts.draggable !== false;
  if (draggable) {
    entry.titleBar.onMouseDown(() => { entry.dragging = true; bringToFront(entry); });
    entry.titleBar.onMouseUp(() => {
      if (entry.dragging) {
        entry.dragging = false;
        // 拖拽落点写回布局坐标(下一帧 recalculate 生效)
        const d = root.getDimensions();
        root.left = StyleDimension.fromPixels(Math.round(d.x));
        root.top = StyleDimension.fromPixels(Math.round(d.y));
      }
    });
    // 拖拽推进(每帧;UIScale.mouse 全局已由 VUI window 监听维护)
    entry.titleBar.onUpdate(() => {
      if (!entry.dragging) return;
      const d = root.getDimensions();
      const mx = UIScale.mouseX, my = UIScale.mouseY;
      const nx = Math.round(Math.max(0, Math.min(UIScale.logicalW - 24, mx - entry.dragOffX)));
      const ny = Math.round(Math.max(0, Math.min(UIScale.logicalH - 24, my - entry.dragOffY)));
      if (Math.abs(nx - d.x) < 0.5 && Math.abs(ny - d.y) < 0.5) return;
      root.left = StyleDimension.fromPixels(nx);
      root.top = StyleDimension.fromPixels(ny);
      root.recalculate();
    });
  } else {
    entry.titleBar.onMouseDown(() => bringToFront(entry));
  }
  // 记拖拽抓取偏移(mousedown 时鼠标相对面板左上的距离;冒泡序=titleBar 先、root 后)
  root.onMouseDown(() => {
    const d = root.getDimensions();
    entry.dragOffX = UIScale.mouseX - d.x;
    entry.dragOffY = UIScale.mouseY - d.y;
  });
  // 关闭钮(右上角 18×18)
  if (opts.closable !== false) {
    const closeBtn = new UITextPanel('X', 0.7, false);
    closeBtn.width = StyleDimension.fromPixels(18);
    closeBtn.height = StyleDimension.fromPixels(18);
    closeBtn.left = StyleDimension.fromPixels(opts.width - 22);
    closeBtn.top = StyleDimension.fromPixels(3);
    closeBtn.onClick(() => { entry.visible = false; rebuildHostTree(); });
    root.append(closeBtn);
  }
  // 点击置顶(体面任意左键;标题栏拖拽面已带)
  root.onClick(() => bringToFront(entry));

  panels.set(fullKey, entry);
  openOrder.push(entry);
  rebuildHostTree();
  return (entry.handle ??= makeHandle(entry));
}

function bringToFront(p: PanelEntry): void {
  const i = openOrder.indexOf(p);
  if (i < 0 || i === openOrder.length - 1) return;
  openOrder.splice(i, 1);
  openOrder.push(p);
  rebuildHostTree();
}

function makeHandle(p: PanelEntry): ModPanelHandle {
  return {
    key: p.key,
    get visible() { return p.visible; },
    addText(text, o) {
      const t = new UIText(text, o.scale ?? 0.8, o.large ?? false);
      t.left = StyleDimension.fromPixels(o.x);
      t.top = StyleDimension.fromPixels(o.y);
      p.root.append(t);
    },
    addButton(text, o) {
      const b = new UITextPanel(text, 0.8, false);
      const bw = o.w ?? Math.max(60, text.length * 10 + 16);
      b.width = StyleDimension.fromPixels(bw);
      b.height = StyleDimension.fromPixels(o.h ?? 22);
      b.left = StyleDimension.fromPixels(o.x);
      b.top = StyleDimension.fromPixels(o.y);
      b.onClick(() => o.onClick());
      p.root.append(b);
    },
    setPosition(x, y) {
      p.root.left = StyleDimension.fromPixels(Math.round(x));
      p.root.top = StyleDimension.fromPixels(Math.round(y));
      p.root.recalculate();
    },
    moveBy(dx, dy) {
      const d = p.root.getDimensions();
      this.setPosition(d.x + dx, d.y + dy);
    },
    show() { p.visible = true; rebuildHostTree(); },
    hide() { p.visible = false; rebuildHostTree(); },
    toggle() { p.visible = !p.visible; rebuildHostTree(); },
    close() { this.hide(); },
  };
}

/** 测试/卸载清账(引擎 vui 全局树单例——只摘本域面板) */
export function _resetModUiForTests(): void {
  for (const p of panels.values()) {
    p.visible = false;
    p.root.remove();
  }
  panels.clear();
  openOrder.length = 0;
  cascade = 0;
  sync();
}
