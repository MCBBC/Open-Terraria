// 鸟粪弹（proj 1080 Bird Droppings，Projectile.cs:9794-9800 规格 + AI_200 :37630-37680
// + Kill :67579-67610）。来源：AI_024 飞行鸟族悬玩家正上方掷（NPC.cs:25398-25407，
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
  private life = 600;               // timeLeft 兜底

  /** 出生点 = 玩家中心 X、鸟中心 Y（NewProjectile(player.Center.X, bird.Center.Y, 0,0)） */
  constructor(px: number, by: number) {
    super();
    this.x = px - this.w / 2;
    this.y = by - this.h / 2;
    this.vx = 0;
    this.vy = 0;
  }

  draw(_r: Renderer, _cam: Camera): void {
    // ★本体隐形:SetDefaults alpha=255(Projectile.cs:9799)+ GetAlpha 默认式
    // ((255−alpha)/255 → 全透明,:76836)+ 全文件零 alpha 衰减 + 无专属绘制分支
    // ——可视效果 = 尘 329 尾迹(2/tick)与 Kill 迸溅本身;Projectile_1080.png(8×8)
    // 为无引用死资源。曾画贴图 = 多一个可见实体偏差(review 2026-08-19 抓出)
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    this.vy += 0.3;                                    // AI_200（:37631-37635）
    if (this.vy > 16) this.vy = 16;
    this.x += this.vx;
    this.y += this.vy;
    // 尘 329 尾迹 ×2/tick（:37636-37653;色近白,半数无重力随速度）
    game.spawnParticles(this.cx, this.cy, '#E4DECC', 1, 0.6, { life: 26, damp: 0.9 });
    game.spawnParticles(this.cx, this.cy, '#D8D0B8', 1, 0.4, { life: 20, damp: 0.9 });
    // 命中玩家（:37654-37670,无伤害只上 buff）→ Kill
    const p = game.player;
    if (p && !p.dead && this.x < p.x + p.w && this.x + this.w > p.x
      && this.y < p.y + p.h && this.y + this.h > p.y) {
      this.killFx(game);
      return;
    }
    // 落地（velocity != lastVelocity 语义 = 撞块截停）→ Kill
    const st = game.world.store;
    const cx = Math.floor((this.x + this.w / 2) / TILE), cy = Math.floor((this.y + this.h / 2) / TILE);
    if (st.inBounds(cx, cy) && st.isSolid(cx, cy)) {
      this.killFx(game);
    }
  }

  /** Kill 段（:67579-67610）：Item_177 + 30 尘 + 玩家盒相交 → Stinky 10s */
  private killFx(game: GameHooks): void {
    this.dead = true;
    game.playSfxFile?.('Item_177', 1, this.cx, this.cy);
    game.spawnParticles(this.cx, this.cy, '#E4DECC', 15, 2.2, { life: 40, damp: 0.92 });
    game.spawnParticles(this.cx, this.cy, '#D8D0B8', 15, 1.6, { life: 34, damp: 0.92 });
    const p = game.player;
    if (p && !p.dead && this.x < p.x + p.w && this.x + this.w > p.x
      && this.y < p.y + p.h && this.y + this.h > p.y) {
      p.buffs.apply(BuffType.Stinky, 10);   // ApplyBuffTo(120, 600t)
    }
  }
}
