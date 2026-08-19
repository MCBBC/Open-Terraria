// ============================================================================
// 高尔夫球实体 1:1 —— Projectile.cs AI_149_GolfBall(:18924-18970) +
// GolfHelper.cs 全量公式 + Terraria.Physics/BallCollision.cs 步进（world/golf/golfPhysics.ts）。
// 行号注释对准 /Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/
//   SetDefaults 721/739-752  :7344-7352  7×7、aiStyle 149、tileCollide=false、penetrate -1
//   AI_149_GolfBall           :18924-18970
//     · timeLeft<10 → 10（球永不消失）      :18926-18929
//     · ai[1]==-1（球座待发）→ 脚下非 494 转 0 :18931-18941
//     · StepGolfBall + Resting 伤害清零      :18943-18952
//     · 旋转 = 角速度 + 空中滚动补偿        :18956-18960
//   GolfHelper:
//     · ClubProperties/ShotStrength  :14-30
//     · PointsNeededForLevel1-3      :267-271（Golfer 商店/台词门槛常量）
//     · PhysicsProperties(0.3,0.99)  :273
//     · StepGolfBall                 :279-282
//     · FindVectorOnOval             :284-291
//     · CalculateShotStrength        :293-302 / :318-341（蓄力=(光标-球心)/300）
//     · IsPlayerHoldingClub          :304-316
//     · GetClubProperties            :348-371
//     · IsGolfBallResting            :400-407
//     · ValidateShot                 :423-449（角度钳 [-87.12°,0°] + 站位盒）
//     · HitGolfBall                  :451-474（材质阻尼 + ai[1] + RecordSwing）
//   GetGolfTrailColor                :10533-10550（球色表）
// ============================================================================
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { TILE_DEFS } from '../data/tiles';
import {
  BallState, stepGolfBall, clubDampenVelocity, golfMapFromStore,
  type GolfTileMap,
} from '../world/golf/golfPhysics';
import type { GolfState } from '../world/golf/GolfState';

/** 高尔夫宿主（Game 注入：LocalGolfState + 进洞结算回调 = GolfHelper.PutBallInCup） */
export interface GolfHost {
  /** Main.LocalGolfState（GolfState.cs 1:1） */
  state: GolfState;
  /** 本地玩家解析（proj.owner == Main.myPlayer 判定，PutBallInCup :88）。
   *  取函数：换世界会重建 Player 实例，须动态解析 */
  playerRef(): unknown;
  /** 进洞结算（GolfHelper.PutBallInCup :86-115：计分/公告/电路/杀球） */
  onCupCapture(ball: GolfBall, tileX: number, tileY: number): void;
}

export class GolfBall extends Entity {
  /** Game 启动时注入（球体 AI 经此读写 GolfState 与结算链） */
  static host: GolfHost | null = null;

  /** SetDefaults :7350-7351（width=height=7） */
  override w = 7; override h = 7;
  /** 球色变体（投射物 id：721 泥球 / 739-752 染色球） */
  projId: number;
  /** ai[1]：击杆数；-1 = 球座待发态（NewProjectile 末参，Player.cs:31881/48916） */
  swings = 0;
  /** localAI[0]：角速度 */
  angular = 0;
  /** localAI[1]：BallState（Resting=0/Moving=1）——GolfState.getLastHitBall 的跟踪门 */
  ballState: BallState = BallState.Resting;
  /** 渲染旋转累加（Projectile.rotation，AI_149 :18956-18960） */
  rotation = 0;
  owner: () => unknown;

  constructor(cx: number, cy: number, projId: number, owner: () => unknown, onTee = false) {
    super();
    // NewProjectProject 语义：入参为中心 → position = center - size/2（Projectile.cs:15162 一带）
    this.x = cx - this.w / 2; this.y = cy - this.h / 2;
    this.projId = projId;
    this.owner = owner;
    this.swings = onTee ? -1 : 0;      // ai[1] 初值（球座放置传 -1）
  }

  /** 本地玩家的球（proj.owner == Main.myPlayer，PutBallInCup :88 计分门） */
  get isMine(): boolean {
    const host = GolfBall.host;
    return !!host && this.owner() === host.playerRef();
  }

  /** IsGolfBallResting（GolfHelper.cs:400-407）：原版对 Moving 态另比对 oldPos 位移 <1px，
   *  本作 localAI[1] 直接存 BallState 枚举，Resting 即等价停球 */
  get atRest(): boolean {
    return this.ballState === BallState.Resting;
  }

  get moving(): boolean { return this.ballState !== BallState.Resting; }

  /** HitGolfBall（GolfHelper.cs:451-474）：材质阻尼 + ai[1] 累加 + RecordSwing。
   *  belowTileType：球底+1px 所在格的 tile id（null = 空气，不阻尼） */
  clubHit(vx: number, vy: number, rough: number, belowTileType: number | null): void {
    const d = clubDampenVelocity(vx, vy, rough, belowTileType);   // :453-461
    this.vx = d.vx; this.vy = d.vy;                                // :462
    // timeLeft = 18000（:465）——本作球体不自然消亡，语义恒成立
    if (this.swings < 0) this.swings = 0;                          // :466-469
    this.swings += 1;                                              // :470
    this.ballState = BallState.Moving;                             // localAI[1] = 1（:471）
    GolfBall.host?.state.recordSwing(this);                        // :472
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const st = game.world.store;
    // ---- ai[1] == -1：球座待发（AI_149 :18931-18941）----
    if (this.swings === -1) {
      // Framing.GetTileSafely(base.Bottom.ToTileCoordinates())（:18933）——
      // Entity.Bottom = (x+w/2, y+h)（Entity.cs:122-131）→ 中心X/底边Y 取格
      const btx = Math.floor((this.x + this.w / 2) / TILE);
      const bty = Math.floor((this.y + this.h) / TILE);
      const active = st.inBounds(btx, bty) && st.flags[st.idx(btx, bty)] !== 0;
      const isTee = active && TILE_DEFS[st.type[st.idx(btx, bty)]]?.vanilla?.sheet === 494;
      if (!isTee) this.swings = 0;              // !tile.active() || type != 494（:18936-18938）
      return;                                   // :18941（本帧不做物理）
    }
    // ---- 物理步进（AI_149 :18943 + BallCollision.Step）----
    // 原版 PutBallInCup 内 proj.Kill()（:114）使后续子步重入变为无害空操作
    //（ShouldScoreHole 已被 ResetScoreTime 关闭）；这里以 capturedOnce 防止重复回调
    let capturedOnce = false;
    const hooks = GolfBall.host
      ? {
        onCupCapture: (tx: number, ty: number) => {
          if (capturedOnce) return;
          capturedOnce = true;
          // PutBallInCup（GolfHelper.cs:86-115）：计分门在宿主内，杀球在此
          GolfBall.host!.onCupCapture(this, tx, ty);
          this.dead = true;                     // proj.Kill()（:114）
        },
      }
      : undefined;
    const map: GolfTileMap = golfMapFromStore(st);
    const state = stepGolfBall(this, map, hooks);
    if (state === BallState.OutOfBounds) { this.dead = true; return; }  // 出界杀球
    this.ballState = state;                     // localAI[1] = State（:18951）
    // 旋转（:18956-18960）：rotation += 角速度；空中（vy!=0 且 Moving）再补 vx/vy×0.1
    this.rotation += this.angular;
    if (this.vy !== 0 && state === BallState.Moving) {
      this.rotation += this.vx * 0.1 + this.vy * 0.1;
    }
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.ctx;
    if (!ctx) return;
    // GetGolfTrailColor（Projectile.cs:10533-10550）—— 球色按投射物 id
    const colors: Record<number, [number, number, number]> = {
      739: [50, 50, 50], 740: [30, 50, 255], 741: [150, 90, 60], 742: [30, 255, 170],
      743: [30, 255, 30], 744: [190, 255, 30], 745: [255, 130, 30], 746: [255, 50, 110],
      747: [130, 10, 200], 748: [255, 30, 50], 749: [100, 180, 255], 750: [50, 240, 160],
      751: [220, 80, 220], 752: [255, 180, 50],
    };
    const c = colors[this.projId] ?? [160, 160, 255];   // 721 默认（:1049）
    ctx.save();
    ctx.translate(this.cx, this.cy);
    ctx.rotate(this.rotation);
    ctx.fillStyle = `rgb(${c[0]} ${c[1]} ${c[2]})`;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// 击球公式（GolfHelper.cs）
// ---------------------------------------------------------------------------

/** 杆型属性（GetClubProperties :348-371：min/max 为椭圆半径 + RoughLandResistance；
 *  材质等级同属性——IsPlayerHoldingClub :304-316：4039 / 4092-4094 / 4587-4598） */
export interface ClubProps { minX: number; minY: number; maxX: number; maxY: number; rough: number }
const CLUB_IRON: ClubProps = { minX: 0.25, minY: 0.25, maxX: 1.0, maxY: 1.0, rough: 0 };
const CLUB_PUTTER: ClubProps = { minX: 0, minY: 0, maxX: 0.25, maxY: 0.25, rough: 0 };
const CLUB_WEDGE: ClubProps = { minX: 0.25, minY: 0.25, maxX: 0.65, maxY: 1.5, rough: 1 };
const CLUB_DRIVER: ClubProps = { minX: 0.25, minY: 0.25, maxX: 1.5, maxY: 0.65, rough: 0 };
export const GOLF_CLUBS: Record<number, ClubProps> = {
  4039: CLUB_IRON, 4092: CLUB_PUTTER, 4093: CLUB_WEDGE, 4094: CLUB_DRIVER,
  4587: CLUB_IRON, 4591: CLUB_IRON, 4595: CLUB_IRON,           // 石/秘银/钛金铁杆
  4588: CLUB_PUTTER, 4592: CLUB_PUTTER, 4596: CLUB_PUTTER,     // 锈铁/铅/发光蘑菇推杆
  4589: CLUB_WEDGE, 4593: CLUB_WEDGE, 4597: CLUB_WEDGE,        // 青铜/金/钻石挖起杆
  4590: CLUB_DRIVER, 4594: CLUB_DRIVER, 4598: CLUB_DRIVER,     // 木/珍珠木/叶绿木杆
};

/** FindVectorOnOval（:276-291）：normalize(v/r)×r 的模 */
function ovalLen(vx: number, vy: number, rx: number, ry: number): number {
  if (rx === 0 || ry === 0) return 0; // 推杆下限 (0,0)：C# v/0=NaN 比较恒假 → 下限不生效
  const nx = vx / rx, ny = vy / ry;
  const nl = Math.hypot(nx, ny) || 1;
  return Math.hypot((nx / nl) * rx, (ny / nl) * ry);
}

/** CalculateShotStrength（:293-302/:318-341）：
 *  shotVector=(光标-球心)/300 → 角度钳（ValidateShot :431-439）→ 椭圆钳 → ×32。
 *  返回 {vx, vy, rel}（rel=力度条 0..1，:300）。 */
export function golfShot(
  mouseX: number, mouseY: number, ball: { cx: number; cy: number }, club: ClubProps,
): { vx: number; vy: number; rel: number } {
  let dx = mouseX - ball.cx, dy = mouseY - ball.cy;
  // 角度钳：rot>0 → 0（水平）；rot<-1.5207964(≈-87.12°) → 钳下限（不能向下打）
  let ang = Math.atan2(dy, dx);
  if (ang > 0) ang = 0;
  if (ang < -1.5207964) ang = -1.5207964;
  const len = Math.hypot(dx, dy);
  dx = Math.cos(ang) * len; dy = Math.sin(ang) * len;
  const sx = dx / 300, sy = dy / 300;
  const value = Math.hypot(sx, sy);
  const maxL = ovalLen(sx, sy, club.maxX, club.maxY);
  const minL = ovalLen(sx, sy, club.minX, club.minY);
  const L = Math.max(minL, Math.min(value, maxL));
  const rel = Math.max((maxL > minL ? (L - minL) / (maxL - minL) : 1), 0.001);
  const speed = L * 32;
  const n = Math.hypot(sx, sy) || 1;
  return { vx: (sx / n) * speed, vy: (sy / n) * speed, rel };
}

/** ValidateShot 站位盒（:423-449）：球须在玩家脚下盒内
 *  （以玩家 Bottom 为原点、面向取反：X∈[-16,32]、Y∈[-16,16]） */
export function golfBallInStance(
  ball: { x: number; y: number; w: number; h: number },
  player: { x: number; y: number; w: number; h: number; facing: number },
): boolean {
  const flip = player.facing < 0 ? -1 : 1;
  const dx = (ball.x + ball.w / 2) - (player.x + player.w / 2);
  const dy = (ball.y + ball.h) - (player.y + player.h); // Bottom 差
  const rx = dx * flip, ry = dy;
  return rx >= -16 && rx <= 32 && ry >= -16 && ry <= 16;
}
