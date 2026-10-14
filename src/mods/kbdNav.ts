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

const isInteractive = (el: UIElement): boolean => {
  if (!focusRegistry.has(el)) return false;
  if (el.ignoresMouseInteraction || el.passThroughMouseInteraction) return false;
  return el.parent !== null;   // remove() 置 null=已摘
};

const focusables = (): UIElement[] => {
  if (cachedDirty) {
    cachedList = [...focusRegistry].filter(isInteractive);
    cachedDirty = false;
  }
  return cachedList;
};

/** 焦点迁移(前元素 mouseOut/新元素 mouseOver=既有语义全复用) */
const setFocus = (list: UIElement[], idx: number): void => {
  const prev = list[focusIdx];
  if (prev) {
    prev.mouseOut(new UIMouseEvent(prev, { x: 0, y: 0 }));
  }
  focusIdx = idx;
  const el = list[idx];
  if (el) {
    const d = el.getDimensions();
    el.mouseOver(new UIMouseEvent(el, { x: d.x + d.width / 2, y: d.y + d.height / 2 }));
  }
};

/** 键处理(window keydown 捕获;面板现役才消费) */
const onKey = (e: KeyboardEvent): void => {
  if (VUI.ui.current === null) return;
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
export function installModKbdNav(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', onKey, true);
}

/** 树变沿失效(面板开合/show/hide/addElement 后调;焦点索引保留=列表重扫) */
export function invalidateModKbdNav(): void {
  cachedDirty = true;
  if (focusIdx >= 0) {
    const list = focusables();
    if (focusIdx >= list.length) {
      const prev = list[focusIdx];
      if (prev) prev.mouseOut(new UIMouseEvent(prev, { x: 0, y: 0 }));
      focusIdx = -1;
    }
  }
}

/** 测试/诊断:focus 态快照 */
export function _kbdNavDebug(): { focusIdx: number; listLen: number; current: unknown } {
  return { focusIdx, listLen: focusables().length, current: VUI.ui.current };
}

/** 测试清账 */
export function _resetModKbdNavForTests(): void {
  if (focusIdx >= 0) {
    const prev = cachedList[focusIdx];
    if (prev) prev.mouseOut(new UIMouseEvent(prev, { x: 0, y: 0 }));
  }
  focusIdx = -1;
  cachedList = [];
  cachedDirty = true;
}
