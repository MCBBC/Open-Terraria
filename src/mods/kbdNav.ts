// mod 面板键盘导航(★键盘导航域,2026-10-14;vui 保留树扩展)。
// 形态:焦点索引制——焦点元素走既有 hover 语义(mouseOver/mouseOut 程序化派发=
// isMouseHovering+样式+onMouseOver 钩全复用),Enter/Space 走既有 click 派发。
// 键位:↑/←=上一交互元素、↓/→=下一、Tab 循环、Enter/Space 激活、Esc 走既有链。
// 焦点候选=可见∧有 'click' 订阅的元素(按树序);面板开合/焦点元素摘除=自动校正。
import { VUI } from '../vui/VUI';
import { UIElement } from '../vui/core/UIElement';
import { UIMouseEvent } from '../vui/core/UIMouseEvent';
import { UIScale } from '../vui/draw/UIScale';

let installed = false;
let focusIdx = -1;
/** 焦点帧缓存(开合沿/树变沿失效) */
let cachedList: UIElement[] = [];
let cachedDirty = true;

/** ★语义注册制(2026-10-14 第二版):mods/ui handle 的 addButton/addSlot 显式注册
 *  ——旧树序 DFS 会把 UIPanel 根/标题栏(titleBar 拖拽 click)卷进焦点序。Set+remove
 *  探针(el.parent=null=已摘)自清。 */
const focusRegistry = new Set<UIElement>();
export function registerKbdFocusable(el: UIElement): void { focusRegistry.add(el); }
/** ★KB-3:焦点集反注册(面板元素移除沿) */
export function unregisterKbdFocusable(el: UIElement): void {
  focusRegistry.delete(el);
  if (el.kbdFocus) el.kbdFocus = false;
}

/** ★R-B-KB-2(2026-10-14):可达性=沿 parent 回溯到「无父根」且根∈current 直子。
 *  旧判据 el.parent!==null 对「面板隐藏」失效——rebuildHostTree 的
 *  removeAllChildren 只断面板根的 parent,面板根的【子】(按钮)parent 恒非空
 *  =隐藏面板按钮永为焦点候选(隐形激活/跨世界激活)。 */
const reachable = (el: UIElement, cur: UIElement): boolean => {
  let node: UIElement | null = el;
  while (node.parent) node = node.parent;
  return node === cur;
};

const isInteractive = (el: UIElement, cur: UIElement): boolean => {
  if (!focusRegistry.has(el)) return false;
  if (el.ignoresMouseInteraction || el.passThroughMouseInteraction) return false;
  return reachable(el, cur);
};

const focusables = (): UIElement[] => {
  const cur = VUI.ui.current;
  if (!cur) return [];
  if (cachedDirty) {
    cachedList = [...focusRegistry].filter((el) => isInteractive(el, cur));
    cachedDirty = false;
  }
  return cachedList;
};

/** 焦点迁移(前元素 mouseOut/新元素 mouseOver=既有语义全复用) */
const setFocus = (list: UIElement[], idx: number): void => {
  const prev = list[focusIdx];
  if (prev) {
    prev.mouseOut(new UIMouseEvent(prev, { x: 0, y: 0 }));
    prev.kbdFocus = false;   // ★R-B-KB-4:焦点环旗随迁移
  }
  focusIdx = idx;
  const el = list[idx];
  if (el) {
    el.kbdFocus = true;
    const d = el.getDimensions();
    el.mouseOver(new UIMouseEvent(el, { x: d.x + d.width / 2, y: d.y + d.height / 2 }));
    // ★A8(2026-10-14):hover 回写(KB-6/7)——下帧 UserInterface.update 对
    //  lastElementHover 恒等判定=鼠标仍停本元素时不重派 mouseOut(焦点视觉不再
    //  被迁移沿抹掉);真实鼠标移入其他元素时 update 正常接管(双系统收敛)
    VUI.ui.setLastElementHover(el);
  }
};

/** 键处理(window keydown 捕获;面板现役才消费) */
const onKey = (e: KeyboardEvent): void => {
  if (VUI.ui.current === null) return;
  // ★R-B-KB-1(2026-10-14):消费门=输入让位面(modUiBlockingPointer——fullscreen
  //  整屏让位/普通面板=指针在其上)。旧判据「vui 现役即消费」把非全屏面板开着时的
  //  世界方向键/Space 跳跃全吞(捕获相 stopPropagation 截断 Input 冒泡相键面)。
  //  文本输入让位(UITextBox=隐藏 DOM input 载体,捕获相位拦截曾断其编辑)
  if (typeof document !== 'undefined'
    && (document.activeElement as HTMLElement | null)?.tagName === 'INPUT') return;
  if (!(blockingProbe?.() ?? false)) return;   // 未注入=不消费(零 mod 面板语义)
  const list = focusables();
  if (list.length === 0) return;
  const nav = e.key === 'ArrowDown' || e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey);
  const navBack = e.key === 'ArrowUp' || e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey);
  if (nav || navBack) {
    e.preventDefault();
    e.stopPropagation();
    if (focusIdx < 0 || focusIdx >= list.length) {
      setFocus(list, navBack ? list.length - 1 : 0);
    } else {
      const next = navBack
        ? (focusIdx - 1 + list.length) % list.length
        : (focusIdx + 1) % list.length;
      setFocus(list, next);
    }
  } else if ((e.key === 'Enter' || e.key === ' ') && focusIdx >= 0 && focusIdx < list.length) {
    e.preventDefault();
    e.stopPropagation();
    const el = list[focusIdx];
    const d = el.getDimensions();
    el.click(new UIMouseEvent(el, { x: d.x + d.width / 2, y: d.y + d.height / 2 }));
  }
};

/** 安装(首面板沿;幂等) */
/** 输入让位谓词(mods/ui 注入——kbdNav←ui 循环环避免:ui install 沿传) */
let blockingProbe: (() => boolean) | null = null;
export function setKbdNavBlockingProbe(fn: () => boolean): void { blockingProbe = fn; }

export function installModKbdNav(): void {
  if (typeof window === 'undefined') return;
  // ★蓝队自检 B3(2026-10-14):removeEventListener 先行=幂等重装(热重载 teardown
  //  reset installed=false 后再装,旧 listener 若不移除=onKey 双份=按键双步跳)
  if (typeof window.removeEventListener === 'function') window.removeEventListener('keydown', onKey, true);
  window.addEventListener('keydown', onKey, true);
  installed = true;
}

/** 树变沿失效(面板开合/show/hide/addElement 后调;焦点索引保留=列表重扫) */
export function invalidateModKbdNav(): void {
  // ★R-B-KB-5:mouseOut 用【旧 cachedList】(新列表 collect 后 focusIdx 越界位
  //  按定义恒 undefined=死支;旧列表才有被摘元素引用)
  if (focusIdx >= 0 && cachedList[focusIdx]) {
    cachedList[focusIdx]!.mouseOut(new UIMouseEvent(cachedList[focusIdx]!, { x: 0, y: 0 }));
    cachedList[focusIdx]!.kbdFocus = false;   // ★R-B-KB-4
  }
  focusIdx = -1;
  cachedDirty = true;
}

/** 测试/诊断:focus 态快照 */
export function _kbdNavDebug(): { focusIdx: number; listLen: number; current: unknown } {
  return { focusIdx, listLen: focusables().length, current: VUI.ui.current };
}

/** 测试清账 */
export function _resetModKbdNavForTests(): void {
  if (focusIdx >= 0) {
    const prev = cachedList[focusIdx];
    if (prev) { prev.mouseOut(new UIMouseEvent(prev, { x: 0, y: 0 })); prev.kbdFocus = false; }
  }
  focusIdx = -1;
  cachedList = [];
  cachedDirty = true;
  focusRegistry.clear();   // 语义焦点集随清(测试隔离;生产=面板销毁沿 parent 断链自清)
  installed = false;       // 重装允许(测试隔离)
}
