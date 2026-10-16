// 导演模式引擎面（2026-10-14）——mod 驱动 cutscene 的通用能力位。
// 哲学同 ModDrawCtx：引擎只提供「受限状态位 + 读点」，行为全在 mod 侧
// （game/mods/director——ws 客户端/时间线/缓动/字幕绘制全在 mod JS 里）。
// 引擎四读点：
//   ① Game 相机段：directorCamTarget() 优先于 specCam/droneCam/golfCam/player
//   ② Game 灌输入段：directorInputLocked() = 整帧清 inputX 族（观战同款清零）
//   ③ Renderer drawPlayer：directorPlayerHidden() = 跳过本体绘制
//   ④ Renderer MouseText 层后：runDirectorOverlay(ctx) = mod 顶层 2D 绘制面
// 写口仅一个：registerDirectorHost(host)（mod 装载期注册,卸载时置 null）。
// 空注册零成本：四读点全部早退,无任何每帧分配。

export interface DirectorMoveInput {
  /** 横向：-1 左 / 0 停 / 1 右 */
  x: number;
  /** 跳跃/上 */
  jump: boolean;
  /** 下 */
  down: boolean;
}

export interface DirectorHost {
  /** 相机目标（世界 px;null=不接管）。每帧被引擎轮询,mod 自管缓动。 */
  camTarget(): { x: number; y: number } | null;
  /** true=封玩家输入（移动/跳/使用整帧清零;UI 键照走）。 */
  inputLocked(): boolean;
  /** true=隐藏玩家本体绘制。 */
  playerHidden(): boolean;
  /** 顶层 2D 绘制面（字幕/标题/黑幕/遮幅全在这画;屏幕坐标系,UI 层之上）。 */
  overlay(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** ★走位输入：非 null=脚本驱动角色移动（优先于一切输入源,含锁定态）。 */
  moveInput(): DirectorMoveInput | null;
}

let host: DirectorHost | null = null;

export function registerDirectorHost(h: DirectorHost | null): void {
  host = h;
}

export function directorCamTarget(): { x: number; y: number } | null {
  return host ? host.camTarget() : null;
}
export function directorInputLocked(): boolean {
  return host ? host.inputLocked() : false;
}
export function directorPlayerHidden(): boolean {
  return host ? host.playerHidden() : false;
}
export function directorMoveInput(): DirectorMoveInput | null {
  return host ? host.moveInput() : null;
}
export function runDirectorOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  if (host) host.overlay(ctx, w, h);
}
