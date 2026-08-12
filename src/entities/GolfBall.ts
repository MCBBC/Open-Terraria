// 高尔夫球实体 + 击球公式 1:1（GolfHelper.cs）：
//   CalculateShotStrength :293-302/:318-341 —— 蓄力 = (光标-球心)/300 的长度，
//   按【杆型椭圆】上下限钳制（FindVectorOnOval :276-291），速度 = L×32；
//   ValidateShot :423-449 —— 角度钳 [-87.12°, 0°]（不能向下打）+ 站位盒
//   （球在玩家脚盒 X∈[-16,32] Y∈[-16,16]，面向翻转）；
//   HitGolfBall :451-474 —— 地面材质阻尼（TileMaterials xnb 未提取，取代表值
//   ClubImpactDampening=0.96 / Efficiency=0.5——粗糙保留系数只对 Wedge rough=1 生效）。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { TILE_DEFS } from '../data/tiles';

export class GolfBall extends Entity {
  w = 10; h = 10;
  dead = false;
  /** 球色变体（投射物 id：721 泥球 / 739+ 染色） */
  projId: number;
  /** 已击杆数（ai[1]；进洞计分分母 = 杆数+2） */
  swings = 0;
  /** 累计位移 px（RecordSwing 相邻击点距离和） */
  dist = 0;
  private lastX = 0; private lastY = 0;
  private rolling = false;
  owner: () => unknown;

  constructor(x: number, y: number, projId: number, owner: () => unknown) {
    super();
    this.x = x; this.y = y;
    this.projId = projId;
    this.owner = owner;
    this.lastX = x; this.lastY = y;
  }

  /** 击球（HitGolfBall :451-474）：速度向量 × 地面阻尼 + RecordSwing 记点 */
  clubHit(vx: number, vy: number, rough: number, solidBelow: boolean): void {
    if (solidBelow) {
      // velocity = Lerp(v×0.96, v, 0.5×rough)（TileMaterials.GolfPhysics 代表值）
      const k = 0.5 * rough;
      vx = (vx * 0.96) * (1 - k) + vx * k;
      vy = (vy * 0.96) * (1 - k) + vy * k;
    }
    this.vx = vx; this.vy = vy;
    this.swings++;
    this.dist += Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x; this.lastY = this.y;
    this.rolling = false;
  }

  /** 停球判定（瞄准/预测线用：IsGolfBallResting） */
  get atRest(): boolean {
    return this.rolling && Math.abs(this.vx) < 0.05 && this.vy === 0;
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    const st = game.world.store;
    const solidAt = (px: number, py: number) => {
      const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
      return st.inBounds(tx, ty) && st.isSolid(tx, ty);
    };
    // 洞杯判定（GolfHelper.cs:62-69：tile 476、自上而下、速度≤100px/tick）
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const htx = Math.floor(cx / TILE), hty = Math.floor(cy / TILE);
    if (st.inBounds(htx, hty) && st.flags[st.idx(htx, hty)]
      && TILE_DEFS[st.type[st.idx(htx, hty)]]?.vanilla?.sheet === 476
      && this.vy > 0 && Math.hypot(this.vx, this.vy) <= 100) {
      const hook = (game as unknown as { golfBallScored?: (b: GolfBall) => void }).golfBallScored;
      if (hook) { hook(this); this.dead = true; return; }
    }
    // 物理：重力 + 弹跳（着地 vy 反弹 0.5 / 水平 0.9）+ 滚动摩擦
    if (!this.rolling || this.vy !== 0) {
      this.vy = Math.min(this.vy + 0.3, 12);
    }
    let nx = this.x + this.vx;
    let ny = this.y + this.vy;
    if (this.vx !== 0 && (solidAt(nx + (this.vx > 0 ? this.w : 0), this.y + 1) || solidAt(nx + (this.vx > 0 ? this.w : 0), this.y + this.h - 1))) {
      this.vx *= -0.6; nx = this.x;
    }
    if (this.vy !== 0 && solidAt(nx + this.w / 2, ny + this.h)) {
      if (this.vy > 1.2) { this.vy = -this.vy * 0.5; } else { this.vy = 0; }
      this.vx *= 0.9;
      ny = this.y;
      if (this.vy === 0) this.rolling = true;
    }
    this.x = nx; this.y = ny;
    if (this.rolling) {
      this.vx *= 0.985;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    if (!st.inBounds(Math.floor(this.cx / TILE), Math.floor(this.cy / TILE))) this.dead = true;
  }

  draw(r: import('../render/Renderer').Renderer): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.translate(this.cx, this.cy);
    const hue = this.projId === 721 ? 30 : (this.projId - 739) * 24;
    ctx.fillStyle = `hsl(${hue} 60% 92%)`;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
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
