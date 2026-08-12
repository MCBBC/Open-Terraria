// 城镇 NPC 自卫攻击的友方弹(NPC.cs AI_007 攻击态发射,Projectile.npcProj 语义):
// 物理 = 箭族近似(重力 0.3/tick,Projectile.cs aiStyle 1/2 同值),只伤敌怪不伤玩家
// (friendly 弹对玩家免疫;原版对城镇 NPC 免疫由 npcProj 标记,本仓为唯一玩家恒免疫)。
// 贴图 = Projectile_{id}.png 懒加载(Arrow.projSprite 共享缓存)。
import { Entity } from './Entity';
import { TILE } from '../core/constants';
import type { GameHooks } from './types';
import type { Renderer } from '../render/Renderer';
import type { Camera } from '../render/Camera';
import { projSprite } from './Arrow';
import { projOverlap, playEnemyHitSound } from './projTargets';
import { projectileData } from '../data/vanillaProjectiles';

const GRAV = 0.3; // 箭族重力(aiStyle 1/2 同值)

export class TownShot extends Entity {
  w = 10; h = 10;
  vx: number; vy: number;
  damage: number;
  knockback: number;
  projId: number;
  life = 600;
  dead = false;
  /** 弹附加 ai 参数(124/142/227 等特化弹;本仓多数弹不消费,仅存档语义) */
  ai1 = 0; ai2 = 0;
  /** 588 弹体 timeLeft=480(:54922-54925) */
  private lifeOverride?: number;

  constructor(x: number, y: number, vx: number, vy: number, damage: number, knockback: number, projId: number,
    opts?: { ai1?: number; ai2?: number; life?: number; noGravity?: boolean }) {
    super();
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.knockback = knockback;
    this.projId = projId;
    if (opts) {
      if (opts.ai1 !== undefined) this.ai1 = opts.ai1;
      if (opts.ai2 !== undefined) this.ai2 = opts.ai2;
      if (opts.life !== undefined) this.lifeOverride = opts.life;
      if (opts.noGravity) this.noGrav = true;
    }
    const def = projectileData(projId);
    if (def) { this.w = def.width || 10; this.h = def.height || 10; }
    if (this.lifeOverride !== undefined) this.life = this.lifeOverride;
  }

  private noGrav = false;

  draw(r: Renderer, _cam: Camera): void {
    const ctx = r.canvas.getContext('2d');
    if (!ctx) return;
    const img = projSprite(this.projId);
    ctx.save();
    ctx.translate(this.x + this.w / 2, this.y + this.h / 2);
    ctx.rotate(Math.atan2(this.vy, this.vx) + Math.PI / 2);
    ctx.imageSmoothingEnabled = false;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, -this.w / 2, -this.h / 2, this.w, this.h * (img.naturalHeight / img.naturalWidth));
    } else {
      ctx.fillStyle = '#D8C8A0';
      ctx.fillRect(-this.w / 2, -this.h / 2, this.w, this.h);
    }
    ctx.restore();
  }

  fixedUpdate(_dt: number, game: GameHooks): void {
    if (--this.life <= 0) { this.dead = true; return; }
    if (!this.noGrav) this.vy += GRAV;
    this.x += this.vx;
    this.y += this.vy;
    const tx = Math.floor((this.x + this.w / 2) / TILE);
    const ty = Math.floor((this.y + this.h / 2) / TILE);
    if (game.world.store.isSolid(tx, ty)) { this.dead = true; return; }
    for (const ent of game.enemies()) {
      const e = ent as unknown as { x: number; y: number; w: number; h: number; dead: boolean;
        hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean; def?: { hitSound?: string[] } };
      if (e.dead || !projOverlap(this.x, this.y, this.w, this.h, e)) continue;
      if (e.hurt(this.damage, Math.sign(this.vx) * this.knockback, 0, game)) {
        playEnemyHitSound(game, e);
        game.addDamageNumber(this.x, this.y, this.damage, false, '#FFD060');
      }
      this.dead = true; // 穿透 1(城镇自卫弹均为 penetrate 1 或 -1 特化弹,近似单发)
      return;
    }
  }
}
