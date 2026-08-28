// 触屏会话判定·单一来源(mobile-adaptation-plan P0)。
// 此前判据活写在 ui/MobileControls.ts,本模块收口后所有"当前是不是触屏会话"
// 的分支(世界触摸合成/虚拟控件层/HUD 档位/光标绘制豁免/进世界全屏请求)共用
// 一份真相——★桌面隔离总闸:d0 档一切触屏增强零参与。
let TOUCH_cached: boolean | undefined;

/** 触屏设备判定（粗指针 = 手机/平板;桌面触摸屏带鼠标时仍启用——可玩不碍事） */
export function isTouchDevice(): boolean {
  // ★一次判定终身缓存(2026-08-19 trace:matchMedia 逐帧调用 0.1%——VUI.drawCursor
  //   每帧调此函数;指针类型会话内不变)
  if (TOUCH_cached !== undefined) return TOUCH_cached;
  if (typeof window === 'undefined') return false;
  // ★maxTouchPoints>0 收紧(mobile-adaptation-plan 模块②风险条目):iPad 外接
  //   触控板/鼠标造成的 pointer:coarse 假阳会误开整套操控层;'ontouchstart'
  //   in window 保留兜底旧 Safari
  TOUCH_cached = !!(window.matchMedia?.('(pointer: coarse)').matches
    && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window))
    || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  return TOUCH_cached;
}
