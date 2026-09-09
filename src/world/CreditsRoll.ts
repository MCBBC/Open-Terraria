// 制作组名单滚动事件（CreditsRollEvent）—— Terraria.GameContent.Events/CreditsRollEvent.cs
// 1:1 移植（IIIII232）。触发链：NPC.OnGameEventClearedForTheFirstTime(10)（月总首杀，
// NPC.cs:79587-79593）→ TryStartingCreditsRoll()；时长 = 演出总帧（SkyManager
// ["CreditsRoll"].AmountOfTimeNeededForFullPlay = CreditsRollComposer.FillSegments
// 的 endTime；菜单域 FillSegments(inGame:false) 同值——本仓由调用方传入）。
// 每帧递减：Main.UpdateWorld（Main.cs:65949 CreditsRollEvent.UpdateTime，与
// CultistRitual/BirthdayParty/LanternNight/Sandstorm/DD2Event 同一帧位）。
// 消费面（Main.cs）：
//  - :3223-3232 CanPlayCreditsRoll（演出可播门）：!gameMenu && LocalPlayer
//    .hasCreditsSceneMusicBox（八音盒 5044 Music Box (Journey's End) 生效中）
//    / gameMenu && menuMode==3000（名单菜单）/ IsEventOngoing；
//  - :12021-12024 / :12706-12709 音乐链首：IsEventOngoing → MusicID 89
//    （MusicID.JourneysEnd）——两条链（TOW :12021 与经典 :12706）同为链首；
//  - :65949 UpdateTime（UpdateWorld 每帧）；:53051 LoadWorld Reset（WorldGen
//    .Reset :6948 同——世界清空/重生成时归零）；
//  - 联机：TryStarting netMode==2 → msg 140 广播 remainingTime（NetMessage.cs
//    :2853 进房补发 / MessageBuffer :4273 SetRemainingTimeDirect 收侧直写）。
//    本仓联机与 LanternNight 同类（瞬态演出不进同步面）——登记债，见
//    docs/worldgen/content-parity-vs-vanilla-2026-08-16.md 本批章。
// 原版静态类语义 → 模块单例；Reset 挂世界装载/退出（Main.LoadWorld 语义）。
// 演出本体（分段编排+绘制）见 creditsRollComposer.ts / ui/CreditsRollOverlay.ts。

/** MAX_TIME_FOR_CREDITS_ROLL_IN_FRAMES（CreditsRollEvent.cs:7）——钳制上限（60fps 帧） */
export const CREDITS_ROLL_MAX_TIME = 28800;

class CreditsRollState {
  private _remainingTime = 0;

  /** IsEventOngoing（:14）：>0 即进行中 */
  get isEventOngoing(): boolean {
    return this._remainingTime > 0;
  }

  /** 剩余帧（音频/探针只读） */
  get remainingTime(): number {
    return this._remainingTime;
  }

  /** TryStartingCreditsRoll（:17-27）：默认 28800，SkyManager 演出在挂时取
   *  AmountOfTimeNeededForFullPlay 覆盖（本仓 = fullPlayTime 实参，由 Game 侧
   *  传 composer endTime——原版 SkyManager 查询等价）。netMode==2 → msg 140
   *  广播：本仓经 onTryStart 回调由 Game 侧承载（联机同步登记债） */
  tryStarting(fullPlayTime?: number): void {
    this._remainingTime = fullPlayTime ?? CREDITS_ROLL_MAX_TIME;
    this.onTryStart?.(this._remainingTime);
  }

  /** NetManager 广播钩子（Game 侧挂 net.sendCreditsRoll——联机债，单机 null） */
  onTryStart: ((remaining: number) => void) | null = null;

  /** SendCreditsRollRemainingTimeToPlayer（:29-33）：进房补发同面（债，同上） */
  sendRemainingTimeToPlayer(_playerIndex: number): void {
    // 登记债：netMode==2 → NetMessage.SendData(140, playerIndex, ...)。
    // 本仓联机房间访客不接收瞬态演出计时（同 LanternNight 类债）。
  }

  /** UpdateTime（:41-43）：remaining = Clamp(remaining - 1, 0, 28800)。
   *  Main.UpdateWorld 每帧位（Main.cs:65949），原版无运行条件门（世界更新即递减） */
  updateTime(): void {
    const next = this._remainingTime - 1;
    this._remainingTime = next < 0 ? 0 : next > CREDITS_ROLL_MAX_TIME ? CREDITS_ROLL_MAX_TIME : next;
  }

  /** Reset（:45-48）：Main.LoadWorld（:53051）/ WorldGen.Reset（:6948） */
  reset(): void {
    this._remainingTime = 0;
  }

  /** SetRemainingTimeDirect（:50-52）：msg 140 收侧直写（Clamp 0..28800） */
  setRemainingTimeDirect(time: number): void {
    this._remainingTime = time < 0 ? 0 : time > CREDITS_ROLL_MAX_TIME ? CREDITS_ROLL_MAX_TIME : time;
  }

  /** Main.CanPlayCreditsRoll（Main.cs:3223-3232）1:1：
   *  - !gameMenu && LocalPlayer.hasCreditsSceneMusicBox → true
   *    （八音盒 5044 生效中——本仓载体 = SceneMetrics.musicBoxStyle===85，
   *    MB_STYLE_TO_MUSIC[85]=89 Journey's End，ItemID.cs:11634 MusicBoxCredits；
   *    Player.UpdateEquips currentItem.type==5044 置位 :15276-15279 同源）
   *  - gameMenu && menuMode == 3000 → true（名单菜单——本仓无 3000 菜单态，登记债）
   *  - 否则 = IsEventOngoing */
  canPlay(hasCreditsSceneMusicBox: boolean, gameMenu: boolean, menuMode: number): boolean {
    if (!gameMenu && hasCreditsSceneMusicBox) return true;
    if (gameMenu && menuMode === 3000) return true;
    return this.isEventOngoing;
  }
}

/** 单例（对应原版静态类） */
export const creditsRoll = new CreditsRollState();

/** NPC.OnGameEventClearedForTheFirstTime case 10（NPC.cs:79587-79593）：
 *  LanternNight.NextNightIsLanternNight = true（由 Game 侧 LanternNight
 *  .onGameEventCleared(10) 承载）+ CreditsRollEvent.TryStartingCreditsRoll()。
 *  Game 侧 boss 击败链按 BOSS_GAME_EVENT_BY_NPC[398]=10 派发本函数。 */
export function onGameEventClearedMoonLord(fullPlayTime?: number): void {
  creditsRoll.tryStarting(fullPlayTime);
}
