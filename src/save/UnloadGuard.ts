// ★BJ280（2026-09-22）页面卸载拦截纯核：dirty 判定 + beforeunload 处理器 +
// visibilitychange 隐藏兜底判定。逻辑独立成模块以便 vitest 直测（mainFlow 依赖
// 全量 DOM/资产装配,不可在 node 环境 boot）;装配面（监听器安装/标志位生命周期:
// enterGame 置位 / 手动保存·保存并退出·回标题清除）在 mainFlow.createFlow,
// 由 tests/bj280-unload-guard.test.ts 结构锁锚定。

/** 卸载拦截面判定（纯函数）：会话 dirty（进世界后未走【用户确认的】保存链）且
 *  非退出保存中 → 拦。标题态 dirty 恒 false 永不拦;SaveAndQuit 保存屏（quitting）
 *  自带确认,不二次拦截（BJ280 任务处方;保存屏期 reload 撕在途退出档=BJ144 已
 *  登记残面,本刀不扩权）。 */
export function unloadGuardShouldBlock(dirty: boolean, quitting: boolean): boolean {
  return dirty && !quitting;
}

/** beforeunload 处理器工厂：拦截面命中时按现代浏览器标准两行触发原生确认
 *  （preventDefault + returnValue='';浏览器不允许自定义文案,SW 侧如实转述提示,
 *  不自造弹层——原生框是唯一可靠拦截面）。mainFlow.createFlow 以闭包
 *  () => ({ dirty: worldDirty, quitting }) 装配;工厂独立导出供单测直驱断言
 *  preventDefault/returnValue。 */
export function makeBeforeUnloadHandler(
  getGuardState: () => { dirty: boolean; quitting: boolean },
): (e: BeforeUnloadEvent) => void {
  return (e) => {
    if (!unloadGuardShouldBlock(getGuardState().dirty, getGuardState().quitting)) return;
    e.preventDefault();
    e.returnValue = '';
  };
}

/** visibilitychange hidden 兜底判定（纯函数）：仅会话 dirty 且有游戏实例且无在途
 *  保存时触发静默自动保存（与 onAutoSave 同 silent 档;静默保存非用户确认存档点,
 *  不清 dirty——宁多拦不漏拦）。quitting 时 SaveAndQuit 链持有保存权,不并发第二链
 *  （BJ144 互斥）;saveInFlight 防隐藏/回前台抖动期双链重叠。 */
export function hiddenBackstopShouldSave(s: {
  dirty: boolean; quitting: boolean; hasGame: boolean; saveInFlight: boolean;
}): boolean {
  return s.dirty && !s.quitting && s.hasGame && !s.saveInFlight;
}
