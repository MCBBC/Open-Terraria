// ★后台 tick 泵纯核（2026-09-28 用户需求:后台挂机）——泵门真值表+累计器契约,
// 零 DOM/options 依赖（UnloadGuard 同款「逻辑独立成模块以便 vitest 直测」判例）。
// Game.onPumpMsg 是薄壳接线（读 document.hidden/options/paused 灌参）;worker 条目
// = ../workers/BackgroundPump.ts（零依赖纯泵,间隔字面量与本文件常数单源,源锚测试钉）。

/** 泵间隔（ms）。禁改大:①250ms=15 tick/泵,配合单泵 ≤30 高钳最多吸收 500ms 迟滞;
 *  ②光照 worker 看门狗稳态线 2s——泵节拍下 lastResultAt 刷新 ≪2s 永不误杀
 *  （WorkerGovernance 治理批语义）。worker 条目文件字面量须与本值相等（源锚测试）。 */
export const BG_PUMP_INTERVAL_MS = 250;

/** 单泵 tick 高钳（≤30 tick=0.5s 游戏时间/泵）。前台 fixedUpdate 每渲染帧 ≤5 钳
 *  语义保留不动——本钳只作用于后台泵路径;钳满余量归零=累计不爆发（不追帧）。 */
export const BG_PUMP_MAX_TICKS = 30;

/** 泵门入参（Game.onPumpMsg 处理时刻现场读——可见性翻转竞态以【处理时刻】为准） */
export interface PumpGateInput {
  /** Game 主循环存活（start() 已调且未熔断/destroy） */
  running: boolean;
  /** 世界在场（菜单期泵无意义,零副作用） */
  world: boolean;
  /** document.hidden（处理时刻现场读） */
  hidden: boolean;
  /** 设置「后台继续运行」（缺省开;off=泵消息忽略=旧行为） */
  backgroundRun: boolean;
  /** 设置「失焦不暂停」（与 backgroundRun 独立并存——两开关都开才后台活:
   *  off 时失焦会自暂停（applyFocusPause 置 paused）,泵尊重暂停=冻结=用户选择;
   *  本条件同时闭合「泵消息先于 visibilitychange 事件处理」的暂停置位竞态） */
  playWhenUnfocused: boolean;
  /** 游戏自身暂停（手动/autoPause/失焦自暂停）——泵不越权 */
  paused: boolean;
}

/**
 * 泵门（严格 no-op 判定）。真值表（详见 Game.ts 泵域注）:
 *   backgroundRun=off                        → false（旧行为）
 *   playWhenUnfocused=off                    → false（失焦自暂停域）
 *   paused=true                              → false（暂停=用户选择）
 *   hidden=false（前台）                     → false（rAF 原路径,泵零痕）
 *   world=false / running=false（菜单/停机）  → false
 *   全开∧hidden∧!paused                      → true（泵驱动）
 */
export function pumpGate(i: PumpGateInput): boolean {
  return i.running && i.world && i.hidden
    && i.backgroundRun && i.playWhenUnfocused && !i.paused;
}

/**
 * 泵累计器（真实流逝 dt 进,步数出）:
 * · 按固定步长扣减,余量跨泵携带（亚 tick 零丢失零重计）;
 * · 步数达 maxTicks 即停且余量清零——「累计不爆发」:主线程忙出长迟滞时只丢余量
 *   不追帧（前台帧路径的 ≤5 钳同哲学;stackSplitAcc 同款归零习语）;
 * · elapsedSec 负值（时钟回拨）不吃 tick。
 * 返回 { acc: 新累计器, steps: 本泵应跑 fixedUpdate 步数 }。
 */
export function pumpAccumulate(
  acc: number, elapsedSec: number, fixedDt: number, maxTicks: number,
): { acc: number; steps: number } {
  let a = acc + Math.max(0, elapsedSec);
  let steps = 0;
  while (a >= fixedDt && steps < maxTicks) {
    a -= fixedDt;
    steps++;
  }
  if (steps >= maxTicks) a = 0;
  return { acc: a, steps };
}
