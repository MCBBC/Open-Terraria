// 治疗弹（原版 Projectile 298 GhostHeal / 305 VampireHeal，aiStyle 52）：
// 吸血/鬼疗命中敌怪后从命中点起飞，追踪目标玩家，抵达（距离<50 且盒相交）结算
// 回复 floor(ai[1]) 并消亡。Projectile.AI aiStyle 52 :27114-27165 1:1：
//   - 速度 4（num399 :27117），速度插值 (v×15+dir)/16（:27142-27145——298/305 同档）；
//     每子步位移 extraUpdates+1 次（298=3 :3614 / 305=10 :3696）
//   - 命中门（:27122-27128）：dist<50 且弹盒与目标矩形相交
//   - 结算（:27129-27141）：HealEffect((int)ai[1]) + statLife 上限钳制 + Kill
// 弹体参数（SetDefaults :3610-3617 / :3692-3698）：6×6、alpha 255、tileCollide=false
// （穿墙）、298 magic=true（已由调用点魔法门保证）。
// 单人语义：原版鬼疗跨队友选最缺血者（ghostHeal :11424-11434），本仓无队友体系，
// ai[0] 恒 = 本地玩家（与吸血 305 同——vampireHeal :11447 也固定 owner）。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';

export class HealProj extends Entity {
  w = 6; h = 6;
  /** 原版弹型（305 吸血 / 298 鬼疗）——决定 extraUpdates 与尾迹密度 */
  readonly projType: 298 | 305;
  /** ai[1] 回复量（float，结算时 (int) 取整 :27130） */
  readonly heal: number;
  /** 每子步次数（原版 extraUpdates+1） */
  private readonly extraUpdates: number;
  /** 目标玩家引用（原版 ai[0] 玩家下标；单人 = 本地玩家） */
  private readonly target: { x: number; y: number; w: number; h: number;
    hp: number; maxHp: number };
  private life = 3600;   // 兜底寿命（原版 NewProjectile 默认 timeLeft，防永不命中滞留）

  constructor(projType: 298 | 305, x: number, y: number, heal: number,
    target: { x: number; y: number; w: number; h: number; hp: number; maxHp: number }) {
    super();
    this.projType = projType;
    this.x = x; this.y = y;
    this.heal = heal;
    this.target = target;
    this.extraUpdates = projType === 305 ? 10 : 3;   // :3696 / :3614
  }

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    // 305 尘 183 红雾 / 298 尘 175 青白雾配色近似（弹体本体 alpha 255）
    ctx.fillStyle = this.projType === 305 ? '#D04060' : '#70F0D0';
    ctx.beginPath();
    ctx.arc(this.x + this.w / 2, this.y + this.h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    // 原版 extraUpdates：每 tick AI+位移共 extraUpdates+1 次
    for (let u = 0; u <= this.extraUpdates; u++) {
      const vcx = this.x + this.w / 2, vcy = this.y + this.h / 2;
      const dx = this.target.x + this.target.w / 2 - vcx;
      const dy = this.target.y + this.target.h / 2 - vcy;
      const dist = Math.hypot(dx, dy);
      // 命中门（:27122-27128）：dist<50 且盒相交 → 结算回复并消亡
      if (dist < 50 && this.x < this.target.x + this.target.w && this.x + this.w > this.target.x
        && this.y < this.target.y + this.target.h && this.y + this.h > this.target.y) {
        const n = Math.floor(this.heal);             // (int)ai[1] :27130
        this.target.hp = Math.min(this.target.maxHp, this.target.hp + n);
        if (n > 0) game.addDamageNumber(this.target.x + this.target.w / 2, this.target.y, n, false, '#40E080');
        this.dead = true;
        return;
      }
      // 速度 4 归一方向 + (v×15+dir)/16 插值趋近（:27138-27145）
      const nx = dx / dist * 4, ny = dy / dist * 4;
      this.vx = (this.vx * 15 + nx) / 16;
      this.vy = (this.vy * 15 + ny) / 16;
      this.x += this.vx;   // tileCollide=false——穿墙不检碰撞（:3615/:3696）
      this.y += this.vy;
    }
  }
}
