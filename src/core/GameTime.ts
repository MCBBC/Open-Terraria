/**
 * ★BJ330（2026-09-24）Main.TotalGameTime 等价钟——GTW 墙钟债清偿（单源收编）。
 *
 * 原版锚（Terarria1457 亲读）：
 *  · Main.cs:17014/17023 `GlobalTimeWrappedHourly = (float)(gameTime.TotalGameTime.TotalSeconds % 3600.0)`
 *    ——唯一闸门 = Main.GlobalTimerPaused（Main.cs:415，仅 CaptureCamera.cs:112/434 截图/全景时置位）。
 *  · TotalGameTime = XNA 固定步【逻辑】累计：每执行一次 Update tick +1/60s
 *    （Main.cs:17193 以定长 TARGET_FRAME_TIME 重建 gameTime）——进程停更即停
 *    （挂起/最小化停更/隐藏），桌面端菜单/暂停期循环照走（GTW 照进）。
 *
 * 本仓映射（用户拍板 BJ330 语义）：钟源 = Game.fixedUpdate 60Hz 逻辑 tick 累计——
 *  ① 暂停冻结（手动 Esc 浮层 / autoPause 开界面暂停，fixedUpdate !paused 门）
 *  ② 失焦冻结（applyFocusPause → paused=true，BJ99-D 判例）
 *  ③ 游玩时推进（含标题菜单——fixedUpdate pre-world 照跑）
 *  ④ 小时回卷不变（tick % 216000 ÷ 60 = 秒 % 3600，整数域取模防浮点漂移）
 * 与原版的明令分歧 = 【暂停期不推进】（原版桌面暂停 GTW 照走）——债的本旨即
 * 色相相位锚定游戏时间、暂停期与世界同冻结；浏览器失焦/隐藏 rAF 停更 = 原版
 * 进程停更同相，无需特判。
 *
 * worker 分立模块实例不推进（恒 0）——光照 worker 的 hourly 走
 * LightWorkerProtocol 每帧主线程同步（buildEngineSnapshot 经 FlickerClock getter
 * 主线程读本钟），原同步路径零改动。
 */

let totalGameTicks = 0;

/** Game.fixedUpdate 每 60Hz 逻辑 tick 调一次（与 Game.tickCount++ 同拍同门） */
export function advanceGameTimeTick(): void {
  totalGameTicks++;
}

/** 测试钉钟（vitest 确定性判别面;生产路径禁调） */
export function pinGameTimeTicks(ticks: number): void {
  totalGameTicks = ticks;
}

/** Main.TotalGameTime（秒;逻辑 tick × 1/60,暂停/失焦停） */
export function totalGameTimeSec(): number {
  return totalGameTicks / 60;
}

/** Main.GlobalTimeWrappedHourly（秒 %3600;全消费站唯一钟源） */
export function globalTimeWrappedHourly(): number {
  return (totalGameTicks % 216000) / 60;
}
