// 操作模式解析(mobile-adaptation-plan 用户需求 2026-08-29:"默认根据设备调整,
// 可手动切换")。
// touchOpMode='auto'(默认)= 按 isTouchDevice 判定;'touch'=强制触屏档(带鼠标的
// 触摸本/想在桌面触屏上游玩的用户);'keyboard'=强制键鼠档(接了手柄/键鼠的
// iPad 等——整页回桌面几何,恢复指针,停用世界触摸合成)。
// ★这是全项目"当前处于哪种操作范式"的唯一裁决口:HUD 档位(HudScale)/虚拟控件层
// 是否建立(mainFlow)/世界触摸合成(Input)/指针绘制(VUI)全部经此函数,不许再散落
// 各自的 isTouchDevice 判定。
import { options } from '../Options';
import { isTouchDevice } from './touchDevice';

export type TouchOpMode = 'auto' | 'touch' | 'keyboard';

/** 解析当前操作范式(每次调用即席计算,无缓存——mode 可被设置页即时切换) */
export function resolveTouchMode(): 'touch' | 'keyboard' {
  const m = options.data.touchOpMode;
  if (m === 'touch' || m === 'keyboard') return m;
  return isTouchDevice() ? 'touch' : 'keyboard';
}
