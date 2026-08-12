// 高尔夫球实体（GolfHelper/GolfBallTrackRecord 语义的功能移植）：
//   放置（物品 3989）→ 球杆击打（杆型力度表）→ 滚动/弹跳物理 → 落入洞杯
//   tile 476（自上而下且速度≤100）→ 计分：
//   score = ⌊累计位移/16 ÷ (杆数+2)⌋ × 时间系数（2 杆以上恒 1.0；一杆进洞按
//   golfScoreTime/3600 折扣——GolfState.cs:27-47/151-160）
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import { TILE_DEFS } from '../data/tiles';

export class GolfBall extends Entity {
  w = 10; h = 10;
  dead = false;
  /** 球色变体（投射物 id：721 泥球 / 739+ 染色） */
  projId: number;
  /** 已击杆数（+进洞记一点 → 分母 = 杆数+2） */
  swings = 0;
  /** 累计位移 px（相邻击点间距离和） */
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

  /** 球杆击打（方向单位向量 × 杆型速度 + 杆面仰角）；RecordSwing 记点 */
  clubHit(dx: number, dy: number, speed: number, loft: number): void {
    const n = Math.hypot(dx, dy) || 1;
    this.vx = (dx / n) * speed;
    this.vy = loft;
    this.swings++;
    this.dist += Math.hypot(this.x - this.lastX, this.y - this.lastY);
    this.lastX = this.x; this.lastY = this.y;
    this.rolling = false;
  }

  /** 停球判定（杆击/计分 UI 用） */
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
    // 球体白 + 投射物变体微调色（简化：按 projId 取 mod 色相）
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

/** 球杆力度表（[击球速度, 杆面仰角]——杆型：driver 远低弹 / iron 中 / wedge 高短 / putter 贴地） */
export const GOLF_CLUBS: Record<number, [number, number]> = {
  4094: [14, -4],  // GolfClubDriver（木）
  4039: [11, -5],  // GolfClubIron（铁）
  4093: [8, -7],   // GolfClubWedge（挖起）
  4092: [5, -1],   // GolfClubPutter（推）
  // 进阶杆（材料加成 +1 速）：PearlwoodDriver/MythrilIron/GoldWedge/LeadPutter
  4594: [15, -4], 4591: [12, -5], 4593: [9, -7], 4592: [6, -1],
  // 高级杆（+2 速）：ChlorophyteDriver/TitaniumIron/DiamondWedge/ShroomitePutter
  4598: [16, -4], 4595: [13, -5], 4597: [10, -7], 4596: [7, -1],
};
