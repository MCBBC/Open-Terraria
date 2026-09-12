// 滚轮事件 → 原版滚轮量纲归一（★SW-FX51 2026-09-12 自 ui/craftingGrid.ts 迁入单源：
// 世界域滚轮消费面（Input.wheelDelta 入账,Input.ts）与 UI 域（craftingGrid.vanillaWheelNotches,
// FX38/RB14d）共用同一 deltaMode 归一算式——core 层不能反向 import ui/,故落本叶模块,
// craftingGrid 原位 re-export 保 import 面（tests/sw-rb14d-audit、sw-fx38 源锁不动）。

/** ★SW-RB14d：DOM wheel 事件 → 像素（deltaMode 归一）。DOM 规范：mode 0=pixel、
 *  1=line（Firefox 鼠标滚轮缺省,每 notch ≈ 3 行）、2=page。行高取通用约定 40px
 *  （WHATWG/FF 缺省行距近似;原版量化在 OS 层 ±120/notch,行模式换算只能近似）。
 *  旧刀 `deltaY*120` 两错：①行模式 1 行当 1 notch=约 3× 过计;②三处调用点全部
 *  未传 deltaMode（deltaMode 缺省 0）→ Firefox ±1..3/事件 trunc(±3/120)=0 整类吞零。 */
export function wheelEventPx(deltaY: number, deltaMode = 0): number {
  if (deltaMode === 1) return deltaY * 40;
  if (deltaMode === 2) return deltaY * 120;   // 页模式:发射源近乎绝迹,近似 120px/页
  return deltaY;
}
