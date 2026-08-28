// DOM UI 目标判定(2026-08-29 手机适配 P0):此前 mousedown 门(Input.mousedown)与
// 触摸合成门(Input.isUiTarget)各自手维护一份类名清单且内容漂移(touch 版多
// .sw-mobile/.sw-hotbar/.sw-tooltip/.sw-ach-panel/.sw-res-panel/.sw-drag-ghost),
// 漏登记会把 UI 点击漏成世界挥剑(2026-08-28 商店案同族)。现收口为【唯一数组】,
// 所有"这个点击算不算 UI"的判定都走这里;新增触屏面板一律挂 .sw-mobile 子树或
// 把类名登记进本表(二选一,禁止另起第二份名单)。
//
// 取并集原则:并集只会让"本应是 UI 的点击"更不会穿透为游戏输入;.sw-mobile 等
// 仅触屏渲染的层在桌面不可见,并集对桌面 mousedown 门零影响(逐字节等价)。
export const DOM_UI_TARGET_SELECTOR =
  '.sw-root, .sw-panel, .sw-slot, .sw-recipe, .sw-btn, .sw-chatbox,' +
  '.sw-mobile, .sw-hotbar, .sw-tooltip, .sw-drag-ghost,' +
  '.sw-ach-panel, .sw-res-panel';

/** event.target 是否落在 DOM UI 上(命中=点击归 UI,不透传为世界输入) */
export function isDomUiTarget(t: EventTarget | null | undefined): boolean {
  return !!t && (t as HTMLElement).closest?.(DOM_UI_TARGET_SELECTOR) != null;
}
