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
import { UISlot, setUISlotAtlas, type UISlotItem, type UISlotOpts } from '../vui/elements/UISlot';
import { StyleDimension } from '../vui/core/StyleDimension';
import type { UISpriteBatch } from '../vui/draw/UISpriteBatch';
import type { DrawRect } from '../assets/SpriteAtlas';
import { UIScale } from '../vui/draw/UIScale';
import type { SpriteAtlas } from '../assets/SpriteAtlas';

/** mod 面板句柄(sw.ui.panel 产) */
export interface ModPanelHandle {
  readonly key: string;
  readonly visible: boolean;
  addText(text: string, o: { x: number; y: number; scale?: number; large?: boolean }): void;
  addButton(text: string, o: { x: number; y: number; w?: number; h?: number; onClick: () => void }): void;
  /** ★第五批:物品槽(UISlot;mod 自管库存,点击回调) */
  addSlot(o: { x: number; y: number; getItem(): { key: string; stack: number } | null; onLeftClick?: () => void; onRightClick?: () => void }): void;
  /** ★D15(2026-10-13):mod 贴图(tex=pack 相对路径 textures/ui/*.png 约定目录——
   *  assets 两支装载期注入 atlas;scale=整图缩放/或 w+h=盒适配) */
  addImage(o: { x: number; y: number; tex: string; scale?: number; w?: number; h?: number }): void;
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
  /** ★D15余债(2026-10-13):全屏页宿主(IngameFancyUI 同位)——可见期 uiBlocking=true
   *  (移动/键面/世界输入全封)+整屏指针让位;Esc 链 closeModPanels 支先于 uiBlocking
   *  让位=仍可关层 */
  fullscreen: boolean;
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
  modUiSyncDomGate();   // ★D19-F4:开合沿即同步(收板时指针不动也要还原 DOM PE)
  syncUiBlocking();     // ★D15余债:fullscreen 可见面变化沿
}

/** ★D15余债(2026-10-13):全屏页 uiBlocking 同步(IngameFancyUI 同位)——fullscreen
 *  声明面板可见期 game.input.uiBlocking=true(移动/键面/世界输入全封)。owned 旗
 *  防与原版模态互踩(只清自己置的);★蓝队自检(2026-10-13):原版模态先置 true 再开
 *  fullscreen 时,裸 owned 旗的清位会连原版的一起清=互踩——claim 期记 preExisting,
 *  释放期只在「我们置的且置位前非真」时清。ESC 链 closeModPanels 支先于 uiBlocking
 *  让位(:95/:104)=全屏页仍可 Esc 关。 */
let uiBlockingOwned = false;
let uiBlockingPreExisting = false;
function syncUiBlocking(): void {
  const g = (globalThis as { __swGame?: { input?: { uiBlocking: boolean } } }).__swGame;
  if (!g?.input) return;
  const want = inGame && openOrder.some((p) => p.visible && p.fullscreen);
  if (want && !uiBlockingOwned) {
    uiBlockingPreExisting = g.input.uiBlocking;   // 原版模态已在位=释放不清(归它)
    g.input.uiBlocking = true;
    uiBlockingOwned = true;
  } else if (!want && uiBlockingOwned) {
    if (!uiBlockingPreExisting) g.input.uiBlocking = false;
    uiBlockingOwned = false;
    uiBlockingPreExisting = false;
  }
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
  if (!v) {
    // ★D19-F10(2026-10-13):卸载沿全收(面板=世界会话产物)——Game.destroy 不关
    //  entries 会带陈旧内容「复活」到下一世界(F1 修复后随 rebuildHostTree 现身)。
    //  全收语义=面板隐藏不销毁(mod 依 onWorldLoad 重开;句柄引用稳定),菜单态
    //  panel() 仍可 build(sync no-op 不挂树,首次进世界沿现身)。
    //  进世界沿不动(modUiResync 由世界进入链末尾调用=F1 既有位次)。
    for (const p of openOrder) { p.visible = false; p.dragging = false; }   // ★R-C-F10-a:拖拽中退世界复位
    rebuildHostTree();
    uiBlockingOwned = false;   // ★D15余债:退世界不持锁(置位面随 rebuildHostTree 清)
    domGateOn = false; modUiSyncDomGate();   // ★D19-F4:退世界还原 PE
  }
}

/** atlas 注入(UISlot 物品图标/ModUIImage 贴图渲染用;assets 阶段调) */
let uiAtlasRef: SpriteAtlas | null = null;
export function modUiSetAtlas(atlas: SpriteAtlas | null): void {
  setUISlotAtlas(atlas);
  uiAtlasRef = atlas;
}

/** ★D15:mod 贴图元素(assets 两支注入键=vanilla/ModUI_<modId>_<扁平路径>.png;
 *  ensureVImage 命中直返(vimages 表),miss 走别名 fetch 晚到=下帧可见) */
class ModUIImage extends UIElement {
  constructor(private readonly modId: string, private readonly tex: string,
    private readonly scale = 1, private readonly fitW?: number, private readonly fitH?: number) {
    super();
    const t = uiAtlasRef?.ensureVImage(`vanilla/ModUI_${modId}_${ModUIImage.flatKey(modId, tex)}.png`);
    if (t) {
      const sc = fitW && fitH ? Math.min(fitW / t.width, fitH / t.height) : scale;
      this.width = StyleDimension.fromPixels(t.width * sc);
      this.height = StyleDimension.fromPixels(t.height * sc);
    } else {
      this.width = StyleDimension.fromPixels(fitW ?? 32);
      this.height = StyleDimension.fromPixels(fitH ?? 32);
    }
  }
  /** pack 相对路径 → 键尾扁平段(与 assets.ts 注入同式;子目录防撞) */
  private static flatKey(modId: string, tex: string): string {
    const rel = tex.startsWith('textures/ui/') ? tex.slice('textures/ui/'.length) : tex;
    return rel.replace(/\.png$/i, '').replace(/[^A-Za-z0-9]+/g, '_');
  }
  protected override drawSelf(batch: UISpriteBatch): void {
    const img = uiAtlasRef?.ensureVImage(`vanilla/ModUI_${this.modId}_${ModUIImage.flatKey(this.modId, this.tex)}.png`);
    if (!img) return;
    const d = this.getInnerDimensions();
    const sc = this.fitW && this.fitH ? Math.min(this.fitW / img.width, this.fitH / img.height) : this.scale;
    const rect: DrawRect = { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
    batch.draw(rect, d.x, d.y, { scale: sc });
  }
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
  // ★D15余债:fullscreen 面板可见=整屏命中(DOM 吞门/世界让位全覆盖)
  for (let i = openOrder.length - 1; i >= 0; i--) {
    if (openOrder[i].visible && openOrder[i].fullscreen) return true;
  }
  const el = VUI.elementUnderMouse();
  if (!el || el === hostState) return false;
  let cur: UIElement | null = el;
  while (cur && cur !== hostState) cur = cur.parent;
  return cur === hostState;
}

/** ★D19-F4(2026-10-13):DOM 侧吞门同步——指针落本域面板子树时挂 html
 *  sw-modpanel-swallow 类(.sw-root PE 全关,UI.ts CSS 规则),离板/收板还原。
 *  驱动=mousemove(挂一次)+面板开合沿(rebuildHostTree);PE 开关按沿去重。 */
let domGateInstalled = false;
let domGateOn = false;
export function modUiSyncDomGate(): void {
  if (typeof document === 'undefined') return;
  const on = inGame && visibleCount() > 0 && modUiBlockingPointer();
  if (on === domGateOn) return;
  domGateOn = on;
  document.documentElement.classList.toggle('sw-modpanel-swallow', on);
}
function ensureDomGate(): void {
  if (domGateInstalled || typeof window === 'undefined') return;
  domGateInstalled = true;
  window.addEventListener('mousemove', () => { if (inGame && panels.size > 0) modUiSyncDomGate(); });
}

/** ★R-C-F4-b(2026-10-13):触屏 tap 命中查询——面板(普通盒/fullscreen 整屏)在
 *  tap 点现役=true;同步写 UIScale.mouse 触屏坐标(触屏无 mousemove,旧=命中测试
 *  恒陈旧坐标)。Input.touchstart 消费(false=世界 tap 照常)。 */
export function modUiTouchGate(clientX: number, clientY: number): boolean {
  if (!inGame || visibleCount() === 0 || VUI.ui.current !== hostState) return false;
  for (let i = openOrder.length - 1; i >= 0; i--) {
    if (openOrder[i].visible && openOrder[i].fullscreen) return true;
  }
  const px = clientX / UIScale.scale, py = clientY / UIScale.scale;
  (UIScale as { mouseX?: number }).mouseX = px;
  (UIScale as { mouseY?: number }).mouseY = py;
  const el = VUI.elementUnderMouse();
  if (!el || el === hostState) return false;
  let cur: UIElement | null = el;
  while (cur && cur !== hostState) cur = cur.parent;
  return cur === hostState;
}

/** ★R-C-F4-b:触屏沿 DOM 吞门同步(触屏无 mousemove,Input.touchstart 消费面调) */
export function modUiSyncDomGateTouch(): void {
  modUiSyncDomGate();
}

/** ESC 链消费:关最上层可见面板(escapeChain closeModPanels 支);false=无可关 */
export function modUiCloseTop(): boolean {
  for (let i = openOrder.length - 1; i >= 0; i--) {
    if (openOrder[i].visible) {
      openOrder[i].visible = false;
      openOrder[i].dragging = false;   // ★R-C-F10-a
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
    if (p.modId === modId && p.visible) { p.visible = false; p.dragging = false; touched = true; }   // ★R-C-F10-a
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
    draggable?: boolean; closable?: boolean; fullscreen?: boolean },
): ModPanelHandle {
  ensureDomGate();   // ★D19-F4:首面板挂 mousemove 同步臂(幂等)
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
    fullscreen: opts.fullscreen === true,
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
    addSlot(o) {
      const s = new UISlot(o);
      s.left = StyleDimension.fromPixels(o.x);
      s.top = StyleDimension.fromPixels(o.y);
      p.root.append(s);
    },
    addImage(o) {
      const im = new ModUIImage(p.modId, o.tex, o.scale ?? 1, o.w, o.h);
      im.left = StyleDimension.fromPixels(o.x);
      im.top = StyleDimension.fromPixels(o.y);
      p.root.append(im);
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
    p.dragging = false;   // ★R-C-F10-a:拖拽态随收复位
    p.root.remove();
  }
  panels.clear();
  openOrder.length = 0;
  cascade = 0;
  sync();
}
