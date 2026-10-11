// 鸟粪弹（proj 1080 Bird Droppings，Projectile.cs:10080-10088 规格 + AI_200_BirdDroppings
// :40705-40741 + Kill 1080 支 :72058-72085）——★BJ644 行号校注 1456→1457 重锚（1457
// Projectile.cs 增注 AI 前移 ~2925 行/NPC.cs +61 行,数值面抽检零差,见下方逐式行号）。
// 来源：AI_024 飞行鸟族悬玩家正上方掷（NPC.cs:25459-25467，
// BirdThatCanPoop 表 + localAI[3] 一次性门 + RollOnlyBadLuckExtreme(50) 每 tick 1/50）。
// 规格：10×10 / aiStyle 200 / alpha 255 / penetrate -1 / ignoreWater。
// 行为：重力 0.3 落体帽 16;每 tick 2 颗尘 329 尾迹;命中玩家或落地 Kill →
//   Item_177 + 30 尘 + 与玩家盒相交 → ApplyBuffTo(120 Stinky, 600t=10s)。
// 备案：MP 语义（netMode!=1 门）不适用——spawnCritterProj 钩子仅本地。
import { Entity } from './Entity';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { BuffType } from '../stats/Buffs';
import { TILE } from '../core/constants';

export class PoopProj extends Entity {
  w = 10; h = 10;
  private readonly projId = 1080;
  private life = 3600;              // timeLeft（NewProjectile 缺省 3600,Projectile.cs:789——★BJ644 校注揭真差一并落:旧 600 兜底无原版据,深坑坠落提前消失）

  /** 出生点 = 玩家中心 X、鸟中心 Y（NewProjectile(player.Center.X, bird.Center.Y, 0,0)） */
  constructor(px: number, by: number) {
    super();
    this.x = px - this.w / 2;
    this.y = by - this.h / 2;
    this.vx = 0;
    this.vy = 0;
  }

  draw(_r: Renderer, _cam: Camera): void {
    // ★本体隐形:SetDefaults alpha=255(Projectile.cs:10085)+ GetAlpha 默认式
    // ((255−alpha)/255 → 全透明,Projectile.cs:81507-81510)+ 全文件零 alpha 衰减
    // + 无专属绘制分支
    // ——可视效果 = 尘 329 尾迹(2/tick)与 Kill 迸溅本身;Projectile_1080.png(8×8)
    // 为无引用死资源。曾画贴图 = 多一个可见实体偏差(review 2026-08-19 抓出)
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    this.vy += 0.3;                                    // AI_200（:40707-40711）
    if (this.vy > 16) this.vy = 16;
    this.x += this.vx;
    this.y += this.vy;
    // 尘 329 尾迹 ×2/tick（:40712-40728 1:1,走 VanillaDust 引擎——曾用色块粒子近似）
    const vd = (game as unknown as { vanillaDust?: import('../fx/VanillaDust').VanillaDust }).vanillaDust;
    if (vd) {
      for (let i = 0; i < 2; i++) {
        const d = vd.spawn(this.cx, this.cy, 1, 1, 329);
        if (!d) break;
        d.vx *= 0.1; d.vy *= 0.1;
        if (Math.random() < 0.5) {
          d.scale = Math.random() * 0.5 + 0.5;
          d.vx += this.vx; d.vy += this.vy;
          d.noGravity = true;
        } else {
          d.scale = Math.random() * 0.4 + 0.4;
          d.vx *= 0.5; d.vy *= 0.5;
          d.vx += this.vx / 2; d.vy += this.vy / 2;
        }
      }
    }
    // 命中玩家（:40729-40740,无伤害只上 buff）→ Kill
    const p = game.player;
    if (p && !p.dead && this.x < p.x + p.w && this.x + this.w > p.x
      && this.y < p.y + p.h && this.y + this.h > p.y) {
      this.killFx(game);
      return;
    }
    // 落地（velocity != lastVelocity 语义 = 撞块截停;Projectile.cs:19035-19041
    //  1080 专支 position+=velocity → Kill）→ Kill
    const st = game.world.store;
    const cx = Math.floor((this.x + this.w / 2) / TILE), cy = Math.floor((this.y + this.h / 2) / TILE);
    if (st.inBounds(cx, cy) && st.isSolid(cx, cy)) {
      this.killFx(game);
    }
  }

  /** Kill 段（:72058-72085）：Item_177 + 30 尘 + 玩家盒相交 → Stinky 10s（ApplyBuffTo 120,600t :72065） */
  private killFx(game: GameHooks): void {
    this.dead = true;
    game.playSfxFile?.('Item_177', 1, this.cx, this.cy);
    // 30×尘 329（:72069-72085 1:1）：vel×0.8 + vy×0.2 − rand×3;半数 noGravity
    const vd = (game as unknown as { vanillaDust?: import('../fx/VanillaDust').VanillaDust }).vanillaDust;
    if (vd) {
      for (let i = 0; i < 30; i++) {
        const d = vd.spawn(this.cx, this.cy, 1, 1, 329);
        if (!d) break;
        d.vx *= 0.8;
        d.vy = d.vy * 0.2 - Math.random() * 3;
        if (Math.random() < 0.5) {
          d.noGravity = true;
          d.scale = Math.random() * 0.6 + 0.6;
        } else {
          d.scale = Math.random() * 0.5 + 0.5;
        }
      }
    }
    const p = game.player;
    if (p && !p.dead && this.x < p.x + p.w && this.x + this.w > p.x
      && this.y < p.y + p.h && this.y + this.h > p.y) {
      p.buffs.apply(BuffType.Stinky, 10);   // ApplyBuffTo(120, 600t)
    }
  }
}
