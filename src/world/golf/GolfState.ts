// ============================================================================
// GolfState.cs + GolfBallTrackRecord.cs 1:1（Terraria.GameContent.Golf/）
// 行号注释对准 /Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/
//   GolfBallTrackRecord.RecordHit        :10-13
//   GolfBallTrackRecord.GetAccumulatedScore :15-21  ⌊总位移tile⌋ ÷ (击点段数+2)
//   GolfBallTrackRecord.GetTrackInfo     :23-34
//   GolfState.BALL_RETURN_PENALTY        :8
//   GolfState.ScoreAdjustment            :30   golfScoreTime/3600
//   GolfState.ShouldScoreHole            :32   golfScoreTime >= 90（golfScoreDelay:14）
//   GolfState.UpdateScoreTime            :34-40 每帧+1 封顶 3600（golfScoreTimeMax:12）
//   GolfState.ResetScoreTime             :42-45
//   GolfState.SetScoreTime               :47-50 =3600
//   GolfState.RecordSwing                :83-95
//   GolfState.GetGolfBallId              :97-100 whoAmI
//   GolfState.GetLastHitBall             :102-109
//   GolfState.Update                     :111-134
//   GolfState.RecordBallInfo             :136-143
//   GolfState.LandBall                   :145-149
//   GolfState.GetGolfBallScore           :151-160 ⌊累计分×ScoreAdjustment⌋
//   GolfState.ResetGolfBall              :162-173 哨子回退上一击点（+1 杆罚）
// ============================================================================
import { BallState } from './golfPhysics';

/** GolfState 持有的球句柄（GolfBall 实体结构化实现；字段对准 Projectile 同名量） */
export interface GolfBallHandle {
  id: number;                 // whoAmI
  x: number; y: number;       // position
  vx: number; vy: number;     // velocity
  swings: number;             // ai[1]（击杆数；-1 = 球座待发态）
  moving: boolean;            // localAI[1] != Resting
  dead: boolean;              // !active
  isMine: boolean;            // owner == Main.myPlayer（本地玩家的球）
}

/** GolfBallTrackRecord.cs:6-35 —— 逐球轨迹记录（击点序列） */
export class GolfBallTrackRecord {
  private hitLocations: Array<{ x: number; y: number }> = [];   // _hitLocations（:7）

  /** RecordHit（:10-13） */
  recordHit(x: number, y: number): void {
    this.hitLocations.push({ x, y });
  }

  /** GetAccumulatedScore（:15-21）：⌊总位移px/16⌋ ÷ (段数+2)（整除） */
  getAccumulatedScore(): number {
    const info = this.getTrackInfo();                            // :17
    const tiles = Math.floor(info.totalDistancePassed / 16);     // num = (int)(dist/16)（:18）
    const denom = info.hitsMade + 2;                             // num2 = hits + 2（:19）
    return Math.floor(tiles / denom);                            // num / num2（:20）
  }

  /** GetTrackInfo（:23-34）：相邻击点距离和 + 段数 */
  private getTrackInfo(): { totalDistancePassed: number; hitsMade: number } {
    let hitsMade = 0;                                            // :26
    let totalDistancePassed = 0;                                 // :27
    let i = 0;                                                   // num（:27）
    while (i < this.hitLocations.length - 1) {                   // :28
      const a = this.hitLocations[i], b = this.hitLocations[i + 1];
      totalDistancePassed += Math.hypot(a.x - b.x, a.y - b.y);   // :30
      i++;
      hitsMade++;                                                // :32
    }
    return { totalDistancePassed, hitsMade };
  }
}

/** GolfState.cs:6-174 —— 本地玩家高尔夫状态（分时折扣计时 + 轨迹记录表） */
export class GolfState {
  private static readonly BALL_RETURN_PENALTY = 1;               // :8

  private golfScoreTime = 0;                                     // :10（初值 0）
  private static readonly GOLF_SCORE_TIME_MAX = 3600;            // :12
  private static readonly GOLF_SCORE_DELAY = 90;                 // :14

  private hitRecords = new Map<number, GolfBallTrackRecord>();   // _hitRecords（:28）

  private lastSwingX = 0; private lastSwingY = 0;                // _lastSwingPosition（:22）
  private lastHitBall: GolfBallHandle | null = null;             // _lastHitGolfBall（:24）
  private lastRecordedSwingCount = 0;                            // _lastRecordedSwingCount（:26）
  waitingForBallToSettle = false;                                // _waitingForBallToSettle（:20）

  /** ScoreAdjustment（:30）：time/3600 */
  get scoreAdjustment(): number {
    return this.golfScoreTime / GolfState.GOLF_SCORE_TIME_MAX;
  }

  /** ShouldScoreHole（:32）：>= 90 tick 才允许计分 */
  get shouldScoreHole(): boolean {
    return this.golfScoreTime >= GolfState.GOLF_SCORE_DELAY;
  }

  /** UpdateScoreTime（:34-40）—— 每帧调用 */
  private updateScoreTime(): void {
    if (this.golfScoreTime < GolfState.GOLF_SCORE_TIME_MAX) this.golfScoreTime++;
  }

  /** ResetScoreTime（:42-45）—— 进洞结算后 */
  resetScoreTime(): void {
    this.golfScoreTime = 0;
  }

  /** SetScoreTime（:47-50）—— >1 杆进洞直接满额（PutBallInCup :96-97） */
  setScoreTime(): void {
    this.golfScoreTime = GolfState.GOLF_SCORE_TIME_MAX;
  }

  /** RecordSwing（:83-95）—— 每次击杆 */
  recordSwing(ball: GolfBallHandle): void {
    this.lastSwingX = ball.x; this.lastSwingY = ball.y;          // :85
    this.lastHitBall = ball;                                     // :86
    this.lastRecordedSwingCount = ball.swings;                   // :87
    this.waitingForBallToSettle = true;                          // :88
    const rec = this.hitRecords.get(ball.id);                    // :90-93
    if (!rec || this.lastRecordedSwingCount === 1) {
      this.hitRecords.set(ball.id, new GolfBallTrackRecord());
    }
    this.hitRecords.get(ball.id)!.recordHit(ball.x, ball.y);     // :94
  }

  /** GetLastHitBall（:102-109）：alive + 球族 + 本地玩家 + 杆数未变 */
  getLastHitBall(): GolfBallHandle | null {
    const b = this.lastHitBall;
    if (!b || b.dead || !b.isMine || this.lastRecordedSwingCount !== b.swings) return null;
    return b;
  }

  /** Update（:111-134）—— 每帧：计时推进 + 跟踪态维护 */
  update(heldIsGolfingItem: boolean, heldIsGolfCartMount: boolean): void {
    this.updateScoreTime();                                      // :113
    const ball = this.getLastHitBall();                          // :114
    if (!ball) { this.waitingForBallToSettle = false; return; }  // :115-119
    if (this.waitingForBallToSettle) {                           // :120-123
      this.waitingForBallToSettle = ball.moving;
    }
    // :125-129 3611 = GolfCart 坐骑；:130-133 非高尔夫道具且非球车 → 停跟踪
    if (!heldIsGolfingItem && !heldIsGolfCartMount) {
      this.waitingForBallToSettle = false;
    }
  }

  /** RecordBallInfo（:136-143）—— 进洞前记录最终落点。
   *  原版此处仅缓存 _lastRecordedBallLocation/_lastRecordedBallTime 供镜头跟随
   *  （TryGetCameraTrackingPosition :52-67）；**不记击点**——记点只在 LandBall（:145-149）。
   *  本作单人镜头语义未接（等价边界），保留门条件，无计分副作用。 */
  recordBallInfo(ball: GolfBallHandle): void {
    if (this.getLastHitBall() === ball && this.waitingForBallToSettle) {
      /* 镜头跟随缓存未接（单人语义：分数记录 + Golfer 台词/商店消费） */
    }
  }

  /** LandBall（:145-149）—— 进洞记终点点 */
  landBall(ball: GolfBallHandle): void {
    this.hitRecords.get(ball.id)?.recordHit(ball.x, ball.y);     // :148
  }

  /** GetGolfBallScore（:151-160）：⌊累计分 × ScoreAdjustment⌋ */
  getGolfBallScore(ball: GolfBallHandle): number {
    const rec = this.hitRecords.get(ball.id);                    // :154
    if (!rec) return 0;                                          // :155-157
    return Math.floor(rec.getAccumulatedScore() * this.scoreAdjustment);  // :159
  }

  /** ResetGolfBall（:162-173）—— 高尔夫哨 4095：球未动则不罚；回退上一击点 +1 杆 */
  resetGolfBall(): boolean {
    const ball = this.getLastHitBall();                          // :164
    if (ball && !(Math.hypot(ball.x - this.lastSwingX, ball.y - this.lastSwingY) < 1)) {  // :165
      ball.x = this.lastSwingX; ball.y = this.lastSwingY;        // :167
      ball.vx = 0; ball.vy = 0;                                  // :168
      ball.swings += GolfState.BALL_RETURN_PENALTY;              // :169 ai[1] += 1
      this.lastRecordedSwingCount = ball.swings;                 // :171
      return true;
    }
    return false;
  }

  /** WorldClear（:69-76）—— 换世界清记录 */
  worldClear(): void {
    this.lastHitBall = null;
    this.hitRecords.clear();
    this.lastRecordedSwingCount = 0;
    this.waitingForBallToSettle = false;
  }

  /** 测试/调试：当前折扣计时原值 */
  get scoreTime(): number { return this.golfScoreTime; }
}

/** BallState 枚举再导出（GolfBall/测试引用统一入口） */
export { BallState };
