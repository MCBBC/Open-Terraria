// 累计游玩时长追踪（SW-BJ5 2026-09-07）——原版 PlayerFileData 语义的 Web 等价物。
// vanilla 权威（1.4.5.7 Terraria.IO/PlayerFileData.cs）：
//   _playTime（持久基线）+ _timer（Stopwatch 会话秒表）；
//   GetPlayTime()  :176-183 = _playTime + (_timer.IsRunning ? _timer.Elapsed : 0)
//   StartPlayTimer :159     = 重锚秒表（不重复计）
//   StopPlayTimer  :196-206 = 秒表折算回 _playTime 并 Reset（失焦/暂停边界）
//   UpdatePlayTimer:147     = 每帧按 FocusHelper.AllowCountingPlayerTime（FocusHelper.cs:59-68
//                             窗口激活 ∧ 非暂停 ∧ 非游戏菜单）Start/Pause——后台不计费
// 存档面（Player.cs:55408）只写 GetPlayTime().Ticks——【绝不在会话中把秒表折回基线后
// 仍让秒表从会话起点续走】，否则每次存档重加整段会话 = 二次方膨胀（SW-BJ5 实报
// 世界列表 109843 分钟 ≈76 天的根因：旧实现 base 每存一次被写回"基线+整段会话已过
// 时长"，下存再整段叠加）。本类把该不变量做成结构性的：totalMs 只依赖 (基线,锚点,相位)，
// 存档对槽位 meta 的回写永远不回流进基线。

export type PlayTimePhase = 'idle' | 'running' | 'paused';

export class PlayTimeTracker {
  private baseMs = 0;
  private anchorMs = 0;
  private _phase: PlayTimePhase = 'idle';

  /** 会话开始（enterGame，对齐原版 StartPlayTimer）：钉基线 + 重锚秒表。
   *  baseMs = 槽位 meta.playTimeMs（上次存档的累计终值；新世界=0） */
  start(baseMs: number, now: number): void {
    this.baseMs = Math.max(0, baseMs);
    this.anchorMs = now;
    this._phase = 'running';
  }

  /** 读档吸合（SW-BJ5）：存档头 > 现基线 时以档为准并重锚。副本/导入/quickLoad 会话
   *  的槽位基线可能落后于最持久真值（存档头）；≤ 时不动——保住本会话已计时长 */
  absorb(headerMs: number, now: number): void {
    if (!Number.isFinite(headerMs) || headerMs <= this.baseMs) return;
    this.baseMs = headerMs;
    if (this._phase === 'running') this.anchorMs = now;
  }

  /** 失焦暂停（visibilitychange hidden ↔ 原版 PausePlayTimer：折算 + 停表，
   *  幂等；idle/paused 相位 no-op） */
  pause(now: number): void {
    if (this._phase !== 'running') return;
    this.baseMs += Math.max(0, now - this.anchorMs);
    this._phase = 'paused';
  }

  /** 回前台续走（visible ↔ 原版 StartPlayTimer：仅重锚，绝不重复计费） */
  resume(now: number): void {
    if (this._phase !== 'paused') return;
    this.anchorMs = now;
    this._phase = 'running';
  }

  /** GetPlayTime（PlayerFileData.cs:176-183）：基线 + 运行中秒表。paused/idle 只返基线 */
  totalMs(now: number): number {
    return this.baseMs + (this._phase === 'running' ? Math.max(0, now - this.anchorMs) : 0);
  }

  /** 会话内已计墙钟（诊断面用；paused/idle = 0） */
  elapsedMs(now: number): number {
    return this._phase === 'running' ? Math.max(0, now - this.anchorMs) : 0;
  }

  get phase(): PlayTimePhase {
    return this._phase;
  }
}
